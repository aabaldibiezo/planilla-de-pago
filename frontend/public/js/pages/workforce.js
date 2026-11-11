/**
 * WorkforcePage - Horas extra, descuentos, compensaciones y auditoría.
 * Toda cifra financiera proviene de la API; la vista solo representa resultados.
 */
window.WorkforcePage = {
    tab: 'overtime',
    users: [],
    rows: [],

    labels: {
        SAME_RATE: 'Tarifa normal',
        LOWER_RATE: 'Tarifa reducida',
        HIGHER_RATE: 'Tarifa incrementada',
        MULTIPLIER: 'Multiplicador',
        FIXED_AMOUNT: 'Monto fijo',
        TIME_OFF: 'Tiempo compensatorio',
        UNPAID: 'No pagada',
        PENDING: 'Pendiente',
        APPROVED: 'Aprobada',
        REJECTED: 'Rechazada',
        CANCELLED: 'Cancelada',
        AVAILABLE: 'Disponible',
        PARTIALLY_USED: 'Uso parcial',
        USED: 'Utilizada',
        UNJUSTIFIED_DELAY: 'Retraso injustificado',
        SALARY_ADVANCE: 'Anticipo salarial',
        COMPANY_DAMAGE: 'Daño a la empresa',
        LOAN: 'Préstamo',
        UNJUSTIFIED_ABSENCE: 'Ausencia injustificada',
        OTHER: 'Otro',
    },

    esc(value) {
        return window.UI.escapeHtml(value == null ? '' : String(value));
    },
    money(value) {
        return window.App.formatCurrency(Number(value || 0));
    },
    date(value) {
        return value ? window.App.formatDate(value) : '—';
    },
    employee(row) {
        return row.user ? `${row.user.firstName} ${row.user.lastName}` : 'Empleado';
    },
    badge(status) {
        const css =
            status === 'APPROVED' || status === 'AVAILABLE'
                ? 'success'
                : status === 'REJECTED' || status === 'CANCELLED'
                  ? 'danger'
                  : 'warning';
        return `<span class="badge badge-${css}">${this.labels[status] || status}</span>`;
    },

    async render() {
        return `
            <div class="page-header flex-between">
                <div><h1 class="page-title">⚙ Gestión laboral</h1><p class="page-subtitle">Administra horas extra, descuentos, compensaciones y el registro de cambios.</p></div>
                <button class="btn-primary" id="workforce-primary-action">＋ Registrar hora extra</button>
            </div>
            <div class="card mb-4">
                <div class="flex gap-1 workforce-tabs">
                    <button class="btn-secondary workforce-tab" data-tab="overtime">Horas extra</button>
                    <button class="btn-secondary workforce-tab" data-tab="discounts">Descuentos</button>
                    <button class="btn-secondary workforce-tab" data-tab="compensations">Compensaciones</button>
                    <button class="btn-secondary workforce-tab" data-tab="audit">Registro de cambios</button>
                </div>
            </div>
            <div class="card mb-4" id="workforce-filters"></div>
            <div class="card" id="workforce-content"><div class="text-center text-muted p-4">Cargando información…</div></div>`;
    },

    async init() {
        const response = await window.api.getUsers();
        this.users = (response.data || []).filter((user) => user.isActive && user.role !== 'ADMIN');
        document
            .querySelectorAll('.workforce-tab')
            .forEach((button) =>
                button.addEventListener('click', () => this.switchTab(button.dataset.tab))
            );
        document
            .getElementById('workforce-primary-action')
            .addEventListener('click', () => this.primaryAction());
        await this.switchTab(this.tab);
    },

    async switchTab(tab) {
        this.tab = tab;
        document
            .querySelectorAll('.workforce-tab')
            .forEach((button) =>
                button.classList.toggle('btn-primary', button.dataset.tab === tab)
            );
        const action = document.getElementById('workforce-primary-action');
        action.classList.toggle('hidden', !['overtime', 'discounts'].includes(tab));
        action.textContent =
            tab === 'overtime' ? '＋ Registrar hora extra' : '＋ Registrar descuento';
        this.renderFilters();
        await this.load();
    },

    employeeOptions(selected = '') {
        return `<option value="">Todos los empleados</option>${this.users.map((user) => `<option value="${user.id}" ${Number(selected) === user.id ? 'selected' : ''}>${this.esc(`${user.firstName} ${user.lastName}`)}</option>`).join('')}`;
    },

    renderFilters() {
        const container = document.getElementById('workforce-filters');
        if (this.tab === 'audit') {
            // El filtro de registros manuales existe para vigilar con qué
            // frecuencia se está usando la vía que saltea el geocerco.
            container.innerHTML = `
                <div class="filters-row flex gap-2">
                    <div class="form-group flex-1"><label>Empleado afectado</label><select id="wf-user" class="form-control">${this.employeeOptions()}</select></div>
                    <div class="form-group flex-1"><label>Desde</label><input id="wf-from" type="date" class="form-control"></div>
                    <div class="form-group flex-1"><label>Hasta</label><input id="wf-to" type="date" class="form-control"></div>
                    <div class="form-group flex-align-end"><button id="wf-filter" class="btn-primary">Filtrar</button></div>
                </div>
                <label class="opcion-radio mt-2">
                    <input type="checkbox" id="wf-solo-manuales">
                    <span>Solo registros manuales de asistencia</span>
                </label>`;
        } else {
            const statuses =
                this.tab === 'compensations'
                    ? ['AVAILABLE', 'PARTIALLY_USED', 'USED', 'CANCELLED']
                    : ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
            container.innerHTML = `<div class="filters-row flex gap-2"><div class="form-group flex-1"><label>Empleado</label><select id="wf-user" class="form-control">${this.employeeOptions()}</select></div><div class="form-group flex-1"><label>Estado</label><select id="wf-status" class="form-control"><option value="">Todos</option>${statuses.map((status) => `<option value="${status}">${this.labels[status]}</option>`).join('')}</select></div><div class="form-group flex-align-end"><button id="wf-filter" class="btn-primary">Filtrar</button></div></div>`;
        }
        document.getElementById('wf-filter').addEventListener('click', () => this.load());
        document.getElementById('wf-solo-manuales')?.addEventListener('change', () => this.load());
    },

    filters() {
        const userId = document.getElementById('wf-user')?.value;
        const status = document.getElementById('wf-status')?.value;
        const from = document.getElementById('wf-from')?.value;
        const to = document.getElementById('wf-to')?.value;
        const soloManuales = document.getElementById('wf-solo-manuales')?.checked;

        return Object.fromEntries(
            Object.entries({
                userId,
                employeeId: this.tab === 'audit' ? userId : '',
                status,
                from,
                to,
                // El backend filtra por acción exacta; MANUAL_CLOCK_IN es la que
                // registra `manualClockIn` al saltear el geocerco.
                action: this.tab === 'audit' && soloManuales ? 'MANUAL_CLOCK_IN' : '',
            }).filter(([, value]) => value)
        );
    },

    async load() {
        const content = document.getElementById('workforce-content');
        content.innerHTML = '<div class="text-center text-muted p-4">Consultando la API…</div>';
        try {
            const method = {
                overtime: 'getOvertime',
                discounts: 'getDiscounts',
                compensations: 'getCompensations',
                audit: 'getAudit',
            }[this.tab];
            const response = await window.api[method](this.filters());
            this.rows = response.data || [];
            if (this.tab === 'audit') await this.cargarContextoAuditoria();
            this.renderTable();
        } catch (error) {
            content.innerHTML = `<div class="text-center text-danger p-4">${this.esc(error.message)}</div>`;
        }
    },

    /**
     * Nombres de empleados y sedes para que la auditoría diga "Carla" y
     * "Balsoft" en lugar de números. Incluye a los dados de baja: el registro
     * habla también de ellos.
     */
    async cargarContextoAuditoria() {
        if (this.contextoAuditoria) return;
        const [usuarios, sedes] = await Promise.all([
            window.api.getUsers().catch(() => ({ data: [] })),
            window.api.get('/worksites?includeInactive=true').catch(() => ({ data: [] })),
        ]);
        this.contextoAuditoria = {
            empleados: new Map((usuarios.data || []).map((u) => [u.id, `${u.firstName} ${u.lastName}`])),
            sedes: new Map((sedes.data || []).map((s) => [s.id, s.name])),
        };
    },

    renderTable() {
        const content = document.getElementById('workforce-content');
        const renderers = {
            overtime: () => this.overtimeTable(),
            discounts: () => this.discountTable(),
            compensations: () => this.compensationTable(),
            audit: () => this.auditTable(),
        };
        content.innerHTML = renderers[this.tab]();
        content
            .querySelectorAll('[data-action]')
            .forEach((button) => button.addEventListener('click', () => this.handleAction(button)));
    },

    empty(colspan) {
        return `<tr><td colspan="${colspan}" class="text-center text-muted">No existen registros para los filtros seleccionados.</td></tr>`;
    },

    overtimeTable() {
        const body = this.rows.length
            ? this.rows
                  .map((row) => {
                      const actions =
                          row.status === 'PENDING'
                              ? `<div class="flex gap-1"><button class="btn-secondary btn-sm" data-action="edit-overtime" data-id="${row.id}">Editar</button><button class="btn-primary btn-sm" data-action="approve-overtime" data-id="${row.id}">Aprobar</button><button class="btn-danger btn-sm" data-action="reject-overtime" data-id="${row.id}">Rechazar</button><button class="btn-danger btn-sm" data-action="delete-overtime" data-id="${row.id}">Eliminar</button></div>`
                              : '—';
                      const approvedBy = row.approvedByUser
                          ? `${row.approvedByUser.firstName} ${row.approvedByUser.lastName}`
                          : '—';
                      return `<tr><td>${this.esc(this.employee(row))}</td><td>${this.date(row.workDate)}</td><td>${this.esc(row.startTime)}</td><td>${this.esc(row.endTime)}</td><td>${Number(row.hours).toFixed(2)}</td><td>${this.esc(this.labels[row.paymentMode] || row.paymentMode)}</td><td>${Number(row.multiplier).toFixed(2)}</td><td>${this.badge(row.status)}</td><td>${this.money(row.calculatedAmount)}</td><td title="${this.esc(row.notes)}">${this.esc(row.notes || '—')}</td><td>${this.esc(approvedBy)}${row.paymentId ? `<small class="payment-detail-count">Pago #${row.paymentId}</small>` : ''}</td><td>${actions}</td></tr>`;
                  })
                  .join('')
            : this.empty(12);
        return `<div class="card-header"><h3 class="card-title">Historial de horas extra</h3></div><div class="table-container"><table class="table"><thead><tr><th>Empleado</th><th>Fecha</th><th>Inicio</th><th>Fin</th><th>Horas</th><th>Tipo</th><th>Multiplicador</th><th>Estado</th><th>Monto</th><th>Observaciones</th><th>Aprobación/Pago</th><th>Acciones</th></tr></thead><tbody>${body}</tbody></table></div>`;
    },

    discountTable() {
        const body = this.rows.length
            ? this.rows
                  .map((row) => {
                      const actions =
                          row.status === 'PENDING'
                              ? `<div class="flex gap-1"><button class="btn-primary btn-sm" data-action="approve-discount" data-id="${row.id}">Aprobar</button><button class="btn-danger btn-sm" data-action="reject-discount" data-id="${row.id}">Rechazar</button></div>`
                              : '—';
                      return `<tr><td>${this.esc(this.employee(row))}</td><td>${this.date(row.discountDate)}</td><td>${this.esc(this.labels[row.type] || row.type)}</td><td>${this.esc(row.description)}</td><td>${this.money(row.amount)}</td><td>${this.badge(row.status)}</td><td>${this.esc(row.documentReference || '—')}</td><td>${row.paymentId ? `Pago #${row.paymentId}` : 'Pendiente de nómina'}</td><td>${actions}</td></tr>`;
                  })
                  .join('')
            : this.empty(9);
        return `<div class="card-header"><h3 class="card-title">Descuentos y obligaciones</h3></div><div class="table-container"><table class="table"><thead><tr><th>Empleado</th><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Monto</th><th>Estado</th><th>Referencia</th><th>Aplicación</th><th>Acciones</th></tr></thead><tbody>${body}</tbody></table></div>`;
    },

    compensationTable() {
        const body = this.rows.length
            ? this.rows
                  .map(
                      (row) =>
                          `<tr><td>${this.esc(this.employee(row))}</td><td>${this.date(row.generatedAt)}</td><td>${Number(row.generatedHours).toFixed(2)} h</td><td>${Number(row.usedHours).toFixed(2)} h</td><td>${Number(row.remainingHours).toFixed(2)} h</td><td>${this.esc(row.reason)}</td><td>${this.badge(row.status)}</td><td>${['AVAILABLE', 'PARTIALLY_USED'].includes(row.status) ? `<button class="btn-primary btn-sm" data-action="use-compensation" data-id="${row.id}">Utilizar saldo</button>` : '—'}</td></tr>`
                  )
                  .join('')
            : this.empty(8);
        return `<div class="card-header"><h3 class="card-title">Bolsas de tiempo compensatorio</h3></div><div class="table-container"><table class="table"><thead><tr><th>Empleado</th><th>Generada</th><th>Horas generadas</th><th>Usadas</th><th>Saldo</th><th>Motivo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${body}</tbody></table></div>`;
    },

    auditTable() {
        const body = this.rows.length
            ? window.Auditoria.agrupar(this.rows, this.contextoAuditoria)
                  .map(
                      ({ row, frase }) =>
                          `<tr><td class="text-nowrap">${new Date(row.createdAt).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${this.esc(row.actor ? `${row.actor.firstName} ${row.actor.lastName}` : 'Sistema')}</td><td>${this.esc(frase)}</td><td>${this.esc(row.reason || '—')}</td><td class="text-right"><button class="btn-secondary btn-sm" data-action="view-audit" data-id="${row.id}">Ver detalle</button></td></tr>`
                  )
                  .join('')
            : this.empty(5);
        return `<div class="card-header"><h3 class="card-title">Registro de cambios</h3><p class="text-muted text-sm mb-0">Quién hizo cada cambio en el sistema y cuándo.</p></div><div class="table-container"><table class="table"><thead><tr><th>Fecha y hora</th><th>Quién</th><th>Qué hizo</th><th>Motivo</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`;
    },

    primaryAction() {
        this.tab === 'overtime' ? this.openOvertime() : this.openDiscount();
    },

    openOvertime(row = null) {
        const selected = row?.userId || '';
        const today = new Date().toISOString().slice(0, 10);
        window.App.showModal(
            row ? 'Editar hora extra pendiente' : 'Registrar hora extra',
            `
            <form id="overtime-form">
                <div class="form-group"><label>Empleado *</label><select id="ot-user" class="form-control" required><option value="">Seleccione…</option>${this.employeeOptions(selected).replace('<option value="">Todos los empleados</option>', '')}</select></div>
                <div class="form-row"><div class="form-group flex-1"><label>Fecha *</label><input id="ot-date" class="form-control" type="date" value="${row ? String(row.workDate).slice(0, 10) : today}" required></div><div class="form-group flex-1"><label>Horas calculadas</label><input id="ot-hours" class="form-control" value="0.00" disabled></div></div>
                <div class="form-row"><div class="form-group flex-1"><label>Hora inicio *</label><input id="ot-start" class="form-control" type="time" value="${row?.startTime || '18:00'}" required></div><div class="form-group flex-1"><label>Hora fin *</label><input id="ot-end" class="form-control" type="time" value="${row?.endTime || '20:00'}" required></div></div>
                <div class="form-row"><div class="form-group flex-1"><label>Tipo *</label><select id="ot-mode" class="form-control" required>${Object.keys(
                    this.labels
                )
                    .filter((key) =>
                        [
                            'SAME_RATE',
                            'LOWER_RATE',
                            'HIGHER_RATE',
                            'MULTIPLIER',
                            'FIXED_AMOUNT',
                            'TIME_OFF',
                            'UNPAID',
                        ].includes(key)
                    )
                    .map(
                        (key) =>
                            `<option value="${key}" ${row?.paymentMode === key ? 'selected' : ''}>${this.labels[key]}</option>`
                    )
                    .join(
                        ''
                    )}</select></div><div class="form-group flex-1"><label>Multiplicador *</label><input id="ot-multiplier" class="form-control" type="number" min="0.01" step="0.01" value="${Number(row?.multiplier || 1)}" required></div></div>
                <div class="form-group"><label>Monto fijo (solo si corresponde)</label><input id="ot-fixed" class="form-control" type="number" min="0" step="0.01" value="${row?.fixedAmount == null ? '' : Number(row.fixedAmount)}"></div>
                <div class="form-group"><label>Motivo *</label><input id="ot-reason" class="form-control" maxlength="250" value="${this.esc(row?.reason || '')}" required></div>
                <div class="form-group"><label>Observaciones</label><textarea id="ot-notes" class="form-control" maxlength="1000" rows="3">${this.esc(row?.notes || '')}</textarea></div>
                <div class="flex-end gap-1"><button type="button" class="btn-secondary" id="ot-cancel">Cancelar</button><button class="btn-primary" type="submit">Guardar</button></div>
            </form>`
        );
        const updateHours = () => {
            const start = document.getElementById('ot-start').value.split(':').map(Number);
            const end = document.getElementById('ot-end').value.split(':').map(Number);
            if (start.length < 2 || end.length < 2) return;

            let minutes = end[0] * 60 + end[1] - start[0] * 60 - start[1];
            if (minutes <= 0) minutes += 1440;

            document.getElementById('ot-hours').value = (minutes / 60).toFixed(2);
        };

        ['ot-start', 'ot-end'].forEach((id) =>
            document.getElementById(id).addEventListener('change', updateHours)
        );
        updateHours();

        document
            .getElementById('ot-cancel')
            .addEventListener('click', () => window.App.hideModal());

        document.getElementById('overtime-form').addEventListener('submit', async (event) => {
            event.preventDefault();

            const fixedValue = document.getElementById('ot-fixed').value;
            const data = {
                userId: Number(document.getElementById('ot-user').value),
                workDate: document.getElementById('ot-date').value,
                startTime: document.getElementById('ot-start').value,
                endTime: document.getElementById('ot-end').value,
                paymentMode: document.getElementById('ot-mode').value,
                multiplier: Number(document.getElementById('ot-multiplier').value),
                fixedAmount: fixedValue === '' ? null : Number(fixedValue),
                reason: document.getElementById('ot-reason').value.trim(),
                notes: document.getElementById('ot-notes').value.trim(),
            };

            try {
                if (row) {
                    await window.api.updateOvertime(row.id, data);
                } else {
                    await window.api.createOvertime(data);
                }
                window.App.hideModal();
                window.App.showToast('Hora extra guardada correctamente.', 'success');
                await this.load();
            } catch (error) {
                window.App.showToast(error.message, 'error');
            }
        });
    },

    openDiscount() {
        window.App.showModal(
            'Registrar descuento',
            `<form id="wf-discount-form"><div class="form-group"><label>Empleado *</label><select id="wd-user" class="form-control" required>${this.employeeOptions().replace('Todos los empleados', 'Seleccione…')}</select></div><div class="form-row"><div class="form-group flex-1"><label>Tipo *</label><select id="wd-type" class="form-control">${['SALARY_ADVANCE', 'COMPANY_DAMAGE', 'LOAN', 'UNJUSTIFIED_ABSENCE', 'OTHER'].map((key) => `<option value="${key}">${this.labels[key]}</option>`).join('')}</select></div><div class="form-group flex-1"><label>Monto *</label><input id="wd-amount" class="form-control" type="number" min="0.01" step="0.01" required></div></div><div class="form-group"><label>Fecha *</label><input id="wd-date" class="form-control" type="date" value="${new Date().toISOString().slice(0, 10)}" required></div><div class="form-group"><label>Descripción *</label><input id="wd-description" class="form-control" maxlength="250" required></div><div class="form-group"><label>Referencia</label><input id="wd-reference" class="form-control" maxlength="250"></div><div class="form-group"><label>Observaciones</label><textarea id="wd-notes" class="form-control" maxlength="1000"></textarea></div><div class="flex-end gap-1"><button type="button" id="wd-cancel" class="btn-secondary">Cancelar</button><button class="btn-primary">Guardar pendiente</button></div></form>`
        );
        document
            .getElementById('wd-cancel')
            .addEventListener('click', () => window.App.hideModal());

        document.getElementById('wf-discount-form').addEventListener('submit', async (event) => {
            event.preventDefault();

            try {
                await window.api.createDiscount({
                    userId: Number(document.getElementById('wd-user').value),
                    type: document.getElementById('wd-type').value,
                    amount: Number(document.getElementById('wd-amount').value),
                    discountDate: document.getElementById('wd-date').value,
                    description: document.getElementById('wd-description').value.trim(),
                    documentReference: document.getElementById('wd-reference').value.trim(),
                    notes: document.getElementById('wd-notes').value.trim(),
                });
                window.App.hideModal();
                window.App.showToast('Descuento registrado.', 'success');
                await this.load();
            } catch (error) {
                window.App.showToast(error.message, 'error');
            }
        });
    },

    async handleAction(button) {
        const id = Number(button.dataset.id);
        const row = this.rows.find((item) => Number(item.id) === id);
        const action = button.dataset.action;

        if (action === 'edit-overtime') {
            return this.openOvertime(row);
        }

        if (action === 'view-audit') {
            return window.App.showModal(
                'Detalle del cambio',
                window.Auditoria.detalleHtml(row, this.contextoAuditoria)
            );
        }

        if (action === 'use-compensation') {
            const hours = prompt(
                `Horas a utilizar (saldo ${Number(row.remainingHours).toFixed(2)}):`
            );
            if (hours == null) return;

            try {
                await window.api.useCompensation(id, { hours: Number(hours) });
                window.App.showToast('Compensación actualizada.', 'success');
                await this.load();
            } catch (error) {
                window.App.showToast(error.message, 'error');
            }
            return;
        }

        const actions = {
            'approve-overtime': () => window.api.setOvertimeStatus(id, 'APPROVED'),
            'reject-overtime': () => window.api.setOvertimeStatus(id, 'REJECTED'),
            'approve-discount': () => window.api.setDiscountStatus(id, 'APPROVED'),
            'reject-discount': () => window.api.setDiscountStatus(id, 'REJECTED'),
            'delete-overtime': () => window.api.deleteOvertime(id),
        };
        if (!actions[action]) return;

        const destructive = ['reject-overtime', 'reject-discount', 'delete-overtime'].includes(
            action
        );
        const message = destructive
            ? '¿Confirma esta operación? No se aplicará a la nómina.'
            : '¿Confirma la aprobación? El concepto participará en la nómina.';
        if (!confirm(message)) return;

        try {
            await actions[action]();
            window.App.showToast('Operación realizada correctamente.', 'success');
            await this.load();
        } catch (error) {
            window.App.showToast(error.message, 'error');
        }
    },
};
