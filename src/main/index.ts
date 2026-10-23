import Database from 'better-sqlite3'
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, join, resolve, sep } from 'node:path'
import type { ApiGestoria, Resultado } from '../core/api'
import * as facturas from '../core/db/facturas'
import * as modelos from '../core/db/modelos'
import * as renta from '../core/db/renta'
import * as informes from '../core/db/informes'
import * as importacion from '../core/db/importacion'
import { analizarDeclarando, type PlanImportacion } from '../core/importacion/declarando'
import { guardarAdjuntoImportado, leerOrigenes, textoPdf } from './importar'
import * as repos from '../core/db/repos'
import { htmlFactura } from '../core/plantillaFactura'
import { resumirCobros } from '../core/cobros'
import { ENVIO_HABILITADO } from '../core/verifactu'
import { migrar } from '../core/db/schema'
import { copiarAdjunto, eliminarArchivo } from './adjuntos'
import { generarPdf } from './pdf'
import { MotorLocal } from './motorLocal'
import { responder, validarConversacion } from '../core/asistente/servicio'
import { CANAL_ASISTENTE } from '../core/api'

let db: Database.Database
let ventana: BrowserWindow | null = null

function carpetaDatos() {
  return app.getPath('userData')
}
let motor: MotorLocal | null = null
function asistente(): MotorLocal {
  motor ??= new MotorLocal(join(carpetaDatos(), 'modelos'), (estado) => ventana?.webContents.send(CANAL_ASISTENTE, { tipo: 'estado', estado }))
  return motor
}
/** Preguntas en curso, para poder cancelarlas. */
const preguntas = new Map<string, AbortController>()

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

/** Al abrir la app, avisa de las facturas con el cobro vencido. */
function avisarCobros() {
  if (!Notification.isSupported()) return
  const r = resumirCobros(repos.ingresosPendientesDeCobro(db), hoyLocal())
  if (!r.vencidos) return
  const importe = (r.importeVencido / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
  new Notification({ title: 'Cobros vencidos', body: `${r.vencidos} ingreso(s) sin cobrar con el plazo pasado (${importe}).` }).show()
}

type Handlers = { [K in keyof ApiGestoria]: (...args: any[]) => unknown }

const handlers: Handlers = {
  leerPerfil: () => repos.leerPerfil(db),
  guardarPerfil: (p) => repos.guardarPerfil(db, p),

  listarClientes: () => repos.listarClientes(db),
  crearCliente: (c) => repos.crearCliente(db, c),
  actualizarCliente: (i, c) => repos.actualizarCliente(db, id(i), c),
  borrarCliente: (i) => repos.borrarCliente(db, id(i)),

  listarIngresos: (d, h) => repos.listarIngresos(db, fechaValida(d), fechaValida(h)),
  crearIngreso: (n) => repos.crearIngreso(db, n),
  actualizarIngreso: (i, n) => repos.actualizarIngreso(db, id(i), n),
  actualizarCobro: (i, c) => {
    const fecha = (v: unknown) => (v === null || v === '' ? null : fechaValida(v))
    return repos.actualizarCobro(db, id(i), { fechaVencimiento: fecha(c?.fechaVencimiento), fechaCobro: fecha(c?.fechaCobro) })
  },
  pendientesDeCobro: () => repos.ingresosPendientesDeCobro(db),
  borrarIngreso: async (i) => {
    const adj = repos.listarAdjuntos(db, 'ingreso', id(i))
    repos.borrarIngreso(db, id(i))
    await limpiarArchivos(adj.map((a) => a.ruta))
  },

  listarGastos: (d, h) => repos.listarGastos(db, fechaValida(d), fechaValida(h)),
  crearGasto: (n) => repos.crearGasto(db, n),
  actualizarGasto: (i, n) => repos.actualizarGasto(db, id(i), n),
  borrarGasto: async (i) => {
    const adj = repos.listarAdjuntos(db, 'gasto', id(i))
    repos.borrarGasto(db, id(i))
    await limpiarArchivos(adj.map((a) => a.ruta))
  },

  listarAdjuntos: (e, i) => repos.listarAdjuntos(db, entidad(e), id(i)),
  adjuntar: async (e, i) => {
    const rutas = await dialogoJustificantes()
    const creados = []
    for (const origen of rutas) {
      const copia = await copiarAdjunto(origen, carpetaAdjuntos())
      creados.push(repos.registrarAdjunto(db, { entidad: entidad(e), entidadId: id(i), ...copia }))
    }
    return creados
  },
  elegirArchivos: async () => {
    const rutas = await dialogoJustificantes()
    return rutas.map((ruta) => {
      const ficha = randomUUID()
      elegidos.set(ficha, ruta)
      return { ficha, nombre: basename(ruta) }
    })
  },
  adjuntarElegidos: async (e, i, fichas) => {
    if (!Array.isArray(fichas)) throw new repos.ErrorValidacion(['Lista de archivos no válida.'])
    const creados = []
    for (const ficha of fichas) {
      // Solo se copian archivos que el usuario eligió en el diálogo; nunca rutas enviadas por la interfaz.
      const origen = elegidos.get(ficha)
      if (!origen) continue
      const copia = await copiarAdjunto(origen, carpetaAdjuntos())
      creados.push(repos.registrarAdjunto(db, { entidad: entidad(e), entidadId: id(i), ...copia }))
      elegidos.delete(ficha) // solo tras copiar: si falla, se puede reintentar
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

  resumen: (d, h) => repos.resumen(db, fechaValida(d), fechaValida(h)),
  calendarioFiscal: (hoy) => repos.calendarioFiscal(db, fechaValida(hoy)),
  registrarPresentacion: (p) => repos.registrarPresentacion(db, p),
  borrarPresentacion: (i) => repos.borrarPresentacion(db, id(i)),

  listarFacturas: (d, h) => facturas.listarFacturas(db, fechaValida(d), fechaValida(h)),
  emitirFactura: (i) => facturas.emitirFactura(db, id(i), hoyLocal()),
  detalleFactura: (i) => {
    const d = facturas.detalleFactura(db, id(i))
    if (!d) throw new repos.ErrorValidacion(['La factura no existe.'])
    return d
  },
  guardarPdfFactura: async (i) => {
    const d = facturas.detalleFactura(db, id(i))
    if (!d) throw new repos.ErrorValidacion(['La factura no existe.'])
    return guardarPdf(d, `Factura ${d.factura.numSerie}.pdf`)
  },
  vistaPreviaFactura: (i) => htmlFactura(facturas.borradorFactura(db, id(i), hoyLocal()), ''),
  guardarPdfBorrador: (i) => {
    const d = facturas.borradorFactura(db, id(i), hoyLocal())
    return guardarPdf(d, `Borrador factura ${d.factura.numSerie}.pdf`)
  },
  xmlVerifactu: (i) => facturas.xmlEnvio(db, id(i)),
  anularFactura: async (i) => {
    const ingresoId = facturas.leerFactura(db, id(i))?.ingresoId
    const adj = ingresoId ? repos.listarAdjuntos(db, 'ingreso', ingresoId) : []
    const f = facturas.anularFactura(db, id(i))
    await limpiarArchivos(adj.map((a) => a.ruta))
    return f
  },
  enviarVerifactu: () => {
    // Bloqueado a petición de Nacho: no se envía nada a la AEAT hasta que lo autorice.
    if (!ENVIO_HABILITADO) throw new repos.ErrorValidacion(['El envío a VERI*FACTU está desactivado mientras pruebas la aplicación.'])
    throw new repos.ErrorValidacion(['El envío a VERI*FACTU aún no está implementado.'])
  },
  estimacionRenta: (ej) => renta.vistaRenta(db, id(ej)),
  guardarDatosRenta: (ej, d) => renta.guardarDatosRenta(db, id(ej), d),
  calcularModelo: (m, ej, p) => modelos.calcularModelo(db, m, id(ej), p),
  guardarFicheroModelo: async (m, ej, p) => {
    const f = modelos.ficheroModelo(db, m, id(ej), p)
    const r = await dialog.showSaveDialog(ventana!, {
      title: `Guardar fichero del modelo ${m}`, defaultPath: f.nombre, filters: [{ name: 'Texto', extensions: ['txt'] }]
    })
    if (r.canceled || !r.filePath) return null
    // Los ficheros de la AEAT van en ISO-8859-1.
    await writeFile(r.filePath, Buffer.from(f.contenido, 'latin1'))
    return { ruta: r.filePath, avisos: f.avisos }
  },
  leerAjustesModelos: (ej) => modelos.leerAjustesModelos(db, id(ej)),
  guardarAjustesModelos: (ej, a) => modelos.guardarAjustesModelos(db, id(ej), a),
  abrirCarpetaDatos: async () => {
    await shell.openPath(carpetaDatos())
  },
  informeIngresosGastos: (ej, hoy) => informes.informeIngresosGastosDb(db, id(ej), fechaValida(hoy)),
  informeImpuestos: (ej, hoy) => informes.informeImpuestosDb(db, id(ej), fechaValida(hoy)),
  informePrevision: (ej, hoy) => informes.prevision(db, id(ej), fechaValida(hoy)),
  ingresosConRetencion: (ej) => informes.ingresosConRetencion(db, id(ej)),
  simularIrpf: (ej, entrada) => informes.simulacionIrpf(db, id(ej), entrada),
  estadoAsistente: async () => ({ estado: asistente().estado(), modelo: asistente().info }),
  descargarModeloAsistente: () => asistente().descargar(),
  cancelarDescargaAsistente: () => asistente().cancelarDescarga(),
  preguntarAsistente: async (idPregunta, pregunta, historial) => {
    if (typeof idPregunta !== 'string' || !idPregunta) throw new repos.ErrorValidacion(['Pregunta no válida.'])
    let datos
    try { datos = validarConversacion(pregunta, historial) } catch (e) { throw new repos.ErrorValidacion([(e as Error).message]) }
    const control = new AbortController()
    preguntas.set(idPregunta, control)
    try {
      return await responder(asistente(), datos.pregunta, datos.historial,
        (texto) => ventana?.webContents.send(CANAL_ASISTENTE, { tipo: 'trozo', id: idPregunta, texto }), control.signal)
    } finally {
      preguntas.delete(idPregunta)
    }
  },
  cancelarPreguntaAsistente: async (idPregunta) => {
    preguntas.get(String(idPregunta))?.abort()
  },

  analizarImportacion: async () => {
    const r = await dialog.showOpenDialog(ventana!, {
      title: 'Importar histórico de Declarando',
      message: 'Elige los ZIP que descargaste de Declarando (o las carpetas descomprimidas).',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [{ name: 'Exportación de Declarando', extensions: ['zip', 'csv', 'pdf', 'jpg', 'jpeg', 'png'] }]
    })
    if (r.canceled || !r.filePaths.length) return null
    let plan: PlanImportacion
    try {
      plan = analizarDeclarando(await leerOrigenes(r.filePaths), { extraerTexto: textoPdf })
    } catch (e) {
      throw new repos.ErrorValidacion([e instanceof Error ? e.message : String(e)])
    }
    importacionPendiente = plan
    return importacion.vistaImportacion(db, plan)
  },
  confirmarImportacion: async (opciones) => {
    const plan = importacionPendiente
    if (!plan) throw new repos.ErrorValidacion(['Vuelve a elegir los archivos para importar.'])
    const borrarAntes = opciones?.borrarAntes === true
    const paises: Record<string, string> = {}
    for (const [k, v] of Object.entries(opciones?.paises ?? {})) if (typeof v === 'string') paises[k] = v
    // Copia de seguridad antes de borrar nada: la base de datos completa, con fecha y hora.
    let copia: string | null = null
    if (borrarAntes) {
      const carpeta = join(carpetaDatos(), 'copias')
      await mkdir(carpeta, { recursive: true })
      copia = join(carpeta, `gestoria-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`)
      await db.backup(copia)
    }
    // Los archivos se guardan antes de la transacción (es asíncrono); si luego falla, solo quedan copias sin usar.
    const guardados = new Map<object, importacion.ArchivoGuardado>()
    for (const x of [...plan.ingresos, ...plan.gastos]) {
      if (x.adjunto) guardados.set(x.adjunto, await guardarAdjuntoImportado(x.adjunto.datos, x.adjunto.nombre, carpetaAdjuntos()))
    }
    const resultado = importacion.aplicarImportacion(db, plan, { borrarAntes, paises }, guardados)
    importacionPendiente = null
    return { ...resultado, copia }
  }
}

/** Plan de importación analizado, a la espera de que el usuario lo confirme. */
let importacionPendiente: PlanImportacion | null = null

/** Archivos elegidos en el diálogo a la espera de que se guarde el ingreso o gasto. */
const elegidos = new Map<string, string>()

async function dialogoJustificantes(): Promise<string[]> {
  const r = await dialog.showOpenDialog(ventana!, {
    title: 'Adjuntar factura o justificante',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Justificantes', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'heic', 'xml'] }]
  })
  return r.canceled ? [] : r.filePaths
}

async function guardarPdf(d: facturas.DetalleFactura, nombre: string): Promise<string | null> {
  const pdf = await generarPdf(d)
  const r = await dialog.showSaveDialog(ventana!, {
    title: 'Guardar factura', defaultPath: nombre, filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (r.canceled || !r.filePath) return null
  await writeFile(r.filePath, pdf)
  await shell.openPath(r.filePath)
  return r.filePath
}

async function limpiarArchivos(rutas: string[]) {
  for (const r of rutas) if (!repos.rutaEnUso(db, r)) await eliminarArchivo(r)
}

function registrarIpc() {
  for (const [nombre, fn] of Object.entries(handlers)) {
    ipcMain.handle(`gestoria:${nombre}`, async (e, ...args): Promise<Resultado<unknown>> => {
      try {
        // Solo responde a la ventana principal, no a iframes ni otras webContents.
        if (e.senderFrame !== ventana?.webContents.mainFrame) throw new repos.ErrorValidacion(['Origen no permitido.'])
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

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void ventana.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void ventana.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  abrirBaseDeDatos()
  registrarIpc()
  crearVentana()
  try {
    avisarImpuestos()
    avisarCobros()
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

app.on('will-quit', () => {
  db?.close()
  void motor?.cerrar()
})
