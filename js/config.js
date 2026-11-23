// FitTrack · Configuración (perfiles, ejercicios) y estado de la app
// Scripts clásicos que comparten ámbito global; se cargan en el orden de index.html.

// PEGA AQUÍ TU NUEVA URL DEL APPS SCRIPT
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwRBQoSib2g68fEs9Wy0K-DdawIVgw5UO5I7cSsY4tpCv5lkezcgkNiXH8Bk9dUgp07Kg/exec';

// ---- CONFIGURACIÓN ----
const LIFTS = {
    squat:    { name: 'Sentadilla',  icon: 'fa-arrows-up-down' },
    bench:    { name: 'Press Banca', icon: 'fa-dumbbell' },
    deadlift: { name: 'Peso Muerto', icon: 'fa-weight-hanging' }
};
// El orden de "lifts" corresponde a las columnas ex1, ex2... de la hoja
const PROFILES = {
    // sex: 'M' hombre / 'F' mujer (solo se usa para la puntuación DOTS)
    // color/rgb: modo oscuro · colorLight/rgbLight: modo claro (más oscuro para que se lea sobre blanco)
    'FRAN':    { slug: 'fran',    color: '#00f3ff', rgb: '0, 243, 255',   colorLight: '#0e7490', rgbLight: '14, 116, 144', icon: 'fa-user-ninja',      sex: 'M', lifts: ['squat', 'bench', 'deadlift'] },
    'MAMÁ':    { slug: 'mama',    color: '#ff00ea', rgb: '255, 0, 234',   colorLight: '#a21caf', rgbLight: '162, 28, 175', icon: 'fa-user-astronaut',  sex: 'F', lifts: ['squat', 'bench', 'deadlift'] }
};
const MESO_NAMES = { FB: 'Fuerza Base', VL: 'Volumen', PK: 'Peaking' };
const TABS = { resumen: ['general'], registrar: ['fisico', 'marcas'], progreso: ['fisico', 'marcas'], historial: ['fisico', 'fb', 'vl', 'pk'] };
// Campos del formulario físico ↔ clave en los datos del servidor
const FISICO_FIELDS = {
    f_edad: 'edad', f_peso: 'peso', f_grasa_pct: 'grasa_pct', f_musculo: 'musculo', f_hueso: 'hueso',
    f_viscera: 'viscera', f_grasa: 'grasa', f_pecho: 'pecho', f_hombros: 'hombros', f_biceps: 'biceps',
    f_abdomen: 'abdomen', f_pierna: 'pierna'
};
const STEP_TITLES = { 1: 'General', 2: 'Composición', 3: 'Perímetros' };

// ---- ESTADO ----
let currentProfile = '';
let currentTab = 'registrar';
const tabModes = { resumen: 'general', registrar: 'fisico', progreso: 'fisico', historial: 'fisico' };
let currentStep = 1;
let editing = null;      // registro que se está editando: { mode, bucket, row, rev, qid, fecha, ret }
let recordCtx = null;    // registro abierto en la hoja de detalle: { d, bucket }
let tableRecords = [];   // filas pintadas en el historial (para abrir su detalle)
let chartsInstance = {};
let historyDataCache = null;
const loadState = {};      // por perfil: 'idle' | 'loading' | 'error'
const refreshPromises = {}; // peticiones en curso, por perfil
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = id => document.getElementById(id);
const lifts = () => PROFILES[currentProfile].lifts;
const slug = () => PROFILES[currentProfile].slug;
