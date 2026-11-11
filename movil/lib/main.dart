import 'package:flutter/material.dart';

import 'pantallas/cambiar_clave.dart';
import 'pantallas/login.dart';
import 'pantallas/marcaje.dart';
import 'servicios/api.dart';
import 'servicios/ubicacion.dart';

void main() {
  runApp(const AplicacionPlanilla());
}

class AplicacionPlanilla extends StatelessWidget {
  const AplicacionPlanilla({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Planilla Asistencia',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0369A1)),
        useMaterial3: true,
      ),
      home: const Raiz(),
    );
  }
}

/// Decide qué pantalla mostrar según el estado de la sesión.
class Raiz extends StatefulWidget {
  const Raiz({super.key});

  @override
  State<Raiz> createState() => _RaizState();
}

class _RaizState extends State<Raiz> {
  bool _cargando = true;
  Map<String, dynamic>? _usuario;
  bool _debeCambiarClave = false;

  @override
  void initState() {
    super.initState();

    // El permiso de ubicación se pide una sola vez, al abrir la aplicación,
    // para que el marcaje después sea un solo gesto sin diálogos intermedios.
    Ubicacion.solicitarPermiso();

    _restaurarSesion();
  }

  Future<void> _restaurarSesion() async {
    final guardado = await Api.recuperarSesion();
    if (guardado == null) {
      if (mounted) setState(() => _cargando = false);
      return;
    }

    try {
      // Se revalida contra el servidor: el token pudo expirar o el usuario
      // pudo ser desactivado desde la última vez que abrió la aplicación.
      final perfil = await Api.obtenerPerfil();
      if (mounted) {
        setState(() {
          _usuario = perfil;
          _debeCambiarClave = perfil['mustChangePassword'] == true;
          _cargando = false;
        });
      }
    } on ErrorApi {
      await Api.borrarSesion();
      if (mounted) setState(() => _cargando = false);
    }
  }

  Future<void> _alIngresar(Map<String, dynamic> resultado) async {
    final usuario = resultado['user'] as Map<String, dynamic>;
    await Api.guardarSesion(resultado['token'] as String, usuario);

    if (mounted) {
      setState(() {
        _usuario = usuario;
        _debeCambiarClave = resultado['mustChangePassword'] == true;
      });
    }
  }

  Future<void> _alCambiarClave() async {
    try {
      final perfil = await Api.obtenerPerfil();
      if (mounted) {
        setState(() {
          _usuario = perfil;
          _debeCambiarClave = false;
        });
      }
    } on ErrorApi {
      // El cambio ya se guardó; si falla el refresco se sigue con lo que hay.
      if (mounted) setState(() => _debeCambiarClave = false);
    }
  }

  Future<void> _cerrarSesion() async {
    await Api.borrarSesion();
    if (mounted) {
      setState(() {
        _usuario = null;
        _debeCambiarClave = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Scaffold(
        backgroundColor: Color(0xFF0369A1),
        body: Center(child: CircularProgressIndicator(color: Colors.white)),
      );
    }

    if (_usuario == null) {
      return PantallaLogin(alIngresar: _alIngresar);
    }

    // La app es solo para el personal fijo. El temporal no marca acá: el
    // encargado le registra el día desde el panel. Tampoco la usa un
    // administrador, que no tiene asistencia propia.
    final tipo = _usuario!['employeeType'];
    final rol = _usuario!['role'];
    if (tipo == 'TEMPORAL' || (rol != null && rol != 'EMPLOYEE')) {
      return _PantallaSinAcceso(
        mensaje: tipo == 'TEMPORAL'
            ? 'Esta aplicación es solo para el personal fijo.\n\n'
                'Su día de trabajo lo registra el encargado.'
            : 'Esta aplicación es para que el personal marque su asistencia.\n\n'
                'Use el panel web para administrar.',
        alSalir: _cerrarSesion,
      );
    }

    if (_debeCambiarClave) {
      return PantallaCambiarClave(alTerminar: _alCambiarClave);
    }

    return PantallaMarcaje(usuario: _usuario!, alSalir: _cerrarSesion);
  }
}

/// Aviso para quien entra a la app sin poder usarla (temporal o administrador).
class _PantallaSinAcceso extends StatelessWidget {
  const _PantallaSinAcceso({required this.mensaje, required this.alSalir});

  final String mensaje;
  final VoidCallback alSalir;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFEEF7FD),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.info_outline, size: 64, color: Color(0xFF0369A1)),
              const SizedBox(height: 20),
              Text(
                mensaje,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, height: 1.4, color: Color(0xFF0F2942)),
              ),
              const SizedBox(height: 32),
              SizedBox(
                height: 56,
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: const Color(0xFF0369A1)),
                  onPressed: alSalir,
                  child: const Text('Salir', style: TextStyle(fontSize: 18)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
