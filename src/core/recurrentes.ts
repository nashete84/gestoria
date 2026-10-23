// Ingresos y gastos que se repiten (cuota de autónomos, alquiler, gestoría, una iguala mensual...).
// Cada recurrente guarda una plantilla y crea un apunte por cada fecha que va llegando.

import type { GastoNuevo, IngresoNuevo } from './tipos'

export type Frecuencia = 'mensual' | 'trimestral' | 'anual'

export const FRECUENCIAS: Record<Frecuencia, { nombre: string; meses: number }> = {
  mensual: { nombre: 'Cada mes', meses: 1 },
  trimestral: { nombre: 'Cada trimestre', meses: 3 },
  anual: { nombre: 'Cada año', meses: 12 }
}

type Plantilla<T> = Omit<T, 'fecha'>

export type Recurrente =
  | (RecurrenteBase & { tipo: 'ingreso'; plantilla: Plantilla<IngresoNuevo> })
  | (RecurrenteBase & { tipo: 'gasto'; plantilla: Plantilla<GastoNuevo> })

interface RecurrenteBase {
  id: number
  frecuencia: Frecuencia
  /** Primera fecha; de ella sale el día del mes de todas las demás. */
  inicio: string
  /** Última fecha que puede generarse; null = sin fin. */
  fin: string | null
  /** Última fecha ya creada (o la del apunte del que salió); null = ninguna. */
  ultima: string | null
  activa: boolean
}

export type RecurrenteNuevo = Omit<Recurrente, 'id' | 'ultima'> & { ultima?: string | null }

/** Fecha número n de la serie: inicio + n periodos, con el día ajustado al último del mes si no existe (31 → 30, 28...). */
export function fechaN(inicio: string, frecuencia: Frecuencia, n: number): string {
  const [a, m, d] = inicio.split('-').map(Number) as [number, number, number]
  const total = (m - 1) + n * FRECUENCIAS[frecuencia].meses
  const anio = a + Math.floor(total / 12)
  const mes = total % 12
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(d, ultimoDia)).padStart(2, '0')}`
}

/** Fechas que tocan y aún no se han creado, hasta hoy incluido (como mucho `max`, por seguridad). */
export function fechasPendientes(r: Pick<Recurrente, 'inicio' | 'fin' | 'ultima' | 'frecuencia' | 'activa'>, hoy: string, max = 120): string[] {
  if (!r.activa) return []
  const fechas: string[] = []
  for (let n = 0; fechas.length < max; n++) {
    const f = fechaN(r.inicio, r.frecuencia, n)
    if (f > hoy || (r.fin && f > r.fin)) break
    if (!r.ultima || f > r.ultima) fechas.push(f)
  }
  return fechas
}

/** Próxima fecha que se creará, o null si ya no quedan. */
export function proximaFecha(r: Pick<Recurrente, 'inicio' | 'fin' | 'ultima' | 'frecuencia' | 'activa'>): string | null {
  if (!r.activa) return null
  for (let n = 0; n < 10_000; n++) {
    const f = fechaN(r.inicio, r.frecuencia, n)
    if (r.fin && f > r.fin) return null
    if (!r.ultima || f > r.ultima) return f
  }
  return null
}
