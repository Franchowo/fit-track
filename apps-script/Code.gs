// FitTrack - Backend (Google Apps Script)
//
// ACCESO PRIVADO: la clave de acceso NO se escribe aquí.
// Se guarda en: Configuración del proyecto (⚙️) → Propiedades del script
//   Propiedad: ACCESS_KEY    Valor: <tu clave secreta>
// Toda petición sin la clave correcta se rechaza con {status: 'unauthorized'}.

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---- DEDUPLICACIÓN ----
// La app reintenta los envíos que se quedaron sin conexión. Cada registro lleva un id único:
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

function isAuthorized(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  if (!expected || !key) return false; // sin clave configurada, nadie entra
  return String(key) === expected;
}

function doPost(e) {
  var lock = null;
  try {
    var data = JSON.parse(e.postData.contents);
    if (!isAuthorized(data.key)) return jsonOutput({status: 'unauthorized'});

    // Evita que dos envíos simultáneos se pisen al escribir en la hoja
    lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) return jsonOutput({status: 'error', message: 'Servidor ocupado, inténtalo de nuevo'});

    var props = PropertiesService.getScriptProperties();
    var processed = getProcessedIds(props);
    var id = data.id ? String(data.id).slice(0, 64) : '';
    if (id && processed.indexOf(id) !== -1) return jsonOutput({status: 'success', duplicate: true});

    var sheetName = "";
    var rowData = [];

    if (data.type === 'marcas') {
      sheetName = data.profile + '_' + data.mesociclo_marca;
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      if (!sheet) throw new Error('Hoja no encontrada: ' + sheetName);

      var isVL = (data.mesociclo_marca === 'VL');
      var isMiguel = (data.profile === 'MIGUEL');

      if (isVL) {
        if (isMiguel) {
          rowData = [data.fecha, data.ex1_kg, data.ex1_reps, data.ex2_kg, data.ex2_reps, data.ex3_kg, data.ex3_reps, data.ex4_kg, data.ex4_reps];
        } else {
          rowData = [data.fecha, data.ex1_kg, data.ex1_reps, data.ex2_kg, data.ex2_reps, data.ex3_kg, data.ex3_reps];
        }
      } else {
        if (isMiguel) {
          rowData = [data.fecha, data.ex1_kg, data.ex2_kg, data.ex3_kg, data.ex4_kg];
        } else {
          rowData = [data.fecha, data.ex1_kg, data.ex2_kg, data.ex3_kg];
        }
      }
      sheet.appendRow(rowData);

    } else {
      sheetName = data.profile;
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      if (!sheet) throw new Error('Hoja no encontrada: ' + sheetName);

      // "grasa_pct" es el nombre nuevo; "imc" se mantiene por compatibilidad con versiones antiguas de la app
      var grasaPct = (data.grasa_pct != null && data.grasa_pct !== '') ? data.grasa_pct : data.imc;
      rowData = [
        data.fecha, data.mesociclo, data.edad, data.peso, grasaPct,
        data.musculo, data.hueso, data.viscera, data.grasa,
        data.pecho, data.hombros, data.biceps, data.abdomen, data.pierna
      ];
      sheet.appendRow(rowData);
    }

    SpreadsheetApp.flush();
    if (id) markProcessed(props, processed, id);
    return jsonOutput({status: 'success'});
  } catch (error) {
    return jsonOutput({status: 'error', message: error.toString()});
  } finally {
    if (lock) lock.releaseLock();
  }
}

function doGet(e) {
  try {
    if (!isAuthorized(e && e.parameter ? e.parameter.key : null)) return jsonOutput({status: 'unauthorized'});

    // ?profile=FRAN devuelve solo ese perfil (más rápido); ?profile=none solo comprueba la clave;
    // sin el parámetro se devuelven todos (compatibilidad con versiones anteriores de la app).
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var profiles = ['FRAN', 'MAMÁ', 'CLAUDIA', 'MIGUEL'];
    var only = e.parameter.profile;
    if (only) profiles = profiles.filter(function(p) { return p === only; });

    var data = {};
    profiles.forEach(function(p) {
      var isMiguel = (p === 'MIGUEL');
      data[p] = {
        fisico: extraerFisico(ss, p),
        FB: extraerMarcas(ss, p + '_FB', 'FB', isMiguel),
        VL: extraerMarcas(ss, p + '_VL', 'VL', isMiguel),
        PK: extraerMarcas(ss, p + '_PK', 'PK', isMiguel)
      };
    });
    return jsonOutput({status: 'success', data: data});
  } catch (error) {
    return jsonOutput({status: 'error', message: error.toString()});
  }
}

function extraerFisico(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;

    var dateStr = parseDateToString(row[0]);
    var parseNum = function(val) {
      if(val === "" || val == null) return null;
      var num = parseFloat(val.toString().replace('%','').replace(',','.'));
      return isNaN(num) ? null : num;
    };

    var imcVal = row[4];
    var imcStr = "-";
    if (imcVal !== "" && imcVal != null) {
      if (typeof imcVal === 'number') {
        var valToFormat = imcVal < 1 ? imcVal * 100 : imcVal;
        imcStr = valToFormat.toFixed(1).replace('.', ',') + '%';
      } else {
        imcStr = imcVal.toString();
      }
    }

    result.push({
      fecha: dateStr, mesociclo: row[1] || '-', edad: row[2] || '-', peso: parseNum(row[3]), grasa_pct: imcStr, imc: imcStr,
      musculo: parseNum(row[5]), hueso: parseNum(row[6]), viscera: parseNum(row[7]), grasa: parseNum(row[8]),
      pecho: parseNum(row[9]), hombros: parseNum(row[10]), biceps: parseNum(row[11]), abdomen: parseNum(row[12]), pierna: parseNum(row[13])
    });
  }
  return result;
}

function extraerMarcas(ss, sheetName, tipo, isMiguel) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var dateStr = parseDateToString(row[0]);

    var parseNum = function(val) {
      if(val === "" || val == null) return null;
      var num = parseFloat(val.toString().replace(',','.'));
      return isNaN(num) ? null : num;
    };

    var isVL = (tipo === 'VL');
    var pushObj = {
      fecha: dateStr,
      ex1_kg: parseNum(row[1]),
      ex2_kg: parseNum(isVL ? row[3] : row[2]),
      ex3_kg: parseNum(isVL ? row[5] : row[3])
    };

    if (isVL) {
      pushObj.ex1_reps = row[2];
      pushObj.ex2_reps = row[4];
      pushObj.ex3_reps = row[6];
    }

    // Añadido para el 4º Ejercicio de Miguel
    if (isMiguel) {
      pushObj.ex4_kg = parseNum(isVL ? row[7] : row[4]);
      if (isVL) pushObj.ex4_reps = row[8];
    }

    result.push(pushObj);
  }
  return result;
}

function parseDateToString(dateVal) {
  if (dateVal instanceof Date) {
    var day = ("0" + dateVal.getDate()).slice(-2);
    var month = ("0" + (dateVal.getMonth() + 1)).slice(-2);
    return day + "/" + month + "/" + dateVal.getFullYear().toString().slice(-2);
  }
  return dateVal.toString().split('T')[0];
}
