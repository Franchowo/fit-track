// FitTrack · Utilidades (números, fechas) y validación
// Scripts clásicos que comparten ámbito global; se cargan en el orden de index.html.

// ---- UTILIDADES ----
function formatNumUI(val) { return (val == null || val === '') ? '-' : val.toString().replace('.', ','); }
function sanitize(val) { return (!val) ? "" : val.toString().trim().replace('.', ','); }

// Escapa texto antes de insertarlo como HTML (los datos vienen de la hoja de cálculo)
function esc(val) {
    return String(val == null ? '' : val).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Convierte valores de la hoja ("15,0%", "-", 78.4) a número o null
function toNum(v) {
    if (v == null || v === '' || v === '-') return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    const n = parseFloat(String(v).replace('%', '').replace(',', '.'));
    return isNaN(n) ? null : n;
}

// Último valor no nulo de una serie (y su índice)
function lastValid(arr, before = arr.length) {
    for (let i = before - 1; i >= 0; i--) if (arr[i] != null && !isNaN(arr[i])) return { value: arr[i], index: i };
    return null;
}

function pad2(n) { return ('0' + n).slice(-2); }
// Fecha de un registro como timestamp (acepta "2026-11-22", "22/11/26" y "22/11/2026")
function dateTs(d) {
    const s = String((d && (d.iso || d.fecha)) || '');
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
    if (m) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]).getTime();
    return NaN;
}
function fmtTs(ts) { const d = new Date(ts); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`; }
function tsToIso(ts) { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
// Orden cronológico estable (los registros sin fecha válida van al principio)
function sortByDate(arr) {
    return arr.map((d, i) => ({ d, i, t: dateTs(d) }))
        .sort((a, b) => ((isNaN(a.t) ? -Infinity : a.t) - (isNaN(b.t) ? -Infinity : b.t)) || a.i - b.i)
        .map(x => x.d);
}

function isoToShort(iso) { const [y, m, d] = String(iso).split('-'); return (y && m && d) ? `${d}/${m}/${y.slice(-2)}` : iso; }
// Datos del perfil activo + registros pendientes de enviar (marcados con _pending),
// cada lista en orden cronológico
function profileData() {
    const base = (historyDataCache && historyDataCache[currentProfile]) || {};
    const out = Object.assign({}, base);
    queue.filter(q => q.payload.profile === currentProfile).forEach(q => {
        const bucket = q.payload.type === 'fisico' ? 'fisico' : q.payload.mesociclo_marca;
        out[bucket] = (out[bucket] || []).concat([Object.assign(recordFromPayload(q.payload), { _pending: true, _qid: q.id })]);
    });
    ['fisico', 'FB', 'VL', 'PK'].forEach(b => { if (Array.isArray(out[b])) out[b] = sortByDate(out[b]); });
    return out;
}
function grasaPctOf(d) { return d.grasa_pct != null ? d.grasa_pct : d.imc; }
function fisicoValue(d, key) { return key === 'grasa_pct' ? grasaPctOf(d) : d[key]; }

function lastFisicoValue(key) {
    const arr = profileData().fisico || [];
    for (let i = arr.length - 1; i >= 0; i--) { const n = toNum(fisicoValue(arr[i], key)); if (n != null) return n; }
    return null;
}

// Mesociclos que son "toma de marcas": de ellos salen récords, Total, DOTS y objetivos.
// Volumen (VL) son pesos de entrenamiento: solo se usa para estimar el 1RM en la comparativa.
const MARK_MESOS = ['FB', 'PK'];

function getPR(n) {
    let best = null;
    MARK_MESOS.forEach(m => (profileData()[m] || []).forEach(d => {
        const v = toNum(d['ex' + n + '_kg']);
        if (v != null && (best == null || v > best)) best = v;
    }));
    return best;
}

function lastMarca(meso, n, field) {
    const arr = profileData()[meso] || [];
    for (let i = arr.length - 1; i >= 0; i--) { const v = toNum(arr[i]['ex' + n + '_' + field]); if (v != null) return v; }
    return null;
}

// ---- VALIDACIÓN ----
// Rangos razonables para detectar errores de tecleo (p. ej. 785 en vez de 78,5)
const FIELD_RULES = {
    f_edad:      { min: 10,  max: 100 },
    f_peso:      { min: 30,  max: 250 },
    f_grasa_pct: { min: 2,   max: 60 },
    f_musculo:   { min: 10,  max: 150 },
    f_hueso:     { min: 0.5, max: 10 },
    f_viscera:   { min: 1,   max: 59 },
    f_grasa:     { min: 1,   max: 150 },
    f_pecho:     { min: 20,  max: 200 },
    f_hombros:   { min: 20,  max: 200 },
    f_biceps:    { min: 10,  max: 80 },
    f_abdomen:   { min: 20,  max: 200 },
    f_pierna:    { min: 20,  max: 120 },
    kg:          { min: 0,   max: 500 },
    reps:        { min: 1,   max: 100, int: true }
};
const STEP_FIELDS = {
    1: ['f_edad'],
    2: ['f_peso', 'f_grasa_pct', 'f_musculo', 'f_hueso', 'f_viscera', 'f_grasa'],
    3: ['f_pecho', 'f_hombros', 'f_biceps', 'f_pierna', 'f_abdomen']
};

function parseNumInput(raw) {
    const s = String(raw).trim().replace(',', '.');
    if (s === '') return null;
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
}

function setFieldError(input, msg) {
    input.classList.add('input-error');
    input.setAttribute('aria-invalid', 'true');
    const group = input.closest('.form-group');
    if (!group) return;
    let el = group.querySelector('.field-error');
    if (!el) { el = document.createElement('div'); el.className = 'field-error'; el.id = input.id + '-error'; group.appendChild(el); }
    el.innerText = msg;
    input.setAttribute('aria-describedby', el.id);
}

function clearFieldError(input) {
    input.classList.remove('input-error');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    const group = input.closest('.form-group');
    if (!group) return;
    // Solo se quita el mensaje si ningún otro input del grupo sigue con error
    if (!group.querySelector('.input-error')) { const el = group.querySelector('.field-error'); if (el) el.remove(); }
}

function showFormError(mode, msg) {
    const el = $('form-error-' + mode);
    el.innerText = msg || '';
    el.classList.toggle('hidden', !msg);
}

// Valida un input numérico opcional; devuelve true si es válido
function validateNumber(input, rule) {
    const v = parseNumInput(input.value);
    if (v === null) return true;
    if (isNaN(v)) { setFieldError(input, 'Introduce un número válido'); return false; }
    if (rule.int && !Number.isInteger(v)) { setFieldError(input, 'Debe ser un número entero'); return false; }
    if (v < rule.min || v > rule.max) { setFieldError(input, `Valor fuera de rango (${formatNumUI(rule.min)}–${formatNumUI(rule.max)})`); return false; }
    return true;
}

function validateDate(input) {
    if (!input.value) { setFieldError(input, 'Indica la fecha'); return false; }
    return true;
}

// Devuelve el primer campo con error del paso (o null si es válido)
function validateStep(step) {
    let firstBad = null;
    const fail = el => { if (!firstBad) firstBad = el; };
    if (step === 1) { const d = $('f_fecha'); if (!validateDate(d)) fail(d); }
    STEP_FIELDS[step].forEach(id => { const el = $(id); if (!validateNumber(el, FIELD_RULES[id])) fail(el); });
    return firstBad;
}

function nextStep(step) {
    currentStep = step;
    [1, 2, 3].forEach(s => {
        $('step' + s).classList.toggle('hidden', s !== step);
        const dot = document.querySelector(`.step-dot[data-step="${s}"]`);
        dot.classList.toggle('active', s === step);
        dot.classList.toggle('done', s < step);
        if (s === step) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current');
    });
    $('step-title').innerText = `Paso ${step} de 3 · ${STEP_TITLES[step]}`;
}

function goToStep(step) {
    // Hacia atrás se va libremente; hacia delante, los pasos intermedios deben ser válidos
    if (step > currentStep) {
        for (let s = currentStep; s < step; s++) {
            const bad = validateStep(s);
            if (bad) { nextStep(s); bad.focus(); return; }
        }
    }
    nextStep(step);
    $('form-fisico').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
}

function validateFisico() {
    for (const s of [1, 2, 3]) {
        const bad = validateStep(s);
        if (bad) { nextStep(s); bad.focus(); return false; }
    }
    const hasAny = Object.keys(FISICO_FIELDS).some(id => $(id).value.trim() !== '');
    if (!hasAny) { showFormError('fisico', 'Rellena al menos una medida antes de sincronizar.'); return false; }
    return true;
}

function validateMarcas() {
    let firstBad = null;
    const fail = el => { if (!firstBad) firstBad = el; };
    const d = $('m_fecha');
    if (!validateDate(d)) fail(d);

    const isVL = $('m_mesociclo').value === 'VL';
    let hasAny = false;
    lifts().forEach((_, i) => {
        const n = i + 1;
        const kg = $(`m_ex${n}_kg`);
        const reps = $(`m_ex${n}_reps`);
        if (!validateNumber(kg, FIELD_RULES.kg)) fail(kg);
        if (kg.value.trim() !== '') hasAny = true;
        if (isVL) {
            if (!validateNumber(reps, FIELD_RULES.reps)) fail(reps);
            else if (kg.value.trim() !== '' && reps.value.trim() === '') { setFieldError(reps, 'Indica las reps'); fail(reps); }
        }
    });

    if (firstBad) { firstBad.focus(); return false; }
    if (!hasAny) { showFormError('marcas', 'Introduce al menos una marca antes de sincronizar.'); return false; }
    return true;
}
