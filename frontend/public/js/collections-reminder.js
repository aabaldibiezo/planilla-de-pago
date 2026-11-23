/**
 * Aviso flotante de contratos y cobros.
 *
 * Lo primero que avisa son los CONTRATOS POR VENCER: los que terminan en las
 * próximas 2 semanas (y los vencidos hace poco sin renovar, en rojo), para
 * renovarlos a tiempo y no perder al cliente. Además muestra los cobros a
 * clientes pendientes.
 *
 * Solo para administradores. Se refresca al cambiar de pantalla, así que un
 * contrato renovado o un cobro registrado se reflejan sin recargar.
 */
window.Cobros = {
    pendientes: [],
    porVencer: [],
    MESES: [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ],

    esc(valor) {
        return window.UI.escapeHtml(valor);
    },

    fecha(iso) {
        return iso.split('-').reverse().join('/');
    },

    boton() {
        let boton = document.getElementById('cobros-flotante');
        if (!boton) {
            boton = document.createElement('button');
            boton.id = 'cobros-flotante';
            boton.type = 'button';
            boton.className = 'cobros-flotante hidden';
            boton.addEventListener('click', () => this.abrir());
            (document.getElementById('app-main') || document.body).appendChild(boton);
        }
        return boton;
    },

    async refrescar() {
        const boton = this.boton();
        if (!window.auth?.isAdmin?.()) {
            boton.classList.add('hidden');
            return;
        }
        // Sin la consulta no se muestra nada: mejor eso que un aviso falso.
        const [pendientes, porVencer] = await Promise.all([
            window.api.get('/clients/collections/pending').then((r) => r.data || []).catch(() => []),
            window.api.get('/clients/contracts/expiring').then((r) => r.data || []).catch(() => []),
        ]);
        this.pendientes = pendientes;
        this.porVencer = porVencer;

        const contratos = this.porVencer.length;
        const cobros = this.pendientes.length;
        const urgente =
            this.porVencer.some((c) => c.expired || c.daysLeft <= 3) || this.pendientes.some((p) => p.overdue);

        boton.classList.toggle('hidden', contratos + cobros === 0);
        boton.classList.toggle('vencido', urgente);

        const partes = [];
        if (contratos) {
            partes.push(
                `<span class="cobros-icono">📄</span><span class="cobros-texto"><strong>${contratos}</strong> ${
                    contratos === 1 ? 'contrato por vencer' : 'contratos por vencer'
                }</span>`
            );
        }
        if (cobros) {
            partes.push(
                `<span class="cobros-icono">💰</span><span class="cobros-texto">${cobros} ${
                    cobros === 1 ? 'cobro' : 'cobros'
                }</span>`
            );
        }
        boton.innerHTML = partes.join('<span class="cobros-separador">·</span>');
        boton.title = 'Contratos que hay que renovar y cobros pendientes';
    },

    /** "Vence en 5 días", "Vence hoy", "Venció hace 3 días". */
    textoVencimiento(c) {
        if (c.expired) return `Venció hace ${-c.daysLeft} ${c.daysLeft === -1 ? 'día' : 'días'}`;
        if (c.daysLeft === 0) return 'Vence hoy';
        if (c.daysLeft === 1) return 'Vence mañana';
        return `Vence en ${c.daysLeft} días`;
    },

    /** Lleva al contrato en Clientes y abre su edición para poner la nueva fecha de fin. */
    async renovar(c) {
        window.App.hideModal();
        await window.App.navigateTo('clients');
        const pagina = window.ClientsPage;
        for (let i = 0; i < 20 && !pagina?.clientes?.length; i += 1) {
            await new Promise((r) => setTimeout(r, 250));
        }
        const cliente = pagina?.clientes?.find((x) => x.id === c.clientId);
        const contrato = cliente?.contracts?.find((k) => k.id === c.contractId);
        if (cliente && contrato) {
            pagina.abrirFormularioContrato(cliente, contrato);
            window.App.showToast('Ponga la nueva "Fecha de fin" y guarde para renovarlo.', 'info');
        } else {
            window.App.showToast(`Busque el contrato de ${c.clientName} en esta lista.`, 'info');
        }
    },

    abrir() {
        const filas = this.pendientes
            .map((p, indice) => {
                const estado = p.overdue
                    ? `<span class="badge badge-danger">Vencido hace ${p.daysLate} ${p.daysLate === 1 ? 'día' : 'días'}</span>`
                    : `<span class="badge badge-warning">Vence el ${this.fecha(p.dueDate)}</span>`;
                return `
                    <div class="cobro-fila ${p.overdue ? 'vencido' : ''}">
                        <div class="cobro-datos">
                            <strong>${this.esc(p.clientName)}</strong>
                            <span class="text-muted text-sm">${this.esc(p.contractName)} · ${this.MESES[p.month - 1]} ${p.year}</span>
                            <span class="text-sm">${estado}</span>
                        </div>
                        <div class="cobro-acciones">
                            <strong class="cobro-monto">${window.App.formatCurrency(p.amount)}</strong>
                            <button type="button" class="btn-primary btn-sm" data-cobrar="${indice}">✓ Cobrado</button>
                        </div>
                    </div>`;
            })
            .join('');

        const filasContratos = this.porVencer
            .map((c, indice) => {
                const urgente = c.expired || c.daysLeft <= 3;
                return `
                    <div class="cobro-fila ${urgente ? 'vencido' : ''}">
                        <div class="cobro-datos">
                            <strong>${this.esc(c.clientName)}</strong>
                            <span class="text-muted text-sm">${this.esc(c.contractName)}${
                                c.reference ? ` · N.º ${this.esc(c.reference)}` : ''
                            } · termina el ${this.fecha(c.endDate)}</span>
                            <span class="text-sm"><span class="badge ${urgente ? 'badge-danger' : 'badge-warning'}">${this.textoVencimiento(c)}</span></span>
                        </div>
                        <div class="cobro-acciones">
                            ${c.monthlyAmount ? `<strong class="cobro-monto">${window.App.formatCurrency(c.monthlyAmount)}<small class="text-muted"> /mes</small></strong>` : ''}
                            <button type="button" class="btn-primary btn-sm" data-renovar="${indice}">🔄 Renovar</button>
                        </div>
                    </div>`;
            })
            .join('');

        window.App.showModal(
            'Contratos y cobros',
            `<div class="mt-2">
                <h4 class="aviso-titulo">📄 Contratos por vencer</h4>
                <p class="text-muted text-sm mb-3">
                    Vencen en las próximas 2 semanas o ya vencieron sin renovarse. Renuévelos a tiempo para no
                    perder al cliente y mantener al día la facturación y los impuestos.
                </p>
                ${filasContratos || '<p class="text-muted text-sm mb-3">Ningún contrato vence en las próximas 2 semanas.</p>'}
                <h4 class="aviso-titulo mt-4">💰 Cobros pendientes</h4>
                <p class="text-muted text-sm mb-3">
                    Toque <strong>✓ Cobrado</strong> cuando el cliente pague. Si se equivoca, puede deshacerlo
                    enseguida desde el aviso.
                </p>
                ${filas || '<p class="text-muted text-sm">No hay cobros pendientes.</p>'}
            </div>`
        );

        document.querySelectorAll('[data-cobrar]').forEach((boton) =>
            boton.addEventListener('click', () => this.cobrar(this.pendientes[Number(boton.dataset.cobrar)], boton))
        );
        document.querySelectorAll('[data-renovar]').forEach((boton) =>
            boton.addEventListener('click', () => this.renovar(this.porVencer[Number(boton.dataset.renovar)]))
        );
    },

    async cobrar(pendiente, boton) {
        boton.disabled = true;
        boton.textContent = 'Guardando…';
        try {
            await window.api.post(`/clients/contracts/${pendiente.contractId}/collections`, {
                month: pendiente.month,
                year: pendiente.year,
            });
            this.avisarConDeshacer(pendiente);
            await this.refrescar();
            if (this.pendientes.length || this.porVencer.length) this.abrir();
            else window.App.hideModal();
        } catch (error) {
            window.App.showToast(error.message, 'error');
            boton.disabled = false;
            boton.textContent = '✓ Cobrado';
        }
    },

    /** Confirmación con opción de deshacer, por si se tocó el cobro equivocado. */
    avisarConDeshacer(pendiente) {
        document.getElementById('cobro-deshacer')?.remove();
        const aviso = document.createElement('div');
        aviso.id = 'cobro-deshacer';
        aviso.className = 'cobro-deshacer';
        aviso.innerHTML = `
            <span>✅ Cobrado: ${this.esc(pendiente.clientName)} · ${this.MESES[pendiente.month - 1]}</span>
            <button type="button" class="btn-secondary btn-sm">Deshacer</button>`;
        aviso.querySelector('button').addEventListener('click', async () => {
            try {
                await window.api.delete(
                    `/clients/contracts/${pendiente.contractId}/collections/${pendiente.year}/${pendiente.month}`
                );
                aviso.remove();
                await this.refrescar();
                window.App.showToast('Cobro deshecho.', 'info');
            } catch (error) {
                window.App.showToast(error.message, 'error');
            }
        });
        document.body.appendChild(aviso);
        setTimeout(() => aviso.remove(), 8000);
    },
};
