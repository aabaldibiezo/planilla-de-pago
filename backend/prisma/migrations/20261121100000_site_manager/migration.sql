-- Encargado de sede: marca la asistencia de su equipo desde la app.
ALTER TABLE "User" ADD COLUMN "isSiteManager" BOOLEAN NOT NULL DEFAULT false;
