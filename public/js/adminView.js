// Módulo de Administración, Métricas KPI y Google Drive
const AdminModule = {
  stats: null,
  driveStatus: null,
  catalogs: null,

  init(catalogs) {
    this.catalogs = catalogs;
    this.loadData();
  },

  async loadData() {
    try {
      const [statsRes, driveRes] = await Promise.all([
        API.get('/api/stats'),
        API.get('/api/drive/status')
      ]);
      this.stats = statsRes.stats;
      this.driveStatus = driveRes.drive;
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
            <button class="btn btn-tec btn-sm" onclick="AdminModule.triggerBackup()">
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
      </div>
    `;
  },

  async triggerBackup() {
    try {
      App.showToast('Creando copia de respaldo física de la base de datos...', 'info');
      const res = await API.post('/api/drive/backup', {});
      if (res.success) {
        App.showToast(`✅ Respaldo exitoso: ${res.backupFileName} (${(res.sizeBytes / 1024).toFixed(1)} KB)`, 'success');
        this.loadData();
      }
    } catch (err) {
      App.showToast('Error al generar respaldo: ' + err.message, 'error');
    }
  }
};
