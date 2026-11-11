# Informe técnico de preparación para producción

> **Documento histórico.** Refleja el estado previo al modelo multiempresa. Lo
> que dice sigue siendo válido para las áreas que describe, pero quedó atrás en
> dos puntos: las pruebas pasaron de 5 a 73, y la boleta ya no se envía por
> correo (se descarga desde el panel y la aplicación). El estado actual del
> aislamiento entre empresas, los planes y las suscripciones está en
> [MULTIEMPRESA.md](MULTIEMPRESA.md).

## Inventario y estado

| Área | Estado | Decisión |
|---|---|---|
| Auth JWT/bcrypt | Activa | Conservada; secreto validado al iniciar y rate limit específico de login. |
| Usuarios, roles y horarios | Activa | Conservada; contraseñas dummy sustituidas por valores aleatorios para empleados. |
| Asistencia y sesiones | Activa | Conservada; lectura propia para empleados y escritura administrativa. |
| Horas extra, descuentos y compensaciones | Activa | Conservada sin cambios de reglas financieras. |
| Cálculo, pagos e historial | Activa | Conservada; conflicto concurrente de pago duplicado responde 409. |
| PDFKit | Activo | Conservado; producción sube a Cloudinary y elimina el temporal. |
| Nodemailer | Activo | Conservado; `EMAIL_FROM` normalizado y fallos persistidos sin perder pagos. |
| Auditoría | Activa | Ampliada a altas, ediciones, bajas lógicas y asistencia. |
| Prisma/migraciones | Activo | Conservado; Railway aplica migraciones antes de arrancar. |
| Nginx/Docker Compose | Activo local | Conservado exclusivamente para desarrollo; no participa en producción. |
| `src/lib/business-rules.js` | Duplicado heredado | Conservado por cautela, pero las pruebas ahora importan servicios productivos. Puede eliminarse en una limpieza posterior. |
| `backend/receipts/*.pdf` | Artefactos locales | No son código. Se conservaron; pueden archivarse fuera del repositorio tras respaldo. |

## Problemas encontrados y soluciones

- No existía configuración Vercel ni URL pública inyectable. Se añadió build estático con `VITE_API_URL`, `vercel.json`, fallback SPA y cabeceras de seguridad.
- Railway no tenía build, migraciones o healthcheck declarados. Se añadió `railway.json`, Node 20 y scripts reproducibles.
- Los comprobantes dependían del disco local. Se añadió Cloudinary, persistencia de URL, descarga proxy y limpieza del temporal.
- La configuración usaba `SMTP_FROM`; ahora acepta el contrato `EMAIL_FROM` y mantiene compatibilidad transitoria.
- CORS tenía fallback local dentro del servidor. Producción exige una lista explícita; lo local queda en Compose.
- Faltaban Helmet, rate limiting, límite JSON, confianza de proxy y cierre ordenado de Prisma.
- Seeds incluían credenciales débiles y correos personales. Ahora requieren una contraseña externa y usan dominios de ejemplo.
- Los empleados podían entrar pero las lecturas del dashboard devolvían 403. Ahora `GET /users`, asistencia e historial limitan datos por identidad; las operaciones administrativas siguen protegidas.
- Los mensajes toast insertaban texto como HTML. Ahora usan `textContent`.

## Sincronización frontend ↔ API

Se verificó correspondencia para login/perfil, usuarios, asistencia, sesiones, justificaciones, cálculo, pago, historial, descarga PDF, reporte mensual, horas extra, descuentos, compensaciones y auditoría. No se detectaron endpoints sin representación funcional. La API de healthcheck es operativa y deliberadamente no tiene pantalla.

## Elementos no eliminados

No se eliminó ningún archivo heredado. Los candidatos de limpieza son el helper duplicado de reglas, PDFs generados y seeds de datos de demostración. Eliminarlos requiere una decisión separada porque pueden servir como evidencia o datos de prueba.

## Pruebas

- Sintaxis backend: 26 archivos.
- Pruebas unitarias: 5/5 sobre servicios productivos.
- Sintaxis frontend: 11 archivos.
- Build Vercel: correcto con una URL HTTPS de prueba.
- Prisma Client: generación correcta.

La validación final contra servicios reales exige credenciales y URLs de las cuentas del propietario. No se incluyen secretos ni datos de producción en este informe.
