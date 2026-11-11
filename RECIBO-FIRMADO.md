# Recibo físico firmado

Adjunta la foto del papel que el empleado firmó al cobrar, como respaldo del
pago de nómina.

> **Estado (20/08/2026):** aplicado y verificado sobre el contenedor local.
> Migración `20260813100000_payment_receipt_photo` puesta.

## Qué hace y qué no

| Dato | De dónde sale |
|---|---|
| **Monto** | Del cálculo de nómina. **No se lee de la foto.** |
| **Beneficiario** | Del propio pago, que ya apunta al empleado |
| **Fecha** | Del servidor, en hora de Bolivia (`boliviaToday()`) |
| **Foto** | Lo único que se carga a mano |

**No hay OCR ni interpretación de la imagen.** Leer un número manuscrito y
usarlo como cifra contable metería un error que nadie revisaría. La foto solo
prueba que el pago se entregó y quedó firmado.

**El beneficiario no se elige de una lista ni se escribe:** sale del pago al que
se adjunta la foto. Es más fuerte que un desplegable, porque no existe forma de
asociar el recibo a la persona equivocada.

**La fecha usa `boliviaToday()`** de `lib/business-rules`, el mismo helper que ya
usan la asistencia y las asignaciones de sede. No se creó ninguna lógica de zona
horaria nueva. Importa: al momento de probarlo eran las 18:36 en Bolivia y las
22:36 UTC — con la fecha del servidor, un recibo cargado de noche quedaría
fechado al día siguiente.

## Dónde se guardan las fotos

En `backend/uploads/recibos/`, junto a las de marcaje, **cubiertas por el mismo
`.gitignore`** (`backend/uploads/`, línea 12). Verificado con `git check-ignore`
sobre un archivo real de esa carpeta.

En producción van a Cloudinary bajo `planilla/recibos/<año>/<mes>/`, porque el
disco del contenedor es efímero.

El nombre del archivo lleva 12 bytes aleatorios: es un dato personal y no debe
poder adivinarse.

## Cómo se sirven

Por un **endpoint autenticado**, no por una carpeta estática. El recibo lleva
nombre, monto y firma; publicarlo por URL lo dejaría al alcance de cualquiera
que adivinara la ruta. Mismo criterio que la boleta en PDF.

Un empleado solo puede ver el recibo de su propio pago; el administrador, todos.

Como el endpoint exige cabecera de autorización, el navegador no puede usarlo
directamente en un `<img src>`: el frontend lo descarga y crea una URL de objeto,
que libera al cerrar.

## Validación de la imagen

Reutiliza `photo.service`, que ya validaba las fotos de marcaje: se ignora el
tipo declarado y se comprueba la **firma binaria** real (JPEG o PNG), con tope
de 3 MB. Un PDF renombrado como `.jpg` se rechaza.

El servicio se generalizó en `storePhoto()`; `storeAttendancePhoto` y
`storeReceiptPhoto` son dos usos suyos. No se duplicó la validación.

## API

| Método | Ruta | Quién |
|---|---|---|
| POST | `/api/payments/:id/receipt` | Solo administrador |
| GET | `/api/payments/:id/receipt` | El empleado el suyo; el admin todos |
| DELETE | `/api/payments/:id/receipt` | Solo administrador |

La ruta de subida está en la lista de rutas con foto de `index.js`, que usa el
límite de 8 MB en vez de los 250 kB del resto de la API.

Quitar el recibo borra la referencia pero **no el archivo**: si se quitó por
error, el original sigue estando.

## En pantalla

- **Pantalla de pagos:** junto a «📄 Boleta PDF» aparece «📷 Adjuntar recibo», o
  «📎 Recibo» si ya lo tiene.
- **Historial:** columna «Recibo firmado» con una insignia — verde `📎 Adjunto`
  con la fecha, o ámbar `Falta`. Se puede clicar para ver o adjuntar.

El visor muestra la imagen con vista previa antes de guardar, y avisa si pesa
más de 3 MB sin llegar a subirla. En el celular, el campo abre la cámara
directamente (`capture="environment"`).

## Verificación

```bash
npm --prefix backend test    # 130 pruebas
npm run lint
```

Comprobado contra la API real: subida y descarga de una imagen válida; rechazo
de un PDF disfrazado de JPEG, de texto plano y de una imagen vacía; 404 en un
pago inexistente o de otra empresa; la fecha guardada es la de Bolivia y no la
del servidor; el archivo cae en `uploads/recibos/` y queda ignorado por git; y
quitar el recibo deja el GET en 404.

**Pendiente:** verlo en el navegador — el visor, la vista previa y las insignias
se probaron por API, no visualmente.
