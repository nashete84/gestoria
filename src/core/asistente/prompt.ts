// Instrucciones y contexto que recibe el modelo en cada pregunta.

import { buscar } from './buscador'
import type { Fuente } from './conocimiento'

export interface MensajeChat {
  rol: 'usuario' | 'asistente'
  texto: string
}

export interface FichaCitada {
  n: number
  titulo: string
  fuentes: Fuente[]
}

export interface PreguntaPreparada {
  sistema: string
  /** Turnos anteriores que se le pasan al modelo (los últimos, para no llenar el contexto). */
  historial: MensajeChat[]
  pregunta: string
  fichas: FichaCitada[]
}

const REGLAS = `Eres el asistente de ayuda de una app de gestión para autónomos en España (estimación directa simplificada).
Responde siempre en español, de forma breve y clara (como mucho 150 palabras), en frases completas.
Reglas:
- Usa SOLO la información de las FICHAS de abajo. Si no está en las fichas, di que no lo sabes y recomienda consultar a la AEAT o a un asesor. No inventes importes, plazos, porcentajes ni artículos.
- Cita la ficha de la que sale cada dato con su número entre corchetes, por ejemplo [2].
- Respondes dudas generales, no casos personales: no conoces los datos del usuario ni debes pedírselos (NIF, importes, clientes). Si la pregunta depende de su situación, explica la regla general y recomienda confirmarlo con un asesor.
- Para preguntas sobre cómo hacer algo en la app, explica los pasos con los nombres de las pestañas y botones que dicen las fichas.
- No puedes hacer acciones en la app ni presentar nada a Hacienda.`

export const MAX_TURNOS = 4

export function prepararPregunta(pregunta: string, historial: MensajeChat[]): PreguntaPreparada {
  const texto = pregunta.trim()
  if (!texto) throw new Error('Escribe una pregunta.')
  // Se busca con la pregunta y la anterior del usuario, para que "¿y en el 4T?" encuentre lo que se estaba hablando.
  const anterior = [...historial].reverse().find((m) => m.rol === 'usuario')?.texto ?? ''
  let encontradas = buscar(texto)
  if (encontradas.length < 2 && anterior) encontradas = buscar(`${texto} ${anterior}`)
  const fichas: FichaCitada[] = encontradas.map((e, i) => ({ n: i + 1, titulo: e.ficha.titulo, fuentes: e.ficha.fuentes }))
  const bloque = encontradas.length
    ? encontradas.map((e, i) => `[${i + 1}] ${e.ficha.titulo}\n${e.ficha.texto}${e.ficha.fuentes.length ? `\nFuente: ${e.ficha.fuentes.map((f) => f.nombre).join('; ')}` : ''}`).join('\n\n')
    : '(Ninguna ficha trata este tema.)'
  return {
    sistema: `${REGLAS}\n\nFICHAS:\n${bloque}`,
    historial: historial.slice(-MAX_TURNOS * 2),
    pregunta: texto,
    fichas
  }
}

/** Quita restos de razonamiento interno que algunos modelos escriben entre <think> y </think>. */
export function limpiarRespuesta(texto: string): string {
  return texto.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim()
}

/** Fichas que la respuesta cita de verdad; si no cita ninguna, todas las que se le pasaron. */
export function fichasCitadas(respuesta: string, fichas: FichaCitada[]): FichaCitada[] {
  const citadas = new Set([...respuesta.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))
  const r = fichas.filter((f) => citadas.has(f.n))
  return r.length ? r : fichas
}
