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
 *   RECONNECT_MS    Sin ninguna persona conectada, espera antes de terminar la partida sin resultado (60000)
 *   IA_MANDO_MS     Espera antes de que la IA tome el mando de un jugador desconectado (30000)
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
const IA_MANDO_MS = Number(process.env.IA_MANDO_MS) || 30000;
const HASH_EVERY = 30;
const SIM_VERSION = '0.9.9';
const MAX_CMDS_PER_TICK = 40;
const CMD_TYPES = new Set(['move', 'amove', 'attack', 'harvest', 'stop', 'build', 'cancel', 'rally', 'place', 'repair', 'cancelBuild', 'capture', 'unlock', 'power', 'enter', 'exit', 'super', 'upgrade', 'defend']);
const PLAZAS = new Set([2, 4, 6, 8]);   // jugadores por sala (las de más de 2 usan el mapa continental)
const FACTIONS = new Set(['atlas', 'hierro', 'guerrilla']);
const DEFAULT_FACTION = ['atlas', 'hierro', 'guerrilla'];
// Versión del protocolo de la sala: el cliente la envía al ingresar. Una página antigua guardada en caché debe recargarse.
const PROTO = 3;
// Configuración de la sala (como en la escaramuza): recursos iniciales, hora del día y dificultad de la IA
const CREDITOS = new Set([1000, 3000, 5000, 10000]);
const LUCES = new Set(['dia', 'atardecer', 'noche', 'aleatoria']);
const NIVELES = new Set(['facil', 'normal', 'dificil']);
const NOMBRE_NIVEL = { facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' };
const CAMPOS = new Set(['tipo', 'fac', 'eq', 'color', 'pos', 'dif']);

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
  return { ok: true, uid: String(data.uid), name: String(data.name || 'Jugador').slice(0, 24), anf: data.anf === true,   // anf: creador de la sala en Laravel
           plazas: PLAZAS.has(data.plazas) ? data.plazas : 2, modo: data.modo === 'equipos' ? 'equipos' : 'todos' };
}

// ---------- Utilidades de sala ----------
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room, msg) { const s = JSON.stringify(msg); for (const p of room.players) if (p && p.ws && p.ws.readyState === 1) p.ws.send(s); }
// Estado de la sala para los clientes. Antes de empezar incluye la configuración de cada plaza (humano, IA o libre)
// y el mapa elegido (solo salas de 2), para que todos vean la misma vista previa.
function roomState(room) {
  const previo = !room.started;
  return { t: 'room', room: room.code, started: room.started,
    mapName: room.map ? room.map.nombre : null, map: previo && room.players.length <= 2 && room.map ? room.map : null,
    plazas: room.players.length, modo: room.modo, cfg: { creditos: room.cfg.creditos, luz: room.cfg.luz, semilla: room.cfg.semilla },
    players: room.players.map((p, i) => p ? { slot: i, tipo: p.ia ? 'ia' : p.vacio ? 'vacio' : 'humano', name: nombreDe(p), iaMando: !!p.iaMando, ready: !!p.ready, connected: !!(p.ia || p.connected),
      faction: p.faction, eq: p.eq || 0, color: Number.isInteger(p.color) ? p.color : i, pos: Number.isInteger(p.pos) ? p.pos : -1, dif: p.ia ? p.dif : null,
      team: room.inicio ? room.inicio.equipos[i] : null, fuera: !!p.fuera, anf: !!p.anf } : null) };
}
const nombreDe = p => p.ia ? 'IA · ' + NOMBRE_NIVEL[p.dif] : p.vacio ? 'Vacío' : p.name;
const esHumano = p => !!p && !p.ia && !p.vacio;
const humanos = room => room.players.map((p, i) => i).filter(i => esHumano(room.players[i]));
const humanosActivos = room => humanos(room).filter(i => !room.players[i].fuera);
// Personas conectadas y en juego: son las que envían huellas y resultado (la IA y los desconectados no)
const conectados = room => humanosActivos(room).filter(i => room.players[i].connected);
const nuevaSemilla = () => crypto.randomInt(1, 2147483646);
// Equipo de cada plaza en la partida (resuelto al empezar); antes de empezar, el número de plaza
const equipoDe = (room, i) => room.inicio ? room.inicio.equipos[i] : i;
const equipos = room => room.players.map((_, i) => equipoDe(room, i));
// Valores iniciales de una plaza nueva: equipo según el modo de la sala (mitades en «dos equipos») y el primer color libre
const equipoInicial = (room, slot) => room.modo === 'equipos' ? (slot < room.players.length / 2 ? 1 : 2) : 0;
function colorLibre(room, slot) {
  const usados = new Set(room.players.filter(Boolean).map(p => p.color));
  for (let k = 0; k < 8; k++) { const c = (slot + k) % 8; if (!usados.has(c)) return c; }
  return slot % 8;
}
function getRoom(code, plazas = 2, modo = 'todos') {
  let r = rooms.get(code);
  if (!r) {
    r = { code, seed: 0, modo: plazas > 2 ? modo : 'todos', players: new Array(plazas).fill(null), started: false, ended: false, tick: 0, pending: [], log: [],
          timer: null, hashes: new Map(), results: {}, endTimer: null, abandonTimer: null, created: Date.now(),
          cfg: { semilla: nuevaSemilla(), creditos: 3000, luz: 'dia' }, inicio: null };
    rooms.set(code, r);
  }
  return r;
}
// La partida avanza si hay al menos una persona conectada y nadie está esperando reconexión: las plazas de IA, vacías,
// retiradas o con el mando en manos de la IA no detienen el reloj
function bothConnected(room) { return room.players.every(p => p && (p.ia || p.vacio || p.connected || p.fuera || p.iaMando)) && conectados(room).length > 0; }
const activos = room => room.players.map((p, i) => i).filter(i => room.players[i] && !room.players[i].fuera);
// Partida de más de 2: el jugador que se va o se rinde pierde sus fuerzas (orden «rendir» que el servidor inserta) y la partida sigue
function retirar(room, slot, motivo) {
  const p = room.players[slot]; if (!esHumano(p) || p.fuera) return;
  p.fuera = true; room.pending.push({ t: 'rendir', p: slot });
  broadcast(room, { t: 'retirado', slot, motivo }); broadcast(room, roomState(room));
  log(`sala ${room.code}: ${p.name} queda fuera (${motivo})`);
  if (!humanosActivos(room).length) return finalize(room, -1, 'abandono');   // solo quedan jugadores IA
  const quedan = activos(room); if (quedan.length && new Set(quedan.map(i => equipoDe(room, i))).size <= 1) finalize(room, equipoDe(room, quedan[0]), 'abandono');
}

// Configuración final de la partida: lo que quedó «al azar» (facción de la IA, lugares, hora del día) se resuelve aquí
// y todos los clientes reciben lo mismo. Equipo 0 en una plaza es «solo»: recibe un número de equipo propio.
function resolverInicio(room) {
  const P = room.players, N = P.length;
  const factions = P.map(p => p.vacio ? 'atlas' : FACTIONS.has(p.faction) ? p.faction : DEFAULT_FACTION[crypto.randomInt(DEFAULT_FACTION.length)]);
  const usados = new Set(P.filter(p => p.eq > 0).map(p => p.eq - 1)); let libre = 0;
  const eqs = P.map(p => { if (p.eq > 0) return p.eq - 1; while (usados.has(libre)) libre++; usados.add(libre); return libre; });
  const pos = P.map(p => Number.isInteger(p.pos) && p.pos >= 0 && p.pos < N ? p.pos : -1);
  const libres = [...Array(N).keys()].filter(l => !pos.includes(l));
  for (let i = libres.length - 1; i > 0; i--) { const k = crypto.randomInt(i + 1); [libres[i], libres[k]] = [libres[k], libres[i]]; }
  for (let i = 0; i < N; i++) if (pos[i] < 0) pos[i] = libres.pop();
  const luz = room.cfg.luz === 'aleatoria' ? ['dia', 'atardecer', 'noche'][crypto.randomInt(3)] : room.cfg.luz;
  return { seed: room.cfg.semilla, factions, equipos: eqs, pos, colores: P.map((p, i) => Number.isInteger(p.color) ? p.color : i),
           ia: P.map((p, i) => i).filter(i => P[i].ia), vacios: P.map((p, i) => i).filter(i => P[i].vacio), niveles: P.map(p => p.ia ? p.dif : 'normal'),
           creditos: room.cfg.creditos, luz, names: P.map(nombreDe) };
}
// Motivo por el que el creador no puede iniciar todavía (null si puede). En salas de más de 2, las plazas abiertas quedan vacías.
function errorInicio(room) {
  if (room.players.length <= 2 && room.players.some(p => !p)) return 'Falta el rival.';
  const hs = humanos(room);
  if (hs.length < 2) return 'La partida en línea necesita al menos dos jugadores.';
  if (hs.some(i => !room.players[i].anf && !(room.players[i].ready && room.players[i].connected))) return 'Faltan jugadores por marcar «Listo».';
  if (new Set(room.players.map((p, i) => !p ? null : p.eq > 0 ? 'e' + p.eq : 's' + i).filter(Boolean)).size < 2) return 'Debe haber al menos dos bandos: cambie el equipo de algún jugador.';
  return null;
}
// El creador lanza la partida cuando los demás marcaron «Listo»
function onIniciar(ws) {
  const room = ws.room, yo = room && room.players[ws.slot]; if (!room || room.started || !yo) return;
  if (!yo.anf) return send(ws, { t: 'error', msg: 'Solo el creador inicia la partida.' });
  const error = errorInicio(room); if (error) return send(ws, { t: 'error', msg: error });
  startRoom(room);
}
// Mensaje de inicio: el mismo para todos salvo la plaza propia. log: ticks ya jugados (reconexión)
function mensajeInicio(room, slot, log) {
  const I = room.inicio;
  return { t: 'start', seed: I.seed, slot, names: I.names, factions: I.factions, equipos: I.equipos, pos: I.pos, colores: I.colores, ia: I.ia, vacios: I.vacios || [], niveles: I.niveles,
           creditos: I.creditos, luz: I.luz, map: room.players.length > 2 ? null : room.map || null, log };
}
function startRoom(room) {
  room.started = true; clearTimeout(room.cfgTimer);
  room.players = room.players.map(p => p || { vacio: true, connected: true, ready: true });   // plazas abiertas: lugares vacíos
  room.inicio = resolverInicio(room);
  room.seed = room.inicio.seed; room.factions = room.inicio.factions;
  room.players.forEach((p, slot) => { if (esHumano(p)) send(p.ws, mensajeInicio(room, slot, [])); });
  room.timer = setInterval(() => stepRoom(room), TICK_MS);
  log(`sala ${room.code}: inicio, semilla ${room.seed}, facciones ${room.factions.join(' vs ')}${room.inicio.ia.length ? `, ${room.inicio.ia.length} IA` : ''}`);
  // Laravel deja de ofrecer la sala y corrige la lista de jugadores con los que realmente entraron
  if (WEBHOOK) postWebhook(room, JSON.stringify({ room: room.code, reason: 'iniciada', ticks: 0, ia: room.inicio.ia.length,
    jugadores: humanos(room).map(i => ({ uid: room.players[i].id, slot: i, team: room.inicio.equipos[i] })) }));
}
// Cantidad de plazas de IA para el lobby de Laravel (una sala con IA ofrece menos plazas). Se agrupan los cambios seguidos.
function avisarConfiguracion(room) {
  if (!WEBHOOK || room.players.length <= 2) return;
  clearTimeout(room.cfgTimer);
  room.cfgTimer = setTimeout(() => { if (!room.started && !room.ended) postWebhook(room, JSON.stringify({ room: room.code, reason: 'configuracion', ticks: 0, ia: room.players.filter(p => p && p.ia).length })); }, 1000);
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
  const I = room.inicio, hs = humanos(room); if (!I) return;
  const body = JSON.stringify({
    room: room.code, reason, ticks: room.tick,
    winner_uid: winner >= 0 && room.players.length === 2 ? room.players[winner].id : null,
    winner_team: winner, plazas: room.players.length, modo: room.modo,
    ia: I.ia.length,                                            // partida con IA: Laravel no cambia el Elo
    jugadores: hs.map(i => ({ uid: room.players[i].id, slot: i, team: equipoDe(room, i), fuera: !!room.players[i].fuera })),
    // Repetición compacta: solo los ticks con órdenes. El cliente la reproduce con la misma semilla y la misma configuración.
    replay: { formato: 'frente-arido-repeticion', v: SIM_VERSION, seed: room.seed, factions: room.factions, equipos: equipos(room), ai: I.ia, vacios: I.vacios || [], aiLevel: I.niveles,
              creditos: I.creditos, posiciones: I.pos, colores: I.colores, map: room.map || null,
              names: I.names, ticks: room.tick, winner, log: room.log.filter(p => p.c.length).map(p => [p.n, p.c]) },
    players: hs.map(i => room.players[i].id)
  });
  await postWebhook(room, body);
}
// Envía a Laravel un cuerpo firmado con HMAC (resultado de la partida o sala cerrada)
async function postWebhook(room, body) {
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  try {
    const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Game-Signature': sig }, body });
    log(`sala ${room.code}: aviso enviado a Laravel (${res.status})`);
  } catch (e) { log(`sala ${room.code}: error al avisar a Laravel: ${e.message}`); }
}

// ---------- Persistencia de partidas en curso ----------
// Cada 2 s se guarda el registro de ticks de las salas activas. Tras un reinicio del proceso, la sala se restaura
// en pausa; los clientes al reconectar reciben el registro y vuelven a simular hasta el último tick guardado.
const roomFile = code => path.join(ROOMS_DIR, code.replace(/[^A-Z0-9]/g, '') + '.json');
function saveRooms() {
  if (!ROOMS_DIR) return;
  for (const room of rooms.values()) {
    if (!room.started || room.ended || room.savedTick === room.tick) continue;
    const data = { v: 2, code: room.code, seed: room.seed, factions: room.factions, map: room.map || null, tick: room.tick, log: room.log, modo: room.modo, inicio: room.inicio,
                   players: room.players.map(p => p.ia ? { ia: true, dif: p.dif, faction: p.faction } : p.vacio ? { vacio: true }
                     : { id: p.id, name: p.name, faction: p.faction, fuera: !!p.fuera, anf: !!p.anf, iaMando: !!p.iaMando }) };
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
      if (![1, 2].includes(d.v) || !Array.isArray(d.log) || d.log.length !== d.tick || !Array.isArray(d.players)) throw new Error('formato');
      const room = getRoom(d.code);
      Object.assign(room, { seed: d.seed, factions: d.factions, map: d.map, tick: d.tick, log: d.log, started: true, savedTick: d.tick, modo: d.modo === 'equipos' ? 'equipos' : 'todos',
        players: d.players.map(p => p.ia ? { ia: true, dif: NIVELES.has(p.dif) ? p.dif : 'normal', faction: p.faction, ready: true, connected: true }
                                  : p.vacio ? { vacio: true, connected: true, ready: true }
                                  : { id: p.id, name: p.name, faction: p.faction, ws: null, ready: true, connected: false, fuera: !!p.fuera, anf: !!p.anf, iaMando: !!p.iaMando }) });
      // Formato 1 (versión anterior): sin IA, lugares y colores por posición, equipos según el modo
      const N = room.players.length, eqV1 = i => room.modo === 'equipos' ? Math.floor(i / (N / 2)) : i;
      room.inicio = d.v === 2 && d.inicio ? d.inicio : { seed: d.seed, factions: d.factions, equipos: room.players.map((_, i) => eqV1(i)), pos: null, colores: null,
        ia: [], niveles: null, creditos: 3000, luz: 'dia', names: room.players.map(p => p.name) };
      // Quien no vuelve en IA_MANDO_MS queda a cargo de la IA (si ya lo estaba, sigue así); si no vuelve nadie, termina sin resultado
      room.players.forEach((p, i) => { if (esHumano(p) && !p.fuera && !p.iaMando) p.timerIa = setTimeout(() => tomarMando(room, i), IA_MANDO_MS); });
      room.abandonTimer = setTimeout(() => { if (!room.ended && !conectados(room).length) finalize(room, -1, 'reinicio'); }, RECONNECT_MS);
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
  if (m.proto !== PROTO) return send(ws, { t: 'error', msg: 'La página del juego está desactualizada. Recárguela (Ctrl + F5) y vuelva a entrar.' });
  const auth = verifyToken(m.token, code);
  if (!auth.ok) return send(ws, { t: 'error', msg: auth.msg });
  const name = clean(auth.name || String(m.name || 'Jugador').trim()).slice(0, 24).trim() || 'Jugador';
  const id = auth.uid || 'dev:' + name.toLowerCase();
  if (!rooms.has(code) && rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', msg: 'El servidor está lleno. Intente más tarde.' });
  if (ws.room) return send(ws, { t: 'error', msg: 'La conexión ya está en una sala' });
  const plazas = auth.dev ? (PLAZAS.has(m.plazas) ? m.plazas : 2) : auth.plazas, modo = auth.dev ? (m.modo === 'equipos' ? 'equipos' : 'todos') : auth.modo;
  const nueva = !rooms.has(code), room = getRoom(code, plazas, modo);
  if (room.ended) return send(ws, { t: 'error', msg: 'La partida ya terminó' });
  if (nueva) avisarConfiguracion(room);                         // sala nueva: Laravel parte de 0 plazas de IA

  let slot = room.players.findIndex(p => p && p.id === id);
  if (slot >= 0) {                                              // reconexión
    const p = room.players[slot];
    if (p.connected && p.ws !== ws) { try { p.ws.close(4000, 'Sesión reemplazada'); } catch {} }
    p.ws = ws; p.connected = true; if (auth.anf) p.anf = true; clearTimeout(p.timerIa); p.iaPendiente = false;
    if (room.started && p.iaMando) {                          // vuelve: la IA le devuelve el mando en el próximo tick
      p.iaMando = false; room.pending.push({ t: 'iaDeja', p: slot }); broadcast(room, { t: 'iaMando', slot, on: false });
      log(`sala ${room.code}: ${p.name} retoma su mando`);
    }
  } else {
    if (room.started) return send(ws, { t: 'error', msg: 'La partida ya comenzó' });
    slot = room.players.findIndex(p => !p);
    if (slot < 0) return send(ws, { t: 'error', msg: 'La sala está llena' });
    // Creador: el que indica el token de Laravel; en desarrollo (sin GAME_SECRET), el primero en entrar
    room.players[slot] = { id, name, ws, ready: false, connected: true, faction: DEFAULT_FACTION[slot % DEFAULT_FACTION.length], anf: auth.dev ? slot === 0 && room.players.every(q => !q || !q.anf) : !!auth.anf,
                           eq: equipoInicial(room, slot), color: colorLibre(room, slot), pos: -1 };
  }
  ws.room = room; ws.slot = slot; clearTimeout(ws.joinTimer);
  send(ws, { t: 'joined', room: code, slot });
  if (room.started) {
    send(ws, mensajeInicio(room, slot, room.log));
    room.players.forEach((q, i) => { if (q && q.iaPendiente) tomarMando(room, i); });   // esperaban a que volviera alguien
    reanudar(room);
    log(`sala ${code}: ${name} se reconectó en el tick ${room.tick}`);
  }
  broadcast(room, roomState(room));
}
function onReady(ws, m) {
  const room = ws.room; if (!room || room.started) return;
  const p = room.players[ws.slot]; p.ready = m.ready !== false;
  broadcast(room, roomState(room));
}
function onFaction(ws, m) {
  const room = ws.room; if (!room || room.started || !FACTIONS.has(m.f)) return;
  const p = room.players[ws.slot]; if (p.ready) return;
  p.faction = m.f;
  broadcast(room, roomState(room));
}
// Cambio en una plaza. Cada jugador cambia su facción, equipo, color y lugar. El creador, además, agrega o quita
// jugadores IA en las plazas libres, configura la IA (facción, dificultad) y ajusta el equipo, el color y el lugar de cualquiera.
// Color y lugar no se repiten: se intercambian con quien los tenía (con otro jugador, solo si lo hace el creador).
function onSlot(ws, m) {
  const room = ws.room; if (!room || room.started) return;
  const yo = room.players[ws.slot], N = room.players.length;
  if (!yo || !Number.isInteger(m.slot) || m.slot < 0 || m.slot >= N || !CAMPOS.has(m.k)) return;
  if (yo.ready) return send(ws, { t: 'error', msg: 'Cancele «Listo» para hacer cambios.' });
  const i = m.slot, p = room.players[i], propio = i === ws.slot, anf = !!yo.anf, v = m.v;
  let otros = !propio;                                          // el cambio afecta a otra plaza: todos confirman de nuevo
  if (m.k === 'tipo') {
    if (!anf) return send(ws, { t: 'error', msg: 'Solo el creador agrega o quita jugadores IA.' });
    if (N <= 2) return send(ws, { t: 'error', msg: 'Las salas de 2 jugadores no admiten jugadores IA.' });
    if (v === 'ia' && !p) room.players[i] = { ia: true, dif: 'normal', faction: 'aleatoria', eq: equipoInicial(room, i), color: colorLibre(room, i), pos: -1, ready: true, connected: true };
    else if (v === 'abierta' && p && p.ia) room.players[i] = null;
    else return;
    otros = true; avisarConfiguracion(room);
  } else {
    if (!p) return;
    if (!propio && !anf) return send(ws, { t: 'error', msg: 'Solo puede cambiar su propia plaza.' });
    if (m.k === 'fac') { if (!(FACTIONS.has(v) || (p.ia && v === 'aleatoria')) || (!propio && !p.ia)) return; p.faction = v; }
    else if (m.k === 'dif') { if (!p.ia || !NIVELES.has(v)) return; p.dif = v; }
    else if (m.k === 'eq') { if (N <= 2 || !Number.isInteger(v) || v < 0 || v > 4) return; p.eq = v; }   // en salas de 2, siempre uno contra uno
    else {
      if (!Number.isInteger(v) || v < (m.k === 'pos' ? -1 : 0) || v >= (m.k === 'color' ? 8 : N)) return;
      const j = v >= 0 ? room.players.findIndex((q, k) => q && k !== i && q[m.k] === v) : -1;
      if (j >= 0) {
        if (esHumano(room.players[j]) && !anf) return send(ws, { t: 'error', msg: m.k === 'color' ? 'Ese color ya lo usa otro jugador.' : 'Ese lugar ya lo ocupa otro jugador.' });
        room.players[j][m.k] = p[m.k]; otros = true;
      }
      p[m.k] = v;
    }
  }
  if (otros) for (const q of room.players) if (esHumano(q)) q.ready = false;
  broadcast(room, roomState(room));
}
// Configuración general de la partida (solo el creador): recursos iniciales, hora del día y otro trazado del mapa
function onCfg(ws, m) {
  const room = ws.room; if (!room || room.started) return;
  const yo = room.players[ws.slot]; if (!yo) return;
  if (!yo.anf) return send(ws, { t: 'error', msg: 'Solo el creador cambia la configuración de la partida.' });
  if (yo.ready) return send(ws, { t: 'error', msg: 'Cancele «Listo» para hacer cambios.' });
  if (m.k === 'creditos' && CREDITOS.has(m.v)) room.cfg.creditos = m.v;
  else if (m.k === 'luz' && LUCES.has(m.v)) room.cfg.luz = m.v;
  else if (m.k === 'trazado') room.cfg.semilla = nuevaSemilla();
  else return;
  for (const q of room.players) if (esHumano(q)) q.ready = false;
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
// Mapa (plantilla o del editor): solo el creador, en salas de 2 y antes de iniciar. Los demás confirman de nuevo.
function onMap(ws, m) {
  const room = ws.room, yo = room && room.players[ws.slot]; if (!room || room.started || !yo || !yo.anf || room.players.length > 2) return;
  if (yo.ready) return send(ws, { t: 'error', msg: 'Cancele «Listo» para hacer cambios.' });
  if (!validMap(m.map)) return send(ws, { t: 'error', msg: 'Mapa inválido' });
  room.map = m.map ? { formato: m.map.formato, version: m.map.version || 1, nombre: clean(m.map.nombre || 'Mapa personalizado'), grid: 64,
                       terrain: m.map.terrain, depots: m.map.depots.map(d => [d[0], d[1], d[2]]), wells: m.map.wells.map(w => [w[0], w[1]]) } : null;
  for (const q of room.players) if (esHumano(q)) q.ready = false;
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
  const act = conectados(room);                                 // la IA y los desconectados no envían huellas
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
  const r = room.results, act = conectados(room);
  if (act.every(i => r[i] !== undefined)) { const ok = act.every(i => r[i] === r[act[0]]); finalize(room, ok ? r[act[0]] : -1, ok ? 'victoria' : 'discrepancia'); }
  else if (!room.endTimer) room.endTimer = setTimeout(() => finalize(room, m.winner, 'victoria'), 5000);
}
// Ping: el cliente informa su última latencia medida (ms) y recibe la de todos los jugadores de la sala
// (lista de jugadores de la partida). null: IA, desconectado o sin medición todavía.
function onPing(ws, m) {
  const room = ws.room, p = room && room.players[ws.slot];
  if (p && p.ws === ws && Number.isFinite(m.ms) && m.ms >= 0 && m.ms < 60000) p.ping = Math.round(m.ms);
  send(ws, { t: 'pong', ts: Number.isFinite(m.ts) ? m.ts : 0,
             pings: room ? room.players.map(q => esHumano(q) && q.connected && !q.fuera && Number.isInteger(q.ping) ? q.ping : null) : null });
}
// El creador cierra la sala antes de empezar: todos salen y Laravel la marca como cancelada (sin resultado ni Elo)
function onCerrar(ws) {
  const room = ws.room; if (!room) return;
  const p = room.players[ws.slot];
  if (!p || !p.anf) return send(ws, { t: 'error', msg: 'Solo el creador puede cerrar la sala' });
  if (room.started || room.ended) return send(ws, { t: 'error', msg: 'La partida ya comenzó: use la rendición' });
  room.ended = true;
  broadcast(room, { t: 'closed' });
  for (const q of room.players) if (q && q.ws) { q.ws.room = null; try { q.ws.close(1000, 'Sala cerrada'); } catch {} }
  rooms.delete(room.code); forgetRoom(room);
  log(`sala ${room.code}: cerrada por su creador (${p.name})`);
  if (WEBHOOK) postWebhook(room, JSON.stringify({ room: room.code, reason: 'cerrada', ticks: 0 }));
}
function onClose(ws) {
  const room = ws.room; if (!room) return;
  const p = room.players[ws.slot]; if (!p || p.ws !== ws) return;
  if (!room.started) {
    room.players[ws.slot] = null;
    if (!room.players.some(esHumano)) {                         // sin personas en la sala: se descarta (y Laravel vuelve a 0 plazas de IA)
      clearTimeout(room.cfgTimer); rooms.delete(room.code);
      if (WEBHOOK && room.players.some(q => q && q.ia)) postWebhook(room, JSON.stringify({ room: room.code, reason: 'configuracion', ticks: 0, ia: 0 }));
    } else broadcast(room, roomState(room));
    return;
  }
  if (room.ended) return;
  p.connected = false;
  const slot = ws.slot;
  if (!p.fuera) {
    broadcast(room, { t: 'paused', reason: `${p.name} se desconectó. Si no vuelve en ${Math.round(IA_MANDO_MS/1000)} s, la IA toma su mando hasta que regrese.` });
    clearTimeout(p.timerIa); p.timerIa = setTimeout(() => tomarMando(room, slot), IA_MANDO_MS);
  }
  broadcast(room, roomState(room));
  log(`sala ${room.code}: ${p.name} desconectado en el tick ${room.tick}`);
  // Sin ninguna persona conectada la partida espera; si nadie vuelve en RECONNECT_MS, termina sin resultado
  if (!conectados(room).length) { clearTimeout(room.abandonTimer); room.abandonTimer = setTimeout(() => { if (!room.ended && !conectados(room).length) finalize(room, -1, 'abandono'); }, RECONNECT_MS); }
}
// La IA de la simulación toma el mando de un jugador desconectado: la orden «iaToma» viaja en el flujo de ticks (mismo tick en todos)
function tomarMando(room, slot) {
  const p = room.players[slot]; if (room.ended || !esHumano(p) || p.connected || p.fuera || p.iaMando) return;
  if (!conectados(room).length) { p.iaPendiente = true; return; }   // nadie conectado: se decide cuando vuelva alguien
  p.iaMando = true; p.iaPendiente = false; room.pending.push({ t: 'iaToma', p: slot });
  broadcast(room, { t: 'iaMando', slot, on: true }); broadcast(room, roomState(room));
  log(`sala ${room.code}: la IA toma el mando de ${p.name}`);
  reanudar(room);
}
// Reanuda el reloj si nadie espera reconexión (también la primera vez tras un reinicio del servidor)
function reanudar(room) {
  if (room.ended || !bothConnected(room)) return;
  clearTimeout(room.abandonTimer); broadcast(room, { t: 'resumed' });
  if (!room.timer) room.timer = setInterval(() => stepRoom(room), TICK_MS);
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
      case 'slot': return onSlot(ws, m);
      case 'cfg': return onCfg(ws, m);
      case 'iniciar': return onIniciar(ws);
      case 'map': return onMap(ws, m);
      case 'cmd': return onCmd(ws, m);
      case 'hash': return onHash(ws, m);
      case 'result': return onResult(ws, m);
      case 'surrender': return onSurrender(ws);
      case 'close': return onCerrar(ws);
      case 'ping': return onPing(ws, m);
    }
}
// Detecta conexiones caídas sin cierre limpio
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 10000).unref();

restoreRooms();
process.on('uncaughtException', e => log('excepción no controlada:', clean(e && e.message)));
server.listen(PORT, process.env.HOST || '0.0.0.0', () => log(`Frente Árido · servidor en ${process.env.HOST || '0.0.0.0'}:${PORT}${SECRET ? '' : ' (modo desarrollo, sin token)'}`));
