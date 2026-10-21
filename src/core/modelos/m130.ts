// Modelo 130: pago fraccionado del IRPF en estimación directa. Los importes son acumulados del 1 de enero
// al final del trimestre; se restan los pagos de los trimestres anteriores del mismo año.

import { porcentaje } from '../money'
import { periodoTrimestre, type Trimestre } from '../periodos'
import { calcularRendimientos } from '../renta/calculo'
import { parametrosDe, type ParametrosRenta } from '../renta/parametros'
import type { Gasto, Ingreso, Perfil } from '../tipos'
import { suma, TRIMESTRES, type ResultadoModelo } from './tipos'

export interface Entrada130 {
  perfil: Perfil
  ejercicio: number
  trimestre: Trimestre
  ingresos: Ingreso[]
  /** Gastos del ejercicio y bienes de inversión de años anteriores (amortizaciones). */
  gastos: Gasto[]
  /** Rendimiento neto de actividades del año anterior; null si no se conoce (no se aplica la minoración). */
  rendimientoAnterior: number | null
  /** Autónomo dependiente: sin el 5% de gastos de difícil justificación. */
  sinDificilJustificacion: boolean
}

export function minoracion130(p: ParametrosRenta, rendimientoAnterior: number): number {
  return p.minoracion130.find((t) => rendimientoAnterior <= t.hasta)?.importe ?? 0
}

export function calcular130(e: Entrada130, p: ParametrosRenta = parametrosDe(e.ejercicio)): ResultadoModelo {
  let pagosAnteriores = 0 // suma de casillas 07 positivas de trimestres anteriores
  let negativosPendientes = 0 // resultados negativos (casilla 19) aún no deducidos
  let r: ResultadoModelo | null = null

  for (let t = 1 as Trimestre; t <= e.trimestre; t = (t + 1) as Trimestre) {
    const avisos: string[] = []
    const { hasta } = periodoTrimestre(e.ejercicio, t)
    const { actividades } = calcularRendimientos({
      perfil: e.perfil, ejercicio: e.ejercicio, hasta, ingresos: e.ingresos, gastos: e.gastos,
      sinDificilJustificacion: e.sinDificilJustificacion
    }, p)
    const c: Record<string, number> = {}
    c['01'] = suma(actividades.map((a) => a.ingresos))
    c['02'] = suma(actividades.map((a) => a.gastos + a.amortizaciones + a.dificilJustificacion))
    c['03'] = c['01'] - c['02']
    c['04'] = c['03'] > 0 ? porcentaje(c['03'], p.pct130) : 0
    c['05'] = pagosAnteriores
    c['06'] = suma(e.ingresos.filter((i) => i.fecha >= `${e.ejercicio}-01-01` && i.fecha <= hasta).map((i) => i.cuotaRetencion))
    c['07'] = c['04'] - c['05'] - c['06']
    c['12'] = Math.max(0, c['07'])
    if (e.rendimientoAnterior === null) {
      avisos.push('No se conoce el rendimiento del año anterior: no se aplica la minoración de la casilla 13.')
      c['13'] = 0
    } else {
      c['13'] = minoracion130(p, e.rendimientoAnterior)
    }
    c['14'] = c['12'] - c['13']
    c['15'] = c['14'] > 0 ? Math.min(negativosPendientes, c['14']) : 0
    negativosPendientes -= c['15']
    c['16'] = 0
    c['17'] = c['14'] - c['15'] - c['16']
    c['18'] = 0
    c['19'] = c['17'] - c['18']

    if (c['07'] > 0) pagosAnteriores += c['07']
    let tipo: ResultadoModelo['tipo']
    if (c['19'] > 0) tipo = 'ingresar'
    else if (c['19'] < 0 && t < 4) { tipo = 'compensar'; negativosPendientes += -c['19'] }
    else tipo = t === 4 && c['19'] < 0 ? 'negativa' : 'cero'

    const sinActividad = c['01'] === 0 && c['02'] === 0
    r = { modelo: '130', ejercicio: e.ejercicio, periodo: TRIMESTRES[t - 1]!, casillas: c, resultado: c['19'], tipo, sinActividad, avisos }
  }
  return r!
}
