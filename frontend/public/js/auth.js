/**
 * AuthManager - Gestión de autenticación y sesión
 */
class AuthManager {
    constructor() {
        this.token = localStorage.getItem('token') || null;
        this.user = null;

        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            try {
                this.user = JSON.parse(savedUser);
            } catch (e) {
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
            } catch (e) {
                // Si no hay endpoint /me, usar los datos del login
                user = { email, role: 'EMPLOYEE' };
            }
        }

        this.user = user;
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', token);

        this.showApp();
        return user;
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
                'ADMIN': 'Administrador',
                'EMPLOYEE': 'Empleado',
                'MANAGER': 'Gerente',
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
        adminElements.forEach(el => {
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
