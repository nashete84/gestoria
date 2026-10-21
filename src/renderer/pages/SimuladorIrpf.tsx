import { useEffect, useState } from 'react'
import type { EntradaSimulador, ResultadoSimulador } from '../../core/simulador'
import { api, llamar, mensajes } from '../api'
import { Campo, CampoEuros, Errores, euros, hoy } from '../componentes'

/** "¿Y si…?": la renta del año con los ingresos y gastos que elijas. Empieza con tus datos y la previsión hasta diciembre. */
export function SimuladorIrpf({ ejercicio }: { ejercicio: number }) {
  const [base, setBase] = useState<EntradaSimulador | null>(null)
  const [entrada, setEntrada] = useState<EntradaSimulador | null>(null)
  const [r, setR] = useState<ResultadoSimulador | null>(null)
  const [version, setVersion] = useState(0) // para rellenar de nuevo los campos al restablecer
  const [errores, setErrores] = useState<string[]>([])

  useEffect(() => {
    llamar(api.informePrevision(ejercicio, hoy()))
      .then((p) => { setBase(p.simulacion.entrada); setEntrada(p.simulacion.entrada); setVersion((v) => v + 1) })
      .catch((e) => setErrores(mensajes(e)))
  }, [ejercicio])

  useEffect(() => {
    if (!entrada) return
    llamar(api.simularIrpf(ejercicio, entrada)).then((x) => { setR(x); setErrores([]) }).catch((e) => setErrores(mensajes(e)))
  }, [ejercicio, entrada])

  if (!entrada) return <Errores errores={errores} />
  const set = (k: keyof EntradaSimulador) => (v: number) => setEntrada({ ...entrada, [k]: v })
  const e = r?.estimacion

  return (
    <div className="tarjeta">
      <p className="nota">Cambia los importes del año y mira cuánto IRPF te sale. Empieza con lo que llevas registrado más la previsión hasta diciembre, y usa tus otros datos de la pestaña Renta (hijos, otras rentas, plan de pensiones…).</p>
      <div className="rejilla" key={version}>
        <Campo etiqueta="Ingresos del año (sin IVA)"><CampoEuros valor={entrada.ingresos} onChange={set('ingresos')} /></Campo>
        <Campo etiqueta="Gastos deducibles del año" ayuda="Con sus % deducibles y las amortizaciones."><CampoEuros valor={entrada.gastos} onChange={set('gastos')} /></Campo>
        <Campo etiqueta="Retenciones de tus clientes"><CampoEuros valor={entrada.retenciones} onChange={set('retenciones')} /></Campo>
        <Campo etiqueta="Pagos del 130 hechos"><CampoEuros valor={entrada.pagos130} onChange={set('pagos130')} /></Campo>
      </div>
      {base ? <div className="acciones"><button className="secundario" onClick={() => { setEntrada(base); setVersion((v) => v + 1) }}>Volver a mis datos</button></div> : null}
      <Errores errores={errores} />
      {r && e ? (
        <>
          <div className="cifras" style={{ marginTop: 16 }}>
            <div className="cifra"><span>IRPF del año</span><strong>{euros(r.irpf)}</strong><small>Tipo medio {e.tipoMedio.toLocaleString('es-ES')} %</small></div>
            <div className="cifra"><span>Por cada 1.000 € más que factures</span><strong>{euros(r.porCadaMil)}</strong><small>de IRPF ({r.tipoMarginal.toLocaleString('es-ES')} % marginal)</small></div>
            <div className="cifra"><span>Te queda después de gastos e IRPF</span><strong>{euros(r.neto)}</strong><small>Sin contar el IVA, que no es tuyo</small></div>
            <div className="cifra"><span>{e.resultado >= 0 ? 'Renta: a pagar en junio' : 'Renta: a devolver'}</span><strong>{euros(Math.abs(e.resultado))}</strong><small>Tras retenciones y pagos del 130</small></div>
          </div>
          <table style={{ marginTop: 12 }}>
            <tbody>
              <tr><td>Rendimiento neto de la actividad (con el {e.actividades.some((a) => a.dificilJustificacion) ? '5 % de difícil justificación' : 'cálculo de la renta'})</td><td className="num">{euros(e.rendimientoActividades)}</td></tr>
              {e.reduccionActividad ? <tr><td>Reducción por rendimientos de actividades</td><td className="num">−{euros(e.reduccionActividad)}</td></tr> : null}
              <tr><td>Base liquidable general</td><td className="num">{euros(e.baseLiquidableGeneral)}</td></tr>
              <tr><td>Cuota estatal + autonómica ({e.comunidad})</td><td className="num">{euros(e.cuotaIntegra)}</td></tr>
              {e.deducciones ? <tr><td>Deducciones</td><td className="num">−{euros(e.deducciones)}</td></tr> : null}
              <tr><td>Retenciones y pagos a cuenta</td><td className="num">−{euros(e.retencionesActividad + e.retencionesOtras + e.pagos130 + e.otrosPagosACuenta)}</td></tr>
            </tbody>
          </table>
          {e.avisos.length ? <p className="nota">{e.avisos.join(' ')}</p> : null}
        </>
      ) : null}
    </div>
  )
}
