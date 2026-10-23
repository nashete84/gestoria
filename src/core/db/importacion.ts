// Aplica un plan de importación (ver core/importacion) a la base de datos, en una sola transacción.

import type BetterSqlite3 from 'better-sqlite3'
import { operacionIngreso, type PlanImportacion } from '../importacion/declarando'
import { normalizarNif } from '../nif'
import type { Adjunto } from '../tipos'
import { crearCliente, crearGasto, crearIngreso, ErrorValidacion, leerPerfil, listarClientes, registrarAdjunto } from './repos'

type Db = BetterSqlite3.Database

export interface OpcionesImportacion {
  /** Borra antes todos los ingresos y gastos (y sus adjuntos en la base de datos). Las facturas emitidas y sus registros VERI*FACTU se conservan. */
  borrarAntes: boolean
  /** País elegido por el usuario para cada cliente nuevo, por su clave. */
  paises: Record<string, string>
}

/** Archivo ya copiado a la carpeta de adjuntos. */
export type ArchivoGuardado = Pick<Adjunto, 'nombre' | 'ruta' | 'sha256'>

export interface ResultadoImportacion {
  borrados: { ingresos: number; gastos: number }
  clientesNuevos: number
  ingresos: number
  gastos: number
  omitidos: number
  adjuntos: number
}

/** Clientes del plan que no existen todavía (por NIF o por nombre). */
export function clientesNuevos(db: Db, plan: PlanImportacion) {
  const existentes = listarClientes(db)
  return plan.clientes.filter((c) => !buscarCliente(existentes, c.datos.nif, c.datos.nombre))
}

function buscarCliente(clientes: { id: number; nif: string; nombre: string }[], nif: string, nombre: string) {
  const n = normalizarNif(nif)
  return clientes.find((c) => (n && normalizarNif(c.nif) === n) || (!n && c.nombre.trim().toUpperCase() === nombre.trim().toUpperCase()))
}

/**
 * Importa ingresos, gastos y clientes. `guardados` trae, por objeto del plan, su archivo ya copiado al disco
 * (se copian antes, fuera de la transacción). Si algo falla no se importa nada, ni se borra nada.
 */
export function aplicarImportacion(
  db: Db, plan: PlanImportacion, opciones: OpcionesImportacion, guardados: Map<object, ArchivoGuardado>
): ResultadoImportacion {
  const perfil = leerPerfil(db)
  if (!perfil) throw new ErrorValidacion(['Rellena primero tu perfil fiscal.'])
  // Actividad por epígrafe: la del perfil con ese código, o la principal (sin fijar ningún epígrafe concreto).
  const actividad = (iae: string) => {
    const a = perfil.actividades.find((x) => x.codigo.trim() === iae.trim())
    return a && !a.principal ? a.id : null
  }
  const epigrafesDesconocidos = new Set([...plan.ingresos, ...plan.gastos].map((x) => x.iae).filter((c) => c && !perfil.actividades.some((a) => a.codigo.trim() === c.trim())))
  if (epigrafesDesconocidos.size) {
    throw new ErrorValidacion([`El histórico tiene el epígrafe ${[...epigrafesDesconocidos].join(', ')}, que no está en tu perfil. Añádelo en Mi perfil antes de importar.`])
  }

  return db.transaction((): ResultadoImportacion => {
    const borrados = { ingresos: 0, gastos: 0 }
    if (opciones.borrarAntes) {
      db.prepare("DELETE FROM adjuntos WHERE entidad IN ('ingreso', 'gasto')").run()
      borrados.ingresos = db.prepare('DELETE FROM ingresos').run().changes
      borrados.gastos = db.prepare('DELETE FROM gastos').run().changes
    }

    // Clientes: se reutilizan los existentes; los nuevos necesitan país.
    const clientes = listarClientes(db)
    const idCliente = new Map<string, number>()
    let clientesCreados = 0
    for (const c of plan.clientes) {
      const existente = buscarCliente(clientes, c.datos.nif, c.datos.nombre)
      if (existente) { idCliente.set(c.clave, existente.id); continue }
      const pais = (opciones.paises[c.clave] || c.paisSugerido || '').toUpperCase()
      if (!/^[A-Z]{2}$/.test(pais)) throw new ErrorValidacion([`Elige el país del cliente ${c.datos.nombre}.`])
      try {
        const nuevo = crearCliente(db, { ...c.datos, pais })
        clientes.push(nuevo)
        idCliente.set(c.clave, nuevo.id)
        clientesCreados++
      } catch (e) {
        if (e instanceof ErrorValidacion) throw new ErrorValidacion(e.errores.map((m) => `${c.datos.nombre}: ${m}`))
        throw e
      }
    }
    const paisCliente = (clave: string | null) => clientes.find((c) => c.id === idCliente.get(clave ?? ''))?.pais ?? ''

    // Para no duplicar si se importa dos veces sin borrar: misma fecha, base y cliente/proveedor.
    const existeIngreso = db.prepare('SELECT 1 FROM ingresos WHERE fecha = ? AND base = ? AND cliente_id IS ? LIMIT 1')
    const existeGasto = db.prepare('SELECT 1 FROM gastos WHERE fecha = ? AND base = ? AND proveedor = ? LIMIT 1')
    let omitidos = 0
    let adjuntos = 0
    const adjuntar = (entidad: Adjunto['entidad'], entidadId: number, objeto: object | null) => {
      const g = objeto ? guardados.get(objeto) : undefined
      if (!g) return
      registrarAdjunto(db, { entidad, entidadId, ...g })
      adjuntos++
    }

    let nIngresos = 0
    for (const i of plan.ingresos) {
      const clienteId = i.cliente ? idCliente.get(i.cliente) ?? null : null
      if (existeIngreso.get(i.datos.fecha, i.datos.base, clienteId)) { omitidos++; continue }
      const operacion = operacionIngreso(i.calificacion, i.datos.tipoIva, paisCliente(i.cliente))
      try {
        const nuevo = crearIngreso(db, {
          ...i.datos, clienteId, actividadId: actividad(i.iae), operacion,
          fechaCobro: i.datos.fecha, // el histórico se da por cobrado
          tipoIva: operacion === 'nacional' ? i.datos.tipoIva : 0,
          retencionPct: operacion === 'nacional' ? i.datos.retencionPct : 0
        })
        adjuntar('ingreso', nuevo.id, i.adjunto)
        nIngresos++
      } catch (e) {
        if (e instanceof ErrorValidacion) throw new ErrorValidacion(e.errores.map((m) => `${i.datos.concepto} (${i.datos.fecha}): ${m}`))
        throw e
      }
    }

    let nGastos = 0
    for (const g of plan.gastos) {
      if (existeGasto.get(g.datos.fecha, g.datos.base, g.datos.proveedor)) { omitidos++; continue }
      try {
        const nuevo = crearGasto(db, { ...g.datos, actividadId: actividad(g.iae) })
        adjuntar('gasto', nuevo.id, g.adjunto)
        nGastos++
      } catch (e) {
        if (e instanceof ErrorValidacion) throw new ErrorValidacion(e.errores.map((m) => `Gasto de ${g.datos.proveedor || g.datos.concepto} (${g.datos.fecha}): ${m}`))
        throw e
      }
    }

    return { borrados, clientesNuevos: clientesCreados, ingresos: nIngresos, gastos: nGastos, omitidos, adjuntos }
  })()
}

/** Lo que se muestra antes de confirmar la importación. */
export interface VistaImportacion {
  resumen: PlanImportacion['resumen']
  clientesNuevos: { clave: string; nombre: string; nif: string; paisSugerido: string }[]
  facturasConPdf: number
  justificantesAsignados: number
  /** Justificantes que habrá que adjuntar a mano. */
  sinAsignar: string[]
  avisos: string[]
  /** Lo que hay ahora en la app (se borraría con "borrar antes"). */
  actuales: { ingresos: number; gastos: number }
}

export function vistaImportacion(db: Db, plan: PlanImportacion): VistaImportacion {
  const cuenta = (t: string) => (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n
  return {
    resumen: plan.resumen,
    clientesNuevos: clientesNuevos(db, plan).map((c) => ({ clave: c.clave, nombre: c.datos.nombre, nif: c.datos.nif, paisSugerido: c.paisSugerido })),
    facturasConPdf: plan.ingresos.filter((i) => i.adjunto).length,
    justificantesAsignados: plan.gastos.filter((g) => g.adjunto).length,
    sinAsignar: plan.sinAsignar.map((s) => s.nombre),
    avisos: plan.avisos,
    actuales: { ingresos: cuenta('ingresos'), gastos: cuenta('gastos') }
  }
}
