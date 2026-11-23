// FitTrack · Historial: tarjetas (móvil) y tabla (pantallas anchas)
// Scripts clásicos que comparten ámbito global; se cargan en el orden de index.html.

// ---- HISTORIAL ----
function renderHistorial() {
    const has = ensureData('det-skeleton', 'det-error');
    $('detalle-content').classList.toggle('hidden', !has);
    $('history-list').classList.toggle('hidden', !has);
    if (has) renderTable();
}

function pendingMark(d) {
    return d._pending ? '<i class="fa-solid fa-clock pending-icon" role="img" aria-label="Pendiente de enviar" title="Pendiente de enviar"></i>' : '';
}

// Diferencia con el registro anterior: ▲/▼ y el valor. En las marcas subir es bueno (verde);
// en las medidas físicas no se juzga (depende del objetivo de cada uno) y va en gris.
function deltaHtml(cur, prev, { judge = false, unit = '' } = {}) {
    const c = toNum(cur), p = toNum(prev);
    if (c == null || p == null) return '';
    const diff = Math.round((c - p) * 10) / 10;
    if (diff === 0) return '<span class="delta"><span aria-hidden="true">=</span><span class="sr-only">igual que el anterior</span></span>';
    const up = diff > 0;
    const cls = judge ? (up ? ' good' : ' bad') : '';
    return `<span class="delta${cls}"><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${formatNumUI(Math.abs(diff))}${unit}<span class="sr-only"> ${up ? 'más' : 'menos'} que el anterior</span></span>`;
}

// Valor anterior (registro más antiguo más cercano) que tenga ese dato
function prevValue(list, i, get) {
    for (let j = i + 1; j < list.length; j++) { const v = toNum(get(list[j])); if (v != null) return v; }
    return null;
}

function renderCards(list, key) {
    const box = $('history-list');
    if (!list.length) {
        const regMode = key === 'fisico' ? 'fisico' : 'marcas';
        box.innerHTML = `<div class="glass empty-state"><i class="fa-solid fa-table-list" aria-hidden="true"></i><p>Aún no hay registros${regMode === 'marcas' ? ' de ' + MESO_NAMES[key] : ''}.</p>
            <button type="button" class="btn-cta" onclick="goRegister('${regMode}'${regMode === 'marcas' ? `, '${key}'` : ''})"><i class="fa-solid fa-plus" aria-hidden="true"></i> Registrar</button></div>`;
        return;
    }
    const n = v => esc(formatNumUI(v));
    const item = (label, value, delta = '') => `<div><dt>${label}</dt><dd>${value}${delta}</dd></div>`;
    box.innerHTML = list.map((d, i) => {
        const head = `<div class="rec-head"><span class="rec-date">${esc(d.fecha)}</span>${pendingMark(d)}`;
        if (key === 'fisico') {
            const field = (k, label, unit = '') => {
                const v = toNum(fisicoValue(d, k));
                return v == null ? '' : item(label, `${n(v)}${unit}`, deltaHtml(v, prevValue(list, i, r => fisicoValue(r, k))));
            };
            const meso = d.mesociclo && d.mesociclo !== '-' ? `<span class="rec-chip">${esc(d.mesociclo)}</span>` : '';
            const peso = toNum(d.peso);
            const main = peso != null
                ? `<div class="rec-main"><span class="rec-big">${n(peso)} <small>kg</small></span>${deltaHtml(peso, prevValue(list, i, r => r.peso))}</div>` : '';
            const comp = [field('grasa_pct', '% Graso', '%'), field('musculo', 'Músculo'), field('grasa', 'Grasa'), field('viscera', 'Víscera'), field('hueso', 'Hueso'), field('edad', 'Edad')].join('');
            const per = [field('pecho', 'Pecho'), field('hombros', 'Hombros'), field('biceps', 'Bíceps'), field('abdomen', 'Abdomen'), field('pierna', 'Pierna')].join('');
            return `<div class="glass rec-card" role="button" tabindex="0" data-idx="${i}" aria-describedby="table-hint">${head}${meso}</div>${main}
                ${comp ? `<dl class="rec-grid">${comp}</dl>` : ''}${per ? `<dl class="rec-grid rec-sub">${per}</dl>` : ''}</div>`;
        }
        const isVL = key === 'VL';
        const rows = lifts().map((k, li) => {
            const kgKey = 'ex' + (li + 1) + '_kg';
            const kg = toNum(d[kgKey]);
            if (kg == null) return '';
            const reps = isVL && d['ex' + (li + 1) + '_reps'] ? ` × ${esc(d['ex' + (li + 1) + '_reps'])}` : '';
            return item(esc(LIFTS[k].name), `${n(kg)} kg${reps}`, deltaHtml(kg, prevValue(list, i, r => r[kgKey]), { judge: true }));
        }).join('');
        return `<div class="glass rec-card" role="button" tabindex="0" data-idx="${i}" aria-describedby="table-hint">${head}<span class="rec-chip">${MESO_NAMES[key]}</span></div>
            <dl class="rec-grid lifts">${rows || item('Sin marcas', '-')}</dl></div>`;
    }).join('');
}

function renderTable() {
    const thead = $('tableHead');
    const tbody = $('tableBody');
    const mode = tabModes.historial;
    const key = mode === 'fisico' ? 'fisico' : mode.toUpperCase();
    const dataToRender = [...(profileData()[key] || [])].reverse();
    tableRecords = dataToRender;
    $('table-hint').classList.toggle('hidden', dataToRender.length === 0);
    $('btn-export').classList.toggle('hidden', dataToRender.length === 0);
    renderCards(dataToRender, key);
    const tr = i => `<tr class="row-click" tabindex="0" data-idx="${i}" aria-describedby="table-hint">`;
    const n = v => esc(formatNumUI(v));
    const emptyRow = (cols, regMode) => `<tr><td colspan="${cols}" class="td-empty">Aún no hay registros${regMode === 'marcas' ? ' de ' + MESO_NAMES[key] : ''}.<br><button type="button" class="btn-cta" onclick="goRegister('${regMode}'${regMode === 'marcas' ? `, '${key}'` : ''})"><i class="fa-solid fa-plus" aria-hidden="true"></i> Registrar</button></td></tr>`;

    if (mode === 'fisico') {
        thead.innerHTML = `<tr><th scope="col">Fecha</th><th scope="col">Meso.</th><th scope="col">Edad</th><th scope="col">Peso</th><th scope="col">% Graso</th><th scope="col">Músculo</th><th scope="col">Hueso</th><th scope="col">Víscera</th><th scope="col">Grasa</th><th scope="col">Pecho</th><th scope="col">Hombros</th><th scope="col">Bíceps</th><th scope="col">Abdomen</th><th scope="col">Pierna</th></tr>`;
        if (dataToRender.length === 0) { tbody.innerHTML = emptyRow(14, 'fisico'); return; }
        tbody.innerHTML = dataToRender.map((d, i) =>
            `${tr(i)}<td class="td-date">${esc(d.fecha)}${pendingMark(d)}</td><td>${esc(d.mesociclo)}</td><td>${esc(d.edad)}</td><td class="td-strong">${n(d.peso)}</td><td>${esc(grasaPctOf(d))}</td><td>${n(d.musculo)}</td><td>${n(d.hueso)}</td><td>${n(d.viscera)}</td><td>${n(d.grasa)}</td><td>${n(d.pecho)}</td><td>${n(d.hombros)}</td><td>${n(d.biceps)}</td><td>${n(d.abdomen)}</td><td>${n(d.pierna)}</td></tr>`
        ).join('');
    } else {
        const isVL = key === 'VL';
        const names = lifts().map(k => LIFTS[k].name);
        thead.innerHTML = '<tr><th scope="col">Fecha</th>' + names.map(nm => `<th scope="col">${esc(nm)} (kg)</th>${isVL ? '<th scope="col">Reps</th>' : ''}`).join('') + '</tr>';
        if (dataToRender.length === 0) { tbody.innerHTML = emptyRow(1 + names.length * (isVL ? 2 : 1), 'marcas'); return; }
        tbody.innerHTML = dataToRender.map((d, i) => {
            let tdHtml = `${tr(i)}<td class="td-date">${esc(d.fecha)}${pendingMark(d)}</td>`;
            for (let i = 1; i <= names.length; i++) {
                tdHtml += `<td class="td-strong">${n(d['ex' + i + '_kg'])}</td>`;
                if (isVL) tdHtml += `<td>${esc(d['ex' + i + '_reps'] || '-')}</td>`;
            }
            return tdHtml + `</tr>`;
        }).join('');
    }
}

// Abrir el detalle de un registro: clic o Enter/Espacio en una fila de la tabla o en una tarjeta
['tableBody', 'history-list'].forEach(id => {
    $(id).addEventListener('click', e => {
        const el = e.target.closest('[data-idx]');
        if (el && !e.target.closest('.btn-cta')) openRecordSheet(+el.dataset.idx);
    });
    $(id).addEventListener('keydown', e => {
        const el = e.target.closest('[data-idx]');
        if (el && e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openRecordSheet(+el.dataset.idx); }
    });
});
