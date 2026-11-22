// FitTrack - Service Worker
//
// - index.html, manifest e iconos: se sirven desde caché al instante y se actualizan en
//   segundo plano. Si index.html ha cambiado, se descargan antes sus CSS/JS y después se
//   avisa a la app para ofrecer "Recargar".
// - css/ y js/ llevan una huella en la URL (?v=...), así que son inmutables: caché primero.
//   Nunca se mezcla un index.html nuevo con un JS viejo.
// - Librerías de CDN (Chart.js, Font Awesome y sus fuentes): caché primero.
// - El Apps Script (datos) NUNCA se cachea aquí: de eso se encarga la propia app.
//
// Sube SHELL_VERSION solo si cambias la lista de archivos fijos de SHELL_FILES.

const SHELL_VERSION = 'v2';
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
const ASSET_RE = /^\/(?:.*\/)?(?:css|js)\/[^/]+$/;

const scopeUrl = path => new URL(path, self.registration.scope).href;

// URLs de css/ y js/ (con su huella) que usa un index.html
function assetsOf(html) {
  const urls = [];
  const re = /(?:src|href)="((?:css|js)\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) urls.push(scopeUrl(m[1]));
  return urls;
}

// Descarga los CSS/JS de un index.html y borra de la caché las versiones que ya no usa
async function cacheAssets(cache, html) {
  const wanted = assetsOf(html);
  await Promise.all(wanted.map(async url => {
    if (await cache.match(url)) return;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('No se pudo descargar ' + url);
    await cache.put(url, res);
  }));
  for (const req of await cache.keys()) {
    if (ASSET_RE.test(new URL(req.url).pathname) && !wanted.includes(req.url)) await cache.delete(req);
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    // no-cache: nunca instalar una copia antigua guardada por la caché HTTP del navegador
    await shell.addAll(SHELL_FILES.map(u => new Request(u, { cache: 'no-cache' })));
    const index = await shell.match(scopeUrl('./index.html'));
    await cacheAssets(shell, await index.text());
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

// Caché primero y actualización en segundo plano. Si index.html cambia, primero se guardan
// sus CSS/JS nuevos, después el propio index.html, y por último se avisa a la app.
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
      if (isHtml) {
        const newText = await res.clone().text();
        const oldText = cachedCopy ? await cachedCopy.text() : null;
        if (oldText !== newText) {
          await cacheAssets(cache, newText);
          await cache.put(cacheKey, res.clone());
          if (oldText !== null) await notifyClients({ type: 'update-available' }, event.resultingClientId);
        }
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

async function cacheFirst(cacheName, request, opts) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, opts);
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
    if (req.mode === 'navigate') {
      // Toda navegación (con cualquier #ruta o ?query) se sirve con el index.html cacheado
      event.respondWith(staleWhileRevalidate(event, scopeUrl('./index.html')));
    } else if (ASSET_RE.test(url.pathname) && url.searchParams.has('v')) {
      // CSS/JS con huella: inmutables
      event.respondWith(cacheFirst(SHELL_CACHE, req));
    } else {
      event.respondWith(staleWhileRevalidate(event, req));
    }
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(CDN_CACHE, req, { ignoreVary: true }));
  }
  // Cualquier otra petición (Apps Script incluido) va directa a la red.
});
