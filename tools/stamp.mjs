// Actualiza las huellas (?v=...) de css/ y js/ en index.html según el contenido de cada archivo.
//
//   node tools/stamp.mjs          → reescribe index.html con las huellas actuales
//   node tools/stamp.mjs --check  → falla (código 1) si alguna huella está desactualizada
//
// Así el navegador y el service worker nunca mezclan un index.html nuevo con un JS/CSS viejo:
// si un archivo cambia, cambia su URL.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const check = process.argv.includes('--check');

const stale = [];
const out = html.replace(/((?:src|href)=")((?:css|js)\/[^"?]+)\?v=([^"]*)(")/g, (m, pre, file, v, post) => {
  const hash = createHash('sha256').update(readFileSync(join(root, file))).digest('hex').slice(0, 10);
  if (hash !== v) stale.push(file);
  return `${pre}${file}?v=${hash}${post}`;
});

if (check) {
  if (stale.length) {
    console.error('Huellas desactualizadas en index.html: ' + stale.join(', ') + '\nEjecuta: node tools/stamp.mjs');
    process.exit(1);
  }
  console.log('Huellas al día.');
} else {
  writeFileSync(htmlPath, out);
  console.log(stale.length ? 'Actualizadas: ' + stale.join(', ') : 'Nada que actualizar.');
}
