-- Sedes de trabajo, asignaciones rotativas y marcación desde la app móvil.
-- Migración aditiva: las asistencias existentes quedan con locationStatus
-- NOT_REQUIRED y reviewStatus NOT_REQUIRED, es decir, sin cambio de significado.

DO $$ BEGIN
  CREATE TYPE "LocationStatus" AS ENUM ('NOT_REQUIRED','OK','SUSPICIOUS','UNAVAILABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewStatus" AS ENUM ('NOT_REQUIRED','PENDING','APPROVED','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Worksite" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "latitude" DECIMAL(65,30) NOT NULL,
  "longitude" DECIMAL(65,30) NOT NULL,
  "radiusMeters" INTEGER NOT NULL DEFAULT 150,
  "contractId" INTEGER,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" INTEGER,
  "updatedBy" INTEGER
);
CREATE INDEX IF NOT EXISTS "Worksite_isActive_idx" ON "Worksite"("isActive");

CREATE TABLE IF NOT EXISTS "WorksiteAssignment" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "worksiteId" INTEGER NOT NULL,
  "dayOfWeek" INTEGER,
  "specificDate" DATE,
  "startTime" TEXT,
  "endTime" TEXT,
  "validFrom" DATE NOT NULL,
  "validUntil" DATE,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  CONSTRAINT "WorksiteAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id"),
  CONSTRAINT "WorksiteAssignment_worksiteId_fkey" FOREIGN KEY ("worksiteId") REFERENCES "Worksite"("id")
);
CREATE INDEX IF NOT EXISTS "WorksiteAssignment_userId_dayOfWeek_isActive_idx"
  ON "WorksiteAssignment"("userId","dayOfWeek","isActive");
CREATE INDEX IF NOT EXISTS "WorksiteAssignment_userId_specificDate_idx"
  ON "WorksiteAssignment"("userId","specificDate");

ALTER TABLE "AttendanceSession"
  ADD COLUMN IF NOT EXISTS "photoUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "photoPublicId" TEXT,
  ADD COLUMN IF NOT EXISTS "capturedLatitude" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "capturedLongitude" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "gpsAccuracyMeters" INTEGER,
  ADD COLUMN IF NOT EXISTS "distanceMeters" INTEGER,
  ADD COLUMN IF NOT EXISTS "locationStatus" "LocationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS "matchedWorksiteId" INTEGER,
  ADD COLUMN IF NOT EXISTS "deviceInfo" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS "reviewedBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT;

DO $$ BEGIN
  ALTER TABLE "AttendanceSession"
    ADD CONSTRAINT "AttendanceSession_matchedWorksiteId_fkey"
    FOREIGN KEY ("matchedWorksiteId") REFERENCES "Worksite"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índice para la bandeja de revisión del administrador.
CREATE INDEX IF NOT EXISTS "AttendanceSession_locationStatus_reviewStatus_idx"
  ON "AttendanceSession"("locationStatus","reviewStatus");
