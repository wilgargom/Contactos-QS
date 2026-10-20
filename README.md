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

## Acceso y roles

La aplicación crea automáticamente una sesión con rol Usuario, sin credenciales ni
identidad de funcionario predeterminada. El botón **Acceso de administrador** solicita
usuario y contraseña, que se validan exclusivamente en el servidor. La sesión dura
12 horas, se mantiene al actualizar la página y se revoca al cerrar sesión, regresando
al modo Usuario. Las cookies son HttpOnly y SameSite=Strict, con Secure bajo HTTPS
en Azure. Los accesos de demostración anteriores quedan inactivos al actualizar.

La configuración administrativa se encuentra en `src/adminCredentials.js`, fuera de
`public/`, y lee el hash scrypt con sal desde la configuración privada del servidor. No se incluyen contraseñas
legibles en JavaScript público ni en esta documentación. Antes de activar el acceso en Azure, configure `QS_ADMIN_USERNAME` y
`QS_ADMIN_PASSWORD_HASH` en las variables de entorno de App Service; el formato del hash es `scrypt:<sal hexadecimal de 16 bytes>:<hash de 64 bytes>`.
Si no se configura un hash válido, el acceso administrativo queda deshabilitado y
el modo Usuario continúa funcionando. Los cambios de credenciales invalidan las sesiones administrativas al reiniciar.

El rol Usuario conserva registro individual, carga de contactos y directorio de los
registros de su sesión. El tablero, Drive, la exportación oficial QS y la carga
masiva del padrón requieren sesión administrativa. La selección del funcionario
reportante en los formularios es independiente del rol de acceso.

El registro individual y la carga masiva de contactos inician con la sección de
funcionario vacía. Ambos consultan el padrón por el correo institucional ingresado;
los datos se limpian y el guardado se bloquea al cambiar el correo, mientras se
consulta o si la consulta falla. El servidor vuelve a comprobar la existencia del
funcionario al guardar o confirmar una importación y toma del padrón su nombre,
correo, sede y dependencia. Esta comprobación identifica un registro del padrón;
no incluye envío de códigos ni autenticación del buzón institucional.


### Consolidado institucional del administrador

En Carga masiva, el administrador dispone de **Consolidado institucional**, que
lee las hojas de académicos y empleadores del libro `.xlsx`. La columna
**Escuela Proponente** determina la escuela o unidad del tablero, mientras que
**Procedencia TEC** muestra **Administrador**. No se utiliza `Department` del
contacto externo como dependencia del TEC ni se asigna una sede ausente por defecto.

La vista previa distingue nuevos, pendientes de revisión y procedencias existentes
por actualizar. Al confirmar, el servidor vuelve a leer el archivo original,
comprueba duplicados y guarda una auditoría por contacto. Los contactos existentes
creados por carga masiva conservan sus datos al actualizar la procedencia, mientras
que los registros individuales conservan su atribución original. Las filas con
escuelas contradictorias o sin escuela se excluyen para revisión, los registros
incompletos nuevos quedan en estado `NUEVO` y fuera de la exportación oficial QS.
Esta función está restringida al administrador tanto en la interfaz como en la API.


### Eliminación múltiple del administrador

El directorio ofrece casillas de selección y un contador para el administrador.
La casilla del encabezado selecciona los resultados visibles, al aplicar filtros
o actualizar la lista se limpia la selección. **Eliminar seleccionados** abre una
confirmación con la cantidad de contactos; **Cancelar** no elimina registros.

La API comprueba el rol administrativo y la confirmación, verifica que todos los
contactos existan y ejecuta el borrado en una transacción. Si falta un contacto o
falla una eliminación, no se aplica un borrado parcial. Cada contacto eliminado
conserva una entrada de auditoría asociada a la misma operación de eliminación.

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
│   │   ├── authService.js   # Autenticación, hash scrypt y sesiones HttpOnly
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


### Consulta institucional de contactos y columna Correo director

El apartado **Mis contactos TEC**, exclusivo del rol Usuario, separa los registros individuales y masivos atribuidos a su ficha del padrón de los contactos consolidados asignados a su dependencia vigente. Los filtros de este apartado no cambian el alcance autorizado ni afectan los filtros administrativos. El acceso es de consulta; no permite editar ni eliminar contactos compartidos.

El consolidado reconoce **Correo director**, **Correo del director** y sus variantes con “electrónico”. La identidad del director se busca por correo institucional y se conserva mediante el identificador de su ficha; el nombre no decide la asignación. Escuela Proponente debe coincidir con el nombre oficial de la dependencia asociada al director en el padrón. Ante correo ausente, desconocido, inactivo o dependencia incompatible en archivos que incluyen la columna, se muestra un error crítico y no se comparte ni importa esa fila. Las filas incompletas sin errores críticos se incorporan únicamente con la opción explícita de pendientes, conservando sus campos disponibles y la autorización declarada en el archivo, sin completar valores por inferencia.

Los archivos anteriores sin Correo director todavía admiten carga administrativa, pero los contactos sin vinculación permanecen fuera de la consulta compartida. Volver a cargar un consolidado vincula contactos que ya eran consolidados; los registros individuales o masivos de funcionarios no se convierten a consolidados ni cambian de autor. Un libro con menos filas no elimina contactos previamente existentes.

La procedencia de los consolidados continúa como Administrador; Escuela Proponente define el departamento de cada fila. Para la consulta compartida se usa el departamento asignado y la vinculación explícita del director; los movimientos posteriores del funcionario consultante se resuelven contra el padrón vigente. Las fichas desactivadas no acceden. Se mantienen identificadores internos para conservar la relación si cambia el correo o el nombre.

#### Activación de Microsoft institucional en Azure

La integración usa **Azure App Service Authentication (Easy Auth)** y está desactivada de forma predeterminada. Requiere una aplicación de **Microsoft Entra en el tenant institucional del TEC**, no el tenant personal de la suscripción de estudiante. Solicitar al responsable institucional la configuración o autorización correspondiente.

En Azure App Service → Authentication, agregar Microsoft como proveedor **single tenant**, habilitar HTTPS y el almacén de tokens y configurar **Allow unauthenticated requests** para conservar la página pública y el acceso administrativo existente. La aplicación aplica los permisos en sus API. Configurar el emisor y las audiencias admitidas para esta aplicación; no usar common ni habilitar cualquier tenant. La URI de retorno de Microsoft es el dominio de la aplicación seguido de **/.auth/login/aad/callback**.

Agregar el claim opcional **acct** al token ID de Entra; la aplicación exige acct = 0 y rechaza invitados o tokens sin esta comprobación. El token también debe exponer **tid**, **oid** y **preferred_username** o el claim opcional **upn** (incluirlo en la configuración de tokens ID de Entra si no está disponible). El identificador de inicio de sesión debe coincidir con un correo institucional activo del padrón; no se utilizan el nombre visible ni un correo ingresado por el visitante como prueba de identidad. El primer acceso vincula tenant + oid con la ficha y rechaza reasignaciones automáticas a otra identidad; cualquier cambio de cuenta institucional requiere revisión administrativa de la vinculación.

**Solo después de verificar que Easy Auth está activo y que Azure controla los encabezados de identidad**, agregar a la configuración de App Service:

- QS_MICROSOFT_AUTH = azure-easy-auth
- QS_ENTRA_TENANT_ID = el GUID del tenant institucional aprobado

Nunca activar estas variables en un servidor que acepte cabeceras de identidad suministradas por los clientes. No se proporciona un modo alternativo por correo o nombre, ni un simulador de identidad para producción. La integración no requiere guardar secretos de Microsoft en el JavaScript ni modifica la autenticación de administradores.

Con el acceso activado, los registros individuales y las cargas masivas de usuarios exigen la cuenta Microsoft y que el reportante elegido corresponda a esa cuenta. Los contactos actuales se consultan por la ficha del reportante y los consolidados por la dependencia vigente; cambiar un filtro o enviar otro correo no amplía permisos. Los contactos anteriores sin reportante identificable quedan reservados a administración. Las sesiones mantienen la suspensión por inactividad existente.

Referencias oficiales: https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-user-identities y https://learn.microsoft.com/en-us/azure/app-service/app-service-authentication-overview .
