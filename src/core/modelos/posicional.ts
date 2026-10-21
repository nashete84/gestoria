// Motor para los ficheros de autoliquidación de la AEAT (303, 130, 111, 115, 390) a partir de los
// diseños de registro oficiales convertidos a JSON con scripts/extraer-disenos.py.
// Formato: <T{modelo}0{AAAA}{PP}0000><AUX>...</AUX>{páginas}</T{modelo}0{AAAA}{PP}0000>, sin saltos de línea.

import d111 from './disenos/111.json'
import d115 from './disenos/115.json'
import d130 from './disenos/130.json'
import d303 from './disenos/303.json'
import d390 from './disenos/390.json'
import { alfa, num } from './fichero'
import type { Casillas } from './tipos'

export interface Campo {
  n: number
  pos: number
  lon: number | null
  tipo: string // An / A alfanumérico, Num numérico sin signo, N numérico con signo ("N" delante si es negativo)
  casilla: string | null
  constante: string | null
  desc: string
}

export interface Diseno {
  modelo: string
  fuente: string
  paginas: Record<string, Campo[]>
}

export const DISENOS: Record<'303' | '130' | '111' | '115' | '390', Diseno> = {
  '303': d303 as Diseno, '130': d130 as Diseno, '111': d111 as Diseno, '115': d115 as Diseno, '390': d390 as Diseno
}

/** Valor puesto a mano en un campo (por su número): texto tal cual o número con el formato del campo. */
export type Valores = Record<number, string | number>

function numerico(campo: Campo, lon: number, v: number): string {
  if (!Number.isInteger(v)) throw new Error(`Campo ${campo.n} (${campo.desc}): valor no entero ${v}`)
  if (v < 0) {
    if (campo.tipo !== 'N') throw new Error(`Campo ${campo.n} (${campo.desc}): no admite negativos (${v})`)
    return 'N' + num(-v, lon - 1)
  }
  return num(v, lon)
}

function texto(campo: Campo, lon: number, v: string): string {
  if (v.length > lon) throw new Error(`Campo ${campo.n} (${campo.desc}): "${v}" no cabe en ${lon} posiciones`)
  return campo.tipo === 'Num' || campo.tipo === 'N' ? v.padStart(lon, '0') : v.padEnd(lon, ' ')
}

/**
 * Una página del diseño. Cada campo lleva, por orden de preferencia: el valor puesto a mano,
 * la constante del diseño, el importe de su casilla (solo en el primer campo con esa casilla)
 * o ceros / blancos.
 */
export function pagina(campos: Campo[], casillas: Casillas, valores: Valores = {}): string {
  const usadas = new Set<string>()
  let salida = ''
  for (const campo of campos) {
    const lon = campo.lon
    if (lon === null) throw new Error(`Campo ${campo.n} sin longitud`)
    if (campo.pos !== salida.length + 1) throw new Error(`Campo ${campo.n}: empieza en ${campo.pos} y debería empezar en ${salida.length + 1}`)
    const manual = valores[campo.n]
    let v: string
    if (typeof manual === 'number') v = numerico(campo, lon, manual)
    else if (typeof manual === 'string') v = texto(campo, lon, manual)
    else if (campo.constante !== null) v = texto(campo, lon, campo.constante)
    else if (campo.casilla && campo.casilla in casillas && !usadas.has(campo.casilla)) {
      usadas.add(campo.casilla)
      v = numerico(campo, lon, casillas[campo.casilla]!)
    } else v = campo.tipo === 'Num' || campo.tipo === 'N' ? '0'.repeat(lon) : ' '.repeat(lon)
    salida += v
  }
  return salida
}

export interface Cabecera {
  modelo: string
  ejercicio: number
  periodo: string
  /** NIF de quien ha hecho el programa (nota 1 de los diseños). */
  nifDesarrollador: string
}

export const VERSION_PROGRAMA = 'v1.0'

const etiqueta = (c: Cabecera) => `T${c.modelo}0${num(c.ejercicio, 4)}${c.periodo}0000`

/** Fichero completo: cabecera con el bloque AUX, las páginas y el cierre. */
export function ficheroPosicional(c: Cabecera, paginas: string[]): string {
  const aux = '<AUX>' + ' '.repeat(70) + VERSION_PROGRAMA + ' '.repeat(4) + alfa(c.nifDesarrollador, 9) + ' '.repeat(213) + '</AUX>'
  return `<${etiqueta(c)}>` + aux + paginas.join('') + `</${etiqueta(c)}>`
}

/** Número del campo de un diseño cuya descripción contiene el texto (para no depender de números sueltos). */
export function campoPorTexto(campos: Campo[], textoBuscado: string): number {
  const c = campos.filter((x) => x.desc.includes(textoBuscado))
  if (c.length !== 1) throw new Error(`"${textoBuscado}" aparece en ${c.length} campos del diseño`)
  return c[0]!.n
}
