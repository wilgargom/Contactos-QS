-- Esquema SQLite para Gestión de Contactos QS - Tecnológico de Costa Rica
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. Catálogo de Sedes del TEC
CREATE TABLE IF NOT EXISTS sedes (
  id TEXT PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  activo INTEGER DEFAULT 1
);

-- 2. Catálogo de Escuelas y Departamentos
CREATE TABLE IF NOT EXISTS departamentos (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  sede_id TEXT,
  activo INTEGER DEFAULT 1,
  FOREIGN KEY (sede_id) REFERENCES sedes(id)
);

-- 3. Usuarios del Sistema
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nombre_completo TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  rol TEXT NOT NULL CHECK(rol IN ('ADMIN', 'USUARIO')),
  sede_id TEXT,
  departamento_id TEXT,
  activo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (sede_id) REFERENCES sedes(id),
  FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
);

-- 4. Sesiones Activas
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 5. Lotes de Carga Masiva (Excel)
CREATE TABLE IF NOT EXISTS lotes_carga (
  id TEXT PRIMARY KEY,
  nombre_archivo TEXT NOT NULL,
  tipo_contacto TEXT NOT NULL,
  total_filas INTEGER NOT NULL,
  correctos INTEGER NOT NULL,
  con_errores INTEGER NOT NULL,
  posibles_duplicados INTEGER NOT NULL,
  duplicados_exactos INTEGER NOT NULL,
  cargado_por TEXT NOT NULL,
  created_at TEXT NOT NULL,
  detalles_json TEXT
);

-- 6. Contactos Principales (Académicos y Empleadores)
CREATE TABLE IF NOT EXISTS contactos (
  id TEXT PRIMARY KEY,
  tipo_contacto TEXT NOT NULL CHECK(tipo_contacto IN ('ACADEMICO', 'EMPLEADOR')),
  source TEXT DEFAULT 'Instituto Tecnológico de Costa Rica',
  title TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  phone TEXT,
  country_name TEXT NOT NULL,
  sede_id TEXT,
  departamento_id TEXT,
  
  -- Campos específicos Académico
  job_title TEXT,
  department_unit TEXT,
  institution TEXT,
  subject_area TEXT,

  -- Campos específicos Empleador
  position TEXT,
  industry TEXT,
  company_name TEXT,

  -- Identificación de quien recomienda / reporta el contacto (Funcionario del TEC)
  recomienda_nombre TEXT,
  recomienda_email TEXT,

  -- Trazabilidad y Estado
  estado TEXT NOT NULL CHECK(estado IN ('NUEVO', 'VALIDADO', 'POSIBLE_DUPLICADO', 'DUPLICADO', 'CORREGIDO', 'EXPORTADO')),
  metodo_ingreso TEXT NOT NULL CHECK(metodo_ingreso IN ('INDIVIDUAL', 'CARGA_MASIVA')),
  lote_id TEXT,
  created_by TEXT NOT NULL,
  created_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_by_name TEXT,
  updated_at TEXT,
  
  FOREIGN KEY (sede_id) REFERENCES sedes(id),
  FOREIGN KEY (departamento_id) REFERENCES departamentos(id),
  FOREIGN KEY (lote_id) REFERENCES lotes_carga(id)
);

-- Índices de alto rendimiento para búsquedas y prevención de duplicados
CREATE INDEX IF NOT EXISTS idx_contactos_email_norm ON contactos(email_normalized);
CREATE INDEX IF NOT EXISTS idx_contactos_tipo ON contactos(tipo_contacto);
CREATE INDEX IF NOT EXISTS idx_contactos_estado ON contactos(estado);
CREATE INDEX IF NOT EXISTS idx_contactos_sede ON contactos(sede_id);
CREATE INDEX IF NOT EXISTS idx_contactos_depto ON contactos(departamento_id);
CREATE INDEX IF NOT EXISTS idx_contactos_created_at ON contactos(created_at);

-- 7. Historial y Auditoría Inmutable
CREATE TABLE IF NOT EXISTS auditoria (
  id TEXT PRIMARY KEY,
  contacto_id TEXT,
  usuario_id TEXT,
  usuario_nombre TEXT,
  accion TEXT NOT NULL,
  detalles TEXT,
  created_at TEXT NOT NULL
);

-- 8. Padrón Oficial de Funcionarios del TEC
CREATE TABLE IF NOT EXISTS funcionarios (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email_normalized TEXT NOT NULL UNIQUE,
  dependencia TEXT NOT NULL,
  sede TEXT NOT NULL,
  sede_id TEXT,
  departamento_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (sede_id) REFERENCES sedes(id),
  FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_email_norm ON funcionarios(email_normalized);

