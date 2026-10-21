// Motor del asistente dentro de la app: llama.cpp (node-llama-cpp) con un modelo GGUF guardado en la carpeta de datos.
// El modelo se descarga una vez desde Hugging Face; después todo funciona sin conexión y nada sale del Mac.

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Llama, LlamaContext, LlamaModel, ModelDownloader } from 'node-llama-cpp'
import type { EstadoAsistente, InfoModeloAsistente, Motor } from '../core/asistente/servicio'
import type { PreguntaPreparada } from '../core/asistente/prompt'

/** Qwen3 4B Instruct (julio 2025), cuantizado a 4 bits: buen español, sin modo de razonamiento y cabe en 8 GB de RAM. */
const MODELO = {
  uri: 'hf:unsloth/Qwen3-4B-Instruct-2507-GGUF/Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
  archivo: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
  info: { nombre: 'Qwen3 4B Instruct', tamano: '2,5 GB', memoria: '8 GB de RAM o más' } satisfies InfoModeloAsistente
}

const cargarLibreria = () => import('node-llama-cpp').catch((e: unknown) => {
  throw new Error(`Falta la librería del asistente (node-llama-cpp). Ejecuta "npm install" en la carpeta del proyecto. Detalle: ${e instanceof Error ? e.message : String(e)}`)
})

export class MotorLocal implements Motor {
  private descarga: { downloader: ModelDownloader; control: AbortController } | null = null
  private progreso = { descargado: 0, total: 0 }
  private error: string | null = null
  private llama: Llama | null = null
  private modelo: LlamaModel | null = null
  private contexto: LlamaContext | null = null
  private cargando: Promise<LlamaContext> | null = null
  /** Una respuesta cada vez: el contexto tiene una sola secuencia. */
  private cola: Promise<unknown> = Promise.resolve()

  constructor(private carpeta: string, private avisar: (e: EstadoAsistente) => void) {}

  get info(): InfoModeloAsistente {
    return MODELO.info
  }

  private get ruta() {
    return join(this.carpeta, MODELO.archivo)
  }

  estado(): EstadoAsistente {
    if (this.descarga) return { fase: 'descargando', ...this.progreso }
    if (this.error) return { fase: 'error', mensaje: this.error }
    return existsSync(this.ruta) ? { fase: 'listo' } : { fase: 'sin_modelo' }
  }

  async descargar(): Promise<EstadoAsistente> {
    if (this.descarga) return this.estado()
    this.error = null
    const { createModelDownloader } = await cargarLibreria()
    const control = new AbortController()
    try {
      await mkdir(this.carpeta, { recursive: true })
      const downloader = await createModelDownloader({
        modelUri: MODELO.uri,
        dirPath: this.carpeta,
        fileName: MODELO.archivo,
        deleteTempFileOnCancel: false, // si se corta, la próxima vez continúa donde iba
        onProgress: ({ downloadedSize, totalSize }) => {
          this.progreso = { descargado: downloadedSize, total: totalSize }
          this.avisar(this.estado())
        }
      })
      this.descarga = { downloader, control }
      this.progreso = { descargado: 0, total: downloader.totalSize }
      this.avisar(this.estado())
      await downloader.download({ signal: control.signal })
    } catch (e) {
      if (!control.signal.aborted) this.error = `No se pudo descargar el modelo: ${e instanceof Error ? e.message : String(e)}`
    } finally {
      this.descarga = null
      this.avisar(this.estado())
    }
    return this.estado()
  }

  async cancelarDescarga(): Promise<void> {
    if (!this.descarga) return
    this.descarga.control.abort()
    await this.descarga.downloader.cancel({ deleteTempFile: false }).catch(() => undefined)
  }

  private cargar(): Promise<LlamaContext> {
    if (this.contexto) return Promise.resolve(this.contexto)
    this.cargando ??= (async () => {
      if (!existsSync(this.ruta)) throw new Error('Primero descarga el modelo del asistente.')
      const { getLlama } = await cargarLibreria()
      this.llama ??= await getLlama({ build: 'never' }) // binarios precompilados (Metal en Mac); nunca compila
      this.modelo ??= await this.llama.loadModel({ modelPath: this.ruta })
      this.contexto = await this.modelo.createContext({ contextSize: { max: 8192 } })
      return this.contexto
    })().catch((e) => {
      this.cargando = null
      throw e
    })
    return this.cargando
  }

  responder(p: PreguntaPreparada, alTrozo: (t: string) => void, senal: AbortSignal): Promise<string> {
    const tarea = this.cola.then(async () => {
      if (senal.aborted) return ''
      const contexto = await this.cargar()
      const { LlamaChatSession } = await cargarLibreria()
      const sesion = new LlamaChatSession({ contextSequence: contexto.getSequence(), systemPrompt: p.sistema })
      try {
        sesion.setChatHistory([
          { type: 'system', text: p.sistema },
          ...p.historial.map((m) => (m.rol === 'usuario'
            ? { type: 'user' as const, text: m.texto }
            : { type: 'model' as const, response: [m.texto] }))
        ])
        return await sesion.prompt(p.pregunta, {
          onTextChunk: alTrozo, signal: senal, stopOnAbortSignal: true, maxTokens: 700, temperature: 0.2
        })
      } finally {
        sesion.dispose({ disposeSequence: true })
      }
    })
    this.cola = tarea.catch(() => undefined)
    return tarea
  }

  async cerrar(): Promise<void> {
    await this.cancelarDescarga()
    await this.contexto?.dispose()
    await this.modelo?.dispose()
    await this.llama?.dispose()
  }
}
