-- Estado de resultados mensual de la empresa cliente.
--
-- ⚠️ Los montos de estas tablas están en BOLIVIANOS, como la nómina y los
-- contratos. No confundir con `Plan.monthlyPriceUsd` ni
-- `SubscriptionPayment.amountUsd`, que son la suscripción a la plataforma.
--
-- Acá SOLO se guarda lo que se carga a mano. Los ingresos por servicios se
-- derivan de los contratos y los salarios de la nómina: no hay tabla de
-- "estado del mes" porque una foto guardada quedaría vieja apenas se
-- confirmara un pago de nómina, y el pedido exige que se recalcule siempre.
--
-- Migración aditiva. El único relleno es sembrar las categorías predefinidas
-- para las empresas que ya existen.

-- --------------------------------------------------------------------
-- 1. Tipos
-- --------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "StaffCategory" AS ENUM ('OPERATIVO', 'ADMINISTRATIVO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExpenseKind" AS ENUM ('OPERATING', 'FINANCIAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EntryType" AS ENUM ('OTHER_INCOME', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------
-- 2. Clasificación contable del personal
--
-- Los empleados existentes quedan como OPERATIVO, que es lo correcto: son
-- personal de limpieza. El administrativo se marca a mano desde el panel.
-- --------------------------------------------------------------------

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "staffCategory" "StaffCategory" NOT NULL DEFAULT 'OPERATIVO';

-- --------------------------------------------------------------------
-- 3. Tablas
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ExpenseCategory" (
  "id"        SERIAL        NOT NULL,
  "companyId" INTEGER       NOT NULL,
  "name"      TEXT          NOT NULL,
  "kind"      "ExpenseKind" NOT NULL DEFAULT 'OPERATING',
  "isSystem"  BOOLEAN       NOT NULL DEFAULT false,
  "isActive"  BOOLEAN       NOT NULL DEFAULT true,
  "sortOrder" INTEGER       NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)  NOT NULL,
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- Dos categorías con el mismo nombre en una empresa harían ambiguo dónde
-- imputar un gasto.
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseCategory_companyId_name_key"
  ON "ExpenseCategory"("companyId", "name");

CREATE INDEX IF NOT EXISTS "ExpenseCategory_companyId_isActive_idx"
  ON "ExpenseCategory"("companyId", "isActive");

CREATE TABLE IF NOT EXISTS "StatementEntry" (
  "id"          SERIAL        NOT NULL,
  "companyId"   INTEGER       NOT NULL,
  "month"       INTEGER       NOT NULL,
  "year"        INTEGER       NOT NULL,
  "type"        "EntryType"   NOT NULL,
  "categoryId"  INTEGER,
  "description" TEXT          NOT NULL,
  "amount"      DECIMAL(12,2) NOT NULL,
  "occurredOn"  DATE,
  "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"   INTEGER,
  CONSTRAINT "StatementEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StatementEntry_companyId_year_month_idx"
  ON "StatementEntry"("companyId", "year", "month");

CREATE INDEX IF NOT EXISTS "StatementEntry_categoryId_idx"
  ON "StatementEntry"("categoryId");

-- --------------------------------------------------------------------
-- 4. Claves foráneas
--
-- La categoría usa RESTRICT: borrarla con gastos imputados dejaría líneas
-- huérfanas en meses ya cerrados. La baja de una categoría es lógica.
-- --------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "ExpenseCategory"
    ADD CONSTRAINT "ExpenseCategory_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StatementEntry"
    ADD CONSTRAINT "StatementEntry_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StatementEntry"
    ADD CONSTRAINT "StatementEntry_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------
-- 5. Categorías predefinidas para las empresas que ya existen
--
-- Se siembran POR EMPRESA y no como catálogo global: así una empresa puede
-- renombrar "insumos" o desactivar "combustible" sin afectar a las demás.
--
-- Las empresas nuevas las reciben en `platform.service.createCompany`.
-- --------------------------------------------------------------------

INSERT INTO "ExpenseCategory" ("companyId", "name", "kind", "isSystem", "sortOrder", "updatedAt")
SELECT c."id", p."name", p."kind"::"ExpenseKind", true, p."orden", CURRENT_TIMESTAMP
FROM "Company" c
CROSS JOIN (VALUES
  ('Luz',                          'OPERATING', 10),
  ('Agua',                         'OPERATING', 20),
  ('Alquiler',                     'OPERATING', 30),
  ('Internet',                     'OPERATING', 40),
  ('Teléfono',                     'OPERATING', 50),
  ('Contador',                     'OPERATING', 60),
  ('Impuestos',                    'OPERATING', 70),
  ('Insumos de limpieza',          'OPERATING', 80),
  ('Combustible',                  'OPERATING', 90),
  ('Pasajes y transporte',         'OPERATING', 100),
  ('Mantenimiento y reparaciones', 'OPERATING', 110),
  ('Seguros',                      'OPERATING', 120),
  ('Imprevistos',                  'OPERATING', 130),
  ('Intereses de préstamo',        'FINANCIAL', 200),
  ('Comisiones bancarias',         'FINANCIAL', 210)
) AS p("name", "kind", "orden")
ON CONFLICT ("companyId", "name") DO NOTHING;
