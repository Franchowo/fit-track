// Fase 5: tema claro/oscuro, contraste, tipografía, historial en tarjetas, gráficas y microinteracciones
const { chromium } = require('playwright'); const fs = require('fs'); const vm = require('vm'); const path = require('path');
const { ROOT, CODE_GS, chartjs, serveApp, gasServices, Sheet } = require('./lib/common');

const FIS = ['Fecha','Mesociclo','Edad','Peso','IMC','Músculo','Hueso','Víscera','Grasa','Pecho','Hombros','Biceps','Abdomen','Pierna'];
const MARKS = ['Fecha','Sentadilla','Press Banca','Peso Muerto'];
const sheets = { FRAN: new Sheet(FIS, { 4: '0.00%' }), FRAN_FB: new Sheet(MARKS), FRAN_PK: new Sheet(MARKS),
  FRAN_VL: new Sheet(['Fecha','Sentadilla','Sentadilla Reps','Press Banca','Press Banca Reps','Peso Muerto','Peso Muerto Reps']) };
const props = { ACCESS_KEY: 'una-clave-bastante-larga' };
const ctx = gasServices({ props, sheets });
vm.createContext(ctx); vm.runInContext(fs.readFileSync(CODE_GS, 'utf8'), ctx);
const D = (y, m, d) => vm.runInContext(`new Date(${y}, ${m - 1}, ${d})`, ctx);
sheets.FRAN.rows.push([D(2026, 10, 1), 'Volumen', 30, 80, 0.15, 35, 3, 5, 12, 100, 120, 38, 85, 60]);
sheets.FRAN.rows.push([D(2026, 10, 15), 'Volumen', 30, 79.2, 0.145, 35.5, 3, 5, 11.5, 101, 120, 38.5, 84, 60]);
sheets.FRAN_FB.rows.push([D(2026, 10, 2), 100, 70, 130]);
sheets.FRAN_FB.rows.push([D(2026, 10, 20), 102.5, 67.5, 130]);
sheets.FRAN_PK.rows.push([D(2026, 11, 1), 110, 75, 140]);

let fails = 0; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };

// Contraste WCAG entre dos colores CSS (calculado en la página)
const CONTRAST = `(a, b) => {
  const rgb = c => { const x = document.createElement('div'); x.style.color = c; document.body.appendChild(x); const v = getComputedStyle(x).color.match(/[\\d.]+/g).map(Number); x.remove(); return v; };
  const lum = c => { const [r, g, b2] = rgb(c).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b2; };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05);
}`;

(async () => {
  const b = await chromium.launch();
  async function newPage(opts = {}) {
    const c = await b.newContext(Object.assign({ viewport: { width: 390, height: 844 } }, opts));
    const p = await c.newPage();
    p.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
    await p.route('**/*', async r => { const u = r.request().url(); const H = { 'access-control-allow-origin': '*' };
      if (u.startsWith('http://app.test/')) return serveApp(r);
      if (u.includes('chart.js')) return r.fulfill({ body: chartjs, contentType: 'application/javascript', headers: H });
      if (u.includes('script.google')) return r.fulfill({ body: ctx.doPost({ postData: { contents: r.request().postData() } }).text, contentType: 'application/json', headers: H });
      return r.fulfill({ body: '' }); });
    return p;
  }
  const v = (p, name) => p.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

  // ---------- HTML sin estilos sueltos ----------
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check(!/style="/.test(html), 'index.html sin atributos style="..."');

  const p = await newPage({ colorScheme: 'dark' });
  await p.goto('http://app.test/'); await p.fill('#login-key', 'una-clave-bastante-larga'); await p.click('#btn-login');
  await p.click('#profile-selector button:has-text("FRAN")'); await p.waitForTimeout(400);

  // ---------- Tipografía ----------
  const font = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
  check(font.startsWith('Inter'), 'Fuente Inter (con alternativas del sistema): ' + font);
  check(await p.evaluate(() => getComputedStyle(document.querySelector('.kpi-value')).fontVariantNumeric) === 'tabular-nums', 'Cifras tabulares en los KPI');

  // ---------- Tema ----------
  check(await p.evaluate(() => !document.documentElement.dataset.theme) && await v(p, '--bg') === '#0f172a', 'Por defecto: automático, sistema en oscuro → oscuro');
  check(await v(p, '--theme') === '#00f3ff', 'Color de FRAN en oscuro: #00f3ff');
  await p.click('#active-profile-badge');
  check(await p.getAttribute('#theme-picker [data-theme-pref="auto"]', 'aria-checked') === 'true', 'Selector de apariencia: Auto marcado');
  await p.click('#theme-picker [data-theme-pref="light"]'); await p.waitForTimeout(150);
  check(await p.evaluate(() => document.documentElement.dataset.theme) === 'light' && await v(p, '--bg') === '#f1f5f9', 'Elegir Claro aplica el modo claro');
  check(await v(p, '--theme') === '#0e7490' && await p.getAttribute('#meta-theme-color', 'content') === '#f1f5f9', 'En claro, FRAN usa su color oscuro legible y la barra del sistema se aclara');
  await p.keyboard.press('Escape');

  // Contraste en modo claro (WCAG AA: 4,5:1 texto normal)
  const cr = async (a, bg) => p.evaluate(`(${CONTRAST})('${a}', '${bg}')`);
  const muted = await cr(await v(p, '--text-muted'), '#ffffff'), main = await cr(await v(p, '--text-main'), '#f1f5f9');
  const accent = await cr(await v(p, '--theme'), '#ffffff'), onAccent = await cr('#ffffff', await v(p, '--theme'));
  check(muted >= 4.5 && main >= 4.5, `Texto legible en claro (secundario ${muted.toFixed(1)}:1, principal ${main.toFixed(1)}:1)`);
  check(accent >= 4.5 && onAccent >= 4.5, `Color de FRAN sobre blanco y texto blanco sobre él ≥ 4,5:1 (${accent.toFixed(1)}:1)`);
  for (const [name, color] of [['MAMÁ', '#a21caf']]) {
    const c = await cr(color, '#ffffff'); check(c >= 4.5, `Color claro de ${name} sobre blanco: ${c.toFixed(1)}:1`);
  }
  // Se recuerda al recargar, sin parpadeo (se aplica antes de cargar la app)
  await p.reload(); await p.waitForTimeout(400);
  check(await p.evaluate(() => document.documentElement.dataset.theme) === 'light', 'La preferencia se recuerda al volver a abrir');

  // ---------- Gráficas siguen al tema y usan la paleta validada ----------
  await p.click('.nav-item[data-tab=progreso]'); await p.waitForTimeout(400);
  const lightChart = await p.evaluate(() => ({ text: Chart.defaults.color, per: chartsInstance.p.data.datasets.map(d => d.borderColor), comp: chartsInstance.c.data.datasets.map(d => d.borderColor) }));
  check(lightChart.text === '#475569', 'Texto de las gráficas en claro');
  check(JSON.stringify(lightChart.per) === JSON.stringify(['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']), 'Perímetros con la paleta validada (claro)');
  check(JSON.stringify(lightChart.comp) === JSON.stringify(['#2a78d6', '#eb6834']), 'Músculo vs grasa: dos colores de la paleta');
  await p.click('#active-profile-badge'); await p.click('#theme-picker [data-theme-pref="dark"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  const darkChart = await p.evaluate(() => ({ text: Chart.defaults.color, per: chartsInstance.p.data.datasets.map(d => d.borderColor) }));
  check(darkChart.text === '#94a3b8' && darkChart.per[0] === '#3987e5', 'Al cambiar de tema las gráficas se repintan con los colores oscuros');
  await p.selectOption('#perimeterFilter', 'abdomen'); await p.waitForTimeout(200);
  check(await p.evaluate(() => chartsInstance.p.data.datasets[0].borderColor) === '#c98500', 'El color sigue a la serie (Abdomen conserva el suyo al filtrar)');
  await p.click('#tab-progreso [data-mode=marcas]'); await p.selectOption('#marcasFilter', 'ALL'); await p.waitForTimeout(300);
  check(JSON.stringify(await p.evaluate(() => chartsInstance.m1.data.datasets.filter(d => d.label !== 'Objetivo').map(d => d.borderColor))) === JSON.stringify(['#3987e5', '#199e70']), 'Comparativa: cada mesociclo conserva su color aunque falte otro (FB = 1.º, PK = 3.º)');
  check(await p.evaluate(() => Chart.defaults.interaction.intersect === false), 'Tooltip al acercarse al punto (sin tener que acertar encima)');

  // ---------- Transición entre pestañas ----------
  await p.click('.nav-item[data-tab=historial]'); await p.waitForTimeout(100);
  check(await p.evaluate(() => document.getElementById('tab-historial').classList.contains('tab-enter')), 'Transición al cambiar de pestaña');

  // ---------- Historial en tarjetas (móvil) con ▲▼ ----------
  await p.click('#tab-historial [data-mode=fisico]'); await p.waitForTimeout(200);
  check(await p.isVisible('#history-list') && await p.isHidden('#detalle-content'), 'Móvil: tarjetas en lugar de la tabla');
  const card0 = (await p.textContent('#history-list .rec-card >> nth=0')).replace(/\s+/g, ' ');
  check(card0.includes('15/10/26') && card0.includes('79,2 kg') && card0.includes('▼ 0,8') && card0.includes('Volumen'), 'Tarjeta física: fecha, peso y ▼ 0,8 respecto al anterior');
  check(card0.includes('% Graso') && card0.includes('14,5%') && card0.includes('Pecho') && card0.includes('▲ 1'), 'Tarjeta física: composición y perímetros con diferencias');
  check(await p.locator('#history-list .rec-card >> nth=0 >> .delta.good, #history-list .rec-card >> nth=0 >> .delta.bad').count() === 0, 'Medidas físicas: flechas neutras (no se juzga si subir es bueno)');
  check(await p.locator('#history-list .rec-card >> nth=1 >> .delta').count() === 0, 'El registro más antiguo no tiene con qué compararse');
  await p.click('#tab-historial [data-mode=fb]'); await p.waitForTimeout(200);
  const mark0 = (await p.textContent('#history-list .rec-card >> nth=0')).replace(/\s+/g, ' ');
  check(mark0.includes('102,5 kg') && mark0.includes('▲ 2,5') && mark0.includes('▼ 2,5') && mark0.includes('Fuerza Base'), 'Tarjeta de marcas con ▲/▼ por ejercicio');
  check(await p.locator('#history-list .rec-card >> nth=0 >> .delta.good').count() === 1 && await p.locator('#history-list .rec-card >> nth=0 >> .delta.bad').count() === 1, 'Marcas: subir en verde, bajar en rojo (con flecha y texto)');
  check((await p.textContent('#history-list .rec-card >> nth=0 >> .delta.good')).includes('más que el anterior'), 'Las flechas tienen texto para lectores de pantalla');
  await p.focus('#history-list .rec-card >> nth=0'); await p.keyboard.press('Enter');
  check(await p.isVisible('#record-sheet') && (await p.textContent('#record-title')).includes('20/10/26'), 'Enter en una tarjeta abre su detalle');
  await p.keyboard.press('Escape');
  // Pantalla ancha: tabla
  await p.setViewportSize({ width: 1000, height: 800 }); await p.waitForTimeout(200);
  check(await p.isVisible('#detalle-content') && await p.isHidden('#history-list'), 'Pantalla ancha: tabla en lugar de tarjetas');
  await p.click('#tableBody tr >> nth=1');
  check((await p.textContent('#record-title')).includes('02/10/26'), 'La tabla sigue abriendo el detalle');
  await p.keyboard.press('Escape'); await p.setViewportSize({ width: 390, height: 844 });

  // ---------- Confeti al batir un récord ----------
  await p.click('.nav-item[data-tab=registrar]'); await p.click('#tab-registrar [data-mode=marcas]'); await p.selectOption('#m_mesociclo', 'PK');
  await p.fill('#m_ex1_kg', '115'); await p.click('#btn-submit-marcas'); await p.waitForTimeout(300);
  check(await p.locator('.confetti i').count() > 20 && (await p.textContent('#toast-region')).includes('Nuevo récord'), 'Confeti y aviso al batir un récord');
  await p.waitForTimeout(2100);
  check(await p.locator('.confetti').count() === 0, 'El confeti desaparece solo');

  // ---------- Automático: sigue al sistema ----------
  const q = await newPage({ colorScheme: 'light', reducedMotion: 'reduce' });
  await q.goto('http://app.test/'); await q.fill('#login-key', 'una-clave-bastante-larga'); await q.click('#btn-login');
  await q.click('#profile-selector button:has-text("FRAN")'); await q.waitForTimeout(400);
  check(await q.evaluate(() => !document.documentElement.dataset.theme) && await v(q, '--bg') === '#f1f5f9' && await v(q, '--theme') === '#0e7490', 'Automático con el sistema en claro → modo claro');
  await q.click('.nav-item[data-tab=registrar]'); await q.click('#tab-registrar [data-mode=marcas]'); await q.selectOption('#m_mesociclo', 'PK');
  await q.fill('#m_ex1_kg', '125'); await q.click('#btn-submit-marcas'); await q.waitForTimeout(300);
  check((await q.textContent('#toast-region')).includes('Nuevo récord') && await q.locator('.confetti').count() === 0, 'Con "reducir movimiento" no hay confeti (sí el aviso)');

  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK'); await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
