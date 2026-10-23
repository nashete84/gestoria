// Cuota de autónomos (RETA) por ingresos reales: tramos, base mínima y máxima y regularización.
// Fuente 2026: Orden PJC/297/2026, art. 18 (BOE-A-2026-7296). Las bases de 2026 son las mismas que en 2025.

import type { Centimos } from './money'

export interface TramoReta {
  /** Rendimiento neto mensual: hasta (incluido); null = sin límite. En céntimos. */
  hasta: Centimos | null
  baseMinima: Centimos
  baseMaxima: Centimos
  tabla: 'reducida' | 'general'
  numero: number
}

export interface ParametrosReta {
  ejercicio: number
  tramos: TramoReta[]
  /** Tipo total: contingencias comunes 28,30 + profesionales 1,30 + cese 0,90 + FP 0,10 + MEI. */
  tipo: number
  /** Gastos genéricos que se restan al rendimiento (art. 308 LGSS): 7 %, o 3 % si eres autónomo societario. */
  gastosGenericos: number
}

const e = (euros: number) => Math.round(euros * 100)
const TRAMOS: TramoReta[] = [
  [670, 653.59, 718.94], [900, 718.95, 900], [1166.69, 849.67, 1166.7],
  [1300, 950.98, 1300], [1500, 960.78, 1500], [1700, 960.78, 1700], [1850, 1143.79, 1850], [2030, 1209.15, 2030],
  [2330, 1274.51, 2330], [2760, 1356.21, 2760], [3190, 1437.91, 3190], [3620, 1519.61, 3620], [4050, 1601.31, 4050],
  [6000, 1732.03, 5101.2], [null, 1928.1, 5101.2]
].map(([hasta, min, max], i) => ({
  hasta: hasta === null ? null : e(hasta as number), baseMinima: e(min as number), baseMaxima: e(max as number),
  tabla: i < 3 ? 'reducida' : 'general', numero: i < 3 ? i + 1 : i - 2
}))

/** MEI: 0,8 % en 2025 y 0,9 % en 2026 (se queda en 0,9 % si no hay datos de un año posterior). */
const PARAMETROS: Record<number, ParametrosReta> = {
  2025: { ejercicio: 2025, tramos: TRAMOS.map((t) => (t.baseMaxima === e(5101.2) ? { ...t, baseMaxima: e(4909.5) } : t)), tipo: 31.4, gastosGenericos: 7 },
  2026: { ejercicio: 2026, tramos: TRAMOS, tipo: 31.5, gastosGenericos: 7 }
}

/** Parámetros del año; si no los hay, los del año más cercano disponible (y se avisa en la pantalla). */
export function parametrosReta(ejercicio: number): ParametrosReta & { aproximado: boolean } {
  if (PARAMETROS[ejercicio]) return { ...PARAMETROS[ejercicio]!, aproximado: false }
  const anios = Object.keys(PARAMETROS).map(Number)
  const cercano = anios.reduce((a, b) => (Math.abs(b - ejercicio) < Math.abs(a - ejercicio) ? b : a))
  return { ...PARAMETROS[cercano]!, aproximado: true }
}

/** Rendimiento neto mensual para la Seguridad Social: (ingresos − gastos + cuotas de autónomo) − gastos genéricos, entre 12. */
export function rendimientoMensualReta(ingresos: Centimos, gastos: Centimos, cuotas: Centimos, p: ParametrosReta, societario = false): Centimos {
  const anual = ingresos - gastos + cuotas
  const neto = Math.round(anual * (1 - (societario ? 3 : p.gastosGenericos) / 100))
  return Math.round(neto / 12)
}

export function tramoDe(rendimientoMensual: Centimos, p: ParametrosReta): TramoReta {
  return p.tramos.find((t) => t.hasta === null || rendimientoMensual <= t.hasta)!
}

export const cuotaDeBase = (base: Centimos, p: ParametrosReta): Centimos => Math.round((base * p.tipo) / 100)

export interface Regularizacion {
  tramo: TramoReta
  cuotaMinima: Centimos
  cuotaMaxima: Centimos
  /** Base con la que cotizas ahora (de tu cuota mensual), o null si no la sabemos. */
  baseActual: Centimos | null
  /** Positivo: te reclamarán; negativo: te devolverán. Por todo el año. */
  diferenciaAnual: Centimos
}

/**
 * Lo que pasará cuando la Seguridad Social compare tu base con tus ingresos reales: si cotizaste por debajo de la
 * base mínima de tu tramo, pagas la diferencia; si cotizaste por encima de la máxima, te la devuelven.
 */
export function regularizar(rendimientoMensual: Centimos, cuotaMensualActual: Centimos | null, p: ParametrosReta): Regularizacion {
  const tramo = tramoDe(rendimientoMensual, p)
  const baseActual = cuotaMensualActual ? Math.round((cuotaMensualActual * 100) / p.tipo) : null
  let diferenciaAnual = 0
  if (baseActual !== null) {
    if (baseActual < tramo.baseMinima) diferenciaAnual = cuotaDeBase(tramo.baseMinima - baseActual, p) * 12
    else if (baseActual > tramo.baseMaxima) diferenciaAnual = -cuotaDeBase(baseActual - tramo.baseMaxima, p) * 12
  }
  return { tramo, cuotaMinima: cuotaDeBase(tramo.baseMinima, p), cuotaMaxima: cuotaDeBase(tramo.baseMaxima, p), baseActual, diferenciaAnual }
}
