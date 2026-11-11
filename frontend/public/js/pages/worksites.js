/**
 * WorksitesPage — Sedes o zonas de trabajo (solo administrador de la empresa).
 *
 * El administrador nunca ve metros ni coordenadas: elige un lugar en el mapa y
 * un tamaño de zona expresado en palabras. La traducción a radio y a latitud /
 * longitud ocurre acá adentro.
 */
window.WorksitesPage = {
    sedes: [],
    asignaciones: [],
    empleados: [],

    /**
     * Tamaños de zona ofrecidos al administrador.
     *
     * Nota: el geocerco del servidor tolera además hasta 100 m extra por
     * imprecisión del GPS, así que el radio efectivo es mayor que el nominal.
     * Sin ese margen, un teléfono con mala señal rechazaría a alguien que sí
     * está en el lugar.
     */
    ZONAS: [
        {
            clave: 'EDIFICIO',
            etiqueta: 'Solo el edificio',
            descripcion: 'La propiedad y su entrada',
            metros: 75,
        },
        {
            clave: 'CUADRA',
            etiqueta: 'La cuadra',
            descripcion: 'El edificio y la vereda de enfrente',
            metros: 200,
        },
        {
            clave: 'VARIAS',
            etiqueta: 'Varias cuadras',
            descripcion: 'Un predio grande o un conjunto',
            metros: 500,
        },
        {
            clave: 'BARRIO',
            etiqueta: 'Todo el barrio',
            descripcion: 'Zonas amplias o rutas de trabajo',
            metros: 1200,
        },
    ],

    /**
     * Límites del ajuste fino. El backend acepta de 20 a 20000 m, pero un radio
     * de 20 m no tolera el error normal de un GPS y uno de 20 km deja de ser un
     * control. Este rango cubre lo razonable sin dejar elegir un disparate.
     */
    RADIO_MIN: 50,
    RADIO_MAX: 2000,

    esc(valor) {
        return window.UI.escapeHtml(valor);
    },

    /** Devuelve la zona cuyo radio es el más cercano al guardado. */
    zonaDesdeMetros(metros) {
        return this.ZONAS.reduce((mejor, zona) =>
            Math.abs(zona.metros - metros) < Math.abs(mejor.metros - metros) ? zona : mejor
        );
    },

    /**
     * El radio en palabras, para que el número no quede solo.
     *
     * Quien no maneja distancias en metros necesita una referencia; decir
     * "180 metros" a secas no le dice nada sobre qué va a pasar en la práctica.
     */
    radioEnPalabras(metros) {
        const zona = this.zonaDesdeMetros(metros);
        const diferencia = metros - zona.metros;

        if (Math.abs(diferencia) <= zona.metros * 0.1) {
            return `${metros} metros · ${zona.descripcion.toLowerCase()}`;
        }

        return diferencia > 0
            ? `${metros} metros · algo más que «${zona.etiqueta.toLowerCase()}»`
            : `${metros} metros · algo menos que «${zona.etiqueta.toLowerCase()}»`;
    },

    // ============================================================
    // LISTADO
    // ============================================================

    async render() {
        return `
            <div class="page-header flex-between">
                <div>
                    <h1 class="page-title">📍 Sedes de trabajo</h1>
                    <p class="page-subtitle">
                        Lugares donde su personal presta servicio. Cada sede define la zona
                        dentro de la cual sus empleados pueden marcar asistencia.
                    </p>
                </div>
                <button class="btn-primary" id="btn-nueva-sede">＋ Nueva sede</button>
            </div>

            <div id="sedes-lista">
                <div class="card"><div class="text-center text-muted p-4">Cargando sedes…</div></div>
            </div>
        `;
    },

    async init() {
        document
            .getElementById('btn-nueva-sede')
            .addEventListener('click', () => this.abrirAsistente());

        document.getElementById('sedes-lista').addEventListener('click', (evento) => {
            const tarjeta = evento.target.closest('[data-sede-id]');
            if (!tarjeta) return;
            const sede = this.sedes.find((item) => item.id === Number(tarjeta.dataset.sedeId));
            if (sede) this.abrirFicha(sede);
        });

        await this.cargar();
    },

    async cargar() {
        const contenedor = document.getElementById('sedes-lista');

        try {
            const [sedesRes, asignacionesRes, usuariosRes] = await Promise.all([
                window.api.getWorksites(),
                window.api.getWorksiteAssignments(),
                window.api.getUsers(),
            ]);

            this.sedes = sedesRes.data || [];
            this.asignaciones = asignacionesRes.data || [];
            this.empleados = (usuariosRes.data || []).filter(
                (usuario) => usuario.isActive && usuario.role !== 'ADMIN'
            );

            this.pintarLista();
        } catch (error) {
            contenedor.innerHTML = `<div class="card"><div class="text-center text-danger p-4">${this.esc(error.message)}</div></div>`;
        }
    },

    /** Cantidad de empleados distintos asignados a una sede. */
    empleadosDe(sedeId) {
        return new Set(
            this.asignaciones
                .filter((asignacion) => asignacion.worksiteId === sedeId)
                .map((asignacion) => asignacion.userId)
        ).size;
    },

    pintarLista() {
        const contenedor = document.getElementById('sedes-lista');

        if (this.sedes.length === 0) {
            contenedor.innerHTML = `
                <div class="card">
                    <div class="text-center p-4">
                        <p class="text-muted">Todavía no hay sedes registradas.</p>
                        <p class="text-muted text-sm">
                            Sin sedes, sus empleados no podrán marcar asistencia desde el celular.
                        </p>
                    </div>
                </div>`;
            return;
        }

        contenedor.innerHTML = `
            <div class="sedes-grid">
                ${this.sedes
                    .map((sede) => {
                        const cantidad = this.empleadosDe(sede.id);
                        const vacia = cantidad === 0;

                        return `
                        <div class="sede-tarjeta ${vacia ? 'sede-vacia' : ''}" data-sede-id="${sede.id}" role="button" tabindex="0">
                            <div class="sede-nombre">
                                ${vacia ? '<span class="sede-alerta" aria-hidden="true">⚠</span>' : ''}
                                ${this.esc(sede.name)}
                            </div>
                            <div class="sede-direccion">${this.esc(sede.address)}</div>
                            <div class="sede-empleados ${vacia ? 'text-warning' : 'text-muted'}">
                                ${vacia ? 'Sin empleados asignados' : `👥 ${cantidad} empleado${cantidad === 1 ? '' : 's'} asignado${cantidad === 1 ? '' : 's'}`}
                            </div>
                        </div>`;
                    })
                    .join('')}
            </div>`;
    },

    // ============================================================
    // ASISTENTE DE ALTA / EDICIÓN
    // ============================================================

    abrirAsistente(sede = null) {
        const esEdicion = Boolean(sede);
        const zonaActual = esEdicion
            ? this.zonaDesdeMetros(Number(sede.radiusMeters))
            : this.ZONAS[1];

        window.App.showModal(
            esEdicion ? 'Cambiar zona de la sede' : 'Nueva sede',
            `
            <form id="form-sede" class="mt-2">
                <ol class="wizard-pasos">
                    <li class="wizard-paso" data-indicador="1">
                        <span class="wizard-numero">1</span><span class="wizard-titulo">¿Dónde queda?</span>
                    </li>
                    <li class="wizard-paso" data-indicador="2">
                        <span class="wizard-numero">2</span><span class="wizard-titulo">¿Qué tan grande es la zona?</span>
                    </li>
                </ol>

                <!-- Paso 1 -->
                <div class="wizard-panel" data-paso="1">
                    <div class="form-group">
                        <label for="sede-nombre">Nombre de la sede</label>
                        <input type="text" id="sede-nombre" class="form-control" maxlength="150" required
                            placeholder="Ej.: Condominio Las Palmas"
                            value="${esEdicion ? this.esc(sede.name) : ''}">
                    </div>

                    <p class="ubicar-titulo">¿Dónde queda? Use la opción que le resulte más fácil:</p>

                    <div class="ubicar-opcion">
                        <span class="ubicar-letra">A</span>
                        <div class="flex-1 form-group mb-0">
                            <label for="sede-buscar" class="ubicar-label">Buscar la dirección</label>
                            <input type="text" id="sede-buscar" class="form-control" autocomplete="off"
                                placeholder="Escriba la calle, la zona o el nombre del lugar…"
                                value="${esEdicion ? this.esc(sede.address) : ''}">
                            <div id="sede-sugerencias" class="sede-sugerencias hidden"></div>
                        </div>
                    </div>

                    <!-- Mapa del paso 1: ubicar el lugar sin depender del buscador. -->
                    <div class="ubicar-opcion">
                        <span class="ubicar-letra">B</span>
                        <div class="flex-1">
                            <span class="ubicar-label">¿No aparece en la búsqueda? Haga clic en el mapa donde queda</span>
                            <span class="text-muted text-sm">
                                Con la vista <strong>Satélite</strong> se ven los techos y las calles, aunque el lugar no tenga nombre.
                            </span>
                        </div>
                    </div>
                    <div class="flex gap-2 mb-2 flex-wrap ubicar-herramientas">
                        <button type="button" class="btn-secondary btn-sm activo" data-capa="mapa">🗺 Mapa</button>
                        <button type="button" class="btn-secondary btn-sm" data-capa="satelite">🛰 Satélite</button>
                        <button type="button" class="btn-secondary btn-sm" id="sede-mi-ubicacion">
                            📍 Estoy en la sede
                        </button>
                    </div>
                    <div id="sede-mapa-ubicar" class="sede-mapa sede-mapa-ubicar"></div>
                    <div id="sede-punto-estado" class="ubicar-estado mt-2"></div>
                </div>

                <!-- Paso 2 -->
                <div class="wizard-panel" data-paso="2">
                    <div id="sede-mapa" class="sede-mapa"></div>

                    <p class="text-muted text-sm mt-2">
                        <strong>Toque el mapa</strong> para poner el punto donde corresponde, o
                        arrástrelo si quedó corrido. El empleado podrá marcar asistencia dentro
                        de la zona azul.
                    </p>

                    <div class="zonas-opciones" id="zonas-opciones">
                        ${this.ZONAS.map(
                            (zona) => `
                            <label class="zona-opcion ${zona.clave === zonaActual.clave ? 'activa' : ''}">
                                <input type="radio" name="zona" value="${zona.clave}"
                                    ${zona.clave === zonaActual.clave ? 'checked' : ''}>
                                <span class="zona-etiqueta">${zona.etiqueta}</span>
                                <span class="zona-descripcion">${zona.descripcion}</span>
                            </label>`
                        ).join('')}
                    </div>

                    <!-- Ajuste fino. Opcional a propósito: quien no quiere pensar
                         en metros elige una tarjeta y no baja hasta acá. -->
                    <div class="zona-ajuste">
                        <label for="zona-radio">Ajuste fino</label>
                        <input type="range" id="zona-radio" class="zona-deslizador"
                            min="${this.RADIO_MIN}" max="${this.RADIO_MAX}" step="10"
                            value="${esEdicion ? Number(sede.radiusMeters) : zonaActual.metros}">
                        <p class="zona-lectura" id="zona-lectura"></p>
                    </div>
                </div>

                <div id="sede-error" class="login-error hidden"></div>

                <div class="flex-between gap-2 mt-3 wizard-acciones">
                    <button type="button" class="btn-secondary" id="sede-atras">Atrás</button>
                    <div class="flex gap-2">
                        <button type="button" class="btn-secondary" id="sede-cancelar">Cancelar</button>
                        <button type="button" class="btn-primary" id="sede-siguiente">Siguiente</button>
                        <button type="submit" class="btn-primary hidden" id="sede-guardar">
                            ${esEdicion ? 'Guardar cambios' : 'Guardar sede'}
                        </button>
                    </div>
                </div>
            </form>`
        );

        this.activarAsistente(sede, zonaActual);
    },

    activarAsistente(sede, zonaInicial) {
        const esEdicion = Boolean(sede);
        const paneles = [...document.querySelectorAll('#form-sede .wizard-panel')];
        const indicadores = [...document.querySelectorAll('#form-sede .wizard-paso')];
        const btnAtras = document.getElementById('sede-atras');
        const btnSiguiente = document.getElementById('sede-siguiente');
        const btnGuardar = document.getElementById('sede-guardar');
        const cajaError = document.getElementById('sede-error');

        let paso = 1;
        let mapa = null;
        let marcador = null;
        let circulo = null;
        // El radio en metros es el dato real; las cuatro tarjetas son atajos
        // que lo fijan en su valor. Antes la tarjeta era el estado y por eso no
        // se podía elegir nada intermedio.
        let radioMetros = esEdicion ? Number(sede.radiusMeters) : zonaInicial.metros;
        let coordenadas = esEdicion
            ? { lat: Number(sede.latitude), lon: Number(sede.longitude) }
            : null;
        let direccion = esEdicion ? sede.address : '';

        const mostrarError = (mensaje) => {
            cajaError.textContent = mensaje;
            cajaError.classList.remove('hidden');
        };
        const limpiarError = () => cajaError.classList.add('hidden');

        const mostrarPaso = () => {
            paneles.forEach((panel) =>
                panel.classList.toggle('activo', Number(panel.dataset.paso) === paso)
            );
            indicadores.forEach((indicador) => {
                const numero = Number(indicador.dataset.indicador);
                indicador.classList.toggle('activo', numero === paso);
                indicador.classList.toggle('completado', numero < paso);
            });
            btnAtras.classList.toggle('hidden', paso === 1);
            btnSiguiente.classList.toggle('hidden', paso === 2);
            btnGuardar.classList.toggle('hidden', paso !== 2);
        };

        // --------------- Búsqueda de direcciones ---------------

        const entradaBusqueda = document.getElementById('sede-buscar');
        const listaSugerencias = document.getElementById('sede-sugerencias');
        let temporizador = null;

        const buscarDireccion = async (texto) => {
            // Nominatim pide como máximo una consulta por segundo, así que la
            // búsqueda se retrasa mientras el usuario sigue escribiendo.
            const url = new URL('https://nominatim.openstreetmap.org/search');
            url.searchParams.set('q', texto);
            url.searchParams.set('format', 'json');
            url.searchParams.set('limit', '5');
            url.searchParams.set('accept-language', 'es');
            url.searchParams.set('countrycodes', 'bo');

            const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!respuesta.ok) throw new Error('No se pudo buscar la dirección');
            return respuesta.json();
        };

        entradaBusqueda.addEventListener('input', () => {
            clearTimeout(temporizador);
            const texto = entradaBusqueda.value.trim();

            if (texto.length < 4) {
                listaSugerencias.classList.add('hidden');
                return;
            }

            temporizador = setTimeout(async () => {
                try {
                    const resultados = await buscarDireccion(texto);
                    listaSugerencias.innerHTML = resultados.length
                        ? resultados
                              .map(
                                  (resultado) =>
                                      `<button type="button" class="sede-sugerencia"
                                          data-lat="${resultado.lat}" data-lon="${resultado.lon}"
                                          data-nombre="${this.esc(resultado.display_name)}">
                                          ${this.esc(resultado.display_name)}
                                       </button>`
                              )
                              .join('')
                        : '<span class="sede-sin-resultados">Sin resultados. Puede continuar y ubicar el punto en el mapa.</span>';
                    listaSugerencias.classList.remove('hidden');
                } catch {
                    listaSugerencias.innerHTML =
                        '<span class="sede-sin-resultados">No se pudo buscar. Continúe y ubique el punto en el mapa.</span>';
                    listaSugerencias.classList.remove('hidden');
                }
            }, 600);
        });

        listaSugerencias.addEventListener('click', (evento) => {
            const opcion = evento.target.closest('.sede-sugerencia');
            if (!opcion) return;

            direccion = opcion.dataset.nombre;
            entradaBusqueda.value = direccion;
            listaSugerencias.classList.add('hidden');
            ubicarPunto(
                { lat: Number(opcion.dataset.lat), lng: Number(opcion.dataset.lon) },
                { acercar: true }
            );
            limpiarError();
        });

        // --------------- Mapa del paso 1: dónde queda ---------------
        //
        // Antes el mapa aparecía recién en el paso 2 y solo si el buscador había
        // encontrado la dirección: un lugar que Nominatim no conoce dejaba el
        // alta trabada en el paso 1. Ahora se puede ubicar tocando el mapa.

        // Sin punto todavía, se centra en las sedes que ya existen (la empresa
        // trabaja en esa ciudad) o, si no hay ninguna, en Cochabamba.
        const conCoordenadas = this.sedes.filter((s) => Number(s.latitude) && Number(s.longitude));
        const centroInicial = coordenadas
            ? [coordenadas.lat, coordenadas.lon]
            : conCoordenadas.length
              ? [Number(conCoordenadas[0].latitude), Number(conCoordenadas[0].longitude)]
              : [-17.3935, -66.157];

        let mapaUbicar = null;
        let marcadorUbicar = null;
        const estadoPunto = document.getElementById('sede-punto-estado');

        // Confirmación visible del punto y, cuando está, el botón Siguiente
        // se destaca: el siguiente paso es obvio sin tener que leer nada.
        const pintarEstado = () => {
            estadoPunto.classList.toggle('listo', Boolean(coordenadas));
            estadoPunto.innerHTML = coordenadas
                ? '<strong>✓ Lugar marcado.</strong> Si quedó corrido, arrastre el marcador o haga clic en otro punto. Después toque <strong>Siguiente</strong>.'
                : 'Todavía no marcó el lugar: busque la dirección (A) o haga clic en el mapa (B).';
            btnSiguiente.classList.toggle('btn-destacado', Boolean(coordenadas));
        };

        /**
         * Completa la dirección a partir del punto tocado, solo si el campo
         * está vacío: nunca pisa lo que el usuario escribió o eligió.
         */
        const completarDireccion = async (lat, lon) => {
            if (entradaBusqueda.value.trim()) return;
            try {
                const url = new URL('https://nominatim.openstreetmap.org/reverse');
                url.searchParams.set('lat', lat);
                url.searchParams.set('lon', lon);
                url.searchParams.set('format', 'json');
                url.searchParams.set('accept-language', 'es');
                const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
                const datos = respuesta.ok ? await respuesta.json() : null;
                if (datos?.display_name && !entradaBusqueda.value.trim()) {
                    direccion = datos.display_name;
                    entradaBusqueda.value = direccion;
                }
            } catch {
                // Sin conexión con Nominatim el punto igual queda marcado.
            }
        };

        /** Pone (o mueve) el punto en el mapa del paso 1 y lo guarda. */
        const ubicarPunto = (posicion, { acercar = false } = {}) => {
            coordenadas = { lat: posicion.lat, lon: posicion.lng };
            if (mapaUbicar) {
                if (marcadorUbicar) {
                    marcadorUbicar.setLatLng(posicion);
                } else {
                    marcadorUbicar = L.marker(posicion, { draggable: true }).addTo(mapaUbicar);
                    marcadorUbicar.on('dragend', (evento) => {
                        const punto = evento.target.getLatLng();
                        coordenadas = { lat: punto.lat, lon: punto.lng };
                    });
                }
                if (acercar) mapaUbicar.setView(posicion, 17);
            }
            pintarEstado();
            limpiarError();
        };

        const dibujarMapaUbicar = () => {
            if (mapaUbicar) {
                mapaUbicar.invalidateSize();
                return;
            }
            // Sin zoom con la rueda: el mapa está dentro de una ventana que se
            // desplaza, y la rueda acercaba el mapa en vez de bajar la ventana.
            // Se acerca con + / − o con doble clic.
            mapaUbicar = L.map('sede-mapa-ubicar', { scrollWheelZoom: false }).setView(
                centroInicial,
                coordenadas ? 17 : 14
            );
            const capas = {
                mapa: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '© OpenStreetMap',
                }),
                // Foto satelital: sirve para reconocer un lugar que no figura
                // con nombre ni dirección en ningún mapa.
                satelite: L.tileLayer(
                    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    { maxZoom: 19, attribution: 'Imágenes © Esri' }
                ),
            };
            capas.mapa.addTo(mapaUbicar);

            document.querySelectorAll('[data-capa]').forEach((boton) =>
                boton.addEventListener('click', () => {
                    Object.values(capas).forEach((capa) => mapaUbicar.removeLayer(capa));
                    capas[boton.dataset.capa].addTo(mapaUbicar);
                    document
                        .querySelectorAll('[data-capa]')
                        .forEach((otro) => otro.classList.toggle('activo', otro === boton));
                })
            );

            if (coordenadas) ubicarPunto({ lat: coordenadas.lat, lng: coordenadas.lon });

            mapaUbicar.on('click', (evento) => {
                ubicarPunto(evento.latlng);
                completarDireccion(evento.latlng.lat, evento.latlng.lng);
            });
        };

        document.getElementById('sede-mi-ubicacion').addEventListener('click', (evento) => {
            const boton = evento.currentTarget;
            if (!window.navigator.geolocation) {
                mostrarError('Este navegador no puede leer la ubicación. Toque el mapa.');
                return;
            }
            boton.disabled = true;
            boton.textContent = 'Buscando su ubicación…';
            window.navigator.geolocation.getCurrentPosition(
                (pos) => {
                    boton.disabled = false;
                    boton.textContent = '📍 Estoy en la sede';
                    ubicarPunto(
                        { lat: pos.coords.latitude, lng: pos.coords.longitude },
                        { acercar: true }
                    );
                    completarDireccion(pos.coords.latitude, pos.coords.longitude);
                },
                () => {
                    boton.disabled = false;
                    boton.textContent = '📍 Estoy en la sede';
                    mostrarError('No se pudo obtener su ubicación. Permita el acceso o toque el mapa.');
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });

        pintarEstado();
        // Leaflet necesita su contenedor visible para medir los mosaicos.
        setTimeout(dibujarMapaUbicar, 60);

        // --------------- Mapa ---------------

        const dibujarMapa = () => {
            if (mapa) {
                // Si volvió al paso 1 y movió el punto, el círculo lo sigue.
                mapa.invalidateSize();
                marcador.setLatLng([coordenadas.lat, coordenadas.lon]);
                circulo.setLatLng([coordenadas.lat, coordenadas.lon]);
                ajustarVista();
                return;
            }

            mapa = L.map('sede-mapa').setView([coordenadas.lat, coordenadas.lon], 16);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap',
            }).addTo(mapa);

            marcador = L.marker([coordenadas.lat, coordenadas.lon], { draggable: true }).addTo(
                mapa
            );

            circulo = L.circle([coordenadas.lat, coordenadas.lon], {
                radius: radioMetros,
                color: '#0284c7',
                fillColor: '#0284c7',
                fillOpacity: 0.18,
                weight: 2,
            }).addTo(mapa);

            marcador.on('drag', (evento) => moverPunto(evento.target.getLatLng()));

            // Tocar el mapa es la salida cuando el buscador no encuentra el
            // lugar: sin esto, una dirección que Nominatim no conoce dejaba el
            // alta en un callejón sin salida.
            mapa.on('click', (evento) => {
                moverPunto(evento.latlng);
                marcador.setLatLng(evento.latlng);
            });

            ajustarVista();
        };

        /** Lleva el punto y su círculo a una posición nueva. */
        const moverPunto = (posicion) => {
            coordenadas = { lat: posicion.lat, lon: posicion.lng };
            if (circulo) circulo.setLatLng(posicion);
        };

        /** Encuadra el círculo completo: el usuario debe ver el efecto de su elección. */
        const ajustarVista = () => {
            if (mapa && circulo) mapa.fitBounds(circulo.getBounds(), { padding: [24, 24] });
        };

        const deslizador = document.getElementById('zona-radio');
        const lectura = document.getElementById('zona-lectura');

        /**
         * Punto único donde el radio cambia. Mantiene sincronizados el círculo,
         * el deslizador, la tarjeta resaltada y el texto en palabras, para que
         * no puedan contradecirse entre sí.
         */
        const aplicarRadio = (metros, origen) => {
            radioMetros = Math.min(this.RADIO_MAX, Math.max(this.RADIO_MIN, Math.round(metros)));

            if (origen !== 'deslizador') deslizador.value = radioMetros;
            lectura.textContent = this.radioEnPalabras(radioMetros);

            // Se resalta la tarjeta más cercana aunque el valor venga del
            // deslizador: quien mueve la barra sigue viendo en qué escala está.
            const cercana = this.zonaDesdeMetros(radioMetros);
            document.querySelectorAll('.zona-opcion').forEach((etiqueta) => {
                const entrada = etiqueta.querySelector('input');
                const esLaCercana = entrada.value === cercana.clave;
                etiqueta.classList.toggle('activa', esLaCercana);
                entrada.checked = esLaCercana;
            });

            if (circulo) {
                circulo.setRadius(radioMetros);
                // Reencuadrar mientras se arrastra la barra marea; solo al soltar.
                if (origen !== 'deslizador') ajustarVista();
            }
        };

        document.getElementById('zonas-opciones').addEventListener('change', (evento) => {
            const elegida = this.ZONAS.find((item) => item.clave === evento.target.value);
            if (elegida) aplicarRadio(elegida.metros, 'tarjeta');
        });

        deslizador.addEventListener('input', (evento) =>
            aplicarRadio(Number(evento.target.value), 'deslizador')
        );
        deslizador.addEventListener('change', () => ajustarVista());

        aplicarRadio(radioMetros, 'inicial');

        // --------------- Navegación ---------------

        btnSiguiente.addEventListener('click', () => {
            limpiarError();

            const nombre = document.getElementById('sede-nombre').value.trim();
            if (!nombre) {
                mostrarError('Escriba el nombre de la sede.');
                return;
            }
            if (!coordenadas) {
                mostrarError('Marque el lugar: toque el mapa o elija una dirección de la lista.');
                return;
            }

            paso = 2;
            mostrarPaso();
            // El mapa se dibuja recién acá: Leaflet necesita que su contenedor
            // sea visible para calcular el tamaño de los mosaicos.
            setTimeout(dibujarMapa, 60);
        });

        btnAtras.addEventListener('click', () => {
            paso = 1;
            mostrarPaso();
            // El mapa del paso 1 estuvo oculto: Leaflet debe volver a medirse.
            if (coordenadas && marcadorUbicar) marcadorUbicar.setLatLng([coordenadas.lat, coordenadas.lon]);
            setTimeout(dibujarMapaUbicar, 60);
        });

        document
            .getElementById('sede-cancelar')
            .addEventListener('click', () => window.App.hideModal());

        document.getElementById('form-sede').addEventListener('submit', async (evento) => {
            evento.preventDefault();
            limpiarError();

            const datos = {
                name: document.getElementById('sede-nombre').value.trim(),
                address: direccion || document.getElementById('sede-buscar').value.trim(),
                latitude: coordenadas.lat,
                longitude: coordenadas.lon,
                radiusMeters: radioMetros,
            };

            btnGuardar.disabled = true;
            const textoPrevio = btnGuardar.textContent;
            btnGuardar.textContent = 'Guardando…';

            try {
                if (esEdicion) {
                    await window.api.updateWorksite(sede.id, datos);
                } else {
                    await window.api.createWorksite(datos);
                }
                window.App.hideModal();
                window.App.showToast('Sede guardada correctamente.', 'success');
                await this.cargar();
            } catch (error) {
                mostrarError(error.message);
                btnGuardar.disabled = false;
                btnGuardar.textContent = textoPrevio;
            }
        });

        mostrarPaso();
    },

    // ============================================================
    // FICHA DE SEDE
    // ============================================================

    abrirFicha(sede) {
        const asignadas = this.asignaciones.filter((item) => item.worksiteId === sede.id);

        const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

        // Se agrupan por empleado: una persona con cinco días tiene cinco
        // asignaciones, pero en pantalla debe verse como una sola fila.
        const porEmpleado = new Map();
        asignadas.forEach((asignacion) => {
            if (!porEmpleado.has(asignacion.userId)) {
                porEmpleado.set(asignacion.userId, { usuario: asignacion.user, filas: [] });
            }
            porEmpleado.get(asignacion.userId).filas.push(asignacion);
        });

        const listado = [...porEmpleado.values()]
            .map(({ usuario, filas }) => {
                const dias = filas
                    .map((fila) => fila.dayOfWeek)
                    .filter((dia) => dia !== null)
                    .sort((a, b) => a - b);
                const todosLosDias = dias.length === 7;
                const detalle = todosLosDias
                    ? 'Todos los días'
                    : dias.length
                      ? dias.map((dia) => DIAS[dia]).join(' · ')
                      : 'Fecha puntual';

                return `
                <div class="asignacion-fila">
                    <div>
                        <div class="font-weight-medium">${this.esc(`${usuario.firstName} ${usuario.lastName}`)}</div>
                        <div class="text-muted text-sm">${detalle}</div>
                    </div>
                    <button class="btn-danger btn-sm" data-quitar="${filas.map((f) => f.id).join(',')}">Quitar</button>
                </div>`;
            })
            .join('');

        window.App.showModal(
            sede.name,
            `
            <div class="ficha-sede">
                <p class="text-muted">${this.esc(sede.address)}</p>

                <div class="flex gap-2 mt-3 mb-4">
                    <button class="btn-secondary" id="ficha-cambiar-zona">🗺 Cambiar zona</button>
                    <button class="btn-danger" id="ficha-eliminar">Desactivar sede</button>
                </div>

                <div class="flex-between mb-2">
                    <h3 class="card-title">Empleados asignados (${porEmpleado.size})</h3>
                    <button class="btn-primary btn-sm" id="ficha-agregar">＋ Agregar</button>
                </div>

                <div id="ficha-asignaciones">
                    ${listado || '<p class="text-muted text-sm">Nadie asignado todavía. Estos empleados no podrán marcar asistencia acá.</p>'}
                </div>
            </div>`
        );

        document.getElementById('ficha-cambiar-zona').addEventListener('click', () => {
            window.App.hideModal();
            setTimeout(() => this.abrirAsistente(sede), 120);
        });

        document
            .getElementById('ficha-agregar')
            .addEventListener('click', () => this.abrirAgregar(sede));

        document.getElementById('ficha-eliminar').addEventListener('click', async () => {
            if (
                !confirm(
                    `¿Desactivar la sede "${sede.name}"? Sus empleados dejarán de poder marcar acá.`
                )
            ) {
                return;
            }
            try {
                await window.api.deleteWorksite(sede.id);
                window.App.hideModal();
                window.App.showToast('Sede desactivada.', 'success');
                await this.cargar();
            } catch (error) {
                window.App.showToast(error.message, 'error');
            }
        });

        document.getElementById('ficha-asignaciones').addEventListener('click', async (evento) => {
            const boton = evento.target.closest('[data-quitar]');
            if (!boton) return;

            const ids = boton.dataset.quitar.split(',').map(Number);
            try {
                await Promise.all(ids.map((id) => window.api.deleteWorksiteAssignment(id)));
                window.App.showToast('Empleado quitado de la sede.', 'success');
                await this.cargar();
                this.abrirFicha(this.sedes.find((item) => item.id === sede.id) || sede);
            } catch (error) {
                window.App.showToast(error.message, 'error');
            }
        });
    },

    abrirAgregar(sede) {
        const yaAsignados = new Set(
            this.asignaciones
                .filter((item) => item.worksiteId === sede.id)
                .map((item) => item.userId)
        );
        const disponibles = this.empleados.filter((empleado) => !yaAsignados.has(empleado.id));

        if (disponibles.length === 0) {
            window.App.showToast(
                'Todos los empleados activos ya están asignados a esta sede.',
                'info'
            );
            return;
        }

        const DIAS = [
            { valor: 1, nombre: 'Lunes' },
            { valor: 2, nombre: 'Martes' },
            { valor: 3, nombre: 'Miércoles' },
            { valor: 4, nombre: 'Jueves' },
            { valor: 5, nombre: 'Viernes' },
            { valor: 6, nombre: 'Sábado' },
            { valor: 0, nombre: 'Domingo' },
        ];

        window.App.showModal(
            `Agregar empleado a ${sede.name}`,
            `
            <form id="form-asignar" class="mt-2">
                <div class="form-group">
                    <label for="asignar-empleado">Empleado</label>
                    <select id="asignar-empleado" class="form-control" required>
                        <option value="">Seleccione…</option>
                        ${disponibles
                            .map(
                                (empleado) =>
                                    `<option value="${empleado.id}">${this.esc(`${empleado.firstName} ${empleado.lastName}`)}</option>`
                            )
                            .join('')}
                    </select>
                </div>

                <!-- Los días y el horario ya se cargaron en el alta del empleado:
                     por defecto se asigna según ese horario y solo se muestra un
                     resumen. Elegir días u horas a mano queda como opción para
                     quien rota entre sedes. -->
                <div id="asignar-resumen" class="asignar-resumen hidden"></div>

                <button type="button" class="btn-enlace" id="asignar-ver-avanzado">
                    Solo algunos días u otro horario
                </button>

                <div id="asignar-avanzado" class="asignar-avanzado hidden">
                <p class="text-muted text-sm mb-2">
                    Úselo si la persona rota entre sedes: por ejemplo, lunes acá y martes en otra.
                </p>
                <div class="form-group" id="asignar-dias">
                    <label>¿Qué días trabaja acá?</label>
                    <div class="dias-grid">
                        ${DIAS.map(
                            (dia) => `
                            <label class="dia-opcion">
                                <input type="checkbox" value="${dia.valor}">
                                <span>${dia.nombre}</span>
                            </label>`
                        ).join('')}
                    </div>
                </div>

                <div class="form-group">
                    <label>¿En qué horario? <span class="text-muted">(opcional)</span></label>
                    <div class="flex gap-2">
                        <input type="time" id="asignar-desde" class="form-control" aria-label="Desde">
                        <input type="time" id="asignar-hasta" class="form-control" aria-label="Hasta">
                    </div>
                    <small class="text-muted">
                        Déjelo vacío si trabaja acá toda la jornada. Indicarlo permite asignar
                        otra sede el mismo día en un horario distinto.
                    </small>
                </div>
                </div>

                <div id="asignar-error" class="login-error hidden"></div>

                <div class="flex-end gap-2 mt-3">
                    <button type="button" class="btn-secondary" id="asignar-cancelar">Cancelar</button>
                    <button type="submit" class="btn-primary">Asignar</button>
                </div>
            </form>`
        );

        // --- Horario del empleado: de dónde salen los días y las horas ---

        const CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

        /**
         * Franjas por día según el horario del empleado. Con varios bloques en
         * un día (08-12 y 14-18) se toma del primer ingreso a la última
         * salida: la sede es donde pasa ese día completo.
         */
        const franjasDelHorario = (empleado) => {
            const porDia = new Map();
            (empleado?.scheduleBlocks || [])
                .filter((b) => b.isActive !== false)
                .forEach((b) => {
                    const dia = Number(b.dayOfWeek);
                    const actual = porDia.get(dia);
                    porDia.set(dia, {
                        dayOfWeek: dia,
                        startTime: actual && actual.startTime < b.startTime ? actual.startTime : b.startTime,
                        endTime: actual && actual.endTime > b.endTime ? actual.endTime : b.endTime,
                    });
                });
            // Lunes primero, domingo al final, como se lee una semana.
            return [...porDia.values()].sort(
                (a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7)
            );
        };

        /** "Lun, Mar, Mié · 06:00 a 14:00", agrupando los días con el mismo horario. */
        const describirHorario = (franjas) => {
            const grupos = new Map();
            franjas.forEach((f) => {
                const clave = `${f.startTime} a ${f.endTime}`;
                grupos.set(clave, [...(grupos.get(clave) || []), CORTOS[f.dayOfWeek]]);
            });
            return [...grupos.entries()]
                .map(([horas, dias]) => `<strong>${dias.join(', ')}</strong> · ${horas}`)
                .join('<br>');
        };

        const selectorEmpleado = document.getElementById('asignar-empleado');
        const resumen = document.getElementById('asignar-resumen');
        const avanzado = document.getElementById('asignar-avanzado');
        const verAvanzado = document.getElementById('asignar-ver-avanzado');

        const pintarResumen = () => {
            const empleado = this.empleados.find((e) => e.id === Number(selectorEmpleado.value));
            if (!empleado) {
                resumen.classList.add('hidden');
                return;
            }
            const franjas = franjasDelHorario(empleado);
            resumen.innerHTML = franjas.length
                ? `<span class="text-muted text-sm">Trabajará acá según su horario:</span><br>${describirHorario(franjas)}`
                : '<span class="text-muted text-sm">No tiene horario cargado:</span><br><strong>todos los días, toda la jornada</strong>';
            resumen.classList.remove('hidden');
        };
        selectorEmpleado.addEventListener('change', pintarResumen);

        verAvanzado.addEventListener('click', () => {
            const abrir = avanzado.classList.contains('hidden');
            avanzado.classList.toggle('hidden', !abrir);
            resumen.classList.toggle('tachado', abrir);
            verAvanzado.textContent = abrir ? 'Usar su horario' : 'Solo algunos días u otro horario';
        });

        document
            .getElementById('asignar-cancelar')
            .addEventListener('click', () => this.abrirFicha(sede));

        document.getElementById('form-asignar').addEventListener('submit', async (evento) => {
            evento.preventDefault();

            const error = document.getElementById('asignar-error');
            const userId = Number(document.getElementById('asignar-empleado').value);
            const manual = !avanzado.classList.contains('hidden');

            // Por defecto, una asignación por día de su horario con sus horas.
            // Sin horario cargado (o eligiendo a mano sin horas), el día entero.
            let plan;
            if (!manual) {
                const empleado = this.empleados.find((e) => e.id === userId);
                const franjas = franjasDelHorario(empleado);
                plan = franjas.length
                    ? franjas
                    : [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek }));
            } else {
                const dias = [...document.querySelectorAll('#asignar-dias input:checked')].map(
                    (casilla) => Number(casilla.value)
                );
                if (dias.length === 0) {
                    error.textContent = 'Elija al menos un día.';
                    error.classList.remove('hidden');
                    return;
                }

                const desde = document.getElementById('asignar-desde').value;
                const hasta = document.getElementById('asignar-hasta').value;

                if (Boolean(desde) !== Boolean(hasta)) {
                    error.textContent = 'Complete las dos horas, o déjelas ambas vacías.';
                    error.classList.remove('hidden');
                    return;
                }
                if (desde && hasta && desde >= hasta) {
                    error.textContent = 'La hora de salida debe ser posterior a la de entrada.';
                    error.classList.remove('hidden');
                    return;
                }
                plan = dias.map((dayOfWeek) => ({
                    dayOfWeek,
                    ...(desde && hasta ? { startTime: desde, endTime: hasta } : {}),
                }));
            }

            const boton = evento.submitter;
            boton.disabled = true;
            boton.textContent = 'Asignando…';
            error.classList.add('hidden');

            // Una asignación por día: así el backend puede resolver qué sede
            // corresponde a cada fecha sin lógica adicional.
            //
            // Los días se procesan uno por uno y se registra el resultado de
            // cada uno. Cortar en el primer error dejaría los días anteriores
            // ya creados y el aviso no diría cuáles: con el control de cruce
            // de horarios activo, que algunos días choquen y otros no es el
            // caso normal, no la excepción.
            const fallidos = [];
            let creados = 0;

            for (const { dayOfWeek, startTime, endTime } of plan) {
                try {
                    await window.api.createWorksiteAssignment({
                        userId,
                        worksiteId: sede.id,
                        dayOfWeek,
                        ...(startTime && endTime ? { startTime, endTime } : {}),
                    });
                    creados += 1;
                } catch (fallo) {
                    // `DIAS` va de lunes a domingo, así que su índice no
                    // coincide con el número de día: hay que buscar por valor.
                    const nombreDia =
                        DIAS.find((item) => item.valor === dayOfWeek)?.nombre || `día ${dayOfWeek}`;
                    fallidos.push({ dia: nombreDia, motivo: fallo.message });
                }
            }

            if (creados > 0) {
                window.App.showToast(
                    `Asignado en ${creados} ${creados === 1 ? 'día' : 'días'}.`,
                    fallidos.length ? 'warning' : 'success'
                );
            }

            if (fallidos.length) {
                error.textContent =
                    `No se pudo asignar ${fallidos.map((f) => f.dia).join(', ')}. ` +
                    fallidos[0].motivo;
                error.classList.remove('hidden');
                boton.disabled = false;
                boton.textContent = 'Asignar';
                if (creados > 0) await this.cargar();
                return;
            }

            await this.cargar();
            this.abrirFicha(this.sedes.find((item) => item.id === sede.id) || sede);
        });
    },
};
