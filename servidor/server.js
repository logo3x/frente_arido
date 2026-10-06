'use strict';
/**
 * Frente Árido · servidor de partidas v0.4
 * Lockstep con reloj de servidor: el servidor agrupa las órdenes recibidas y emite
 * un paquete por tick. Los clientes ejecutan los ticks en orden y con la misma semilla.
 *
 * Variables de entorno:
 *   PORT            Puerto HTTP/WebSocket (por defecto 8080)
 *   GAME_SECRET     Clave compartida con Laravel. Sin ella, modo desarrollo (sin token)
 *   RESULT_WEBHOOK  URL de Laravel para reportar resultados (opcional)
 *   TICK_MS         Duración del tick en ms (por defecto 66.67 = 15 Hz)
 *   RECONNECT_MS    Espera máxima de reconexión antes de declarar abandono (60000)
 *   ALLOWED_ORIGINS Orígenes permitidos separados por coma (por ejemplo https://juego.ejemplo.co). Vacío: sin restricción
 *   MAX_CONN_IP     Conexiones simultáneas por IP (20)
 *   MAX_ROOMS       Salas simultáneas en el servidor (500)
 *   TRUST_PROXY     1 si el servidor está detrás de Nginx: usa X-Forwarded-For para la IP
 *   NODE_ENV        production exige GAME_SECRET de al menos 32 caracteres
 *   HOST            Interfaz de escucha (0.0.0.0). Detrás de Nginx usar 127.0.0.1
 *   ROOMS_DIR       Carpeta donde se guardan las partidas en curso (vacío: sin persistencia). Tras un reinicio, se restauran
 *   SIM_FILE        Ruta de juego.js para validar misiones (por defecto CLIENTE_DIR/juego.js)
 *   CLIENTE_DIR     Carpeta del cliente (por defecto ../public/juego)
 *   VALIDATOR       1 para habilitar POST /validar-mision (requiere GAME_SECRET). Por defecto 1 si hay GAME_SECRET
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const SECRET = process.env.GAME_SECRET || '';
const WEBHOOK = process.env.RESULT_WEBHOOK || '';
const TICK_MS = Number(process.env.TICK_MS) || 1000 / 15;
const RECONNECT_MS = Number(process.env.RECONNECT_MS) || 60000;
const HASH_EVERY = 30;
const SIM_VERSION = '0.9.6';
const MAX_CMDS_PER_TICK = 40;
const CMD_TYPES = new Set(['move', 'amove', 'attack', 'harvest', 'stop', 'build', 'cancel', 'rally', 'place', 'repair', 'cancelBuild', 'capture', 'unlock', 'power', 'enter', 'exit', 'super', 'upgrade']);
const PLAZAS = new Set([2, 4, 6, 8]);   // jugadores por sala (las de más de 2 usan el mapa continental)
const FACTIONS = new Set(['atlas', 'hierro', 'guerrilla']);
const DEFAULT_FACTION = ['atlas', 'hierro', 'guerrilla'];

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX_CONN_IP = Number(process.env.MAX_CONN_IP) || 20;
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 500;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
// Límite de mensajes por conexión: ráfaga de 120 y recarga de 60 por segundo (cubre 15 ticks/s con margen)
const RATE_BURST = 120, RATE_REFILL = 60, RATE_STRIKES = 3;
const JOIN_TIMEOUT_MS = 10000;
if (process.env.NODE_ENV === 'production' && SECRET.length < 32) {
  console.error('GAME_SECRET debe tener al menos 32 caracteres en producción.'); process.exit(1);
}
const ROOMS_DIR = process.env.ROOMS_DIR || '';
const SIM_FILE = process.env.SIM_FILE
  || path.join(process.env.CLIENTE_DIR || path.join(__dirname, '../public/juego'), 'juego.js');
const VALIDATOR = (process.env.VALIDATOR || (SECRET ? '1' : '0')) === '1';
const connPerIp = new Map();
const rooms = new Map();
// Los textos que vienen de clientes se limpian antes de registrarlos (evita inyección en los registros)
const clean = v => String(v).replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 40);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a.map(x => typeof x === 'string' ? x.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '') : x));

// ---------- Token firmado por Laravel: base64url(json).base64url(hmac) ----------
function verifyToken(token, room) {
  if (!SECRET) return { ok: true, dev: true };   // en desarrollo, plazas y modo vienen en el mensaje de ingreso
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return { ok: false, msg: 'Token ausente' };
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, msg: 'Firma inválida' };
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return { ok: false, msg: 'Token ilegible' }; }
  if (data.room !== room) return { ok: false, msg: 'El token no corresponde a la sala' };
  if (!data.exp || data.exp < Date.now() / 1000) return { ok: false, msg: 'Token vencido' };
  return { ok: true, uid: String(data.uid), name: String(data.name || 'Jugador').slice(0, 24),
           plazas: PLAZAS.has(data.plazas) ? data.plazas : 2, modo: data.modo === 'equipos' ? 'equipos' : 'todos' };
}

// ---------- Utilidades de sala ----------
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room, msg) { const s = JSON.stringify(msg); for (const p of room.players) if (p && p.ws && p.ws.readyState === 1) p.ws.send(s); }
function roomState(room) {
  return { t: 'room', room: room.code, started: room.started,
    mapName: room.map ? room.map.nombre : null,
    plazas: room.players.length, modo: room.modo,
    players: room.players.map((p, i) => p ? { slot: i, name: p.name, ready: p.ready, connected: p.connected, faction: p.faction, team: equipoDe(room, i), fuera: !!p.fuera } : null) };
}
// Equipo de cada plaza: en modo equipos, mitades (aliados vecinos en el anillo); si no, uno por jugador
const equipoDe = (room, i) => room.modo === 'equipos' ? Math.floor(i / (room.players.length / 2)) : i;
const equipos = room => room.players.map((_, i) => equipoDe(room, i));
function getRoom(code, plazas = 2, modo = 'todos') {
  let r = rooms.get(code);
  if (!r) {
    r = { code, seed: 0, modo: plazas > 2 ? modo : 'todos', players: new Array(plazas).fill(null), started: false, ended: false, tick: 0, pending: [], log: [],
          timer: null, hashes: new Map(), results: {}, endTimer: null, abandonTimer: null, created: Date.now() };
    rooms.set(code, r);
  }
  return r;
}
function bothConnected(room) { return room.players.every(p => p && (p.connected || p.fuera)); }
const activos = room => room.players.map((p, i) => i).filter(i => room.players[i] && !room.players[i].fuera);
// Partida de más de 2: el jugador que se va o se rinde pierde sus fuerzas (orden «rendir» que el servidor inserta) y la partida sigue
function retirar(room, slot, motivo) {
  const p = room.players[slot]; if (!p || p.fuera) return;
  p.fuera = true; room.pending.push({ t: 'rendir', p: slot });
  broadcast(room, { t: 'retirado', slot, motivo }); broadcast(room, roomState(room));
  log(`sala ${room.code}: ${p.name} queda fuera (${motivo})`);
  const quedan = activos(room); if (quedan.length && new Set(quedan.map(i => equipoDe(room, i))).size <= 1) finalize(room, equipoDe(room, quedan[0]), 'abandono');
}

function startRoom(room) {
  room.started = true;
  room.seed = crypto.randomInt(1, 2147483646);
  room.factions = room.players.map(p => p.faction);
  room.players.forEach((p, slot) => send(p.ws, { t: 'start', seed: room.seed, slot, names: room.players.map(q => q.name), factions: room.factions, equipos: equipos(room), map: room.players.length > 2 ? null : room.map || null, log: [] }));
  room.timer = setInterval(() => stepRoom(room), TICK_MS);
  log(`sala ${room.code}: inicio, semilla ${room.seed}, facciones ${room.factions.join(' vs ')}`);
}
function stepRoom(room) {
  if (room.ended || !bothConnected(room)) return;            // pausa mientras falte un jugador
  const pkt = { t: 'tick', n: room.tick, c: room.pending };
  room.pending = [];
  room.log.push(pkt);
  broadcast(room, pkt);
  room.tick++;
}
function finalize(room, winner, reason) {
  if (room.ended) return;
  room.ended = true;
  forgetRoom(room);
  clearInterval(room.timer); clearTimeout(room.endTimer); clearTimeout(room.abandonTimer);
  broadcast(room, { t: 'ended', winner, reason });
  log(`sala ${room.code}: fin, ganador ${winner}, motivo ${reason}, ticks ${room.tick}`);
  if (WEBHOOK) reportResult(room, winner, reason);
  setTimeout(() => rooms.delete(room.code), 60000);
}
async function reportResult(room, winner, reason) {
  const body = JSON.stringify({
    room: room.code, reason, ticks: room.tick,
    winner_uid: winner >= 0 && room.players.length === 2 ? room.players[winner].id : null,
    winner_team: winner, plazas: room.players.length, modo: room.modo,
    jugadores: room.players.map((p, i) => ({ uid: p.id, slot: i, team: equipoDe(room, i), fuera: !!p.fuera })),
    // Repetición compacta: solo los ticks con órdenes. El cliente la reproduce con la misma semilla.
    replay: { formato: 'frente-arido-repeticion', v: SIM_VERSION, seed: room.seed, factions: room.factions, equipos: equipos(room), ai: [], map: room.map || null,
              names: room.players.map(p => p.name), ticks: room.tick, winner, log: room.log.filter(p => p.c.length).map(p => [p.n, p.c]) },
    players: room.players.map(p => p.id)
  });
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  try {
    const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Game-Signature': sig }, body });
    log(`sala ${room.code}: resultado enviado a Laravel (${res.status})`);
  } catch (e) { log(`sala ${room.code}: error al reportar resultado: ${e.message}`); }
}

// ---------- Persistencia de partidas en curso ----------
// Cada 2 s se guarda el registro de ticks de las salas activas. Tras un reinicio del proceso, la sala se restaura
// en pausa; los clientes al reconectar reciben el registro y vuelven a simular hasta el último tick guardado.
const roomFile = code => path.join(ROOMS_DIR, code.replace(/[^A-Z0-9]/g, '') + '.json');
function saveRooms() {
  if (!ROOMS_DIR) return;
  for (const room of rooms.values()) {
    if (!room.started || room.ended || room.savedTick === room.tick) continue;
    const data = { v: 1, code: room.code, seed: room.seed, factions: room.factions, map: room.map || null, tick: room.tick, log: room.log, modo: room.modo,
                   players: room.players.map(p => ({ id: p.id, name: p.name, faction: p.faction, fuera: !!p.fuera })) };
    const tmp = roomFile(room.code) + '.tmp';
    try { fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, roomFile(room.code)); room.savedTick = room.tick; }
    catch (e) { log('no se pudo guardar la sala', room.code, clean(e.message)); }
  }
}
function forgetRoom(room) { if (ROOMS_DIR) { try { fs.unlinkSync(roomFile(room.code)); } catch {} } }
function restoreRooms() {
  if (!ROOMS_DIR) return;
  fs.mkdirSync(ROOMS_DIR, { recursive: true });
  for (const f of fs.readdirSync(ROOMS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const d = JSON.parse(fs.readFileSync(path.join(ROOMS_DIR, f), 'utf8'));
      if (d.v !== 1 || !Array.isArray(d.log) || d.log.length !== d.tick) throw new Error('formato');
      const room = getRoom(d.code);
      Object.assign(room, { seed: d.seed, factions: d.factions, map: d.map, tick: d.tick, log: d.log, started: true, savedTick: d.tick, modo: d.modo === 'equipos' ? 'equipos' : 'todos',
        players: d.players.map(p => ({ id: p.id, name: p.name, faction: p.faction, ws: null, ready: true, connected: false, fuera: !!p.fuera })) });
      room.abandonTimer = setTimeout(() => {
        if (room.ended || bothConnected(room)) return;
        if (room.players.length > 2){ room.players.forEach((p, i) => { if (!p.connected) retirar(room, i, 'abandono'); }); if (!room.timer && !room.ended) room.timer = setInterval(() => stepRoom(room), TICK_MS); return; }
        const alive = room.players.findIndex(p => p.connected);
        finalize(room, alive, alive >= 0 ? 'abandono' : 'reinicio');
      }, RECONNECT_MS);
      log(`sala ${room.code}: restaurada en el tick ${room.tick}, esperando a los jugadores`);
    } catch (e) { log('archivo de sala descartado:', clean(f), clean(e.message)); }
  }
}
if (ROOMS_DIR) setInterval(saveRooms, 2000).unref();

// ---------- Validación de órdenes ----------
function cleanCmd(c, slot) {
  if (!c || typeof c !== 'object' || !CMD_TYPES.has(c.t)) return null;
  const out = { t: c.t, p: slot };                              // el servidor fija el jugador: no se confía en el cliente
  if (c.ids !== undefined) {
    if (!Array.isArray(c.ids) || c.ids.length > 200 || !c.ids.every(Number.isInteger)) return null;
    out.ids = c.ids;
  }
  for (const k of ['id', 'target', 'cx', 'cz']) if (c[k] !== undefined) { if (!Number.isInteger(c[k])) return null; out[k] = c[k]; }
  for (const k of ['x', 'z']) if (c[k] !== undefined) { if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) return null; out[k] = Math.round(c[k] * 100) / 100; }
  for (const k of ['type', 'power']) if (c[k] !== undefined) { if (typeof c[k] !== 'string' || c[k].length > 20) return null; out[k] = c[k]; }
  return out;
}

// ---------- Mensajes ----------
function onJoin(ws, m) {
  const code = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (code.length < 3) return send(ws, { t: 'error', msg: 'Código de sala inválido' });
  const auth = verifyToken(m.token, code);
  if (!auth.ok) return send(ws, { t: 'error', msg: auth.msg });
  const name = clean(auth.name || String(m.name || 'Jugador').trim()).slice(0, 24).trim() || 'Jugador';
  const id = auth.uid || 'dev:' + name.toLowerCase();
  if (!rooms.has(code) && rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', msg: 'El servidor está lleno. Intente más tarde.' });
  if (ws.room) return send(ws, { t: 'error', msg: 'La conexión ya está en una sala' });
  const plazas = auth.dev ? (PLAZAS.has(m.plazas) ? m.plazas : 2) : auth.plazas, modo = auth.dev ? (m.modo === 'equipos' ? 'equipos' : 'todos') : auth.modo;
  const room = getRoom(code, plazas, modo);
  if (room.ended) return send(ws, { t: 'error', msg: 'La partida ya terminó' });

  let slot = room.players.findIndex(p => p && p.id === id);
  if (slot >= 0) {                                              // reconexión
    const p = room.players[slot];
    if (p.connected && p.ws !== ws) { try { p.ws.close(4000, 'Sesión reemplazada'); } catch {} }
    p.ws = ws; p.connected = true;
  } else {
    if (room.started) return send(ws, { t: 'error', msg: 'La partida ya comenzó' });
    slot = room.players.findIndex(p => !p);
    if (slot < 0) return send(ws, { t: 'error', msg: 'La sala está llena' });
    room.players[slot] = { id, name, ws, ready: false, connected: true, faction: DEFAULT_FACTION[slot % DEFAULT_FACTION.length] };
  }
  ws.room = room; ws.slot = slot; clearTimeout(ws.joinTimer);
  send(ws, { t: 'joined', room: code, slot });
  if (room.started) {
    send(ws, { t: 'start', seed: room.seed, slot, names: room.players.map(q => q.name), factions: room.factions, equipos: equipos(room), map: room.players.length > 2 ? null : room.map || null, log: room.log });
    if (bothConnected(room)) {
      clearTimeout(room.abandonTimer); broadcast(room, { t: 'resumed' });
      if (!room.timer) room.timer = setInterval(() => stepRoom(room), TICK_MS);   // sala restaurada tras un reinicio
    }
    log(`sala ${code}: ${name} se reconectó en el tick ${room.tick}`);
  }
  broadcast(room, roomState(room));
}
function onReady(ws, m) {
  const room = ws.room; if (!room || room.started) return;
  const p = room.players[ws.slot]; p.ready = m.ready !== false;
  broadcast(room, roomState(room));
  if (room.players.every(q => q && q.ready && q.connected)) startRoom(room);
}
function onFaction(ws, m) {
  const room = ws.room; if (!room || room.started || !FACTIONS.has(m.f)) return;
  const p = room.players[ws.slot]; if (p.ready) return;
  p.faction = m.f;
  broadcast(room, roomState(room));
}
// Mapa personalizado: solo el anfitrión (jugador 1), antes de iniciar. Validación básica de formato y tamaño.
function validMap(mp) {
  if (mp === null) return true;
  if (!mp || mp.formato !== 'frente-arido-mapa' || mp.grid !== 64 || typeof mp.terrain !== 'string' || mp.terrain.length !== 4096 || /[^.rw]/.test(mp.terrain)) return false;
  if (!Array.isArray(mp.depots) || !Array.isArray(mp.wells) || mp.depots.length > 24 || mp.wells.length > 16) return false;
  const cell = r => Array.isArray(r) && Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= 0 && r[1] >= 0 && r[0] <= 62 && r[1] <= 62;
  return mp.depots.every(d => cell(d) && d[2] >= 500 && d[2] <= 20000) && mp.wells.every(cell);
}
function onMap(ws, m) {
  const room = ws.room; if (!room || room.started || ws.slot !== 0 || room.players.length > 2) return;
  if (room.players.some(p => p && p.ready)) return send(ws, { t: 'error', msg: 'No se puede cambiar el mapa con jugadores listos' });
  if (!validMap(m.map)) return send(ws, { t: 'error', msg: 'Mapa inválido' });
  room.map = m.map ? { formato: m.map.formato, version: m.map.version || 1, nombre: String(m.map.nombre || 'Mapa personalizado').slice(0, 40), grid: 64,
                       terrain: m.map.terrain, depots: m.map.depots.map(d => [d[0], d[1], d[2]]), wells: m.map.wells.map(w => [w[0], w[1]]) } : null;
  broadcast(room, roomState(room));
}
function onCmd(ws, m) {
  const room = ws.room; if (!room || !room.started || room.ended) return;
  if (room.players[ws.slot].fuera || room.pending.filter(c => c.p === ws.slot).length >= MAX_CMDS_PER_TICK) return;
  const c = cleanCmd(m.c, ws.slot);
  if (c) room.pending.push(c);
}
function onHash(ws, m) {
  const room = ws.room; if (!room || room.ended || !Number.isInteger(m.n) || m.n % HASH_EVERY !== 0) return;
  if (m.n > room.tick + 60 || m.n < room.tick - 9000) return;            // fuera de rango: se ignora
  if (room.hashes.size > 400) room.hashes.clear();
  let h = room.hashes.get(m.n); if (!h) { h = {}; room.hashes.set(m.n, h); }
  if (!Number.isFinite(m.h)) return;
  h[ws.slot] = m.h >>> 0;
  const act = activos(room);
  if (act.every(i => h[i] !== undefined)) {
    room.hashes.delete(m.n);
    if (act.some(i => h[i] !== h[act[0]])) {
      log(`sala ${room.code}: DESINCRONIZACIÓN en tick ${m.n} (${act.map(i => h[i]).join(' ≠ ')})`);
      broadcast(room, { t: 'desync', n: m.n });
      finalize(room, -1, 'desincronizacion');
    }
  }
}
// Rendición: el jugador abandona y el rival gana de inmediato
function onSurrender(ws) {
  const room = ws.room; if (!room || room.ended || !room.started) return;
  if (room.players.length > 2) return retirar(room, ws.slot, 'rendicion');
  finalize(room, 1 - ws.slot, 'abandono');
}
function onResult(ws, m) {
  const room = ws.room; if (!room || room.ended || !room.started) return;
  if (!Number.isInteger(m.winner) || m.winner < -1 || m.winner >= room.players.length) return;
  room.results[ws.slot] = m.winner;
  clearInterval(room.timer);                                   // la simulación ya terminó en todos los clientes
  const r = room.results, act = activos(room);
  if (act.every(i => r[i] !== undefined)) { const ok = act.every(i => r[i] === r[act[0]]); finalize(room, ok ? r[act[0]] : -1, ok ? 'victoria' : 'discrepancia'); }
  else if (!room.endTimer) room.endTimer = setTimeout(() => finalize(room, m.winner, 'victoria'), 5000);
}
function onClose(ws) {
  const room = ws.room; if (!room) return;
  const p = room.players[ws.slot]; if (!p || p.ws !== ws) return;
  if (!room.started) {
    room.players[ws.slot] = null;
    if (room.players.every(q => !q)) rooms.delete(room.code); else broadcast(room, roomState(room));
    return;
  }
  if (room.ended) return;
  p.connected = false;
  broadcast(room, { t: 'paused', reason: `${p.name} se desconectó. Esperando reconexión.` });
  broadcast(room, roomState(room));
  log(`sala ${room.code}: ${p.name} desconectado en el tick ${room.tick}`);
  clearTimeout(room.abandonTimer);
  const slot = ws.slot;
  if (room.players.length > 2) { clearTimeout(p.timerFuera); p.timerFuera = setTimeout(() => { if (!p.connected && !room.ended) retirar(room, slot, 'abandono'); }, RECONNECT_MS); return; }
  room.abandonTimer = setTimeout(() => { if (!p.connected) finalize(room, 1 - ws.slot, 'abandono'); }, RECONNECT_MS);
}

// ---------- Servidor ----------
// ---------- Validación de misiones de campaña ----------
// Laravel envía las órdenes del jugador. Un hilo aparte vuelve a simular la misión con la definición oficial
// y devuelve el resultado real. Así el cliente no puede declarar estrellas que no obtuvo.
let worker = null, busy = false; const jobs = [];
function startWorker() {
  worker = new Worker(path.join(__dirname, 'validador.js'), { workerData: { simFile: SIM_FILE, version: SIM_VERSION }, resourceLimits: { maxOldGenerationSizeMb: 192 } });
  worker.on('error', e => log('validador:', clean(e.message)));
  worker.on('exit', () => { worker = null; });
}
function runJob() {
  if (busy || !jobs.length) return;
  if (!worker) startWorker();
  busy = true;
  const job = jobs.shift();
  const timer = setTimeout(() => { worker.terminate(); worker = null; busy = false; job.done({ ok: false, motivo: 'tiempo agotado' }); runJob(); }, 30000);
  worker.once('message', r => { clearTimeout(timer); busy = false; job.done(r); runJob(); });
  worker.postMessage(job.data);
}
function validate(data) { return new Promise(done => { if (jobs.length > 20) return done({ ok: false, motivo: 'servidor ocupado' }); jobs.push({ data, done }); runJob(); }); }
function handleValidate(req, res, sec) {
  let body = ''; let size = 0;
  req.on('data', d => { size += d.length; if (size > 2 * 1024 * 1024) { res.writeHead(413, sec); res.end(); req.destroy(); } else body += d; });
  req.on('end', async () => {
    if (res.writableEnded) return;
    const sig = String(req.headers['x-game-signature'] || '');
    const expected = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (!SECRET || a.length !== b.length || !crypto.timingSafeEqual(a, b)) { res.writeHead(401, sec); return res.end(); }
    let data; try { data = JSON.parse(body); } catch { res.writeHead(400, sec); return res.end(); }
    const r = await validate(data);
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, sec)); res.end(JSON.stringify(r));
  });
}

const server = http.createServer((req, res) => {
  const sec = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' };
  if (req.url === '/health') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, sec));
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
  }
  if (VALIDATOR && req.method === 'POST' && req.url === '/validar-mision') return handleValidate(req, res, sec);
  res.writeHead(404, sec); res.end();
});
const wss = new WebSocketServer({
  server, maxPayload: 32 * 1024,                                        // admite un mapa (≈ 5 KB)
  verifyClient: (info, done) => {
    const origin = info.origin || info.req.headers.origin || '';
    if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(origin)) return done(false, 403, 'Origen no permitido');
    const ip = clientIp(info.req);
    if ((connPerIp.get(ip) || 0) >= MAX_CONN_IP) return done(false, 429, 'Demasiadas conexiones');
    done(true);
  }
});
function clientIp(req) {
  const fwd = TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return fwd || req.socket.remoteAddress || '?';
}
wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.ip = clientIp(req); connPerIp.set(ws.ip, (connPerIp.get(ws.ip) || 0) + 1);
  ws.tokens = RATE_BURST; ws.last = Date.now(); ws.strikes = 0;
  ws.joinTimer = setTimeout(() => { if (!ws.room) ws.close(4001, 'Sin ingreso a sala'); }, JOIN_TIMEOUT_MS);
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data, isBinary) => {
    // límite de mensajes (cubeta de fichas)
    const now = Date.now(); ws.tokens = Math.min(RATE_BURST, ws.tokens + (now - ws.last) / 1000 * RATE_REFILL); ws.last = now;
    if (ws.tokens < 1) { if (++ws.strikes >= RATE_STRIKES) ws.close(4008, 'Demasiados mensajes'); return; }
    ws.tokens -= 1;
    if (isBinary) return;
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return;
    try { route(ws, m); } catch (e) { log('error al procesar mensaje:', clean(e.message)); }
  });
  ws.on('close', () => {
    clearTimeout(ws.joinTimer);
    const n = (connPerIp.get(ws.ip) || 1) - 1; if (n <= 0) connPerIp.delete(ws.ip); else connPerIp.set(ws.ip, n);
    try { onClose(ws); } catch (e) { log('error al cerrar:', clean(e.message)); }
  });
  ws.on('error', () => {});
});
function route(ws, m) {
    switch (m.t) {
      case 'join': return onJoin(ws, m);
      case 'ready': return onReady(ws, m);
      case 'faction': return onFaction(ws, m);
      case 'map': return onMap(ws, m);
      case 'cmd': return onCmd(ws, m);
      case 'hash': return onHash(ws, m);
      case 'result': return onResult(ws, m);
      case 'surrender': return onSurrender(ws);
      case 'ping': return send(ws, { t: 'pong', ts: Number.isFinite(m.ts) ? m.ts : 0 });
    }
}
// Detecta conexiones caídas sin cierre limpio
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 10000).unref();

restoreRooms();
process.on('uncaughtException', e => log('excepción no controlada:', clean(e && e.message)));
server.listen(PORT, process.env.HOST || '0.0.0.0', () => log(`Frente Árido · servidor en ${process.env.HOST || '0.0.0.0'}:${PORT}${SECRET ? '' : ' (modo desarrollo, sin token)'}`));
