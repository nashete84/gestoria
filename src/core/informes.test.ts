import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { informeImpuestosDb, informeIngresosGastosDb, ingresosConRetencion, prevision, simulacionIrpf } from './db/informes'
import { crearCliente, crearGasto, crearIngreso, ErrorValidacion, guardarPerfil, registrarPresentacion } from './db/repos'
import { migrar } from './db/schema'
import { perfilBase } from './fixtures'
import { preverIngresos } from './prevision'
import { DATOS_RENTA_VACIOS } from './renta/calculo'
import { simularIrpf } from './simulador'
import type { Ingreso } from './tipos'

const e = (euros: number) => Math.round(euros * 100)
let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  migrar(db)
  guardarPerfil(db, perfilBase) // alta en 2023
})
const ingreso = (fecha: string, euros: number, extra: { clienteId?: number; retencionPct?: number } = {}) => crearIngreso(db, {
  fecha, clienteId: extra.clienteId ?? null, actividadId: null, concepto: 'Servicios', base: e(euros), tipoIva: 21,
  retencionPct: extra.retencionPct ?? 0, operacion: 'nacional', notas: ''
})
const gasto = (fecha: string, euros: number, categoria = 'software', deduciblePctIrpf = 100) => crearGasto(db, {
  fecha, proveedor: 'Proveedor', nifProveedor: 'B12345674', paisProveedor: 'ES', numeroFactura: '', actividadId: null, concepto: 'Gasto',
  categoria, base: e(euros), tipoIva: 21, deduciblePctIrpf, deduciblePctIva: 100, retencionPct: 0, operacion: 'nacional', bienInversion: false, notas: ''
})

describe('gastos e ingresos', () => {
  it('suma por mes, por categoría y por cliente, y compara con el año anterior hasta la misma fecha', () => {
    const c = crearCliente(db, { tipo: 'empresa', nombre: 'Acme', nif: 'B12345674', pais: 'ES', domicilio: '', codigoPostal: '', municipio: '', provincia: '', email: '', notas: '' })
    ingreso('2026-01-15', 1000, { clienteId: c.id })
    ingreso('2026-03-10', 2000)
    gasto('2026-01-20', 100)
    gasto('2026-03-01', 50, 'formacion')
    ingreso('2025-02-01', 1500) // antes de la fecha de hoy del año pasado
    ingreso('2025-11-01', 9999) // después: no cuenta para comparar
    const r = informeIngresosGastosDb(db, 2026, '2026-10-21')
    expect(r.meses[0]).toEqual({ mes: 1, ingresos: e(1000), gastos: e(100), resultado: e(900) })
    expect(r.meses[2]!.resultado).toBe(e(1950))
    expect(r.ingresos).toBe(e(3000))
    expect(r.margen).toBe(95)
    expect(r.gastosPorCategoria.map((p) => p.nombre)).toEqual(['Software y suscripciones', 'Formación y libros'])
    expect(r.ingresosPorCliente).toEqual([
      { clave: '', nombre: 'Sin cliente', importe: e(2000) },
      { clave: String(c.id), nombre: 'Acme', importe: e(1000) }
    ])
    expect(r.anterior).toEqual({ ingresos: e(1500), gastos: 0 })
    expect(informeIngresosGastosDb(db, 2024, '2026-10-21').anterior).toBeNull()
  })
})

describe('impuestos', () => {
  it('junta lo presentado y lo estimado de cada trimestre hasta el actual, y la renta', () => {
    ingreso('2026-02-01', 10000, { retencionPct: 15 })
    ingreso('2026-05-01', 10000, { retencionPct: 15 })
    registrarPresentacion(db, { modelo: '303', ejercicio: 2026, periodo: '1T', fechaPresentacion: '2026-04-15', resultado: 'ingresar', importe: e(2100), justificante: '', notas: '' })
    const r = informeImpuestosDb(db, 2026, '2026-05-21')
    const clave = r.lineas.map((l) => `${l.modelo}-${l.periodo}-${l.presentado ? 'P' : 'E'}`)
    expect(clave).toEqual(['303-1T-P', '130-1T-E', '303-2T-E', '130-2T-E', '100-0A-E'])
    const iva = r.grupos.find((g) => g.grupo === 'iva')!
    expect(iva).toEqual({ grupo: 'iva', pagado: e(2100), pendiente: e(2100) })
    expect(r.retencionesSoportadas).toBe(e(3000))
    expect(r.avisos.join(' ')).toMatch(/estimación/)
    expect(informeImpuestosDb(db, 2027, '2026-05-21').lineas).toEqual([])
  })
})

describe('simulador de IRPF', () => {
  it('calcula la renta y el tipo marginal con los importes elegidos', () => {
    const r = simularIrpf(2025, perfilBase, DATOS_RENTA_VACIOS, { ingresos: e(40000), gastos: e(5000), retenciones: e(6000), pagos130: 0 })
    // 35.000 − 5% (1.750) = 33.250 de rendimiento neto
    expect(r.estimacion.rendimientoActividades).toBe(e(33250))
    expect(r.neto).toBe(e(35000) - r.irpf)
    expect(r.estimacion.resultado).toBe(r.irpf - e(6000))
    // Tramo de 20.200 a 35.200 en Madrid: alrededor de un 30 % (algo menos por el 5 % de difícil justificación).
    expect(r.tipoMarginal).toBeGreaterThan(25)
    expect(r.tipoMarginal).toBeLessThan(35)
    expect(r.estimacion.avisos.join(' ')).not.toMatch(/No hay ingresos registrados/)
  })

  it('más ingresos, más IRPF', () => {
    const base = { ingresos: e(20000), gastos: 0, retenciones: 0, pagos130: 0 }
    const a = simularIrpf(2025, perfilBase, DATOS_RENTA_VACIOS, base)
    const b = simularIrpf(2025, perfilBase, DATOS_RENTA_VACIOS, { ...base, ingresos: e(60000) })
    expect(b.irpf).toBeGreaterThan(a.irpf)
    expect(b.tipoMarginal).toBeGreaterThan(a.tipoMarginal)
  })

  it('valida los importes', () => {
    expect(() => simulacionIrpf(db, 2026, { ingresos: -1, gastos: 0, retenciones: 0, pagos130: 0 })).toThrow(ErrorValidacion)
  })
})

describe('previsión de ingresos', () => {
  const mk = (fecha: string, euros: number): Ingreso => ({
    id: 0, fecha, clienteId: null, actividadId: null, concepto: '', base: e(euros), tipoIva: 21, cuotaIva: 0,
    retencionPct: 15, cuotaRetencion: e(euros * 0.15), operacion: 'nacional', facturaId: null, notas: ''
  })

  it('repite la media de los últimos 6 meses completos hasta diciembre', () => {
    // Abr a sep: 3.000 €/mes; en octubre (mes en curso) ya llevas 1.000.
    const ingresos = ['04', '05', '06', '07', '08', '09'].map((m) => mk(`2026-${m}-10`, 3000)).concat(mk('2026-10-05', 1000), mk('2026-01-10', 500))
    const p = preverIngresos({ ejercicio: 2026, hoy: '2026-10-21', perfil: perfilBase, datos: DATOS_RENTA_VACIOS, ingresos, gastos: [], gastosDeduciblesReales: 0, pagos130: 0 })
    expect(p.mediaIngresos).toBe(e(3000))
    expect(p.mesesBase).toBe(6)
    expect(p.meses[8]).toEqual({ mes: 9, real: e(3000), previsto: null })
    expect(p.meses[9]).toEqual({ mes: 10, real: e(1000), previsto: e(2000) })
    expect(p.meses[11]).toEqual({ mes: 12, real: null, previsto: e(3000) })
    expect(p.ingresosReales).toBe(e(19500))
    expect(p.ingresosPrevistos).toBe(e(8000))
    expect(p.simulacion.entrada.ingresos).toBe(e(27500))
    // Retenciones: el 15 % también sobre lo previsto.
    expect(p.simulacion.entrada.retenciones).toBe(e(27500 * 0.15))
    expect(p.irpfPendiente).toBe(Math.max(0, p.simulacion.irpf - e(19500 * 0.15)))
  })

  it('con un alta reciente usa solo los meses desde el alta y avisa', () => {
    const perfil = { ...perfilBase, fechaAlta: '2026-08-01' }
    const p = preverIngresos({ ejercicio: 2026, hoy: '2026-10-21', perfil, datos: DATOS_RENTA_VACIOS, ingresos: [mk('2026-08-10', 2000), mk('2026-09-10', 4000)], gastos: [], gastosDeduciblesReales: 0, pagos130: 0 })
    expect(p.mesesBase).toBe(2)
    expect(p.mediaIngresos).toBe(e(3000))
    expect(p.avisos.join(' ')).toMatch(/cautela/)
  })

  it('un año ya cerrado no tiene previsión', () => {
    ingreso('2025-03-01', 1000)
    const p = prevision(db, 2025, '2026-10-21')
    expect(p.ingresosPrevistos).toBe(0)
    expect(p.meses.every((m) => m.previsto === null)).toBe(true)
    expect(p.ingresosAnio).toBe(e(1000))
  })
})

describe('sin pago fraccionado (130)', () => {
  it('el informe de impuestos y la previsión no cuentan con el 130', () => {
    guardarPerfil(db, { ...perfilBase, exento130: true })
    ingreso('2026-02-01', 10000)
    const r = informeImpuestosDb(db, 2026, '2026-05-21')
    expect(r.lineas.some((l) => l.modelo === '130')).toBe(false)
    expect(prevision(db, 2026, '2026-05-21').presenta130).toBe(false)
  })

  it('calcula qué parte de los ingresos llevó retención (regla del 70 %)', () => {
    ingreso('2025-02-01', 7000, { retencionPct: 15 })
    ingreso('2025-03-01', 3000) // cliente extranjero: sin retención
    expect(ingresosConRetencion(db, 2025)).toEqual({ total: e(10000), conRetencion: e(7000), pct: 70 })
    expect(ingresosConRetencion(db, 2024).pct).toBeNull()
  })
})
