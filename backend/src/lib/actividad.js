/**
 * Traduce una petición a un texto que el gerente general entienda:
 * "Descargó una boleta de pago", "Creó un empleado", etc.
 *
 * Decide también qué se registra: todo lo que cambia algo (crear, editar,
 * borrar, subir) y las descargas de archivos. Las consultas comunes (ver una
 * lista) no se registran: llenarían el registro de ruido.
 *
 * Módulo puro: se puede probar sin servidor ni base de datos.
 */

const SECCIONES = {
  users: 'Empleados',
  attendance: 'Asistencia',
  payments: 'Pagos',
  workforce: 'Personal',
  worksites: 'Sedes',
  clients: 'Clientes y contratos',
  statement: 'Estado de resultados',
  holidays: 'Feriados',
  auth: 'Cuenta',
};

/** Descargas y archivos: se registran aunque sean GET. */
const DESCARGAS = [
  { patron: /^\/payments\/\d+\/pdf$/, texto: 'Descargó una boleta de pago' },
  { patron: /^\/payments\/\d+\/receipt$/, texto: 'Vio el recibo firmado de un pago' },
  { patron: /^\/payments\/monthly-report$/, texto: 'Descargó el reporte mensual de pagos' },
  { patron: /^\/payments\/preview$/, texto: 'Vio la boleta previa de un empleado' },
  { patron: /^\/attendance\/.*photo/, texto: 'Vio la foto de un marcaje' },
  { patron: /^\/statement\/.*(export|pdf|excel)/, texto: 'Descargó el estado de resultados' },
];

/** Acciones con un texto propio, por método y ruta. */
const CONOCIDAS = [
  { metodo: 'POST', patron: /^\/users$/, texto: 'Creó un empleado' },
  { metodo: 'PUT', patron: /^\/users\/\d+$/, texto: 'Editó los datos de un empleado' },
  { metodo: 'DELETE', patron: /^\/users\/\d+$/, texto: 'Desactivó a un empleado' },
  { metodo: 'POST', patron: /^\/users\/\d+\/reset-password$/, texto: 'Generó una contraseña nueva para un empleado' },
  { metodo: 'POST', patron: /^\/payments\/pay$/, texto: 'Registró el pago de un sueldo' },
  { metodo: 'POST', patron: /^\/payments\/\d+\/receipt$/, texto: 'Subió la foto del recibo firmado' },
  { metodo: 'DELETE', patron: /^\/payments\/\d+\/receipt$/, texto: 'Borró la foto del recibo firmado' },
  { metodo: 'POST', patron: /^\/attendance\/sessions\/self\/clock-in$/, texto: 'Marcó su entrada' },
  { metodo: 'PATCH', patron: /^\/attendance\/sessions\/self\/\d+\/clock-out$/, texto: 'Marcó su salida' },
  { metodo: 'POST', patron: /^\/attendance\/team\/clock-in$/, texto: 'Marcó la entrada de otro empleado' },
  { metodo: 'PATCH', patron: /^\/attendance\/team\/\d+\/clock-out$/, texto: 'Marcó la salida de otro empleado' },
  { metodo: 'POST', patron: /^\/attendance\/team\/worked-day$/, texto: 'Registró el día de un temporal' },
  { metodo: 'POST', patron: /^\/worksites$/, texto: 'Creó una sede' },
  { metodo: 'PUT', patron: /^\/worksites\/\d+$/, texto: 'Editó una sede' },
  { metodo: 'DELETE', patron: /^\/worksites\/\d+$/, texto: 'Eliminó una sede' },
  { metodo: 'POST', patron: /^\/worksites\/assignments$/, texto: 'Asignó un empleado a una sede' },
  { metodo: 'DELETE', patron: /^\/worksites\/assignments\/\d+$/, texto: 'Quitó a un empleado de una sede' },
  { metodo: 'POST', patron: /^\/auth\/change-password$/, texto: 'Cambió su contraseña' },
  { metodo: 'PUT', patron: /^\/auth\/profile$/, texto: 'Editó su perfil' },
];

const VERBO = { POST: 'Creó o registró', PUT: 'Editó', PATCH: 'Modificó', DELETE: 'Eliminó' };

/**
 * `ruta` es la parte después de /api, sin query (p. ej. "/payments/12/pdf").
 * Devuelve { seccion, descripcion, entidadId } o null si no se registra.
 */
const describirActividad = (metodo, ruta) => {
  const limpia = String(ruta || '').split('?')[0].replace(/\/+$/, '') || '/';
  const partes = limpia.split('/').filter(Boolean);
  const seccion = SECCIONES[partes[0]];
  if (!seccion) return null;

  // El ingreso se registra aparte (con la persona ya identificada).
  if (partes[0] === 'auth' && partes[1] === 'login') return null;

  const entidadId = partes.find((p) => /^\d+$/.test(p)) || null;

  if (metodo === 'GET') {
    const descarga = DESCARGAS.find((d) => d.patron.test(limpia));
    return descarga ? { seccion, descripcion: descarga.texto, entidadId } : null;
  }

  const conocida = CONOCIDAS.find((c) => c.metodo === metodo && c.patron.test(limpia));
  if (conocida) return { seccion, descripcion: conocida.texto, entidadId };

  const verbo = VERBO[metodo];
  if (!verbo) return null;
  return { seccion, descripcion: `${verbo} en ${seccion}`, entidadId };
};

module.exports = { describirActividad };
