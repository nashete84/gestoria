import { useEffect, useState } from 'react'
import type { Perfil } from '../core/tipos'
import { api, llamar, mensajes } from './api'
import { resumirCobros } from '../core/cobros'
import { Errores, hoy } from './componentes'
import { Icono, type NombreIcono } from './iconos'
import { ChatAsistente } from './pages/Asistente'
import { PaginaBanco } from './pages/Banco'
import { PaginaClientes } from './pages/Clientes'
import { PaginaGastos } from './pages/Gastos'
import { PaginaImpuestos } from './pages/Impuestos'
import { PaginaIngresos } from './pages/Ingresos'
import { PaginaInformes } from './pages/Informes'
import { PaginaPerfil } from './pages/Perfil'
import { PaginaRenta } from './pages/Renta'
import { PaginaResumen } from './pages/Resumen'

type Pagina = 'resumen' | 'informes' | 'impuestos' | 'renta' | 'ingresos' | 'gastos' | 'banco' | 'clientes' | 'perfil'

const MENU: { id: Pagina; nombre: string; icono: NombreIcono }[] = [
  { id: 'resumen', icono: 'inicio', nombre: 'Resumen' },
  { id: 'informes', icono: 'informes', nombre: 'Informes' },
  { id: 'impuestos', icono: 'impuestos', nombre: 'Impuestos' },
  { id: 'renta', icono: 'renta', nombre: 'Renta' },
  { id: 'ingresos', icono: 'ingresos', nombre: 'Ingresos' },
  { id: 'gastos', icono: 'gastos', nombre: 'Gastos' },
  { id: 'banco', icono: 'banco', nombre: 'Banco' },
  { id: 'clientes', icono: 'clientes', nombre: 'Clientes' },
  { id: 'perfil', icono: 'perfil', nombre: 'Mi perfil' }
]

export function App() {
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined)
  const [pagina, setPagina] = useState<Pagina>('resumen')
  const [errores, setErrores] = useState<string[]>([])
  const [pendientes, setPendientes] = useState(0)
  const [cobrosVencidos, setCobrosVencidos] = useState(0)

  const contarPendientes = () =>
    llamar(api.calendarioFiscal(hoy()))
      .then((l) => setPendientes(l.filter((o) => o.ejercicio === Number(hoy().slice(0, 4)) && !o.condicional && (o.estado === 'vencido' || o.estado === 'en_plazo')).length))
      .catch(() => setPendientes(0))
  const contarCobros = () =>
    llamar(api.pendientesDeCobro()).then((l) => setCobrosVencidos(resumirCobros(l, hoy()).vencidos)).catch(() => setCobrosVencidos(0))
  useEffect(() => { if (perfil) { void contarPendientes(); void contarCobros() } }, [perfil, pagina])

  useEffect(() => {
    llamar(api.leerPerfil())
      .then((p) => { setPerfil(p); if (!p) setPagina('perfil') })
      .catch((e) => setErrores(mensajes(e)))
  }, [])

  if (perfil === undefined) return <main className="contenido"><Errores errores={errores} /></main>

  return (
    <div className="app">
      <nav>
        <div className="marca"><span className="logo"><Icono nombre="marca" tamano={18} /></span>Gestoría</div>
        {MENU.map((m) => (
          <button key={m.id} className={pagina === m.id ? 'activo' : ''} disabled={!perfil && m.id !== 'perfil'}
            aria-current={pagina === m.id ? 'page' : undefined} onClick={() => setPagina(m.id)}>
            <Icono nombre={m.icono} />
            <span className="nombre">{m.nombre}</span>
            {m.id === 'impuestos' && pendientes > 0 ? <span className="insignia" title={`${pendientes} modelo(s) pendientes`}>{pendientes}</span> : null}
            {m.id === 'ingresos' && cobrosVencidos > 0 ? <span className="insignia" title={`${cobrosVencidos} cobro(s) vencido(s)`}>{cobrosVencidos}</span> : null}
          </button>
        ))}
        {perfil ? (
          <div className="pie">
            <span className="avatar">{perfil.nombre.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')}</span>
            <span><strong>{perfil.nombre}</strong><br />IAE {perfil.actividades.map((a) => a.codigo).join(', ')}</span>
          </div>
        ) : null}
      </nav>
      <main className="contenido">
        {!perfil ? <p className="avisos">Empieza rellenando tu perfil fiscal.</p> : null}
        {pagina === 'perfil' ? <PaginaPerfil onGuardado={setPerfil} /> : null}
        {perfil && pagina === 'resumen' ? <PaginaResumen /> : null}
        {perfil && pagina === 'informes' ? <PaginaInformes /> : null}
        {perfil && pagina === 'impuestos' ? <PaginaImpuestos onCambio={contarPendientes} /> : null}
        {perfil && pagina === 'renta' ? <PaginaRenta /> : null}
        {perfil && pagina === 'ingresos' ? <PaginaIngresos perfil={perfil} onCambioCobros={contarCobros} /> : null}
        {perfil && pagina === 'gastos' ? <PaginaGastos perfil={perfil} /> : null}
        {perfil && pagina === 'banco' ? <PaginaBanco onCambio={contarCobros} /> : null}
        {perfil && pagina === 'clientes' ? <PaginaClientes /> : null}
      </main>
      <ChatAsistente />
    </div>
  )
}
