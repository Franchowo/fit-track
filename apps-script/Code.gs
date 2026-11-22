// FitTrack - Backend (Google Apps Script)
//
// ACCESO PRIVADO: la clave de acceso NO se escribe aquí.
// Se guarda en: Configuración del proyecto (⚙️) → Propiedades del script
//   Propiedad: ACCESS_KEY    Valor: <tu clave secreta>
// Toda petición sin la clave correcta se rechaza con {status: 'unauthorized'}.

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var response = {
      status: 'success',
      data: {
        'FRAN': { fisico: extraerFisico(ss, 'FRAN'), FB: extraerMarcas(ss, 'FRAN_FB', 'FB', false), VL: extraerMarcas(ss, 'FRAN_VL', 'VL', false), PK: extraerMarcas(ss, 'FRAN_PK', 'PK', false) },
        'MAMÁ': { fisico: extraerFisico(ss, 'MAMÁ'), FB: extraerMarcas(ss, 'MAMÁ_FB', 'FB', false), VL: extraerMarcas(ss, 'MAMÁ_VL', 'VL', false), PK: extraerMarcas(ss, 'MAMÁ_PK', 'PK', false) },
        'CLAUDIA': { fisico: extraerFisico(ss, 'CLAUDIA'), FB: extraerMarcas(ss, 'CLAUDIA_FB', 'FB', false), VL: extraerMarcas(ss, 'CLAUDIA_VL', 'VL', false), PK: extraerMarcas(ss, 'CLAUDIA_PK', 'PK', false) },
        'MIGUEL': { fisico: extraerFisico(ss, 'MIGUEL'), FB: extraerMarcas(ss, 'MIGUEL_FB', 'FB', true), VL: extraerMarcas(ss, 'MIGUEL_VL', 'VL', true), PK: extraerMarcas(ss, 'MIGUEL_PK', 'PK', true) }
      }
    };
    return jsonOutput(response);
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
