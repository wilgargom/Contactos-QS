# Desplegar Contactos QS en Azure App Service

La página inicial es `public/index.html`, pero el proceso de entrada es
`server.js`: la aplicación necesita Node.js para las API, la autenticación y
SQLite. No requiere crear una carpeta `wwwroot` en GitHub ni mover el HTML.
Azure instala el paquete en su propia carpeta `site\wwwroot`.

## Configuración en Azure Portal (Windows)

En el App Service **tec-qs-contacts**, abra **Configuración > Configuración de
la pila** (en algunas versiones, **Configuración > Configuración general**).
Seleccione Node.js **24 LTS** y plataforma de **64 bits**. Node.js 18 o 20 no
incluyen `node:sqlite`, utilizado por este sistema.

En **Configuración > Asignaciones de ruta > Aplicaciones virtuales y
directorios**, la aplicación raíz debe tener estos valores:

| Campo | Valor |
| --- | --- |
| Ruta virtual | `/` |
| Ruta física | `site\wwwroot` |
| Tipo | Aplicación |

Si aparece `site\wwwroot\public`, sustitúyalo por `site\wwwroot`. El archivo
`web.config` debe quedar en esa raíz para que IISNode inicie `server.js`.
El propio servidor devuelve el HTML y los recursos de `public/`.
No añada `/public` a la dirección del sitio ni configure `index.html` como
proceso de inicio.

En **Configuración > Variables de entorno**, revise estos ajustes:

| Nombre | Valor o indicación |
| --- | --- |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~24` |
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | Un valor aleatorio propio, mantenido fuera de GitHub |
| `STORAGE_DIR` | Opcional, ruta absoluta de almacenamiento persistente |

No configure `PORT`: Azure proporciona el puerto o la named pipe. Guarde
los cambios y reinicie el App Service.

## Publicar desde GitHub

Integre la propuesta en `main`. El flujo
`.github/workflows/main_tec-qs-contacts.yml` comprueba el servidor en Windows y
Linux, prepara el paquete y prueba de nuevo los archivos que se publicarán.
Las propuestas de cambios ejecutan las pruebas sin desplegar. Los envíos a
`main` despliegan en **tec-qs-contacts** mediante el secreto de perfil de
publicación que ya utiliza el repositorio.

El paquete contiene únicamente:

```text
site\wwwroot\
  server.js
  web.config
  package.json
  src\
  public\
    index.html
    css\
    js\
    assets\
```

Se excluyen ejecutables de túneles, scripts de instalación local, ZIP de código,
credenciales y datos operacionales. La versión actual no necesita paquetes npm
externos; si se agregan dependencias, también se deberá actualizar el empaquetado
para instalarlas en el artefacto de producción.

## Archivos de datos

En Azure, el almacenamiento predeterminado es
`%HOME%\data\tec-qs-contacts` en Windows o
`$HOME/data/tec-qs-contacts` en Linux. Allí se crean la base de datos, cargas,
exportaciones y respaldos, fuera de los archivos publicados. En desarrollo local
se mantiene `storage/` y la variable `STORAGE_DIR` permite elegir otra ubicación.

Si ya hay registros en una instalación anterior, respalde la base de datos
antes del despliegue y migre los datos al nuevo directorio con la aplicación
detenida, incluyendo los archivos SQLite auxiliares si existen. Como alternativa
temporal, configure `STORAGE_DIR` con la ruta absoluta del almacenamiento actual.
Un directorio vacío crea una base de demostración nueva; no importa los registros
de otra instalación automáticamente.

App Service monta HOME sobre almacenamiento compartido, por lo que se usa
SQLite con journal `DELETE` en Azure y `WAL` en disco local. Mantenga **una sola
instancia** del App Service y un único proceso Node mientras utilice este motor,
además valide las operaciones de escritura en el almacenamiento real de Azure
antes de utilizar datos institucionales. Este ajuste no convierte SQLite en una
base de datos diseñada para escalamiento horizontal; para varias instancias,
migre a una base de datos administrada.

## Comprobación y diagnóstico

Abra el dominio predeterminado que aparece en **Información general** del App
Service y compruebe `/`, `/index.html` y `/api/health`; este último debe devolver
JSON con `"status":"UP"`. Verifique también el inicio de sesión y el guardado
de un registro de prueba, después reinicie la aplicación y confirme que persiste.

Si continúa el 403, revise primero la asignación de la aplicación raíz y confirme
en **Herramientas avanzadas > Ir > Debug console** que `web.config`, `server.js`
y `package.json` estén directamente en `site\wwwroot`, sin una carpeta adicional
que los envuelva. Si aparece un 500, abra **Supervisión > Flujo de registros**:
revise la versión de Node, los permisos del directorio de datos y el mensaje de
inicio, que muestra las rutas de frontend y almacenamiento.

La configuración IIS y el montaje de almacenamiento de Azure requieren esta
comprobación en el servicio real; las pruebas del repositorio no reemplazan esa
validación. Las cuentas de demostración existentes deben reemplazarse antes de
la apertura institucional.

## Ejecución local y empaquetado manual

```bash
npm start
npm test
npm run package:azure
```

Para publicar manualmente, comprima **el contenido** de `build/azure/`, de modo
que `server.js` y `web.config` estén en la raíz del ZIP. No comprima la carpeta
contenedora completa.

En App Service **Linux**, utilice Node.js 24 LTS y el comando de inicio
`node server.js`. La asignación de aplicaciones virtuales y `web.config` se
aplican a Windows. Si utiliza contenedores Linux propios, configure explícitamente
un volumen persistente para `STORAGE_DIR`.

## Referencias

- [Configuración de Node.js en App Service](https://learn.microsoft.com/es-es/azure/app-service/configure-language-nodejs)
- [Sistema de archivos y HOME en App Service](https://learn.microsoft.com/en-us/azure/app-service/operating-system-functionality)
- [Restricciones de SQLite WAL](https://sqlite.org/wal.html)

## Controles de registros y sesiones

Al cargar o actualizar la página se revoca la sesión administrativa anterior,
se conserva el acceso de usuario y cualquier operación administrativa requiere
iniciar sesión nuevamente, la revocación también se realiza en el servidor
antes de entregar el documento HTML.

La edición conserva los campos omitidos y exige la versión recibida al abrir
el contacto, si otra operación lo modifica, la aplicación rechaza el guardado
con HTTP 409 y solicita abrirlo otra vez, una versión ausente devuelve HTTP 428.
El directorio consulta páginas de 50 contactos, con un máximo de 100 por
solicitud, mientras que la exportación incluye todos los resultados filtrados.

La confirmación de carga masiva ordinaria verifica nuevamente cada fila y los
duplicados dentro de una transacción con auditoría individual, cualquier fila
inválida o repetida revierte el lote completo, los posibles duplicados permanecen
en revisión, el padrón institucional admite cambios únicamente del administrador.

Los datos de ejemplo no se insertan en producción, las pruebas aisladas los
habilitan exclusivamente con `NODE_ENV=test` y `QS_SEED_DEMO=1`, los catálogos y
la cuenta administrativa configurada se inicializan sin agregar contactos ni
funcionarios ficticios, esta modificación no elimina registros existentes.

El formulario mantiene un borrador de los datos del contacto en la sesión del
navegador y advierte antes de descartarlo, la persona reportante se identifica
nuevamente al entrar al módulo, sus datos y las credenciales administrativas no
se guardan en el borrador.

Los respaldos utilizan la API de SQLite y abren la copia para comprobar su
integridad y sus relaciones, el estado de Drive informa almacenamiento local,
la presencia de credenciales no equivale a una subida, la integración real con
Drive, las pruebas de capacidad en Azure y una estrategia indexada para la
comparación aproximada de duplicados siguen pendientes, la comparación actual
recorre los registros sin cargar toda la tabla en memoria.
