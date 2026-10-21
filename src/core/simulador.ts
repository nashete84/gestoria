// Simulador de IRPF: la renta del año con unos ingresos y gastos anuales que tú eliges,
// usando el mismo cálculo que la pestaña Renta (escalas, mínimos, reducciones y 5% de difícil justificación).

import { calcularRenta, type DatosRenta, type EstimacionRenta } from './renta/calculo'
import type { Gasto, Ingreso, Perfil } from './tipos'

export interface EntradaSimulador {
  /** Ingresos de la actividad en el año, sin IVA. */
  ingresos: number
  /** Gastos deducibles en el IRPF (ya con sus %), amortizaciones incluidas. */
  gastos: number
  /** Retenciones que te practican tus clientes en el año. */
  retenciones: number
  /** Pagos fraccionados (130) del año. */
  pagos130: number
}

export interface ResultadoSimulador {
  entrada: EntradaSimulador
  estimacion: EstimacionRenta
  /** IRPF total del año (cuota líquida). */
  irpf: number
  /** Lo que te queda: ingresos − gastos − IRPF. */
  neto: number
  /** IRPF extra por cada 1.000 € más de ingresos (incluye el efecto del 5% de difícil justificación). */
  porCadaMil: number
  /** El mismo dato en %: tu tipo marginal efectivo. */
  tipoMarginal: number
}

const MIL = 100_000

function renta(ejercicio: number, perfil: Perfil, datos: DatosRenta, e: EntradaSimulador): EstimacionRenta {
  const fecha = `${ejercicio}-06-30`
  const ingreso: Ingreso = {
    id: -1, fecha, clienteId: null, actividadId: null, concepto: 'Simulación', base: e.ingresos, tipoIva: 0, cuotaIva: 0,
    retencionPct: 0, cuotaRetencion: e.retenciones, operacion: 'nacional', facturaId: null, notas: ''
  }
  const gasto: Gasto = {
    id: -2, fecha, proveedor: 'Simulación', nifProveedor: '', paisProveedor: 'ES', numeroFactura: '', actividadId: null,
    concepto: 'Simulación', categoria: 'otros', base: e.gastos, tipoIva: 0, cuotaIva: 0, deduciblePctIrpf: 100, deduciblePctIva: 0,
    retencionPct: 0, cuotaRetencion: 0, operacion: 'sin_iva', bienInversion: false, notas: ''
  }
  return calcularRenta({ ejercicio, perfil, datos, pagos130: e.pagos130, ingresos: [ingreso], gastos: [gasto] })
}

export function validarSimulacion(e: EntradaSimulador): string[] {
  const errores: string[] = []
  for (const [k, nombre] of [['ingresos', 'Los ingresos'], ['gastos', 'Los gastos'], ['retenciones', 'Las retenciones'], ['pagos130', 'Los pagos del 130']] as const) {
    if (!Number.isInteger(e?.[k]) || e[k] < 0) errores.push(`${nombre} no son un importe válido.`)
  }
  return errores
}

export function simularIrpf(ejercicio: number, perfil: Perfil, datos: DatosRenta, e: EntradaSimulador): ResultadoSimulador {
  const estimacion = renta(ejercicio, perfil, datos, e)
  const mas = renta(ejercicio, perfil, datos, { ...e, ingresos: e.ingresos + MIL })
  const porCadaMil = mas.cuotaLiquida - estimacion.cuotaLiquida
  // Sin "no hay ingresos registrados": aquí los ingresos son los de la simulación.
  estimacion.avisos = estimacion.avisos.filter((a) => !a.startsWith('No hay ingresos registrados'))
  return {
    entrada: e, estimacion,
    irpf: estimacion.cuotaLiquida,
    neto: e.ingresos - e.gastos - estimacion.cuotaLiquida,
    porCadaMil,
    tipoMarginal: Math.round((porCadaMil / MIL) * 1000) / 10
  }
}
