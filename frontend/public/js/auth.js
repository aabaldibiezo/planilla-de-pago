/**
 * AuthManager - Gestión de autenticación y sesión
 */
class AuthManager {
    constructor() {
        this.token = localStorage.getItem('token') || null;
        this.user = null;
        this.mustChangePassword = false;

        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            try {
                this.user = JSON.parse(savedUser);
            } catch {
                localStorage.removeItem('user');
            }
        }
    }

    /**
     * Verifica si el usuario está autenticado
     */
    isAuthenticated() {
        return !!(this.token && this.user);
    }

    /**
     * Verifica si el usuario es administrador
     */
    isAdmin() {
        return this.user && this.user.role === 'ADMIN';
    }

    /**
     * Devuelve el usuario actual
     */
    getUser() {
        return this.user;
    }

    /**
     * Realiza el login
     */
    async login(email, password) {
        const response = await window.api.login(email, password);
        const resData = response.data || response;

        // Guardar token
        const token = resData.token || resData.accessToken;
        if (!token) {
            throw new Error('No se recibió un token válido del servidor.');
        }

        window.api.setToken(token);
        this.token = token;

        // Obtener datos del usuario
        let user = resData.user;
        if (!user) {
            try {
                const meRes = await window.api.getMe();
                user = meRes.data || meRes;
            } catch {
                // Si no hay endpoint /me, usar los datos del login
                user = { email, role: 'EMPLOYEE' };
            }
        }

        this.mustChangePassword = Boolean(resData.mustChangePassword ?? user.mustChangePassword);

        // El dueño de la plataforma no tiene empresa: va a su propio panel.
        if (user.role === 'SUPER_ADMIN') {
            this.irAPlataforma(token, { ...user, mustChangePassword: this.mustChangePassword });
            return user;
        }

        this.user = user;
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', token);

        // El backend bloquea toda ruta de negocio hasta que se cambie la
        // contraseña temporal, así que el cliente lleva directo a esa pantalla.
        this.mustChangePassword = Boolean(resData.mustChangePassword ?? user.mustChangePassword);

        this.showApp();
        return user;
    }

    /**
     * Pasa la sesión al panel de plataforma (empresas, planes y cobros), que
     * guarda su propia sesión con otras claves.
     */
    irAPlataforma(token, user) {
        localStorage.setItem('plataforma_token', token);
        localStorage.setItem('plataforma_usuario', JSON.stringify(user));
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.api.clearToken();
        window.location.href = 'plataforma/';
    }

    /** Sesión vieja de súper administrador abierta en este panel. */
    esSuperAdmin() {
        return Boolean(this.user && this.user.role === 'SUPER_ADMIN');
    }

    /**
     * Marca la contraseña como ya definida y refresca el usuario en memoria.
     */
    clearPasswordChangeRequirement() {
        this.mustChangePassword = false;
        if (this.user) {
            this.user.mustChangePassword = false;
            localStorage.setItem('user', JSON.stringify(this.user));
        }
    }

    requiresPasswordChange() {
        return Boolean(this.mustChangePassword ?? this.user?.mustChangePassword);
    }

    /**
     * Cierra la sesión
     */
    logout() {
        this.token = null;
        this.user = null;
        window.api.clearToken();
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        this.showLogin();
    }

    /**
     * Muestra la aplicación principal
     */
    showApp() {
        const loginScreen = document.getElementById('app-login');
        const mainApp = document.getElementById('app-main');

        if (loginScreen) loginScreen.classList.add('hidden');
        if (mainApp) mainApp.classList.remove('hidden');

        this.updateUserDisplay();
        this.updateAdminVisibility();
    }

    /**
     * Muestra la pantalla de login
     */
    showLogin() {
        const loginScreen = document.getElementById('app-login');
        const mainApp = document.getElementById('app-main');

        if (loginScreen) loginScreen.classList.remove('hidden');
        if (mainApp) mainApp.classList.add('hidden');

        // Limpiar formulario
        const form = document.getElementById('login-form');
        if (form) form.reset();

        const errorDiv = document.getElementById('login-error');
        if (errorDiv) errorDiv.classList.add('hidden');
    }

    /**
     * Actualiza la visualización del usuario en el sidebar
     */
    updateUserDisplay() {
        if (!this.user) return;

        const nameEl = document.getElementById('user-name');
        const roleEl = document.getElementById('user-role');
        const avatarEl = document.getElementById('user-avatar');

        const firstName = this.user.firstName || this.user.name || '';
        const lastName = this.user.lastName || '';
        const displayName = `${firstName} ${lastName}`.trim() || this.user.email || 'Usuario';

        if (nameEl) nameEl.textContent = displayName;

        if (roleEl) {
            const roleLabels = {
                ADMIN: 'Administrador',
                EMPLOYEE: 'Empleado',
                MANAGER: 'Gerente',
            };
            roleEl.textContent = roleLabels[this.user.role] || this.user.role || 'Empleado';
        }

        if (avatarEl) {
            const initials = this._getInitials(displayName);
            avatarEl.textContent = initials;
        }
    }

    /**
     * Muestra u oculta elementos solo para administradores
     */
    updateAdminVisibility() {
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach((el) => {
            if (this.isAdmin()) {
                if (el.classList.contains('nav-link')) {
                    el.style.display = 'flex';
                } else {
                    el.style.display = 'block';
                }
            } else {
                el.style.display = 'none';
            }
        });
    }

    /**
     * Obtiene las iniciales de un nombre
     */
    _getInitials(name) {
        if (!name) return '??';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }
}

// Singleton global
window.auth = new AuthManager();
