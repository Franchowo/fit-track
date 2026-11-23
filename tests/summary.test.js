const { chromium } = require('playwright'); const fs = require('fs'); const vm = require('vm'); const crypto = require('crypto');
const { ROOT, CODE_GS, chartjs, TMP, serveApp, makeSite, gasServices, Sheet } = require('./lib/common');
const S = TMP;
// ---- Apps Script real sobre hojas simuladas ----
const FIS = ['Fecha','Mesociclo','Edad','Peso','IMC','Músculo','Hueso','Víscera','Grasa','Pecho','Hombros','Biceps','Abdomen','Pierna'];
const sheets = { FRAN: new Sheet(FIS, { 4: '0.00%' }), FRAN_FB: new Sheet(['Fecha','Sentadilla','Press Banca','Peso Muerto']),
  FRAN_VL: new Sheet(['Fecha','Sentadilla','Sentadilla Reps','Press Banca','Press Banca Reps','Peso Muerto','Peso Muerto Reps']), FRAN_PK: new Sheet(['Fecha','Sentadilla','Press Banca','Peso Muerto']) };
const props = { ACCESS_KEY: 'k' };
const ctx = gasServices({ props, sheets });
vm.createContext(ctx); vm.runInContext(fs.readFileSync(CODE_GS, 'utf8'), ctx);
const scriptUrls = [];
const D = (y, m, d) => vm.runInContext(`new Date(${y}, ${m - 1}, ${d})`, ctx);

const ago = n => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return vm.runInContext(`new Date(${d.getFullYear()}, ${d.getMonth()}, ${d.getDate()})`, ctx); };
const short = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`; };
[[60, 82], [45, 81], [30, 80], [14, 79.5], [9, 79]].forEach(([n, w]) => sheets.FRAN.rows.push([ago(n), 'Volumen', 30, w, 0.15, 35, 3, 5, 12, 100, 120, 38, 85, 60]));
sheets.FRAN_FB.rows.push([ago(50), 100, 70, 130]);
sheets.FRAN_VL.rows.push([ago(20), 90, 5, 60, 10, 120, 15]);
sheets.FRAN_PK.rows.push([ago(10), 110, 75, 140]);
sheets['MAMÁ'] = new Sheet(FIS);
let fails = 0; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }); const p = await c.newPage();
  p.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
  await p.route('**/*', async r => { const u = r.request().url(); const H = { 'access-control-allow-origin': '*' };
    if (u.startsWith('http://app.test/')) return serveApp(r);
    if (u.includes('chart.js')) return r.fulfill({ body: chartjs, contentType: 'application/javascript', headers: H });
    if (u.includes('script.google')) {
      scriptUrls.push(u);
      if (r.request().method() === 'POST') return r.fulfill({ body: ctx.doPost({ postData: { contents: r.request().postData() } }).text, contentType: 'application/json', headers: H });
      return r.fulfill({ body: ctx.doGet({ parameter: Object.fromEntries(new URL(u).searchParams) }).text, contentType: 'application/json', headers: H });
    }
    return r.fulfill({ body: '' }); });
  const T = sel => p.textContent(sel);
  await p.goto('http://app.test/'); await p.fill('#login-key', 'k'); await p.click('#btn-login');
  await p.click('#profile-selector button:has-text("FRAN")'); await p.waitForTimeout(400);
  check(p.url().endsWith('#/fran/resumen/general') && await p.isVisible('#tab-resumen'), 'Al elegir perfil se abre Inicio');
  check((await T('#toast-region')).includes('clave de acceso es corta'), 'Aviso de clave corta al entrar');
  check(await p.locator('.bottom-nav .nav-item').count() === 5 && (await T('.nav-item[data-tab=resumen]')).includes('Inicio'), 'Barra inferior con Inicio');

  // Resumen
  const hero = await T('#res-hero');
  check(hero.includes('Hola, FRAN') && hero.includes(short(9)) && hero.includes('hace 9 días'), 'Última medición y hace cuántos días');
  check(hero.includes('Toca medición') && hero.includes('hace 10 días'), 'Aviso "Toca medición" (más de 7 días) y últimas marcas');
  const kpis = await T('#res-kpis');
  check(kpis.includes('79 kg') && kpis.includes('-2 kg en 4 semanas'), 'Peso y cambio en 4 semanas: ' + kpis.replace(/\s+/g, ' '));
  check(kpis.includes('15 %'), '% graso');
  check(kpis.includes('325 kg') && kpis.includes('Total = 4,11 × tu peso') && kpis.includes('suma de mejores marcas'), 'Total 325 kg (solo FB/PK) y × 4,11');
  // DOTS calculado a mano con los coeficientes oficiales (hombre, 79 kg, total 325)
  const dm = 325 * 500 / (-307.75076 + 24.0900756 * 79 - 0.1918759221 * 79 ** 2 + 0.0007391293 * 79 ** 3 - 0.000001093 * 79 ** 4);
  check(kpis.includes('Puntos DOTS') && kpis.includes((Math.round(dm * 10) / 10).toString().replace('.', ',')), 'DOTS hombre: ' + dm.toFixed(1));
  // Botón de información del DOTS
  await p.click('#res-kpis .info-btn');
  const info = (await T('#dots-body')).replace(/\s+/g, ' ');
  const perKg = (Math.round(Math.round(dm * 10) / 10 / 325 * 100) / 100).toString().replace('.', ',');
  check(await p.evaluate(() => document.activeElement.id === 'dots-title' && document.querySelector('#dots-sheet .sheet').scrollTop === 0), 'La hoja se abre por el principio');
  check(await p.isVisible('#dots-sheet') && info.includes('Federación Internacional de Powerlifting') && info.includes('DOTS = Total × 500 ÷ f(peso corporal)'), 'Info DOTS: qué es y cómo se calcula');
  check(info.includes('325 kg') && info.includes('79 kg') && info.includes('Hombre') && info.includes((Math.round(dm * 10) / 10).toString().replace('.', ',')), 'Info DOTS: tus números');
  check(info.includes(`unos ${perKg} puntos`) && info.includes('4,11 veces tu peso'), 'Info DOTS: puntos por cada kilo más (' + perKg + ')');
  check(await p.textContent('#dots-body .level-list li.current') === 'Intermedio · tú200–300', 'Info DOTS: nivel resaltado (Intermedio)');
  await p.keyboard.press('Escape');
  check(await p.isHidden('#dots-sheet') && await p.evaluate(() => document.activeElement.classList.contains('info-btn')), 'Escape cierra y devuelve el foco al botón');
  const df = await p.evaluate(() => [dots(200, 60, 'F'), dots(200, 60, 'M'), dots(300, 250, 'M') === dots(300, 210, 'M'), dots(null, 60, 'F')]);
  check(Math.abs(df[0] - 221.7) < 0.15 && df[1] < df[0] && df[2] === true && df[3] === null, 'DOTS mujer (200 kg a 60 kg ≈ 221,7), distinto de hombre, peso acotado: ' + df.join(' · '));
  const rec = await T('#res-records');
  const recRows = await p.$$eval('#res-records .res-row', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  check(recRows[0].includes('Sentadilla') && recRows[0].includes('Peaking') && recRows[0].endsWith('110 kg'), 'Récord sentadilla: 110 (Peaking) · ' + recRows[0]);
  check(recRows[1].includes('Press Banca') && recRows[1].endsWith('75 kg') && !recRows[1].includes('80'), 'Récord banca: 75 de Peaking, no el 1RM estimado de Volumen (80)');
  check(recRows[2].endsWith('140 kg') && !rec.includes('Volumen') && !rec.includes('×'), 'Ningún récord sale de Volumen');
  check(recRows[3].includes('Total') && recRows[3].endsWith('325 kg'), 'Total en récords');
  const prs = await T('#res-prs');
  check((prs.match(/🏆/g) || []).length === 3 && !prs.includes('105') && prs.includes('75 kg (+5)') && prs.includes('110 kg (+10)') && prs.includes('140 kg (+10)'), 'Récords recientes: 3, solo de tomas de marcas');
  check(await p.$eval('#res-prs .res-row', e => e.textContent).then(t => t.includes(short(10))), 'Récords recientes ordenados del más nuevo al más antiguo');

  // Objetivos
  check((await T('#res-goals')).includes('Aún no tienes objetivos'), 'Sin objetivos: invitación a añadir');
  await p.click('#res-goals .btn-cta');
  check(await p.isVisible('#goals-sheet') && await p.getAttribute('#g_peso', 'placeholder') === 'Actual: 79' && await p.getAttribute('#g_ex1', 'placeholder') === 'Actual: 110', 'Hoja de objetivos con valores actuales');
  await p.fill('#g_peso', '785'); await p.click('#btn-goals-save');
  check((await T('#goals-sheet')).includes('fuera de rango'), 'Validación de objetivos');
  await p.fill('#g_peso', '75'); await p.fill('#g_ex1', '120'); await p.fill('#g_ex2', '75');
  await p.click('#btn-goals-save'); await p.waitForTimeout(300);
  check(await p.isHidden('#goals-sheet') && (await T('#toast-region')).includes('Objetivos guardados'), 'Objetivos guardados');
  const saved = JSON.parse(props.GOALS_FRAN);
  check(saved.peso.target === 75 && saved.peso.start === 79 && saved.ex1.start === 110 && saved.ex2.target === 75, 'Guardados en el servidor con su punto de partida');
  const goalsTxt = await T('#res-goals');
  check(goalsTxt.includes('79 → 75 kg') && goalsTxt.includes('0 %') && goalsTxt.includes('Fecha estimada'), 'Peso: progreso y fecha estimada según tendencia');
  check(goalsTxt.includes('110 → 120 kg') && /Sentadilla[\s\S]*Fecha estimada/.test(goalsTxt), 'Sentadilla: fecha estimada');
  check(goalsTxt.includes('75 → 75 kg') && goalsTxt.includes('¡Conseguido!') && goalsTxt.includes('100 %'), 'Banca: objetivo conseguido');
  // Persisten tras recargar (vienen del servidor) y se conserva el punto de partida al no cambiar
  await p.evaluate(() => localStorage.removeItem('fittrack_cache_v1')); await p.reload(); await p.waitForTimeout(600);
  check((await T('#res-goals')).includes('79 → 75 kg'), 'Objetivos se cargan del servidor');
  await p.click('.res-card-head .btn-link'); await p.fill('#g_ex2', ''); await p.click('#btn-goals-save'); await p.waitForTimeout(300);
  const saved2 = JSON.parse(props.GOALS_FRAN);
  check(!saved2.ex2 && saved2.peso.startDate === saved.peso.startDate && saved2.peso.start === 79, 'Quitar un objetivo conserva los demás tal cual');

  // Guardar una marca de Volumen más alta que el récord NO es un récord
  await p.click('.nav-item[data-tab=registrar]'); await p.click('#tab-registrar [data-mode=marcas]');
  check((await T('#pr-ex1')).includes('Récord: 110 kg'), 'Formulario: récord de sentadilla 110 (sin contar Volumen)');
  await p.selectOption('#m_mesociclo', 'VL'); await p.fill('#m_ex1_kg', '130'); await p.fill('#m_ex1_reps', '3');
  await p.click('#btn-submit-marcas'); await p.waitForTimeout(400);
  check(!(await T('#toast-region')).includes('Nuevo récord') && (await T('#toast-region')).includes('Datos guardados'), 'Volumen 130 kg no cuenta como récord');
  await p.click('.nav-item[data-tab=registrar]'); await p.selectOption('#m_mesociclo', 'PK'); await p.fill('#m_ex1_kg', '115');
  await p.click('#btn-submit-marcas'); await p.waitForTimeout(400);
  check((await T('#toast-region')).includes('¡Nuevo récord! Sentadilla 115 kg'), 'Peaking 115 kg sí es récord');
  await p.click('.nav-item[data-tab=resumen]'); await p.waitForTimeout(300);
  check((await T('#res-records')).includes('115 kg') && (await T('#res-kpis')).includes('330 kg'), 'Resumen actualizado: sentadilla 115, Total 330');

  // Progreso: tendencia + objetivo en la gráfica de peso
  await p.click('.nav-item[data-tab=progreso]'); await p.click('#tab-progreso [data-mode=fisico]'); await p.waitForTimeout(300);
  const wl = await p.evaluate(() => chartsInstance.w.data.datasets.map(d => d.label));
  check(JSON.stringify(wl) === '["Peso","Tendencia","Objetivo"]', 'Gráfica de peso: ' + wl.join(', '));
  const trend = await p.evaluate(() => chartsInstance.w.data.datasets[1].data.map(d => d.y));
  check(trend[0] === 82 && trend[1] === 81.7 && trend.at(-1) > 79, 'Tendencia suavizada (EWMA): ' + trend.join(' · '));
  // Comparar mesociclos
  await p.click('#tab-progreso [data-mode=marcas]'); await p.selectOption('#marcasFilter', 'ALL'); await p.waitForTimeout(300);
  const cmp = await p.evaluate(() => [1, 2, 3].map(n => chartsInstance['m' + n].data.datasets.map(d => d.label + ':' + d.data.map(x => x.y).join('/'))));
  check(JSON.stringify(cmp[0]) === JSON.stringify(['Fuerza Base:100', 'Volumen:105/143', 'Peaking:110/115', 'Objetivo:120/120']), 'Sentadilla por mesociclo: ' + cmp[0].join(' | '));
  check(JSON.stringify(cmp[2]) === JSON.stringify(['Fuerza Base:130', 'Peaking:140']), 'Peso muerto sin el VL de 15 reps');
  check(await p.isVisible('#e1rm-note'), 'Nota explicativa del 1RM');
  await p.selectOption('#marcasFilter', 'FB'); await p.waitForTimeout(200);
  check(await p.isHidden('#e1rm-note') && await p.evaluate(() => chartsInstance.m1.data.datasets.length === 1), 'Vuelta a la vista normal');

  // Exportar CSV
  await p.click('.nav-item[data-tab=historial]'); await p.click('#tab-historial [data-mode=vl]'); await p.waitForTimeout(200);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btn-export')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  check(dl.suggestedFilename().startsWith('fittrack-fran-vl-') && dl.suggestedFilename().endsWith('.csv'), 'Nombre del archivo: ' + dl.suggestedFilename());
  check(csv.charCodeAt(0) === 0xfeff && csv.split('\r\n')[0] === '﻿Fecha;Sentadilla (kg);Sentadilla reps;Sentadilla 1RM est. (kg);Press Banca (kg);Press Banca reps;Press Banca 1RM est. (kg);Peso Muerto (kg);Peso Muerto reps;Peso Muerto 1RM est. (kg)', 'Cabecera CSV (BOM, ;)');
  check(csv.split('\r\n')[1] === `${short(20)};90;5;105;60;10;80;120;15;`, 'Fila CSV: ' + csv.split('\r\n')[1]);
  await p.click('#tab-historial [data-mode=fisico]');
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#btn-export')]);
  const csv2 = fs.readFileSync(await dl2.path(), 'utf8').split('\r\n');
  check(csv2.length === 6 && csv2[1].startsWith(`${short(60)};Volumen;30;82;15;35`), 'CSV físico con decimales en coma: ' + csv2[1]);

  // Perfil sin datos
  await p.click('#active-profile-badge'); await p.click('.sheet-profile[data-profile="MAMÁ"]'); await p.click('.nav-item[data-tab=resumen]'); await p.waitForTimeout(400);
  const h2 = await T('#res-hero');
  check(h2.includes('Aún no hay mediciones') && h2.includes('registra la primera') && (await T('#res-kpis')).includes('faltan marcas'), 'Perfil vacío: resumen con invitaciones');
  await p.click('#res-hero .btn-cta >> nth=0'); await p.waitForTimeout(150);
  check(p.url().endsWith('#/mama/registrar/fisico'), 'Botón rápido "Físico" lleva al registro');
  await p.click('.nav-item[data-tab=resumen]'); await p.click('#res-kpis .info-btn');
  const infoEmpty = await T('#dots-body');
  check(infoEmpty.includes('registrar tu peso') && infoEmpty.includes('cada ejercicio') && infoEmpty.includes('Mujer') === false && await p.locator('#dots-body .level-list li.current').count() === 0, 'Info DOTS sin datos: explica qué falta');
  await p.click('#dots-sheet .btn-save'); check(await p.isHidden('#dots-sheet'), 'Botón "Entendido" cierra');

  check(scriptUrls.length > 3 && scriptUrls.every(u => !u.includes('key=')), `La clave nunca viaja en la URL (${scriptUrls.length} peticiones)`);
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK'); await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
