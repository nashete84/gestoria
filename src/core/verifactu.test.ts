import { describe, expect, it } from 'vitest'
import {
  cadenaHuellaAlta, cadenaHuellaAnulacion, fechaHoraHuso, huellaAlta, importeXml, urlQr, xmlRegistroAlta,
  ENVIO_HABILITADO, type DatosAlta
} from './verifactu'

const alta: DatosAlta = {
  idEmisor: '12345678Z', nombreEmisor: 'Nacho & Co', numSerie: 'PRUEBA-2026-0001', fechaExpedicion: '2026-10-21',
  tipoFactura: 'F1', descripcion: 'Desarrollo <web>', destinatario: { nombre: 'Acme SL', nif: 'B12345674' },
  desglose: { calificacion: 'S1', tipoImpositivo: 21, base: 100000, cuota: 21000 },
  cuotaTotal: 21000, importeTotal: 121000, anterior: null, fechaHoraHuso: '2026-10-21T16:05:12+02:00',
  sistema: { nombreRazon: 'Nacho', nif: '12345678Z' }
}

it('el envío a la AEAT está desactivado', () => {
  expect(ENVIO_HABILITADO).toBe(false)
})

describe('formatos', () => {
  it('importes con dos decimales y punto', () => {
    expect(importeXml(121000)).toBe('1210.00')
    expect(importeXml(5)).toBe('0.05')
    expect(importeXml(-1250)).toBe('-12.50')
  })
  it('fecha y hora con huso', () => {
    expect(fechaHoraHuso(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
  })
})

describe('huella', () => {
  it('cadena de alta del primer registro', () => {
    expect(cadenaHuellaAlta(alta)).toBe(
      'IDEmisorFactura=12345678Z&NumSerieFactura=PRUEBA-2026-0001&FechaExpedicionFactura=21-10-2026&TipoFactura=F1' +
      '&CuotaTotal=210.00&ImporteTotal=1210.00&Huella=&FechaHoraHusoGenRegistro=2026-10-21T16:05:12+02:00'
    )
  })
  it('SHA-256 en hexadecimal mayúsculas y encadenada', () => {
    const h1 = huellaAlta(alta)
    expect(h1).toMatch(/^[0-9A-F]{64}$/)
    const siguiente = { ...alta, numSerie: 'PRUEBA-2026-0002', anterior: { idEmisor: '12345678Z', numSerie: 'PRUEBA-2026-0001', fechaExpedicion: '2026-10-21', huella: h1 } }
    expect(cadenaHuellaAlta(siguiente)).toContain(`&Huella=${h1}&`)
    expect(huellaAlta(siguiente)).not.toBe(h1)
  })
  it('cadena de anulación', () => {
    expect(cadenaHuellaAnulacion({
      idEmisor: '12345678Z', numSerie: 'PRUEBA-2026-0001', fechaExpedicion: '2026-10-21',
      anterior: { idEmisor: '12345678Z', numSerie: 'X', fechaExpedicion: '2026-10-21', huella: 'ABC' },
      fechaHoraHuso: '2026-10-21T17:00:00+02:00', sistema: alta.sistema
    })).toBe('IDEmisorFacturaAnulada=12345678Z&NumSerieFacturaAnulada=PRUEBA-2026-0001&FechaExpedicionFacturaAnulada=21-10-2026&Huella=ABC&FechaHoraHusoGenRegistro=2026-10-21T17:00:00+02:00')
  })
})

describe('XML', () => {
  it('escapa texto y marca el primer registro', () => {
    const xml = xmlRegistroAlta(alta, 'H')
    expect(xml).toContain('<sum1:NombreRazonEmisor>Nacho &amp; Co</sum1:NombreRazonEmisor>')
    expect(xml).toContain('Desarrollo &lt;web&gt;')
    expect(xml).toContain('<sum1:PrimerRegistro>S</sum1:PrimerRegistro>')
    expect(xml).toContain('<sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion><sum1:TipoImpositivo>21.00</sum1:TipoImpositivo>')
  })
  it('no sujeta: N2 sin tipo ni cuota, destinatario extranjero con IDOtro', () => {
    const xml = xmlRegistroAlta({
      ...alta, destinatario: { nombre: 'Berlin GmbH', codigoPais: 'DE', idType: '02', id: 'DE123456789' },
      desglose: { calificacion: 'N2', tipoImpositivo: 0, base: 100000, cuota: 0 }, cuotaTotal: 0, importeTotal: 100000
    }, 'H')
    expect(xml).toContain('<sum1:CalificacionOperacion>N2</sum1:CalificacionOperacion><sum1:BaseImponibleOimporteNoSujeto>1000.00')
    expect(xml).not.toContain('CuotaRepercutida')
    expect(xml).toContain('<sum1:IDOtro><sum1:CodigoPais>DE</sum1:CodigoPais><sum1:IDType>02</sum1:IDType><sum1:ID>DE123456789</sum1:ID></sum1:IDOtro>')
  })
})

it('URL del QR en el entorno de pruebas', () => {
  expect(urlQr('prueba', '12345678Z', 'PRUEBA-2026-0001', '2026-10-21', 121000))
    .toBe('https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=12345678Z&numserie=PRUEBA-2026-0001&fecha=21-10-2026&importe=1210.00')
})
