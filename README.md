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

El apartado **Mis contactos TEC**, exclusivo del rol Usuario, separa los registros individuales y masivos atribuidos a su ficha del padrón de los contactos consolidados asignados a su dependencia vigente. Los filtros de este apartado no cambian el alcance del correo consultado ni afectan los filtros administrativos. El acceso es de consulta; no permite editar ni eliminar contactos compartidos.

El consolidado reconoce **Correo director**, **Correo del director** y sus variantes con “electrónico”. La identidad del director se busca por correo institucional y se conserva mediante el identificador de su ficha; el nombre no decide la asignación. Escuela Proponente debe coincidir con el nombre oficial de la dependencia asociada al director en el padrón. Ante correo ausente, desconocido, inactivo o dependencia incompatible en archivos que incluyen la columna, se muestra un error crítico y no se comparte ni importa esa fila. En libros con Correo director la vista previa propone conservar también los incompletos; la opción permanece visible y el administrador confirma la cantidad antes de guardar. Las filas incompletas sin errores críticos se incorporan únicamente con la opción explícita de pendientes, conservando sus campos disponibles y la autorización declarada en el archivo, sin completar valores por inferencia.

Los archivos anteriores sin Correo director todavía admiten carga administrativa, pero los contactos sin vinculación permanecen fuera de la consulta compartida. Volver a cargar un consolidado vincula contactos que ya eran consolidados; los registros individuales o masivos de funcionarios no se convierten a consolidados ni cambian de autor. Un libro con menos filas no elimina contactos previamente existentes.

La procedencia de los consolidados continúa como Administrador; Escuela Proponente define el departamento de cada fila. Para la consulta compartida se usa el departamento asignado y la vinculación explícita del director; los movimientos posteriores del funcionario consultante se resuelven contra el padrón vigente. Las fichas desactivadas no se admiten como correo de consulta. Se mantienen identificadores internos para conservar la relación si cambia el correo o el nombre.

#### Consulta por correo del funcionario

Al abrir **Mis contactos TEC** se muestra una ventana con el correo institucional vacío. Al ingresar un correo válido se consulta el padrón y se muestran nombre, sede, dependencia y los registros atribuidos a esa ficha, separados del consolidado de su dependencia. También se admite confirmar con el botón Consultar o la tecla Enter. Cambiar o borrar el correo limpia inmediatamente los datos y descarta respuestas anteriores.

Esta consulta no requiere contraseña, código de correo, Microsoft ni configuración adicional en Azure. El correo sirve para identificar la ficha consultada; no autentica a quien lo escribe. Por diseño, cualquier visitante que conozca el correo de una ficha activa consulta ese alcance de información. No debe describirse como identidad autenticada ni como prueba de propiedad del buzón.

La consulta es de solo lectura. El servidor resuelve la ficha y su dependencia desde el padrón, por lo que los filtros adicionales no incluyen cargas de otras fichas ni consolidados de otras dependencias dentro de la consulta del correo seleccionado. Los permisos de edición y eliminación y la autenticación del administrador se conservan. La sesión automática de usuario mantiene su suspensión por inactividad.

