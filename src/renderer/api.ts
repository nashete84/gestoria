import type { ApiGestoria, EventosGestoria, Resultado } from '../core/api'

declare global {
  interface Window {
    gestoria: ApiGestoria
    gestoriaEventos: EventosGestoria
  }
}

export const api = window.gestoria
export const eventos = window.gestoriaEventos

export class ErrorApi extends Error {
  constructor(public errores: string[]) {
    super(errores.join(' '))
  }
}

/** Desenvuelve un Resultado: devuelve los datos o lanza ErrorApi con los mensajes. */
export async function llamar<T>(p: Promise<Resultado<T>>): Promise<T> {
  const r = await p
  if (!r.ok) throw new ErrorApi(r.errores)
  return r.datos
}

export function mensajes(err: unknown): string[] {
  if (err instanceof ErrorApi) return err.errores
  return [err instanceof Error ? err.message : String(err)]
}
