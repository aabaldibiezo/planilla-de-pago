# Aplicación móvil — Flutter

Registro de asistencia para el personal de limpieza. Reemplaza a la versión
anterior en React Native, que fue eliminada.

## Requisitos

- Flutter SDK (instalado en `C:\D DISCO\flutter` en este equipo, y en el PATH)
- Android SDK (`C:\Android`, ya configurado en `ANDROID_HOME`)
- JDK 17

La ruta del SDK también vive en `android/local.properties` (`flutter.sdk`), que
no se versiona por ser propia de cada equipo. Si Flutter se mueve de carpeta,
hay que actualizarla ahí o la compilación falla.

## Puesta en marcha

```bash
cd movil
flutter pub get
flutter run          # con un celular conectado por USB
```

## Configurar la dirección del backend

El celular no puede usar `localhost`: eso apunta al propio teléfono. Hay dos
formas de indicar el servidor.

**Al compilar**, sin tocar el código:

```bash
flutter build apk --release --dart-define=API_URL=http://192.168.0.100:4001/api
```

**O editando** [lib/servicios/config.dart](lib/servicios/config.dart), que trae
un valor por defecto.

El backend también debe aceptar la IP del celular en su `CORS_ORIGINS`.

## Generar el APK

Desde la raíz del repositorio:

```bash
npm run apk                                  # detecta solo la IP del equipo
npm run apk -- http://192.168.0.5:4000/api   # o se le indica una
```

Deja el archivo en `apk/` con la fecha en el nombre. Por debajo hace
`flutter build apk --release --dart-define=API_URL=...`.

### La ruta de Flutter no puede tener espacios

`path_provider` arrastra `path_provider_foundation` (la implementación de
iOS/macOS), que desde su versión 2.5 depende de `objective_c` y exige la
función de *assets nativos*. El ejecutor de esos hooks no entrecomilla la ruta
del SDK, así que con Flutter en `C:\D DISCO\flutter` la compilación muere con
«`"C:\D" no se reconoce como un comando`».

Como este proyecto es solo Android, `pubspec.yaml` fija esa dependencia a la
versión anterior con `dependency_overrides` y el problema desaparece. Ese bloque
se puede quitar si Flutter pasa a vivir en una ruta sin espacios, o hay que
revisarlo si algún día se agrega soporte de iOS.

## Estructura

```
lib/
  main.dart                   decide qué pantalla mostrar según la sesión
  servicios/
    config.dart               dirección del backend y parámetros de captura
    api.dart                  cliente HTTP y almacenamiento del token
    ubicacion.dart            captura de GPS para el geocerco
  pantallas/
    login.dart                ingreso con la contraseña temporal
    cambiar_clave.dart        cambio obligatorio en el primer acceso
    marcaje.dart              botón único de entrada/salida con cámara
    boletas.dart              lista, previsualización y descarga de PDF
```

## Decisiones de diseño

**Solo cámara en vivo, nunca galería.** La foto se toma con el paquete `camera`
y `takePicture()`. En todo el proyecto no hay `image_picker` ni ningún selector
de archivos, así que no existe una ruta hacia la galería.

**La ubicación se captura junto con la foto.** El permiso se pide una sola vez
al abrir la aplicación, no al marcar, para que el marcaje sea un gesto continuo.
La ubicación no se muestra en pantalla ni se menciona.

**El geocerco es estricto y decide en el servidor.** Si el empleado está fuera
del radio de su sede asignada, si el GPS no responde o si no tiene sede para
hoy, la marcación se rechaza y no se guarda nada. La aplicación muestra el
mensaje que redacta el servidor, sin distancias ni coordenadas.

**Las coordenadas de las sedes nunca llegan al teléfono.** `GET /api/worksites`
responde 403 a un empleado.

## Errores frecuentes

| Síntoma                               | Causa                                            |
| ------------------------------------- | ------------------------------------------------ |
| "No se pudo conectar"                 | `API_URL` con `localhost`, o celular en otra red |
| "Debe cambiar su contraseña temporal" | Correcto: hay que completar el cambio            |
| La cámara queda en negro              | Falta aceptar el permiso de cámara               |
| "Sin lugar de trabajo asignado"       | Falta asignarle una sede desde el panel web      |
