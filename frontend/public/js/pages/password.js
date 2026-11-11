/**
 * PasswordPage - Cambio de contraseña.
 *
 * Se muestra de forma obligatoria tras el primer ingreso con la contraseña
 * temporal enviada por correo, y también de forma voluntaria desde el perfil.
 */
window.PasswordPage = {
    forced: false,

    async render() {
        this.forced = window.auth.requiresPasswordChange();

        const aviso = this.forced
            ? `<div class="card mb-4 password-notice">
                   <h3 class="card-title">Debe definir su contraseña</h3>
                   <p class="text-muted text-sm mt-2">
                       Ingresó con una contraseña temporal enviada por correo. Para usar el
                       sistema debe reemplazarla por una propia. La temporal dejará de servir.
                   </p>
               </div>`
            : '';

        return `
            <div class="page-header">
                <div>
                    <h1 class="page-title">🔒 Cambiar contraseña</h1>
                    <p class="page-subtitle">Su contraseña es personal: no la comparta con nadie.</p>
                </div>
            </div>

            ${aviso}

            <div class="card password-card">
                <form id="password-form">
                    <div class="form-group">
                        <label for="pwd-current">Contraseña actual</label>
                        <input type="password" id="pwd-current" class="form-control" required
                            autocomplete="current-password" placeholder="La que recibió por correo">
                    </div>

                    <div class="form-group">
                        <label for="pwd-new">Nueva contraseña</label>
                        <input type="password" id="pwd-new" class="form-control" required
                            autocomplete="new-password" minlength="8"
                            placeholder="Mínimo 8 caracteres, con letras y números">
                    </div>

                    <div class="form-group">
                        <label for="pwd-confirm">Repita la nueva contraseña</label>
                        <input type="password" id="pwd-confirm" class="form-control" required
                            autocomplete="new-password" minlength="8">
                    </div>

                    <div id="pwd-error" class="login-error hidden"></div>

                    <div class="flex-end gap-2 mt-3">
                        <button type="submit" class="btn-primary">Guardar contraseña</button>
                    </div>
                </form>
            </div>
        `;
    },

    async init() {
        const form = document.getElementById('password-form');
        const errorBox = document.getElementById('pwd-error');

        const showError = (message) => {
            errorBox.textContent = message;
            errorBox.classList.remove('hidden');
        };

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const current = document.getElementById('pwd-current').value;
            const nueva = document.getElementById('pwd-new').value;
            const confirmacion = document.getElementById('pwd-confirm').value;

            errorBox.classList.add('hidden');

            // Validación local: evita un viaje al servidor por un error de tipeo.
            if (nueva !== confirmacion) {
                showError('Las dos contraseñas nuevas no coinciden.');
                return;
            }
            if (nueva === current) {
                showError('La nueva contraseña debe ser distinta de la actual.');
                return;
            }
            if (!/[a-zA-Z]/.test(nueva) || !/\d/.test(nueva)) {
                showError('La contraseña debe combinar letras y números.');
                return;
            }

            const submit = event.submitter;
            submit.disabled = true;
            const previousText = submit.textContent;
            submit.textContent = 'Guardando…';

            try {
                await window.api.changePassword(current, nueva);
                window.auth.clearPasswordChangeRequirement();
                window.App.showToast('Contraseña actualizada correctamente.', 'success');
                await window.App.navigateTo('dashboard');
            } catch (error) {
                showError(error.message);
            } finally {
                if (document.body.contains(submit)) {
                    submit.disabled = false;
                    submit.textContent = previousText;
                }
            }
        });
    },
};
