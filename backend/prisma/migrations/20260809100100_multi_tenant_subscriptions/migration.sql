-- Convierte el sistema de un solo inquilino a multiempresa y agrega el modelo
-- de suscripción de la plataforma.
--
-- Requiere que `20260809100000_add_super_admin_role` se haya aplicado antes:
-- la restricción CHECK del final menciona el literal 'SUPER_ADMIN', y Postgres
-- no permite usar un valor de enum recién creado en la misma transacción.
--
-- ⚠️ Todo el dinero de esta migración está en DÓLARES (USD). Los sueldos y
-- boletas del resto del sistema siguen en bolivianos. Son dos monedas para dos
-- propósitos distintos y no se convierten entre sí.
--
-- Migración aditiva con relleno: los datos existentes se asignan a una empresa
-- por defecto, de modo que la instalación actual sigue funcionando sin pérdida.

-- --------------------------------------------------------------------
-- 1. Estado de suscripción
-- --------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'READ_ONLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------
-- 2. Tablas de plataforma
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Plan" (
  "id"              SERIAL          NOT NULL,
  "code"            TEXT            NOT NULL,
  "name"            TEXT            NOT NULL,
  -- NULL = ilimitado (plan Empresarial).
  "maxEmployees"    INTEGER,
  "monthlyPriceUsd" DECIMAL(10,2)   NOT NULL,
  "isActive"        BOOLEAN         NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)    NOT NULL,
  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Plan_code_key" ON "Plan"("code");

CREATE TABLE IF NOT EXISTS "Company" (
  "id"              SERIAL          NOT NULL,
  "name"            TEXT            NOT NULL,
  "taxId"           TEXT,
  "contactEmail"    TEXT            NOT NULL,
  "contactPhone"    TEXT,
  "planId"          INTEGER         NOT NULL,
  "status"          "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
  "nextDueDate"     DATE            NOT NULL,
  -- Vencimiento para el que ya se envió el aviso previo; evita repetirlo en
  -- cada petición sin necesidad de un planificador de tareas.
  "reminderSentFor" DATE,
  "isActive"        BOOLEAN         NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)    NOT NULL,
  "createdBy"       INTEGER,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Company_status_nextDueDate_idx"
  ON "Company"("status", "nextDueDate");

CREATE TABLE IF NOT EXISTS "SubscriptionPayment" (
  "id"                   SERIAL        NOT NULL,
  "companyId"            INTEGER       NOT NULL,
  "amountUsd"            DECIMAL(10,2) NOT NULL,
  "paidAt"               TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "periodMonth"          INTEGER       NOT NULL,
  "periodYear"           INTEGER       NOT NULL,
  -- Instantánea del plan al momento del cobro: cambiar el precio mañana no
  -- debe reescribir lo que realmente se cobró ayer.
  "planNameSnapshot"     TEXT          NOT NULL,
  "planPriceUsdSnapshot" DECIMAL(10,2) NOT NULL,
  "recordedBy"           INTEGER       NOT NULL,
  "notes"                TEXT,
  "createdAt"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- Un mismo mes no puede cobrarse dos veces a la misma empresa.
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_companyId_periodYear_periodMonth_key"
  ON "SubscriptionPayment"("companyId", "periodYear", "periodMonth");

CREATE INDEX IF NOT EXISTS "SubscriptionPayment_companyId_paidAt_idx"
  ON "SubscriptionPayment"("companyId", "paidAt");

DO $$ BEGIN
  ALTER TABLE "Company"
    ADD CONSTRAINT "Company_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "Plan"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SubscriptionPayment"
    ADD CONSTRAINT "SubscriptionPayment_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------
-- 3. Planes iniciales
--
-- Deben existir antes del relleno: `Company.planId` es NOT NULL. Los precios
-- y límites son editables después desde el panel de súper administrador, por
-- eso se insertan sin pisar valores ya existentes.
-- --------------------------------------------------------------------

INSERT INTO "Plan" ("code", "name", "maxEmployees", "monthlyPriceUsd", "updatedAt")
VALUES
  ('ESENCIAL',    'Esencial',    10,   25.00, CURRENT_TIMESTAMP),
  ('PROFESIONAL', 'Profesional', 30,   45.00, CURRENT_TIMESTAMP),
  ('EMPRESARIAL', 'Empresarial', NULL, 55.00, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- --------------------------------------------------------------------
-- 4. Vínculo de las entidades operativas con su empresa
-- --------------------------------------------------------------------

ALTER TABLE "User"     ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "Worksite" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

-- --------------------------------------------------------------------
-- 5. Relleno de los datos existentes
--
-- Todo lo que hay hoy pertenece a una sola empresa, porque hasta ahora el
-- sistema era de un solo inquilino. Se crea esa empresa y se le asigna todo.
-- Si la base está vacía no se crea nada.
-- --------------------------------------------------------------------

INSERT INTO "Company" ("name", "contactEmail", "planId", "status", "nextDueDate", "updatedAt")
SELECT
  'Limpieza Mendoza',
  'administracion@limpiezamendoza.bo',
  p."id",
  'ACTIVE',
  (CURRENT_DATE + INTERVAL '1 month')::date,
  CURRENT_TIMESTAMP
FROM "Plan" p
WHERE p."code" = 'PROFESIONAL'
  AND NOT EXISTS (SELECT 1 FROM "Company")
  AND (
    EXISTS (SELECT 1 FROM "User" WHERE "role" <> 'SUPER_ADMIN')
    OR EXISTS (SELECT 1 FROM "Worksite")
  );

UPDATE "User"
  SET "companyId" = (SELECT "id" FROM "Company" ORDER BY "id" LIMIT 1)
  WHERE "companyId" IS NULL AND "role" <> 'SUPER_ADMIN';

UPDATE "Worksite"
  SET "companyId" = (SELECT "id" FROM "Company" ORDER BY "id" LIMIT 1)
  WHERE "companyId" IS NULL;

UPDATE "AuditLog"
  SET "companyId" = (SELECT "id" FROM "Company" ORDER BY "id" LIMIT 1)
  WHERE "companyId" IS NULL;

-- --------------------------------------------------------------------
-- 6. Endurecimiento
--
-- `Worksite.companyId` pasa a NOT NULL: una sede sin empresa no podría
-- acotarse y quedaría visible para cualquiera.
-- --------------------------------------------------------------------

ALTER TABLE "Worksite" ALTER COLUMN "companyId" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "User"
    ADD CONSTRAINT "User_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Worksite"
    ADD CONSTRAINT "Worksite_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------
-- 7. Índices acotados por empresa
--
-- Los índices anteriores no llevaban la empresa al frente, así que dejaban de
-- servir en cuanto toda consulta pasa a filtrar por ella.
-- --------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "User_companyId_role_isActive_idx"
  ON "User"("companyId", "role", "isActive");

DROP INDEX IF EXISTS "Worksite_isActive_idx";
CREATE INDEX IF NOT EXISTS "Worksite_companyId_isActive_idx"
  ON "Worksite"("companyId", "isActive");

DROP INDEX IF EXISTS "AuditLog_createdAt_idx";
CREATE INDEX IF NOT EXISTS "AuditLog_companyId_createdAt_idx"
  ON "AuditLog"("companyId", "createdAt");

-- --------------------------------------------------------------------
-- 8. Garantía de fondo
--
-- La correspondencia entre rol y empresa es la base de todo el aislamiento:
-- un ADMIN huérfano sería invisible para cualquier filtro por empresa, y un
-- SUPER_ADMIN atado a una empresa podría alcanzar datos operativos. Prisma no
-- modela restricciones CHECK, así que va escrita a mano.
-- --------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "User"
    ADD CONSTRAINT "user_company_scope" CHECK (
      ("role" =  'SUPER_ADMIN' AND "companyId" IS NULL)
      OR
      ("role" <> 'SUPER_ADMIN' AND "companyId" IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
