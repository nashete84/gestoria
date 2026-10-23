import { useEffect, useState } from 'react'
import type { Modelo, Periodo } from '../../core/calendario'
import type { Operador349, Tercero347 } from '../../core/modelos/declarativos'
import { CASILLAS, NO_EUROS } from '../../core/modelos/descripciones'
import type { AjustesModelos, ResultadoModelo } from '../../core/modelos/tipos'
import { api, llamar, mensajes } from '../api'
import { Avisos, Campo, CampoEuros, Errores, euros } from '../componentes'
import { Icono } from '../iconos'

export const MODELOS_CALCULADOS: Modelo[] = ['303', '130', '111', '115', '349', '390', '347']
/** Modelos con fichero .txt según el diseño de registro oficial. */
const CON_FICHERO: Modelo[] = ['303', '130', '111', '115', '349', '390', '347']
/** Modelos que no hay que presentar si no hay nada que declarar (sin fichero en ese caso). */
const SOLO_CON_DATOS: Modelo[] = ['111', '115', '349', '347']

const TIPOS: Record<ResultadoModelo['tipo'], string> = {
  ingresar: 'A ingresar', devolver: 'A devolver', compensar: 'A compensar / deducir', cero: 'Resultado cero', negativa: 'Negativa'
}

function valor(modelo: Modelo, casilla: string, v: number) {
  if (!NO_EUROS.has(`${casilla}@${modelo}`)) return euros(v)
  // Tipos y porcentajes se guardan con dos decimales (2100 = 21,00 %).
  return ['02', '05', '08', '151', '65'].includes(casilla) && modelo === '303' ? `${(v / 100).toLocaleString('es-ES')} %` : String(v)
}

/** Orden de las casillas: numérico cuando lo son. */
const ordenar = (a: string, b: string) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b)

export function CasillasModelo({ modelo, ejercicio, periodo }: { modelo: Modelo; ejercicio: number; periodo: Periodo }) {
  const [r, setR] = useState<ResultadoModelo | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [guardado, setGuardado] = useState<string | null>(null)

  const descargar = async () => {
    try {
      const f = await llamar(api.guardarFicheroModelo(modelo, ejercicio, periodo))
      if (f) setGuardado(f.ruta)
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  useEffect(() => {
    llamar(api.calcularModelo(modelo, ejercicio, periodo)).then(setR).catch((e) => setErrores(mensajes(e)))
  }, [modelo, ejercicio, periodo])

  if (errores.length) return <Errores errores={errores} />
  if (!r) return null
  const nombres = CASILLAS[modelo] ?? {}
  const operadores = (r as ResultadoModelo & { operadores?: Operador349[] }).operadores
  const terceros = (r as ResultadoModelo & { terceros?: Tercero347[] }).terceros

  return (
    <div className="casillas">
      <div className="factura-cabecera">
        <strong>{r.sinActividad ? 'Sin actividad en el periodo' : TIPOS[r.tipo]}{r.resultado ? `: ${euros(Math.abs(r.resultado))}` : ''}</strong>
        <span className="nota">Calculado con tus ingresos y gastos</span>
      </div>
      <Avisos avisos={r.avisos} />
      <table className="desglose">
        <tbody>
          {Object.keys(r.casillas).sort(ordenar).map((k) => (
            <tr key={k}>
              <td>{/^\d+$/.test(k) ? <span className="etiqueta">[{k}]</span> : null} {nombres[k] ?? ''}</td>
              <td className="num">{valor(modelo, k, r.casillas[k]!)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {operadores?.length ? (
        <table className="registros">
          <thead><tr><th>NIF-IVA</th><th>Nombre</th><th>Clave</th><th className="num">Base</th></tr></thead>
          <tbody>{operadores.map((o) => <tr key={o.nifIva + o.clave}><td>{o.nifIva}</td><td>{o.nombre}</td><td>{o.clave}</td><td className="num">{euros(o.base)}</td></tr>)}</tbody>
        </table>
      ) : null}
      {terceros?.length ? (
        <table className="registros">
          <thead><tr><th>NIF</th><th>Nombre</th><th>Clave</th><th className="num">Anual</th><th className="num">1T</th><th className="num">2T</th><th className="num">3T</th><th className="num">4T</th></tr></thead>
          <tbody>{terceros.map((t) => (
            <tr key={t.clave + t.nif + t.nombre}><td>{t.nif || '—'}</td><td>{t.nombre}</td><td>{t.clave === 'B' ? 'B (ventas)' : 'A (compras)'}</td>
              <td className="num">{euros(t.importe)}</td>{t.trimestres.map((x, i) => <td key={i} className="num">{euros(x)}</td>)}</tr>
          ))}</tbody>
        </table>
      ) : null}
      {CON_FICHERO.includes(modelo) ? (
        <div className="acciones">
          <button onClick={descargar} disabled={r.sinActividad && SOLO_CON_DATOS.includes(modelo)}><Icono nombre="descargar" />Descargar .txt para la Sede</button>
          {guardado ? <span className="ok">Guardado en {guardado}</span> : null}
          {r.sinActividad ? <span className="nota">Sin operaciones no hay que presentarlo.</span> : null}
        </div>
      ) : (
        <p className="nota">Revisa estas casillas con el formulario de la Sede. El fichero .txt llegará cuando tenga el diseño oficial del modelo.</p>
      )}
    </div>
  )
}

export function AjustesEjercicio({ onCambio }: { onCambio: () => void }) {
  const actual = new Date().getFullYear()
  const [ejercicio, setEjercicio] = useState(actual)
  const [a, setA] = useState<AjustesModelos | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    setA(null)
    llamar(api.leerAjustesModelos(ejercicio)).then(setA).catch((e) => setErrores(mensajes(e)))
  }, [ejercicio])

  const guardar = async () => {
    if (!a) return
    try {
      setA(await llamar(api.guardarAjustesModelos(ejercicio, a)))
      setErrores([])
      setGuardado(true)
      onCambio()
    } catch (e) {
      setErrores(mensajes(e))
    }
  }
  const set = <K extends keyof AjustesModelos>(k: K, v: AjustesModelos[K]) => { if (a) setA({ ...a, [k]: v }); setGuardado(false) }

  return (
    <div className="tarjeta" key={ejercicio}>
      <div className="factura-cabecera">
        <strong>Datos que no salen de tus ingresos y gastos</strong>
        <select value={ejercicio} onChange={(e) => setEjercicio(Number(e.target.value))}>
          {[actual, actual - 1].map((x) => <option key={x} value={x}>Ejercicio {x}</option>)}
        </select>
      </div>
      <Errores errores={errores} />
      {a ? (
        <>
          <div className="rejilla">
            <Campo etiqueta="303: cuotas a compensar al empezar el año" ayuda="Lo que te quedó a compensar del año anterior (casilla 87 o 72 del último 303).">
              <CampoEuros key={`c${ejercicio}`} valor={a.compensar303Inicial} onChange={(v) => set('compensar303Inicial', v)} />
            </Campo>
            <Campo etiqueta={`130: rendimiento neto de ${ejercicio - 1}`} ayuda="Para la minoración de la casilla 13. Vacío = lo calcula la app con tus datos de ese año.">
              <input key={`r${ejercicio}`} inputMode="decimal" placeholder="Calcular con mis datos"
                defaultValue={a.rendimientoAnterior === null ? '' : (a.rendimientoAnterior / 100).toFixed(2).replace('.', ',')}
                onChange={(e) => {
                  const t = e.target.value.trim().replace(/\./g, '').replace(',', '.')
                  set('rendimientoAnterior', t === '' || Number.isNaN(Number(t)) ? null : Math.round(Number(t) * 100))
                }} />
            </Campo>
          </div>
          <label className="check">
            <input type="checkbox" checked={a.devolucion303} onChange={(e) => set('devolucion303', e.target.checked)} />
            Si el 303 del 4T sale negativo, pedir la devolución (si no, queda a compensar)
          </label>
          <div className="acciones">
            <button onClick={guardar}>Guardar</button>
            {guardado ? <span className="ok">Guardado</span> : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
