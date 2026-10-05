'use strict';
// Hilo de validación: carga la simulación del cliente (juego.js) y vuelve a jugar una misión con las órdenes recibidas.
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(workerData.simFile, 'utf8');
const cut = (a, b) => src.split(a)[1].split(b)[0];
const sim = cut('// ======================= SIM-START =======================', '// ======================= SIM-END =======================');
const camp = cut('// ======================= CAMPAIGN-START =======================', '// ======================= CAMPAIGN-END =======================');
const MAX_TICKS = 15 * 60 * 60;                     // una hora de juego
parentPort.on('message', d => {
  try { parentPort.postMessage(check(d)); } catch (e) { parentPort.postMessage({ ok: false, motivo: 'error: ' + String(e.message).slice(0, 80) }); }
});
function check(d) {
  if (!d || typeof d !== 'object') return { ok: false, motivo: 'datos inválidos' };
  if (d.version !== workerData.version) return { ok: false, motivo: 'versión distinta' };
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(sim + camp + '\nglobalThis.api = { S, newGame, simTick, generateMap, missionDef, MISSIONS };', ctx, { timeout: 5000 });
  const a = ctx.api, mi = a.MISSIONS[d.mision];
  if (!mi || !['facil', 'normal', 'dificil'].includes(d.dificultad)) return { ok: false, motivo: 'misión o dificultad desconocida' };
  if (!Number.isInteger(d.ticks) || d.ticks < 1 || d.ticks > MAX_TICKS || !Array.isArray(d.log) || d.log.length > 20000) return { ok: false, motivo: 'registro inválido' };
  // La definición y el mapa salen del servidor, nunca del cliente. Solo se aceptan órdenes del jugador 0.
  const def = a.missionDef(d.mision, d.dificultad);
  a.newGame(def.semilla, [1], [mi.faccion, mi.enemigo], a.generateMap(mi.mapa.plantilla, mi.mapa.semilla), def);
  const log = d.log.filter(x => Array.isArray(x) && Number.isInteger(x[0]) && x[0] >= 0 && Array.isArray(x[1]) && x[1].length <= 40);
  let i = 0; const S = a.S;
  while (S.tick < d.ticks && !S.over) {
    while (i < log.length && log[i][0] < S.tick) i++;
    if (i < log.length && log[i][0] === S.tick) { for (const c of log[i][1]) if (c && typeof c === 'object') S.cmdQueue.push(Object.assign({}, c, { p: 0, tick: S.tick })); i++; }
    a.simTick();
  }
  const M = S.mission;
  if (!S.over || M.result !== 'ok') return { ok: false, motivo: S.over ? 'la misión no se cumplió' : 'la misión no terminó', ticks: S.tick };
  const secundarios = M.def.objetivos.every((o, k) => !o.secundario || M.state[k] === 'ok');
  const estrellas = 1 + (secundarios ? 1 : 0) + (d.dificultad === 'dificil' ? 1 : 0);
  return { ok: true, estrellas, segundos: Math.floor(S.tick / 15), ticks: S.tick };
}
