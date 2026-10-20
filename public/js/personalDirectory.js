// Consulta por correo: el padrón determina la ficha y la dependencia de los resultados.
const PersonalDirectoryModule = {
  sequence: 0, lookupTimer: null, email: '', filters: { origen: 'actuales', q: '', tipo_contacto: '', metodo: '', director_id: '', departamento_id: '' }, page: 1,
  reset() {
    this.sequence++; clearTimeout(this.lookupTimer); this.lookupTimer = null; this.email = '';
    this.filters = { origen: 'actuales', q: '', tipo_contacto: '', metodo: '', director_id: '', departamento_id: '' }; this.page = 1;
  },
  esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  init() {
    this.reset();
    if (App.currentUser?.rol !== 'USUARIO' || App.suspended) return;
    document.getElementById('personal-view').innerHTML = '<section class="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">'+
      '<h2 class="text-xl font-bold mb-3">Consultar contactos por funcionario</h2>'+
      '<p class="text-sm text-slate-600 mb-4">Ingrese el correo institucional de la persona del TEC para consultar sus datos, sus registros individuales y masivos y el consolidado de su dependencia.</p>'+
      '<form id="personal-email-form" class="flex flex-wrap items-end gap-3"><label class="block text-sm" for="personal-email">Correo institucional<input id="personal-email" type="email" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="254" required class="form-control mt-1" placeholder="nombre@itcr.ac.cr" aria-describedby="personal-email-error"></label>'+
      '<button type="submit" class="btn btn-tec">Consultar</button><button type="button" id="personal-email-clear" class="btn btn-outline">Limpiar consulta</button></form>'+
      '<p id="personal-email-error" class="text-sm text-red-700 mt-3" role="alert"></p></section><div id="personal-results" class="mt-5"></div>';
    document.getElementById('personal-email').oninput = () => this.onEmailInput();
    document.getElementById('personal-email-form').onsubmit = event => { event.preventDefault(); this.lookupEmail(); };
    document.getElementById('personal-email-clear').onclick = () => {
      document.getElementById('personal-email').value = ''; this.onEmailInput(); document.getElementById('personal-email').focus();
    };
  },
  onEmailInput() {
    this.reset();
    document.getElementById('personal-results').replaceChildren();
    document.getElementById('personal-email-error').textContent = '';
    const value = document.getElementById('personal-email').value.trim().toLowerCase();
    if (/^[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@(itcr\.ac\.cr|tec\.ac\.cr)$/.test(value)) this.lookupTimer = setTimeout(() => this.lookupEmail(), 500);
  },
  lookupEmail() {
    clearTimeout(this.lookupTimer); this.lookupTimer = null;
    if (App.currentUser?.rol !== 'USUARIO' || App.suspended) return;
    const email = document.getElementById('personal-email').value.trim().toLowerCase();
    if (!/^[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@(itcr\.ac\.cr|tec\.ac\.cr)$/.test(email)) {
      this.email = ''; this.sequence++; document.getElementById('personal-results').replaceChildren();
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
    host.textContent = 'Consultando padrón y contactos…';
    document.getElementById('personal-email-error').textContent = '';
    try {
      const data = await API.get('/api/personal/contacts', { ...this.filters, email: this.email, page: String(page) });
      if (!this.valid(seq, session)) return;
      this.page = data.page;
      this.render(data);
    } catch (err) {
      if (!this.valid(seq, session)) return;
      host.replaceChildren();
      document.getElementById('personal-email-error').textContent = err.message;
    }
  },
  render(data) {
    if (App.currentUser?.rol !== 'USUARIO' || App.suspended) return;
    const esc = value => this.esc(value), f = data.funcionario, consolidated = this.filters.origen === 'consolidado';
    const option = (value, label, selected) => '<option value="'+esc(value)+'" '+(value===selected?'selected':'')+'>'+esc(label)+'</option>';
    const field = (name,label,value) => '<label class="block text-sm">'+label+'<input class="form-control mt-1" readonly value="'+esc(value)+'" aria-label="'+label+'"></label>';
    document.getElementById('personal-results').innerHTML = '<section class="bg-white border border-slate-200 rounded-xl p-6 sm:p-8"><h2 class="text-xl font-bold mb-4">Mis contactos por funcionario</h2>'+
      '<section class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5"><h3 class="font-bold mb-3">Datos de la persona del TEC que registra el contacto</h3><div class="grid grid-cols-1 sm:grid-cols-2 gap-3">'+
      field('nombre','Nombre',f.nombre)+field('email','Correo consultado',f.email)+field('dependencia','Escuela / Unidad vigente',f.dependencia)+field('sede','Sede',f.sede)+
      '</div><p class="text-xs text-slate-600 mt-3">Datos recuperados del padrón a partir del correo ingresado.</p>'+
      '</section>'+
      '<div class="flex gap-3 flex-wrap mb-4" role="group" aria-label="Procedencia de los contactos">'+
      '<button type="button" class="btn '+(!consolidated?'btn-tec':'btn-outline')+'" aria-pressed="'+(!consolidated)+'" onclick="PersonalDirectoryModule.changeOrigin(\'actuales\')">Registros individuales y masivos ('+data.counts.actuales+')</button>'+
      '<button type="button" class="btn '+(consolidated?'btn-tec':'btn-outline')+'" aria-pressed="'+consolidated+'" onclick="PersonalDirectoryModule.changeOrigin(\'consolidado\')">Consolidado de la dependencia ('+data.counts.consolidado+')</button></div>'+
      '<p class="text-sm text-slate-600 mb-4">'+(consolidated?'Contactos del consolidado vinculados por Correo director a la Escuela / Unidad de la ficha consultada. La procedencia institucional continúa como Administrador.':'Registros atribuidos a la ficha consultada, incluidos los de sesiones anteriores. Se conservan las dependencias de cada reporte; los registros de otras personas no se muestran.')+'</p>'+
      '<form id="personal-filters" class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5"><label class="block">Buscar contacto o institución<input id="personal-q" type="search" maxlength="200" class="form-control" value="'+esc(this.filters.q)+'"></label>'+
      '<label class="block">Tipo de contacto<select id="personal-tipo" class="form-control">'+option('','Todos',this.filters.tipo_contacto)+option('ACADEMICO','Académico',this.filters.tipo_contacto)+option('EMPLEADOR','Empleador',this.filters.tipo_contacto)+'</select></label>'+
      '<label class="block">Escuela / Unidad de los registros<select id="personal-departamento" class="form-control">'+option('','Todas las autorizadas',this.filters.departamento_id)+data.departments.map(d=>option(d.id,d.nombre,this.filters.departamento_id)).join('')+'</select></label>'+
      (consolidated?'<label class="block">Director asignado en el consolidado<select id="personal-director" class="form-control">'+option('','Todos los asignados a la dependencia',this.filters.director_id)+data.directors.map(d=>option(d.id,d.nombre+' · '+d.email,this.filters.director_id)).join('')+'</select></label>':
      '<label class="block">Forma de registro<select id="personal-metodo" class="form-control">'+option('','Individual y masiva',this.filters.metodo)+option('INDIVIDUAL','Registro individual',this.filters.metodo)+option('CARGA_MASIVA','Carga masiva',this.filters.metodo)+'</select></label>')+
      '<div class="flex gap-3"><button type="submit" class="btn btn-tec">Consultar</button><button type="button" id="personal-clear" class="btn btn-outline">Limpiar filtros</button></div></form>'+
      '<p role="status" class="text-sm mb-3">'+data.total+' contactos encontrados · Página '+data.page+' de '+data.pages+'</p>'+
      '<div class="table-responsive"><table class="data-table"><thead><tr><th>Contacto</th><th>Institución / Empresa</th><th>Escuela / Unidad</th><th>Procedencia / estado</th><th>Información</th></tr></thead><tbody>'+
      data.contacts.map(c=>'<tr><td>'+esc([c.first_name,c.last_name].filter(Boolean).join(' '))+'<br>'+esc(c.email || 'Correo sin completar')+'</td><td>'+esc(c.institution || c.company_name || 'Sin completar')+'</td><td>'+esc(c.departamento_nombre || c.escuela_proponente || 'Sin completar')+'</td><td>'+esc(c.es_consolidado?'Consolidado · Administrador':c.metodo_ingreso==='INDIVIDUAL'?'Registro individual':'Carga masiva')+'<br>'+esc(c.estado==='NUEVO'?'Pendiente de completar':c.estado)+'</td><td><details><summary class="cursor-pointer">Ver información</summary><dl class="text-xs mt-2">'+
      [['Tratamiento',c.title],['Correo',c.email],['Teléfono',c.phone],['País',c.country_name],['Cargo',c.job_title || c.position],['Departamento externo',c.department_unit],['Disciplina / Industria',c.subject_area || c.industry],['Correo director',c.director_email],['Autorización del consolidado',c.autorizacion_contacto],['Fecha de registro',c.created_at]].map(([k,v])=>'<dt class="font-bold mt-2">'+esc(k)+'</dt><dd>'+esc(v || 'Sin dato registrado')+'</dd>').join('')+'</dl></details></td></tr>').join('')+
      (data.contacts.length?'':'<tr><td colspan="5">No hay contactos para esta selección.</td></tr>')+
      '</tbody></table></div><div class="flex gap-3 mt-4"><button id="personal-prev" type="button" class="btn btn-outline" '+(data.page<=1?'disabled':'')+'>Anterior</button><button id="personal-next" type="button" class="btn btn-outline" '+(data.page>=data.pages?'disabled':'')+'>Siguiente</button></div></section>';
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
  changeOrigin(origen) {
    if (!['actuales','consolidado'].includes(origen)) return;
    this.filters.origen = origen; this.filters.metodo = ''; this.filters.director_id = ''; this.filters.departamento_id = ''; this.load();
  }
};
