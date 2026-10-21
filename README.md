# Gestoría

App de escritorio (macOS) para llevar la contabilidad y los impuestos de un autónomo en estimación directa simplificada. Los datos se guardan solo en tu ordenador.

## Estado

| Paso | Contenido | Estado |
|---|---|---|
| 1 | Perfil con epígrafe IAE, clientes, ingresos, gastos con justificantes, resumen y calendario de impuestos | Hecho |
| 2 | Facturas (nacionales, UE, fuera de la UE), PDF y VERI\*FACTU | Hecho (envío a la AEAT desactivado) |
| 3 | Modelos 303, 130, 111, 115, 349, 390 y 347, ficheros para la AEAT y calendario | Pendiente |
| 4 | Estimación de la renta (modelo 100, Comunidad de Madrid) | Hecho (pestaña Renta) |

## Uso en el Mac

Necesitas [Node.js 22 o superior](https://nodejs.org) y las herramientas de línea de comandos de Xcode (`xcode-select --install`).

```bash
npm install      # instala dependencias y compila SQLite para Electron
npm run dev      # abre la app en modo desarrollo
npm run dist:mac # genera el .dmg en dist/
npm test         # tests de la lógica fiscal y la base de datos
```

## Dónde están tus datos

En `~/Library/Application Support/gestoria/`: `gestoria.sqlite` (la base de datos) y la carpeta `adjuntos/`. Haz copia de seguridad de esa carpeta. Desde *Mi perfil → Abrir carpeta de datos* llegas directamente.

## Estructura

- `src/core/`: lógica fiscal y base de datos, sin dependencias de Electron y con tests.
- `src/main/`: proceso principal de Electron (ventana, base de datos, archivos).
- `src/preload/`: puente seguro entre la interfaz y el proceso principal.
- `src/renderer/`: interfaz en React.

Las decisiones de diseño están en [DECISIONS.md](DECISIONS.md).

> Aviso: la app ayuda a calcular y preparar tus impuestos, pero no sustituye el criterio de un asesor fiscal. Revisa siempre los importes antes de presentar.
