// Todos los importes se guardan en céntimos (enteros) para evitar errores de coma flotante.

export type Centimos = number

/** Redondeo a céntimos "half away from zero", como se redondean las cuotas en factura. */
export function redondear(valor: number): Centimos {
  const signo = valor < 0 ? -1 : 1
  return signo * Math.round(Math.abs(valor) + Number.EPSILON * Math.abs(valor))
}

/** Aplica un porcentaje (p. ej. 21 para IVA) a una base en céntimos. */
export function porcentaje(base: Centimos, pct: number): Centimos {
  return redondear((base * pct) / 100)
}

/**
 * Convierte texto escrito por el usuario a céntimos.
 * Acepta "1.234,56", "1234,56", "1234.56", "1234" y "-12,5".
 * Devuelve null si el texto no es un importe válido.
 */
export function parsearEuros(texto: string): Centimos | null {
  let t = texto.trim().replace(/\s|€/g, '')
  if (t === '') return null
  const tieneComa = t.includes(',')
  const tienePunto = t.includes('.')
  if (tieneComa && tienePunto) {
    // El último separador es el decimal; el otro es de miles.
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.')
    else t = t.replace(/,/g, '')
  } else if (tieneComa) {
    t = t.replace(',', '.')
  } else if (tienePunto && /^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    // "1.234" o "1.234.567" con punto solo como separador de miles.
    t = t.replace(/\./g, '')
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null
  return redondear(Number(t) * 100)
}

const formateador = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  useGrouping: 'always' as unknown as boolean
})

export function formatearEuros(c: Centimos): string {
  return formateador.format(c / 100)
}
