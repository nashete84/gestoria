// Base de conocimiento del asistente: fichas cortas sobre cómo usar la app y sobre fiscalidad general
// del autónomo en estimación directa simplificada. Cada ficha fiscal cita su fuente.
// El asistente solo responde con lo que hay aquí: si una respuesta falta, se añade una ficha.
// Nada de esto depende de los datos del usuario.

export interface Fuente {
  nombre: string
  url: string
}

export interface Ficha {
  id: string
  tipo: 'app' | 'fiscal'
  titulo: string
  /** Palabras extra con las que alguien podría preguntar por esto. */
  claves: string
  texto: string
  fuentes: Fuente[]
}

const BOE = (id: string) => `https://www.boe.es/buscar/act.php?id=${id}`
const LIVA = (art: string): Fuente => ({ nombre: `Ley 37/1992 del IVA, ${art}`, url: BOE('BOE-A-1992-28740') })
const RIVA = (art: string): Fuente => ({ nombre: `Reglamento del IVA (RD 1624/1992), ${art}`, url: BOE('BOE-A-1992-28925') })
const LIRPF = (art: string): Fuente => ({ nombre: `Ley 35/2006 del IRPF, ${art}`, url: BOE('BOE-A-2006-20764') })
const RIRPF = (art: string): Fuente => ({ nombre: `Reglamento del IRPF (RD 439/2007), ${art}`, url: BOE('BOE-A-2007-6820') })
const RF = (art: string): Fuente => ({ nombre: `Reglamento de facturación (RD 1619/2012), ${art}`, url: BOE('BOE-A-2012-14696') })
const LGT = (art: string): Fuente => ({ nombre: `Ley 58/2003 General Tributaria, ${art}`, url: BOE('BOE-A-2003-23186') })
const SEDE: Fuente = { nombre: 'Sede electrónica de la AEAT', url: 'https://sede.agenciatributaria.gob.es/' }

export const FICHAS: Ficha[] = [
  // ---------- Cómo usar la app ----------
  {
    id: 'app-ingreso', tipo: 'app', titulo: 'Añadir un ingreso',
    claves: 'nuevo ingreso cobro venta factura emitida registrar apuntar',
    texto: 'Ve a la pestaña Ingresos y rellena el formulario: fecha, cliente (opcional), concepto, base imponible en euros, tipo de operación, IVA % y retención IRPF %. Pulsa Guardar. El IVA y la retención se calculan solos. Tipo de operación: "Con IVA español" para clientes de España; "Empresa UE (inversión del sujeto pasivo)" para empresas de otro país de la UE con NIF-IVA, sin IVA; "Fuera de la UE (no sujeta)" para clientes de fuera de la UE. Si tienes varias actividades, elige a cuál pertenece.',
    fuentes: []
  },
  {
    id: 'app-factura', tipo: 'app', titulo: 'Emitir una factura desde un ingreso',
    claves: 'hacer hago crear nueva factura pdf emitir numerar vista previa descargar facturar',
    texto: 'Guarda primero el ingreso. Después ábrelo en la lista de Ingresos: "Vista previa" muestra cómo quedará y "Descargar PDF" guarda un borrador. "Emitir factura" le da número y la deja cerrada; a partir de ahí no se puede borrar, solo anular. Las facturas emitidas tienen el botón PDF en la lista. Revisa antes en Mi perfil tu NIF, domicilio e IBAN, porque aparecen en la factura.',
    fuentes: []
  },
  {
    id: 'app-anular', tipo: 'app', titulo: 'Anular una factura',
    claves: 'anular factura error equivocada borrar factura rectificar',
    texto: 'Una factura emitida no se borra: ábrela desde Ingresos y pulsa "Anular factura". Queda en "Facturas anuladas" con su registro de anulación. Si te has equivocado en un importe, lo correcto suele ser una factura rectificativa (la app aún no las hace).',
    fuentes: []
  },
  {
    id: 'app-gasto', tipo: 'app', titulo: 'Añadir un gasto',
    claves: 'nuevo gasto compra pago factura recibida proveedor ticket apuntar',
    texto: 'Ve a la pestaña Gastos. Elige primero la categoría: rellena sola el IVA, los % deducibles y la retención típicos, y puedes cambiarlos. Después pon fecha, concepto y base imponible. El proveedor, su NIF y el nº de factura son opcionales, salvo el proveedor en gastos con retención o de la UE. Tipo de operación: "Proveedor español con IVA", "Proveedor UE sin IVA (autoliquidas)" o "Proveedor fuera de la UE (autoliquidas)" para compras sin IVA a empresas extranjeras, y "Sin IVA" para cuota de autónomos, seguros o comisiones. Pulsa Guardar.',
    fuentes: []
  },
  {
    id: 'app-adjuntos', tipo: 'app', titulo: 'Adjuntar la factura o el justificante',
    claves: 'adjuntar pdf foto justificante archivo guardar factura escaneada',
    texto: 'En el formulario de un ingreso o un gasto puedes adjuntar archivos (PDF, imagen o XML). La app copia el archivo a su carpeta de datos, así que puedes borrar el original. Para ver dónde están, Mi perfil → "Abrir carpeta de datos".',
    fuentes: []
  },
  {
    id: 'app-bien-inversion', tipo: 'app', titulo: 'Gastos que son bienes de inversión (ordenador, móvil...)',
    claves: 'ordenador portatil movil amortizar amortizacion bien inversion equipo mobiliario',
    texto: 'En el gasto, marca "bien de inversión" cuando la compra cuesta más de 300 € y la vas a usar más de un año. El IVA se deduce entero en el 303 del trimestre, pero en IRPF no se deduce de golpe: se amortiza cada año. La app calcula la amortización y la ves en la pestaña Renta.',
    fuentes: []
  },
  {
    id: 'app-retencion-gasto', tipo: 'app', titulo: 'Gastos con retención (alquiler de local, profesionales)',
    claves: 'retencion gasto alquiler local gestoria abogado 111 115 retener',
    texto: 'Si pagas a un profesional que te factura con retención, o alquilas un local, pon el % en "Retención que practicas %" del gasto. La app lo lleva al modelo 111 (profesionales) o al 115 (alquiler de local, categoría "Alquiler de local u oficina").',
    fuentes: []
  },
  {
    id: 'app-clientes', tipo: 'app', titulo: 'Añadir clientes (también extranjeros)',
    claves: 'cliente nuevo extranjero empresa particular nif vat pais',
    texto: 'Pestaña Clientes: tipo (empresa o particular), nombre, NIF, país con su código ISO de dos letras (ES, FR, DE, GB, US...) y dirección. Para empresas de la UE pon su NIF-IVA con el prefijo del país; para clientes de fuera de la UE, su identificador fiscal si lo tienen. Luego eliges el cliente al crear el ingreso.',
    fuentes: []
  },
  {
    id: 'app-impuestos', tipo: 'app', titulo: 'Pestaña Impuestos: modelos pendientes y presentados',
    claves: 'impuestos calendario plazos pendientes presentado marcar recordatorio vencido',
    texto: 'La pestaña Impuestos lista los modelos del año: pendientes de presentar, próximos y presentados, con su plazo. "Ver casillas" muestra el cálculo de cada modelo con tus datos. Cuando lo presentes en la Sede, pulsa "Marcar como presentado" e indica fecha, importe y el CSV o nº de justificante; si te equivocas, "Deshacer".',
    fuentes: []
  },
  {
    id: 'app-txt', tipo: 'app', titulo: 'Descargar el .txt de un modelo e importarlo en la Sede',
    claves: 'txt fichero importar sede presentar modelo descargar formulario',
    texto: 'En Impuestos → "Ver casillas" del modelo → "Descargar .txt para la Sede". Después entra en la Sede de la AEAT con tu certificado o Cl@ve, abre el formulario de presentación del modelo y usa la opción de importar fichero. Revisa todas las casillas y los avisos de la app antes de presentar: la app nunca presenta nada por ti.',
    fuentes: [SEDE]
  },
  {
    id: 'app-ajustes-modelos', tipo: 'app', titulo: 'Ajustes para calcular los modelos',
    claves: 'ajustes compensar año anterior devolucion rendimiento anterior casilla 13',
    texto: 'En Impuestos, "Ajustes para calcular los modelos" del ejercicio: lo que te quedó a compensar del 303 del año anterior, si quieres pedir la devolución o compensar cuando el 4T sale negativo, y el rendimiento neto del año anterior para la casilla 13 del 130 (vacío = lo calcula la app).',
    fuentes: []
  },
  {
    id: 'app-renta', tipo: 'app', titulo: 'Pestaña Renta: estimación de la declaración',
    claves: 'renta estimacion declaracion 100 hijos discapacidad plan pensiones',
    texto: 'La pestaña Renta estima tu declaración del año con tus ingresos, gastos, amortizaciones y pagos del 130. Añade en "Tus otros datos" lo que la app no sabe: año de nacimiento, otras rentas (por ejemplo, una nómina), rentas del ahorro, plan de pensiones, hijos que viven contigo, discapacidad y deducciones. Es una estimación: la declaración oficial se hace en Renta WEB.',
    fuentes: []
  },
  {
    id: 'app-perfil', tipo: 'app', titulo: 'Mi perfil: datos, actividades y vivienda',
    claves: 'perfil epigrafe iae actividad añadir cambiar vivienda despacho porcentaje datos',
    texto: 'En Mi perfil van tus datos personales (apellidos y nombre como en Hacienda), domicilio, IBAN y tus actividades (epígrafes del IAE): puedes añadir varias y elegir la principal. Cada actividad tiene sus % deducibles por categoría de gasto. "% de la vivienda donde trabajas" (m² del despacho ÷ m² de la casa) sirve para deducir los suministros de casa.',
    fuentes: []
  },
  {
    id: 'app-verifactu', tipo: 'app', titulo: 'VERI*FACTU en la app',
    claves: 'verifactu envio aeat registro huella qr enviar factura',
    texto: 'Cada factura emitida genera su registro VERI*FACTU (huella encadenada y código QR). El envío a la AEAT está desactivado: de momento las facturas son de prueba (serie PRUEBA) y no se envía nada.',
    fuentes: []
  },
  {
    id: 'app-copia', tipo: 'app', titulo: 'Dónde están mis datos y cómo hacer copia',
    claves: 'copia seguridad backup datos carpeta base datos exportar',
    texto: 'Todo se guarda en tu Mac, en la carpeta de datos de la app (Mi perfil → "Abrir carpeta de datos"): la base de datos y los archivos adjuntos. Para hacer una copia, copia esa carpeta con la app cerrada.',
    fuentes: []
  },
  {
    id: 'app-asistente', tipo: 'app', titulo: 'Qué hace este asistente',
    claves: 'asistente ia privacidad datos local ollama',
    texto: 'El asistente funciona en tu Mac con Ollama y no ve tus datos: solo conoce estas fichas de ayuda y de fiscalidad general. No presenta modelos ni crea ingresos o gastos. Para tu caso concreto, consulta a un asesor o a la AEAT.',
    fuentes: []
  },

  // ---------- IVA ----------
  {
    id: 'iva-tipos', tipo: 'fiscal', titulo: 'Tipos de IVA',
    claves: 'iva 21 10 4 tipo general reducido superreducido cuanto iva',
    texto: 'El tipo general del IVA es el 21%. Hay un tipo reducido del 10% (por ejemplo, hostelería y transporte de viajeros) y un superreducido del 4% (por ejemplo, libros, pan o medicamentos). Los servicios profesionales, como la programación o la consultoría, van al 21%.',
    fuentes: [LIVA('arts. 90 y 91')]
  },
  {
    id: 'iva-303', tipo: 'fiscal', titulo: 'Modelo 303: IVA trimestral',
    claves: '303 iva trimestral plazo cuando presentar abril julio octubre enero',
    texto: 'El 303 liquida el IVA del trimestre: el IVA que repercutes en tus facturas menos el IVA deducible de tus gastos. Se presenta del 1 al 20 de abril, julio y octubre, y del 1 al 30 de enero el del 4T. Si domicilias el pago, el plazo acaba unos días antes. Hay que presentarlo aunque salga a cero.',
    fuentes: [RIVA('art. 71'), SEDE]
  },
  {
    id: 'iva-compensar', tipo: 'fiscal', titulo: 'Si el 303 sale negativo: compensar o devolver',
    claves: 'negativo compensar devolucion devolver 303 saldo a favor',
    texto: 'Si en un trimestre deduces más IVA del que repercutes, el resultado negativo se compensa en los siguientes 303. Solo en el último periodo del año (4T) puedes elegir entre pedir la devolución o seguir compensando. El derecho a compensar caduca a los cuatro años.',
    fuentes: [LIVA('arts. 99.Cinco y 115')]
  },
  {
    id: 'iva-deducible', tipo: 'fiscal', titulo: 'Qué IVA puedo deducir',
    claves: 'deducir iva soportado deducible requisitos factura afecto',
    texto: 'Puedes deducir el IVA de los gastos afectos a tu actividad si tienes la factura completa a tu nombre y con tu NIF. Los bienes de uso mixto solo se deducen en la parte afecta; para los vehículos se presume un 50% de afectación. No se deduce el IVA de gastos personales, ni de regalos o atenciones a clientes.',
    fuentes: [LIVA('arts. 92, 95, 96 y 97')]
  },
  {
    id: 'iva-ue-servicios', tipo: 'fiscal', titulo: 'Facturar servicios a empresas de la UE',
    claves: 'ue europa empresa intracomunitaria vat roi vies sin iva inversion sujeto pasivo cliente europeo',
    texto: 'Un servicio a una empresa de otro país de la UE no lleva IVA español: lo autoliquida el cliente en su país (inversión del sujeto pasivo). Para facturar así, tú y el cliente tenéis que estar dados de alta en el Registro de Operadores Intracomunitarios (ROI), y el NIF-IVA del cliente tiene que ser válido en VIES. La factura debe decir "Inversión del sujeto pasivo". Estas operaciones van informativas en el 303 y en el 349.',
    fuentes: [LIVA('arts. 69 y 84'), RF('art. 6.1.m')]
  },
  {
    id: 'iva-fuera-ue', tipo: 'fiscal', titulo: 'Facturar a clientes de fuera de la UE',
    claves: 'fuera ue extranjero estados unidos reino unido uk usa no sujeta exportacion cliente extranjero',
    texto: 'Un servicio a una empresa de fuera de la UE (por ejemplo, EE. UU. o Reino Unido) no está sujeto al IVA español por las reglas de localización: la factura va sin IVA, con la mención de que la operación no está sujeta. Se informa en la casilla 120 del 303. Si el cliente es un particular, depende del tipo de servicio: consúltalo antes de facturar sin IVA.',
    fuentes: [LIVA('art. 69')]
  },
  {
    id: 'iva-compras-extranjero', tipo: 'fiscal', titulo: 'Compras sin IVA a empresas extranjeras (software, publicidad...)',
    claves: 'google meta amazon aws software extranjero autoliquidar factura sin iva irlanda compra extranjero',
    texto: 'Si una empresa extranjera te factura un servicio sin IVA (por ejemplo, desde Irlanda o EE. UU.), tú autoliquidas el IVA: lo declaras como devengado en el 303 y, si el gasto es deducible, lo deduces en la misma declaración, así que normalmente sale a cero. Si el proveedor es de la UE, también va en el 349.',
    fuentes: [LIVA('art. 84.Uno.2º')]
  },
  {
    id: 'iva-349', tipo: 'fiscal', titulo: 'Modelo 349: operaciones intracomunitarias',
    claves: '349 intracomunitario declaracion informativa trimestral ue',
    texto: 'El 349 es una declaración informativa con las operaciones con empresas de otros países de la UE: los servicios que les prestas y los que te prestan. Se presenta por trimestres, del 1 al 20 del mes siguiente (el 4T hasta el 30 de enero), solo en los periodos con operaciones.',
    fuentes: [RIVA('arts. 78 a 81'), SEDE]
  },
  {
    id: 'iva-390', tipo: 'fiscal', titulo: 'Modelo 390: resumen anual del IVA',
    claves: '390 resumen anual iva enero',
    texto: 'El 390 resume los 303 de todo el año. Se presenta del 1 al 30 de enero del año siguiente, junto con el 303 del 4T. No sale a pagar ni a devolver: solo informa.',
    fuentes: [RIVA('art. 71.4'), SEDE]
  },

  // ---------- IRPF ----------
  {
    id: 'irpf-retencion', tipo: 'fiscal', titulo: 'Retención en mis facturas (15% o 7%)',
    claves: 'retencion irpf factura 15 7 nuevo autonomo profesional retener',
    texto: 'Si eres profesional (sección 2 del IAE) y facturas a una empresa o autónomo de España, la factura lleva retención de IRPF del 15%. El año de alta y los dos siguientes puedes aplicar el 7% si no ejerciste actividad en el año anterior al alta; tienes que comunicárselo al cliente. A particulares y a clientes extranjeros no se les aplica retención.',
    fuentes: [LIRPF('art. 101.5'), RIRPF('art. 95.1')]
  },
  {
    id: 'irpf-130', tipo: 'fiscal', titulo: 'Modelo 130: pago fraccionado del IRPF',
    claves: '130 pago fraccionado irpf trimestral 20 por ciento exento 70',
    texto: 'En el 130 adelantas el 20% del rendimiento neto acumulado desde enero (ingresos menos gastos), restando lo pagado en los trimestres anteriores y las retenciones que te practicaron. Plazos: del 1 al 20 de abril, julio y octubre, y del 1 al 30 de enero. No estás obligado si el año anterior al menos el 70% de tus ingresos de la actividad llevaron retención.',
    fuentes: [LIRPF('art. 99.6'), RIRPF('arts. 109 a 112')]
  },
  {
    id: 'irpf-gastos', tipo: 'fiscal', titulo: 'Qué gastos se deducen en el IRPF',
    claves: 'gastos deducibles irpf requisitos que puedo deducir justificar',
    texto: 'Un gasto se deduce si está vinculado a la actividad, tienes la factura (o justificante) y está anotado en tus libros en el periodo en que se produce. Son habituales: cuota de autónomos, software, equipos (amortizados), formación, gestoría, publicidad, alquiler del local, seguros de la actividad y comisiones bancarias. Los gastos personales no se deducen.',
    fuentes: [LIRPF('arts. 28 y 30'), RIRPF('art. 30')]
  },
  {
    id: 'irpf-suministros', tipo: 'fiscal', titulo: 'Trabajar desde casa: luz, agua, gas e internet',
    claves: 'casa vivienda suministros luz agua gas internet teletrabajo domicilio 30',
    texto: 'Si trabajas en una parte de tu vivienda, en el IRPF puedes deducir el 30% de los suministros (luz, agua, gas, telefonía, internet) multiplicado por el porcentaje de la vivienda afecto a la actividad (m² del despacho ÷ m² totales), salvo que puedas probar un porcentaje mayor. La parte afecta de la vivienda también debe constar en tu declaración censal.',
    fuentes: [LIRPF('art. 30.2.5ª.b')]
  },
  {
    id: 'irpf-cuota', tipo: 'fiscal', titulo: 'La cuota de autónomos',
    claves: 'cuota autonomos reta seguridad social deducir',
    texto: 'La cuota de autónomos (RETA) es gasto deducible al 100% en el IRPF de la actividad. No lleva IVA, así que no aparece en el 303.',
    fuentes: [LIRPF('art. 30.2.1ª')]
  },
  {
    id: 'irpf-seguro-salud', tipo: 'fiscal', titulo: 'Seguro de salud',
    claves: 'seguro salud medico privado deducir 500',
    texto: 'Las primas del seguro de enfermedad del autónomo, su cónyuge e hijos menores de 25 que conviven con él se deducen hasta 500 € al año por persona (1.500 € si tiene discapacidad).',
    fuentes: [LIRPF('art. 30.2.5ª.a')]
  },
  {
    id: 'irpf-dietas', tipo: 'fiscal', titulo: 'Comidas y viajes (dietas)',
    claves: 'dietas comida restaurante viaje manutencion hotel desplazamiento',
    texto: 'Los gastos de manutención del autónomo se deducen si son en restaurantes u hostelería, se pagan por medios electrónicos y están ligados a la actividad, con un límite diario de 26,67 € en España y 48,08 € en el extranjero (53,34 € y 91,35 € si pernoctas en otro municipio). Los viajes y el alojamiento de la actividad se deducen con su factura.',
    fuentes: [LIRPF('art. 30.2.5ª.c'), RIRPF('art. 9')]
  },
  {
    id: 'irpf-vehiculo', tipo: 'fiscal', titulo: 'Coche',
    claves: 'coche vehiculo gasolina combustible parking moto',
    texto: 'En el IRPF, el coche y sus gastos solo se deducen si se usa exclusivamente para la actividad, algo muy difícil de probar salvo en casos como comerciales o transportistas. En el IVA se presume un 50% de afectación, que puedes deducir.',
    fuentes: [RIRPF('art. 22.4'), LIVA('art. 95.Tres')]
  },
  {
    id: 'irpf-dificil', tipo: 'fiscal', titulo: 'Gastos de difícil justificación',
    claves: 'dificil justificacion 5 por ciento 2000 estimacion directa simplificada',
    texto: 'En estimación directa simplificada se deduce además un porcentaje del rendimiento neto en concepto de gastos de difícil justificación, sin necesidad de facturas. La app usa el 5% con un máximo de 2.000 € al año (en 2023 fue del 7%). No se aplica si te acoges a la reducción de autónomo económicamente dependiente.',
    fuentes: [RIRPF('art. 30.2ª')]
  },
  {
    id: 'irpf-amortizacion', tipo: 'fiscal', titulo: 'Amortización de equipos',
    claves: 'amortizacion amortizar ordenador equipos tabla 26 coeficiente',
    texto: 'Los bienes de inversión se deducen poco a poco con la amortización, según la tabla de estimación directa simplificada. Por ejemplo, los equipos para procesos de información y las aplicaciones informáticas tienen un coeficiente máximo del 26% anual. El primer año se cuenta desde la fecha de puesta en funcionamiento.',
    fuentes: [RIRPF('art. 30.1ª'), { nombre: 'Orden de 27 de marzo de 1998 (tabla de amortización simplificada)', url: BOE('BOE-A-1998-7649') }]
  },
  {
    id: 'irpf-111-115', tipo: 'fiscal', titulo: 'Modelos 111 y 115: retenciones que practicas',
    claves: '111 115 retenciones practicadas alquiler profesional 190 180',
    texto: 'Si pagas a profesionales que te facturan con retención, ingresas esas retenciones con el 111; si alquilas un local, retienes el 19% y lo ingresas con el 115. Ambos son trimestrales (del 1 al 20 de abril, julio y octubre, y del 1 al 20 de enero) y solo se presentan en los trimestres con retenciones. En enero se presentan sus resúmenes anuales, 190 y 180.',
    fuentes: [RIRPF('arts. 100, 101 y 108'), SEDE]
  },
  {
    id: 'irpf-347', tipo: 'fiscal', titulo: 'Modelo 347: operaciones con terceros',
    claves: '347 terceros 3005 informativa febrero clientes proveedores',
    texto: 'El 347 informa de los clientes y proveedores con los que has operado más de 3.005,06 € en el año (IVA incluido). Se presenta en febrero. No se incluyen las operaciones que ya llevan retención ni las que van en el 349.',
    fuentes: [{ nombre: 'RD 1065/2007, arts. 31 a 35', url: BOE('BOE-A-2007-15984') }, SEDE]
  },
  {
    id: 'irpf-renta', tipo: 'fiscal', titulo: 'Declaración de la renta del autónomo',
    claves: 'renta declaracion anual 100 abril junio plazo',
    texto: 'Los rendimientos de la actividad se declaran en la renta (modelo 100) junto con el resto de rentas. La campaña suele ir de primeros de abril al 30 de junio del año siguiente. Los pagos del 130 y las retenciones de tus facturas se restan como pagos a cuenta.',
    fuentes: [LIRPF('arts. 96 y 97'), SEDE]
  },

  // ---------- Facturas y obligaciones generales ----------
  {
    id: 'fact-requisitos', tipo: 'fiscal', titulo: 'Qué debe llevar una factura',
    claves: 'factura requisitos datos obligatorios numero serie contenido',
    texto: 'Una factura completa lleva: número (y serie, si la hay) correlativo, fecha de expedición, nombre o razón social, NIF y domicilio de quien la emite y del cliente, descripción de la operación, base imponible, tipo y cuota de IVA, y la fecha de la operación si es distinta. Si va sin IVA, tiene que indicar el motivo (exención, inversión del sujeto pasivo o no sujeción).',
    fuentes: [RF('art. 6')]
  },
  {
    id: 'fact-verifactu', tipo: 'fiscal', titulo: 'Qué es VERI*FACTU',
    claves: 'verifactu ley antifraude software facturacion obligatorio cuando',
    texto: 'VERI*FACTU es el sistema de la AEAT para el software de facturación: cada factura genera un registro con una huella encadenada y un código QR, que se puede enviar a la AEAT en el momento. Lo regula el RD 1007/2023. La fecha de obligación se ha aplazado varias veces: compruébala en la web de la AEAT.',
    fuentes: [{ nombre: 'RD 1007/2023 (sistemas informáticos de facturación)', url: BOE('BOE-A-2023-24840') }, SEDE]
  },
  {
    id: 'gen-recargos', tipo: 'fiscal', titulo: 'Presentar un modelo fuera de plazo',
    claves: 'fuera plazo tarde recargo retraso sancion olvido',
    texto: 'Si presentas un modelo tarde por tu cuenta, sin requerimiento de Hacienda, no hay sanción, sino un recargo sobre lo que sale a pagar: 1% más otro 1% por cada mes completo de retraso. Pasados 12 meses, el recargo es del 15% más intereses de demora. Si la declaración no sale a pagar, puede haber una multa fija.',
    fuentes: [LGT('arts. 27 y 198')]
  },
  {
    id: 'gen-alta', tipo: 'fiscal', titulo: 'Alta, cambios de epígrafe y declaración censal',
    claves: 'alta autonomo 036 037 censal epigrafe cambiar actividad baja',
    texto: 'El alta, la baja y los cambios en Hacienda (por ejemplo, añadir un epígrafe del IAE, darte de alta en el ROI o cambiar de domicilio) se comunican con la declaración censal (modelo 036) en la Sede. En la Seguridad Social, el alta en el RETA es aparte.',
    fuentes: [{ nombre: 'RD 1065/2007, arts. 9 a 17', url: BOE('BOE-A-2007-15984') }, SEDE]
  }
]
