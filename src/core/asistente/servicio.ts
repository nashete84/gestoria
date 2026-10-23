// Asistente de ayuda: prepara la pregunta con las fichas relevantes y se la pasa al motor (el modelo local).
// No usa ningún dato del usuario: solo la pregunta, la conversación y la base de conocimiento.

import { fichasCitadas, limpiarRespuesta, prepararPregunta, type FichaCitada, type MensajeChat, type PreguntaPreparada } from './prompt'

export type EstadoAsistente =
  | { fase: 'sin_modelo' }
  | { fase: 'descargando'; descargado: number; total: number }
  | { fase: 'listo' }
  | { fase: 'error'; mensaje: string }

export interface InfoModeloAsistente {
  nombre: string
  /** Tamaño aproximado de la descarga, para mostrarlo. */
  tamano: string
  memoria: string
}

export interface RespuestaAsistente {
  texto: string
  fichas: FichaCitada[]
}

export type EventoAsistente =
  | { tipo: 'estado'; estado: EstadoAsistente }
  | { tipo: 'trozo'; id: string; texto: string }

/** Lo que hace el modelo: escribir la respuesta, avisando de cada trozo según lo genera. */
export interface Motor {
  responder(p: PreguntaPreparada, alTrozo: (texto: string) => void, senal: AbortSignal): Promise<string>
}

export const MAX_PREGUNTA = 2000
const MAX_HISTORIAL = 20

/** Comprueba lo que llega de la interfaz antes de usarlo. */
export function validarConversacion(pregunta: unknown, historial: unknown): { pregunta: string; historial: MensajeChat[] } {
  if (typeof pregunta !== 'string' || !pregunta.trim()) throw new Error('Escribe una pregunta.')
  if (pregunta.length > MAX_PREGUNTA) throw new Error(`La pregunta es demasiado larga (máximo ${MAX_PREGUNTA} caracteres).`)
  if (!Array.isArray(historial)) throw new Error('Conversación no válida.')
  const h = historial.slice(-MAX_HISTORIAL).map((m) => {
    const x = m as Partial<MensajeChat>
    if ((x?.rol !== 'usuario' && x?.rol !== 'asistente') || typeof x.texto !== 'string') throw new Error('Conversación no válida.')
    return { rol: x.rol, texto: x.texto.slice(0, 4000) }
  })
  return { pregunta, historial: h }
}

export async function responder(motor: Motor, pregunta: string, historial: MensajeChat[], alTrozo: (t: string) => void, senal: AbortSignal): Promise<RespuestaAsistente> {
  const p = prepararPregunta(pregunta, historial)
  const bruto = await motor.responder(p, alTrozo, senal)
  const texto = limpiarRespuesta(bruto) || (senal.aborted ? '(Respuesta cancelada)' : 'No he sabido responder. Prueba a preguntarlo de otra forma.')
  return { texto, fichas: fichasCitadas(texto, p.fichas) }
}
