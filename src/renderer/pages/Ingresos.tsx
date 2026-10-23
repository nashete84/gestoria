import { useEffect, useState } from 'react'
import { DIAS_VENCIMIENTO, estadoCobro, importeACobrar, sumarDias } from '../../core/cobros'
import { calcularIngreso, sugerirFiscalidadIngreso, TIPOS_IVA } from '../../core/fiscalidad'
import type { Factura } from '../../core/db/facturas'
import type { Cliente, EstadoCobro, Ingreso, IngresoNuevo, OperacionIngreso, Perfil } from '../../core/tipos'
import { api, llamar, mensajes } from '../api'
import { FacturaPanel } from './FacturaPanel'
import {
  Adjuntos, Avisos, Campo, CampoEuros, CampoPct, Errores, euros, hoy, periodoActual, rango, SelectorPeriodo, type Periodo
} from '../componentes'
import { BotonIcono, Icono } from '../iconos'

const OPERACIONES: Record<OperacionIngreso, string> = {
  nacional: 'Con IVA español',
  intracomunitaria: 'Empresa UE (inversión del sujeto pasivo)',
  no_sujeta: 'Fuera de la UE (no sujeta)'
}

/** Versión corta para la tabla. */
const OPERACIONES_CORTAS: Record<OperacionIngreso, string> = { nacional: 'Nacional', intracomunitaria: 'UE', no_sujeta: 'Fuera de la UE' }

const ESTADOS_COBRO: Record<EstadoCobro, string> = { cobrado: 'Cobrado', pendiente: 'Pendiente', vencido: 'Vencido' }

function nuevo(): IngresoNuevo {
  return {
    fecha: hoy(), clienteId: null, actividadId: null, concepto: '', base: 0, tipoIva: 21, retencionPct: 0, operacion: 'nacional', notas: '',
    fechaVencimiento: sumarDias(hoy(), DIAS_VENCIMIENTO), fechaCobro: null
  }
}

/** Fecha en formato español corto. */
const fechaEs = (f: string) => f.split('-').reverse().join('/')

export function EtiquetaCobro({ ingreso }: { ingreso: Pick<Ingreso, 'fechaCobro' | 'fechaVencimiento'> }) {
  const estado = estadoCobro(ingreso, hoy())
  const ayuda = ingreso.fechaCobro ? `Cobrado el ${fechaEs(ingreso.fechaCobro)}`
    : ingreso.fechaVencimiento ? `Vence el ${fechaEs(ingreso.fechaVencimiento)}` : 'Sin fecha de vencimiento'
  return <span className={`cobro ${estado}`} title={ayuda}>{ESTADOS_COBRO[estado]}</span>
}

export function PaginaIngresos({ perfil, onCambioCobros }: { perfil: Perfil; onCambioCobros?: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>(periodoActual())
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [ingresos, setIngresos] = useState<Ingreso[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [editando, setEditando] = useState<{ id: number | null; datos: IngresoNuevo; facturaId: number | null; copiaDe?: string; clave?: number } | null>(null)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [avisos, setAvisos] = useState<string[]>([])
  const [errores, setErrores] = useState<string[]>([])

  const cargar = () => {
    const { desde, hasta } = rango(periodo)
    onCambioCobros?.()
    return Promise.all([
      llamar(soloPendientes ? api.pendientesDeCobro() : api.listarIngresos(desde, hasta)).then(setIngresos),
      llamar(api.listarFacturas(desde, hasta)).then(setFacturas)
    ]).catch((e) => setErrores(mensajes(e)))
  }

  const [previa, setPrevia] = useState<string | null>(null)

  /** Guarda los cambios del formulario sin cerrarlo; devuelve el id del ingreso. */
  const guardarSinCerrar = async (): Promise<number> => {
    if (!editando) throw new Error('Sin ingreso')
    const i = editando.id === null
      ? await llamar(api.crearIngreso(editando.datos))
      : await llamar(api.actualizarIngreso(editando.id, editando.datos))
    setEditando({ ...editando, id: i.id })
    await cargar()
    return i.id
  }

  const verPrevia = async () => {
    try {
      const idIngreso = await guardarSinCerrar()
      setPrevia(await llamar(api.vistaPreviaFactura(idIngreso)))
      setErrores([])
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  const emitir = async () => {
    if (!editando?.id) return
    if (!confirm('¿Emitir la factura de este ingreso?\n\nSe le asignará número y se generará su registro VERI*FACTU. Después no podrás modificar el ingreso; solo anular la factura.')) return
    try {
      const f = await llamar(api.emitirFactura(editando.id))
      setEditando({ ...editando, facturaId: f.id })
      setErrores([])
      await cargar()
    } catch (e) {
      setErrores(mensajes(e))
    }
  }
  useEffect(() => { void cargar() }, [periodo, soloPendientes])

  /** Marca un ingreso como cobrado hoy, o lo vuelve a dejar pendiente. */
  const cambiarCobro = async (i: Ingreso, fechaCobro: string | null) => {
    try {
      await llamar(api.actualizarCobro(i.id, { fechaVencimiento: i.fechaVencimiento, fechaCobro }))
      setErrores([])
      await cargar()
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  /** En los ingresos con factura solo se puede cambiar el cobro. */
  const guardarCobro = async () => {
    if (!editando?.id || !d) return
    try {
      await llamar(api.actualizarCobro(editando.id, { fechaVencimiento: d.fechaVencimiento ?? null, fechaCobro: d.fechaCobro ?? null }))
      setEditando(null)
      setErrores([])
      await cargar()
    } catch (e) {
      setErrores(mensajes(e))
    }
  }
  useEffect(() => { llamar(api.listarClientes()).then(setClientes).catch((e) => setErrores(mensajes(e))) }, [])

  const d = editando?.datos
  const set = (cambios: Partial<IngresoNuevo>) =>
    editando && setEditando({ ...editando, datos: { ...editando.datos, ...cambios } })

  const sugerir = (clienteId: number | null, actividadId: string | null) => {
    const cliente = clientes.find((c) => c.id === clienteId) ?? null
    const s = sugerirFiscalidadIngreso(perfil, cliente, d?.fecha ?? hoy(), actividadId)
    set({ clienteId, actividadId, operacion: s.operacion, tipoIva: s.tipoIva, retencionPct: s.retencionPct })
    setAvisos(s.avisos)
  }
  const elegirCliente = (clienteId: number | null) => sugerir(clienteId, d?.actividadId ?? null)

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
        {soloPendientes ? null : <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
        <select value={soloPendientes ? 'pendientes' : 'todos'} onChange={(e) => setSoloPendientes(e.target.value === 'pendientes')} aria-label="Qué ingresos ver" style={{ width: 'auto' }}>
          <option value="todos">Todos</option>
          <option value="pendientes">Por cobrar (todos los años)</option>
        </select>
        <button onClick={() => { setEditando({ id: null, datos: nuevo(), facturaId: null }); setAvisos([]); setErrores([]) }}><Icono nombre="mas" />Nuevo ingreso</button>
      </div>
      <Errores errores={errores} />

      {d ? (
        <div className="tarjeta" key={editando.id ?? `nuevo-${editando.clave ?? 0}`}>
          {editando.copiaDe ? <p className="nota">Copia de "{editando.copiaDe}". Cambia la fecha (y lo que haga falta) y guarda.</p> : null}
          <div className="rejilla">
            <Campo etiqueta="Fecha"><input type="date" value={d.fecha} autoFocus={!!editando.copiaDe} disabled={editando.facturaId !== null} onChange={(e) => {
              const fecha = e.target.value
              // Si el vencimiento era el de por defecto, se mueve con la fecha.
              const moverVencimiento = !d.fechaVencimiento || d.fechaVencimiento === sumarDias(d.fecha, DIAS_VENCIMIENTO)
              set(moverVencimiento && fecha ? { fecha, fechaVencimiento: sumarDias(fecha, DIAS_VENCIMIENTO) } : { fecha })
            }} /></Campo>
            {perfil.actividades.length > 1 ? (
              <Campo etiqueta="Actividad">
                <select value={d.actividadId ?? ''} onChange={(e) => sugerir(d.clienteId, e.target.value || null)}>
                  <option value="">Principal ({perfil.actividades.find((a) => a.principal)?.codigo})</option>
                  {perfil.actividades.filter((a) => !a.principal).map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.descripcion}</option>)}
                </select>
              </Campo>
            ) : null}
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
                set(operacion === 'nacional' ? { operacion, tipoIva: 21 } : { operacion, tipoIva: 0, retencionPct: 0 })
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
            <Campo etiqueta="Vencimiento del cobro">
              <input type="date" value={d.fechaVencimiento ?? ''} min={d.fecha} onChange={(e) => set({ fechaVencimiento: e.target.value || null })} />
            </Campo>
            <Campo etiqueta="Cobro">
              <select value={d.fechaCobro ? 'si' : 'no'} onChange={(e) => set({ fechaCobro: e.target.value === 'si' ? hoy() : null })}>
                <option value="no">Pendiente de cobro</option>
                <option value="si">Cobrado</option>
              </select>
            </Campo>
            {d.fechaCobro ? (
              <Campo etiqueta="Cobrado el"><input type="date" value={d.fechaCobro} onChange={(e) => set({ fechaCobro: e.target.value || null })} /></Campo>
            ) : null}
          </div>
          <Avisos avisos={avisos} />
          {cuotas ? (
            <p className="nota">
              IVA {euros(cuotas.cuotaIva)} · Retención −{euros(cuotas.cuotaRetencion)} · Total a cobrar {euros(d.base + cuotas.cuotaIva - cuotas.cuotaRetencion)}
            </p>
          ) : null}
          {editando.id !== null ? <Adjuntos entidad="ingreso" id={editando.id} /> : <p className="nota">Guarda el ingreso para poder adjuntar justificantes y emitir la factura.</p>}
          {editando.facturaId !== null ? (
            <FacturaPanel facturaId={editando.facturaId} onAnulada={() => { setEditando(null); void cargar() }} />
          ) : null}
          <div className="acciones">
            {editando.facturaId === null ? <button onClick={guardar}><Icono nombre="guardar" />Guardar</button> : <button onClick={guardarCobro}><Icono nombre="guardar" />Guardar cobro</button>}
            {editando.facturaId === null && d.clienteId !== null ? <button className="secundario" onClick={verPrevia}><Icono nombre="ver" />Vista previa de factura</button> : null}
            {editando.id !== null && editando.facturaId === null ? <button className="secundario" onClick={emitir}><Icono nombre="factura" />Emitir factura</button> : null}
            <button className="secundario" onClick={() => setEditando(null)}>{editando.facturaId === null ? 'Cancelar' : 'Cerrar'}</button>
          </div>
        </div>
      ) : null}

      {previa && editando?.id ? (
        <div className="modal" onClick={() => setPrevia(null)}>
          <div className="modal-caja" onClick={(e) => e.stopPropagation()}>
            <div className="cabecera">
              <h1>Vista previa</h1>
              <button onClick={() => llamar(api.guardarPdfBorrador(editando.id!)).catch((e) => setErrores(mensajes(e)))}><Icono nombre="descargar" />Descargar PDF</button>
              <button onClick={() => { setPrevia(null); void emitir() }}>Emitir factura</button>
              <button className="secundario" onClick={() => setPrevia(null)}>Cerrar</button>
            </div>
            <iframe title="Vista previa de la factura" sandbox="" srcDoc={previa} />
          </div>
        </div>
      ) : null}

      <table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Concepto</th><th>Operación</th><th>Factura</th><th className="num">Base</th><th className="num">IVA</th><th className="num">Retención</th><th>Cobro</th><th /></tr></thead>
        <tbody>
          {ingresos.map((i) => (
            <tr key={i.id}>
              <td>{i.fecha}</td>
              <td>{nombreCliente(i.clienteId)}</td>
              <td>{i.concepto}</td>
              <td title={OPERACIONES[i.operacion]}>{OPERACIONES_CORTAS[i.operacion]}</td>
              <td>{facturas.find((f) => f.id === i.facturaId)?.numSerie ?? '—'}</td>
              <td className="num">{euros(i.base)}</td>
              <td className="num">{euros(i.cuotaIva)}</td>
              <td className="num">{euros(i.cuotaRetencion)}</td>
              <td><EtiquetaCobro ingreso={i} /></td>
              <td className="derecha">
                {i.fechaCobro
                  ? <BotonIcono icono="deshacer" texto="Marcar como pendiente de cobro" onClick={() => cambiarCobro(i, null)} />
                  : <BotonIcono icono="cobrado" texto={`Marcar como cobrado hoy (${euros(importeACobrar(i))})`} onClick={() => cambiarCobro(i, hoy())} />}
                <BotonIcono icono={i.facturaId ? 'ver' : 'editar'} texto={i.facturaId ? 'Ver' : 'Editar'} onClick={() => {
                  const { id, cuotaIva: _a, cuotaRetencion: _b, facturaId, ...datos } = i
                  setEditando({ id, datos, facturaId }); setAvisos([])
                }} />
                <BotonIcono icono="duplicar" texto="Duplicar con otra fecha" onClick={() => {
                  const { id: _id, cuotaIva: _a, cuotaRetencion: _b, facturaId: _f, ...datos } = i
                  setEditando({
                    id: null, datos: { ...datos, fecha: hoy(), fechaVencimiento: sumarDias(hoy(), DIAS_VENCIMIENTO), fechaCobro: null },
                    facturaId: null, copiaDe: i.concepto || 'ingreso', clave: Date.now()
                  })
                  setAvisos([]); setErrores([])
                }} />
                {i.facturaId ? null : <BotonIcono icono="borrar" texto="Borrar" peligro onClick={() => borrar(i)} />}
              </td>
            </tr>
          ))}
          {!ingresos.length ? <tr><td colSpan={10} className="vacio">{soloPendientes ? 'No tienes nada pendiente de cobro.' : 'No hay ingresos en este periodo.'}</td></tr> : null}
        </tbody>
        <tfoot><tr><td colSpan={5}>Total</td><td className="num">{euros(total('base'))}</td><td className="num">{euros(total('cuotaIva'))}</td><td className="num">{euros(total('cuotaRetencion'))}</td><td colSpan={2} /></tr></tfoot>
      </table>

      {facturas.some((f) => f.estado === 'anulada') ? (
        <>
          <h2>Facturas anuladas</h2>
          <table>
            <thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th className="num">Base</th><th /></tr></thead>
            <tbody>
              {facturas.filter((f) => f.estado === 'anulada').map((f) => (
                <tr key={f.id}>
                  <td>{f.numSerie}</td><td>{f.fechaExpedicion}</td><td>{f.cliente.nombre}</td><td className="num">{euros(f.base)}</td>
                  <td className="derecha"><BotonIcono icono="descargar" texto="Descargar PDF" onClick={() => llamar(api.guardarPdfFactura(f.id)).catch((e) => setErrores(mensajes(e)))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  )
}
