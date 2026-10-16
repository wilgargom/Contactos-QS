# Sistema Institucional de Gestión de Contactos QS – Tecnológico de Costa Rica (TEC)

Aplicación web institucional desarrollada para recopilar, validar, auditar, deduplicar y consolidar los contactos de **Pares Académicos** (*Academic Reputation*) y **Empleadores** (*Employer Reputation*) para la participación institucional del TEC en el **Ranking QS (Quacquarelli Symonds)**.

## Despliegue en Azure App Service

Consulte la [guía de configuración de Azure Portal](docs/AZURE.md). La raíz en
Windows es `site\wwwroot`, donde `web.config` inicia `server.js`; el servidor
entrega `public/index.html` y atiende las API. La carpeta `wwwroot` la administra
Azure y no se crea dentro del repositorio.

---

## 🏛️ Identidad y Características Principales

* **Identidad Visual Oficial del TEC:** Logotipo vectorial oficial, azul institucional `#002855` (Pantone 281 C), fondos y acentos según la paleta corporativa.
* **Separación Dinámica de Formularios:** Selector inicial de tipo de contacto (*Académico* / *Empleador*) con formularios independientes, placeholders efímeros e interactivos que no se guardan como datos reales.
* **Validación Campo a Campo en Tiempo Real:** Botón *Guardar* habilitado únicamente tras completar satisfactoriamente todos los campos obligatorios y formatos (RFC 5322 para correo, longitudes, países normalizados ISO 3166).
* **Motor Preventivo Anti-Duplicados:**
  * **Coincidencia Exacta:** Bloquea la creación automática de contactos repetidos por correo normalizado o nombre + organización.
  * **Posible Duplicado (Fuzzy Levenshtein):** Detecta similitud fonética/ortográfica o cruce de roles (Académico registrado como Empleador). Despliega comparador *Side-by-Side*.
  * **Contacto Nuevo:** Verificado para registro limpio.
* **Carga Masiva con Auditoría Previa (Excel):**
  * Descarga de plantillas oficiales `.xlsx` para Académicos y Empleadores.
  * Análisis previo fila a fila con desglose: *Analizados, Correctos, Con errores, Posibles duplicados, Duplicados exactos*.
  * Reporte de incidencias por Fila, Columna, Campo, Valor encontrado, Problema y Recomendación.
  * Importación atómica transaccional (`COMMIT` / `ROLLBACK`).
* **Directorio de Contactos:** Filtros combinados por Sede, Escuela/Departamento, País, Estado, Fechas y buscador de texto completo. Ficha de trazabilidad y bitácora de auditoría inmutable por contacto.
* **Exportación Oficial QS:** Validador de calidad previo a la exportación que genera el archivo binario `.xlsx` en la estructura exacta requerida por QS con el campo `Source` ("Instituto Tecnológico de Costa Rica").
* **Arquitectura Multiusuario ACID:** Motor relacional SQLite con modo WAL (*Write-Ahead Logging*) para concurrencia multi-hilo segura y sin bloqueos de archivo.
* **Integración Google Drive / Staging:** Google Drive funciona como bóveda documental inmutable de evidencias (archivos Excel originales subidos, exportaciones históricas y copias de respaldo de la base de datos).

---

## 🚀 Puesta en Marcha

### Requisitos
* Node.js 24 LTS (incluye el módulo `node:sqlite` utilizado por la aplicación).
* No requiere dependencias externas de npm (motor OpenXML y SQLite integrados nativamente).

### Ejecución
```bash
# Iniciar servidor
node server.js
```
El servidor quedará disponible en:  
**URL:** [http://127.0.0.1:3000](http://127.0.0.1:3000)

### Pruebas Automatizadas
Para verificar el arranque con una base vacía, frontend, autenticación,
persistencia tras reiniciar y compatibilidad de puerto con Azure:
```bash
npm test
```

---

## 👥 Credenciales de Demostración

| Usuario | Correo | Contraseña | Rol | Procedencia Institucional |
| :--- | :--- | :--- | :--- | :--- |
| **Administrador General** | `admin@tec.ac.cr` | `TecQS2026!` | `ADMIN` | Dirección de Cooperación (Cartago) |
| **Operador Computación** | `cbrenes@tec.ac.cr` | `TecQS2026!` | `USUARIO` | Ingeniería en Computación (Cartago) |
| **Operador San José** | `evargas@tec.ac.cr` | `TecQS2026!` | `USUARIO` | Administración de Empresas (San José) |

*(Puede conmutar de usuario directamente desde el selector de la barra superior para evaluar el comportamiento según rol).*

---

## 📁 Estructura del Proyecto

```
tec-qs-contacts/
├── .gitignore               # Configuración Git para exclusión de temporales y bases de datos
├── README.md                # Documentación del sistema
├── package.json             # Metadatos del proyecto
├── server.js                # Servidor HTTP, enrutador y servidor de archivos estáticos
├── src/
│   ├── config.js            # Parámetros institucionales, rutas y constantes
│   ├── database/
│   │   ├── db.js            # Conexión SQLite con modo WAL y transacciones
│   │   ├── schema.sql       # Tablas normalizadas, claves foráneas e índices
│   │   └── seed.js          # Catálogos de sedes, escuelas, usuarios y contactos
│   ├── services/
│   │   ├── authService.js   # Autenticación, hash PBKDF2 y sesiones
│   │   ├── contactService.js# CRUD, filtros facetados y bitácora de auditoría
│   │   ├── duplicateDetector.js # Motor de similitud Levenshtein y reglas anti-duplicados
│   │   ├── excelService.js  # Lector y generador binario OpenXML (.xlsx y .csv)
│   │   ├── exportService.js # Exportador oficial con control de calidad previo QS
│   │   └── driveService.js  # Bóveda de evidencias Drive y respaldos
│   └── utils/
│       ├── validator.js     # Validaciones sintácticas, sinónimos de países y catálogos QS
│       └── zip.js           # Compresor y descompresor PKZip 2.0 nativo
├── public/
│   ├── index.html           # SPA con identidad y layout oficial del TEC
│   ├── css/
│   │   └── tec-theme.css    # Paleta oficial TEC, componentes reactivos y estados
│   ├── assets/
│   │   └── logo-tec.svg     # Logotipo vectorial oficial del TEC
│   └── js/
│       ├── api.js           # Cliente API HTTP
│       ├── app.js           # Controlador SPA, router y contexto de sesión
│       ├── register.js      # Formulario reactivo individual y alerta de duplicados
│       ├── bulkUpload.js    # Asistente de carga masiva y tabla de auditoría previa
│       ├── directory.js     # Tabla de contactos, filtros y visor de auditoría
│       ├── exportView.js    # Módulo de exportación con descarga directa XLSX
│       └── adminView.js     # Tablero de métricas y respaldos
└── tests/
    └── test_suite.js        # Pruebas de integración de arranque y despliegue
```
