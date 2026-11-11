-- Clientes de la empresa de limpieza, sus contratos y el historial de montos.
--
-- Es la "Fase 4" que la migración inicial anticipó: `Worksite.contractId` ya
-- existía como columna suelta, reservada justamente para esto, así que el
-- vínculo sede↔contrato es solo agregar la clave foránea.
--
-- ⚠️ Los montos de estas tablas están en BOLIVIANOS, como los sueldos y las
-- boletas. No confundir con `Plan.monthlyPriceUsd` ni
-- `SubscriptionPayment.amountUsd`, que son la suscripción a la plataforma y
-- están en dólares. Por eso aquellos llevan sufijo `Usd` y estos no.
--
-- Migración aditiva y sin relleno: no hay datos que convertir.

-- --------------------------------------------------------------------
-- 1. Modalidad de cobro
--
-- Se define por contrato y no por cliente: un mismo cliente puede pagar un
-- servicio por adelantado y otro a mes vencido.
-- --------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "PaymentTerms" AS ENUM ('ANTICIPADO', 'POSTERIOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------
-- 2. Tablas
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Client" (
  "id"           SERIAL       NOT NULL,
  "companyId"    INTEGER      NOT NULL,
  "name"         TEXT         NOT NULL,
  "taxId"        TEXT,
  "contactName"  TEXT,
  "contactPhone" TEXT,
  "contactEmail" TEXT,
  "notes"        TEXT,
  "isActive"     BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "createdBy"    INTEGER,
  "updatedBy"    INTEGER,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Client_companyId_isActive_idx"
  ON "Client"("companyId", "isActive");

CREATE TABLE IF NOT EXISTS "Contract" (
  "id"           SERIAL         NOT NULL,
  "clientId"     INTEGER        NOT NULL,
  "name"         TEXT           NOT NULL,
  "reference"    TEXT,
  "paymentTerms" "PaymentTerms" NOT NULL,
  "startDate"    DATE,
  "endDate"      DATE,
  "isActive"     BOOLEAN        NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)   NOT NULL,
  "createdBy"    INTEGER,
  "updatedBy"    INTEGER,
  CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Contract_clientId_isActive_idx"
  ON "Contract"("clientId", "isActive");

CREATE TABLE IF NOT EXISTS "ContractRate" (
  "id"         SERIAL        NOT NULL,
  "contractId" INTEGER       NOT NULL,
  -- Monto mensual en bolivianos.
  "amount"     DECIMAL(12,2) NOT NULL,
  "validFrom"  DATE          NOT NULL,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"  INTEGER,
  CONSTRAINT "ContractRate_pkey" PRIMARY KEY ("id")
);

-- Dos montos con la misma fecha de vigencia dejarían indefinido cuál rige.
CREATE UNIQUE INDEX IF NOT EXISTS "ContractRate_contractId_validFrom_key"
  ON "ContractRate"("contractId", "validFrom");

CREATE INDEX IF NOT EXISTS "ContractRate_contractId_validFrom_idx"
  ON "ContractRate"("contractId", "validFrom");

-- --------------------------------------------------------------------
-- 3. Claves foráneas
--
-- RESTRICT en todas: un cliente con contratos, o un contrato con montos o
-- sedes, no debe poder borrarse por accidente. La baja es lógica (`isActive`).
-- --------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "Client"
    ADD CONSTRAINT "Client_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Contract"
    ADD CONSTRAINT "Contract_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContractRate"
    ADD CONSTRAINT "ContractRate_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------
-- 4. La sede cuelga de su contrato
--
-- La columna ya existía desde la migración inicial; solo faltaba la clave.
-- Queda nullable: una sede puede cargarse antes que su contrato, o no tener
-- ninguno (una oficina propia de la empresa).
--
-- SET NULL al borrar: si algún día se elimina un contrato, la sede sobrevive
-- sin él en vez de arrastrar la asistencia histórica que cuelga de ella.
-- --------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "Worksite"
    ADD CONSTRAINT "Worksite_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Worksite_contractId_idx" ON "Worksite"("contractId");
