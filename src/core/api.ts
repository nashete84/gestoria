// Contrato entre la interfaz (renderer) y el proceso principal.
import type { Resumen } from './db/repos'
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
  abrirAdjunto(id: number): Promise<Resultado<void>>
  borrarAdjunto(id: number): Promise<Resultado<void>>

  resumen(desde: string, hasta: string): Promise<Resultado<Resumen>>
  /** Muestra la carpeta donde están la base de datos y los adjuntos (para copias de seguridad). */
  abrirCarpetaDatos(): Promise<Resultado<void>>
}

export const METODOS_API = [
  'leerPerfil', 'guardarPerfil',
  'listarClientes', 'crearCliente', 'actualizarCliente', 'borrarCliente',
  'listarIngresos', 'crearIngreso', 'actualizarIngreso', 'borrarIngreso',
  'listarGastos', 'crearGasto', 'actualizarGasto', 'borrarGasto',
  'listarAdjuntos', 'adjuntar', 'abrirAdjunto', 'borrarAdjunto',
  'resumen', 'abrirCarpetaDatos'
] as const satisfies readonly (keyof ApiGestoria)[]
