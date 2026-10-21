// Ficheros de los modelos 349 y 347 según sus diseños de registro oficiales (registros de 500 posiciones).
// 349: Anexo de la Orden HAC/174/2020. 347: diseño para 2025 y siguientes (Orden HAC/1431/2025).

import type { Perfil } from '../tipos'
import type { Resultado347, Resultado349 } from './declarativos'
import { alfa, blancos, importe, nif9, nombreDeclarante, num, signo, telefono9, unirRegistros } from './fichero'

export interface Fichero {
  nombre: string
  contenido: string
  avisos: string[]
}

export function fichero349(perfil: Perfil, r: Resultado349): Fichero {
  const avisos = [...r.avisos]
  const nombre = nombreDeclarante(perfil, avisos)
  const comun = '349' + num(r.ejercicio, 4) + nif9(perfil.nif)
  const total = r.operadores.reduce((a, o) => a + o.base, 0)
  const trimestre = Number(r.periodo[0])
  const r1 =
    '1' + comun +
    alfa(nombre, 40) +
    blancos(1) +
    telefono9(perfil.telefono) + alfa(nombre, 40) +
    '349' + num(r.ejercicio, 4) + num(trimestre, 1) + num(1, 5) + // nº identificativo (13)
    ' ' + ' ' + num(0, 13) +
    alfa(r.periodo, 2) +
    num(r.operadores.length, 9) + importe(total, 13) +
    num(0, 9) + importe(0, 13) +
    ' ' +
    blancos(204) +
    blancos(9) +
    blancos(101)
  const r2 = r.operadores.map((o) =>
    '2' + comun +
    blancos(58) +
    alfa(o.nifIva.slice(0, 2), 2) + alfa(o.nifIva.slice(2), 15) +
    alfa(o.nombre, 40) +
    o.clave +
    importe(o.base, 11) +
    blancos(32) +
    blancos(2) + blancos(15) + blancos(40) +
    blancos(265))
  return { nombre: `349_${r.ejercicio}_${r.periodo}.txt`, contenido: unirRegistros([r1, ...r2], 500), avisos }
}

export function fichero347(perfil: Perfil, r: Resultado347): Fichero {
  const avisos = [...r.avisos]
  const nombre = nombreDeclarante(perfil, avisos)
  const comun = '347' + num(r.ejercicio, 4) + nif9(perfil.nif)
  const total = r.terceros.reduce((a, t) => a + t.importe, 0)
  const r1 =
    '1' + comun +
    alfa(nombre, 40) +
    'T' +
    telefono9(perfil.telefono) + alfa(nombre, 40) +
    '347' + num(r.ejercicio, 4) + num(1, 6) +
    ' ' + ' ' + num(0, 13) +
    num(r.terceros.length, 9) +
    signo(total) + importe(total, 13) +
    num(0, 9) + ' ' + importe(0, 13) +
    blancos(205) +
    blancos(9) +
    blancos(88) +
    blancos(13)
  const r2 = r.terceros.map((t) => {
    const residente = t.pais.toUpperCase() === 'ES'
    if (residente && !/^\d{2}$/.test(t.provincia)) {
      avisos.push(`Falta la provincia de ${t.nombre}: el fichero lleva 00 y tendrás que corregirla en la Sede.`)
    }
    const provincia = residente ? (/^\d{2}$/.test(t.provincia) ? t.provincia : '00') : '99'
    return '2' + comun +
      (residente ? nif9(t.nif) : blancos(9)) +
      blancos(9) +
      alfa(t.nombre, 40) +
      'D' +
      provincia +
      (residente ? blancos(2) : alfa(t.pais, 2)) +
      blancos(1) +
      t.clave +
      signo(t.importe) + importe(t.importe, 13) +
      ' ' + ' ' +
      importe(0, 13) +
      ' ' + importe(0, 13) +
      num(0, 4) +
      t.trimestres.map((x) => signo(x) + importe(x, 13) + ' ' + importe(0, 13)).join('') +
      blancos(2) + blancos(15) +
      ' ' + ' ' + ' ' +
      ' ' + importe(0, 13) +
      num(0, 6) +
      blancos(195)
  })
  return { nombre: `347_${r.ejercicio}.txt`, contenido: unirRegistros([r1, ...r2], 500), avisos }
}
