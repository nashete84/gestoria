import type { Modelo } from '../calendario'

/** Nombre corto de cada casilla para mostrarla en pantalla. Las que no estén aquí se muestran solo con su número. */
export const CASILLAS: Partial<Record<Modelo, Record<string, string>>> = {
  '303': {
    '150': 'Base al 0%', '152': 'Cuota al 0%',
    '01': 'Base al 4%', '03': 'Cuota al 4%', '04': 'Base al 10%', '06': 'Cuota al 10%', '07': 'Base al 21%', '09': 'Cuota al 21%',
    '10': 'Adquisiciones intracomunitarias: base', '11': 'Adquisiciones intracomunitarias: cuota',
    '12': 'Otras con inversión del sujeto pasivo: base', '13': 'Otras con inversión del sujeto pasivo: cuota',
    '27': 'Total cuota devengada',
    '28': 'Deducible, operaciones interiores corrientes: base', '29': 'Deducible, operaciones interiores corrientes: cuota',
    '30': 'Deducible, bienes de inversión interiores: base', '31': 'Deducible, bienes de inversión interiores: cuota',
    '36': 'Deducible, adquisiciones intracomunitarias corrientes: base', '37': 'Deducible, adquisiciones intracomunitarias corrientes: cuota',
    '38': 'Deducible, adquisiciones intracomunitarias de inversión: base', '39': 'Deducible, adquisiciones intracomunitarias de inversión: cuota',
    '45': 'Total a deducir', '46': 'Resultado régimen general',
    '59': 'Entregas y servicios intracomunitarios', '120': 'No sujetas por reglas de localización',
    '64': 'Suma de resultados', '65': '% atribuible al Estado', '66': 'Atribuible al Estado',
    '110': 'Cuotas a compensar de periodos anteriores', '78': 'Cuotas a compensar aplicadas', '87': 'Cuotas a compensar pendientes',
    '69': 'Resultado', '71': 'Resultado de la liquidación', '72': 'A compensar'
  },
  '130': {
    '01': 'Ingresos computables (acumulado)', '02': 'Gastos fiscalmente deducibles (acumulado)', '03': 'Rendimiento neto',
    '04': '20% del rendimiento neto', '05': 'Pagos fraccionados de trimestres anteriores', '06': 'Retenciones e ingresos a cuenta',
    '07': 'Pago fraccionado previo', '12': 'Total liquidación', '13': 'Minoración art. 110.3.c RIRPF',
    '14': 'Diferencia', '15': 'Resultados negativos de trimestres anteriores', '16': 'Deducción vivienda habitual',
    '17': 'Total', '18': 'A deducir (complementaria)', '19': 'Resultado'
  },
  '111': {
    '07': 'Actividades económicas: nº de perceptores', '08': 'Actividades económicas: importe de las percepciones',
    '09': 'Actividades económicas: retenciones', '28': 'Suma de retenciones', '29': 'A deducir (complementaria)', '30': 'Resultado a ingresar'
  },
  '115': {
    '01': 'Nº de perceptores', '02': 'Base de las retenciones', '03': 'Retenciones', '04': 'A deducir (complementaria)', '05': 'Resultado a ingresar'
  },
  '349': { operadores: 'Nº de operadores', importe: 'Importe total' },
  '347': { declarados: 'Nº de declarados', importe: 'Importe total' }
}

/** Casillas que no son importes en euros. */
export const NO_EUROS = new Set(['07@111', '01@115', 'operadores@349', 'declarados@347', '65@303', '02@303', '05@303', '08@303', '151@303'])
