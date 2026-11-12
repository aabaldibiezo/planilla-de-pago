/**
 * Cliente HTTP del panel de plataforma.
 *
 * Reemplaza a `datos-demo.js`, que servía datos falsos mientras no existía el
 * modelo de empresas y suscripciones.
 *
 * Usa un token propio (`plataforma_token`), separado del que guarda el panel de
 * empresa cliente: son dos sesiones distintas y tener una abierta no debe
 * afectar a la otra ni en el mismo navegador.
 */
(function () {
    const CLAVE_TOKEN = 'plataforma_token';
    const CLAVE_USUARIO = 'plataforma_usuario';

    const baseUrl = (() => {
        const configurada = (window.__ENV__?.VITE_API_URL || '').trim().replace(/\/$/, '');
        if (!configurada) return '/api';
        return configurada.endsWith('/api') ? configurada : `${configurada}/api`;
    })();

    let token = localStorage.getItem(CLAVE_TOKEN) || null;

    const guardarSesion = (nuevoToken, usuario) => {
        token = nuevoToken;
        localStorage.setItem(CLAVE_TOKEN, nuevoToken);
        localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
    };

    const limpiarSesion = () => {
        token = null;
        localStorage.removeItem(CLAVE_TOKEN);
        localStorage.removeItem(CLAVE_USUARIO);
    };

    const usuarioGuardado = () => {
        try {
            return JSON.parse(localStorage.getItem(CLAVE_USUARIO) || 'null');
        } catch {
            return null;
        }
    };

    const pedir = async (ruta, opciones = {}) => {
        const respuesta = await fetch(`${baseUrl}${ruta}`, {
            ...opciones,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { Authorization: `Bearer ${token}` }),
                ...opciones.headers,
            },
        });

        if (respuesta.status === 401) {
            limpiarSesion();
            throw new Error('Su sesión expiró. Vuelva a ingresar.');
        }

        let cuerpo = null;
        try {
            cuerpo = await respuesta.json();
        } catch {
            cuerpo = null;
        }

        if (!respuesta.ok || cuerpo?.success === false) {
            throw new Error(cuerpo?.error || `Error ${respuesta.status}`);
        }

        return cuerpo?.data;
    };

    /**
     * Ingreso al panel de plataforma.
     *
     * Usa el mismo endpoint de login que el resto del sistema, pero rechaza a
     * quien no sea SUPER_ADMIN: el panel de plataforma no es para las empresas
     * clientes. El servidor igual bloquea cada ruta de `/api/platform`; esto
     * evita además dejar entrar a una pantalla que no tendría datos.
     */
    const ingresar = async (email, password) => {
        const respuesta = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const cuerpo = await respuesta.json().catch(() => null);
        if (!respuesta.ok || !cuerpo?.success) {
            throw new Error(cuerpo?.error || 'Credenciales inválidas');
        }

        const datos = cuerpo.data;
        if (datos.user?.role !== 'SUPER_ADMIN') {
            throw new Error('Esta cuenta no tiene acceso al panel de plataforma');
        }

        // El indicador se guarda junto al usuario, no solo se devuelve: si la
        // persona recarga la página con la contraseña temporal todavía sin
        // cambiar, tiene que volver a la pantalla de cambio y no al panel.
        const usuario = { ...datos.user, mustChangePassword: datos.mustChangePassword };
        guardarSesion(datos.token, usuario);
        return usuario;
    };

    /**
     * Cambio de contraseña del propio súper administrador.
     *
     * Es la única salida del estado de contraseña temporal: una cuenta creada
     * desde el panel nace con `mustChangePassword` y el backend le rechaza
     * todas las rutas de plataforma hasta que la cambie.
     */
    const cambiarClave = async (currentPassword, newPassword) => {
        const resultado = await pedir('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword }),
        });

        // Se limpia el indicador guardado para que un refresco no vuelva a
        // mandar a la pantalla de cambio con la contraseña ya cambiada.
        const usuario = usuarioGuardado();
        if (usuario) {
            localStorage.setItem(
                CLAVE_USUARIO,
                JSON.stringify({ ...usuario, mustChangePassword: false })
            );
        }

        return resultado;
    };

    window.ApiPlataforma = {
        haySesion: () => Boolean(token),
        usuarioGuardado,
        ingresar,
        cambiarClave,
        salir: limpiarSesion,

        empresas: () => pedir('/platform/companies'),
        empresa: (id) => pedir(`/platform/companies/${id}`),
        crearEmpresa: (datos) =>
            pedir('/platform/companies', { method: 'POST', body: JSON.stringify(datos) }),
        cambiarAcceso: (id, active) =>
            pedir(`/platform/companies/${id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ active }),
            }),
        cambiarPlan: (id, planId, reason) =>
            pedir(`/platform/companies/${id}/plan`, {
                method: 'PATCH',
                body: JSON.stringify({ planId, reason }),
            }),
        registrarPago: (id, datos) =>
            pedir(`/platform/companies/${id}/payments`, {
                method: 'POST',
                body: JSON.stringify(datos),
            }),

        planes: () => pedir('/platform/plans'),
        actualizarPlan: (id, datos) =>
            pedir(`/platform/plans/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),

        superAdmins: () => pedir('/platform/super-admins'),
        crearSuperAdmin: (datos) =>
            pedir('/platform/super-admins', { method: 'POST', body: JSON.stringify(datos) }),
    };
})();
