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
