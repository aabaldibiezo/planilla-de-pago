import 'dart:convert';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../servicios/api.dart';
import '../servicios/ubicacion.dart';
import 'boletas.dart';
import 'equipo.dart';

/// Pantalla de marcaje: un solo botón que alterna entre entrada y salida.
///
/// La foto se toma SIEMPRE con la cámara en vivo, mediante el paquete `camera`
/// y `takePicture()`. En toda la aplicación no hay `image_picker` ni ningún
/// selector de archivos, así que no existe una ruta hacia la galería.
///
/// Con geocerco estricto, ambas marcaciones exigen ubicación: el servidor
/// rechaza la que caiga fuera del radio de la sede asignada ese día.
class PantallaMarcaje extends StatefulWidget {
  const PantallaMarcaje({super.key, required this.usuario, required this.alSalir});

  final Map<String, dynamic> usuario;
  final VoidCallback alSalir;

  @override
  State<PantallaMarcaje> createState() => _PantallaMarcajeState();
}

class _PantallaMarcajeState extends State<PantallaMarcaje> {
  CameraController? _camara;
  bool _cargando = true;
  bool _procesando = false;
  Map<String, dynamic>? _sesionAbierta;
  String? _confirmacion;
  String? _errorCamara;

  @override
  void initState() {
    super.initState();
    _iniciar();
  }

  @override
  void dispose() {
    _camara?.dispose();
    super.dispose();
  }

  Future<void> _iniciar() async {
    await _prepararCamara();
    await _refrescarEstado();
  }

  Future<void> _prepararCamara() async {
    try {
      final camaras = await availableCameras();
      if (camaras.isEmpty) {
        setState(() => _errorCamara = 'El dispositivo no tiene cámara disponible.');
        return;
      }

      // Cámara frontal: la foto es para constatar quién marca.
      final frontal = camaras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => camaras.first,
      );

      final control = CameraController(
        frontal,
        ResolutionPreset.medium,
        enableAudio: false,
      );
      await control.initialize();

      if (mounted) setState(() => _camara = control);
    } catch (e) {
      if (mounted) {
        setState(() => _errorCamara = 'No se pudo abrir la cámara. Revise el permiso.');
      }
    }
  }

  Future<void> _refrescarEstado() async {
    try {
      final estado = await Api.consultarEstado();
      if (mounted) {
        setState(() {
          _sesionAbierta = estado['session'] as Map<String, dynamic>?;
          _cargando = false;
        });
      }
    } on ErrorApi catch (e) {
      if (mounted) {
        setState(() => _cargando = false);
        _avisar('Error', e.mensaje);
      }
    }
  }

  /// Muestra el rechazo del geocerco.
  ///
  /// El servidor manda el texto ya redactado y sin coordenadas ni distancias:
  /// se muestra tal cual, sin agregar detalles que el empleado no debe conocer.
  void _avisarBloqueo(ErrorApi error) {
    const titulos = {
      'UBICACION_NO_DISPONIBLE': 'No se pudo obtener su ubicación',
      'SIN_SEDE_ASIGNADA': 'Sin lugar de trabajo asignado',
      'FUERA_DE_ZONA': 'Está fuera de su lugar de trabajo',
      'SOLO_FIJOS': 'Solo para personal fijo',
    };
    _avisar(titulos[error.codigo] ?? 'No se pudo registrar', error.mensaje);
  }

  void _avisar(String titulo, String mensaje) {
    if (!mounted) return;
    showDialog<void>(
      context: context,
      builder: (contexto) => AlertDialog(
        title: Text(titulo),
        content: Text(mensaje),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(contexto).pop(),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
  }

  Future<void> _marcar() async {
    final camara = _camara;
    if (camara == null || _procesando) return;

    setState(() {
      _procesando = true;
      _confirmacion = null;
    });

    try {
      // Foto y ubicación se resuelven en el mismo gesto. Para el empleado esto
      // es simplemente "tomar la foto": la ubicación no se menciona.
      final archivo = await camara.takePicture();
      final bytes = await File(archivo.path).readAsBytes();
      final foto = 'data:image/jpeg;base64,${base64Encode(bytes)}';

      final posicion = await Ubicacion.obtener();

      // Sin ubicación el servidor rechaza igual. Avisar acá ahorra subir una
      // foto que va a descartarse y da una respuesta más rápida.
      if (posicion == null) {
        _avisar(
          'No se pudo obtener su ubicación',
          'Active el GPS, salga a un lugar abierto e intente de nuevo.',
        );
        return;
      }

      if (_sesionAbierta != null) {
        await Api.marcarSalida(
          sesionId: _sesionAbierta!['id'] as int,
          foto: foto,
          latitud: posicion.latitud,
          longitud: posicion.longitud,
          precision: posicion.precision,
        );
        setState(() => _confirmacion = 'Salida registrada');
      } else {
        await Api.marcarEntrada(
          foto: foto,
          latitud: posicion.latitud,
          longitud: posicion.longitud,
          precision: posicion.precision,
          dispositivo: '${widget.usuario['email'] ?? ''} / app móvil',
        );
        setState(() => _confirmacion = 'Entrada registrada');
      }

      await _refrescarEstado();
    } on ErrorApi catch (e) {
      _avisarBloqueo(e);
    } catch (_) {
      _avisar('No se pudo registrar', 'Ocurrió un problema al tomar la foto.');
    } finally {
      if (mounted) setState(() => _procesando = false);
    }
  }

  /// Encargado de sede: además de su marcaje, marca a su equipo.
  bool get _esEncargado => widget.usuario['isSiteManager'] == true;

  Future<void> _abrirEquipo() async {
    // La cámara de esta pantalla se suelta para que la de "Mi equipo" pueda
    // abrir la trasera; al volver se prepara de nuevo.
    await _camara?.dispose();
    if (mounted) setState(() => _camara = null);
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => PantallaEquipo(usuario: widget.usuario)),
    );
    await _prepararCamara();
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final esSalida = _sesionAbierta != null;
    final nombre = widget.usuario['firstName'] as String? ?? '';

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0369A1),
        foregroundColor: Colors.white,
        title: Text('Hola, $nombre'),
        actions: [
          if (_esEncargado)
            IconButton(
              icon: const Icon(Icons.groups),
              tooltip: 'Mi equipo',
              onPressed: _abrirEquipo,
            ),
          IconButton(
            icon: const Icon(Icons.receipt_long),
            tooltip: 'Mis boletas',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const PantallaBoletas()),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Salir',
            onPressed: widget.alSalir,
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(child: _vistaCamara()),
          _pie(esSalida),
        ],
      ),
    );
  }

  Widget _vistaCamara() {
    if (_errorCamara != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            _errorCamara!,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 16, color: Color(0xFF616161)),
          ),
        ),
      );
    }

    final camara = _camara;
    if (camara == null || !camara.value.isInitialized) {
      return const Center(child: CircularProgressIndicator());
    }

    return CameraPreview(camara);
  }

  Widget _pie(bool esSalida) {
    final horaEntrada = esSalida
        ? DateTime.parse(_sesionAbierta!['clockIn'] as String).toLocal()
        : null;

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 36),
      width: double.infinity,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_confirmacion != null) ...[
            Text(
              _confirmacion!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Color(0xFF2E7D32),
                fontSize: 17,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 14),
          ],
          Text(
            esSalida
                ? 'Jornada en curso desde las '
                    '${horaEntrada!.hour.toString().padLeft(2, '0')}:'
                    '${horaEntrada.minute.toString().padLeft(2, '0')}'
                : 'Mire a la cámara y toque el botón',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 15, color: Color(0xFF616161)),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            // Botón grande a propósito: se usa a la intemperie, a veces con guantes.
            height: 64,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor:
                    esSalida ? const Color(0xFF2E7D32) : const Color(0xFF0369A1),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              onPressed: _procesando || _camara == null ? null : _marcar,
              child: Text(
                _procesando
                    ? 'Registrando…'
                    : esSalida
                        ? 'Marcar salida'
                        : 'Marcar entrada',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
            ),
          ),
          if (_esEncargado) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF0369A1),
                  side: const BorderSide(color: Color(0xFF0369A1), width: 1.5),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: _procesando ? null : _abrirEquipo,
                icon: const Icon(Icons.groups),
                label: const Text(
                  'Marcar a mi equipo',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
