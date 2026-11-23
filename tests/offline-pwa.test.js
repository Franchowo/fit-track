const { chromium } = require('playwright');
const fs = require('fs'); const { spawn } = require('child_process');
const { ROOT, CODE_GS, chartjs, TMP, serveApp, makeSite, gasServices, Sheet } = require('./lib/common');
const SITE = makeSite(); const BASE = 'http://localhost:8765/';
const empty = () => ({ fisico: [], FB: [], VL: [], PK: [] });
const db = { FRAN: { fisico: [{ fecha: '01/10/26', peso: 80, grasa: 12 }], FB: [{ fecha: '01/10/26', ex1_kg: 100, ex2_kg: 70, ex3_kg: 130 }], VL: [], PK: [] }, 'MAMÁ': empty(), CLAUDIA: empty(), MIGUEL: empty() };
const processed = new Set(); let postMode = 'ok', posts = 0, getUrls = [];
const toShort = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y.slice(-2)}`; };
function store(b) {
  if (b.id && processed.has(b.id)) return { status: 'success', duplicate: true };
  if (b.type === 'fisico') db[b.profile].fisico.push({ fecha: toShort(b.fecha), peso: parseFloat((b.peso || '').replace(',', '.')) || null });
  else { const r = { fecha: toShort(b.fecha) }; for (let i = 1; i <= 4; i++) if (b['ex' + i + '_kg'] !== undefined) r['ex' + i + '_kg'] = parseFloat(b['ex' + i + '_kg'].replace(',', '.')) || null; db[b.profile][b.mesociclo_marca].push(r); }
  if (b.id) processed.add(b.id); return { status: 'success' };
}
let fails = 0; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const server = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1', '--directory', SITE], { stdio: 'ignore' });
(async () => {
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); let dialogs = 0; p.on('dialog', d => { dialogs++; d.accept(); });
  p.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
  const H = { 'access-control-allow-origin': '*' };
  await ctx.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/, r => r.request().url().includes('chart.js') ? r.fulfill({ body: chartjs, contentType: 'application/javascript', headers: H }) : r.fulfill({ body: '/* fa */', contentType: 'text/css', headers: H }));
  await ctx.route(/script\.google\.com/, async r => {
    const req = r.request();
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData());
      if (body.action === 'read') { getUrls.push('read?profile=' + body.profile); return read(r, body.key, body.profile); }
      posts++;
      if (postMode === 'network') return r.abort();
      if (postMode === 'lost') { store(body); return r.abort(); }
      if (postMode === 'error') return r.fulfill({ body: JSON.stringify({ status: 'error', message: 'Hoja no encontrada: X' }), contentType: 'application/json', headers: H });
      if (postMode === 'unauthorized' || body.key !== 'k') return r.fulfill({ body: JSON.stringify({ status: 'unauthorized' }), contentType: 'application/json', headers: H });
      return r.fulfill({ body: JSON.stringify(store(body)), contentType: 'application/json', headers: H });
    }
    getUrls.push(req.url()); const u = new URL(req.url());
    return read(r, u.searchParams.get('key'), u.searchParams.get('profile'));
  });
  async function read(r, key, prof) {
    if (key !== 'k') return r.fulfill({ body: JSON.stringify({ status: 'unauthorized' }), contentType: 'application/json', headers: H });
    if (postMode === 'network') return r.abort();
    const data = prof === 'none' ? {} : prof ? { [prof]: db[prof] } : db;
    return r.fulfill({ body: JSON.stringify({ status: 'success', data: JSON.parse(JSON.stringify(data)) }), contentType: 'application/json', headers: H });
  }
  const toast = () => p.textContent('#toast-region');
  const fbRows = () => db.FRAN.FB.length;

  // Manifest e iconos
  const man = await (await p.request.get(BASE + 'manifest.json')).json();
  const iconsOk = await Promise.all(man.icons.map(async i => (await p.request.get(BASE + i.src)).ok()));
  check(iconsOk.every(Boolean) && man.icons.some(i => i.purpose === 'maskable'), 'Manifest: iconos accesibles, incluido maskable');

  await p.goto(BASE + 'index.html');
  await p.fill('#login-key', 'k'); await p.click('#btn-login'); await p.waitForSelector('#view-profiles:not(.hidden)');
  check(getUrls.at(-1).includes('profile=none'), 'Login sin perfil previo solo valida la clave');
  await p.click('#profile-selector button:has-text("FRAN")'); await p.waitForTimeout(300);
  check(getUrls.at(-1).includes('profile=FRAN'), 'Al abrir FRAN se descarga solo FRAN');

  // Service worker
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true), null, { timeout: 5000 });
  await p.reload(); await p.waitForSelector('#view-app:not(.hidden)');
  check(await p.evaluate(() => !!navigator.serviceWorker.controller), 'Service worker controla la página');
  check(p.url().endsWith('#/fran/resumen/general'), 'Ruta conservada tras recargar');
  await p.click('.nav-item[data-tab=registrar]');

  // Guardado con respuesta perdida (el servidor SÍ guardó) → cola
  await p.click('#tab-registrar [data-mode=marcas]'); await p.selectOption('#m_mesociclo', 'FB'); await p.fill('#m_ex1_kg', '105');
  postMode = 'lost'; const before = fbRows();
  await p.click('#btn-submit-marcas'); await p.waitForTimeout(400);
  check((await toast()).includes('guardado en el móvil'), 'Sin respuesta → guardado en el móvil');
  check((await toast()).includes('¡Nuevo récord! Sentadilla 105 kg'), 'Récord también sin conexión');
  check(await p.isVisible('#btn-pending') && await p.textContent('#pending-count') === '1', 'Indicador: 1 pendiente');
  check(p.url().endsWith('#/fran/progreso/marcas') && await p.evaluate(() => chartsInstance.m1.data.datasets[0].data.some(d => d.y === 105)), 'El pendiente aparece en la gráfica');
  await p.click('.nav-item[data-tab=historial]'); await p.click('#tab-historial [data-mode=fb]');
  check(await p.locator('#history-list .pending-icon').count() === 1, 'Historial marca la fila como pendiente');

  // Reinicio de la app sin conexión: la cola sobrevive
  postMode = 'network'; await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('#view-app:not(.hidden)', { timeout: 5000 });
  check(true, 'La app abre sin conexión (service worker)');
  check(await p.evaluate(() => typeof Chart === 'function'), 'Chart.js disponible sin conexión');
  check(await p.textContent('#pending-count') === '1' && await p.locator('#history-list .pending-icon').count() === 1, 'La cola sobrevive al reinicio');
  await p.click('#btn-pending'); await p.waitForTimeout(300);
  check((await toast()).includes('Sigue sin conexión'), 'Reintento manual sin red avisa');

  // Vuelve la conexión → envío automático, sin duplicar
  postMode = 'ok'; await ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForTimeout(600);
  check((await toast()).includes('Registro pendiente enviado'), 'Envío automático al volver la conexión');
  check(fbRows() === before + 1, `Sin duplicados en el servidor (${fbRows() - before} fila)`);
  check(await p.isHidden('#btn-pending') && await p.locator('#history-list .pending-icon').count() === 0, 'Indicador y marca de pendiente desaparecen');
  check((await p.textContent('#history-list')).includes('105'), 'El registro sigue en el historial');

  // Error del servidor al vaciar la cola → Descartar
  await p.click('.nav-item[data-tab=registrar]'); await p.click('#tab-registrar [data-mode=fisico]');
  await p.click('.step-dot[data-step="2"]'); await p.fill('#f_peso', '79'); await p.click('.step-dot[data-step="3"]');
  postMode = 'network'; await p.click('#btn-submit-fis'); await p.waitForTimeout(300);
  postMode = 'error'; await p.click('#btn-pending'); await p.waitForTimeout(300);
  check((await toast()).includes('rechazó un registro: Hoja no encontrada'), 'Error del servidor visible con Descartar');
  await p.waitForTimeout(300); await p.evaluate(() => flushQueue()); await p.waitForTimeout(200);
  const postsBefore = posts; await p.evaluate(() => flushQueue()); await p.waitForTimeout(200);
  check(posts === postsBefore, 'Los rechazados no se reintentan solos');
  await p.click('.toast-action:has-text("Descartar")'); await p.waitForTimeout(200);
  check(await p.isHidden('#btn-pending'), 'Descartar vacía la cola');

  // Clave caducada al guardar → se guarda en cola y se envía al volver a entrar
  await p.click('.nav-item[data-tab=registrar]'); await p.click('#tab-registrar [data-mode=fisico]');
  await p.click('.step-dot[data-step="2"]'); await p.fill('#f_peso', '78,5'); await p.click('.step-dot[data-step="3"]');
  postMode = 'unauthorized'; await p.click('#btn-submit-fis'); await p.waitForTimeout(300);
  check(await p.isVisible('#view-login') && await p.evaluate(() => JSON.parse(localStorage.getItem('fittrack_queue_v1')).length === 1), 'Clave inválida → login, registro en cola');
  postMode = 'ok'; const fis = db.FRAN.fisico.length;
  await p.fill('#login-key', 'k'); await p.click('#btn-login'); await p.waitForTimeout(600);
  check(db.FRAN.fisico.length === fis + 1 && db.FRAN.fisico.at(-1).peso === 78.5, 'Tras volver a entrar se envía');
  check(getUrls.at(-2).includes('profile=FRAN') || getUrls.some(u => u.includes('profile=FRAN')), 'Login con último perfil descarga ese perfil');

  // Acceso directo del icono
  await p.goto(BASE + 'index.html#/_ultimo/registrar/marcas'); await p.waitForTimeout(300);
  check(p.url().endsWith('#/fran/registrar/marcas') && await p.isVisible('#form-marcas'), 'Acceso directo _ultimo → último perfil');

  // Nueva versión publicada → aviso "Recargar"
  // Publicación que cambia a la vez el HTML y un JS (con su nueva huella)
  const crypto = require('crypto');
  fs.appendFileSync(SITE + '/js/main.js', '\nwindow.__v2 = true;\n');
  const newHash = crypto.createHash('sha256').update(fs.readFileSync(SITE + '/js/main.js')).digest('hex').slice(0, 10);
  fs.writeFileSync(SITE + '/index.html', fs.readFileSync(SITE + '/index.html', 'utf8')
    .replace(/js\/main\.js\?v=[0-9a-f]+/, 'js/main.js?v=' + newHash)
    .replace('</body>', '<span id="v2-marker"></span></body>'));
  await p.reload(); await p.waitForTimeout(1200);
  check((await toast()).includes('nueva versión'), 'Aviso de nueva versión');
  await p.click('.toast-action:has-text("Recargar")'); await p.waitForTimeout(800);
  check(await p.locator('#v2-marker').count() === 1, 'Recargar carga la versión nueva');
  check(await p.evaluate(() => window.__v2 === true), 'Y con el JS nuevo (HTML y JS nunca se mezclan)');
  await ctx.setOffline(true); await p.reload(); await p.waitForSelector('#view-app:not(.hidden)', { timeout: 5000 });
  check(await p.evaluate(() => window.__v2 === true) && await p.locator('#v2-marker').count() === 1, 'La versión nueva también funciona sin conexión');
  const cached = await p.evaluate(async () => (await (await caches.open('fittrack-shell-v2')).keys()).map(r => r.url).filter(u => u.includes('/js/main.js')));
  check(cached.length === 1 && cached[0].includes(newHash), 'La caché solo guarda la versión vigente de cada JS');
  await ctx.setOffline(false);

  check(dialogs === 0, 'Sin diálogos nativos');
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
  await b.close(); server.kill(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); server.kill(); process.exit(1); });
