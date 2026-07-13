-- Additive migration: existing User, Attendance and Payment rows remain intact.
CREATE TYPE "ScheduleType" AS ENUM ('FULL_TIME','FLEXIBLE','SPECIFIC_DAYS');
CREATE TYPE "WorkflowStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
CREATE TYPE "JustificationStatus" AS ENUM ('PENDING','JUSTIFIED','REJECTED');
CREATE TYPE "OvertimePaymentMode" AS ENUM ('SAME_RATE','LOWER_RATE','HIGHER_RATE','MULTIPLIER','FIXED_AMOUNT','TIME_OFF','UNPAID');
CREATE TYPE "DiscountType" AS ENUM ('UNJUSTIFIED_DELAY','SALARY_ADVANCE','COMPANY_DAMAGE','LOAN','UNJUSTIFIED_ABSENCE','OTHER');
CREATE TYPE "PaymentDetailType" AS ENUM ('INCOME','DISCOUNT','INFORMATION');
CREATE TYPE "CompensationStatus" AS ENUM ('AVAILABLE','PARTIALLY_USED','USED','CANCELLED');
ALTER TABLE "User" ADD COLUMN "scheduleType" "ScheduleType" NOT NULL DEFAULT 'FULL_TIME';
ALTER TABLE "Attendance" ADD COLUMN "createdBy" INTEGER, ADD COLUMN "updatedBy" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "totalIncome" DECIMAL(65,30) NOT NULL DEFAULT 0,
 ADD COLUMN "totalDiscounts" DECIMAL(65,30) NOT NULL DEFAULT 0,
 ADD COLUMN "overtimeAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
 ADD COLUMN "justifiedDelayMinutes" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "createdBy" INTEGER, ADD COLUMN "updatedBy" INTEGER,
 ADD COLUMN "pdfGeneratedAt" TIMESTAMP(3), ADD COLUMN "emailError" TEXT,
 ADD COLUMN "emailRetryRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ScheduleBlock" ("id" SERIAL PRIMARY KEY,"userId" INTEGER NOT NULL,"dayOfWeek" INTEGER NOT NULL,"startTime" TEXT NOT NULL,"endTime" TEXT NOT NULL,"blockOrder" INTEGER NOT NULL DEFAULT 1,"crossesMidnight" BOOLEAN NOT NULL DEFAULT false,"isActive" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,"createdBy" INTEGER,"updatedBy" INTEGER,CONSTRAINT "ScheduleBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id"));
CREATE UNIQUE INDEX "ScheduleBlock_userId_dayOfWeek_startTime_endTime_key" ON "ScheduleBlock"("userId","dayOfWeek","startTime","endTime");
CREATE INDEX "ScheduleBlock_userId_dayOfWeek_isActive_idx" ON "ScheduleBlock"("userId","dayOfWeek","isActive");

CREATE TABLE "AttendanceSession" ("id" SERIAL PRIMARY KEY,"userId" INTEGER NOT NULL,"attendanceId" INTEGER,"scheduleBlockId" INTEGER,"workDate" DATE NOT NULL,"clockIn" TIMESTAMP(3) NOT NULL,"clockOut" TIMESTAMP(3),"workedMinutes" INTEGER NOT NULL DEFAULT 0,"delayMinutes" INTEGER NOT NULL DEFAULT 0,"earlyDepartureMinutes" INTEGER NOT NULL DEFAULT 0,"justificationStatus" "JustificationStatus" NOT NULL DEFAULT 'PENDING',"justificationReason" TEXT,"justificationNotes" TEXT,"justificationRequestedAt" TIMESTAMP(3),"justificationCreatedBy" INTEGER,"justificationReviewedBy" INTEGER,"justificationReviewedAt" TIMESTAMP(3),"decisionReason" TEXT,"createdBy" INTEGER,"updatedBy" INTEGER,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "AttendanceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id"),CONSTRAINT "AttendanceSession_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id"));
CREATE INDEX "AttendanceSession_userId_workDate_idx" ON "AttendanceSession"("userId","workDate");

CREATE TABLE "Overtime" ("id" SERIAL PRIMARY KEY,"userId" INTEGER NOT NULL,"workDate" DATE NOT NULL,"startTime" TEXT NOT NULL,"endTime" TEXT NOT NULL,"hours" DECIMAL(65,30) NOT NULL,"reason" TEXT NOT NULL,"status" "WorkflowStatus" NOT NULL DEFAULT 'PENDING',"paymentMode" "OvertimePaymentMode" NOT NULL,"hourlyRateSnapshot" DECIMAL(65,30) NOT NULL DEFAULT 0,"multiplier" DECIMAL(65,30) NOT NULL DEFAULT 1,"fixedAmount" DECIMAL(65,30),"calculatedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,"notes" TEXT,"requestedBy" INTEGER NOT NULL,"approvedBy" INTEGER,"approvedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Overtime_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id"));
CREATE INDEX "Overtime_userId_workDate_status_idx" ON "Overtime"("userId","workDate","status");

CREATE TABLE "TimeCompensation" ("id" SERIAL PRIMARY KEY,"userId" INTEGER NOT NULL,"overtimeId" INTEGER,"generatedHours" DECIMAL(65,30) NOT NULL,"usedHours" DECIMAL(65,30) NOT NULL DEFAULT 0,"remainingHours" DECIMAL(65,30) NOT NULL,"generatedAt" TIMESTAMP(3) NOT NULL,"usedAt" TIMESTAMP(3),"reason" TEXT NOT NULL,"authorizedBy" INTEGER NOT NULL,"notes" TEXT,"status" "CompensationStatus" NOT NULL DEFAULT 'AVAILABLE',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "TimeCompensation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id"),CONSTRAINT "TimeCompensation_overtimeId_fkey" FOREIGN KEY ("overtimeId") REFERENCES "Overtime"("id"));
CREATE INDEX "TimeCompensation_userId_status_idx" ON "TimeCompensation"("userId","status");

CREATE TABLE "Discount" ("id" SERIAL PRIMARY KEY,"userId" INTEGER NOT NULL,"type" "DiscountType" NOT NULL,"amount" DECIMAL(65,30) NOT NULL,"discountDate" DATE NOT NULL,"description" TEXT NOT NULL,"status" "WorkflowStatus" NOT NULL DEFAULT 'PENDING',"createdBy" INTEGER NOT NULL,"approvedBy" INTEGER,"approvedAt" TIMESTAMP(3),"notes" TEXT,"documentReference" TEXT,"paymentId" INTEGER,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Discount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id"),CONSTRAINT "Discount_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id"));
CREATE INDEX "Discount_userId_discountDate_status_idx" ON "Discount"("userId","discountDate","status");

CREATE TABLE "PaymentDetail" ("id" SERIAL PRIMARY KEY,"paymentId" INTEGER NOT NULL,"type" "PaymentDetailType" NOT NULL,"code" TEXT NOT NULL,"description" TEXT NOT NULL,"quantity" DECIMAL(65,30),"rate" DECIMAL(65,30),"amount" DECIMAL(65,30) NOT NULL,"overtimeId" INTEGER,"discountId" INTEGER,"compensationId" INTEGER,"metadata" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "PaymentDetail_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE,CONSTRAINT "PaymentDetail_overtimeId_fkey" FOREIGN KEY ("overtimeId") REFERENCES "Overtime"("id"),CONSTRAINT "PaymentDetail_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id"),CONSTRAINT "PaymentDetail_compensationId_fkey" FOREIGN KEY ("compensationId") REFERENCES "TimeCompensation"("id"));
CREATE INDEX "PaymentDetail_paymentId_type_idx" ON "PaymentDetail"("paymentId","type");

CREATE TABLE "AuditLog" ("id" BIGSERIAL PRIMARY KEY,"actorId" INTEGER,"action" TEXT NOT NULL,"entity" TEXT NOT NULL,"entityId" TEXT NOT NULL,"employeeId" INTEGER,"reason" TEXT,"previousData" JSONB,"newData" JSONB,"ipAddress" TEXT,"userAgent" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id"));
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt"); CREATE INDEX "AuditLog_actorId_entity_action_idx" ON "AuditLog"("actorId","entity","action"); CREATE INDEX "AuditLog_employeeId_idx" ON "AuditLog"("employeeId");

-- Preserve legacy attendance by creating one traceable session per old row.
INSERT INTO "AttendanceSession" ("userId","attendanceId","workDate","clockIn","clockOut","workedMinutes","delayMinutes","createdAt","updatedAt")
SELECT a."userId",a.id,a.date,a.date + a."actualEntry"::time,CASE WHEN a."actualExit" IS NULL THEN NULL WHEN a."actualExit"::time < a."actualEntry"::time THEN a.date + a."actualExit"::time + interval '1 day' ELSE a.date + a."actualExit"::time END,ROUND(a."hoursWorked" * 60),a."delayMinutes",a."createdAt",a."updatedAt" FROM "Attendance" a
WHERE NOT EXISTS (SELECT 1 FROM "AttendanceSession" s WHERE s."attendanceId"=a.id);
