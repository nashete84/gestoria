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
