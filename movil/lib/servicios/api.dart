import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'config.dart';

/// Error devuelto por la API.
///
/// `codigo` transporta el código del geocerco estricto (FUERA_DE_ZONA,
/// UBICACION_NO_DISPONIBLE, SIN_SEDE_ASIGNADA) para que la pantalla distinga
/// el motivo del bloqueo sin tener que interpretar el texto del mensaje.
class ErrorApi implements Exception {
  ErrorApi(this.mensaje, {this.codigo, this.estado});

  final String mensaje;
  final String? codigo;
  final int? estado;

  @override
  String toString() => mensaje;
}

/// Cliente de la API del sistema de planilla.
class Api {
  static const _almacen = FlutterSecureStorage();
  static const _claveToken = 'planilla_token';
  static const _claveUsuario = 'planilla_usuario';

  static String? _token;

  // --------------- Sesión ---------------

  static Future<void> guardarSesion(String token, Map<String, dynamic> usuario) async {
    _token = token;
    await _almacen.write(key: _claveToken, value: token);
    await _almacen.write(key: _claveUsuario, value: jsonEncode(usuario));
  }

  static Future<void> borrarSesion() async {
    _token = null;
    await _almacen.delete(key: _claveToken);
    await _almacen.delete(key: _claveUsuario);
  }

  static Future<Map<String, dynamic>?> recuperarSesion() async {
    final token = await _almacen.read(key: _claveToken);
    final crudo = await _almacen.read(key: _claveUsuario);
    if (token == null || crudo == null) return null;

    _token = token;
    try {
      return jsonDecode(crudo) as Map<String, dynamic>;
    } catch (_) {
      await borrarSesion();
      return null;
    }
  }

  // --------------- Petición base ---------------

  static Map<String, String> get _cabeceras => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  static Future<dynamic> _pedir(
    String metodo,
    String ruta, {
    Map<String, dynamic>? cuerpo,
  }) async {
    final uri = Uri.parse('${Config.apiUrl}$ruta');
    late http.Response respuesta;

    try {
      final cuerpoJson = cuerpo == null ? null : jsonEncode(cuerpo);
      switch (metodo) {
        case 'POST':
          respuesta = await http.post(uri, headers: _cabeceras, body: cuerpoJson);
        case 'PUT':
          respuesta = await http.put(uri, headers: _cabeceras, body: cuerpoJson);
        case 'PATCH':
          respuesta = await http.patch(uri, headers: _cabeceras, body: cuerpoJson);
        default:
          respuesta = await http.get(uri, headers: _cabeceras);
      }
    } catch (_) {
      // Distinguir "sin conexión" de "el servidor respondió mal" evita que el
      // empleado crea que marcó cuando la petición nunca salió.
      throw ErrorApi('No se pudo conectar. Revise su conexión a internet.');
    }

    Map<String, dynamic>? datos;
    try {
      datos = jsonDecode(utf8.decode(respuesta.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      datos = null;
    }

    if (respuesta.statusCode >= 400) {
      throw ErrorApi(
        datos?['error'] as String? ?? 'Error ${respuesta.statusCode}',
        codigo: datos?['code'] as String?,
        estado: respuesta.statusCode,
      );
    }

    return datos?['data'] ?? datos;
  }

  // --------------- Autenticación ---------------

  static Future<Map<String, dynamic>> iniciarSesion(String email, String clave) async {
    final datos = await _pedir('POST', '/auth/login', cuerpo: {
      'email': email,
      'password': clave,
    });
    return datos as Map<String, dynamic>;
  }

  static Future<void> cambiarClave(String actual, String nueva) async {
    await _pedir('POST', '/auth/change-password', cuerpo: {
      'currentPassword': actual,
      'newPassword': nueva,
    });
  }

  static Future<Map<String, dynamic>> obtenerPerfil() async {
    final datos = await _pedir('GET', '/auth/me');
    return datos as Map<String, dynamic>;
  }

  // --------------- Marcaje ---------------

  static Future<Map<String, dynamic>> consultarEstado() async {
    final datos = await _pedir('GET', '/attendance/sessions/self/status');
    return datos as Map<String, dynamic>;
  }

  static Future<void> marcarEntrada({
    required String foto,
    required double latitud,
    required double longitud,
    double? precision,
    String? dispositivo,
  }) async {
    await _pedir('POST', '/attendance/sessions/self/clock-in', cuerpo: {
      'photo': foto,
      'latitude': latitud,
      'longitude': longitud,
      'accuracyMeters': precision,
      'deviceInfo': dispositivo,
    });
  }

  static Future<void> marcarSalida({
    required int sesionId,
    required String foto,
    required double latitud,
    required double longitud,
    double? precision,
  }) async {
    await _pedir('PATCH', '/attendance/sessions/self/$sesionId/clock-out', cuerpo: {
      'photo': foto,
      'latitude': latitud,
      'longitude': longitud,
      'accuracyMeters': precision,
    });
  }

  // --------------- Encargado de sede: su equipo ---------------

  /// Personas que el encargado puede marcar hoy, con su estado.
  static Future<Map<String, dynamic>> equipoDeHoy() async {
    final datos = await _pedir('GET', '/attendance/team/today');
    return datos as Map<String, dynamic>;
  }

  static Future<void> marcarEntradaDe({
    required int usuarioId,
    required String foto,
    required double latitud,
    required double longitud,
    double? precision,
    String? dispositivo,
  }) async {
    await _pedir('POST', '/attendance/team/clock-in', cuerpo: {
      'userId': usuarioId,
      'photo': foto,
      'latitude': latitud,
      'longitude': longitud,
      'accuracyMeters': precision,
      'deviceInfo': dispositivo,
    });
  }

  static Future<void> marcarSalidaDe({
    required int sesionId,
    required String foto,
    required double latitud,
    required double longitud,
    double? precision,
  }) async {
    await _pedir('PATCH', '/attendance/team/$sesionId/clock-out', cuerpo: {
      'photo': foto,
      'latitude': latitud,
      'longitude': longitud,
      'accuracyMeters': precision,
    });
  }

  // --------------- Boletas ---------------

  static Future<List<dynamic>> listarBoletas() async {
    final datos = await _pedir('GET', '/payments/history');
    return (datos as List<dynamic>?) ?? [];
  }

  /// Descarga el PDF de una boleta. Devuelve los bytes crudos.
  static Future<List<int>> descargarBoleta(int pagoId) async {
    final uri = Uri.parse('${Config.apiUrl}/payments/$pagoId/pdf');
    final respuesta = await http.get(uri, headers: _cabeceras);

    if (respuesta.statusCode >= 400) {
      throw ErrorApi('No se pudo descargar la boleta (${respuesta.statusCode})');
    }
    return respuesta.bodyBytes;
  }
}
