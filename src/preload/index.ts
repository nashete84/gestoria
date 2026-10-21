import { contextBridge, ipcRenderer } from 'electron'
import { CANAL_ASISTENTE, METODOS_API, type ApiGestoria, type EventosGestoria } from '../core/api'
import type { EventoAsistente } from '../core/asistente/servicio'

// Solo se expone una lista cerrada de métodos; la interfaz no tiene acceso a Node ni a la base de datos.
const api = Object.fromEntries(
  METODOS_API.map((m) => [m, (...args: unknown[]) => ipcRenderer.invoke(`gestoria:${m}`, ...args)])
) as unknown as ApiGestoria

contextBridge.exposeInMainWorld('gestoria', api)

const eventos: EventosGestoria = {
  alAsistente: (cb) => {
    const f = (_e: unknown, evento: EventoAsistente) => cb(evento)
    ipcRenderer.on(CANAL_ASISTENTE, f)
    return () => { ipcRenderer.removeListener(CANAL_ASISTENTE, f) }
  }
}
contextBridge.exposeInMainWorld('gestoriaEventos', eventos)
