#!/usr/bin/env node

/**
 * Crea el primer SUPER_ADMIN de la plataforma.
 *
 * Uso:
 *   SUPER_ADMIN_EMAIL=tu@correo.com \
 *   SUPER_ADMIN_PASSWORD=contraseñaSegura123 \
 *   node scripts/create-super-admin.js
 *
 * O con las variables ya en el .env del backend:
 *   node scripts/create-super-admin.js
 *
 * Este script es IDEMPOTENTE: si el correo ya está registrado con rol
 * SUPER_ADMIN, lo reporta y sale sin error. Si está registrado con otro rol,
 * avisa y no lo modifica (convertir un ADMIN en SUPER_ADMIN requiere una
 * decisión deliberada, no un script automático).
 *
 * El script NO envía correo: el primer SUPER_ADMIN lo ejecuta el propio
 * desarrollador, que ya sabe la contraseña que acaba de elegir.
 *
 * ⚠️ NUNCA ejecutar en un pipeline CI/CD sin proteger las variables.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { assertPasswordStrength } = require('../src/lib/credentials');
const { normalizePhone, isValidPhone } = require('../src/lib/contact');

const prisma = new PrismaClient();

async function main() {
  // Se entra con correo o con celular: basta con uno de los dos.
  const email = process.env.SUPER_ADMIN_EMAIL || null;
  const phoneRaw = process.env.SUPER_ADMIN_PHONE || '';
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (phoneRaw && !isValidPhone(phoneRaw)) {
    console.error('❌ SUPER_ADMIN_PHONE no es un celular válido (8 dígitos que empiezan con 6 o 7).');
    process.exit(1);
  }

  if ((!email && !phone) || !password) {
    console.error(
      '❌ Defina SUPER_ADMIN_EMAIL o SUPER_ADMIN_PHONE, y SUPER_ADMIN_PASSWORD.\n' +
        '   Puede ponerlas en backend/.env o pasarlas en la línea de comandos.\n\n' +
        '   Ejemplo:\n' +
        '     SUPER_ADMIN_EMAIL=admin@plataforma.com \\\n' +
        '     SUPER_ADMIN_PASSWORD=miContraseñaSegura123 \\\n' +
        '     node scripts/create-super-admin.js'
    );
    process.exit(1);
  }

  // Validar fortaleza antes de hacer nada en la base.
  try {
    assertPasswordStrength(password);
  } catch (error) {
    console.error(`❌ Contraseña insegura: ${error.message}`);
    process.exit(1);
  }

  // Verificar si ya existe.
  const login = email || phone;
  const existente = await prisma.user.findUnique({ where: email ? { email } : { phone } });

  if (existente) {
    if (existente.role === 'SUPER_ADMIN') {
      console.log(`✅ El SUPER_ADMIN ${login} ya existe (id: ${existente.id}). Nada que hacer.`);
      return;
    }

    console.error(
      `❌ ${login} ya está registrado con rol ${existente.role}.\n` +
        '   Usar un correo distinto, o convertirlo manualmente si es intencional.'
    );
    process.exit(1);
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const creado = await prisma.user.create({
    data: {
      companyId: null, // SUPER_ADMIN no pertenece a ninguna empresa
      email,
      phone,
      password: hashedPassword,
      firstName: process.env.SUPER_ADMIN_FIRST_NAME || 'Super',
      lastName: process.env.SUPER_ADMIN_LAST_NAME || 'Admin',
      role: 'SUPER_ADMIN',
      monthlySalary: 0,
      monthlyHours: 160,
      hourlyRate: 0,
      mustChangePassword: false, // El propio desarrollador eligió la contraseña
      passwordSetAt: new Date(),
    },
  });

  console.log(
    `✅ SUPER_ADMIN creado:\n` +
      `   ID:    ${creado.id}\n` +
      `   Ingreso: ${creado.email || creado.phone}\n` +
      `   Rol:   ${creado.role}\n\n` +
      `   Puede iniciar sesión con las credenciales proporcionadas.`
  );
}

main()
  .catch((error) => {
    console.error('❌ Error al crear SUPER_ADMIN:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
