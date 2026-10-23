# Operación y recuperación de Contactos QS

## Respaldos

En Administración, genere un respaldo y descargue el archivo `.sqlite`. El sistema comprueba integridad y relaciones antes de ofrecerlo. Guarde una copia en un repositorio institucional con acceso restringido y verifique su descarga; los archivos que permanecen en el mismo App Service no son una copia externa. El archivo contiene contactos, auditoría, cuentas y sesiones, por lo que requiere la misma protección que la base activa. Google Drive aún no está conectado.

La copia SQLite no incluye los Excel ni los archivos de evidencia: conserve también `exports/` y, según la política institucional, `drive_staging/` del directorio persistente. Los lotes de exportación guardan una referencia y una huella del Excel; sin ese archivo se conserva el historial, pero no su descarga.

## Ensayo de recuperación y restauración

Utilice Node.js 24 y una copia descargada; el siguiente comando prepara un archivo nuevo, verifica integridad y relaciones y revoca todas las sesiones de la copia. No modifica el respaldo ni reemplaza una base existente.

```sh
node scripts/prepare-restore.js respaldo.sqlite base-recuperada.sqlite
```

Primero ensaye la recuperación en una instancia aislada, sin datos de demostración, con `STORAGE_DIR` apuntando a un directorio nuevo. Coloque allí el archivo preparado con el nombre `tec_qs.sqlite`, configure las credenciales administrativas del servidor y arranque la misma versión de la aplicación. Revise conteos, contactos y auditoría; si necesita descargar lotes históricos, recupere también los Excel correspondientes. Un ensayo solo se considera satisfactorio después de estas comprobaciones.

Para una restauración real, detenga App Service y confirme que no hay procesos escribiendo. Preserve juntos la base activa y sus posibles archivos `tec_qs.sqlite-wal`, `tec_qs.sqlite-shm` y `tec_qs.sqlite-journal` en una ubicación de recuperación con fecha. Coloque la base preparada como `tec_qs.sqlite`, sin reutilizar archivos auxiliares de la base anterior. Inicie el servicio, autentíquese nuevamente y compruebe los datos. Si falla, detenga de nuevo el servicio, aparte el conjunto restaurado y recupere el conjunto anterior completo. No sustituya únicamente el archivo principal mientras el servidor está funcionando.

## Almacenamiento

El panel informa los bytes de la base, archivos auxiliares y archivos administrados por la aplicación; no representa el consumo total ni la cuota restante del plan Azure. La limpieza es manual, archivo por archivo y con confirmación. Solo admite archivos con más de 30 días y conserva al menos los tres respaldos más recientes. Los Excel ligados a lotes oficiales quedan protegidos. No elimina contactos ni ejecuta una limpieza automática.

## Campañas, revisión y exportaciones

Los registros previos a esta actualización quedan sin campaña asignada. Los nuevos reciben la campaña activa, inicialmente «Recolección vigente». Crear una campaña cambia únicamente la asignación de registros futuros. El directorio y las exportaciones permiten filtrar por campaña y el acceso de revisión muestra registros nuevos o con posibles duplicados.

Preparar un lote genera el Excel, su huella SHA-256 y el manifiesto de contactos y versiones. Descargarlo registra la recepción en el navegador, no garantiza que se haya guardado en disco. Solo después del envío externo, el administrador confirma que lo envió a QS. La aplicación no transmite el archivo a QS. Si un contacto cambió o fue eliminado desde la preparación, se rechaza la confirmación y se requiere un lote nuevo. Los estados históricos de contactos anteriores no se reinterpretan.

## Anular exportaciones de prueba

En Exportación, el administrador dispone de **Anular lote** para archivos preparados, recibidos por el navegador y envíos confirmados. Indique un motivo y confirme la operación. El lote queda como ANULADO, con fecha, responsable y motivo, conserva el Excel y la confirmación original para consulta, y no admite una nueva confirmación. La acción solo anula la constancia interna, no comunica nada a QS ni retira archivos entregados externamente.

Los contactos se conservan. Si otro lote mantiene un envío confirmado para el mismo contacto, se conserva su estado EXPORTADO. De lo contrario se recupera VALIDADO o CORREGIDO cuando existe un estado previo registrado, comprobando los datos actuales; los lotes antiguos, que no guardaban ese estado, se revalidan y pasan a VALIDADO o NUEVO según su contenido actual. Las ediciones posteriores no se sobrescriben, los contactos eliminados no se recrean y los estados distintos de EXPORTADO se respetan. La operación es transaccional y repetir la anulación no añade cambios ni auditorías.

## Criterios actuales de validez

El validador del proyecto exige tratamiento (hasta 30 caracteres), nombre y apellido (2 a 80 caracteres, sin los símbolos restringidos), correo con formato válido (hasta 120 caracteres y ajeno a los dominios TEC), país y, si se indica teléfono, de 6 a 18 dígitos. Para académicos requiere cargo, departamento, institución y disciplina; para empleadores, cargo, industria y empresa. Cargo y departamento admiten hasta 120 caracteres, institución y empresa hasta 150, y los textos normalizados no superan 500 caracteres.

Estas son comprobaciones del programa, no una verificación externa de QS ni de la existencia del buzón. Los catálogos de tratamientos, disciplinas e industrias sirven de sugerencia, sin exigir coincidencia exacta, y el país admite valores fuera del catálogo. La normalización de España a Spain es una observación. Los registros individuales y masivos de funcionarios requieren los campos completos para exportar. El contador **Validados sin exportar** agrupa VALIDADO y CORREGIDO; **Contactos con envío confirmado** cuenta EXPORTADO y no equivale al número de archivos descargados.

El consolidado administrativo distingue **Completos** y **Con observaciones**, ambos exportables con la opción **Incluir el consolidado histórico previamente aceptado por QS**, seleccionada inicialmente en la interfaz administrativa. Esta inclusión declara la aceptación previa informada por administración, no representa una verificación de QS desde la aplicación. Las solicitudes de API deben indicar expresamente `includeHistorical: true`; sin esa opción mantienen la validación completa anterior. Los contactos históricos conservan los vacíos y caracteres literales, mientras las duplicidades pendientes o descartadas siguen excluidas. El lote informa las cantidades de ambos grupos, guarda el modo de validación y sus observaciones en el manifiesto, y registra la declaración en auditoría. La confirmación utiliza ese mismo modo y sigue rechazando versiones modificadas o contactos eliminados.

## Revisión del consolidado institucional

La carga consolidada es exclusiva de Administración y admite libros `.xlsx` con hojas identificadas como académicos o empleadores. Reconoce las columnas del archivo institucional, incluidos `mail`, `Country`, `Subject` y `Escuela Proponente`, admite equivalentes en español y detecta encabezados en las primeras veinte filas. Las celdas vacías no desplazan las columnas. Las columnas ambiguas bloquean el análisis; las fórmulas o errores de Excel en datos utilizados bloquean la fila y requieren convertir los datos a valores corregidos.

La vista muestra las hojas y columnas reconocidas, contadores, filtros, búsqueda, diagnóstico por fila y páginas de cincuenta registros. Los filtros solo modifican la vista; la confirmación indica el alcance total de la operación. La opción de conservar incompletos se presenta marcada y el administrador confirma el alcance; estos registros se muestran como históricos con observaciones y se incluyen en la exportación histórica aunque conserven internamente el estado NUEVO. Los correos TEC se conservan con sus observaciones y los directores con varias dependencias se vinculan por correo, mientras Escuela Proponente define la dependencia de cada fila. Los correos externos mal formados, escuelas ausentes, negativas explícitas de autorización, conflictos de tipo y coincidencias ambiguas se omiten hasta corregirlos. Una celda sin autorización no se interpreta como aprobación.

La procedencia queda como Administrador y cada fila conserva su Escuela Proponente para la agrupación institucional. El año, director y autorización originales quedan en la auditoría, sin inferir información ausente. Coincidencias de nombre y organización con correos diferentes requieren revisión, mientras que una actualización de procedencia conserva los datos del contacto existente. Al confirmar se vuelve a analizar el archivo dentro de la transacción; la vista envía una huella del análisis y, si cambió la clasificación o la versión de un contacto que se actualizaría, se rechaza la carga para solicitar un análisis nuevo.

## Padrón y alcance por dependencias

La columna Dependencia admite varias unidades separadas por `;`. Cada una se registra por separado, con coincidencia exacta normalizada de acentos, mayúsculas y espacios. No se conceden accesos por subcadenas, nombres de personas ni por el campo puesto. La primera actualización migra las fichas existentes sin modificar los contactos ni su procedencia. Las variantes históricas del mismo nombre y sede se consultan como equivalencias, conservando los identificadores y versiones originales. Nombres iguales de sedes distintas no se unifican; si una ficha con varias sedes no permite decidir la pertenencia, el historial registra REVISION_DEPENDENCIAS para su asignación administrativa, sin conceder acceso por esa coincidencia.

Para incorporar el padrón de GTH, cargue su hoja principal desde Carga masiva → Funcionarios, revise la vista previa y confirme las filas válidas. Los correos existentes actualizan el padrón y las pertenencias PADRON; las asignaciones MANUAL se conservan. Los correos ausentes del archivo no se eliminan ni desactivan. Las celdas con varias sedes no expresan una correspondencia por dependencia y no se cruzan para generar permisos.

En Administración → Funcionarios, marque las dependencias autorizadas y conserve una principal. El historial registra las modificaciones. La desactivación bloquea la identificación y los nuevos aportes. Las asignaciones adicionales de Correo director provienen del consolidado: modificar su Escuela Proponente o director exige actualizar esa procedencia desde una nueva carga.

El registro y la carga de contactos incluyen un selector restringido a las dependencias del padrón, las manuales y las asignadas en el consolidado. Cuando hay varias, al identificar el correo se abre una ventana con las dependencias autorizadas y la persona confirma a cuál corresponde el aporte. Cancelar sin seleccionar mantiene bloqueado el guardado o la carga; el botón Elegir dependencia abre nuevamente la ventana. Con una sola dependencia se completa automáticamente. En carga masiva, la selección corresponde a todo el archivo; cambiarla repite el análisis y descarta respuestas anteriores. La ventana se cierra al cambiar de correo, sección o sesión. El servidor comprueba de nuevo la pertenencia al confirmar; un filtro o identificador enviado desde el navegador no agrega acceso. La consulta separa aportes propios, cargas de las dependencias y consolidado. Las dos últimas vistas son compartidas con quienes tengan esas dependencias, incluso si no figuran como directores. Retirar una pertenencia revoca ese alcance salvo que una asignación vigente del consolidado siga autorizando la misma dependencia.

## Incidencias e identidad institucional

Los fallos internos de las operaciones nuevas y del despachador devuelven una referencia para soporte. El panel muestra las incidencias recientes; los archivos técnicos rotan con un límite aproximado de 4 MB y omiten cuerpos, contraseñas y mensajes crudos de las excepciones. Los errores de validación se presentan al usuario sin registrarlos como fallos técnicos.

La consulta de un correo en el padrón identifica el registro del funcionario; no demuestra control del buzón. Falta conectar la identidad institucional o un servicio de códigos de verificación para acreditar ese control. Las pruebas locales de concurrencia tampoco sustituyen una medición de capacidad en Azure F1 con usuarios y datos representativos.

## Estilos y caché

Para desarrollo ejecute `npm ci` y `npm run build:css` después de cambiar las clases de las vistas. El despliegue compila los estilos antes de las pruebas y entrega un CSS estático; el servidor no requiere Tailwind en ejecución. Los recursos locales enlazados desde el documento llevan una huella de contenido y admiten caché. HTML y API mantienen la prevención de caché y la recarga sigue revocando la administración.
