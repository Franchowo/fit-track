// Comprueba que todos los JS de la app, el service worker y el Apps Script son sintácticamente válidos.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(root, 'js')).filter(f => f.endsWith('.js')).map(f => join('js', f)).concat(['sw.js', join('apps-script', 'Code.gs')]);
let bad = 0;
for (const f of files) {
  try { new vm.Script(readFileSync(join(root, f), 'utf8'), { filename: f }); }
  catch (e) { bad++; console.error(`✗ ${f}: ${e.message}`); }
}
console.log(bad ? `${bad} archivo(s) con errores` : `Sintaxis correcta en ${files.length} archivos.`);
process.exit(bad ? 1 : 0);
