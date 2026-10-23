import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

/** Copia un archivo a la carpeta de adjuntos con su hash como nombre (evita duplicados y colisiones). */
export async function copiarAdjunto(origen: string, carpeta: string) {
  const contenido = await readFile(origen)
  const sha256 = createHash('sha256').update(contenido).digest('hex')
  await mkdir(carpeta, { recursive: true })
  const ext = extname(origen).toLowerCase().replace(/[^.a-z0-9]/g, '')
  const ruta = join(carpeta, sha256 + ext)
  await copyFile(origen, ruta)
  return { nombre: basename(origen), ruta, sha256 }
}

export async function eliminarArchivo(ruta: string) {
  await rm(ruta, { force: true })
}
