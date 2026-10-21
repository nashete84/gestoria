// HTML de la factura para convertirla a PDF. Incluye los datos obligatorios (art. 6 RD 1619/2012)
// y el QR tributario de VERI*FACTU al principio, con su leyenda.

import type { DetalleFactura } from './db/facturas'
import { importeTotalVf, totalFactura } from './db/facturas'
import { ambitoDePais } from './fiscalidad'
import { formatearEuros } from './money'
import { escaparXml as e } from './verifactu'

const euros = (c: number) => e(formatearEuros(c))
const fecha = (iso: string) => iso.split('-').reverse().join('/')

function mencionIva(d: DetalleFactura): string {
  switch (d.factura.operacion) {
    case 'intracomunitaria': return 'Inversión del sujeto pasivo / Reverse charge (art. 196 Directiva 2006/112/CE). Operación no sujeta en España (art. 69.Uno.1º Ley 37/1992 del IVA).'
    case 'no_sujeta': return 'Operación no sujeta a IVA por reglas de localización (art. 69 Ley 37/1992 del IVA).'
    default: return ''
  }
}

export function htmlFactura(d: DetalleFactura, qrDataUrl: string): string {
  const f = d.factura
  const em = f.emisor
  const cl = f.cliente
  const prueba = f.entorno === 'prueba'
  const enviada = d.registros.some((r) => r.tipo === 'alta' && r.estadoEnvio !== 'pendiente')
  const extranjero = ambitoDePais(cl.pais) !== 'nacional'
  const mencion = mencionIva(d)

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Factura ${e(f.numSerie)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1d2330; margin: 0; }
  .cabecera { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .qr { text-align: center; font-size: 10.5pt; width: 40mm; }
  .qr img { width: 32mm; height: 32mm; margin: 2mm; display: block; }
  .qr-vacio { width: 32mm; height: 32mm; margin: 2mm; border: 1px dashed #9aa4b2; display: flex; align-items: center; justify-content: center; font-size: 8pt; color: #5f6b7a; padding: 4px; }
  h1 { font-size: 20pt; margin: 0 0 4px; text-align: right; }
  .meta { text-align: right; color: #5f6b7a; }
  .partes { display: flex; gap: 24px; margin: 22px 0; }
  .parte { flex: 1; border: 1px solid #dfe3e8; border-radius: 6px; padding: 10px 12px; }
  .parte b { display: block; font-size: 9pt; color: #5f6b7a; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px 6px; border-bottom: 1px solid #dfe3e8; text-align: left; }
  th { font-size: 9pt; color: #5f6b7a; }
  .num { text-align: right; white-space: nowrap; }
  .totales { margin-left: auto; width: 60%; margin-top: 12px; }
  .totales td { border: 0; padding: 4px 6px; }
  .totales tr.total td { border-top: 2px solid #1d2330; font-weight: 700; font-size: 12pt; padding-top: 8px; }
  .mencion { margin-top: 18px; font-size: 9.5pt; }
  .pago { margin-top: 18px; color: #5f6b7a; font-size: 9.5pt; }
  .marca { position: fixed; top: 45%; left: 0; right: 0; text-align: center; transform: rotate(-24deg);
    font-size: 44pt; font-weight: 800; color: rgba(194, 58, 58, .16); pointer-events: none; }
  .aviso { margin-top: 8px; font-size: 9pt; color: #c23a3a; }
  .anulada { color: #c23a3a; font-weight: 700; }
  @media screen { body { padding: 16px 20px; } }
</style></head>
<body>
  ${d.borrador ? '<div class="marca">BORRADOR · SIN EMITIR</div>' : prueba ? '<div class="marca">PRUEBA · NO ENVIADA A LA AEAT</div>' : ''}
  <div class="cabecera">
    <div class="qr">
      <div>QR tributario:</div>
      ${d.borrador ? '<div class="qr-vacio">El QR se genera al emitir</div>' : `<img src="${qrDataUrl}" alt="QR tributario">`}
      <div><b>VERI*FACTU</b></div>
    </div>
    <div>
      <h1>Factura</h1>
      <div class="meta">Nº <b>${e(f.numSerie)}</b>${d.borrador ? ' (provisional)' : ''}<br>Fecha de expedición: ${fecha(f.fechaExpedicion)}</div>
      ${f.estado === 'anulada' ? '<div class="meta anulada">ANULADA</div>' : ''}
      ${prueba ? '<div class="aviso">Factura de prueba sin validez fiscal.</div>' : ''}
      ${!prueba && !enviada && !d.borrador ? '<div class="aviso">Registro pendiente de envío a la AEAT.</div>' : ''}
    </div>
  </div>

  <div class="partes">
    <div class="parte"><b>Emisor</b>
      ${e(em.nombre)}<br>NIF: ${e(em.nif)}<br>${e(em.domicilio)}<br>${e(em.codigoPostal)} ${e(em.municipio)} (${e(em.provincia)})
      ${em.email ? `<br>${e(em.email)}` : ''}
    </div>
    <div class="parte"><b>Cliente</b>
      ${e(cl.nombre)}<br>${cl.nif ? `${extranjero ? 'Tax ID / NIF-IVA' : 'NIF'}: ${e(cl.nif)}<br>` : ''}${e(cl.domicilio)}<br>
      ${e(cl.codigoPostal)} ${e(cl.municipio)}${cl.provincia ? ` (${e(cl.provincia)})` : ''}${extranjero ? ` · ${e(cl.pais)}` : ''}
    </div>
  </div>

  <table>
    <thead><tr><th>Concepto</th><th class="num">Base imponible</th><th class="num">IVA</th><th class="num">Cuota IVA</th></tr></thead>
    <tbody><tr>
      <td>${e(f.concepto)}</td>
      <td class="num">${euros(f.base)}</td>
      <td class="num">${f.operacion === 'nacional' ? `${f.tipoIva}%` : '—'}</td>
      <td class="num">${euros(f.cuotaIva)}</td>
    </tr></tbody>
  </table>

  <table class="totales">
    <tr><td>Base imponible</td><td class="num">${euros(f.base)}</td></tr>
    <tr><td>IVA ${f.operacion === 'nacional' ? `${f.tipoIva}%` : '(no aplica)'}</td><td class="num">${euros(f.cuotaIva)}</td></tr>
    <tr><td>Total factura</td><td class="num">${euros(importeTotalVf(f))}</td></tr>
    ${f.cuotaRetencion ? `<tr><td>Retención IRPF ${f.retencionPct}%</td><td class="num">−${euros(f.cuotaRetencion)}</td></tr>` : ''}
    <tr class="total"><td>Total a pagar</td><td class="num">${euros(totalFactura(f))}</td></tr>
  </table>

  ${mencion ? `<p class="mencion">${e(mencion)}</p>` : ''}
  ${em.iban ? `<p class="pago">Forma de pago: transferencia bancaria a ${e(em.iban)}</p>` : ''}
</body></html>`
}
