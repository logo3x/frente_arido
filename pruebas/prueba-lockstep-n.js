'use strict';
// Partida en línea de 4 jugadores (o los indicados) por el servidor real: todos deben terminar con la misma huella.
// Un jugador se desconecta y no vuelve: el servidor lo deja fuera con la orden «rendir» y la partida sigue.
// Modo «ia»: la mitad de las plazas son jugadores IA que agrega el anfitrión (personas contra IA, en dos equipos).
// Uso: node prueba-lockstep-n.js [plazas] [ticks] [modo: todos | equipos | ia]
const { spawn } = require('child_process'), path = require('path');
const N = Number(process.argv[2]) || 4, TICKS = Number(process.argv[3]) || 2400, MODO = process.argv[4] || 'equipos';
const IA = MODO === 'ia', H = IA ? N / 2 : N, MODO_SALA = IA ? 'equipos' : MODO;   // H: personas en la sala
const PORT = 8098, URL = `ws://localhost:${PORT}`, ROOM = 'MULTI' + Math.floor(Math.random()*90+10);
const server = spawn('node', [path.join(__dirname, '../servidor/server.js')], { env:{ ...process.env, PORT, TICK_MS:'4', RECONNECT_MS:'1500', GAME_SECRET:'' } });
let serverLog = ''; server.stdout.on('data', d => serverLog += d);
const results = [], eventos = [];
const FAC = ['atlas', 'hierro', 'guerrilla'];
function runClient(i){
  return new Promise(res => {
    const drop = i === H - 1 ? '600' : '';
    const ia = IA && i === 0 ? [...Array(N - H).keys()].map(k => H + k).join(',') : '';
    const p = spawn('node', [path.join(__dirname, 'cliente-prueba.js'), URL, ROOM, 'jugador' + i, String(TICKS), drop, FAC[i % 3], ''],
      { env:{ ...process.env, PLAZAS:String(N), MODO:MODO_SALA, NO_VOLVER: drop ? '1' : '', IA:ia } });
    let buf = '';
    p.stdout.on('data', d => { buf += d; let k; while((k = buf.indexOf('\n')) >= 0){ const line = buf.slice(0, k); buf = buf.slice(k+1); const o = JSON.parse(line); eventos.push(o); if(o.ev === 'done') results.push(o); } });
    p.stderr.on('data', d => process.stderr.write(d));
    p.on('exit', code => res(code));
  });
}
setTimeout(async () => {
  const t0 = Date.now();
  const codes = await Promise.all([...Array(H)].map((_, i) => new Promise(r => setTimeout(() => r(runClient(i)), i*150))));
  server.kill();
  const activos = results.filter(r => !r.fuera), retiro = eventos.some(e => e.ev === 'retirado');
  const iaOk = !IA || activos.every(r => r.ia === N - H && r.iaEnts > (N - H) * 2);   // la IA construyó en todos los clientes por igual
  const ok = codes.every(c => c === 0) && activos.length === H - 1 && activos.every(r => r.hash === activos[0].hash && r.tick === activos[0].tick) && retiro && iaOk;
  console.log(serverLog.trim().split('\n').slice(-6).map(l => '   servidor: ' + l).join('\n'));
  console.log(ok ? `CORRECTO: ${N} jugadores (${MODO}${IA ? `: ${H} personas y ${N - H} IA con ${activos[0].iaEnts} unidades y edificios` : ''}), uno se retiró, ${activos.length} terminaron en el tick ${activos[0].tick} con la misma huella (${activos[0].hash}), ${((Date.now()-t0)/1000).toFixed(1)} s`
                 : `FALLO: códigos ${codes}, retiro ${retiro}, resultados ${JSON.stringify(results)}`);
  process.exit(ok ? 0 : 1);
}, 500);
