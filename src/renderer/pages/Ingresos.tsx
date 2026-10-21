import { useEffect, useState } from 'react'
import { calcularIngreso, sugerirFiscalidadIngreso, TIPOS_IVA } from '../../core/fiscalidad'
import type { Cliente, Ingreso, IngresoNuevo, OperacionIngreso, Perfil } from '../../core/tipos'
import { api, llamar, mensajes } from '../api'
import {
  Adjuntos, Avisos, Campo, CampoEuros, CampoPct, Errores, euros, hoy, periodoActual, rango, SelectorPeriodo, type Periodo
} from '../componentes'

const OPERACIONES: Record<OperacionIngreso, string> = {
  nacional: 'Con IVA español',
  intracomunitaria: 'Empresa UE (inversión del sujeto pasivo)',
  no_sujeta: 'Fuera de la UE (no sujeta)'
}

function nuevo(): IngresoNuevo {
  return { fecha: hoy(), clienteId: null, concepto: '', base: 0, tipoIva: 21, retencionPct: 0, operacion: 'nacional', notas: '' }
}

export function PaginaIngresos({ perfil }: { perfil: Perfil }) {
  const [periodo, setPeriodo] = useState<Periodo>(periodoActual())
  const [ingresos, setIngresos] = useState<Ingreso[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [editando, setEditando] = useState<{ id: number | null; datos: IngresoNuevo; desdeFactura: boolean } | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [errores, setErrores] = useState<string[]>([])

  const cargar = () => {
    const { desde, hasta } = rango(periodo)
    return llamar(api.listarIngresos(desde, hasta)).then(setIngresos).catch((e) => setErrores(mensajes(e)))
  }
  useEffect(() => { void cargar() }, [periodo])
  useEffect(() => { llamar(api.listarClientes()).then(setClientes).catch((e) => setErrores(mensajes(e))) }, [])

  const d = editando?.datos
  const set = (cambios: Partial<IngresoNuevo>) =>
    editando && setEditando({ ...editando, datos: { ...editando.datos, ...cambios } })

  const elegirCliente = (clienteId: number | null) => {
    const cliente = clientes.find((c) => c.id === clienteId) ?? null
    const s = sugerirFiscalidadIngreso(perfil, cliente, d?.fecha ?? hoy())
    set({ clienteId, operacion: s.operacion, tipoIva: s.tipoIva, retencionPct: s.retencionPct })
    setAvisos(s.avisos)
  }

  const guardar = async () => {
    if (!editando) return
    try {
      if (editando.id === null) await llamar(api.crearIngreso(editando.datos))
      else await llamar(api.actualizarIngreso(editando.id, editando.datos))
      setEditando(null)
      setErrores([])
      setAvisos([])
      await cargar()
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  const borrar = async (i: Ingreso) => {
    if (!confirm(`¿Borrar el ingreso "${i.concepto}"?`)) return
    try {
      await llamar(api.borrarIngreso(i.id))
      await cargar()
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  const cuotas = d ? calcularIngreso(d) : null
  const nombreCliente = (id: number | null) => clientes.find((c) => c.id === id)?.nombre ?? '—'
  const total = (k: 'base' | 'cuotaIva' | 'cuotaRetencion') => ingresos.reduce((a, i) => a + i[k], 0)

  return (
    <section>
      <div className="cabecera">
        <h1>Ingresos</h1>
        <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />
        <button onClick={() => { setEditando({ id: null, datos: nuevo(), desdeFactura: false }); setAvisos([]); setErrores([]) }}>Nuevo ingreso</button>
      </div>
      <Errores errores={errores} />

      {d ? (
        <div className="tarjeta" key={editando.id ?? "nuevo"}>
          <div className="rejilla">
            <Campo etiqueta="Fecha"><input type="date" value={d.fecha} onChange={(e) => set({ fecha: e.target.value })} /></Campo>
            <Campo etiqueta="Cliente">
              <select value={d.clienteId ?? ''} onChange={(e) => elegirCliente(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Sin cliente</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Concepto"><input value={d.concepto} onChange={(e) => set({ concepto: e.target.value })} /></Campo>
            <Campo etiqueta="Base imponible (€)"><CampoEuros valor={d.base} onChange={(base) => set({ base })} /></Campo>
            <Campo etiqueta="Tipo de operación">
              <select value={d.operacion} onChange={(e) => {
                const operacion = e.target.value as OperacionIngreso
                set({ operacion, tipoIva: operacion === 'nacional' ? 21 : 0 })
              }}>
                {Object.entries(OPERACIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="IVA %">
              <select value={d.tipoIva} disabled={d.operacion !== 'nacional'} onChange={(e) => set({ tipoIva: Number(e.target.value) })}>
                {TIPOS_IVA.map((t) => <option key={t} value={t}>{t}%</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Retención IRPF %"><CampoPct valor={d.retencionPct} onChange={(retencionPct) => set({ retencionPct })} /></Campo>
            <Campo etiqueta="Notas"><input value={d.notas} onChange={(e) => set({ notas: e.target.value })} /></Campo>
          </div>
          <Avisos avisos={avisos} />
          {cuotas ? (
            <p className="nota">
              IVA {euros(cuotas.cuotaIva)} · Retención −{euros(cuotas.cuotaRetencion)} · Total a cobrar {euros(d.base + cuotas.cuotaIva - cuotas.cuotaRetencion)}
            </p>
          ) : null}
          {editando.id !== null ? <Adjuntos entidad="ingreso" id={editando.id} /> : <p className="nota">Guarda el ingreso para poder adjuntar justificantes.</p>}
          <div className="acciones">
            <button onClick={guardar} disabled={editando.desdeFactura}>Guardar</button>
            <button className="secundario" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </div>
      ) : null}

      <table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Concepto</th><th>Operación</th><th className="num">Base</th><th className="num">IVA</th><th className="num">Retención</th><th /></tr></thead>
        <tbody>
          {ingresos.map((i) => (
            <tr key={i.id}>
              <td>{i.fecha}</td>
              <td>{nombreCliente(i.clienteId)}</td>
              <td>{i.concepto}</td>
              <td>{OPERACIONES[i.operacion]}</td>
              <td className="num">{euros(i.base)}</td>
              <td className="num">{euros(i.cuotaIva)}</td>
              <td className="num">{euros(i.cuotaRetencion)}</td>
              <td className="derecha">
                <button className="secundario" onClick={() => {
                  const { id, cuotaIva: _a, cuotaRetencion: _b, facturaId, ...datos } = i
                  setEditando({ id, datos, desdeFactura: facturaId !== null }); setAvisos([])
                }}>{i.facturaId ? 'Ver' : 'Editar'}</button>
                {i.facturaId ? null : <button className="peligro" onClick={() => borrar(i)}>Borrar</button>}
              </td>
            </tr>
          ))}
          {!ingresos.length ? <tr><td colSpan={8} className="vacio">No hay ingresos en este periodo.</td></tr> : null}
        </tbody>
        <tfoot><tr><td colSpan={4}>Total</td><td className="num">{euros(total('base'))}</td><td className="num">{euros(total('cuotaIva'))}</td><td className="num">{euros(total('cuotaRetencion'))}</td><td /></tr></tfoot>
      </table>
    </section>
  )
}
