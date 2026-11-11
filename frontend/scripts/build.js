const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');
const output = path.join(root, 'dist');
const apiUrl = (process.env.VITE_API_URL || '').trim().replace(/\/$/, '');

if (!/^https:\/\/[^\s]+$/i.test(apiUrl)) {
  throw new Error('VITE_API_URL debe configurarse con la URL HTTPS pública del backend de Railway');
}

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
fs.writeFileSync(
  path.join(output, 'config.js'),
  `window.__ENV__ = Object.freeze({ VITE_API_URL: ${JSON.stringify(apiUrl)} });\n`,
  'utf8'
);

// Cabeceras de seguridad para Cloudflare Pages, que no lee vercel.json sino un
// archivo `_headers`. Se generan desde vercel.json para que haya una sola
// fuente: si cambia un permiso, cambia en los dos sitios a la vez.
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const bloques = (vercel.headers || []).map(
  (regla) =>
    `${regla.source === '/(.*)' ? '/*' : regla.source}\n` +
    regla.headers.map((h) => `  ${h.key}: ${h.value}`).join('\n')
);
fs.writeFileSync(path.join(output, '_headers'), `${bloques.join('\n\n')}\n`, 'utf8');

console.log(`Frontend preparado para ${apiUrl}`);
