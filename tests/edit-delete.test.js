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
// Fila del 15/10 añadida al final, después de otra más reciente: la app debe ordenarlas por fecha
sheets.FRAN.rows.push([D(2026, 10, 1), 'Volumen', 30, 80, 0.15, 35, 3, 5, 12, 100, 120, 38, 85, 60]);
sheets.FRAN.rows.push([D(2026, 11, 1), 'Volumen', 30, 78, 0.14, 35.5, 3, 5, 11, 101, 121, 38, 84, 60]);
sheets.FRAN.rows.push([D(2026, 10, 15), 'Volumen', 30, 79, 0.145, 35.2, 3, 5, 11.5, 100, 120, 38, 84, 60]);
sheets.FRAN_VL.rows.push([D(2026, 10, 2), 80, 8, 60, 10, 110, 6]);
let offline = false, stripRows = false;
const strip = body => { const j = JSON.parse(body); Object.values(j.data).forEach(pd => Object.values(pd).forEach(a => Array.isArray(a) && a.forEach(x => { delete x.row; delete x.rev; }))); return JSON.stringify(j); };
let fails = 0; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
  let dialogs = 0; p.on('dialog', d => { dialogs++; d.accept(); });
  await p.route('**/*', async r => { const u = r.request().url(); const H = { 'access-control-allow-origin': '*' };
    if (u.startsWith('http://app.test/')) return serveApp(r);
    if (u.includes('chart.js')) return r.fulfill({ body: chartjs, contentType: 'application/javascript', headers: H });
    if (u.includes('script.google')) {
      scriptUrls.push(u);
      if (offline) return r.abort();
      if (r.request().method() === 'POST') {
        let body = ctx.doPost({ postData: { contents: r.request().postData() } }).text;
        if (stripRows && JSON.parse(r.request().postData()).action === 'read') body = strip(body);
        return r.fulfill({ body, contentType: 'application/json', headers: H });
      }
      const params = Object.fromEntries(new URL(u).searchParams);
      let body = ctx.doGet({ parameter: params }).text;
      if (stripRows) body = strip(body);
      return r.fulfill({ body, contentType: 'application/json', headers: H });
    }
    return r.fulfill({ body: '' }); });
  const toast = () => p.textContent('#toast-region');
  const firstCells = () => p.$$eval('#tableBody tr', trs => trs.map(t => t.children[0].textContent.trim()));
  await p.goto('http://app.test/'); await p.fill('#login-key', 'k'); await p.click('#btn-login');
  await p.click('#profile-selector button:has-text("FRAN")'); await p.waitForTimeout(300);
  await p.click('.nav-item[data-tab=registrar]'); await p.waitForTimeout(150);

  // Orden por fecha y eje temporal
  check(await p.getAttribute('#f_peso', 'placeholder') === 'Último: 78', 'Placeholder usa el registro más reciente por fecha');
  await p.click('.nav-item[data-tab=progreso]'); await p.waitForTimeout(300);
  check(await p.textContent('#kpi-peso') === '78 kg' && (await p.textContent('#kpi-peso-sub')).includes('-1,0 kg'), 'KPI con orden por fecha: ' + await p.textContent('#kpi-peso-sub'));
  const xs = await p.evaluate(() => chartsInstance.w.data.datasets[0].data.map(d => d.x));
  check(xs.length === 3 && xs[0] < xs[1] && xs[1] < xs[2], 'Puntos de la gráfica en orden cronológico');
  check(await p.evaluate(() => chartsInstance.w.options.scales.x.type === 'linear'), 'Eje X temporal');
  await p.click('.nav-item[data-tab=historial]'); await p.waitForTimeout(200);
  check(JSON.stringify(await firstCells()) === JSON.stringify(['01/11/26', '15/10/26', '01/10/26']), 'Historial: más reciente primero');
  check(await p.isVisible('#table-hint'), 'Pista "Toca un registro"');

  // Editar
  await p.click('#tableBody tr >> nth=1');
  check(await p.isVisible('#record-sheet') && (await p.textContent('#record-title')).includes('15/10/26'), 'Detalle del registro');
  check((await p.textContent('#record-summary')).includes('14,5%') && (await p.textContent('#record-summary')).includes('79 kg'), 'Resumen con % graso y peso');
  await p.click('#btn-rec-edit'); await p.waitForTimeout(150);
  check(p.url().endsWith('/registrar/fisico') && await p.isVisible('#edit-banner-fisico'), 'Modo edición con aviso');
  check(await p.inputValue('#f_fecha') === '2026-10-15' && await p.inputValue('#f_peso') === '79' && await p.inputValue('#f_grasa_pct') === '14,5', 'Formulario relleno con el registro');
  check((await p.textContent('#btn-submit-fis')).includes('Guardar cambios'), 'Botón "Guardar cambios"');
  await p.click('.step-dot[data-step="2"]'); await p.fill('#f_peso', '79,6'); await p.click('.step-dot[data-step="3"]');
  await p.click('#btn-submit-fis'); await p.waitForTimeout(300);
  check((await toast()).includes('Cambios guardados') && p.url().endsWith('/historial/fisico'), 'Guardado → vuelve al historial');
  check(sheets.FRAN.rows[3][3] === 79.6 && sheets.FRAN.rows.length === 4, 'La fila correcta cambia en la hoja (sin filas nuevas)');
  check(Math.abs(sheets.FRAN.rows[3][4] - 0.145) < 1e-9, 'IMC se mantiene como porcentaje');
  check((await p.textContent('#tableBody')).includes('79,6'), 'El historial muestra el cambio');
  check(await p.isHidden('#edit-banner-fisico') && (await p.textContent('#btn-submit-fis')).includes('Sincronizar'), 'Sale del modo edición');

  // Conflicto: alguien cambia la fila en la hoja después de cargarla
  sheets.FRAN.rows[2][3] = 77.7;
  await p.click('#tableBody tr >> nth=0'); await p.click('#btn-rec-edit');
  await p.click('.step-dot[data-step="2"]'); await p.fill('#f_peso', '76'); await p.click('.step-dot[data-step="3"]');
  await p.click('#btn-submit-fis'); await p.waitForTimeout(400);
  check((await toast()).includes('ha cambiado en la hoja') && sheets.FRAN.rows[2][3] === 77.7, 'Conflicto detectado: la hoja no se sobrescribe');
  check((await p.textContent('#tableBody')).includes('77,7'), 'Tras el conflicto se recargan los datos');

  // Borrador intacto al editar y cancelar
  await p.click('.nav-item[data-tab=registrar]'); await p.click('#tab-registrar [data-mode=fisico]'); await p.fill('#f_edad', '33');
  await p.click('.nav-item[data-tab=historial]'); await p.click('#tableBody tr >> nth=0'); await p.click('#btn-rec-edit');
  check(await p.inputValue('#f_edad') === '30', 'Al editar se ve el registro, no el borrador');
  await p.click('#edit-banner-fisico button'); await p.waitForTimeout(200);
  check(p.url().endsWith('/historial/fisico'), 'Cancelar vuelve al historial');
  await p.click('.nav-item[data-tab=registrar]');
  check(await p.inputValue('#f_edad') === '33', 'El borrador anterior se recupera');

  // Borrar (con confirmación) y editar una fila que estaba debajo
  await p.click('.nav-item[data-tab=historial]');
  await p.click('#tableBody tr >> nth=2'); // 01/10/26 (fila 2 de la hoja)
  await p.click('#btn-rec-delete');
  check(await p.isVisible('#record-confirm') && sheets.FRAN.rows.length === 4, 'Pide confirmación antes de borrar');
  await p.click('#btn-rec-confirm'); await p.waitForTimeout(300);
  check(sheets.FRAN.rows.length === 3 && !sheets.FRAN.rows.some(r => r[3] === 80), 'Fila borrada de la hoja');
  check((await toast()).includes('Registro borrado') && (await firstCells()).length === 2, 'Historial actualizado');
  await p.click('#tableBody tr >> nth=1'); await p.click('#btn-rec-edit');   // 15/10 (ahora fila 3 de la hoja)
  await p.click('.step-dot[data-step="2"]'); await p.fill('#f_peso', '79,9'); await p.click('.step-dot[data-step="3"]');
  await p.click('#btn-submit-fis'); await p.waitForTimeout(300);
  check(sheets.FRAN.rows[2][3] === 79.9 && sheets.FRAN.rows[1][3] === 77.7, 'Tras borrar, editar la fila de debajo toca la fila correcta');

  // Marcas VL: editar reps
  await p.click('#tab-historial [data-mode=vl]'); await p.click('#tableBody tr >> nth=0'); await p.click('#btn-rec-edit');
  check(await p.inputValue('#m_ex1_reps') === '8' && await p.isDisabled('#m_mesociclo'), 'Marcas: reps cargadas y mesociclo bloqueado');
  await p.fill('#m_ex1_reps', '9'); await p.click('#btn-submit-marcas'); await p.waitForTimeout(300);
  check(sheets.FRAN_VL.rows[1][2] === 9 && sheets.FRAN_VL.rows.length === 2, 'VL: reps editadas en su columna');
  check(!(await p.isDisabled('#m_mesociclo')), 'Mesociclo desbloqueado al terminar');

  // Teclado: Enter abre, Escape cierra
  await p.focus('#tableBody tr >> nth=0'); await p.keyboard.press('Enter');
  check(await p.isVisible('#record-sheet'), 'Enter en una fila abre el detalle');
  await p.keyboard.press('Escape'); check(await p.isHidden('#record-sheet'), 'Escape lo cierra');

  // Registro pendiente (sin red): editar en la cola y borrar
  await p.click('.nav-item[data-tab=registrar]'); await p.click('#tab-registrar [data-mode=marcas]'); await p.selectOption('#m_mesociclo', 'FB');
  await p.fill('#m_ex1_kg', '90'); offline = true; await p.click('#btn-submit-marcas'); await p.waitForTimeout(300);
  await p.click('.nav-item[data-tab=historial]'); await p.click('#tab-historial [data-mode=fb]');
  await p.click('#tableBody tr >> nth=0');
  check((await p.textContent('#record-title')).includes('pendiente') && !(await p.isDisabled('#btn-rec-edit')), 'Pendiente: editable sin conexión');
  await p.click('#btn-rec-edit'); await p.fill('#m_ex1_kg', '95'); await p.click('#btn-submit-marcas'); await p.waitForTimeout(200);
  check(await p.evaluate(() => queue.length === 1 && queue[0].payload.ex1_kg === '95'), 'Edición de un pendiente actualiza la cola');
  await p.click('#tableBody tr >> nth=0'); await p.click('#btn-rec-delete'); await p.click('#btn-rec-confirm'); await p.waitForTimeout(200);
  check(await p.evaluate(() => queue.length === 0) && await p.isHidden('#btn-pending'), 'Borrar un pendiente lo quita de la cola');
  // Sin red no se puede editar un registro guardado
  await p.click('#tab-historial [data-mode=vl]'); await p.click('#tableBody tr >> nth=0'); await p.click('#btn-rec-edit');
  await p.click('#btn-submit-marcas'); await p.waitForTimeout(200);
  check((await p.textContent('#form-error-marcas')).includes('hace falta conexión') && await p.isVisible('#edit-banner-marcas'), 'Sin red: aviso y los cambios se quedan en el formulario');
  await p.click('#edit-banner-marcas button'); offline = false;

  check(scriptUrls.every(u => !u.includes('key=')), 'La clave nunca viaja en la URL');
  // Backend antiguo (sin fila/huella) → no editable, con explicación
  stripRows = true; await p.evaluate(() => { localStorage.removeItem('fittrack_cache_v1'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.nav-item[data-tab=historial]'); await p.click('#tab-historial [data-mode=fisico]'); await p.waitForTimeout(200);
  await p.click('#tableBody tr >> nth=0');
  check(await p.isDisabled('#btn-rec-edit') && (await p.textContent('#record-note')).includes('Apps Script'), 'Backend antiguo: edición desactivada con explicación');

  // Móvil con un registro pendiente de un perfil eliminado
  stripRows = false;
  await p.evaluate(() => localStorage.setItem('fittrack_queue_v1', JSON.stringify([{ id: 'old-1', ts: 1, payload: { id: 'old-1', profile: 'MIGUEL', type: 'marcas', mesociclo_marca: 'FB', fecha: '2026-11-01', ex1_kg: '10', ex4_kg: '100' } }])));
  await p.reload(); await p.waitForTimeout(800);
  check(await p.isVisible('#view-app') && (await toast()).includes('rechazó un registro: Error: Perfil desconocido'), 'Pendiente de perfil eliminado: rechazado sin romper la app');
  await p.click('.toast-error .toast-action:has-text("Descartar")'); await p.waitForTimeout(200);
  check(await p.evaluate(() => queue.length === 0) && await p.isHidden('#btn-pending'), 'Se puede descartar');
  check(dialogs === 0, 'Sin diálogos nativos');
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK'); await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
