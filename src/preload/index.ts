import { contextBridge, ipcRenderer } from 'electron'
import { METODOS_API, type ApiGestoria } from '../core/api'

// Solo se expone una lista cerrada de métodos; la interfaz no tiene acceso a Node ni a la base de datos.
const api = Object.fromEntries(
  METODOS_API.map((m) => [m, (...args: unknown[]) => ipcRenderer.invoke(`gestoria:${m}`, ...args)])
) as unknown as ApiGestoria

contextBridge.exposeInMainWorld('gestoria', api)
