import { useEffect, useState } from 'react'
import type { Perfil } from '../core/tipos'
import { api, llamar, mensajes } from './api'
import { Errores } from './componentes'
import { PaginaClientes } from './pages/Clientes'
import { PaginaGastos } from './pages/Gastos'
import { PaginaIngresos } from './pages/Ingresos'
import { PaginaPerfil } from './pages/Perfil'
import { PaginaResumen } from './pages/Resumen'

type Pagina = 'resumen' | 'ingresos' | 'gastos' | 'clientes' | 'perfil'

const MENU: { id: Pagina; nombre: string }[] = [
  { id: 'resumen', nombre: 'Resumen' },
  { id: 'ingresos', nombre: 'Ingresos' },
  { id: 'gastos', nombre: 'Gastos' },
  { id: 'clientes', nombre: 'Clientes' },
  { id: 'perfil', nombre: 'Mi perfil' }
]

export function App() {
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined)
  const [pagina, setPagina] = useState<Pagina>('resumen')
  const [errores, setErrores] = useState<string[]>([])

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
          </button>
        ))}
        {perfil ? <div className="pie">{perfil.nombre}<br />IAE {perfil.epigrafe.codigo}</div> : null}
      </nav>
      <main className="contenido">
        {!perfil ? <p className="avisos">Empieza rellenando tu perfil fiscal.</p> : null}
        {pagina === 'perfil' ? <PaginaPerfil onGuardado={setPerfil} /> : null}
        {perfil && pagina === 'resumen' ? <PaginaResumen /> : null}
        {perfil && pagina === 'ingresos' ? <PaginaIngresos perfil={perfil} /> : null}
        {perfil && pagina === 'gastos' ? <PaginaGastos /> : null}
        {perfil && pagina === 'clientes' ? <PaginaClientes /> : null}
      </main>
    </div>
  )
}
