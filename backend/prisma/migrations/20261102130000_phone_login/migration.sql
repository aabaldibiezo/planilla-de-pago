-- El celular pasa a servir para entrar a la aplicación, igual que el correo.
--
-- Primero se normaliza lo cargado (solo dígitos, sin el 591 de Bolivia) para
-- que el índice único compare números y no formatos. Si dos personas tenían el
-- mismo número, la migración falla a propósito: hay que decidir a mano a quién
-- pertenece antes de que pueda usarse para entrar.

UPDATE "User"
SET "phone" = NULLIF(regexp_replace("phone", '\D', '', 'g'), '')
WHERE "phone" IS NOT NULL;

UPDATE "User"
SET "phone" = substring("phone" from 4)
WHERE "phone" ~ '^591\d{8}$';

CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");
