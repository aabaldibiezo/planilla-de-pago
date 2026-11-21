require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { validateEnvironment, allowedOrigins, isProduction } = require('./config/env');

const { registrarActividad } = require('./middleware/actividad');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const paymentRoutes = require('./routes/payment.routes');
const workforceRoutes = require('./routes/workforce.routes');
const worksiteRoutes = require('./routes/worksite.routes');
const clientRoutes = require('./routes/client.routes');
const statementRoutes = require('./routes/statement.routes');
const holidayRoutes = require('./routes/holiday.routes');
const platformRoutes = require('./routes/platform.routes');
const prisma = require('./lib/prisma');

const app = express();
validateEnvironment();
app.set('trust proxy', isProduction ? 1 : false);

// --------------- Middleware ---------------
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, cb) =>
      !origin || allowedOrigins.includes(origin.replace(/\/$/, ''))
        ? cb(null, true)
        : cb(Object.assign(new Error('Origen no permitido por CORS'), { statusCode: 403 })),
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
/**
 * Rutas que reciben una foto y necesitan un límite mayor: la marcación desde
 * la app móvil y el recibo firmado que se adjunta a un pago.
 * El resto de la API se mantiene en 250 kB para no ampliar la superficie de
 * ataque: un límite alto en todas las rutas facilita agotar memoria.
 */
const llevaFoto = (ruta) =>
  ruta === '/api/attendance/sessions/self/clock-in' ||
  /^\/api\/attendance\/sessions\/self\/\d+\/clock-out$/.test(ruta) ||
  // El encargado de sede marca a su equipo con la foto de cada persona.
  ruta === '/api/attendance/team/clock-in' ||
  /^\/api\/attendance\/team\/\d+\/clock-out$/.test(ruta) ||
  (ruta.startsWith('/api/payments/') && ruta.endsWith('/receipt'));

const jsonEstandar = express.json({ limit: '250kb' });
const jsonConFoto = express.json({ limit: '8mb' });

// El parser se elige por ruta. Montar el de 250 kB de forma global haría que
// rechazara la foto antes de que el parser de la ruta llegue a ejecutarse.
app.use((req, res, next) =>
  llevaFoto(req.path) ? jsonConFoto(req, res, next) : jsonEstandar(req, res, next)
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })
);
app.use(
  '/api/auth/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })
);
app.use(morgan(isProduction ? 'combined' : 'dev'));

// --------------- Routes ---------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Registro de actividad de cada empresa (lo ve solo el gerente general).
app.use('/api', registrarActividad);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/workforce', workforceRoutes);
app.use('/api/worksites', worksiteRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/statement', statementRoutes);
app.use('/api/holidays', holidayRoutes);
// Administración de la plataforma (súper administrador), separada de las
// rutas de negocio que usan las empresas clientes.
app.use('/api/platform', platformRoutes);

// --------------- Global Error Handler ---------------
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);

  // Un cuerpo demasiado grande debe explicarse, no caer como error interno.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'La foto es demasiado grande. Intente nuevamente.',
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error:
      statusCode >= 500 ? 'Error interno del servidor' : err.message || 'Error en la solicitud',
  });
});

// --------------- Start Server ---------------
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const shutdown = (signal) => {
  console.log(`${signal} recibido; cerrando conexiones`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
