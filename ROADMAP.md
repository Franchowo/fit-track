# FitTrack · Roadmap de mejoras

> Revisión técnica y de UX/UI de la app actual (`index.html` + `apps-script/Code.gs`, noviembre 2026).
> Leyenda: **Impacto** Alto / Medio / Bajo · **Esfuerzo** S (≤ 1 día) · M (2–4 días) · L (1–2 semanas)

---

## Diagnóstico rápido

**Lo que funciona bien**
- Concepto claro y muy enfocado: registro físico + toma de marcas por mesociclo, para 4 personas.
- Backend gratuito y sin servidor (Google Sheets + Apps Script); los datos siguen siendo editables a mano.
- Identidad visual con personalidad: modo oscuro, *glassmorphism*, un color por perfil.
- Pensada para el móvil: inputs grandes, `inputmode="decimal"`, barra de navegación inferior.
- Acceso privado con clave guardada en el servidor (no en el código).

**Problemas principales**
1. **El guardado puede "mentir".** El `POST` usa `mode: 'no-cors'` (`index.html:541`), así que la respuesta es opaca: la app muestra "¡Datos sincronizados correctamente!" aunque el servidor haya devuelto `unauthorized` o `error` (por ejemplo, una hoja que no existe). **Es el riesgo nº 1: se pueden perder datos sin que nadie se entere.**
2. **No hay validación ni manera de corregir.** Se puede enviar un formulario vacío, y un registro equivocado solo se arregla abriendo la hoja de cálculo.
3. **Sin modo offline.** En el gimnasio la cobertura suele ser mala; si el envío falla, se pierde lo que habías escrito.
4. **Todo está fijado en el código.** Los perfiles, ejercicios y columnas se repiten en 4 o 5 sitios entre el HTML, el JS y el Apps Script. Añadir una persona o un ejercicio exige tocar todo eso.
5. **Accesibilidad e interacción mejorables.** Elementos clicables hechos con `<div>`, labels sin asociar a su input, `alert()` como único feedback y iconos sin texto.

---

## Fase 0 · Correcciones críticas (semana 1) — ✅ completada

| # | Mejora | Detalle | Impacto | Esfuerzo |
|---|--------|---------|---------|----------|
| 0.1 | **Confirmación real del guardado** | Quitar `mode: 'no-cors'` y enviar con `Content-Type: text/plain` (no provoca *preflight* y Apps Script lo acepta). Leer el JSON y mostrar éxito solo si `status === 'success'`. Tratar `unauthorized` (cerrar sesión) y `error` (mostrar el mensaje). | Alto | S |
| 0.2 | **Gráficas de otro perfil que se quedan en pantalla** | `renderChartsFisico` sale antes de destruir las gráficas cuando no hay datos (`index.html:587` vs `:603`). Si cambias a un perfil sin registros, sigues viendo las gráficas y KPIs del anterior. Hay que destruir primero y mostrar un estado vacío. | Alto | S |
| 0.3 | **Validación mínima antes de enviar** | Pedir fecha y al menos un valor. Comprobar rangos razonables (peso 30–250 kg, % graso 2–60, etc.). Marcar en línea el campo con error. | Alto | S |
| 0.4 | **Fijar las versiones de los CDN** | `cdn.jsdelivr.net/npm/chart.js` sin versión puede romper la app con cualquier *major* nueva. Fijar `chart.js@4.4.x` y añadir SRI (`integrity`). | Medio | S |
| 0.5 | **Concurrencia en el Apps Script** | Envolver `appendRow` en `LockService.getScriptLock()` para que dos envíos simultáneos no choquen. | Medio | S |
| 0.6 | **KPI con datos incompletos** | Si falta el peso en el último registro, `diff` sale `NaN` (`index.html:597`). Usar el último valor no nulo. | Medio | S |
| 0.7 | **Escapar el HTML de la tabla** | `renderTable` mete con `innerHTML` texto que viene de la hoja. Escaparlo (o usar `textContent`) por higiene. | Bajo | S |

---

## Fase 1 · Fundamentos de UX (semanas 2–4) — ✅ completada (incluye 2.3)

### 1.1 Feedback y estados
- **Sustituir `alert()` por *toasts*** no bloqueantes (éxito / error / reintentar), con `aria-live="polite"`.
- **Estados vacíos con intención.** Por ejemplo: "Aún no hay marcas de Volumen. [Registrar la primera]", en lugar de un lienzo en blanco con "--".
- **Skeletons** en el dashboard en vez del spinner a pantalla completa.
- **Haptic feedback** (`navigator.vibrate(10)`) al guardar, en Android.

### 1.2 Formulario físico (asistente de 3 pasos)
- Botón **"Atrás"** en los pasos 2 y 3. Ahora no se puede volver sin perder la orientación.
- Puntos de progreso pulsables, con texto: "Paso 2 de 3 · Composición".
- **Valor anterior como *placeholder*** en cada campo (p. ej. `Último: 78,4`). Agiliza el registro y reduce errores de tecleo.
- **Borrador automático** en `localStorage`: si se cierra la app a medias, no se pierde nada.
- **Limpiar el formulario** después de guardar con éxito.
- Unificar nombres: el campo "% Graso" usa el id `f_imc` y se guarda en la columna `imc`, con un apaño de formato en el servidor (`imcVal < 1 ? *100`). Renombrar a `grasa_pct` en todas partes.
- Añadir las **unidades** a los perímetros (cm) y una ayuda para "Víscera" (nivel 1–59).

### 1.3 Formulario de marcas
- Mostrar **el récord actual** junto a cada ejercicio (`PR: 120 kg`) y celebrar uno nuevo al guardar 🎉.
- *Steppers* ± 2,5 kg (o ± 1,25 kg) además de escribir el número.
- Las reps solo se piden en VL. Decirlo explícitamente ("En Volumen registra kg × reps") para que el cambio de layout no desconcierte.

### 1.4 Navegación y arquitectura de la información
- **Etiquetas de texto en la barra inferior** (Registrar · Progreso · Historial · Perfil). Los iconos solos son ambiguos.
- **Dos botones de "apagar" con funciones distintas:** el `power-off` de la barra inferior cambia de perfil y el de la cabecera cierra sesión. Sustituir el primero por un **selector de perfil en la propia cabecera** (tocar el badge ⇒ hoja inferior con los 4 perfiles).
- **Recordar el último perfil** y entrar directamente en él.
- Deep-linking mínimo con `#hash` (`#/fran/progreso/marcas`) para que el botón Atrás de Android funcione.

### 1.5 Accesibilidad (WCAG 2.1 AA)
- Cambiar los `<div onclick>` por `<button>`: perfiles, sub-nav, nav inferior. Así hay teclado y lector de pantalla.
- `<label for>` asociado a cada input. Ahora mismo ningún label está vinculado.
- `role="tablist"` / `aria-selected` en las sub-navegaciones.
- Revisar el contraste de `--text-muted` sobre fondos *glass* y del texto negro sobre los colores de tema.
- Respetar `prefers-reduced-motion` (spinners, `translateY` del nav).
- Tamaño mínimo de diana táctil de 44×44 px (los sub-tabs con scroll horizontal se quedan justos).

---

## Fase 2 · PWA real y fiabilidad (semanas 4–6) — ✅ completada

| # | Mejora | Detalle | Impacto | Esfuerzo |
|---|--------|---------|---------|----------|
| 2.1 ✅ | **Service Worker** | Precachear el *app shell* (HTML, CSS, JS, iconos, Chart.js). La app abre al instante y sin conexión. Sin SW, Android tampoco ofrece una instalación completa. | Alto | M |
| 2.2 ✅ | **Cola de envíos offline** | Si no hay red, guardar el registro en IndexedDB, mostrar "Pendiente de sincronizar (1)" y reintentar al volver la conexión (`online` / Background Sync). | **Muy alto** | M |
| 2.3 ✅ | **Caché del historial (stale-while-revalidate)** | Hoy cada cambio de perfil borra la caché (`resetApp`) y vuelve a descargar los 4 perfiles completos (2–5 s en Apps Script). Guardar en `localStorage`, pintar al momento y refrescar en segundo plano. | Alto | S |
| 2.4 ✅ | **Manifest completo** (pendiente: `screenshots`) | Iconos separados de 192 y 512 px, más uno `maskable` (ahora es un único PNG de 230 KB para todo). Añadir `id`, `scope`, `description`, `screenshots`, `shortcuts` ("Registrar marcas") y un `theme_color` coherente con el fondo. | Medio | S |
| 2.5 ✅ | **Safe areas en iOS** | Con `black-translucent`, la cabecera queda bajo el *notch* y la barra inferior sobre el indicador de inicio. Usar `viewport-fit=cover` y `env(safe-area-inset-*)`. | Medio | S |
| 2.6 ✅ | **Pedir solo el perfil activo** | `doGet?profile=FRAN` para no descargar los datos de las 4 personas. | Medio | S |

---

## Fase 3 · Arquitectura y mantenibilidad (semanas 6–9)

### 3.1 App guiada por configuración
Crear un único objeto (o una pestaña `CONFIG` en la hoja) que defina los perfiles y sus ejercicios:

```js
const PROFILES = {
  FRAN:    { color: '#00f3ff', icon: 'user-ninja',       lifts: ['squat', 'bench', 'deadlift'] },
  MIGUEL:  { color: '#10b981', icon: 'hand-back-fist',   lifts: ['pullup', 'muscleup', 'dips', 'squat'] },
  // ...
};
```

Con esto desaparecen los `if (isMiguel)` / `isClaudia` repartidos por `updateExerciseLabels`, `renderTable`, `renderChartsMarcas`, `doPost` y `extraerMarcas`. Añadir una persona o un ejercicio pasa a ser cambiar una línea.

### 3.2 Modelo de datos por cabeceras
- Leer y escribir las columnas **por nombre de cabecera** y no por posición (`row[7]`). Hoy, insertar una columna en la hoja rompe la app en silencio.
- Opcional: **una sola hoja "larga"** de marcas (`fecha | perfil | meso | ejercicio | kg | reps | notas`) en lugar de 12 hojas. Simplifica el código y permite tablas dinámicas.
- Guardar las fechas como `Date` / ISO y **ordenar por fecha** al leer. Ahora el orden depende del orden de inserción: un registro con fecha pasada aparece al final.
- Usar un **eje temporal real** en Chart.js (`type: 'time'`), para que una pausa de 3 meses no se dibuje igual que una semana.

### 3.3 CRUD completo
- **Editar y borrar** registros desde la vista Historial (deslizar a la izquierda o mantener pulsado). Requiere un `id` por fila en el backend.
- Campo de **notas** por sesión ("molestia en el hombro", "cinturón").

### 3.4 Código y herramientas
- Separar `index.html` (670 líneas) en módulos: `api.js`, `state.js`, `charts.js`, `forms.js` y `styles.css`. Puede seguir siendo *vanilla* con ES modules; si crece, valorar **Vite + Preact/Lit**.
- Versionar el Apps Script con **clasp** y desplegarlo desde el repo.
- **GitHub Actions**: lint (ESLint + Prettier), tests unitarios de utilidades (parseo de números con coma, cálculos de 1RM) y despliegue a GitHub Pages.
- Sacar `APPS_SCRIPT_URL` a un `config.js`.

### 3.5 Seguridad
- Mandar la clave en el *body* (o en una cabecera) también en las lecturas, en vez de en la query string (`?key=`), que queda en el historial y en los logs.
- **Clave o PIN por perfil** (opcional): hoy cualquiera con la clave común puede escribir en el perfil de otra persona.
- Retardo progresivo tras varios intentos fallidos (guardando contadores en `CacheService`) para frenar ataques de fuerza bruta.

---

## Fase 4 · Valor de producto: de "registrar" a "entender" (semanas 9–14)

| # | Funcionalidad | Por qué importa | Impacto | Esfuerzo |
|---|---------------|-----------------|---------|----------|
| 4.1 | **1RM estimado** (Epley/Brzycki) para las marcas de VL con reps | Permite comparar FB, VL y PK en una misma escala. | Alto | S |
| 4.2 | **Récords personales y "Total"** (S+B+D) | Es la métrica estrella en *powerlifting*; también da motivación. | Alto | S |
| 4.3 | **Fuerza relativa** (kg / peso corporal, DOTS) | Une los dos dominios de la app: físico y marcas. | Medio | S |
| 4.4 | **Pantalla de inicio "Resumen"** | Tarjeta por perfil con último registro, tendencia de 4 semanas, días desde la última medición y PRs recientes. | Alto | M |
| 4.5 | **Comparar mesociclos** | Superponer la progresión de FB contra la de PK del ciclo anterior. | Medio | M |
| 4.6 | **Objetivos** | "Peso objetivo 75 kg", "Sentadilla 140 kg", con una barra de progreso y una fecha estimada según la tendencia. | Alto | M |
| 4.7 | **Tendencia suavizada del peso** (media móvil de 7 días o EWMA) | Las básculas tienen mucho ruido; ver la tendencia evita frustraciones. | Medio | S |
| 4.8 | **Recordatorios** | Avisos tipo "Toca medición semanal" (notificaciones *push* de la PWA, o un email desde un *trigger* de Apps Script). | Medio | M |
| 4.9 | **Fotos de progreso** | Antes/después por fecha, guardadas en Google Drive. | Medio | L |
| 4.10 | **Exportar** CSV o PDF del informe del mesociclo | Para compartirlo con un entrenador o nutricionista. | Bajo | S |
| 4.11 | **Vista familiar / ranking amistoso** (opcional) | Gamificación entre los 4 perfiles: rachas, PRs del mes. | Bajo | M |

---

## Fase 5 · Design system y pulido visual (en paralelo, a partir de la fase 1)

- **Tokens de diseño**: escala de espaciado (4/8/12/16/24/32), radios (10/14/20), tipografía (12/14/16/20/28/36) y colores semánticos (`--success`, `--danger`, `--warning`). Hoy hay muchos valores sueltos y estilos *inline* (`style="padding: 30px 20px;"`).
- **Tipografía**: cargar una fuente con cifras tabulares (Inter o Manrope, con `font-variant-numeric: tabular-nums`) para que los KPIs y las tablas no "bailen". `Segoe UI` no existe en iOS ni Android.
- **Gráficas coherentes**: tema común de Chart.js (rejilla sutil, tooltips oscuros, sin animación con *reduced motion*), leyendas consistentes y colores de perímetros validados para daltonismo. En "Músculo vs Grasa" se entendería mejor un gráfico de área apilada o dos líneas que unas barras agrupadas.
- **Tabla de historial en móvil**: cambiar la tabla de 14 columnas con scroll horizontal por **tarjetas expandibles** por fecha, mostrando las diferencias con el registro anterior (▲ ▼ con color).
- **Microinteracciones**: transición entre pestañas, conteo animado en los KPIs, confeti sutil al batir un PR.
- **Modo claro** opcional (`prefers-color-scheme`) para usarla al aire libre.
- **Iconografía**: actualizar Font Awesome (6.0.0 → última 6.x) o pasar a SVG *inline* (Lucide) para quitarse 70 KB de CSS y el parpadeo de los iconos.

---

## Priorización (impacto vs esfuerzo)

```
            ESFUERZO BAJO                     ESFUERZO ALTO
IMPACTO   ┌───────────────────────────────┬──────────────────────────────┐
 ALTO     │ 0.1 guardado fiable           │ 2.2 cola offline             │
          │ 0.2 bug de gráficas           │ 3.1 app por configuración    │
          │ 0.3 validación                │ 3.3 editar/borrar            │
          │ 2.3 caché del historial       │ 4.4 pantalla Resumen         │
          │ 4.1 1RM · 4.2 PRs             │ 4.6 objetivos                │
          ├───────────────────────────────┼──────────────────────────────┤
 MEDIO    │ 0.4 CDN fijados · 0.5 lock    │ 2.1 service worker           │
 / BAJO   │ 1.5 accesibilidad básica      │ 3.4 modularizar + CI         │
          │ 2.4 manifest · 2.5 safe areas │ 4.9 fotos de progreso        │
          └───────────────────────────────┴──────────────────────────────┘
```

**Orden recomendado:** Fase 0 completa → 2.3 + 1.1 + 1.2 (resultado visible enseguida) → 2.1 + 2.2 (offline) → 3.1 + 3.2 (desbloquea todo lo demás) → Fase 4 según lo que pida la familia.

---

## Cómo medir el éxito

| Métrica | Hoy (estimado) | Objetivo |
|---------|----------------|----------|
| Tiempo en registrar una medición física completa | ~90 s | < 45 s (placeholders con el último valor y menos pasos) |
| Registros perdidos o fallidos sin aviso | desconocido (no se detectan) | 0 (confirmación real y cola offline) |
| Tiempo hasta ver el dashboard | 2–5 s (descarga completa) | < 300 ms (caché local) |
| Lighthouse PWA / Accesibilidad | sin SW / ~70 | instalable / ≥ 95 |
| Pasos para añadir un ejercicio nuevo | editar 5 sitios en 2 archivos | 1 línea de configuración |
