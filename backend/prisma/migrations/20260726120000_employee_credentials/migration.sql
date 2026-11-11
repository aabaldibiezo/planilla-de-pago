-- Credenciales de empleado: habilita el inicio de sesión propio y la app móvil.
-- Migración aditiva: las filas existentes conservan sus valores y quedan con
-- mustChangePassword = false, de modo que ningún administrador actual se ve forzado
-- a cambiar su contraseña por este despliegue.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "passwordSetAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "credentialsSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "credentialsError" TEXT;
