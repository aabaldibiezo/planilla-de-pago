# APK de la aplicación móvil

Acá se guardan los archivos `.apk` generados de la aplicación de marcaje de
asistencia. Cada archivo lleva la fecha de compilación en el nombre.

## Cómo instalarlo en el celular

1. Copiar el `.apk` al teléfono (cable USB, WhatsApp, correo o Google Drive).
2. Abrirlo desde el celular.
3. Android va a pedir habilitar **"Instalar apps desconocidas"** para la
   aplicación desde la que se abrió el archivo. Es normal: el APK no viene de
   Play Store.
4. Confirmar la instalación.

## Antes de que funcione

La aplicación necesita alcanzar el backend. Si el servidor corre en la red
local, el celular tiene que estar en **la misma red wifi** y la dirección
configurada en el momento de compilar debe ser la IP del equipo, no
`localhost`.

La dirección queda fijada dentro del APK al compilarlo: cambiarla exige
generar un archivo nuevo.

## Cómo generar uno nuevo

Desde la raíz del repositorio:

```bash
npm run apk                                  # detecta solo la IP del equipo
npm run apk -- http://192.168.0.5:4000/api   # o se le indica una
```

Requiere Flutter en el PATH, Android SDK (`ANDROID_HOME`) y JDK 17.

El script rechaza `localhost` a propósito: dentro del teléfono, `localhost` es
el teléfono, así que un APK compilado así nunca alcanzaría el servidor.

Si el celular no conecta y la dirección es correcta, lo más común es que el
cortafuegos de Windows esté bloqueando el puerto del backend para las conexiones
entrantes de la red local.
