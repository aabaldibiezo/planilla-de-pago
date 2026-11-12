/**
 * App - Controlador principal de la aplicación SPA (Single Page Application)
 */
class Application {
    constructor() {
        this.currentPage = null;
    }

    init() {
        this.setupLoginForm();
        this.setupNavigation();
        this.setupModal();

        // Verificar si ya está autenticado
        if (window.auth && window.auth.isAuthenticated() && window.auth.esSuperAdmin()) {
            window.auth.irAPlataforma(window.auth.token, window.auth.user);
            return;
        }
        if (window.auth && window.auth.isAuthenticated()) {
            window.auth.showApp();
            this.navigateTo('dashboard');
        } else {
            if (window.auth) {
                window.auth.showLogin();
            }
        }
    }

    // ----------------------------------------
    // NAVEGACIÓN Y RUTAS (SPA)
    // ----------------------------------------

    setupNavigation() {
        const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
        navLinks.forEach((link) => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('data-page');

                // Deseleccionar el resto y marcar el actual
                navLinks.forEach((l) => l.classList.remove('active'));
                link.classList.add('active');

                this.navigateTo(page);
            });
        });

        // Logout
        const logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (window.auth) {
                    window.auth.logout();
                }
            });
        }

        // Menú retráctil para tablet y móvil
        const sidebarToggle = document.getElementById('mobile-menu-toggle');
        const sidebarClose = document.getElementById('sidebar-close');
        const sidebarBackdrop = document.getElementById('sidebar-backdrop');
        const sidebar = document.getElementById('sidebar');
        const setSidebarOpen = (isOpen) => {
            if (!sidebar) return;
            sidebar.classList.toggle('open', isOpen);
            sidebarBackdrop?.classList.toggle('visible', isOpen);
            document.body.classList.toggle('sidebar-open', isOpen);
            sidebarToggle?.setAttribute('aria-expanded', String(isOpen));
        };

        sidebarToggle?.addEventListener('click', () => {
            setSidebarOpen(!sidebar?.classList.contains('open'));
        });
        sidebarClose?.addEventListener('click', () => setSidebarOpen(false));
        sidebarBackdrop?.addEventListener('click', () => setSidebarOpen(false));
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') setSidebarOpen(false);
        });
        window.addEventListener('resize', () => {
            if (window.innerWidth > 1024) setSidebarOpen(false);
        });

        if (sidebar) {
            sidebar.addEventListener('click', (event) => {
                if (event.target.closest('.nav-link') && window.innerWidth <= 1024) {
                    setSidebarOpen(false);
                }
            });
        }
    }

    async navigateTo(page) {
        const pageContent = document.getElementById('page-content');
        if (!pageContent) return;

        // Mientras exista una contraseña temporal pendiente, el backend rechaza
        // toda ruta de negocio: se fuerza el cambio antes que cualquier otra vista.
        if (window.auth?.requiresPasswordChange() && page !== 'password') {
            page = 'password';
        }

        this.currentPage = page;

        // Recordatorio de cobros: se actualiza en cada cambio de pantalla, sin
        // bloquear la navegación (no se espera la respuesta).
        if (page !== 'password') window.Cobros?.refrescar();

        // Actualizar links activos (por si se navega programáticamente)
        const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
        navLinks.forEach((link) => {
            if (link.getAttribute('data-page') === page) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Ocultar menú retráctil tras navegar
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open') && window.innerWidth <= 1024) {
            sidebar.classList.remove('open');
            document.getElementById('sidebar-backdrop')?.classList.remove('visible');
            document.getElementById('mobile-menu-toggle')?.setAttribute('aria-expanded', 'false');
            document.body.classList.remove('sidebar-open');
        }

        // Mapeo de vistas
        let pageModule = null;
        switch (page) {
            case 'dashboard':
                pageModule = window.DashboardPage;
                break;
            case 'attendance':
                if (window.auth && !window.auth.isAdmin()) {
                    this.navigateTo('dashboard');
                    return;
                }
                pageModule = window.AttendancePage;
                break;
            case 'employees':
                // Guard de rol
                if (window.auth && !window.auth.isAdmin()) {
                    this.navigateTo('dashboard');
                    return;
                }
                pageModule = window.EmployeesPage;
                break;
            case 'payments':
                // Guard de rol
                if (window.auth && !window.auth.isAdmin()) {
                    this.navigateTo('dashboard');
                    return;
                }
                pageModule = window.PaymentsPage;
                break;
            case 'history':
                // Guard de rol
                if (window.auth && !window.auth.isAdmin()) {
                    this.navigateTo('dashboard');
                    return;
                }
                pageModule = window.HistoryPage;
                break;
            case 'workforce':
                if (window.auth && !window.auth.isAdmin()) {
                    this.navigateTo('dashboard');
                    return;
                }
                pageModule = window.WorkforcePage;
                break;
            case 'worksites':
                if (window.auth && !window.auth.isAdmin()) {
                    this.navigateTo('dashboard');
                    return;
                }
                pageModule = window.WorksitesPage;
                break;
            case 'clients':
                if (window.auth && !window.auth.isAdmin()) {
                    this.navigateTo('dashboard');
                    return;
                }
                pageModule = window.ClientsPage;
                break;
            case 'statement':
                if (window.auth && !window.auth.isAdmin()) {
                    this.navigateTo('dashboard');
                    return;
                }
                pageModule = window.StatementPage;
                break;
            case 'password':
                pageModule = window.PasswordPage;
                break;
            default:
                this.navigateTo('dashboard');
                return;
        }

        if (pageModule) {
            try {
                // Renderizar HTML inicial
                pageContent.innerHTML = await pageModule.render();
                // Inicializar eventos y datos de la página
                await pageModule.init();
                if (window.UI) window.UI.enhanceEmployeeSelectors(pageContent);
            } catch (error) {
                console.error(`Error al renderizar página ${page}:`, error);
                pageContent.innerHTML = `
                    <div class="card mt-4">
                        <div class="text-center p-4">
                            <h2 class="text-danger">⚠️ Error de carga</h2>
                            <p class="text-muted mt-2">${window.UI.escapeHtml(error.message || 'No se pudo cargar la sección solicitada.')}</p>
                            <button class="btn-primary mt-3" onclick="window.App.navigateTo('${page}')">
                                Reintentar
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    }

    // ----------------------------------------
    // AUTENTICACIÓN
    // ----------------------------------------

    setupLoginForm() {
        const form = document.getElementById('login-form');
        const errorDiv = document.getElementById('login-error');
        const loginBtn = document.getElementById('login-btn');

        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;

            if (!email || !password) {
                if (errorDiv) {
                    errorDiv.textContent = 'Por favor, complete todos los campos.';
                    errorDiv.classList.remove('hidden');
                }
                return;
            }

            try {
                if (errorDiv) errorDiv.classList.add('hidden');
                if (loginBtn) {
                    loginBtn.disabled = true;
                    loginBtn.textContent = 'Iniciando sesión...';
                }

                if (window.auth) {
                    await window.auth.login(email, password);
                    this.showToast('¡Sesión iniciada con éxito!', 'success');
                    this.navigateTo('dashboard');
                }
            } catch (error) {
                console.error('Error de login:', error);
                if (errorDiv) {
                    errorDiv.textContent = error.message || 'Credenciales incorrectas.';
                    errorDiv.classList.remove('hidden');
                }
                this.showToast(error.message || 'Credenciales incorrectas.', 'error');
            } finally {
                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Iniciar Sesión';
                }
            }
        });
    }

    // ----------------------------------------
    // COMPONENTES COMUNES: MODALES Y TOASTS
    // ----------------------------------------

    setupModal() {
        const overlay = document.getElementById('modal-overlay');
        const closeBtn = document.getElementById('modal-close');

        if (closeBtn && overlay) {
            closeBtn.addEventListener('click', () => this.hideModal());
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.hideModal();
                }
            });
        }
    }

    showModal(title, htmlContent) {
        const overlay = document.getElementById('modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const bodyEl = document.getElementById('modal-body');

        if (overlay && titleEl && bodyEl) {
            titleEl.textContent = title;
            bodyEl.innerHTML = htmlContent;
            overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden'; // Evitar scroll de fondo
        }
    }

    hideModal() {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            warning: '⚠️',
        };

        const icon = document.createElement('span');
        icon.className = 'toast-icon';
        icon.textContent = icons[type] || '🔔';
        const text = document.createElement('span');
        text.className = 'toast-message';
        text.textContent = String(message);
        toast.append(icon, text);

        container.appendChild(toast);

        // Desvanecimiento suave y eliminación
        setTimeout(() => {
            toast.classList.add('fade-out');
            toast.addEventListener('transitionend', () => {
                toast.remove();
            });
        }, 3500);
    }

    // ----------------------------------------
    // FORMATTERS & HELPERS
    // ----------------------------------------

    formatCurrency(amount) {
        return new Intl.NumberFormat('es-BO', {
            style: 'currency',
            currency: 'BOB',
            minimumFractionDigits: 2,
        })
            .format(amount)
            .replace('BOB', 'Bs.')
            .trim();
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
        return new Date(dateString).toLocaleDateString('es-ES', options);
    }

    formatHours(hoursDecimal) {
        const hours = Math.floor(hoursDecimal);
        const minutes = Math.round((hoursDecimal - hours) * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
}

// Iniciar aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    window.App = new Application();
    window.App.init();
});
