import { describe, expect, it } from 'vitest'
import { buscar, palabras } from './buscador'
import { FICHAS } from './conocimiento'
import { fichasCitadas, limpiarRespuesta, MAX_TURNOS, prepararPregunta } from './prompt'
import { responder, validarConversacion, type Motor } from './servicio'

describe('base de conocimiento', () => {
  it('cada ficha tiene id único, y las fiscales citan una fuente oficial', () => {
    expect(new Set(FICHAS.map((f) => f.id)).size).toBe(FICHAS.length)
    for (const f of FICHAS.filter((x) => x.tipo === 'fiscal')) {
      expect(f.fuentes.length, f.id).toBeGreaterThan(0)
      for (const fu of f.fuentes) expect(fu.url, f.id).toMatch(/^https:\/\/(www\.boe\.es|sede\.agenciatributaria\.gob\.es)\//)
    }
  })
})

describe('buscador', () => {
  it('normaliza acentos, mayúsculas y terminaciones', () => {
    expect(palabras('¿Cómo AÑADO facturas?')).toEqual(palabras('como añadir factura'))
  })

  it.each([
    ['¿Cómo añado un gasto?', 'app-gasto'],
    ['¿Cómo hago una factura?', 'app-factura'],
    ['¿Cuándo se presenta el 303?', 'iva-303'],
    ['Facturo a una empresa de Alemania, ¿pongo IVA?', 'iva-ue-servicios'],
    ['Tengo un cliente en Estados Unidos', 'iva-fuera-ue'],
    ['Me he comprado un portátil', 'app-bien-inversion'],
    ['¿Puedo deducir la luz de casa?', 'irpf-suministros'],
    ['¿Qué pasa si presento tarde?', 'gen-recargos'],
    ['Comida con un cliente', 'irpf-dietas'],
    ['¿Cómo importo el txt en la sede?', 'app-txt']
  ])('"%s" encuentra %s', (pregunta, id) => {
    expect(buscar(pregunta).map((e) => e.ficha.id)).toContain(id)
  })

  it('no devuelve nada si ninguna palabra coincide', () => {
    expect(buscar('zzz qqq')).toEqual([])
  })
})

describe('prompt', () => {
  it('numera las fichas, pone las reglas y limita el historial', () => {
    const historial = Array.from({ length: 20 }, (_, i) => ({ rol: i % 2 ? 'asistente' as const : 'usuario' as const, texto: `m${i}` }))
    const p = prepararPregunta('¿Cuándo se presenta el 303?', historial)
    expect(p.sistema).toMatch(/Usa SOLO la información de las FICHAS/)
    expect(p.sistema).toContain('[1] Modelo 303: IVA trimestral')
    expect(p.fichas[0]).toMatchObject({ n: 1, titulo: 'Modelo 303: IVA trimestral' })
    expect(p.historial).toHaveLength(MAX_TURNOS * 2)
    expect(p.historial.at(-1)!.texto).toBe('m19')
  })

  it('usa la pregunta anterior cuando la nueva es muy corta', () => {
    const p = prepararPregunta('¿y en enero?', [{ rol: 'usuario', texto: '¿Cuándo se presenta el 390?' }, { rol: 'asistente', texto: '...' }])
    expect(p.fichas.map((f) => f.titulo)).toContain('Modelo 390: resumen anual del IVA')
  })

  it('avisa al modelo cuando no hay fichas', () => {
    expect(prepararPregunta('zzz qqq', []).sistema).toContain('(Ninguna ficha trata este tema.)')
    expect(() => prepararPregunta('   ', [])).toThrow(/Escribe/)
  })

  it('limpia el razonamiento y se queda con las fichas citadas', () => {
    expect(limpiarRespuesta('<think>hmm</think>\nHola [2]')).toBe('Hola [2]')
    const fichas = [{ n: 1, titulo: 'A', fuentes: [] }, { n: 2, titulo: 'B', fuentes: [] }]
    expect(fichasCitadas('Según [2], sí.', fichas).map((f) => f.n)).toEqual([2])
    expect(fichasCitadas('Sin citas.', fichas)).toHaveLength(2)
  })
})

describe('servicio', () => {
  const eco: Motor = {
    async responder(p, alTrozo) {
      for (const t of ['El 303 ', 'se presenta ', 'en abril [1].']) alTrozo(t)
      return `El 303 se presenta en abril [1].${p.historial.length ? ' (con historial)' : ''}`
    }
  }

  it('pasa los trozos y devuelve la respuesta con sus fuentes', async () => {
    const trozos: string[] = []
    const r = await responder(eco, '¿Cuándo se presenta el 303?', [], (t) => trozos.push(t), new AbortController().signal)
    expect(trozos.join('')).toBe('El 303 se presenta en abril [1].')
    expect(r.texto).toBe('El 303 se presenta en abril [1].')
    expect(r.fichas).toHaveLength(1)
    expect(r.fichas[0]!.fuentes[0]!.url).toMatch(/boe\.es/)
  })

  it('explica una respuesta vacía o cancelada', async () => {
    const vacio: Motor = { responder: async () => '' }
    const control = new AbortController()
    expect((await responder(vacio, '¿IVA?', [], () => undefined, control.signal)).texto).toMatch(/No he sabido/)
    control.abort()
    expect((await responder(vacio, '¿IVA?', [], () => undefined, control.signal)).texto).toBe('(Respuesta cancelada)')
  })

  it('valida lo que llega de la interfaz', () => {
    expect(() => validarConversacion('', [])).toThrow(/Escribe/)
    expect(() => validarConversacion('x'.repeat(2001), [])).toThrow(/larga/)
    expect(() => validarConversacion('hola', [{ rol: 'sistema', texto: 'x' }])).toThrow(/no válida/)
    expect(() => validarConversacion('hola', 'no')).toThrow(/no válida/)
    expect(validarConversacion('hola', [{ rol: 'usuario', texto: 'a' }]).historial).toEqual([{ rol: 'usuario', texto: 'a' }])
  })
})
