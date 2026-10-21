import { useEffect, useState } from 'react'
import { NOMBRE_MODELO } from '../../core/calendario'
import { NOMBRE_GRUPO, type InformeImpuestos, type InformeIngresosGastos } from '../../core/informes'
import type { Prevision } from '../../core/prevision'
import { api, llamar, mensajes } from '../api'
import { Errores, euros, hoy } from '../componentes'
import { GraficoColumnas, Reparto } from '../graficos'

type Vista = 'ingresos-gastos' | 'prevision' | 'impuestos'
const VISTAS: { id: Vista; nombre: string }[] = [
  { id: 'ingresos-gastos', nombre: 'Gastos e ingresos' },
  { id: 'prevision', nombre: 'Previsión de ingresos' },
  { id: 'impuestos', nombre: 'Impuestos' }
]
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`

export function PaginaInformes() {
  const anioActual = Number(hoy().slice(0, 4))
  const [ejercicio, setEjercicio] = useState(anioActual)
  const [vista, setVista] = useState<Vista>('ingresos-gastos')

  return (
    <section>
      <div className="cabecera">
        <h1>Informes</h1>
        <select value={ejercicio} onChange={(e) => setEjercicio(Number(e.target.value))}>
          {[anioActual, anioActual - 1, anioActual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="pestanas">
        {VISTAS.map((v) => <button key={v.id} className={vista === v.id ? 'activo' : ''} onClick={() => setVista(v.id)}>{v.nombre}</button>)}
      </div>
      {vista === 'ingresos-gastos' ? <IngresosGastos ejercicio={ejercicio} /> : null}
      {vista === 'prevision' ? <PrevisionIngresos ejercicio={ejercicio} /> : null}
      {vista === 'impuestos' ? <Impuestos ejercicio={ejercicio} /> : null}
    </section>
  )
}

function useInforme<T>(cargar: () => Promise<T>, deps: unknown[]): [T | null, string[]] {
  const [datos, setDatos] = useState<T | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  useEffect(() => { cargar().then((d) => { setDatos(d); setErrores([]) }).catch((e) => setErrores(mensajes(e))) }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return [datos, errores]
}

function Cifra({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return <div className="cifra"><span>{titulo}</span><strong>{valor}</strong>{nota ? <small>{nota}</small> : null}</div>
}

const variacion = (actual: number, anterior: number) =>
  anterior > 0 ? `${actual >= anterior ? '+' : ''}${(((actual - anterior) / anterior) * 100).toLocaleString('es-ES', { maximumFractionDigits: 0 })} % que el año anterior` : undefined

function IngresosGastos({ ejercicio }: { ejercicio: number }) {
  const [r, errores] = useInforme<InformeIngresosGastos>(() => llamar(api.informeIngresosGastos(ejercicio, hoy())), [ejercicio])
  if (!r) return <Errores errores={errores} />
  return (
    <>
      <div className="cifras">
        <Cifra titulo="Ingresos (sin IVA)" valor={euros(r.ingresos)} nota={r.anterior ? variacion(r.ingresos, r.anterior.ingresos) : undefined} />
        <Cifra titulo="Gastos (sin IVA)" valor={euros(r.gastos)} nota={r.anterior ? variacion(r.gastos, r.anterior.gastos) : undefined} />
        <Cifra titulo="Diferencia" valor={euros(r.resultado)} nota={r.margen !== null ? `Margen del ${r.margen.toLocaleString('es-ES')} %` : undefined} />
      </div>
      <GraficoColumnas titulo={`Ingresos y gastos por mes, ${ejercicio}`} categorias={MESES}
        series={[
          { nombre: 'Ingresos', color: 'var(--serie-1)', valores: r.meses.map((m) => m.ingresos) },
          { nombre: 'Gastos', color: 'var(--serie-2)', valores: r.meses.map((m) => m.gastos) }
        ]} />
      <div className="dos-columnas">
        <Reparto titulo="Gastos por categoría" partidas={r.gastosPorCategoria} color="var(--serie-2)" />
        <Reparto titulo="Ingresos por cliente" partidas={r.ingresosPorCliente} color="var(--serie-1)" />
      </div>
      <p className="nota">Importes sin IVA: el IVA lo cobras o lo pagas por cuenta de Hacienda. Los gastos van completos, sin aplicar el % deducible, y los bienes de inversión cuentan en el mes de compra.{r.anterior && ejercicio === Number(hoy().slice(0, 4)) ? ' La comparación es con el año anterior hasta la misma fecha.' : ''}</p>
    </>
  )
}

function PrevisionIngresos({ ejercicio }: { ejercicio: number }) {
  const [p, errores] = useInforme<Prevision>(() => llamar(api.informePrevision(ejercicio, hoy())), [ejercicio])
  if (!p) return <Errores errores={errores} />
  const s = p.simulacion
  const cerrado = p.ingresosPrevistos === 0 && p.meses.every((m) => m.previsto === null)
  return (
    <>
      <div className="cifras">
        <Cifra titulo={cerrado ? 'Ingresos del año' : 'Ingresos previstos del año'} valor={euros(p.ingresosAnio)}
          nota={cerrado ? undefined : `${euros(p.ingresosReales)} ya registrados + ${euros(p.ingresosPrevistos)} previstos`} />
        {!cerrado ? <Cifra titulo="Ritmo mensual" valor={euros(p.mediaIngresos)} nota={`Media de los últimos ${p.mesesBase} meses completos`} /> : null}
        <Cifra titulo="IRPF del año" valor={euros(s.irpf)} nota={`Tipo medio ${s.estimacion.tipoMedio.toLocaleString('es-ES')} %`} />
        <Cifra titulo="IRPF que falta por pagar" valor={euros(p.irpfPendiente)} nota={p.presenta130 ? 'En los próximos 130 y en la renta' : 'En la renta de junio (no presentas el 130)'} />
        <Cifra titulo="Te quedará tras gastos e IRPF" valor={euros(s.neto)} nota={`Gastos deducibles previstos: ${euros(p.gastosAnio)}`} />
      </div>
      <GraficoColumnas titulo={`Ingresos por mes, ${ejercicio}`} categorias={MESES}
        series={[
          { nombre: 'Registrados', color: 'var(--serie-1)', valores: p.meses.map((m) => m.real) },
          { nombre: 'Previstos', color: 'var(--serie-1)', prevision: true, valores: p.meses.map((m) => m.previsto) }
        ]} />
      <Errores errores={errores} />
      {p.avisos.length ? <p className="avisos">{p.avisos.join(' ')}</p> : null}
      <p className="nota">La previsión repite la media de tus ingresos de los últimos meses completos hasta diciembre (en el mes en curso, lo que falta para llegar a esa media). Los gastos se prevén igual. No es una garantía: si esperas un cambio, pruébalo en el simulador de IRPF de la pestaña Impuestos.</p>
    </>
  )
}

function Impuestos({ ejercicio }: { ejercicio: number }) {
  const [r, errores] = useInforme<InformeImpuestos>(() => llamar(api.informeImpuestos(ejercicio, hoy())), [ejercicio])
  if (!r) return <Errores errores={errores} />
  return (
    <>
      <div className="cifras">
        <Cifra titulo="Pagado" valor={euros(r.pagado)} nota="Modelos marcados como presentados" />
        <Cifra titulo="Pendiente (estimado)" valor={euros(r.pendiente)} nota="Calculado con tus datos, aún sin presentar" />
        <Cifra titulo="Retenciones de tus clientes" valor={euros(r.retencionesSoportadas)} nota="Ya pagadas a cuenta de tu renta" />
      </div>
      <h2>Por impuesto</h2>
      <table>
        <thead><tr><th /><th className="num">Pagado</th><th className="num">Pendiente</th></tr></thead>
        <tbody>
          {r.grupos.map((g) => <tr key={g.grupo}><td>{NOMBRE_GRUPO[g.grupo]}</td><td className="num">{euros(g.pagado)}</td><td className="num">{euros(g.pendiente)}</td></tr>)}
        </tbody>
      </table>
      <h2>Detalle</h2>
      <table>
        <thead><tr><th>Modelo</th><th>Periodo</th><th>Plazo hasta</th><th>Estado</th><th className="num">Importe</th></tr></thead>
        <tbody>
          {r.lineas.map((l) => (
            <tr key={`${l.modelo}-${l.periodo}`}>
              <td>{l.modelo} · {NOMBRE_MODELO[l.modelo]}</td>
              <td>{l.periodo === '0A' ? ejercicio : l.periodo}</td>
              <td>{fechaCorta(l.plazo)}</td>
              <td>{l.presentado ? 'Presentado' : 'Estimado'}</td>
              <td className="num">{l.importe < 0 ? `${euros(-l.importe)} a tu favor` : euros(l.importe)}</td>
            </tr>
          ))}
          {!r.lineas.length ? <tr><td colSpan={5} className="vacio">Sin modelos en este ejercicio.</td></tr> : null}
        </tbody>
      </table>
      <Errores errores={errores} />
      {r.avisos.length ? <p className="nota">{r.avisos.join(' ')}</p> : null}
      <p className="nota">"A tu favor": a devolver o a compensar en los siguientes periodos. El IVA no es un coste tuyo: lo cobras a tus clientes y se lo pasas a Hacienda.</p>
    </>
  )
}
