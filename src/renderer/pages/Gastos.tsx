import { useEffect, useState } from 'react'
import { deduciblesPara } from '../../core/deducibles'
import { calcularGasto, CATEGORIAS_GASTO, TIPOS_IVA } from '../../core/fiscalidad'
import type { Gasto, GastoNuevo, OperacionGasto, Perfil } from '../../core/tipos'
import { api, llamar, mensajes } from '../api'
import {
  Adjuntos, AdjuntosPendientes, type ArchivoElegido, Campo, CampoEuros, CampoPct, Errores, euros, hoy, periodoActual, rango, SelectorPeriodo, type Periodo
} from '../componentes'

const OPERACIONES: Record<OperacionGasto, string> = {
  nacional: 'Proveedor español con IVA',
  intracomunitaria: 'Proveedor UE sin IVA (autoliquidas)',
  extracomunitaria: 'Proveedor fuera de la UE (autoliquidas)',
  sin_iva: 'Sin IVA (exento o no sujeto)'
}

function deCategoria(perfil: Perfil, id: string, base: Partial<GastoNuevo> = {}): GastoNuevo {
  const c = CATEGORIAS_GASTO.find((x) => x.id === id) ?? CATEGORIAS_GASTO[CATEGORIAS_GASTO.length - 1]!
  const ded = deduciblesPara(perfil, c.id)
  return {
    fecha: hoy(), proveedor: '', nifProveedor: '', paisProveedor: 'ES', numeroFactura: '', concepto: '',
    base: 0, bienInversion: false, notas: '', ...base,
    categoria: c.id, operacion: c.operacion, tipoIva: c.tipoIva, deduciblePctIrpf: ded.irpf,
    deduciblePctIva: ded.iva, retencionPct: c.retencionPct
  }
}

export function PaginaGastos({ perfil }: { perfil: Perfil }) {
  const [periodo, setPeriodo] = useState<Periodo>(periodoActual())
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [editando, setEditando] = useState<{ id: number | null; datos: GastoNuevo } | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [pendientes, setPendientes] = useState<ArchivoElegido[]>([])

  const cargar = () => {
    const { desde, hasta } = rango(periodo)
    return llamar(api.listarGastos(desde, hasta)).then(setGastos).catch((e) => setErrores(mensajes(e)))
  }
  useEffect(() => { void cargar() }, [periodo])

  const d = editando?.datos
  const set = (cambios: Partial<GastoNuevo>) =>
    editando && setEditando({ ...editando, datos: { ...editando.datos, ...cambios } })

  const guardar = async () => {
    if (!editando) return
    try {
      if (editando.id === null) {
        const g = await llamar(api.crearGasto(editando.datos))
        if (pendientes.length) await llamar(api.adjuntarElegidos('gasto', g.id, pendientes.map((p) => p.ficha)))
      } else {
        await llamar(api.actualizarGasto(editando.id, editando.datos))
      }
      setPendientes([])
      setEditando(null)
      setErrores([])
      await cargar()
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  const borrar = async (g: Gasto) => {
    if (!confirm(`¿Borrar el gasto "${g.concepto}"?`)) return
    try {
      await llamar(api.borrarGasto(g.id))
      await cargar()
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  const deducible = deduciblesPara(perfil, d?.categoria ?? 'otros')
  const cuotas = d ? calcularGasto(d) : null
  const nombreCategoria = (id: string) => CATEGORIAS_GASTO.find((c) => c.id === id)?.nombre ?? id
  const total = (k: 'base' | 'cuotaIva') => gastos.reduce((a, g) => a + g[k], 0)

  return (
    <section>
      <div className="cabecera">
        <h1>Gastos</h1>
        <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />
        <button onClick={() => { setEditando({ id: null, datos: deCategoria(perfil, 'otros') }); setPendientes([]); setErrores([]) }}>Nuevo gasto</button>
      </div>
      <Errores errores={errores} />

      {d ? (
        <div className="tarjeta" key={editando.id ?? 'nuevo'}>
          <div className="rejilla">
            <Campo etiqueta="Categoría">
              <select value={d.categoria} onChange={(e) => set(deCategoria(perfil, e.target.value, d))}>
                {CATEGORIAS_GASTO.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Fecha"><input type="date" value={d.fecha} onChange={(e) => set({ fecha: e.target.value })} /></Campo>
            <Campo etiqueta="Proveedor"><input value={d.proveedor} onChange={(e) => set({ proveedor: e.target.value })} /></Campo>
            <Campo etiqueta="NIF del proveedor"><input value={d.nifProveedor} onChange={(e) => set({ nifProveedor: e.target.value })} /></Campo>
            <Campo etiqueta="País del proveedor"><input value={d.paisProveedor} maxLength={2} onChange={(e) => set({ paisProveedor: e.target.value.toUpperCase() })} /></Campo>
            <Campo etiqueta="Nº de factura"><input value={d.numeroFactura} onChange={(e) => set({ numeroFactura: e.target.value })} /></Campo>
            <Campo etiqueta="Concepto"><input value={d.concepto} onChange={(e) => set({ concepto: e.target.value })} /></Campo>
            <Campo etiqueta="Base imponible (€)"><CampoEuros valor={d.base} onChange={(base) => set({ base })} /></Campo>
            <Campo etiqueta="Tipo de operación">
              <select value={d.operacion} onChange={(e) => set({ operacion: e.target.value as OperacionGasto })}>
                {Object.entries(OPERACIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="IVA %">
              <select value={d.tipoIva} disabled={d.operacion === 'sin_iva'} onChange={(e) => set({ tipoIva: Number(e.target.value) })}>
                {TIPOS_IVA.map((t) => <option key={t} value={t}>{t}%</option>)}
              </select>
            </Campo>
            <Campo etiqueta="% deducible en IRPF"><CampoPct valor={d.deduciblePctIrpf} onChange={(deduciblePctIrpf) => set({ deduciblePctIrpf })} /></Campo>
            <Campo etiqueta="% deducible del IVA"><CampoPct valor={d.deduciblePctIva} onChange={(deduciblePctIva) => set({ deduciblePctIva })} /></Campo>
            <Campo etiqueta="Retención que practicas %" ayuda="Alquileres 19% (modelo 115), profesionales 15% (modelo 111).">
              <CampoPct valor={d.retencionPct} onChange={(retencionPct) => set({ retencionPct })} />
            </Campo>
            <label className="check">
              <input type="checkbox" checked={d.bienInversion} onChange={(e) => set({ bienInversion: e.target.checked })} />
              Bien de inversión (se amortiza)
            </label>
            <Campo etiqueta="Notas"><input value={d.notas} onChange={(e) => set({ notas: e.target.value })} /></Campo>
          </div>
          <p className="nota deducible">
            {deducible.explicacion}
            {d.deduciblePctIrpf !== deducible.irpf || d.deduciblePctIva !== deducible.iva
              ? <> <button className="enlace" onClick={() => set({ deduciblePctIrpf: deducible.irpf, deduciblePctIva: deducible.iva })}>Volver al % calculado</button></>
              : null}
          </p>
          {cuotas ? (
            <p className="nota">
              Cuota de IVA {euros(cuotas.cuotaIva)}
              {d.operacion === 'intracomunitaria' || d.operacion === 'extracomunitaria' ? ' (autoliquidada: no la pagas al proveedor)' : ''}
              {cuotas.cuotaRetencion ? ` · Retención a ingresar ${euros(cuotas.cuotaRetencion)}` : ''}
            </p>
          ) : null}
          {editando.id !== null
            ? <Adjuntos entidad="gasto" id={editando.id} />
            : <AdjuntosPendientes archivos={pendientes} onChange={setPendientes} />}
          <div className="acciones">
            <button onClick={guardar}>Guardar</button>
            <button className="secundario" onClick={() => { setEditando(null); setPendientes([]) }}>Cancelar</button>
          </div>
        </div>
      ) : null}

      <table>
        <thead><tr><th>Fecha</th><th>Proveedor</th><th>Concepto</th><th>Categoría</th><th className="num">Base</th><th className="num">IVA</th><th /></tr></thead>
        <tbody>
          {gastos.map((g) => (
            <tr key={g.id}>
              <td>{g.fecha}</td>
              <td>{g.proveedor}</td>
              <td>{g.concepto}</td>
              <td>{nombreCategoria(g.categoria)}{g.bienInversion ? ' · inversión' : ''}</td>
              <td className="num">{euros(g.base)}</td>
              <td className="num">{euros(g.cuotaIva)}</td>
              <td className="derecha">
                <button className="secundario" onClick={() => { const { id, cuotaIva: _a, cuotaRetencion: _b, ...datos } = g; setEditando({ id, datos }) }}>Editar</button>
                <button className="peligro" onClick={() => borrar(g)}>Borrar</button>
              </td>
            </tr>
          ))}
          {!gastos.length ? <tr><td colSpan={7} className="vacio">No hay gastos en este periodo.</td></tr> : null}
        </tbody>
        <tfoot><tr><td colSpan={4}>Total</td><td className="num">{euros(total('base'))}</td><td className="num">{euros(total('cuotaIva'))}</td><td /></tr></tfoot>
      </table>
    </section>
  )
}
