import { describe, expect, it } from 'vitest'
import { nuevaActividad } from '../epigrafes'
import { perfilBase } from '../fixtures'
import type { Gasto, Ingreso, Perfil } from '../tipos'
import { amortizar, aplicarEscala, calcularRenta, DATOS_RENTA_VACIOS, minimoPersonalFamiliar, validarDatosRenta, type DatosRenta } from './calculo'
import { parametrosDe } from './parametros'

const e = (euros: number) => Math.round(euros * 100)
const p2025 = parametrosDe(2025)

let n = 0
const ingreso = (fecha: string, base: number, extra: Partial<Ingreso> = {}): Ingreso => ({
  id: ++n, fecha, clienteId: null, actividadId: null, concepto: 'Servicios', base: e(base), tipoIva: 0, cuotaIva: 0,
  retencionPct: 0, cuotaRetencion: 0, operacion: 'no_sujeta', facturaId: null, notas: '', fechaVencimiento: null, fechaCobro: null, ...extra
})
const gasto = (fecha: string, base: number, extra: Partial<Gasto> = {}): Gasto => ({
  id: ++n, fecha, proveedor: 'Proveedor', nifProveedor: '', paisProveedor: 'ES', numeroFactura: '', actividadId: null,
  concepto: 'Gasto', categoria: 'otros', base: e(base), tipoIva: 21, cuotaIva: 0, deduciblePctIrpf: 100, deduciblePctIva: 100,
  retencionPct: 0, cuotaRetencion: 0, operacion: 'nacional', bienInversion: false, notas: '', ...extra
})
const renta = (ingresos: Ingreso[], gastos: Gasto[], datos: Partial<DatosRenta> = {}, pagos130 = 0, perfil: Perfil = perfilBase) =>
  calcularRenta({ ejercicio: 2025, perfil, ingresos, gastos, pagos130, datos: { ...DATOS_RENTA_VACIOS, ...datos } })

describe('aplicarEscala', () => {
  it('escala general estatal sobre 30.000 €', () => {
    // 12.450×9,5% + 7.750×12% + 9.800×15% = 3.582,75
    expect(aplicarEscala(p2025.escalaGeneralEstatal, e(30000))).toBe(e(3582.75))
  })
  it('escala de Madrid sobre 30.000 €', () => {
    // 13.362,22×8,5% + 5.642,41×10,7% + 10.995,37×12,8% = 3.146,93
    expect(aplicarEscala(p2025.escalasAutonomicas.MD!.general, e(30000))).toBe(e(3146.93))
  })
  it('base cero o negativa no paga', () => {
    expect(aplicarEscala(p2025.escalaGeneralEstatal, 0)).toBe(0)
    expect(aplicarEscala(p2025.escalaGeneralEstatal, -100)).toBe(0)
  })
})

describe('minimoPersonalFamiliar', () => {
  it('suma edad y descendientes por orden, con el plus por menor de 3 años', () => {
    const d = { ...DATOS_RENTA_VACIOS, anioNacimiento: 1955, descendientes: [{ anioNacimiento: 2024, compartido: false }, { anioNacimiento: 2010, compartido: false }] }
    // 5.550 + 1.150 (más de 65) + 2.400 (1º, el mayor) + 2.700 + 2.800 (2º, menor de 3)
    expect(minimoPersonalFamiliar(p2025.minimosEstatales, 2025, d)).toBe(e(14600))
  })
  it('hijo compartido cuenta la mitad; mayores de 25 no cuentan', () => {
    const d = { ...DATOS_RENTA_VACIOS, descendientes: [{ anioNacimiento: 2015, compartido: true }, { anioNacimiento: 1990, compartido: false }] }
    expect(minimoPersonalFamiliar(p2025.minimosEstatales, 2025, d)).toBe(e(5550 + 1200))
  })
})

describe('discapacidad y dependencia', () => {
  it('hijo con discapacidad del 33% y dependencia suma 3.000 + 3.000 aunque tenga más de 25 años', () => {
    const d = { ...DATOS_RENTA_VACIOS, descendientes: [{ anioNacimiento: 1995, compartido: false, discapacidad: 33 as const, asistencia: true }] }
    expect(minimoPersonalFamiliar(p2025.minimosEstatales, 2025, d)).toBe(e(5550 + 2400 + 3000 + 3000))
  })
  it('grado del 65% incluye siempre la asistencia; compartido se reparte al 50%', () => {
    const d = { ...DATOS_RENTA_VACIOS, descendientes: [{ anioNacimiento: 2015, compartido: true, discapacidad: 65 as const }] }
    expect(minimoPersonalFamiliar(p2025.minimosEstatales, 2025, d)).toBe(e(5550 + (2400 + 9000 + 3000) / 2))
  })
  it('discapacidad del propio contribuyente', () => {
    const d = { ...DATOS_RENTA_VACIOS, discapacidad: 33 as const }
    expect(minimoPersonalFamiliar(p2025.minimosEstatales, 2025, d)).toBe(e(8550))
  })
  it('valida el grado', () => {
    expect(validarDatosRenta({ ...DATOS_RENTA_VACIOS, discapacidad: 50 as never }, 2025)).toHaveLength(1)
  })
})

describe('amortizar', () => {
  const ordenador = gasto('2024-07-01', 1200, { categoria: 'equipos', bienInversion: true })
  it('prorratea el primer año por días', () => {
    // 1.200 × 26% × 184/366
    expect(amortizar(ordenador, 2024, p2025, 'a1')?.delEjercicio).toBe(e(156.85))
  })
  it('años completos al coeficiente máximo', () => {
    expect(amortizar(ordenador, 2025, p2025, 'a1')).toMatchObject({ acumuladaAnterior: e(156.85), delEjercicio: e(312) })
  })
  it('el último año amortiza solo lo pendiente y después nada', () => {
    expect(amortizar(ordenador, 2028, p2025, 'a1')).toMatchObject({ delEjercicio: e(107.15), pendiente: 0 })
    expect(amortizar(ordenador, 2029, p2025, 'a1')).toBeNull()
  })
  it('solo amortiza bienes de inversión comprados hasta el ejercicio', () => {
    expect(amortizar({ ...ordenador, bienInversion: false }, 2025, p2025, 'a1')).toBeNull()
    expect(amortizar(ordenador, 2023, p2025, 'a1')).toBeNull()
  })
})

describe('calcularRenta', () => {
  it('caso completo: 40.000 de ingresos y 4.000 de gastos, con pagos del 130', () => {
    const r = renta([ingreso('2025-03-01', 40000)], [gasto('2025-02-01', 4000), gasto('2024-12-01', 999)], {}, e(5000))
    expect(r.actividades[0]).toMatchObject({ ingresos: e(40000), gastos: e(4000), rendimientoPrevio: e(36000), dificilJustificacion: e(1800), rendimientoNeto: e(34200) })
    expect(r.reduccionActividad).toBe(0)
    expect(r.baseLiquidableGeneral).toBe(e(34200))
    // Estatal: escala(34.200) − escala(5.550) = 4.212,75 − 527,25
    expect(r.cuotaEstatal.general).toBe(e(3685.5))
    // Madrid: escala(34.200) − escala(6.105) = 3.684,53 − 518,93
    expect(r.cuotaAutonomica.general).toBe(e(3165.6))
    expect(r.cuotaLiquida).toBe(e(6851.1))
    expect(r.resultado).toBe(e(1851.1))
  })
  it('el 5% de difícil justificación tiene un máximo de 2.000 €', () => {
    expect(renta([ingreso('2025-01-10', 60000)], []).actividades[0]!.dificilJustificacion).toBe(e(2000))
  })
  it('el máximo de 2.000 € se reparte entre actividades', () => {
    const perfil = { ...perfilBase, actividades: [...perfilBase.actividades, nuevaActividad({ seccion: 1, codigo: '844', descripcion: 'Publicidad' }, 'a2', false)] }
    const r = renta([ingreso('2025-01-10', 60000), ingreso('2025-01-11', 20000, { actividadId: 'a2' })], [], {}, 0, perfil)
    expect(r.actividades.map((a) => a.dificilJustificacion)).toEqual([e(1500), e(500)])
  })
  it('rentas por debajo de 12.000 €: reducción del art. 32.2.3º', () => {
    // Neto 9.500 → 1.620 − 0,405 × 1.500 = 1.012,50
    const r = renta([ingreso('2025-05-01', 10000)], [])
    expect(r.tipoReduccion).toBe('rentas_bajas')
    expect(r.reduccionActividad).toBe(e(1012.5))
    expect(r.rendimientoReducido).toBe(e(8487.5))
  })
  it('autónomo dependiente: sin 5% y reducción de 2.000 + 6.498 limitada al rendimiento', () => {
    const r = renta([ingreso('2025-05-01', 12000)], [], { autonomoDependiente: true })
    expect(r.actividades[0]!.dificilJustificacion).toBe(0)
    expect(r.reduccionActividad).toBe(e(8498))
    const bajo = renta([ingreso('2025-05-01', 5000)], [], { autonomoDependiente: true })
    expect(bajo.reduccionActividad).toBe(e(5000))
  })
  it('planes de pensiones: límite de 1.500 € más 4.250 € de plan de autónomos', () => {
    const r = renta([ingreso('2025-05-01', 50000)], [], { aportacionesPensiones: e(3000), aportacionesPpes: e(5000) })
    expect(r.reduccionPensiones).toBe(e(5750))
  })
  it('retenciones y pagos a cuenta pueden dar resultado a devolver', () => {
    const r = renta([ingreso('2025-05-01', 20000, { cuotaRetencion: e(3000) })], [], { retencionesOtras: e(500) }, e(1000))
    expect(r.retencionesActividad).toBe(e(3000))
    expect(r.resultado).toBe(r.cuotaLiquida - e(4500))
    expect(r.resultado).toBeLessThan(0)
  })
  it('las deducciones no dejan la cuota en negativo', () => {
    const r = renta([ingreso('2025-05-01', 15000)], [], { deducciones: e(100000) })
    expect(r.cuotaLiquida).toBe(0)
  })
  it('ignora ingresos de otros años', () => {
    const r = renta([ingreso('2024-12-31', 9999), ingreso('2025-01-01', 1000)], [])
    expect(r.actividades[0]!.ingresos).toBe(e(1000))
  })
})

describe('parametros y validación', () => {
  it('un año sin parámetros usa los del último año y avisa', () => {
    const p = parametrosDe(2026)
    expect(p.ejercicio).toBe(2026)
    expect(p.avisos.join(' ')).toMatch(/2025/)
  })
  it('desde 2025 sube el último tramo estatal del ahorro', () => {
    expect(parametrosDe(2024).escalaAhorroEstatal.at(-1)!.tipo).toBe(14)
    expect(parametrosDe(2025).escalaAhorroEstatal.at(-1)!.tipo).toBe(15)
  })
  it('valida importes y años', () => {
    expect(validarDatosRenta(DATOS_RENTA_VACIOS, 2025)).toEqual([])
    expect(validarDatosRenta({ ...DATOS_RENTA_VACIOS, deducciones: -1, anioNacimiento: 2030 }, 2025)).toHaveLength(2)
  })
})
