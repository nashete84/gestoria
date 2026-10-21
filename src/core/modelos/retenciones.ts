// Modelos 111 (retenciones a profesionales) y 115 (retenciones por alquiler de locales):
// las retenciones que tú practicas en los gastos del trimestre.

import { periodoTrimestre, type Trimestre } from '../periodos'
import type { Gasto } from '../tipos'
import { suma, TRIMESTRES, type ResultadoModelo } from './tipos'

const CATEGORIA_ALQUILER = 'alquiler_local'

function conRetencion(gastos: Gasto[], ejercicio: number, trimestre: Trimestre, alquiler: boolean): Gasto[] {
  const { desde, hasta } = periodoTrimestre(ejercicio, trimestre)
  return gastos.filter((g) => g.fecha >= desde && g.fecha <= hasta && g.cuotaRetencion > 0
    && (g.categoria === CATEGORIA_ALQUILER) === alquiler)
}

/** Perceptores distintos: por NIF, o por nombre si no consta. */
const perceptores = (gs: Gasto[]) => new Set(gs.map((g) => (g.nifProveedor || g.proveedor).trim().toUpperCase())).size

function resultado(modelo: '111' | '115', ejercicio: number, trimestre: Trimestre, c: Record<string, number>, total: string, avisos: string[]): ResultadoModelo {
  const importe = c[total]!
  return {
    modelo, ejercicio, periodo: TRIMESTRES[trimestre - 1]!, casillas: c, resultado: importe,
    tipo: importe > 0 ? 'ingresar' : 'cero', sinActividad: importe === 0, avisos
  }
}

/** Modelo 111: rendimientos de actividades económicas dinerarios (casillas 07 a 09). */
export function calcular111(gastos: Gasto[], ejercicio: number, trimestre: Trimestre): ResultadoModelo {
  const gs = conRetencion(gastos, ejercicio, trimestre, false)
  const avisos = gs.some((g) => !g.nifProveedor) ? ['Hay gastos con retención sin NIF del proveedor: el 111 no lo pide, pero el resumen anual 190 sí.'] : []
  const c: Record<string, number> = {}
  if (gs.length) {
    c['07'] = perceptores(gs)
    c['08'] = suma(gs.map((g) => g.base))
    c['09'] = suma(gs.map((g) => g.cuotaRetencion))
  }
  c['28'] = c['09'] ?? 0
  c['29'] = 0
  c['30'] = c['28'] - c['29']
  return resultado('111', ejercicio, trimestre, c, '30', avisos)
}

/** Modelo 115: retenciones por alquiler de inmuebles urbanos (casillas 01 a 05). */
export function calcular115(gastos: Gasto[], ejercicio: number, trimestre: Trimestre): ResultadoModelo {
  const gs = conRetencion(gastos, ejercicio, trimestre, true)
  const c: Record<string, number> = {
    '01': perceptores(gs),
    '02': suma(gs.map((g) => g.base)),
    '03': suma(gs.map((g) => g.cuotaRetencion)),
    '04': 0
  }
  c['05'] = c['03']! - c['04']!
  return resultado('115', ejercicio, trimestre, c, '05', [])
}
