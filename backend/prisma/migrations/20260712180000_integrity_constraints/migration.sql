-- Strengthen traceability and prevent duplicate time-off compensation.
CREATE UNIQUE INDEX IF NOT EXISTS "TimeCompensation_overtimeId_key" ON "TimeCompensation"("overtimeId");

DO $$ BEGIN
  ALTER TABLE "AttendanceSession"
    ADD CONSTRAINT "AttendanceSession_scheduleBlockId_fkey"
    FOREIGN KEY ("scheduleBlockId") REFERENCES "ScheduleBlock"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
