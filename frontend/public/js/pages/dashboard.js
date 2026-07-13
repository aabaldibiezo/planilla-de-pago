/**
 * DashboardPage - Controla la vista del Dashboard principal
 */
window.DashboardPage = {
    async render() {
        return this.renderAdminDashboard();
    },

    async init() {
        try {
            await this.initAdminDashboard();
        } catch (error) {
            console.error('Error al inicializar dashboard:', error);
            window.App.showToast('Error al cargar datos del dashboard', 'error');
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
        const activeEmployees = employees.filter(emp => emp.isActive && emp.role !== 'ADMIN');
        
        // Calcular nómina base proyectada (salarios base mensuales de empleados activos)
        const projectedPayroll = activeEmployees.reduce((sum, emp) => sum + (parseFloat(emp.monthlySalary) || 0), 0);

        // 2. Cargar asistencias del mes
        const attendanceResponse = await window.api.getAttendances({
            month: currentMonth,
            year: currentYear
        });
        const attendances = attendanceResponse.data || [];
        const getPendingDelay = attendance => {
            const justifiedMinutes = (attendance.sessions || [])
                .filter(session => session.justificationStatus === 'JUSTIFIED')
                .reduce((total, session) => total + Number(session.delayMinutes || 0), 0);
            return Math.max(0, (parseInt(attendance.delayMinutes) || 0) - justifiedMinutes);
        };
        const totalDelayMinutes = attendances.reduce((sum, attendance) => sum + getPendingDelay(attendance), 0);

        // 3. Cargar historial de pagos del mes
        const paymentsResponse = await window.api.getPaymentHistory({
            month: currentMonth,
            year: currentYear
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
                recentDelaysTbody.innerHTML = recentAtt.map(att => {
                    const empName = att.user ? `${att.user.firstName} ${att.user.lastName}` : 'Empleado';
                    const originalDelay = parseInt(att.delayMinutes) || 0;
                    const delay = getPendingDelay(att);
                    const delayText = delay > 0 ? `${delay} min` : originalDelay > 0 ? 'Justificado' : 'A tiempo';
                    const delayClass = delay > 0 ? 'text-danger font-weight-semibold' : 'text-success';

                    return `
                        <tr>
                            <td class="font-weight-medium">${empName}</td>
                            <td>${window.App.formatDate(att.date)}</td>
                            <td>${att.actualEntry}</td>
                            <td class="${delayClass}">${delayText}</td>
                        </tr>
                    `;
                }).join('');
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
                    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
                ];
                const recentPays = allPayments.slice(0, 5);
                recentPaymentsTbody.innerHTML = recentPays.map(p => {
                    const empName = p.user ? `${p.user.firstName} ${p.user.lastName}` : 'Empleado';
                    const periodText = `${months[p.month - 1]} / ${p.year}`;
                    const netPay = parseFloat(p.netPay) || 0;

                    return `
                        <tr>
                            <td class="font-weight-medium">${empName}</td>
                            <td>${periodText}</td>
                            <td class="text-success font-weight-bold">${window.App.formatCurrency(netPay)}</td>
                        </tr>
                    `;
                }).join('');
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
    }
};
