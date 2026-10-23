import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { estadoCobro, importeACobrar, resumirCobros, sumarDias } from './cobros'
import { actualizarCobro, actualizarIngreso, crearCliente, crearIngreso, ErrorValidacion, guardarPerfil, ingresosPendientesDeCobro, listarIngresos } from './db/repos'
import { migrar } from './db/schema'
import { perfilBase } from './fixtures'
import type { IngresoNuevo } from './tipos'

describe('cálculos de cobro', () => {
  it('lo que paga el cliente es base + IVA − retención', () => {
    expect(importeACobrar({ base: 100000, cuotaIva: 21000, cuotaRetencion: 15000 })).toBe(106000)
  })

  it('estado según cobro y vencimiento', () => {
    expect(estadoCobro({ fechaCobro: '2026-01-05', fechaVencimiento: '2026-01-01' }, '2026-03-01')).toBe('cobrado')
    expect(estadoCobro({ fechaCobro: null, fechaVencimiento: '2026-03-01' }, '2026-03-01')).toBe('pendiente') // vence hoy: aún no
    expect(estadoCobro({ fechaCobro: null, fechaVencimiento: '2026-02-28' }, '2026-03-01')).toBe('vencido')
    expect(estadoCobro({ fechaCobro: null, fechaVencimiento: null }, '2030-01-01')).toBe('pendiente')
  })

  it('suma días cruzando meses y años bisiestos', () => {
    expect(sumarDias('2026-01-31', 30)).toBe('2026-03-02')
    expect(sumarDias('2028-02-15', 30)).toBe('2028-03-16')
    expect(sumarDias('2026-12-15', 30)).toBe('2027-01-14')
  })
})

describe('cobros en la base de datos', () => {
  let db: Database.Database
  let clienteId: number
  const ingreso = (extra: Partial<IngresoNuevo> = {}): IngresoNuevo => ({
    fecha: '2026-02-10', clienteId, actividadId: null, concepto: 'Desarrollo', base: 100000, tipoIva: 21,
    retencionPct: 15, operacion: 'nacional', notas: '', ...extra
  })
  beforeEach(() => {
    db = new Database(':memory:')
    migrar(db)
    guardarPerfil(db, perfilBase)
    clienteId = crearCliente(db, { tipo: 'empresa', nombre: 'Acme', nif: 'B12345674', pais: 'ES', domicilio: '', codigoPostal: '', municipio: '', provincia: '', email: '', notas: '' }).id
  })

  it('sin datos de cobro, el ingreso queda pendiente y sin vencimiento', () => {
    const i = crearIngreso(db, ingreso())
    expect(listarIngresos(db, '2026-01-01', '2026-12-31')[0]).toMatchObject({ id: i.id, fechaCobro: null, fechaVencimiento: null })
  })

  it('guarda vencimiento y cobro, y lista los pendientes de cualquier año por vencimiento', () => {
    crearIngreso(db, ingreso({ fecha: '2025-11-01', fechaVencimiento: '2025-12-01' }))
    crearIngreso(db, ingreso({ fechaVencimiento: '2026-03-12' }))
    crearIngreso(db, ingreso({ fechaVencimiento: '2026-03-12', fechaCobro: '2026-03-01' }))
    const pendientes = ingresosPendientesDeCobro(db)
    expect(pendientes.map((p) => p.fechaVencimiento)).toEqual(['2025-12-01', '2026-03-12'])
    expect(resumirCobros(pendientes, '2026-03-01')).toEqual({ pendientes: 2, importePendiente: 212000, vencidos: 1, importeVencido: 106000 })
  })

  it('valida las fechas de cobro', () => {
    expect(() => crearIngreso(db, ingreso({ fechaVencimiento: '2026-02-01' }))).toThrow(/anterior/)
    expect(() => crearIngreso(db, ingreso({ fechaCobro: '2026-02-30' }))).toThrow(/cobro no es válida/)
  })

  it('el cobro se puede cambiar también en ingresos con factura, sin tocar lo fiscal', () => {
    const i = crearIngreso(db, ingreso())
    db.prepare(`INSERT INTO facturas (id, entorno, serie, numero, num_serie, fecha_expedicion, ingreso_id, emisor, cliente, concepto, base, tipo_iva, cuota_iva, retencion_pct, cuota_retencion, operacion)
      VALUES (1, 'prueba', 'PRUEBA-2026', 1, 'PRUEBA-2026-0001', '2026-02-10', ?, '{}', '{}', 'Desarrollo', 100000, 21, 21000, 15, 15000, 'nacional')`).run(i.id)
    db.prepare('UPDATE ingresos SET factura_id = 1 WHERE id = ?').run(i.id)
    expect(() => actualizarIngreso(db, i.id, ingreso({ fechaCobro: '2026-03-01' }))).toThrow(ErrorValidacion)
    const r = actualizarCobro(db, i.id, { fechaVencimiento: '2026-03-12', fechaCobro: '2026-03-01' })
    expect(r).toMatchObject({ fechaCobro: '2026-03-01', fechaVencimiento: '2026-03-12', facturaId: 1, base: 100000 })
    expect(() => actualizarCobro(db, i.id, { fechaVencimiento: '2026-01-01', fechaCobro: null })).toThrow(/anterior/)
    expect(() => actualizarCobro(db, 999, { fechaVencimiento: null, fechaCobro: null })).toThrow(/no existe/)
  })
})
