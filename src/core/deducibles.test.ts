import { describe, expect, it } from 'vitest'
import { deduciblesPara } from './deducibles'
import { perfilBase } from './fixtures'

describe('deduciblesPara', () => {
  it('suministros: 30% de la parte de vivienda afecta en IRPF, la parte afecta en IVA', () => {
    expect(deduciblesPara({ ...perfilBase, pctViviendaAfecta: 20 }, 'suministros_vivienda')).toMatchObject({ irpf: 6, iva: 20 })
  })
  it('suministros sin % de vivienda: no deducible y lo explica', () => {
    const d = deduciblesPara(perfilBase, 'suministros_vivienda')
    expect(d).toMatchObject({ irpf: 0, iva: 0 })
    expect(d.explicacion).toMatch(/perfil/)
  })
  it('programador (763): equipos y software al 100%', () => {
    expect(deduciblesPara(perfilBase, 'equipos')).toMatchObject({ irpf: 100, iva: 100 })
    expect(deduciblesPara(perfilBase, 'software').explicacion).toMatch(/763/)
  })
  it('vehículo: 0% IRPF y 50% IVA salvo agentes comerciales o transporte', () => {
    expect(deduciblesPara(perfilBase, 'vehiculo')).toMatchObject({ irpf: 0, iva: 50 })
    const agente = { ...perfilBase, epigrafe: { seccion: 2 as const, codigo: '511', descripcion: 'Agentes comerciales' } }
    expect(deduciblesPara(agente, 'vehiculo')).toMatchObject({ irpf: 100, iva: 100 })
  })
  it('categoría desconocida usa "Otros"', () => {
    expect(deduciblesPara(perfilBase, 'xyz')).toMatchObject({ irpf: 100, iva: 100 })
  })
})
