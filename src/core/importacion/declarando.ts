// Importación del histórico exportado desde Declarando (declarando.es).
//
// Fuente principal: los libros registro ("libros-contables": libro_ingresos_AAAA.csv y libro_gastos_AAAA.csv),
// que son lo que se declaró en los modelos. De los listados de gastos ("listado-gastos") se toman el tipo de
// gasto y el % deducible. Las facturas emitidas en PDF se emparejan por su número y los justificantes de
// gastos, cuando se puede, por el número de factura que aparece dentro del PDF.
//
// Este módulo no toca la base de datos: produce un plan que se revisa en pantalla antes de aplicarlo.

import { calcularGasto, calcularIngreso } from '../fiscalidad'
import { esNifValido, normalizarNif, PAISES_UE } from '../nif'
import type { ClienteNuevo, GastoNuevo, IngresoNuevo } from '../tipos'
import type { ArchivoImportado } from './zip'

export interface AdjuntoImportado {
  nombre: string
  datos: Uint8Array
}

export interface ClienteImportado {
  /** NIF normalizado o, si no tiene, el nombre en mayúsculas. */
  clave: string
  datos: ClienteNuevo
  /** País deducido del NIF; vacío si no se puede saber (lo elige el usuario). */
  paisSugerido: string
}

export interface IngresoImportado {
  numeroFactura: string
  /** Clave del cliente (ver ClienteImportado.clave), o null. */
  cliente: string | null
  /** Epígrafe del IAE de la fila; se asigna a la actividad del perfil con ese código. */
  iae: string
  /** Calificación de la operación en el libro (S1 sujeta, N1/N2 no sujeta...). */
  calificacion: string
  datos: Omit<IngresoNuevo, 'clienteId' | 'actividadId' | 'operacion'>
  adjunto: AdjuntoImportado | null
}

export interface GastoImportado {
  iae: string
  datos: Omit<GastoNuevo, 'actividadId'>
  adjunto: AdjuntoImportado | null
}

export interface ResumenAnio {
  anio: number
  ingresos: number
  baseIngresos: number
  gastos: number
  baseGastos: number
}

export interface PlanImportacion {
  origen: 'declarando'
  clientes: ClienteImportado[]
  ingresos: IngresoImportado[]
  gastos: GastoImportado[]
  /** Justificantes de gastos que no se han podido emparejar con su gasto. */
  sinAsignar: AdjuntoImportado[]
  resumen: ResumenAnio[]
  avisos: string[]
}

// ---------- Utilidades de formato ----------

/** CSV con comillas dobles, comas y saltos de línea dentro de comillas. */
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let comillas = false
  const t = texto.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!
    if (comillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++ } else comillas = false
      } else campo += c
    } else if (c === '"') comillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      fila.push(campo); campo = ''
      if (fila.some((x) => x !== '')) filas.push(fila)
      fila = []
    } else campo += c
  }
  fila.push(campo)
  if (fila.some((x) => x !== '')) filas.push(fila)
  return filas
}

/** Filas como objetos por nombre de columna. */
function tabla(texto: string): Record<string, string>[] {
  const [cabecera, ...filas] = leerCsv(texto)
  if (!cabecera) return []
  return filas.map((f) => Object.fromEntries(cabecera.map((c, i) => [c.trim(), (f[i] ?? '').trim()])))
}

/** "1.234,56" → 123456 céntimos. Vacío → 0. */
export function importeEs(texto: string): number {
  const t = texto.trim()
  if (!t) return 0
  if (!/^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+(,\d{1,2})?$/.test(t)) throw new Error(`Importe no válido: "${texto}"`)
  const [entero, dec = ''] = t.replace(/\./g, '').split(',')
  const negativo = entero!.startsWith('-')
  const c = Math.abs(Number(entero)) * 100 + Number(dec.padEnd(2, '0'))
  return negativo ? -c : c
}

/** "30-11-2023" → "2023-11-30". */
export function fechaEs(texto: string): string {
  const m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(texto.trim())
  if (!m) throw new Error(`Fecha no válida: "${texto}"`)
  return `${m[3]}-${m[2]}-${m[1]}`
}

const pct = (texto: string) => (texto.trim() ? Number(texto.replace(',', '.')) : 0)
const redondear2 = (n: number) => Math.round(n * 100) / 100
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const nombreArchivo = (ruta: string) => ruta.split('/').pop() ?? ruta
const sinExtension = (n: string) => n.replace(/\.[^.]+$/, '')
const decodificar = (d: Uint8Array) => new TextDecoder('utf-8').decode(d)

/** País de un NIF: ES si es un NIF español válido, el prefijo si es un NIF-IVA de la UE; si no, vacío. */
export function paisDeNif(nif: string): string {
  const n = normalizarNif(nif)
  if (!n) return ''
  if (esNifValido(n)) return 'ES'
  const prefijo = n.slice(0, 2)
  if (/^[A-Z]{2}$/.test(prefijo) && (PAISES_UE as readonly string[]).includes(prefijo === 'EL' ? 'GR' : prefijo)) return prefijo === 'EL' ? 'GR' : prefijo
  return ''
}

// ---------- Categorías ----------

/** Tipo de gasto de Declarando (texto libre) → categoría de la app. */
export function categoriaDeTipo(tipo: string, proveedor: string): string {
  const t = sinAcentos(`${tipo} ${proveedor}`)
  const reglas: [RegExp, string][] = [
    [/seguridad social|autonomo|reta\b/, 'cuota_autonomo'],
    [/alquiler.*vivienda|vivienda.*alquiler/, 'alquiler_vivienda'],
    [/alquiler|arrendamiento/, 'alquiler_local'],
    [/coworking/, 'coworking'],
    [/mobiliario|silla|mesa|escritorio/, 'mobiliario'],
    [/movil|ordenador|portatil|monitor|equipo|hardware|tablet/, 'equipos'],
    [/internet|fibra|telefonia|telefono/, 'telefono_internet'],
    [/luz|agua|gas\b|electricidad|suministro/, 'suministros_vivienda'],
    [/declarando|asesor|gestor|abogad|notari|profesional/, 'profesionales'],
    [/software|suscripcion|licencia|hosting|dominio/, 'software'],
    [/formacion|curso|libro/, 'formacion'],
    [/seguro/, 'seguros'],
    [/banco|comision/, 'bancos'],
    [/publicidad|marketing/, 'publicidad'],
    [/dieta|viaje|hotel|restaurante/, 'dietas'],
    [/vehiculo|gasolina|combustible|transporte|parking|taxi/, 'vehiculo']
  ]
  return reglas.find(([r]) => r.test(t))?.[1] ?? 'otros'
}

const capitalizar = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

// ---------- Análisis ----------

export interface OpcionesAnalisis {
  /** Texto legible de un PDF (si se puede), para emparejar justificantes por su número de factura. */
  extraerTexto?: (datos: Uint8Array) => string
}

export function analizarDeclarando(archivos: ArchivoImportado[], opciones: OpcionesAnalisis = {}): PlanImportacion {
  const avisos: string[] = []
  const porNombre = (re: RegExp) => archivos.filter((a) => re.test(nombreArchivo(a.ruta)))
  const anioDe = (a: ArchivoImportado) => Number(/(\d{4})\.csv$/.exec(nombreArchivo(a.ruta))![1])

  const librosIngresos = porNombre(/^libro_ingresos_\d{4}\.csv$/i)
  const librosGastos = porNombre(/^libro_gastos_\d{4}\.csv$/i)
  if (!librosIngresos.length && !librosGastos.length) {
    throw new Error('No encuentro los libros contables (libro_ingresos_AAAA.csv, libro_gastos_AAAA.csv). Añade el ZIP "libros-contables" de Declarando.')
  }

  // Facturas emitidas en PDF, por número (en 2023-2024 Declarando las llama "I_2024-00001.pdf").
  const pdfs = archivos.filter((a) => /\.pdf$/i.test(a.ruta) && !/factura_gasto_/i.test(a.ruta))
  const facturaPdf = new Map<string, ArchivoImportado>()
  for (const a of pdfs) {
    const n = sinExtension(nombreArchivo(a.ruta)).replace(/^I_/i, '').toUpperCase()
    facturaPdf.set(n, a)
  }

  // ----- Ingresos y clientes -----
  const clientes = new Map<string, ClienteImportado>()
  const ingresos: IngresoImportado[] = []
  for (const libro of librosIngresos.sort((a, b) => anioDe(a) - anioDe(b))) {
    for (const f of tabla(decodificar(libro.datos))) {
      const numero = f['Número de la factura'] ?? ''
      const nombre = f['Nombre del cliente'] ?? ''
      const nif = normalizarNif(f['CIF del cliente'] ?? '')
      let cliente: string | null = null
      if (nombre || nif) {
        cliente = nif || nombre.toUpperCase()
        if (!clientes.has(cliente)) {
          const pais = paisDeNif(nif)
          clientes.set(cliente, {
            clave: cliente, paisSugerido: pais,
            datos: {
              tipo: 'empresa', nombre: nombre || nif, nif, pais, domicilio: '', codigoPostal: '', municipio: '', provincia: '',
              email: '', notas: 'Importado de Declarando'
            }
          })
        }
      }
      const pdf = facturaPdf.get(numero.toUpperCase())
      const datos = {
        fecha: fechaEs(f['Fecha expedición'] ?? ''),
        concepto: numero ? `Factura ${numero}` : 'Ingreso importado',
        base: importeEs(f['Base imponible'] ?? ''),
        tipoIva: pct(f['Tipo de IVA'] ?? ''),
        retencionPct: pct(f['Tipo IRPF'] ?? ''),
        notas: `Importado de Declarando${numero ? ` (factura ${numero})` : ''}`
      }
      // Comprobación: la cuota calculada por la app debe coincidir con la del libro.
      const cuotas = calcularIngreso({ ...datos, clienteId: null, actividadId: null, operacion: datos.tipoIva ? 'nacional' : 'no_sujeta' })
      if (Math.abs(cuotas.cuotaIva - importeEs(f['Cuota repercutida'] ?? '')) > 1 || Math.abs(cuotas.cuotaRetencion - importeEs(f['Cuota IRPF'] ?? '')) > 1) {
        avisos.push(`La factura ${numero} tiene cuotas que no cuadran con su base; revisa el IVA y la retención.`)
      }
      ingresos.push({
        numeroFactura: numero, cliente, iae: f['IAE'] ?? '', calificacion: (f['Calificacion operación'] ?? f['Calificación operación'] ?? '').toUpperCase(),
        datos, adjunto: pdf ? { nombre: nombreArchivo(pdf.ruta), datos: pdf.datos } : null
      })
      if (numero && !pdf) avisos.push(`No encuentro el PDF de la factura ${numero}.`)
    }
  }

  // ----- Gastos: libro + tipo y % deducible del listado -----
  type FilaListado = { fecha: string; base: number; proveedor: string; tipo: string; subtipo: string; ded: number | null; irpf: number; usado: boolean }
  const listado: FilaListado[] = []
  for (const a of porNombre(/^gastos_con_factura_\d{4}\.csv$/i)) {
    for (const f of tabla(decodificar(a.datos))) {
      listado.push({
        fecha: fechaEs(f['Fecha'] ?? ''), base: importeEs(f['Base'] ?? ''), proveedor: sinAcentos(f['Proveedor'] ?? ''),
        tipo: f['Tipo'] ?? '', subtipo: f['Subtipo'] ?? '', ded: f['% DED'] ? pct(f['% DED']) : null, irpf: importeEs(f['IRPF'] ?? ''), usado: false
      })
    }
  }
  for (const a of porNombre(/^gastos_con_otro_comprobante_\d{4}\.csv$/i)) {
    for (const f of tabla(decodificar(a.datos))) {
      listado.push({
        fecha: fechaEs(f['Fecha'] ?? ''), base: importeEs(f['Importe'] ?? ''), proveedor: sinAcentos(f['Proveedor'] ?? ''),
        tipo: f['Tipo'] ?? '', subtipo: f['Subtipo'] ?? '', ded: f['% DED'] ? pct(f['% DED']) : null, irpf: 0, usado: false
      })
    }
  }

  // Justificantes de gastos: se emparejan por el número de factura si el PDF lo deja leer.
  const justificantes = archivos.filter((a) => /factura_gasto_/i.test(a.ruta))
  const textos = new Map(justificantes.map((j) => [j, opciones.extraerTexto && /\.pdf$/i.test(j.ruta) ? opciones.extraerTexto(j.datos) : '']))
  const asignados = new Set<ArchivoImportado>()

  const gastos: GastoImportado[] = []
  for (const libro of librosGastos.sort((a, b) => anioDe(a) - anioDe(b))) {
    for (const f of tabla(decodificar(libro.datos))) {
      const fecha = fechaEs(f['Fecha de recepción'] ?? '')
      const base = importeEs(f['Base imponible'] ?? '')
      const proveedor = f['Nombre del proveedor'] ?? ''
      const nif = normalizarNif(f['NIF del proveedor'] ?? '')
      const tipoIva = pct(f['Tipo de IVA (%)'] ?? '')
      const soportada = importeEs(f['Cuota soportada'] ?? '')
      const deducibleIva = importeEs(f['Cuota deducible'] ?? '')
      const gastoDeducible = importeEs(f['Gasto deducible'] ?? '')
      const numero = f['Número de la factura'] ?? ''

      const l = listado.find((x) => !x.usado && x.fecha === fecha && x.base === base && x.proveedor === sinAcentos(proveedor))
      if (l) l.usado = true
      const dedIrpf = l?.ded ?? (base ? redondear2((gastoDeducible / base) * 100) : 100)
      const dedIva = soportada ? redondear2((deducibleIva / soportada) * 100) : 0
      const tipoTexto = [l?.tipo, l?.subtipo].filter(Boolean).join(' · ')
      const pais = paisDeNif(nif) || (nif ? '' : 'ES')
      const bien = sinAcentos(f['Bien de inversión'] ?? '')

      const datos: Omit<GastoNuevo, 'actividadId'> = {
        fecha, proveedor, nifProveedor: nif, paisProveedor: pais || 'ES', numeroFactura: numero,
        concepto: capitalizar(tipoTexto) || proveedor || 'Gasto importado',
        categoria: categoriaDeTipo(tipoTexto, proveedor),
        base, tipoIva, deduciblePctIrpf: dedIrpf, deduciblePctIva: dedIva,
        retencionPct: l?.irpf && base ? redondear2((l.irpf / base) * 100) : 0,
        operacion: tipoIva > 0 ? 'nacional' : 'sin_iva',
        bienInversion: !!bien && !/^(no?|0|false)$/.test(bien),
        notas: `Importado de Declarando${f['Número de recepción'] ? ` (${f['Número de recepción']})` : ''}`
      }
      const cuota = calcularGasto({ ...datos, actividadId: null }).cuotaIva
      if (Math.abs(cuota - soportada) > 1) avisos.push(`El gasto de ${proveedor} del ${fecha} tiene una cuota de IVA que no cuadra con su base; revísalo.`)
      if (!l) avisos.push(`El gasto de ${proveedor || 'sin proveedor'} del ${fecha} no está en los listados: la categoría se ha deducido del proveedor.`)

      let adjunto: AdjuntoImportado | null = null
      if (numero) {
        const j = justificantes.find((x) => !asignados.has(x) && textos.get(x)!.includes(numero))
        if (j) { asignados.add(j); adjunto = { nombre: nombreArchivo(j.ruta), datos: j.datos } }
      }
      gastos.push({ iae: f['IAE'] ?? '', datos, adjunto })
    }
  }
  const sobrantes = listado.filter((l) => !l.usado)
  if (sobrantes.length) avisos.push(`${sobrantes.length} gasto(s) de los listados no aparecen en los libros contables y no se importan.`)
  const sinAsignar = justificantes.filter((j) => !asignados.has(j)).map((j) => ({ nombre: nombreArchivo(j.ruta), datos: j.datos }))

  // ----- Resumen por año -----
  const anios = new Map<number, ResumenAnio>()
  const del = (fecha: string) => {
    const anio = Number(fecha.slice(0, 4))
    if (!anios.has(anio)) anios.set(anio, { anio, ingresos: 0, baseIngresos: 0, gastos: 0, baseGastos: 0 })
    return anios.get(anio)!
  }
  for (const i of ingresos) { const r = del(i.datos.fecha); r.ingresos++; r.baseIngresos += i.datos.base }
  for (const g of gastos) { const r = del(g.datos.fecha); r.gastos++; r.baseGastos += g.datos.base }

  return {
    origen: 'declarando',
    clientes: [...clientes.values()],
    ingresos, gastos, sinAsignar,
    resumen: [...anios.values()].sort((a, b) => a.anio - b.anio),
    avisos
  }
}

/** Operación de un ingreso según la calificación del libro y el país del cliente. */
export function operacionIngreso(calificacion: string, tipoIva: number, paisCliente: string): IngresoNuevo['operacion'] {
  if (tipoIva > 0 || paisCliente === 'ES' || (calificacion.startsWith('S') && !paisCliente)) return 'nacional'
  return (PAISES_UE as readonly string[]).includes(paisCliente) ? 'intracomunitaria' : 'no_sujeta'
}
