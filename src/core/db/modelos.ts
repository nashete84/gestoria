import type BetterSqlite3 from 'better-sqlite3'
import type { Modelo, Periodo } from '../calendario'
import { calcular347, calcular349, type Resultado347, type Resultado349 } from '../modelos/declarativos'
import { fichero347, fichero349, type Fichero } from '../modelos/ficheros349y347'
import { calcular130 } from '../modelos/m130'
import { calcular303 } from '../modelos/m303'
import { calcular111, calcular115 } from '../modelos/retenciones'
import { AJUSTES_VACIOS, TRIMESTRES, type AjustesModelos, type ResultadoModelo } from '../modelos/tipos'
import type { Trimestre } from '../periodos'
import { calcularRenta } from '../renta/calculo'
import { leerDatosRenta } from './renta'
import { ErrorValidacion, leerPerfil, listarClientes, listarGastos, listarIngresos } from './repos'

type Db = BetterSqlite3.Database

export function leerAjustesModelos(db: Db, ejercicio: number): AjustesModelos {
  const f = db.prepare('SELECT datos FROM modelos_ajustes WHERE ejercicio = ?').get(ejercicio) as { datos: string } | undefined
  return f ? { ...AJUSTES_VACIOS, ...(JSON.parse(f.datos) as Partial<AjustesModelos>) } : { ...AJUSTES_VACIOS }
}

export function guardarAjustesModelos(db: Db, ejercicio: number, a: AjustesModelos): AjustesModelos {
  const e: string[] = []
  if (!Number.isInteger(ejercicio) || ejercicio < 2000 || ejercicio > 2100) e.push('Ejercicio no válido.')
  if (!Number.isInteger(a?.compensar303Inicial) || a.compensar303Inicial < 0) e.push('Las cuotas a compensar no son un importe válido.')
  if (typeof a?.devolucion303 !== 'boolean') e.push('Indica si pides la devolución del 303.')
  if (a?.rendimientoAnterior !== null && !Number.isInteger(a?.rendimientoAnterior)) e.push('El rendimiento del año anterior no es un importe válido.')
  if (e.length) throw new ErrorValidacion(e)
  const datos: AjustesModelos = { compensar303Inicial: a.compensar303Inicial, devolucion303: a.devolucion303, rendimientoAnterior: a.rendimientoAnterior }
  db.prepare('INSERT INTO modelos_ajustes (ejercicio, datos) VALUES (?, ?) ON CONFLICT(ejercicio) DO UPDATE SET datos = excluded.datos')
    .run(ejercicio, JSON.stringify(datos))
  return datos
}

/**
 * Rendimiento neto de actividades del año anterior para la casilla 13 del 130:
 * el ajuste manual si existe; si no, el calculado con los datos de la app; 0 si el alta es de este año.
 */
export function rendimientoAnterior(db: Db, ejercicio: number): { importe: number | null; origen: 'manual' | 'calculado' | 'sin_actividad' | 'desconocido' } {
  const manual = leerAjustesModelos(db, ejercicio).rendimientoAnterior
  if (manual !== null) return { importe: manual, origen: 'manual' }
  const perfil = leerPerfil(db)!
  const anterior = ejercicio - 1
  const ingresos = listarIngresos(db, `${anterior}-01-01`, `${anterior}-12-31`)
  if (ingresos.length) {
    const r = calcularRenta({ ejercicio: anterior, perfil, ingresos, gastos: listarGastos(db, '0000-01-01', `${anterior}-12-31`), pagos130: 0, datos: leerDatosRenta(db, anterior) })
    return { importe: r.rendimientoActividades, origen: 'calculado' }
  }
  if (Number(perfil.fechaAlta.slice(0, 4)) >= ejercicio) return { importe: 0, origen: 'sin_actividad' }
  return { importe: null, origen: 'desconocido' }
}

export function calcularModelo(db: Db, modelo: Modelo, ejercicio: number, periodo: Periodo): ResultadoModelo {
  const perfil = leerPerfil(db)
  if (!perfil) throw new ErrorValidacion(['Rellena primero tu perfil fiscal.'])
  if (!Number.isInteger(ejercicio)) throw new ErrorValidacion(['Ejercicio no válido.'])
  const t = (TRIMESTRES as readonly string[]).indexOf(periodo) + 1
  const trimestral = ['303', '130', '111', '115', '349'].includes(modelo)
  if (trimestral && !t) throw new ErrorValidacion([`El modelo ${modelo} es trimestral.`])
  const trimestre = t as Trimestre

  const desde = `${ejercicio}-01-01`
  const hasta = `${ejercicio}-12-31`
  const ingresos = listarIngresos(db, desde, hasta)
  const gastos = listarGastos(db, desde, hasta)
  const ajustes = leerAjustesModelos(db, ejercicio)

  switch (modelo) {
    case '303': return calcular303({ ejercicio, trimestre, ingresos, gastos, ajustes })
    case '130': {
      const anterior = rendimientoAnterior(db, ejercicio)
      const r = calcular130({
        perfil, ejercicio, trimestre, ingresos,
        gastos: listarGastos(db, '0000-01-01', hasta),
        rendimientoAnterior: anterior.importe,
        sinDificilJustificacion: leerDatosRenta(db, ejercicio).autonomoDependiente
      })
      if (anterior.origen === 'desconocido') r.avisos.push(`Indica en los ajustes de ${ejercicio} el rendimiento neto de ${ejercicio - 1}: no hay datos de ese año en la app.`)
      if (perfil.exento130) r.avisos.unshift('En tu perfil indicas que no estás obligado al 130.')
      return r
    }
    case '111': return calcular111(gastos, ejercicio, trimestre)
    case '115': return calcular115(gastos, ejercicio, trimestre)
    case '349': return calcular349(ingresos, gastos, listarClientes(db), ejercicio, trimestre)
    case '347': return calcular347(ingresos, gastos, listarClientes(db), ejercicio)
    default: throw new ErrorValidacion([`El cálculo del modelo ${modelo} aún no está disponible.`])
  }
}

/** Modelos para los que ya se genera el fichero con el diseño de registro oficial. */
export const MODELOS_CON_FICHERO: Modelo[] = ['349', '347']

export function ficheroModelo(db: Db, modelo: Modelo, ejercicio: number, periodo: Periodo): Fichero {
  const perfil = leerPerfil(db)!
  const r = calcularModelo(db, modelo, ejercicio, periodo)
  if (modelo === '349') return fichero349(perfil, r as Resultado349)
  if (modelo === '347') return fichero347(perfil, r as Resultado347)
  throw new ErrorValidacion([`El fichero del modelo ${modelo} aún no está disponible: falta su diseño de registro oficial.`])
}
