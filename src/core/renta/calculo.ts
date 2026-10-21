// Estimación del IRPF (modelo 100) de un autónomo en estimación directa simplificada.
// Función pura: recibe los datos del año y los parámetros, devuelve el desglose.
// Es una estimación orientativa: no sustituye al borrador de la AEAT.

import { actividadDe } from '../fiscalidad'
import { porcentaje, redondear, type Centimos } from '../money'
import type { Gasto, Ingreso, Perfil } from '../tipos'
import { parametrosDe, type MinimosPersonales, type ParametrosRenta, type Tramo } from './parametros'

export type GradoDiscapacidad = 0 | 33 | 65

export interface Descendiente {
  anioNacimiento: number
  /** Convive también con el otro progenitor: el mínimo se reparte al 50%. */
  compartido: boolean
  discapacidad?: GradoDiscapacidad
  /** Dependencia: necesita ayuda de terceros o tiene movilidad reducida. */
  asistencia?: boolean
}

/** Datos que no salen de la contabilidad y que rellena el usuario en la pestaña Renta. */
export interface DatosRenta {
  /** Rendimientos netos del trabajo y otras rentas de la base general (nóminas, alquileres...). */
  otrasRentasGenerales: Centimos
  /** Rentas del ahorro: intereses, dividendos, ganancias por venta de acciones o fondos. */
  rentasAhorro: Centimos
  /** Retenciones de esas otras rentas (nómina, banco...). */
  retencionesOtras: Centimos
  /** Otros pagos a cuenta no registrados en la pestaña Impuestos. */
  otrosPagosACuenta: Centimos
  aportacionesPensiones: Centimos
  /** Aportaciones a planes de pensiones de empleo simplificados para autónomos. */
  aportacionesPpes: Centimos
  anioNacimiento: number | null
  /** Tu grado de discapacidad: 0 (ninguna), 33 (33% a 64%) o 65 (65% o más). */
  discapacidad?: GradoDiscapacidad
  /** Necesitas ayuda de terceros o tienes movilidad reducida. */
  asistencia?: boolean
  descendientes: Descendiente[]
  /** Deducciones de la cuota (vivienda habitual antigua, donativos, autonómicas...). */
  deducciones: Centimos
  /** Cumple los requisitos del art. 32.2.2º (dependiente o único cliente, gastos ≤ 30%, ≥ 70% con retención). */
  autonomoDependiente: boolean
}

export const DATOS_RENTA_VACIOS: DatosRenta = {
  otrasRentasGenerales: 0, rentasAhorro: 0, retencionesOtras: 0, otrosPagosACuenta: 0,
  aportacionesPensiones: 0, aportacionesPpes: 0, anioNacimiento: null, discapacidad: 0, asistencia: false, descendientes: [],
  deducciones: 0, autonomoDependiente: false
}

export interface EntradaRenta {
  ejercicio: number
  perfil: Perfil
  /** Ingresos del ejercicio. */
  ingresos: Ingreso[]
  /** Gastos del ejercicio y bienes de inversión de años anteriores (para amortizarlos). */
  gastos: Gasto[]
  /** Pagos fraccionados del 130 del ejercicio marcados como presentados. */
  pagos130: Centimos
  datos: DatosRenta
}

export interface Amortizacion {
  gastoId: number
  concepto: string
  fecha: string
  actividadId: string
  valor: Centimos
  coeficiente: number
  acumuladaAnterior: Centimos
  delEjercicio: Centimos
  pendiente: Centimos
}

export interface RendimientoActividad {
  actividadId: string
  codigo: string
  descripcion: string
  ingresos: Centimos
  gastos: Centimos
  amortizaciones: Centimos
  rendimientoPrevio: Centimos
  dificilJustificacion: Centimos
  rendimientoNeto: Centimos
}

export interface EstimacionRenta {
  ejercicio: number
  comunidad: string
  actividades: RendimientoActividad[]
  amortizaciones: Amortizacion[]
  rendimientoActividades: Centimos
  reduccionActividad: Centimos
  tipoReduccion: 'dependiente' | 'rentas_bajas' | null
  rendimientoReducido: Centimos
  otrasRentasGenerales: Centimos
  baseImponibleGeneral: Centimos
  baseImponibleAhorro: Centimos
  reduccionPensiones: Centimos
  baseLiquidableGeneral: Centimos
  baseLiquidableAhorro: Centimos
  minimoEstatal: Centimos
  minimoAutonomico: Centimos
  cuotaEstatal: { general: Centimos; ahorro: Centimos }
  cuotaAutonomica: { general: Centimos; ahorro: Centimos }
  cuotaIntegra: Centimos
  deducciones: Centimos
  cuotaLiquida: Centimos
  retencionesActividad: Centimos
  retencionesOtras: Centimos
  pagos130: Centimos
  otrosPagosACuenta: Centimos
  /** Positivo: a pagar. Negativo: a devolver. */
  resultado: Centimos
  /** Cuota líquida sobre la suma de bases liquidables, en %. */
  tipoMedio: number
  avisos: string[]
}

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Cuota de una escala progresiva aplicada a una base (céntimos). */
export function aplicarEscala(escala: Tramo[], base: Centimos): Centimos {
  if (base <= 0) return 0
  let cuota = 0
  let desde = 0
  for (const t of escala) {
    const hasta = t.hasta ?? Infinity
    if (base > desde) cuota += ((Math.min(base, hasta) - desde) * t.tipo) / 100
    if (base <= hasta) break
    desde = hasta
  }
  return redondear(cuota)
}

/**
 * Mínimo por discapacidad: 3.000 € (≥ 33%) o 9.000 € (≥ 65%), más 3.000 € de gastos de asistencia
 * si el grado es ≥ 65% o necesita ayuda de terceros o tiene movilidad reducida (art. 60 LIRPF).
 */
function minimoDiscapacidad(m: MinimosPersonales, grado: GradoDiscapacidad | undefined, asistencia: boolean | undefined): Centimos {
  if (!grado) return 0
  const base = grado >= 65 ? m.discapacidad.grado65 : m.discapacidad.grado33
  return base + (grado >= 65 || asistencia ? m.discapacidad.asistencia : 0)
}

/** Mínimo personal y familiar con la edad a 31 de diciembre del ejercicio. */
export function minimoPersonalFamiliar(m: MinimosPersonales, ejercicio: number, d: DatosRenta): Centimos {
  let total = m.contribuyente + minimoDiscapacidad(m, d.discapacidad, d.asistencia)
  if (d.anioNacimiento) {
    const edad = ejercicio - d.anioNacimiento
    if (edad >= 65) total += m.mayor65
    if (edad >= 75) total += m.mayor75
  }
  // Descendientes menores de 25 años, o de cualquier edad con discapacidad, del mayor al menor (el orden decide el importe).
  const hijos = d.descendientes
    .filter((h) => h.anioNacimiento <= ejercicio && (ejercicio - h.anioNacimiento < 25 || (h.discapacidad ?? 0) > 0))
    .sort((a, b) => a.anioNacimiento - b.anioNacimiento)
  hijos.forEach((h, i) => {
    let importe = m.descendientes[Math.min(i, 3)]!
    if (ejercicio - h.anioNacimiento < 3) importe += m.descendienteMenor3
    importe += minimoDiscapacidad(m, h.discapacidad, h.asistencia)
    total += h.compartido ? redondear(importe / 2) : importe
  })
  return total
}

function diasDelAnio(anio: number) {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0 ? 366 : 365
}

const dia = (f: string) => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)))

/** Fracción del año `anio` entre `desde` (o el 1 de enero) y `hasta` (o el 31 de diciembre), ambos incluidos. */
function fraccionAnio(anio: number, desde: string, hasta: string): number {
  const inicio = Math.max(dia(desde), Date.UTC(anio, 0, 1))
  const fin = Math.min(dia(hasta), Date.UTC(anio, 11, 31))
  return fin < inicio ? 0 : (Math.round((fin - inicio) / 86400000) + 1) / diasDelAnio(anio)
}

/**
 * Amortización lineal al coeficiente máximo de la tabla simplificada, prorrateada por días.
 * `hasta` permite calcular solo una parte del ejercicio (pagos fraccionados del 130).
 */
export function amortizar(g: Gasto, ejercicio: number, p: ParametrosRenta, actividadId: string, hasta = `${ejercicio}-12-31`): Amortizacion | null {
  const anioCompra = Number(g.fecha.slice(0, 4))
  if (!g.bienInversion || anioCompra > ejercicio || g.fecha > hasta) return null
  const valor = porcentaje(g.base, g.deduciblePctIrpf)
  const coeficiente = p.amortizacion[g.categoria] ?? p.amortizacionDefecto
  const anual = (valor * coeficiente) / 100
  let acumulada = 0
  let delEjercicio = 0
  for (let anio = anioCompra; anio <= ejercicio; anio++) {
    const fin = anio === ejercicio ? hasta : `${anio}-12-31`
    const cuota = Math.min(valor - acumulada, redondear(anual * fraccionAnio(anio, g.fecha, fin)))
    if (anio === ejercicio) delEjercicio = cuota
    else acumulada += cuota
  }
  if (valor - acumulada <= 0) return null
  return {
    gastoId: g.id, concepto: g.concepto || g.proveedor, fecha: g.fecha, actividadId,
    valor, coeficiente, acumuladaAnterior: acumulada, delEjercicio, pendiente: valor - acumulada - delEjercicio
  }
}

export interface EntradaRendimiento {
  perfil: Perfil
  ejercicio: number
  /** Último día incluido (31 de diciembre para la renta, fin del trimestre para el 130). */
  hasta: string
  ingresos: Ingreso[]
  gastos: Gasto[]
  /** Sin el 5% de difícil justificación (autónomo dependiente). */
  sinDificilJustificacion: boolean
}

/** Rendimiento neto de cada actividad del 1 de enero a `hasta`, con amortizaciones y el 5% de difícil justificación. */
export function calcularRendimientos(e: EntradaRendimiento, p: ParametrosRenta): { actividades: RendimientoActividad[]; amortizaciones: Amortizacion[] } {
  const { perfil, ejercicio, hasta } = e
  const desde = `${ejercicio}-01-01`
  const idDe = (actividadId: string | null) => actividadDe(perfil, actividadId).id
  const enPeriodo = (f: string) => f >= desde && f <= hasta
  const ingresos = e.ingresos.filter((i) => enPeriodo(i.fecha))
  const corrientes = e.gastos.filter((g) => enPeriodo(g.fecha) && !g.bienInversion)
  const amortizaciones = e.gastos
    .map((g) => amortizar(g, ejercicio, p, idDe(g.actividadId), hasta))
    .filter((a): a is Amortizacion => a !== null)

  // Rendimiento por actividad (en el modelo 100 cada actividad va por separado).
  const actividades: RendimientoActividad[] = perfil.actividades.map((a) => {
    const ing = suma(ingresos.filter((i) => idDe(i.actividadId) === a.id).map((i) => i.base))
    const gas = suma(corrientes.filter((g) => idDe(g.actividadId) === a.id).map((g) => porcentaje(g.base, g.deduciblePctIrpf)))
    const amo = suma(amortizaciones.filter((x) => x.actividadId === a.id).map((x) => x.delEjercicio))
    const previo = ing - gas - amo
    const dificil = e.sinDificilJustificacion || previo <= 0 ? 0 : porcentaje(previo, p.dificilJustificacion.pct)
    return {
      actividadId: a.id, codigo: a.codigo, descripcion: a.descripcion,
      ingresos: ing, gastos: gas, amortizaciones: amo, rendimientoPrevio: previo,
      dificilJustificacion: dificil, rendimientoNeto: previo - dificil
    }
  })
  // El límite del 5% es para el conjunto de actividades: si se supera, se reparte en proporción.
  const totalDificil = suma(actividades.map((a) => a.dificilJustificacion))
  if (totalDificil > p.dificilJustificacion.maximo) {
    let restante = p.dificilJustificacion.maximo
    actividades.forEach((a, i) => {
      const parte = i === actividades.length - 1 ? restante : redondear((a.dificilJustificacion * p.dificilJustificacion.maximo) / totalDificil)
      restante -= parte
      a.dificilJustificacion = parte
      a.rendimientoNeto = a.rendimientoPrevio - parte
    })
  }
  return { actividades, amortizaciones }
}

export function calcularRenta(e: EntradaRenta, parametros: ParametrosRenta = parametrosDe(e.ejercicio)): EstimacionRenta {
  const { ejercicio, perfil, datos: d } = e
  const p = parametros
  const avisos = [...p.avisos]
  const anio = String(ejercicio)
  const ingresos = e.ingresos.filter((i) => i.fecha.startsWith(anio))
  const { actividades, amortizaciones } = calcularRendimientos({
    perfil, ejercicio, hasta: `${ejercicio}-12-31`, ingresos: e.ingresos, gastos: e.gastos, sinDificilJustificacion: d.autonomoDependiente
  }, p)
  if (d.autonomoDependiente) avisos.push('Con la reducción de autónomo dependiente no se aplica el 5% de gastos de difícil justificación.')

  const rendimientoActividades = suma(actividades.map((a) => a.rendimientoNeto))

  // Reducciones del art. 32.2 LIRPF.
  let reduccion = 0
  let tipoReduccion: EstimacionRenta['tipoReduccion'] = null
  if (rendimientoActividades > 0) {
    if (d.autonomoDependiente) {
      const r = p.reduccionDependiente
      let adicional = 0
      if (d.otrasRentasGenerales + d.rentasAhorro <= r.maxOtrasRentas) {
        if (rendimientoActividades <= r.umbral) adicional = r.importe
        else if (rendimientoActividades < r.limiteSuperior) adicional = Math.max(0, redondear(r.importe - r.coeficiente * (rendimientoActividades - r.umbral)))
      }
      reduccion = r.fija + adicional
      tipoReduccion = 'dependiente'
    } else {
      const r = p.reduccionRentasBajas
      const rentas = rendimientoActividades + d.otrasRentasGenerales + d.rentasAhorro
      if (rentas < r.limiteRentas) {
        reduccion = rentas <= r.umbral ? r.importe : Math.max(0, redondear(r.importe - r.coeficiente * (rentas - r.umbral)))
        tipoReduccion = reduccion > 0 ? 'rentas_bajas' : null
      }
    }
    reduccion = Math.min(reduccion, rendimientoActividades)
  }
  const rendimientoReducido = rendimientoActividades - reduccion

  const baseImponibleGeneral = rendimientoReducido + d.otrasRentasGenerales
  const baseImponibleAhorro = d.rentasAhorro
  if (baseImponibleAhorro < 0) avisos.push('Las pérdidas del ahorro no se compensan en esta estimación.')

  // Planes de pensiones: límites absolutos y un % de los rendimientos netos del trabajo y de actividades.
  const pp = p.pensiones
  const aportado = Math.min(d.aportacionesPensiones, pp.limite) + Math.min(d.aportacionesPpes, pp.limiteAutonomos)
  const topePct = porcentaje(Math.max(0, rendimientoReducido + d.otrasRentasGenerales), pp.pctRendimientos)
  const reduccionPensiones = Math.max(0, Math.min(aportado, topePct, Math.max(0, baseImponibleGeneral)))

  const baseLiquidableGeneral = Math.max(0, baseImponibleGeneral - reduccionPensiones)
  const baseLiquidableAhorro = Math.max(0, baseImponibleAhorro)

  const autonomica = p.escalasAutonomicas[perfil.comunidad]
  if (!autonomica) avisos.push(`No hay escala autonómica para ${perfil.comunidad}: la parte autonómica no se ha calculado.`)

  const minimoEstatal = minimoPersonalFamiliar(p.minimosEstatales, ejercicio, d)
  const minimoAutonomico = autonomica ? minimoPersonalFamiliar(autonomica.minimos, ejercicio, d) : 0

  // El mínimo se aplica primero a la base general y lo que sobre, a la del ahorro.
  const cuotas = (general: Tramo[], ahorro: Tramo[], minimo: Centimos) => {
    const enGeneral = Math.min(minimo, baseLiquidableGeneral)
    const enAhorro = Math.min(minimo - enGeneral, baseLiquidableAhorro)
    return {
      general: Math.max(0, aplicarEscala(general, baseLiquidableGeneral) - aplicarEscala(general, enGeneral)),
      ahorro: Math.max(0, aplicarEscala(ahorro, baseLiquidableAhorro) - aplicarEscala(ahorro, enAhorro))
    }
  }
  const cuotaEstatal = cuotas(p.escalaGeneralEstatal, p.escalaAhorroEstatal, minimoEstatal)
  const cuotaAutonomica = autonomica ? cuotas(autonomica.general, autonomica.ahorro, minimoAutonomico) : { general: 0, ahorro: 0 }
  const cuotaIntegra = cuotaEstatal.general + cuotaEstatal.ahorro + cuotaAutonomica.general + cuotaAutonomica.ahorro
  const deducciones = Math.min(d.deducciones, cuotaIntegra)
  const cuotaLiquida = cuotaIntegra - deducciones

  const retencionesActividad = suma(ingresos.map((i) => i.cuotaRetencion))
  const resultado = cuotaLiquida - retencionesActividad - d.retencionesOtras - e.pagos130 - d.otrosPagosACuenta
  const bases = baseLiquidableGeneral + baseLiquidableAhorro

  if (!ingresos.length) avisos.push(`No hay ingresos registrados en ${ejercicio}.`)

  return {
    ejercicio,
    comunidad: autonomica?.nombre ?? perfil.comunidad,
    actividades, amortizaciones,
    rendimientoActividades, reduccionActividad: reduccion, tipoReduccion, rendimientoReducido,
    otrasRentasGenerales: d.otrasRentasGenerales,
    baseImponibleGeneral, baseImponibleAhorro, reduccionPensiones, baseLiquidableGeneral, baseLiquidableAhorro,
    minimoEstatal, minimoAutonomico, cuotaEstatal, cuotaAutonomica, cuotaIntegra, deducciones, cuotaLiquida,
    retencionesActividad, retencionesOtras: d.retencionesOtras, pagos130: e.pagos130, otrosPagosACuenta: d.otrosPagosACuenta,
    resultado,
    tipoMedio: bases > 0 ? Math.round((cuotaLiquida / bases) * 10000) / 100 : 0,
    avisos
  }
}

const gradoValido = (g: unknown) => g === undefined || g === 0 || g === 33 || g === 65

export function validarDatosRenta(d: DatosRenta, ejercicio: number): string[] {
  const e: string[] = []
  const importes: (keyof DatosRenta)[] = ['rentasAhorro', 'retencionesOtras', 'otrosPagosACuenta', 'aportacionesPensiones', 'aportacionesPpes', 'deducciones']
  if (!Number.isInteger(d.otrasRentasGenerales)) e.push('Las otras rentas generales no son un importe válido.')
  for (const k of importes) {
    const v = d[k]
    if (!Number.isInteger(v) || (k !== 'rentasAhorro' && (v as number) < 0)) e.push(`El importe de "${k}" no es válido.`)
  }
  const anioValido = (a: unknown) => Number.isInteger(a) && (a as number) >= 1900 && (a as number) <= ejercicio
  if (d.anioNacimiento !== null && !anioValido(d.anioNacimiento)) e.push('El año de nacimiento no es válido.')
  if (!Array.isArray(d.descendientes) || d.descendientes.length > 20) e.push('La lista de hijos no es válida.')
  else if (d.descendientes.some((h) => !anioValido(h.anioNacimiento) || typeof h.compartido !== 'boolean')) {
    e.push('Revisa el año de nacimiento de los hijos.')
  } else if (d.descendientes.some((h) => !gradoValido(h.discapacidad) || (h.asistencia !== undefined && typeof h.asistencia !== 'boolean'))) {
    e.push('Revisa la discapacidad de los hijos.')
  }
  if (!gradoValido(d.discapacidad) || (d.asistencia !== undefined && typeof d.asistencia !== 'boolean')) e.push('El grado de discapacidad no es válido.')
  if (typeof d.autonomoDependiente !== 'boolean') e.push('Valor no válido para autónomo dependiente.')
  return e
}
