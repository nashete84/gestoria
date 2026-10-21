import { describe, expect, it } from 'vitest'
import { formatoNifIvaUe, tipoNif } from './nif'

describe('tipoNif', () => {
  it.each([
    ['12345678Z', 'DNI'], ['12345678-z', 'DNI'], ['X1234567L', 'NIE'], ['Y1234567X', 'NIE'],
    ['B12345674', 'CIF'], ['Q2826000H', 'CIF'], ['A58818501', 'CIF']
  ])('%s es %s', (nif, tipo) => expect(tipoNif(nif)).toBe(tipo))

  it.each(['12345678A', 'X1234567A', 'B12345675', 'Q2826000A', '1234', ''])('%s no es válido', (nif) => {
    expect(tipoNif(nif)).toBeNull()
  })
})

describe('formatoNifIvaUe', () => {
  it('exige el prefijo del país', () => {
    expect(formatoNifIvaUe('FR12345678901', 'FR')).toBe(true)
    expect(formatoNifIvaUe('12345678901', 'FR')).toBe(false)
    expect(formatoNifIvaUe('EL123456789', 'GR')).toBe(true)
  })
})
