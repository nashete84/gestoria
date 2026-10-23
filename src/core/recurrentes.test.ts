import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { actualizarRecurrente, borrarRecurrente, crearRecurrente, generarRecurrentes, listarRecurrentes } from './db/recurrentes'
import { guardarPerfil, listarGastos, listarIngresos } from './db/repos'
import { migrar } from './db/schema'
import { perfilBase } from './fixtures'
import { fechaN, fechasPendientes, proximaFecha } from './recurrentes'
import type { GastoNuevo } from './tipos'

describe('fechas de la serie', () => {
  it('ajusta el día a fin de mes sin perder el día original', () => {
    expect([0, 1, 2, 3].map((n) => fechaN('2026-01-31', 'mensual', n))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
    expect(fechaN('2027-11-15', 'trimestral', 1)).toBe('2028-02-15')
    expect(fechaN('2028-02-29', 'anual', 1)).toBe('2029-02-28')
  })

  it('solo da las fechas que faltan, hasta hoy y hasta el fin', () => {
    const r = { inicio: '2026-01-05', fin: null, ultima: '2026-01-05', frecuencia: 'mensual' as const, activa: true }
    expect(fechasPendientes(r, '2026-04-04')).toEqual(['2026-02-05', '2026-03-05'])
    expect(fechasPendientes({ ...r, fin: '2026-02-28' }, '2026-04-04')).toEqual(['2026-02-05'])
    expect(fechasPendientes({ ...r, activa: false }, '2026-04-04')).toEqual([])
    expect(fechasPendientes({ ...r, ultima: null }, '2026-01-05')).toEqual(['2026-01-05'])
    expect(proximaFecha({ ...r, ultima: '2026-03-05' })).toBe('2026-04-05')
    expect(proximaFecha({ ...r, ultima: '2026-03-05', fin: '2026-03-31' })).toBeNull()
  })
})

describe('recurrentes en la base de datos', () => {
  let db: Database.Database
  const cuota: Omit<GastoNuevo, 'fecha'> = {
    proveedor: 'TGSS', nifProveedor: '', paisProveedor: 'ES', numeroFactura: 'X-1', actividadId: null, concepto: 'Cuota autónomos',
    categoria: 'cuota_autonomo', base: 29400, tipoIva: 0, deduciblePctIrpf: 100, deduciblePctIva: 0, retencionPct: 0,
    operacion: 'sin_iva', bienInversion: false, notas: ''
  }
  beforeEach(() => {
    db = new Database(':memory:')
    migrar(db)
    guardarPerfil(db, perfilBase)
  })

  it('crea los gastos que tocan una sola vez, sin repetir el número de factura', () => {
    crearRecurrente(db, { tipo: 'gasto', plantilla: cuota, frecuencia: 'mensual', inicio: '2026-01-31', fin: null, ultima: '2026-01-31', activa: true })
    expect(generarRecurrentes(db, '2026-04-30')).toEqual({ ingresos: 0, gastos: 3, errores: [] })
    expect(generarRecurrentes(db, '2026-04-30')).toEqual({ ingresos: 0, gastos: 0, errores: [] })
    const g = listarGastos(db, '2026-01-01', '2026-12-31')
    expect(g.map((x) => x.fecha)).toEqual(['2026-04-30', '2026-03-31', '2026-02-28'])
    expect(g.every((x) => x.numeroFactura === '' && x.base === 29400)).toBe(true)
    expect(listarRecurrentes(db)[0]!.ultima).toBe('2026-04-30')
  })

  it('los ingresos salen pendientes de cobro con vencimiento a 30 días', () => {
    crearRecurrente(db, {
      tipo: 'ingreso', frecuencia: 'trimestral', inicio: '2026-01-15', fin: null, activa: true,
      plantilla: { clienteId: null, actividadId: null, concepto: 'Iguala', base: 100000, tipoIva: 21, retencionPct: 0, operacion: 'nacional', notas: '', fechaCobro: '2026-01-15' }
    })
    expect(generarRecurrentes(db, '2026-05-01').ingresos).toBe(2)
    const i = listarIngresos(db, '2026-01-01', '2026-12-31')
    expect(i.map((x) => [x.fecha, x.fechaVencimiento, x.fechaCobro])).toEqual([['2026-04-15', '2026-05-15', null], ['2026-01-15', '2026-02-14', null]])
  })

  it('valida, pausa y borra sin tocar lo ya creado', () => {
    expect(() => crearRecurrente(db, { tipo: 'gasto', plantilla: { ...cuota, concepto: '' }, frecuencia: 'mensual', inicio: '2026-01-01', fin: null, activa: true })).toThrow(/concepto/)
    expect(() => crearRecurrente(db, { tipo: 'gasto', plantilla: cuota, frecuencia: 'mensual', inicio: '2026-01-01', fin: '2025-01-01', activa: true })).toThrow(/fin/)
    const r = crearRecurrente(db, { tipo: 'gasto', plantilla: cuota, frecuencia: 'mensual', inicio: '2026-01-01', fin: null, activa: true })
    generarRecurrentes(db, '2026-01-10')
    actualizarRecurrente(db, r.id, { frecuencia: 'mensual', fin: null, activa: false }, '2026-01-10')
    expect(generarRecurrentes(db, '2026-06-10').gastos).toBe(0)
    // Al reanudar se saltan los meses en pausa: el siguiente es el de julio.
    expect(actualizarRecurrente(db, r.id, { frecuencia: 'mensual', fin: null, activa: true }, '2026-06-10').ultima).toBe('2026-06-01')
    expect(generarRecurrentes(db, '2026-07-01').gastos).toBe(1)
    expect(listarGastos(db, '2026-01-01', '2026-12-31').map((g) => g.fecha)).toEqual(['2026-07-01', '2026-01-01'])
    borrarRecurrente(db, r.id)
    expect(listarRecurrentes(db)).toEqual([])
    expect(listarGastos(db, '2026-01-01', '2026-12-31')).toHaveLength(2)
  })

  it('si un recurrente ya no es válido, no crea nada de él y sigue con los demás', () => {
    crearRecurrente(db, { tipo: 'gasto', plantilla: cuota, frecuencia: 'mensual', inicio: '2026-01-01', fin: null, activa: true })
    const malo = crearRecurrente(db, { tipo: 'gasto', plantilla: { ...cuota, concepto: 'Otra' }, frecuencia: 'mensual', inicio: '2026-01-01', fin: null, activa: true })
    db.prepare('UPDATE recurrentes SET plantilla = json_set(plantilla, \'$.actividadId\', \'borrada\') WHERE id = ?').run(malo.id)
    const r = generarRecurrentes(db, '2026-02-01')
    expect(r.gastos).toBe(2)
    expect(r.errores[0]).toMatch(/Otra: La actividad elegida no existe/)
    expect(listarRecurrentes(db).find((x) => x.id === malo.id)!.ultima).toBeNull()
  })
})
