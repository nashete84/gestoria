// Importación de extractos del banco: propuestas y aplicación en una sola transacción.

import type BetterSqlite3 from 'better-sqlite3'
import { proponer, type Accion, type Propuesta } from '../banco/conciliacion'
import type { Movimiento } from '../banco/lectura'
import { importeACobrar } from '../cobros'
import { deduciblesPara } from '../deducibles'
import { CATEGORIAS_GASTO } from '../fiscalidad'
import type { GastoNuevo } from '../tipos'
import { actualizarCobro, crearGasto, ErrorValidacion, ingresosPendientesDeCobro, leerPerfil, listarGastos } from './repos'

type Db = BetterSqlite3.Database

export interface VistaBanco {
  propuestas: Propuesta[]
  /** Ingresos pendientes y gastos mencionados en las propuestas, para mostrarlos. */
  ingresos: Record<number, { concepto: string; fecha: string; importe: number }>
  gastos: Record<number, { concepto: string; fecha: string }>
}

const sumarDias = (f: string, n: number) => new Date(Date.parse(f) + n * 86_400_000).toISOString().slice(0, 10)

export function vistaBanco(db: Db, movimientos: Movimiento[]): VistaBanco {
  const fechas = movimientos.map((m) => m.fecha).sort()
  const pendientes = ingresosPendientesDeCobro(db)
  const gastos = listarGastos(db, sumarDias(fechas[0]!, -15), sumarDias(fechas[fechas.length - 1]!, 15))
  const importados = new Set((db.prepare('SELECT clave FROM movimientos_banco').all() as { clave: string }[]).map((r) => r.clave))
  const propuestas = proponer(movimientos, { pendientes, gastos, importados })
  return {
    propuestas,
    ingresos: Object.fromEntries(pendientes.map((i) => [i.id, { concepto: i.concepto, fecha: i.fecha, importe: importeACobrar(i) }])),
    gastos: Object.fromEntries(gastos.map((g) => [g.id, { concepto: g.concepto, fecha: g.fecha }]))
  }
}

/** Gasto a partir de un cargo: el importe es lo pagado (base + IVA − retención), con los valores de la categoría. */
export function gastoDeCargo(db: Db, m: Movimiento, categoria: string): GastoNuevo {
  const perfil = leerPerfil(db)
  if (!perfil) throw new ErrorValidacion(['Rellena primero tu perfil fiscal.'])
  const cat = CATEGORIAS_GASTO.find((c) => c.id === categoria)
  if (!cat) throw new ErrorValidacion([`Categoría no válida: ${categoria}.`])
  const pagado = -m.importe
  const iva = cat.operacion === 'nacional' ? cat.tipoIva : 0
  const base = Math.round((pagado * 100) / (100 + iva - cat.retencionPct))
  const d = deduciblesPara(perfil, null, categoria)
  const concepto = m.concepto.slice(0, 120) || 'Movimiento del banco'
  return {
    fecha: m.fecha, proveedor: cat.retencionPct > 0 ? concepto.slice(0, 60) : '', nifProveedor: '', paisProveedor: 'ES', numeroFactura: '',
    actividadId: null, concepto, categoria, base, tipoIva: iva, deduciblePctIrpf: d.irpf, deduciblePctIva: d.iva,
    retencionPct: cat.retencionPct, operacion: cat.operacion, bienInversion: false, notas: 'Creado desde el extracto del banco: revisa base, IVA y proveedor con la factura.'
  }
}

export interface DecisionBanco { movimiento: Movimiento; clave: string; accion: Accion }
export interface ResultadoBanco { cobros: number; gastosCreados: number; ignorados: number; repetidos: number }

function validarMovimiento(m: Movimiento): void {
  if (!m || typeof m.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.fecha) || !Number.isInteger(m.importe) || typeof m.concepto !== 'string' || m.concepto.length > 1000) {
    throw new ErrorValidacion(['Movimiento del banco no válido.'])
  }
}

export function aplicarBanco(db: Db, decisiones: DecisionBanco[]): ResultadoBanco {
  if (!Array.isArray(decisiones)) throw new ErrorValidacion(['Datos no válidos.'])
  const r: ResultadoBanco = { cobros: 0, gastosCreados: 0, ignorados: 0, repetidos: 0 }
  const existe = db.prepare('SELECT 1 FROM movimientos_banco WHERE clave = ?')
  const guardar = db.prepare('INSERT INTO movimientos_banco (clave, fecha, importe, concepto, accion, ingreso_id, gasto_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
  db.transaction(() => {
    for (const { movimiento: m, clave, accion } of decisiones) {
      validarMovimiento(m)
      if (typeof clave !== 'string' || !clave) throw new ErrorValidacion(['Movimiento sin clave.'])
      if (existe.get(clave)) { r.repetidos++; continue }
      let ingresoId: number | null = null
      let gastoId: number | null = null
      if (accion?.tipo === 'cobro') {
        const ing = ingresosPendientesDeCobro(db).find((i) => i.id === accion.ingresoId)
        if (!ing || m.importe <= 0) throw new ErrorValidacion([`El cobro del ${m.fecha} ya no corresponde a un ingreso pendiente.`])
        actualizarCobro(db, ing.id, { fechaVencimiento: ing.fechaVencimiento, fechaCobro: m.fecha })
        ingresoId = ing.id
        r.cobros++
      } else if (accion?.tipo === 'crear_gasto') {
        if (m.importe >= 0) throw new ErrorValidacion([`El movimiento del ${m.fecha} es un abono, no un gasto.`])
        try {
          gastoId = crearGasto(db, gastoDeCargo(db, m, accion.categoria)).id
        } catch (e) {
          if (e instanceof ErrorValidacion) throw new ErrorValidacion(e.errores.map((x) => `${m.fecha} ${m.concepto}: ${x}`))
          throw e
        }
        r.gastosCreados++
      } else if (accion?.tipo === 'ya_registrado') {
        gastoId = Number.isInteger(accion.gastoId) ? accion.gastoId : null
        r.ignorados++
      } else if (accion?.tipo === 'ignorar') {
        r.ignorados++
      } else throw new ErrorValidacion(['Acción no válida.'])
      guardar.run(clave, m.fecha, m.importe, m.concepto, accion.tipo, ingresoId, gastoId)
    }
  })()
  return r
}
