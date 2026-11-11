# Multiempresa, planes y panel de plataforma

Guía de puesta en marcha del modelo de suscripción.

> **Estado en el equipo local (10/08/2026):** aplicado y verificado sobre el
> contenedor Docker `planilla-db`. Las tres migraciones están puestas, los
> planes y la cuenta de súper administrador creados, y los datos previos de
> «Limpieza Mendoza» intactos (33 asistencias, 3 pagos, 3 sedes).
> Respaldo previo en el directorio temporal de la sesión.

## Monedas

Dos monedas, dos propósitos, sin conversión entre ellas:

| Concepto | Moneda | Dónde |
|---|---|---|
| Suscripción a la plataforma | **USD** | `Plan.monthlyPriceUsd`, `SubscriptionPayment.amountUsd` |
| Sueldos, boletas, descuentos | **Bs.** | `User.monthlySalary`, `Payment.netPay`, … |

Los campos en dólares llevan el sufijo `Usd` en el nombre. No existe tipo de
cambio en el sistema y no debe agregarse.

## Planes iniciales

| Código | Nombre | Empleados | Precio |
|---|---|---|---|
| `ESENCIAL` | Esencial | hasta 10 | USD 25,00 /mes |
| `PROFESIONAL` | Profesional | hasta 30 | USD 45,00 /mes |
| `EMPRESARIAL` | Empresarial | ilimitado (`maxEmployees = null`) | USD 55,00 /mes |

Editables desde el panel. El `code` es inmutable: es el identificador al que
apuntan las migraciones y los seeds.

## Puesta en marcha

### 1. Prerrequisito: una base de datos

No hay ningún `.env` en el proyecto. Antes de nada hace falta un PostgreSQL
accesible y un `backend/.env` a partir de [backend/.env.example](backend/.env.example),
con al menos `DATABASE_URL` y `JWT_SECRET` (32 caracteres aleatorios como mínimo).

### 2. Respaldo, si ya hay datos

```bash
pg_dump --format=custom "$DATABASE_URL" > respaldo-antes-multiempresa-$(date +%F).dump
```

Las migraciones no traen `down`: este archivo es la vía de vuelta real.

### 3. Aplicar las migraciones

```bash
cd backend
npx prisma migrate deploy
```

Se aplican tres, **en este orden y sin fusionar las dos primeras**:

1. `20260809100000_add_super_admin_role` — agrega el valor `SUPER_ADMIN` al enum.
2. `20260809100100_multi_tenant_subscriptions` — tablas nuevas, `companyId`,
   relleno de los datos existentes y la restricción de integridad.
3. `20260810100000_company_updated_by` — agrega `Company.updatedBy`, que faltaba
   para seguir la convención `createdBy`/`updatedBy` del resto del esquema.

Van separadas porque Postgres **prohíbe usar un valor de enum recién creado
dentro de la misma transacción** (error `55P04`), y Prisma envuelve cada
migración en una. La restricción `user_company_scope` de la segunda menciona el
literal `'SUPER_ADMIN'`. Juntas fallan.

Si ya había usuarios o sedes cargados, la segunda migración crea la empresa
**«Limpieza Mendoza»** en plan Profesional y le asigna todo lo existente.

### 4. Crear los planes

```bash
npm run seed:plans          # idempotente; no pisa lo que ya esté configurado
```

### 5. Cuenta de súper administrador — ya creada

`adrian@admin.com` existe y su acceso quedó verificado. El seed de un solo uso
que la creó **ya fue eliminado**, junto con su script de `package.json`, antes
de cualquier commit: la contraseña nunca llegó a entrar al historial de git.

Esa cuenta quedó marcada con `mustChangePassword`, así que en el próximo ingreso
el panel pide definir una contraseña propia. La original viajó en texto plano en
el pedido inicial y no debía quedar como definitiva.

Para crear más súper administradores se usa el propio panel
(`POST /api/platform/super-admins`), que envía una contraseña temporal por
correo. No hace falta ningún seed.

**Contraseña temporal y panel de plataforma.** Toda cuenta creada desde el panel
nace con contraseña temporal, y el backend rechaza `/api/platform/*` con
`PASSWORD_CHANGE_REQUIRED` hasta que se cambie. El panel tiene su propia
pantalla para eso (`#pantalla-clave`), que se muestra automáticamente al
ingresar. Sin esa pantalla la cuenta quedaría bloqueada sin salida, porque el
cambio de contraseña del panel de empresa vive en otra aplicación.

### Reparar boletas faltantes

Si un pago quedó sin su PDF —falló la generación, o el `pdfPath` apunta a otro
entorno, como `/app/receipts/...` de cuando el backend corría en el contenedor—:

```bash
node scripts/reparar-boletas.js            # informa qué falta
node scripts/reparar-boletas.js --aplicar  # regenera y corrige la base
```

Reconstruye el PDF desde el `PaymentDetail` guardado, así que el importe es el
que se liquidó en su momento aunque después hayan cambiado sueldos o reglas.

### 6. Al terminar las pruebas: dejar el sistema sin clientes

```bash
CONFIRMAR_RESET=SI npm run reset:clientes
```

Borra todas las empresas y sus datos operativos. **Conserva** los `SUPER_ADMIN`
y los planes. La variable de confirmación es obligatoria: es irreversible.

## Cómo funciona

### Aislamiento entre empresas

Tres capas, porque acá un descuido no da error: muestra la nómina de otro cliente.

1. **[backend/src/lib/tenant.js](backend/src/lib/tenant.js)** — un único mapa de
   cómo cada modelo alcanza su empresa. `scope(modelo, companyId)` **lanza** si el
   modelo no está mapeado o si no hay empresa en contexto, en vez de devolver un
   filtro vacío que traería los datos de todas.
2. **`findUnique` → `findFirst`** — Prisma no admite filtros de relación en
   `findUnique`, así que toda búsqueda por id incluye el ámbito. Es lo que impide
   que el ADMIN de una empresa abra `/api/payments/5` de otra.
3. **Restricción en la base** — `user_company_scope` exige que `SUPER_ADMIN` tenga
   `companyId` nulo y que todo otro rol lo tenga definido. Aunque un bug intente
   crear un ADMIN huérfano, Postgres lo rechaza.

Más el test de [backend/test/tenant.test.js](backend/test/tenant.test.js), que lee
`schema.prisma` y falla si aparece un modelo nuevo sin ámbito decidido.

### Límite de empleados

En `user.service.create`, dentro de la transacción y con `SELECT … FOR UPDATE`
sobre la fila de la empresa: sin ese bloqueo, dos altas simultáneas leen ambas
«9 de 10» y dejan 11. Devuelve **409** con `code: 'PLAN_LIMIT_REACHED'`.

Reactivar a un empleado dado de baja también consume cupo.

### Modo solo lectura

`enforceCompanyStatus` en [backend/src/middleware/auth.js](backend/src/middleware/auth.js),
evaluado en cada petición autenticada, sin planificador de tareas:

- Vencida sin pago → pasa a `READ_ONLY`.
- A 2 días o menos → envía el aviso una sola vez (`reminderSentFor` guarda el
  vencimiento avisado, así que el ciclo siguiente lo rearma solo).
- En `READ_ONLY`, todo método distinto de `GET`/`HEAD`/`OPTIONS` → **403** con
  `code: 'SUBSCRIPTION_READ_ONLY'`.

Login, perfil y cambio de contraseña siguen funcionando: no llevan este middleware.

Al registrar el pago, `nextDueDate` avanza **un mes desde el vencimiento
anterior**, no desde la fecha de pago: pagar tarde no regala días.

### Separación de roles

| | Panel de empresa | Panel de plataforma |
|---|---|---|
| `SUPER_ADMIN` | 403 (`requireCompanyContext`) | acceso total |
| `ADMIN` | acceso a su empresa | 403 (`requireSuperAdmin`) |
| `EMPLOYEE` | sus propios datos | 403 |

El súper administrador ve de cada empresa el plan, el uso y los cobros. Nunca
empleados, asistencia ni nómina.

## Verificación ejecutada

Contra el entorno local, con dos empresas (Limpieza Mendoza en Profesional y
Servicios Andinos en Esencial):

| Comprobación | Resultado |
|---|---|
| Cada empresa ve solo sus datos | A: 5 usuarios, 3 sedes, 3 pagos, 33 asistencias · B: 1 usuario, 0 de todo lo demás |
| Acceso por id ajeno (`PUT /worksites/1..3`, `PUT/DELETE /users/2,3`) | 400/404, nada modificado |
| Boleta ajena vs. propia | La dueña recibe «el archivo no existe» (el pago se encontró); la ajena, «comprobante no disponible» (ni sabe si existe) |
| Límite del plan en el borde | Empleado 10 → 201 · Empleado 11 → **409 `PLAN_LIMIT_REACHED`** |
| Subir a Empresarial | El mismo alta pasa a 201 |
| Bajar de plan por debajo del uso | Permitido, con advertencia; nadie dado de baja |
| Suscripción vencida | Login OK · lecturas 200 · escrituras **403 `SUBSCRIPTION_READ_ONLY`** · la otra empresa no se ve afectada |
| Pago con 1 día de atraso | Vencimiento 09/08 → **09/09**, no 10/09: pagar tarde no regala días |
| Cobrar dos veces el mismo mes | 409 |
| `SUPER_ADMIN` → rutas de negocio | 403 en las 5 |
| `ADMIN` de empresa → `/api/platform/*` | 403 en las 5, incluida `POST /super-admins` |
| Restricción `user_company_scope` | Rechaza ADMIN sin empresa y SUPER_ADMIN con empresa |

**Pendiente de probar en el dispositivo:** la app móvil de un empleado de una
empresa en `READ_ONLY` (entrar, ver boletas, y que el marcaje falle con mensaje
claro).
