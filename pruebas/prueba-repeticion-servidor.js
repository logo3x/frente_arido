'use strict';
// Verifica que la repetición que el servidor envía a Laravel reproduce exactamente la partida jugada en línea.
const { spawn } = require('child_process'), http = require('http'), path = require('path'), fs = require('fs'), vm = require('vm');
const PORT = 8096, HOOK = 8095, ROOM = 'REPLAY' + Math.floor(Math.random()*90+10), TICKS = 3000;
let hook = null;
const hs = http.createServer((req, res) => { let b=''; req.on('data', d => b += d); req.on('end', () => { hook = JSON.parse(b); res.writeHead(204); res.end(); }); }).listen(HOOK);
const srv = spawn('node', [path.join(__dirname, '../servidor/server.js')], { env:{ ...process.env, PORT, TICK_MS:'4', RECONNECT_MS:'1500', RESULT_WEBHOOK:`http://localhost:${HOOK}/api/partidas/resultado` } });
const results = [];
function runClient(name, faction){
  return new Promise(res => {
    const p = spawn('node', [path.join(__dirname, 'cliente-prueba.js'), `ws://localhost:${PORT}`, ROOM, name, String(TICKS), '', faction]);
    let buf=''; p.stdout.on('data', d => { buf += d; let i; while((i = buf.indexOf('\n')) >= 0){ const o = JSON.parse(buf.slice(0,i)); buf = buf.slice(i+1); if(o.ev==='done') results.push(o); } });
    p.on('exit', res);
  });
}
setTimeout(async () => {
  await Promise.all([runClient('ana','guerrilla'), new Promise(r => setTimeout(() => r(runClient('beto','atlas')), 200))]);
  await new Promise(r => setTimeout(r, 3000));   // ambos se desconectan: el servidor cierra por abandono y envía el webhook
  srv.kill(); hs.close();
  if(!hook || !hook.replay){ console.log('FALLO: no llegó la repetición al webhook'); process.exit(1); }
  const html = fs.readFileSync(require('./rutas').JUEGO_JS, 'utf8');
  const sim = html.split('// ======================= SIM-START =======================')[1].split('// ======================= SIM-END =======================')[0];
  const ctx = {}; vm.createContext(ctx); vm.runInContext(sim + '\nglobalThis.api = { S, newGame, simTick, stateHash };', ctx);
  const { api } = ctx, rp = hook.replay, target = results[0].tick;
  api.newGame(rp.seed, rp.ai, rp.factions);
  let i = 0;
  while(api.S.tick < target){
    while(i < rp.log.length && rp.log[i][0] === api.S.tick){ for(const c of rp.log[i][1]) api.S.cmdQueue.push(Object.assign({}, c, { tick:api.S.tick })); i++; }
    api.simTick();
  }
  const ok = api.stateHash() === results[0].hash && results[0].hash === results[1].hash;
  console.log(`  repetición del servidor: ${rp.log.length} ticks con órdenes, ${(JSON.stringify(rp).length/1024).toFixed(0)} KB, versión ${rp.v}`);
  console.log(ok ? `CORRECTO: la repetición reproduce la huella del tick ${target} (${results[0].hash})` : `FALLO: huella ${api.stateHash()} ≠ ${results[0].hash}`);
  process.exit(ok ? 0 : 1);
}, 500);
