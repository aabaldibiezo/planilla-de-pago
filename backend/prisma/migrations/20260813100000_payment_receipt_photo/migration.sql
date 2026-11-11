-- Foto del recibo físico firmado, como respaldo del pago de nómina.
--
-- Deliberadamente NO hay lectura automática del monto: el importe sigue
-- saliendo del cálculo de nómina y esta foto solo prueba que el pago se
-- entregó y se firmó. Interpretar un número manuscrito y usarlo como cifra
-- contable sería introducir un error que nadie revisaría.
--
-- Migración aditiva: los pagos existentes quedan sin recibo adjunto, que es
-- lo correcto — se cargaron antes de que esto existiera.

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "receiptPhotoUrl"      TEXT,
  ADD COLUMN IF NOT EXISTS "receiptPhotoPublicId" TEXT,
  -- Fecha en hora de Bolivia, no del servidor: cerca de medianoche difieren
  -- en un día y el recibo quedaría fechado mal.
  ADD COLUMN IF NOT EXISTS "receiptUploadedOn"    DATE,
  ADD COLUMN IF NOT EXISTS "receiptUploadedBy"    INTEGER;

-- Permite listar de un vistazo los pagos que todavía no tienen su recibo.
CREATE INDEX IF NOT EXISTS "Payment_receiptUploadedOn_idx"
  ON "Payment"("receiptUploadedOn");
