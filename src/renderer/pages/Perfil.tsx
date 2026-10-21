import { useEffect, useState } from 'react'
import { buscarEpigrafes, nombreSeccion } from '../../core/epigrafes'
import { retencionProfesional } from '../../core/fiscalidad'
import type { Perfil } from '../../core/tipos'
import { api, llamar, mensajes } from '../api'
import { Campo, Errores, hoy } from '../componentes'

const VACIO: Perfil = {
  nif: '', nombre: '', domicilio: '', codigoPostal: '', municipio: 'Madrid', provincia: 'Madrid',
  email: '', telefono: '', iban: '',
  epigrafe: { seccion: 2, codigo: '763', descripcion: 'Programadores y analistas de informática' },
  fechaAlta: '', actividadAnteriorAlAlta: false, regimenIrpf: 'EDS', regimenIva: 'general',
  altaRoi: false, comunidad: 'MD'
}

export function PaginaPerfil({ onGuardado }: { onGuardado: (p: Perfil) => void }) {
  const [p, setP] = useState<Perfil>(VACIO)
  const [busqueda, setBusqueda] = useState('')
  const [errores, setErrores] = useState<string[]>([])
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    llamar(api.leerPerfil()).then((x) => x && setP(x)).catch((e) => setErrores(mensajes(e)))
  }, [])

  const set = <K extends keyof Perfil>(k: K, v: Perfil[K]) => {
    setP({ ...p, [k]: v })
    setGuardado(false)
  }

  const guardar = async () => {
    try {
      const r = await llamar(api.guardarPerfil(p))
      setErrores([])
      setGuardado(true)
      onGuardado(r)
    } catch (e) {
      setErrores(mensajes(e))
    }
  }

  const retencion = p.fechaAlta ? retencionProfesional(p, hoy()) : null

  return (
    <section>
      <h1>Mi perfil fiscal</h1>
      <Errores errores={errores} />

      <h2>Datos personales</h2>
      <div className="rejilla">
        <Campo etiqueta="NIF"><input value={p.nif} onChange={(e) => set('nif', e.target.value)} /></Campo>
        <Campo etiqueta="Nombre y apellidos"><input value={p.nombre} onChange={(e) => set('nombre', e.target.value)} /></Campo>
        <Campo etiqueta="Domicilio fiscal"><input value={p.domicilio} onChange={(e) => set('domicilio', e.target.value)} /></Campo>
        <Campo etiqueta="Código postal"><input value={p.codigoPostal} onChange={(e) => set('codigoPostal', e.target.value)} /></Campo>
        <Campo etiqueta="Municipio"><input value={p.municipio} onChange={(e) => set('municipio', e.target.value)} /></Campo>
        <Campo etiqueta="Provincia"><input value={p.provincia} onChange={(e) => set('provincia', e.target.value)} /></Campo>
        <Campo etiqueta="Email"><input type="email" value={p.email} onChange={(e) => set('email', e.target.value)} /></Campo>
        <Campo etiqueta="Teléfono"><input value={p.telefono} onChange={(e) => set('telefono', e.target.value)} /></Campo>
        <Campo etiqueta="IBAN (aparecerá en tus facturas)"><input value={p.iban} onChange={(e) => set('iban', e.target.value)} /></Campo>
      </div>

      <h2>Actividad</h2>
      <div className="rejilla">
        <Campo etiqueta="Buscar epígrafe IAE" ayuda="Catálogo reducido. Si el tuyo no aparece, escríbelo abajo.">
          <input value={busqueda} placeholder="763, programador..." onChange={(e) => setBusqueda(e.target.value)} />
        </Campo>
        <div className="sugerencias">
          {buscarEpigrafes(busqueda).map((e) => (
            <button key={e.seccion + e.codigo} className={p.epigrafe.codigo === e.codigo && p.epigrafe.seccion === e.seccion ? 'chip activo' : 'chip'}
              onClick={() => set('epigrafe', e)}>
              {e.codigo} · {e.descripcion} ({nombreSeccion(e.seccion)})
            </button>
          ))}
        </div>
        <Campo etiqueta="Sección">
          <select value={p.epigrafe.seccion}
            onChange={(e) => set('epigrafe', { ...p.epigrafe, seccion: Number(e.target.value) as 1 | 2 | 3 })}>
            <option value={1}>1 · Empresarial</option>
            <option value={2}>2 · Profesional</option>
            <option value={3}>3 · Artística</option>
          </select>
        </Campo>
        <Campo etiqueta="Código del epígrafe">
          <input value={p.epigrafe.codigo} onChange={(e) => set('epigrafe', { ...p.epigrafe, codigo: e.target.value })} />
        </Campo>
        <Campo etiqueta="Descripción">
          <input value={p.epigrafe.descripcion} onChange={(e) => set('epigrafe', { ...p.epigrafe, descripcion: e.target.value })} />
        </Campo>
        <Campo etiqueta="Fecha de alta en la actividad">
          <input type="date" value={p.fechaAlta} onChange={(e) => set('fechaAlta', e.target.value)} />
        </Campo>
        <label className="check">
          <input type="checkbox" checked={p.actividadAnteriorAlAlta}
            onChange={(e) => set('actividadAnteriorAlAlta', e.target.checked)} />
          Ya ejercía una actividad profesional el año anterior al alta
        </label>
        <label className="check">
          <input type="checkbox" checked={p.altaRoi} onChange={(e) => set('altaRoi', e.target.checked)} />
          Estoy dado de alta en el ROI (operador intracomunitario)
        </label>
        <label className="check">
          <input type="checkbox" checked={!!p.exento130} onChange={(e) => set('exento130', e.target.checked)} />
          No presento el 130 (el año pasado al menos el 70% de mis ingresos llevaron retención)
        </label>
        <Campo etiqueta="Controlar impuestos desde" ayuda="Los modelos cuyo plazo terminó antes de esta fecha no aparecen.">
          <input type="date" value={p.inicioControl ?? `${hoy().slice(0, 4)}-01-01`} onChange={(e) => set('inicioControl', e.target.value)} />
        </Campo>
      </div>
      <p className="nota">
        Régimen: estimación directa simplificada · IVA régimen general · Comunidad de Madrid.
        {retencion !== null && p.epigrafe.seccion === 2 ? ` Retención que aplican hoy tus clientes: ${retencion}%.` : ''}
      </p>

      <div className="acciones">
        <button onClick={guardar}>Guardar perfil</button>
        {guardado ? <span className="ok">Guardado</span> : null}
        <button className="secundario" onClick={() => llamar(api.abrirCarpetaDatos())}>Abrir carpeta de datos</button>
      </div>
    </section>
  )
}
