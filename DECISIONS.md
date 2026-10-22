# Decisiones

## Paso 1: base y datos (2026-10-21)

**App de escritorio con Electron + TypeScript + React + SQLite local.**
- Elegido porque: es solo para un usuario en un Mac, los datos fiscales no salen del ordenador, y Node permite en el paso 2 hablar con los servicios SOAP de la AEAT usando el certificado digital.
- Descartado: Tauri (más ligero, pero el envío a VERI\*FACTU con certificado de cliente habría que hacerlo en Rust), app web con servidor (más trabajo y datos fiscales en la nube sin necesidad), app nativa Swift (solo Mac y más lenta de desarrollar).

**Importes en céntimos enteros.** Evita errores de coma flotante en IVA y retenciones. Redondeo a céntimos "half away from zero" en cada línea.

**La lógica fiscal vive en `src/core` y no depende de Electron.** Se puede testear con Vitest sin abrir la app; el proceso principal solo la conecta con la ventana.

**La interfaz no accede a Node ni a la base de datos.** `contextIsolation` y `sandbox` activados; el preload expone una lista cerrada de métodos y el proceso principal valida todo lo que recibe. Descartado: `nodeIntegration`, por seguridad.

**Errores como resultado, no como excepción, a través de IPC.** Electron pierde las propiedades de los errores al cruzar procesos; devolvemos `{ ok, datos | errores }` para que la interfaz muestre los mensajes en español.

**Perfil guardado como JSON en una fila.** Es un único registro que cambia poco; ahorra migraciones. Clientes, ingresos y gastos sí tienen columnas porque se filtran y suman.

**Migraciones con `PRAGMA user_version`.** Simple y suficiente para una base local. Regla: nunca editar una migración publicada, solo añadir.

**Fiscalidad sugerida, siempre editable.** Al elegir cliente se propone operación, IVA y retención según país y tipo:
- Empresa española: IVA 21% y retención 15% (7% el año de alta y los dos siguientes, art. 101.5 LIRPF).
- Empresa UE: inversión del sujeto pasivo, sin IVA; avisa si no hay alta en el ROI.
- Particular UE: IVA español (aviso sobre OSS para servicios electrónicos).
- Fuera de la UE: no sujeta (art. 69 LIVA); aviso para particulares, porque depende del tipo de servicio.

**Ingresos separados de facturas.** En el paso 1 se registran ingresos a mano; en el paso 2 las facturas generarán su ingreso (`factura_id`), que entonces no se podrá editar ni borrar (se corrige con rectificativa, como exige VERI\*FACTU).

**Adjuntos copiados a la carpeta de la app con su SHA-256 como nombre.** Si mueves o borras el original, el justificante sigue ahí; el mismo archivo adjuntado dos veces no se duplica. Solo se abren archivos dentro de esa carpeta.

**Catálogo de epígrafes IAE reducido.** Incluye el 763 (sección 2) y dos afines; se puede escribir cualquier otro. Descartado: cargar el catálogo completo ahora, porque no aporta para un único usuario y habría que mantenerlo.

**Resumen provisional.** Suma ingresos, gastos deducibles e IVA del periodo. No incluye amortizaciones, el 5% de gastos de difícil justificación ni pagos fraccionados previos: eso llega con los modelos en el paso 3.

## Supuestos sin confirmar
- Comunidad de Madrid, IVA régimen general, sin recargo de equivalencia.
- Gastos de suministros de vivienda al 30% por defecto (el % de vivienda afecta lo ajusta el usuario).
- Teléfono e internet al 50% por defecto.

## Pestaña Impuestos (2026-10-21)

**Calendario calculado, no guardado.** Las obligaciones se generan cada vez a partir del perfil, la fecha de hoy y los ingresos y gastos; solo se guardan las presentaciones. Así, si añades un gasto con retención, el 111 aparece solo. Descartado: guardar una lista de obligaciones, que se desincroniza con los datos.

**Qué modelos aparecen:**
- 303 siempre; 130 salvo que marques en el perfil que estás exento (70% de ingresos con retención el año anterior).
- 111, 115 y 349 solo en trimestres con operaciones (gastos con retención, alquiler con retención, operaciones UE). En trimestres aún abiertos aparecen como "solo si hay operaciones" si los tuviste en el último año.
- 190 y 180 si hubo 111 o 115 ese año; 347 si algún tercero nacional supera 3.005,06 € (sin contar operaciones con retención); 390 y renta siempre.

**Plazos generales con fin de semana trasladado al lunes.** Los festivos nacionales no se calculan; la renta usa 1 de abril a 30 de junio como aproximación. Descartado: descargar el calendario oficial de la AEAT, que no tiene un formato estable para leerlo.

**"Controlar desde" filtra por fin de plazo.** Aparece todo lo que vencía a partir de esa fecha (por defecto, 1 de enero del año en curso), aunque el periodo sea anterior: así el 4T del año pasado y la renta salen en el año en que se presentan.

**Aviso al abrir la app** con una notificación del sistema si hay modelos vencidos o que vencen en 10 días, y un contador en la pestaña. Descartado: notificaciones con la app cerrada, que exigiría un proceso en segundo plano.

**Presentaciones únicas por modelo y periodo.** Una complementaria o sustitutiva se registrará en el paso 3, cuando la app genere los modelos.

## Facturas y VERI*FACTU, sin envío (2026-10-21)

**Nada se envía a la AEAT.** Nacho pidió que no se envíe nada hasta que lo autorice. `ENVIO_HABILITADO = false` en `src/core/verifactu.ts` y el botón "Enviar a VERI*FACTU" queda desactivado; un test falla si alguien lo activa sin cambiarlo a propósito. El cliente SOAP con certificado se escribirá cuando lo autorice.

**Entorno de prueba con serie y cadena propias.** Las facturas se numeran `PRUEBA-AAAA-NNNN`, el PDF lleva la marca "PRUEBA · NO ENVIADA A LA AEAT" y el QR apunta al validador de pruebas. Al pasar a producción, la serie será `AAAA-NNNN` y la cadena de huellas empezará de cero. Descartado: usar la serie real durante las pruebas, que obligaría a anular facturas reales.

**La factura sale de un ingreso.** "Emitir factura" numera el ingreso, guarda una copia fija de emisor y cliente y genera el registro de alta. Una línea por factura (la del ingreso). Descartado por ahora: facturas de varias líneas, que exigen cambiar el modelo de ingresos.

**Borrar una factura = anularla.** En VERI*FACTU las facturas no se borran: se genera un registro de anulación encadenado, la factura queda como "anulada" (con su PDF) y se borra el ingreso. El aviso explica que la anulación es para facturas emitidas por error; si la operación existió, corresponde una rectificativa (pendiente).

**Registros inmutables.** Triggers de SQLite impiden modificar o borrar `registros_verifactu`. La huella es SHA-256 en hexadecimal mayúsculas sobre `IDEmisorFactura=…&NumSerieFactura=…&FechaExpedicionFactura=DD-MM-AAAA&TipoFactura=…&CuotaTotal=…&ImporteTotal=…&Huella=<anterior>&FechaHoraHusoGenRegistro=…` (anulación: con los campos `…Anulada`, sin tipo ni importes).

**Calificación del IVA:** nacional S1; servicios a empresas UE y fuera de la UE N2 (no sujeta por reglas de localización), con la mención de inversión del sujeto pasivo en la factura UE.

**Supuestos sin confirmar con la especificación oficial** (el servidor de la AEAT no era accesible desde el entorno de desarrollo; se tomaron de la descripción de servicios web y de documentación de terceros):
- `ImporteTotal` = base + IVA, sin restar la retención de IRPF.
- Destinatario extranjero: `IDType` 02 (NIF-IVA) para empresas UE y 06 para el resto.
- `Impuesto` 01 y `ClaveRegimen` 01 en todas las líneas.
Hay que validar el XML contra los XSD oficiales antes de activar el envío.

**PDF con Electron (`printToPDF`) en una ventana oculta sin JavaScript.** Sin dependencias extra salvo `qrcode` (nivel de corrección M). QR arriba a la izquierda con "QR tributario:" y "VERI*FACTU", como pide la AEAT.

## Clientes extranjeros sin identificador y vista previa (2026-10-21)

**Clientes extranjeros sin identificador fiscal.** Se pueden facturar; el registro VERI*FACTU omite el bloque `Destinatarios`. Los clientes españoles siguen necesitando NIF, y las empresas de la UE su NIF-IVA (sin él no se puede aplicar la inversión del sujeto pasivo). Supuesto pendiente de validar contra el XSD: que la AEAT acepta una F1 sin destinatario para clientes extranjeros; si no, la alternativa es emitirla como simplificada (F2) cuando el importe lo permita.

**Vista previa antes de emitir.** "Vista previa de factura" guarda el ingreso, muestra la factura con el número que le tocaría, marca "BORRADOR · SIN EMITIR" y sin QR, y permite descargarla en PDF o emitirla desde ahí. No guarda nada ni consume número. Se muestra en un iframe con `sandbox` (sin scripts).

## % deducible según el epígrafe y factura al crear el gasto (2026-10-21)

**El % deducible se calcula al elegir la categoría** (`src/core/deducibles.ts`) a partir del epígrafe y del perfil, y se explica debajo del formulario. Se puede cambiar a mano y volver al calculado.
- Suministros de casa: IRPF 30% × % de vivienda afecta (art. 30.2.5ª LIRPF); IVA en la proporción afecta. Nuevo campo en el perfil: "% de la vivienda donde trabajas". Sin él, 0%.
- Equipos y software: 100% en epígrafes de informática (763 sección 2, 845 sección 1).
- Vehículo: 0% IRPF y 50% IVA; 100% en agentes comerciales (511) y transporte (721, 722), art. 22.4 RIRPF.
- Teléfono e internet: 50% por uso mixto.
- Resto: el valor por defecto de la categoría.
Los gastos ya guardados no se recalculan. Descartado: una tabla completa por epígrafe del IAE, que no aporta para un único usuario.

**Adjuntar la factura antes de guardar el gasto.** El diálogo de archivos lo abre el proceso principal y devuelve fichas aleatorias; al guardar, la interfaz pasa las fichas y el proceso principal copia solo esos archivos. La interfaz nunca envía rutas.

## Actividades dinámicas (2026-10-21)

**El perfil tiene una lista de actividades (epígrafes), una principal.** Cada actividad guarda su propia tabla de % deducibles por categoría de gasto, editable en *Mi perfil*. Ingresos y gastos se asignan a una actividad (por defecto, la principal): la retención sale de la sección de esa actividad y el % deducible de su tabla.

**Ninguna regla fija por epígrafe en el código.** El catálogo (`src/core/epigrafes.ts`) es solo datos: propone los % iniciales al dar de alta una actividad (p. ej. 763 → equipos y software al 100%; 511, 721 y 722 → vehículo al 100%). Después manda lo que guarde el usuario. "Restablecer valores propuestos" vuelve a los del catálogo.

**Suministros de casa como fórmula de la categoría**, no del epígrafe: el % de la actividad (30% IRPF, 100% IVA por defecto) se aplica sobre el % de vivienda afecta del perfil.

**Migración sin pérdida.** Los perfiles guardados con un solo `epigrafe` se convierten al leerlos en una actividad principal con id `a1`; los ingresos y gastos existentes quedan en la principal (`actividad_id` nulo). No se puede quitar una actividad que tenga ingresos o gastos.

**La fecha de alta sigue siendo una** (la de la primera actividad), porque decide la retención reducida del 7%. Descartado: fecha de alta por actividad, que no cambia ningún cálculo actual.

## Pestaña Renta (2026-10-21)

**Estimación del modelo 100 como función pura** (`src/core/renta/calculo.ts`), alimentada con los ingresos y gastos del año, los 130 marcados como presentados y unos pocos datos que el usuario rellena por ejercicio (tabla `renta_datos`, migración 5).

**Parámetros como datos por año** (`src/core/renta/parametros.ts`): escalas estatal y de Madrid, escala del ahorro (2025 sube el último tramo estatal al 15%), mínimos personales y familiares, 5% de difícil justificación (máx. 2.000 €), reducciones del art. 32.2, límites de planes de pensiones y coeficientes de amortización. Un año sin parámetros usa los del último disponible y lo avisa. Descartado: valores en el código del cálculo.

**Cálculo:**
- Rendimiento por actividad: ingresos − gastos corrientes × % deducible − amortizaciones − 5%. El máximo de 2.000 € es conjunto y se reparte en proporción.
- Amortización lineal al coeficiente máximo de la tabla simplificada (equipos y software 26%, vehículo 16%, resto 10%), prorrateada por días el primer año; los bienes de años anteriores siguen amortizándose.
- Reducción art. 32.2.3º (rentas < 12.000 €: 1.620 € o 1.620 − 0,405 × (rentas − 8.000)) automática. La del 32.2.2º (autónomo dependiente: 2.000 + hasta 6.498 €) solo si el usuario marca que cumple los requisitos, y entonces no hay 5%. No se comprueban los requisitos: dependen de datos que la app no tiene. Con clientes extranjeros sin retención no se cumple el 70%.
- Mínimo personal y familiar: se resta como cuota de la escala sobre el mínimo, primero en la base general y lo que sobre en la del ahorro; separado para el tramo estatal y el autonómico.
- Resultado: cuota líquida − retenciones de facturas − otras retenciones − 130 con resultado "a ingresar" − otros pagos.

**Fuera de alcance (avisado en pantalla):** declaración conjunta, rentas inmobiliarias, compensación de pérdidas, deducciones concretas (se introduce un total), límite conjunto de 3.700 € con la reducción de trabajo y el detalle de la reducción por rendimientos del trabajo (se introduce el neto reducido).

**Pendiente de verificar:** mínimos personales y familiares de Madrid (puestos un 10% por encima de los estatales).

**Discapacidad y dependencia (2026-10-21).** Para ti y para cada hijo: grado (no / 33-64% / 65% o más) y "dependencia" (ayuda de terceros o movilidad reducida). Mínimo de 3.000 € o 9.000 €, más 3.000 € de asistencia si el grado es del 65% o hay dependencia (art. 60 LIRPF). Los hijos con discapacidad cuentan a cualquier edad. Los importes de Madrid (un 10% más) están pendientes de verificar. Fuera de alcance: ascendientes.

## Cálculo de los modelos (2026-10-21)

**Primero las casillas y después el fichero.** El cálculo (`src/core/modelos/`) no depende del formato del .txt: se puede revisar en pantalla ("Ver casillas" en Impuestos) y prellena el importe al marcar como presentado. El .txt se generará con los diseños de registro oficiales cuando estén disponibles. Descartado: escribir las posiciones de memoria o de fuentes no oficiales.

- **303**: devengado por tipo (4, 10, 21 y 0%), inversión del sujeto pasivo (10-13) también como deducible (36-39 o 28-31), bienes de inversión en 30-31/38-39, % de IVA deducible del gasto, informativas 59 (UE) y 120 (no sujetas, p. ej. UK). Las cuotas a compensar se arrastran desde el 1T (ajuste manual del saldo inicial). 4T negativo: devolución o compensar según el ajuste.
- **130**: acumulado desde enero con amortizaciones prorrateadas hasta fin de trimestre y 5% de difícil justificación; 05 = suma de 07 positivos anteriores; minoración de la casilla 13 según el rendimiento del año anterior (manual, calculado con la app, o 0 si el alta es de este año); negativos de trimestres anteriores en 15. Tramos de la minoración como datos en los parámetros por año.
- **111/115**: retenciones practicadas en gastos (115 = categoría alquiler de local).
- **349**: por operador y clave; ingresos intracomunitarios S, gastos I (A si son equipos).
- **347**: terceros nacionales sin retención por encima de 3.005,06 € con IVA, por trimestres. Fuera: cuota de autónomos (Seguridad Social). También se quitó del aviso del calendario.
- **390**: ver "Ficheros .txt de los modelos".

**Ajustes manuales por ejercicio** (tabla `modelos_ajustes`, migración 6): saldo a compensar del 303 al empezar el año, devolución o compensación del 4T y rendimiento del año anterior.

## Ficheros .txt de los modelos (2026-10-21)

**349 y 347 con su diseño oficial** (PDF de la AEAT: Anexo Orden HAC/174/2020 y diseño del 347 para 2025 y siguientes). Registros de 500 posiciones en ISO-8859-1, separados por CR+LF (el diseño no dice nada de separadores; es lo habitual en la presentación por fichero). Los tests comprueban las posiciones campo a campo.
- Número identificativo de la declaración: modelo + ejercicio + periodo + secuencia (13 dígitos).
- Nombre del declarante: apellidos y nombre del perfil (ver abajo); si faltan, se usa el nombre y se avisa.
- 347: los proveedores no tienen provincia en la app; se pone 00 y se avisa para corregirla en la Sede. Descartado de momento: añadir la provincia al gasto.

**303, 130, 111, 115 y 390 con sus diseños oficiales en Excel** (DR303e26v101, DR130e15v12, dr111e16v18, DR115e15v13, dr390e2025), descargados por Nacho porque la red de la nube no llega a la AEAT.
- `scripts/extraer-disenos.py` los convierte a JSON (`src/core/modelos/disenos/`) y un motor genérico (`posicional.ts`) escribe cada campo: valor a mano, constante del diseño, importe de su casilla o ceros/blancos. Comprueba que cada página es contigua y que los números caben. Descartado: escribir las posiciones a mano en el código (cientos de campos en el 390, y cambian cada año: basta volver a pasar el script).
- Casillas que el Excel no numera o numera mal (todo el 111, el 130 y el campo 16 del 115): corregidas en el script; en los tres, el campo n es la casilla n - 11.
- **Validado contra ficheros reales** guardados desde el formulario de la AEAT (303 3T 2026 y 390 2025 de Nacho, que no se suben al repo): el 303 sale idéntico byte a byte salvo el bloque AUX; el 390, salvo el AUX y el bloque del representante. Las marcas que el formulario rellena y el diseño no explica (situaciones del 303 "223222222", tipo 0,5 % del recargo, ceros en el 390) se copian de esos ficheros.
- Bloque AUX: versión "v1.0" y el NIF del declarante como "empresa de desarrollo" (el formulario pone "v2.0" y 12345678Z). Pendiente de confirmar que la Sede lo acepta al importar.
- Tipo de declaración: 303 I/C/D/N, 130 I/B/N, 111 y 115 I/N. Sin domiciliación (U): se elige en el formulario. 303 "sin actividad" (X) cuando sale a cero sin IVA devengado ni deducible. Devolución: IBAN del perfil y marca SEPA 1 (cuenta española).
- Diseño por año: el 303 es el de 2026 y el 390 el de 2025; con otro ejercicio el fichero avisa de que puede haber cambiado.

**390 calculado a partir del año y de los cuatro 303.** Devengado y deducible por tipo con la numeración propia del 390; compras intracomunitarias: bienes de inversión como bienes y el resto como servicios (igual que en el 349). 85 = compensación del año anterior aplicada (se gasta antes que la del propio año), 95 = suma de los 303 a ingresar, 97/98 del 4T y 662 = lo generado en el año que queda pendiente fuera del 97; si 86 no cuadra con 95 − 97 − 98 − 662 se avisa. Datos estadísticos: hasta seis actividades del perfil con su epígrafe; clave A05 para profesionales (la que puso la AEAT en el 390 de 2025 de Nacho), A01 para empresariales sin verificar. Sin bloque de representante (no hace falta si presentas tú). Descartado: pedir el 390 a mano como resumen de los 303 presentados.

**Apellidos y nombre por separado en el perfil** (sustituye a "Nombre para Hacienda"): el 130, 111, 115 y 390 los piden en campos distintos. Un perfil antiguo se convierte solo: la última palabra pasa a nombre.

## Asistente de IA (2026-10-21)

**Qué hace:** responde dudas generales de Hacienda y de cómo usar la app, citando la fuente. No ve los datos del usuario y no hace acciones (lo pidió así Nacho). Descartado: darle acceso a los datos y dejarle crear gastos o ingresos.

**Modelo dentro de la app** (elección de Nacho): llama.cpp mediante `node-llama-cpp` (binarios precompilados, Metal en Mac; `build: 'never'` para no compilar nunca) con **Qwen3 4B Instruct 2507** en GGUF Q4_K_M (unsloth, licencia Apache, sin registro), unos 2,5 GB y 8 GB de RAM. Se descarga una vez a la carpeta de datos (`modelos/`) desde la pestaña Asistente, se puede pausar y continúa donde iba. Después funciona sin conexión. Descartados: Ollama aparte (Nacho prefirió no instalar nada más), la API de Claude (sus datos y preguntas saldrían del Mac), meter el modelo en el instalador (pesaría 2,5 GB más en cada actualización) y modelos con modo de razonamiento (más lentos; igualmente se quita cualquier `<think>`).

**Base de conocimiento propia** (`src/core/asistente/conocimiento.ts`): guías de la app y fichas fiscales con su artículo y enlace al BOE o a la Sede. Por cada pregunta, un buscador BM25 (raíces de 4 letras, sin acentos) elige hasta 4 fichas y solo esas van al modelo, con la orden de no salirse de ellas y de citar [n]. La app muestra las fuentes de las fichas citadas, no las que el modelo diga. Así un modelo pequeño no se inventa plazos ni porcentajes, y para cubrir una duda nueva basta añadir una ficha. Descartado: embeddings (otro modelo que descargar, y con 40 fichas no hace falta).

**Límites:** historial de los últimos 4 turnos, respuestas de 700 tokens como máximo, temperatura 0,2, una pregunta cada vez. La conversación no se guarda en disco.

**Sin probar con el modelo real:** la nube no llega a Hugging Face, así que el motor se ha probado cargando llama.cpp (Linux) y la conversación con un motor simulado. Falta la primera prueba en el Mac.

**Chat flotante (2026-10-21, a petición de Nacho):** el asistente pasa de pestaña a un botón redondo abajo a la derecha que abre una ventana de chat en cualquier pantalla. La conversación se mantiene al cambiar de pantalla y se borra al cerrar la app.

## Informes y simulador de IRPF (2026-10-21)

**Pestaña Informes con tres vistas** (gastos e ingresos, previsión de ingresos, impuestos) y un año a elegir. Gráficos en SVG propio, sin librería: columnas finas, tooltip al pasar el ratón, leyenda y botón "Ver tabla"; azul para ingresos y naranja para gastos (pareja validada para daltonismo en modo claro y oscuro). Descartado: Recharts o Chart.js (dependencia más para dos gráficos).

**Gastos e ingresos:** importes sin IVA y gastos completos, sin aplicar el % deducible (es lo que sale de tu bolsillo; lo deducible ya está en Renta). Bienes de inversión en el mes de compra. Reparto por categoría y por cliente (más de 8 se agrupan en "Otros"). En el año en curso se compara con el año anterior hasta la misma fecha, para no comparar 10 meses con 12.

**Previsión (supuesta opción 1a, pendiente de confirmar por Nacho):** la media de los últimos 6 meses completos se repite hasta diciembre; en el mes en curso, solo lo que falta para llegar a esa media. Si el alta es reciente se usan menos meses y se avisa con menos de 3. Gastos igual. Con eso se calcula el IRPF del año y lo que falta por pagar. Un año cerrado no tiene previsión. Descartados: misma cifra que el año anterior (falla el primer año y si cambias de clientes) e introducirla a mano (queda en el simulador).

**Impuestos:** por trimestre hasta el actual, el importe presentado si está marcado como presentado y, si no, el calculado con tus datos; la renta, con la estimación de la pestaña Renta. 111 y 115 solo si salen distintos de cero. Retenciones de clientes aparte, porque ya están pagadas.

**Simulador de IRPF en la pestaña Impuestos (supuesta opción 3a, "¿y si…?"):** cuatro importes del año (ingresos, gastos deducibles, retenciones, 130) que empiezan con lo registrado más la previsión, y el resto de datos de la pestaña Renta. Reutiliza el mismo cálculo de la renta, así que no hay dos fórmulas que puedan dar cifras distintas. Muestra IRPF, cuánto más pagas por cada 1.000 € extra (tipo marginal), lo que te queda y el resultado de la renta.

**Pago fraccionado (130) sí/no en el perfil (2026-10-21, a petición de Nacho).** Ya existía como casilla ("No presento el 130"); ahora es un desplegable visible y con "no" el 130 desaparece de plazos, informe de impuestos, previsión y simulador (lo que falta de IRPF se paga en la renta). Si eliges "no" y lo registrado del año anterior lleva retención en menos del 70 % de los ingresos, se avisa: la exención (art. 109.1 del Reglamento del IRPF) depende de eso, y las facturas a clientes extranjeros o a particulares no llevan retención. Descartado: decidirlo la app sola con ese 70 % (los datos del año anterior pueden estar incompletos en la app) y bloquear la opción (la decisión es de Nacho).

**Duplicar gastos e ingresos (2026-10-21, a petición de Nacho).** Botón "Duplicar" en cada fila: abre el formulario de uno nuevo con los mismos datos, la fecha de hoy y el cursor en la fecha; no se guarda hasta pulsar Guardar. No se copian los adjuntos, ni la factura emitida (el ingreso copiado queda sin facturar), ni el nº de factura del proveedor en los gastos. Descartados: duplicar directamente sin formulario (crearía un registro con la fecha mal) y la fecha del mes siguiente por defecto (no siempre es mensual).

**Proveedor opcional en los gastos (2026-10-21, a petición de Nacho).** Solo es obligatorio cuando un modelo lo necesita: gastos con retención (111/115 y resúmenes 190/180) y compras a la UE (349). El concepto sigue siendo obligatorio. En el 347 los gastos sin proveedor ni NIF no se agrupan (no se sabe a quién se pagó); si suman más de 3.005,06 € se avisa por si alguno debería ir. Descartado: quitarlo del todo (rompería esos modelos) y agrupar los anónimos como un único tercero (saldría un 347 falso).

## Importar histórico de Declarando (2026-10-22, a petición de Nacho)

**Importador en Mi perfil** que lee los ZIP que exporta Declarando (o las carpetas descomprimidas), enseña un resumen por año y luego importa. Opción "borrar antes" (marcada por defecto, como pidió Nacho) que guarda una copia completa de la base de datos en `copias/` y borra ingresos y gastos; las facturas emitidas en la app y sus registros VERI*FACTU no se tocan (los registros no se pueden borrar). Todo en una transacción: si un registro no pasa las validaciones no entra nada ni se borra nada. Los archivos de los registros borrados se quedan en disco porque la copia de seguridad los sigue usando.
- **Fuente:** los libros registro (lo que se declaró); de los listados de gastos se toman el tipo y el % deducible. Descartado: usar solo los listados (no traen la calificación de la operación ni el % de IRPF, y en el gasto de Amazon el listado no coincide con el libro).
- **Clientes:** se reutilizan por NIF o nombre; los nuevos sin NIF español ni de la UE piden el país en la vista previa.
- **Operación de las ventas:** con IVA o cliente español, nacional; sin IVA, intracomunitaria si el cliente es de la UE y no sujeta si no.
- **PDF:** las facturas emitidas se emparejan por número; los justificantes de gastos, solo si el número de factura se puede leer dentro del PDF (lector mínimo, sin dependencias). Los demás se listan para adjuntarlos a mano. Descartado: añadir una librería de PDF por 6 archivos.
- **Lector de ZIP propio** (store/deflate, sin ZIP64 ni cifrado, límite de 200 MB por archivo). Descartado: una dependencia más.
- **Categorías nuevas:** "Alquiler de la vivienda donde trabajas" (sobre el % de vivienda afecta, sin IVA ni retención) y "Mobiliario de oficina".
- **Actividad:** cada fila va a la actividad del perfil con su epígrafe; si el histórico trae un epígrafe que no está en el perfil, no se importa y se avisa (nada fijado a un epígrafe concreto).
- La importación real de Nacho se hizo en su Mac (con copia de seguridad), y el resultado coincide con el de este importador: 29 ingresos y 45 gastos.

**Resumen, Ingresos y Gastos se abren con el año entero (2026-10-22, a petición de Nacho)**, en vez del trimestre en curso. El trimestre se sigue pudiendo elegir en el selector.
