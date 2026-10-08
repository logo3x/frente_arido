'use strict';
// Cliente sin interfaz: carga la simulación real del cliente y juega con órdenes aleatorias por la red.
// Uso: node cliente-prueba.js <url> <sala> <nombre> <ticks> [desconectarEnTick]
const fs = require('fs'), path = require('path'), WebSocket = require('../servidor/node_modules/ws');
const html = fs.readFileSync(require('./rutas').JUEGO_JS, 'utf8');
const sim = html.split('// ======================= SIM-START =======================')[1].split('// ======================= SIM-END =======================')[0];
const [url, room, name, ticksArg, dropArg, factionArg, mapArg] = process.argv.slice(2);
const MAP = mapArg ? JSON.parse(fs.readFileSync(mapArg, 'utf8')) : null;
const TARGET = Number(ticksArg), DROP = dropArg ? Number(dropArg) : -1;
const api = new Function(sim + '\nreturn { S, newGame, simTick, stateHash, UT, BT, FACTIONS, POWERS, setLocal: v => { LOCAL = v; } };')();
const { S } = api;
let IA_SLOTS = [], iniciado = false;   // plazas que juega la IA (las simula este cliente igual que los demás)
let ws, slot = -1, started = false, dropped = false, finished = false, hashes = 0, rnd = 1;
const rand = () => (rnd = (rnd * 48271) % 2147483647) / 2147483647;   // aleatorio propio del cliente (no afecta el determinismo)
function out(o){ process.stdout.write(JSON.stringify(o) + '\n'); }
function connect(){
  ws = new WebSocket(url);
  ws.on('error', () => {});
  // RECONECTAR=1: si el servidor se reinicia, el cliente vuelve a conectarse y recibe el registro de la partida
  if(process.env.RECONECTAR) ws.on('close', () => { if(!finished && !dropped) setTimeout(connect, 700); else if(!finished && dropped && ws.readyState===3) setTimeout(connect, 700); });
  // PLAZAS y MODO: salas de más de 2 jugadores (en desarrollo el servidor los toma del mensaje)
  ws.on('open', () => ws.send(JSON.stringify({ t:'join', proto:3, room, name, plazas:Number(process.env.PLAZAS) || 2, modo:process.env.MODO || 'todos' })));
  ws.on('message', d => {
    const m = JSON.parse(d);
    if(m.t === 'joined'){ slot = m.slot; if(!started){ if(factionArg) ws.send(JSON.stringify({ t:'faction', f:factionArg })); if(MAP && slot===0) ws.send(JSON.stringify({ t:'map', map:MAP }));
      // IA="3,4,5": el anfitrión (plaza 0) convierte esas plazas en jugadores IA; IA_NIVEL fija su dificultad
      if(slot===0 && process.env.IA) for(const pl of process.env.IA.split(',').map(Number)){ ws.send(JSON.stringify({ t:'slot', slot:pl, k:'tipo', v:'ia' })); if(process.env.IA_NIVEL) ws.send(JSON.stringify({ t:'slot', slot:pl, k:'dif', v:process.env.IA_NIVEL })); }
      ws.send(JSON.stringify({ t:'ready', ready:true })); } }
    // El creador (plaza 0 en desarrollo) lanza la partida cuando están las ESPERAR personas y las demás marcaron «Listo»
    else if(m.t === 'room' && !started && !iniciado && m.players[slot] && m.players[slot].anf){
      const hs = m.players.filter(p => p && p.tipo === 'humano'), esperar = Number(process.env.ESPERAR) || (m.plazas - (process.env.IA ? process.env.IA.split(',').length : 0));
      if(hs.length >= esperar && hs.every(p => p.anf || (p.ready && p.connected))){ iniciado = true; ws.send(JSON.stringify({ t:'iniciar' })); }
    }
    else if(m.t === 'iaMando') out({ ev:'iaMando', name, slot:m.slot, on:m.on });
    else if(m.t === 'start'){
      IA_SLOTS = Array.isArray(m.ia) ? m.ia : [];
      api.setLocal(m.slot); api.newGame(m.seed, IA_SLOTS, m.factions, m.map || null, null, m.niveles || 'normal', m.creditos || 3000, m.equipos || null, m.pos || null, m.vacios || null); if(!m.log.length) out({ ev:'start', name, factions:m.factions, map:m.map ? m.map.nombre : 'Estándar' }); started = true; rnd = 7 + m.slot * 1000;
      for(const pkt of m.log) step(pkt);
      if(m.log.length) out({ ev:'replay', name, ticks:m.log.length, tick:S.tick });
    }
    else if(m.t === 'tick') step(m);
    else if(m.t === 'desync'){ out({ ev:'desync', name, n:m.n }); process.exit(2); }
    else if(m.t === 'error') out({ ev:'error', name, msg:m.msg });
    else if(m.t === 'ended') out({ ev:'ended', name, winner:m.winner, reason:m.reason });
    else if(m.t === 'retirado') out({ ev:'retirado', name, slot:m.slot, motivo:m.motivo });
  });
}
function cmd(c){ ws.send(JSON.stringify({ t:'cmd', c })); }
function step(pkt){
  if(finished) return;
  if(pkt.n !== S.tick){ if(pkt.n < S.tick) return; out({ ev:'gap', name, n:pkt.n, tick:S.tick }); process.exit(3); }
  for(const c of pkt.c){ c.tick = S.tick; S.cmdQueue.push(c); }
  api.simTick();
  if(S.tick % 30 === 0){ ws.send(JSON.stringify({ t:'hash', n:S.tick, h:api.stateHash() })); hashes++; }
  if(S.tick % 20 === 0 && ws.readyState === 1) play();
  if(S.tick === DROP && !dropped){ dropped = true; out({ ev:'drop', name, tick:S.tick }); ws.terminate(); if(process.env.NO_VOLVER){ finished = true; out({ ev:'done', name, slot, tick:S.tick, hash:0, hashes, fuera:true }); setTimeout(() => process.exit(0), 200); return; } setTimeout(connect, Number(process.env.VOLVER_MS) || 1500); return; }   // VOLVER_MS: demora en volver
  if(S.tick >= TARGET || S.over){ finished = true; if(S.over) ws.send(JSON.stringify({ t:'result', winner:S.winner })); out({ ev:'done', name, slot, tick:S.tick, hash:api.stateHash(), hashes, over:S.over, winner:S.winner, ents:S.ents.length, ia:IA_SLOTS.length, iaEnts:S.ents.filter(e => IA_SLOTS.includes(e.owner) && !e.dead).length, poderes:Object.keys(S.players[slot].unlocked).length, rango:S.players[slot].rank, pozos:S.ents.filter(e=>e.type==='pozo'&&e.owner===slot).length, aviones:S.ents.filter(e=>e.air).length }); setTimeout(() => { ws.close(); process.exit(0); }, 300); }
}
// Órdenes de prueba variadas: producir, mover, atacar-mover, construir
function play(){
  const mine = S.ents.filter(e => e.owner === slot && !e.dead);
  const units = mine.filter(e => e.kind === 'unit' && api.UT(slot, e.type).weapon);
  const pl = S.players[slot], F = api.FACTIONS[pl.faction];
  const r = rand();
  if(r < 0.3){ const b = mine.find(e => e.type === 'cuartel' && e.built); if(b) cmd({ t:'build', id:b.id, type:'infanteria' }); }
  else if(r < 0.45){ const b = mine.find(e => e.type === 'fabrica' && e.built); if(b) cmd({ t:'build', id:b.id, type:'tanque' }); }
  else if(r < 0.75 && units.length){ const ids = units.filter(() => rand() < 0.6).map(u => u.id); if(ids.length) cmd({ t: rand() < 0.5 ? 'amove' : 'move', ids, x: 10 + rand()*108, z: 10 + rand()*108 }); }
  else if(r < 0.85){
    const bu = mine.find(e => e.type === 'constructor'); if(!bu) return;
    const type = F.builds[Math.floor(rand()*F.builds.length)];
    const cx = Math.floor(bu.x) + Math.floor(rand()*17) - 8, cz = Math.floor(bu.z) + Math.floor(rand()*17) - 8;
    cmd({ t:'place', ids:[bu.id], type, cx, cz });
  }
  else if(r < 0.88){ const id = F.powers[Math.floor(rand()*F.powers.length)]; if(!pl.unlocked[id]) cmd({ t:'unlock', power:id }); else { const foe = S.ents.find(e => e.owner === 1-slot && e.kind === 'unit') || mine[0]; if(foe) cmd({ t:'power', power:id, x:foe.x, z:foe.z }); } }
  else if(r < 0.93){ const inf = units.filter(u => u.type === 'infanteria').slice(0, 2); const well = S.ents.find(e => e.type === 'pozo' && e.owner !== slot); if(inf.length && well) cmd({ t:'capture', ids:inf.map(u => u.id), target:well.id }); }
  else if(r < 0.96){ const b = mine.find(e => (e.type === 'aerodromo' || e.type === 'fabrica') && e.built); if(b) cmd({ t:'build', id:b.id, type: b.type === 'aerodromo' ? 'avion' : (rand() < 0.5 ? 'antiaereo' : 'pesado') }); }
  else if(r < 0.975){
    // v0.5: túneles, ingenieros, superarma, producción de la fábrica según facción
    const tun = mine.find(e => e.type === 'tunel' && e.built);
    const fab = mine.find(e => e.type === 'fabrica' && e.built), cua = mine.find(e => e.type === 'cuartel' && e.built);
    const k = rand();
    if(tun && k < 0.3){ const ids = units.slice(0, 3).map(u => u.id); if(ids.length) cmd({ t:'enter', ids, target:tun.id }); }
    else if(tun && k < 0.5) cmd({ t:'exit', id:tun.id });
    else if(k < 0.7 && fab){ const list = api.BT(slot,'fabrica').produce; cmd({ t:'build', id:fab.id, type:list[Math.floor(rand()*list.length)] }); }
    else if(k < 0.85 && cua) cmd({ t:'build', id:cua.id, type:'ingeniero' });
    else {
      const eng = mine.find(e => e.type === 'ingeniero'), tg = S.ents.find(e => e.kind === 'bld' && e.owner === 1-slot && e.type !== 'centro');
      if(eng && tg) cmd({ t:'capture', ids:[eng.id], target:tg.id });
      const sw = mine.find(e => e.type === 'superarma' && e.built), foe = S.ents.find(e => e.owner === 1-slot && e.kind === 'bld');
      if(sw && foe) cmd({ t:'super', id:sw.id, x:foe.x, z:foe.z });
    }
  }
  else if(units.length > 6){ const foe = S.ents.find(e => e.owner === 1-slot && e.kind === 'bld'); if(foe) cmd({ t:'amove', ids:units.map(u => u.id), x:foe.x, z:foe.z }); }
}
connect();
