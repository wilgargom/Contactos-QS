// Consulta por correo: el padrón determina la ficha y la dependencia de los resultados.
const PersonalDirectoryModule = {
  sequence: 0, lookupTimer: null, email: '', filters: { origen: 'actuales', q: '', tipo_contacto: '', metodo: '', director_id: '', departamento_id: '' }, page: 1,
  reset() {
    this.sequence++; clearTimeout(this.lookupTimer); this.lookupTimer = null; this.email = '';
    this.filters = { origen: 'actuales', q: '', tipo_contacto: '', metodo: '', director_id: '', departamento_id: '' }; this.page = 1;
  },
  esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  normalizeEmail(value) {
    const clean = String(value || '').trim().toLowerCase();
    return clean && !clean.includes('@') ? clean + '@itcr.ac.cr' : clean;
  },
  isInstitutionalEmail(value) { return /^[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@(itcr\.ac\.cr|tec\.ac\.cr)$/.test(value); },
  init() {
    this.reset();
    if (App.currentUser?.rol !== 'USUARIO' || App.suspended) return;
    document.getElementById('personal-view').innerHTML = `
      <div class="personal-directory">
        <section class="personal-panel" aria-labelledby="personal-title">
          <div class="personal-heading">
            <span class="personal-heading-icon" aria-hidden="true"><i class="fa-solid fa-address-book"></i></span>
            <div><h2 id="personal-title">Contactos por funcionario</h2><p>Consulte los registros de una persona del TEC y el consolidado de su dependencia.</p></div>
          </div>
          <section class="personal-reporter" aria-labelledby="personal-reporter-title">
            <h3 id="personal-reporter-title" class="personal-section-title"><i class="fa-solid fa-id-card" aria-hidden="true"></i> Datos de la persona del TEC</h3>
            <div class="personal-lookup-grid">
              <form id="personal-email-form" class="personal-email-form">
                <label class="form-label" for="personal-email">Correo institucional del TEC <span class="req">*</span></label>
                <div class="personal-email-group">
                  <input id="personal-email" type="text" inputmode="email" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="254" required placeholder="Digite el correo" aria-describedby="personal-email-help personal-email-error">
                  <span id="personal-email-domain" class="personal-email-domain">@itcr.ac.cr</span>
                </div>
                <p id="personal-email-help" class="personal-help">Escriba el usuario o el correo completo, también se admite @tec.ac.cr.</p>
                <div class="personal-actions"><button type="submit" class="btn btn-tec">Consultar</button><button type="button" id="personal-email-clear" class="btn btn-outline">Limpiar consulta</button></div>
                <p id="personal-email-error" class="personal-error" role="alert"></p>
              </form>
              <div id="personal-identity" aria-live="polite"></div>
            </div>
          </section>
        </section>
        <div id="personal-results" aria-busy="false"></div>
      </div>`;
    this.renderIdentity();
    document.getElementById('personal-email').oninput = () => this.onEmailInput();
    document.getElementById('personal-email-form').onsubmit = event => { event.preventDefault(); this.lookupEmail(); };
    document.getElementById('personal-email-clear').onclick = () => {
      document.getElementById('personal-email').value = ''; this.onEmailInput(); document.getElementById('personal-email').focus();
    };
  },
  renderIdentity(funcionario = null, pending = false) {
    const esc = value => this.esc(value);
    document.getElementById('personal-identity').innerHTML = `
      <div class="personal-identity-card ${funcionario ? 'is-found' : ''}">
        <span class="personal-person-icon" aria-hidden="true"><i class="fa-solid ${pending ? 'fa-spinner fa-spin' : funcionario ? 'fa-user-check' : 'fa-user'}"></i></span>
        <div class="personal-person-data">
          <span class="personal-eyebrow">${pending ? 'Consultando padrón' : funcionario ? 'Persona encontrada en el padrón' : 'Persona funcionaria'}</span>
          <strong>${esc(funcionario?.nombre || (pending ? 'Buscando información…' : 'Nombre de la persona funcionaria'))}</strong>
          <p>${esc(funcionario?.dependencia || 'Oficina o Departamento')}</p>
          <p class="personal-person-sede">${esc(funcionario?.sede || 'Sede del TEC')}</p>
          ${funcionario ? `<span class="personal-person-email">${esc(funcionario.email)}</span>` : ''}
        </div>
      </div>`;
  },
  onEmailInput() {
    this.reset();
    document.getElementById('personal-results').replaceChildren();
    document.getElementById('personal-email-error').textContent = '';
    this.renderIdentity();
    const raw = document.getElementById('personal-email').value;
    document.getElementById('personal-email-domain').hidden = raw.includes('@');
    const value = this.normalizeEmail(raw);
    if (this.isInstitutionalEmail(value)) this.lookupTimer = setTimeout(() => this.lookupEmail(), 500);
  },
  lookupEmail() {
    clearTimeout(this.lookupTimer); this.lookupTimer = null;
    if (App.currentUser?.rol !== 'USUARIO' || App.suspended) return;
    const email = this.normalizeEmail(document.getElementById('personal-email').value);
    if (!this.isInstitutionalEmail(email)) {
      this.email = ''; this.sequence++; document.getElementById('personal-results').replaceChildren(); this.renderIdentity();
      document.getElementById('personal-email-error').textContent = 'Ingrese un correo institucional @itcr.ac.cr o @tec.ac.cr.';
      return;
    }
    this.email = email;
    return this.load();
  },
  valid(seq, session) {
    return seq === this.sequence && session === App.sessionVersion && App.currentUser?.rol === 'USUARIO' && !App.suspended;
  },
  async load(page = 1) {
    if (!this.email || App.currentUser?.rol !== 'USUARIO' || App.suspended) return;
    const seq = ++this.sequence, session = App.sessionVersion, host = document.getElementById('personal-results');
    // La tarjeta permanece visible al filtrar; se renueva al consultar otro correo.
    if (!host.innerHTML) this.renderIdentity(null, true);
    host.innerHTML = '<div class="personal-loading" role="status"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Consultando contactos…</div>';
    document.getElementById('personal-email-error').textContent = '';
    try {
      const data = await API.get('/api/personal/contacts', { ...this.filters, email: this.email, page: String(page) });
      if (!this.valid(seq, session)) return;
      this.page = data.page;
      this.render(data);
    } catch (err) {
      if (!this.valid(seq, session)) return;
      host.replaceChildren(); this.renderIdentity();
      document.getElementById('personal-email-error').textContent = err.message;
    }
  },
  render(data) {
    if (App.currentUser?.rol !== 'USUARIO' || App.suspended) return;
    this.renderIdentity(data.funcionario);
    const esc = value => this.esc(value), consolidated = this.filters.origen === 'consolidado';
    const option = (value, label, selected) => '<option value="'+esc(value)+'" '+(value===selected?'selected':'')+'>'+esc(label)+'</option>';
    const field = (id, label, control) => `<div class="form-group"><label class="form-label" for="${id}">${label}</label>${control}</div>`;
    const source = (value, title, description, count, icon) => `<button type="button" class="personal-source ${this.filters.origen === value ? 'is-selected' : ''}" aria-pressed="${this.filters.origen === value}" onclick="PersonalDirectoryModule.changeOrigin('${value}')"><span class="personal-source-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></span><span class="personal-source-copy"><strong>${title}</strong><span>${description}</span></span><span class="personal-source-count">${esc(count)}</span></button>`;
    document.getElementById('personal-results').innerHTML = `
      <section class="personal-panel" aria-labelledby="personal-contacts-title">
        <h3 id="personal-contacts-title" class="personal-section-title">Contactos asociados</h3>
        <div class="personal-sources" role="group" aria-label="Procedencia de los contactos">
          ${source('actuales', 'Registros individuales y masivos', 'Contactos reportados por esta persona', data.counts.actuales, 'fa-user-pen')}
          ${source('consolidado', 'Consolidado de la dependencia', 'Contactos de la carga institucional', data.counts.consolidado, 'fa-building-columns')}
        </div>
        <p class="personal-source-help">${consolidated ? 'Contactos del consolidado asignados a la dependencia vigente del funcionario consultado.' : 'Registros individuales y masivos asociados al correo consultado, incluidos los de sesiones anteriores.'}</p>
        <form id="personal-filters" class="personal-filters">
          <h4>Filtrar contactos</h4>
          <div class="personal-filter-grid">
            ${field('personal-q', 'Buscar contacto o institución', `<input id="personal-q" type="search" maxlength="200" class="form-control" placeholder="Nombre, correo o institución" value="${esc(this.filters.q)}">`)}
            ${field('personal-tipo', 'Tipo de contacto', `<select id="personal-tipo" class="form-control">${option('', 'Todos los tipos', this.filters.tipo_contacto)+option('ACADEMICO', 'Académico', this.filters.tipo_contacto)+option('EMPLEADOR', 'Empleador', this.filters.tipo_contacto)}</select>`)}
            ${field('personal-departamento', 'Escuela / Unidad de los registros', `<select id="personal-departamento" class="form-control">${option('', 'Todas las dependencias', this.filters.departamento_id)+data.departments.map(d=>option(d.id,d.nombre,this.filters.departamento_id)).join('')}</select>`)}
            ${consolidated ? field('personal-director', 'Director asignado', `<select id="personal-director" class="form-control">${option('', 'Todos los directores', this.filters.director_id)+data.directors.map(d=>option(d.id,d.nombre+' · '+d.email,this.filters.director_id)).join('')}</select>`) : field('personal-metodo', 'Forma de registro', `<select id="personal-metodo" class="form-control">${option('', 'Individual y masiva', this.filters.metodo)+option('INDIVIDUAL', 'Registro individual', this.filters.metodo)+option('CARGA_MASIVA', 'Carga masiva', this.filters.metodo)}</select>`)}
          </div>
          <div class="personal-actions"><button type="submit" class="btn btn-tec">Aplicar filtros</button><button type="button" id="personal-clear" class="btn btn-outline">Limpiar filtros</button></div>
        </form>
        <div class="personal-results-heading"><h4>${consolidated ? 'Contactos del consolidado' : 'Contactos reportados'}</h4><p role="status">${esc(data.total)} ${data.total === 1 ? 'contacto encontrado' : 'contactos encontrados'}${data.pages > 1 ? ' · Página '+esc(data.page)+' de '+esc(data.pages) : ''}</p></div>
        ${data.contacts.length ? `<div class="personal-contact-list">${data.contacts.map(c=>this.renderContact(c)).join('')}</div>` : `<div class="personal-empty"><i class="fa-solid fa-address-book" aria-hidden="true"></i><strong>No hay contactos para esta selección</strong><p>${data.counts[consolidated ? 'consolidado' : 'actuales'] ? 'Pruebe con otros filtros o limpie la búsqueda.' : consolidated ? 'Todavía no hay contactos consolidados vinculados a esta dependencia.' : 'Todavía no hay registros individuales o masivos asociados a este correo.'}</p></div>`}
        <nav class="personal-pagination" aria-label="Páginas de contactos" ${data.pages <= 1 ? 'hidden' : ''}><button id="personal-prev" type="button" class="btn btn-outline" ${data.page<=1?'disabled':''}>Anterior</button><span>Página ${esc(data.page)} de ${esc(data.pages)}</span><button id="personal-next" type="button" class="btn btn-outline" ${data.page>=data.pages?'disabled':''}>Siguiente</button></nav>
      </section>`;
    document.getElementById('personal-filters').onsubmit = event => {
      event.preventDefault(); this.filters.q = document.getElementById('personal-q').value.trim();
      this.filters.tipo_contacto = document.getElementById('personal-tipo').value;
      this.filters.departamento_id = document.getElementById('personal-departamento').value;
      if (consolidated) this.filters.director_id = document.getElementById('personal-director').value;
      else this.filters.metodo = document.getElementById('personal-metodo').value;
      this.load();
    };
    document.getElementById('personal-clear').onclick = () => { const origen = this.filters.origen, email = this.email; this.reset(); this.email = email; this.filters.origen = origen; this.load(); };
    document.getElementById('personal-prev').onclick = () => this.load(this.page-1);
    document.getElementById('personal-next').onclick = () => this.load(this.page+1);
  },
  renderContact(c) {
    const esc = value => this.esc(value), academic = c.tipo_contacto === 'ACADEMICO';
    const origin = c.es_consolidado ? 'Consolidado institucional' : c.metodo_ingreso === 'INDIVIDUAL' ? 'Registro individual' : 'Carga masiva';
    const name = [c.title, c.first_name, c.last_name].filter(Boolean).join(' ') || 'Nombre sin completar';
    const info = fields => fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value || 'Sin dato registrado')}</dd></div>`).join('');
    const date = c.created_at && !Number.isNaN(Date.parse(c.created_at)) ? new Intl.DateTimeFormat('es-CR', {dateStyle:'medium', timeZone:'America/Costa_Rica'}).format(new Date(c.created_at)) : c.created_at;
    return `<details class="personal-contact">
      <summary><div class="personal-contact-person"><span class="personal-contact-type">${academic ? 'Académico' : 'Empleador'}</span><strong>${esc(name)}</strong><span>${esc(c.email || 'Correo sin completar')}</span></div>
        <div class="personal-contact-organization"><strong>${esc(c.institution || c.company_name || 'Institución sin completar')}</strong><span>${esc(c.departamento_nombre || c.escuela_proponente || 'Dependencia sin completar')}</span></div>
        <div class="personal-contact-status"><span class="personal-state">${esc(c.estado === 'NUEVO' ? 'Pendiente de completar' : c.estado || 'Sin estado')}</span><span>${origin}</span></div>
        <span class="personal-contact-toggle">Ver información <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></span>
      </summary>
      <div class="personal-contact-detail"><section><h5>Datos del contacto</h5><dl>${info([['Correo',c.email],['Teléfono',c.phone],['País',c.country_name],['Cargo',c.job_title || c.position],['Departamento externo',c.department_unit],['Disciplina / Industria',c.subject_area || c.industry]])}</dl></section>
        <section><h5>Información del registro</h5><dl>${info([['Escuela / Unidad',c.departamento_nombre || c.escuela_proponente],['Procedencia', c.es_consolidado ? 'Consolidado · Administrador' : origin],['Fecha de registro',date],...(c.es_consolidado ? [['Correo director',c.director_email],['Autorización de contacto',c.autorizacion_contacto]] : [])])}</dl></section></div>
    </details>`;
  },
  changeOrigin(origen) {
    if (!['actuales','consolidado'].includes(origen)) return;
    this.filters.origen = origen; this.filters.metodo = ''; this.filters.director_id = ''; this.filters.departamento_id = ''; this.load();
  }
};
