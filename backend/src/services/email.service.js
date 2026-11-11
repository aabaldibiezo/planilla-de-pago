const nodemailer = require('nodemailer');

/**
 * Construye el transporte SMTP. Devuelve `null` (con el motivo) cuando la
 * configuración falta o conserva los valores de ejemplo del archivo .env.
 */
const buildTransport = () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const userEmail = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;

  if (
    !userEmail ||
    !password ||
    userEmail.includes('tu_correo') ||
    password.includes('tu_contraseña')
  ) {
    return {
      transporter: null,
      error: 'Credenciales SMTP no configuradas o con valores de prueba en el archivo .env',
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: userEmail, pass: password },
    tls: { rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false' },
  });

  const from =
    process.env.EMAIL_FROM || process.env.SMTP_FROM || `"Planilla de Pago" <${userEmail}>`;

  return { transporter, from, error: null };
};

/**
 * Envía un correo y normaliza el resultado a { success, error }.
 * Nunca lanza: los llamadores deben poder continuar aunque el correo falle.
 */
const send = async (mailOptions, recipient) => {
  const { transporter, from, error } = buildTransport();

  if (!transporter) {
    console.warn(`⚠️ ${error}. Se omitió el envío a ${recipient}.`);
    return { success: false, error };
  }

  try {
    const info = await transporter.sendMail({ from, ...mailOptions });
    console.log(`✉️ Correo enviado a ${recipient}. MessageId: ${info.messageId}`);
    return { success: true };
  } catch (sendError) {
    console.error(`❌ Falló el envío a ${recipient}:`, sendError);
    return { success: false, error: sendError.message || sendError.toString() };
  }
};

/**
 * Envía al empleado su contraseña temporal de primer acceso.
 *
 * La contraseña viaja en el cuerpo del correo porque es de un solo uso: el
 * sistema obliga a cambiarla en el primer inicio de sesión.
 */
const sendCredentialsEmail = async (user, temporaryPassword, appUrl) => {
  const accessLine = appUrl ? `\nIngrese desde: ${appUrl}\n` : '';

  return send(
    {
      to: user.email,
      subject: 'Sus credenciales de acceso - Planilla de Pago',
      text: `Hola ${user.firstName},

Se creó su acceso al sistema de asistencia y nómina.
${accessLine}
Usuario: ${user.email}
Contraseña temporal: ${temporaryPassword}

Por seguridad, el sistema le pedirá cambiar esta contraseña la primera vez que ingrese.
Esta contraseña temporal deja de servir apenas defina la suya.

Si usted no esperaba este mensaje, avise a su supervisor.

Saludos cordiales,
El equipo de Planilla de Pago`,
    },
    user.email
  );
};

/**
 * Avisa a la empresa que su suscripción está por vencer.
 *
 * ⚠️ El monto va en dólares: la suscripción de la plataforma se cobra en USD,
 * a diferencia de los sueldos que la empresa liquida en bolivianos.
 */
const sendSubscriptionReminderEmail = async (company, diasRestantes) => {
  const cuando =
    diasRestantes <= 0
      ? 'vence hoy'
      : `vence en ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'}`;

  const vencimiento = new Date(company.nextDueDate).toISOString().slice(0, 10);
  const monto = Number(company.plan.monthlyPriceUsd).toFixed(2);

  return send(
    {
      to: company.contactEmail,
      subject: `Su suscripción ${cuando} - Planilla de Pago`,
      text: `Estimados de ${company.name},

Su suscripción al plan ${company.plan.name} ${cuando} (${vencimiento}).

Importe mensual: USD ${monto}

Si el pago no se registra antes de esa fecha, la cuenta pasa a modo de solo
lectura: van a poder ingresar y consultar todo su historial, pero no registrar
asistencia, cargar empleados ni liquidar pagos hasta regularizar.

Ante cualquier duda, responda este correo.

Saludos cordiales,
El equipo de Planilla de Pago`,
    },
    company.contactEmail
  );
};

module.exports = { sendCredentialsEmail, sendSubscriptionReminderEmail };
