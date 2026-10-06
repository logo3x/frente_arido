'use strict';
/**
 * Prueba del validador de misiones: una partida real ganada se verifica; los registros alterados se rechazan.
 * La partida la juega la IA por el jugador 0, pero sus órdenes pasan por la cola y quedan en el registro (como un humano).
 */
const { spawn } = require('child_process'), path = require('path'), fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const SECRET = 'x'.repeat(40), PORT = 8092;
const src = fs.readFileSync(require('./rutas').JUEGO_JS, 'utf8');
const cut = (a, b) => src.split(a)[1].split(b)[0];
const sim = cut('// ======================= SIM-START =======================', '// ======================= SIM-END =======================');
const camp = cut('// ======================= CAMPAIGN-START =======================', '// ======================= CAMPAIGN-END =======================');
let fallos = 0; const check = (n, ok, extra='') => { console.log(`  ${ok ? 'ok   ' : 'FALLO'} ${n}${extra ? ' · ' + extra : ''}`); if(!ok) fallos++; };

// El jugador 0 lo maneja la IA, pero con un generador aleatorio propio y enviando sus órdenes por la cola,
// como lo haría un humano. Así el registro reproduce la partida con la IA enemiga intacta.
function jugar(id, dif){
  const c = {}; vm.createContext(c);
  vm.runInContext(sim + camp + `
    const __ai = aiTick, __rng0 = mulberry32(4242);
    function humanoIA(){
      const r = S.rng, ap = applyCmd; S.rng = __rng0;
      applyCmd = c => { if(c.p===0){ const q = Object.assign({}, c); q.tick = S.tick + 1; S.cmdQueue.push(q); } else ap(c); };
      try { __ai(0); } finally { applyCmd = ap; S.rng = r; }
    }
    globalThis.api = { S, newGame, simTick, missionDef, MISSIONS, generateMap, SIM_VERSION, humanoIA };`, c);
  const a = c.api, mi = a.MISSIONS[id], def = a.missionDef(id, dif), S = a.S;
  a.newGame(def.semilla, [1], [mi.faccion, mi.enemigo], a.generateMap(mi.mapa.plantilla, mi.mapa.semilla), def);
  while(!S.over && S.tick < 15*60*15){ a.humanoIA(); a.simTick(); }
  return { result:S.mission.result, ticks:S.tick, log:S.log, version:a.SIM_VERSION, state:S.mission.state.slice() };
}
const post = (body, sig) => fetch(`http://localhost:${PORT}/validar-mision`, { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Game-Signature': sig ?? crypto.createHmac('sha256', SECRET).update(body).digest('hex') }, body });

(async () => {
  const srv = spawn('node', [path.join(__dirname, '../servidor/server.js')], { env:{ ...process.env, PORT, GAME_SECRET:SECRET } });
  await new Promise(r => setTimeout(r, 700));
  const g = jugar('guerrilla-1', 'facil');
  check('partida de prueba ganada por el jugador', g.result === 'ok', `${g.ticks} ticks, ${g.log.length} ticks con órdenes`);
  const base = { mision:'guerrilla-1', dificultad:'facil', version:g.version, ticks:g.ticks, log:g.log };
  let t0 = Date.now(), r = await (await post(JSON.stringify(base))).json();
  check('el validador confirma la misión', r.ok === true && r.estrellas >= 1, JSON.stringify(r) + ` · ${Date.now()-t0} ms`);
  r = await (await post(JSON.stringify(Object.assign({}, base, { dificultad:'dificil' })))).json();
  check('cambiar la dificultad declarada se detecta', r.ok === false || r.estrellas !== 3, JSON.stringify(r));
  r = await (await post(JSON.stringify(Object.assign({}, base, { log:[] })))).json();
  check('un registro vacío no cumple la misión', r.ok === false, JSON.stringify(r));
  r = await (await post(JSON.stringify(Object.assign({}, base, { mision:'guerrilla-4' })))).json();   // misión difícil: las órdenes de otra no bastan para ganarla
  check('el registro de otra misión no la cumple', r.ok === false, JSON.stringify(r));
  r = await (await post(JSON.stringify(Object.assign({}, base, { log: g.log.map(([n,cs]) => [n, cs.map(c => Object.assign({}, c, { p:1 }))]) })))).json();
  check('órdenes con jugador falsificado se fuerzan al jugador 0', r.ok === true, JSON.stringify(r));
  r = await (await post(JSON.stringify(Object.assign({}, base, { version:'0.1' })))).json();
  check('versión distinta rechazada', r.ok === false && /versión/.test(r.motivo), JSON.stringify(r));
  let res = await post(JSON.stringify(base), 'firma-falsa');
  check('firma inválida rechazada', res.status === 401, `estado ${res.status}`);
  res = await post(JSON.stringify({ mision:'guerrilla-1', dificultad:'facil', version:g.version, ticks:1e9, log:[] }));
  r = await res.json();
  check('duración absurda rechazada', r.ok === false, JSON.stringify(r));
  srv.kill();
  console.log(fallos ? `\nVALIDADOR: ${fallos} FALLO(S)` : '\nVALIDADOR: TODAS LAS PRUEBAS CORRECTAS');
  process.exit(fallos ? 1 : 0);
})();
