// FitTrack - Backend (Google Apps Script)
//
// ACCESO PRIVADO: la clave de acceso NO se escribe aquí.
// Se guarda en: Configuración del proyecto (⚙️) → Propiedades del script
//   Propiedad: ACCESS_KEY    Valor: <tu clave secreta>
// Toda petición sin la clave correcta se rechaza con {status: 'unauthorized'}.
//
// HOJAS: una por perfil para el físico (FRAN, MAMÁ...) y una por perfil y mesociclo para
// las marcas (FRAN_FB, FRAN_VL, FRAN_PK...). Las columnas se localizan por el NOMBRE de su
// cabecera (fila 1); si una cabecera no se reconoce, se usa su posición de siempre.

// ---- CONFIGURACIÓN ----
// Ejercicios de cada perfil, en el orden de la app (ex1, ex2...). Deben coincidir con las
// cabeceras de las hojas de marcas: "Sentadilla" y, en Volumen, "Sentadilla Reps".
var PROFILE_LIFTS = {
  'FRAN':    ['Sentadilla', 'Press Banca', 'Peso Muerto'],
  'MAMÁ':    ['Sentadilla', 'Press Banca', 'Peso Muerto']
};
var MESOS = ['FB', 'VL', 'PK'];

// Campos de la hoja física: nombre en la app, cabeceras aceptadas y posición por defecto
var FISICO_FIELDS = [
  { key: 'fecha',     headers: ['fecha'],                                   pos: 0 },
  { key: 'mesociclo', headers: ['mesociclo', 'meso'],                       pos: 1 },
  { key: 'edad',      headers: ['edad', 'edad metabolica'],                 pos: 2 },
  { key: 'peso',      headers: ['peso'],                                    pos: 3 },
  { key: 'grasa_pct', headers: ['imc', '% graso', '% grasa', 'grasa %'],    pos: 4 },
  { key: 'musculo',   headers: ['musculo'],                                 pos: 5 },
  { key: 'hueso',     headers: ['hueso'],                                   pos: 6 },
  { key: 'viscera',   headers: ['viscera', 'grasa visceral'],               pos: 7 },
  { key: 'grasa',     headers: ['grasa', 'grasa kg'],                       pos: 8 },
  { key: 'pecho',     headers: ['pecho'],                                   pos: 9 },
  { key: 'hombros',   headers: ['hombros'],                                 pos: 10 },
  { key: 'biceps',    headers: ['biceps'],                                  pos: 11 },
  { key: 'abdomen',   headers: ['abdomen'],                                 pos: 12 },
  { key: 'pierna',    headers: ['pierna'],                                  pos: 13 }
];
var FISICO_TEXT_FIELDS = ['mesociclo'];

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---- DEDUPLICACIÓN ----
// La app reintenta los envíos que se quedaron sin conexión. Cada envío lleva un id único:
// se guardan los últimos ids procesados para no escribir dos veces la misma fila.
var PROCESSED_IDS_PROP = 'PROCESSED_IDS';
var MAX_PROCESSED_IDS = 150;

function getProcessedIds(props) {
  try { return JSON.parse(props.getProperty(PROCESSED_IDS_PROP) || '[]'); } catch (e) { return []; }
}

function markProcessed(props, ids, id) {
  ids.push(id);
  if (ids.length > MAX_PROCESSED_IDS) ids = ids.slice(ids.length - MAX_PROCESSED_IDS);
  props.setProperty(PROCESSED_IDS_PROP, JSON.stringify(ids));
}

// ---- SEGURIDAD ----
// - La app envía la clave en el cuerpo de un POST (acción "read"), no en la URL.
// - Cada intento con clave incorrecta se frena con una espera creciente (hasta 5 s durante
//   15 minutos), lo que hace inviable probar claves a lo bruto. La clave buena nunca espera.
// - Usa una clave larga (12 caracteres o más); la app avisa si es más corta.
var MIN_KEY_LENGTH = 12;
var FAILS_CACHE_KEY = 'AUTH_FAILS';

function expectedKey() {
  return PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
}

// Comparación en tiempo constante (no revela cuántos caracteres coinciden)
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function failedAttempt() {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get(FAILS_CACHE_KEY) || 0) + 1;
  cache.put(FAILS_CACHE_KEY, String(fails), 900);
  Utilities.sleep(Math.min(fails * 300, 5000));
}

function isAuthorized(key) {
  var expected = expectedKey();
  var ok = !!expected && !!key && safeEqual(key, expected); // sin clave configurada, nadie entra
  if (!ok) failedAttempt();
  return ok;
}

// ---- UTILIDADES ----
function normalize(s) {
  return String(s == null ? '' : s).toLowerCase().trim()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/\s+/g, ' ');
}

function parseNum(val) {
  if (val === '' || val == null) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  var num = parseFloat(String(val).replace('%', '').replace(',', '.'));
  return isNaN(num) ? null : num;
}

// Valor que se escribe en una celda: número de verdad si lo es (no depende del idioma de la hoja)
function toCell(val) {
  if (val === '' || val == null) return '';
  var s = String(val).trim();
  if (/^-?\d+([.,]\d+)?$/.test(s)) return parseFloat(s.replace(',', '.'));
  return s;
}

// "2026-11-22" → Date (medianoche en la zona horaria del script)
function toDate(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return iso || '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function pad2(n) { return ('0' + n).slice(-2); }

function parseDateToString(dateVal) {
  if (dateVal instanceof Date) {
    return pad2(dateVal.getDate()) + '/' + pad2(dateVal.getMonth() + 1) + '/' + dateVal.getFullYear().toString().slice(-2);
  }
  return dateVal.toString().split('T')[0];
}

function dateToIso(dateVal) {
  if (dateVal instanceof Date) {
    return dateVal.getFullYear() + '-' + pad2(dateVal.getMonth() + 1) + '-' + pad2(dateVal.getDate());
  }
  var s = String(dateVal);
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad2(m[2]) + '-' + pad2(m[1]);
  return '';
}

// Huella del contenido de una fila: si cambia, alguien la ha modificado desde que la app la leyó
function rowRev(rowValues) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(rowValues));
  return Utilities.base64Encode(bytes).slice(0, 16);
}

// ---- MAPA DE COLUMNAS ----
// Devuelve { campo: índiceDeColumna (base 0) }
function fisicoColumns(headers) {
  var norm = headers.map(normalize);
  var map = {};
  FISICO_FIELDS.forEach(function(f) {
    var idx = -1;
    for (var i = 0; i < f.headers.length && idx === -1; i++) idx = norm.indexOf(f.headers[i]);
    map[f.key] = idx !== -1 ? idx : f.pos;
  });
  return map;
}

function marcasColumns(headers, profile, meso) {
  var norm = headers.map(normalize);
  var lifts = PROFILE_LIFTS[profile] || [];
  var isVL = (meso === 'VL');
  var map = { fecha: norm.indexOf('fecha') !== -1 ? norm.indexOf('fecha') : 0 };
  lifts.forEach(function(name, i) {
    var n = i + 1, h = normalize(name);
    var kg = norm.indexOf(h);
    map['ex' + n + '_kg'] = kg !== -1 ? kg : (isVL ? 2 * n - 1 : n);
    if (isVL) {
      var reps = norm.indexOf(h + ' reps');
      map['ex' + n + '_reps'] = reps !== -1 ? reps : 2 * n;
    }
  });
  return map;
}

function sheetFor(data) {
  if (!PROFILE_LIFTS.hasOwnProperty(data.profile)) throw new Error('Perfil desconocido: ' + data.profile);
  var name = data.type === 'marcas' ? data.profile + '_' + data.mesociclo_marca : data.profile;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Hoja no encontrada: ' + name);
  return sheet;
}

function headersOf(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

function columnsFor(sheet, data) {
  var headers = headersOf(sheet);
  return data.type === 'marcas' ? marcasColumns(headers, data.profile, data.mesociclo_marca) : fisicoColumns(headers);
}

// ¿La columna tiene formato de porcentaje? (entonces 14,2 se guarda como 0,142)
function isPercentColumn(sheet, colIdx) {
  var row = Math.max(2, Math.min(sheet.getLastRow(), sheet.getMaxRows()));
  try { return String(sheet.getRange(row, colIdx + 1).getNumberFormat()).indexOf('%') !== -1; } catch (e) { return false; }
}

// Valores a escribir: { índiceDeColumna: valor }
function cellsFor(sheet, data, cols) {
  var cells = {};
  cells[cols.fecha] = toDate(data.fecha);
  if (data.type === 'marcas') {
    var n = (PROFILE_LIFTS[data.profile] || []).length;
    for (var i = 1; i <= n; i++) {
      cells[cols['ex' + i + '_kg']] = toCell(data['ex' + i + '_kg']);
      if (data.mesociclo_marca === 'VL') cells[cols['ex' + i + '_reps']] = toCell(data['ex' + i + '_reps']);
    }
  } else {
    // "grasa_pct" es el nombre nuevo; "imc" se mantiene por compatibilidad con versiones antiguas de la app
    var values = Object.assign ? Object.assign({}, data) : JSON.parse(JSON.stringify(data));
    if (values.grasa_pct == null || values.grasa_pct === '') values.grasa_pct = data.imc;
    FISICO_FIELDS.forEach(function(f) {
      if (f.key === 'fecha') return;
      var v = FISICO_TEXT_FIELDS.indexOf(f.key) !== -1 ? (values[f.key] || '') : toCell(values[f.key]);
      if (f.key === 'grasa_pct' && typeof v === 'number' && isPercentColumn(sheet, cols.grasa_pct)) v = v / 100;
      cells[cols[f.key]] = v;
    });
  }
  return cells;
}

function readRow(sheet, row) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(row, 1, 1, lastCol).getValues()[0];
}

// Comprueba que la fila existe y no ha cambiado desde que la app la leyó
function checkRow(sheet, data) {
  var row = Number(data.row);
  if (!row || row < 2 || row > sheet.getLastRow()) return false;
  return rowRev(readRow(sheet, row)) === data.rev;
}

// ---- OBJETIVOS ----
// Se guardan por perfil en las propiedades del script (GOALS_FRAN...), no en la hoja.
// Formato: { peso: {target, start, startDate}, ex1: {...}, ex2: {...} }
function goalsKey(profile) { return 'GOALS_' + profile; }

function getGoals(props, profile) {
  try { return JSON.parse(props.getProperty(goalsKey(profile)) || '{}'); } catch (e) { return {}; }
}

function saveGoals(props, data) {
  if (!PROFILE_LIFTS.hasOwnProperty(data.profile)) throw new Error('Perfil desconocido: ' + data.profile);
  var input = data.goals || {};
  var clean = {};
  Object.keys(input).forEach(function(k) {
    if (!/^(peso|ex[1-9])$/.test(k) || !input[k]) return;
    var target = parseNum(input[k].target);
    if (target == null || target <= 0 || target > 1000) return;
    var start = parseNum(input[k].start);
    clean[k] = { target: target, start: start, startDate: String(input[k].startDate || '').slice(0, 10) };
  });
  props.setProperty(goalsKey(data.profile), JSON.stringify(clean));
  return { status: 'success', goals: clean };
}

// ---- ACCIONES ----
function addRecord(sheet, data) {
  var cols = columnsFor(sheet, data);
  var cells = cellsFor(sheet, data, cols);
  var width = Math.max.apply(null, Object.keys(cells).map(Number)) + 1;
  var rowData = [];
  for (var i = 0; i < width; i++) rowData.push(cells.hasOwnProperty(i) ? cells[i] : '');
  sheet.appendRow(rowData);
  SpreadsheetApp.flush();
  var row = sheet.getLastRow();
  return { status: 'success', row: row, rev: rowRev(readRow(sheet, row)) };
}

function updateRecord(sheet, data) {
  if (!checkRow(sheet, data)) return { status: 'conflict' };
  var row = Number(data.row);
  var cells = cellsFor(sheet, data, columnsFor(sheet, data));
  // Solo se escriben las columnas de la app: las demás (fórmulas, notas...) no se tocan
  Object.keys(cells).forEach(function(c) { sheet.getRange(row, Number(c) + 1).setValue(cells[c]); });
  SpreadsheetApp.flush();
  return { status: 'success', row: row, rev: rowRev(readRow(sheet, row)) };
}

function deleteRecord(sheet, data) {
  if (!checkRow(sheet, data)) return { status: 'conflict' };
  sheet.deleteRow(Number(data.row));
  SpreadsheetApp.flush();
  return { status: 'success' };
}

function doPost(e) {
  var lock = null;
  try {
    var data = JSON.parse(e.postData.contents);
    if (!isAuthorized(data.key)) return jsonOutput({status: 'unauthorized'});

    // Lectura de datos (no escribe: no necesita bloqueo ni deduplicación)
    if (data.action === 'read') return jsonOutput(readData(data.profile));

    // Evita que dos envíos simultáneos se pisen al escribir en la hoja
    lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) return jsonOutput({status: 'error', message: 'Servidor ocupado, inténtalo de nuevo'});

    var props = PropertiesService.getScriptProperties();
    var processed = getProcessedIds(props);
    var id = data.id ? String(data.id).slice(0, 64) : '';
    if (id && processed.indexOf(id) !== -1) return jsonOutput({status: 'success', duplicate: true});

    var action = data.action || 'add';
    var result;
    if (action === 'goals') {
      result = saveGoals(props, data);
      if (id) markProcessed(props, processed, id);
      return jsonOutput(result);
    }
    var sheet = sheetFor(data);
    if (action === 'add') result = addRecord(sheet, data);
    else if (action === 'update') result = updateRecord(sheet, data);
    else if (action === 'delete') result = deleteRecord(sheet, data);
    else throw new Error('Acción desconocida: ' + action);

    if (id && result.status === 'success') markProcessed(props, processed, id);
    return jsonOutput(result);
  } catch (error) {
    return jsonOutput({status: 'error', message: error.toString()});
  } finally {
    if (lock) lock.releaseLock();
  }
}

// profile "FRAN" devuelve solo ese perfil; "none" solo comprueba la clave; vacío, todos.
function readData(only) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var profiles = Object.keys(PROFILE_LIFTS);
  if (only) profiles = profiles.filter(function(p) { return p === only; });

  var props = PropertiesService.getScriptProperties();
  var data = {};
  profiles.forEach(function(p) {
    data[p] = { fisico: extraerFisico(ss, p), goals: getGoals(props, p) };
    MESOS.forEach(function(m) { data[p][m] = extraerMarcas(ss, p, m); });
  });
  return { status: 'success', data: data, weakKey: String(expectedKey() || '').length < MIN_KEY_LENGTH };
}

// Lectura por GET (?key=...&profile=...): solo para versiones antiguas de la app que aún
// no se hayan actualizado. La app actual lee por POST para que la clave no viaje en la URL.
function doGet(e) {
  try {
    if (!isAuthorized(e && e.parameter ? e.parameter.key : null)) return jsonOutput({status: 'unauthorized'});
    var result = readData(e.parameter.profile);
    delete result.weakKey;
    return jsonOutput(result);
  } catch (error) {
    return jsonOutput({status: 'error', message: error.toString()});
  }
}

function extraerFisico(ss, profile) {
  var sheet = ss.getSheetByName(profile);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var cols = fisicoColumns(values[0]);
  var result = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var fecha = row[cols.fecha];
    if (!fecha) continue;

    var pctVal = row[cols.grasa_pct];
    var pctStr = '-';
    if (pctVal !== '' && pctVal != null) {
      if (typeof pctVal === 'number') {
        var valToFormat = pctVal < 1 ? pctVal * 100 : pctVal;
        pctStr = valToFormat.toFixed(1).replace('.', ',') + '%';
      } else {
        pctStr = pctVal.toString();
      }
    }

    var rec = { row: i + 1, rev: rowRev(row), fecha: parseDateToString(fecha), iso: dateToIso(fecha) };
    FISICO_FIELDS.forEach(function(f) {
      if (f.key === 'fecha') return;
      if (f.key === 'grasa_pct') { rec.grasa_pct = pctStr; rec.imc = pctStr; return; }
      if (f.key === 'mesociclo' || f.key === 'edad') { rec[f.key] = row[cols[f.key]] || '-'; return; }
      rec[f.key] = parseNum(row[cols[f.key]]);
    });
    result.push(rec);
  }
  return result;
}

function extraerMarcas(ss, profile, meso) {
  var sheet = ss.getSheetByName(profile + '_' + meso);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var cols = marcasColumns(values[0], profile, meso);
  var n = (PROFILE_LIFTS[profile] || []).length;
  var result = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var fecha = row[cols.fecha];
    if (!fecha) continue;
    var rec = { row: i + 1, rev: rowRev(row), fecha: parseDateToString(fecha), iso: dateToIso(fecha) };
    for (var k = 1; k <= n; k++) {
      rec['ex' + k + '_kg'] = parseNum(row[cols['ex' + k + '_kg']]);
      if (meso === 'VL') rec['ex' + k + '_reps'] = row[cols['ex' + k + '_reps']];
    }
    result.push(rec);
  }
  return result;
}
