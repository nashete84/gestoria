import { useEffect, useState } from 'react'
import type { DatosRectificacion, DetalleFactura } from '../../core/db/facturas'
import { porcentaje } from '../../core/money'
import { api, llamar, mensajes } from '../api'
import { CampoEuros, Errores, euros } from '../componentes'
import { Icono } from '../iconos'

const ESTADO_ENVIO = {
  pendiente: 'No enviado',
  correcto: 'Aceptado por la AEAT',
  aceptado_con_errores: 'Aceptado con errores',
  incorrecto: 'Rechazado'
}

/** Panel de la factura de un ingreso: PDF, XML de VERI*FACTU, envío (desactivado) y anulación. */
export function FacturaPanel({ facturaId, onAnulada, onRectificada }: { facturaId: number; onAnulada: () => void; onRectificada?: (numSerie: string) => void }) {
  const [d, setD] = useState<DetalleFactura | null>(null)
  const [rectificando, setRectificando] = useState(false)
  const [xml, setXml] = useState<string | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [ocupado, setOcupado] = useState(false)

  const cargar = () => llamar(api.detalleFactura(facturaId)).then(setD).catch((e) => setErrores(mensajes(e)))
  useEffect(() => { void cargar() }, [facturaId])

  const accion = async (fn: () => Promise<unknown>) => {
    setOcupado(true)
    try {
      await fn()
      setErrores([])
    } catch (e) {
      setErrores(mensajes(e))
    } finally {
      setOcupado(false)
    }
  }

  if (!d) return <Errores errores={errores} />
  const f = d.factura
  const puedeRectificar = f.estado === 'emitida' && f.tipo === 'F1'

  const anular = () => accion(async () => {
    const ok = confirm(
      `¿Anular la factura ${f.numSerie}?\n\n` +
      'Se generará un registro de anulación VERI*FACTU y se borrará el ingreso. La factura quedará guardada como anulada.\n\n' +
      'Usa la anulación solo si la factura se emitió por error. Si la operación existió y hay que corregirla, lo correcto es una factura rectificativa.'
    )
    if (!ok) return
    await llamar(api.anularFactura(f.id))
    onAnulada()
  })

  return (
    <div className="factura-panel">
      <div className="factura-cabecera">
        <div>
          <strong>Factura {f.numSerie}</strong> · {f.fechaExpedicion.split('-').reverse().join('/')}
          {f.entorno === 'prueba' ? <span className="etiqueta">prueba</span> : null}
          {f.estado === 'anulada' ? <span className="etiqueta peligro">anulada</span> : null}
          <div className="nota">Total a pagar {euros(f.base + f.cuotaIva - f.cuotaRetencion)}</div>
        </div>
        <div className="acciones">
          <button disabled={ocupado} onClick={() => accion(() => llamar(api.guardarPdfFactura(f.id)))}><Icono nombre="descargar" />Descargar PDF</button>
          <button className="secundario" disabled={ocupado} onClick={() => accion(async () => setXml(xml ? null : await llamar(api.xmlVerifactu(f.id))))}>
            {xml ? 'Ocultar XML' : 'Ver XML VERI*FACTU'}
          </button>
          <button className="secundario" disabled={!d.envioHabilitado || ocupado}
            title={d.envioHabilitado ? '' : 'Desactivado mientras pruebas la aplicación'}
            onClick={() => accion(() => llamar(api.enviarVerifactu(f.id)))}>
            Enviar a VERI*FACTU
          </button>
          {puedeRectificar ? <button className="secundario" disabled={ocupado} onClick={() => setRectificando(!rectificando)}><Icono nombre="editar" />Rectificar</button> : null}
          {f.estado === 'emitida' ? <button className="peligro" disabled={ocupado} onClick={anular}>Anular factura</button> : null}
        </div>
      </div>
      <Errores errores={errores} />
      {f.rectificada ? <p className="nota">Rectificativa ({f.tipo}) de la factura {f.rectificada.numSerie}. Motivo: {f.motivo}</p> : null}
      {d.rectificativas?.length ? (
        <p className="nota">
          Rectificada por {d.rectificativas.map((r) => `${r.numSerie} (${euros(r.base)})`).join(', ')}. Base vigente: {euros(d.baseVigente ?? f.base)}.
        </p>
      ) : null}
      {rectificando && puedeRectificar ? (
        <FormRectificar baseVigente={d.baseVigente ?? f.base} tipoIva={f.tipoIva} retencionPct={f.retencionPct} ocupado={ocupado}
          onCancelar={() => setRectificando(false)}
          onEmitir={(datos) => accion(async () => {
            const r = await llamar(api.rectificarFactura(f.id, datos))
            setRectificando(false)
            await cargar()
            onRectificada?.(r.numSerie)
          })} />
      ) : null}
      {!d.envioHabilitado ? <p className="nota">El envío a la AEAT está desactivado: los registros se generan y se guardan, pero no salen de tu ordenador.</p> : null}
      <table className="registros">
        <thead><tr><th>Registro</th><th>Generado</th><th>Huella</th><th>Envío</th></tr></thead>
        <tbody>
          {d.registros.map((r) => (
            <tr key={r.id}>
              <td>{r.tipo === 'alta' ? 'Alta' : 'Anulación'}</td>
              <td>{r.fechaHoraHuso.replace('T', ' ').slice(0, 19)}</td>
              <td><code title={r.huella}>{r.huella.slice(0, 16)}…</code></td>
              <td>{ESTADO_ENVIO[r.estadoEnvio]}{r.csv ? ` · CSV ${r.csv}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {xml ? <pre className="xml">{xml}</pre> : null}
    </div>
  )
}

/** Datos de la rectificativa: tipo, base nueva (o anular entera) y motivo, con la diferencia que se facturará. */
function FormRectificar({ baseVigente, tipoIva, retencionPct, ocupado, onEmitir, onCancelar }: {
  baseVigente: number; tipoIva: number; retencionPct: number; ocupado: boolean
  onEmitir: (d: DatosRectificacion) => void; onCancelar: () => void
}) {
  const [tipo, setTipo] = useState<DatosRectificacion['tipo']>('R1')
  const [entera, setEntera] = useState(false)
  const [nuevaBase, setNuevaBase] = useState(baseVigente)
  const [motivo, setMotivo] = useState('')
  const base = entera ? 0 : nuevaBase
  const dif = base - baseVigente
  const total = dif + porcentaje(dif, tipoIva) - porcentaje(dif, retencionPct)
  const emitir = () => {
    if (!confirm(`¿Emitir la factura rectificativa por ${euros(dif)} de base?\n\nTendrá número propio en la serie R y su registro VERI*FACTU (que no se envía a la AEAT mientras el envío esté desactivado). No se puede deshacer; solo anular.`)) return
    onEmitir({ tipo, nuevaBase: base, motivo })
  }
  return (
    <div className="tarjeta">
      <h2>Factura rectificativa</h2>
      <div className="rejilla">
        <label className="campo"><span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as DatosRectificacion['tipo'])}>
            <option value="R1">R1: error, descuento, devolución o impago</option>
            <option value="R4">R4: otras causas</option>
          </select>
        </label>
        <label className="campo"><span>Qué cambia</span>
          <select value={entera ? 'entera' : 'base'} onChange={(e) => setEntera(e.target.value === 'entera')}>
            <option value="base">Corregir la base</option>
            <option value="entera">Anularla entera (base 0)</option>
          </select>
        </label>
        {!entera ? <label className="campo"><span>Base correcta (€)</span><CampoEuros valor={nuevaBase} onChange={setNuevaBase} /></label> : null}
        <label className="campo"><span>Motivo (sale en la factura)</span><input value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Descuento por volumen acordado" /></label>
      </div>
      <p className="nota">
        Base actual {euros(baseVigente)} → {euros(base)}. Se emitirá una rectificativa por diferencias de {euros(dif)} de base
        ({euros(total)} con IVA y retención). Corrige el IVA y el IRPF del trimestre en que la emites.
      </p>
      <div className="acciones">
        <button disabled={ocupado || dif === 0 || !motivo.trim()} onClick={emitir}><Icono nombre="factura" />Emitir rectificativa</button>
        <button className="secundario" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}
