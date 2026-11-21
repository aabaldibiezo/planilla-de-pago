const prisma = require('../lib/prisma');
const { describirActividad } = require('../lib/actividad');

/**
 * Registro de actividad: deja constancia de todo lo que cada persona hace en
 * su empresa (crear, editar, borrar, subir y descargar), con fecha, hora, IP y
 * dispositivo. Solo el gerente general lo ve.
 *
 * Se escribe cuando la respuesta ya salió y solo si salió bien: una acción
 * rechazada no ocurrió. Si el controlador ya guardó un registro detallado
 * (con los datos de antes y después), no se duplica.
 *
 * Nunca guarda el cuerpo de la petición: podría traer contraseñas o fotos.
 */
const registrarActividad = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400 || req.auditado) return;
    const usuario = req.user;
    if (!usuario || !usuario.companyId) return;

    const actividad = describirActividad(req.method, req.originalUrl.replace(/^\/api/, ''));
    if (!actividad) return;

    prisma.auditLog
      .create({
        data: {
          companyId: usuario.companyId,
          actorId: usuario.id,
          action: 'ACTIVIDAD',
          entity: actividad.seccion,
          entityId: actividad.entidadId || '-',
          newData: {
            descripcion: actividad.descripcion,
            metodo: req.method,
            ruta: req.originalUrl.split('?')[0],
          },
          ipAddress: req.ip || null,
          userAgent: req.get('user-agent') || null,
        },
      })
      .catch((error) => console.error('No se pudo guardar la actividad:', error.message));
  });
  next();
};

module.exports = { registrarActividad };
