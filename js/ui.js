// FitTrack · Avisos, navegación, perfiles y autenticación
// Scripts clásicos que comparten ámbito global; se cargan en el orden de index.html.

// ---- FEEDBACK ----
function showToast(msg, type = 'info', opts = {}) {
    const region = $('toast-region');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info', pr: 'fa-trophy' };
    // Un aviso con el mismo id sustituye al anterior en vez de apilarse
    if (opts.id) region.querySelectorAll(`.toast[data-id="${opts.id}"]`).forEach(el => el.remove());
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    if (opts.id) t.dataset.id = opts.id;
    t.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}" aria-hidden="true"></i><span class="toast-msg"></span>`;
    t.querySelector('.toast-msg').textContent = msg;
    const dismiss = () => { if (!t.isConnected) return; t.classList.add('toast-out'); setTimeout(() => t.remove(), 200); };
    if (opts.action) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'toast-action'; b.textContent = opts.action.label;
        b.onclick = () => { dismiss(); opts.action.fn(); };
        t.appendChild(b);
    }
    region.appendChild(t);
    while (region.children.length > 3) region.firstChild.remove();
    setTimeout(dismiss, opts.duration || ((opts.action || type === 'error' || type === 'pr') ? 6000 : 3500));
}

function haptic(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }

// ---- VISTAS Y NAVEGACIÓN ----
function showView(id) {
    ['view-loading', 'view-login', 'view-profiles', 'view-app'].forEach(v => $(v).classList.toggle('hidden', v !== id));
    $('btn-logout').classList.toggle('hidden', id !== 'view-profiles');
    $('active-profile-badge').classList.toggle('hidden', id !== 'view-app');
    updatePendingUI();
}

function routeHash(parts) { return '#/' + parts.join('/'); }

// Cambiar de pestaña o perfil añade una entrada al historial (el botón Atrás funciona);
// cambiar de subpestaña la reemplaza.
function navigate(parts, { replace = false } = {}) {
    const h = routeHash(parts);
    if (replace) { history.replaceState(null, '', h); applyRoute(); }
    else if (location.hash === h) applyRoute();
    else location.hash = h;
}

function applyRoute() {
    closeSheet('profile-sheet', false);
    closeSheet('record-sheet', false);
    if (!getKey()) { showView('view-login'); return; }
    let [s, tabRaw, modeRaw] = location.hash.replace(/^#\/?/, '').split('/');
    const rawSlug = s;
    // Accesos directos del icono: "_ultimo" = el último perfil usado
    if (s === '_ultimo') {
        const last = storeGet(LAST_PROFILE_STORAGE);
        s = last && PROFILES[last] ? PROFILES[last].slug : '';
    }
    const profile = Object.keys(PROFILES).find(k => PROFILES[k].slug === s);
    if (!profile) { currentProfile = ''; showView('view-profiles'); return; }

    const tab = TABS[tabRaw] ? tabRaw : 'resumen';
    const mode = TABS[tab].includes(modeRaw) ? modeRaw : tabModes[tab];
    if (s !== rawSlug || tab !== tabRaw || mode !== modeRaw) history.replaceState(null, '', routeHash([s, tab, mode]));

    if (profile !== currentProfile) activateProfile(profile);
    currentTab = tab;
    tabModes[tab] = mode;
    showView('view-app');
    showTab();
}

function setTab(tab) { navigate([slug(), tab, tabModes[tab]]); }
function setMode(mode) { navigate([slug(), currentTab, mode], { replace: true }); }
function chooseProfile(name) { navigate([PROFILES[name].slug, currentProfile ? currentTab : 'resumen', currentProfile ? tabModes[currentTab] : 'general']); }

function goRegister(mode, meso) {
    if (meso && MESO_NAMES[meso]) { $('m_mesociclo').value = meso; onMesoChange(); }
    navigate([slug(), 'registrar', mode]);
}

function routeOnStart() {
    if (location.hash.length > 2) { applyRoute(); return; }
    const last = storeGet(LAST_PROFILE_STORAGE);
    if (last && PROFILES[last]) navigate([PROFILES[last].slug, 'resumen', 'general'], { replace: true });
    else applyRoute();
}

window.addEventListener('hashchange', applyRoute);

function showTab() {
    Object.keys(TABS).forEach(t => {
        $('tab-' + t).classList.toggle('hidden', t !== currentTab);
        const nav = document.querySelector(`.nav-item[data-tab="${t}"]`);
        nav.classList.toggle('active', t === currentTab);
        if (t === currentTab) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current');
    });
    const mode = tabModes[currentTab];
    document.querySelectorAll(`#tab-${currentTab} [role="tab"]`).forEach(b => {
        const on = b.dataset.mode === mode;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
    });
    renderCurrent();
}

function renderCurrent() {
    if (!currentProfile) return;
    if (currentTab === 'resumen') renderResumen();
    else if (currentTab === 'registrar') renderRegistrar();
    else if (currentTab === 'progreso') renderProgreso();
    else renderHistorial();
}

// Muestra esqueleto / error si aún no hay datos. Devuelve true si se puede pintar.
function ensureData(skeletonId, errorId) {
    const has = hasProfileData();
    const state = loadState[currentProfile] || 'idle';
    $(skeletonId).classList.toggle('hidden', has || state === 'error');
    $(errorId).classList.toggle('hidden', has || state !== 'error');
    if (!has && state === 'idle') refreshData();
    return has;
}

// ---- PERFILES ----
function buildProfileButtons() {
    $('profile-selector').innerHTML = Object.entries(PROFILES).map(([name, p]) =>
        `<button type="button" class="glass profile-btn" style="--p:${p.color}; --p-rgb:${p.rgb}" onclick="chooseProfile('${name}')"><i class="fa-solid ${p.icon}" aria-hidden="true"></i> ${name}</button>`
    ).join('');
    $('sheet-profiles').innerHTML = Object.entries(PROFILES).map(([name, p]) =>
        `<button type="button" class="sheet-profile" data-profile="${name}" style="--p:${p.color}; --p-rgb:${p.rgb}" onclick="chooseProfile('${name}')"><i class="fa-solid ${p.icon}" aria-hidden="true"></i>${name}</button>`
    ).join('');
}

function activateProfile(profile) {
    if (editing) { editing = null; $('m_mesociclo').disabled = false; }
    currentProfile = profile;
    storeSet(LAST_PROFILE_STORAGE, profile);
    const p = PROFILES[profile];
    const root = document.documentElement;
    root.style.setProperty('--theme', p.color);
    root.style.setProperty('--theme-rgb', p.rgb);
    $('active-profile-name').innerText = profile;

    destroyCharts();
    buildMarcasFields();
    buildMarcasCharts();
    showFormError('fisico', ''); showFormError('marcas', '');

    // Formularios limpios del nuevo perfil, y recuperar su borrador si lo hay
    resetForm('fisico', { keepDraft: true });
    resetForm('marcas', { keepDraft: true });
    const restored = ['fisico', 'marcas'].filter(restoreDraft);
    onMesoChange();
    updateEditUI();
    refreshData({ silent: true, profile });
    if (restored.length) {
        showToast('Borrador recuperado', 'info', { id: 'draft', action: { label: 'Descartar', fn: () => restored.forEach(m => resetForm(m)) } });
    }
}

// Hojas inferiores (perfiles y detalle de registro)
let sheetReturnFocus = null;
function openSheet(id, focusEl) {
    sheetReturnFocus = document.activeElement;
    $(id).classList.remove('hidden');
    if (focusEl) focusEl.focus();
}
function closeSheet(id, restoreFocus = true) {
    const sheet = $(id);
    if (sheet.classList.contains('hidden')) return;
    sheet.classList.add('hidden');
    if (restoreFocus && sheetReturnFocus && sheetReturnFocus.isConnected) sheetReturnFocus.focus();
}
function openProfileSheet() {
    document.querySelectorAll('.sheet-profile').forEach(b => b.setAttribute('aria-current', b.dataset.profile === currentProfile ? 'true' : 'false'));
    openSheet('profile-sheet', document.querySelector('.sheet-profile[aria-current="true"]') || document.querySelector('.sheet-profile'));
}
function closeProfileSheet(restoreFocus = true) { closeSheet('profile-sheet', restoreFocus); }

// ---- AUTENTICACIÓN ----
async function login() {
    const key = $('login-key').value.trim();
    const btn = $('btn-login');
    const err = $('login-error');
    if (!key) return;
    err.innerText = '';
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="loader"></span> Comprobando...';
    const last = storeGet(LAST_PROFILE_STORAGE);
    const res = await fetchHistory(key, last && PROFILES[last] ? last : 'none');
    btn.disabled = false;
    btn.innerHTML = original;
    if (res.status === 'ok') {
        setKey(key);
        mergeData(res.data);
        $('login-key').value = '';
        routeOnStart();
        flushQueue();
        if (res.weakKey) showToast('Tu clave de acceso es corta: cámbiala por una de al menos 12 caracteres (Apps Script → Propiedades del script → ACCESS_KEY).', 'info', { id: 'weak-key', duration: 10000 });
    } else if (res.status === 'unauthorized') {
        err.innerText = 'Clave incorrecta';
    } else {
        err.innerText = 'No se pudo conectar. Inténtalo de nuevo.';
    }
}

function logout() {
    clearKey();
    storeDel(CACHE_STORAGE);
    Object.keys(PROFILES).forEach(n => ['fisico', 'marcas'].forEach(m => storeDel(`fittrack_draft_${PROFILES[n].slug}_${m}`)));
    // La cola de pendientes NO se borra: se enviará al volver a entrar
    historyDataCache = null;
    Object.keys(loadState).forEach(k => delete loadState[k]);
    currentProfile = '';
    destroyCharts();
    history.replaceState(null, '', location.pathname + location.search);
    showView('view-login');
}

async function initAuth() {
    buildProfileButtons();
    const key = getKey();
    if (!key) { showView('view-login'); return; }
    // Se pinta al instante con la caché; cada perfil se actualiza en segundo plano al abrirlo.
    // Sin red también se entra: la clave guardada ya se validó antes.
    historyDataCache = loadCache();
    routeOnStart();
    flushQueue();
}
