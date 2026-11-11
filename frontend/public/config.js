/**
 * Dirección del backend para DESARROLLO LOCAL.
 *
 * En producción este archivo no se usa: `scripts/build.js` lo reescribe en
 * `dist/` con el valor de `VITE_API_URL`, así que editarlo acá no afecta al
 * despliegue de Vercel.
 *
 * Valores habituales:
 *   'http://localhost:4000'      backend corriendo en este mismo equipo
 *   'http://192.168.1.6:4001'    para abrir el panel desde otro dispositivo
 *                                de la red (poner la IP real del equipo)
 *   ''                           mismo origen; sirve si un proxy expone /api
 *
 * Cualquier origen desde el que se abra el panel tiene que estar además en
 * `CORS_ORIGINS` del backend, o el navegador bloqueará las peticiones.
 */
window.__ENV__ = Object.freeze({ VITE_API_URL: 'http://localhost:4000' });
