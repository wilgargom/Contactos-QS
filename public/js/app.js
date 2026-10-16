// Controlador Principal de la Aplicación (SPA) con Menú Lateral Izquierdo Inmóvil
const App = {
  currentUser: null,
  catalogs: null,
  activeTab: 'register',
  sidebarCollapsed: false,

  async init() {
    this.initToastContainer();
    this.initSidebarEvents();

    // Cada vez que se abre la aplicación, inicia con rol de Usuario y espacios de correo/nombre vacíos
    API.setToken('');
    this.currentUser = null;
    localStorage.removeItem('tec_qs_pref_recomienda_email');
    localStorage.removeItem('tec_qs_pref_recomienda_nombre');
    localStorage.removeItem('tec_qs_pref_sede');
    localStorage.removeItem('tec_qs_pref_depto');
    await this.loginUser('wgarita@itcr.ac.cr', 'TecQS2026!');

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

  async loginUser(email, password) {
    try {
      const res = await API.post('/api/auth/login', { email, password });
      API.setToken(res.token);
      this.currentUser = res.user;
      this.updateRoleUI();
      return true;
    } catch (err) {
      this.showToast(err.message || 'Error de autenticación', 'error');
      return false;
    }
  },

  // Conmutador entre los 2 únicos roles del sistema: Administrador y Usuario
  async switchRole(targetRole) {
    const email = targetRole === 'ADMIN' ? 'admin@tec.ac.cr' : 'wgarita@itcr.ac.cr';
    const roleName = targetRole === 'ADMIN' ? 'Administrador' : 'Usuario';
    
    this.showToast(`Cambiando a rol: ${roleName}...`, 'info');
    const ok = await this.loginUser(email, 'TecQS2026!');
    if (ok) {
      this.showToast(`✅ Rol activo: ${roleName}`, 'success');
      this.updateRoleUI();
      // Si el rol es Usuario y está en una pantalla de solo admin, redirigir a registro
      if (targetRole === 'USUARIO' && ['export', 'admin'].includes(this.activeTab)) {
        this.navigate('register');
      } else {
        this.navigate(this.activeTab);
      }
    }
  },

  handleLogout() {
    API.setToken('');
    this.currentUser = null;
    this.showToast('Sesión cerrada. Reiniciando con rol de Usuario...', 'info');
    this.loginUser('wgarita@itcr.ac.cr', 'TecQS2026!').then(() => {
      this.navigate('register');
    });
  },

  // Actualiza la interfaz del menú lateral según el rol activo (2 únicos roles: Administrador y Usuario)
  updateRoleUI() {
    if (!this.currentUser) return;
    const isAdmin = this.currentUser.rol === 'ADMIN';

    // Actualizar datos del usuario en el menú lateral
    const userNameEl = document.getElementById('sidebar-user-name');
    const userDeptoEl = document.getElementById('sidebar-user-depto');
    const userInitialsEl = document.getElementById('sidebar-user-initials');

    if (userNameEl) userNameEl.textContent = this.currentUser.nombre_completo || 'Wilson Garita Gómez';
    if (userDeptoEl) userDeptoEl.textContent = this.currentUser.departamento_nombre || 'Planificación Institucional (OPI)';
    if (userInitialsEl) {
      const parts = (this.currentUser.nombre_completo || 'Wilson Garita').trim().split(/\s+/);
      userInitialsEl.textContent = ((parts[0]?.[0] || 'W') + (parts[1]?.[0] || 'G')).toUpperCase();
    }

    // Actualizar badge y selector de rol en el menú lateral
    const roleBadge = document.getElementById('role-display-badge');
    const roleSelector = document.getElementById('role-selector');

    if (roleBadge) {
      roleBadge.textContent = isAdmin ? 'ADMINISTRADOR' : 'USUARIO';
      roleBadge.className = `px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${isAdmin ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-800'}`;
    }

    if (roleSelector) {
      roleSelector.value = this.currentUser.rol;
    }

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
    toast.innerHTML = `<span>${message}</span>`;

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
