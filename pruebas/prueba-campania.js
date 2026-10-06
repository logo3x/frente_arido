'use strict';
/**
 * Prueba de las 9 misiones de campaña con piloto automático (la IA juega por el jugador 1).
 * Verifica: mapas válidos y conectados, ausencia de errores, eventos ejecutados, objetivos evaluados
 * y determinismo (dos ejecuciones independientes dan la misma huella).
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(require('./rutas').JUEGO_JS, 'utf8');
const cut = (a, b) => html.split(a)[1].split(b)[0];
const sim = cut('// ======================= SIM-START =======================', '// ======================= SIM-END =======================');
const camp = cut('// ======================= CAMPAIGN-START =======================', '// ======================= CAMPAIGN-END =======================');
const LIMITE = Number(process.argv[2]) || 15*60*12;
function ctx(){ const c = {}; vm.createContext(c); vm.runInContext(sim + camp + '\nglobalThis.api={S,newGame,simTick,stateHash,generateMap,missionDef,MISSIONS,mapError,setHooks:h=>{hooks=Object.assign({},hooks,h);}};', c); return c.api; }
function conectado(m){
  if(!m) return true; const T = m.terrain, free = (x,z) => x>=0&&z>=0&&x<64&&z<64&&T[z*64+x]==='.';
  const seen = new Uint8Array(4096), q = [[7,54]]; seen[54*64+7] = 1;
  while(q.length){ const [x,z] = q.shift(); if(x>=48 && z<=19) return true; for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx, nz=z+dz; if(free(nx,nz) && !seen[nz*64+nx]){ seen[nz*64+nx]=1; q.push([nx,nz]); } } }
  return false;
}
let fallos = 0;
const base = ctx();
for(const id of Object.keys(base.MISSIONS)){
  const run = () => {
    const a = ctx(), mi = a.MISSIONS[id], def = a.missionDef(id), map = a.generateMap(mi.mapa.plantilla, mi.mapa.semilla);
    let msgs = 0; a.setHooks({ mission:(k) => { if(k==='mensaje') msgs++; } });
    a.newGame(def.semilla, [0,1], [mi.faccion, mi.enemigo], map, def);
    while(!a.S.over && a.S.tick < LIMITE) a.simTick();
    return { map, msgs, hash:a.stateHash(), tick:a.S.tick, over:a.S.over, result:a.S.mission.result, state:a.S.mission.state.join(',') };
  };
  let r1, r2, err = null;
  try { r1 = run(); r2 = run(); } catch(e){ err = e.message; }
  const ok = !err && base.mapError(r1.map || { formato:'frente-arido-mapa', grid:64, terrain:'.'.repeat(4096), depots:[], wells:[] }) === null && conectado(r1.map) && r1.msgs > 0 && r1.hash === r2.hash;
  if(!ok) fallos++;
  console.log(`  ${ok ? 'ok   ' : 'FALLO'} ${id.padEnd(12)} ${err ? 'error: ' + err : `${(r1.tick/900).toFixed(1)} min · ${r1.over ? (r1.result==='ok' ? 'cumplida' : r1.result==='fail' ? 'fallida' : 'terminada') : 'en curso'} · objetivos ${r1.state} · ${r1.msgs} mensajes · determinista ${r1.hash===r2.hash}`}`);
}
console.log(fallos ? `\nCAMPAÑA: ${fallos} FALLO(S)` : `\nCAMPAÑA: LAS ${Object.keys(base.MISSIONS).length} MISIONES FUNCIONAN Y SON DETERMINISTAS`);
process.exit(fallos ? 1 : 0);
