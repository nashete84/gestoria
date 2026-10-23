// Previsión de ingresos hasta fin de año a partir de tu ritmo reciente: la media de los últimos meses completos.
// Con esa previsión se estima el IRPF del año con el simulador.

import { porcentaje } from './money'
import type { DatosRenta } from './renta/calculo'
import { simularIrpf, type ResultadoSimulador } from './simulador'
import type { Gasto, Ingreso, Perfil } from './tipos'

/** Meses completos que se promedian para la previsión. */
export const MESES_MEDIA = 6

export interface MesPrevision {
  mes: number
  /** Lo registrado (null en los meses que aún no han empezado). */
  real: number | null
  /** Lo que se espera añadir en el mes (null en los meses ya cerrados). */
  previsto: number | null
}

export interface Prevision {
  ejercicio: number
  meses: MesPrevision[]
  /** Media mensual de ingresos y de gastos deducibles de los meses usados. */
  mediaIngresos: number
  mediaGastos: number
  /** Cuántos meses completos se han promediado (menos de 6 si el alta es reciente). */
  mesesBase: number
  ingresosReales: number
  ingresosPrevistos: number
  /** Ingresos del año: reales + previstos. */
  ingresosAnio: number
  gastosAnio: number
  /** IRPF del año con la previsión. */
  simulacion: ResultadoSimulador
  /** IRPF que falta por pagar: el del año menos retenciones y 130 ya pagados (lo cubrirán los próximos 130 y la renta). */
  irpfPendiente: number
  /** Si presentas el 130 (perfil): sin él, lo que falta se paga todo en la renta. */
  presenta130: boolean
  avisos: string[]
}

export interface EntradaPrevision {
  ejercicio: number
  hoy: string
  perfil: Perfil
  datos: DatosRenta
  /** Ingresos y gastos desde el año anterior (para la media de los primeros meses del año). */
  ingresos: Ingreso[]
  gastos: Gasto[]
  /** Gastos deducibles del año ya registrados, con amortizaciones (de la estimación de la renta). */
  gastosDeduciblesReales: number
  pagos130: number
}

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const claveMes = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, '0')}`

export function preverIngresos(e: EntradaPrevision): Prevision {
  const avisos: string[] = []
  const anioHoy = Number(e.hoy.slice(0, 4))
  // Mes en curso: los anteriores están cerrados. Si el año ya terminó, todos cerrados.
  const mesActual = e.ejercicio < anioHoy ? 13 : e.ejercicio > anioHoy ? 1 : Number(e.hoy.slice(5, 7))

  // Meses completos para la media: los 6 anteriores al actual, sin contar los anteriores al alta.
  const alta = e.perfil.fechaAlta.slice(0, 7)
  const base: string[] = []
  for (let i = 1; i <= MESES_MEDIA; i++) {
    const d = new Date(Date.UTC(e.ejercicio, Math.min(mesActual, 13) - 1 - i, 1))
    const k = claveMes(d.getUTCFullYear(), d.getUTCMonth() + 1)
    if (k >= alta) base.push(k)
  }
  const deMes = <T extends { fecha: string }>(xs: T[], k: string) => xs.filter((x) => x.fecha.startsWith(k))
  const mesesBase = base.length
  const mediaIngresos = mesesBase ? Math.round(suma(base.map((k) => suma(deMes(e.ingresos, k).map((i) => i.base)))) / mesesBase) : 0
  const corrientes = e.gastos.filter((g) => !g.bienInversion)
  const mediaGastos = mesesBase ? Math.round(suma(base.map((k) => suma(deMes(corrientes, k).map((g) => porcentaje(g.base, g.deduciblePctIrpf))))) / mesesBase) : 0
  if (mesActual <= 12 && mesesBase < 3) avisos.push(`La previsión se basa en solo ${mesesBase} mes(es) completo(s): tómala con cautela.`)

  const meses: MesPrevision[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const real = suma(deMes(e.ingresos, claveMes(e.ejercicio, m)).map((x) => x.base))
    if (m < mesActual) return { mes: m, real, previsto: null }
    if (m === mesActual) return { mes: m, real, previsto: Math.max(0, mediaIngresos - real) } // lo que falta para llegar a la media
    return { mes: m, real: null, previsto: mediaIngresos }
  })
  const ingresosReales = suma(meses.map((m) => m.real ?? 0))
  const ingresosPrevistos = suma(meses.map((m) => m.previsto ?? 0))
  const mesesRestantes = Math.max(0, 12 - mesActual + 1)
  const gastoMesActual = suma(deMes(corrientes, claveMes(e.ejercicio, mesActual)).map((g) => porcentaje(g.base, g.deduciblePctIrpf)))
  const gastosPrevistos = mesesRestantes ? Math.max(0, mediaGastos - gastoMesActual) + mediaGastos * (mesesRestantes - 1) : 0

  // Retenciones: el mismo % sobre ingresos que llevas este año.
  const delAnio = e.ingresos.filter((i) => i.fecha.startsWith(`${e.ejercicio}-`))
  const retencionesReales = suma(delAnio.map((i) => i.cuotaRetencion))
  const pctRetencion = ingresosReales > 0 ? retencionesReales / ingresosReales : 0
  const ingresosAnio = ingresosReales + ingresosPrevistos
  const gastosAnio = e.gastosDeduciblesReales + gastosPrevistos

  const simulacion = simularIrpf(e.ejercicio, e.perfil, e.datos, {
    ingresos: ingresosAnio,
    gastos: gastosAnio,
    retenciones: retencionesReales + Math.round(ingresosPrevistos * pctRetencion),
    pagos130: e.pagos130
  })
  const irpfPendiente = Math.max(0, simulacion.irpf - retencionesReales - e.pagos130 - e.datos.retencionesOtras - e.datos.otrosPagosACuenta)
  avisos.push(...simulacion.estimacion.avisos)

  return {
    ejercicio: e.ejercicio, meses, mediaIngresos, mediaGastos, mesesBase,
    ingresosReales, ingresosPrevistos, ingresosAnio, gastosAnio, simulacion, irpfPendiente, presenta130: !e.perfil.exento130, avisos
  }
}
