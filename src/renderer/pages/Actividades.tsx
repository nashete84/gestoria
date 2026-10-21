import { useState } from 'react'
import { buscarEpigrafes, deduciblesIniciales, entradaCatalogo, nombreSeccion, nuevaActividad } from '../../core/epigrafes'
import { CATEGORIAS_GASTO } from '../../core/fiscalidad'
import type { Actividad, Epigrafe } from '../../core/tipos'
import { Campo } from '../componentes'

const nuevoId = () => 'a' + crypto.randomUUID().slice(0, 8)

/** Alta, baja y edición de actividades (epígrafes) con su tabla de % deducibles. */
export function EditorActividades({ actividades, onChange }: { actividades: Actividad[]; onChange: (a: Actividad[]) => void }) {
  const [busqueda, setBusqueda] = useState('')
  const [manual, setManual] = useState<Epigrafe>({ seccion: 2, codigo: '', descripcion: '' })
  const [abierta, setAbierta] = useState<string | null>(null)

  const anadir = (e: Epigrafe) => {
    if (!e.codigo.trim()) return
    if (actividades.some((a) => a.seccion === e.seccion && a.codigo === e.codigo.trim())) return
    onChange([...actividades, nuevaActividad(e, nuevoId(), actividades.length === 0)])
    setManual({ seccion: 2, codigo: '', descripcion: '' })
  }
  const cambiar = (id: string, cambios: Partial<Actividad>) =>
    onChange(actividades.map((a) => (a.id === id ? { ...a, ...cambios } : a)))
  const hacerPrincipal = (id: string) => onChange(actividades.map((a) => ({ ...a, principal: a.id === id })))
  const quitar = (id: string) => {
    const resto = actividades.filter((a) => a.id !== id)
    if (resto.length && !resto.some((a) => a.principal)) resto[0] = { ...resto[0]!, principal: true }
    onChange(resto)
  }

  return (
    <div>
      {actividades.map((a) => (
        <div key={a.id} className="tarjeta actividad">
          <div className="actividad-cabecera">
            <div>
              <strong>{a.codigo}</strong> · {a.descripcion || 'Sin descripción'} <span className="nota">({nombreSeccion(a.seccion)})</span>
              {a.principal ? <span className="etiqueta">principal</span> : null}
            </div>
            <div className="acciones">
              {!a.principal ? <button className="secundario" onClick={() => hacerPrincipal(a.id)}>Hacer principal</button> : null}
              <button className="secundario" onClick={() => setAbierta(abierta === a.id ? null : a.id)}>
                {abierta === a.id ? 'Ocultar % deducibles' : '% deducibles'}
              </button>
              {actividades.length > 1 ? <button className="peligro" onClick={() => quitar(a.id)}>Quitar</button> : null}
            </div>
          </div>
          {abierta === a.id ? (
            <>
              <div className="rejilla">
                <Campo etiqueta="Descripción"><input value={a.descripcion} onChange={(e) => cambiar(a.id, { descripcion: e.target.value })} /></Campo>
              </div>
              {entradaCatalogo(a)?.motivo ? <p className="nota">{entradaCatalogo(a)!.motivo}</p> : null}
              <table className="deducibles">
                <thead><tr><th>Categoría de gasto</th><th className="num">% IRPF</th><th className="num">% IVA</th></tr></thead>
                <tbody>
                  {CATEGORIAS_GASTO.map((c) => {
                    const v = a.deducibles[c.id] ?? { irpf: c.deduciblePctIrpf, iva: c.deduciblePctIva }
                    const set = (k: 'irpf' | 'iva', n: number) => cambiar(a.id, { deducibles: { ...a.deducibles, [c.id]: { ...v, [k]: n } } })
                    return (
                      <tr key={c.id}>
                        <td>{c.nombre}{c.sobreViviendaAfecta ? <small className="nota"> · sobre la parte de vivienda afecta</small> : null}</td>
                        <td className="num"><input type="number" min={0} max={100} step="0.01" value={v.irpf} onChange={(e) => set('irpf', Number(e.target.value))} /></td>
                        <td className="num"><input type="number" min={0} max={100} step="0.01" value={v.iva} onChange={(e) => set('iva', Number(e.target.value))} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="acciones">
                <button className="secundario" onClick={() => cambiar(a.id, { deducibles: deduciblesIniciales(a) })}>Restablecer valores propuestos</button>
              </div>
            </>
          ) : null}
        </div>
      ))}

      <h2>Añadir actividad</h2>
      <div className="rejilla">
        <Campo etiqueta="Buscar en el catálogo">
          <input value={busqueda} placeholder="Código o descripción" onChange={(e) => setBusqueda(e.target.value)} />
        </Campo>
        <div className="sugerencias">
          {buscarEpigrafes(busqueda).map((e) => (
            <button key={e.seccion + e.codigo} className="chip" disabled={actividades.some((a) => a.seccion === e.seccion && a.codigo === e.codigo)}
              onClick={() => anadir(e)}>
              + {e.codigo} · {e.descripcion} ({nombreSeccion(e.seccion)})
            </button>
          ))}
        </div>
        <Campo etiqueta="O escribe otro: sección">
          <select value={manual.seccion} onChange={(e) => setManual({ ...manual, seccion: Number(e.target.value) as 1 | 2 | 3 })}>
            <option value={1}>1 · Empresarial</option>
            <option value={2}>2 · Profesional</option>
            <option value={3}>3 · Artística</option>
          </select>
        </Campo>
        <Campo etiqueta="Código"><input value={manual.codigo} onChange={(e) => setManual({ ...manual, codigo: e.target.value })} /></Campo>
        <Campo etiqueta="Descripción"><input value={manual.descripcion} onChange={(e) => setManual({ ...manual, descripcion: e.target.value })} /></Campo>
        <div><button className="secundario" disabled={!manual.codigo.trim()} onClick={() => anadir(manual)}>Añadir</button></div>
      </div>
    </div>
  )
}
