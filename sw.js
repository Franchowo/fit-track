// FitTrack - Service Worker
//
// - App shell (HTML, manifest, iconos): se sirve desde caché al instante y se actualiza
//   en segundo plano. Si el HTML ha cambiado, avisa a la app para ofrecer "Recargar".
// - Librerías de CDN (Chart.js, Font Awesome y sus fuentes): caché primero.
// - El Apps Script (datos) NUNCA se cachea aquí: de eso se encarga la propia app.
//
// Sube SHELL_VERSION solo si cambias la lista de archivos precacheados.

const SHELL_VERSION = 'v1';
const SHELL_CACHE = 'fittrack-shell-' + SHELL_VERSION;
const CDN_CACHE = 'fittrack-cdn-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];
const CDN_FILES = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL_FILES);
    // Las librerías externas son "best effort": si una falla, la instalación sigue adelante
    const cdn = await caches.open(CDN_CACHE);
    await Promise.all(CDN_FILES.map(async url => {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (res.ok) await cdn.put(url, res);
      } catch (e) { /* se cacheará en el primer uso */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [SHELL_CACHE, CDN_CACHE];
    for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Avisa a las pestañas abiertas y, en una navegación, a la página que se está cargando
// (puede no estar lista todavía: clients.get espera a que lo esté).
async function notifyClients(message, resultingClientId) {
  const sent = new Set();
  for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
    c.postMessage(message); sent.add(c.id);
  }
  if (resultingClientId && !sent.has(resultingClientId)) {
    const c = await self.clients.get(resultingClientId);
    if (c) c.postMessage(message);
  }
}

// Caché primero y actualización en segundo plano. Para el HTML, si la versión
// de red es distinta de la cacheada, se avisa a la app.
async function staleWhileRevalidate(event, cacheKey) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(cacheKey, { ignoreSearch: true });
  // Copia para comparar: el cuerpo de "cached" se consume al entregarlo a la página
  const cachedCopy = cached ? cached.clone() : null;
  // no-cache: revalida con el servidor en vez de aceptar la copia de la caché HTTP del navegador
  const url = typeof cacheKey === 'string' ? cacheKey : cacheKey.url;
  const network = fetch(url, { cache: 'no-cache', credentials: 'same-origin' }).then(async res => {
    if (res && res.ok && res.type === 'basic') {
      const isHtml = (res.headers.get('content-type') || '').includes('text/html');
      if (isHtml && cachedCopy) {
        const [oldText, newText] = await Promise.all([cachedCopy.text(), res.clone().text()]);
        await cache.put(cacheKey, res.clone());
        if (oldText !== newText) await notifyClients({ type: 'update-available' }, event.resultingClientId);
      } else {
        await cache.put(cacheKey, res.clone());
      }
    }
    return res;
  }).catch(() => null);

  if (cached) { event.waitUntil(network); return cached; }
  const res = await network;
  return res || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function cacheFirst(request) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Toda navegación (con cualquier #ruta o ?query) se sirve con el index.html cacheado
    const key = req.mode === 'navigate' ? new URL('./index.html', self.registration.scope).href : req;
    event.respondWith(staleWhileRevalidate(event, key));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
  // Cualquier otra petición (Apps Script incluido) va directa a la red.
});
