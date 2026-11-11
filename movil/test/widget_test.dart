import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:planilla_movil/pantallas/login.dart';

void main() {
  testWidgets('la pantalla de login muestra los campos y el botón', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: PantallaLogin(alIngresar: (_) async {})),
    );

    expect(find.text('Planilla'), findsOneWidget);
    expect(find.text('Correo'), findsOneWidget);
    expect(find.text('Contraseña'), findsOneWidget);
    expect(find.text('Ingresar'), findsOneWidget);
  });

  testWidgets('no intenta ingresar con los campos vacíos', (tester) async {
    var seLlamo = false;

    await tester.pumpWidget(
      MaterialApp(
        home: PantallaLogin(
          alIngresar: (_) async {
            seLlamo = true;
          },
        ),
      ),
    );

    await tester.tap(find.text('Ingresar'));
    await tester.pump();

    // Con los campos vacíos no debe salir ninguna petición al servidor.
    expect(seLlamo, isFalse);
    expect(find.text('Complete su correo y su contraseña.'), findsOneWidget);
  });
}
