const requiredInProduction = [
  'DATABASE_URL',
  'JWT_SECRET',
  'CORS_ORIGINS',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM',
];

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
