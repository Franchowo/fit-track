// FitTrack · Análisis (1RM, récords, DOTS, objetivos), pantalla de inicio y exportar CSV
// Scripts clásicos que comparten ámbito global; se cargan en el orden de index.html.

// ---- ANÁLISIS: 1RM estimado, récords, tendencia y objetivos ----
const MAX_E1RM_REPS = 12;
const EWMA_ALPHA = 0.3;

// 1RM estimado (Epley). Con 1 rep (o sin reps) es la propia marca; más de 12 reps no se estima.
function e1rm(kg, reps) {
    const w = toNum(kg);
    if (w == null) return null;
    const r = parseInt(reps, 10);
    if (!r || r <= 1) return w;
    if (r > MAX_E1RM_REPS) return null;
    return Math.round(w * (1 + r / 30) * 10) / 10;
}

// Serie cronológica de un ejercicio con todos los mesociclos.
// En FB y PK no se registran reps: la marca se toma como máximo.
function liftSeries(n) {
    const pd = profileData();
    const out = [];
    ['FB', 'VL', 'PK'].forEach(m => (pd[m] || []).forEach(d => {
        const kg = toNum(d['ex' + n + '_kg']);
        const ts = dateTs(d);
        if (kg == null || isNaN(ts)) return;
        const reps = m === 'VL' ? d['ex' + n + '_reps'] : null;
        out.push({ ts, meso: m, kg, reps, e1rm: m === 'VL' ? e1rm(kg, reps) : kg, fecha: d.fecha });
    }));
    return out.sort((a, b) => a.ts - b.ts);
}

// Solo tomas de marcas (FB y PK), con el peso realmente levantado
function markSeries(n) { return liftSeries(n).filter(p => MARK_MESOS.includes(p.meso)); }

function bestLift(n) {
    let best = null;
    markSeries(n).forEach(p => { if (p.e1rm != null && (!best || p.e1rm > best.e1rm)) best = p; });
    return best;
}

function strengthTotal() {
    const bests = lifts().map((_, i) => bestLift(i + 1));
    if (!bests.length || bests.some(b => !b)) return null;
    return { value: Math.round(bests.reduce((sum, b) => sum + b.e1rm, 0) * 10) / 10, bests };
}

// Puntuación DOTS (IPF): compara la fuerza entre personas de distinto peso y sexo.
// DOTS = total × 500 / (a + b·P + c·P² + d·P³ + e·P⁴), con P = peso corporal acotado.
const DOTS_COEF = {
    M: { a: -307.75076, b: 24.0900756, c: -0.1918759221, d: 0.0007391293, e: -0.000001093, min: 40, max: 210 },
    F: { a: -57.96288, b: 13.6175032, c: -0.1126655495, d: 0.0005158568, e: -0.0000010706, min: 40, max: 150 }
};
function dots(total, bodyweight, sex) {
    const k = DOTS_COEF[sex];
    if (!k || total == null || bodyweight == null) return null;
    const w = Math.min(Math.max(bodyweight, k.min), k.max);
    const den = k.a + k.b * w + k.c * w ** 2 + k.d * w ** 3 + k.e * w ** 4;
    return den > 0 ? Math.round(total * 500 / den * 10) / 10 : null;
}

// Cada vez que un ejercicio supera su mejor 1RM estimado anterior
function prEvents() {
    const ev = [];
    lifts().forEach((key, i) => {
        let best = null;
        markSeries(i + 1).forEach(p => {
            if (p.e1rm == null) return;
            if (best != null && p.e1rm > best) ev.push(Object.assign({ lift: LIFTS[key].name, prev: best }, p));
            if (best == null || p.e1rm > best) best = p.e1rm;
        });
    });
    return ev.sort((a, b) => b.ts - a.ts);
}

function weightSeries() {
    return datedOnly(profileData().fisico).map(d => ({ ts: dateTs(d), v: toNum(d.peso) })).filter(p => p.v != null);
}

// Media móvil exponencial: suaviza el ruido de la báscula
function ewma(values) {
    let t = null;
    return values.map(v => { if (v != null) t = t == null ? v : t + EWMA_ALPHA * (v - t); return t == null ? null : Math.round(t * 100) / 100; });
}

// Pendiente diaria (regresión lineal) con los puntos de los últimos "days" días
function slopePerDay(points, days) {
    if (points.length < 2) return null;
    const last = points[points.length - 1].ts;
    const pts = points.filter(p => p.ts >= last - days * DAY);
    if (pts.length < 2 || pts[pts.length - 1].ts - pts[0].ts < 7 * DAY) return null;
    const xs = pts.map(p => (p.ts - pts[0].ts) / DAY), ys = pts.map(p => p.v);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) * (x - mx); });
    return den ? num / den : null;
}

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
function daysSince(ts) { return Math.round((startOfToday() - ts) / DAY); }
function agoText(ts) { const n = daysSince(ts); return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`; }

// ---- OBJETIVOS ----
function goalKeys() { return ['peso'].concat(lifts().map((_, i) => 'ex' + (i + 1))); }
function goalLabel(key) { return key === 'peso' ? 'Peso' : LIFTS[lifts()[+key.slice(2) - 1]].name; }
function goals() { return profileData().goals || {}; }

function goalCurrent(key) {
    if (key === 'peso') { const w = weightSeries(); return w.length ? w[w.length - 1].v : null; }
    const b = bestLift(+key.slice(2));
    return b ? b.e1rm : null;
}
function goalSeries(key) {
    if (key === 'peso') return weightSeries();
    return markSeries(+key.slice(2)).map(p => ({ ts: p.ts, v: p.e1rm }));
}

function goalProgress(key, goal) {
    const cur = goalCurrent(key);
    if (cur == null || !goal) return null;
    const target = goal.target;
    const start = goal.start != null ? goal.start : cur;
    const reached = target >= start ? cur >= target : cur <= target;
    let pct = start === target ? (reached ? 1 : 0) : (cur - start) / (target - start);
    pct = Math.max(0, Math.min(1, pct));
    let eta = null;
    if (!reached) {
        const slope = slopePerDay(goalSeries(key), key === 'peso' ? 90 : 180);
        if (slope && Math.sign(slope) === Math.sign(target - cur)) {
            const days = (target - cur) / slope;
            eta = days > 730 ? 'lejos' : startOfToday() + Math.ceil(days) * DAY;
        }
    }
    return { cur, start, target, reached, pct, eta };
}

// Línea horizontal del objetivo en una gráfica
function goalLine(key, xAxis) {
    const g = goals()[key];
    if (!g || xAxis.min == null) return null;
    return { label: 'Objetivo', data: [{ x: xAxis.min, y: g.target }, { x: xAxis.max, y: g.target }], borderColor: 'rgba(251, 191, 36, 0.9)', backgroundColor: 'rgba(251, 191, 36, 0.9)', borderDash: [3, 4], pointRadius: 0, fill: false };
}

function openGoalsSheet() {
    const g = goals();
    $('goals-fields').innerHTML = goalKeys().map(key => {
        const cur = goalCurrent(key);
        const label = key === 'peso' ? 'Peso objetivo' : `${goalLabel(key)} · marca objetivo`;
        const val = g[key] ? formatNumUI(g[key].target) : '';
        return `<div class="form-group"><label for="g_${key}">${esc(label)} <span class="unit">(kg)</span></label>
            <input type="text" inputmode="decimal" class="input-large" id="g_${key}" value="${esc(val)}" placeholder="${cur != null ? 'Actual: ' + esc(formatNumUI(cur)) : ''}"></div>`;
    }).join('');
    showFormError('goals', '');
    openSheet('goals-sheet', $('g_peso'));
}

async function saveGoalsForm() {
    const btn = $('btn-goals-save');
    if (btn.disabled) return;
    showFormError('goals', '');
    const old = goals();
    const next = {};
    let firstBad = null;
    goalKeys().forEach(key => {
        const input = $('g_' + key);
        const rule = key === 'peso' ? { min: 30, max: 250 } : { min: 1, max: 500 };
        if (!validateNumber(input, rule)) { if (!firstBad) firstBad = input; return; }
        const target = parseNumInput(input.value);
        if (target == null) return;
        // Si el objetivo no cambia se conserva su punto de partida
        next[key] = old[key] && old[key].target === target ? old[key]
            : { target, start: goalCurrent(key), startDate: tsToIso(Date.now()) };
    });
    if (firstBad) { firstBad.focus(); return; }

    const original = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="loader"></span> Guardando...';
    const profile = currentProfile;
    const r = await sendPayload({ id: newId(), action: 'goals', profile, goals: next });
    btn.disabled = false; btn.innerHTML = original;
    if (r.status === 'success') {
        if (historyDataCache && historyDataCache[profile]) { historyDataCache[profile].goals = r.goals || next; persistCache(); }
        closeSheet('goals-sheet', false);
        showToast('Objetivos guardados', 'success', { id: 'save' });
        renderCurrent();
    } else if (r.status === 'unauthorized') {
        closeSheet('goals-sheet', false);
        showToast('Tu clave de acceso ya no es válida', 'error');
        logout();
    } else if (r.status === 'network') {
        showFormError('goals', 'Sin conexión: los objetivos se guardan en el servidor, inténtalo cuando tengas red.');
    } else {
        showFormError('goals', /Acci[oó]n desconocida|Hoja no encontrada/.test(r.message || '')
            ? 'Para usar objetivos hay que actualizar el Apps Script.'
            : 'El servidor no guardó los objetivos' + (r.message ? ': ' + r.message : '.'));
    }
}

// ---- PANTALLA DE INICIO (RESUMEN) ----
function renderResumen() {
    const has = ensureData('res-skeleton', 'res-error');
    $('res-content').classList.toggle('hidden', !has);
    if (!has) return;
    const pd = profileData();
    const fis = datedOnly(pd.fisico);
    const lastFis = fis.length ? fis[fis.length - 1] : null;
    const marcas = ['FB', 'VL', 'PK'].reduce((acc, m) => acc.concat(datedOnly(pd[m])), []);
    const lastMarcaTs = marcas.length ? Math.max(...marcas.map(dateTs)) : null;

    // Estado y recordatorio de medición
    let hero = `<h2>Hola, ${esc(currentProfile)}</h2>`;
    hero += lastFis
        ? `<div class="res-line">Última medición: <strong>${esc(lastFis.fecha)}</strong> · ${agoText(dateTs(lastFis))}</div>`
        : `<div class="res-line">Aún no hay mediciones físicas.</div>`;
    hero += lastMarcaTs != null
        ? `<div class="res-line">Últimas marcas: <strong>${fmtTs(lastMarcaTs)}</strong> · ${agoText(lastMarcaTs)}</div>`
        : `<div class="res-line">Aún no hay marcas.</div>`;
    if (!lastFis || daysSince(dateTs(lastFis)) >= 7) hero += `<div class="chip-warn"><i class="fa-solid fa-bell" aria-hidden="true"></i> Toca medición${lastFis ? '' : ': registra la primera'}</div>`;
    hero += `<div class="res-actions">
        <button type="button" class="btn-cta" onclick="goRegister('fisico')"><i class="fa-solid fa-weight-scale" aria-hidden="true"></i> Físico</button>
        <button type="button" class="btn-cta secondary" onclick="goRegister('marcas')"><i class="fa-solid fa-dumbbell" aria-hidden="true"></i> Marcas</button></div>`;
    $('res-hero').innerHTML = hero;

    // KPIs
    const ws = weightSeries();
    const lastW = ws.length ? ws[ws.length - 1] : null;
    let wSub = '--';
    if (lastW && ws.length > 1) {
        const ref = [...ws].reverse().find(p => p.ts <= lastW.ts - 28 * DAY);
        const base = ref || ws[0];
        const diff = Math.round((lastW.v - base.v) * 10) / 10;
        wSub = `${diff > 0 ? '+' : ''}${formatNumUI(diff)} kg ${ref ? 'en 4 semanas' : 'desde ' + fmtTs(base.ts)}`;
    } else if (lastW) wSub = 'Primer registro';
    const pct = lastFisicoValue('grasa_pct');
    const total = strengthTotal();
    const rel = total && lastW ? Math.round(total.value / lastW.v * 100) / 100 : null;
    const dotsScore = total && lastW ? dots(total.value, lastW.v, PROFILES[currentProfile].sex) : null;
    const kpi = (label, value, sub) => `<div class="glass kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value small">${value}</div><div class="kpi-sub">${sub}</div></div>`;
    $('res-kpis').innerHTML =
        kpi('Peso', lastW ? formatNumUI(lastW.v) + ' kg' : '--', esc(wSub)) +
        kpi('% Graso', pct != null ? formatNumUI(pct) + ' %' : '--', 'última medición') +
        kpi('Total', total ? formatNumUI(total.value) + ' kg' : '--', total ? 'suma de mejores marcas' : 'faltan marcas') +
        kpi('Puntos DOTS <button type="button" class="info-btn" onclick="openDotsInfo()" aria-label="¿Qué son los puntos DOTS?" title="¿Qué son los puntos DOTS?"><i class="fa-solid fa-circle-info" aria-hidden="true"></i></button>', dotsScore != null ? formatNumUI(dotsScore) : '--',
            rel != null ? `Total = ${formatNumUI(rel)} × tu peso` : (total ? 'falta tu peso' : 'faltan marcas'));

    // Objetivos
    const g = goals();
    const goalRows = goalKeys().filter(k => g[k]).map(key => {
        const pr = goalProgress(key, g[key]);
        if (!pr) return `<div class="goal-row"><div class="goal-head"><span>${esc(goalLabel(key))}</span><span>→ ${formatNumUI(g[key].target)} kg</span></div><div class="goal-foot">Sin datos todavía</div></div>`;
        const pc = Math.round(pr.pct * 100);
        const eta = pr.reached ? '¡Conseguido! 🎉' : pr.eta === 'lejos' ? 'Al ritmo actual, más de 2 años' : pr.eta ? 'Fecha estimada: ' + fmtTs(pr.eta) : 'Aún sin tendencia hacia el objetivo';
        return `<div class="goal-row">
            <div class="goal-head"><span>${esc(goalLabel(key))}${key !== 'peso' ? ' <span class="unit">(marca)</span>' : ''}</span><span><strong>${formatNumUI(pr.cur)}</strong> → ${formatNumUI(pr.target)} kg</span></div>
            <div class="progress${pr.reached ? ' done' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pc}" aria-label="Progreso de ${esc(goalLabel(key))}"><div style="width:${pc}%"></div></div>
            <div class="goal-foot">${pc} % · ${eta}</div></div>`;
    });
    $('res-goals').innerHTML = goalRows.length ? goalRows.join('')
        : `<p class="res-empty">Aún no tienes objetivos.</p><button type="button" class="btn-cta" onclick="openGoalsSheet()"><i class="fa-solid fa-bullseye" aria-hidden="true"></i> Añadir objetivo</button>`;

    // Récords por ejercicio
    const recRows = lifts().map((key, i) => {
        const b = bestLift(i + 1);
        if (!b) return `<div class="res-row"><span>${esc(LIFTS[key].name)}<span class="res-sub">Sin marcas</span></span><span class="res-val">--</span></div>`;
        return `<div class="res-row"><span>${esc(LIFTS[key].name)}<span class="res-sub">${MESO_NAMES[b.meso]} · ${esc(b.fecha)}</span></span><span class="res-val">${formatNumUI(b.kg)} kg</span></div>`;
    });
    if (total) recRows.push(`<div class="res-row"><span><strong>Total</strong><span class="res-sub">Suma de las mejores marcas</span></span><span class="res-val">${formatNumUI(total.value)} kg</span></div>`);
    $('res-records').innerHTML = recRows.join('');

    // Récords recientes
    const recent = prEvents().filter(e => daysSince(e.ts) <= 60).slice(0, 5);
    $('res-prs').innerHTML = recent.length ? recent.map(e =>
        `<div class="res-row"><span>🏆 ${esc(e.lift)}<span class="res-sub">${esc(e.fecha)} · ${MESO_NAMES[e.meso]}</span></span><span class="res-val">${formatNumUI(e.e1rm)} kg <span class="unit">(+${formatNumUI(Math.round((e.e1rm - e.prev) * 10) / 10)})</span></span></div>`
    ).join('') : '<p class="res-empty">Sin récords en los últimos 60 días. ¡A por ellos!</p>';
}

// ---- INFORMACIÓN: QUÉ SON LOS PUNTOS DOTS ----
// Guía orientativa (no oficial) para situar la puntuación
const DOTS_LEVELS = [
    { max: 200, name: 'Iniciación' },
    { max: 300, name: 'Intermedio' },
    { max: 400, name: 'Avanzado' },
    { max: 500, name: 'Nivel competición nacional' },
    { max: Infinity, name: 'Élite internacional' }
];

function openDotsInfo() {
    const sex = PROFILES[currentProfile].sex;
    const ws = weightSeries();
    const lastW = ws.length ? ws[ws.length - 1] : null;
    const total = strengthTotal();
    const score = total && lastW ? dots(total.value, lastW.v, sex) : null;
    const level = score != null ? DOTS_LEVELS.findIndex(l => score < l.max) : -1;

    let mine;
    if (score != null) {
        const perKg = Math.round(score / total.value * 100) / 100;
        mine = `<div class="info-mine">
                <div><span>Total</span><strong>${formatNumUI(total.value)} kg</strong></div>
                <div><span>Peso corporal</span><strong>${formatNumUI(lastW.v)} kg</strong></div>
                <div><span>Sexo</span><strong>${sex === 'F' ? 'Mujer' : 'Hombre'}</strong></div>
                <div><span>Tus puntos</span><strong>${formatNumUI(score)}</strong></div>
            </div>
            <p style="margin-top: 10px;">Tu Total equivale a <strong>${formatNumUI(Math.round(total.value / lastW.v * 100) / 100)} veces tu peso</strong>. Con tu peso actual, <strong>cada kilo más en el Total suma unos ${formatNumUI(perKg)} puntos</strong>.</p>`;
    } else {
        const missing = [];
        if (!lastW) missing.push('registrar tu peso en <strong>Físico</strong>');
        if (!total) missing.push('tener una marca de Fuerza Base o Peaking en <strong>cada ejercicio</strong>');
        mine = `<p>Para calcular tus puntos te falta ${missing.join(' y ')}.</p>`;
    }

    $('dots-body').innerHTML = `
        <h3>¿Qué es?</h3>
        <p>Una puntuación para <strong>comparar la fuerza entre personas de distinto peso y sexo</strong>. Cuanto más pesa alguien, más kilos suele levantar; el DOTS corrige ese efecto para que las puntuaciones se puedan comparar entre sí. Es la fórmula que usa la Federación Internacional de Powerlifting (IPF) para elegir al mejor levantador "libra por libra".</p>
        <h3>¿Cómo se calcula?</h3>
        <div class="info-formula">DOTS = Total × 500 ÷ f(peso corporal)</div>
        <p><strong>Total</strong> es la suma de tus mejores marcas de sentadilla, press banca y peso muerto (Fuerza Base y Peaking). <strong>f</strong> es una curva distinta para hombres y para mujeres que crece con el peso corporal.</p>
        <h3>Tus números</h3>
        ${mine}
        <h3>¿Cómo interpretarlo?</h3>
        <ul class="level-list">${DOTS_LEVELS.map((l, i) => {
            const from = i === 0 ? 0 : DOTS_LEVELS[i - 1].max;
            const range = l.max === Infinity ? `más de ${from}` : `${from}–${l.max}`;
            return `<li${i === level ? ' class="current" aria-current="true"' : ''}><span>${l.name}${i === level ? ' · tú' : ''}</span><span>${range}</span></li>`;
        }).join('')}</ul>
        <p style="margin-top: 8px;">Guía orientativa, no oficial. Lo más útil es comparar <strong>tus propios puntos con el tiempo</strong>: si suben, eres más fuerte para tu peso.</p>
        <h3>A tener en cuenta</h3>
        <p>Es una estimación: usa tu último peso y tus mejores marcas aunque sean de días distintos, y no sustituye la puntuación de una competición oficial.</p>`;
    // El foco va al título (no al botón del final) para que la hoja se lea desde el principio
    openSheet('dots-sheet', $('dots-title'));
    $('dots-sheet').querySelector('.sheet').scrollTop = 0;
}

// ---- EXPORTAR CSV (abre bien en Excel y Google Sheets en español) ----
function exportCsv() {
    const mode = tabModes.historial;
    const key = mode === 'fisico' ? 'fisico' : mode.toUpperCase();
    const data = profileData()[key] || [];
    if (!data.length) return;
    const num = v => { const n = toNum(v); return n == null ? '' : formatNumUI(n); };
    let header, rows;
    if (key === 'fisico') {
        header = ['Fecha', 'Mesociclo', 'Edad', 'Peso (kg)', '% Graso', 'Músculo (kg)', 'Hueso (kg)', 'Víscera', 'Grasa (kg)', 'Pecho (cm)', 'Hombros (cm)', 'Bíceps (cm)', 'Abdomen (cm)', 'Pierna (cm)'];
        rows = data.map(d => [d.fecha, d.mesociclo, d.edad, num(d.peso), num(grasaPctOf(d)), num(d.musculo), num(d.hueso), num(d.viscera), num(d.grasa), num(d.pecho), num(d.hombros), num(d.biceps), num(d.abdomen), num(d.pierna)]);
    } else {
        header = ['Fecha'];
        lifts().forEach(k => { header.push(LIFTS[k].name + ' (kg)'); if (key === 'VL') header.push(LIFTS[k].name + ' reps', LIFTS[k].name + ' 1RM est. (kg)'); });
        rows = data.map(d => {
            const r = [d.fecha];
            lifts().forEach((_, i) => {
                const n = i + 1;
                r.push(num(d['ex' + n + '_kg']));
                if (key === 'VL') { r.push(d['ex' + n + '_reps'] == null ? '' : d['ex' + n + '_reps']); r.push(num(e1rm(d['ex' + n + '_kg'], d['ex' + n + '_reps']))); }
            });
            return r;
        });
    }
    const cell = v => { const s = String(v == null || v === '-' ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = [header].concat(rows).map(r => r.map(cell).join(';')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fittrack-${slug()}-${mode}-${tsToIso(Date.now())}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast('CSV descargado', 'success', { id: 'export' });
}
