/**
 * Botón de ojo para ver u ocultar la contraseña.
 *
 * Se aplica solo a todo `input[type="password"]` de la página, incluidos los
 * que aparecen después (pantallas armadas con JavaScript), así ningún campo
 * de contraseña queda sin él. Sirve igual en el panel de la empresa y en el
 * de plataforma: trae sus propios estilos.
 */
(function () {
    const OJO_ABIERTO =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
        '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>';
    const OJO_TACHADO =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0112 5c6.4 0 10 7 10 7a17.6 17.6 0 01-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M9.9 9.9a3 3 0 004.2 4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

    const estilos = document.createElement('style');
    estilos.textContent = `
        .campo-clave { position: relative; display: block; width: 100%; }
        .campo-clave > input { width: 100%; padding-right: 46px !important; box-sizing: border-box; }
        .boton-ver-clave {
            position: absolute; top: 50%; right: 6px; transform: translateY(-50%);
            width: 36px; height: 36px; display: grid; place-items: center;
            border: 0; border-radius: 8px; background: transparent; cursor: pointer;
            color: #6b8299; padding: 0;
        }
        .boton-ver-clave:hover { color: #0369a1; background: rgba(3, 105, 161, 0.08); }
        .boton-ver-clave:focus-visible { outline: 2px solid #0369a1; outline-offset: 1px; }
    `;
    document.head.appendChild(estilos);

    const mejorar = (input) => {
        if (input.dataset.verClave) return;
        input.dataset.verClave = '1';

        const envoltorio = document.createElement('span');
        envoltorio.className = 'campo-clave';
        input.parentNode.insertBefore(envoltorio, input);
        envoltorio.appendChild(input);

        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'boton-ver-clave';
        boton.setAttribute('aria-label', 'Mostrar contraseña');
        boton.setAttribute('aria-pressed', 'false');
        boton.title = 'Mostrar contraseña';
        boton.innerHTML = OJO_ABIERTO;
        envoltorio.appendChild(boton);

        boton.addEventListener('click', () => {
            const mostrar = input.type === 'password';
            input.type = mostrar ? 'text' : 'password';
            boton.innerHTML = mostrar ? OJO_TACHADO : OJO_ABIERTO;
            const texto = mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña';
            boton.setAttribute('aria-label', texto);
            boton.setAttribute('aria-pressed', String(mostrar));
            boton.title = texto;
            input.focus();
        });
    };

    const revisar = (raiz) => {
        raiz.querySelectorAll?.('input[type="password"]').forEach(mejorar);
    };

    revisar(document);
    new window.MutationObserver((cambios) => {
        cambios.forEach((cambio) => cambio.addedNodes.forEach((nodo) => revisar(nodo)));
    }).observe(document.body, { childList: true, subtree: true });
})();
