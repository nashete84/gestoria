// Cuánto te ahorra un gasto en impuestos: el IVA que recuperas en el 303 y el IRPF que dejas de pagar.

import { calcularGasto } from './fiscalidad'
import { porcentaje } from './money'
import type { Centimos } from './money'
import type { GastoNuevo } from './tipos'

export interface AhorroGasto {
  /** IVA soportado que restas en el 303. 0 si te lo autoliquidas (compras UE o fuera) o si el gasto no lleva IVA. */
  iva: Centimos
  /** IRPF que dejas de pagar: lo deducible × tu tipo marginal. En bienes de inversión, repartido en los años de amortización. */
  irpf: Centimos
  total: Centimos
  /** Lo que de verdad te cuesta: total pagado − ahorro. */
  costeReal: Centimos
}

/**
 * `tipoMarginal` es el % de IRPF que pagas por cada euro más de rendimiento (sale de la previsión del año, e incluye
 * el efecto del 5 % de gastos de difícil justificación). Con 0 (sin datos de renta), el ahorro de IRPF es 0.
 */
export function ahorroGasto(g: GastoNuevo, tipoMarginal: number): AhorroGasto {
  const { cuotaIva } = calcularGasto(g)
  const iva = g.operacion === 'nacional' ? porcentaje(cuotaIva, g.deduciblePctIva) : 0
  // Igual que en la renta de la app: el % deducible sobre la base.
  const deducibleIrpf = porcentaje(g.base, g.deduciblePctIrpf)
  const irpf = Math.max(0, Math.round((deducibleIrpf * tipoMarginal) / 100))
  const pagado = g.base + (g.operacion === 'nacional' ? cuotaIva : 0)
  return { iva, irpf, total: iva + irpf, costeReal: pagado - iva - irpf }
}
