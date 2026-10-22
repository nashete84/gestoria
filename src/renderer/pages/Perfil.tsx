import { useEffect, useState } from 'react'
import { retencionProfesional } from '../../core/fiscalidad'
import type { Perfil } from '../../core/tipos'
import { api, llamar, mensajes } from '../api'
import { Campo, Errores, hoy } from '../componentes'
import { EditorActividades } from './Actividades'
import { ImportarHistorico } from './Importar'
import { Icono } from '../iconos'

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
  const [retenidoAnterior, setRetenidoAnterior] = useState<number | null>(null)

  useEffect(() => {
    llamar(api.leerPerfil()).then((x) => x && setP(x)).catch((e) => setErrores(mensajes(e)))
    llamar(api.ingresosConRetencion(Number(hoy().slice(0, 4)) - 1)).then((r) => setRetenidoAnterior(r.pct)).catch(() => {})
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
        <Campo etiqueta="Pago fraccionado del IRPF (modelo 130)"
          ayuda={p.exento130 ? 'No tendrás avisos ni cálculos del 130: todo el IRPF que falte se paga en la renta.' : 'Cada trimestre adelantas el 20 % de tu beneficio.'}>
          <select value={p.exento130 ? 'no' : 'si'} onChange={(e) => set('exento130', e.target.value === 'no')}>
            <option value="si">Sí, presento el 130 cada trimestre</option>
            <option value="no">No, no fracciono (exento del 130)</option>
          </select>
        </Campo>
        <Campo etiqueta="% de la vivienda donde trabajas" ayuda="m² del despacho ÷ m² de la vivienda. Sirve para deducir luz, agua, gas e internet de casa.">
          <input type="number" min={0} max={100} step="0.1" value={p.pctViviendaAfecta ?? 0}
            onChange={(e) => set('pctViviendaAfecta', Number(e.target.value))} />
        </Campo>
        <Campo etiqueta="Controlar impuestos desde" ayuda="Los modelos cuyo plazo terminó antes de esta fecha no aparecen.">
          <input type="date" value={p.inicioControl ?? `${hoy().slice(0, 4)}-01-01`} onChange={(e) => set('inicioControl', e.target.value)} />
        </Campo>
      </div>
      {p.exento130 && retenidoAnterior !== null && retenidoAnterior < 70 ? (
        <p className="avisos">
          Ojo: solo puedes no presentar el 130 si el año pasado al menos el 70 % de tus ingresos llevaron retención.
          Según lo que tienes registrado de {Number(hoy().slice(0, 4)) - 1}, fue el {retenidoAnterior.toLocaleString('es-ES')} %
          (las facturas a clientes extranjeros y a particulares no llevan retención). Si no llegas al 70 %, Hacienda puede pedirte los 130 que faltan y multarte por no presentarlos.
        </p>
      ) : null}
      <p className="nota">
        Régimen: estimación directa simplificada · IVA régimen general · Comunidad de Madrid.
        {retencion ? ` Retención que aplican hoy tus clientes en actividades profesionales: ${retencion}%.` : ''}
      </p>

      <div className="acciones">
        <button onClick={guardar}><Icono nombre="guardar" />Guardar perfil</button>
        {guardado ? <span className="ok">Guardado</span> : null}
        <button className="secundario" onClick={() => llamar(api.abrirCarpetaDatos())}><Icono nombre="carpeta" />Abrir carpeta de datos</button>
      </div>

      {p.nif ? (
        <>
          <h2>Importar histórico de Declarando</h2>
          <ImportarHistorico />
        </>
      ) : null}
    </section>
  )
}
