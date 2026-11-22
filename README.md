# FitTrack

App web (PWA) para registrar medidas físicas y marcas de fuerza, con Google Sheets como base de datos a través de Google Apps Script.

- **App:** https://franchowo.github.io/fit-track/ (GitHub Pages, rama `main`)
- **Backend:** `apps-script/Code.gs`, desplegado como aplicación web desde la hoja de cálculo
- **Hoja de ruta:** [ROADMAP.md](ROADMAP.md)

## Estructura

| Ruta | Qué es |
|------|--------|
| `index.html` | Estructura de la página; carga `css/` y `js/` con una huella (`?v=…`) |
| `css/app.css` | Estilos |
| `js/*.js` | Lógica de la app, en scripts clásicos que se cargan en el orden de `index.html` |
| `sw.js` | Service worker: app instalable y disponible sin conexión |
| `apps-script/Code.gs` | Backend (lectura, alta, edición, borrado y objetivos) |
| `tests/` | Pruebas: Apps Script con servicios de Google simulados y la app en Chromium |
| `tools/` | `stamp.mjs` (huellas de css/js) y `check-syntax.mjs` |

## Desarrollo

```bash
npm install
```

Después de cambiar algo en `css/` o `js/`, actualiza las huellas de `index.html` (si no, el navegador podría usar la versión anterior):

```bash
npm run stamp
```

Comprobaciones y pruebas (también se ejecutan en GitHub en cada cambio):

```bash
npm run check
```

```bash
npm test
```

## Publicar

1. **App:** al fusionar en `main`, GitHub Pages la publica en un minuto aproximadamente. Los móviles reciben el aviso *"Hay una nueva versión · Recargar"*.
2. **Apps Script** (solo si cambia `apps-script/Code.gs`): copia el archivo en el editor de Apps Script y usa *Implementar → Gestionar implementaciones → lápiz → Nueva versión*. No crees una implementación nueva: cambiaría la URL.

La clave de acceso se guarda en *Propiedades del script → `ACCESS_KEY`* (12 caracteres o más).
