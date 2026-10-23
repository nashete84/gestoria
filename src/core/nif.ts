// Validación de identificadores fiscales españoles (DNI, NIE, CIF) y formato básico de NIF-IVA UE.

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'

export type TipoNif = 'DNI' | 'NIE' | 'CIF'

export function normalizarNif(nif: string): string {
  return nif.toUpperCase().replace(/[\s.-]/g, '')
}

export function tipoNif(nifEntrada: string): TipoNif | null {
  const nif = normalizarNif(nifEntrada)
  if (/^\d{8}[A-Z]$/.test(nif)) return validarDni(nif) ? 'DNI' : null
  if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) {
    const num = 'XYZ'.indexOf(nif[0]!) + nif.slice(1, 8)
    return validarDni(num + nif[8]) ? 'NIE' : null
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) return validarCif(nif) ? 'CIF' : null
  return null
}

export function esNifValido(nif: string): boolean {
  return tipoNif(nif) !== null
}

function validarDni(nif: string): boolean {
  const numero = Number(nif.slice(0, 8))
  return LETRAS_DNI[numero % 23] === nif[8]
}

function validarCif(cif: string): boolean {
  const digitos = cif.slice(1, 8)
  let suma = 0
  for (let i = 0; i < 7; i++) {
    let d = Number(digitos[i])
    if (i % 2 === 0) {
      d *= 2
      if (d > 9) d -= 9
    }
    suma += d
  }
  const control = (10 - (suma % 10)) % 10
  const letraControl = 'JABCDEFGHI'[control]!
  const final = cif[8]!
  const letra = cif[0]!
  // Algunas entidades usan letra de control, otras dígito; el resto acepta ambos.
  if ('PQRSNW'.includes(letra)) return final === letraControl
  if ('ABEH'.includes(letra)) return final === String(control)
  return final === String(control) || final === letraControl
}

export const PAISES_UE = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'
] as const

/** Prefijo VIES: Grecia usa "EL" en el NIF-IVA aunque su código ISO sea "GR". */
export function prefijoVies(paisIso: string): string {
  return paisIso === 'GR' ? 'EL' : paisIso
}

/**
 * Comprueba solo el formato (prefijo de país + 2 a 12 caracteres).
 * La validez real se comprueba en el censo VIES de la Comisión Europea.
 */
export function formatoNifIvaUe(nifIva: string, paisIso: string): boolean {
  const n = normalizarNif(nifIva)
  const prefijo = prefijoVies(paisIso)
  return n.startsWith(prefijo) && /^[A-Z0-9]{2,12}$/.test(n.slice(2))
}
