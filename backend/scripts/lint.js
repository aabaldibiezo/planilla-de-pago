/**
 * Verificación de sintaxis sin dependencias.
 *
 * ESLint (en la raíz del repositorio) es el linter real del proyecto. Este script
 * se conserva porque el backend se despliega de forma aislada en Railway, donde
 * las herramientas de la raíz no están instaladas.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.name.endsWith('.js') ? [fullPath] : [];
  });

const files = [...walk(path.join(__dirname, '../src')), ...walk(path.join(__dirname, '../test'))];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
}

console.log(`Sintaxis válida en ${files.length} archivos.`);
