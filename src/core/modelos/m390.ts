// Modelo 390: declaración-resumen anual del IVA (régimen general).
// Casillas según el diseño de registro del ejercicio 2025 (dr390e2025.xlsx): su numeración no coincide con la del 303.

import { porcentaje } from '../money'
import type { Gasto, Ingreso } from '../tipos'
import { calcular303, type Entrada303 } from './m303'
import { suma, type Casillas, type ResultadoModelo } from './tipos'

type Par = [string, string] // [base, cuota]

/** IVA devengado en operaciones interiores, por tipo. */
const DEVENGADO: Record<number, Par> = { 0: ['700', '701'], 4: ['01', '02'], 10: ['03', '04'], 21: ['05', '06'] }
/** Autoliquidado por compras intracomunitarias: bienes (los bienes de inversión) y servicios (el resto). */
const INTRA_BIENES: Record<number, Par> = { 0: ['716', '717'], 4: ['21', '22'], 10: ['23', '24'], 21: ['25', '26'] }
const INTRA_SERVICIOS: Record<number, Par> = { 0: ['720', '721'], 4: ['545', '546'], 10: ['547', '548'], 21: ['551', '552'] }
/** Deducible por tipo, y casillas de total de cada bloque. */
const DEDUCIBLE: Record<string, { tipos: Record<number, Par>; total: Par }> = {
  interiorCorriente: { tipos: { 4: ['190', '191'], 10: ['603', '604'], 21: ['605', '606'] }, total: ['48', '49'] },
  interiorInversion: { tipos: { 4: ['196', '197'], 10: ['611', '612'], 21: ['613', '614'] }, total: ['50', '51'] },
  intraInversion: { tipos: { 4: ['220', '221'], 10: ['631', '632'], 21: ['633', '634'] }, total: ['58', '59'] },
  intraServicios: { tipos: { 4: ['587', '588'], 10: ['635', '636'], 21: ['637', '638'] }, total: ['597', '598'] }
}

export function casillas390(ingresos: Ingreso[], gastos: Gasto[], avisos: string[]): Casillas {
  const c: Casillas = {}
  const sumar = (k: string, v: number) => { if (v) c[k] = (c[k] ?? 0) + v }
  const porTipo = (tabla: Record<number, Par>, tipo: number, base: number, cuota: number, que: string) => {
    const par = tabla[tipo]
    if (!par) { avisos.push(`${que} con un tipo de IVA del ${tipo}% que el 390 de la app no recoge.`); return false }
    sumar(par[0], base); sumar(par[1], cuota)
    return true
  }

  // Devengado y volumen de operaciones.
  for (const i of ingresos) {
    if (i.operacion === 'intracomunitaria') sumar('103', i.base)
    else if (i.operacion === 'no_sujeta') sumar('110', i.base)
    else if (porTipo(DEVENGADO, i.tipoIva, i.base, i.cuotaIva, `Ingreso del ${i.fecha}`)) {
      sumar('33', i.base); sumar('34', i.cuotaIva); sumar('99', i.base)
    }
  }

  for (const g of gastos) {
    if (g.operacion === 'sin_iva') continue
    // Inversión del sujeto pasivo: se autoliquida el IVA (devengado) y se deduce.
    if (g.operacion === 'intracomunitaria') {
      if (porTipo(g.bienInversion ? INTRA_BIENES : INTRA_SERVICIOS, g.tipoIva, g.base, g.cuotaIva, `Gasto del ${g.fecha}`)) {
        sumar('33', g.base); sumar('34', g.cuotaIva)
      }
    }
    if (g.operacion === 'extracomunitaria') { sumar('27', g.base); sumar('28', g.cuotaIva); sumar('33', g.base); sumar('34', g.cuotaIva) }

    const base = porcentaje(g.base, g.deduciblePctIva)
    const cuota = porcentaje(g.cuotaIva, g.deduciblePctIva)
    if (!cuota) continue
    const bloque = DEDUCIBLE[g.operacion === 'intracomunitaria'
      ? (g.bienInversion ? 'intraInversion' : 'intraServicios')
      : (g.bienInversion ? 'interiorInversion' : 'interiorCorriente')]!
    if (porTipo(bloque.tipos, g.tipoIva, base, cuota, `Gasto del ${g.fecha}`)) { sumar(bloque.total[0], base); sumar(bloque.total[1], cuota) }
  }

  c['33'] = c['33'] ?? 0
  c['34'] = c['34'] ?? 0
  c['47'] = c['34'] // sin recargo de equivalencia
  c['64'] = suma(Object.values(DEDUCIBLE).map((b) => c[b.total[1]] ?? 0))
  c['65'] = c['47'] - c['64']
  c['108'] = suma(['99', '103', '110'].map((k) => c[k] ?? 0))
  return c
}

export type Entrada390 = Omit<Entrada303, 'trimestre'>

/** 390 del ejercicio: suma del año y resultados de los cuatro 303 (casillas 95 a 98 y compensaciones). */
export function calcular390(e: Entrada390): ResultadoModelo {
  const avisos: string[] = []
  const c = casillas390(e.ingresos, e.gastos, avisos)
  const trimestres = ([1, 2, 3, 4] as const).map((trimestre) => calcular303({ ...e, trimestre }))
  const t4 = trimestres[3]!

  c['84'] = c['65']!
  // Compensación del año anterior aplicada en el año: se gasta antes que lo generado en el propio año.
  const aplicadas = suma(trimestres.map((r) => r.casillas['78'] ?? 0))
  c['85'] = Math.min(e.ajustes.compensar303Inicial, aplicadas)
  c['86'] = c['84'] - c['85']
  c['95'] = suma(trimestres.filter((r) => r.tipo === 'ingresar').map((r) => r.resultado))
  c['97'] = t4.tipo === 'compensar' ? -t4.resultado : 0
  c['98'] = t4.tipo === 'devolver' ? -t4.resultado : 0
  // Cuotas generadas en el año que siguen pendientes y no salen del 4T (casilla 97).
  c['662'] = Math.max(0, (t4.casillas['87'] ?? 0) - (e.ajustes.compensar303Inicial - c['85']))

  const cuadre = c['95'] - c['97'] - c['98'] - c['662']
  if (cuadre !== c['86']) {
    avisos.push(`El resultado anual (${c['86'] / 100} €) no cuadra con la suma de tus 303 (${cuadre / 100} €): revisa si algún gasto o ingreso cambió de trimestre después de presentarlo.`)
  }

  const sinActividad = !e.ingresos.length && !e.gastos.some((g) => g.operacion !== 'sin_iva')
  return {
    modelo: '390', ejercicio: e.ejercicio, periodo: '0A', casillas: c, resultado: c['86'],
    tipo: c['86'] > 0 ? 'ingresar' : c['86'] < 0 ? 'negativa' : 'cero', sinActividad, avisos
  }
}
