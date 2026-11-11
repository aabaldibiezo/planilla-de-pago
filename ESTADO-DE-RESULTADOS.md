# Estado de resultados mensual

Junta lo que entra (contratos y otros ingresos) con lo que sale (salarios de la
nómina y gastos cargados a mano) y muestra el saldo del mes, con histórico para
comparar.

> **Estado (12/08/2026):** aplicado y verificado sobre el contenedor local.
> Migración `20260812100000_income_statement` puesta.

## De dónde sale cada línea

| Línea | Origen | Se carga a mano |
|---|---|---|
| Ingreso por servicios | `rateForMonth()` sobre los contratos activos | no |
| Otros ingresos | `StatementEntry` tipo `OTHER_INCOME` | sí |
| Salario operativo / administrativo | `Payment.netPay`, agrupado por `staffCategory` | no |
| Costos operativos | `StatementEntry` + categorías `OPERATING` | sí |
| Gastos financieros | `StatementEntry` + categorías `FINANCIAL` | sí |

Montos en **bolivianos**, como la nómina y los contratos. No confundir con la
suscripción a la plataforma, que va en dólares por otro panel.

## El estado no se guarda

No hay tabla de "estado del mes". Se calcula al pedirlo, porque el requisito es
que se recalcule ante cualquier cambio sin importar el orden en que se carguen
las cosas: una foto guardada quedaría vieja apenas se confirmara un pago.

El histórico sale gratis, porque cada mes se calcula con sus propios datos y
`rateForMonth` respeta la vigencia de las tarifas: un aumento de precio hoy no
reescribe lo que se facturó en marzo.

Y quitar de un clic una categoría que este mes no aplica se resuelve solo: las
líneas son por mes, así que borrar la de un mes no puede tocar otro.

## Nómina no cerrada

El sistema no tenía ningún concepto de período cerrado, y no hizo falta
inventarlo. Se deriva en `backend/src/lib/payroll-closure.js`:

> **cerrada** = todo el que debía cobrar ese mes tiene su `Payment`

El denominador tiene una trampa: usar "los activos hoy" daría mal al mirar marzo
si desde entonces se fue gente. Un empleado cuenta para el mes M si tiene pago de
M —aunque ya no esté activo— o si sigue activo y ya existía antes de que M
terminara. Y **el mes en curso nunca se considera cerrado** aunque estén todos
los pagos: todavía puede entrar personal.

Queda un caso que los datos actuales no permiten resolver: alguien que trabajó
en marzo, nunca cobró y después se dio de baja. No hay fecha de baja en el
modelo, así que desaparece del conteo. Es preferible a inventarla.

### La alerta, en tres niveles

1. **Franja naranja** sobre los costos, con el conteo exacto («faltan 2 de 5») y
   un botón que lleva a calcular nómina. Naranja y no rojo: no es un fallo, es
   un dato incompleto.
2. **Símbolo `≈`** en el salario, el total operativo y el saldo. La
   incertidumbre contamina hacia arriba a propósito: un saldo que parece firme
   sin serlo es el error más caro de esta pantalla.
3. **Nota al pie del saldo**, que es la cifra que alguien mira de reojo sin leer
   el resto.

Al confirmarse el último pago desaparece todo solo, porque el estado se
recalcula al pedirlo.

## Personal operativo vs. administrativo

El sistema no tenía cómo distinguirlos: `role` es un permiso y `employeeType` es
el tipo de contrato. Se agregó `User.staffCategory` (OPERATIVO / ADMINISTRATIVO),
que se elige en el formulario de empleados.

**Importante:** a un usuario con rol ADMIN no se le puede pagar nómina —
`processPayment` lo rechaza. El personal administrativo que cobre sueldo tiene
que cargarse **como empleado** y marcarse como administrativo; si queda como
ADMIN, esa línea del estado dará siempre cero.

## Categorías de gasto

15 predefinidas, sembradas **por empresa** y no como catálogo global, así una
empresa puede renombrar "insumos" o desactivar "combustible" sin afectar a las
demás. Las empresas nuevas las reciben solas en el alta.

Cada empresa puede agregar las suyas. Al quitar una categoría: si nunca se usó
se borra, y si tiene gastos imputados se desactiva —borrarla rompería meses ya
registrados. `POST /statement/categories/restore` repone las predefinidas que se
hayan borrado.

## API

| Método | Ruta |
|---|---|
| GET | `/api/statement?month&year` |
| GET | `/api/statement/history?fromMonth&fromYear&toMonth&toYear` |
| GET · POST · PUT · DELETE | `/api/statement/categories` · `/:id` |
| POST | `/api/statement/categories/restore` |
| POST · PUT · DELETE | `/api/statement/entries` · `/:id` |

Un recurso de otra empresa responde **404**, no 403.

## Verificación

```bash
npm --prefix backend test    # 130 pruebas
npm run lint
```

Comprobado además contra la API real: julio (nómina 3/3) sale definitivo y
agosto (0/3) provisional con la advertencia; cargar y borrar gastos recalcula el
saldo sin tocar otros meses; marcar a un empleado como administrativo mueve su
sueldo de línea; el alta de empresa siembra las 15 categorías; aislamiento entre
empresas con 404 en accesos cruzados; y con la suscripción vencida el estado se
consulta pero no se puede cargar nada.

**Pendiente:** ver la pantalla en el navegador — la alerta naranja, los `≈` y la
tabla comparativa se verificaron por API, no visualmente.
