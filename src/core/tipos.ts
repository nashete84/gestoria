import type { Centimos } from './money'

export type SeccionIae = 1 | 2 | 3 // 1 empresarial, 2 profesional, 3 artística

export interface Epigrafe {
  seccion: SeccionIae
  codigo: string
  descripcion: string
}

export interface PorcentajesDeducibles {
  irpf: number
  iva: number
}

/** Una actividad dada de alta (un epígrafe del IAE) con sus % deducibles por categoría de gasto. */
export interface Actividad extends Epigrafe {
  id: string
  principal: boolean
  /** % deducible por id de categoría. Si falta una categoría se usa el valor general. */
  deducibles: Record<string, PorcentajesDeducibles>
}

export interface Perfil {
  nif: string
  nombre: string
  domicilio: string
  codigoPostal: string
  municipio: string
  provincia: string
  email: string
  telefono: string
  iban: string
  /** Actividades dadas de alta. Siempre hay al menos una y exactamente una es la principal. */
  actividades: Actividad[]
  /** Fecha de alta en la actividad (AAAA-MM-DD), decide la retención reducida del 7%. */
  fechaAlta: string
  /** Si en el año anterior al alta ya ejercía actividad, no hay derecho al 7%. */
  actividadAnteriorAlAlta: boolean
  regimenIrpf: 'EDS' // estimación directa simplificada
  regimenIva: 'general'
  /** Alta en el Registro de Operadores Intracomunitarios (necesaria para facturar sin IVA a empresas UE). */
  altaRoi: boolean
  comunidad: 'MD'
  /** No obligado al 130: el año anterior al menos el 70% de los ingresos llevaron retención. */
  exento130?: boolean
  /** Fecha desde la que la app controla los modelos (AAAA-MM-DD). Por defecto, 1 de enero del año en curso. */
  inicioControl?: string
  /** Nombre como lo pide Hacienda en los ficheros: "PRIMER APELLIDO SEGUNDO APELLIDO NOMBRE". */
  nombreFiscal?: string
  /** % de la vivienda dedicado a la actividad (m² del despacho / m² totales). */
  pctViviendaAfecta?: number
}

export type TipoCliente = 'empresa' | 'particular'
export type Ambito = 'nacional' | 'ue' | 'extracomunitario'

export interface Cliente {
  id: number
  tipo: TipoCliente
  nombre: string
  /** NIF español, NIF-IVA UE o identificador fiscal extranjero. */
  nif: string
  pais: string // ISO 3166-1 alfa-2
  domicilio: string
  codigoPostal: string
  municipio: string
  provincia: string
  email: string
  notas: string
}

export type ClienteNuevo = Omit<Cliente, 'id'>

/**
 * Tipo de operación de un ingreso, decide el IVA y en qué modelo aparece.
 * - nacional: IVA español repercutido (303).
 * - intracomunitaria: servicio a empresa UE, inversión del sujeto pasivo (303 y 349 clave S).
 * - no_sujeta: servicio a empresa fuera de la UE, no sujeto por reglas de localización (303, casilla informativa).
 */
export type OperacionIngreso = 'nacional' | 'intracomunitaria' | 'no_sujeta'

export interface Ingreso {
  id: number
  fecha: string
  clienteId: number | null
  /** Actividad a la que pertenece; null = la principal. */
  actividadId: string | null
  concepto: string
  base: Centimos
  tipoIva: number
  cuotaIva: Centimos
  retencionPct: number
  cuotaRetencion: Centimos
  operacion: OperacionIngreso
  /** Se rellenará en el paso 2 cuando el ingreso venga de una factura emitida. */
  facturaId: number | null
  notas: string
}

export type IngresoNuevo = Omit<Ingreso, 'id' | 'cuotaIva' | 'cuotaRetencion' | 'facturaId'>

/**
 * Tipo de operación de un gasto.
 * - nacional: IVA soportado normal.
 * - intracomunitaria: compra a empresa UE sin IVA; te autoliquidas el IVA (303 y 349 clave I).
 * - extracomunitaria: servicio de fuera de la UE con inversión del sujeto pasivo.
 * - sin_iva: gasto sin IVA (cuota de autónomo, seguros, tasas...).
 */
export type OperacionGasto = 'nacional' | 'intracomunitaria' | 'extracomunitaria' | 'sin_iva'

export interface Gasto {
  id: number
  fecha: string
  proveedor: string
  nifProveedor: string
  paisProveedor: string
  numeroFactura: string
  /** Actividad a la que pertenece; null = la principal. */
  actividadId: string | null
  concepto: string
  categoria: string
  base: Centimos
  tipoIva: number
  cuotaIva: Centimos
  /** % del gasto deducible en IRPF (p. ej. 30 para suministros de la vivienda). */
  deduciblePctIrpf: number
  /** % de la cuota de IVA deducible en el 303. */
  deduciblePctIva: number
  /** Retención que tú practicas al proveedor (modelo 111 profesionales, 115 alquileres). */
  retencionPct: number
  cuotaRetencion: Centimos
  operacion: OperacionGasto
  /** Bien de inversión (más de 300 € y más de un año de uso): se amortiza en vez de deducirse de golpe. */
  bienInversion: boolean
  notas: string
}

export type GastoNuevo = Omit<Gasto, 'id' | 'cuotaIva' | 'cuotaRetencion'>

export interface Adjunto {
  id: number
  entidad: 'ingreso' | 'gasto'
  entidadId: number
  nombre: string
  ruta: string
  sha256: string
  creado: string
}
