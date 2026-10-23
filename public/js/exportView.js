// Módulo de Consolidación y Exportación para QS
const ExportModule = {
  currentTipo: 'ACADEMICO',
  catalogs: null,
  batches: [],
  pendingBatch: null,
  busy: false,
  includeHistorical: true,

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
            <div class="form-group sm:col-span-2"><label for="exp-campaign" class="form-label text-xs">Campaña</label>
              <select id="exp-campaign" class="form-control"><option value="">Todas las campañas</option>
              <option value="SIN_ASIGNAR">Sin campaña asignada</option>
              ${(this.catalogs?.campanias || []).map(c => `<option value="${DirectoryModule.escapeSelectionText(c.id)}">${DirectoryModule.escapeSelectionText(c.nombre)}</option>`).join('')}</select></div>
            <div class="form-group">
              <label class="form-label text-xs">Fecha Desde</label>
              <input type="date" class="form-control" id="exp-fecha-inicio">
            </div>
            <div class="form-group">
              <label class="form-label text-xs">Fecha Hasta</label>
              <input type="date" class="form-control" id="exp-fecha-fin">
            </div>
          </div>

          <label class="flex items-start gap-3 mb-4" for="exp-include-historical">
            <input type="checkbox" id="exp-include-historical" ${this.includeHistorical ? 'checked' : ''} onchange="ExportModule.includeHistorical=this.checked;">
            <span><strong>Incluir el consolidado histórico previamente aceptado por QS</strong><br>
            Los contactos completos y los históricos con observaciones se exportan con sus datos disponibles, incluidos los campos vacíos.</span>
          </label>
          <div class="alert alert-info mb-6">
            <i class="fa-solid fa-circle-info text-sky-600 mt-0.5"></i>
            <div>
              <strong>Dos indicadores de calidad:</strong> Completos e históricos con observaciones. La inclusión histórica aplica al consolidado administrativo, conserva sus valores y queda registrada en el lote. Los registros individuales y las cargas de funcionarios requieren los campos completos, las duplicidades pendientes se mantienen fuera del archivo.
            </div>
          </div>

          <div class="flex justify-end">
            <button class="btn btn-tec" id="btn-export-download" onclick="ExportModule.triggerExport()">
              <i class="fa-solid fa-file-arrow-down"></i>
              Preparar archivo y revisar
            </button>
          </div>
        </div>
        <div id="exp-result" class="mb-6" aria-live="polite"></div>
        <h3 class="font-bold text-slate-800 mb-3">Lotes preparados y confirmados</h3>
        <p class="text-sm text-slate-500 mb-3">Anule los lotes creados durante pruebas o confirmados por error, los contactos se conservan y la anulación queda en el historial. Esta acción modifica la constancia interna de envío.</p>
        <div id="exp-history" class="table-responsive"></div>
      </div>
    `;
    this.loadBatches();
  },

  setTipo(tipo) {
    this.currentTipo = tipo;
    this.render();
  },

  async triggerExport() {
    if (this.busy) return;
    this.busy = true;
    const btn = document.getElementById('btn-export-download');
    if (btn) btn.disabled = true;

    const fechaInicio = document.getElementById('exp-fecha-inicio')?.value || '';
    const fechaFin = document.getElementById('exp-fecha-fin')?.value || '';

    const filters = {};
    if (fechaInicio) filters.fecha_inicio = fechaInicio;
    if (fechaFin) filters.fecha_fin = fechaFin;
    const campaign = document.getElementById('exp-campaign')?.value;
    if (campaign) filters.campania_id = campaign;

    try {
      App.showToast('Generando archivo consolidado...', 'info');
      const response = await API.post('/api/export/prepare', { tipo: this.currentTipo, filters, includeHistorical: this.includeHistorical });
      this.pendingBatch = response.batch;
      const esc = value => DirectoryModule.escapeSelectionText(value);
      document.getElementById('exp-result').innerHTML = `<div class="alert alert-info"><div>
        <strong>Lote preparado:</strong> ${esc(response.batch.total)} contactos incluidos y ${esc(response.batch.excluidos)} excluidos.
        <p>Completos: <strong>${esc(response.batch.completos)}</strong> · Históricos con observaciones: <strong>${esc(response.batch.historicos_con_observaciones)}</strong>, ambos grupos están incluidos en el archivo.</p>
        <p>Descargue y revise el archivo, realice el envío a QS y registre la confirmación desde la tabla.</p>
        ${(response.batch.inconsistencias || []).map(row => `<p class="text-xs">Registro ${esc(row.id)}: ${esc(Object.values(row.errors).join('; '))}</p>`).join('')}
        </div></div>`;
      await this.loadBatches();
    } catch (err) {
      App.showToast(err.message || 'Error al exportar contactos', 'error');
    } finally {
      this.busy = false;
      if (btn) btn.disabled = false;
    }
  },

  async loadBatches() {
    try {
      const result = await API.get('/api/export/lotes');
      if (App.currentUser?.rol !== 'ADMIN' || App.suspended) return;
      this.batches = result.batches;
      const target = document.getElementById('exp-history');
      if (!target) return;
      const esc = value => DirectoryModule.escapeSelectionText(value);
      const labels = { GENERADO: 'Archivo preparado', RECIBIDO_NAVEGADOR: 'Recibido por el navegador', CONFIRMADO_QS: 'Envío a QS confirmado', ANULADO: 'Lote anulado' };
      target.innerHTML = `<table class="data-table"><thead><tr><th>Fecha / lote</th><th>Tipo y contactos</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        ${this.batches.map(b => `<tr><td>${esc(new Date(b.created_at).toLocaleString())}<br><small>${esc(b.id)}</small></td>
        <td>${esc(b.tipo)} · ${esc(b.total)}<br><small>${esc(b.completos ?? b.total)} completos · ${esc(b.historicos_con_observaciones || 0)} históricos con observaciones</small></td><td>${esc(labels[b.estado] || b.estado)}
        ${b.estado === 'ANULADO' ? `<br><small>${esc(new Date(b.anulado_at).toLocaleString())}<br>Motivo: ${esc(b.motivo_anulacion)}</small>` : ''}</td><td>
        <button type="button" class="btn btn-outline btn-xs" onclick="ExportModule.downloadBatch('${b.id}')">Descargar</button>
        ${b.estado === 'RECIBIDO_NAVEGADOR' ? `<button type="button" class="btn btn-tec btn-xs" onclick="ExportModule.confirmExport('${b.id}')">Confirmar envío a QS</button>` : ''}
        ${b.estado !== 'ANULADO' ? `<button type="button" class="btn btn-outline btn-xs" onclick="ExportModule.cancelExport('${b.id}')">Anular lote</button>` : ''}</td></tr>`).join('')}
        </tbody></table>`;
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async downloadBatch(id) {
    if (this.busy) return;
    this.busy = true;
    try {
      const batch = this.batches.find(b => b.id === id);
      if (!batch) return;
      const response = await API.get(batch.downloadUrl);
      const url = window.URL.createObjectURL(response.blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = batch.filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      if (batch.estado !== 'ANULADO') await API.post(`/api/export/lotes/${id}/received`);
      App.showToast(batch.estado === 'ANULADO' ? 'Copia del lote anulado descargada para consulta.' : 'Archivo recibido por el navegador. Confirme el envío únicamente después de realizarlo.', 'info');
      await this.loadBatches();
    } catch (err) { App.showToast(err.message, 'error'); }
    finally { this.busy = false; }
  },

  async cancelExport(id) {
    if (this.busy) return;
    const batch = this.batches.find(b => b.id === id);
    if (!batch || batch.estado === 'ANULADO') return;
    const reason = window.prompt('Indique el motivo de anulación del lote (3 a 500 caracteres):', 'Prueba del sistema');
    if (reason === null) return;
    if (reason.trim().length < 3 || reason.trim().length > 500) {
      App.showToast('Indique un motivo de entre 3 y 500 caracteres.', 'error');
      return;
    }
    if (!window.confirm(`¿Anular este lote de ${batch.total} contactos? Se conservarán los contactos y el historial, se retirará la confirmación interna de este lote y se mantendrán los otros envíos confirmados.`)) return;
    this.busy = true;
    try {
      await API.post(`/api/export/lotes/${id}/cancel`, { confirmed: true, reason: reason.trim() });
      const result = document.getElementById('exp-result');
      if (result) result.textContent = 'Lote anulado, los contactos y el historial se conservan. El tablero se actualizará al abrirlo.';
      App.showToast('Lote anulado y estados de los contactos revisados.', 'success');
      await this.loadBatches();
    } catch (err) { App.showToast(err.message, 'error'); }
    finally { this.busy = false; }
  },

  async confirmExport(id) {
    if (this.busy || !window.confirm('¿Confirma que ya envió a QS el archivo de este lote? Los contactos se marcarán como exportados.')) return;
    this.busy = true;
    try {
      await API.post(`/api/export/lotes/${id}/confirm`, { confirmed: true });
      App.showToast('Confirmación de envío registrada con auditoría por contacto.', 'success');
      await this.loadBatches();
    } catch (err) { App.showToast(err.message, 'error'); }
    finally { this.busy = false; }
  }
};
