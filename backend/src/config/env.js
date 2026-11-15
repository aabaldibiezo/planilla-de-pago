const requiredInProduction = [
  'DATABASE_URL',
  'JWT_SECRET',
  'CORS_ORIGINS',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

/**
 * El correo es opcional: sin SMTP las credenciales de un empleado nuevo no
 * se envían, pero el panel le muestra la clave al administrador para que la
 * pase por mensaje, y nada se rompe. Exigirlo impedía arrancar el servidor
 * en producción a quien todavía no tiene un proveedor de correo.
 */
const optionalInProduction = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'];

const parseOrigins = (value) =>
  (value || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

const validateEnvironment = () => {
  const missing =
    process.env.NODE_ENV === 'production'
      ? requiredInProduction.filter((name) => !process.env[name])
      : [];

  if (missing.length) {
    throw new Error(`Variables de entorno requeridas: ${missing.join(', ')}`);
  }
  if (process.env.NODE_ENV === 'production') {
    // Basta con Brevo (API por HTTPS) o con SMTP completo; EMAIL_FROM es opcional.
    const conBrevo = Boolean(process.env.BREVO_API_KEY);
    const conSmtp = optionalInProduction
      .filter((name) => name === 'SMTP_USER' || name === 'SMTP_PASS')
      .every((name) => process.env[name]);
    if (!conBrevo && !conSmtp) {
      console.warn(
        'Correo sin configurar (BREVO_API_KEY o SMTP_USER/SMTP_PASS): las claves nuevas se muestran en el panel.'
      );
    } else {
      console.log(`Correo: se envía por ${conBrevo ? 'Brevo (API)' : 'SMTP'}.`);
    }
  }
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    /change|secret|default/i.test(process.env.JWT_SECRET)
  ) {
    throw new Error('JWT_SECRET debe contener al menos 32 caracteres aleatorios');
  }
  if (process.env.DATABASE_URL && !/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)) {
    throw new Error('DATABASE_URL debe ser una URL válida de PostgreSQL');
  }
};

module.exports = {
  validateEnvironment,
  allowedOrigins: parseOrigins(process.env.CORS_ORIGINS),
  isProduction: process.env.NODE_ENV === 'production',
};
