-- Geocerco estricto: la salida también se valida y guarda su propia evidencia,
-- y se habilita el registro manual del administrador para cuando el bloqueo
-- dejaría a un empleado sin poder fichar.
--
-- Migración aditiva: las marcaciones existentes conservan sus valores y quedan
-- con clockOutLocationStatus NOT_REQUIRED y registeredManually = false.

ALTER TABLE "AttendanceSession"
  ADD COLUMN IF NOT EXISTS "clockOutPhotoUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "clockOutPhotoPublicId" TEXT,
  ADD COLUMN IF NOT EXISTS "clockOutLatitude" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "clockOutLongitude" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "clockOutAccuracyMeters" INTEGER,
  ADD COLUMN IF NOT EXISTS "clockOutDistanceMeters" INTEGER,
  ADD COLUMN IF NOT EXISTS "clockOutLocationStatus" "LocationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS "registeredManually" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "manualReason" TEXT;
