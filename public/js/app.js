// Controlador Principal de la Aplicación (SPA) con Menú Lateral Izquierdo Inmóvil
const App = {
  currentUser: null,
  sessionVersion: 0,
  catalogs: null,
  activeTab: 'register',
  sidebarCollapsed: false,

  async init() {
    this.initToastContainer();
    this.initSidebarEvents();

    // Retirar tokens antiguos; los permisos ahora se resuelven desde cookies HttpOnly.
    localStorage.removeItem('tec_qs_token');
    try {
      const result = await API.post('/api/auth/guest');
      this.currentUser = result.user;
    } catch (err) {
      if (err.status !== 401) {
        this.showToast('No se logró iniciar la sesión. Actualice la página.', 'error');
        return;
      }
      try {
        this.currentUser = (await API.post('/api/auth/guest')).user;
      } catch (_) {
        this.showToast('No se logró iniciar la sesión. Actualice la página.', 'error');
        return;
      }
    }
    this.startSessionMonitor();
    window.addEventListener('beforeunload', event => {
      if (this.activeTab === 'register' && RegisterModule.draft) {
        event.preventDefault(); event.returnValue = '';
      }
    });

    // 2. Cargar catálogos
    try {
      this.catalogs = await API.get('/api/catalogs');
    } catch (err) {
      console.error('Error al cargar catálogos:', err);
    }

    // 3. Actualizar interfaz según rol y cargar vista inicial
    this.updateRoleUI();
    this.navigate(this.activeTab);
  },

  initSidebarEvents() {
    // Botón de colapsar / expandir en desktop
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.toggleSidebarCollapse();
      });
    }

    // Botón hamburguesa para móvil
    const mobileToggle = document.getElementById('mobile-sidebar-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('sidebar');

    if (mobileToggle && sidebar && overlay) {
      mobileToggle.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay.classList.remove('hidden');
      });

      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.add('hidden');
      });
    }
  },

  toggleSidebarCollapse() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');

    this.sidebarCollapsed = !this.sidebarCollapsed;

    if (sidebar) sidebar.classList.toggle('collapsed', this.sidebarCollapsed);

    if (toggleBtn) {
      const icon = toggleBtn.querySelector('i');
      if (icon) {
        icon.className = this.sidebarCollapsed ? 'fa-solid fa-chevron-right text-xs' : 'fa-solid fa-chevron-left text-xs';
      }
    }
  },

  showAdminLogin() {
    if (this.currentUser?.rol === 'ADMIN') return;
    const dialog = document.getElementById('admin-login-dialog');
    document.getElementById('admin-login-form').reset();
    document.getElementById('admin-login-error').textContent = '';
    dialog.showModal();
    document.getElementById('admin-username').focus();
  },

  closeAdminLogin() {
    document.getElementById('admin-login-form').reset();
    document.getElementById('admin-login-dialog').close();
    document.getElementById('admin-access-button').focus();
  },

  async submitAdminLogin(event) {
    event.preventDefault();
    const button = document.getElementById('admin-login-submit');
    const errorEl = document.getElementById('admin-login-error');
    button.disabled = true;
    errorEl.textContent = '';
    try {
      const result = await API.post('/api/auth/login', {
        username: document.getElementById('admin-username').value,
        password: document.getElementById('admin-password').value
      });
      this.sessionVersion++;
      this.currentUser = result.user;
      this.closeAdminLogin();
      this.updateRoleUI();
      this.navigate(this.activeTab);
      this.showToast('Sesión de administrador iniciada.', 'success');
    } catch (err) {
      errorEl.textContent = err.message || 'No se logró iniciar sesión.';
      document.getElementById('admin-password').value = '';
      document.getElementById('admin-password').focus();
    } finally {
      button.disabled = false;
    }
  },

  async restoreUserSession() {
    if (this.restoringSession) return this.restoringSession;
    this.restoringSession = (async () => {
      this.sessionVersion++;
      this.currentUser = null;
      this.clearAdminViews();
      this.updateRoleUI();
      const result = await API.post('/api/auth/guest');
      this.currentUser = result.user;
      this.updateRoleUI();
      this.navigate('register');
    })();
    try { await this.restoringSession; }
    finally { this.restoringSession = null; }
  },

  clearAdminViews() {
    for (const id of ['admin-view', 'export-view', 'directory-view', 'bulk-upload-view']) {
      document.getElementById(id).replaceChildren();
    }
    AdminModule.stats = null;
    AdminModule.driveStatus = null;
  },

  async handleLogout() {
    const button = document.getElementById('admin-logout-button');
    button.disabled = true;
    try {
      await API.post('/api/auth/logout');
      await this.restoreUserSession();
      this.showToast('Sesión administrativa cerrada. Modo usuario activo.', 'info');
    } catch (_) {
      this.showToast('No se logró cerrar la sesión. Intente nuevamente.', 'error');
    } finally {
      button.disabled = false;
    }
  },

  startSessionMonitor() {
    const check = async () => {
      if (document.hidden || this.checkingSession || this.restoringSession) return;
      this.checkingSession = true;
      try {
        const result = await API.get('/api/auth/me');
        if (result.user.rol !== this.currentUser?.rol || result.user.id !== this.currentUser?.id) {
          this.sessionVersion++;
          this.currentUser = result.user;
          this.clearAdminViews();
          this.updateRoleUI();
          this.navigate('register');
        }
      } catch (err) {
        if (err.status === 401) {
          try {
            await this.restoreUserSession();
            this.showToast('La sesión venció. Modo usuario activo.', 'info');
          } catch (_) { /* Mantener las funciones administrativas bloqueadas. */ }
        }
      } finally { this.checkingSession = false; }
    };
    setInterval(check, 30000);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', event => {
      if (event.persisted) this.restoreUserSession();
      else check();
    });
    document.addEventListener('visibilitychange', check);
    document.getElementById('admin-login-dialog').addEventListener('close', () => {
      document.getElementById('admin-login-form').reset();
    });
  },

  // Actualiza la interfaz del menú lateral según el rol activo (2 únicos roles: Administrador y Usuario)
  updateRoleUI() {
    const isAdmin = this.currentUser?.rol === 'ADMIN';

    // Actualizar datos del usuario en el menú lateral
    const userNameEl = document.getElementById('sidebar-user-name');
    const userDeptoEl = document.getElementById('sidebar-user-depto');
    const userInitialsEl = document.getElementById('sidebar-user-initials');

    if (userNameEl) userNameEl.textContent = isAdmin ? 'Administrador QS' : 'Usuario';
    if (userDeptoEl) userDeptoEl.textContent = isAdmin ? 'Sesión administrativa activa' : 'Acceso de usuario';
    if (userInitialsEl) userInitialsEl.textContent = isAdmin ? 'AD' : 'US';

    const roleBadge = document.getElementById('role-display-badge');
    if (roleBadge) {
      roleBadge.textContent = isAdmin ? 'ADMINISTRADOR' : 'USUARIO';
      roleBadge.className = `px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${isAdmin ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-800'}`;
    }
    document.getElementById('admin-access-button').hidden = isAdmin;
    document.getElementById('admin-logout-button').hidden = !isAdmin;

    // Visibilidad de opciones en el menú lateral según los 2 roles
    const navBulk = document.getElementById('nav-item-bulk');
    const navExport = document.getElementById('nav-item-export');
    const navAdmin = document.getElementById('nav-item-admin');

    // Carga Masiva disponible para Administrador y Usuario
    if (navBulk) navBulk.style.display = 'block';
    if (navExport) navExport.style.display = isAdmin ? 'block' : 'none';
    if (navAdmin) navAdmin.style.display = isAdmin ? 'block' : 'none';
  },

  navigate(tabName) {
    if (['admin', 'export'].includes(tabName) && this.currentUser?.rol !== 'ADMIN') tabName = 'register';
    this.activeTab = tabName;

    // Actualizar estilos activos en el menú lateral izquierdo
    const menuButtons = {
      register: document.getElementById('nav-btn-register'),
      bulk: document.getElementById('nav-btn-bulk'),
      directory: document.getElementById('nav-btn-directory'),
      export: document.getElementById('nav-btn-export'),
      admin: document.getElementById('nav-btn-admin')
    };

    const activeClasses = ['bg-blue-50', 'text-blue-900', 'border', 'border-blue-200/80', 'shadow-sm', 'font-semibold'];
    const inactiveClasses = ['text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-100', 'font-medium'];

    Object.keys(menuButtons).forEach(key => {
      const btn = menuButtons[key];
      if (!btn) return;
      const icon = btn.querySelector('i');

      if (key === tabName) {
        btn.classList.add(...activeClasses);
        btn.classList.remove(...inactiveClasses);
        if (icon) {
          icon.classList.add('text-blue-800');
          icon.classList.remove('text-slate-400');
        }
      } else {
        btn.classList.remove(...activeClasses);
        btn.classList.add(...inactiveClasses);
        if (icon) {
          icon.classList.remove('text-blue-800');
          icon.classList.add('text-slate-400');
        }
      }
    });

    // Cerrar sidebar en pantallas móviles al seleccionar
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (window.innerWidth < 1024 && sidebar && overlay) {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
    }

    // Ocultar todas las vistas de contenido
    const views = ['register-view', 'bulk-upload-view', 'directory-view', 'export-view', 'admin-view'];
    views.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.style.display = 'none';
    });

    // Mostrar vista seleccionada e inicializar
    const targetEl = document.getElementById(`${tabName === 'bulk' ? 'bulk-upload' : tabName}-view`);
    if (targetEl) targetEl.style.display = 'block';

    if (tabName === 'register') RegisterModule.init(this.catalogs);
    else if (tabName === 'bulk') BulkUploadModule.init(this.catalogs);
    else if (tabName === 'directory') DirectoryModule.init(this.catalogs);
    else if (tabName === 'export') ExportModule.init(this.catalogs);
    else if (tabName === 'admin') AdminModule.init(this.catalogs);
  },

  initToastContainer() {
    if (!document.getElementById('toast-container')) {
      const toastDiv = document.createElement('div');
      toastDiv.id = 'toast-container';
      toastDiv.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; pointer-events: none;';
      document.body.appendChild(toastDiv);
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `alert alert-${type}`;
    toast.style.cssText = 'box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15); pointer-events: auto; min-width: 280px; max-width: 450px; margin-bottom: 0;';
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
