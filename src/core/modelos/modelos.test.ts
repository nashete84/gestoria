import { describe, expect, it } from 'vitest'
import { perfilBase } from '../fixtures'
import type { Cliente, Gasto, Ingreso } from '../tipos'
import { calcular130 } from './m130'
import { calcular303 } from './m303'
import { calcular111, calcular115 } from './retenciones'
import { calcular347, calcular349 } from './declarativos'
import { AJUSTES_VACIOS } from './tipos'

const e = (euros: number) => Math.round(euros * 100)
let n = 0
const ingreso = (fecha: string, base: number, extra: Partial<Ingreso> = {}): Ingreso => {
  const tipoIva = extra.tipoIva ?? (extra.operacion && extra.operacion !== 'nacional' ? 0 : 21)
  const retencionPct = extra.retencionPct ?? 0
  return {
    id: ++n, fecha, clienteId: null, actividadId: null, concepto: 'Servicios', base: e(base), tipoIva,
    cuotaIva: Math.round(e(base) * tipoIva / 100), retencionPct, cuotaRetencion: Math.round(e(base) * retencionPct / 100),
    operacion: 'nacional', facturaId: null, notas: '', ...extra
  }
}
const gasto = (fecha: string, base: number, extra: Partial<Gasto> = {}): Gasto => {
  const tipoIva = extra.tipoIva ?? 21
  const retencionPct = extra.retencionPct ?? 0
  return {
    id: ++n, fecha, proveedor: 'Proveedor', nifProveedor: 'B12345674', paisProveedor: 'ES', numeroFactura: '', actividadId: null,
    concepto: 'Gasto', categoria: 'otros', base: e(base), tipoIva, cuotaIva: Math.round(e(base) * tipoIva / 100),
    deduciblePctIrpf: 100, deduciblePctIva: 100, retencionPct, cuotaRetencion: Math.round(e(base) * retencionPct / 100),
    operacion: 'nacional', bienInversion: false, notas: '', ...extra
  }
}

describe('303', () => {
  it('reparte devengado y deducible en sus casillas', () => {
    const r = calcular303({
      ejercicio: 2026, trimestre: 1, ajustes: AJUSTES_VACIOS,
      ingresos: [ingreso('2026-01-10', 1000), ingreso('2026-02-10', 2000, { operacion: 'no_sujeta' }), ingreso('2026-03-10', 500, { operacion: 'intracomunitaria' }), ingreso('2026-04-01', 9999)],
      gastos: [
        gasto('2026-01-15', 100),
        gasto('2026-01-20', 1000, { bienInversion: true }),
        gasto('2026-02-01', 50, { operacion: 'intracomunitaria' }),
        gasto('2026-02-02', 30, { operacion: 'extracomunitaria' }),
        gasto('2026-03-01', 200, { deduciblePctIva: 50 }),
        gasto('2026-03-02', 300, { operacion: 'sin_iva', tipoIva: 0 })
      ]
    })
    const c = r.casillas
    expect([c['07'], c['08'], c['09']]).toEqual([e(1000), 2100, e(210)])
    expect(c['120']).toBe(e(2000))
    expect(c['59']).toBe(e(500))
    expect([c['10'], c['11'], c['12'], c['13']]).toEqual([e(50), e(10.5), e(30), e(6.3)])
    expect(c['27']).toBe(e(210 + 10.5 + 6.3))
    // Interiores corrientes: 100 + 30 (ISP extracomunitaria) + 50% de 200
    expect([c['28'], c['29']]).toEqual([e(230), e(48.3)])
    expect([c['30'], c['31']]).toEqual([e(1000), e(210)])
    expect([c['36'], c['37']]).toEqual([e(50), e(10.5)])
    expect(c['45']).toBe(e(48.3 + 210 + 10.5))
    expect(c['46']).toBe(e(226.8 - 268.8))
    expect(r.tipo).toBe('compensar')
  })

  it('arrastra lo que queda a compensar al trimestre siguiente', () => {
    const datos = { ejercicio: 2026, ajustes: { ...AJUSTES_VACIOS, compensar303Inicial: e(10) },
      ingresos: [ingreso('2026-05-01', 1000)], gastos: [gasto('2026-02-01', 500)] }
    const t1 = calcular303({ ...datos, trimestre: 1 })
    expect(t1.casillas['71']).toBe(e(-105))
    expect(t1.casillas['87']).toBe(e(10))
    const t2 = calcular303({ ...datos, trimestre: 2 })
    expect(t2.casillas['110']).toBe(e(115))
    expect(t2.casillas['78']).toBe(e(115))
    expect(t2.casillas['71']).toBe(e(210 - 115))
    expect(t2.tipo).toBe('ingresar')
  })

  it('4T negativo: devolución o compensar según los ajustes', () => {
    const datos = { ejercicio: 2026, trimestre: 4 as const, ingresos: [], gastos: [gasto('2026-11-01', 100)] }
    expect(calcular303({ ...datos, ajustes: AJUSTES_VACIOS }).tipo).toBe('devolver')
    expect(calcular303({ ...datos, ajustes: { ...AJUSTES_VACIOS, devolucion303: false } }).tipo).toBe('compensar')
  })

  it('sin operaciones: sin actividad', () => {
    const r = calcular303({ ejercicio: 2026, trimestre: 2, ingresos: [], gastos: [gasto('2026-04-01', 50, { operacion: 'sin_iva', tipoIva: 0 })], ajustes: AJUSTES_VACIOS })
    expect(r.sinActividad).toBe(true)
    expect(r.tipo).toBe('cero')
  })
})

describe('130', () => {
  const base = { perfil: perfilBase, ejercicio: 2026, rendimientoAnterior: e(30000), sinDificilJustificacion: false }

  it('acumula desde enero, con el 5% y restando pagos anteriores y retenciones', () => {
    const ingresos = [ingreso('2026-02-01', 10000), ingreso('2026-05-01', 10000, { retencionPct: 15 })]
    const gastos = [gasto('2026-03-01', 2000)]
    const t1 = calcular130({ ...base, trimestre: 1, ingresos, gastos })
    // 10.000 − 2.000 − 5% de 8.000 = 7.600 → 20% = 1.520
    expect(t1.casillas).toMatchObject({ '01': e(10000), '02': e(2400), '03': e(7600), '04': e(1520), '05': 0, '06': 0, '07': e(1520), '19': e(1520) })
    const t2 = calcular130({ ...base, trimestre: 2, ingresos, gastos })
    // 20.000 − 2.000 − 900 = 17.100 → 3.420 − 1.520 − 1.500
    expect(t2.casillas).toMatchObject({ '02': e(2900), '04': e(3420), '05': e(1520), '06': e(1500), '07': e(400), '19': e(400) })
  })

  it('minoración de la casilla 13 según el rendimiento del año anterior', () => {
    const r = calcular130({ ...base, rendimientoAnterior: e(9500), trimestre: 1, ingresos: [ingreso('2026-02-01', 5000)], gastos: [] })
    expect(r.casillas['13']).toBe(e(75))
    expect(r.casillas['19']).toBe(e(950 - 75))
    const sin = calcular130({ ...base, rendimientoAnterior: null, trimestre: 1, ingresos: [ingreso('2026-02-01', 5000)], gastos: [] })
    expect(sin.casillas['13']).toBe(0)
    expect(sin.avisos.join(' ')).toMatch(/casilla 13/)
  })

  it('resultado negativo: a deducir en los siguientes; en el 4T, negativa', () => {
    const ingresos = [ingreso('2026-01-10', 1000)]
    const t1 = calcular130({ ...base, rendimientoAnterior: 0, trimestre: 1, ingresos, gastos: [] })
    // 20% de 950 = 190 − 100 de minoración = 90
    expect(t1.casillas['19']).toBe(e(90))
    const t2 = calcular130({ ...base, rendimientoAnterior: 0, trimestre: 2, ingresos, gastos: [] })
    // 07 = 190 − 190 = 0 → 12 = 0, 14 = −100
    expect(t2.casillas['14']).toBe(e(-100))
    expect(t2.tipo).toBe('compensar')
    const t3 = calcular130({ ...base, rendimientoAnterior: e(50000), trimestre: 3, ingresos: [...ingresos, ingreso('2026-08-01', 5000)], gastos: [] })
    expect(t3.casillas['15']).toBe(0) // con rendimiento alto no hay minoración ni negativos previos
    const t4 = calcular130({ ...base, rendimientoAnterior: 0, trimestre: 4, ingresos, gastos: [] })
    expect(t4.tipo).toBe('negativa')
  })

  it('aplica los negativos pendientes cuando vuelve a salir positivo', () => {
    const ingresos = [ingreso('2026-01-10', 1000), ingreso('2026-08-01', 2000)]
    const t3 = calcular130({ ...base, rendimientoAnterior: 0, trimestre: 3, ingresos, gastos: [] })
    // T3: acumulado 3.000 − 150 = 2.850 → 570 − 190 = 380 − 100 = 280; negativos del T2: 100
    expect(t3.casillas).toMatchObject({ '07': e(380), '14': e(280), '15': e(100), '19': e(180) })
  })
})

describe('111 y 115', () => {
  const gastos = [
    gasto('2026-04-10', 500, { categoria: 'profesionales', retencionPct: 15 }),
    gasto('2026-05-10', 300, { categoria: 'profesionales', retencionPct: 15 }),
    gasto('2026-05-11', 200, { categoria: 'profesionales', retencionPct: 15, nifProveedor: '12345678Z' }),
    gasto('2026-04-01', 1000, { categoria: 'alquiler_local', retencionPct: 19 }),
    gasto('2026-01-01', 1000, { categoria: 'profesionales', retencionPct: 15 })
  ]
  it('111: perceptores, base y retenciones del trimestre', () => {
    const r = calcular111(gastos, 2026, 2)
    expect(r.casillas).toMatchObject({ '07': 2, '08': e(1000), '09': e(150), '28': e(150), '30': e(150) })
    expect(r.tipo).toBe('ingresar')
  })
  it('115: alquileres', () => {
    expect(calcular115(gastos, 2026, 2).casillas).toMatchObject({ '01': 1, '02': e(1000), '03': e(190), '05': e(190) })
    expect(calcular115(gastos, 2026, 3).tipo).toBe('cero')
  })
})

describe('349 y 347', () => {
  const cliente = (id: number, extra: Partial<Cliente>): Cliente => ({
    id, tipo: 'empresa', nombre: `Cliente ${id}`, nif: '', pais: 'ES', domicilio: '', codigoPostal: '28013', municipio: '', provincia: '', email: '', notas: '', ...extra
  })
  const clientes = [cliente(1, { nif: '6388047V', pais: 'IE', nombre: 'Irish Ltd' }), cliente(2, { nif: 'B12345674', nombre: 'Acme SL' }), cliente(3, { pais: 'GB', nombre: 'UK Ltd' })]

  it('349: agrupa por operador y clave, con prefijo de país', () => {
    const r = calcular349(
      [ingreso('2026-01-10', 1000, { operacion: 'intracomunitaria', clienteId: 1 }), ingreso('2026-02-10', 500, { operacion: 'intracomunitaria', clienteId: 1 }), ingreso('2026-02-11', 700, { operacion: 'no_sujeta', clienteId: 3 })],
      [gasto('2026-03-01', 20, { operacion: 'intracomunitaria', nifProveedor: 'IE9692928F', paisProveedor: 'IE', proveedor: 'Google' })],
      clientes, 2026, 1)
    expect(r.operadores).toEqual([
      { nifIva: 'IE6388047V', pais: 'IE', nombre: 'Irish Ltd', clave: 'S', base: e(1500) },
      { nifIva: 'IE9692928F', pais: 'IE', nombre: 'Google', clave: 'I', base: e(20) }
    ])
  })

  it('347: terceros nacionales sin retención por encima de 3.005,06 € con IVA', () => {
    const r = calcular347(
      [ingreso('2026-01-10', 2000, { clienteId: 2 }), ingreso('2026-07-10', 500, { clienteId: 2 }), ingreso('2026-02-10', 9000, { clienteId: 2, retencionPct: 15 })],
      [gasto('2026-03-01', 2400), gasto('2026-01-31', 5000, { categoria: 'cuota_autonomo', operacion: 'nacional', tipoIva: 0 })],
      clientes, 2026)
    // Ventas: (2.000 + 500) × 1,21 = 3.025; compras: 2.400 × 1,21 = 2.904 (no llega)
    expect(r.terceros).toEqual([{ nif: 'B12345674', nombre: 'Acme SL', provincia: '28', pais: 'ES', clave: 'B', importe: e(3025), trimestres: [e(2420), 0, e(605), 0] }])
  })
})
