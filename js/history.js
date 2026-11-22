// FitTrack · Historial (tabla)
// Scripts clásicos que comparten ámbito global; se cargan en el orden de index.html.

// ---- HISTORIAL ----
function renderHistorial() {
    const has = ensureData('det-skeleton', 'det-error');
    $('detalle-content').classList.toggle('hidden', !has);
    if (has) renderTable();
}

function pendingMark(d) {
    return d._pending ? '<i class="fa-solid fa-clock pending-icon" role="img" aria-label="Pendiente de enviar" title="Pendiente de enviar"></i>' : '';
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
    const tr = i => `<tr class="row-click" tabindex="0" data-idx="${i}" aria-describedby="table-hint">`;
    const n = v => esc(formatNumUI(v));
    const emptyRow = (cols, regMode) => `<tr><td colspan="${cols}" class="td-empty">Aún no hay registros${regMode === 'marcas' ? ' de ' + MESO_NAMES[key] : ''}.<br><button type="button" class="btn-cta" onclick="goRegister('${regMode}'${regMode === 'marcas' ? `, '${key}'` : ''})"><i class="fa-solid fa-plus" aria-hidden="true"></i> Registrar</button></td></tr>`;

    if (mode === 'fisico') {
        thead.innerHTML = `<tr><th scope="col">Fecha</th><th scope="col">Meso.</th><th scope="col">Edad</th><th scope="col">Peso</th><th scope="col">% Graso</th><th scope="col">Músculo</th><th scope="col">Hueso</th><th scope="col">Víscera</th><th scope="col">Grasa</th><th scope="col">Pecho</th><th scope="col">Hombros</th><th scope="col">Bíceps</th><th scope="col">Abdomen</th><th scope="col">Pierna</th></tr>`;
        if (dataToRender.length === 0) { tbody.innerHTML = emptyRow(14, 'fisico'); return; }
        tbody.innerHTML = dataToRender.map((d, i) =>
            `${tr(i)}<td style="color:var(--theme); font-weight:bold;">${esc(d.fecha)}${pendingMark(d)}</td><td>${esc(d.mesociclo)}</td><td>${esc(d.edad)}</td><td style="font-weight:bold;">${n(d.peso)}</td><td>${esc(grasaPctOf(d))}</td><td>${n(d.musculo)}</td><td>${n(d.hueso)}</td><td>${n(d.viscera)}</td><td>${n(d.grasa)}</td><td>${n(d.pecho)}</td><td>${n(d.hombros)}</td><td>${n(d.biceps)}</td><td>${n(d.abdomen)}</td><td>${n(d.pierna)}</td></tr>`
        ).join('');
    } else {
        const isVL = key === 'VL';
        const names = lifts().map(k => LIFTS[k].name);
        thead.innerHTML = '<tr><th scope="col">Fecha</th>' + names.map(nm => `<th scope="col">${esc(nm)} (kg)</th>${isVL ? '<th scope="col">Reps</th>' : ''}`).join('') + '</tr>';
        if (dataToRender.length === 0) { tbody.innerHTML = emptyRow(1 + names.length * (isVL ? 2 : 1), 'marcas'); return; }
        tbody.innerHTML = dataToRender.map((d, i) => {
            let tdHtml = `${tr(i)}<td style="color:var(--theme); font-weight:bold;">${esc(d.fecha)}${pendingMark(d)}</td>`;
            for (let i = 1; i <= names.length; i++) {
                tdHtml += `<td style="font-weight:bold;">${n(d['ex' + i + '_kg'])}</td>`;
                if (isVL) tdHtml += `<td>${esc(d['ex' + i + '_reps'] || '-')}</td>`;
            }
            return tdHtml + `</tr>`;
        }).join('');
    }
}

$('tableBody').addEventListener('click', e => {
    const row = e.target.closest('tr.row-click');
    if (row) openRecordSheet(+row.dataset.idx);
});
$('tableBody').addEventListener('keydown', e => {
    const row = e.target.closest('tr.row-click');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openRecordSheet(+row.dataset.idx); }
});
