// Módulo de Registro Individual de Contactos
const RegisterModule = {
  currentType: null, // 'ACADEMICO' | 'EMPLEADOR' | null
  catalogs: null,
  pendingSubmission: null,
  selectedSedeId: '',
  selectedDeptoId: '',
  recomiendaNombre: '',
  recomiendaEmail: '',
  touchedFields: {},
  submitting: false,
  emailExists: false,
  emailValid: false,
  emailIsTecDomain: false,
  isCustomSubject: false,
  customSubjectValue: '',
  emailCheckTimeout: null,
  recEmailCheckTimeout: null,
  funcionarioIdentificado: null,

  init(catalogs) {
    this.catalogs = catalogs;
    this.loadDraft();
    this.resetReporter();
    this.render();
  },

  draft: null,
  draftKey() { return `tec_qs_contact_draft_${App.currentUser?.id || 'local'}`; },

  loadDraft() {
    try {
      const saved = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(this.draftKey()) : null;
      this.draft = saved ? JSON.parse(saved) : null;
      if (!['ACADEMICO', 'EMPLEADOR'].includes(this.draft?.type)) this.draft = null;
    } catch (_) { this.draft = null; }
    this.currentType = this.draft?.type || null;
  },

  captureDraft() {
    const form = document.getElementById('contact-form');
    if (!form || !this.currentType) return;
    const fields = {};
    for (const input of form.querySelectorAll('[id^="field-"]')) fields[input.id] = input.value;
    this.draft = { type: this.currentType, fields, custom: this.isCustomSubject };
    try { sessionStorage.setItem(this.draftKey(), JSON.stringify(this.draft)); } catch (_) {}
  },

  restoreDraft() {
    if (this.draft?.type !== this.currentType) return;
    this.isCustomSubject = Boolean(this.draft.custom);
    for (const [id, value] of Object.entries(this.draft.fields || {})) {
      if (!id.startsWith('field-') || typeof value !== 'string') continue;
      const input = document.getElementById(id);
      if (!input) continue;
      if (input.tagName === 'SELECT' && ![...input.options].some(option => option.value === value)) {
        const option = document.createElement('option'); option.value = value; option.textContent = value; input.appendChild(option);
      }
      input.value = value;
    }
    document.getElementById('custom-subject-wrapper')?.classList.toggle('hidden', !this.isCustomSubject);
  },

  escapeReporterText(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  },

  getRecomiendaPrefix() {
    return this.recomiendaEmail.includes('@') && this.isInstitutionalEmail(this.recomiendaEmail)
      ? this.recomiendaEmail.split('@')[0] : this.recomiendaEmail;
  },

  getSelectedSedeNombre() {
    return this.isReporterVerified() ? this.funcionarioIdentificado.sede : 'Sede del TEC';
  },

  reporterDepartments() {
    const f = this.funcionarioIdentificado;
    return f?.dependencias_autorizadas || (f ? [{ id: f.departamento_id, nombre: f.dependencia, sede_id: f.sede_id }] : []);
  },

  getSelectedDeptoNombre() {
    return this.reporterDepartments().find(d => d.id === this.selectedDeptoId)?.nombre || (this.funcionarioIdentificado ? 'Seleccione la dependencia del aporte' : 'Oficina o Departamento');
  },

  selectReporterDepartment(id) {
    this.selectedDeptoId = this.reporterDepartments().some(d => d.id === id) ? id : '';
    this.selectedSedeId = this.reporterDepartments().find(d => d.id === id)?.sede_id || this.funcionarioIdentificado?.sede_id || '';
    this.updateCardDisplay();
  },

  chooseReporterDepartment() {
    if (typeof ReporterDepartmentDialog !== 'undefined') return ReporterDepartmentDialog.open(this, 'register');
    return false;
  },

  renderReporterDepartment() {
    const input = document.getElementById('reg-reporter-department');
    if (input) { input.value = this.getSelectedDeptoNombre(); input.disabled = !this.isReporterVerified(); }
    const button = document.getElementById('reg-choose-department');
    if (button) {
      button.disabled = !this.isReporterVerified() || this.reporterDepartments().length <= 1;
      button.textContent = this.selectedDeptoId ? 'Cambiar dependencia' : 'Elegir dependencia';
    }
  },


  getInitials(name) {
    if (!name) return 'TEC';
    const clean = name.replace(/^(dr\.|dra\.|ing\.|lic\.|licda\.|prof\.|profra\.|msc\.|phd)\s+/i, '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase() || 'TC';
  },

  render() {
    const container = document.getElementById('register-view');
    if (!container) return;

    // Generar opciones de sedes
    const sedesOptions = (this.catalogs?.sedes || []).map(s => `
      <option value="${this.escapeReporterText(s.id)}" ${s.id === this.selectedSedeId ? 'selected' : ''}>${this.escapeReporterText(s.nombre)}</option>
    `).join('');

    // Filtrar o listar departamentos (priorizando la sede seleccionada)
    const deptosParaSede = (this.catalogs?.departamentos || []).filter(d => !d.sede_id || d.sede_id === this.selectedSedeId);
    const todosDeptos = (this.catalogs?.departamentos || []);
    const listaDeptos = deptosParaSede.length > 0 ? deptosParaSede : todosDeptos;

    const deptosOptions = listaDeptos.map(d => `
      <option value="${this.escapeReporterText(d.id)}" ${d.id === this.selectedDeptoId ? 'selected' : ''}>${this.escapeReporterText(d.nombre)}</option>
    `).join('');

    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
        
        <!-- Encabezado de la Tarjeta de Registro -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100 mb-6">
          <div>
            <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center text-sm border border-blue-200/60 shadow-xs">
                <i class="fa-solid fa-user-plus text-blue-900"></i>
              </span>
              Registro Individual de Contactos
            </h2>
            <p class="text-xs sm:text-sm text-slate-500 mt-1">
              Recopilación oficial para participación institucional del TEC en el Ranking QS (Reputación Académica y Empleadores).
            </p>
          </div>
        </div>

        <!-- 1. Bloque: Datos de la persona del TEC que registra el contacto -->
        <div class="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 mb-6 shadow-2xs">
          <div class="mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
            <h3 class="text-xs sm:text-sm font-bold text-blue-950 uppercase tracking-wider m-0 flex items-center gap-2">
              <span class="w-6 h-6 rounded-md bg-blue-900 text-white flex items-center justify-center text-xs">
                <i class="fa-solid fa-id-card"></i>
              </span>
              Datos de la persona del TEC que registra el contacto
            </h3>
            <button type="button" 
                    class="btn btn-outline btn-xs text-blue-900 border-blue-200 bg-white hover:bg-blue-50 py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 rounded-lg shadow-2xs transition-colors shrink-0"
                    ${App.currentUser?.rol !== 'ADMIN' ? 'hidden' : ''} onclick="RegisterModule.openNuevoUsuarioModal()"
                    title="Incluir a una nueva persona funcionaria en el padrón del TEC">
              <i class="fa-solid fa-user-plus text-amber-600"></i>
              <span>+ Nuevo funcionario</span>
            </button>
          </div>

          <!-- Disposición simétrica: Izquierda (Input de correo acortado) y Derecha (Tarjeta de datos del funcionario) -->
          <div class="grid grid-cols-1 md:grid-cols-[minmax(260px,360px)_1fr] gap-5 items-start">
            <!-- COLUMNA IZQUIERDA: 1. Correo institucional del TEC * (Largo acortado a 360px y alto 76px) -->
            <div>
              <label class="form-label text-xs sm:text-sm font-bold text-slate-800 mb-2 block" for="reg-recomienda-email">
                1. Correo institucional del TEC <span class="req text-red-500 font-bold">*</span>
              </label>
              <div class="flex rounded-xl shadow-2xs overflow-hidden border border-slate-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 bg-white transition-all h-[76px] w-full max-w-[360px]" id="rec-input-group">
                <input type="text"
                       id="reg-recomienda-email"
                       class="flex-1 px-4 py-3 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 placeholder:italic outline-none border-0 h-full"
                       placeholder="Espacio para digitar el correo"
                       value="${this.escapeReporterText(this.getRecomiendaPrefix())}"
                       oninput="RegisterModule.onRecomiendaEmailInput(this.value)"
                       onblur="RegisterModule.onRecomiendaBlur('reg-recomienda-email')"
                       autocomplete="off"
                       spellcheck="false">
                <div id="reg-recomienda-domain" class="bg-slate-100 border-l border-slate-300 px-4 sm:px-5 flex items-center justify-center font-mono text-xs sm:text-sm text-slate-700 font-semibold select-none shrink-0 h-full">
                  itcr.ac.cr
                </div>
              </div>
              <div class="error-feedback mt-1.5" id="err-recomienda-email"></div>
              <div id="rec-email-spinner" class="hidden text-xs text-blue-800 font-medium mt-1.5 flex items-center gap-1.5">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Consultando padrón del TEC...</span>
              </div>
            </div>

            <!-- COLUMNA DERECHA: Tarjeta con ícono verde y datos en 3 filas (Mismo alto 76px) -->
            <div>
              <div class="text-xs sm:text-sm font-bold text-slate-800 mb-2 invisible select-none">
                <!-- Espaciador simétrico para alineación exacta con la etiqueta de la columna izquierda -->
                Detalle
              </div>
              <div id="card-funcionario-container" class="border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50/80 shadow-2xs flex items-center gap-3.5 h-[76px] transition-all">
                <!-- Ícono verde de usuario / check -->
                <div id="card-funcionario-icon" class="w-12 h-12 rounded-lg ${this.recomiendaNombre ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-200'} flex items-center justify-center text-2xl shrink-0 shadow-2xs">
                  <i class="fa-solid ${this.recomiendaNombre ? 'fa-user-check' : 'fa-user'}"></i>
                </div>

                <!-- 3 filas de información con interlineado simétrico -->
                <div class="flex-1 min-w-0" id="card-funcionario-text">
                  <div class="text-sm sm:text-base font-bold text-slate-900 truncate leading-tight" id="card-display-nombre">
                    ${this.escapeReporterText(this.isReporterVerified() ? this.recomiendaNombre : 'Nombre de la persona funcionaria')}
                  </div>
                  <div class="text-xs sm:text-sm text-slate-600 truncate leading-tight mt-1" id="card-display-depto">
                    ${this.escapeReporterText(this.getSelectedDeptoNombre())}
                  </div>
                  <div class="text-[11px] sm:text-xs text-slate-500 truncate leading-tight mt-0.5" id="card-display-sede">
                    ${this.escapeReporterText(this.getSelectedSedeNombre())}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mb-6">
          <label class="form-label" for="reg-reporter-department">Dependencia a la que corresponde el aporte *</label>
          <input id="reg-reporter-department" class="form-control" readonly aria-readonly="true"><button type="button" id="reg-choose-department" class="btn btn-outline mt-2" onclick="RegisterModule.chooseReporterDepartment()">Elegir dependencia</button>
          <div class="error-feedback" id="err-reporter-department"></div>
          <p class="text-sm text-slate-600 mt-2">Seleccione una dependencia asignada en el padrón o en el consolidado. Cada aporte se registra en una sola dependencia.</p>
        </div>

        <p id="contact-entry-lock-message" class="text-sm text-slate-600 mb-4" role="status">Primero identifique al funcionario y seleccione la dependencia del aporte para habilitar los datos del contacto.</p>
        <fieldset id="contact-entry-fields" ${this.isReporterVerified() && this.reporterDepartments().some(d => d.id === this.selectedDeptoId) ? '' : 'disabled inert'} aria-describedby="contact-entry-lock-message">
        <!-- 2. Selector de Tipo de Contacto (Dentro del Registro Individual) -->
        <div class="mb-6">
          <label class="block text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-blue-900 text-white flex items-center justify-center text-[11px] font-bold">2</span>
            Seleccione el Tipo de Contacto que desea registrar *
          </label>
          <div class="contact-type-selector">
            <div class="type-option-card ${this.currentType === 'ACADEMICO' ? 'selected' : ''}" id="opt-academico" onclick="RegisterModule.selectType('ACADEMICO')">
              <input type="radio" name="tipo_contacto" id="radio-academico" value="ACADEMICO" ${this.currentType === 'ACADEMICO' ? 'checked' : ''}>
              <div class="type-info">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-graduation-cap text-blue-800 text-base"></i>
                  <h4>Académico (Academic Survey)</h4>
                </div>
                <p>Profesores, investigadores, decanos y homólogos de universidades internacionales que conocen la calidad académica del TEC.</p>
              </div>
            </div>

            <div class="type-option-card ${this.currentType === 'EMPLEADOR' ? 'selected' : ''}" id="opt-empleador" onclick="RegisterModule.selectType('EMPLEADOR')">
              <input type="radio" name="tipo_contacto" id="radio-empleador" value="EMPLEADOR" ${this.currentType === 'EMPLEADOR' ? 'checked' : ''}>
              <div class="type-info">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-briefcase text-emerald-700 text-base"></i>
                  <h4>Empleador (Employer Survey)</h4>
                </div>
                <p>Gerentes, directores y reclutadores de empresas e industrias que contratan y valoran a los profesionales graduados del TEC.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Contenedor dinámico de campos de formulario (Dentro de la misma tarjeta) -->
        <div id="dynamic-form-area">
          ${this.currentType ? this.renderFormFields() : `
            <div class="text-center py-10 px-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
              <i class="fa-solid fa-arrow-pointer text-slate-400 text-3xl mb-2 block"></i>
              <p class="text-slate-600 font-medium text-sm">
                Seleccione si el contacto corresponde a un <strong>Académico</strong> o un <strong>Empleador</strong> para desplegar los campos correspondientes.
              </p>
              <p class="text-slate-400 text-xs mt-1">Los formularios no se muestran simultáneamente para evitar confusiones.</p>
            </div>
          `}
        </div>
        </fieldset>
      </div>

      <!-- Modal de Detección de Duplicados -->
      <div id="duplicate-modal-container"></div>
    `;

    if (this.currentType) {
      this.restoreDraft();
      this.attachFormListeners();
    }
    this.updateCardDisplay();
  },

  onSedeChange(sedeId, preserveDeptoId = null, preserveDeptoName = null) {
    this.selectedSedeId = sedeId;

    // Actualizar lista de departamentos
    const deptoSelect = document.getElementById('reg-departamento-id');
    if (deptoSelect && this.catalogs?.departamentos) {
      const deptosParaSede = this.catalogs.departamentos.filter(d => !d.sede_id || d.sede_id === sedeId);
      let listaDeptos = deptosParaSede.length > 0 ? deptosParaSede : this.catalogs.departamentos;

      // Si preserveDeptoId o preserveDeptoName no está en listaDeptos, incluirlo
      if (preserveDeptoId && !listaDeptos.some(d => d.id === preserveDeptoId)) {
        const foundGlobally = this.catalogs.departamentos.find(d => d.id === preserveDeptoId);
        if (foundGlobally) {
          listaDeptos = [foundGlobally, ...listaDeptos];
        } else if (preserveDeptoName) {
          listaDeptos = [{ id: preserveDeptoId, nombre: preserveDeptoName }, ...listaDeptos];
        }
      } else if (preserveDeptoName && !listaDeptos.some(d => d.nombre.toLowerCase() === preserveDeptoName.toLowerCase())) {
        const foundGlobally = this.catalogs.departamentos.find(d => d.nombre.toLowerCase() === preserveDeptoName.toLowerCase());
        if (foundGlobally) {
          listaDeptos = [foundGlobally, ...listaDeptos];
          preserveDeptoId = foundGlobally.id;
        } else {
          const tempId = preserveDeptoId || 'dep-' + Math.random().toString(36).substring(2, 9);
          listaDeptos = [{ id: tempId, nombre: preserveDeptoName }, ...listaDeptos];
          preserveDeptoId = tempId;
        }
      }

      deptoSelect.innerHTML = listaDeptos.map(d => `
        <option value="${this.escapeReporterText(d.id)}" ${preserveDeptoId ? (d.id === preserveDeptoId ? 'selected' : '') : (d.id === this.selectedDeptoId ? 'selected' : '')}>${this.escapeReporterText(d.nombre)}</option>
      `).join('');

      if (preserveDeptoId) {
        this.selectedDeptoId = preserveDeptoId;
        deptoSelect.value = preserveDeptoId;
      } else if (listaDeptos.length > 0 && !listaDeptos.some(d => d.id === this.selectedDeptoId)) {
        this.selectedDeptoId = listaDeptos[0].id;
        deptoSelect.value = listaDeptos[0].id;
      }
    }
    this.validateLive();
  },

  onDeptoChange(deptoId) {
    this.selectedDeptoId = deptoId;
    this.validateLive();
  },

  onRecomiendaNombreInput(val) {
    this.recomiendaNombre = val;
    const errEl = document.getElementById('err-recomienda-nombre');
    const inputEl = document.getElementById('reg-recomienda-nombre');
    if (val.trim().length > 0 && val.trim().length < 3) {
      if (errEl) errEl.innerHTML = `<span class="text-slate-500 text-xs"><i class="fa-solid fa-info-circle mr-1"></i> Mínimo 3 caracteres requeridos (ha digitado ${val.trim().length}).</span>`;
      if (inputEl) inputEl.classList.add('is-invalid');
    } else {
      if (errEl) errEl.textContent = '';
      if (inputEl) inputEl.classList.remove('is-invalid');
    }
    this.validateLive();
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
    if (typeof ReporterDepartmentDialog !== 'undefined') ReporterDepartmentDialog.close(this);
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
    if (typeof ReporterDepartmentDialog !== 'undefined') ReporterDepartmentDialog.close(this);
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
        this.selectedDeptoId = this.reporterDepartments().length === 1 ? this.reporterDepartments()[0].id : '';
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
        if (this.isReporterVerified() && this.reporterDepartments().length > 1 && !this.selectedDeptoId) this.chooseReporterDepartment();
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
    const modalContainer = document.getElementById('duplicate-modal-container');
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
            <button type="button" class="text-slate-400 hover:text-slate-600 text-lg" onclick="RegisterModule.closeNuevoUsuarioModal()">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <p class="text-xs text-slate-500 mb-4">
            Registre al funcionario/a en el padrón institucional del TEC. Una vez registrado, sus datos quedarán seleccionados automáticamente para este reporte, después de verificar su correo.
          </p>

          <form id="form-nuevo-funcionario" onsubmit="RegisterModule.saveNuevoUsuarioModal(event)" class="space-y-3.5">
            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Correo institucional del TEC *</label>
              <input type="text" 
                     id="modal-func-email" 
                     class="form-control text-sm" 
                     placeholder="usuario@itcr.ac.cr" 
                     required 
                     maxlength="120"
                     oninput="RegisterModule.onModalEmailInput(this.value)">
              <div class="error-feedback" id="err-modal-func-email"></div>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Nombre completo del funcionario/a *</label>
              <input type="text" 
                     id="modal-func-nombre" 
                     class="form-control text-sm" 
                     placeholder="Ej. Dr. Mario Fonseca Ruiz" 
                     required 
                     maxlength="100">
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Sede del TEC *</label>
              <select id="modal-func-sede" class="form-control text-sm" required>
                ${sedesOpts}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Carrera, Escuela, Departamento o Dependencia *</label>
              <input type="text" 
                     id="modal-func-dependencia" 
                     class="form-control text-sm" 
                     placeholder="Ej. Escuela de Ingeniería Forestal / Rectoría" 
                     required 
                     maxlength="120">
            </div>

            <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button type="button" class="btn btn-outline btn-sm" onclick="RegisterModule.closeNuevoUsuarioModal()">
                Cancelar
              </button>
              <button type="submit" class="btn btn-tec btn-sm" id="btn-save-modal-func">
                <i class="fa-solid fa-save mr-1"></i>
                Guardar en Padrón y Seleccionar
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const emailInput = document.getElementById('modal-func-email');
    if (emailInput) {
      emailInput.focus();
      const currentEmail = this.recomiendaEmail || (document.getElementById('reg-recomienda-email')?.value?.trim() ? `${document.getElementById('reg-recomienda-email').value.trim()}@itcr.ac.cr` : '');
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
    const feedbackEl = document.getElementById('err-modal-func-email');
    const btnSave = document.getElementById('btn-save-modal-func');
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
          const nombreInput = document.getElementById('modal-func-nombre');
          const sedeSelect = document.getElementById('modal-func-sede');
          const deptoInput = document.getElementById('modal-func-dependencia');
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
    const modalContainer = document.getElementById('duplicate-modal-container');
    if (modalContainer) modalContainer.innerHTML = '';
  },

  async saveNuevoUsuarioModal(event) {
    event.preventDefault();
    let email = document.getElementById('modal-func-email')?.value?.trim().toLowerCase() || '';
    if (email && !email.includes('@')) {
      email = `${email}@itcr.ac.cr`;
    }
    const nombre = document.getElementById('modal-func-nombre')?.value?.trim();
    const sedeId = document.getElementById('modal-func-sede')?.value;
    const dependencia = document.getElementById('modal-func-dependencia')?.value?.trim();
    const errEmail = document.getElementById('err-modal-func-email');

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

    const saveBtn = document.getElementById('btn-save-modal-func');
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

        // Actualizar catálogos si trajo nuevo departamento
        if (this.catalogs?.departamentos && res.funcionario.departamento_id) {
          if (!this.catalogs.departamentos.some(d => d.id === res.funcionario.departamento_id)) {
            this.catalogs.departamentos.push({
              id: res.funcionario.departamento_id,
              nombre: dependencia,
              sede_id: sedeId
            });
          }
        }

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
    const ready = verified && this.reporterDepartments().some(d => d.id === this.selectedDeptoId);
    const fields = document.getElementById('contact-entry-fields');
    if (fields) { fields.disabled = !ready; fields.inert = !ready; }
    const lockMessage = document.getElementById('contact-entry-lock-message');
    if (lockMessage) lockMessage.hidden = ready;
    this.renderReporterDepartment();
    const input = document.getElementById('reg-recomienda-email');
    if (input) {
      input.value = this.getRecomiendaPrefix();
      input.classList.toggle('is-valid', verified);
      input.classList.toggle('is-invalid', Boolean(this.reporterValidationError));
    }
    const domain = document.getElementById('reg-recomienda-domain');
    if (domain) domain.textContent = this.isInstitutionalEmail(this.recomiendaEmail)
      ? '@' + this.recomiendaEmail.split('@')[1] : '@itcr.ac.cr';
    const icon = document.getElementById('card-funcionario-icon');
    if (icon) {
      icon.className = `w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0 border ${verified ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`;
      icon.innerHTML = `<i class="fa-solid ${verified ? 'fa-user-check' : 'fa-user'}"></i>`;
    }
    const values = {
      'card-display-nombre': verified ? this.funcionarioIdentificado.nombre : 'Nombre de la persona funcionaria',
      'card-display-depto': this.getSelectedDeptoNombre(),
      'card-display-sede': this.getSelectedSedeNombre(),
      'err-recomienda-email': this.reporterValidationError || ''
    };
    for (const [id, value] of Object.entries(values)) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }
    document.getElementById('rec-email-spinner')?.classList.toggle('hidden', !this.reporterLookupPending);
    this.validateLive();
  },



  openBuscarFuncionarioModal() {
    const modalContainer = document.getElementById('duplicate-modal-container');
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
            <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center text-sm border border-blue-200/60">
                <i class="fa-solid fa-user-pen text-blue-900"></i>
              </span>
              Cambiar Persona Funcionaria del TEC
            </h3>
            <button type="button" class="text-slate-400 hover:text-slate-600 text-lg" onclick="RegisterModule.closeModal()">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <p class="text-xs text-slate-500 mb-3 shrink-0">
            Busque por nombre, apellido o correo institucional en el padrón oficial del TEC para seleccionarlo en la tarjeta.
          </p>

          <div class="relative mb-3 shrink-0">
            <input type="text" 
                   id="modal-search-funcionario-input" 
                   class="form-control text-sm pr-9" 
                   placeholder="Escriba nombre o correo (ej. Rodrigo Calvo o rcalvo)..."
                   oninput="RegisterModule.onSearchFuncionarioInput(this.value)">
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <i class="fa-solid fa-magnifying-glass"></i>
            </span>
          </div>

          <!-- Lista de resultados -->
          <div id="modal-search-results" class="flex-1 overflow-y-auto max-h-64 space-y-2 pr-1">
            <div class="text-center py-6 text-slate-400 text-xs">
              <i class="fa-solid fa-spinner fa-spin mr-1"></i> Cargando funcionarios...
            </div>
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-slate-100 mt-4 shrink-0">
            <button type="button" class="btn btn-outline btn-xs text-xs" onclick="RegisterModule.resetToCurrentUser()">
              <i class="fa-solid fa-rotate-left mr-1"></i> Usar mis datos de usuario
            </button>
            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-outline btn-xs text-blue-900 border-blue-200" ${App.currentUser?.rol !== 'ADMIN' ? 'hidden' : ''} onclick="RegisterModule.openNuevoUsuarioModal()">
                <i class="fa-solid fa-user-plus text-amber-600 mr-1"></i> + Nuevo funcionario
              </button>
              <button type="button" class="btn btn-outline btn-sm" onclick="RegisterModule.closeModal()">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const input = document.getElementById('modal-search-funcionario-input');
    if (input) {
      input.focus();
      this.searchFuncionariosInModal('');
    }
  },

  closeModal() {
    const modalContainer = document.getElementById('duplicate-modal-container');
    if (modalContainer) modalContainer.innerHTML = '';
  },

  onSearchFuncionarioInput(val) {
    clearTimeout(this.searchModalTimeout);
    this.searchModalTimeout = setTimeout(() => {
      this.searchFuncionariosInModal(val);
    }, 200);
  },

  async searchFuncionariosInModal(query) {
    const resultsContainer = document.getElementById('modal-search-results');
    if (!resultsContainer) return;

    try {
      const res = await API.get(`/api/funcionarios?q=${encodeURIComponent(query || '')}`);
      const list = res.funcionarios || [];
      if (list.length === 0) {
        resultsContainer.innerHTML = `
          <div class="text-center py-6 text-slate-400 text-xs">
            No se encontraron funcionarios que coincidan con "<strong>${this.escapeReporterText(query)}</strong>".
            <div class="mt-2">
              <button type="button" class="btn btn-outline btn-xs" ${App.currentUser?.rol !== 'ADMIN' ? 'hidden' : ''} onclick="RegisterModule.openNuevoUsuarioModal()">
                + Incluir como nuevo funcionario en el padrón
              </button>
            </div>
          </div>
        `;
        return;
      }

      resultsContainer.innerHTML = list.map(f => {
        const fJson = this.escapeReporterText(JSON.stringify(f));
        return `
          <div class="p-3 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-all flex items-center justify-between gap-3 cursor-pointer" onclick='RegisterModule.selectFuncionario(${fJson})'>
            <div class="min-w-0">
              <div class="text-xs font-bold text-slate-900 truncate">${this.escapeReporterText(f.nombre)}</div>
              <div class="text-[11px] font-mono text-blue-900">${this.escapeReporterText(f.email)}</div>
              <div class="text-[11px] text-slate-500 truncate">${this.escapeReporterText(f.sede || '')} · ${this.escapeReporterText(f.dependencia || '')}</div>
            </div>
            <button type="button" class="btn btn-tec btn-xs shrink-0 py-1 px-2.5 text-[11px]">
              Seleccionar
            </button>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.warn('Error al buscar funcionarios:', err);
    }
  },

  selectFuncionario(f) {
    this.closeModal();
    this.onRecomiendaEmailInput(f.email);
  },

  resetToCurrentUser() {
    this.closeModal();
    this.limpiarFuncionario();
  },

  onRecomiendaBlur(fieldId) {
    this.touchedFields[fieldId] = true;
    if (fieldId === 'reg-recomienda-email' && this.recomiendaEmail && !this.isReporterVerified() && !this.reporterLookupPending) {
      this.lookupFuncionario(this.recomiendaEmail);
    }
    this.validateLive();
  },

  selectType(type) {
    if (!this.isReporterVerified() || !this.reporterDepartments().some(d => d.id === this.selectedDeptoId)) {
      App.showToast('Primero identifique al funcionario y seleccione la dependencia del aporte.', 'warning');
      return;
    }
    if (this.draft && this.currentType !== type && !window.confirm('Cambiar el tipo descartará el borrador actual, ¿desea continuar?')) return;
    if (this.currentType !== type) {
      this.draft = null;
      try { sessionStorage.removeItem(this.draftKey()); } catch (_) {}
    }
    this.currentType = type;
    this.render();
  },

  renderFormFields() {
    const isAcademic = this.currentType === 'ACADEMICO';
    const countriesOptions = (this.catalogs?.paises || []).map(c => `<option value="${this.escapeReporterText(c)}">${this.escapeReporterText(c)}</option>`).join('');
    const titlesOptions = (this.catalogs?.titulos || ['Dr', 'Dra', 'Prof', 'Ing', 'Lic', 'MSc', 'PhD', 'Mr', 'Mrs', 'Ms']).map(t => `<option value="${this.escapeReporterText(t)}">${this.escapeReporterText(t)}</option>`).join('');
    const defaultSubjectsEs = [
      'Administración y Negocios',
      'Agricultura y Silvicultura / Ciencias Forestales',
      'Arquitectura y Urbanismo / Hábitat Construido',
      'Artes y Humanidades',
      'Biotecnología',
      'Ciencia de Datos e Inteligencia Artificial',
      'Ciencias Ambientales',
      'Ciencias Biológicas',
      'Ciencias de la Computación y Sistemas de Información',
      'Ciencias de la Salud',
      'Ciencias de la Tierra y Geología',
      'Ciencias Sociales y Administración',
      'Diseño Industrial',
      'Economía y Econometría',
      'Educación',
      'Estadística e Investigación Operativa',
      'Farmacología',
      'Física y Astronomía',
      'Ingeniería Civil y Estructural',
      'Ingeniería Eléctrica y Electrónica',
      'Ingeniería Industrial',
      'Ingeniería Mecánica, Aeronáutica y Manufactura',
      'Ingeniería Mecatrónica y Robótica',
      'Ingeniería Química',
      'Materiales y Ciencia de los Materiales',
      'Matemáticas',
      'Medicina',
      'Química'
    ];
    const rawSubjects = (this.catalogs?.areas_qs && this.catalogs.areas_qs.length > 0) ? this.catalogs.areas_qs : defaultSubjectsEs;
    const subjectsOptions = rawSubjects.map(s => `<option value="${this.escapeReporterText(s)}">${this.escapeReporterText(s)}</option>`).join('');
    const industriesOptions = (this.catalogs?.industrias_qs || []).map(i => `<option value="${this.escapeReporterText(i)}">${this.escapeReporterText(i)}</option>`).join('');

    return `
      <form id="contact-form" onsubmit="event.preventDefault(); RegisterModule.handleSubmit();" novalidate class="mt-4 pt-4 border-t border-slate-100">
        <div class="mb-5 flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-full bg-blue-900 text-white flex items-center justify-center text-[11px] font-bold">2</span>
            ${isAcademic ? 'Campos del Contacto Académico' : 'Campos del Contacto Empleador'}
          </span>
          <span class="text-xs text-slate-400 italic">* Campos obligatorios</span>
        </div>

        <!-- 1. PRIMERA FILA: Correo Electrónico (tamaño disminuido) -->
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-4 mb-4">
          <div class="sm:col-span-7 lg:col-span-6">
            <div class="form-group mb-0 bg-blue-50/60 p-3.5 rounded-xl border-2 border-blue-200/90 transition-all shadow-2xs" id="email-group-container">
              <div class="flex items-center justify-between mb-1.5">
                <label class="form-label text-xs font-bold text-blue-950 mb-0 flex items-center gap-2" for="field-email">
                  <i class="fa-solid fa-envelope text-blue-800"></i>
                  1. Correo electrónico <span class="req">*</span>
                </label>
                <div id="email-status-indicator" class="flex items-center gap-1.5 text-xs">
                  <span id="email-checking-spinner" class="text-blue-700 hidden items-center gap-1 font-medium">
                    <i class="fa-solid fa-spinner fa-spin"></i> Verificando en la base...
                  </span>
                </div>
              </div>
              <input type="text" 
                     inputmode="email" 
                     autocomplete="email" 
                     spellcheck="false" 
                     class="form-control text-sm bg-white" 
                     id="field-email" 
                     placeholder="${isAcademic ? 'caden@xyz-unistaff.com' : 'caden.p@xyz-limited.com'}" 
                     required 
                     maxlength="120" 
                     oninput="RegisterModule.onEmailInput(this.value)">
              <div class="error-feedback" id="err-email"></div>
            </div>
          </div>
        </div>

        <!-- 2. SEGUNDA FILA: Tratamiento / Título, Nombre, Apellido (3 columnas simétricas) -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div class="form-group mb-0">
            <label class="form-label text-xs font-bold text-slate-700" for="field-title">
              2. Tratamiento / Título <span class="req">*</span>
            </label>
            <select class="form-control text-sm bg-white" id="field-title" required onchange="RegisterModule.onFieldInput('field-title')">
              <option value="">Seleccione título...</option>
              ${titlesOptions}
            </select>
            <div class="error-feedback" id="err-title"></div>
          </div>

          <div class="form-group mb-0">
            <label class="form-label text-xs font-bold text-slate-700" for="field-first_name">
              3. Nombre <span class="req">*</span>
            </label>
            <input type="text" class="form-control text-sm bg-white" id="field-first_name" placeholder="Caden" required maxlength="80" oninput="RegisterModule.onFieldInput('field-first_name')">
            <div class="error-feedback" id="err-first_name"></div>
          </div>

          <div class="form-group mb-0">
            <label class="form-label text-xs font-bold text-slate-700" for="field-last_name">
              4. Apellido <span class="req">*</span>
            </label>
            <input type="text" class="form-control text-sm bg-white" id="field-last_name" placeholder="Puah" required maxlength="80" oninput="RegisterModule.onFieldInput('field-last_name')">
            <div class="error-feedback" id="err-last_name"></div>
          </div>
        </div>

        ${isAcademic ? `
          <!-- 3. TERCERA FILA (ACADÉMICO): Puesto / Cargo, Institución, Departamento (3 columnas simétricas) -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-job_title">
                Puesto / Cargo <span class="req">*</span>
              </label>
              <input type="text" class="form-control text-sm bg-white" id="field-job_title" placeholder="Lecturer / Professor" required maxlength="120" oninput="RegisterModule.onFieldInput('field-job_title')">
              <div class="error-feedback" id="err-job_title"></div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-institution">
                Institución <span class="req">*</span>
              </label>
              <input type="text" class="form-control text-sm bg-white" id="field-institution" placeholder="XYZ University" required maxlength="150" oninput="RegisterModule.onFieldInput('field-institution')">
              <div class="error-feedback" id="err-institution"></div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-department_unit">
                Departamento / Unidad <span class="req">*</span>
              </label>
              <input type="text" class="form-control text-sm bg-white" id="field-department_unit" placeholder="Medicine / Faculty of Sciences" required maxlength="120" oninput="RegisterModule.onFieldInput('field-department_unit')">
              <div class="error-feedback" id="err-department_unit"></div>
            </div>
          </div>

          <!-- 4. CUARTA FILA (ACADÉMICO): Área temática, País y Teléfono (3 columnas simétricas) -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div class="form-group mb-0">
              <div class="flex items-center justify-between mb-1">
                <label class="form-label mb-0 text-xs font-bold text-slate-700" for="field-subject_area">
                  Área temática / Disciplina <span class="req">*</span>
                </label>
                <button type="button" 
                        class="text-[11px] text-blue-900 hover:text-blue-950 font-bold flex items-center gap-1 hover:underline cursor-pointer" 
                        onclick="RegisterModule.toggleCustomSubject()">
                  <i class="fa-solid fa-circle-plus text-amber-600"></i>
                  <span>¿Otra?</span>
                </button>
              </div>

              <select class="form-control text-sm bg-white" id="field-subject_area" required onchange="RegisterModule.onSubjectAreaChange(this.value)">
                <option value="">Seleccione área temática...</option>
                ${subjectsOptions}
                <option value="__OTRA__" ${this.isCustomSubject ? 'selected' : ''}>+ Otra disciplina (incluir nueva)...</option>
              </select>
              <div class="error-feedback" id="err-subject_area"></div>

              <!-- Campo dinámico para escribir disciplina personalizada si no está en la lista -->
              <div id="custom-subject-wrapper" class="mt-2 p-2.5 bg-amber-50/90 border-2 border-amber-300 rounded-xl ${this.isCustomSubject ? '' : 'hidden'} transition-all shadow-2xs">
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-xs font-bold text-amber-950 flex items-center gap-1" for="field-subject_area_custom">
                    <i class="fa-solid fa-pen-to-square text-amber-700"></i>
                    Nombre de la disciplina *
                  </label>
                  <button type="button" class="text-[11px] text-slate-500 hover:text-slate-800 font-medium" onclick="RegisterModule.cancelCustomSubject()">
                    <i class="fa-solid fa-xmark mr-0.5"></i> Volver
                  </button>
                </div>
                <input type="text" 
                       class="form-control text-sm bg-white" 
                       id="field-subject_area_custom" 
                       placeholder="Ej. Nanotecnología Aplicada..." 
                       maxlength="120" 
                       value="${this.escapeReporterText(this.customSubjectValue || '')}"
                       oninput="RegisterModule.onCustomSubjectInput(this.value)">
                <div class="error-feedback" id="err-subject_area_custom"></div>
              </div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-country_name">
                País o territorio <span class="req">*</span>
              </label>
              <select class="form-control text-sm bg-white" id="field-country_name" required onchange="RegisterModule.onFieldInput('field-country_name')">
                <option value="">Seleccione país...</option>
                ${countriesOptions}
              </select>
              <div class="error-feedback" id="err-country_name"></div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-phone">
                Teléfono (opcional)
              </label>
              <input type="tel" class="form-control text-sm bg-white" id="field-phone" placeholder="60139999999" maxlength="20" oninput="RegisterModule.onFieldInput('field-phone')">
              <div class="error-feedback" id="err-phone"></div>
            </div>
          </div>
        ` : `
          <!-- 3. TERCERA FILA (EMPLEADOR): Puesto / Cargo, Industria, Nombre de la empresa (3 columnas simétricas) -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-position">
                Puesto / Cargo <span class="req">*</span>
              </label>
              <input type="text" class="form-control text-sm bg-white" id="field-position" placeholder="Manager" required maxlength="120" oninput="RegisterModule.onFieldInput('field-position')">
              <div class="error-feedback" id="err-position"></div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-industry">
                Industria / Sector <span class="req">*</span>
              </label>
              <select class="form-control text-sm bg-white" id="field-industry" required onchange="RegisterModule.onFieldInput('field-industry')">
                <option value="">Seleccione sector empresarial / industria...</option>
                ${industriesOptions}
              </select>
              <div class="error-feedback" id="err-industry"></div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-company_name">
                Nombre de la empresa / institución <span class="req">*</span>
              </label>
              <input type="text" class="form-control text-sm bg-white" id="field-company_name" placeholder="XYZ Limited" required maxlength="150" oninput="RegisterModule.onFieldInput('field-company_name')">
              <div class="error-feedback" id="err-company_name"></div>
            </div>
          </div>

          <!-- 4. CUARTA FILA (EMPLEADOR): País y Teléfono (simétrico) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-country_name">
                País o territorio <span class="req">*</span>
              </label>
              <select class="form-control text-sm bg-white" id="field-country_name" required onchange="RegisterModule.onFieldInput('field-country_name')">
                <option value="">Seleccione país...</option>
                ${countriesOptions}
              </select>
              <div class="error-feedback" id="err-country_name"></div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-phone">
                Teléfono (opcional)
              </label>
              <input type="tel" class="form-control text-sm bg-white" id="field-phone" placeholder="60139999999" maxlength="20" oninput="RegisterModule.onFieldInput('field-phone')">
              <div class="error-feedback" id="err-phone"></div>
            </div>
          </div>
        `}

        <!-- Acciones del Formulario -->
        <div class="flex items-center justify-end gap-3 pt-5 border-t border-slate-100 mt-4">
          <button type="button" class="btn btn-outline" onclick="RegisterModule.resetForm()">
            Cancelar / Limpiar
          </button>
          <button type="submit" class="btn btn-tec" id="btn-save" disabled>
            <i class="fa-solid fa-floppy-disk"></i>
            Guardar Contacto
          </button>
        </div>
      </form>
    `;
  },

  // Manejo de restricciones en el momento exacto de la digitación
  onFieldInput(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const val = el.value;
    const errId = 'err-' + fieldId.replace('field-', '').replace('reg-', '');
    const errEl = document.getElementById(errId);
    if (!errEl) return;

    if (fieldId === 'field-first_name' || fieldId === 'field-last_name') {
      const fieldName = fieldId === 'field-first_name' ? 'nombre' : 'apellido';
      if (/[<>{}[\]\\\/=^$*+?|]/.test(val)) {
        errEl.innerHTML = `<span class="text-red-600 font-medium text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> Carácter no permitido: no utilice símbolos especiales como &lt; &gt; / \\ = { } [ ] ^ * + ?</span>`;
        el.classList.add('is-invalid');
        this.validateLive();
        return;
      }
      if (val.trim().length === 1) {
        errEl.innerHTML = `<span class="text-slate-500 text-xs"><i class="fa-solid fa-info-circle mr-1"></i> El ${fieldName} requiere al menos 2 caracteres (ha digitado 1).</span>`;
        this.validateLive();
        return;
      }
      errEl.textContent = '';
      el.classList.remove('is-invalid');
    }

    if (fieldId === 'field-phone') {
      if (/[a-zA-Z]/.test(val)) {
        errEl.innerHTML = `<span class="text-red-600 font-medium text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> El teléfono solo admite dígitos numéricos y prefijo internacional "+" (sin letras).</span>`;
        el.classList.add('is-invalid');
        this.validateLive();
        return;
      }
      const digits = val.replace(/[^0-9]/g, '');
      if (val.trim().length > 0 && digits.length < 6) {
        errEl.innerHTML = `<span class="text-slate-500 text-xs"><i class="fa-solid fa-info-circle mr-1"></i> Mínimo 6 dígitos numéricos (ha digitado ${digits.length}).</span>`;
        this.validateLive();
        return;
      }
      errEl.textContent = '';
      el.classList.remove('is-invalid');
    }

    if (['field-job_title', 'field-position', 'field-department_unit', 'field-institution', 'field-company_name'].includes(fieldId)) {
      if (val.trim().length === 1) {
        errEl.innerHTML = `<span class="text-slate-500 text-xs"><i class="fa-solid fa-info-circle mr-1"></i> Mínimo 2 caracteres requeridos (ha digitado 1).</span>`;
        this.validateLive();
        return;
      }
      errEl.textContent = '';
      el.classList.remove('is-invalid');
    }

    this.validateLive();
  },

  // Manejo de Área Temática personalizada (cuando no está en la lista de QS)
  onSubjectAreaChange(val) {
    if (val === '__OTRA__') {
      this.isCustomSubject = true;
      const wrapper = document.getElementById('custom-subject-wrapper');
      if (wrapper) wrapper.classList.remove('hidden');
      const inputEl = document.getElementById('field-subject_area_custom');
      if (inputEl) inputEl.focus();
    } else {
      this.isCustomSubject = false;
      const wrapper = document.getElementById('custom-subject-wrapper');
      if (wrapper) wrapper.classList.add('hidden');
    }
    this.onFieldInput('field-subject_area');
    this.validateLive();
  },

  toggleCustomSubject() {
    this.isCustomSubject = !this.isCustomSubject;
    const select = document.getElementById('field-subject_area');
    const wrapper = document.getElementById('custom-subject-wrapper');
    if (this.isCustomSubject) {
      if (select) select.value = '__OTRA__';
      if (wrapper) wrapper.classList.remove('hidden');
      const inputEl = document.getElementById('field-subject_area_custom');
      if (inputEl) inputEl.focus();
    } else {
      if (select) select.value = '';
      if (wrapper) wrapper.classList.add('hidden');
    }
    this.validateLive();
  },

  cancelCustomSubject() {
    this.isCustomSubject = false;
    this.customSubjectValue = '';
    const select = document.getElementById('field-subject_area');
    const wrapper = document.getElementById('custom-subject-wrapper');
    if (select) select.value = '';
    if (wrapper) wrapper.classList.add('hidden');
    const inputEl = document.getElementById('field-subject_area_custom');
    if (inputEl) inputEl.value = '';
    this.validateLive();
  },

  onCustomSubjectInput(val) {
    this.customSubjectValue = val;
    const errEl = document.getElementById('err-subject_area_custom');
    const inputEl = document.getElementById('field-subject_area_custom');
    if (val.trim().length === 1) {
      if (errEl) errEl.innerHTML = `<span class="text-slate-500 text-xs"><i class="fa-solid fa-info-circle mr-1"></i> Mínimo 2 caracteres requeridos (ha digitado 1).</span>`;
      if (inputEl) inputEl.classList.add('is-invalid');
    } else {
      if (errEl) errEl.textContent = '';
      if (inputEl) inputEl.classList.remove('is-invalid');
    }
    this.validateLive();
  },

  // Verificación reactiva y de duplicados en tiempo real para Correo Electrónico
  onEmailInput(value) {
    this.emailCheckVersion = (this.emailCheckVersion || 0) + 1;
    clearTimeout(this.emailCheckTimeout);
    const trimmed = (value || '').trim();
    const errEl = document.getElementById('err-email');
    const inputEl = document.getElementById('field-email');
    const groupEl = document.getElementById('email-group-container');
    if (!errEl || !inputEl) return;

    // 1. Restricción de espacios en blanco durante la digitación
    if (/\s/.test(value)) {
      errEl.innerHTML = `<span class="text-red-600 font-medium text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> El correo no debe contener espacios en blanco.</span>`;
      inputEl.classList.add('is-invalid');
      inputEl.classList.remove('is-valid');
      if (groupEl) {
        groupEl.className = 'form-group mb-0 bg-red-50/50 p-3.5 rounded-xl border-2 border-red-300 transition-all';
      }
      this.emailValid = false;
      this.emailExists = false;
      this.emailIsTecDomain = false;
      this.validateLive();
      return;
    }

    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

    if (!trimmed) {
      errEl.textContent = '';
      inputEl.classList.remove('is-valid', 'is-invalid');
      if (groupEl) {
        groupEl.className = 'form-group mb-0 bg-blue-50/60 p-3.5 rounded-xl border-2 border-blue-200/90 transition-all shadow-2xs';
      }
      this.emailValid = false;
      this.emailExists = false;
      this.emailIsTecDomain = false;
      this.validateLive();
      return;
    }

    // 2. RESTRICCIÓN ESTRICTA DE CORREOS INSTITUCIONALES DEL TEC (@itcr.ac.cr / @tec.ac.cr)
    const cleanLower = trimmed.toLowerCase();
    const isTecDomain = cleanLower.endsWith('@itcr.ac.cr') || cleanLower.endsWith('@tec.ac.cr') || cleanLower.includes('@itcr.ac.cr') || cleanLower.includes('@tec.ac.cr');

    if (isTecDomain) {
      this.emailIsTecDomain = true;
      this.emailValid = false;
      this.emailExists = false;
      inputEl.classList.add('is-invalid');
      inputEl.classList.remove('is-valid');
      if (groupEl) {
        groupEl.className = 'form-group mb-0 bg-red-50/80 p-3.5 rounded-xl border-2 border-red-500 transition-all shadow-xs';
      }
      errEl.innerHTML = `
        <div class="p-3 bg-red-100/95 border-2 border-red-400 rounded-lg text-red-950 mt-2 shadow-xs animate-fadeIn">
          <div class="font-bold text-sm flex items-center gap-1.5 text-red-700">
            <i class="fa-solid fa-ban text-red-600 text-base"></i>
            Restricción institucional y QS: Correo no permitido
          </div>
          <div class="text-xs text-red-900 mt-1.5 font-semibold">
            No se permite el registro de contactos con correos del dominio institucional del TEC (<strong>@itcr.ac.cr</strong> / <strong>@tec.ac.cr</strong>).
          </div>
          <div class="text-[11px] text-red-800 mt-1 bg-white/80 p-2 rounded border border-red-200 leading-relaxed">
            <i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1"></i> Según las normativas internacionales de Quacquarelli Symonds (QS), las evaluaciones de reputación académica y empleadores deben corresponder a <strong>pares externos</strong> a la institución nominadora. No se permite la auto-nominación ni la postulación de colegas internos del TEC.
          </div>
        </div>
      `;
      this.validateLive();
      return;
    } else {
      this.emailIsTecDomain = false;
    }

    // Si aún no cumple sintaxis de correo
    if (!emailRegex.test(trimmed)) {
      if (this.touchedFields['field-email']) {
        errEl.innerHTML = `<span class="text-red-600 text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> Ingrese un formato de correo válido (ej. usuario@dominio.com).</span>`;
        inputEl.classList.add('is-invalid');
      } else {
        errEl.textContent = '';
        inputEl.classList.remove('is-invalid', 'is-valid');
      }
      if (groupEl) {
        groupEl.className = 'form-group mb-0 bg-blue-50/60 p-3.5 rounded-xl border-2 border-blue-200/90 transition-all shadow-2xs';
      }
      this.emailValid = false;
      this.emailExists = false;
      this.validateLive();
      return;
    }

    // Formato válido: verificar de inmediato en la base de datos (con debounce de 250ms)
    this.emailCheckTimeout = setTimeout(() => {
      this.checkEmailAvailability(trimmed);
    }, 250);
  },

  // Consulta inmediata a la base para determinar si el correo existe
  async checkEmailAvailability(email) {
    const version = this.emailCheckVersion = (this.emailCheckVersion || 0) + 1;
    const errEl = document.getElementById('err-email');
    const inputEl = document.getElementById('field-email');
    const spinner = document.getElementById('email-checking-spinner');
    const groupEl = document.getElementById('email-group-container');
    if (!errEl || !inputEl) return;

    // Doble verificación de dominio TEC
    const cleanEmailLower = email.toLowerCase().trim();
    if (cleanEmailLower.endsWith('@itcr.ac.cr') || cleanEmailLower.endsWith('@tec.ac.cr')) {
      this.emailIsTecDomain = true;
      this.emailValid = false;
      this.emailExists = false;
      inputEl.classList.add('is-invalid');
      inputEl.classList.remove('is-valid');
      if (groupEl) {
        groupEl.className = 'form-group mb-0 bg-red-50/80 p-3.5 rounded-xl border-2 border-red-500 transition-all shadow-xs';
      }
      errEl.innerHTML = `
        <div class="p-3 bg-red-100/95 border-2 border-red-400 rounded-lg text-red-950 mt-2 shadow-xs animate-fadeIn">
          <div class="font-bold text-sm flex items-center gap-1.5 text-red-700">
            <i class="fa-solid fa-ban text-red-600 text-base"></i>
            Restricción institucional y QS: Correo no permitido
          </div>
          <div class="text-xs text-red-900 mt-1.5 font-semibold">
            No se permite el registro de contactos con correos del dominio institucional del TEC (<strong>@itcr.ac.cr</strong> / <strong>@tec.ac.cr</strong>).
          </div>
          <div class="text-[11px] text-red-800 mt-1 bg-white/80 p-2 rounded border border-red-200 leading-relaxed">
            <i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1"></i> Los contactos del Ranking QS deben pertenecer obligatoriamente a instituciones o empresas externas.
          </div>
        </div>
      `;
      this.validateLive();
      return;
    }

    if (spinner) spinner.classList.remove('hidden');

    try {
      const res = await API.get(`/api/contacts/check-email?email=${encodeURIComponent(email)}`);
      if (version !== this.emailCheckVersion || inputEl.value.trim().toLowerCase() !== email.trim().toLowerCase()) return;
      if (spinner) spinner.classList.add('hidden');

      if (res.isTecDomain) {
        this.emailIsTecDomain = true;
        this.emailValid = false;
        this.emailExists = false;
        inputEl.classList.add('is-invalid');
        inputEl.classList.remove('is-valid');
        if (groupEl) {
          groupEl.className = 'form-group mb-0 bg-red-50/80 p-3.5 rounded-xl border-2 border-red-500 transition-all shadow-xs';
        }
        errEl.innerHTML = `
          <div class="p-3 bg-red-100/95 border-2 border-red-400 rounded-lg text-red-950 mt-2 shadow-xs animate-fadeIn">
            <div class="font-bold text-sm flex items-center gap-1.5 text-red-700">
              <i class="fa-solid fa-ban text-red-600 text-base"></i>
              Restricción institucional y QS: Correo no permitido
            </div>
            <div class="text-xs text-red-900 mt-1.5 font-semibold">
              ${this.escapeReporterText(res.message || 'No se permiten correos del dominio institucional del TEC.')}
            </div>
          </div>
        `;
      } else if (res.exists) {
        // EL CORREO YA EXISTE: alertar de inmediato para no perder tiempo
        this.emailExists = true;
        this.emailValid = false;
        this.emailIsTecDomain = false;
        inputEl.classList.add('is-invalid');
        inputEl.classList.remove('is-valid');

        if (groupEl) {
          groupEl.className = 'form-group mb-0 bg-red-50/60 p-3.5 rounded-xl border-2 border-red-400 transition-all shadow-xs';
        }

        const c = res.contact || {};
        const org = c.institution || c.company_name || 'Institución no especificada';

        errEl.innerHTML = `
          <div class="p-3 bg-red-100/80 border border-red-300 rounded-lg text-red-900 mt-2 shadow-xs animate-fadeIn">
            <div class="font-bold text-sm flex items-center gap-1.5 text-red-700">
              <i class="fa-solid fa-circle-xmark text-red-600 text-base"></i>
              Este correo ya existe
            </div>
            <div class="text-xs text-red-800 mt-1 font-medium">
              ${res.contact ? `Ya se encuentra registrado en el sistema como <strong>${this.escapeReporterText(c.tipo_contacto)}</strong>: ${this.escapeReporterText(c.first_name)} ${this.escapeReporterText(c.last_name)} (${this.escapeReporterText(org)}).` : 'El correo ya está registrado en el consolidado o en el directorio. Los detalles del contacto están restringidos, pero el correo no está disponible para otro registro.'}
            </div>
            <div class="text-[11px] text-red-700/90 mt-1 bg-white/70 p-1.5 rounded border border-red-200">
              <i class="fa-solid fa-hand text-amber-600 mr-1"></i> No es necesario continuar completando los demás campos para este contacto ya que se encuentra almacenado.
            </div>
          </div>
        `;
      } else {
        // CORREO DISPONIBLE Y VÁLIDO (EXTERNO)
        this.emailExists = false;
        this.emailValid = true;
        this.emailIsTecDomain = false;
        inputEl.classList.remove('is-invalid');
        inputEl.classList.add('is-valid');

        if (groupEl) {
          groupEl.className = 'form-group mb-0 bg-emerald-50/40 p-3.5 rounded-xl border-2 border-emerald-300 transition-all';
        }

        errEl.innerHTML = `
          <span class="text-emerald-700 text-xs font-semibold flex items-center gap-1 mt-1 bg-emerald-100/70 px-2 py-1 rounded border border-emerald-200">
            <i class="fa-solid fa-circle-check text-emerald-600"></i>
            Correo disponible · Externo y no registrado previamente en la base. Puede continuar completando los datos.
          </span>
        `;
      }
    } catch (err) {
      if (spinner) spinner.classList.add('hidden');
      console.warn('Error al verificar correo:', err);
    }

    this.validateLive();
  },

  attachFormListeners() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    const emailInput = document.getElementById('field-email');
    if (emailInput) {
      emailInput.addEventListener('blur', () => {
        emailInput.value = emailInput.value.trim();
        this.touchedFields['field-email'] = true;
        if (emailInput.value.length > 0) {
          this.checkEmailAvailability(emailInput.value);
        } else {
          this.validateLive();
        }
      });
    }

    form.addEventListener('input', () => this.captureDraft());
    form.addEventListener('change', () => this.captureDraft());
    const inputs = form.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        this.validateLive();
      });
      input.addEventListener('change', () => {
        this.touchedFields[input.id] = true;
        this.validateLive();
      });
      input.addEventListener('blur', () => {
        this.touchedFields[input.id] = true;
        this.validateLive();
      });
    });

    this.validateLive();
  },

  getFormData() {
    const isAcademic = this.currentType === 'ACADEMICO';
    const sedeSelect = document.getElementById('reg-sede-id');
    const deptoSelect = document.getElementById('reg-departamento-id');
    const recNombreInput = document.getElementById('reg-recomienda-nombre');
    const recEmailInput = document.getElementById('reg-recomienda-email');

    const recEmailClean = this.recomiendaEmail;

    const data = {
      tipo_contacto: this.currentType,
      recomienda_nombre: this.isReporterVerified() ? this.funcionarioIdentificado.nombre : '',
      recomienda_email: recEmailClean,
      title: document.getElementById('field-title')?.value.trim() || '',
      first_name: document.getElementById('field-first_name')?.value.trim() || '',
      last_name: document.getElementById('field-last_name')?.value.trim() || '',
      country_name: document.getElementById('field-country_name')?.value.trim() || '',
      email: document.getElementById('field-email')?.value.trim() || '',
      phone: document.getElementById('field-phone')?.value.trim() || '',
      sede_id: this.isReporterVerified() ? this.selectedSedeId : '',
      departamento_id: this.isReporterVerified() ? this.selectedDeptoId : null
    };

    if (isAcademic) {
      data.job_title = document.getElementById('field-job_title')?.value.trim() || '';
      data.department_unit = document.getElementById('field-department_unit')?.value.trim() || '';
      data.institution = document.getElementById('field-institution')?.value.trim() || '';

      const selectSubj = document.getElementById('field-subject_area')?.value.trim() || '';
      if (selectSubj === '__OTRA__' || this.isCustomSubject) {
        data.subject_area = document.getElementById('field-subject_area_custom')?.value.trim() || '';
      } else {
        data.subject_area = selectSubj;
      }
    } else {
      data.position = document.getElementById('field-position')?.value.trim() || '';
      data.industry = document.getElementById('field-industry')?.value.trim() || '';
      data.company_name = document.getElementById('field-company_name')?.value.trim() || '';
    }

    return data;
  },

  validateLive() {
    const data = this.getFormData();
    let isValid = this.isReporterVerified();
    const isAcademic = this.currentType === 'ACADEMICO';

    const checkField = (fieldId, errId, condition, errMsg, warningMsg = '') => {
      const el = document.getElementById(fieldId);
      const errEl = document.getElementById(errId);
      if (!el || !errEl) return;

      const isTouched = !!this.touchedFields[fieldId] || this.submitting;

      if (!condition) {
        isValid = false;
        if (this.submitting || (isTouched && el.value.trim().length > 0)) {
          el.classList.add('is-invalid');
          el.classList.remove('is-valid');
          errEl.innerHTML = `<span class="text-red-600 font-medium text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i>${errMsg}</span>`;
        } else {
          el.classList.remove('is-valid', 'is-invalid');
          errEl.textContent = '';
        }
      } else {
        el.classList.remove('is-invalid');
        if (el.value.trim().length > 0) {
          el.classList.add('is-valid');
        } else {
          el.classList.remove('is-valid');
        }

        if (warningMsg) {
          errEl.innerHTML = `<span class="text-amber-700 text-xs font-normal flex items-center gap-1 mt-0.5"><i class="fa-solid fa-triangle-exclamation"></i>${warningMsg}</span>`;
        } else {
          errEl.textContent = '';
        }
      }
    };

    // 0. Identificación de quien registra el contacto (Validación desde la tarjeta institucional)
    const recEmailClean = (data.recomienda_email || '').toLowerCase().trim();
    const isRecEmailValid = recEmailClean.length >= 6 && (recEmailClean.endsWith('@itcr.ac.cr') || recEmailClean.endsWith('@tec.ac.cr')) && !/\s/.test(recEmailClean);
    if (!data.recomienda_nombre || data.recomienda_nombre.length < 3) {
      isValid = false;
    }
    if (!isRecEmailValid) {
      isValid = false;
    }
    if (!data.sede_id) {
      isValid = false;
    }

    // 1. Evaluación crítica de Correo Electrónico
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    const isEmailFormatValid = emailRegex.test(data.email) && !/\s/.test(data.email);

    if (this.emailIsTecDomain) {
      isValid = false;
    } else if (this.emailExists) {
      isValid = false;
    } else if (!isEmailFormatValid) {
      isValid = false;
      const emailEl = document.getElementById('field-email');
      const errEmail = document.getElementById('err-email');
      if (data.email.length > 0 && this.touchedFields['field-email']) {
        if (emailEl) emailEl.classList.add('is-invalid');
        if (errEmail) errEmail.innerHTML = `<span class="text-red-600 text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> Formato de correo inválido (ej. usuario@dominio.com).</span>`;
      }
    }

    // 2. Procedencia Institucional de quien recomienda el contacto
    checkField('reg-sede-id', 'err-sede', data.sede_id && data.sede_id.length > 0, 'Seleccione la sede de procedencia.');
    checkField('reg-reporter-department', 'err-reporter-department', data.departamento_id && data.departamento_id.length > 0, 'Seleccione la escuela o unidad.');

    // 3. Tratamiento, Nombre y Apellido
    checkField('field-title', 'err-title', data.title.length > 0, 'Debe seleccionar un tratamiento o título oficial.');
    const hasInvalidNameChars = /[<>{}[\]\\\/=^$*+?|]/.test(data.first_name);
    checkField('field-first_name', 'err-first_name', data.first_name.length >= 2 && !hasInvalidNameChars, hasInvalidNameChars ? 'El nombre no debe contener caracteres especiales (<, >, /, =, etc.).' : 'El nombre debe tener al menos 2 caracteres (solo letras y espacios).');
    const hasInvalidLastChars = /[<>{}[\]\\\/=^$*+?|]/.test(data.last_name);
    checkField('field-last_name', 'err-last_name', data.last_name.length >= 2 && !hasInvalidLastChars, hasInvalidLastChars ? 'El apellido no debe contener caracteres especiales (<, >, /, =, etc.).' : 'El apellido debe tener al menos 2 caracteres (solo letras y espacios).');

    checkField('field-country_name', 'err-country_name', data.country_name.length > 0, 'Debe seleccionar un país o territorio de la lista homologada.');

    if (isAcademic) {
      checkField('field-job_title', 'err-job_title', data.job_title.length >= 2, 'El puesto o cargo formal es obligatorio (mínimo 2 caracteres).');
      checkField('field-department_unit', 'err-department_unit', data.department_unit.length >= 2, 'La facultad, departamento o unidad es obligatoria (mínimo 2 caracteres).');
      const isTecInst = data.institution.toLowerCase().includes('tecnologico de costa rica') || data.institution.toLowerCase() === 'tec';
      checkField(
        'field-institution',
        'err-institution',
        data.institution.length >= 2,
        'La institución universitaria o centro externo es obligatoria (mínimo 2 caracteres).',
        isTecInst ? 'Nota: Se recomienda indicar una universidad externa para pares académicos QS.' : ''
      );

      const isCustomSubj = this.isCustomSubject || document.getElementById('field-subject_area')?.value === '__OTRA__';
      if (isCustomSubj) {
        const customVal = document.getElementById('field-subject_area_custom')?.value.trim() || '';
        checkField('field-subject_area_custom', 'err-subject_area_custom', customVal.length >= 2, 'El nombre del área temática personalizada debe tener al menos 2 caracteres.');
        if (customVal.length < 2) isValid = false;
      } else {
        checkField('field-subject_area', 'err-subject_area', data.subject_area.length > 0, 'Debe seleccionar un área temática / disciplina académica o incluir una nueva.');
      }
    } else {
      checkField('field-position', 'err-position', data.position.length >= 2, 'El cargo o posición en la empresa es obligatorio (mínimo 2 caracteres).');
      checkField('field-industry', 'err-industry', data.industry.length > 0, 'Debe seleccionar el sector empresarial o industria.');
      checkField('field-company_name', 'err-company_name', data.company_name.length >= 2, 'La razón social o nombre de la empresa es obligatorio (mínimo 2 caracteres).');
    }

    if (data.phone.length > 0) {
      const phoneDigits = data.phone.replace(/[^0-9]/g, '');
      const hasPhoneLetters = /[a-zA-Z]/.test(data.phone);
      checkField('field-phone', 'err-phone', phoneDigits.length >= 6 && !hasPhoneLetters, hasPhoneLetters ? 'El teléfono no puede contener letras.' : 'El teléfono debe contener al menos 6 dígitos numéricos.');
    }

    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
      if (this.emailIsTecDomain) {
        btnSave.disabled = true;
        btnSave.innerHTML = `<i class="fa-solid fa-ban text-red-300"></i> Correo institucional @itcr.ac.cr no permitido`;
        btnSave.className = 'btn btn-tec bg-red-800 text-white opacity-70 cursor-not-allowed';
      } else if (this.emailExists) {
        btnSave.disabled = true;
        btnSave.innerHTML = `<i class="fa-solid fa-ban text-red-300"></i> Este correo ya existe`;
        btnSave.className = 'btn btn-tec bg-red-800 text-white opacity-70 cursor-not-allowed';
      } else {
        btnSave.disabled = !isValid;
        btnSave.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Guardar Contacto`;
        btnSave.className = 'btn btn-tec';
      }
    }

    return isValid;
  },

  async handleSubmit() {
    if (!this.isReporterVerified()) {
      App.showToast('Verifique el correo del funcionario en el padrón antes de guardar.', 'warning');
      return;
    }
    if (!this.selectedDeptoId) { this.chooseReporterDepartment(); return; }
    this.submitting = true;
    if (this.emailIsTecDomain) {
      App.showToast('Restricción QS: No se permiten correos del dominio institucional (@itcr.ac.cr / @tec.ac.cr). Los contactos deben ser externos.', 'error');
      return;
    }

    if (this.emailExists) {
      App.showToast('Este correo ya existe en la base de datos. No se puede duplicar.', 'error');
      return;
    }

    if (!this.validateLive()) {
      App.showToast('Por favor complete los campos obligatorios indicados.', 'warning');
      return;
    }

    const data = this.getFormData();
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Guardando contacto...
      `;
    }

    try {
      const response = await API.post('/api/contacts', data);
      this.onSuccess(response);
    } catch (err) {
      if (err.data && (err.data.duplicateStatus === 'EXACT_MATCH' || err.data.duplicateStatus === 'POTENTIAL_DUPLICATE')) {
        this.showDuplicateDialog(data, err.data);
      } else {
        for (const [field, message] of Object.entries(err.data?.validationErrors || {})) {
          const key = ({ subject: 'subject_area', country: 'country_name', department: 'department_unit' })[field] || field;
          const error = document.getElementById(`err-${key}`);
          if (error) error.textContent = message;
          document.getElementById(`field-${key}`)?.classList.add('is-invalid');
        }
        App.showToast(err.message || 'Revise los campos indicados.', 'error');
      }
    } finally {
      if (btnSave) {
        btnSave.disabled = !this.isReporterVerified();
        btnSave.innerHTML = `
          <i class="fa-solid fa-floppy-disk"></i>
          Guardar Contacto
        `;
      }
    }
  },

  onSuccess(res) {
    App.showToast('✅ Contacto registrado exitosamente en el sistema.', 'success');
    // Si se usó una disciplina personalizada, agregarla a la lista en memoria para futuros contactos
    const data = this.getFormData();
    if (data.subject_area && this.catalogs?.areas_qs && !this.catalogs.areas_qs.includes(data.subject_area)) {
      this.catalogs.areas_qs.push(data.subject_area);
    }
    this.clearDraft();
    this.resetForm();
  },

  clearDraft() {
    this.draft = null;
    try { sessionStorage.removeItem(this.draftKey()); } catch (_) {}
  },

  resetForm() {
    if (this.draft && !window.confirm('¿Desea descartar el borrador del contacto?')) return;
    this.clearDraft();
    clearTimeout(this.emailCheckTimeout);
    this.emailExists = false;
    this.emailValid = false;
    this.emailIsTecDomain = false;
    this.isCustomSubject = false;
    this.customSubjectValue = '';
    this.touchedFields = {};
    this.submitting = false;
    this.currentType = null;
    this.resetReporter();
    this.render();
  },

  showDuplicateDialog(candidateData, errorData) {
    const isExact = errorData.duplicateStatus === 'EXACT_MATCH';
    const details = errorData.duplicateDetails;
    const existing = details.existingContact;

    const modalContainer = document.getElementById('duplicate-modal-container');
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title flex items-center gap-2" style="color: ${isExact ? 'var(--status-error)' : 'var(--status-warning)'};">
              <i class="fa-solid fa-triangle-exclamation"></i>
              ${isExact ? 'Coincidencia Exacta Detectada' : 'Posible Contacto Duplicado'}
            </h3>
            <button class="modal-close" onclick="RegisterModule.closeDuplicateModal()">&times;</button>
          </div>

          <div class="alert ${isExact ? 'alert-error' : 'alert-warning'}">
            <div>
              <strong>Diagnóstico del Sistema:</strong> ${this.escapeReporterText(details.explanation)}
              ${isExact ? '<p class="mt-1">Por integridad del proceso QS, el sistema no permite duplicar este contacto.</p>' : ''}
            </div>
          </div>

          <div class="diff-comparison">
            <div class="diff-col">
              <h5>Datos Que Intenta Registrar</h5>
              <div class="diff-item"><strong>Nombre:</strong> ${this.escapeReporterText(candidateData.first_name)} ${this.escapeReporterText(candidateData.last_name)}</div>
              <div class="diff-item"><strong>Correo:</strong> ${this.escapeReporterText(candidateData.email)}</div>
              <div class="diff-item"><strong>Tipo:</strong> ${this.escapeReporterText(candidateData.tipo_contacto)}</div>
              <div class="diff-item"><strong>Institución/Empresa:</strong> ${this.escapeReporterText(candidateData.institution || candidateData.company_name)}</div>
              <div class="diff-item"><strong>País:</strong> ${this.escapeReporterText(candidateData.country_name)}</div>
            </div>

            <div class="diff-col">
              <h5>Registro Existente en Sistema</h5>
              <div class="diff-item"><strong>Nombre:</strong> ${this.escapeReporterText(existing.first_name)} ${this.escapeReporterText(existing.last_name)}</div>
              <div class="diff-item"><strong>Correo:</strong> ${this.escapeReporterText(existing.email)}</div>
              <div class="diff-item"><strong>Tipo:</strong> ${this.escapeReporterText(existing.tipo_contacto)}</div>
              <div class="diff-item"><strong>Institución/Empresa:</strong> ${this.escapeReporterText(existing.institution || existing.company_name)}</div>
              <div class="diff-item"><strong>Registrado por:</strong> ${this.escapeReporterText(existing.created_by_name || 'Usuario institucional')}</div>
              <div class="diff-item"><strong>Fecha de registro:</strong> ${new Date(existing.created_at).toLocaleDateString()}</div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 mt-6">
            <button class="btn btn-outline" onclick="RegisterModule.closeDuplicateModal()">
              Cerrar y Corregir Datos
            </button>
            ${!isExact ? `
              <button class="btn btn-tec" onclick="RegisterModule.confirmDuplicateOverride()">
                Confirmar Como Contacto Distinto
              </button>
            ` : `
              <button class="btn btn-tec" onclick="App.navigate('directory'); RegisterModule.closeDuplicateModal();">
                Ver Registro Existente en Directorio
              </button>
            `}
          </div>
        </div>
      </div>
    `;

    this.pendingSubmission = candidateData;
  },

  closeDuplicateModal() {
    const modalContainer = document.getElementById('duplicate-modal-container');
    if (modalContainer) modalContainer.innerHTML = '';
    this.pendingSubmission = null;
  },

  async confirmDuplicateOverride() {
    if (!this.pendingSubmission) return;
    try {
      const response = await API.post('/api/contacts', {
        ...this.pendingSubmission,
        allow_duplicate_override: true
      });
      this.closeDuplicateModal();
      this.onSuccess(response);
    } catch (err) {
      App.showToast(err.message || 'Error al forzar guardado', 'error');
    }
  }
};
