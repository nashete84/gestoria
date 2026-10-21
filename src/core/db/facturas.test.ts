import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { perfilBase } from '../fixtures'
import { htmlFactura } from '../plantillaFactura'
import { anularFactura, detalleFactura, emitirFactura, verificarCadena, xmlEnvio } from './facturas'
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
  fecha, clienteId, concepto: 'Desarrollo', base: 100000, tipoIva: 21, retencionPct: 15, operacion: 'nacional', notas: ''
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
    const id = crearIngreso(db, { fecha: '2026-10-01', clienteId: null, concepto: 'x', base: 100, tipoIva: 21, retencionPct: 0, operacion: 'nacional', notas: '' }).id
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
