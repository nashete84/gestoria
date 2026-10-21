import { describe, expect, it } from 'vitest'
import { deduciblesPara } from './deducibles'
import { deduciblesIniciales, normalizarPerfil, nuevaActividad } from './epigrafes'
import { perfilBase } from './fixtures'
import type { Perfil } from './tipos'

const agente = nuevaActividad({ seccion: 2, codigo: '511', descripcion: 'Agentes comerciales' }, 'a2', false)
const dosActividades: Perfil = { ...perfilBase, actividades: [...perfilBase.actividades, agente] }

describe('deduciblesPara', () => {
  it('suministros: % de la actividad aplicado sobre la parte de vivienda afecta', () => {
    expect(deduciblesPara({ ...perfilBase, pctViviendaAfecta: 20 }, null, 'suministros_vivienda')).toMatchObject({ irpf: 6, iva: 20 })
  })
  it('suministros sin % de vivienda: no deducible y lo explica', () => {
    const d = deduciblesPara(perfilBase, null, 'suministros_vivienda')
    expect(d).toMatchObject({ irpf: 0, iva: 0 })
    expect(d.explicacion).toMatch(/perfil/)
  })
  it('usa la tabla de la actividad del gasto', () => {
    expect(deduciblesPara(dosActividades, 'a1', 'vehiculo')).toMatchObject({ irpf: 0, iva: 50 })
    expect(deduciblesPara(dosActividades, 'a2', 'vehiculo')).toMatchObject({ irpf: 100, iva: 100 })
    expect(deduciblesPara(dosActividades, 'a2', 'vehiculo').explicacion).toMatch(/511/)
  })
  it('sin actividad indicada usa la principal', () => {
    expect(deduciblesPara(dosActividades, null, 'equipos')).toMatchObject({ irpf: 100, iva: 100 })
  })
  it('respeta los % editados por el usuario', () => {
    const editado: Perfil = { ...perfilBase, actividades: [{ ...perfilBase.actividades[0]!, deducibles: { ...perfilBase.actividades[0]!.deducibles, telefono_internet: { irpf: 80, iva: 80 } } }] }
    expect(deduciblesPara(editado, null, 'telefono_internet')).toMatchObject({ irpf: 80, iva: 80 })
  })
})

describe('catálogo y migración', () => {
  it('un epígrafe fuera del catálogo recibe los valores generales', () => {
    const t = deduciblesIniciales({ seccion: 2, codigo: '999', descripcion: 'Otra' })
    expect(t.equipos).toEqual({ irpf: 100, iva: 100 })
    expect(t.vehiculo).toEqual({ irpf: 0, iva: 50 })
  })
  it('convierte un perfil antiguo con un solo epígrafe', () => {
    const { actividades: _a, ...resto } = perfilBase
    const antiguo = { ...resto, epigrafe: { seccion: 2 as const, codigo: '763', descripcion: 'Programadores' } } as unknown as Perfil
    const p = normalizarPerfil(antiguo)
    expect(p.actividades).toHaveLength(1)
    expect(p.actividades[0]).toMatchObject({ id: 'a1', codigo: '763', principal: true })
    expect('epigrafe' in p).toBe(false)
  })
})
