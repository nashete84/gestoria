import type BetterSqlite3 from 'better-sqlite3'
import { ambitoDePais } from '../fiscalidad'
import { normalizarNif } from '../nif'
import type { Cliente, Perfil } from '../tipos'
import {
  ENTORNO_ACTIVO, ENVIO_HABILITADO, fechaHoraHuso, huellaAlta, huellaAnulacion, sobreSoap, urlQr,
  xmlLegible, xmlRegistroAlta, xmlRegistroAnulacion, type DatosAlta, type DatosAnulacion, type Entorno,
  type RegistroAnteriorRef
} from '../verifactu'
import { ErrorValidacion, leerPerfil } from './repos'

type Db = BetterSqlite3.Database
type Fila = Record<string, unknown>

export interface Factura {
  id: number
  entorno: Entorno
  numSerie: string
  fechaExpedicion: string
  ingresoId: number | null
  emisor: Perfil
  cliente: Cliente
  concepto: string
  base: number
  tipoIva: number
  cuotaIva: number
  retencionPct: number
  cuotaRetencion: number
  operacion: 'nacional' | 'intracomunitaria' | 'no_sujeta'
  estado: 'emitida' | 'anulada'
}

export interface RegistroVerifactu {
  id: number
  tipo: 'alta' | 'anulacion'
  fechaHoraHuso: string
  huella: string
  estadoEnvio: 'pendiente' | 'correcto' | 'aceptado_con_errores' | 'incorrecto'
  csv: string | null
  error: string | null
}

export interface DetalleFactura {
  factura: Factura
  registros: RegistroVerifactu[]
  urlQr: string
  envioHabilitado: boolean
}

function aFactura(f: Fila): Factura {
  return {
    id: f.id as number, entorno: f.entorno as Entorno, numSerie: f.num_serie as string,
    fechaExpedicion: f.fecha_expedicion as string, ingresoId: (f.ingreso_id as number | null) ?? null,
    emisor: JSON.parse(f.emisor as string), cliente: JSON.parse(f.cliente as string),
    concepto: f.concepto as string, base: f.base as number, tipoIva: f.tipo_iva as number,
    cuotaIva: f.cuota_iva as number, retencionPct: f.retencion_pct as number,
    cuotaRetencion: f.cuota_retencion as number, operacion: f.operacion as Factura['operacion'],
    estado: f.estado as Factura['estado']
  }
}

function aRegistro(f: Fila): RegistroVerifactu {
  return {
    id: f.id as number, tipo: f.tipo as RegistroVerifactu['tipo'], fechaHoraHuso: f.fecha_hora_huso as string,
    huella: f.huella as string, estadoEnvio: f.estado_envio as RegistroVerifactu['estadoEnvio'],
    csv: (f.csv as string | null) ?? null, error: (f.error as string | null) ?? null
  }
}

/** Total a cobrar: base + IVA − retención. */
export function totalFactura(f: Pick<Factura, 'base' | 'cuotaIva' | 'cuotaRetencion'>): number {
  return f.base + f.cuotaIva - f.cuotaRetencion
}

/** Importe total a efectos de VERI*FACTU y del QR: base + IVA (la retención no resta). */
export function importeTotalVf(f: Pick<Factura, 'base' | 'cuotaIva'>): number {
  return f.base + f.cuotaIva
}

function ultimoRegistro(db: Db, entorno: Entorno): RegistroAnteriorRef | null {
  const r = db.prepare(`SELECT id_emisor, num_serie, fecha_expedicion, huella FROM registros_verifactu
    WHERE entorno = ? ORDER BY id DESC LIMIT 1`).get(entorno) as Fila | undefined
  return r
    ? { idEmisor: r.id_emisor as string, numSerie: r.num_serie as string, fechaExpedicion: r.fecha_expedicion as string, huella: r.huella as string }
    : null
}

function sistema(p: Perfil) {
  return { nombreRazon: p.nombre, nif: p.nif }
}

function destinatario(c: Cliente): DatosAlta['destinatario'] {
  const ambito = ambitoDePais(c.pais)
  if (ambito === 'nacional') return { nombre: c.nombre, nif: normalizarNif(c.nif) }
  // 02 = NIF-IVA (empresas de la UE); 06 = otro documento (resto de extranjeros).
  const idType = ambito === 'ue' && c.tipo === 'empresa' ? '02' : '06'
  return { nombre: c.nombre, codigoPais: c.pais, idType, id: normalizarNif(c.nif) }
}

function serieDe(entorno: Entorno, anio: string) {
  return entorno === 'prueba' ? `PRUEBA-${anio}` : anio
}

/**
 * Emite la factura de un ingreso: le asigna número, guarda una copia fija de los datos
 * y genera su registro de alta encadenado. A partir de aquí el ingreso no se puede editar.
 */
export function emitirFactura(db: Db, ingresoId: number, hoy: string, ahora = new Date()): Factura {
  const perfil = leerPerfil(db)
  if (!perfil) throw new ErrorValidacion(['Rellena tu perfil antes de emitir facturas.'])
  const ing = db.prepare('SELECT * FROM ingresos WHERE id = ?').get(ingresoId) as Fila | undefined
  if (!ing) throw new ErrorValidacion(['El ingreso no existe.'])
  if (ing.factura_id) throw new ErrorValidacion(['Este ingreso ya tiene factura.'])
  if (!ing.cliente_id) throw new ErrorValidacion(['Elige un cliente en el ingreso para poder facturarlo.'])
  const cli = db.prepare('SELECT * FROM clientes WHERE id = ?').get(ing.cliente_id) as Fila
  const cliente: Cliente = {
    id: cli.id as number, tipo: cli.tipo as Cliente['tipo'], nombre: cli.nombre as string, nif: cli.nif as string,
    pais: cli.pais as string, domicilio: cli.domicilio as string, codigoPostal: cli.codigo_postal as string,
    municipio: cli.municipio as string, provincia: cli.provincia as string, email: cli.email as string, notas: cli.notas as string
  }
  if (!cliente.nif) throw new ErrorValidacion(['El cliente necesita NIF o identificador fiscal para una factura completa.'])

  const fecha = ing.fecha as string
  if (fecha > hoy) throw new ErrorValidacion(['No se puede emitir una factura con fecha futura.'])
  const entorno = ENTORNO_ACTIVO
  const serie = serieDe(entorno, fecha.slice(0, 4))
  const ultima = db.prepare('SELECT numero, fecha_expedicion FROM facturas WHERE serie = ? ORDER BY numero DESC LIMIT 1')
    .get(serie) as { numero: number; fecha_expedicion: string } | undefined
  if (ultima && fecha < ultima.fecha_expedicion) {
    throw new ErrorValidacion([`La numeración debe seguir el orden de fechas: la última factura de la serie es del ${ultima.fecha_expedicion}.`])
  }
  const numero = (ultima?.numero ?? 0) + 1
  const numSerie = `${serie}-${String(numero).padStart(4, '0')}`

  const operacion = ing.operacion as Factura['operacion']
  const datos: DatosAlta = {
    idEmisor: perfil.nif,
    nombreEmisor: perfil.nombre,
    numSerie,
    fechaExpedicion: fecha,
    tipoFactura: 'F1',
    descripcion: ing.concepto as string,
    destinatario: destinatario(cliente),
    desglose: {
      calificacion: operacion === 'nacional' ? 'S1' : 'N2',
      tipoImpositivo: ing.tipo_iva as number,
      base: ing.base as number,
      cuota: ing.cuota_iva as number
    },
    cuotaTotal: ing.cuota_iva as number,
    importeTotal: (ing.base as number) + (ing.cuota_iva as number),
    anterior: null,
    fechaHoraHuso: fechaHoraHuso(ahora),
    sistema: sistema(perfil)
  }

  return db.transaction(() => {
    datos.anterior = ultimoRegistro(db, entorno)
    const r = db.prepare(`INSERT INTO facturas (entorno, serie, numero, num_serie, fecha_expedicion, ingreso_id, emisor, cliente,
      concepto, base, tipo_iva, cuota_iva, retencion_pct, cuota_retencion, operacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      entorno, serie, numero, numSerie, fecha, ingresoId, JSON.stringify(perfil), JSON.stringify(cliente),
      ing.concepto, ing.base, ing.tipo_iva, ing.cuota_iva, ing.retencion_pct, ing.cuota_retencion, operacion)
    const facturaId = Number(r.lastInsertRowid)
    const huella = huellaAlta(datos)
    insertarRegistro(db, entorno, 'alta', facturaId, datos.idEmisor, numSerie, fecha, datos.fechaHoraHuso, huella,
      datos.anterior?.huella ?? null, xmlRegistroAlta(datos, huella))
    db.prepare('UPDATE ingresos SET factura_id = ? WHERE id = ?').run(facturaId, ingresoId)
    return leerFactura(db, facturaId)!
  })()
}

function insertarRegistro(
  db: Db, entorno: Entorno, tipo: 'alta' | 'anulacion', facturaId: number, idEmisor: string, numSerie: string,
  fecha: string, fhh: string, huella: string, anterior: string | null, xml: string
) {
  db.prepare(`INSERT INTO registros_verifactu (entorno, tipo, factura_id, id_emisor, num_serie, fecha_expedicion,
    fecha_hora_huso, huella, huella_anterior, xml) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(entorno, tipo, facturaId, idEmisor, numSerie, fecha, fhh, huella, anterior, xml)
}

/**
 * Anula una factura: genera el registro de anulación encadenado, la marca como anulada y
 * borra el ingreso asociado. La factura y sus registros se conservan (son obligatorios).
 * Solo para facturas emitidas por error; si la operación existió, corresponde una rectificativa.
 */
export function anularFactura(db: Db, facturaId: number, ahora = new Date()): Factura {
  const f = leerFactura(db, facturaId)
  if (!f) throw new ErrorValidacion(['La factura no existe.'])
  if (f.estado === 'anulada') throw new ErrorValidacion(['La factura ya está anulada.'])
  const perfil = leerPerfil(db)!
  return db.transaction(() => {
    const datos: DatosAnulacion = {
      idEmisor: f.emisor.nif, numSerie: f.numSerie, fechaExpedicion: f.fechaExpedicion,
      anterior: ultimoRegistro(db, f.entorno), fechaHoraHuso: fechaHoraHuso(ahora), sistema: sistema(perfil)
    }
    const huella = huellaAnulacion(datos)
    insertarRegistro(db, f.entorno, 'anulacion', f.id, datos.idEmisor, f.numSerie, f.fechaExpedicion,
      datos.fechaHoraHuso, huella, datos.anterior?.huella ?? null, xmlRegistroAnulacion(datos, huella))
    db.prepare("UPDATE facturas SET estado = 'anulada' WHERE id = ?").run(f.id)
    if (f.ingresoId) {
      db.prepare("DELETE FROM adjuntos WHERE entidad = 'ingreso' AND entidad_id = ?").run(f.ingresoId)
      db.prepare('DELETE FROM ingresos WHERE id = ?').run(f.ingresoId)
    }
    return leerFactura(db, f.id)!
  })()
}

export function leerFactura(db: Db, id: number): Factura | null {
  const f = db.prepare('SELECT * FROM facturas WHERE id = ?').get(id) as Fila | undefined
  return f ? aFactura(f) : null
}

export function listarFacturas(db: Db, desde: string, hasta: string): Factura[] {
  return (db.prepare('SELECT * FROM facturas WHERE fecha_expedicion BETWEEN ? AND ? ORDER BY fecha_expedicion DESC, numero DESC')
    .all(desde, hasta) as Fila[]).map(aFactura)
}

export function detalleFactura(db: Db, id: number): DetalleFactura | null {
  const factura = leerFactura(db, id)
  if (!factura) return null
  const registros = (db.prepare('SELECT * FROM registros_verifactu WHERE factura_id = ? ORDER BY id').all(id) as Fila[]).map(aRegistro)
  return {
    factura,
    registros,
    urlQr: urlQr(factura.entorno, factura.emisor.nif, factura.numSerie, factura.fechaExpedicion, importeTotalVf(factura)),
    envioHabilitado: ENVIO_HABILITADO
  }
}

/** XML de la petición que se enviaría a la AEAT con los registros pendientes de esta factura. */
export function xmlEnvio(db: Db, facturaId: number): string {
  const f = leerFactura(db, facturaId)
  if (!f) throw new ErrorValidacion(['La factura no existe.'])
  const xmls = (db.prepare('SELECT xml FROM registros_verifactu WHERE factura_id = ? ORDER BY id').all(facturaId) as { xml: string }[])
    .map((r) => r.xml)
  return xmlLegible(sobreSoap(sistema(f.emisor), xmls))
}

/** Comprueba que la cadena de huellas de un entorno no está rota. */
export function verificarCadena(db: Db, entorno: Entorno): { ok: boolean; registros: number; error?: string } {
  const filas = db.prepare('SELECT id, huella, huella_anterior FROM registros_verifactu WHERE entorno = ? ORDER BY id').all(entorno) as Fila[]
  let anterior: string | null = null
  for (const f of filas) {
    if ((f.huella_anterior ?? null) !== anterior) return { ok: false, registros: filas.length, error: `Cadena rota en el registro ${f.id}` }
    anterior = f.huella as string
  }
  return { ok: true, registros: filas.length }
}
