import { useState } from 'react'
import type { ResultadoImportacion, VistaImportacion } from '../../core/db/importacion'
import { api, llamar, mensajes } from '../api'
import { Errores, euros } from '../componentes'

/** Importa el histórico exportado de Declarando: primero enseña lo que va a entrar y luego lo importa. */
export function ImportarHistorico() {
  const [vista, setVista] = useState<VistaImportacion | null>(null)
  const [paises, setPaises] = useState<Record<string, string>>({})
  const [borrarAntes, setBorrarAntes] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [hecho, setHecho] = useState<(ResultadoImportacion & { copia: string | null }) | null>(null)
  const [errores, setErrores] = useState<string[]>([])

  const elegir = async () => {
    setErrores([]); setHecho(null); setOcupado(true)
    try {
      const v = await llamar(api.analizarImportacion())
      setVista(v)
      if (v) setPaises(Object.fromEntries(v.clientesNuevos.map((c) => [c.clave, c.paisSugerido])))
    } catch (e) {
      setErrores(mensajes(e))
    } finally {
      setOcupado(false)
    }
  }

  const importar = async () => {
    if (!vista) return
    if (borrarAntes && (vista.actuales.ingresos || vista.actuales.gastos) &&
      !confirm(`Se borrarán ${vista.actuales.ingresos} ingresos y ${vista.actuales.gastos} gastos que tienes ahora en la app antes de importar.\n\nSe guarda antes una copia de seguridad de la base de datos. ¿Seguir?`)) return
    setOcupado(true); setErrores([])
    try {
      setHecho(await llamar(api.confirmarImportacion({ borrarAntes, paises })))
      setVista(null)
    } catch (e) {
      setErrores(mensajes(e))
    } finally {
      setOcupado(false)
    }
  }

  const totales = vista?.resumen.reduce((a, r) => ({ ingresos: a.ingresos + r.ingresos, gastos: a.gastos + r.gastos }), { ingresos: 0, gastos: 0 })

  return (
    <div className="tarjeta">
      <p className="nota">
        Descarga en Declarando tus listados, libros contables, facturas y justificantes (vienen en varios ZIP) y elígelos todos a la vez.
        Antes de importar verás lo que va a entrar. No se envía nada a Hacienda.
      </p>
      {!vista ? <div className="acciones"><button className="secundario" disabled={ocupado} onClick={elegir}>{ocupado ? 'Leyendo…' : 'Elegir archivos de Declarando…'}</button></div> : null}
      <Errores errores={errores} />

      {hecho ? (
        <p className="ok">
          Importados {hecho.ingresos} ingresos y {hecho.gastos} gastos{hecho.clientesNuevos ? `, ${hecho.clientesNuevos} cliente(s) nuevo(s)` : ''} y {hecho.adjuntos} archivo(s) adjunto(s).
          {hecho.omitidos ? ` ${hecho.omitidos} ya estaban y no se han duplicado.` : ''}
          {hecho.copia ? ` Antes se borraron ${hecho.borrados.ingresos} ingresos y ${hecho.borrados.gastos} gastos; la copia de seguridad está en ${hecho.copia}.` : ''}
        </p>
      ) : null}

      {vista && totales ? (
        <>
          <table>
            <thead><tr><th>Año</th><th className="num">Ingresos</th><th className="num">Base</th><th className="num">Gastos</th><th className="num">Base</th></tr></thead>
            <tbody>
              {vista.resumen.map((r) => (
                <tr key={r.anio}><td>{r.anio}</td><td className="num">{r.ingresos}</td><td className="num">{euros(r.baseIngresos)}</td><td className="num">{r.gastos}</td><td className="num">{euros(r.baseGastos)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="nota">
            {vista.facturasConPdf} de {totales.ingresos} facturas emitidas llevan su PDF. {vista.justificantesAsignados} justificante(s) de gastos emparejados con su gasto.
            {vista.sinAsignar.length ? ` No he podido emparejar ${vista.sinAsignar.length} (${vista.sinAsignar.join(', ')}): adjúntalos a mano en su gasto.` : ''}
          </p>

          {vista.clientesNuevos.length ? (
            <>
              <h2>Clientes nuevos</h2>
              <table>
                <thead><tr><th>Cliente</th><th>NIF</th><th>País (código de 2 letras)</th></tr></thead>
                <tbody>
                  {vista.clientesNuevos.map((c) => (
                    <tr key={c.clave}>
                      <td>{c.nombre}</td><td>{c.nif || '—'}</td>
                      <td><input value={paises[c.clave] ?? ''} maxLength={2} placeholder="GB, US, FR…" style={{ width: 90 }}
                        onChange={(e) => setPaises({ ...paises, [c.clave]: e.target.value.toUpperCase() })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {vista.avisos.length ? <p className="avisos">{vista.avisos.join(' ')}</p> : null}

          <label className="check">
            <input type="checkbox" checked={borrarAntes} onChange={(e) => setBorrarAntes(e.target.checked)} />
            Borrar antes los {vista.actuales.ingresos} ingresos y {vista.actuales.gastos} gastos que hay ahora en la app (se guarda una copia de seguridad).
            Las facturas emitidas en la app y sus registros VERI*FACTU no se borran.
          </label>
          <div className="acciones">
            <button disabled={ocupado} onClick={importar}>{ocupado ? 'Importando…' : `Importar ${totales.ingresos} ingresos y ${totales.gastos} gastos`}</button>
            <button className="secundario" disabled={ocupado} onClick={() => setVista(null)}>Cancelar</button>
          </div>
        </>
      ) : null}
    </div>
  )
}
