'use strict';
/**
 * Auditoría de determinismo de la simulación (v0.5).
 * 1. Análisis estático: la simulación no usa funciones matemáticas que varían entre motores JS.
 * 2. Dos ejecuciones independientes con la misma semilla producen la misma huella.
 * 3. Consultar la simulación desde la interfaz entre ticks no altera el resultado.
 * 4. Una repetición (con ida y vuelta por JSON) reproduce la partida original.
 * Uso: node auditoria-determinismo.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(require('./rutas').JUEGO_JS, 'utf8');
const sim = html.split('// ======================= SIM-START =======================')[1].split('// ======================= SIM-END =======================')[0];
let fallos = 0;
const check = (nombre, ok, extra = '') => { console.log(`  ${ok ? 'ok   ' : 'FALLO'} ${nombre}${extra ? ' · ' + extra : ''}`); if(!ok) fallos++; };

// ---------- 1. Análisis estático ----------
// IEEE 754 exige redondeo exacto para + - * / y sqrt. Las funciones trascendentes no tienen esa garantía.
const prohibidas = /Math\.(sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|hypot|pow|exp|expm1|log1?p?|log2|log10|cbrt|random|fround)\b|Date\.|performance\.|\*\*/g;
const sinComentarios = sim.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const hallazgos = [...sinComentarios.matchAll(prohibidas)].map(m => m[0]);
check('sin funciones no deterministas en la simulación', hallazgos.length === 0, hallazgos.length ? [...new Set(hallazgos)].join(', ') : 'Math.sqrt, floor, round, abs, min, max, imul');

// ---------- Utilidad: contexto aislado con la simulación ----------
function contexto(){
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(sim + `
    globalThis.api = { S, newGame, simTick, stateHash, queueCmd, UT, BT, FACTIONS, hordeActive, detectedBy, stealthed,
      setLocal: v => { LOCAL = v; } };`, ctx);
  return ctx.api;
}
function jugar(api, seed, factions, ticks, opciones = {}){
  api.newGame(seed, opciones.ai || [0, 1], factions);
  const huellas = [];
  let rnd = 12345;
  const rand = () => (rnd = (rnd * 48271) % 2147483647) / 2147483647;
  while(api.S.tick < ticks && !api.S.over){
    if(opciones.ordenes && api.S.tick % 25 === 0){
      // Órdenes de un "jugador humano" (slot 0) que pasan por queueCmd y quedan en el registro
      const S = api.S, mine = S.ents.filter(e => e.owner === 0 && e.kind === 'unit' && api.UT(0, e.type).weapon);
      if(mine.length) api.queueCmd({ t: rand() < 0.5 ? 'amove' : 'move', p:0, ids:mine.filter(() => rand() < 0.5).map(u => u.id), x:8 + rand()*112, z:8 + rand()*112 });
      const cua = S.ents.find(e => e.owner === 0 && e.type === 'cuartel' && e.built);
      if(cua && rand() < 0.4) api.queueCmd({ t:'build', p:0, id:cua.id, type: rand() < 0.2 ? 'ingeniero' : 'infanteria' });
    }
    if(opciones.reproducir){
      const R = opciones.reproducir;
      while(R.i < R.log.length && R.log[R.i][0] === api.S.tick){ for(const c of R.log[R.i][1]) api.S.cmdQueue.push(Object.assign({}, c, { tick: api.S.tick })); R.i++; }
    }
    api.simTick();
    if(opciones.interfaz){
      // Lo que hace el render entre ticks: consultas con peek=true
      for(const e of api.S.ents){ if(e.kind === 'unit'){ api.hordeActive(e, true); if(api.stealthed(e)) api.detectedBy(e, 0, true); } }
    }
    if(api.S.tick % 300 === 0) huellas.push(api.stateHash());
  }
  return { huellas, final: api.stateHash(), tick: api.S.tick, over: api.S.over, winner: api.S.winner, log: api.S.log };
}

// ---------- 2. Ejecuciones independientes ----------
for(const [seed, fac] of [[20261004, ['guerrilla','hierro']], [7, ['atlas','guerrilla']], [99, ['hierro','atlas']]]){
  const a = jugar(contexto(), seed, fac, 6000), b = jugar(contexto(), seed, fac, 6000);
  const iguales = a.final === b.final && a.huellas.every((h, i) => h === b.huellas[i]);
  check(`misma semilla, mismo resultado (${fac.join(' vs ')})`, iguales, `${a.tick} ticks, ${a.huellas.length} puntos de control`);
}

// ---------- 3. Consultas de la interfaz entre ticks ----------
{
  const a = jugar(contexto(), 555, ['guerrilla','hierro'], 6000), b = jugar(contexto(), 555, ['guerrilla','hierro'], 6000, { interfaz:true });
  check('consultas de la interfaz no alteran la simulación', a.final === b.final, `${a.tick} ticks`);
}

// ---------- 4. Repetición ----------
{
  const original = jugar(contexto(), 4242, ['hierro','guerrilla'], 7000, { ai:[1], ordenes:true });
  const archivo = JSON.parse(JSON.stringify({ seed:4242, factions:['hierro','guerrilla'], ai:[1], ticks:original.tick, log:original.log }));
  const copia = jugar(contexto(), archivo.seed, archivo.factions, archivo.ticks, { ai:archivo.ai, reproducir:{ log:archivo.log, i:0 } });
  check('la repetición reproduce la partida', original.final === copia.final && original.tick === copia.tick,
        `${original.log.length} ticks con órdenes, ${original.tick} ticks, tamaño ${(JSON.stringify(archivo).length/1024).toFixed(0)} KB`);
}

console.log(fallos ? `\nAUDITORÍA CON ${fallos} FALLO(S)` : '\nAUDITORÍA CORRECTA');
process.exit(fallos ? 1 : 0);
