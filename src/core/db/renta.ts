import type BetterSqlite3 from 'better-sqlite3'
import { calcularRenta, DATOS_RENTA_VACIOS, validarDatosRenta, type DatosRenta, type EstimacionRenta } from '../renta/calculo'
import { ErrorValidacion, leerPerfil, listarGastos, listarIngresos, listarPresentaciones } from './repos'

type Db = BetterSqlite3.Database

export interface VistaRenta {
  datos: DatosRenta
  estimacion: EstimacionRenta
  /** Años con ingresos o gastos, para el selector. */
  ejercicios: number[]
}

function comprobarEjercicio(ejercicio: number) {
  if (!Number.isInteger(ejercicio) || ejercicio < 2000 || ejercicio > 2100) throw new ErrorValidacion(['Ejercicio no válido.'])
}

export function leerDatosRenta(db: Db, ejercicio: number): DatosRenta {
  const f = db.prepare('SELECT datos FROM renta_datos WHERE ejercicio = ?').get(ejercicio) as { datos: string } | undefined
  // Se completan con los valores vacíos por si en el futuro se añaden campos nuevos.
  return f ? { ...DATOS_RENTA_VACIOS, ...(JSON.parse(f.datos) as Partial<DatosRenta>) } : { ...DATOS_RENTA_VACIOS }
}

export function guardarDatosRenta(db: Db, ejercicio: number, entrada: DatosRenta): VistaRenta {
  comprobarEjercicio(ejercicio)
  // Solo se guardan los campos conocidos.
  const datos = Object.fromEntries(
    Object.keys(DATOS_RENTA_VACIOS).map((k) => [k, (entrada as unknown as Record<string, unknown>)?.[k]])
  ) as unknown as DatosRenta
  if (Array.isArray(datos.descendientes)) {
    datos.descendientes = datos.descendientes.map((h) => ({
      anioNacimiento: h?.anioNacimiento, compartido: h?.compartido, discapacidad: h?.discapacidad ?? 0, asistencia: h?.asistencia ?? false
    }))
  }
  const errores = validarDatosRenta(datos, ejercicio)
  if (errores.length) throw new ErrorValidacion(errores)
  db.prepare('INSERT INTO renta_datos (ejercicio, datos) VALUES (?, ?) ON CONFLICT(ejercicio) DO UPDATE SET datos = excluded.datos')
    .run(ejercicio, JSON.stringify(datos))
  return vistaRenta(db, ejercicio)
}

export function vistaRenta(db: Db, ejercicio: number): VistaRenta {
  comprobarEjercicio(ejercicio)
  const perfil = leerPerfil(db)
  if (!perfil) throw new ErrorValidacion(['Rellena primero tu perfil fiscal.'])
  const datos = leerDatosRenta(db, ejercicio)
  const pagos130 = listarPresentaciones(db)
    .filter((p) => p.modelo === '130' && p.ejercicio === ejercicio && p.resultado === 'ingresar')
    .reduce((a, p) => a + p.importe, 0)
  const estimacion = calcularRenta({
    ejercicio, perfil, datos, pagos130,
    ingresos: listarIngresos(db, `${ejercicio}-01-01`, `${ejercicio}-12-31`),
    // Desde el principio: los bienes de inversión de años anteriores se siguen amortizando.
    gastos: listarGastos(db, '0000-01-01', `${ejercicio}-12-31`)
  })
  const ejercicios = (db.prepare(`SELECT DISTINCT CAST(substr(fecha, 1, 4) AS INTEGER) a FROM ingresos
    UNION SELECT DISTINCT CAST(substr(fecha, 1, 4) AS INTEGER) FROM gastos ORDER BY 1 DESC`).all() as { a: number }[]).map((x) => x.a)
  return { datos, estimacion, ejercicios }
}
