/**
 * Recibo físico firmado.
 *
 * Adjunta la foto del papel que el empleado firmó al cobrar, como respaldo del
 * pago. **El monto no se lee de la foto**: sigue siendo el que calculó la
 * nómina. Esta pantalla no reemplaza el flujo de pago, solo le suma la
 * evidencia.
 *
 * El beneficiario y la fecha tampoco se escriben a mano: el primero sale del
 * propio pago y la segunda la pone el servidor en hora de Bolivia.
 *
 * Se usa desde la pantalla de pagos y desde el historial, por eso vive aparte.
 */
window.Receipt = (() => {
    /** Tope alineado con el del servidor, para avisar antes de subir en vano. */
    const MAX_BYTES = 3 * 1024 * 1024;

    const esc = (valor) => window.UI.escapeHtml(valor);

    /** Lee el archivo elegido como data URI, que es lo que espera la API. */
    const leerArchivo = (archivo) =>
        new Promise((resolve, reject) => {
            const lector = new FileReader();
            lector.onload = () => resolve(lector.result);
            lector.onerror = () => reject(new Error('No se pudo leer la imagen'));
            lector.readAsDataURL(archivo);
        });

    /**
     * Insignia para las tablas: dice de un vistazo si el pago ya tiene su
     * recibo o si todavía falta.
     */
    const badge = (pago) =>
        pago.receiptPhotoUrl
            ? `<span class="badge badge-success" title="Recibo firmado adjunto${
                  pago.receiptUploadedOn
                      ? ` el ${String(pago.receiptUploadedOn).slice(0, 10)}`
                      : ''
              }">📎 Adjunto</span>`
            : '<span class="badge badge-warning" title="Todavía no se adjuntó el recibo firmado">Falta</span>';

    /**
     * Abre el gestor del recibo de un pago: lo muestra si ya existe, y ofrece
     * adjuntarlo o reemplazarlo.
     *
     * `alGuardar` se llama después de cambiar algo, para que la pantalla que
     * lo invocó refresque su listado.
     */
    async function abrir(pago, alGuardar) {
        const beneficiario = `${pago.user?.firstName || ''} ${pago.user?.lastName || ''}`.trim();
        const tieneRecibo = Boolean(pago.receiptPhotoUrl);

        window.App.showModal(
            'Recibo firmado',
            `<div class="recibo-datos">
                <p><strong>Beneficiario:</strong> ${esc(beneficiario)}</p>
                <p><strong>Período:</strong> ${pago.month}/${pago.year}</p>
                <p class="text-muted text-sm">
                    El monto no se toma de la foto: es el que ya calculó la nómina.
                    Esta imagen es solo el respaldo del recibo firmado.
                </p>
            </div>

            <div id="recibo-vista" class="recibo-vista">
                ${tieneRecibo ? '<p class="text-muted">Cargando la imagen…</p>' : ''}
            </div>

            <div class="form-group mt-3">
                <label for="recibo-archivo">
                    ${tieneRecibo ? 'Reemplazar por otra foto' : 'Foto del recibo'}
                </label>
                <input type="file" id="recibo-archivo" class="form-control"
                    accept="image/jpeg,image/png" capture="environment">
                <small class="text-muted">
                    JPEG o PNG, hasta 3 MB. Desde el celular se abre la cámara directamente.
                </small>
            </div>

            <div id="recibo-error" class="login-error hidden"></div>

            <div class="flex-between mt-3">
                ${
                    tieneRecibo
                        ? '<button type="button" class="btn-danger btn-sm" id="recibo-quitar">Quitar recibo</button>'
                        : '<span></span>'
                }
                <div class="flex gap-2">
                    <button type="button" class="btn-secondary" id="recibo-cerrar">Cerrar</button>
                    <button type="button" class="btn-primary" id="recibo-guardar" disabled>Guardar</button>
                </div>
            </div>`
        );

        const error = document.getElementById('recibo-error');
        const entrada = document.getElementById('recibo-archivo');
        const guardar = document.getElementById('recibo-guardar');
        const vista = document.getElementById('recibo-vista');

        // Las URL de objeto se acumulan en memoria si no se liberan.
        const urlsCreadas = [];
        const liberar = () => urlsCreadas.forEach((url) => URL.revokeObjectURL(url));

        const mostrarError = (mensaje) => {
            error.textContent = mensaje;
            error.classList.remove('hidden');
        };

        document.getElementById('recibo-cerrar').addEventListener('click', () => {
            liberar();
            window.App.hideModal();
        });

        // Imagen ya adjunta. Va por un endpoint autenticado, así que no se
        // puede poner la ruta directa en el `src`: hay que traerla y crear
        // una URL de objeto.
        if (tieneRecibo) {
            try {
                const url = await window.api.getPaymentReceiptUrl(pago.id);
                urlsCreadas.push(url);
                vista.innerHTML = `<img src="${url}" alt="Recibo firmado de ${esc(beneficiario)}" class="recibo-imagen">`;
            } catch (fallo) {
                vista.innerHTML = `<p class="text-danger">${esc(fallo.message)}</p>`;
            }
        }

        let dataUri = null;

        entrada.addEventListener('change', async () => {
            error.classList.add('hidden');
            guardar.disabled = true;
            dataUri = null;

            const archivo = entrada.files?.[0];
            if (!archivo) return;

            // Se avisa acá en vez de dejar que el servidor lo rechace: subir
            // 8 MB por una red lenta para recibir un error es tiempo perdido.
            if (archivo.size > MAX_BYTES) {
                mostrarError(
                    `La imagen pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo es 3 MB.`
                );
                return;
            }

            try {
                dataUri = await leerArchivo(archivo);
                const previa = URL.createObjectURL(archivo);
                urlsCreadas.push(previa);
                vista.innerHTML = `<img src="${previa}" alt="Vista previa del recibo" class="recibo-imagen">`;
                guardar.disabled = false;
            } catch (fallo) {
                mostrarError(fallo.message);
            }
        });

        guardar.addEventListener('click', async () => {
            if (!dataUri) return;

            guardar.disabled = true;
            guardar.textContent = 'Guardando…';

            try {
                const r = await window.api.uploadPaymentReceipt(pago.id, dataUri);
                liberar();
                window.App.hideModal();
                window.App.showToast(
                    `Recibo de ${r.data.beneficiary} adjuntado.`,
                    'success'
                );
                if (alGuardar) await alGuardar();
            } catch (fallo) {
                mostrarError(fallo.message);
                guardar.disabled = false;
                guardar.textContent = 'Guardar';
            }
        });

        document.getElementById('recibo-quitar')?.addEventListener('click', async () => {
            if (!window.confirm('¿Quitar el recibo adjunto de este pago?')) return;

            try {
                await window.api.deletePaymentReceipt(pago.id);
                liberar();
                window.App.hideModal();
                window.App.showToast('Recibo quitado.', 'success');
                if (alGuardar) await alGuardar();
            } catch (fallo) {
                mostrarError(fallo.message);
            }
        });
    }

    return { abrir, badge, MAX_BYTES };
})();
