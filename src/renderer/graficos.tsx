// Gráficos en SVG sin librerías: columnas agrupadas con tooltip, leyenda y tabla.
// Colores por papel (--serie-N en styles.css, con su versión para modo oscuro).

import { useState } from 'react'
import { euros } from './componentes'

export interface Serie {
  nombre: string
  /** Variable CSS del color, p. ej. "var(--serie-1)". */
  color: string
  /** Céntimos por categoría; null = sin dato (no se dibuja). */
  valores: (number | null)[]
  /** Serie de previsión: se dibuja con trama, no sólida. */
  prevision?: boolean
}

const ANCHO = 720
const ALTO = 240
const M = { arriba: 12, derecha: 8, abajo: 26, izquierda: 56 }

/** Marcas "redondas" del eje: 1, 2, 2,5 o 5 por potencia de 10. */
function escala(max: number, min: number): { ticks: number[]; lo: number; hi: number } {
  const rango = Math.max(max - min, 1)
  const paso0 = rango / 4
  const p = 10 ** Math.floor(Math.log10(paso0))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= paso0)!
  const lo = Math.floor(min / paso) * paso
  const hi = Math.ceil(max / paso) * paso
  const ticks: number[] = []
  for (let v = lo; v <= hi + paso / 2; v += paso) ticks.push(v)
  return { ticks, lo, hi }
}

const compacto = (c: number) => {
  const e = c / 100
  return Math.abs(e) >= 1000 ? `${(e / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}K` : e.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}

/** Columna con el extremo de datos redondeado (4px) y la base recta. */
function columna(x: number, y0: number, y1: number, ancho: number): string {
  const alto = Math.abs(y1 - y0)
  if (alto < 0.5) return ''
  const r = Math.min(4, alto, ancho / 2)
  if (y1 < y0) { // hacia arriba
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + ancho - r} Q${x + ancho},${y1} ${x + ancho},${y1 + r} V${y0} Z`
  }
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + ancho - r} Q${x + ancho},${y1} ${x + ancho},${y1 - r} V${y0} Z`
}

export function GraficoColumnas({ categorias, series, titulo }: { categorias: string[]; series: Serie[]; titulo: string }) {
  const [activa, setActiva] = useState<number | null>(null)
  const [verTabla, setVerTabla] = useState(false)
  const valores = series.flatMap((s) => s.valores.filter((v): v is number => v !== null))
  const { ticks, lo, hi } = escala(Math.max(0, ...valores), Math.min(0, ...valores))
  const w = ANCHO - M.izquierda - M.derecha
  const h = ALTO - M.arriba - M.abajo
  const y = (v: number) => M.arriba + h - ((v - lo) / (hi - lo || 1)) * h
  const banda = w / categorias.length
  const hueco = 2
  const ancho = Math.min(24, (banda * 0.7 - hueco * (series.length - 1)) / series.length)
  const grupo = ancho * series.length + hueco * (series.length - 1)

  return (
    <figure className="grafico">
      <figcaption>
        <strong>{titulo}</strong>
        {series.length > 1 ? (
          <span className="leyenda">
            {series.map((s) => <span key={s.nombre}><i style={{ background: s.color }} className={s.prevision ? 'trama' : ''} />{s.nombre}</span>)}
          </span>
        ) : null}
        <button className="enlace" onClick={() => setVerTabla(!verTabla)}>{verTabla ? 'Ver gráfico' : 'Ver tabla'}</button>
      </figcaption>
      {verTabla ? (
        <table>
          <thead><tr><th />{series.map((s) => <th key={s.nombre} className="num">{s.nombre}</th>)}</tr></thead>
          <tbody>
            {categorias.map((c, i) => (
              <tr key={c}><td>{c}</td>{series.map((s) => <td key={s.nombre} className="num">{s.valores[i] === null ? '—' : euros(s.valores[i]!)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="lienzo">
          <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={titulo} onMouseLeave={() => setActiva(null)}>
            <defs>
              {series.filter((s) => s.prevision).map((s, i) => (
                <pattern key={i} id={`trama-${i}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill={s.color} opacity="0.25" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke={s.color} strokeWidth="3" />
                </pattern>
              ))}
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(t)} y2={y(t)} className={t === 0 ? 'eje' : 'rejilla'} />
                <text x={M.izquierda - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tick">{compacto(t)}</text>
              </g>
            ))}
            {categorias.map((c, i) => {
              const x0 = M.izquierda + banda * i + (banda - grupo) / 2
              let tramas = 0
              return (
                <g key={c} className={activa === i ? 'activa' : ''}>
                  {series.map((s, j) => {
                    const v = s.valores[i]
                    const relleno = s.prevision ? `url(#trama-${tramas++})` : s.color
                    return v === null || v === undefined ? null : <path key={s.nombre} d={columna(x0 + j * (ancho + hueco), y(0), y(v), ancho)} fill={relleno} />
                  })}
                  <text x={M.izquierda + banda * (i + 0.5)} y={ALTO - 8} textAnchor="middle" className="tick">{c}</text>
                  <rect x={M.izquierda + banda * i} y={M.arriba} width={banda} height={h} fill="transparent"
                    tabIndex={0} onMouseEnter={() => setActiva(i)} onFocus={() => setActiva(i)} />
                </g>
              )
            })}
          </svg>
          {activa !== null ? (
            <div className="tooltip" style={{ left: `${((M.izquierda + banda * (activa + 0.5)) / ANCHO) * 100}%` }}>
              <div className="tooltip-titulo">{categorias[activa]}</div>
              {series.map((s) => s.valores[activa] === null ? null : (
                <div key={s.nombre}><i style={{ background: s.color }} /> <strong>{euros(s.valores[activa]!)}</strong> {s.nombre}</div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </figure>
  )
}

/** Barras horizontales sencillas para un reparto (categorías, clientes). Una sola serie: sin leyenda. */
export function Reparto({ titulo, partidas, color, maximo = 8 }: { titulo: string; partidas: { clave: string; nombre: string; importe: number }[]; color: string; maximo?: number }) {
  const visibles = partidas.length > maximo
    ? [...partidas.slice(0, maximo - 1), { clave: 'otros', nombre: 'Otros', importe: partidas.slice(maximo - 1).reduce((a, p) => a + p.importe, 0) }]
    : partidas
  const top = Math.max(1, ...visibles.map((p) => p.importe))
  return (
    <figure className="grafico">
      <figcaption><strong>{titulo}</strong></figcaption>
      {visibles.length ? visibles.map((p) => (
        <div key={p.clave} className="reparto-fila" title={`${p.nombre}: ${euros(p.importe)}`}>
          <span className="reparto-nombre">{p.nombre}</span>
          <span className="reparto-barra"><span style={{ width: `${(Math.max(0, p.importe) / top) * 100}%`, background: color }} /></span>
          <span className="num">{euros(p.importe)}</span>
        </div>
      )) : <p className="vacio">Sin datos</p>}
    </figure>
  )
}
