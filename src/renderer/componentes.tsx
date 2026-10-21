import { useEffect, useState, type ReactNode } from 'react'
import type { Adjunto } from '../core/tipos'
import { formatearEuros, parsearEuros } from '../core/money'
import { rangoPeriodo } from '../core/periodos'
import { api, llamar, mensajes } from './api'

export function Errores({ errores }: { errores: string[] }) {
  if (!errores.length) return null
  return (
    <div className="errores" role="alert">
      {errores.map((e) => <p key={e}>{e}</p>)}
    </div>
  )
}

export function Avisos({ avisos }: { avisos: string[] }) {
  if (!avisos.length) return null
  return <div className="avisos">{avisos.map((a) => <p key={a}>{a}</p>)}</div>
}

export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
      {ayuda ? <small>{ayuda}</small> : null}
    </label>
  )
}

/** Input de importe: el usuario escribe "1.234,56" y el valor se guarda en céntimos. */
export function CampoEuros({ valor, onChange }: { valor: number; onChange: (c: number) => void }) {
  const [texto, setTexto] = useState(valor ? (valor / 100).toFixed(2).replace('.', ',') : '')
  const valido = texto === '' || parsearEuros(texto) !== null
  return (
    <input
      inputMode="decimal"
      className={valido ? '' : 'invalido'}
      value={texto}
      placeholder="0,00"
      onChange={(e) => {
        setTexto(e.target.value)
        const c = parsearEuros(e.target.value)
        onChange(c ?? (e.target.value.trim() === '' ? 0 : NaN)) // NaN: the validator rejects it instead of saving 0
      }}
    />
  )
}

export function CampoPct({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
  return (
    <input type="number" min={0} max={100} step="0.01" value={valor}
      onChange={(e) => onChange(Number(e.target.value))} />
  )
}

export const euros = formatearEuros

export interface Periodo { anio: number; trimestre: 0 | 1 | 2 | 3 | 4 }

export function rango(p: Periodo) {
  return rangoPeriodo(p.anio, p.trimestre)
}

export function periodoActual(): Periodo {
  const hoy = new Date()
  return { anio: hoy.getFullYear(), trimestre: (Math.floor(hoy.getMonth() / 3) + 1) as Periodo['trimestre'] }
}

export function SelectorPeriodo({ periodo, onChange }: { periodo: Periodo; onChange: (p: Periodo) => void }) {
  const anios = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + 1 - i)
  return (
    <div className="periodo">
      <select value={periodo.anio} onChange={(e) => onChange({ ...periodo, anio: Number(e.target.value) })}>
        {anios.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <select value={periodo.trimestre}
        onChange={(e) => onChange({ ...periodo, trimestre: Number(e.target.value) as Periodo['trimestre'] })}>
        <option value={0}>Año completo</option>
        <option value={1}>1T (ene–mar)</option>
        <option value={2}>2T (abr–jun)</option>
        <option value={3}>3T (jul–sep)</option>
        <option value={4}>4T (oct–dic)</option>
      </select>
    </div>
  )
}

export function hoy(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function Adjuntos({ entidad, id }: { entidad: Adjunto['entidad']; id: number }) {
  const [lista, setLista] = useState<Adjunto[]>([])
  const [errores, setErrores] = useState<string[]>([])

  const cargar = () => llamar(api.listarAdjuntos(entidad, id)).then(setLista).catch((e) => setErrores(mensajes(e)))
  useEffect(() => { void cargar() }, [entidad, id])

  const accion = (p: Promise<unknown>) => p.then(cargar).catch((e) => setErrores(mensajes(e)))

  return (
    <div className="adjuntos">
      <Errores errores={errores} />
      {lista.map((a) => (
        <span key={a.id} className="adjunto">
          <button className="enlace" onClick={() => accion(llamar(api.abrirAdjunto(a.id)))}>{a.nombre}</button>
          <button className="mini" title="Quitar" onClick={() => accion(llamar(api.borrarAdjunto(a.id)))}>×</button>
        </span>
      ))}
      <button className="secundario" onClick={() => accion(llamar(api.adjuntar(entidad, id)))}>Adjuntar justificante</button>
    </div>
  )
}

export interface ArchivoElegido { ficha: string; nombre: string }

/** Selector de justificantes antes de guardar: se adjuntan al guardar el registro. */
export function AdjuntosPendientes({ archivos, onChange }: { archivos: ArchivoElegido[]; onChange: (a: ArchivoElegido[]) => void }) {
  const [errores, setErrores] = useState<string[]>([])
  return (
    <div className="adjuntos">
      <Errores errores={errores} />
      {archivos.map((a) => (
        <span key={a.ficha} className="adjunto">
          📎 {a.nombre}
          <button className="mini" title="Quitar" onClick={() => onChange(archivos.filter((x) => x.ficha !== a.ficha))}>×</button>
        </span>
      ))}
      <button className="secundario" onClick={() =>
        llamar(api.elegirArchivos()).then((n) => onChange([...archivos, ...n])).catch((e) => setErrores(mensajes(e)))}>
        Adjuntar factura
      </button>
      {archivos.length ? <small className="nota">Se guardarán con el gasto.</small> : null}
    </div>
  )
}
