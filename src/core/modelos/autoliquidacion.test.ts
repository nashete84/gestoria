import { describe, expect, it } from 'vitest'
import { normalizarPerfil } from '../epigrafes'
import { perfilBase } from '../fixtures'
import type { Gasto, Ingreso, Perfil } from '../tipos'
import { fichero111, fichero115, fichero130, fichero303, fichero390 } from './ficherosAutoliquidacion'
import { calcular111, calcular115 } from './retenciones'
import { calcular130 } from './m130'
import { calcular303 } from './m303'
import { calcular390 } from './m390'
import { DISENOS, pagina } from './posicional'
import { AJUSTES_VACIOS } from './tipos'

const e = (euros: number) => Math.round(euros * 100)
let n = 0
const ingreso = (fecha: string, base: number, extra: Partial<Ingreso> = {}): Ingreso => {
  const tipoIva = extra.tipoIva ?? (extra.operacion && extra.operacion !== 'nacional' ? 0 : 21)
  const retencionPct = extra.retencionPct ?? 0
  return {
    id: ++n, fecha, clienteId: null, actividadId: null, concepto: 'Servicios', base: e(base), tipoIva,
    cuotaIva: Math.round(e(base) * tipoIva / 100), retencionPct, cuotaRetencion: Math.round(e(base) * retencionPct / 100),
    operacion: 'nacional', facturaId: null, notas: '', fechaVencimiento: null, fechaCobro: null, ...extra
  }
}
const gasto = (fecha: string, base: number, extra: Partial<Gasto> = {}): Gasto => {
  const tipoIva = extra.tipoIva ?? 21
  const retencionPct = extra.retencionPct ?? 0
  return {
    id: ++n, fecha, proveedor: 'Proveedor', nifProveedor: 'B12345674', paisProveedor: 'ES', numeroFactura: '', actividadId: null,
    concepto: 'Gasto', categoria: 'otros', base: e(base), tipoIva, cuotaIva: Math.round(e(base) * tipoIva / 100),
    deduciblePctIrpf: 100, deduciblePctIva: 100, retencionPct, cuotaRetencion: Math.round(e(base) * retencionPct / 100),
    operacion: 'nacional', bienInversion: false, notas: '', ...extra
  }
}

const perfil: Perfil = { ...perfilBase, apellidos: 'García Núñez', nombrePila: 'Nacho', iban: 'ES91 2100 0418 4502 0005 1332' }
/** Trozo del fichero: posición contando desde 1, como en los diseños. */
const en = (s: string, pos: number, lon: number) => s.slice(pos - 1, pos - 1 + lon)
const CAB = 328 // longitud de la cabecera con el bloque AUX

describe('motor posicional', () => {
  it('todas las páginas de los diseños son contiguas', () => {
    for (const d of Object.values(DISENOS)) {
      for (const [nombre, campos] of Object.entries(d.paginas)) {
        if (nombre === 'cabecera') continue
        expect(pagina(campos, {}).length).toBe(campos.at(-1)!.pos + campos.at(-1)!.lon! - 1)
      }
    }
  })

  it('formatea números con signo y rechaza negativos donde no caben', () => {
    const campos = DISENOS['130'].paginas['01']!
    const p = pagina(campos, { '03': -12345 }, {})
    expect(en(p, 143, 17)).toBe('N0000000000012345')
    expect(() => pagina(campos, { '01': -1 })).toThrow(/no admite negativos/)
  })
})

describe('303', () => {
  const ingresos = [ingreso('2026-07-10', 1000), ingreso('2026-08-10', 5665, { operacion: 'no_sujeta' })]
  const gastos = [gasto('2026-07-15', 100)]

  it('genera el fichero con la cabecera, las páginas 01, 03 y DID y el cierre', () => {
    const r = calcular303({ ejercicio: 2026, trimestre: 3, ingresos, gastos, ajustes: AJUSTES_VACIOS })
    const f = fichero303(perfil, r)
    const s = f.contenido
    expect(s.length).toBe(CAB + 1581 + 1017 + 823 + 18)
    expect(s.startsWith('<T303020263T0000><AUX>')).toBe(true)
    expect(s.endsWith('</T303DID00></T303020263T0000>')).toBe(true)
    expect(f.nombre).toBe('12345678ZMOD3032026-3T.txt')

    const p1 = s.slice(CAB, CAB + 1581)
    expect(en(p1, 1, 11)).toBe('<T30301000>')
    expect(en(p1, 13, 1)).toBe('I')
    expect(en(p1, 14, 9)).toBe('12345678Z')
    expect(en(p1, 23, 80).trimEnd()).toBe('GARCIA NUÑEZ NACHO')
    expect(en(p1, 103, 6)).toBe('20263T')
    expect(en(p1, 109, 22)).toBe('223222222' + ' '.repeat(9) + '2000')
    expect(en(p1, 326, 17)).toBe('00000000000100000') // [07] base al 21 %
    expect(en(p1, 343, 5)).toBe('02100') // [08] tipo
    expect(en(p1, 348, 17)).toBe('00000000000021000') // [09] cuota
    expect(en(p1, 226, 5)).toBe('00400') // tipo del 4 % aunque no haya operaciones
    expect(en(p1, 1019, 17)).toBe('00000000000018900') // [46]

    const p3 = s.slice(CAB + 1581, CAB + 1581 + 1017)
    expect(en(p3, 46, 17)).toBe('00000000000566500') // [120]
    expect(en(p3, 216, 5)).toBe('10000') // [65]
    expect(en(p3, 425, 1)).toBe(' ')
    const did = s.slice(CAB + 1581 + 1017, CAB + 1581 + 1017 + 823)
    expect(en(did, 23, 34).trim()).toBe('')
    expect(en(did, 194, 1)).toBe('0')
  })

  it('marca "sin actividad" con resultado cero y pone la cuenta si pides devolución', () => {
    const vacio = fichero303(perfil, calcular303({ ejercicio: 2026, trimestre: 1, ingresos: [], gastos: [], ajustes: AJUSTES_VACIOS })).contenido
    expect(en(vacio, CAB + 13, 1)).toBe('N')
    expect(en(vacio, CAB + 1581 + 425, 1)).toBe('X')

    const r = calcular303({ ejercicio: 2026, trimestre: 4, ingresos: [], gastos: [gasto('2026-11-01', 1000)], ajustes: AJUSTES_VACIOS })
    expect(r.tipo).toBe('devolver')
    const s = fichero303(perfil, r).contenido
    expect(en(s, CAB + 13, 1)).toBe('D')
    expect(en(s, CAB + 127, 4)).toBe('2200') // 4T: no exonerado del 390
    const did = s.slice(CAB + 1581 + 1017)
    expect(en(did, 23, 34).trim()).toBe('ES9121000418450200051332')
    expect(en(did, 194, 1)).toBe('1')
  })
})

describe('130, 111 y 115', () => {
  it('130: apellidos y nombre por separado, casillas y tipo', () => {
    const r = calcular130({ perfil, ejercicio: 2026, trimestre: 1, ingresos: [ingreso('2026-02-01', 3000, { retencionPct: 15 })], gastos: [], rendimientoAnterior: 50000_00, sinDificilJustificacion: false })
    const s = fichero130(perfil, r).contenido
    expect(s.length).toBe(CAB + 600 + 18)
    const p = s.slice(CAB)
    expect(en(p, 1, 11)).toBe('<T13001000>')
    expect(en(p, 23, 60).trimEnd()).toBe('GARCIA NUÑEZ')
    expect(en(p, 83, 20).trimEnd()).toBe('NACHO')
    expect(en(p, 103, 6)).toBe('20261T')
    expect(en(p, 109, 17)).toBe('00000000000300000') // [01]
    expect(Number(en(p, 415, 17).replace('N', '-'))).toBe(r.casillas['19'])
    expect(en(p, 13, 1)).toBe(r.tipo === 'ingresar' ? 'I' : r.tipo === 'compensar' ? 'B' : 'N')
  })

  it('111 y 115 con sus retenciones', () => {
    const gs = [gasto('2026-04-10', 1000, { retencionPct: 15 }), gasto('2026-05-10', 800, { retencionPct: 19, categoria: 'alquiler_local' })]
    const s111 = fichero111(perfil, calcular111(gs, 2026, 2)).contenido.slice(CAB)
    expect(s111.length).toBe(1000 + 18)
    expect(en(s111, 13, 1)).toBe('I')
    expect(en(s111, 193, 8)).toBe('00000001') // [07] perceptores
    expect(en(s111, 201, 17)).toBe('00000000000100000') // [08]
    expect(en(s111, 218, 17)).toBe('00000000000015000') // [09]
    expect(en(s111, 521, 17)).toBe('00000000000015000') // [30]
    const s115 = fichero115(perfil, calcular115(gs, 2026, 2)).contenido.slice(CAB)
    expect(s115.length).toBe(500 + 18)
    expect(en(s115, 109, 15)).toBe('000000000000001') // [01]
    expect(en(s115, 175, 17)).toBe('00000000000015200') // [05]
    expect(en(fichero115(perfil, calcular115([], 2026, 2)).contenido, CAB + 13, 1)).toBe('N')
  })
})

describe('390', () => {
  const ingresos = [
    ingreso('2025-02-01', 3000), // 1T: 630 de IVA
    ingreso('2025-05-01', 20000, { operacion: 'no_sujeta' }),
    ingreso('2025-08-01', 1000) // 3T: 210
  ]
  const gastos = [
    gasto('2025-04-01', 2000), // 2T: -420, a compensar
    gasto('2025-06-01', 100, { operacion: 'intracomunitaria' }), // se autoliquida y se deduce
    gasto('2025-11-01', 1000, { bienInversion: true }) // 4T: -210, a devolver
  ]

  it('suma el año y cuadra con los cuatro 303', () => {
    const r = calcular390({ ejercicio: 2025, ingresos, gastos, ajustes: AJUSTES_VACIOS })
    const c = r.casillas
    expect(c['05']).toBe(e(4000))
    expect(c['06']).toBe(e(840))
    expect(c['551']).toBe(e(100)) // servicio intracomunitario al 21 %
    expect(c['637']).toBe(e(100))
    expect(c['605']).toBe(e(2000))
    expect(c['613']).toBe(e(1000))
    expect(c['34']).toBe(e(861))
    expect(c['64']).toBe(e(651))
    expect(c['65']).toBe(e(210))
    expect(c['95']).toBe(e(630)) // solo el 1T sale a ingresar (el 3T queda a cero por la compensación)
    expect(c['98']).toBe(e(210))
    expect(c['110']).toBe(e(20000))
    expect(c['108']).toBe(e(24000))
    expect(c['86']).toBe(c['95']! - c['97']! - c['98']! - c['662']!)
    expect(r.avisos).toEqual([])
  })

  it('aplica la compensación del año anterior en la casilla 85', () => {
    const r = calcular390({ ejercicio: 2025, ingresos, gastos, ajustes: { ...AJUSTES_VACIOS, compensar303Inicial: e(100) } })
    expect(r.casillas['85']).toBe(e(100))
    expect(r.casillas['86']).toBe(e(110))
    expect(r.avisos).toEqual([])
  })

  it('genera las ocho páginas con los datos estadísticos de cada actividad', () => {
    const otra = { ...perfil.actividades[0]!, id: 'a2', principal: false, codigo: '844', descripcion: 'Servicios de publicidad' }
    const r = calcular390({ ejercicio: 2025, ingresos, gastos, ajustes: AJUSTES_VACIOS })
    const s = fichero390({ ...perfil, actividades: [otra, perfil.actividades[0]!] }, r).contenido
    expect(s.length).toBe(10003)
    expect(s.startsWith('<T390020250A0000><AUX>')).toBe(true)
    const p1 = s.slice(CAB, CAB + 1187)
    expect(en(p1, 23, 60).trimEnd()).toBe('GARCIA NUÑEZ')
    expect(en(p1, 103, 4)).toBe('2025')
    expect(en(p1, 107, 2)).toBe('  ')
    expect(en(p1, 148, 40).trimEnd()).toBe('PROGRAMADORES Y ANALISTAS DE INFORMATICA') // la principal primero
    expect(en(p1, 188, 7)).toBe('A05763 ')
    expect(en(p1, 235, 7)).toBe('A05844 ')
    const inicio06 = CAB + 1187 + 1806 + 531 + 1840 + 854 + 1519
    const p6 = s.slice(inicio06, inicio06 + 828)
    expect(en(p6, 1, 11)).toBe('<T39006000>')
    expect(en(p6, 30, 17)).toBe('00000000000021000') // [84]
    expect(en(p6, 140, 17)).toBe('0'.repeat(17)) // [84] de tributación por territorio, solo forales
    expect(en(p6, 293, 17)).toBe('00000000000021000') // [98]
  })
})

it('pasa el antiguo "Nombre para Hacienda" a apellidos y nombre', () => {
  const p = normalizarPerfil({ ...perfilBase, nombreFiscal: 'LLORCA SANZ IGNACIO' })
  expect(p.apellidos).toBe('LLORCA SANZ')
  expect(p.nombrePila).toBe('IGNACIO')
  expect('nombreFiscal' in p).toBe(false)
})
