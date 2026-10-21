// Utilidades para los ficheros de longitud fija de la AEAT (ISO-8859-1, campos posicionales).

import { normalizarNif } from '../nif'
import type { Perfil } from '../tipos'

/** Texto en mayúsculas, sin acentos (salvo Ñ y Ç), sin caracteres especiales, alineado a la izquierda y relleno de blancos. */
export function alfa(texto: string | null | undefined, longitud: number): string {
  const limpio = (texto ?? '')
    .toUpperCase()
    .replace(/Ñ/g, '\u0000').replace(/Ç/g, '\u0001')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\u0000/g, 'Ñ').replace(/\u0001/g, 'Ç')
    .replace(/[^A-Z0-9ÑÇ ,.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return limpio.slice(0, longitud).padEnd(longitud, ' ')
}

/** Número entero sin signo, alineado a la derecha y relleno de ceros. */
export function num(valor: number, longitud: number): string {
  if (!Number.isInteger(valor) || valor < 0) throw new Error(`Valor numérico no válido: ${valor}`)
  const s = String(valor)
  if (s.length > longitud) throw new Error(`El valor ${valor} no cabe en ${longitud} posiciones`)
  return s.padStart(longitud, '0')
}

/** Importe en céntimos sin signo: parte entera de `enteros` dígitos y 2 decimales. */
export function importe(centimos: number, enteros: number): string {
  return num(Math.abs(centimos), enteros + 2)
}

/** Signo de un importe: "N" si es negativo, blanco si no. */
export const signo = (centimos: number) => (centimos < 0 ? 'N' : ' ')

export const blancos = (n: number) => ' '.repeat(n)

/** NIF de 9 posiciones alineado a la derecha con ceros a la izquierda. */
export function nif9(nif: string): string {
  return normalizarNif(nif).slice(-9).padStart(9, '0')
}

/** Nombre del declarante: apellidos primero. Si no se ha indicado, el del perfil tal cual (con aviso). */
export function nombreDeclarante(perfil: Perfil, avisos: string[]): string {
  if (perfil.nombreFiscal?.trim()) return perfil.nombreFiscal
  avisos.push('Indica en tu perfil el "Nombre para Hacienda" (apellidos primero): Hacienda lo compara con tu NIF.')
  return perfil.nombre
}

export function telefono9(t: string): string {
  const d = t.replace(/\D/g, '').slice(-9)
  return d.padStart(9, '0')
}

/** Une registros de longitud fija comprobando su tamaño. Separados por CR+LF. */
export function unirRegistros(registros: string[], longitud: number): string {
  for (const [i, r] of registros.entries()) {
    if (r.length !== longitud) throw new Error(`El registro ${i + 1} mide ${r.length} posiciones en vez de ${longitud}`)
  }
  return registros.join('\r\n') + '\r\n'
}
