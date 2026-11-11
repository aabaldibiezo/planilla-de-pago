-- Pago por día del personal TEMPORAL.
--
-- El temporal cobra por día trabajado (días marcados × pago por día); el FIJO
-- sigue cobrando su sueldo mensual. Aditiva: los existentes quedan en 0.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "dailyWage" DECIMAL(10,2) NOT NULL DEFAULT 0;
