import type BetterSqlite3 from 'better-sqlite3'
import {
  clasificar, generarObligaciones, type Actividad, type Modelo, type ObligacionConEstado, type Periodo,
  type Presentacion, type PresentacionNueva, type Resultado
} from '../calendario'
import { calcularGasto, calcularIngreso } from '../fiscalidad'
import { porcentaje } from '../money'
import { normalizarPerfil } from '../epigrafes'
import { normalizarNif } from '../nif'
export { periodoTrimestre } from '../periodos'
import type {
  Adjunto, Cliente, ClienteNuevo, Gasto, GastoNuevo, Ingreso, IngresoNuevo, Perfil
} from '../tipos'
import { validarCliente, validarGasto, validarIngreso, validarPerfil } from '../validacion'

type Db = BetterSqlite3.Database
type Fila = Record<string, unknown>

export class ErrorValidacion extends Error {
  constructor(public errores: string[]) {
    super(errores.join(' '))
    this.name = 'ErrorValidacion'
  }
}

function comprobar(errores: string[]): void {
  if (errores.length) throw new ErrorValidacion(errores)
}

// ---------- Perfil ----------

export function leerPerfil(db: Db): Perfil | null {
  const fila = db.prepare('SELECT datos FROM perfil WHERE id = 1').get() as { datos: string } | undefined
  return fila ? normalizarPerfil(JSON.parse(fila.datos)) : null
}

export function guardarPerfil(db: Db, p: Perfil): Perfil {
  const perfil = { ...p, nif: normalizarNif(p.nif) }
  comprobar(validarPerfil(perfil))
  // No se puede quitar una actividad que ya tiene ingresos o gastos.
  const anterior = leerPerfil(db)
  for (const a of anterior?.actividades ?? []) {
    if (perfil.actividades.some((x) => x.id === a.id)) continue
    const usos = (db.prepare('SELECT (SELECT COUNT(*) FROM ingresos WHERE actividad_id = ?) + (SELECT COUNT(*) FROM gastos WHERE actividad_id = ?) n')
      .get(a.id, a.id) as { n: number }).n
    if (usos > 0) throw new ErrorValidacion([`No se puede quitar la actividad ${a.codigo}: tiene ${usos} ingreso(s) o gasto(s).`])
  }
  db.prepare(
    'INSERT INTO perfil (id, datos) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET datos = excluded.datos'
  ).run(JSON.stringify(perfil))
  return perfil
}

// ---------- Clientes ----------

function aCliente(f: Fila): Cliente {
  return {
    id: f.id as number, tipo: f.tipo as Cliente['tipo'], nombre: f.nombre as string,
    nif: f.nif as string, pais: f.pais as string, domicilio: f.domicilio as string,
    codigoPostal: f.codigo_postal as string, municipio: f.municipio as string,
    provincia: f.provincia as string, email: f.email as string, notas: f.notas as string
  }
}

// Códigos habituales que no son ISO 3166: Reino Unido es GB y Grecia GR.
const ALIAS_PAIS: Record<string, string> = { UK: 'GB', EL: 'GR' }

function prepararCliente(c: ClienteNuevo): ClienteNuevo {
  const pais = c.pais.trim().toUpperCase()
  return { ...c, nif: normalizarNif(c.nif), pais: ALIAS_PAIS[pais] ?? pais }
}

export function listarClientes(db: Db): Cliente[] {
  return (db.prepare('SELECT * FROM clientes ORDER BY nombre COLLATE NOCASE').all() as Fila[]).map(aCliente)
}

export function crearCliente(db: Db, entrada: ClienteNuevo): Cliente {
  const c = prepararCliente(entrada)
  comprobar(validarCliente(c))
  const r = db.prepare(`INSERT INTO clientes
    (tipo, nombre, nif, pais, domicilio, codigo_postal, municipio, provincia, email, notas)
    VALUES (@tipo, @nombre, @nif, @pais, @domicilio, @codigoPostal, @municipio, @provincia, @email, @notas)`
  ).run(c)
  return { ...c, id: Number(r.lastInsertRowid) }
}

export function actualizarCliente(db: Db, id: number, entrada: ClienteNuevo): Cliente {
  const c = prepararCliente(entrada)
  comprobar(validarCliente(c))
  db.prepare(`UPDATE clientes SET tipo=@tipo, nombre=@nombre, nif=@nif, pais=@pais, domicilio=@domicilio,
    codigo_postal=@codigoPostal, municipio=@municipio, provincia=@provincia, email=@email, notas=@notas
    WHERE id=@id`).run({ ...c, id })
  return { ...c, id }
}

export function borrarCliente(db: Db, id: number): void {
  const usos = db.prepare('SELECT COUNT(*) n FROM ingresos WHERE cliente_id = ?').get(id) as { n: number }
  if (usos.n > 0) {
    throw new ErrorValidacion([`No se puede borrar: el cliente tiene ${usos.n} ingreso(s) registrados.`])
  }
  db.prepare('DELETE FROM clientes WHERE id = ?').run(id)
}

// ---------- Ingresos ----------

function aIngreso(f: Fila): Ingreso {
  return {
    id: f.id as number, fecha: f.fecha as string, clienteId: (f.cliente_id as number | null) ?? null,
    actividadId: (f.actividad_id as string | null) ?? null, concepto: f.concepto as string, base: f.base as number, tipoIva: f.tipo_iva as number,
    cuotaIva: f.cuota_iva as number, retencionPct: f.retencion_pct as number,
    cuotaRetencion: f.cuota_retencion as number, operacion: f.operacion as Ingreso['operacion'],
    facturaId: (f.factura_id as number | null) ?? null, notas: f.notas as string
  }
}

export function listarIngresos(db: Db, desde: string, hasta: string): Ingreso[] {
  return (db.prepare('SELECT * FROM ingresos WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC, id DESC')
    .all(desde, hasta) as Fila[]).map(aIngreso)
}

function comprobarActividad(db: Db, actividadId: string | null) {
  if (actividadId === null) return
  const perfil = leerPerfil(db)
  if (!perfil?.actividades.some((a) => a.id === actividadId)) throw new ErrorValidacion(['La actividad elegida no existe.'])
}

function filaIngreso(db: Db, entrada: IngresoNuevo) {
  const n = { ...entrada, actividadId: entrada.actividadId ?? null }
  comprobar(validarIngreso(n))
  comprobarActividad(db, n.actividadId)
  return { ...n, ...calcularIngreso(n) }
}

export function crearIngreso(db: Db, n: IngresoNuevo): Ingreso {
  const f = filaIngreso(db, n)
  const r = db.prepare(`INSERT INTO ingresos
    (fecha, cliente_id, actividad_id, concepto, base, tipo_iva, cuota_iva, retencion_pct, cuota_retencion, operacion, notas)
    VALUES (@fecha, @clienteId, @actividadId, @concepto, @base, @tipoIva, @cuotaIva, @retencionPct, @cuotaRetencion, @operacion, @notas)`
  ).run(f)
  return { ...f, id: Number(r.lastInsertRowid), facturaId: null }
}

export function actualizarIngreso(db: Db, id: number, n: IngresoNuevo): Ingreso {
  const actual = db.prepare('SELECT factura_id FROM ingresos WHERE id = ?').get(id) as { factura_id: number | null } | undefined
  if (!actual) throw new ErrorValidacion(['El ingreso no existe.'])
  if (actual.factura_id) throw new ErrorValidacion(['Este ingreso viene de una factura: corrígelo con una factura rectificativa.'])
  const f = filaIngreso(db, n)
  db.prepare(`UPDATE ingresos SET fecha=@fecha, cliente_id=@clienteId, actividad_id=@actividadId, concepto=@concepto, base=@base,
    tipo_iva=@tipoIva, cuota_iva=@cuotaIva, retencion_pct=@retencionPct, cuota_retencion=@cuotaRetencion,
    operacion=@operacion, notas=@notas WHERE id=@id`).run({ ...f, id })
  return { ...f, id, facturaId: null }
}

export function borrarIngreso(db: Db, id: number): void {
  const actual = db.prepare('SELECT factura_id FROM ingresos WHERE id = ?').get(id) as { factura_id: number | null } | undefined
  if (actual?.factura_id) throw new ErrorValidacion(['Este ingreso viene de una factura y no se puede borrar.'])
  db.transaction(() => {
    db.prepare("DELETE FROM adjuntos WHERE entidad = 'ingreso' AND entidad_id = ?").run(id)
    db.prepare('DELETE FROM ingresos WHERE id = ?').run(id)
  })()
}

// ---------- Gastos ----------

function aGasto(f: Fila): Gasto {
  return {
    id: f.id as number, fecha: f.fecha as string, proveedor: f.proveedor as string,
    nifProveedor: f.nif_proveedor as string, paisProveedor: f.pais_proveedor as string,
    numeroFactura: f.numero_factura as string, actividadId: (f.actividad_id as string | null) ?? null,
    concepto: f.concepto as string,
    categoria: f.categoria as string, base: f.base as number, tipoIva: f.tipo_iva as number,
    cuotaIva: f.cuota_iva as number, deduciblePctIrpf: f.deducible_pct_irpf as number,
    deduciblePctIva: f.deducible_pct_iva as number, retencionPct: f.retencion_pct as number,
    cuotaRetencion: f.cuota_retencion as number, operacion: f.operacion as Gasto['operacion'],
    bienInversion: f.bien_inversion === 1, notas: f.notas as string
  }
}

function filaGasto(db: Db, n: GastoNuevo) {
  const g = { ...n, actividadId: n.actividadId ?? null, nifProveedor: normalizarNif(n.nifProveedor), paisProveedor: n.paisProveedor.trim().toUpperCase() }
  comprobar(validarGasto(g))
  comprobarActividad(db, g.actividadId)
  return { ...g, ...calcularGasto(g) }
}

const COLUMNAS_GASTO = `fecha=@fecha, proveedor=@proveedor, nif_proveedor=@nifProveedor,
  pais_proveedor=@paisProveedor, numero_factura=@numeroFactura, actividad_id=@actividadId, concepto=@concepto, categoria=@categoria,
  base=@base, tipo_iva=@tipoIva, cuota_iva=@cuotaIva, deducible_pct_irpf=@deduciblePctIrpf,
  deducible_pct_iva=@deduciblePctIva, retencion_pct=@retencionPct, cuota_retencion=@cuotaRetencion,
  operacion=@operacion, bien_inversion=@bienInversionN, notas=@notas`

export function listarGastos(db: Db, desde: string, hasta: string): Gasto[] {
  return (db.prepare('SELECT * FROM gastos WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC, id DESC')
    .all(desde, hasta) as Fila[]).map(aGasto)
}

export function crearGasto(db: Db, n: GastoNuevo): Gasto {
  const f = filaGasto(db, n)
  const r = db.prepare(`INSERT INTO gastos (fecha, proveedor, nif_proveedor, pais_proveedor, numero_factura, actividad_id,
    concepto, categoria, base, tipo_iva, cuota_iva, deducible_pct_irpf, deducible_pct_iva, retencion_pct,
    cuota_retencion, operacion, bien_inversion, notas) VALUES (@fecha, @proveedor, @nifProveedor,
    @paisProveedor, @numeroFactura, @actividadId, @concepto, @categoria, @base, @tipoIva, @cuotaIva, @deduciblePctIrpf,
    @deduciblePctIva, @retencionPct, @cuotaRetencion, @operacion, @bienInversionN, @notas)`
  ).run({ ...f, bienInversionN: f.bienInversion ? 1 : 0 })
  return { ...f, id: Number(r.lastInsertRowid) }
}

export function actualizarGasto(db: Db, id: number, n: GastoNuevo): Gasto {
  const f = filaGasto(db, n)
  const r = db.prepare(`UPDATE gastos SET ${COLUMNAS_GASTO} WHERE id=@id`)
    .run({ ...f, bienInversionN: f.bienInversion ? 1 : 0, id })
  if (r.changes === 0) throw new ErrorValidacion(['El gasto no existe.'])
  return { ...f, id }
}

export function borrarGasto(db: Db, id: number): void {
  db.transaction(() => {
    db.prepare("DELETE FROM adjuntos WHERE entidad = 'gasto' AND entidad_id = ?").run(id)
    db.prepare('DELETE FROM gastos WHERE id = ?').run(id)
  })()
}

// ---------- Adjuntos ----------

function aAdjunto(f: Fila): Adjunto {
  return {
    id: f.id as number, entidad: f.entidad as Adjunto['entidad'], entidadId: f.entidad_id as number,
    nombre: f.nombre as string, ruta: f.ruta as string, sha256: f.sha256 as string, creado: f.creado as string
  }
}

export function listarAdjuntos(db: Db, entidad: Adjunto['entidad'], entidadId: number): Adjunto[] {
  return (db.prepare('SELECT * FROM adjuntos WHERE entidad = ? AND entidad_id = ? ORDER BY id')
    .all(entidad, entidadId) as Fila[]).map(aAdjunto)
}

export function registrarAdjunto(db: Db, a: Omit<Adjunto, 'id' | 'creado'>): Adjunto {
  const r = db.prepare(`INSERT INTO adjuntos (entidad, entidad_id, nombre, ruta, sha256)
    VALUES (@entidad, @entidadId, @nombre, @ruta, @sha256)`).run(a)
  return leerAdjunto(db, Number(r.lastInsertRowid))!
}

export function leerAdjunto(db: Db, id: number): Adjunto | null {
  const f = db.prepare('SELECT * FROM adjuntos WHERE id = ?').get(id) as Fila | undefined
  return f ? aAdjunto(f) : null
}

export function borrarAdjunto(db: Db, id: number): Adjunto | null {
  const a = leerAdjunto(db, id)
  db.prepare('DELETE FROM adjuntos WHERE id = ?').run(id)
  return a
}

/** ¿Otro adjunto usa el mismo fichero? (los ficheros se guardan por hash y pueden compartirse). */
export function rutaEnUso(db: Db, ruta: string): boolean {
  return (db.prepare('SELECT COUNT(*) n FROM adjuntos WHERE ruta = ?').get(ruta) as { n: number }).n > 0
}

// ---------- Resumen ----------

export interface Resumen {
  desde: string
  hasta: string
  ingresosBase: number
  ivaRepercutido: number
  retencionesSoportadas: number
  gastosDeducibles: number
  ivaSoportadoDeducible: number
  rendimientoNeto: number
  ivaResultado: number
  retencionesPracticadas: number
  bienesInversionPendientes: number
}

/**
 * Resumen provisional del periodo. No sustituye al cálculo de los modelos (paso 3):
 * por ejemplo, no incluye amortizaciones ni el 5% de gastos de difícil justificación.
 */
export function resumen(db: Db, desde: string, hasta: string): Resumen {
  const ingresos = listarIngresos(db, desde, hasta)
  const gastos = listarGastos(db, desde, hasta)
  const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

  const ingresosBase = suma(ingresos.map((i) => i.base))
  const ivaRepercutido = suma(ingresos.map((i) => i.cuotaIva))
  // IVA autoliquidado en compras con inversión del sujeto pasivo: suma al devengado y al deducible.
  const ivaAutoliquidado = suma(gastos.filter((g) => g.operacion === 'intracomunitaria' || g.operacion === 'extracomunitaria').map((g) => g.cuotaIva))
  const corrientes = gastos.filter((g) => !g.bienInversion)
  const gastosDeducibles = suma(corrientes.map((g) => porcentaje(g.base, g.deduciblePctIrpf)))
  const ivaSoportadoDeducible = suma(gastos.map((g) => porcentaje(g.cuotaIva, g.deduciblePctIva)))

  return {
    desde, hasta,
    ingresosBase,
    ivaRepercutido,
    retencionesSoportadas: suma(ingresos.map((i) => i.cuotaRetencion)),
    gastosDeducibles,
    ivaSoportadoDeducible,
    rendimientoNeto: ingresosBase - gastosDeducibles,
    ivaResultado: ivaRepercutido + ivaAutoliquidado - ivaSoportadoDeducible,
    retencionesPracticadas: suma(gastos.map((g) => g.cuotaRetencion)),
    bienesInversionPendientes: gastos.filter((g) => g.bienInversion).length
  }
}

// ---------- Presentaciones y calendario ----------

const MODELOS: Modelo[] = ['303', '130', '111', '115', '349', '390', '347', '190', '180', '100']
const RESULTADOS: Resultado[] = ['ingresar', 'devolver', 'compensar', 'cero', 'negativa']

function aPresentacion(f: Fila): Presentacion {
  return {
    id: f.id as number, modelo: f.modelo as Modelo, ejercicio: f.ejercicio as number,
    periodo: f.periodo as Periodo, fechaPresentacion: f.fecha_presentacion as string,
    resultado: f.resultado as Resultado, importe: f.importe as number,
    justificante: f.justificante as string, notas: f.notas as string
  }
}

export function listarPresentaciones(db: Db): Presentacion[] {
  return (db.prepare('SELECT * FROM presentaciones ORDER BY fecha_presentacion DESC, id DESC').all() as Fila[]).map(aPresentacion)
}

export function registrarPresentacion(db: Db, p: PresentacionNueva): Presentacion {
  const e: string[] = []
  if (!MODELOS.includes(p.modelo)) e.push('Modelo no válido.')
  if (!Number.isInteger(p.ejercicio) || p.ejercicio < 2000) e.push('Ejercicio no válido.')
  if (!['1T', '2T', '3T', '4T', '0A'].includes(p.periodo)) e.push('Periodo no válido.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fechaPresentacion)) e.push('La fecha de presentación no es válida.')
  if (!RESULTADOS.includes(p.resultado)) e.push('Resultado no válido.')
  if (!Number.isInteger(p.importe) || p.importe < 0) e.push('El importe no es válido.')
  if (['cero', 'negativa'].includes(p.resultado) && p.importe !== 0) e.push('Una declaración sin actividad o negativa no tiene importe.')
  comprobar(e)
  const existe = db.prepare('SELECT id FROM presentaciones WHERE modelo = ? AND ejercicio = ? AND periodo = ?')
    .get(p.modelo, p.ejercicio, p.periodo)
  if (existe) throw new ErrorValidacion([`El modelo ${p.modelo} de ese periodo ya está marcado como presentado.`])
  const r = db.prepare(`INSERT INTO presentaciones (modelo, ejercicio, periodo, fecha_presentacion, resultado, importe, justificante, notas)
    VALUES (@modelo, @ejercicio, @periodo, @fechaPresentacion, @resultado, @importe, @justificante, @notas)`).run(p)
  return { ...p, id: Number(r.lastInsertRowid) }
}

export function borrarPresentacion(db: Db, id: number): void {
  db.prepare('DELETE FROM presentaciones WHERE id = ?').run(id)
}

const TRIMESTRE_SQL = "substr(fecha, 1, 4) || '-' || ((CAST(substr(fecha, 6, 2) AS INTEGER) + 2) / 3) || 'T'"
export const LIMITE_347 = 300506 // 3.005,06 € en céntimos

/** Qué trimestres tienen operaciones que obligan a 111, 115, 349 y qué ejercicios al 347. */
export function actividadFiscal(db: Db): Actividad {
  const trimestres = (sql: string) => (db.prepare(sql).all() as { k: string }[]).map((x) => x.k)
  const ejercicios347 = db.prepare(`
    SELECT DISTINCT anio FROM (
      SELECT substr(i.fecha, 1, 4) anio, i.cliente_id tercero, SUM(i.base + i.cuota_iva) total
        FROM ingresos i WHERE i.operacion = 'nacional' AND i.cuota_retencion = 0 AND i.cliente_id IS NOT NULL
        GROUP BY anio, tercero
      UNION ALL
      SELECT substr(g.fecha, 1, 4) anio, COALESCE(NULLIF(g.nif_proveedor, ''), g.proveedor) tercero, SUM(g.base + g.cuota_iva) total
        FROM gastos g WHERE g.operacion = 'nacional' AND g.cuota_retencion = 0 AND g.categoria <> 'cuota_autonomo'
          AND (TRIM(g.proveedor) <> '' OR TRIM(g.nif_proveedor) <> '')
        GROUP BY anio, tercero
    ) WHERE total > ${LIMITE_347}`).all() as { anio: string }[]
  return {
    retencionesProfesionales: trimestres(`SELECT DISTINCT ${TRIMESTRE_SQL} k FROM gastos WHERE cuota_retencion > 0 AND categoria <> 'alquiler_local'`),
    retencionesAlquiler: trimestres(`SELECT DISTINCT ${TRIMESTRE_SQL} k FROM gastos WHERE cuota_retencion > 0 AND categoria = 'alquiler_local'`),
    intracomunitarias: trimestres(`SELECT DISTINCT ${TRIMESTRE_SQL} k FROM ingresos WHERE operacion = 'intracomunitaria'
      UNION SELECT DISTINCT ${TRIMESTRE_SQL} k FROM gastos WHERE operacion = 'intracomunitaria'`),
    ejerciciosCon347: ejercicios347.map((x) => Number(x.anio))
  }
}

export function calendarioFiscal(db: Db, hoy: string): ObligacionConEstado[] {
  const perfil = leerPerfil(db)
  if (!perfil) return []
  const inicio = perfil.inicioControl || `${hoy.slice(0, 4)}-01-01`
  const obligaciones = generarObligaciones(perfil, inicio, hoy, actividadFiscal(db))
  return clasificar(obligaciones, listarPresentaciones(db), hoy)
}
