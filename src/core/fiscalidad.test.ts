import { describe, expect, it } from 'vitest'
import { calcularGasto, calcularIngreso, retencionProfesional, sugerirFiscalidadIngreso } from './fiscalidad'
import { perfilBase } from './fixtures'
import type { Cliente } from './tipos'
import { validarGasto } from './validacion'


const cliente = (pais: string, tipo: Cliente['tipo']): Cliente => ({
  id: 1, tipo, nombre: 'X', nif: '', pais, domicilio: '', codigoPostal: '', municipio: '',
  provincia: '', email: '', notas: ''
})

describe('retencionProfesional', () => {
  it('7% el año de alta y los dos siguientes, 15% después', () => {
    expect(retencionProfesional(perfilBase, '2023-12-01')).toBe(7)
    expect(retencionProfesional(perfilBase, '2025-12-31')).toBe(7)
    expect(retencionProfesional(perfilBase, '2026-01-01')).toBe(15)
  })
  it('15% si ya tenía actividad el año anterior al alta', () => {
    expect(retencionProfesional({ ...perfilBase, actividadAnteriorAlAlta: true }, '2024-05-01')).toBe(15)
  })
  it('sin retención en actividades empresariales', () => {
    const p = { ...perfilBase, actividades: [{ ...perfilBase.actividades[0]!, seccion: 1 as const }] }
    expect(retencionProfesional(p, '2026-05-01')).toBe(0)
  })
})

describe('sugerirFiscalidadIngreso', () => {
  const f = '2026-03-10'
  it('empresa española: IVA 21% y retención', () => {
    expect(sugerirFiscalidadIngreso(perfilBase, cliente('ES', 'empresa'), f))
      .toMatchObject({ operacion: 'nacional', tipoIva: 21, retencionPct: 15 })
  })
  it('particular español: IVA sin retención', () => {
    expect(sugerirFiscalidadIngreso(perfilBase, cliente('ES', 'particular'), f))
      .toMatchObject({ operacion: 'nacional', tipoIva: 21, retencionPct: 0 })
  })
  it('empresa UE: inversión del sujeto pasivo', () => {
    expect(sugerirFiscalidadIngreso(perfilBase, cliente('DE', 'empresa'), f))
      .toMatchObject({ operacion: 'intracomunitaria', tipoIva: 0, retencionPct: 0 })
  })
  it('avisa si falta el alta en el ROI', () => {
    const s = sugerirFiscalidadIngreso({ ...perfilBase, altaRoi: false }, cliente('FR', 'empresa'), f)
    expect(s.avisos.join(' ')).toMatch(/ROI/)
  })
  it('particular UE: IVA español', () => {
    expect(sugerirFiscalidadIngreso(perfilBase, cliente('IT', 'particular'), f))
      .toMatchObject({ operacion: 'nacional', tipoIva: 21 })
  })
  it('fuera de la UE: no sujeta', () => {
    expect(sugerirFiscalidadIngreso(perfilBase, cliente('US', 'empresa'), f))
      .toMatchObject({ operacion: 'no_sujeta', tipoIva: 0, retencionPct: 0 })
  })
})

describe('cálculo de cuotas', () => {
  it('ingreso nacional con IVA y retención', () => {
    expect(calcularIngreso({
      fecha: '2026-01-01', clienteId: 1, actividadId: null, concepto: 'x', base: 100000, tipoIva: 21,
      retencionPct: 15, operacion: 'nacional', notas: ''
    })).toEqual({ cuotaIva: 21000, cuotaRetencion: 15000 })
  })
  it('gasto sin IVA ignora el tipo', () => {
    expect(calcularGasto({
      fecha: '2026-01-01', proveedor: 'TGSS', nifProveedor: '', paisProveedor: 'ES', numeroFactura: '', actividadId: null,
      concepto: 'cuota', categoria: 'cuota_autonomo', base: 30000, tipoIva: 21, deduciblePctIrpf: 100,
      deduciblePctIva: 0, retencionPct: 0, operacion: 'sin_iva', bienInversion: false, notas: ''
    }).cuotaIva).toBe(0)
  })
})

describe('varias actividades', () => {
  it('la retención depende de la sección de la actividad del ingreso', () => {
    const empresarial = { id: 'a2', seccion: 1 as const, codigo: '845', descripcion: 'x', principal: false, deducibles: {} }
    const p = { ...perfilBase, actividades: [...perfilBase.actividades, empresarial] }
    expect(retencionProfesional(p, '2026-05-01', 'a1')).toBe(15)
    expect(retencionProfesional(p, '2026-05-01', 'a2')).toBe(0)
    expect(retencionProfesional(p, '2026-05-01', null)).toBe(15)
  })
})

describe('proveedor opcional en gastos', () => {
  const g = {
    fecha: '2026-03-01', proveedor: '', nifProveedor: '', paisProveedor: 'ES', numeroFactura: '', actividadId: null, concepto: 'Ticket parking',
    categoria: 'otros', base: 500, tipoIva: 21, deduciblePctIrpf: 100, deduciblePctIva: 100, retencionPct: 0, operacion: 'nacional' as const, bienInversion: false, notas: ''
  }
  it('sin retención ni UE no hace falta', () => expect(validarGasto(g)).toEqual([]))
  it('con retención o compra UE sí', () => {
    expect(validarGasto({ ...g, retencionPct: 15 }).join(' ')).toMatch(/proveedor/)
    expect(validarGasto({ ...g, operacion: 'intracomunitaria', tipoIva: 0 }).join(' ')).toMatch(/proveedor/)
  })
})
