// Lectura de lo que el usuario elige para importar: ZIP, carpetas descomprimidas o archivos sueltos.

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import { inflateSync } from 'node:zlib'
import { leerZip, type ArchivoImportado } from '../core/importacion/zip'

const MAX_ARCHIVOS = 5000

export async function leerOrigenes(rutas: string[]): Promise<ArchivoImportado[]> {
  const archivos: ArchivoImportado[] = []
  const anadir = async (ruta: string, nombre: string) => {
    if (archivos.length > MAX_ARCHIVOS) throw new Error('Demasiados archivos.')
    const datos = new Uint8Array(await readFile(ruta))
    if (/\.zip$/i.test(ruta)) archivos.push(...leerZip(datos).map((a) => ({ ruta: `${nombre}/${a.ruta}`, datos: a.datos })))
    else archivos.push({ ruta: nombre, datos })
  }
  const recorrer = async (carpeta: string, raiz: string) => {
    for (const e of await readdir(carpeta, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue
      const ruta = join(carpeta, e.name)
      if (e.isDirectory()) await recorrer(ruta, raiz)
      else if (e.isFile()) await anadir(ruta, relative(raiz, ruta).split(sep).join('/'))
    }
  }
  for (const r of rutas) {
    if ((await stat(r)).isDirectory()) await recorrer(r, r)
    else await anadir(r, r.split(sep).pop()!)
  }
  return archivos
}

/**
 * Texto aproximado de un PDF: el contenido sin comprimir más los flujos "deflate" descomprimidos.
 * No es un lector de PDF: solo sirve para buscar un número de factura cuando el PDF lo guarda como texto.
 */
export function textoPdf(datos: Uint8Array): string {
  const b = Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength)
  const t = b.toString('latin1')
  let texto = t
  let i = 0
  while ((i = t.indexOf('stream', i)) >= 0) {
    let s = i + 6
    if (t[s] === '\r') s++
    if (t[s] === '\n') s++
    const e = t.indexOf('endstream', s)
    if (e < 0) break
    try { texto += inflateSync(b.subarray(s, e), { maxOutputLength: 20 * 1024 * 1024 }).toString('latin1') } catch { /* flujo no comprimido o con otro filtro */ }
    i = e + 9
  }
  return texto
}

/** Guarda un archivo importado en la carpeta de adjuntos, con su hash como nombre (igual que copiarAdjunto). */
export async function guardarAdjuntoImportado(datos: Uint8Array, nombre: string, carpeta: string) {
  const sha256 = createHash('sha256').update(datos).digest('hex')
  await mkdir(carpeta, { recursive: true })
  const ext = extname(nombre).toLowerCase().replace(/[^.a-z0-9]/g, '')
  const ruta = join(carpeta, sha256 + ext)
  await writeFile(ruta, datos)
  return { nombre, ruta, sha256 }
}
