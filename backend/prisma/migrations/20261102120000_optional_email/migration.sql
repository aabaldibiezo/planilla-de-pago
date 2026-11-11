-- El temporal que trabaja un día no usa la aplicación: lo marca el encargado.
-- Para darlo de alta alcanza con nombre, apellido y pago por día, así que el
-- correo pasa a ser opcional. El índice único se mantiene: Postgres admite
-- varios NULL en él, y quien sí tiene correo lo sigue teniendo único.

ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
