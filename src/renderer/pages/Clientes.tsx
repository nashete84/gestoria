import { useEffect, useState } from 'react'
import { ambitoDePais } from '../../core/fiscalidad'
import type { Cliente, ClienteNuevo } from '../../core/tipos'
import { api, llamar, mensajes } from '../api'
import { Campo, Errores } from '../componentes'

const VACIO: ClienteNuevo = {
  tipo: 'empresa', nombre: '', nif: '', pais: 'ES', domicilio: '', codigoPostal: '',
  municipio: '', provincia: '', email: '', notas: ''
}

const AMBITO = { nacional: 'España', ue: 'UE', extracomunitario: 'Fuera de la UE' }

export function PaginaClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [editando, setEditando] = useState<{ id: number | null; datos: ClienteNuevo } | null>(null)
  const [errores, setErrores] = useState<string[]>([])

  const cargar = () => llamar(api.listarClientes()).then(setClientes).catch((e) => setErrores(mensajes(e)))
  useEffect(() => { void cargar() }, [])

  const guardar = async () => {
    if (!editando) return
    try {
      if (editando.id === null) await llamar(api.crearCliente(editando.datos))
      else await llamar(api.actualizarCliente(editando.id, editando.datos))
      setEditando(null)
      setErrores([])
      await cargar()
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  const borrar = async (c: Cliente) => {
    if (!confirm(`¿Borrar a ${c.nombre}?`)) return
    try {
      await llamar(api.borrarCliente(c.id))
      await cargar()
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  const d = editando?.datos
  const set = <K extends keyof ClienteNuevo>(k: K, v: ClienteNuevo[K]) =>
    editando && setEditando({ ...editando, datos: { ...editando.datos, [k]: v } })
  const ambito = d ? ambitoDePais(d.pais) : 'nacional'

  return (
    <section>
      <div className="cabecera">
        <h1>Clientes</h1>
        <button onClick={() => { setEditando({ id: null, datos: VACIO }); setErrores([]) }}>Nuevo cliente</button>
      </div>
      <Errores errores={errores} />

      {d ? (
        <div className="tarjeta">
          <div className="rejilla">
            <Campo etiqueta="Tipo">
              <select value={d.tipo} onChange={(e) => set('tipo', e.target.value as ClienteNuevo['tipo'])}>
                <option value="empresa">Empresa o autónomo</option>
                <option value="particular">Particular</option>
              </select>
            </Campo>
            <Campo etiqueta="Nombre o razón social"><input value={d.nombre} onChange={(e) => set('nombre', e.target.value)} /></Campo>
            <Campo etiqueta="País (código ISO)" ayuda={AMBITO[ambito]}>
              <input value={d.pais} maxLength={2} onChange={(e) => set('pais', e.target.value.toUpperCase())} />
            </Campo>
            <Campo etiqueta={ambito === 'nacional' ? 'NIF' : ambito === 'ue' ? 'NIF-IVA (con prefijo de país)' : 'Identificador fiscal'}>
              <input value={d.nif} onChange={(e) => set('nif', e.target.value)} />
            </Campo>
            <Campo etiqueta="Domicilio"><input value={d.domicilio} onChange={(e) => set('domicilio', e.target.value)} /></Campo>
            <Campo etiqueta="Código postal"><input value={d.codigoPostal} onChange={(e) => set('codigoPostal', e.target.value)} /></Campo>
            <Campo etiqueta="Municipio"><input value={d.municipio} onChange={(e) => set('municipio', e.target.value)} /></Campo>
            <Campo etiqueta="Provincia o región"><input value={d.provincia} onChange={(e) => set('provincia', e.target.value)} /></Campo>
            <Campo etiqueta="Email"><input value={d.email} onChange={(e) => set('email', e.target.value)} /></Campo>
            <Campo etiqueta="Notas"><input value={d.notas} onChange={(e) => set('notas', e.target.value)} /></Campo>
          </div>
          <div className="acciones">
            <button onClick={guardar}>Guardar</button>
            <button className="secundario" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </div>
      ) : null}

      <table>
        <thead><tr><th>Nombre</th><th>NIF</th><th>Ámbito</th><th>Tipo</th><th /></tr></thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.id}>
              <td>{c.nombre}</td>
              <td>{c.nif}</td>
              <td>{AMBITO[ambitoDePais(c.pais)]} ({c.pais})</td>
              <td>{c.tipo === 'empresa' ? 'Empresa' : 'Particular'}</td>
              <td className="derecha">
                <button className="secundario" onClick={() => { const { id, ...datos } = c; setEditando({ id, datos }) }}>Editar</button>
                <button className="peligro" onClick={() => borrar(c)}>Borrar</button>
              </td>
            </tr>
          ))}
          {!clientes.length ? <tr><td colSpan={5} className="vacio">Aún no hay clientes.</td></tr> : null}
        </tbody>
      </table>
    </section>
  )
}
