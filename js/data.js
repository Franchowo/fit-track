// FitTrack · Almacenamiento local, acceso, caché del historial y cola de envíos sin conexión
// Scripts clásicos que comparten ámbito global; se cargan en el orden de index.html.

// ---- ALMACENAMIENTO LOCAL ----
function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function storeDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

// ---- ACCESO PRIVADO ----
// La clave NO está en el código: se pide al usuario y se guarda solo en su dispositivo.
// El Apps Script la comprueba en cada petición.
const KEY_STORAGE = 'fittrack_access_key';
const CACHE_STORAGE = 'fittrack_cache_v1';
const LAST_PROFILE_STORAGE = 'fittrack_last_profile';
const QUEUE_STORAGE = 'fittrack_queue_v1';
function getKey() { return storeGet(KEY_STORAGE) || ''; }
function setKey(k) { storeSet(KEY_STORAGE, k); }
function clearKey() { storeDel(KEY_STORAGE); }

// ---- CACHÉ DEL HISTORIAL (stale-while-revalidate) ----
function loadCache() {
    try {
        const c = JSON.parse(storeGet(CACHE_STORAGE));
        if (!c || !c.data) return null;
        // Solo los perfiles que siguen existiendo (se descartan los eliminados)
        const data = {};
        Object.keys(c.data).forEach(p => { if (PROFILES[p]) data[p] = c.data[p]; });
        return data;
    } catch (e) { return null; }
}
function persistCache() {
    if (historyDataCache) storeSet(CACHE_STORAGE, JSON.stringify({ ts: Date.now(), data: historyDataCache }));
}
// Fusiona los perfiles recibidos con los que ya había en caché
function mergeData(partial) {
    const known = {};
    Object.keys(partial || {}).forEach(p => { if (PROFILES[p]) known[p] = partial[p]; });
    historyDataCache = Object.assign({}, historyDataCache || {}, known);
    persistCache();
}

// POST al Apps Script. text/plain evita el preflight CORS (Apps Script no lo soporta).
// Devuelve el JSON del servidor, o { status: 'network' } si no hubo respuesta válida.
async function postJson(body) {
    try {
        const response = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
        return await response.json();
    } catch (e) { return { status: 'network' }; }
}

// Lectura antigua por GET (la clave viaja en la URL). Solo para Apps Script anteriores.
async function legacyGet(key, profile) {
    try {
        let url = APPS_SCRIPT_URL + '?key=' + encodeURIComponent(key);
        if (profile) url += '&profile=' + encodeURIComponent(profile);
        return await (await fetch(url)).json();
    } catch (e) { return { status: 'network' }; }
}

// Devuelve { status: 'ok' | 'unauthorized' | 'network', data, weakKey }.
// Con "profile" solo se descarga ese perfil ('none' = solo comprobar la clave).
// La clave va en el cuerpo de la petición, nunca en la URL.
async function fetchHistory(key, profile) {
    let result = await postJson({ action: 'read', key, profile: profile || '' });
    // Apps Script anterior (no conoce la acción "read"): se usa la lectura antigua
    if (result.status === 'error') result = await legacyGet(key, profile);
    if (result.status === 'success') return { status: 'ok', data: result.data, weakKey: !!result.weakKey };
    if (result.status === 'unauthorized') return { status: 'unauthorized' };
    return { status: 'network' };
}

// Descarga el historial de un perfil en segundo plano y repinta solo si ha cambiado
async function refreshData({ silent = false, profile = currentProfile } = {}) {
    if (!profile || !getKey()) return;
    if (refreshPromises[profile]) return refreshPromises[profile];
    loadState[profile] = 'loading';
    refreshPromises[profile] = (async () => {
        const r = await fetchHistory(getKey(), profile);
        if (r.status === 'ok') {
            const before = historyDataCache ? JSON.stringify(historyDataCache[profile]) : '';
            mergeData(r.data);
            loadState[profile] = 'idle';
            if (profile === currentProfile && JSON.stringify(historyDataCache[profile]) !== before) renderCurrent();
        } else if (r.status === 'unauthorized') {
            loadState[profile] = 'idle';
            showToast('Tu clave de acceso ya no es válida', 'error');
            logout();
        } else {
            loadState[profile] = 'error';
            if (profile === currentProfile) {
                if (!hasProfileData()) renderCurrent();
                else if (!silent) showToast('Sin conexión: mostrando los datos guardados', 'info', { id: 'offline' });
            }
        }
        return r.status;
    })();
    try { return await refreshPromises[profile]; } finally { delete refreshPromises[profile]; }
}

function hasProfileData() { return !!(historyDataCache && historyDataCache[currentProfile]); }
function retryLoad() { loadState[currentProfile] = 'idle'; renderCurrent(); }

// ---- COLA DE ENVÍOS SIN CONEXIÓN ----
// Si al guardar no hay red, el registro se guarda aquí y se reenvía automáticamente.
// Cada registro lleva un id único: el Apps Script ignora los duplicados.
let queue = loadQueue();
let flushing = false;
function loadQueue() { try { return JSON.parse(storeGet(QUEUE_STORAGE)) || []; } catch (e) { return []; } }
function persistQueue() {
    if (queue.length) storeSet(QUEUE_STORAGE, JSON.stringify(queue)); else storeDel(QUEUE_STORAGE);
    updatePendingUI();
}
function newId() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function updatePendingUI() {
    const btn = $('btn-pending');
    const n = queue.length;
    btn.classList.toggle('hidden', !n || !getKey() || !$('view-login').classList.contains('hidden'));
    btn.classList.toggle('syncing', flushing);
    $('pending-count').innerText = n;
    const label = `${n} registro${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'} de enviar. Pulsa para reintentar.`;
    btn.setAttribute('aria-label', label);
    btn.title = label;
}

// Devuelve el JSON del servidor, o { status: 'network' } si no hubo respuesta válida
function sendPayload(payload) { return postJson(Object.assign({}, payload, { key: getKey() })); }

// Añade el registro ya guardado en el servidor a la caché local (se ve al momento).
// Con la fila y la huella que devuelve el servidor, se puede editar sin recargar.
function applyToCache(payload, result) {
    if (!historyDataCache || !historyDataCache[payload.profile]) return;
    const bucket = payload.type === 'fisico' ? 'fisico' : payload.mesociclo_marca;
    const pd = historyDataCache[payload.profile];
    const extra = result && result.row ? { row: result.row, rev: result.rev } : {};
    pd[bucket] = (pd[bucket] || []).concat([Object.assign(recordFromPayload(payload), extra)]);
    persistCache();
}

function cacheBucket(profile, bucket) {
    return (historyDataCache && historyDataCache[profile] && historyDataCache[profile][bucket]) || null;
}

function replaceInCache(profile, bucket, row, record) {
    const arr = cacheBucket(profile, bucket);
    if (!arr) return;
    const i = arr.findIndex(r => r.row === row);
    if (i !== -1) arr[i] = record;
    persistCache();
}

// Al borrar una fila, las de debajo suben una posición en la hoja
function removeFromCache(profile, bucket, row) {
    const arr = cacheBucket(profile, bucket);
    if (!arr) return;
    historyDataCache[profile][bucket] = arr.filter(r => r.row !== row).map(r => (r.row > row ? Object.assign({}, r, { row: r.row - 1 }) : r));
    persistCache();
}

async function flushQueue({ manual = false } = {}) {
    if (flushing || !queue.length || !getKey()) return;
    flushing = true; updatePendingUI();
    let sent = [], failed = [], offline = false;
    try {
        for (const item of [...queue]) {
            if (item.failed && !manual) continue;
            const r = await sendPayload(item.payload);
            if (r.status === 'success') {
                queue = queue.filter(q => q.id !== item.id);
                applyToCache(item.payload, r);
                sent.push(item);
                persistQueue();
            } else if (r.status === 'unauthorized') {
                showToast('Tu clave de acceso ya no es válida. Los registros pendientes se enviarán cuando vuelvas a entrar.', 'error');
                flushing = false;
                logout();
                return;
            } else if (r.status === 'network') {
                offline = true;
                break;
            } else {
                item.failed = true;
                item.error = r.message || 'Error del servidor';
                failed.push(item);
                persistQueue();
            }
        }
    } finally { flushing = false; updatePendingUI(); }

    if (sent.length) {
        showToast(sent.length === 1 ? 'Registro pendiente enviado' : `${sent.length} registros pendientes enviados`, 'success', { id: 'queue' });
        renderCurrent();
        [...new Set(sent.map(i => i.payload.profile))].forEach(p => refreshData({ silent: true, profile: p }));
    }
    if (failed.length) {
        showToast(`El servidor rechazó ${failed.length === 1 ? 'un registro' : failed.length + ' registros'}: ${failed[0].error}`, 'error', {
            id: 'queue-fail', action: { label: 'Descartar', fn: () => { queue = queue.filter(q => !q.failed); persistQueue(); renderCurrent(); } }
        });
    }
    if (manual && offline && !sent.length) showToast('Sigue sin conexión. Se reintentará automáticamente.', 'info', { id: 'queue' });
}

window.addEventListener('online', () => flushQueue());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flushQueue(); });
setInterval(() => { if (queue.length) flushQueue(); }, 60000);
