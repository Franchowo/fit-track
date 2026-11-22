// Utilidades compartidas por las pruebas de FitTrack.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const CODE_GS = path.join(ROOT, 'apps-script', 'Code.gs');
// Chart.js sale del paquete de npm: son los mismos bytes que sirve jsDelivr (lo comprueba el SRI)
const chartjs = fs.readFileSync(path.join(ROOT, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'));
const TMP = os.tmpdir();

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };

// Sirve un archivo de la app (index.html, css/, js/, iconos...) para una ruta interceptada de Playwright
function serveApp(route) {
  let p = decodeURIComponent(new URL(route.request().url()).pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] || 'application/octet-stream' });
}

// Copia de los archivos publicables en una carpeta temporal (para servirla con un servidor real)
function makeSite() {
  const dir = fs.mkdtempSync(path.join(TMP, 'fittrack-site-'));
  ['index.html', 'manifest.json', 'sw.js'].forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  ['icons', 'css', 'js'].forEach(d => fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true }));
  return dir;
}

// Servicios de Google Apps Script simulados (los que usa Code.gs)
function gasServices({ props, sheets, sleeps = [] }) {
  const cache = {};
  return {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null }), flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
    Utilities: {
      DigestAlgorithm: { MD5: 'md5' },
      computeDigest: (a, s) => [...crypto.createHash('md5').update(s).digest()],
      base64Encode: b => Buffer.from(b.map(x => x & 255)).toString('base64'),
      sleep: ms => sleeps.push(ms)
    }
  };
}

// Hoja de cálculo simulada con la API de SpreadsheetApp que usa Code.gs
class Sheet {
  constructor(headers, formats = {}) { this.rows = [headers.slice()]; this.formats = formats; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(...this.rows.map(r => r.length)); }
  getMaxRows() { return 1000; }
  appendRow(r) { this.rows.push(r.slice()); }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
  getDataRange() { const w = this.getLastColumn(); return { getValues: () => this.rows.map(r => { const x = r.slice(); while (x.length < w) x.push(''); return x; }) }; }
  getRange(row, col, nr = 1, nc = 1) {
    const s = this;
    return {
      getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const r = s.rows[row - 1 + i] || []; const x = []; for (let j = 0; j < nc; j++) x.push(r[col - 1 + j] ?? ''); out.push(x); } return out; },
      setValue: v => { const r = s.rows[row - 1]; while (r.length < col) r.push(''); r[col - 1] = v; },
      getNumberFormat: () => s.formats[col - 1] || 'General'
    };
  }
}

module.exports = { ROOT, CODE_GS, chartjs, TMP, serveApp, makeSite, gasServices, Sheet };
