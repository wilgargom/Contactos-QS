// Módulo de Consulta, Búsqueda y Gestión de Contactos
const DirectoryModule = {
  contacts: [],
  catalogs: null,
  filters: {
    q: '',
    tipo_contacto: '',
    sede_id: '',
    departamento_id: '',
    country_name: '',
    estado: '',
    pendientes: '',
    campania_id: '',
    fecha_inicio: '',
    fecha_fin: '',
    mis_registros_solamente: ''
  },
  selectedContact: null,
  selectedIds: new Set(),
  pendingDeleteIds: null,
  bulkDeleting: false,
  loadingContacts: false,
  listVersion: 0,
  page: 1,
  pagination: null,

  init(catalogs) {
    this.catalogs = catalogs;
    this.clearSelection();
    this.contacts = [];
    this.render();
    this.loadContacts();
  },

  render() {
    const container = document.getElementById('directory-view');
    if (!container) return;

    const isAdmin = App.currentUser?.rol === 'ADMIN';
    const sedesOpts = (this.catalogs?.sedes || []).map(s => `<option value="${this.escapeSelectionText(s.id)}">${this.escapeSelectionText(s.nombre)}</option>`).join('');
    const deptosOpts = (this.catalogs?.departamentos || []).map(d => `<option value="${this.escapeSelectionText(d.id)}">${this.escapeSelectionText(d.nombre)}</option>`).join('');
    const paisesOpts = (this.catalogs?.paises || []).map(p => `<option value="${this.escapeSelectionText(p)}">${this.escapeSelectionText(p)}</option>`).join('');

    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 mb-6">
          <div>
            <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center text-sm border border-blue-200/60 shadow-xs">
                <i class="fa-solid fa-address-book text-blue-900"></i>
              </span>
              Directorio y Consulta de Contactos
            </h2>
            <p class="text-xs sm:text-sm text-slate-500 mt-1">Administración, filtrado facetado y trazabilidad de contactos QS.</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <button class="btn btn-outline btn-sm" onclick="DirectoryModule.loadContacts()">
              <i class="fa-solid fa-arrows-rotate text-xs"></i>
              Refrescar Lista
            </button>
            <button class="btn btn-tec btn-sm shadow-xs" onclick="DirectoryModule.exportToExcel()">
              <i class="fa-solid fa-file-excel text-emerald-300 mr-1.5"></i>
              Exportar a Excel (.xlsx)
            </button>
          </div>
        </div>

        <!-- Aviso de Privacidad para Usuarios Estándar -->
        ${!isAdmin ? `
          <div class="bg-blue-50/80 border border-blue-200/90 rounded-xl px-4 py-3 mb-5 flex items-center gap-3 text-xs text-blue-950 shadow-2xs">
            <span class="w-7 h-7 rounded-lg bg-blue-900 text-white flex items-center justify-center text-xs shrink-0">
              <i class="fa-solid fa-user-shield"></i>
            </span>
            <div>
              <strong class="font-bold">Vista de privacidad activa:</strong> Como usuario institucional, se muestran únicamente los contactos registrados por usted (mediante registro individual o carga masiva).
            </div>
          </div>
        ` : ''}

        <!-- Barra de Filtros Facetados (Requisito 14) -->
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-3.5">
            <!-- Búsqueda libre -->
            <div class="form-group sm:col-span-2">
              <label class="form-label text-xs">Búsqueda rápida</label>
              <input type="text" class="form-control" id="dir-filter-q" placeholder="Buscar por nombre, correo, institución, empresa o cargo..." value="${this.escapeSelectionText(this.filters.q)}">
            </div>

            <!-- Tipo -->
            <div class="form-group">
              <label class="form-label text-xs">Tipo de Contacto</label>
              <select class="form-control" id="dir-filter-tipo">
                <option value="">Todos los tipos</option>
                <option value="ACADEMICO">Académicos</option>
                <option value="EMPLEADOR">Empleadores</option>
              </select>
            </div>

            <!-- Estado -->
            <div class="form-group">
              <label class="form-label text-xs">Estado de Validación</label>
              <select class="form-control" id="dir-filter-estado">
                <option value="">Todos los estados</option>
                <option value="NUEVO">Incompleto / nuevo</option>
                <option value="PENDIENTES">Todos los pendientes de revisión</option>
                <option value="VALIDADO">Validado</option>
                <option value="POSIBLE_DUPLICADO">Posible duplicado</option>
                <option value="DUPLICADO">Duplicado</option>
                <option value="CORREGIDO">Corregido</option>
                <option value="EXPORTADO">Exportado</option>
              </select>
            </div>

            <!-- Sede -->
            <div class="form-group">
              <label class="form-label text-xs">Sede del TEC</label>
              <select class="form-control" id="dir-filter-sede">
                <option value="">Todas las sedes</option>
                ${sedesOpts}
              </select>
            </div>

            <!-- Departamento -->
            <div class="form-group">
              <label class="form-label text-xs">Escuela / Departamento</label>
              <select class="form-control" id="dir-filter-depto">
                <option value="">Todos los departamentos</option>
                ${deptosOpts}
              </select>
            </div>

            <!-- País -->
            <div class="form-group"><label class="form-label text-xs" for="dir-filter-campaign">Campaña</label>
              <select id="dir-filter-campaign" class="form-control"><option value="">Todas las campañas</option>
              <option value="SIN_ASIGNAR">Sin campaña asignada</option>
              ${(this.catalogs?.campanias || []).map(c => `<option value="${this.escapeSelectionText(c.id)}">${this.escapeSelectionText(c.nombre)}</option>`).join('')}</select></div>
            <div class="form-group sm:col-span-2">
              <label class="form-label text-xs">País</label>
              <select class="form-control" id="dir-filter-pais">
                <option value="">Todos los países</option>
                ${paisesOpts}
              </select>
            </div>
          </div>

          <!-- Filtro de Administrador: Solo mis registros -->
          ${isAdmin ? `
            <div class="pt-2 mb-3 border-t border-slate-200/70 flex items-center justify-between">
              <label class="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                <input type="checkbox" 
                       id="dir-filter-solo-mios" 
                       class="accent-blue-900 w-4 h-4 rounded" 
                       ${this.filters.mis_registros_solamente === 'true' ? 'checked' : ''} 
                       onchange="DirectoryModule.toggleSoloMios(this.checked)">
                <span>Ver únicamente mis registros ingresados (como creador o recomendador)</span>
              </label>
              <span class="text-[11px] text-slate-400">Modo de filtrado personal</span>
            </div>
          ` : ''}

          <div class="flex justify-end gap-2">
            <button class="btn btn-outline btn-sm" onclick="DirectoryModule.clearFilters()">Limpiar Filtros</button>
            <button class="btn btn-tec btn-sm" onclick="DirectoryModule.applyFilters()">Aplicar Filtros</button>
          </div>
        </div>

        ${isAdmin ? `
          <div class="flex flex-wrap items-center justify-between gap-3 border border-slate-200 rounded-xl p-3 mb-4" aria-label="Selección de contactos">
            <span id="dir-selected-count" class="text-sm font-semibold text-slate-700" aria-live="polite">0 contactos seleccionados</span>
            <div class="flex flex-wrap gap-2">
              <button id="dir-clear-selection" class="btn btn-outline btn-sm" disabled onclick="DirectoryModule.clearSelection()">Limpiar selección</button>
              <button id="dir-delete-selected" class="btn btn-outline btn-sm text-red-700 border-red-300" disabled onclick="DirectoryModule.confirmDeleteSelected()">Eliminar seleccionados</button>
            </div>
          </div>` : ''}
        <!-- Tabla de Contactos -->
        <div id="dir-table-area">
          <div class="text-center py-8 text-slate-400">Cargando registros...</div>
        </div>
      </div>

      <!-- Contenedor de Modales (Detalle / Edición / Resolución) -->
      <div id="dir-modal-container"></div>
    `;

    this.attachFilterEvents();
    document.getElementById('dir-filter-estado').value = this.filters.pendientes === 'true' ? 'PENDIENTES' : this.filters.estado;
    document.getElementById('dir-filter-campaign').value = this.filters.campania_id || '';
  },

  attachFilterEvents() {
    const qInput = document.getElementById('dir-filter-q');
    if (qInput) {
      let debounceTimeout;
      qInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          this.filters.q = e.target.value.trim();
          this.loadContacts();
        }, 350);
      });
    }
  },

  toggleSoloMios(checked) {
    this.filters.mis_registros_solamente = checked ? 'true' : '';
    this.loadContacts();
  },

  exportToExcel() {
    const params = new URLSearchParams();
    Object.entries(this.filters).forEach(([k, v]) => {
      if (v) params.append(k, v);
    });
    App.showToast('📊 Generando archivo Excel del Directorio...', 'info');
    window.location.href = `/api/contacts/export-directory?${params.toString()}`;
  },

  applyFilters() {
    this.filters.q = document.getElementById('dir-filter-q')?.value.trim() || '';
    this.filters.tipo_contacto = document.getElementById('dir-filter-tipo')?.value || '';
    this.filters.estado = document.getElementById('dir-filter-estado')?.value || '';
    this.filters.pendientes = this.filters.estado === 'PENDIENTES' ? 'true' : '';
    if (this.filters.pendientes) this.filters.estado = '';
    this.filters.campania_id = document.getElementById('dir-filter-campaign')?.value || '';
    this.filters.sede_id = document.getElementById('dir-filter-sede')?.value || '';
    this.filters.departamento_id = document.getElementById('dir-filter-depto')?.value || '';
    this.filters.country_name = document.getElementById('dir-filter-pais')?.value || '';
    const soloMiosEl = document.getElementById('dir-filter-solo-mios');
    if (soloMiosEl) {
      this.filters.mis_registros_solamente = soloMiosEl.checked ? 'true' : '';
    }
    this.loadContacts();
  },

  clearFilters() {
    this.filters = { q: '', tipo_contacto: '', sede_id: '', departamento_id: '', country_name: '', estado: '', fecha_inicio: '', fecha_fin: '', mis_registros_solamente: '' };
    this.render();
    this.loadContacts();
  },

  async loadContacts(resetPage = true) {
    if (resetPage) this.page = 1;
    const version = ++this.listVersion;
    this.loadingContacts = true;
    this.clearSelection();
    try {
      const response = await API.get('/api/contacts', { ...this.filters, page: this.page, page_size: 50 });
      if (version !== this.listVersion) return;
      this.contacts = response.contacts || [];
      this.pagination = response;
      this.page = response.page || 1;
      this.loadingContacts = false;
      this.renderTable();
    } catch (err) {
      if (version === this.listVersion) App.showToast('Error al cargar contactos: ' + err.message, 'error');
    } finally {
      if (version === this.listVersion) {
        this.loadingContacts = false;
        this.updateSelectionUI();
      }
    }
  },

  changePage(delta) {
    this.page += delta;
    this.loadContacts(false);
  },

  escapeSelectionText(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  },

  clearSelection() {
    this.selectedIds.clear();
    if (this.pendingDeleteIds && !this.bulkDeleting) this.closeModal();
    this.updateSelectionUI();
  },

  toggleContactSelection(id, checked) {
    if (App.currentUser?.rol !== 'ADMIN' || this.loadingContacts || this.bulkDeleting) return;
    if (!this.contacts.some(c => c.id === id)) return;
    if (checked) this.selectedIds.add(id);
    else this.selectedIds.delete(id);
    this.updateSelectionUI();
  },

  toggleAllSelection(checked) {
    if (App.currentUser?.rol !== 'ADMIN' || this.loadingContacts || this.bulkDeleting) return;
    this.selectedIds = checked ? new Set(this.contacts.map(c => c.id)) : new Set();
    this.updateSelectionUI();
  },

  updateSelectionUI() {
    const isAdmin = App.currentUser?.rol === 'ADMIN';
    if (!isAdmin) this.selectedIds.clear();
    const count = this.selectedIds.size;
    const counter = document.getElementById('dir-selected-count');
    if (counter) counter.textContent = `${count} ${count === 1 ? 'contacto seleccionado' : 'contactos seleccionados'}`;
    for (const id of ['dir-delete-selected', 'dir-clear-selection']) {
      const button = document.getElementById(id);
      if (button) button.disabled = !isAdmin || !count || this.loadingContacts || this.bulkDeleting;
    }
    const all = document.getElementById('dir-select-all');
    if (all) {
      all.checked = this.contacts.length > 0 && count === this.contacts.length;
      all.indeterminate = count > 0 && count < this.contacts.length;
      all.disabled = !isAdmin || !this.contacts.length || this.loadingContacts || this.bulkDeleting;
    }
    for (const checkbox of document.querySelectorAll('[data-contact-select]')) {
      checkbox.checked = this.selectedIds.has(checkbox.value);
      checkbox.disabled = !isAdmin || this.loadingContacts || this.bulkDeleting;
    }
  },

  confirmDeleteSelected() {
    if (App.currentUser?.rol !== 'ADMIN' || this.loadingContacts || this.bulkDeleting || !this.selectedIds.size) return;
    const selected = this.contacts.filter(c => this.selectedIds.has(c.id));
    if (!selected.length) return;
    this.pendingDeleteIds = selected.map(c => c.id);
    const modal = document.getElementById('dir-modal-container');
    if (!modal) { this.pendingDeleteIds = null; return; }
    modal.innerHTML = `<div class="modal-overlay"><div class="modal-content" style="max-width: 560px;" role="dialog" aria-modal="true" aria-labelledby="dir-delete-many-title">
      <div class="modal-header"><h3 id="dir-delete-many-title" class="modal-title text-red-700">Eliminar contactos seleccionados</h3></div>
      <p class="text-sm text-slate-700 my-4">¿Confirma la eliminación de <strong>${selected.length} ${selected.length === 1 ? 'contacto' : 'contactos'}</strong>? Esta acción eliminará los registros del directorio y conservará el evento en la auditoría.</p>
      <ul class="max-h-48 overflow-y-auto text-sm text-slate-600 mb-4">${selected.slice(0, 20).map(c => `<li>${this.escapeSelectionText(`${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Sin nombre')}</li>`).join('')}</ul>
      ${selected.length > 20 ? `<p class="text-sm mb-4">Y ${selected.length - 20} contactos adicionales de la selección.</p>` : ''}
      <div class="flex justify-end gap-3"><button id="dir-bulk-delete-cancel" type="button" class="btn btn-outline" onclick="DirectoryModule.closeModal()">Cancelar</button>
        <button id="dir-bulk-delete-confirm" type="button" class="btn btn-tec" onclick="DirectoryModule.deleteSelectedContacts()">Sí, eliminar ${selected.length} ${selected.length === 1 ? 'contacto' : 'contactos'}</button></div>
      </div></div>`;
    document.getElementById('dir-bulk-delete-cancel')?.focus?.();
  },

  async deleteSelectedContacts() {
    if (App.currentUser?.rol !== 'ADMIN' || this.bulkDeleting || !this.pendingDeleteIds?.length) return;
    const ids = [...this.pendingDeleteIds];
    this.bulkDeleting = true;
    for (const id of ['dir-bulk-delete-confirm', 'dir-bulk-delete-cancel']) {
      const button = document.getElementById(id);
      if (button) button.disabled = true;
    }
    this.updateSelectionUI();
    try {
      const response = await API.post('/api/contacts/bulk-delete', { ids, confirmed: true });
      this.bulkDeleting = false;
      this.closeModal();
      this.clearSelection();
      App.showToast(response.message || `Se eliminaron ${response.deletedCount} contactos.`, 'success');
      await this.loadContacts();
    } catch (err) {
      this.bulkDeleting = false;
      App.showToast(err.message || 'Error al eliminar los contactos seleccionados.', 'error');
      if (err.status === 409) {
        this.closeModal();
        await this.loadContacts();
      }
    } finally {
      this.bulkDeleting = false;
      for (const id of ['dir-bulk-delete-confirm', 'dir-bulk-delete-cancel']) {
        const button = document.getElementById(id);
        if (button) button.disabled = false;
      }
      this.updateSelectionUI();
    }
  },

  renderTable() {
    const area = document.getElementById('dir-table-area');
    if (!area) return;
    const isAdmin = App.currentUser?.rol === 'ADMIN';
    const visibleIds = new Set(this.contacts.map(c => c.id));
    this.selectedIds = new Set([...this.selectedIds].filter(id => visibleIds.has(id)));
    this.updateSelectionUI();

    if (this.contacts.length === 0) {
      area.innerHTML = `
        <div class="text-center py-12 text-slate-400">
          <i class="fa-solid fa-magnifying-glass text-3xl mb-2 block text-slate-300"></i>
          <p class="font-medium text-sm">No se encontraron contactos que coincidan con los criterios de búsqueda.</p>
        </div>
      `;
      return;
    }

    area.innerHTML = `
      <div class="mb-3 text-xs text-slate-500 font-medium flex items-center justify-between">
        <span>Mostrando <strong>${this.contacts.length}</strong> contactos registrados:</span>
        <span class="text-[11px] text-slate-400">${this.pagination?.total || this.contacts.length} en total · Página ${this.page} de ${this.pagination?.pages || 1}</span>
        <div class="flex gap-2"><button type="button" class="btn btn-outline btn-xs" ${this.page <= 1 ? 'disabled' : ''} onclick="DirectoryModule.changePage(-1)">Anterior</button>
        <button type="button" class="btn btn-outline btn-xs" ${this.page >= (this.pagination?.pages || 1) ? 'disabled' : ''} onclick="DirectoryModule.changePage(1)">Siguiente</button></div>
      </div>
      <div class="table-responsive-fit">
        <table class="data-table-fit">
          <thead>
            <tr>
              ${isAdmin ? `<th style="width: 4%; padding: 0.65rem 0.35rem; text-align: center;"><input id="dir-select-all" type="checkbox" aria-label="Seleccionar todos los contactos visibles" title="Seleccionar todos los resultados visibles" onchange="DirectoryModule.toggleAllSelection(this.checked)"></th>` : ''}
              <th style="width: ${isAdmin ? 25 : 26}%;">Contacto y Tipo</th>
              <th style="width: ${isAdmin ? 26 : 27}%;">Institución / Empresa & Cargo</th>
              <th style="width: ${isAdmin ? 25 : 26}%;">Procedencia TEC</th>
              <th style="width: 11%;">País y Estado</th>
              <th style="width: ${isAdmin ? 9 : 10}%; text-align: center;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${this.contacts.map(c => {
              const badgeClass =
                c.estado === 'VALIDADO' ? 'badge-validado' :
                c.estado === 'POSIBLE_DUPLICADO' ? 'badge-posible' :
                c.estado === 'DUPLICADO' ? 'badge-duplicado' :
                c.estado === 'CORREGIDO' ? 'badge-corregido' :
                c.estado === 'EXPORTADO' ? 'badge-exportado' : 'badge-nuevo';

              const isAcademico = c.tipo_contacto === 'ACADEMICO';
              const safeFullName = encodeURIComponent(`${c.first_name || ''} ${c.last_name || ''}`.trim()).replace(/'/g, '%27');

              return `
                <tr>
                  ${isAdmin ? `<td style="padding: 0.7rem 0.35rem; text-align: center;"><input type="checkbox" data-contact-select value="${this.escapeSelectionText(c.id)}" aria-label="Seleccionar ${this.escapeSelectionText(`${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'contacto')}" onchange="DirectoryModule.toggleContactSelection(this.value, this.checked)"></td>` : ''}
                  <td>
                    <div class="mb-1">
                      <span class="badge ${isAcademico ? 'bg-blue-50 text-blue-900 border border-blue-200' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'} text-[10px] font-bold py-0.5 px-2">
                        ${isAcademico ? '🎓 Académico' : '💼 Empleador'}
                      </span>
                    </div>
                    <strong class="text-slate-900 font-bold text-xs sm:text-sm block">${this.escapeSelectionText(c.title || '')} ${this.escapeSelectionText(c.first_name)} ${this.escapeSelectionText(c.last_name)}</strong>
                    <code class="text-xs text-slate-500 font-mono break-all block mt-0.5">${this.escapeSelectionText(c.email)}</code>
                    ${c.phone ? `<span class="text-[11px] text-slate-500 block mt-0.5"><i class="fa-solid fa-phone text-[9px] text-slate-400 mr-1"></i>${this.escapeSelectionText(c.phone)}</span>` : ''}
                  </td>
                  <td>
                    <strong class="text-slate-800 font-semibold text-xs block leading-snug">${this.escapeSelectionText(c.institution || c.company_name || '-')}</strong>
                    <span class="text-xs text-slate-600 block mt-0.5">${this.escapeSelectionText(c.job_title || c.position || '-')}</span>
                    ${c.subject_area || c.industry ? `
                      <span class="text-[11px] text-slate-500 block mt-1">
                        <i class="fa-solid fa-tag text-[9px] text-slate-400 mr-1"></i>${this.escapeSelectionText(c.subject_area || c.industry)}
                      </span>
                    ` : ''}
                  </td>
                  <td>
                    <div class="font-semibold text-slate-800 text-xs flex items-center gap-1.5 leading-snug">
                      <i class="fa-solid fa-user-tie text-amber-600 text-[10px] shrink-0"></i>
                      <span>${this.escapeSelectionText(c.es_consolidado ? 'Administrador' : (c.recomienda_nombre || c.created_by_name || 'Funcionario TEC'))}</span>
                    </div>
                    ${!c.es_consolidado && c.recomienda_email ? `<code class="text-[11px] text-blue-800 font-mono break-all block mt-0.5">${this.escapeSelectionText(c.recomienda_email)}</code>` : ''}
                    <span class="text-slate-500 text-[11px] block mt-1">${c.es_consolidado ? 'Carga consolidada institucional' : `${this.escapeSelectionText(c.sede_nombre || 'Sede N/A')} · ${this.escapeSelectionText(c.departamento_nombre || 'Depto. N/A')}`}</span>
                  </td>
                  <td>
                    <div class="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
                      <i class="fa-solid fa-earth-americas text-slate-400 text-[11px] shrink-0"></i>
                      <span>${this.escapeSelectionText(c.country_name)}</span>
                    </div>
                    <span class="badge ${badgeClass} text-[10px]">${this.escapeSelectionText(c.estado)}</span>
                  </td>
                  <td style="text-align: center;">
                    <div class="flex items-center justify-center gap-1">
                      <button class="btn btn-outline btn-xs px-2 py-1 text-slate-700 hover:text-blue-900 hover:bg-blue-50 border-slate-300" 
                              onclick="DirectoryModule.viewDetails('${this.escapeSelectionText(c.id)}')"
                              title="Ver Expediente y Auditoría">
                        <i class="fa-solid fa-eye text-xs"></i>
                      </button>
                      <button class="btn btn-outline btn-xs px-2 py-1 text-slate-700 hover:text-blue-900 hover:bg-blue-50 border-slate-300" 
                              onclick="DirectoryModule.editContact('${this.escapeSelectionText(c.id)}')"
                              title="Editar Contacto">
                        <i class="fa-solid fa-pen text-xs"></i>
                      </button>
                      <button class="btn btn-outline btn-xs px-2 py-1 text-red-600 hover:text-white hover:bg-red-600 border-red-300 transition-colors" 
                              onclick="DirectoryModule.confirmDelete('${this.escapeSelectionText(c.id)}', '${safeFullName}')"
                              title="Eliminar Contacto Reportado">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    this.updateSelectionUI();
  },

  async viewDetails(id) {
    try {
      const response = await API.get(`/api/contacts/${id}`);
      const { contact, auditHistory } = response;
      const modal = document.getElementById('dir-modal-container');
      if (!modal) return;

      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-content" style="max-width: 750px;">
            <div class="modal-header">
              <h3 class="modal-title flex items-center gap-2">
                <i class="fa-solid fa-file-invoice text-tec-primary"></i>
                Expediente y Auditoría del Contacto
              </h3>
              <button class="modal-close" onclick="DirectoryModule.closeModal()">&times;</button>
            </div>

            <!-- Identificación y Procedencia Institucional de quien recomienda el contacto -->
            <div class="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3.5 mb-4 text-xs">
              <div class="font-bold text-blue-950 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <i class="fa-solid fa-user-check text-blue-800"></i>
                Identificación de quien recomienda el contacto (Funcionario/a TEC)
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-slate-700">
                <div>
                  <span class="text-slate-500 block text-[11px]">Funcionario/a que recomienda:</span>
                  <strong class="text-slate-900">${this.escapeSelectionText(contact.es_consolidado ? 'Administrador' : (contact.recomienda_nombre || contact.created_by_name || 'No especificado'))}</strong>
                </div>
                <div>
                  <span class="text-slate-500 block text-[11px]">Correo institucional del recomendador:</span>
                  <code class="text-blue-900 font-semibold">${this.escapeSelectionText(contact.es_consolidado ? 'Carga consolidada institucional' : (contact.recomienda_email || '(No registrado)'))}</code>
                </div>
                <div>
                  <span class="text-slate-500 block text-[11px]">Sede de procedencia:</span>
                  <strong class="text-slate-800">${this.escapeSelectionText(contact.sede_nombre || 'Sede no asignada')}</strong>
                </div>
                <div>
                  <span class="text-slate-500 block text-[11px]">${contact.es_consolidado ? 'Escuela Proponente:' : 'Carrera / Escuela / Departamento:'}</span>
                  <strong class="text-slate-800">${this.escapeSelectionText(contact.departamento_nombre || 'No asignado')}</strong>
                </div>
              </div>
            </div>

            <!-- Ficha Técnica -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl mb-5 text-sm">
              <div>
                <div><strong>Tipo:</strong> ${this.escapeSelectionText(contact.tipo_contacto)}</div>
                <div><strong>Nombre:</strong> ${this.escapeSelectionText(contact.title)} ${this.escapeSelectionText(contact.first_name)} ${this.escapeSelectionText(contact.last_name)}</div>
                <div><strong>Correo:</strong> <code>${this.escapeSelectionText(contact.email)}</code></div>
                <div><strong>Teléfono:</strong> ${this.escapeSelectionText(contact.phone || '(No registrado)')}</div>
                <div><strong>País:</strong> ${this.escapeSelectionText(contact.country_name)}</div>
              </div>
              <div>
                <div><strong>Institución/Empresa:</strong> ${this.escapeSelectionText(contact.institution || contact.company_name)}</div>
                <div><strong>Puesto/Cargo:</strong> ${this.escapeSelectionText(contact.job_title || contact.position)}</div>
                <div><strong>Disciplina/Sector:</strong> ${this.escapeSelectionText(contact.subject_area || contact.industry)}</div>
                <div><strong>Estado:</strong> <span class="badge badge-validado">${this.escapeSelectionText(contact.estado)}</span></div>
                <div><strong>Método de Ingreso:</strong> ${this.escapeSelectionText(contact.metodo_ingreso)}</div>
              </div>
            </div>

            <!-- Trazabilidad Institucional (Requisito 15) -->
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Historial de Trazabilidad y Auditoría</h4>
            <div class="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
              <table class="data-table text-xs">
                <thead>
                  <tr>
                    <th>Fecha / Hora</th>
                    <th>Usuario Responsable</th>
                    <th>Acción</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  ${auditHistory.map(a => `
                    <tr>
                      <td>${new Date(a.created_at).toLocaleString()}</td>
                      <td>${this.escapeSelectionText(a.usuario_nombre)}</td>
                      <td><strong>${this.escapeSelectionText(a.accion)}</strong></td>
                      <td><code>${this.escapeSelectionText(a.detalles)}</code></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Acciones de resolución si es Posible Duplicado -->
            ${contact.estado === 'POSIBLE_DUPLICADO' ? `
              <div class="alert alert-warning mt-4">
                <div>
                  <strong>Atención:</strong> Este contacto se encuentra en estado de revisión de duplicados.
                  <div class="mt-2 flex gap-2">
                    <button class="btn btn-sm btn-tec" onclick="DirectoryModule.resolveDuplicate('${this.escapeSelectionText(contact.id)}', 'CONFIRM_VALID')">
                      Aprobar Como Contacto Válido
                    </button>
                    <button class="btn btn-sm btn-outline text-red-600 border-red-300" onclick="DirectoryModule.resolveDuplicate('${this.escapeSelectionText(contact.id)}', 'DISCARD')">
                      Descartar Como Duplicado
                    </button>
                  </div>
                </div>
              </div>
            ` : ''}

            <div class="flex flex-wrap items-center justify-between gap-3 mt-5 pt-3 border-t border-slate-100">
              <button type="button" class="btn btn-outline text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 btn-sm" 
                      onclick="DirectoryModule.confirmDelete('${this.escapeSelectionText(contact.id)}', '${encodeURIComponent(`${contact.first_name || ''} ${contact.last_name || ''}`.trim()).replace(/'/g, '%27')}')">
                <i class="fa-solid fa-trash-can mr-1.5"></i>
                Eliminar Contacto Reportado
              </button>
              <div class="flex gap-2">
                <button type="button" class="btn btn-outline btn-sm" onclick="DirectoryModule.editContact('${this.escapeSelectionText(contact.id)}')">
                  <i class="fa-solid fa-pen mr-1"></i> Editar
                </button>
                <button type="button" class="btn btn-tec btn-sm" onclick="DirectoryModule.closeModal()">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      App.showToast('Error al obtener detalle: ' + err.message, 'error');
    }
  },

  async editContact(id) {
    try {
      const response = await API.get(`/api/contacts/${id}`);
      const { contact } = response;
      this.selectedContact = contact;
      const isAcademic = contact.tipo_contacto === 'ACADEMICO';
      const modal = document.getElementById('dir-modal-container');
      if (!modal) return;

      const countriesOpts = [...new Set([...(this.catalogs?.paises || []), contact.country_name])].filter(Boolean).map(p => `<option value="${this.escapeSelectionText(p)}" ${p === contact.country_name ? 'selected' : ''}>${this.escapeSelectionText(p)}</option>`).join('');
      const titlesOpts = [...new Set([...(this.catalogs?.titulos || []), contact.title])].filter(Boolean).map(t => `<option value="${this.escapeSelectionText(t)}" ${t === contact.title ? 'selected' : ''}>${this.escapeSelectionText(t)}</option>`).join('');

      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-content" style="max-width: 650px;">
            <div class="modal-header">
              <h3 class="modal-title">Editar Contacto (${this.escapeSelectionText(contact.tipo_contacto)})</h3>
              <button class="modal-close" onclick="DirectoryModule.closeModal()">&times;</button>
            </div>

            <form id="edit-form" onsubmit="event.preventDefault(); DirectoryModule.saveEdit('${this.escapeSelectionText(contact.id)}');">
              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label">Título *</label>
                  <select class="form-control" id="edit-title" required>${titlesOpts}</select>
                </div>
                <div class="form-group">
                  <label class="form-label">Nombre *</label>
                  <input type="text" class="form-control" id="edit-first_name" value="${this.escapeSelectionText(contact.first_name)}" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Apellido *</label>
                  <input type="text" class="form-control" id="edit-last_name" value="${this.escapeSelectionText(contact.last_name)}" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Correo Electrónico *</label>
                  <input type="email" class="form-control" id="edit-email" value="${this.escapeSelectionText(contact.email)}" required>
                </div>
                <div class="form-group">
                  <label class="form-label">País *</label>
                  <select class="form-control" id="edit-country_name" required>${countriesOpts}</select>
                </div>
                <div class="form-group">
                  <label class="form-label">Teléfono</label>
                  <input type="tel" class="form-control" id="edit-phone" value="${this.escapeSelectionText(contact.phone || '')}">
                </div>

                ${isAcademic ? `
                  <div class="form-group">
                    <label class="form-label">Puesto / Cargo *</label>
                    <input type="text" class="form-control" id="edit-job_title" value="${this.escapeSelectionText(contact.job_title)}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Institución *</label>
                    <input type="text" class="form-control" id="edit-institution" value="${this.escapeSelectionText(contact.institution)}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Disciplina académica *</label>
                    <input type="text" class="form-control" id="edit-subject_area" value="${this.escapeSelectionText(contact.subject_area || '')}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Departamento *</label>
                    <input type="text" class="form-control" id="edit-department_unit" value="${this.escapeSelectionText(contact.department_unit)}" required>
                  </div>
                ` : `
                  <div class="form-group">
                    <label class="form-label">Posición *</label>
                    <input type="text" class="form-control" id="edit-position" value="${this.escapeSelectionText(contact.position)}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Industria / Sector *</label>
                    <input type="text" class="form-control" id="edit-industry" value="${this.escapeSelectionText(contact.industry || '')}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Empresa *</label>
                    <input type="text" class="form-control" id="edit-company_name" value="${this.escapeSelectionText(contact.company_name)}" required>
                  </div>
                `}
                <div class="form-group sm:col-span-2 bg-slate-50 p-3 rounded-lg border border-slate-200 mt-2">
                  <div class="text-xs font-bold text-slate-700 uppercase mb-2">Identificación de quien recomienda (TEC)</div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="form-label text-xs">Nombre Funcionario/a TEC</label>
                      <input type="text" class="form-control text-sm bg-white" readonly id="edit-recomienda_nombre" value="${this.escapeSelectionText(contact.recomienda_nombre || '')}">
                    </div>
                    <div>
                      <label class="form-label text-xs">Correo institucional (@itcr.ac.cr)</label>
                      <input type="email" class="form-control text-sm bg-white" readonly id="edit-recomienda_email" value="${this.escapeSelectionText(contact.recomienda_email || '')}">
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex justify-end gap-3 mt-6">
                <button type="button" class="btn btn-outline" onclick="DirectoryModule.closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-tec">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      `;
    } catch (err) {
      App.showToast('Error al abrir formulario de edición: ' + err.message, 'error');
    }
  },

  async saveEdit(id) {
    document.querySelectorAll('[data-edit-error]').forEach(el => el.remove());
    const updatedData = {
      version: this.selectedContact?.version,
      subject_area: document.getElementById('edit-subject_area')?.value,
      industry: document.getElementById('edit-industry')?.value,
      title: document.getElementById('edit-title').value,
      first_name: document.getElementById('edit-first_name').value,
      last_name: document.getElementById('edit-last_name').value,
      email: document.getElementById('edit-email').value,
      country_name: document.getElementById('edit-country_name').value,
      phone: document.getElementById('edit-phone').value,
      job_title: document.getElementById('edit-job_title')?.value,
      institution: document.getElementById('edit-institution')?.value,
      department_unit: document.getElementById('edit-department_unit')?.value,
      position: document.getElementById('edit-position')?.value,
      company_name: document.getElementById('edit-company_name')?.value,
      recomienda_nombre: document.getElementById('edit-recomienda_nombre')?.value,
      recomienda_email: document.getElementById('edit-recomienda_email')?.value
    };

    try {
      await API.put(`/api/contacts/${id}`, updatedData);
      App.showToast('✅ Contacto actualizado correctamente.', 'success');
      this.closeModal();
      this.loadContacts();
    } catch (err) {
      for (const [field, message] of Object.entries(err.data?.validationErrors || {})) {
        const key = ({ subject: 'subject_area', department: 'department_unit', country: 'country_name' })[field] || field;
        const input = document.getElementById(`edit-${key}`);
        if (input) {
          const error = document.createElement('p'); error.dataset.editError = '';
          error.className = 'text-xs text-red-700'; error.textContent = message; input.after(error);
        }
      }
      App.showToast(err.message || 'Revise los campos indicados.', 'error');
    }
  },

  async resolveDuplicate(id, action) {
    try {
      await API.post(`/api/contacts/${id}/resolve-duplicate`, { action });
      App.showToast('Estado del contacto actualizado exitosamente.', 'success');
      this.closeModal();
      this.loadContacts();
    } catch (err) {
      App.showToast('Error al resolver duplicado: ' + err.message, 'error');
    }
  },

  confirmDelete(id, safeName) {
    const contactName = decodeURIComponent(safeName || 'este contacto');
    const modal = document.getElementById('dir-modal-container');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content" style="max-width: 520px;">
          <div class="modal-header">
            <h3 class="modal-title flex items-center gap-2 text-red-600 font-bold">
              <i class="fa-solid fa-triangle-exclamation"></i>
              Eliminar Contacto Reportado
            </h3>
            <button class="modal-close" onclick="DirectoryModule.closeModal()">&times;</button>
          </div>

          <div class="py-4">
            <p class="text-sm text-slate-700 mb-3">
              ¿Está seguro de que desea eliminar el contacto reportado <strong class="text-slate-900">${this.escapeSelectionText(contactName)}</strong>?
            </p>
            <div class="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-900 mb-2 flex items-start gap-2.5">
              <i class="fa-solid fa-circle-exclamation text-red-600 mt-0.5 shrink-0 text-sm"></i>
              <div>
                <strong>Aviso de Trazabilidad:</strong> Esta acción removerá el contacto del Directorio. El evento quedará registrado en la bitácora inmutable de auditoría para fines de rendición de cuentas.
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button type="button" class="btn btn-outline btn-sm" onclick="DirectoryModule.closeModal()">
              Cancelar
            </button>
            <button type="button" class="btn btn-sm bg-red-600 text-white hover:bg-red-700 shadow-xs" onclick="DirectoryModule.deleteContact('${id}')">
              <i class="fa-solid fa-trash-can mr-1.5"></i>
              Sí, Eliminar Contacto
            </button>
          </div>
        </div>
      </div>
    `;
  },

  async deleteContact(id) {
    try {
      const res = await API.delete(`/api/contacts/${id}`);
      if (res.success) {
        App.showToast('✅ Contacto eliminado exitosamente del directorio.', 'success');
        this.closeModal();
        this.loadContacts();
      } else {
        App.showToast(res.error || res.message || 'No se pudo eliminar el contacto', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'Error al eliminar el contacto reportado', 'error');
    }
  },

  closeModal() {
    if (this.bulkDeleting) return;
    this.pendingDeleteIds = null;
    const modal = document.getElementById('dir-modal-container');
    if (modal) modal.innerHTML = '';
  }
};
