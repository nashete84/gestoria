import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { perfilBase } from '../fixtures'
import { htmlFactura } from '../plantillaFactura'
import { anularFactura, baseVigente, borradorFactura, detalleFactura, emitirFactura, rectificarFactura, verificarCadena, xmlEnvio } from './facturas'
import { borrarIngreso, crearCliente, crearIngreso, guardarPerfil, listarIngresos } from './repos'
import { migrar } from './schema'

let db: Database.Database
let clienteId: number
beforeEach(() => {
  db = new Database(':memory:')
  migrar(db)
  guardarPerfil(db, perfilBase)
  clienteId = crearCliente(db, { tipo: 'empresa', nombre: 'Acme SL', nif: 'B12345674', pais: 'ES', domicilio: 'C/ Uno', codigoPostal: '28001', municipio: 'Madrid', provincia: 'Madrid', email: '', notas: '' }).id
})

const nuevoIngreso = (fecha = '2026-10-01') => crearIngreso(db, {
  fecha, clienteId, actividadId: null, concepto: 'Desarrollo', base: 100000, tipoIva: 21, retencionPct: 15, operacion: 'nacional', notas: ''
}).id

describe('emitir', () => {
  it('numera en la serie de prueba y bloquea el ingreso', () => {
    const f1 = emitirFactura(db, nuevoIngreso(), '2026-10-21')
    const f2 = emitirFactura(db, nuevoIngreso('2026-10-02'), '2026-10-21')
    expect([f1.numSerie, f2.numSerie]).toEqual(['PRUEBA-2026-0001', 'PRUEBA-2026-0002'])
    expect(f1.entorno).toBe('prueba')
    expect(() => borrarIngreso(db, f1.ingresoId!)).toThrow(/factura/)
    expect(() => emitirFactura(db, f1.ingresoId!, '2026-10-21')).toThrow(/ya tiene factura/)
  })

  it('exige orden de fechas y no admite fechas futuras', () => {
    emitirFactura(db, nuevoIngreso('2026-10-10'), '2026-10-21')
    expect(() => emitirFactura(db, nuevoIngreso('2026-10-05'), '2026-10-21')).toThrow(/orden de fechas/)
    expect(() => emitirFactura(db, nuevoIngreso('2026-10-30'), '2026-10-21')).toThrow(/futura/)
  })

  it('exige cliente', () => {
    const id = crearIngreso(db, { fecha: '2026-10-01', clienteId: null, actividadId: null, concepto: 'x', base: 100, tipoIva: 21, retencionPct: 0, operacion: 'nacional', notas: '' }).id
    expect(() => emitirFactura(db, id, '2026-10-21')).toThrow(/cliente/)
  })
})

describe('anular y cadena', () => {
  it('encadena alta, alta y anulación; borra el ingreso pero conserva la factura', () => {
    const f1 = emitirFactura(db, nuevoIngreso(), '2026-10-21')
    emitirFactura(db, nuevoIngreso('2026-10-02'), '2026-10-21')
    const anulada = anularFactura(db, f1.id)
    expect(anulada.estado).toBe('anulada')
    expect(anulada.ingresoId).toBeNull()
    expect(listarIngresos(db, '2026-01-01', '2026-12-31')).toHaveLength(1)
    expect(verificarCadena(db, 'prueba')).toEqual({ ok: true, registros: 3 })
    expect(detalleFactura(db, f1.id)!.registros.map((r) => r.tipo)).toEqual(['alta', 'anulacion'])
    expect(() => anularFactura(db, f1.id)).toThrow(/ya está anulada/)
  })

  it('los registros no se pueden modificar ni borrar', () => {
    emitirFactura(db, nuevoIngreso(), '2026-10-21')
    expect(() => db.prepare("UPDATE registros_verifactu SET huella = 'X'").run()).toThrow(/no se pueden modificar/)
    expect(() => db.prepare('DELETE FROM registros_verifactu').run()).toThrow(/no se pueden borrar/)
  })
})

describe('salidas', () => {
  it('XML de envío y HTML de la factura', () => {
    const f = emitirFactura(db, nuevoIngreso(), '2026-10-21')
    const xml = xmlEnvio(db, f.id)
    expect(xml).toContain('<sum:RegFactuSistemaFacturacion>')
    expect(xml).toContain('<sum1:NumSerieFactura>PRUEBA-2026-0001</sum1:NumSerieFactura>')
    const d = detalleFactura(db, f.id)!
    expect(d.envioHabilitado).toBe(false)
    expect(d.urlQr).toContain('importe=1210.00')
    const html = htmlFactura(d, 'data:image/png;base64,AAAA')
    expect(html).toContain('QR tributario:')
    expect(html).toContain('VERI*FACTU')
    expect(html).toContain('PRUEBA')
    expect(html).toContain('Retención IRPF 15%')
    expect(html).toMatch(/Total a pagar<\/td><td class="num">1\.060,00/)
  })
})

describe('clientes extranjeros y vista previa', () => {
  it('factura a un cliente de fuera de la UE sin identificador fiscal', () => {
    const us = crearCliente(db, { tipo: 'particular', nombre: 'John Smith', nif: '', pais: 'US', domicilio: '', codigoPostal: '', municipio: '', provincia: '', email: '', notas: '' })
    const ingresoId = crearIngreso(db, { fecha: '2026-10-01', clienteId: us.id, actividadId: null, concepto: 'App', base: 50000, tipoIva: 0, retencionPct: 0, operacion: 'no_sujeta', notas: '' }).id
    const f = emitirFactura(db, ingresoId, '2026-10-21')
    const xml = xmlEnvio(db, f.id)
    expect(xml).not.toContain('Destinatarios')
    expect(htmlFactura(detalleFactura(db, f.id)!, '')).not.toContain('Tax ID')
  })

  it('un cliente español sin NIF no se puede facturar', () => {
    const es = crearCliente(db, { tipo: 'particular', nombre: 'Ana', nif: '', pais: 'ES', domicilio: '', codigoPostal: '', municipio: '', provincia: '', email: '', notas: '' })
    const ingresoId = crearIngreso(db, { fecha: '2026-10-01', clienteId: es.id, actividadId: null, concepto: 'x', base: 100, tipoIva: 21, retencionPct: 0, operacion: 'nacional', notas: '' }).id
    expect(() => emitirFactura(db, ingresoId, '2026-10-21')).toThrow(/NIF/)
  })

  it('la vista previa no guarda nada ni gasta número', () => {
    const ingresoId = nuevoIngreso()
    const b = borradorFactura(db, ingresoId, '2026-10-21')
    expect(b.factura.numSerie).toBe('PRUEBA-2026-0001')
    expect(b.borrador).toBe(true)
    const html = htmlFactura(b, '')
    expect(html).toContain('BORRADOR')
    expect(html).toContain('El QR se genera al emitir')
    expect(db.prepare('SELECT COUNT(*) n FROM facturas').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) n FROM registros_verifactu').get()).toEqual({ n: 0 })
    expect(emitirFactura(db, ingresoId, '2026-10-21').numSerie).toBe('PRUEBA-2026-0001')
  })
})

describe('rectificativas', () => {
  it('rebaja por diferencias en su serie, con ingreso negativo y registro R1 encadenado', () => {
    const f = emitirFactura(db, nuevoIngreso(), '2026-10-21')
    const r = rectificarFactura(db, f.id, { nuevaBase: 80000, motivo: 'Descuento acordado', tipo: 'R1' }, '2026-10-22')
    expect(r).toMatchObject({ numSerie: 'PRUEBA-R-2026-0001', tipo: 'R1', base: -20000, cuotaIva: -4200, cuotaRetencion: -3000, motivo: 'Descuento acordado' })
    expect(r.rectificada).toEqual({ id: f.id, numSerie: 'PRUEBA-2026-0001', fechaExpedicion: '2026-10-01' })
    expect(baseVigente(db, f.id)).toBe(80000)
    const ingresos = listarIngresos(db, '2026-01-01', '2026-12-31')
    expect(ingresos.reduce((a, i) => a + i.base, 0)).toBe(80000)
    expect(ingresos.find((i) => i.facturaId === r.id)).toMatchObject({ fecha: '2026-10-22', base: -20000 })
    const xml = xmlEnvio(db, r.id)
    expect(xml).toContain('<sum1:TipoFactura>R1</sum1:TipoFactura>')
    expect(xml).toContain('<sum1:TipoRectificativa>I</sum1:TipoRectificativa>')
    expect(xml).toContain('<sum1:NumSerieFactura>PRUEBA-2026-0001</sum1:NumSerieFactura>')
    expect(xml).toContain('<sum1:ImporteTotal>-242.00</sum1:ImporteTotal>')
    expect(verificarCadena(db, 'prueba').ok).toBe(true)
    expect(detalleFactura(db, r.id)!.envioHabilitado).toBe(false)
    expect(htmlFactura(detalleFactura(db, r.id)!, '')).toContain('Rectifica la factura <b>PRUEBA-2026-0001</b>')
  })

  it('anula entera con base 0 y valida', () => {
    const f = emitirFactura(db, nuevoIngreso(), '2026-10-21')
    expect(() => rectificarFactura(db, f.id, { nuevaBase: 100000, motivo: 'x', tipo: 'R4' }, '2026-10-22')).toThrow(/igual/)
    expect(() => rectificarFactura(db, f.id, { nuevaBase: 0, motivo: ' ', tipo: 'R4' }, '2026-10-22')).toThrow(/motivo/)
    expect(() => rectificarFactura(db, f.id, { nuevaBase: 0, motivo: 'x', tipo: 'R4' }, '2026-09-01')).toThrow(/anterior/)
    const r = rectificarFactura(db, f.id, { nuevaBase: 0, motivo: 'Servicio cancelado', tipo: 'R4' }, '2026-10-22')
    expect(r.base).toBe(-100000)
    expect(baseVigente(db, f.id)).toBe(0)
    expect(() => rectificarFactura(db, r.id, { nuevaBase: 0, motivo: 'x', tipo: 'R4' }, '2026-10-22')).toThrow(/original/)
    expect(() => anularFactura(db, f.id)).toThrow(/rectificativa PRUEBA-R-2026-0001/)
  })
})
