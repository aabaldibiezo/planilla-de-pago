/**
 * Regenera las boletas en PDF que faltan en el disco.
 *
 * Un pago puede quedar sin su archivo por varias vías legítimas:
 *   · falló la generación o la subida en el momento del pago
 *     (queda marcado con `emailRetryRequired`),
 *   · el `pdfPath` apunta a una ruta de otro entorno — el caso típico es
 *     `/app/receipts/...`, de cuando el backend corría dentro del contenedor
 *     y ahora se ejecuta en el equipo,
 *   · en producción el disco es efímero y la copia local se descarta tras
 *     subirla a Cloudinary.
 *
 * El pago no se recalcula: la boleta se reconstruye a partir del `PaymentDetail`
 * ya guardado, así que el importe es exactamente el que se liquidó en su
 * momento aunque después hayan cambiado el sueldo o las reglas.
 *
 * Un `pdfPath` que sea una URL https no se toca: el archivo vive en Cloudinary.
 *
 *   node scripts/reparar-boletas.js            → informa qué falta
 *   node scripts/reparar-boletas.js --aplicar  → regenera y corrige la base
 */
// Carga backend/.env. El CLI de Prisma lo hace solo, pero `node` directo no.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const pdfService = require('../src/services/pdf.service');
const cloudinaryService = require('../src/services/cloudinary.service');

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');

/** ¿La boleta de este pago está disponible tal como quedó registrada? */
const estado = (payment) => {
  if (!payment.pdfPath) return 'SIN_RUTA';
  // Una URL remota se da por buena: verificarla exigiría una petición de red
  // por pago, y el archivo no está bajo el control de este script.
  if (/^https?:\/\//i.test(payment.pdfPath)) return 'REMOTA';
  return fs.existsSync(payment.pdfPath) ? 'OK' : 'ARCHIVO_AUSENTE';
};

async function main() {
  const pagos = await prisma.payment.findMany({
    include: {
      details: true,
      user: { include: { company: { select: { name: true, taxId: true } } } },
    },
    orderBy: { id: 'asc' },
  });

  if (pagos.length === 0) {
    console.log('No hay pagos registrados.');
    return;
  }

  const porEstado = { OK: [], REMOTA: [], SIN_RUTA: [], ARCHIVO_AUSENTE: [] };
  pagos.forEach((pago) => porEstado[estado(pago)].push(pago));

  console.log(`Pagos registrados: ${pagos.length}`);
  console.log(`  ✔ con archivo local presente : ${porEstado.OK.length}`);
  console.log(`  ☁ almacenados en Cloudinary  : ${porEstado.REMOTA.length}`);
  console.log(`  ✘ sin ruta registrada        : ${porEstado.SIN_RUTA.length}`);
  console.log(`  ✘ con el archivo ausente     : ${porEstado.ARCHIVO_AUSENTE.length}`);

  const aReparar = [...porEstado.SIN_RUTA, ...porEstado.ARCHIVO_AUSENTE];
  if (aReparar.length === 0) {
    console.log('\n✅ No hay nada que reparar.');
    return;
  }

  console.log('\nBoletas a regenerar:');
  aReparar.forEach((pago) => {
    console.log(
      `  #${pago.id} ${pago.user.firstName} ${pago.user.lastName} — ${pago.month}/${pago.year}` +
        (pago.pdfPath ? `\n      ruta registrada: ${pago.pdfPath}` : '')
    );
  });

  if (!aplicar) {
    console.log('\nEsto fue solo un informe. Para regenerarlas:');
    console.log('  node scripts/reparar-boletas.js --aplicar');
    return;
  }

  console.log('');
  let reparadas = 0;
  for (const pago of aReparar) {
    try {
      const rutaLocal = await pdfService.generateReceipt(pago, pago.user);

      // Mismo criterio que `payment.service`: si Cloudinary está configurado,
      // el archivo definitivo vive allá y el local es temporal.
      let rutaFinal = rutaLocal;
      if (cloudinaryService.configured()) {
        const publicId = `planilla/boletas/${pago.year}/${String(pago.month).padStart(2, '0')}/pago-${pago.id}.pdf`;
        rutaFinal = (await cloudinaryService.uploadPdf(rutaLocal, publicId)).url;
        await fs.promises.unlink(rutaLocal).catch(() => {});
      }

      await prisma.payment.update({
        where: { id: pago.id },
        data: {
          pdfPath: rutaFinal,
          pdfGeneratedAt: new Date(),
          // La boleta vuelve a estar disponible: se limpia el pendiente.
          emailRetryRequired: false,
          emailError: null,
        },
      });

      console.log(`  ✔ #${pago.id} regenerada → ${rutaFinal}`);
      reparadas += 1;
    } catch (error) {
      console.error(`  ✘ #${pago.id} falló: ${error.message}`);
    }
  }

  console.log(`\n✅ ${reparadas} de ${aReparar.length} boleta(s) regenerada(s).`);
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
