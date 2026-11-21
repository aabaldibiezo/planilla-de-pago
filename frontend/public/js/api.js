/**
 * API Client - Capa de comunicación con el backend
 * Maneja todas las peticiones HTTP hacia la API REST.
 */
class ApiClient {
    constructor() {
        const configuredUrl = (window.__ENV__?.VITE_API_URL || '').trim().replace(/\/$/, '');
        this.baseUrl = configuredUrl
            ? configuredUrl.endsWith('/api')
                ? configuredUrl
                : `${configuredUrl}/api`
            : '/api';
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

            // Suscripción vencida: el servidor bloquea toda escritura pero
            // sigue permitiendo consultar. Se avisa una sola vez, de forma
            // persistente, en vez de dejar que cada acción falle sin contexto.
            if (response.status === 403 && data?.code === 'SUBSCRIPTION_READ_ONLY') {
                window.UI?.showReadOnlyBanner?.(data.error);
            }

            if (!response.ok) {
                const errorMessage =
                    data && typeof data === 'object' && (data.message || data.error)
                        ? data.message || data.error
                        : `Error ${response.status}: ${response.statusText}`;
                const error = new Error(errorMessage);
                // Se conserva el código para que las pantallas puedan
                // distinguir el motivo sin analizar el texto del mensaje.
                if (data && typeof data === 'object' && data.code) error.code = data.code;
                throw error;
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
        // `client: 'web'`: el servidor no deja entrar acá al personal de la app.
        return this.post('/auth/login', { email, password, client: 'web' });
    }

    async getMe() {
        return this.get('/auth/me');
    }

    async updateProfile(data) {
        return this.put('/auth/me', data);
    }

    async changePassword(currentPassword, newPassword) {
        return this.post('/auth/change-password', { currentPassword, newPassword });
    }

    async resetUserPassword(id) {
        return this.post(`/users/${id}/reset-password`, {});
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
    async clockInSession(data) {
        return this.post('/attendance/sessions/clock-in', data);
    }
    async clockOutSession(id) {
        return this.patch(`/attendance/sessions/${id}/clock-out`, {});
    }
    async justifyAttendanceSession(id, data) {
        return this.patch(`/attendance/sessions/${id}/justification`, data);
    }

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
    async getOvertime(params = {}) {
        return this.get('/workforce/overtime?' + new URLSearchParams(params));
    }
    async createOvertime(data) {
        return this.post('/workforce/overtime', data);
    }
    async updateOvertime(id, data) {
        return this.put(`/workforce/overtime/${id}`, data);
    }
    async setOvertimeStatus(id, status, reason = '') {
        return this.patch(`/workforce/overtime/${id}/status`, { status, reason });
    }
    async deleteOvertime(id) {
        return this.delete(`/workforce/overtime/${id}`);
    }
    async getDiscounts(params = {}) {
        return this.get('/workforce/discounts?' + new URLSearchParams(params));
    }
    async createDiscount(data) {
        return this.post('/workforce/discounts', data);
    }
    async setDiscountStatus(id, status, reason = '') {
        return this.patch(`/workforce/discounts/${id}/status`, { status, reason });
    }
    async getCompensations(params = {}) {
        return this.get('/workforce/compensations?' + new URLSearchParams(params));
    }
    async useCompensation(id, data) {
        return this.post(`/workforce/compensations/${id}/use`, data);
    }
    async getAudit(params = {}) {
        return this.get('/workforce/audit?' + new URLSearchParams(params));
    }

    // ========================
    // Sedes y asignaciones
    // ========================

    async getWorksites() {
        return this.get('/worksites');
    }

    async createWorksite(data) {
        return this.post('/worksites', data);
    }

    async updateWorksite(id, data) {
        return this.put(`/worksites/${id}`, data);
    }

    async deleteWorksite(id) {
        return this.delete(`/worksites/${id}`);
    }

    async getWorksiteAssignments(params = {}) {
        return this.get('/worksites/assignments/list?' + new URLSearchParams(params));
    }

    async createWorksiteAssignment(data) {
        return this.post('/worksites/assignments', data);
    }

    async deleteWorksiteAssignment(id) {
        return this.delete(`/worksites/assignments/${id}`);
    }

    /** Empleados que hoy no podrían marcar por no tener sede vigente. */
    async getEmployeesWithoutWorksiteToday() {
        return this.get('/worksites/assignments/missing-today');
    }

    /** Cruces de horario que quedaron de antes de que existiera la validación. */
    async getAssignmentConflicts() {
        return this.get('/worksites/assignments/conflicts');
    }

    // ----------------------------------------
    // CLIENTES Y CONTRATOS
    //
    // Los montos están en bolivianos, como los sueldos. No confundir con la
    // suscripción a la plataforma, que va en dólares por otro panel.
    // ----------------------------------------

    async getClients(params = {}) {
        const query = new URLSearchParams(
            Object.entries(params).filter(([, valor]) => valor != null && valor !== '')
        ).toString();
        return this.get(`/clients${query ? `?${query}` : ''}`);
    }

    async createClient(data) {
        return this.post('/clients', data);
    }

    async updateClient(id, data) {
        return this.put(`/clients/${id}`, data);
    }

    async deleteClient(id) {
        return this.delete(`/clients/${id}`);
    }

    async createContract(clientId, data) {
        return this.post(`/clients/${clientId}/contracts`, data);
    }

    async updateContract(id, data) {
        return this.put(`/clients/contracts/${id}`, data);
    }

    async getContractRates(contractId) {
        return this.get(`/clients/contracts/${contractId}/rates`);
    }

    async addContractRate(contractId, data) {
        return this.post(`/clients/contracts/${contractId}/rates`, data);
    }

    // ----------------------------------------
    // ESTADO DE RESULTADOS
    //
    // Montos en bolivianos. El estado no se guarda: se calcula al pedirlo, así
    // que cada llamada ya refleja los últimos gastos y pagos de nómina.
    // ----------------------------------------

    async getStatement(month, year) {
        return this.get(`/statement?month=${month}&year=${year}`);
    }

    async getStatementHistory(from, to) {
        const q = new URLSearchParams({
            fromMonth: from.month,
            fromYear: from.year,
            toMonth: to.month,
            toYear: to.year,
        });
        return this.get(`/statement/history?${q}`);
    }

    async getExpenseCategories(includeInactive = false) {
        return this.get(`/statement/categories${includeInactive ? '?includeInactive=true' : ''}`);
    }

    async createExpenseCategory(data) {
        return this.post('/statement/categories', data);
    }

    async updateExpenseCategory(id, data) {
        return this.put(`/statement/categories/${id}`, data);
    }

    async deleteExpenseCategory(id) {
        return this.delete(`/statement/categories/${id}`);
    }

    async restoreExpenseCategories() {
        return this.post('/statement/categories/restore', {});
    }

    async createStatementEntry(data) {
        return this.post('/statement/entries', data);
    }

    async updateStatementEntry(id, data) {
        return this.put(`/statement/entries/${id}`, data);
    }

    async deleteStatementEntry(id) {
        return this.delete(`/statement/entries/${id}`);
    }

    async downloadMonthlyReport(month, year) {
        const response = await fetch(
            `${this.baseUrl}/payments/monthly-report?month=${month}&year=${year}`,
            { headers: { Authorization: `Bearer ${this.token}` } }
        );
        if (!response.ok) {
            throw new Error('No se pudo generar el reporte mensual');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `boleta-de-pago-mensual-${month}-${year}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
    }


    // ----------------------------------------
    // RECIBO FÍSICO FIRMADO
    //
    // Respaldo visual del papel que el empleado firmó al cobrar. El monto NO
    // se lee de la imagen: sigue saliendo del cálculo de nómina.
    // ----------------------------------------

    async uploadPaymentReceipt(paymentId, dataUri) {
        return this.post(`/payments/${paymentId}/receipt`, { photo: dataUri });
    }

    async deletePaymentReceipt(paymentId) {
        return this.delete(`/payments/${paymentId}/receipt`);
    }

    /**
     * Devuelve el recibo como URL de objeto para mostrarlo en pantalla.
     *
     * No se puede usar la ruta directa en un `<img src>`: el endpoint exige
     * la cabecera de autorización, y una etiqueta de imagen no la manda.
     * Quien la use debe liberar la URL con `URL.revokeObjectURL` al cerrar.
     */
    async getPaymentReceiptUrl(paymentId) {
        const response = await fetch(`${this.baseUrl}/payments/${paymentId}/receipt`, {
            headers: { Authorization: `Bearer ${this.token}` },
        });

        if (!response.ok) {
            throw new Error(
                response.status === 404
                    ? "Ese pago todavía no tiene recibo adjunto"
                    : "No se pudo cargar el recibo"
            );
        }

        return URL.createObjectURL(await response.blob());
    }
    async downloadPaymentPdf(id, filename) {
        const url = `${this.baseUrl}/payments/${id}/pdf`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.token}`,
            },
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
