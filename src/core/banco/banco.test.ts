import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { aplicarBanco, vistaBanco } from '../db/banco'
import { crearCliente, crearGasto, crearIngreso, guardarPerfil, listarGastos, listarIngresos } from '../db/repos'
import { migrar } from '../db/schema'
import { perfilBase } from '../fixtures'
import { categoriaDeConcepto } from './conciliacion'
import { fechaBanco, importeBanco, leerCsvBanco, leerExtracto, leerNorma43 } from './lectura'

// Registro 22 de Norma 43: 80 posiciones.
const r22 = (fecha: string, dh: '1' | '2', cents: number, ref = '') =>
  ('22' + '    ' + '0001' + fecha + fecha + '02' + '000' + dh + String(cents).padStart(14, '0') + '0000000000' + '000000000000' + ref.padEnd(16)).padEnd(80)
const r23 = (texto: string) => ('2301' + texto.padEnd(76)).slice(0, 80)
const N43 = [
  '11' + '0049' + '1500' + '0012345678' + '260101' + '261231' + '2' + '00000000100000' + '978' + '3' + 'NACHO'.padEnd(26) + '   ',
  r22('261015', '2', 106000, 'F2026-0010'), r23('TRANSFERENCIA DE ACME SL'),
  r22('261016', '1', 29400), r23('SEGURIDAD SOCIAL REGIMEN ESPECIAL AUTONOMOS'),
  r22('261017', '1', 4840), r23('RECIBO MOVISTAR'),
  r22('261018', '1', 120000), r23('AGENCIA TRIBUTARIA MODELO 303'),
  r22('261019', '1', 1500), r23('BAR MANOLO'),
  '33' + ''.padEnd(78), '88' + ''.padEnd(78)
].join('\r\n')

describe('lectura de extractos', () => {
  it('Norma 43 con conceptos complementarios', () => {
    const m = leerNorma43(N43)
    expect(m).toHaveLength(5)
    expect(m[0]).toEqual({ fecha: '2026-10-15', importe: 106000, concepto: 'TRANSFERENCIA DE ACME SL · F2026-0010' })
    expect(m[1]).toMatchObject({ importe: -29400, concepto: 'SEGURIDAD SOCIAL REGIMEN ESPECIAL AUTONOMOS' })
    expect(leerExtracto(new TextEncoder().encode(N43))).toHaveLength(5)
  })

  it('CSV con líneas previas y formatos españoles', () => {
    const csv = 'Titular;Nacho\nCuenta;ES00\n\nFecha;Fecha valor;Concepto;Importe;Saldo\n15/10/2026;15/10/2026;"Transf, Acme";1.060,00;5.000,00\n16/10/2026;16/10/2026;Recibo TGSS;-294,00;4.706,00\n'
    expect(leerCsvBanco(csv)).toEqual([
      { fecha: '2026-10-15', importe: 106000, concepto: 'Transf, Acme' },
      { fecha: '2026-10-16', importe: -29400, concepto: 'Recibo TGSS' }
    ])
    expect(leerCsvBanco('Fecha,Descripción,Cargo,Abono\n2026-10-01,Comisión,3.00,\n2026-10-02,Cobro,,100.50\n')).toEqual([
      { fecha: '2026-10-01', importe: -300, concepto: 'Comisión' },
      { fecha: '2026-10-02', importe: 10050, concepto: 'Cobro' }
    ])
    expect(() => leerCsvBanco('a;b;c\n1;2;3')).toThrow(/columnas/)
    expect(importeBanco('-1.234,56 €')).toBe(-123456)
    expect(importeBanco('1234.5')).toBe(123450)
    expect(fechaBanco('5/3/26')).toBe('2026-03-05')
    expect(() => fechaBanco('31/02/2026')).toThrow()
  })

  it('categorías por concepto, y nunca impuestos ni traspasos', () => {
    expect(categoriaDeConcepto('RECIBO MOVISTAR')).toBe('telefono_internet')
    expect(categoriaDeConcepto('Seguridad Social autónomos')).toBe('cuota_autonomo')
    expect(categoriaDeConcepto('AGENCIA TRIBUTARIA MODELO 303')).toBeNull()
    expect(categoriaDeConcepto('BAR MANOLO')).toBeNull()
  })
})

describe('conciliación con la base de datos', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    migrar(db)
    guardarPerfil(db, perfilBase)
    const c = crearCliente(db, { tipo: 'empresa', nombre: 'Acme SL', nif: 'B12345674', pais: 'ES', domicilio: '', codigoPostal: '', municipio: '', provincia: '', email: '', notas: '' })
    // 1.000 + 21 % − 15 % = 1.060 a cobrar.
    crearIngreso(db, { fecha: '2026-10-01', clienteId: c.id, actividadId: null, concepto: 'Octubre', base: 100000, tipoIva: 21, retencionPct: 15, operacion: 'nacional', notas: '', fechaVencimiento: '2026-10-31' })
    crearGasto(db, { fecha: '2026-10-14', proveedor: 'Movistar', nifProveedor: '', paisProveedor: 'ES', numeroFactura: 'M1', actividadId: null, concepto: 'Fibra', categoria: 'telefono_internet', base: 4000, tipoIva: 21, deduciblePctIrpf: 50, deduciblePctIva: 50, retencionPct: 0, operacion: 'nacional', bienInversion: false, notas: '' })
  })

  it('propone cobro, gasto ya registrado, gasto nuevo e ignorar', () => {
    const v = vistaBanco(db, leerNorma43(N43))
    expect(v.propuestas.map((p) => p.accion.tipo)).toEqual(['cobro', 'crear_gasto', 'ya_registrado', 'ignorar', 'ignorar'])
    expect(v.propuestas[1]!.accion).toEqual({ tipo: 'crear_gasto', categoria: 'cuota_autonomo' })
  })

  it('aplica, crea el gasto con su base y no repite al volver a importar', () => {
    const v = vistaBanco(db, leerNorma43(N43))
    const r = aplicarBanco(db, v.propuestas.map((p) => ({ movimiento: p.movimiento, clave: p.clave, accion: p.accion })))
    expect(r).toEqual({ cobros: 1, gastosCreados: 1, ignorados: 3, repetidos: 0 })
    expect(listarIngresos(db, '2026-01-01', '2026-12-31')[0]!.fechaCobro).toBe('2026-10-15')
    const cuota = listarGastos(db, '2026-01-01', '2026-12-31').find((g) => g.categoria === 'cuota_autonomo')!
    expect(cuota).toMatchObject({ base: 29400, tipoIva: 0, fecha: '2026-10-16', deduciblePctIrpf: 100 })
    const otra = vistaBanco(db, leerNorma43(N43))
    expect(otra.propuestas.every((p) => p.repetido)).toBe(true)
    expect(aplicarBanco(db, v.propuestas.map((p) => ({ movimiento: p.movimiento, clave: p.clave, accion: p.accion }))).repetidos).toBe(5)
  })

  it('un gasto con IVA saca la base del total pagado', () => {
    const v = vistaBanco(db, [{ fecha: '2026-10-20', importe: -12100, concepto: 'GOOGLE WORKSPACE' }])
    aplicarBanco(db, v.propuestas.map((p) => ({ movimiento: p.movimiento, clave: p.clave, accion: p.accion })))
    expect(listarGastos(db, '2026-10-20', '2026-10-20')[0]).toMatchObject({ categoria: 'software', base: 10000, cuotaIva: 2100 })
  })

  it('no aplica nada si una decisión no es válida', () => {
    const v = vistaBanco(db, leerNorma43(N43))
    const d = v.propuestas.map((p) => ({ movimiento: p.movimiento, clave: p.clave, accion: p.accion }))
    d[4] = { ...d[4]!, accion: { tipo: 'cobro', ingresoId: 999 } }
    expect(() => aplicarBanco(db, d)).toThrow(/ingreso pendiente/)
    expect(listarIngresos(db, '2026-01-01', '2026-12-31')[0]!.fechaCobro).toBeNull()
  })
})
