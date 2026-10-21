import { useEffect, useState } from 'react'
import type { Perfil } from '../core/tipos'
import { api, llamar, mensajes } from './api'
import { Errores, hoy } from './componentes'
import { PaginaClientes } from './pages/Clientes'
import { PaginaGastos } from './pages/Gastos'
import { PaginaImpuestos } from './pages/Impuestos'
import { PaginaIngresos } from './pages/Ingresos'
import { PaginaPerfil } from './pages/Perfil'
import { PaginaRenta } from './pages/Renta'
import { PaginaResumen } from './pages/Resumen'

type Pagina = 'resumen' | 'impuestos' | 'renta' | 'ingresos' | 'gastos' | 'clientes' | 'perfil'

const MENU: { id: Pagina; nombre: string }[] = [
  { id: 'resumen', nombre: 'Resumen' },
  { id: 'impuestos', nombre: 'Impuestos' },
  { id: 'renta', nombre: 'Renta' },
  { id: 'ingresos', nombre: 'Ingresos' },
  { id: 'gastos', nombre: 'Gastos' },
  { id: 'clientes', nombre: 'Clientes' },
  { id: 'perfil', nombre: 'Mi perfil' }
]

export function App() {
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined)
  const [pagina, setPagina] = useState<Pagina>('resumen')
  const [errores, setErrores] = useState<string[]>([])
  const [pendientes, setPendientes] = useState(0)

  const contarPendientes = () =>
    llamar(api.calendarioFiscal(hoy()))
      .then((l) => setPendientes(l.filter((o) => !o.condicional && (o.estado === 'vencido' || o.estado === 'en_plazo')).length))
      .catch(() => setPendientes(0))
  useEffect(() => { if (perfil) void contarPendientes() }, [perfil, pagina])

  useEffect(() => {
    llamar(api.leerPerfil())
      .then((p) => { setPerfil(p); if (!p) setPagina('perfil') })
      .catch((e) => setErrores(mensajes(e)))
  }, [])

  if (perfil === undefined) return <main className="contenido"><Errores errores={errores} /></main>

  return (
    <div className="app">
      <nav>
        <div className="marca">Gestoría</div>
        {MENU.map((m) => (
          <button key={m.id} className={pagina === m.id ? 'activo' : ''} disabled={!perfil && m.id !== 'perfil'}
            onClick={() => setPagina(m.id)}>
            {m.nombre}
            {m.id === 'impuestos' && pendientes > 0 ? <span className="insignia">{pendientes}</span> : null}
          </button>
        ))}
        {perfil ? <div className="pie">{perfil.nombre}<br />IAE {perfil.actividades.map((a) => a.codigo).join(', ')}</div> : null}
      </nav>
      <main className="contenido">
        {!perfil ? <p className="avisos">Empieza rellenando tu perfil fiscal.</p> : null}
        {pagina === 'perfil' ? <PaginaPerfil onGuardado={setPerfil} /> : null}
        {perfil && pagina === 'resumen' ? <PaginaResumen /> : null}
        {perfil && pagina === 'impuestos' ? <PaginaImpuestos onCambio={contarPendientes} /> : null}
        {perfil && pagina === 'renta' ? <PaginaRenta /> : null}
        {perfil && pagina === 'ingresos' ? <PaginaIngresos perfil={perfil} /> : null}
        {perfil && pagina === 'gastos' ? <PaginaGastos perfil={perfil} /> : null}
        {perfil && pagina === 'clientes' ? <PaginaClientes /> : null}
      </main>
    </div>
  )
}
