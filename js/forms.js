// FitTrack · Formularios: borradores, guardar, editar y borrar
// Scripts clásicos que comparten ámbito global; se cargan en el orden de index.html.

// ---- FORMULARIOS: borradores, pistas y reinicio ----
function draftKey(mode) { return `fittrack_draft_${slug()}_${mode}`; }

function saveDraft(mode) {
    if (!currentProfile || (editing && editing.mode === mode)) return;
    const fields = {};
    let any = false;
    $('form-' + mode).querySelectorAll('[data-draft]').forEach(el => {
        fields[el.id] = el.value;
        if (el.tagName !== 'SELECT' && el.value.trim() !== '') any = true;
    });
    if (any) storeSet(draftKey(mode), JSON.stringify({ ts: Date.now(), fields }));
    else storeDel(draftKey(mode));
}

function restoreDraft(mode) {
    const raw = storeGet(draftKey(mode));
    if (!raw) return false;
    try {
        const d = JSON.parse(raw);
        Object.entries(d.fields || {}).forEach(([id, v]) => { const el = $(id); if (el) el.value = v; });
        return true;
    } catch (e) { return false; }
}

function resetForm(mode, { keepDraft = false } = {}) {
    const form = $('form-' + mode);
    form.querySelectorAll('.input-error').forEach(clearFieldError);
    form.querySelectorAll('input[data-draft]').forEach(el => { el.value = ''; });
    if (!keepDraft && currentProfile) storeDel(draftKey(mode));
    showFormError(mode, '');
    if (mode === 'fisico') {
        $('f_fecha').valueAsDate = new Date();
        // Por defecto, el mesociclo del último registro
        const fis = profileData().fisico || [];
        const lastMeso = fis.length ? fis[fis.length - 1].mesociclo : '-';
        const options = [...$('f_mesociclo').options].map(o => o.value);
        $('f_mesociclo').value = options.includes(lastMeso) ? lastMeso : '-';
        nextStep(1);
    } else {
        $('m_fecha').valueAsDate = new Date();
    }
}

function updateFormHints() {
    Object.entries(FISICO_FIELDS).forEach(([id, key]) => {
        const v = lastFisicoValue(key);
        $(id).placeholder = v != null ? 'Último: ' + formatNumUI(v) : '';
    });
    const meso = $('m_mesociclo').value;
    lifts().forEach((_, i) => {
        const n = i + 1;
        const pr = getPR(n);
        const badge = $('pr-ex' + n);
        badge.classList.toggle('hidden', pr == null);
        badge.innerHTML = pr != null ? `<i class="fa-solid fa-trophy" aria-hidden="true"></i> Récord: ${formatNumUI(pr)} kg` : '';
        const lastKg = lastMarca(meso, n, 'kg');
        const lastReps = lastMarca(meso, n, 'reps');
        const kg = $(`m_ex${n}_kg`), reps = $(`m_ex${n}_reps`);
        kg.placeholder = lastKg != null ? 'Último: ' + formatNumUI(lastKg) : '';
        kg.dataset.last = lastKg != null ? lastKg : '';
        reps.placeholder = lastReps != null ? 'Último: ' + lastReps : '';
        reps.dataset.last = lastReps != null ? lastReps : '';
    });
}

function buildMarcasFields() {
    const stepper = (id, step, unit, label) => `
        <div class="stepper">
            <button type="button" class="stepper-btn" data-target="${id}" data-step="-${step}" aria-label="Restar ${formatNumUI(step)} ${unit} a ${label}">−</button>
            <div class="stepper-field"><input type="text" inputmode="${unit === 'kg' ? 'decimal' : 'numeric'}" class="input-large" id="${id}" data-draft aria-label="${label} (${unit})"><span class="stepper-unit" aria-hidden="true">${unit}</span></div>
            <button type="button" class="stepper-btn" data-target="${id}" data-step="${step}" aria-label="Sumar ${formatNumUI(step)} ${unit} a ${label}">+</button>
        </div>`;
    $('marcas-fields').innerHTML = lifts().map((key, i) => {
        const n = i + 1, l = LIFTS[key];
        return `<div class="form-group">
            <div class="lift-header">
                <span class="form-label" id="lbl-ex${n}"><i class="fa-solid ${l.icon}" aria-hidden="true"></i> ${l.name}</span>
                <span class="pr-badge hidden" id="pr-ex${n}"></span>
            </div>
            ${stepper(`m_ex${n}_kg`, 2.5, 'kg', l.name)}
            <div class="reps-row hidden">${stepper(`m_ex${n}_reps`, 1, 'reps', l.name)}</div>
        </div>`;
    }).join('');
}

function onMesoChange() {
    const isVL = $('m_mesociclo').value === 'VL';
    document.querySelectorAll('#marcas-fields .reps-row').forEach(el => el.classList.toggle('hidden', !isVL));
    $('vl-hint').classList.toggle('hidden', !isVL);
    if (currentProfile) { updateFormHints(); saveDraft('marcas'); }
}

function renderRegistrar() {
    const mode = tabModes.registrar;
    $('form-fisico').classList.toggle('hidden', mode !== 'fisico');
    $('form-marcas').classList.toggle('hidden', mode !== 'marcas');
    updateFormHints();
}

// Guardar borrador y limpiar errores al escribir
document.addEventListener('input', e => {
    const el = e.target;
    if (!el.classList || !el.classList.contains('input-large')) return;
    clearFieldError(el);
    const form = el.closest('#form-fisico, #form-marcas');
    if (form) {
        const mode = form.id.replace('form-', '');
        showFormError(mode, '');
        if (el.hasAttribute('data-draft')) saveDraft(mode);
    }
});
document.addEventListener('change', e => {
    const form = e.target.closest && e.target.closest('#form-fisico');
    if (form && e.target.hasAttribute('data-draft')) saveDraft('fisico');
});

// Botones − / + : si el campo está vacío, parten del último valor registrado
document.addEventListener('click', e => {
    const b = e.target.closest('.stepper-btn');
    if (!b) return;
    const input = $(b.dataset.target);
    const step = parseFloat(b.dataset.step);
    let v = parseNumInput(input.value);
    if (v === null || isNaN(v)) {
        const last = parseFloat(input.dataset.last);
        v = isNaN(last) ? Math.max(step, 0) : last + step;
    } else v += step;
    v = Math.max(0, Math.round(v * 100) / 100);
    input.value = formatNumUI(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    haptic(5);
});

// Teclado: flechas en las pestañas, Escape y foco atrapado en la hoja de perfiles
document.addEventListener('keydown', e => {
    const openSheetEl = document.querySelector('.sheet-backdrop:not(.hidden)');
    if (openSheetEl) {
        if (e.key === 'Escape') { closeSheet(openSheetEl.id); return; }
        if (e.key === 'Tab') {
            const f = [...openSheetEl.querySelectorAll('button, input, select')].filter(b => b.offsetParent !== null && !b.disabled);
            const i = f.indexOf(document.activeElement);
            if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        }
        return;
    }
    const tab = e.target.closest && e.target.closest('[role="tab"]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
    let i = tabs.indexOf(tab);
    if (e.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'ArrowRight') i = (i + 1) % tabs.length;
    else i = e.key === 'Home' ? 0 : tabs.length - 1;
    e.preventDefault();
    tabs[i].click();
    tabs[i].focus();
});

// ---- GUARDAR ----
function recordFromPayload(p) {
    if (p.type === 'fisico') {
        const r = { fecha: isoToShort(p.fecha), iso: p.fecha, mesociclo: p.mesociclo || '-', edad: p.edad || '-', imc: p.grasa_pct ? p.grasa_pct + '%' : '-', grasa_pct: p.grasa_pct ? p.grasa_pct + '%' : '-' };
        ['peso', 'musculo', 'hueso', 'viscera', 'grasa', 'pecho', 'hombros', 'biceps', 'abdomen', 'pierna'].forEach(k => r[k] = toNum(p[k]));
        return r;
    }
    const r = { fecha: isoToShort(p.fecha), iso: p.fecha };
    const count = PROFILES[p.profile] ? PROFILES[p.profile].lifts.length : Object.keys(p).filter(k => /^ex\d+_kg$/.test(k)).length;
    for (let n = 1; n <= count; n++) {
        r[`ex${n}_kg`] = toNum(p[`ex${n}_kg`]);
        if (p.mesociclo_marca === 'VL') r[`ex${n}_reps`] = p[`ex${n}_reps`] || '';
    }
    return r;
}

async function saveDataToSheet() {
    const mode = tabModes.registrar;
    const btn = $(mode === 'fisico' ? 'btn-submit-fis' : 'btn-submit-marcas');
    if (btn.disabled) return;
    showFormError(mode, '');
    const valid = mode === 'fisico' ? validateFisico() : validateMarcas();
    if (!valid) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loader"></span> Guardando...';
    btn.disabled = true;

    const profile = currentProfile;
    let payload = { id: newId(), profile, type: mode };

    if (mode === 'fisico') {
        payload.fecha = $('f_fecha').value;
        payload.mesociclo = $('f_mesociclo').value;
        Object.entries(FISICO_FIELDS).forEach(([id, key]) => { payload[key] = sanitize($(id).value); });
        payload.imc = payload.grasa_pct; // compatibilidad con versiones anteriores del Apps Script
    } else {
        payload.fecha = $('m_fecha').value;
        payload.mesociclo_marca = $('m_mesociclo').value;
        lifts().forEach((_, i) => {
            const n = i + 1;
            payload[`ex${n}_kg`] = sanitize($(`m_ex${n}_kg`).value);
            if (payload.mesociclo_marca === 'VL') payload[`ex${n}_reps`] = $(`m_ex${n}_reps`).value.trim();
        });
    }
    if (editing && editing.mode === mode) { await saveEdit(payload, mode, btn, originalText); return; }
    const prevPRs = mode === 'marcas' ? lifts().map((_, i) => getPR(i + 1)) : [];

    const result = await sendPayload(payload);
    btn.innerHTML = originalText; btn.disabled = false;

    const queueIt = () => { queue.push({ id: payload.id, payload, ts: Date.now() }); persistQueue(); };
    const finish = () => {
        resetForm(mode);
        if (mode === 'marcas') $('marcasFilter').value = payload.mesociclo_marca;
        tabModes.progreso = mode;
        navigate([slug(), 'progreso', mode]);
    };

    if (result.status === 'success' || result.status === 'network') {
        // Récords batidos (solo si ya había una marca anterior con la que comparar)
        const records = [];
        if (mode === 'marcas' && MARK_MESOS.includes(payload.mesociclo_marca)) lifts().forEach((key, i) => {
            const kg = toNum(payload[`ex${i + 1}_kg`]);
            if (kg != null && prevPRs[i] != null && kg > prevPRs[i]) records.push(`${LIFTS[key].name} ${formatNumUI(kg)} kg`);
        });

        if (result.status === 'success') {
            applyToCache(payload, result); // el progreso se ve al momento
            haptic(records.length ? [30, 60, 30] : 15);
            if (!records.length) showToast('Datos guardados correctamente', 'success', { id: 'save' });
        } else {
            // Sin red: se guarda en el móvil y se enviará solo cuando vuelva la conexión
            queueIt();
            haptic(15);
            showToast('Sin conexión: guardado en el móvil. Se enviará automáticamente.', 'info', { id: 'save' });
        }
        if (records.length) showToast('¡Nuevo récord! ' + records.join(' · '), 'pr');
        finish();
        if (result.status === 'success') refreshData({ silent: true });
    } else if (result.status === 'unauthorized') {
        queueIt();
        showToast('Tu clave de acceso ya no es válida. El registro se ha guardado en el móvil y se enviará cuando vuelvas a entrar.', 'error');
        resetForm(mode);
        logout();
    } else {
        showFormError(mode, 'El servidor no guardó los datos' + (result.message ? ': ' + result.message : '.') + ' Tus datos siguen en el formulario.');
    }
}

// ---- EDITAR Y BORRAR ----
const SUBMIT_LABELS = {
    fisico: '<i class="fa-solid fa-database" aria-hidden="true"></i> Sincronizar',
    marcas: '<i class="fa-solid fa-database" aria-hidden="true"></i> Sincronizar marcas'
};
const EDIT_LABEL = '<i class="fa-solid fa-check" aria-hidden="true"></i> Guardar cambios';

function updateEditUI() {
    ['fisico', 'marcas'].forEach(mode => {
        const on = !!editing && editing.mode === mode;
        const banner = $('edit-banner-' + mode);
        banner.classList.toggle('hidden', !on);
        if (on) banner.querySelector('.edit-text').innerText = `Editando el registro del ${editing.fecha}`;
        const btn = $(mode === 'fisico' ? 'btn-submit-fis' : 'btn-submit-marcas');
        if (!btn.disabled) btn.innerHTML = on ? EDIT_LABEL : SUBMIT_LABELS[mode];
    });
    $('m_mesociclo').disabled = !!editing && editing.mode === 'marcas';
}

function recordSummary(d, bucket) {
    const rows = [];
    const add = (label, value) => { if (value != null && value !== '' && value !== '-') rows.push([label, value]); };
    if (bucket === 'fisico') {
        add('Mesociclo', d.mesociclo);
        add('Edad metab.', d.edad);
        const units = { peso: 'kg', musculo: 'kg', hueso: 'kg', grasa: 'kg', pecho: 'cm', hombros: 'cm', biceps: 'cm', abdomen: 'cm', pierna: 'cm' };
        const labels = { peso: 'Peso', grasa_pct: '% Graso', musculo: 'Músculo', hueso: 'Hueso', viscera: 'Víscera', grasa: 'Grasa', pecho: 'Pecho', hombros: 'Hombros', biceps: 'Bíceps', abdomen: 'Abdomen', pierna: 'Pierna' };
        Object.keys(labels).forEach(k => {
            if (k === 'grasa_pct') { add(labels[k], grasaPctOf(d)); return; }
            const v = toNum(d[k]);
            add(labels[k], v != null ? `${formatNumUI(v)}${units[k] ? ' ' + units[k] : ''}` : null);
        });
    } else {
        lifts().forEach((key, i) => {
            const kg = toNum(d['ex' + (i + 1) + '_kg']);
            const reps = d['ex' + (i + 1) + '_reps'];
            add(LIFTS[key].name, kg != null ? `${formatNumUI(kg)} kg${bucket === 'VL' && reps ? ' × ' + reps : ''}` : null);
        });
    }
    return rows.length ? rows : [['Sin datos', '']];
}

function openRecordSheet(idx) {
    const d = tableRecords[idx];
    if (!d) return;
    const mode = tabModes.historial;
    const bucket = mode === 'fisico' ? 'fisico' : mode.toUpperCase();
    recordCtx = { d, bucket };
    $('record-title').innerText = `Registro del ${d.fecha}${d._pending ? ' · pendiente' : ''}`;
    $('record-summary').innerHTML = recordSummary(d, bucket).map(([l, v]) =>
        `<div><span class="rs-label">${esc(l)}</span><span class="rs-value">${esc(v)}</span></div>`).join('');
    const editable = d._pending || (d.row && d.rev);
    $('record-note').classList.toggle('hidden', !!editable);
    $('record-note').innerText = editable ? '' : 'Este registro aún no se puede editar. Si acabas de actualizar la app, espera a que se carguen los datos; si el aviso sigue, falta actualizar el Apps Script.';
    $('btn-rec-edit').disabled = !editable;
    $('btn-rec-delete').disabled = !editable;
    $('record-actions').classList.remove('hidden');
    $('record-confirm').classList.add('hidden');
    openSheet('record-sheet', editable ? $('btn-rec-edit') : $('record-sheet').querySelector('.sheet'));
    if (!editable) refreshData({ silent: true });
}

function askDelete() {
    $('record-actions').classList.add('hidden');
    $('record-confirm').classList.remove('hidden');
    $('btn-rec-cancel').focus();
}
function cancelDelete() {
    $('record-confirm').classList.add('hidden');
    $('record-actions').classList.remove('hidden');
    $('btn-rec-delete').focus();
}

function handleConflict() {
    showToast('Ese registro ha cambiado en la hoja desde que se cargó. He actualizado los datos: revísalo y vuelve a intentarlo.', 'error', { id: 'save' });
    refreshData({ silent: true });
}

async function confirmDelete() {
    const { d, bucket } = recordCtx;
    if (d._pending) {
        queue = queue.filter(q => q.id !== d._qid);
        persistQueue();
        closeSheet('record-sheet', false);
        showToast('Registro pendiente eliminado', 'success', { id: 'save' });
        renderCurrent();
        return;
    }
    const btn = $('btn-rec-confirm');
    const original = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="loader"></span> Borrando...';
    const profile = currentProfile;
    const payload = { id: newId(), action: 'delete', profile, type: bucket === 'fisico' ? 'fisico' : 'marcas', row: d.row, rev: d.rev };
    if (bucket !== 'fisico') payload.mesociclo_marca = bucket;
    const r = await sendPayload(payload);
    btn.disabled = false; btn.innerHTML = original;

    if (r.status === 'success') {
        removeFromCache(profile, bucket, d.row);
        closeSheet('record-sheet', false);
        haptic(15);
        showToast('Registro borrado', 'success', { id: 'save' });
        renderCurrent();
        refreshData({ silent: true });
    } else if (r.status === 'conflict') {
        closeSheet('record-sheet', false);
        handleConflict();
    } else if (r.status === 'unauthorized') {
        closeSheet('record-sheet', false);
        showToast('Tu clave de acceso ya no es válida', 'error');
        logout();
    } else {
        showToast(r.status === 'network' ? 'Sin conexión: no se ha borrado. Inténtalo cuando tengas red.' : 'El servidor no borró el registro: ' + (r.message || 'error'), 'error', { id: 'save' });
    }
}

function startEdit() {
    const { d, bucket } = recordCtx;
    closeSheet('record-sheet', false);
    const mode = bucket === 'fisico' ? 'fisico' : 'marcas';
    editing = { mode, bucket, row: d.row, rev: d.rev, qid: d._qid || null, fecha: d.fecha, ret: tabModes.historial };
    resetForm(mode, { keepDraft: true });
    const ts = dateTs(d);
    const iso = d.iso || (isNaN(ts) ? '' : tsToIso(ts));
    const numStr = v => { const n = toNum(v); return n != null ? formatNumUI(n) : ''; };
    if (mode === 'fisico') {
        $('f_fecha').value = iso;
        const options = [...$('f_mesociclo').options].map(o => o.value);
        $('f_mesociclo').value = options.includes(d.mesociclo) ? d.mesociclo : '-';
        Object.entries(FISICO_FIELDS).forEach(([id, key]) => { $(id).value = numStr(fisicoValue(d, key)); });
    } else {
        $('m_fecha').value = iso;
        $('m_mesociclo').value = bucket;
        lifts().forEach((_, i) => {
            const n = i + 1;
            $(`m_ex${n}_kg`).value = numStr(d[`ex${n}_kg`]);
            $(`m_ex${n}_reps`).value = numStr(d[`ex${n}_reps`]);
        });
        onMesoChange();
    }
    updateEditUI();
    navigate([slug(), 'registrar', mode]);
}

// Sale del modo edición y recupera el borrador que hubiera antes de editar
function exitEdit() {
    if (!editing) return null;
    const ed = editing;
    editing = null;
    resetForm(ed.mode, { keepDraft: true });
    restoreDraft(ed.mode);
    if (ed.mode === 'marcas') onMesoChange();
    updateEditUI();
    return ed;
}

function cancelEdit(goBack) {
    const ed = exitEdit();
    if (ed && goBack) navigate([slug(), 'historial', ed.ret]);
}

async function saveEdit(payload, mode, btn, originalText) {
    const ed = editing;
    const profile = currentProfile;
    const restoreBtn = () => { btn.innerHTML = originalText; btn.disabled = false; };

    // Registro aún pendiente de enviar: se modifica en la cola
    if (ed.qid) {
        const item = queue.find(q => q.id === ed.qid);
        if (item) { payload.id = item.id; item.payload = payload; delete item.failed; persistQueue(); }
        restoreBtn();
        exitEdit();
        showToast('Cambios guardados. Se enviarán cuando haya conexión.', 'info', { id: 'save' });
        navigate([slug(), 'historial', ed.ret]);
        return;
    }

    Object.assign(payload, { action: 'update', row: ed.row, rev: ed.rev });
    const r = await sendPayload(payload);
    restoreBtn();
    if (r.status === 'success') {
        replaceInCache(profile, ed.bucket, ed.row, Object.assign(recordFromPayload(payload), { row: r.row || ed.row, rev: r.rev }));
        exitEdit();
        haptic(15);
        showToast('Cambios guardados', 'success', { id: 'save' });
        navigate([slug(), 'historial', ed.ret]);
        refreshData({ silent: true });
    } else if (r.status === 'conflict') {
        exitEdit();
        navigate([slug(), 'historial', ed.ret]);
        handleConflict();
    } else if (r.status === 'unauthorized') {
        exitEdit();
        showToast('Tu clave de acceso ya no es válida. No se han guardado los cambios.', 'error');
        logout();
    } else if (r.status === 'network') {
        showFormError(mode, 'Sin conexión: para editar un registro hace falta conexión. Tus cambios siguen en el formulario.');
    } else {
        showFormError(mode, 'El servidor no guardó los cambios' + (r.message ? ': ' + r.message : '.'));
    }
}
