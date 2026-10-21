import type BetterSqlite3 from 'better-sqlite3'

// Cada migración se aplica una vez; PRAGMA user_version guarda la última aplicada.
// Nunca se edita una migración ya publicada: se añade una nueva al final.
const MIGRACIONES: string[] = [
  `
  CREATE TABLE perfil (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    datos TEXT NOT NULL
  );

  CREATE TABLE clientes (
    id INTEGER PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('empresa', 'particular')),
    nombre TEXT NOT NULL,
    nif TEXT NOT NULL DEFAULT '',
    pais TEXT NOT NULL DEFAULT 'ES',
    domicilio TEXT NOT NULL DEFAULT '',
    codigo_postal TEXT NOT NULL DEFAULT '',
    municipio TEXT NOT NULL DEFAULT '',
    provincia TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    notas TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE ingresos (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE RESTRICT,
    concepto TEXT NOT NULL,
    base INTEGER NOT NULL,
    tipo_iva REAL NOT NULL,
    cuota_iva INTEGER NOT NULL,
    retencion_pct REAL NOT NULL,
    cuota_retencion INTEGER NOT NULL,
    operacion TEXT NOT NULL CHECK (operacion IN ('nacional', 'intracomunitaria', 'no_sujeta')),
    factura_id INTEGER,
    notas TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX ingresos_fecha ON ingresos(fecha);

  CREATE TABLE gastos (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL,
    proveedor TEXT NOT NULL,
    nif_proveedor TEXT NOT NULL DEFAULT '',
    pais_proveedor TEXT NOT NULL DEFAULT 'ES',
    numero_factura TEXT NOT NULL DEFAULT '',
    concepto TEXT NOT NULL,
    categoria TEXT NOT NULL,
    base INTEGER NOT NULL,
    tipo_iva REAL NOT NULL,
    cuota_iva INTEGER NOT NULL,
    deducible_pct_irpf REAL NOT NULL,
    deducible_pct_iva REAL NOT NULL,
    retencion_pct REAL NOT NULL,
    cuota_retencion INTEGER NOT NULL,
    operacion TEXT NOT NULL CHECK (operacion IN ('nacional', 'intracomunitaria', 'extracomunitaria', 'sin_iva')),
    bien_inversion INTEGER NOT NULL DEFAULT 0,
    notas TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX gastos_fecha ON gastos(fecha);

  CREATE TABLE adjuntos (
    id INTEGER PRIMARY KEY,
    entidad TEXT NOT NULL CHECK (entidad IN ('ingreso', 'gasto')),
    entidad_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    ruta TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    creado TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX adjuntos_entidad ON adjuntos(entidad, entidad_id);
  `,
  `
  CREATE TABLE presentaciones (
    id INTEGER PRIMARY KEY,
    modelo TEXT NOT NULL,
    ejercicio INTEGER NOT NULL,
    periodo TEXT NOT NULL CHECK (periodo IN ('1T', '2T', '3T', '4T', '0A')),
    fecha_presentacion TEXT NOT NULL,
    resultado TEXT NOT NULL CHECK (resultado IN ('ingresar', 'devolver', 'compensar', 'cero', 'negativa')),
    importe INTEGER NOT NULL DEFAULT 0,
    justificante TEXT NOT NULL DEFAULT '',
    notas TEXT NOT NULL DEFAULT '',
    UNIQUE (modelo, ejercicio, periodo)
  );
  `,
  `
  CREATE TABLE facturas (
    id INTEGER PRIMARY KEY,
    entorno TEXT NOT NULL CHECK (entorno IN ('prueba', 'produccion')),
    serie TEXT NOT NULL,
    numero INTEGER NOT NULL,
    num_serie TEXT NOT NULL UNIQUE,
    fecha_expedicion TEXT NOT NULL,
    ingreso_id INTEGER REFERENCES ingresos(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL DEFAULT 'F1',
    emisor TEXT NOT NULL,
    cliente TEXT NOT NULL,
    concepto TEXT NOT NULL,
    base INTEGER NOT NULL,
    tipo_iva REAL NOT NULL,
    cuota_iva INTEGER NOT NULL,
    retencion_pct REAL NOT NULL,
    cuota_retencion INTEGER NOT NULL,
    operacion TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'emitida' CHECK (estado IN ('emitida', 'anulada')),
    creada TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (serie, numero)
  );

  -- Registros de facturación VERI*FACTU. Nunca se modifican ni se borran: forman una cadena.
  CREATE TABLE registros_verifactu (
    id INTEGER PRIMARY KEY,
    entorno TEXT NOT NULL CHECK (entorno IN ('prueba', 'produccion')),
    tipo TEXT NOT NULL CHECK (tipo IN ('alta', 'anulacion')),
    factura_id INTEGER NOT NULL REFERENCES facturas(id),
    id_emisor TEXT NOT NULL,
    num_serie TEXT NOT NULL,
    fecha_expedicion TEXT NOT NULL,
    fecha_hora_huso TEXT NOT NULL,
    huella TEXT NOT NULL,
    huella_anterior TEXT,
    xml TEXT NOT NULL,
    estado_envio TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_envio IN ('pendiente', 'correcto', 'aceptado_con_errores', 'incorrecto')),
    csv TEXT,
    error TEXT
  );
  CREATE INDEX registros_factura ON registros_verifactu(factura_id);

  CREATE TRIGGER registros_inmutables BEFORE UPDATE OF tipo, factura_id, id_emisor, num_serie, fecha_expedicion,
    fecha_hora_huso, huella, huella_anterior, xml ON registros_verifactu
  BEGIN SELECT RAISE(ABORT, 'Los registros de facturación no se pueden modificar'); END;
  CREATE TRIGGER registros_sin_borrado BEFORE DELETE ON registros_verifactu
  BEGIN SELECT RAISE(ABORT, 'Los registros de facturación no se pueden borrar'); END;
  `
]

export function migrar(db: BetterSqlite3.Database): void {
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  const actual = db.pragma('user_version', { simple: true }) as number
  for (let v = actual; v < MIGRACIONES.length; v++) {
    db.transaction(() => {
      db.exec(MIGRACIONES[v]!)
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}
