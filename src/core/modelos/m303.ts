// Modelo 303: autoliquidación trimestral del IVA (régimen general).
// Casillas según las instrucciones del ejercicio 2026 de la AEAT.

import { porcentaje } from '../money'
import { periodoTrimestre, type Trimestre } from '../periodos'
import type { Gasto, Ingreso } from '../tipos'
import { suma, TRIMESTRES, type AjustesModelos, type Casillas, type ResultadoModelo } from './tipos'

/** Casillas de IVA devengado por tipo: [base, tipo, cuota]. */
const POR_TIPO: Record<number, [string, string, string]> = {
  0: ['150', '151', '152'],
  4: ['01', '02', '03'],
  10: ['04', '05', '06'],
  21: ['07', '08', '09']
}

const enRango = (f: string, desde: string, hasta: string) => f >= desde && f <= hasta

/** Casillas 01 a 46 y la información adicional de un trimestre, sin compensaciones. */
export function casillasPeriodo303(ingresos: Ingreso[], gastos: Gasto[], avisos: string[]): Casillas {
  const c: Casillas = {}
  const sumar = (k: string, v: number) => { if (v) c[k] = (c[k] ?? 0) + v }

  // Devengado por operaciones interiores.
  for (const i of ingresos) {
    if (i.operacion === 'intracomunitaria') sumar('59', i.base)
    else if (i.operacion === 'no_sujeta') sumar('120', i.base)
    else {
      const casillas = POR_TIPO[i.tipoIva]
      if (!casillas) { avisos.push(`Ingreso del ${i.fecha} con un tipo de IVA del ${i.tipoIva}% que el 303 no recoge.`); continue }
      sumar(casillas[0], i.base)
      c[casillas[1]] = i.tipoIva * 100 // el tipo va en céntimos de punto: 21,00 → 2100
      sumar(casillas[2], i.cuotaIva)
    }
  }

  for (const g of gastos) {
    if (g.operacion === 'sin_iva') continue
    // Inversión del sujeto pasivo: te autoliquidas el IVA (devengado) y lo deduces.
    if (g.operacion === 'intracomunitaria') { sumar('10', g.base); sumar('11', g.cuotaIva) }
    if (g.operacion === 'extracomunitaria') { sumar('12', g.base); sumar('13', g.cuotaIva) }
    const base = porcentaje(g.base, g.deduciblePctIva)
    const cuota = porcentaje(g.cuotaIva, g.deduciblePctIva)
    if (!cuota) continue
    const [kb, kc] = g.operacion === 'intracomunitaria'
      ? (g.bienInversion ? ['38', '39'] : ['36', '37'])
      : (g.bienInversion ? ['30', '31'] : ['28', '29'])
    sumar(kb, base)
    sumar(kc, cuota)
  }

  c['27'] = suma(['152', '03', '06', '09', '11', '13'].map((k) => c[k] ?? 0))
  c['45'] = suma(['29', '31', '33', '35', '37', '39'].map((k) => c[k] ?? 0))
  c['46'] = c['27'] - c['45']
  return c
}

export interface Entrada303 {
  ejercicio: number
  trimestre: Trimestre
  /** Ingresos y gastos del ejercicio (se recorren los trimestres anteriores para las compensaciones). */
  ingresos: Ingreso[]
  gastos: Gasto[]
  ajustes: AjustesModelos
}

/** 303 del trimestre pedido, arrastrando las cuotas a compensar desde el 1T. */
export function calcular303(e: Entrada303): ResultadoModelo {
  let pendiente = e.ajustes.compensar303Inicial
  let r: ResultadoModelo | null = null
  for (let t = 1 as Trimestre; t <= e.trimestre; t = (t + 1) as Trimestre) {
    const avisos: string[] = []
    const { desde, hasta } = periodoTrimestre(e.ejercicio, t)
    const ingresos = e.ingresos.filter((i) => enRango(i.fecha, desde, hasta))
    const gastos = e.gastos.filter((g) => enRango(g.fecha, desde, hasta))
    const c = casillasPeriodo303(ingresos, gastos, avisos)

    c['64'] = c['46']!
    c['65'] = 10000 // 100,00 %: tributación solo en territorio común
    c['66'] = c['64']
    c['110'] = pendiente
    c['78'] = Math.min(pendiente, Math.max(0, c['66']))
    c['87'] = pendiente - c['78']
    c['69'] = c['66'] - c['78']
    c['71'] = c['69']

    const sinActividad = !ingresos.length && !gastos.some((g) => g.operacion !== 'sin_iva')
    let tipo: ResultadoModelo['tipo']
    if (c['71'] > 0) tipo = 'ingresar'
    else if (c['71'] === 0) tipo = 'cero'
    else if (t === 4 && e.ajustes.devolucion303) tipo = 'devolver'
    else tipo = 'compensar'

    if (tipo === 'compensar' && t === 4) avisos.push('El 4T sale negativo: lo dejas a compensar el año que viene. Puedes pedir la devolución en los ajustes.')
    // Lo que queda a compensar pasa al trimestre siguiente.
    pendiente = c['87'] + (tipo === 'compensar' ? -c['71'] : 0)
    if (tipo === 'compensar') c['72'] = -c['71']

    r = { modelo: '303', ejercicio: e.ejercicio, periodo: TRIMESTRES[t - 1]!, casillas: c, resultado: c['71'], tipo, sinActividad, avisos }
  }
  return r!
}
