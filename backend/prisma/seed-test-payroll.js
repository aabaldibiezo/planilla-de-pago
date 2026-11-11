// Carga backend/.env. El CLI de Prisma lo hace solo, pero `node` directo no.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const TEST_YEAR = 2026;
const TEST_MONTH = 8;
const TEST_DATES = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'];
const ENTRY_OFFSETS = [0, 5, -2, 10, 0];
const DISCOUNT_DESCRIPTION = 'Cuota de préstamo de prueba - agosto 2026';

const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const toTime = (totalMinutes) => {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
};

const instantAtBoliviaTime = (date, time) => new Date(`${date}T${time}:00-04:00`);

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { id: 'asc' },
  });
  if (!admin) throw new Error('Se requiere un administrador activo para crear los datos de prueba');

  const employees = await prisma.user.findMany({
    where: { role: 'EMPLOYEE', isActive: true },
    orderBy: { id: 'asc' },
  });
  if (employees.length === 0) throw new Error('No hay empleados activos');

  let attendancesCreated = 0;
  let sessionsCreated = 0;

  for (const employee of employees) {
    const scheduledEntry = employee.scheduledEntryTime || '08:00';
    const scheduledMinutes = toMinutes(scheduledEntry);

    for (let index = 0; index < TEST_DATES.length; index += 1) {
      const dateText = TEST_DATES[index];
      const workDate = new Date(`${dateText}T00:00:00.000Z`);
      const existing = await prisma.attendance.findUnique({
        where: { userId_date: { userId: employee.id, date: workDate } },
        include: { sessions: true },
      });
      if (existing) continue;

      const offset = ENTRY_OFFSETS[(index + employee.id) % ENTRY_OFFSETS.length];
      const actualEntry = toTime(scheduledMinutes + offset);
      const actualExit = toTime(scheduledMinutes + offset + 480);
      const delayMinutes = Math.max(0, offset);
      const clockIn = instantAtBoliviaTime(dateText, actualEntry);
      const clockOut = new Date(clockIn.getTime() + 480 * 60 * 1000);
      const shouldJustify = employee.id === employees[1]?.id && index === 0 && delayMinutes > 0;

      await prisma.attendance.create({
        data: {
          userId: employee.id,
          date: workDate,
          scheduledEntry,
          actualEntry,
          actualExit,
          hoursWorked: 8,
          delayMinutes,
          notes: 'Datos de prueba para nómina de agosto de 2026',
          createdBy: admin.id,
          updatedBy: admin.id,
          sessions: {
            create: {
              userId: employee.id,
              workDate,
              clockIn,
              clockOut,
              workedMinutes: 480,
              delayMinutes,
              justificationStatus: shouldJustify ? 'JUSTIFIED' : 'PENDING',
              justificationReason: shouldJustify ? 'Cita médica de prueba' : null,
              justificationNotes: shouldJustify ? 'Retraso perdonado para validar la nómina' : null,
              justificationRequestedAt: shouldJustify ? new Date() : null,
              justificationCreatedBy: shouldJustify ? admin.id : null,
              justificationReviewedBy: shouldJustify ? admin.id : null,
              justificationReviewedAt: shouldJustify ? new Date() : null,
              decisionReason: shouldJustify ? 'Cita médica de prueba' : null,
              createdBy: admin.id,
              updatedBy: admin.id,
            },
          },
        },
      });
      attendancesCreated += 1;
      sessionsCreated += 1;
    }
  }

  const discountEmployee = employees[0];
  let discount = await prisma.discount.findFirst({
    where: {
      userId: discountEmployee.id,
      description: DISCOUNT_DESCRIPTION,
      discountDate: new Date('2026-08-05T00:00:00.000Z'),
    },
  });
  if (!discount) {
    discount = await prisma.discount.create({
      data: {
        userId: discountEmployee.id,
        type: 'LOAN',
        amount: 120,
        discountDate: new Date('2026-08-05T00:00:00.000Z'),
        description: DISCOUNT_DESCRIPTION,
        status: 'APPROVED',
        createdBy: admin.id,
        approvedBy: admin.id,
        approvedAt: new Date(),
        notes: 'Descuento externo generado como dato de prueba',
        documentReference: 'TEST-AGOSTO-2026',
      },
    });
  }

  const existingAudit = await prisma.auditLog.findFirst({
    where: { action: 'CREATE_TEST_DATA', entity: 'Discount', entityId: String(discount.id) },
  });
  if (!existingAudit) {
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'CREATE_TEST_DATA',
        entity: 'Discount',
        entityId: String(discount.id),
        employeeId: discountEmployee.id,
        reason: 'Preparación de nómina de prueba para agosto de 2026',
        newData: {
          type: discount.type,
          amount: Number(discount.amount),
          description: discount.description,
          period: `${TEST_MONTH}/${TEST_YEAR}`,
        },
      },
    });
  }

  console.log(`Periodo de prueba: ${String(TEST_MONTH).padStart(2, '0')}/${TEST_YEAR}`);
  console.log(`Empleados: ${employees.length}`);
  console.log(`Asistencias creadas: ${attendancesCreated}`);
  console.log(`Sesiones creadas: ${sessionsCreated}`);
  console.log(
    `Descuento externo: Bs. ${Number(discount.amount).toFixed(2)} para ${discountEmployee.firstName} ${discountEmployee.lastName}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
