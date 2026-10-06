'use strict';
/**
 * Huellas de referencia de la simulación.
 * Sirve para refactorizar sin cambiar resultados: se guarda una línea base y luego se compara.
 * Uso:  node prueba-huellas.js guardar   (escribe huellas-base.json)
 *       node prueba-huellas.js           (compara con huellas-base.json)
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(require('./rutas').JUEGO_JS, 'utf8');
const corte = (a, b) => src.split(a)[1].split(b)[0];
const sim = corte('// ======================= SIM-START =======================', '// ======================= SIM-END =======================');
const camp = corte('// ======================= CAMPAIGN-START =======================', '// ======================= CAMPAIGN-END =======================');
const BASE = path.join(__dirname, 'huellas-base.json');

function contexto(){
  const ctx = { console }; vm.createContext(ctx);
  vm.runInContext(sim + '\n' + camp + '\nglobalThis.api = { S, newGame, simTick, stateHash, queueCmd, UT, missionDef, MISSIONS, generateMap };', ctx);
  return ctx.api;
}
// Escenarios: IA contra IA, partida con órdenes de un jugador simulado y una misión
const ESCENARIOS = [
  { nombre:'atlas vs hierro', seed:101, fac:['atlas','hierro'], ai:[0,1], ticks:5000 },
  { nombre:'hierro vs guerrilla', seed:202, fac:['hierro','guerrilla'], ai:[0,1], ticks:5000 },
  { nombre:'guerrilla vs atlas (mapa cruce)', seed:303, fac:['guerrilla','atlas'], ai:[0,1], ticks:4000, mapa:'cruce' },
  { nombre:'jugador con órdenes vs IA', seed:404, fac:['atlas','guerrilla'], ai:[1], ticks:4000, ordenes:true, creditos:5000 },
  { nombre:'misión hierro-2', mision:'hierro-2', ticks:3000 }
];
function correr(api, e){
  const S = api.S;
  if(e.mision){
    const m = api.MISSIONS[e.mision], def = api.missionDef(e.mision, 'normal', m.faccion);
    api.newGame(def.semilla, [1], [m.faccion, m.enemigo], api.generateMap(m.mapa.plantilla, m.mapa.semilla), def);
  } else api.newGame(e.seed, e.ai, e.fac, e.mapa ? api.generateMap(e.mapa, 3) : null, null, 'normal', e.creditos);
  let rnd = 777; const rand = () => (rnd = (rnd * 48271) % 2147483647) / 2147483647;
  const huellas = [];
  while(S.tick < e.ticks && !S.over){
    if(e.ordenes && S.tick % 30 === 0){
      const mine = S.ents.filter(u => u.owner === 0 && u.kind === 'unit' && !u.dead);
      const blds = S.ents.filter(b => b.owner === 0 && b.kind === 'bld' && !b.dead && b.built);
      const r = rand();
      if(r < 0.4 && mine.length) api.queueCmd({ t:'amove', p:0, ids:mine.slice(0, 6).map(u => u.id), x:8 + rand()*112, z:8 + rand()*112 });
      else if(r < 0.7 && blds.length){ const b = blds[Math.floor(rand()*blds.length)]; const t = { centro:'constructor', recoleccion:'recolector', cuartel:'infanteria', fabrica:'tanque' }[b.type]; if(t) api.queueCmd({ t:'build', p:0, id:b.id, type:t }); }
      else if(mine.length){ const c = mine.find(u => u.type === 'constructor'); if(c) api.queueCmd({ t:'place', p:0, ids:[c.id], type:['planta','recoleccion','cuartel','fabrica','torre'][Math.floor(rand()*5)], cx:4 + Math.floor(rand()*14), cz:44 + Math.floor(rand()*16) }); }
    }
    api.simTick();
    if(S.tick % 250 === 0) huellas.push(api.stateHash());
  }
  huellas.push(api.stateHash());
  return { ticks:S.tick, ganador:S.winner, huellas };
}
const resultados = {};
for(const e of ESCENARIOS) resultados[e.nombre] = correr(contexto(), e);

if(process.argv[2] === 'guardar'){
  fs.writeFileSync(BASE, JSON.stringify(resultados, null, 1));
  for(const [n, r] of Object.entries(resultados)) console.log(`  base  ${n} · ${r.ticks} ticks, ${r.huellas.length} huellas, ganador ${r.ganador}`);
  console.log('\nLÍNEA BASE GUARDADA');
} else {
  const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
  let fallos = 0;
  for(const [n, r] of Object.entries(resultados)){
    const b = base[n], ok = b && JSON.stringify(b) === JSON.stringify(r);
    let detalle = `${r.ticks} ticks, ${r.huellas.length} huellas`;
    if(!ok && b){ const i = r.huellas.findIndex((h, k) => h !== b.huellas[k]); detalle += ` · primera diferencia en la huella ${i} (tick ~${(i+1)*250})`; }
    console.log(`  ${ok ? 'ok   ' : 'FALLO'} ${n} · ${detalle}`); if(!ok) fallos++;
  }
  console.log(fallos ? `\n${fallos} ESCENARIOS CAMBIARON` : '\nLA SIMULACIÓN PRODUCE EXACTAMENTE LOS MISMOS RESULTADOS');
  process.exit(fallos ? 1 : 0);
}
