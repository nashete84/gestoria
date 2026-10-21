import type { Epigrafe } from './tipos'

// Catálogo mínimo de epígrafes del IAE relacionados con tecnología.
// No es la lista completa: el perfil permite escribir cualquier otro código y descripción.
export const EPIGRAFES: Epigrafe[] = [
  { seccion: 2, codigo: '763', descripcion: 'Programadores y analistas de informática' },
  { seccion: 1, codigo: '845', descripcion: 'Explotación electrónica por cuenta de terceros' },
  { seccion: 1, codigo: '844', descripcion: 'Servicios de publicidad, relaciones públicas y similares' }
]

export function buscarEpigrafes(texto: string): Epigrafe[] {
  const t = texto.trim().toLowerCase()
  if (!t) return EPIGRAFES
  return EPIGRAFES.filter(
    (e) => e.codigo.startsWith(t) || e.descripcion.toLowerCase().includes(t)
  )
}

export function nombreSeccion(seccion: Epigrafe['seccion']): string {
  return seccion === 1 ? 'Empresarial' : seccion === 2 ? 'Profesional' : 'Artística'
}
