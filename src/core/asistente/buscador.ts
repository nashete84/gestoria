// Busca en la base de conocimiento las fichas que mejor responden a una pregunta (BM25 sobre palabras normalizadas).
// Es lo que permite a un modelo pequeño contestar bien: solo ve las fichas relevantes, y la app sabe qué fuentes citar.

import { FICHAS, type Ficha } from './conocimiento'

const VACIAS = new Set(('a al algo como con cual cuales cuando de del donde el en es esta este esto hay la las le lo los me mi mis ' +
  'muy no o para pero por puedo puede que se si sin sobre su sus te tengo tu un una uno unos y ya yo tiene tienen debo ' +
  'cuanto cuanta cuantos cuantas quiero necesito estoy soy ser').split(' '))

const RAIZ = 4

/** Minúsculas, sin acentos, sin signos y recortadas a su raíz. */
export function palabras(texto: string): string[] {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ*]+/g, ' ').split(' ')
    .filter((p) => p.length > 1 && !VACIAS.has(p))
    // Raíz aproximada: las primeras letras bastan para juntar "factura", "facturo" y "facturar", o "añado" y "añadir".
    .map((p) => (/^\d/.test(p) ? p : p.slice(0, RAIZ)))
}

interface Indice {
  docs: { ficha: Ficha; tf: Map<string, number>; largo: number }[]
  df: Map<string, number>
  largoMedio: number
}

function indexar(fichas: Ficha[]): Indice {
  const docs = fichas.map((ficha) => {
    // El título y las claves pesan más que el texto.
    const ps = [...palabras(ficha.titulo), ...palabras(ficha.titulo), ...palabras(ficha.titulo), ...palabras(ficha.claves), ...palabras(ficha.claves), ...palabras(ficha.texto)]
    const tf = new Map<string, number>()
    for (const p of ps) tf.set(p, (tf.get(p) ?? 0) + 1)
    return { ficha, tf, largo: ps.length }
  })
  const df = new Map<string, number>()
  for (const d of docs) for (const p of d.tf.keys()) df.set(p, (df.get(p) ?? 0) + 1)
  return { docs, df, largoMedio: docs.reduce((a, d) => a + d.largo, 0) / docs.length }
}

const INDICE = indexar(FICHAS)

export interface Encontrada {
  ficha: Ficha
  puntos: number
}

export function buscar(pregunta: string, maximo = 4, indice: Indice = INDICE): Encontrada[] {
  const consulta = [...new Set(palabras(pregunta))]
  const k1 = 1.2
  const b = 0.75
  const n = indice.docs.length
  const r = indice.docs.map((d) => {
    let puntos = 0
    for (const p of consulta) {
      const f = d.tf.get(p)
      if (!f) continue
      const idf = Math.log(1 + (n - indice.df.get(p)! + 0.5) / (indice.df.get(p)! + 0.5))
      puntos += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.largo / indice.largoMedio))
    }
    return { ficha: d.ficha, puntos }
  }).filter((x) => x.puntos > 0).sort((a, b) => b.puntos - a.puntos)
  // Se descartan las que quedan muy por debajo de la mejor: suelen ser ruido.
  const mejor = r[0]?.puntos ?? 0
  return r.filter((x) => x.puntos >= mejor * 0.35).slice(0, maximo)
}
