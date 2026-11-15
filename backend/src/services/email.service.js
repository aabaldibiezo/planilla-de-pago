const nodemailer = require('nodemailer');

/** Tope de espera de un envío: pasado esto se da por fallido. */
const TIEMPO_MAXIMO_MS = 15000;

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Remitente "Nombre <correo>" → { name, email }. Acepta también un correo solo.
 */
const separarRemitente = (valor, nombrePorDefecto = 'Planilla de Pago') => {
  const texto = String(valor || '').trim();
  const conNombre = texto.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  if (conNombre) return { name: conNombre[1].trim() || nombrePorDefecto, email: conNombre[2].trim() };
  return { name: nombrePorDefecto, email: texto };
};

/**
 * Cuerpo para la API de Brevo. Puro, para poder probarlo sin red.
 * Brevo envía por HTTPS, así que funciona donde el SMTP está bloqueado.
 */
const armarCuerpoBrevo = ({ to, subject, text, html }, remitente) => ({
  sender: remitente,
  to: [{ email: to }],
  subject,
  textContent: text,
  ...(html ? { htmlContent: html } : {}),
});

/** Envío por la API de Brevo. Mismo contrato que `send`: nunca lanza. */
const enviarPorBrevo = async (mailOptions, recipient) => {
  const remitente = separarRemitente(
    process.env.EMAIL_FROM || process.env.BREVO_SENDER || process.env.SMTP_USER
  );
  if (!remitente.email) {
    const error = 'Falta el correo remitente (EMAIL_FROM o SMTP_USER) para Brevo';
    console.warn(`⚠️ ${error}. Se omitió el envío a ${recipient}.`);
    return { success: false, error };
  }

  try {
    const respuesta = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(armarCuerpoBrevo(mailOptions, remitente)),
      signal: globalThis.AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    const cuerpo = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      const error = cuerpo.message || `Brevo respondió ${respuesta.status}`;
      console.error(`❌ Falló el envío a ${recipient} por Brevo: ${error}`);
      return { success: false, error };
    }
    console.log(`✉️ Correo enviado a ${recipient} por Brevo. MessageId: ${cuerpo.messageId}`);
    return { success: true };
  } catch (fallo) {
    const error =
      fallo.name === 'TimeoutError' ? 'Brevo no respondió a tiempo' : fallo.message || String(fallo);
    console.error(`❌ Falló el envío a ${recipient} por Brevo: ${error}`);
    return { success: false, error };
  }
};

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
    // Si el puerto está bloqueado (Render gratis bloquea SMTP), se corta
    // rápido en vez de dejar la pantalla "Enviando…" colgada dos minutos.
    connectionTimeout: TIEMPO_MAXIMO_MS,
    greetingTimeout: TIEMPO_MAXIMO_MS,
    socketTimeout: TIEMPO_MAXIMO_MS,
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
  // Con clave de Brevo se envía por su API (HTTPS); si no, por SMTP.
  if (process.env.BREVO_API_KEY) return enviarPorBrevo(mailOptions, recipient);

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
/** Escapa texto para meterlo en el HTML del correo. */
const html = (valor) =>
  String(valor ?? '').replace(
    /[&<>'"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]
  );

const sendCredentialsEmail = async (user, temporaryPassword, appUrl) => {
  // El personal marca desde la app; el administrador entra al panel web.
  const esEmpleado = user.role === 'EMPLOYEE';
  const base = appUrl ? appUrl.replace(/\/$/, '') : '';
  const descarga = base ? `${base}/descargar/` : '';

  const pasoAcceso = esEmpleado
    ? descarga
      ? `1. Descargue la app en su celular Android:\n   ${descarga}\n2. Ábrala e ingrese con estos datos:`
      : 'Ingrese a la app con estos datos:'
    : base
      ? `Ingrese desde: ${base}`
      : 'Ingrese al sistema con estos datos:';

  const text = `Hola ${user.firstName},

Se creó su acceso al sistema de ${esEmpleado ? 'asistencia' : 'asistencia y planillas'}.

${pasoAcceso}
   Usuario: ${user.email}
   Contraseña temporal: ${temporaryPassword}

Al entrar por primera vez, el sistema le pedirá elegir su propia contraseña.
Esta contraseña temporal deja de servir apenas defina la suya.

Si usted no esperaba este mensaje, avise a su supervisor.

Saludos cordiales,
Planilla de Pago`;

  const boton = esEmpleado ? descarga : base;
  const htmlBody = `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#eef7fd;font-family:Arial,Helvetica,sans-serif;color:#0f2942">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef7fd;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#0369a1;padding:24px;color:#ffffff">
          <div style="font-size:14px;opacity:.85">Planilla de Pago</div>
          <div style="font-size:22px;font-weight:bold;margin-top:4px">¡Hola, ${html(user.firstName)}!</div>
        </td></tr>
        <tr><td style="padding:24px;font-size:16px;line-height:1.5">
          <p style="margin:0 0 16px">Se creó su acceso al sistema de ${esEmpleado ? 'asistencia' : 'asistencia y planillas'}.</p>
          ${
            boton
              ? `<p style="margin:0 0 8px;font-weight:bold">${esEmpleado ? '1. Descargue la app en su celular Android' : 'Ingrese al sistema'}</p>
          <p style="margin:0 0 20px"><a href="${html(boton)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:10px">${esEmpleado ? 'Descargar la app' : 'Abrir el sistema'}</a></p>
          <p style="margin:0 0 8px;font-weight:bold">${esEmpleado ? '2. Ingrese con estos datos' : 'Sus datos de acceso'}</p>`
              : '<p style="margin:0 0 8px;font-weight:bold">Sus datos de acceso</p>'
          }
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f0f9ff;border:1px solid #cfe6f7;border-radius:12px">
            <tr><td style="padding:14px 16px;font-size:15px">
              <div style="color:#6b8299;font-size:13px">Usuario</div>
              <div style="font-weight:bold;margin-bottom:10px">${html(user.email)}</div>
              <div style="color:#6b8299;font-size:13px">Contraseña temporal</div>
              <div style="font-weight:bold;font-size:20px;letter-spacing:1px">${html(temporaryPassword)}</div>
            </td></tr>
          </table>
          <p style="margin:16px 0 0;font-size:14px;color:#3f5f7a">Al entrar por primera vez, el sistema le pedirá elegir su propia contraseña.</p>
        </td></tr>
        <tr><td style="padding:16px 24px;font-size:12px;color:#6b8299;border-top:1px solid #e0f2fe">Si usted no esperaba este mensaje, avise a su supervisor.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return send(
    {
      to: user.email,
      subject: esEmpleado
        ? 'Su acceso a la app de asistencia'
        : 'Sus credenciales de acceso - Planilla de Pago',
      text,
      html: htmlBody,
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

module.exports = {
  sendCredentialsEmail,
  sendSubscriptionReminderEmail,
  // Expuestos para las pruebas.
  separarRemitente,
  armarCuerpoBrevo,
};
