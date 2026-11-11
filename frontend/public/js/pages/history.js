/**
 * HistoryPage - Historial de Pagos de Nómina (Admin Only)
 */
window.HistoryPage = {
    filters: {
        userId: '',
        month: '',
        year: '',
    },
    users: [],
    /** Pagos del listado actual. Los necesita el gestor de recibos. */
    payments: [],

    async render() {
        return `
            <div class="page-header flex-between">
                <div>
                    <h1 class="page-title">📜 Historial de Pagos</h1>
                    <p class="page-subtitle">Consulta todos los pagos de nómina procesados y descarga sus comprobantes en PDF.</p>
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
                                <th>Boleta</th>
                                <th>Recibo firmado</th>
                                <th class="text-right">Comprobante</th>
                            </tr>
                        </thead>
                        <tbody id="history-table-body">
                            <tr>
                                <td colspan="12" class="text-center text-muted">Cargando historial de pagos...</td>
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
            this.users = (res.data || []).filter((u) => u.isActive && u.role !== 'ADMIN');
            const selectUser = document.getElementById('history-user');
            if (selectUser) {
                selectUser.innerHTML =
                    '<option value="">Todos los Empleados</option>' +
                    this.users
                        .map(
                            (u) =>
                                `<option value="${u.id}">${window.UI.escapeHtml(`${u.firstName} ${u.lastName}`)}</option>`
                        )
                        .join('');
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
        document.getElementById('btn-monthly-report').addEventListener('click', async (event) => {
            const button = event.currentTarget;
            const month = Number(document.getElementById('history-month').value);
            const year = Number(document.getElementById('history-year').value);

            if (!month || !year) {
                window.App.showToast('Seleccione mes y año para generar el reporte', 'warning');
                return;
            }

            button.disabled = true;
            try {
                await window.api.downloadMonthlyReport(month, year);
                window.App.showToast('Reporte mensual generado', 'success');
            } catch (error) {
                window.App.showToast(error.message, 'error');
            } finally {
                button.disabled = false;
            }
        });

        document.getElementById('history-table-body').addEventListener('click', (event) => {
            const desglose = event.target.closest('[data-action="ver-desglose"]');
            if (desglose) {
                const pago = this.payments.find((item) => item.id === Number(desglose.dataset.paymentId));
                if (pago) this.abrirDesglose(pago);
                return;
            }

            const recibo = event.target.closest('[data-action="manage-receipt"]');
            if (recibo) {
                const pago = this.payments.find(
                    (item) => item.id === Number(recibo.dataset.paymentId)
                );
                // El listado se recarga al terminar para que la insignia
                // refleje el cambio sin que haya que volver a filtrar.
                if (pago) window.Receipt.abrir(pago, () => this.loadHistory());
                return;
            }

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

    /** Nombre en palabras de cada tipo de descuento. */
    TIPOS_DESCUENTO: {
        UNJUSTIFIED_DELAY: 'Retraso sin justificar',
        SALARY_ADVANCE: 'Adelanto de sueldo',
        COMPANY_DAMAGE: 'Daño a la empresa',
        LOAN: 'Préstamo',
        UNJUSTIFIED_ABSENCE: 'Falta sin justificar',
        OTHER: 'Otro descuento',
    },

    /**
     * Desglose de un pago: de qué se compone lo que cobró y de qué se le
     * descontó, línea por línea. Sale de los detalles guardados al pagar;
     * los pagos más viejos, que no los tienen, se arman con los totales.
     */
    abrirDesglose(pago) {
        const meses = [
            'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
        ];
        const esc = (v) => window.UI.escapeHtml(v == null ? '' : String(v));
        const dinero = (v) => window.App.formatCurrency(Number(v || 0));
        const fecha = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
        const detalles = pago.details || [];

        // --- Ingresos ---
        let ingresos = detalles
            .filter((d) => d.type === 'INCOME')
            .map((d) => {
                if (d.code === 'DAYS_WORKED') {
                    return { concepto: 'Días trabajados', detalle: `${Number(d.quantity)} días × ${dinero(d.rate)}`, monto: d.amount };
                }
                if (d.code === 'EXTRA_DAYS') {
                    const dias = (d.metadata?.days || []).map((x) => `${fecha(x.date)} (${x.reason})`).join(', ');
                    return { concepto: 'Domingos y feriados trabajados', detalle: dias, monto: d.amount };
                }
                if (d.code === 'OVERTIME') {
                    return { concepto: 'Horas extra', detalle: `${Number(d.quantity || 0).toFixed(2)} h · ${d.description.replace(/^Horas extra: /, '')}`, monto: d.amount };
                }
                return { concepto: 'Sueldo del mes', detalle: '', monto: d.amount };
            });
        if (!ingresos.length) {
            ingresos = [{ concepto: 'Sueldo del mes', detalle: '', monto: pago.monthlySalary }];
            if (Number(pago.overtimeAmount) > 0) {
                ingresos.push({ concepto: 'Horas extra', detalle: '', monto: pago.overtimeAmount });
            }
        }

        // --- Descuentos ---
        const minutosJustificados = Number(pago.justifiedDelayMinutes || 0);
        const minutosDescontados = Math.max(0, Number(pago.totalDelayMinutes || 0) - minutosJustificados);
        const lineaRetraso = (monto) => ({
            tipo: this.TIPOS_DESCUENTO.UNJUSTIFIED_DELAY,
            detalle:
                `${minutosDescontados} min en el mes` +
                (minutosJustificados ? ` (otros ${minutosJustificados} min se justificaron y no se descuentan)` : ''),
            fecha: '',
            monto,
        });

        let descuentos = detalles
            .filter((d) => d.type === 'DISCOUNT')
            .map((d) =>
                d.code === 'UNJUSTIFIED_DELAY'
                    ? lineaRetraso(d.amount)
                    : {
                          tipo: this.TIPOS_DESCUENTO[d.code] || this.TIPOS_DESCUENTO.OTHER,
                          detalle: [d.description, d.discount?.documentReference ? `Comprobante: ${d.discount.documentReference}` : '', d.discount?.notes || '']
                              .filter(Boolean)
                              .join(' · '),
                          fecha: fecha(d.discount?.discountDate),
                          monto: d.amount,
                      }
            );
        // Pagos viejos sin detalle: el único descuento posible era el retraso.
        if (!descuentos.length && Number(pago.discountAmount) > 0) {
            descuentos = [lineaRetraso(pago.discountAmount)];
        }

        const totalIngresos = Number(pago.totalIncome || pago.grossPay || 0);
        const totalDescuentos = Number(pago.totalDiscounts || pago.discountAmount || 0);

        window.App.showModal(
            `Detalle del pago · ${esc(pago.user.firstName)} ${esc(pago.user.lastName)}`,
            `
            <div class="mt-2 desglose-pago">
                <p class="text-muted text-sm mb-3">Sueldo de ${meses[pago.month - 1]} ${pago.year}, pagado el ${new Date(pago.paidAt).toLocaleDateString('es-BO')}.</p>

                <h4 class="desglose-titulo text-success">Lo que cobró</h4>
                <table class="table">
                    <tbody>
                        ${ingresos
                            .map(
                                (i) => `<tr><td><strong>${esc(i.concepto)}</strong>${i.detalle ? `<br><span class="text-muted text-sm">${esc(i.detalle)}</span>` : ''}</td><td class="text-right text-success">${dinero(i.monto)}</td></tr>`
                            )
                            .join('')}
                        <tr class="desglose-total"><td>Total ingresos</td><td class="text-right">${dinero(totalIngresos)}</td></tr>
                    </tbody>
                </table>

                <h4 class="desglose-titulo text-danger mt-3">Lo que se le descontó</h4>
                ${
                    descuentos.length
                        ? `<table class="table">
                               <tbody>
                                   ${descuentos
                                       .map(
                                           (d) => `<tr><td><strong>${esc(d.tipo)}</strong>${d.fecha ? ` <span class="text-muted text-sm">· ${esc(d.fecha)}</span>` : ''}${d.detalle ? `<br><span class="text-muted text-sm">${esc(d.detalle)}</span>` : ''}</td><td class="text-right text-danger">-${dinero(d.monto)}</td></tr>`
                                       )
                                       .join('')}
                                   <tr class="desglose-total"><td>Total descuentos</td><td class="text-right">-${dinero(totalDescuentos)}</td></tr>
                               </tbody>
                           </table>`
                        : '<p class="text-muted">No se le descontó nada este mes.</p>'
                }

                <div class="desglose-neto mt-3">
                    <span>Líquido pagado</span>
                    <strong>${dinero(pago.netPay)}</strong>
                </div>
            </div>`
        );
    },

    async loadHistory() {
        const tbody = document.getElementById('history-table-body');
        if (!tbody) return;

        try {
            const response = await window.api.getPaymentHistory(this.filters);
            const payments = response.data || [];
            this.payments = payments;

            if (payments.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="12" class="text-center text-muted">
                            No se encontraron registros de pagos con los filtros seleccionados.
                        </td>
                    </tr>
                `;
                return;
            }

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

            tbody.innerHTML = payments
                .map((p) => {
                    const empName = p.user
                        ? `${p.user.firstName} ${p.user.lastName}`
                        : 'Desconocido';
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
                        year: 'numeric',
                    });

                    // La boleta no se envía por correo: solo importa si el PDF
                    // quedó generado y se puede descargar.
                    const boletaBadge = p.pdfPath
                        ? '<span class="badge badge-success">Disponible</span>'
                        : `<span class="badge badge-danger" title="${window.UI.escapeHtml(p.emailError || 'No se pudo generar')}">No generada</span>`;

                    return `
                    <tr>
                        <td class="font-weight-medium">${window.UI.escapeHtml(empName)}</td>
                        <td class="font-weight-medium">${monthName} / ${p.year}</td>
                        <td>${window.App.formatCurrency(base)}</td>
                        <td>${window.App.formatCurrency(hourlyRate)}</td>
                        <td class="text-success">+${window.App.formatCurrency(overtime)}</td>
                        <td>
                            <button type="button" class="monto-desglose text-success font-weight-semibold" data-action="ver-desglose" data-payment-id="${p.id}" title="Ver de qué se compone">
                                ${window.App.formatCurrency(totalIncome)} <span aria-hidden="true">▸</span>
                            </button>
                        </td>
                        <td>
                            <button type="button" class="monto-desglose text-danger" data-action="ver-desglose" data-payment-id="${p.id}" title="Ver de qué se descontó">
                                -${window.App.formatCurrency(discount)} <span aria-hidden="true">▸</span>
                            </button>
                        </td>
                        <td class="text-success font-weight-bold">${window.App.formatCurrency(net)}</td>
                        <td>${paidDate}</td>
                        <td>${boletaBadge}</td>
                        <td>
                            <button class="btn-plano" data-action="manage-receipt"
                                data-payment-id="${p.id}" title="Ver o adjuntar el recibo firmado">
                                ${window.Receipt.badge(p)}
                            </button>
                        </td>
                        <td class="text-right">
                            <button class="btn-secondary btn-sm"
                                data-action="download-payment-pdf"
                                data-payment-id="${p.id}"
                                data-employee-name="${window.UI.escapeHtml(empName)}"
                                data-month="${p.month}"
                                data-year="${p.year}">
                                📄 PDF
                            </button>
                        </td>
                    </tr>
                `;
                })
                .join('');
        } catch (e) {
            console.error('Error al cargar historial:', e);
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center text-danger">
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
    },
};
