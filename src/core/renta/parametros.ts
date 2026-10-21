// Parámetros del IRPF por ejercicio. Son datos: para un año nuevo se añade una entrada,
// no se toca el cálculo. Las cantidades en céntimos; los tipos en %.
// Fuentes: Ley 35/2006 del IRPF y su reglamento, y la normativa de la Comunidad de Madrid.

export interface Tramo {
  /** Límite superior del tramo en céntimos; null = sin límite. */
  hasta: number | null
  tipo: number
}

export interface MinimosPersonales {
  contribuyente: number
  mayor65: number
  mayor75: number
  /** Por descendiente, del 1º al 4º y siguientes. */
  descendientes: [number, number, number, number]
  descendienteMenor3: number
}

export interface ParametrosRenta {
  ejercicio: number
  /** Si no hay parámetros propios del año se usan los del más reciente y se avisa. */
  avisos: string[]
  escalaGeneralEstatal: Tramo[]
  escalaAhorroEstatal: Tramo[]
  escalasAutonomicas: Record<string, { general: Tramo[]; ahorro: Tramo[]; minimos: MinimosPersonales; nombre: string }>
  minimosEstatales: MinimosPersonales
  /** Gastos de difícil justificación en estimación directa simplificada. */
  dificilJustificacion: { pct: number; maximo: number }
  /**
   * Reducción del art. 32.2.2º LIRPF (autónomo económicamente dependiente o con un único cliente,
   * gastos ≤ 30% y ≥ 70% de ingresos con retención). Incompatible con el 5% de difícil justificación.
   * Fija + adicional: `importe` si el rendimiento ≤ `umbral`; entre `umbral` y `limiteSuperior`,
   * `importe − coeficiente × (rendimiento − umbral)`. La adicional solo si las otras rentas no superan `maxOtrasRentas`.
   */
  reduccionDependiente: { fija: number; importe: number; umbral: number; limiteSuperior: number; coeficiente: number; maxOtrasRentas: number }
  /**
   * Reducción del art. 32.2.3º LIRPF si las rentas no exentas (incluida la actividad) no llegan a `limiteRentas`:
   * `importe` hasta `umbral`; después `importe − coeficiente × (rentas − umbral)`.
   */
  reduccionRentasBajas: { importe: number; umbral: number; limiteRentas: number; coeficiente: number }
  /** Planes de pensiones: límite general, adicional por plan de empleo de autónomos y % máximo sobre rendimientos. */
  pensiones: { limite: number; limiteAutonomos: number; pctRendimientos: number }
  /** Coeficiente máximo de amortización anual (%) por categoría de gasto, tabla simplificada. */
  amortizacion: Record<string, number>
  /** Coeficiente para categorías sin entrada propia ("otros elementos"). */
  amortizacionDefecto: number
}

const e = (euros: number) => Math.round(euros * 100)

const ESTATAL_GENERAL: Tramo[] = [
  { hasta: e(12450), tipo: 9.5 },
  { hasta: e(20200), tipo: 12 },
  { hasta: e(35200), tipo: 15 },
  { hasta: e(60000), tipo: 18.5 },
  { hasta: e(300000), tipo: 22.5 },
  { hasta: null, tipo: 24.5 }
]

const AHORRO_HASTA_2024: Tramo[] = [
  { hasta: e(6000), tipo: 9.5 },
  { hasta: e(50000), tipo: 10.5 },
  { hasta: e(200000), tipo: 11.5 },
  { hasta: e(300000), tipo: 13.5 },
  { hasta: null, tipo: 14 }
]

// Desde 2025 el último tramo del ahorro sube (Ley 7/2024).
const AHORRO_ESTATAL_2025: Tramo[] = [...AHORRO_HASTA_2024.slice(0, 4), { hasta: null, tipo: 15 }]

const MINIMOS_ESTATALES: MinimosPersonales = {
  contribuyente: e(5550), mayor65: e(1150), mayor75: e(1400),
  descendientes: [e(2400), e(2700), e(4000), e(4500)], descendienteMenor3: e(2800)
}

const MADRID_GENERAL: Tramo[] = [
  { hasta: e(13362.22), tipo: 8.5 },
  { hasta: e(19004.63), tipo: 10.7 },
  { hasta: e(35425.68), tipo: 12.8 },
  { hasta: e(57320.4), tipo: 17.4 },
  { hasta: null, tipo: 20.5 }
]

// Mínimos autonómicos de Madrid, un 10% por encima de los estatales (pendiente de verificar con la AEAT).
const MINIMOS_MADRID: MinimosPersonales = {
  contribuyente: e(6105), mayor65: e(1265), mayor75: e(1540),
  descendientes: [e(2640), e(2970), e(4400), e(4950)], descendienteMenor3: e(3080)
}

const BASE_2024: Omit<ParametrosRenta, 'ejercicio' | 'avisos'> = {
  escalaGeneralEstatal: ESTATAL_GENERAL,
  escalaAhorroEstatal: AHORRO_HASTA_2024,
  escalasAutonomicas: {
    MD: {
      nombre: 'Comunidad de Madrid',
      general: MADRID_GENERAL,
      ahorro: AHORRO_HASTA_2024,
      minimos: MINIMOS_MADRID
    }
  },
  minimosEstatales: MINIMOS_ESTATALES,
  dificilJustificacion: { pct: 5, maximo: e(2000) },
  reduccionDependiente: { fija: e(2000), importe: e(6498), umbral: e(14047.5), limiteSuperior: e(19747.5), coeficiente: 1.14, maxOtrasRentas: e(6500) },
  reduccionRentasBajas: { importe: e(1620), umbral: e(8000), limiteRentas: e(12000), coeficiente: 0.405 },
  pensiones: { limite: e(1500), limiteAutonomos: e(4250), pctRendimientos: 30 },
  // Tabla simplificada (Orden de 27-3-1998): equipos y programas informáticos 26%, transporte 16%,
  // mobiliario 10%, útiles y herramientas 30%, resto 10%.
  amortizacion: { equipos: 26, software: 26, vehiculo: 16 },
  amortizacionDefecto: 10
}

const AVISO_VERIFICAR = 'Los mínimos personales y familiares de Madrid están pendientes de verificar con la normativa oficial.'

export const PARAMETROS: ParametrosRenta[] = [
  { ejercicio: 2024, avisos: [AVISO_VERIFICAR], ...BASE_2024 },
  {
    ejercicio: 2025, avisos: [AVISO_VERIFICAR], ...BASE_2024,
    // Ley 7/2024: sube solo el tramo estatal del ahorro por encima de 300.000 €; el autonómico de Madrid no cambia.
    escalaAhorroEstatal: AHORRO_ESTATAL_2025
  }
]

/** Parámetros del ejercicio; si no existen, los del año más cercano anterior, con aviso. */
export function parametrosDe(ejercicio: number): ParametrosRenta {
  const exactos = PARAMETROS.find((p) => p.ejercicio === ejercicio)
  if (exactos) return exactos
  const anteriores = PARAMETROS.filter((p) => p.ejercicio < ejercicio).sort((a, b) => b.ejercicio - a.ejercicio)
  const base = anteriores[0] ?? PARAMETROS[0]!
  return {
    ...base,
    ejercicio,
    avisos: [...base.avisos, `Aún no hay parámetros oficiales de ${ejercicio}: se usan los de ${base.ejercicio}.`]
  }
}
