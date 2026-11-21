/**
 * Panel de Administración de Plataforma.
 *
 * Toda la información viene de `/api/platform` a través de `api-plataforma.js`.
 *
 * ⚠️ Todos los montos de esta pantalla están en DÓLARES (USD): son la cuota de
 * suscripción a la plataforma. Los sueldos y boletas que cada empresa gestiona
 * están en bolivianos y viven en el otro panel. No se convierten entre sí.
 */
(function () {
    const api = window.ApiPlataforma;

    const ESTADOS = {
        ACTIVA: { etiqueta: 'Activa', clase: 'estado-activa' },
        POR_VENCER: { etiqueta: 'Por vencer', clase: 'estado-por-vencer' },
        SUSPENDIDA: { etiqueta: 'Solo lectura', clase: 'estado-suspendida' },
        DESACTIVADA: { etiqueta: 'Desactivada', clase: 'estado-desactivada' },
    };

    /** Pago anual: 12 meses pagados + 2 de regalo. */
    const MESES_REGALO_ANUAL = 2;

    /** Correo o celular, lo que tenga la persona. */
    const contacto = (persona) => persona?.email || persona?.phone || persona?.contactEmail || persona?.contactPhone || '—';

    const pareceCorreo = (valor) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);

    let empresas = [];
    let planes = [];
    let filtroEstado = 'TODAS';
    let textoBusqueda = '';

    // --------------- Utilidades ---------------

    const escapar = (valor) =>
        String(valor ?? '').replace(
            /[&<>'"]/g,
            (caracter) =>
                ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[caracter]
        );

    /** Importe de suscripción. Siempre en dólares. */
    const dolares = (monto) =>
        `USD ${Number(monto).toLocaleString('es-BO', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;

    const fechaLarga = (valor) => {
        if (!valor) return '—';
        const iso = String(valor).slice(0, 10);
        return new Date(`${iso}T12:00:00`).toLocaleDateString('es-BO', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    /** Días entre hoy y una fecha; negativo si ya pasó. */
    const diasHasta = (valor) => {
        const objetivo = new Date(`${String(valor).slice(0, 10)}T12:00:00`);
        const hoy = new Date();
        hoy.setHours(12, 0, 0, 0);
        return Math.round((objetivo - hoy) / 86400000);
    };

    /** Texto relativo que evita que el usuario tenga que calcular mentalmente. */
    const textoVencimiento = (valor) => {
        const dias = diasHasta(valor);
        if (dias < 0) return `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`;
        if (dias === 0) return 'Vence hoy';
        if (dias === 1) return 'Vence mañana';
        return `En ${dias} días`;
    };

    const iniciales = (nombre) =>
        String(nombre)
            .split(/\s+/)
            .filter((palabra) => palabra.length > 2)
            .slice(0, 2)
            .map((palabra) => palabra[0])
            .join('')
            .toUpperCase() || '—';

    const avisar = (mensaje, esError = true) => {
        const caja = document.getElementById('aviso-global');
        caja.textContent = mensaje;
        caja.classList.toggle('oculto', !mensaje);
        caja.classList.toggle('mensaje-ok', !esError);
        caja.classList.toggle('mensaje-error', esError);
        if (mensaje) window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    /** Ejecuta una acción mostrando su error en la franja de aviso. */
    const intentar = async (accion) => {
        try {
            avisar('');
            return await accion();
        } catch (error) {
            avisar(error.message || 'Ocurrió un error inesperado');
            return null;
        }
    };

    // --------------- Panel lateral ---------------

    const abrirLateral = (titulo, subtitulo, html) => {
        document.getElementById('lateral-titulo').textContent = titulo;
        document.getElementById('lateral-subtitulo').textContent = subtitulo || '';
        document.getElementById('lateral-cuerpo').innerHTML = html;
        document.getElementById('velo').classList.remove('oculto');
        document.getElementById('panel-lateral').classList.remove('oculto');
        document.getElementById('btn-cerrar-lateral').focus();
    };

    const cerrarLateral = () => {
        document.getElementById('velo').classList.add('oculto');
        document.getElementById('panel-lateral').classList.add('oculto');
    };

    // --------------- Indicadores ---------------

    const pintarIndicadores = () => {
        const contar = (estado) => empresas.filter((empresa) => empresa.statusLabel === estado).length;

        // Solo se factura lo que no está suspendido: una empresa en solo
        // lectura no está generando ingreso este mes.
        const recurrente = empresas
            .filter((empresa) => empresa.statusLabel !== 'SUSPENDIDA' && empresa.statusLabel !== 'DESACTIVADA')
            .reduce((suma, empresa) => suma + Number(empresa.plan.monthlyPriceUsd), 0);

        const tarjetas = [
            { etiqueta: 'Empresas activas', valor: contar('ACTIVA'), modificador: 'indicador-ok' },
            { etiqueta: 'Por vencer', valor: contar('POR_VENCER'), modificador: 'indicador-warn' },
            {
                etiqueta: 'Sin pagar o desactivadas',
                valor: contar('SUSPENDIDA') + contar('DESACTIVADA'),
                modificador: 'indicador-danger',
            },
            { etiqueta: 'Ingreso mensual', valor: dolares(recurrente), modificador: '' },
        ];

        document.getElementById('indicadores').innerHTML = tarjetas
            .map(
                (tarjeta) => `
        <div class="indicador ${tarjeta.modificador}">
          <div class="indicador-etiqueta">${tarjeta.etiqueta}</div>
          <div class="indicador-valor">${escapar(tarjeta.valor)}</div>
        </div>`
            )
            .join('');
    };

    // --------------- Tabla de empresas ---------------

    const filtrar = () =>
        empresas
            .filter((empresa) => filtroEstado === 'TODAS' || empresa.statusLabel === filtroEstado)
            .filter((empresa) => empresa.name.toLocaleLowerCase('es').includes(textoBusqueda))
            // Lo urgente primero: solo lectura, luego por vencer, luego activas.
            .sort((a, b) => {
                const orden = { SUSPENDIDA: 0, POR_VENCER: 1, ACTIVA: 2, DESACTIVADA: 3 };
                if (orden[a.statusLabel] !== orden[b.statusLabel]) {
                    return orden[a.statusLabel] - orden[b.statusLabel];
                }
                return diasHasta(a.nextDueDate) - diasHasta(b.nextDueDate);
            });

    const pintarTabla = () => {
        const filas = filtrar();
        const cuerpo = document.getElementById('cuerpo-tabla');
        const vacio = document.getElementById('sin-resultados');

        vacio.classList.toggle('oculto', filas.length > 0);

        cuerpo.innerHTML = filas
            .map((empresa) => {
                const estado = ESTADOS[empresa.statusLabel];
                const claseFila =
                    {
                        SUSPENDIDA: 'fila-suspendida',
                        POR_VENCER: 'fila-por-vencer',
                        DESACTIVADA: 'fila-desactivada',
                    }[empresa.statusLabel] || '';

                // Marca el uso al tope para que se vea sin leer los números.
                const alLimite =
                    empresa.employeeLimit !== null && empresa.employeesUsed >= empresa.employeeLimit;

                return `
        <tr class="${claseFila}">
          <td>
            <div class="celda-empresa">
              <span class="avatar-empresa" aria-hidden="true">${escapar(iniciales(empresa.name))}</span>
              <div>
                <div class="nombre-empresa">${escapar(empresa.name)}</div>
                <div class="dato-secundario">${escapar(contacto(empresa))}</div>
              </div>
            </div>
          </td>
          <td>${escapar(empresa.plan.name)}</td>
          <td class="alineado-derecha">
            <span class="uso ${alLimite ? 'uso-al-limite' : ''}">${escapar(empresa.usageLabel)}</span>
          </td>
          <td><span class="estado ${estado.clase}">${estado.etiqueta}</span></td>
          <td>
            <div>${fechaLarga(empresa.nextDueDate)}</div>
            <div class="dato-secundario">${textoVencimiento(empresa.nextDueDate)}</div>
          </td>
          <td class="alineado-derecha monto">${dolares(empresa.plan.monthlyPriceUsd)}</td>
          <td class="alineado-derecha">
            <button class="boton boton-secundario" data-detalle="${empresa.id}">Gestionar</button>
          </td>
        </tr>`;
            })
            .join('');
    };

    // --------------- Detalle de empresa ---------------

    const opcionesDePlan = (planIdActual) =>
        planes
            .map(
                (plan) =>
                    `<option value="${plan.id}" ${plan.id === planIdActual ? 'selected' : ''}>
                        ${escapar(plan.name)} — ${escapar(dolares(plan.monthlyPriceUsd))}
                     </option>`
            )
            .join('');

    const abrirDetalle = async (id) => {
        const empresa = await intentar(() => api.empresa(id));
        if (!empresa) return;

        // El pago cubre desde el mes que vence, no desde el mes de hoy.
        const desde = new Date(`${String(empresa.nextDueDate).slice(0, 10)}T12:00:00`);
        const pagos = empresa.payments || [];
        const totalCobrado = pagos.reduce((suma, pago) => suma + Number(pago.amountUsd), 0);

        const precio = Number(empresa.plan.monthlyPriceUsd);
        const activa = empresa.isActive !== false;

        abrirLateral(
            empresa.name,
            contacto(empresa),
            `
      <h3 class="titulo-seccion" style="margin-top:0">Acceso de la empresa</h3>
      <div class="zona-cuenta">
        <div>
          <span class="estado ${ESTADOS[empresa.statusLabel].clase}">${ESTADOS[empresa.statusLabel].etiqueta}</span>
          <div class="dato-secundario" style="margin-top:6px">
            ${
                activa
                    ? 'Su administrador y su personal pueden entrar.'
                    : 'Nadie de la empresa puede entrar. Sus datos se conservan.'
            }
          </div>
        </div>
        <button type="button" class="boton ${activa ? 'boton-peligro' : 'boton-primario'}"
                data-cambiar-acceso="${empresa.id}" data-activa="${activa}">
          ${activa ? 'Desactivar' : 'Reactivar'}
        </button>
      </div>

      <div class="resumen-suscripcion" style="margin-top:18px">
        <div>
          <div class="resumen-item-etiqueta">Plan</div>
          <div class="resumen-item-valor">${escapar(empresa.plan.name)}</div>
        </div>
        <div>
          <div class="resumen-item-etiqueta">Cuota mensual</div>
          <div class="resumen-item-valor">${escapar(dolares(empresa.plan.monthlyPriceUsd))}</div>
        </div>
        <div>
          <div class="resumen-item-etiqueta">Empleados</div>
          <div class="resumen-item-valor">${escapar(empresa.usageLabel)}</div>
        </div>
        <div>
          <div class="resumen-item-etiqueta">Total cobrado</div>
          <div class="resumen-item-valor">${escapar(dolares(totalCobrado))}</div>
        </div>
      </div>

      <h3 class="titulo-seccion">Cambiar de plan</h3>
      <form id="form-plan" class="formulario">
        <div class="campo">
          <label for="detalle-plan">Plan asignado</label>
          <select id="detalle-plan">${opcionesDePlan(empresa.plan.id)}</select>
        </div>
        <div class="campo">
          <label for="detalle-motivo">Motivo (opcional)</label>
          <input type="text" id="detalle-motivo" placeholder="Acuerdo particular, promoción…" />
        </div>
        <button type="submit" class="boton boton-secundario" data-empresa="${empresa.id}">
          Guardar plan
        </button>
      </form>

      <h3 class="titulo-seccion">Registrar pago</h3>
      <p class="dato-secundario" style="margin-bottom:12px">
        Al registrarlo, la empresa vuelve a quedar activa y el vencimiento avanza desde el
        vencimiento anterior (${fechaLarga(empresa.nextDueDate)}), no desde hoy.
      </p>
      <form id="form-pago" class="formulario">
        <div class="campo">
          <label for="pago-tipo">Tipo de pago</label>
          <select id="pago-tipo" data-precio="${precio}">
            <option value="1">Mensual — 1 mes</option>
            <option value="12">Anual — 12 meses + ${MESES_REGALO_ANUAL} de regalo</option>
          </select>
        </div>
        <div class="resumen-pago" id="pago-resumen">Cubre 1 mes</div>
        <div class="campo">
          <label for="pago-monto">Importe en dólares (USD)</label>
          <input type="number" id="pago-monto" step="0.01" min="0.01"
                 value="${precio.toFixed(2)}" required />
        </div>
        <div class="campo-doble">
          <div class="campo">
            <label for="pago-mes">Desde el mes</label>
            <input type="number" id="pago-mes" min="1" max="12" value="${desde.getMonth() + 1}" required />
          </div>
          <div class="campo">
            <label for="pago-anio">Año</label>
            <input type="number" id="pago-anio" min="2020" max="2100" value="${desde.getFullYear()}" required />
          </div>
        </div>
        <div class="campo">
          <label for="pago-notas">Notas (opcional)</label>
          <input type="text" id="pago-notas" placeholder="Transferencia, comprobante N.º…" />
        </div>
        <button type="submit" class="boton boton-primario" data-empresa="${empresa.id}">
          Registrar pago
        </button>
      </form>

      <h3 class="titulo-seccion">Historial de pagos</h3>
      ${
          pagos.length === 0
              ? '<p class="dato-secundario">Todavía no hay pagos registrados.</p>'
              : pagos
                    .map(
                        (pago) => `
        <div class="pago">
          <div>
            <div class="pago-periodo">
              ${escapar(String(pago.periodMonth).padStart(2, '0'))}/${escapar(pago.periodYear)}
              · ${
                  Number(pago.monthsPaid || 1) >= 12
                      ? `Anual (${escapar(pago.monthsPaid)} + ${escapar(pago.bonusMonths)} de regalo)`
                      : Number(pago.monthsPaid || 1) > 1
                        ? `${escapar(pago.monthsPaid)} meses`
                        : 'Mensual'
              }
            </div>
            <div class="dato-secundario">
              Registrado el ${fechaLarga(pago.paidAt)} · Plan ${escapar(pago.planNameSnapshot)}
            </div>
          </div>
          <span class="monto">${escapar(dolares(pago.amountUsd))}</span>
        </div>`
                    )
                    .join('')
      }

      <h3 class="titulo-seccion">Administradores de la empresa</h3>
      ${(empresa.admins || [])
          .map(
              (admin) => `
        <div class="pago">
          <div>
            <div class="pago-periodo">${escapar(admin.firstName)} ${escapar(admin.lastName)}</div>
            <div class="dato-secundario">Ingresa con: ${escapar(contacto(admin))}</div>
          </div>
          <span class="estado ${admin.isActive ? 'estado-activa' : 'estado-suspendida'}">
            ${admin.isActive ? 'Activo' : 'Inactivo'}
          </span>
        </div>`
          )
          .join('')}
    `
        );
    };

    // --------------- Alta de empresa ---------------

    const abrirAltaEmpresa = () => {
        abrirLateral(
            'Nueva empresa cliente',
            'Se crea la empresa y su administrador con una contraseña temporal para que entre.',
            `
      <form id="form-empresa" class="formulario">
        <h3 class="titulo-seccion">Datos de la empresa</h3>
        <div class="campo">
          <label for="empresa-nombre">Nombre</label>
          <input type="text" id="empresa-nombre" required maxlength="150" />
        </div>
        <div class="campo-doble">
          <div class="campo">
            <label for="empresa-correo">Correo (opcional)</label>
            <input type="email" id="empresa-correo" />
          </div>
          <div class="campo">
            <label for="empresa-telefono">Teléfono (opcional)</label>
            <input type="text" id="empresa-telefono" maxlength="30" />
          </div>
        </div>
        <div class="campo">
          <label for="empresa-nit">NIT (opcional)</label>
          <input type="text" id="empresa-nit" maxlength="50" />
        </div>
        <div class="campo">
          <label for="empresa-plan">Plan</label>
          <select id="empresa-plan" required>${opcionesDePlan(planes[0]?.id)}</select>
        </div>

        <h3 class="titulo-seccion">Primer administrador</h3>
        <div class="campo-doble">
          <div class="campo">
            <label for="admin-nombre">Nombre</label>
            <input type="text" id="admin-nombre" required />
          </div>
          <div class="campo">
            <label for="admin-apellido">Apellido</label>
            <input type="text" id="admin-apellido" required />
          </div>
        </div>
        <div class="campo">
          <label for="admin-correo">Correo o celular para entrar</label>
          <input type="text" id="admin-correo" required placeholder="ejemplo@correo.com o 71234567" />
          <span class="ayuda-campo">Con esto y la contraseña temporal entra al sistema.</span>
        </div>

        <button type="submit" class="boton boton-primario boton-ancho">Crear empresa</button>
      </form>
    `
        );
    };

    // --------------- Planes ---------------

    const pintarPlanes = () => {
        document.getElementById('rejilla-planes').innerHTML = planes
            .map(
                (plan) => `
      <form class="tarjeta-plan" data-plan="${plan.id}">
        <div class="plan-cabecera">
          <span class="plan-codigo">${escapar(plan.code)}</span>
          <span class="dato-secundario">${plan.companiesCount} empresa(s)</span>
        </div>
        <div class="campo">
          <label for="plan-nombre-${plan.id}">Nombre</label>
          <input type="text" id="plan-nombre-${plan.id}" value="${escapar(plan.name)}"
                 data-campo="name" maxlength="100" required />
        </div>
        <div class="campo">
          <label for="plan-limite-${plan.id}">Límite de empleados</label>
          <input type="number" id="plan-limite-${plan.id}" min="1" max="100000"
                 value="${plan.maxEmployees ?? ''}" data-campo="maxEmployees"
                 placeholder="Vacío = ilimitado" />
          <span class="ayuda-campo">Dejar vacío para un plan sin tope.</span>
        </div>
        <div class="campo">
          <label for="plan-precio-${plan.id}">Precio mensual (USD)</label>
          <input type="number" id="plan-precio-${plan.id}" step="0.01" min="0"
                 value="${Number(plan.monthlyPriceUsd).toFixed(2)}" data-campo="monthlyPriceUsd"
                 required />
        </div>
        <button type="submit" class="boton boton-secundario boton-ancho">Guardar</button>
      </form>`
            )
            .join('');
    };

    // --------------- Súper administradores ---------------

    const pintarAdmins = (admins) => {
        document.getElementById('cuerpo-admins').innerHTML = admins
            .map(
                (admin) => `
      <tr>
        <td>${escapar(admin.firstName)} ${escapar(admin.lastName)}</td>
        <td>${escapar(contacto(admin))}</td>
        <td>${admin.lastLoginAt ? fechaLarga(admin.lastLoginAt) : 'Nunca'}</td>
        <td>
          <span class="estado ${admin.isActive ? 'estado-activa' : 'estado-suspendida'}">
            ${admin.isActive ? 'Activo' : 'Inactivo'}
          </span>
        </td>
      </tr>`
            )
            .join('');
    };

    const abrirAltaAdmin = () => {
        abrirLateral(
            'Nuevo administrador de plataforma',
            'Recibe una contraseña temporal por correo y debe cambiarla al ingresar.',
            `
      <form id="form-super-admin" class="formulario">
        <div class="campo-doble">
          <div class="campo">
            <label for="sa-nombre">Nombre</label>
            <input type="text" id="sa-nombre" required />
          </div>
          <div class="campo">
            <label for="sa-apellido">Apellido</label>
            <input type="text" id="sa-apellido" required />
          </div>
        </div>
        <div class="campo">
          <label for="sa-correo">Correo</label>
          <input type="email" id="sa-correo" required />
        </div>
        <button type="submit" class="boton boton-primario boton-ancho">Crear administrador</button>
      </form>
    `
        );
    };

    // --------------- Carga y navegación ---------------

    const cargarEmpresas = async () => {
        const [listaEmpresas, listaPlanes] = await Promise.all([api.empresas(), api.planes()]);
        empresas = listaEmpresas;
        planes = listaPlanes;
        pintarIndicadores();
        pintarTabla();
    };

    const cargarSeccion = (seccion) =>
        intentar(async () => {
            document.querySelectorAll('[id^="seccion-"]').forEach((nodo) => {
                nodo.classList.toggle('oculto', nodo.id !== `seccion-${seccion}`);
            });
            document.querySelectorAll('.pestania').forEach((pestania) => {
                pestania.classList.toggle('activa', pestania.dataset.seccion === seccion);
            });

            if (seccion === 'empresas') return cargarEmpresas();
            if (seccion === 'planes') {
                planes = await api.planes();
                return pintarPlanes();
            }
            if (seccion === 'administradores') return pintarAdmins(await api.superAdmins());
            return null;
        });

    /** Una sola pantalla visible a la vez. */
    const mostrarPantalla = (cual) => {
        ['pantalla-acceso', 'pantalla-clave', 'pantalla-panel'].forEach((id) => {
            document.getElementById(id).classList.toggle('oculto', id !== cual);
        });
    };

    const mostrarPanel = (usuario) => {
        // Con contraseña temporal el backend rechaza todo /api/platform, así
        // que no tiene sentido dejar entrar al panel: se fuerza el cambio.
        if (usuario.mustChangePassword) {
            mostrarPantalla('pantalla-clave');
            document.getElementById('clave-actual').focus();
            return;
        }

        mostrarPantalla('pantalla-panel');
        document.getElementById('usuario-actual').textContent = contacto(usuario);
        cargarSeccion('empresas');
    };

    const mostrarAcceso = () => {
        mostrarPantalla('pantalla-acceso');
        document.getElementById('form-acceso').reset();
    };

    // --------------- Eventos ---------------

    document.getElementById('form-acceso').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const error = document.getElementById('acceso-error');
        const boton = document.getElementById('btn-ingresar');

        error.classList.add('oculto');
        boton.disabled = true;
        boton.textContent = 'Ingresando…';

        try {
            const usuario = await api.ingresar(
                document.getElementById('acceso-email').value.trim(),
                document.getElementById('acceso-clave').value
            );
            mostrarPanel(usuario);
        } catch (fallo) {
            error.textContent = fallo.message;
            error.classList.remove('oculto');
        } finally {
            boton.disabled = false;
            boton.textContent = 'Ingresar';
        }
    });

    document.getElementById('form-clave').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const error = document.getElementById('clave-error');
        const boton = document.getElementById('btn-guardar-clave');
        const actual = document.getElementById('clave-actual').value;
        const nueva = document.getElementById('clave-nueva').value;
        const repetida = document.getElementById('clave-repetir').value;

        error.classList.add('oculto');

        // Se comprueba acá para no gastar un viaje al servidor en un typo.
        if (nueva !== repetida) {
            error.textContent = 'Las dos contraseñas nuevas no coinciden.';
            error.classList.remove('oculto');
            return;
        }

        boton.disabled = true;
        boton.textContent = 'Guardando…';

        try {
            await api.cambiarClave(actual, nueva);
            // El usuario guardado trae `mustChangePassword` viejo; se limpia
            // para que un refresco no vuelva a mandarlo a esta pantalla.
            const usuario = { ...api.usuarioGuardado(), mustChangePassword: false };
            mostrarPanel(usuario);
        } catch (fallo) {
            error.textContent = fallo.message;
            error.classList.remove('oculto');
        } finally {
            boton.disabled = false;
            boton.textContent = 'Guardar y continuar';
        }
    });

    document.getElementById('btn-salir').addEventListener('click', () => {
        api.salir();
        mostrarAcceso();
    });

    document.querySelectorAll('.pestania').forEach((pestania) => {
        pestania.addEventListener('click', () => cargarSeccion(pestania.dataset.seccion));
    });

    document.getElementById('buscador').addEventListener('input', (evento) => {
        textoBusqueda = evento.target.value.toLocaleLowerCase('es');
        pintarTabla();
    });

    document.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            filtroEstado = chip.dataset.filtro;
            document
                .querySelectorAll('.chip')
                .forEach((otro) => otro.setAttribute('aria-pressed', String(otro === chip)));
            pintarTabla();
        });
    });

    document.getElementById('cuerpo-tabla').addEventListener('click', (evento) => {
        const boton = evento.target.closest('[data-detalle]');
        if (boton) abrirDetalle(Number(boton.dataset.detalle));
    });

    document.getElementById('btn-nueva-empresa').addEventListener('click', abrirAltaEmpresa);
    document.getElementById('btn-nuevo-admin').addEventListener('click', abrirAltaAdmin);

    // Los formularios del panel lateral se crean dinámicamente, así que el
    // manejador se delega al contenedor en vez de atarse a cada uno.
    document.getElementById('lateral-cuerpo').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const formulario = evento.target;
        const enviar = formulario.querySelector('button[type="submit"]');
        const textoOriginal = enviar?.textContent;
        if (enviar) {
            enviar.disabled = true;
            enviar.textContent = 'Guardando…';
        }

        try {
            if (formulario.id === 'form-plan') {
                const empresaId = Number(enviar.dataset.empresa);
                const resultado = await api.cambiarPlan(
                    empresaId,
                    Number(document.getElementById('detalle-plan').value),
                    document.getElementById('detalle-motivo').value || undefined
                );
                cerrarLateral();
                await cargarEmpresas();
                avisar(resultado.warning || 'Plan actualizado correctamente.', Boolean(resultado.warning));
                return;
            }

            if (formulario.id === 'form-pago') {
                const empresaId = Number(enviar.dataset.empresa);
                const { company } = await api.registrarPago(empresaId, {
                    monthsPaid: Number(document.getElementById('pago-tipo').value),
                    amountUsd: Number(document.getElementById('pago-monto').value),
                    periodMonth: Number(document.getElementById('pago-mes').value),
                    periodYear: Number(document.getElementById('pago-anio').value),
                    notes: document.getElementById('pago-notas').value || undefined,
                });
                cerrarLateral();
                await cargarEmpresas();
                avisar(
                    `Pago registrado. Próximo vencimiento: ${fechaLarga(company.nextDueDate)}.`,
                    false
                );
                return;
            }

            if (formulario.id === 'form-empresa') {
                const acceso = document.getElementById('admin-correo').value.trim();
                const creada = await api.crearEmpresa({
                    name: document.getElementById('empresa-nombre').value.trim(),
                    contactEmail: document.getElementById('empresa-correo').value.trim() || undefined,
                    contactPhone: document.getElementById('empresa-telefono').value || undefined,
                    taxId: document.getElementById('empresa-nit').value || undefined,
                    planId: Number(document.getElementById('empresa-plan').value),
                    ...(pareceCorreo(acceso) ? { adminEmail: acceso } : { adminPhone: acceso }),
                    adminFirstName: document.getElementById('admin-nombre').value.trim(),
                    adminLastName: document.getElementById('admin-apellido').value.trim(),
                });
                await cargarEmpresas();

                if (creada.credentialsDelivered) {
                    cerrarLateral();
                    avisar(`Empresa creada. Se envió la contraseña temporal a ${creada.admin.email}.`, false);
                    return;
                }

                // Sin correo: se muestra la contraseña para pasarla por WhatsApp.
                const usuarioAcceso = contacto(creada.admin);
                const mensaje =
                    `Hola ${creada.admin.firstName}, ya tiene su cuenta del sistema de planilla.\n` +
                    `Entre a: ${window.location.origin}\n` +
                    `Usuario: ${usuarioAcceso}\n` +
                    `Contraseña temporal: ${creada.temporaryPassword}\n` +
                    'Al entrar le pedirá elegir una contraseña propia.';
                // Con celular, WhatsApp abre directo el chat del administrador.
                const celularAdmin = String(creada.admin.phone || '')
                    .replace(/\D/g, '')
                    .replace(/^591/, '');
                abrirLateral(
                    'Empresa creada',
                    creada.name,
                    `
      <p>Pásele estos datos al administrador. La contraseña <strong>no se vuelve a mostrar</strong>.</p>
      <p class="dato-secundario" style="margin-top:12px">Usuario</p>
      <div class="clave-temporal">${escapar(usuarioAcceso)}</div>
      <p class="dato-secundario">Contraseña temporal</p>
      <div class="clave-temporal">${escapar(creada.temporaryPassword)}</div>
      <a class="boton boton-primario boton-ancho" target="_blank" rel="noopener"
         style="background:#16a34a;border-color:#16a34a"
         href="https://wa.me/${celularAdmin ? `591${celularAdmin}` : ''}?text=${encodeURIComponent(mensaje)}">
        💬 ${celularAdmin ? `Enviar por WhatsApp a ${escapar(celularAdmin)}` : 'Enviar por WhatsApp'}
      </a>
      <button type="button" class="boton boton-secundario boton-ancho" style="margin-top:10px"
              id="btn-copiar-acceso">Copiar mensaje</button>
    `
                );
                document.getElementById('btn-copiar-acceso').addEventListener('click', async (e) => {
                    try {
                        await window.navigator.clipboard.writeText(mensaje);
                        e.target.textContent = 'Copiado ✓';
                    } catch {
                        e.target.textContent = 'No se pudo copiar';
                    }
                });
                return;
            }

            if (formulario.id === 'form-super-admin') {
                const creado = await api.crearSuperAdmin({
                    email: document.getElementById('sa-correo').value.trim(),
                    firstName: document.getElementById('sa-nombre').value.trim(),
                    lastName: document.getElementById('sa-apellido').value.trim(),
                });
                cerrarLateral();
                await cargarSeccion('administradores');
                avisar(
                    creado.credentialsDelivered
                        ? `Administrador creado. Se envió la contraseña temporal a ${creado.email}.`
                        : 'Administrador creado, pero falló el envío del correo con la contraseña.',
                    !creado.credentialsDelivered
                );
            }
        } catch (error) {
            avisar(error.message || 'No se pudo completar la operación');
            cerrarLateral();
        } finally {
            if (enviar) {
                enviar.disabled = false;
                enviar.textContent = textoOriginal;
            }
        }
    });

    // Mensual o anual: ajusta el importe sugerido y explica cuánto cubre.
    document.getElementById('lateral-cuerpo').addEventListener('change', (evento) => {
        if (evento.target.id !== 'pago-tipo') return;
        const meses = Number(evento.target.value);
        const precio = Number(evento.target.dataset.precio);
        document.getElementById('pago-monto').value = (precio * meses).toFixed(2);
        document.getElementById('pago-resumen').textContent =
            meses >= 12
                ? `Paga ${meses} meses y cubre ${meses + MESES_REGALO_ANUAL} (${MESES_REGALO_ANUAL} de regalo)`
                : 'Cubre 1 mes';
    });

    document.getElementById('lateral-cuerpo').addEventListener('click', async (evento) => {
        const boton = evento.target.closest('[data-cambiar-acceso]');
        if (!boton) return;

        const id = Number(boton.dataset.cambiarAcceso);
        const activa = boton.dataset.activa === 'true';
        const pregunta = activa
            ? '¿Desactivar esta empresa? Nadie de la empresa podrá entrar (ni el administrador ni el personal) hasta que la reactive. Sus datos no se borran.'
            : '¿Reactivar esta empresa? Podrán volver a entrar.';
        if (!window.confirm(pregunta)) return;

        boton.disabled = true;
        const resultado = await intentar(() => api.cambiarAcceso(id, !activa));
        if (!resultado) {
            boton.disabled = false;
            return;
        }
        cerrarLateral();
        await cargarEmpresas();
        avisar(
            activa ? `${resultado.name} quedó desactivada.` : `${resultado.name} volvió a estar activa.`,
            false
        );
    });

    document.getElementById('rejilla-planes').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const formulario = evento.target.closest('[data-plan]');
        if (!formulario) return;

        const valor = (campo) => formulario.querySelector(`[data-campo="${campo}"]`).value;
        const limite = valor('maxEmployees').trim();

        await intentar(async () => {
            const { plan, companiesOverLimit } = await api.actualizarPlan(
                Number(formulario.dataset.plan),
                {
                    name: valor('name').trim(),
                    // Vacío significa ilimitado; se envía null explícito.
                    maxEmployees: limite === '' ? null : Number(limite),
                    monthlyPriceUsd: Number(valor('monthlyPriceUsd')),
                }
            );

            planes = await api.planes();
            pintarPlanes();

            avisar(
                companiesOverLimit.length > 0
                    ? `Plan "${plan.name}" actualizado. Quedan por encima del nuevo límite: ` +
                          `${companiesOverLimit.map((e) => `${e.name} (${e.employees})`).join(', ')}. ` +
                          'No se dio de baja a nadie; solo no podrán agregar empleados.'
                    : `Plan "${plan.name}" actualizado.`,
                companiesOverLimit.length > 0
            );
        });
    });

    document.getElementById('btn-cerrar-lateral').addEventListener('click', cerrarLateral);
    document.getElementById('velo').addEventListener('click', cerrarLateral);
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape') cerrarLateral();
    });

    // Sesión abierta de una visita anterior: se entra directo al panel.
    if (api.haySesion()) {
        const usuario = api.usuarioGuardado();
        if (usuario) mostrarPanel(usuario);
    }
})();
