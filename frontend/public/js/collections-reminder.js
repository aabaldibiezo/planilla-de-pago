/**
 * Recordatorio flotante de cobros a clientes.
 *
 * Un botón fijo en la esquina muestra cuántos cobros hay pendientes: los que
 * vencen en pocos días y los ya vencidos (en rojo). Al tocarlo se ven uno por
 * uno con su monto y su vencimiento, y se marcan como cobrados.
 *
 * Solo para administradores. Se refresca al cambiar de pantalla, así que un
 * contrato nuevo o un cobro registrado se reflejan sin recargar.
 */
window.Cobros = {
    pendientes: [],
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
        try {
            this.pendientes = (await window.api.get('/clients/collections/pending')).data || [];
        } catch {
            // Sin la consulta no se muestra nada: mejor eso que un aviso falso.
            this.pendientes = [];
        }

        const total = this.pendientes.length;
        const vencidos = this.pendientes.filter((p) => p.overdue).length;
        boton.classList.toggle('hidden', total === 0);
        boton.classList.toggle('vencido', vencidos > 0);
        boton.innerHTML = `
            <span class="cobros-icono">💰</span>
            <span class="cobros-texto">${total} ${total === 1 ? 'cobro pendiente' : 'cobros pendientes'}${
                vencidos ? ` · <strong>${vencidos} ${vencidos === 1 ? 'vencido' : 'vencidos'}</strong>` : ''
            }</span>`;
        boton.title = 'Ver los cobros a clientes que hay que hacer';
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

        window.App.showModal(
            'Cobros pendientes a clientes',
            `<div class="mt-2">
                <p class="text-muted text-sm mb-3">
                    Toque <strong>✓ Cobrado</strong> cuando el cliente pague. Si se equivoca, puede deshacerlo
                    enseguida desde el aviso.
                </p>
                ${filas || '<p class="text-muted">No hay cobros pendientes.</p>'}
            </div>`
        );

        document.querySelectorAll('[data-cobrar]').forEach((boton) =>
            boton.addEventListener('click', () => this.cobrar(this.pendientes[Number(boton.dataset.cobrar)], boton))
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
            if (this.pendientes.length) this.abrir();
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
