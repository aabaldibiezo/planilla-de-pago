# Permisos de Android

Tras ejecutar `flutter create --platforms=android .`, el archivo
`android/app/src/main/AndroidManifest.xml` debe declarar **solo** estos
permisos:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

## Por qué importa

El APK anterior, generado con Expo, declaraba además `RECORD_AUDIO`,
`READ_EXTERNAL_STORAGE` y `SYSTEM_ALERT_WINDOW`. Ninguno hacía falta: los
agregaba `expo-camera` porque su módulo también soporta grabar video.

Un empleado que revise los permisos de la aplicación vería "Micrófono" y
"Archivos y multimedia", y tendría motivo para desconfiar — sobre todo en una
aplicación que le toma una foto y registra su ubicación.

En Flutter, el paquete `camera` puede arrastrar `RECORD_AUDIO` por el mismo
motivo. Se neutraliza agregando en el manifiesto:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" tools:node="remove" />
```

con `xmlns:tools="http://schemas.android.com/tools"` declarado en la etiqueta
`<manifest>`. El controlador de cámara ya se crea con `enableAudio: false`.

## Verificación

Después de compilar, comprobar qué permisos quedaron realmente en el APK:

```bash
"C:/Android/build-tools/35.0.0/aapt2" dump badging apk/<archivo>.apk | grep uses-permission
```

Es la única forma de saberlo: lo que declara el manifiesto de la aplicación no
es lo mismo que lo que termina en el paquete, porque las dependencias fusionan
sus propios manifiestos.
