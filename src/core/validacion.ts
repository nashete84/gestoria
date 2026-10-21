// Validaciones de entrada. Se ejecutan en el proceso principal antes de escribir en la base de datos.

import { ambitoDePais } from './fiscalidad'
import { esNifValido, formatoNifIvaUe } from './nif'
import type { ClienteNuevo, GastoNuevo, IngresoNuevo, Perfil } from './tipos'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function fechaValida(f: string): boolean {
  if (!FECHA.test(f)) return false
  const d = new Date(f + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f
}

function pctValido(p: number): boolean {
  return Number.isFinite(p) && p >= 0 && p <= 100
}

export function validarPerfil(p: Perfil): string[] {
  const e: string[] = []
  if (!esNifValido(p.nif)) e.push('El NIF no es válido.')
  if (!p.nombre.trim()) e.push('Falta el nombre.')
  if (!p.actividades?.length) e.push('Da de alta al menos una actividad (epígrafe del IAE).')
  else {
    if (p.actividades.filter((a) => a.principal).length !== 1) e.push('Marca una sola actividad como principal.')
    if (p.actividades.some((a) => !a.codigo.trim())) e.push('Falta el código del epígrafe en alguna actividad.')
    const claves = p.actividades.map((a) => `${a.seccion}-${a.codigo.trim()}`)
    if (new Set(claves).size !== claves.length) e.push('Hay una actividad repetida.')
    if (new Set(p.actividades.map((a) => a.id)).size !== p.actividades.length) e.push('Identificadores de actividad repetidos.')
    for (const a of p.actividades) {
      for (const [cat, v] of Object.entries(a.deducibles ?? {})) {
        if (!pctValido(v.irpf) || !pctValido(v.iva)) e.push(`% deducible no válido en ${a.codigo} (${cat}).`)
      }
    }
  }
  if (!fechaValida(p.fechaAlta)) e.push('La fecha de alta no es válida.')
  if (p.pctViviendaAfecta !== undefined && !pctValido(p.pctViviendaAfecta)) e.push('El % de vivienda afecta debe estar entre 0 y 100.')
  return e
}

export function validarCliente(c: ClienteNuevo): string[] {
  const e: string[] = []
  if (!c.nombre.trim()) e.push('Falta el nombre del cliente.')
  if (!/^[A-Z]{2}$/.test(c.pais)) e.push('El país debe ser un código de dos letras (ES, FR, US...).')
  const ambito = ambitoDePais(c.pais)
  if (ambito === 'nacional' && c.tipo === 'empresa' && !esNifValido(c.nif)) {
    e.push('El NIF del cliente no es válido.')
  }
  if (ambito === 'nacional' && c.tipo === 'particular' && c.nif && !esNifValido(c.nif)) {
    e.push('El NIF del cliente no es válido.')
  }
  if (ambito === 'ue' && c.tipo === 'empresa' && !formatoNifIvaUe(c.nif, c.pais)) {
    e.push('El NIF-IVA de una empresa de la UE debe empezar por el código de su país (p. ej. FR12345678901).')
  }
  return e
}

export function validarIngreso(i: IngresoNuevo): string[] {
  const e: string[] = []
  if (!fechaValida(i.fecha)) e.push('La fecha no es válida.')
  if (!i.concepto.trim()) e.push('Falta el concepto.')
  if (!Number.isInteger(i.base)) e.push('La base debe ser un importe en céntimos.')
  if (!pctValido(i.tipoIva)) e.push('El tipo de IVA no es válido.')
  if (!pctValido(i.retencionPct)) e.push('La retención no es válida.')
  if (i.operacion !== 'nacional' && i.tipoIva !== 0) {
    e.push('Las operaciones intracomunitarias o no sujetas no llevan IVA.')
  }
  return e
}

export function validarGasto(g: GastoNuevo): string[] {
  const e: string[] = []
  if (!fechaValida(g.fecha)) e.push('La fecha no es válida.')
  if (!g.proveedor.trim()) e.push('Falta el proveedor.')
  if (!g.concepto.trim()) e.push('Falta el concepto.')
  if (!Number.isInteger(g.base)) e.push('La base debe ser un importe en céntimos.')
  for (const [nombre, v] of [
    ['tipo de IVA', g.tipoIva], ['% deducible IRPF', g.deduciblePctIrpf],
    ['% deducible IVA', g.deduciblePctIva], ['retención', g.retencionPct]
  ] as const) {
    if (!pctValido(v)) e.push(`El ${nombre} no es válido.`)
  }
  return e
}
