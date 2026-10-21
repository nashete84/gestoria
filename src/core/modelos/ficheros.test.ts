import { describe, expect, it } from 'vitest'
import { perfilBase } from '../fixtures'
import type { Resultado347, Resultado349 } from './declarativos'
import { alfa, importe, nif9 } from './fichero'
import { fichero347, fichero349 } from './ficheros349y347'

/** Posiciones del diseño de registro: desde y hasta, empezando en 1. */
const pos = (r: string, desde: number, hasta: number) => r.slice(desde - 1, hasta)
const perfil = { ...perfilBase, nombreFiscal: 'Prueba Núñez Nacho', telefono: '600 11 22 33' }

describe('utilidades', () => {
  it('texto en mayúsculas sin acentos, conservando la Ñ', () => {
    expect(alfa('Peña Ávila, José & Cía.', 25)).toBe('PEÑA AVILA, JOSE CIA.    ')
  })
  it('importes y NIF', () => {
    expect(importe(123456, 13)).toBe('000000000123456')
    expect(nif9('b-12345674')).toBe('B12345674')
  })
})

describe('349', () => {
  const r: Resultado349 = {
    modelo: '349', ejercicio: 2026, periodo: '3T', casillas: {}, resultado: 0, tipo: 'cero', sinActividad: false, avisos: [],
    operadores: [
      { nifIva: 'IE6388047V', pais: 'IE', nombre: 'Irish Ltd', clave: 'S', base: 150000 },
      { nifIva: 'DE123456789', pais: 'DE', nombre: 'Müller GmbH', clave: 'I', base: 2050 }
    ]
  }
  const f = fichero349(perfil, r)
  const [r1, r2, r3] = f.contenido.split('\r\n')

  it('registro de declarante', () => {
    expect(pos(r1!, 1, 17)).toBe('13492026' + '12345678Z')
    expect(pos(r1!, 18, 57)).toBe(alfa('PRUEBA NUÑEZ NACHO', 40))
    expect(pos(r1!, 59, 67)).toBe('600112233')
    expect(pos(r1!, 108, 110)).toBe('349')
    expect(pos(r1!, 136, 137)).toBe('3T')
    expect(pos(r1!, 138, 146)).toBe('000000002')
    expect(pos(r1!, 147, 161)).toBe('000000000152050')
    expect(r1).toHaveLength(500)
  })
  it('registros de operador', () => {
    expect(pos(r2!, 1, 17)).toBe('23492026' + '12345678Z')
    expect(pos(r2!, 76, 77)).toBe('IE')
    expect(pos(r2!, 78, 92)).toBe('6388047V       ')
    expect(pos(r2!, 93, 132).trim()).toBe('IRISH LTD')
    expect(pos(r2!, 133, 133)).toBe('S')
    expect(pos(r2!, 134, 146)).toBe('0000000150000')
    expect(pos(r3!, 93, 132).trim()).toBe('MULLER GMBH')
    expect(pos(r3!, 134, 146)).toBe('0000000002050')
    expect(f.contenido.endsWith('\r\n')).toBe(true)
  })
})

describe('347', () => {
  const r: Resultado347 = {
    modelo: '347', ejercicio: 2026, periodo: '0A', casillas: {}, resultado: 0, tipo: 'cero', sinActividad: false, avisos: [],
    terceros: [
      { nif: 'B12345674', nombre: 'Acme SL', provincia: '28', pais: 'ES', clave: 'B', importe: 302500, trimestres: [242000, 0, 60500, 0] },
      { nif: 'A87654321', nombre: 'Proveedor SA', provincia: '', pais: 'ES', clave: 'A', importe: 400000, trimestres: [0, 400000, 0, 0] }
    ]
  }
  const f = fichero347(perfil, r)
  const [r1, r2, r3] = f.contenido.split('\r\n')

  it('registro de declarante', () => {
    expect(pos(r1!, 1, 17)).toBe('13472026' + '12345678Z')
    expect(pos(r1!, 58, 58)).toBe('T')
    expect(pos(r1!, 136, 144)).toBe('000000002')
    expect(pos(r1!, 145, 160)).toBe(' 000000000702500')
    expect(pos(r1!, 161, 169)).toBe('000000000')
  })
  it('registro de declarado con importes trimestrales', () => {
    expect(pos(r2!, 18, 26)).toBe('B12345674')
    expect(pos(r2!, 76, 80)).toBe('D28  ')
    expect(pos(r2!, 82, 82)).toBe('B')
    expect(pos(r2!, 83, 98)).toBe(' 000000000302500')
    expect(pos(r2!, 136, 151)).toBe(' 000000000242000')
    expect(pos(r2!, 200, 215)).toBe(' 000000000060500')
    expect(pos(r2!, 232, 247)).toBe(' 000000000000000')
    expect(pos(r2!, 300, 305)).toBe('000000')
    expect(r2).toHaveLength(500)
  })
  it('avisa si falta la provincia del proveedor', () => {
    expect(pos(r3!, 77, 78)).toBe('00')
    expect(f.avisos.join(' ')).toMatch(/provincia de Proveedor SA/)
  })
})
