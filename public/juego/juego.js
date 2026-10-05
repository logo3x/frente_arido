// Frente Árido · cliente del juego (simulación, campaña, render, interfaz y red)
"use strict";
// ======================= SIM-START =======================
// Simulación determinista a tick fijo. No usa Math.random, el reloj ni trigonometría.
// Todo cambio de estado entra como comando con número de tick (lockstep).
const TICK_HZ = 15, DT = 1 / TICK_HZ;
const GRID = 64, CELL = 2, WORLD = GRID * CELL, NCELLS = GRID * GRID;
const AIR_Y = 6;
const SIM_VERSION = '0.9.1';
let LOCAL = 0;   // jugador de este cliente (0 o 1)
const hyp = (x,y) => Math.sqrt(x*x + y*y);   // sqrt es exacta en IEEE 754; Math.hypot puede variar entre navegadores
let hooks = { spawn(){}, death(){}, remove(){}, shot(){}, built(){}, power(){}, impact(){}, captured(){}, rankUp(){}, crate(){}, tunnel(){}, superFire(){}, heroDown(){}, mission(){} };

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

const UNIT_TYPES = {
  recolector: { nombre:'Recolector', hp:240, speed:3.6, armor:'veh', weapon:null, sight:8, cost:300, time:6, size:0.95, carry:100 },
  constructor:{ nombre:'Constructor', hp:260, speed:3.4, armor:'veh', weapon:null, sight:9, cost:500, time:8, size:1.0 },
  infanteria: { nombre:'Infantería', hp:110, speed:3.0, armor:'inf', weapon:'rifle', range:7, dmg:11, cd:1.0, sight:11, cost:150, time:4, size:0.55, capture:true },
  tanque:     { nombre:'Tanque', hp:420, speed:3.8, armor:'veh', weapon:'canon', range:9, dmg:46, cd:2.2, sight:12, cost:700, time:9, size:1.15 },
  antiaereo:  { nombre:'Antiaéreo', hp:300, speed:4.0, armor:'veh', weapon:'aa', range:11, dmg:30, cd:0.8, sight:13, cost:600, time:7, size:1.0 },
  pesado:     { nombre:'Tanque pesado', hp:820, speed:2.8, armor:'veh', weapon:'canon', range:9, dmg:72, cd:2.6, sight:11, cost:1100, time:13, size:1.4 },
  avion:      { nombre:'Avión de ataque', hp:260, speed:10, armor:'air', weapon:'misil', range:6, dmg:120, cd:0.6, sight:12, cost:900, time:12, size:1.2, air:true, ammo:2 },
  helicoptero:{ nombre:'Helicóptero', hp:380, speed:6.5, armor:'air', weapon:'cohete', range:8, dmg:24, cd:1.1, sight:12, cost:950, time:12, size:1.2, air:true, hover:true },
  ingeniero:  { nombre:'Ingeniero', hp:90, speed:3.2, armor:'inf', weapon:null, sight:9, cost:400, time:7, size:0.55, engineer:true },
  tecnico:    { nombre:'Técnico', hp:260, speed:5.4, armor:'veh', weapon:'rifle', range:8, dmg:16, cd:0.6, sight:12, cost:450, time:6, size:1.0 },
  lancha:     { nombre:'Lancha patrullera', hp:300, speed:6.0, armor:'nav', weapon:'ametralla', range:8, dmg:16, cd:0.6, sight:12, cost:500, time:7, size:1.2, naval:true },
  fragata:    { nombre:'Fragata', hp:750, speed:3.4, armor:'nav', weapon:'canonaval', range:15, minRange:4, dmg:70, cd:3.0, sight:11, cost:1400, time:16, size:1.6, naval:true, splash:2.5 },
  heroe:      { nombre:'Héroe', hp:900, speed:3.6, armor:'inf', weapon:'heroe', range:10, dmg:40, cd:1.0, sight:14, cost:1500, time:20, size:0.7, hero:true, minRank:4, regen:0.01 },
  artilleria: { nombre:'Artillería ligera', hp:220, speed:2.8, armor:'veh', weapon:'obus', range:17, minRange:5, dmg:55, cd:4, sight:10, cost:800, time:11, size:1.15, splash:3 }
};
const BUILD_TYPES = {
  centro:   { nombre:'Centro de mando', hp:2600, size:3, produce:['recolector','constructor'], power:5, cost:0, time:0, buildable:false, sight:10 },
  planta:   { nombre:'Planta de energía', hp:800, size:2, produce:[], power:10, cost:400, time:10, buildable:true, sight:7 },
  cuartel:  { nombre:'Cuartel', hp:1100, size:2, produce:['infanteria','ingeniero','heroe'], power:-2, cost:500, time:12, buildable:true, sight:8 },
  fabrica:  { nombre:'Fábrica', hp:1500, size:3, produce:['tanque','antiaereo'], power:-4, cost:1200, time:20, buildable:true, sight:8 },
  torre:    { nombre:'Torre de defensa', hp:900, size:1, produce:[], power:-3, cost:600, time:12, buildable:true, sight:12, weapon:'torre', range:11, dmg:30, cd:1.4 },
  aerodromo:{ nombre:'Aeródromo', hp:1400, size:3, produce:['avion'], power:-4, cost:1000, time:18, buildable:true, sight:9 },
  pozo:     { nombre:'Pozo petrolero', hp:600, size:2, produce:[], power:0, cost:0, time:0, buildable:false, sight:5, income:20 },
  astillero:{ nombre:'Astillero', hp:1400, size:3, produce:['lancha','fragata'], power:-3, cost:900, time:18, buildable:true, sight:9, naval:true },
  tunel:    { nombre:'Red de túneles', hp:900, size:1, produce:[], power:0, cost:600, time:10, buildable:true, sight:9, weapon:'rifle', range:8, dmg:10, cd:0.8, tunnel:true },
  superarma:{ nombre:'Superarma', hp:2600, size:3, produce:[], power:-8, cost:4000, time:45, buildable:true, sight:10, superCd:300, minRank:3, superR:11, superDmg:1800, superKind:'particulas' }
};
const FACTIONS = {
  atlas: { nombre:'Coalición Atlas', lema:'Tecnología y aviación',
    rasgos:['Aeródromo y aviones de ataque','Plantas de energía de +12','Tanques más resistentes (480) y caros (800)','Poder exclusivo: ataque de precisión','Superarma: cañón de partículas'],
    builds:['planta','cuartel','fabrica','torre','aerodromo','astillero','superarma'], powers:['radar','reparacion','tropas','precision'], horde:false,
    unitMods:{ tanque:{ cost:800, hp:480 }, heroe:{ nombre:'Comando Atlas', range:13, sight:16, rasgo:'Francotirador: alcance 13' }, fragata:{ nombre:'Fragata lanzamisiles', range:17 } },
    buildMods:{ planta:{ power:12 }, superarma:{ nombre:'Cañón de partículas', superKind:'particulas' } } },
  hierro:{ nombre:'Frente Hierro', lema:'Masa y blindaje',
    rasgos:['Tanque pesado (820 de vida) y helicóptero de ataque','Horda: +25 % de daño con 4 aliados cerca','Infantería más barata (120)','Poder exclusivo: bombardeo de artillería','Superarma: silo nuclear'],
    builds:['planta','cuartel','fabrica','torre','astillero','superarma'], powers:['radar','reparacion','tropas','artilleria'], horde:true,
    unitMods:{ infanteria:{ cost:120 }, heroe:{ nombre:'Mariscal de Hierro', hp:1200, aura:true, rasgo:'Aura: +20 % de daño a aliados a 8 o menos' }, fragata:{ nombre:'Monitor fluvial', hp:950 } },
    buildMods:{ fabrica:{ produce:['tanque','pesado','antiaereo','helicoptero'] }, superarma:{ nombre:'Silo nuclear', superKind:'nuclear', superR:13, superDmg:2000 } } },
  guerrilla:{ nombre:'Red Guerrillera', lema:'Emboscada y movilidad', noPower:true, salvage:true,
    rasgos:['No necesita energía','Rebeldes camuflados mientras no disparan','Red de túneles: guarda y cura hasta 8 unidades','Recoge chatarra de vehículos destruidos','Técnico y artillería ligera','Poder exclusivo: sabotaje','Superarma: tormenta de cohetes'],
    builds:['cuartel','fabrica','torre','tunel','astillero','superarma'], powers:['radar','reparacion','tropas','sabotaje'], horde:false,
    unitMods:{ infanteria:{ nombre:'Rebelde', cost:110, hp:100, stealth:true }, heroe:{ nombre:'Jefe rebelde', stealth:true, capture:true, rasgo:'Camuflado y captura pozos' }, lancha:{ nombre:'Lancha rápida', cost:400, speed:7 } },
    buildMods:{ fabrica:{ produce:['tecnico','artilleria','antiaereo'] }, superarma:{ nombre:'Tormenta de cohetes', superKind:'cohetes', power:0 } } }
};
const DMG = {
  rifle:{ inf:1, veh:0.3, bld:0.25, air:0.15, nav:0.3 }, canon:{ inf:0.45, veh:1, bld:1, air:0, nav:0.9 },
  torre:{ inf:0.9, veh:0.8, bld:0.5, air:0.6, nav:0.8 }, aa:{ inf:0.3, veh:0.25, bld:0.1, air:1, nav:0.3 },
  misil:{ inf:0.6, veh:1, bld:0.8, air:0, nav:1.1 }, obus:{ inf:1, veh:0.7, bld:1.2, air:0, nav:0.9 },
  cohete:{ inf:0.8, veh:1.1, bld:0.7, air:0, nav:1.0 }, heroe:{ inf:1.4, veh:0.8, bld:0.9, air:0.5, nav:0.5 },
  ametralla:{ inf:1, veh:0.5, bld:0.3, air:0.5, nav:0.8 }, canonaval:{ inf:0.7, veh:1, bld:1.2, air:0, nav:1 }
};
const POWERS = {
  radar:     { nombre:'Barrido de radar', cd:60, r:14, desc:'Revela una zona durante 12 s' },
  reparacion:{ nombre:'Reparación de campo', cd:90, r:10, desc:'Recupera 35 % de vida en el área' },
  tropas:    { nombre:'Lanzamiento de tropas', cd:150, r:3, desc:'5 infantes en un punto explorado, tras 3 s' },
  artilleria:{ nombre:'Bombardeo de artillería', cd:120, r:9, desc:'3 oleadas de proyectiles tras 4 s' },
  precision: { nombre:'Ataque de precisión', cd:110, r:4.5, desc:'Impacto de 450 de daño tras 2 s' },
  sabotaje:  { nombre:'Sabotaje', cd:100, r:7, desc:'Detiene los edificios enemigos del área durante 25 s' }
};
// Cada nodo es un poder (se usa desde el panel) o una mejora pasiva. Un nodo requiere el anterior de su rama.
// Efectos pasivos: dmg (daño por categoría del atacante), hp (vida por categoría), cost (costo), prod (producción),
// build (construcción), income (ingresos), sight (visión), speed (velocidad), ammo (munición aérea).
const TREES = {
  atlas: [
    { rama:'Inteligencia', nodos:[ { id:'radar', poder:true }, { id:'sensores', nombre:'Sensores avanzados', desc:'+3 de visión para unidades y edificios', fx:{ sight:3 } }, { id:'precision', poder:true } ] },
    { rama:'Aviación', nodos:[ { id:'pilotos', nombre:'Pilotos veteranos', desc:'+1 misil por avión', fx:{ ammo:1 } }, { id:'fuselaje', nombre:'Fuselaje reforzado', desc:'+30 % de vida aérea', fx:{ hp:{ air:0.3 } } }, { id:'tropas', poder:true } ] },
    { rama:'Logística', nodos:[ { id:'reparacion', poder:true }, { id:'contratos', nombre:'Contratos de defensa', desc:'Unidades 10 % más baratas', fx:{ cost:-0.1 } }, { id:'fabricacion', nombre:'Fabricación ágil', desc:'+20 % de velocidad de producción', fx:{ prod:0.2 } } ] }
  ],
  hierro: [
    { rama:'Artillería', nodos:[ { id:'artilleria', poder:true }, { id:'proyectiles', nombre:'Proyectiles perforantes', desc:'+15 % de daño de vehículos', fx:{ dmg:{ veh:0.15 } } }, { id:'radar', poder:true } ] },
    { rama:'Blindaje', nodos:[ { id:'acero', nombre:'Acero templado', desc:'+20 % de vida de vehículos', fx:{ hp:{ veh:0.2 } } }, { id:'reparacion', poder:true }, { id:'ingenieria', nombre:'Ingeniería de campaña', desc:'+30 % de velocidad de construcción', fx:{ build:0.3 } } ] },
    { rama:'Masa', nodos:[ { id:'reclutas', nombre:'Leva masiva', desc:'Infantería 15 % más barata', fx:{ cost:-0.15, solo:'inf' } }, { id:'tropas', poder:true }, { id:'moral', nombre:'Moral de hierro', desc:'+15 % de daño de infantería', fx:{ dmg:{ inf:0.15 } } } ] }
  ],
  guerrilla: [
    { rama:'Sombra', nodos:[ { id:'radar', poder:true }, { id:'emboscada', nombre:'Emboscada', desc:'+20 % de daño de infantería', fx:{ dmg:{ inf:0.2 } } }, { id:'sabotaje', poder:true } ] },
    { rama:'Saqueo', nodos:[ { id:'chatarreros', nombre:'Chatarreros', desc:'+25 % de ingresos', fx:{ income:0.25 } }, { id:'tropas', poder:true }, { id:'mercado', nombre:'Mercado negro', desc:'Unidades 10 % más baratas', fx:{ cost:-0.1 } } ] },
    { rama:'Resistencia', nodos:[ { id:'reparacion', poder:true }, { id:'trincheras', nombre:'Trincheras', desc:'+25 % de vida de edificios', fx:{ hp:{ bld:0.25 } } }, { id:'motores', nombre:'Motores trucados', desc:'+15 % de velocidad', fx:{ speed:0.15 } } ] }
  ]
};
function treeNode(f, id){
  for(const br of TREES[f]) for(let i=0; i<br.nodos.length; i++) if(br.nodos[i].id===id) return { node:br.nodos[i], prev: i ? br.nodos[i-1].id : null, rama:br.rama, nivel:i+1 };
  return null;
}
const unitCat = (p, type) => UT(p,type).armor;   // 'inf' | 'veh' | 'air'
// Aplica una mejora pasiva. Las tablas de unidades y edificios son copias por jugador: se pueden modificar.
function applyNodeFx(p, fx){
  const pl = S.players[p], tab = S.tab[p], m = pl.mods;
  if(fx.dmg) for(const k in fx.dmg) m.dmg[k] = (m.dmg[k]||0) + fx.dmg[k];
  if(fx.prod) m.prod += fx.prod;
  if(fx.build) m.build += fx.build;
  if(fx.income) m.income += fx.income;
  for(const k in tab.u){
    const u = tab.u[k];
    if(fx.cost && (!fx.solo || u.armor===fx.solo) && u.weapon) u.cost = Math.round(u.cost*(1+fx.cost)/10)*10;
    if(fx.sight) u.sight += fx.sight;
    if(fx.speed) u.speed = u.speed*(1+fx.speed);
    if(fx.ammo && u.ammo) u.ammo += fx.ammo;
    if(fx.hp && fx.hp[u.armor]) u.hp = Math.round(u.hp*(1+fx.hp[u.armor]));
  }
  for(const k in tab.b){ const b = tab.b[k]; if(fx.sight) b.sight += fx.sight; if(fx.hp && fx.hp.bld) b.hp = Math.round(b.hp*(1+fx.hp.bld)); }
  // las unidades y edificios existentes también reciben la mejora de vida
  if(fx.hp) for(const e of S.ents){
    if(e.dead || e.owner!==p) continue;
    const cat = e.kind==='bld' ? 'bld' : e.kind==='unit' ? unitCat(p,e.type) : null;
    const k = cat && fx.hp[cat]; if(!k) continue;
    e.maxhp = Math.round(e.maxhp*(1+k)); e.hp = Math.min(e.maxhp, e.hp*(1+k));
  }
}
const incomeMult = p => (1 + S.players[p].mods.income) * S.bonus[p];
const RANK_XP = [0, 2500, 6000, 11000, 18000];   // umbral para pasar del rango i al i+1; cada ascenso da 1 punto
const VET_KILLS = [2, 5, 9];
// Zonas reservadas para las bases (no se pinta terreno en ellas). Celdas [x0, z0, x1, z1] inclusivas.
const BASE_ZONES = [[0,44,15,63], [48,0,63,19]];
const inBaseZone = (x,z) => BASE_ZONES.some(([a,b,c,d]) => x>=a && x<=c && z>=b && z<=d);
const MAP_FORMAT = 'frente-arido-mapa';
// Valida un mapa del editor. Devuelve un mensaje de error o null.
function mapError(m){
  if(!m || m.formato!==MAP_FORMAT) return 'No es un mapa de Frente Árido';
  if(m.grid!==GRID || typeof m.terrain!=='string' || m.terrain.length!==NCELLS || /[^.rw]/.test(m.terrain)) return 'Terreno inválido';
  if(!Array.isArray(m.depots) || !Array.isArray(m.wells) || m.depots.length>24 || m.wells.length>16) return 'Recursos inválidos';
  const okCell = (x,z,n) => Number.isInteger(x) && Number.isInteger(z) && x>=0 && z>=0 && x+n<=GRID && z+n<=GRID;
  for(const d of m.depots) if(!Array.isArray(d) || !okCell(d[0],d[1],2) || !(d[2]>=500 && d[2]<=20000)) return 'Depósito inválido';
  for(const w of m.wells) if(!Array.isArray(w) || !okCell(w[0],w[1],2)) return 'Pozo inválido';
  return null;
}

const S = {};
const idx = (cx,cz) => cz*GRID + cx;
const inB = (cx,cz) => cx>=0 && cz>=0 && cx<GRID && cz<GRID;
const toCell = v => Math.max(0, Math.min(GRID-1, Math.floor(v/CELL)));
const cellCenter = c => c*CELL + CELL/2;
let NAV = false;   // modo naval: las celdas transitables son las de agua
const isFree = (cx,cz) => inB(cx,cz) && (NAV ? S.water[idx(cx,cz)]===1 : !S.blocked[idx(cx,cz)]);
function naval(fn){ const prev = NAV; NAV = true; try { return fn(); } finally { NAV = prev; } }
const cellOf = e => idx(toCell(e.x), toCell(e.z));
function buildTables(f){
  const F = FACTIONS[f], u = {}, b = {};
  for(const k in UNIT_TYPES) u[k] = Object.assign({}, UNIT_TYPES[k], F.unitMods[k]);
  for(const k in BUILD_TYPES) b[k] = Object.assign({}, BUILD_TYPES[k], F.buildMods[k]);
  return { u, b };
}
const UT = (p,t) => p>=0 ? S.tab[p].u[t] : UNIT_TYPES[t];
const BT = (p,t) => p>=0 ? S.tab[p].b[t] : BUILD_TYPES[t];

function register(e){ S.ents.push(e); S.byId.set(e.id, e); hooks.spawn(e); }
function markArea(cx,cz,n,v){ for(let z=cz; z<cz+n; z++) for(let x=cx; x<cx+n; x++) if(inB(x,z)) S.blocked[idx(x,z)] = v; }

function addBuilding(type, owner, cx, cz, built=true){
  const t = BT(owner,type), n = t.size;
  const e = { id:S.nextId++, kind:'bld', type, owner, cx, cz, n, x:(cx+n/2)*CELL, z:(cz+n/2)*CELL,
              hp:built ? t.hp : Math.max(1, Math.round(t.hp*0.1)), maxhp:t.hp, built, bprog:built?1:0,
              queue:[], prog:0, rally:null, radius:n*CELL/2, cd:0, target:null, seen:0 };
  e.px = e.x; e.pz = e.z; markArea(cx,cz,n,1); register(e); return e;
}
function addDepot(cx, cz, amount){
  const n = 2;
  const e = { id:S.nextId++, kind:'depot', type:'deposito', owner:-1, cx, cz, n, x:(cx+1)*CELL, z:(cz+1)*CELL,
              amount, max:amount, radius:CELL, hp:1, maxhp:1 };
  e.px = e.x; e.pz = e.z; markArea(cx,cz,n,1); register(e); return e;
}
function addUnit(type, owner, x, z){
  const t = UT(owner,type);
  const e = { id:S.nextId++, kind:'unit', type, owner, x, z, px:x, pz:z, hp:t.hp, maxhp:t.hp, radius:t.size, air:!!t.air,
              path:null, pi:0, order:null, target:null, mode:null, cd:0, repath:0, working:null,
              carry:0, hstate:null, htimer:0, depot:null, kills:0, vet:0, ammo:t.ammo||0, astate:null, reload:0, capT:0 };
  register(e); return e;
}
function kill(e){ if(e.dead) return; e.dead = true; hooks.death(e); }
function cleanup(){
  let any = false;
  for(const e of S.ents) if(e.dead || e.tunneled){
    any = true; S.byId.delete(e.id);
    if(e.dead && (e.kind==='bld' || e.kind==='depot')) markArea(e.cx,e.cz,e.n,0);
    hooks.remove(e);
  }
  if(any) S.ents = S.ents.filter(e => !e.dead && !e.tunneled);
}
function addCrate(x, z){
  const e = { id:S.nextId++, kind:'crate', type:'chatarra', owner:-1, x, z, px:x, pz:z, hp:1, maxhp:1, until:S.tick + 60*TICK_HZ };
  register(e); return e;
}

// ---------- Búsqueda de caminos (A* sobre grilla, 8 direcciones) ----------
class Heap{
  constructor(){ this.n=[]; this.f=[]; }
  get size(){ return this.n.length; }
  clear(){ this.n.length=0; this.f.length=0; }
  push(node,f){ const n=this.n, fa=this.f; let i=n.length; n.push(node); fa.push(f);
    while(i>0){ const p=(i-1)>>1; if(fa[p]<=f) break; n[i]=n[p]; fa[i]=fa[p]; i=p; } n[i]=node; fa[i]=f; }
  pop(){ const n=this.n, fa=this.f; const top=n[0]; const ln=n.pop(), lf=fa.pop();
    if(n.length){ let i=0; const len=n.length;
      while(true){ const l=2*i+1, r=l+1; let m=i, mf=lf;
        if(l<len && fa[l]<mf){ m=l; mf=fa[l]; } if(r<len && fa[r]<mf){ m=r; mf=fa[r]; }
        if(m===i) break; n[i]=n[m]; fa[i]=fa[m]; i=m; }
      n[i]=ln; fa[i]=lf; }
    return top; }
}
const gScore = new Float32Array(NCELLS), came = new Int32Array(NCELLS), openStamp = new Uint32Array(NCELLS), closedStamp = new Uint32Array(NCELLS);
let gen = 0; const heap = new Heap();
const DIRS = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
function octile(ax,az,bx,bz){ const dx=Math.abs(ax-bx), dz=Math.abs(az-bz); return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz); }
function losLine(ax,az,bx,bz){
  const d = hyp(bx-ax, bz-az), steps = Math.ceil(d/(CELL*0.35));
  for(let k=0; k<=steps; k++){ const t = steps ? k/steps : 0; if(!isFree(toCell(ax+(bx-ax)*t), toCell(az+(bz-az)*t))) return false; }
  return true;
}
function los(ax,az,bx,bz){
  const d = hyp(bx-ax, bz-az); if(d < 1e-6) return isFree(toCell(ax),toCell(az));
  const ox = -(bz-az)/d*0.6, oz = (bx-ax)/d*0.6;
  return losLine(ax,az,bx,bz) && losLine(ax+ox,az+oz,bx+ox,bz+oz) && losLine(ax-ox,az-oz,bx-ox,bz-oz);
}
function nearestFree(cx,cz,maxR=12){
  for(let r=0; r<=maxR; r++){ let best=null, bd=1e9;
    for(let dz=-r; dz<=r; dz++) for(let dx=-r; dx<=r; dx++){
      if(Math.max(Math.abs(dx),Math.abs(dz)) !== r) continue;
      if(isFree(cx+dx,cz+dz)){ const d=dx*dx+dz*dz; if(d<bd){ bd=d; best=[cx+dx,cz+dz]; } } }
    if(best) return best; }
  return null;
}
function goalCells(gx,gz,count){
  const cx=toCell(gx), cz=toCell(gz), res=[];
  for(let r=0; r<=16 && res.length<count; r++){ const ring=[];
    for(let dz=-r; dz<=r; dz++) for(let dx=-r; dx<=r; dx++){
      if(Math.max(Math.abs(dx),Math.abs(dz)) !== r) continue;
      if(isFree(cx+dx,cz+dz)) ring.push({ x:cx+dx, z:cz+dz, d:dx*dx+dz*dz }); }
    ring.sort((a,b)=>a.d-b.d || a.x-b.x || a.z-b.z); res.push(...ring); }
  return res.slice(0,count).map(c => ({ x:cellCenter(c.x), z:cellCenter(c.z) }));
}
function adjacentTarget(e, from){
  let best=null, bd=1e9;
  for(let z=e.cz-1; z<=e.cz+e.n; z++) for(let x=e.cx-1; x<=e.cx+e.n; x++){
    if(x>=e.cx && x<e.cx+e.n && z>=e.cz && z<e.cz+e.n) continue;
    if(!isFree(x,z)) continue;
    const px=cellCenter(x), pz=cellCenter(z), ddx=px-from.x, ddz=pz-from.z, d=ddx*ddx+ddz*ddz;
    if(d<bd){ bd=d; best={ x:px, z:pz }; } }
  if(!best){ const f=nearestFree(e.cx,e.cz,8); best = f ? { x:cellCenter(f[0]), z:cellCenter(f[1]) } : { x:e.x, z:e.z }; }
  return best;
}
function findPath(sx,sz,gx,gz){
  let scx=toCell(sx), scz=toCell(sz), gcx=toCell(gx), gcz=toCell(gz), exact=true;
  if(!isFree(gcx,gcz)){ const f=nearestFree(gcx,gcz,12); if(!f) return null; gcx=f[0]; gcz=f[1]; exact=false; }
  if(!isFree(scx,scz)){ const f=nearestFree(scx,scz,6); if(f){ scx=f[0]; scz=f[1]; } }
  const goal = exact ? { x:gx, z:gz } : { x:cellCenter(gcx), z:cellCenter(gcz) };
  if((scx===gcx && scz===gcz) || los(sx,sz,goal.x,goal.z)) return [goal];
  gen++; heap.clear();
  const s=idx(scx,scz), g=idx(gcx,gcz);
  openStamp[s]=gen; gScore[s]=0; came[s]=-1; heap.push(s, octile(scx,scz,gcx,gcz));
  let best=s, bestH=Infinity, iter=0, found=false;
  while(heap.size && iter<6000){
    iter++; const cur=heap.pop(); if(closedStamp[cur]===gen) continue; closedStamp[cur]=gen;
    if(cur===g){ found=true; break; }
    const cx=cur%GRID, cz=(cur/GRID)|0, h=octile(cx,cz,gcx,gcz);
    if(h<bestH){ bestH=h; best=cur; }
    for(const [dx,dz,c] of DIRS){
      const nx=cx+dx, nz=cz+dz; if(!isFree(nx,nz)) continue;
      if(dx && dz && (!isFree(cx+dx,cz) || !isFree(cx,cz+dz))) continue;
      const ni=idx(nx,nz); if(closedStamp[ni]===gen) continue;
      const ng=gScore[cur]+c;
      if(openStamp[ni]!==gen || ng<gScore[ni]){ openStamp[ni]=gen; gScore[ni]=ng; came[ni]=cur; heap.push(ni, ng+octile(nx,nz,gcx,gcz)); } }
  }
  const cells=[]; for(let c=found?g:best; c!==-1; c=came[c]) cells.push(c); cells.reverse();
  const pts = cells.map(c => ({ x:cellCenter(c%GRID), z:cellCenter((c/GRID)|0) }));
  if(found) pts[pts.length-1] = goal;
  const out=[]; let ax=sx, az=sz, i=0;
  while(i<pts.length){ let j=i; while(j+1<pts.length && los(ax,az,pts[j+1].x,pts[j+1].z)) j++; out.push(pts[j]); ax=pts[j].x; az=pts[j].z; i=j+1; }
  return out.length ? out : null;
}
function stepMove(u, speed){
  if(!u.path) return true;
  const wp=u.path[u.pi], dx=wp.x-u.x, dz=wp.z-u.z, d=hyp(dx,dz), step=speed*DT;
  const last = u.pi===u.path.length-1;
  if(u.lastD!==undefined && u.lastD-d < step*0.3) u.stuck=(u.stuck||0)+1; else u.stuck=0;
  u.lastD = d;
  if(u.stuck > TICK_HZ*2){ u.stuck=0; u.lastD=undefined; const goal=u.path[u.path.length-1];
    if(hyp(goal.x-u.x, goal.z-u.z) < 4.5){ u.path=null; return true; } u.path=findPath(u.x,u.z,goal.x,goal.z); u.pi=0; return !u.path; }
  if(d<=step || (last && d<0.3)){ if(d<=step){ u.x=wp.x; u.z=wp.z; } u.pi++; u.lastD=undefined;
    if(u.pi>=u.path.length){ u.path=null; return true; } }
  else { u.x+=dx/d*step; u.z+=dz/d*step; }
  return false;
}
function flyTo(u, x, z, speed){
  const dx=x-u.x, dz=z-u.z, d=hyp(dx,dz), step=speed*DT;
  if(d<=step){ u.x=x; u.z=z; return true; }
  u.x+=dx/d*step; u.z+=dz/d*step; return false;
}

// ---------- Visión y niebla de guerra ----------
function markCircle(vis, exp, x, z, sight){
  const r=sight/CELL, R=Math.ceil(r), r2=r*r, cx=toCell(x), cz=toCell(z);
  for(let dz=-R; dz<=R; dz++) for(let dx=-R; dx<=R; dx++){
    if(dx*dx+dz*dz>r2) continue; const xx=cx+dx, zz=cz+dz; if(!inB(xx,zz)) continue; const i=idx(xx,zz); vis[i]=1; exp[i]=1; }
}
function updateVision(){
  if(S.reveals.length) S.reveals = S.reveals.filter(r => r.until > S.tick);
  for(const p of [0,1]){
    const vis=S.vis[p], exp=S.exp[p]; vis.fill(0);
    for(const e of S.ents){
      if(e.dead || e.owner!==p || e.kind==='depot') continue;
      markCircle(vis, exp, e.x, e.z, e.kind==='unit' ? UT(p,e.type).sight : BT(p,e.type).sight);
    }
    for(const r of S.reveals) if(r.p===p) markCircle(vis, exp, r.x, r.z, r.r);
    for(const e of S.ents){
      if(e.dead || e.kind!=='bld' || e.owner===p || (e.seen & (1<<p))) continue;
      outer: for(let z=e.cz; z<e.cz+e.n; z++) for(let x=e.cx; x<e.cx+e.n; x++) if(vis[idx(x,z)]){ e.seen |= (1<<p); break outer; }
    }
  }
}

// ---------- Energía ----------
function powerOf(p){
  if(FACTIONS[S.players[p].faction].noPower) return { prod:0, cons:0, low:false, none:true };
  let prod=0, cons=0;
  for(const e of S.ents){ if(e.kind!=='bld' || e.dead || e.owner!==p || !e.built) continue; const w=BT(p,e.type).power; if(w>0) prod+=w; else cons-=w; }
  return { prod, cons, low:cons>prod };
}

// ---------- Construcción ----------
function canPlace(p, type, cx, cz, margin){
  const n=BT(p,type).size, exp=S.exp[p];
  if(BT(p,type).naval){
    let water = 0;
    for(let z=cz-1; z<=cz+n; z++) for(let x=cx-1; x<=cx+n; x++){
      const inside = x>=cx && x<cx+n && z>=cz && z<cz+n;
      if(inside){ if(!isFree(x,z) || !exp[idx(x,z)]) return false; }
      else if(inB(x,z) && S.water[idx(x,z)]) water++;
    }
    return water >= 3;
  }
  for(let z=cz-margin; z<cz+n+margin; z++) for(let x=cx-margin; x<cx+n+margin; x++){
    const inside = x>=cx && x<cx+n && z>=cz && z<cz+n;
    if(inside){ if(!isFree(x,z) || !exp[idx(x,z)]) return false; }
    else if(inB(x,z) && S.blocked[idx(x,z)]) return false;
  }
  return true;
}
function rectDist(a, b){ const h=b.n*CELL/2; return hyp(Math.max(0, Math.abs(a.x-b.x)-h), Math.max(0, Math.abs(a.z-b.z)-h)); }
function builderTick(u, t){
  const o = u.order; u.working = null; if(!o) return;
  if(o.type==='move'){
    if(!u.path){ u.path=findPath(u.x,u.z,o.x,o.z); u.pi=0; }
    if(!u.path || stepMove(u,t.speed)) u.order=null;
    return;
  }
  if(o.type!=='build') return;
  const b = S.byId.get(o.id);
  if(!b || b.dead || b.owner!==u.owner || (b.built && b.hp>=b.maxhp)){ u.order=null; u.path=null; return; }
  if(rectDist(u,b) <= CELL*1.05){
    u.path=null; u.working=b.id;
    if(!b.built){
      const inc = DT/BT(b.owner,b.type).time * (1 + S.players[b.owner].mods.build);
      b.bprog = Math.min(1, b.bprog+inc); b.hp = Math.min(b.maxhp, b.hp + b.maxhp*0.9*inc);
      if(b.bprog>=1){ b.built=true; const bb=BT(b.owner,b.type); if(bb.superCd) b.readyAt = S.tick + bb.superCd*TICK_HZ; hooks.built(b); }
    } else b.hp = Math.min(b.maxhp, b.hp + b.maxhp*0.04*DT);
    return;
  }
  if(!u.path){ const p=adjacentTarget(b,u); u.path=findPath(u.x,u.z,p.x,p.z); u.pi=0; if(!u.path){ u.order=null; return; } }
  if(stepMove(u,t.speed) && rectDist(u,b) > CELL*1.05) u.path=null;
}

// ---------- Combate ----------
function distTo(a,b){ return b.kind==='unit' ? hyp(a.x-b.x, a.z-b.z) : rectDist(a,b); }
function armorOf(e){ return e.kind==='bld' ? 'bld' : UT(e.owner,e.type).armor; }
const canHit = (weapon, e) => DMG[weapon][armorOf(e)] > 0;
// Camuflaje: unidades con 'stealth' quedan ocultas si no dispararon en 3 s y no están capturando
function stealthed(e){
  if(e.kind!=='unit' || !UT(e.owner,e.type).stealth) return false;
  if(e.order && e.order.type==='capture' && e.capT>0) return false;
  return S.tick - (e.lastFire===undefined ? -1e9 : e.lastFire) > 3*TICK_HZ;
}
// Detecta: cualquier unidad a 4 o menos, o una defensa a 8 o menos
function detectedBy(e, p, peek){
  if(!peek){ if(!e.det) e.det = [-1,-1,false,false]; if(e.det[p]===S.tick) return e.det[p+2]; }
  let v = false;
  for(const o of S.ents){
    if(o.dead || o.owner!==p) continue;
    if(o.kind==='unit'){ if(hyp(o.x-e.x, o.z-e.z) <= 4){ v = true; break; } }
    else if(o.kind==='bld' && o.built && BT(p,o.type).weapon && rectDist(e,o) <= 8){ v = true; break; }
  }
  if(!peek){ e.det[p] = S.tick; e.det[p+2] = v; }
  return v;
}
const targetable = (p, e) => !stealthed(e) || detectedBy(e, p);
function findTarget(u, radius, weapon){
  const ut = u.kind==='unit' ? UT(u.owner,u.type) : null, minR = ut && ut.minRange ? ut.minRange : 0, vis = S.vis[u.owner];
  let best=null, bs=1e9;
  for(const e of S.ents){
    if(e.dead || e.owner<0 || e.owner===u.owner || e.kind==='depot' || e.kind==='crate' || !canHit(weapon,e)) continue;
    const d=distTo(u,e); if(d>radius || d<minR) continue;
    if(minR && !vis[cellOf(e)]) continue;                 // la artillería necesita visión aliada del objetivo
    if(!targetable(u.owner, e)) continue;
    const s=d + (e.kind==='bld'?(e.type==='torre'||e.type==='tunel'?2:6):0) + (e.kind==='unit' && !UT(e.owner,e.type).weapon ? 2 : 0);
    if(s<bs){ bs=s; best=e; } }
  return best;
}
function curTarget(u){
  if(u.order && (u.order.type==='attack' || u.order.type==='capture')) return S.byId.get(u.order.id) || null;
  return u.target!=null ? (S.byId.get(u.target) || null) : null;
}
function addXp(p, v){
  const pl = S.players[p]; pl.xp += v;
  while(pl.rank < RANK_XP.length && pl.xp >= RANK_XP[pl.rank]){ pl.rank++; pl.cp++; hooks.rankUp(p, pl.rank); }
}
// Destrucción: los pozos no se destruyen, vuelven a ser neutrales
function onDestroyed(tg, by){
  if(tg.type==='pozo'){ tg.owner=-1; tg.hp=tg.maxhp; tg.target=null; hooks.captured(tg); return false; }
  kill(tg);
  if(tg.kind==='unit' && UT(tg.owner,tg.type).hero) hooks.heroDown(tg);
  if(tg.kind==='unit' && !tg.air && UT(tg.owner,tg.type).armor==='veh' && S.players.some(pl => FACTIONS[pl.faction].salvage)) addCrate(tg.x, tg.z);
  if(by>=0 && by!==tg.owner){
    S.players[by].kills++;
    if(tg.kind==='unit' && UT(tg.owner,tg.type).naval) S.players[by].navKills++;
    addXp(by, tg.kind==='unit' ? UT(tg.owner,tg.type).cost : Math.max(400, BT(tg.owner,tg.type).cost || 1500));
  }
  return true;
}
function damage(src, tg, base, weapon, mult){
  tg.hp -= base * DMG[weapon][armorOf(tg)] * mult;
  hooks.shot(src, tg, weapon);
  return tg.hp<=0 && !tg.dead ? onDestroyed(tg, src.owner) : false;
}
// peek=true: consulta desde la interfaz, sin escribir la caché (evita desincronizar entre clientes)
function hordeActive(u, peek){
  if(!FACTIONS[S.players[u.owner].faction].horde || u.air) return false;
  if(!peek && u.hordeTick === S.tick) return u.horde;
  let n=0;
  for(const e of S.ents){ if(e===u || e.dead || e.kind!=='unit' || e.owner!==u.owner || e.air || !UT(e.owner,e.type).weapon) continue; if(hyp(e.x-u.x,e.z-u.z) <= 7) n++; if(n>=4) break; }
  if(!peek){ u.horde = n>=4; u.hordeTick = S.tick; }
  return n>=4;
}
function auraBoost(u){
  const hid = S.heroes[u.owner]; if(hid==null || hid===u.id) return false;
  const h = S.byId.get(hid); if(!h || h.dead || !UT(h.owner,h.type).aura) return false;
  return hyp(h.x-u.x, h.z-u.z) <= 8;
}
function heroCount(p){
  let n = S.players[p].tunnel.filter(u => UT(p,u.type).hero).length;
  for(const e of S.ents){ if(e.dead || e.owner!==p) continue; if(e.kind==='unit' && UT(p,e.type).hero) n++; else if(e.kind==='bld') n += e.queue.filter(q => q==='heroe').length; }
  return n;
}
function fire(u, tg, t){
  u.cd = t.cd; u.lastFire = S.tick;
  const mult = (1+0.25*u.vet) * (hordeActive(u) ? 1.25 : 1) * (auraBoost(u) ? 1.2 : 1) * (1 + (S.players[u.owner].mods.dmg[t.armor]||0));
  if(t.splash) splash(u, tg, t, mult);
  if(damage(u, tg, t.dmg, t.weapon, mult) && tg.kind==='unit'){
    u.kills++;
    if(u.vet<3 && u.kills>=VET_KILLS[u.vet]){ u.vet++; const base=t.hp; u.maxhp=Math.round(base*(1+0.2*u.vet)); u.hp=Math.min(u.maxhp, u.hp+base*0.3); }
  }
}
function splash(u, tg, t, mult){
  for(const e of S.ents){
    if(e===tg || e.dead || e.owner<0 || e.owner===u.owner || e.air || e.kind==='depot' || e.kind==='crate') continue;
    if(distTo(tg, e) > t.splash) continue;
    e.hp -= t.dmg * 0.5 * DMG[t.weapon][armorOf(e)] * mult;
    if(e.hp<=0) onDestroyed(e, u.owner);
  }
}
function capturable(u, b){
  if(!b || b.dead || b.kind!=='bld' || b.owner===u.owner) return false;
  const ut = UT(u.owner,u.type);
  if(b.type==='pozo') return !!(ut.capture || ut.engineer);
  return !!ut.engineer && b.owner>=0 && b.type!=='centro' && b.built;
}
const captureTime = (u, b) => b.type==='pozo' ? (UT(u.owner,u.type).engineer ? 2 : 4) : 6;
function transferBuilding(b, p){
  const was = b.owner;
  b.owner = p; b.target = null; b.queue = []; b.prog = 0; b.rally = null; b.seen = 0;
  if(b.type==='pozo') b.hp = b.maxhp;
  hooks.captured(b, was);
}
function captureTick(u, t){
  const b = S.byId.get(u.order.id);
  if(!capturable(u,b)){ u.order=null; u.path=null; u.capT=0; return; }
  if(rectDist(u,b) <= CELL*1.05){
    u.path=null; u.capT += DT;
    if(u.capT >= captureTime(u,b)){ transferBuilding(b, u.owner); u.capT=0; u.order=null; }
    return;
  }
  u.capT = 0;
  if(!u.path){ const p=adjacentTarget(b,u); u.path=findPath(u.x,u.z,p.x,p.z); u.pi=0; if(!u.path){ u.order=null; return; } }
  if(stepMove(u,t.speed) && rectDist(u,b) > CELL*1.05) u.path=null;
}
function engineerTick(u, t){
  const o = u.order; if(!o) return;
  if(o.type==='capture'){ captureTick(u,t); return; }
  if(o.type==='move'){ if(!u.path){ u.path=findPath(u.x,u.z,o.x,o.z); u.pi=0; } if(!u.path || stepMove(u,t.speed)) u.order=null; }
}
// Túneles: la unidad camina hasta el túnel y sale del mapa; queda en la red del jugador
function enterTick(u, t){
  const b = S.byId.get(u.order.id), pl = S.players[u.owner];
  if(!b || b.dead || b.owner!==u.owner || b.type!=='tunel' || !b.built || pl.tunnel.length>=8){ u.order=null; u.path=null; return; }
  if(rectDist(u,b) <= CELL*1.05){
    u.order=null; u.path=null; u.target=null; u.mode=null; u.tunneled=true; pl.tunnel.push(u); hooks.tunnel(u, b, 'in'); return;
  }
  if(!u.path){ const p=adjacentTarget(b,u); u.path=findPath(u.x,u.z,p.x,p.z); u.pi=0; if(!u.path){ u.order=null; return; } }
  if(stepMove(u,t.speed) && rectDist(u,b) > CELL*1.05) u.path=null;
}
function exitTunnel(p, b){
  const pl = S.players[p]; if(!pl.tunnel.length) return;
  const list = pl.tunnel; pl.tunnel = [];
  const cells = goalCells(b.x, b.z, list.length);
  list.forEach((u,i) => {
    const g = cells[i] || { x:b.x, z:b.z+CELL };
    u.tunneled = false; u.x = u.px = g.x; u.z = u.pz = g.z;
    u.order = null; u.path = null; u.target = null; u.mode = null; u.lastD = undefined; u.stuck = 0;
    register(u);
  });
  hooks.tunnel(null, b, 'out');
}
function nearestAirfield(u){
  let best=null, bd=1e9;
  for(const e of S.ents){ if(e.kind!=='bld'||e.dead||!e.built||e.owner!==u.owner||e.type!=='aerodromo') continue; const d=hyp(e.x-u.x,e.z-u.z); if(d<bd){ bd=d; best=e; } }
  return best;
}
// Aviones: vuelan en línea recta, gastan munición y vuelven al aeródromo a rearmarse
function heliTick(u, t){
  let tg = null;
  if(u.order && u.order.type==='attack'){
    tg = S.byId.get(u.order.id);
    if(!tg || tg.dead || tg.owner<0 || !canHit(t.weapon,tg) || !targetable(u.owner,tg)){ u.order=null; tg=null; }
  }
  if(!tg && (!u.order || u.order.type==='amove')){
    let cur = u.target!=null ? S.byId.get(u.target) : null;
    if(cur && (cur.dead || cur.owner<0 || distTo(u,cur)>t.sight+3 || !targetable(u.owner,cur))) cur=null;
    if(!cur && (S.tick+u.id)%4===0) cur = findTarget(u, t.sight, t.weapon);
    u.target = cur ? cur.id : null; tg = cur;
  }
  if(tg){ if(distTo(u,tg) <= t.range){ if(u.cd<=0) fire(u,tg,t); } else flyTo(u, clampW(tg.x), clampW(tg.z), t.speed); return; }
  if(u.order && (u.order.type==='move' || u.order.type==='amove')){ if(flyTo(u, clampW(u.order.x), clampW(u.order.z), t.speed)) u.order=null; }
}
function airTick(u, t){
  if(t.hover){ heliTick(u,t); return; }
  if(u.astate==='rtb'){
    const home = nearestAirfield(u);
    if(!home){ if(u.ammo<=0){ if(u.order && u.order.type!=='move') u.order=null; u.astate=null; } else u.astate=null; }
    else {
      if(flyTo(u, home.x, home.z, t.speed)){
        u.reload += DT;
        if(u.reload >= 3){ u.reload=0; u.ammo=t.ammo; u.hp=Math.min(u.maxhp, u.hp+u.maxhp*0.15); u.astate=null; }
      }
      return;
    }
  }
  let tg = null;
  if(u.order && u.order.type==='attack'){
    tg = S.byId.get(u.order.id);
    if(!tg || tg.dead || tg.owner<0 || !canHit(t.weapon,tg)){ u.order=null; tg=null; }
  }
  if(!tg && u.order && u.order.type==='amove'){
    let cur = u.target!=null ? S.byId.get(u.target) : null;
    if(cur && (cur.dead || distTo(u,cur)>t.sight+3)) cur=null;
    if(!cur && (S.tick+u.id)%4===0) cur = findTarget(u, t.sight, t.weapon);
    u.target = cur ? cur.id : null; tg = cur;
  }
  if(tg && u.ammo>0){
    if(distTo(u,tg) <= t.range){
      if(u.cd<=0){ fire(u,tg,t); u.ammo--; if(u.ammo<=0){ u.astate='rtb'; u.target=null; } }
      flyTo(u, tg.x, tg.z, t.speed*0.5);
    } else flyTo(u, tg.x, tg.z, t.speed);
    return;
  }
  if(tg && u.ammo<=0){ u.astate='rtb'; return; }
  if(u.order && (u.order.type==='move' || u.order.type==='amove')){ if(flyTo(u, u.order.x, u.order.z, t.speed)) u.order=null; return; }
  if(!u.order && u.ammo < t.ammo && nearestAirfield(u)) u.astate='rtb';
}
function unitTick(u){
  if(UT(u.owner,u.type).naval){ naval(() => unitTickInner(u)); return; }
  unitTickInner(u);
}
function unitTickInner(u){
  const t = UT(u.owner,u.type);
  if(u.cd>0) u.cd -= DT;
  if(t.regen && u.hp < u.maxhp) u.hp = Math.min(u.maxhp, u.hp + u.maxhp*t.regen*DT);
  if(t.air){ airTick(u,t); return; }
  if(u.order && u.order.type==='enter'){ enterTick(u,t); return; }
  if(!t.weapon){ if(u.type==='recolector') harvestTick(u,t); else if(t.engineer) engineerTick(u,t); else builderTick(u,t); return; }
  if(u.order && u.order.type==='capture'){ captureTick(u,t); return; }
  const reach = Math.max(t.sight, t.range);
  let tg = null;
  if(u.order && u.order.type==='attack'){
    tg = S.byId.get(u.order.id);
    if(!tg || tg.dead || tg.owner<0 || !canHit(t.weapon,tg) || !targetable(u.owner,tg)){ u.order=null; tg=null; u.path=null; u.mode=null; }
  }
  if(!tg && (!u.order || u.order.type==='amove')){
    let cur = u.target!=null ? S.byId.get(u.target) : null;
    if(cur && (cur.dead || cur.owner<0 || distTo(u,cur)>reach+3 || !targetable(u.owner,cur) || (t.minRange && distTo(u,cur)<t.minRange))) cur = null;
    if(!cur && (S.tick+u.id)%4===0) cur = findTarget(u, reach, t.weapon);
    u.target = cur ? cur.id : null; tg = cur;
  } else if(u.order && u.order.type==='move') u.target = null;

  if(tg){
    const d = distTo(u,tg);
    if(d <= t.range){
      u.path=null; u.mode='fire';
      if(t.minRange && d < t.minRange){ if(u.order && u.order.type==='attack') u.order=null; u.target=null; return; }
      if(u.cd<=0) fire(u,tg,t); return;
    }
    if(u.mode!=='chase' || !u.path || u.repath<=0){
      const p = tg.kind==='bld' ? adjacentTarget(tg,u) : { x:tg.x, z:tg.z };
      u.path = findPath(u.x,u.z,p.x,p.z); u.pi=0; u.repath=TICK_HZ; u.mode='chase';
    }
    u.repath--; if(u.path) stepMove(u, t.speed); return;
  }
  if(u.mode){ u.mode=null; u.path=null; }
  if(u.order && (u.order.type==='move' || u.order.type==='amove')){
    if(!u.path){ u.path=findPath(u.x,u.z,u.order.x,u.order.z); u.pi=0; if(!u.path){ u.order=null; return; } }
    if(stepMove(u, t.speed)) u.order = null;
  }
}

// ---------- Economía ----------
function nearestDepot(u){ let best=null, bd=1e9; for(const e of S.ents){ if(e.kind!=='depot'||e.dead||e.amount<=0) continue; const d=hyp(e.x-u.x,e.z-u.z); if(d<bd){ bd=d; best=e; } } return best; }
function nearestOwn(u, type){ let best=null, bd=1e9; for(const e of S.ents){ if(e.kind!=='bld'||e.dead||!e.built||e.owner!==u.owner||e.type!==type) continue; const d=hyp(e.x-u.x,e.z-u.z); if(d<bd){ bd=d; best=e; } } return best; }
function harvestTick(u, t){
  if(u.order && u.order.type==='move'){
    if(!u.path){ u.path=findPath(u.x,u.z,u.order.x,u.order.z); u.pi=0; }
    if(!u.path || stepMove(u,t.speed)){ u.order=null; u.hstate='hold'; }
    return;
  }
  if(!u.hstate) u.hstate = 'toDepot';
  switch(u.hstate){
    case 'toDepot': {
      let d = u.depot!=null ? S.byId.get(u.depot) : null;
      if(!d || d.dead || d.amount<=0){ d=nearestDepot(u); u.depot=d?d.id:null; u.path=null; if(!d){ u.hstate='idle'; return; } }
      if(hyp(d.x-u.x,d.z-u.z) <= CELL*2.4){ u.path=null; u.hstate='loading'; u.htimer=Math.round(2.5*TICK_HZ); break; }
      if(!u.path){ const p=adjacentTarget(d,u); u.path=findPath(u.x,u.z,p.x,p.z); u.pi=0; if(!u.path){ u.hstate='idle'; return; } }
      if(stepMove(u,t.speed) && hyp(d.x-u.x,d.z-u.z) > CELL*2.7) u.hstate='idle';
      break; }
    case 'loading': {
      const d = S.byId.get(u.depot);
      if(!d || d.dead){ u.hstate='toDepot'; break; }
      if(--u.htimer<=0){ const take=Math.min(t.carry, d.amount); d.amount-=take; u.carry+=take; if(d.amount<=0) kill(d); u.hstate='toBase'; u.path=null; }
      break; }
    case 'toBase': {
      const b = nearestOwn(u,'centro'); if(!b){ u.hstate='idle'; return; }
      if(hyp(b.x-u.x,b.z-u.z) <= b.radius+CELL*1.6){ S.players[u.owner].credits += Math.round(u.carry*incomeMult(u.owner)); u.carry=0; u.hstate='toDepot'; u.path=null; break; }
      if(!u.path){ const p=adjacentTarget(b,u); u.path=findPath(u.x,u.z,p.x,p.z); u.pi=0; if(!u.path){ u.hstate='idle'; return; } }
      stepMove(u,t.speed);
      break; }
    case 'idle':
      if((S.tick+u.id)%TICK_HZ===0) u.hstate = u.carry>0 ? 'toBase' : 'toDepot';
      break;
    case 'hold': break;
  }
}

// ---------- Edificios ----------
// Los edificios de producción curan a sus unidades cercanas: infantería en el cuartel, vehículos en la fábrica,
// aviones en el aeródromo, barcos en el astillero, recolectores y constructores en el centro de mando.
function healAround(b){
  const prod = BT(b.owner,b.type).produce; if(!prod || !prod.length || b.offUntil > S.tick) return;
  for(const u of S.ents){
    if(u.dead || u.kind!=='unit' || u.owner!==b.owner || u.hp>=u.maxhp || !prod.includes(u.type)) continue;
    if(rectDist(u,b) <= 4) u.hp = Math.min(u.maxhp, u.hp + u.maxhp*0.03);
  }
}
function bldTick(b){
  if(!b.built || b.owner<0) return;
  if((S.tick + b.id) % TICK_HZ === 0) healAround(b);
  const bt = BT(b.owner,b.type), low = S.power[b.owner].low;
  if(b.offUntil > S.tick){ if(bt.superCd) b.readyAt++; b.target = null; return; }   // saboteado
  if(bt.superCd){ if(low) b.readyAt++; return; }                                   // sin energía no carga
  if(bt.income){ if((S.tick+b.id) % (3*TICK_HZ) === 0) S.players[b.owner].credits += Math.round(bt.income*incomeMult(b.owner)); return; }
  if(bt.weapon){
    if(b.cd>0) b.cd -= DT;
    if(low){ b.target=null; return; }
    let tg = b.target!=null ? S.byId.get(b.target) : null;
    if(!tg || tg.dead || tg.owner<0 || distTo(b,tg)>bt.range){ tg = (S.tick+b.id)%3===0 ? findTarget(b, bt.range, bt.weapon) : null; b.target = tg ? tg.id : null; }
    if(tg && b.cd<=0){ b.cd = bt.cd; damage(b, tg, bt.dmg, bt.weapon, 1 + (S.players[b.owner].mods.dmg.bld||0)); }
    return;
  }
  if(!b.queue.length) return;
  b.prog += DT * (low ? 0.5 : 1) * (1 + S.players[b.owner].mods.prod);
  const type = b.queue[0], ut = UT(b.owner,type);
  if(b.prog >= ut.time){
    b.prog = 0; b.queue.shift();
    const c = ut.naval ? naval(() => adjacentTarget(b, b.rally || { x:WORLD/2, z:WORLD/2 })) : adjacentTarget(b, b.rally || { x:WORLD/2, z:WORLD/2 });
    const u = addUnit(type, b.owner, c.x, c.z);
    if(b.rally && ut.weapon) u.order = { type:'move', x:b.rally.x, z:b.rally.z };
  }
}

// ---------- Poderes de comandante ----------
const clampW = v => Math.max(2, Math.min(WORLD-2, v));
function powerReady(p, id){ const pl=S.players[p]; return !!pl.unlocked[id] && (pl.cool[id]||0) <= S.tick; }
function usePower(c){
  const pl = S.players[c.p], P = POWERS[c.power];
  if(!P || !treeNode(pl.faction, c.power) || !powerReady(c.p, c.power)) return;
  const x = clampW(c.x), z = clampW(c.z);
  if(c.power==='tropas' && !S.exp[c.p][idx(toCell(x),toCell(z))]) return;
  pl.cool[c.power] = S.tick + P.cd*TICK_HZ;
  switch(c.power){
    case 'radar': S.reveals.push({ p:c.p, x, z, r:P.r, until:S.tick+12*TICK_HZ }); break;
    case 'reparacion':
      for(const e of S.ents){ if(e.dead || e.owner!==c.p || e.kind==='depot') continue; if(distTo({x,z},e) <= P.r) e.hp = Math.min(e.maxhp, e.hp + e.maxhp*0.35); }
      break;
    case 'tropas': S.events.push({ at:S.tick+3*TICK_HZ, kind:'tropas', p:c.p, x, z }); break;
    case 'artilleria': for(let w=0; w<3; w++) S.events.push({ at:S.tick+(4+w)*TICK_HZ, kind:'artilleria', p:c.p, x, z }); break;
    case 'precision': S.events.push({ at:S.tick+2*TICK_HZ, kind:'precision', p:c.p, x, z }); break;
    case 'sabotaje':
      for(const e of S.ents){ if(e.dead || e.kind!=='bld' || e.owner<0 || e.owner===c.p || e.type==='pozo') continue; if(rectDist({x,z},e) <= P.r) e.offUntil = S.tick + 25*TICK_HZ; }
      break;
  }
  hooks.power(c.p, c.power, x, z);
}
function areaDamage(p, x, z, r, dmg, bldMult){
  for(const e of S.ents){
    if(e.dead || e.kind==='depot' || e.kind==='crate' || e.air) continue;
    const d = e.kind==='unit' ? hyp(e.x-x, e.z-z) : rectDist({x,z}, e);
    if(d > r) continue;
    const arm = armorOf(e), m = arm==='bld' ? (bldMult || 0.6) : arm==='veh' ? 0.85 : 1;
    e.hp -= dmg * (1 - 0.5*d/r) * m;
    if(e.hp<=0) onDestroyed(e, p);
  }
}
function processEvents(){
  if(!S.events.length) return;
  const due = S.events.filter(e => e.at <= S.tick); if(!due.length) return;
  S.events = S.events.filter(e => e.at > S.tick);
  for(const ev of due){
    if(ev.kind==='tropas'){ goalCells(ev.x, ev.z, 5).forEach(c => addUnit('infanteria', ev.p, c.x, c.z)); hooks.impact(ev.x, ev.z, 'tropas'); }
    else if(ev.kind==='artilleria'){
      for(let k=0; k<6; k++){
        let ox, oz; do { ox=(S.rng()*2-1)*9; oz=(S.rng()*2-1)*9; } while(ox*ox+oz*oz > 81);
        areaDamage(ev.p, ev.x+ox, ev.z+oz, 3, 70); hooks.impact(ev.x+ox, ev.z+oz, 'shell');
      }
    }
    else if(ev.kind==='precision'){ areaDamage(ev.p, ev.x, ev.z, 4.5, 450); hooks.impact(ev.x, ev.z, 'big'); }
    else if(ev.kind==='super'){
      if(ev.sk==='cohetes'){
        for(let k=0; k<8; k++){ let ox, oz; do { ox=(S.rng()*2-1)*ev.r; oz=(S.rng()*2-1)*ev.r; } while(ox*ox+oz*oz > ev.r*ev.r);
          areaDamage(ev.p, ev.x+ox, ev.z+oz, 4, 380, 1); hooks.impact(ev.x+ox, ev.z+oz, 'shell'); }
      } else {
        areaDamage(ev.p, ev.x, ev.z, ev.r, ev.dmg, 1); hooks.impact(ev.x, ev.z, ev.sk);
        if(ev.sk==='nuclear') for(let w=1; w<=4; w++) S.events.push({ at:S.tick+w*2*TICK_HZ, kind:'rad', p:ev.p, x:ev.x, z:ev.z, r:ev.r*0.8 });
      }
    }
    else if(ev.kind==='rad'){ areaDamage(ev.p, ev.x, ev.z, ev.r, 60); hooks.impact(ev.x, ev.z, 'rad'); }
  }
}

// ---------- Comandos (único punto de entrada de cambios) ----------
let cmdSink = null;   // en línea: la interfaz asigna una función que envía la orden al servidor
function queueCmd(c){ if(cmdSink) return cmdSink(c); c.tick = S.tick + 1; S.cmdQueue.push(c); }
function applyCmd(c){
  if(!c || typeof c.t!=='string' || (c.p!==0 && c.p!==1) || (c.ids!==undefined && (!Array.isArray(c.ids) || c.ids.length>200))) return;
  const own = id => { const e=S.byId.get(id); return e && !e.dead && e.owner===c.p ? e : null; };
  const pl = S.players[c.p];
  switch(c.t){
    case 'move': case 'amove': {
      const us = c.ids.map(own).filter(e => e && e.kind==='unit');
      us.sort((a,b) => (hyp(a.x-c.x,a.z-c.z) - hyp(b.x-c.x,b.z-c.z)) || a.id-b.id);
      const navs = us.filter(u => UT(u.owner,u.type).naval), lands = us.filter(u => !UT(u.owner,u.type).naval);
      const cellsL = goalCells(c.x, c.z, lands.length), cellsN = navs.length ? naval(() => goalCells(c.x, c.z, navs.length)) : [];
      const cells = []; let li = 0, ni = 0; for(const u of us) cells.push(UT(u.owner,u.type).naval ? cellsN[ni++] : cellsL[li++]);
      us.forEach((u,i) => { const g=cells[i]||{x:c.x,z:c.z};
        u.order={ type:(UT(u.owner,u.type).weapon ? c.t : 'move'), x:g.x, z:g.z }; u.path=null; u.target=null; u.mode=null; if(u.air && u.astate!=='rtb') u.astate=null; });
      break; }
    case 'attack': {
      const tg = S.byId.get(c.target); if(!tg || tg.dead || tg.owner===c.p || tg.owner<0) break;
      c.ids.map(own).filter(e => e && e.kind==='unit' && UT(e.owner,e.type).weapon && canHit(UT(e.owner,e.type).weapon, tg))
        .forEach(u => { u.order={ type:'attack', id:tg.id }; u.path=null; u.target=null; u.mode=null; u.repath=0; });
      break; }
    case 'capture': {
      const b = S.byId.get(c.target); if(!b || b.dead || b.kind!=='bld' || b.owner===c.p) break;
      c.ids.map(own).filter(e => e && e.kind==='unit' && !e.air && capturable(e, b))
        .forEach(u => { u.order={ type:'capture', id:b.id }; u.path=null; u.target=null; u.mode=null; u.capT=0; });
      break; }
    case 'enter': {
      const b = own(c.target); if(!b || b.type!=='tunel' || !b.built) break;
      c.ids.map(own).filter(e => e && e.kind==='unit' && !e.air && !UT(e.owner,e.type).naval).forEach(u => { u.order={ type:'enter', id:b.id }; u.path=null; u.target=null; u.mode=null; });
      break; }
    case 'exit': { const b = own(c.id); if(b && b.type==='tunel' && b.built) exitTunnel(c.p, b); break; }
    case 'super': {
      const b = own(c.id); if(!b || !b.built) break;
      const bt = BT(c.p, b.type); if(!bt.superCd || b.readyAt > S.tick || S.power[c.p].low || b.offUntil > S.tick) break;
      const x = clampW(c.x), z = clampW(c.z);
      b.readyAt = S.tick + bt.superCd*TICK_HZ;
      S.events.push({ at:S.tick+3*TICK_HZ, kind:'super', p:c.p, x, z, sk:bt.superKind, r:bt.superR, dmg:bt.superDmg });
      hooks.superFire(c.p, b, x, z);
      break; }
    case 'harvest': {
      const d = S.byId.get(c.target); if(!d || d.dead || d.kind!=='depot') break;
      c.ids.map(own).filter(e => e && e.type==='recolector')
        .forEach(u => { u.order=null; u.depot=d.id; u.hstate=u.carry>0?'toBase':'toDepot'; u.path=null; });
      break; }
    case 'stop': {
      c.ids.map(own).filter(e => e && e.kind==='unit')
        .forEach(u => { u.order=null; u.path=null; u.target=null; u.mode=null; if(u.type==='recolector') u.hstate='hold'; });
      break; }
    case 'build': {
      const b = own(c.id); if(!b || b.kind!=='bld' || !b.built) break;
      const ut = UT(c.p, c.type); if(!ut || !BT(c.p,b.type).produce.includes(c.type) || b.queue.length>=5) break;
      if(pl.credits < ut.cost) break;
      if(ut.hero && (pl.rank < ut.minRank || heroCount(c.p) > 0)) break;   // un héroe por jugador, desde rango 4
      pl.credits -= ut.cost; b.queue.push(c.type); break; }
    case 'cancel': {
      const b = own(c.id); if(!b || b.kind!=='bld' || !b.queue.length) break;
      const type = b.queue.pop(); pl.credits += UT(c.p,type).cost; if(!b.queue.length) b.prog=0; break; }
    case 'rally': { const b=own(c.id); if(b && b.kind==='bld') b.rally={ x:c.x, z:c.z }; break; }
    case 'place': {
      if(!FACTIONS[pl.faction].builds.includes(c.type)) break;
      const bt = BT(c.p, c.type); if(!bt || !bt.buildable) break;
      if(bt.minRank && pl.rank < bt.minRank) break;
      if(bt.superCd && S.ents.some(e => !e.dead && e.owner===c.p && e.type===c.type)) break;   // una por jugador
      const builders = c.ids.map(own).filter(e => e && e.type==='constructor'); if(!builders.length) break;
      if(pl.credits < bt.cost || !canPlace(c.p, c.type, c.cx, c.cz, 0)) break;
      pl.credits -= bt.cost;
      const b = addBuilding(c.type, c.p, c.cx, c.cz, false);
      for(const u of S.ents){
        if(u.kind!=='unit' || u.dead || u.air) continue;
        const ux=toCell(u.x), uz=toCell(u.z);
        if(ux>=c.cx && ux<c.cx+bt.size && uz>=c.cz && uz<c.cz+bt.size){ const f=nearestFree(ux,uz,6); if(f){ u.x=u.px=cellCenter(f[0]); u.z=u.pz=cellCenter(f[1]); u.path=null; } }
      }
      builders.forEach(u => { u.order={ type:'build', id:b.id }; u.path=null; });
      break; }
    case 'repair': {
      const b = S.byId.get(c.target); if(!b || b.dead || b.owner!==c.p || b.kind!=='bld') break;
      c.ids.map(own).filter(e => e && e.type==='constructor').forEach(u => { u.order={ type:'build', id:b.id }; u.path=null; });
      break; }
    case 'cancelBuild': {
      const b = own(c.id); if(!b || b.kind!=='bld' || b.built) break;
      pl.credits += Math.round(BT(c.p,b.type).cost*0.75); kill(b); break; }
    case 'unlock': {
      const tn = typeof c.power==='string' ? treeNode(pl.faction, c.power) : null;
      if(!tn || pl.unlocked[c.power] || pl.cp<1 || (tn.prev && !pl.unlocked[tn.prev])) break;
      pl.unlocked[c.power] = true; pl.cp--;
      if(tn.node.fx) applyNodeFx(c.p, tn.node.fx);
      break; }
    case 'power': usePower(c); break;
  }
}

// ---------- IA básica (ve todo el mapa: no usa niebla) ----------
function findSpot(p, type, x, z){
  const n=BT(p,type).size, c0=toCell(x)-Math.floor(n/2), c1=toCell(z)-Math.floor(n/2);
  for(let r=0; r<=10; r++) for(let dz=-r; dz<=r; dz++) for(let dx=-r; dx<=r; dx++){
    if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
    if(canPlace(p, type, c0+dx, c1+dz, 1)) return [c0+dx, c1+dz];
  }
  return null;
}
function aiPowers(p, home, threat){
  const me = S.players[p], F = FACTIONS[me.faction], foe = 1-p;
  for(let guard=0; me.cp>0 && guard<9; guard++){
    let pick = null;
    for(let lvl=0; lvl<3 && !pick; lvl++) for(const br of TREES[me.faction]){ const n = br.nodos[lvl]; if(!me.unlocked[n.id] && (!lvl || me.unlocked[br.nodos[lvl-1].id])){ pick = n.id; break; } }
    if(!pick) break; applyCmd({ t:'unlock', p, power:pick });
  }
  if(powerReady(p,'reparacion')){
    const hurt = S.ents.filter(e => e.owner===p && !e.dead && e.kind!=='depot' && e.hp < e.maxhp*0.6 && hyp(e.x-home.x, e.z-home.z) < 20).length;
    if(hurt >= 3) applyCmd({ t:'power', p, power:'reparacion', x:home.x, z:home.z });
  }
  if(powerReady(p,'sabotaje')){
    let tg=null, bd=1e9;
    for(const e of S.ents){ if(e.dead||e.kind!=='bld'||e.owner!==foe||!e.built) continue; const k = e.type==='superarma' ? -100 : (e.type==='torre'||e.type==='fabrica') ? 0 : 20; const d=hyp(e.x-home.x,e.z-home.z)+k; if(d<bd){ bd=d; tg=e; } }
    if(tg) applyCmd({ t:'power', p, power:'sabotaje', x:tg.x, z:tg.z });
  }
  if(threat && powerReady(p,'tropas')) applyCmd({ t:'power', p, power:'tropas', x:(home.x+threat.x)/2, z:(home.z+threat.z)/2 });
  for(const id of ['artilleria','precision']){
    if(!powerReady(p,id)) continue;
    let tg = threat;
    if(!tg){ let bd=1e9; for(const e of S.ents){ if(e.dead||e.kind!=='bld'||e.owner!==foe) continue; const d=hyp(e.x-home.x,e.z-home.z); if(d<bd){ bd=d; tg=e; } } }
    if(tg) applyCmd({ t:'power', p, power:id, x:tg.x, z:tg.z });
  }
}
// Celda de agua más cercana a la base (hasta 30 celdas), si hay suficiente agua para una flota
// Costa más cercana a la base: punto de agua y si el jugador ya la exploró (el astillero exige terreno explorado)
function coastNear(home, p){
  const cx = toCell(home.x), cz = toCell(home.z); let best = null, bd = 1e9, count = 0;
  for(let z=Math.max(0,cz-30); z<=Math.min(GRID-1,cz+30); z++) for(let x=Math.max(0,cx-30); x<=Math.min(GRID-1,cx+30); x++){
    if(!S.water[idx(x,z)]) continue; count++;
    const d = (x-cx)*(x-cx) + (z-cz)*(z-cz); if(d < bd){ bd = d; best = { x:cellCenter(x), z:cellCenter(z), explored: p===undefined ? true : !!S.exp[p][idx(x,z)] }; }
  }
  return count >= 25 ? best : null;
}
function aiTick(p){
  const ai = S.ai[p]; if(S.tick < ai.next) return; ai.next = S.tick + Math.round(TICK_HZ*2*S.thinkMult[p]);
  const foe = 1-p, me = S.players[p], pw = S.power[p], F = FACTIONS[me.faction];
  const mine = S.ents.filter(e => !e.dead && e.owner===p);
  const blds = mine.filter(e => e.kind==='bld' && e.type!=='pozo'); if(!blds.length) return;
  const units = mine.filter(e => e.kind==='unit');
  const collectors = units.filter(u => u.type==='recolector');
  const builders = units.filter(u => u.type==='constructor');
  const army = units.filter(u => UT(p,u.type).weapon && (!u.air || UT(p,u.type).hover));
  const air = units.filter(u => u.air && !UT(p,u.type).hover);
  const helis = units.filter(u => u.air && UT(p,u.type).hover);
  const engineers = units.filter(u => u.type==='ingeniero');
  const find = t => blds.find(b => b.type===t);
  const findBuilt = t => blds.find(b => b.type===t && b.built);
  const centro=findBuilt('centro'), cuartel=findBuilt('cuartel'), fabrica=findBuilt('fabrica'), aerodromo=findBuilt('aerodromo');
  const home = find('centro') || blds[0];
  const dl = hyp(WORLD/2-home.x, WORLD/2-home.z) || 1, dx = (WORLD/2-home.x)/dl, dz = (WORLD/2-home.z)/dl;
  let threat = null, td = 24;
  for(const e of S.ents){ if(e.dead || e.kind!=='unit' || e.owner!==foe) continue; const d=hyp(e.x-home.x, e.z-home.z); if(d<td){ td=d; threat=e; } }

  // Construcción
  if(centro && !builders.length && !centro.queue.includes('constructor') && me.credits>=500) applyCmd({ t:'build', p, id:centro.id, type:'constructor' });
  const b0 = builders.find(u => !u.order);
  let reserve = 0;
  if(b0){
    const unfinished = blds.find(b => !b.built), towers = blds.filter(b => b.type==='torre').length;
    let want = null;
    if(unfinished) applyCmd({ t:'repair', p, ids:[b0.id], target:unfinished.id });
    else if(!F.noPower && pw.prod-pw.cons < 4) want = ['planta', home.x-dx*7, home.z-dz*7];
    else if(!find('cuartel')) want = ['cuartel', home.x+dz*8, home.z-dx*8];
    else if(!find('fabrica')) want = ['fabrica', home.x-dz*8, home.z+dx*8];
    else if(!find('astillero') && S.water.reduce((a,b)=>a+b,0) > 300 && S.tick>TICK_HZ*60 && coastNear(home, p) && coastNear(home, p).explored){ const w = coastNear(home, p); want = ['astillero', w.x, w.z]; }
    else if(F.builds.includes('aerodromo') && !find('aerodromo') && S.tick>TICK_HZ*120) want = ['aerodromo', home.x-dx*4-dz*10, home.z-dz*4+dx*10];
    else if(!find('astillero') && S.tick>TICK_HZ*100 && coastNear(home, p) && coastNear(home, p).explored){ const w = coastNear(home, p); want = ['astillero', w.x, w.z]; }
    else if(F.builds.includes('superarma') && !find('superarma') && me.rank>=3 && S.tick>TICK_HZ*300) want = ['superarma', home.x-dx*5+dz*7, home.z-dz*5-dx*7];
    else if(F.builds.includes('tunel') && blds.filter(b => b.type==='tunel').length<2 && S.tick>TICK_HZ*90){ const k = blds.filter(b => b.type==='tunel').length; want = ['tunel', home.x+dx*(9+k*8)-dz*4, home.z+dz*(9+k*8)+dx*4]; }
    else if(S.tick>TICK_HZ*80 && towers<3){ const d=11+towers*2, side=(towers-1)*5; want = ['torre', home.x+dx*d+dz*side, home.z+dz*d-dx*side]; }
    if(want){
      const cost = BT(p,want[0]).cost;
      if(me.credits>=cost){ const sp=findSpot(p,want[0],want[1],want[2]); if(sp) applyCmd({ t:'place', p, ids:[b0.id], type:want[0], cx:sp[0], cz:sp[1] }); }
      else reserve = cost;
    } else if(!unfinished){ const dmg = blds.find(b => b.hp < b.maxhp*0.7); if(dmg) applyCmd({ t:'repair', p, ids:[b0.id], target:dmg.id }); }
  }

  // Producción (respeta el ahorro para construir)
  const foeAir = S.ents.some(e => e.owner===foe && e.air && !e.dead);
  const aa = army.filter(u => u.type==='antiaereo').length;
  if(centro && collectors.length + centro.queue.filter(q=>q==='recolector').length < 3 && me.credits>=300) applyCmd({ t:'build', p, id:centro.id, type:'recolector' });
  else {
    const r = S.rng();
    const wantAir = aerodromo && air.length + aerodromo.queue.length < 2;
    const airReserve = wantAir ? UT(p,'avion').cost : 0;   // ahorra para aviones
    const can = (b, type, extra=airReserve) => b && b.queue.length<2 && me.credits >= UT(p,type).cost + reserve + extra;
    if(foeAir && aa<3 && can(fabrica,'antiaereo',0)) applyCmd({ t:'build', p, id:fabrica.id, type:'antiaereo' });
    else if(wantAir && can(aerodromo,'avion',0)) applyCmd({ t:'build', p, id:aerodromo.id, type:'avion' });
    else if(findBuilt('astillero') && r>0.5 && units.filter(u => UT(p,u.type).naval).length < 4){ const ast = findBuilt('astillero'), type = S.rng()<0.6 ? 'lancha' : 'fragata'; if(can(ast,type,0)) applyCmd({ t:'build', p, id:ast.id, type }); }
    else if(fabrica && BT(p,'fabrica').produce.includes('helicoptero') && helis.length<2 && r>0.85 && can(fabrica,'helicoptero')) applyCmd({ t:'build', p, id:fabrica.id, type:'helicoptero' });
    else if(cuartel && engineers.length + cuartel.queue.filter(q=>q==='ingeniero').length < 1 && S.tick>TICK_HZ*150 && r>0.7 && can(cuartel,'ingeniero')) applyCmd({ t:'build', p, id:cuartel.id, type:'ingeniero' });
    else if(fabrica && r<0.5){ const list = BT(p,'fabrica').produce.filter(x => x!=='antiaereo' && x!=='helicoptero'); const type = list[Math.floor(S.rng()*list.length)]; if(can(fabrica,type)) applyCmd({ t:'build', p, id:fabrica.id, type }); }
    else if(cuartel && cuartel.queue.length<3 && me.credits>=UT(p,'infanteria').cost+reserve+airReserve) applyCmd({ t:'build', p, id:cuartel.id, type:'infanteria' });
  }

  // Captura de pozos
  if(!units.some(u => u.order && u.order.type==='capture')){
    const inf = army.find(u => u.type==='infanteria' && !u.order);
    if(inf){
      let well=null, wd=1e9;
      for(const e of S.ents){ if(e.dead || e.type!=='pozo' || e.owner===p) continue; const d=hyp(e.x-home.x,e.z-home.z); if(d<wd){ wd=d; well=e; } }
      if(well && wd < 70) applyCmd({ t:'capture', p, ids:[inf.id], target:well.id });
    }
  }

  // Ingenieros: pozos primero; luego edificios enemigos cercanos
  for(const en of engineers.filter(u => !u.order)){
    let tg=null, bd=1e9;
    for(const e of S.ents){ if(e.dead || e.kind!=='bld' || !capturable(en,e)) continue; const d=hyp(e.x-en.x,e.z-en.z) + (e.type==='pozo' ? 0 : 25); if(d<bd){ bd=d; tg=e; } }
    if(tg && bd < 80) applyCmd({ t:'capture', p, ids:[en.id], target:tg.id });
  }

  // Túneles: curar unidades muy dañadas y sacarlas cuando no hay amenaza
  const tunnels = blds.filter(b => b.type==='tunel' && b.built);
  if(tunnels.length){
    if(!threat && me.tunnel.length && me.tunnel.every(u => u.hp >= u.maxhp*0.95)) applyCmd({ t:'exit', p, id:tunnels[0].id });
    for(const u of army){ if(u.air || u.hp >= u.maxhp*0.35 || (u.order && u.order.type==='enter')) continue;
      let tn=null, bd=25; for(const tb of tunnels){ const d=hyp(tb.x-u.x,tb.z-u.z); if(d<bd){ bd=d; tn=tb; } }
      if(tn && me.tunnel.length < 8) applyCmd({ t:'enter', p, ids:[u.id], target:tn.id }); }
  }

  // Superarma contra el edificio enemigo más valioso
  const sw = blds.find(b => b.type==='superarma' && b.built && b.readyAt <= S.tick);
  if(sw){
    let tg=null, bv=-1;
    for(const e of S.ents){ if(e.dead || e.kind!=='bld' || e.owner!==foe) continue; const v = e.type==='superarma' ? 5 : e.type==='centro' ? 4 : e.type==='fabrica' ? 3 : 1; if(v>bv){ bv=v; tg=e; } }
    if(tg) applyCmd({ t:'super', p, id:sw.id, x:tg.x, z:tg.z });
  }

  aiPowers(p, home, threat);

  // Aviación: ataca en pareja
  const idleAir = air.filter(u => !u.order && u.ammo>0 && u.astate!=='rtb');
  if(idleAir.length >= 2){
    let tg=null, bd=1e9;
    for(const e of S.ents){ if(e.dead || e.owner!==foe || e.kind==='depot' || e.air) continue; const d=hyp(e.x-home.x,e.z-home.z) + (e.kind==='bld'?10:0); if(d<bd){ bd=d; tg=e; } }
    if(tg) applyCmd({ t:'attack', p, ids:idleAir.map(u=>u.id), target:tg.id });
  }

  // Defensa y ataque por oleadas
  // Héroe desde rango 4
  if(cuartel && me.rank >= 4 && heroCount(p)===0 && me.credits >= UT(p,'heroe').cost + reserve) applyCmd({ t:'build', p, id:cuartel.id, type:'heroe' });

  const idle = army.filter(u => !u.order);
  // Exploración: si hay costa cerca y aún no se exploró, una unidad ociosa la reconoce (para poder levantar el astillero)
  { const w = S.tick > TICK_HZ*80 && !find('astillero') ? coastNear(home, p) : null;
    if(w && !w.explored && S.tick - (ai.scoutT||0) > TICK_HZ*60){ const sc = idle.find(u => !UT(p,u.type).naval && !u.air); if(sc){ applyCmd({ t:'move', p, ids:[sc.id], x:w.x, z:w.z }); ai.scoutT = S.tick; } } }
  if(threat){ if(idle.length) applyCmd({ t:'amove', p, ids:idle.map(u=>u.id), x:threat.x, z:threat.z }); return; }

  // Ataque concentrado: reunir en un punto de concentración, atacar con fuerza suficiente,
  // mantener la ofensiva sobre la base enemiga y retirarse si la fuerza cae por debajo del 35 %.
  const stage = { x:clampW(home.x+dx*16), z:clampW(home.z+dz*16) };
  for(const b of blds) if(b.built && !b.rally && BT(p,b.type).produce.some(k => UT(p,k).weapon)) applyCmd({ t:'rally', p, id:b.id, x:stage.x, z:stage.z });
  const value = list => list.reduce((a,u) => a + UT(p,u.type).cost * u.hp / u.maxhp, 0);
  const foeBlds = S.ents.filter(e => !e.dead && e.kind==='bld' && e.owner===foe && e.type!=='pozo');
  if(ai.attack){
    const force = ai.attack.ids.map(id => S.byId.get(id)).filter(u => u && !u.dead && !u.tunneled);
    if(!force.length || value(force) < ai.attack.v0*0.35){
      if(force.length) applyCmd({ t:'move', p, ids:force.map(u=>u.id), x:stage.x, z:stage.z });
      ai.attack = null; ai.goal = Math.min(12000, ai.goal + 800);
    } else {
      const idleF = force.filter(u => !u.order);
      if(idleF.length && foeBlds.length){
        // continuar con el objetivo más cercano al grupo
        const cx = idleF.reduce((a,u)=>a+u.x,0)/idleF.length, cz = idleF.reduce((a,u)=>a+u.z,0)/idleF.length;
        let tg=null, bd=1e9; for(const e of foeBlds){ const d=hyp(e.x-cx,e.z-cz) - (e.type==='superarma'?20:0); if(d<bd){ bd=d; tg=e; } }
        if(tg) applyCmd({ t:'amove', p, ids:idleF.map(u=>u.id), x:tg.x, z:tg.z });
      }
      // refuerzos que esperan en el punto de concentración se suman cuando son al menos 4
      const fresh = idle.filter(u => !ai.attack.ids.includes(u.id) && hyp(u.x-stage.x,u.z-stage.z) < 14);
      if(fresh.length >= 4 && force.length){ const lead = force[0]; applyCmd({ t:'amove', p, ids:fresh.map(u=>u.id), x:lead.x, z:lead.z }); ai.attack.ids.push(...fresh.map(u=>u.id)); }
    }
    return;
  }
  // mover a la concentración las unidades ociosas que estén lejos
  const far = idle.filter(u => hyp(u.x-stage.x,u.z-stage.z) > 10);
  if(far.length) applyCmd({ t:'move', p, ids:far.map(u=>u.id), x:stage.x, z:stage.z });
  const ready = idle.filter(u => hyp(u.x-stage.x,u.z-stage.z) <= 12);
  const late = S.tick > TICK_HZ*600;
  if(foeBlds.length && ready.length >= 3 && (value(ready) >= (late ? ai.goal*0.6 : ai.goal) || S.tick-ai.lastAttack > TICK_HZ*240)){
    ai.lastAttack = S.tick;
    // objetivo: producción enemiga primero (fábrica, aeródromo, cuartel), luego el centro de mando
    const prio = { fabrica:0, aerodromo:1, superarma:-1, cuartel:2, centro:3 };
    let tg=null, bd=1e9;
    // se evitan los objetivos protegidos por varias defensas
    const guards = e => foeBlds.filter(t => t.built && BT(foe,t.type).weapon && hyp(t.x-e.x,t.z-e.z) <= 12).length;
    for(const e of foeBlds){ const k = prio[e.type]!==undefined ? prio[e.type] : 4; const d = k*25 + hyp(e.x-stage.x,e.z-stage.z)*0.5 + guards(e)*35; if(d<bd){ bd=d; tg=e; } }
    applyCmd({ t:'amove', p, ids:ready.map(u=>u.id), x:tg.x, z:tg.z });
    ai.attack = { ids:ready.map(u=>u.id), v0:value(ready) };
  }
  return;

}

// ---------- Huella del estado (detección de desincronización) ----------
function stateHash(){
  let h = 2166136261 >>> 0;
  const mix = v => { h ^= (v|0); h = Math.imul(h, 16777619) >>> 0; };
  mix(S.tick); mix(S.events.length);
  if(S.mission){ for(const st of S.mission.state) mix(st==='ok'?1:st==='fail'?2:0); }
  for(const pl of S.players){ mix(pl.credits); mix(pl.kills); mix(pl.xp); mix(pl.cp); mix(pl.rank); mix(Object.keys(pl.unlocked).length); mix(pl.navKills); mix(pl.tunnel.length); for(const u of pl.tunnel){ mix(u.id); mix(Math.round(u.hp*100)); } }
  for(const e of S.ents){ mix(e.id); mix(e.owner); mix(Math.round(e.x*1000)); mix(Math.round(e.z*1000)); mix(Math.round(e.hp*100)); if(e.kind==='depot') mix(e.amount); if(e.readyAt) mix(e.readyAt); if(e.offUntil) mix(e.offUntil); }
  return h >>> 0;
}

// ---------- Ciclo de simulación ----------
function separate(){
  const us = S.ents.filter(e => e.kind==='unit' && !e.dead && !e.air);
  for(let i=0; i<us.length; i++) for(let j=i+1; j<us.length; j++){
    const a=us[i], b=us[j];
    const na = !!UT(a.owner,a.type).naval; if(na !== !!UT(b.owner,b.type).naval) continue;   // agua y tierra son capas distintas
    NAV = na;
    let dx=b.x-a.x, dz=b.z-a.z; const min=(a.radius+b.radius)*0.85;
    if(Math.abs(dx)>min || Math.abs(dz)>min) continue;
    let d = hyp(dx,dz); if(d>=min) continue;
    if(d<1e-4){ dx=((a.id*7+b.id*13)%9)-4 || 1; dz=((a.id*5+b.id*11)%9)-4; d=hyp(dx,dz); }
    const push=(min-d)/2, nx=dx/d*push, nz=dz/d*push;
    if(isFree(toCell(a.x-nx),toCell(a.z-nz))){ a.x-=nx; a.z-=nz; }
    if(isFree(toCell(b.x+nx),toCell(b.z+nz))){ b.x+=nx; b.z+=nz; }
  }
  NAV = false;
}
function crateTick(c){
  if(S.tick >= c.until){ kill(c); return; }
  for(const u of S.ents){
    if(u.dead || u.kind!=='unit' || u.air || !FACTIONS[S.players[u.owner].faction].salvage) continue;
    if(hyp(u.x-c.x, u.z-c.z) > 1.8) continue;
    S.players[u.owner].credits += 75;
    const ut = UT(u.owner,u.type);
    if(ut.weapon && u.vet<3){ u.vet++; u.maxhp = Math.round(ut.hp*(1+0.2*u.vet)); u.hp = Math.min(u.maxhp, u.hp + ut.hp*0.3); }
    hooks.crate(c, u); kill(c); return;
  }
}
// Objetivos y eventos de misión. Se evalúan una vez por segundo dentro de la simulación (deterministas).
const ownBld = (p, type) => S.ents.filter(e => !e.dead && e.kind==='bld' && e.owner===p && (!type || e.type===type) && e.type!=='pozo');
function nearBase(p){ const c = ownBld(p,'centro')[0] || ownBld(p)[0]; return c || { x:WORLD/2, z:WORLD/2 }; }
function evalObjective(o, sec){
  const enemy = 1;
  switch(o.tipo){
    case 'destruir': return o.edificio ? (ownBld(enemy, o.edificio).length===0 ? 'ok' : 'pend') : (ownBld(enemy).length===0 ? 'ok' : 'pend');
    case 'sobrevivir': return sec >= o.segundos ? 'ok' : 'pend';
    case 'pozos': return S.ents.filter(e => !e.dead && e.type==='pozo' && e.owner===0).length >= o.cantidad ? 'ok' : 'pend';
    case 'rango': return S.players[0].rank >= o.rango ? 'ok' : 'pend';
    case 'bajas': return S.players[0].kills >= o.cantidad ? 'ok' : 'pend';
    case 'construir': return ownBld(0, o.edificio).some(b => b.built) ? 'ok' : 'pend';
    case 'proteger': return ownBld(0, o.edificio).length ? (o.hasta && sec >= o.hasta ? 'ok' : 'pend') : 'fail';
    case 'proteger_heroe': { const alive = S.heroes[0]!=null || S.players[0].tunnel.some(u => UT(0,u.type).hero); if(alive) S.mission.heroSeen = true; return S.mission.heroSeen && !alive ? 'fail' : (o.hasta && sec >= o.hasta ? 'ok' : 'pend'); }
    case 'limite': return sec > o.segundos ? 'fail' : 'pend';
    case 'unidades': return S.ents.filter(e => !e.dead && e.kind==='unit' && e.owner===0 && (!o.unidad || e.type===o.unidad)).length >= o.cantidad ? 'ok' : 'pend';
    case 'llegar': { const tx = cellCenter(o.x), tz = cellCenter(o.z), r = (o.r||3)*CELL; return S.ents.some(e => !e.dead && e.kind==='unit' && e.owner===0 && hyp(e.x-tx, e.z-tz) <= r) ? 'ok' : 'pend'; }
    case 'hundir': return S.players[0].navKills >= o.cantidad ? 'ok' : 'pend';
  }
  return 'pend';
}
function runTrigger(tr){
  const M = S.mission;
  switch(tr.accion){
    case 'refuerzos': {
      const p = tr.jugador || 0, base = tr.cerca==='enemigo' ? nearBase(1-p) : nearBase(p);
      const dx = WORLD/2-base.x, dz = WORLD/2-base.z, d = hyp(dx,dz) || 1;
      const list = []; for(const [type,n] of tr.unidades) for(let i=0; i<n; i++) list.push(type);
      const land = list.filter(t => !UT(p,t).naval), sea = list.filter(t => UT(p,t).naval);
      const cells = goalCells(base.x+dx/d*10, base.z+dz/d*10, land.length);
      const coast = sea.length ? coastNear(base) : null;
      const seaCells = coast ? naval(() => goalCells(coast.x, coast.z, sea.length)) : [];
      const spawn = (type, c) => { if(!c) return; const u = addUnit(type, p, c.x, c.z); if(tr.atacar && p===1) u.order = { type:'amove', x:nearBase(0).x, z:nearBase(0).z }; };
      land.forEach((type,i) => spawn(type, cells[i])); sea.forEach((type,i) => spawn(type, seaCells[i]));
      break; }
    case 'creditos': S.players[tr.jugador||0].credits += tr.cantidad; break;
    case 'ataque': { const a = S.ai[tr.jugador||1]; if(a){ a.lastAttack = -1e9; a.goal = Math.min(a.goal, 1500); } break; }
    case 'revelar': S.reveals.push({ p:0, x:nearBase(1).x, z:nearBase(1).z, r:16, until:S.tick + (tr.segundos||15)*TICK_HZ }); break;
  }
  if(tr.mensaje) hooks.mission('mensaje', tr.mensaje);
}
function missionTick(){
  const M = S.mission; if(!M || S.over || S.tick % TICK_HZ) return;
  const sec = S.tick / TICK_HZ, def = M.def;
  def.eventos.forEach((tr,i) => {
    if(M.trig[i]) return;
    const due = tr.en!==undefined ? sec >= tr.en : tr.alCumplir!==undefined ? M.state[tr.alCumplir]==='ok' : false;
    if(due){ M.trig[i] = true; runTrigger(tr); }
  });
  let changed = false;
  def.objetivos.forEach((o,i) => { if(M.state[i]!=='pend') return; const r = evalObjective(o, sec); if(r!==M.state[i]){ M.state[i] = r; changed = true; } });
  if(changed) hooks.mission('objetivos', M.state.slice());
  if(def.objetivos.some((o,i) => !o.secundario && M.state[i]==='fail')){ S.over = true; S.winner = 1; M.result = 'fail'; }
  else {
    const guard = o => (o.tipo==='proteger' || o.tipo==='proteger_heroe') && !o.hasta;
    const primary = def.objetivos.map((o,i) => i).filter(i => !def.objetivos[i].secundario);
    if(primary.some(i => !guard(def.objetivos[i])) && primary.every(i => M.state[i]==='ok' || (guard(def.objetivos[i]) && M.state[i]==='pend'))){
      primary.forEach(i => { if(M.state[i]==='pend') M.state[i] = 'ok'; });
      S.over = true; S.winner = 0; M.result = 'ok'; hooks.mission('objetivos', M.state.slice());
    }
  }
}
function checkVictory(){
  if(S.over) return;
  const has = p => S.ents.some(e => !e.dead && e.kind==='bld' && e.owner===p && e.type!=='pozo');
  const a=has(0), b=has(1);
  if(!a || !b){
    S.over=true; S.winner = a ? 0 : b ? 1 : -1;
    const M = S.mission;
    if(M){
      if(!a){ M.result = 'fail'; }
      else {
        // sin edificios enemigos: las condiciones de resistencia y destrucción quedan cumplidas
        M.def.objetivos.forEach((o,i) => { if(M.state[i]==='pend' && ['proteger','proteger_heroe','sobrevivir','limite','destruir'].includes(o.tipo)) M.state[i] = 'ok'; });
        M.result = 'ok';
      }
      hooks.mission('objetivos', M.state.slice());
    }
  }
}
function simTick(){
  const now = [];
  for(const c of S.cmdQueue) if(c.tick<=S.tick) now.push(c);
  if(now.length){ S.cmdQueue = S.cmdQueue.filter(c => c.tick>S.tick); S.log.push([S.tick, now.map(c => { const o = Object.assign({}, c); delete o.tick; return o; })]); now.forEach(applyCmd); }
  S.power = [powerOf(0), powerOf(1)];
  S.heroes = [null, null];
  for(const e of S.ents) if(e.kind==='unit' && !e.dead && UT(e.owner,e.type).hero) S.heroes[e.owner] = e.id;
  for(const p of S.aiPlayers) aiTick(p);
  for(const e of S.ents){ e.px=e.x; e.pz=e.z; }
  for(let i=0; i<S.ents.length; i++){ const e=S.ents[i]; if(e.dead) continue; if(e.kind==='unit') unitTick(e); else if(e.kind==='bld') bldTick(e); }
  processEvents();
  for(let i=0; i<S.ents.length; i++){ const c=S.ents[i]; if(c.kind==='crate' && !c.dead) crateTick(c); }
  for(const p of [0,1]){
    const pl = S.players[p]; if(!pl.tunnel.length) continue;
    if(!S.ents.some(e => !e.dead && e.owner===p && e.type==='tunel' && e.built)){ pl.tunnel = []; continue; }   // sin túneles, se pierden
    for(const u of pl.tunnel) u.hp = Math.min(u.maxhp, u.hp + u.maxhp*0.05*DT);
  }
  separate(); cleanup();
  if(S.tick%3===0) updateVision();
  missionTick(); checkVictory(); S.tick++;
}
// Dificultad de la IA: ingresos y frecuencia de decisión
const AI_LEVELS = { facil:{ bonus:0.75, think:1.5 }, normal:{ bonus:1, think:1 }, dificil:{ bonus:1.3, think:0.75 } };
function setupMission(def){
  S.mission = { def, state:def.objetivos.map(() => 'pend'), trig:def.eventos.map(() => false), heroSeen:false, result:null };
  const lv = AI_LEVELS[def.dificultad] || AI_LEVELS.normal; S.bonus[1] = lv.bonus; S.thinkMult[1] = lv.think;
  if(def.creditos) def.creditos.forEach((c,p) => { if(c!=null) S.players[p].credits = c; });
  if(def.rango) for(let r=1; r<def.rango; r++){ S.players[0].rank++; S.players[0].cp++; S.players[0].xp = RANK_XP[S.players[0].rank-1]; }
  // quitar unidades o edificios iniciales indicados
  if(def.quitar) for(const [p, types] of Object.entries(def.quitar)) for(const e of S.ents) if(e.owner===+p && types.includes(e.type)) e.dead = true;
  cleanup();
  updateVision();
  // edificios adicionales (defensas enemigas, por ejemplo) cerca de su base
  if(def.edificios) for(const [p, type, n] of def.edificios){
    const base = nearBase(p), dx = WORLD/2-base.x, dz = WORLD/2-base.z, d = hyp(dx,dz) || 1;
    for(let k=0; k<(n||1); k++){
      let sp = null;
      if(BT(p,type).naval){ const w = coastNear(base); if(w){ const cx = toCell(w.x), cz = toCell(w.z); for(let z=cz-8; z<=cz+8; z++) for(let x=cx-8; x<=cx+8; x++) if(inB(x,z)) S.exp[p][idx(x,z)] = 1; sp = findSpot(p, type, w.x, w.z); } }
      else { const side = (k - ((n||1)-1)/2)*7; sp = findSpot(p, type, base.x+dx/d*12 + dz/d*side, base.z+dz/d*12 - dx/d*side); }
      if(sp) addBuilding(type, p, sp[0], sp[1], true);
    }
  }
  if(def.unidades) runTrigger({ accion:'refuerzos', jugador:0, unidades:def.unidades });
  if(def.unidadesEnemigas) runTrigger({ accion:'refuerzos', jugador:1, unidades:def.unidadesEnemigas });
}
function newGame(seed, aiPlayers=[1], factions=['atlas','hierro'], map=null, mission=null, aiLevel='normal'){
  const player = f => ({ credits:2000, kills:0, faction:f, xp:0, rank:1, cp:1, unlocked:{}, cool:{}, tunnel:[], navKills:0, mods:{ dmg:{}, prod:0, build:0, income:0 } });
  Object.assign(S, { tick:0, seed, rng:mulberry32(seed), nextId:1, ents:[], byId:new Map(), blocked:new Uint8Array(NCELLS),
    rocks:[], rockGrid:new Uint8Array(NCELLS), players:[player(factions[0]), player(factions[1])], cmdQueue:[], over:false, winner:-1, aiPlayers,
    vis:[new Uint8Array(NCELLS), new Uint8Array(NCELLS)], exp:[new Uint8Array(NCELLS), new Uint8Array(NCELLS)],
    power:[{prod:0,cons:0,low:false},{prod:0,cons:0,low:false}], events:[], reveals:[], log:[], heroes:[null,null], water:new Uint8Array(NCELLS), bonus:[1,1], thinkMult:[1,1], mission:null, map:map ? String(map.nombre||'Mapa personalizado').slice(0,40) : 'Estándar',
    tab:[buildTables(factions[0]), buildTables(factions[1])],
    ai:{ 0:{next:TICK_HZ*10,wave:6,lastAttack:0,goal:3000,attack:null,rallied:false}, 1:{next:TICK_HZ*10,wave:6,lastAttack:0,goal:3000,attack:null,rallied:false} } });
  const mir = (cx,cz,n) => [GRID-cx-n, GRID-cz-n];
  // La guerrilla no usa energía: inicia con una red de túneles en lugar de la planta
  const startType = (t, p) => t==='planta' && FACTIONS[factions[p]].noPower ? 'tunel' : t;
  [['centro',5,54],['cuartel',11,58],['fabrica',5,47],['planta',1,55]].forEach(([t,x,z]) => {
    addBuilding(startType(t,0),0,x,z); const m=mir(x,z,BUILD_TYPES[t].size); addBuilding(startType(t,1),1,m[0],m[1]); });
  if(map){
    // Mapa del editor: terreno, depósitos y pozos. Las zonas de base se respetan siempre.
    for(let z=0; z<GRID; z++) for(let x=0; x<GRID; x++){
      const k = idx(x,z), ch = map.terrain[k];
      if(ch==='.' || inBaseZone(x,z) || S.blocked[k]) continue;
      S.blocked[k] = 1;
      if(ch==='w') S.water[k] = 1;
      else { S.rockGrid[k] = 1; S.rocks.push({ cx:x, cz:z, s:0.7+S.rng()*0.6, r:S.rng()*6.28 }); }
    }
    const fits = (x,z) => [0,1].every(dz => [0,1].every(dx => !S.blocked[idx(x+dx,z+dz)] && !inBaseZone(x+dx,z+dz)));
    for(const [x,z,a] of map.depots) if(fits(x,z)) addDepot(x,z,a);
    for(const [x,z] of map.wells) if(fits(x,z)) addBuilding('pozo',-1,x,z);
  } else {
    [[12,50,2500],[2,40,2500],[21,44,3500]].forEach(([x,z,a]) => { addDepot(x,z,a); const m=mir(x,z,2); addDepot(m[0],m[1],a); });
    addDepot(31,31,6000);
    [[14,30],[34,50]].forEach(([x,z]) => { addBuilding('pozo',-1,x,z); const m=mir(x,z,2); addBuilding('pozo',-1,m[0],m[1]); });
    const zones = S.ents.map(e => ({ x:e.cx+e.n/2, z:e.cz+e.n/2, r:e.kind==='bld' && e.type!=='pozo' ? 7 : 4 }));
    const okRock = (x,z) => isFree(x,z) && x>0 && z>0 && x<GRID-1 && z<GRID-1 && zones.every(q => hyp(x+0.5-q.x, z+0.5-q.z) > q.r);
    for(let k=0; k<52; k++){
      const cx=1+Math.floor(S.rng()*(GRID-2)), cz=1+Math.floor(S.rng()*(GRID-2)), sz=1+Math.floor(S.rng()*3);
      for(let dz=0; dz<sz; dz++) for(let dx=0; dx<sz; dx++){
        if(S.rng()<0.25) continue;
        const x=cx+dx, z=cz+dz, mx=GRID-1-x, mz=GRID-1-z;
        if(!okRock(x,z) || !okRock(mx,mz)) continue;
        const s=0.7+S.rng()*0.6, r=S.rng()*6.28;
        S.blocked[idx(x,z)]=1; S.rockGrid[idx(x,z)]=1; S.rocks.push({cx:x,cz:z,s,r});
        if(mx!==x || mz!==z){ S.blocked[idx(mx,mz)]=1; S.rockGrid[idx(mx,mz)]=1; S.rocks.push({cx:mx,cz:mz,s,r:r+1}); }
      }
    }
  }
  for(const p of [0,1]){
    const c = S.ents.find(e => e.kind==='bld' && e.owner===p && e.type==='centro');
    const dx=WORLD/2-c.x, dz=WORLD/2-c.z, d=hyp(dx,dz);
    const cells = goalCells(c.x+dx/d*9, c.z+dz/d*9, 8);
    ['recolector','recolector','constructor','infanteria','infanteria','infanteria','infanteria','tanque'].forEach((t,i) => addUnit(t,p,cells[i].x,cells[i].z));
  }
  if(mission) setupMission(mission);
  else { const lv = AI_LEVELS[aiLevel] || AI_LEVELS.normal; for(const p of aiPlayers){ S.bonus[p] = lv.bonus; S.thinkMult[p] = lv.think; } }
  S.power = [powerOf(0), powerOf(1)];
  updateVision();
}
// ======================= SIM-END =======================

// ======================= CAMPAIGN-START =======================
// Campañas: tres misiones por facción. Las misiones son datos; la simulación evalúa objetivos y eventos.
// Tipos de objetivo: destruir (todo o un edificio), sobrevivir, pozos, rango, bajas, construir, proteger, proteger_heroe, limite.
const CAMPAIGNS = {
  atlas: { nombre:'Operación Horizonte', lema:'La Coalición asegura el corredor del desierto.', misiones:[
    { id:'atlas-1', nombre:'Cabeza de playa', enemigo:'hierro', dificultad:'facil', semilla:101, mapa:{ plantilla:'estandar' },
      briefing:'El Frente Hierro controla los pozos del sector. Capture dos pozos y destruya su fábrica para cortar la producción de blindados.',
      objetivos:[ { tipo:'pozos', cantidad:2, texto:'Capturar 2 pozos petroleros' }, { tipo:'destruir', edificio:'fabrica', texto:'Destruir la fábrica enemiga' }, { tipo:'proteger', edificio:'centro', texto:'Conservar el centro de mando' } ],
      eventos:[ { en:1, accion:'mensaje', mensaje:'Mando Atlas: bienvenido al sector. La infantería captura pozos; el constructor levanta defensas.' },
                { en:120, accion:'refuerzos', jugador:0, unidades:[['infanteria',4]], mensaje:'Llegan refuerzos de infantería al centro de mando.' },
                { alCumplir:0, accion:'creditos', jugador:0, cantidad:800, mensaje:'Pozos asegurados. Mando transfiere 800 créditos.' } ] },
    { id:'atlas-2', nombre:'Cielo abierto', enemigo:'guerrilla', dificultad:'normal', semilla:202, mapa:{ plantilla:'oasis', semilla:7 },
      briefing:'Las células guerrilleras se esconden alrededor del oasis. Levante un aeródromo y elimine todas sus instalaciones.',
      objetivos:[ { tipo:'construir', edificio:'aerodromo', texto:'Construir un aeródromo' }, { tipo:'destruir', texto:'Destruir todos los edificios enemigos' }, { tipo:'rango', rango:3, texto:'Alcanzar el rango 3', secundario:true } ],
      eventos:[ { en:1, accion:'mensaje', mensaje:'Mando Atlas: la guerrilla usa camuflaje. Las torres detectan rebeldes ocultos a corta distancia.' },
                { en:240, accion:'ataque', jugador:1, mensaje:'Inteligencia: la guerrilla prepara un ataque contra la base.' },
                { alCumplir:0, accion:'revelar', segundos:20, mensaje:'El reconocimiento aéreo revela la base enemiga durante 20 segundos.' } ] },
    { id:'atlas-3', nombre:'Tormenta de acero', enemigo:'hierro', dificultad:'dificil', semilla:303, mapa:{ plantilla:'desfiladero', semilla:11 }, rango:3,
      briefing:'El Frente Hierro terminó un silo nuclear. El Comando Atlas debe guiar el asalto y destruirlo antes de que dispare. No puede caer.',
      unidades:[['heroe',1],['tanque',2]], edificios:[[1,'superarma',1],[1,'torre',2]],
      objetivos:[ { tipo:'destruir', edificio:'superarma', texto:'Destruir el silo nuclear' }, { tipo:'proteger_heroe', texto:'El Comando Atlas debe sobrevivir' }, { tipo:'pozos', cantidad:2, texto:'Capturar 2 pozos', secundario:true } ],
      eventos:[ { en:1, accion:'mensaje', mensaje:'Mando Atlas: el silo enemigo estará listo en cinco minutos. Avance por los pasos del desfiladero.' },
                { en:180, accion:'refuerzos', jugador:0, unidades:[['tanque',2],['antiaereo',1]], mensaje:'Refuerzos blindados en camino.' },
                { en:300, accion:'refuerzos', jugador:1, unidades:[['pesado',2],['infanteria',4]], atacar:true, mensaje:'Alerta: columna blindada enemiga se dirige a la base.' } ] },
    { id:'atlas-4', nombre:'Dominio del canal', enemigo:'hierro', dificultad:'normal', semilla:404, mapa:{ plantilla:'canal', semilla:5 },
      briefing:'El Frente bloquea el canal con monitores fluviales. Hunda su flota y destruya el astillero enemigo sin perder el propio.',
      creditos:[3500, null], edificios:[[0,'astillero',1],[1,'astillero',1],[1,'torre',2]], unidades:[['lancha',2]],
      objetivos:[ { tipo:'hundir', cantidad:4, texto:'Hundir 4 embarcaciones enemigas' }, { tipo:'destruir', edificio:'astillero', texto:'Destruir el astillero enemigo' }, { tipo:'proteger', edificio:'centro', texto:'Conservar el centro de mando' }, { tipo:'proteger', edificio:'astillero', texto:'Conservar el astillero propio', secundario:true } ],
      eventos:[ { en:1, accion:'mensaje', mensaje:'Mando Atlas: las fragatas lanzamisiles bombardean desde lejos. Las lanchas protegen contra embarcaciones rápidas.' },
                { en:150, accion:'refuerzos', jugador:1, unidades:[['lancha',2],['fragata',1]], atacar:true, mensaje:'Radar: flotilla enemiga en el canal.' },
                { en:360, accion:'refuerzos', jugador:1, unidades:[['fragata',2]], atacar:true, mensaje:'Dos monitores enemigos se acercan.' } ] }
  ] },
  hierro: { nombre:'Puño de Hierro', lema:'El Frente resiste y golpea con todo su peso.', misiones:[
    { id:'hierro-1', nombre:'La leva', enemigo:'atlas', dificultad:'facil', semilla:111, mapa:{ plantilla:'estandar' },
      briefing:'Una avanzada de la Coalición amenaza la frontera. Reúna a la infantería en masa, cause veinte bajas y destruya su cuartel.',
      objetivos:[ { tipo:'bajas', cantidad:20, texto:'Causar 20 bajas' }, { tipo:'destruir', edificio:'cuartel', texto:'Destruir el cuartel enemigo' }, { tipo:'proteger', edificio:'centro', texto:'Conservar el centro de mando' } ],
      eventos:[ { en:1, accion:'mensaje', mensaje:'Mariscalato: la horda da +25 % de daño con cuatro aliados cerca. Avance en grupo.' },
                { en:90, accion:'refuerzos', jugador:0, unidades:[['infanteria',5]], mensaje:'La leva envía cinco infantes.' } ] },
    { id:'hierro-2', nombre:'Muro de acero', enemigo:'guerrilla', dificultad:'normal', semilla:222, mapa:{ plantilla:'rio', semilla:5 },
      briefing:'La guerrilla cruzará el río en oleadas. Resista diez minutos sin perder el centro de mando.',
      objetivos:[ { tipo:'sobrevivir', segundos:600, texto:'Resistir 10 minutos' }, { tipo:'proteger', edificio:'centro', texto:'Conservar el centro de mando' }, { tipo:'bajas', cantidad:40, texto:'Causar 40 bajas', secundario:true } ],
      eventos:[ { en:1, accion:'mensaje', mensaje:'Mariscalato: el río solo se cruza por los vados. Fortifíquelos con torres.' },
                { en:120, accion:'refuerzos', jugador:1, unidades:[['infanteria',6],['tecnico',2]], atacar:true, mensaje:'Primera oleada guerrillera en el vado.' },
                { en:300, accion:'refuerzos', jugador:1, unidades:[['infanteria',8],['tecnico',3],['artilleria',1]], atacar:true, mensaje:'Segunda oleada, con artillería ligera.' },
                { en:330, accion:'refuerzos', jugador:0, unidades:[['pesado',2]], mensaje:'Llegan dos tanques pesados.' },
                { en:480, accion:'refuerzos', jugador:1, unidades:[['infanteria',10],['tecnico',4],['artilleria',2]], atacar:true, mensaje:'Última oleada. Resista.' } ] },
    { id:'hierro-3', nombre:'Ocaso nuclear', enemigo:'atlas', dificultad:'dificil', semilla:333, mapa:{ plantilla:'estandar' }, rango:3,
      briefing:'Es hora de terminar la guerra. Construya el silo nuclear y destruya todas las instalaciones de la Coalición.',
      edificios:[[1,'torre',3]],
      objetivos:[ { tipo:'construir', edificio:'superarma', texto:'Construir el silo nuclear' }, { tipo:'destruir', texto:'Destruir todos los edificios enemigos' }, { tipo:'pozos', cantidad:3, texto:'Controlar 3 pozos', secundario:true } ],
      eventos:[ { en:1, accion:'mensaje', mensaje:'Mariscalato: el silo requiere rango 3 y energía estable. Proteja las plantas.' },
                { en:420, accion:'ataque', jugador:1, mensaje:'La Coalición lanza su ofensiva aérea.' } ] },
    { id:'hierro-4', nombre:'Bloqueo fluvial', enemigo:'atlas', dificultad:'normal', semilla:414, mapa:{ plantilla:'canal', semilla:8 },
      briefing:'La Coalición intentará forzar el canal. Resista ocho minutos y hunda cinco de sus embarcaciones.',
      creditos:[3000, null], edificios:[[0,'astillero',1],[0,'torre',2]],
      objetivos:[ { tipo:'sobrevivir', segundos:480, texto:'Resistir 8 minutos' }, { tipo:'hundir', cantidad:5, texto:'Hundir 5 embarcaciones' }, { tipo:'proteger', edificio:'centro', texto:'Conservar el centro de mando' } ],
      eventos:[ { en:1, accion:'mensaje', mensaje:'Mariscalato: las torres y los tanques en la orilla también hunden barcos.' },
                { en:100, accion:'refuerzos', jugador:1, unidades:[['lancha',3]], atacar:true, mensaje:'Lanchas enemigas en el canal.' },
                { en:240, accion:'refuerzos', jugador:1, unidades:[['lancha',2],['fragata',2]], atacar:true, mensaje:'Fragatas lanzamisiles a la vista.' },
                { en:380, accion:'refuerzos', jugador:1, unidades:[['fragata',3],['lancha',2]], atacar:true, mensaje:'Última oleada naval. Resista.' } ] }
  ] },
  guerrilla: { nombre:'Red de Sombras', lema:'La Red libera el desierto célula por célula.', misiones:[
    { id:'guerrilla-1', nombre:'Arena y pozos', enemigo:'hierro', dificultad:'facil', semilla:121, mapa:{ plantilla:'estandar' },
      briefing:'Los pozos del sector financian al Frente. Tome tres pozos y cause quince bajas sin exponerse.',
      objetivos:[ { tipo:'pozos', cantidad:3, texto:'Capturar 3 pozos petroleros' }, { tipo:'bajas', cantidad:15, texto:'Causar 15 bajas' }, { tipo:'proteger', edificio:'centro', texto:'Conservar el centro de mando' } ],
      eventos:[ { en:1, accion:'mensaje', mensaje:'Célula central: los rebeldes se camuflan si no disparan. Los túneles curan a las unidades.' },
                { en:150, accion:'refuerzos', jugador:0, unidades:[['tecnico',2]], mensaje:'Dos técnicos se suman a la célula.' } ] },
    { id:'guerrilla-2', nombre:'Sabotaje', enemigo:'atlas', dificultad:'normal', semilla:232, mapa:{ plantilla:'desfiladero', semilla:3 },
      briefing:'La Coalición instaló un aeródromo protegido por torres. Destrúyalo en menos de quince minutos.',
      edificios:[[1,'aerodromo',1],[1,'torre',3]],
      objetivos:[ { tipo:'destruir', edificio:'aerodromo', texto:'Destruir el aeródromo' }, { tipo:'limite', segundos:900, texto:'Antes de 15 minutos' }, { tipo:'proteger', edificio:'centro', texto:'Conservar el centro de mando' } ],
      eventos:[ { en:1, accion:'mensaje', mensaje:'Célula central: el poder de sabotaje apaga torres y producción enemiga durante 25 segundos.' },
                { en:420, accion:'mensaje', mensaje:'Quedan ocho minutos.' }, { en:780, accion:'mensaje', mensaje:'Quedan dos minutos.' } ] },
    { id:'guerrilla-3', nombre:'La gran rebelión', enemigo:'hierro', dificultad:'dificil', semilla:343, mapa:{ plantilla:'rio', semilla:9 }, rango:3,
      briefing:'El Jefe rebelde encabeza el levantamiento. Destruya todas las instalaciones del Frente. El Jefe no puede caer.',
      unidades:[['heroe',1],['tecnico',2]],
      objetivos:[ { tipo:'destruir', texto:'Destruir todos los edificios enemigos' }, { tipo:'proteger_heroe', texto:'El Jefe rebelde debe sobrevivir' }, { tipo:'construir', edificio:'superarma', texto:'Construir la tormenta de cohetes', secundario:true } ],
      eventos:[ { en:1, accion:'mensaje', mensaje:'Célula central: el pueblo se levanta. Llegarán voluntarios.' },
                { en:300, accion:'refuerzos', jugador:0, unidades:[['infanteria',8]], mensaje:'Ocho voluntarios rebeldes se unen.' },
                { en:600, accion:'refuerzos', jugador:0, unidades:[['artilleria',2],['tecnico',2]], mensaje:'Artillería capturada llega desde el norte.' } ] },
    { id:'guerrilla-4', nombre:'Piratas del canal', enemigo:'atlas', dificultad:'normal', semilla:424, mapa:{ plantilla:'canal', semilla:3 },
      briefing:'La Coalición mueve suministros por el canal. Con lanchas rápidas, hunda tres embarcaciones y destruya su astillero.',
      creditos:[2500, null], edificios:[[0,'astillero',1],[1,'astillero',1]], unidades:[['lancha',3]],
      objetivos:[ { tipo:'hundir', cantidad:3, texto:'Hundir 3 embarcaciones' }, { tipo:'destruir', edificio:'astillero', texto:'Destruir el astillero enemigo' }, { tipo:'pozos', cantidad:3, texto:'Controlar 3 pozos', secundario:true } ],
      eventos:[ { en:1, accion:'mensaje', mensaje:'Célula central: las lanchas rápidas golpean y se retiran. Evite las fragatas.' },
                { en:120, accion:'refuerzos', jugador:1, unidades:[['lancha',2]], atacar:true, mensaje:'Patrulla enemiga en el canal.' },
                { en:300, accion:'refuerzos', jugador:0, unidades:[['lancha',2]], mensaje:'Dos lanchas capturadas se suman.' } ] }
  ] }
};
const MISSIONS = {}; for(const f in CAMPAIGNS) CAMPAIGNS[f].misiones.forEach((m,i) => { m.faccion = f; m.orden = i; MISSIONS[m.id] = m; });
// Entrenamiento básico: fuera de las campañas. La facción del jugador se elige en el menú (por defecto Atlas).
MISSIONS.tutorial = { id:'tutorial', nombre:'Entrenamiento básico', faccion:'atlas', orden:-1, enemigo:'hierro', dificultad:'facil', semilla:7, mapa:{ plantilla:'estandar' }, sinIA:true,
  briefing:'Recorrido guiado por los controles: mover, construir, producir, capturar y atacar. El enemigo no responde.',
  quitar:{ 1:['infanteria','tanque','pesado','recolector','constructor','tecnico'] },
  objetivos:[ { tipo:'llegar', x:22, z:40, r:3, texto:'Mover cualquier unidad al marcador' },
              { tipo:'construir', edificio:'torre', texto:'Construir una torre de defensa' },
              { tipo:'unidades', unidad:'infanteria', cantidad:7, texto:'Tener 7 unidades de infantería' },
              { tipo:'pozos', cantidad:1, texto:'Capturar un pozo petrolero' },
              { tipo:'destruir', edificio:'cuartel', texto:'Destruir el cuartel enemigo' } ],
  eventos:[ { en:1, accion:'mensaje', mensaje:'Paso 1: arrastre para seleccionar unidades y haga clic derecho sobre el marcador ámbar. En pantalla táctil, toque las unidades y luego el marcador.' },
            { alCumplir:0, accion:'mensaje', mensaje:'Paso 2: seleccione el constructor, elija «Torre de defensa» y ubíquela en terreno explorado.' },
            { alCumplir:1, accion:'mensaje', mensaje:'Paso 3: seleccione el cuartel y entrene infantería hasta tener siete.' },
            { alCumplir:2, accion:'creditos', jugador:0, cantidad:500, mensaje:'Paso 4: con infantería seleccionada, haga clic derecho sobre un pozo petrolero para capturarlo. Recibe 500 créditos.' },
            { alCumplir:3, accion:'revelar', segundos:30, mensaje:'Paso 5: la base enemiga queda visible. Use «Atacar-mover» o clic derecho sobre el cuartel enemigo.' } ] };

// Plantillas de mapas de misión. Generación determinista y simétrica respecto al centro.
function generateMap(tpl, seed){
  if(!tpl || tpl==='estandar') return null;
  const rnd = mulberry32(seed || 1), T = new Array(NCELLS).fill('.');
  const set = (x,z,c) => { if(x<0||z<0||x>=GRID||z>=GRID) return; T[z*GRID+x] = c; T[(GRID-1-z)*GRID+(GRID-1-x)] = c; };
  const disc = (cx,cz,r,c) => { for(let z=-r; z<=r; z++) for(let x=-r; x<=r; x++) if(x*x+z*z <= r*r) set(cx+x,cz+z,c); };
  let nombre = 'Mapa', depots = [], wells = [];
  if(tpl==='rio'){
    nombre = 'Río de los vados';
    for(let x=0; x<GRID; x++){ const z = GRID-1-x + Math.round(Math.sin(x*0.3+seed)*1.5); for(const d of [-1,0,1]) set(x, z+d, 'w'); }
    for(const [fx,fz] of [[17,46],[31,32]]) disc(fx, fz, 3, '.');
    for(let k=0; k<14; k++) disc(4+Math.floor(rnd()*28), 4+Math.floor(rnd()*28), 1, 'r');
    depots = [[12,50,2500],[21,40,3500],[8,32,3000],[30,44,3000]]; wells = [[24,52],[6,24]];
  } else if(tpl==='oasis'){
    nombre = 'Oasis central';
    disc(31, 31, 6, 'w');
    for(let k=0; k<18; k++) disc(2+Math.floor(rnd()*30), 2+Math.floor(rnd()*30), 1+Math.floor(rnd()*2), 'r');
    depots = [[12,50,2500],[21,44,3500],[22,30,3500],[30,20,3000]]; wells = [[14,30],[34,50],[24,38]];
  } else if(tpl==='desfiladero'){
    nombre = 'Desfiladero';
    for(let i=4; i<60; i++){ const a = i, b = GRID-1-i; for(const off of [-9, 9]){ const x = a + off, z = b; if(Math.abs(i-32)>3 && Math.abs(i-18)>2) { set(x, z, 'r'); set(x+1, z, 'r'); } } }
    for(let k=0; k<10; k++) disc(5+Math.floor(rnd()*24), 5+Math.floor(rnd()*24), 1, 'r');
    depots = [[12,50,2500],[2,40,2500],[21,44,3500],[26,26,4000]]; wells = [[14,30],[34,50]];
  }
  else if(tpl==='cruce'){
    nombre = 'Cruce de crestas';
    for(let i=0; i<GRID; i++){
      const pass = v => (v>=8 && v<=12) || (v>=29 && v<=34) || (v>=51 && v<=55);
      if(!pass(i)){ set(i, 32, 'r'); set(i, 31, 'r'); set(32, i, 'r'); set(31, i, 'r'); }
    }
    for(let k=0; k<8; k++) disc(4+Math.floor(rnd()*24), 34+Math.floor(rnd()*24), 1, 'r');
    depots = [[12,50,2500],[2,40,2500],[22,40,3500],[18,22,3000]]; wells = [[24,52],[6,24],[40,40]];
  }
  else if(tpl==='lagos'){
    nombre = 'Lagos dispersos';
    for(let k=0; k<5; k++) disc(6+Math.floor(rnd()*26), 6+Math.floor(rnd()*26), 2+Math.floor(rnd()*2), 'w');
    for(let k=0; k<12; k++) disc(3+Math.floor(rnd()*28), 3+Math.floor(rnd()*28), 1, 'r');
    depots = [[12,50,2500],[21,44,3500],[24,28,3500],[8,30,3000]]; wells = [[14,30],[34,50],[28,38]];
  }
  else if(tpl==='meseta'){
    nombre = 'Meseta central';
    for(let a=0; a<360; a+=2){
      const ang = a*Math.PI/180, r = 12;
      if(a%90 > 20 && a%90 < 70) continue;                       // cuatro accesos diagonales
      set(31 + Math.round(Math.cos(ang)*r), 31 + Math.round(Math.sin(ang)*r), 'r');
    }
    for(let k=0; k<10; k++) disc(3+Math.floor(rnd()*20), 36+Math.floor(rnd()*22), 1, 'r');
    depots = [[12,50,2500],[2,40,2500],[31,31,6000],[26,26,3000]]; wells = [[14,30],[34,50],[30,36]];
  }
  else if(tpl==='canal'){
    nombre = 'Canal';
    for(let z=0; z<GRID; z++) for(let x=0; x<GRID; x++){
      if(Math.abs(x-z) > 4) continue;
      const along = (x+z)/2;
      if(Math.abs(along-20) <= 3 || Math.abs(along-43) <= 3) continue;   // puentes
      T[z*GRID+x] = 'w';
    }
    for(let k=0; k<12; k++) disc(3+Math.floor(rnd()*22), 30+Math.floor(rnd()*28), 1, 'r');
    depots = [[12,50,2500],[2,40,2500],[21,44,3500],[24,36,3000]]; wells = [[14,30],[30,50]];
  }
  // las bases y los recursos quedan libres; se reflejan los recursos
  const md = [], mw = [];
  for(const [x,z,a] of depots){ md.push([x,z,a]); md.push([GRID-2-x, GRID-2-z, a]); }
  for(const [x,z] of wells){ mw.push([x,z]); mw.push([GRID-2-x, GRID-2-z]); }
  for(const [x,z] of md.concat(mw)) for(let dz=-1; dz<=2; dz++) for(let dx=-1; dx<=2; dx++){ const xx=x+dx, zz=z+dz; if(xx>=0&&zz>=0&&xx<GRID&&zz<GRID) T[zz*GRID+xx] = '.'; }
  for(let z=0; z<GRID; z++) for(let x=0; x<GRID; x++) if(inBaseZone(x,z)) T[z*GRID+x] = '.';
  return { formato:MAP_FORMAT, version:1, nombre, grid:GRID, terrain:T.join(''), depots:md, wells:mw };
}
// Definición de misión para la simulación: copia profunda con la dificultad elegida
function missionDef(id, dificultad, faccion){
  const m = JSON.parse(JSON.stringify(MISSIONS[id]));
  if(faccion && id==='tutorial') m.faccion = faccion;
  if(dificultad) m.dificultad = dificultad;
  return m;
}
// ======================= CAMPAIGN-END =======================


// ======================= RENDER =======================
const TEAM = [0x2f6fd8, 0xc8452f], TEAM_DARK = [0x24529c, 0x8f3022], NEUTRAL = 0x8a8070;
// Paleta accesible (Okabe-Ito): azul y naranja, distinguibles con las formas más comunes de daltonismo
const PALETTES = { clasica:{ team:[0x2f6fd8, 0xc8452f], dark:[0x24529c, 0x8f3022], css:['#2f6fd8','#c8452f'] }, accesible:{ team:[0x0072b2, 0xe69f00], dark:[0x005282, 0xb07800], css:['#0072b2','#e69f00'] } };
const teamColor = o => o>=0 ? TEAM[o] : NEUTRAL;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2220);
scene.fog = new THREE.Fog(0x1d2220, 120, 250);
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
scene.add(new THREE.HemisphereLight(0xf3ead6, 0x6e5c44, 0.62));
const sun = new THREE.DirectionalLight(0xffeccc, 0.72);
sun.position.set(WORLD/2-60, 95, WORLD/2+35); sun.target.position.set(WORLD/2, 0, WORLD/2);
sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera, { left:-100, right:100, top:100, bottom:-100, near:10, far:280 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

// Niebla de guerra: textura 64×64 muestreada en el shader de cada material por posición de mundo
const fogData = new Uint8Array(NCELLS*4), fogCur = new Float32Array(NCELLS);
const fogTex = new THREE.DataTexture(fogData, GRID, GRID, THREE.RGBAFormat);
fogTex.magFilter = THREE.LinearFilter; fogTex.minFilter = THREE.LinearFilter; fogTex.needsUpdate = true;
const fogUniform = { value:fogTex };
function addFog(m){
  m.onBeforeCompile = sh => {
    sh.uniforms.uFogTex = fogUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogUv;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 fogWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fogWp = instanceMatrix * fogWp;
        #endif
        fogWp = modelMatrix * fogWp;
        vFogUv = fogWp.xz / ${WORLD.toFixed(1)};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogUv;\nuniform sampler2D uFogTex;')
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb *= texture2D(uFogTex, vFogUv).r;\n#include <fog_fragment>');
  };
  return m;
}
function updateFog(dt, snap){
  const v=visGrid(), ex=expGrid(), k=snap ? 1 : Math.min(1, dt*6);
  for(let i=0; i<NCELLS; i++){
    const t = v[i] ? 1 : ex[i] ? 0.5 : 0.1;
    fogCur[i] += (t-fogCur[i])*k;
    const b = Math.round(fogCur[i]*255); fogData[i*4]=b; fogData[i*4+1]=b; fogData[i*4+2]=b; fogData[i*4+3]=255;
  }
  fogTex.needsUpdate = true;
}

// Terreno
(function buildGround(){
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, GRID, GRID);
  geo.rotateX(-Math.PI/2); geo.translate(WORLD/2, 0, WORLD/2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count*3);
  const light = new THREE.Color(0xc6ae80), dark = new THREE.Color(0xa58c60), c = new THREE.Color();
  for(let i=0; i<pos.count; i++){
    const x=pos.getX(i), z=pos.getZ(i);
    const n = (Math.sin(x*0.09)+Math.sin(z*0.11+1.7)+Math.sin((x+z)*0.05+0.4)+Math.sin((x-z)*0.17)*0.5)/3.5*0.5+0.5;
    c.copy(dark).lerp(light, n); cols[i*3]=c.r; cols[i*3+1]=c.g; cols[i*3+2]=c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols,3));
  const m = new THREE.Mesh(geo, addFog(new THREE.MeshLambertMaterial({ vertexColors:true })));
  m.receiveShadow = true; scene.add(m);
  const grid = new THREE.GridHelper(WORLD, GRID/2, 0x5b4a2e, 0x5b4a2e);
  grid.position.set(WORLD/2, 0.03, WORLD/2); grid.material.transparent = true; grid.material.opacity = 0.06; scene.add(grid);
})();

const matCache = new Map(), geoCache = new Map();
// Tinte por facción: los colores neutros de cada modelo se mezclan con el tono de la facción del dueño
let TINT = null;
const FTINT = { atlas:{ c:0x9fb6cc, k:0.32, b:1.06 }, hierro:{ c:0x5b3b2c, k:0.36, b:0.85 }, guerrilla:{ c:0x7d7a3e, k:0.4, b:0.95 } };
const NOTINT = new Set([0x2f6fd8, 0xc8452f, 0x24529c, 0x8f3022, 0x8a8070, 0xd1ad84, 0xf2d16b, 0xb8d4e0, 0xd9a23a, 0x9fd0e8, 0xe8c43a]);
function tintColor(color, t){
  const f = FTINT[t], c = new THREE.Color(color).lerp(new THREE.Color(f.c), f.k); c.multiplyScalar(f.b); return c;
}
function mat(color){
  const t = TINT && !NOTINT.has(color) ? TINT : '', key = color + ':' + t;
  if(!matCache.has(key)) matCache.set(key, addFog(new THREE.MeshLambertMaterial({ color: t ? tintColor(color, t) : color })));
  return matCache.get(key);
}
function decorate(body, e, s, f){
  if(e.type==='pozo' || e.type==='tunel') return;
  if(f==='atlas'){
    body.add(box(s*0.5,0.22,0.05,0x9fd0e8,0,0.9,s*0.47));
    if(e.n>=2){ const d = new THREE.Mesh(geo('adish',()=>new THREE.SphereGeometry(0.45,10,6,0,Math.PI*2,0,Math.PI/2.4)), mat(0xd9d2c0)); d.position.set(-s*0.32, e.type==='centro'?3.1:1.9, -s*0.3); d.rotation.x = -0.7; body.add(d); }
  } else if(f==='hierro'){
    body.add(box(s*0.97,0.14,s*0.97,0x34312d,0,0.55,0));
    for(const sx of [-1,1]) body.add(cyl(0.12,0.9,0x34312d,sx*s*0.38,e.type==='torre'?1.4:1.4,s*0.38,6,0.02));
  } else if(f==='guerrilla'){
    const r = s*0.56, n = Math.max(6, e.n*4);
    for(let i=0; i<n; i++){ const a = i/n*Math.PI*2; const sb = box(0.55,0.28,0.32,0x9a8a5c); sb.position.set(Math.cos(a)*r, 0.14, Math.sin(a)*r); sb.rotation.y = -a; body.add(sb); }
    if(e.n>=2) body.add(box(s*0.8,0.05,s*0.8,0x5f6a3a,0,e.type==='fabrica'?2.45:e.type==='centro'?1.65:1.62,0));
  }
}
function geo(key, make){ if(!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
function box(w,h,d,color,x=0,y=0,z=0){ const m=new THREE.Mesh(geo(`b${w}_${h}_${d}`,()=>new THREE.BoxGeometry(w,h,d)), mat(color)); m.position.set(x,y+h/2,z); m.castShadow=true; m.receiveShadow=true; return m; }
function cyl(r,h,color,x=0,y=0,z=0,seg=10,rTop=r){ const m=new THREE.Mesh(geo(`c${r}_${rTop}_${h}_${seg}`,()=>new THREE.CylinderGeometry(rTop,r,h,seg)), mat(color)); m.position.set(x,y+h/2,z); m.castShadow=true; m.receiveShadow=true; return m; }
function barrel(len, r, color){ const b=new THREE.Mesh(geo(`br${len}_${r}`,()=>new THREE.CylinderGeometry(r,r,len,8)), mat(color)); b.rotation.x=Math.PI/2; b.castShadow=true; return b; }
function makeRing(r, color){
  const m = new THREE.Mesh(geo(`r${r}`, () => new THREE.RingGeometry(r, r+0.2, 36)), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.9, depthWrite:false }));
  m.rotation.x = -Math.PI/2; m.position.y = 0.06; m.visible = false; return m;
}
function buildModel(e){
  TINT = e.owner>=0 && S.players[e.owner] ? S.players[e.owner].faction : null;
  const g = new THREE.Group(), body = new THREE.Group(), o = { g, body, yaw:0, targetYaw:0, owner:e.owner };
  g.add(body);
  if(e.kind==='bld'){
    const s = e.n*CELL, tc = teamColor(e.owner);
    if(e.type==='centro'){
      body.add(box(s*0.94,1.6,s*0.94,0xb8ab92));
      body.add(box(s*0.62,1.5,s*0.62,tc,0,1.6,0));
      body.add(box(s*0.3,0.8,s*0.3,0xd9cfb9,-s*0.12,3.1,s*0.1));
      body.add(cyl(0.08,2.6,0x3a3a34,s*0.25,3.1,-s*0.25,6));
      body.add(box(s*0.94,0.15,0.35,tc,0,0.9,s*0.47));
    } else if(e.type==='cuartel'){
      body.add(box(s*0.9,1.5,s*0.9,0x8f8a6a));
      for(const sgn of [1,-1]){ const r = box(s*0.96,0.14,s*0.56,tc); r.position.set(0,1.78,sgn*s*0.22); r.rotation.x = sgn*0.42; body.add(r); }
      body.add(box(0.9,1.0,0.1,0x2b2b26,0,0,s*0.45));
    } else if(e.type==='fabrica'){
      body.add(box(s*0.95,2.3,s*0.7,0xa39a86,0,0,-s*0.08));
      body.add(box(s*0.95,0.2,0.4,tc,0,1.9,s*0.27));
      body.add(cyl(0.35,1.8,0x4a4740,-s*0.3,2.3,-s*0.25));
      body.add(cyl(0.35,1.4,0x4a4740,-s*0.1,2.3,-s*0.25));
      body.add(box(s*0.5,1.5,0.1,0x2b2b26,s*0.1,0,s*0.27));
    } else if(e.type==='planta'){
      body.add(box(s*0.92,0.5,s*0.92,0x9c937f));
      body.add(cyl(0.8,2.2,0xcfc8b8,-0.85,0.5,-0.3,14,0.55));
      body.add(cyl(0.8,2.2,0xcfc8b8,0.85,0.5,-0.3,14,0.55));
      body.add(box(s*0.92,0.3,0.5,tc,0,0.5,s*0.4));
    } else if(e.type==='torre'){
      body.add(cyl(0.85,1.5,0x9c937f,0,0,0,8,0.7));
      const tur = new THREE.Group(); tur.position.y = 1.5;
      tur.add(box(1.0,0.55,1.0,tc));
      const b = barrel(1.3,0.1,0x2f2f2a); b.position.set(0,0.3,0.85); tur.add(b);
      body.add(tur); o.turret = tur;
    } else if(e.type==='aerodromo'){
      body.add(box(s*0.96,0.12,s*0.5,0x55524a,0,0,s*0.15));
      for(let i=-2; i<=2; i++) body.add(box(0.7,0.02,0.12,0xe9e2cc,i*1.1,0.12,s*0.15));
      body.add(box(s*0.45,1.6,s*0.38,0xa39a86,-s*0.22,0,-s*0.27));
      body.add(box(s*0.45,0.2,s*0.38,tc,-s*0.22,1.6,-s*0.27));
      body.add(cyl(0.35,2.6,0x8f8a7a,s*0.3,0,-s*0.3,8));
      body.add(box(1.0,0.6,1.0,tc,s*0.3,2.6,-s*0.3));
    } else if(e.type==='pozo'){
      body.add(box(s*0.9,0.25,s*0.9,0x6b6152));
      body.add(cyl(0.5,1.2,0x4f4a40,0.7,0.25,0.7,10));
      body.add(box(0.25,1.9,0.25,0x4a4740,-0.4,0.25,0));
      const beam = new THREE.Group(); beam.position.set(-0.4,2.15,0);
      beam.add(box(2.6,0.22,0.3,tc,0,-0.11,0));
      beam.add(box(0.5,0.7,0.35,0x3a3a34,1.3,-0.7,0));
      body.add(beam); o.beam = beam;
      body.add(box(0.6,0.5,0.6,tc,-1.2,0.25,0.9));
    } else if(e.type==='tunel'){
      body.add(cyl(1.0,0.6,0x7a6a50,0,0,0,10,0.75));
      body.add(box(0.9,0.6,0.5,0x2b2620,0,0.15,0.6));
      body.add(box(1.1,0.15,0.2,tc,0,0.75,0.6));
      const tur = new THREE.Group(); tur.position.y = 0.6; const b = barrel(0.9,0.06,0x2f2f2a); b.position.set(0,0.25,0.45); tur.add(b); body.add(tur); o.turret = tur;
    } else if(e.type==='astillero'){
      body.add(box(s*0.95,0.5,s*0.95,0x8a8272));
      body.add(box(s*0.4,1.6,s*0.6,0xa39a86,-s*0.25,0.5,0));
      body.add(box(s*0.4,0.18,0.3,tc,-s*0.25,1.9,s*0.3));
      body.add(cyl(0.12,3.0,0x5a5850,s*0.3,0.5,-s*0.3,6));
      const arm = box(0.16,0.16,s*0.75,0x5a5850); arm.position.set(s*0.3,3.4,-s*0.05); body.add(arm);
      body.add(box(s*0.45,0.12,s*0.9,0x6b5a40,s*0.22,0.5,0));
    } else if(e.type==='superarma'){
      const kind = BT(e.owner,'superarma').superKind;
      body.add(box(s*0.95,0.6,s*0.95,0x8a8272));
      body.add(box(s*0.95,0.15,0.4,tc,0,0.6,s*0.45));
      if(kind==='particulas'){
        body.add(cyl(1.3,2.2,0xb8b0a0,0,0.6,0,12,0.9));
        const dish = new THREE.Mesh(geo('dish',()=>new THREE.SphereGeometry(1.6,16,8,0,Math.PI*2,0,Math.PI/2.6)), mat(0xd9d2c0)); dish.rotation.x = Math.PI; dish.position.y = 3.6; dish.castShadow = true; body.add(dish);
        body.add(cyl(0.12,1.6,tc,0,2.8,0,6));
      } else if(kind==='nuclear'){
        body.add(box(s*0.7,0.5,s*0.7,0x5a5850,0,0.6,0));
        for(const sx of [-1,1]){ const d = box(s*0.33,0.2,s*0.68,0x6e6a5e); d.position.set(sx*s*0.18,1.15,0); d.rotation.z = sx*0.5; body.add(d); }
        body.add(cyl(0.45,2.4,0xe0d8c4,0,0.6,0,10));
        const tip = new THREE.Mesh(geo('ntip',()=>new THREE.ConeGeometry(0.45,0.9,10)), mat(tc)); tip.position.y = 3.45; tip.castShadow = true; body.add(tip);
      } else {
        for(let i=0; i<3; i++){ const rack = box(s*0.8,0.35,0.6,0x5e5a4c); rack.position.set(0,0.9+i*0.1,-0.9+i*0.9); rack.rotation.x = -0.5; body.add(rack);
          for(let k=-2; k<=2; k++){ const r = barrel(0.9,0.12,tc); r.position.set(k*0.7,1.25+i*0.1,-0.9+i*0.9); r.rotation.x = Math.PI/2 - 0.5; body.add(r); } }
      }
    }
    if(TINT) decorate(body, e, s, TINT);
    o.ring = makeRing(s*0.75, 0x9be36b);
  } else if(e.kind==='crate'){
    body.add(box(0.8,0.5,0.8,0x6e6a5e,0,0,0)); body.add(box(0.5,0.35,0.4,0x8c7a55,0.3,0.5,0.1)); body.add(box(0.12,0.12,0.9,0x4a4740,-0.3,0.5,0));
  } else if(e.kind==='depot'){
    const c1=0xd9a23a, st=0x6b4a1c;
    body.add(box(3.4,0.2,3.4,0x7a6342));
    [[-0.8,-0.8],[0.8,-0.8],[-0.8,0.8],[0.8,0.8]].forEach(([x,z]) => { body.add(box(1.4,1.2,1.4,c1,x,0.2,z)); body.add(box(1.45,0.18,0.25,st,x,0.65,z)); });
    body.add(box(1.4,1.1,1.4,c1,0,1.4,0));
  } else {
    const tc = TEAM[e.owner], td = TEAM_DARK[e.owner];
    if(e.type==='infanteria'){
      body.add(cyl(0.26,0.75,tc,0,0,0,8));
      const head = new THREE.Mesh(geo('head',()=>new THREE.SphereGeometry(0.2,8,6)), mat(0xd1ad84)); head.position.y=0.95; head.castShadow=true; body.add(head);
      body.add(box(0.08,0.08,0.8,0x2b2b26,0.22,0.5,0.25));
      body.scale.setScalar(1.25);
    } else if(e.type==='tanque' || e.type==='pesado'){
      const k = e.type==='pesado' ? 1.25 : 1;
      body.add(box(0.45*k,0.55,2.3*k,0x3a3a34,-0.72*k,0,0));
      body.add(box(0.45*k,0.55,2.3*k,0x3a3a34,0.72*k,0,0));
      body.add(box(1.25*k,0.55,2.0*k,td,0,0.25,0));
      const tur = new THREE.Group(); tur.position.y = 0.8;
      tur.add(box(1.0*k,0.45*k,1.1*k,tc,0,0,-0.1));
      const offs = e.type==='pesado' ? [-0.18,0.18] : [0];
      for(const ox of offs){ const b = barrel(1.5*k,0.09,0x2f2f2a); b.position.set(ox,0.22*k,0.95*k); tur.add(b); }
      body.add(tur); o.turret = tur;
    } else if(e.type==='antiaereo'){
      body.add(box(1.2,0.5,2.0,td,0,0.2,0));
      [[-0.6,0.6],[0.6,0.6],[-0.6,-0.6],[0.6,-0.6]].forEach(([x,z]) => body.add(box(0.25,0.4,0.5,0x2b2b26,x,0,z)));
      const tur = new THREE.Group(); tur.position.set(0,0.7,-0.2);
      tur.add(box(0.9,0.35,0.8,tc));
      for(const ox of [-0.22,0.22]){ const b = barrel(1.2,0.07,0x2f2f2a); b.rotation.x = Math.PI/2 - 0.6; b.position.set(ox,0.55,0.35); tur.add(b); }
      body.add(tur); o.turret = tur;
    } else if(e.type==='avion'){
      const fus = barrel(2.6,0.28,tc); body.add(fus);
      body.add(box(3.0,0.08,0.8,td,0,-0.04,-0.1));
      body.add(box(1.1,0.06,0.45,td,0,0,-1.1));
      body.add(box(0.08,0.55,0.45,tc,0,0.05,-1.1));
      const nose = new THREE.Mesh(geo('nose',()=>new THREE.ConeGeometry(0.28,0.6,8)), mat(0xd9cfb9)); nose.rotation.x = Math.PI/2; nose.position.z = 1.6; body.add(nose);
      body.traverse(m => { if(m.isMesh) m.castShadow = true; });
    } else if(e.type==='lancha'){
      body.add(box(1.0,0.35,2.2,td,0,0,0));
      const bow = new THREE.Mesh(geo('bow1',()=>new THREE.ConeGeometry(0.62,0.9,4)), mat(td)); bow.rotation.x = Math.PI/2; bow.rotation.y = Math.PI/4; bow.scale.set(1,1,0.45); bow.position.set(0,0.17,1.5); body.add(bow);
      body.add(box(0.6,0.4,0.7,tc,0,0.35,-0.2));
      const tur = new THREE.Group(); tur.position.set(0,0.4,0.6); tur.add(box(0.2,0.2,0.2,0x3a3a34)); const b = barrel(0.7,0.04,0x2f2f2a); b.position.set(0,0.12,0.35); tur.add(b); body.add(tur); o.turret = tur;
      o.boat = true;
    } else if(e.type==='fragata'){
      body.add(box(1.5,0.55,3.6,td,0,0,0));
      const bow = new THREE.Mesh(geo('bow2',()=>new THREE.ConeGeometry(0.95,1.3,4)), mat(td)); bow.rotation.x = Math.PI/2; bow.rotation.y = Math.PI/4; bow.scale.set(1,1,0.45); bow.position.set(0,0.27,2.4); body.add(bow);
      body.add(box(1.0,0.7,1.2,0xb8b0a0,0,0.55,-0.6));
      body.add(box(0.5,0.6,0.5,tc,0,1.25,-0.6));
      body.add(cyl(0.05,1.2,0x3a3a34,0,1.85,-0.6,6));
      const tur = new THREE.Group(); tur.position.set(0,0.6,1.0); tur.add(box(0.6,0.35,0.6,0x5a5850)); const b = barrel(1.4,0.08,0x2f2f2a); b.position.set(0,0.2,0.75); tur.add(b); body.add(tur); o.turret = tur;
      o.boat = true;
    } else if(e.type==='helicoptero'){
      body.add(box(0.9,0.75,2.0,tc,0,-0.2,0.2));
      body.add(box(0.7,0.5,0.6,0xb8d4e0,0,0.0,1.1));
      body.add(box(0.22,0.22,1.9,td,0,0.15,-1.7));
      body.add(box(0.08,0.6,0.45,td,0,0.25,-2.55));
      for(const sx of [-1,1]) body.add(box(0.08,0.08,1.9,0x2b2b26,sx*0.5,-0.65,0.2));
      for(const sx of [-1,1]) body.add(box(0.5,0.12,0.3,0x2b2b26,sx*0.6,-0.1,0.3));
      const rotor = new THREE.Group(); rotor.position.y = 0.32; rotor.add(box(4.4,0.04,0.2,0x2b2b26)); rotor.add(box(0.2,0.04,4.4,0x2b2b26)); body.add(rotor); o.rotor = rotor;
    } else if(e.type==='heroe'){
      const f = S.players[e.owner].faction;
      body.add(cyl(0.32,0.85,td,0,0,0,10));
      body.add(box(0.7,0.5,0.12,tc,0,0.35,-0.25));
      const head = new THREE.Mesh(geo('head',()=>new THREE.SphereGeometry(0.2,8,6)), mat(0xd1ad84)); head.position.y=1.05; head.castShadow=true; body.add(head);
      body.add(cyl(0.23,0.1,f==='hierro'?0x3a3a34:f==='atlas'?0x2b3a2b:0x6b4a2a,0,1.17,0,10));
      const gun = box(0.09,0.09,f==='atlas'?1.5:1.0,0x2b2b26,0.25,0.6,f==='atlas'?0.5:0.3); body.add(gun);
      const star = new THREE.Mesh(geo('star',()=>new THREE.OctahedronGeometry(0.16)), mat(0xf2d16b)); star.position.y = 1.55; body.add(star); o.star = star;
      body.scale.setScalar(1.35);
    } else if(e.type==='ingeniero'){
      body.add(cyl(0.26,0.75,tc,0,0,0,8));
      const head = new THREE.Mesh(geo('head',()=>new THREE.SphereGeometry(0.2,8,6)), mat(0xd1ad84)); head.position.y=0.95; head.castShadow=true; body.add(head);
      body.add(cyl(0.24,0.12,0xe8c43a,0,1.05,0,10));
      body.add(box(0.4,0.45,0.22,0x6b6152,0,0.35,-0.28));
      body.scale.setScalar(1.25);
    } else if(e.type==='tecnico'){
      body.add(box(1.15,0.55,2.1,td,0,0.2,0));
      body.add(box(1.0,0.5,0.8,tc,0,0.75,0.55));
      [[-0.6,0.7],[0.6,0.7],[-0.6,-0.7],[0.6,-0.7]].forEach(([x,z]) => body.add(box(0.22,0.4,0.45,0x2b2b26,x,0,z)));
      const tur = new THREE.Group(); tur.position.set(0,0.8,-0.5); tur.add(box(0.25,0.35,0.25,0x3a3a34)); const b = barrel(1.0,0.05,0x2f2f2a); b.position.set(0,0.3,0.45); tur.add(b); body.add(tur); o.turret = tur;
    } else if(e.type==='artilleria'){
      body.add(box(1.2,0.55,2.3,td,0,0.2,0));
      body.add(box(1.0,0.6,0.7,tc,0,0.75,0.75));
      [[-0.62,0.8],[0.62,0.8],[-0.62,-0.2],[0.62,-0.2],[-0.62,-0.9],[0.62,-0.9]].forEach(([x,z]) => body.add(box(0.22,0.45,0.4,0x2b2b26,x,0,z)));
      const tur = new THREE.Group(); tur.position.set(0,0.8,-0.5); tur.add(box(0.7,0.35,0.7,0x5a5850)); const b = barrel(2.4,0.1,0x2f2f2a); b.rotation.x = Math.PI/2 - 0.45; b.position.set(0,0.75,0.95); tur.add(b); body.add(tur); o.turret = tur;
    } else if(e.type==='constructor'){
      body.add(box(0.4,0.5,1.9,0x3a3a34,-0.6,0,0));
      body.add(box(0.4,0.5,1.9,0x3a3a34,0.6,0,0));
      body.add(box(1.0,0.6,1.3,0xd9b23a,0,0.3,-0.2));
      body.add(box(0.8,0.55,0.6,tc,0,0.9,-0.35));
      body.add(box(1.6,0.6,0.15,0x5a5850,0,0.1,1.05));
    } else {
      body.add(box(1.25,0.85,0.85,tc,0,0.25,0.75));
      body.add(box(1.35,0.55,1.7,0x8c7a55,0,0.25,-0.45));
      [[-0.65,0.75],[0.65,0.75],[-0.65,-0.75],[0.65,-0.75]].forEach(([x,z]) => body.add(box(0.25,0.45,0.5,0x2b2b26,x,0,z)));
      const cargo = box(1.1,0.45,1.3,0xd9a23a,0,0.8,-0.45); cargo.visible = false; body.add(cargo); o.cargo = cargo;
    }
    o.ring = makeRing(e.radius*1.1, 0x9be36b);
    if(e.air) o.ring.position.y = 0.06 - AIR_Y;
  }
  if(o.ring) g.add(o.ring);
  g.position.set(e.x, e.air ? AIR_Y : 0, e.z);
  TINT = null;
  return o;
}

const meshes = new Map();
let rocksMesh = null;
let waterMesh = null;
function buildWater(){
  if(waterMesh){ scene.remove(waterMesh); waterMesh = null; }
  const cells = []; for(let i=0; i<NCELLS; i++) if(S.water[i]) cells.push(i);
  if(!cells.length) return;
  const m4 = new THREE.Matrix4();
  waterMesh = new THREE.InstancedMesh(geo('water',()=>new THREE.BoxGeometry(CELL,0.12,CELL)), mat(0x3d6e8c), cells.length);
  cells.forEach((i,k) => { m4.makeTranslation(cellCenter(i%GRID), 0.03, cellCenter((i/GRID)|0)); waterMesh.setMatrixAt(k, m4); });
  waterMesh.receiveShadow = true; scene.add(waterMesh);
}
function buildRocks(){
  if(rocksMesh){ scene.remove(rocksMesh); rocksMesh.geometry.dispose(); }
  const g = new THREE.DodecahedronGeometry(CELL*0.62, 0);
  rocksMesh = new THREE.InstancedMesh(g, mat(0x8a7a66), S.rocks.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  S.rocks.forEach((r,i) => { p.set(cellCenter(r.cx), 0.35*r.s, cellCenter(r.cz)); q.setFromEuler(new THREE.Euler(0.2, r.r, 0.15)); s.set(r.s, r.s*0.75, r.s); m.compose(p,q,s); rocksMesh.setMatrixAt(i,m); });
  rocksMesh.castShadow = true; rocksMesh.receiveShadow = true; scene.add(rocksMesh);
}

// Visibilidad para el jugador local
let VIEW_ALL = false;
const ALL1 = new Uint8Array(NCELLS).fill(1);
const visGrid = () => VIEW_ALL ? ALL1 : S.vis[LOCAL];
const expGrid = () => VIEW_ALL ? ALL1 : S.exp[LOCAL];
const visLocal = e => !!visGrid()[cellOf(e)];
function seenLocal(e){
  if(VIEW_ALL) return true;
  if(e.owner===LOCAL) return true;
  if(e.kind==='crate') return visLocal(e);
  if(e.kind==='unit') return visLocal(e) && (!stealthed(e) || detectedBy(e, LOCAL, true));
  if(e.kind==='bld') return !!(e.seen & (1<<LOCAL));
  return !!S.exp[LOCAL][idx(e.cx, e.cz)];
}
const yOf = e => e.air ? AIR_Y : 0;

// ======================= EMBLEMAS DE FACCIÓN (originales) =======================
const EMBLEM = {
  atlas: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke="#5fb4ff" stroke-width="2"/><path d="M6 19 L16 8 L26 19 L21 19 L16 13 L11 19 Z" fill="#5fb4ff"/><path d="M10 23 H22" stroke="#e6eef5" stroke-width="2"/></svg>',
  hierro: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 3 H21 L29 11 V21 L21 29 H11 L3 21 V11 Z" fill="none" stroke="#ff7a45" stroke-width="2.4"/><rect x="8" y="13" width="16" height="6" fill="#ff7a45"/><rect x="13" y="8" width="6" height="16" fill="#f1e3d6"/></svg>',
  guerrilla: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 L19 12 L28 12 L21 18 L24 27 L16 21 L8 27 L11 18 L4 12 L13 12 Z" fill="none" stroke="#b8d057" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="16" r="3.5" fill="#b8d057"/></svg>'
};
function applyTheme(f){
  if(!FACTIONS[f]) return;
  document.body.classList.remove('fac-atlas','fac-hierro','fac-guerrilla'); document.body.classList.add('fac-' + f);
  const e = document.getElementById('facEmblem'); if(e) e.innerHTML = EMBLEM[f];
  const m = document.getElementById('menuEmblem'); if(m) m.innerHTML = EMBLEM[f];
  const t = document.getElementById('txEmblem'); if(t) t.innerHTML = EMBLEM[f];
  const n = document.getElementById('facName'); if(n) n.textContent = FACTIONS[f].nombre;
}

// ======================= SONIDO (Web Audio, generado) =======================
const SFX = { ctx:null, on:true, master:null, noise:null, last:{}, hush:false };
const SFX_GAP = { ack:180, place:200, ready:350, rank:800, win:2000, lose:2000, radio:800, obj:600, rifle:70, aa:90, canon:140, obus:200, torre:120, misil:160, cohete:120, heroe:120, boom:90, big:300, click:40, alert:600, chime:400, capture:500 };
function sfxInit(){
  if(SFX.ctx) { if(SFX.ctx.state==='suspended') SFX.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if(!C) return;
  SFX.ctx = new C(); SFX.master = SFX.ctx.createGain(); SFX.master.gain.value = (typeof OPTIONS!=='undefined' ? OPTIONS.volumen : 45)/100; SFX.master.connect(SFX.ctx.destination);
  const len = SFX.ctx.sampleRate, buf = SFX.ctx.createBuffer(1, len, len), d = buf.getChannelData(0);
  for(let i=0; i<len; i++) d[i] = Math.random()*2-1;
  SFX.noise = buf;
  if(SFX.on) ambient(true);
}
addEventListener('pointerdown', sfxInit, { once:false, passive:true });
addEventListener('keydown', sfxInit, { passive:true });
function sfxNoise(t0, dur, filter, freq, vol, freq2){
  const c = SFX.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = SFX.noise; f.type = filter; f.frequency.setValueAtTime(freq, t0); if(freq2) f.frequency.exponentialRampToValueAtTime(freq2, t0+dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0+dur);
  src.connect(f); f.connect(g); g.connect(SFX.master); src.start(t0, Math.random()*0.5); src.stop(t0+dur+0.02);
}
function sfxTone(t0, dur, type, freq, vol, freq2){
  const c = SFX.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0); if(freq2) o.frequency.exponentialRampToValueAtTime(freq2, t0+dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0+dur);
  o.connect(g); g.connect(SFX.master); o.start(t0); o.stop(t0+dur+0.02);
}
// Volumen según distancia al centro de la cámara. Sin posición: volumen pleno (interfaz y alertas).
function sfx(kind, x, z){
  if(!SFX.on || !SFX.ctx || SFX.hush || SFX.ctx.state!=='running') return;
  const now = performance.now(); if(now - (SFX.last[kind]||0) < (SFX_GAP[kind]||60)) return; SFX.last[kind] = now;
  let v = 1; if(x!==undefined){ const d = Math.hypot(x-cam.x, z-cam.z); v = Math.max(0, 1 - d/(cam.dist*1.6)); if(v < 0.05) return; }
  const t0 = SFX.ctx.currentTime, V = sfxVoice();
  switch(kind){
    case 'rifle': case 'heroe': sfxNoise(t0, 0.05, 'highpass', 1800, 0.35*v); break;
    case 'aa': for(let k=0;k<3;k++) sfxNoise(t0+k*0.05, 0.04, 'highpass', 2200, 0.25*v); break;
    case 'canon': case 'torre': sfxNoise(t0, 0.25, 'lowpass', 500, 0.6*v); sfxTone(t0, 0.2, 'sine', 110, 0.5*v, 45); break;
    case 'obus': sfxNoise(t0, 0.35, 'lowpass', 380, 0.7*v); sfxTone(t0, 0.3, 'sine', 90, 0.5*v, 35); break;
    case 'misil': case 'cohete': sfxNoise(t0, 0.45, 'bandpass', 1400, 0.5*v, 220); break;
    case 'boom': sfxNoise(t0, 0.7, 'lowpass', 700, 0.8*v, 90); sfxTone(t0, 0.5, 'sine', 70, 0.6*v, 30); break;
    case 'big': sfxNoise(t0, 1.8, 'lowpass', 900, 1.0*v, 60); sfxTone(t0, 1.4, 'sine', 55, 0.9*v, 25); break;
    case 'click': sfxTone(t0, 0.05, V.w, V.b*0.8, 0.16); break;
    case 'ack': sfxTone(t0, 0.06, V.w, V.b, 0.12); sfxTone(t0+0.07, 0.07, V.w, V.b*1.25, 0.1); if(V.perc) sfxNoise(t0, 0.03, 'highpass', 3000, 0.12); break;
    case 'place': sfxTone(t0, 0.18, 'sine', 140, 0.35, 70); sfxNoise(t0, 0.12, 'lowpass', 900, 0.3); break;
    case 'ready': sfxTone(t0, 0.09, V.w, V.b*1.5, 0.12); sfxTone(t0+0.1, 0.12, V.w, V.b*2, 0.1); break;
    case 'alert': sfxTone(t0, 0.16, 'square', V.alert, 0.11); sfxTone(t0+0.2, 0.22, 'square', V.alert*0.7, 0.11); break;
    case 'chime': V.chord.forEach((f,i) => sfxTone(t0+i*0.09, 0.3, V.w, f, 0.16)); break;
    case 'capture': V.chord.forEach((f,i) => sfxTone(t0+i*0.07, 0.15, 'triangle', f*0.85, 0.15)); break;
    case 'rank': V.chord.concat([V.chord[0]*2]).forEach((f,i) => sfxTone(t0+i*0.12, 0.35, V.w, f, 0.16)); break;
    case 'obj': sfxTone(t0, 0.12, V.w, V.chord[1], 0.15); sfxTone(t0+0.13, 0.25, V.w, V.chord[2], 0.15); break;
    case 'radio': sfxNoise(t0, 0.18, 'bandpass', 2400, 0.12); sfxTone(t0+0.02, 0.05, 'square', 1400, 0.05); break;
    case 'win': V.chord.concat([V.chord[0]*2, V.chord[2]*2]).forEach((f,i) => sfxTone(t0+i*0.16, 0.5, V.w, f, 0.18)); break;
    case 'lose': [V.chord[2], V.chord[1], V.chord[0], V.chord[0]*0.75].forEach((f,i) => sfxTone(t0+i*0.22, 0.6, V.w, f, 0.16)); break;
  }
}
// Timbre de la interfaz según la facción del jugador local
const VOICES = {
  atlas:{ w:'sine', b:880, alert:990, chord:[523,659,784] },
  hierro:{ w:'square', b:330, alert:520, chord:[196,247,294] },
  guerrilla:{ w:'triangle', b:600, alert:740, chord:[392,466,587], perc:true }
};
function sfxVoice(){ const f = S.players && S.players[LOCAL] ? S.players[LOCAL].faction : soloFaction; return VOICES[f] || VOICES.atlas; }
// Viento de fondo muy suave
function ambient(on){
  if(!SFX.ctx) return;
  if(!SFX.amb){
    const c = SFX.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    src.buffer = SFX.noise; src.loop = true; f.type = 'lowpass'; f.frequency.value = 380; g.gain.value = 0;
    lfo.frequency.value = 0.07; lg.gain.value = 160; lfo.connect(lg); lg.connect(f.frequency);
    src.connect(f); f.connect(g); g.connect(SFX.master); src.start(); lfo.start(); SFX.amb = g;
  }
  SFX.amb.gain.setTargetAtTime(on ? 0.05 : 0, SFX.ctx.currentTime, 0.5);
}
function setSound(on){ SFX.on = on; ambient(on); const b = $('btnSound'); b.classList.toggle('off', !on); b.textContent = on ? 'Sonido' : 'Silencio'; }

// Efectos
const effects = [];
const tracerMat = {
  rifle:new THREE.LineBasicMaterial({ color:0xfff0a0, transparent:true }), canon:new THREE.LineBasicMaterial({ color:0xffc061, transparent:true }),
  torre:new THREE.LineBasicMaterial({ color:0xffd88a, transparent:true }), aa:new THREE.LineBasicMaterial({ color:0xb8f0ff, transparent:true }),
  misil:new THREE.LineBasicMaterial({ color:0xffffff, transparent:true }), obus:new THREE.LineBasicMaterial({ color:0xffb070, transparent:true }),
  cohete:new THREE.LineBasicMaterial({ color:0xffe0a0, transparent:true })
};
const fxSphere = new THREE.SphereGeometry(1, 10, 8);
function addFx(obj, life, kind, extra){ scene.add(obj); effects.push(Object.assign({ obj, life, max:life, kind }, extra||{})); }
function explosion(x, z, size, y){
  const m = new THREE.Mesh(fxSphere, new THREE.MeshBasicMaterial({ color:0xffa040, transparent:true, opacity:0.9, depthWrite:false }));
  m.position.set(x, y!==undefined ? y : size*0.4, z); m.scale.setScalar(size*0.3);
  addFx(m, 0.55, 'boom', { size });
}
function groundRing(x, z, r, color, life, kind){
  const m = new THREE.Mesh(geo(`gr${r}`, () => new THREE.RingGeometry(r*0.92, r, 48)), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.85, depthWrite:false, side:THREE.DoubleSide }));
  m.rotation.x = -Math.PI/2; m.position.set(x, 0.1, z);
  addFx(m, life, kind);
}
function orderMarker(x, z, color){
  const m = new THREE.Mesh(geo('mk',()=>new THREE.RingGeometry(0.6,0.85,28)), new THREE.MeshBasicMaterial({ color, transparent:true, depthWrite:false }));
  m.rotation.x = -Math.PI/2; m.position.set(x, 0.08, z);
  addFx(m, 0.6, 'marker');
}
const visAt = (x,z) => !!visGrid()[idx(toCell(x), toCell(z))];
hooks = {
  spawn(e){ const o = buildModel(e); scene.add(o.g); meshes.set(e.id, o); if(e.kind==='unit' && e.owner===LOCAL && S.tick>1 && !REPLAY) sfx('ready'); },
  death(e){ if(e.kind==='depot' || e.kind==='crate') return; if(e.owner!==LOCAL && !visLocal(e)) return; sfx('boom', e.x, e.z); explosion(e.x, e.z, e.kind==='bld' ? e.n*2.2 : (e.type==='infanteria' ? 0.9 : 2), e.air ? AIR_Y : undefined); },
  remove(e){ const o = meshes.get(e.id); if(o){ scene.remove(o.g); meshes.delete(e.id); } selected.delete(e.id); },
  shot(u, tg, w){
    if(!visLocal(u) && !visLocal(tg)) return;
    sfx(w, u.x, u.z);
    const y0 = u.air ? AIR_Y : w==='torre' ? 2.1 : w==='canon' ? 1.2 : 0.8, y1 = tg.air ? AIR_Y : tg.kind==='bld' ? 1.5 : 0.6;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(u.x, y0, u.z), new THREE.Vector3(tg.x, y1, tg.z)]);
    addFx(new THREE.Line(g, tracerMat[w].clone()), w==='rifle' || w==='aa' ? 0.08 : 0.2, 'tracer');
    if(w!=='rifle') explosion(tg.x + (u.x-tg.x)*0.1, tg.z + (u.z-tg.z)*0.1, w==='misil' ? 1.4 : 0.8, tg.air ? AIR_Y : undefined);
  },
  built(b){ if(b.owner===LOCAL) sfx('chime'); if(b.owner===LOCAL) toast(`${BT(b.owner,b.type).nombre}: construcción terminada`); },
  power(p, id, x, z){
    const mine = p===LOCAL, visible = mine || visAt(x,z);
    if(!visible) return;
    const P = POWERS[id];
    if(id==='radar'){ groundRing(x, z, P.r, 0x6fd3e0, 1.6, 'pulse'); }
    else if(id==='reparacion'){ groundRing(x, z, P.r, 0x79c25a, 1.2, 'pulse'); }
    else groundRing(x, z, P.r, mine ? 0xe8a33d : 0xe0553d, id==='artilleria' ? 6 : id==='tropas' ? 3 : 2, 'warn');
    if(!mine){ sfx('alert'); toast(`Alerta: el enemigo usó ${P.nombre.toLowerCase()}`); }
  },
  impact(x, z, kind){
    if(!visAt(x,z) && kind!=='tropas') return;
    sfx(kind==='shell' || kind==='rad' ? 'boom' : 'big', x, z);
    if(kind==='shell') explosion(x, z, 2.4);
    else if(kind==='big'){ explosion(x, z, 6); explosion(x+1.5, z-1, 3.5); }
    else if(kind==='particulas'){ explosion(x, z, 14); explosion(x, z, 8, 10); groundRing(x, z, 11, 0x9fe8ff, 1.5, 'pulse'); }
    else if(kind==='nuclear'){ explosion(x, z, 20); explosion(x, z, 10, 12); groundRing(x, z, 13, 0xffe08a, 2, 'pulse'); }
    else if(kind==='rad'){ groundRing(x, z, 10, 0x9be36b, 1.2, 'pulse'); }
  },
  captured(b, was){
    const name = BT(b.owner>=0 ? b.owner : was, b.type).nombre;
    if(b.owner===LOCAL || was===LOCAL) sfx('capture');
    if(b.owner===LOCAL) toast(b.type==='pozo' ? 'Pozo petrolero capturado: +20 créditos cada 3 s' : `Edificio capturado: ${name}`);
    else if(was===LOCAL) toast(b.type==='pozo' ? 'Se perdió un pozo petrolero' : `El enemigo capturó: ${name}`);
  },
  crate(c, u){ if(u.owner===LOCAL) toast('Chatarra recuperada: +75 créditos y ascenso de rango'); },
  tunnel(u, b, dir){ if(b.owner===LOCAL && visAt(b.x,b.z)) groundRing(b.x, b.z, 2.2, 0xe8a33d, 0.6, 'pulse'); },
  superFire(p, b, x, z){
    const P = BT(p,b.type);
    groundRing(x, z, P.superR, p===LOCAL ? 0xe8a33d : 0xe0553d, 3, 'warn'); sfx('alert');
    toast(p===LOCAL ? `${P.nombre} disparado` : `Alerta: ${P.nombre.toLowerCase()} enemigo disparado`);
  },
  mission(kind, data){
    if(kind==='mensaje') showTransmission(data);
    else if(kind==='objetivos'){ if(data.filter(x => x==='ok').length > (MISSION_UI.lastOk||0)) sfx('obj'); MISSION_UI.lastOk = data.filter(x => x==='ok').length; renderObjectives(); }
  },
  heroDown(u){ if(u.owner===LOCAL){ sfx('alert'); toast(`${UT(u.owner,u.type).nombre} ha caído`); } else if(visLocal(u)) toast(`Héroe enemigo abatido: ${UT(u.owner,u.type).nombre}`); },
  rankUp(p, rank){ if(p===LOCAL) sfx('rank'); if(p===LOCAL) toast(`Ascenso a rango ${rank}: punto de comandante disponible`); }
};
function updateEffects(dt){
  for(let i=effects.length-1; i>=0; i--){
    const f = effects[i]; f.life -= dt; const k = 1 - f.life/f.max;
    if(f.kind==='boom'){ f.obj.scale.setScalar(f.size*(0.3+0.9*k)); f.obj.material.opacity = 0.9*(1-k); }
    else if(f.kind==='marker'){ f.obj.scale.setScalar(1.4-k*0.8); f.obj.material.opacity = 1-k; }
    else if(f.kind==='warn'){ f.obj.material.opacity = 0.35 + 0.5*Math.abs(Math.sin(f.life*6)); }
    else if(f.kind==='pulse'){ f.obj.scale.setScalar(0.3+0.7*Math.min(1,k*2)); f.obj.material.opacity = 0.9*(1-k); }
    else f.obj.material.opacity = 1-k;
    if(f.life<=0){ scene.remove(f.obj); if(f.kind==='tracer') f.obj.geometry.dispose(); f.obj.material.dispose(); effects.splice(i,1); }
  }
}
function lerpAngle(a, b, t){ let d = ((b-a+Math.PI*3)%(Math.PI*2))-Math.PI; return a + d*t; }
function syncMeshes(alpha, dt, time){
  for(const e of S.ents){
    let o = meshes.get(e.id); if(!o) continue;
    if(o.owner !== e.owner){ scene.remove(o.g); o = buildModel(e); scene.add(o.g); meshes.set(e.id, o); }   // pozo capturado
    o.g.visible = seenLocal(e);
    if(!o.g.visible) continue;
    if(e.kind==='unit'){
      const x = e.px+(e.x-e.px)*alpha, z = e.pz+(e.z-e.pz)*alpha;
      const dx = e.x-e.px, dz = e.z-e.pz, moving = dx*dx+dz*dz > 1e-5;
      const tg = e.working!=null ? S.byId.get(e.working) : curTarget(e);
      if(moving) o.targetYaw = Math.atan2(dx, dz);
      else if(tg && !o.turret && !e.air) o.targetYaw = Math.atan2(tg.x-e.x, tg.z-e.z);
      else if(e.air && !moving && !o.rotor) o.targetYaw += dt*1.2;   // en espera, el avión gira en el sitio
      o.yaw = lerpAngle(o.yaw, o.targetYaw, Math.min(1, dt*(e.air?3:10)));
      o.g.position.set(x, e.air ? AIR_Y + Math.sin(time*2+e.id)*0.15 : o.boat ? 0.12 + Math.sin(time*1.6+e.id)*0.05 : 0, z); o.g.rotation.y = o.yaw;
      if(o.boat) o.body.rotation.z = Math.sin(time*1.3+e.id)*0.04;
      if(e.air && !o.rotor) o.body.rotation.z = moving ? 0 : 0.35;
      if(o.rotor) o.rotor.rotation.y += dt*25;
      if(o.star) o.star.rotation.y += dt*2;
      o.body.position.y = e.working!=null || (e.order && e.order.type==='capture' && e.capT>0) ? Math.abs(Math.sin(time*12))*0.12 : 0;
      if(o.turret){ const aim = tg ? Math.atan2(tg.x-e.x, tg.z-e.z) : o.yaw; o.turret.rotation.y = lerpAngle(o.turret.rotation.y, aim-o.yaw, Math.min(1, dt*8)); }
      if(o.cargo) o.cargo.visible = e.carry>0;
    } else if(e.kind==='depot'){ o.body.scale.y = 0.35 + 0.65*e.amount/e.max; }
    else if(e.kind==='crate'){ o.g.position.set(e.x, 0, e.z); o.body.rotation.y = time*0.6; }
    else {
      o.body.scale.y = e.built ? 1 : 0.12 + 0.88*e.bprog;
      if(o.turret){ const tg = e.target!=null ? S.byId.get(e.target) : null; if(tg) o.turret.rotation.y = lerpAngle(o.turret.rotation.y, Math.atan2(tg.x-e.x, tg.z-e.z), Math.min(1, dt*8)); }
      if(o.beam) o.beam.rotation.z = e.owner>=0 ? Math.sin(time*2.2+e.id)*0.35 : 0;
    }
    if(o.ring) o.ring.visible = selected.has(e.id);
  }
}

// ======================= CÁMARA E INTERFAZ =======================
const cam = { x:WORLD*0.2, z:WORLD*0.8, dist:50, pitch:0.95 };
let W = innerWidth, H = innerHeight, DPR = Math.min(window.devicePixelRatio||1, 2);
const ov = document.getElementById('overlay'), octx = ov.getContext('2d');
const $ = id => document.getElementById(id);
function resize(){
  W = innerWidth; H = innerHeight; renderer.setSize(W, H); camera.aspect = W/H; camera.updateProjectionMatrix();
  ov.width = W*DPR; ov.height = H*DPR; octx.setTransform(DPR,0,0,DPR,0,0);
}
addEventListener('resize', resize);
function clampCam(){ cam.x = Math.max(0, Math.min(WORLD, cam.x)); cam.z = Math.max(0, Math.min(WORLD+10, cam.z)); cam.dist = Math.max(24, Math.min(115, cam.dist)); }
function placeCamera(){ clampCam(); camera.position.set(cam.x, Math.sin(cam.pitch)*cam.dist, cam.z + Math.cos(cam.pitch)*cam.dist); camera.lookAt(cam.x, 0, cam.z); }
const keys = new Set();
// Desplazamiento por bordes: el mouse cerca del borde de la ventana mueve la cámara
const EDGE = { x:-1, y:-1, inside:false };
addEventListener('mousemove', e => { EDGE.x = e.clientX; EDGE.y = e.clientY; EDGE.inside = true; });
document.addEventListener('mouseleave', () => { EDGE.inside = false; });
addEventListener('blur', () => { EDGE.inside = false; });
function edgeScroll(sp){
  if(!OPTIONS.bordes || !EDGE.inside || drag || pinch || document.querySelector('.modal:not([hidden])')) return;
  const m = 14;
  if(EDGE.x <= m) cam.x -= sp; else if(EDGE.x >= W - m) cam.x += sp;
  if(EDGE.y <= m) cam.z -= sp; else if(EDGE.y >= H - m) cam.z += sp;
}
function updateCamera(dt){
  const sp = cam.dist*0.9*dt*OPTIONS.camara;
  edgeScroll(sp);
  if(keys.has('ArrowLeft')) cam.x -= sp; if(keys.has('ArrowRight')) cam.x += sp;
  if(keys.has('ArrowUp')) cam.z -= sp; if(keys.has('ArrowDown')) cam.z += sp;
  placeCamera();
}
const _v = new THREE.Vector3(), ray = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0), _ndc = new THREE.Vector2();
function toScreen(x, y, z){ _v.set(x,y,z).project(camera); return { x:(_v.x+1)/2*W, y:(1-_v.y)/2*H, ok:_v.z<1 }; }
function groundAt(sx, sy){ _ndc.set(sx/W*2-1, -(sy/H)*2+1); ray.setFromCamera(_ndc, camera); const out = new THREE.Vector3(); return ray.ray.intersectPlane(groundPlane, out) ? out : null; }
function renderPos(e){ const o = meshes.get(e.id); return o ? o.g.position : { x:e.x, y:yOf(e), z:e.z }; }
function unitScreen(e){ const p = renderPos(e); return toScreen(p.x, e.air ? p.y : 0.5, p.z); }

const selected = new Set();
function selectedEnts(){ return [...selected].map(id => S.byId.get(id)).filter(e => e && !e.dead); }
function selectOnly(ids){ selected.clear(); ids.forEach(id => selected.add(id)); }
const myFaction = () => FACTIONS[S.players[LOCAL].faction];
function pick(sx, sy){
  let best = null, bd = 24*24;
  for(const e of S.ents){
    if(e.kind!=='unit' || e.dead || !seenLocal(e)) continue;
    const s = unitScreen(e), d = (s.x-sx)**2+(s.y-sy)**2; if(d<bd){ bd=d; best=e; } }
  if(best) return best;
  const g = groundAt(sx, sy); if(!g) return null;
  for(const e of S.ents){ if(e.kind==='unit' || e.kind==='crate' || e.dead || !seenLocal(e)) continue; if(g.x>=e.cx*CELL && g.x<=(e.cx+e.n)*CELL && g.z>=e.cz*CELL && g.z<=(e.cz+e.n)*CELL) return e; }
  return null;
}
const METRICS = { cmds:0, frames:0, time:0 };
function issue(c){ c.p = LOCAL; METRICS.cmds++; queueCmd(c); }
let aMove = false, areaMode = false;
const btnAMove = $('btnAMove'), btnArea = $('btnArea');
function setAMove(v){ aMove = v; btnAMove.classList.toggle('on', v); }
function setArea(v){ areaMode = v; btnArea.classList.toggle('on', v); }
let toastT = 0;
function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2000); }

// Modo de ubicación de edificios
let placing = null;
const ghost = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({ color:0x9be36b, transparent:true, opacity:0.38, depthWrite:false }));
ghost.visible = false; scene.add(ghost);
const builderIds = () => selectedEnts().filter(e => e.kind==='unit' && e.type==='constructor' && e.owner===LOCAL).map(e => e.id);
function startPlacing(type){
  if(S.players[LOCAL].credits < BT(LOCAL,type).cost){ toast('Créditos insuficientes'); return; }
  cancelTargeting(); placing = { type, cx:0, cz:0, has:false, valid:false }; setAMove(false);
}
function cancelPlacing(){ placing = null; ghost.visible = false; }
function setGhostAt(sx, sy){
  const g = groundAt(sx, sy); if(!g || !placing) return;
  const n = BT(LOCAL,placing.type).size;
  placing.cx = Math.round(g.x/CELL - n/2); placing.cz = Math.round(g.z/CELL - n/2); placing.has = true;
}
function updateGhost(){
  if(!placing || !placing.has){ ghost.visible = false; return; }
  const n = BT(LOCAL,placing.type).size;
  placing.valid = canPlace(LOCAL, placing.type, placing.cx, placing.cz, 0);
  ghost.visible = true; ghost.scale.set(n*CELL*0.98, 1.6, n*CELL*0.98);
  ghost.position.set((placing.cx+n/2)*CELL, 0.8, (placing.cz+n/2)*CELL);
  ghost.material.color.setHex(placing.valid ? 0x9be36b : 0xe0553d);
}
function tryPlace(){
  if(!placing || !placing.has) return;
  const bt = BT(LOCAL,placing.type), ids = builderIds();
  if(!ids.length){ cancelPlacing(); return; }
  if(!placing.valid){ toast(BT(LOCAL, placing.type).naval ? 'El astillero debe tocar al menos 3 celdas de agua' : 'Ubicación no válida: terreno ocupado o sin explorar'); return; }
  if(S.players[LOCAL].credits < bt.cost){ toast('Créditos insuficientes'); return; }
  issue({ t:'place', ids, type:placing.type, cx:placing.cx, cz:placing.cz }); sfx('place');
  orderMarker((placing.cx+bt.size/2)*CELL, (placing.cz+bt.size/2)*CELL, 0xe8a33d);
  cancelPlacing();
}

// Modo de objetivo para poderes de comandante
let targeting = null;
const aim = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), new THREE.MeshBasicMaterial({ color:0xe8a33d, transparent:true, opacity:0.8, depthWrite:false, side:THREE.DoubleSide }));
aim.rotation.x = -Math.PI/2; aim.visible = false; scene.add(aim);
function targetInfo(id){
  if(id.startsWith('super:')){ const b = S.byId.get(+id.slice(6)); const bt = b ? BT(b.owner,b.type) : BUILD_TYPES.superarma; return { nombre:bt.nombre, r:bt.superR, desc:'Impacto masivo tras 3 s de aviso' }; }
  return POWERS[id];
}
function startTargeting(id){ cancelPlacing(); setAMove(false); targeting = { id, x:0, z:0, has:false }; }
function cancelTargeting(){ targeting = null; aim.visible = false; }
function setAimAt(sx, sy){ const g = groundAt(sx, sy); if(!g || !targeting) return; targeting.x = g.x; targeting.z = g.z; targeting.has = true; }
function updateAim(){
  if(!targeting || !targeting.has){ aim.visible = false; return; }
  const r = targetInfo(targeting.id).r; aim.visible = true; aim.scale.setScalar(r); aim.position.set(targeting.x, 0.12, targeting.z);
}
function firePower(){
  if(!targeting || !targeting.has) return;
  const id = targeting.id;
  const x = Math.round(targeting.x*100)/100, z = Math.round(targeting.z*100)/100;
  if(id.startsWith('super:')){ issue({ t:'super', id:+id.slice(6), x, z }); cancelTargeting(); return; }
  if(id==='tropas' && !S.exp[LOCAL][idx(toCell(targeting.x), toCell(targeting.z))]){ toast('El lanzamiento de tropas requiere una zona explorada'); return; }
  issue({ t:'power', power:id, x, z });
  cancelTargeting();
}

function commandAt(sx, sy, forceAMove){
  const sel = selectedEnts().filter(e => e.owner===LOCAL); if(!sel.length) return;
  const tgt = pick(sx, sy), g = groundAt(sx, sy);
  const units = sel.filter(e => e.kind==='unit'), blds = sel.filter(e => e.kind==='bld');
  if(!units.length){ if(blds.length && g){ blds.forEach(b => issue({ t:'rally', id:b.id, x:g.x, z:g.z })); orderMarker(g.x, g.z, 0xe8a33d); } return; }
  const ids = units.map(u => u.id), others = list => units.filter(u => !list.includes(u));
  const moveIds = list => { if(list.length && g) issue({ t:'move', ids:list.map(u=>u.id), x:g.x, z:g.z }); };
  if(tgt && tgt.type==='tunel' && tgt.owner===LOCAL && tgt.built && tgt.hp>=tgt.maxhp*0.99){
    const ground = units.filter(u => !u.air);
    if(ground.length){ issue({ t:'enter', ids:ground.map(u=>u.id), target:tgt.id }); orderMarker(tgt.x, tgt.z, 0xe8a33d); moveIds(others(ground)); return; }
  }
  if(tgt && tgt.kind==='bld' && tgt.owner>=0 && tgt.owner!==LOCAL && tgt.type!=='pozo'){
    const eng = units.filter(u => capturable(u, tgt));
    if(eng.length){ issue({ t:'capture', ids:eng.map(u=>u.id), target:tgt.id }); const rest = others(eng); if(rest.length) issue({ t:'attack', ids:rest.map(u=>u.id), target:tgt.id }); orderMarker(tgt.x, tgt.z, 0x6fd3e0); return; }
  }
  if(tgt && tgt.type==='pozo' && tgt.owner!==LOCAL){
    const inf = units.filter(u => capturable(u, tgt));
    if(inf.length) issue({ t:'capture', ids:inf.map(u=>u.id), target:tgt.id });
    const rest = others(inf);
    if(tgt.owner>=0 && rest.length) issue({ t:'attack', ids:rest.map(u=>u.id), target:tgt.id }); else moveIds(rest);
    orderMarker(tgt.x, tgt.z, 0x6fd3e0); return;
  }
  if(tgt && tgt.owner>=0 && tgt.owner!==LOCAL){
    issue({ t:'attack', ids, target:tgt.id });
    moveIds(units.filter(u => !UT(LOCAL,u.type).weapon));
    orderMarker(tgt.x, tgt.z, 0xe0553d); return;
  }
  if(tgt && tgt.kind==='bld' && tgt.owner===LOCAL && (!tgt.built || tgt.hp<tgt.maxhp)){
    const bs = units.filter(u => u.type==='constructor');
    if(bs.length){ issue({ t:'repair', ids:bs.map(u=>u.id), target:tgt.id }); orderMarker(tgt.x, tgt.z, 0xe8a33d); moveIds(others(bs)); return; }
  }
  if(tgt && tgt.kind==='depot'){
    const col = units.filter(u => u.type==='recolector');
    if(col.length) issue({ t:'harvest', ids:col.map(u=>u.id), target:tgt.id });
    moveIds(others(col));
    orderMarker(tgt.x, tgt.z, 0xe8a33d); return;
  }
  sfx('ack');
  if(g){ const am = forceAMove || aMove; issue({ t:am?'amove':'move', ids, x:g.x, z:g.z }); orderMarker(g.x, g.z, am ? 0xe0553d : 0x9be36b); }
}
let lastTap = { t:0, id:null };
function onScreen(e){ const s=unitScreen(e); return s.ok && s.x>=0 && s.y>=0 && s.x<=W && s.y<=H; }
function primaryTap(sx, sy, isTouch, shift){
  if(targeting){ setAimAt(sx, sy); updateAim(); firePower(); return; }
  if(placing){ setGhostAt(sx, sy); if(!isTouch) tryPlace(); return; }
  const tgt = pick(sx, sy);
  if(aMove){ setAMove(false); commandAt(sx, sy, true); return; }
  if(tgt && tgt.owner===LOCAL){
    const now = performance.now();
    if(tgt.kind==='unit' && lastTap.id===tgt.id && now-lastTap.t<380){
      selectOnly(S.ents.filter(e => e.kind==='unit' && e.owner===LOCAL && e.type===tgt.type && onScreen(e)).map(e => e.id));
      lastTap = { t:0, id:null }; return;
    }
    lastTap = { t:now, id:tgt.id };
    if(isTouch && selected.size && !selected.has(tgt.id) && tgt.kind==='bld' && selectedEnts().some(u => u.type==='constructor') && (!tgt.built || tgt.hp<tgt.maxhp)){ commandAt(sx, sy, false); return; }
    if(shift && tgt.kind==='unit'){ if(selected.has(tgt.id)) selected.delete(tgt.id); else { selectedEnts().forEach(e => { if(e.kind!=='unit') selected.delete(e.id); }); selected.add(tgt.id); } }
    else selectOnly([tgt.id]);
    return;
  }
  if(isTouch){ if(selected.size && selectedEnts().some(e => e.owner===LOCAL)) commandAt(sx, sy, false); else if(tgt) selectOnly([tgt.id]); return; }
  if(tgt && !shift){ selectOnly([tgt.id]); return; }
  if(!shift) selected.clear();
}
function boxSelect(x0, y0, x1, y1, shift){
  const l=Math.min(x0,x1), r=Math.max(x0,x1), t=Math.min(y0,y1), b=Math.max(y0,y1);
  const hits = S.ents.filter(e => e.kind==='unit' && e.owner===LOCAL && !e.dead && (() => { const s=unitScreen(e); return s.ok && s.x>=l && s.x<=r && s.y>=t && s.y<=b; })());
  if(!shift) selected.clear(); else selectedEnts().forEach(e => { if(e.kind!=='unit') selected.delete(e.id); });
  hits.forEach(e => selected.add(e.id));
}

// Entrada de puntero (ratón y táctil)
const pointers = new Map(); let drag = null, pinch = null;
const selbox = $('selbox');
ov.addEventListener('contextmenu', e => e.preventDefault());
ov.addEventListener('pointerdown', e => {
  ov.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if(e.pointerType==='touch'){
    if(pointers.size===2){ const [a,b] = [...pointers.values()]; pinch = { d:Math.hypot(a.x-b.x, a.y-b.y), dist:cam.dist }; drag = null; selbox.style.display='none'; return; }
    drag = { mode:areaMode && !placing && !targeting ? 'box' : 'pan', sx:e.clientX, sy:e.clientY, camX:cam.x, camZ:cam.z, moved:false, touch:true };
    return;
  }
  if(targeting){ if(e.button===0){ setAimAt(e.clientX, e.clientY); firePower(); } else if(e.button===2) cancelTargeting(); return; }
  if(placing){
    if(e.button===0){ setGhostAt(e.clientX, e.clientY); updateGhost(); tryPlace(); }
    else if(e.button===2) cancelPlacing();
    return;
  }
  if(e.button===0) drag = { mode:'box', sx:e.clientX, sy:e.clientY, moved:false, touch:false };
  else if(e.button===1){ e.preventDefault(); drag = { mode:'pan', sx:e.clientX, sy:e.clientY, camX:cam.x, camZ:cam.z, moved:true, touch:false }; }
  else if(e.button===2){ if(aMove) setAMove(false); commandAt(e.clientX, e.clientY, false); }
});
ov.addEventListener('pointermove', e => {
  if(e.pointerType!=='touch'){ if(placing) setGhostAt(e.clientX, e.clientY); if(targeting) setAimAt(e.clientX, e.clientY); }
  const p = pointers.get(e.pointerId); if(!p) return; p.x = e.clientX; p.y = e.clientY;
  if(pinch && pointers.size>=2){ const [a,b] = [...pointers.values()]; const d = Math.hypot(a.x-b.x, a.y-b.y); if(d>10){ cam.dist = pinch.dist*pinch.d/d; clampCam(); } return; }
  if(!drag) return;
  const dx = e.clientX-drag.sx, dy = e.clientY-drag.sy;
  if(!drag.moved && dx*dx+dy*dy > 64) drag.moved = true;
  if(!drag.moved) return;
  if(drag.mode==='pan'){
    const k = 2*cam.dist*Math.tan(camera.fov/2*Math.PI/180)/H;
    cam.x = drag.camX - dx*k; cam.z = drag.camZ - dy*k/Math.sin(cam.pitch); clampCam();
  } else {
    Object.assign(selbox.style, { display:'block', left:Math.min(drag.sx,e.clientX)+'px', top:Math.min(drag.sy,e.clientY)+'px', width:Math.abs(dx)+'px', height:Math.abs(dy)+'px' });
  }
});
function endPointer(e){
  pointers.delete(e.pointerId);
  if(pinch){ if(pointers.size<2) pinch = null; drag = null; return; }
  if(!drag) return;
  if(drag.mode==='box' && drag.moved) boxSelect(drag.sx, drag.sy, e.clientX, e.clientY, e.shiftKey);
  else if(!drag.moved && e.type==='pointerup') primaryTap(e.clientX, e.clientY, drag.touch, e.shiftKey);
  selbox.style.display = 'none'; drag = null;
}
ov.addEventListener('pointerup', endPointer);
ov.addEventListener('pointercancel', endPointer);
ov.addEventListener('wheel', e => { e.preventDefault(); cam.dist *= e.deltaY>0 ? 1.1 : 0.9; clampCam(); }, { passive:false });
addEventListener('keydown', e => {
  if(e.target && e.target.tagName==='INPUT') return;
  if(e.key.startsWith('Arrow')){ keys.add(e.key); e.preventDefault(); }
  const k = e.key.toLowerCase();
  if(k==='a' && selectedEnts().some(u => u.kind==='unit' && u.owner===LOCAL)) setAMove(true);
  else if(k==='s') stopSelected();
  else if(e.key==='Escape'){ if(targeting) cancelTargeting(); else if(placing) cancelPlacing(); else if(aMove) setAMove(false); else if(selected.size) selected.clear(); else toggleGameMenu(); }
  else if(e.key==='F10'){ e.preventDefault(); toggleGameMenu(); }
  else if(e.key===' '){ const s = selectedEnts(); if(s.length){ cam.x = s.reduce((a,u)=>a+u.x,0)/s.length; cam.z = s.reduce((a,u)=>a+u.z,0)/s.length; } e.preventDefault(); }
});
addEventListener('keyup', e => keys.delete(e.key));
addEventListener('keydown', e => { if(e.key && e.key.toLowerCase()==='m' && !(e.target && e.target.tagName==='INPUT')) setSound(!SFX.on); });
$('btnSound').addEventListener('click', () => { sfxInit(); setSound(!SFX.on); });
function stopSelected(){ const ids = selectedEnts().filter(e => e.kind==='unit' && e.owner===LOCAL).map(e => e.id); if(ids.length) issue({ t:'stop', ids }); }
btnAMove.addEventListener('click', () => { if(selectedEnts().some(u => u.kind==='unit' && u.owner===LOCAL)) setAMove(!aMove); else toast('Seleccione unidades primero'); });
btnArea.addEventListener('click', () => setArea(!areaMode));
$('btnStop').addEventListener('click', stopSelected);
$('btnClear').addEventListener('click', () => { selected.clear(); setAMove(false); cancelPlacing(); cancelTargeting(); });
let paused = false;
const btnPause = $('btnPause');
// Menú de partida: reanudar, opciones, controles, reiniciar y abandonar
let menuPaused = false;
function inMatch(){ return $('menu').hidden && $('campaign').hidden && endEl.hidden && !REPLAY && !S.over; }
function toggleGameMenu(force){
  const el = $('gamemenu'), open = force!==undefined ? force : el.hidden;
  if(open && !inMatch()) return;
  el.hidden = !open;
  if(open){
    const offline = !NET.online;
    if(offline && !paused){ paused = true; menuPaused = true; }
    $('gmRestart').hidden = !(GAME_MODE==='solo' || GAME_MODE==='mision');
    $('gmNote').textContent = offline ? 'La partida está en pausa.' : 'La partida en línea continúa mientras este menú está abierto.';
  } else if(menuPaused){ paused = false; menuPaused = false; }
}
$('btnGameMenu').addEventListener('click', () => toggleGameMenu());
$('gmResume').addEventListener('click', () => toggleGameMenu(false));
$('gmOptions').addEventListener('click', () => { renderOptions(); $('options').hidden = false; });
$('gmHelp').addEventListener('click', () => { $('help').hidden = false; });
$('gmRestart').addEventListener('click', () => {
  toggleGameMenu(false);
  if(GAME_MODE==='mision') startMission(MISSION_UI.id, MISSION_UI.diff);
  else { startGame(20261004 + Math.floor(Math.random()*1e6), 'solo'); paused = false; }
});
$('gmQuit').addEventListener('click', () => {
  if(!confirm(NET.online ? '¿Abandonar la partida en línea? Se registrará como derrota.' : '¿Abandonar la partida? Se registrará como derrota.')) return;
  toggleGameMenu(false);
  if(NET.online){ netSend({ t:'surrender' }); return; }            // el servidor declara ganador al rival
  const s = Math.floor(S.tick/TICK_HZ), pl = S.players[LOCAL];
  if(!RECORDED){ RECORDED = true; recordGame({ modo:GAME_MODE, faccion:pl.faction, rival:FACTIONS[S.players[1-LOCAL].faction].nombre, resultado:'derrota', duracion:s, mision:GAME_MODE==='mision' ? MISSION_UI.id : null }); }
  startGame(20261004, 'solo'); paused = true; powersEl.hidden = true; $('objectives').hidden = true; $('menu').hidden = false; applyTheme(soloFaction);
});
btnPause.addEventListener('click', () => { paused = !paused; btnPause.textContent = paused ? 'Continuar' : 'Pausa'; btnPause.classList.toggle('on', paused); });
const helpEl = $('help');
$('btnHelp').addEventListener('click', () => { helpEl.hidden = false; });
$('btnHelpClose').addEventListener('click', () => { helpEl.hidden = true; });
helpEl.addEventListener('click', e => { if(e.target===helpEl) helpEl.hidden = true; });

// Minimapa con niebla
const mm = $('minimap'), mctx = mm.getContext('2d');
const mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = GRID;
const mbctx = mmBase.getContext('2d'), mbImg = mbctx.createImageData(GRID, GRID);
function mmWorld(e){ const r = mm.getBoundingClientRect(); return { x:(e.clientX-r.left)/r.width*WORLD, z:(e.clientY-r.top)/r.height*WORLD }; }
let mmDrag = false;
mm.addEventListener('contextmenu', e => e.preventDefault());
mm.addEventListener('pointerdown', e => {
  const w = mmWorld(e);
  if(targeting && e.button===0){ targeting.x=w.x; targeting.z=w.z; targeting.has=true; firePower(); return; }
  if(e.button===2){ const ids = selectedEnts().filter(u => u.kind==='unit' && u.owner===LOCAL).map(u => u.id); if(ids.length){ issue({ t:aMove?'amove':'move', ids, x:w.x, z:w.z }); orderMarker(w.x, w.z, 0x9be36b); setAMove(false); } return; }
  mmDrag = true; mm.setPointerCapture(e.pointerId); cam.x = w.x; cam.z = w.z;
});
mm.addEventListener('pointermove', e => { if(!mmDrag) return; const w = mmWorld(e); cam.x = w.x; cam.z = w.z; });
mm.addEventListener('pointerup', () => { mmDrag = false; });
function drawMinimap(){
  const w = mm.width, s = w/GRID, d = mbImg.data, v = visGrid(), ex = expGrid();
  for(let i=0; i<NCELLS; i++){
    const f = v[i] ? 1 : ex[i] ? 0.55 : 0.12, rock = S.rockGrid[i], wat = S.water[i];
    d[i*4] = (wat?61:rock?125:205)*f; d[i*4+1] = (wat?110:rock?111:182)*f; d[i*4+2] = (wat?140:rock?93:138)*f; d[i*4+3] = 255;
  }
  mbctx.putImageData(mbImg, 0, 0);
  mctx.imageSmoothingEnabled = false; mctx.drawImage(mmBase, 0, 0, w, w);
  for(const e of S.ents){
    if(e.dead || !seenLocal(e)) continue;
    if(e.kind==='depot'){ mctx.fillStyle = '#d9a23a'; mctx.fillRect(e.cx*s, e.cz*s, e.n*s, e.n*s); }
    else if(e.kind==='crate'){ mctx.fillStyle = '#c9b07a'; mctx.fillRect(e.x/CELL*s-2, e.z/CELL*s-2, 4, 4); }
    else if(e.kind==='bld'){ mctx.fillStyle = e.owner<0 ? '#8a8070' : e.owner===0 ? '#2f6fd8' : '#c8452f'; mctx.fillRect(e.cx*s, e.cz*s, e.n*s, e.n*s); mctx.strokeStyle = e.type==='pozo' ? '#e9e2cc' : '#1b2224'; mctx.lineWidth = 2; mctx.strokeRect(e.cx*s, e.cz*s, e.n*s, e.n*s); }
    else { mctx.fillStyle = selected.has(e.id) ? '#ffffff' : (e.owner===0 ? '#6fa3ff' : '#ff6b52'); const z = e.air ? 7 : 5; mctx.fillRect(e.x/CELL*s-z/2, e.z/CELL*s-z/2, z, z); }
  }
  const pts = [[0,0],[W,0],[W,H],[0,H]].map(([x,y]) => groundAt(x,y)).filter(Boolean);
  if(pts.length===4){ mctx.strokeStyle = '#f4efe2'; mctx.lineWidth = 2; mctx.beginPath(); pts.forEach((p,i) => { const X=p.x/WORLD*w, Y=p.z/WORLD*w; i ? mctx.lineTo(X,Y) : mctx.moveTo(X,Y); }); mctx.closePath(); mctx.stroke(); }
}

// Capa 2D: barras de vida, construcción, captura y punto de reunión
function drawOverlay(){
  octx.clearRect(0,0,W,H);
  if(S.mission) S.mission.def.objetivos.forEach((o,i) => {
    if(o.tipo!=='llegar' || S.mission.state[i]!=='pend') return;
    const p = toScreen(cellCenter(o.x), 0.1, cellCenter(o.z)); if(!p.ok) return;
    const pulse = 14 + Math.sin(performance.now()/250)*4;
    octx.strokeStyle = '#e8a33d'; octx.lineWidth = 3; octx.beginPath(); octx.arc(p.x, p.y, pulse, 0, Math.PI*2); octx.stroke();
    octx.fillStyle = '#e8a33d'; octx.font = '600 13px sans-serif'; octx.textAlign = 'center'; octx.fillText('Destino', p.x, p.y - pulse - 6);
  });
  for(const e of S.ents){
    if(e.dead || !seenLocal(e)) continue;
    const sel = selected.has(e.id);
    if(e.kind==='depot'){
      const s = toScreen(e.x, 2.8, e.z); if(!s.ok) continue;
      octx.fillStyle = 'rgba(18,26,28,.75)'; octx.fillRect(s.x-20, s.y, 40, 4);
      octx.fillStyle = '#e8a33d'; octx.fillRect(s.x-20, s.y, 40*e.amount/e.max, 4); continue;
    }
    if(e.kind==='crate') continue;
    if(e.kind==='unit' && e.owner===LOCAL && stealthed(e)){
      const c = unitScreen(e); octx.strokeStyle = 'rgba(111,211,224,.7)'; octx.setLineDash([3,3]); octx.lineWidth = 1.2;
      octx.beginPath(); octx.arc(c.x, c.y, 12, 0, Math.PI*2); octx.stroke(); octx.setLineDash([]);
    }
    const building = e.kind==='bld' && !e.built;
    const capturing = e.kind==='unit' && e.order && e.order.type==='capture' && e.capT>0;
    if(!sel && e.hp>=e.maxhp && !building && !capturing) continue;
    const p = renderPos(e), h = e.kind==='bld' ? (e.type==='torre' ? 3.2 : e.type==='pozo' ? 3 : 4.6) : e.air ? p.y+1.2 : 1.9;
    const s = toScreen(p.x, h, p.z); if(!s.ok) continue;
    const bw = e.kind==='bld' ? (e.type==='torre' ? 34 : 54) : 28, f = Math.max(0, e.hp/e.maxhp);
    octx.fillStyle = 'rgba(18,26,28,.8)'; octx.fillRect(s.x-bw/2-1, s.y-1, bw+2, building||capturing ? 11 : 6);
    octx.fillStyle = f>0.6 ? '#79c25a' : f>0.3 ? '#e8b23d' : '#e0553d'; octx.fillRect(s.x-bw/2, s.y, bw*f, 4);
    if(building){ octx.fillStyle = '#e8a33d'; octx.fillRect(s.x-bw/2, s.y+5, bw*e.bprog, 4); }
    if(capturing){ const ct = S.byId.get(e.order.id), den = ct ? captureTime(e, ct) : 4; octx.fillStyle = '#6fd3e0'; octx.fillRect(s.x-bw/2, s.y+5, bw*Math.min(1,e.capT/den), 4); }
    if(e.kind==='bld' && e.offUntil > S.tick){ octx.fillStyle = '#e0553d'; octx.font = '600 12px sans-serif'; octx.textAlign = 'center'; octx.fillText('saboteado', s.x, s.y-4); }
    if(e.kind==='unit' && UT(e.owner,e.type).hero){ octx.fillStyle = '#f2d16b'; octx.font = '700 12px sans-serif'; octx.textAlign = 'center'; octx.fillText('★', s.x, s.y-8); }
    if(e.kind==='unit' && e.vet>0){ octx.fillStyle = '#f2d16b'; for(let i=0; i<e.vet; i++) octx.fillRect(s.x-bw/2+i*6, s.y-6, 4, 4); }
    if(e.air && e.owner===LOCAL){ octx.fillStyle = '#e9e2cc'; for(let i=0; i<e.ammo; i++) octx.fillRect(s.x+bw/2-5-i*6, s.y-6, 4, 4); }
    if(e.kind==='bld' && e.built && e.owner===LOCAL && BT(LOCAL,e.type).weapon && S.power[LOCAL].low){ octx.fillStyle = '#e0553d'; octx.font = '600 12px sans-serif'; octx.textAlign = 'center'; octx.fillText('sin energía', s.x, s.y-4); }
    if(sel && e.kind==='bld' && e.rally){
      const a = toScreen(e.x, 0.1, e.z), b = toScreen(e.rally.x, 0.1, e.rally.z);
      octx.strokeStyle = 'rgba(232,163,61,.85)'; octx.setLineDash([5,4]); octx.lineWidth = 1.5; octx.beginPath(); octx.moveTo(a.x,a.y); octx.lineTo(b.x,b.y); octx.stroke(); octx.setLineDash([]);
      octx.fillStyle = '#e8a33d'; octx.fillRect(b.x-3, b.y-12, 2, 12); octx.fillRect(b.x-1, b.y-12, 8, 5);
    }
  }
}

// Panel inferior
const panel = $('panel');
const TOUCH = matchMedia('(pointer:coarse)').matches;
const pct = v => `${Math.max(0,Math.min(100,v*100)).toFixed(0)}%`;
const esc = s => String(s).replace(/[<>&"]/g, ch => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[ch]));
function hpBar(e){ return `<div class="bar"><i style="width:${pct(e.hp/e.maxhp)}"></i></div>`; }
const powerTxt = w => w>0 ? `+${w} energía` : w<0 ? `${w} energía` : 'sin consumo';
const swatch = o => `<span class="sw" style="background:${o<0 ? '#8a8070' : o===0 ? 'var(--atlas)' : 'var(--hierro)'}"></span>`;
function buildMenu(cr){
  const pl = S.players[LOCAL], noPw = myFaction().noPower;
  return `<div class="row">` + myFaction().builds.map(t => { const bt = BT(LOCAL,t);
    const rankLock = bt.minRank && pl.rank < bt.minRank, dup = bt.superCd && S.ents.some(e => !e.dead && e.owner===LOCAL && e.type===t);
    const note = rankLock ? `Requiere rango ${bt.minRank}` : dup ? 'Ya construida' : bt.naval ? 'requiere costa' : noPw ? 'sin energía' : powerTxt(bt.power);
    return `<button class="prod" data-place="${t}" ${cr<bt.cost||rankLock||dup?'disabled':''}>${bt.nombre}<small>${bt.cost} créditos</small><em>${note}</em></button>`; }).join('') + `</div>`;
}
const clock = sec => `${Math.floor(sec/60)}:${String(Math.max(0,sec)%60).padStart(2,'0')}`;
function renderPanel(){
  const sel = selectedEnts(), cr = S.players[LOCAL].credits;
  if(targeting){
    const P = targetInfo(targeting.id);
    panel.innerHTML = `<div class="title">Objetivo: ${P.nombre}</div><div class="sub">${P.desc}. ${TOUCH ? 'Tocar el mapa para lanzar.' : 'Clic en el mapa o el minimapa para lanzar. Clic derecho o Esc para cancelar.'}</div><div class="row"><button data-canceltarget="1">Cancelar</button></div>`;
    return;
  }
  if(placing){
    const bt = BT(LOCAL,placing.type);
    panel.innerHTML = `<div class="title">Ubicar: ${bt.nombre}</div><div class="sub">${TOUCH ? 'Tocar el sitio en el mapa y luego confirmar.' : 'Clic en el mapa para ubicar. Clic derecho o Esc para cancelar.'} Debe ser terreno libre y explorado.</div>
      <div class="row">${TOUCH ? `<button data-confirm="1" ${placing.has && placing.valid ? '' : 'disabled'}>Confirmar</button>` : ''}<button data-cancelplace="1">Cancelar</button></div>`;
    return;
  }
  if(!sel.length){ panel.innerHTML = `<div class="title">${esc(myFaction().nombre)}</div><div class="sub">${TOUCH ? 'Tocar una unidad o edificio para seleccionar. Con selección, tocar el mapa para ordenar.' : 'Arrastrar para seleccionar unidades. Clic en un edificio para producir. Clic derecho para dar órdenes.'}</div>`; return; }
  if(sel.length===1 && sel[0].kind==='bld'){
    const b = sel[0], t = BT(b.owner,b.type), own = b.owner===LOCAL;
    let h = `<div class="title">${swatch(b.owner)}${t.nombre}</div><div class="sub">${Math.ceil(b.hp)} / ${b.maxhp}${own && b.type!=='pozo' ? ` · ${powerTxt(t.power)}` : ''}</div>${hpBar(b)}`;
    if(b.type==='pozo'){
      h += `<div class="sub" style="margin-top:6px">${b.owner<0 ? 'Neutral. La infantería lo captura en 4 s.' : own ? `Produce ${t.income} créditos cada 3 s.` : 'En poder del enemigo. La infantería puede capturarlo.'} Si se destruye, vuelve a ser neutral.</div>`;
    } else if(own && b.built && b.type==='tunel'){
      const n = S.players[LOCAL].tunnel.length;
      h += `<div class="sub" style="margin-top:6px">Unidades dentro: ${n} / 8. Se curan 5 % por segundo. Si se destruyen todos los túneles, se pierden.</div><div class="row"><button data-exit="1" ${n?'':'disabled'}>Sacar unidades</button></div><div class="sub">${TOUCH?'Tocar':'Clic derecho sobre'} el túnel con unidades seleccionadas para entrar.</div>`;
    } else if(own && b.built && t.superCd){
      const left = Math.ceil((b.readyAt - S.tick)/TICK_HZ), blocked = S.power[LOCAL].low || b.offUntil > S.tick;
      h += `<div class="sub" style="margin-top:6px">${left>0 ? `Carga: ${clock(left)}` : 'Lista para disparar'}${blocked ? ' <span class="warn">(detenida)</span>' : ''}. Radio ${t.superR}. El aviso es visible para el enemigo.</div><div class="bar prog"><i style="width:${pct(1-Math.max(0,b.readyAt-S.tick)/(t.superCd*TICK_HZ))}"></i></div><div class="row"><button data-super="${b.id}" ${left>0||blocked?'disabled':''}>Disparar</button></div>`;
    } else if(own && !b.built){
      h += `<div class="sub" style="margin-top:6px">En construcción ${pct(b.bprog)}. Requiere un constructor junto al edificio.</div><div class="bar prog"><i style="width:${pct(b.bprog)}"></i></div><div class="row"><button data-cancelbuild="1">Cancelar construcción (reembolso 75 %)</button></div>`;
    } else if(own && t.weapon){
      h += `<div class="tags"><span>Alcance ${t.range}</span><span>Daño ${t.dmg}</span><span>Antiaérea</span></div>` + (S.power[LOCAL].low ? `<div class="sub warn" style="margin-top:6px">Desactivada por energía insuficiente.</div>` : '');
    } else if(own && t.produce.length){
      h += `<div class="row">` + t.produce.map(u => { const ut = UT(LOCAL,u), q = b.queue.filter(x => x===u).length;
        const heroLock = ut.hero && S.players[LOCAL].rank < ut.minRank, heroDup = ut.hero && heroCount(LOCAL) > 0;
        const note = heroLock ? `<em>Requiere rango ${ut.minRank}</em>` : heroDup ? '<em>En servicio</em>' : ut.hero ? `<em>${ut.rasgo || 'Único'}</em>` : '';
        return `<button class="prod" data-build="${u}" ${cr<ut.cost||b.queue.length>=5||heroLock||heroDup?'disabled':''}>${ut.nombre}<small>${ut.cost} créditos</small>${note}${q?`<span class="q">${q}</span>`:''}</button>`; }).join('');
      if(b.queue.length) h += `<button data-cancel="1">Cancelar último</button>`;
      h += `</div>`;
      if(b.queue.length){ const ut = UT(LOCAL,b.queue[0]); h += `<div class="sub" style="margin-top:6px">Produciendo: ${ut.nombre}${S.power[LOCAL].low ? ' <span class="warn">(mitad de velocidad por energía)</span>' : ''}</div><div class="bar prog"><i style="width:${pct(b.prog/ut.time)}"></i></div>`; }
      else h += `<div class="sub" style="margin-top:6px">${TOUCH?'Tocar':'Clic derecho en'} el mapa fija el punto de reunión.</div>`;
    }
    if(own && b.offUntil > S.tick) h += `<div class="sub warn" style="margin-top:6px">Saboteado: ${Math.ceil((b.offUntil-S.tick)/TICK_HZ)} s</div>`;
    panel.innerHTML = h; return;
  }
  const units = sel.filter(e => e.kind==='unit');
  const hasBuilder = units.some(u => u.type==='constructor' && u.owner===LOCAL);
  if(units.length===1){
    const u = units[0], t = UT(u.owner,u.type);
    let estado;
    if(u.type==='recolector') estado = ({ toDepot:'Hacia depósito', loading:'Cargando', toBase:'Llevando carga', idle:'Esperando', hold:'En espera' }[u.hstate] || 'Activo');
    else if(u.type==='constructor') estado = u.working!=null ? 'Construyendo' : (u.order && u.order.type==='build') ? 'Hacia la obra' : u.order ? 'En marcha' : 'Disponible';
    else if(u.air) estado = u.astate==='rtb' ? (u.reload>0 ? 'Rearmando' : 'Volviendo al aeródromo') : curTarget(u) ? 'Atacando' : u.order ? 'En vuelo' : 'En espera';
    else if(u.order && u.order.type==='capture'){ const ct = S.byId.get(u.order.id); estado = u.capT>0 && ct ? `Capturando ${pct(u.capT/captureTime(u,ct))}` : 'Hacia el objetivo'; }
    else if(u.order && u.order.type==='enter') estado = 'Hacia el túnel';
    else if(t.engineer) estado = u.order ? 'En marcha' : 'Disponible';
    else estado = curTarget(u) ? 'En combate' : u.order ? 'En marcha' : 'En posición';
    let h = `<div class="title">${swatch(u.owner)}${t.nombre}</div><div class="sub">${Math.ceil(u.hp)} / ${u.maxhp} · ${estado}</div>${hpBar(u)}`;
    if(t.weapon){
      h += `<div class="tags"><span>Alcance ${t.range}</span><span>Daño ${t.dmg}</span>${u.air ? `<span>Munición ${u.ammo} / ${t.ammo}</span>` : `<span>Rango ${['recluta','veterano','élite','héroe'][u.vet]}</span>`}<span>Bajas ${u.kills}</span>`;
      if(u.owner===LOCAL && hordeActive(u, true)) h += `<span class="hot">Horda +25 %</span>`;
      if(t.capture) h += `<span>Captura pozos</span>`;
      if(t.stealth) h += `<span${stealthed(u)?' class="hot"':''}>${stealthed(u) ? 'Camuflado' : 'Visible 3 s tras disparar'}</span>`;
      if(t.minRange) h += `<span>Alcance mínimo ${t.minRange}</span>`;
      if(t.hero) h += `<span class="hot">${t.rasgo || 'Héroe'}</span><span>Regenera 1 %/s</span>`;
      h += `</div>`;
    }
    else if(t.engineer) h += `<div class="tags"><span>Captura edificios en 6 s</span><span>Pozos en 2 s</span><span>No puede capturar centros de mando</span></div>`;
    else if(u.type==='recolector') h += `<div class="tags"><span>Carga ${u.carry} / ${t.carry}</span><span>${TOUCH?'Tocar':'Clic derecho en'} un depósito para recolectar</span></div>`;
    if(hasBuilder) h += buildMenu(cr);
    panel.innerHTML = h; return;
  }
  const counts = {}; units.forEach(u => counts[u.type] = (counts[u.type]||0)+1);
  const tot = units.reduce((a,u) => a+u.hp, 0), max = units.reduce((a,u) => a+u.maxhp, 0) || 1;
  const horde = units.some(u => u.owner===LOCAL && hordeActive(u, true));
  panel.innerHTML = `<div class="title">${units.length} unidades</div><div class="sub">Vida total ${Math.round(tot/max*100)} %</div><div class="bar"><i style="width:${pct(tot/max)}"></i></div><div class="tags">${Object.entries(counts).map(([k,v]) => `<span>${UT(LOCAL,k).nombre} × ${v}</span>`).join('')}${horde ? '<span class="hot">Horda +25 %</span>' : ''}</div>` + (hasBuilder ? buildMenu(cr) : '');
}
panel.addEventListener('pointerdown', e => {
  const btn = e.target.closest('button'); if(!btn || btn.disabled) return;
  sfx('click');
  const d = btn.dataset;
  if(d.place) startPlacing(d.place);
  else if(d.confirm){ updateGhost(); tryPlace(); }
  else if(d.cancelplace) cancelPlacing();
  else if(d.canceltarget) cancelTargeting();
  else {
    const b = selectedEnts()[0]; if(!b || b.kind!=='bld') return;
    if(d.build){ const ut = UT(LOCAL,d.build); if(S.players[LOCAL].credits < ut.cost){ toast('Créditos insuficientes'); return; } issue({ t:'build', id:b.id, type:d.build }); }
    else if(d.cancel) issue({ t:'cancel', id:b.id });
    else if(d.cancelbuild) issue({ t:'cancelBuild', id:b.id });
    else if(d.exit) issue({ t:'exit', id:b.id });
    else if(d.super) startTargeting('super:' + d.super);
  }
  setTimeout(renderPanel, 80);
});

// Panel de poderes de comandante
const powersEl = $('powers');
function renderPowers(){
  const pl = S.players[LOCAL];
  const next = RANK_XP[pl.rank], prev = RANK_XP[pl.rank-1] || 0;
  const xpFrac = next ? (pl.xp-prev)/(next-prev) : 1;
  const powers = TREES[pl.faction].flatMap(br => br.nodos).filter(n => n.poder && pl.unlocked[n.id]);
  powersEl.innerHTML = `<div class="hdr"><span>Rango <b>${pl.rank}</b></span><span>Puntos <b>${pl.cp}</b></span></div><div class="xp" title="Experiencia"><i style="width:${pct(xpFrac)}"></i></div>` +
    `<button data-tree="1" class="${pl.cp>0?'ready':''}">Árbol del comandante<small>${pl.cp>0 ? pl.cp + ' punto' + (pl.cp>1?'s':'') : 'ver'}</small></button>` +
    (powers.length ? powers.map(n => {
      const P = POWERS[n.id], left = Math.ceil(((pl.cool[n.id]||0) - S.tick)/TICK_HZ);
      return left>0 ? `<button disabled title="${P.desc}">${P.nombre}<small>${left} s</small></button>`
                    : `<button class="ready${targeting && targeting.id===n.id ? ' on' : ''}" data-power="${n.id}" title="${P.desc}">${P.nombre}<small>listo</small></button>`;
    }).join('') : '<div class="hdr"><span>Sin poderes desbloqueados</span></div>');
}
function nodeInfo(n){ return n.poder ? { nombre:POWERS[n.id].nombre, desc:POWERS[n.id].desc, tipo:'Poder' } : { nombre:n.nombre, desc:n.desc, tipo:'Mejora' }; }
function renderTree(){
  const pl = S.players[LOCAL], F = FACTIONS[pl.faction];
  $('treeTitle').textContent = `Árbol del comandante · ${F.nombre}`;
  $('treeInfo').textContent = `Rango ${pl.rank}. Puntos disponibles: ${pl.cp}. Cada nodo requiere el anterior de su rama. Los ascensos de rango dan puntos.`;
  $('treeBody').innerHTML = TREES[pl.faction].map(br => `<div class="branch"><h4>${br.rama}</h4>` + br.nodos.map((n,i) => {
    const info = nodeInfo(n), unl = !!pl.unlocked[n.id], prevOk = !i || pl.unlocked[br.nodos[i-1].id], avail = !unl && prevOk && pl.cp>0;
    const state = unl ? 'Desbloqueado' : avail ? 'Disponible' : !prevOk ? 'Requiere el nivel anterior' : 'Sin puntos';
    return (i ? '<div class="link"></div>' : '') + `<button class="${unl?'unl':avail?'avail':''}" data-node="${n.id}" ${avail?'':'disabled'}><b>${info.nombre}</b><small>${info.tipo} · ${info.desc}</small><small>${state}</small></button>`;
  }).join('') + '</div>').join('');
}
powersEl.addEventListener('pointerdown', e => {
  const btn = e.target.closest('button'); if(!btn || btn.disabled) return;
  if(btn.dataset.tree){ renderTree(); $('tree').hidden = false; }
  else if(btn.dataset.power){ if(targeting && targeting.id===btn.dataset.power) cancelTargeting(); else startTargeting(btn.dataset.power); }
  setTimeout(() => { renderPowers(); renderPanel(); }, 80);
});

let wasLow = false;
function updateTopbar(){
  $('credVal').textContent = S.players[LOCAL].credits;
  const pw = S.power[LOCAL], bal = pw.prod - pw.cons;
  $('energyVal').textContent = pw.none ? 'no usa' : (bal>0?'+':'') + bal;
  $('energy').classList.toggle('low', pw.low);
  if(pw.low && !wasLow) toast('Energía insuficiente: construya una planta de energía');
  wasLow = pw.low;
  $('popVal').textContent = S.ents.filter(e => e.kind==='unit' && e.owner===LOCAL).length;
  const s = Math.floor(S.tick/TICK_HZ); $('clockVal').textContent = `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  // Temporizadores de superarmas: propias siempre; enemigas si fueron vistas
  $('superbar').innerHTML = S.ents.filter(e => !e.dead && e.type==='superarma' && e.built && (e.owner===LOCAL || seenLocal(e))).map(e => {
    const left = Math.ceil((e.readyAt - S.tick)/TICK_HZ), who = e.owner===0 ? 'azul' : 'rojo';
    return `<span class="${left<=0?'ready':''}">${esc(BT(e.owner,e.type).nombre)} (${who}) <b>${left>0 ? clock(left) : 'lista'}</b></span>`;
  }).join('');
}

// Selector de facción (menú y sala)
let soloFaction = 'atlas', soloMap = null, CURRENT_MAP = null;
function setSoloMap(m){
  if(m){ const err = mapError(m); if(err){ menuMsg(err, true); return; } }
  soloMap = m; $('mapName').textContent = m ? (m.nombre || 'Mapa personalizado') : 'Estándar'; $('btnMapStd').hidden = !m;
}
function readMapFile(input, done){
  input.onchange = e => { const f = e.target.files[0]; if(!f) return; f.text().then(t => done(JSON.parse(t))).catch(() => menuMsg('No fue posible leer el mapa', true)); e.target.value = ''; };
  input.click();
}
function factionCards(el, current, onPick){
  el.innerHTML = Object.entries(FACTIONS).map(([k,F]) => `<button class="faction${k===current?' on':''}" data-f="${k}"><b>${F.nombre}</b><span>${F.lema}. ${F.rasgos.join('. ')}.</span></button>`).join('');
  el.onclick = e => { const b = e.target.closest('button'); if(b) onPick(b.dataset.f); };
}
function renderMenuFactions(){ factionCards($('menuFactions'), soloFaction, f => { soloFaction = f; renderMenuFactions(); applyTheme(f); }); }
renderMenuFactions();

const params = new URLSearchParams(location.search);
// ======================= SEGURIDAD: URL externas =======================
// Solo se aceptan URL http(s) del mismo origen (evita redirecciones abiertas y javascript:).
function safeUrl(u){
  if(!u) return null;
  try { const url = new URL(u, location.href); if(!/^https?:$/.test(url.protocol)) return null; if(location.protocol!=='file:' && url.origin!==location.origin) return null; return url.href; } catch(e){ return null; }
}

// ======================= OPCIONES =======================
const OPTIONS_KEY = 'frente-arido-opciones-v1', FPS = { n:0, t:0, v:0 };
const DEFAULT_OPTIONS = { calidad:'alta', sombras:true, escala:100, paleta:'clasica', volumen:45, camara:1, fps:false, bordes:true };
function cleanOptions(o){
  const d = Object.assign({}, DEFAULT_OPTIONS); if(!o || typeof o!=='object') return d;
  if(['alta','media','baja'].includes(o.calidad)) d.calidad = o.calidad;
  d.sombras = o.sombras!==false; d.fps = !!o.fps; d.bordes = o.bordes!==false;
  if([90,100,115,130].includes(o.escala)) d.escala = o.escala;
  if(PALETTES[o.paleta]) d.paleta = o.paleta;
  d.volumen = Math.max(0, Math.min(100, o.volumen|0)); d.camara = Math.max(0.5, Math.min(2, Number(o.camara)||1));
  return d;
}
let OPTIONS = (() => { try { return cleanOptions(JSON.parse(localStorage.getItem(OPTIONS_KEY))); } catch(e){ return Object.assign({}, DEFAULT_OPTIONS); } })();
function applyOptions(rebuild){
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(OPTIONS.calidad==='alta' ? Math.min(dpr, 2) : OPTIONS.calidad==='media' ? 1 : 0.7);
  renderer.shadowMap.enabled = OPTIONS.sombras; sun.castShadow = OPTIONS.sombras;
  for(const m of matCache.values()) m.needsUpdate = true;
  document.documentElement.style.setProperty('--ui-zoom', OPTIONS.escala/100);
  const pal = PALETTES[OPTIONS.paleta]; TEAM[0] = pal.team[0]; TEAM[1] = pal.team[1]; TEAM_DARK[0] = pal.dark[0]; TEAM_DARK[1] = pal.dark[1];
  for(const c of [...PALETTES.clasica.team, ...PALETTES.clasica.dark, ...PALETTES.accesible.team, ...PALETTES.accesible.dark]) NOTINT.add(c);
  document.documentElement.style.setProperty('--atlas', pal.css[0]); document.documentElement.style.setProperty('--hierro', pal.css[1]);
  if(SFX.master) SFX.master.gain.value = OPTIONS.volumen/100;
  $('fpsChip').hidden = !OPTIONS.fps;
  resize();
  if(rebuild && S.ents){ for(const o of meshes.values()) scene.remove(o.g); meshes.clear(); for(const e of S.ents) if(!e.dead) hooks.spawn(e); }
}
function saveOptions(){ try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(OPTIONS)); } catch(e){} }
function renderOptions(){
  const seg = (k, vals, labels) => `<span class="tabs">${vals.map((v,i) => `<button data-opt="${k}" data-val="${v}" class="${String(OPTIONS[k])===String(v)?'on':''}">${labels[i]}</button>`).join('')}</span>`;
  $('optBody').innerHTML = `
    <div class="maprow"><span>Calidad gráfica</span>${seg('calidad',['alta','media','baja'],['Alta','Media','Baja'])}</div>
    <div class="maprow"><span>Sombras</span>${seg('sombras',[true,false],['Sí','No'])}</div>
    <div class="maprow"><span>Tamaño de la interfaz</span>${seg('escala',[90,100,115,130],['90 %','100 %','115 %','130 %'])}</div>
    <div class="maprow"><span>Colores de los equipos</span>${seg('paleta',['clasica','accesible'],['Azul y rojo','Azul y naranja (accesible)'])}</div>
    <label>Volumen: ${OPTIONS.volumen} %<input type="range" min="0" max="100" step="5" value="${OPTIONS.volumen}" data-range="volumen"></label>
    <label>Velocidad de la cámara: ${OPTIONS.camara.toFixed(1)}×<input type="range" min="0.5" max="2" step="0.1" value="${OPTIONS.camara}" data-range="camara"></label>
    <div class="maprow"><span>Desplazar la cámara con el mouse en los bordes</span>${seg('bordes',[true,false],['Sí','No'])}</div>
    <div class="maprow"><span>Mostrar cuadros por segundo</span>${seg('fps',[true,false],['Sí','No'])}</div>
    <p class="sub">Para computadores de laboratorio con poca capacidad gráfica: calidad Baja y sin sombras.</p>`;
}
function setOption(k, v){
  if(k==='sombras' || k==='fps' || k==='bordes') v = v==='true' || v===true; else if(k==='escala' || k==='volumen') v = Number(v); else if(k==='camara') v = Number(v);
  OPTIONS = cleanOptions(Object.assign({}, OPTIONS, { [k]:v })); saveOptions(); applyOptions(k==='paleta'); renderOptions();
}

// ======================= PERFIL E HISTORIAL =======================
const PROFILE_KEY = 'frente-arido-perfil-v1';
function defaultProfile(){ return { v:1, nombre:'Comandante', creado:new Date().toISOString(), campania:{ atlas:{}, hierro:{}, guerrilla:{} }, historial:[], stats:{ partidas:0, victorias:0 } }; }
function cleanProfile(p){
  const d = defaultProfile();
  if(!p || typeof p!=='object' || p.v!==1) return d;
  d.nombre = String(p.nombre || d.nombre).slice(0, 24); d.creado = String(p.creado || d.creado).slice(0, 30);
  for(const f of Object.keys(d.campania)){ const src = p.campania && p.campania[f]; if(!src || typeof src!=='object') continue;
    for(const id of Object.keys(src)) if(MISSIONS[id] && MISSIONS[id].faccion===f){ const r = src[id]; d.campania[f][id] = { estrellas:Math.max(1,Math.min(3,r.estrellas|0)), mejor:Math.max(0,r.mejor|0), dificultad:['facil','normal','dificil'].includes(r.dificultad)?r.dificultad:'normal' }; } }
  if(Array.isArray(p.historial)) d.historial = p.historial.slice(0, 50).filter(h => h && typeof h==='object').map(h => ({ fecha:String(h.fecha||'').slice(0,30), modo:String(h.modo||'').slice(0,20), faccion:String(h.faccion||'').slice(0,12), rival:String(h.rival||'').slice(0,40), resultado:String(h.resultado||'').slice(0,12), duracion:Math.max(0,h.duracion|0), mision:h.mision ? String(h.mision).slice(0,20) : null, apm:Math.max(0,Math.min(1000,h.apm|0)), fps:Math.max(0,Math.min(240,h.fps|0)) }));
  d.tutorial = !!p.tutorial;
  if(p.stats){ d.stats.partidas = Math.max(0, p.stats.partidas|0); d.stats.victorias = Math.max(0, p.stats.victorias|0); }
  return d;
}
let PROFILE = (() => { try { return cleanProfile(JSON.parse(localStorage.getItem(PROFILE_KEY))); } catch(e){ return defaultProfile(); } })();
function saveProfile(){ try { localStorage.setItem(PROFILE_KEY, JSON.stringify(PROFILE)); } catch(e){} renderProfileLine(); }
function renderProfileLine(){
  $('profName').textContent = PROFILE.nombre;
  const done = Object.values(PROFILE.campania).reduce((a,c) => a + Object.keys(c).length, 0);
  $('profStats').textContent = `${PROFILE.stats.victorias} victorias de ${PROFILE.stats.partidas} · ${done}/9 misiones`;
}
// Sincronización opcional con Laravel: ?api=URL&perfil=TOKEN (token firmado, de corta duración)
const REMOTE = (() => { const api = safeUrl(params.get('api')), tok = params.get('perfil'); return api && tok && /^[\w\-]+\.[\w\-]+$/.test(tok) ? { api:api.replace(/\/$/, ''), tok } : null; })();
function syncMsg(t, err){ const el = $('syncMsg'); if(el){ el.textContent = t; el.classList.toggle('err', !!err); } }
async function remote(path, body){
  if(!REMOTE) return null;
  const res = await fetch(REMOTE.api + path, { method: body ? 'POST' : 'GET', credentials:'same-origin',
    headers: Object.assign({ 'Accept':'application/json', 'X-Perfil-Token':REMOTE.tok }, body ? { 'Content-Type':'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
  if(!res.ok) throw new Error(res.status);
  return res.status===204 ? null : res.json();
}
async function pullRemote(){
  if(!REMOTE) return;
  try {
    const r = await remote('/progreso');
    if(r && r.nombre) PROFILE.nombre = String(r.nombre).slice(0,24);
    if(r && r.campania) for(const f in r.campania) for(const id in r.campania[f]){
      if(!MISSIONS[id] || !PROFILE.campania[f]) continue;
      const a = PROFILE.campania[f][id], b = r.campania[f][id];
      PROFILE.campania[f][id] = !a ? b : { estrellas:Math.max(a.estrellas, b.estrellas), mejor:Math.min(a.mejor||1e9, b.mejor||1e9), dificultad:b.estrellas>a.estrellas ? b.dificultad : a.dificultad };
    }
    if(r && Array.isArray(r.historial)) PROFILE.historial = r.historial.slice(0,50);
    if(r && r.stats) PROFILE.stats = r.stats;
    PROFILE = cleanProfile(PROFILE); saveProfile(); syncMsg('Progreso sincronizado con su cuenta.');
  } catch(e){ syncMsg('No fue posible sincronizar con el servidor. El progreso se guarda en este navegador.', true); }
}
function recordGame(rec){
  const mins = Math.max(1/60, (rec.duracion||0)/60); rec.apm = Math.round(METRICS.cmds / mins); rec.fps = METRICS.frames ? Math.round(METRICS.frames / Math.max(0.001, METRICS.time)) : 0;
  rec.fecha = new Date().toISOString();
  PROFILE.historial.unshift(rec); PROFILE.historial = PROFILE.historial.slice(0, 50);
  PROFILE.stats.partidas++; if(rec.resultado==='victoria') PROFILE.stats.victorias++;
  saveProfile();
  remote('/progreso/registro', rec).catch(() => {});
}
function recordMission(id, estrellas, segundos, dificultad){
  const f = MISSIONS[id].faccion, cur = PROFILE.campania[f][id];
  PROFILE.campania[f][id] = { estrellas:Math.max(estrellas, cur ? cur.estrellas : 0), mejor:Math.min(segundos, cur && cur.mejor ? cur.mejor : 1e9), dificultad: !cur || estrellas >= cur.estrellas ? dificultad : cur.dificultad };
  saveProfile();
  remote('/progreso/mision', { mision:id, faccion:f, estrellas, segundos, dificultad, version:SIM_VERSION, ticks:S.tick, log:S.log }).then(r => syncMsg(r && r.estrellas ? `Misión verificada por el servidor: ${r.estrellas} estrella(s).` : 'Misión registrada en su cuenta.')).catch(() => syncMsg('La misión quedó guardada en este navegador. No se pudo enviar al servidor.', true));
}
const MODO_TXT = { solo:'Escaramuza', mision:'Campaña', online:'En línea' };
function renderHistory(){
  $('inProfile').value = PROFILE.nombre;
  $('histStats').textContent = `Partidas: ${PROFILE.stats.partidas}. Victorias: ${PROFILE.stats.victorias}. Perfil creado: ${PROFILE.creado.slice(0,10)}.${REMOTE ? ' Sincronizado con la cuenta del lobby.' : ' Guardado solo en este navegador.'}`;
  $('histCamp').innerHTML = Object.entries(CAMPAIGNS).map(([f,c]) => `<p><b>${esc(c.nombre)}</b> (${FACTIONS[f].nombre}): ` + c.misiones.map(m => { const r = PROFILE.campania[f][m.id]; return `${esc(m.nombre)} ${r ? '★'.repeat(r.estrellas) + '☆'.repeat(3-r.estrellas) : '—'}`; }).join(' · ') + '</p>').join('');
  $('histTable').innerHTML = PROFILE.historial.length ? PROFILE.historial.slice(0,20).map(h => `<tr><td>${esc(h.fecha.slice(0,16).replace('T',' '))}</td><td>${esc(MODO_TXT[h.modo]||h.modo)}${h.mision && MISSIONS[h.mision] ? ' · ' + esc(MISSIONS[h.mision].nombre) : ''}</td><td>${esc(FACTIONS[h.faccion] ? FACTIONS[h.faccion].nombre : h.faccion)}</td><td>${esc(h.rival)}</td><td>${esc(h.resultado)}</td><td>${clock(h.duracion)}</td><td>${h.apm||'–'}</td><td>${h.fps||'–'}</td></tr>`).join('') : '<tr><td colspan="8">Aún no hay partidas registradas.</td></tr>';
  $('histStats').textContent += PROFILE.tutorial ? ' Entrenamiento completado.' : ' Entrenamiento pendiente.';
}

// ======================= CAMPAÑA =======================
const CAMP = { faction:'atlas', sel:null, diff:'normal' };
const MISSION_UI = { id:null, diff:'normal', lastOk:0 };
const DIFF_TXT = { facil:'Fácil', normal:'Normal', dificil:'Difícil' };
function missionUnlocked(m){ const list = CAMPAIGNS[m.faccion].misiones; return m.orden===0 || !!PROFILE.campania[m.faccion][list[m.orden-1].id]; }
function objText(o){ return o.texto + (o.secundario ? ' (secundario)' : ''); }
function renderCampaign(){
  const C = CAMPAIGNS[CAMP.faction]; applyTheme(CAMP.faction);
  $('campLema').textContent = `${C.nombre}. ${C.lema}`;
  $('campTabs').innerHTML = Object.keys(CAMPAIGNS).map(f => `<button data-cf="${f}" class="${f===CAMP.faction?'on':''}">${FACTIONS[f].nombre}</button>`).join('');
  if(!CAMP.sel || MISSIONS[CAMP.sel].faccion!==CAMP.faction) CAMP.sel = (C.misiones.find(m => missionUnlocked(m) && !PROFILE.campania[CAMP.faction][m.id]) || C.misiones[0]).id;
  $('campList').innerHTML = C.misiones.map(m => { const r = PROFILE.campania[CAMP.faction][m.id], open = missionUnlocked(m);
    return `<button data-mid="${m.id}" class="${m.id===CAMP.sel?'on':''}" ${open?'':'disabled'}><b>${m.orden+1}. ${esc(m.nombre)}</b><small>${open ? (r ? 'Completada' : 'Disponible') : 'Bloqueada: complete la misión anterior'}</small><span class="stars">${r ? '★'.repeat(r.estrellas)+'☆'.repeat(3-r.estrellas) : '☆☆☆'}</span></button>`; }).join('');
  const m = MISSIONS[CAMP.sel], r = PROFILE.campania[CAMP.faction][m.id];
  $('campDetail').innerHTML = `<h3 style="margin-top:0">${esc(m.nombre)}</h3><p>${esc(m.briefing)}</p>
    <p class="sub">Enemigo: ${FACTIONS[m.enemigo].nombre}. Mapa: ${m.mapa.plantilla==='estandar' ? 'Estándar' : esc(generateMap(m.mapa.plantilla, m.mapa.semilla).nombre)}.${m.rango ? ` Rango inicial ${m.rango}.` : ''}${r ? ` Mejor tiempo: ${clock(r.mejor)} (${DIFF_TXT[r.dificultad]}).` : ''}</p>
    <b>Objetivos</b><ul>${m.objetivos.map(o => `<li>${esc(objText(o))}</li>`).join('')}</ul>
    <div class="maprow"><span>Dificultad</span><span class="tabs">${['facil','normal','dificil'].map(d => `<button data-cd="${d}" class="${d===CAMP.diff?'on':''}">${DIFF_TXT[d]}</button>`).join('')}</span></div>
    <p class="sub">Estrellas: 1 por cumplir la misión, 1 por los objetivos secundarios y 1 por la dificultad Difícil.</p>
    <button class="primary" data-start="${m.id}">Iniciar misión</button>`;
}
function startMission(id, diff){
  const m = MISSIONS[id]; if(!m || (id!=='tutorial' && !missionUnlocked(m))) return;
  const fac = id==='tutorial' ? soloFaction : m.faccion;
  const def = missionDef(id, diff, fac), map = generateMap(m.mapa.plantilla, m.mapa.semilla);
  MISSION_UI.id = id; MISSION_UI.diff = diff; MISSION_UI.lastOk = 0;
  $('campaign').hidden = true; $('menu').hidden = true;
  startGame(def.semilla, 'mision', [fac, m.enemigo], m.sinIA ? [] : [1], map, def);
  paused = false;
}
function missionStars(){
  const M = S.mission; if(!M || M.result!=='ok') return 0;
  const sec = M.def.objetivos.every((o,i) => !o.secundario || M.state[i]==='ok');
  return 1 + (sec ? 1 : 0) + (MISSION_UI.diff==='dificil' ? 1 : 0);
}
function renderObjectives(){
  const el = $('objectives'), M = S.mission;
  if(!M || REPLAY && !M){ el.hidden = true; return; }
  el.hidden = false;
  const sec = Math.floor(S.tick/TICK_HZ);
  el.innerHTML = `<h4>${esc(M.def.nombre)}</h4><ul>` + M.def.objetivos.map((o,i) => {
    const st = M.state[i], icon = st==='ok' ? '✓' : st==='fail' ? '✗' : '•';
    let extra = ''; if(o.tipo==='sobrevivir' && st==='pend') extra = ` · ${clock(o.segundos-sec)}`; if(o.tipo==='limite' && st==='pend') extra = ` · quedan ${clock(o.segundos-sec)}`;
    return `<li class="${o.secundario?'sec':''}"><span class="st ${st}">${icon}</span><span>${esc(objText(o))}${extra}</span></li>`;
  }).join('') + '</ul>';
}
let txTimer = 0;
function showTransmission(text){
  $('txText').textContent = text; $('transmission').hidden = false; sfx('radio');
  clearTimeout(txTimer); txTimer = setTimeout(() => { $('transmission').hidden = true; }, Math.min(12000, 4000 + text.length*45));
}

// ======================= RED (lockstep con reloj de servidor) =======================
const RETURN_URL = safeUrl(params.get('return'));
const NET = { ws:null, online:false, started:false, slot:0, queue:[], lastPkt:0, ping:null, pingT:null, sentResult:false, names:['',''], room:'', ended:null, overAt:0, faction:null };
function netSend(m){ if(NET.ws && NET.ws.readyState===1) NET.ws.send(JSON.stringify(m)); }
function menuMsg(t, err){ const el=$('menuMsg'); el.textContent=t; el.classList.toggle('err', !!err); }
function roomMsg(t, err){ const el=$('roomMsg'); el.textContent=t; el.classList.toggle('err', !!err); }
function netConnect(url, room, name, token){
  if(NET.ws){ const old = NET.ws; NET.ws = null; try{ old.close(); }catch(e){} }
  menuMsg('Conectando…');
  let ws;
  try { ws = new WebSocket(url); } catch(e){ menuMsg('Dirección de servidor inválida', true); return; }
  NET.ws = ws;
  ws.onopen = () => netSend({ t:'join', room, name, token });
  ws.onerror = () => { if(!NET.started) menuMsg('No fue posible conectar con el servidor', true); };
  ws.onclose = () => {
    if(NET.ws!==ws) return;
    clearInterval(NET.pingT);
    if(NET.started && !NET.ended){ $('netwait').hidden=false; $('netwait').textContent='Conexión perdida. Reintentando…'; setTimeout(() => { if(NET.ws===ws) netConnect(url, room, name, token); }, 2000); }
  };
  ws.onmessage = ev => onNet(JSON.parse(ev.data));
}
function onNet(m){
  switch(m.t){
    case 'joined':
      NET.slot = m.slot; NET.room = m.room;
      $('menu').hidden = true; $('roomCode').textContent = m.room;
      if(!NET.started){ $('room').hidden = false; if(soloFaction) netSend({ t:'faction', f:soloFaction }); }
      clearInterval(NET.pingT); NET.pingT = setInterval(() => netSend({ t:'ping', ts:performance.now() }), 2000);
      break;
    case 'room': renderRoom(m); break;
    case 'start': {
      if(!Number.isInteger(m.seed) || (m.slot!==0 && m.slot!==1) || !Array.isArray(m.factions) || !m.factions.every(f => FACTIONS[f]) || (m.map && mapError(m.map)) || !Array.isArray(m.log)){ toast('Mensaje de inicio inválido del servidor'); break; }
      LOCAL = m.slot; NET.names = m.names; NET.online = true; NET.started = true; NET.ended = null; NET.sentResult = false; NET.overAt = 0;
      $('room').hidden = true; $('menu').hidden = true; $('netwait').hidden = true;
      SFX.hush = true;
      startGame(m.seed, 'online', m.factions, null, m.map || null);
      NET.queue = [];
      if(m.log && m.log.length){ const t0=performance.now(); for(const pkt of m.log) applyNetTick(pkt); updateFog(0, true); toast(`Partida recuperada: ${m.log.length} ticks en ${Math.round(performance.now()-t0)} ms`); }
      SFX.hush = false;
      NET.lastPkt = performance.now();
      break; }
    case 'tick': if(!Number.isInteger(m.n) || !Array.isArray(m.c)) break; NET.queue.push(m); NET.lastPkt = performance.now(); break;
    case 'paused': $('netwait').hidden = false; $('netwait').textContent = m.reason; break;
    case 'resumed': $('netwait').hidden = true; break;
    case 'pong': NET.ping = Math.round(performance.now() - m.ts); break;
    case 'desync': NET.ended = { winner:-1, reason:'desincronizacion' }; if(!S.over){ S.over = true; S.winner = -1; } break;
    case 'ended': NET.ended = { winner:m.winner, reason:m.reason }; if(!S.over){ S.over = true; S.winner = m.winner; } $('netwait').hidden = true; break;
    case 'error': if(NET.started) toast(m.msg); else if(!$('room').hidden) roomMsg(m.msg, true); else { $('room').hidden = true; $('menu').hidden = false; menuMsg(m.msg, true); } break;
  }
}
function renderRoom(m){
  $('roomPlayers').innerHTML = m.players.map((p,i) => `<tr><td>Jugador ${i+1} (${i===0?'azul':'rojo'})</td><td>${p ? `${esc(p.name)}${i===NET.slot?' (usted)':''} · ${FACTIONS[p.faction] ? FACTIONS[p.faction].nombre : ''} · ${p.connected ? (p.ready?'listo':'esperando') : 'desconectado'}` : '<span style="color:var(--muted)">libre</span>'}</td></tr>`).join('');
  const me = m.players[NET.slot];
  $('roomMap').textContent = m.mapName || 'Estándar';
  $('btnRoomMap').hidden = NET.slot!==0 || !!(me && me.ready); $('btnRoomMapStd').hidden = NET.slot!==0 || !m.mapName || !!(me && me.ready);
  if(me){ NET.faction = me.faction; factionCards($('roomFactions'), me.faction, f => { if(!me.ready) netSend({ t:'faction', f }); else roomMsg('Cancele «Listo» para cambiar de facción.'); }); }
  $('btnReady').textContent = me && me.ready ? 'Cancelar listo' : 'Listo';
  roomMsg(m.players.every(Boolean) ? '' : 'Comparta el código de sala con el rival.');
}
function applyNetTick(pkt){
  if(pkt.n < S.tick) return;
  if(pkt.n > S.tick) console.warn('Tick fuera de orden', pkt.n, S.tick);
  for(const c of pkt.c){ c.tick = S.tick; S.cmdQueue.push(c); }
  simTick();
  if(S.tick % 30 === 0) netSend({ t:'hash', n:S.tick, h:stateHash() });
}
let soloSlotChoice = 'aleatoria', soloSlot = 0;
$('startPos').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; soloSlotChoice = b.dataset.pos; document.querySelectorAll('#startPos button').forEach(x => x.classList.toggle('on', x===b)); });
$('btnSolo').addEventListener('click', () => {
  soloSlot = soloSlotChoice==='aleatoria' ? (Math.random() < 0.5 ? 0 : 1) : +soloSlotChoice;
  $('menu').hidden = true; startGame(20261004 + Math.floor(Math.random()*1e6), 'solo'); paused = false; soloSlot = 0;
});
let soloDiff = 'normal';
$('soloDiff').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; soloDiff = b.dataset.diff; document.querySelectorAll('#soloDiff button').forEach(x => x.classList.toggle('on', x===b)); });
$('btnCampaign').addEventListener('click', () => { CAMP.faction = soloFaction; renderCampaign(); $('menu').hidden = true; $('campaign').hidden = false; pullRemote().then(() => { if(!$('campaign').hidden) renderCampaign(); }); });
$('btnCampBack').addEventListener('click', () => { $('campaign').hidden = true; $('menu').hidden = false; applyTheme(soloFaction); });
$('campaign').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b || b.disabled) return; sfx('click');
  if(b.dataset.cf){ CAMP.faction = b.dataset.cf; CAMP.sel = null; renderCampaign(); }
  else if(b.dataset.mid){ CAMP.sel = b.dataset.mid; renderCampaign(); }
  else if(b.dataset.cd){ CAMP.diff = b.dataset.cd; renderCampaign(); }
  else if(b.dataset.start) startMission(b.dataset.start, CAMP.diff);
});
$('btnHistory').addEventListener('click', () => { renderHistory(); $('history').hidden = false; });
$('btnHistClose').addEventListener('click', () => { const n = $('inProfile').value.trim(); if(n){ PROFILE.nombre = n.slice(0,24); saveProfile(); } $('history').hidden = true; });
$('btnProfExport').addEventListener('click', () => { const blob = new Blob([JSON.stringify(PROFILE)], { type:'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'frente-arido-progreso.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); });
$('btnProfImport').addEventListener('click', () => { const inp = $('profFile'); inp.onchange = e => { const f = e.target.files[0]; if(!f) return; f.text().then(t => { const p = cleanProfile(JSON.parse(t)); PROFILE = p; saveProfile(); renderHistory(); $('histMsg').textContent = 'Progreso importado.'; }).catch(() => { $('histMsg').textContent = 'El archivo no es un progreso válido.'; }); e.target.value = ''; }; inp.click(); });
$('btnTreeClose').addEventListener('click', () => { $('tree').hidden = true; });
$('treeBody').addEventListener('click', e => { const b = e.target.closest('button'); if(!b || b.disabled) return; issue({ t:'unlock', power:b.dataset.node }); sfx('rank'); setTimeout(() => { renderTree(); renderPowers(); }, 120); });
$('btnNextMission').addEventListener('click', () => { const mm = MISSIONS[MISSION_UI.id], next = CAMPAIGNS[mm.faccion].misiones[mm.orden+1]; if(next) startMission(next.id, MISSION_UI.diff); });
$('btnRetry').addEventListener('click', () => startMission(MISSION_UI.id, MISSION_UI.diff));
$('btnTutorial').addEventListener('click', () => { $('menu').hidden = true; startMission('tutorial', 'facil'); });
$('btnCampMenu').addEventListener('click', () => { endEl.hidden = true; startGame(20261004, 'solo'); paused = true; powersEl.hidden = true; CAMP.faction = MISSIONS[MISSION_UI.id].faccion; renderCampaign(); $('campaign').hidden = false; });
$('btnOnline').addEventListener('click', () => {
  const url = $('inServer').value.trim(), room = $('inRoom').value.trim().toUpperCase(), name = $('inName').value.trim() || 'Jugador';
  if(!/^wss?:\/\//.test(url)){ menuMsg('El servidor debe iniciar con ws:// o wss://', true); return; }
  if(room.length < 3){ menuMsg('El código de sala debe tener al menos 3 caracteres', true); return; }
  netConnect(url, room, name, null);
});
$('btnReady').addEventListener('click', () => netSend({ t:'ready', ready:$('btnReady').textContent==='Listo' }));
$('btnLeave').addEventListener('click', () => { const ws = NET.ws; NET.ws = null; if(ws) ws.close(); $('room').hidden = true; $('menu').hidden = false; menuMsg(''); });

// ======================= REPETICIONES =======================
// Una repetición guarda semilla, facciones, jugadores IA y las órdenes por tick. La simulación determinista hace el resto.
let REC = null, REPLAY = null;
function replayData(){
  return { formato:'frente-arido-repeticion', v:SIM_VERSION, seed:S.seed, factions:S.players.map(p => p.faction), ai:S.aiPlayers.slice(),
           names:REC ? REC.names : ['Jugador 1','Jugador 2'], local:REC ? REC.local : 0, map:CURRENT_MAP, mission:S.mission ? S.mission.def : null, aiLevel:CURRENT_LEVEL, fecha:new Date().toISOString(), ticks:S.tick, winner:S.winner, log:S.log };
}
function downloadReplay(){
  const d = replayData(), blob = new Blob([JSON.stringify(d)], { type:'application/json' });
  const a = document.createElement('a'), f = d.fecha.slice(0,16).replace(/[-:T]/g,'');
  a.href = URL.createObjectURL(blob); a.download = `frente-arido-${f}.json`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function startReplay(d){
  if(!d || d.formato!=='frente-arido-repeticion' || !Array.isArray(d.log)){ menuMsg('El archivo no es una repetición válida', true); return; }
  // Repeticiones del servidor: ticks sin órdenes omitidos, formato [[n,[órdenes]]]
  const log = d.log.map(x => Array.isArray(x) ? x : [x.n, x.c]);
  $('menu').hidden = true; endEl.hidden = true;
  REPLAY = { d, log, idx:0, speed:1, paused:false, total:d.ticks || (log.length ? log[log.length-1][0]+1 : 0), done:false };
  if(d.map && mapError(d.map)){ menuMsg('La repetición contiene un mapa inválido', true); REPLAY = null; return; }
  startGame(d.seed, 'replay', d.factions, d.ai || [], d.map || null, d.mission || null, d.aiLevel || 'normal');
  document.body.classList.add('replay'); $('replaybar').hidden = false; setView('all');
  if(d.v !== SIM_VERSION) toast(`Repetición de la versión ${d.v}. Puede no reproducirse igual en la ${SIM_VERSION}.`);
}
function replayStep(){
  const R = REPLAY;
  while(R.idx < R.log.length && R.log[R.idx][0] < S.tick) R.idx++;
  if(R.idx < R.log.length && R.log[R.idx][0] === S.tick){ for(const c of R.log[R.idx][1]){ const o = Object.assign({}, c); o.tick = S.tick; S.cmdQueue.push(o); } R.idx++; }
  simTick();
}
function setView(v){
  VIEW_ALL = v==='all'; if(!VIEW_ALL) LOCAL = +v;
  document.querySelectorAll('#replaybar [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view===String(v)));
  updateFog(0, true);
}
function exitReplay(){
  REPLAY = null; VIEW_ALL = false; document.body.classList.remove('replay'); $('replaybar').hidden = true;
  if(RETURN_URL && params.get('replay')){ location.href = RETURN_URL; return; }
  startGame(20261004, 'solo'); paused = true; powersEl.hidden = true; $('menu').hidden = false; menuMsg('');
}
$('replaybar').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b || !REPLAY) return;
  if(b.id==='rpPlay'){ REPLAY.paused = !REPLAY.paused; b.textContent = REPLAY.paused ? 'Reanudar' : 'Pausa'; }
  else if(b.id==='rpExit') exitReplay();
  else if(b.dataset.speed){ REPLAY.speed = +b.dataset.speed; document.querySelectorAll('#replaybar [data-speed]').forEach(x => x.classList.toggle('on', x===b)); }
  else if(b.dataset.view) setView(b.dataset.view);
});
$('btnReplayLoad').addEventListener('click', () => $('replayFile').click());
$('replayFile').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  f.text().then(t => startReplay(JSON.parse(t))).catch(() => menuMsg('No fue posible leer el archivo', true));
  e.target.value = '';
});
$('btnReplaySave').addEventListener('click', downloadReplay);
$('btnMapLoad').addEventListener('click', () => readMapFile($('mapFile'), m => { setSoloMap(m); markTpl(''); if(soloMap) menuMsg(`Mapa cargado: ${soloMap.nombre || 'sin nombre'}`); }));
$('btnMapStd').addEventListener('click', () => { setSoloMap(null); markTpl('estandar'); });
const markTpl = t => document.querySelectorAll('#mapTpl button').forEach(b => b.classList.toggle('on', b.dataset.tpl===t));
$('mapTpl').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; const t = b.dataset.tpl; setSoloMap(t==='estandar' ? null : generateMap(t, 3)); $('btnMapStd').hidden = true; markTpl(t); });
$('btnRoomMap').addEventListener('click', () => readMapFile($('mapFile'), m => { const err = mapError(m); if(err){ roomMsg(err, true); return; } netSend({ t:'map', map:m }); }));
$('btnRoomMapStd').addEventListener('click', () => netSend({ t:'map', map:null }));
// Prueba desde el editor: el editor abre el juego y envía el mapa por postMessage
addEventListener('message', ev => { const d = ev.data; if(!window.opener || ev.source!==window.opener) return; if(d && d.type==='fa-map' && d.map){ setSoloMap(d.map); if(soloMap){ $('menu').hidden = false; menuMsg(`Mapa recibido del editor: ${soloMap.nombre || 'sin nombre'}`); } } });
if(window.opener){ try { window.opener.postMessage({ type:'fa-ready' }, '*'); } catch(e){} }

// Fin de partida
const endEl = $('end');
let endShown = false;
const REASONS = { abandono:'Un jugador abandonó la partida.', desincronizacion:'Partida anulada: los clientes perdieron la sincronía.', discrepancia:'Los clientes reportaron resultados distintos.' };
let RECORDED = false, GAME_MODE = 'solo', CURRENT_LEVEL = 'normal';
function showEnd(){
  endShown = true; endEl.hidden = false;
  $('btnReplaySave').hidden = !!REPLAY;
  ['btnNextMission','btnRetry','btnCampMenu'].forEach(id => $(id).hidden = true); $('endStars').textContent = '';
  if(REPLAY){
    $('endTitle').textContent = 'Fin de la repetición';
    $('endText').textContent = S.winner>=0 ? `Ganó el jugador ${S.winner+1} (${FACTIONS[S.players[S.winner].faction].nombre}) en ${clock(Math.floor(S.tick/TICK_HZ))}.` : `Duración ${clock(Math.floor(S.tick/TICK_HZ))}.`;
    $('btnRestart').textContent = 'Salir de la repetición'; return;
  }
  const s = Math.floor(S.tick/TICK_HZ), reason = NET.online && NET.ended ? NET.ended.reason : null, pl = S.players[LOCAL];
  const win = S.winner===LOCAL;
  sfx(win ? 'win' : 'lose');
  if(GAME_MODE==='mision' && S.mission){
    const M = S.mission, ok = M.result==='ok', stars = missionStars(), mm = MISSIONS[MISSION_UI.id], tut = mm.id==='tutorial';
    $('endTitle').textContent = ok ? 'Misión cumplida' : 'Misión fallida';
    $('endStars').textContent = ok ? '★'.repeat(stars) + '☆'.repeat(3-stars) : '';
    $('endText').textContent = `${mm.nombre}. Duración ${clock(s)}. Dificultad ${DIFF_TXT[MISSION_UI.diff]}. Bajas causadas: ${pl.kills}.` + (ok ? '' : ' ' + (M.def.objetivos.find((o,i) => M.state[i]==='fail') ? 'Objetivo fallido: ' + M.def.objetivos.find((o,i) => M.state[i]==='fail').texto + '.' : 'Se perdieron todos los edificios.'));
    if(!RECORDED){ RECORDED = true; if(ok && !tut) recordMission(mm.id, stars, s, MISSION_UI.diff); if(ok && tut){ PROFILE.tutorial = true; saveProfile(); } recordGame({ modo:'mision', faccion:S.players[0].faction, rival:FACTIONS[mm.enemigo].nombre, resultado: ok ? 'victoria' : 'derrota', duracion:s, mision:mm.id }); }
    const next = tut ? null : CAMPAIGNS[mm.faccion].misiones[mm.orden+1];
    $('btnNextMission').hidden = !(ok && next); $('btnRetry').hidden = false; $('btnCampMenu').hidden = tut;
    if(tut) $('endText').textContent = ok ? 'Entrenamiento completado. Ya puede iniciar la campaña o una escaramuza.' : 'Entrenamiento interrumpido.';
    $('btnRestart').textContent = 'Menú principal';
    return;
  }
  $('endTitle').textContent = S.winner<0 ? 'Partida anulada' : win ? 'Victoria' : 'Derrota';
  $('endText').textContent = (REASONS[reason] ? REASONS[reason]+' ' : '') + `Duración ${Math.floor(s/60)} min ${s%60} s. Bajas causadas: ${pl.kills}. Bajas sufridas: ${S.players[1-LOCAL].kills}. Rango alcanzado: ${pl.rank}.`;
  $('btnRestart').textContent = NET.online ? (RETURN_URL ? 'Volver al lobby' : 'Volver al menú') : 'Jugar de nuevo';
  if(!RECORDED){ RECORDED = true; recordGame({ modo: NET.online ? 'online' : 'solo', faccion:pl.faction, rival: NET.online ? String(NET.names[1-LOCAL]||'Rival') : `IA ${FACTIONS[S.players[1-LOCAL].faction].nombre} (${DIFF_TXT[CURRENT_LEVEL]})`, resultado: S.winner<0 ? 'anulada' : win ? 'victoria' : 'derrota', duracion:s, mision:null }); }
}
function startGame(seed, mode, factions, aiList, map, mission, aiLevel){
  for(const o of meshes.values()) scene.remove(o.g); meshes.clear();
  for(const f of effects) scene.remove(f.obj); effects.length = 0;
  selected.clear(); setAMove(false); cancelPlacing(); cancelTargeting(); endShown = false; endEl.hidden = true; wasLow = false; RECORDED = false;
  METRICS.cmds = 0; METRICS.frames = 0; METRICS.time = 0;
  if(mode==='online') cmdSink = c => { delete c.tick; netSend({ t:'cmd', c }); };
  else if(mode==='replay'){ LOCAL = 0; NET.online = false; cmdSink = () => {}; }
  else { LOCAL = mode==='solo' ? soloSlot : 0; NET.online = false; cmdSink = null; }
  if(mode!=='mision' && mode!=='replay'){ MISSION_UI.id = null; }
  const others = Object.keys(FACTIONS).filter(k => k!==soloFaction);
  const rival = others[Math.floor(Math.random()*others.length)];
  const fac = factions || (LOCAL===0 ? [soloFaction, rival] : [rival, soloFaction]);
  CURRENT_MAP = map !== undefined ? map : (mode==='solo' ? soloMap : null);
  CURRENT_LEVEL = aiLevel || (mode==='solo' ? soloDiff : 'normal');
  newGame(seed, mode==='online' ? [] : (mode==='replay' || mode==='mision') ? aiList : [1-LOCAL], fac, CURRENT_MAP, mission || null, CURRENT_LEVEL);
  GAME_MODE = mode;
  buildWater();
  REC = { names: mode==='online' ? NET.names.slice() : ['Jugador', 'IA'], local:LOCAL };
  buildRocks(); updateFog(0, true);
  btnPause.hidden = mode!=='solo' && mode!=='mision'; $('pingChip').hidden = mode!=='online'; powersEl.hidden = mode==='replay';
  applyTheme(S.players[LOCAL].faction);
  $('tree').hidden = true; $('transmission').hidden = true; renderObjectives();
  const c = S.ents.find(e => e.kind==='bld' && e.owner===LOCAL && e.type==='centro');
  const sx = Math.sign(WORLD/2-c.x), sz = Math.sign(WORLD/2-c.z);
  cam.x = c.x + sx*(W<700?3:9); cam.z = c.z + sz*5; cam.dist = 50;
  acc = 0;
}
$('btnRestart').addEventListener('click', () => {
  if(REPLAY){ exitReplay(); return; }
  if(GAME_MODE==='mision'){ endEl.hidden = true; startGame(20261004, 'solo'); paused = true; powersEl.hidden = true; $('objectives').hidden = true; $('menu').hidden = false; applyTheme(soloFaction); return; }
  if(NET.online){
    if(RETURN_URL){ location.href = RETURN_URL; return; }
    const ws = NET.ws; NET.ws = null; if(ws) ws.close(); NET.online = false; NET.started = false;
    endEl.hidden = true; $('menu').hidden = false; menuMsg(''); startGame(20261004, 'solo'); paused = true; return;
  }
  startGame((S.seed*16807 + 11) % 2147483647, 'solo');
});

// Bucle principal: simulación a 15 Hz, render a la tasa del navegador con interpolación
let acc = 0, last = performance.now(), uiT = 0;
function frame(now){
  const dt = Math.min(0.25, (now-last)/1000); last = now;
  if(REPLAY){
    const R = REPLAY;
    if(!R.paused && !S.over && S.tick < R.total){ acc += dt*R.speed; let ran = 0; while(acc >= DT && S.tick < R.total && ran < 200){ replayStep(); acc -= DT; ran++; } }
    else if(!S.over && S.tick >= R.total && !R.done){ R.done = true; S.over = true; }
    $('rpTime').textContent = `${clock(Math.floor(S.tick/TICK_HZ))} / ${clock(Math.floor(R.total/TICK_HZ))}`;
  } else if(NET.online){
    if(NET.started && !S.over){
      acc += dt; let ran = 0;
      while(NET.queue.length && (acc >= DT || NET.queue.length > 3) && ran < 120){ applyNetTick(NET.queue.shift()); acc = Math.max(0, acc-DT); ran++; }
      if(!NET.queue.length && acc > DT) acc = DT;
      const stalled = now - NET.lastPkt > 600, nw = $('netwait');
      if(stalled && nw.hidden && NET.ws && NET.ws.readyState===1){ nw.hidden = false; nw.textContent = 'Esperando al servidor…'; }
      else if(!stalled && nw.textContent==='Esperando al servidor…') nw.hidden = true;
    }
    if(S.over && !NET.sentResult){ NET.sentResult = true; NET.overAt = now; netSend({ t:'result', winner:S.winner }); }
  } else if(!paused && !S.over){ acc += dt; while(acc >= DT){ simTick(); acc -= DT; } }
  updateCamera(dt);
  syncMeshes(Math.min(1, acc/DT), dt, now/1000);
  updateGhost(); updateAim();
  updateFog(dt, false);
  updateEffects(dt);
  drawOverlay();
  if(S.tick>0 && !S.over && !paused){ METRICS.frames++; METRICS.time += dt; }
  FPS.n++; FPS.t += dt; if(FPS.t >= 1){ FPS.v = Math.round(FPS.n/FPS.t); FPS.n = 0; FPS.t = 0; if(OPTIONS.fps) $('fpsVal').textContent = FPS.v; }
  uiT -= dt; if(uiT <= 0){ uiT = 0.2; renderPanel(); renderPowers(); updateTopbar(); drawMinimap(); if(S.mission) renderObjectives(); if(NET.online) $('pingVal').textContent = NET.ping==null ? '–' : NET.ping; }
  if(S.over && !endShown && (!NET.online || NET.ended || now - NET.overAt > 1500)) showEnd();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
resize();
applyOptions(false);
const openOptions = () => { renderOptions(); $('options').hidden = false; };
$('btnOptions').addEventListener('click', openOptions); $('btnMenuOptions').addEventListener('click', openOptions);
$('btnOptClose').addEventListener('click', () => { $('options').hidden = true; });
$('optBody').addEventListener('click', e => { const b = e.target.closest('button'); if(b && b.dataset.opt){ sfx('click'); setOption(b.dataset.opt, b.dataset.val); } });
$('optBody').addEventListener('change', e => { const r = e.target.closest('input[type=range]'); if(r) setOption(r.dataset.range, r.value); });
// Exportación del historial a CSV (para el piloto con estudiantes; sin datos personales)
$('btnHistCsv').addEventListener('click', () => {
  const head = ['fecha','modo','faccion','rival','resultado','duracion_s','mision','apm','fps'];
  const q = v => '"' + String(v==null?'':v).replace(/"/g,'""') + '"';
  const rows = PROFILE.historial.map(h => [h.fecha, h.modo, h.faccion, h.rival, h.resultado, h.duracion, h.mision||'', h.apm||'', h.fps||''].map(q).join(','));
  const blob = new Blob(['\ufeff' + head.join(',') + '\n' + rows.join('\n')], { type:'text/csv;charset=utf-8' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'frente-arido-historial.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
});
renderProfileLine();
startGame(20261004, 'solo'); paused = true; applyTheme(soloFaction);
if(REMOTE) pullRemote(); powersEl.hidden = true;
// Conexión automática desde el lobby de Laravel: ?server=&room=&token=&name=&return=
if(params.get('server') && params.get('room') && /^wss?:\/\//.test(params.get('server'))){
  $('inServer').value = params.get('server'); $('inRoom').value = params.get('room'); $('inName').value = params.get('name') || '';
  netConnect(params.get('server'), params.get('room').toUpperCase(), params.get('name') || 'Jugador', params.get('token'));
}
// Repetición desde el lobby: ?replay=URL&return=URL
if(params.get('replay')){
  $('menu').hidden = true;
  const rurl = safeUrl(params.get('replay'));
  (rurl ? fetch(rurl, { credentials:'same-origin', headers:{ 'Accept':'application/json' } }) : Promise.reject(new Error('URL no permitida')))
    .then(r => { if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(startReplay)
    .catch(() => { $('menu').hidden = false; menuMsg('No fue posible cargar la repetición', true); });
}
requestAnimationFrame(frame);
