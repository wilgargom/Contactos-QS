// Módulo de Carga Masiva mediante Excel (Administrador y Usuario)
const BulkUploadModule = {
  selectedFile: null,
  fileBase64: null,
  analysisResult: null,
  activeFilter: 'TODOS',
  consolidatedSheet: '',
  consolidatedQuery: '',
  consolidatedPage: 1,
  includeConsolidatedPending: false,
  analyzing: false,
  consolidatedImporting: false,
  analysisVersion: 0,
  tipoContacto: 'ACADEMICO',
  catalogs: null,
  selectedSedeId: '',
  selectedDeptoId: '',
  recomiendaNombre: '',
  recomiendaEmail: '',
  funcionarioIdentificado: null,
  recEmailCheckTimeout: null,
  modalEmailTimeout: null,

  init(catalogs) {
    this.catalogs = catalogs || App.catalogs;
    if (['FUNCIONARIOS', 'CONSOLIDADO'].includes(this.tipoContacto) && App.currentUser?.rol !== 'ADMIN') {
      this.tipoContacto = 'ACADEMICO';
    }
    this.resetReporter();
    this.selectedFile = null;
    this.fileBase64 = null;
    this.analysisResult = null;
    this.render();
  },

  escapeReporterText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  },

  getRecomiendaPrefix() {
    return this.recomiendaEmail.includes('@') && this.isInstitutionalEmail(this.recomiendaEmail)
      ? this.recomiendaEmail.split('@')[0] : this.recomiendaEmail;
  },

  getSelectedSedeNombre() {
    return this.isReporterVerified() ? this.funcionarioIdentificado.sede : 'Sede del TEC';
  },

  getSelectedDeptoNombre() {
    return this.isReporterVerified() ? this.funcionarioIdentificado.dependencia : 'Oficina o Departamento';
  },

  isInstitutionalEmail(email) {
    return typeof email === 'string' && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(itcr\.ac\.cr|tec\.ac\.cr)$/.test(email);
  },

  isReporterVerified() {
    const f = this.funcionarioIdentificado;
    return Boolean(f && !this.reporterLookupPending && this.isInstitutionalEmail(this.recomiendaEmail) &&
      f.email?.trim().toLowerCase() === this.recomiendaEmail && f.nombre?.trim() &&
      f.sede_id && f.departamento_id && this.recomiendaNombre === f.nombre);
  },

  resetReporter(email = '') {
    clearTimeout(this.recEmailCheckTimeout);
    this.reporterLookupVersion = (this.reporterLookupVersion || 0) + 1;
    this.reporterLookupPending = false;
    this.reporterValidationError = '';
    this.recomiendaEmail = email;
    this.recomiendaNombre = '';
    this.selectedSedeId = '';
    this.selectedDeptoId = '';
    this.selectedDeptoNombre = '';
    this.funcionarioIdentificado = null;
    for (const key of ['tec_qs_pref_recomienda_email', 'tec_qs_pref_recomienda_nombre',
        'tec_qs_pref_sede', 'tec_qs_pref_depto']) localStorage.removeItem(key);
  },

  onRecomiendaEmailInput(value) {
    const clean = String(value || '').trim().toLowerCase();
    const email = clean ? (clean.includes('@') ? clean : `${clean}@itcr.ac.cr`) : '';
    this.resetReporter(email);
    if (email && !this.isInstitutionalEmail(email)) {
      this.reporterValidationError = 'Ingrese un correo institucional válido (@itcr.ac.cr o @tec.ac.cr).';
    } else if (email) {
      this.reporterLookupPending = true;
      this.recEmailCheckTimeout = setTimeout(() => this.lookupFuncionario(email), 250);
    }
    this.updateCardDisplay();
  },

  async lookupFuncionario(email) {
    clearTimeout(this.recEmailCheckTimeout);
    if (email !== this.recomiendaEmail || !this.isInstitutionalEmail(email)) return;
    const version = this.reporterLookupVersion = (this.reporterLookupVersion || 0) + 1;
    this.funcionarioIdentificado = null;
    this.recomiendaNombre = '';
    this.selectedSedeId = '';
    this.selectedDeptoId = '';
    this.reporterLookupPending = true;
    this.reporterValidationError = '';
    this.updateCardDisplay();
    try {
      const res = await API.get('/api/funcionarios/by-email', { email });
      if (version !== this.reporterLookupVersion || email !== this.recomiendaEmail) return;
      const f = res.funcionario;
      if (res.exists && f?.email?.trim().toLowerCase() === email && f.nombre?.trim() &&
          f.sede_id && f.departamento_id) {
        this.funcionarioIdentificado = f;
        this.recomiendaNombre = f.nombre;
        this.selectedSedeId = f.sede_id;
        this.selectedDeptoId = f.departamento_id;
      } else {
        this.reporterValidationError = res.exists
          ? 'El funcionario tiene datos institucionales incompletos. Revise su registro en el padrón.'
          : 'Correo no encontrado en el padrón del TEC. Solicite al administrador su incorporación o corrección.';
      }
    } catch (_) {
      if (version !== this.reporterLookupVersion || email !== this.recomiendaEmail) return;
      this.reporterValidationError = 'No se logró verificar el correo. Intente nuevamente.';
    } finally {
      if (version === this.reporterLookupVersion && email === this.recomiendaEmail) {
        this.reporterLookupPending = false;
        this.updateCardDisplay();
      }
    }
  },

  limpiarFuncionario() {
    this.resetReporter();
    this.updateCardDisplay();
  },

  openNuevoUsuarioModal() {
    if (App.currentUser?.rol !== 'ADMIN') {
      App.showToast('Solicite al administrador la incorporación o corrección del funcionario en el padrón.', 'info');
      return;
    }
    const modalContainer = document.getElementById('bulk-modal-container');
    if (!modalContainer) return;

    const sedesOpts = (this.catalogs?.sedes || []).map(s => `
      <option value="${this.escapeReporterText(s.id)}" ${s.id === this.selectedSedeId ? 'selected' : ''}>${this.escapeReporterText(s.nombre)}</option>
    `).join('');

    modalContainer.innerHTML = `
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center text-sm border border-blue-200/60">
                <i class="fa-solid fa-user-plus text-blue-900"></i>
              </span>
              Incluir Nuevo Usuario / Funcionario
            </h3>
            <button type="button" class="text-slate-400 hover:text-slate-600 text-lg" onclick="BulkUploadModule.closeNuevoUsuarioModal()">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <p class="text-xs text-slate-500 mb-4">
            Registre al funcionario/a en el padrón institucional del TEC para asociarlo a los registros de carga masiva.
          </p>

          <form id="form-bulk-nuevo-funcionario" onsubmit="BulkUploadModule.saveNuevoUsuarioModal(event)" class="space-y-3.5">
            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Correo institucional del TEC *</label>
              <input type="text" 
                     id="bulk-modal-func-email" 
                     class="form-control text-sm" 
                     placeholder="usuario@itcr.ac.cr" 
                     required 
                     maxlength="120"
                     oninput="BulkUploadModule.onModalEmailInput(this.value)">
              <div class="error-feedback" id="err-bulk-modal-func-email"></div>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Nombre completo del funcionario/a *</label>
              <input type="text" 
                     id="bulk-modal-func-nombre" 
                     class="form-control text-sm" 
                     placeholder="Ej. Dr. Mario Fonseca Ruiz" 
                     required 
                     maxlength="100">
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Sede del TEC *</label>
              <select id="bulk-modal-func-sede" class="form-control text-sm" required>
                ${sedesOpts}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Carrera, Escuela, Departamento o Dependencia *</label>
              <input type="text" 
                     id="bulk-modal-func-dependencia" 
                     class="form-control text-sm" 
                     placeholder="Ej. Escuela de Ingeniería Forestal / Rectoría" 
                     required 
                     maxlength="120">
            </div>

            <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button type="button" class="btn btn-outline btn-sm" onclick="BulkUploadModule.closeNuevoUsuarioModal()">
                Cancelar
              </button>
              <button type="submit" class="btn btn-tec btn-sm" id="btn-save-bulk-modal-func">
                <i class="fa-solid fa-save mr-1"></i>
                Guardar en Padrón y Seleccionar
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const emailInput = document.getElementById('bulk-modal-func-email');
    if (emailInput) {
      emailInput.focus();
      const currentEmail = this.recomiendaEmail || (document.getElementById('bulk-recomienda-email')?.value?.trim() ? `${document.getElementById('bulk-recomienda-email').value.trim()}@itcr.ac.cr` : '');
      if (currentEmail) {
        emailInput.value = currentEmail;
        this.onModalEmailInput(currentEmail);
      }
    }
  },

  onModalEmailInput(val) {
    let clean = (val || '').trim().toLowerCase();
    if (clean && !clean.includes('@')) {
      clean = `${clean}@itcr.ac.cr`;
    }
    const feedbackEl = document.getElementById('err-bulk-modal-func-email');
    const btnSave = document.getElementById('btn-save-bulk-modal-func');
    if (!feedbackEl) return;

    clearTimeout(this.modalEmailTimeout);
    if (!clean || clean.length < 5) {
      feedbackEl.innerHTML = '';
      if (btnSave) {
        btnSave.innerHTML = '<i class="fa-solid fa-save mr-1"></i> Guardar en Padrón y Seleccionar';
      }
      return;
    }

    this.modalEmailTimeout = setTimeout(async () => {
      try {
        const res = await API.get(`/api/funcionarios/by-email?email=${encodeURIComponent(clean)}`);
        if (res.exists && res.funcionario) {
          const f = res.funcionario;
          feedbackEl.innerHTML = `
            <div class="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-xs mt-1.5 animate-fadeIn">
              <div class="font-bold flex items-center gap-1.5 text-blue-800">
                <i class="fa-solid fa-circle-check text-emerald-600"></i> Funcionario ya registrado en el padrón
              </div>
              <div class="mt-1 text-slate-700">
                <strong>${this.escapeReporterText(f.nombre)}</strong> (${this.escapeReporterText(f.dependencia || 'Dependencia no indicada')} · ${this.escapeReporterText(f.sede || 'Sede no indicada')}).
              </div>
              <div class="text-[11px] text-blue-700 mt-0.5">Sus datos se completaron automáticamente para seleccionarlo.</div>
            </div>
          `;
          const nombreInput = document.getElementById('bulk-modal-func-nombre');
          const sedeSelect = document.getElementById('bulk-modal-func-sede');
          const deptoInput = document.getElementById('bulk-modal-func-dependencia');
          if (nombreInput && f.nombre) nombreInput.value = f.nombre;
          if (sedeSelect && f.sede_id) sedeSelect.value = f.sede_id;
          if (deptoInput && f.dependencia) deptoInput.value = f.dependencia;
          if (btnSave) {
            btnSave.innerHTML = '<i class="fa-solid fa-user-check mr-1"></i> Seleccionar este Funcionario';
          }
        } else {
          feedbackEl.innerHTML = `
            <div class="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
              <i class="fa-solid fa-circle-info text-emerald-600"></i> Correo nuevo · Complete los datos para agregarlo al padrón institucional.
            </div>
          `;
          if (btnSave) {
            btnSave.innerHTML = '<i class="fa-solid fa-save mr-1"></i> Guardar en Padrón y Seleccionar';
          }
        }
      } catch (err) {
        console.warn('Error verificando correo en modal:', err);
      }
    }, 250);
  },

  closeNuevoUsuarioModal() {
    const modalContainer = document.getElementById('bulk-modal-container');
    if (modalContainer) modalContainer.innerHTML = '';
  },

  async saveNuevoUsuarioModal(event) {
    event.preventDefault();
    let email = document.getElementById('bulk-modal-func-email')?.value?.trim().toLowerCase() || '';
    if (email && !email.includes('@')) {
      email = `${email}@itcr.ac.cr`;
    }
    const nombre = document.getElementById('bulk-modal-func-nombre')?.value?.trim();
    const sedeId = document.getElementById('bulk-modal-func-sede')?.value;
    const dependencia = document.getElementById('bulk-modal-func-dependencia')?.value?.trim();
    const errEmail = document.getElementById('err-bulk-modal-func-email');

    if (!email || (!email.endsWith('@itcr.ac.cr') && !email.endsWith('@tec.ac.cr'))) {
      if (errEmail) errEmail.textContent = 'Debe indicar un correo institucional (@itcr.ac.cr o @tec.ac.cr).';
      return;
    }
    if (!nombre || nombre.length < 3) {
      App.showToast('El nombre debe tener al menos 3 caracteres.', 'warning');
      return;
    }
    if (!dependencia || dependencia.length < 2) {
      App.showToast('Debe indicar la dependencia o departamento.', 'warning');
      return;
    }

    const sedeObj = (this.catalogs?.sedes || []).find(s => s.id === sedeId);
    const sedeNombre = sedeObj ? sedeObj.nombre : 'Campus Central Cartago';
    const saveBtn = document.getElementById('btn-save-bulk-modal-func');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const res = await API.post('/api/funcionarios', {
        nombre,
        email,
        dependencia,
        sede: sedeNombre,
        sede_id: sedeId
      });

      if (res.success && res.funcionario) {
        App.showToast('🎉 Funcionario incluido exitosamente en el padrón institucional.', 'success');
        this.closeNuevoUsuarioModal();

        this.onRecomiendaEmailInput(res.funcionario.email);
        await this.lookupFuncionario(this.recomiendaEmail);
      }
    } catch (err) {
      App.showToast(err.message || 'Error al guardar funcionario', 'error');
      if (saveBtn) saveBtn.disabled = false;
    }
  },

  updateCardDisplay() {
    const verified = this.isReporterVerified();
    const input = document.getElementById('bulk-recomienda-email');
    if (input) {
      input.value = this.getRecomiendaPrefix();
      input.classList.toggle('is-valid', verified);
      input.classList.toggle('is-invalid', Boolean(this.reporterValidationError));
    }
    const domain = document.getElementById('bulk-recomienda-domain');
    if (domain) domain.textContent = this.isInstitutionalEmail(this.recomiendaEmail)
      ? '@' + this.recomiendaEmail.split('@')[1] : '@itcr.ac.cr';
    const icon = document.getElementById('bulk-card-funcionario-icon');
    if (icon) {
      icon.className = `w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0 border ${verified ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`;
      icon.innerHTML = `<i class="fa-solid ${verified ? 'fa-user-check' : 'fa-user'}"></i>`;
    }
    const values = {
      'bulk-card-display-nombre': verified ? this.funcionarioIdentificado.nombre : 'Nombre de la persona funcionaria',
      'bulk-card-display-depto': this.getSelectedDeptoNombre(),
      'bulk-card-display-sede': this.getSelectedSedeNombre(),
      'err-bulk-recomienda-email': this.reporterValidationError || ''
    };
    for (const [id, value] of Object.entries(values)) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }
    document.getElementById('bulk-rec-email-spinner')?.classList.toggle('hidden', !this.reporterLookupPending);
    const blocked = !['FUNCIONARIOS', 'CONSOLIDADO'].includes(this.tipoContacto) && !verified;
    const consolidatedCount = this.analysisResult ? this.analysisResult.summary.correctos - (this.includeConsolidatedPending ? 0 : this.analysisResult.summary.pendientesRevision) : 0;
    for (const id of ['excel-file-input', 'bulk-file-select', 'btn-import-valid', 'btn-import-potential']) {
      const el = document.getElementById(id);
      if (el) el.disabled = blocked || (this.tipoContacto === 'CONSOLIDADO' && id === 'btn-import-valid' && (!consolidatedCount || this.consolidatedImporting));
    }
  },

  render() {
    const container = document.getElementById('bulk-upload-view');
    if (!container) return;

    if (!App.currentUser) {
      container.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm text-center p-10">
          <i class="fa-solid fa-lock text-amber-500 text-4xl mb-3 block"></i>
          <h3 class="text-lg font-bold text-slate-900">Inicio de Sesión Requerido</h3>
          <p class="text-slate-500 text-sm max-w-md mx-auto mt-1">
            Debe iniciar sesión para utilizar el módulo de carga masiva de contactos.
          </p>
        </div>
      `;
      return;
    }

    // Generar opciones de sedes
    const sedesOptions = (this.catalogs?.sedes || []).map(s => `
      <option value="${this.escapeReporterText(s.id)}" ${s.id === this.selectedSedeId ? 'selected' : ''}>${this.escapeReporterText(s.nombre)}</option>
    `).join('');

    // Filtrar departamentos de la sede
    const deptosParaSede = (this.catalogs?.departamentos || []).filter(d => !d.sede_id || d.sede_id === this.selectedSedeId);
    const todosDeptos = (this.catalogs?.departamentos || []);
    const listaDeptos = deptosParaSede.length > 0 ? deptosParaSede : todosDeptos;

    const deptosOptions = listaDeptos.map(d => `
      <option value="${this.escapeReporterText(d.id)}" ${d.id === this.selectedDeptoId ? 'selected' : ''}>${this.escapeReporterText(d.nombre)}</option>
    `).join('');

    const isAdmin = App.currentUser?.rol === 'ADMIN';
    if (!isAdmin && ['FUNCIONARIOS', 'CONSOLIDADO'].includes(this.tipoContacto)) {
      this.tipoContacto = 'ACADEMICO';
    }

    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
        <div class="pb-6 border-b border-slate-100 mb-6 space-y-4 ${this.tipoContacto === 'CONSOLIDADO' && this.analysisResult ? 'hidden' : ''}">
          <div>
            <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center text-sm border border-emerald-200/60 shadow-xs">
                <i class="fa-solid fa-file-excel text-emerald-700"></i>
              </span>
              Plantillas para carga masiva de contactos
            </h2>
          </div>

          <!-- Plantillas oficiales: una sobre la otra con su respectiva descripción -->
          <div class="flex flex-col gap-3.5 pt-1">
            <!-- Plantilla de académicos -->
            <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-2xs hover:border-blue-200 transition-colors">
              <div class="flex-1 min-w-0 pr-2">
                <div class="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <span class="w-6 h-6 rounded-md bg-blue-100 text-blue-800 flex items-center justify-center text-xs">
                    <i class="fa-solid fa-graduation-cap"></i>
                  </span>
                  <span>Plantilla de académicos</span>
                </div>
                <p class="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Esta plantilla debe utilizarse para registrar y completar la información de los contactos académicos, de acuerdo con los campos y datos solicitados.
                </p>
              </div>
              <a href="/api/templates/ACADEMICO" download class="btn btn-outline btn-xs text-xs py-2 px-3.5 flex items-center gap-2 shadow-2xs bg-white hover:bg-blue-50 text-blue-900 border-slate-300 hover:border-blue-300 font-semibold transition-colors shrink-0">
                <i class="fa-solid fa-download text-xs text-blue-800"></i>
                <span>Descargar plantilla</span>
              </a>
            </div>

            <!-- Plantilla de empleadores -->
            <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-2xs hover:border-emerald-200 transition-colors">
              <div class="flex-1 min-w-0 pr-2">
                <div class="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <span class="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">
                    <i class="fa-solid fa-briefcase"></i>
                  </span>
                  <span>Plantilla de empleadores</span>
                </div>
                <p class="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Esta plantilla debe utilizarse para registrar y completar la información de los contactos empleadores, de acuerdo con los campos y datos solicitados.
                </p>
              </div>
              <a href="/api/templates/EMPLEADOR" download class="btn btn-outline btn-xs text-xs py-2 px-3.5 flex items-center gap-2 shadow-2xs bg-white hover:bg-emerald-50 text-emerald-900 border-slate-300 hover:border-emerald-300 font-semibold transition-colors shrink-0">
                <i class="fa-solid fa-download text-xs text-emerald-700"></i>
                <span>Descargar plantilla</span>
              </a>
            </div>

            ${isAdmin ? `
            <!-- Plantilla de funcionarios (Solo Administrador) -->
            <div class="bg-blue-50/40 border border-blue-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-2xs">
              <div class="flex-1 min-w-0 pr-2">
                <div class="flex items-center gap-2 font-bold text-blue-950 text-sm">
                  <span class="w-6 h-6 rounded-md bg-amber-100 text-amber-900 flex items-center justify-center text-xs">
                    <i class="fa-solid fa-address-book"></i>
                  </span>
                  <span>Plantilla de funcionarios (Administrador)</span>
                </div>
                <p class="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Esta plantilla debe utilizarse para la actualización del padrón institucional de funcionarios del TEC.
                </p>
              </div>
              <a href="/api/templates/FUNCIONARIOS" download class="btn btn-outline btn-xs text-xs py-2 px-3.5 flex items-center gap-2 shadow-2xs bg-white hover:bg-blue-100 text-blue-950 border-blue-300 font-semibold transition-colors shrink-0">
                <i class="fa-solid fa-download text-xs text-amber-600"></i>
                <span>Descargar plantilla</span>
              </a>
            </div>
            ` : ''}
          </div>
        </div>

        <!-- 1. Bloque: Datos de la persona del TEC que reporta la carga (solo para contactos) -->
        ${!['FUNCIONARIOS', 'CONSOLIDADO'].includes(this.tipoContacto) ? `
          <div class="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 mb-6 shadow-2xs">
            <div class="mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
              <h3 class="text-xs sm:text-sm font-bold text-blue-950 uppercase tracking-wider m-0 flex items-center gap-2">
                <span class="w-6 h-6 rounded-md bg-blue-900 text-white flex items-center justify-center text-xs">
                  <i class="fa-solid fa-id-card"></i>
                </span>
                Datos de la persona del TEC que reporta la carga
              </h3>
              <button type="button" 
                      class="btn btn-outline btn-xs text-blue-900 border-blue-200 bg-white hover:bg-blue-50 py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 rounded-lg shadow-2xs transition-colors shrink-0"
                      ${App.currentUser?.rol !== 'ADMIN' ? 'hidden' : ''} onclick="BulkUploadModule.openNuevoUsuarioModal()"
                      title="Incluir a una nueva persona funcionaria en el padrón del TEC">
                <i class="fa-solid fa-user-plus text-amber-600"></i>
                <span>+ Nuevo funcionario</span>
              </button>
            </div>

            <!-- Disposición simétrica: Izquierda (Input de correo acortado a 360px) y Derecha (Tarjeta de datos del funcionario) -->
            <div class="grid grid-cols-1 md:grid-cols-[minmax(260px,360px)_1fr] gap-5 items-start">
              <!-- COLUMNA IZQUIERDA: 1. Correo institucional del TEC * (Alto 76px, ancho 360px) -->
              <div>
                <label class="form-label text-xs sm:text-sm font-bold text-slate-800 mb-2 block" for="bulk-recomienda-email">
                  1. Correo institucional del TEC <span class="req text-red-500 font-bold">*</span>
                </label>
                <div class="flex rounded-xl shadow-2xs overflow-hidden border border-slate-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 bg-white transition-all h-[76px] w-full max-w-[360px]" id="bulk-rec-input-group">
                  <input type="text" 
                         id="bulk-recomienda-email" 
                         class="flex-1 px-4 py-3 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 placeholder:italic outline-none border-0 h-full"
                         placeholder="Espacio para digitar el correo"
                         value="${this.escapeReporterText(this.getRecomiendaPrefix())}"
                         oninput="BulkUploadModule.onRecomiendaEmailInput(this.value)"
                         autocomplete="off"
                         spellcheck="false">
                  <div id="bulk-recomienda-domain" class="bg-slate-100 border-l border-slate-300 px-4 sm:px-5 flex items-center justify-center font-mono text-xs sm:text-sm text-slate-700 font-semibold select-none shrink-0 h-full">
                    itcr.ac.cr
                  </div>
                </div>
                <div class="error-feedback mt-1.5" id="err-bulk-recomienda-email"></div>
                <div id="bulk-rec-email-spinner" class="hidden text-xs text-blue-800 font-medium mt-1.5 flex items-center gap-1.5">
                  <i class="fa-solid fa-spinner fa-spin"></i>
                  <span>Consultando padrón del TEC...</span>
                </div>
              </div>

              <!-- COLUMNA DERECHA: Tarjeta con ícono verde y datos en 3 filas (Mismo alto 76px) -->
              <div>
                <div class="text-xs sm:text-sm font-bold text-slate-800 mb-2 invisible select-none">
                  Detalle
                </div>
                <div id="bulk-card-funcionario-container" class="border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50/80 shadow-2xs flex items-center gap-3.5 h-[76px] transition-all">
                  <!-- Ícono verde de usuario / check -->
                  <div id="bulk-card-funcionario-icon" class="w-12 h-12 rounded-lg ${this.recomiendaNombre ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-200'} flex items-center justify-center text-2xl shrink-0 shadow-2xs">
                    <i class="fa-solid ${this.recomiendaNombre ? 'fa-user-check' : 'fa-user'}"></i>
                  </div>

                  <!-- 3 filas de información -->
                  <div class="flex-1 min-w-0" id="bulk-card-funcionario-text">
                    <div class="text-sm sm:text-base font-bold text-slate-900 truncate leading-tight" id="bulk-card-display-nombre">
                      ${this.escapeReporterText(this.isReporterVerified() ? this.recomiendaNombre : 'Nombre de la persona funcionaria')}
                    </div>
                    <div class="text-xs sm:text-sm text-slate-600 truncate leading-tight mt-1" id="bulk-card-display-depto">
                      ${this.escapeReporterText(this.getSelectedDeptoNombre())}
                    </div>
                    <div class="text-[11px] sm:text-xs text-slate-500 truncate leading-tight mt-0.5" id="bulk-card-display-sede">
                      ${this.escapeReporterText(this.getSelectedSedeNombre())}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        ${this.tipoContacto === 'CONSOLIDADO' && !this.analysisResult ? `<div class="alert alert-info mb-5"><div>Procedencia TEC: <strong>Administrador</strong>, el tablero agrupará por <strong>Escuela Proponente</strong>, revise la vista previa antes de importar nuevos contactos o actualizar procedencias existentes.</div></div>` : ''}
        <!-- 2. Selección de Tipo de Contacto y Ubicación del Archivo -->
        ${!this.analysisResult ? `
          <div class="space-y-6">
            <!-- Sección: Selectores de Tipo de Carga Apilados y Cuadro de Reglas Alineado -->
            <div>
              <label class="block text-sm font-bold text-slate-800 mb-2.5 flex items-center gap-2">
                <i class="fa-solid fa-users-gear text-blue-900"></i>
                Tipo de Carga Masiva y Reglas Mínimas *
              </label>

              <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                <!-- Columna Izquierda: Selectores apilados verticalmente (uno sobre otro) -->
                <div class="lg:col-span-4 flex flex-col justify-between gap-2.5">
                  <label class="flex-1 flex items-start gap-3 p-3.5 border-2 rounded-xl cursor-pointer transition-all ${this.tipoContacto === 'ACADEMICO' ? 'border-blue-900 bg-blue-50/70 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300'}">
                    <input type="radio" name="bulk_tipo" value="ACADEMICO" ${this.tipoContacto === 'ACADEMICO' ? 'checked' : ''} onchange="BulkUploadModule.setTipoContacto('ACADEMICO')" class="accent-tec-primary w-4 h-4 mt-0.5">
                    <div>
                      <div class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <i class="fa-solid fa-graduation-cap text-blue-800"></i>
                        Académico
                      </div>
                      <div class="text-xs text-slate-500 mt-0.5">Contactos para Academic Survey</div>
                    </div>
                  </label>

                  <label class="flex-1 flex items-start gap-3 p-3.5 border-2 rounded-xl cursor-pointer transition-all ${this.tipoContacto === 'EMPLEADOR' ? 'border-blue-900 bg-blue-50/70 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300'}">
                    <input type="radio" name="bulk_tipo" value="EMPLEADOR" ${this.tipoContacto === 'EMPLEADOR' ? 'checked' : ''} onchange="BulkUploadModule.setTipoContacto('EMPLEADOR')" class="accent-tec-primary w-4 h-4 mt-0.5">
                    <div>
                      <div class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <i class="fa-solid fa-briefcase text-blue-800"></i>
                        Empleador
                      </div>
                      <div class="text-xs text-slate-500 mt-0.5">Contactos para Employer Survey</div>
                    </div>
                  </label>

                  ${isAdmin ? `
                    <label class="flex-1 flex items-start gap-3 p-3.5 border-2 rounded-xl cursor-pointer ${this.tipoContacto === 'CONSOLIDADO' ? 'border-blue-900 bg-blue-50' : 'border-slate-200'}">
                      <input type="radio" name="bulk_tipo" value="CONSOLIDADO" ${this.tipoContacto === 'CONSOLIDADO' ? 'checked' : ''} onchange="BulkUploadModule.setTipoContacto('CONSOLIDADO')" class="accent-tec-primary w-4 h-4 mt-0.5">
                      <div><div class="text-sm font-bold text-slate-900">Consolidado institucional</div>
                        <div class="text-xs text-slate-500">Solo administrador · Ambas hojas y Escuela Proponente</div></div>
                    </label>
                    <label class="flex-1 flex items-start gap-3 p-3.5 border-2 rounded-xl cursor-pointer transition-all ${this.tipoContacto === 'FUNCIONARIOS' ? 'border-blue-900 bg-blue-50/70 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300'}">
                      <input type="radio" name="bulk_tipo" value="FUNCIONARIOS" ${this.tipoContacto === 'FUNCIONARIOS' ? 'checked' : ''} onchange="BulkUploadModule.setTipoContacto('FUNCIONARIOS')" class="accent-tec-primary w-4 h-4 mt-0.5">
                      <div>
                        <div class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <i class="fa-solid fa-address-book text-amber-600"></i>
                          Funcionarios TEC
                        </div>
                        <div class="text-xs text-slate-500 mt-0.5">Padrón: Nombre, Correo, Dependencia, Sede</div>
                      </div>
                    </label>
                  ` : ''}
                </div>

                <!-- Columna Derecha: Cuadro de Reglas Mínimas perfectamente alineado de primer a último selector -->
                <div class="lg:col-span-8 flex flex-col">
                  <div class="bg-amber-50/70 border border-amber-200/90 rounded-xl p-4 sm:p-5 text-xs shadow-2xs h-full flex flex-col justify-between">
                    <div class="flex items-center justify-between pb-2 mb-2 border-b border-amber-200/60">
                      <span class="font-bold text-amber-950 flex items-center gap-2 text-xs uppercase tracking-wider">
                        <i class="fa-solid fa-clipboard-check text-amber-700"></i>
                        Reglas Mínimas para Evitar Errores (${this.tipoContacto === 'ACADEMICO' ? 'Académicos' : this.tipoContacto === 'EMPLEADOR' ? 'Empleadores' : this.tipoContacto === 'CONSOLIDADO' ? 'Consolidado institucional' : 'Funcionarios TEC'})
                      </span>
                      <span class="text-[11px] text-amber-800/80 font-medium hidden sm:inline">
                        Pestaña "Reglas e Instrucciones" en el Excel descargado
                      </span>
                    </div>

                    <div class="flex-1 flex flex-col justify-around py-0.5">
                      ${this.tipoContacto === 'CONSOLIDADO' ? `<p>Libro .xlsx con hojas de empleadores y académicos, y Escuela Proponente en cada fila, la procedencia será Administrador, los registros incompletos solo se incorporarán como pendientes si marca la opción correspondiente.</p>` : this.tipoContacto === 'ACADEMICO' ? `
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-slate-700">
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-check text-emerald-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Campos Obligatorios:</strong> First Name, Last Name, Email, Title, Job Title, Department, Institution, Country, Subject.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-ban text-red-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Restricción Crítica QS:</strong> NO se permiten correos @itcr.ac.cr ni @tec.ac.cr (deben ser contactos externos).</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-graduation-cap text-blue-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Tratamientos Aceptados:</strong> Dr., Dra., Prof., Profra., Ing., Lic., Licda., MSc., PhD, Mr., Mrs., Ms., Miss.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-tags text-indigo-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Áreas Temáticas QS:</strong> Arte y Humanidades, Ingeniería y Tecnología, Ciencias de la Vida, Ciencias Naturales, Ciencias Sociales.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-earth-americas text-slate-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>País:</strong> Nombre oficial completo según catálogo internacional (ej. Costa Rica, España, Estados Unidos).</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-copy text-amber-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Sin Duplicados:</strong> No incluir correos repetidos en el archivo ni contactos ya registrados en el sistema.</span>
                          </div>
                        </div>
                      ` : this.tipoContacto === 'EMPLEADOR' ? `
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-slate-700">
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-check text-emerald-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Campos Obligatorios:</strong> First Name, Last Name, Email, Title, Position, Industry, Company Name, Country.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-ban text-red-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Restricción Crítica QS:</strong> NO se permiten correos @itcr.ac.cr ni @tec.ac.cr (deben ser empleadores externos).</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-user-tie text-blue-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Tratamientos Aceptados:</strong> Dr., Dra., Ing., Lic., Licda., Mr., Mrs., Ms., Miss.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-building text-indigo-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Cargo y Empresa:</strong> Puesto de liderazgo/contratación y nombre legal o comercial de la empresa empleadora.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-earth-americas text-slate-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>País:</strong> Nombre oficial completo del país donde opera la empresa según catálogo internacional.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-copy text-amber-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Sin Duplicados:</strong> No incluir correos repetidos en el archivo ni contactos previamente reportados.</span>
                          </div>
                        </div>
                      ` : `
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-slate-700">
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-check text-emerald-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Campos Obligatorios:</strong> Nombre de funcionario, Correo electrónico, Dependencia, Sede.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-at text-emerald-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Dominio Obligatorio TEC:</strong> El correo institucional DEBE terminar exclusivamente en @itcr.ac.cr o @tec.ac.cr.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-landmark text-blue-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Sedes Oficiales:</strong> Campus Central Cartago, San José, San Carlos, Centro Académico Alajuela o Limón.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-sitemap text-indigo-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Dependencia:</strong> Escuela académica, vicerrectoría o departamento administrativo oficial del TEC.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-user-check text-slate-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Nombre Completo:</strong> Mínimo 3 caracteres con título institucional de cortesía.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-copy text-amber-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Sin Duplicados:</strong> Un único registro por funcionario/correo institucional en el archivo.</span>
                          </div>
                        </div>
                      `}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Selector de Ubicación del Archivo -->
            <div>
              <label class="block text-sm font-bold text-slate-800 mb-2 flex items-center gap-2" for="excel-file-display">
                <i class="fa-solid fa-folder-open text-blue-900"></i>
                Ubicación del Archivo *
              </label>

              <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div class="relative flex-1">
                  <input type="text" 
                         id="excel-file-display" 
                         readonly 
                         placeholder="Haga clic en 'Buscar archivo...' para seleccionar la ubicación (.xlsx, .csv)" 
                         value="${this.escapeReporterText(this.selectedFile ? this.selectedFile.name : '')}"
                         class="form-control text-sm bg-slate-50 text-slate-700 w-full cursor-pointer truncate pr-10"
                         onclick="if (['FUNCIONARIOS', 'CONSOLIDADO'].includes(BulkUploadModule.tipoContacto) || BulkUploadModule.isReporterVerified()) document.getElementById('excel-file-input').click()">
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <i class="fa-solid fa-file-excel"></i>
                  </span>
                </div>

                <input type="file" 
                       id="excel-file-input" 
                       accept="${this.tipoContacto === 'CONSOLIDADO' ? '.xlsx' : '.xlsx, .xls, .csv'}"
                       class="hidden" 
                       onchange="BulkUploadModule.handleFileSelect(event)">

                <button type="button" 
                        id="bulk-file-select" class="btn btn-tec whitespace-nowrap shadow-xs"
                        onclick="if (['FUNCIONARIOS', 'CONSOLIDADO'].includes(BulkUploadModule.tipoContacto) || BulkUploadModule.isReporterVerified()) document.getElementById('excel-file-input').click()">
                  <i class="fa-solid fa-folder-open"></i>
                  Buscar archivo...
                </button>
              </div>

              <p class="text-xs text-slate-500 mt-2">
                ${this.tipoContacto === 'CONSOLIDADO' ? 'Formato permitido: libro Excel .xlsx con hojas de académicos y empleadores.' : 'Formatos permitidos: Hojas de cálculo Excel (.xlsx, .xls) o texto delimitado por comas (.csv).'}
                Máximo 5 MB y ${this.catalogs?.limits?.max_import_rows || 2000} filas por carga.
              </p>
              <p class="text-sm text-blue-900 mt-3" role="status" aria-live="polite">${this.analyzing ? 'Analizando hojas, columnas y registros, espere antes de confirmar la carga.' : ''}</p>
            </div>
          </div>
        ` : this.renderAnalysisView()}
      </div>
      <!-- Modal para incluir nuevo funcionario -->
      <div id="bulk-modal-container"></div>
    `;
    this.updateCardDisplay();
  },

  setTipoContacto(tipo) {
    if (['FUNCIONARIOS', 'CONSOLIDADO'].includes(tipo) && App.currentUser?.rol !== 'ADMIN') {
      App.showToast('Esta carga está reservada para Administradores.', 'warning');
      this.tipoContacto = 'ACADEMICO';
      this.render();
      return;
    }
    this.tipoContacto = tipo;
    this.resetReporter();
    this.selectedFile = null;
    this.fileBase64 = null;
    this.analysisResult = null;
    this.render();
  },

  handleFileSelect(event) {
    if (!['FUNCIONARIOS', 'CONSOLIDADO'].includes(this.tipoContacto) && !this.isReporterVerified()) {
      App.showToast('Verifique el correo del funcionario en el padrón antes de cargar el archivo.', 'warning');
      event.target.value = '';
      return;
    }
    const file = event.target.files[0];
    if (!file) return;
    if (this.tipoContacto === 'CONSOLIDADO' && !/\.xlsx$/i.test(file.name)) {
      App.showToast('Seleccione el consolidado en formato .xlsx.', 'warning'); event.target.value = ''; return;
    }
    if (file.size > (this.catalogs?.limits?.max_file_bytes || 5 * 1024 * 1024)) {
      App.showToast('El archivo supera 5 MB. Divídalo en cargas menores.', 'warning');
      event.target.value = '';
      return;
    }

    this.selectedFile = file;
    this.analysisVersion++;
    const sessionVersion = App.sessionVersion;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (App.suspended || sessionVersion !== App.sessionVersion || this.selectedFile !== file) return;
      this.fileBase64 = String(e.target.result).split(',')[1];
      this.analyzeFile();
    };
    reader.onerror = () => App.showToast('No se logró leer el archivo. Selecciónelo nuevamente.', 'error');
    reader.readAsDataURL(file);
  },

  async analyzeFile() {
    if (!['FUNCIONARIOS', 'CONSOLIDADO'].includes(this.tipoContacto) && !this.isReporterVerified()) {
      App.showToast('Verifique el correo del funcionario antes de analizar el archivo.', 'warning');
      return;
    }
    const reporterVersion = this.reporterLookupVersion;
    const selectedType = this.tipoContacto;
    const selectedFile = this.selectedFile;
    const analysisVersion = ++this.analysisVersion;
    const sessionVersion = App.sessionVersion;
    this.analyzing = true;
    this.analysisResult = null;
    this.render();
    App.showToast('🔍 Analizando archivo y verificando duplicados...', 'info');

    try {
      const response = await API.post(this.tipoContacto === 'CONSOLIDADO' ? '/api/bulk/consolidated/analyze' : '/api/bulk/analyze', {
        fileName: this.selectedFile.name,
        tipo_contacto: this.tipoContacto,
        fileBase64: this.fileBase64,
        recomienda_email: this.recomiendaEmail
      });

      if (analysisVersion !== this.analysisVersion || selectedFile !== this.selectedFile || App.suspended || sessionVersion !== App.sessionVersion || selectedType !== this.tipoContacto || (!['FUNCIONARIOS', 'CONSOLIDADO'].includes(this.tipoContacto) && reporterVersion !== this.reporterLookupVersion)) return;
      this.analysisResult = response;
      this.activeFilter = 'TODOS';
      this.consolidatedSheet = ''; this.consolidatedQuery = ''; this.consolidatedPage = 1; this.includeConsolidatedPending = false;
      this.render();
      App.showToast('✅ Análisis preliminar completado.', 'success');
    } catch (err) {
      if (analysisVersion !== this.analysisVersion || selectedFile !== this.selectedFile || App.suspended || sessionVersion !== App.sessionVersion) return;
      App.showToast(err.message || 'Error al analizar el archivo Excel', 'error');
      this.selectedFile = null;
      this.fileBase64 = null;
      this.analysisResult = null;
      this.render();
    } finally { if (analysisVersion === this.analysisVersion) { this.analyzing = false; if (!this.analysisResult) this.render(); } }
  },

  renderConsolidatedAnalysisView() {
    const { summary, analyzedRows, sheets = [] } = this.analysisResult;
    const esc = value => this.escapeReporterText(value);
    const labels = { CORRECTO: 'Nuevo completo', PENDIENTE_REVISION: 'Nuevo pendiente de revisión',
      ACTUALIZAR_PROCEDENCIA: 'Actualizar procedencia', ERROR: 'Error crítico', POSIBLE_DUPLICADO: 'Posible duplicado', DUPLICADO_EXACTO: 'Ya existe / repetido' };
    const totals = { TODOS: summary.totalAnalizados, CORRECTO: summary.nuevosCompletos,
      PENDIENTE_REVISION: summary.pendientesRevision, ACTUALIZAR_PROCEDENCIA: summary.actualizaciones,
      POSIBLE_DUPLICADO: summary.posiblesDuplicados, ERROR: summary.conErrores, DUPLICADO_EXACTO: summary.duplicadosExactos };
    const filtered = analyzedRows.filter(r => (this.activeFilter === 'TODOS' || r.status === this.activeFilter) &&
      (!this.consolidatedSheet || r.sheet === this.consolidatedSheet) &&
      (!this.consolidatedQuery || [r.data.first_name, r.data.last_name, r.data.email, r.escuela, r.data.institution, r.data.company_name, ...r.errors].join(' ').toLocaleLowerCase().includes(this.consolidatedQuery.toLocaleLowerCase())));
    const pages = Math.max(1, Math.ceil(filtered.length / 50));
    this.consolidatedPage = Math.min(this.consolidatedPage, pages);
    const displayed = filtered.slice((this.consolidatedPage - 1) * 50, this.consolidatedPage * 50);
    const importable = summary.correctos - (this.includeConsolidatedPending ? 0 : summary.pendientesRevision);
    return `<div class="space-y-5">
      <h3 class="text-lg font-bold text-slate-900">Revisión del consolidado institucional</h3>
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm"><strong>Procedencia TEC: Administrador</strong>
      <p>Archivo: ${esc(this.selectedFile?.name || '')} · Escuela / Unidad: columna «Escuela Proponente» de cada fila.</p>
      <p>Revise las hojas, filtre los problemas y confirme el alcance antes de guardar, el análisis todavía no modifica los contactos.</p></div>
      <section><h4 class="font-bold mb-3">Hojas y columnas reconocidas</h4>
      ${sheets.map(s => `<details class="border border-slate-200 rounded-xl p-3 mb-2"><summary class="cursor-pointer font-semibold">${esc(s.name)} · ${s.ignored ? 'Hoja omitida' : `${esc(s.total)} contactos, encabezados en fila ${esc(s.headerRow)}`}</summary>
        ${s.ignored ? '<p class="text-sm">Solo se procesan hojas identificadas como académicos o empleadores.</p>' : `<p class="text-sm mt-2">${s.columns.map(c => `${esc(c.header)} → ${esc(c.label)}`).join('; ')}</p>
        <p class="text-xs mt-2">Columnas no utilizadas: ${esc(s.ignoredColumns.join(', ') || 'Ninguna')}.</p>
        ${s.warnings.map(w => `<p class="text-sm text-amber-800 mt-2">${esc(w)}</p>`).join('')}
        <p class="text-xs mt-2">Completos: ${esc(s.counts.CORRECTO)}, pendientes: ${esc(s.counts.PENDIENTE_REVISION)}, actualizar: ${esc(s.counts.ACTUALIZAR_PROCEDENCIA)}, errores: ${esc(s.counts.ERROR)}, posibles duplicados: ${esc(s.counts.POSIBLE_DUPLICADO)}, omitidos: ${esc(s.counts.DUPLICADO_EXACTO)}.</p>`}</details>`).join('')}</section>
      <section><h4 class="font-bold mb-3">Resultado de las validaciones · ${esc(summary.totalAnalizados)} registros analizados</h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${Object.entries(totals).filter(([key]) => key !== 'TODOS').map(([key, total]) => `<div class="kpi-card" style="border-top-color:${key === 'ERROR' ? 'var(--status-error)' : key === 'PENDIENTE_REVISION' || key === 'POSIBLE_DUPLICADO' ? 'var(--status-warning)' : key === 'CORRECTO' ? 'var(--status-success)' : 'var(--tec-primary)'}"><div class="kpi-title">${esc(labels[key])}</div><div class="kpi-value">${esc(total)}</div></div>`).join('')}
      </div></section>
      <section><h4 class="font-bold mb-3">Detalle y correcciones por fila</h4>
      <div class="flex gap-2 flex-wrap mb-4" role="group" aria-label="Filtrar por resultado">
        ${Object.entries(totals).map(([key, total]) => `<button type="button" class="btn btn-sm ${this.activeFilter === key ? 'btn-tec' : 'btn-outline'}" aria-pressed="${this.activeFilter === key}" onclick="BulkUploadModule.filterConsolidated('status','${key}')">${esc(labels[key] || 'Todos')} (${esc(total)})</button>`).join('')}
      </div><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      <div><label class="form-label" for="consolidated-sheet">Hoja del archivo</label><select id="consolidated-sheet" class="form-control" onchange="BulkUploadModule.filterConsolidated('sheet',this.value)"><option value="">Todas las hojas</option>
      ${sheets.filter(s => !s.ignored).map(s => `<option value="${esc(s.name)}" ${s.name === this.consolidatedSheet ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div><label class="form-label" for="consolidated-query">Buscar contacto, escuela o diagnóstico</label><input type="search" id="consolidated-query" class="form-control" value="${esc(this.consolidatedQuery)}" onchange="BulkUploadModule.filterConsolidated('query',this.value)"></div></div>
      <div class="table-responsive max-h-96 overflow-y-auto"><table class="data-table"><thead><tr>
        <th>Hoja / fila Excel</th><th>Estado</th><th>Contacto / correo</th><th>Institución / Empresa</th><th>Escuela Proponente</th><th>Diagnóstico / corrección</th>
      </tr></thead><tbody>${displayed.map(r => `<tr>
        <td>${esc(r.sheet)}<br><strong>#${esc(r.rowNum)}</strong><br><small>Año de reporte: ${esc(r.metadata?.year || 'Sin dato')}</small></td>
        <td><span class="badge ${r.status === 'ERROR' ? 'badge-error' : r.status === 'CORRECTO' ? 'badge-validado' : 'badge-posible'}">${esc(labels[r.status] || r.status)}</span></td>
        <td>${esc(r.data.first_name)} ${esc(r.data.last_name)}<br><code>${esc(r.data.email || 'Sin correo')}</code></td>
        <td>${esc(r.data.institution || r.data.company_name || 'Sin dato')}</td><td>${esc(r.escuela || 'Sin Escuela Proponente')}</td>
        <td>${r.errors.map(e => `<p>${esc(e)}</p>`).join('') || 'Datos completos, listo para incorporar.'}
        ${(r.warnings || []).map(w => `<p class="text-xs text-amber-800">${esc(w)}</p>`).join('')}
        <p class="text-xs mt-2 font-semibold">${r.status === 'ERROR' || r.status === 'POSIBLE_DUPLICADO' ? 'Corregir en el archivo y analizar nuevamente, esta fila no se guardará.' : r.status === 'PENDIENTE_REVISION' ? 'Completar los campos indicados o incorporar como pendiente mediante la opción expresa.' : r.status === 'ACTUALIZAR_PROCEDENCIA' ? 'Conservar los datos actuales y actualizar únicamente su procedencia.' : r.status === 'DUPLICADO_EXACTO' ? 'Se omite sin modificar el contacto.' : 'Se incorporará como contacto validado.'}</p></td>
      </tr>`).join('') || '<tr><td colspan="6">No hay filas para estos filtros.</td></tr>'}</tbody></table></div>
      <div class="flex flex-wrap justify-between gap-3 mt-3"><p class="text-sm" aria-live="polite">${esc(filtered.length)} filas filtradas · Página ${esc(this.consolidatedPage)} de ${esc(pages)} · 50 filas por página</p>
      <div class="flex gap-2"><button type="button" class="btn btn-outline btn-sm" ${this.consolidatedPage <= 1 ? 'disabled' : ''} onclick="BulkUploadModule.pageConsolidated(-1)">Anterior</button><button type="button" class="btn btn-outline btn-sm" ${this.consolidatedPage >= pages ? 'disabled' : ''} onclick="BulkUploadModule.pageConsolidated(1)">Siguiente</button></div></div></section>
      <section class="bg-slate-50 border border-slate-200 rounded-xl p-4"><h4 class="font-bold mb-3">Confirmación del alcance</h4>
      <label class="flex items-start gap-3 mb-3"><input type="checkbox" ${this.includeConsolidatedPending ? 'checked' : ''} onchange="BulkUploadModule.includeConsolidatedPending=this.checked; BulkUploadModule.render();">
      <span>Incluir también ${esc(summary.pendientesRevision)} registros históricos incompletos como pendientes de revisión, quedarán en estado NUEVO y fuera de la exportación QS.</span></label>
      <p class="text-sm">Se procesarán <strong>${esc(importable)}</strong> filas: ${esc(summary.nuevosCompletos)} nuevos completos, ${esc(this.includeConsolidatedPending ? summary.pendientesRevision : 0)} nuevos pendientes y ${esc(summary.actualizaciones)} actualizaciones de procedencia, se omitirán ${esc(summary.totalAnalizados - importable)} filas.</p>
      <p class="text-xs mt-2">Los filtros solo cambian la vista, la confirmación aplica al alcance completo indicado arriba, sin inventar países, disciplinas, escuelas ni autorizaciones ausentes.</p>
      <div class="flex flex-wrap gap-3">
        <button class="btn btn-outline" ${this.consolidatedImporting ? 'disabled' : ''} onclick="BulkUploadModule.cancelAnalysis()">Cancelar y volver</button>
        <button class="btn btn-outline" ${this.consolidatedImporting ? 'disabled' : ''} onclick="BulkUploadModule.analyzeFile()">Analizar nuevamente</button>
        <button class="btn btn-tec" id="btn-import-valid" ${importable && !this.consolidatedImporting ? '' : 'disabled'} onclick="BulkUploadModule.confirmConsolidatedImport()">Confirmar carga (${esc(importable)})</button>
      </div></section></div>`;
  },

  filterConsolidated(kind, value) {
    if (kind === 'status') this.activeFilter = value;
    else if (kind === 'sheet') this.consolidatedSheet = value;
    else if (kind === 'query') this.consolidatedQuery = value.trim();
    this.consolidatedPage = 1; this.render();
  },

  pageConsolidated(delta) { this.consolidatedPage = Math.max(1, this.consolidatedPage + delta); this.render(); },

  async confirmConsolidatedImport() {
    if (App.currentUser?.rol !== 'ADMIN') {
      App.showToast('La carga consolidada está reservada al administrador.', 'warning');
      return;
    }
    if (this.consolidatedImporting || !this.analysisResult || !this.fileBase64) return;
    const summary = this.analysisResult.summary;
    const count = summary.correctos - (this.includeConsolidatedPending ? 0 : summary.pendientesRevision);
    if (!count || !window.confirm(`¿Confirma procesar ${count} filas del consolidado? Incluye ${summary.actualizaciones} actualizaciones de procedencia y ${this.includeConsolidatedPending ? summary.pendientesRevision : 0} registros pendientes. Las filas con errores, posibles duplicados y repeticiones se omiten.`)) return;
    this.consolidatedImporting = true;
    const sessionVersion = App.sessionVersion;
    const selectedFile = this.selectedFile;
    const button = document.getElementById('btn-import-valid');
    if (button) button.disabled = true;
    try {
      const result = await API.post('/api/bulk/consolidated/import', { fileName: this.selectedFile.name, fileBase64: this.fileBase64,
        includePending: this.includeConsolidatedPending, analysisHash: this.analysisResult.analysisHash });
      if (App.suspended || sessionVersion !== App.sessionVersion || selectedFile !== this.selectedFile) return;
      App.showToast(result.message, 'success');
      try { App.catalogs = await API.get('/api/catalogs'); } catch (_) { /* Los catálogos se actualizan al recargar. */ }
      this.cancelAnalysis();
      App.navigate('directory');
    } catch (err) {
      App.showToast(err.message || 'Error al importar el consolidado', 'error');
      if (button) button.disabled = false;
    } finally { this.consolidatedImporting = false; }
  },

  renderAnalysisView() {
    if (this.tipoContacto === 'CONSOLIDADO') return this.renderConsolidatedAnalysisView();
    const { summary, errorDetails, analyzedRows } = this.analysisResult;
    const isFuncionarios = this.tipoContacto === 'FUNCIONARIOS';

    const filteredRows = analyzedRows.filter(r => {
      if (this.activeFilter === 'CORRECTOS') return r.status === 'CORRECTO';
      if (this.activeFilter === 'ERRORES') return r.status === 'ERROR';
      if (this.activeFilter === 'POSIBLES') return r.status === 'POSIBLE_DUPLICADO';
      if (this.activeFilter === 'DUPLICADOS') return r.status === 'DUPLICADO_EXACTO';
      return true;
    });

    return `
      <div>
        <!-- Resumen de Identificación del Reporte / Carga -->
        ${isFuncionarios ? `
          <div class="bg-amber-50/90 border border-amber-200/90 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center text-sm shadow-xs">
                <i class="fa-solid fa-address-book"></i>
              </span>
              <div>
                <div class="font-bold text-slate-900 text-sm">
                  Padrón Institucional de Funcionarios del TEC
                </div>
                <div class="text-slate-600">
                  Archivo cargado: <span class="font-mono font-semibold">${this.escapeReporterText(this.selectedFile?.name || 'padron.xlsx')}</span>
                </div>
              </div>
            </div>
            <div class="text-left sm:text-right">
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                <i class="fa-solid fa-database text-amber-700"></i> Actualización de Catálogo Base
              </span>
            </div>
          </div>
        ` : `
          <div class="bg-blue-50/80 border border-blue-200 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center text-sm shadow-xs">
                <i class="fa-solid fa-user-check"></i>
              </span>
              <div>
                <div class="font-bold text-blue-950 text-sm">
                  ${this.escapeReporterText(this.isReporterVerified() ? this.recomiendaNombre : 'Funcionario pendiente de verificación')}
                </div>
                <div class="text-blue-800 font-mono">
                  ${this.escapeReporterText(this.recomiendaEmail || '(Sin correo verificado)')}
                </div>
              </div>
            </div>
            <div class="text-left sm:text-right sm:border-l sm:border-blue-200 sm:pl-4">
              <span class="text-slate-500 font-medium block">Procedencia Institucional:</span>
              <strong class="text-slate-800">${this.escapeReporterText(this.getSelectedSedeNombre())} · ${this.escapeReporterText(this.getSelectedDeptoNombre())}</strong>
            </div>
          </div>
        `}

        <!-- Resumen de Métricas (Requisito 11) -->
        <div class="kpi-grid mb-6">
          <div class="kpi-card" style="border-top-color: var(--tec-primary);">
            <div class="kpi-title">Registros Analizados</div>
            <div class="kpi-value text-slate-900">${this.escapeReporterText(summary.totalAnalizados)}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--status-success);">
            <div class="kpi-title">No existen en el sistema (Nuevos)</div>
            <div class="kpi-value text-emerald-700">${this.escapeReporterText(summary.correctos)}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--status-purple);">
            <div class="kpi-title">Ya existen en el sistema</div>
            <div class="kpi-value text-purple-700">${this.escapeReporterText(summary.duplicadosExactos)}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--status-warning);">
            <div class="kpi-title">Posibles Duplicados</div>
            <div class="kpi-value text-amber-700">${this.escapeReporterText(summary.posiblesDuplicados)}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--status-error);">
            <div class="kpi-title">Con Errores Críticos</div>
            <div class="kpi-value text-red-700">${this.escapeReporterText(summary.conErrores)}</div>
          </div>
        </div>

        <!-- Filtros de Pestaña para la Auditoría -->
        <div class="flex gap-2 mb-4 flex-wrap">
          <button class="btn btn-sm ${this.activeFilter === 'TODOS' ? 'btn-tec' : 'btn-outline'}" onclick="BulkUploadModule.setFilter('TODOS')">
            Todos (${this.escapeReporterText(summary.totalAnalizados)})
          </button>
          <button class="btn btn-sm ${this.activeFilter === 'CORRECTOS' ? 'btn-tec' : 'btn-outline'}" onclick="BulkUploadModule.setFilter('CORRECTOS')">
            Nuevos / No existen (${this.escapeReporterText(summary.correctos)})
          </button>
          <button class="btn btn-sm ${this.activeFilter === 'DUPLICADOS' ? 'btn-tec' : 'btn-outline'}" onclick="BulkUploadModule.setFilter('DUPLICADOS')">
            Ya existen (${this.escapeReporterText(summary.duplicadosExactos)})
          </button>
          <button class="btn btn-sm ${this.activeFilter === 'POSIBLES' ? 'btn-tec' : 'btn-outline'}" onclick="BulkUploadModule.setFilter('POSIBLES')">
            Posibles Duplicados (${this.escapeReporterText(summary.posiblesDuplicados)})
          </button>
          <button class="btn btn-sm ${this.activeFilter === 'ERRORES' ? 'btn-tec' : 'btn-outline'}" onclick="BulkUploadModule.setFilter('ERRORES')">
            Con Errores (${this.escapeReporterText(summary.conErrores)})
          </button>
        </div>

        <!-- Tabla Detallada de Auditoría Previa (Requisito 11) -->
        <div class="table-responsive max-h-96 overflow-y-auto mb-6">
          <table class="data-table">
            <thead>
              <tr>
                <th>Fila Excel</th>
                <th>Estado</th>
                ${isFuncionarios ? `
                  <th>Nombre de Funcionario</th>
                  <th>Correo Institucional</th>
                  <th>Dependencia / Departamento</th>
                  <th>Sede TEC</th>
                  <th>Diagnóstico</th>
                ` : `
                  <th>Nombre Completo</th>
                  <th>Correo Electrónico</th>
                  <th>Institución / Empresa</th>
                  <th>Diagnóstico / Problema</th>
                  <th>Recomendación</th>
                `}
              </tr>
            </thead>
            <tbody>
              ${filteredRows.map(r => {
                const d = r.data;
                const badgeClass =
                  r.status === 'CORRECTO' ? 'badge-validado' :
                  r.status === 'ERROR' ? 'badge-error' :
                  r.status === 'POSIBLE_DUPLICADO' ? 'badge-posible' : 'badge-duplicado';

                if (isFuncionarios) {
                  const errorMsg = r.errors?.join('; ') || 'Datos conformes para padrón de funcionarios.';
                  return `
                    <tr>
                      <td><strong>#${this.escapeReporterText(r.rowNum)}</strong></td>
                      <td><span class="badge ${badgeClass}">${this.escapeReporterText(r.status)}</span></td>
                      <td class="font-medium text-slate-900">${this.escapeReporterText(d.nombre || d['Nombre de funcionario'] || '-')}</td>
                      <td><code class="text-blue-900 font-semibold">${this.escapeReporterText(d.email || d['Correo electrónico'] || '-')}</code></td>
                      <td>${this.escapeReporterText(d.dependencia || d['Dependencia'] || '-')}</td>
                      <td>${this.escapeReporterText(d.sede || d['Sede'] || '-')}</td>
                      <td class="${r.status !== 'CORRECTO' ? 'text-red-600 font-medium' : 'text-slate-500'}">${this.escapeReporterText(errorMsg)}</td>
                    </tr>
                  `;
                }

                const errorMsg = r.errors?.join('; ') || r.duplicateInfo?.explanation || 'Datos conformes a directriz QS.';
                const reco = r.status === 'CORRECTO' ? 'Aprobado para importación' :
                             r.status === 'ERROR' ? 'Corregir celda o excluir fila' :
                             r.status === 'POSIBLE_DUPLICADO' ? 'Revisar homónimo en directorio' : 'Omitir; ya registrado';

                return `
                  <tr>
                    <td><strong>#${this.escapeReporterText(r.rowNum)}</strong></td>
                    <td><span class="badge ${badgeClass}">${this.escapeReporterText(r.status)}</span></td>
                    <td>${this.escapeReporterText(d.first_name || d['First Name'] || '-')} ${this.escapeReporterText(d.last_name || d['Last Name'] || '-')}</td>
                    <td><code>${this.escapeReporterText(d.email || d['Email'] || '-')}</code></td>
                    <td>${this.escapeReporterText(d.institution || d.company_name || d['Institution'] || d['Company Name'] || '-')}</td>
                    <td class="${r.status !== 'CORRECTO' ? 'text-red-600 font-medium' : 'text-slate-500'}">${this.escapeReporterText(errorMsg)}</td>
                    <td><small class="text-slate-500">${this.escapeReporterText(reco)}</small></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Mensaje Informativo para Subida Selectiva de Registros No Existentes -->
        ${summary.correctos > 0 ? `
          <div class="bg-emerald-50/80 border border-emerald-200/90 rounded-xl p-4 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
            <div class="flex items-center gap-3">
              <span class="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center text-sm shadow-xs shrink-0">
                <i class="fa-solid fa-cloud-arrow-up"></i>
              </span>
              <div>
                <div class="font-bold text-emerald-950 text-sm">
                  Subida selectiva disponible: ${this.escapeReporterText(summary.correctos)} registros nuevos listos para incorporar
                </div>
                <p class="text-emerald-800 m-0 mt-0.5">
                  ${summary.duplicadosExactos > 0 
                    ? `Se omitirán automáticamente los <strong>${this.escapeReporterText(summary.duplicadosExactos)} registros existentes</strong> para no duplicar datos y se subirán únicamente los registros que no existen en el sistema.`
                    : 'Todos los registros son nuevos y cumplen con los estándares institucionales requeridos.'}
                </p>
              </div>
            </div>
          </div>
        ` : summary.duplicadosExactos > 0 ? `
          <div class="bg-amber-50/80 border border-amber-200/90 rounded-xl p-4 mb-5 flex items-center gap-3 text-xs text-amber-950 shadow-2xs">
            <span class="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center text-sm shadow-xs shrink-0">
              <i class="fa-solid fa-circle-info"></i>
            </span>
            <div>
              <strong class="text-sm block">Todos los registros del archivo ya existen en el sistema</strong>
              <p class="text-amber-800 m-0 mt-0.5">
                Los ${this.escapeReporterText(summary.duplicadosExactos)} registros analizados ya constan previamente en la base de datos. No hay registros nuevos que subir.
              </p>
            </div>
          </div>
        ` : ''}

        <!-- Acciones Finales -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-5 border-t border-slate-100">
          <button class="btn btn-outline" onclick="BulkUploadModule.cancelAnalysis()">
            <i class="fa-solid fa-arrow-left mr-1"></i> Cancelar y Subir Otro Archivo
          </button>

          <div class="flex flex-wrap items-center gap-3">
            ${summary.correctos > 0 ? `
              <button class="btn btn-tec py-2.5 px-4 font-semibold text-sm shadow-sm flex items-center gap-2" id="btn-import-valid" onclick="BulkUploadModule.confirmImport(false)">
                <i class="fa-solid fa-cloud-arrow-up"></i>
                <span>Subir los registros que no existen (${this.escapeReporterText(summary.correctos)})</span>
              </button>
            ` : ''}

            ${summary.posiblesDuplicados > 0 ? `
              <button class="btn btn-outline text-amber-800 border-amber-300 hover:bg-amber-50 py-2.5 px-4 text-xs font-semibold flex items-center gap-1.5" id="btn-import-potential" onclick="BulkUploadModule.confirmImport(true)">
                <i class="fa-solid fa-user-plus text-amber-600"></i>
                <span>Subir nuevos + Posibles duplicados (${summary.correctos + summary.posiblesDuplicados})</span>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  },

  setFilter(filter) {
    this.activeFilter = filter;
    this.render();
  },

  cancelAnalysis() {
    this.analysisVersion++;
    this.selectedFile = null;
    this.fileBase64 = null;
    this.analysisResult = null;
    this.resetReporter();
    this.render();
  },

  async confirmImport(includePotentialDuplicates = false) {
    if (!['FUNCIONARIOS', 'CONSOLIDADO'].includes(this.tipoContacto) && !this.isReporterVerified()) {
      App.showToast('Verifique el correo del funcionario en el padrón antes de confirmar la carga.', 'warning');
      return;
    }
    if (!this.analysisResult) return;
    if (this.tipoContacto === 'CONSOLIDADO') return this.confirmConsolidatedImport();
    // Si la carga es del padrón institucional de funcionarios
    if (this.tipoContacto === 'FUNCIONARIOS') {
      const rowsToImport = this.analysisResult.analyzedRows
        .filter(r => r.status === 'CORRECTO' || (includePotentialDuplicates && r.status === 'POSIBLE_DUPLICADO'))
        .map(r => ({
          nombre: r.data.nombre || r.data['Nombre de funcionario'],
          email: r.data.email || r.data['Correo electrónico'],
          dependencia: r.data.dependencia || r.data['Dependencia'],
          sede: r.data.sede || r.data['Sede'],
          status: r.status
        }));

      if (rowsToImport.length === 0) {
        App.showToast('No hay registros válidos de funcionarios para importar.', 'warning');
        return;
      }

      const btn = document.getElementById('btn-import-valid');
      if (btn) btn.disabled = true;

      try {
        const response = await API.post('/api/bulk/import', {
          fileName: this.selectedFile.name,
          tipo_contacto: 'FUNCIONARIOS',
          rowsToImport,
          fileBase64: this.fileBase64
        });

        App.showToast(`🎉 ${response.message}`, 'success');
        this.cancelAnalysis();
      } catch (err) {
        App.showToast(err.message || 'Error en la importación de funcionarios', 'error');
        if (btn) btn.disabled = false;
      }
      return;
    }

    // Para contactos QS (Académicos / Empleadores)
    const recNombre = this.funcionarioIdentificado.nombre;
    const recEmail = this.funcionarioIdentificado.email;

    const rowsToImport = this.analysisResult.analyzedRows
      .filter(r => r.status === 'CORRECTO' || (includePotentialDuplicates && r.status === 'POSIBLE_DUPLICADO'))
      .map(r => ({
        ...r.data,
        status: r.status,
        recomienda_nombre: recNombre,
        recomienda_email: recEmail,
        sede_id: this.selectedSedeId || null,
        departamento_id: this.selectedDeptoId || null
      }));

    if (rowsToImport.length === 0) {
      App.showToast('No hay registros aptos para importar.', 'warning');
      return;
    }

    const btn = document.getElementById('btn-import-valid');
    if (btn) btn.disabled = true;

    try {
      const response = await API.post('/api/bulk/import', {
        fileName: this.selectedFile.name,
        tipo_contacto: this.tipoContacto,
        rowsToImport,
        fileBase64: this.fileBase64,
        recomienda_nombre: recNombre,
        recomienda_email: recEmail,
        sede_id: this.selectedSedeId || null,
        departamento_id: this.selectedDeptoId || null
      });

      App.showToast(`🎉 ${response.message}`, 'success');
      this.cancelAnalysis();
      App.navigate('directory');
    } catch (err) {
      App.showToast(err.message || 'Error en la importación', 'error');
      if (btn) btn.disabled = false;
    }
  }
};
