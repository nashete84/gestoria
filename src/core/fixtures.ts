import type { Perfil } from './tipos'

// Datos de prueba compartidos por los tests.
export const perfilBase: Perfil = {
  nif: '12345678Z', nombre: 'Nacho Prueba', domicilio: 'C/ Mayor 1', codigoPostal: '28013',
  municipio: 'Madrid', provincia: 'Madrid', email: '', telefono: '', iban: '',
  epigrafe: { seccion: 2, codigo: '763', descripcion: 'Programadores y analistas de informática' },
  fechaAlta: '2023-10-15', actividadAnteriorAlAlta: false,
  regimenIrpf: 'EDS', regimenIva: 'general', altaRoi: true, comunidad: 'MD'
}
