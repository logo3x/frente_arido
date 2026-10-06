'use strict';
/**
 * Prueba entre motores JavaScript: ejecuta la misma simulación en V8 (Node) y en QuickJS,
 * un motor independiente con su propia biblioteca matemática. Las huellas deben coincidir.
 * Uso: node prueba-motores.js [ticks]
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { getQuickJS } = require('../servidor/node_modules/quickjs-emscripten');
const TICKS = Number(process.argv[2]) || 1500;
const html = fs.readFileSync(require('./rutas').JUEGO_JS, 'utf8');
const sim = html.split('// ======================= SIM-START =======================')[1].split('// ======================= SIM-END =======================')[0];
const camp = html.split('// ======================= CAMPAIGN-START =======================')[1].split('// ======================= CAMPAIGN-END =======================')[0];
const mapa = JSON.parse(fs.readFileSync(path.join(__dirname, 'mapa-rio.json'), 'utf8'));
const ESCENARIOS = [
  { seed:20261004, factions:['guerrilla','hierro'], map:null },
  { seed:7, factions:['atlas','guerrilla'], map:null },
  { seed:11, factions:['hierro','atlas'], map:mapa },
  { mision:'hierro-2' },
  { seed:21, factions:['hierro','guerrilla'], tpl:'canal' }
];
// Programa autocontenido: corre la IA de ambos bandos y devuelve las huellas cada 150 ticks
const programa = esc => sim + camp + `
;(function(){
  const esc = ${JSON.stringify(esc)};
  if(esc.mision){ const mi = MISSIONS[esc.mision], def = missionDef(esc.mision); newGame(def.semilla, [0,1], [mi.faccion, mi.enemigo], generateMap(mi.mapa.plantilla, mi.mapa.semilla), def); }
  else newGame(esc.seed, [0,1], esc.factions, esc.tpl ? generateMap(esc.tpl, 3) : esc.map);
  const h = [];
  while(S.tick < ${TICKS} && !S.over){ simTick(); if(S.tick % 150 === 0) h.push(stateHash()); }
  h.push(stateHash());
  return JSON.stringify({ tick:S.tick, h });
})()`;
(async () => {
  const QJS = await getQuickJS();
  let fallos = 0;
  for(const esc of ESCENARIOS){
    const t0 = Date.now();
    const v8 = JSON.parse(vm.runInNewContext(programa(esc), {}));
    const t1 = Date.now();
    const ctx = QJS.newContext();
    const res = ctx.evalCode(programa(esc));
    let qjs;
    if(res.error){ console.log('  FALLO QuickJS:', JSON.stringify(ctx.dump(res.error))); fallos++; continue; }
    qjs = JSON.parse(ctx.dump(res.value)); res.value.dispose();
    const t2 = Date.now();
    const ok = v8.tick === qjs.tick && v8.h.length === qjs.h.length && v8.h.every((x,i) => x === qjs.h[i]);
    if(!ok) fallos++;
    const primera = v8.h.findIndex((x,i) => x !== qjs.h[i]);
    console.log(`  ${ok ? 'ok   ' : 'FALLO'} ${esc.mision ? 'misión ' + esc.mision : esc.factions.join(' vs ')}${esc.map ? ' (' + esc.map.nombre + ')' : esc.tpl ? ' (mapa ' + esc.tpl + ')' : ''} · ${v8.tick} ticks, ${v8.h.length} huellas · V8 ${t1-t0} ms, QuickJS ${t2-t1} ms${ok ? '' : ' · primera diferencia en el control ' + primera}`);
  }
  console.log(fallos ? `\nMOTORES CON ${fallos} FALLO(S)` : '\nV8 Y QUICKJS PRODUCEN LA MISMA SIMULACIÓN');
  process.exit(fallos ? 1 : 0);
})();
