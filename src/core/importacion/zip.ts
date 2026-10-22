// Lector mínimo de ZIP (sin dependencias): sin cifrar, sin ZIP64, métodos "store" y "deflate".
// Suficiente para las exportaciones de Declarando y otras herramientas de contabilidad.

import { inflateRawSync } from 'node:zlib'

export interface ArchivoImportado {
  /** Ruta dentro del ZIP o de la carpeta, con "/" como separador. */
  ruta: string
  datos: Uint8Array
}

const FIN_DIRECTORIO = 0x06054b50
const CABECERA_CENTRAL = 0x02014b50
const CABECERA_LOCAL = 0x04034b50
/** Límite por archivo descomprimido, para no agotar la memoria con un ZIP malicioso. */
const MAX_ARCHIVO = 200 * 1024 * 1024

export function leerZip(zip: Uint8Array): ArchivoImportado[] {
  const b = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength)
  let fin = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (b.readUInt32LE(i) === FIN_DIRECTORIO) { fin = i; break }
  }
  if (fin < 0) throw new Error('No es un archivo ZIP válido.')
  const total = b.readUInt16LE(fin + 10)
  let p = b.readUInt32LE(fin + 16)
  if (p === 0xffffffff) throw new Error('ZIP64 no soportado.')

  const archivos: ArchivoImportado[] = []
  for (let n = 0; n < total; n++) {
    if (b.readUInt32LE(p) !== CABECERA_CENTRAL) throw new Error('ZIP dañado (directorio central).')
    const flags = b.readUInt16LE(p + 8)
    const metodo = b.readUInt16LE(p + 10)
    const comprimido = b.readUInt32LE(p + 20)
    const tamano = b.readUInt32LE(p + 24)
    const lNombre = b.readUInt16LE(p + 28)
    const lExtra = b.readUInt16LE(p + 30)
    const lComentario = b.readUInt16LE(p + 32)
    const local = b.readUInt32LE(p + 42)
    const nombreBytes = b.subarray(p + 46, p + 46 + lNombre)
    const ruta = (flags & 0x800 ? nombreBytes.toString('utf8') : nombreBytes.toString('latin1')).replace(/\\/g, '/')
    p += 46 + lNombre + lExtra + lComentario

    if (ruta.endsWith('/')) continue // carpeta
    if (flags & 0x1) throw new Error(`"${ruta}" está cifrado.`)
    if (tamano > MAX_ARCHIVO) throw new Error(`"${ruta}" es demasiado grande.`)
    if (b.readUInt32LE(local) !== CABECERA_LOCAL) throw new Error('ZIP dañado (cabecera local).')
    const inicio = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28)
    const crudo = b.subarray(inicio, inicio + comprimido)
    let datos: Buffer
    if (metodo === 0) datos = Buffer.from(crudo)
    else if (metodo === 8) datos = inflateRawSync(crudo, { maxOutputLength: MAX_ARCHIVO })
    else throw new Error(`"${ruta}" usa un método de compresión no soportado (${metodo}).`)
    archivos.push({ ruta, datos: new Uint8Array(datos) })
  }
  return archivos
}
