// Datos para exportar los libros registro de un ejercicio, del 1 de enero hasta el final del trimestre elegido.

import type BetterSqlite3 from 'better-sqlite3'
import { hojasLibros, nombreArchivoLibros } from '../libros'
import type { Hoja } from '../xlsx'
import { listarFacturas } from './facturas'
import { ErrorValidacion, leerPerfil, listarClientes, listarGastos, listarIngresos } from './repos'

type Db = BetterSqlite3.Database

/** trimestre 0 = año completo; 1-4 = desde el 1 de enero hasta el final de ese trimestre (lo que pide la AEAT para el 130). */
export function librosRegistro(db: Db, ejercicio: number, trimestre: number): { nombre: string; hojas: Hoja[] } {
  const perfil = leerPerfil(db)
  if (!perfil) throw new ErrorValidacion(['Rellena primero tu perfil fiscal.'])
  if (!Number.isInteger(trimestre) || trimestre < 0 || trimestre > 4) throw new ErrorValidacion(['Periodo no válido.'])
  const desde = `${ejercicio}-01-01`
  const hasta = `${ejercicio}-${['12-31', '03-31', '06-30', '09-30', '12-31'][trimestre]}`
  const facturas = new Map<number, string>()
  for (const f of listarFacturas(db, desde, `${ejercicio + 1}-12-31`)) if (f.ingresoId !== null && f.estado === 'emitida') facturas.set(f.ingresoId, f.numSerie)
  const hojas = hojasLibros({
    perfil, clientes: listarClientes(db), facturas, ingresos: listarIngresos(db, desde, hasta), gastos: listarGastos(db, desde, hasta)
  })
  return { nombre: nombreArchivoLibros(perfil, ejercicio) + (trimestre ? `_${trimestre}T` : ''), hojas }
}
