// Recurrentes en la base de datos y creación de los apuntes que van tocando.

import type BetterSqlite3 from 'better-sqlite3'
import { DIAS_VENCIMIENTO, sumarDias } from '../cobros'
import { FRECUENCIAS, fechasPendientes, type Recurrente, type RecurrenteNuevo } from '../recurrentes'
import { validarGasto, validarIngreso } from '../validacion'
import { crearGasto, crearIngreso, ErrorValidacion } from './repos'

type Db = BetterSqlite3.Database
type Fila = { id: number; tipo: 'ingreso' | 'gasto'; plantilla: string; frecuencia: Recurrente['frecuencia']; inicio: string; fin: string | null; ultima: string | null; activa: number }

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function aRecurrente(f: Fila): Recurrente {
  return { id: f.id, tipo: f.tipo, plantilla: JSON.parse(f.plantilla), frecuencia: f.frecuencia, inicio: f.inicio, fin: f.fin, ultima: f.ultima, activa: !!f.activa } as Recurrente
}

export function listarRecurrentes(db: Db): Recurrente[] {
  return (db.prepare('SELECT * FROM recurrentes ORDER BY tipo, id').all() as Fila[]).map(aRecurrente)
}

function validar(r: RecurrenteNuevo): string[] {
  const e: string[] = []
  if (r.tipo !== 'ingreso' && r.tipo !== 'gasto') e.push('Tipo no válido.')
  if (!(r.frecuencia in FRECUENCIAS)) e.push('Frecuencia no válida.')
  if (!FECHA.test(r.inicio)) e.push('La fecha de inicio no es válida.')
  if (r.fin != null && (!FECHA.test(r.fin) || r.fin < r.inicio)) e.push('La fecha de fin no es válida o es anterior al inicio.')
  if (r.ultima != null && !FECHA.test(r.ultima)) e.push('Fecha no válida.')
  if (e.length) return e
  // La plantilla tiene que poder guardarse tal cual.
  const conFecha = { ...r.plantilla, fecha: r.inicio }
  if (r.tipo === 'ingreso') {
    const { fechaVencimiento: _v, fechaCobro: _c, ...resto } = conFecha as Parameters<typeof validarIngreso>[0]
    e.push(...validarIngreso(resto))
  } else e.push(...validarGasto(conFecha as Parameters<typeof validarGasto>[0]))
  return e
}

/** Quita lo que no debe repetirse: el cobro, el vencimiento y el número de factura del proveedor. */
function limpiarPlantilla(r: RecurrenteNuevo): RecurrenteNuevo['plantilla'] {
  const p = { ...r.plantilla } as Record<string, unknown>
  delete p.fecha; delete p.fechaCobro; delete p.fechaVencimiento
  delete p.id; delete p.cuotaIva; delete p.cuotaRetencion; delete p.facturaId
  if (r.tipo === 'gasto') p.numeroFactura = ''
  return p as RecurrenteNuevo['plantilla']
}

export function crearRecurrente(db: Db, r: RecurrenteNuevo): Recurrente {
  const errores = validar(r)
  if (errores.length) throw new ErrorValidacion(errores)
  const plantilla = limpiarPlantilla(r)
  const res = db.prepare('INSERT INTO recurrentes (tipo, plantilla, frecuencia, inicio, fin, ultima, activa) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(r.tipo, JSON.stringify(plantilla), r.frecuencia, r.inicio, r.fin ?? null, r.ultima ?? null, r.activa ? 1 : 0)
  return aRecurrente(db.prepare('SELECT * FROM recurrentes WHERE id = ?').get(Number(res.lastInsertRowid)) as Fila)
}

/**
 * Cambia frecuencia, fin o si está activa. La plantilla y el inicio no se tocan (para eso, se borra y se crea otra).
 * Al reanudar uno en pausa, las fechas que pasaron mientras estaba en pausa se saltan.
 */
export function actualizarRecurrente(db: Db, id: number, c: Pick<Recurrente, 'frecuencia' | 'fin' | 'activa'>, hoy: string): Recurrente {
  const f = db.prepare('SELECT * FROM recurrentes WHERE id = ?').get(id) as Fila | undefined
  if (!f) throw new ErrorValidacion(['El recurrente no existe.'])
  const antes = aRecurrente(f)
  const nuevo = { ...antes, frecuencia: c.frecuencia, fin: c.fin || null, activa: !!c.activa }
  const errores = validar(nuevo)
  if (errores.length) throw new ErrorValidacion(errores)
  if (!antes.activa && nuevo.activa) nuevo.ultima = fechasPendientes({ ...nuevo, ultima: antes.ultima }, hoy).at(-1) ?? antes.ultima
  db.prepare('UPDATE recurrentes SET frecuencia = ?, fin = ?, activa = ?, ultima = ? WHERE id = ?').run(nuevo.frecuencia, nuevo.fin, nuevo.activa ? 1 : 0, nuevo.ultima, id)
  return nuevo
}

/** Borra el recurrente; los apuntes que ya creó se quedan. */
export function borrarRecurrente(db: Db, id: number): void {
  db.prepare('DELETE FROM recurrentes WHERE id = ?').run(id)
}

export interface ResultadoRecurrentes {
  ingresos: number
  gastos: number
  /** Recurrentes que no se han podido aplicar (por ejemplo, una actividad que ya no existe). */
  errores: string[]
}

/** Crea los apuntes que tocan hasta hoy. Cada recurrente va en su propia transacción: si uno falla, los demás siguen. */
export function generarRecurrentes(db: Db, hoy: string): ResultadoRecurrentes {
  const r: ResultadoRecurrentes = { ingresos: 0, gastos: 0, errores: [] }
  for (const rec of listarRecurrentes(db)) {
    const fechas = fechasPendientes(rec, hoy)
    if (!fechas.length) continue
    try {
      db.transaction(() => {
        for (const fecha of fechas) {
          if (rec.tipo === 'ingreso') crearIngreso(db, { ...rec.plantilla, fecha, fechaVencimiento: sumarDias(fecha, DIAS_VENCIMIENTO), fechaCobro: null })
          else crearGasto(db, { ...rec.plantilla, fecha })
        }
        db.prepare('UPDATE recurrentes SET ultima = ? WHERE id = ?').run(fechas[fechas.length - 1], rec.id)
      })()
      if (rec.tipo === 'ingreso') r.ingresos += fechas.length
      else r.gastos += fechas.length
    } catch (e) {
      // Si falla, no entra ninguno de este recurrente y se vuelve a intentar la próxima vez.
      r.errores.push(`${rec.plantilla.concepto}: ${e instanceof ErrorValidacion ? e.errores.join(' ') : String(e)}`)
    }
  }
  return r
}
