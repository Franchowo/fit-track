const { chromium } = require('playwright');
const fs = require('fs');
const { ROOT, CODE_GS, chartjs, TMP, serveApp, makeSite, gasServices, Sheet } = require('./lib/common');
const S = TMP;
const prof = (fisico) => ({ fisico, FB: [], VL: [], PK: [] });
const mk = () => ({ status: 'success', data: {
  FRAN: { fisico: [
    { fecha: '01/10/26', mesociclo: '<img src=x onerror="window.__xss=1">', edad: 30, peso: 80, imc: '15,0%', musculo: 35, grasa: 12 },
    { fecha: '08/10/26', mesociclo: 'Volumen', edad: 30, peso: 79.2, imc: '14,5%', grasa_pct: '14,5%', musculo: 35, grasa: 11.5 },
    { fecha: '15/10/26', mesociclo: 'Volumen', edad: 30, peso: null, imc: '-', musculo: null, grasa: null } ],
    FB: [{ fecha: '01/10/26', ex1_kg: 100, ex2_kg: 70, ex3_kg: 130 }], VL: [{ fecha: '02/10/26', ex1_kg: 80, ex1_reps: 8, ex2_kg: 60, ex2_reps: 10, ex3_kg: 110, ex3_reps: 6 }], PK: [] },
  'MAMÁ': prof([]), CLAUDIA: prof([{ fecha: '01/10/26', peso: 60 }]), MIGUEL: prof([]) } });  // backend antiguo con perfiles eliminados
let postMode = 'success', posts = [], getMode = 'ok', getDelay = 0, gets = 0;
let fails = 0; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  let dialogs = 0; p.on('dialog', async d => { dialogs++; await d.accept(); });
  p.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
  await p.route('**/*', async r => {
    const u = r.request().url();
    if (u.startsWith('http://app.test/')) return serveApp(r);
    if (u.includes('chart.js@4.4.7')) return r.fulfill({ body: chartjs, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
    if (u.includes('script.google.com')) {
      const H = { 'access-control-allow-origin': '*' };
      if (r.request().method() === 'POST' && JSON.parse(r.request().postData()).action === 'read') {
        // Apps Script antiguo: no conoce "read" → la app debe recurrir a la lectura por GET
        return r.fulfill({ body: JSON.stringify({ status: 'error', message: 'Error: Hoja no encontrada: undefined' }), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } });
      }
      if (r.request().method() === 'POST') { posts.push(JSON.parse(r.request().postData()));
        if (postMode === 'network') return r.abort();
        return r.fulfill({ body: JSON.stringify({ status: postMode }), contentType: 'application/json', headers: H }); }
      gets++;
      if (getDelay) await new Promise(res => setTimeout(res, getDelay));
      if (getMode === 'network') return r.abort().catch(()=>{});
      return r.fulfill({ body: JSON.stringify(mk()), contentType: 'application/json', headers: H }).catch(()=>{});
    }
    return r.fulfill({ body: '', contentType: 'text/css' });
  });
  const shot = n => p.screenshot({ path: `${S}/shot-${n}.png`, fullPage: false });
  await p.goto('http://app.test/index.html');
  await p.fill('#login-key', 'k'); await p.click('#btn-login');
  await p.waitForSelector('#view-profiles:not(.hidden)');
  check(await p.isVisible('#btn-logout'), 'Logout visible en selector de perfiles');

  // a11y estático
  const a11y = await p.evaluate(() => ({
    divClick: document.querySelectorAll('div[onclick]:not(.sheet-backdrop)').length,
    unlabeled: [...document.querySelectorAll('input, select')].filter(el => !el.getAttribute('aria-label') && !document.querySelector(`label[for="${el.id}"]`)).map(e => e.id)
  }));
  check(a11y.divClick === 0, 'Sin <div onclick> clicables');
  check(JSON.stringify(await p.$$eval('#profile-selector button', bs => bs.map(b => b.textContent.trim()))) === '["FRAN","MAMÁ"]', 'Solo quedan FRAN y MAMÁ');
  await p.goto('http://app.test/index.html#/claudia/registrar/fisico'); await p.waitForTimeout(200);
  check(await p.isVisible('#view-profiles'), 'Ruta de un perfil eliminado → selector de perfiles');
  check(await p.evaluate(() => !('CLAUDIA' in JSON.parse(localStorage.getItem('fittrack_cache_v1')).data)), 'La caché descarta perfiles eliminados');

  await p.click('#profile-selector button:has-text("FRAN")');
  await p.waitForSelector('#view-app:not(.hidden)');
  check(p.url().endsWith('#/fran/resumen/general'), 'Ruta: ' + p.url().split('#')[1]);
  await p.click('.nav-item[data-tab=registrar]'); await p.waitForTimeout(150);
  const unl = await p.evaluate(() => [...document.querySelectorAll('input, select')].filter(el => !el.getAttribute('aria-label') && !document.querySelector(`label[for="${el.id}"]`)).map(e => e.id));
  check(unl.length === 0, 'Todos los campos tienen etiqueta ' + unl.join(','));
  check(await p.getAttribute('#f_peso', 'placeholder') === 'Último: 79,2', 'Placeholder último peso');
  check(await p.getAttribute('#f_grasa_pct', 'placeholder') === 'Último: 14,5', 'Placeholder % graso');
  check(await p.inputValue('#f_mesociclo') === 'Volumen', 'Mesociclo preseleccionado');
  check(await p.textContent('.nav-item[data-tab=registrar]') .then(t => t.includes('Registrar')), 'Nav con texto');

  // pasos
  await p.click('#step1 .btn-save');
  check(await p.textContent('#step-title') === 'Paso 2 de 3 · Composición', 'Título de paso');
  await p.fill('#f_peso', '81,3');
  await p.click('#step2 .btn-back');
  check(await p.isVisible('#step1'), 'Botón Atrás');
  await p.click('.step-dot[data-step="3"]');
  check(await p.isVisible('#step3') && await p.getAttribute('.step-dot[data-step="2"]', 'class').then(c => c.includes('done')), 'Punto de paso pulsable');
  await shot('fisico');

  // borrador + caché instantánea tras recarga (GET lento)
  getDelay = 1500; const g0 = gets;
  await p.reload();
  await p.waitForSelector('#view-app:not(.hidden)', { timeout: 800 });
  check(true, 'Con caché la app abre sin esperar al servidor');
  check(await p.inputValue('#f_peso') === '81,3', 'Borrador restaurado');
  check((await p.textContent('#toast-region')).includes('Borrador recuperado'), 'Toast borrador');
  await p.waitForTimeout(1700); getDelay = 0;
  check(gets > g0, 'Actualización en segundo plano');

  // progreso + back
  await p.click('.nav-item[data-tab=progreso]'); await p.waitForTimeout(300);
  check(await p.textContent('#kpi-peso') === '79,2 kg', 'KPI peso');
  await p.click('#tab-progreso [data-mode=marcas]'); await p.waitForTimeout(200);
  check(p.url().endsWith('#/fran/progreso/marcas'), 'Sub-tab en ruta (replace)');
  await p.goBack(); await p.waitForTimeout(200);
  check(p.url().endsWith('#/fran/registrar/fisico') && await p.isVisible('#tab-registrar'), 'Atrás del navegador vuelve a Registrar');
  await p.goForward(); await p.waitForTimeout(300);
  check(await p.isVisible('#dash-marcas'), 'Adelante → progreso marcas');

  // teclado en tabs
  await p.focus('#tab-progreso [data-mode=marcas]'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(200);
  check(p.url().endsWith('/progreso/fisico'), 'Flechas cambian de sub-tab');

  // hoja de perfiles
  await p.click('#active-profile-badge');
  check(await p.isVisible('#profile-sheet'), 'Hoja de perfiles abre desde el badge');
  await shot('sheet');
  await p.keyboard.press('Escape');
  check(await p.isHidden('#profile-sheet'), 'Escape cierra la hoja');
  await p.click('.nav-item:has-text("Perfil")'); await p.click('.sheet-profile[data-profile="MAMÁ"]'); await p.waitForTimeout(300);
  check(p.url().endsWith('#/mama/progreso/fisico'), 'Cambio de perfil mantiene pestaña: ' + p.url().split('#')[1]);
  check(await p.isVisible('#fisico-empty') && await p.evaluate(() => !chartsInstance.w), 'MAMÁ estado vacío, sin gráficas de FRAN');
  await shot('empty');
  await p.click('#fisico-empty .btn-cta');
  check(p.url().endsWith('#/mama/registrar/fisico'), 'CTA lleva a registrar');
  check(await p.inputValue('#f_peso') === '' && await p.getAttribute('#f_peso', 'placeholder') === '', 'Formulario limpio en otro perfil');

  // historial vacío y XSS en FRAN
  await p.click('.nav-item[data-tab=historial]'); await p.waitForTimeout(200);
  check((await p.textContent('#history-list')).includes('Aún no hay registros'), 'Historial vacío con CTA');
  await p.click('#active-profile-badge'); await p.click('.sheet-profile[data-profile="FRAN"]'); await p.waitForTimeout(200);
  check(await p.evaluate(() => !window.__xss && !document.querySelector('#tableBody img') && !document.querySelector('#history-list img')), 'HTML escapado');
  check((await p.textContent('#history-list')).includes('14,5%'), 'grasa_pct en historial');

  // marcas: récord, stepper, PR al guardar
  await p.click('.nav-item[data-tab=registrar]'); await p.click('#tab-registrar [data-mode=marcas]');
  check((await p.textContent('#pr-ex1')).includes('Récord: 100 kg'), 'Badge récord sentadilla');
  await p.selectOption('#m_mesociclo', 'FB');
  await p.click('button[data-target="m_ex1_kg"][data-step="2.5"]');
  check(await p.inputValue('#m_ex1_kg') === '102,5', 'Stepper parte del último valor: ' + await p.inputValue('#m_ex1_kg'));
  await p.selectOption('#m_mesociclo', 'VL');
  check(await p.isVisible('#vl-hint') && await p.isVisible('#m_ex1_reps'), 'VL muestra reps y aviso');
  check(await p.getAttribute('#m_ex1_reps', 'placeholder') === 'Último: 8', 'Placeholder reps');
  await shot('marcas-vl');
  await p.selectOption('#m_mesociclo', 'FB');
  getDelay = 1500; posts = []; await p.click('#btn-submit-marcas'); await p.waitForTimeout(400);
  check(posts.length === 1 && posts[0].ex1_kg === '102,5' && posts[0].ex1_reps === undefined, 'Payload marcas FB');
  check((await p.textContent('#toast-region')).includes('¡Nuevo récord! Sentadilla 102,5 kg'), 'Toast récord');
  check(p.url().endsWith('#/fran/progreso/marcas') && await p.inputValue('#marcasFilter') === 'FB', 'Tras guardar → progreso marcas FB');
  check(await p.evaluate(() => chartsInstance.m1 && chartsInstance.m1.data.datasets[0].data.some(d => d.y === 102.5)), 'Inserción optimista visible en la gráfica');
  await shot('pr'); await p.waitForTimeout(1300); getDelay = 0;
  check(await p.evaluate(() => !localStorage.getItem('fittrack_draft_fran_marcas')), 'Borrador borrado tras guardar');

  // físico: payload con grasa_pct + imc
  await p.click('.nav-item[data-tab=registrar]'); await p.click('#tab-registrar [data-mode=fisico]');
  await p.click('.step-dot[data-step="2"]'); await p.fill('#f_grasa_pct', '14,2');
  posts = []; await p.click('.step-dot[data-step="3"]'); await p.click('#btn-submit-fis'); await p.waitForTimeout(300);
  check(posts[0] && posts[0].grasa_pct === '14,2' && posts[0].imc === '14,2' && posts[0].peso === '81,3', 'Payload físico (borrador + grasa_pct + imc)');

  // sin red al guardar
  await p.click('.nav-item[data-tab=registrar]'); await p.click('.step-dot[data-step="3"]'); await p.fill('#f_pecho', '100');
  postMode = 'network'; await p.click('#btn-submit-fis'); await p.waitForTimeout(300);
  check((await p.textContent('#toast-region')).includes('guardado en el móvil') && await p.isVisible('#btn-pending'), 'Sin red → a la cola, indicador visible');
  postMode = 'success'; posts = [];
  await p.click('#btn-pending'); await p.waitForTimeout(300);
  check(posts.length === 1 && posts[0].pecho === '100' && await p.isHidden('#btn-pending'), 'Pulsar el indicador envía la cola');

  // logout limpia caché; sin caché + error → skeleton y luego error
  await p.click('#active-profile-badge'); await p.click('.btn-sheet-logout');
  check(await p.isVisible('#view-login') && await p.evaluate(() => !localStorage.getItem('fittrack_cache_v1')), 'Logout limpia caché');
  await p.fill('#login-key', 'k'); await p.click('#btn-login'); await p.waitForSelector('#view-app:not(.hidden)');
  check(p.url().includes('#/fran/'), 'Recuerda el último perfil');
  await p.evaluate(() => { localStorage.removeItem('fittrack_cache_v1'); });
  getMode = 'network'; getDelay = 600;
  await p.goto('http://app.test/index.html#/fran/progreso/fisico'); await p.reload(); await p.waitForTimeout(250);
  // sin caché, initAuth espera al GET (falla) y luego enruta → progreso sin datos → skeleton → reintento
  await p.waitForSelector('#view-app:not(.hidden)', { timeout: 3000 });
  check(await p.isVisible('#dash-skeleton'), 'Skeleton mientras carga');
  await p.waitForTimeout(900);
  check(await p.isVisible('#dash-error'), 'Error con Reintentar');
  getMode = 'ok'; getDelay = 0;
  await p.click('#dash-error .btn-cta'); await p.waitForTimeout(400);
  check(await p.isVisible('#dash-fisico') && await p.textContent('#kpi-peso') === '79,2 kg', 'Reintentar carga los datos');

  check(dialogs === 0, 'Ningún alert() nativo (' + dialogs + ')');
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK'); await b.close(); process.exit(fails ? 1 : 0);
})();
