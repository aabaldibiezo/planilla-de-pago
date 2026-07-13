/**
 * API Client - Capa de comunicación con el backend
 * Maneja todas las peticiones HTTP hacia la API REST.
 */
class ApiClient {
    constructor() {
        const configuredUrl = (window.__ENV__?.VITE_API_URL || '').trim().replace(/\/$/, '');
        this.baseUrl = configuredUrl ? (configuredUrl.endsWith('/api') ? configuredUrl : `${configuredUrl}/api`) : '/api';
        this.token = localStorage.getItem('token') || null;
    }

    /**
     * Establece el token de autenticación
     */
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
        }
    }

    /**
     * Elimina el token de autenticación
     */
    clearToken() {
        this.token = null;
        localStorage.removeItem('token');
    }

    /**
     * Wrapper genérico de fetch con autenticación y manejo de errores
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers,
            });

            // Si el token expiró o es inválido, redirigir al login
            if (response.status === 401) {
                this.clearToken();
                localStorage.removeItem('user');
                if (window.auth) {
                    window.auth.showLogin();
                }
                throw new Error('Sesión expirada. Por favor, inicie sesión nuevamente.');
            }

            const contentType = response.headers.get('content-type');
            let data;

            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                const errorMessage = (data && typeof data === 'object' && (data.message || data.error))
                    ? (data.message || data.error)
                    : `Error ${response.status}: ${response.statusText}`;
                throw new Error(errorMessage);
            }

            return data;
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('No se pudo conectar con el servidor. Verifique su conexión.');
            }
            throw error;
        }
    }

    // ========================
    // Métodos HTTP genéricos
    // ========================

    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async patch(endpoint, data) {
        return this.request(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // ========================
    // Autenticación
    // ========================

    async login(email, password) {
        return this.post('/auth/login', { email, password });
    }

    async getMe() {
        return this.get('/auth/me');
    }

    // ========================
    // Usuarios / Empleados
    // ========================

    async getUsers() {
        return this.get('/users');
    }

    async createUser(data) {
        return this.post('/users', data);
    }

    async updateUser(id, data) {
        return this.put(`/users/${id}`, data);
    }

    async deleteUser(id) {
        return this.delete(`/users/${id}`);
    }

    // ========================
    // Asistencias (Attendance)
    // ========================

    async getAttendances(params = {}) {
        const query = new URLSearchParams();
        if (params.userId) query.set('userId', params.userId);
        if (params.month) query.set('month', params.month);
        if (params.year) query.set('year', params.year);
        
        const qs = query.toString();
        return this.get(`/attendance${qs ? '?' + qs : ''}`);
    }

    async upsertAttendance(data) {
        return this.post('/attendance', data);
    }
    async clockInSession(data) { return this.post('/attendance/sessions/clock-in', data); }
    async clockOutSession(id) { return this.patch(`/attendance/sessions/${id}/clock-out`, {}); }
    async justifyAttendanceSession(id,data) { return this.patch(`/attendance/sessions/${id}/justification`,data); }

    // ========================
    // Pagos y Nómina
    // ========================

    async calculatePayments(month, year) {
        return this.get(`/payments/calculate?month=${month}&year=${year}`);
    }

    async payEmployee(userId, month, year) {
        return this.post('/payments/pay', { userId, month, year });
    }

    async getPaymentHistory(params = {}) {
        const query = new URLSearchParams();
        if (params.userId) query.set('userId', params.userId);
        if (params.month) query.set('month', params.month);
        if (params.year) query.set('year', params.year);
        
        const qs = query.toString();
        return this.get(`/payments/history${qs ? '?' + qs : ''}`);
    }
    async getOvertime(params={}) { return this.get('/workforce/overtime?'+new URLSearchParams(params)); }
    async createOvertime(data) { return this.post('/workforce/overtime',data); }
    async updateOvertime(id, data) { return this.put(`/workforce/overtime/${id}`, data); }
    async setOvertimeStatus(id, status, reason = '') { return this.patch(`/workforce/overtime/${id}/status`, { status, reason }); }
    async deleteOvertime(id) { return this.delete(`/workforce/overtime/${id}`); }
    async getDiscounts(params={}) { return this.get('/workforce/discounts?'+new URLSearchParams(params)); }
    async createDiscount(data) { return this.post('/workforce/discounts',data); }
    async setDiscountStatus(id, status, reason = '') { return this.patch(`/workforce/discounts/${id}/status`, { status, reason }); }
    async getCompensations(params={}) { return this.get('/workforce/compensations?'+new URLSearchParams(params)); }
    async useCompensation(id, data) { return this.post(`/workforce/compensations/${id}/use`, data); }
    async getAudit(params={}) { return this.get('/workforce/audit?'+new URLSearchParams(params)); }
    async downloadMonthlyReport(month,year) { const response=await fetch(`${this.baseUrl}/payments/monthly-report?month=${month}&year=${year}`,{headers:{Authorization:`Bearer ${this.token}`}});if(!response.ok)throw new Error('No se pudo generar el reporte mensual');const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`boleta-de-pago-mensual-${month}-${year}.pdf`;a.click();URL.revokeObjectURL(url); }

    async downloadPaymentPdf(id, filename) {
        const url = `${this.baseUrl}/payments/${id}/pdf`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('No se pudo descargar el archivo PDF del comprobante');
        }

        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename || `boleta-de-pago-${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
    }
}

// Singleton global
window.api = new ApiClient();
