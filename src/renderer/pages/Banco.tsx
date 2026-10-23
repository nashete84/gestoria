import { useState } from 'react'
import type { Accion } from '../../core/banco/conciliacion'
import type { ResultadoBanco, VistaBanco } from '../../core/db/banco'
import { CATEGORIAS_GASTO } from '../../core/fiscalidad'
import { api, llamar, mensajes } from '../api'
import { Errores, euros } from '../componentes'
import { Icono } from '../iconos'

const fechaEs = (f: string) => f.split('-').reverse().join('/')

/** Acción como texto para el <select>, y vuelta. */
const aTexto = (a: Accion) =>
  a.tipo === 'cobro' ? `cobro:${a.ingresoId}` : a.tipo === 'ya_registrado' ? `ya:${a.gastoId}` : a.tipo === 'crear_gasto' ? `gasto:${a.categoria}` : 'ignorar'
const deTexto = (t: string): Accion => {
  const [tipo, valor = ''] = t.split(':')
  if (tipo === 'cobro') return { tipo: 'cobro', ingresoId: Number(valor) }
  if (tipo === 'ya') return { tipo: 'ya_registrado', gastoId: Number(valor) }
  if (tipo === 'gasto') return { tipo: 'crear_gasto', categoria: valor }
  return { tipo: 'ignorar' }
}

/** Importa un extracto del banco: marca cobros, crea gastos y recuerda lo ya importado. */
export function PaginaBanco({ onCambio }: { onCambio?: () => void }) {
  const [vista, setVista] = useState<VistaBanco | null>(null)
  const [acciones, setAcciones] = useState<Accion[]>([])
  const [hecho, setHecho] = useState<ResultadoBanco | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [ocupado, setOcupado] = useState(false)

  const elegir = async () => {
    setErrores([]); setHecho(null); setOcupado(true)
    try {
      const v = await llamar(api.analizarBanco())
      setVista(v)
      setAcciones(v ? v.propuestas.map((p) => p.accion) : [])
    } catch (e) { setErrores(mensajes(e)) } finally { setOcupado(false) }
  }

  const aplicar = async () => {
    if (!vista) return
    setOcupado(true); setErrores([])
    try {
      const decisiones = vista.propuestas.filter((p) => !p.repetido).map((p) => ({ movimiento: p.movimiento, clave: p.clave, accion: acciones[vista.propuestas.indexOf(p)]! }))
      setHecho(await llamar(api.aplicarBanco(decisiones)))
      setVista(null)
      onCambio?.()
    } catch (e) { setErrores(mensajes(e)) } finally { setOcupado(false) }
  }

  const cuenta = (tipo: Accion['tipo']) => vista ? acciones.filter((a, i) => a.tipo === tipo && !vista.propuestas[i]!.repetido).length : 0

  return (
    <section>
      <div className="cabecera">
        <h1>Banco</h1>
        <button disabled={ocupado} onClick={elegir}><Icono nombre="subir" />{ocupado && !vista ? 'Leyendo…' : 'Importar extracto…'}</button>
      </div>
      <p className="nota">
        Descarga el extracto de tu banco en <strong>Norma 43</strong> (también llamado "cuaderno 43" o "formato AEB") o en CSV, y elígelo.
        Te propongo qué hacer con cada movimiento: marcar como cobrado un ingreso pendiente por el mismo importe, reconocer gastos que ya
        tienes, crear los que faltan o ignorar lo que no es de tu actividad. No se aplica nada hasta que pulses Aplicar, y lo ya importado no se repite.
      </p>
      <Errores errores={errores} />
      {hecho ? (
        <p className="ok">
          Hecho: {hecho.cobros} cobro(s) marcados, {hecho.gastosCreados} gasto(s) creados y {hecho.ignorados} movimiento(s) sin cambios.
          {hecho.gastosCreados ? ' Revisa los gastos nuevos en Gastos: la base sale del total pagado con el IVA habitual de su categoría.' : ''}
        </p>
      ) : null}

      {vista ? (
        <>
          <table>
            <thead><tr><th>Fecha</th><th>Concepto</th><th className="num">Importe</th><th>Qué hacer</th></tr></thead>
            <tbody>
              {vista.propuestas.map((p, i) => {
                const m = p.movimiento
                const accion = acciones[i]!
                return (
                  <tr key={p.clave} className={p.repetido ? 'apagada' : ''}>
                    <td>{fechaEs(m.fecha)}</td>
                    <td>{m.concepto || '—'}<br /><small className="nota">{p.motivo}</small></td>
                    <td className={`num ${m.importe > 0 ? 'ahorro' : ''}`}>{euros(m.importe)}</td>
                    <td>
                      {p.repetido ? 'Ya importado' : (
                        <select value={aTexto(accion)} aria-label={`Qué hacer con ${m.concepto}`} onChange={(e) => setAcciones(acciones.map((a, j) => (j === i ? deTexto(e.target.value) : a)))}>
                          <option value="ignorar">Ignorar</option>
                          {m.importe > 0 ? Object.entries(vista.ingresos).map(([id, x]) => (
                            <option key={id} value={`cobro:${id}`}>Cobro de "{x.concepto}" ({fechaEs(x.fecha)}, {euros(x.importe)})</option>
                          )) : null}
                          {m.importe < 0 && p.accion.tipo === 'ya_registrado' ? (
                            <option value={`ya:${p.accion.gastoId}`}>Ya registrado: "{vista.gastos[p.accion.gastoId]?.concepto}"</option>
                          ) : null}
                          {m.importe < 0 ? (
                            <optgroup label="Crear gasto">
                              {CATEGORIAS_GASTO.map((c) => <option key={c.id} value={`gasto:${c.id}`}>Crear gasto: {c.nombre}</option>)}
                            </optgroup>
                          ) : null}
                        </select>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="acciones">
            <button disabled={ocupado} onClick={aplicar}><Icono nombre="guardar" />Aplicar: {cuenta('cobro')} cobro(s) y {cuenta('crear_gasto')} gasto(s) nuevos</button>
            <button className="secundario" disabled={ocupado} onClick={() => setVista(null)}>Cancelar</button>
          </div>
        </>
      ) : null}
    </section>
  )
}
