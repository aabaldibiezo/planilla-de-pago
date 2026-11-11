const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const emailService = require('../services/email.service');
const {
  estaVencida,
  debeAvisar,
  diasHastaVencimiento,
} = require('../lib/subscription');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Authenticate: verify JWT from Authorization Bearer header,
 * look up the user in the DB, and attach to req.user.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token de autenticación requerido',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no encontrado o inactivo',
      });
    }

    // Attach user (without password) to request
    const { password, ...userWithoutPassword } = user;
    req.user = userWithoutPassword;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token inválido o expirado',
      });
    }
    next(error);
  }
};

/**
 * Require the authenticated user to have ADMIN role.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Se requiere rol de administrador',
    });
  }
  next();
};

/**
 * Permite la operación si el usuario es administrador de la misma empresa,
 * o si actúa sobre sus propios datos. El identificador se toma de
 * `req.params[paramName]`.
 *
 * La verificación de pertenencia a la misma empresa la hacen los servicios
 * mediante `scope()`, pero este middleware agrega una barrera explícita en
 * la capa de transporte: un ADMIN solo pasa si tiene `companyId`, lo que
 * descarta al SUPER_ADMIN (que no debe alcanzar datos operativos por esta
 * vía) y deja claro que el "admin" es el de la empresa, no el de la
 * plataforma.
 */
const requireSelfOrAdmin =
  (paramName = 'id') =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Token de autenticación requerido' });
    }

    const targetId = Number(req.params[paramName]);

    // El propio usuario siempre puede acceder a sus datos.
    if (req.user.id === targetId) {
      return next();
    }

    // Un administrador de empresa puede acceder a datos de su empresa.
    // Se exige companyId explícito para que SUPER_ADMIN (companyId null)
    // no pase por esta vía.
    if (req.user.role === 'ADMIN' && Number.isInteger(req.user.companyId)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Solo puede consultar su propia información',
    });
  };

/**
 * Bloquea las operaciones mientras el usuario siga con su contraseña temporal.
 *
 * Sin esto, una contraseña enviada por correo y nunca cambiada daría acceso
 * indefinido al sistema. Se excluye el propio cambio de contraseña y el perfil,
 * que son las dos operaciones necesarias para salir de este estado.
 */
const blockUntilPasswordChanged = (req, res, next) => {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({
      success: false,
      error: 'Debe cambiar su contraseña temporal antes de continuar',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  next();
};

/**
 * Exige rol SUPER_ADMIN: administración de la plataforma (empresas, planes,
 * cobros y alta de otros súper administradores).
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Se requiere rol de súper administrador',
    });
  }
  next();
};

/**
 * Exige que el usuario pertenezca a una empresa.
 *
 * Es la contracara de `requireSuperAdmin`: el súper administrador gestiona el
 * negocio de la plataforma y no debe alcanzar los datos operativos de ninguna
 * empresa (empleados, asistencia, nómina). Como su `companyId` es null, este
 * middleware lo deja fuera de todas las rutas de negocio por construcción, sin
 * depender de que cada consulta se acuerde de filtrarlo.
 */
const requireCompanyContext = (req, res, next) => {
  if (!req.user || !Number.isInteger(req.user.companyId)) {
    return res.status(403).json({
      success: false,
      error: 'Esta sección corresponde a las empresas clientes',
      code: 'NO_COMPANY_CONTEXT',
    });
  }
  next();
};

/** Métodos que no modifican nada y siguen permitidos con la suscripción vencida. */
const METODOS_DE_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Estado de la suscripción de la empresa: suspende, avisa y bloquea escrituras.
 *
 * La evaluación es perezosa, en cada petición autenticada, en vez de una tarea
 * programada. Así no hace falta un planificador, funciona igual en local que en
 * Railway, y el estado no puede quedar desactualizado porque el servidor
 * estuvo caído justo a medianoche.
 *
 * Debe ir SIEMPRE después de `requireCompanyContext`, que garantiza que hay
 * empresa en el contexto.
 */
const enforceCompanyStatus = async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      include: { plan: true },
    });

    if (!company || !company.isActive) {
      return res.status(403).json({
        success: false,
        error: 'La cuenta de su empresa está desactivada',
        code: 'COMPANY_INACTIVE',
      });
    }

    let estado = company.status;

    // 1. Vencida sin pago registrado: pasa a solo lectura.
    if (estado === 'ACTIVE' && estaVencida(company.nextDueDate)) {
      await prisma.company.update({
        where: { id: company.id },
        data: { status: 'READ_ONLY' },
      });
      estado = 'READ_ONLY';
    }

    // 2. Aviso previo, una sola vez por vencimiento.
    //    Se marca ANTES de enviar y no se espera el envío: el correo no puede
    //    demorar la petición del usuario, y marcar después dispararía un aviso
    //    por cada petición mientras el SMTP tarde en responder.
    if (debeAvisar(company)) {
      const dias = diasHastaVencimiento(company.nextDueDate);
      await prisma.company.update({
        where: { id: company.id },
        data: { reminderSentFor: company.nextDueDate },
      });
      emailService
        .sendSubscriptionReminderEmail(company, dias)
        .catch((error) => console.error('No se pudo enviar el aviso de vencimiento:', error));
    }

    // 3. En solo lectura se permite consultar, nunca escribir.
    if (estado === 'READ_ONLY' && !METODOS_DE_LECTURA.has(req.method)) {
      return res.status(403).json({
        success: false,
        error:
          'Su suscripción está vencida. Puede consultar su información, pero no registrar ' +
          'cambios hasta regularizar el pago.',
        code: 'SUBSCRIPTION_READ_ONLY',
      });
    }

    req.company = { ...company, status: estado };
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Alias for authenticate – just check that a user is authenticated.
 */
const requireAuth = authenticate;

module.exports = {
  authenticate,
  requireAdmin,
  requireAuth,
  requireSelfOrAdmin,
  requireSuperAdmin,
  requireCompanyContext,
  blockUntilPasswordChanged,
  enforceCompanyStatus,
};
