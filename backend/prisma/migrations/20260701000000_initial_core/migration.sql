-- Idempotent baseline for clean installations and existing databases created before migrations.
DO $$ BEGIN CREATE TYPE "Role" AS ENUM ('ADMIN','EMPLOYEE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EmployeeType" AS ENUM ('FIJO','TEMPORAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
  "employeeType" "EmployeeType" NOT NULL DEFAULT 'FIJO',
  "monthlySalary" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "monthlyHours" DECIMAL(65,30) NOT NULL DEFAULT 160,
  "hourlyRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "scheduledEntryTime" TEXT NOT NULL DEFAULT '08:00',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "Attendance" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "date" DATE NOT NULL,
  "scheduledEntry" TEXT NOT NULL,
  "actualEntry" TEXT NOT NULL,
  "actualExit" TEXT,
  "hoursWorked" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "delayMinutes" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_userId_date_key" ON "Attendance"("userId","date");

CREATE TABLE IF NOT EXISTS "Payment" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "monthlySalary" DECIMAL(65,30) NOT NULL,
  "hourlyRate" DECIMAL(65,30) NOT NULL,
  "totalHours" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalDelayMinutes" INTEGER NOT NULL DEFAULT 0,
  "delayHours" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "grossPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "netPay" DECIMAL(65,30) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pdfPath" TEXT,
  "emailSent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_userId_month_year_key" ON "Payment"("userId","month","year");
