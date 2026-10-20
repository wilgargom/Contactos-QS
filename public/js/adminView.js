// Módulo de Administración, Métricas KPI y Google Drive
const AdminModule = {

  funcionariosRequest: 0,
  funcionariosPage: 1,
  funcionariosQuery: '',
  funcionariosEstado: 'todos',
  funcionarioEditing: null,
  funcionariosBusy: false,

  closeFuncionarios() {
    this.funcionariosRequest++;
    this.funcionarioEditing = null;
    document.getElementById('admin-funcionarios-dialog')?.close();
    const content = document.getElementById('admin-funcionarios-content');
    if (content) content.replaceChildren();
  },

  openFuncionarios() {
    if (App.currentUser?.rol !== 'ADMIN' || App.suspended) return;
    this.funcionariosPage = 1;
    this.funcionariosQuery = '';
    this.funcionariosEstado = 'todos';
    document.getElementById('admin-funcionarios-dialog').showModal();
    this.loadFuncionarios();
  },

  async loadFuncionarios(page = this.funcionariosPage) {
    if (App.currentUser?.rol !== 'ADMIN' || App.suspended) return;
    const seq = ++this.funcionariosRequest, session = App.sessionVersion;
    const host = document.getElementById('admin-funcionarios-content');
    if (!host) return;
    this.funcionarioEditing = null;
    host.textContent = 'Cargando padrón…';
    try {
      const data = await API.get('/api/admin/funcionarios', { q: this.funcionariosQuery, estado: this.funcionariosEstado, page: String(page) });
      if (seq !== this.funcionariosRequest || session !== App.sessionVersion || App.currentUser?.rol !== 'ADMIN' || App.suspended || !host.isConnected) return;
      this.funcionariosPage = page;
      if (!data.funcionarios.length && page > 1) return this.loadFuncionarios(page - 1);
      const esc = value => DirectoryModule.escapeSelectionText(value);
      host.innerHTML = '<p class="text-sm text-slate-600 mb-4">Los cambios se aplican a los nuevos reportes. Los contactos existentes conservan la procedencia registrada. Un funcionario inactivo no se identifica como reportante.</p>' +
        '<form id="funcionarios-search" class="flex flex-wrap gap-3 mb-4"><label for="funcionarios-query">Buscar</label><input id="funcionarios-query" class="form-control" maxlength="200" placeholder="Nombre, correo, cargo o dependencia" value="' + esc(this.funcionariosQuery) + '">' +
        '<label for="funcionarios-estado">Estado</label><select id="funcionarios-estado" class="form-control">' +
        [['todos','Todos'],['activos','Activos'],['inactivos','Inactivos']].map(([v,t]) => '<option value="'+v+'" '+(v===this.funcionariosEstado?'selected':'')+'>'+t+'</option>').join('') +
        '</select><button type="submit" class="btn btn-outline">Buscar</button><button type="button" class="btn btn-tec" id="funcionario-new">Agregar funcionario</button></form>' +
        '<p role="status" class="mb-3">' + data.total + ' funcionarios · Página ' + page + ' de ' + Math.max(1,Math.ceil(data.total / data.pageSize)) + '</p>' +
        '<div class="table-responsive"><table class="data-table"><thead><tr><th>Nombre / correo</th><th>Cargo</th><th>Dependencia / sede</th><th>Estado</th><th>Acción</th></tr></thead><tbody>' +
        data.funcionarios.map((f,i) => '<tr><td>'+esc(f.nombre)+'<br>'+esc(f.email)+'</td><td>'+esc(f.cargo || 'Sin especificar')+'</td><td>'+esc(f.dependencia)+'<br>'+esc(f.sede)+'</td><td>'+(f.activo?'Activo':'Inactivo')+'</td><td><button type="button" class="btn btn-outline btn-sm" data-funcionario-index="'+i+'">Editar ficha</button></td></tr>').join('') +
        (data.total ? '' : '<tr><td colspan="5">No se encontraron funcionarios.</td></tr>') +
        '</tbody></table></div><div class="flex gap-3 mt-4"><button type="button" id="funcionarios-prev" class="btn btn-outline" '+(page<=1?'disabled':'')+'>Anterior</button><button type="button" id="funcionarios-next" class="btn btn-outline" '+(page*data.pageSize>=data.total?'disabled':'')+'>Siguiente</button></div>';
      document.getElementById('funcionarios-search').onsubmit = event => {
        event.preventDefault(); this.funcionariosQuery = document.getElementById('funcionarios-query').value.trim();
        this.funcionariosEstado = document.getElementById('funcionarios-estado').value; this.loadFuncionarios(1);
      };
      document.getElementById('funcionario-new').onclick = () => this.editFuncionario();
      document.getElementById('funcionarios-prev').onclick = () => this.loadFuncionarios(page - 1);
      document.getElementById('funcionarios-next').onclick = () => this.loadFuncionarios(page + 1);
      host.querySelectorAll('[data-funcionario-index]').forEach(button => {
        button.onclick = () => this.editFuncionario(data.funcionarios[Number(button.dataset.funcionarioIndex)].id);
      });
    } catch (err) {
      if (seq !== this.funcionariosRequest || session !== App.sessionVersion || !host.isConnected) return;
      host.textContent = err.message;
    }
  },

  async editFuncionario(id = null) {
    if (App.currentUser?.rol !== 'ADMIN' || App.suspended || this.funcionariosBusy) return;
    const seq = ++this.funcionariosRequest, session = App.sessionVersion;
    const host = document.getElementById('admin-funcionarios-content');
    try {
      const data = id ? await API.get('/api/admin/funcionarios/' + encodeURIComponent(id)) : { funcionario: { activo: 1 }, history: [] };
      // Refrescar catálogos: una carga reciente del padrón puede haber creado dependencias.
      const catalogs = await API.get('/api/catalogs');
      if (seq !== this.funcionariosRequest || session !== App.sessionVersion || App.currentUser?.rol !== 'ADMIN' || App.suspended || !host?.isConnected) return;
      const f = data.funcionario, esc = value => DirectoryModule.escapeSelectionText(value);
      this.funcionarioEditing = f;
      const input = (key,label,type='text',required=true) => '<label class="block mb-3">'+label+'<input class="form-control" id="funcionario-'+key+'" type="'+type+'" maxlength="'+(key==='email'?254:200)+'" '+(required?'required':'')+' value="'+esc(f[key]||'')+'"></label>';
      const options = (rows,selected) => '<option value="">Seleccione</option>' + rows.map(r => '<option value="'+esc(r.id)+'" '+(r.id===selected?'selected':'')+'>'+esc(r.nombre)+'</option>').join('');
      host.innerHTML = '<h4 class="font-bold mb-3">'+(id?'Actualizar ficha':'Agregar funcionario')+'</h4><form id="funcionario-form">' +
        input('nombre','Nombre completo')+input('email','Correo institucional','email')+input('cargo','Cargo / puesto (opcional)','text',false)+
        '<label class="block mb-3">Sede<select id="funcionario-sede_id" class="form-control" required>'+options(catalogs.sedes,f.sede_id)+'</select></label>'+
        '<label class="block mb-3">Escuela / Unidad<select id="funcionario-departamento_id" class="form-control" required></select></label>'+
        '<label class="block mb-3"><input type="checkbox" id="funcionario-activo" '+(f.activo?'checked':'')+'> Activo para reportar contactos</label>'+
        '<p class="text-sm text-slate-600 mb-3">La desactivación conserva la ficha y sus contactos anteriores. El correo debe ser único en el padrón.</p>'+
        '<p id="funcionario-error" role="alert" class="text-red-600 mb-3"></p><div class="flex gap-3"><button type="submit" id="funcionario-save" class="btn btn-tec">Guardar cambios</button><button type="button" id="funcionario-cancel" class="btn btn-outline">Volver al padrón</button></div></form>'+
        '<h4 class="font-bold mt-6 mb-3">Historial de cambios</h4><div class="table-responsive"><table class="data-table"><thead><tr><th>Fecha / administrador</th><th>Acción</th><th>Cambios</th></tr></thead><tbody>'+
        data.history.map(h => {
          let changes; try { changes = JSON.parse(h.detalles).map(c => c.campo + ': ' + (c.anterior ?? 'Vacío') + ' → ' + c.nuevo).join('; '); } catch (_) { changes = h.detalles; }
          return '<tr><td>'+esc(new Date(h.created_at).toLocaleString())+'<br>'+esc(h.usuario_nombre)+'</td><td>'+esc(h.accion)+'</td><td>'+esc(changes)+'</td></tr>';
        }).join('')+(data.history.length?'':'<tr><td colspan="3">Sin cambios registrados desde la habilitación de esta gestión.</td></tr>')+'</tbody></table></div>';
      const sede = document.getElementById('funcionario-sede_id'), depto = document.getElementById('funcionario-departamento_id');
      const refresh = selected => { depto.innerHTML = options(catalogs.departamentos.filter(d => !d.sede_id || d.sede_id === sede.value), selected); };
      refresh(f.departamento_id); sede.onchange = () => refresh('');
      document.getElementById('funcionario-cancel').onclick = () => this.loadFuncionarios();
      document.getElementById('funcionario-form').onsubmit = event => { event.preventDefault(); this.saveFuncionario(); };
    } catch (err) { if (seq === this.funcionariosRequest && session === App.sessionVersion) App.showToast(err.message, 'error'); }
  },

  async saveFuncionario() {
    const f = this.funcionarioEditing;
    if (!f || this.funcionariosBusy || App.currentUser?.rol !== 'ADMIN' || App.suspended) return;
    const data = {};
    for (const k of ['nombre','email','cargo','sede_id','departamento_id']) data[k] = document.getElementById('funcionario-'+k).value.trim();
    data.activo = document.getElementById('funcionario-activo').checked;
    if (f.activo && !data.activo && !window.confirm('¿Desactivar al funcionario? Ya no se identificará para registrar o cargar nuevos contactos. Sus contactos anteriores se conservarán.')) return;
    if (f.id) data.version = f.version;
    this.funcionariosBusy = true;
    const session = App.sessionVersion, seq = this.funcionariosRequest;
    const button = document.getElementById('funcionario-save'), error = document.getElementById('funcionario-error');
    button.disabled = true; error.textContent = '';
    try {
      if (f.id) await API.put('/api/admin/funcionarios/'+encodeURIComponent(f.id), data);
      else await API.post('/api/admin/funcionarios', data);
      if (session !== App.sessionVersion || seq !== this.funcionariosRequest || App.currentUser?.rol !== 'ADMIN' || App.suspended) return;
      App.showToast('Ficha del funcionario guardada.', 'success');
      await this.loadFuncionarios();
    } catch (err) { if (session === App.sessionVersion && seq === this.funcionariosRequest) error.textContent = err.message; }
    finally { this.funcionariosBusy = false; button.disabled = false; }
  },

  stats: null,
  driveStatus: null,
  catalogs: null,
  storage: null,
  errors: [],
  campaigns: [],
  backupBusy: false,

  init(catalogs) {
    this.catalogs = catalogs;
    this.loadData();
  },

  async loadData() {
    try {
      const overview = await API.get('/api/admin/overview');
      if (App.currentUser?.rol !== 'ADMIN' || App.suspended) return;
      this.stats = overview.stats;
      this.driveStatus = overview.drive;
      this.storage = overview.storage;
      this.errors = overview.errors;
      this.campaigns = overview.campaigns;
      this.catalogs.campanias = overview.campaigns;
      this.render();
    } catch (err) {
      App.showToast('Error al cargar panel de administración: ' + err.message, 'error');
    }
  },

  render() {
    const container = document.getElementById('admin-view');
    if (!container) return;

    if (App.currentUser?.rol !== 'ADMIN') {
      container.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm text-center p-10">
          <i class="fa-solid fa-lock text-red-500 text-4xl mb-3 block"></i>
          <h3 class="text-lg font-bold text-slate-900">Panel Reservado para Administradores</h3>
        </div>
      `;
      return;
    }

    if (!this.stats) {
      container.innerHTML = '<div class="bg-white rounded-2xl p-6 text-slate-400"><p>Cargando métricas...</p></div>';
      return;
    }

    const { total, academicos, empleadores, validados, duplicados, exportados, porSede, porDepto } = this.stats;

    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 mb-6">
          <div>
            <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center text-sm border border-blue-200/60 shadow-xs">
                <i class="fa-solid fa-chart-pie text-blue-900"></i>
              </span>
              Tablero General de Gestión – Ranking QS
            </h2>
            <p class="text-xs sm:text-sm text-slate-500 mt-1">Métricas consolidadas, distribución institucional y estado de sincronización.</p>
          </div>
          <button class="btn btn-outline btn-sm" onclick="AdminModule.loadData()">
            <i class="fa-solid fa-arrows-rotate text-xs"></i>
            Actualizar Métricas
          </button>
        </div>

        <section class="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
          <h3 class="font-bold text-slate-900 mb-2">Padrón de funcionarios</h3>
          <p class="text-sm text-slate-600 mb-3">Actualice el cargo y la dependencia institucional o desactive a quienes ya no deban reportar contactos.</p>
          <button type="button" class="btn btn-tec" onclick="AdminModule.openFuncionarios()">Gestionar funcionarios</button>
        </section>
        <dialog id="admin-funcionarios-dialog" class="rounded-xl p-6" style="width:min(1100px,95vw);max-height:90vh">
          <div class="flex items-center justify-between gap-4 mb-4"><h3 class="text-lg font-bold">Gestión de funcionarios</h3>
          <button type="button" class="btn btn-outline" onclick="AdminModule.closeFuncionarios()">Cerrar</button></div>
          <div id="admin-funcionarios-content"></div>
        </dialog>
        <!-- Tarjetas KPI -->
        <div class="kpi-grid mb-6">
          <div class="kpi-card" style="border-top-color: var(--tec-primary);">
            <div class="kpi-title">Total de Contactos</div>
            <div class="kpi-value text-slate-900">${total}</div>
          </div>
          <div class="kpi-card" style="border-top-color: #0284c7;">
            <div class="kpi-title">Académicos</div>
            <div class="kpi-value text-sky-700">${academicos}</div>
          </div>
          <div class="kpi-card" style="border-top-color: #059669;">
            <div class="kpi-title">Empleadores</div>
            <div class="kpi-value text-emerald-700">${empleadores}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--status-success);">
            <div class="kpi-title">Validados / Aptos</div>
            <div class="kpi-value text-emerald-700">${validados}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--status-warning);">
            <div class="kpi-title">Duplicados Detectados</div>
            <div class="kpi-value text-amber-700">${duplicados}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--tec-accent);">
            <div class="kpi-title">Exportados Oficiales</div>
            <div class="kpi-value text-amber-600">${exportados}</div>
          </div>
        </div>

        <!-- Distribución por Sedes y Departamentos -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <h4 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <i class="fa-solid fa-map-location-dot text-blue-900"></i>
              Distribución por Sede del TEC
            </h4>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr><th>Sede</th><th style="text-align: right;">Contactos</th></tr>
                </thead>
                <tbody>
                  ${porSede.map(s => `
                    <tr>
                      <td>${DirectoryModule.escapeSelectionText(s.sede)}</td>
                      <td style="text-align: right;"><strong>${s.count}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <h4 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <i class="fa-solid fa-building-user text-blue-900"></i>
              Contactos por Escuela / Unidad
            </h4>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr><th>Escuela / Unidad</th><th style="text-align: right;">Contactos</th></tr>
                </thead>
                <tbody>
                  ${porDepto.map(d => `
                    <tr>
                      <td>${DirectoryModule.escapeSelectionText(d.departamento)}</td>
                      <td style="text-align: right;"><strong>${d.count}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Módulo de Arquitectura y Google Drive (Requisito 18) -->
        <div class="bg-white border-2 border-slate-200 rounded-xl p-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                <i class="fa-brands fa-google-drive text-amber-500"></i>
                Gestión de Respaldos e Integración con Google Drive Institucional
              </h3>
              <p class="text-slate-500 text-xs mt-1">
                ${this.driveStatus.architectureNote}
              </p>
            </div>
            <button id="admin-backup-create" class="btn btn-tec btn-sm" onclick="AdminModule.triggerBackup()">
              <i class="fa-solid fa-database"></i>
              Generar Respaldo (.sqlite) Ahora
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg text-xs">
            <div><strong>Modo Almacenamiento:</strong> <code class="text-blue-900">${this.driveStatus.mode}</code></div>
            <div><strong>Carpeta Destino Drive:</strong> <code class="text-slate-600">${DirectoryModule.escapeSelectionText(this.driveStatus.targetSharedDrive)}</code></div>
            <div><strong>Evidencias Archivadas:</strong> <strong>${this.driveStatus.stagedArchivesCount}</strong> archivos</div>
            <div><strong>Copias Respaldo BD:</strong> <strong>${this.driveStatus.backupsCount}</strong> respaldos</div>
          </div>
        </div>
        ${this.renderOperations()}
      </div>
    `;
  },

  async triggerBackup() {
    if (this.backupBusy) return;
    this.backupBusy = true;
    const button = document.getElementById('admin-backup-create');
    if (button) button.disabled = true;
    try {
      App.showToast('Creando copia de respaldo física de la base de datos...', 'info');
      const res = await API.post('/api/drive/backup', {});
      if (res.success) {
        App.showToast(`✅ Respaldo exitoso: ${res.backupFileName} (${(res.sizeBytes / 1024).toFixed(1)} KB)`, 'success');
        await this.loadData();
      }
    } catch (err) {
      App.showToast('Error al generar respaldo: ' + err.message, 'error');
    } finally { this.backupBusy = false; if (button) button.disabled = false; }
  },

  renderOperations() {
    const esc = value => DirectoryModule.escapeSelectionText(value);
    const size = value => `${(Number(value || 0) / 1024 / 1024).toFixed(2)} MB`;
    const backups = this.storage?.backups || [];
    const candidates = this.storage?.cleanupCandidates || [];
    return `<section class="mt-6 border border-slate-200 rounded-xl p-5">
      <h3 class="font-bold text-slate-900 mb-3">Respaldos y almacenamiento de datos</h3>
      <p class="text-sm mb-3">Datos contabilizados: ${esc(size(this.storage?.totalBytes))} · Base de datos: ${esc(size(this.storage?.databaseBytes))}.</p>
      <p class="text-xs text-slate-600 mb-4">Descargue una copia y consérvela en el repositorio institucional autorizado, el archivo contiene información sensible.
      La restauración se realiza con el servicio detenido siguiendo la guía del proyecto.</p>
      <div class="table-responsive"><table class="data-table"><thead><tr><th>Respaldo</th><th>Tamaño</th><th>Acción</th></tr></thead><tbody>
      ${backups.map(f => `<tr><td class="break-all">${esc(f.name)}<br>${esc(new Date(f.modifiedAt).toLocaleString())}</td><td>${esc(size(f.bytes))}</td>
      <td><button type="button" class="btn btn-outline btn-xs" onclick="AdminModule.downloadBackup('${encodeURIComponent(f.name).replace(/'/g, '%27')}')">Descargar copia</button></td></tr>`).join('')}
      </tbody></table></div>
      <h4 class="font-semibold mt-5 mb-2">Archivos antiguos para revisión</h4>
      <p class="text-xs text-slate-600 mb-3">Se conservan al menos los tres respaldos más recientes, los lotes oficiales y todos los registros de la base,
      únicamente se ofrecen archivos de más de 30 días para eliminación manual.</p>
      <div class="table-responsive"><table class="data-table"><thead><tr><th>Archivo / categoría</th><th>Tamaño</th><th>Acción</th></tr></thead><tbody>
      ${candidates.map(f => `<tr><td class="break-all">${esc(f.name)}<br>${esc(f.category)}</td><td>${esc(size(f.bytes))}</td>
      <td><button type="button" class="btn btn-outline btn-xs" onclick="AdminModule.removeOldFile('${f.id}')">Revisar eliminación</button></td></tr>`).join('')}
      </tbody></table></div></section>
      <section class="mt-6 border border-slate-200 rounded-xl p-5"><h3 class="font-bold mb-3">Campañas y revisión</h3>
      <p class="text-sm mb-3">Campaña activa: <strong>${esc(this.campaigns.find(c => c.activa)?.nombre || 'Sin campaña activa')}</strong>.</p>
      <form onsubmit="event.preventDefault(); AdminModule.createCampaign();" class="flex flex-wrap gap-3 mb-4">
      <label class="text-sm" for="admin-campaign-name">Nueva campaña</label>
      <input id="admin-campaign-name" class="form-control" minlength="3" maxlength="100" required placeholder="Nombre del período de recolección">
      <button class="btn btn-outline" type="submit">Crear y activar campaña</button></form>
      <button class="btn btn-outline" type="button" onclick="AdminModule.reviewPending()">Revisar contactos incompletos o posibles duplicados</button>
      <p class="text-xs text-slate-600 mt-4">La identificación del reportante se consulta en el padrón, la comprobación del buzón requiere habilitar el acceso o envío institucional.</p></section>
      <section class="mt-6 border border-slate-200 rounded-xl p-5"><h3 class="font-bold mb-3">Incidencias técnicas recientes</h3>
      <div class="table-responsive"><table class="data-table"><thead><tr><th>Fecha / referencia</th><th>Operación</th><th>Código</th></tr></thead><tbody>
      ${(this.errors || []).slice(0, 15).map(e => `<tr><td>${esc(e.fecha)}<br>${esc(e.id)}</td><td>${esc(e.operacion)}</td><td>${esc(e.codigo)}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  },

  async downloadBackup(encodedName) {
    try {
      const name = decodeURIComponent(encodedName);
      const response = await API.get('/api/admin/backups/download', { name });
      const url = window.URL.createObjectURL(response.blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async removeOldFile(id) {
    const file = this.storage?.cleanupCandidates.find(f => f.id === id);
    if (!file || !window.confirm(`¿Eliminar definitivamente ${file.name}? Conserve una copia externa si la necesita, la eliminación no se revierte.`)) return;
    try {
      await API.post('/api/admin/storage/delete', { id, confirmed: true });
      App.showToast('Archivo antiguo eliminado.', 'success'); await this.loadData();
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async createCampaign() {
    const name = document.getElementById('admin-campaign-name').value.trim();
    if (!window.confirm(`¿Activar la campaña «${name}» para los contactos nuevos?`)) return;
    try {
      await API.post('/api/admin/campaigns', { name, confirmed: true });
      await this.loadData();
      App.showToast('Campaña activada.', 'success');
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  reviewPending() {
    DirectoryModule.filters.estado = '';
    DirectoryModule.filters.pendientes = 'true';
    App.navigate('directory');
  }
};
