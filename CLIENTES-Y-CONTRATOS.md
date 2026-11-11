# Clientes, contratos y cruce de horarios

A quién le presta servicio la empresa de limpieza y por cuánto, con historial de
montos. Cierra además el hueco de que un empleado pudiera quedar asignado a dos
sedes a la vez sin que nada avisara.

> **Estado (11/08/2026):** aplicado y verificado sobre el contenedor local
> `planilla-db`. Migración `20260811100000_clients_and_contracts` puesta.

## Monedas

| Concepto | Moneda | Campo |
|---|---|---|
| Contratos con clientes | **Bolivianos** | `ContractRate.amount` |
| Sueldos y boletas | Bolivianos | `monthlySalary`, `netPay`, … |
| Suscripción a la plataforma | **Dólares** | `Plan.monthlyPriceUsd`, `SubscriptionPayment.amountUsd` |

El sufijo `Usd` en el nombre del campo es la marca. No hay conversión entre
ambas y no debe haberla: no existe tipo de cambio en el sistema.

## Modelo

```
Company ──< Client ──< Contract ──< ContractRate   (historial de montos)
                          │
                          └──< Worksite            (una o varias sedes)
```

`Worksite.contractId` **ya existía** desde la migración inicial, reservado con
el comentario «para la Fase 4: cuando existan contratos de clientes». Solo hubo
que agregar la clave foránea: cero migración destructiva.

Un contrato puede cubrir **varias sedes**; una sede sola es el caso común. Una
sede no puede pertenecer a dos contratos, porque volvería ambiguo a quién se le
cobra por atenderla.

### Historial de montos

Un `ContractRate` **nunca se edita ni se borra**: un ajuste de precio agrega un
registro nuevo con su fecha de vigencia. Es lo que permite reconstruir meses
después qué se cobraba en marzo.

El monto de un mes es el registro con la `validFrom` más alta que no se pase de
ese mes. Un ajuste a mitad de mes rige el mes completo: el contrato se cobra
mensualmente y no se prorratea. La regla vive en
[backend/src/lib/contract-rates.js](backend/src/lib/contract-rates.js), sin
Prisma, y tiene 13 pruebas incluidos los bordes (día 1, último día, febrero
bisiesto, montos futuros).

## Cruce de horarios

**Antes no existía ninguna validación.** `createAssignment` comprobaba que el
empleado y la sede existieran, y que se indicara día *o* fecha, pero nunca
comparaba horas. En los datos de prueba había un empleado asignado a **3 sedes
los 7 días de la semana**.

Las dos reglas viven en
[backend/src/lib/assignment-schedule.js](backend/src/lib/assignment-schedule.js):

1. **Cruce entre sedes.** Dos asignaciones del mismo empleado y día cuyas
   franjas se pisan → 409 `WORKSITE_SCHEDULE_CONFLICT`, nombrando la sede que ya
   ocupa el horario.
2. **Coherencia con la jornada.** La franja debe caer dentro de algún
   `ScheduleBlock` del empleado ese día. Sin bloques cargados no se bloquea: un
   empleado `FLEXIBLE` puede no tenerlos.

### Tres detalles que no son obvios

- **Franjas contiguas no chocan.** 08:00–12:00 seguido de 12:00–16:00 es un
  turno encadenado. Lo resuelve `overlaps()`, que compara con desigualdad
  estricta.
- **Sin horario = jornada completa.** Las asignaciones cargadas antes de que
  existiera la regla no tienen horas, así que ocupan el día entero y chocan con
  cualquier otra. Es la lectura conservadora: avisa de más, no de menos.
- **Una fecha puntual no choca con una recurrente.** `worksitesForDate()` en
  `geofence.js` le da prioridad a la puntual y descarta las recurrentes de esa
  fecha. Marcar conflicto acá haría que la validación dijera una cosa y el
  geocerco hiciera otra.

### Lo que ya estaba cargado

La regla **solo frena altas nuevas**; no se tocó ningún dato existente. Para ver
los cruces que quedaron de antes:

```
GET /api/worksites/assignments/conflicts
```

No corrige nada, solo los lista. En los datos de prueba reporta 14.

## Alta de sede: clic en el mapa y ajuste fino

Dos agregados a un flujo que ya tenía buscador de direcciones, marcador
arrastrable, círculo y cuatro tamaños en palabras:

- **Clic directo en el mapa.** Es la salida cuando Nominatim no encuentra el
  lugar; antes eso dejaba el alta en un callejón sin salida.
- **Deslizador de 50 a 2000 m.** El radio en metros pasó a ser el dato real y
  las cuatro tarjetas quedaron como atajos que lo fijan. Al mover la barra se
  resalta la tarjeta más cercana y se muestra el radio en palabras («180 metros ·
  el edificio y la vereda de enfrente»), para que el número no quede solo.

Quien no quiere pensar en metros elige una tarjeta y nunca baja hasta el
deslizador.

## API

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/clients` | Clientes con contratos y monto vigente |
| POST · PUT · DELETE | `/api/clients` · `/:id` | Alta, edición y baja lógica |
| POST | `/api/clients/:id/contracts` | Contrato nuevo (con monto y sede opcionales) |
| PUT | `/api/clients/contracts/:id` | Editar contrato |
| GET · POST | `/api/clients/contracts/:id/rates` | Historial y monto nuevo |
| GET | `/api/clients/contracts/:id/rate?month&year` | Monto que rigió un mes |
| GET | `/api/worksites/assignments/conflicts` | Cruces ya existentes |

Un recurso de otra empresa responde **404**, no 403: un 403 confirmaría que ese
id existe.

## Verificación

```bash
npm --prefix backend test    # 106 pruebas
npm run lint
```

Comprobado además contra la API real: aislamiento entre empresas (0 clientes
visibles, 404 en todos los accesos cruzados), cruce de horarios en sus cinco
casos, doble monto en la misma fecha rechazado, sede ya vinculada rechazada, y
modo solo lectura (se consulta, no se escribe).

**Pendiente:** probar la pantalla de clientes y el deslizador en el navegador.
