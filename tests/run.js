// Ejecuta todas las pruebas (tests/*.test.js), una tras otra, y falla si alguna falla.
//   npm test                 → todas
//   npm test -- summary      → solo las que contengan "summary" en el nombre
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const filter = process.argv[2] || '';
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && f.includes(filter)).sort();
const failed = [];
for (const f of files) {
  console.log(`\n▶ ${f}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', timeout: 240000 });
  if (r.status !== 0) failed.push(f);
}
console.log(failed.length ? `\n✗ Fallan: ${failed.join(', ')}` : `\n✓ ${files.length} archivos de pruebas OK`);
process.exit(failed.length ? 1 : 0);
