import { CATEGORIAS_GASTO } from './fiscalidad'
import type { Actividad, Epigrafe, Perfil, PorcentajesDeducibles } from './tipos'

/**
 * Catálogo de epígrafes con los % deducibles que se proponen al darlos de alta.
 * Es solo un punto de partida: cada actividad guarda su propia tabla y el usuario la edita.
 * No es la lista completa del IAE; se puede dar de alta cualquier otro código.
 */
export interface EntradaCatalogo extends Epigrafe {
  /** Categorías cuyo % difiere del general en esta actividad. */
  deducibles?: Record<string, PorcentajesDeducibles>
  motivo?: string
}

const AL_100 = { irpf: 100, iva: 100 }

export const CATALOGO_EPIGRAFES: EntradaCatalogo[] = [
  { seccion: 2, codigo: '763', descripcion: 'Programadores y analistas de informática', deducibles: { equipos: AL_100, software: AL_100 }, motivo: 'El equipo y el software son herramientas de la actividad.' },
  { seccion: 1, codigo: '845', descripcion: 'Explotación electrónica por cuenta de terceros', deducibles: { equipos: AL_100, software: AL_100 }, motivo: 'El equipo y el software son herramientas de la actividad.' },
  { seccion: 1, codigo: '844', descripcion: 'Servicios de publicidad, relaciones públicas y similares' },
  { seccion: 2, codigo: '511', descripcion: 'Agentes comerciales', deducibles: { vehiculo: AL_100 }, motivo: 'Vehículo afecto al 100% para agentes comerciales (art. 22.4 RIRPF).' },
  { seccion: 1, codigo: '721', descripcion: 'Transporte de viajeros por carretera', deducibles: { vehiculo: AL_100 }, motivo: 'Vehículo afecto al 100% en transporte (art. 22.4 RIRPF).' },
  { seccion: 1, codigo: '722', descripcion: 'Transporte de mercancías por carretera', deducibles: { vehiculo: AL_100 }, motivo: 'Vehículo afecto al 100% en transporte (art. 22.4 RIRPF).' }
]

export function buscarEpigrafes(texto: string): EntradaCatalogo[] {
  const t = texto.trim().toLowerCase()
  if (!t) return CATALOGO_EPIGRAFES
  return CATALOGO_EPIGRAFES.filter((e) => e.codigo.startsWith(t) || e.descripcion.toLowerCase().includes(t))
}

export function nombreSeccion(seccion: Epigrafe['seccion']): string {
  return seccion === 1 ? 'Empresarial' : seccion === 2 ? 'Profesional' : 'Artística'
}

export function entradaCatalogo(e: Epigrafe): EntradaCatalogo | undefined {
  return CATALOGO_EPIGRAFES.find((c) => c.seccion === e.seccion && c.codigo === e.codigo.trim())
}

/** Tabla completa de % deducibles para un epígrafe: valores generales + los del catálogo. */
export function deduciblesIniciales(e: Epigrafe): Record<string, PorcentajesDeducibles> {
  const extra = entradaCatalogo(e)?.deducibles ?? {}
  return Object.fromEntries(
    CATEGORIAS_GASTO.map((c) => [c.id, extra[c.id] ?? { irpf: c.deduciblePctIrpf, iva: c.deduciblePctIva }])
  )
}

export function nuevaActividad(e: Epigrafe, id: string, principal: boolean): Actividad {
  return { id, seccion: e.seccion, codigo: e.codigo.trim(), descripcion: e.descripcion, principal, deducibles: deduciblesIniciales(e) }
}

/**
 * Convierte perfiles guardados con un solo `epigrafe` (versión anterior) al formato de actividades.
 * Los perfiles ya convertidos se devuelven tal cual.
 */
export function normalizarPerfil(raw: Perfil & { epigrafe?: Epigrafe; nombreFiscal?: string }): Perfil {
  const { epigrafe, nombreFiscal, ...p } = raw
  let perfil: Perfil = p
  if (!p.actividades?.length) {
    const e = epigrafe ?? { seccion: 2 as const, codigo: '', descripcion: '' }
    perfil = { ...p, actividades: [nuevaActividad(e, 'a1', true)] }
  }
  // Versiones anteriores guardaban "APELLIDOS NOMBRE" en un solo campo: la última palabra pasa a ser el nombre.
  if (nombreFiscal?.trim() && perfil.apellidos === undefined && perfil.nombrePila === undefined) {
    const partes = nombreFiscal.trim().split(/\s+/)
    perfil = { ...perfil, apellidos: partes.slice(0, -1).join(' '), nombrePila: partes.at(-1) }
  }
  return perfil
}
