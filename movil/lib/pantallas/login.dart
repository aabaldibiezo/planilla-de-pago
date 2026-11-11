import 'package:flutter/material.dart';

import '../servicios/api.dart';

/// Inicio de sesión con correo o celular y la contraseña temporal.
class PantallaLogin extends StatefulWidget {
  const PantallaLogin({super.key, required this.alIngresar});

  /// Recibe el resultado del login: token, usuario y si debe cambiar la clave.
  final Future<void> Function(Map<String, dynamic>) alIngresar;

  @override
  State<PantallaLogin> createState() => _PantallaLoginState();
}

class _PantallaLoginState extends State<PantallaLogin> {
  final _email = TextEditingController();
  final _clave = TextEditingController();
  String? _error;
  bool _procesando = false;

  @override
  void dispose() {
    _email.dispose();
    _clave.dispose();
    super.dispose();
  }

  Future<void> _ingresar() async {
    if (_procesando) return;

    final correo = _email.text.trim().toLowerCase();
    if (correo.isEmpty || _clave.text.isEmpty) {
      setState(() => _error = 'Complete su correo o celular y su contraseña.');
      return;
    }

    setState(() {
      _procesando = true;
      _error = null;
    });

    try {
      final resultado = await Api.iniciarSesion(correo, _clave.text);
      await widget.alIngresar(resultado);
    } on ErrorApi catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _procesando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0369A1),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Planilla',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 30,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0369A1),
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Registro de asistencia',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 16, color: Color(0xFF616161)),
                    ),
                    const SizedBox(height: 28),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.text,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Correo o celular',
                        hintText: 'correo@empresa.com o 71234567',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _clave,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Contraseña',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _ingresar(),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      Text(
                        _error!,
                        style: const TextStyle(color: Color(0xFFC62828)),
                      ),
                    ],
                    const SizedBox(height: 24),
                    SizedBox(
                      height: 54,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF0369A1),
                        ),
                        onPressed: _procesando ? null : _ingresar,
                        child: Text(
                          _procesando ? 'Ingresando…' : 'Ingresar',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
