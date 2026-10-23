// Ficheros .txt de los modelos 303, 130, 111, 115 y 390 para importarlos en el formulario de la Sede.
// Los diseños de registro oficiales están en ./disenos (ver scripts/extraer-disenos.py).

import { normalizarNif } from '../nif'
import type { Perfil } from '../tipos'
import { alfa } from './fichero'
import type { Fichero } from './ficheros349y347'
import { campoPorTexto, DISENOS, ficheroPosicional, pagina, type Valores } from './posicional'
import type { ResultadoModelo } from './tipos'

/** Ejercicio de cada diseño de registro descargado (el 303 y el 390 cambian cada año). */
const EJERCICIO_DISENO = { '303': 2026, '390': 2025 } as const

function avisoDiseno(modelo: '303' | '390', ejercicio: number, avisos: string[]) {
  const d = EJERCICIO_DISENO[modelo]
  if (ejercicio !== d) avisos.push(`El fichero usa el diseño de registro del ${modelo} de ${d}. Si la Sede lo rechaza, descarga el diseño de ${ejercicio} y actualízalo.`)
}

/** Campos comunes de la página 01: NIF, apellidos, nombre, ejercicio y periodo. */
function identificacion(perfil: Perfil, r: ResultadoModelo, avisos: string[], separados: boolean): Valores {
  const nif = normalizarNif(perfil.nif)
  const apellidos = perfil.apellidos?.trim() ?? ''
  const nombre = perfil.nombrePila?.trim() ?? ''
  if (!apellidos || !nombre) avisos.push('Indica en tu perfil tus apellidos y tu nombre por separado, como constan en Hacienda: la AEAT los compara con tu NIF.')
  const v: Valores = { 7: nif, 9: r.ejercicio, 10: r.periodo }
  if (separados) { v[8] = alfa(apellidos || perfil.nombre, 60); v[9] = alfa(nombre, 20); v[10] = r.ejercicio; v[11] = r.periodo }
  else v[8] = alfa(`${apellidos || perfil.nombre} ${nombre}`, 80)
  return v
}

const nombreFichero = (perfil: Perfil, r: ResultadoModelo) => `${normalizarNif(perfil.nif)}MOD${r.modelo}${r.ejercicio}-${r.periodo}.txt`

function montar(perfil: Perfil, r: ResultadoModelo, paginas: string[], avisos: string[]): Fichero {
  const contenido = ficheroPosicional({ modelo: r.modelo, ejercicio: r.ejercicio, periodo: r.periodo, nifDesarrollador: normalizarNif(perfil.nif) }, paginas)
  return { nombre: nombreFichero(perfil, r), contenido, avisos }
}

// ---------- 303 ----------

const TIPO_303: Record<ResultadoModelo['tipo'], string> = { ingresar: 'I', cero: 'N', compensar: 'C', devolver: 'D', negativa: 'N' }

export function fichero303(perfil: Perfil, r: ResultadoModelo): Fichero {
  const avisos = [...r.avisos]
  avisoDiseno('303', r.ejercicio, avisos)
  const d = DISENOS['303'].paginas
  const c = r.casillas
  const tipo = TIPO_303[r.tipo]

  const p1: Valores = {
    ...identificacion(perfil, r, avisos, false),
    6: tipo,
    // Situaciones del sujeto pasivo, como las rellena el formulario de la AEAT para un autónomo
    // en régimen general: 2 = no; régimen simplificado 3 = no; SII 2 = no.
    11: 2, 12: 2, 13: 3, 14: 2, 15: 2, 16: 2, 17: 2, 18: 2, 19: 2, 22: 2,
    // Exonerado del 390 (solo en el 4T): 2 = no, porque presentas el 390.
    23: r.periodo === '4T' ? 2 : 0, 24: 0, 25: 0,
    // Tipo de recargo de equivalencia del 0,5 %, que el formulario de la AEAT pone siempre.
    [campoPorTexto(d['01']!, '[169]')]: 50
  }

  const sinActividad = tipo === 'N' && !(c['27'] ?? 0) && !(c['45'] ?? 0)
  const p3: Valores = { [campoPorTexto(d['03']!, 'Declaración Sin actividad')]: sinActividad ? 'X' : ' ' }

  const devolucion = tipo === 'D'
  const iban = perfil.iban.replace(/\s/g, '').toUpperCase()
  if (devolucion && !iban) avisos.push('Indica tu IBAN en el perfil para recibir la devolución.')
  if (devolucion && iban && !iban.startsWith('ES')) avisos.push('La devolución a una cuenta extranjera necesita el SWIFT-BIC y los datos del banco: complétalos en el formulario.')
  const did: Valores = {
    [campoPorTexto(d['DID']!, 'IBAN')]: devolucion ? iban : '',
    [campoPorTexto(d['DID']!, 'Marca SEPA')]: devolucion && iban ? (iban.startsWith('ES') ? 1 : 2) : 0
  }

  return montar(perfil, r, [pagina(d['01']!, c, p1), pagina(d['03']!, c, p3), pagina(d['DID']!, c, did)], avisos)
}

// ---------- 130, 111 y 115 ----------

function ficheroSimple(perfil: Perfil, r: ResultadoModelo, modelo: '130' | '111' | '115', tipos: Partial<Record<ResultadoModelo['tipo'], string>>): Fichero {
  const avisos = [...r.avisos]
  const tipo = tipos[r.tipo]
  if (!tipo) throw new Error(`El ${modelo} no admite el resultado "${r.tipo}"`)
  const campos = DISENOS[modelo].paginas['01']!
  return montar(perfil, r, [pagina(campos, r.casillas, { ...identificacion(perfil, r, avisos, true), 6: tipo })], avisos)
}

/** 130: I ingreso, B a deducir en los siguientes trimestres, N negativa o cero. */
export const fichero130 = (perfil: Perfil, r: ResultadoModelo) =>
  ficheroSimple(perfil, r, '130', { ingresar: 'I', compensar: 'B', negativa: 'N', cero: 'N' })

/** 111 y 115: I ingreso, N sin retenciones. */
export const fichero111 = (perfil: Perfil, r: ResultadoModelo) => ficheroSimple(perfil, r, '111', { ingresar: 'I', cero: 'N' })
export const fichero115 = (perfil: Perfil, r: ResultadoModelo) => ficheroSimple(perfil, r, '115', { ingresar: 'I', cero: 'N' })

// ---------- 390 ----------

/** Clave de actividad de los datos estadísticos del 390 según la sección del IAE. */
export function claveActividad390(seccion: number): string {
  return seccion === 1 ? 'A01' : 'A05' // A05 es la que pone la AEAT para un profesional (sección 2)
}

export function fichero390(perfil: Perfil, r: ResultadoModelo): Fichero {
  const avisos = [...r.avisos]
  avisoDiseno('390', r.ejercicio, avisos)
  const d = DISENOS['390'].paginas
  const id = identificacion(perfil, r, avisos, true)
  delete id[11] // en el 390 el campo 11 es reservado y no lleva periodo

  // Datos estadísticos: la actividad principal y hasta cinco más.
  const actividades = [...perfil.actividades].sort((a, b) => Number(b.principal) - Number(a.principal))
  if (actividades.length > 6) avisos.push('El 390 solo recoge seis actividades: añade el resto en el formulario.')
  if (actividades.some((a) => a.seccion !== 2)) avisos.push('Comprueba en el formulario la clave de actividad de los datos estadísticos: la app solo la ha comprobado para profesionales (sección 2).')
  const estadisticos: Valores = {}
  actividades.slice(0, 6).forEach((a, i) => {
    estadisticos[25 + i * 3] = alfa(a.descripcion, 40)
    estadisticos[26 + i * 3] = claveActividad390(a.seccion)
    estadisticos[27 + i * 3] = alfa(a.codigo.replace(/\D/g, ''), 4)
  })

  const p1: Valores = {
    ...id, ...estadisticos,
    // Registro de devolución mensual, grupo de entidades (y sus marcas) y 347: "0", como el formulario de la AEAT.
    12: '0', 13: '0', 15: '0', 16: '0', 17: '0', 43: '0',
    // Concurso de acreedores, criterio de caja y destinatario de criterio de caja: 2 = no.
    19: '2', 20: '2', 21: '2'
  }
  // Página 05 (régimen simplificado, que no aplica): el formulario pone ceros en el epígrafe de la actividad 2.
  const valores: Partial<Record<string, Valores>> = { '01': p1, '05': { 30: '0000' } }
  const paginas = (['01', '02', '02B', '03', '04', '05', '06', '08'] as const)
    .map((p) => pagina(d[p]!, r.casillas, valores[p]))
  return montar(perfil, r, paginas, avisos)
}
