# Despliegue de producción

La arquitectura objetivo es Vercel (frontend), Railway (API), Neon (PostgreSQL), Cloudinary (boletas PDF) y un proveedor SMTP. Docker Compose y Nginx quedan únicamente para desarrollo local.

## 1. Neon

1. Crear un proyecto PostgreSQL y copiar la URL **pooled**.
2. Añadir `sslmode=require&connection_limit=5` a `DATABASE_URL` si Neon no los incluye.
3. No ejecutar `prisma db push`. Railway ejecuta `prisma migrate deploy` antes de cada despliegue.
4. Para una base vacía, ejecutar el seed solo de forma explícita con `ADMIN_SEED_EMAIL` y `ADMIN_SEED_PASSWORD` temporales: `npm run seed`.

Para migrar datos existentes, exportar la base local con `pg_dump --format=custom` y restaurar sobre Neon con `pg_restore --clean --if-exists --no-owner`. Hacer primero un respaldo y validar recuentos por tabla. Este repositorio no incluye un volcado con datos personales.

## 2. Cloudinary

Crear credenciales restringidas al entorno de producción. El backend sube cada boleta como recurso `raw` bajo `planilla/boletas/<año>/<mes>/`, guarda la URL HTTPS en `Payment.pdfPath`, adjunta el archivo al correo y elimina la copia temporal del contenedor.

## 3. Railway

Crear un servicio desde este repositorio con **Root Directory** `backend`. `railway.json` configura build, migraciones, start, healthcheck y reinicios. Cargar todas las variables de [backend/.env.example](backend/.env.example), usando la URL de Neon y el dominio definitivo de Vercel en `CORS_ORIGINS`.

No ejecutar seeds automáticamente. El healthcheck esperado es `GET /api/health` con estado 200.

## 4. Vercel

Crear un proyecto con **Root Directory** `frontend`. Cargar `VITE_API_URL` con el dominio HTTPS de Railway, sin `/api` final. `vercel.json` ejecuta el build, publica `dist`, conserva los assets y aplica fallback de SPA.

Cuando Vercel asigne el dominio final, actualizar `CORS_ORIGINS` en Railway y redesplegar la API. Se admiten varios orígenes separados por comas para previews autorizadas.

## 5. SMTP

Configurar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` y `SMTP_REJECT_UNAUTHORIZED`. Puerto 465 activa TLS directo; 587 usa STARTTLS. Si el envío falla, el pago y su PDF se conservan, y quedan `emailError` y `emailRetryRequired=true` para trazabilidad.

## Verificación posterior

1. Comprobar healthcheck y login de administrador.
2. Crear y editar un empleado con horario.
3. Registrar entrada/salida y justificar o rechazar retrasos.
4. Registrar/aprobar horas extra y descuentos.
5. Calcular y confirmar una nómina de prueba no duplicada.
6. Verificar `Payment.pdfPath` HTTPS, descarga PDF, recepción SMTP y auditoría.
7. Confirmar historial desde frontend y revisar logs de Railway sin secretos.

Nunca compartir ni versionar los valores reales de `.env`.
