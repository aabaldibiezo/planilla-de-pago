const prisma = require('../lib/prisma');
const attendanceService = require('./attendance.service');
const pdfService = require('./pdf.service');
const emailService = require('./email.service');
const cloudinaryService = require('./cloudinary.service');
const fs = require('fs/promises');
const path = require('path');

/**
 * Check if a payment has already been processed for a user, month and year.
 */
const checkDuplicate = async (userId, month, year) => {
  const existing = await prisma.payment.findUnique({
    where: {
      userId_month_year: {
        userId: parseInt(userId, 10),
        month: parseInt(month, 10),
        year: parseInt(year, 10),
      },
    },
  });
  return !!existing;
};

/**
 * Calculate draft payroll metrics for preview.
 */
const calculatePayment = async (userId, month, year) => {
  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId, 10) },
  });
  if (!user) {
    throw new Error('Empleado no encontrado');
  }

  const summary = await attendanceService.getMonthlySummary(userId, month, year);
  
  const monthlySalary = parseFloat(user.monthlySalary);
  const hourlyRate = parseFloat(user.hourlyRate);
  
  const totalHours = summary.totalHoursWorked;
  const totalDelayMinutes = summary.totalDelayMinutes;
  const startDate = new Date(Date.UTC(Number(year), Number(month)-1, 1));
  const endDate = new Date(Date.UTC(Number(year), Number(month), 0, 23,59,59,999));
  const sessions = await prisma.attendanceSession.findMany({where:{userId:user.id,workDate:{gte:startDate,lte:endDate}}});
  const justifiedDelayMinutes=sessions.filter(s=>s.justificationStatus==='JUSTIFIED').reduce((n,s)=>n+s.delayMinutes,0);
  const chargeableDelayMinutes=Math.max(0,totalDelayMinutes-justifiedDelayMinutes);
  const overtimes=await prisma.overtime.findMany({where:{userId:user.id,status:'APPROVED',workDate:{gte:startDate,lte:endDate},paymentMode:{notIn:['TIME_OFF','UNPAID']}}});
  const discounts=await prisma.discount.findMany({where:{userId:user.id,status:'APPROVED',paymentId:null,discountDate:{gte:startDate,lte:endDate}}});
  const overtimeAmount=Number(overtimes.reduce((n,o)=>n+Number(o.calculatedAmount),0).toFixed(2));
  const otherDiscounts=Number(discounts.reduce((n,d)=>n+Number(d.amount),0).toFixed(2));
  
  // Formulas
  const delayHours = parseFloat((chargeableDelayMinutes / 60).toFixed(2));
  const discountAmount = parseFloat((delayHours * hourlyRate).toFixed(2));
  
  // Salario Bruto es igual al Salario Base Mensual completo (No se paga por horas trabajadas)
  const grossPay = monthlySalary;
  const totalIncome=parseFloat((grossPay+overtimeAmount).toFixed(2));
  const totalDiscounts=parseFloat((discountAmount+otherDiscounts).toFixed(2));
  const netPay = Math.max(0,parseFloat((totalIncome-totalDiscounts).toFixed(2)));

  return {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      employeeType: user.employeeType,
      monthlySalary,
      monthlyHours: parseFloat(user.monthlyHours),
      hourlyRate,
      scheduledEntryTime: user.scheduledEntryTime,
    },
    month: parseInt(month, 10),
    year: parseInt(year, 10),
    monthlySalary,
    hourlyRate,
    totalHours,
    totalDelayMinutes,
    justifiedDelayMinutes, chargeableDelayMinutes, overtimeAmount, otherDiscounts, totalIncome, totalDiscounts, overtimes, discounts,
    delayHours,
    discountAmount,
    grossPay,
    netPay,
  };
};

/**
 * Calculate payroll previews for all active employees.
 */
const calculateAll = async (month, year) => {
  const users = await prisma.user.findMany({
    where: { role: 'EMPLOYEE', isActive: true },
  });

  const previews = [];
  for (const user of users) {
    const preview = await calculatePayment(user.id, month, year);
    // Check if paid
    const isPaid = await checkDuplicate(user.id, month, year);
    previews.push({ ...preview, isPaid });
  }

  return previews;
};

/**
 * Process a payment: save to DB, generate PDF, and send email.
 */
const processPayment = async (userId, month, year, actorId) => {
  const uId = parseInt(userId, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);

  // 1. Block duplicate payments
  const isDuplicate = await checkDuplicate(uId, m, y);
  if (isDuplicate) {
    throw new Error('Ya se ha registrado un pago para este empleado en el mes seleccionado');
  }

  // 2. Fetch user details and calculate metrics
  const user = await prisma.user.findUnique({ where: { id: uId } });
  if (!user || !user.isActive || user.role !== 'EMPLOYEE') {
    throw new Error('Empleado no encontrado o inactivo');
  }

  const metrics = await calculatePayment(uId, m, y);

  // 3. Save payment record
  let payment = await prisma.$transaction(async tx => {
    const created=await tx.payment.create({
    data: {
      userId: uId,
      month: m,
      year: y,
      monthlySalary: metrics.monthlySalary,
      hourlyRate: metrics.hourlyRate,
      totalHours: metrics.totalHours,
      totalDelayMinutes: metrics.totalDelayMinutes,
      delayHours: metrics.delayHours,
      discountAmount: metrics.discountAmount,
      grossPay: metrics.grossPay,
      netPay: metrics.netPay,
      createdBy: actorId,
      updatedBy: actorId,
      totalIncome:metrics.totalIncome,totalDiscounts:metrics.totalDiscounts,overtimeAmount:metrics.overtimeAmount,justifiedDelayMinutes:metrics.justifiedDelayMinutes,
      details:{create:[
        {type:'INCOME',code:'BASE_SALARY',description:'Salario base',amount:metrics.monthlySalary},
        {type:'INFORMATION',code:'ORDINARY_HOURS',description:'Horas ordinarias trabajadas',quantity:metrics.totalHours,amount:0},
        ...metrics.overtimes.map(o=>({type:'INCOME',code:'OVERTIME',description:`Horas extra: ${o.reason}`,quantity:o.hours,rate:o.hourlyRateSnapshot,amount:o.calculatedAmount,overtimeId:o.id,metadata:{paymentMode:o.paymentMode,multiplier:Number(o.multiplier),startTime:o.startTime,endTime:o.endTime,workDate:o.workDate,notes:o.notes}})),
        ...(metrics.discountAmount>0?[{type:'DISCOUNT',code:'UNJUSTIFIED_DELAY',description:'Retrasos no justificados',quantity:metrics.delayHours,rate:metrics.hourlyRate,amount:metrics.discountAmount}]:[]),
        ...metrics.discounts.map(d=>({type:'DISCOUNT',code:d.type,description:d.description,amount:d.amount,discountId:d.id}))
      ]}
    },
    include:{details:true}}); await tx.discount.updateMany({where:{id:{in:metrics.discounts.map(d=>d.id)}},data:{paymentId:created.id}}); return created;});

  // 4. Generate PDF receipt
  let localPdfPath = null;
  let pdfUrl = null;
  let emailSent = false;
  let emailError = null;
  try {
    localPdfPath = await pdfService.generateReceipt(payment, user);
    if (process.env.NODE_ENV === 'production' || cloudinaryService.configured()) {
      const publicId = `planilla/boletas/${y}/${String(m).padStart(2, '0')}/pago-${payment.id}.pdf`;
      const upload = await cloudinaryService.uploadPdf(localPdfPath, publicId);
      pdfUrl = upload.url;
    } else {
      pdfUrl = localPdfPath;
    }
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: { pdfPath: pdfUrl, pdfGeneratedAt: new Date(), updatedBy: actorId },
    });
  } catch (pdfError) {
    emailError = `No se pudo generar o almacenar la boleta: ${pdfError.message}`;
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: { emailError, emailRetryRequired: true },
    });
    console.error('❌ Failed to generate PDF receipt:', pdfError);
  }

  // 5. Send receipt email
  if (localPdfPath && pdfUrl) {
    // Dynamically retrieve the user's email registered in the database profile
    const emailResult = await emailService.sendReceiptEmail(user, payment, localPdfPath);
    if (emailResult.success) {
      emailSent = true;
      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: { emailSent: true },
      });
    } else {
      emailError = emailResult.error;
      payment=await prisma.payment.update({where:{id:payment.id},data:{emailError,emailRetryRequired:true}});
    }
  }

  if (process.env.NODE_ENV === 'production' && localPdfPath) {
    await fs.unlink(localPdfPath).catch(error => console.warn(`No se pudo limpiar ${path.basename(localPdfPath)}: ${error.message}`));
  }

  return {
    ...payment,
    emailSent,
    emailError,
    user: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
  };
};

/**
 * Get list of processed payments with optional filters.
 */
const getHistory = async (filters) => {
  const where = {};

  if (filters.userId) {
    where.userId = parseInt(filters.userId, 10);
  }
  if (filters.month) {
    where.month = parseInt(filters.month, 10);
  }
  if (filters.year) {
    where.year = parseInt(filters.year, 10);
  }

  return prisma.payment.findMany({
    where,
    include: { details: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          employeeType: true,
        },
      },
    },
    orderBy: { paidAt: 'desc' },
  });
};

/**
 * Get payment by ID
 */
const getById = async (id) => {
  return prisma.payment.findUnique({
    where: { id: parseInt(id, 10) },
    include: { details: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          employeeType: true,
          monthlyHours: true,
        },
      },
    },
  });
};

module.exports = {
  checkDuplicate,
  calculatePayment,
  calculateAll,
  processPayment,
  getHistory,
  getById,
};
