/**
 * Clientes y contratos.
 *
 * A quién le presta servicio la empresa y por cuánto. Cada cliente puede tener
 * varios contratos independientes, y cada contrato guarda su historial de
 * montos: subir un precio no borra lo que se cobraba antes.
 *
 * ⚠️ Todos los montos de esta pantalla están en BOLIVIANOS, como los sueldos.
 * La suscripción a la plataforma va en dólares y se administra desde otro
 * panel; no se mezclan ni se convierten.
 */
window.ClientsPage = {
    clientes: [],
    sedes: [],
    /** Clientes desplegados. Se conserva entre recargas para no cerrarlos al guardar. */
    abiertos: new Set(),

    MODALIDADES: {
        ANTICIPADO: 'Por adelantado',
        POSTERIOR: 'A mes vencido',
    },

    esc(valor) {
        return window.UI.escapeHtml(valor);
    },

    dinero(monto) {
        if (monto == null) return 'sin monto';
        return `Bs. ${Number(monto).toLocaleString('es-BO', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    },

    fecha(iso) {
        if (!iso) return '';
        return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('es-BO', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    },

    // ============================================================
    // LISTADO
    // ============================================================

    async render() {
        return `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Clientes y contratos</h1>
                    <p class="page-subtitle">
                        A quién le presta servicio su empresa y cuánto se cobra. Los montos
                        quedan registrados con su fecha de vigencia, así que un ajuste de
                        precio no borra el historial.
                    </p>
                </div>
                <button class="btn-primary" id="cliente-nuevo">+ Nuevo cliente</button>
            </div>

            <div id="clientes-lista" class="mt-3">
                <div class="text-center p-4 text-muted">Cargando…</div>
            </div>`;
    },

    async init() {
        document.getElementById('cliente-nuevo').addEventListener('click', () =>
            this.abrirFormularioCliente()
        );

        document.getElementById('clientes-lista').addEventListener('click', (evento) => {
            // Los botones de acción viven DENTRO de la cabecera desplegable, así
            // que se miran primero: si no, el clic en "+ Contrato" solo abría o
            // cerraba la tarjeta y la acción nunca llegaba a ejecutarse.
            const accion = evento.target.closest('[data-accion]');
            if (!accion) {
                const cabecera = evento.target.closest('[data-cliente-toggle]');
                if (cabecera) {
                    const id = Number(cabecera.dataset.clienteToggle);
                    if (this.abiertos.has(id)) this.abiertos.delete(id);
                    else this.abiertos.add(id);
                    this.pintar();
                }
                return;
            }

            const { accion: nombre, cliente, contrato } = accion.dataset;
            const datosCliente = this.clientes.find((c) => c.id === Number(cliente));

            if (nombre === 'editar-cliente') this.abrirFormularioCliente(datosCliente);
            if (nombre === 'baja-cliente') this.darDeBaja(datosCliente);
            if (nombre === 'nuevo-contrato') this.abrirFormularioContrato(datosCliente);
            if (nombre === 'editar-contrato') {
                this.abrirFormularioContrato(
                    datosCliente,
                    datosCliente.contracts.find((k) => k.id === Number(contrato))
                );
            }
            if (nombre === 'nuevo-monto') this.abrirFormularioMonto(Number(contrato));
            if (nombre === 'ver-montos') this.abrirHistorial(Number(contrato));
        });

        await this.cargar();
    },

    async cargar() {
        const [clientes, sedes] = await Promise.all([
            window.api.getClients(),
            window.api.getWorksites(),
        ]);
        this.clientes = clientes.data || [];
        this.sedes = sedes.data || [];
        this.pintar();
    },

    pintar() {
        const caja = document.getElementById('clientes-lista');
        if (!caja) return;

        if (this.clientes.length === 0) {
            caja.innerHTML = `
                <div class="card text-center p-4">
                    <h3>Todavía no hay clientes</h3>
                    <p class="text-muted mt-2">
                        Registre el primero para poder vincularle contratos y sedes.
                    </p>
                </div>`;
            return;
        }

        caja.innerHTML = this.clientes
            .map((cliente) => this.tarjetaCliente(cliente))
            .join('');
    },

    tarjetaCliente(cliente) {
        const abierto = this.abiertos.has(cliente.id);
        const contratos = cliente.contracts || [];
        const activos = contratos.filter((k) => k.isActive).length;

        // Suma de lo que se factura por mes a este cliente. Un contrato sin
        // monto cargado no suma cero: se avisa aparte para no dar un total
        // que parezca completo cuando no lo está.
        const sinMonto = contratos.filter((k) => k.isActive && !k.currentRate).length;
        const total = contratos
            .filter((k) => k.isActive && k.currentRate)
            .reduce((suma, k) => suma + Number(k.currentRate.amount), 0);

        return `
            <div class="card mb-2 ${cliente.isActive ? '' : 'opacity-60'}">
                <div class="flex-between cliente-cabecera" data-cliente-toggle="${cliente.id}"
                     role="button" tabindex="0" style="cursor:pointer">
                    <div>
                        <h3 class="mb-0">
                            ${abierto ? '▾' : '▸'} ${this.esc(cliente.name)}
                            ${cliente.isActive ? '' : '<span class="badge badge-muted">De baja</span>'}
                        </h3>
                        <p class="text-muted text-sm mb-0 mt-1">
                            ${activos} ${activos === 1 ? 'contrato activo' : 'contratos activos'}
                            · ${this.dinero(total)} por mes
                            ${sinMonto ? ` · <span class="text-warning">${sinMonto} sin monto</span>` : ''}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn-secondary btn-sm" data-accion="nuevo-contrato"
                                data-cliente="${cliente.id}">+ Contrato</button>
                        <button class="btn-secondary btn-sm" data-accion="editar-cliente"
                                data-cliente="${cliente.id}">Editar</button>
                        ${
                            cliente.isActive
                                ? `<button class="btn-danger btn-sm" data-accion="baja-cliente"
                                       data-cliente="${cliente.id}">Dar de baja</button>`
                                : ''
                        }
                    </div>
                </div>

                ${abierto ? this.detalleCliente(cliente) : ''}
            </div>`;
    },

    detalleCliente(cliente) {
        const contacto = [cliente.contactName, cliente.contactPhone, cliente.contactEmail]
            .filter(Boolean)
            .map((dato) => this.esc(dato))
            .join(' · ');

        const contratos = cliente.contracts || [];

        return `
            <div class="mt-3 pt-3 border-top">
                ${contacto ? `<p class="text-muted text-sm">Contacto: ${contacto}</p>` : ''}
                ${cliente.taxId ? `<p class="text-muted text-sm">NIT: ${this.esc(cliente.taxId)}</p>` : ''}

                ${
                    contratos.length === 0
                        ? `<p class="text-muted text-center p-3">
                               Este cliente todavía no tiene contratos.
                           </p>`
                        : `<div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Contrato</th>
                                        <th>Monto vigente</th>
                                        <th>Cobro</th>
                                        <th>Sede</th>
                                        <th>Estado</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${contratos.map((k) => this.filaContrato(cliente, k)).join('')}
                                </tbody>
                            </table>
                           </div>`
                }
            </div>`;
    },

    filaContrato(cliente, contrato) {
        const sedes = (contrato.worksites || []).map((s) => this.esc(s.name)).join(', ');
        const vigente = contrato.currentRate;

        return `
            <tr class="${contrato.isActive ? '' : 'opacity-60'}">
                <td>
                    <strong>${this.esc(contrato.name)}</strong>
                    ${
                        contrato.reference
                            ? `<br><span class="text-muted text-sm">${this.esc(contrato.reference)}</span>`
                            : ''
                    }
                </td>
                <td>
                    ${
                        vigente
                            ? `<strong>${this.dinero(vigente.amount)}</strong>
                               <br><span class="text-muted text-sm">desde ${this.fecha(vigente.validFrom)}</span>`
                            : '<span class="text-warning">Sin monto cargado</span>'
                    }
                </td>
                <td>
                    ${this.MODALIDADES[contrato.paymentTerms] || contrato.paymentTerms}
                    <br><span class="text-muted text-sm">cobra el día ${Number(contrato.billingDay) || 5}</span>
                    ${
                        contrato.startDate || contrato.endDate
                            ? `<br><span class="text-muted text-sm">${contrato.startDate ? this.fecha(contrato.startDate) : '…'} → ${contrato.endDate ? this.fecha(contrato.endDate) : 'sin fin'}</span>`
                            : ''
                    }
                </td>
                <td>${sedes || '<span class="text-muted">Sin sede</span>'}</td>
                <td>
                    ${
                        contrato.isActive
                            ? '<span class="badge badge-success">Activo</span>'
                            : '<span class="badge badge-muted">Inactivo</span>'
                    }
                </td>
                <td class="text-right">
                    <button class="btn-secondary btn-sm" data-accion="nuevo-monto"
                            data-contrato="${contrato.id}">Nuevo monto</button>
                    <button class="btn-secondary btn-sm" data-accion="ver-montos"
                            data-contrato="${contrato.id}">
                        Historial${contrato.rateCount ? ` (${contrato.rateCount})` : ''}
                    </button>
                    <button class="btn-secondary btn-sm" data-accion="editar-contrato"
                            data-cliente="${cliente.id}" data-contrato="${contrato.id}">Editar</button>
                </td>
            </tr>`;
    },

    // ============================================================
    // CLIENTE
    // ============================================================

    abrirFormularioCliente(cliente = null) {
        const esEdicion = Boolean(cliente);

        window.App.showModal(
            esEdicion ? 'Editar cliente' : 'Nuevo cliente',
            `<form id="form-cliente">
                <div class="form-group">
                    <label for="cliente-nombre">Nombre *</label>
                    <input type="text" id="cliente-nombre" class="form-control" required
                        maxlength="150" placeholder="Ej.: Consorcio Torre Norte"
                        value="${esEdicion ? this.esc(cliente.name) : ''}">
                </div>
                <div class="form-group">
                    <label for="cliente-nit">NIT</label>
                    <input type="text" id="cliente-nit" class="form-control" maxlength="50"
                        value="${esEdicion && cliente.taxId ? this.esc(cliente.taxId) : ''}">
                </div>
                <div class="form-group">
                    <label for="cliente-contacto">Persona de contacto</label>
                    <input type="text" id="cliente-contacto" class="form-control" maxlength="150"
                        value="${esEdicion && cliente.contactName ? this.esc(cliente.contactName) : ''}">
                </div>
                <div class="flex gap-2">
                    <div class="form-group flex-1">
                        <label for="cliente-telefono">Teléfono</label>
                        <input type="text" id="cliente-telefono" class="form-control" maxlength="30"
                            value="${esEdicion && cliente.contactPhone ? this.esc(cliente.contactPhone) : ''}">
                    </div>
                    <div class="form-group flex-1">
                        <label for="cliente-email">Correo</label>
                        <input type="email" id="cliente-email" class="form-control"
                            value="${esEdicion && cliente.contactEmail ? this.esc(cliente.contactEmail) : ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label for="cliente-notas">Notas</label>
                    <textarea id="cliente-notas" class="form-control" rows="2"
                        maxlength="1000">${esEdicion && cliente.notes ? this.esc(cliente.notes) : ''}</textarea>
                </div>

                <div id="cliente-error" class="login-error hidden"></div>

                <div class="flex-end gap-2 mt-3">
                    <button type="button" class="btn-secondary" id="cliente-cancelar">Cancelar</button>
                    <button type="submit" class="btn-primary">
                        ${esEdicion ? 'Guardar cambios' : 'Crear cliente'}
                    </button>
                </div>
            </form>`
        );

        document
            .getElementById('cliente-cancelar')
            .addEventListener('click', () => window.App.hideModal());

        document.getElementById('form-cliente').addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const error = document.getElementById('cliente-error');
            const boton = evento.submitter;

            const datos = {
                name: document.getElementById('cliente-nombre').value.trim(),
                taxId: document.getElementById('cliente-nit').value.trim() || null,
                contactName: document.getElementById('cliente-contacto').value.trim() || null,
                contactPhone: document.getElementById('cliente-telefono').value.trim() || null,
                contactEmail: document.getElementById('cliente-email').value.trim() || null,
                notes: document.getElementById('cliente-notas').value.trim() || null,
            };

            boton.disabled = true;
            boton.textContent = 'Guardando…';

            try {
                if (esEdicion) await window.api.updateClient(cliente.id, datos);
                else {
                    const creado = await window.api.createClient(datos);
                    // Se abre solo: lo primero que hace falta después de crear
                    // un cliente es cargarle un contrato.
                    this.abiertos.add(creado.data.id);
                }
                window.App.hideModal();
                window.App.showToast(esEdicion ? 'Cliente actualizado.' : 'Cliente creado.', 'success');
                await this.cargar();
            } catch (fallo) {
                error.textContent = fallo.message;
                error.classList.remove('hidden');
                boton.disabled = false;
                boton.textContent = esEdicion ? 'Guardar cambios' : 'Crear cliente';
            }
        });
    },

    async darDeBaja(cliente) {
        const activos = (cliente.contracts || []).filter((k) => k.isActive).length;

        const confirmado = window.confirm(
            `¿Dar de baja a ${cliente.name}?\n\n` +
                (activos
                    ? `Sus ${activos} contrato(s) activo(s) también quedarán inactivos.\n`
                    : '') +
                'No se borra nada: el historial de montos se conserva.'
        );
        if (!confirmado) return;

        try {
            await window.api.deleteClient(cliente.id);
            window.App.showToast('Cliente dado de baja.', 'success');
            await this.cargar();
        } catch (fallo) {
            window.App.showToast(fallo.message, 'error');
        }
    },

    // ============================================================
    // CONTRATO
    // ============================================================

    abrirFormularioContrato(cliente, contrato = null) {
        const esEdicion = Boolean(contrato);

        // Solo se ofrecen las sedes libres, más la que ya tiene este contrato:
        // una sede vinculada a dos contratos haría ambiguo a quién se le cobra.
        const vinculadas = new Set(
            this.clientes
                .flatMap((c) => c.contracts || [])
                .filter((k) => !esEdicion || k.id !== contrato.id)
                .flatMap((k) => (k.worksites || []).map((s) => s.id))
        );
        const propias = esEdicion ? (contrato.worksites || []).map((s) => s.id) : [];
        const disponibles = this.sedes.filter(
            (sede) => !vinculadas.has(sede.id) || propias.includes(sede.id)
        );

        window.App.showModal(
            esEdicion ? 'Editar contrato' : `Nuevo contrato para ${cliente.name}`,
            `<form id="form-contrato">
                <div class="form-group">
                    <label for="contrato-nombre">Nombre o referencia del servicio *</label>
                    <input type="text" id="contrato-nombre" class="form-control" required
                        maxlength="150" placeholder="Ej.: Limpieza turno mañana"
                        value="${esEdicion ? this.esc(contrato.name) : ''}">
                </div>
                <div class="form-group">
                    <label for="contrato-referencia">N.º de contrato</label>
                    <input type="text" id="contrato-referencia" class="form-control" maxlength="100"
                        value="${esEdicion && contrato.reference ? this.esc(contrato.reference) : ''}">
                </div>
                <div class="form-group">
                    <label for="contrato-modalidad">¿Cuándo cobra? *</label>
                    <select id="contrato-modalidad" class="form-control" required>
                        ${Object.entries(this.MODALIDADES)
                            .map(
                                ([clave, etiqueta]) =>
                                    `<option value="${clave}" ${
                                        esEdicion && contrato.paymentTerms === clave ? 'selected' : ''
                                    }>${etiqueta}</option>`
                            )
                            .join('')}
                    </select>
                    <small class="text-muted">Se define por contrato, no por cliente.</small>
                </div>
                <div class="flex gap-2 flex-wrap">
                    <div class="form-group flex-1">
                        <label for="contrato-inicio">Fecha de inicio</label>
                        <input type="date" id="contrato-inicio" class="form-control"
                            value="${esEdicion && contrato.startDate ? String(contrato.startDate).slice(0, 10) : ''}">
                    </div>
                    <div class="form-group flex-1">
                        <label for="contrato-fin">Fecha de fin <span class="etiqueta-opcional">opcional</span></label>
                        <input type="date" id="contrato-fin" class="form-control"
                            value="${esEdicion && contrato.endDate ? String(contrato.endDate).slice(0, 10) : ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label for="contrato-dia-cobro">Día de cobro</label>
                    <input type="number" id="contrato-dia-cobro" class="form-control" min="1" max="31" required
                        style="max-width: 120px;" value="${esEdicion ? Number(contrato.billingDay) || 5 : 5}">
                    <small class="text-muted" id="contrato-dia-ayuda"></small>
                </div>
                <div class="form-group">
                    <label for="contrato-sede">Sede donde se presta</label>
                    <select id="contrato-sede" class="form-control">
                        <option value="">Sin sede vinculada</option>
                        ${disponibles
                            .map(
                                (sede) =>
                                    `<option value="${sede.id}" ${
                                        propias.includes(sede.id) ? 'selected' : ''
                                    }>${this.esc(sede.name)}</option>`
                            )
                            .join('')}
                    </select>
                </div>

                ${
                    esEdicion
                        ? ''
                        : `<div class="flex gap-2">
                            <div class="form-group flex-1">
                                <label for="contrato-monto">Monto mensual (Bs.)</label>
                                <input type="number" id="contrato-monto" class="form-control"
                                    min="0.01" step="0.01" placeholder="4500.00">
                            </div>
                            <div class="form-group flex-1">
                                <label for="contrato-desde">Rige desde</label>
                                <input type="date" id="contrato-desde" class="form-control"
                                    value="${new Date().toISOString().slice(0, 8)}01">
                            </div>
                           </div>
                           <small class="text-muted">
                               Puede dejarlo vacío y cargar el monto después.
                           </small>`
                }

                ${
                    esEdicion
                        ? `<div class="form-group mt-2">
                            <label class="opcion-radio">
                                <input type="checkbox" id="contrato-activo"
                                    ${contrato.isActive ? 'checked' : ''}>
                                <span>Contrato activo</span>
                            </label>
                           </div>`
                        : ''
                }

                <div id="contrato-error" class="login-error hidden"></div>

                <div class="flex-end gap-2 mt-3">
                    <button type="button" class="btn-secondary" id="contrato-cancelar">Cancelar</button>
                    <button type="submit" class="btn-primary">
                        ${esEdicion ? 'Guardar cambios' : 'Crear contrato'}
                    </button>
                </div>
            </form>`
        );

        document
            .getElementById('contrato-cancelar')
            .addEventListener('click', () => window.App.hideModal());

        // Explica en palabras cuándo llega el recordatorio, según la modalidad.
        const modalidad = document.getElementById('contrato-modalidad');
        const diaCobro = document.getElementById('contrato-dia-cobro');
        const explicarCobro = () => {
            const dia = Number(diaCobro.value) || 5;
            document.getElementById('contrato-dia-ayuda').textContent =
                modalidad.value === 'POSTERIOR'
                    ? `Cada mes se cobra el día ${dia} del mes siguiente. El sistema le avisa unos días antes.`
                    : `Cada mes se cobra el día ${dia} del mismo mes, por adelantado. El sistema le avisa unos días antes.`;
        };
        modalidad.addEventListener('change', explicarCobro);
        diaCobro.addEventListener('input', explicarCobro);
        explicarCobro();

        // El monto inicial rige desde el inicio del contrato, si se cargó.
        const inicio = document.getElementById('contrato-inicio');
        const desde = document.getElementById('contrato-desde');
        if (desde) inicio.addEventListener('change', () => inicio.value && (desde.value = inicio.value));

        document.getElementById('form-contrato').addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const error = document.getElementById('contrato-error');
            const boton = evento.submitter;
            const sedeElegida = document.getElementById('contrato-sede').value;

            const datos = {
                name: document.getElementById('contrato-nombre').value.trim(),
                reference: document.getElementById('contrato-referencia').value.trim() || null,
                paymentTerms: document.getElementById('contrato-modalidad').value,
                startDate: document.getElementById('contrato-inicio').value || null,
                endDate: document.getElementById('contrato-fin').value || null,
                billingDay: Number(document.getElementById('contrato-dia-cobro').value) || 5,
                worksiteId: sedeElegida ? Number(sedeElegida) : null,
            };

            if (datos.startDate && datos.endDate && datos.endDate < datos.startDate) {
                error.textContent = 'La fecha de fin no puede ser anterior a la de inicio.';
                error.classList.remove('hidden');
                return;
            }

            if (esEdicion) {
                datos.isActive = document.getElementById('contrato-activo').checked;
            } else {
                const monto = document.getElementById('contrato-monto').value;
                if (monto) {
                    datos.amount = Number(monto);
                    datos.validFrom = document.getElementById('contrato-desde').value;
                }
            }

            boton.disabled = true;
            boton.textContent = 'Guardando…';

            try {
                if (esEdicion) await window.api.updateContract(contrato.id, datos);
                else await window.api.createContract(cliente.id, datos);

                this.abiertos.add(cliente.id);
                window.App.hideModal();
                window.App.showToast(esEdicion ? 'Contrato actualizado.' : 'Contrato creado.', 'success');
                await this.cargar();
                // Un contrato renovado deja de figurar en el aviso de contratos por vencer.
                window.Cobros?.refrescar();
                // Fechas, día de cobro o monto cambian lo que hay que cobrar.
                window.Cobros?.refrescar();
            } catch (fallo) {
                error.textContent = fallo.message;
                error.classList.remove('hidden');
                boton.disabled = false;
                boton.textContent = esEdicion ? 'Guardar cambios' : 'Crear contrato';
            }
        });
    },

    // ============================================================
    // MONTOS
    // ============================================================

    abrirFormularioMonto(contractId) {
        const primerDiaDelMes = `${new Date().toISOString().slice(0, 8)}01`;

        window.App.showModal(
            'Nuevo monto',
            `<form id="form-monto">
                <p class="text-muted">
                    El monto anterior no se borra: queda en el historial con su fecha de
                    vigencia, para poder reconstruir después qué se cobró cada mes.
                </p>
                <div class="flex gap-2 mt-2">
                    <div class="form-group flex-1">
                        <label for="monto-valor">Monto mensual (Bs.) *</label>
                        <input type="number" id="monto-valor" class="form-control" required
                            min="0.01" step="0.01" placeholder="5200.00">
                    </div>
                    <div class="form-group flex-1">
                        <label for="monto-desde">Rige desde *</label>
                        <input type="date" id="monto-desde" class="form-control" required
                            value="${primerDiaDelMes}">
                    </div>
                </div>
                <div class="form-group">
                    <label for="monto-motivo">Motivo del cambio</label>
                    <input type="text" id="monto-motivo" class="form-control" maxlength="500"
                        placeholder="Ej.: ajuste por inflación, se sumó el subsuelo">
                </div>

                <div id="monto-error" class="login-error hidden"></div>

                <div class="flex-end gap-2 mt-3">
                    <button type="button" class="btn-secondary" id="monto-cancelar">Cancelar</button>
                    <button type="submit" class="btn-primary">Guardar monto</button>
                </div>
            </form>`
        );

        document
            .getElementById('monto-cancelar')
            .addEventListener('click', () => window.App.hideModal());

        document.getElementById('form-monto').addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const error = document.getElementById('monto-error');
            const boton = evento.submitter;

            boton.disabled = true;
            boton.textContent = 'Guardando…';

            try {
                await window.api.addContractRate(contractId, {
                    amount: Number(document.getElementById('monto-valor').value),
                    validFrom: document.getElementById('monto-desde').value,
                    notes: document.getElementById('monto-motivo').value.trim() || null,
                });
                window.App.hideModal();
                window.App.showToast('Monto registrado.', 'success');
                await this.cargar();
                window.Cobros?.refrescar();
            } catch (fallo) {
                error.textContent = fallo.message;
                error.classList.remove('hidden');
                boton.disabled = false;
                boton.textContent = 'Guardar monto';
            }
        });
    },

    async abrirHistorial(contractId) {
        window.App.showModal('Historial de montos', '<p class="text-muted">Cargando…</p>');

        try {
            const respuesta = await window.api.getContractRates(contractId);
            const { contract, rates } = respuesta.data;

            const cuerpo =
                rates.length === 0
                    ? '<p class="text-muted text-center p-3">Este contrato todavía no tiene montos.</p>'
                    : `<div class="table-responsive">
                        <table class="table">
                            <thead>
                                <tr><th>Monto</th><th>Rige desde</th><th>Motivo</th></tr>
                            </thead>
                            <tbody>
                                ${rates
                                    .map(
                                        (rate) => `
                                    <tr class="${rate.isCurrent ? 'fila-destacada' : ''}">
                                        <td>
                                            ${rate.isCurrent ? '<strong>' : ''}
                                            ${this.dinero(rate.amount)}
                                            ${rate.isCurrent ? '</strong> <span class="badge badge-success">Vigente</span>' : ''}
                                        </td>
                                        <td>${this.fecha(rate.validFrom)}</td>
                                        <td class="text-muted">${rate.notes ? this.esc(rate.notes) : '—'}</td>
                                    </tr>`
                                    )
                                    .join('')}
                            </tbody>
                        </table>
                       </div>`;

            window.App.showModal(
                `Historial · ${this.esc(contract.name)}`,
                `${cuerpo}
                 <div class="flex-end mt-3">
                     <button type="button" class="btn-secondary" id="historial-cerrar">Cerrar</button>
                 </div>`
            );

            document
                .getElementById('historial-cerrar')
                .addEventListener('click', () => window.App.hideModal());
        } catch (fallo) {
            window.App.showModal(
                'Historial de montos',
                `<p class="text-danger">${this.esc(fallo.message)}</p>`
            );
        }
    },
};
