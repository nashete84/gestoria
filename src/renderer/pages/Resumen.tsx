import { useEffect, useState } from 'react'
import type { Resumen } from '../../core/db/repos'
import { api, llamar, mensajes } from '../api'
import { Errores, euros, periodoActual, rango, SelectorPeriodo, type Periodo } from '../componentes'

export function PaginaResumen() {
  const [periodo, setPeriodo] = useState<Periodo>(periodoActual())
  const [r, setR] = useState<Resumen | null>(null)
  const [errores, setErrores] = useState<string[]>([])

  useEffect(() => {
    const { desde, hasta } = rango(periodo)
    llamar(api.resumen(desde, hasta)).then(setR).catch((e) => setErrores(mensajes(e)))
  }, [periodo])

  return (
    <section>
      <div className="cabecera">
        <h1>Resumen</h1>
        <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />
      </div>
      <Errores errores={errores} />
      {r ? (
        <>
          <div className="cifras">
            <Cifra titulo="Ingresos (base)" valor={r.ingresosBase} />
            <Cifra titulo="Gastos deducibles" valor={r.gastosDeducibles} />
            <Cifra titulo="Rendimiento neto" valor={r.rendimientoNeto} />
            <Cifra titulo="IVA repercutido" valor={r.ivaRepercutido} />
            <Cifra titulo="IVA soportado deducible" valor={r.ivaSoportadoDeducible} />
            <Cifra titulo={r.ivaResultado >= 0 ? 'IVA a ingresar' : 'IVA a compensar'} valor={Math.abs(r.ivaResultado)} />
            <Cifra titulo="Retenciones que te han hecho" valor={r.retencionesSoportadas} />
            <Cifra titulo="Retenciones que debes ingresar" valor={r.retencionesPracticadas} />
          </div>
          <p className="nota">
            Cifras provisionales. Los modelos oficiales (303, 130...) llegarán en el paso 3, con amortizaciones,
            el 5% de gastos de difícil justificación y los pagos de trimestres anteriores.
            {r.bienesInversionPendientes ? ` Hay ${r.bienesInversionPendientes} bien(es) de inversión pendientes de amortizar.` : ''}
          </p>
        </>
      ) : null}
    </section>
  )
}

function Cifra({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="cifra">
      <span>{titulo}</span>
      <strong>{euros(valor)}</strong>
    </div>
  )
}
