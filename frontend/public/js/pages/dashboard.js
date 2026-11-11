/**
 * DashboardPage - Controla la vista del Dashboard principal
 */
window.DashboardPage = {
    async render() {
        return window.auth.isAdmin() ? this.renderAdminDashboard() : this.renderEmployeeDashboard();
    },

    async init() {
        try {
            if (window.auth.isAdmin()) {
                await this.initAdminDashboard();
            } else {
                await this.initEmployeeDashboard();
            }
        } catch (error) {
            console.error('Error al inicializar dashboard:', error);
            window.App.showToast('Error al cargar datos del dashboard', 'error');
        }
    },

    // ----------------------------------------
    // VISTA DEL EMPLEADO
    // ----------------------------------------

    renderEmployeeDashboard() {
        const user = window.auth.getUser() || {};
        const nombre = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Bienvenido';

        return `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Hola, ${window.UI.escapeHtml(nombre)}</h1>
                    <p class="page-subtitle">Su asistencia y sus boletas de pago de este mes.</p>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon">📅</div>
                    <div class="stat-info">
                        <span class="stat-label">Días Asistidos (Mes)</span>
                        <h3 class="stat-value" id="emp-stat-days">0</h3>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⌛</div>
                    <div class="stat-info">
                        <span class="stat-label">Horas Trabajadas (Mes)</span>
                        <h3 class="stat-value text-success" id="emp-stat-hours">0.0 hrs</h3>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⏱️</div>
                    <div class="stat-info">
                        <span class="stat-label">Retrasos sin Justificar</span>
                        <h3 class="stat-value text-warning" id="emp-stat-delays">0 min</h3>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Mi Asistencia Reciente</h3>
                    </div>
                    <div class="table-container">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Entrada</th>
                                    <th>Salida</th>
                                    <th>Retraso</th>
                                </tr>
                            </thead>
                            <tbody id="emp-attendance-body">
                                <tr><td colspan="4" class="text-center text-muted">Cargando…</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Mis Boletas de Pago</h3>
                    </div>
                    <div class="table-container">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Período</th>
                                    <th>Neto Pagado</th>
                                    <th class="text-right">Comprobante</th>
                                </tr>
                            </thead>
                            <tbody id="emp-payments-body">
                                <tr><td colspan="3" class="text-center text-muted">Cargando…</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    async initEmployeeDashboard() {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        // El backend restringe estas consultas al propio usuario; no hace falta
        // enviar userId ni confiar en que el cliente lo filtre.
        const [attendanceRes, paymentsRes] = await Promise.all([
            window.api.getAttendances({ month, year }),
            window.api.getPaymentHistory(),
        ]);

        const attendances = attendanceRes.data || [];
        const payments = paymentsRes.data || [];

        const pendingDelay = (attendance) => {
            const justified = (attendance.sessions || [])
                .filter((session) => session.justificationStatus === 'JUSTIFIED')
                .reduce((total, session) => total + Number(session.delayMinutes || 0), 0);
            return Math.max(0, (parseInt(attendance.delayMinutes) || 0) - justified);
        };

        const totalHours = attendances.reduce(
            (sum, item) => sum + (parseFloat(item.hoursWorked) || 0),
            0
        );
        const totalDelays = attendances.reduce((sum, item) => sum + pendingDelay(item), 0);

        document.getElementById('emp-stat-days').textContent = attendances.length;
        document.getElementById('emp-stat-hours').textContent = `${totalHours.toFixed(1)} hrs`;
        document.getElementById('emp-stat-delays').textContent = `${totalDelays} min`;

        const attendanceBody = document.getElementById('emp-attendance-body');
        if (attendances.length === 0) {
            attendanceBody.innerHTML =
                '<tr><td colspan="4" class="text-center text-muted">Sin registros este mes.</td></tr>';
        } else {
            attendanceBody.innerHTML = attendances
                .slice(0, 10)
                .map((item) => {
                    const delay = pendingDelay(item);
                    const delayText = delay > 0 ? `${delay} min` : 'A tiempo';
                    const delayClass = delay > 0 ? 'text-danger' : 'text-success';
                    return `
                        <tr>
                            <td>${window.App.formatDate(item.date)}</td>
                            <td>${window.UI.escapeHtml(item.actualEntry)}</td>
                            <td>${window.UI.escapeHtml(item.actualExit || '—')}</td>
                            <td class="${delayClass}">${delayText}</td>
                        </tr>
                    `;
                })
                .join('');
        }

        const paymentsBody = document.getElementById('emp-payments-body');
        const months = [
            'Ene',
            'Feb',
            'Mar',
            'Abr',
            'May',
            'Jun',
            'Jul',
            'Ago',
            'Sep',
            'Oct',
            'Nov',
            'Dic',
        ];

        if (payments.length === 0) {
            paymentsBody.innerHTML =
                '<tr><td colspan="3" class="text-center text-muted">Aún no tiene pagos registrados.</td></tr>';
        } else {
            paymentsBody.innerHTML = payments
                .slice(0, 10)
                .map(
                    (payment) => `
                        <tr>
                            <td>${months[payment.month - 1]} / ${payment.year}</td>
                            <td class="text-success font-weight-bold">${window.App.formatCurrency(parseFloat(payment.netPay) || 0)}</td>
                            <td class="text-right">
                                <button class="btn-secondary btn-sm" data-employee-payment-id="${payment.id}"
                                    data-month="${payment.month}" data-year="${payment.year}">📄 PDF</button>
                            </td>
                        </tr>
                    `
                )
                .join('');

            paymentsBody.addEventListener('click', async (event) => {
                const button = event.target.closest('[data-employee-payment-id]');
                if (!button) return;

                const id = Number(button.dataset.employeePaymentId);
                try {
                    await window.api.downloadPaymentPdf(
                        id,
                        `boleta-${button.dataset.month}-${button.dataset.year}.pdf`
                    );
                } catch (error) {
                    window.App.showToast(
                        'No se pudo descargar la boleta: ' + error.message,
                        'error'
                    );
                }
            });
        }
    },

    // ----------------------------------------
    // RENDER TEMPLATE
    // ----------------------------------------

    renderAdminDashboard() {
        return `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Panel de Control de Nómina</h1>
                    <p class="page-subtitle">Resumen general de nóminas, asistencias y retrasos acumulados en el mes.</p>
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon">👥</div>
                    <div class="stat-info">
                        <span class="stat-label">Empleados Activos</span>
                        <h3 class="stat-value" id="stat-active-employees">0</h3>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⏱️</div>
                    <div class="stat-info">
                        <span class="stat-label">Retraso Total (Mes)</span>
                        <h3 class="stat-value text-warning" id="stat-total-delays">0 min</h3>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">💸</div>
                    <div class="stat-info">
                        <span class="stat-label">Nómina Base Proyectada</span>
                        <h3 class="stat-value text-success" id="stat-projected-payroll">Bs. 0.00</h3>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">✅</div>
                    <div class="stat-info">
                        <span class="stat-label">Pagos Realizados (Mes)</span>
                        <h3 class="stat-value text-info" id="stat-processed-payments">0</h3>
                    </div>
                </div>
            </div>

            <!-- Dashboard Details Row -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <!-- Recent Delay Logs -->
                <div class="card">
                    <div class="card-header flex-between">
                        <h3 class="card-title">Asistencias Recientes</h3>
                        <button class="btn-secondary btn-sm" onclick="window.App.navigateTo('attendance')">
                            Ver Asistencia
                        </button>
                    </div>
                    <div class="table-container">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Empleado</th>
                                    <th>Fecha</th>
                                    <th>Ingreso</th>
                                    <th>Retraso</th>
                                </tr>
                            </thead>
                            <tbody id="recent-delays-body">
                                <tr>
                                    <td colspan="4" class="text-center text-muted">Cargando registros...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Recent Payments History -->
                <div class="card">
                    <div class="card-header flex-between">
                        <h3 class="card-title">Últimos Pagos Realizados</h3>
                        <button class="btn-secondary btn-sm" onclick="window.App.navigateTo('history')">
                            Ver Historial
                        </button>
                    </div>
                    <div class="table-container">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Empleado</th>
                                    <th>Mes / Año</th>
                                    <th>Neto Pagado</th>
                                </tr>
                            </thead>
                            <tbody id="recent-payments-body">
                                <tr>
                                    <td colspan="3" class="text-center text-muted">Cargando pagos...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    // ----------------------------------------
    // LOGIC & DATA FETCHING
    // ----------------------------------------

    async initAdminDashboard() {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        // 1. Cargar empleados activos
        const usersResponse = await window.api.getUsers();
        const employees = usersResponse.data || [];
        const activeEmployees = employees.filter((emp) => emp.isActive && emp.role !== 'ADMIN');

        // Calcular nómina base proyectada (salarios base mensuales de empleados activos)
        const projectedPayroll = activeEmployees.reduce(
            (sum, emp) => sum + (parseFloat(emp.monthlySalary) || 0),
            0
        );

        // 2. Cargar asistencias del mes
        const attendanceResponse = await window.api.getAttendances({
            month: currentMonth,
            year: currentYear,
        });
        const attendances = attendanceResponse.data || [];
        const getPendingDelay = (attendance) => {
            const justifiedMinutes = (attendance.sessions || [])
                .filter((session) => session.justificationStatus === 'JUSTIFIED')
                .reduce((total, session) => total + Number(session.delayMinutes || 0), 0);
            return Math.max(0, (parseInt(attendance.delayMinutes) || 0) - justifiedMinutes);
        };
        const totalDelayMinutes = attendances.reduce(
            (sum, attendance) => sum + getPendingDelay(attendance),
            0
        );

        // 3. Cargar historial de pagos del mes
        const paymentsResponse = await window.api.getPaymentHistory({
            month: currentMonth,
            year: currentYear,
        });
        const payments = paymentsResponse.data || [];
        const processedPaymentsCount = payments.length;

        // Escribir estadísticas animados/directos
        this.animateNumber('stat-active-employees', activeEmployees.length, 0);
        this.animateNumber('stat-total-delays', totalDelayMinutes, 0, 'min');
        this.animateNumber('stat-projected-payroll', projectedPayroll, 2, 'Bs.');
        this.animateNumber('stat-processed-payments', processedPaymentsCount, 0);

        // 4. Renderizar asistencias recientes (últimas 5)
        const recentDelaysTbody = document.getElementById('recent-delays-body');
        if (recentDelaysTbody) {
            if (attendances.length === 0) {
                recentDelaysTbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Sin registros este mes.</td></tr>`;
            } else {
                const recentAtt = attendances.slice(0, 5);
                recentDelaysTbody.innerHTML = recentAtt
                    .map((att) => {
                        const empName = att.user
                            ? `${att.user.firstName} ${att.user.lastName}`
                            : 'Empleado';
                        const originalDelay = parseInt(att.delayMinutes) || 0;
                        const delay = getPendingDelay(att);
                        const delayText =
                            delay > 0
                                ? `${delay} min`
                                : originalDelay > 0
                                  ? 'Justificado'
                                  : 'A tiempo';
                        const delayClass =
                            delay > 0 ? 'text-danger font-weight-semibold' : 'text-success';

                        return `
                        <tr>
                            <td class="font-weight-medium">${window.UI.escapeHtml(empName)}</td>
                            <td>${window.App.formatDate(att.date)}</td>
                            <td>${window.UI.escapeHtml(att.actualEntry)}</td>
                            <td class="${delayClass}">${delayText}</td>
                        </tr>
                    `;
                    })
                    .join('');
            }
        }

        // 5. Renderizar pagos recientes (últimos 5)
        const recentPaymentsTbody = document.getElementById('recent-payments-body');
        if (recentPaymentsTbody) {
            // Fetch all history for general overview
            const allPaymentsRes = await window.api.getPaymentHistory();
            const allPayments = allPaymentsRes.data || [];

            if (allPayments.length === 0) {
                recentPaymentsTbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">No se han registrado pagos.</td></tr>`;
            } else {
                const months = [
                    'Ene',
                    'Feb',
                    'Mar',
                    'Abr',
                    'May',
                    'Jun',
                    'Jul',
                    'Ago',
                    'Sep',
                    'Oct',
                    'Nov',
                    'Dic',
                ];
                const recentPays = allPayments.slice(0, 5);
                recentPaymentsTbody.innerHTML = recentPays
                    .map((p) => {
                        const empName = p.user
                            ? `${p.user.firstName} ${p.user.lastName}`
                            : 'Empleado';
                        const periodText = `${months[p.month - 1]} / ${p.year}`;
                        const netPay = parseFloat(p.netPay) || 0;

                        return `
                        <tr>
                            <td class="font-weight-medium">${window.UI.escapeHtml(empName)}</td>
                            <td>${periodText}</td>
                            <td class="text-success font-weight-bold">${window.App.formatCurrency(netPay)}</td>
                        </tr>
                    `;
                    })
                    .join('');
            }
        }
    },

    // Utility to animate number counters
    animateNumber(elementId, targetValue, decimals = 0, prefix = '') {
        const el = document.getElementById(elementId);
        if (!el) return;

        let startValue = 0;
        const duration = 800; // ms
        const startTime = performance.now();

        function update(currentTime) {
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(elapsedTime / duration, 1);

            // Ease out quad
            const easeProgress = progress * (2 - progress);
            const currentValue = startValue + easeProgress * (targetValue - startValue);

            if (prefix === 'Bs.') {
                el.textContent = window.App.formatCurrency(currentValue);
            } else {
                el.textContent = currentValue.toFixed(decimals) + (prefix ? ' ' + prefix : '');
            }

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    },
};
