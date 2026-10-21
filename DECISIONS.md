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
