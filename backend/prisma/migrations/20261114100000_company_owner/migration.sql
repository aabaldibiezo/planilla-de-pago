-- Gerente general (dueño) de cada empresa.
ALTER TABLE "User" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;

-- En las empresas que ya existen, el dueño es el primer administrador creado.
UPDATE "User" u
SET "isOwner" = true
WHERE u."id" IN (
  SELECT DISTINCT ON ("companyId") "id"
  FROM "User"
  WHERE "role" = 'ADMIN' AND "companyId" IS NOT NULL
  ORDER BY "companyId", "createdAt" ASC, "id" ASC
);
