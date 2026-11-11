/// Configuración de la aplicación.
///
/// ⚠️ El celular NO puede usar `localhost`: eso apunta al propio teléfono.
/// Hay que poner la IP del equipo donde corre el backend dentro de la red
/// wifi, o la URL pública si ya está desplegado.
///
/// Para averiguar la IP del equipo:
///   Windows      ->  ipconfig      (buscar "Dirección IPv4")
///   macOS/Linux  ->  ifconfig | grep "inet "
///
/// Se puede sobrescribir al compilar sin tocar este archivo:
///   flutter build apk --dart-define=API_URL=https://mi-servidor/api
class Config {
  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://192.168.1.4:4000/api',
  );

  /// Calidad de la foto de marcaje. Menor peso sube más rápido con señal pobre.
  static const int calidadFoto = 55;

  /// Ancho máximo de la foto enviada. El servidor rechaza sobre 3 MB.
  static const double anchoMaximoFoto = 1080;

  /// Tiempo máximo esperando al GPS antes de darlo por no disponible.
  static const Duration esperaUbicacion = Duration(seconds: 10);
}
