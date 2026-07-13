const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

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
 * Alias for authenticate – just check that a user is authenticated.
 */
const requireAuth = authenticate;

module.exports = { authenticate, requireAdmin, requireAuth };
