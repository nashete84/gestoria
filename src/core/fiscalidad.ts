// Reglas fiscales del día a día: ámbito del cliente, retención de IRPF y IVA sugerido.
// Son sugerencias: el usuario siempre puede cambiarlas en el formulario.

import { porcentaje } from './money'
import { PAISES_UE } from './nif'
import type {
  Ambito, Cliente, Gasto, GastoNuevo, Ingreso, IngresoNuevo, OperacionIngreso, Perfil
} from './tipos'

export const IVA_GENERAL = 21
export const TIPOS_IVA = [21, 10, 4, 0] as const

export function ambitoDePais(pais: string): Ambito {
  const p = pais.toUpperCase()
  if (p === 'ES') return 'nacional'
  return (PAISES_UE as readonly string[]).includes(p) ? 'ue' : 'extracomunitario'
}

/**
 * Retención de IRPF que deben aplicar tus clientes empresarios españoles.
 * Profesionales (sección 2): 15%, o 7% el año de alta y los dos siguientes
 * si no se ejerció actividad profesional el año anterior al alta (art. 101.5 LIRPF).
 */
export function retencionProfesional(perfil: Perfil, fechaFactura: string): number {
  if (perfil.epigrafe.seccion !== 2) return 0
  const anioAlta = Number(perfil.fechaAlta.slice(0, 4))
  const anio = Number(fechaFactura.slice(0, 4))
  if (!perfil.actividadAnteriorAlAlta && anio >= anioAlta && anio <= anioAlta + 2) return 7
  return 15
}

export interface SugerenciaIngreso {
  operacion: OperacionIngreso
  tipoIva: number
  retencionPct: number
  avisos: string[]
}

export function sugerirFiscalidadIngreso(
  perfil: Perfil, cliente: Cliente | null, fecha: string
): SugerenciaIngreso {
  if (!cliente) {
    return { operacion: 'nacional', tipoIva: IVA_GENERAL, retencionPct: 0, avisos: [] }
  }
  const ambito = ambitoDePais(cliente.pais)
  const avisos: string[] = []

  if (ambito === 'nacional') {
    const retencionPct = cliente.tipo === 'empresa' ? retencionProfesional(perfil, fecha) : 0
    return { operacion: 'nacional', tipoIva: IVA_GENERAL, retencionPct, avisos }
  }

  if (ambito === 'ue') {
    if (cliente.tipo === 'empresa') {
      if (!perfil.altaRoi) {
        avisos.push('Para facturar sin IVA a una empresa de la UE necesitas estar dado de alta en el ROI (modelo 036).')
      }
      avisos.push('Comprueba el NIF-IVA del cliente en VIES antes de facturar sin IVA.')
      return { operacion: 'intracomunitaria', tipoIva: 0, retencionPct: 0, avisos }
    }
    avisos.push('Particular de la UE: por regla general se aplica IVA español. Si son servicios electrónicos, revisa el régimen OSS.')
    return { operacion: 'nacional', tipoIva: IVA_GENERAL, retencionPct: 0, avisos }
  }

  // Fuera de la UE: servicios a empresas no sujetos (art. 69.Uno LIVA).
  if (cliente.tipo === 'particular') {
    avisos.push('Particular fuera de la UE: los servicios de ingeniería, consultoría, tratamiento de datos o electrónicos no están sujetos (art. 69.Dos LIVA). Otros servicios sí llevan IVA.')
  }
  return { operacion: 'no_sujeta', tipoIva: 0, retencionPct: 0, avisos }
}

export function calcularIngreso(n: IngresoNuevo): Pick<Ingreso, 'cuotaIva' | 'cuotaRetencion'> {
  const tipoIva = n.operacion === 'nacional' ? n.tipoIva : 0
  return {
    cuotaIva: porcentaje(n.base, tipoIva),
    cuotaRetencion: porcentaje(n.base, n.retencionPct)
  }
}

export function calcularGasto(n: GastoNuevo): Pick<Gasto, 'cuotaIva' | 'cuotaRetencion'> {
  // En compras intracomunitarias y extracomunitarias con inversión del sujeto pasivo el proveedor
  // no repercute IVA, pero tú lo autoliquidas: se guarda la cuota para el 303 (devengado y deducible).
  const tipoIva = n.operacion === 'sin_iva' ? 0 : n.tipoIva
  return {
    cuotaIva: porcentaje(n.base, tipoIva),
    cuotaRetencion: porcentaje(n.base, n.retencionPct)
  }
}

export interface CategoriaGasto {
  id: string
  nombre: string
  deduciblePctIrpf: number
  deduciblePctIva: number
  operacion: GastoNuevo['operacion']
  tipoIva: number
  retencionPct: number
  ayuda: string
}

// Valores por defecto para estimación directa simplificada. El usuario los puede ajustar en cada gasto.
export const CATEGORIAS_GASTO: CategoriaGasto[] = [
  { id: 'cuota_autonomo', nombre: 'Cuota de autónomos (RETA)', deduciblePctIrpf: 100, deduciblePctIva: 0, operacion: 'sin_iva', tipoIva: 0, retencionPct: 0, ayuda: 'Deducible al 100%, sin IVA.' },
  { id: 'software', nombre: 'Software y suscripciones', deduciblePctIrpf: 100, deduciblePctIva: 100, operacion: 'nacional', tipoIva: 21, retencionPct: 0, ayuda: 'Si el proveedor es de la UE o de fuera (p. ej. Irlanda, EE. UU.), cambia el tipo de operación.' },
  { id: 'equipos', nombre: 'Equipos informáticos', deduciblePctIrpf: 100, deduciblePctIva: 100, operacion: 'nacional', tipoIva: 21, retencionPct: 0, ayuda: 'Más de 300 € y uso de más de un año: márcalo como bien de inversión.' },
  { id: 'telefono_internet', nombre: 'Teléfono e internet', deduciblePctIrpf: 50, deduciblePctIva: 50, operacion: 'nacional', tipoIva: 21, retencionPct: 0, ayuda: 'Si es de uso mixto, deduce solo la parte afecta a la actividad.' },
  { id: 'suministros_vivienda', nombre: 'Suministros de la vivienda (luz, agua, gas)', deduciblePctIrpf: 30, deduciblePctIva: 30, operacion: 'nacional', tipoIva: 21, retencionPct: 0, ayuda: 'IRPF: 30% sobre la proporción de vivienda afecta (art. 30.2.5ª LIRPF). Ajusta el % a tu caso.' },
  { id: 'alquiler_local', nombre: 'Alquiler de local u oficina', deduciblePctIrpf: 100, deduciblePctIva: 100, operacion: 'nacional', tipoIva: 21, retencionPct: 19, ayuda: 'Practicas retención del 19% al arrendador: va al modelo 115.' },
  { id: 'coworking', nombre: 'Coworking', deduciblePctIrpf: 100, deduciblePctIva: 100, operacion: 'nacional', tipoIva: 21, retencionPct: 0, ayuda: 'Normalmente es un servicio, no un alquiler: sin retención.' },
  { id: 'profesionales', nombre: 'Servicios de profesionales (gestoría, abogado...)', deduciblePctIrpf: 100, deduciblePctIva: 100, operacion: 'nacional', tipoIva: 21, retencionPct: 15, ayuda: 'Si el profesional te factura con retención, va al modelo 111.' },
  { id: 'formacion', nombre: 'Formación y libros', deduciblePctIrpf: 100, deduciblePctIva: 100, operacion: 'nacional', tipoIva: 21, retencionPct: 0, ayuda: 'Los libros llevan IVA del 4%.' },
  { id: 'seguros', nombre: 'Seguros', deduciblePctIrpf: 100, deduciblePctIva: 0, operacion: 'sin_iva', tipoIva: 0, retencionPct: 0, ayuda: 'Exentos de IVA. El seguro de salud propio deduce hasta 500 € al año.' },
  { id: 'bancos', nombre: 'Comisiones bancarias', deduciblePctIrpf: 100, deduciblePctIva: 0, operacion: 'sin_iva', tipoIva: 0, retencionPct: 0, ayuda: 'Exentas de IVA.' },
  { id: 'publicidad', nombre: 'Publicidad y marketing', deduciblePctIrpf: 100, deduciblePctIva: 100, operacion: 'nacional', tipoIva: 21, retencionPct: 0, ayuda: '' },
  { id: 'dietas', nombre: 'Dietas y viajes', deduciblePctIrpf: 100, deduciblePctIva: 100, operacion: 'nacional', tipoIva: 10, retencionPct: 0, ayuda: 'Solo en establecimientos de restauración, pagando por medios electrónicos y con límites diarios.' },
  { id: 'vehiculo', nombre: 'Vehículo y transporte', deduciblePctIrpf: 0, deduciblePctIva: 50, operacion: 'nacional', tipoIva: 21, retencionPct: 0, ayuda: 'En IRPF solo si el uso es exclusivo; en IVA se presume un 50%.' },
  { id: 'otros', nombre: 'Otros', deduciblePctIrpf: 100, deduciblePctIva: 100, operacion: 'nacional', tipoIva: 21, retencionPct: 0, ayuda: '' }
]
