import Database from 'better-sqlite3'
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import type { ApiGestoria, Resultado } from '../core/api'
import * as facturas from '../core/db/facturas'
import * as repos from '../core/db/repos'
import { ENVIO_HABILITADO } from '../core/verifactu'
import { migrar } from '../core/db/schema'
import { copiarAdjunto, eliminarArchivo } from './adjuntos'
import { generarPdf } from './pdf'

let db: Database.Database
let ventana: BrowserWindow | null = null

function carpetaDatos() {
  return app.getPath('userData')
}
function carpetaAdjuntos() {
  return join(carpetaDatos(), 'adjuntos')
}

function abrirBaseDeDatos() {
  db = new Database(join(carpetaDatos(), 'gestoria.sqlite'))
  migrar(db)
}

const id = (v: unknown) => {
  if (!Number.isInteger(v)) throw new repos.ErrorValidacion(['Identificador no válido.'])
  return v as number
}
const entidad = (v: unknown) => {
  if (v !== 'ingreso' && v !== 'gasto') throw new repos.ErrorValidacion(['Tipo de adjunto no válido.'])
  return v
}

const fechaValida = (v: unknown) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new repos.ErrorValidacion(['Fecha no válida.'])
  return v
}

function hoyLocal(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Al abrir la app, avisa de los modelos vencidos o que vencen en los próximos 10 días. */
function avisarImpuestos() {
  if (!Notification.isSupported()) return
  const urgentes = repos.calendarioFiscal(db, hoyLocal()).filter(
    (o) => !o.condicional && (o.estado === 'vencido' || (o.estado === 'en_plazo' && o.diasRestantes <= 10))
  )
  if (!urgentes.length) return
  const vencidos = urgentes.filter((o) => o.estado === 'vencido').length
  const proximo = urgentes.find((o) => o.estado === 'en_plazo')
  const partes = []
  if (vencidos) partes.push(`${vencidos} modelo(s) con el plazo vencido`)
  if (proximo) partes.push(`el ${proximo.modelo} vence el ${proximo.hasta.split('-').reverse().join('/')}`)
  new Notification({ title: 'Impuestos pendientes', body: partes.join(' y ') + '.' }).show()
}

type Handlers = { [K in keyof ApiGestoria]: (...args: any[]) => unknown }

const handlers: Handlers = {
  leerPerfil: () => repos.leerPerfil(db),
  guardarPerfil: (p) => repos.guardarPerfil(db, p),

  listarClientes: () => repos.listarClientes(db),
  crearCliente: (c) => repos.crearCliente(db, c),
  actualizarCliente: (i, c) => repos.actualizarCliente(db, id(i), c),
  borrarCliente: (i) => repos.borrarCliente(db, id(i)),

  listarIngresos: (d, h) => repos.listarIngresos(db, d, h),
  crearIngreso: (n) => repos.crearIngreso(db, n),
  actualizarIngreso: (i, n) => repos.actualizarIngreso(db, id(i), n),
  borrarIngreso: async (i) => {
    const adj = repos.listarAdjuntos(db, 'ingreso', id(i))
    repos.borrarIngreso(db, id(i))
    await limpiarArchivos(adj.map((a) => a.ruta))
  },

  listarGastos: (d, h) => repos.listarGastos(db, d, h),
  crearGasto: (n) => repos.crearGasto(db, n),
  actualizarGasto: (i, n) => repos.actualizarGasto(db, id(i), n),
  borrarGasto: async (i) => {
    const adj = repos.listarAdjuntos(db, 'gasto', id(i))
    repos.borrarGasto(db, id(i))
    await limpiarArchivos(adj.map((a) => a.ruta))
  },

  listarAdjuntos: (e, i) => repos.listarAdjuntos(db, entidad(e), id(i)),
  adjuntar: async (e, i) => {
    const r = await dialog.showOpenDialog(ventana!, {
      title: 'Adjuntar justificante',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Justificantes', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'heic', 'xml'] }]
    })
    if (r.canceled) return []
    const creados = []
    for (const origen of r.filePaths) {
      const copia = await copiarAdjunto(origen, carpetaAdjuntos())
      creados.push(repos.registrarAdjunto(db, { entidad: entidad(e), entidadId: id(i), ...copia }))
    }
    return creados
  },
  abrirAdjunto: async (i) => {
    const a = repos.leerAdjunto(db, id(i))
    if (!a) throw new repos.ErrorValidacion(['El adjunto no existe.'])
    // Solo se abren archivos dentro de la carpeta de adjuntos de la app.
    if (!resolve(a.ruta).startsWith(resolve(carpetaAdjuntos()) + sep)) {
      throw new repos.ErrorValidacion(['Ruta de adjunto no permitida.'])
    }
    const error = await shell.openPath(a.ruta)
    if (error) throw new repos.ErrorValidacion([error])
  },
  borrarAdjunto: async (i) => {
    const a = repos.borrarAdjunto(db, id(i))
    if (a) await limpiarArchivos([a.ruta])
  },

  resumen: (d, h) => repos.resumen(db, d, h),
  calendarioFiscal: (hoy) => repos.calendarioFiscal(db, fechaValida(hoy)),
  registrarPresentacion: (p) => repos.registrarPresentacion(db, p),
  borrarPresentacion: (i) => repos.borrarPresentacion(db, id(i)),

  listarFacturas: (d, h) => facturas.listarFacturas(db, d, h),
  emitirFactura: (i) => facturas.emitirFactura(db, id(i), hoyLocal()),
  detalleFactura: (i) => {
    const d = facturas.detalleFactura(db, id(i))
    if (!d) throw new repos.ErrorValidacion(['La factura no existe.'])
    return d
  },
  guardarPdfFactura: async (i) => {
    const d = facturas.detalleFactura(db, id(i))
    if (!d) throw new repos.ErrorValidacion(['La factura no existe.'])
    const pdf = await generarPdf(d)
    const r = await dialog.showSaveDialog(ventana!, {
      title: 'Guardar factura', defaultPath: `Factura ${d.factura.numSerie}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, pdf)
    await shell.openPath(r.filePath)
    return r.filePath
  },
  xmlVerifactu: (i) => facturas.xmlEnvio(db, id(i)),
  anularFactura: (i) => facturas.anularFactura(db, id(i)),
  enviarVerifactu: () => {
    // Bloqueado a petición de Nacho: no se envía nada a la AEAT hasta que lo autorice.
    if (!ENVIO_HABILITADO) throw new repos.ErrorValidacion(['El envío a VERI*FACTU está desactivado mientras pruebas la aplicación.'])
    throw new repos.ErrorValidacion(['El envío a VERI*FACTU aún no está implementado.'])
  },
  abrirCarpetaDatos: async () => {
    await shell.openPath(carpetaDatos())
  }
}

async function limpiarArchivos(rutas: string[]) {
  for (const r of rutas) if (!repos.rutaEnUso(db, r)) await eliminarArchivo(r)
}

function registrarIpc() {
  for (const [nombre, fn] of Object.entries(handlers)) {
    ipcMain.handle(`gestoria:${nombre}`, async (_e, ...args): Promise<Resultado<unknown>> => {
      try {
        return { ok: true, datos: await fn(...args) }
      } catch (err) {
        if (err instanceof repos.ErrorValidacion) return { ok: false, errores: err.errores }
        console.error(err)
        return { ok: false, errores: ['Error inesperado: ' + (err instanceof Error ? err.message : String(err))] }
      }
    })
  }
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    title: 'Gestoría',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  // La app no navega fuera de su propia interfaz; los enlaces externos se abren en el navegador.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  ventana.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) void ventana.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void ventana.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  abrirBaseDeDatos()
  registrarIpc()
  crearVentana()
  try {
    avisarImpuestos()
  } catch (err) {
    console.error(err)
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => db?.close())
