// Registros de facturación VERI*FACTU: huella encadenada, XML y URL del QR.
// Referencias: "Veri-Factu Descripción servicios web" y especificación de la huella de la AEAT.
//
// IMPORTANTE: el envío a la AEAT está desactivado. Nacho pidió que no se envíe nada hasta que
// lo autorice expresamente. Activarlo exige cambiar ENVIO_HABILITADO en el código.

import { createHash } from 'node:crypto'

export const ENVIO_HABILITADO = false

export type Entorno = 'prueba' | 'produccion'
/** Mientras el envío esté desactivado, todo se genera en el entorno de prueba. */
export const ENTORNO_ACTIVO: Entorno = 'prueba'

export const URL_QR: Record<Entorno, string> = {
  prueba: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
  produccion: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
}

const NS_SUM = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd'
const NS_SUM1 = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd'

export interface RegistroAnteriorRef {
  idEmisor: string
  numSerie: string
  fechaExpedicion: string // AAAA-MM-DD
  huella: string
}

export interface SistemaInformatico {
  nombreRazon: string
  nif: string
}

export type Calificacion = 'S1' | 'N2'

export interface DatosAlta {
  idEmisor: string
  nombreEmisor: string
  numSerie: string
  fechaExpedicion: string // AAAA-MM-DD
  tipoFactura: 'F1'
  descripcion: string
  destinatario:
    | { nombre: string; nif: string }
    | { nombre: string; codigoPais: string; idType: '02' | '04' | '06'; id: string }
  desglose: {
    calificacion: Calificacion
    tipoImpositivo: number // solo S1
    base: number // céntimos
    cuota: number // céntimos, solo S1
  }
  cuotaTotal: number // céntimos
  importeTotal: number // céntimos (base + IVA; las retenciones de IRPF no restan)
  anterior: RegistroAnteriorRef | null
  fechaHoraHuso: string
  sistema: SistemaInformatico
}

export interface DatosAnulacion {
  idEmisor: string
  numSerie: string
  fechaExpedicion: string
  anterior: RegistroAnteriorRef | null
  fechaHoraHuso: string
  sistema: SistemaInformatico
}

/** Importe en euros con dos decimales y punto, como en el XML y en la huella: 12345 → "123.45". */
export function importeXml(c: number): string {
  const signo = c < 0 ? '-' : ''
  const abs = Math.abs(c)
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** AAAA-MM-DD → DD-MM-AAAA (formato de fechas de VERI*FACTU). */
export function fechaVf(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}-${m}-${a}`
}

/** Fecha y hora local con huso horario: 2026-10-21T16:05:12+02:00. */
export function fechaHoraHuso(fecha = new Date()): string {
  const off = -fecha.getTimezoneOffset()
  const local = new Date(fecha.getTime() + off * 60000).toISOString().slice(0, 19)
  const signo = off >= 0 ? '+' : '-'
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')
  const m = String(Math.abs(off) % 60).padStart(2, '0')
  return `${local}${signo}${h}:${m}`
}

function sha256(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex').toUpperCase()
}

export function cadenaHuellaAlta(d: DatosAlta): string {
  return [
    `IDEmisorFactura=${d.idEmisor.trim()}`,
    `NumSerieFactura=${d.numSerie.trim()}`,
    `FechaExpedicionFactura=${fechaVf(d.fechaExpedicion)}`,
    `TipoFactura=${d.tipoFactura}`,
    `CuotaTotal=${importeXml(d.cuotaTotal)}`,
    `ImporteTotal=${importeXml(d.importeTotal)}`,
    `Huella=${d.anterior?.huella ?? ''}`,
    `FechaHoraHusoGenRegistro=${d.fechaHoraHuso}`
  ].join('&')
}

export function cadenaHuellaAnulacion(d: DatosAnulacion): string {
  return [
    `IDEmisorFacturaAnulada=${d.idEmisor.trim()}`,
    `NumSerieFacturaAnulada=${d.numSerie.trim()}`,
    `FechaExpedicionFacturaAnulada=${fechaVf(d.fechaExpedicion)}`,
    `Huella=${d.anterior?.huella ?? ''}`,
    `FechaHoraHusoGenRegistro=${d.fechaHoraHuso}`
  ].join('&')
}

export const huellaAlta = (d: DatosAlta) => sha256(cadenaHuellaAlta(d))
export const huellaAnulacion = (d: DatosAnulacion) => sha256(cadenaHuellaAnulacion(d))

export function escaparXml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

const e = escaparXml

function xmlEncadenamiento(a: RegistroAnteriorRef | null): string {
  if (!a) return '<sum1:Encadenamiento><sum1:PrimerRegistro>S</sum1:PrimerRegistro></sum1:Encadenamiento>'
  return `<sum1:Encadenamiento><sum1:RegistroAnterior>` +
    `<sum1:IDEmisorFactura>${e(a.idEmisor)}</sum1:IDEmisorFactura>` +
    `<sum1:NumSerieFactura>${e(a.numSerie)}</sum1:NumSerieFactura>` +
    `<sum1:FechaExpedicionFactura>${fechaVf(a.fechaExpedicion)}</sum1:FechaExpedicionFactura>` +
    `<sum1:Huella>${a.huella}</sum1:Huella>` +
    `</sum1:RegistroAnterior></sum1:Encadenamiento>`
}

function xmlSistema(s: SistemaInformatico): string {
  return `<sum1:SistemaInformatico>` +
    `<sum1:NombreRazon>${e(s.nombreRazon)}</sum1:NombreRazon>` +
    `<sum1:NIF>${e(s.nif)}</sum1:NIF>` +
    `<sum1:NombreSistemaInformatico>Gestoria</sum1:NombreSistemaInformatico>` +
    `<sum1:IdSistemaInformatico>GS</sum1:IdSistemaInformatico>` +
    `<sum1:Version>0.1</sum1:Version>` +
    `<sum1:NumeroInstalacion>1</sum1:NumeroInstalacion>` +
    `<sum1:TipoUsoPosibleSoloVerifactu>S</sum1:TipoUsoPosibleSoloVerifactu>` +
    `<sum1:TipoUsoPosibleMultiOT>N</sum1:TipoUsoPosibleMultiOT>` +
    `<sum1:IndicadorMultiplesOT>N</sum1:IndicadorMultiplesOT>` +
    `</sum1:SistemaInformatico>`
}

export function xmlRegistroAlta(d: DatosAlta, huella: string): string {
  const dest = 'nif' in d.destinatario
    ? `<sum1:NombreRazon>${e(d.destinatario.nombre)}</sum1:NombreRazon><sum1:NIF>${e(d.destinatario.nif)}</sum1:NIF>`
    : `<sum1:NombreRazon>${e(d.destinatario.nombre)}</sum1:NombreRazon><sum1:IDOtro>` +
      `<sum1:CodigoPais>${e(d.destinatario.codigoPais)}</sum1:CodigoPais>` +
      `<sum1:IDType>${d.destinatario.idType}</sum1:IDType>` +
      `<sum1:ID>${e(d.destinatario.id)}</sum1:ID></sum1:IDOtro>`
  const g = d.desglose
  const detalle = g.calificacion === 'S1'
    ? `<sum1:Impuesto>01</sum1:Impuesto><sum1:ClaveRegimen>01</sum1:ClaveRegimen><sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion>` +
      `<sum1:TipoImpositivo>${g.tipoImpositivo.toFixed(2)}</sum1:TipoImpositivo>` +
      `<sum1:BaseImponibleOimporteNoSujeto>${importeXml(g.base)}</sum1:BaseImponibleOimporteNoSujeto>` +
      `<sum1:CuotaRepercutida>${importeXml(g.cuota)}</sum1:CuotaRepercutida>`
    : `<sum1:Impuesto>01</sum1:Impuesto><sum1:ClaveRegimen>01</sum1:ClaveRegimen><sum1:CalificacionOperacion>N2</sum1:CalificacionOperacion>` +
      `<sum1:BaseImponibleOimporteNoSujeto>${importeXml(g.base)}</sum1:BaseImponibleOimporteNoSujeto>`
  return `<sum1:RegistroAlta>` +
    `<sum1:IDVersion>1.0</sum1:IDVersion>` +
    `<sum1:IDFactura><sum1:IDEmisorFactura>${e(d.idEmisor)}</sum1:IDEmisorFactura>` +
    `<sum1:NumSerieFactura>${e(d.numSerie)}</sum1:NumSerieFactura>` +
    `<sum1:FechaExpedicionFactura>${fechaVf(d.fechaExpedicion)}</sum1:FechaExpedicionFactura></sum1:IDFactura>` +
    `<sum1:NombreRazonEmisor>${e(d.nombreEmisor)}</sum1:NombreRazonEmisor>` +
    `<sum1:TipoFactura>${d.tipoFactura}</sum1:TipoFactura>` +
    `<sum1:DescripcionOperacion>${e(d.descripcion.slice(0, 500))}</sum1:DescripcionOperacion>` +
    `<sum1:Destinatarios><sum1:IDDestinatario>${dest}</sum1:IDDestinatario></sum1:Destinatarios>` +
    `<sum1:Desglose><sum1:DetalleDesglose>${detalle}</sum1:DetalleDesglose></sum1:Desglose>` +
    `<sum1:CuotaTotal>${importeXml(d.cuotaTotal)}</sum1:CuotaTotal>` +
    `<sum1:ImporteTotal>${importeXml(d.importeTotal)}</sum1:ImporteTotal>` +
    xmlEncadenamiento(d.anterior) +
    xmlSistema(d.sistema) +
    `<sum1:FechaHoraHusoGenRegistro>${d.fechaHoraHuso}</sum1:FechaHoraHusoGenRegistro>` +
    `<sum1:TipoHuella>01</sum1:TipoHuella>` +
    `<sum1:Huella>${huella}</sum1:Huella>` +
    `</sum1:RegistroAlta>`
}

export function xmlRegistroAnulacion(d: DatosAnulacion, huella: string): string {
  return `<sum1:RegistroAnulacion>` +
    `<sum1:IDVersion>1.0</sum1:IDVersion>` +
    `<sum1:IDFactura><sum1:IDEmisorFacturaAnulada>${e(d.idEmisor)}</sum1:IDEmisorFacturaAnulada>` +
    `<sum1:NumSerieFacturaAnulada>${e(d.numSerie)}</sum1:NumSerieFacturaAnulada>` +
    `<sum1:FechaExpedicionFacturaAnulada>${fechaVf(d.fechaExpedicion)}</sum1:FechaExpedicionFacturaAnulada></sum1:IDFactura>` +
    xmlEncadenamiento(d.anterior) +
    xmlSistema(d.sistema) +
    `<sum1:FechaHoraHusoGenRegistro>${d.fechaHoraHuso}</sum1:FechaHoraHusoGenRegistro>` +
    `<sum1:TipoHuella>01</sum1:TipoHuella>` +
    `<sum1:Huella>${huella}</sum1:Huella>` +
    `</sum1:RegistroAnulacion>`
}

/** Petición SOAP completa con uno o varios registros (lo que se enviaría a la AEAT). */
export function sobreSoap(obligado: SistemaInformatico, registros: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="${NS_SUM}" xmlns:sum1="${NS_SUM1}">` +
    `<soapenv:Header/><soapenv:Body><sum:RegFactuSistemaFacturacion>` +
    `<sum:Cabecera><sum1:ObligadoEmision><sum1:NombreRazon>${e(obligado.nombreRazon)}</sum1:NombreRazon>` +
    `<sum1:NIF>${e(obligado.nif)}</sum1:NIF></sum1:ObligadoEmision></sum:Cabecera>` +
    registros.map((r) => `<sum:RegistroFactura>${r}</sum:RegistroFactura>`).join('') +
    `</sum:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>`
}

/** URL que codifica el QR de la factura. */
export function urlQr(entorno: Entorno, nif: string, numSerie: string, fechaIso: string, importeTotal: number): string {
  const q = new URLSearchParams({ nif, numserie: numSerie, fecha: fechaVf(fechaIso), importe: importeXml(importeTotal) })
  return `${URL_QR[entorno]}?${q.toString()}`
}

/** Formatea un XML de una línea con sangría, solo para mostrarlo. */
export function xmlLegible(xml: string): string {
  let nivel = 0
  return xml
    .replace(/>\s*</g, '>\n<')
    .split('\n')
    .map((linea) => {
      if (/^<\//.test(linea)) nivel = Math.max(0, nivel - 1)
      const r = '  '.repeat(nivel) + linea
      if (/^<[^!?/][^>]*[^/]>$/.test(linea) && !/<\/[^>]+>$/.test(linea)) nivel++
      return r
    })
    .join('\n')
}
