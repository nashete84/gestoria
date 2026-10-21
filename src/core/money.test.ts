import { describe, expect, it } from 'vitest'
import { formatearEuros, parsearEuros, porcentaje } from './money'

describe('parsearEuros', () => {
  it.each([
    ['1.234,56', 123456], ['1234,56', 123456], ['1234.56', 123456], ['1,234.56', 123456],
    ['1234', 123400], ['1.234', 123400], ['-12,5', -1250], ['0,01', 1], [' 99 € ', 9900]
  ])('%s → %i', (texto, esperado) => expect(parsearEuros(texto)).toBe(esperado))

  it.each(['', 'abc', '1,234,5', '12,345', '1.2.3', '0.125'])('rechaza %s', (t) => {
    // "12,345" tiene tres decimales: ambiguo, se rechaza.
    expect(parsearEuros(t)).toBeNull()
  })
})

describe('porcentaje', () => {
  it('redondea medio céntimo hacia arriba', () => {
    expect(porcentaje(250, 21)).toBe(53) // 52,5 → 53
    expect(porcentaje(-250, 21)).toBe(-53)
    expect(porcentaje(100000, 15)).toBe(15000)
  })
})

it('formatea en euros', () => {
  expect(formatearEuros(123456).replace(/\s/g, ' ')).toBe('1.234,56 €')
})
