import { useEffect, useState } from 'react'
import {
  etiquetaPeriodo, NOMBRE_MODELO, type ObligacionConEstado, type PresentacionNueva, type Resultado
} from '../../core/calendario'
import { api, llamar, mensajes } from '../api'
import { Campo, CampoEuros, Errores, euros, hoy } from '../componentes'
import { AjustesEjercicio, CasillasModelo, MODELOS_CALCULADOS } from './CasillasModelo'

const RESULTADOS: Record<Resultado, string> = {
  ingresar: 'A ingresar',
  devolver: 'A devolver',
  compensar: 'A compensar',
  cero: 'Sin actividad (cero)',
  negativa: 'Negativa'
}

function fechaCorta(f: string) {
  return f.split('-').reverse().join('/')
}

function cuandoVence(o: ObligacionConEstado) {
  if (o.estado === 'vencido') return `Venció hace ${-o.diasRestantes} día(s)`
  if (o.estado === 'proximo') return `Del ${fechaCorta(o.desde)} al ${fechaCorta(o.hasta)}`
  if (o.diasRestantes === 0) return 'Vence hoy'
  return `Vence en ${o.diasRestantes} día(s)`
}

const claveDe = (o: { modelo: string; ejercicio: number; periodo: string }) => `${o.modelo}-${o.ejercicio}-${o.periodo}`

export function PaginaImpuestos({ onCambio }: { onCambio: () => void }) {
  const [lista, setLista] = useState<ObligacionConEstado[]>([])
  const [marcando, setMarcando] = useState<PresentacionNueva | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [viendo, setViendo] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const anioActual = Number(hoy().slice(0, 4))
  const [ejercicio, setEjercicio] = useState(anioActual)

  const cargar = () => llamar(api.calendarioFiscal(hoy())).then(setLista).catch((e) => setErrores(mensajes(e)))
  useEffect(() => { void cargar() }, [])

  const guardar = async () => {
    if (!marcando) return
    try {
      await llamar(api.registrarPresentacion(marcando))
      setMarcando(null)
      setErrores([])
      await cargar()
      onCambio()
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  const deshacer = async (id: number) => {
    if (!confirm('¿Quitar la marca de presentado?')) return
    try {
      await llamar(api.borrarPresentacion(id))
      await cargar()
      onCambio()
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  /** Abre el formulario de presentado con el resultado calculado, si lo hay. */
  const abrirMarcar = async (o: ObligacionConEstado, abierto: boolean) => {
    if (abierto) { setMarcando(null); return }
    const nuevo: PresentacionNueva = {
      modelo: o.modelo, ejercicio: o.ejercicio, periodo: o.periodo, fechaPresentacion: hoy(),
      resultado: 'ingresar', importe: 0, justificante: '', notas: ''
    }
    if (MODELOS_CALCULADOS.includes(o.modelo)) {
      const r = await api.calcularModelo(o.modelo, o.ejercicio, o.periodo)
      if (r.ok) {
        const tipo = r.datos.sinActividad && o.modelo === '303' ? 'cero' : r.datos.tipo
        nuevo.resultado = tipo
        nuevo.importe = tipo === 'cero' || tipo === 'negativa' ? 0 : Math.abs(r.datos.resultado)
      }
    }
    setMarcando(nuevo)
  }

  // Solo los modelos del ejercicio elegido (por defecto, el año en curso).
  const ejercicios = [...new Set([anioActual, ...lista.map((o) => o.ejercicio)])].sort((a, b) => b - a)
  const otrosPendientes = lista.filter((o) => o.ejercicio !== ejercicio && !o.condicional && o.estado === 'vencido').length
  const delEjercicio = lista.filter((o) => o.ejercicio === ejercicio)
  const pendientes = delEjercicio.filter((o) => o.estado === 'vencido' || o.estado === 'en_plazo')
  const proximos = delEjercicio.filter((o) => o.estado === 'proximo')
  const presentados = delEjercicio
    .filter((o) => o.estado === 'presentado')
    .sort((a, b) => b.presentacion!.fechaPresentacion.localeCompare(a.presentacion!.fechaPresentacion))

  const fila = (o: ObligacionConEstado) => {
    const k = claveDe(o)
    const abierto = marcando && claveDe(marcando) === k
    return (
      <div key={k} className={`obligacion ${o.estado}`}>
        <div className="modelo">{o.modelo}</div>
        <div className="detalle">
          <strong>{NOMBRE_MODELO[o.modelo]}</strong> · {etiquetaPeriodo(o)}
          {o.condicional ? <span className="etiqueta">solo si hay operaciones</span> : null}
          <div className="nota">{o.nota ?? ''}</div>
        </div>
        <div className={`plazo ${o.estado}`}>{cuandoVence(o)}</div>
        <div className="botones">
          {MODELOS_CALCULADOS.includes(o.modelo) ? (
            <button className="secundario" onClick={() => setViendo(viendo === k ? null : k)}>{viendo === k ? 'Ocultar casillas' : 'Ver casillas'}</button>
          ) : null}
          {o.estado !== 'proximo' ? (
            <button className="secundario" onClick={() => abrirMarcar(o, !!abierto)}>Marcar como presentado</button>
          ) : null}
        </div>
        {viendo === k ? <div className="marcar"><CasillasModelo key={version} modelo={o.modelo} ejercicio={o.ejercicio} periodo={o.periodo} /></div> : null}
        {abierto ? (
          <div className="marcar">
            <div className="rejilla">
              <Campo etiqueta="Fecha de presentación">
                <input type="date" value={marcando.fechaPresentacion} onChange={(e) => setMarcando({ ...marcando, fechaPresentacion: e.target.value })} />
              </Campo>
              <Campo etiqueta="Resultado">
                <select value={marcando.resultado} onChange={(e) => {
                  const resultado = e.target.value as Resultado
                  setMarcando({ ...marcando, resultado, importe: resultado === 'cero' || resultado === 'negativa' ? 0 : marcando.importe })
                }}>
                  {Object.entries(RESULTADOS).map(([k2, v]) => <option key={k2} value={k2}>{v}</option>)}
                </select>
              </Campo>
              {marcando.resultado !== 'cero' && marcando.resultado !== 'negativa' ? (
                <Campo etiqueta="Importe (€)"><CampoEuros valor={marcando.importe} onChange={(importe) => setMarcando({ ...marcando, importe })} /></Campo>
              ) : null}
              <Campo etiqueta="CSV o nº de justificante">
                <input value={marcando.justificante} onChange={(e) => setMarcando({ ...marcando, justificante: e.target.value })} />
              </Campo>
            </div>
            <div className="acciones">
              <button onClick={guardar}>Guardar</button>
              <button className="secundario" onClick={() => setMarcando(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <section>
      <div className="cabecera">
        <h1>Impuestos</h1>
        <select value={ejercicio} onChange={(e) => setEjercicio(Number(e.target.value))}>
          {ejercicios.map((a) => <option key={a} value={a}>Ejercicio {a}</option>)}
        </select>
        <a href="https://sede.agenciatributaria.gob.es" target="_blank" rel="noreferrer">Abrir la Sede de la AEAT</a>
      </div>
      <Errores errores={errores} />
      {otrosPendientes ? (
        <p className="avisos">Hay {otrosPendientes} modelo(s) vencido(s) de otros ejercicios. Elige el ejercicio arriba para verlos.</p>
      ) : null}

      <h2>Pendientes de presentar ({pendientes.length})</h2>
      {pendientes.length ? pendientes.map(fila) : <p className="vacio">No tienes modelos pendientes. 🎉</p>}

      <h2>Próximos</h2>
      {proximos.length ? proximos.map(fila) : <p className="vacio">No hay plazos en los próximos meses.</p>}

      <h2>Presentados</h2>
      <table>
        <thead><tr><th>Modelo</th><th>Periodo</th><th>Presentado</th><th>Resultado</th><th className="num">Importe</th><th>Justificante</th><th /></tr></thead>
        <tbody>
          {presentados.map((o) => {
            const p = o.presentacion!
            return (
              <tr key={p.id}>
                <td>{o.modelo} · {NOMBRE_MODELO[o.modelo]}</td>
                <td>{etiquetaPeriodo(o)}</td>
                <td>{fechaCorta(p.fechaPresentacion)}{p.fechaPresentacion > o.hasta ? ' (fuera de plazo)' : ''}</td>
                <td>{RESULTADOS[p.resultado]}</td>
                <td className="num">{euros(p.importe)}</td>
                <td>{p.justificante}</td>
                <td className="derecha"><button className="peligro" onClick={() => deshacer(p.id)}>Deshacer</button></td>
              </tr>
            )
          })}
          {!presentados.length ? <tr><td colSpan={7} className="vacio">Aún no has marcado ningún modelo como presentado.</td></tr> : null}
        </tbody>
      </table>
      <h2>Ajustes para calcular los modelos</h2>
      <AjustesEjercicio onCambio={() => setVersion((v) => v + 1)} />

      <p className="nota">
        Plazos generales de la AEAT; si el último día cae en fin de semana pasa al lunes. Los festivos no se tienen en cuenta.
        Los modelos 111, 115, 349 y 347 aparecen solo si tus ingresos y gastos los hacen necesarios.
      </p>
    </section>
  )
}
