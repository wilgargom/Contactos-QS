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

## Incidencias e identidad institucional

Los fallos internos de las operaciones nuevas y del despachador devuelven una referencia para soporte. El panel muestra las incidencias recientes; los archivos técnicos rotan con un límite aproximado de 4 MB y omiten cuerpos, contraseñas y mensajes crudos de las excepciones. Los errores de validación se presentan al usuario sin registrarlos como fallos técnicos.

La consulta de un correo en el padrón identifica el registro del funcionario; no demuestra control del buzón. Falta conectar la identidad institucional o un servicio de códigos de verificación para acreditar ese control. Las pruebas locales de concurrencia tampoco sustituyen una medición de capacidad en Azure F1 con usuarios y datos representativos.

## Estilos y caché

Para desarrollo ejecute `npm ci` y `npm run build:css` después de cambiar las clases de las vistas. El despliegue compila los estilos antes de las pruebas y entrega un CSS estático; el servidor no requiere Tailwind en ejecución. Los recursos locales enlazados desde el documento llevan una huella de contenido y admiten caché. HTML y API mantienen la prevención de caché y la recarga sigue revocando la administración.
