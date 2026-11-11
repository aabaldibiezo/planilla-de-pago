/**
 * Deja el sistema sin clientes, listo para empezar a operar de verdad.
 *
 * Borra TODAS las empresas y todos sus datos operativos. Conserva:
 *   · los usuarios SUPER_ADMIN (la plataforma sigue teniendo dueño)
 *   · los planes (Esencial, Profesional, Empresarial)
 *
 * Pensado para ejecutarse una vez, al terminar las pruebas.
 *
 *     CONFIRMAR_RESET=SI npm run reset:clientes
 *
 * La variable de confirmación es obligatoria a propósito: sin ella el script
 * no borra nada. Es un borrado irreversible y no debe poder dispararse por
 * autocompletado ni por quedar en el historial de la terminal.
 */
// Carga backend/.env. El CLI de Prisma lo hace solo, pero `node` directo no.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  if (process.env.CONFIRMAR_RESET !== 'SI') {
    console.error('❌ Este script borra TODAS las empresas y sus datos.');
    console.error('   Para ejecutarlo: CONFIRMAR_RESET=SI npm run reset:clientes');
    process.exit(1);
  }

  const empresas = await prisma.company.count();
  const empleados = await prisma.user.count({ where: { role: { not: 'SUPER_ADMIN' } } });
  console.log(`⚠️  Se van a borrar ${empresas} empresa(s) y ${empleados} usuario(s).`);

  // Orden de borrado dictado por las claves foráneas: primero lo que apunta a
  // otros, al final las empresas. `deleteMany` sin filtro borra toda la tabla.
  const resultado = await prisma.$transaction(async (tx) => {
    const conteos = {};

    conteos.paymentDetail = (await tx.paymentDetail.deleteMany({})).count;
    conteos.timeCompensation = (await tx.timeCompensation.deleteMany({})).count;
    conteos.discount = (await tx.discount.deleteMany({})).count;
    conteos.payment = (await tx.payment.deleteMany({})).count;
    conteos.overtime = (await tx.overtime.deleteMany({})).count;
    conteos.attendanceSession = (await tx.attendanceSession.deleteMany({})).count;
    conteos.attendance = (await tx.attendance.deleteMany({})).count;
    conteos.worksiteAssignment = (await tx.worksiteAssignment.deleteMany({})).count;
    conteos.scheduleBlock = (await tx.scheduleBlock.deleteMany({})).count;
    conteos.worksite = (await tx.worksite.deleteMany({})).count;
    conteos.subscriptionPayment = (await tx.subscriptionPayment.deleteMany({})).count;
    conteos.auditLog = (await tx.auditLog.deleteMany({})).count;

    // Todos los usuarios de empresa; los SUPER_ADMIN se quedan.
    conteos.user = (await tx.user.deleteMany({ where: { role: { not: 'SUPER_ADMIN' } } })).count;

    conteos.company = (await tx.company.deleteMany({})).count;

    return conteos;
  });

  Object.entries(resultado)
    .filter(([, cantidad]) => cantidad > 0)
    .forEach(([tabla, cantidad]) => console.log(`  ✔ ${tabla}: ${cantidad} registro(s)`));

  const superAdmins = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
  const planes = await prisma.plan.count();
  console.log('');
  console.log(`✅ Sistema sin clientes. Quedan ${superAdmins} súper admin(s) y ${planes} plan(es).`);
}

main()
  .catch((error) => {
    console.error('❌ Error durante el reset:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
