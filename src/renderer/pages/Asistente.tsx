import { useEffect, useRef, useState } from 'react'
import type { MensajeChat, FichaCitada } from '../../core/asistente/prompt'
import type { EstadoAsistente, InfoModeloAsistente } from '../../core/asistente/servicio'
import { api, eventos, llamar, mensajes } from '../api'
import { Errores } from '../componentes'

interface Turno extends MensajeChat {
  fichas?: FichaCitada[]
}

const EJEMPLOS = [
  '¿Cómo añado un gasto?',
  '¿Cuándo se presenta el 303?',
  'Facturo a una empresa de Alemania, ¿lleva IVA?',
  '¿Puedo deducir la luz si trabajo en casa?'
]

const gb = (bytes: number) => (bytes / 1e9).toLocaleString('es-ES', { maximumFractionDigits: 1 })

/** Chat flotante abajo a la derecha, disponible en todas las pantallas. La conversación vive mientras la app está abierta. */
export function ChatAsistente() {
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState<EstadoAsistente | null>(null)
  const [modelo, setModelo] = useState<InfoModeloAsistente | null>(null)
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [pregunta, setPregunta] = useState('')
  const [enCurso, setEnCurso] = useState<{ id: string; texto: string } | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const final = useRef<HTMLDivElement>(null)

  useEffect(() => {
    llamar(api.estadoAsistente()).then((r) => { setEstado(r.estado); setModelo(r.modelo) }).catch((e) => setErrores(mensajes(e)))
    return eventos.alAsistente((e) => {
      if (e.tipo === 'estado') setEstado(e.estado)
      else setEnCurso((c) => (c && c.id === e.id ? { ...c, texto: c.texto + e.texto } : c))
    })
  }, [])
  useEffect(() => { final.current?.scrollIntoView({ block: 'end' }) }, [turnos, enCurso?.texto, abierto])

  const enviar = async (texto: string) => {
    const q = texto.trim()
    if (!q || enCurso) return
    const id = crypto.randomUUID()
    const historial = turnos.map(({ rol, texto }) => ({ rol, texto }))
    setTurnos((t) => [...t, { rol: 'usuario', texto: q }])
    setPregunta('')
    setErrores([])
    setEnCurso({ id, texto: '' })
    try {
      const r = await llamar(api.preguntarAsistente(id, q, historial))
      setTurnos((t) => [...t, { rol: 'asistente', texto: r.texto, fichas: r.fichas }])
    } catch (e) {
      setErrores(mensajes(e))
    } finally {
      setEnCurso(null)
    }
  }

  const descargar = () => llamar(api.descargarModeloAsistente()).then(setEstado).catch((e) => setErrores(mensajes(e)))

  if (!abierto) {
    return (
      <button className="lanzador-chat" title="Asistente: dudas de Hacienda y de la app" onClick={() => setAbierto(true)}>
        {enCurso ? '…' : '?'}
      </button>
    )
  }

  let cuerpo
  if (!estado || !modelo) cuerpo = <Errores errores={errores} />
  else if (estado.fase !== 'listo') {
    cuerpo = (
      <div className="chat-cuerpo">
        <Errores errores={estado.fase === 'error' ? [estado.mensaje, ...errores] : errores} />
        <p>Responde dudas generales de Hacienda y de cómo usar la app. Funciona dentro de la app, en tu Mac: no ve tus datos y no envía nada a internet.</p>
        <p>Antes hay que descargar su modelo de IA una sola vez: <strong>{modelo.nombre}</strong>, unos {modelo.tamano}. Necesita {modelo.memoria}.</p>
        {estado.fase === 'descargando' ? (
          <>
            <progress max={estado.total || 1} value={estado.descargado} style={{ width: '100%' }} />
            <div className="acciones">
              <span className="nota">{gb(estado.descargado)} de {gb(estado.total)} GB</span>
              <button className="secundario" onClick={() => llamar(api.cancelarDescargaAsistente()).catch((e) => setErrores(mensajes(e)))}>Pausar</button>
            </div>
          </>
        ) : (
          <div className="acciones">
            <button onClick={descargar}>{estado.fase === 'error' ? 'Reintentar' : 'Descargar el modelo'}</button>
            <span className="nota">Si se corta, continúa donde iba.</span>
          </div>
        )}
      </div>
    )
  } else {
    cuerpo = (
      <>
        <div className="chat-cuerpo">
          {!turnos.length && !enCurso ? (
            <>
              <p className="nota">Dudas generales de Hacienda y de cómo usar la app. No ve tus datos: para tu caso concreto, consulta a un asesor o a la AEAT.</p>
              <div className="sugerencias">
                {EJEMPLOS.map((e) => <button key={e} className="chip" onClick={() => void enviar(e)}>{e}</button>)}
              </div>
            </>
          ) : null}
          {turnos.map((t, i) => (
            <div key={i} className={`burbuja ${t.rol}`}>
              <div className="texto">{t.texto}</div>
              {t.fichas?.length ? <Fuentes fichas={t.fichas} /> : null}
            </div>
          ))}
          {enCurso ? (
            <div className="burbuja asistente">
              <div className="texto">{enCurso.texto || <span className="nota">Pensando… (la primera respuesta tarda más: se carga el modelo)</span>}</div>
            </div>
          ) : null}
          <div ref={final} />
          <Errores errores={errores} />
        </div>
        <form className="pregunta" onSubmit={(e) => { e.preventDefault(); void enviar(pregunta) }}>
          <textarea value={pregunta} rows={2} placeholder="Escribe tu duda…" maxLength={2000} autoFocus
            onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(pregunta) } }} />
          {enCurso
            ? <button type="button" className="secundario" onClick={() => void api.cancelarPreguntaAsistente(enCurso.id)}>Parar</button>
            : <button type="submit" disabled={!pregunta.trim()}>Enviar</button>}
        </form>
      </>
    )
  }

  return (
    <aside className="ventana-chat" role="dialog" aria-label="Asistente">
      <header>
        <strong>Asistente</strong>
        {turnos.length ? <button className="mini" disabled={!!enCurso} onClick={() => setTurnos([])}>Nueva</button> : null}
        <button className="mini" title="Cerrar" onClick={() => setAbierto(false)}>✕</button>
      </header>
      {cuerpo}
    </aside>
  )
}

function Fuentes({ fichas }: { fichas: FichaCitada[] }) {
  return (
    <div className="fuentes">
      {fichas.map((f) => (
        <div key={f.n}>
          [{f.n}] {f.titulo}
          {f.fuentes.map((fu) => <span key={fu.nombre}> · <a href={fu.url} target="_blank" rel="noreferrer">{fu.nombre}</a></span>)}
        </div>
      ))}
    </div>
  )
}
