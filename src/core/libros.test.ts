import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { librosRegistro } from './db/libros'
import { crearCliente, crearGasto, crearIngreso, guardarPerfil } from './db/repos'
import { migrar } from './db/schema'
import { perfilBase } from './fixtures'
import { leerZip } from './importacion/zip'
import { conceptoGasto, csvLibro } from './libros'
import { crc32 } from './zipEscritura'
import { escribirXlsx, serieExcel } from './xlsx'

describe('libros registro', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    migrar(db)
    guardarPerfil(db, perfilBase)
    const es = crearCliente(db, { tipo: 'empresa', nombre: 'Acme SL', nif: 'B12345674', pais: 'ES', domicilio: '', codigoPostal: '', municipio: '', provincia: '', email: '', notas: '' })
    const uk = crearCliente(db, { tipo: 'empresa', nombre: 'Foreign Ltd', nif: 'GB123', pais: 'GB', domicilio: '', codigoPostal: '', municipio: '', provincia: '', email: '', notas: '' })
    crearIngreso(db, { fecha: '2025-01-15', clienteId: es.id, actividadId: null, concepto: 'A', base: 720000, tipoIva: 21, retencionPct: 15, operacion: 'nacional', notas: '' })
    crearIngreso(db, { fecha: '2025-05-02', clienteId: uk.id, actividadId: null, concepto: 'B', base: 640000, tipoIva: 0, retencionPct: 0, operacion: 'no_sujeta', notas: '' })
    const g = { proveedor: 'Gestoría SL', nifProveedor: 'B12345674', paisProveedor: 'ES', actividadId: null, concepto: 'x', tipoIva: 21, deduciblePctIva: 100, retencionPct: 0, operacion: 'nacional' as const, bienInversion: false, notas: '' }
    crearGasto(db, { ...g, fecha: '2025-01-20', numeroFactura: 'G-77', categoria: 'profesionales', base: 27000, deduciblePctIrpf: 100 })
    crearGasto(db, { ...g, fecha: '2025-01-01', numeroFactura: '', proveedor: 'Casero', nifProveedor: '', categoria: 'alquiler_vivienda', base: 160000, tipoIva: 0, deduciblePctIva: 0, deduciblePctIrpf: 18, operacion: 'sin_iva' })
    crearGasto(db, { ...g, fecha: '2025-03-25', numeroFactura: 'MO1', categoria: 'equipos', base: 83712, deduciblePctIrpf: 100, bienInversion: true })
  })

  it('el libro de ingresos lleva las columnas y claves del formato de la AEAT', () => {
    const { hojas, nombre } = librosRegistro(db, 2025, 0)
    expect(nombre).toBe(`2025${perfilBase.nif}D${perfilBase.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, '_')}`)
    const [ing, gas] = hojas
    expect(ing!.nombre).toBe('INGRESOS')
    expect(ing!.filas).toHaveLength(3)
    expect(ing!.filas[1]).toEqual([2025, '1T', 'A', '05', '763', 'F1', 'I01', { importe: 7200 }, { fecha: '2025-01-15' }, { fecha: '2025-01-15' }, '', '', 'B12345674', 'Acme SL',
      '01', 'S1', '', { importe: 7632 }, { importe: 7200 }, 21, { importe: 1512 }, 0, { importe: 0 }, 15, { importe: 1080 }])
    expect(ing!.filas[2]!.slice(11, 16)).toEqual(['04', 'GB123', 'Foreign Ltd', '01', 'N2'])
    expect(gas!.filas.slice(1).map((f) => [f[5], f[6], f[7], f[8], f[21]])).toEqual([
      ['SF', 'G12', 'SF-1', { importe: 288 }, ''],
      ['F1', 'G19', 'F1-1', { importe: 270 }, ''],
      ['F1', 'G31', 'F1-2', { importe: 0 }, 'S']
    ])
  })

  it('por trimestre va del 1 de enero al final del trimestre', () => {
    expect(librosRegistro(db, 2025, 1).hojas[0]!.filas).toHaveLength(2)
    expect(librosRegistro(db, 2025, 1).nombre).toMatch(/_1T$/)
    expect(() => librosRegistro(db, 2025, 5)).toThrow()
  })

  it('CSV como el de Declarando', () => {
    const csv = csvLibro(librosRegistro(db, 2025, 0).hojas[0]!.filas)
    expect(csv.split('\r\n')[1]).toBe('2025,1T,A,05,763,F1,I01,"7.200,00",15-01-2025,15-01-2025,,,B12345674,Acme SL,01,S1,,"7.632,00","7.200,00",21,"1.512,00",0,"0,00",15,"1.080,00"')
  })

  it('el Excel es un ZIP válido con las dos hojas', () => {
    const archivos = leerZip(escribirXlsx(librosRegistro(db, 2025, 0).hojas))
    const libro = new TextDecoder().decode(archivos.find((a) => a.ruta === 'xl/workbook.xml')!.datos)
    expect(libro).toContain('name="INGRESOS"')
    expect(libro).toContain('name="GASTOS"')
    const hoja = new TextDecoder().decode(archivos.find((a) => a.ruta === 'xl/worksheets/sheet1.xml')!.datos)
    expect(hoja).toContain(`<v>${serieExcel('2025-01-15')}</v>`)
    expect(serieExcel('2025-01-15')).toBe(45672)
  })

  it('códigos de gasto y CRC', () => {
    expect(conceptoGasto({ categoria: 'cuota_autonomo', bienInversion: false, fecha: '2024-03-31' })).toBe('G06')
    expect(conceptoGasto({ categoria: 'cuota_autonomo', bienInversion: false, fecha: '2024-04-01' })).toBe('G45')
    expect(conceptoGasto({ categoria: 'inventada', bienInversion: false, fecha: '2025-01-01' })).toBe('G03')
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})
