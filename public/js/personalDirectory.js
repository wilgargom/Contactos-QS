// Consulta de funcionarios: identidad institucional y alcance calculados exclusivamente en el servidor.
const PersonalDirectoryModule = {
  sequence: 0, filters: { origen: 'actuales', q: '', tipo_contacto: '', metodo: '', director_id: '', departamento_id: '' }, page: 1,
  reset() { this.sequence++; this.filters = { origen: 'actuales', q: '', tipo_contacto: '', metodo: '', director_id: '', departamento_id: '' }; this.page = 1; },
  esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  async init() {
    this.reset();
    if (App.currentUser?.rol !== 'USUARIO' || App.suspended) return;
    const seq = ++this.sequence, session = App.sessionVersion;
    const host = document.getElementById('personal-view');
    host.textContent = 'Consultando identidad institucional…';
    try {
      const identity = await API.get('/api/personal/identity');
      if (!this.valid(seq, session)) return;
      if (!identity.configured) {
        host.innerHTML = '<div class="bg-white border border-slate-200 rounded-xl p-6"><h2 class="text-xl font-bold mb-3">Mis contactos por funcionario</h2><p>Esta consulta requiere activar el acceso Microsoft institucional. La administración debe completar la configuración antes de mostrar contactos.</p></div>';
        return;
      }
      this.load();
    } catch (err) {
      if (!this.valid(seq, session)) return;
      host.innerHTML = '<div class="bg-white border border-slate-200 rounded-xl p-6"><h2 class="text-xl font-bold mb-3">Mis contactos por funcionario</h2><p class="mb-3">'+this.esc(err.message)+'</p><p class="text-sm mb-4">Ingrese con su cuenta Microsoft institucional para consultar sus registros y el consolidado de su dependencia. El correo debe figurar como activo en el padrón.</p><a class="btn btn-tec" href="/.auth/login/aad?post_login_redirect_uri=%2F%3Fvista%3Dpersonal">Iniciar sesión con Microsoft</a></div>';
    }
  },
  valid(seq, session) {
    return seq === this.sequence && session === App.sessionVersion && App.currentUser?.rol === 'USUARIO' && !App.suspended;
  },
  async load(page = 1) {
    if (App.currentUser?.rol !== 'USUARIO' || App.suspended) return;
    const seq = ++this.sequence, session = App.sessionVersion, host = document.getElementById('personal-view');
    host.textContent = 'Cargando contactos autorizados…';
    try {
      const data = await API.get('/api/personal/contacts', { ...this.filters, page: String(page) });
      if (!this.valid(seq, session)) return;
      this.page = data.page;
      this.render(data);
    } catch (err) {
      if (!this.valid(seq, session)) return;
      host.textContent = err.message;
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn btn-outline mt-4';
      retry.textContent = 'Verificar cuenta y volver a consultar'; retry.onclick = () => this.init(); host.appendChild(retry);
    }
  },
  render(data) {
    if (App.currentUser?.rol !== 'USUARIO' || App.suspended) return;
    const esc = value => this.esc(value), f = data.funcionario, consolidated = this.filters.origen === 'consolidado';
    const option = (value, label, selected) => '<option value="'+esc(value)+'" '+(value===selected?'selected':'')+'>'+esc(label)+'</option>';
    const field = (name,label,value) => '<label class="block text-sm">'+label+'<input class="form-control mt-1" readonly value="'+esc(value)+'" aria-label="'+label+'"></label>';
    document.getElementById('personal-view').innerHTML = '<section class="bg-white border border-slate-200 rounded-xl p-6 sm:p-8"><h2 class="text-xl font-bold mb-4">Mis contactos por funcionario</h2>'+
      '<section class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5"><h3 class="font-bold mb-3">Datos de la persona del TEC que registra el contacto</h3><div class="grid grid-cols-1 sm:grid-cols-2 gap-3">'+
      field('nombre','Nombre',f.nombre)+field('email','Correo institucional autenticado',f.email)+field('dependencia','Escuela / Unidad vigente',f.dependencia)+field('sede','Sede',f.sede)+
      '</div><p class="text-xs text-slate-600 mt-3">Identidad verificada con Microsoft y vinculada al padrón. Los datos de esta sección no admiten seleccionar otra persona.</p>'+
      '<a href="/.auth/logout?post_logout_redirect_uri=%2F" class="btn btn-outline btn-sm mt-3">Cerrar acceso institucional / cambiar cuenta</a></section>'+
      '<div class="flex gap-3 flex-wrap mb-4" role="group" aria-label="Procedencia de los contactos">'+
      '<button type="button" class="btn '+(!consolidated?'btn-tec':'btn-outline')+'" aria-pressed="'+(!consolidated)+'" onclick="PersonalDirectoryModule.changeOrigin(\'actuales\')">Mis registros individuales y masivos ('+data.counts.actuales+')</button>'+
      '<button type="button" class="btn '+(consolidated?'btn-tec':'btn-outline')+'" aria-pressed="'+consolidated+'" onclick="PersonalDirectoryModule.changeOrigin(\'consolidado\')">Consolidado de mi dependencia ('+data.counts.consolidado+')</button></div>'+
      '<p class="text-sm text-slate-600 mb-4">'+(consolidated?'Contactos del consolidado vinculados por Correo director a su Escuela / Unidad vigente. La procedencia institucional continúa como Administrador.':'Registros atribuidos a su ficha del padrón, incluidos los de sesiones anteriores. Se conservan las dependencias de cada reporte; los registros de otras personas no se muestran.')+'</p>'+
      '<form id="personal-filters" class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5"><label class="block">Buscar contacto o institución<input id="personal-q" type="search" maxlength="200" class="form-control" value="'+esc(this.filters.q)+'"></label>'+
      '<label class="block">Tipo de contacto<select id="personal-tipo" class="form-control">'+option('','Todos',this.filters.tipo_contacto)+option('ACADEMICO','Académico',this.filters.tipo_contacto)+option('EMPLEADOR','Empleador',this.filters.tipo_contacto)+'</select></label>'+
      '<label class="block">Escuela / Unidad de los registros<select id="personal-departamento" class="form-control">'+option('','Todas las autorizadas',this.filters.departamento_id)+data.departments.map(d=>option(d.id,d.nombre,this.filters.departamento_id)).join('')+'</select></label>'+
      (consolidated?'<label class="block">Director asignado en el consolidado<select id="personal-director" class="form-control">'+option('','Todos los asignados a mi dependencia',this.filters.director_id)+data.directors.map(d=>option(d.id,d.nombre+' · '+d.email,this.filters.director_id)).join('')+'</select></label>':
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
    document.getElementById('personal-clear').onclick = () => { const origen = this.filters.origen; this.reset(); this.filters.origen = origen; this.load(); };
    document.getElementById('personal-prev').onclick = () => this.load(this.page-1);
    document.getElementById('personal-next').onclick = () => this.load(this.page+1);
  },
  changeOrigin(origen) {
    if (!['actuales','consolidado'].includes(origen)) return;
    this.filters.origen = origen; this.filters.metodo = ''; this.filters.director_id = ''; this.filters.departamento_id = ''; this.load();
  }
};
