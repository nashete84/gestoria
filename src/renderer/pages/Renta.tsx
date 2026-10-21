import { useEffect, useState } from 'react'
import type { VistaRenta } from '../../core/db/renta'
import type { DatosRenta, EstimacionRenta } from '../../core/renta/calculo'
import { api, llamar, mensajes } from '../api'
import { Avisos, Campo, CampoEuros, Errores, euros, hoy } from '../componentes'

/** Hasta junio se mira la renta del año pasado (la que se presenta); después, la del año en curso. */
function ejercicioPorDefecto() {
  const [a, m] = hoy().split('-').map(Number) as [number, number]
  return m <= 6 ? a - 1 : a
}

export function PaginaRenta() {
  const [ejercicio, setEjercicio] = useState(ejercicioPorDefecto())
  const [vista, setVista] = useState<VistaRenta | null>(null)
  const [datos, setDatos] = useState<DatosRenta | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    setVista(null)
    llamar(api.estimacionRenta(ejercicio))
      .then((v) => { setVista(v); setDatos(v.datos); setErrores([]) })
      .catch((e) => setErrores(mensajes(e)))
  }, [ejercicio])

  const set = <K extends keyof DatosRenta>(k: K, v: DatosRenta[K]) => {
    if (datos) setDatos({ ...datos, [k]: v })
    setGuardado(false)
  }

  const guardar = async () => {
    if (!datos) return
    try {
      const v = await llamar(api.guardarDatosRenta(ejercicio, datos))
      setVista(v)
      setErrores([])
      setGuardado(true)
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  const actual = new Date().getFullYear()
  const anios = [...new Set([actual, actual - 1, ...(vista?.ejercicios ?? []), ejercicio])].sort((a, b) => b - a)
  const r = vista?.estimacion

  return (
    <section>
      <div className="cabecera">
        <h1>Renta</h1>
        <select value={ejercicio} onChange={(e) => setEjercicio(Number(e.target.value))}>
          {anios.map((a) => <option key={a} value={a}>Ejercicio {a}</option>)}
        </select>
      </div>
      <Errores errores={errores} />
      {r && datos ? (
        <>
          <Resultado r={r} enCurso={ejercicio >= actual} />
          <Avisos avisos={r.avisos} />
          <h2>Cómo se calcula</h2>
          <Desglose r={r} />
          {r.amortizaciones.length ? <Amortizaciones r={r} /> : null}

          <h2>Tus otros datos de {ejercicio}</h2>
          <p className="nota">Lo que no sale de tus ingresos y gastos. Se guarda para este ejercicio.</p>
          <FormularioDatos key={ejercicio} datos={datos} ejercicio={ejercicio} set={set} />
          <div className="acciones">
            <button onClick={guardar}>Guardar y recalcular</button>
            {guardado ? <span className="ok">Guardado</span> : null}
          </div>
          <p className="nota">
            Estimación orientativa de la declaración individual. No incluye la declaración conjunta, rentas imputadas
            de inmuebles ni todas las deducciones autonómicas. Compárala siempre con el borrador de la AEAT.
          </p>
        </>
      ) : null}
    </section>
  )
}

function Resultado({ r, enCurso }: { r: EstimacionRenta; enCurso: boolean }) {
  const pagar = r.resultado >= 0
  return (
    <div className="cifras">
      <div className={`cifra resultado ${pagar ? 'pagar' : 'devolver'}`}>
        <span>{enCurso ? 'Si el año acabara hoy, saldría' : 'Resultado estimado'}</span>
        <strong>{pagar ? 'A pagar ' : 'A devolver '}{euros(Math.abs(r.resultado))}</strong>
      </div>
      <div className="cifra"><span>Cuota (impuesto total del año)</span><strong>{euros(r.cuotaLiquida)}</strong></div>
      <div className="cifra">
        <span>Ya pagado (retenciones y 130)</span>
        <strong>{euros(r.retencionesActividad + r.retencionesOtras + r.pagos130 + r.otrosPagosACuenta)}</strong>
      </div>
      <div className="cifra"><span>Tipo medio</span><strong>{r.tipoMedio.toLocaleString('es-ES')} %</strong></div>
    </div>
  )
}

function Desglose({ r }: { r: EstimacionRenta }) {
  const filas: [string, number, string?][] = []
  const varias = r.actividades.length > 1
  for (const a of r.actividades) {
    const t = varias ? ` (${a.codigo})` : ''
    filas.push([`Ingresos${t}`, a.ingresos])
    filas.push([`Gastos deducibles${t}`, -a.gastos])
    if (a.amortizaciones) filas.push([`Amortizaciones${t}`, -a.amortizaciones])
    if (a.dificilJustificacion) filas.push([`Gastos de difícil justificación (5%)${t}`, -a.dificilJustificacion])
  }
  filas.push(['Rendimiento neto de la actividad', r.rendimientoActividades, 'subtotal'])
  if (r.reduccionActividad) {
    filas.push([r.tipoReduccion === 'dependiente' ? 'Reducción autónomo dependiente (art. 32.2.2º)' : 'Reducción por rentas bajas (art. 32.2.3º)', -r.reduccionActividad])
  }
  if (r.otrasRentasGenerales) filas.push(['Otras rentas generales (trabajo...)', r.otrasRentasGenerales])
  filas.push(['Base imponible general', r.baseImponibleGeneral, 'subtotal'])
  if (r.reduccionPensiones) filas.push(['Reducción por planes de pensiones', -r.reduccionPensiones])
  filas.push(['Base liquidable general', r.baseLiquidableGeneral, 'subtotal'])
  if (r.baseLiquidableAhorro) filas.push(['Base liquidable del ahorro', r.baseLiquidableAhorro, 'subtotal'])
  filas.push(['Mínimo personal y familiar estatal (no tributa)', r.minimoEstatal, 'info'])
  filas.push([`Mínimo personal y familiar ${r.comunidad} (no tributa)`, r.minimoAutonomico, 'info'])
  filas.push(['Cuota estatal', r.cuotaEstatal.general + r.cuotaEstatal.ahorro])
  filas.push([`Cuota autonómica (${r.comunidad})`, r.cuotaAutonomica.general + r.cuotaAutonomica.ahorro])
  filas.push(['Cuota íntegra', r.cuotaIntegra, 'subtotal'])
  if (r.deducciones) filas.push(['Deducciones', -r.deducciones])
  filas.push(['Cuota líquida', r.cuotaLiquida, 'subtotal'])
  filas.push(['Retenciones en tus facturas', -r.retencionesActividad])
  if (r.retencionesOtras) filas.push(['Otras retenciones', -r.retencionesOtras])
  filas.push(['Pagos fraccionados (modelo 130 presentados)', -r.pagos130])
  if (r.otrosPagosACuenta) filas.push(['Otros pagos a cuenta', -r.otrosPagosACuenta])

  return (
    <table className="desglose">
      <tbody>
        {filas.map(([concepto, importe, clase]) => (
          <tr key={concepto} className={clase ?? ''}>
            <td>{concepto}</td>
            <td className="num">{euros(importe)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr><td>{r.resultado >= 0 ? 'A pagar' : 'A devolver'}</td><td className="num">{euros(Math.abs(r.resultado))}</td></tr>
      </tfoot>
    </table>
  )
}

function Amortizaciones({ r }: { r: EstimacionRenta }) {
  return (
    <>
      <h2>Amortizaciones (bienes de inversión)</h2>
      <table>
        <thead>
          <tr><th>Compra</th><th>Bien</th><th className="num">Valor</th><th className="num">% anual</th><th className="num">Años anteriores</th><th className="num">Este año</th><th className="num">Pendiente</th></tr>
        </thead>
        <tbody>
          {r.amortizaciones.map((a) => (
            <tr key={a.gastoId}>
              <td>{a.fecha.split('-').reverse().join('/')}</td>
              <td>{a.concepto}</td>
              <td className="num">{euros(a.valor)}</td>
              <td className="num">{a.coeficiente} %</td>
              <td className="num">{euros(a.acumuladaAnterior)}</td>
              <td className="num">{euros(a.delEjercicio)}</td>
              <td className="num">{euros(a.pendiente)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function FormularioDatos({ datos, ejercicio, set }: {
  datos: DatosRenta
  ejercicio: number
  set: <K extends keyof DatosRenta>(k: K, v: DatosRenta[K]) => void
}) {
  const hijos = datos.descendientes
  return (
    <div className="tarjeta">
      <div className="rejilla">
        <Campo etiqueta="Rendimientos del trabajo y otras rentas (netos)" ayuda="Por ejemplo, una nómina: el rendimiento neto reducido del borrador.">
          <CampoEuros valor={datos.otrasRentasGenerales} onChange={(v) => set('otrasRentasGenerales', v)} />
        </Campo>
        <Campo etiqueta="Rentas del ahorro" ayuda="Intereses, dividendos, ganancias por vender acciones o fondos.">
          <CampoEuros valor={datos.rentasAhorro} onChange={(v) => set('rentasAhorro', v)} />
        </Campo>
        <Campo etiqueta="Retenciones de esas otras rentas">
          <CampoEuros valor={datos.retencionesOtras} onChange={(v) => set('retencionesOtras', v)} />
        </Campo>
        <Campo etiqueta="Otros pagos a cuenta" ayuda="Solo si no los marcaste como presentados en Impuestos.">
          <CampoEuros valor={datos.otrosPagosACuenta} onChange={(v) => set('otrosPagosACuenta', v)} />
        </Campo>
        <Campo etiqueta="Aportaciones a planes de pensiones" ayuda="Reducen la base hasta 1.500 € al año.">
          <CampoEuros valor={datos.aportacionesPensiones} onChange={(v) => set('aportacionesPensiones', v)} />
        </Campo>
        <Campo etiqueta="Plan de pensiones de autónomos (PPES)" ayuda="Hasta 4.250 € adicionales.">
          <CampoEuros valor={datos.aportacionesPpes} onChange={(v) => set('aportacionesPpes', v)} />
        </Campo>
        <Campo etiqueta="Deducciones de la cuota" ayuda="Donativos, vivienda (régimen antiguo), autonómicas...">
          <CampoEuros valor={datos.deducciones} onChange={(v) => set('deducciones', v)} />
        </Campo>
        <Campo etiqueta="Tu año de nacimiento" ayuda="Desde los 65 años el mínimo personal es mayor.">
          <input type="number" min={1900} max={ejercicio} value={datos.anioNacimiento ?? ''}
            onChange={(e) => set('anioNacimiento', e.target.value ? Number(e.target.value) : null)} />
        </Campo>
      </div>

      <h2>Hijos menores de 25 que viven contigo</h2>
      {hijos.map((h, i) => (
        <div key={i} className="acciones">
          <Campo etiqueta={`Año de nacimiento del hijo ${i + 1}`}>
            <input type="number" min={1900} max={ejercicio} value={h.anioNacimiento}
              onChange={(e) => set('descendientes', hijos.map((x, j) => j === i ? { ...x, anioNacimiento: Number(e.target.value) } : x))} />
          </Campo>
          <label className="check">
            <input type="checkbox" checked={h.compartido}
              onChange={(e) => set('descendientes', hijos.map((x, j) => j === i ? { ...x, compartido: e.target.checked } : x))} />
            Lo comparto con el otro progenitor (50%)
          </label>
          <button className="peligro" onClick={() => set('descendientes', hijos.filter((_, j) => j !== i))}>Quitar</button>
        </div>
      ))}
      <button className="secundario" onClick={() => set('descendientes', [...hijos, { anioNacimiento: ejercicio, compartido: true }])}>Añadir hijo</button>

      <h2>Reducción de autónomo dependiente</h2>
      <label className="check">
        <input type="checkbox" checked={datos.autonomoDependiente} onChange={(e) => set('autonomoDependiente', e.target.checked)} />
        Trabajo para un único cliente (o soy TRADE), mis gastos no pasan del 30% de los ingresos y al menos el 70% de mis ingresos llevan retención
      </label>
      <p className="nota">Si lo marcas, se aplica la reducción del art. 32.2.2º y desaparece el 5% de gastos de difícil justificación.</p>
    </div>
  )
}
