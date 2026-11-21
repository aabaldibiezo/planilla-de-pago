/**
 * EmployeesPage - Gestión de Empleados (Admin Only)
 */

/** 30 días × 8 horas: base legal en Bolivia para el valor de la hora. */
const HORAS_LEGALES_MES = 240;

window.EmployeesPage = {
    users: [],
    /** IDs de empleados que hoy no tienen sede asignada (geocerco estricto). */
    sinSedeHoy: new Set(),

    esc(value) {
        return window.UI.escapeHtml(value);
    },

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

            <div id="aviso-sin-sede"></div>

            <!-- Employees Table -->
            <div class="card">
                <div class="table-container">
                    <table class="table tabla-acciones-fijas">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Correo / celular</th>
                                <th>Tipo</th>
                                <th>Pago</th>
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
        document
            .getElementById('btn-new-employee')
            .addEventListener('click', () => this.elegirTipoDeAlta());

        // Delegación de eventos: evita serializar objetos dentro de atributos onclick.
        document.getElementById('employees-table-body').addEventListener('click', (event) => {
            const button = event.target.closest('[data-employee-action]');
            if (!button) return;

            const user = this.users.find((item) => item.id === Number(button.dataset.userId));
            if (!user) return;

            if (button.dataset.employeeAction === 'edit') {
                this.openEmployeeModal(user);
            } else if (button.dataset.employeeAction === 'deactivate') {
                this.confirmDeactivate(user);
            } else if (button.dataset.employeeAction === 'reset-password') {
                this.confirmResetPassword(user);
            }
        });

        await this.loadEmployees();
    },

    /** Aviso agregado arriba de la tabla: el conteo se nota antes que los íconos. */
    pintarAvisoSinSede() {
        const contenedor = document.getElementById('aviso-sin-sede');
        if (!contenedor) return;

        const cantidad = this.sinSedeHoy.size;
        if (cantidad === 0) {
            contenedor.innerHTML = '';
            return;
        }

        contenedor.innerHTML = `
            <div class="card mb-4 aviso-critico">
                <strong>🔴 ${cantidad} empleado${cantidad === 1 ? '' : 's'} no podrá${cantidad === 1 ? '' : 'n'} marcar asistencia hoy</strong>
                <p class="text-muted text-sm mt-1">
                    No tiene${cantidad === 1 ? '' : 'n'} una sede asignada para el día de hoy.
                    Asígnele${cantidad === 1 ? '' : 's'} una desde la sección Sedes.
                </p>
            </div>`;
    },

    /**
     * Arma los grupos de la tabla: Administración, una por sede (con los días
     * que cada uno trabaja ahí) y al final quienes no tienen sede.
     *
     * Un empleado que trabaja en dos sedes aparece en las dos, cada una con
     * sus días. Solo cuentan las asignaciones vigentes hoy o a futuro.
     */
    agruparPorSede(users, sedes, asignaciones) {
        const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const hoy = new Date().toISOString().slice(0, 10);
        const vigentes = asignaciones.filter(
            (a) => !a.validUntil || String(a.validUntil).slice(0, 10) >= hoy
        );

        // "Lun a Sáb" si los días son seguidos; si no, la lista.
        const textoDias = (dias) => {
            const orden = [...new Set(dias)].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7));
            if (orden.length === 7) return 'Todos los días';
            const seguidos = orden.every(
                (d, i) => i === 0 || (d + 6) % 7 === ((orden[i - 1] + 6) % 7) + 1
            );
            return seguidos && orden.length > 2
                ? `${DIAS[orden[0]]} a ${DIAS[orden[orden.length - 1]]}`
                : orden.map((d) => DIAS[d]).join(', ');
        };

        const notaDe = (lista) => {
            const dias = lista.filter((a) => a.dayOfWeek !== null).map((a) => a.dayOfWeek);
            const fechas = lista.filter((a) => a.specificDate).map((a) => String(a.specificDate).slice(0, 10));
            const horario = lista.find((a) => a.startTime && a.endTime);
            const partes = [];
            if (dias.length) partes.push(textoDias(dias));
            if (fechas.length) partes.push(`${fechas.length} fecha${fechas.length === 1 ? '' : 's'} puntual${fechas.length === 1 ? '' : 'es'}`);
            if (horario) partes.push(`${horario.startTime} – ${horario.endTime}`);
            return partes.length ? `📅 ${this.esc(partes.join(' · '))}` : '';
        };

        const admins = users.filter((u) => u.role === 'ADMIN');
        const personal = users.filter((u) => u.role !== 'ADMIN');
        const grupos = [];

        if (admins.length) {
            grupos.push({
                icono: '🏢',
                titulo: 'Administración',
                clase: 'grupo-admin',
                // El gerente general primero.
                filas: [...admins].sort((a, b) => Number(b.isOwner) - Number(a.isOwner)).map((user) => ({ user })),
            });
        }

        const conSede = new Set();
        sedes
            .filter((s) => s.isActive !== false)
            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
            .forEach((sede) => {
                const filas = personal
                    .map((user) => {
                        const suyas = vigentes.filter((a) => a.userId === user.id && a.worksiteId === sede.id);
                        return suyas.length ? { user, nota: notaDe(suyas) } : null;
                    })
                    .filter(Boolean);
                filas.forEach(({ user }) => conSede.add(user.id));
                grupos.push({ icono: '📍', titulo: sede.name, detalle: sede.address, filas });
            });

        // Sin sede: van PRIMERO y resaltados, porque no pueden marcar hasta que
        // se les asigne una. Los temporales no tienen sede fija (vienen el día
        // que se los llama y los marca el encargado): van aparte, sin alerta.
        const sinSede = personal.filter((u) => !conSede.has(u.id) && u.employeeType !== 'TEMPORAL');
        if (sinSede.length) {
            grupos.unshift({
                icono: '⚠️',
                titulo: 'Sin sede asignada',
                clase: 'grupo-sin-sede',
                claseFila: 'fila-sin-sede',
                detalle: 'No pueden marcar asistencia hasta que les asigne una sede en "Sedes"',
                filas: sinSede.map((user) => ({ user })),
            });
        }
        const temporalesSinSede = personal.filter((u) => !conSede.has(u.id) && u.employeeType === 'TEMPORAL');
        if (temporalesSinSede.length) {
            grupos.push({
                icono: '🕒',
                titulo: 'Temporales',
                detalle: 'Sin sede fija: el encargado de sede los marca el día que trabajan',
                filas: temporalesSinSede.map((user) => ({ user })),
            });
        }

        // Una sede sin nadie se muestra igual (sirve para ver que está vacía),
        // pero con una fila que lo dice.
        return grupos.map((g) =>
            g.filas.length ? g : { ...g, filas: [], vacia: true }
        );
    },

    async loadEmployees() {
        const tbody = document.getElementById('employees-table-body');
        if (!tbody) return;

        try {
            // El servidor decide quién no tiene sede hoy: replicar acá las
            // reglas de vigencia haría que la alerta y el geocerco discrepen.
            const [response, sinSede, respSedes, respAsignaciones] = await Promise.all([
                window.api.getUsers(),
                window.api.getEmployeesWithoutWorksiteToday().catch(() => null),
                window.api.getWorksites().catch(() => null),
                window.api.getWorksiteAssignments().catch(() => null),
            ]);
            const sedes = respSedes?.data || [];
            const asignaciones = respAsignaciones?.data || [];

            const users = response.data || [];
            this.users = users;
            this.sinSedeHoy = new Set((sinSede?.data?.employees || []).map((item) => item.id));
            this.pintarAvisoSinSede();

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
                FIJO: 'Fijo',
                TEMPORAL: 'Temporal',
            };

            // `nota` va debajo del nombre (p. ej. los días que trabaja en esa sede).
            const filaEmpleado = (user, nota = '', claseExtra = '') => {
                    const fullName = `${user.firstName} ${user.lastName}`;
                    const monthlySalary = parseFloat(user.monthlySalary) || 0;
                    const monthlyHours = parseFloat(user.monthlyHours) || 0;
                    const hourlyRate = parseFloat(user.hourlyRate) || 0;

                    const statusBadge = user.isActive
                        ? '<span class="badge badge-success">Activo</span>'
                        : '<span class="badge badge-danger">Inactivo</span>';

                    // La cuenta propia y la del gerente general no se desactivan
                    // desde acá (el servidor también lo impide).
                    const yo = window.auth?.getUser?.() || {};
                    const puedeDesactivar = !user.isOwner && user.id !== yo.id;

                    let actionBtns = '';
                    if (user.isActive) {
                        actionBtns = `
                        <div class="flex-end gap-1">
                            <button class="btn-secondary btn-sm" data-employee-action="edit" data-user-id="${user.id}">📝 Editar</button>
                            ${
                                (user.email || user.phone) && user.id !== yo.id
                                    ? `<button class="btn-secondary btn-sm" data-employee-action="reset-password" data-user-id="${user.id}" title="Genera una contraseña temporal y la envía por correo">🔑 Acceso</button>`
                                    : ''
                            }
                            ${
                                puedeDesactivar
                                    ? `<button class="btn-danger btn-sm" data-employee-action="deactivate" data-user-id="${user.id}">✗ Desact.</button>`
                                    : ''
                            }
                        </div>
                    `;
                    } else {
                        actionBtns = `<span class="text-muted text-sm">-</span>`;
                    }

                    // Solo el gerente general no cobra por planilla; los
                    // administrativos tienen sueldo como el resto.
                    const isUserAdmin = user.role === 'ADMIN';
                    const sinSueldo = Boolean(user.isOwner);
                    const salaryDisp = sinSueldo
                        ? '-'
                        : user.employeeType === 'TEMPORAL'
                          ? `${window.App.formatCurrency(parseFloat(user.dailyWage) || 0)} / día`
                          : `${window.App.formatCurrency(monthlySalary)} / mes`;
                    const hoursDisp = sinSueldo || isUserAdmin ? '-' : `${monthlyHours} hrs`;
                    const rateDisp = sinSueldo ? '-' : `${window.App.formatCurrency(hourlyRate)}/h`;
                    const entryDisp = isUserAdmin ? '-' : `${user.scheduledEntryTime}`;
                    const typeDisp = user.isOwner
                        ? '<span class="badge badge-info">Gerente general</span>'
                        : isUserAdmin
                          ? '<span class="badge badge-info">💻 Administrativo</span>'
                          : `${
                                user.isSiteManager
                                    ? '<span class="badge badge-warning">📋 Encargado de sede</span> '
                                    : ''
                            }<span class="badge badge-secondary">${this.esc(typeLabels[user.employeeType] || user.employeeType)}</span>`;

                    // Con geocerco estricto, sin sede asignada no puede fichar.
                    const sinSede = this.sinSedeHoy.has(user.id);
                    const marcaSinSede = sinSede
                        ? `<span class="marca-sin-sede" title="Sin sede asignada para hoy. No podrá marcar asistencia." aria-label="Sin sede asignada para hoy">🔴</span> `
                        : '';

                    return `
                    <tr id="user-row-${user.id}" class="${!user.isActive ? 'text-muted' : ''} ${claseExtra}">
                        <td class="font-weight-medium">${marcaSinSede}${this.esc(fullName)}${
                            nota ? `<div class="nota-sede">${nota}</div>` : ''
                        }</td>
                        <td>${
                            user.email || user.phone
                                ? this.esc([user.email, user.phone].filter(Boolean).join(' · '))
                                : '<span class="text-muted text-sm">Sin app · lo marca el encargado</span>'
                        }</td>
                        <td>${typeDisp}</td>
                        <td class="font-weight-semibold">${salaryDisp}</td>
                        <td>${hoursDisp}</td>
                        <td class="font-weight-semibold">${rateDisp}</td>
                        <td>${this.esc(entryDisp)}</td>
                        <td>${statusBadge}</td>
                        <td class="text-right">${actionBtns}</td>
                    </tr>
                `;
            };

            tbody.innerHTML = this.agruparPorSede(users, sedes, asignaciones)
                .map(
                    (grupo) => `
                    <tr class="fila-grupo ${grupo.clase || ''}">
                        <td colspan="9">
                            <span class="grupo-titulo">${grupo.icono} ${this.esc(grupo.titulo)}</span>
                            <span class="grupo-cantidad">${grupo.filas.length} ${grupo.filas.length === 1 ? 'persona' : 'personas'}</span>
                            ${grupo.detalle ? `<span class="grupo-detalle">${this.esc(grupo.detalle)}</span>` : ''}
                        </td>
                    </tr>
                    ${
                        grupo.filas.length
                            ? grupo.filas.map(({ user, nota }) => filaEmpleado(user, nota, grupo.claseFila || '')).join('')
                            : '<tr><td colspan="9" class="text-muted text-sm fila-vacia">Todavía no hay nadie asignado a esta sede.</td></tr>'
                    }`
                )
                .join('');
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

    /**
     * Navegación del alta por pasos.
     *
     * Valida el paso actual antes de dejar avanzar: es preferible avisar del
     * error ahí mismo y no al final, cuando el usuario ya cargó todo.
     */
    activarPasos() {
        const paneles = [...document.querySelectorAll('.wizard-panel')];
        const indicadores = [...document.querySelectorAll('.wizard-paso')];
        const btnAtras = document.getElementById('wizard-atras');
        const btnSiguiente = document.getElementById('wizard-siguiente');
        const btnGuardar = document.getElementById('wizard-guardar');

        let actual = 1;
        const total = paneles.length;

        const mostrar = () => {
            paneles.forEach((panel) => {
                panel.classList.toggle('activo', Number(panel.dataset.paso) === actual);
            });

            indicadores.forEach((indicador) => {
                const numero = Number(indicador.dataset.indicador);
                indicador.classList.toggle('activo', numero === actual);
                indicador.classList.toggle('completado', numero < actual);
            });

            btnAtras.classList.toggle('hidden', actual === 1);
            btnSiguiente.classList.toggle('hidden', actual === total);
            btnGuardar.classList.toggle('hidden', actual !== total);
        };

        /** Usa la validación nativa del navegador sobre los campos del paso. */
        const pasoValido = () => {
            const panel = paneles.find((item) => Number(item.dataset.paso) === actual);
            const campos = [...panel.querySelectorAll('input, select')].filter(
                (campo) => !campo.disabled
            );

            for (const campo of campos) {
                if (!campo.checkValidity()) {
                    campo.reportValidity();
                    return false;
                }
            }
            return true;
        };

        btnSiguiente.addEventListener('click', () => {
            if (!pasoValido()) return;
            actual = Math.min(actual + 1, total);
            mostrar();
        });

        btnAtras.addEventListener('click', () => {
            actual = Math.max(actual - 1, 1);
            mostrar();
        });

        // Permite volver a un paso ya completado tocando el indicador.
        indicadores.forEach((indicador) => {
            indicador.addEventListener('click', () => {
                const numero = Number(indicador.dataset.indicador);
                if (numero < actual) {
                    actual = numero;
                    mostrar();
                }
            });
        });

        mostrar();
    },

    /**
     * Primer paso del alta: ¿fijo o temporal?
     *
     * El temporal suele venir un día, cobra ese día y no vuelve: no usa la
     * aplicación, así que alcanza con su nombre y su pago por día. El fijo
     * sigue el alta completa (correo, sueldo, horario).
     */
    elegirTipoDeAlta() {
        window.App.showModal(
            'Nuevo empleado',
            `
            <p class="text-muted mt-2">¿Qué tipo de empleado va a registrar?</p>
            <div class="eleccion-tipo mt-3">
                <button type="button" class="eleccion-tarjeta" data-tipo-alta="FIJO">
                    <span class="eleccion-icono">👷</span>
                    <strong>Fijo</strong>
                    <span class="text-muted text-sm">Sueldo mensual por contrato. Marca su asistencia con la app del celular.</span>
                </button>
                <button type="button" class="eleccion-tarjeta" data-tipo-alta="TEMPORAL">
                    <span class="eleccion-icono">🧹</span>
                    <strong>Temporal</strong>
                    <span class="text-muted text-sm">Cobra por día. El encargado le marca la asistencia. Solo pide nombre y pago por día.</span>
                </button>
            </div>
        `
        );
        document.querySelectorAll('[data-tipo-alta]').forEach((boton) =>
            boton.addEventListener('click', () =>
                boton.dataset.tipoAlta === 'TEMPORAL' ? this.openTemporalModal() : this.openEmployeeModal()
            )
        );
    },

    /** Alta mínima de un temporal: nombre, apellido y pago por día. */
    openTemporalModal() {
        window.App.showModal(
            'Nuevo temporal',
            `
            <form id="temporal-form" class="mt-2">
                <div class="flex gap-2">
                    <div class="form-group flex-1">
                        <label for="tmp-firstname">Nombre</label>
                        <input type="text" id="tmp-firstname" class="form-control" required>
                    </div>
                    <div class="form-group flex-1">
                        <label for="tmp-lastname">Apellido</label>
                        <input type="text" id="tmp-lastname" class="form-control" required>
                    </div>
                </div>
                <div class="form-group">
                    <label for="tmp-wage">Pago por día (Bs.)</label>
                    <input type="number" id="tmp-wage" class="form-control" step="0.01" min="1" required placeholder="Ej.: 120">
                    <small class="text-muted">Se le paga por cada día que el encargado le registre en Asistencia.</small>
                </div>
                <div class="flex-end gap-2 mt-3">
                    <button type="button" class="btn-secondary" id="tmp-cancel">Cancelar</button>
                    <button type="submit" class="btn-primary">Crear temporal</button>
                </div>
            </form>
        `
        );
        document.getElementById('tmp-cancel').addEventListener('click', () => window.App.hideModal());
        document.getElementById('temporal-form').addEventListener('submit', async (evento) => {
            evento.preventDefault();
            try {
                await window.api.createUser({
                    firstName: document.getElementById('tmp-firstname').value.trim(),
                    lastName: document.getElementById('tmp-lastname').value.trim(),
                    employeeType: 'TEMPORAL',
                    role: 'EMPLOYEE',
                    dailyWage: parseFloat(document.getElementById('tmp-wage').value),
                    monthlySalary: 0,
                    monthlyHours: HORAS_LEGALES_MES,
                    scheduledEntryTime: '08:00',
                    scheduleType: 'FLEXIBLE',
                });
                window.App.hideModal();
                window.App.showToast('Temporal registrado. Cárguele el día en Asistencia.', 'success');
                await this.loadEmployees();
            } catch (error) {
                window.App.showToast('No se pudo registrar: ' + error.message, 'error');
            }
        });
    },

    /**
     * Asigna la sede en los días del horario del empleado, de la primera
     * entrada a la última salida de cada día (un día con almuerzo tiene dos
     * turnos pero es una sola asignación). Sin horario, de lunes a sábado.
     * Devuelve cuántos días no se pudieron asignar.
     */
    async asignarSedeSegunHorario(userId, worksiteId, bloques = []) {
        const porDia = new Map();
        bloques
            .filter((b) => b.startTime && b.endTime)
            .forEach((b) => {
                const dia = porDia.get(b.dayOfWeek) || { inicio: b.startTime, fin: b.endTime };
                if (b.startTime < dia.inicio) dia.inicio = b.startTime;
                if (b.endTime > dia.fin) dia.fin = b.endTime;
                porDia.set(b.dayOfWeek, dia);
            });

        const dias = porDia.size
            ? [...porDia.entries()].map(([dayOfWeek, d]) => ({
                  dayOfWeek,
                  startTime: d.inicio,
                  endTime: d.fin,
              }))
            : [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek }));

        let fallos = 0;
        for (const dia of dias) {
            try {
                await window.api.createWorksiteAssignment({ userId, worksiteId, ...dia });
            } catch {
                fallos += 1;
            }
        }
        return fallos;
    },

    openEmployeeModal(user = null) {
        const isEdit = !!user;

        // Al crear se guía paso a paso: primero lo imprescindible, después el
        // resto. Al editar se muestra todo junto, porque corregir un dato
        // suelto no debería obligar a recorrer un asistente completo.
        const porPasos = !isEdit;

        const pasos = [
            { numero: 1, titulo: 'Datos de la persona' },
            { numero: 2, titulo: 'Condiciones laborales' },
            { numero: 3, titulo: 'Horario de trabajo' },
        ];

        const indicador = porPasos
            ? `<ol class="wizard-pasos" id="wizard-pasos">
                   ${pasos
                       .map(
                           (paso) => `
                       <li class="wizard-paso" data-indicador="${paso.numero}">
                           <span class="wizard-numero">${paso.numero}</span>
                           <span class="wizard-titulo">${paso.titulo}</span>
                       </li>`
                       )
                       .join('')}
               </ol>`
            : '';

        const abrirPaso = (numero, contenido) =>
            `<div class="wizard-panel" data-paso="${numero}">${contenido}</div>`;

        // --- Paso 1: lo mínimo para identificar a la persona ---
        const paso1 = `
            <div class="flex gap-2">
                <div class="form-group flex-1">
                    <label for="emp-firstname">Nombre</label>
                    <input type="text" id="emp-firstname" class="form-control" required value="${isEdit ? this.esc(user.firstName) : ''}">
                </div>
                <div class="form-group flex-1">
                    <label for="emp-lastname">Apellido</label>
                    <input type="text" id="emp-lastname" class="form-control" required value="${isEdit ? this.esc(user.lastName) : ''}">
                </div>
            </div>

            <p class="text-muted text-sm mb-2">
                Cargue el <strong>correo o el celular</strong>: al menos uno. Con cualquiera de los dos entra a la app.
            </p>
            <div class="form-group">
                <label for="emp-email">Correo electrónico</label>
                <input type="email" id="emp-email" class="form-control" value="${isEdit ? this.esc(user.email || '') : ''}" ${isEdit && user.email ? 'disabled' : ''} placeholder="ejemplo@correo.com">
            </div>

            <div class="form-group">
                <label for="emp-phone">Celular</label>
                <input type="tel" id="emp-phone" class="form-control" maxlength="20" inputmode="numeric"
                    placeholder="Ej.: 71234567"
                    value="${isEdit ? this.esc(user.phone || '') : ''}">
            </div>
        `;

        // Solo el gerente general (dueño) crea o asciende administradores. El
        // rol del gerente general, y el de un administrador visto por sí mismo,
        // no se cambia desde acá.
        const soyDueno = Boolean(window.auth?.getUser?.()?.isOwner);
        const puedeElegirAdmin = soyDueno || (isEdit && user.role === 'ADMIN');
        const rolBloqueado = isEdit && (user.isOwner || (user.role === 'ADMIN' && !soyDueno));
        // Puesto = rol + si es encargado de sede. El área contable sale sola:
        // los administrativos van a "salarios administrativos" y el resto a
        // "salarios operativos" del estado de resultados.
        const puestoActual = !isEdit
            ? 'OPERATIVO'
            : user.role === 'ADMIN'
              ? 'ADMINISTRATIVO'
              : user.isSiteManager
                ? 'ENCARGADO'
                : 'OPERATIVO';

        // --- Paso 2: condiciones de contratación y pago ---
        const paso2 = `
            <div class="flex gap-2 flex-wrap">
                <div class="form-group flex-1">
                    <label for="emp-puesto">Puesto</label>
                    <select id="emp-puesto" class="form-control" required ${rolBloqueado ? 'disabled' : ''}>
                        ${
                            isEdit && user.isOwner
                                ? '<option value="GERENTE" selected>Gerente general</option>'
                                : `
                        <option value="OPERATIVO" ${puestoActual === 'OPERATIVO' ? 'selected' : ''}>Operativo de limpieza</option>
                        <option value="ENCARGADO" ${puestoActual === 'ENCARGADO' ? 'selected' : ''}>Encargado de sede</option>
                        ${
                            puedeElegirAdmin
                                ? `<option value="ADMINISTRATIVO" ${puestoActual === 'ADMINISTRATIVO' ? 'selected' : ''}>Administrativo (oficina)</option>`
                                : ''
                        }`
                        }
                    </select>
                    <small class="text-muted" id="emp-puesto-ayuda"></small>
                </div>
                ${
                    // Al crear, el tipo ya se eligió en "¿Fijo o Temporal?" antes de
                    // abrir este formulario (el temporal tiene su propio alta), así
                    // que no se vuelve a preguntar. Al editar sí se muestra: puede
                    // hacer falta pasar a alguien de temporal a fijo.
                    isEdit
                        ? `<div class="form-group flex-1">
                               <label for="emp-type">Tipo de empleado</label>
                               <select id="emp-type" class="form-control" required>
                                   <option value="FIJO" ${user.employeeType === 'FIJO' ? 'selected' : ''}>Fijo</option>
                                   <option value="TEMPORAL" ${user.employeeType === 'TEMPORAL' ? 'selected' : ''}>Temporal</option>
                               </select>
                           </div>`
                        : '<input type="hidden" id="emp-type" value="FIJO">'
                }
            </div>
            ${
                // Al crear se pregunta directamente en qué sede trabaja. Si la
                // sede todavía no existe, se puede dejar para después: el
                // empleado queda resaltado arriba en la lista hasta asignarlo.
                isEdit
                    ? ''
                    : `<div class="form-group" id="emp-sede-grupo">
                           <label for="emp-sede">Sede donde trabaja</label>
                           <select id="emp-sede" class="form-control">
                               <option value="">Cargando sedes…</option>
                           </select>
                           <small class="text-muted" id="emp-sede-ayuda">
                               Se le asigna esa sede en los días de su horario (paso 3).
                           </small>
                       </div>`
            }

            <!--
              Ni las horas del mes ni la hora de ingreso se piden: el cliente
              trabaja con sueldo fijo por contrato y no las conoce. Las horas
              quedan en 240 (30 días × 8 h, el cálculo de la ley boliviana) y la
              hora de ingreso sale del primer turno del horario (paso 3).
              Al editar se conservan los valores que ya tenía la persona.
            -->
            <input type="hidden" id="emp-hours" value="${isEdit ? parseFloat(user.monthlyHours) : HORAS_LEGALES_MES}">
            <div class="flex gap-2" id="employee-financial-fields">
                <!-- Un solo campo de monto: según el tipo es sueldo del mes o pago por día. -->
                <div class="form-group flex-1">
                    <label for="emp-salary" id="emp-salary-label">Sueldo mensual (Bs.)</label>
                    <input type="number" id="emp-salary" class="form-control" step="0.01" min="0" required
                        value="${isEdit ? parseFloat(user.employeeType === 'TEMPORAL' ? user.dailyWage : user.monthlySalary) : ''}">
                    <small class="text-muted" id="emp-salary-help"></small>
                </div>
                <div class="form-group flex-1">
                    <label>Valor de la hora</label>
                    <input type="text" id="emp-rate-preview" class="form-control campo-calculado" disabled value="Bs. 0.00">
                    <small class="text-muted" id="emp-rate-help"></small>
                </div>
            </div>
        `;

        // --- Paso 3: horario ---
        const paso3 = `
            <div class="form-group">
                <label for="emp-schedule-type">Tipo de horario</label>
                <select id="emp-schedule-type" class="form-control">
                    <option value="FULL_TIME">Jornada completa</option>
                    <option value="FLEXIBLE">Horario flexible</option>
                    <option value="SPECIFIC_DAYS">Días específicos</option>
                </select>
            </div>

            <div class="horario-atajos">
                <span class="text-muted text-sm horario-atajos-titulo">1. Turno</span>
                <button type="button" class="btn-secondary btn-sm" data-turno="06:00-14:00">🌅 Mañana · 06:00 a 14:00</button>
                <button type="button" class="btn-secondary btn-sm" data-turno="14:00-22:00">🌇 Tarde · 14:00 a 22:00</button>
            </div>
            <div class="horario-atajos">
                <span class="text-muted text-sm horario-atajos-titulo">2. Días</span>
                <button type="button" class="btn-secondary btn-sm" data-copiar-dias="1,2,3,4,5">Lunes a viernes</button>
                <button type="button" class="btn-secondary btn-sm" data-copiar-dias="1,2,3,4,5,6">Lunes a sábado</button>
                <button type="button" class="btn-secondary btn-sm" data-copiar-dias="0,1,2,3,4,5,6">Todos los días</button>
            </div>
            <p class="text-muted text-sm mb-2">
                Si las horas de la persona son otras, cámbielas directamente en la lista.
            </p>
            <div id="schedule-blocks"></div>
            <button type="button" class="btn-secondary btn-sm" id="add-schedule-block">＋ Agregar otro horario</button>
        `;

        const cuerpo = porPasos
            ? abrirPaso(1, paso1) + abrirPaso(2, paso2) + abrirPaso(3, paso3)
            : `${paso1}<hr class="separador">${paso2}<hr class="separador">${paso3}`;

        const acciones = porPasos
            ? `<div class="flex-between gap-2 mt-3 wizard-acciones">
                   <button type="button" class="btn-secondary" id="wizard-atras">Atrás</button>
                   <div class="flex gap-2">
                       <button type="button" class="btn-secondary" id="btn-cancelar-empleado">Cancelar</button>
                       <button type="button" class="btn-primary" id="wizard-siguiente">Siguiente</button>
                       <button type="submit" class="btn-primary hidden" id="wizard-guardar">Crear empleado</button>
                   </div>
               </div>`
            : `<div class="flex-end gap-2 mt-3">
                   <button type="button" class="btn-secondary" id="btn-cancelar-empleado">Cancelar</button>
                   <button type="submit" class="btn-primary">Guardar cambios</button>
               </div>`;

        const modalContent = `
            <form id="employee-form" class="mt-2">
                <input type="hidden" id="emp-id" value="${isEdit ? user.id : ''}">
                ${indicador}
                ${cuerpo}
                ${acciones}
            </form>
        `;

        window.App.showModal(isEdit ? 'Editar empleado' : 'Nuevo empleado', modalContent);

        document
            .getElementById('btn-cancelar-empleado')
            .addEventListener('click', () => window.App.hideModal());

        // Correo o celular: al menos uno. Se valida con la validación nativa del
        // navegador para que el asistente lo frene en el paso 1.
        const emailInput = document.getElementById('emp-email');
        const phoneInput = document.getElementById('emp-phone');
        const exigirContacto = () => {
            const falta = !emailInput.value.trim() && !phoneInput.value.trim();
            emailInput.setCustomValidity(falta ? 'Ingrese el correo o el celular' : '');
        };
        emailInput.addEventListener('input', exigirContacto);
        phoneInput.addEventListener('input', exigirContacto);
        exigirContacto();

        if (porPasos) this.activarPasos();

        // Sedes para el alta. Se cargan después de abrir la ventana para no
        // demorarla; mientras tanto el campo dice "Cargando sedes…".
        const sedeSelect = document.getElementById('emp-sede');
        if (sedeSelect) {
            window.api
                .getWorksites()
                .then((res) => {
                    const sedes = (res.data || []).filter((s) => s.isActive !== false);
                    sedeSelect.innerHTML = `
                        <option value="" disabled selected>— Elegí la sede —</option>
                        ${sedes
                            .map((s) => `<option value="${s.id}">📍 ${this.esc(s.name)}</option>`)
                            .join('')}
                        <option value="DESPUES">⏳ Asignar después (la sede todavía no existe)</option>`;
                    sedeSelect.required = !document
                        .getElementById('emp-sede-grupo')
                        .classList.contains('hidden');
                    if (!sedes.length) {
                        sedeSelect.value = 'DESPUES';
                        document.getElementById('emp-sede-ayuda').textContent =
                            'Todavía no hay sedes cargadas. Créela en "Sedes" y asígnelo desde ahí.';
                    }
                })
                .catch(() => {
                    sedeSelect.innerHTML = '<option value="DESPUES">⏳ Asignar después</option>';
                });
        }

        // Calculate rate preview on input change
        const salaryInput = document.getElementById('emp-salary');
        const hoursInput = document.getElementById('emp-hours');
        const ratePreview = document.getElementById('emp-rate-preview');
        const puestoSelect = document.getElementById('emp-puesto');
        const puestoAyuda = document.getElementById('emp-puesto-ayuda');
        const AYUDA_PUESTO = {
            OPERATIVO: '📱 Usa la app del celular. Marca solo su propia entrada y salida.',
            ENCARGADO:
                '📱 Usa la app del celular. Marca su asistencia y la de los temporales y operativos de su sede.',
            ADMINISTRATIVO:
                '💻 Entra al panel web. Ve y paga solo al personal; su sueldo lo paga el gerente general.',
            GERENTE: '💻 Dueño de la empresa: ve y gestiona todo.',
        };
        const financialFields = document.getElementById('employee-financial-fields');
        const scheduleType = document.getElementById('emp-schedule-type');
        const blocksContainer = document.getElementById('schedule-blocks');
        scheduleType.value = user?.scheduleType || 'FULL_TIME';

        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        const addBlock = (block = { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }) => {
            const row = document.createElement('div');
            row.className = 'schedule-row';

            const dayOptions = dayNames
                .map(
                    (day, index) =>
                        `<option value="${index}" ${Number(block.dayOfWeek) === index ? 'selected' : ''}>${day}</option>`
                )
                .join('');

            row.innerHTML = `
                <select class="form-control schedule-day">${dayOptions}</select>
                <input class="form-control schedule-start" type="time" value="${this.esc(block.startTime)}" required>
                <input class="form-control schedule-end" type="time" value="${this.esc(block.endTime)}" required>
                <button type="button" class="btn-danger btn-sm schedule-remove">Eliminar</button>
                <small class="schedule-hint hidden">🌙 Sale al día siguiente: entra un día y termina pasada la medianoche.</small>
            `;

            // Un turno de noche (22:00 a 06:00) tiene la salida "antes" que la
            // entrada. En vez de explicarlo con una nota, se avisa en la fila
            // misma cuando pasa, para que no parezca un error de carga.
            const actualizarAviso = () => {
                const inicio = row.querySelector('.schedule-start').value;
                const fin = row.querySelector('.schedule-end').value;
                row.querySelector('.schedule-hint').classList.toggle('hidden', !(inicio && fin && fin <= inicio));
            };
            row.querySelector('.schedule-start').addEventListener('input', actualizarAviso);
            row.querySelector('.schedule-end').addEventListener('input', actualizarAviso);
            actualizarAviso();

            row.querySelector('.schedule-remove').addEventListener('click', () => row.remove());
            blocksContainer.appendChild(row);
        };

        // Un alta nueva arranca con el turno típico del personal de limpieza:
        // de lunes a sábado, de 06:00 a 14:00. Antes traía solo el lunes y había
        // que cargar los demás días a mano.
        const initialBlocks = user?.scheduleBlocks?.length
            ? user.scheduleBlocks
            : [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                  dayOfWeek,
                  startTime: '06:00',
                  endTime: '14:00',
              }));
        initialBlocks.forEach(addBlock);

        document.getElementById('add-schedule-block').addEventListener('click', () => addBlock());

        // Pone las horas del turno elegido en todos los días ya cargados (sin
        // tocar qué días son). Si la lista está vacía, arranca de lunes a sábado.
        document.querySelectorAll('[data-turno]').forEach((boton) => {
            boton.addEventListener('click', () => {
                const [startTime, endTime] = boton.dataset.turno.split('-');
                const dias = [
                    ...new Set(
                        [...blocksContainer.querySelectorAll('.schedule-day')].map((sel) => Number(sel.value))
                    ),
                ];
                blocksContainer.innerHTML = '';
                (dias.length ? dias : [1, 2, 3, 4, 5, 6]).forEach((dayOfWeek) =>
                    addBlock({ dayOfWeek, startTime, endTime })
                );
            });
        });

        // Toma las franjas del primer día de la lista y las replica en los
        // días elegidos, reemplazando lo que hubiera.
        document.querySelectorAll('[data-copiar-dias]').forEach((boton) => {
            boton.addEventListener('click', () => {
                const filas = [...blocksContainer.querySelectorAll('.schedule-row')];
                if (!filas.length) {
                    window.App.showToast('Cargue primero las horas de un día', 'warning');
                    return;
                }
                const primerDia = filas[0].querySelector('.schedule-day').value;
                const franjas = filas
                    .filter((fila) => fila.querySelector('.schedule-day').value === primerDia)
                    .map((fila) => ({
                        startTime: fila.querySelector('.schedule-start').value,
                        endTime: fila.querySelector('.schedule-end').value,
                    }));
                blocksContainer.innerHTML = '';
                boton.dataset.copiarDias
                    .split(',')
                    .map(Number)
                    .forEach((dayOfWeek) => franjas.forEach((franja) => addBlock({ dayOfWeek, ...franja })));
            });
        });

        const calculateRatePreview = () => {
            const monto = parseFloat(salaryInput.value) || 0;
            // Temporal: pago por día ÷ 8 h. Fijo: sueldo ÷ horas del mes (240).
            const horas = esTemporal() ? 8 : parseFloat(hoursInput.value) || 0;
            ratePreview.value = window.App.formatCurrency(horas > 0 ? monto / horas : 0);
        };

        // El temporal cobra por día; el fijo, un sueldo fijo al mes. El mismo
        // campo de monto cambia de significado según el tipo elegido.
        const typeSelect = document.getElementById('emp-type');
        const esTemporal = () => typeSelect.value === 'TEMPORAL';
        const ajustarTipo = () => {
            const temporal = esTemporal();
            document.getElementById('emp-salary-label').textContent = temporal
                ? 'Pago por día (Bs.)'
                : 'Sueldo mensual (Bs.)';
            document.getElementById('emp-salary-help').textContent = temporal
                ? 'Cobra solo los días que marca asistencia.'
                : 'El monto fijo que cobra por mes.';
            document.getElementById('emp-rate-help').textContent = temporal
                ? 'Pago por día ÷ 8 h. Se usa para retrasos y horas extra.'
                : 'Sueldo ÷ 30 días ÷ 8 h. Se usa para retrasos y horas extra.';
            salaryInput.placeholder = temporal ? 'Ej.: 120' : 'Ej.: 3000';
            calculateRatePreview();
        };
        typeSelect.addEventListener('change', ajustarTipo);

        // Los administrativos cobran sueldo como el resto; solo el gerente
        // general no figura en la planilla.
        const toggleFinancialFields = () => {
            puestoAyuda.textContent = AYUDA_PUESTO[puestoSelect.value] || '';
            // El administrativo trabaja en la oficina: no se le pregunta sede.
            const grupoSede = document.getElementById('emp-sede-grupo');
            if (grupoSede) {
                const esOficina = ['ADMINISTRATIVO', 'GERENTE'].includes(puestoSelect.value);
                grupoSede.classList.toggle('hidden', esOficina);
                const select = document.getElementById('emp-sede');
                if (select && select.options.length > 1) select.required = !esOficina;
            }
            if (puestoSelect.value === 'GERENTE') {
                financialFields.style.opacity = '0.5';
                salaryInput.disabled = true;
                hoursInput.disabled = true;
                salaryInput.value = '0';
                hoursInput.value = String(HORAS_LEGALES_MES);
                ratePreview.value = 'N/A';
            } else {
                financialFields.style.opacity = '1';
                salaryInput.disabled = false;
                hoursInput.disabled = false;
                calculateRatePreview();
            }
        };

        salaryInput.addEventListener('input', calculateRatePreview);
        puestoSelect.addEventListener('change', toggleFinancialFields);

        // Run calculations initially
        toggleFinancialFields();
        ajustarTipo();

        // Submit listener
        document.getElementById('employee-form').addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = document.getElementById('emp-id').value;
            const data = {
                firstName: document.getElementById('emp-firstname').value,
                lastName: document.getElementById('emp-lastname').value,
                phone: document.getElementById('emp-phone').value.trim(),
                // El puesto define rol, encargado y área contable de una vez.
                role: ['ADMINISTRATIVO', 'GERENTE'].includes(puestoSelect.value) ? 'ADMIN' : 'EMPLOYEE',
                isSiteManager: puestoSelect.value === 'ENCARGADO',
                employeeType: document.getElementById('emp-type').value,
                staffCategory: ['ADMINISTRATIVO', 'GERENTE'].includes(puestoSelect.value)
                    ? 'ADMINISTRATIVO'
                    : 'OPERATIVO',
                monthlyHours: parseFloat(document.getElementById('emp-hours').value),
                scheduleType: scheduleType.value,
                scheduleBlocks: [...blocksContainer.querySelectorAll('.schedule-row')].map(
                    (row, index) => ({
                        dayOfWeek: Number(row.querySelector('.schedule-day').value),
                        startTime: row.querySelector('.schedule-start').value,
                        endTime: row.querySelector('.schedule-end').value,
                        blockOrder: index + 1,
                    })
                ),
            };

            if (!isEdit || !user.email) {
                data.email = document.getElementById('emp-email').value.trim() || undefined;
            }

            const monto = parseFloat(document.getElementById('emp-salary').value) || 0;
            if (data.employeeType === 'TEMPORAL') {
                data.dailyWage = monto;
                data.monthlySalary = 0;
            } else {
                data.monthlySalary = monto;
                data.dailyWage = 0;
            }

            // La hora de ingreso ya no se pregunta: es el primer turno del
            // horario. Solo la usan los empleados sin horario cargado.
            const inicios = data.scheduleBlocks.map((bloque) => bloque.startTime).filter(Boolean).sort();
            data.scheduledEntryTime = inicios[0] || user?.scheduledEntryTime || '08:00';

            try {
                let creado = null;
                if (isEdit) {
                    await window.api.updateUser(id, data);
                    window.App.showToast('Empleado actualizado correctamente', 'success');
                } else {
                    creado = (await window.api.createUser(data)).data;
                    const sedeId = sedeSelect?.value;
                    const asignar = data.role === 'EMPLOYEE' && sedeId && sedeId !== 'DESPUES';
                    if (asignar) {
                        const fallos = await this.asignarSedeSegunHorario(
                            creado.id,
                            Number(sedeId),
                            data.scheduleBlocks
                        );
                        window.App.showToast(
                            fallos
                                ? `Empleado creado, pero ${fallos} día(s) no se pudieron asignar a la sede. Revíselo en "Sedes".`
                                : 'Empleado creado y asignado a su sede',
                            fallos ? 'warning' : 'success'
                        );
                    } else {
                        window.App.showToast(
                            data.role === 'EMPLOYEE'
                                ? 'Empleado creado. Queda arriba en la lista hasta que le asigne una sede.'
                                : 'Empleado creado correctamente',
                            'success'
                        );
                    }
                }
                window.App.hideModal();
                await this.loadEmployees();
                if (creado?.temporaryPassword) this.mostrarClaveTemporal(creado, creado.temporaryPassword);
            } catch (error) {
                window.App.showToast('Error al guardar empleado: ' + error.message, 'error');
            }
        });
    },

    /**
     * Muestra la clave temporal cuando el correo no pudo enviarse.
     *
     * Es la única vez que se ve: el servidor guarda solo el hash. Por eso se
     * ofrece copiarla con el mensaje completo, listo para pegar en WhatsApp.
     */
    mostrarClaveTemporal(user, clave) {
        const usuario = user.email || user.phone;
        // El personal marca desde la app: el mensaje lleva el enlace de descarga.
        const esEmpleado = user.role !== 'ADMIN';
        const descarga = `${window.location.origin}/descargar/`;
        // Formato de WhatsApp: *negrita* y emojis, parecido al correo.
        const mensaje = esEmpleado
            ? `👋 *¡Hola, ${user.firstName}!*\n` +
              'Se creó tu acceso a la *app de asistencia*.\n\n' +
              `📲 *1. Descargá la app (Android)*\n${descarga}\n\n` +
              '🔐 *2. Entrá con estos datos*\n' +
              `👤 Usuario: *${usuario}*\n` +
              `🔑 Contraseña temporal: *${clave}*\n\n` +
              '✅ Al entrar por primera vez te pedirá elegir tu propia contraseña.\n\n' +
              '_Planilla de Pago_'
            : `👋 *¡Hola, ${user.firstName}!*\n` +
              'Se creó tu acceso al *sistema de planillas*.\n\n' +
              `🌐 *Entrá desde:* ${window.location.origin}\n` +
              `👤 Usuario: *${usuario}*\n` +
              `🔑 Contraseña temporal: *${clave}*\n\n` +
              '✅ Al entrar por primera vez te pedirá cambiarla.\n\n' +
              '_Planilla de Pago_';

        // Con celular, WhatsApp se abre directo en el chat del empleado (código
        // de Bolivia 591). Sin celular, WhatsApp deja elegir el contacto.
        const celular = String(user.phone || '').replace(/\D/g, '').replace(/^591/, '');
        // En computadora se abre WhatsApp Web en otra pestaña, directo en el
        // chat; en el celular, la app de WhatsApp.
        const esCelular = /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
        const texto = encodeURIComponent(mensaje);
        const enlaceWhatsapp = esCelular
            ? `https://wa.me/${celular ? `591${celular}` : ''}?text=${texto}`
            : `https://web.whatsapp.com/send?${celular ? `phone=591${celular}&` : ''}text=${texto}`;

        window.App.showModal(
            'Entregue estos datos al empleado',
            `
            <div class="mt-2">
                <p class="text-muted">
                    ${user.email ? 'El correo no pudo enviarse, así' : 'No tiene correo, así'} que envíele estos datos por WhatsApp${celular ? ` a su celular <strong>${this.esc(celular)}</strong>` : ''}.
                    <strong>Anótelos ahora:</strong> la contraseña no se vuelve a mostrar.
                </p>
                <div class="clave-temporal mt-3">
                    <div><span class="text-muted">Usuario (correo o celular)</span><br><strong>${this.esc(usuario)}</strong></div>
                    <div class="mt-2"><span class="text-muted">Contraseña temporal</span><br>
                        <strong class="clave-temporal-valor">${this.esc(clave)}</strong></div>
                </div>
                ${
                    esEmpleado
                        ? `<p class="text-muted text-sm mt-3">El mensaje incluye el enlace para descargar la app: <strong>${this.esc(descarga)}</strong></p>`
                        : ''
                }
                <a class="btn-whatsapp mt-4" id="btn-whatsapp-clave" target="_blank" rel="noopener"
                   href="${enlaceWhatsapp}">
                    💬 ${celular ? `Enviar por WhatsApp a ${this.esc(celular)}` : 'Enviar por WhatsApp'}
                </a>
                <div class="flex-end gap-2 mt-3 flex-wrap">
                    <button class="btn-secondary" id="btn-copiar-clave">📋 Copiar mensaje</button>
                    <button class="btn-primary" id="btn-cerrar-clave">Listo</button>
                </div>
            </div>
        `
        );

        document.getElementById('btn-cerrar-clave').addEventListener('click', () => window.App.hideModal());
        document.getElementById('btn-copiar-clave').addEventListener('click', async () => {
            try {
                await window.navigator.clipboard.writeText(mensaje);
                window.App.showToast('Mensaje copiado. Péguelo en WhatsApp.', 'success');
            } catch {
                window.App.showToast('No se pudo copiar; anote los datos a mano.', 'warning');
            }
        });
    },

    confirmDeactivate(user) {
        const fullName = `${user.firstName} ${user.lastName}`;
        const modalContent = `
            <div class="mt-2">
                <p>¿Estás seguro de que deseas desactivar a <strong>${this.esc(fullName)}</strong>?</p>
                <p class="text-muted text-sm mt-2">Esta acción impedirá que se registren asistencias o se calcule su nómina. Toda la información histórica se mantendrá intacta.</p>
                <div class="flex-end gap-2 mt-4">
                    <button class="btn-secondary" id="btn-cancel-deactivate">Cancelar</button>
                    <button class="btn-danger" id="btn-confirm-deactivate">Confirmar Desactivación</button>
                </div>
            </div>
        `;
        window.App.showModal('Confirmar Desactivación', modalContent);

        document
            .getElementById('btn-cancel-deactivate')
            .addEventListener('click', () => window.App.hideModal());
        document
            .getElementById('btn-confirm-deactivate')
            .addEventListener('click', () => this.deactivate(user.id));
    },

    confirmResetPassword(user) {
        const fullName = `${user.firstName} ${user.lastName}`;
        window.App.showModal(
            'Restablecer acceso',
            `
            <div class="mt-2">
                <p>Se generará una contraseña temporal para <strong>${this.esc(fullName)}</strong> ${user.email ? `y se enviará a <strong>${this.esc(user.email)}</strong>` : 'y se le mostrará en pantalla para que se la pase por mensaje'}.</p>
                <p class="text-muted text-sm mt-2">
                    Su contraseña actual dejará de funcionar de inmediato. Al ingresar, el sistema
                    le pedirá definir una nueva.
                </p>
                <div class="flex-end gap-2 mt-4">
                    <button class="btn-secondary" id="btn-cancel-reset">Cancelar</button>
                    <button class="btn-primary" id="btn-confirm-reset">Enviar credenciales</button>
                </div>
            </div>
        `
        );

        document
            .getElementById('btn-cancel-reset')
            .addEventListener('click', () => window.App.hideModal());

        document.getElementById('btn-confirm-reset').addEventListener('click', async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            button.textContent = 'Enviando…';

            try {
                const response = await window.api.resetUserPassword(user.id);
                const result = response.data || {};
                window.App.hideModal();

                // La contraseña ya fue rotada aunque el correo falle: hay que decirlo.
                if (result.credentialsDelivered) {
                    window.App.showToast(`Credenciales enviadas a ${user.email}.`, 'success');
                }
                await this.loadEmployees();
                if (!result.credentialsDelivered && result.temporaryPassword) {
                    this.mostrarClaveTemporal(user, result.temporaryPassword);
                }
            } catch (error) {
                window.App.showToast('No se pudo restablecer el acceso: ' + error.message, 'error');
                button.disabled = false;
                button.textContent = 'Enviar credenciales';
            }
        });
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
    },
};
