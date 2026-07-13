/**
 * EmployeesPage - Gestión de Empleados (Admin Only)
 */
window.EmployeesPage = {
    async render() {
        return `
            <div class="page-header flex-between">
                <div>
                    <h1 class="page-title">Gestión de Empleados</h1>
                    <p class="page-subtitle">Crea y edita empleados, gestiona sus horarios de ingreso programados y salarios mensuales.</p>
                </div>
                <button class="btn-primary" id="btn-new-employee">
                    ➕ Nuevo Empleado
                </button>
            </div>

            <!-- Employees Table -->
            <div class="card">
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Email</th>
                                <th>Tipo</th>
                                <th>Salario Mensual</th>
                                <th>Horas Laborales</th>
                                <th>Tarifa/Hora</th>
                                <th>Ingreso Programado</th>
                                <th>Estado</th>
                                <th class="text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="employees-table-body">
                            <tr>
                                <td colspan="9" class="text-center text-muted">Cargando lista de empleados...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async init() {
        document.getElementById('btn-new-employee').addEventListener('click', () => this.openEmployeeModal());
        await this.loadEmployees();
    },

    async loadEmployees() {
        const tbody = document.getElementById('employees-table-body');
        if (!tbody) return;

        try {
            const response = await window.api.getUsers();
            const users = response.data || [];

            // Filter out admin users if we only want to display employees, or show all.
            // Let's display all active users so admins can see themselves, but focus on employees.
            if (users.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-center text-muted">
                            No hay empleados registrados en el sistema.
                        </td>
                    </tr>
                `;
                return;
            }

            const typeLabels = {
                'FIJO': 'Fijo',
                'TEMPORAL': 'Temporal'
            };

            tbody.innerHTML = users.map(user => {
                const fullName = `${user.firstName} ${user.lastName}`;
                const monthlySalary = parseFloat(user.monthlySalary) || 0;
                const monthlyHours = parseFloat(user.monthlyHours) || 0;
                const hourlyRate = parseFloat(user.hourlyRate) || 0;
                
                const statusBadge = user.isActive 
                    ? '<span class="badge badge-success">Activo</span>' 
                    : '<span class="badge badge-danger">Inactivo</span>';

                let actionBtns = '';
                if (user.isActive) {
                    actionBtns = `
                        <div class="flex-end gap-1">
                            <button class="btn-secondary btn-sm" onclick="window.EmployeesPage.openEmployeeModal(${JSON.stringify(user).replace(/"/g, '&quot;')})">📝 Editar</button>
                            <button class="btn-danger btn-sm" onclick="window.EmployeesPage.confirmDeactivate(${user.id}, '${fullName}')">✗ Desact.</button>
                        </div>
                    `;
                } else {
                    actionBtns = `<span class="text-muted text-sm">-</span>`;
                }

                // If it is the admin, display a badge, and hide some columns if they don't apply
                const isUserAdmin = user.role === 'ADMIN';
                const salaryDisp = isUserAdmin ? '-' : window.App.formatCurrency(monthlySalary);
                const hoursDisp = isUserAdmin ? '-' : `${monthlyHours} hrs`;
                const rateDisp = isUserAdmin ? '-' : `${window.App.formatCurrency(hourlyRate)}/h`;
                const entryDisp = isUserAdmin ? '-' : `${user.scheduledEntryTime}`;
                const typeDisp = isUserAdmin ? '<span class="badge badge-info">Admin</span>' : `<span class="badge badge-secondary">${typeLabels[user.employeeType] || user.employeeType}</span>`;

                return `
                    <tr id="user-row-${user.id}" class="${!user.isActive ? 'text-muted' : ''}">
                        <td class="font-weight-medium">${fullName}</td>
                        <td>${user.email}</td>
                        <td>${typeDisp}</td>
                        <td class="font-weight-semibold">${salaryDisp}</td>
                        <td>${hoursDisp}</td>
                        <td class="font-weight-semibold">${rateDisp}</td>
                        <td>${entryDisp}</td>
                        <td>${statusBadge}</td>
                        <td class="text-right">${actionBtns}</td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            console.error('Error al cargar empleados:', e);
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-danger">
                        Error al cargar la lista: ${e.message}
                    </td>
                </tr>
            `;
        }
    },

    openEmployeeModal(user = null) {
        const isEdit = !!user;
        
        const modalContent = `
            <form id="employee-form" class="mt-2">
                <input type="hidden" id="emp-id" value="${isEdit ? user.id : ''}">
                
                <div class="flex gap-2">
                    <div class="form-group flex-1">
                        <label for="emp-firstname">Nombre</label>
                        <input type="text" id="emp-firstname" class="form-control" required value="${isEdit ? user.firstName : ''}">
                    </div>
                    <div class="form-group flex-1">
                        <label for="emp-lastname">Apellido</label>
                        <input type="text" id="emp-lastname" class="form-control" required value="${isEdit ? user.lastName : ''}">
                    </div>
                </div>

                <div class="card schedule-editor mt-2">
                    <h3>Horario de trabajo</h3>
                    <div class="form-group mt-2"><label for="emp-schedule-type">Tipo de horario</label><select id="emp-schedule-type" class="form-control"><option value="FULL_TIME">Jornada completa</option><option value="FLEXIBLE">Horario flexible</option><option value="SPECIFIC_DAYS">Días específicos</option></select></div>
                    <div id="schedule-blocks"></div>
                    <button type="button" class="btn-secondary btn-sm" id="add-schedule-block">Agregar bloque</button>
                    <p class="text-muted text-sm mt-2">Los bloques nocturnos se registran con una salida menor a la entrada y terminan al día siguiente.</p>
                </div>

                <div class="form-group">
                    <label for="emp-email">Correo Electrónico</label>
                    <input type="email" id="emp-email" class="form-control" required value="${isEdit ? user.email : ''}" ${isEdit ? 'disabled' : ''}>
                </div>

                <div class="flex gap-2">
                    <div class="form-group flex-1">
                        <label for="emp-role">Rol en el Sistema</label>
                        <select id="emp-role" class="form-control" required>
                            <option value="EMPLOYEE" ${isEdit && user.role === 'EMPLOYEE' ? 'selected' : ''}>Empleado</option>
                            <option value="ADMIN" ${isEdit && user.role === 'ADMIN' ? 'selected' : ''}>Administrador</option>
                        </select>
                    </div>
                    <div class="form-group flex-1">
                        <label for="emp-type">Tipo de Empleado</label>
                        <select id="emp-type" class="form-control" required>
                            <option value="FIJO" ${isEdit && user.employeeType === 'FIJO' ? 'selected' : ''}>Fijo</option>
                            <option value="TEMPORAL" ${isEdit && user.employeeType === 'TEMPORAL' ? 'selected' : ''}>Temporal</option>
                        </select>
                    </div>
                </div>

                <div class="flex gap-2" id="employee-financial-fields">
                    <div class="form-group flex-1">
                        <label for="emp-salary">Salario Mensual (Bs.)</label>
                        <input type="number" id="emp-salary" class="form-control" step="0.01" min="0" required value="${isEdit ? parseFloat(user.monthlySalary) : '0.00'}">
                    </div>
                    <div class="form-group flex-1">
                        <label for="emp-hours">Horas Laborales / Mes</label>
                        <input type="number" id="emp-hours" class="form-control" step="1" min="1" required value="${isEdit ? parseFloat(user.monthlyHours) : '160'}">
                    </div>
                </div>

                <div class="flex gap-2">
                    <div class="form-group flex-1">
                        <label for="emp-entry-time">Hora Ingreso Programada (HH:MM)</label>
                        <input type="time" id="emp-entry-time" class="form-control" required value="${isEdit ? user.scheduledEntryTime : '08:00'}">
                    </div>
                    <div class="form-group flex-1">
                        <label>Tarifa / Hora Proyectada</label>
                        <input type="text" id="emp-rate-preview" class="form-control" style="background: rgba(255,255,255,0.05); color: #aaaaaa;" disabled value="Bs. 0.00">
                    </div>
                </div>

                <div class="flex-end gap-2 mt-3">
                    <button type="button" class="btn-secondary" onclick="window.App.hideModal()">Cancelar</button>
                    <button type="submit" class="btn-primary">${isEdit ? 'Guardar Cambios' : 'Crear Empleado'}</button>
                </div>
            </form>
        `;

        window.App.showModal(isEdit ? 'Editar Empleado' : 'Crear Nuevo Empleado', modalContent);

        // Calculate rate preview on input change
        const salaryInput = document.getElementById('emp-salary');
        const hoursInput = document.getElementById('emp-hours');
        const ratePreview = document.getElementById('emp-rate-preview');
        const roleSelect = document.getElementById('emp-role');
        const financialFields = document.getElementById('employee-financial-fields');
        const scheduleType=document.getElementById('emp-schedule-type'); const blocksContainer=document.getElementById('schedule-blocks');
        scheduleType.value=user?.scheduleType||'FULL_TIME';
        const dayNames=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
        const addBlock=(block={dayOfWeek:1,startTime:'08:00',endTime:'12:00'})=>{const row=document.createElement('div');row.className='schedule-row';row.innerHTML=`<select class="form-control schedule-day">${dayNames.map((d,i)=>`<option value="${i}" ${Number(block.dayOfWeek)===i?'selected':''}>${d}</option>`).join('')}</select><input class="form-control schedule-start" type="time" value="${window.UI.escapeHtml(block.startTime)}" required><input class="form-control schedule-end" type="time" value="${window.UI.escapeHtml(block.endTime)}" required><button type="button" class="btn-danger btn-sm schedule-remove">Eliminar</button>`;row.querySelector('.schedule-remove').addEventListener('click',()=>row.remove());blocksContainer.appendChild(row)};
        const initial=user?.scheduleBlocks?.length?user.scheduleBlocks:[{dayOfWeek:1,startTime:'08:00',endTime:'12:00'},{dayOfWeek:1,startTime:'14:00',endTime:'18:00'}];initial.forEach(addBlock);document.getElementById('add-schedule-block').addEventListener('click',()=>addBlock());

        const calculateRatePreview = () => {
            const salary = parseFloat(salaryInput.value) || 0;
            const hours = parseFloat(hoursInput.value) || 0;
            if (hours > 0) {
                const rate = salary / hours;
                ratePreview.value = window.App.formatCurrency(rate);
            } else {
                ratePreview.value = 'Bs. 0.00';
            }
        };

        // If admin is selected, salary/hours fields can be hidden or disabled since they don't apply.
        const toggleFinancialFields = () => {
            if (roleSelect.value === 'ADMIN') {
                financialFields.style.opacity = '0.5';
                salaryInput.disabled = true;
                hoursInput.disabled = true;
                salaryInput.value = '0';
                hoursInput.value = '160';
                ratePreview.value = 'N/A';
            } else {
                financialFields.style.opacity = '1';
                salaryInput.disabled = false;
                hoursInput.disabled = false;
                calculateRatePreview();
            }
        };

        salaryInput.addEventListener('input', calculateRatePreview);
        hoursInput.addEventListener('input', calculateRatePreview);
        roleSelect.addEventListener('change', toggleFinancialFields);

        // Run calculations initially
        toggleFinancialFields();
        calculateRatePreview();

        // Submit listener
        document.getElementById('employee-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const id = document.getElementById('emp-id').value;
            const data = {
                firstName: document.getElementById('emp-firstname').value,
                lastName: document.getElementById('emp-lastname').value,
                role: document.getElementById('emp-role').value,
                employeeType: document.getElementById('emp-type').value,
                monthlySalary: parseFloat(document.getElementById('emp-salary').value),
                monthlyHours: parseFloat(document.getElementById('emp-hours').value),
                scheduledEntryTime: document.getElementById('emp-entry-time').value,
                scheduleType: scheduleType.value,
                scheduleBlocks: [...blocksContainer.querySelectorAll('.schedule-row')].map((row,index)=>({dayOfWeek:Number(row.querySelector('.schedule-day').value),startTime:row.querySelector('.schedule-start').value,endTime:row.querySelector('.schedule-end').value,blockOrder:index+1})),
            };

            if (!isEdit) {
                data.email = document.getElementById('emp-email').value;
            }

            try {
                if (isEdit) {
                    await window.api.updateUser(id, data);
                    window.App.showToast('Empleado actualizado correctamente', 'success');
                } else {
                    await window.api.createUser(data);
                    window.App.showToast('Empleado creado correctamente', 'success');
                }
                window.App.hideModal();
                await this.loadEmployees();
            } catch (error) {
                window.App.showToast('Error al guardar empleado: ' + error.message, 'error');
            }
        });
    },

    confirmDeactivate(id, fullName) {
        const modalContent = `
            <div class="mt-2">
                <p>¿Estás seguro de que deseas desactivar a <strong>${fullName}</strong>?</p>
                <p class="text-muted text-sm mt-2">Esta acción impedirá que se registren asistencias o se calcule su nómina. Toda la información histórica se mantendrá intacta.</p>
                <div class="flex-end gap-2 mt-4">
                    <button class="btn-secondary" onclick="window.App.hideModal()">Cancelar</button>
                    <button class="btn-danger" onclick="window.EmployeesPage.deactivate(${id})">Confirmar Desactivación</button>
                </div>
            </div>
        `;
        window.App.showModal('Confirmar Desactivación', modalContent);
    },

    async deactivate(id) {
        try {
            await window.api.deleteUser(id);
            window.App.showToast('Empleado desactivado correctamente', 'success');
            window.App.hideModal();
            await this.loadEmployees();
        } catch (error) {
            window.App.showToast('Error al desactivar empleado: ' + error.message, 'error');
        }
    }
};
