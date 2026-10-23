// Libros registro del IRPF (ventas e ingresos; compras y gastos) con las columnas del formato común de la AEAT,
// las mismas que exporta Declarando. Sale en Excel (lo que admite la Sede) y en CSV.

import { ambitoDePais, actividadDe } from './fiscalidad'
import { porcentaje } from './money'
import type { Cliente, Gasto, Ingreso, Perfil, SeccionIae } from './tipos'
import type { Celda, Hoja } from './xlsx'

export const COLUMNAS_INGRESOS = [
  'Ejercicio', 'Periodo', 'Código de actividad', 'Tipo de actividad', 'IAE', 'Tipo de factura', 'Concepto Ingreso', 'Ingreso computable',
  'Fecha expedición', 'Fecha operación', 'Número de la factura', 'Tipo CIF del cliente', 'CIF del cliente', 'Nombre del cliente',
  'Clave operación', 'Calificacion operación', 'Operación exenta', 'Total de la factura', 'Base imponible', 'Tipo de IVA',
  'Cuota repercutida', 'Tipo de recargo', 'Cuota recargo', 'Tipo IRPF', 'Cuota IRPF'
] as const

export const COLUMNAS_GASTOS = [
  'Ejercicio', 'Periodo', 'Código de actividad', 'Tipo de actividad', 'IAE', 'Tipo de factura', 'Concepto del Gasto', 'Número de recepción',
  'Gasto deducible', 'Número de la factura', 'Fecha de recepción', 'NIF del proveedor', 'Nombre del proveedor', 'Clave de la operación',
  'Base imponible', 'Tipo de IVA (%)', 'Cuota soportada', 'Cuota deducible', 'Tipo de recargo', 'Importe del recargo', 'Total factura', 'Bien de inversión'
] as const

/** Tipo de actividad: 05 profesional (lo que usa Declarando para el 763); 01 empresarial. */
const TIPO_ACTIVIDAD: Record<SeccionIae, string> = { 1: '01', 2: '05', 3: '05' }

/**
 * Concepto de gasto de la AEAT por categoría de la app. G45 es la Seguridad Social del titular (antes de 2T 2024, G06).
 * Las categorías nuevas que no estén aquí van a G03 (otros consumos de explotación), como hace Declarando.
 */
const CONCEPTO_GASTO: Record<string, string> = {
  cuota_autonomo: 'G45', software: 'G22', equipos: 'G03', telefono_internet: 'G17', suministros_vivienda: 'GY4',
  alquiler_vivienda: 'G12', alquiler_local: 'G12', coworking: 'G22', profesionales: 'G19', mobiliario: 'G03', formacion: 'G22',
  seguros: 'G20', bancos: 'G24', publicidad: 'G22', dietas: 'G11', vehiculo: 'G22', otros: 'G03'
}
/** Amortización por tipo de bien, para los bienes de inversión. */
const CONCEPTO_INVERSION: Record<string, string> = { equipos: 'G31', mobiliario: 'G28' }

export function conceptoGasto(g: Pick<Gasto, 'categoria' | 'bienInversion' | 'fecha'>): string {
  if (g.bienInversion) return CONCEPTO_INVERSION[g.categoria] ?? 'G28'
  if (g.categoria === 'cuota_autonomo' && g.fecha < '2024-04-01') return 'G06'
  return CONCEPTO_GASTO[g.categoria] ?? 'G03'
}

export interface DatosLibros {
  perfil: Perfil
  ingresos: Ingreso[]
  gastos: Gasto[]
  clientes: Cliente[]
  /** Número y tipo (F1, R1, R4) de la factura emitida, por id de ingreso. */
  facturas: Map<number, { numSerie: string; tipo: string }>
}

const euros = (c: number) => ({ importe: c / 100 })
/** Trimestre de una fecha: 1T..4T. */
const trimestre = (fecha: string) => `${Math.ceil(Number(fecha.slice(5, 7)) / 3)}T`

/** Filas del libro de ingresos (sin cabecera), en orden de fecha. */
export function filasIngresos(d: DatosLibros): Celda[][] {
  return [...d.ingresos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id).map((i) => {
    const act = actividadDe(d.perfil, i.actividadId)
    const cliente = d.clientes.find((c) => c.id === i.clienteId)
    const ambito = cliente ? ambitoDePais(cliente.pais) : 'nacional'
    // Tipo de identificación: vacío = NIF español; 02 = NIF-IVA de la UE; 04 = documento del país de residencia.
    const tipoId = !cliente?.nif ? '' : ambito === 'nacional' ? '' : ambito === 'ue' ? '02' : '04'
    return [
      Number(i.fecha.slice(0, 4)), trimestre(i.fecha), 'A', TIPO_ACTIVIDAD[act.seccion], act.codigo, d.facturas.get(i.id)?.tipo ?? 'F1', 'I01', euros(i.base),
      { fecha: i.fecha }, { fecha: i.fecha }, d.facturas.get(i.id)?.numSerie ?? '', tipoId, cliente?.nif ?? '', cliente?.nombre ?? '',
      '01', i.operacion === 'nacional' ? 'S1' : 'N2', '', euros(i.base + i.cuotaIva - i.cuotaRetencion), euros(i.base), i.tipoIva,
      euros(i.cuotaIva), 0, euros(0), i.retencionPct, euros(i.cuotaRetencion)
    ]
  })
}

/** Filas del libro de gastos (sin cabecera). Número de recepción correlativo por año y tipo: F1-1, SF-1... */
export function filasGastos(d: DatosLibros): Celda[][] {
  const contador = new Map<string, number>()
  return [...d.gastos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id).map((g) => {
    const act = actividadDe(d.perfil, g.actividadId)
    const tipo = g.numeroFactura.trim() ? 'F1' : 'SF'
    const clave = `${g.fecha.slice(0, 4)}-${tipo}`
    const n = (contador.get(clave) ?? 0) + 1
    contador.set(clave, n)
    const cuotaDeducible = porcentaje(g.cuotaIva, g.deduciblePctIva)
    // Los bienes de inversión se deducen por amortización (en los modelos), no por su precio.
    const deducible = g.bienInversion ? 0 : porcentaje(g.base, g.deduciblePctIrpf)
    return [
      Number(g.fecha.slice(0, 4)), trimestre(g.fecha), 'A', TIPO_ACTIVIDAD[act.seccion], act.codigo, tipo, conceptoGasto(g), `${tipo}-${n}`,
      euros(deducible), g.numeroFactura, { fecha: g.fecha }, g.nifProveedor, g.proveedor, tipo === 'F1' ? '01' : '',
      euros(g.base), g.tipoIva, euros(g.cuotaIva), euros(cuotaDeducible), 0, euros(0), euros(g.base + g.cuotaIva), g.bienInversion ? 'S' : ''
    ]
  })
}

/** Las dos hojas con los nombres que pide la AEAT para los libros del IRPF. */
export function hojasLibros(d: DatosLibros): Hoja[] {
  return [
    { nombre: 'INGRESOS', filas: [[...COLUMNAS_INGRESOS], ...filasIngresos(d)] },
    { nombre: 'GASTOS', filas: [[...COLUMNAS_GASTOS], ...filasGastos(d)] }
  ]
}

/** CSV como el de Declarando: comas, fechas dd-mm-aaaa e importes "1.234,56". */
export function csvLibro(filas: Celda[][]): string {
  const texto = (c: Celda): string => {
    if (c === null) return ''
    if (typeof c === 'number') return Number.isInteger(c) ? String(c) : c.toLocaleString('es-ES', { minimumFractionDigits: 2 })
    if (typeof c === 'object' && 'fecha' in c) return c.fecha.split('-').reverse().join('-')
    if (typeof c === 'object') return c.importe.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions)
    return c
  }
  const campo = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return filas.map((f) => f.map((c) => campo(texto(c))).join(',')).join('\r\n') + '\r\n'
}

/** Nombre de archivo que propone la AEAT: ejercicio + NIF + D (libros del IRPF) + nombre. */
export function nombreArchivoLibros(perfil: Perfil, ejercicio: number): string {
  const nombre = perfil.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').trim().replace(/\s+/g, '_').toUpperCase()
  return `${ejercicio}${perfil.nif}D${nombre}`
}
