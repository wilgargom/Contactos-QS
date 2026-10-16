// Módulo de Consolidación y Exportación para QS
const ExportModule = {
  currentTipo: 'ACADEMICO',
  catalogs: null,

  init(catalogs) {
    this.catalogs = catalogs;
    this.render();
  },

  render() {
    const container = document.getElementById('export-view');
    if (!container) return;

    if (App.currentUser?.rol !== 'ADMIN') {
      container.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm text-center p-10">
          <i class="fa-solid fa-lock text-red-500 text-4xl mb-3 block"></i>
          <h3 class="text-lg font-bold text-slate-900">Acceso Restringido a Administradores</h3>
          <p class="text-slate-500 text-sm max-w-md mx-auto mt-1">
            La generación de los archivos de exportación oficiales para QS está reservada para el Administrador Institucional.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
        <div class="pb-5 border-b border-slate-100 mb-6">
          <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center text-sm border border-amber-200/60 shadow-xs">
              <i class="fa-solid fa-file-export text-amber-700"></i>
            </span>
            Consolidación y Exportación Oficial – Ranking QS
          </h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-1">
            Generación de archivos Excel formateados según la especificación exacta de Quacquarelli Symonds con pre-validación de calidad.
          </p>
        </div>

        <div class="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-6">
          <h4 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-blue-900 text-white flex items-center justify-center text-[11px] font-bold">1</span>
            Seleccione la Población a Exportar
          </h4>
          
          <div class="contact-type-selector mb-6">
            <div class="type-option-card ${this.currentTipo === 'ACADEMICO' ? 'selected' : ''}" onclick="ExportModule.setTipo('ACADEMICO')">
              <input type="radio" name="export_tipo" value="ACADEMICO" ${this.currentTipo === 'ACADEMICO' ? 'checked' : ''}>
              <div class="type-info">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-graduation-cap text-blue-800 text-base"></i>
                  <h4>Matriz de Académicos (Academic Reputation)</h4>
                </div>
                <p>11 columnas requeridas por QS. Incluye Source pre-llenado ("Instituto Tecnológico de Costa Rica").</p>
              </div>
            </div>

            <div class="type-option-card ${this.currentTipo === 'EMPLEADOR' ? 'selected' : ''}" onclick="ExportModule.setTipo('EMPLEADOR')">
              <input type="radio" name="export_tipo" value="EMPLEADOR" ${this.currentTipo === 'EMPLEADOR' ? 'checked' : ''}>
              <div class="type-info">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-briefcase text-emerald-700 text-base"></i>
                  <h4>Matriz de Empleadores (Employer Reputation)</h4>
                </div>
                <p>10 columnas requeridas por QS. Datos de industria, empresa y posición corporativa validados.</p>
              </div>
            </div>
          </div>

          <h4 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-blue-900 text-white flex items-center justify-center text-[11px] font-bold">2</span>
            Filtros de Período y Alcance (Opcional)
          </h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div class="form-group">
              <label class="form-label text-xs">Fecha Desde</label>
              <input type="date" class="form-control" id="exp-fecha-inicio">
            </div>
            <div class="form-group">
              <label class="form-label text-xs">Fecha Hasta</label>
              <input type="date" class="form-control" id="exp-fecha-fin">
            </div>
          </div>

          <div class="alert alert-info mb-6">
            <i class="fa-solid fa-circle-info text-sky-600 mt-0.5"></i>
            <div>
              <strong>Control de Calidad QS Activo:</strong> El sistema re-valida automáticamente cada registro antes de incluirlo en el archivo Excel. Cualquier contacto con duplicidad pendiente o datos faltantes será excluido para proteger el ranking institucional.
            </div>
          </div>

          <div class="flex justify-end">
            <button class="btn btn-tec" id="btn-export-download" onclick="ExportModule.triggerExport()">
              <i class="fa-solid fa-file-arrow-down"></i>
              Descargar Archivo Oficial XLSX para QS
            </button>
          </div>
        </div>
      </div>
    `;
  },

  setTipo(tipo) {
    this.currentTipo = tipo;
    this.render();
  },

  async triggerExport() {
    const btn = document.getElementById('btn-export-download');
    if (btn) btn.disabled = true;

    const fechaInicio = document.getElementById('exp-fecha-inicio')?.value || '';
    const fechaFin = document.getElementById('exp-fecha-fin')?.value || '';

    const params = new URLSearchParams();
    if (fechaInicio) params.append('fecha_inicio', fechaInicio);
    if (fechaFin) params.append('fecha_fin', fechaFin);

    try {
      App.showToast('Generando archivo consolidado...', 'info');
      const url = `/api/export/${this.currentTipo}?${params.toString()}`;
      const response = await API.get(url);

      if (response.isBlob) {
        const downloadUrl = window.URL.createObjectURL(response.blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `TEC_QS_${this.currentTipo}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);

        App.showToast('✅ Archivo Excel descargado exitosamente y archivado en evidencias.', 'success');
      }
    } catch (err) {
      App.showToast(err.message || 'Error al exportar contactos', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }
};
