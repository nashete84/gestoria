// Cobros de los ingresos: lo que el cliente tiene que pagar y si ya lo ha hecho.

import type { Centimos } from './money'
import type { EstadoCobro, Ingreso } from './tipos'

/** Días de plazo de cobro que se proponen al crear un ingreso. */
export const DIAS_VENCIMIENTO = 30

/** Lo que paga el cliente: base + IVA − retención (la retención la ingresa él en Hacienda). */
export function importeACobrar(i: Pick<Ingreso, 'base' | 'cuotaIva' | 'cuotaRetencion'>): Centimos {
  return i.base + i.cuotaIva - i.cuotaRetencion
}

export function estadoCobro(i: Pick<Ingreso, 'fechaCobro' | 'fechaVencimiento'>, hoy: string): EstadoCobro {
  if (i.fechaCobro) return 'cobrado'
  return i.fechaVencimiento && i.fechaVencimiento < hoy ? 'vencido' : 'pendiente'
}

/** Fecha + n días, en AAAA-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export interface ResumenCobros {
  pendientes: number
  importePendiente: Centimos
  vencidos: number
  importeVencido: Centimos
}

export function resumirCobros(ingresos: Ingreso[], hoy: string): ResumenCobros {
  const r: ResumenCobros = { pendientes: 0, importePendiente: 0, vencidos: 0, importeVencido: 0 }
  for (const i of ingresos) {
    const estado = estadoCobro(i, hoy)
    if (estado === 'cobrado') continue
    r.pendientes++
    r.importePendiente += importeACobrar(i)
    if (estado === 'vencido') { r.vencidos++; r.importeVencido += importeACobrar(i) }
  }
  return r
}
