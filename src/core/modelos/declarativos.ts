// Modelos informativos con relación de terceros: 349 (operaciones intracomunitarias, trimestral)
// y 347 (operaciones con terceros de más de 3.005,06 €, anual).

import { normalizarNif, prefijoVies } from '../nif'
import { periodoTrimestre, type Trimestre } from '../periodos'
import type { Cliente, Gasto, Ingreso } from '../tipos'
import { suma, TRIMESTRES, type ResultadoModelo } from './tipos'

export interface Operador349 {
  /** NIF-IVA con el prefijo del país (p. ej. IE6388047V). */
  nifIva: string
  pais: string
  nombre: string
  /** S = servicios prestados, I = servicios adquiridos, E = entregas de bienes, A = adquisiciones de bienes. */
  clave: 'S' | 'I' | 'E' | 'A'
  base: number
}

export interface Resultado349 extends ResultadoModelo {
  operadores: Operador349[]
}

/** NIF-IVA con prefijo de país; si ya lo lleva, se deja tal cual. */
function nifIva(nif: string, pais: string): string {
  const n = normalizarNif(nif)
  const prefijo = prefijoVies(pais.toUpperCase())
  return n.startsWith(prefijo) ? n : prefijo + n
}

/** Categorías de gasto que son bienes (adquisición intracomunitaria de bienes, clave A). */
const CATEGORIAS_BIENES = ['equipos']

export function calcular349(ingresos: Ingreso[], gastos: Gasto[], clientes: Cliente[], ejercicio: number, trimestre: Trimestre): Resultado349 {
  const { desde, hasta } = periodoTrimestre(ejercicio, trimestre)
  const avisos: string[] = []
  const grupos = new Map<string, Operador349>()
  const anadir = (o: Operador349) => {
    const k = `${o.nifIva}|${o.clave}`
    const previo = grupos.get(k)
    if (previo) previo.base += o.base
    else grupos.set(k, { ...o })
  }

  for (const i of ingresos) {
    if (i.operacion !== 'intracomunitaria' || i.fecha < desde || i.fecha > hasta) continue
    const c = clientes.find((x) => x.id === i.clienteId)
    if (!c || !c.nif) { avisos.push(`Ingreso intracomunitario del ${i.fecha} sin cliente o sin NIF-IVA: no puede ir en el 349.`); continue }
    anadir({ nifIva: nifIva(c.nif, c.pais), pais: c.pais, nombre: c.nombre, clave: 'S', base: i.base })
  }
  for (const g of gastos) {
    if (g.operacion !== 'intracomunitaria' || g.fecha < desde || g.fecha > hasta) continue
    if (!g.nifProveedor) { avisos.push(`Gasto intracomunitario del ${g.fecha} (${g.proveedor}) sin NIF-IVA del proveedor.`); continue }
    const clave = CATEGORIAS_BIENES.includes(g.categoria) ? 'A' : 'I'
    anadir({ nifIva: nifIva(g.nifProveedor, g.paisProveedor), pais: g.paisProveedor, nombre: g.proveedor, clave, base: g.base })
  }
  if (gastos.some((g) => g.operacion === 'intracomunitaria' && CATEGORIAS_BIENES.includes(g.categoria) && g.fecha >= desde && g.fecha <= hasta)) {
    avisos.push('Las compras de equipos a la UE se declaran como adquisición de bienes (clave A). Si fue un servicio, cámbialo a mano.')
  }

  const operadores = [...grupos.values()].sort((a, b) => a.nifIva.localeCompare(b.nifIva) || a.clave.localeCompare(b.clave))
  const total = suma(operadores.map((o) => o.base))
  return {
    modelo: '349', ejercicio, periodo: TRIMESTRES[trimestre - 1]!, operadores,
    casillas: { operadores: operadores.length, importe: total },
    resultado: 0, tipo: 'cero', sinActividad: !operadores.length, avisos
  }
}

export const LIMITE_347 = 300506 // 3.005,06 € en céntimos

export interface Tercero347 {
  nif: string
  nombre: string
  /** Código de provincia (dos primeros dígitos del CP); '99' si es extranjero. */
  provincia: string
  pais: string
  /** A = compras (adquisiciones), B = ventas (entregas). */
  clave: 'A' | 'B'
  importe: number
  trimestres: [number, number, number, number]
}

export interface Resultado347 extends ResultadoModelo {
  terceros: Tercero347[]
}

/** Gastos que no se declaran en el 347: con retención (van al 190/180) y cuotas de Seguridad Social. */
export const CATEGORIAS_FUERA_347 = ['cuota_autonomo']

export function calcular347(ingresos: Ingreso[], gastos: Gasto[], clientes: Cliente[], ejercicio: number): Resultado347 {
  const anio = String(ejercicio)
  const avisos: string[] = []
  const grupos = new Map<string, Tercero347>()
  const trimestre = (fecha: string) => Math.floor((Number(fecha.slice(5, 7)) - 1) / 3)
  const anadir = (t: Omit<Tercero347, 'importe' | 'trimestres'>, fecha: string, importe: number) => {
    const k = `${t.clave}|${t.nif || t.nombre.toUpperCase()}`
    let g = grupos.get(k)
    if (!g) { g = { ...t, importe: 0, trimestres: [0, 0, 0, 0] }; grupos.set(k, g) }
    g.importe += importe
    g.trimestres[trimestre(fecha)]! += importe
  }

  for (const i of ingresos) {
    if (!i.fecha.startsWith(anio) || i.operacion !== 'nacional' || i.cuotaRetencion > 0 || i.clienteId === null) continue
    const c = clientes.find((x) => x.id === i.clienteId)
    if (!c) continue
    anadir({ nif: normalizarNif(c.nif), nombre: c.nombre, provincia: c.codigoPostal.slice(0, 2) || '99', pais: c.pais, clave: 'B' }, i.fecha, i.base + i.cuotaIva)
  }
  for (const g of gastos) {
    if (!g.fecha.startsWith(anio) || g.operacion !== 'nacional' || g.cuotaRetencion > 0 || CATEGORIAS_FUERA_347.includes(g.categoria)) continue
    anadir({ nif: normalizarNif(g.nifProveedor), nombre: g.proveedor, provincia: '', pais: g.paisProveedor, clave: 'A' }, g.fecha, g.base + g.cuotaIva)
  }

  const terceros = [...grupos.values()].filter((t) => t.importe > LIMITE_347).sort((a, b) => a.clave.localeCompare(b.clave) || a.nombre.localeCompare(b.nombre))
  for (const t of terceros) {
    if (!t.nif) avisos.push(`${t.nombre} supera 3.005,06 € y no tiene NIF: añádelo antes de presentar el 347.`)
    if (t.clave === 'A' && !t.provincia) avisos.push(`Indica la provincia de ${t.nombre} (código postal) al presentar el 347.`)
  }
  return {
    modelo: '347', ejercicio, periodo: '0A', terceros,
    casillas: { declarados: terceros.length, importe: suma(terceros.map((t) => t.importe)) },
    resultado: 0, tipo: 'cero', sinActividad: !terceros.length, avisos
  }
}
