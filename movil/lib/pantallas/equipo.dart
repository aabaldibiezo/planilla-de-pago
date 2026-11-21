import 'dart:convert';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../servicios/api.dart';
import '../servicios/ubicacion.dart';

const _azul = Color(0xFF0369A1);
const _verde = Color(0xFF2E7D32);

/// "Mi equipo": solo para el encargado de sede.
///
/// Lista a los operativos asignados hoy a su sede y a los temporales, cada
/// uno con su estado. El encargado marca la entrada o la salida de cada
/// persona con una foto de ella; la ubicación que se guarda es la del
/// encargado, que tiene que estar en la sede.
class PantallaEquipo extends StatefulWidget {
  const PantallaEquipo({super.key, required this.usuario});

  final Map<String, dynamic> usuario;

  @override
  State<PantallaEquipo> createState() => _PantallaEquipoState();
}

class _PantallaEquipoState extends State<PantallaEquipo> {
  bool _cargando = true;
  String? _error;
  List<dynamic> _sedes = [];
  List<dynamic> _personas = [];

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final equipo = await Api.equipoDeHoy();
      if (!mounted) return;
      setState(() {
        _sedes = equipo['sedes'] as List<dynamic>? ?? [];
        _personas = equipo['personas'] as List<dynamic>? ?? [];
        _cargando = false;
      });
    } on ErrorApi catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.mensaje;
        _cargando = false;
      });
    }
  }

  Future<void> _marcar(Map<String, dynamic> persona) async {
    final listo = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PantallaFotoEquipo(persona: persona, usuario: widget.usuario),
      ),
    );
    if (listo == true) await _cargar();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: _azul,
        foregroundColor: Colors.white,
        title: const Text('Mi equipo de hoy'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Actualizar',
            onPressed: _cargando ? null : _cargar,
          ),
        ],
      ),
      backgroundColor: const Color(0xFFEEF7FD),
      body: _cuerpo(),
    );
  }

  Widget _cuerpo() {
    if (_cargando) return const Center(child: CircularProgressIndicator());

    if (_error != null) {
      return _aviso(Icons.info_outline, _error!);
    }

    final nombresSedes = _sedes.map((s) => (s as Map)['name']).join(' · ');

    return RefreshIndicator(
      onRefresh: _cargar,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: Colors.white,
            child: ListTile(
              leading: const Icon(Icons.location_on, color: _azul),
              title: Text(nombresSedes.isEmpty ? 'Sin sede asignada hoy' : nombresSedes),
              subtitle: const Text(
                'Marque la entrada y la salida de su equipo. Se guarda la foto de la persona y su ubicación.',
              ),
            ),
          ),
          const SizedBox(height: 8),
          if (_personas.isEmpty)
            _aviso(Icons.groups_outlined, 'No hay personas para marcar hoy en su sede.'),
          ..._personas.map((p) => _tarjeta(p as Map<String, dynamic>)),
        ],
      ),
    );
  }

  Widget _tarjeta(Map<String, dynamic> persona) {
    final estado = persona['estado'] as String;
    final temporal = persona['tipo'] == 'TEMPORAL';
    String hora(String? iso) {
      if (iso == null) return '';
      final t = DateTime.parse(iso).toLocal();
      return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    }

    final (etiqueta, color) = switch (estado) {
      'TRABAJANDO' => ('Trabajando desde ${hora(persona['entrada'] as String?)}', _verde),
      'TERMINO' => (
          'Terminó: ${hora(persona['entrada'] as String?)} – ${hora(persona['salida'] as String?)}',
          const Color(0xFF616161)
        ),
      _ => ('Sin marcar', const Color(0xFFB45309)),
    };

    return Card(
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: temporal ? const Color(0xFFFFF7E6) : const Color(0xFFE0F2FE),
              child: Icon(temporal ? Icons.schedule : Icons.person, color: _azul),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    persona['nombre'] as String,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                  Text(
                    '${temporal ? 'Temporal' : 'Operativo'} · $etiqueta',
                    style: TextStyle(fontSize: 13, color: color),
                  ),
                ],
              ),
            ),
            if (estado != 'TERMINO')
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: estado == 'TRABAJANDO' ? _verde : _azul,
                ),
                onPressed: () => _marcar(persona),
                child: Text(estado == 'TRABAJANDO' ? 'Salida' : 'Entrada'),
              ),
          ],
        ),
      ),
    );
  }

  Widget _aviso(IconData icono, String texto) => Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          children: [
            Icon(icono, size: 56, color: _azul),
            const SizedBox(height: 12),
            Text(texto, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16)),
          ],
        ),
      );
}

/// Cámara para fotografiar a la persona que se marca.
///
/// Usa la cámara trasera: el encargado le saca la foto a otra persona. Igual
/// que en el marcaje propio, la foto sale siempre de la cámara en vivo (no hay
/// galería).
class PantallaFotoEquipo extends StatefulWidget {
  const PantallaFotoEquipo({super.key, required this.persona, required this.usuario});

  final Map<String, dynamic> persona;
  final Map<String, dynamic> usuario;

  @override
  State<PantallaFotoEquipo> createState() => _PantallaFotoEquipoState();
}

class _PantallaFotoEquipoState extends State<PantallaFotoEquipo> {
  CameraController? _camara;
  String? _errorCamara;
  bool _procesando = false;

  bool get _esSalida => widget.persona['estado'] == 'TRABAJANDO';

  @override
  void initState() {
    super.initState();
    _prepararCamara();
  }

  @override
  void dispose() {
    _camara?.dispose();
    super.dispose();
  }

  Future<void> _prepararCamara() async {
    try {
      final camaras = await availableCameras();
      if (camaras.isEmpty) {
        setState(() => _errorCamara = 'El dispositivo no tiene cámara disponible.');
        return;
      }
      final trasera = camaras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => camaras.first,
      );
      final control = CameraController(trasera, ResolutionPreset.medium, enableAudio: false);
      await control.initialize();
      if (mounted) setState(() => _camara = control);
    } catch (_) {
      if (mounted) setState(() => _errorCamara = 'No se pudo abrir la cámara. Revise el permiso.');
    }
  }

  void _avisar(String titulo, String mensaje) {
    if (!mounted) return;
    showDialog<void>(
      context: context,
      builder: (contexto) => AlertDialog(
        title: Text(titulo),
        content: Text(mensaje),
        actions: [
          TextButton(onPressed: () => Navigator.of(contexto).pop(), child: const Text('Entendido')),
        ],
      ),
    );
  }

  Future<void> _registrar() async {
    final camara = _camara;
    if (camara == null || _procesando) return;
    setState(() => _procesando = true);

    try {
      final archivo = await camara.takePicture();
      final bytes = await File(archivo.path).readAsBytes();
      final foto = 'data:image/jpeg;base64,${base64Encode(bytes)}';

      final posicion = await Ubicacion.obtener();
      if (posicion == null) {
        _avisar(
          'No se pudo obtener su ubicación',
          'Active el GPS, salga a un lugar abierto e intente de nuevo.',
        );
        return;
      }

      if (_esSalida) {
        await Api.marcarSalidaDe(
          sesionId: widget.persona['sesionAbiertaId'] as int,
          foto: foto,
          latitud: posicion.latitud,
          longitud: posicion.longitud,
          precision: posicion.precision,
        );
      } else {
        await Api.marcarEntradaDe(
          usuarioId: widget.persona['id'] as int,
          foto: foto,
          latitud: posicion.latitud,
          longitud: posicion.longitud,
          precision: posicion.precision,
          dispositivo: 'Encargado ${widget.usuario['firstName'] ?? ''} / app móvil',
        );
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: _verde,
          content: Text(
            '${_esSalida ? 'Salida' : 'Entrada'} de ${widget.persona['nombre']} registrada',
          ),
        ),
      );
      Navigator.of(context).pop(true);
    } on ErrorApi catch (e) {
      const titulos = {
        'UBICACION_NO_DISPONIBLE': 'No se pudo obtener su ubicación',
        'SIN_SEDE_ASIGNADA': 'Sin sede asignada',
        'FUERA_DE_ZONA': 'Está fuera de la sede',
        'FUERA_DEL_EQUIPO': 'No es de su sede',
        'NO_ES_ENCARGADO': 'Sin permiso',
      };
      _avisar(titulos[e.codigo] ?? 'No se pudo registrar', e.mensaje);
    } catch (_) {
      _avisar('No se pudo registrar', 'Ocurrió un problema al tomar la foto.');
    } finally {
      if (mounted) setState(() => _procesando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final nombre = widget.persona['nombre'] as String;
    final camara = _camara;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: _azul,
        foregroundColor: Colors.white,
        title: Text('${_esSalida ? 'Salida' : 'Entrada'} de $nombre'),
      ),
      body: Column(
        children: [
          Expanded(
            child: _errorCamara != null
                ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_errorCamara!)))
                : camara == null || !camara.value.isInitialized
                    ? const Center(child: CircularProgressIndicator())
                    : CameraPreview(camara),
          ),
          Container(
            color: Colors.white,
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Enfoque la cara de $nombre y toque el botón',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 15, color: Color(0xFF616161)),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  height: 60,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: _esSalida ? _verde : _azul,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    onPressed: _procesando || camara == null ? null : _registrar,
                    child: Text(
                      _procesando
                          ? 'Registrando…'
                          : _esSalida
                              ? 'Tomar foto y marcar salida'
                              : 'Tomar foto y marcar entrada',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
