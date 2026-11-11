/**
 * Ámbito de empresa (multiempresa).
 *
 * Cada empresa cliente solo puede alcanzar sus propios datos. Un descuido acá
 * no produce un error visible: produce que una empresa vea la nómina de otra.
 * Por eso el filtro no se escribe a mano en cada consulta, sino que se arma
 * desde un único mapa que se puede auditar de una sola lectura.
 *
 * Módulo puro, sin Prisma: se puede probar sin base de datos.
 */

/**
 * Cómo alcanza cada modelo su empresa.
 *
 * `User`, `Worksite` y `AuditLog` la guardan directamente. El resto llega por
 * `user`, que ya tienen todos. Se prefirió el join a repetir `companyId` en
 * ocho tablas más: dos copias del mismo dato terminan desincronizándose, y una
 * fila cuyo `companyId` no coincide con el de su usuario es un agujero
 * silencioso, peor que el costo del join.
 */
const TENANT_PATH = {
  user: (companyId) => ({ companyId }),
  worksite: (companyId) => ({ companyId }),
  auditLog: (companyId) => ({ companyId }),
  client: (companyId) => ({ companyId }),
  expenseCategory: (companyId) => ({ companyId }),
  statementEntry: (companyId) => ({ companyId }),
  holiday: (companyId) => ({ companyId }),
  // El contrato llega por su cliente, y el monto por su contrato. Son dos y
  // tres saltos, pero valen lo mismo que copiar `companyId` en cada tabla y
  // no arriesgan que las dos copias se desincronicen.
  contract: (companyId) => ({ client: { companyId } }),
  contractRate: (companyId) => ({ contract: { client: { companyId } } }),
  contractCollection: (companyId) => ({ contract: { client: { companyId } } }),
  attendance: (companyId) => ({ user: { companyId } }),
  attendanceSession: (companyId) => ({ user: { companyId } }),
  scheduleBlock: (companyId) => ({ user: { companyId } }),
  worksiteAssignment: (companyId) => ({ user: { companyId } }),
  overtime: (companyId) => ({ user: { companyId } }),
  discount: (companyId) => ({ user: { companyId } }),
  timeCompensation: (companyId) => ({ user: { companyId } }),
  payment: (companyId) => ({ user: { companyId } }),
};

/**
 * Modelos que pertenecen a la plataforma, no a una empresa. El súper
 * administrador los gestiona y ninguna empresa cliente los consulta.
 * Se listan de forma explícita para que la prueba de cobertura pueda
 * distinguir "no lleva ámbito a propósito" de "se olvidó".
 */
const PLATFORM_MODELS = ['plan', 'company', 'subscriptionPayment'];

/**
 * Modelos que se alcanzan siempre a través de su padre y nunca se consultan
 * sueltos. `PaymentDetail` solo existe dentro de un `Payment` ya acotado.
 */
const NESTED_MODELS = ['paymentDetail'];

/**
 * Fragmento de `where` que acota un modelo a una empresa.
 *
 * Lanza en vez de devolver `{}` en los dos casos peligrosos: modelo sin ámbito
 * definido y consulta sin empresa en contexto. Un filtro vacío devolvería los
 * datos de todas las empresas, así que el olvido tiene que romper la petición.
 *
 * @example
 *   where: { ...scope('payment', companyId), month, year }
 */
const scope = (model, companyId) => {
  const build = TENANT_PATH[model];

  if (!build) {
    throw new Error(
      `El modelo "${model}" no tiene ámbito de empresa definido en lib/tenant.js`
    );
  }

  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error(`Consulta de "${model}" sin empresa en el contexto de la petición`);
  }

  return build(companyId);
};

/**
 * Empresa del usuario autenticado, validada.
 *
 * El SUPER_ADMIN tiene `companyId` null a propósito: administra la plataforma
 * y no debe alcanzar datos operativos de ninguna empresa. Que esto lance es el
 * comportamiento correcto, no un caso a contemplar.
 */
const companyOf = (user) => {
  if (!user || !Number.isInteger(user.companyId)) {
    throw new Error('El usuario autenticado no pertenece a ninguna empresa');
  }
  return user.companyId;
};

module.exports = {
  scope,
  companyOf,
  TENANT_PATH,
  PLATFORM_MODELS,
  NESTED_MODELS,
};
