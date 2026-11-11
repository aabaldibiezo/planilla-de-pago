/**
 * Planes comerciales de la plataforma.
 *
 * Permanente: hace falta en cualquier instalación nueva. Es idempotente, así
 * que se puede volver a ejecutar sin pisar los precios ni los límites que se
 * hayan ajustado después desde el panel de súper administrador.
 *
 * Los mismos tres planes se insertan en la migración
 * `20260809100100_multi_tenant_subscriptions`; este script existe para
 * recrearlos si alguien los borra, y para documentar los valores iniciales.
 *
 * ⚠️ Los precios están en DÓLARES (USD), a diferencia de los sueldos del
 * sistema, que están en bolivianos.
 *
 *   npm run seed:plans
 */
// Carga backend/.env. El CLI de Prisma lo hace solo, pero `node` directo no.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/** `maxEmployees: null` significa ilimitado. */
const PLANES = [
  { code: 'ESENCIAL', name: 'Esencial', maxEmployees: 10, monthlyPriceUsd: 25.0 },
  { code: 'PROFESIONAL', name: 'Profesional', maxEmployees: 30, monthlyPriceUsd: 45.0 },
  { code: 'EMPRESARIAL', name: 'Empresarial', maxEmployees: null, monthlyPriceUsd: 55.0 },
];

async function main() {
  console.log('🌱 Sembrando planes de suscripción...');

  for (const plan of PLANES) {
    // `update: {}` a propósito: si el plan ya existe, se respeta lo que el
    // súper administrador haya configurado desde el panel.
    const guardado = await prisma.plan.upsert({
      where: { code: plan.code },
      update: {},
      create: plan,
    });

    const limite =
      guardado.maxEmployees === null ? 'empleados ilimitados' : `hasta ${guardado.maxEmployees} empleados`;
    console.log(
      `  ✔ ${guardado.name} — ${limite} — USD ${Number(guardado.monthlyPriceUsd).toFixed(2)}/mes`
    );
  }

  console.log('✅ Planes listos.');
}

main()
  .catch((error) => {
    console.error('❌ Error al sembrar los planes:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
