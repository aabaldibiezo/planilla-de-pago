const fs = require('fs');
const path = require('path');
const { validationResult } = require('express-validator');
const paymentService = require('../services/payment.service');
const pdfService = require('../services/pdf.service');
const auditService = require('../services/audit.service');

const calculate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
    const month = req.query.month;
    const year = req.query.year;

    if (!Number.isInteger(Number(month)) || Number(month) < 1 || Number(month) > 12 || !Number.isInteger(Number(year)) || Number(year) < 2020 || Number(year) > 2100) {
      return res.status(400).json({ success: false, error: 'Mes y año válidos son requeridos' });
    }

    const calculations = await paymentService.calculateAll(month, year);
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
    const payment = await paymentService.processPayment(userId, month, year, req.user.id);
    await auditService.record(req,{action:'PAY',entity:'Payment',entityId:payment.id,employeeId:Number(userId),newData:{month:Number(month),year:Number(year),netPay:payment.netPay}});
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, error: 'El pago ya fue registrado por otra solicitud' });
    if (error.message.includes('ya se ha registrado') || error.message.includes('no encontrado')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
};

const getHistory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
    const filters = {
      userId: req.user.role === 'ADMIN' ? (req.query.userId || undefined) : req.user.id,
      month: req.query.month || undefined,
      year: req.query.year || undefined,
    };

    const payments = await paymentService.getHistory(filters);
    res.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
};

const getPdf = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const payment = await paymentService.getById(id);
    if (!payment || !payment.pdfPath) {
      return res.status(404).json({ success: false, error: 'Comprobante no disponible' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="boleta-de-pago-${payment.id}-${payment.month}-${payment.year}.pdf"`);
    if (/^https:\/\//i.test(payment.pdfPath)) {
      const response = await fetch(payment.pdfPath);
      if (!response.ok || !response.body) throw Object.assign(new Error('No se pudo recuperar el comprobante almacenado'), { statusCode: 502 });
      const { Readable } = require('stream');
      return Readable.fromWeb(response.body).pipe(res);
    }
    if (!fs.existsSync(payment.pdfPath)) {
      return res.status(404).json({ success: false, error: 'El archivo del comprobante no existe en el servidor' });
    }
    return res.sendFile(path.resolve(payment.pdfPath));
  } catch (error) {
    next(error);
  }
};

const monthlyReport=async(req,res,next)=>{try{const errors=validationResult(req);if(!errors.isEmpty())return res.status(400).json({success:false,error:errors.array()[0].msg});const month=Number(req.query.month),year=Number(req.query.year);const payments=await paymentService.getHistory({month,year});const file=await pdfService.generateMonthlyReport(payments,month,year);await auditService.record(req,{action:'GENERATE_MONTHLY_PDF',entity:'PaymentReport',entityId:`${year}-${month}`,newData:{month,year,count:payments.length}});res.download(file,path.basename(file),error=>{if(process.env.NODE_ENV==='production')fs.promises.unlink(file).catch(()=>{});if(error&&!res.headersSent)next(error);});}catch(e){next(e)}};
module.exports = { calculate, pay, getHistory, getPdf, monthlyReport };
