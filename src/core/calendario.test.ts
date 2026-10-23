import { describe, expect, it } from 'vitest'
import {
  ajustarFinDeSemana, clasificar, generarObligaciones, plazoAnual, plazoTrimestral, type Actividad
} from './calendario'
import { perfilBase } from './fixtures'

const sinActividad: Actividad = { retencionesProfesionales: [], retencionesAlquiler: [], intracomunitarias: [], ejerciciosCon347: [] }

describe('plazos', () => {
  it('trimestrales del 1 al 20 del mes siguiente', () => {
    expect(plazoTrimestral('303', 2026, 1)).toEqual({ desde: '2026-04-01', hasta: '2026-04-20' })
    expect(plazoTrimestral('303', 2026, 3)).toEqual({ desde: '2026-10-01', hasta: '2026-10-20' })
  })
  it('4T: 303, 130 y 349 hasta el 30 de enero; 111 y 115 hasta el 20', () => {
    expect(plazoTrimestral('303', 2026, 4).hasta).toBe('2027-02-01') // 30/01/2027 es sábado
    expect(plazoTrimestral('349', 2025, 4).hasta).toBe('2026-01-30')
    expect(plazoTrimestral('111', 2025, 4).hasta).toBe('2026-01-20')
  })
  it('fin de semana pasa al lunes', () => {
    expect(ajustarFinDeSemana('2026-06-20')).toBe('2026-06-22') // sábado
    expect(ajustarFinDeSemana('2026-09-20')).toBe('2026-09-21') // domingo
    expect(ajustarFinDeSemana('2026-04-20')).toBe('2026-04-20') // lunes
  })
  it('anuales', () => {
    expect(plazoAnual('347', 2027)).toMatchObject({ desde: '2028-02-01', hasta: '2028-02-29' })
    expect(plazoAnual('100', 2025)).toMatchObject({ desde: '2026-04-01', hasta: '2026-06-30' })
  })
})

describe('generarObligaciones', () => {
  const hoy = '2026-10-21'
  const claves = (os: { modelo: string; ejercicio: number; periodo: string }[]) =>
    os.map((o) => `${o.modelo} ${o.periodo} ${o.ejercicio}`)

  it('sin actividad especial: 303 y 130 trimestrales, 390 y renta', () => {
    const r = claves(generarObligaciones(perfilBase, '2026-01-01', hoy, sinActividad, 100))
    expect(r).toEqual([
      '130 4T 2025', '303 4T 2025', '390 0A 2025', '130 1T 2026', '303 1T 2026', '100 0A 2025', '130 2T 2026', '303 2T 2026', '130 3T 2026', '303 3T 2026',
      '130 4T 2026', '303 4T 2026', '390 0A 2026'
    ])
  })

  it('sin 130 si está exento', () => {
    const r = claves(generarObligaciones({ ...perfilBase, exento130: true }, '2026-07-01', hoy, sinActividad))
    expect(r.some((x) => x.startsWith('130'))).toBe(false)
  })

  it('111 y 349 solo en trimestres con operaciones; en los abiertos, condicional', () => {
    const act = { ...sinActividad, retencionesProfesionales: ['2026-2T'], intracomunitarias: ['2026-3T'] }
    const r = generarObligaciones(perfilBase, '2026-01-01', hoy, act, 100)
    expect(claves(r.filter((o) => o.modelo === '111'))).toEqual(['111 2T 2026', '111 4T 2026'])
    expect(r.find((o) => o.modelo === '111' && o.periodo === '4T')?.condicional).toBe(true)
    expect(claves(r.filter((o) => o.modelo === '349'))).toEqual(['349 3T 2026', '349 4T 2026'])
    expect(claves(r.filter((o) => o.modelo === '190'))).toEqual(['190 0A 2026'])
  })

  it('incluye lo que vence después del inicio aunque el periodo sea anterior', () => {
    const r = claves(generarObligaciones(perfilBase, '2026-06-01', hoy, sinActividad, 100))
    expect(r.slice(0, 3)).toEqual(['100 0A 2025', '130 2T 2026', '303 2T 2026'])
  })

  it('no genera periodos anteriores al alta', () => {
    const r = generarObligaciones({ ...perfilBase, fechaAlta: '2026-08-15' }, '2026-01-01', hoy, sinActividad)
    expect(r[0]).toMatchObject({ modelo: '130', periodo: '3T', ejercicio: 2026 })
  })
})

describe('clasificar', () => {
  const obligaciones = generarObligaciones(perfilBase, '2026-07-01', '2026-10-15', sinActividad)

  it('estados según la fecha y las presentaciones', () => {
    const p = { id: 1, modelo: '303' as const, ejercicio: 2026, periodo: '3T' as const, fechaPresentacion: '2026-10-10', resultado: 'ingresar' as const, importe: 100, justificante: '', notas: '' }
    const r = clasificar(obligaciones, [p], '2026-10-15')
    const est = (m: string, per: string) => r.find((o) => o.modelo === m && o.periodo === per)?.estado
    expect(est('303', '3T')).toBe('presentado')
    expect(est('130', '3T')).toBe('en_plazo')
    expect(est('130', '4T')).toBe('proximo')
    expect(clasificar(obligaciones, [], '2026-10-21').find((o) => o.modelo === '130' && o.periodo === '3T')?.estado).toBe('vencido')
  })

  it('incluye presentaciones anteriores al periodo controlado', () => {
    const p = { id: 9, modelo: '303' as const, ejercicio: 2025, periodo: '4T' as const, fechaPresentacion: '2026-01-25', resultado: 'ingresar' as const, importe: 100, justificante: '', notas: '' }
    expect(clasificar(obligaciones, [p], '2026-10-15').some((o) => o.presentacion?.id === 9)).toBe(true)
  })
})
