-- Pago anual con meses de regalo y correo de contacto opcional.
ALTER TABLE "Company" ALTER COLUMN "contactEmail" DROP NOT NULL;
ALTER TABLE "SubscriptionPayment" ADD COLUMN "monthsPaid" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SubscriptionPayment" ADD COLUMN "bonusMonths" INTEGER NOT NULL DEFAULT 0;
