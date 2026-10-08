'use strict';
// Verifica el modo con Laravel: token firmado (mismo esquema que GameToken.php) y webhook de resultado firmado.
const { spawn } = require('child_process'), http = require('http'), crypto = require('crypto'), path = require('path');
const WebSocket = require('../servidor/node_modules/ws');
const SECRET = 'clave-de-prueba', PORT = 8098, HOOK = 8097;
const b64 = s => Buffer.from(s).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function token(room, uid, name, exp = Math.floor(Date.now()/1000) + 3600, key = SECRET, anf = false){
  const payload = b64(JSON.stringify({ room, uid, name, exp, anf }));
  return payload + '.' + crypto.createHmac('sha256', key).update(payload).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
let hook = null;
http.createServer((req, res) => { let b=''; req.on('data', d => b += d); req.on('end', () => { hook = { sig:req.headers['x-game-signature'], body:b, valid: crypto.createHmac('sha256', SECRET).update(b).digest('hex') === req.headers['x-game-signature'] }; res.writeHead(204); res.end(); }); }).listen(HOOK);
const srv = spawn('node', [path.join(__dirname, '../servidor/server.js')], { env:{ ...process.env, PORT, GAME_SECRET:SECRET, RESULT_WEBHOOK:`http://localhost:${HOOK}/api/partidas/resultado`, TICK_MS:'5', RECONNECT_MS:'1500', IA_MANDO_MS:'800' } });
const join = (tok, room = 'SALA01') => new Promise(res => { const ws = new WebSocket(`ws://localhost:${PORT}`); ws.on('open', () => ws.send(JSON.stringify({ t:'join', proto:3, room, token:tok }))); ws.on('message', d => { const m = JSON.parse(d); if(m.t==='joined'||m.t==='error') res({ ws, m }); }); });
const checks = [];
const check = (name, cond) => { checks.push(cond); console.log(`  ${cond ? 'ok   ' : 'FALLO'} ${name}`); };
setTimeout(async () => {
  let r = await join(null); check('rechaza conexión sin token', r.m.t==='error'); r.ws.close();
  r = await join(token('SALA01','7','Ana',undefined,'otra-clave')); check('rechaza firma inválida', r.m.t==='error'); r.ws.close();
  r = await join(token('OTRA','7','Ana')); check('rechaza token de otra sala', r.m.t==='error'); r.ws.close();
  r = await join(token('SALA01','7','Ana', Math.floor(Date.now()/1000) - 10)); check('rechaza token vencido', r.m.t==='error'); r.ws.close();
  const a = await join(token('SALA01','7','Ana',undefined,undefined,true)), b = await join(token('SALA01','9','Beto'));
  const deA = []; a.ws.on('message', d => deA.push(JSON.parse(d)));
  check('acepta tokens válidos', a.m.t==='joined' && b.m.t==='joined');
  b.ws.send(JSON.stringify({ t:'iniciar' })); b.ws.send(JSON.stringify({ t:'ready' })); await new Promise(r => setTimeout(r, 200));
  check('solo el creador inicia la partida', !deA.some(m => m.t==='start'));
  a.ws.send(JSON.stringify({ t:'iniciar' })); await new Promise(r => setTimeout(r, 400));
  check('el creador inicia la partida', deA.some(m => m.t==='start'));
  b.ws.terminate();                                   // Beto se va: a los IA_MANDO_MS la IA toma su mando y la partida sigue
  await new Promise(r => setTimeout(r, 1300));
  check('la IA toma el mando del jugador desconectado', deA.some(m => m.t==='iaMando' && m.slot===1 && m.on) && !hook?.body?.includes('"reason":"abandono"'));
  a.ws.send(JSON.stringify({ t:'surrender' }));        // Ana se rinde: gana el equipo de Beto (jugado por la IA)
  await new Promise(r => setTimeout(r, 900));
  check('webhook recibido con firma válida', !!hook && hook.valid);
  const body = hook ? JSON.parse(hook.body) : {};
  check('webhook declara ganador a Beto por la rendición de Ana', body.winner_uid==='9' && body.reason==='abandono');
  // Cerrar sala: solo el creador (anf en el token) y antes de empezar; Laravel recibe un aviso firmado
  hook = null;
  const h = await join(token('SALA02','7','Ana',undefined,undefined,true), 'SALA02'), g = await join(token('SALA02','9','Beto'), 'SALA02');
  const deG = [], deH = []; g.ws.on('message', d => deG.push(JSON.parse(d))); h.ws.on('message', d => deH.push(JSON.parse(d)));
  g.ws.send(JSON.stringify({ t:'close' })); await new Promise(r => setTimeout(r, 300));
  check('un invitado no puede cerrar la sala', deG.some(m => m.t==='error') && !deG.some(m => m.t==='closed'));
  h.ws.send(JSON.stringify({ t:'close' })); await new Promise(r => setTimeout(r, 700));
  check('el creador cierra la sala y los demás reciben el aviso', deG.some(m => m.t==='closed') && deH.some(m => m.t==='closed'));
  const cierre = hook ? JSON.parse(hook.body) : {};
  check('Laravel recibe el aviso firmado de sala cerrada', !!hook && hook.valid && cierre.reason==='cerrada' && cierre.room==='SALA02');
  const otra = await join(token('SALA02','9','Beto'), 'SALA02'); check('la sala cerrada no conserva jugadores', otra.m.t==='joined'); otra.ws.close();
  srv.kill(); process.exit(checks.every(Boolean) ? 0 : 1);
}, 500);
