-- Agrega el rol SUPER_ADMIN, que administra la plataforma (empresas, planes y
-- cobros) y no pertenece a ninguna empresa cliente.
--
-- ⚠️ Esta migración contiene UNA SOLA sentencia a propósito, y va separada de
-- `20260809100100_multi_tenant_subscriptions`.
--
-- Postgres permite `ALTER TYPE ... ADD VALUE` dentro de una transacción, pero
-- prohíbe USAR el valor nuevo en esa misma transacción (error 55P04, "unsafe
-- use of new value of enum type"). Prisma envuelve cada migración en una
-- transacción, y la migración siguiente define una restricción CHECK que
-- menciona el literal 'SUPER_ADMIN'. Juntas en un solo archivo, fallan.
--
-- No fusionar estas dos migraciones.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
