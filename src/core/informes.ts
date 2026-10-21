// Informes: gastos frente a ingresos por mes, y resumen de impuestos del año.
// Importes en céntimos y sin IVA (el IVA no es ni ingreso ni gasto del autónomo: se cobra o se paga por cuenta de Hacienda).

import type { Modelo, Periodo, Presentacion, Resultado } from './calendario'
import { CATEGORIAS_GASTO } from './fiscalidad'
import type { Cliente, Gasto, Ingreso } from './tipos'

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export interface Mes {
  mes: number // 1 a 12
  ingresos: number
  gastos: number
  resultado: number
}

export interface Partida {
  clave: string
  nombre: string
  importe: number
}

export interface InformeIngresosGastos {
  ejercicio: number
  meses: Mes[]
  ingresos: number
  gastos: number
  resultado: number
  /** Resultado sobre ingresos, en % (null sin ingresos). */
  margen: number | null
  gastosPorCategoria: Partida[]
  ingresosPorCliente: Partida[]
  /** El año anterior hasta la misma fecha (o entero si este año ya terminó). */
  anterior: { ingresos: number; gastos: number } | null
}

export function informeIngresosGastos(ejercicio: number, ingresos: Ingreso[], gastos: Gasto[], clientes: Cliente[], anterior: { ingresos: Ingreso[]; gastos: Gasto[] } | null): InformeIngresosGastos {
  const delAnio = <T extends { fecha: string }>(xs: T[]) => xs.filter((x) => x.fecha.startsWith(`${ejercicio}-`))
  const is = delAnio(ingresos)
  const gs = delAnio(gastos)
  const mes = (f: string) => Number(f.slice(5, 7))
  const meses: Mes[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const ing = suma(is.filter((x) => mes(x.fecha) === m).map((x) => x.base))
    const gas = suma(gs.filter((x) => mes(x.fecha) === m).map((x) => x.base))
    return { mes: m, ingresos: ing, gastos: gas, resultado: ing - gas }
  })
  const totalI = suma(meses.map((m) => m.ingresos))
  const totalG = suma(meses.map((m) => m.gastos))

  const agrupar = <T>(xs: T[], clave: (x: T) => string, nombre: (k: string) => string, importe: (x: T) => number): Partida[] => {
    const mapa = new Map<string, number>()
    for (const x of xs) mapa.set(clave(x), (mapa.get(clave(x)) ?? 0) + importe(x))
    return [...mapa].map(([k, v]) => ({ clave: k, nombre: nombre(k), importe: v })).filter((p) => p.importe !== 0).sort((a, b) => b.importe - a.importe)
  }
  const nombreCategoria = (k: string) => CATEGORIAS_GASTO.find((c) => c.id === k)?.nombre ?? k
  const nombreCliente = (k: string) => (k === '' ? 'Sin cliente' : clientes.find((c) => String(c.id) === k)?.nombre ?? 'Cliente borrado')

  return {
    ejercicio, meses, ingresos: totalI, gastos: totalG, resultado: totalI - totalG,
    margen: totalI > 0 ? Math.round(((totalI - totalG) / totalI) * 1000) / 10 : null,
    gastosPorCategoria: agrupar(gs, (g) => g.categoria, nombreCategoria, (g) => g.base),
    ingresosPorCliente: agrupar(is, (i) => (i.clienteId === null ? '' : String(i.clienteId)), nombreCliente, (i) => i.base),
    anterior: anterior ? { ingresos: suma(anterior.ingresos.map((x) => x.base)), gastos: suma(anterior.gastos.map((x) => x.base)) } : null
  }
}

// ---------- Impuestos ----------

export type GrupoImpuesto = 'iva' | 'irpf' | 'retenciones' | 'renta'

export const NOMBRE_GRUPO: Record<GrupoImpuesto, string> = {
  iva: 'IVA (303)',
  irpf: 'Pagos fraccionados de IRPF (130)',
  retenciones: 'Retenciones que ingresas (111 y 115)',
  renta: 'Declaración de la renta'
}

export interface LineaImpuesto {
  modelo: Modelo
  periodo: Periodo
  grupo: GrupoImpuesto
  /** Fin del plazo de presentación (AAAA-MM-DD). */
  plazo: string
  presentado: boolean
  resultado: Resultado
  /** Con signo: positivo = a pagar, negativo = a devolver o compensar. Presentado: lo declarado; si no, lo calculado. */
  importe: number
}

export interface InformeImpuestos {
  ejercicio: number
  lineas: LineaImpuesto[]
  /** Por grupo: pagado (presentado) y pendiente (calculado y aún sin presentar, solo lo que sale a pagar). */
  grupos: { grupo: GrupoImpuesto; pagado: number; pendiente: number }[]
  pagado: number
  pendiente: number
  /** Retenciones que te han practicado tus clientes en el año: ya están pagadas a cuenta de tu renta. */
  retencionesSoportadas: number
  avisos: string[]
}

export const GRUPO_DE: Partial<Record<Modelo, GrupoImpuesto>> = { '303': 'iva', '130': 'irpf', '111': 'retenciones', '115': 'retenciones', '100': 'renta' }

const CON_SIGNO: Record<Resultado, number> = { ingresar: 1, devolver: -1, compensar: -1, negativa: -1, cero: 0 }

/** Importe con signo de una presentación registrada. */
export const importePresentado = (p: Presentacion) => CON_SIGNO[p.resultado] * p.importe

export function resumirImpuestos(ejercicio: number, lineas: LineaImpuesto[], retencionesSoportadas: number, avisos: string[]): InformeImpuestos {
  const grupos = (Object.keys(NOMBRE_GRUPO) as GrupoImpuesto[]).map((grupo) => {
    const ls = lineas.filter((l) => l.grupo === grupo)
    return {
      grupo,
      pagado: suma(ls.filter((l) => l.presentado && l.importe > 0).map((l) => l.importe)),
      pendiente: suma(ls.filter((l) => !l.presentado && l.importe > 0).map((l) => l.importe))
    }
  }).filter((g) => lineas.some((l) => l.grupo === g.grupo))
  return {
    ejercicio, lineas, grupos,
    pagado: suma(grupos.map((g) => g.pagado)),
    pendiente: suma(grupos.map((g) => g.pendiente)),
    retencionesSoportadas, avisos
  }
}
