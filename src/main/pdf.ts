import { BrowserWindow } from 'electron'
import QRCode from 'qrcode'
import type { DetalleFactura } from '../core/db/facturas'
import { htmlFactura } from '../core/plantillaFactura'

/** Renderiza la factura en una ventana oculta (sin JavaScript) y la imprime a PDF. */
export async function generarPdf(d: DetalleFactura): Promise<Buffer> {
  const qr = await QRCode.toDataURL(d.urlQr, { errorCorrectionLevel: 'M', margin: 0, width: 480 })
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false }
  })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlFactura(d, qr)))
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
  } finally {
    win.destroy()
  }
}
