const nodemailer = require('nodemailer');
const path = require('path');

/**
 * Send payment receipt email to an employee with the PDF as attachment.
 * Returns an object: { success: boolean, error?: string }
 */
const sendReceiptEmail = async (user, payment, pdfPath) => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = port === 465;
  const userEmail = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || `"Planilla de Pago" <${userEmail}>`;

  if (!userEmail || !password || userEmail.includes('tu_correo') || password.includes('tu_contraseña')) {
    const msg = 'Credenciales SMTP no configuradas o con valores de prueba en el archivo .env';
    console.warn(`⚠️ ${msg}. Se omitió el envío a ${user.email}.`);
    return { success: false, error: msg };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: userEmail,
        pass: password,
      },
      tls: { rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false' }
    });

    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const monthName = months[payment.month - 1];

    const mailOptions = {
      from,
      to: user.email,
      subject: `Boleta de Pago de Nomina - ${monthName} ${payment.year}`,
      text: `Hola ${user.firstName},\n\nAdjuntamos la boleta de pago correspondiente a la nomina de ${monthName} de ${payment.year}.\n\nDetalle del Pago:\n- Salario Mensual Base: ${parseFloat(payment.monthlySalary).toFixed(2)} Bs.\n- Horas efectivamente trabajadas: ${parseFloat(payment.totalHours).toFixed(2)} hrs.\n- Salario Bruto devengado: ${parseFloat(payment.grossPay).toFixed(2)} Bs.\n- Retraso total: ${payment.totalDelayMinutes} minutos (${parseFloat(payment.delayHours).toFixed(2)} horas)\n- Descuento por retrasos: ${parseFloat(payment.discountAmount).toFixed(2)} Bs.\n- Otros descuentos: ${Math.max(0, Number(payment.totalDiscounts || 0) - Number(payment.discountAmount || 0)).toFixed(2)} Bs.\n- Total descuentos: ${Number(payment.totalDiscounts || payment.discountAmount || 0).toFixed(2)} Bs.\n- Salario Neto a Pagar: ${parseFloat(payment.netPay).toFixed(2)} Bs.\n\nPor favor revise el archivo PDF adjunto.\n\nSaludos cordiales,\nEl equipo de Planilla de Pago`,
      attachments: [
        {
          filename: path.basename(pdfPath),
          path: pdfPath,
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Email successfully sent to ${user.email}. MessageId: ${info.messageId}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send email to ${user.email}:`, error);
    return { success: false, error: error.message || error.toString() };
  }
};

module.exports = { sendReceiptEmail };
