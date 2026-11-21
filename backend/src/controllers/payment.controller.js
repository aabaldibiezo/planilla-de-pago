const fs = require('fs');
const path = require('path');
const { validationResult } = require('express-validator');
const paymentService = require('../services/payment.service');
const pdfService = require('../services/pdf.service');
const auditService = require('../services/audit.service');
const { puedeVerBoletaDe } = require('../lib/admin-access');

const calculate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const month = req.query.month;
    const year = req.query.year;

    if (
      !Number.isInteger(Number(month)) ||
      Number(month) < 1 ||
      Number(month) > 12 ||
      !Number.isInteger(Number(year)) ||
      Number(year) < 2020 ||
      Number(year) > 2100
    ) {
      return res.status(400).json({ success: false, error: 'Mes y año válidos son requeridos' });
    }

    const calculations = await paymentService.calculateAll(
      req.user.companyId,
      month,
      year,
      req.user
    );
    res.json({ success: true, data: calculations });
  } catch (error) {
    next(error);
  }
};

const pay = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { userId, month, year } = req.body;
    const payment = await paymentService.processPayment(
      req.user.companyId,
      userId,
      month,
      year,
      req.user.id,
      req.user
    );
    await auditService.record(req, {
      action: 'PAY',
      entity: 'Payment',
      entityId: payment.id,
      employeeId: Number(userId),
      newData: { month: Number(month), year: Number(year), netPay: payment.netPay },
    });
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    if (error.code === 'P2002') {
      return res
        .status(409)
        .json({ success: false, error: 'El pago ya fue registrado por otra solicitud' });
    }
    if (error.name === 'AdminAccessError') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.message.includes('ya se ha registrado') || error.message.includes('no encontrado')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
};

const getHistory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const filters = {
      userId: req.user.role === 'ADMIN' ? req.query.userId || undefined : req.user.id,
      month: req.query.month || undefined,
      year: req.query.year || undefined,
    };

    const payments = await paymentService.getHistory(req.user.companyId, filters, req.user);
    res.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
};

const getPdf = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const payment = await paymentService.getById(req.user.companyId, id);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Comprobante no disponible' });
    }

    // Cada uno ve su boleta; un administrativo no ve la de otro administrativo.
    if (!puedeVerBoletaDe(req.user, { id: payment.userId, ...payment.user })) {
      return res
        .status(403)
        .json({ success: false, error: 'Solo puede descargar sus propios comprobantes' });
    }

    // La boleta se arma en el momento con los datos guardados del pago, que no
    // cambian: así siempre sale con el formato y el nombre de empresa actuales.
    // Antes se servía el PDF guardado el día del pago, y una boleta vieja seguía
    // mostrando "PLANILLA DE PAGO S.R.L." y filas que ya se habían quitado.
    const archivo = await pdfService.generateReceipt(payment, payment.user);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="boleta-de-pago-${payment.id}-${payment.month}-${payment.year}.pdf"`
    );
    return res.sendFile(path.resolve(archivo), (error) => {
      // En local es el mismo archivo que guarda `pdfPath` y se conserva; en
      // producción `pdfPath` es la URL de Cloudinary y esto es un temporal.
      if (path.resolve(archivo) !== path.resolve(String(payment.pdfPath || ''))) {
        fs.promises.unlink(archivo).catch(() => {});
      }
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Devuelve la boleta en PDF sin registrar el pago, para que el administrador
 * la revise antes de confirmar. El archivo temporal se borra al terminar de
 * enviarlo: no debe quedar acumulándose en disco.
 */
const previewReceipt = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { filePath } = await paymentService.previewReceipt(
      req.user.companyId,
      req.query.userId,
      req.query.month,
      req.query.year,
      req.user
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);

    return res.sendFile(path.resolve(filePath), (error) => {
      fs.promises.unlink(filePath).catch(() => {});
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    if (error.name === 'AdminAccessError') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (/no encontrado|inactivo|ya se ha registrado/i.test(error.message)) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return next(error);
  }
};

const monthlyReport = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const month = Number(req.query.month);
    const year = Number(req.query.year);

    const payments = await paymentService.getHistory(req.user.companyId, { month, year }, req.user);
    const company = await paymentService.getIssuingCompany(req.user.companyId);
    const file = await pdfService.generateMonthlyReport(payments, month, year, company);

    await auditService.record(req, {
      action: 'GENERATE_MONTHLY_PDF',
      entity: 'PaymentReport',
      entityId: `${year}-${month}`,
      newData: { month, year, count: payments.length },
    });

    return res.download(file, path.basename(file), (error) => {
      // En producción el disco es efímero: la copia temporal se descarta tras enviarla.
      if (process.env.NODE_ENV === 'production') {
        fs.promises.unlink(file).catch(() => {});
      }
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    return next(error);
  }
};


/**
 * Adjunta la foto del recibo físico firmado.
 *
 * Nada del monto se toma de la imagen: el importe sigue siendo el que calculó
 * la nómina. Esto solo suma el respaldo visual.
 */
const uploadReceipt = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const data = await paymentService.attachReceipt(
      req.user.companyId,
      req.params.id,
      req.body.photo,
      req.user.id
    );

    await auditService.record(req, {
      action: 'ATTACH_RECEIPT',
      entity: 'Payment',
      entityId: data.id,
      employeeId: data.userId,
      newData: { receiptUploadedOn: data.receiptUploadedOn },
    });

    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (/no encontrado/i.test(error.message)) error.statusCode = 404;
    else if (/foto|imagen|tamaño|data URI|vacía/i.test(error.message)) error.statusCode = 400;
    return next(error);
  }
};

/**
 * Devuelve la imagen del recibo.
 *
 * Va por un endpoint autenticado y no por una carpeta estática: el recibo
 * lleva nombre, monto y firma, y servirlo por URL pública lo dejaría al
 * alcance de cualquiera que adivinara la ruta. Mismo criterio que la boleta.
 */
const getReceipt = async (req, res, next) => {
  try {
    const payment = await paymentService.getById(req.user.companyId, req.params.id);
    if (!payment || !payment.receiptPhotoUrl) {
      return res.status(404).json({ success: false, error: 'Ese pago no tiene recibo adjunto' });
    }

    // Mismo criterio que la boleta.
    if (!puedeVerBoletaDe(req.user, { id: payment.userId, ...payment.user })) {
      return res.status(403).json({ success: false, error: 'Solo puede ver sus propios recibos' });
    }

    // Almacenado en Cloudinary: se hace de intermediario para no exponer la URL.
    if (payment.receiptPhotoUrl.startsWith('http')) {
      const respuesta = await fetch(payment.receiptPhotoUrl);
      if (!respuesta.ok || !respuesta.body) {
        throw Object.assign(new Error('No se pudo recuperar el recibo almacenado'), {
          statusCode: 502,
        });
      }
      res.setHeader('Content-Type', respuesta.headers.get('content-type') || 'image/jpeg');
      const { Readable } = require('stream');
      return Readable.fromWeb(respuesta.body).pipe(res);
    }

    if (!fs.existsSync(payment.receiptPhotoUrl)) {
      return res
        .status(404)
        .json({ success: false, error: 'El archivo del recibo no existe en el servidor' });
    }
    return res.sendFile(path.resolve(payment.receiptPhotoUrl));
  } catch (error) {
    return next(error);
  }
};

const deleteReceipt = async (req, res, next) => {
  try {
    const data = await paymentService.removeReceipt(
      req.user.companyId,
      req.params.id,
      req.user.id
    );

    await auditService.record(req, {
      action: 'REMOVE_RECEIPT',
      entity: 'Payment',
      entityId: data.id,
    });

    return res.json({ success: true, data: { message: 'Recibo quitado.' } });
  } catch (error) {
    if (/no encontrado|no tiene recibo/i.test(error.message)) error.statusCode = 404;
    return next(error);
  }
};
module.exports = {
  calculate,
  pay,
  getHistory,
  getPdf,
  monthlyReport,
  previewReceipt,
  uploadReceipt,
  getReceipt,
  deleteReceipt,
};
