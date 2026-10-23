import type BetterSqlite3 from 'better-sqlite3'
import { plazoAnual, plazoTrimestral, type Modelo } from '../calendario'
import { GRUPO_DE, importePresentado, informeIngresosGastos, resumirImpuestos, type InformeImpuestos, type InformeIngresosGastos, type LineaImpuesto } from '../informes'
import { TRIMESTRES } from '../modelos/tipos'
import type { Trimestre } from '../periodos'
import { calcularModelo } from './modelos'
import { leerDatosRenta, vistaRenta } from './renta'
import { preverIngresos, type Prevision } from '../prevision'
import { simularIrpf, validarSimulacion, type EntradaSimulador, type ResultadoSimulador } from '../simulador'
import { ErrorValidacion, leerPerfil, listarClientes, listarGastos, listarIngresos, listarPresentaciones } from './repos'

type Db = BetterSqlite3.Database

function comprobar(db: Db, ejercicio: number) {
  if (!Number.isInteger(ejercicio) || ejercicio < 2000 || ejercicio > 2100) throw new ErrorValidacion(['Ejercicio no válido.'])
  if (!leerPerfil(db)) throw new ErrorValidacion(['Rellena primero tu perfil fiscal.'])
}

/** Con el año anterior hasta la misma fecha, para comparar lo comparable si el año está en curso. */
export function informeIngresosGastosDb(db: Db, ejercicio: number, hoy: string): InformeIngresosGastos {
  comprobar(db, ejercicio)
  const hasta = Number(hoy.slice(0, 4)) === ejercicio ? `${ejercicio - 1}${hoy.slice(4)}` : `${ejercicio - 1}-12-31`
  const anterior = { ingresos: listarIngresos(db, `${ejercicio - 1}-01-01`, hasta), gastos: listarGastos(db, `${ejercicio - 1}-01-01`, hasta) }
  return informeIngresosGastos(
    ejercicio,
    listarIngresos(db, `${ejercicio}-01-01`, `${ejercicio}-12-31`),
    listarGastos(db, `${ejercicio}-01-01`, `${ejercicio}-12-31`),
    listarClientes(db),
    anterior.ingresos.length || anterior.gastos.length ? anterior : null
  )
}

/**
 * Impuestos del ejercicio: lo presentado (con el importe que registraste) y lo que falta, calculado con tus datos.
 * Trimestres: hasta el actual si es el año en curso. La renta, con la estimación de la pestaña Renta.
 */
export function informeImpuestosDb(db: Db, ejercicio: number, hoy: string): InformeImpuestos {
  comprobar(db, ejercicio)
  const perfil = leerPerfil(db)!
  const anioHoy = Number(hoy.slice(0, 4))
  const trimestres = ejercicio < anioHoy ? 4 : ejercicio > anioHoy ? 0 : Math.ceil(Number(hoy.slice(5, 7)) / 3)
  const presentaciones = listarPresentaciones(db).filter((p) => p.ejercicio === ejercicio)
  const avisos: string[] = []
  const lineas: LineaImpuesto[] = []

  for (let t = 1; t <= trimestres; t++) {
    const periodo = TRIMESTRES[t - 1]!
    const modelos: Modelo[] = ['303', ...(perfil.exento130 ? [] : ['130' as const]), '111', '115']
    for (const modelo of modelos) {
      const p = presentaciones.find((x) => x.modelo === modelo && x.periodo === periodo)
      const plazo = plazoTrimestral(modelo, ejercicio, t as Trimestre).hasta
      if (p) {
        lineas.push({ modelo, periodo, grupo: GRUPO_DE[modelo]!, plazo, presentado: true, resultado: p.resultado, importe: importePresentado(p) })
        continue
      }
      const r = calcularModelo(db, modelo, ejercicio, periodo)
      // 111 y 115 solo cuentan en los trimestres con retenciones.
      if ((modelo === '111' || modelo === '115') && r.resultado === 0) continue
      lineas.push({ modelo, periodo, grupo: GRUPO_DE[modelo]!, plazo, presentado: false, resultado: r.tipo, importe: r.resultado })
    }
  }

  if (ejercicio <= anioHoy) {
    const p = presentaciones.find((x) => x.modelo === '100')
    const plazo = plazoAnual('100', ejercicio).hasta
    if (p) lineas.push({ modelo: '100', periodo: '0A', grupo: 'renta', plazo, presentado: true, resultado: p.resultado, importe: importePresentado(p) })
    else {
      const e = vistaRenta(db, ejercicio).estimacion
      lineas.push({ modelo: '100', periodo: '0A', grupo: 'renta', plazo, presentado: false, resultado: e.resultado > 0 ? 'ingresar' : e.resultado < 0 ? 'devolver' : 'cero', importe: e.resultado })
      if (ejercicio === anioHoy) avisos.push('La renta es una estimación con los datos que llevas este año: cambiará según lo que factures y gastes hasta diciembre.')
    }
  }

  const retenciones = listarIngresos(db, `${ejercicio}-01-01`, `${ejercicio}-12-31`).reduce((a, i) => a + i.cuotaRetencion, 0)
  return resumirImpuestos(ejercicio, lineas, retenciones, avisos)
}

const pagos130 = (db: Db, ejercicio: number) => listarPresentaciones(db)
  .filter((p) => p.modelo === '130' && p.ejercicio === ejercicio && p.resultado === 'ingresar')
  .reduce((a, p) => a + p.importe, 0)

/** Previsión de ingresos hasta fin de año y el IRPF que saldría. */
export function prevision(db: Db, ejercicio: number, hoy: string): Prevision {
  comprobar(db, ejercicio)
  const estimacion = vistaRenta(db, ejercicio).estimacion
  return preverIngresos({
    ejercicio, hoy,
    perfil: leerPerfil(db)!,
    datos: leerDatosRenta(db, ejercicio),
    ingresos: listarIngresos(db, `${ejercicio - 1}-01-01`, `${ejercicio}-12-31`),
    gastos: listarGastos(db, `${ejercicio - 1}-01-01`, `${ejercicio}-12-31`),
    gastosDeduciblesReales: estimacion.actividades.reduce((a, x) => a + x.gastos + x.amortizaciones, 0),
    pagos130: pagos130(db, ejercicio)
  })
}

/** Simulador de IRPF con importes elegidos por ti; usa tus otros datos de la pestaña Renta (hijos, otras rentas...). */
export function simulacionIrpf(db: Db, ejercicio: number, entrada: EntradaSimulador): ResultadoSimulador {
  comprobar(db, ejercicio)
  const errores = validarSimulacion(entrada)
  if (errores.length) throw new ErrorValidacion(errores)
  const e = { ingresos: entrada.ingresos, gastos: entrada.gastos, retenciones: entrada.retenciones, pagos130: entrada.pagos130 }
  return simularIrpf(ejercicio, leerPerfil(db)!, leerDatosRenta(db, ejercicio), e)
}

/**
 * Qué parte de los ingresos de la actividad del año llevó retención. Si es al menos el 70 %,
 * el año siguiente no hay que presentar el 130 (art. 109.1 del Reglamento del IRPF).
 */
export function ingresosConRetencion(db: Db, ejercicio: number): { total: number; conRetencion: number; pct: number | null } {
  if (!Number.isInteger(ejercicio) || ejercicio < 2000 || ejercicio > 2100) throw new ErrorValidacion(['Ejercicio no válido.'])
  const ingresos = listarIngresos(db, `${ejercicio}-01-01`, `${ejercicio}-12-31`)
  const total = ingresos.reduce((a, i) => a + i.base, 0)
  const conRetencion = ingresos.filter((i) => i.cuotaRetencion > 0).reduce((a, i) => a + i.base, 0)
  return { total, conRetencion, pct: total > 0 ? Math.round((conRetencion / total) * 1000) / 10 : null }
}
