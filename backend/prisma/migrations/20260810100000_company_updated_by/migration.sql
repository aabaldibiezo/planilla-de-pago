-- Registra quién modificó por última vez una empresa.
--
-- El resto de las entidades mutables del esquema (Worksite, ScheduleBlock,
-- Attendance, AttendanceSession) ya llevan el par createdBy/updatedBy; Company
-- se creó solo con createdBy y quedó fuera de la convención. Sin esta columna,
-- `platform.service` no puede dejar constancia de quién cambió el plan o
-- registró un cobro más allá de la auditoría.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER;
