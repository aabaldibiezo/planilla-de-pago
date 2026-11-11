-- Temporales cargados antes de que existiera el pago por día.
--
-- Tenían un sueldo mensual y ningún pago por día; sin esto su nómina pasaría
-- a cero. Se toma sueldo ÷ 30 como punto de partida, que el administrador
-- debe revisar en la ficha de cada uno. Solo toca a quien todavía no tiene
-- pago por día, así que volver a correrla no pisa lo que ya se haya ajustado.

UPDATE "User"
SET "dailyWage"  = ROUND("monthlySalary" / 30, 2),
    "hourlyRate" = ROUND("monthlySalary" / 30 / 8, 2)
WHERE "employeeType" = 'TEMPORAL'
  AND "dailyWage" = 0
  AND "monthlySalary" > 0;
