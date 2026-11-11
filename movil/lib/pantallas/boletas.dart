import 'dart:io';

import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../servicios/api.dart';

/// Boletas de pago del empleado.
///
/// Cada elemento muestra el concepto, el período y el origen del pago: las
/// sedes donde la persona efectivamente trabajó ese mes, que el servidor
/// deriva de sus marcaciones de asistencia.
class PantallaBoletas extends StatefulWidget {
  const PantallaBoletas({super.key});

  @override
  State<PantallaBoletas> createState() => _PantallaBoletasState();
}

class _PantallaBoletasState extends State<PantallaBoletas> {
  List<dynamic> _boletas = [];
  bool _cargando = true;
  String? _error;
  int? _descargando;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final datos = await Api.listarBoletas();
      if (mounted) {
        setState(() {
          _boletas = datos;
          _cargando = false;
        });
      }
    } on ErrorApi catch (e) {
      if (mounted) {
        setState(() {
          _error = e.mensaje;
          _cargando = false;
        });
      }
    }
  }

  String _dinero(dynamic valor) {
    final numero = double.tryParse('$valor') ?? 0;
    return 'Bs. ${numero.toStringAsFixed(2)}';
  }

  /// Descarga el PDF al almacenamiento del teléfono y lo abre.
  ///
  /// Se guarda en el directorio de documentos de la aplicación: no requiere
  /// permisos de almacenamiento y el archivo queda accesible para compartir.
  Future<void> _descargar(Map<String, dynamic> boleta, {required bool abrir}) async {
    final id = boleta['id'] as int;
    setState(() => _descargando = id);

    try {
      final bytes = await Api.descargarBoleta(id);
      final carpeta = await getApplicationDocumentsDirectory();
      final nombre = 'boleta-${boleta['month']}-${boleta['year']}.pdf';
      final archivo = File('${carpeta.path}/$nombre');
      await archivo.writeAsBytes(bytes);

      if (!mounted) return;

      if (abrir) {
        await OpenFilex.open(archivo.path);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Boleta guardada en el teléfono: $nombre')),
        );
      }
    } on ErrorApi catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.mensaje)));
      }
    } finally {
      if (mounted) setState(() => _descargando = null);
    }
  }

  /// Previsualización: abre el PDF antes de decidir si guardarlo.
  void _abrirDetalle(Map<String, dynamic> boleta) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (contexto) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 36),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              boleta['conceptLabel'] as String? ?? 'Boleta de pago',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              boleta['originLabel'] as String? ?? '',
              style: const TextStyle(color: Color(0xFF616161)),
            ),
            const Divider(height: 28),
            _fila('Salario base', _dinero(boleta['monthlySalary'])),
            _fila('Horas extra', _dinero(boleta['overtimeAmount'])),
            _fila('Total ingresos', _dinero(boleta['totalIncome'])),
            _fila('Total descuentos', '- ${_dinero(boleta['totalDiscounts'])}'),
            const Divider(height: 24),
            _fila('Líquido pagable', _dinero(boleta['netPay']), destacado: true),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.visibility),
                    label: const Text('Ver PDF'),
                    onPressed: () {
                      Navigator.of(contexto).pop();
                      _descargar(boleta, abrir: true);
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    icon: const Icon(Icons.download),
                    label: const Text('Descargar'),
                    onPressed: () {
                      Navigator.of(contexto).pop();
                      _descargar(boleta, abrir: false);
                    },
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _fila(String etiqueta, String valor, {bool destacado = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(etiqueta,
              style: TextStyle(
                color: const Color(0xFF616161),
                fontWeight: destacado ? FontWeight.bold : FontWeight.normal,
              )),
          Text(valor,
              style: TextStyle(
                fontWeight: destacado ? FontWeight.bold : FontWeight.w600,
                fontSize: destacado ? 18 : 15,
                color: destacado ? const Color(0xFF2E7D32) : null,
              )),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0369A1),
        foregroundColor: Colors.white,
        title: const Text('Mis boletas'),
      ),
      body: _construirCuerpo(),
    );
  }

  Widget _construirCuerpo() {
    if (_cargando) return const Center(child: CircularProgressIndicator());

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_error!, textAlign: TextAlign.center),
        ),
      );
    }

    if (_boletas.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Todavía no tiene boletas de pago registradas.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF616161), fontSize: 16),
          ),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _boletas.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (contexto, indice) {
        final boleta = _boletas[indice] as Map<String, dynamic>;
        final pagadoEl = DateTime.tryParse(boleta['paidAt'] as String? ?? '');

        return Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: Color(0xFFE0E0E0)),
          ),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            title: Text(
              boleta['conceptLabel'] as String? ?? 'Boleta de pago',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 4),
                Text(boleta['originLabel'] as String? ?? '',
                    style: const TextStyle(fontSize: 13)),
                if (pagadoEl != null)
                  Text(
                    'Pagado el ${pagadoEl.day}/${pagadoEl.month}/${pagadoEl.year}',
                    style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E)),
                  ),
              ],
            ),
            trailing: _descargando == boleta['id']
                ? const SizedBox(
                    width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(
                    _dinero(boleta['netPay']),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF2E7D32),
                    ),
                  ),
            onTap: () => _abrirDetalle(boleta),
          ),
        );
      },
    );
  }
}
