-- Cobros a clientes y recordatorio de cobro.
--
-- Cada contrato tiene un día de cobro; cada mes cobrado queda registrado con
-- el monto que rigió. Lo que falta cobrar se calcula, no se guarda: ver
-- lib/collections.js. Aditiva: no toca datos existentes.

ALTER TABLE "Contract"
  ADD COLUMN IF NOT EXISTS "billingDay" INTEGER NOT NULL DEFAULT 5;

CREATE TABLE IF NOT EXISTS "ContractCollection" (
    "id"          SERIAL         NOT NULL,
    "contractId"  INTEGER        NOT NULL,
    "month"       INTEGER        NOT NULL,
    "year"        INTEGER        NOT NULL,
    "amount"      DECIMAL(12,2)  NOT NULL,
    "collectedOn" DATE           NOT NULL,
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"   INTEGER,
    CONSTRAINT "ContractCollection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContractCollection_contractId_fkey" FOREIGN KEY ("contractId")
      REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContractCollection_contractId_year_month_key"
  ON "ContractCollection"("contractId", "year", "month");
