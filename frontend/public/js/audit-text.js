/**
 * Auditoría en palabras.
 *
 * El registro guarda códigos pensados para la base de datos ("CREATE",
 * "WorksiteAssignment", id 51). Acá se traducen a frases que entiende quien
 * administra la empresa: "Asignó a Carla a la sede Balsoft (lunes, 06:00 a
 * 14:00)". Si aparece un código que todavía no tiene frase, se muestra uno
 * genérico en vez de romper la pantalla.
 *
 * `contexto` trae los nombres para no mostrar números:
 *   { empleados: Map(id → "Nombre Apellido"), sedes: Map(id → "Sede") }
 */
window.Auditoria = {
    DIAS: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    MESES: [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ],

    /** Nombres de campos para el detalle de "qué cambió". */
    CAMPOS: {
        firstName: 'Nombre',
        lastName: 'Apellido',
        email: 'Correo',
        phone: 'Celular',
        role: 'Rol',
        employeeType: 'Tipo de empleado',
        staffCategory: 'Área',
        isSiteManager: 'Encargado de sede',
        isOwner: 'Gerente general',
        monthlySalary: 'Sueldo mensual',
        dailyWage: 'Pago por día',
        hourlyRate: 'Valor de la hora',
        monthlyHours: 'Horas del mes',
        scheduledEntryTime: 'Hora de ingreso',
        scheduleType: 'Tipo de horario',
        isActive: 'Activo',
        name: 'Nombre',
        address: 'Dirección',
        radiusMeters: 'Radio de la zona (metros)',
        taxId: 'NIT',
        contactName: 'Persona de contacto',
        contactPhone: 'Teléfono de contacto',
        contactEmail: 'Correo de contacto',
        notes: 'Notas',
        reference: 'N.º de contrato',
        paymentTerms: 'Cuándo cobra',
        billingDay: 'Día de cobro',
        startDate: 'Fecha de inicio',
        endDate: 'Fecha de fin',
        amount: 'Monto',
        validFrom: 'Rige desde',
        month: 'Mes',
        year: 'Año',
        date: 'Fecha',
        workDate: 'Fecha',
        startTime: 'Desde',
        endTime: 'Hasta',
        dayOfWeek: 'Día',
        hours: 'Horas',
        reason: 'Motivo',
        description: 'Descripción',
        status: 'Estado',
        extraDayFactor: 'Jornales por día extra',
        netPay: 'Neto pagado',
        workedMinutes: 'Minutos trabajados',
        delayMinutes: 'Minutos de retraso',
    },

    /** Campos internos que no le dicen nada a quien lee el registro. */
    OCULTOS: new Set([
        'id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'companyId', 'password',
        'userId', 'clientId', 'contractId', 'worksiteId', 'attendanceId', 'scheduleBlockId',
        'passwordSetAt', 'mustChangePassword', 'lastLoginAt', 'credentialsSentAt',
        'credentialsError', 'photoUrl', 'photoPublicId', 'clockOutPhotoUrl',
        'clockOutPhotoPublicId', 'receiptPhotoPublicId', 'deviceInfo', 'matchedWorksiteId',
        'capturedLatitude', 'capturedLongitude', 'pdfPath', 'scheduleBlocks', 'details',
    ]),

    VALORES: {
        FIJO: 'Fijo', TEMPORAL: 'Temporal', ADMIN: 'Administrador', EMPLOYEE: 'Empleado',
        OPERATIVO: 'Operativo', ADMINISTRATIVO: 'Administrativo',
        ANTICIPADO: 'Por adelantado', POSTERIOR: 'A mes vencido',
        PENDING: 'Pendiente', APPROVED: 'Aprobado', REJECTED: 'Rechazado',
        CANCELLED: 'Cancelado', JUSTIFIED: 'Justificado',
        FULL_TIME: 'Jornada completa', FLEXIBLE: 'Flexible', SPECIFIC_DAYS: 'Días específicos',
    },

    esc(valor) {
        return window.UI.escapeHtml(valor == null ? '' : String(valor));
    },

    fecha(valor) {
        if (!valor) return '';
        return String(valor).slice(0, 10).split('-').reverse().join('/');
    },

    dinero(valor) {
        return window.App.formatCurrency(Number(valor || 0));
    },

    /** Nombre de la persona afectada, sacado del registro o de la lista. */
    empleado(row, contexto) {
        const datos = row.newData || row.previousData || {};
        if (datos.firstName) return `${datos.firstName} ${datos.lastName || ''}`.trim();
        const id = row.employeeId || datos.userId;
        return contexto.empleados.get(Number(id)) || 'un empleado';
    },

    sede(datos, contexto) {
        return datos.worksite?.name || contexto.sedes.get(Number(datos.worksiteId)) || 'una sede';
    },

    /** Frase principal: qué hizo, en una línea. */
    describir(row, contexto) {
        const n = row.newData || {};
        const p = row.previousData || {};
        const d = { ...p, ...n };
        const quien = () => this.empleado(row, contexto);
        const mes = (m, y) => (m ? `${this.MESES[Number(m) - 1]} ${y || ''}`.trim() : '');
        const clave = `${row.action}:${row.entity}`;

        // Actividad general (descargas, subidas, ingresos…): ya trae su texto.
        if (row.action === 'ACTIVIDAD' && n.descripcion) {
            return `${n.descripcion} (${row.entity})`;
        }

        const frases = {
            'CREATE:User': () => `Dio de alta a ${quien()}`,
            'UPDATE:User': () => `Modificó los datos de ${quien()}`,
            'DEACTIVATE:User': () => `Dio de baja a ${quien()}`,
            'RESET_PASSWORD:User': () => `Generó una contraseña nueva para ${quien()}`,
            'CHANGE_PASSWORD:User': () => 'Cambió su contraseña',
            'UPDATE_PROFILE:User': () => 'Actualizó sus datos personales',

            'CREATE:WorksiteAssignment': () => {
                const dia = d.dayOfWeek != null ? this.DIAS[Number(d.dayOfWeek)] : this.fecha(d.specificDate);
                const horas = d.startTime && d.endTime ? `, ${d.startTime} a ${d.endTime}` : ', toda la jornada';
                return `Asignó a ${quien()} a la sede ${this.sede(d, contexto)} (${dia}${horas})`;
            },
            'DEACTIVATE:WorksiteAssignment': () => {
                const dia = d.dayOfWeek != null ? ` los ${this.DIAS[Number(d.dayOfWeek)]}` : '';
                return `Quitó a ${quien()} de la sede ${this.sede(d, contexto)}${dia}`;
            },
            'CREATE:Worksite': () => `Creó la sede ${d.name || ''}`,
            'UPDATE:Worksite': () => `Modificó la sede ${d.name || ''}`,
            'DEACTIVATE:Worksite': () => `Desactivó la sede ${d.name || ''}`,

            'CREATE:Client': () => `Registró al cliente ${d.name || ''}`,
            'UPDATE:Client': () => `Modificó los datos del cliente ${d.name || ''}`,
            'DEACTIVATE:Client': () => `Dio de baja al cliente ${d.name || ''}`,
            'CREATE:Contract': () => `Creó el contrato "${d.name || ''}"`,
            'UPDATE:Contract': () => `Modificó el contrato "${d.name || ''}"`,
            'CREATE:ContractRate': () =>
                `Cargó un monto nuevo de ${this.dinero(d.amount)} para un contrato, desde el ${this.fecha(d.validFrom)}`,
            'COLLECT:ContractCollection': () =>
                `Registró el cobro de ${mes(d.month, d.year)} (${this.dinero(d.amount)})`,
            'DELETE:ContractCollection': () => `Deshizo el cobro de ${mes(d.month, d.year)}`,

            'PAY:Payment': () =>
                `Pagó el sueldo de ${mes(d.month, d.year)} a ${quien()}${d.netPay ? ` (${this.dinero(d.netPay)})` : ''}`,
            'ATTACH_RECEIPT:Payment': () => `Adjuntó el recibo firmado de ${quien()}`,
            'REMOVE_RECEIPT:Payment': () => `Quitó el recibo firmado de ${quien()}`,
            'GENERATE_MONTHLY_PDF:PaymentReport': () =>
                `Descargó el reporte mensual de planilla${d.month ? ` de ${mes(d.month, d.year)}` : ''}`,

            'CLOCK_IN:AttendanceSession': () => `Registró la entrada de ${quien()}`,
            'CLOCK_OUT:AttendanceSession': () => `Registró la salida de ${quien()}`,
            'SELF_CLOCK_IN:AttendanceSession': () => `${quien()} marcó su entrada desde la app`,
            'SELF_CLOCK_OUT:AttendanceSession': () => `${quien()} marcó su salida desde la app`,
            'MANUAL_CLOCK_IN:AttendanceSession': () => `Registró a mano la entrada de ${quien()}`,
            'REGISTER_WORKED_DAY:AttendanceSession': () =>
                `Registró un día trabajado de ${quien()}${d.workDate ? ` (${this.fecha(d.workDate)})` : ''}`,
            'REVIEW_APPROVED:AttendanceSession': () => `Aprobó una marcación dudosa de ${quien()}`,
            'REVIEW_REJECTED:AttendanceSession': () => `Rechazó una marcación dudosa de ${quien()}`,
            'JUSTIFIED:AttendanceJustification': () => `Justificó un retraso de ${quien()}`,
            'REJECTED:AttendanceJustification': () => `Rechazó la justificación de un retraso de ${quien()}`,
            'PENDING:AttendanceJustification': () => `Dejó pendiente la justificación de ${quien()}`,
            'UPSERT:Attendance': () => `Registró la asistencia de ${quien()}`,

            'CREATE:Overtime': () => `Registró horas extra de ${quien()}`,
            'UPDATE:Overtime': () => `Modificó horas extra de ${quien()}`,
            'APPROVED:Overtime': () => `Aprobó horas extra de ${quien()}`,
            'REJECTED:Overtime': () => `Rechazó horas extra de ${quien()}`,
            'CANCELLED:Overtime': () => `Canceló horas extra de ${quien()}`,
            'DELETE:Overtime': () => `Eliminó horas extra de ${quien()}`,
            'CREATE:Discount': () =>
                `Registró un descuento de ${this.dinero(d.amount)} a ${quien()}`,
            'APPROVED:Discount': () => `Aprobó un descuento de ${quien()}`,
            'REJECTED:Discount': () => `Rechazó un descuento de ${quien()}`,
            'CANCELLED:Discount': () => `Canceló un descuento de ${quien()}`,
            'USE:TimeCompensation': () => `Usó horas de compensación de ${quien()}`,

            'CREATE:Holiday': () => `Agregó el feriado "${d.name || ''}" (${this.fecha(d.date)})`,
            'DELETE:Holiday': () => `Quitó el feriado "${d.name || ''}" (${this.fecha(d.date)})`,
            'UPDATE:Company': () =>
                d.extraDayFactor != null
                    ? `Cambió el pago de domingos y feriados a ${d.extraDayFactor} jornal(es) por día`
                    : 'Modificó los datos de la empresa',

            'CREATE:ExpenseCategory': () => `Creó la categoría de gasto "${d.name || ''}"`,
            'UPDATE:ExpenseCategory': () => `Modificó la categoría de gasto "${d.name || ''}"`,
            'RESTORE_DEFAULTS:ExpenseCategory': () => 'Restauró las categorías de gasto predefinidas',
            'CREATE:StatementEntry': () =>
                `Cargó ${d.type === 'OTHER_INCOME' ? 'un ingreso' : 'un gasto'} de ${this.dinero(d.amount)}${d.description ? ` (${d.description})` : ''}`,
            'UPDATE:StatementEntry': () => `Modificó un movimiento del estado de resultados`,
            'CREATE_TEST_DATA:Discount': () => 'Cargó datos de prueba',
            'DELETE:StatementEntry': () =>
                `Quitó ${d.type === 'OTHER_INCOME' ? 'un ingreso' : 'un gasto'} de ${this.dinero(d.amount)}`,
        };

        if (frases[clave]) return frases[clave]();
        // Categorías de gasto: la acción guarda si se borró o se desactivó.
        if (row.entity === 'ExpenseCategory') return `Quitó la categoría de gasto "${d.name || ''}"`;
        return 'Hizo un cambio en el sistema';
    },

    /**
     * Agrupa en una sola línea las asignaciones a sede hechas de una vez.
     *
     * Asignar a alguien de lunes a sábado guarda una fila por día; en el
     * registro eso se veía como seis líneas casi iguales. Se juntan las que
     * son del mismo autor, persona, sede, horario y minuto.
     *
     * @returns {Array<{row, frase}>} `row` es el primero del grupo (para el detalle)
     */
    agrupar(rows, contexto) {
        const ORDEN = [1, 2, 3, 4, 5, 6, 0];
        const grupos = [];
        const porClave = new Map();

        rows.forEach((row) => {
            const d = { ...(row.previousData || {}), ...(row.newData || {}) };
            const esAsignacion =
                row.entity === 'WorksiteAssignment' &&
                ['CREATE', 'DEACTIVATE'].includes(row.action) &&
                d.dayOfWeek != null;

            if (!esAsignacion) {
                grupos.push({ row, frase: this.describir(row, contexto) });
                return;
            }

            const clave = [
                row.actorId,
                row.action,
                row.employeeId || d.userId,
                d.worksiteId,
                d.startTime,
                d.endTime,
                String(row.createdAt).slice(0, 16),
            ].join('|');

            if (porClave.has(clave)) {
                porClave.get(clave).dias.push(Number(d.dayOfWeek));
                return;
            }
            const grupo = { row, d, dias: [Number(d.dayOfWeek)] };
            porClave.set(clave, grupo);
            grupos.push(grupo);
        });

        return grupos.map((g) => {
            if (g.frase) return g;
            if (g.dias.length === 1) return { row: g.row, frase: this.describir(g.row, contexto) };

            const dias = ORDEN.filter((dia) => g.dias.includes(dia));
            const consecutivos = dias.every((dia, i) => i === 0 || ORDEN.indexOf(dia) === ORDEN.indexOf(dias[i - 1]) + 1);
            const textoDias =
                dias.length === 7
                    ? 'todos los días'
                    : consecutivos
                      ? `${this.DIAS[dias[0]]} a ${this.DIAS[dias[dias.length - 1]]}`
                      : dias.map((dia) => this.DIAS[dia]).join(', ');
            const horas = g.d.startTime && g.d.endTime ? `${g.d.startTime} a ${g.d.endTime}` : 'toda la jornada';
            const persona = this.empleado(g.row, contexto);
            const sede = this.sede(g.d, contexto);
            const frase =
                g.row.action === 'CREATE'
                    ? `Asignó a ${persona} a la sede ${sede} (${textoDias}, ${horas})`
                    : `Quitó a ${persona} de la sede ${sede} (${textoDias})`;
            return { row: g.row, frase };
        });
    },

    valor(campo, v, contexto) {
        if (v == null || v === '') return '—';
        if (typeof v === 'boolean') return v ? 'Sí' : 'No';
        if (campo === 'dayOfWeek') return this.DIAS[Number(v)] || v;
        if (campo === 'month') return this.MESES[Number(v) - 1] || v;
        if (['monthlySalary', 'dailyWage', 'hourlyRate', 'amount', 'netPay'].includes(campo)) {
            return this.dinero(v);
        }
        if (/Date$|^date$|^validFrom$|^workDate$/.test(campo)) return this.fecha(v);
        if (campo === 'worksiteId') return contexto.sedes.get(Number(v)) || v;
        if (typeof v === 'object') return '';
        return this.VALORES[v] || String(v);
    },

    /**
     * Detalle legible para "Ver detalle": qué cambió (antes → después) o los
     * datos cargados, solo con los campos que tienen sentido para una persona.
     */
    detalleHtml(row, contexto) {
        const antes = row.previousData || {};
        const despues = row.newData || {};
        const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter(
            (c) => !this.OCULTOS.has(c) && typeof (despues[c] ?? antes[c]) !== 'object'
        );

        const conCambio = row.previousData && row.newData;
        const filas = campos
            .filter((c) => !conCambio || String(antes[c]) !== String(despues[c]))
            .map((c) => {
                const etiqueta = this.CAMPOS[c] || c;
                return conCambio
                    ? `<tr><td>${this.esc(etiqueta)}</td><td>${this.esc(this.valor(c, antes[c], contexto))}</td><td>${this.esc(this.valor(c, despues[c], contexto))}</td></tr>`
                    : `<tr><td>${this.esc(etiqueta)}</td><td>${this.esc(this.valor(c, despues[c] ?? antes[c], contexto))}</td></tr>`;
            })
            .join('');

        const quien = row.actor ? `${row.actor.firstName} ${row.actor.lastName}` : 'El sistema';
        const tabla = filas
            ? `<div class="table-container mt-3"><table class="table">
                   <thead><tr><th>Dato</th>${conCambio ? '<th>Antes</th><th>Después</th>' : '<th>Valor</th>'}</tr></thead>
                   <tbody>${filas}</tbody>
               </table></div>`
            : '<p class="text-muted mt-3">No hay más datos para mostrar.</p>';

        return `
            <div class="mt-2">
                <p class="auditoria-frase">${this.esc(this.describir(row, contexto))}</p>
                <p class="text-muted text-sm">
                    ${this.esc(quien)} · ${new Date(row.createdAt).toLocaleString('es-BO')}
                    ${row.reason ? `<br>Motivo: ${this.esc(row.reason)}` : ''}
                </p>
                ${tabla}
                <details class="mt-3 text-sm text-muted">
                    <summary>Datos técnicos (para soporte)</summary>
                    <pre class="audit-json">${this.esc(JSON.stringify({ accion: row.action, entidad: row.entity, id: row.entityId, antes: row.previousData, despues: row.newData }, null, 2))}</pre>
                </details>
            </div>`;
    },
};
