import Database from 'better-sqlite3'
import { beforeEach, expect, it } from 'vitest'
import { perfilBase } from '../fixtures'
import { DATOS_RENTA_VACIOS } from '../renta/calculo'
import { guardarDatosRenta, leerDatosRenta, vistaRenta } from './renta'
import { crearGasto, crearIngreso, ErrorValidacion, guardarPerfil, registrarPresentacion } from './repos'
import { migrar } from './schema'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  migrar(db)
  guardarPerfil(db, perfilBase)
})

const ingreso = (fecha: string, base: number) => crearIngreso(db, {
  fecha, clienteId: null, actividadId: null, concepto: 'Servicios', base, tipoIva: 21, retencionPct: 0, operacion: 'nacional', notas: ''
})

it('reúne ingresos del año, bienes de años anteriores y pagos del 130', () => {
  ingreso('2025-04-01', 3000000)
  ingreso('2024-04-01', 999900)
  crearGasto(db, {
    fecha: '2024-01-01', proveedor: 'Tienda', nifProveedor: '', paisProveedor: 'ES', numeroFactura: '1', actividadId: null,
    concepto: 'Portátil', categoria: 'equipos', base: 100000, tipoIva: 21, deduciblePctIrpf: 100, deduciblePctIva: 100,
    retencionPct: 0, operacion: 'nacional', bienInversion: true, notas: ''
  })
  registrarPresentacion(db, { modelo: '130', ejercicio: 2025, periodo: '1T', fechaPresentacion: '2025-04-15', resultado: 'ingresar', importe: 50000, justificante: '', notas: '' })
  registrarPresentacion(db, { modelo: '303', ejercicio: 2025, periodo: '1T', fechaPresentacion: '2025-04-15', resultado: 'ingresar', importe: 70000, justificante: '', notas: '' })

  const v = vistaRenta(db, 2025)
  expect(v.estimacion.actividades[0]).toMatchObject({ ingresos: 3000000, amortizaciones: 26000 })
  expect(v.estimacion.pagos130).toBe(50000)
  expect(v.ejercicios).toEqual([2025, 2024])
})

it('guarda los datos del usuario por ejercicio y descarta campos desconocidos', () => {
  const v = guardarDatosRenta(db, 2025, { ...DATOS_RENTA_VACIOS, deducciones: 12300, extra: 'x' } as never)
  expect(v.estimacion.deducciones).toBe(0) // sin cuota no hay nada que deducir
  expect(leerDatosRenta(db, 2025)).toEqual({ ...DATOS_RENTA_VACIOS, deducciones: 12300 })
  guardarDatosRenta(db, 2025, { ...DATOS_RENTA_VACIOS, descendientes: [{ anioNacimiento: 2010, compartido: false, otro: 1 } as never] })
  expect(leerDatosRenta(db, 2025).descendientes).toEqual([{ anioNacimiento: 2010, compartido: false, discapacidad: 0, asistencia: false }])
  expect(leerDatosRenta(db, 2024)).toEqual(DATOS_RENTA_VACIOS)
  guardarDatosRenta(db, 2025, { ...DATOS_RENTA_VACIOS, deducciones: 100 })
  expect(leerDatosRenta(db, 2025).deducciones).toBe(100)
})

it('rechaza datos no válidos', () => {
  expect(() => guardarDatosRenta(db, 2025, { ...DATOS_RENTA_VACIOS, retencionesOtras: -5 })).toThrow(ErrorValidacion)
  expect(() => vistaRenta(db, 1800)).toThrow(ErrorValidacion)
})
