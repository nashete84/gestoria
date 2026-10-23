import { describe, expect, it } from 'vitest'
import { cuotaDeBase, parametrosReta, regularizar, rendimientoMensualReta, tramoDe } from './autonomos'

const p = parametrosReta(2026)

describe('cuota de autónomos 2026', () => {
  it('cuotas mínimas de la Orden PJC/297/2026 al 31,5 %', () => {
    expect(cuotaDeBase(95098, p)).toBe(29956) // tramo 1 general: 299,56 €
    expect(cuotaDeBase(192810, p)).toBe(60735) // último tramo: 607,35 €
    expect(cuotaDeBase(510120, p)).toBe(160688) // base máxima: 1.606,88 €
  })

  it('busca el tramo por el rendimiento mensual', () => {
    expect(tramoDe(67000, p)).toMatchObject({ tabla: 'reducida', numero: 1 })
    expect(tramoDe(67001, p)).toMatchObject({ tabla: 'reducida', numero: 2 })
    expect(tramoDe(116670, p)).toMatchObject({ tabla: 'general', numero: 1 })
    expect(tramoDe(600000, p)).toMatchObject({ numero: 11 })
    expect(tramoDe(600001, p)).toMatchObject({ numero: 12, baseMinima: 192810 })
  })

  it('rendimiento: ingresos − gastos + cuotas, menos el 7 %', () => {
    // 80.000 de ingresos, 10.000 de gastos con 3.600 de cuotas: (80.000 − 10.000 + 3.600) × 0,93 / 12 = 5.704
    expect(rendimientoMensualReta(8_000_000, 1_000_000, 360_000, p)).toBe(570_400)
  })

  it('regulariza por debajo de la mínima y por encima de la máxima', () => {
    // Paga 300 € (base 952,38) y le toca el tramo 11 (mínima 1.732,03): debe (1.732,03 − 952,38) × 31,5 % × 12.
    const r = regularizar(570_400, 30_000, p)
    expect(r.tramo.numero).toBe(11)
    expect(r.diferenciaAnual).toBe(cuotaDeBase(173203 - 95238, p) * 12)
    expect(regularizar(100_000, 60_000, p).diferenciaAnual).toBeLessThan(0)
    expect(regularizar(570_400, null, p).diferenciaAnual).toBe(0)
  })

  it('años sin datos usan los más cercanos y lo dicen', () => {
    expect(parametrosReta(2027)).toMatchObject({ ejercicio: 2026, aproximado: true })
    expect(parametrosReta(2025)).toMatchObject({ tipo: 31.4, aproximado: false })
  })
})
