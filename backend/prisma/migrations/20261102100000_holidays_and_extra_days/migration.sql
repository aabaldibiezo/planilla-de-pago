-- Feriados propios de cada empresa y pago de días extra.
--
-- El cliente paga sueldo fijo por contrato. Si se llama a alguien un domingo
-- de descanso o un feriado, ese día se paga aparte a fin de mes. Los feriados
-- nacionales se calculan en el código; esta tabla guarda solo los que agrega
-- cada empresa (departamentales o decretados).
--
-- Migración aditiva: no toca datos existentes.

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "extraDayFactor" DECIMAL(4,2) NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS "Holiday" (
    "id"        SERIAL       NOT NULL,
    "companyId" INTEGER      NOT NULL,
    "date"      DATE         NOT NULL,
    "name"      TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Holiday_companyId_fkey" FOREIGN KEY ("companyId")
      REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Holiday_companyId_date_key" ON "Holiday"("companyId", "date");
