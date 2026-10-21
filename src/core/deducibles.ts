// Porcentaje deducible de cada gasto según el epígrafe del IAE y los datos del perfil.
// Parte de los valores por defecto de cada categoría (CATEGORIAS_GASTO) y los ajusta.

import { CATEGORIAS_GASTO } from './fiscalidad'
import type { Perfil } from './tipos'

export interface Deducibles {
  irpf: number
  iva: number
  /** Por qué se ha calculado así, para mostrarlo en el formulario. */
  explicacion: string
}

const redondear2 = (n: number) => Math.round(n * 100) / 100

/** Actividades en las que el vehículo se considera afecto al 100% (art. 22.4 RIRPF). */
const VEHICULO_AFECTO: { seccion: number; codigos: string[]; motivo: string }[] = [
  { seccion: 2, codigos: ['511'], motivo: 'agentes comerciales' },
  { seccion: 1, codigos: ['721', '722'], motivo: 'transporte de viajeros o mercancías' }
]

/** Epígrafes de informática: el equipo y el software son herramientas de la actividad. */
const INFORMATICA: { seccion: number; codigo: string }[] = [
  { seccion: 2, codigo: '763' },
  { seccion: 1, codigo: '845' }
]

function coincide(perfil: Perfil, seccion: number, codigo: string) {
  return perfil.epigrafe.seccion === seccion && perfil.epigrafe.codigo.trim().startsWith(codigo)
}

export function deduciblesPara(perfil: Perfil, categoriaId: string): Deducibles {
  const cat = CATEGORIAS_GASTO.find((c) => c.id === categoriaId) ?? CATEGORIAS_GASTO[CATEGORIAS_GASTO.length - 1]!
  const ep = `${perfil.epigrafe.codigo} (${perfil.epigrafe.descripcion || 'tu actividad'})`
  const vivienda = perfil.pctViviendaAfecta ?? 0

  switch (cat.id) {
    case 'suministros_vivienda': {
      if (!vivienda) {
        return { irpf: 0, iva: 0, explicacion: 'Indica en tu perfil qué % de la vivienda usas para trabajar: sin ese dato no se puede deducir.' }
      }
      // IRPF: 30% de la parte afecta (art. 30.2.5ª.b LIRPF). IVA: en proporción a la parte afecta.
      return {
        irpf: redondear2(vivienda * 0.3),
        iva: vivienda,
        explicacion: `Trabajas en el ${vivienda}% de tu vivienda: IRPF 30% × ${vivienda}% = ${redondear2(vivienda * 0.3)}%; IVA ${vivienda}%.`
      }
    }
    case 'vehiculo': {
      const afecto = VEHICULO_AFECTO.find((v) => v.codigos.some((c) => coincide(perfil, v.seccion, c)))
      if (afecto) {
        return { irpf: 100, iva: 100, explicacion: `Epígrafe ${ep}: actividad de ${afecto.motivo}, el vehículo se considera afecto al 100%.` }
      }
      return { irpf: 0, iva: 50, explicacion: `Epígrafe ${ep}: el vehículo solo es deducible en IRPF si su uso es exclusivo para la actividad; en IVA se presume un 50%.` }
    }
    case 'equipos':
    case 'software': {
      if (INFORMATICA.some((i) => coincide(perfil, i.seccion, i.codigo))) {
        return { irpf: 100, iva: 100, explicacion: `Epígrafe ${ep}: herramienta principal de tu actividad, deducible al 100%.` }
      }
      return { irpf: cat.deduciblePctIrpf, iva: cat.deduciblePctIva, explicacion: 'Deducible al 100% si lo usas solo para la actividad.' }
    }
    case 'telefono_internet':
      return { irpf: 50, iva: 50, explicacion: 'Uso mixto personal y profesional: 50%. Si es una línea solo para trabajar, súbelo al 100%.' }
    default:
      return { irpf: cat.deduciblePctIrpf, iva: cat.deduciblePctIva, explicacion: cat.ayuda }
  }
}
