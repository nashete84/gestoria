// Calendario fiscal del autónomo: qué modelos tocan, en qué plazo y en qué estado están.
// Plazos generales de la AEAT. Si el último día cae en sábado o domingo pasa al lunes;
// los festivos nacionales no se tienen en cuenta (la AEAT publica el calendario oficial cada año).

import type { Trimestre } from './periodos'
import type { Perfil } from './tipos'

export type Modelo = '303' | '130' | '111' | '115' | '349' | '390' | '347' | '190' | '180' | '100'
export type Periodo = '1T' | '2T' | '3T' | '4T' | '0A' // 0A = anual

export const NOMBRE_MODELO: Record<Modelo, string> = {
  '303': 'IVA trimestral',
  '130': 'Pago fraccionado de IRPF',
  '111': 'Retenciones a profesionales',
  '115': 'Retenciones por alquileres',
  '349': 'Operaciones intracomunitarias',
  '390': 'Resumen anual de IVA',
  '347': 'Operaciones con terceros (más de 3.005,06 €)',
  '190': 'Resumen anual de retenciones a profesionales',
  '180': 'Resumen anual de retenciones por alquileres',
  '100': 'Declaración de la renta'
}

export interface Obligacion {
  modelo: Modelo
  ejercicio: number
  periodo: Periodo
  /** Primer y último día del plazo de presentación (AAAA-MM-DD). */
  desde: string
  hasta: string
  /** Solo hay que presentarlo si hay operaciones (p. ej. 111 si practicaste retenciones). */
  condicional: boolean
  nota?: string
}

export type Resultado = 'ingresar' | 'devolver' | 'compensar' | 'cero' | 'negativa'

export interface Presentacion {
  id: number
  modelo: Modelo
  ejercicio: number
  periodo: Periodo
  fechaPresentacion: string
  resultado: Resultado
  /** Importe en céntimos (positivo). */
  importe: number
  /** Código seguro de verificación (CSV) o número de justificante. */
  justificante: string
  notas: string
}

export type PresentacionNueva = Omit<Presentacion, 'id'>

export type Estado = 'presentado' | 'vencido' | 'en_plazo' | 'proximo'

export interface ObligacionConEstado extends Obligacion {
  estado: Estado
  presentacion: Presentacion | null
  /** Días hasta el fin del plazo (negativo si ya venció). */
  diasRestantes: number
}

/** Trimestres con operaciones que obligan a ciertos modelos, en formato "2026-1T". */
export interface Actividad {
  retencionesProfesionales: string[] // 111
  retencionesAlquiler: string[] // 115
  intracomunitarias: string[] // 349
  /** Ejercicios con algún tercero por encima de 3.005,06 € (347). */
  ejerciciosCon347: number[]
}

const pad = (n: number) => String(n).padStart(2, '0')
const fecha = (a: number, m: number, d: number) => `${a}-${pad(m)}-${pad(d)}`

function ultimoDiaMes(a: number, m: number): number {
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

/** Si el plazo acaba en fin de semana, se traslada al lunes siguiente. */
export function ajustarFinDeSemana(f: string): string {
  const d = new Date(f + 'T00:00:00Z')
  const dia = d.getUTCDay()
  if (dia === 6) d.setUTCDate(d.getUTCDate() + 2)
  if (dia === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000)
}

function sumarDias(f: string, n: number): string {
  const d = new Date(f + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Plazo de un modelo trimestral: del 1 al 20 del mes siguiente; el 4T, en enero (día 20 o 30 según modelo). */
export function plazoTrimestral(modelo: Modelo, anio: number, t: Trimestre): { desde: string; hasta: string } {
  if (t === 4) {
    const dia = modelo === '111' || modelo === '115' ? 20 : 30
    return { desde: fecha(anio + 1, 1, 1), hasta: ajustarFinDeSemana(fecha(anio + 1, 1, dia)) }
  }
  const mes = t * 3 + 1
  return { desde: fecha(anio, mes, 1), hasta: ajustarFinDeSemana(fecha(anio, mes, 20)) }
}

export function plazoAnual(modelo: Modelo, ejercicio: number): { desde: string; hasta: string; nota?: string } {
  const s = ejercicio + 1
  switch (modelo) {
    case '390': return { desde: fecha(s, 1, 1), hasta: ajustarFinDeSemana(fecha(s, 1, 30)) }
    case '190':
    case '180': return { desde: fecha(s, 1, 1), hasta: ajustarFinDeSemana(fecha(s, 1, 31)) }
    case '347': return { desde: fecha(s, 2, 1), hasta: ajustarFinDeSemana(fecha(s, 2, ultimoDiaMes(s, 2))) }
    case '100': return {
      desde: fecha(s, 4, 1), hasta: ajustarFinDeSemana(fecha(s, 6, 30)),
      nota: 'Fechas aproximadas: la AEAT confirma cada año el inicio de la campaña (primeros días de abril).'
    }
    default: throw new Error(`El modelo ${modelo} no es anual`)
  }
}

const clave = (anio: number, t: Trimestre) => `${anio}-${t}T`

function trimestreDe(f: string): { anio: number; t: Trimestre } {
  return { anio: Number(f.slice(0, 4)), t: (Math.floor((Number(f.slice(5, 7)) - 1) / 3) + 1) as Trimestre }
}

function anteriores(anio: number, t: Trimestre, n: number): string[] {
  const r: string[] = []
  let a = anio
  let q = t as number
  for (let i = 0; i < n; i++) {
    q--
    if (q === 0) { q = 4; a-- }
    r.push(clave(a, q as Trimestre))
  }
  return r
}

/**
 * Genera las obligaciones desde el alta en la actividad, quedándose con las que vencen a partir de
 * `inicio` (fecha desde la que se controla) y las que se abren en los próximos `horizonteDias` días.
 */
export function generarObligaciones(
  perfil: Perfil, inicio: string, hoy: string, actividad: Actividad, horizonteDias = 190
): Obligacion[] {
  const limite = sumarDias(hoy, horizonteDias)
  const primero = trimestreDe(perfil.fechaAlta)
  const actual = trimestreDe(hoy)
  const r: Obligacion[] = []

  // Trimestrales
  for (let anio = primero.anio; ; anio++) {
    let parar = false
    for (let t = 1 as Trimestre; t <= 4; t = (t + 1) as Trimestre) {
      if (anio === primero.anio && t < primero.t) continue
      const p303 = plazoTrimestral('303', anio, t)
      if (p303.desde > limite) { parar = true; break }
      const k = clave(anio, t)
      // Un trimestre que aún no ha terminado no tiene datos completos: se mira el último año.
      const abierto = anio > actual.anio || (anio === actual.anio && t >= actual.t)
      const recientes = anteriores(anio, t, 4)
      const aplica = (lista: string[]) =>
        lista.includes(k) ? 'si' : abierto && recientes.some((x) => lista.includes(x)) ? 'quizas' : 'no'

      const periodo = `${t}T` as Periodo
      r.push({ modelo: '303', ejercicio: anio, periodo, ...p303, condicional: false })
      if (!perfil.exento130) {
        r.push({ modelo: '130', ejercicio: anio, periodo, ...plazoTrimestral('130', anio, t), condicional: false })
      }
      for (const [modelo, lista] of [
        ['111', actividad.retencionesProfesionales],
        ['115', actividad.retencionesAlquiler],
        ['349', actividad.intracomunitarias]
      ] as const) {
        const a = aplica(lista)
        if (a !== 'no') r.push({ modelo, ejercicio: anio, periodo, ...plazoTrimestral(modelo, anio, t), condicional: a === 'quizas' })
      }
    }
    if (parar) break
  }

  // Anuales: un ejercicio genera sus resúmenes al año siguiente.
  for (let ej = primero.anio; plazoAnual('390', ej).desde <= limite; ej++) {
    const delAnio = (lista: string[]) => lista.some((x) => x.startsWith(`${ej}-`))
    const enCurso = ej >= actual.anio
    r.push({ modelo: '390', ejercicio: ej, periodo: '0A', ...plazoAnual('390', ej), condicional: false })
    if (delAnio(actividad.retencionesProfesionales)) r.push({ modelo: '190', ejercicio: ej, periodo: '0A', ...plazoAnual('190', ej), condicional: false })
    if (delAnio(actividad.retencionesAlquiler)) r.push({ modelo: '180', ejercicio: ej, periodo: '0A', ...plazoAnual('180', ej), condicional: false })
    if (actividad.ejerciciosCon347.includes(ej)) r.push({ modelo: '347', ejercicio: ej, periodo: '0A', ...plazoAnual('347', ej), condicional: enCurso })
    r.push({ modelo: '100', ejercicio: ej, periodo: '0A', ...plazoAnual('100', ej), condicional: false })
  }

  // Solo lo que había que presentar a partir de `inicio`: lo anterior se da por resuelto.
  return r.filter((o) => o.desde <= limite && o.hasta >= inicio).sort((a, b) => a.hasta.localeCompare(b.hasta) || a.modelo.localeCompare(b.modelo))
}

export function clasificar(
  obligaciones: Obligacion[], presentaciones: Presentacion[], hoy: string
): ObligacionConEstado[] {
  const resultado: ObligacionConEstado[] = obligaciones.map((o) => {
    const p = presentaciones.find((x) => x.modelo === o.modelo && x.ejercicio === o.ejercicio && x.periodo === o.periodo) ?? null
    const estado: Estado = p ? 'presentado' : hoy > o.hasta ? 'vencido' : hoy >= o.desde ? 'en_plazo' : 'proximo'
    return { ...o, estado, presentacion: p, diasRestantes: diasEntre(hoy, o.hasta) }
  })
  // Presentaciones registradas que no salen en el calendario (p. ej. anteriores al inicio): se muestran igual.
  for (const p of presentaciones) {
    if (!resultado.some((o) => o.presentacion?.id === p.id)) {
      const plazo = p.periodo === '0A' ? plazoAnual(p.modelo, p.ejercicio) : plazoTrimestral(p.modelo, p.ejercicio, Number(p.periodo[0]) as Trimestre)
      resultado.push({ modelo: p.modelo, ejercicio: p.ejercicio, periodo: p.periodo, ...plazo, condicional: false, estado: 'presentado', presentacion: p, diasRestantes: diasEntre(hoy, plazo.hasta) })
    }
  }
  return resultado
}

export function esTrimestral(m: Modelo): boolean {
  return ['303', '130', '111', '115', '349'].includes(m)
}

export function etiquetaPeriodo(o: { ejercicio: number; periodo: Periodo }): string {
  return o.periodo === '0A' ? `Ejercicio ${o.ejercicio}` : `${o.periodo} ${o.ejercicio}`
}
