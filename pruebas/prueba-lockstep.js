'use strict';
// Levanta el servidor y dos clientes sin interfaz. Verifica que ambos terminen con la misma huella de estado.
// Uso: node prueba-lockstep.js [ticks] [tickDeDesconexion]
const { spawn } = require('child_process'), path = require('path');
const TICKS = Number(process.argv[2]) || 3000, DROP = process.argv[3] || '', FA = process.argv[4] || 'atlas', FB = process.argv[5] || 'hierro', MAPF = process.argv[6] || '';
const PORT = 8099, URL = `ws://localhost:${PORT}`, ROOM = 'PRUEBA' + Math.floor(Math.random()*90+10);
const server = spawn('node', [path.join(__dirname, '../servidor/server.js')], { env:{ ...process.env, PORT, TICK_MS:'4', RECONNECT_MS:'10000' } });
let serverLog = ''; server.stdout.on('data', d => serverLog += d);
const results = [];
function runClient(name, drop, faction){
  return new Promise(res => {
    const p = spawn('node', [path.join(__dirname, 'cliente-prueba.js'), URL, ROOM, name, String(TICKS), drop || '', faction, MAPF]);
    let buf = '';
    p.stdout.on('data', d => { buf += d; let i; while((i = buf.indexOf('\n')) >= 0){ const line = buf.slice(0, i); buf = buf.slice(i+1); const o = JSON.parse(line); console.log('  ', JSON.stringify(o)); if(o.ev === 'done') results.push(o); } });
    p.stderr.on('data', d => process.stderr.write(d));
    p.on('exit', code => res(code));
  });
}
setTimeout(async () => {
  const t0 = Date.now();
  const codes = await Promise.all([runClient('ana', '', FA), new Promise(r => setTimeout(() => r(runClient('beto', DROP, FB)), 200))]);
  server.kill();
  const ok = codes.every(c => c === 0) && results.length === 2 && results[0].hash === results[1].hash && results[0].tick === results[1].tick;
  console.log(serverLog.trim().split('\n').map(l => '   servidor: ' + l).join('\n'));
  console.log(ok ? `CORRECTO: ${results[0].tick} ticks, huellas iguales (${results[0].hash}), ${results[0].hashes} verificaciones, ${((Date.now()-t0)/1000).toFixed(1)} s`
                 : `FALLO: códigos ${codes}, resultados ${JSON.stringify(results)}`);
  process.exit(ok ? 0 : 1);
}, 500);
