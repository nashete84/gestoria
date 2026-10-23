import type { Modelo, Periodo, Resultado } from '../calendario'

/** Importes de las casillas del modelo, en céntimos (o unidades para contadores como nº de perceptores). */
export type Casillas = Record<string, number>

export interface ResultadoModelo {
  modelo: Modelo
  ejercicio: number
  periodo: Periodo
  casillas: Casillas
  /** Importe final (casilla de resultado), en céntimos. Negativo = a compensar, devolver o deducir. */
  resultado: number
  tipo: Resultado
  /** Sin operaciones en el periodo (el 303 tiene la marca "sin actividad"). */
  sinActividad: boolean
  avisos: string[]
}

/** Datos introducidos a mano para un ejercicio, cuando no salen de la contabilidad de la app. */
export interface AjustesModelos {
  /** 303: cuotas a compensar de periodos anteriores al empezar el año. */
  compensar303Inicial: number
  /** 303 del 4T con resultado negativo: pedir la devolución (true) o dejarlo a compensar (false). */
  devolucion303: boolean
  /** 130: rendimiento neto de actividades del año anterior (casilla 13). null = calcularlo con los datos de la app. */
  rendimientoAnterior: number | null
}

export const AJUSTES_VACIOS: AjustesModelos = { compensar303Inicial: 0, devolucion303: true, rendimientoAnterior: null }

export const TRIMESTRES = ['1T', '2T', '3T', '4T'] as const
export type PeriodoTrimestral = (typeof TRIMESTRES)[number]

export const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
