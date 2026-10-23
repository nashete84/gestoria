import { useEffect, useState } from 'react'
import type { ResultadoRecurrentes } from '../../core/db/recurrentes'
import { FRECUENCIAS, fechasPendientes, proximaFecha, type Frecuencia, type Recurrente } from '../../core/recurrentes'
import type { Gasto, Ingreso } from '../../core/tipos'
import { api, llamar, mensajes } from '../api'
import { Campo, Errores, euros, hoy } from '../componentes'
import { BotonIcono, Icono } from '../iconos'

const fechaEs = (f: string) => f.split('-').reverse().join('/')

/** Texto de lo que se ha creado, o null si nada. */
export function textoGenerados(r: ResultadoRecurrentes): string | null {
  const partes = []
  if (r.ingresos) partes.push(`${r.ingresos} ingreso(s)`)
  if (r.gastos) partes.push(`${r.gastos} gasto(s)`)
  return partes.length ? `Se han añadido ${partes.join(' y ')} recurrentes.` : null
}

/** Convierte un apunte en recurrente: se repite desde su fecha con la frecuencia elegida. */
export function FormRecurrente({ tipo, apunte, onHecho, onCancelar }: {
  tipo: 'ingreso' | 'gasto'; apunte: Ingreso | Gasto; onHecho: (r: ResultadoRecurrentes) => void; onCancelar: () => void
}) {
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('mensual')
  const [fin, setFin] = useState('')
  const [errores, setErrores] = useState<string[]>([])
  const base = { inicio: apunte.fecha, ultima: apunte.fecha, frecuencia, fin: fin || null, activa: true }
  const ahora = fechasPendientes(base, hoy())
  const proxima = proximaFecha({ ...base, ultima: ahora.at(-1) ?? apunte.fecha })

  const crear = async () => {
    try {
      const { id: _id, fecha: _f, ...plantilla } = apunte
      onHecho(await llamar(api.crearRecurrente({ tipo, plantilla, ...base } as Parameters<typeof api.crearRecurrente>[0])))
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  return (
    <div className="tarjeta">
      <h2><Icono nombre="repetir" />Repetir "{apunte.concepto}" ({euros(apunte.base)})</h2>
      <div className="rejilla">
        <Campo etiqueta="Frecuencia">
          <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}>
            {Object.entries(FRECUENCIAS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Hasta (opcional)"><input type="date" value={fin} min={apunte.fecha} onChange={(e) => setFin(e.target.value)} /></Campo>
      </div>
      <p className="nota">
        Se repite a partir del {fechaEs(apunte.fecha)}, siempre el mismo día{Number(apunte.fecha.slice(8)) > 28 ? ' (o el último del mes si no existe)' : ''}.
        {ahora.length ? ` Al crearlo se añadirán ya ${ahora.length} ${tipo === 'ingreso' ? 'ingreso(s)' : 'gasto(s)'} que faltan, del ${fechaEs(ahora[0]!)} al ${fechaEs(ahora.at(-1)!)}.` : ''}
        {proxima ? ` El siguiente se creará solo el ${fechaEs(proxima)}, al abrir la app.` : ' No quedan más fechas.'}
        {tipo === 'ingreso' ? ' Cada ingreso sale pendiente de cobro y sin factura.' : ' El número de factura del proveedor se deja vacío.'}
      </p>
      <Errores errores={errores} />
      <div className="acciones">
        <button onClick={crear}><Icono nombre="repetir" />Crear recurrente</button>
        <button className="secundario" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

/** Lista de recurrentes de un tipo, con pausa y borrado. */
export function PanelRecurrentes({ tipo, version, onCambio }: { tipo: 'ingreso' | 'gasto'; version: number; onCambio: () => void }) {
  const [lista, setLista] = useState<Recurrente[]>([])
  const [errores, setErrores] = useState<string[]>([])
  const cargar = () => llamar(api.listarRecurrentes()).then((l) => setLista(l.filter((r) => r.tipo === tipo))).catch((e) => setErrores(mensajes(e)))
  useEffect(() => { void cargar() }, [version])

  const pausar = async (r: Recurrente) => {
    try {
      await llamar(api.actualizarRecurrente(r.id, { frecuencia: r.frecuencia, fin: r.fin, activa: !r.activa }))
      await cargar(); onCambio()
    } catch (e) { setErrores(mensajes(e)) }
  }
  const borrar = async (r: Recurrente) => {
    if (!confirm(`¿Dejar de repetir "${r.plantilla.concepto}"?\n\nLos ${tipo === 'ingreso' ? 'ingresos' : 'gastos'} que ya se crearon se quedan.`)) return
    try { await llamar(api.borrarRecurrente(r.id)); await cargar() } catch (e) { setErrores(mensajes(e)) }
  }

  if (!lista.length && !errores.length) return null
  return (
    <>
      <h2><Icono nombre="repetir" />Recurrentes</h2>
      <Errores errores={errores} />
      <table>
        <thead><tr><th>Concepto</th><th>Frecuencia</th><th>Desde</th><th>Hasta</th><th>Próximo</th><th className="num">Base</th><th /></tr></thead>
        <tbody>
          {lista.map((r) => {
            const proxima = proximaFecha(r)
            return (
              <tr key={r.id}>
                <td>{r.plantilla.concepto}</td>
                <td>{FRECUENCIAS[r.frecuencia].nombre}</td>
                <td>{fechaEs(r.inicio)}</td>
                <td>{r.fin ? fechaEs(r.fin) : '—'}</td>
                <td>{!r.activa ? <span className="cobro pendiente">En pausa</span> : proxima ? fechaEs(proxima) : 'Terminado'}</td>
                <td className="num">{euros(r.plantilla.base)}</td>
                <td className="derecha">
                  <BotonIcono icono={r.activa ? 'pausa' : 'repetir'} texto={r.activa ? 'Pausar' : 'Reanudar (se saltan las fechas en pausa)'} onClick={() => pausar(r)} />
                  <BotonIcono icono="borrar" texto="Dejar de repetir" peligro onClick={() => borrar(r)} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
