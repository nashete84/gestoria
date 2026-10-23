import Database from 'better-sqlite3'
import { deflateRawSync } from 'node:zlib'
import { beforeEach, describe, expect, it } from 'vitest'
import { aplicarImportacion, vistaImportacion } from '../db/importacion'
import { crearGasto, guardarPerfil, listarClientes, listarGastos, listarIngresos } from '../db/repos'
import { migrar } from '../db/schema'
import { perfilBase } from '../fixtures'
import { analizarDeclarando, categoriaDeTipo, fechaEs, importeEs, leerCsv, paisDeNif } from './declarando'
import { leerZip, type ArchivoImportado } from './zip'

const txt = (ruta: string, texto: string): ArchivoImportado => ({ ruta, datos: new TextEncoder().encode(texto) })

const CAB_ING = 'Ejercicio,Periodo,"Código de actividad","Tipo de actividad",IAE,"Tipo de factura","Concepto Ingreso","Ingreso computable","Fecha expedición","Fecha operación","Número de la factura","Tipo CIF del cliente","CIF del cliente","Nombre del cliente","Clave operación","Calificacion operación","Operación exenta","Total de la factura","Base imponible","Tipo de IVA","Cuota repercutida","Tipo de recargo","Cuota recargo","Tipo IRPF","Cuota IRPF"'
const CAB_GAS = 'Ejercicio,Periodo,"Código de actividad","Tipo de actividad",IAE,"Tipo de factura","Concepto del Gasto","Número de recepción","Gasto deducible","Número de la factura","Fecha de recepción","NIF del proveedor","Nombre del proveedor","Clave de la operación","Base imponible","Tipo de IVA (%)","Cuota soportada","Cuota deducible","Tipo de recargo","Importe del recargo","Total factura","Bien de inversión"'

const archivos = (): ArchivoImportado[] => [
  txt('libros/libro_ingresos_2025.csv', [CAB_ING,
    '2025,1T,A,05,763,F1,01,"1.000,00",15-01-2025,15-01-2025,F2025-0001,,B12345674,"Cliente Español SL",01,S1,,"1.060,00","1.000,00","21,00","210,00","0,00","0,00","15,00","150,00"',
    '2025,1T,A,05,763,F1,01,"2.000,00",10-02-2025,10-02-2025,F2025-0002,,,"Foreign Ltd",01,N2,,"2.000,00","2.000,00","0,00","0,00","0,00","0,00","0,00","0,00"'
  ].join('\n')),
  txt('libros/libro_gastos_2025.csv', [CAB_GAS,
    '2025,1T,A,05,763,SF,G03,SF-1,"180,00",,01-01-2025,,"Casero",,"1.000,00","0,00","0,00","0,00","0,00","0,00","1.000,00",',
    '2025,1T,A,05,763,F1,G03,F1-1,"100,00",G-77,20-01-2025,B12345674,"Gestoría SL",,"100,00","21,00","21,00","21,00","0,00","0,00","121,00",',
    '2025,1T,A,05,763,SF,G45,SF-2,"300,00",,31-01-2025,,"Seguridad Social",,"300,00","0,00","0,00","0,00","0,00","0,00","300,00",'
  ].join('\r\n')),
  txt('listado-gastos/2025/gastos_con_factura_2025.csv', 'Nº,Fecha,Tipo,Subtipo,Base,"% IVA",IVA,"Recargo equivalencia","% DED",IRPF,Prorrata,Total,Proveedor,CIF\nG-77,20-01-2025,"servicios gestoría",,"100,00",21,"21,00","0,00",100,"0,00",100,"121,00","Gestoría SL",B12345674'),
  txt('listado-gastos/2025/gastos_con_otro_comprobante_2025.csv', 'Factura,Fecha,Importe,"% DED",Proveedor,Tipo,Subtipo\n,01-01-2025,"1.000,00",18,"Casero","Alquiler Vivienda Habitual",\n,31-01-2025,"300,00",100,"Seguridad Social","Cuota Seguridad Social",'),
  { ruta: 'facturas-ingresos/2025/F2025-0001.pdf', datos: new TextEncoder().encode('%PDF factura 1') },
  { ruta: 'archivos-gastos/con_factura/factura_gasto_con_1_99.pdf', datos: new TextEncoder().encode('%PDF ... Nº factura G-77 ...') },
  { ruta: 'archivos-gastos/con_factura/factura_gasto_con_1_98.jpg', datos: new Uint8Array([1, 2, 3]) }
]

describe('formatos de Declarando', () => {
  it('lee CSV con comillas, importes y fechas en formato español', () => {
    expect(leerCsv('a,"b,c","d ""e"""\r\n1,2,3\n')).toEqual([['a', 'b,c', 'd "e"'], ['1', '2', '3']])
    expect(importeEs('1.234,56')).toBe(123456)
    expect(importeEs('7,5')).toBe(750)
    expect(importeEs('')).toBe(0)
    expect(() => importeEs('1,234.56')).toThrow()
    expect(fechaEs('30-11-2023')).toBe('2023-11-30')
    expect(paisDeNif('B12345674')).toBe('ES')
    expect(paisDeNif('LU20260743')).toBe('LU')
    expect(paisDeNif('443455050120')).toBe('')
  })

  it('traduce los tipos de gasto a categorías de la app', () => {
    expect(categoriaDeTipo('Cuota Seguridad Social', '')).toBe('cuota_autonomo')
    expect(categoriaDeTipo('Alquiler Vivienda Habitual', '')).toBe('alquiler_vivienda')
    expect(categoriaDeTipo('teléfono móvil', 'Ktuin')).toBe('equipos')
    expect(categoriaDeTipo('otros', 'Declarando Asesores 3.0 SL')).toBe('profesionales')
    expect(categoriaDeTipo('mobiliario oficina', '')).toBe('mobiliario')
    expect(categoriaDeTipo('cosas', 'Proveedor')).toBe('otros')
  })

  it('lee ZIP comprimidos', () => {
    // ZIP mínimo con un archivo "deflate", construido a mano.
    const nombre = Buffer.from('a/b.csv')
    const contenido = Buffer.from('hola,mundo\n')
    const comp = deflateRawSync(contenido)
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8)
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(contenido.length, 22); local.writeUInt16LE(nombre.length, 26)
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10)
    central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(contenido.length, 24); central.writeUInt16LE(nombre.length, 28); central.writeUInt32LE(0, 42)
    const inicioCentral = 30 + nombre.length + comp.length
    const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10)
    fin.writeUInt32LE(46 + nombre.length, 12); fin.writeUInt32LE(inicioCentral, 16)
    const zip = Buffer.concat([local, nombre, comp, central, nombre, fin])
    const [a] = leerZip(new Uint8Array(zip))
    expect(a!.ruta).toBe('a/b.csv')
    expect(Buffer.from(a!.datos).toString()).toBe('hola,mundo\n')
    expect(() => leerZip(new Uint8Array([1, 2, 3]))).toThrow(/ZIP/)
  })
})

describe('importación', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    migrar(db)
    guardarPerfil(db, perfilBase)
  })
  const plan = () => analizarDeclarando(archivos(), { extraerTexto: (d) => new TextDecoder().decode(d) })
  const todo = () => ({ ing: listarIngresos(db, '2000-01-01', '2100-12-31'), gas: listarGastos(db, '2000-01-01', '2100-12-31') })
  const guardados = (p: ReturnType<typeof plan>) => {
    const m = new Map<object, { nombre: string; ruta: string; sha256: string }>()
    for (const x of [...p.ingresos, ...p.gastos]) if (x.adjunto) m.set(x.adjunto, { nombre: x.adjunto.nombre, ruta: `/adj/${x.adjunto.nombre}`, sha256: 'x' })
    return m
  }

  it('analiza libros, listados y archivos', () => {
    const p = plan()
    expect(p.resumen).toEqual([{ anio: 2025, ingresos: 2, baseIngresos: 300000, gastos: 3, baseGastos: 140000 }])
    expect(p.ingresos[0]!.adjunto?.nombre).toBe('F2025-0001.pdf')
    expect(p.avisos.join(' ')).toMatch(/PDF de la factura F2025-0002/)
    const [alquiler, gestoria, ss] = p.gastos
    expect(alquiler!.datos).toMatchObject({ categoria: 'alquiler_vivienda', deduciblePctIrpf: 18, operacion: 'sin_iva', tipoIva: 0 })
    expect(gestoria!.datos).toMatchObject({ categoria: 'profesionales', tipoIva: 21, deduciblePctIva: 100, numeroFactura: 'G-77' })
    expect(gestoria!.adjunto?.nombre).toBe('factura_gasto_con_1_99.pdf')
    expect(ss!.datos.categoria).toBe('cuota_autonomo')
    expect(p.sinAsignar.map((s) => s.nombre)).toEqual(['factura_gasto_con_1_98.jpg'])
    expect(vistaImportacion(db, p).clientesNuevos.map((c) => [c.nombre, c.paisSugerido])).toEqual([['Cliente Español SL', 'ES'], ['Foreign Ltd', '']])
  })

  it('pide el país de los clientes que no lo tienen', () => {
    expect(() => aplicarImportacion(db, plan(), { borrarAntes: false, paises: {} }, new Map())).toThrow(/país del cliente Foreign Ltd/)
    expect(todo().ing).toEqual([]) // no se importa nada a medias
  })

  it('borra antes lo que había, importa con la operación correcta y no duplica si se repite', () => {
    crearGasto(db, { fecha: '2026-06-01', proveedor: 'Viejo', nifProveedor: '', paisProveedor: 'ES', numeroFactura: '', actividadId: null, concepto: 'Prueba', categoria: 'otros', base: 100, tipoIva: 21, deduciblePctIrpf: 100, deduciblePctIva: 100, retencionPct: 0, operacion: 'nacional', bienInversion: false, notas: '' })
    const p = plan()
    const r = aplicarImportacion(db, p, { borrarAntes: true, paises: { 'FOREIGN LTD': 'GB' } }, guardados(p))
    expect(r).toMatchObject({ borrados: { ingresos: 0, gastos: 1 }, clientesNuevos: 2, ingresos: 2, gastos: 3, omitidos: 0, adjuntos: 2 })
    const { ing, gas } = todo()
    expect(gas.some((g) => g.proveedor === 'Viejo')).toBe(false)
    const porNumero = (n: string) => ing.find((i) => i.concepto === `Factura ${n}`)!
    expect(porNumero('F2025-0001')).toMatchObject({ operacion: 'nacional', cuotaIva: 21000, cuotaRetencion: 15000 })
    expect(porNumero('F2025-0002')).toMatchObject({ operacion: 'no_sujeta', cuotaIva: 0, cuotaRetencion: 0 })
    expect(listarClientes(db).find((c) => c.nombre === 'Foreign Ltd')!.pais).toBe('GB')

    const otra = aplicarImportacion(db, plan(), { borrarAntes: false, paises: {} }, new Map())
    expect(otra).toMatchObject({ ingresos: 0, gastos: 0, omitidos: 5, clientesNuevos: 0 })
  })

  it('no importa si el histórico tiene un epígrafe que no está en el perfil', () => {
    const otro = archivos().map((a) => a.ruta.endsWith('libro_gastos_2025.csv') ? txt(a.ruta, new TextDecoder().decode(a.datos).replace(/,763,/g, ',844,')) : a)
    const p = analizarDeclarando(otro)
    expect(() => aplicarImportacion(db, p, { borrarAntes: true, paises: { 'FOREIGN LTD': 'GB' } }, new Map())).toThrow(/844/)
  })
})
