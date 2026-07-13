/**
 * HistoryPage - Historial de Pagos de Nómina (Admin Only)
 */
window.HistoryPage = {
    filters: {
        userId: '',
        month: '',
        year: ''
    },
    users: [],

    async render() {
        return `
            <div class="page-header flex-between">
                <div>
                    <h1 class="page-title">📜 Historial de Pagos</h1>
                    <p class="page-subtitle">Consulta todos los pagos de nómina procesados, descarga sus comprobantes en PDF y verifica el envío de correos.</p>
                </div>
            </div>

            <!-- Filters Section -->
            <div class="card mb-4">
                <div class="filters-row flex gap-2">
                    <div class="form-group flex-1">
                        <label for="history-user">Empleado</label>
                        <select id="history-user" class="form-control">
                            <option value="">Todos los Empleados</option>
                        </select>
                    </div>
                    <div class="form-group flex-1">
                        <label for="history-month">Mes</label>
                        <select id="history-month" class="form-control">
                            <option value="">Todos los Meses</option>
                            <option value="1">Enero</option>
                            <option value="2">Febrero</option>
                            <option value="3">Marzo</option>
                            <option value="4">Abril</option>
                            <option value="5">Mayo</option>
                            <option value="6">Junio</option>
                            <option value="7">Julio</option>
                            <option value="8">Agosto</option>
                            <option value="9">Septiembre</option>
                            <option value="10">Octubre</option>
                            <option value="11">Noviembre</option>
                            <option value="12">Diciembre</option>
                        </select>
                    </div>
                    <div class="form-group flex-1">
                        <label for="history-year">Año</label>
                        <input type="number" id="history-year" class="form-control" placeholder="Ej: 2026" min="2020" max="2030">
                    </div>
                    <div class="form-group flex-align-end flex gap-1">
                        <button class="btn-secondary" id="btn-history-clear" style="height: 42px;">Limpiar</button>
                        <button class="btn-primary" id="btn-history-apply" style="height: 42px;">Filtrar</button>
                        <button class="btn-success" id="btn-monthly-report" style="height: 42px;">PDF mensual</button>
                    </div>
                </div>
            </div>

            <!-- History Table -->
            <div class="card">
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Empleado</th>
                                <th>Mes / Año</th>
                                <th>Salario Base</th>
                                <th>Tarifa/Hora</th>
                                <th>Horas Extra</th>
                                <th>Total Ingresos</th>
                                <th>Total Descuentos</th>
                                <th>Pago Neto</th>
                                <th>Fecha de Pago</th>
                                <th>Notificado</th>
                                <th class="text-right">Comprobante</th>
                            </tr>
                        </thead>
                        <tbody id="history-table-body">
                            <tr>
                                <td colspan="11" class="text-center text-muted">Cargando historial de pagos...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async init() {
        try {
            const res = await window.api.getUsers();
            this.users = (res.data || []).filter(u => u.isActive && u.role !== 'ADMIN');
            const selectUser = document.getElementById('history-user');
            if (selectUser) {
                selectUser.innerHTML = '<option value="">Todos los Empleados</option>' + 
                    this.users.map(u => `<option value="${u.id}">${u.firstName} ${u.lastName}</option>`).join('');
            }
        } catch (e) {
            console.error('Error al cargar empleados en historial:', e);
        }

        document.getElementById('btn-history-apply').addEventListener('click', () => {
            this.filters.userId = document.getElementById('history-user').value;
            this.filters.month = document.getElementById('history-month').value;
            this.filters.year = document.getElementById('history-year').value;
            this.loadHistory();
        });

        document.getElementById('btn-history-clear').addEventListener('click', () => {
            this.filters.userId = '';
            this.filters.month = '';
            this.filters.year = '';
            
            document.getElementById('history-user').value = '';
            document.getElementById('history-month').value = '';
            document.getElementById('history-year').value = '';
            
            this.loadHistory();
        });
        document.getElementById('btn-monthly-report').addEventListener('click',async e=>{const month=Number(document.getElementById('history-month').value),year=Number(document.getElementById('history-year').value);if(!month||!year)return window.App.showToast('Seleccione mes y año para generar el reporte','warning');e.currentTarget.disabled=true;try{await window.api.downloadMonthlyReport(month,year);window.App.showToast('Reporte mensual generado','success')}catch(error){window.App.showToast(error.message,'error')}finally{e.currentTarget.disabled=false}});

        document.getElementById('history-table-body').addEventListener('click', (event) => {
            const button = event.target.closest('[data-action="download-payment-pdf"]');
            if (!button) return;

            this.downloadPdf(
                Number(button.dataset.paymentId),
                button.dataset.employeeName,
                Number(button.dataset.month),
                Number(button.dataset.year)
            );
        });

        await this.loadHistory();
    },

    async loadHistory() {
        const tbody = document.getElementById('history-table-body');
        if (!tbody) return;

        try {
            const response = await window.api.getPaymentHistory(this.filters);
            const payments = response.data || [];

            if (payments.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="11" class="text-center text-muted">
                            No se encontraron registros de pagos con los filtros seleccionados.
                        </td>
                    </tr>
                `;
                return;
            }

            const months = [
                'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
            ];

            tbody.innerHTML = payments.map(p => {
                const empName = p.user ? `${p.user.firstName} ${p.user.lastName}` : 'Desconocido';
                const monthName = months[p.month - 1];
                const base = parseFloat(p.monthlySalary);
                const hourlyRate = parseFloat(p.hourlyRate) || 0;
                const overtime = parseFloat(p.overtimeAmount) || 0;
                const totalIncome = parseFloat(p.totalIncome) || parseFloat(p.grossPay) || 0;
                const delayDiscount = parseFloat(p.discountAmount) || 0;
                const discount = parseFloat(p.totalDiscounts) || delayDiscount;
                const net = parseFloat(p.netPay);
                
                const paidDate = new Date(p.paidAt).toLocaleDateString('es-BO', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });

                const emailBadge = p.emailSent
                    ? '<span class="badge badge-success">Enviado ✉️</span>'
                    : `<span class="badge badge-danger" title="${window.UI.escapeHtml(p.emailError || 'Envío pendiente')}">Pendiente ⚠️</span>`;

                return `
                    <tr>
                        <td class="font-weight-medium">${empName}</td>
                        <td class="font-weight-medium">${monthName} / ${p.year}</td>
                        <td>${window.App.formatCurrency(base)}</td>
                        <td>${window.App.formatCurrency(hourlyRate)}</td>
                        <td class="text-success">+${window.App.formatCurrency(overtime)}</td>
                        <td class="text-success font-weight-semibold">${window.App.formatCurrency(totalIncome)}</td>
                        <td class="text-danger">-${window.App.formatCurrency(discount)}</td>
                        <td class="text-success font-weight-bold">${window.App.formatCurrency(net)}</td>
                        <td>${paidDate}</td>
                        <td>${emailBadge}</td>
                        <td class="text-right">
                            <button class="btn-secondary btn-sm"
                                data-action="download-payment-pdf"
                                data-payment-id="${p.id}"
                                data-employee-name="${empName}"
                                data-month="${p.month}"
                                data-year="${p.year}">
                                📄 PDF
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            console.error('Error al cargar historial:', e);
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" class="text-center text-danger">
                        Error al cargar registros: ${e.message}
                    </td>
                </tr>
            `;
        }
    },

    async downloadPdf(paymentId, employeeName, month, year) {
        window.App.showToast('Descargando comprobante PDF...', 'info');
        try {
            const filename = `boleta-de-pago-${employeeName.replace(/\s+/g, '-')}-${month}-${year}.pdf`;
            await window.api.downloadPaymentPdf(paymentId, filename);
            window.App.showToast('Comprobante descargado correctamente', 'success');
        } catch (error) {
            window.App.showToast('Error al descargar PDF: ' + error.message, 'error');
        }
    }
};
