// Contrato entre la interfaz (renderer) y el proceso principal.
import type { ObligacionConEstado, Presentacion, PresentacionNueva } from './calendario'
import type { DetalleFactura, Factura } from './db/facturas'
import type { Resumen } from './db/repos'
import type { VistaRenta } from './db/renta'
import type { AjustesModelos, ResultadoModelo } from './modelos/tipos'
import type { EstadoAsistente, EventoAsistente, InfoModeloAsistente, RespuestaAsistente } from './asistente/servicio'
import type { MensajeChat } from './asistente/prompt'
import type { Modelo, Periodo } from './calendario'
import type { DatosRenta } from './renta/calculo'
import type { InformeImpuestos, InformeIngresosGastos } from './informes'
import type { Prevision } from './prevision'
import type { EntradaSimulador, ResultadoSimulador } from './simulador'
import type {
  Adjunto, Cliente, ClienteNuevo, Gasto, GastoNuevo, Ingreso, IngresoNuevo, Perfil
} from './tipos'

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] }

export interface ApiGestoria {
  leerPerfil(): Promise<Resultado<Perfil | null>>
  guardarPerfil(p: Perfil): Promise<Resultado<Perfil>>

  listarClientes(): Promise<Resultado<Cliente[]>>
  crearCliente(c: ClienteNuevo): Promise<Resultado<Cliente>>
  actualizarCliente(id: number, c: ClienteNuevo): Promise<Resultado<Cliente>>
  borrarCliente(id: number): Promise<Resultado<void>>

  listarIngresos(desde: string, hasta: string): Promise<Resultado<Ingreso[]>>
  crearIngreso(i: IngresoNuevo): Promise<Resultado<Ingreso>>
  actualizarIngreso(id: number, i: IngresoNuevo): Promise<Resultado<Ingreso>>
  borrarIngreso(id: number): Promise<Resultado<void>>

  listarGastos(desde: string, hasta: string): Promise<Resultado<Gasto[]>>
  crearGasto(g: GastoNuevo): Promise<Resultado<Gasto>>
  actualizarGasto(id: number, g: GastoNuevo): Promise<Resultado<Gasto>>
  borrarGasto(id: number): Promise<Resultado<void>>

  listarAdjuntos(entidad: Adjunto['entidad'], id: number): Promise<Resultado<Adjunto[]>>
  /** Abre el diálogo de archivos y copia los elegidos a la carpeta de la app. */
  adjuntar(entidad: Adjunto['entidad'], id: number): Promise<Resultado<Adjunto[]>>
  /** Elige archivos antes de que exista el registro; devuelve fichas para adjuntarlos al guardar. */
  elegirArchivos(): Promise<Resultado<{ ficha: string; nombre: string }[]>>
  adjuntarElegidos(entidad: Adjunto['entidad'], id: number, fichas: string[]): Promise<Resultado<Adjunto[]>>
  abrirAdjunto(id: number): Promise<Resultado<void>>
  borrarAdjunto(id: number): Promise<Resultado<void>>

  resumen(desde: string, hasta: string): Promise<Resultado<Resumen>>

  /** Modelos con su estado (pendiente, próximo, presentado) a fecha de `hoy`. */
  calendarioFiscal(hoy: string): Promise<Resultado<ObligacionConEstado[]>>
  registrarPresentacion(p: PresentacionNueva): Promise<Resultado<Presentacion>>
  borrarPresentacion(id: number): Promise<Resultado<void>>

  /** Emite la factura de un ingreso y genera su registro VERI*FACTU (no lo envía). */
  listarFacturas(desde: string, hasta: string): Promise<Resultado<Factura[]>>
  /** HTML de la vista previa de la factura de un ingreso (sin emitirla). */
  vistaPreviaFactura(ingresoId: number): Promise<Resultado<string>>
  /** PDF de la vista previa; pregunta dónde guardarlo. */
  guardarPdfBorrador(ingresoId: number): Promise<Resultado<string | null>>
  emitirFactura(ingresoId: number): Promise<Resultado<Factura>>
  detalleFactura(facturaId: number): Promise<Resultado<DetalleFactura>>
  /** Genera el PDF, pregunta dónde guardarlo y lo abre. Devuelve la ruta o null si se cancela. */
  guardarPdfFactura(facturaId: number): Promise<Resultado<string | null>>
  /** XML de la petición que se enviaría a la AEAT. */
  xmlVerifactu(facturaId: number): Promise<Resultado<string>>
  anularFactura(facturaId: number): Promise<Resultado<Factura>>
  enviarVerifactu(facturaId: number): Promise<Resultado<void>>
  /** Estimación de la declaración de la renta del ejercicio con los datos guardados. */
  estimacionRenta(ejercicio: number): Promise<Resultado<VistaRenta>>
  /** Guarda los datos que no salen de la contabilidad (otras rentas, hijos...) y recalcula. */
  guardarDatosRenta(ejercicio: number, datos: DatosRenta): Promise<Resultado<VistaRenta>>
  /** Casillas de un modelo calculadas con tus datos. */
  calcularModelo(modelo: Modelo, ejercicio: number, periodo: Periodo): Promise<Resultado<ResultadoModelo>>
  /** Genera el .txt del modelo y pregunta dónde guardarlo. Devuelve la ruta y los avisos, o null si se cancela. */
  guardarFicheroModelo(modelo: Modelo, ejercicio: number, periodo: Periodo): Promise<Resultado<{ ruta: string; avisos: string[] } | null>>
  leerAjustesModelos(ejercicio: number): Promise<Resultado<AjustesModelos>>
  guardarAjustesModelos(ejercicio: number, a: AjustesModelos): Promise<Resultado<AjustesModelos>>
  /** Muestra la carpeta donde están la base de datos y los adjuntos (para copias de seguridad). */
  abrirCarpetaDatos(): Promise<Resultado<void>>

  informeIngresosGastos(ejercicio: number, hoy: string): Promise<Resultado<InformeIngresosGastos>>
  informeImpuestos(ejercicio: number, hoy: string): Promise<Resultado<InformeImpuestos>>
  informePrevision(ejercicio: number, hoy: string): Promise<Resultado<Prevision>>
  simularIrpf(ejercicio: number, entrada: EntradaSimulador): Promise<Resultado<ResultadoSimulador>>

  /** Asistente de ayuda local: estado del modelo (descargado o no) y su información. */
  estadoAsistente(): Promise<Resultado<{ estado: EstadoAsistente; modelo: InfoModeloAsistente }>>
  /** Descarga el modelo (una vez). Termina al acabar o al cancelar; el progreso llega como evento. */
  descargarModeloAsistente(): Promise<Resultado<EstadoAsistente>>
  cancelarDescargaAsistente(): Promise<Resultado<void>>
  /** Responde una duda general; los trozos de la respuesta llegan como eventos con el mismo id. */
  preguntarAsistente(id: string, pregunta: string, historial: MensajeChat[]): Promise<Resultado<RespuestaAsistente>>
  cancelarPreguntaAsistente(id: string): Promise<Resultado<void>>
}

/** Eventos que el proceso principal envía a la interfaz. */
export interface EventosGestoria {
  /** Devuelve la función para dejar de escuchar. */
  alAsistente(cb: (e: EventoAsistente) => void): () => void
}

export const CANAL_ASISTENTE = 'gestoria-evento:asistente'

export const METODOS_API = [
  'leerPerfil', 'guardarPerfil',
  'listarClientes', 'crearCliente', 'actualizarCliente', 'borrarCliente',
  'listarIngresos', 'crearIngreso', 'actualizarIngreso', 'borrarIngreso',
  'listarGastos', 'crearGasto', 'actualizarGasto', 'borrarGasto',
  'listarAdjuntos', 'adjuntar', 'elegirArchivos', 'adjuntarElegidos', 'abrirAdjunto', 'borrarAdjunto',
  'resumen', 'calendarioFiscal', 'registrarPresentacion', 'borrarPresentacion',
  'listarFacturas', 'vistaPreviaFactura', 'guardarPdfBorrador', 'emitirFactura', 'detalleFactura', 'guardarPdfFactura', 'xmlVerifactu', 'anularFactura', 'enviarVerifactu',
  'estimacionRenta', 'guardarDatosRenta',
  'calcularModelo', 'guardarFicheroModelo', 'leerAjustesModelos', 'guardarAjustesModelos',
  'abrirCarpetaDatos', 'informeIngresosGastos', 'informeImpuestos', 'informePrevision', 'simularIrpf',
  'estadoAsistente', 'descargarModeloAsistente', 'cancelarDescargaAsistente', 'preguntarAsistente', 'cancelarPreguntaAsistente'
] as const satisfies readonly (keyof ApiGestoria)[]
