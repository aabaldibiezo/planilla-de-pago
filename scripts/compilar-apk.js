/**
 * Compila el APK de la aplicación móvil y lo deja en `apk/` con la fecha en
 * el nombre.
 *
 *   npm run apk                                 detecta la IP del equipo
 *   npm run apk -- http://192.168.0.5:4000/api  usa una dirección concreta
 *
 * La dirección del backend queda FIJADA dentro del APK al compilarlo: el
 * celular no puede usar `localhost` (eso apunta al propio teléfono), así que
 * tiene que ser la IP del equipo en la red wifi. Cambiarla exige un APK nuevo.
 *
 * Sustituye al antiguo `movil/compilar-apk.sh`, que llevaba la ruta del SDK
 * escrita a mano y dejó de funcionar en cuanto Flutter cambió de carpeta.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const movil = path.join(raiz, 'movil');
const destino = path.join(raiz, 'apk');

/**
 * IPv4 del equipo en la red local.
 *
 * Un equipo con Docker y WSL tiene varias interfaces, y la primera que
 * aparece casi nunca es la buena. Se descartan las inservibles y se ordenan
 * las que quedan por probabilidad de ser la wifi o el cable reales.
 */
const ipDeRed = () => {
  const candidatas = Object.entries(os.networkInterfaces())
    .filter(([nombre]) => !/^(vEthernet|Loopback|WSL|Docker)/i.test(nombre))
    .flatMap(([, direcciones]) => direcciones || [])
    .filter((d) => d.family === 'IPv4' && !d.internal)
    .map((d) => d.address)
    // 169.254.x es autoconfiguración: aparece cuando no hubo DHCP y no la
    // alcanza nadie. 172.16-31.x suelen ser redes de Docker o Hyper-V.
    .filter((ip) => !/^169\.254\./.test(ip))
    .filter((ip) => !/^172\.(1[6-9]|2\d|3[01])\./.test(ip));

  // 192.168.x es lo típico de un router doméstico; 10.x, de una red de oficina.
  const prioridad = (ip) => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : 2);

  return candidatas.sort((a, b) => prioridad(a) - prioridad(b))[0] || null;
};

const argumento = process.argv[2];
let apiUrl = argumento;

if (!apiUrl) {
  const ip = ipDeRed();
  if (!ip) {
    console.error('No se pudo detectar la IP del equipo en la red.');
    console.error('Indíquela a mano:  npm run apk -- http://IP:4000/api');
    process.exit(1);
  }
  apiUrl = `http://${ip}:4000/api`;
}

if (/localhost|127\.0\.0\.1/.test(apiUrl)) {
  console.error(`La dirección "${apiUrl}" no sirve para un celular:`);
  console.error('`localhost` apunta al propio teléfono, no a este equipo.');
  process.exit(1);
}

console.log(`▸ Backend que quedará dentro del APK: ${apiUrl}`);
console.log('  (el celular tiene que estar en la misma red wifi que este equipo)\n');

const flutter = process.platform === 'win32' ? 'flutter.bat' : 'flutter';
const correr = (args) =>
  execFileSync(flutter, args, { cwd: movil, stdio: 'inherit', shell: true });

correr(['pub', 'get']);
correr(['build', 'apk', '--release', `--dart-define=API_URL=${apiUrl}`]);

const generado = path.join(movil, 'build', 'app', 'outputs', 'flutter-apk', 'app-release.apk');
if (!fs.existsSync(generado)) {
  console.error(`\nLa compilación terminó pero no se encontró ${generado}`);
  process.exit(1);
}

fs.mkdirSync(destino, { recursive: true });

const ahora = new Date();
const sello =
  `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}` +
  `${String(ahora.getDate()).padStart(2, '0')}-` +
  `${String(ahora.getHours()).padStart(2, '0')}${String(ahora.getMinutes()).padStart(2, '0')}`;
const copia = path.join(destino, `planilla-flutter-${sello}.apk`);

fs.copyFileSync(generado, copia);

const mb = (fs.statSync(copia).size / 1024 / 1024).toFixed(1);
console.log(`\n✅ APK listo: apk/${path.basename(copia)} (${mb} MB)`);
console.log(`   Backend: ${apiUrl}`);
