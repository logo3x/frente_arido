'use strict';
// Reinicio del servidor a mitad de partida: la sala se restaura desde disco, los clientes se reconectan y la partida
// continúa con huellas idénticas.
const { spawn } = require('child_process'), path = require('path'), fs = require('fs'), os = require('os');
const PORT = 8091, URL = `ws://localhost:${PORT}`, ROOM = 'PERSIST' + Math.floor(Math.random()*9), TICKS = 3000;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-salas-'));
const env = { ...process.env, PORT, TICK_MS:'4', ROOMS_DIR:DIR, RECONNECT_MS:'20000' };
let log = '';
const startServer = () => { const p = spawn('node', [path.join(__dirname, '../servidor/server.js')], { env }); p.stdout.on('data', d => log += d); return p; };
const results = [];
function client(name, faction){
  return new Promise(res => {
    const p = spawn('node', [path.join(__dirname, 'cliente-prueba.js'), URL, ROOM, name, String(TICKS), '', faction], { env:{ ...process.env, RECONECTAR:'1' } });
    let buf = ''; p.stdout.on('data', d => { buf += d; let i; while((i = buf.indexOf('\n')) >= 0){ const o = JSON.parse(buf.slice(0,i)); buf = buf.slice(i+1); if(o.ev==='replay') console.log('  ', name, 'recuperó', o.ticks, 'ticks tras el reinicio'); if(o.ev==='done') results.push(o); } });
    p.on('exit', res);
  });
}
(async () => {
  let srv = startServer();
  await new Promise(r => setTimeout(r, 600));
  const done = Promise.all([client('ana','atlas'), new Promise(r => setTimeout(() => r(client('beto','guerrilla')), 200))]);
  await new Promise(r => setTimeout(r, 6500));
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json'));
  srv.kill('SIGKILL');                                    // caída abrupta
  console.log('   servidor detenido con SIGKILL; archivos de sala:', files.length);
  await new Promise(r => setTimeout(r, 800));
  srv = startServer();
  await done;
  srv.kill();
  const ok = results.length === 2 && results[0].hash === results[1].hash && results[0].tick === results[1].tick && files.length === 1;
  console.log(log.trim().split('\n').filter(l => /restaurada|reconect|inicio/.test(l)).map(l => '   servidor: ' + l).join('\n'));
  console.log(ok ? `CORRECTO: partida restaurada tras el reinicio; ${results[0].tick} ticks con huellas iguales (${results[0].hash})` : `FALLO: ${JSON.stringify(results)}`);
  fs.rmSync(DIR, { recursive:true, force:true });
  process.exit(ok ? 0 : 1);
})();
