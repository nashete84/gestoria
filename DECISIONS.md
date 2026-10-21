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
