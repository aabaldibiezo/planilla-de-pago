import 'package:flutter/material.dart';

import '../servicios/api.dart';

/// Cambio obligatorio de la contraseña temporal enviada por correo.
///
/// El backend rechaza toda ruta de negocio con 403 mientras esto no ocurra,
/// así que no hay forma de saltear esta pantalla desde la aplicación.
class PantallaCambiarClave extends StatefulWidget {
  const PantallaCambiarClave({super.key, required this.alTerminar});

  final Future<void> Function() alTerminar;

  @override
  State<PantallaCambiarClave> createState() => _PantallaCambiarClaveState();
}

class _PantallaCambiarClaveState extends State<PantallaCambiarClave> {
  final _actual = TextEditingController();
  final _nueva = TextEditingController();
  final _repetida = TextEditingController();
  String? _error;
  bool _procesando = false;

  @override
  void dispose() {
    _actual.dispose();
    _nueva.dispose();
    _repetida.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (_procesando) return;

    // Validación local: evita un viaje al servidor por un error de tipeo.
    if (_nueva.text != _repetida.text) {
      setState(() => _error = 'Las dos contraseñas nuevas no coinciden.');
      return;
    }
    if (_nueva.text.length < 8) {
      setState(() => _error = 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (!RegExp(r'[a-zA-Z]').hasMatch(_nueva.text) ||
        !RegExp(r'\d').hasMatch(_nueva.text)) {
      setState(() => _error = 'La contraseña debe combinar letras y números.');
      return;
    }

    setState(() {
      _procesando = true;
      _error = null;
    });

    try {
      await Api.cambiarClave(_actual.text, _nueva.text);
      await widget.alTerminar();
    } on ErrorApi catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _procesando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFEEF7FD),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 32),
              const Text(
                'Cree su contraseña',
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF0369A1),
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Ingresó con la contraseña temporal que le enviaron por correo. '
                'Elija una propia para seguir. La temporal dejará de funcionar.',
                style: TextStyle(fontSize: 15, color: Color(0xFF616161), height: 1.4),
              ),
              const SizedBox(height: 26),
              TextField(
                controller: _actual,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Contraseña temporal',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _nueva,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Nueva contraseña',
                  helperText: 'Mínimo 8 caracteres, con letras y números',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _repetida,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Repita la nueva',
                  border: OutlineInputBorder(),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(_error!, style: const TextStyle(color: Color(0xFFC62828))),
              ],
              const SizedBox(height: 26),
              SizedBox(
                height: 54,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF0369A1),
                  ),
                  onPressed: _procesando ? null : _guardar,
                  child: Text(
                    _procesando ? 'Guardando…' : 'Guardar',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
