const prisma = require('../lib/prisma');
const attendanceService = require('./attendance.service');
const photoService = require('./photo.service');
const { boliviaToday } = require('../lib/business-rules');
const { missingWorkDays } = require('../lib/absences');
const { holidaysForMonth, extraWorkDays } = require('../lib/holidays');
const { isDaily, basePayFor, extraDayRateFor } = require('../lib/pay-scheme');

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const pdfService = require('./pdf.service');
const cloudinaryService = require('./cloudinary.service');
const fs = require('fs/promises');
const path = require('path');
const { scope } = require('../lib/tenant');

/**
 * Check if a payment has already been processed for a user, month and year.
 *
 * El usuario ya viene acotado por quien llama, así que la clave compuesta
 * basta; se usa `findFirst` con ámbito de todas formas para que ninguna
 * consulta de este servicio pueda alcanzar otra empresa.
 */
const checkDuplicate = async (companyId, userId, month, year) => {
  const existing = await prisma.payment.findFirst({
    where: {
      ...scope('payment', companyId),
      userId: parseInt(userId, 10),
      month: parseInt(month, 10),
      year: parseInt(year, 10),
    },
  });
  return !!existing;
};

/**
 * Calculate draft payroll metrics for preview.
 */
const calculatePayment = async (companyId, userId, month, year) => {
  const user = await prisma.user.findFirst({
    where: { id: parseInt(userId, 10), ...scope('user', companyId) },
  });
  if (!user) {
    throw new Error('Empleado no encontrado');
  }

  const summary = await attendanceService.getMonthlySummary(companyId, userId, month, year);

  const hourlyRate = parseFloat(user.hourlyRate);
  const porDia = isDaily(user.employeeType);

  const totalHours = summary.totalHoursWorked;
  const totalDelayMinutes = summary.totalDelayMinutes;
  const startDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  const endDate = new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999));
  const sessions = await prisma.attendanceSession.findMany({
    where: {
      ...scope('attendanceSession', companyId),
      userId: user.id,
      workDate: { gte: startDate, lte: endDate },
    },
  });
  const justifiedDelayMinutes = sessions
    .filter((s) => s.justificationStatus === 'JUSTIFIED')
    .reduce((n, s) => n + s.delayMinutes, 0);

  const bloques = await prisma.scheduleBlock.findMany({
    where: { userId: user.id, isActive: true },
    select: { dayOfWeek: true },
  });
  const workDays = bloques.map((b) => b.dayOfWeek);
  const [empresa, feriadosPropios] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { extraDayFactor: true } }),
    prisma.holiday.findMany({
      where: { ...scope('holiday', companyId), date: { gte: startDate, lte: endDate } },
    }),
  ]);
  const holidays = holidaysForMonth(Number(year), Number(month), feriadosPropios);

  // Domingos de descanso y feriados trabajados: se pagan aparte, como extra.
  // Si el horario de la persona ya incluye el domingo, es parte del contrato.
  const extraDays = extraWorkDays({
    workedDates: sessions.map((s) => s.workDate),
    workDays,
    holidays,
  });
  const extraDayFactor = Number(empresa?.extraDayFactor ?? 2);
  const extraDayRate = extraDayRateFor(user, extraDayFactor);

  // Fijo: sueldo del mes. Temporal: días marcados × pago por día.
  const base = basePayFor(
    user,
    sessions.map((s) => s.workDate)
  );
  // En el temporal, `monthlySalary` del pago guarda lo ganado por días: es la
  // base sobre la que se suman extras y se restan descuentos.
  const monthlySalary = base.amount;
  const extraDaysAmount = Number((extraDays.length * extraDayRate).toFixed(2));

  // Días con turno y sin marcación. Solo informativo: no descuenta nada.
  // Un feriado no trabajado no es una falta. Al temporal no se le avisa: un
  // día sin marcar simplemente no se le paga.
  const missingDays = porDia
    ? []
    : missingWorkDays({
        year: Number(year),
        month: Number(month),
        workDays,
        workedDates: sessions.map((s) => s.workDate),
        // `createdAt` es UTC; Bolivia es UTC-4 fijo, así que se corre a su fecha.
        from: new Date(user.createdAt.getTime() - 4 * 60 * 60 * 1000),
        today: boliviaToday(),
      }).filter((dia) => !holidays.has(dia));
  const chargeableDelayMinutes = Math.max(0, totalDelayMinutes - justifiedDelayMinutes);
  const overtimes = await prisma.overtime.findMany({
    where: {
      ...scope('overtime', companyId),
      userId: user.id,
      status: 'APPROVED',
      workDate: { gte: startDate, lte: endDate },
      paymentMode: { notIn: ['TIME_OFF', 'UNPAID'] },
    },
  });
  const discounts = await prisma.discount.findMany({
    where: {
      ...scope('discount', companyId),
      userId: user.id,
      status: 'APPROVED',
      paymentId: null,
      discountDate: { gte: startDate, lte: endDate },
    },
  });
  const overtimeAmount = Number(
    overtimes.reduce((n, o) => n + Number(o.calculatedAmount), 0).toFixed(2)
  );
  const otherDiscounts = Number(discounts.reduce((n, d) => n + Number(d.amount), 0).toFixed(2));

  // Formulas
  const delayHours = parseFloat((chargeableDelayMinutes / 60).toFixed(2));
  const discountAmount = parseFloat((delayHours * hourlyRate).toFixed(2));

  // Salario Bruto es igual al Salario Base Mensual completo (No se paga por horas trabajadas)
  const grossPay = monthlySalary;
  const totalIncome = parseFloat((grossPay + overtimeAmount + extraDaysAmount).toFixed(2));
  const totalDiscounts = parseFloat((discountAmount + otherDiscounts).toFixed(2));
  const netPay = Math.max(0, parseFloat((totalIncome - totalDiscounts).toFixed(2)));

  return {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      employeeType: user.employeeType,
      staffCategory: user.staffCategory,
      monthlySalary,
      monthlyHours: parseFloat(user.monthlyHours),
      dailyWage: parseFloat(user.dailyWage || 0),
      hourlyRate,
      scheduledEntryTime: user.scheduledEntryTime,
    },
    month: parseInt(month, 10),
    year: parseInt(year, 10),
    monthlySalary,
    hourlyRate,
    totalHours,
    totalDelayMinutes,
    justifiedDelayMinutes,
    chargeableDelayMinutes,
    missingDays,
    payScheme: porDia ? 'DAILY' : 'MONTHLY',
    daysWorked: base.daysWorked,
    dailyRate: base.dailyRate,
    extraDays,
    extraDayRate,
    extraDayFactor,
    extraDaysAmount,
    overtimeAmount,
    otherDiscounts,
    totalIncome,
    totalDiscounts,
    overtimes,
    discounts,
    delayHours,
    discountAmount,
    grossPay,
    netPay,
  };
};

/**
 * Calculate payroll previews for all active employees.
 */
const calculateAll = async (companyId, month, year) => {
  const users = await prisma.user.findMany({
    where: { ...scope('user', companyId), role: 'EMPLOYEE', isActive: true },
  });

  const previews = [];
  for (const user of users) {
    const preview = await calculatePayment(companyId, user.id, month, year);
    // Check if paid
    const isPaid = await checkDuplicate(companyId, user.id, month, year);
    previews.push({ ...preview, isPaid });
  }

  return previews;
};

/**
 * Arma las líneas de detalle de una boleta a partir de las métricas calculadas.
 * La usan tanto la previsualización como el pago definitivo, para que lo que
 * el administrador revisa sea exactamente lo que después se guarda.
 */
const buildPaymentDetails = (metrics) => [
  metrics.payScheme === 'DAILY'
    ? {
        type: 'INCOME',
        code: 'DAYS_WORKED',
        description: 'Días trabajados',
        quantity: metrics.daysWorked,
        rate: metrics.dailyRate,
        amount: metrics.monthlySalary,
      }
    : {
        type: 'INCOME',
        code: 'BASE_SALARY',
        description: 'Salario base',
        amount: metrics.monthlySalary,
      },
  {
    type: 'INFORMATION',
    code: 'ORDINARY_HOURS',
    description: 'Horas ordinarias trabajadas',
    quantity: metrics.totalHours,
    amount: 0,
  },
  ...metrics.overtimes.map((overtime) => ({
    type: 'INCOME',
    code: 'OVERTIME',
    description: `Horas extra: ${overtime.reason}`,
    quantity: overtime.hours,
    rate: overtime.hourlyRateSnapshot,
    amount: overtime.calculatedAmount,
    overtimeId: overtime.id,
    metadata: {
      paymentMode: overtime.paymentMode,
      multiplier: Number(overtime.multiplier),
      startTime: overtime.startTime,
      endTime: overtime.endTime,
      workDate: overtime.workDate,
      notes: overtime.notes,
    },
  })),
  ...(metrics.extraDays.length
    ? [
        {
          type: 'INCOME',
          code: 'EXTRA_DAYS',
          description: 'Domingos y feriados trabajados',
          quantity: metrics.extraDays.length,
          rate: metrics.extraDayRate,
          amount: metrics.extraDaysAmount,
          metadata: { days: metrics.extraDays, factor: metrics.extraDayFactor },
        },
      ]
    : []),
  ...(metrics.discountAmount > 0
    ? [
        {
          type: 'DISCOUNT',
          code: 'UNJUSTIFIED_DELAY',
          description: 'Retrasos no justificados',
          quantity: metrics.delayHours,
          rate: metrics.hourlyRate,
          amount: metrics.discountAmount,
        },
      ]
    : []),
  ...metrics.discounts.map((discount) => ({
    type: 'DISCOUNT',
    code: discount.type,
    description: discount.description,
    amount: discount.amount,
    discountId: discount.id,
  })),
];

/**
 * Genera la boleta en PDF SIN registrar el pago.
 *
 * Sirve para que el administrador revise cómo va a quedar antes de confirmar.
 * No escribe nada en la base: si el archivo se descarta, no queda rastro ni
 * un pago a medias.
 *
 * Devuelve la ruta de un archivo temporal que el llamador debe eliminar.
 */
const previewReceipt = async (companyId, userId, month, year) => {
  const uId = parseInt(userId, 10);

  const user = await prisma.user.findFirst({
    where: { id: uId, ...scope('user', companyId) },
    include: { company: { select: { name: true, taxId: true } } },
  });
  if (!user || !user.isActive || user.role !== 'EMPLOYEE') {
    throw new Error('Empleado no encontrado o inactivo');
  }

  if (await checkDuplicate(companyId, uId, month, year)) {
    throw new Error('Ya se ha registrado un pago para este empleado en el mes seleccionado');
  }

  const metrics = await calculatePayment(companyId, uId, month, year);

  // Objeto con la misma forma que un Payment real, pero sin persistir.
  // `id: 0` marca el comprobante como borrador en el encabezado del PDF.
  const borrador = {
    id: 0,
    userId: uId,
    month: parseInt(month, 10),
    year: parseInt(year, 10),
    monthlySalary: metrics.monthlySalary,
    hourlyRate: metrics.hourlyRate,
    totalHours: metrics.totalHours,
    totalDelayMinutes: metrics.totalDelayMinutes,
    delayHours: metrics.delayHours,
    discountAmount: metrics.discountAmount,
    grossPay: metrics.grossPay,
    netPay: metrics.netPay,
    totalIncome: metrics.totalIncome,
    totalDiscounts: metrics.totalDiscounts,
    overtimeAmount: metrics.overtimeAmount,
    justifiedDelayMinutes: metrics.justifiedDelayMinutes,
    paidAt: new Date(),
    details: buildPaymentDetails(metrics),
  };

  const filePath = await pdfService.generateReceipt(borrador, user, { borrador: true });

  return { filePath, metrics };
};

/**
 * Process a payment: save to DB and generate the downloadable PDF receipt.
 */
const processPayment = async (companyId, userId, month, year, actorId) => {
  const uId = parseInt(userId, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);

  // 1. Block duplicate payments
  const isDuplicate = await checkDuplicate(companyId, uId, m, y);
  if (isDuplicate) {
    throw new Error('Ya se ha registrado un pago para este empleado en el mes seleccionado');
  }

  // 2. Fetch user details and calculate metrics
  const user = await prisma.user.findFirst({
    where: { id: uId, ...scope('user', companyId) },
    include: { company: { select: { name: true, taxId: true } } },
  });
  if (!user || !user.isActive || user.role !== 'EMPLOYEE') {
    throw new Error('Empleado no encontrado o inactivo');
  }

  const metrics = await calculatePayment(companyId, uId, m, y);

  // 3. Save payment record
  let payment = await prisma.$transaction(async (tx) => {
    const details = buildPaymentDetails(metrics);

    const created = await tx.payment.create({
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
        totalIncome: metrics.totalIncome,
        totalDiscounts: metrics.totalDiscounts,
        overtimeAmount: metrics.overtimeAmount,
        justifiedDelayMinutes: metrics.justifiedDelayMinutes,
        details: { create: details },
      },
      include: { details: true },
    });

    // Marca los descuentos como aplicados para que no vuelvan a liquidarse.
    await tx.discount.updateMany({
      where: { id: { in: metrics.discounts.map((discount) => discount.id) } },
      data: { paymentId: created.id },
    });

    return created;
  });

  // 4. Generar la boleta en PDF.
  //
  // La boleta no se envía por correo: queda disponible para descarga desde el
  // panel de la empresa y desde la aplicación del empleado. `pdfError` se
  // guarda para que el administrador sepa que hay que regenerarla.
  let localPdfPath = null;
  let pdfUrl = null;
  let pdfError = null;

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
  } catch (error) {
    pdfError = `No se pudo generar o almacenar la boleta: ${error.message}`;
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: { emailError: pdfError, emailRetryRequired: true },
    });
    console.error('❌ Falló la generación de la boleta:', error);
  }

  if (process.env.NODE_ENV === 'production' && localPdfPath) {
    await fs
      .unlink(localPdfPath)
      .catch((error) =>
        console.warn(`No se pudo limpiar ${path.basename(localPdfPath)}: ${error.message}`)
      );
  }

  return {
    ...payment,
    pdfError,
    pdfAvailable: Boolean(pdfUrl),
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
const getHistory = async (companyId, filters) => {
  const where = { ...scope('payment', companyId) };

  if (filters.userId) {
    where.userId = parseInt(filters.userId, 10);
  }
  if (filters.month) {
    where.month = parseInt(filters.month, 10);
  }
  if (filters.year) {
    where.year = parseInt(filters.year, 10);
  }

  const payments = await prisma.payment.findMany({
    where,
    include: {
      // El descuento de origen trae la fecha y el comprobante, para el
      // desglose "de qué se descontó" del historial.
      details: {
        include: {
          discount: {
            select: {
              discountDate: true,
              documentReference: true,
              notes: true,
              type: true,
            },
          },
        },
      },
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

  return Promise.all(payments.map((payment) => withOrigin(companyId, payment)));
};

/**
 * Añade a un pago su "origen": las sedes donde la persona efectivamente
 * trabajó durante ese mes.
 *
 * El sistema no tiene contratos ni clientes, así que el origen se deriva de
 * las marcaciones de asistencia del período. Si rotó entre varias sedes, se
 * listan todas.
 */
const withOrigin = async (companyId, payment) => {
  const inicio = new Date(Date.UTC(payment.year, payment.month - 1, 1));
  const fin = new Date(Date.UTC(payment.year, payment.month, 0, 23, 59, 59, 999));

  const sesiones = await prisma.attendanceSession.findMany({
    where: {
      ...scope('attendanceSession', companyId),
      userId: payment.userId,
      workDate: { gte: inicio, lte: fin },
      matchedWorksiteId: { not: null },
    },
    select: { matchedWorksite: { select: { id: true, name: true, address: true } } },
  });

  const porId = new Map();
  sesiones.forEach((sesion) => {
    if (sesion.matchedWorksite) porId.set(sesion.matchedWorksite.id, sesion.matchedWorksite);
  });

  const sedes = [...porId.values()];

  return {
    ...payment,
    worksites: sedes,
    // Texto listo para mostrar, para que cada cliente no lo arme por su cuenta.
    originLabel: sedes.length
      ? sedes.map((sede) => sede.name).join(' · ')
      : 'Sin sede registrada en el período',
    conceptLabel: `Sueldo de ${MONTH_NAMES[payment.month - 1]} ${payment.year}`,
  };
};

/**
 * Get payment by ID
 */
const getById = async (companyId, id) => {
  // `findFirst` y no `findUnique`: `findUnique` no admite filtros de relación,
  // y sin el ámbito bastaría con adivinar el id de una boleta de otra empresa.
  return prisma.payment.findFirst({
    where: { id: parseInt(id, 10), ...scope('payment', companyId) },
    include: {
      details: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          employeeType: true,
          monthlyHours: true,
          company: { select: { name: true, taxId: true } },
        },
      },
    },
  });
};

/**
 * Adjunta la foto del recibo físico firmado a un pago ya registrado.
 *
 * El monto NO se lee de la imagen: sigue siendo el que calculó la nómina.
 * Esta foto es solo el respaldo de que el pago se entregó y quedó firmado, así
 * que no toca ninguna cifra del pago.
 *
 * El beneficiario tampoco se escribe: sale del propio pago, que ya apunta al
 * empleado. Es más fuerte que elegirlo de una lista, porque no hay forma de
 * asociar el recibo a la persona equivocada.
 */
const attachReceipt = async (companyId, paymentId, dataUri, actorId) => {
  const payment = await getById(companyId, paymentId);
  if (!payment) throw new Error('Pago no encontrado');

  const archivo = await photoService.storeReceiptPhoto(dataUri, {
    paymentId: payment.id,
    userId: payment.userId,
    month: payment.month,
    year: payment.year,
  });

  const actualizado = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      receiptPhotoUrl: archivo.url,
      receiptPhotoPublicId: archivo.publicId,
      // Fecha de Bolivia, no del servidor: cerca de medianoche difieren en un
      // día y el recibo quedaría fechado mal. Se reutiliza el helper que ya
      // usan la asistencia y las asignaciones de sede.
      receiptUploadedOn: boliviaToday(),
      receiptUploadedBy: actorId,
      updatedBy: actorId,
    },
  });

  return {
    id: actualizado.id,
    userId: actualizado.userId,
    month: actualizado.month,
    year: actualizado.year,
    beneficiary: `${payment.user.firstName} ${payment.user.lastName}`,
    receiptUploadedOn: actualizado.receiptUploadedOn,
    hasReceipt: true,
  };
};

/**
 * Quita el recibo adjunto. El archivo en sí no se borra: si la referencia se
 * perdió por error, el original sigue estando para poder recuperarlo.
 */
const removeReceipt = async (companyId, paymentId, actorId) => {
  const payment = await getById(companyId, paymentId);
  if (!payment) throw new Error('Pago no encontrado');
  if (!payment.receiptPhotoUrl) throw new Error('Ese pago no tiene recibo adjunto');

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      receiptPhotoUrl: null,
      receiptPhotoPublicId: null,
      receiptUploadedOn: null,
      receiptUploadedBy: null,
      updatedBy: actorId,
    },
  });

  return { id: payment.id, hasReceipt: false };
};
/** Razón social que encabeza el reporte mensual en PDF. */
const getIssuingCompany = (companyId) =>
  prisma.company.findUnique({
    where: { id: Number(companyId) },
    select: { name: true, taxId: true },
  });

module.exports = {
  getIssuingCompany,
  checkDuplicate,
  calculatePayment,
  calculateAll,
  processPayment,
  previewReceipt,
  getHistory,
  getById,
  attachReceipt,
  removeReceipt,
};
