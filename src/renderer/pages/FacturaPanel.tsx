import { useEffect, useState } from 'react'
import type { DetalleFactura } from '../../core/db/facturas'
import { api, llamar, mensajes } from '../api'
import { Errores, euros } from '../componentes'

const ESTADO_ENVIO = {
  pendiente: 'No enviado',
  correcto: 'Aceptado por la AEAT',
  aceptado_con_errores: 'Aceptado con errores',
  incorrecto: 'Rechazado'
}

/** Panel de la factura de un ingreso: PDF, XML de VERI*FACTU, envío (desactivado) y anulación. */
export function FacturaPanel({ facturaId, onAnulada }: { facturaId: number; onAnulada: () => void }) {
  const [d, setD] = useState<DetalleFactura | null>(null)
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
          <button disabled={ocupado} onClick={() => accion(() => llamar(api.guardarPdfFactura(f.id)))}>Descargar PDF</button>
          <button className="secundario" disabled={ocupado} onClick={() => accion(async () => setXml(xml ? null : await llamar(api.xmlVerifactu(f.id))))}>
            {xml ? 'Ocultar XML' : 'Ver XML VERI*FACTU'}
          </button>
          <button className="secundario" disabled={!d.envioHabilitado || ocupado}
            title={d.envioHabilitado ? '' : 'Desactivado mientras pruebas la aplicación'}
            onClick={() => accion(() => llamar(api.enviarVerifactu(f.id)))}>
            Enviar a VERI*FACTU
          </button>
          {f.estado === 'emitida' ? <button className="peligro" disabled={ocupado} onClick={anular}>Anular factura</button> : null}
        </div>
      </div>
      <Errores errores={errores} />
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
