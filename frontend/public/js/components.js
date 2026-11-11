/**
 * Componentes de interfaz compartidos.
 *
 * `escapeHtml` es la única implementación de escapado del frontend: todas las
 * páginas deben usarla en lugar de definir su propia copia.
 */
(function () {
    const HTML_ENTITIES = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
    };

    const escapeHtml = (value) =>
        String(value ?? '').replace(/[&<>'"]/g, (character) => HTML_ENTITIES[character]);

    /**
     * Convierte un <select> de empleados en un combobox con búsqueda por texto.
     * El <select> original se conserva para no romper el resto del formulario.
     */
    function enhanceEmployeeSelect(select) {
        if (!select || select.dataset.searchable === 'true') return;
        select.dataset.searchable = 'true';

        const wrapper = document.createElement('div');
        wrapper.className = 'employee-combobox';
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);
        select.classList.add('sr-only-select');

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control employee-search';
        input.placeholder = 'Escriba para buscar empleado…';
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-expanded', 'false');

        const list = document.createElement('div');
        list.className = 'employee-options hidden';
        list.setAttribute('role', 'listbox');

        wrapper.insertBefore(input, select);
        wrapper.appendChild(list);

        const options = () =>
            [...select.options].map((option) => ({
                value: option.value,
                label: option.textContent.trim(),
            }));

        const draw = () => {
            const query = input.value.toLocaleLowerCase('es');
            const found = options().filter(
                (option) => !query || option.label.toLocaleLowerCase('es').includes(query)
            );

            list.innerHTML =
                found
                    .map(
                        (option, index) =>
                            `<button type="button" role="option" class="employee-option${index === 0 ? ' active' : ''}" data-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`
                    )
                    .join('') || '<span class="employee-empty">Sin resultados</span>';

            list.classList.remove('hidden');
            input.setAttribute('aria-expanded', 'true');
        };

        input.addEventListener('focus', draw);
        input.addEventListener('input', draw);

        input.addEventListener('keydown', (event) => {
            const items = [...list.querySelectorAll('button')];
            let index = items.findIndex((item) => item.classList.contains('active'));

            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                items[index]?.classList.remove('active');
                index =
                    event.key === 'ArrowDown'
                        ? Math.min(index + 1, items.length - 1)
                        : Math.max(index - 1, 0);
                items[index]?.classList.add('active');
                items[index]?.scrollIntoView({ block: 'nearest' });
            } else if (event.key === 'Enter' && items[index]) {
                event.preventDefault();
                items[index].click();
            } else if (event.key === 'Escape') {
                list.classList.add('hidden');
            }
        });

        list.addEventListener('click', (event) => {
            const option = event.target.closest('.employee-option');
            if (!option) return;

            select.value = option.dataset.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            input.value = option.textContent;
            list.classList.add('hidden');
            input.setAttribute('aria-expanded', 'false');
        });

        document.addEventListener('click', (event) => {
            if (!wrapper.contains(event.target)) list.classList.add('hidden');
        });
    }

    /**
     * Franja fija de suscripción vencida.
     *
     * Se muestra al primer 403 de solo lectura y ya no se quita: mientras la
     * suscripción siga vencida, toda escritura va a fallar, y es mejor que la
     * persona lo sepa antes de cargar un formulario entero que enterarse
     * recién al guardar. La navegación y las consultas siguen funcionando.
     */
    function showReadOnlyBanner(mensaje) {
        if (document.getElementById('read-only-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'read-only-banner';
        banner.className = 'read-only-banner';
        banner.setAttribute('role', 'alert');

        const icono = document.createElement('span');
        icono.textContent = '🔒';
        const texto = document.createElement('span');
        // `textContent` y no `innerHTML`: el texto viene del servidor y no
        // tiene por qué interpretarse como marcado.
        texto.textContent =
            mensaje ||
            'Su suscripción está vencida. Puede consultar su información, pero no registrar cambios.';

        banner.append(icono, texto);
        document.body.prepend(banner);
        document.body.classList.add('has-read-only-banner');
    }

    window.UI = {
        escapeHtml,
        enhanceEmployeeSelect,
        showReadOnlyBanner,
        enhanceEmployeeSelectors(root = document) {
            root.querySelectorAll(
                '#filter-user,#att-user,#history-user,#entry-user,[data-employee-select]'
            ).forEach(enhanceEmployeeSelect);
        },
    };
})();
