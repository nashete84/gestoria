// Propuesta para cada movimiento del banco: cobro de un ingreso pendiente, gasto ya registrado, gasto nuevo o ignorar.

import { importeACobrar } from '../cobros'
import type { Gasto, Ingreso } from '../tipos'
import type { Movimiento } from './lectura'

export type Accion =
  | { tipo: 'cobro'; ingresoId: number }
  | { tipo: 'ya_registrado'; gastoId: number }
  | { tipo: 'crear_gasto'; categoria: string }
  | { tipo: 'ignorar' }

export interface Propuesta {
  movimiento: Movimiento
  /** Identifica el movimiento para no importarlo dos veces. */
  clave: string
  /** Ya se importó en otro extracto: se ignora. */
  repetido: boolean
  accion: Accion
  /** Por qué se propone esto, para mostrarlo. */
  motivo: string
}

const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const fechaEs = (f: string) => f.split('-').reverse().join('/')
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Categoría por palabras del concepto; null si no se reconoce (mejor no crear gastos personales). */
const PALABRAS: [string, RegExp][] = [
  ['cuota_autonomo', /seguridad social|tgss|\breta\b|autonomos?\b/],
  ['bancos', /comision|mantenimiento de? cuenta/],
  ['telefono_internet', /movistar|telefonica|vodafone|orange|\bdigi\b|pepephone|masmovil|yoigo|jazztel|simyo|lowi|finetwork/],
  ['suministros_vivienda', /iberdrola|endesa|naturgy|holaluz|canal de isabel|\baguas?\b|totalenergies|octopus/],
  ['seguros', /seguro|mapfre|\baxa\b|sanitas|adeslas|allianz|generali|\bdkv\b|mutua/],
  ['profesionales', /gestoria|asesor|declarando|abogad|notari/],
  ['coworking', /cowork/],
  ['software', /google|microsoft|adobe|github|apple\.com|\baws\b|amazon web|openai|anthropic|notion|slack|figma|jetbrains|dropbox|zoom/],
  ['formacion', /udemy|coursera|platzi|domestika|casa del libro|o'?reilly/]
]
/** Cargos que no son gastos de la actividad: impuestos, traspasos, tarjeta. */
const NO_GASTO = /agencia tributaria|\baeat\b|hacienda|impuesto|traspaso|transferencia (a|emitida)|liquidacion tarjeta|reintegro|cajero/

export function categoriaDeConcepto(concepto: string): string | null {
  const c = normal(concepto)
  if (NO_GASTO.test(c)) return null
  return PALABRAS.find(([, re]) => re.test(c))?.[0] ?? null
}

/** Clave estable: fecha, importe y concepto, más el número de repetición dentro del mismo extracto. */
export function clavesMovimientos(movimientos: Movimiento[]): string[] {
  const vistos = new Map<string, number>()
  return movimientos.map((m) => {
    const base = `${m.fecha}|${m.importe}|${normal(m.concepto).replace(/\s+/g, ' ')}`
    const n = (vistos.get(base) ?? 0) + 1
    vistos.set(base, n)
    return `${base}|${n}`
  })
}

export function proponer(movimientos: Movimiento[], e: { pendientes: Ingreso[]; gastos: Gasto[]; importados: Set<string> }): Propuesta[] {
  const claves = clavesMovimientos(movimientos)
  const ingresosUsados = new Set<number>()
  const gastosUsados = new Set<number>()
  return movimientos.map((m, i): Propuesta => {
    const clave = claves[i]!
    if (e.importados.has(clave)) return { movimiento: m, clave, repetido: true, accion: { tipo: 'ignorar' }, motivo: 'Ya importado en otro extracto.' }
    if (m.importe > 0) {
      // Cobro: ingreso pendiente por el mismo importe, emitido antes del cobro (hasta 6 meses).
      const candidato = e.pendientes
        .filter((x) => !ingresosUsados.has(x.id) && importeACobrar(x) === m.importe && dias(x.fecha, m.fecha) >= -3 && dias(x.fecha, m.fecha) <= 180)
        .sort((a, b) => Math.abs(dias(a.fechaVencimiento ?? a.fecha, m.fecha)) - Math.abs(dias(b.fechaVencimiento ?? b.fecha, m.fecha)))[0]
      if (candidato) {
        ingresosUsados.add(candidato.id)
        return { movimiento: m, clave, repetido: false, accion: { tipo: 'cobro', ingresoId: candidato.id }, motivo: `Mismo importe que "${candidato.concepto}" del ${fechaEs(candidato.fecha)}, pendiente de cobro.` }
      }
      return { movimiento: m, clave, repetido: false, accion: { tipo: 'ignorar' }, motivo: 'No hay ningún ingreso pendiente por este importe. Si es de tu actividad, regístralo en Ingresos.' }
    }
    // Cargo: gasto ya registrado por lo mismo que se paga (base + IVA − retención), con hasta 10 días de diferencia.
    const pagado = -m.importe
    const existente = e.gastos.find((g) => !gastosUsados.has(g.id) && g.base + g.cuotaIva - g.cuotaRetencion === pagado && Math.abs(dias(g.fecha, m.fecha)) <= 10)
    if (existente) {
      gastosUsados.add(existente.id)
      return { movimiento: m, clave, repetido: false, accion: { tipo: 'ya_registrado', gastoId: existente.id }, motivo: `Ya está registrado: "${existente.concepto}" del ${fechaEs(existente.fecha)}.` }
    }
    const categoria = categoriaDeConcepto(m.concepto)
    if (categoria) return { movimiento: m, clave, repetido: false, accion: { tipo: 'crear_gasto', categoria }, motivo: 'Parece un gasto de la actividad por el concepto. Revisa la categoría.' }
    return { movimiento: m, clave, repetido: false, accion: { tipo: 'ignorar' }, motivo: NO_GASTO.test(normal(m.concepto)) ? 'Pago de impuestos o traspaso: no es un gasto.' : 'No lo reconozco: si es de tu actividad, elige "Crear gasto".' }
  })
}
