/**
 * Estado de resultados mensual.
 *
 * Junta lo que entra (contratos y otros ingresos) con lo que sale (salarios de
 * la nómina y gastos cargados a mano) y muestra el saldo del mes.
 *
 * ⚠️ Todos los montos están en BOLIVIANOS, como la nómina y los contratos.
 *
 * El estado no se guarda: el servidor lo calcula al pedirlo, así que cualquier
 * cambio —un gasto nuevo, un pago de nómina confirmado— se refleja con solo
 * volver a pedirlo, sin importar el orden en que se cargaron las cosas.
 */
window.StatementPage = {
    estado: null,
    categorias: [],
    /** Mes que se está mirando. Arranca en el actual. */
    periodo: { month: new Date().getMonth() + 1, year: new Date().getFullYear() },
    vista: 'mes',

    MESES: [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ],

    esc(valor) {
        return window.UI.escapeHtml(valor);
    },

    /**
     * Formatea un monto. `aprox` antepone «≈» cuando la cifra depende de una
     * nómina sin cerrar: es la marca que distingue un número firme de una
     * estimación, y por eso llega hasta el saldo.
     */
    dinero(monto, aprox = false) {
        const numero = Number(monto || 0);
        const valor = Math.abs(numero).toLocaleString('es-BO', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        // "-Bs. 3.200,00" y no "Bs. -3.200,00": el signo adelante se lee primero.
        return `${aprox ? '≈ ' : ''}${numero < 0 ? '-' : ''}Bs. ${valor}`;
    },

    nombreMes({ month, year }) {
        return `${this.MESES[month - 1]} ${year}`;
    },

    // ============================================================
    // ESTRUCTURA
    // ============================================================

    async render() {
        return `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Estado de resultados</h1>
                    <p class="page-subtitle">
                        Cómo está la empresa en el mes: lo que entra, lo que sale y lo que falta
                        cobrar o pagar. Los contratos y los sueldos se toman solos; los gastos se cargan a mano.
                    </p>
                </div>
                <div class="flex gap-2">
                    <button class="btn-secondary" id="er-vista-mes">Mes</button>
                    <button class="btn-secondary" id="er-vista-historico">Comparar meses</button>
                </div>
            </div>

            <div id="er-contenido" class="mt-3">
                <div class="text-center p-4 text-muted">Cargando…</div>
            </div>`;
    },

    async init() {
        document.getElementById('er-vista-mes').addEventListener('click', () => {
            this.vista = 'mes';
            this.cargar();
        });
        document.getElementById('er-vista-historico').addEventListener('click', () => {
            this.vista = 'historico';
            this.cargarHistorico();
        });

        document.getElementById('er-contenido').addEventListener('click', (evento) => {
            const accion = evento.target.closest('[data-accion]');
            if (!accion) return;

            const { accion: nombre, id } = accion.dataset;
            if (nombre === 'mes-anterior') this.moverMes(-1);
            if (nombre === 'mes-siguiente') this.moverMes(1);
            if (nombre === 'nuevo-gasto') this.abrirFormulario('EXPENSE');
            if (nombre === 'nuevo-ingreso') this.abrirFormulario('OTHER_INCOME');
            if (nombre === 'borrar-linea') this.borrarLinea(Number(id));
            if (nombre === 'ir-nomina') window.App.navigateTo('payments');
            if (nombre === 'gestionar-categorias') this.abrirCategorias();
        });

        await this.cargar();
    },

    moverMes(delta) {
        let { month, year } = this.periodo;
        month += delta;
        if (month < 1) {
            month = 12;
            year -= 1;
        }
        if (month > 12) {
            month = 1;
            year += 1;
        }
        this.periodo = { month, year };
        this.cargar();
    },

    async cargar() {
        const caja = document.getElementById('er-contenido');
        caja.innerHTML = '<div class="text-center p-4 text-muted">Cargando…</div>';

        try {
            const [estado, categorias] = await Promise.all([
                window.api.getStatement(this.periodo.month, this.periodo.year),
                window.api.getExpenseCategories(),
            ]);
            this.estado = estado.data;
            this.categorias = categorias.data || [];
            this.pintarMes();
        } catch (fallo) {
            caja.innerHTML = `<div class="card p-4 text-center">
                <p class="text-danger">${this.esc(fallo.message)}</p>
            </div>`;
        }
    },

    // ============================================================
    // VISTA MENSUAL
    // ============================================================

    pintarMes() {
        const e = this.estado;
        const d = e.detail;

        document.getElementById('er-contenido').innerHTML = `
            <div class="card">
                <div class="flex-between er-cabecera">
                    <button class="btn-secondary btn-sm" data-accion="mes-anterior">◀</button>
                    <h2 class="mb-0 text-capitalize">${this.nombreMes(this.periodo)}</h2>
                    <button class="btn-secondary btn-sm" data-accion="mes-siguiente">▶</button>
                </div>

                ${d ? this.bloqueResumen(d) : ''}
                ${d ? this.bloqueCobros(e, d) : ''}
                ${d ? this.bloqueSueldos(d) : ''}
                ${d ? this.bloqueDescuentosEmpleados(d) : ''}
                ${this.bloqueGastos(e)}
                ${this.bloqueFinancieros(e)}

                <div class="flex gap-2 mt-3 flex-wrap">
                    <button class="btn-primary" data-accion="nuevo-gasto">+ Gasto</button>
                    <button class="btn-secondary" data-accion="nuevo-ingreso">+ Otro ingreso</button>
                    <button class="btn-secondary" data-accion="gestionar-categorias">Categorías</button>
                </div>
            </div>`;
    },

    fechaCorta(valor) {
        return valor ? String(valor).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '';
    },

    /**
     * Las dos cifras que importan, arriba de todo: cuánta plata hay hoy y
     * cuánta debería quedar al cerrar el mes. Antes había un solo "saldo" que
     * restaba solo los sueldos ya pagados y parecía mucho mejor de lo real.
     */
    bloqueResumen(d) {
        const tarjeta = (titulo, ayuda, filas, saldo) => `
            <div class="er-resumen-tarjeta ${saldo < 0 ? 'negativo' : ''}">
                <span class="er-resumen-titulo">${titulo}</span>
                <span class="text-muted text-sm">${ayuda}</span>
                ${filas
                    .map(([etiqueta, monto, signo]) => `<div class="flex-between er-resumen-fila"><span>${etiqueta}</span><span class="${signo === '-' ? 'text-danger' : 'text-success'}">${signo}${this.dinero(monto)}</span></div>`)
                    .join('')}
                <div class="flex-between er-resumen-saldo"><span>Saldo</span><strong>${this.dinero(saldo)}</strong></div>
            </div>`;

        return `
            <section class="er-resumen">
                ${tarjeta(
                    '💵 Caja hoy',
                    'Lo que ya entró y ya salió.',
                    [
                        ['Entró (cobrado + otros ingresos)', d.cash.in, '+'],
                        ['Salió (sueldos pagados + gastos)', d.cash.out, '-'],
                    ],
                    d.cash.balance
                )}
                ${tarjeta(
                    '📅 Al cerrar el mes',
                    'Si se cobra todo y se paga todo lo que falta.',
                    [
                        ['Ingresos del mes', d.expected.income, '+'],
                        ['Egresos del mes', d.expected.outcome, '-'],
                    ],
                    d.expected.balance
                )}
            </section>`;
    },

    bloqueCobros(e, d) {
        const estado = (c) => {
            if (c.missingRate) return '<span class="badge badge-muted">Sin monto cargado</span>';
            if (c.status === 'COBRADO') return `<span class="badge badge-success">✓ Cobrado ${this.fechaCorta(c.collectedOn)}</span>`;
            if (c.overdue) return `<span class="badge badge-danger">Vencido el ${this.fechaCorta(c.dueDate)}</span>`;
            return `<span class="badge badge-warning">Por cobrar · vence ${this.fechaCorta(c.dueDate)}</span>`;
        };

        return `
            <section class="er-seccion">
                <h3 class="er-titulo">Ingresos · de dónde entra la plata</h3>
                <table class="er-tabla">
                    <tbody>
                        ${d.collections.lines
                            .map(
                                (c) => `
                            <tr>
                                <td class="er-detalle">
                                    <strong>${this.esc(c.clientName)}</strong> · ${this.esc(c.contractName)}
                                    <br>${estado(c)}
                                </td>
                                <td class="er-monto">${this.dinero(c.amount)}</td>
                            </tr>`
                            )
                            .join('') || '<tr><td class="er-detalle text-muted" colspan="2">No hay contratos activos este mes.</td></tr>'}
                        ${e.income.otherEntries
                            .map(
                                (linea) => `
                            <tr>
                                <td class="er-detalle">
                                    ${this.esc(linea.description)} <span class="badge badge-muted">Otro ingreso</span>
                                    <button class="er-borrar" data-accion="borrar-linea"
                                        data-id="${linea.id}" title="Quitar de este mes">×</button>
                                </td>
                                <td class="er-monto">${this.dinero(linea.amount)}</td>
                            </tr>`
                            )
                            .join('')}
                        <tr class="er-subtotal"><td>Ya cobrado</td><td class="er-monto text-success">${this.dinero(d.collections.collected + e.income.other)}</td></tr>
                        <tr class="er-subtotal"><td>Falta cobrar</td><td class="er-monto text-warning">${this.dinero(d.collections.pending)}</td></tr>
                        <tr class="er-total"><td>Total de ingresos del mes</td><td class="er-monto">${this.dinero(d.expected.income)}</td></tr>
                    </tbody>
                </table>
            </section>`;
    },

    bloqueSueldos(d) {
        const tipos = {
            UNJUSTIFIED_DELAY: 'retrasos',
            UNJUSTIFIED_ABSENCE: 'faltas',
            COMPANY_DAMAGE: 'daños',
            SALARY_ADVANCE: 'adelanto',
            LOAN: 'préstamo',
            OTHER: 'otros',
        };
        const descuentos = (s) =>
            Object.entries(s.discounts)
                .filter(([, monto]) => monto > 0)
                .map(([tipo, monto]) => `${tipos[tipo]} ${this.dinero(monto)}`)
                .join(' · ');

        return `
            <section class="er-seccion">
                <h3 class="er-titulo">Sueldos · a quién se le paga</h3>
                <table class="er-tabla">
                    <tbody>
                        ${d.salaries.lines
                            .map((s) => {
                                const menos = descuentos(s);
                                return `
                            <tr>
                                <td class="er-detalle">
                                    <strong>${this.esc(s.name)}</strong>
                                    <span class="text-muted text-sm">· ${s.employeeType === 'TEMPORAL' ? 'temporal' : 'fijo'}${s.category === 'ADMINISTRATIVO' ? ', administrativo' : ''}</span>
                                    <br>${
                                        s.status === 'PAGADO'
                                            ? `<span class="badge badge-success">✓ Pagado ${this.fechaCorta(s.paidAt)}</span>`
                                            : '<span class="badge badge-warning">Por pagar (estimado)</span>'
                                    }
                                    ${menos ? `<br><span class="text-muted text-sm">Se le descuenta: ${menos}</span>` : ''}
                                </td>
                                <td class="er-monto">${this.dinero(s.net)}</td>
                            </tr>`;
                            })
                            .join('') || '<tr><td class="er-detalle text-muted" colspan="2">No hay sueldos este mes.</td></tr>'}
                        <tr class="er-subtotal"><td>Ya pagado</td><td class="er-monto text-success">${this.dinero(d.salaries.paid)}</td></tr>
                        <tr class="er-subtotal"><td>Falta pagar</td><td class="er-monto text-warning">${this.dinero(d.salaries.pending)}</td></tr>
                        <tr class="er-total"><td>Total de sueldos del mes</td><td class="er-monto">${this.dinero(d.salaries.paid + d.salaries.pending)}</td></tr>
                    </tbody>
                </table>
                ${
                    d.salaries.pending > 0
                        ? `<p class="text-muted text-sm mt-2">
                               "Por pagar" es lo que saldría si se paga hoy: puede cambiar con retrasos, horas extra o descuentos nuevos.
                               <button class="btn-enlace" data-accion="ir-nomina">Ir a calcular nómina</button>
                           </p>`
                        : ''
                }
            </section>`;
    },

    /**
     * Lo que se les descontó a los empleados, por motivo. Ya está restado en
     * los sueldos de arriba: es plata que la empresa no paga o que recupera
     * (un adelanto entregado antes, un daño a pagar).
     */
    bloqueDescuentosEmpleados(d) {
        const nombres = {
            UNJUSTIFIED_DELAY: 'Retrasos sin justificar',
            UNJUSTIFIED_ABSENCE: 'Faltas sin justificar',
            COMPANY_DAMAGE: 'Daños a la empresa',
            SALARY_ADVANCE: 'Adelantos de sueldo',
            LOAN: 'Préstamos',
            OTHER: 'Otros descuentos',
        };
        const lineas = Object.entries(d.employeeDiscounts.byType).filter(([, monto]) => monto > 0);
        if (!lineas.length) return '';

        return `
            <section class="er-seccion">
                <h3 class="er-titulo">Descuentos a empleados</h3>
                <p class="text-muted text-sm mb-2">
                    Ya están restados de los sueldos de arriba. Los adelantos y préstamos son plata que se
                    entregó antes y se recupera ahora; los daños y retrasos, plata que la empresa no paga.
                </p>
                <table class="er-tabla">
                    <tbody>
                        ${lineas
                            .map(
                                ([tipo, monto]) => `<tr><td class="er-detalle">${nombres[tipo]}</td><td class="er-monto">${this.dinero(monto)}</td></tr>`
                            )
                            .join('')}
                        <tr class="er-total"><td>Total descontado</td><td class="er-monto">${this.dinero(d.employeeDiscounts.total)}</td></tr>
                    </tbody>
                </table>
            </section>`;
    },

    bloqueGastos(e) {
        return `
            <section class="er-seccion">
                <h3 class="er-titulo">Gastos del mes</h3>
                ${
                    e.operating.categories.length
                        ? `<table class="er-tabla">
                               <tbody>
                                   ${e.operating.categories.map((c) => this.filaCategoria(c)).join('')}
                                   <tr class="er-total"><td>Total de gastos</td><td class="er-monto">${this.dinero(e.operating.expenses)}</td></tr>
                               </tbody>
                           </table>`
                        : '<p class="text-muted text-sm">Todavía no se cargó ningún gasto este mes. Use <strong>+ Gasto</strong> para agregar insumos, transporte, servicios, etc.</p>'
                }
            </section>`;
    },

    bloqueFinancieros(e) {
        if (e.financial.categories.length === 0) return '';

        return `
            <section class="er-seccion">
                <h3 class="er-titulo">Gastos financieros</h3>
                <table class="er-tabla">
                    <tbody>
                        ${e.financial.categories.map((c) => this.filaCategoria(c)).join('')}
                        <tr class="er-total">
                            <td>Total gastos financieros</td>
                            <td class="er-monto">${this.dinero(e.financial.total)}</td>
                        </tr>
                    </tbody>
                </table>
            </section>`;
    },

    /**
     * Una línea por categoría. Si tiene varios movimientos se listan debajo,
     * cada uno con su propia `×`: quitar un recargo suelto no debe obligar a
     * borrar toda la factura de luz.
     */
    filaCategoria(categoria) {
        const varios = categoria.entries.length > 1;

        const detalle = varios
            ? categoria.entries
                  .map(
                      (linea) => `
                <tr class="er-submovimiento">
                    <td class="er-detalle">
                        ${this.esc(linea.description)}
                        <button class="er-borrar" data-accion="borrar-linea"
                            data-id="${linea.id}" title="Quitar de este mes">×</button>
                    </td>
                    <td class="er-monto">${this.dinero(linea.amount)}</td>
                </tr>`
                  )
                  .join('')
            : '';

        const unico = categoria.entries[0];

        return `
            <tr>
                <td class="er-detalle">
                    ${this.esc(categoria.name)}
                    ${
                        varios
                            ? `<span class="text-muted text-sm">(${categoria.entries.length} movimientos)</span>`
                            : `<button class="er-borrar" data-accion="borrar-linea"
                                   data-id="${unico.id}" title="Quitar de este mes">×</button>`
                    }
                </td>
                <td class="er-monto">${this.dinero(categoria.amount)}</td>
            </tr>
            ${detalle}`;
    },

    // ============================================================
    // HISTÓRICO
    // ============================================================

    async cargarHistorico() {
        const caja = document.getElementById('er-contenido');
        caja.innerHTML = '<div class="text-center p-4 text-muted">Cargando…</div>';

        // Los seis meses hasta el que se está mirando: es lo que entra de un
        // vistazo sin obligar a hacer scroll horizontal en una pantalla normal.
        const hasta = { ...this.periodo };
        let { month, year } = hasta;
        month -= 5;
        while (month < 1) {
            month += 12;
            year -= 1;
        }

        try {
            const respuesta = await window.api.getStatementHistory({ month, year }, hasta);
            this.pintarHistorico(respuesta.data || []);
        } catch (fallo) {
            caja.innerHTML = `<div class="card p-4 text-center">
                <p class="text-danger">${this.esc(fallo.message)}</p>
            </div>`;
        }
    },

    pintarHistorico(meses) {
        const cabecera = meses
            .map(
                (e) => `
            <th class="${e.isProvisional ? 'er-col-provisional' : ''}">
                ${this.MESES[e.month - 1].slice(0, 3)} ${String(e.year).slice(2)}
                ${e.isProvisional ? '<br><span class="er-col-aviso">⚠ provisional</span>' : ''}
            </th>`
            )
            .join('');

        const fila = (etiqueta, obtener, clase = '') => `
            <tr class="${clase}">
                <td class="er-hist-concepto">${etiqueta}</td>
                ${meses
                    .map(
                        (e) =>
                            `<td class="er-monto">${this.dinero(obtener(e), e.isProvisional && clase !== 'er-hist-ingreso')}</td>`
                    )
                    .join('')}
            </tr>`;

        document.getElementById('er-contenido').innerHTML = `
            <div class="card">
                <h2 class="mb-2">Comparación de meses</h2>
                <p class="text-muted text-sm">
                    Los meses marcados tienen la nómina sin cerrar: sus costos y su saldo
                    todavía pueden cambiar.
                </p>
                <div class="er-hist-scroll mt-3">
                    <table class="er-tabla er-hist-tabla">
                        <thead><tr><th></th>${cabecera}</tr></thead>
                        <tbody>
                            ${fila('Ingreso por servicios', (e) => e.income.service, 'er-hist-ingreso')}
                            ${fila('Otros ingresos', (e) => e.income.other, 'er-hist-ingreso')}
                            ${fila('Total de ingresos', (e) => e.income.total, 'er-subtotal er-hist-ingreso')}
                            ${fila('Salario operativo', (e) => e.operating.operationalSalary)}
                            ${fila('Salario administrativo', (e) => e.operating.administrativeSalary)}
                            ${fila('Otros costos operativos', (e) => e.operating.expenses)}
                            ${fila('Total costos operativos', (e) => e.operating.total, 'er-subtotal')}
                            ${fila('Gastos financieros', (e) => e.financial.total)}
                            ${fila('SALDO', (e) => e.balance, 'er-total')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    },

    // ============================================================
    // CARGA Y BORRADO
    // ============================================================

    abrirFormulario(tipo) {
        const esGasto = tipo === 'EXPENSE';
        const operativas = this.categorias.filter((c) => c.kind === 'OPERATING');
        const financieras = this.categorias.filter((c) => c.kind === 'FINANCIAL');

        window.App.showModal(
            esGasto ? 'Nuevo gasto' : 'Otro ingreso',
            `<form id="form-er">
                <p class="text-muted text-sm">
                    Se registra en <strong class="text-capitalize">${this.nombreMes(this.periodo)}</strong>.
                </p>

                ${
                    esGasto
                        ? `<div class="form-group">
                            <label for="er-categoria">Categoría *</label>
                            <select id="er-categoria" class="form-control" required>
                                <optgroup label="Costos operativos">
                                    ${operativas.map((c) => `<option value="${c.id}">${this.esc(c.name)}</option>`).join('')}
                                </optgroup>
                                <optgroup label="Gastos financieros">
                                    ${financieras.map((c) => `<option value="${c.id}">${this.esc(c.name)}</option>`).join('')}
                                </optgroup>
                            </select>
                           </div>`
                        : ''
                }

                <div class="form-group">
                    <label for="er-descripcion">Descripción *</label>
                    <input type="text" id="er-descripcion" class="form-control" required maxlength="250"
                        placeholder="${esGasto ? 'Ej.: factura de luz de julio' : 'Ej.: transferencia recibida'}">
                </div>

                <div class="flex gap-2">
                    <div class="form-group flex-1">
                        <label for="er-monto">Monto (Bs.) *</label>
                        <input type="number" id="er-monto" class="form-control" required
                            min="0.01" step="0.01">
                    </div>
                    <div class="form-group flex-1">
                        <label for="er-fecha">Fecha</label>
                        <input type="date" id="er-fecha" class="form-control">
                    </div>
                </div>

                <div id="er-error" class="login-error hidden"></div>

                <div class="flex-end gap-2 mt-3">
                    <button type="button" class="btn-secondary" id="er-cancelar">Cancelar</button>
                    <button type="submit" class="btn-primary">Guardar</button>
                </div>
            </form>`
        );

        document.getElementById('er-cancelar').addEventListener('click', () => window.App.hideModal());

        document.getElementById('form-er').addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const error = document.getElementById('er-error');
            const boton = evento.submitter;

            boton.disabled = true;
            boton.textContent = 'Guardando…';

            try {
                await window.api.createStatementEntry({
                    month: this.periodo.month,
                    year: this.periodo.year,
                    type: tipo,
                    ...(esGasto ? { categoryId: Number(document.getElementById('er-categoria').value) } : {}),
                    description: document.getElementById('er-descripcion').value.trim(),
                    amount: Number(document.getElementById('er-monto').value),
                    occurredOn: document.getElementById('er-fecha').value || null,
                });
                window.App.hideModal();
                window.App.showToast('Movimiento registrado.', 'success');
                await this.cargar();
            } catch (fallo) {
                error.textContent = fallo.message;
                error.classList.remove('hidden');
                boton.disabled = false;
                boton.textContent = 'Guardar';
            }
        });
    },

    async borrarLinea(id) {
        try {
            await window.api.deleteStatementEntry(id);
            window.App.showToast('Movimiento quitado de este mes.', 'success');
            await this.cargar();
        } catch (fallo) {
            window.App.showToast(fallo.message, 'error');
        }
    },

    // ============================================================
    // CATEGORÍAS
    // ============================================================

    async abrirCategorias() {
        const todas = (await window.api.getExpenseCategories(true)).data || [];

        window.App.showModal(
            'Categorías de gasto',
            `<p class="text-muted text-sm">
                Quitar una categoría no toca los meses donde ya se usó: esos movimientos
                quedan como están.
             </p>
             <div class="table-responsive mt-2">
                <table class="table">
                    <thead><tr><th>Categoría</th><th>Tipo</th><th>Usos</th><th></th></tr></thead>
                    <tbody>
                        ${todas
                            .map(
                                (c) => `
                            <tr class="${c.isActive ? '' : 'opacity-60'}">
                                <td>${this.esc(c.name)} ${c.isActive ? '' : '<span class="badge badge-muted">Inactiva</span>'}</td>
                                <td>${c.kind === 'FINANCIAL' ? 'Financiero' : 'Operativo'}</td>
                                <td>${c._count?.entries ?? 0}</td>
                                <td class="text-right">
                                    ${
                                        c.isActive
                                            ? `<button class="btn-danger btn-sm" data-cat-borrar="${c.id}">Quitar</button>`
                                            : ''
                                    }
                                </td>
                            </tr>`
                            )
                            .join('')}
                    </tbody>
                </table>
             </div>

             <form id="form-cat" class="flex gap-2 mt-3">
                <input type="text" id="cat-nombre" class="form-control flex-1" required maxlength="100"
                    placeholder="Categoría propia…">
                <select id="cat-tipo" class="form-control" style="max-width:180px">
                    <option value="OPERATING">Costo operativo</option>
                    <option value="FINANCIAL">Gasto financiero</option>
                </select>
                <button type="submit" class="btn-primary">Agregar</button>
             </form>

             <div id="cat-error" class="login-error hidden mt-2"></div>

             <div class="flex-between mt-3">
                <button type="button" class="btn-secondary btn-sm" id="cat-restaurar">
                    Reponer las predefinidas
                </button>
                <button type="button" class="btn-secondary" id="cat-cerrar">Cerrar</button>
             </div>`
        );

        const error = document.getElementById('cat-error');
        const mostrarError = (mensaje) => {
            error.textContent = mensaje;
            error.classList.remove('hidden');
        };

        document.getElementById('cat-cerrar').addEventListener('click', () => window.App.hideModal());

        document.getElementById('cat-restaurar').addEventListener('click', async () => {
            try {
                const r = await window.api.restoreExpenseCategories();
                window.App.showToast(r.data.message, 'success');
                await this.abrirCategorias();
            } catch (fallo) {
                mostrarError(fallo.message);
            }
        });

        document.getElementById('form-cat').addEventListener('submit', async (evento) => {
            evento.preventDefault();
            try {
                await window.api.createExpenseCategory({
                    name: document.getElementById('cat-nombre').value.trim(),
                    kind: document.getElementById('cat-tipo').value,
                });
                await this.abrirCategorias();
                await this.cargar();
            } catch (fallo) {
                mostrarError(fallo.message);
            }
        });

        document.querySelectorAll('[data-cat-borrar]').forEach((boton) => {
            boton.addEventListener('click', async () => {
                try {
                    const r = await window.api.deleteExpenseCategory(boton.dataset.catBorrar);
                    window.App.showToast(r.data.message, 'success');
                    await this.abrirCategorias();
                    await this.cargar();
                } catch (fallo) {
                    mostrarError(fallo.message);
                }
            });
        });
    },
};
