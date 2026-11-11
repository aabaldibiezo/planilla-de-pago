/**
 * Sede de trabajo provisional para probar el geocerco.
 *
 * ⚠️ ESTOS DATOS SON PROVISIONALES. Las coordenadas corresponden al centro de
 * Cochabamba (deducidas de la zona horaria y la configuración regional del
 * equipo, es-BO / UTC-4), NO a una dirección real de la empresa.
 *
 * El radio es deliberadamente amplio (8 km) para que cualquier prueba hecha
 * dentro de la ciudad dé como válida. Con el radio real de una oficina
 * (100-200 m), marcar desde otro punto de la ciudad saldría SOSPECHOSO.
 *
 * Antes de usar esto en producción hay que reemplazar cada sede por su
 * dirección real con latitud, longitud y radio ajustado. La forma más simple
 * de obtener las coordenadas exactas es abrir Google Maps en el lugar,
 * mantener presionado el punto y copiar el par de números que aparece.
 *
 * Uso:  node prisma/seed-worksites.js
 */
// Carga backend/.env. El CLI de Prisma lo hace solo, pero `node` directo no.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SEDE_PROVISIONAL = {
  name: 'Sede de prueba (Cochabamba centro)',
  address: 'Plaza 14 de Septiembre, Cochabamba, Bolivia — UBICACIÓN PROVISIONAL',
  latitude: -17.393835,
  longitude: -66.156872,
  radiusMeters: 8000,
  notes:
    'Generada automáticamente para probar el geocerco. Reemplazar por la dirección ' +
    'real de la empresa con un radio acorde (100-200 m para una oficina).',
};

async function main() {
  // Una sede pertenece siempre a una empresa. Se usa la primera cargada, que
  // en una base de pruebas es la que crea `npm run seed`.
  const empresa = await prisma.company.findFirst({ orderBy: { id: 'asc' } });
  if (!empresa) {
    throw new Error('No hay ninguna empresa cargada. Ejecute primero: npm run seed');
  }
  console.log(`  Empresa: ${empresa.name}`);

  const existente = await prisma.worksite.findFirst({
    where: { name: SEDE_PROVISIONAL.name, companyId: empresa.id },
  });

  const sede = existente
    ? await prisma.worksite.update({ where: { id: existente.id }, data: SEDE_PROVISIONAL })
    : await prisma.worksite.create({ data: { ...SEDE_PROVISIONAL, companyId: empresa.id } });

  console.log(`✔ Sede ${existente ? 'actualizada' : 'creada'}: #${sede.id} ${sede.name}`);
  console.log(`  Coordenadas: ${sede.latitude}, ${sede.longitude}`);
  console.log(`  Radio: ${sede.radiusMeters} m (amplio a propósito, solo para pruebas)`);

  // Asigna la sede a todos los empleados activos, todos los días de la semana.
  const empleados = await prisma.user.findMany({
    where: { companyId: empresa.id, role: 'EMPLOYEE', isActive: true },
    select: { id: true, firstName: true, lastName: true },
  });

  if (empleados.length === 0) {
    console.log('  (sin empleados activos: no se crearon asignaciones)');
    return;
  }

  const desde = new Date();
  desde.setUTCHours(0, 0, 0, 0);

  let creadas = 0;
  for (const empleado of empleados) {
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
      const yaExiste = await prisma.worksiteAssignment.findFirst({
        where: { userId: empleado.id, worksiteId: sede.id, dayOfWeek, specificDate: null },
      });
      if (yaExiste) continue;

      await prisma.worksiteAssignment.create({
        data: { userId: empleado.id, worksiteId: sede.id, dayOfWeek, validFrom: desde },
      });
      creadas += 1;
    }
  }

  console.log(`✔ ${creadas} asignación(es) creada(s) para ${empleados.length} empleado(s)`);
  console.log('\n⚠️  Recordá reemplazar esta sede por las direcciones reales.');
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
