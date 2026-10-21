import Database from 'better-sqlite3'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join, resolve, sep } from 'node:path'
import type { ApiGestoria, Resultado } from '../core/api'
import * as repos from '../core/db/repos'
import { migrar } from '../core/db/schema'
import { copiarAdjunto, eliminarArchivo } from './adjuntos'

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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => db?.close())
