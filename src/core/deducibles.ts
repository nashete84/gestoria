// % deducible de un gasto: sale de la tabla de la actividad a la que pertenece.
// No hay reglas fijas por epígrafe en el código: el catálogo propone valores al dar de alta
// una actividad y luego cada actividad guarda y edita los suyos.

import { actividadDe, CATEGORIAS_GASTO } from './fiscalidad'
import type { Perfil } from './tipos'

export interface Deducibles {
  irpf: number
  iva: number
  /** Por qué se ha calculado así, para mostrarlo en el formulario. */
  explicacion: string
}

const redondear2 = (n: number) => Math.round(n * 100) / 100

export function deduciblesPara(perfil: Perfil, actividadId: string | null, categoriaId: string): Deducibles {
  const cat = CATEGORIAS_GASTO.find((c) => c.id === categoriaId) ?? CATEGORIAS_GASTO[CATEGORIAS_GASTO.length - 1]!
  const act = actividadDe(perfil, actividadId)
  const general = { irpf: cat.deduciblePctIrpf, iva: cat.deduciblePctIva }
  const propio = act.deducibles[cat.id]
  const base = propio ?? general
  const deActividad = perfil.actividades.length > 1 || (propio && (propio.irpf !== general.irpf || propio.iva !== general.iva))
  const origen = deActividad ? `Según tu actividad ${act.codigo} (${act.descripcion || 'sin descripción'})` : 'Valor general'

  if (cat.sobreViviendaAfecta) {
    const vivienda = perfil.pctViviendaAfecta ?? 0
    if (!vivienda) {
      return { irpf: 0, iva: 0, explicacion: 'Indica en tu perfil qué % de la vivienda usas para trabajar: sin ese dato no se puede deducir.' }
    }
    const irpf = redondear2((base.irpf * vivienda) / 100)
    const iva = redondear2((base.iva * vivienda) / 100)
    return {
      irpf, iva,
      explicacion: `${origen}: ${base.irpf}% en IRPF y ${base.iva}% en IVA sobre el ${vivienda}% de vivienda afecta = ${irpf}% y ${iva}%.`
    }
  }
  // La ayuda general de la categoría solo se muestra si la actividad no cambia sus %.
  const esGeneral = base.irpf === general.irpf && base.iva === general.iva
  return {
    irpf: base.irpf,
    iva: base.iva,
    explicacion: `${origen}: ${base.irpf}% en IRPF y ${base.iva}% en IVA.${esGeneral && cat.ayuda ? ' ' + cat.ayuda : ''}`
  }
}
