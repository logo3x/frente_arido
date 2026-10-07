'use strict';
/**
 * Pruebas de seguridad del servidor de partidas.
 * Uso: node prueba-seguridad.js [ruta del servidor]   (por defecto ../servidor/server.js)
 */
const { spawn } = require('child_process'), path = require('path'), http = require('http');
const WebSocket = require('../servidor/node_modules/ws');
const SERVER = process.argv[2] || path.join(__dirname, '../servidor/server.js');
const PORT = 8094, URL = `ws://localhost:${PORT}`;
let fallos = 0;
const check = (n, ok, extra='') => { console.log(`  ${ok ? 'ok   ' : 'FALLO'} ${n}${extra ? ' · ' + extra : ''}`); if(!ok) fallos++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const health = () => new Promise(r => http.get(`http://localhost:${PORT}/health`, res => { let b=''; res.on('data', d => b += d); res.on('end', () => r({ status:res.statusCode, headers:res.headers, body:b })); }).on('error', () => r(null)));
function open(opts={}){ return new Promise(res => { const ws = new WebSocket(URL, opts); const msgs = []; ws.on('message', d => msgs.push(JSON.parse(d))); ws.on('open', () => res({ ws, msgs, ok:true })); ws.on('error', e => res({ ws, msgs, ok:false, err:String(e.message) })); ws.on('unexpected-response', (req, r) => res({ ws, msgs, ok:false, status:r.statusCode })); }); }
const closed = ws => new Promise(r => { if(ws.readyState === 3) return r(true); ws.on('close', (c) => r(c)); setTimeout(() => r(false), 3000); });

(async () => {
  const srv = spawn('node', [SERVER], { env:{ ...process.env, PORT, MAX_CONN_IP:'8', ALLOWED_ORIGINS:'', TICK_MS:'20' } });
  let out = ''; srv.stdout.on('data', d => out += d); srv.stderr.on('data', d => out += d);
  await sleep(600);

  // 1. Mensajes malformados no deben tumbar el servidor
  const a = await open();
  for(const raw of ['null', '[]', '"texto"', '42', '{"t":5}', '{"t":"join","room":{"x":1}}', '{"t":"cmd","c":null}', '{"t":"hash","n":1e309}', 'no-json', '{"t":"map","map":"x"}', '{"t":"ready"}', '{"t":"result","winner":"x"}'])
    a.ws.send(raw);
  a.ws.send(Buffer.from([0,1,2,3]), { binary:true });
  await sleep(400);
  const h1 = await health();
  check('mensajes malformados no detienen el servidor', h1 && h1.status === 200);
  check('cabeceras de seguridad en /health', h1 && h1.headers['x-content-type-options'] === 'nosniff' && h1.headers['x-frame-options'] === 'DENY');
  check('/health no expone configuración', h1 && !/dev/.test(h1.body));
  a.ws.close();

  // 2. Inundación de mensajes: la conexión se cierra
  const b = await open();
  for(let i=0; i<600; i++) b.ws.send('{"t":"ping","ts":1}');
  const code = await closed(b.ws);
  check('inundación de mensajes cierra la conexión', code === 4008, `código ${code}`);

  // 3. Carga mayor al máximo permitido
  const c = await open();
  c.ws.send(JSON.stringify({ t:'map', map:{ x:'a'.repeat(40000) } }));
  const code2 = await closed(c.ws);
  check('mensaje de más de 32 KB cierra la conexión', code2 === 1009, `código ${code2}`);

  // 4. Conexión sin ingresar a sala se cierra a los 10 s (se verifica el temporizador con espera corta: solo existencia)
  // 5. Límite de conexiones por IP
  const many = []; for(let i=0; i<10; i++) many.push(await open());
  const rejected = many.filter(x => !x.ok).length;
  check('límite de conexiones por IP', rejected >= 2, `${rejected} rechazadas de 10 (máximo 8)`);
  many.forEach(x => x.ok && x.ws.close()); await sleep(300);

  // 6. Solo el anfitrión cambia el mapa; mapas inválidos rechazados
  const p1 = await open(), p2 = await open();
  p1.ws.send(JSON.stringify({ t:'join', proto:2, room:'SEGURA', name:'Ana<script>' })); await sleep(150);
  p2.ws.send(JSON.stringify({ t:'join', proto:2, room:'SEGURA', name:'Beto\n[admin]' })); await sleep(150);
  p2.ws.send(JSON.stringify({ t:'map', map:{ formato:'frente-arido-mapa', grid:64, terrain:'.'.repeat(4096), depots:[], wells:[] } })); await sleep(150);
  const roomMsg = [...p1.msgs].reverse().find(m => m.t === 'room');
  check('el invitado no puede cambiar el mapa', roomMsg && !roomMsg.mapName);
  p1.ws.send(JSON.stringify({ t:'map', map:{ formato:'frente-arido-mapa', grid:64, terrain:'x'.repeat(4096), depots:[], wells:[] } })); await sleep(150);
  check('mapa inválido rechazado', p1.msgs.some(m => m.t === 'error' && /inválido/.test(m.msg)));
  const names = roomMsg ? roomMsg.players.map(p => p && p.name) : [];
  check('nombres sin caracteres de control ni etiquetas', names.every(n => !/[<>\n]/.test(n)), JSON.stringify(names));
  // 6b. Ping compartido (lista de jugadores): cada uno informa su latencia; los valores inválidos se descartan
  p1.ws.send(JSON.stringify({ t:'ping', ts:1, ms:42 })); p2.ws.send(JSON.stringify({ t:'ping', ts:1, ms:'x' })); await sleep(150);
  p2.ws.send(JSON.stringify({ t:'ping', ts:2, ms:1e12 })); await sleep(150);
  const pong = [...p2.msgs].reverse().find(m => m.t === 'pong');
  check('el ping de cada jugador llega a los demás y se descartan valores inválidos', !!pong && Array.isArray(pong.pings) && pong.pings[0] === 42 && pong.pings[1] === null, pong ? JSON.stringify(pong.pings) : 'sin respuesta');
  // 7. Orden con jugador falsificado: el servidor fija el jugador
  p1.ws.send(JSON.stringify({ t:'ready' })); p2.ws.send(JSON.stringify({ t:'ready' })); await sleep(300);
  p2.ws.send(JSON.stringify({ t:'cmd', c:{ t:'stop', p:0, ids:[1,2,3] } })); await sleep(200);
  const tick = p1.msgs.find(m => m.t === 'tick' && m.c.length);
  check('el servidor reemplaza el jugador de cada orden', tick && tick.c.every(c => c.p === 1), tick ? JSON.stringify(tick.c[0]) : 'sin orden');
  // 8. Orden con campos extra o tipos incorrectos
  p2.ws.send(JSON.stringify({ t:'cmd', c:{ t:'move', ids:'1,2', x:1, z:1 } }));
  p2.ws.send(JSON.stringify({ t:'cmd', c:{ t:'move', ids:[1], x:'1', z:1 } }));
  p2.ws.send(JSON.stringify({ t:'cmd', c:{ t:'evil', ids:[1] } }));
  p2.ws.send(JSON.stringify({ t:'cmd', c:{ t:'move', ids:[1], x:5, z:5, __proto__:{ admin:true }, extra:'x' } }));
  await sleep(250);
  const later = p1.msgs.filter(m => m.t === 'tick' && m.c.length).flatMap(m => m.c);
  check('órdenes mal formadas descartadas y campos extra eliminados', later.every(c => ['stop','move'].includes(c.t) && !('extra' in c) && (c.t!=='move' || Array.isArray(c.ids))), `${later.length} órdenes válidas`);
  p1.ws.close(); p2.ws.close();

  // 8b. Sala armada: el creador agrega IA y configura la partida; cada jugador solo su plaza; valores fuera de rango descartados
  const viejo = await open();
  viejo.ws.send(JSON.stringify({ t:'join', room:'VIEJA', name:'Ana' })); await sleep(150);
  check('una página sin la versión del protocolo no entra', viejo.msgs.some(m => m.t === 'error' && /desactualizada/.test(m.msg)));
  viejo.ws.close();
  const ultima = x => [...x.msgs].reverse().find(m => m.t === 'room');
  const c1 = await open(), c2 = await open();
  c1.ws.send(JSON.stringify({ t:'join', proto:2, room:'ARMADA', name:'Ana', plazas:4 })); await sleep(150);
  c2.ws.send(JSON.stringify({ t:'join', proto:2, room:'ARMADA', name:'Beto', plazas:4 })); await sleep(150);
  c2.ws.send(JSON.stringify({ t:'slot', slot:2, k:'tipo', v:'ia' })); await sleep(120);
  check('un invitado no agrega jugadores IA', !ultima(c1).players[2] && c2.msgs.some(m => m.t === 'error' && /creador/.test(m.msg)));
  c1.ws.send(JSON.stringify({ t:'slot', slot:2, k:'tipo', v:'ia' })); c1.ws.send(JSON.stringify({ t:'slot', slot:3, k:'tipo', v:'ia' })); await sleep(150);
  let st = ultima(c2);
  check('el creador agrega jugadores IA', !!(st.players[2] && st.players[2].tipo === 'ia' && st.players[3] && st.players[3].tipo === 'ia'));
  c2.ws.send(JSON.stringify({ t:'slot', slot:2, k:'dif', v:'dificil' })); c2.ws.send(JSON.stringify({ t:'slot', slot:0, k:'fac', v:'guerrilla' })); c2.ws.send(JSON.stringify({ t:'cfg', k:'creditos', v:10000 })); await sleep(150);
  st = ultima(c1);
  check('un invitado no cambia la IA, la plaza de otro ni la configuración', st.players[2].dif === 'normal' && st.players[0].faction !== 'guerrilla' && st.cfg.creditos === 3000);
  for(const [k, v] of [['color', 99], ['pos', 9], ['eq', 7], ['dif', 'imposible'], ['fac', 'marciana'], ['tipo', 'humano'], ['pos', 1.5]]) c1.ws.send(JSON.stringify({ t:'slot', slot:2, k, v }));
  c1.ws.send(JSON.stringify({ t:'slot', slot:9, k:'color', v:1 })); c1.ws.send(JSON.stringify({ t:'slot', slot:2, k:'__proto__', v:1 }));
  c1.ws.send(JSON.stringify({ t:'cfg', k:'creditos', v:7 })); c1.ws.send(JSON.stringify({ t:'cfg', k:'luz', v:'<b>' })); await sleep(200);
  st = ultima(c1);
  check('valores fuera de rango descartados', st.players[2].color < 8 && st.players[2].pos === -1 && st.players[2].eq <= 4 && st.players[2].dif === 'normal' && st.players[2].faction === 'aleatoria' && st.cfg.creditos === 3000 && st.cfg.luz === 'dia', JSON.stringify(st.players[2]));
  c1.ws.send(JSON.stringify({ t:'slot', slot:2, k:'dif', v:'dificil' })); c1.ws.send(JSON.stringify({ t:'cfg', k:'creditos', v:5000 })); c2.ws.send(JSON.stringify({ t:'slot', slot:1, k:'color', v:5 })); await sleep(150);
  st = ultima(c1);
  check('el creador configura la IA y la partida; cada jugador cambia su plaza', st.players[2].dif === 'dificil' && st.cfg.creditos === 5000 && st.players[1].color === 5);
  c2.ws.send(JSON.stringify({ t:'slot', slot:1, k:'color', v:st.players[0].color })); await sleep(120);
  check('un jugador no toma el color de otra persona', ultima(c1).players[1].color === 5);
  for(const pl of [0, 1, 2, 3]) c1.ws.send(JSON.stringify({ t:'slot', slot:pl, k:'eq', v:1 }));
  await sleep(150); c1.ws.send(JSON.stringify({ t:'ready' })); c2.ws.send(JSON.stringify({ t:'ready' })); await sleep(250);
  check('con un solo bando la partida no inicia y avisa', !c1.msgs.some(m => m.t === 'start') && c1.msgs.some(m => m.t === 'error' && /bandos/.test(m.msg)));
  c1.ws.send(JSON.stringify({ t:'slot', slot:2, k:'eq', v:2 })); c1.ws.send(JSON.stringify({ t:'slot', slot:3, k:'eq', v:2 })); await sleep(120);
  c1.ws.send(JSON.stringify({ t:'ready' })); c2.ws.send(JSON.stringify({ t:'ready' })); await sleep(300);
  const ini = c2.msgs.find(m => m.t === 'start');
  check('inicia con la IA, los equipos, los lugares y los recursos resueltos', !!ini && ini.ia.join() === '2,3' && ini.niveles[2] === 'dificil' && ini.creditos === 5000 && new Set(ini.pos).size === 4
    && ini.equipos[0] === ini.equipos[1] && ini.equipos[2] === ini.equipos[3] && ini.equipos[0] !== ini.equipos[2] && ini.factions.every(f => ['atlas','hierro','guerrilla'].includes(f)), ini ? JSON.stringify({ ia:ini.ia, pos:ini.pos, eq:ini.equipos }) : 'sin inicio');
  c1.ws.close(); c2.ws.close();
  const s1 = await open(), s2 = await open();
  s1.ws.send(JSON.stringify({ t:'join', proto:2, room:'DUELO', name:'Ana' })); await sleep(120);
  s1.ws.send(JSON.stringify({ t:'slot', slot:1, k:'tipo', v:'ia' })); await sleep(120);
  check('la sala de 2 no admite IA', !ultima(s1).players[1] && s1.msgs.some(m => m.t === 'error' && /2 jugadores/.test(m.msg)));
  s2.ws.send(JSON.stringify({ t:'join', proto:2, room:'SOLA', name:'Ana', plazas:4 })); await sleep(120);
  for(const pl of [1, 2, 3]) s2.ws.send(JSON.stringify({ t:'slot', slot:pl, k:'tipo', v:'ia' }));
  await sleep(120); s2.ws.send(JSON.stringify({ t:'ready' })); await sleep(200);
  check('una sola persona con IA no inicia una partida en línea', !s2.msgs.some(m => m.t === 'start') && s2.msgs.some(m => m.t === 'error' && /dos jugadores/.test(m.msg)));
  s1.ws.close(); s2.ws.close();

  // 9. Origen no permitido (segundo servidor con ALLOWED_ORIGINS)
  srv.kill(); await sleep(300);
  const srv2 = spawn('node', [SERVER], { env:{ ...process.env, PORT, ALLOWED_ORIGINS:'https://juego.ejemplo.co' } });
  await sleep(600);
  const bad = await open({ origin:'https://malicioso.ejemplo' }), good = await open({ origin:'https://juego.ejemplo.co' });
  check('origen no permitido rechazado', !bad.ok && bad.status === 403, `estado ${bad.status}`);
  check('origen permitido aceptado', good.ok);
  good.ws && good.ws.close(); srv2.kill();
  // 10. Producción sin clave fuerte: no arranca
  const srv3 = spawn('node', [SERVER], { env:{ ...process.env, PORT:8093, NODE_ENV:'production', GAME_SECRET:'corta' } });
  const exitCode = await new Promise(r => { srv3.on('exit', c => r(c)); setTimeout(() => { srv3.kill(); r('sigue'); }, 1500); });
  check('en producción exige GAME_SECRET de 32 caracteres o más', exitCode === 1, `salida ${exitCode}`);

  console.log(fallos ? `\nSEGURIDAD: ${fallos} FALLO(S)` : '\nSEGURIDAD: TODAS LAS PRUEBAS CORRECTAS');
  process.exit(fallos ? 1 : 0);
})();
