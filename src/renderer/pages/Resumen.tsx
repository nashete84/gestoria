import { useEffect, useState } from 'react'
import type { Resumen } from '../../core/db/repos'
import { api, llamar, mensajes } from '../api'
import { Icono, type NombreIcono } from '../iconos'
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
            <Cifra icono="ingresos" titulo="Ingresos (base)" valor={r.ingresosBase} />
            <Cifra icono="gastos" titulo="Gastos deducibles" valor={r.gastosDeducibles} />
            <Cifra icono="cartera" titulo="Rendimiento neto" valor={r.rendimientoNeto} />
            <Cifra icono="porcentaje" titulo="IVA repercutido" valor={r.ivaRepercutido} />
            <Cifra icono="porcentaje" titulo="IVA soportado deducible" valor={r.ivaSoportadoDeducible} />
            <Cifra icono="impuestos" titulo={r.ivaResultado >= 0 ? 'IVA a ingresar' : 'IVA a compensar'} valor={Math.abs(r.ivaResultado)} />
            <Cifra icono="balanza" titulo="Retenciones que te han hecho" valor={r.retencionesSoportadas} />
            <Cifra icono="balanza" titulo="Retenciones que debes ingresar" valor={r.retencionesPracticadas} />
          </div>
          <p className="nota">
            Cifras directas de tus ingresos y gastos. Los modelos (303, 130...), con amortizaciones, el 5 % de difícil
            justificación y los pagos de trimestres anteriores, están en Impuestos.
            {r.bienesInversionPendientes ? ` Hay ${r.bienesInversionPendientes} bien(es) de inversión pendientes de amortizar.` : ''}
          </p>
        </>
      ) : null}
    </section>
  )
}

function Cifra({ titulo, valor, icono }: { titulo: string; valor: number; icono: NombreIcono }) {
  return (
    <div className="cifra">
      <span className="cifra-titulo"><span className="cifra-icono"><Icono nombre={icono} tamano={16} /></span>{titulo}</span>
      <strong>{euros(valor)}</strong>
    </div>
  )
}
