# Versión beta — qué se probó y qué se corrigió

> **Estado (01/11/2026):** recorrido completo en el navegador y contra la API
> local: alta de empleado, asignación de sede, cliente y contrato, marcación
> desde el celular (simulada por API), cálculo y pago de nómina, boleta y
> reporte en PDF. 138 pruebas y lint en verde.

## Cómo levantarlo en este equipo

1. Abrir **Docker Desktop** y encender el contenedor `planilla-db`.
2. Backend: `npm --prefix backend run start` (puerto 4000).
3. Panel: servir `frontend/public` en el puerto 3015, por ejemplo
   `npx http-server@14.1.1 frontend/public -p 3015 -c-1`.
4. App: instalar el APK más nuevo de [apk/](apk/README.md). El celular tiene
   que estar en la misma wifi y el cortafuegos de Windows debe dejar pasar el
   puerto 4000.

## Lo que se corrigió

| Dónde | Problema | Arreglo |
|---|---|---|
| App móvil | El APK no llegaba nunca al servidor: Android bloquea `http://` en las versiones release | `usesCleartextTraffic` en el manifiesto (quitar cuando el backend tenga https) |
| Empleados | Si el correo fallaba, la contraseña temporal se perdía y nadie podía entrar | El panel la muestra una sola vez con un botón para copiar el mensaje y mandarlo por WhatsApp |
| Empleados | El horario nuevo venía solo con el lunes; había que cargar los otros días uno por uno | Arranca de lunes a viernes, con atajos «Lunes a viernes» y «Lunes a sábado» |
| Empleados | Campos de horario blancos sobre fondo oscuro y selectores aplastados | Estilos corregidos |
| Sedes | Una sede de 08:00 a 18:00 se rechazaba si la jornada tenía pausa de almuerzo | Se compara contra la jornada completa del día |
| Clientes | «+ Contrato», «Editar» y «Dar de baja» no hacían nada | Arreglado el manejo del clic |
| Asistencia | Marcar un día sin turno (un domingo de reemplazo) sumaba horas de «retraso» y se descontaban del sueldo | El retraso solo se mide contra un turno que existe |
| Nómina | Quien faltaba cobraba el mes completo y nada lo mostraba | Aviso «⚠ N días sin marcar» en la planilla y al confirmar el pago (no descuenta solo) |
| Boletas | Todas decían «PLANILLA DE PAGO S.R.L.» en vez del nombre de la empresa | Usan el nombre y NIT de la empresa |
| Reporte mensual | Salía con una segunda hoja en blanco | Corregido |

## Cómo paga el cliente (02/11/2026)

Sueldo fijo mensual por contrato; turno fijo (p. ej. 06:00–14:00 de lunes a
sábado). Un domingo de descanso o un feriado trabajado se paga aparte a fin de
mes; un feriado no trabajado no es falta.

- **Alta de empleado:** ya no pide horas del mes ni hora de ingreso. El valor
  de la hora es sueldo ÷ 30 ÷ 8 (ley boliviana) y la hora de ingreso sale del
  horario, que arranca de lunes a sábado 06:00–14:00. Atajo «Todos los días»
  para quien trabaja 7 días por contrato.
- **Feriados:** los nacionales se calculan solos cada año (incluidos Carnaval,
  Viernes Santo y Corpus Christi). Los departamentales se agregan en
  *Calcular nómina → 📅 Feriados y días extra*.
- **Días extra:** domingo fuera de turno o feriado con marcación → se suma
  automáticamente a la planilla y a la boleta. Por defecto 2 jornales
  (pago doble), editable en la misma ventana.

- **Temporal = pago por día:** al elegir «Temporal» el formulario pide el pago
  por día. La planilla le paga los días que marcó × ese monto; la boleta lo
  muestra como «Días trabajados N × Bs X». Los temporales que ya existían se
  convirtieron con sueldo ÷ 30 (revisar en la ficha de cada uno).
- **Turnos:** botones Mañana (06:00–14:00) y Tarde (14:00–22:00); no hay
  turno de noche.

- **Alta en dos caminos:** «Nuevo empleado» pregunta primero Fijo o Temporal.
  El temporal solo pide nombre, apellido y pago por día; no usa la app y el
  encargado le carga el día en *Asistencia → 🧹 Registrar día de temporal*
  (fecha, entrada y salida, aunque sea después).
- **Correo o celular:** el fijo necesita al menos uno y con cualquiera entra a
  la app y al panel. El celular se guarda normalizado (8 dígitos, sin 591) y
  es único. Sin correo, la clave temporal se muestra en pantalla para pasarla
  por mensaje.

- **Contratos:** fecha de inicio, fecha de fin y día de cobro. Por
  adelantado vence ese día del mismo mes; a mes vencido, del mes siguiente.
- **Recordatorio de cobros:** botón flotante 💰 abajo a la derecha con los
  cobros por vencer (3 días antes) y vencidos (en rojo). «✓ Cobrado» registra
  el cobro con el monto que rigió ese mes, y se puede deshacer al instante.

## Pendiente para después de la beta

- Aportes a la Gestora, RC-IVA, aguinaldo, bono de antigüedad y finiquito.
- Fecha de ingreso, fecha de baja y carnet de identidad del empleado.
- En la app: historial de marcaciones propio y pedir justificaciones.
- Panel de plataforma: mostrar la clave temporal al crear una empresa cuando
  el correo falla, igual que ya hace el panel de empleados.
- Feriados y vacaciones: hoy un feriado aparece como «día sin marcar».
