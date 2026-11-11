/**
 * PaymentsPage - Módulo de Cálculo de Nómina y Pagos (Admin Only)
 */
window.PaymentsPage = {
    filters: {
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        // Vacío = todos. Con un empleado elegido, la planilla del mes se reduce
        // a esa persona y aparece el resumen de lo que se le pagó.
        userId: '',
    },
    records: [],

    escapeHtml(value) {
        return window.UI.escapeHtml(value);
    },

    async render() {
        return `
            <div class="page-header flex-between">
                <div>
                    <h1 class="page-title">🧮 Cálculo de Nómina</h1>
                    <p class="page-subtitle">Calcula salarios, retrasos y descuentos externos opcionales antes de procesar el pago.</p>
                </div>
                <div class="flex gap-2 flex-wrap">
                    <button class="btn-secondary" id="btn-holidays">📅 Feriados y días extra</button>
                    <button class="btn-secondary" id="btn-new-external-discount">➖ Registrar descuento</button>
                </div>
            </div>

            <!-- Filters & Calculation Trigger -->
            <div class="card mb-4">
                <div class="filters-row flex gap-2">
                    <div class="form-group flex-1">
                        <label for="payroll-month">Seleccionar Mes</label>
                        <select id="payroll-month" class="form-control">
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
                        <label for="payroll-year">Seleccionar Año</label>
                        <input type="number" id="payroll-year" class="form-control" value="${this.filters.year}" min="2020" max="2030">
                    </div>
                    <div class="form-group flex-1">
                        <label for="payroll-user">Empleado</label>
                        <select id="payroll-user" class="form-control">
                            <option value="">Todos los empleados</option>
                        </select>
                    </div>
                    <div class="form-group flex-align-end flex gap-1">
                        <button class="btn-primary" id="btn-calculate-payroll" style="height: 42px; width: 150px;">🧮 Calcular</button>
                    </div>
                </div>
            </div>

            <!-- Sueldos pagados al empleado elegido en el filtro -->
            <div class="card mb-4 hidden" id="payroll-employee-history"></div>

            <!-- Payroll Summary Cards -->
            <div class="stats-grid mb-4 hidden" id="payroll-stats">
                <div class="stats-grid" style="width: 100%; display: contents;">
                    <div class="stat-card">
                        <div class="stat-icon">💰</div>
                        <div class="stat-info">
                            <span class="stat-label">Total Ingresos</span>
                            <h3 class="stat-value text-info" id="total-base-salary">Bs. 0.00</h3>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📉</div>
                        <div class="stat-info">
                            <span class="stat-label">Total Descuentos</span>
                            <h3 class="stat-value text-warning" id="total-discounts">Bs. 0.00</h3>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">💸</div>
                        <div class="stat-info">
                            <span class="stat-label">Total Neto a Pagar</span>
                            <h3 class="stat-value text-success" id="total-net-pay">Bs. 0.00</h3>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Payroll Details Card -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title" id="payroll-title">Planilla de Salarios</h3>
                </div>
                <div class="table-container">
                    <table class="table payroll-table">
                        <thead>
                            <tr>
                                <th>Empleado</th>
                                <th>Salario Base</th>
                                <th>Tarifa/Hora</th>
                                <th>Horas Extra</th>
                                <th>Monto Horas Extra</th>
                                <th>Retrasos</th>
                                <th>Anticipos</th>
                                <th>Préstamos</th>
                                <th>Otros</th>
                                <th>Total Ingresos</th>
                                <th>Total Descuentos</th>
                                <th>Pago Neto</th>
                                <th>Estado</th>
                                <th class="text-right">Acción de Pago</th>
                            </tr>
                        </thead>
                        <tbody id="payroll-records-body">
                            <tr>
                                <td colspan="14" class="text-center text-muted">Selecciona el mes y año para calcular la planilla.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    /**
     * Feriados del año y cuánto se paga un domingo de descanso o feriado
     * trabajado. Los nacionales se calculan solos y no se editan; acá se
     * agregan los departamentales o decretados.
     */
    async openHolidaysModal(year) {
        let datos;
        try {
            datos = (await window.api.get(`/holidays?year=${year}`)).data;
        } catch (error) {
            window.App.showToast('No se pudieron cargar los feriados: ' + error.message, 'error');
            return;
        }

        const fecha = (iso) => iso.split('-').reverse().join('/');
        const filas = [
            ...datos.national.map((f) => ({ ...f, nacional: true })),
            ...datos.company.map((f) => ({ ...f, nacional: false })),
        ].sort((a, b) => a.date.localeCompare(b.date));

        window.App.showModal(
            'Feriados y días extra',
            `
            <div class="mt-2">
                <div class="card mb-3" style="padding: 12px 16px;">
                    <strong class="text-sm">Domingo de descanso o feriado trabajado</strong>
                    <div class="flex gap-2 mt-2 flex-wrap" style="align-items:center;">
                        <span>Se paga</span>
                        <input type="number" id="extra-factor" class="form-control" style="width:90px;" min="0" max="5" step="0.5" value="${datos.extraDayFactor}">
                        <span>jornal(es) extra por día</span>
                        <button class="btn-primary btn-sm" id="btn-guardar-factor">Guardar</button>
                    </div>
                    <small class="text-muted">
                        Un jornal es el sueldo ÷ 30. Con 2 se paga doble: quien gana Bs 3.000 recibe Bs 200 por cada día.
                        Si el horario de la persona ya incluye el domingo, ese domingo es parte del contrato y no se paga aparte.
                    </small>
                </div>

                <div class="flex-between mb-2">
                    <button class="btn-secondary btn-sm" data-anio="${year - 1}">◀ ${year - 1}</button>
                    <strong>Feriados ${year}</strong>
                    <button class="btn-secondary btn-sm" data-anio="${year + 1}">${year + 1} ▶</button>
                </div>
                <div class="table-container" style="max-height: 260px; overflow-y: auto;">
                    <table class="table">
                        <tbody>
                            ${filas
                                .map(
                                    (f) => `<tr>
                                        <td>${fecha(f.date)}</td>
                                        <td>${this.escapeHtml(f.name)}</td>
                                        <td class="text-right">${
                                            f.nacional
                                                ? '<span class="text-muted text-sm">Nacional</span>'
                                                : `<button class="btn-danger btn-sm" data-quitar-feriado="${f.id}">Quitar</button>`
                                        }</td>
                                    </tr>`
                                )
                                .join('')}
                        </tbody>
                    </table>
                </div>

                <form id="form-feriado" class="flex gap-2 mt-3 flex-wrap" style="align-items:flex-end;">
                    <div class="form-group mb-0">
                        <label for="feriado-fecha">Fecha</label>
                        <input type="date" id="feriado-fecha" class="form-control" required>
                    </div>
                    <div class="form-group mb-0 flex-1">
                        <label for="feriado-nombre">Nombre</label>
                        <input type="text" id="feriado-nombre" class="form-control" required placeholder="Ej.: Feriado departamental de Cochabamba">
                    </div>
                    <button type="submit" class="btn-primary">Agregar</button>
                </form>
                <p class="text-muted text-sm mt-2">
                    Un feriado no trabajado no cuenta como falta. Si alguien trabaja ese día, se le paga como día extra.
                </p>
            </div>
        `
        );

        document.querySelectorAll('[data-anio]').forEach((boton) =>
            boton.addEventListener('click', () => this.openHolidaysModal(Number(boton.dataset.anio)))
        );

        document.getElementById('btn-guardar-factor').addEventListener('click', async () => {
            try {
                await window.api.put('/holidays/extra-day-factor', {
                    extraDayFactor: Number(document.getElementById('extra-factor').value),
                });
                window.App.showToast('Pago de días extra actualizado.', 'success');
            } catch (error) {
                window.App.showToast(error.message, 'error');
            }
        });

        document.querySelectorAll('[data-quitar-feriado]').forEach((boton) =>
            boton.addEventListener('click', async () => {
                try {
                    await window.api.delete(`/holidays/${boton.dataset.quitarFeriado}`);
                    this.openHolidaysModal(year);
                } catch (error) {
                    window.App.showToast(error.message, 'error');
                }
            })
        );

        document.getElementById('form-feriado').addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const date = document.getElementById('feriado-fecha').value;
            try {
                await window.api.post('/holidays', {
                    date,
                    name: document.getElementById('feriado-nombre').value,
                });
                window.App.showToast('Feriado agregado.', 'success');
                this.openHolidaysModal(Number(date.slice(0, 4)) || year);
            } catch (error) {
                window.App.showToast(error.message, 'error');
            }
        });
    },

    async init() {
        document.getElementById('payroll-month').value = this.filters.month;
        document.getElementById('payroll-year').value = this.filters.year;

        document
            .getElementById('btn-new-external-discount')
            .addEventListener('click', () => this.openExternalDiscountModal());
        document
            .getElementById('btn-holidays')
            .addEventListener('click', () => this.openHolidaysModal(Number(this.filters.year)));

        // Todos los empleados, también los dados de baja: se puede querer ver
        // cuánto se le pagó a alguien que ya no trabaja en la empresa.
        try {
            const usuarios = ((await window.api.getUsers()).data || []).filter(
                (u) => u.role !== 'ADMIN'
            );
            const selector = document.getElementById('payroll-user');
            selector.innerHTML += usuarios
                .sort((a, b) =>
                    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
                )
                .map(
                    (u) =>
                        `<option value="${u.id}">${this.escapeHtml(`${u.firstName} ${u.lastName}`)}${u.isActive ? '' : ' (inactivo)'}</option>`
                )
                .join('');
            selector.value = this.filters.userId;
            // Elegir un empleado ya filtra: no hace falta tocar "Calcular".
            selector.addEventListener('change', () => {
                this.filters.userId = selector.value;
                this.loadPayroll();
            });
        } catch {
            // Sin la lista, la planilla del mes sigue funcionando completa.
        }

        document.getElementById('btn-calculate-payroll').addEventListener('click', () => {
            this.filters.month = document.getElementById('payroll-month').value;
            this.filters.year = document.getElementById('payroll-year').value;
            this.filters.userId = document.getElementById('payroll-user').value;
            this.loadPayroll();
        });

        document.getElementById('payroll-employee-history').addEventListener('click', (event) => {
            const boton = event.target.closest('[data-historial-pdf]');
            if (boton) this.downloadPdf(Number(boton.dataset.historialPdf), boton.dataset.nombre);
        });

        document.getElementById('payroll-records-body').addEventListener('click', (event) => {
            const button = event.target.closest('[data-payment-action]');
            if (!button || button.disabled) return;

            const record = this.records.find(
                (item) => item.user.id === Number(button.dataset.userId)
            );
            if (!record) return;

            const employeeName = `${record.user.firstName} ${record.user.lastName}`;
            if (button.dataset.paymentAction === 'pay') {
                this.confirmPayment(record);
            } else if (button.dataset.paymentAction === 'download') {
                this.downloadPdf(Number(button.dataset.paymentId), employeeName);
            } else if (button.dataset.paymentAction === 'receipt') {
                // Se recarga al terminar para que el botón refleje si el
                // recibo quedó adjunto o se quitó.
                window.Receipt.abrir(record.payment, () => this.mapPaymentIds());
            }
        });

        await this.loadPayroll();
    },

    async loadPayroll() {
        const tbody = document.getElementById('payroll-records-body');
        const statsGrid = document.getElementById('payroll-stats');

        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="14" class="text-center text-muted">Calculando y consultando registros...</td></tr>`;

        try {
            const response = await window.api.calculatePayments(
                this.filters.month,
                this.filters.year
            );
            this.records = response.data || [];
            if (this.filters.userId) {
                this.records = this.records.filter(
                    (record) => record.user.id === Number(this.filters.userId)
                );
            }
            this.loadEmployeeHistory();

            if (this.records.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="14" class="text-center text-muted">
                            ${
                                this.filters.userId
                                    ? 'Este empleado no está activo: no tiene planilla para este mes. Sus pagos anteriores están arriba.'
                                    : 'No hay empleados activos en el sistema para calcular la nómina.'
                            }
                        </td>
                    </tr>
                `;
                statsGrid.classList.add('hidden');
                return;
            }

            let totalGross = 0;
            let totalDiscount = 0;
            let totalNet = 0;

            const months = [
                'Enero',
                'Febrero',
                'Marzo',
                'Abril',
                'Mayo',
                'Junio',
                'Julio',
                'Agosto',
                'Septiembre',
                'Octubre',
                'Noviembre',
                'Diciembre',
            ];
            document.getElementById('payroll-title').textContent =
                `Planilla de Salarios: ${months[this.filters.month - 1]} de ${this.filters.year}`;

            tbody.innerHTML = this.records
                .map((record) => {
                    const empName = `${record.user.firstName} ${record.user.lastName}`;
                    const base = parseFloat(record.monthlySalary);
                    const hourlyRate = parseFloat(record.hourlyRate) || 0;
                    const overtimeHours = (record.overtimes || []).reduce(
                        (sum, item) => sum + Number(item.hours || 0),
                        0
                    );
                    const overtimeAmount = parseFloat(record.overtimeAmount) || 0;
                    const delays = record.totalDelayMinutes;
                    const delayDiscount = parseFloat(record.discountAmount) || 0;
                    const otherDiscounts = parseFloat(record.otherDiscounts) || 0;
                    const totalDiscounts =
                        parseFloat(record.totalDiscounts) || delayDiscount + otherDiscounts;
                    const totalIncome = parseFloat(record.totalIncome) || base + overtimeAmount;
                    const net = parseFloat(record.netPay);
                    const byType = (type) =>
                        (record.discounts || [])
                            .filter((item) => item.type === type)
                            .reduce((sum, item) => sum + Number(item.amount || 0), 0);
                    const advances = byType('SALARY_ADVANCE');
                    const loans = byType('LOAN');
                    const remainingDiscounts = Math.max(0, otherDiscounts - advances - loans);
                    const externalDiscountDetails = (record.discounts || [])
                        .map(
                            (item) =>
                                `${item.description}: ${window.App.formatCurrency(item.amount)}`
                        )
                        .join(' | ');

                    totalGross += totalIncome;
                    totalDiscount += totalDiscounts;
                    totalNet += net;

                    const statusLabel = record.isPaid
                        ? '<span class="badge badge-success">Pagado</span>'
                        : '<span class="badge badge-warning">Pendiente</span>';

                    let actionHtml = '';
                    if (record.isPaid) {
                        actionHtml = `
                        <div class="flex-end">
                            <button class="btn-secondary btn-sm" disabled>
                                Cargando PDF...
                            </button>
                        </div>
                    `;
                    } else {
                        actionHtml = `
                        <div class="flex-end">
                            <button class="btn-primary btn-sm" data-payment-action="pay" data-user-id="${record.user.id}">
                                💵 Pagar
                            </button>
                        </div>
                    `;
                    }

                    const extras = record.extraDays || [];
                    const avisoExtras = extras.length
                        ? `<br><span class="badge badge-success" title="${this.escapeHtml(extras.map((d) => `${d.date.split('-').reverse().join('/')} (${d.reason})`).join(', '))}">+ ${extras.length} ${extras.length === 1 ? 'día extra' : 'días extra'}: ${window.App.formatCurrency(record.extraDaysAmount)}</span>`
                        : '';
                    const faltas = record.missingDays || [];
                    const avisoFaltas = faltas.length
                        ? `<br><span class="badge badge-warning" title="Días con turno y sin marcación: ${this.escapeHtml(faltas.map((d) => d.split('-').reverse().join('/')).join(', '))}. No se descuentan solos; si corresponde, cargue una falta en Horas extra y descuentos.">⚠ ${faltas.length} ${faltas.length === 1 ? 'día' : 'días'} sin marcar</span>`
                        : '';

                    return `
                    <tr>
                        <td class="font-weight-medium">${this.escapeHtml(empName)}${avisoExtras}${avisoFaltas}</td>
                        <td>${
                            record.payScheme === 'DAILY'
                                ? `${window.App.formatCurrency(base)}<br><small class="text-muted">${record.daysWorked} ${record.daysWorked === 1 ? 'día' : 'días'} × ${window.App.formatCurrency(record.dailyRate)}</small>`
                                : window.App.formatCurrency(base)
                        }</td>
                        <td>${window.App.formatCurrency(hourlyRate)}</td>
                        <td>${overtimeHours.toFixed(2)} h</td>
                        <td class="text-success">+${window.App.formatCurrency(overtimeAmount)}</td>
                        <td title="${delays} min; ${record.justifiedDelayMinutes || 0} min justificados">${delays} min / -${window.App.formatCurrency(delayDiscount)}</td>
                        <td class="text-danger">-${window.App.formatCurrency(advances)}</td>
                        <td class="text-danger">-${window.App.formatCurrency(loans)}</td>
                        <td class="text-danger" title="${this.escapeHtml(externalDiscountDetails)}">-${window.App.formatCurrency(remainingDiscounts)}</td>
                        <td class="text-success font-weight-bold">${window.App.formatCurrency(totalIncome)}</td>
                        <td class="text-danger font-weight-bold">-${window.App.formatCurrency(totalDiscounts)}</td>
                        <td class="text-success font-weight-bold">${window.App.formatCurrency(net)}</td>
                        <td>${statusLabel}</td>
                        <td>${actionHtml}</td>
                    </tr>
                `;
                })
                .join('');

            await this.mapPaymentIds();

            // Show and update stats
            statsGrid.classList.remove('hidden');
            document.getElementById('total-base-salary').textContent =
                window.App.formatCurrency(totalGross);
            document.getElementById('total-discounts').textContent =
                window.App.formatCurrency(totalDiscount);
            document.getElementById('total-net-pay').textContent =
                window.App.formatCurrency(totalNet);
        } catch (e) {
            console.error('Error al calcular nómina:', e);
            tbody.innerHTML = `
                <tr>
                    <td colspan="14" class="text-center text-danger">
                        Error al cargar la planilla: ${e.message}
                    </td>
                </tr>
            `;
            statsGrid.classList.add('hidden');
        }
    },

    /**
     * Resumen de los sueldos pagados al empleado elegido en el filtro:
     * cuántos pagos, cuánto en el año y en total, y el detalle mes a mes con
     * su boleta. Sale del historial de pagos ya confirmados.
     */
    async loadEmployeeHistory() {
        const caja = document.getElementById('payroll-employee-history');
        if (!caja) return;
        if (!this.filters.userId) {
            caja.classList.add('hidden');
            caja.innerHTML = '';
            return;
        }

        caja.classList.remove('hidden');
        caja.innerHTML = '<p class="text-muted">Cargando pagos…</p>';

        try {
            const respuesta = await window.api.getPaymentHistory({ userId: this.filters.userId });
            const pagos = (respuesta.data || [])
                .slice()
                .sort((a, b) => b.year - a.year || b.month - a.month);
            const selector = document.getElementById('payroll-user');
            const nombre = selector.selectedOptions[0]?.text.replace(' (inactivo)', '') || '';
            const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const anio = Number(this.filters.year);
            const suma = (lista) => lista.reduce((total, p) => total + Number(p.netPay || 0), 0);
            const delAnio = pagos.filter((p) => p.year === anio);

            const filas = pagos
                .map(
                    (p) => `<tr>
                        <td>${meses[p.month - 1]} ${p.year}</td>
                        <td class="font-weight-semibold text-success">${window.App.formatCurrency(p.netPay)}</td>
                        <td>${new Date(p.paidAt).toLocaleDateString('es-BO')}</td>
                        <td>${p.receiptPhotoUrl ? '<span class="badge badge-success">📎 Adjunto</span>' : '<span class="badge badge-warning">Falta</span>'}</td>
                        <td class="text-right"><button type="button" class="btn-secondary btn-sm" data-historial-pdf="${p.id}" data-nombre="${this.escapeHtml(nombre)}">📄 Boleta</button></td>
                    </tr>`
                )
                .join('');

            caja.innerHTML = `
                <div class="flex-between flex-wrap gap-2 mb-3">
                    <h3 class="card-title mb-0">💵 Sueldos pagados a ${this.escapeHtml(nombre)}</h3>
                    <button type="button" class="btn-secondary btn-sm" id="btn-limpiar-empleado">Ver todos los empleados</button>
                </div>
                <div class="resumen-empleado mb-3">
                    <div><span class="text-muted text-sm">Sueldos pagados</span><strong>${pagos.length}</strong></div>
                    <div><span class="text-muted text-sm">Pagado en ${anio}</span><strong>${window.App.formatCurrency(suma(delAnio))}</strong><small class="text-muted">${delAnio.length} ${delAnio.length === 1 ? 'pago' : 'pagos'}</small></div>
                    <div><span class="text-muted text-sm">Pagado en total</span><strong>${window.App.formatCurrency(suma(pagos))}</strong></div>
                </div>
                ${
                    pagos.length
                        ? `<div class="table-container">
                               <table class="table">
                                   <thead><tr><th>Mes</th><th>Neto pagado</th><th>Fecha de pago</th><th>Recibo firmado</th><th></th></tr></thead>
                                   <tbody>${filas}</tbody>
                               </table>
                           </div>`
                        : '<p class="text-muted">Todavía no se le pagó ningún sueldo.</p>'
                }`;

            document.getElementById('btn-limpiar-empleado').addEventListener('click', () => {
                this.filters.userId = '';
                document.getElementById('payroll-user').value = '';
                this.loadPayroll();
            });
        } catch (error) {
            caja.innerHTML = `<p class="text-danger">No se pudieron cargar los pagos: ${this.escapeHtml(error.message)}</p>`;
        }
    },

    async mapPaymentIds() {
        try {
            const historyRes = await window.api.getPaymentHistory({
                month: this.filters.month,
                year: this.filters.year,
            });
            const payments = historyRes.data || [];

            this.records.forEach((record) => {
                const match = payments.find((p) => p.userId === record.user.id);
                if (match) {
                    record.isPaid = true;
                    record.paymentId = match.id;
                    record.payment = match;
                }
            });

            const tbody = document.getElementById('payroll-records-body');
            const rows = tbody.querySelectorAll('tr');

            this.records.forEach((record, index) => {
                if (record.isPaid && rows[index]) {
                    const actionTd = rows[index].querySelector('td:last-child');
                    if (actionTd) {
                        // Junto a la boleta va el recibo firmado: la boleta la
                        // genera el sistema, el recibo lo firma el empleado.
                        actionTd.innerHTML = `
                            <div class="flex-end gap-2">
                                <button class="btn-secondary btn-sm" data-payment-action="download" data-user-id="${record.user.id}" data-payment-id="${record.paymentId}">
                                    📄 Boleta PDF
                                </button>
                                <button class="btn-secondary btn-sm" data-payment-action="receipt" data-user-id="${record.user.id}" data-payment-id="${record.paymentId}">
                                    ${record.payment.receiptPhotoUrl ? "📎 Recibo" : "📷 Adjuntar recibo"}
                                </button>
                            </div>
                        `;
                    }
                    const statusTd = rows[index].querySelector('td:nth-last-child(2)');
                    if (statusTd) {
                        statusTd.innerHTML = '<span class="badge badge-success">Pagado</span>';
                    }
                }
            });
        } catch (e) {
            console.error('Error mapping payment IDs:', e);
        }
    },

    openExternalDiscountModal() {
        const availableRecords = this.records.filter((record) => !record.isPaid);
        if (availableRecords.length === 0) {
            window.App.showToast(
                'No hay empleados pendientes de pago en este periodo. Selecciona otro mes antes de registrar el descuento.',
                'warning'
            );
            return;
        }

        const year = Number(this.filters.year);
        const month = Number(this.filters.month);
        const monthText = String(month).padStart(2, '0');
        const lastDay = new Date(year, month, 0).getDate();
        const minDate = `${year}-${monthText}-01`;
        const maxDate = `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`;
        const now = new Date();
        const defaultDate =
            now.getFullYear() === year && now.getMonth() + 1 === month
                ? `${year}-${monthText}-${String(now.getDate()).padStart(2, '0')}`
                : minDate;
        const employeeOptions = availableRecords
            .map(
                (record) => `
            <option value="${record.user.id}">${this.escapeHtml(`${record.user.firstName} ${record.user.lastName}`)}</option>
        `
            )
            .join('');

        const modalContent = `
            <form id="external-discount-form" class="mt-2">
                <p class="text-muted text-sm mb-3">El descuento se guardará como pendiente. Debe aprobarse en Gestión laboral antes de participar en la nómina del periodo.</p>

                <div class="form-group">
                    <label for="discount-user">Empleado</label>
                    <select id="discount-user" class="form-control" required>
                        <option value="">Selecciona un empleado...</option>
                        ${employeeOptions}
                    </select>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="discount-type">Tipo de descuento</label>
                        <select id="discount-type" class="form-control" required>
                            <option value="SALARY_ADVANCE">Adelanto de sueldo</option>
                            <option value="LOAN">Préstamo</option>
                            <option value="COMPANY_DAMAGE">Daño o pérdida de la empresa</option>
                            <option value="UNJUSTIFIED_ABSENCE">Ausencia injustificada</option>
                            <option value="OTHER">Otro descuento</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="discount-amount">Monto (Bs.)</label>
                        <input id="discount-amount" class="form-control" type="number" min="0.01" step="0.01" required placeholder="0.00">
                    </div>
                </div>

                <div class="form-group">
                    <label for="discount-date">Fecha del descuento</label>
                    <input id="discount-date" class="form-control" type="date" min="${minDate}" max="${maxDate}" value="${defaultDate}" required>
                    <small class="text-muted">Debe pertenecer al periodo ${monthText}/${year}.</small>
                </div>

                <div class="form-group">
                    <label for="discount-description">Descripción / motivo</label>
                    <input id="discount-description" class="form-control" maxlength="250" required placeholder="Ej.: cuota de préstamo correspondiente al mes">
                </div>

                <div class="form-group">
                    <label for="discount-reference">Referencia o documento (opcional)</label>
                    <input id="discount-reference" class="form-control" maxlength="250" placeholder="Ej.: contrato PR-015, factura 204">
                </div>

                <div class="form-group">
                    <label for="discount-notes">Observaciones (opcional)</label>
                    <textarea id="discount-notes" class="form-control" maxlength="1000" rows="2" placeholder="Información adicional del descuento"></textarea>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn-secondary" id="btn-cancel-external-discount">Cancelar</button>
                    <button type="submit" class="btn-primary">Guardar descuento</button>
                </div>
            </form>
        `;

        window.App.showModal('Registrar descuento externo', modalContent);
        document
            .getElementById('btn-cancel-external-discount')
            .addEventListener('click', () => window.App.hideModal());
        document
            .getElementById('external-discount-form')
            .addEventListener('submit', async (event) => {
                event.preventDefault();
                const submit = event.submitter;
                if (submit.disabled) return;

                const data = {
                    userId: Number(document.getElementById('discount-user').value),
                    type: document.getElementById('discount-type').value,
                    amount: Number(document.getElementById('discount-amount').value),
                    discountDate: document.getElementById('discount-date').value,
                    description: document.getElementById('discount-description').value.trim(),
                    documentReference: document.getElementById('discount-reference').value.trim(),
                    notes: document.getElementById('discount-notes').value.trim(),
                };

                submit.disabled = true;
                const previousText = submit.textContent;
                submit.textContent = 'Guardando...';
                try {
                    await window.api.createDiscount(data);
                    window.App.hideModal();
                    window.App.showToast(
                        'Descuento registrado como pendiente. Apruébalo en Gestión laboral para aplicarlo.',
                        'success'
                    );
                    await this.loadPayroll();
                } catch (error) {
                    window.App.showToast(
                        'No se pudo registrar el descuento: ' + error.message,
                        'error'
                    );
                } finally {
                    if (document.body.contains(submit)) {
                        submit.disabled = false;
                        submit.textContent = previousText;
                    }
                }
            });
    },

    confirmPayment(record) {
        const empName = `${record.user.firstName} ${record.user.lastName}`;
        const months = [
            'Enero',
            'Febrero',
            'Marzo',
            'Abril',
            'Mayo',
            'Junio',
            'Julio',
            'Agosto',
            'Septiembre',
            'Octubre',
            'Noviembre',
            'Diciembre',
        ];
        const monthName = months[this.filters.month - 1];

        const modalContent = `
            <div class="mt-2">
                <p>¿Estás seguro de que deseas procesar el pago de salarios para <strong>${this.escapeHtml(empName)}</strong>?</p>
                
                <div class="card mt-3 mb-3" style="background: var(--tint); border: 1px solid var(--glass-border); padding: 12px 16px;">
                    <div class="flex-between py-1">
                        <span class="text-muted">Período:</span>
                        <span>${monthName} de ${this.filters.year}</span>
                    </div>
                    <div class="flex-between py-1">
                        <span class="text-muted">${
                            record.payScheme === 'DAILY'
                                ? `Días trabajados (${record.daysWorked} × ${window.App.formatCurrency(record.dailyRate)}):`
                                : 'Salario Base Mensual:'
                        }</span>
                        <span>${window.App.formatCurrency(record.monthlySalary)}</span>
                    </div>
                    <div class="flex-between py-1">
                        <span class="text-muted">Tarifa por hora:</span>
                        <span>${window.App.formatCurrency(record.hourlyRate)}</span>
                    </div>
                    <div class="flex-between py-1">
                        <span class="text-muted">Horas extra aprobadas:</span>
                        <span>${(record.overtimes || []).reduce((sum, item) => sum + Number(item.hours || 0), 0).toFixed(2)} h / <strong class="text-success">+${window.App.formatCurrency(record.overtimeAmount || 0)}</strong></span>
                    </div>
                    <div class="flex-between py-1">
                        <span class="text-muted" title="${this.escapeHtml((record.extraDays || []).map((d) => `${d.date.split('-').reverse().join('/')} (${d.reason})`).join(', '))}">Domingos y feriados trabajados:</span>
                        <span>${(record.extraDays || []).length} × ${window.App.formatCurrency(record.extraDayRate || 0)} / <strong class="text-success">+${window.App.formatCurrency(record.extraDaysAmount || 0)}</strong></span>
                    </div>
                    <div class="flex-between py-1 font-weight-semibold">
                        <span class="text-muted">Total ingresos:</span>
                        <span class="text-success">${window.App.formatCurrency(record.totalIncome || record.grossPay)}</span>
                    </div>
                    <div class="flex-between py-1">
                        <span class="text-muted">Descuento Retrasos (${record.totalDelayMinutes} min):</span>
                        <span class="text-danger">-${window.App.formatCurrency(record.discountAmount)}</span>
                    </div>
                    <div class="flex-between py-1">
                        <span class="text-muted">Anticipos salariales:</span>
                        <span class="text-danger">-${window.App.formatCurrency((record.discounts || []).filter((item) => item.type === 'SALARY_ADVANCE').reduce((sum, item) => sum + Number(item.amount || 0), 0))}</span>
                    </div>
                    <div class="flex-between py-1">
                        <span class="text-muted">Préstamos:</span>
                        <span class="text-danger">-${window.App.formatCurrency((record.discounts || []).filter((item) => item.type === 'LOAN').reduce((sum, item) => sum + Number(item.amount || 0), 0))}</span>
                    </div>
                    <div class="flex-between py-1">
                        <span class="text-muted">Otros descuentos:</span>
                        <span class="text-danger">-${window.App.formatCurrency((record.discounts || []).filter((item) => !['SALARY_ADVANCE', 'LOAN'].includes(item.type)).reduce((sum, item) => sum + Number(item.amount || 0), 0))}</span>
                    </div>
                    <div class="flex-between py-1 font-weight-semibold">
                        <span class="text-muted">Total descuentos:</span>
                        <span class="text-danger">-${window.App.formatCurrency(record.totalDiscounts || record.discountAmount)}</span>
                    </div>
                    <div class="flex-between py-1 font-weight-bold" style="border-top: 1px dashed var(--glass-border); margin-top: 8px; padding-top: 8px;">
                        <span>Líquido Pagable (Neto):</span>
                        <span class="text-success">${window.App.formatCurrency(record.netPay)}</span>
                    </div>
                </div>

                ${
                    (record.missingDays || []).length
                        ? `<div class="alert alert-warning mb-3">
                               <strong>${record.missingDays.length} ${record.missingDays.length === 1 ? 'día' : 'días'} con turno sin marcación:</strong>
                               ${this.escapeHtml(record.missingDays.map((d) => d.split('-').reverse().join('/')).join(', '))}.<br>
                               No se descuentan solos. Si fueron faltas, cancele y cárguelas en
                               <em>Horas extra y descuentos</em> antes de pagar.
                           </div>`
                        : ''
                }
                <p class="text-muted text-sm">
                    ⚠️ Al confirmar:<br>
                    1. Se guardará la transacción en la base de datos de manera definitiva.<br>
                    2. Se generará la boleta en PDF, disponible para descarga acá y en la
                       aplicación del empleado.<br>
                    3. Se bloquearán pagos duplicados para este mes.
                </p>

                <div class="flex-end gap-2 mt-4">
                    <button class="btn-secondary" id="btn-cancel-payment">Cancelar</button>
                    <button class="btn-success" id="btn-confirm-pay-exec">💵 Confirmar y Pagar</button>
                </div>
            </div>
        `;

        window.App.showModal('Confirmar Pago de Salario', modalContent);
        document
            .getElementById('btn-cancel-payment')
            .addEventListener('click', () => window.App.hideModal());

        document.getElementById('btn-confirm-pay-exec').addEventListener('click', async () => {
            const btn = document.getElementById('btn-confirm-pay-exec');
            btn.disabled = true;
            btn.textContent = 'Procesando pago...';

            try {
                const res = await window.api.payEmployee(
                    record.user.id,
                    this.filters.month,
                    this.filters.year
                );
                const payment = res.data || res;

                // El pago siempre queda registrado; lo que puede fallar es la
                // generación del PDF, y eso hay que decirlo con claridad.
                if (payment.pdfAvailable) {
                    window.App.showToast(
                        'Pago registrado. La boleta ya se puede descargar.',
                        'success'
                    );
                } else {
                    window.App.showToast(
                        `Pago registrado, pero la boleta no se pudo generar${payment.pdfError ? `: ${payment.pdfError}` : ''}`,
                        'warning'
                    );
                }

                window.App.hideModal();
                await this.loadPayroll();
            } catch (error) {
                window.App.showToast('Error al procesar pago: ' + error.message, 'error');
                btn.disabled = false;
                btn.textContent = '💵 Confirmar y Pagar';
            }
        });
    },

    async downloadPdf(paymentId, employeeName) {
        if (!paymentId) {
            window.App.showToast('ID de pago no disponible', 'warning');
            return;
        }
        window.App.showToast('Descargando comprobante PDF...', 'info');
        try {
            const filename = `boleta-de-pago-${employeeName.replace(/\s+/g, '-')}-${this.filters.month}-${this.filters.year}.pdf`;
            await window.api.downloadPaymentPdf(paymentId, filename);
            window.App.showToast('Comprobante descargado correctamente', 'success');
        } catch (error) {
            window.App.showToast('Error al descargar PDF: ' + error.message, 'error');
        }
    },
};
