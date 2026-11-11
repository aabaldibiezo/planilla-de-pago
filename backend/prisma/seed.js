// Carga backend/.env. El CLI de Prisma lo hace solo, pero `node` directo no.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // --- Empresa demo ---
  // Desde que el sistema es multiempresa, todo usuario distinto de SUPER_ADMIN
  // tiene que pertenecer a una empresa: la restricción `user_company_scope` de
  // la base lo exige. El seed crea una para colgar de ella los datos de prueba.
  const plan = await prisma.plan.findUnique({ where: { code: 'PROFESIONAL' } });
  if (!plan) {
    throw new Error('No existen los planes. Ejecute primero: npm run seed:plans');
  }

  const proximoMes = new Date();
  proximoMes.setMonth(proximoMes.getMonth() + 1);

  let company = await prisma.company.findFirst({ where: { name: 'Empresa Demo' } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'Empresa Demo',
        contactEmail: 'contacto@example.com',
        planId: plan.id,
        status: 'ACTIVE',
        nextDueDate: proximoMes,
      },
    });
  }
  console.log(`  ✔ Company: ${company.name} (plan ${plan.name})`);

  const salt = await bcrypt.genSalt(10);
  if (!process.env.ADMIN_SEED_PASSWORD || process.env.ADMIN_SEED_PASSWORD.length < 12) {
    throw new Error(
      'ADMIN_SEED_PASSWORD debe configurarse con al menos 12 caracteres antes de ejecutar el seed'
    );
  }
  const adminPassword = await bcrypt.hash(process.env.ADMIN_SEED_PASSWORD, salt);
  const employeePassword = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), salt);

  // --- Seed Admin User ---
  const admin = await prisma.user.upsert({
    where: { email: process.env.ADMIN_SEED_EMAIL || 'admin@example.com' },
    update: {},
    create: {
      companyId: company.id,
      email: process.env.ADMIN_SEED_EMAIL || 'admin@example.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'Sistema',
      role: 'ADMIN',
      employeeType: 'FIJO',
      monthlySalary: 0,
      monthlyHours: 160,
      hourlyRate: 0,
      scheduledEntryTime: '08:00',
    },
  });
  console.log(`  ✔ Admin user: ${admin.email}`);

  // --- Seed Employees with REAL test emails ---
  const carlos = await prisma.user.upsert({
    where: { email: 'carlos@example.com' },
    update: {},
    create: {
      companyId: company.id,
      email: 'carlos@example.com',
      password: employeePassword,
      firstName: 'Carlos',
      lastName: 'García',
      role: 'EMPLOYEE',
      employeeType: 'FIJO',
      monthlySalary: 4500, // 4500 Bs.
      monthlyHours: 160,
      hourlyRate: 28.13, // 4500 / 160
      scheduledEntryTime: '08:00',
    },
  });
  console.log(`  ✔ Employee (Fijo): ${carlos.email}`);

  const maria = await prisma.user.upsert({
    where: { email: 'maria@example.com' },
    update: {},
    create: {
      companyId: company.id,
      email: 'maria@example.com',
      password: employeePassword,
      firstName: 'María',
      lastName: 'López',
      role: 'EMPLOYEE',
      employeeType: 'TEMPORAL',
      monthlySalary: 3200,
      monthlyHours: 120,
      hourlyRate: 26.67, // 3200 / 120
      scheduledEntryTime: '09:00',
    },
  });
  console.log(`  ✔ Employee (Temporal): ${maria.email}`);

  const pedro = await prisma.user.upsert({
    where: { email: 'pedro@example.com' },
    update: {},
    create: {
      companyId: company.id,
      email: 'pedro@example.com',
      password: employeePassword,
      firstName: 'Pedro',
      lastName: 'Ramírez',
      role: 'EMPLOYEE',
      employeeType: 'FIJO',
      monthlySalary: 5000,
      monthlyHours: 160,
      hourlyRate: 31.25, // 5000 / 160
      scheduledEntryTime: '08:30',
    },
  });
  console.log(`  ✔ Employee (Fijo): ${pedro.email}`);

  // --- Seed Attendance Records ---
  const existingAttendances = await prisma.attendance.count();
  if (existingAttendances === 0) {
    const attendances = [
      // Carlos - Entrada programada: 08:00
      {
        userId: carlos.id,
        date: new Date('2026-07-01'),
        scheduledEntry: '08:00',
        actualEntry: '08:00',
        actualExit: '16:00',
        hoursWorked: 8.0,
        delayMinutes: 0,
        notes: 'A tiempo',
      },
      {
        userId: carlos.id,
        date: new Date('2026-07-02'),
        scheduledEntry: '08:00',
        actualEntry: '08:15',
        actualExit: '17:15',
        hoursWorked: 9.0,
        delayMinutes: 15,
        notes: 'Retraso por tráfico',
      },
      {
        userId: carlos.id,
        date: new Date('2026-07-03'),
        scheduledEntry: '08:00',
        actualEntry: '08:05',
        actualExit: '16:05',
        hoursWorked: 8.0,
        delayMinutes: 5,
        notes: null,
      },
      {
        userId: carlos.id,
        date: new Date('2026-07-06'),
        scheduledEntry: '08:00',
        actualEntry: '08:30',
        actualExit: '17:00',
        hoursWorked: 8.5,
        delayMinutes: 30,
        notes: 'Problemas mecánicos',
      },
      {
        userId: carlos.id,
        date: new Date('2026-07-07'),
        scheduledEntry: '08:00',
        actualEntry: '07:55',
        actualExit: '16:00',
        hoursWorked: 8.0,
        delayMinutes: 0,
        notes: 'Temprano',
      },

      // Maria - Entrada programada: 09:00
      {
        userId: maria.id,
        date: new Date('2026-07-01'),
        scheduledEntry: '09:00',
        actualEntry: '08:58',
        actualExit: '17:00',
        hoursWorked: 8.03,
        delayMinutes: 0,
        notes: null,
      },
      {
        userId: maria.id,
        date: new Date('2026-07-02'),
        scheduledEntry: '09:00',
        actualEntry: '09:20',
        actualExit: '17:20',
        hoursWorked: 8.0,
        delayMinutes: 20,
        notes: 'Retraso de transporte',
      },
      {
        userId: maria.id,
        date: new Date('2026-07-03'),
        scheduledEntry: '09:00',
        actualEntry: '09:00',
        actualExit: '17:00',
        hoursWorked: 8.0,
        delayMinutes: 0,
        notes: null,
      },
      {
        userId: maria.id,
        date: new Date('2026-07-06'),
        scheduledEntry: '09:00',
        actualEntry: '09:10',
        actualExit: '17:10',
        hoursWorked: 8.0,
        delayMinutes: 10,
        notes: null,
      },
      {
        userId: maria.id,
        date: new Date('2026-07-07'),
        scheduledEntry: '09:00',
        actualEntry: '09:05',
        actualExit: '17:05',
        hoursWorked: 8.0,
        delayMinutes: 5,
        notes: null,
      },

      // Pedro - Entrada programada: 08:30
      {
        userId: pedro.id,
        date: new Date('2026-07-01'),
        scheduledEntry: '08:30',
        actualEntry: '08:30',
        actualExit: '16:30',
        hoursWorked: 8.0,
        delayMinutes: 0,
        notes: null,
      },
      {
        userId: pedro.id,
        date: new Date('2026-07-02'),
        scheduledEntry: '08:30',
        actualEntry: '08:30',
        actualExit: '16:30',
        hoursWorked: 8.0,
        delayMinutes: 0,
        notes: null,
      },
      {
        userId: pedro.id,
        date: new Date('2026-07-03'),
        scheduledEntry: '08:30',
        actualEntry: '08:45',
        actualExit: '16:45',
        hoursWorked: 8.0,
        delayMinutes: 15,
        notes: null,
      },
      {
        userId: pedro.id,
        date: new Date('2026-07-06'),
        scheduledEntry: '08:30',
        actualEntry: '08:30',
        actualExit: '16:30',
        hoursWorked: 8.0,
        delayMinutes: 0,
        notes: null,
      },
      {
        userId: pedro.id,
        date: new Date('2026-07-07'),
        scheduledEntry: '08:30',
        actualEntry: '08:50',
        actualExit: '16:50',
        hoursWorked: 8.0,
        delayMinutes: 20,
        notes: null,
      },
    ];

    await prisma.attendance.createMany({ data: attendances });
    console.log(`  ✔ Created ${attendances.length} attendance records`);
  } else {
    console.log(`  ⏭ Attendance records already exist (${existingAttendances}), skipping...`);
  }

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
