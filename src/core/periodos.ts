export type Trimestre = 1 | 2 | 3 | 4

export function periodoTrimestre(anio: number, trimestre: Trimestre): { desde: string; hasta: string } {
  const finales = ['03-31', '06-30', '09-30', '12-31']
  const inicio = String((trimestre - 1) * 3 + 1).padStart(2, '0')
  return { desde: `${anio}-${inicio}-01`, hasta: `${anio}-${finales[trimestre - 1]}` }
}

/** Trimestre 0 significa año completo. */
export function rangoPeriodo(anio: number, trimestre: 0 | Trimestre) {
  return trimestre === 0 ? { desde: `${anio}-01-01`, hasta: `${anio}-12-31` } : periodoTrimestre(anio, trimestre)
}
