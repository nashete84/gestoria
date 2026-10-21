import Database from 'better-sqlite3'
import { beforeEach, expect, it } from 'vitest'
import { perfilBase } from '../fixtures'
import { AJUSTES_VACIOS } from '../modelos/tipos'
import { calcularModelo, guardarAjustesModelos, leerAjustesModelos, rendimientoAnterior } from './modelos'
import { crearIngreso, ErrorValidacion, guardarPerfil } from './repos'
import { migrar } from './schema'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  migrar(db)
  guardarPerfil(db, perfilBase) // alta en 2023
})
const ingreso = (fecha: string, base: number) => crearIngreso(db, {
  fecha, clienteId: null, actividadId: null, concepto: 'Servicios', base, tipoIva: 21, retencionPct: 0, operacion: 'nacional', notas: ''
})

it('guarda y valida los ajustes por ejercicio', () => {
  expect(leerAjustesModelos(db, 2026)).toEqual(AJUSTES_VACIOS)
  guardarAjustesModelos(db, 2026, { compensar303Inicial: 5000, devolucion303: false, rendimientoAnterior: 900000 })
  expect(leerAjustesModelos(db, 2026)).toEqual({ compensar303Inicial: 5000, devolucion303: false, rendimientoAnterior: 900000 })
  expect(() => guardarAjustesModelos(db, 2026, { ...AJUSTES_VACIOS, compensar303Inicial: -1 })).toThrow(ErrorValidacion)
})

it('rendimiento del año anterior: manual, calculado o desconocido', () => {
  expect(rendimientoAnterior(db, 2026)).toEqual({ importe: null, origen: 'desconocido' })
  expect(rendimientoAnterior(db, 2023)).toEqual({ importe: 0, origen: 'sin_actividad' })
  ingreso('2025-05-01', 1000000)
  // 10.000 − 5% = 9.500
  expect(rendimientoAnterior(db, 2026)).toEqual({ importe: 950000, origen: 'calculado' })
  guardarAjustesModelos(db, 2026, { ...AJUSTES_VACIOS, rendimientoAnterior: 100 })
  expect(rendimientoAnterior(db, 2026).origen).toBe('manual')
})

it('calcula los modelos con los datos guardados', () => {
  ingreso('2026-02-01', 100000)
  const r303 = calcularModelo(db, '303', 2026, '1T')
  expect(r303.casillas['09']).toBe(21000)
  const r130 = calcularModelo(db, '130', 2026, '1T')
  expect(r130.avisos.join(' ')).toMatch(/rendimiento neto de 2025/)
  expect(() => calcularModelo(db, '303', 2026, '0A')).toThrow(/trimestral/)
  expect(calcularModelo(db, '390', 2026, '0A').casillas['06']).toBe(21000)
  expect(() => calcularModelo(db, '190', 2026, '0A')).toThrow(/aún no/)
})
