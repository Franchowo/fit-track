// FitTrack · Progreso: gráficas
// Scripts clásicos que comparten ámbito global; se cargan en el orden de index.html.

// ---- PROGRESO (GRÁFICAS) ----
// Eje X con fechas reales: una pausa de 3 meses ocupa más que una semana
const DAY = 86400000;
function timeAxis(points) {
    const ts = points.map(p => p.x);
    const min = Math.min(...ts), max = Math.max(...ts);
    const axis = { type: 'linear', ticks: { maxTicksLimit: 5, callback: v => fmtTs(v) } };
    // Margen a cada lado para que los puntos de los extremos no se corten
    const pad = min === max ? 3 * DAY : Math.max((max - min) * 0.04, DAY / 2);
    axis.min = min - pad; axis.max = max + pad;
    return axis;
}
const tooltipTitle = items => items.length ? fmtTs(items[0].parsed.x) : '';
function datedOnly(arr) { return (arr || []).filter(d => !isNaN(dateTs(d))); }
function destroyCharts() {
    Object.keys(chartsInstance).forEach(k => { if (chartsInstance[k]) chartsInstance[k].destroy(); });
    chartsInstance = {};
}

function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    return { color: cs.getPropertyValue('--theme').trim(), bg: `rgba(${cs.getPropertyValue('--theme-rgb').trim()}, 0.15)` };
}

function setupChartDefaults() {
    if (typeof Chart === 'undefined') return false;
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Segoe UI', sans-serif";
    if (reduceMotion) Chart.defaults.animation = false;
    return true;
}

function renderProgreso() {
    const mode = tabModes.progreso;
    const has = ensureData('dash-skeleton', 'dash-error');
    $('dash-fisico').classList.toggle('hidden', !has || mode !== 'fisico');
    $('dash-marcas').classList.toggle('hidden', !has || mode !== 'marcas');
    if (!has) return;
    if (mode === 'fisico') renderChartsFisico(); else renderChartsMarcas();
}

function renderChartsFisico() {
    // Destruir primero: así nunca quedan en pantalla las gráficas de otro perfil
    ['w', 'c', 'p'].forEach(k => { if (chartsInstance[k]) { chartsInstance[k].destroy(); chartsInstance[k] = null; } });

    const fullData = profileData().fisico;
    const isEmpty = !fullData || fullData.length === 0;
    $('fisico-empty').classList.toggle('hidden', !isEmpty);
    $('fisico-content').classList.toggle('hidden', isEmpty);
    if (isEmpty) {
        $('kpi-peso').innerText = '--';
        $('kpi-peso-sub').innerText = '--';
        $('kpi-grasa').innerText = '--';
        return;
    }

    const limit = $('chartFilter').value;
    const pFilter = $('perimeterFilter').value;
    const { color: themeColor, bg: themeColorBg } = themeColors();

    const dated = datedOnly(fullData);
    const pd = limit === 'all' ? dated : dated.slice(-parseInt(limit));
    const pts = key => pd.map(d => ({ x: dateTs(d), y: d[key] }));

    // KPIs sobre el historial completo, ignorando registros sin ese dato
    const allWeights = fullData.map(d => d.peso);
    const currW = lastValid(allWeights);
    const prevW = currW ? lastValid(allWeights, currW.index) : null;
    $('kpi-peso').innerText = currW ? formatNumUI(currW.value) + ' kg' : '--';
    if (!currW) $('kpi-peso-sub').innerText = 'Sin datos de peso';
    else if (!prevW) $('kpi-peso-sub').innerText = 'Primer registro';
    else {
        const diff = (currW.value - prevW.value).toFixed(1);
        $('kpi-peso-sub').innerText = (diff > 0 ? '+' : '') + formatNumUI(diff) + ' kg vs anterior';
    }
    const currFat = lastValid(fullData.map(d => d.grasa));
    $('kpi-grasa').innerText = currFat ? formatNumUI(currFat.value) + ' kg' : '--';

    if (!setupChartDefaults()) return;

    if (!pd.length) return;
    const xAxis = timeAxis(pts('peso'));
    const opts = legend => ({ scales: { x: xAxis }, plugins: { legend: { display: legend }, tooltip: { callbacks: { title: tooltipTitle } } } });

    // Peso + tendencia suavizada (EWMA sobre todo el historial) + línea de objetivo
    const allW = dated.filter(d => toNum(d.peso) != null);
    const trendAll = ewma(allW.map(d => toNum(d.peso)));
    const firstTs = pd.length ? dateTs(pd[0]) : 0;
    const trendPts = allW.map((d, i) => ({ x: dateTs(d), y: trendAll[i] })).filter(p => p.x >= firstTs);
    const wDatasets = [{ label: 'Peso', data: pts('peso'), borderColor: themeColor, backgroundColor: themeColorBg, tension: 0.3, fill: true, spanGaps: true }];
    if (trendPts.length > 1) wDatasets.push({ label: 'Tendencia', data: trendPts, borderColor: 'rgba(226, 232, 240, 0.8)', backgroundColor: 'rgba(226, 232, 240, 0.8)', borderDash: [6, 4], pointRadius: 0, tension: 0.3, fill: false });
    const wGoal = goalLine('peso', xAxis);
    if (wGoal) wDatasets.push(wGoal);
    chartsInstance.w = new Chart($('weightChart'), { type: 'line', data: { datasets: wDatasets }, options: opts(wDatasets.length > 1) });
    chartsInstance.c = new Chart($('compChart'), { type: 'line', data: { datasets: [
        { label: 'Músculo', data: pts('musculo'), borderColor: themeColor, backgroundColor: themeColor, tension: 0.3, spanGaps: true },
        { label: 'Grasa', data: pts('grasa'), borderColor: '#cbd5e1', backgroundColor: '#cbd5e1', tension: 0.3, spanGaps: true }
    ] }, options: opts(true) });

    let pDts = [];
    const addP = (lbl, key, col) => pDts.push({ label: lbl, data: pts(key), borderColor: col, backgroundColor: col, tension: 0.3, spanGaps: true });
    if (pFilter === 'all' || pFilter === 'pecho') addP('Pecho', 'pecho', '#f43f5e');
    if (pFilter === 'all' || pFilter === 'hombros') addP('Hombros', 'hombros', '#3b82f6');
    if (pFilter === 'all' || pFilter === 'biceps') addP('Bíceps', 'biceps', '#10b981');
    if (pFilter === 'all' || pFilter === 'abdomen') addP('Abdomen', 'abdomen', '#eab308');
    if (pFilter === 'all' || pFilter === 'pierna') addP('Pierna', 'pierna', '#a855f7');
    chartsInstance.p = new Chart($('perimetersChart'), { type: 'line', data: { datasets: pDts }, options: opts(true) });
}

function buildMarcasCharts() {
    $('marcas-charts').innerHTML = lifts().map((key, i) =>
        `<div class="glass chart-container"><h3 class="chart-title">${LIFTS[key].name}</h3><canvas id="chartEx${i + 1}" role="img" aria-label="Evolución de ${LIFTS[key].name}"></canvas></div>`
    ).join('');
}

function renderChartsMarcas() {
    const meso = $('marcasFilter').value;
    Object.keys(chartsInstance).filter(k => k.startsWith('m')).forEach(k => { if (chartsInstance[k]) chartsInstance[k].destroy(); delete chartsInstance[k]; });
    $('e1rm-note').classList.toggle('hidden', meso !== 'ALL');
    if (meso === 'ALL') { renderMesoComparison(); return; }
    const data = datedOnly(profileData()[meso]);

    const isEmpty = !data || data.length === 0;
    $('marcas-empty-text').innerText = `Aún no hay marcas de ${MESO_NAMES[meso]} para este perfil.`;
    $('marcas-empty').classList.toggle('hidden', !isEmpty);
    $('marcas-charts').classList.toggle('hidden', isEmpty);
    if (isEmpty || !setupChartDefaults()) return;

    const { color: themeColor, bg: themeColorBg } = themeColors();
    lifts().forEach((key, i) => {
        const n = i + 1;
        const points = data.map(d => ({ x: dateTs(d), y: d['ex' + n + '_kg'] }));
        chartsInstance['m' + n] = new Chart($('chartEx' + n), {
            type: 'line',
            data: { datasets: [{ label: LIFTS[key].name, data: points, borderColor: themeColor, backgroundColor: themeColorBg, tension: 0.3, fill: true, spanGaps: true, pointRadius: 5, pointBackgroundColor: '#fff' }] },
            options: { responsive: true, scales: { x: timeAxis(points) }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: tooltipTitle, label: ctx => {
                let base = formatNumUI(ctx.parsed.y) + ' kg';
                const reps = meso === 'VL' ? data[ctx.dataIndex]['ex' + n + '_reps'] : '';
                return reps ? `${base} (${reps} reps)` : base;
            } } } } }
        });
    });
}

// Comparativa: 1RM estimado de cada ejercicio, con una serie por mesociclo
function renderMesoComparison() {
    const series = lifts().map((_, i) => liftSeries(i + 1).filter(p => p.e1rm != null));
    const isEmpty = series.every(s => !s.length);
    $('marcas-empty-text').innerText = 'Aún no hay marcas para este perfil.';
    $('marcas-empty').classList.toggle('hidden', !isEmpty);
    $('marcas-charts').classList.toggle('hidden', isEmpty);
    if (isEmpty || !setupChartDefaults()) return;
    const { color: themeColor } = themeColors();
    const colors = { FB: themeColor, VL: '#a855f7', PK: '#f59e0b' };
    lifts().forEach((key, i) => {
        const n = i + 1;
        const all = series[i].map(p => ({ x: p.ts, y: p.e1rm, p }));
        if (!all.length) return;
        const xAxis = timeAxis(all);
        const datasets = ['FB', 'VL', 'PK'].map(m => ({
            label: MESO_NAMES[m], data: all.filter(a => a.p.meso === m),
            borderColor: colors[m], backgroundColor: colors[m], tension: 0.3, pointRadius: 5
        })).filter(d => d.data.length);
        const g = goalLine('ex' + n, xAxis);
        if (g) datasets.push(g);
        chartsInstance['m' + n] = new Chart($('chartEx' + n), {
            type: 'line', data: { datasets },
            options: { responsive: true, scales: { x: xAxis }, plugins: { legend: { display: true }, tooltip: { callbacks: { title: tooltipTitle, label: ctx => {
                const p = ctx.raw && ctx.raw.p;
                if (!p) return `${ctx.dataset.label}: ${formatNumUI(ctx.parsed.y)} kg`;
                return p.meso === 'VL'
                    ? `VL: ${formatNumUI(p.kg)} kg × ${p.reps} → 1RM ≈ ${formatNumUI(p.e1rm)} kg`
                    : `${p.meso}: ${formatNumUI(p.kg)} kg`;
            } } } } }
        });
    });
}
