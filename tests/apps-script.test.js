const fs = require('fs'); const vm = require('vm'); const crypto = require('crypto');
const { ROOT, CODE_GS, chartjs, TMP, serveApp, makeSite, gasServices, Sheet } = require('./lib/common');
const code = fs.readFileSync(CODE_GS, 'utf8');
const FIS = ['Fecha','Mesociclo','Edad','Peso','IMC','Músculo','Hueso','Víscera','Grasa','Pecho','Hombros','Biceps','Abdomen','Pierna'];
const VLH = ['Fecha','Sentadilla','Sentadilla Reps','Press Banca','Press Banca Reps','Peso Muerto','Peso Muerto Reps'];
const sheets = {
  FRAN: new Sheet(FIS.concat(['Notas']), { 4: '0.00%' }),
  FRAN_VL: new Sheet(VLH), FRAN_FB: new Sheet(['Fecha','Sentadilla','Press Banca','Peso Muerto']), FRAN_PK: new Sheet(['Fecha','Sentadilla','Press Banca','Peso Muerto']),
  // MAMÁ: columnas reordenadas para probar la lectura por cabecera
  'MAMÁ': new Sheet(['Fecha','Peso','Mesociclo','Edad','IMC','Músculo','Hueso','Víscera','Grasa','Pecho','Hombros','Biceps','Abdomen','Pierna']),
  'MAMÁ_VL': new Sheet(['Fecha','Peso Muerto','Peso Muerto Reps','Sentadilla','Sentadilla Reps','Press Banca','Press Banca Reps']),
  // MAMÁ_FB: cabeceras desconocidas → posición por defecto
  'MAMÁ_FB': new Sheet(['F','a','b','c']),
  // Hojas de perfiles eliminados (siguen en el documento)
  MIGUEL_FB: new Sheet(['Fecha','Pull-up','Muscle-up','Fondos','Sentadilla'])
};
const props = { ACCESS_KEY: 'secret' };
const sleeps = [];
const ctx = gasServices({ props, sheets, sleeps });
vm.createContext(ctx); vm.runInContext(code, ctx);
const post = d => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ key: 'secret', ...d }) } }).text);
const get = p => JSON.parse(ctx.doGet({ parameter: { key: 'secret', profile: p } }).text).data[p];
let fails = 0; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };

// Alta física con tus cabeceras reales
sheets.FRAN.rows.push([vm.runInContext('new Date(2026, 9, 1)', ctx), 'Volumen', 30, 80, 0.15, 35, 3, 5, 12, 100, 120, 38, 85, 60, '=nota']);
let r = post({ id: 'a1', profile: 'FRAN', type: 'fisico', fecha: '2026-11-22', mesociclo: 'Volumen', edad: '29', peso: '79,4', grasa_pct: '14,2', musculo: '35,5', pecho: '101' });
const row = sheets.FRAN.rows[2];
check(r.status === 'success' && r.row === 3 && r.rev, 'Alta devuelve fila y huella');
check(Object.prototype.toString.call(row[0]) === '[object Date]' && row[0].getDate() === 22 && row[0].getMonth() === 10, 'Fecha escrita como fecha');
check(row[3] === 79.4 && row[5] === 35.5 && row[2] === 29, 'Números escritos como números (79,4 → 79.4)');
check(Math.abs(row[4] - 0.142) < 1e-9, 'IMC en columna de porcentaje: 14,2 → 0,142 (' + row[4] + ')');
check(row[1] === 'Volumen' && row.length === 14, 'Texto intacto y no escribe más allá de sus columnas');
let fis = get('FRAN').fisico;
check(fis[1].grasa_pct === '14,2%' && fis[1].peso === 79.4 && fis[1].iso === '2026-11-22' && fis[1].fecha === '22/11/26', 'Lectura: % graso, peso, iso y fecha');
check(fis[1].rev === r.rev && fis[1].row === 3, 'La huella del GET coincide con la del alta');

// Editar
r = post({ id: 'u1', action: 'update', profile: 'FRAN', type: 'fisico', row: 2, rev: fis[0].rev, fecha: '2026-10-02', mesociclo: 'Fuerza Base', peso: '81', grasa_pct: '15' });
check(r.status === 'success' && sheets.FRAN.rows[1][3] === 81 && sheets.FRAN.rows[1][0].getDate() === 2, 'Editar actualiza la fila');
check(sheets.FRAN.rows[1][14] === '=nota', 'Editar no toca columnas ajenas a la app');
check(sheets.FRAN.rows[1][9] === '', 'Campo vaciado al editar queda vacío');
check(post({ id: 'u2', action: 'update', profile: 'FRAN', type: 'fisico', row: 2, rev: fis[0].rev, fecha: '2026-10-02', peso: '82' }).status === 'conflict', 'Huella antigua → conflicto (no se escribe)');
check(sheets.FRAN.rows[1][3] === 81, 'La fila sigue como estaba tras el conflicto');
check(post({ id: 'u3', action: 'update', profile: 'FRAN', type: 'fisico', row: 99, rev: 'x', fecha: '2026-10-02' }).status === 'conflict', 'Fila inexistente → conflicto');

// Borrar
fis = get('FRAN').fisico;
check(post({ id: 'd0', action: 'delete', profile: 'FRAN', type: 'fisico', row: 2, rev: 'mala' }).status === 'conflict' && sheets.FRAN.rows.length === 3, 'Borrar con huella mala → conflicto');
check(post({ id: 'd1', action: 'delete', profile: 'FRAN', type: 'fisico', row: 2, rev: fis[0].rev }).status === 'success' && sheets.FRAN.rows.length === 2, 'Borrar con huella buena');
check(get('FRAN').fisico.length === 1 && get('FRAN').fisico[0].peso === 79.4, 'Queda el registro correcto');
check(post({ id: 'd1', action: 'delete', profile: 'FRAN', type: 'fisico', row: 2, rev: fis[0].rev }).duplicate === true && sheets.FRAN.rows.length === 2, 'Reenvío del borrado → ignorado (no borra otra fila)');

// Marcas VL con tus cabeceras
r = post({ id: 'm1', profile: 'FRAN', type: 'marcas', mesociclo_marca: 'VL', fecha: '2026-11-22', ex1_kg: '82,5', ex1_reps: '8', ex2_kg: '60', ex2_reps: '10', ex3_kg: '', ex3_reps: '' });
check(JSON.stringify(sheets.FRAN_VL.rows[1].slice(1)) === JSON.stringify([82.5, 8, 60, 10, '', '']), 'VL: kg y reps en sus columnas');
const vl = get('FRAN').VL[0];
check(vl.ex1_kg === 82.5 && vl.ex1_reps === 8 && vl.ex2_kg === 60 && vl.ex3_kg === null, 'VL: lectura');

// Columnas reordenadas (MAMÁ)
post({ id: 'c1', profile: 'MAMÁ', type: 'fisico', fecha: '2026-11-22', mesociclo: 'Peaking', peso: '60' });
check(sheets['MAMÁ'].rows[1][1] === 60 && sheets['MAMÁ'].rows[1][2] === 'Peaking', 'Físico: columnas reordenadas se respetan');
post({ id: 'c2', profile: 'MAMÁ', type: 'marcas', mesociclo_marca: 'VL', fecha: '2026-11-22', ex1_kg: '70', ex1_reps: '5', ex2_kg: '10', ex2_reps: '12', ex3_kg: '90', ex3_reps: '3' });
check(JSON.stringify(sheets['MAMÁ_VL'].rows[1].slice(1)) === JSON.stringify([90, 3, 70, 5, 10, 12]), 'VL: columnas reordenadas se respetan');
check(get('MAMÁ').VL[0].ex3_kg === 90 && get('MAMÁ').VL[0].ex1_kg === 70, 'VL reordenado: lectura correcta');

// Cabeceras desconocidas → posición por defecto
post({ id: 'g1', profile: 'MAMÁ', type: 'marcas', mesociclo_marca: 'FB', fecha: '2026-11-22', ex1_kg: '10', ex2_kg: '5', ex3_kg: '20' });
check(JSON.stringify(sheets['MAMÁ_FB'].rows[1].slice(1)) === JSON.stringify([10, 5, 20]), 'Cabeceras desconocidas → posición por defecto');
check(get('MAMÁ').FB[0].ex3_kg === 20 && get('MAMÁ').PK.length === 0, 'Lectura por posición; hoja inexistente → vacía');
// Perfiles eliminados
const del = post({ id: 'z1', profile: 'MIGUEL', type: 'marcas', mesociclo_marca: 'FB', fecha: '2026-11-22', ex1_kg: '10' });
check(del.status === 'error' && del.message.includes('Perfil desconocido') && sheets.MIGUEL_FB.rows.length === 1, 'Perfil eliminado → rechazado, la hoja no se toca');
const all = JSON.parse(ctx.doGet({ parameter: { key: 'secret' } }).text).data;
check(JSON.stringify(Object.keys(all)) === JSON.stringify(['FRAN', 'MAMÁ']), 'GET sin perfil devuelve solo FRAN y MAMÁ');
check(Object.keys(JSON.parse(ctx.doGet({ parameter: { key: 'secret', profile: 'CLAUDIA' } }).text).data).length === 0, 'GET de un perfil eliminado → vacío');

// Compatibilidad
check(post({ profile: 'FRAN', type: 'fisico', fecha: '2026-11-23', imc: '13' }).status === 'success' && sheets.FRAN.rows.at(-1)[4] === 0.13, 'App antigua (sin id, con "imc") sigue funcionando');
check(post({ id: 'x', action: 'otra', profile: 'FRAN', type: 'fisico' }).status === 'error', 'Acción desconocida → error');
check(post({ key: 'bad', profile: 'FRAN', type: 'fisico' }).status === 'unauthorized', 'Clave incorrecta');
// Seguridad
const read = (key, profile) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ key, action: 'read', profile }) } }).text);
sleeps.length = 0;
const ok = read('secret', 'FRAN');
check(ok.status === 'success' && ok.data.FRAN && ok.weakKey === true && sleeps.length === 0, 'Lectura por POST (clave en el cuerpo); avisa de clave corta; sin espera');
check(Object.keys(read('secret', 'none').data).length === 0 && Object.keys(read('secret', '').data).length === 2, 'POST read: "none" solo valida la clave, vacío = todos');
const bad = [read('secreto', 'FRAN'), read('secret ', 'FRAN'), read('', 'FRAN'), read(null, 'FRAN')];
check(bad.every(r => r.status === 'unauthorized' && !r.data), 'Claves incorrectas, vacías o casi iguales → sin datos');
check(sleeps.length === 4 && sleeps.every((ms, i) => i === 0 || ms > sleeps[i - 1]), 'Cada intento fallido espera más que el anterior: ' + sleeps.join(', ') + ' ms');
for (let i = 0; i < 30; i++) read('x' + i, 'FRAN');
check(Math.max(...sleeps) === 5000, 'La espera se limita a 5 s');
const n = sleeps.length; read('secret', 'FRAN');
check(sleeps.length === n, 'La clave correcta nunca espera, aunque haya habido fallos');
props.ACCESS_KEY = 'una-clave-bastante-larga';
check(read('una-clave-bastante-larga', 'none').weakKey === false, 'Clave de 12+ caracteres: sin aviso');
check(JSON.parse(ctx.doGet({ parameter: { key: 'una-clave-bastante-larga', profile: 'FRAN' } }).text).weakKey === undefined, 'El GET antiguo sigue funcionando (sin exponer weakKey)');
props.ACCESS_KEY = 'secret';
delete props.ACCESS_KEY; check(read('', 'FRAN').status === 'unauthorized' && read('undefined', 'FRAN').status === 'unauthorized', 'Sin ACCESS_KEY configurada nadie entra');
props.ACCESS_KEY = 'secret';

// Objetivos
let g = post({ id: 'goal1', action: 'goals', profile: 'FRAN', goals: { peso: { target: '75,5', start: 79, startDate: '2026-11-22' }, ex1: { target: 120, start: 110 }, hack: { target: 1 }, ex2: { target: 'abc' }, ex3: { target: 5000 } } });
check(g.status === 'success' && JSON.stringify(Object.keys(g.goals)) === '["peso","ex1"]' && g.goals.peso.target === 75.5, 'Objetivos: se guardan solo los válidos');
check(JSON.parse(props.GOALS_FRAN).ex1.start === 110, 'Objetivos en las propiedades del script');
check(get('FRAN').goals.peso.target === 75.5 && JSON.stringify(get('MAMÁ').goals) === '{}', 'GET devuelve los objetivos de cada perfil');
check(post({ id: 'goal2', action: 'goals', profile: 'MIGUEL', goals: {} }).status === 'error', 'Objetivos de un perfil eliminado → error');
const rowsBefore = sheets.FRAN.rows.length;
check(post({ id: 'goal3', action: 'goals', profile: 'FRAN', goals: {} }).status === 'success' && props.GOALS_FRAN === '{}' && sheets.FRAN.rows.length === rowsBefore, 'Vaciar objetivos no toca la hoja');
console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK'); process.exit(fails ? 1 : 0);
