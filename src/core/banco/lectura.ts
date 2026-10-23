// Lectura de extractos bancarios: Norma 43 (cuaderno 43 de la AEB, lo exportan casi todos los bancos españoles)
// y CSV con columnas de fecha, concepto e importe.

import type { Centimos } from '../money'

export interface Movimiento {
  fecha: string
  /** Positivo = abono (entra dinero); negativo = cargo. */
  importe: Centimos
  concepto: string
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/

function fechaValida(f: string): boolean {
  if (!FECHA_ISO.test(f)) return false
  const d = new Date(f + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f
}

/** Texto del archivo: UTF-8 si lo es; si no, Latin-1 (Norma 43 y muchos CSV de bancos). */
export function decodificarExtracto(datos: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(datos).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('latin1').decode(datos)
  }
}

export function esNorma43(texto: string): boolean {
  return /^11\d{18}/.test(texto.trimStart()) && /^22/m.test(texto)
}

/** Norma 43: registros 22 (movimiento) y 23 (concepto complementario), de 80 posiciones. */
export function leerNorma43(texto: string): Movimiento[] {
  const movimientos: Movimiento[] = []
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.startsWith('22')) {
      if (linea.length < 42) throw new Error('Norma 43: registro de movimiento demasiado corto.')
      const f = linea.slice(10, 16) // fecha de operación AAMMDD
      const fecha = `20${f.slice(0, 2)}-${f.slice(2, 4)}-${f.slice(4, 6)}`
      if (!fechaValida(fecha)) throw new Error(`Norma 43: fecha no válida "${f}".`)
      const signo = linea[27] === '1' ? -1 : linea[27] === '2' ? 1 : 0
      if (!signo) throw new Error('Norma 43: falta la clave de debe/haber.')
      const importe = Number(linea.slice(28, 42))
      if (!Number.isInteger(importe)) throw new Error('Norma 43: importe no válido.')
      const referencias = [linea.slice(52, 64), linea.slice(64, 80)].map((s) => s.trim()).filter((s) => s && !/^0+$/.test(s))
      movimientos.push({ fecha, importe: signo * importe, concepto: referencias.join(' ') })
    } else if (linea.startsWith('23') && movimientos.length) {
      const m = movimientos[movimientos.length - 1]!
      // Dos campos de 38 posiciones seguidos: un texto largo sigue en el segundo sin espacio.
      const extra = linea.slice(4, 80).trim()
      m.concepto = [extra, m.concepto].filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim()
    }
  }
  return movimientos
}

/** Separa una línea CSV con el separador dado, respetando comillas. */
function campos(linea: string, sep: string): string[] {
  const r: string[] = []
  let campo = ''
  let comillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]!
    if (comillas) {
      if (c === '"' && linea[i + 1] === '"') { campo += '"'; i++ } else if (c === '"') comillas = false
      else campo += c
    } else if (c === '"') comillas = true
    else if (c === sep) { r.push(campo.trim()); campo = '' }
    else campo += c
  }
  r.push(campo.trim())
  return r
}

/** Importe en formato español ("-1.234,56") o con punto decimal ("-1234.56"). */
export function importeBanco(texto: string): Centimos {
  let t = texto.replace(/[€\s]/g, '').replace(/^\+/, '')
  if (!t) throw new Error('Importe vacío.')
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) throw new Error(`Importe no válido: "${texto}".`)
  return Math.round(Number(t) * 100)
}

/** Fecha "dd/mm/aaaa", "dd-mm-aaaa", "dd/mm/aa" o "aaaa-mm-dd". */
export function fechaBanco(texto: string): string {
  const t = texto.trim()
  let f = ''
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  const es = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t)
  if (iso) f = `${iso[1]}-${iso[2]}-${iso[3]}`
  else if (es) f = `${es[3]!.length === 2 ? '20' + es[3] : es[3]}-${es[2]!.padStart(2, '0')}-${es[1]!.padStart(2, '0')}`
  if (!fechaValida(f)) throw new Error(`Fecha no válida: "${texto}".`)
  return f
}

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * CSV de banco: busca la fila de cabecera (muchos bancos ponen antes el titular y la cuenta) con una columna de fecha,
 * otra de concepto y otra de importe (o dos: cargo y abono).
 */
export function leerCsvBanco(texto: string): Movimiento[] {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim())
  for (let i = 0; i < Math.min(lineas.length, 30); i++) {
    const sep = [';', ',', '\t'].find((s) => campos(lineas[i]!, s).length >= 3)
    if (!sep) continue
    const cab = campos(lineas[i]!, sep).map(normal)
    const col = (re: RegExp) => cab.findIndex((c) => re.test(c))
    const fecha = col(/^f(\.|echa)?\s*(de\s+)?(operacion|contable)?$|^fecha/)
    const concepto = col(/concepto|descripcion|movimiento|detalle/)
    const importe = col(/^importe|^cantidad|^importe\s*\(?eur/)
    const cargo = col(/^cargo|^debe/)
    const abono = col(/^abono|^haber/)
    if (fecha < 0 || concepto < 0 || (importe < 0 && (cargo < 0 || abono < 0))) continue
    return lineas.slice(i + 1).map((l, n) => {
      const c = campos(l, sep)
      try {
        const valor = importe >= 0 ? importeBanco(c[importe] ?? '')
          : (c[abono]?.trim() ? importeBanco(c[abono]!) : 0) - (c[cargo]?.trim() ? Math.abs(importeBanco(c[cargo]!)) : 0)
        return { fecha: fechaBanco(c[fecha] ?? ''), importe: valor, concepto: (c[concepto] ?? '').replace(/\s+/g, ' ').trim() }
      } catch (e) {
        throw new Error(`Línea ${i + n + 2}: ${(e as Error).message}`)
      }
    })
  }
  throw new Error('No encuentro las columnas de fecha, concepto e importe. Exporta el extracto en Norma 43 o en CSV con esas columnas.')
}

export function leerExtracto(datos: Uint8Array): Movimiento[] {
  const texto = decodificarExtracto(datos)
  const movimientos = esNorma43(texto) ? leerNorma43(texto) : leerCsvBanco(texto)
  if (!movimientos.length) throw new Error('El extracto no tiene movimientos.')
  return movimientos
}
