import { describe, expect, it } from 'vitest'
import { ahorroGasto } from './ahorro'
import type { GastoNuevo } from './tipos'

const g = (extra: Partial<GastoNuevo> = {}): GastoNuevo => ({
  fecha: '2026-03-01', proveedor: 'X', nifProveedor: '', paisProveedor: 'ES', numeroFactura: '', actividadId: null, concepto: 'x',
  categoria: 'software', base: 10000, tipoIva: 21, deduciblePctIrpf: 100, deduciblePctIva: 100, retencionPct: 0, operacion: 'nacional',
  bienInversion: false, notas: '', ...extra
})

describe('ahorro fiscal de un gasto', () => {
  it('IVA deducible + IRPF al tipo marginal', () => {
    expect(ahorroGasto(g(), 37)).toEqual({ iva: 2100, irpf: 3700, total: 5800, costeReal: 6300 })
  })
  it('uso mixto: solo la parte afecta', () => {
    expect(ahorroGasto(g({ deduciblePctIrpf: 50, deduciblePctIva: 50 }), 30)).toEqual({ iva: 1050, irpf: 1500, total: 2550, costeReal: 9550 })
  })
  it('compras a la UE: el IVA se autoliquida y no ahorra nada', () => {
    expect(ahorroGasto(g({ operacion: 'intracomunitaria', tipoIva: 21 }), 30)).toMatchObject({ iva: 0, irpf: 3000, costeReal: 7000 })
  })
  it('sin datos de renta, el IRPF es 0', () => {
    expect(ahorroGasto(g({ operacion: 'sin_iva', tipoIva: 0 }), 0)).toEqual({ iva: 0, irpf: 0, total: 0, costeReal: 10000 })
  })
})
