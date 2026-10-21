import { useEffect, useState } from 'react'
import { retencionProfesional } from '../../core/fiscalidad'
import type { Perfil } from '../../core/tipos'
import { api, llamar, mensajes } from '../api'
import { Campo, Errores, hoy } from '../componentes'
import { EditorActividades } from './Actividades'

const VACIO: Perfil = {
  nif: '', nombre: '', domicilio: '', codigoPostal: '', municipio: 'Madrid', provincia: 'Madrid',
  email: '', telefono: '', iban: '',
  actividades: [],
  fechaAlta: '', actividadAnteriorAlAlta: false, regimenIrpf: 'EDS', regimenIva: 'general',
  altaRoi: false, comunidad: 'MD'
}

export function PaginaPerfil({ onGuardado }: { onGuardado: (p: Perfil) => void }) {
  const [p, setP] = useState<Perfil>(VACIO)
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

  const profesional = p.actividades.find((a) => a.seccion === 2)
  const retencion = p.fechaAlta && profesional ? retencionProfesional(p, hoy(), profesional.id) : null

  return (
    <section>
      <h1>Mi perfil fiscal</h1>
      <Errores errores={errores} />

      <h2>Datos personales</h2>
      <div className="rejilla">
        <Campo etiqueta="NIF"><input value={p.nif} onChange={(e) => set('nif', e.target.value)} /></Campo>
        <Campo etiqueta="Nombre y apellidos"><input value={p.nombre} onChange={(e) => set('nombre', e.target.value)} /></Campo>
        <Campo etiqueta="Apellidos (como en Hacienda)" ayuda="Se usan en los ficheros de los modelos: la AEAT los compara con tu NIF.">
          <input value={p.apellidos ?? ''} placeholder="GARCIA LOPEZ" onChange={(e) => set('apellidos', e.target.value)} />
        </Campo>
        <Campo etiqueta="Nombre (como en Hacienda)">
          <input value={p.nombrePila ?? ''} placeholder="IGNACIO" onChange={(e) => set('nombrePila', e.target.value)} />
        </Campo>
        <Campo etiqueta="Domicilio fiscal"><input value={p.domicilio} onChange={(e) => set('domicilio', e.target.value)} /></Campo>
        <Campo etiqueta="Código postal"><input value={p.codigoPostal} onChange={(e) => set('codigoPostal', e.target.value)} /></Campo>
        <Campo etiqueta="Municipio"><input value={p.municipio} onChange={(e) => set('municipio', e.target.value)} /></Campo>
        <Campo etiqueta="Provincia"><input value={p.provincia} onChange={(e) => set('provincia', e.target.value)} /></Campo>
        <Campo etiqueta="Email"><input type="email" value={p.email} onChange={(e) => set('email', e.target.value)} /></Campo>
        <Campo etiqueta="Teléfono"><input value={p.telefono} onChange={(e) => set('telefono', e.target.value)} /></Campo>
        <Campo etiqueta="IBAN (aparecerá en tus facturas)"><input value={p.iban} onChange={(e) => set('iban', e.target.value)} /></Campo>
      </div>

      <h2>Actividades (epígrafes del IAE)</h2>
      <EditorActividades actividades={p.actividades} onChange={(a) => set('actividades', a)} />

      <h2>Datos fiscales</h2>
      <div className="rejilla">
        <Campo etiqueta="Fecha de alta en la primera actividad">
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
        <Campo etiqueta="% de la vivienda donde trabajas" ayuda="m² del despacho ÷ m² de la vivienda. Sirve para deducir luz, agua, gas e internet de casa.">
          <input type="number" min={0} max={100} step="0.1" value={p.pctViviendaAfecta ?? 0}
            onChange={(e) => set('pctViviendaAfecta', Number(e.target.value))} />
        </Campo>
        <Campo etiqueta="Controlar impuestos desde" ayuda="Los modelos cuyo plazo terminó antes de esta fecha no aparecen.">
          <input type="date" value={p.inicioControl ?? `${hoy().slice(0, 4)}-01-01`} onChange={(e) => set('inicioControl', e.target.value)} />
        </Campo>
      </div>
      <p className="nota">
        Régimen: estimación directa simplificada · IVA régimen general · Comunidad de Madrid.
        {retencion ? ` Retención que aplican hoy tus clientes en actividades profesionales: ${retencion}%.` : ''}
      </p>

      <div className="acciones">
        <button onClick={guardar}>Guardar perfil</button>
        {guardado ? <span className="ok">Guardado</span> : null}
        <button className="secundario" onClick={() => llamar(api.abrirCarpetaDatos())}>Abrir carpeta de datos</button>
      </div>
    </section>
  )
}
