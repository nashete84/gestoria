import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { perfilBase } from '../fixtures'
import type { ClienteNuevo, GastoNuevo, IngresoNuevo } from '../tipos'
import {
  borrarCliente, crearCliente, crearGasto, crearIngreso, ErrorValidacion, guardarPerfil, leerPerfil,
  listarIngresos, periodoTrimestre, resumen
} from './repos'
import { migrar } from './schema'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  migrar(db)
})

const clienteEs: ClienteNuevo = {
  tipo: 'empresa', nombre: 'Acme SL', nif: 'b-12345674', pais: 'es', domicilio: '', codigoPostal: '',
  municipio: '', provincia: '', email: '', notas: ''
}
const ingreso = (clienteId: number, extra: Partial<IngresoNuevo> = {}): IngresoNuevo => ({
  fecha: '2026-02-10', clienteId, concepto: 'Desarrollo web', base: 200000, tipoIva: 21,
  retencionPct: 15, operacion: 'nacional', notas: '', ...extra
})
const gasto = (extra: Partial<GastoNuevo> = {}): GastoNuevo => ({
  fecha: '2026-03-01', proveedor: 'Iberdrola', nifProveedor: '', paisProveedor: 'ES', numeroFactura: 'F1',
  concepto: 'Luz', categoria: 'suministros_vivienda', base: 10000, tipoIva: 21, deduciblePctIrpf: 30,
  deduciblePctIva: 30, retencionPct: 0, operacion: 'nacional', bienInversion: false, notas: '', ...extra
})

it('las migraciones son idempotentes', () => {
  migrar(db)
  expect(db.pragma('user_version', { simple: true })).toBe(1)
})

it('guarda y lee el perfil normalizando el NIF', () => {
  guardarPerfil(db, { ...perfilBase, nif: '12345678-z' })
  expect(leerPerfil(db)?.nif).toBe('12345678Z')
  expect(() => guardarPerfil(db, { ...perfilBase, nif: '123' })).toThrow(ErrorValidacion)
})

describe('clientes', () => {
  it('normaliza NIF y país', () => {
    const c = crearCliente(db, clienteEs)
    expect(c).toMatchObject({ nif: 'B12345674', pais: 'ES' })
  })
  it('rechaza una empresa UE sin prefijo de país', () => {
    expect(() => crearCliente(db, { ...clienteEs, pais: 'FR', nif: '12345678901' })).toThrow(/NIF-IVA/)
  })
  it('no borra un cliente con ingresos', () => {
    const c = crearCliente(db, clienteEs)
    crearIngreso(db, ingreso(c.id))
    expect(() => borrarCliente(db, c.id)).toThrow(/ingreso/)
  })
})

describe('ingresos y resumen', () => {
  it('calcula cuotas al guardar', () => {
    const c = crearCliente(db, clienteEs)
    const i = crearIngreso(db, ingreso(c.id))
    expect(i).toMatchObject({ cuotaIva: 42000, cuotaRetencion: 30000 })
    expect(listarIngresos(db, '2026-01-01', '2026-03-31')).toHaveLength(1)
  })
  it('rechaza IVA en una operación intracomunitaria', () => {
    expect(() => crearIngreso(db, ingreso(1, { operacion: 'intracomunitaria' }))).toThrow(/no llevan IVA/)
  })
  it('resumen del primer trimestre', () => {
    const c = crearCliente(db, clienteEs)
    crearIngreso(db, ingreso(c.id))
    crearIngreso(db, ingreso(c.id, { fecha: '2026-04-01' })) // fuera del trimestre
    crearGasto(db, gasto())
    crearGasto(db, gasto({ proveedor: 'Google Ireland', paisProveedor: 'IE', operacion: 'intracomunitaria', base: 1000, deduciblePctIrpf: 100, deduciblePctIva: 100, categoria: 'software' }))
    crearGasto(db, gasto({ proveedor: 'Apple', base: 150000, bienInversion: true, deduciblePctIrpf: 100, deduciblePctIva: 100 }))
    const { desde, hasta } = periodoTrimestre(2026, 1)
    const r = resumen(db, desde, hasta)
    expect(r.ingresosBase).toBe(200000)
    expect(r.ivaRepercutido).toBe(42000)
    expect(r.gastosDeducibles).toBe(3000 + 1000) // luz al 30% + software; el bien de inversión se amortiza
    // IVA: 42000 + 210 autoliquidado − (630 luz + 210 software + 31500 equipo)
    expect(r.ivaResultado).toBe(42000 + 210 - (630 + 210 + 31500))
    expect(r.bienesInversionPendientes).toBe(1)
  })
})

it('periodoTrimestre', () => {
  expect(periodoTrimestre(2026, 4)).toEqual({ desde: '2026-10-01', hasta: '2026-12-31' })
})
