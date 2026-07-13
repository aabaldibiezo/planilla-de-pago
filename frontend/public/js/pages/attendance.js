/**
 * AttendancePage - Gestión de Asistencia y Retrasos (Admin Only)
 */
window.AttendancePage = {
    filters: {
        userId: '',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
    },
    users: [],
    entries: [],

    escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[character]);
    },

    async render() {
        return `
            <div class="page-header flex-between">
                <div>
                    <h1 class="page-title">📅 Control de Asistencia</h1>
                    <p class="page-subtitle">Registra la hora de ingreso y salida real de los empleados y calcula automáticamente las horas trabajadas y minutos de retraso.</p>
                </div>
                <button class="btn-primary" id="btn-new-attendance">
                    ➕ Registrar Entrada
                </button>
            </div>

            <!-- Resumen rápido mensual -->
            <div class="stats-grid mb-4" id="attendance-summary">
                <div class="stat-card">
                    <div class="stat-icon">👥</div>
                    <div class="stat-info">
                        <span class="stat-label">Asistencias este Mes</span>
                        <h3 class="stat-value" id="summary-total-entries">0</h3>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⏱️</div>
                    <div class="stat-info">
                        <span class="stat-label">Retrasos sin Justificar (Minutos)</span>
                        <h3 class="stat-value text-warning" id="summary-total-delays">0 min</h3>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⌛</div>
                    <div class="stat-info">
                        <span class="stat-label">Horas Totales Trabajadas</span>
                        <h3 class="stat-value text-success" id="summary-total-hours">0.0 hrs</h3>
                    </div>
                </div>
            </div>

            <!-- Filters Section -->
            <div class="card mb-4">
                <div class="filters-row flex gap-2">
                    <div class="form-group flex-1">
                        <label for="filter-user">Empleado</label>
                        <select id="filter-user" class="form-control">
                            <option value="">Todos los Empleados</option>
                        </select>
                    </div>
                    <div class="form-group flex-1">
                        <label for="filter-month">Mes</label>
                        <select id="filter-month" class="form-control">
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
                        <label for="filter-year">Año</label>
                        <input type="number" id="filter-year" class="form-control" value="${this.filters.year}" min="2020" max="2030">
                    </div>
                    <div class="form-group flex-align-end flex gap-1">
                        <button class="btn-secondary" id="btn-clear-filters" style="height: 42px;">Limpiar</button>
                        <button class="btn-primary" id="btn-apply-filters" style="height: 42px;">Filtrar</button>
                    </div>
                </div>
            </div>

            <!-- Attendance Table -->
            <div class="card">
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Empleado</th>
                                <th>Fecha</th>
                                <th>Hora Programada</th>
                                <th>Entrada</th>
                                <th>Salida</th>
                                <th>Horas Trabajadas</th>
                                <th>Retraso (minutos)</th>
                                <th>Notas</th>
                                <th class="text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="attendance-table-body">
                            <tr>
                                <td colspan="9" class="text-center text-muted">Cargando registros...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async init() {
        // Set default month select value
        document.getElementById('filter-month').value = this.filters.month;
        document.getElementById('filter-year').value = this.filters.year;

        // Load employees list
        try {
            const res = await window.api.getUsers();
            this.users = (res.data || []).filter(u => u.isActive && u.role !== 'ADMIN');
            const selectUser = document.getElementById('filter-user');
            if (selectUser) {
                selectUser.innerHTML = '<option value="">Todos los Empleados</option>' + 
                    this.users.map(u => `<option value="${u.id}">${u.firstName} ${u.lastName}</option>`).join('');
            }
        } catch (e) {
            console.error('Error al cargar empleados:', e);
        }

        // Add events
        document.getElementById('btn-new-attendance').addEventListener('click', () => this.openAttendanceModal());
        
        document.getElementById('btn-apply-filters').addEventListener('click', () => {
            this.filters.userId = document.getElementById('filter-user').value;
            this.filters.month = document.getElementById('filter-month').value;
            this.filters.year = document.getElementById('filter-year').value;
            this.loadEntries();
        });

        document.getElementById('btn-clear-filters').addEventListener('click', () => {
            const now = new Date();
            this.filters.userId = '';
            this.filters.month = now.getMonth() + 1;
            this.filters.year = now.getFullYear();
            
            document.getElementById('filter-user').value = '';
            document.getElementById('filter-month').value = this.filters.month;
            document.getElementById('filter-year').value = this.filters.year;
            
            this.loadEntries();
        });

        document.getElementById('attendance-table-body').addEventListener('click', (event) => {
            const button = event.target.closest('[data-attendance-action]');
            if (!button) return;

            const entry = this.entries.find(item => item.id === Number(button.dataset.entryId));
            if (!entry) return;

            const empName = entry.user
                ? `${entry.user.firstName} ${entry.user.lastName}`
                : 'Empleado';

            switch (button.dataset.attendanceAction) {
                case 'clock-out':
                    this.clockOut(Number(button.dataset.sessionId), empName);
                    break;
                case 'justify-delay':
                    this.openJustificationModal(entry);
                    break;
                case 'notes':
                    this.openAttendanceModal(entry);
                    break;
            }
        });

        await this.loadEntries();
    },

    async loadEntries() {
        const tbody = document.getElementById('attendance-table-body');
        if (!tbody) return;

        try {
            const response = await window.api.getAttendances(this.filters);
            const entries = response.data || [];
            this.entries = entries;

            this.updateSummary(entries);

            if (entries.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-center text-muted">
                            No hay registros de asistencia en el período seleccionado.
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = entries.map(entry => {
                const empName = entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'Desconocido';
                const delay = parseInt(entry.delayMinutes) || 0;
                const hours = parseFloat(entry.hoursWorked) || 0;
                const delayedSessions = (entry.sessions || []).filter(session => Number(session.delayMinutes) > 0);
                const openSession = (entry.sessions || []).find(session => !session.clockOut);
                const justifiedSessions = delayedSessions.filter(session => session.justificationStatus === 'JUSTIFIED');
                const justifiedMinutes = justifiedSessions.reduce((total, session) => total + Number(session.delayMinutes || 0), 0);
                const pendingDelay = Math.max(0, delay - justifiedMinutes);
                
                let delayClass = 'text-success';
                let delayText = 'A tiempo';
                
                if (pendingDelay > 0) {
                    delayClass = 'text-danger font-weight-semibold';
                    delayText = `${pendingDelay} min`;
                } else if (delay > 0) {
                    delayText = '';
                }

                let delayStatus = '';
                let justifyDelayBtn = '';
                if (delay > 0 && delayedSessions.length > 0) {
                    const allJustified = delayedSessions.every(session => session.justificationStatus === 'JUSTIFIED');
                    const allRejected = delayedSessions.every(session => session.justificationStatus === 'REJECTED');
                    const reviewers = [...new Set(justifiedSessions
                        .map(session => session.justificationReviewedByUser)
                        .filter(Boolean)
                        .map(user => `${user.firstName} ${user.lastName}`))];
                    const reasons = [...new Set(justifiedSessions
                        .map(session => session.justificationReason)
                        .filter(Boolean))];
                    const notes = [...new Set(justifiedSessions
                        .map(session => session.justificationNotes)
                        .filter(Boolean))];
                    const justificationDetail = `
                        ${reasons.map(reason => `<small class="delay-justification"><strong>Motivo:</strong> ${this.escapeHtml(reason)}</small>`).join('')}
                        ${notes.map(note => `<small class="delay-justification"><strong>Observación:</strong> ${this.escapeHtml(note)}</small>`).join('')}
                        ${reviewers.length ? `<small class="delay-reviewer">Perdonado por ${reviewers.map(name => this.escapeHtml(name)).join(', ')}</small>` : ''}
                    `;

                    if (allJustified) {
                        delayStatus = `
                            <span class="badge badge-success">Justificado</span>
                            ${justificationDetail}
                        `;
                    } else if (allRejected) {
                        delayStatus = '<span class="badge badge-danger">No justificado</span>';
                    } else {
                        delayStatus = `
                            ${justifiedMinutes > 0 ? `<span class="badge badge-success">${justifiedMinutes} min justificados</span>${justificationDetail}` : ''}
                            ${pendingDelay > 0 ? '<span class="badge badge-warning">Pendiente</span>' : ''}
                        `;
                    }

                    justifyDelayBtn = `
                        <button class="btn-secondary btn-sm"
                            data-attendance-action="justify-delay"
                            data-entry-id="${entry.id}"
                            title="Justificar los ${delay} minutos de retraso"
                            aria-label="Justificar retraso de ${empName}">${allJustified ? '✏️ Editar justificación' : '✅ Justificar'}</button>
                    `;
                }

                const exitText = openSession
                    ? '<span class="badge badge-warning">En curso</span>'
                    : entry.actualExit 
                    ? `<span class="badge badge-secondary">${entry.actualExit}</span>` 
                    : '<span class="text-muted">—</span>';

                const hoursText = !openSession && entry.actualExit
                    ? `<span class="font-weight-semibold">${hours.toFixed(2)} hrs</span>`
                    : `<span class="text-muted">${hours.toFixed(2)} hrs acumuladas</span>`;

                // Clock out action button only if still clocked in
                let clockOutBtn = '';
                if (openSession) {
                    clockOutBtn = `<button class="btn-success btn-sm" data-attendance-action="clock-out" data-entry-id="${entry.id}" data-session-id="${openSession.id}" title="Marcar Salida">🚪 Salida</button>`;
                }

                return `
                    <tr id="attendance-row-${entry.id}">
                        <td class="font-weight-medium">${empName}</td>
                        <td>${window.App.formatDate(entry.date)}</td>
                        <td><span class="badge badge-info">${entry.scheduledEntry}</span></td>
                        <td><span class="badge badge-secondary">${entry.actualEntry}</span></td>
                        <td>${exitText}</td>
                        <td>${hoursText}</td>
                        <td>
                            <div class="attendance-delay-control">
                                <span class="${delayClass}">${delayText}</span>
                                ${delayStatus}
                                ${justifyDelayBtn}
                            </div>
                        </td>
                        <td class="text-muted text-sm">${entry.notes || '-'}</td>
                        <td class="text-right">
                            <div class="flex-end gap-1">
                                ${clockOutBtn}
                                <button class="btn-secondary btn-sm" data-attendance-action="notes" data-entry-id="${entry.id}">📝 Notas</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            console.error('Error al cargar asistencia:', e);
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-danger">
                        Error al cargar registros: ${e.message}
                    </td>
                </tr>
            `;
        }
    },

    updateSummary(entries) {
        const totalEntries = entries.length;
        const totalDelayMinutes = entries.reduce((sum, entry) => {
            const justifiedMinutes = (entry.sessions || [])
                .filter(session => session.justificationStatus === 'JUSTIFIED')
                .reduce((total, session) => total + Number(session.delayMinutes || 0), 0);
            return sum + Math.max(0, (parseInt(entry.delayMinutes) || 0) - justifiedMinutes);
        }, 0);
        const totalHoursWorked = entries.reduce((sum, e) => sum + (parseFloat(e.hoursWorked) || 0), 0);

        const elEntries = document.getElementById('summary-total-entries');
        const elDelays = document.getElementById('summary-total-delays');
        const elHours = document.getElementById('summary-total-hours');

        if (elEntries) elEntries.textContent = totalEntries;
        if (elDelays) elDelays.textContent = `${totalDelayMinutes} min`;
        if (elHours) elHours.textContent = `${totalHoursWorked.toFixed(1)} hrs`;
    },

    openJustificationModal(entry) {
        const delayedSessions = (entry.sessions || []).filter(session => Number(session.delayMinutes) > 0);
        if (delayedSessions.length === 0) {
            window.App.showToast('Este registro no tiene minutos de retraso para justificar.', 'warning');
            return;
        }

        const employeeName = entry.user
            ? `${entry.user.firstName} ${entry.user.lastName}`
            : 'Empleado';
        const totalDelay = delayedSessions.reduce((total, session) => total + Number(session.delayMinutes || 0), 0);
        const previous = delayedSessions.find(session => session.justificationReason || session.justificationNotes) || delayedSessions[0];
        const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[character]);

        const reviewer = previous.justificationReviewedByUser;
        const reviewerText = reviewer
            ? `<p class="text-muted text-sm mt-2">Última decisión registrada por <strong>${escapeHtml(`${reviewer.firstName} ${reviewer.lastName}`)}</strong>${reviewer.email ? ` (${escapeHtml(reviewer.email)})` : ''}.</p>`
            : '';

        const modalContent = `
            <form id="delay-justification-form" class="mt-2">
                <div class="justification-summary">
                    <strong>${escapeHtml(employeeName)}</strong>
                    <span>${window.App.formatDate(entry.date)} · ${totalDelay} min de retraso</span>
                </div>
                ${reviewerText}

                <div class="form-group mt-3">
                    <label for="justification-reason">Motivo de la tardanza</label>
                    <textarea id="justification-reason" class="form-control" rows="3" maxlength="500" required
                        placeholder="Ej.: retraso del transporte público, emergencia médica...">${escapeHtml(previous.justificationReason)}</textarea>
                </div>

                <div class="form-group">
                    <label for="justification-notes">Observación administrativa (opcional)</label>
                    <textarea id="justification-notes" class="form-control" rows="2" maxlength="1000"
                        placeholder="Información adicional que respalda la decisión">${escapeHtml(previous.justificationNotes)}</textarea>
                </div>

                <p class="text-muted text-sm">Al guardar, estos minutos quedarán perdonados y no se descontarán en el siguiente cálculo de nómina. Se registrará automáticamente el administrador, la fecha y la hora de esta decisión.</p>

                <div class="flex-end gap-2 mt-3">
                    <button type="button" class="btn-secondary" id="btn-cancel-justification">Cancelar</button>
                    <button type="submit" class="btn-danger" data-status="REJECTED">❌ Rechazar</button>
                    <button type="submit" class="btn-success" data-status="JUSTIFIED">✅ Justificar</button>
                </div>
            </form>
        `;

        window.App.showModal('Justificar retraso', modalContent);
        document.getElementById('btn-cancel-justification').addEventListener('click', () => window.App.hideModal());
        document.getElementById('delay-justification-form').addEventListener('submit', async event => {
            event.preventDefault();
            const submit = event.submitter;
            if (submit.disabled) return;
            const status = submit.dataset.status || 'JUSTIFIED';

            const reason = document.getElementById('justification-reason').value.trim();
            const notes = document.getElementById('justification-notes').value.trim();
            submit.disabled = true;
            const previousText = submit.textContent;
            submit.textContent = 'Guardando...';

            try {
                await Promise.all(delayedSessions.map(session => window.api.justifyAttendanceSession(session.id, {
                    status,
                    reason,
                    notes,
                    decisionReason: reason
                })));
                window.App.hideModal();
                window.App.showToast(`Retraso de ${employeeName} ${status === 'JUSTIFIED' ? 'justificado' : 'rechazado'} correctamente.`, 'success');
                await this.loadEntries();
            } catch (error) {
                window.App.showToast('No se pudo guardar la justificación: ' + error.message, 'error');
            } finally {
                if (document.body.contains(submit)) {
                    submit.disabled = false;
                    submit.textContent = previousText;
                }
            }
        });
    },

    openAttendanceModal(entry = null) {
        const isEdit = !!entry;
        const now = new Date();
        
        // Formatear fecha y hora locales correctas
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayLocal = `${year}-${month}-${day}`;
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        const employeeOptions = this.users.map(u => 
            `<option value="${u.id}">${u.firstName} ${u.lastName} (Programado: ${u.scheduledEntryTime})</option>`
        ).join('');

        const modalContent = `
            <form id="attendance-form" class="mt-2">
                <input type="hidden" id="att-id" value="${isEdit ? entry.id : ''}">
                
                <div class="form-group">
                    <label for="att-user">Empleado</label>
                    <select id="att-user" class="form-control" required ${isEdit ? 'disabled' : ''}>
                        <option value="">Selecciona un empleado...</option>
                        ${employeeOptions}
                    </select>
                </div>
                
                <div class="flex gap-2">
                    <div class="form-group flex-1">
                        <label for="att-date">Fecha de Asistencia (Servidor)</label>
                        <input type="date" id="att-date" class="form-control" readonly style="pointer-events: none; opacity: 0.8; background: rgba(255,255,255,0.05);" required value="${isEdit ? entry.date.split('T')[0] : todayLocal}">
                    </div>
                    <div class="form-group flex-1">
                        <label for="att-actual">Hora de Ingreso Real (Servidor)</label>
                        <input type="time" id="att-actual" class="form-control" readonly style="pointer-events: none; opacity: 0.8; background: rgba(255,255,255,0.05);" required value="${isEdit ? entry.actualEntry : currentTime}">
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="att-notes">Notas / Justificación</label>
                    <textarea id="att-notes" class="form-control" rows="2" placeholder="Escribe alguna observación (ej. retraso justificado)...">${isEdit ? entry.notes || '' : ''}</textarea>
                </div>

                <div class="flex-end gap-2 mt-3">
                    <button type="button" class="btn-secondary" id="btn-cancel-attendance">Cancelar</button>
                    <button type="submit" class="btn-primary">${isEdit ? '💾 Guardar Notas' : '💾 Registrar Entrada'}</button>
                </div>
            </form>
        `;

        window.App.showModal(isEdit ? 'Modificar Observaciones' : 'Registrar Nueva Entrada de Asistencia', modalContent);
        document.getElementById('btn-cancel-attendance').addEventListener('click', () => window.App.hideModal());

        if (isEdit) {
            document.getElementById('att-user').value = entry.userId;
        }

        // Submit
        document.getElementById('attendance-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const data = {
                userId: document.getElementById('att-user').value,
                date: document.getElementById('att-date').value,
                actualEntry: document.getElementById('att-actual').value,
                notes: document.getElementById('att-notes').value
            };

            const submit=e.submitter; if(submit.disabled)return; submit.disabled=true; const previous=submit.textContent;submit.textContent='Procesando…';
            try {
                if(isEdit) await window.api.upsertAttendance(data); else await window.api.clockInSession({userId:Number(data.userId),notes:data.notes});
                window.App.showToast(isEdit ? 'Notas actualizadas' : 'Asistencia (Entrada) registrada correctamente', 'success');
                window.App.hideModal();
                await this.loadEntries();
            } catch (error) {
                window.App.showToast('Error al registrar: ' + error.message, 'error');
            } finally { if(document.body.contains(submit)){submit.disabled=false;submit.textContent=previous;} }
        });
    },

    async clockOut(sessionId, empName) {
        window.App.showToast(`Marcando salida para ${empName}...`, 'info');
        try {
            await window.api.clockOutSession(sessionId);
            window.App.showToast(`¡Salida registrada con éxito para ${empName}!`, 'success');
            await this.loadEntries();
        } catch (error) {
            window.App.showToast('Error al registrar salida: ' + error.message, 'error');
        }
    }
};
