// FitTrack · Arranque de la app y service worker
// Scripts clásicos que comparten ámbito global; se cargan en el orden de index.html.

// ---- SERVICE WORKER (app instalable y disponible sin conexión) ----
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    navigator.serviceWorker.addEventListener('message', e => {
        if (e.data && e.data.type === 'update-available') {
            showToast('Hay una nueva versión de FitTrack', 'info', { id: 'update', duration: 15000, action: { label: 'Recargar', fn: () => location.reload() } });
        }
    });
}

initAuth();
