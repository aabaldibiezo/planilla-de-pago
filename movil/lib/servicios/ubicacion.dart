import 'package:geolocator/geolocator.dart';

import 'config.dart';

/// Coordenadas capturadas al marcar asistencia.
class Posicion {
  const Posicion(this.latitud, this.longitud, this.precision);

  final double latitud;
  final double longitud;
  final double? precision;
}

/// Captura de ubicación para el marcaje.
///
/// El permiso se pide una sola vez, al abrir la aplicación, y no en el momento
/// de tomar la foto: así el marcaje es un gesto continuo, sin diálogos de por
/// medio. El sistema operativo exige ese permiso y no se puede omitir, pero el
/// empleado no vuelve a ver nada después.
///
/// La ubicación NUNCA se muestra en pantalla ni se usa para decidir nada en el
/// teléfono: se envía al servidor y ahí se compara contra la sede asignada.
class Ubicacion {
  /// Pide el permiso. Devuelve `true` si quedó concedido.
  static Future<bool> solicitarPermiso() async {
    try {
      var permiso = await Geolocator.checkPermission();
      if (permiso == LocationPermission.denied) {
        permiso = await Geolocator.requestPermission();
      }
      return permiso == LocationPermission.always ||
          permiso == LocationPermission.whileInUse;
    } catch (_) {
      return false;
    }
  }

  /// Obtiene la posición actual.
  ///
  /// Nunca lanza: si el GPS está apagado, el permiso denegado o no hay señal
  /// dentro del tiempo previsto, devuelve `null`. Quien llama decide qué
  /// hacer; acá no se bloquea nada.
  static Future<Posicion?> obtener() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;

      final permiso = await Geolocator.checkPermission();
      if (permiso == LocationPermission.denied ||
          permiso == LocationPermission.deniedForever) {
        return null;
      }

      final posicion = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Config.esperaUbicacion,
        ),
      );

      return Posicion(posicion.latitude, posicion.longitude, posicion.accuracy);
    } catch (_) {
      // Se traga el error a propósito: el tiempo agotado del GPS es un caso
      // esperado, no una falla de la aplicación.
      return null;
    }
  }
}
