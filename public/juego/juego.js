// Frente Árido · cliente del juego (simulación, campaña, render, interfaz y red)
"use strict";
// ======================= SIM-START =======================
// Simulación determinista a tick fijo. No usa Math.random, el reloj ni trigonometría.
// Todo cambio de estado entra como comando con número de tick (lockstep).
const TICK_HZ = 15, DT = 1 / TICK_HZ;
// LC: celda de diseño (2 unidades), en la que están los mapas, plantillas, misiones y bases. La simulación usa una
// grilla fina de SUBC × SUBC celdas por celda de diseño (CELL = 0,5 unidades). LG es el lado del mapa en celdas de diseño.
const LC = 2, SUBC = 4, CELL = LC / SUBC;
let LG = 64, GRID = LG * SUBC, WORLD = LG * LC, NCELLS = GRID * GRID;
const L2F = v => v * SUBC;   // celda de diseño → celda fina
const AIR_Y = 6;
const SIM_VERSION = '0.9.4';
let LOCAL = 0;   // jugador de este cliente (0 o 1)
const hyp = (x,y) => Math.sqrt(x*x + y*y);   // sqrt es exacta en IEEE 754; Math.hypot puede variar entre navegadores
let hooks = { income(){}, upgraded(){}, spawn(){}, death(){}, remove(){}, shot(){}, built(){}, power(){}, impact(){}, captured(){}, rankUp(){}, crate(){}, tunnel(){}, superFire(){}, heroDown(){}, mission(){} };

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

const UNIT_TYPES = {
  recolector: { nombre:'Recolector', hp:240, speed:3.6, armor:'veh', weapon:null, sight:8, cost:300, time:6, size:0.95, carry:100 },
  constructor:{ nombre:'Constructor', hp:260, speed:3.4, armor:'veh', weapon:null, sight:9, cost:500, time:8, size:1.0 },
  infanteria: { nombre:'Infantería', hp:110, speed:3.0, armor:'inf', weapon:'rifle', range:7, dmg:11, cd:1.0, sight:11, cost:150, time:4, size:0.55, capture:true },
  tanque:     { nombre:'Tanque', hp:420, speed:3.8, armor:'veh', weapon:'canon', range:9, dmg:46, cd:2.2, sight:12, cost:700, time:9, size:1.15 },
  antiaereo:  { nombre:'Antiaéreo', hp:300, speed:4.0, armor:'veh', weapon:'aa', range:12, dmg:34, cd:0.7, sight:13, cost:600, time:7, size:1.0 },
  pesado:     { nombre:'Tanque pesado', hp:820, speed:2.8, armor:'veh', weapon:'canon', range:9, dmg:72, cd:2.6, sight:11, cost:1100, time:13, size:1.4 },
  avion:      { nombre:'Avión de ataque', hp:260, speed:10, armor:'air', weapon:'misil', range:6, dmg:120, cd:0.6, sight:12, cost:900, time:12, size:1.2, air:true, ammo:2 },
  helicoptero:{ nombre:'Helicóptero', hp:380, speed:6.5, armor:'air', weapon:'cohete', range:8, dmg:24, cd:1.1, sight:12, cost:950, time:12, size:1.2, air:true, hover:true },
  ingeniero:  { nombre:'Ingeniero', hp:90, speed:3.2, armor:'inf', weapon:null, sight:9, cost:400, time:7, size:0.55, engineer:true },
  tecnico:    { nombre:'Técnico', hp:260, speed:5.4, armor:'veh', weapon:'rifle', range:8, dmg:16, cd:0.6, sight:12, cost:450, time:6, size:1.0 },
  lancha:     { nombre:'Lancha patrullera', hp:300, speed:6.0, armor:'nav', weapon:'ametralla', range:8, dmg:16, cd:0.6, sight:12, cost:500, time:7, size:1.2, naval:true },
  fragata:    { nombre:'Fragata', hp:750, speed:3.4, armor:'nav', weapon:'canonaval', range:15, minRange:4, dmg:70, cd:3.0, sight:11, cost:1400, time:16, size:1.6, naval:true, splash:2.5 },
  antitanque: { nombre:'Infantería antitanque', hp:100, speed:2.8, armor:'inf', weapon:'antitanque', range:8, dmg:90, cd:2.4, sight:10, cost:300, time:6, size:0.55 },
  heroe:      { nombre:'Héroe', hp:900, speed:3.6, armor:'inf', weapon:'heroe', range:10, dmg:40, cd:1.0, sight:14, cost:1500, time:20, size:0.7, hero:true, minRank:4, regen:0.01 },
  artilleria: { nombre:'Artillería ligera', hp:220, speed:2.8, armor:'veh', weapon:'obus', range:17, minRange:5, dmg:55, cd:4, sight:10, cost:800, time:11, size:1.15, splash:3 }
};
const BUILD_TYPES = {
  centro:   { nombre:'Centro de mando', hp:2600, size:3, produce:['constructor'], power:5, cost:0, time:0, buildable:false, sight:10 },
  // Centro de recolección: produce los recolectores y recibe la carga. Al terminarse entrega un recolector gratis.
  // Edificio de ingresos: genera créditos cada 3 s; se habilita con el rango 2 de general. Con poca energía rinde la mitad.
  suministros:{ nombre:'Centro de suministros', hp:1000, size:2, produce:[], power:-2, cost:1400, time:20, buildable:true, sight:8, income:30, minRank:2 },
  // Centro de investigación: vende tecnologías globales (ver MEJORAS)
  investigacion:{ nombre:'Centro de investigación', hp:1200, size:2, produce:[], power:-3, cost:1000, time:16, buildable:true, sight:8 },
  // Defensas por facción. Búnker y trinchera disparan con la infantería que tienen dentro (garrison = plazas).
  bunker:   { nombre:'Minibúnker', hp:1100, size:1, produce:[], power:0, cost:450, time:9, buildable:true, sight:10, garrison:4, range:8, cd:0.8 },
  minigun:  { nombre:'Torreta minigun', hp:800, size:1, produce:[], power:-2, cost:550, time:10, buildable:true, sight:11, weapon:'minigun', range:9, dmg:8, cd:0.22 },
  bateria:  { nombre:'Batería de misiles enlazada', hp:850, size:1, produce:[], power:-3, cost:700, time:12, buildable:true, sight:12, weapon:'misilsam', range:12, dmg:38, cd:1.8, linkR:9 },
  trinchera:{ nombre:'Trinchera', hp:700, size:1, fw:3, fh:2, produce:[], power:0, cost:300, time:7, buildable:true, sight:9, garrison:3, range:8, cd:0.8, resist:0.55, stealthBld:true },
  recoleccion:{ nombre:'Centro de recolección', hp:1300, size:3, produce:['recolector'], power:-2, cost:800, time:14, buildable:true, sight:8, refinery:true },
  planta:   { nombre:'Planta de energía', hp:800, size:2, produce:[], power:10, cost:400, time:10, buildable:true, sight:7 },
  cuartel:  { nombre:'Cuartel', hp:1100, size:2, produce:['infanteria','antitanque','ingeniero','heroe'], power:-2, cost:500, time:12, buildable:true, sight:8 },
  fabrica:  { nombre:'Fábrica', hp:1500, size:3, produce:['tanque','antiaereo'], power:-4, cost:1200, time:20, buildable:true, sight:8 },
  torre:    { nombre:'Torre de defensa', hp:900, size:1, produce:[], power:-3, cost:600, time:12, buildable:true, sight:12, weapon:'torre', range:11, dmg:30, cd:1.4 },
  aerodromo:{ nombre:'Aeródromo', hp:1400, size:3, fw:12, fh:6, produce:['avion'], power:-4, cost:1000, time:18, buildable:true, sight:9 },
  pozo:     { nombre:'Pozo petrolero', hp:600, size:2, produce:[], power:0, cost:0, time:0, buildable:false, sight:5, income:20 },
  astillero:{ nombre:'Astillero', hp:1400, size:3, produce:['lancha','fragata'], power:-3, cost:900, time:18, buildable:true, sight:9, naval:true },
  tunel:    { nombre:'Red de túneles', hp:900, size:1, produce:[], power:0, cost:600, time:10, buildable:true, sight:9, weapon:'rifle', range:8, dmg:10, cd:0.8, tunnel:true },
  superarma:{ nombre:'Superarma', hp:2600, size:3, produce:[], power:-8, cost:4000, time:45, buildable:true, sight:10, superCd:300, minRank:3, superR:11, superDmg:1800, superKind:'particulas' }
};
const FACTIONS = {
  atlas: { nombre:'Coalición Atlas', lema:'Tecnología y aviación',
    rasgos:['Aeródromo y aviones de ataque','Recolector: helicóptero de carga (vuela sobre el terreno)','Plantas de energía de +12','Tanques más resistentes (480) y caros (800)','Poder exclusivo: ataque de precisión','Superarma: cañón de partículas'],
    builds:['planta','recoleccion','cuartel','fabrica','suministros','investigacion','torre','bateria','aerodromo','astillero','superarma'], powers:['radar','reparacion','tropas','precision'], horde:false,
    unitMods:{ recolector:{ nombre:'Helicóptero de carga', hp:200, speed:6.0, armor:'air', air:true, hover:true, carry:70, cost:400, time:7, size:1.1 },
      antitanque:{ nombre:'Granadero antitanque' }, tanque:{ cost:800, hp:480 }, heroe:{ nombre:'Comando Atlas', range:13, sight:16, rasgo:'Francotirador: alcance 13' }, fragata:{ nombre:'Fragata lanzamisiles', range:17 } },
    buildMods:{ recoleccion:{ nombre:'Plataforma de carga' }, investigacion:{ nombre:'Laboratorio de investigación' }, suministros:{ nombre:'Estación de lanzamiento aéreo' }, planta:{ power:12 }, superarma:{ nombre:'Cañón de partículas', superKind:'particulas' } } },
  hierro:{ nombre:'Frente Hierro', lema:'Masa y blindaje',
    rasgos:['Tanque pesado (820 de vida) y helicóptero de ataque','Recolector: camión minero (lento, mucha carga)','Horda: +25 % de daño con 4 aliados cerca','Infantería más barata (120)','Poder exclusivo: bombardeo de artillería','Superarma: silo nuclear'],
    builds:['planta','recoleccion','cuartel','fabrica','suministros','investigacion','torre','bunker','minigun','astillero','superarma'], powers:['radar','reparacion','tropas','artilleria'], horde:true,
    unitMods:{ recolector:{ nombre:'Camión minero', hp:380, speed:3.0, carry:140, cost:350, time:7, size:1.15 },
      antitanque:{ nombre:'Cazacarros' }, infanteria:{ cost:120 }, heroe:{ nombre:'Mariscal de Hierro', hp:1200, aura:true, rasgo:'Aura: +20 % de daño a aliados a 8 o menos' }, fragata:{ nombre:'Monitor fluvial', hp:950 } },
    buildMods:{ recoleccion:{ nombre:'Depósito minero' }, investigacion:{ nombre:'Instituto técnico' }, suministros:{ nombre:'Centro de ciberoperaciones' }, fabrica:{ produce:['tanque','pesado','antiaereo','helicoptero'] }, superarma:{ nombre:'Silo nuclear', superKind:'nuclear', superR:13, superDmg:2000 } } },
  guerrilla:{ nombre:'Red Guerrillera', lema:'Emboscada y movilidad', noPower:true, salvage:true,
    rasgos:['No necesita energía','Recolectores: trabajadores (baratos, poca carga)','Rebeldes camuflados mientras no disparan','Red de túneles: guarda y cura hasta 8 unidades','Recoge chatarra de vehículos destruidos','Técnico y artillería ligera','Poder exclusivo: sabotaje','Superarma: tormenta de cohetes'],
    builds:['recoleccion','cuartel','fabrica','suministros','investigacion','torre','trinchera','tunel','astillero','superarma'], powers:['radar','reparacion','tropas','sabotaje'], horde:false,
    unitMods:{ recolector:{ nombre:'Trabajador', hp:70, speed:3.2, armor:'inf', carry:40, cost:100, time:3, size:0.55 },
      antitanque:{ nombre:'Rebelde antitanque', stealth:true }, infanteria:{ nombre:'Rebelde', cost:110, hp:100, stealth:true }, heroe:{ nombre:'Jefe rebelde', stealth:true, capture:true, rasgo:'Camuflado y captura pozos' }, lancha:{ nombre:'Lancha rápida', cost:400, speed:7 } },
    buildMods:{ recoleccion:{ nombre:'Acopio de recursos', power:0 }, investigacion:{ nombre:'Taller clandestino', power:0 }, suministros:{ nombre:'Mercado negro', power:0 }, fabrica:{ produce:['tecnico','artilleria','antiaereo'] }, superarma:{ nombre:'Tormenta de cohetes', superKind:'cohetes', power:0 } } }
};
const DMG = {
  rifle:{ inf:1, veh:0.3, bld:0.25, air:0.15, nav:0.3 }, canon:{ inf:0.45, veh:1, bld:1, air:0, nav:0.9 },
  torre:{ inf:0.9, veh:0.8, bld:0.5, air:0.8, nav:0.8 }, aa:{ inf:0.3, veh:0.25, bld:0.1, air:1.8, nav:0.3 },   // antiaéreo: más efectivo contra aviones y helicópteros
  misil:{ inf:0.6, veh:1, bld:0.8, air:0, nav:1.1 }, obus:{ inf:1, veh:0.7, bld:1.2, air:0, nav:0.9 },
  cohete:{ inf:0.8, veh:1.1, bld:0.7, air:0, nav:1.0 }, heroe:{ inf:1.4, veh:0.8, bld:0.9, air:0.5, nav:0.5 },
  ametralla:{ inf:1, veh:0.5, bld:0.3, air:0.5, nav:0.8 }, canonaval:{ inf:0.7, veh:1, bld:1.2, air:0, nav:1 },
  antitanque:{ inf:0.2, veh:1.45, bld:0.8, air:0.5, nav:1.1 },   // lanzacohetes: fuerte contra blindados, débil contra infantería
  minigun:{ inf:1.35, veh:0.2, bld:0.15, air:0.35, nav:0.25 },    // torreta rotativa de Hierro
  misilsam:{ inf:0.25, veh:0.9, bld:0.4, air:2.0, nav:0.8 }       // batería enlazada de Atlas
};
// Mejoras de edificios y tecnologías (centro de investigación). Se compran una vez por jugador; el efecto es global.
// Tabla sin prototipo: una clave como 'constructor' no puede colarse como mejora válida.
const MEJORAS = Object.assign(Object.create(null), {
  reactor:      { nombre:'Reactor mejorado', edificio:'planta', cost:600, time:20, rango:1, fx:{ bpower:{ planta:0.5 } }, desc:'+50 % de energía por planta' },
  carga:        { nombre:'Carga reforzada', edificio:'recoleccion', cost:500, time:18, rango:1, fx:{ carry:0.25 }, desc:'+25 % de carga por viaje' },
  instruccion:  { nombre:'Instrucción avanzada', edificio:'cuartel', cost:700, time:22, rango:2, fx:{ hpArmor:{ inf:0.2 } }, desc:'+20 % de vida para la infantería' },
  montaje:      { nombre:'Línea de montaje', edificio:'fabrica', cost:900, time:25, rango:2, inv:true, fx:{ prod:0.2 }, desc:'+20 % de velocidad de producción' },
  fortificacion:{ nombre:'Fortificación', edificio:'centro', cost:800, time:25, rango:2, inv:true, fx:{ bhp:0.25 }, desc:'+25 % de vida para los edificios' },
  blindaje:     { nombre:'Blindaje compuesto', edificio:'investigacion', cost:1200, time:30, rango:2, fx:{ hpArmor:{ veh:0.15 } }, desc:'+15 % de vida para los vehículos' },
  optica:       { nombre:'Óptica avanzada', edificio:'investigacion', cost:1000, time:25, rango:2, fx:{ sight:2, range:1 }, desc:'+1 de alcance y +2 de visión' },
  municion:     { nombre:'Munición perforante', edificio:'investigacion', cost:1200, time:30, rango:3, fx:{ dmg:{ inf:0.1, veh:0.1, air:0.1, nav:0.1, bld:0.1 } }, desc:'+10 % de daño' },
  enlace:       { nombre:'Enlace de datos ampliado', edificio:'investigacion', faccion:'atlas', cost:1100, time:28, rango:3, fx:{ link:4 }, desc:'Baterías enlazadas a mayor distancia' },
  doblecanon:   { nombre:'Minigun de doble cañón', edificio:'investigacion', faccion:'hierro', cost:1100, time:28, rango:3, fx:{ bdmg:{ minigun:0.4 } }, desc:'+40 % de daño de las miniguns' },
  camuflaje:    { nombre:'Camuflaje de trincheras', edificio:'investigacion', faccion:'guerrilla', cost:900, time:25, rango:3, fx:{ resist:{ trinchera:-0.2 } }, desc:'Trincheras más resistentes' }
});
const hasBuilt = (p, type) => S.ents.some(e => !e.dead && e.kind==='bld' && e.owner===p && e.type===type && e.built);
// ¿Puede el jugador p comprar la mejora 'key' en el edificio b? (sin efectos: también lo consulta la interfaz)
function upgradeOk(p, b, key){
  const U = typeof key==='string' ? MEJORAS[key] : null, pl = S.players[p];
  return !!(U && b && !b.dead && b.kind==='bld' && b.owner===p && b.built && b.type===U.edificio && !b.upq && !pl.ups[key]
    && (!U.faccion || U.faccion===pl.faction) && pl.rank >= U.rango && (!U.inv || hasBuilt(p, 'investigacion')) && pl.credits >= U.cost);
}
function applyUpFx(p, fx){
  const tab = S.tab[p], m = S.players[p].mods;
  if(fx.prod) m.prod += fx.prod;
  if(fx.dmg) for(const k in fx.dmg) m.dmg[k] = (m.dmg[k]||0) + fx.dmg[k];
  if(fx.bpower) for(const k in fx.bpower) if(tab.b[k] && tab.b[k].power > 0) tab.b[k].power = Math.round(tab.b[k].power*(1+fx.bpower[k]));
  if(fx.carry) tab.u.recolector.carry = Math.round(tab.u.recolector.carry*(1+fx.carry));
  if(fx.hpArmor) for(const k in tab.u){ const u = tab.u[k], inc = fx.hpArmor[u.armor]; if(!inc) continue; u.hp = Math.round(u.hp*(1+inc));
    for(const e of S.ents) if(e.kind==='unit' && e.owner===p && e.type===k && !e.dead){ const nm = Math.round(e.maxhp*(1+inc)); e.hp = e.hp*nm/e.maxhp; e.maxhp = nm; } }
  if(fx.bhp){ for(const k in tab.b) tab.b[k].hp = Math.round(tab.b[k].hp*(1+fx.bhp));
    for(const e of S.ents) if(e.kind==='bld' && e.owner===p && !e.dead){ const nm = Math.round(e.maxhp*(1+fx.bhp)); e.hp = e.hp*nm/e.maxhp; e.maxhp = nm; } }
  if(fx.sight || fx.range) for(const k in tab.u){ const u = tab.u[k]; if(!u.weapon) continue; if(fx.sight) u.sight += fx.sight; if(fx.range) u.range += fx.range; }
  if(fx.link && tab.b.bateria) tab.b.bateria.linkR += fx.link;
  if(fx.bdmg) for(const k in fx.bdmg) if(tab.b[k]) tab.b[k].dmg = tab.b[k].dmg*(1+fx.bdmg[k]);
  if(fx.resist) for(const k in fx.resist) if(tab.b[k]) tab.b[k].resist += fx.resist[k];
}
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
  if(m.grid!==64 || typeof m.terrain!=='string' || m.terrain.length!==64*64 || /[^.rw]/.test(m.terrain)) return 'Terreno inválido';
  if(!Array.isArray(m.depots) || !Array.isArray(m.wells) || m.depots.length>24 || m.wells.length>16) return 'Recursos inválidos';
  const okCell = (x,z,n) => Number.isInteger(x) && Number.isInteger(z) && x>=0 && z>=0 && x+n<=64 && z+n<=64;
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
// Jugadores y equipos. Hoy hay 2 jugadores en equipos distintos; la simulación ya admite N (plan de 4 jugadores).
const isEnemy = (a, b) => a>=0 && b>=0 && a!==b && S.players[a].team!==S.players[b].team;
function enemyOf(p){
  if(S.players.length <= 2){ for(let q=0; q<S.players.length; q++) if(isEnemy(p,q)) return q; return -1; }
  const h = S.ents.find(e => !e.dead && e.owner===p && e.kind==='bld' && e.type==='centro') || S.ents.find(e => !e.dead && e.owner===p && e.kind==='bld');
  let best = -1, bd = Infinity;
  for(let q=0; q<S.players.length; q++){ if(!isEnemy(p,q)) continue; const c = S.ents.find(e => !e.dead && e.owner===q && e.kind==='bld' && e.type!=='pozo'); if(!c) continue;
    const d = h ? (c.x-h.x)*(c.x-h.x) + (c.z-h.z)*(c.z-h.z) : q; if(d < bd){ bd = d; best = q; } }
  if(best < 0) for(let q=0; q<S.players.length; q++) if(isEnemy(p,q)) return q;
  return best;
}
const allyOf = (a, b) => a>=0 && b>=0 && S.players[a].team===S.players[b].team;
const BT = (p,t) => p>=0 ? S.tab[p].b[t] : BUILD_TYPES[t];

function register(e){ S.ents.push(e); S.byId.set(e.id, e); hooks.spawn(e); }
function markArea(cx,cz,w,h,v){ for(let z=cz; z<cz+h; z++) for(let x=cx; x<cx+w; x++) if(inB(x,z)) S.blocked[idx(x,z)] = v; }
// Huella de un edificio en celdas finas: fw × fh (en unidades del mundo) si la define; si no, su tamaño de diseño × SUBC (cuadrada)
const footW = t => t.fw ? Math.round(t.fw/CELL) : t.size*SUBC, footH = t => t.fh ? Math.round(t.fh/CELL) : t.size*SUBC;

function addBuilding(type, owner, cx, cz, built=true){
  const t = BT(owner,type), w = footW(t), h = footH(t), n = Math.max(w, h);
  const e = { id:S.nextId++, kind:'bld', type, owner, cx, cz, n, w, h, x:(cx+w/2)*CELL, z:(cz+h/2)*CELL,
              hp:built ? t.hp : Math.max(1, Math.round(t.hp*0.1)), maxhp:t.hp, built, bprog:built?1:0,
              queue:[], prog:0, rally:null, radius:n*CELL/2, cd:0, target:null, seen:0 };
  e.px = e.x; e.pz = e.z; markArea(cx,cz,w,h,1); register(e); return e;
}
function addDepot(cx, cz, amount){
  const n = 2*SUBC;
  const e = { id:S.nextId++, kind:'depot', type:'deposito', owner:-1, cx, cz, n, w:n, h:n, x:(cx+n/2)*CELL, z:(cz+n/2)*CELL,
              amount, max:amount, radius:LC, hp:1, maxhp:1 };
  e.px = e.x; e.pz = e.z; markArea(cx,cz,n,n,1); register(e); return e;
}
function addUnit(type, owner, x, z){
  const t = UT(owner,type);
  const e = { id:S.nextId++, kind:'unit', type, owner, x, z, px:x, pz:z, hp:t.hp, maxhp:t.hp, radius:t.size, air:!!t.air,
              path:null, pi:0, order:null, target:null, mode:null, cd:0, repath:0, working:null,
              carry:0, hstate:null, htimer:0, depot:null, kills:0, vet:0, ammo:t.ammo||0, astate:null, reload:0, capT:0 };
  register(e); return e;
}
function kill(e){
  if(e.dead) return;
  if(e.kind==='bld'){ if(e.gar && e.gar.length) ejectGarrison(e); if(e.upq && e.owner>=0){ S.players[e.owner].ups[e.upq.key] = 0; e.upq = null; } }   // la mejora en curso se pierde
  e.dead = true; hooks.death(e);
}
function cleanup(){
  let any = false;
  for(const e of S.ents) if(e.dead || e.tunneled){
    any = true; S.byId.delete(e.id);
    if(e.dead && (e.kind==='bld' || e.kind==='depot')) markArea(e.cx,e.cz,e.w,e.h,0);
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
let gScore = new Float32Array(NCELLS), came = new Int32Array(NCELLS), openStamp = new Uint32Array(NCELLS), closedStamp = new Uint32Array(NCELLS);
function setGrid(lg){
  if(lg === LG && gScore.length === NCELLS) return;
  LG = lg; GRID = LG * SUBC; WORLD = LG * LC; NCELLS = GRID * GRID;
  gScore = new Float32Array(NCELLS); came = new Int32Array(NCELLS); openStamp = new Uint32Array(NCELLS); closedStamp = new Uint32Array(NCELLS); gen = 0;
}
let gen = 0; const heap = new Heap();
const DIRS = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
function octile(ax,az,bx,bz){ const dx=Math.abs(ax-bx), dz=Math.abs(az-bz); return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz); }
function losLine(ax,az,bx,bz){
  const d = hyp(bx-ax, bz-az), steps = Math.ceil(d/0.35);   // paso en unidades del mundo: ningún obstáculo mide menos de 1 unidad
  for(let k=0; k<=steps; k++){ const t = steps ? k/steps : 0; if(!isFree(toCell(ax+(bx-ax)*t), toCell(az+(bz-az)*t))) return false; }
  return true;
}
function los(ax,az,bx,bz){
  const d = hyp(bx-ax, bz-az); if(d < 1e-6) return isFree(toCell(ax),toCell(az));
  const ox = -(bz-az)/d*0.6, oz = (bx-ax)/d*0.6;
  return losLine(ax,az,bx,bz) && losLine(ax+ox,az+oz,bx+ox,bz+oz) && losLine(ax-ox,az-oz,bx-ox,bz-oz);
}
function nearestFree(cx,cz,maxR=12*SUBC){
  for(let r=0; r<=maxR; r++){ let best=null, bd=1e9;
    // Solo el borde del anillo, en el mismo orden que el recorrido completo (filas de arriba abajo, columnas de izquierda a derecha)
    for(let dz=-r; dz<=r; dz++){ const borde = dz===-r || dz===r, paso = borde || r===0 ? 1 : 2*r;
      for(let dx=-r; dx<=r; dx+=paso){
        if(isFree(cx+dx,cz+dz)){ const d=dx*dx+dz*dz; if(d<bd){ bd=d; best=[cx+dx,cz+dz]; } } } }
    if(best) return best; }
  return null;
}
function goalCells(gx,gz,count){
  const cx=toCell(gx), cz=toCell(gz), res=[];
  for(let r=0; r<=16 && res.length<count; r++){ const ring=[];
    for(let dz=-r; dz<=r; dz++) for(let dx=-r; dx<=r; dx++){
      if(Math.max(Math.abs(dx),Math.abs(dz)) !== r) continue;
      const x = cx+dx*SUBC, z = cz+dz*SUBC;
      if(isFree(x,z)) ring.push({ x, z, d:dx*dx+dz*dz }); }
    ring.sort((a,b)=>a.d-b.d || a.x-b.x || a.z-b.z); res.push(...ring); }
  return res.slice(0,count).map(c => ({ x:cellCenter(c.x), z:cellCenter(c.z) }));
}
function adjacentTarget(e, from){
  let best=null, bd=1e9;
  for(let z=e.cz-1; z<=e.cz+e.h; z++) for(let x=e.cx-1; x<=e.cx+e.w; x++){
    if(x>=e.cx && x<e.cx+e.w && z>=e.cz && z<e.cz+e.h) continue;
    if(!isFree(x,z)) continue;
    const px=cellCenter(x), pz=cellCenter(z), ddx=px-from.x, ddz=pz-from.z, d=ddx*ddx+ddz*ddz;
    if(d<bd){ bd=d; best={ x:px, z:pz }; } }
  if(!best){ const f=nearestFree(e.cx,e.cz,8*SUBC); best = f ? { x:cellCenter(f[0]), z:cellCenter(f[1]) } : { x:e.x, z:e.z }; }
  return best;
}
function findPath(sx,sz,gx,gz){
  let scx=toCell(sx), scz=toCell(sz), gcx=toCell(gx), gcz=toCell(gz), exact=true;
  if(!isFree(gcx,gcz)){ const f=nearestFree(gcx,gcz,12*SUBC); if(!f) return null; gcx=f[0]; gcz=f[1]; exact=false; }
  if(!isFree(scx,scz)){ const f=nearestFree(scx,scz,6*SUBC); if(f){ scx=f[0]; scz=f[1]; } }
  const goal = exact ? { x:gx, z:gz } : { x:cellCenter(gcx), z:cellCenter(gcz) };
  if((scx===gcx && scz===gcz) || los(sx,sz,goal.x,goal.z)) return [goal];
  gen++; heap.clear();
  const s=idx(scx,scz), g=idx(gcx,gcz);
  openStamp[s]=gen; gScore[s]=0; came[s]=-1; heap.push(s, octile(scx,scz,gcx,gcz));
  let best=s, bestH=Infinity, iter=0, found=false;
  while(heap.size && iter<Math.max(24000, NCELLS*0.4)){
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
  // Un punto por unidad del mundo (cada SUBC/2 celdas) y el último: el suavizado cuesta lo mismo que con celdas de 1 unidad
  const paso = Math.max(1, SUBC/2), pts = cells.filter((c, k) => k % paso === 0 || k === cells.length-1).map(c => ({ x:cellCenter(c%GRID), z:cellCenter((c/GRID)|0) }));
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
  for(let p=0; p<S.players.length; p++){
    const vis=S.vis[p], exp=S.exp[p]; vis.fill(0);
    for(const e of S.ents){
      if(e.dead || e.owner!==p || e.kind==='depot') continue;
      markCircle(vis, exp, e.x, e.z, e.kind==='unit' ? UT(p,e.type).sight : BT(p,e.type).sight);
    }
    for(const r of S.reveals) if(r.p===p) markCircle(vis, exp, r.x, r.z, r.r);
  }
  // Aliados: comparten lo que ven y lo explorado (con equipos de un solo jugador no cambia nada)
  for(let p=0; p<S.players.length; p++) for(let q=p+1; q<S.players.length; q++){
    if(S.players[p].team !== S.players[q].team) continue;
    const a = S.vis[p], b = S.vis[q], ea = S.exp[p], eb = S.exp[q];
    for(let i=0; i<NCELLS; i++){ const v = a[i] | b[i], x = ea[i] | eb[i]; a[i] = b[i] = v; ea[i] = eb[i] = x; }
  }
  for(let p=0; p<S.players.length; p++){
    const vis=S.vis[p];
    for(const e of S.ents){
      if(e.dead || e.kind!=='bld' || e.owner===p || (e.seen & (1<<p))) continue;
      if(stealthed(e) && !detectedBy(e, p)) continue;                     // trinchera sin descubrir
      outer: for(let z=e.cz; z<e.cz+e.h; z++) for(let x=e.cx; x<e.cx+e.w; x++) if(vis[idx(x,z)]){ e.seen |= (1<<p); break outer; }
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
  const bt = BT(p,type), w=footW(bt), h=footH(bt), exp=S.exp[p]; margin *= SUBC;   // el margen se da en celdas de diseño
  if(bt.naval){
    let water = 0;
    for(let z=cz-1; z<=cz+h; z++) for(let x=cx-1; x<=cx+w; x++){
      const inside = x>=cx && x<cx+w && z>=cz && z<cz+h;
      if(inside){ if(!isFree(x,z) || !exp[idx(x,z)]) return false; }
      else if(inB(x,z) && S.water[idx(x,z)]) water++;
    }
    return water >= 3*SUBC;
  }
  for(let z=cz-margin; z<cz+h+margin; z++) for(let x=cx-margin; x<cx+w+margin; x++){
    const inside = x>=cx && x<cx+w && z>=cz && z<cz+h;
    if(inside){ if(!isFree(x,z) || !exp[idx(x,z)]) return false; }
    else if(inB(x,z) && S.blocked[idx(x,z)]) return false;
  }
  return true;
}
function rectDist(a, b){ const hw=(b.w||b.n)*CELL/2, hh=(b.h||b.n)*CELL/2; return hyp(Math.max(0, Math.abs(a.x-b.x)-hw), Math.max(0, Math.abs(a.z-b.z)-hh)); }
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
  if(rectDist(u,b) <= LC*1.05){
    u.path=null; u.working=b.id;
    if(!b.built){
      const inc = DT/BT(b.owner,b.type).time * (1 + S.players[b.owner].mods.build);
      b.bprog = Math.min(1, b.bprog+inc); b.hp = Math.min(b.maxhp, b.hp + b.maxhp*0.9*inc);
      if(b.bprog>=1){ b.built=true; const bb=BT(b.owner,b.type); if(bb.superCd) b.readyAt = S.tick + bb.superCd*TICK_HZ;
        if(bb.refinery){ const c = adjacentTarget(b, { x:WORLD/2, z:WORLD/2 }); if(c) addUnit('recolector', b.owner, c.x, c.z); }
        hooks.built(b); }
    } else b.hp = Math.min(b.maxhp, b.hp + b.maxhp*0.04*DT);
    return;
  }
  if(!u.path){ const p=adjacentTarget(b,u); u.path=findPath(u.x,u.z,p.x,p.z); u.pi=0; if(!u.path){ u.order=null; return; } }
  if(stepMove(u,t.speed) && rectDist(u,b) > LC*1.05) u.path=null;
}

// ---------- Combate ----------
function distTo(a,b){ return b.kind==='unit' ? hyp(a.x-b.x, a.z-b.z) : rectDist(a,b); }
function armorOf(e){ return e.kind==='bld' ? 'bld' : UT(e.owner,e.type).armor; }
const canHit = (weapon, e) => DMG[weapon][armorOf(e)] > 0;
// Camuflaje: unidades con 'stealth' quedan ocultas si no dispararon en 3 s y no están capturando
function stealthed(e){
  if(e.kind==='bld') return e.owner>=0 && !!BT(e.owner,e.type).stealthBld && S.tick - (e.lastFire===undefined ? -1e9 : e.lastFire) > 3*TICK_HZ;
  if(e.kind!=='unit' || !UT(e.owner,e.type).stealth) return false;
  if(e.order && e.order.type==='capture' && e.capT>0) return false;
  return S.tick - (e.lastFire===undefined ? -1e9 : e.lastFire) > 3*TICK_HZ;
}
// Detecta: cualquier unidad a 4 o menos, o una defensa a 8 o menos
function detectedBy(e, p, peek){
  if(!peek){ if(!e.det) e.det = { t:[], v:[] }; if(e.det.t[p]===S.tick) return e.det.v[p]; }
  let v = false;
  for(const o of S.ents){
    if(o.dead || o.owner!==p) continue;
    if(o.kind==='unit'){ if(hyp(o.x-e.x, o.z-e.z) <= 4){ v = true; break; } }
    else if(o.kind==='bld' && o.built && BT(p,o.type).weapon && rectDist(e,o) <= 8){ v = true; break; }
  }
  if(!peek){ e.det.t[p] = S.tick; e.det.v[p] = v; }
  return v;
}
const targetable = (p, e) => !stealthed(e) || detectedBy(e, p);
function findTarget(u, radius, weapon){
  const ut = u.kind==='unit' ? UT(u.owner,u.type) : null, minR = ut && ut.minRange ? ut.minRange : 0, vis = S.vis[u.owner];
  let best=null, bs=1e9;
  for(const e of S.ents){
    if(e.dead || !isEnemy(u.owner, e.owner) || e.kind==='depot' || e.kind==='crate' || !canHit(weapon,e)) continue;
    const d=distTo(u,e); if(d>radius || d<minR) continue;
    if(minR && !vis[cellOf(e)]) continue;                 // la artillería necesita visión aliada del objetivo
    if(!targetable(u.owner, e)) continue;
    const s=d + (e.kind==='bld'?(e.type==='torre'||e.type==='tunel'||(e.owner>=0 && (BT(e.owner,e.type).weapon||BT(e.owner,e.type).garrison))?2:6):0) + (e.kind==='unit' && !UT(e.owner,e.type).weapon ? 2 : 0);
    if(s<bs){ bs=s; best=e; } }
  return best;
}
function curTarget(u){
  const t = u.order && (u.order.type==='attack' || u.order.type==='capture') ? S.byId.get(u.order.id) || null : u.target!=null ? (S.byId.get(u.target) || null) : null;
  return t && t.owner>=0 && !isEnemy(u.owner, t.owner) ? null : t;   // un objetivo que pasó a ser aliado (captura) deja de serlo
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
  const res = tg.kind==='bld' ? (BT(tg.owner, tg.type).resist || 1) : 1;
  tg.hp -= base * DMG[weapon][armorOf(tg)] * mult * res;
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
    if(e===tg || e.dead || !isEnemy(u.owner, e.owner) || e.air || e.kind==='depot' || e.kind==='crate') continue;
    if(distTo(tg, e) > t.splash) continue;
    e.hp -= t.dmg * 0.5 * DMG[t.weapon][armorOf(e)] * mult;
    if(e.hp<=0) onDestroyed(e, u.owner);
  }
}
function capturable(u, b){
  if(!b || b.dead || b.kind!=='bld' || b.owner===u.owner || (b.owner>=0 && !isEnemy(u.owner, b.owner))) return false;   // no se capturan edificios aliados
  const ut = UT(u.owner,u.type);
  if(b.type==='pozo') return !!(ut.capture || ut.engineer);
  return !!ut.engineer && b.owner>=0 && b.type!=='centro' && b.built;
}
const captureTime = (u, b) => b.type==='pozo' ? (UT(u.owner,u.type).engineer ? 2 : 4) : 6;
function transferBuilding(b, p){
  const was = b.owner;
  ejectGarrison(b); if(b.upq && was>=0){ S.players[was].ups[b.upq.key] = 0; b.upq = null; }
  b.owner = p; b.target = null; b.queue = []; b.prog = 0; b.rally = null; b.seen = 0;
  if(b.type==='pozo') b.hp = b.maxhp;
  hooks.captured(b, was);
}
function captureTick(u, t){
  const b = S.byId.get(u.order.id);
  if(!capturable(u,b)){ u.order=null; u.path=null; u.capT=0; return; }
  if(rectDist(u,b) <= LC*1.05){
    u.path=null; u.capT += DT;
    if(u.capT >= captureTime(u,b)){ transferBuilding(b, u.owner); u.capT=0; u.order=null; }
    return;
  }
  u.capT = 0;
  if(!u.path){ const p=adjacentTarget(b,u); u.path=findPath(u.x,u.z,p.x,p.z); u.pi=0; if(!u.path){ u.order=null; return; } }
  if(stepMove(u,t.speed) && rectDist(u,b) > LC*1.05) u.path=null;
}
function engineerTick(u, t){
  const o = u.order; if(!o) return;
  if(o.type==='capture'){ captureTick(u,t); return; }
  if(o.type==='move'){ if(!u.path){ u.path=findPath(u.x,u.z,o.x,o.z); u.pi=0; } if(!u.path || stepMove(u,t.speed)) u.order=null; }
}
// Túneles: la unidad camina hasta el túnel y sale del mapa; queda en la red del jugador
function enterTick(u, t){
  const b = S.byId.get(u.order.id), pl = S.players[u.owner];
  const cap = b ? (b.type==='tunel' ? 8 - pl.tunnel.length : (BT(b.owner,b.type).garrison||0) - (b.gar ? b.gar.length : 0)) : 0;
  if(!b || b.dead || b.owner!==u.owner || !b.built || cap <= 0){ u.order=null; u.path=null; return; }
  if(rectDist(u,b) <= LC*1.05){
    u.order=null; u.path=null; u.target=null; u.mode=null; u.tunneled=true;
    if(b.type==='tunel') pl.tunnel.push(u); else (b.gar = b.gar || []).push(u);
    hooks.tunnel(u, b, 'in'); return;
  }
  if(!u.path){ const p=adjacentTarget(b,u); u.path=findPath(u.x,u.z,p.x,p.z); u.pi=0; if(!u.path){ u.order=null; return; } }
  if(stepMove(u,t.speed) && rectDist(u,b) > LC*1.05) u.path=null;
}
// Desaloja la guarnición de un búnker o trinchera (también al destruirse o cambiar de dueño)
function ejectGarrison(b){
  if(!b.gar || !b.gar.length) return;
  const list = b.gar; b.gar = [];
  const cells = goalCells(b.x, b.z, list.length);
  list.forEach((u,i) => { const g = cells[i] || { x:b.x, z:b.z+LC }; u.tunneled = false; u.x = u.px = g.x; u.z = u.pz = g.z; u.order = null; u.path = null; u.target = null; u.mode = null; u.lastD = undefined; u.stuck = 0; register(u); });
  hooks.tunnel(null, b, 'out');
}
function exitTunnel(p, b){
  const pl = S.players[p]; if(!pl.tunnel.length) return;
  const list = pl.tunnel; pl.tunnel = [];
  const cells = goalCells(b.x, b.z, list.length);
  list.forEach((u,i) => {
    const g = cells[i] || { x:b.x, z:b.z+LC };
    u.tunneled = false; u.x = u.px = g.x; u.z = u.pz = g.z;
    u.order = null; u.path = null; u.target = null; u.mode = null; u.lastD = undefined; u.stuck = 0;
    register(u);
  });
  hooks.tunnel(null, b, 'out');
}
// Hangares: cada aeródromo admite 4 aviones; el avión ocioso aterriza en su puesto de la pista
const HANGARES = 4;
const esAvion = (p, type) => { const t = UT(p, type); return !!(t && t.air && !t.hover && t.ammo); };
function cupoAviones(p){ let n = 0; for(const e of S.ents) if(!e.dead && e.kind==='bld' && e.owner===p && e.type==='aerodromo' && e.built) n++; return n*HANGARES; }
function avionesDe(p){ let n = 0; for(const e of S.ents){ if(e.dead || e.owner!==p) continue; if(e.kind==='unit' && esAvion(p, e.type)) n++; else if(e.kind==='bld') n += e.queue.filter(q => esAvion(p, q)).length; } return n; }
// Puesto de estacionamiento: aeródromo más cercano con lugar y el orden del avión entre los asignados a él
function puestoAvion(u){
  let base = u.base!=null ? S.byId.get(u.base) : null;
  if(!base || base.dead || base.owner!==u.owner || !base.built){ base = null; u.base = null; }
  if(!base){ let bd = 1e9;
    for(const e of S.ents){ if(e.kind!=='bld' || e.dead || !e.built || e.owner!==u.owner || e.type!=='aerodromo') continue;
      let usados = 0; for(const o of S.ents) if(!o.dead && o.kind==='unit' && o.base===e.id) usados++;
      if(usados >= HANGARES) continue; const d = hyp(e.x-u.x, e.z-u.z); if(d < bd){ bd = d; base = e; } }
    if(!base) return null; u.base = base.id; }
  let k = 0; for(const o of S.ents) if(!o.dead && o.kind==='unit' && o.base===base.id && o.id < u.id) k++;
  const w = (base.w||base.n)*CELL;
  return { x: base.x - w*0.375 + k*w*0.25, z: base.z + (base.h||base.n)*CELL*0.18, base };
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
  if(u.parked && (u.order || u.astate!=='rtb' && u.target!=null)) u.parked = false;   // despega al recibir una orden
  if(u.astate==='rtb'){
    const home = puestoAvion(u) || nearestAirfield(u);
    if(!home){ if(u.ammo<=0){ if(u.order && u.order.type!=='move') u.order=null; u.astate=null; } else u.astate=null; }
    else {
      if(flyTo(u, home.x, home.z, t.speed)){ u.parked = true;
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
  if(u.order && (u.order.type==='move' || u.order.type==='amove')){ u.parked = false; if(flyTo(u, u.order.x, u.order.z, t.speed)) u.order=null; return; }
  if(!u.order && u.ammo < t.ammo && nearestAirfield(u)) u.astate='rtb';
  else if(!u.order && !tg){ const pt = puestoAvion(u); if(pt){ if(flyTo(u, pt.x, pt.z, t.speed)) u.parked = true; } }   // aterriza en su hangar
}
function unitTick(u){
  if(UT(u.owner,u.type).naval){ naval(() => unitTickInner(u)); return; }
  unitTickInner(u);
}
function unitTickInner(u){
  const t = UT(u.owner,u.type);
  if(u.cd>0) u.cd -= DT;
  if(t.regen && u.hp < u.maxhp) u.hp = Math.min(u.maxhp, u.hp + u.maxhp*t.regen*DT);
  if(t.air && t.weapon){ airTick(u,t); return; }   // el helicóptero de carga (sin arma) usa la lógica de recolección
  if(u.order && u.order.type==='enter'){ enterTick(u,t); return; }
  if(!t.weapon){ if(u.type==='recolector') harvestTick(u,t); else if(t.engineer) engineerTick(u,t); else builderTick(u,t); return; }
  if(u.order && u.order.type==='capture'){ captureTick(u,t); return; }
  const reach = Math.max(t.sight, t.range);
  let tg = null;
  if(u.order && u.order.type==='attack'){
    tg = S.byId.get(u.order.id);
    if(!tg || tg.dead || tg.owner<0 || !isEnemy(u.owner, tg.owner) || !canHit(t.weapon,tg) || !targetable(u.owner,tg)){ u.order=null; tg=null; u.path=null; u.mode=null; }
  }
  if(!tg && (!u.order || u.order.type==='amove')){
    let cur = u.target!=null ? S.byId.get(u.target) : null;
    if(cur && (cur.dead || cur.owner<0 || !isEnemy(u.owner, cur.owner) || distTo(u,cur)>reach+3 || !targetable(u.owner,cur) || (t.minRange && distTo(u,cur)<t.minRange))) cur = null;
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
// Recolección. Los recolectores terrestres siguen rutas; el helicóptero de carga (Atlas) vuela en línea recta.
function harvestTick(u, t){
  if(u.order && u.order.type==='move'){
    if(u.air){ if(flyTo(u, u.order.x, u.order.z, t.speed)){ u.order=null; u.hstate='hold'; } return; }
    if(!u.path){ u.path=findPath(u.x,u.z,u.order.x,u.order.z); u.pi=0; }
    if(!u.path || stepMove(u,t.speed)){ u.order=null; u.hstate='hold'; }
    return;
  }
  if(!u.hstate) u.hstate = 'toDepot';
  switch(u.hstate){
    case 'toDepot': {
      let d = u.depot!=null ? S.byId.get(u.depot) : null;
      if(!d || d.dead || d.amount<=0){ d=nearestDepot(u); u.depot=d?d.id:null; u.path=null; if(!d){ u.hstate='idle'; return; } }
      if(hyp(d.x-u.x,d.z-u.z) <= LC*2.4){ u.path=null; u.hstate='loading'; u.htimer=Math.round(2.5*TICK_HZ); break; }
      if(u.air){ flyTo(u, d.x, d.z, t.speed); break; }
      if(!u.path){ const p=adjacentTarget(d,u); u.path=findPath(u.x,u.z,p.x,p.z); u.pi=0; if(!u.path){ u.hstate='idle'; return; } }
      if(stepMove(u,t.speed) && hyp(d.x-u.x,d.z-u.z) > LC*2.7) u.hstate='idle';
      break; }
    case 'loading': {
      const d = S.byId.get(u.depot);
      if(!d || d.dead){ u.hstate='toDepot'; break; }
      if(--u.htimer<=0){ const take=Math.min(t.carry, d.amount); d.amount-=take; u.carry+=take; if(d.amount<=0) kill(d); u.hstate='toBase'; u.path=null; }
      break; }
    case 'toBase': {
      const b = nearestOwn(u,'recoleccion'); if(!b){ u.hstate='idle'; return; }
      if(hyp(b.x-u.x,b.z-u.z) <= b.radius+LC*1.6){ S.players[u.owner].credits += Math.round(u.carry*incomeMult(u.owner)); u.carry=0; u.hstate='toDepot'; u.path=null; break; }
      if(u.air){ flyTo(u, b.x, b.z, t.speed); break; }
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
  if(b.upq){ const U = MEJORAS[b.upq.key]; b.upq.prog += DT * (low ? 0.5 : 1);
    if(b.upq.prog >= U.time){ const pl = S.players[b.owner]; pl.ups[b.upq.key] = 2; applyUpFx(b.owner, U.fx); hooks.upgraded(b, b.upq.key); b.upq = null; } }
  if(bt.garrison){   // búnker y trinchera: cada ocupante aporta su daño; los antitanque usan su arma contra blindados
    if(b.cd > 0) b.cd -= DT;
    if(!b.gar || !b.gar.length){ b.target = null; return; }
    let tg = b.target!=null ? S.byId.get(b.target) : null;
    if(!tg || tg.dead || tg.owner<0 || !isEnemy(b.owner, tg.owner) || distTo(b,tg) > bt.range || !targetable(b.owner, tg)){ tg = (S.tick+b.id)%3===0 ? findTarget(b, bt.range, 'rifle') : null; b.target = tg ? tg.id : null; }
    if(tg && b.cd <= 0){ b.cd = bt.cd; b.lastFire = S.tick; let rf = 0, at = 0;
      for(const u of b.gar){ const t = UT(u.owner, u.type); if(t.weapon==='antitanque') at += t.dmg; else if(t.weapon) rf += t.dmg; }
      const mult = 1 + (S.players[b.owner].mods.dmg.inf||0);
      if(rf) damage(b, tg, rf, 'rifle', mult);
      if(at && !tg.dead && armorOf(tg)!=='inf') damage(b, tg, at, 'antitanque', mult); }
    return;
  }
  if(bt.superCd){ if(low) b.readyAt++; return; }                                   // sin energía no carga
  if(bt.income){ if((S.tick+b.id) % (3*TICK_HZ) === 0){ const g = Math.round(bt.income*incomeMult(b.owner)*(low && bt.power < 0 ? 0.5 : 1)); S.players[b.owner].credits += g; if(b.type!=='pozo') hooks.income(b, g); } return; }
  if(bt.weapon){
    if(b.cd>0) b.cd -= DT;
    if(low){ b.target=null; return; }
    let tg = b.target!=null ? S.byId.get(b.target) : null;
    if(!tg || tg.dead || tg.owner<0 || !isEnemy(b.owner, tg.owner) || distTo(b,tg)>bt.range){ tg = (S.tick+b.id)%3===0 ? findTarget(b, bt.range, bt.weapon) : null; b.target = tg ? tg.id : null; }
    let mult = 1 + (S.players[b.owner].mods.dmg.bld||0);
    if(bt.linkR){   // enlace de datos: baterías cercanas comparten objetivo y suman 15 % de daño cada una (máximo 3)
      let n = 0;
      for(const o of S.ents){ if(o===b || o.dead || o.kind!=='bld' || o.owner!==b.owner || o.type!==b.type || !o.built || o.offUntil > S.tick || distTo(b,o) > bt.linkR) continue; n++;
        if(!tg && o.target!=null){ const ot = S.byId.get(o.target); if(ot && !ot.dead && distTo(b,ot) <= bt.range && canHit(bt.weapon, ot) && targetable(b.owner, ot)){ tg = ot; b.target = ot.id; } } }
      mult *= 1 + 0.15*Math.min(3, n);
    }
    if(tg && b.cd<=0){ b.cd = bt.cd; b.lastFire = S.tick; damage(b, tg, bt.dmg, bt.weapon, mult); }
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
      for(const e of S.ents){ if(e.dead || e.kind!=='bld' || !isEnemy(c.p, e.owner) || e.type==='pozo') continue; if(rectDist({x,z},e) <= P.r) e.offUntil = S.tick + 25*TICK_HZ; }
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
  if(!c || typeof c.t!=='string' || !(Number.isInteger(c.p) && c.p>=0 && c.p<S.players.length) || (c.ids!==undefined && (!Array.isArray(c.ids) || c.ids.length>200))) return;
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
      const b = own(c.target); if(!b || !b.built) break;
      const gar = BT(c.p, b.type).garrison;
      if(b.type!=='tunel' && !gar) break;
      c.ids.map(own).filter(e => e && e.kind==='unit' && !e.air && !UT(e.owner,e.type).naval && (b.type==='tunel' || UT(e.owner,e.type).armor==='inf')).forEach(u => { u.order={ type:'enter', id:b.id }; u.path=null; u.target=null; u.mode=null; });
      break; }
    case 'exit': { const b = own(c.id); if(b && b.built){ if(b.type==='tunel') exitTunnel(c.p, b); else ejectGarrison(b); } break; }
    case 'rendir': {
      for(const e of S.ents){ if(e.dead || e.owner!==c.p) continue; if(e.type==='pozo'){ const was = e.owner; e.owner = -1; e.target = null; hooks.captured(e, was); continue; } kill(e); }
      pl.tunnel = []; break; }
    case 'upgrade': {
      const b = own(c.id); if(!upgradeOk(c.p, b, c.type)) break;
      pl.credits -= MEJORAS[c.type].cost; pl.ups[c.type] = 1; b.upq = { key:c.type, prog:0 };
      break; }
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
      if(esAvion(c.p, c.type) && avionesDe(c.p) >= cupoAviones(c.p)) break;   // hangares llenos
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
      if(bt.max && S.ents.filter(e => !e.dead && e.owner===c.p && e.type===c.type).length >= bt.max) break;
      const builders = c.ids.map(own).filter(e => e && e.type==='constructor'); if(!builders.length) break;
      if(pl.credits < bt.cost || !canPlace(c.p, c.type, c.cx, c.cz, 0)) break;
      pl.credits -= bt.cost;
      const b = addBuilding(c.type, c.p, c.cx, c.cz, false);
      for(const u of S.ents){
        if(u.kind!=='unit' || u.dead || u.air) continue;
        const ux=toCell(u.x), uz=toCell(u.z);
        if(ux>=c.cx && ux<c.cx+footW(bt) && uz>=c.cz && uz<c.cz+footH(bt)){ const f=nearestFree(ux,uz,6*SUBC); if(f){ u.x=u.px=cellCenter(f[0]); u.z=u.pz=cellCenter(f[1]); u.path=null; } }
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
  const bt=BT(p,type), c0=toCell(x)-Math.floor(footW(bt)/2), c1=toCell(z)-Math.floor(footH(bt)/2);
  for(let r=0; r<=20; r++) for(let dz=-r; dz<=r; dz++) for(let dx=-r; dx<=r; dx++){
    if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
    if(canPlace(p, type, c0+dx, c1+dz, 1)) return [c0+dx, c1+dz];
  }
  return null;
}
function aiPowers(p, home, threat){
  const me = S.players[p], F = FACTIONS[me.faction], foe = enemyOf(p);
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
// Lista de celdas de agua en orden de índice (fila por fila), calculada una vez por partida: el agua no cambia
const AGUA = new WeakMap();
function celdasAgua(){ let l = AGUA.get(S.water); if(!l){ l = []; for(let i=0; i<NCELLS; i++) if(S.water[i]) l.push(i); AGUA.set(S.water, l); } return l; }
function coastNear(home, p){
  const cx = toCell(home.x), cz = toCell(home.z); let best = null, bd = 1e9, count = 0;
  const R = 30*SUBC, x0 = Math.max(0, cx-R), x1 = Math.min(GRID-1, cx+R), z0 = Math.max(0, cz-R), z1 = Math.min(GRID-1, cz+R);
  for(const i of celdasAgua()){
    const z = Math.floor(i/GRID), x = i - z*GRID; if(z < z0 || z > z1 || x < x0 || x > x1) continue; count++;
    const d = (x-cx)*(x-cx) + (z-cz)*(z-cz); if(d < bd){ bd = d; best = { x:cellCenter(x), z:cellCenter(z), explored: p===undefined ? true : !!S.exp[p][i] }; }
  }
  return count >= 25*SUBC*SUBC ? best : null;
}
function aiTick(p){
  const ai = S.ai[p]; if(S.tick < ai.next) return; ai.next = S.tick + Math.round(TICK_HZ*2*S.thinkMult[p]);
  const foe = enemyOf(p), me = S.players[p], pw = S.power[p], F = FACTIONS[me.faction]; let cst = null;
  const mine = S.ents.filter(e => !e.dead && e.owner===p);
  const blds = mine.filter(e => e.kind==='bld' && e.type!=='pozo'); if(!blds.length) return;
  const units = mine.filter(e => e.kind==='unit');
  const collectors = units.filter(u => u.type==='recolector');
  const builders = units.filter(u => u.type==='constructor');
  const army = units.filter(u => UT(p,u.type).weapon && (!u.air || UT(p,u.type).hover));
  const air = units.filter(u => u.air && !UT(p,u.type).hover);
  const helis = units.filter(u => u.air && UT(p,u.type).hover && UT(p,u.type).weapon);
  const engineers = units.filter(u => u.type==='ingeniero');
  const find = t => blds.find(b => b.type===t);
  const findBuilt = t => blds.find(b => b.type===t && b.built);
  const centro=findBuilt('centro'), acopio=findBuilt('recoleccion'), cuartel=findBuilt('cuartel'), fabrica=findBuilt('fabrica'), aerodromo=findBuilt('aerodromo');
  const home = find('centro') || blds[0];
  const dl = hyp(WORLD/2-home.x, WORLD/2-home.z) || 1, dx = (WORLD/2-home.x)/dl, dz = (WORLD/2-home.z)/dl;
  let threat = null, td = 24;
  for(const e of S.ents){ if(e.dead || e.kind!=='unit' || e.owner!==foe) continue; const d=hyp(e.x-home.x, e.z-home.z); if(d<td){ td=d; threat=e; } }

  // Construcción
  if(centro && !builders.length && !centro.queue.includes('constructor') && me.credits>=500) applyCmd({ t:'build', p, id:centro.id, type:'constructor' });
  const b0 = builders.find(u => !u.order);
  let reserve = 0;
  if(b0){
    const unfinished = blds.find(b => !b.built), defs = blds.filter(b => ['torre','bateria','minigun','bunker','trinchera'].includes(b.type)).length;
    let want = null;
    if(unfinished) applyCmd({ t:'repair', p, ids:[b0.id], target:unfinished.id });
    else if(!F.noPower && pw.prod-pw.cons < 4) want = ['planta', home.x-dx*7, home.z-dz*7];
    else if(!find('recoleccion')) want = ['recoleccion', home.x+dx*7+dz*3, home.z+dz*7-dx*3];
    else if(!find('cuartel')) want = ['cuartel', home.x+dz*8, home.z-dx*8];
    else if(!find('fabrica')) want = ['fabrica', home.x-dz*8, home.z+dx*8];
    else if(!find('astillero') && celdasAgua().length > 75*SUBC*SUBC && S.tick>TICK_HZ*60 && (cst = coastNear(home, p)) && cst.explored){ const w = cst; want = ['astillero', w.x, w.z]; }
    else if(F.builds.includes('aerodromo') && !find('aerodromo') && S.tick>TICK_HZ*120) want = ['aerodromo', home.x-dx*4-dz*10, home.z-dz*4+dx*10];
    else if(!find('astillero') && S.tick>TICK_HZ*100 && (cst = coastNear(home, p)) && cst.explored){ const w = cst; want = ['astillero', w.x, w.z]; }
    else if(F.builds.includes('superarma') && !find('superarma') && me.rank>=3 && S.tick>TICK_HZ*300) want = ['superarma', home.x-dx*5+dz*7, home.z-dz*5-dx*7];
    else if(F.builds.includes('tunel') && blds.filter(b => b.type==='tunel').length<2 && S.tick>TICK_HZ*90){ const k = blds.filter(b => b.type==='tunel').length; want = ['tunel', home.x+dx*(9+k*8)-dz*4, home.z+dz*(9+k*8)+dx*4]; }
    else if(F.builds.includes('suministros') && me.rank>=2 && blds.filter(b => b.type==='suministros').length < Math.min(4, me.rank) && me.credits>900) want = ['suministros', home.x-dz*9+dx*3, home.z+dx*9+dz*3];
    else if(me.rank>=2 && F.builds.includes('investigacion') && !find('investigacion') && S.tick>TICK_HZ*150 && me.credits>600) want = ['investigacion', home.x+dz*4-dx*9, home.z-dx*4-dz*9];
    else if(S.tick>TICK_HZ*80 && defs<4){ const tipos = ['torre', ...['bateria','minigun','bunker','trinchera'].filter(t => F.builds.includes(t))], d=11+defs*2, side=(defs-1)*5;
      want = [tipos[defs % tipos.length], home.x+dx*d+dz*side, home.z+dz*d-dx*side]; }
    if(want){
      const cost = BT(p,want[0]).cost;
      if(me.credits>=cost){ const sp=findSpot(p,want[0],want[1],want[2]); if(sp) applyCmd({ t:'place', p, ids:[b0.id], type:want[0], cx:sp[0], cz:sp[1] }); }
      else reserve = cost;
    } else if(!unfinished){ const dmg = blds.find(b => b.hp < b.maxhp*0.7); if(dmg) applyCmd({ t:'repair', p, ids:[b0.id], target:dmg.id }); }
  }

  // Producción (respeta el ahorro para construir)
  const foeAir = S.ents.some(e => e.owner===foe && e.air && !e.dead);
  const aa = army.filter(u => u.type==='antiaereo').length;
  // Recolectores deseados según la carga: 3 vehículos o 6 trabajadores (guerrilla)
  const RC = UT(p,'recolector'), wantRec = RC.carry < 60 ? 6 : 3;
  if(acopio && collectors.length + acopio.queue.filter(q=>q==='recolector').length < wantRec && me.credits>=RC.cost) applyCmd({ t:'build', p, id:acopio.id, type:'recolector' });
  else {
    const r = S.rng();
    const wantAir = aerodromo && air.length + aerodromo.queue.length < 2;
    const airReserve = wantAir ? UT(p,'avion').cost : 0;   // ahorra para aviones
    const can = (b, type, extra=airReserve) => b && b.queue.length<2 && me.credits >= UT(p,type).cost + reserve + extra;
    const foeVeh = S.ents.filter(e => !e.dead && e.kind==='unit' && isEnemy(p, e.owner) && UT(e.owner,e.type).armor==='veh').length;
    // Mejoras: cada 15 s compra la primera disponible de la lista si sobra dinero
    if((S.tick + p*97) % (15*TICK_HZ) < TICK_HZ/2){
      for(const key of ['reactor','carga','instruccion','blindaje','montaje','optica','municion','enlace','doblecanon','camuflaje','fortificacion']){
        const U = MEJORAS[key], b = blds.find(x => x.type===U.edificio && x.built && !x.upq);
        if(b && upgradeOk(p, b, key) && me.credits >= U.cost + 600){ applyCmd({ t:'upgrade', p, id:b.id, type:key }); break; }
      }
      // Guarnición: la infantería ociosa ocupa búnkeres y trincheras con plazas libres
      for(const b of blds){ const gar = BT(p, b.type).garrison; if(!gar || !b.built || (b.gar ? b.gar.length : 0) >= gar) continue;
        const inf = units.filter(u => UT(p,u.type).armor==='inf' && UT(p,u.type).weapon && !u.order && !UT(p,u.type).hero && hyp(u.x-b.x, u.z-b.z) < 22).slice(0, gar - (b.gar ? b.gar.length : 0));
        if(inf.length){ applyCmd({ t:'enter', p, ids:inf.map(u => u.id), target:b.id }); break; } }
    }
    if(foeAir && aa<3 && can(fabrica,'antiaereo',0)) applyCmd({ t:'build', p, id:fabrica.id, type:'antiaereo' });
    else if(wantAir && can(aerodromo,'avion',0)) applyCmd({ t:'build', p, id:aerodromo.id, type:'avion' });
    else if(findBuilt('astillero') && r>0.5 && units.filter(u => UT(p,u.type).naval).length < 4){ const ast = findBuilt('astillero'), type = S.rng()<0.6 ? 'lancha' : 'fragata'; if(can(ast,type,0)) applyCmd({ t:'build', p, id:ast.id, type }); }
    else if(fabrica && BT(p,'fabrica').produce.includes('helicoptero') && helis.length<2 && r>0.85 && can(fabrica,'helicoptero')) applyCmd({ t:'build', p, id:fabrica.id, type:'helicoptero' });
    else if(cuartel && engineers.length + cuartel.queue.filter(q=>q==='ingeniero').length < 1 && S.tick>TICK_HZ*150 && r>0.7 && can(cuartel,'ingeniero')) applyCmd({ t:'build', p, id:cuartel.id, type:'ingeniero' });
    else if(fabrica && r<0.5){ const list = BT(p,'fabrica').produce.filter(x => x!=='antiaereo' && x!=='helicoptero'); const type = list[Math.floor(S.rng()*list.length)]; if(can(fabrica,type)) applyCmd({ t:'build', p, id:fabrica.id, type }); }
    else if(cuartel && cuartel.queue.length<3 && foeVeh>3 && S.rng()<0.45 && can(cuartel,'antitanque')) applyCmd({ t:'build', p, id:cuartel.id, type:'antitanque' });
    else if(cuartel && cuartel.queue.length<3 && me.credits>=UT(p,'infanteria').cost+reserve+airReserve) applyCmd({ t:'build', p, id:cuartel.id, type:'infanteria' });
  }

  // Captura de pozos
  if(!units.some(u => u.order && u.order.type==='capture')){
    const inf = army.find(u => u.type==='infanteria' && !u.order);
    if(inf){
      let well=null, wd=1e9;
      for(const e of S.ents){ if(e.dead || e.type!=='pozo' || e.owner===p || (e.owner>=0 && !isEnemy(p, e.owner))) continue; const d=hyp(e.x-home.x,e.z-home.z); if(d<wd){ wd=d; well=e; } }
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

  // Flota: va aparte de las tropas, porque el punto de concentración está en tierra. Con 3 o más barcos ociosos
  // (o ante una amenaza) navega hasta el agua frente al objetivo enemigo más cercano que tenga costa a tiro.
  { const ociosos = army.filter(u => !u.order && UT(p,u.type).naval);
    if(ociosos.length >= 3 || (threat && ociosos.length)){
      const cx = ociosos.reduce((a,u)=>a+u.x,0)/ociosos.length, cz = ociosos.reduce((a,u)=>a+u.z,0)/ociosos.length;
      // agua a 12 o menos de un punto, revisada por celdas de diseño (rápido y determinista)
      const aguaCerca = (x, z) => { let mejor = null, md = 1e9; const c0 = toCell(x), c1 = toCell(z), R = 6*SUBC;
        for(let dz=-R; dz<=R; dz+=SUBC) for(let dx=-R; dx<=R; dx+=SUBC){ const gx = c0+dx, gz = c1+dz; if(!inB(gx,gz) || !S.water[idx(gx,gz)]) continue; const d = dx*dx + dz*dz; if(d < md){ md = d; mejor = { x:cellCenter(gx), z:cellCenter(gz) }; } }
        return mejor; };
      let dest = null, bd = 1e9;
      for(const e of S.ents){
        if(e.dead || e.owner<0 || !isEnemy(p, e.owner) || e.kind==='depot' || e.kind==='crate' || e.air) continue;
        if(e.kind==='unit' && !UT(e.owner,e.type).naval) continue;
        const d = hyp(e.x-cx, e.z-cz) - (e.kind==='unit' ? 8 : 0); if(d >= bd) continue;
        const w = e.kind==='unit' ? { x:e.x, z:e.z } : aguaCerca(e.x, e.z); if(!w) continue;
        bd = d; dest = w;
      }
      if(dest) applyCmd({ t:'amove', p, ids:ociosos.map(u=>u.id), x:dest.x, z:dest.z });
    } }
  const idle = army.filter(u => !u.order && !UT(p,u.type).naval);
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
    case 'llegar': { const tx = o.x*LC + LC/2, tz = o.z*LC + LC/2, r = (o.r||3)*LC; return S.ents.some(e => !e.dead && e.kind==='unit' && e.owner===0 && hyp(e.x-tx, e.z-tz) <= r) ? 'ok' : 'pend'; }
    case 'hundir': return S.players[0].navKills >= o.cantidad ? 'ok' : 'pend';
  }
  return 'pend';
}
function runTrigger(tr){
  const M = S.mission;
  switch(tr.accion){
    case 'refuerzos': {
      const p = tr.jugador || 0, base = tr.cerca==='enemigo' ? nearBase(enemyOf(p)) : nearBase(p);
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
  const alive = []; for(let p=0; p<S.players.length; p++) if(has(p) && !alive.includes(S.players[p].team)) alive.push(S.players[p].team);
  const a = has(0);
  if(alive.length <= 1){
    S.over=true; S.winner = alive.length ? alive[0] : -1;   // equipo ganador (con equipos por defecto, el número de jugador)
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
  S.power = S.players.map((_, p) => powerOf(p));
  S.heroes = [null, null];
  for(const e of S.ents) if(e.kind==='unit' && !e.dead && UT(e.owner,e.type).hero) S.heroes[e.owner] = e.id;
  for(const p of S.aiPlayers) aiTick(p);
  for(const e of S.ents){ e.px=e.x; e.pz=e.z; }
  for(let i=0; i<S.ents.length; i++){ const e=S.ents[i]; if(e.dead) continue; if(e.kind==='unit') unitTick(e); else if(e.kind==='bld') bldTick(e); }
  processEvents();
  for(let i=0; i<S.ents.length; i++){ const c=S.ents[i]; if(c.kind==='crate' && !c.dead) crateTick(c); }
  for(let p=0; p<S.players.length; p++){
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
      if(BT(p,type).naval){ const w = coastNear(base); if(w){ const cx = toCell(w.x), cz = toCell(w.z); for(let z=cz-8*SUBC; z<=cz+8*SUBC; z++) for(let x=cx-8*SUBC; x<=cx+8*SUBC; x++) if(inB(x,z)) S.exp[p][idx(x,z)] = 1; sp = findSpot(p, type, w.x, w.z); } }
      else { const side = (k - ((n||1)-1)/2)*7; sp = findSpot(p, type, base.x+dx/d*12 + dz/d*side, base.z+dz/d*12 - dx/d*side); }
      if(sp) addBuilding(type, p, sp[0], sp[1], true);
    }
  }
  if(def.unidades) runTrigger({ accion:'refuerzos', jugador:0, unidades:def.unidades });
  if(def.unidadesEnemigas) runTrigger({ accion:'refuerzos', jugador:1, unidades:def.unidadesEnemigas });
}
const ladoMapa = n => n <= 2 ? 64 : n <= 4 ? 96 : 128;
// Rotación exacta para la simetría de N bases (solo raíces cuadradas: determinista entre motores)
const ROT = { 2:[-1, 0], 3:[-0.5, Math.sqrt(3)/2], 4:[0, 1], 6:[0.5, Math.sqrt(3)/2], 8:[Math.SQRT1_2, Math.SQRT1_2] };
function newGame(seed, aiPlayers=[1], factions=['atlas','hierro'], map=null, mission=null, aiLevel='normal', creditos=3000, equipos=null){
  const NJ = factions.length; if(NJ > 2 && !ROT[NJ]) throw new Error('Número de jugadores no admitido: ' + NJ);
  setGrid(ladoMapa(NJ)); if(NJ > 2){ map = null; mission = null; }
  // Recursos iniciales de escaramuza y partidas en línea (500 a 20.000). Las misiones parten de 2.000 y los ajustan con def.creditos.
  const ini = mission ? 2000 : Math.max(500, Math.min(20000, Math.floor(+creditos || 3000)));
  // Equipo de cada jugador: por defecto uno por jugador (todos contra todos). Se valida: enteros de 0 a 7.
  const eq = i => Array.isArray(equipos) && Number.isInteger(equipos[i]) && equipos[i] >= 0 && equipos[i] < 8 ? equipos[i] : i;
  const player = (f, i) => ({ team:eq(i), ups:{}, credits:ini, kills:0, faction:f, xp:0, rank:1, cp:1, unlocked:{}, cool:{}, tunnel:[], navKills:0, mods:{ dmg:{}, prod:0, build:0, income:0 } });
  Object.assign(S, { tick:0, seed, rng:mulberry32(seed), nextId:1, ents:[], byId:new Map(), blocked:new Uint8Array(NCELLS),
    rocks:[], ruins:[], rockGrid:new Uint8Array(NCELLS), players:factions.map(player), cmdQueue:[], over:false, winner:-1, aiPlayers,
    vis:factions.map(() => new Uint8Array(NCELLS)), exp:factions.map(() => new Uint8Array(NCELLS)),
    power:factions.map(() => ({prod:0,cons:0,low:false})), events:[], reveals:[], log:[], heroes:factions.map(() => null), water:new Uint8Array(NCELLS), bonus:factions.map(() => 1), thinkMult:factions.map(() => 1), mission:null, map:map ? String(map.nombre||'Mapa personalizado').slice(0,40) : 'Estándar',
    tab:factions.map(f => buildTables(f)),
    ai:Object.fromEntries(factions.map((f, p) => [p, {next:TICK_HZ*10,wave:6,lastAttack:0,goal:3000,attack:null,rallied:false}])) });
  const mirL = (x,z,n) => [LG-x-n, LG-z-n];   // espejo central en celdas de diseño
  // Bloquea una celda de diseño completa (SUBC × SUBC celdas finas): roca o agua
  const tapar = (x, z, agua, s=0.7+S.rng()*0.6, r=S.rng()*6.28) => { const fx = L2F(x), fz = L2F(z);
    for(let dz=0; dz<SUBC; dz++) for(let dx=0; dx<SUBC; dx++){ const k = idx(fx+dx, fz+dz); S.blocked[k] = 1; if(agua) S.water[k] = 1; else S.rockGrid[k] = 1; }
    if(!agua) S.rocks.push({ cx:fx, cz:fz, s, r }); };
  const ruina = (x, z, w, h, t, r) => { for(let dz=0; dz<h*SUBC; dz++) for(let dx=0; dx<w*SUBC; dx++) S.blocked[idx(L2F(x)+dx, L2F(z)+dz)] = 1; S.ruins.push({ cx:L2F(x), cz:L2F(z), w:w*SUBC, h:h*SUBC, t, r }); };
  const libreL = (x, z) => { for(let dz=0; dz<SUBC; dz++) for(let dx=0; dx<SUBC; dx++) if(S.blocked[idx(L2F(x)+dx, L2F(z)+dz)]) return false; return true; };
  // La guerrilla no usa energía: inicia con una red de túneles en lugar de la planta
  const startType = (t, p) => t==='planta' && FACTIONS[factions[p]].noPower ? 'tunel' : t;
  // Escaramuza y en línea: solo el centro de mando y un constructor; el resto se construye.
  // Las misiones conservan la base completa con la que fueron diseñadas.
  const BASE = [['centro',5,54],['cuartel',11,58],['fabrica',5,47],['planta',1,55],['recoleccion',10,49]];
  S.baseZones = BASE_ZONES; S.lg = LG;
  if(NJ > 2){ mapaGrande(NJ, startType); finInicio(mission, aiPlayers, aiLevel); return; }
  (mission ? BASE : BASE.slice(0,1)).forEach(([t,x,z]) => {
    addBuilding(startType(t,0),0,L2F(x),L2F(z)); const m=mirL(x,z,BUILD_TYPES[t].size); addBuilding(startType(t,1),1,L2F(m[0]),L2F(m[1])); });
  // Zona de base reservada (sin rocas) aunque los edificios aún no existan
  const baseZones = [];
  for(const [t,x,z] of BASE){ const n = BUILD_TYPES[t].size, m = mirL(x,z,n); baseZones.push({ x:x+n/2, z:z+n/2, r:7 }, { x:m[0]+n/2, z:m[1]+n/2, r:7 }); }   // en celdas de diseño
  if(map){
    // Mapa del editor: terreno, depósitos y pozos. Las zonas de base se respetan siempre.
    for(let z=0; z<LG; z++) for(let x=0; x<LG; x++){
      const ch = map.terrain[z*LG+x];
      if(ch==='.' || inBaseZone(x,z) || !libreL(x,z)) continue;
      tapar(x, z, ch==='w');
    }
    const fits = (x,z) => [0,1].every(dz => [0,1].every(dx => libreL(x+dx,z+dz) && !inBaseZone(x+dx,z+dz)));
    for(const [x,z,a] of map.depots) if(fits(x,z)) addDepot(L2F(x),L2F(z),a);
    for(const [x,z] of map.wells) if(fits(x,z)) addBuilding('pozo',-1,L2F(x),L2F(z));
  } else {
    [[12,50,2500],[2,40,2500],[21,44,3500]].forEach(([x,z,a]) => { addDepot(L2F(x),L2F(z),a); const m=mirL(x,z,2); addDepot(L2F(m[0]),L2F(m[1]),a); });
    addDepot(L2F(31),L2F(31),6000);
    [[14,30],[34,50]].forEach(([x,z]) => { addBuilding('pozo',-1,L2F(x),L2F(z)); const m=mirL(x,z,2); addBuilding('pozo',-1,L2F(m[0]),L2F(m[1])); });
    // Rocas en celdas de diseño (zonas libres alrededor de bases y recursos)
    const zones = S.ents.map(e => ({ x:(e.cx+e.w/2)/SUBC, z:(e.cz+e.h/2)/SUBC, r:e.kind==='bld' && e.type!=='pozo' ? 7 : 4 })).concat(baseZones);
    const okRock = (x,z) => x>0 && z>0 && x<LG-1 && z<LG-1 && libreL(x,z) && zones.every(q => hyp(x+0.5-q.x, z+0.5-q.z) > q.r);
    for(let k=0; k<52; k++){
      const cx=1+Math.floor(S.rng()*(LG-2)), cz=1+Math.floor(S.rng()*(LG-2)), sz=1+Math.floor(S.rng()*3);
      for(let dz=0; dz<sz; dz++) for(let dx=0; dx<sz; dx++){
        if(S.rng()<0.25) continue;
        const x=cx+dx, z=cz+dz, mx=LG-1-x, mz=LG-1-z;
        if(!okRock(x,z) || !okRock(mx,mz)) continue;
        const s=0.7+S.rng()*0.6, r=S.rng()*6.28;
        tapar(x, z, false, s, r);
        if(mx!==x || mz!==z) tapar(mx, mz, false, s, r+1);
      }
    }
    // Edificaciones abandonadas: casa en ruinas, gasolinera, tanque de agua caído y camión quemado con barricada
    for(let k=0, puestas=0; k<40 && puestas<4; k++){
      const t = puestas, w = t===1 ? 3 : 2, h = 2, x = 3 + Math.floor(S.rng()*(LG-8)), z = 3 + Math.floor(S.rng()*(LG-8)), mx = LG-x-w, mz = LG-z-h;
      let ok = true; for(let dz=-1; dz<=h && ok; dz++) for(let dx=-1; dx<=w && ok; dx++) if(!okRock(x+dx, z+dz) || !okRock(mx+dx, mz+dz)) ok = false;
      if(!ok || Math.abs(x-mx) < w+2 && Math.abs(z-mz) < h+2) continue;
      ruina(x, z, w, h, t, 0); ruina(mx, mz, w, h, t, 2); puestas++;
    }
  }
  finInicio(mission, aiPlayers, aiLevel);
}
function finInicio(mission, aiPlayers, aiLevel){
  for(let p=0; p<S.players.length; p++){
    const c = S.ents.find(e => e.kind==='bld' && e.owner===p && e.type==='centro');
    const dx=WORLD/2-c.x, dz=WORLD/2-c.z, d=hyp(dx,dz);
    const cells = goalCells(c.x+dx/d*9, c.z+dz/d*9, 8);
    (mission ? ['recolector','recolector','constructor','infanteria','infanteria','infanteria','infanteria','tanque'] : ['constructor']).forEach((t,i) => addUnit(t,p,cells[i].x,cells[i].z));
  }
  if(mission) setupMission(mission);
  else { const lv = AI_LEVELS[aiLevel] || AI_LEVELS.normal; for(const p of aiPlayers){ S.bonus[p] = lv.bonus; S.thinkMult[p] = lv.think; } }
  S.power = S.players.map((_, p) => powerOf(p));
  updateVision();
}
// Mapa grande de N jugadores: bases en anillo, recursos propios por base, pozos entre vecinos, oasis central
// y rocas repetidas con la misma simetría rotacional (ninguna posición tiene ventaja).
function mapaGrande(N, startType){
  const C = LG/2, R = LG*0.39, [cr, sr] = ROT[N];
  const giro = (vx, vz, k) => { for(let i=0; i<k; i++){ const nx = vx*cr - vz*sr; vz = vx*sr + vz*cr; vx = nx; } return [vx, vz]; };
  const u0 = [-Math.SQRT1_2, Math.SQRT1_2];   // jugador 0 al suroeste, como en los mapas de 2
  const bases = [], zonas = [];
  const tapar = (x, z, agua) => { if(x<1 || z<1 || x>=LG-1 || z>=LG-1) return; const fx = L2F(x), fz = L2F(z);
    for(let dz=0; dz<SUBC; dz++) for(let dx=0; dx<SUBC; dx++) if(S.blocked[idx(fx+dx, fz+dz)]) return;
    for(let dz=0; dz<SUBC; dz++) for(let dx=0; dx<SUBC; dx++){ const k = idx(fx+dx, fz+dz); S.blocked[k] = 1; if(agua) S.water[k] = 1; else S.rockGrid[k] = 1; }
    if(!agua) S.rocks.push({ cx:fx, cz:fz, s:0.7+S.rng()*0.6, r:S.rng()*6.28 }); };
  // Bases y zonas reservadas
  for(let p=0; p<N; p++){
    const [ux, uz] = giro(u0[0], u0[1], p), bx = Math.round(C + ux*R), bz = Math.round(C + uz*R);
    bases.push({ x:bx, z:bz, ux, uz }); zonas.push({ x:bx, z:bz, r:9 });
    addBuilding(startType('centro', p), p, L2F(bx - 1), L2F(bz - 1));
  }
  S.baseZones = bases.map(b => [b.x-8, b.z-8, b.x+8, b.z+8]);
  // Oasis central (agua) y depósitos grandes a su alrededor
  const ro = Math.max(4, Math.round(LG*0.05));
  for(let z=-ro; z<=ro; z++) for(let x=-ro; x<=ro; x++) if(x*x + z*z <= ro*ro) tapar(Math.round(C) + x, Math.round(C) + z, true);
  for(let p=0; p<N; p++){ const b = bases[p], [vx, vz] = giro(b.ux, b.uz, 0), d = ro + 5; addDepot(L2F(Math.round(C + vx*d) - 1), L2F(Math.round(C + vz*d) - 1), 5000); zonas.push({ x:C + vx*d, z:C + vz*d, r:3 }); }
  // Recursos de cada base: tres depósitos (dos a los lados y uno hacia el centro) y un pozo entre cada par de vecinos
  for(let p=0; p<N; p++){
    const b = bases[p], fx = -b.ux, fz = -b.uz, sx = -fz, sz = fx;
    for(const [ox, oz, a] of [[sx*9 + fx*2, sz*9 + fz*2, 2500], [-sx*9 + fx*2, -sz*9 + fz*2, 2500], [fx*11, fz*11, 3500]]){
      const x = Math.round(b.x + ox) - 1, z = Math.round(b.z + oz) - 1; addDepot(L2F(x), L2F(z), a); zonas.push({ x:x+1, z:z+1, r:3 }); }
    const q = bases[(p+1) % N], mx = (b.x + q.x)/2, mz = (b.z + q.z)/2, k = 0.82, wx = Math.round(C + (mx - C)*k) - 1, wz = Math.round(C + (mz - C)*k) - 1;
    addBuilding('pozo', -1, L2F(wx), L2F(wz)); zonas.push({ x:wx+1, z:wz+1, r:3 });
  }
  // Rocas: cada grupo se repite en las N direcciones
  const libre = (x, z) => x>1 && z>1 && x<LG-2 && z<LG-2 && zonas.every(q => hyp(x+0.5-q.x, z+0.5-q.z) > q.r);
  for(let k=0; k<Math.round(10*LG/64); k++){
    const a = S.rng(), rad = LG*(0.12 + S.rng()*0.34), ang = S.rng(), sz = 1 + Math.floor(S.rng()*3);
    // punto base en el sector del jugador 0 (interpolación entre su dirección y la del vecino, sin trigonometría)
    const [vx1, vz1] = giro(u0[0], u0[1], 1), wx = u0[0]*(1-ang) + vx1*ang, wz = u0[1]*(1-ang) + vz1*ang, wl = Math.sqrt(wx*wx + wz*wz) || 1;
    const px = wx/wl*rad, pz = wz/wl*rad;
    for(let dz=0; dz<sz; dz++) for(let dx=0; dx<sz; dx++){ if(S.rng() < 0.25) continue;
      for(let p=0; p<N; p++){ const [rx, rz] = giro(px + dx, pz + dz, p), x = Math.round(C + rx), z = Math.round(C + rz); if(libre(x, z)) tapar(x, z, false); } }
    void a;
  }
  for(let k=0, puestas=0; k<60 && puestas<3; k++){
    const t = puestas % 4, w = t===1 ? 3 : 2, h = 2, rad = LG*(0.16 + S.rng()*0.22), ang = S.rng();
    const [vx1, vz1] = giro(u0[0], u0[1], 1), wx = u0[0]*(1-ang) + vx1*ang, wz = u0[1]*(1-ang) + vz1*ang, wl = Math.sqrt(wx*wx + wz*wz) || 1;
    const pos = []; let ok = true;
    for(let p=0; p<N && ok; p++){ const [rx, rz] = giro(wx/wl*rad, wz/wl*rad, p), x = Math.round(C + rx - w/2), z = Math.round(C + rz - h/2);
      for(let dz=-1; dz<=h && ok; dz++) for(let dx=-1; dx<=w && ok; dx++){ const xx = x+dx, zz = z+dz; if(!libre(xx, zz) || xx<1 || zz<1 || xx>=LG-1 || zz>=LG-1) ok = false; else for(let a=0; a<SUBC && ok; a++) for(let b=0; b<SUBC && ok; b++) if(S.blocked[idx(L2F(xx)+a, L2F(zz)+b)]) ok = false; }
      pos.push([x, z]); }
    if(!ok) continue;
    pos.forEach(([x, z], p) => { for(let dz=0; dz<h*SUBC; dz++) for(let dx=0; dx<w*SUBC; dx++) S.blocked[idx(L2F(x)+dx, L2F(z)+dz)] = 1; S.ruins.push({ cx:L2F(x), cz:L2F(z), w:w*SUBC, h:h*SUBC, t, r:p }); });
    puestas++;
  }
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
const MLG = 64;   // las plantillas de mapa se generan en celdas de diseño
function generateMap(tpl, seed){
  if(!tpl || tpl==='estandar') return null;
  const rnd = mulberry32(seed || 1), T = new Array((MLG*MLG)).fill('.');
  const set = (x,z,c) => { if(x<0||z<0||x>=MLG||z>=MLG) return; T[z*MLG+x] = c; T[(MLG-1-z)*MLG+(MLG-1-x)] = c; };
  const disc = (cx,cz,r,c) => { for(let z=-r; z<=r; z++) for(let x=-r; x<=r; x++) if(x*x+z*z <= r*r) set(cx+x,cz+z,c); };
  let nombre = 'Mapa', depots = [], wells = [];
  if(tpl==='rio'){
    nombre = 'Río de los vados';
    for(let x=0; x<MLG; x++){ const z = MLG-1-x + Math.round(Math.sin(x*0.3+seed)*1.5); for(const d of [-1,0,1]) set(x, z+d, 'w'); }
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
    for(let i=4; i<60; i++){ const a = i, b = MLG-1-i; for(const off of [-9, 9]){ const x = a + off, z = b; if(Math.abs(i-32)>3 && Math.abs(i-18)>2) { set(x, z, 'r'); set(x+1, z, 'r'); } } }
    for(let k=0; k<10; k++) disc(5+Math.floor(rnd()*24), 5+Math.floor(rnd()*24), 1, 'r');
    depots = [[12,50,2500],[2,40,2500],[21,44,3500],[26,26,4000]]; wells = [[14,30],[34,50]];
  }
  else if(tpl==='cruce'){
    nombre = 'Cruce de crestas';
    for(let i=0; i<MLG; i++){
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
    for(let z=0; z<MLG; z++) for(let x=0; x<MLG; x++){
      if(Math.abs(x-z) > 4) continue;
      const along = (x+z)/2;
      if(Math.abs(along-20) <= 3 || Math.abs(along-43) <= 3) continue;   // puentes
      T[z*MLG+x] = 'w';
    }
    for(let k=0; k<12; k++) disc(3+Math.floor(rnd()*22), 30+Math.floor(rnd()*28), 1, 'r');
    depots = [[12,50,2500],[2,40,2500],[21,44,3500],[24,36,3000]]; wells = [[14,30],[30,50]];
  }
  else if(tpl==='dosmares'){
    // Dos mares en las esquinas libres, unidos a bahías que llegan a los flancos de ambas bases: el agua es continua
    // dentro de cada mar, de modo que la flota de cada jugador alcanza la costa enemiga. La franja central es terrestre.
    nombre = 'Dos mares';
    for(let z=0; z<MLG; z++) for(let x=0; x<MLG; x++){ const borde = 33 + Math.round(Math.sin(x*0.35 + seed)*1.6 + Math.cos(z*0.3)*1.2); if(x + z <= borde) set(x, z, 'w'); }
    for(const [a, b] of [[[3,30],[9,38]], [[30,3],[38,9]]]) for(let t=0; t<=1.0001; t+=0.1) disc(Math.round(a[0] + (b[0]-a[0])*t), Math.round(a[1] + (b[1]-a[1])*t), 4, 'w');   // bahías hacia las bases
    for(let k=0; k<10; k++) disc(14 + Math.floor(rnd()*20), 30 + Math.floor(rnd()*14), 1, 'r');
    depots = [[12,50,2500],[2,40,2500],[22,44,3500],[28,30,4000]]; wells = [[14,38],[34,50],[40,26]];
  }
  else if(tpl==='estrecho'){
    // Brazo de mar ancho entre las bases, con vados solo en los extremos: la flota recorre todo el estrecho y
    // las tropas cruzan por los vados de las esquinas
    nombre = 'Estrecho';
    for(let z=0; z<MLG; z++) for(let x=0; x<MLG; x++){
      const ancho = 12 + Math.round(Math.sin((x + z)*0.18 + seed)*1.5), along = (x + z)/2;
      if(Math.abs(x - z) > ancho) continue;
      if(along <= 5 || along >= MLG - 6) continue;   // vados en los extremos
      T[z*MLG+x] = 'w';
    }
    for(let t=0; t<=1.0001; t+=0.1) disc(Math.round(26 - 7*t), Math.round(34 + 7*t), 3, 'w');   // ensenada hacia cada base (se refleja)
    for(let k=0; k<10; k++) disc(3 + Math.floor(rnd()*18), 36 + Math.floor(rnd()*22), 1, 'r');
    depots = [[12,50,2500],[2,40,2500],[24,48,3500],[4,22,3000]]; wells = [[28,52],[4,30]];
  }
  // las bases y los recursos quedan libres; se reflejan los recursos
  const md = [], mw = [];
  for(const [x,z,a] of depots){ md.push([x,z,a]); md.push([MLG-2-x, MLG-2-z, a]); }
  for(const [x,z] of wells){ mw.push([x,z]); mw.push([MLG-2-x, MLG-2-z]); }
  for(const [x,z] of md.concat(mw)) for(let dz=-1; dz<=2; dz++) for(let dx=-1; dx<=2; dx++){ const xx=x+dx, zz=z+dz; if(xx>=0&&zz>=0&&xx<MLG&&zz<MLG) T[zz*MLG+xx] = '.'; }
  for(let z=0; z<MLG; z++) for(let x=0; x<MLG; x++) if(inBaseZone(x,z)) T[z*MLG+x] = '.';
  return { formato:MAP_FORMAT, version:1, nombre, grid:MLG, terrain:T.join(''), depots:md, wells:mw };
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
// Equipos 3 a 8 (iguales en ambas paletas): verde azulado, amarillo, violeta, naranja, cian y rosa
const TEAM_EXTRA = [0x2aa58a, 0xe0c23a, 0x8a5ad0, 0xe07a2a, 0x3ac0d8, 0xd85a9a], TEAM_EXTRA_DARK = [0x1d7562, 0xa08a28, 0x623f96, 0xa0561d, 0x2a8a9a, 0x9a3f6d];
const PALETTES = { clasica:{ team:[0x2f6fd8, 0xc8452f], dark:[0x24529c, 0x8f3022], css:['#2f6fd8','#c8452f'] }, accesible:{ team:[0x0072b2, 0xe69f00], dark:[0x005282, 0xb07800], css:['#0072b2','#e69f00'] } };
const teamColor = o => o>=0 ? TEAM[o] : NEUTRAL;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });   // usa la GPU dedicada si existe
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2220);
scene.fog = new THREE.Fog(0x1d2220, 120, 250);
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
// Iluminación de desierto: cielo cálido, rebote de la arena y sol bajo que marca el relieve
const HEMI = new THREE.HemisphereLight(0xf6eedd, 0x7a6248, 0.6); scene.add(HEMI);
const sun = new THREE.DirectionalLight(0xffe6c0, 0.82);
sun.position.set(WORLD/2-60, 95, WORLD/2+35); sun.target.position.set(WORLD/2, 0, WORLD/2);
sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera, { left:-60, right:60, top:60, bottom:-60, near:10, far:280 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;      // sin acné ni sombras despegadas
scene.add(sun, sun.target);
// La cámara de sombras sigue a la cámara del jugador con un encuadre ajustado (sombras más nítidas).
// El centro se alinea a la rejilla de texeles para que las sombras no parpadeen al desplazarse.
function updateSun(cx, cz, dist){
  const r = Math.max(30, Math.round(dist*1.15/5)*5), sc = sun.shadow.camera;
  if(sc.right !== r){ sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.updateProjectionMatrix(); }
  const texel = 2*r/sun.shadow.mapSize.x, x = Math.round(cx/texel)*texel, z = Math.round(cz/texel)*texel;
  const o = AMBIENTE.sol; sun.target.position.set(x, 0, z); sun.position.set(x+o[0], o[1], z+o[2]);
}
// ======================= CICLO DE LUZ =======================
// Ambientes visuales (no afectan la simulación): cielo, sol, color de fondo y tono del posprocesado.
const AMBIENTES = {
  dia:       { cielo:0xf6eedd, suelo:0x7a6248, iCielo:0.6,  sol:[-60,95,35], cSol:0xffe6c0, iSol:0.82, fondo:0x1d2220, tono:[1.03,1.0,0.96] },
  atardecer: { cielo:0xffc89a, suelo:0x6a4636, iCielo:0.55, sol:[-95,42,30], cSol:0xff9a52, iSol:0.95, fondo:0x2a1d18, tono:[1.1,0.95,0.84] },
  noche:     { cielo:0x50608a, suelo:0x262830, iCielo:0.42, sol:[40,80,-60], cSol:0x9fb4e0, iSol:0.32, fondo:0x0b0f16, tono:[0.82,0.9,1.12], bengalas:true }
};
let AMBIENTE = AMBIENTES.dia, AMBIENTE_ID = 'dia';
function applyAmbiente(id){
  AMBIENTE_ID = AMBIENTES[id] ? id : 'dia'; AMBIENTE = AMBIENTES[AMBIENTE_ID];
  HEMI.color.setHex(AMBIENTE.cielo); HEMI.groundColor.setHex(AMBIENTE.suelo); HEMI.intensity = AMBIENTE.iCielo;
  sun.color.setHex(AMBIENTE.cSol); sun.intensity = AMBIENTE.iSol;
  scene.background.setHex(AMBIENTE.fondo); scene.fog.color.setHex(AMBIENTE.fondo);
  for(const f of FLARES){ f.life = 0; f.l.intensity = 0; f.obj.visible = false; }
  const v = VIDRIO[AMBIENTE_ID] || VIDRIO.dia; WIN_MAT[0].color.setHex(v[0]); WIN_MAT[1].color.setHex(v[1]);
}
// Bengalas nocturnas: descienden despacio cerca de la cámara, parpadean e iluminan el terreno
const FLARES = [0,1].map(() => {
  const l = new THREE.PointLight(0xffe2b0, 0, 42, 2); scene.add(l);
  const obj = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color:0xfff2c8 })); obj.visible = false; scene.add(obj);
  return { l, obj, life:0, next:2 + Math.random()*4, x:0, z:0 };
});
function updateFlares(dt){
  for(const f of FLARES){
    if(!AMBIENTE.bengalas){ f.l.intensity = 0; f.obj.visible = false; continue; }
    if(f.life <= 0){ f.next -= dt; if(f.next > 0) continue;
      f.life = 9; f.next = 5 + Math.random()*7; f.x = cam.x + (Math.random()-0.5)*40; f.z = cam.z - 6 + (Math.random()-0.5)*30; }
    f.life -= dt; const k = Math.max(0, f.life/9), y = 2 + 18*k;
    f.obj.visible = f.life > 0; f.obj.position.set(f.x + Math.sin(f.life*0.7)*1.5, y, f.z); f.l.position.copy(f.obj.position);
    f.l.intensity = f.life > 0 ? (1.6 + Math.sin(f.life*23)*0.25 + Math.sin(f.life*7)*0.2) * Math.min(1, k*4) : 0;
    if(f.life > 0 && OPTIONS.calidad!=='baja' && Math.random() < dt*6) puff(f.obj.position.x, y + 0.2, f.z, 0.35, 0xd8d2c8, 1.6, 0.2, 0.3);
  }
}
// Destellos de luz para explosiones y disparos: grupo fijo (cambiar la cantidad de luces recompila los shaders)
const FLASH_LIGHTS = [0,1,2,3].map(() => { const l = new THREE.PointLight(0xffa040, 0, 16, 2); scene.add(l); return { l, life:0, max:1, peak:0 }; });
function lightFlash(x, y, z, peak, color, life){
  let f = FLASH_LIGHTS[0]; for(const c of FLASH_LIGHTS) if(c.life < f.life) f = c;   // reutiliza la más apagada
  if(f.life > 0 && f.peak > peak) return;
  f.l.position.set(x, y, z); f.l.color.setHex(color); f.peak = peak; f.life = f.max = life;
}
function updateFlashLights(dt){ for(const f of FLASH_LIGHTS){ if(f.life > 0){ f.life -= dt; const k = Math.max(0, f.life/f.max); f.l.intensity = f.peak*k*k; } else f.l.intensity = 0; } }

// Niebla de guerra: textura 64×64 muestreada en el shader de cada material por posición de mundo
const MUNDO_U = { value:WORLD };   // tamaño del mundo para los sombreadores (cambia con el mapa)
// Niebla con un texel por unidad del mundo: basta para el sombreado y cuesta 4 veces menos que una por celda de 0,5
let FOGN = WORLD, fogData = new Uint8Array(FOGN*FOGN*4), fogCur = new Float32Array(FOGN*FOGN);
let fogTex = new THREE.DataTexture(fogData, FOGN, FOGN, THREE.RGBAFormat);
fogTex.magFilter = THREE.LinearFilter; fogTex.minFilter = THREE.LinearFilter; fogTex.needsUpdate = true;
const fogUniform = { value:fogTex };
function addFog(m){
  m.onBeforeCompile = sh => {
    sh.uniforms.uFogTex = fogUniform; sh.uniforms.uMundo = MUNDO_U;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogUv;\nuniform float uMundo;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 fogWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fogWp = instanceMatrix * fogWp;
        #endif
        fogWp = modelMatrix * fogWp;
        vFogUv = fogWp.xz / uMundo;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogUv;\nuniform sampler2D uFogTex;')
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb *= texture2D(uFogTex, vFogUv).r;\n#include <fog_fragment>');
  };
  return m;
}
function updateFog(dt, snap){
  const v=visGrid(), ex=expGrid(), k=snap ? 1 : Math.min(1, dt*6);
  const pasoF = GRID/FOGN;
  for(let i=0; i<FOGN*FOGN; i++){
    const fz = Math.floor(i/FOGN), j = idx(Math.floor((i - fz*FOGN)*pasoF + pasoF/2), Math.floor(fz*pasoF + pasoF/2)), t = v[j] ? 1 : ex[j] ? 0.5 : 0.1;
    fogCur[i] += (t-fogCur[i])*k;
    const b = Math.round(fogCur[i]*255); fogData[i*4]=b; fogData[i*4+1]=b; fogData[i*4+2]=b; fogData[i*4+3]=255;
  }
  fogTex.needsUpdate = true;
}

// Terreno
function buildGround(){
  if(scene.userData.ground){ scene.remove(scene.userData.ground); scene.userData.ground.geometry.dispose(); }
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, WORLD, WORLD);   // 1 vértice por unidad: dunas suaves
  geo.rotateX(-Math.PI/2); geo.translate(WORLD/2, 0, WORLD/2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count*3);
  const light = new THREE.Color(0xc6ae80), dark = new THREE.Color(0xa58c60), c = new THREE.Color();
  for(let i=0; i<pos.count; i++){
    const x=pos.getX(i), z=pos.getZ(i);
    const n = (Math.sin(x*0.09)+Math.sin(z*0.11+1.7)+Math.sin((x+z)*0.05+0.4)+Math.sin((x-z)*0.17)*0.5)/3.5*0.5+0.5;
    c.copy(dark).lerp(light, n); cols[i*3]=c.r; cols[i*3+1]=c.g; cols[i*3+2]=c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols,3)); geo.userData.baseCol = cols.slice();
  const m = new THREE.Mesh(geo, addFog(new THREE.MeshLambertMaterial({ vertexColors:true })));
  m.receiveShadow = true; scene.add(m); scene.userData.ground = m;   // la textura de arena se asigna al crear TEX
}
buildGround();

const matCache = new Map(), geoCache = new Map();

// ======================= TEXTURAS PROCEDURALES =======================
// Se dibujan en un canvas con semilla fija (sin archivos externos). Son casi blancas: multiplican el
// color de cada pieza y le agregan grano, desgaste, juntas de paneles y remaches.
function canvasTex(n, draw, seed){
  const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), rnd = mulberry32(seed);
  draw(x, n, rnd);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
  return t;
}
// Ruido de valor suavizado (para manchas y desgaste)
function noiseField(n, cells, rnd){
  const g = []; for(let i=0; i<(cells+1)*(cells+1); i++) g.push(rnd());
  for(let y=0; y<=cells; y++){ g[y*(cells+1)+cells] = g[y*(cells+1)]; } for(let x=0; x<=cells; x++){ g[cells*(cells+1)+x] = g[x]; }   // continuo al repetir
  return (px, py) => {
    const fx = px/n*cells, fy = py/n*cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx-x0, ty = fy-y0;
    const sx = tx*tx*(3-2*tx), sy = ty*ty*(3-2*ty), at = (a,b) => g[b*(cells+1)+a];
    const top = at(x0,y0)+(at(x0+1,y0)-at(x0,y0))*sx, bot = at(x0,y0+1)+(at(x0+1,y0+1)-at(x0,y0+1))*sx;
    return top + (bot-top)*sy;
  };
}
function grainPixels(x, n, rnd, lo, hi, blotch){
  const img = x.createImageData(n, n), d = img.data, f1 = noiseField(n, 8, rnd), f2 = noiseField(n, 32, rnd);
  for(let py=0; py<n; py++) for(let px=0; px<n; px++){
    const v = lo + (hi-lo)*(0.45*f1(px,py)*blotch + 0.35*f2(px,py) + 0.2*rnd() + (1-blotch)*0.45);
    const i = (py*n+px)*4; d[i] = d[i+1] = d[i+2] = Math.max(0, Math.min(255, v)); d[i+3] = 255;
  }
  x.putImageData(img, 0, 0);
}
const TEX = {
  // Unidades: grano fino, desgaste, juntas de paneles cada 64 px, remaches y rayones
  metal: canvasTex(256, (x, n, rnd) => {
    grainPixels(x, n, rnd, 205, 255, 0.7);
    for(let k=0; k<=n; k+=64){
      x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(k, 0, 1, n); x.fillRect(0, k, n, 1);
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(k+1, 0, 1, n); x.fillRect(0, k+1, n, 1);
    }
    x.fillStyle = 'rgba(0,0,0,0.3)';
    for(let a=0; a<n; a+=64) for(let b=0; b<n; b+=16){ x.beginPath(); x.arc(a+5, b+8, 1.4, 0, 7); x.arc(b+8, a+5, 1.4, 0, 7); x.fill(); }
    x.strokeStyle = 'rgba(255,255,255,0.16)'; x.lineWidth = 1;
    for(let i=0; i<26; i++){ const sx = rnd()*n, sy = rnd()*n, l = 6+rnd()*22, a = rnd()*6.28; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx+Math.cos(a)*l, sy+Math.sin(a)*l); x.stroke(); }
    x.fillStyle = 'rgba(60,40,20,0.10)';
    for(let i=0; i<40; i++){ x.beginPath(); x.arc(rnd()*n, rnd()*n, 2+rnd()*7, 0, 7); x.fill(); }   // polvo y óxido leve
    for(let i=0; i<34; i++){ const sx = rnd()*n, sy = rnd()*n, l = 14+rnd()*50, g = x.createLinearGradient(0, sy, 0, sy+l); g.addColorStop(0, 'rgba(70,45,25,0.22)'); g.addColorStop(1, 'rgba(70,45,25,0)'); x.fillStyle = g; x.fillRect(sx, sy, 1+rnd()*2.5, l); }   // chorreado de óxido y suciedad
    x.fillStyle = 'rgba(255,250,240,0.22)';
    for(let i=0; i<70; i++){ x.fillRect(rnd()*n, rnd()*n, 1+rnd()*3, 1+rnd()*1.5); }   // pintura saltada
    x.fillStyle = 'rgba(20,18,16,0.25)';
    for(let i=0; i<30; i++){ x.beginPath(); x.arc(rnd()*n, rnd()*n, 0.8+rnd()*1.6, 0, 7); x.fill(); }   // impactos y picaduras
  }, 7),
  // Arena: granos, guijarros y ondas de viento
  sand: canvasTex(512, (x, n, rnd) => {
    grainPixels(x, n, rnd, 196, 255, 0.8);
    x.strokeStyle = 'rgba(120,90,50,0.10)'; x.lineWidth = 2;
    for(let k=0; k<46; k++){ const y0 = rnd()*n, amp = 3+rnd()*5, ph = rnd()*6.28; x.beginPath(); for(let px=0; px<=n; px+=8){ const y = y0 + Math.sin(px/n*6.28*3+ph)*amp; px ? x.lineTo(px, y) : x.moveTo(px, y); } x.stroke(); }
    for(let i=0; i<420; i++){ const r = 0.6+rnd()*1.8, g = rnd(); x.fillStyle = g < 0.5 ? `rgba(90,70,45,${0.25+rnd()*0.3})` : `rgba(255,248,230,${0.2+rnd()*0.3})`; x.beginPath(); x.arc(rnd()*n, rnd()*n, r, 0, 7); x.fill(); }
  }, 11),
  // Roca: manchas grandes y grietas oscuras
  rock: canvasTex(256, (x, n, rnd) => {
    grainPixels(x, n, rnd, 170, 255, 1);
    x.strokeStyle = 'rgba(40,30,20,0.35)'; x.lineWidth = 1.2;
    for(let i=0; i<18; i++){ let px = rnd()*n, py = rnd()*n; x.beginPath(); x.moveTo(px, py); for(let s=0; s<6; s++){ px += (rnd()-0.5)*30; py += rnd()*20; x.lineTo(px, py); } x.stroke(); }
  }, 13),
  // Agua: ondas claras que se desplazan
  water: canvasTex(256, (x, n, rnd) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, n, n);
    for(let i=0; i<60; i++){ const px = rnd()*n, py = rnd()*n, w = 10+rnd()*30; x.strokeStyle = `rgba(30,70,90,${0.12+rnd()*0.15})`; x.lineWidth = 1.5; x.beginPath(); x.ellipse(px, py, w, w*0.25, 0, 0, 7); x.stroke(); }
  }, 17)
};
// Humo: mancha redonda de bordes difusos con algo de grano (para sprites que miran a la cámara)
TEX.camo = canvasTex(256, (x, n, rnd) => {
  x.drawImage(TEX.metal.image, 0, 0, n, n);
  const img = x.getImageData(0, 0, n, n), d = img.data, f1 = noiseField(n, 3, rnd), f2 = noiseField(n, 6, rnd);
  for(let py=0; py<n; py++) for(let px=0; px<n; px++){ const v = f1(px,py)*0.68 + f2(px,py)*0.32, k = v > 0.6 ? 0.6 : v < 0.4 ? 1.1 : 0.84, i = (py*n+px)*4;
    d[i] = Math.min(255, d[i]*k); d[i+1] = Math.min(255, d[i+1]*k); d[i+2] = Math.min(255, d[i+2]*k); }
  x.putImageData(img, 0, 0);
}, 37);
TEX.cloth = canvasTex(256, (x, n, rnd) => {
  grainPixels(x, n, rnd, 196, 255, 0.55);
  for(let k=0; k<n; k+=3){ x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(0, k, n, 1); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(k, 0, 1, n); }   // trama del tejido
  x.strokeStyle = 'rgba(0,0,0,0.16)'; x.setLineDash([3, 2]); x.lineWidth = 1;
  for(let i=0; i<6; i++){ const y0 = rnd()*n; x.beginPath(); x.moveTo(0, y0); x.lineTo(n, y0 + (rnd()-0.5)*20); x.stroke(); }   // costuras
  x.setLineDash([]); x.fillStyle = 'rgba(80,60,35,0.10)';
  for(let i=0; i<26; i++){ x.beginPath(); x.ellipse(rnd()*n, rnd()*n, 4+rnd()*14, 3+rnd()*8, rnd()*3, 0, 7); x.fill(); }   // manchas de tierra y sudor
}, 31);
TEX.smoke = canvasTex(128, (x, n, rnd) => {
  for(let i=0; i<7; i++){ const cx = n/2 + (rnd()-0.5)*n*0.25, cy = n/2 + (rnd()-0.5)*n*0.25, r = n*(0.22 + rnd()*0.18);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(0.55, "rgba(255,255,255,0.4)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); }
}, 23);
TEX.smoke.wrapS = TEX.smoke.wrapT = THREE.ClampToEdgeWrapping;
// Fuego: lóbulos turbulentos con núcleo blanco-amarillo, borde naranja y rojo (se dibuja en aditivo)
TEX.fire = canvasTex(128, (x, n, rnd) => {
  for(let i=0; i<14; i++){ const a = rnd()*6.28, d = rnd()*n*0.2, cx = n/2 + Math.cos(a)*d, cy = n/2 + Math.sin(a)*d, r = n*(0.14 + rnd()*0.2);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,246,214,0.85)'); g.addColorStop(0.35, 'rgba(255,186,80,0.7)'); g.addColorStop(0.7, 'rgba(214,82,26,0.35)'); g.addColorStop(1, 'rgba(120,30,10,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); }
}, 29);
TEX.fire.wrapS = TEX.fire.wrapT = THREE.ClampToEdgeWrapping;
// Arena del terreno: se repite cada 9 unidades sobre los colores por vértice del suelo
TEX.sand.repeat.set(WORLD/9, WORLD/9);
if(scene.userData.ground){ scene.userData.ground.material.map = TEX.sand; scene.userData.ground.material.needsUpdate = true; }
TEX.water.repeat.set(0.5, 0.5);
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
function geo(key, make){ if(!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
// Caja con aristas redondeadas: los vértices del borde se proyectan sobre una esfera de radio r centrada
// en la caja interior, y su normal es la dirección de esa proyección. Así las piezas no se ven como cubos.
function roundBoxGeo(w,h,d){
  const m = Math.min(w,h,d), r = Math.min(0.14, m*0.3);
  if(r < 0.006) return new THREE.BoxGeometry(w,h,d);
  // Piezas medianas y grandes: bisel en arco de 2 tramos (7 segmentos por eje); piezas pequeñas: 1 tramo (3 segmentos)
  const arc = m >= 0.18, seg = arc ? 7 : 3, edge = arc ? 1.5/7 : 1/6;   // |t| hasta 'edge' es la cara plana
  const g = new THREE.BoxGeometry(1,1,1,seg,seg,seg), p = g.attributes.position, n = g.attributes.normal;
  const half = [w/2,h/2,d/2], inner = half.map(v => v-r), v = [0,0,0], c = [0,0,0];
  for(let i=0; i<p.count; i++){
    const t = [p.getX(i), p.getY(i), p.getZ(i)];
    for(let k=0; k<3; k++){
      const a = Math.abs(t[k]);
      v[k] = a <= edge+1e-6 ? t[k]/edge*inner[k] : Math.sign(t[k])*(inner[k] + (a-edge)/(0.5-edge)*r);   // cara plana o tramo del bisel
      c[k] = Math.max(-inner[k], Math.min(inner[k], v[k]));
    }
    const dx = v[0]-c[0], dy = v[1]-c[1], dz = v[2]-c[2], len = Math.hypot(dx,dy,dz);
    if(len > 1e-6){ p.setXYZ(i, c[0]+dx/len*r, c[1]+dy/len*r, c[2]+dz/len*r); n.setXYZ(i, dx/len, dy/len, dz/len); }
    else p.setXYZ(i, v[0], v[1], v[2]);
  }
  return g;
}
// DETAIL_LO: modelos simplificados (sin bisel, menos segmentos) para la vista alejada y la calidad Media o Baja
let DETAIL_LO = false;
function box(w,h,d,color,x=0,y=0,z=0){ const m=new THREE.Mesh(DETAIL_LO ? geo(`b${w}_${h}_${d}`,()=>new THREE.BoxGeometry(w,h,d)) : geo(`rb${w}_${h}_${d}`,()=>roundBoxGeo(w,h,d)), mat(color)); m.position.set(x,y+h/2,z); m.castShadow=true; m.receiveShadow=true; m.userData.caja = w*d; return m; }
function cyl(r,h,color,x=0,y=0,z=0,seg=14,rTop=r){ if(DETAIL_LO) seg = Math.max(5, Math.round(seg*0.45)); const m=new THREE.Mesh(geo(`c${r}_${rTop}_${h}_${seg}`,()=>new THREE.CylinderGeometry(rTop,r,h,seg)), mat(color)); m.position.set(x,y+h/2,z); m.castShadow=true; m.receiveShadow=true; return m; }
function barrel(len, r, color){ const sg = DETAIL_LO ? 5 : 12, b=new THREE.Mesh(geo(`br${len}_${r}_${sg}`,()=>new THREE.CylinderGeometry(r,r,len,sg)), mat(color)); b.rotation.x=Math.PI/2; b.castShadow=true; return b; }
function makeRing(r, color){
  const m = new THREE.Mesh(geo(`r${r}`, () => new THREE.RingGeometry(r, r+0.2, 36)), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.9, depthWrite:false }));
  m.rotation.x = -Math.PI/2; m.position.y = 0.06; m.visible = false; return m;
}
// ======================= MODELOS DE UNIDADES POR FACCIÓN =======================
// Lenguaje visual (diseño original):
//   Atlas     = alta tecnología: cascos claros y lisos, cabinas de vidrio, sensores cian.
//   Hierro    = blindaje pesado: acero oscuro, placas y remaches, chimeneas, acentos de óxido.
//   Guerrilla = material improvisado: vehículos civiles adaptados, lonas, sacos y colores dispares.
// El color del equipo (azul o rojo) aparece siempre en una franja visible para leer el bando.
// Las piezas estáticas se fusionan en una sola malla con colores por vértice y el modelo se guarda
// como prototipo: todas las unidades iguales comparten geometría (menos llamadas de dibujo).
const PAL = {
  atlas:    { hull:0xc6ced4, dark:0x58636c, trim:0x8d9aa4, glass:0x86d6f2, glow:0x6fe3ff, metal:0x3c444b },
  hierro:   { hull:0x5f5a52, dark:0x35322e, trim:0x8c5a3a, glass:0xc99a62, glow:0xff8a4a, metal:0x2a2826 },
  guerrilla:{ hull:0x7e7248, dark:0x4b4731, trim:0x9a8a5c, glass:0xa9c2b9, glow:0xe8d27a, metal:0x3b3629 }
};
const RUBBER = 0x242422, GUN = 0x2b2b28, SKIN = 0xd1ad84, ORE = 0x8a6a3e, WOOD = 0x6b4a2a, CLOTH = 0x8f7f55;
function glowMat(color){ const k = 'glow:' + color; if(!matCache.has(k)){ const m = addFog(new THREE.MeshBasicMaterial({ color })); m.userData.glow = true; matCache.set(k, m); } return matCache.get(k); }
// Vidrio de ventana: se fusiona aparte y su color depende de la hora (reflejo de día, luz interior de noche) y de la energía
const WIN_TAG = new THREE.MeshBasicMaterial({ color:0xffffff }); WIN_TAG.userData.ventana = true;
function pane(w,h,d,x=0,y=0,z=0){ const m = new THREE.Mesh(geo(`b${w}_${h}_${d}`,()=>new THREE.BoxGeometry(w,h,d)), WIN_TAG); m.position.set(x,y+h/2,z); return m; }
// Desierto: vidrio de control solar color bronce que refleja la arena; al atardecer toma el naranja del cielo; de noche
// deja ver la luz cálida del interior. Sin energía, de noche queda oscuro.
const VIDRIO = { dia:[0x6a6052, 0x5a5348], atardecer:[0x9a6a44, 0x6e5240], noche:[0xffc070, 0x1c1e22] };
const WIN_MAT = [addFog(new THREE.MeshBasicMaterial({ vertexColors:true, color:VIDRIO.dia[0] })), addFog(new THREE.MeshBasicMaterial({ vertexColors:true, color:VIDRIO.dia[1] }))];
WIN_MAT.forEach(m => m.userData.glowOk = true);
// Luces apagadas: los focos y pantallas quedan como piezas opacas
const LUZ_OFF = addFog(new THREE.MeshLambertMaterial({ vertexColors:true, color:0x3a3a3a }));
function lamp(w,h,d,color,x=0,y=0,z=0){ const m = new THREE.Mesh(geo(`b${w}_${h}_${d}`,()=>new THREE.BoxGeometry(w,h,d)), DETAIL_LO ? mat(color) : glowMat(color)); m.position.set(x,y+h/2,z); return m; }
function ball(r,color,x=0,y=0,z=0,sx=1,sy=1,sz=1){ const m = new THREE.Mesh(DETAIL_LO ? geo(`sl${r}`,()=>new THREE.SphereGeometry(r,6,4)) : geo(`s${r}`,()=>r < 0.06 ? new THREE.SphereGeometry(r,8,6) : r < 0.2 ? new THREE.SphereGeometry(r,12,8) : new THREE.SphereGeometry(r,14,10)), mat(color)); m.position.set(x,y,z); m.scale.set(sx,sy,sz); return m; }
function tilt(m, rx=0, ry=0, rz=0){ m.rotation.set(rx,ry,rz); return m; }
function named(g, name){ g.name = name; return g; }
// Cabina con capó y parabrisas inclinado: perfil lateral extruido a lo ancho, más el vidrio inclinado
function cab(body, w, h, d, color, glass, y, z){
  body.add(profileZ([[-d/2,0],[d/2,0],[d/2,h*0.42],[d*0.12,h*0.5],[-d*0.18,h],[-d/2,h]], w, color, 0, y, z));
  body.add(tilt(box(w*0.86, h*0.5, 0.04, glass, 0, y+h*0.5, z-d*0.03), -0.6));
}
// Eje con sus ruedas: grupo con pivote en el centro de la rueda, que el render gira según la distancia recorrida.
// Los rayos del rin hacen visible el giro.
function axle(xs, r, w, y, z, hubColor=0x77736a, tire=RUBBER){
  const a = named(new THREE.Group(), 'axle'); a.position.set(0, y+r, z); a.userData.r = r;
  for(const x of xs){
    const ws = DETAIL_LO ? 8 : 20, t = new THREE.Mesh(geo(`wh${r}_${w}_${ws}`,()=>new THREE.CylinderGeometry(r,r,w,ws)), mat(tire)); t.rotation.z = Math.PI/2; t.position.x = x; a.add(t);
    const hs = DETAIL_LO ? 6 : 12, h = new THREE.Mesh(geo(`hb${r}_${w}_${hs}`,()=>new THREE.CylinderGeometry(r*0.52,r*0.52,w+0.03,hs)), mat(hubColor)); h.rotation.z = Math.PI/2; h.position.x = x; a.add(h);
    const sx = x + (x<0 ? -1 : 1)*(w/2+0.02);
    a.add(box(0.025, r*1.55, r*0.17, hubColor, sx, -r*0.775, 0), tilt(box(0.025, r*1.55, r*0.17, hubColor, sx, -r*0.775, 0), Math.PI/2));
  }
  return a;
}
function wheels(body, r, w, xs, zs, hubColor){ for(const z of zs) body.add(axle(xs, r, w, 0, z, hubColor)); }
// Orugas: banda con tacos, ruedas de rodaje animadas y guardabarros
function tracks(body, len, w, h, gap, color, fender){
  for(const sx of [-1,1]){
    body.add(box(w, h, len, RUBBER, sx*gap, 0, 0));
    for(let z=-len/2+0.12; z<len/2; z+=0.24) body.add(box(w+0.02, 0.05, 0.08, 0x343230, sx*gap, h-0.02, z));   // tacos superiores
    if(fender) body.add(box(w+0.08, 0.07, len+0.1, color, sx*gap, h, 0));
  }
  const n = Math.max(3, Math.round(len/0.5)), rr = h*0.36;
  for(let i=0; i<n; i++){ const z = -len/2 + 0.25 + i*(len-0.5)/(n-1); body.add(axle([-gap, gap], rr, w+0.04, 0.03, z, 0x8a857a, 0x5a564e)); }
}
// Pieza de revolución (perfil [radio, altura]) en caché por clave: torso, pelvis, faldón, cascos
function organ(key, pts, color, x=0, y=0, z=0, sx=1, sy=1, sz=1, seg=10){
  if(DETAIL_LO){ seg = 6; key += 'lo'; }
  const g = geo('org' + key, () => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0.0005, r), h)), seg));
  const m = new THREE.Mesh(g, mat(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; return m;
}
// Extremidad entre dos puntos: cilindro ahusado con extremos redondeados (músculo, manga o pernera)
const UP_Y = new THREE.Vector3(0, 1, 0);
function limb(a, b, r0, r1, color){
  const d = new THREE.Vector3(b[0]-a[0], b[1]-a[1], b[2]-a[2]), L = Math.round(d.length()*200)/200;
  const sg = DETAIL_LO ? 4 : 7, g = geo(`limb${r0}_${r1}_${L}_${sg}`, () => new THREE.LatheGeometry((DETAIL_LO ? [[0.0005,0],[r0,0.01],[r1,L-0.01],[0.0005,L]] : [[0.0005,0],[r0*0.72,0.004],[r0,r0*0.5],[(r0+r1)*0.53,L*0.45],[r1,L-r1*0.5],[r1*0.72,L-0.004],[0.0005,L]]).map(([r,h]) => new THREE.Vector2(r,h)), sg));
  const m = new THREE.Mesh(g, mat(color)); m.position.set(a[0], a[1], a[2]); m.quaternion.setFromUnitVectors(UP_Y, d.normalize()); m.castShadow = true; return m;
}
const bc = (w, h, d, c, x, y, z) => box(w, h, d, c, x, y - h/2, z);   // caja centrada en y
// Camuflaje por facción: tonos que mergeMeshes mezcla por vértice sobre la ropa (manchas suaves)
const CAMO = { atlas:[0x3e4750, 0x8a96a0], hierro:[0x3c3426, 0x6b6a4c], guerrilla:[0x4a4a2a, 0x8c7c55] };
function camo(m, f){ m.userData.camo = CAMO[f]; return m; }
// Fusil detallado según facción. Eje del arma en Z; (x, y) es la línea del cañón; z0 es la cantonera.
function rifle(body, f, P, x, y, z0, largo){
  const metal = 0x2a2a27, mueble = f==='guerrilla' ? WOOD : f==='hierro' ? 0x3a352c : 0x30363b;
  if(f==='atlas'){   // fusil compacto (cargador detrás del pistolete), carcasa clara y mira holográfica
    body.add(bc(0.05, 0.075, 0.36, 0x3a4249, x, y, z0+0.18), bc(0.046, 0.03, 0.2, P.hull, x, y-0.05, z0+0.12), bc(0.036, 0.085, 0.045, metal, x, y-0.075, z0+0.05));
    body.add(tilt(bc(0.03, 0.075, 0.034, metal, x, y-0.07, z0+0.2), 0.3), bc(0.02, 0.012, 0.22, metal, x, y+0.045, z0+0.22));
    body.add(bc(0.034, 0.04, 0.06, metal, x, y+0.07, z0+0.2), lamp(0.024, 0.026, 0.004, P.glow, x, y+0.058, z0+0.232), lamp(0.05, 0.006, 0.006, P.glow, x+0.026, y, z0+0.2));
    { const b = barrel(largo ? 0.42 : 0.16, 0.01, metal); b.position.set(x, y+0.008, z0 + 0.36 + (largo ? 0.21 : 0.08)); body.add(b); }
    { const m = barrel(0.05, 0.015, metal); m.position.set(x, y+0.008, z0 + (largo ? 0.8 : 0.45)); body.add(m); }
    return;
  }
  body.add(bc(0.042, 0.07, 0.15, mueble, x, y-0.03, z0+0.075), bc(0.044, 0.06, 0.22, metal, x, y, z0+0.26));          // culata y cajón de mecanismos
  body.add(tilt(bc(0.03, 0.07, 0.034, f==='guerrilla' ? WOOD : metal, x, y-0.06, z0+0.2), 0.32));                    // pistolete
  for(let k=0; k<2; k++) body.add(tilt(bc(0.03, 0.055, 0.042, f==='guerrilla' ? 0x4a3524 : metal, x, y-0.06-k*0.042, z0+0.29+k*0.018), -0.28-k*0.22));   // cargador curvo
  body.add(bc(0.048, 0.05, 0.17, mueble, x, y+0.002, z0+0.45), bc(0.016, 0.012, 0.1, metal, x, y+0.04, z0+0.24));    // guardamanos y riel
  if(f==='hierro'){ body.add(barrel(0.12, 0.016, metal)); const sc = body.children[body.children.length-1]; sc.position.set(x, y+0.06, z0+0.27); body.add(lamp(0.02, 0.02, 0.004, P.glass, x, y+0.06, z0+0.332)); }   // mira telescópica
  else body.add(bc(0.01, 0.03, 0.01, metal, x, y+0.045, z0+0.5));                                                     // alza
  { const b = barrel(largo ? 0.36 : 0.18, 0.009, metal); b.position.set(x, y+0.008, z0 + 0.54 + (largo ? 0.18 : 0.09)); body.add(b); }
  { const m = barrel(0.045, 0.014, metal); m.position.set(x, y+0.008, z0 + (largo ? 0.92 : 0.74)); body.add(m); }
  body.add(tilt(bc(0.006, 0.006, 0.42, 0x3a3428, x+0.026, y-0.05, z0+0.28), 0.12));                                  // correa
}
// Figura humana con proporciones reales: piernas con rodilla y bota, pelvis, torso ahusado, brazos en pose
// según el arma, cuello y cabeza con rasgos; ropa con camuflaje y equipo por facción.
function soldier(body, f, P, tc, rol){
  const civil = rol==='trabajador', armado = rol==='soldado' || rol==='heroe' || rol==='antitanque';
  const pants = civil ? 0x5e5440 : f==='atlas' ? 0x48525c : f==='hierro' ? 0x4a4436 : 0x5d5a35;
  const coat  = civil ? 0x9a8462 : f==='atlas' ? 0x66727c : f==='hierro' ? 0x5a5443 : 0x6d6b3c;
  const boot  = f==='atlas' && !civil ? 0x30363c : f==='hierro' ? 0x1e1c1a : 0x4a3a28;
  const glove = civil ? SKIN : f==='atlas' ? 0x30363c : f==='hierro' ? 0x2a2622 : SKIN;
  const vest  = f==='atlas' ? P.hull : f==='hierro' ? 0x3e3a30 : 0x4f4a32;
  const cl = m => civil ? m : camo(m, f);
  // Piernas: pivote en la cadera (el render las balancea al caminar). Muslo, rodilla, pantorrilla y bota.
  for(const sx of [-1,1]){
    const leg = named(new THREE.Group(), 'leg'); leg.position.set(sx*0.072, 0.5, 0);
    leg.add(cl(limb([0,0.03,0], [sx*0.006,-0.26,0.02], 0.062, 0.047, pants)), cl(ball(0.047, pants, sx*0.006, -0.245, 0.02)));
    if(!civil) leg.add(bc(0.062, 0.06, 0.03, f==='atlas' ? P.dark : 0x3a3428, sx*0.006, -0.25, 0.058));          // rodillera
    // Pantorrilla y bota: grupo con pivote en la rodilla (el render la dobla al dar el paso)
    const shin = named(new THREE.Group(), 'shin'); shin.position.set(sx*0.006, -0.245, 0.02); leg.add(shin);
    const kx = sx*0.006, ky = -0.245, kz = 0.02, at = (x, y, z) => [x - kx, y - ky, z - kz];
    shin.add(cl(limb(at(sx*0.006,-0.235,0.02), at(sx*0.004,-0.445,-0.008), 0.047, 0.034, pants)));
    { const p = at(sx*0.004, -0.49, -0.004); shin.add(cyl(0.038, 0.07, boot, p[0], p[1], p[2], 10)); }
    { const p = at(sx*0.004, -0.47, 0.03); shin.add(bc(0.066, 0.05, 0.13, boot, p[0], p[1], p[2])); }
    { const p = at(sx*0.004, -0.472, 0.088); shin.add(ball(0.034, boot, p[0], p[1], p[2], 1, 0.75, 1.1)); }
    { const p = at(sx*0.004, -0.494, 0.035); shin.add(bc(0.07, 0.014, 0.16, 0x1a1816, p[0], p[1], p[2])); }   // caña, bota, puntera y suela
    if(f==='hierro' && !civil){ const p = at(sx*0.004, -0.46, -0.008); shin.add(cyl(0.042, 0.12, boot, p[0], p[1], p[2], 10)); }   // caña alta
    body.add(leg);
  }
  body.add(cl(organ('pelvis', [[0,-0.06],[0.07,-0.055],[0.105,-0.02],[0.11,0.02],[0.1,0.06],[0,0.07]], pants, 0, 0.51, 0, 1.2, 1, 0.82)));
  // Torso ahusado (cintura a hombros) y faldón del abrigo en Hierro
  body.add(cl(organ('torso', [[0,0],[0.098,0],[0.106,0.07],[0.122,0.17],[0.132,0.25],[0.124,0.3],[0.088,0.335],[0.03,0.35],[0,0.35]], coat, 0, 0.52, 0, 1.12, 1, 0.7)));
  if(f==='hierro' && !civil) body.add(camo(organ('falda', [[0.122,0],[0.118,0.08],[0.112,0.18],[0.104,0.27],[0,0.27]], coat, 0, 0.27, 0, 1.25, 1, 0.92), f));
  body.add(cyl(0.106, 0.035, 0x2e2a24, 0, 0.535, 0, 14)); body.children[body.children.length-1].scale.z = 0.76;   // cinturón
  body.add(bc(0.03, 0.026, 0.01, 0x8a8070, 0, 0.552, 0.082));                                                       // hebilla
  // Chaleco portaplacas con cargadores, radio y cantimplora
  if(!civil){
    if(f==='atlas') body.add(bc(0.25, 0.21, 0.06, vest, 0, 0.67, 0.07), bc(0.25, 0.22, 0.05, vest, 0, 0.67, -0.07), lamp(0.12, 0.008, 0.006, P.glow, 0, 0.745, 0.102), ball(0.056, P.hull, 0.158, 0.82, 0, 1.05, 0.62, 1.05), ball(0.056, P.hull, -0.158, 0.82, 0, 1.05, 0.62, 1.05));
    else body.add(bc(0.24, 0.2, 0.06, vest, 0, 0.67, 0.07), bc(0.24, 0.22, 0.05, vest, 0, 0.67, -0.07));
    if(armado) for(const px of [-0.065, 0, 0.065]) body.add(bc(0.052, 0.07, 0.034, f==='atlas' ? P.dark : 0x4a4434, px, 0.62, 0.112));   // portacargadores
    body.add(bc(0.05, 0.06, 0.04, f==='atlas' ? P.dark : 0x4a4434, -0.118, 0.6, 0.03), cyl(0.026, 0.07, 0x3d3a2a, 0.115, 0.52, -0.05, 8));   // bolsa lateral y cantimplora
    if(rol==='soldado' && f!=='guerrilla'){ body.add(bc(0.07, 0.1, 0.04, 0x2a2a28, 0.06, 0.66, -0.115)); body.add(limb([0.075,0.7,-0.12], [0.085,0.98,-0.13], 0.004, 0.003, 0x1e1e1c)); }   // radio y antena
  } else body.add(bc(0.2, 0.12, 0.02, 0x7a6a4c, 0, 0.6, 0.09));                                                     // bolsillo de la camisa
  for(const sx of [-1,1]) body.add(ball(0.052, tc, sx*0.15, 0.84, 0, 1.0, 0.42, 1.15));                              // hombreras del equipo (se leen desde lejos)
  // Brazos: hombro → codo → mano, en la pose del arma
  const S = [0.15, 0.825, 0];
  let R, L;
  if(rol==='antitanque') R = [[0.2,0.72,0.03],[0.115,0.83,0.11]], L = [[-0.11,0.72,0.19],[0.075,0.86,0.3]];
  else if(armado) R = [[0.172,0.665,0.04],[0.085,0.7,0.15]], L = [[-0.135,0.68,0.17],[-0.005,0.725,0.33]];
  else R = [[0.172,0.665,0.0],[0.17,0.5,0.05]], L = [[-0.172,0.665,0.0],[-0.17,0.5,0.05]];
  for(const [sx, A] of [[1, R], [-1, L]]){
    const sh = [sx*S[0], S[1], S[2]];
    body.add(cl(limb(sh, A[0], 0.043, 0.035, coat)), cl(limb(A[0], A[1], 0.035, 0.027, coat)), cl(ball(0.035, coat, A[0][0], A[0][1], A[0][2])));
    body.add(ball(0.03, glove, A[1][0], A[1][1], A[1][2], 0.9, 1, 1.15));
    if(f==='atlas' && !civil) body.add(ball(0.03, P.hull, A[0][0], A[0][1], A[0][2]));                              // coderas
  }
  // Cuello y cabeza con mentón, nariz y ojos
  body.add(cyl(0.032, 0.06, SKIN, 0, 0.86, 0.005, 8), ball(0.07, SKIN, 0, 0.958, 0.006, 0.9, 1.08, 0.98), ball(0.05, SKIN, 0, 0.928, 0.024, 0.95, 0.8, 0.9));
  if(!DETAIL_LO){ body.add(bc(0.016, 0.022, 0.02, SKIN, 0, 0.948, 0.072));
    for(const sx of [-1,1]) body.add(bc(0.016, 0.007, 0.004, 0x1a1612, sx*0.025, 0.966, 0.067), ball(0.016, SKIN, sx*0.064, 0.955, 0, 0.5, 1, 0.8)); }   // nariz, ojos y orejas
  // Cabeza por facción y papel
  if(rol==='ingeniero') body.add(ball(0.084, 0xe8c43a, 0, 0.982, 0, 1, 0.78, 1.06), cyl(0.098, 0.012, 0xe8c43a, 0, 0.958, 0.01, 16), lamp(0.024, 0.02, 0.012, 0xfff2c8, 0, 0.99, 0.085));
  else if(civil) body.add(cyl(0.12, 0.012, 0xb89a5a, 0, 0.995, 0, 16), cyl(0.075, 0.055, 0xb89a5a, 0, 1.0, 0, 14, 0.06));   // sombrero de ala ancha
  else if(f==='atlas'){
    body.add(ball(0.084, P.hull, 0, 0.982, -0.006, 1, 0.82, 1.08), lamp(0.11, 0.024, 0.012, P.glow, 0, 0.95, 0.072));   // casco con visor
    for(const sx of [-1,1]) body.add(cyl(0.022, 0.03, P.dark, sx*0.074, 0.94, 0, 10));
    body.add(bc(0.03, 0.025, 0.03, P.dark, 0, 1.03, 0.06));                                                          // soporte del visor nocturno
  } else if(f==='hierro'){
    body.add(ball(0.086, P.dark, 0, 0.98, -0.004, 1.03, 0.8, 1.06), cyl(0.094, 0.012, P.dark, 0, 0.944, -0.004, 16));   // casco de acero con borde
    body.add(bc(0.072, 0.05, 0.035, 0x2a2826, 0, 0.928, 0.064));                                                      // máscara antigás
    { const fl = new THREE.Mesh(geo('filtro', () => new THREE.CylinderGeometry(0.024, 0.026, 0.05, 10)), mat(0x3a3a34)); fl.rotation.x = Math.PI/2.4; fl.position.set(0, 0.915, 0.098); body.add(fl); }
    for(const sx of [-1,1]) body.add(lamp(0.026, 0.022, 0.006, P.glass, sx*0.026, 0.966, 0.072));                    // oculares
  } else {
    body.add(ball(0.05, 0x2e241a, 0, 0.916, 0.03, 1.05, 0.75, 0.85));                                                 // barba
    body.add(camo(organ('pañuelo', [[0.075,0],[0.08,0.03],[0.07,0.05],[0,0.05]], 0x9a8a5c, 0, 0.865, 0.004, 1, 1, 0.95), f));   // pañuelo al cuello
    if(rol==='heroe') body.add(ball(0.082, 0x3d4a16, 0.012, 1.0, 0, 1, 0.45, 1));                                     // boina
    else body.add(cyl(0.11, 0.01, 0x5d5a35, 0, 0.995, 0, 16), cyl(0.074, 0.06, 0x5d5a35, 0, 1.0, 0, 14, 0.068));     // sombrero de selva
  }
  // Armas y equipo de espalda
  if(rol==='soldado' || rol==='heroe') rifle(body, f, P, 0.07, 0.745, 0.01, rol==='heroe' && f==='atlas');
  if(rol==='soldado'){ body.add(bc(0.2, 0.22, 0.1, f==='atlas' ? P.trim : 0x4a4434, 0, 0.66, -0.15)); const r = barrel(0.24, 0.045, f==='guerrilla' ? CLOTH : 0x5a5446); r.rotation.set(0, 0, Math.PI/2); r.position.set(0, 0.8, -0.16); body.add(r); }   // mochila y manta
  if(rol==='antitanque'){
    const col = f==='atlas' ? 0x56606a : f==='hierro' ? 0x4f5a3a : 0x5f6a3a;
    { const t = barrel(0.82, 0.034, col); t.position.set(0.11, 0.9, 0.1); body.add(t); }                               // tubo lanzador al hombro
    { const t = barrel(0.07, 0.046, 0x2a2a28); t.position.set(0.11, 0.9, -0.32); body.add(t); }                       // tobera trasera
    if(f==='guerrilla'){ body.add(limb([0.11,0.9,0.5], [0.11,0.9,0.66], 0.05, 0.01, 0x6b6a4a)); body.add(limb([0.11,0.9,0.47], [0.11,0.9,0.52], 0.024, 0.024, 0x4a3a28)); }   // cabeza de cohete
    else { const b = barrel(0.05, 0.04, 0x2a2a28); b.position.set(0.11, 0.9, 0.52); body.add(b); }
    body.add(bc(0.05, 0.05, 0.08, f==='atlas' ? P.dark : 0x2a2a28, 0.06, 0.93, 0.18), bc(0.03, 0.07, 0.035, 0x2a2a28, 0.12, 0.84, 0.12));   // mira y empuñadura
    if(f==='atlas') body.add(lamp(0.006, 0.02, 0.04, P.glow, 0.034, 0.935, 0.18));
    body.add(bc(0.2, 0.24, 0.1, f==='atlas' ? P.trim : 0x4a4434, 0, 0.66, -0.15));                                     // mochila
    for(const sx of [-0.05, 0.05]){ body.add(limb([sx,0.74,-0.17], [sx,0.95,-0.17], 0.034, 0.034, 0x6b6a4a)); body.add(limb([sx,0.95,-0.17], [sx,1.02,-0.17], 0.034, 0.008, 0x8a3a2a)); }   // cohetes de reserva
  }
  if(rol==='ingeniero'){ const c = barrel(0.4, 0.012, 0x2a2a27); c.rotation.set(0.9, 0, 0.5); c.position.set(0.02, 0.7, -0.14); body.add(c); body.add(bc(0.06, 0.08, 0.05, 0x8a6a2a, 0.12, 0.5, 0.05)); }   // carabina a la espalda y caja de herramientas
}

function unitModel(e, o, body){
  const f = S.players[e.owner].faction, P = PAL[f], tc = TEAM[e.owner], td = TEAM_DARK[e.owner];
  const turret = (y, z=0) => { const t = named(new THREE.Group(), 'turret'); t.position.set(0,y,z); body.add(t); return t; };
  switch(e.type){
    case 'recolector':
      if(f==='atlas'){            // Helicóptero de carga: fuselaje alargado, cabina de vidrio y contenedor colgante
        body.add(ball(0.55,P.hull,0,-0.1,0.15,1,0.82,1.9), ball(0.36,P.glass,0,0.0,0.95,1,0.78,1.1));
        body.add(box(0.98,0.14,0.7,tc,0,-0.05,0.0), box(0.2,0.2,1.8,P.hull,0,-0.05,-1.55), box(0.06,0.55,0.42,tc,0,0.0,-2.4));
        body.add(box(0.5,0.05,0.22,P.dark,0,0.1,-2.3), lamp(0.08,0.08,0.08,P.glow,0,0.48,-2.45));
        { const tr = named(new THREE.Group(), 'rotor2'); tr.position.set(0.07,0.25,-2.4); tr.add(box(0.03,0.62,0.07,P.metal,0,-0.31,0), box(0.03,0.07,0.62,P.metal,0,-0.035,0)); body.add(tr); }
        for(const sx of [-1,1]) body.add(box(0.07,0.07,1.6,P.metal,sx*0.48,-0.72,0.1), box(0.05,0.3,0.05,P.metal,sx*0.42,-0.68,0.45), box(0.05,0.3,0.05,P.metal,sx*0.42,-0.68,-0.25));
        body.add(cyl(0.12,0.22,P.metal,0,0.32,0.1,10));
        // Cabrestante: el cable se estira hasta el suelo al cargar; el contenedor cuelga del gancho
        const winch = named(new THREE.Group(), 'winch'); winch.position.set(0,-0.62,0.1); body.add(winch);
        const cable = named(new THREE.Group(), 'cable'); cable.add(box(0.035,1,0.035,P.metal,0,-1,0)); winch.add(cable);
        const hook = named(new THREE.Group(), 'hook'); hook.position.y = -1; winch.add(hook);
        hook.add(box(0.5,0.08,0.5,P.dark,0,-0.08,0), tilt(box(0.03,0.38,0.03,P.metal,-0.22,-0.42,0),0,0,0.45), tilt(box(0.03,0.38,0.03,P.metal,0.22,-0.42,0),0,0,-0.45));
        const cargo = named(new THREE.Group(), 'cargo'); cargo.add(box(0.85,0.5,0.9,ORE,0,-0.98,0), box(0.9,0.06,0.95,P.dark,0,-0.5,0)); hook.add(cargo);
        const rotor = named(new THREE.Group(), 'rotor'); rotor.position.set(0,0.55,0.1); rotor.add(box(4.2,0.04,0.22,P.metal), box(0.22,0.04,4.2,P.metal), cyl(0.14,0.1,P.dark,0,-0.02,0,10)); body.add(rotor);
      } else if(f==='hierro'){    // Camión minero de seis ruedas con tolva
        wheels(body, 0.3, 0.26, [-0.62,0.62], [0.85,-0.25,-0.85]);
        body.add(box(1.3,0.28,2.7,P.dark,0,0.35,-0.1));
        cab(body, 1.24, 0.82, 0.86, P.hull, P.glass, 0.6, 0.85); body.add(box(1.26,0.1,0.42,tc,0,1.42,0.66));
        body.add(box(1.36,0.18,0.12,P.metal,0,0.4,1.33), box(0.9,0.3,0.06,0x1e1e1c,0,0.62,1.31));
        body.add(cyl(0.07,0.75,P.metal,0.55,1.1,0.45,8), cyl(0.09,0.06,P.trim,0.55,1.82,0.45,8));
        body.add(profileZ([[-0.82,0],[0.82,0],[0.95,0.64],[-0.98,0.64]], 1.34, P.trim, 0, 0.63, -0.6), box(1.2,0.06,1.7,P.dark,0,1.24,-0.6), box(1.38,0.1,0.1,tc,0,1.18,-1.5));
        const cargo = named(new THREE.Group(), 'cargo'); cargo.add(ball(0.6,ORE,0,1.28,-0.6,1,0.42,1.35)); body.add(cargo);
      } else {                    // Trabajador con saco a la espalda y pico
        soldier(body, f, P, tc, 'trabajador');
        body.add(box(0.24,0.3,0.06,WOOD,0,0.5,-0.14), tilt(box(0.03,0.55,0.03,WOOD,0.2,0.3,0.1),0.5), tilt(box(0.24,0.035,0.045,0x77736a,0.2,0.78,0.25),0.5));
        const cargo = named(new THREE.Group(), 'cargo'); cargo.add(ball(0.17,ORE,0,0.74,-0.22,1,1.15,0.85)); body.add(cargo);
        body.scale.setScalar(1.35);
      }
      break;
    case 'constructor':
      if(f==='atlas'){            // Plataforma de ingeniería con brazo robótico
        wheels(body, 0.26, 0.22, [-0.6,0.6], [0.65,-0.65], P.trim);
        body.add(box(1.25,0.42,1.9,P.hull,0,0.3,0), box(1.27,0.1,1.2,tc,0,0.72,-0.2), box(0.9,0.42,0.6,P.glass,0,0.72,0.55));
        body.add(lamp(1.0,0.05,0.05,P.glow,0,0.5,0.96), cyl(0.18,0.2,P.dark,0,0.82,-0.5,10));
        { const t = named(new THREE.Group(), 'tool'); t.position.set(0,0.92,-0.5); body.add(t);   // brazo robótico con soldador
          t.add(cyl(0.13,0.16,P.dark,0,-0.06,0,12), tilt(box(0.14,0.14,1.2,P.trim,0,0.0,0.42),-0.6), ball(0.1,P.dark,0,0.62,0.78), tilt(box(0.12,0.12,0.8,P.trim,0,0.56,1.08),0.5), lamp(0.12,0.08,0.18,P.glow,0,0.2,1.42)); }
      } else if(f==='hierro'){    // Topadora de orugas con pala frontal
        tracks(body, 2.0, 0.4, 0.5, 0.62, P.dark, true);
        body.add(box(1.0,0.55,1.5,P.hull,0,0.35,-0.15), box(0.8,0.6,0.6,tc,0,0.9,-0.3), box(0.62,0.24,0.04,P.glass,0,1.18,0.0));
        { const t = named(new THREE.Group(), 'tool'); t.position.set(0,0.45,0.55); body.add(t);   // pala que sube y baja
          t.add(profileZ([[0.5,-0.42],[0.66,-0.42],[0.7,0.2],[0.6,0.24],[0.56,-0.1]], 1.75, P.metal, 0, 0, 0), box(0.1,0.1,0.6,P.dark,-0.4,-0.1,0.25), box(0.1,0.1,0.6,P.dark,0.4,-0.1,0.25), box(1.6,0.05,0.06,0x9a958a,0,-0.42,0.66)); }
        body.add(cyl(0.08,0.7,P.metal,0.35,0.9,-0.75,8), cyl(0.1,0.05,P.trim,0.35,1.6,-0.75,8));
      } else {                    // Camión viejo con grúa y herramientas
        wheels(body, 0.28, 0.24, [-0.6,0.6], [0.75,-0.75]);
        body.add(box(1.2,0.3,2.3,P.dark,0,0.3,0)); cab(body, 1.15, 0.7, 0.82, tc, P.glass, 0.6, 0.7);
        body.add(box(1.2,0.25,1.3,P.hull,0,0.6,-0.45), box(0.5,0.35,0.4,WOOD,-0.25,0.85,-0.6), box(0.4,0.25,0.35,0x5f6a3a,0.3,0.85,-0.3));
        body.add(cyl(0.08,0.9,P.metal,0.35,0.85,-0.85,8));
        { const t = named(new THREE.Group(), 'tool'); t.position.set(0.35,1.75,-0.85); body.add(t);   // grúa que gira
          t.add(tilt(box(0.09,0.09,1.4,P.metal,0,-0.2,0.5),-0.6), box(0.03,0.6,0.03,P.metal,0,-0.75,1.05), box(0.14,0.12,0.14,P.dark,0,-0.85,1.05)); }
      }
      break;
    case 'infanteria': soldier(body, f, P, tc, 'soldado'); body.scale.setScalar(1.4); break;
    case 'antitanque': soldier(body, f, P, tc, 'antitanque'); body.scale.setScalar(1.4); break;
    case 'ingeniero':
      soldier(body, f, P, tc, 'ingeniero');
      body.add(box(0.22,0.26,0.12,0x6b6152,0,0.52,-0.17), box(0.22,0.05,0.12,tc,0,0.78,-0.17), tilt(box(0.03,0.36,0.03,P.metal,-0.12,0.58,-0.2),0,0,0.4));
      body.scale.setScalar(1.4); break;
    case 'heroe': {
      soldier(body, f, P, tc, 'heroe');
      body.add(camo(organ('bufanda', [[0.078,0],[0.084,0.03],[0.072,0.055],[0,0.055]], td, 0, 0.86, 0.004, 1, 1, 0.95), f));   // bufanda del equipo
      if(f==='hierro') body.add(cyl(0.1,0.035,P.dark,0,1.035,0,14), box(0.12,0.015,0.07,P.dark,0,1.03,0.085), box(0.08,0.025,0.12,0xf2d16b,-0.16,0.82,0), box(0.08,0.025,0.12,0xf2d16b,0.16,0.82,0));
      else if(f==='guerrilla') body.add(tilt(box(0.05,0.36,0.03,WOOD,0,0.5,0.11),0,0,-0.62));
      else body.add(box(0.1,0.1,0.1,P.trim,0,0.6,-0.15), lamp(0.04,0.04,0.04,P.glow,0,0.72,-0.15));
      const star = named(new THREE.Group(), 'star'); star.position.y = 1.5; star.add(new THREE.Mesh(geo('star',()=>new THREE.OctahedronGeometry(0.16)), glowMat(0xf2d16b))); body.add(star);
      body.scale.setScalar(1.5); break; }
    case 'tanque':
    case 'pesado': {
      const k = e.type==='pesado' ? 1.25 : 1;
      if(f==='atlas'){            // Casco bajo en cuña, torre hexagonal plana y cañón largo
        tracks(body, 2.3*k, 0.4*k, 0.5, 0.7*k, P.dark, true);
        body.add(profileZ([[-1.0*k,0],[0.75*k,0],[1.18*k,0.2],[0.72*k,0.46],[-0.9*k,0.46],[-1.05*k,0.3]], 1.15*k, P.hull, 0, 0.36, 0), box(1.42*k,0.07,0.5,tc,0,0.72,-0.45));
        for(const sx of [-1,1]) body.add(profileZ([[-1.1*k,0],[1.0*k,0],[1.2*k,0.16],[-1.15*k,0.16]], 0.1, P.trim, sx*0.62*k, 0.52, 0));   // faldones
        body.add(lamp(0.9*k,0.04,0.04,P.glow,0,0.66,0.95*k));
        const t = turret(0.82); t.add(tilt(cyl(0.58*k,0.36,P.hull,0,0,-0.1,6),0,Math.PI/6), box(0.6*k,0.08,0.4,tc,0,0.36,-0.35), lamp(0.12,0.08,0.08,P.glow,0.3,0.36,0.25));
        for(const ox of (k>1 ? [-0.17,0.17] : [0])){ const b = barrel(1.9*k,0.075,P.metal); b.position.set(ox,0.18,1.05*k); t.add(b); const m = barrel(0.25,0.11,P.dark); m.position.set(ox,0.18,1.95*k); t.add(m); }
      } else if(f==='hierro'){    // Casco alto en placas, faldones laterales, torre cuadrada remachada
        tracks(body, 2.3*k, 0.46*k, 0.55, 0.72*k, P.dark, false);
        for(const sx of [-1,1]) body.add(box(0.1,0.42,2.2*k,P.hull,sx*(0.98*k),0.22,0));
        body.add(profileZ([[-1.05*k,0],[0.9*k,0],[1.12*k,0.28],[0.85*k,0.62],[-0.95*k,0.62],[-1.1*k,0.38]], 1.35*k, P.hull, 0, 0.28, 0), box(1.37*k,0.1,0.6,tc,0,0.9,-0.55));
        for(let i=0; i<6; i++) body.add(ball(0.035,P.metal,-0.55*k+i*0.22*k,0.88,0.82*k));   // remaches del glacis
        body.add(cyl(0.09,0.5,P.metal,-0.45*k,0.85,-0.95*k,8), cyl(0.09,0.5,P.metal,0.45*k,0.85,-0.95*k,8));
        const t = turret(0.9); t.add(profileZ([[-0.7*k,0],[0.56*k,0],[0.42*k,0.5*k],[-0.64*k,0.52*k]], 1.05*k, P.hull, 0, 0, -0.1), box(1.0*k,0.08,0.45,tc,0,0.5*k,-0.42));
        for(const sx of [-1,1]) for(const sz of [-1,1]) t.add(ball(0.04,P.metal,sx*0.45*k,0.4*k,sz*0.45*k-0.1));
        t.add(cyl(0.1,0.18,P.dark,0.25,0.5*k,-0.2,8), box(0.05,0.05,0.4,GUN,0.25,0.62*k,0.0));
        for(const ox of (k>1 ? [-0.2,0.2] : [0])){ const b = barrel(1.4*k,0.11,P.metal); b.position.set(ox,0.25*k,0.95*k); t.add(b); const m = barrel(0.3,0.16,P.dark); m.position.set(ox,0.25*k,1.65*k); t.add(m); }
      } else {                    // Variante improvisada: casco recuperado con sacos y lonas
        tracks(body, 2.2*k, 0.42*k, 0.5, 0.7*k, P.dark, true);
        body.add(profileZ([[-0.95*k,0],[0.85*k,0],[1.02*k,0.3],[0.8*k,0.55],[-0.95*k,0.55]], 1.2*k, P.hull, 0, 0.3, 0), prism([[-0.5*k,0],[0.5*k,0],[0,0.3]], 0.7, CLOTH, 0, 0.85, -0.55), box(1.22*k,0.1,0.5,tc,0,0.85,0.35));
        const t = turret(0.85); t.add(box(0.95*k,0.42*k,1.0*k,P.trim,0,0,-0.1), box(0.5,0.14,0.3,0x9a8a5c,-0.35,0.42*k,-0.4));
        const b = barrel(1.4*k,0.09,GUN); b.position.set(0,0.22*k,0.9*k); t.add(b);
      }
      break; }
    case 'antiaereo':
      if(f==='atlas'){            // 6x6 con radar y lanzador de misiles
        wheels(body, 0.26, 0.22, [-0.6,0.6], [0.7,0,-0.7], P.trim);
        body.add(box(1.2,0.45,2.1,P.hull,0,0.3,0), box(1.0,0.4,0.6,P.glass,0,0.75,0.7), box(1.22,0.08,0.8,tc,0,0.75,-0.3));
        const t = turret(0.8,-0.3); t.add(box(0.9,0.14,0.9,P.dark), tilt(box(0.8,0.5,0.7,P.hull,0,0.2,0),-0.5));
        for(const sx of [-0.2,0.2]) for(const sy of [0.35,0.55]) t.add(lamp(0.12,0.12,0.04,P.glow,sx,sy,0.27));
        t.add(cyl(0.03,0.5,P.metal,-0.45,0.1,-0.3,6));
        { const sp = named(new THREE.Group(), 'spin'); sp.position.set(-0.45,0.62,-0.3); sp.add(tilt(cyl(0.3,0.04,P.trim,0,0,0,16),0.6), lamp(0.05,0.05,0.05,P.glow,0,0.05,0.1)); t.add(sp); }
      } else if(f==='hierro'){    // Orugas con cuatro cañones automáticos
        tracks(body, 2.0, 0.4, 0.5, 0.65, P.dark, true);
        body.add(box(1.15,0.55,1.9,P.hull,0,0.3,0), box(1.17,0.1,0.6,tc,0,0.85,0.5));
        const t = turret(0.85,-0.2); t.add(box(0.95,0.45,0.85,P.hull), box(0.5,0.25,0.3,P.glass,0,0.2,0.3));
        for(const sx of [-0.32,0.32]) for(const sy of [0.12,0.32]){ const b = barrel(1.1,0.045,GUN); b.rotation.x = Math.PI/2-0.6; b.position.set(sx,sy+0.3,0.35); t.add(b); }
      } else {                    // Camioneta con ametralladora antiaérea doble
        wheels(body, 0.27, 0.22, [-0.55,0.55], [0.7,-0.7]);
        body.add(box(1.1,0.35,2.1,P.hull,0,0.3,0)); cab(body, 1.05, 0.55, 0.78, tc, P.glass, 0.65, 0.55);
        body.add(box(1.12,0.3,1.0,P.trim,0,0.65,-0.5));
        const t = turret(0.95,-0.5); t.add(cyl(0.12,0.3,P.metal,0,0,0,8), box(0.5,0.08,0.3,0x5f6a3a,0,0.3,-0.1));
        for(const sx of [-0.12,0.12]){ const b = barrel(1.0,0.04,GUN); b.rotation.x = Math.PI/2-0.7; b.position.set(sx,0.55,0.25); t.add(b); }
      }
      break;
    case 'avion': {               // Caza aerodinámico: fuselaje ahusado, ala en delta en flecha, canards y doble deriva inclinada
      const fus = lathe([[0,0],[0.24,0.05],[0.3,0.35],[0.34,0.9],[0.34,1.9],[0.3,2.5],[0.2,2.95],[0.08,3.3],[0,3.45]], P.hull, 0, 0, 0, 16);
      fus.rotation.x = Math.PI/2; fus.position.z = -1.6; fus.scale.set(1, 1, 0.82); body.add(fus);              // la sección es algo más ancha que alta
      body.add(ball(0.2, P.glass, 0, 0.22, 0.95, 1, 0.7, 2.6), box(0.08, 0.02, 0.9, P.dark, 0, 0.3, 0.75));        // cabina en burbuja
      const ala = prism([[-0.3,-0.75],[0.3,-0.75],[2.05,0.85],[2.1,1.2],[-2.1,1.2],[-2.05,0.85]], 0.06, P.hull, 0, -0.04, 0, 0.02); ala.rotation.x = -Math.PI/2; body.add(ala);
      const can = prism([[-0.15,-1.25],[0.15,-1.25],[0.75,-0.85],[0.75,-0.7],[-0.75,-0.7],[-0.75,-0.85]], 0.04, P.trim, 0, 0.06, 0, 0.01); can.rotation.x = -Math.PI/2; body.add(can);   // canards
      for(const sx of [-1,1]){
        const der = profileZ([[-1.65,0],[-0.95,0],[-1.3,0.72],[-1.62,0.78]], 0.05, tc, sx*0.3, 0.12, 0, 0.01); der.rotation.z = -sx*0.32; body.add(der);   // derivas inclinadas
        body.add(box(0.18, 0.2, 0.7, P.dark, sx*0.36, -0.14, 0.25), box(0.6, 0.03, 0.18, tc, sx*1.0, 0.0, -0.75));  // tomas de aire y franja en el ala
        const pil = box(0.04, 0.1, 0.4, P.metal, sx*1.15, -0.16, -0.25); body.add(pil);
        const m = barrel(0.75, 0.05, 0xd9dfe3); m.position.set(sx*1.15, -0.2, -0.2); body.add(m);
        body.add(lathe([[0.05,0],[0.03,0.1],[0,0.16]], 0x8a3a2a, sx*1.15, -0.2, 0.17), box(0.12, 0.012, 0.1, P.metal, sx*1.15, -0.2, -0.55));   // misil con aletas
      }
      body.add(cyl(0.22, 0.25, P.metal, 0, -0.02, -1.62, 14)); body.children[body.children.length-1].rotation.x = Math.PI/2;
      body.add(lamp(0.34, 0.2, 0.05, P.glow, 0, -0.1, -1.78));                                                      // tobera
      break; }
    case 'helicoptero': {         // Helicóptero de ataque en tándem con alas cortas y lanzacohetes
      body.add(ball(0.5,P.hull,0,-0.1,0.25,0.85,0.95,1.9), ball(0.28,P.glass,0,0.15,0.9,0.9,0.8,1.2), ball(0.24,P.glass,0,0.25,0.35,0.9,0.8,1.1));
      body.add(box(0.2,0.2,1.9,P.hull,0,-0.05,-1.6), box(0.06,0.6,0.45,tc,0,0.05,-2.5), box(0.6,0.06,0.25,P.dark,0,0.15,-2.3));
      { const tr = named(new THREE.Group(), 'rotor2'); tr.position.set(0.07,0.32,-2.5); tr.add(box(0.03,0.7,0.08,P.metal,0,-0.35,0), box(0.03,0.08,0.7,P.metal,0,-0.04,0)); body.add(tr); }
      body.add(box(1.7,0.08,0.4,P.dark,0,-0.15,0.15), box(0.92,0.12,0.6,tc,0,0.25,-0.15));
      for(const sx of [-0.75,0.75]){ const m = barrel(0.55,0.13,P.metal); m.position.set(sx,-0.25,0.15); body.add(m); }   // lanzacohetes
      body.add(box(0.05,0.05,0.5,GUN,0,-0.6,0.95), cyl(0.07,0.18,P.metal,0,0.4,0.15,10));
      const rotor = named(new THREE.Group(), 'rotor'); rotor.position.set(0,0.6,0.15); rotor.add(box(4.4,0.04,0.24,P.metal), box(0.24,0.04,4.4,P.metal)); body.add(rotor);
      break; }
    case 'tecnico':               // Camioneta artillada (técnica)
      wheels(body, 0.28, 0.24, [-0.6,0.6], [0.72,-0.72]);
      body.add(box(1.15,0.35,2.15,P.hull,0,0.3,0), box(1.17,0.32,1.05,P.trim,0,0.65,-0.5)); cab(body, 1.1, 0.58, 0.84, tc, P.glass, 0.65, 0.55);
      body.add(box(0.3,0.25,0.3,WOOD,-0.35,0.95,-0.85), box(1.2,0.1,0.12,P.metal,0,0.38,1.1));
      { const t = turret(0.95,-0.45); t.add(cyl(0.08,0.35,P.metal,0,0,0,8), box(0.4,0.3,0.05,P.dark,0,0.35,0.15)); const b = barrel(0.9,0.045,GUN); b.position.set(0,0.42,0.45); t.add(b); }
      break;
    case 'artilleria':            // Camión con rampa de cohetes
      wheels(body, 0.28, 0.24, [-0.62,0.62], [0.85,-0.2,-0.85]);
      body.add(box(1.2,0.32,2.4,P.dark,0,0.3,0), box(1.22,0.2,1.4,P.hull,0,0.62,-0.4)); cab(body, 1.15, 0.64, 0.78, tc, P.glass, 0.6, 0.8);
      { const t = turret(0.82,-0.45); t.add(box(0.5,0.2,0.5,P.metal)); const rack = new THREE.Group(); rack.position.set(0,0.35,0); rack.rotation.x = -0.5; rack.add(box(0.95,0.5,1.4,P.trim,0,0,0)); for(let i=0;i<3;i++) for(let j=0;j<2;j++) rack.add(lamp(0.16,0.16,0.04,0x2a2622,-0.3+i*0.3,0.08+j*0.2,0.7)); t.add(rack); }
      break;
    case 'lancha':
    { const hc = f==='guerrilla' ? P.trim : P.hull;
      const bow = new THREE.Mesh(geo('bow1',()=>new THREE.ConeGeometry(0.62,0.9,4)), mat(hc)); bow.rotation.x = Math.PI/2; bow.rotation.y = Math.PI/4; bow.scale.set(1,1,0.45); bow.position.set(0,0.17,1.5);
      body.add(box(1.0,0.35,2.2,hc,0,0,0), bow, box(1.02,0.08,1.6,tc,0,0.3,-0.1)); }
      if(f==='atlas') body.add(box(0.6,0.35,0.7,P.glass,0,0.35,-0.1), lamp(0.5,0.04,0.04,P.glow,0,0.72,0.2));
      else if(f==='hierro') body.add(box(0.75,0.45,0.8,P.dark,0,0.35,-0.25), box(0.5,0.15,0.04,P.glass,0,0.6,0.16));
      else body.add(box(0.5,0.3,0.4,CLOTH,0,0.35,-0.4), box(0.2,0.45,0.25,P.metal,0,-0.1,-1.15));
      { const t = turret(0.4,0.6); t.add(box(0.22,0.22,0.22,P.metal)); const b = barrel(0.7,0.04,GUN); b.position.set(0,0.12,0.35); t.add(b); }
      o.boat = true; break;
    case 'fragata': {
      body.add(box(1.5,0.55,3.6,P.hull,0,0,0), box(1.52,0.1,3.0,tc,0,0.45,-0.2));
      const bow = new THREE.Mesh(geo('bow2',()=>new THREE.ConeGeometry(0.95,1.3,4)), mat(P.hull)); bow.rotation.x = Math.PI/2; bow.rotation.y = Math.PI/4; bow.scale.set(1,1,0.45); bow.position.set(0,0.27,2.4); body.add(bow);
      body.add(box(1.0,0.7,1.2,P.trim,0,0.55,-0.6), box(0.8,0.12,0.06,P.glass,0,1.0,0.0));
      if(f==='atlas') body.add(ball(0.32,0xe6ebef,0,1.55,-0.6), cyl(0.05,0.4,P.metal,0,1.25,-0.6,6), lamp(0.5,0.12,0.5,0x2a3a44,0,0.55,1.2));
      else if(f==='hierro') body.add(box(0.6,0.7,0.6,P.dark,0,1.25,-0.6), cyl(0.15,0.5,P.metal,0,1.25,-1.2,8));
      else body.add(box(0.8,0.4,0.6,WOOD,0,0.55,-1.4), box(0.5,0.3,0.5,CLOTH,0.2,0.95,-1.4), cyl(0.05,1.6,P.metal,0,1.25,-0.6,6));
      const t = turret(0.6,1.0); t.add(box(0.65,0.38,0.65,f==='hierro'?P.dark:P.metal)); const b = barrel(f==='hierro'?1.6:1.4,f==='hierro'?0.1:0.08,GUN); b.position.set(0,0.2,0.8); t.add(b);
      o.boat = true; break; }
    default:
      body.add(box(1.2,0.8,1.6,P.hull,0,0.2,0), box(1.22,0.12,0.6,tc,0,0.8,0));
  }
}
// Detalles comunes de vehículos terrestres, colocados según las medidas reales del casco (sin torre ni ruedas)
const VEHICULOS = new Set(['constructor','tanque','pesado','antiaereo','tecnico','artilleria','recolector']);
function vehicleDetails(e, body, f, P){
  if(!VEHICULOS.has(e.type) || (e.type==='recolector' && f!=='hierro')) return;   // el helicóptero y el trabajador no llevan faros
  const bb = new THREE.Box3(), tmp = new THREE.Box3(); body.updateMatrixWorld(true);
  for(const c of body.children) if(c.isMesh){ tmp.setFromObject(c); bb.union(tmp); }
  if(bb.isEmpty()) return;
  const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y, y = bb.min.y + h*0.5, zf = bb.max.z, zb = bb.min.z, xs = w/2 - 0.2;
  for(const sx of [-1, 1]){
    body.add(box(0.2, 0.13, 0.05, 0x222220, sx*xs, y-0.02, zf-0.01), lamp(0.13, 0.08, 0.03, 0xfff2c8, sx*xs, y, zf+0.02));   // faros
    body.add(lamp(0.1, 0.06, 0.03, 0xff3a2a, sx*(w/2 - 0.16), y, zb-0.015));                                             // luces traseras
  }
  body.add(cyl(0.012, 1.0, 0x2a2a28, xs, bb.max.y - 0.05, zb + 0.3, 5), ball(0.025, 0x2a2a28, xs, bb.max.y + 0.95, zb + 0.3));   // antena
  if(f!=='atlas') for(const k of [0, 1]) body.add(box(0.14, 0.22, 0.1, f==='hierro' ? 0x5a4a2a : 0x5f6a3a, -w/2 - 0.04, y - 0.12, zb + 0.35 + k*0.16));   // bidones
  else body.add(ball(0.09, 0xe6ebef, -xs, bb.max.y, zb + 0.35, 1, 0.6, 1));                                                // sensor
  const t = body.getObjectByName('turret');
  if(t && e.type!=='tecnico' && e.type!=='artilleria'){
    const tb = new THREE.Box3(); for(const c of t.children) if(c.isMesh && c.geometry.type!=='CylinderGeometry'){ tmp.setFromObject(c); tb.union(tmp); }
    if(!tb.isEmpty()){ const top = tb.max.y - t.position.y - 0.01, tx = (tb.max.x - tb.min.x)*0.22;
      t.add(cyl(0.15, 0.05, P.dark, tx, top, -0.15, 12), box(0.1, 0.03, 0.06, P.metal, tx, top+0.05, -0.15));             // escotilla
      for(const px of [-tx, -tx+0.16]) t.add(box(0.07, 0.07, 0.06, 0x2a2a28, px, top, 0.18), lamp(0.05, 0.03, 0.01, P.glass, px, top+0.02, 0.215));   // periscopios
      if(f!=='atlas'){ const mg = barrel(0.4, 0.02, GUN); mg.position.set(tx, top+0.16, 0.1); t.add(mg, box(0.06, 0.1, 0.12, GUN, tx, top+0.05, -0.08)); }   // ametralladora de techo
      else { t.add(box(0.16, 0.1, 0.16, P.dark, tx, top, 0.05)); const mg = barrel(0.32, 0.016, GUN); mg.position.set(tx, top+0.06, 0.25); t.add(mg, lamp(0.03, 0.03, 0.01, P.glow, tx, top+0.12, 0.13)); }   // estación de armas remota
      const tw = (tb.max.x - tb.min.x)/2, tzf = tb.max.z - t.position.z, tzb = tb.min.z - t.position.z, ty = (tb.min.y + tb.max.y)/2 - t.position.y;
      for(const sx of [-1,1]){   // lanzagranadas de humo a los lados de la torre
        for(let i=0; i<3; i++){ const g = barrel(0.14, 0.028, P.dark); g.rotation.set(Math.PI/2 - 0.5, sx*0.5, 0); g.position.set(sx*(tw - 0.02), ty + 0.05 + i*0.055, tzf*0.35 - i*0.02); t.add(g); }
        if(f==='hierro') for(let i=0; i<3; i++) t.add(box(0.09, 0.12, 0.14, 0x4a4438, sx*(tw*0.55 + i*0.02), ty - 0.06, tzf*0.55 - i*0.15));   // bloques de blindaje reactivo
      }
      const yb = tb.min.y - t.position.y + 0.03;
      t.add(box(tw*1.2, 0.02, 0.24, P.dark, 0, yb, tzb - 0.11));                                                       // piso de la cesta trasera
      for(const sx of [-1,1]) t.add(box(0.02, 0.1, 0.24, P.metal, sx*tw*0.6, yb, tzb - 0.11)); t.add(box(tw*1.2, 0.1, 0.02, P.metal, 0, yb, tzb - 0.23));   // barandas
      t.add(box(tw*0.5, 0.11, 0.18, f==='atlas' ? 0x6a747c : 0x5a5236, -tw*0.25, yb + 0.02, tzb - 0.11), cyl(0.05, tw*0.5, 0x4f4a32, tw*0.3, yb + 0.07, tzb - 0.11, 8));   // lona y petate
      t.children[t.children.length-1].rotation.z = Math.PI/2;
      t.add(cyl(0.008, 0.9, 0x2a2a28, -tx*1.2, top, tzb + 0.08, 5));                                                  // segunda antena
    }
  }
  {   // Casco: cables de remolque, herramientas de zapador, eslabones de oruga de repuesto y faldillas
  if(e.type!=='recolector' && e.type!=='constructor'){
    const ys = bb.min.y + h*0.62;
    for(const sx of [-1,1]){ body.add(tilt(box(0.03, 0.03, (zf-zb)*0.55, 0x3a3630, sx*(w/2 - 0.02), ys, (zf+zb)/2), 0, 0, 0)); body.add(box(0.05, 0.05, 0.05, 0x3a3630, sx*(w/2 - 0.02), ys - 0.01, zf - 0.3)); }
    if(e.type==='tanque' || e.type==='pesado') for(let i=0; i<4; i++) body.add(box(0.22, 0.04, 0.1, 0x343230, -0.36 + i*0.24, y + 0.05, zf - 0.08));   // eslabones de repuesto en el frente
    for(const sx of [-1,1]) body.add(box(0.2, 0.18, 0.02, 0x2a2826, sx*(w/2 - 0.18), bb.min.y + 0.02, zb - 0.01));   // faldillas de barro
  }
  }
}
// Fusiona los Mesh hijos directos de cada grupo en una malla con colores por vértice (una para piezas
// iluminadas y otra para luces). Los subgrupos (torre, rotor, carga, estrella) se fusionan por separado
// para conservar su animación.
const VCMAT = {};
function vcMat(glow, kind){
  const tela = kind==='tela', mapT = kind==='camo' ? TEX.camo : TEX.metal, sfx2 = kind==='camo' ? 'camo' : '';
  if(tela && !glow){ const k = 'tela' + OPTIONS.calidad; return VCMAT[k] || (VCMAT[k] = addFog(new THREE.MeshLambertMaterial({ vertexColors:true, map:TEX.cloth }))); }
  const alta = !glow && OPTIONS.calidad==='alta', key = glow ? 'luz' : (alta ? 'alta' : 'normal') + sfx2;
  if(VCMAT[key]) return VCMAT[key];
  if(glow) return (VCMAT[key] = addFog(new THREE.MeshBasicMaterial({ vertexColors:true })));
  if(!alta) return (VCMAT[key] = addFog(new THREE.MeshLambertMaterial({ vertexColors:true, map:mapT })));
  const m = addFog(new THREE.MeshPhongMaterial({ vertexColors:true, map:mapT, bumpMap:TEX.metal, bumpScale:0.012, specular:0x1c1b18, shininess:16 })), fog = m.onBeforeCompile;
  m.onBeforeCompile = sh => { fog(sh);
    sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor.rgb *= texture2D(uFogTex', `{ float rim = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
        gl_FragColor.rgb += vec3(1.0, 0.9, 0.75) * rim*rim*rim * 0.2; }
      gl_FragColor.rgb *= texture2D(uFogTex`); };
  return (VCMAT[key] = m);
}
// Material carbonizado para restos de vehículos (mismo modelo, colores oscurecidos)
const CHAR_MAT = addFog(new THREE.MeshLambertMaterial({ vertexColors:true, map:TEX.metal, color:0x3b3733 }));
// Ruido suave por posición (solo render) para manchas de camuflaje
const camoNoise = (x, y, z) => Math.sin(x*9.1 + Math.sin(z*7.3)*1.6) * Math.sin(z*8.7 + Math.sin(y*11.0)*1.4) + Math.sin((x+y)*13.0 + z*5.0)*0.35;
const DUST = new THREE.Color(0x8a7456), TMPC = new THREE.Color(), CAMO_C = [new THREE.Color(), new THREE.Color()];
// opt: { y0: altura del grupo sobre el suelo, polvo: 0..1, camo: escala del patrón }
function mergeMeshes(list, opt){
  const parts = list.map(m => { m.updateMatrix(); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix); return { g, c:m.material.color, camo:m.userData.camo }; });
  const n = parts.reduce((a,p) => a + p.g.attributes.position.count, 0);
  const pos = new Float32Array(n*3), nor = new Float32Array(n*3), col = new Float32Array(n*3), uv = new Float32Array(n*2);
  let k = 0;
  const y0 = opt ? opt.y0 || 0 : 0, polvo = opt ? opt.polvo || 0 : 0, cs = opt && opt.camo ? opt.camo : 1, uvs = opt && opt.uv ? opt.uv : 0.6;
  for(const { g, c, camo } of parts){
    const cnt = g.attributes.position.count, P = g.attributes.position.array, N = g.attributes.normal.array;
    pos.set(P, k*3); nor.set(N, k*3);
    if(camo){ CAMO_C[0].setHex(camo[0]); CAMO_C[1].setHex(camo[1]); }
    for(let i=0; i<cnt; i++){
      TMPC.copy(c);
      if(camo){ const n = camoNoise(P[i*3]*cs, P[i*3+1]*cs, P[i*3+2]*cs); if(n > 0.32) TMPC.lerp(CAMO_C[0], 0.85); else if(n < -0.42) TMPC.lerp(CAMO_C[1], 0.7); }
      if(polvo){ const h = P[i*3+1] + y0; if(h < 0.6) TMPC.lerp(DUST, Math.min(0.8, polvo*(0.6-h)*1.3)); if(N[i*3+1] < -0.5) TMPC.multiplyScalar(0.62); }   // polvo abajo y sombra en caras inferiores
      col[(k+i)*3] = TMPC.r; col[(k+i)*3+1] = TMPC.g; col[(k+i)*3+2] = TMPC.b;
      // Proyección por el eje dominante de la normal: escala de textura uniforme (0,6 repeticiones por unidad)
      const ax = Math.abs(N[i*3]), ay = Math.abs(N[i*3+1]), az = Math.abs(N[i*3+2]);
      const [u, v] = ax >= ay && ax >= az ? [P[i*3+2], P[i*3+1]] : ay >= az ? [P[i*3], P[i*3+2]] : [P[i*3], P[i*3+1]];
      uv[(k+i)*2] = u*uvs; uv[(k+i)*2+1] = v*uvs;
    }
    k += cnt; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos,3)); out.setAttribute('normal', new THREE.BufferAttribute(nor,3)); out.setAttribute('color', new THREE.BufferAttribute(col,3)); out.setAttribute('uv', new THREE.BufferAttribute(uv,2));
  out.computeBoundingSphere();
  return out;
}
function mergeGroup(g, opt, y0=0){
  const lit = [], glow = [], vid = [];
  for(const c of g.children.slice()){
    if(c.isMesh){ (c.material.userData.ventana ? vid : c.material.userData.glow ? glow : lit).push(c); g.remove(c); }
    else mergeGroup(c, opt, y0 + c.position.y);
  }
  if(lit.length){ const m = new THREE.Mesh(mergeMeshes(lit, opt ? Object.assign({}, opt, { y0 }) : null), vcMat(false, opt && opt.mat)); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  if(glow.length) g.add(new THREE.Mesh(mergeMeshes(glow), vcMat(true)));
  if(vid.length) g.add(new THREE.Mesh(mergeMeshes(vid), WIN_MAT[0]));
}
const UNIT_PROTO = new Map();
// Atlas en campaña: gris arena y verde grisáceo en lugar del blanco de sus edificios
const PAL_UNIT = { atlas:{ hull:0xa6a898, dark:0x4c534e, trim:0x767d72, glass:0x86d6f2, glow:0x6fe3ff, metal:0x30353a } };
// Nivel de detalle global de las unidades: simplificado con la cámara alejada (con margen para no alternar) o en calidad Media y Baja
let LOD_LO = false;
// Pasa al grupo padre las piezas de los subgrupos sin animación (y los ejes de ruedas), con su transformación aplicada
const ANIMADOS = new Set(['turret','rotor','rotor2','cargo','star','spin','tool','cable','hook','winch','beam','gatling','leg']);   // de lejos la pantorrilla se fusiona con la pierna
function flattenStatic(g){
  for(const c of g.children.slice()){
    if(c.isMesh) continue;
    flattenStatic(c);
    if(ANIMADOS.has(c.name)) continue;
    c.updateMatrix();
    for(const m of c.children.slice()){ m.updateMatrix(); m.matrix.premultiply(c.matrix); m.matrix.decompose(m.position, m.quaternion, m.scale); g.add(m); }
    g.remove(c);
  }
}
function updateLod(){
  // De cerca se usa el modelo detallado, salvo que haya muchas unidades en pantalla (batallas grandes)
  let cerca = 0; const rr = cam.dist*0.9;
  for(const e of S.ents) if(e.kind==='unit' && !e.dead && Math.abs(e.x - cam.x) < rr && Math.abs(e.z - cam.z) < rr*0.75) cerca++;
  const want = OPTIONS.calidad!=='alta' || cam.dist > (LOD_LO ? 29 : 33) || cerca > (LOD_LO ? 35 : 45);
  if(want === LOD_LO) return;
  LOD_LO = want;
  for(const [id, o] of meshes){ const e = S.byId.get(id); if(!e || e.kind!=='unit' || e.dead) continue;
    const ty = o.turret ? o.turret.rotation.y : 0;
    if(o.outlines){ for(const c of o.outlines) c.parent && c.parent.remove(c); o.outlines = null; }
    o.g.remove(o.body); o.body = unitBody(e, o); o.g.add(o.body); o.born = 0;
    if(o.turret) o.turret.rotation.y = ty; }
}
function unitBody(e, o){
  const f = S.players[e.owner].faction, key = `${e.type}|${f}|${TEAM[e.owner]}|${TEAM_DARK[e.owner]}|${LOD_LO ? 'lo' : 'hi'}`;
  if(!UNIT_PROTO.has(key)){
    DETAIL_LO = LOD_LO;
    const body = new THREE.Group(), tmp = {};
    const keep = PAL[f]; if(PAL_UNIT[f]) PAL[f] = PAL_UNIT[f];   // las unidades usan la paleta de campaña (los edificios conservan la suya)
    try { TINT = null; unitModel(e, tmp, body); vehicleDetails(e, body, f, PAL[f]); } finally { PAL[f] = keep; }
    const veh = VEHICULOS.has(e.type) && !(e.type==='recolector' && f==='guerrilla'), inf = UT(e.owner,e.type).armor==='inf';
    if(LOD_LO) flattenStatic(body);   // vista alejada: ruedas y piezas fijas en una sola malla (menos llamadas de dibujo)
    mergeGroup(body, { polvo: e.air ? 0 : veh ? 1 : 0.35, mat: inf ? 'tela' : (veh || UT(e.owner,e.type).naval) ? 'camo' : '', uv: inf ? 2.6 : 0.6 });
    DETAIL_LO = false;
    if(LOD_LO && inf) body.traverse(m => { if(m.isMesh) m.castShadow = false; });   // de lejos la sombra de un soldado no se distingue y duplica el dibujo
    UNIT_PROTO.set(key, { body, boat:!!tmp.boat });
  }
  const p = UNIT_PROTO.get(key), body = p.body.clone();
  o.turret = body.getObjectByName('turret') || null; o.rotor = body.getObjectByName('rotor') || null;
  o.cargo = body.getObjectByName('cargo') || null; o.star = body.getObjectByName('star') || null;
  o.rotor2 = body.getObjectByName('rotor2') || null; o.spin = body.getObjectByName('spin') || null;
  o.tool = body.getObjectByName('tool') || null; o.cable = body.getObjectByName('cable') || null; o.hook = body.getObjectByName('hook') || null;
  o.fac = f;
  o.axles = []; o.legs = []; o.shins = [];
  body.traverse(c => { if(c.name==='axle') o.axles.push(c); else if(c.name==='leg') o.legs.push(c); else if(c.name==='shin') o.shins.push(c); });
  if(o.turret) o.turret.userData.base = o.turret.position.clone();
  o.walk = 0; o.recoil = 0; o.dustT = 0; o.born = S.tick > 1 ? performance.now() : 0;
  if(p.boat) o.boat = true;
  return body;
}

// ======================= MODELOS DE EDIFICIOS POR FACCIÓN =======================
// Formas: prismas con perfil extruido y bisel (techos, taludes, hangares) y piezas de revolución
// (torres de enfriamiento, silos, cúpulas), para evitar el aspecto de cajas.
//   Atlas: compuesto claro, vidrio cian, cúpulas, antenas y luces.   Hierro: concreto en talud, chimeneas
//   con humo, franjas de peligro y acero oscuro.   Guerrilla: sacos terreros, láminas corrugadas, lonas y tambores.
PAL.neutral = { hull:0x8a8070, dark:0x4f4a40, trim:0x6b6152, glass:0x9fb8c0, glow:0xe8d27a, metal:0x3a3a34 };
// Prisma: perfil en el plano XY extruido a lo largo de Z, con bisel
function prism(pts, depth, color, x=0, y=0, z=0, bevel=0.03){
  if(DETAIL_LO) bevel = 0;
  const g = geo('pr' + pts.map(p => p.map(v => v.toFixed(2)).join(':')).join(',') + '|' + depth.toFixed(2) + '|' + bevel, () => {
    const sh = new THREE.Shape(); pts.forEach(([a,b], i) => i ? sh.lineTo(a,b) : sh.moveTo(a,b));
    const d = Math.max(0.01, depth - bevel*2);
    const eg = new THREE.ExtrudeGeometry(sh, { depth:d, bevelEnabled:bevel>0, bevelThickness:bevel, bevelSize:bevel, bevelSegments:2, curveSegments:6 });
    eg.translate(0, 0, -d/2); eg.computeVertexNormals(); return eg;
  });
  const m = new THREE.Mesh(g, mat(color)); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; return m;
}
// Perfil lateral (z, y) extruido a lo ancho (eje X): cascos de vehículos y naves industriales
function profileZ(pts, width, color, x=0, y=0, z=0, bevel=0.03){ const m = prism(pts, width, color, x, y, z, bevel); m.rotation.y = -Math.PI/2; return m; }
// Pieza de revolución: lista de [radio, altura]
function lathe(pts, color, x=0, y=0, z=0, seg=24){
  if(DETAIL_LO) seg = 8;
  const g = geo('la' + pts.map(p => p.map(v => v.toFixed(2)).join(':')).join(',') + seg, () => new THREE.LatheGeometry(pts.map(([r,h]) => new THREE.Vector2(r,h)), seg));
  const m = new THREE.Mesh(g, mat(color)); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; return m;
}
const gable = (w, d, h, color, x=0, y=0, z=0) => prism([[-w/2,0],[w/2,0],[0,h]], d, color, x, y, z, 0.02);           // tejado a dos aguas (cumbrera en Z)
const archRoof = (w, d, h, color, x=0, y=0, z=0) => { const pts = []; for(let i=0; i<=12; i++){ const a = Math.PI*i/12; pts.push([Math.cos(a)*w/2, Math.sin(a)*h]); } return prism(pts, d, color, x, y, z, 0.02); };
const talud = (w, d, h, k, color, x=0, y=0, z=0) => prism([[-w/2,0],[w/2,0],[w/2-k,h],[-w/2+k,h]], d, color, x, y, z, 0.03);   // muro con talud
function smokeAt(body, x, y, z){ (body.userData.smoke = body.userData.smoke || []).push([x, y, z]); }
function sandbags(body, cx, cz, r, a0, a1, y=0, rows=2){
  for(let row=0; row<rows; row++){ const n = Math.max(3, Math.round((a1-a0)*r/0.5)); for(let i=0; i<n; i++){ const a = a0 + (a1-a0)*(i+(row%2)*0.5)/n; body.add(tilt(box(0.5,0.22,0.3,row%2 ? 0x9a8a5c : 0x8f7f52, cx+Math.cos(a)*r, y+row*0.2, cz+Math.sin(a)*r), 0, -a+Math.PI/2)); } }
}
function corrugated(body, w, d, color, x, y, z, rx=0){   // lámina corrugada: canales alternos
  const n = Math.max(3, Math.round(w/0.22));
  for(let i=0; i<n; i++) body.add(tilt(box(w/n*0.98, 0.05, d, i%2 ? color : 0x6f6a5e, x-w/2+(i+0.5)*w/n, y+(i%2)*0.03, z), rx));
}
function drums(body, x, z, n, color){ for(let i=0; i<n; i++) body.add(cyl(0.2,0.55,color,x+(i%2)*0.42,0,z+Math.floor(i/2)*0.42,12), cyl(0.205,0.04,0x2a2622,x+(i%2)*0.42,0.38,z+Math.floor(i/2)*0.42,12)); }
function hazard(body, w, x, y, z){ const n = Math.max(2, Math.round(w/0.35)); for(let i=0; i<n; i++) body.add(box(w/n*0.96,0.06,0.12, i%2 ? 0xd9b23a : 0x24221f, x-w/2+(i+0.5)*w/n, y, z)); }
// Base del edificio según la facción
function pad(body, f, P, tc, s){
  if(f==='atlas'){
    body.add(box(s*0.98,0.16,s*0.98,0xbcc2c6), box(s*0.99,0.04,0.14,tc,0,0.12,s*0.49));
    for(const sx of [-1,1]) for(const sz of [-1,1]) body.add(lamp(0.14,0.05,0.14,P.glow,sx*s*0.45,0.16,sz*s*0.45));
  } else if(f==='hierro'){
    body.add(talud(s, s, 0.28, 0.14, 0x6d6862)); hazard(body, s*0.8, 0, 0.28, s/2-0.12);
  } else if(f==='guerrilla'){
    body.add(lathe([[0,0],[s*0.5,0],[s*0.46,0.1],[s*0.28,0.16],[0,0.18]], 0xab946c));
  } else body.add(box(s*0.9,0.2,s*0.9,P.dark));
}
// Ventanas: franja de vidrio (Atlas brilla, el resto es vidrio opaco)
// Ventana en una cara: (cx, cy, cz) es el centro inferior sobre la superficie y (nx, nz) la normal de la cara.
function win(body, f, P, ww, wh, cx, cy, cz, nx, nz){
  const rot = nx ? Math.PI/2 : 0, at = k => [cx + nx*k, cz + nz*k];
  const marco = f==='atlas' ? P.dark : f==='hierro' ? P.metal : WOOD;
  const add = (m, k) => { const [x, z] = at(k); m.position.x = x; m.position.z = z; body.add(tilt(m, 0, rot)); };
  add(box(ww+0.08, wh+0.08, 0.03, marco, 0, cy-0.04, 0), 0.015);
  if(f==='atlas'){ add(pane(ww, wh, 0.03, 0, cy, 0), 0.03); add(box(0.025, wh, 0.04, marco, 0, cy, 0), 0.04); add(box(ww, 0.02, 0.04, marco, 0, cy + wh*0.62, 0), 0.04); }   // vidrio, parteluz y travesaño
  else if(f==='hierro'){ add(lamp(ww, wh, 0.03, 0xa8743e, 0, cy, 0), 0.03); add(box(ww+0.16, 0.05, 0.14, P.metal, 0, cy+wh+0.02, 0), 0.07); }   // aspillera con visera
  else { add(box(ww, wh, 0.03, 0x2e2c26, 0, cy, 0), 0.03); add(box(ww*0.45, wh*0.9, 0.035, CLOTH, 0, cy+wh*0.05, 0), 0.04); add(box(0.03, wh, 0.045, marco, 0, cy, 0), 0.045); }
  add(box(ww+0.14, 0.04, 0.1, marco, 0, cy-0.06, 0), 0.04);                                                  // alféizar
}
// Fachada de un volumen con las mismas medidas que box(w, h, d, …, x, y, z): ventanas en el frente (+z) y, si se pide,
// en los costados; puerta al centro del frente y equipos en el techo.
function facade(body, f, P, w, h, d, x, y, z, o = {}){
  const zf = z + d/2, rows = o.rows ?? Math.max(1, Math.floor(h/0.8)), wh = f==='hierro' ? 0.14 : 0.3;
  const cols = o.cols ?? Math.max(2, Math.round(w/0.85)), ww = Math.min(0.5, w/cols*0.5);
  for(let r=0; r<rows; r++){ const cy = y + h*(r+1)/(rows+1) - wh*0.6;
    for(let c=0; c<cols; c++){ const px = x - w/2 + (c+0.5)*w/cols; if(o.door && r===0 && Math.abs(px-x) < 0.65) continue; win(body, f, P, ww, wh, px, cy, zf, 0, 1); }
    if(o.sides){ const n = Math.max(1, Math.round(d/1.1)); for(let c=0; c<n; c++){ const pz = z - d/2 + (c+0.5)*d/n; for(const sx of [-1, 1]) win(body, f, P, ww, wh, x + sx*w/2, cy, pz, sx, 0); } }
  }
  if(o.door){
    if(f==='atlas') body.add(box(1.0, 1.08, 0.04, P.dark, x, y, zf+0.01), pane(0.42, 0.98, 0.03, x-0.22, y, zf+0.03), pane(0.42, 0.98, 0.03, x+0.22, y, zf+0.03), box(1.3, 0.06, 0.4, P.trim, x, y+1.12, zf+0.2));
    else if(f==='hierro'){ body.add(box(1.05, 1.0, 0.06, P.metal, x, y, zf+0.02), lamp(0.1, 0.1, 0.04, 0xff4a3a, x+0.62, y+0.9, zf+0.03)); for(let i=0; i<4; i++) body.add(box(1.0, 0.03, 0.03, 0x1e1c1a, x, y+0.2+i*0.22, zf+0.05)); hazard(body, 1.2, x, y+1.02, zf+0.06); }
    else { body.add(box(0.85, 1.0, 0.05, WOOD, x, y, zf+0.02)); for(let i=-1; i<=1; i++) body.add(box(0.03, 0.98, 0.06, 0x4a3420, x+i*0.27, y, zf+0.03)); }
  }
  if(o.roof){ const ty = y + h;
    if(f==='atlas') body.add(box(0.6, 0.3, 0.5, 0xb9c0c5, x+w*0.25, ty, z-d*0.2), cyl(0.18, 0.06, P.dark, x+w*0.25, ty+0.3, z-d*0.2, 12), box(0.5, 0.04, 0.5, 0x2a3a50, x-w*0.25, ty, z-d*0.15));
    else if(f==='hierro') body.add(cyl(0.12, 0.45, P.metal, x+w*0.3, ty, z-d*0.25, 8), cyl(0.2, 0.06, P.dark, x+w*0.3, ty+0.45, z-d*0.25, 8), box(0.7, 0.3, 0.45, P.dark, x-w*0.2, ty, z-d*0.2));
    else body.add(cyl(0.28, 0.5, 0x5f6a3a, x+w*0.28, ty, z-d*0.2, 12), box(0.06, 0.6, 0.06, WOOD, x-w*0.3, ty, z), box(0.5, 0.03, 0.4, 0x2a3a50, x-w*0.3, ty+0.6, z));
  }
}

// Ambientación de la losa: llena el espacio libre alrededor de la estructura con objetos de la facción (postes de luz,
// gabinetes y cajas en Atlas; sacos terreros, erizos, bidones, reflectores y barreras en Hierro; llantas, cajas de
// madera, lonas, alambre y tinaco en la Guerrilla). Solo render. Las piezas van directo al cuerpo (sin grupos) para que
// mergeGroup las fusione en la misma malla; la rotación se aplica a mano en múltiplos de 90°.
function ambientar(body, e, f, P, tc, s, desde){
  // Ocupación real: grilla de 0,25 con la huella de cada pieza (las calcomanías planas del suelo no cuentan)
  const h2 = s/2, b = new THREE.Box3(), RES = 0.25, NG = Math.ceil(s/RES), ocup = new Uint8Array(NG*NG), caja = new THREE.Box3();
  const celda = v => Math.max(0, Math.min(NG - 1, Math.floor((v + h2)/RES)));
  for(let i=desde; i<body.children.length; i++){
    b.setFromObject(body.children[i]); if(b.isEmpty() || b.max.y < 0.32) continue;
    caja.union(b);
    for(let z=celda(b.min.z - 0.2); z<=celda(b.max.z + 0.2); z++) for(let x=celda(b.min.x - 0.2); x<=celda(b.max.x + 0.2); x++) ocup[z*NG + x] = 1;
  }
  if(caja.isEmpty()) return;
  const ocupado = (x, z, r) => { for(let zz=celda(z - r); zz<=celda(z + r); zz++) for(let xx=celda(x - r); xx<=celda(x + r); xx++) if(ocup[zz*NG + xx]) return true; return false; };
  // Generador con semilla por tipo y facción: el mismo edificio siempre se ve igual
  let sem = 0; for(const c of e.type + f) sem = (sem*31 + c.charCodeAt(0)) | 0;
  const R = mulberry32(sem >>> 0), rr = (a, b2) => a + (b2 - a)*R();
  const libre = (x, z, r) => {
    if(x < -h2 + r + 0.15 || x > h2 - r - 0.15 || z < -h2 + r + 0.15 || z > h2 - r - 0.15) return false;
    if(ocupado(x, z, r)) return false;                                                                                                // estructura
    if(Math.abs(x) > h2 - 1.25 && Math.abs(z) > h2 - 1.25) return false;                                                            // esquinas: mejoras y banderas
    if(Math.abs(x) < 0.9 && z > caja.max.z) return false;                                                                             // paso frente a la puerta
    return !puestos.some(p => (p.x - x)*(p.x - x) + (p.z - z)*(p.z - z) < (p.r + r)*(p.r + r));
  };
  const puestos = [];
  // Coloca una pieza (malla) desplazada (dx, dz) desde el centro del objeto y girada yaw
  const poner = (x, z, yaw, m, dx=0, dz=0) => { const c = Math.cos(yaw), sn = Math.sin(yaw); m.position.x = x + dx*c + dz*sn; m.position.z = z - dx*sn + dz*c; m.rotation.y += yaw; body.add(m); };
  const Y = 0.16;
  const KIT = {
    atlas: [
      [2, 0.25, (x, z, a) => { poner(x, z, a, cyl(0.035, 1.7, P.metal, 0, Y, 0, 8)); poner(x, z, a, box(0.32, 0.05, 0.12, P.dark, 0, Y + 1.7, 0), 0.1); poner(x, z, a, lamp(0.24, 0.02, 0.08, 0xfff1d0, 0, Y + 1.68, 0), 0.12); }],   // poste de luz
      [2, 0.35, (x, z, a) => { poner(x, z, a, box(0.5, 0.65, 0.32, 0xdfe4e7, 0, Y, 0)); poner(x, z, a, lamp(0.28, 0.16, 0.01, P.glow, 0, Y + 0.38, 0), 0, 0.165); poner(x, z, a, box(0.52, 0.05, 0.34, tc, 0, Y + 0.65, 0)); }],   // gabinete
      [3, 0.4, (x, z, a) => { const n = 1 + Math.floor(R()*2); for(let i=0; i<n; i++){ poner(x, z, a, box(0.55, 0.42, 0.5, i ? 0xb9c0c5 : 0xcfd5d9, 0, Y + i*0.43, 0), i*0.05); poner(x, z, a, box(0.57, 0.06, 0.52, tc, 0, Y + 0.18 + i*0.43, 0), i*0.05); } }],   // cajas
      [1, 0.4, (x, z, a) => { poner(x, z, a, box(0.7, 0.08, 0.7, 0x58636c, 0, Y, 0)); poner(x, z, a, cyl(0.05, 0.9, P.metal, 0, Y, 0, 8)); const d = new THREE.Mesh(geo('platoAmb', () => new THREE.SphereGeometry(0.38, 12, 6, 0, Math.PI*2, 0, Math.PI/2.4)), mat(0xe6ebef)); d.rotation.x = Math.PI*0.7; d.position.y = Y + 1.0; poner(x, z, a, d); }],   // antena
      [1, 0.45, (x, z, a) => { poner(x, z, a, box(0.9, 0.04, 0.6, 0x2f3a46, 0, Y + 0.45, 0)); poner(x, z, a, tilt(box(0.85, 0.03, 0.55, 0x23364a, 0, Y + 0.5, 0), -0.4), 0, 0); poner(x, z, a, box(0.05, 0.45, 0.05, P.metal, 0, Y, 0)); }]   // panel solar suelto
    ],
    hierro: [
      [3, 0.55, (x, z, a) => { for(let i=0; i<3; i++) for(let j=0; j<2 - (i===1 ? 0 : 0); j++) poner(x, z, a, box(0.36, 0.17, 0.22, 0x8a7c5c, 0, Y + j*0.17, 0), -0.38 + i*0.38 + (j ? 0.18 : 0), 0); }],   // sacos terreros
      [2, 0.4, (x, z, a) => { for(const r of [0, 1.05, 2.1]) poner(x, z, a, tilt(box(0.07, 0.9, 0.07, 0x3a3836, 0, Y, 0), 0.75, r, 0)); }],   // erizo antitanque
      [2, 0.4, (x, z, a) => { for(let i=0; i<3; i++) poner(x, z, a, cyl(0.17, 0.5, i%2 ? 0x5a4a3a : 0x4f5a3a, 0, Y, 0, 12), (i%2)*0.36 - 0.18, Math.floor(i/2)*0.34 - 0.1); }],   // bidones
      [1, 0.35, (x, z, a) => { poner(x, z, a, box(0.12, 2.3, 0.12, P.metal, 0, Y, 0)); poner(x, z, a, box(0.6, 0.06, 0.08, P.metal, 0, Y + 2.2, 0)); for(const dx of [-0.2, 0.2]){ poner(x, z, a, box(0.2, 0.18, 0.14, 0x2e2c2a, 0, Y + 2.26, 0), dx, 0.05); poner(x, z, a, lamp(0.15, 0.13, 0.02, 0xfff0c0, 0, Y + 2.28, 0), dx, 0.13); } }],   // torre de reflectores
      [2, 0.6, (x, z, a) => poner(x, z, a, talud(1.2, 0.35, 0.5, 0.12, 0x9a948a, 0, Y, 0))],   // barrera de concreto
      [2, 0.35, (x, z, a) => { for(let i=0; i<2; i++){ poner(x, z, a, box(0.6, 0.28, 0.34, 0x4f5a3a, 0, Y + i*0.29, 0), 0, i*0.04); poner(x, z, a, box(0.62, 0.04, 0.36, 0xb8a050, 0, Y + 0.12 + i*0.29, 0), 0, i*0.04); } }]   // cajas de munición
    ],
    guerrilla: [
      [2, 0.35, (x, z, a) => { const n = 2 + Math.floor(R()*3); for(let i=0; i<n; i++) poner(x, z, a, cyl(0.27, 0.13, RUBBER, 0, Y + i*0.13, 0, 14), rr(-0.03, 0.03), rr(-0.03, 0.03)); }],   // llantas
      [3, 0.4, (x, z, a) => { const n = 1 + Math.floor(R()*3); for(let i=0; i<n; i++){ const dx = i===2 ? 0.1 : i*0.55 - 0.25, y = i===2 ? 0.4 : 0; poner(x, z, a, box(0.5, 0.4, 0.4, i%2 ? 0x7a5a36 : WOOD, 0, Y + y, 0), dx, 0); poner(x, z, a, box(0.52, 0.05, 0.42, 0x4a3420, 0, Y + y + 0.2, 0), dx, 0); } }],   // cajas de madera
      [2, 0.3, (x, z, a) => { for(let i=0; i<4; i++) poner(x, z, a, box(0.16, 0.3, 0.26, i%2 ? 0x5f6a3a : 0x8a2f24, 0, Y, 0), -0.27 + i*0.18, 0); }],   // bidones de gasolina
      [2, 0.55, (x, z, a) => { poner(x, z, a, box(0.9, 0.35, 0.7, 0x6b5a40, 0, Y, 0)); poner(x, z, a, tilt(box(1.05, 0.03, 0.85, 0x5f6a3a, 0, Y + 0.38, 0), 0.08, 0, 0.06)); }],   // pila cubierta con lona
      [1, 0.6, (x, z, a) => { for(const dx of [-0.55, 0, 0.55]) poner(x, z, a, cyl(0.035, 0.7, WOOD, 0, Y, 0, 6), dx, 0); for(const y of [0.25, 0.45, 0.62]) poner(x, z, a, box(1.15, 0.015, 0.015, 0x6a6a62, 0, Y + y, 0)); }],   // alambre de púas
      [1, 0.45, (x, z, a) => { for(const [dx, dz] of [[-0.25,-0.25],[0.25,-0.25],[-0.25,0.25],[0.25,0.25]]) poner(x, z, a, box(0.06, 0.8, 0.06, WOOD, 0, Y, 0), dx, dz); poner(x, z, a, box(0.7, 0.05, 0.7, WOOD, 0, Y + 0.8, 0)); poner(x, z, a, cyl(0.32, 0.6, 0x2f3a44, 0, Y + 0.85, 0, 16)); }],   // tinaco
      [1, 0.45, (x, z, a) => { for(let i=0; i<5; i++) poner(x, z, a, tilt(cyl(0.07, 0.8, 0x5a4026, 0, Y + 0.07 - 0.4 + (i>2 ? 0.13 : 0), 0, 7), 0, 0, Math.PI/2), 0, -0.2 + (i%3)*0.14); }]   // leña
    ]
  };
  // Techos planos libres (cajas de 1,5 m² o más, a 0,9 o más de altura y sin nada encima): equipos según la facción
  const TECHO = {
    atlas: [
      (x, y, z, a) => { poner(x, z, a, box(0.55, 0.3, 0.45, 0xe6ebef, 0, y, 0)); poner(x, z, a, cyl(0.16, 0.04, 0x30353a, 0, y + 0.3, 0, 14), 0.05); },   // aire acondicionado
      (x, y, z, a) => { for(const dx of [-0.32, 0.32]){ poner(x, z, a, box(0.05, 0.18, 0.05, P.metal, 0, y, 0), dx, 0.15); poner(x, z, a, tilt(box(0.58, 0.03, 0.5, 0x23364a, 0, y + 0.16, 0), -0.35), dx, 0); } },   // paneles solares
      (x, y, z, a) => { poner(x, z, a, cyl(0.03, 1.1, P.metal, 0, y, 0, 6)); poner(x, z, a, lamp(0.06, 0.06, 0.06, 0xff4a3a, 0, y + 1.1, 0)); poner(x, z, a, box(0.3, 0.02, 0.02, P.metal, 0, y + 0.8, 0)); },   // antena
      (x, y, z, a) => { const d = new THREE.Mesh(geo('domoTecho', () => new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI*2, 0, Math.PI/2)), mat(0xf2f4f5)); d.position.y = y + 0.08; poner(x, z, a, box(0.5, 0.08, 0.5, P.trim, 0, y, 0)); poner(x, z, a, d); }   // domo de sensores
    ],
    hierro: [
      (x, y, z, a) => { poner(x, z, a, box(0.6, 0.35, 0.5, 0x6d6862, 0, y, 0)); for(let i=0; i<3; i++) poner(x, z, a, box(0.5, 0.03, 0.02, 0x2e2c2a, 0, y + 0.08 + i*0.09, 0), 0, 0.26); },   // ventilación con rejilla
      (x, y, z, a) => { poner(x, z, a, cyl(0.1, 0.7, 0x4a4642, 0, y, 0, 10)); poner(x, z, a, cyl(0.13, 0.06, 0x2e2c2a, 0, y + 0.7, 0, 10)); },   // chimenea de extracción
      (x, y, z, a) => { poner(x, z, a, tilt(box(0.9, 0.18, 0.18, 0x7a7469, 0, y, 0), 0, 0, 0), 0, 0); poner(x, z, a, box(0.2, 0.4, 0.2, 0x7a7469, 0, y, 0), 0.45, 0); },   // ducto
      (x, y, z, a) => { for(let i=0; i<4; i++) poner(x, z, a, box(0.32, 0.16, 0.2, 0x8a7c5c, 0, y, 0), -0.48 + i*0.32, 0); poner(x, z, a, box(0.1, 0.5, 0.1, GUN, 0, y, 0), 0, -0.15); }   // nido de sacos
    ],
    guerrilla: [
      (x, y, z, a) => { poner(x, z, a, cyl(0.3, 0.55, 0x2a2e30, 0, y, 0, 14)); poner(x, z, a, cyl(0.12, 0.05, 0x2a2e30, 0, y + 0.55, 0, 10)); },   // tinaco
      (x, y, z, a) => { for(let i=0; i<2; i++) poner(x, z, a, cyl(0.24, 0.11, RUBBER, 0, y + i*0.11, 0, 12), i*0.5 - 0.25, 0); },   // llantas que sujetan la lámina
      (x, y, z, a) => { poner(x, z, a, cyl(0.03, 0.6, P.metal, 0, y, 0, 6)); const d = new THREE.Mesh(geo('platoGuerrilla', () => new THREE.SphereGeometry(0.3, 10, 5, 0, Math.PI*2, 0, Math.PI/2.5)), mat(0x9a948a)); d.rotation.x = Math.PI*0.65; d.position.y = y + 0.65; poner(x, z, a, d); },   // antena satelital
      (x, y, z, a) => { poner(x, z, a, box(0.5, 0.3, 0.4, WOOD, 0, y, 0)); poner(x, z, a, tilt(box(0.62, 0.02, 0.52, 0x5f6a3a, 0, y + 0.31, 0), 0.06), 0, 0); }   // caja cubierta
    ]
  };
  const tk = TECHO[f];
  if(tk){
    const bb = new THREE.Box3(), cajas = [];
    for(let i=desde; i<body.children.length; i++){ const c = body.children[i]; if(c.isMesh) { bb.setFromObject(c); cajas.push([c, bb.clone()]); } }
    for(const [c, t] of cajas){
      if(!c.userData.caja || c.userData.caja < 1.5 || t.max.y < 0.9 || c.rotation.x || c.rotation.z || c.rotation.y) continue;
      const ancho = t.max.x - t.min.x, fondo = t.max.z - t.min.z; if(ancho < 1.1 || fondo < 1.1) continue;
      if(cajas.some(([o, u]) => o !== c && u.min.y > t.max.y - 0.08 && u.max.x > t.min.x + 0.2 && u.min.x < t.max.x - 0.2 && u.max.z > t.min.z + 0.2 && u.min.z < t.max.z - 0.2)) continue;   // algo encima
      const n = Math.min(3, Math.floor(ancho*fondo/1.4)), hechos = [];
      for(let k=0, intentos=0; k<n && intentos<20; intentos++){
        const x = rr(t.min.x + 0.45, t.max.x - 0.45), z = rr(t.min.z + 0.45, t.max.z - 0.45);
        if(hechos.some(([px, pz]) => Math.abs(px - x) < 0.8 && Math.abs(pz - z) < 0.8)) continue;
        tk[Math.floor(R()*tk.length)](x, t.max.y, z, R() < 0.5 ? 0 : Math.PI/2); hechos.push([x, z]); k++;
      }
    }
  }
  const kit = KIT[f]; if(!kit) return;
  const total = kit.reduce((a, k) => a + k[0], 0), elegir = () => { let t = R()*total; for(const k of kit){ t -= k[0]; if(t <= 0) return k; } return kit[0]; };
  // Candidatos en una malla de 0,5 sobre la losa, en orden aleatorio; tantos objetos como permita el espacio libre
  const cand = []; for(let x=-h2 + 0.5; x<=h2 - 0.5; x+=0.5) for(let z=-h2 + 0.5; z<=h2 - 0.5; z+=0.5) cand.push([x + rr(-0.12, 0.12), z + rr(-0.12, 0.12)]);
  for(let i=cand.length-1; i>0; i--){ const j = Math.floor(R()*(i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const max = Math.min(16, Math.round(s*s/5));
  for(const [x, z] of cand){
    if(puestos.length >= max) break;
    const k = elegir(); if(!libre(x, z, k[1])) continue;
    // De cara a la estructura: el lado largo paralelo al muro más cercano
    const yaw = Math.abs(x) > Math.abs(z) ? Math.PI/2 : 0;
    k[2](x, z, yaw + (R() < 0.5 ? 0 : Math.PI)); puestos.push({ x, z, r:k[1] });
    for(let zz=celda(z - k[1]); zz<=celda(z + k[1]); zz++) for(let xx=celda(x - k[1]); xx<=celda(x + k[1]); xx++) ocup[zz*NG + xx] = 1;
  }
}
function buildingModel(e, body){
  const f = e.owner>=0 && S.players[e.owner] ? S.players[e.owner].faction : 'neutral', tc = teamColor(e.owner);
  const P = f==='hierro' ? Object.assign({}, PAL.hierro, { hull:0x837c71, dark:0x57524b }) : PAL[f];   // concreto más claro que el acero de los vehículos
  const s = (e.type==='aerodromo' ? e.h : e.n)*CELL, h2 = s/2, W = (e.w||e.n)*CELL, D = (e.h||e.n)*CELL;
  const A = f==='atlas', H = f==='hierro', G = f==='guerrilla';
  const named2 = (name, x, y, z) => { const g = named(new THREE.Group(), name); g.position.set(x, y, z); body.add(g); return g; };
  const small = ['torre','tunel','bunker','minigun','bateria','trinchera','aerodromo'].includes(e.type);   // el aeródromo dibuja su propia losa rectangular
  if(!small) pad(body, f, P, tc, s);
  const nLosa = body.children.length;
  switch(e.type){
    case 'suministros':
      if(A){   // estación de lanzamiento aéreo: zona circular de caída, contenedores apilados, grúa de carga y antena de guiado
        body.add(cyl(s*0.4, 0.06, 0x4c4a46, -s*0.12, 0.16, s*0.1, 28), cyl(s*0.38, 0.02, 0xd9b23a, -s*0.12, 0.22, s*0.1, 28), cyl(s*0.33, 0.03, 0x4c4a46, -s*0.12, 0.22, s*0.1, 28));   // zona de caída
        for(const [x, z] of [[-0.6,0],[0.6,0],[0,-0.6],[0,0.6]]) body.add(box(0.5, 0.02, 0.1, 0xe9e2cc, -s*0.12 + x*0.9, 0.25, s*0.1 + z*0.9));
        for(let i=0; i<8; i++){ const k = i/8; body.add(lamp(0.08, 0.06, 0.08, P.glow, -s*0.12 + (k<0.5 ? -1 : 1)*s*0.36*Math.abs(Math.cos(k*6.283)), 0.22, s*0.1 + s*0.36*Math.sin(k*6.283))); }
        // contenedores con paracaídas plegados y caja recién llegada en la zona
        for(let i=0; i<2; i++) for(let j=0; j<2-i; j++) body.add(box(1.0, 0.55, 0.6, j%2 ? 0x6b7a84 : 0x7a6a52, s*0.3, 0.16 + i*0.56, -s*0.3 + j*0.68 + i*0.34), box(1.02, 0.05, 0.62, tc, s*0.3, 0.68 + i*0.56, -s*0.3 + j*0.68 + i*0.34));
        body.add(box(0.6, 0.45, 0.6, 0x6b5a3a, -s*0.12, 0.25, s*0.1), box(0.62, 0.04, 0.62, 0x3a3a34, -s*0.12, 0.7, s*0.1), tilt(box(0.8, 0.02, 0.6, 0xd8cfb8, -s*0.12 + 0.55, 0.25, s*0.1 + 0.2), 0, 0.4, 0.1));   // caja y paracaídas en el suelo
        // grúa de carga y antena de guiado
        body.add(box(0.14, 2.0, 0.14, P.metal, s*0.38, 0.16, s*0.25), box(1.6, 0.1, 0.1, P.metal, s*0.38 - 0.7, 2.1, s*0.25), box(0.03, 0.8, 0.03, P.metal, s*0.38 - 1.3, 1.3, s*0.25), box(0.2, 0.15, 0.2, P.dark, s*0.38 - 1.3, 1.15, s*0.25));
        body.add(cyl(0.05, 2.2, P.metal, -s*0.4, 0.16, -s*0.35, 8), lamp(0.1, 0.1, 0.1, 0xff4a3a, -s*0.4, 2.36, -s*0.35));
        { const sp = named2('spin', -s*0.4, 1.9, -s*0.35); sp.add(box(0.6, 0.25, 0.04, 0xd9dfe3), box(0.05, 0.05, 0.1, P.metal, 0, 0, -0.05)); }
      } else if(H){   // ciberoperaciones: búnker con racks de servidores, pantallas y antenas parabólicas
        body.add(talud(s*0.75, s*0.6, 1.3, 0.2, P.hull, 0, 0.16, 0.05), box(s*0.62, 0.06, s*0.48, P.dark, 0, 1.46, 0.05), box(s*0.64, 0.1, 0.1, tc, 0, 1.4, s*0.3));   // techo y franja del equipo
        facade(body, f, P, s*0.65, 1.2, s*0.6, 0, 0.2, 0.05, { rows:1, door:true });
        for(let i=0; i<4; i++) body.add(lamp(0.34, 0.2, 0.03, i%2 ? 0x6fe36f : 0x6fd3e0, -s*0.27 + i*0.36, 0.9, s*0.36 + 0.02));   // pantallas encendidas
        for(let i=0; i<3; i++){ body.add(box(0.4, 0.9, 0.4, 0x2a2826, -s*0.32 + i*0.5, 1.5, -s*0.2)); for(let k=0; k<4; k++) body.add(lamp(0.3, 0.03, 0.02, k%2 ? 0x6fe36f : 0xff8a4a, -s*0.32 + i*0.5, 1.6 + k*0.18, -s*0.2+0.21)); }   // racks
        body.add(cyl(0.06, 1.2, P.metal, s*0.3, 1.5, -s*0.2, 8)); { const sp = named2('spin', s*0.3, 2.7, -s*0.2); const d = new THREE.Mesh(geo('antena', () => new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI*2, 0, Math.PI/2.6)), mat(0xb9b4aa)); d.rotation.x = Math.PI*0.6; sp.add(d); }
        body.add(box(0.05, 1.8, 0.05, P.metal, -s*0.36, 1.5, s*0.3), box(0.6, 0.03, 0.03, P.metal, -s*0.36, 3.1, s*0.3));
      } else {   // mercado negro: toldos, puestos con cajas, bidones y una camioneta
        for(const [x, z, c] of [[-s*0.28, -s*0.2, 0x8a3a2a], [s*0.05, -s*0.25, 0x5f6a3a], [s*0.3, s*0.05, 0x9a8a5c]]){
          for(const [px, pz] of [[-0.6,-0.45],[0.6,-0.45],[-0.6,0.45],[0.6,0.45]]) body.add(box(0.06, 1.1, 0.06, WOOD, x+px, 0.16, z+pz));
          body.add(tilt(box(1.4, 0.04, 1.1, c, x, 1.24, z), 0.12), box(1.1, 0.4, 0.5, WOOD, x, 0.16, z+0.2), box(0.3, 0.25, 0.25, 0x6b5a3a, x-0.3, 0.56, z+0.2), box(0.25, 0.2, 0.25, 0x4f5a3a, x+0.25, 0.56, z+0.15));
        }
        drums(body, -s*0.36, s*0.25, 3, 0x3a5a6a); body.add(box(0.5, 0.35, 0.4, 0x5a5446, s*0.05, 0.16, s*0.3), box(0.5, 0.3, 0.4, 0x6b5a3a, s*0.05, 0.51, s*0.3));
        wheels(body, 0.2, 0.16, [-0.42, 0.42], [s*0.32 + 0.45, s*0.32 - 0.45]); body.add(box(0.9, 0.35, 1.6, 0x7e7248, s*0.32, 0.36, s*0.32), box(0.86, 0.4, 0.55, tc, s*0.32, 0.71, s*0.32 + 0.45));   // camioneta
        body.add(box(s*0.8, 0.03, s*0.7, 0x6b5a40, 0, 0.17, 0));   // suelo pisado
      }
      break;
    case 'investigacion':
      if(A){
        body.add(prism([[-s*0.4,0],[s*0.4,0],[s*0.36,1.5],[-s*0.36,1.5]], s*0.6, P.hull, 0, 0.16, 0.1, 0.06));
        facade(body, f, P, s*0.72, 1.3, s*0.6, 0, 0.2, 0.1, { rows:2, door:true, sides:true });
        body.add(lathe([[0.95,0],[0.9,0.35],[0.65,0.75],[0.3,0.95],[0,1.0]], 0xe6ebef, -s*0.15, 1.66, -0.05), box(1.9,0.08,0.3,tc,-s*0.15,1.7,0.9));   // cúpula del laboratorio
        body.add(lamp(0.9,0.05,0.04,P.glow,-s*0.15,2.1,0.87), cyl(0.06,1.4,P.metal,s*0.28,1.66,-s*0.18,8), ball(0.12,P.glow,s*0.28,3.1,-s*0.18));
        { const sp = named2('spin', s*0.28, 2.7, -s*0.18); sp.add(box(0.9,0.05,0.1,P.metal), box(0.05,0.3,0.4,0xd9dfe3,0.45,0,0)); }
      } else if(H){
        body.add(talud(s*0.8, s*0.62, 1.7, 0.25, P.hull, 0, 0.16, 0.05), box(s*0.82,0.1,s*0.64,tc,0,1.7,0.05));
        facade(body, f, P, s*0.7, 1.4, s*0.62, 0, 0.2, 0.05, { rows:2, door:true, roof:true });
        for(const x of [-0.9, -0.3]) body.add(cyl(0.16,1.3,P.metal,x,1.86,-s*0.2,10)); smokeAt(body, -0.9, 3.2, -s*0.2);
        body.add(box(0.12,2.4,0.12,P.metal,s*0.3,1.86,-s*0.22), box(0.8,0.05,0.05,P.metal,s*0.3,3.6,-s*0.22), box(0.05,0.05,0.8,P.metal,s*0.3,3.9,-s*0.22));   // mástil de antenas
      } else {
        body.add(box(s*0.62,1.2,s*0.52,0x8a7a5a,0,0.16,0.1), gable(s*0.68, s*0.6, 0.7, 0x6f6a3c, 0, 1.36, 0.1));
        facade(body, f, P, s*0.62, 1.2, s*0.52, 0, 0.16, 0.1, { rows:1, door:true });
        body.add(box(0.06,3.0,0.06,WOOD,s*0.32,0.16,-s*0.3), box(0.9,0.03,0.03,P.metal,s*0.32,2.9,-s*0.3), box(0.03,0.03,0.7,P.metal,s*0.32,3.1,-s*0.3));   // antena improvisada
        for(let i=0; i<3; i++) body.add(box(0.5,0.35,0.4,i%2 ? 0x5a5446 : 0x4a4434,-s*0.32+i*0.55,0.16,-s*0.32));   // cajas de piezas
        drums(body, s*0.3, s*0.25, 2, 0x5f6a3a); body.add(box(s*0.5,0.03,s*0.3,0x5f6a3a,-s*0.1,1.8,0.1));
      }
      break;
    case 'bunker':   // minibúnker de concreto con aspilleras en tres caras
      body.add(talud(1.85,1.85,0.95,0.32,0x6d6862), talud(1.25,1.25,0.22,0.08,P.hull,0,0.95,0), box(1.27,0.06,1.27,tc,0,1.17,0));
      body.add(box(0.95,0.11,0.06,0x141210,0,0.58,0.73), box(0.06,0.11,0.8,0x141210,0.73,0.58,0), box(0.06,0.11,0.8,0x141210,-0.73,0.58,0));
      body.add(box(1.0,0.05,0.14,0x5a5650,0,0.66,0.77), box(0.5,0.62,0.06,P.metal,0,0.05,-0.84), lamp(0.08,0.08,0.03,0xff4a3a,0.34,0.6,-0.87));
      sandbags(body, 0, 0, 1.1, 0.5, 2.65, 0, 1); hazard(body, 1.2, 0, 1.22, 0);
      break;
    case 'minigun': {   // torreta de cañones rotativos con escudo
      body.add(talud(1.45,1.45,0.6,0.22,0x6d6862), cyl(0.46,0.18,P.dark,0,0.6,0,18)); hazard(body, 1.1, 0, 0.05, 0.66);
      const t = named2('turret', 0, 0.78, 0);
      t.add(box(0.52,0.42,0.62,P.hull,0,0,-0.02), box(0.54,0.06,0.64,tc,0,0.42,-0.02), box(0.95,0.55,0.1,P.hull,0,0.02,0.34), box(0.26,0.26,0.32,0x4a4a3a,0.4,0.02,-0.08));
      t.add(box(0.12,0.1,0.06,0x141210,0,0.36,0.4), cyl(0.04,0.3,P.metal,-0.4,0.2,0.1,6));
      const g = named(new THREE.Group(), 'gatling'); g.position.set(0,0.2,0.4); t.add(g);
      g.add(cyl(0.11,0.1,P.dark,0,-0.05,0.05,12)); g.children[0].rotation.x = Math.PI/2;
      for(let i=0; i<6; i++){ const a = i/6*6.283, b = barrel(0.85,0.024,GUN); b.position.set(Math.cos(a)*0.065, Math.sin(a)*0.065, 0.45); g.add(b); }
      { const r = barrel(0.04,0.1,P.dark); r.position.set(0,0,0.78); g.add(r); }
      break; }
    case 'bateria': {   // lanzador de misiles con radar de enlace
      body.add(prism([[-0.8,0],[0.8,0],[0.7,0.35],[-0.7,0.35]], 1.6, P.hull, 0, 0, 0, 0.04), box(1.42,0.05,1.42,tc,0,0.35,0), cyl(0.4,0.15,P.dark,0,0.38,0,18));
      for(const [x,z] of [[-0.75,-0.75],[0.75,-0.75],[-0.75,0.75],[0.75,0.75]]) body.add(box(0.18,0.08,0.18,P.metal,x,0,z));   // patas estabilizadoras
      body.add(cyl(0.04,1.4,P.metal,-0.6,0.35,-0.6,8), lamp(0.08,0.08,0.08,P.glow,-0.6,1.78,-0.6));
      { const sp = named2('spin', -0.6, 1.6, -0.6); sp.add(box(0.5,0.28,0.05,0xd9dfe3,0,0,0.04), box(0.06,0.06,0.12,P.metal,0,0,-0.03)); }   // radar del enlace de datos
      const t = named2('turret', 0, 0.53, 0);
      t.add(box(0.36,0.3,0.36,P.dark,0,0,0));
      const rack = new THREE.Group(); rack.position.set(0,0.42,0.05); rack.rotation.x = -0.45; t.add(rack);
      rack.add(box(1.0,0.5,0.95,0xe6ebef,0,0,0), box(1.02,0.06,0.97,tc,0,0.26,0));
      for(let r=0; r<2; r++) for(let c=0; c<3; c++){ const m = barrel(0.04,0.1,0x2a3138); m.position.set(-0.3+c*0.3,-0.11+r*0.24,0.48); rack.add(m); rack.add(lamp(0.06,0.06,0.02,P.glow,-0.3+c*0.3,-0.11+r*0.24,0.5)); }
      break; }
    case 'trinchera':   // trinchera baja con sacos, tablones y red de camuflaje
      body.add(lathe([[1.0,0],[0.95,0.06],[0.6,0.1],[0,0.1]], 0x6b5a40));                                    // fondo excavado
      sandbags(body, 0, 0, 0.92, -0.4, 3.55, 0.02, 2);
      for(const x of [-0.5, 0, 0.5]) body.add(box(0.1,0.34,0.06,WOOD,x,0.02,-0.62));                       // tablones
      for(const [x,z] of [[-0.75,-0.4],[0.75,-0.4],[0,0.75]]) body.add(box(0.05,0.62,0.05,WOOD,x,0,z));
      body.add(tilt(box(1.7,0.03,1.3,0x5f6a3a,0,0.62,0.05),0.08,0,0.05), box(0.3,0.03,0.25,0x6d6b3c,0.4,0.66,-0.3), box(0.45,0.06,0.08,tc,0,0.48,0.82));   // red y distintivo
      break;
    case 'centro':
      if(A){
        body.add(box(s*0.8,1.4,s*0.7,P.hull,0,0.16,-0.3), lathe([[s*0.2,0],[s*0.2,0.25],[s*0.16,0.75],[s*0.07,1.05],[0,1.1]], 0xe6ebef, -0.9,1.68,-0.9));
        facade(body, f, P, s*0.8, 1.4, s*0.7, 0, 0.16, -0.3, { rows:2, door:true, sides:true });
        body.add(box(s*0.82,0.12,s*0.72,0xd9dfe3,0,1.56,-0.3), box(s*0.83,0.08,0.16,tc,0,1.44,-0.3+s*0.35+0.02), box(0.16,0.08,s*0.72,tc,s*0.41,1.44,-0.3), box(0.16,0.08,s*0.72,tc,-s*0.41,1.44,-0.3));
        body.add(cyl(0.9,0.06,0x9aa4aa,s*0.25,1.6,-0.3,24), box(0.9,0.02,0.16,0xe6ebef,s*0.25,1.66,-0.3), box(0.16,0.02,0.9,0xe6ebef,s*0.25,1.66,-0.3));   // helipuerto
        body.add(cyl(0.05,2.2,P.metal,-s*0.35,1.56,-s*0.3,6), lamp(0.12,0.12,0.12,0xff4a3a,-s*0.35,3.75,-s*0.3));
        { const sp = named2('spin', -0.9, 3.0, -0.9); sp.add(tilt(cyl(0.45,0.05,P.trim,0,0,0,20),0.5), cyl(0.04,0.4,P.metal,0,-0.35,0,6)); }
      } else if(H){
        body.add(talud(s*0.86, s*0.74, 1.7, 0.35, P.hull, 0, 0.28, -0.25), talud(s*0.5, s*0.42, 1.0, 0.18, P.dark, -0.5, 1.98, -0.4));
        body.add(box(s*0.8,0.16,0.2,tc,0,1.55,-0.25+s*0.37+0.02));
        facade(body, f, P, s*0.86-1.0, 1.4, s*0.74, 0, 0.28, -0.25, { rows:2, door:true });   // aspilleras con visera y portón
        for(const sx of [1.2,1.9]){ body.add(cyl(0.25,2.2,P.metal,sx,1.9,-1.4,12), cyl(0.29,0.12,P.trim,sx,4.05,-1.4,12)); smokeAt(body, sx, 4.3, -1.4); }
        body.add(cyl(0.04,1.6,P.metal,-1.6,2.98,-0.6,6));
        { const sp = named2('spin', -1.6, 4.6, -0.6); sp.add(box(0.9,0.05,0.12,P.trim), box(0.12,0.3,0.05,P.metal,0,-0.3,0)); }
      } else {
        body.add(box(s*0.7,1.2,s*0.6,P.hull,0,0.2,-0.2), gable(s*0.82, s*0.7, 0.9, CLOTH, 0, 1.4, -0.2));
        facade(body, f, P, s*0.7, 1.2, s*0.6, 0, 0.2, -0.2, { rows:1, door:true, sides:true });
        corrugated(body, s*0.35, 1.0, 0x8a8478, 1.3, 1.2, 1.5, -0.25);
        sandbags(body, 0, 0, s*0.48, 0.2, 2.9, 0.18, 2); drums(body, -2.2, 1.6, 4, 0x5f6a3a);
        body.add(box(0.06,2.6,0.06,WOOD,-2.4,0.2,-2.0), box(0.9,0.55,0.03,tc,-1.95,2.25,-2.0));      // bandera
        body.add(box(1.4,0.06,1.0,0x5f6a3a,1.6,1.25,-1.5));
      }
      break;
    case 'recoleccion':
      if(A){       // Plataforma de carga: helipuerto con grúa y silos de vidrio
        body.add(cyl(1.8,0.25,0x9aa4aa,-0.8,0.16,0.6,28), box(2.4,0.03,0.3,0xe6ebef,-0.8,0.42,0.6), box(0.3,0.03,2.0,0xe6ebef,-1.8,0.42,0.6), box(0.3,0.03,2.0,0xe6ebef,0.2,0.42,0.6));
        for(let i=0; i<10; i++){ const a = i/10*Math.PI*2; body.add(lamp(0.1,0.05,0.1,P.glow,-0.8+Math.cos(a)*1.75,0.41,0.6+Math.sin(a)*1.75)); }
        for(const sz of [-1.9,-0.7]) body.add(lathe([[0.55,0],[0.55,1.6],[0.4,1.9],[0,1.95]], 0xe6ebef, 1.9,0.16,sz), lamp(0.6,0.12,0.04,P.glass,1.9,0.9,sz+0.56));
        body.add(box(1.6,1.0,1.2,P.hull,1.6,0.16,1.5), box(1.62,0.1,1.22,tc,1.6,1.16,1.5));
      } else if(H){  // Depósito minero: tolva con talud, cinta transportadora y silos
        body.add(talud(2.6, 2.2, 1.6, 0.5, P.hull, -1.2, 0.28, 0.4), talud(2.2, 1.8, 0.2, -0.3, P.dark, -1.2, 1.88, 0.4));
        body.add(ball(0.8, ORE, -1.2, 1.9, 0.4, 1, 0.35, 0.9));
        body.add(tilt(box(0.5,0.1,3.2,P.metal,0.6,1.6,-0.6),0.45,0.5), box(0.6,0.08,3.0,0x2a2826,0.6,1.62,-0.6));
        for(const sx of [1.8,2.3]) body.add(cyl(0.45,2.6,P.trim,sx,0.28,-1.6,16), lathe([[0.45,0],[0.2,0.4],[0,0.45]], P.dark, sx,2.88,-1.6,16));
        body.add(box(s*0.88,0.14,0.2,tc,0,1.4,s*0.42)); hazard(body, 2.4, -1.2, 0.3, 1.75);
        smokeAt(body, 2.3, 3.4, -1.6);
      } else {       // Acopio: cobertizo, montones de sacos, cajas y rampa de madera
        for(const [x,z] of [[-1.8,-1.8],[1.8,-1.8],[-1.8,0.6],[1.8,0.6]]) body.add(box(0.12,1.8,0.12,WOOD,x,0.2,z));
        corrugated(body, 4.0, 3.0, 0x8a8478, 0, 2.0, -0.6, 0.12);
        for(let i=0; i<7; i++) body.add(ball(0.32, i%2 ? CLOTH : 0xb59a6a, -1.2+(i%4)*0.55, 0.45+Math.floor(i/4)*0.35, -1.2+(i%3)*0.3, 1, 0.7, 1.2));
        body.add(box(0.7,0.6,0.7,WOOD,1.2,0.2,-1.0), box(0.6,0.5,0.6,0x8c7a55,1.2,0.8,-1.0), tilt(box(1.4,0.08,1.6,WOOD,0.4,0.4,1.9),0.3));
        body.add(box(1.2,0.6,0.04,tc,0,1.4,0.66)); drums(body, -2.3, 1.6, 3, 0x6b4a2a);
      }
      break;
    case 'planta':
      if(A){       // Planta solar con subestación: paneles fotovoltaicos, transformadores con aisladores y torre de alta tensión
        for(let r=0; r<2; r++) for(let c=0; c<3; c++){ const x = -s*0.3 + c*0.92, z = s*0.16 + r*0.95;
          body.add(box(0.06, 0.45, 0.06, P.metal, x, 0.16, z+0.15), box(0.06, 0.25, 0.06, P.metal, x, 0.16, z-0.2));
          body.add(tilt(box(0.86, 0.04, 0.62, 0x1d2c44, x, 0.48, z), -0.45));
          for(const k of [-0.2, 0.2]) body.add(tilt(box(0.012, 0.045, 0.62, 0x8aa0b8, x+k, 0.485, z), -0.45));
          body.add(tilt(box(0.86, 0.045, 0.012, 0x8aa0b8, x, 0.485, z), -0.45)); }
        // subestación: dos transformadores con aletas de enfriamiento y aisladores cerámicos
        for(const x of [-s*0.32, -s*0.1]){ body.add(box(0.55, 0.62, 0.45, 0x8d9aa4, x, 0.16, -s*0.3), box(0.57, 0.06, 0.47, tc, x, 0.78, -s*0.3));
          for(let i=0; i<4; i++) body.add(box(0.03, 0.45, 0.5, 0x6b7680, x - 0.2 + i*0.13, 0.22, -s*0.3 + 0.25));
          for(const k of [-0.15, 0, 0.15]){ for(let j=0; j<3; j++) body.add(cyl(0.05 - j*0.004, 0.06, 0xe6e2d8, x+k, 0.84 + j*0.08, -s*0.3, 8)); } }
        body.add(box(1.4, 0.02, 0.02, 0x4a4a48, -s*0.21, 1.1, -s*0.3));   // barra colectora
        // torre de alta tensión de celosía con brazos y cables hacia la subestación
        const tx = s*0.3, tz = -s*0.28;
        for(const [dx, dz] of [[-0.25,-0.25],[0.25,-0.25],[-0.25,0.25],[0.25,0.25]]) body.add(tilt(box(0.05, 3.0, 0.05, P.metal, tx+dx*0.6, 0.16, tz+dz*0.6), dz*0.12, 0, -dx*0.12));
        for(let i=0; i<5; i++) body.add(box(0.36 - i*0.05, 0.03, 0.03, P.metal, tx, 0.5 + i*0.55, tz+0.13), box(0.36 - i*0.05, 0.03, 0.03, P.metal, tx, 0.5 + i*0.55, tz-0.13));
        for(const y of [2.4, 2.9]) body.add(box(1.2, 0.05, 0.06, P.metal, tx, 0.16 + y, tz));
        for(const k of [-0.5, 0.5]) for(const y of [2.4, 2.9]) body.add(cyl(0.035, 0.18, 0xe6e2d8, tx+k, 0.16 + y - 0.18, tz, 8));
        for(const y of [2.4, 2.9]) body.add(tilt(box(0.012, 0.012, Math.hypot(tx + s*0.21, 1.5), 0x2a2a28, (tx - s*0.21)/2, 0.16 + y - 0.5, tz - 0.02), 0, Math.atan2(tx + s*0.21, 0.001) - Math.PI/2, 0));   // cables
        body.add(lamp(0.08, 0.08, 0.08, 0xff4a3a, tx, 3.2, tz));
      } else {     // Hierro: torres de enfriamiento de perfil hiperbólico con vapor
        for(const sx of [-0.85,0.85]){ body.add(lathe([[0.85,0],[0.62,1.1],[0.58,1.5],[0.66,2.2],[0.6,2.2],[0.52,1.5],[0.56,1.1],[0.78,0]], 0xbab4a8, sx,0.28,-0.3)); smokeAt(body, sx, 2.6, -0.3); }
        body.add(box(s*0.9,0.5,0.8,P.hull,0,0.28,1.3), box(s*0.92,0.1,0.82,tc,0,0.78,1.3)); hazard(body, s*0.8, 0, 0.3, s/2-0.12);
      }
      break;
    case 'cuartel':
      if(A){ body.add(box(s*0.86,1.1,s*0.7,P.hull,0,0.16,-0.2), archRoof(s*0.86, s*0.72, 0.55, 0xd9dfe3, 0, 1.26, -0.2), box(s*0.88,0.1,0.12,tc,0,1.2,-0.2+s*0.35+0.02)); for(let i=0; i<5; i++) body.add(archRoof(s*0.86+0.05, 0.07, 0.58, P.trim, 0, 1.25, -0.2 - s*0.34 + i*s*0.17)); facade(body, f, P, s*0.86, 1.1, s*0.7, 0, 0.16, -0.2, { rows:1, door:true, sides:true }); }
      else if(H){ body.add(talud(s*0.86, s*0.7, 1.3, 0.3, P.hull, 0, 0.28, -0.2), box(s*0.88,0.25,s*0.72,P.dark,0,1.58,-0.2), box(s*0.8,0.12,0.12,tc,0,1.42,-0.2+s*0.35+0.02)); facade(body, f, P, s*0.86-0.8, 1.2, s*0.7, 0, 0.28, -0.2, { rows:1, door:true, roof:false }); }
      else { const zf = -0.1 + s*0.375; body.add(gable(s*0.8, s*0.75, 1.5, 0x6f6a3c, 0, 0.2, -0.1), box(0.9,0.95,0.05,0x2b2620,0,0.2,zf+0.01), box(0.5,0.9,0.04,CLOTH,-0.25,0.24,zf+0.04), box(s*0.5,0.08,0.06,tc,0,0.9,zf+0.02)); sandbags(body, 0, 0, s*0.5, 0.3, 2.84, 0.18, 1); for(const sx of [-1.5,1.5]) body.add(box(0.06,1.6,0.06,WOOD,sx,0.2,s*0.3)); }
      break;
    case 'fabrica':
      if(A){       // Hangar en arco con portón luminoso
        body.add(archRoof(s*0.9, s*0.8, 2.4, P.hull, 0, 0.16, -0.25), box(s*0.6,1.6,0.06,0x2a3138,0,0.16,-0.25+s*0.4+0.01), box(s*0.62,0.08,0.08,P.glow,0,1.8,-0.25+s*0.4+0.03));
        for(let i=0; i<6; i++) body.add(box(s*0.58,0.025,0.03,0x3d4650,0,0.3+i*0.24,-0.25+s*0.4+0.05));   // paneles del portón
        for(let i=0; i<5; i++) body.add(box(0.06,0.05,s*0.8,P.trim,-s*0.36+i*s*0.18,0.2+Math.sin(Math.PI*(0.1+i*0.2))*2.35,-0.25));
        body.add(box(s*0.92,0.14,0.16,tc,0,0.9,-0.25+s*0.4+0.04), cyl(0.05,1.2,P.metal,2.2,2.2,-1.8,6), lamp(0.1,0.1,0.1,0xff4a3a,2.2,3.4,-1.8));
        for(let i=0; i<5; i++) body.add(archRoof(s*0.9+0.06, 0.09, 2.44, P.trim, 0, 0.15, -0.25 - s*0.38 + i*s*0.19));   // costillas de la bóveda
        for(const z of [-1.2, 0, 1.0]) body.add(cyl(0.16, 0.25, 0xc9ced2, 0, 2.5, -0.25 + z, 12), cyl(0.2, 0.05, P.dark, 0, 2.75, -0.25 + z, 12));   // respiraderos en la cumbrera
      } else if(H){  // Nave con techo en diente de sierra y chimeneas
        body.add(box(s*0.9,1.8,s*0.8,P.hull,0,0.28,-0.25));
        for(let i=0; i<3; i++) body.add(prism([[0,0],[s*0.3,0],[0,0.8]], s*0.8, i%2 ? P.dark : 0x5a554e, -s*0.45+i*s*0.3, 2.08, -0.25, 0.02));
        { const zf = -0.25 + s*0.4; body.add(box(s*0.5,1.4,0.1,P.metal,0.4,0.28,zf+0.02)); for(let i=0; i<5; i++) body.add(box(s*0.5,0.04,0.12,0x1e1c1a,0.4,0.4+i*0.25,zf+0.06));
          body.add(box(s*0.92,0.14,0.16,tc,0,1.9,zf+0.03)); for(const px of [-s*0.33, -s*0.2]) win(body, f, P, 0.36, 0.14, px, 1.1, zf, 0, 1); }
        for(const [sx,h] of [[-2.0,3.0],[-1.3,2.4]]){ body.add(cyl(0.3,h,P.metal,sx,0.28,-2.0,14), cyl(0.34,0.14,P.trim,sx,0.28+h,-2.0,14)); smokeAt(body, sx, h+0.6, -2.0); }
      } else {     // Taller: estructura de madera, techo de lámina, grúa y chatarra
        for(const [x,z] of [[-2.4,-2.4],[2.4,-2.4],[-2.4,1.2],[2.4,1.2],[0,-2.4],[0,1.2]]) body.add(box(0.16,2.2,0.16,WOOD,x,0.2,z));
        corrugated(body, s*0.86, 4.0, 0x8a8478, 0, 2.4, -0.6, 0.1); body.add(box(s*0.86,0.9,0.06,0x6f6a5e,0,0.2,-2.5));
        body.add(box(0.12,2.8,0.12,P.metal,2.6,0.2,2.2), tilt(box(0.1,0.1,2.4,P.metal,2.6,2.9,1.3),-0.25), box(0.03,1.0,0.03,P.metal,2.6,1.9,0.3));
        for(let i=0; i<5; i++) body.add(tilt(box(0.5+i*0.07,0.3,0.4,i%2 ? 0x6b6152 : 0x5a4a3a,-1.6+i*0.4,0.2+i%2*0.2,1.9),0.2*i,0.4*i));
        body.add(box(1.2,0.5,0.04,tc,-1.2,2.0,1.3)); drums(body, 1.4, 2.0, 2, 0x5f6a3a);
      }
      break;
    case 'torre': {
      if(A){ body.add(lathe([[0.8,0],[0.75,0.2],[0.5,0.5],[0.42,1.4],[0.55,1.5],[0,1.55]], P.hull), cyl(0.44,0.08,tc,0,1.0,0,16), lamp(0.08,0.4,0.08,P.glow,0,0.6,0.46)); }
      else if(H){ body.add(talud(1.7,1.7,1.0,0.3,0x6d6862), talud(1.1,1.1,0.5,0.12,P.hull,0,1.0,0), box(1.12,0.08,1.12,tc,0,1.2,0)); hazard(body, 1.4, 0, 0.05, 0.78); }
      else { for(const [x,z] of [[-0.6,-0.6],[0.6,-0.6],[-0.6,0.6],[0.6,0.6]]) body.add(tilt(box(0.1,1.6,0.1,WOOD,x,0,z),z*0.08,0,-x*0.08)); body.add(box(1.4,0.1,1.4,WOOD,0,1.5,0)); sandbags(body, 0, 0, 0.6, 0, 6.28, 1.6, 1); }
      const t = named2('turret', 0, 1.5, 0);
      if(A){ t.add(ball(0.5, 0xe6ebef, 0, 0.2, 0, 1, 0.7, 1), box(0.7,0.08,0.3,tc,0,0.35,-0.25), lamp(0.25,0.06,0.04,P.glow,0,0.3,0.45)); const b = barrel(1.4,0.08,P.metal); b.position.set(0,0.25,0.9); t.add(b); }
      else if(H){ t.add(box(0.95,0.5,0.95,P.hull), box(0.97,0.08,0.4,tc,0,0.5,-0.25)); const b = barrel(1.2,0.12,P.metal); b.position.set(0,0.3,0.75); t.add(b); const m = barrel(0.25,0.17,P.dark); m.position.set(0,0.3,1.35); t.add(m); }
      else { t.add(cyl(0.08,0.4,P.metal,0,0.1,0,8), box(0.5,0.3,0.05,P.dark,0,0.4,0.2)); const b = barrel(1.1,0.05,GUN); b.position.set(0,0.48,0.6); t.add(b); }
      break; }
    case 'aerodromo': {   // pista de aterrizaje: losa larga, eje y bordes pintados, luces, hangar en un extremo y torre de control
      const pista = f==='guerrilla' ? 0x8a7a5a : 0x4c4a46, borde = f==='guerrilla' ? 0x6b5a40 : 0x6d6862;
      body.add(box(W*0.99, 0.1, D*0.98, borde, 0, 0.02, 0), box(W*0.97, 0.06, D*0.42, pista, 0, 0.1, D*0.18));               // losa y pista
      if(f!=='guerrilla'){ for(let i=0; i<9; i++) body.add(box(0.7, 0.02, 0.1, 0xe9e2cc, -W*0.4 + i*W*0.1, 0.17, D*0.18));      // eje discontinuo
        for(const z of [D*0.18 - D*0.19, D*0.18 + D*0.19]) body.add(box(W*0.95, 0.02, 0.06, 0xe9e2cc, 0, 0.17, z));                // bordes
        for(let i=0; i<4; i++) body.add(box(0.12, 0.02, D*0.3, 0xe9e2cc, -W*0.46 + i*0.25, 0.17, D*0.18)); }                       // umbral
      for(let i=0; i<10; i++) for(const z of [D*0.18 - D*0.22, D*0.18 + D*0.22]) body.add(lamp(0.1, 0.06, 0.1, i===0 || i===9 ? 0xff4a3a : P.glow, -W*0.47 + i*W*0.104, 0.12, z));   // balizas
      // Plataforma de estacionamiento, hangar y torre (lado norte)
      body.add(box(W*0.5, 0.05, D*0.36, pista, W*0.2, 0.1, -D*0.27));
      if(f==='guerrilla') body.add(gable(W*0.24, D*0.34, 1.3, 0x6f6a3c, -W*0.3, 0.12, -D*0.27), box(W*0.2, 0.05, 0.05, tc, -W*0.3, 1.05, -D*0.27 + D*0.17));
      else body.add(archRoof(W*0.26, D*0.36, 1.7, P.hull, -W*0.3, 0.12, -D*0.27), box(W*0.2, 1.25, 0.04, 0x2a3138, -W*0.3, 0.12, -D*0.27 + D*0.18), box(W*0.27, 0.1, 0.1, tc, -W*0.3, 1.45, -D*0.27 + D*0.18));
      body.add(cyl(0.3, 2.4, P.trim, W*0.42, 0.12, -D*0.3, 14), lathe([[0.7,0],[0.75,0.5],[0.5,0.7],[0,0.72]], 0xe6ebef, W*0.42, 2.52, -D*0.3), lamp(1.2, 0.28, 0.04, P.glass, W*0.42, 2.66, -D*0.3 + 0.62));
      { const sp = named2('spin', W*0.42, 3.36, -D*0.3); sp.add(box(0.8,0.04,0.12,P.metal), box(0.05,0.2,0.05,P.metal,0,-0.2,0)); }
      body.add(box(0.06, 1.6, 0.06, P.metal, W*0.47, 0.12, D*0.45), tilt(cyl(0.12, 0.6, 0xe86a2a, W*0.47, 1.55, D*0.45 + 0.2, 8, 0.03), Math.PI/2.3));   // manga de viento
      drums(body, W*0.1, -D*0.4, 2, f==='hierro' ? 0x5a4a2a : 0x3a5a6a);
      break; }
    case 'astillero':
      body.add(box(s*0.95,0.4,s*0.95,0x8a8272,0,0.16,0), box(s*0.45,0.12,s*0.9,0x6b5a40,s*0.22,0.56,0));
      for(let i=0; i<6; i++) body.add(cyl(0.1,0.7,WOOD,s*0.44,0,-s*0.4+i*s*0.16,8));
      if(A) body.add(archRoof(s*0.4, s*0.6, 1.8, P.hull, -s*0.25, 0.56, 0), box(s*0.42,0.12,0.1,tc,-s*0.25,1.6,s*0.3));
      else if(H) body.add(talud(s*0.42, s*0.6, 1.6, 0.25, P.hull, -s*0.25, 0.56, 0), box(s*0.42,0.12,0.1,tc,-s*0.25,1.7,s*0.3));
      else { body.add(gable(s*0.42, s*0.6, 1.3, 0x6f6a3c, -s*0.25, 0.56, 0), box(s*0.42,0.08,0.06,tc,-s*0.25,1.0,s*0.3)); drums(body, -s*0.4, s*0.36, 2, 0x5f6a3a); }
      body.add(cyl(0.12,3.0,P.metal,s*0.32,0.56,-s*0.32,8));
      { const c = named2('spin', s*0.32, 3.56, -s*0.32); c.add(box(0.16,0.16,s*0.75,P.trim,0,0,s*0.25), box(0.03,1.2,0.03,P.metal,0,-1.2,s*0.55), box(0.3,0.2,0.3,P.metal,0,-1.4,s*0.55)); }
      break;
    case 'superarma': {
      const kind = BT(e.owner,'superarma').superKind;
      body.add(box(s*0.92,0.5,s*0.92,0x8a8272,0,0.16,0)); hazard(body, s*0.8, 0, 0.66, s*0.44);
      if(kind==='particulas'){
        body.add(lathe([[1.4,0],[1.3,1.4],[0.9,2.2],[0.5,2.4],[0,2.4]], 0xd9dfe3, 0,0.66,0), cyl(0.15,1.2,tc,0,3.0,0,10));
        const dish = new THREE.Mesh(geo('dish',()=>new THREE.SphereGeometry(1.6,20,10,0,Math.PI*2,0,Math.PI/2.6)), mat(0xd9d2c0)); dish.rotation.x = Math.PI; dish.position.y = 4.1; body.add(dish);
        for(let i=0; i<6; i++){ const a = i/6*6.28; body.add(lamp(0.12,0.4,0.12,P.glow,Math.cos(a)*1.25,1.2,Math.sin(a)*1.25)); }
      } else if(kind==='nuclear'){
        body.add(talud(s*0.75, s*0.75, 0.6, 0.15, 0x5a5850, 0, 0.66, 0));
        for(const sx of [-1,1]){ const d = box(s*0.36,0.2,s*0.7,0x6e6a5e); d.position.set(sx*s*0.3,1.4,0); d.rotation.z = sx*0.6; body.add(d); }
        body.add(cyl(0.45,2.4,0xe0d8c4,0,0.9,0,16), lathe([[0.45,0],[0.4,0.4],[0.2,0.75],[0,0.85]], tc, 0,3.3,0)); smokeAt(body, 0, 4.3, 0);
      } else {
        for(let i=0; i<3; i++){ const rack = box(s*0.8,0.35,0.6,0x5e5a4c); rack.position.set(0,1.0+i*0.1,-0.9+i*0.9); rack.rotation.x = -0.5; body.add(rack);
          for(let k=-2; k<=2; k++){ const r = barrel(0.9,0.12,tc); r.position.set(k*0.7,1.35+i*0.1,-0.9+i*0.9); r.rotation.x = Math.PI/2 - 0.5; body.add(r); } }
        sandbags(body, 0, 0, s*0.5, 0, 6.28, 0.66, 1);
      }
      break; }
    case 'tunel':
      body.add(lathe([[1.0,0],[0.95,0.3],[0.7,0.6],[0,0.7]], 0x8a7a5a), box(0.8,0.6,0.5,0x1e1a16,0,0.05,0.65), prism([[-0.5,0],[0.5,0],[0.5,0.5],[0,0.75],[-0.5,0.5]], 0.15, WOOD, 0, 0.05, 0.85));
      body.add(box(1.0,0.12,0.18,tc,0,0.8,0.7)); sandbags(body, 0, 0, 1.0, 3.6, 5.8, 0.05, 1);
      { const t = named2('turret', 0, 0.7, 0); const b = barrel(0.9,0.06,GUN); b.position.set(0,0.25,0.45); t.add(b, cyl(0.08,0.3,P.metal,0,0,0,8)); }
      break;
    case 'pozo': {   // Bombeo de varilla: balancín animado, cabeza de caballo y contrapeso
      body.add(box(s*0.9,0.2,s*0.9,0x5f5648), cyl(0.45,1.1,0x4f4a40,0.9,0.2,0.8,16), cyl(0.5,0.08,tc,0.9,1.3,0.8,16));
      body.add(tilt(box(0.14,2.1,0.14,0x4a4740,-0.4,0.2,0.3),-0.15), tilt(box(0.14,2.1,0.14,0x4a4740,-0.4,0.2,-0.3),0.15), box(0.6,0.5,0.6,0x3a3a34,0.5,0.2,-0.9));
      const beam = named2('beam', -0.4, 2.25, 0);
      beam.add(box(2.8,0.22,0.3,tc,0,-0.11,0), prism([[0,0.25],[0.45,0.1],[0.45,-0.5],[0,-0.6]], 0.32, 0x3a3a34, 1.35, 0, 0, 0.02), box(0.5,0.6,0.35,0x3a3a34,-1.3,-0.7,0));
      body.add(cyl(0.04,1.6,0x2a2826,0.95,0.2,0,6));
      break; }
    default: body.add(box(s*0.8,1.2,s*0.8,P.hull,0,0.16,0), box(s*0.82,0.12,s*0.82,tc,0,1.36,0));
  }
  if(!small && e.type!=='pozo' && !DETAIL_LO) ambientar(body, e, f, P, tc, s, nLosa);
  // Mejoras terminadas: piezas nuevas y galones dorados en la fachada (una por mejora)
  const ups = mejorasDe(e);
  if(ups.length){
    const esq = (i) => [[h2-0.75, h2-0.75], [-h2+0.75, h2-0.75], [h2-0.75, -h2+0.75], [-h2+0.75, -h2+0.75]][i % 4];
    ups.forEach((k, i) => {
      const [x, z] = esq(i + 1);
      if(k==='reactor'){ body.add(lathe([[0.55,0],[0.4,0.7],[0.38,1.0],[0.44,1.5],[0.38,1.5],[0.32,1.0],[0.34,0.7],[0.48,0]], f==='hierro' ? 0xbab4a8 : 0xe6ebef, x, 0.16, z), lamp(0.5, 0.06, 0.06, P.glow, x, 0.95, z+0.42)); if(H) smokeAt(body, x, 1.9, z); }   // torre de refrigeración extra
      else if(k==='carga'){ body.add(tilt(box(0.35, 0.08, 2.2, P.metal, x, 0.6, z*0.3), 0.25), box(0.4, 0.5, 0.4, P.dark, x, 0.16, z*0.3 - 0.9)); for(let j=0; j<3; j++) body.add(box(0.28, 0.2, 0.28, 0x8a6a3e, x, 0.72 + j*0.15, z*0.3 + 0.6 - j*0.5)); }   // cinta transportadora
      else if(k==='instruccion'){ body.add(box(0.08, 1.4, 0.9, WOOD, x, 0.16, z), box(0.5, 0.06, 0.06, WOOD, x, 1.5, z), box(0.06, 2.4, 0.06, P.metal, x+0.5, 0.16, z), prism([[0,0],[0.7,0.1],[0.7,0.38],[0,0.48]], 0.03, tc, x+0.52, 2.1, z, 0), cyl(0.04, 1.2, P.metal, -x*0.3, s*0.25 + 1.2, -z*0.2, 6)); }   // muro de escalada, mástil con banderín y antena
      else if(k==='montaje'){ body.add(archRoof(1.6, 1.4, 0.8, P.trim, x, 0.16, z), box(0.12, 0.9, 0.12, P.metal, x+0.55, 0.16, z+0.55), tilt(box(0.1, 0.1, 0.9, P.metal, x+0.55, 1.05, z+0.2), -0.6), lamp(0.12, 0.08, 0.14, P.glow, x+0.55, 1.2, z-0.15)); }   // nave de ensamblaje y brazo robótico
      else if(k==='fortificacion'){ for(const [px, pz, w2, d2] of [[0, h2-0.1, s*0.9, 0.18], [0, -h2+0.1, s*0.9, 0.18], [h2-0.1, 0, 0.18, s*0.9], [-h2+0.1, 0, 0.18, s*0.9]]) body.add(box(w2, 0.55, d2, 0x6d6862, px, 0.16, pz));   // placas de blindaje
        for(const [px, pz] of [[h2-0.4, h2-0.4], [-h2+0.4, -h2+0.4]]) sandbags(body, px, pz, 0.55, 0, 6.28, 0.16, 2); }
      else if(k==='blindaje'){ body.add(box(0.9, 0.5, 0.7, 0x58636c, x, 0.16, z), box(0.92, 0.08, 0.72, tc, x, 0.66, z), box(0.5, 0.25, 0.04, 0xbcc2c6, x, 0.4, z+0.37)); }   // banco de pruebas de blindaje
      else if(k==='optica'){ body.add(cyl(0.06, 1.3, P.metal, x, 0.16, z, 8)); const d = new THREE.Mesh(geo('platoOptica', () => new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI*2, 0, Math.PI/2.4)), mat(0xd9dfe3)); d.rotation.x = Math.PI*0.65; d.position.set(x, 1.55, z); body.add(d); body.add(lamp(0.08, 0.08, 0.08, P.glow, x, 1.55, z+0.12)); }   // plato de óptica
      else if(k==='municion'){ for(let j=0; j<3; j++) body.add(box(0.5, 0.3, 0.35, 0x4f5a3a, x - 0.3 + j*0.3, 0.16 + (j%2)*0.3, z), box(0.52, 0.04, 0.37, 0xb8a050, x - 0.3 + j*0.3, 0.42 + (j%2)*0.3, z)); }   // depósito de munición
      else if(k==='enlace'){ body.add(box(0.06, 2.6, 0.06, P.metal, x, 0.16, z), box(0.7, 0.04, 0.04, P.metal, x, 2.3, z), box(0.04, 0.04, 0.7, P.metal, x, 2.55, z), lamp(0.1, 0.1, 0.1, P.glow, x, 2.8, z)); }   // antena del enlace de datos
      else if(k==='doblecanon'){ for(let j=0; j<6; j++){ const b = barrel(1.0, 0.04, GUN); b.position.set(x - 0.15 + (j%3)*0.15, 0.3 + Math.floor(j/3)*0.15, z); body.add(b); } body.add(box(0.6, 0.18, 1.1, WOOD, x, 0.16, z)); }   // cañones rotativos en prueba
      else if(k==='camuflaje'){ body.add(tilt(box(1.8, 0.03, 1.6, 0x5f6a3a, x*0.6, 1.4, z*0.6), 0.1, 0, 0.08)); for(const [px, pz] of [[0.8,0.7],[-0.8,0.7],[0.8,-0.7],[-0.8,-0.7]]) body.add(box(0.05, 1.4, 0.05, WOOD, x*0.6+px, 0.16, z*0.6+pz)); }   // red de camuflaje
    });
    // Galones dorados (uno por mejora) sobre la franja del frente
    ups.forEach((k, i) => body.add(tilt(box(0.3, 0.06, 0.05, 0xf2d16b, -0.4 + i*0.4, 1.0 + (i%2)*0.08, h2 + 0.06), 0, 0, 0.5), tilt(box(0.3, 0.06, 0.05, 0xf2d16b, -0.2 + i*0.4, 1.0 + (i%2)*0.08, h2 + 0.06), 0, 0, -0.5)));
  }
  if(G && !small){
    body.add(box(s*0.5,0.03,s*0.4,0x5f6a3a,-s*0.15,0.2,s*0.3));                                                 // red de camuflaje en el suelo
    if(e.type!=='centro') body.add(box(0.06,2.2,0.06,WOOD,h2-0.35,0.15,h2-0.35), prism([[0,0],[0.8,0.12],[0.8,0.42],[0,0.55]], 0.03, tc, h2-0.32, 1.75, h2-0.35, 0));   // bandera del equipo
  }
}
// Andamio que se muestra mientras el edificio está en construcción
function scaffold(s){
  const g = named(new THREE.Group(), 'scaffold'), c = 0x8a857a, h = 2.4, r = s*0.5;
  for(const x of [-r, 0, r]) for(const z of [-r, r]) g.add(cyl(0.04, h, c, x, 0, z, 6));
  for(const x of [-r, r]) g.add(cyl(0.04, h, c, x, 0, 0, 6));
  for(const y of [0.8, 1.6, 2.4]){ g.add(box(s, 0.05, 0.05, c, 0, y, -r), box(s, 0.05, 0.05, c, 0, y, r), box(0.05, 0.05, s, c, -r, y, 0), box(0.05, 0.05, s, c, r, y, 0)); }
  g.add(box(s*0.9, 0.04, 0.4, WOOD, 0, 1.6, r-0.2));
  return g;
}
// Trozo de roca irregular (4 variantes con deformación fija) para depósitos y escombros
function chunk(r, color, x, y, z, v=0, sx=1, sy=1, sz=1){
  const g = geo('chunk' + v, () => {
    const base = new THREE.IcosahedronGeometry(1, 0), p = base.attributes.position, seen = new Map();
    for(let i=0; i<p.count; i++){
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if(!seen.has(key)){ const h = Math.sin(p.getX(i)*12.9898 + p.getY(i)*78.233 + p.getZ(i)*37.719 + v*5.1)*43758.5453; seen.set(key, 0.72 + (h - Math.floor(h))*0.5); }
      const k = seen.get(key); p.setXYZ(i, p.getX(i)*k, p.getY(i)*k, p.getZ(i)*k);
    }
    base.computeVertexNormals(); return base;
  });
  const m = new THREE.Mesh(g, mat(color)); m.position.set(x, y, z); m.scale.set(r*sx, r*sy, r*sz); m.rotation.set(v*0.7, v*1.3, v*0.4); m.castShadow = true; m.receiveShadow = true; return m;
}
const PROP_PROTO = new Map();
// Acopio de suministros: tarimas con cajas de madera y cajas metálicas, bidones y lonas. nivel 3 = lleno, 1 = casi vacío
function supplyCache(body, nivel){
  const R = mulberry32(17), MAD = [0x7a5a34, 0x8a6a3e, 0x6b4f2e], MET = [0x4f5a3a, 0x5a6048, 0x3e4a3a];
  body.add(lathe([[0,0],[1.9,0],[1.8,0.05],[0,0.07]], 0x8f7a58));                                                 // arena pisada
  const tarimas = [[-0.75,-0.55,0.2],[0.7,-0.6,-0.15],[-0.6,0.7,0.35],[0.75,0.65,0.1]];
  tarimas.forEach(([x, z, rot], ti) => {
    const pal = new THREE.Group(); pal.position.set(x, 0.05, z); pal.rotation.y = rot; body.add(pal);
    for(const k of [-0.32, 0, 0.32]) pal.add(box(0.95, 0.04, 0.14, 0x9a8460, 0, 0.06, k)); for(const k of [-0.4, 0, 0.4]) pal.add(box(0.12, 0.06, 0.95, 0x7d6a4c, k, 0, 0));   // tarima
    const capas = Math.max(0, Math.min(3, nivel - (ti === 3 ? 1 : 0)));
    for(let c=0; c<capas; c++) for(const [ox, oz] of [[-0.22,-0.22],[0.22,-0.22],[-0.22,0.22],[0.22,0.22]]){
      if(c === capas-1 && R() < 0.3) continue;
      const met = R() < 0.35, w = met ? 0.36 : 0.4, h = met ? 0.22 : 0.26, col = met ? MET[Math.floor(R()*3)] : MAD[Math.floor(R()*3)], y = 0.1 + c*0.27;
      pal.add(box(w, h, w*0.82, col, ox, y, oz));
      if(met){ pal.add(box(w+0.01, 0.03, 0.05, 0x2a2a28, ox, y + h*0.55, oz), box(0.06, 0.04, 0.03, 0xb8a050, ox, y + h*0.6, oz + w*0.41)); }   // fleje y cierre
      else { pal.add(box(w+0.01, 0.025, 0.035, 0x4a3a24, ox, y + 0.04, oz + w*0.41), box(w+0.01, 0.025, 0.035, 0x4a3a24, ox, y + h - 0.06, oz + w*0.41), box(0.14, 0.06, 0.01, 0xd8cfb0, ox, y + h*0.4, oz + w*0.415)); }   // listones y rótulo
    }
    if(capas >= 2 && ti % 2 === 0) pal.add(tilt(box(0.98, 0.03, 0.9, 0x5f6a3a, 0, 0.1 + capas*0.27, 0), 0.06, 0, 0.04));   // lona
  });
  if(nivel >= 2) drums(body, 0.05, -1.25, 3, 0x3a5a6a);
  if(nivel >= 3){ body.add(box(0.6, 0.35, 0.4, 0x4f5a3a, 1.4, 0.05, 0.05), box(0.62, 0.04, 0.42, 0x2a2a28, 1.4, 0.4, 0.05)); for(let i=0; i<3; i++) body.add(cyl(0.11, 0.6, 0x6b6a4a, -1.35, 0.05, -0.2 + i*0.24, 10)); }   // caja de munición y obuses
  body.add(box(0.06, 1.3, 0.06, 0x6b4a2a, 1.25, 0.05, -1.05), prism([[0,0],[0.55,0.1],[0.55,0.36],[0,0.46]], 0.03, 0xd9a23a, 1.27, 1.0, -1.05, 0));   // banderín de suministros
}
function propBody(kind, nivel=3){
  const pk = kind + nivel;
  if(!PROP_PROTO.has(pk)){
    const body = new THREE.Group(); TINT = null;
    if(kind==='depot'){ supplyCache(body, nivel); }
    else if(kind==='depotViejo'){
      body.add(lathe([[0,0],[1.85,0],[1.7,0.12],[1.2,0.22],[0,0.26]], 0x7d6a4c));                                    // suelo removido
      [[0,0.35,0,0.95,0],[-0.85,0.25,0.5,0.6,1],[0.8,0.22,-0.6,0.65,2],[0.6,0.2,0.8,0.5,3],[-0.7,0.2,-0.75,0.55,1]].forEach(([x,y,z,r,v]) => body.add(chunk(r, 0x8a7a62, x, y, z, v, 1, 0.8, 1)));
      [[0.25,0.95,0.2,0.42,0],[-0.3,0.85,-0.25,0.36,2],[-0.75,0.6,0.55,0.3,3],[0.85,0.55,-0.5,0.32,1],[0.45,0.5,0.85,0.26,2],[-0.1,0.5,0.75,0.24,0],[0.0,1.25,-0.1,0.28,3]]
        .forEach(([x,y,z,r,v], i) => body.add(chunk(r, i%2 ? ORE : 0xe8b84a, x, y, z, v, 1, 1.15, 1)));               // vetas de mineral
      for(const [x,z] of [[1.4,0.6],[-1.3,-0.3],[0.2,-1.4],[-0.4,1.4]]) body.add(chunk(0.12, ORE, x, 0.12, z, (x*7|0)&3));
      for(const [x,y,z] of [[0.3,1.3,0.32],[-0.32,1.12,-0.1],[0.9,0.85,-0.38]]) body.add(lamp(0.05,0.05,0.05,0xfff0b0,x,y,z));   // destellos
    } else {
      body.add(lathe([[0,0],[0.9,0],[0.8,0.06],[0,0.08]], 0x3a3631));                                                 // mancha quemada
      body.add(tilt(box(0.9,0.3,0.6,0x5a564e,0,0.05,0),0.15,0.4,0.1), tilt(box(0.6,0.12,0.5,0x6b6152,0.3,0.3,0.1),0.4,0.9,0.3));
      const tire = tilt(new THREE.Mesh(geo('tire',()=>new THREE.TorusGeometry(0.22,0.09,8,14)), mat(RUBBER)), Math.PI/2.4, 0, 0.3); tire.position.set(-0.45,0.12,0.3);
      const tubo = tilt(barrel(0.8,0.06,0x4a4740), Math.PI/2, 0.6, 0); tubo.position.set(0.1,0.12,0.45);
      body.add(tire, tubo, tilt(box(0.5,0.04,0.4,0x8c7a55,-0.2,0.32,-0.3),0.3,0.2,0.5), chunk(0.15, 0x6b6152, 0.5, 0.1, -0.4, 2));
    }
    mergeGroup(body, { polvo:0.4 }); PROP_PROTO.set(pk, body);
  }
  return PROP_PROTO.get(pk).clone();
}
const BLD_PROTO = new Map();
const mejorasDe = e => e.owner>=0 && S.players[e.owner] ? Object.keys(MEJORAS).filter(k => MEJORAS[k].edificio===e.type && S.players[e.owner].ups[k]===2).sort() : [];
function buildingBody(e, o){
  const f = e.owner>=0 && S.players[e.owner] ? S.players[e.owner].faction : 'neutral';
  const kind = e.type==='superarma' ? BT(e.owner,'superarma').superKind : '';
  const key = `${e.type}|${f}|${teamColor(e.owner)}|${kind}|${mejorasDe(e).join(',')}`;
  if(!BLD_PROTO.has(key)){
    const body = new THREE.Group();
    TINT = null; buildingModel(e, body);
    if(e.type!=="pozo") body.add(scaffold(Math.min(e.w||e.n, e.h||e.n)*CELL));
    mergeGroup(body, { polvo:0.45 });
    BLD_PROTO.set(key, body);
  }
  const body = BLD_PROTO.get(key).clone();
  o.turret = body.getObjectByName('turret') || null; o.beam = body.getObjectByName('beam') || null;
  o.spin = body.getObjectByName('spin') || null; o.scaffold = body.getObjectByName('scaffold') || null; o.gatling = body.getObjectByName('gatling') || null;
  o.smoke = body.userData.smoke || null; o.smokeT = Math.random();
  o.luces = []; o.vidrios = []; body.traverse(m => { if(!m.isMesh) return; if(m.material===VCMAT.luz) o.luces.push(m); else if(m.material===WIN_MAT[0]) o.vidrios.push(m); });
  return body;
}

function buildModel(e){
  TINT = e.owner>=0 && S.players[e.owner] ? S.players[e.owner].faction : null;
  const g = new THREE.Group(), body = new THREE.Group(), o = { g, body, yaw:0, targetYaw:0, owner:e.owner };
  g.add(body);
  if(e.kind==='bld'){
    // Edificios: modelo por facción, fusionado y compartido entre edificios iguales
    g.remove(body); o.body = buildingBody(e, o); g.add(o.body);
    o.ring = makeRing(e.n*CELL*0.75, 0x9be36b);
  } else if(e.kind==='crate' || e.kind==='depot'){
    // Depósito: afloramiento de roca con trozos de mineral (se achica al agotarse). Chatarra: restos de un vehículo.
    g.remove(body); o.body = propBody(e.kind); g.add(o.body);
  } else {
    // Unidades: modelo por facción, fusionado y compartido entre unidades iguales
    g.remove(body); o.body = unitBody(e, o); g.add(o.body);
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
// ======================= TERRENO CON RELIEVE (solo visual) =======================
// La simulación es plana. El render dibuja dunas suaves, aplanadas en las bases y con hondonadas en las orillas;
// unidades, edificios, rocas y efectos se apoyan en terrainH(x, z).
let HN = WORLD + 1, HMAP = new Float32Array(HN*HN);
function terrainH(x, z){
  const fx = Math.max(0, Math.min(WORLD-0.001, x)), fz = Math.max(0, Math.min(WORLD-0.001, z)), x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx-x0, tz = fz-z0, i = z0*HN + x0;
  return (HMAP[i]*(1-tx) + HMAP[i+1]*tx)*(1-tz) + (HMAP[i+HN]*(1-tx) + HMAP[i+HN+1]*tx)*tz;
}
const sst = (a, b, v) => { const t = Math.max(0, Math.min(1, (v-a)/(b-a))); return t*t*(3-2*t); };
function buildTerrain(){
  // Distancia a la zona de base más cercana (en unidades de mundo) para aplanar el terreno donde se construye
  const baseDist = (x, z) => Math.min(...(S.baseZones || BASE_ZONES).map(([a,b,c,d]) => Math.hypot(Math.max(a*LC - x, 0, x - (c+1)*LC), Math.max(b*LC - z, 0, z - (d+1)*LC))));
  // Máscara de roca suavizada por celda: los grupos de rocas forman mesetas; las rocas sueltas, lomas bajas
  const rb = new Float32Array(NCELLS);
  for(let cz=0; cz<GRID; cz++) for(let cx=0; cx<GRID; cx++){ let sum = 0, w = 0;
    for(let dz=-1; dz<=1; dz++) for(let dx=-1; dx<=1; dx++){ const gx = cx+dx, gz = cz+dz; if(gx<0 || gz<0 || gx>=GRID || gz>=GRID) continue; const k = dx && dz ? 0.5 : dx || dz ? 0.75 : 1; sum += (S.rockGrid[idx(gx,gz)] ? 1 : 0)*k; w += k; }
    rb[idx(cx,cz)] = sum/w; }
  const rockAt = (x, z) => { const fx = Math.max(0, Math.min(GRID-1.001, x/CELL - 0.5)), fz = Math.max(0, Math.min(GRID-1.001, z/CELL - 0.5)), x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx-x0, tz = fz-z0;
    return (rb[idx(x0,z0)]*(1-tx) + rb[idx(x0+1,z0)]*tx)*(1-tz) + (rb[idx(x0,z0+1)]*(1-tx) + rb[idx(x0+1,z0+1)]*tx)*tz; };
  for(let z=0; z<HN; z++) for(let x=0; x<HN; x++){
    let h = 0.42*Math.sin(x*0.07 + Math.cos(z*0.05)*1.6)*Math.cos(z*0.045) + 0.2*Math.sin((x+z)*0.13 + 1.1) + 0.07*Math.sin(x*0.41)*Math.sin(z*0.37);
    const bd = baseDist(x, z);
    h *= Math.min(1, bd/12);                                                     // bases planas
    // Terrazas: colinas amplias con escalones (tres niveles con rampas suaves entre ellos)
    const macro = 0.5 + 0.5*(0.55*Math.sin(x*0.031 + 1.3)*Math.cos(z*0.027 + 0.4) + 0.45*Math.sin((x - z)*0.022 + 2.1));
    const lv = macro*3, frac = lv - Math.floor(lv);
    h += (Math.floor(lv) + sst(0.93, 1, frac))/3 * 2.4 * Math.min(1, bd/16);    // escalones de 0,8 con rampas de ~2 unidades
    // Mesetas con farallones sobre las zonas de roca (ya intransitables en la simulación)
    h += 2.2 * sst(0.3, 0.72, rockAt(x, z));
    // Orillas: el terreno baja junto al agua para que el borde se vea natural
    let wd = 9; const cx = Math.floor(x/CELL), cz = Math.floor(z/CELL);
    for(let dz=-4; dz<=4; dz++) for(let dx=-4; dx<=4; dx++){ const gx = cx+dx, gz = cz+dz; if(gx<0 || gz<0 || gx>=GRID || gz>=GRID || !S.water[idx(gx,gz)]) continue; wd = Math.min(wd, Math.hypot(Math.max(0, Math.abs(x - cellCenter(gx)) - CELL/2), Math.max(0, Math.abs(z - cellCenter(gz)) - CELL/2))); }   // distancia al borde de la celda de agua
    if(wd < 3.5) h = h*Math.min(1, wd/3.5) - 0.42*(1 - Math.min(1, wd/3.5));   // fondo parejo dentro del río y orilla de 3,5 unidades
    HMAP[z*HN + x] = h;
    const k = (z*HN + x)*4, near = 1 - Math.min(1, Math.max(0, (wd - 1.5)/2));
    TERR_TEX.image.data[k] = Math.round(Math.max(0, Math.min(1, (h+1)/2))*255); TERR_TEX.image.data[k+1] = Math.round(near*255); TERR_TEX.image.data[k+3] = 255;
  }
  TERR_TEX.needsUpdate = true;
  for(const e of S.ents) if(e.kind==='bld' && !e.dead) flattenHMAP(e);         // suelo nivelado bajo los edificios iniciales
  updateGround();
}
// Nivela el terreno bajo un edificio (altura media de su base) con una transición suave alrededor
function flattenHMAP(b){
  const r = Math.max(b.w||b.n, b.h||b.n)*CELL/2 + 0.6, m = 2, x0 = Math.max(0, Math.floor(b.x - r - m)), x1 = Math.min(WORLD, Math.ceil(b.x + r + m)), z0 = Math.max(0, Math.floor(b.z - r - m)), z1 = Math.min(WORLD, Math.ceil(b.z + r + m));
  let sum = 0, c = 0; for(let z=z0; z<=z1; z++) for(let x=x0; x<=x1; x++) if(Math.abs(x-b.x) <= r && Math.abs(z-b.z) <= r){ sum += HMAP[z*HN + x]; c++; }
  if(!c) return; const t = sum/c;
  for(let z=z0; z<=z1; z++) for(let x=x0; x<=x1; x++){ const d = Math.max(Math.abs(x-b.x) - r, Math.abs(z-b.z) - r, 0), k = d <= 0 ? 1 : 1 - sst(0, m, d), i = z*HN + x; HMAP[i] = HMAP[i]*(1-k) + t*k; }
}
// Aplica el mapa de alturas al suelo: posiciones, normales y color de roca en las laderas empinadas
const CLIFF = new THREE.Color(0x9a7352), CLIFF_DARK = new THREE.Color(0x7d5c42), MESA = new THREE.Color(0xdcc597);
function updateGround(){
  const g = scene.userData.ground.geometry, p = g.attributes.position, col = g.attributes.color, base = g.userData.baseCol, c = new THREE.Color();
  for(let i=0; i<p.count; i++) p.setY(i, terrainH(p.getX(i), p.getZ(i)));
  p.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
  const n = g.attributes.normal;
  for(let i=0; i<p.count; i++){
    const steep = sst(0.02, 0.2, 1 - n.getY(i)), alto = sst(1.2, 2.6, p.getY(i));
    // Estratos: la arena aclara en los niveles altos; laderas y escalones toman color de roca
    c.setRGB(base[i*3], base[i*3+1], base[i*3+2]).lerp(MESA, sst(0.5, 2.4, p.getY(i))*0.4).lerp(CLIFF, steep*0.85).lerp(CLIFF_DARK, steep*alto*0.4);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}
let TERR_TEX = new THREE.DataTexture(new Uint8Array(HN*HN*4), HN, HN, THREE.RGBAFormat);
TERR_TEX.magFilter = THREE.LinearFilter; TERR_TEX.minFilter = THREE.LinearFilter;
const TERR_U = { value:TERR_TEX }, HN_U = { value:HN };
const WATER_Y = -0.12;   // nivel del agua (el terreno baja hasta -0,42 junto a los ríos)
const WATER_TIME = { value:0 };
// Agua: brillo del sol, reflejo del cielo en ángulos rasantes (fresnel) y espuma animada junto a la costa
function waterMat(){
  if(matCache.has('agua')) return matCache.get('agua');
  const m = addFog(new THREE.MeshPhongMaterial({ color:0x3f7896, map:TEX.water, transparent:true, opacity:0.9, specular:0x8a9aa0, shininess:70 })), fog = m.onBeforeCompile;
  m.onBeforeCompile = sh => { fog(sh);
    sh.uniforms.uTerr = TERR_U; sh.uniforms.uHN = HN_U; sh.uniforms.uTime = WATER_TIME;
    sh.fragmentShader = sh.fragmentShader
      .replace('uniform sampler2D uFogTex;', 'uniform sampler2D uFogTex;\nuniform sampler2D uTerr;\nuniform float uTime;\nuniform float uMundo;\nuniform float uHN;')
      .replace('gl_FragColor.rgb *= texture2D(uFogTex', `{
        float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.74, 0.83, 0.86), fres*0.55);          // reflejo del cielo
        vec4 tt = texture2D(uTerr, (vFogUv*uMundo + 0.5) / uHN);
        float prof = ${WATER_Y.toFixed(2)} - (tt.r*2.0 - 1.0);                         // profundidad del agua en este punto
        if(tt.g < 0.05 || prof < -0.01) discard;                                     // sin charcos lejos de los ríos
        float ola = 0.5 + 0.5*sin(vFogUv.x*900.0 + vFogUv.y*700.0 + uTime*2.2);
        float espuma = (1.0 - smoothstep(0.0, 0.1, prof)) * (0.6 + 0.4*ola);         // espuma en lo poco profundo
        gl_FragColor.rgb = mix(gl_FragColor.rgb * mix(1.25, 0.8, smoothstep(0.0, 0.3, prof)), vec3(0.95, 0.94, 0.9), espuma*0.75);
        gl_FragColor.a = mix(0.45, 0.92, smoothstep(0.0, 0.28, prof)) * smoothstep(0.05, 0.3, tt.g);
      }
      gl_FragColor.rgb *= texture2D(uFogTex`);
  };
  matCache.set('agua', m); return m;
}
// ======================= VEGETACIÓN Y PIEDRAS (InstancedMesh) =======================
// Arbustos secos y piedras sueltas sobre las dunas, con posiciones fijas por semilla. Se quitan bajo cada edificio nuevo.
let VEG = null;
function buildVegetation(){
  if(VEG){ scene.remove(VEG.shrubs, VEG.stones); if(VEG.palmas) scene.remove(VEG.palmas, VEG.secos, VEG.pasto); VEG = null; }
  TRACKS.data.fill(0); TRACKS.t = 0;   // sin huellas de la partida anterior
  { const d = TRACKS.d; d.scale.setScalar(0); d.updateMatrix(); for(let i=0; i<900; i++) TRACKS.m.setMatrixAt(i, d.matrix); TRACKS.m.instanceMatrix.needsUpdate = true; }
  const rnd = mulberry32((S.seed ^ 0x5eed) >>> 0), shrubs = [], stones = [];
  const lejosDe = (x, z) => S.ents.every(e => (e.kind!=='depot' && !(e.kind==='bld' && e.type==='pozo')) || Math.hypot(e.x-x, e.z-z) > 4);
  const enBase = (x, z) => (S.baseZones || BASE_ZONES).some(([a,b,c,d]) => x >= a*LC && x <= (c+1)*LC && z >= b*LC && z <= (d+1)*LC);   // zonas de base en unidades del mundo
  const libre = (x, z) => { const cx = toCell(x), cz = toCell(z); if(enBase(x, z) || S.blocked[idx(cx,cz)]) return false;
    for(let dz=-2; dz<=2; dz++) for(let dx=-2; dx<=2; dx++){ const gx = cx+dx, gz = cz+dz; if(gx>=0 && gz>=0 && gx<GRID && gz<GRID && S.water[idx(gx,gz)]) return false; } return lejosDe(x, z); };
  const cant = OPTIONS.calidad==='baja' ? 0.35 : OPTIONS.calidad==='media' ? 0.7 : 1;   // menos detalle en equipos modestos
  for(let i=0; i<2600 && shrubs.length<420*cant; i++){ const x = 2 + rnd()*(WORLD-4), z = 2 + rnd()*(WORLD-4); if(libre(x, z)) shrubs.push([x, z, 0.5 + rnd()*0.7, rnd()*6.28, rnd()]); }
  for(let i=0; i<3000 && stones.length<700*cant; i++){ const x = 1 + rnd()*(WORLD-2), z = 1 + rnd()*(WORLD-2); if(libre(x, z)) stones.push([x, z, 0.12 + rnd()*0.22, rnd()*6.28, rnd()]); }
  // Arbusto: tres matas bajas fusionadas
  const sg = geo('arbusto', () => { const parts = [[0,0.22,0,0.34],[0.24,0.16,0.1,0.24],[-0.18,0.14,-0.16,0.22]].map(([x,y,z,r]) => { const g = new THREE.SphereGeometry(r, 8, 6).toNonIndexed(); g.scale(1, 0.72, 1); g.translate(x, y, z); return g; });
    const n = parts.reduce((a,g) => a + g.attributes.position.count, 0), pos = new Float32Array(n*3), nor = new Float32Array(n*3); let o = 0;
    for(const g of parts){ pos.set(g.attributes.position.array, o*3); nor.set(g.attributes.normal.array, o*3); o += g.attributes.position.count; }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out; });
  const mk = (g, color, list, cast) => {
    const m = new THREE.InstancedMesh(g, addFog(new THREE.MeshLambertMaterial({ color })), list.length), d = new THREE.Object3D(), c = new THREE.Color();
    list.forEach(([x, z, sc, r, t], i) => { d.position.set(x, terrainH(x, z), z); d.rotation.set(0, r, 0); d.scale.setScalar(sc); d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, c.setHSL(0.1 + t*0.06, 0.25 + t*0.15, 0.32 + t*0.12)); });
    m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m;
  };
  // Palmeras en la orilla, árboles secos dispersos y matas de pasto
  const cercaAgua = (x, z) => { const cx = toCell(x), cz = toCell(z); for(let dz=-4; dz<=4; dz++) for(let dx=-4; dx<=4; dx++){ const gx = cx+dx, gz = cz+dz; if(gx>=0 && gz>=0 && gx<GRID && gz<GRID && S.water[idx(gx,gz)]) return true; } return false; };
  const libreSeco = (x, z) => { const cx = toCell(x), cz = toCell(z); return !enBase(x, z) && !S.blocked[idx(cx,cz)] && lejosDe(x, z); };
  const palmas = [], secos = [], pasto = [];
  for(let i=0; i<4000 && palmas.length<60*cant; i++){ const x = 2 + rnd()*(WORLD-4), z = 2 + rnd()*(WORLD-4); if(cercaAgua(x, z) && libre(x, z)) palmas.push([x, z, 0.8 + rnd()*0.5, rnd()*6.28, rnd()]); }
  for(let i=0; i<2000 && secos.length<(WORLD/128)*(WORLD/128)*30*cant; i++){ const x = 2 + rnd()*(WORLD-4), z = 2 + rnd()*(WORLD-4); if(libreSeco(x, z)) secos.push([x, z, 0.7 + rnd()*0.6, rnd()*6.28, rnd()]); }
  for(let i=0; i<3000 && pasto.length<(WORLD/128)*(WORLD/128)*260*cant; i++){ const x = 2 + rnd()*(WORLD-4), z = 2 + rnd()*(WORLD-4); if(libre(x, z)) pasto.push([x, z, 0.5 + rnd()*0.6, rnd()*6.28, rnd()]); }
  const fusion = (partes) => { const n = partes.reduce((a,g) => a + g.attributes.position.count, 0), pos = new Float32Array(n*3), nor = new Float32Array(n*3); let o = 0;
    for(const g of partes){ pos.set(g.attributes.position.array, o*3); nor.set(g.attributes.normal.array, o*3); o += g.attributes.position.count; }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out; };
  const palmaG = geo('palmera', () => { const p = [new THREE.CylinderGeometry(0.07, 0.11, 2.6, 6).toNonIndexed().translate(0.12, 1.3, 0)];
    for(let k=0; k<7; k++){ const h = new THREE.ConeGeometry(0.16, 1.4, 4).toNonIndexed(); h.rotateZ(Math.PI/2 + 0.5); h.rotateY(k/7*6.283); h.translate(0.25 + Math.cos(k/7*6.283)*0.5, 2.45, Math.sin(k/7*6.283)*0.5); p.push(h); }
    return fusion(p); });
  const secoG = geo('arbolSeco', () => { const p = [new THREE.CylinderGeometry(0.06, 0.1, 1.4, 5).toNonIndexed().translate(0, 0.7, 0)];
    for(const [a, y, l] of [[0.6, 1.0, 0.7],[2.4, 1.2, 0.6],[4.2, 0.85, 0.55],[5.4, 1.3, 0.45]]){ const r = new THREE.CylinderGeometry(0.02, 0.04, l, 4).toNonIndexed(); r.rotateZ(0.9); r.rotateY(a); r.translate(Math.cos(a)*l*0.35, y, -Math.sin(a)*l*0.35); p.push(r); }
    return fusion(p); });
  const pastoG = geo('pasto', () => fusion([0, 1.3, 2.6, 3.9, 5.2].map(a => { const c = new THREE.ConeGeometry(0.035, 0.42, 3).toNonIndexed(); c.rotateZ(0.25); c.rotateY(a); c.translate(Math.cos(a)*0.06, 0.2, Math.sin(a)*0.06); return c; })));
  VEG = { shrubs: mk(sg, 0xffffff, shrubs, OPTIONS.calidad==='alta'), stones: mk(smoothRockGeo(3, 1), 0xffffff, stones, false), sl: shrubs, tl: stones,
    palmas: mk(palmaG, 0xffffff, palmas, OPTIONS.calidad!=='baja'), secos: mk(secoG, 0x6b5a44, secos, OPTIONS.calidad==='alta'), pasto: mk(pastoG, 0xffffff, pasto, false) };
  for(const [m, k] of [[VEG.palmas, 'p'], [VEG.pasto, 'g']]){ const c = new THREE.Color(); (k==='p' ? palmas : pasto).forEach(([,, , , t], i) => m.setColorAt(i, k==='p' ? c.setHSL(0.24 + t*0.05, 0.35, 0.3 + t*0.08) : c.setHSL(0.13 + t*0.05, 0.3, 0.45 + t*0.1))); if(m.instanceColor) m.instanceColor.needsUpdate = true; }
  for(const [m, l] of [[VEG.secos, secos]]){ const c = new THREE.Color(); l.forEach((_, i) => m.setColorAt(i, c.setHSL(0.08, 0.22, 0.28 + (i%5)*0.03))); if(m.instanceColor) m.instanceColor.needsUpdate = true; }
}
// Huellas: dos franjas por marca, 900 marcas en un búfer circular; se encogen al envejecer (12 s)
const TRACKS = (() => {
  const g = new THREE.PlaneGeometry(0.16, 0.42); g.rotateX(-Math.PI/2);
  const m = new THREE.InstancedMesh(g, addFog(new THREE.MeshBasicMaterial({ color:0x6a563a, transparent:true, opacity:0.32, depthWrite:false })), 900);
  const d = new THREE.Object3D(); d.scale.setScalar(0); d.updateMatrix(); for(let i=0; i<900; i++) m.setMatrixAt(i, d.matrix);
  m.frustumCulled = false; m.renderOrder = 0; scene.add(m);
  return { m, d, data: new Float32Array(900*4), head: 0, t: 0 };
})();
function stampTrack(x, z, yaw, w){
  const T = TRACKS; for(const side of [-1, 1]){ const i = T.head; T.head = (T.head + 1) % 900;
    T.data.set([x + Math.cos(yaw)*w*side, z - Math.sin(yaw)*w*side, yaw, FX_CLOCK], i*4); }
}
function updateTracks(dt){
  const T = TRACKS; T.t -= dt; if(T.t > 0) return; T.t = 0.25;
  for(let i=0; i<900; i++){ const b = i*4, age = FX_CLOCK - T.data[b+3]; if(!T.data[b+3]) continue;
    const k = age > 12 ? 0 : age > 8 ? 1 - (age-8)/4 : 1; const x = T.data[b], z = T.data[b+1];
    T.d.position.set(x, terrainH(x, z) + 0.04, z); T.d.rotation.set(0, T.data[b+2], 0); T.d.scale.set(k, 1, k || 0.0001); T.d.updateMatrix(); T.m.setMatrixAt(i, T.d.matrix);
    if(k === 0) T.data[b+3] = 0; }
  T.m.instanceMatrix.needsUpdate = true;
}
// Un edificio nuevo aplasta la vegetación de su terreno
function clearVegetation(b){
  if(!VEG) return; const r = b.n*CELL*0.75, m4 = new THREE.Matrix4().makeScale(0, 0, 0);
  for(const [mesh, list] of [[VEG.shrubs, VEG.sl], [VEG.stones, VEG.tl]]){ let ch = false; list.forEach(([x, z], i) => { if(Math.abs(x-b.x) < r && Math.abs(z-b.z) < r){ mesh.setMatrixAt(i, m4); ch = true; } }); if(ch) mesh.instanceMatrix.needsUpdate = true; }
}
function buildWater(){
  buildTerrain();
  if(waterMesh){ scene.remove(waterMesh); waterMesh = null; }
  if(!S.water.some(v => v)) return;   // mapa sin agua
  // Un solo plano bajo el nivel del suelo: la orilla aparece donde el relieve cruza el agua
  waterMesh = new THREE.Mesh(geo('aguaPlano' + WORLD, () => { const g = new THREE.PlaneGeometry(WORLD, WORLD, 1, 1); g.rotateX(-Math.PI/2); g.translate(WORLD/2, 0, WORLD/2); return g; }), waterMat());
  waterMesh.position.y = WATER_Y; waterMesh.receiveShadow = true; waterMesh.renderOrder = 1; scene.add(waterMesh);
}
function smoothRockGeo(v, detail){
  return geo('rocaSuave' + v + '_' + detail, () => {
    const base = new THREE.IcosahedronGeometry(1, detail), p = base.attributes.position, ids = new Map(), verts = [], index = [];
    for(let i=0; i<p.count; i++){ const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`; let id = ids.get(key); if(id === undefined){ id = verts.length/3; ids.set(key, id); verts.push(p.getX(i), p.getY(i), p.getZ(i)); } index.push(id); }
    const uv = [];
    for(let i=0; i<verts.length; i+=3){
      const x = verts[i], z = verts[i+2]; let y = verts[i+1];
      const k = 1 + 0.2*Math.sin(x*3.1 + y*2.3 + v*1.7) + 0.12*Math.sin(z*5.3 - x*2.1 + v) + 0.06*Math.sin(y*9.7 + z*7.1 + v*3.3);
      if(y < 0) y *= 0.5; else if(y > 0.6) y = 0.6 + (y - 0.6)*0.55;                 // base plana y cima algo achatada
      verts[i] = x*k; verts[i+1] = y*k; verts[i+2] = z*k; uv.push((x + z*0.7)*0.6, y*0.6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(index); g.computeVertexNormals();
    return g;
  });
}
function buildRocks(){
  if(rocksMesh){ for(const m of rocksMesh) scene.remove(m); }
  // Tres variantes de roca suave; cada roca usa la de su índice. Asientan sobre el relieve (mesetas incluidas).
  if(!matCache.has('roca')) matCache.set('roca', addFog(new THREE.MeshLambertMaterial({ color:0x9a8872, map:TEX.rock })));
  const detail = OPTIONS.calidad==='baja' ? 1 : 2, grupos = [[], [], []];
  S.rocks.forEach((r, i) => grupos[i % 3].push(r));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  rocksMesh = grupos.map((lista, v) => {
    const mesh = new THREE.InstancedMesh(smoothRockGeo(v, detail), matCache.get('roca'), Math.max(1, lista.length));
    // Rocas del interior de un grupo: pequeñas, para que se vea la cima de la meseta; las del borde, grandes
    const roca = (cx, cz) => cx>=0 && cz>=0 && cx<GRID && cz<GRID && S.rockGrid[idx(cx,cz)];
    lista.forEach((r, i) => { const x = (r.cx + SUBC/2)*CELL, z = (r.cz + SUBC/2)*CELL, interior = roca(r.cx-1,r.cz) && roca(r.cx+SUBC,r.cz) && roca(r.cx,r.cz-1) && roca(r.cx,r.cz+SUBC), k = r.s*LC*(interior ? 0.28 : 0.62); p.set(x, terrainH(x, z) + 0.12*k, z); q.setFromEuler(new THREE.Euler(0.15, r.r, 0.1)); sc.set(k, k*0.8, k); m.compose(p, q, sc); mesh.setMatrixAt(i, m); });
    if(!lista.length){ m.makeScale(0, 0, 0); mesh.setMatrixAt(0, m); }
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
  });
}

// Edificaciones abandonadas: modelos fusionados por tipo, colocados sobre su huella
let RUINAS = [];
const RUIN_PROTO = new Map();
function ruinBody(t){
  if(RUIN_PROTO.has(t)) return RUIN_PROTO.get(t).clone();
  const g = new THREE.Group(); TINT = null; const PARED = 0xb8a78a, OSC = 0x6b5e4c, OXI = 0x7a4a2a;
  if(t===0){   // casa de adobe en ruinas: muros incompletos, techo caído y escombros
    g.add(box(3.4, 0.1, 3.2, 0x9a8a6c, 0, 0, 0));
    g.add(box(3.2, 1.6, 0.22, PARED, 0, 0.1, -1.4), box(0.22, 1.2, 2.8, PARED, -1.5, 0.1, 0), box(1.2, 1.9, 0.22, PARED, 1.0, 0.1, 1.4), box(0.22, 0.7, 1.4, PARED, 1.5, 0.1, -0.6));
    g.add(box(0.5, 0.6, 0.24, 0x2a2622, -0.6, 0.6, -1.4), box(0.6, 0.9, 0.24, 0x2a2622, 0.9, 0.1, 1.4));   // hueco de ventana y puerta
    g.add(tilt(box(2.4, 0.12, 1.8, OSC, -0.2, 0.5, -0.3), 0.35, 0, 0.18), tilt(box(0.12, 0.12, 2.6, 0x5a4026, 0.4, 0.9, -0.2), 0.3, 0, 0.2));   // losa y viga caídas
    for(const [x, z, r] of [[0.8,-0.4,0.35],[-0.9,0.8,0.3],[0.2,0.9,0.25],[1.3,0.4,0.22]]) g.add(chunk(r, 0x9a8a6c, x, 0.15, z, (x*7|0)&3));
  } else if(t===1){   // gasolinera abandonada: marquesina, surtidores oxidados y letrero
    g.add(box(5.6, 0.08, 3.4, 0x5a5650, 0, 0, 0));
    for(const [x, z] of [[-2,-1],[2,-1],[-2,0.9],[2,0.9]]) g.add(box(0.16, 2.2, 0.16, 0x8a8478, x, 0.08, z));
    g.add(tilt(box(4.8, 0.18, 2.6, 0xc9c2b0, 0, 2.28, 0), 0, 0, 0.06), box(4.8, 0.2, 0.06, 0x8a3a2a, 0, 2.18, 1.3));
    for(const x of [-0.8, 0.8]) g.add(box(0.4, 1.0, 0.3, OXI, x, 0.08, 0), box(0.3, 0.2, 0.32, 0xd8cfb0, x, 0.75, 0));
    g.add(box(1.4, 1.1, 1.2, PARED, -2.0, 0.08, -1.0), box(0.12, 2.6, 0.12, 0x6b6a62, 2.4, 0.08, 1.4), tilt(box(1.0, 0.6, 0.06, 0xd9a23a, 2.4, 2.4, 1.4), 0, 0.3, 0.12));
    drums(g, 1.6, -1.2, 2, OXI);
  } else if(t===2){   // tanque de agua elevado caído
    g.add(box(3.4, 0.08, 3.2, 0x9a8a6c, 0, 0, 0));
    const tq = cyl(0.9, 2.2, 0x8a8478, 0, 0, 0, 16); tq.rotation.z = Math.PI/2; tq.position.set(0.2, 0.95, 0.2); g.add(tq);
    for(const [x, z, r] of [[-1.2,-1.1,0.4],[1.2,-1.1,-0.6],[-1.2,1.2,0.9]]) g.add(tilt(box(0.12, 2.4, 0.12, OXI, x, 0.05, z), r, 0, r*0.5));   // patas dobladas
    g.add(tilt(box(0.08, 0.08, 2.6, OXI, 0, 0.6, -1.0), 0, 0.5, 0.3), chunk(0.3, 0x8a8478, -0.9, 0.12, 0.6, 2));
  } else {   // camión quemado detrás de una barricada de sacos y neumáticos
    g.add(box(3.4, 0.06, 3.2, 0x7a6a52, 0, 0, 0));
    g.add(tilt(box(1.0, 0.7, 2.4, 0x3a3631, 0.4, 0.25, 0.1), 0, 0.3, 0.12), tilt(box(0.95, 0.65, 0.8, 0x2e2a26, 0.65, 0.6, 1.0), 0, 0.3, 0.12));   // caja y cabina carbonizadas
    for(const [x, z] of [[-0.1,-0.6],[0.9,-0.4],[0.1,0.9],[1.2,1.1]]){ const r = new THREE.Mesh(geo('neumRuina', () => new THREE.TorusGeometry(0.28, 0.1, 6, 12)), mat(0x1e1c1a)); r.rotation.set(Math.PI/2, 0, 0); r.position.set(x, 0.12, z); g.add(r); }
    sandbags(g, -0.6, 0, 1.3, 1.6, 4.6, 0.05, 2);
  }
  mergeGroup(g, { polvo:0.5 }); RUIN_PROTO.set(t, g); return g.clone();
}
function buildRuins(){
  for(const m of RUINAS) scene.remove(m); RUINAS = [];
  for(const r of (S.ruins || [])){ const m = ruinBody(r.t), x = (r.cx + r.w/2)*CELL, z = (r.cz + r.h/2)*CELL;
    m.position.set(x, terrainH(x, z), z); m.rotation.y = r.r*Math.PI/2 + (r.w > r.h ? 0 : 0); scene.add(m); RUINAS.push(m); }
}
// Visibilidad para el jugador local
let VIEW_ALL = false;
let ALL1 = new Uint8Array(NCELLS).fill(1);
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
  const t = document.getElementById('txEmblem'); if(t) t.innerHTML = `<img class="retrato" src="img/comandante-${f}.png" alt="">`;   // la transmisión la da el comandante
  const r = document.getElementById('facPortrait'); if(r) r.src = `img/comandante-${f}.png`;
  const n = document.getElementById('facName'); if(n) n.textContent = FACTIONS[f].nombre;
  if(SFX.motor && SFX.on && SFX.motor.activa && SFX.motor.faccion !== f){ SFX.motor.detenerMusica(); setTimeout(() => { if(SFX.on) SFX.motor.iniciarMusica(f); }, 700); }
}

// ======================= SONIDO (Web Audio, generado) =======================
const SFX = { ctx:null, on:true, master:null, noise:null, last:{}, hush:false };
const SFX_GAP = { edificio:300, caida:300, hundimiento:300, minigun:240, ametralla:200, antitanque:150, misilsam:200, ack:180, place:200, ready:350, rank:800, win:2000, lose:2000, radio:800, obj:600, rifle:70, aa:90, canon:140, obus:200, torre:120, misil:160, cohete:120, heroe:120, boom:90, big:300, click:40, alert:600, chime:400, capture:500 };
function sfxInit(){
  if(SFX.ctx) { if(SFX.ctx.state==='suspended') SFX.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if(!C) return;
  SFX.ctx = new C(); SFX.master = SFX.ctx.createGain(); SFX.master.gain.value = (typeof OPTIONS!=='undefined' ? OPTIONS.volumen : 45)/100; SFX.master.connect(SFX.ctx.destination);
  const len = SFX.ctx.sampleRate, buf = SFX.ctx.createBuffer(1, len, len), d = buf.getChannelData(0);
  for(let i=0; i<len; i++) d[i] = Math.random()*2-1;
  SFX.noise = buf;
  if(window.FASonido){
    SFX.motor = new FASonido.Motor(SFX.ctx, SFX.master); SFX.motor.modoMusica(OPTIONS.musica);
    if(FASonido.Voces){ SFX.voces = new FASonido.Voces(SFX.motor); vozOpciones(); }
    // Archivos generados (ElevenLabs, Suno…) que reemplazan la síntesis: se listan con node pruebas/generar-audio.js
    fetch('audio/audio.json', { cache:'no-cache' }).then(r => r.ok ? r.json() : []).catch(() => []).then(l => { if(Array.isArray(l)) SFX.motor.cargarArchivos(l.filter(n => typeof n==='string' && /^[a-z0-9-]+\.(ogg|mp3)$/.test(n))); });
    const f = sfxFaction(); ['click','ack','ready','place','chime','alert','radio','squelch','squelch-fin'].forEach(k => SFX.motor.preparar(`${k}-${f}`));
    ['rifle','canon','misil','antitanque'].forEach(k => FACTIONS && Object.keys(FACTIONS).forEach(ff => SFX.motor.preparar(`${k}-${ff}`)));
    ['boom','big','edificio','caida'].forEach(k => SFX.motor.preparar(k));
    // Superarmas: tardan unos segundos en generarse; se preparan en segundo plano desde el inicio
    ['super-particulas-carga','super-particulas-impacto','super-nuclear-lanzamiento','super-nuclear-impacto','super-cohetes-lanzamiento','super-cohetes-impacto'].forEach(k => SFX.motor.preparar(k, 1));
  }
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
const SFX_UI = new Set(['click','ack','ready','place','chime','alert','capture','rank','obj','radio','win','lose']);
const sfxFaction = () => S.players && S.players[LOCAL] ? S.players[LOCAL].faction : soloFaction;
function sfx(kind, x, z, fac){
  if(!SFX.on || !SFX.ctx || SFX.hush || SFX.ctx.state!=='running') return;
  const now = performance.now(), gk = kind + (fac||''); if(now - (SFX.last[gk]||0) < (SFX_GAP[kind]||60)) return; SFX.last[gk] = now;
  let v = 1, pan = 0, lejos = 0; if(x!==undefined){ const d = Math.hypot(x-cam.x, z-cam.z); v = Math.max(0, 1 - d/(cam.dist*1.6)); if(v < 0.05) return; pan = (x - cam.x)/(cam.dist*0.9); lejos = Math.min(1, d/(cam.dist*1.3)); }
  if(SFX.motor){
    const f = SFX_UI.has(kind) ? sfxFaction() : fac;
    if(SFX.motor.tocar(kind, /^(boom|big|edificio|caida|hundimiento)$|^super-/.test(kind) ? null : f, { vol:v*v, pan, lejos })) return;
    if(FASonido.receta(f ? `${kind}-${f}` : kind) || FASonido.receta(kind)) return;   // se está generando: el próximo sonará
  }
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
// Voces de las unidades propias: al seleccionarlas, al darles una orden y al salir de producción
function vozOpciones(){ if(!SFX.voces) return; SFX.voces.activa = OPTIONS.voces; SFX.voces.volumen = Math.min(1, OPTIONS.volumen/100*1.6); if(!OPTIONS.voces) SFX.voces.callar(); }
function vozCategoria(u){
  const t = UT(u.owner, u.type);
  if(u.type==='heroe') return 'heroe'; if(u.type==='constructor') return 'constructor'; if(u.type==='recolector') return 'recolector';
  if(t.air) return 'aereo'; if(t.naval) return 'naval'; return t.armor==='inf' ? 'infanteria' : 'vehiculo';
}
// Habla la unidad más representativa del grupo (el héroe primero; si no, la primera)
function hablar(evento, lista){
  if(!SFX.voces || !SFX.on || REPLAY || !SFX.ctx || SFX.ctx.state!=='running') return;
  const us = (Array.isArray(lista) ? lista : [lista]).filter(u => u && u.kind==='unit' && u.owner===LOCAL && !u.dead); if(!us.length) return;
  const u = us.find(x => x.type==='heroe') || us[0];
  SFX.voces.decir(S.players[LOCAL].faction, vozCategoria(u), evento);
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
  if(SFX.motor){ if(on){ if(SFX.motor.activa && SFX.motor.faccion !== sfxFaction()) SFX.motor.detenerMusica(); setTimeout(() => SFX.motor.iniciarMusica(sfxFaction()), SFX.motor.activa ? 0 : 50); } else SFX.motor.detenerMusica(); return; }
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
const fxSphere = new THREE.SphereGeometry(1, 12, 10);
// Recursos compartidos de los efectos. Las partículas con material compartido no se desechan al terminar (own:false).
const FXG = { puff:new THREE.IcosahedronGeometry(1, 1), chip:new THREE.BoxGeometry(1,1,1), casing:new THREE.CylinderGeometry(0.03,0.03,0.11,6), shell:new THREE.CylinderGeometry(0.07,0.07,0.34,10), disc:new THREE.CircleGeometry(1, 28) };
const FXM = { spark:new THREE.MeshBasicMaterial({ color:0xffd27a }), ember:new THREE.MeshBasicMaterial({ color:0xff7a2a }), brass:new THREE.MeshLambertMaterial({ color:0xd0a640 }) };
// Tope de efectos simultáneos según la calidad (cada efecto es una llamada de dibujo y el humo es translúcido)
let FX_MAX = 500;
const fxQ = () => OPTIONS.calidad==='alta' ? 1 : OPTIONS.calidad==='media' ? 0.6 : 0.3;
const rnd = (a, b) => a + Math.random()*(b-a);     // solo efectos visuales: no afecta la simulación
// Avisos de juego que siempre se muestran; el resto de efectos se descarta si hay demasiados
// (combates grandes o repeticiones aceleradas).
const FX_KEEP = new Set(['marker','warn','pulse','timer']);
function addFx(obj, life, kind, extra){
  FX_MAX = OPTIONS.calidad==='alta' ? 380 : OPTIONS.calidad==='media' ? 240 : 140;
  if(effects.length > FX_MAX*1.4 && !FX_KEEP.has(kind)){
    if(extra && extra.pooled){ PUFF_POOL.push(obj); return; }
    if((!extra || extra.own!==false) && obj.material) obj.material.dispose();
    if(kind==='tracer') obj.geometry.dispose();
    return;
  }
  scene.add(obj); effects.push(Object.assign({ obj, life, max:life, kind, own:true }, extra||{}));
}
// Partícula física: gravedad, rebote en el suelo y giro. Al final se encoge.
function particle(g, m, x, y, z, vx, vy, vz, size, life, opt={}){
  if(effects.length > FX_MAX) return;
  const p = new THREE.Mesh(g, m); p.position.set(x, y, z); p.scale.setScalar(size); p.rotation.set(rnd(0,6), rnd(0,6), 0); p.castShadow = !!opt.shadow;
  addFx(p, life, 'phys', { v:new THREE.Vector3(vx, vy, vz), spin:opt.spin ?? 8, bounce:opt.bounce ?? 0.35, size, own:false, smoke:opt.smoke||0, st:0, floor:terrainH(x + vx*0.4, z + vz*0.4) + 0.04 });
}
// Bocanada de humo o polvo: sube, se expande y se desvanece
const PUFF_POOL = [];   // mallas de humo libres para reutilizar
function puff(x, y, z, size, color, life, rise, op=0.55, dx, dz){
  if(effects.length > FX_MAX) return;
  op = Math.min(0.95, op*1.5);   // el sprite es más translúcido que la antigua esfera
  const m = PUFF_POOL.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ map:TEX.smoke, transparent:true, depthWrite:false }));   // nube suave que mira a la cámara
  m.material.color.setHex(color); m.material.opacity = op; m.material.rotation = rnd(0, 6.28);
  m.position.set(x, y, z); m.scale.setScalar(size*0.4);
  addFx(m, life, 'smoke', { size, rise, op, dx:dx ?? rnd(-0.4,0.4), dz:dz ?? rnd(-0.4,0.4), drag:dx!==undefined, own:false, pooled:true });
}
function flash(x, y, z, size, color, life){
  const m = new THREE.Mesh(fxSphere, new THREE.MeshBasicMaterial({ color, transparent:true, opacity:1, depthWrite:false, blending:THREE.AdditiveBlending }));
  m.position.set(x, y, z); m.scale.setScalar(size); addFx(m, life, 'flash', { size });
}
// Misiles y cohetes visibles (solo render). La simulación aplica el daño al disparar; aquí el proyectil vuela en
// curva desde la boca del arma, corrige el rumbo hacia la posición actual del blanco, deja estela y explota al llegar.
const MISIL_TIPO = {
  misil:     { largo:1.1, radio:0.08, color:0xd8dcdf, vel:26, arco:0.5, humo:0xb4afa7, guiado:1 },
  misilsam:  { largo:1.2, radio:0.085, color:0xe6e9ec, vel:30, arco:1.6, humo:0xc2bdb5, guiado:1 },
  cohete:    { largo:0.75, radio:0.065, color:0x6b6f62, vel:22, arco:0.3, humo:0x8f887d, guiado:0.25 },
  antitanque:{ largo:0.7, radio:0.085, color:0x5d6447, vel:18, arco:0.35, humo:0x9d968a, guiado:0.6 }
};
const MISIL_PROTO = new Map();
function misilModelo(w){
  if(!MISIL_PROTO.has(w)){
    const T = MISIL_TIPO[w], g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color:T.color }), oscuro = new THREE.MeshLambertMaterial({ color:0x2e3134 });
    const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(T.radio, T.radio, T.largo*0.75, 8), m); cuerpo.rotation.x = Math.PI/2; g.add(cuerpo);
    const punta = new THREE.Mesh(new THREE.ConeGeometry(T.radio*(w==='antitanque' ? 1.6 : 1), T.largo*0.25, 8), w==='antitanque' ? oscuro : m); punta.rotation.x = Math.PI/2; punta.position.z = T.largo*0.5; g.add(punta);
    for(let i=0; i<4; i++){ const a = new THREE.Mesh(new THREE.BoxGeometry(0.012, T.radio*3.2, T.largo*0.18), oscuro); a.rotation.z = i*Math.PI/2; a.position.z = -T.largo*0.3; g.add(a); }
    const llama = new THREE.Sprite(new THREE.SpriteMaterial({ map:TEX.smoke, color:0xffc070, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
    llama.scale.setScalar(0.7); llama.position.z = -T.largo*0.5; g.add(llama);
    MISIL_PROTO.set(w, g);
  }
  return MISIL_PROTO.get(w).clone();
}
function lanzarMisil(w, x0, y0, z0, tg, y1, alLlegar){
  const T = MISIL_TIPO[w];
  if(!T || effects.length > FX_MAX){ alLlegar(tg.x, y1, tg.z); return; }
  const d = Math.hypot(tg.x - x0, tg.z - z0) || 1, dur = Math.max(0.2, Math.min(0.9, d/T.vel)), fx = (tg.x - x0)/d, fz = (tg.z - z0)/d;
  const desvio = 1.2 - T.guiado, o = misilModelo(w); o.position.set(x0, y0, z0); o.lookAt(tg.x, y1, tg.z);
  addFx(o, dur, 'missile', { tgId:tg.id, x0, y0, z0, tx:tg.x, ty:y1, tz:tg.z, st:0, humo:T.humo, alLlegar, own:false,
    cx:x0 + fx*d*0.35 + rnd(-0.8, 0.8)*desvio, cy:y0 + T.arco + d*0.05, cz:z0 + fz*d*0.35 + rnd(-0.8, 0.8)*desvio });
  if(!effects.length || effects[effects.length-1].obj !== o) alLlegar(tg.x, y1, tg.z);   // descartado por el tope de efectos
}
let SCORCHES = [];
function scorch(x, z, r){
  SCORCHES = SCORCHES.filter(f => f.life > 0);
  if(SCORCHES.length >= 36){ const old = SCORCHES.shift(); old.life = Math.min(old.life, 0.6); }
  const m = new THREE.Mesh(FXG.disc, new THREE.MeshBasicMaterial({ color:0x1d1a16, transparent:true, opacity:0.5, depthWrite:false }));
  m.rotation.x = -Math.PI/2; m.position.set(x, terrainH(x, z) + 0.06 + Math.random()*0.01, z); m.scale.setScalar(r); addFx(m, 12, 'scorch'); const ef = effects[effects.length-1]; if(ef && ef.obj===m) SCORCHES.push(ef);
}
function sparks(x, y, z, n, power){
  for(let i=0; i<n; i++){ const a = rnd(0,6.28), s = rnd(1.5,3)*power; particle(FXG.chip, i%3 ? FXM.spark : FXM.ember, x, y, z, Math.cos(a)*s, rnd(2,4.5)*power, Math.sin(a)*s, rnd(0.05,0.1), rnd(0.4,0.9), { bounce:0.2, spin:14 }); }
}
// Escombros del color de la pieza destruida; los grandes dejan una estela de humo
function debris(x, y, z, colors, n, power){
  for(let i=0; i<n; i++){
    const a = rnd(0,6.28), s = rnd(1.5,4)*power*0.5, big = i < n/3;
    particle(FXG.chip, mat(colors[i%colors.length]), x+rnd(-0.4,0.4), y, z+rnd(-0.4,0.4), Math.cos(a)*s, rnd(3,7)*power*0.5, Math.sin(a)*s, big ? rnd(0.22,0.38) : rnd(0.08,0.2), rnd(1.6,3), { bounce:0.3, spin:rnd(5,12), smoke:big ? 1 : 0, shadow:big });
  }
}
// Bola de fuego: sprite aditivo que crece, sube y pasa de blanco a naranja y rojo oscuro
function fireball(x, y, z, size, life, delay, vx, vy, vz, core){
  if(effects.length > FX_MAX) return;
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map:TEX.fire, transparent:true, depthWrite:false, blending:core ? THREE.AdditiveBlending : THREE.NormalBlending }));   // núcleo luminoso o cuerpo de fuego con forma definida
  m.material.rotation = rnd(0, 6.28); m.position.set(x, y, z); m.scale.setScalar(size*0.3); m.visible = !delay; m.renderOrder = 5;   // el fuego se dibuja sobre el humo
  addFx(m, life, 'fire', { core:!!core, size, delay:delay||0, v:new THREE.Vector3(vx||0, vy||0, vz||0), spin:rnd(-1.5,1.5) });
}
let SHAKE = 0;   // vibración de cámara (solo visual)
// Explosión por etapas: destello y luz, bolas de fuego escalonadas, onda de polvo a ras de suelo, columna de humo
// que sube después, chispas y brasas. La cantidad depende de la calidad gráfica.
function explosion(x, z, size, y){
  const q = fxQ(), air = y!==undefined, yy = air ? y : terrainH(x, z) + size*0.3;
  flash(x, yy, z, size*0.35, 0xfff4d0, 0.07);
  if(q >= 0.6) lightFlash(x, yy + 1.2, z, Math.min(4, 1.2 + size*0.5), 0xffa04a, 0.25 + size*0.06);
  const big = size >= 2;   // destrucciones: espectáculo completo; impactos de armas: versión reducida
  const nf = big ? Math.max(2, Math.round((2 + size*1.3)*q)) : Math.max(1, Math.round(2*q));
  fireball(x, yy, z, size*0.9, 0.22 + size*0.03, 0, 0, 0.5, 0, true);                                         // núcleo luminoso breve
  for(let i=0; i<nf; i++){ const a = rnd(0,6.28), r = rnd(0,0.35)*size;
    fireball(x + Math.cos(a)*r, yy + rnd(-0.1,0.25)*size, z + Math.sin(a)*r, size*rnd(0.6,1.0), rnd(0.55,0.9) + size*0.07, i < 2 ? 0 : rnd(0,0.12), Math.cos(a)*rnd(0.5,1.6)*size*0.5, rnd(0.8,2.2)*Math.sqrt(size), Math.sin(a)*rnd(0.5,1.6)*size*0.5); }
  if(!air && big){
    const ring = new THREE.Mesh(geo('onda', () => new THREE.RingGeometry(0.75, 1, 40)), new THREE.MeshBasicMaterial({ color:0xc8ad7c, transparent:true, opacity:0.55, depthWrite:false, side:THREE.DoubleSide }));
    ring.rotation.x = -Math.PI/2; ring.position.set(x, terrainH(x, z) + 0.08, z); ring.scale.setScalar(size*0.3); addFx(ring, 0.45 + size*0.05, 'shock', { size });   // onda expansiva
    const nd = Math.round((2 + size*1.3)*q);
    for(let i=0; i<nd; i++){ const a = i/nd*6.28 + rnd(-0.2,0.2), sp = rnd(1.2,2.4)*size*0.6; puff(x + Math.cos(a)*size*0.3, terrainH(x,z) + 0.25, z + Math.sin(a)*size*0.3, size*rnd(0.45,0.7), 0xb59a6a, rnd(1.0,1.6), 0.15, 0.5, Math.cos(a)*sp, Math.sin(a)*sp); }   // polvo levantado
    if(size >= 1.3) scorch(x, z, size*0.55);
  }
  // Humo: primero gris claro mezclado con el fuego, luego una columna oscura que sube y se dispersa
  const ns = big ? Math.round((1 + size*0.9)*q) : Math.round(1.5*q + 0.4);
  for(let i=0; i<ns; i++) puff(x+rnd(-0.3,0.3)*size, yy+rnd(0,0.3)*size, z+rnd(-0.3,0.3)*size, size*rnd(0.6,1.0), i%2 ? 0x4a443e : 0x6e665a, rnd(1.4,2.2)+size*0.25, 0.7+size*0.15);
  const nc = big ? Math.round((1 + size*0.7)*q) : 0;
  for(let i=0; i<nc; i++) addFx(new THREE.Object3D(), 0.25 + i*0.12, 'timer', { own:false, done:() => puff(x+rnd(-0.25,0.25)*size, yy + size*0.4 + i*0.25*size, z+rnd(-0.25,0.25)*size, size*rnd(0.8,1.25), 0x2e2a26, rnd(2.2,3.4)+size*0.3, 0.9+size*0.25, 0.6) });
  sparks(x, yy, z, Math.round((big ? 3 + size*3 : 2)*q), Math.sqrt(Math.max(0.5, size)));
  if(big) for(let i=0; i<Math.round(size*1.5*q); i++){ const a = rnd(0,6.28), sp = rnd(2,5)*Math.sqrt(size); particle(FXG.chip, FXM.ember, x, yy, z, Math.cos(a)*sp, rnd(4,8)*Math.sqrt(size), Math.sin(a)*sp, rnd(0.05,0.09), rnd(1.0,1.8), { bounce:0.15, spin:10, smoke:size >= 2 && i < 3 ? 1 : 0 }); }   // brasas con estela
  // Vibración de cámara para explosiones grandes y cercanas al centro de la vista
  if(size >= 1.8){ const d = Math.hypot(x - cam.x, z - cam.z); SHAKE = Math.min(0.5, SHAKE + size*0.07*Math.max(0, 1 - d/40)); }
}
// Restos: el modelo carbonizado queda en el sitio echando humo y luego se hunde; la torreta sale despedida
function wreck(o, e){
  const w = o.g.clone(); w.position.copy(o.g.position);
  w.traverse(m => { if(!m.isMesh) return; if(m.geometry.type==='RingGeometry' || m.material===VCMAT.luz || m.material===LUZ_OFF || WIN_MAT.includes(m.material)) m.visible = false; else m.material = CHAR_MAT; });
  const tur = w.getObjectByName('turret');
  w.updateMatrixWorld(true);
  if(tur && !o.boat){
    const wp = new THREE.Vector3(); tur.getWorldPosition(wp); tur.parent.remove(tur);
    const pivot = new THREE.Group(); pivot.add(tur); tur.position.set(0,0,0); pivot.position.copy(wp); pivot.rotation.y = w.rotation.y;
    scene.add(pivot); effects.push({ obj:pivot, life:3.2, max:3.2, kind:'phys', v:new THREE.Vector3(rnd(-1.5,1.5), rnd(6,8), rnd(-1.5,1.5)), spin:rnd(3,6), bounce:0.25, size:1, own:false, smoke:1, st:0, keepScale:true, floor:0.4 });
  }
  addFx(w, o.boat ? 3 : 7, 'wreck', { own:false, st:0, boat:!!o.boat });
}
// Infantería abatida: cae hacia atrás y luego se hunde en la arena
function corpse(o){
  const c = o.g.clone(); c.position.copy(o.g.position);
  c.traverse(m => { if(m.isMesh && m.geometry.type==='RingGeometry') m.visible = false; });
  addFx(c, 3, 'corpse', { own:false, body:c.children.find(k => k.isGroup), dir:Math.random()<0.5 ? -1 : 1 });
}
// Aeronave derribada: cae girando con estela de humo y estalla al tocar el suelo
function fall(o, e){
  const c = o.g.clone(); c.position.copy(o.g.position);
  c.traverse(m => { if(m.isMesh && m.geometry.type==='RingGeometry') m.visible = false; });
  explosion(e.x, e.z, 1.2, AIR_Y);
  addFx(c, 4, 'fall', { own:false, v:new THREE.Vector3(Math.sin(o.yaw)*3, 0, Math.cos(o.yaw)*3), st:0, color:S.players[e.owner] ? PAL[S.players[e.owner].faction].hull : 0x777777 });
}
const SFX_ALIAS = { antitanque:'cohete', minigun:'rifle', misilsam:'misil' };   // armas nuevas con sonido y trazador existentes
const MUZZLE = { antitanque:0.95, minigun:1.25, misilsam:0.6, canon:2.1, torre:1.4, aa:1.3, misil:0.9, obus:2.3, cohete:0.9, rifle:0.7, heroe:0.95, ametralla:0.8, canonaval:2.2 };
const CASINGS = { minigun:3, rifle:1, heroe:1, ametralla:2, aa:2 };
function groundRing(x, z, r, color, life, kind){
  const m = new THREE.Mesh(geo(`gr${r}`, () => new THREE.RingGeometry(r*0.92, r, 48)), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.85, depthWrite:false, side:THREE.DoubleSide }));
  m.rotation.x = -Math.PI/2; m.position.set(x, terrainH(x, z) + 0.12, z);
  addFx(m, life, kind);
}
let PLANE_PROTO = null;
function supplyPlane(b){
  if(!PLANE_PROTO){ const g = new THREE.Group(); TINT = null; const P = PAL_UNIT.atlas;
    g.add(box(0.7, 0.6, 4.2, P.hull, 0, -0.3, 0), box(5.6, 0.1, 1.1, P.hull, 0, 0.05, 0.2), box(0.1, 1.0, 0.8, P.hull, 0, 0.2, -1.8), box(2.0, 0.08, 0.6, P.hull, 0, 0.2, -1.8));
    for(const x of [-1.6, -0.9, 0.9, 1.6]) g.add(cyl(0.18, 0.7, P.dark, x, -0.15, 0.6, 10));   // motores
    g.add(lamp(0.5, 0.18, 0.05, P.glass, 0, 0.05, 2.1));
    for(const c of g.children) c.rotation.x += (c.geometry.type==='CylinderGeometry') ? Math.PI/2 : 0;
    mergeGroup(g); PLANE_PROTO = g; }
  const p = PLANE_PROTO.clone(), dir = Math.random()*6.28, dx = Math.sin(dir), dz = Math.cos(dir), L = 46;
  p.position.set(b.x - dx*L, 11, b.z - dz*L); p.rotation.y = dir;
  addFx(p, 7, 'avion', { own:false, bx:b.x, bz:b.z, dx, dz, v:L*2/7, solto:false });
}
function updatePlane(f, o, dt){
  o.position.x += f.dx*f.v*dt; o.position.z += f.dz*f.v*dt;
  if(!f.solto && Math.hypot(o.position.x - f.bx, o.position.z - f.bz) < 3){ f.solto = true;
    const caja = new THREE.Group(); TINT = null; caja.add(box(0.7, 0.55, 0.7, 0x6b5a3a), box(0.74, 0.08, 0.74, 0x3a3a34, 0, 0.24, 0), cyl(0.02, 1.2, 0xd8d2c0, 0, 0.55, 0, 5));
    const para = new THREE.Mesh(geo('paraca', () => new THREE.SphereGeometry(0.9, 12, 6, 0, Math.PI*2, 0, Math.PI/2.2)), mat(0xd8cfb8)); para.position.y = 1.7; caja.add(para);
    caja.position.set(f.bx, 10, f.bz); addFx(caja, 5, 'caida_caja', { own:false, suelo:terrainH(f.bx, f.bz) + 0.5 }); }
}
function floatText(x, z, txt){
  const c = document.createElement('canvas'); c.width = 128; c.height = 48; const k = c.getContext('2d');
  k.font = 'bold 30px Bahnschrift, Arial'; k.textAlign = 'center'; k.lineWidth = 5; k.strokeStyle = 'rgba(0,0,0,0.75)'; k.strokeText(txt, 64, 34); k.fillStyle = '#f2c14e'; k.fillText(txt, 64, 34);
  const t = new THREE.CanvasTexture(c), m = new THREE.Sprite(new THREE.SpriteMaterial({ map:t, transparent:true, depthWrite:false, depthTest:false }));
  m.scale.set(2.4, 0.9, 1); m.position.set(x, terrainH(x, z) + 3.4, z); m.renderOrder = 10; addFx(m, 1.4, 'texto', { tex:t });
}
function orderMarker(x, z, color){
  const m = new THREE.Mesh(geo('mk',()=>new THREE.RingGeometry(0.6,0.85,28)), new THREE.MeshBasicMaterial({ color, transparent:true, depthWrite:false }));
  m.rotation.x = -Math.PI/2; m.position.set(x, terrainH(x, z) + 0.1, z);
  addFx(m, 0.6, 'marker');
}
const visAt = (x,z) => !!visGrid()[idx(toCell(x), toCell(z))];
hooks = {
  spawn(e){ const o = buildModel(e); scene.add(o.g); meshes.set(e.id, o); if(e.kind==='bld'){ clearVegetation(e); if(S.tick > 0){ flattenHMAP(e); updateGround(); } } if(e.kind==='unit' && e.owner===LOCAL && S.tick>1 && !REPLAY){ sfx('ready'); setTimeout(() => hablar('listo', e), 350); } },
  death(e){
    if(e.kind==='depot' || e.kind==='crate') return;
    if(e.owner!==LOCAL && !visLocal(e)) return;
    const o = meshes.get(e.id), q = fxQ();
    if(e.kind==='bld'){
      // Edificio: explosión principal, explosiones secundarias, escombros, humo persistente y marca quemada
      sfx('edificio', e.x, e.z); if(SFX.motor) SFX.motor.combate(0.3);
      const nn = e.n*CELL/LC, s = nn*2.2; explosion(e.x, e.z, s);   // nn: tamaño en celdas de diseño
      for(let k=0; k<3; k++) addFx(new THREE.Object3D(), 0.25+k*0.35, 'timer', { own:false, done:() => explosion(e.x+rnd(-1,1)*nn, e.z+rnd(-1,1)*nn, s*0.45) });
      debris(e.x, 1.2, e.z, [0x8a7a66, 0x5a5246, 0x3a3631, teamColor(e.owner)], Math.round(20*q), 6+nn);
      scorch(e.x, e.z, nn*1.7);
      for(let k=0; k<Math.round(6*q); k++) puff(e.x+rnd(-1,1)*nn, 1, e.z+rnd(-1,1)*nn, 1.6, 0x2e2a26, rnd(3,4.5), 1.4, 0.5);
      return;
    }
    const t = UT(e.owner, e.type), P = PAL[S.players[e.owner] ? S.players[e.owner].faction : 'atlas'];
    if(t.armor==='inf'){ if(o) corpse(o); puff(e.x, 0.3, e.z, 0.6, 0xb59a6a, 0.9, 0.3, 0.4); return; }   // infantería: cae, sin explosión
    sfx(e.air ? 'caida' : o && o.boat ? 'hundimiento' : 'boom', e.x, e.z); if(SFX.motor) SFX.motor.combate(0.2);
    if(e.air){ if(o) fall(o, e); else explosion(e.x, e.z, 2, AIR_Y); return; }                                 // aeronave: cae girando
    explosion(e.x, e.z, 2.4);
    debris(e.x, 0.8, e.z, [P.hull, P.dark, teamColor(e.owner)], Math.round(10*q), 6);
    if(o) wreck(o, e);
    if(!o || !o.boat) scorch(e.x, e.z, 1.7);
  },
  remove(e){ const o = meshes.get(e.id); if(o){ scene.remove(o.g); meshes.delete(e.id); } selected.delete(e.id); },
  shot(u, tg, w){
    if(!visLocal(u) && !visLocal(tg)) return;
    const facTir = S.players[u.owner] ? S.players[u.owner].faction : null;
    sfx(w, u.x, u.z, facTir);
    if(SFX.motor && (u.owner===LOCAL || tg.owner===LOCAL || Math.hypot(u.x-cam.x, u.z-cam.z) < cam.dist)) SFX.motor.combate(0.06);
    const y0 = u.air ? AIR_Y : w==='torre' ? 2.1 : u.kind==='bld' ? (u.type==='trinchera' ? 0.6 : 1.2) : w==='canon' ? 1.2 : w==='antitanque' ? 1.1 : 0.8, y1 = tg.air ? AIR_Y : tg.kind==='bld' ? 1.5 : 0.6;
    // Boca del arma: según la orientación de la torre (o del cuerpo) y el largo del cañón
    const o = meshes.get(u.id), q = fxQ();
    const yaw = o && o.turret ? (u.kind==='bld' ? o.turret.rotation.y : o.yaw + o.turret.rotation.y) : o ? o.yaw : Math.atan2(tg.x-u.x, tg.z-u.z);
    const fx = Math.sin(yaw), fz = Math.cos(yaw), len = u.air ? 0.6 : (MUZZLE[w] || 0.8), mx = u.x + fx*len, mz = u.z + fz*len;
    const big = w==='canon' || w==='obus' || w==='canonaval' || w==='torre';
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(mx, y0, mz), new THREE.Vector3(tg.x, y1, tg.z)]);
    if(MISIL_TIPO[w]){ g.dispose(); puff(mx, y0, mz, w==='antitanque' ? 1.0 : 0.7, MISIL_TIPO[w].humo, 1.3, 0.3, 0.5); if(w==='antitanque') puff(u.x - fx*0.9, y0, u.z - fz*0.9, 0.9, 0xc8bca8, 1.0, 0.2, 0.45); }   // humo del lanzamiento y contrafuego
    else addFx(new THREE.Line(g, (tracerMat[w] || tracerMat[SFX_ALIAS[w]] || tracerMat.rifle).clone()), w==='rifle' || w==='aa' || w==='minigun' ? 0.08 : 0.2, 'tracer');
    flash(mx, y0, mz, big ? 0.6 : 0.2, big ? 0xffc670 : 0xfff0b0, big ? 0.1 : 0.05);
    if(o) o.recoil = 1;
    if(big){
      if(q >= 0.6) lightFlash(mx, y0 + 0.5, mz, 1.6, 0xffc070, 0.09);                          // la boca ilumina el entorno
      puff(mx, y0, mz, 1.0, 0x9a9288, 1.2, 0.5, 0.45);                                       // humo de la boca
      if(u.kind==='unit' && !u.air) for(let k=0; k<Math.round(3*q); k++) puff(u.x+rnd(-0.8,0.8), 0.2, u.z+rnd(-0.8,0.8), 0.7, 0xc8ad7c, 0.8, 0.25, 0.35);   // polvo por la onda
      if(w==='canon' && u.kind==='unit' && Math.random() < q) particle(FXG.shell, FXM.brass, u.x - fx*0.5, 1.1, u.z - fz*0.5, -fx*1.2 + rnd(-0.5,0.5), rnd(2.5,3.5), -fz*1.2 + rnd(-0.5,0.5), 1, 2.6, { bounce:0.3, spin:7, shadow:true });
    }
    // Casquillos: salen por el lado derecho del arma, rebotan y quedan un momento en la arena
    const nc = CASINGS[w] || 0;
    for(let k=0; k<nc; k++){ if(Math.random() > q) continue; const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      particle(FXG.casing, FXM.brass, u.x + rx*0.22 + fx*0.2, y0 - 0.1, u.z + rz*0.22 + fz*0.2, rx*rnd(1.2,2.2) - fx*0.4, rnd(1.8,3), rz*rnd(1.2,2.2) - fz*0.4, 1, rnd(1.4,2.2), { bounce:0.45, spin:22 }); }
    if(MISIL_TIPO[w]) lanzarMisil(w, mx, y0, mz, tg, y1, (x, y, z) => { explosion(x, z, w==='cohete' ? 1.0 : 1.4, tg.air ? AIR_Y : undefined); sfx('boom', x, z); });
    else if(w!=='rifle' && w!=='minigun') explosion(tg.x + (u.x-tg.x)*0.1, tg.z + (u.z-tg.z)*0.1, 0.8, tg.air ? AIR_Y : undefined);
    else if(!tg.air && (tg.kind==='bld' || UT(tg.owner, tg.type).armor!=='inf') && Math.random() < q) sparks(tg.x + (u.x-tg.x)*0.1, y1, tg.z + (u.z-tg.z)*0.1, 2, 0.6);   // chispas en blindaje
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
    if(SFX.motor && (kind==='particulas' || kind==='nuclear')){ SFX.motor.tocar(`super-${kind}-impacto`, null, { vol:1 }); SFX.motor.agachar(8); SFX.motor.combate(1); }
    else sfx(kind==='shell' || kind==='rad' ? 'boom' : 'big', x, z);
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
  income(b, g){
    if(b.owner===LOCAL && visAt(b.x, b.z)) floatText(b.x, b.z, `+${g}`);
    const o = meshes.get(b.id); if(o && visAt(b.x, b.z) && S.players[b.owner].faction==='atlas'){ o.entregas = (o.entregas||0) + 1; if(o.entregas % 4 === 1) supplyPlane(b); }
  },
  upgraded(b, key){
    for(const e of S.ents){ if(e.dead || e.kind!=='bld' || e.owner!==b.owner || e.type!==MEJORAS[key].edificio) continue; const o = meshes.get(e.id); if(!o) continue;
      scene.remove(o.g); const n = buildModel(e); scene.add(n.g); meshes.set(e.id, n); if(visAt(e.x, e.z)) groundRing(e.x, e.z, e.n*CELL*0.7, 0xf2d16b, 1.2, 'pulse'); } if(b.owner!==LOCAL) return; sfx('chime'); toast(`Mejora terminada: ${MEJORAS[key].nombre}`); },
  superFire(p, b, x, z){
    const P = BT(p,b.type);
    groundRing(x, z, P.superR, p===LOCAL ? 0xe8a33d : 0xe0553d, 3, 'warn'); sfx('alert');
    const fase = { particulas:'super-particulas-carga', nuclear:'super-nuclear-lanzamiento', cohetes:'super-cohetes-lanzamiento' }[P.superKind];
    if(SFX.motor && fase){ SFX.motor.tocar(fase, null, { vol:1 }); SFX.motor.agachar(5); SFX.motor.combate(0.6); }
    toast(p===LOCAL ? `${P.nombre} disparado` : `Alerta: ${P.nombre.toLowerCase()} enemigo disparado`);
  },
  mission(kind, data){
    if(kind==='mensaje') showTransmission(data);
    else if(kind==='objetivos'){ if(data.filter(x => x==='ok').length > (MISSION_UI.lastOk||0)) sfx('obj'); MISSION_UI.lastOk = data.filter(x => x==='ok').length; renderObjectives(); }
  },
  heroDown(u){ if(u.owner===LOCAL){ sfx('alert'); toast(`${UT(u.owner,u.type).nombre} ha caído`); } else if(visLocal(u)) toast(`Héroe enemigo abatido: ${UT(u.owner,u.type).nombre}`); },
  rankUp(p, rank){ if(p===LOCAL) sfx('rank'); if(p===LOCAL) toast(`Ascenso a rango ${rank}: punto de comandante disponible`); }
};
const BOOM_DARK = new THREE.Color(0x7a2a10);
function updateEffects(dt){
  const q = fxQ();
  if(SHAKE > 0) SHAKE = Math.max(0, SHAKE - dt*1.6);
  updateFlashLights(dt);
  if(TEX.water) TEX.water.offset.set(TEX.water.offset.x + dt*0.03, TEX.water.offset.y + dt*0.017);
  WATER_TIME.value += dt;
  for(let i=effects.length-1; i>=0; i--){
    const f = effects[i]; f.life -= dt; const k = Math.min(1, 1 - f.life/f.max), o = f.obj;
    if(f.kind==='boom'){ o.scale.setScalar(f.size*(0.3+0.9*Math.sqrt(k))); o.material.opacity = 0.95*(1-k); o.material.color.lerp(BOOM_DARK, Math.min(1, dt*4)); }
    else if(f.kind==='flash'){ o.material.opacity = 1-k; o.scale.setScalar(f.size*(1+k)); }
    else if(f.kind==='fire'){
      if(f.delay > 0){ f.delay -= dt; f.life += dt; continue; }
      o.visible = true; o.position.addScaledVector(f.v, dt); f.v.multiplyScalar(Math.max(0, 1 - dt*2.5)); o.position.y += dt*0.6*f.size;
      o.scale.setScalar(f.size*(0.35 + 1.15*Math.sqrt(k))); o.material.rotation += f.spin*dt;
      if(f.core){ o.material.color.setRGB(1, Math.max(0.4, 1 - k*1.2), Math.max(0.1, 0.8 - k*1.6)); o.material.opacity = Math.pow(1-k, 2); }
      else { const c = Math.max(0.18, 1 - k*1.05); o.material.color.setRGB(c, c*Math.max(0.4, 1 - k*0.9), c*Math.max(0.25, 1 - k*1.1)); o.material.opacity = Math.min(1, (1-k)*1.6); }   // se apaga hacia humo oscuro
    }
    else if(f.kind==='caida_caja'){ if(o.position.y > f.suelo) o.position.y = Math.max(f.suelo, o.position.y - dt*2.2); o.rotation.y += dt*0.4; if(o.position.y <= f.suelo && k > 0.7) o.scale.setScalar(Math.max(0.01, (1-k)/0.3)); }
    else if(f.kind==='texto'){ o.position.y += dt*1.2; o.material.opacity = Math.min(1, (1-k)*2.5); if(f.life <= 0 && f.tex) f.tex.dispose(); }
    else if(f.kind==='avion'){ updatePlane(f, o, dt); }
    else if(f.kind==='shock'){ o.scale.setScalar(f.size*(0.3 + 2.4*Math.sqrt(k))); o.material.opacity = 0.55*(1-k)*(1-k); }
    else if(f.kind==='smoke'){
      o.position.y += f.rise*dt*(1-k*0.5); o.position.x += f.dx*dt; o.position.z += f.dz*dt;
      if(f.drag){ const dr = Math.max(0, 1 - dt*2.2); f.dx *= dr; f.dz *= dr; }
      o.scale.setScalar(f.size*(0.9+1.8*k)); o.material.opacity = f.op*(1-k)*Math.min(1, 0.3+k*6);
    }
    else if(f.kind==='phys'){
      const p = o.position, floor = f.floor || 0.04;
      f.v.y -= 14*dt; p.addScaledVector(f.v, dt);
      if(p.y < floor){ p.y = floor; if(f.v.y < 0){ f.v.y *= -f.bounce; f.v.x *= 0.5; f.v.z *= 0.5; f.spin *= 0.5; } }
      o.rotation.x += f.spin*dt; o.rotation.z += f.spin*0.7*dt;
      if(f.smoke && p.y > floor+0.05){ f.st -= dt; if(f.st <= 0){ f.st = 0.09/q; puff(p.x, p.y, p.z, 0.4, 0x4a4540, 0.8, 0.3, 0.45); } }
      if(!f.keepScale && k > 0.75) o.scale.setScalar(f.size*Math.max(0.01, 1-(k-0.75)*4));
      if(f.keepScale && k > 0.8) o.position.y -= dt*0.8;
    }
    else if(f.kind==='scorch'){ o.material.opacity = 0.5*Math.min(1, (1-k)*4); }
    else if(f.kind==='wreck'){
      if(f.boat){ o.position.y -= dt*0.5; o.rotation.z += dt*0.25; }
      else {
        f.st -= dt; if(f.st <= 0 && k < 0.75){ f.st = 0.22/q; puff(o.position.x+rnd(-0.4,0.4), 0.9, o.position.z+rnd(-0.4,0.4), 0.7, k < 0.3 ? 0x2e2a26 : 0x55504a, 1.8, 1.1, 0.5); if(k < 0.25 && Math.random() < 0.5) particle(FXG.chip, FXM.ember, o.position.x, 0.8, o.position.z, rnd(-1,1), rnd(2,4), rnd(-1,1), 0.06, 0.7, { bounce:0.2 }); }
        if(k > 0.8) o.position.y -= dt*0.9;
      }
    }
    else if(f.kind==='corpse'){
      if(f.body) f.body.rotation.x = f.dir*Math.min(1.5, k*12);
      if(k > 0.7) o.position.y -= dt*0.6;
    }
    else if(f.kind==='fall'){
      f.v.y -= 9*dt; o.position.addScaledVector(f.v, dt); o.rotation.y += dt*5; o.rotation.z = Math.min(0.9, o.rotation.z + dt*0.8);
      f.st -= dt; if(f.st <= 0){ f.st = 0.06/q; puff(o.position.x, o.position.y, o.position.z, 0.6, 0x2e2a26, 1.4, 0.4, 0.55); }
      if(o.position.y <= 0.4){
        explosion(o.position.x, o.position.z, 2.6); scorch(o.position.x, o.position.z, 1.8);
        debris(o.position.x, 0.6, o.position.z, [f.color, 0x3a3631, 0x5a564e], Math.round(9*q), 5);
        f.life = 0;
      }
    }
    else if(f.kind==='missile'){
      const m = meshes.get(f.tgId); if(m && m.g){ f.tx = m.g.position.x; f.tz = m.g.position.z; }   // sigue al blanco mientras exista
      const a = (1-k)*(1-k), b = 2*(1-k)*k, c = k*k, x = a*f.x0 + b*f.cx + c*f.tx, y = a*f.y0 + b*f.cy + c*f.ty, z = a*f.z0 + b*f.cz + c*f.tz;
      if(Math.abs(x - o.position.x) + Math.abs(z - o.position.z) + Math.abs(y - o.position.y) > 1e-4) o.lookAt(x, y, z);
      // Estela continua: bocanadas repartidas a lo largo del tramo recorrido en este cuadro (el misil avanza más de una unidad por cuadro)
      const px = o.position.x, py = o.position.y, pz = o.position.z, tramo = Math.abs(x - px) + Math.abs(y - py) + Math.abs(z - pz), nb = Math.min(Math.ceil(6*q), Math.ceil(tramo/(0.3/q)));
      for(let j=0; j<nb; j++){ const t = (j + 1)/nb; puff(px + (x - px)*t, py + (y - py)*t, pz + (z - pz)*t, rnd(0.4, 0.55), f.humo, rnd(1.6, 2.4), 0.1, 0.7, 0, 0); }
      o.position.set(x, y, z); o.children[o.children.length-1].scale.setScalar(rnd(0.55, 0.85));
      if(f.life <= 0 && !f.hecho){ f.hecho = true; f.alLlegar(x, y, z); }
    }
    else if(f.kind==='timer'){ if(f.life <= 0 && f.done) f.done(); }
    else if(f.kind==='marker'){ o.scale.setScalar(1.4-k*0.8); o.material.opacity = 1-k; }
    else if(f.kind==='warn'){ o.material.opacity = 0.35 + 0.5*Math.abs(Math.sin(f.life*6)); }
    else if(f.kind==='pulse'){ o.scale.setScalar(0.3+0.7*Math.min(1,k*2)); o.material.opacity = 0.9*(1-k); }
    else o.material.opacity = 1-k;
    if(f.life<=0){ scene.remove(o); if(f.kind==='tracer') o.geometry.dispose(); if(f.pooled) PUFF_POOL.push(o); else if(f.own && o.material) o.material.dispose(); effects.splice(i,1); }
  }
}
// ======================= ÍCONOS DE UNIDADES Y EDIFICIOS =======================
// Se usan las imágenes del catálogo docs/prompts-imagenes.md cuando existen; si no, el botón queda solo con texto.
const ICON_KEYS = {
  atlas:{ recolector:'helicoptero-carga', constructor:'plataforma-ingenieria', infanteria:'infanteria', ingeniero:'ingeniero', heroe:'comando-atlas', tanque:'tanque', antiaereo:'antiaereo', avion:'avion', lancha:'lancha', fragata:'fragata',
          centro:'centro-mando', recoleccion:'plataforma-carga', planta:'planta-energia', cuartel:'cuartel', fabrica:'fabrica', torre:'torre', aerodromo:'aerodromo', astillero:'astillero', superarma:'canon-particulas' },
  hierro:{ recolector:'camion-minero', constructor:'topadora', infanteria:'infanteria', ingeniero:'ingeniero', heroe:'mariscal-hierro', tanque:'tanque', pesado:'tanque-pesado', antiaereo:'antiaereo', helicoptero:'helicoptero-ataque', lancha:'lancha', fragata:'monitor-fluvial',
           centro:'centro-mando', recoleccion:'deposito-minero', planta:'planta-energia', cuartel:'cuartel', fabrica:'fabrica', torre:'torre', astillero:'astillero', superarma:'silo-nuclear' },
  guerrilla:{ recolector:'trabajador', constructor:'camion-grua', infanteria:'rebelde', ingeniero:'ingeniero', heroe:'jefe-rebelde', tecnico:'tecnico', artilleria:'artilleria', antiaereo:'antiaereo', lancha:'lancha-rapida', fragata:'fragata',
              centro:'campamento', recoleccion:'acopio', cuartel:'cuartel', fabrica:'taller', torre:'torre-vigilancia', tunel:'tuneles', astillero:'astillero', superarma:'tormenta-cohetes' }
};
// img/iconos.json lista los íconos disponibles (se regenera con: node pruebas/generar-iconos.js). Así no hay
// solicitudes a archivos que todavía no existen.
const ICON_OK = new Set(); let ICON_LIST = null;
function preloadIcons(f){
  const cargar = () => { for(const k of new Set(Object.values(ICON_KEYS[f] || {}))){ const n = `icono-${k}-${f}.png`; if(!ICON_LIST.includes(n) || ICON_OK.has(`${f}/${k}`)) continue; const img = new Image(); img.onload = () => ICON_OK.add(`${f}/${k}`); img.src = `img/${n}`; } };
  if(ICON_LIST) return cargar();
  fetch('img/iconos.json', { cache:'no-cache' }).then(r => r.ok ? r.json() : []).catch(() => []).then(l => { ICON_LIST = Array.isArray(l) ? l.filter(x => typeof x === 'string') : []; cargar(); });
}
function iconHtml(t){
  const f = S.players[LOCAL] && S.players[LOCAL].faction, k = f && ICON_KEYS[f] && ICON_KEYS[f][t];
  return k && ICON_OK.has(`${f}/${k}`) ? `<img class="ico" src="img/icono-${k}-${f}.png" alt="">` : '';
}

// ======================= CONTORNO DE SELECCIÓN =======================
// Casco invertido: copia de cada pieza (misma geometría) inflada a lo largo de sus normales y dibujada por la cara
// trasera. Solo se crea para lo seleccionado o señalado, así que no afecta el rendimiento general.
const OUTLINE_MATS = {};
function outlineMat(mode){
  if(OUTLINE_MATS[mode]) return OUTLINE_MATS[mode];
  const color = { sel:0x9be36b, hover:0xf2efe4, enemigo:0xe0553d }[mode];
  const m = new THREE.MeshBasicMaterial({ color, side:THREE.BackSide });
  m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed += normalize(normal) * 0.055;`); };
  return (OUTLINE_MATS[mode] = m);
}
function setOutline(o, mode){
  if((o.outMode||null) === mode) return;
  o.outMode = mode;
  if(mode && !o.outlines){
    o.outlines = [];
    const lit = []; o.body.traverse(m => { if(m.isMesh && m.material !== VCMAT.luz && m.material !== LUZ_OFF && !WIN_MAT.includes(m.material) && m.geometry.attributes.normal && m.geometry.type!=='RingGeometry') lit.push(m); });
    for(const m of lit){ const c = new THREE.Mesh(m.geometry, outlineMat(mode)); c.position.copy(m.position); c.rotation.copy(m.rotation); c.scale.copy(m.scale); c.renderOrder = -1; m.parent.add(c); o.outlines.push(c); }
  }
  if(o.outlines) for(const c of o.outlines){ c.visible = !!mode; if(mode) c.material = outlineMat(mode); }
}
// Entidad bajo el cursor (se consulta cada 0,1 s)
let HOVER = null, hoverT = 0;
function updateHover(dt){
  hoverT -= dt; if(hoverT > 0) return; hoverT = 0.1;
  const e = EDGE.inside ? pick(EDGE.x, EDGE.y) : null; HOVER = e ? e.id : null;
  const cur = !e || placing || targeting ? '' : e.owner===LOCAL ? 'pointer' : e.owner>=0 && isEnemy(LOCAL, e.owner) ? 'crosshair' : e.kind==='depot' ? 'pointer' : '';
  if(ov.style.cursor !== cur) ov.style.cursor = cur;
}
function lerpAngle(a, b, t){ let d = ((b-a+Math.PI*3)%(Math.PI*2))-Math.PI; return a + d*t; }
function syncMeshes(alpha, dt, time){
  updateLod();
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
      if(e.air){ o.alt = o.alt===undefined ? AIR_Y : o.alt + ((e.parked ? terrainH(x, z) + 0.45 : AIR_Y) - o.alt)*Math.min(1, dt*1.4); }
      if(e.air && !UT(e.owner,e.type).hover){ const camH = Math.sin(cam.pitch)*cam.dist; o.g.scale.setScalar(Math.max(1, (camH - o.alt)/Math.max(1, camH - AIR_Y))); }
      o.g.position.set(x, e.air ? (UT(e.owner,e.type).hover ? AIR_Y + Math.sin(time*2+e.id)*0.15 : o.alt + (e.parked ? 0 : Math.sin(time*2+e.id)*0.15)) : o.boat ? WATER_Y + 0.08 + Math.sin(time*1.6+e.id)*0.05 : terrainH(x, z), z); o.g.rotation.y = o.yaw;
      if(o.boat) o.body.rotation.z = Math.sin(time*1.3+e.id)*0.04;
      if(e.air && !o.rotor) o.body.rotation.z = moving ? 0 : 0.35;
      if(o.rotor) o.rotor.rotation.y += dt*25;
      if(o.star) o.star.rotation.y += dt*2;
      o.body.position.y = !o.tool && (e.working!=null || (e.order && e.order.type==='capture' && e.capT>0)) ? Math.abs(Math.sin(time*12))*0.12 : 0;
      // Constructor en obra: brazo soldador (Atlas), pala (Hierro) o grúa (Guerrilla) en movimiento, con chispas o polvo
      if(o.tool){
        const busy = e.working!=null, kk = Math.min(1, dt*6);
        if(o.fac==='atlas') o.tool.rotation.x += ((busy ? Math.sin(time*5)*0.3 - 0.15 : 0) - o.tool.rotation.x)*kk;
        else if(o.fac==='hierro') o.tool.rotation.x += ((busy ? -Math.abs(Math.sin(time*2.6))*0.4 : 0) - o.tool.rotation.x)*kk;
        else o.tool.rotation.y += ((busy ? Math.sin(time*1.4)*0.9 : 0) - o.tool.rotation.y)*kk;
        if(busy){ o.workT = (o.workT||0) - dt;
          if(o.workT <= 0){ o.workT = 0.14/fxQ(); const px = x + Math.sin(o.yaw)*1.5, pz = z + Math.cos(o.yaw)*1.5;
            if(o.fac==='hierro') puff(px+rnd(-0.4,0.4), 0.2, pz+rnd(-0.4,0.4), 0.6, 0xc8ad7c, 0.9, 0.3, 0.4);
            else { sparks(px, o.fac==='atlas' ? 1.0 : 0.8, pz, 2, 0.5); if(o.fac==='atlas') flash(px, 1.0, pz, 0.15, 0x9fe8ff, 0.06); } } }
      }
      // Helicóptero de carga: desciende y baja el gancho hasta el suelo mientras carga
      if(o.cable){
        const loading = e.hstate==='loading';
        o.alt = o.alt===undefined ? AIR_Y : o.alt + ((loading ? 3.4 : AIR_Y) - o.alt)*Math.min(1, dt*2);
        const L = loading ? Math.max(1, o.alt - 0.62 - 1.3) : 1;
        o.winchL = (o.winchL||1) + (L - (o.winchL||1))*Math.min(1, dt*2.5);
        o.cable.scale.y = o.winchL; o.hook.position.y = -o.winchL;
        o.g.position.y = o.alt + Math.sin(time*2+e.id)*0.12;
        if(loading && o.cargo) o.cargo.visible = e.htimer < Math.round(1.2*TICK_HZ);   // el contenedor aparece al engancharlo
      } else if(e.type==='recolector' && o.cargo && e.hstate==='loading') o.cargo.visible = e.htimer < Math.round(1.2*TICK_HZ);
      if(o.turret){ const aim = tg ? Math.atan2(tg.x-e.x, tg.z-e.z) : o.yaw; o.turret.rotation.y = lerpAngle(o.turret.rotation.y, aim-o.yaw, Math.min(1, dt*8)); }
      if(o.cargo && e.hstate!=='loading') o.cargo.visible = e.carry>0;
      if(o.born){ const k = (performance.now() - o.born)/300; if(k >= 1){ o.born = 0; o.g.scale.setScalar(1); } else o.g.scale.setScalar(0.55 + 0.45*(1 - (1-k)*(1-k))); }
      // Animaciones según la distancia recorrida en este cuadro: ruedas, orugas y pasos
      const step = o.lx===undefined ? 0 : Math.hypot(x-o.lx, z-o.lz); o.lx = x; o.lz = z;
      if(step > 0 && step < 3){ if(o.axles) for(const a of o.axles) a.rotation.x += step/a.userData.r; o.walk += step*5.5;
        if(o.axles && o.axles.length && !e.air && !o.boat && OPTIONS.calidad!=='baja'){ o.trackD = (o.trackD||0) + step; if(o.trackD > 0.55){ o.trackD = 0; stampTrack(x, z, o.yaw, e.radius*0.55); } } }
      if(o.legs && o.legs.length===2){
        const sw = moving ? Math.sin(o.walk)*0.62 : 0, kk = Math.min(1, dt*14);
        o.legs[0].rotation.x += (sw - o.legs[0].rotation.x)*kk; o.legs[1].rotation.x += (-sw - o.legs[1].rotation.x)*kk;
        if(o.shins && o.shins.length===2){   // la rodilla se dobla cuando la pierna pasa hacia adelante con el pie en el aire
          const b0 = moving ? Math.max(0, Math.sin(o.walk + 1.2))*1.05 : 0, b1 = moving ? Math.max(0, Math.sin(o.walk + 1.2 + Math.PI))*1.05 : 0;
          o.shins[0].rotation.x += (b0 - o.shins[0].rotation.x)*kk; o.shins[1].rotation.x += (b1 - o.shins[1].rotation.x)*kk;
        }
        const sc = o.body.scale.x || 1, bob = moving ? Math.abs(Math.cos(o.walk))*0.028*sc : 0, lean = moving ? 0.07 : 0;
        o.body.position.y += bob; o.body.rotation.x += (lean - o.body.rotation.x)*kk;   // rebote del paso e inclinación al avanzar
      }
      if(o.rotor2) o.rotor2.rotation.x += dt*32;
      if(o.spin) o.spin.rotation.y += dt*2.5;
      // Retroceso del cañón: la torre retrocede sobre su propio eje y vuelve
      if(o.turret && o.turret.userData.base){
        o.recoil = Math.max(0, (o.recoil||0) - dt*5);
        const b = o.turret.userData.base, r = o.recoil*o.recoil*0.24, a = o.turret.rotation.y;
        o.turret.position.set(b.x - Math.sin(a)*r, b.y, b.z - Math.cos(a)*r);
      }
      // Vehículo muy dañado: humo negro
      if(e.hp < e.maxhp*0.35 && !o.legs.length && OPTIONS.calidad!=='baja'){ o.hurtT = (o.hurtT||0) - dt; if(o.hurtT <= 0){ o.hurtT = 0.3/fxQ(); puff(x, (e.air ? AIR_Y : 0.8), z, 0.45, 0x2e2a26, 1.3, 0.8, 0.45); } }
      // Polvo detrás de los vehículos terrestres y estela de los barcos
      if(moving && !e.air && (o.boat || (o.axles && o.axles.length)) && OPTIONS.calidad!=='baja'){
        o.dustT -= dt;
        if(o.dustT <= 0){ o.dustT = 0.14/fxQ(); const bx = x - Math.sin(o.yaw)*1.2, bz = z - Math.cos(o.yaw)*1.2;
          puff(bx + rnd(-0.4,0.4), 0.15, bz + rnd(-0.4,0.4), o.boat ? 0.5 : 0.6, o.boat ? 0xe8f0f2 : 0xc8ad7c, 0.9, 0.3, o.boat ? 0.45 : 0.32); }
      }
    } else if(e.kind==='depot'){
      const nv = Math.max(1, Math.ceil(3*e.amount/e.max));
      if(o.nivel !== nv){ o.nivel = nv; o.g.remove(o.body); o.body = propBody('depot', nv); o.g.add(o.body); }
      o.g.position.y = terrainH(e.x, e.z); }
    else if(e.kind==='crate'){ o.g.position.set(e.x, terrainH(e.x, e.z), e.z); o.body.rotation.y = time*0.6; }
    else {
      o.g.position.y = terrainH(e.x, e.z);
      o.body.scale.y = e.built ? 1 : 0.12 + 0.88*e.bprog;
      if(o.scaffold) o.scaffold.visible = !e.built;
      if(e.built && o.wasBuilt === false){ o.pop = performance.now(); if(OPTIONS.calidad!=='baja') for(let k=0; k<6; k++){ const a = k/6*6.28, r = e.n*CELL*0.55; puff(e.x+Math.cos(a)*r, 0.3 + terrainH(e.x, e.z), e.z+Math.sin(a)*r, 0.7, 0xe0cba0, 1.0, 0.5, 0.22); } }
      o.wasBuilt = e.built;
      if(o.pop){ const k = (performance.now() - o.pop)/350; if(k >= 1){ o.pop = 0; o.g.scale.setScalar(1); } else o.g.scale.setScalar(1 + Math.sin(k*Math.PI)*0.05); }
      const off = e.built && e.owner>=0 && ((S.power[e.owner] && S.power[e.owner].low && BT(e.owner,e.type).power < 0) || e.offUntil > S.tick);
      if(o.off !== off && o.luces){ o.off = off; for(const m of o.luces) m.material = off ? LUZ_OFF : VCMAT.luz; for(const m of o.vidrios) m.material = WIN_MAT[off ? 1 : 0]; }
      if(o.spin && e.built && !off) o.spin.rotation.y += dt*(e.type==='astillero' ? 0.4 : 1.6);   // antenas y radares se detienen sin energía
      if(o.gatling && e.lastFire!==undefined && S.tick - e.lastFire < 8) o.gatling.rotation.z += dt*28;
      // Humo de chimeneas y, si el edificio está dañado, humo negro con brasas
      if(e.built && e.owner>=0 && OPTIONS.calidad!=='baja'){
        o.smokeT = (o.smokeT||0) - dt;
        if(o.smokeT <= 0){
          o.smokeT = 0.55/fxQ();
          if(o.smoke) for(const [sx,sy,sz] of o.smoke) puff(e.x+sx, sy, e.z+sz, 0.6, 0xb5afa6, 2.6, 0.9, 0.35);
          if(e.hp < e.maxhp*0.5){ const r = e.n*CELL*0.3; puff(e.x+rnd(-r,r), 1.2, e.z+rnd(-r,r), 0.9, 0x2e2a26, 2.2, 1.2, 0.5); if(e.hp < e.maxhp*0.3) flash(e.x+rnd(-r,r), 0.9, e.z+rnd(-r,r), 0.35, 0xff8a3a, 0.4); }
        }
      }
      if(o.turret){ const tg = e.target!=null ? S.byId.get(e.target) : null; if(tg) o.turret.rotation.y = lerpAngle(o.turret.rotation.y, Math.atan2(tg.x-e.x, tg.z-e.z), Math.min(1, dt*8)); }
      if(o.beam) o.beam.rotation.z = e.owner>=0 ? Math.sin(time*2.2+e.id)*0.35 : 0;
    }
    // Contorno: verde si está seleccionado; blanco (propio) o rojo (enemigo) bajo el cursor
    const outMode = selected.has(e.id) ? 'sel' : HOVER===e.id && e.kind!=='depot' && e.kind!=='crate' ? (e.owner===LOCAL ? 'hover' : e.owner>=0 && isEnemy(LOCAL, e.owner) ? 'enemigo' : 'hover') : null;
    setOutline(o, outMode);
    if(o.ring) o.ring.visible = false;
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
function placeCamera(){ clampCam(); camera.position.set(cam.x, Math.sin(cam.pitch)*cam.dist, cam.z + Math.cos(cam.pitch)*cam.dist); camera.lookAt(cam.x, 0, cam.z);
  if(SHAKE > 0.002){ camera.position.x += (Math.random()-0.5)*SHAKE; camera.position.y += (Math.random()-0.5)*SHAKE*0.6; camera.position.z += (Math.random()-0.5)*SHAKE; } }
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
  // Inercia: la velocidad se acerca a la deseada en ~0,1 s (arranque y frenado suaves)
  const dx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), dz = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
  const kv = Math.min(1, dt*12); cam.vx = (cam.vx||0) + (dx*sp - (cam.vx||0))*kv; cam.vz = (cam.vz||0) + (dz*sp - (cam.vz||0))*kv;
  cam.x += cam.vx; cam.z += cam.vz;
  if(cam.tdist !== undefined){ cam.dist += (cam.tdist - cam.dist)*Math.min(1, dt*10); if(Math.abs(cam.tdist - cam.dist) < 0.05){ cam.dist = cam.tdist; cam.tdist = undefined; } }
  placeCamera();
}
const _v = new THREE.Vector3(), ray = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0), _ndc = new THREE.Vector2();
function toScreen(x, y, z){ _v.set(x,y,z).project(camera); return { x:(_v.x+1)/2*W, y:(1-_v.y)/2*H, ok:_v.z<1 }; }
function groundAt(sx, sy){
  _ndc.set(sx/W*2-1, -(sy/H)*2+1); ray.setFromCamera(_ndc, camera); const out = new THREE.Vector3();
  groundPlane.constant = 0; if(!ray.ray.intersectPlane(groundPlane, out)) return null;
  for(let i=0; i<3; i++){ groundPlane.constant = -terrainH(out.x, out.z); if(!ray.ray.intersectPlane(groundPlane, out)) break; }   // el plano sube a la altura del relieve
  groundPlane.constant = 0; return out;
}
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
  for(const e of S.ents){ if(e.kind==='unit' || e.kind==='crate' || e.dead || !seenLocal(e)) continue; if(g.x>=e.cx*CELL && g.x<=(e.cx+(e.w||e.n))*CELL && g.z>=e.cz*CELL && g.z<=(e.cz+(e.h||e.n))*CELL) return e; }
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
  const bt = BT(LOCAL,placing.type), w = footW(bt), h = footH(bt);
  placing.cx = Math.round(g.x/CELL - w/2); placing.cz = Math.round(g.z/CELL - h/2); placing.has = true;
}
function updateGhost(){
  if(!placing || !placing.has){ ghost.visible = false; return; }
  const bt = BT(LOCAL,placing.type), w = footW(bt), h = footH(bt);
  placing.valid = canPlace(LOCAL, placing.type, placing.cx, placing.cz, 0);
  ghost.visible = true; ghost.scale.set(w*CELL*0.98, 1.6, h*CELL*0.98);
  ghost.position.set((placing.cx+w/2)*CELL, 0.8 + terrainH((placing.cx+w/2)*CELL, (placing.cz+h/2)*CELL), (placing.cz+h/2)*CELL);
  ghost.material.color.setHex(placing.valid ? 0x9be36b : 0xe0553d);
}
function tryPlace(){
  if(!placing || !placing.has) return;
  const bt = BT(LOCAL,placing.type), ids = builderIds();
  if(!ids.length){ cancelPlacing(); return; }
  if(!placing.valid){ toast(BT(LOCAL, placing.type).naval ? 'El astillero debe tocar al menos 3 celdas de agua' : 'Ubicación no válida: terreno ocupado o sin explorar'); return; }
  if(S.players[LOCAL].credits < bt.cost){ toast('Créditos insuficientes'); return; }
  issue({ t:'place', ids, type:placing.type, cx:placing.cx, cz:placing.cz }); sfx('place'); hablar('construir', ids.map(id => S.ents.find(e => e.id===id)));
  orderMarker((placing.cx+footW(bt)/2)*CELL, (placing.cz+footH(bt)/2)*CELL, 0xe8a33d);
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
  const garB = tgt && tgt.kind==='bld' && tgt.owner===LOCAL && tgt.built && BT(LOCAL, tgt.type).garrison;
  if(garB){
    const inf = units.filter(u => UT(LOCAL,u.type).armor==='inf');
    if(inf.length){ issue({ t:'enter', ids:inf.map(u=>u.id), target:tgt.id }); orderMarker(tgt.x, tgt.z, 0xe8a33d); moveIds(others(inf)); return; }
  }
  if(tgt && tgt.type==='tunel' && tgt.owner===LOCAL && tgt.built && tgt.hp>=tgt.maxhp*0.99){
    const ground = units.filter(u => !u.air);
    if(ground.length){ issue({ t:'enter', ids:ground.map(u=>u.id), target:tgt.id }); orderMarker(tgt.x, tgt.z, 0xe8a33d); moveIds(others(ground)); return; }
  }
  if(tgt && tgt.kind==='bld' && tgt.owner>=0 && isEnemy(LOCAL, tgt.owner) && tgt.type!=='pozo'){
    const eng = units.filter(u => capturable(u, tgt));
    if(eng.length){ issue({ t:'capture', ids:eng.map(u=>u.id), target:tgt.id }); const rest = others(eng); if(rest.length) issue({ t:'attack', ids:rest.map(u=>u.id), target:tgt.id }); orderMarker(tgt.x, tgt.z, 0x6fd3e0); return; }
  }
  if(tgt && tgt.type==='pozo' && (tgt.owner<0 || isEnemy(LOCAL, tgt.owner))){
    const inf = units.filter(u => capturable(u, tgt));
    if(inf.length) issue({ t:'capture', ids:inf.map(u=>u.id), target:tgt.id });
    const rest = others(inf);
    if(tgt.owner>=0 && rest.length) issue({ t:'attack', ids:rest.map(u=>u.id), target:tgt.id }); else moveIds(rest);
    orderMarker(tgt.x, tgt.z, 0x6fd3e0); return;
  }
  if(tgt && tgt.owner>=0 && isEnemy(LOCAL, tgt.owner)){
    issue({ t:'attack', ids, target:tgt.id }); hablar('atacar', units);
    moveIds(units.filter(u => !UT(LOCAL,u.type).weapon));
    orderMarker(tgt.x, tgt.z, 0xe0553d); return;
  }
  if(tgt && tgt.kind==='bld' && tgt.owner===LOCAL && (!tgt.built || tgt.hp<tgt.maxhp)){
    const bs = units.filter(u => u.type==='constructor');
    if(bs.length){ issue({ t:'repair', ids:bs.map(u=>u.id), target:tgt.id }); hablar('construir', bs); orderMarker(tgt.x, tgt.z, 0xe8a33d); moveIds(others(bs)); return; }
  }
  if(tgt && tgt.kind==='depot'){
    const col = units.filter(u => u.type==='recolector');
    if(col.length){ issue({ t:'harvest', ids:col.map(u=>u.id), target:tgt.id }); hablar('mover', col); }
    moveIds(others(col));
    orderMarker(tgt.x, tgt.z, 0xe8a33d); return;
  }
  sfx('ack');
  if(g){ const am = forceAMove || aMove; hablar(am ? 'atacar' : 'mover', units); issue({ t:am?'amove':'move', ids, x:g.x, z:g.z }); orderMarker(g.x, g.z, am ? 0xe0553d : 0x9be36b); }
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
      lastTap = { t:0, id:null }; hablar('seleccion', tgt); return;
    }
    lastTap = { t:now, id:tgt.id };
    if(isTouch && selected.size && !selected.has(tgt.id) && tgt.kind==='bld' && selectedEnts().some(u => u.type==='constructor') && (!tgt.built || tgt.hp<tgt.maxhp)){ commandAt(sx, sy, false); return; }
    if(shift && tgt.kind==='unit'){ if(selected.has(tgt.id)) selected.delete(tgt.id); else { selectedEnts().forEach(e => { if(e.kind!=='unit') selected.delete(e.id); }); selected.add(tgt.id); } }
    else selectOnly([tgt.id]);
    if(tgt.kind==='unit' && selected.has(tgt.id)) hablar('seleccion', tgt);
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
  if(hits.length) hablar('seleccion', hits);
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
ov.addEventListener('wheel', e => { e.preventDefault(); cam.tdist = Math.max(24, Math.min(115, (cam.tdist ?? cam.dist) * (e.deltaY>0 ? 1.12 : 0.89))); }, { passive:false });
addEventListener('keydown', e => {
  if(e.target && e.target.tagName==='INPUT') return;
  if(e.key.startsWith('Arrow')){ keys.add(e.key); e.preventDefault(); }
  // W A S D mueven la cámara (por posición física de la tecla, sirve en cualquier distribución de teclado)
  const wasd = { KeyW:'ArrowUp', KeyA:'ArrowLeft', KeyS:'ArrowDown', KeyD:'ArrowRight' }[e.code];
  if(wasd && !e.ctrlKey && !e.metaKey && !e.altKey){ keys.add(wasd); e.preventDefault(); return; }
  const k = e.key.toLowerCase();
  if(k==='q' && selectedEnts().some(u => u.kind==='unit' && u.owner===LOCAL)) setAMove(true);
  else if(k==='x') stopSelected();
  else if(e.key==='Escape'){ if(targeting) cancelTargeting(); else if(placing) cancelPlacing(); else if(aMove) setAMove(false); else if(selected.size) selected.clear(); else toggleGameMenu(); }
  else if(e.key==='F10'){ e.preventDefault(); toggleGameMenu(); }
  else if(grupoTecla(e)) {}
  else if(e.key===' '){ const s = selectedEnts(); if(s.length){ cam.x = s.reduce((a,u)=>a+u.x,0)/s.length; cam.z = s.reduce((a,u)=>a+u.z,0)/s.length; } e.preventDefault(); }
});
addEventListener('keyup', e => { keys.delete(e.key); const wasd = { KeyW:'ArrowUp', KeyA:'ArrowLeft', KeyS:'ArrowDown', KeyD:'ArrowRight' }[e.code]; if(wasd) keys.delete(wasd); });
addEventListener('blur', () => keys.clear());   // evita que la cámara siga moviéndose al cambiar de ventana
addEventListener('keydown', e => { if(e.key && e.key.toLowerCase()==='m' && !(e.target && e.target.tagName==='INPUT')) setSound(!SFX.on); });
$('btnSound').addEventListener('click', () => { sfxInit(); setSound(!SFX.on); });
// Grupos de unidades: Ctrl (o Alt) + número asigna, Shift + número suma, número selecciona y doble pulsación centra la cámara.
// El 0 es el grupo 10. Chrome reserva Ctrl + 1…9 para cambiar de pestaña salvo en pantalla completa: por eso también vale Alt.
const GRUPOS = new Map(); let grupoUlt = { n:0, t:0 };
function grupoTecla(e){
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code); if(!m || !inMatch()) return false;
  const n = +m[1] || 10, mias = () => selectedEnts().filter(x => x.owner===LOCAL && (x.kind==='unit' || x.kind==='bld')).map(x => x.id);
  e.preventDefault();
  if(e.ctrlKey || e.metaKey || e.altKey){ const ids = mias(); if(!ids.length){ toast('Seleccione unidades para formar el grupo'); return true; } GRUPOS.set(n, ids); toast(`Grupo ${n}: ${ids.length} ${ids.length===1 ? 'elemento' : 'elementos'}`); return true; }
  if(e.shiftKey){ const ids = [...new Set((GRUPOS.get(n) || []).concat(mias()))]; GRUPOS.set(n, ids); toast(`Grupo ${n}: ${ids.length} elementos`); return true; }
  const vivos = (GRUPOS.get(n) || []).map(id => S.byId.get(id)).filter(x => x && !x.dead && x.owner===LOCAL);
  if(!vivos.length){ GRUPOS.delete(n); return true; }
  GRUPOS.set(n, vivos.map(x => x.id)); selected.clear(); vivos.forEach(x => selected.add(x.id)); setAMove(false); sfx('click');
  const ahora = performance.now();
  if(grupoUlt.n === n && ahora - grupoUlt.t < 350){ cam.x = vivos.reduce((a,u) => a+u.x, 0)/vivos.length; cam.z = vivos.reduce((a,u) => a+u.z, 0)/vivos.length; }
  grupoUlt = { n, t:ahora }; renderPanel(); return true;
}
// En pantalla completa el navegador permite capturar Ctrl + número
document.addEventListener('fullscreenchange', () => { try { if(document.fullscreenElement && navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(); else if(navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); } catch(e){} });
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
  if(!RECORDED){ RECORDED = true; recordGame({ modo:GAME_MODE, faccion:pl.faction, rival:S.players.length > 2 ? `${S.players.length - 1} rivales` : FACTIONS[S.players[1-LOCAL].faction].nombre, resultado:'derrota', duracion:s, mision:GAME_MODE==='mision' ? MISSION_UI.id : null }); }
  startGame(20261004, 'solo'); paused = true; powersEl.hidden = true; $('objectives').hidden = true; showHome();
});
btnPause.addEventListener('click', () => { paused = !paused; btnPause.textContent = paused ? 'Continuar' : 'Pausa'; btnPause.classList.toggle('on', paused); });
const helpEl = $('help');
$('btnHelp').addEventListener('click', () => { helpEl.hidden = false; });
$('btnHelpClose').addEventListener('click', () => { helpEl.hidden = true; });
helpEl.addEventListener('click', e => { if(e.target===helpEl) helpEl.hidden = true; });

// Minimapa con niebla
const mm = $('minimap'), mctx = mm.getContext('2d');
const mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = GRID;
const mbctx = mmBase.getContext('2d'); let mbImg = mbctx.createImageData(GRID, GRID);
// Ajusta al tamaño del mapa todo lo que el render creó con el tamaño anterior (niebla, relieve, suelo, minimapa)
let MUNDO_RENDER = WORLD;
function ajustarMundo(){
  MUNDO_U.value = WORLD; if(MUNDO_RENDER === WORLD && fogCur.length === WORLD*WORLD) return; MUNDO_RENDER = WORLD;
  FOGN = WORLD; fogData = new Uint8Array(FOGN*FOGN*4); fogCur = new Float32Array(FOGN*FOGN); fogTex.dispose();
  fogTex = new THREE.DataTexture(fogData, FOGN, FOGN, THREE.RGBAFormat); fogTex.magFilter = THREE.LinearFilter; fogTex.minFilter = THREE.LinearFilter; fogTex.needsUpdate = true; fogUniform.value = fogTex;
  HN = WORLD + 1; HMAP = new Float32Array(HN*HN); TERR_TEX.dispose();
  TERR_TEX = new THREE.DataTexture(new Uint8Array(HN*HN*4), HN, HN, THREE.RGBAFormat); TERR_TEX.magFilter = THREE.LinearFilter; TERR_TEX.minFilter = THREE.LinearFilter; TERR_U.value = TERR_TEX; HN_U.value = HN;
  ALL1 = new Uint8Array(NCELLS).fill(1); mmBase.width = mmBase.height = GRID; mbImg = mbctx.createImageData(GRID, GRID);
  buildGround(); TEX.sand.repeat.set(WORLD/9, WORLD/9); scene.userData.ground.material.map = TEX.sand; scene.userData.ground.material.needsUpdate = true;
}
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
  for(const r of (S.ruins || [])) for(let z=r.cz; z<r.cz+r.h; z++) for(let x=r.cx; x<r.cx+r.w; x++){ const i = (z*GRID+x)*4; if(!expGrid()[z*GRID+x]) continue; d[i] = 150; d[i+1] = 130; d[i+2] = 105; }
  mbctx.putImageData(mbImg, 0, 0);
  mctx.imageSmoothingEnabled = false; mctx.drawImage(mmBase, 0, 0, w, w);
  for(const e of S.ents){
    if(e.dead || !seenLocal(e)) continue;
    if(e.kind==='depot'){ mctx.fillStyle = '#d9a23a'; mctx.fillRect(e.cx*s, e.cz*s, (e.w||e.n)*s, (e.h||e.n)*s); }
    else if(e.kind==='crate'){ mctx.fillStyle = '#c9b07a'; mctx.fillRect(e.x/CELL*s-2, e.z/CELL*s-2, 4, 4); }
    else if(e.kind==='bld'){ mctx.fillStyle = e.owner<0 ? '#8a8070' : '#' + teamColor(e.owner).toString(16).padStart(6, '0'); mctx.fillRect(e.cx*s, e.cz*s, (e.w||e.n)*s, (e.h||e.n)*s); mctx.strokeStyle = e.type==='pozo' ? '#e9e2cc' : '#1b2224'; mctx.lineWidth = 2; mctx.strokeRect(e.cx*s, e.cz*s, e.n*s, e.n*s); }
    else { mctx.fillStyle = selected.has(e.id) ? '#ffffff' : '#' + new THREE.Color(teamColor(e.owner)).lerp(new THREE.Color(0xffffff), 0.3).getHexString(); const z = e.air ? 7 : 5; mctx.fillRect(e.x/CELL*s-z/2, e.z/CELL*s-z/2, z, z); }
  }
  const pts = [[0,0],[W,0],[W,H],[0,H]].map(([x,y]) => groundAt(x,y)).filter(Boolean);
  if(pts.length===4){ mctx.strokeStyle = '#f4efe2'; mctx.lineWidth = 2; mctx.beginPath(); pts.forEach((p,i) => { const X=p.x/WORLD*w, Y=p.z/WORLD*w; i ? mctx.lineTo(X,Y) : mctx.moveTo(X,Y); }); mctx.closePath(); mctx.stroke(); }
}

// Capa 2D: barras de vida, construcción, captura y punto de reunión
function drawOverlay(){
  octx.clearRect(0,0,W,H);
  if(S.mission) S.mission.def.objetivos.forEach((o,i) => {
    if(o.tipo!=='llegar' || S.mission.state[i]!=='pend') return;
    const p = toScreen(o.x*LC + LC/2, 0.1, o.z*LC + LC/2); if(!p.ok) return;   // coordenadas de diseño
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
    const p = renderPos(e), h = e.kind==='bld' ? (e.type==='torre' ? 3.2 : e.type==='trinchera' ? 1.6 : ['bunker','minigun','bateria'].includes(e.type) ? 2.4 : e.type==='pozo' ? 3 : 4.6) : e.air ? p.y+1.2 : 1.9;
    const s = toScreen(p.x, h, p.z); if(!s.ok) continue;
    const bw = e.kind==='bld' ? (e.n<=SUBC ? 34 : e.n > 8 ? 70 : 54) : 28, f = Math.max(0, e.hp/e.maxhp);
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
    const rankLock = bt.minRank && pl.rank < bt.minRank, dup = (bt.superCd && S.ents.some(e => !e.dead && e.owner===LOCAL && e.type===t)) || (bt.max && S.ents.filter(e => !e.dead && e.owner===LOCAL && e.type===t).length >= bt.max);
    const note = rankLock ? `Requiere rango ${bt.minRank}` : dup ? (bt.max ? `Máximo ${bt.max}` : 'Ya construida') : bt.naval ? 'requiere costa' : noPw ? 'sin energía' : powerTxt(bt.power);
    return `<button class="prod" data-place="${t}" ${cr<bt.cost||rankLock||dup?'disabled':''}>${iconHtml(t)}${bt.nombre}<small>${bt.cost} créditos</small><em>${note}</em></button>`; }).join('') + `</div>`;
}
const clock = sec => `${Math.floor(sec/60)}:${String(Math.max(0,sec)%60).padStart(2,'0')}`;
// Mejoras que se compran en el edificio b (las de otra facción no se muestran)
function upgradeMenu(b, cr){
  const pl = S.players[LOCAL], keys = Object.keys(MEJORAS).filter(k => MEJORAS[k].edificio===b.type && (!MEJORAS[k].faccion || MEJORAS[k].faccion===pl.faction));
  if(!keys.length) return '';
  let h = `<div class="sub" style="margin-top:8px"><b>${b.type==='investigacion' ? 'Tecnologías' : 'Mejoras'}</b></div><div class="row">`;
  for(const k of keys){ const U = MEJORAS[k], st = pl.ups[k];
    const note = st===2 ? '<em>Adquirida</em>' : st===1 ? '<em>En curso</em>' : pl.rank < U.rango ? `<em>Requiere rango ${U.rango}</em>`
      : U.inv && !hasBuilt(LOCAL,'investigacion') ? `<em>Requiere ${esc(BT(LOCAL,'investigacion').nombre.toLowerCase())}</em>` : `<em>${U.desc}</em>`;
    h += `<button class="prod" data-up="${k}" title="${U.desc}" ${upgradeOk(LOCAL, b, k) ? '' : 'disabled'}>${U.nombre}<small>${st===2 ? 'Aplicada' : U.cost + ' créditos · ' + U.time + ' s'}</small>${note}</button>`; }
  h += `</div>`;
  if(b.upq){ const U = MEJORAS[b.upq.key]; h += `<div class="sub" style="margin-top:6px">Investigando: ${U.nombre}${S.power[LOCAL].low ? ' <span class="warn">(mitad de velocidad por energía)</span>' : ''}</div><div class="bar prog"><i style="width:${pct(b.upq.prog/U.time)}"></i></div>`; }
  return h;
}
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
    } else if(own && b.built && t.income && b.type!=='pozo'){
      const low = S.power[LOCAL].low && t.power < 0;
      h += `<div class="sub" style="margin-top:6px">Genera ${Math.round(t.income*(low ? 0.5 : 1))} créditos cada 3 s${low ? ' <span class="warn">(mitad por energía insuficiente)</span>' : ''}.</div>`;
    } else if(own && b.built && t.garrison){
      const g = b.gar || [], cnt = Object.create(null); g.forEach(u => { const n = UT(u.owner,u.type).nombre; cnt[n] = (cnt[n]||0) + 1; });
      h += `<div class="tags"><span>Plazas ${g.length} / ${t.garrison}</span><span>Alcance ${t.range}</span>${t.resist ? `<span>Daño recibido ${Math.round(t.resist*100)} %</span>` : ''}${t.stealthBld ? `<span${stealthed(b)?' class="hot"':''}>${stealthed(b) ? 'Oculta' : 'Visible 3 s tras disparar'}</span>` : ''}</div>`;
      h += `<div class="sub" style="margin-top:6px">${g.length ? 'Dentro: ' + Object.entries(cnt).map(([n,v]) => `${esc(n)} × ${v}`).join(', ') + '. Disparan desde la posición; la infantería antitanque ataca blindados.' : 'Vacía: no dispara. Solo admite infantería.'}</div>`;
      h += `<div class="row"><button data-exit="1" ${g.length?'':'disabled'}>Desalojar</button></div><div class="sub">${TOUCH?'Tocar':'Clic derecho sobre'} la posición con infantería seleccionada para ocuparla.</div>`;
    } else if(own && t.weapon){
      const rol = t.weapon==='minigun' ? 'Antiinfantería' : t.weapon==='misilsam' ? 'Antiaérea y antiblindaje' : t.weapon==='rifle' ? 'Antiinfantería' : 'Antiaérea';
      let link = '';
      if(t.linkR){ const n = S.ents.filter(o => o!==b && !o.dead && o.kind==='bld' && o.owner===LOCAL && o.type===b.type && o.built && distTo(b,o) <= t.linkR).length;
        link = `<span${n?' class="hot"':''}>Enlace de datos: ${n ? `${Math.min(3,n)} batería${n>1?'s':''} (+${15*Math.min(3,n)} %)` : `sin baterías a ${t.linkR} o menos`}</span>`; }
      h += `<div class="tags"><span>Alcance ${t.range}</span><span>Daño ${Math.round(t.dmg)}</span><span>${rol}</span>${link}</div>` + (S.power[LOCAL].low ? `<div class="sub warn" style="margin-top:6px">Desactivada por energía insuficiente.</div>` : '');
    } else if(own && t.produce.length){
      h += `<div class="row">` + t.produce.map(u => { const ut = UT(LOCAL,u), q = b.queue.filter(x => x===u).length;
        const heroLock = ut.hero && S.players[LOCAL].rank < ut.minRank, heroDup = ut.hero && heroCount(LOCAL) > 0, hangar = esAvion(LOCAL, u) && avionesDe(LOCAL) >= cupoAviones(LOCAL);
        const note = heroLock ? `<em>Requiere rango ${ut.minRank}</em>` : heroDup ? '<em>En servicio</em>' : hangar ? `<em>Hangares llenos (${HANGARES} por aeródromo)</em>` : ut.hero ? `<em>${ut.rasgo || 'Único'}</em>` : '';
        return `<button class="prod" data-build="${u}" ${cr<ut.cost||b.queue.length>=5||heroLock||heroDup||hangar?'disabled':''}>${iconHtml(u)}${ut.nombre}<small>${ut.cost} créditos</small>${note}${q?`<span class="q">${q}</span>`:''}</button>`; }).join('');
      if(b.queue.length) h += `<button data-cancel="1">Cancelar último</button>`;
      h += `</div>`;
      if(b.queue.length){ const ut = UT(LOCAL,b.queue[0]); h += `<div class="sub" style="margin-top:6px">Produciendo: ${ut.nombre}${S.power[LOCAL].low ? ' <span class="warn">(mitad de velocidad por energía)</span>' : ''}</div><div class="bar prog"><i style="width:${pct(b.prog/ut.time)}"></i></div>`; }
      else h += `<div class="sub" style="margin-top:6px">${TOUCH?'Tocar':'Clic derecho en'} el mapa fija el punto de reunión.</div>`;
      if(b.type==='aerodromo') h += `<div class="sub">Hangares: ${avionesDe(LOCAL)} de ${cupoAviones(LOCAL)} aviones (${HANGARES} por aeródromo). Los aviones ociosos aterrizan en la pista.</div>`;
    }
    if(own && b.built) h += upgradeMenu(b, cr);
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
    else if(u.order && u.order.type==='enter'){ const tb = S.byId.get(u.order.id); estado = tb && tb.type!=='tunel' ? 'Hacia la posición defensiva' : 'Hacia el túnel'; }
    else if(t.engineer) estado = u.order ? 'En marcha' : 'Disponible';
    else estado = curTarget(u) ? 'En combate' : u.order ? 'En marcha' : 'En posición';
    let h = `<div class="title">${swatch(u.owner)}${t.nombre}</div><div class="sub">${Math.ceil(u.hp)} / ${u.maxhp} · ${estado}</div>${hpBar(u)}`;
    if(t.weapon){
      h += `<div class="tags"><span>Alcance ${t.range}</span><span>Daño ${t.dmg}</span>${u.air ? `<span>Munición ${u.ammo} / ${t.ammo}</span>` : `<span>Rango ${['recluta','veterano','élite','héroe'][u.vet]}</span>${u.vet ? `<span class="hot">Daño +${25*u.vet} % · Vida +${20*u.vet} %</span>` : ''}`}<span>Bajas ${u.kills}</span>`;
      if(u.owner===LOCAL && hordeActive(u, true)) h += `<span class="hot">Horda +25 %</span>`;
      if(t.capture) h += `<span>Captura pozos</span>`;
      if(t.stealth) h += `<span${stealthed(u)?' class="hot"':''}>${stealthed(u) ? 'Camuflado' : 'Visible 3 s tras disparar'}</span>`;
      if(t.minRange) h += `<span>Alcance mínimo ${t.minRange}</span>`;
      if(t.hero) h += `<span class="hot">${t.rasgo || 'Héroe'}</span><span>Regenera 1 %/s</span>`;
      h += `</div>`;
    }
    else if(t.engineer) h += `<div class="tags"><span>Captura edificios en 6 s</span><span>Pozos en 2 s</span><span>No puede capturar centros de mando</span></div>`;
    else if(u.type==='recolector'){
      const acopio = S.ents.some(b => b.kind==='bld' && !b.dead && b.built && b.owner===u.owner && b.type==='recoleccion');
      h += `<div class="tags"><span>Carga ${u.carry} / ${t.carry}</span><span>${TOUCH?'Tocar':'Clic derecho en'} un depósito para recolectar</span>${acopio ? '' : `<span class="hot">Construya un ${esc(BT(u.owner,'recoleccion').nombre.toLowerCase())} para descargar</span>`}</div>`;
    }
    if(hasBuilder) h += buildMenu(cr);
    panel.innerHTML = h; return;
  }
  const counts = Object.create(null); units.forEach(u => counts[u.type] = (counts[u.type]||0)+1);   // sin prototipo: «constructor» es un tipo de unidad
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
    else if(d.up){ const U = MEJORAS[d.up]; if(!U) return; if(S.players[LOCAL].credits < U.cost){ toast('Créditos insuficientes'); return; } issue({ t:'upgrade', id:b.id, type:d.up }); }
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
let CURRENT_MAP_FORZADO = false;
let soloFaction = 'atlas', soloMap = null, CURRENT_MAP = null, soloEnemy = 'aleatoria', soloCredits = 3000, soloLight = 'dia';
// Hora del día de cada misión (solo visual)
const MISSION_LIGHT = { 'atlas-3':'atardecer', 'atlas-4':'noche', 'hierro-3':'noche', 'hierro-4':'atardecer', 'guerrilla-2':'noche', 'guerrilla-4':'atardecer' };
function setSoloMap(m){
  if(m){ const err = mapError(m); if(err){ menuMsg(err, true); return; } }
  soloMap = m; $('mapName').textContent = m ? (m.nombre || 'Mapa personalizado') : 'Estándar'; $('btnMapStd').hidden = !m;
}
function readMapFile(input, done){
  input.onchange = e => { const f = e.target.files[0]; if(!f) return; f.text().then(t => done(JSON.parse(t))).catch(() => menuMsg('No fue posible leer el mapa', true)); e.target.value = ''; };
  input.click();
}
// Arte de la facción y retrato del comandante (imágenes del catálogo en public/img y public/juego/img)
const facArt = k => `<span class="fac-arte" style="background-image:url(../img/faccion-${k}.webp)"><img class="fac-retrato" src="img/comandante-${k}.png" alt="" loading="lazy"></span>`;
function factionCards(el, current, onPick){
  el.innerHTML = Object.entries(FACTIONS).map(([k,F]) => `<button class="faction${k===current?' on':''}" data-f="${k}">${facArt(k)}<b>${F.nombre}</b><span>${F.lema}. ${F.rasgos.join('. ')}.</span></button>`).join('');
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
const DEFAULT_OPTIONS = { voces:true, musica:'ambiente', calidad:'alta', calor:false, sombras:true, escala:100, paleta:'clasica', volumen:45, camara:1, fps:false, bordes:true };
function cleanOptions(o){
  const d = Object.assign({}, DEFAULT_OPTIONS); if(!o || typeof o!=='object') return d;
  if(['alta','media','baja'].includes(o.calidad)) d.calidad = o.calidad;
  if(['adaptativa','ambiente','no'].includes(o.musica)) d.musica = o.musica;
  d.voces = o.voces!==false; d.sombras = o.sombras!==false; d.fps = !!o.fps; d.bordes = o.bordes!==false; d.calor = o.calor===true;
  if([90,100,115,130].includes(o.escala)) d.escala = o.escala;
  if(PALETTES[o.paleta]) d.paleta = o.paleta;
  d.volumen = Math.max(0, Math.min(100, o.volumen|0)); d.camara = Math.max(0.5, Math.min(2, Number(o.camara)||1));
  return d;
}
let OPTIONS = (() => { try { return cleanOptions(JSON.parse(localStorage.getItem(OPTIONS_KEY))); } catch(e){ return Object.assign({}, DEFAULT_OPTIONS); } })();
let LAST_QUALITY = null;
// Material del suelo según la calidad (los dos se crean una sola vez)
const GROUND_MATS = {};
function groundMat(alta){
  const k = alta ? 'alta' : 'normal'; if(GROUND_MATS[k]) return GROUND_MATS[k];
  return (GROUND_MATS[k] = addFog(alta ? new THREE.MeshPhongMaterial({ vertexColors:true, map:TEX.sand, bumpMap:TEX.sand, bumpScale:0.05, specular:0x14110c, shininess:6 })
                                       : new THREE.MeshLambertMaterial({ vertexColors:true, map:TEX.sand })));
}
function applyOptions(rebuild){
  if(scene.userData.ground) scene.userData.ground.material = groundMat(OPTIONS.calidad==='alta');
  if(LAST_QUALITY && LAST_QUALITY !== OPTIONS.calidad){ UNIT_PROTO.clear(); BLD_PROTO.clear(); PROP_PROTO.clear(); rebuild = true; }
  LAST_QUALITY = OPTIONS.calidad;
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(OPTIONS.calidad==='alta' ? Math.min(dpr, 2) : OPTIONS.calidad==='media' ? 1 : 0.7);
  renderer.shadowMap.enabled = OPTIONS.sombras; sun.castShadow = OPTIONS.sombras;
  const ms = OPTIONS.calidad==='alta' ? 2048 : 1024;                       // tamaño del mapa de sombras según la calidad
  if(sun.shadow.mapSize.x !== ms){ sun.shadow.mapSize.set(ms, ms); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; } }
  for(const m of [...matCache.values(), ...Object.values(VCMAT), CHAR_MAT]) m.needsUpdate = true;
  document.documentElement.style.setProperty('--ui-zoom', OPTIONS.escala/100);
  const pal = PALETTES[OPTIONS.paleta]; TEAM[0] = pal.team[0]; TEAM[1] = pal.team[1]; TEAM_DARK[0] = pal.dark[0]; TEAM_DARK[1] = pal.dark[1];
  TEAM_EXTRA.forEach((c, i) => { TEAM[i+2] = c; TEAM_DARK[i+2] = TEAM_EXTRA_DARK[i]; NOTINT.add(c); NOTINT.add(TEAM_EXTRA_DARK[i]); });
  for(const c of [...PALETTES.clasica.team, ...PALETTES.clasica.dark, ...PALETTES.accesible.team, ...PALETTES.accesible.dark]) NOTINT.add(c);
  document.documentElement.style.setProperty('--atlas', pal.css[0]); document.documentElement.style.setProperty('--hierro', pal.css[1]);
  if(SFX.master) SFX.master.gain.value = OPTIONS.volumen/100;
  vozOpciones();
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
    <div class="maprow"><span>Efecto de calor</span>${seg('calor',[true,false],['Sí','No'])}</div>
    <div class="maprow"><span>Tamaño de la interfaz</span>${seg('escala',[90,100,115,130],['90 %','100 %','115 %','130 %'])}</div>
    <div class="maprow"><span>Colores de los equipos</span>${seg('paleta',['clasica','accesible'],['Azul y rojo','Azul y naranja (accesible)'])}</div>
    <div class="maprow"><span>Voces de las unidades</span>${seg('voces',[true,false],['Sí','No'])}</div>
    <div class="maprow"><span>Música</span>${seg('musica',['adaptativa','ambiente','no'],['Adaptativa','Solo ambiente','Apagada'])}</div>
    <label>Volumen: ${OPTIONS.volumen} %<input type="range" min="0" max="100" step="5" value="${OPTIONS.volumen}" data-range="volumen"></label>
    <label>Velocidad de la cámara: ${OPTIONS.camara.toFixed(1)}×<input type="range" min="0.5" max="2" step="0.1" value="${OPTIONS.camara}" data-range="camara"></label>
    <div class="maprow"><span>Desplazar la cámara con el mouse en los bordes</span>${seg('bordes',[true,false],['Sí','No'])}</div>
    <div class="maprow"><span>Mostrar cuadros por segundo</span>${seg('fps',[true,false],['Sí','No'])}</div>
    <p class="sub">Para computadores de laboratorio con poca capacidad gráfica: calidad Baja y sin sombras.</p>`;
}
function setOption(k, v){
  if(k==='sombras' || k==='fps' || k==='bordes' || k==='calor' || k==='voces') v = v==='true' || v===true; else if(k==='escala' || k==='volumen') v = Number(v); else if(k==='camara') v = Number(v);
  OPTIONS = cleanOptions(Object.assign({}, OPTIONS, { [k]:v })); saveOptions(); applyOptions(k==='paleta'); renderOptions();
  if(k==='musica' && SFX.motor) SFX.motor.modoMusica(OPTIONS.musica);
  if(k==='voces' || k==='volumen') vozOpciones();
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
  const total = Object.values(CAMPAIGNS).reduce((a,c) => a + c.misiones.length, 0);
  $('profStats').textContent = `${PROFILE.stats.victorias} victorias de ${PROFILE.stats.partidas} · ${done}/${total} misiones`;
}
// Sincronización opcional con Laravel: ?api=URL&perfil=TOKEN (token firmado, de corta duración)
const REMOTE = (() => { const api = safeUrl(params.get('api')), tok = params.get('perfil'); return api && tok && /^[\w\-]+\.[\w\-]+$/.test(tok) ? { api:api.replace(/\/$/, ''), tok } : null; })();
function syncMsg(t, err){ for(const id of ['syncMsg','campStartMsg']){ const el = $(id); if(el){ el.textContent = t; el.classList.toggle('err', !!err); } } }
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
const NET = { plazas:2, modo:'todos', ws:null, online:false, started:false, slot:0, queue:[], lastPkt:0, ping:null, pingT:null, sentResult:false, names:['',''], room:'', ended:null, overAt:0, faction:null };
document.addEventListener('click', e => { const b = e.target.closest('#onPlazas button, #onModo button'); if(!b) return;
  if(b.dataset.np){ NET.plazas = +b.dataset.np; document.querySelectorAll('#onPlazas button').forEach(x => x.classList.toggle('on', x===b)); $('onModoRow').hidden = NET.plazas <= 2; }
  if(b.dataset.om){ NET.modo = b.dataset.om; document.querySelectorAll('#onModo button').forEach(x => x.classList.toggle('on', x===b)); } });
function netSend(m){ if(NET.ws && NET.ws.readyState===1) NET.ws.send(JSON.stringify(m)); }
// Los avisos van a la pantalla visible (la escaramuza tiene su propio mensaje para mapas y repeticiones)
function menuMsg(t, err){ const el = $('skirmish').hidden ? $('menuMsg') : $('skirMsg'); el.textContent=t; el.classList.toggle('err', !!err); }
function roomMsg(t, err){ const el=$('roomMsg'); el.textContent=t; el.classList.toggle('err', !!err); }
function netConnect(url, room, name, token){
  if(NET.ws){ const old = NET.ws; NET.ws = null; try{ old.close(); }catch(e){} }
  menuMsg('Conectando…');
  let ws;
  try { ws = new WebSocket(url); } catch(e){ menuMsg('Dirección de servidor inválida', true); return; }
  NET.ws = ws;
  ws.onopen = () => netSend({ t:'join', room, name, token, plazas:NET.plazas || 2, modo:NET.modo || 'todos' });
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
      const nj = Array.isArray(m.factions) ? m.factions.length : 0, eqOk = m.equipos === undefined || (Array.isArray(m.equipos) && m.equipos.length === nj && m.equipos.every(t => Number.isInteger(t) && t >= 0 && t < 8));
      if(!Number.isInteger(m.seed) || ![2,4,6,8].includes(nj) || !Number.isInteger(m.slot) || m.slot < 0 || m.slot >= nj || !eqOk || !m.factions.every(f => FACTIONS[f]) || (m.map && (nj > 2 || mapError(m.map))) || !Array.isArray(m.log)){ toast('Mensaje de inicio inválido del servidor'); break; }
      LOCAL = m.slot; NET.names = m.names; NET.online = true; NET.started = true; NET.ended = null; NET.sentResult = false; NET.overAt = 0;
      $('room').hidden = true; $('menu').hidden = true; $('netwait').hidden = true;
      SFX.hush = true;
      CURRENT_TEAMS = Array.isArray(m.equipos) ? m.equipos : null;
      startGame(m.seed, 'online', m.factions, null, m.map || null);
      NET.queue = [];
      if(m.log && m.log.length){ const t0=performance.now(); for(const pkt of m.log) applyNetTick(pkt); updateFog(0, true); toast(`Partida recuperada: ${m.log.length} ticks en ${Math.round(performance.now()-t0)} ms`); }
      SFX.hush = false;
      NET.lastPkt = performance.now();
      break; }
    case 'tick': if(!Number.isInteger(m.n) || !Array.isArray(m.c)) break; NET.queue.push(m); NET.lastPkt = performance.now(); break;
    case 'paused': $('netwait').hidden = false; $('netwait').textContent = m.reason; break;
    case 'resumed': $('netwait').hidden = true; break;
    case 'retirado': if(Number.isInteger(m.slot) && NET.names) toast(`${String(NET.names[m.slot] || 'Un jugador').slice(0, 24)} quedó fuera de la partida (${m.motivo==='rendicion' ? 'se rindió' : 'abandono'})`); break;
    case 'pong': NET.ping = Math.round(performance.now() - m.ts); break;
    case 'desync': NET.ended = { winner:-1, reason:'desincronizacion' }; if(!S.over){ S.over = true; S.winner = -1; } break;
    case 'ended': NET.ended = { winner:m.winner, reason:m.reason }; if(!S.over){ S.over = true; S.winner = m.winner; } $('netwait').hidden = true; break;
    case 'error': if(NET.started) toast(m.msg); else if(!$('room').hidden) roomMsg(m.msg, true); else { $('room').hidden = true; $('menu').hidden = false; menuMsg(m.msg, true); } break;
  }
}
function renderRoom(m){
  const COLORES = ['azul','rojo','verde azulado','amarillo','violeta','naranja','cian','rosa'], eqs = m.modo==='equipos';
  $('roomPlayers').innerHTML = m.players.map((p,i) => `<tr><td>Jugador ${i+1} (${COLORES[i] || ''})${eqs && p ? ` · equipo ${p.team+1}` : ''}</td><td>${p ? `${esc(p.name)}${i===NET.slot?' (usted)':''} · ${FACTIONS[p.faction] ? FACTIONS[p.faction].nombre : ''} · ${p.connected ? (p.ready?'listo':'esperando') : 'desconectado'}` : '<span style="color:var(--muted)">libre</span>'}</td></tr>`).join('');
  const me = m.players[NET.slot];
  $('roomMap').textContent = m.mapName || 'Estándar';
  $('btnRoomMap').hidden = NET.slot!==0 || !!(me && me.ready); $('btnRoomMapStd').hidden = NET.slot!==0 || !m.mapName || !!(me && me.ready);
  if(me){ NET.faction = me.faction; factionCards($('roomFactions'), me.faction, f => { if(!me.ready) netSend({ t:'faction', f }); else roomMsg('Cancele «Listo» para cambiar de facción.'); }); }
  $('btnReady').textContent = me && me.ready ? 'Cancelar listo' : 'Listo';
  const libres = m.players.filter(p => !p).length;
  roomMsg(libres ? `Faltan ${libres} ${libres===1 ? 'jugador' : 'jugadores'}. Comparta el código de sala.` : '');
  $('roomMapRow').hidden = m.players.length > 2;
  $('roomPlazas').textContent = m.players.length > 2 ? `Mapa continental · ${m.players.length} jugadores · ${eqs ? 'dos equipos' : 'todos contra todos'}` : '';
}
function applyNetTick(pkt){
  if(pkt.n < S.tick) return;
  if(pkt.n > S.tick) console.warn('Tick fuera de orden', pkt.n, S.tick);
  for(const c of pkt.c){ c.tick = S.tick; S.cmdQueue.push(c); }
  simTick();
  if(S.tick % 30 === 0) netSend({ t:'hash', n:S.tick, h:stateHash() });
}
let soloSlotChoice = 'aleatoria', soloSlot = 0, soloPlayers = 2, soloEquipos = false, CURRENT_TEAMS = null, ELIMINADO = false;
$('startPos').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; soloSlotChoice = b.dataset.pos; document.querySelectorAll('#startPos button').forEach(x => x.classList.toggle('on', x===b)); });
$('btnSolo').addEventListener('click', () => {
  soloSlot = soloSlotChoice==='aleatoria' ? (Math.random() < 0.5 ? 0 : 1) : +soloSlotChoice;
  $('menu').hidden = true; $('skirmish').hidden = true; startGame(20261004 + Math.floor(Math.random()*1e6), 'solo'); paused = false; soloSlot = 0;
});
let soloDiff = 'normal';
$('soloDiff').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; soloDiff = b.dataset.diff; document.querySelectorAll('#soloDiff button').forEach(x => x.classList.toggle('on', x===b)); });
$('enemyFac').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; soloEnemy = b.dataset.ef; document.querySelectorAll('#enemyFac button').forEach(x => x.classList.toggle('on', x===b)); });
$('lightTabs').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; soloLight = b.dataset.lt; document.querySelectorAll('#lightTabs button').forEach(x => x.classList.toggle('on', x===b)); });
$('teamMode').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; soloEquipos = b.dataset.tm==='equipos'; document.querySelectorAll('#teamMode button').forEach(x => x.classList.toggle('on', x===b)); });
$('numPlayers').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; soloPlayers = +b.dataset.np; document.querySelectorAll('#numPlayers button').forEach(x => x.classList.toggle('on', x===b));
  const grande = soloPlayers > 2; $('teamRow').hidden = !grande; ['mapTpl','startPos','btnMapLoad'].forEach(id => { const el = $(id); if(el) el.style.opacity = grande ? 0.4 : 1; if(el) el.style.pointerEvents = grande ? 'none' : ''; });
  $('mapName').textContent = grande ? `Continental (${soloPlayers} jugadores)` : (soloMap ? (soloMap.nombre || 'Mapa personalizado') : 'Estándar'); });
$('startCredits').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; soloCredits = +b.dataset.cr; document.querySelectorAll('#startCredits button').forEach(x => x.classList.toggle('on', x===b)); });

// ======================= ENTRADAS: MENÚ, ESCARAMUZA Y CAMPAÑA =======================
// ?modo=escaramuza o ?modo=campania abre directamente esa pantalla (enlaces del panel de Laravel).
const ENTRY = ['escaramuza','campania'].includes(params.get('modo')) ? params.get('modo') : null;
const SCREENS = ['menu','skirmish','campStart','campaign'];
function showScreen(id){ for(const s of SCREENS) $(s).hidden = s!==id; }
function openSkirmish(){ showScreen('skirmish'); menuMsg(''); applyTheme(soloFaction); }
// Volver desde una pantalla de entrada: al panel si se llegó desde Laravel; si no, al menú principal.
function backFromEntry(){ if(ENTRY && RETURN_URL){ location.href = RETURN_URL; return; } showScreen('menu'); menuMsg(''); applyTheme(soloFaction); }
// Al terminar o abandonar una partida local se vuelve a la pantalla de origen.
function showHome(){ if(ENTRY==='escaramuza') openSkirmish(); else if(ENTRY==='campania') openCampStart(); else { showScreen('menu'); applyTheme(soloFaction); } }
if(ENTRY && RETURN_URL){ $('btnSkirBack').textContent = 'Volver al panel'; $('btnCampStartBack').textContent = 'Volver al panel'; }

function campProgress(f){
  const list = CAMPAIGNS[f].misiones, done = list.filter(m => PROFILE.campania[f][m.id]);
  const next = list.find(m => !PROFILE.campania[f][m.id]);
  return { done:done.length, total:list.length, stars:done.reduce((a,m) => a + PROFILE.campania[f][m.id].estrellas, 0), next };
}
function renderCampStart(){
  const facs = Object.keys(CAMPAIGNS), started = facs.filter(f => campProgress(f).done > 0), fresh = facs.filter(f => !started.includes(f));
  $('campContinue').innerHTML = started.length ? '<h3>Continuar campaña</h3><div class="factions">' + started.map(f => {
    const C = CAMPAIGNS[f], p = campProgress(f);
    return `<button class="faction" data-cf="${f}">${facArt(f)}<b>${esc(C.nombre)}</b><span>${FACTIONS[f].nombre} · ${p.done} de ${p.total} misiones · ${p.stars} de ${p.total*3} estrellas</span>`
      + `<span class="prog">${p.next ? 'Siguiente: ' + esc(p.next.nombre) : 'Campaña completada'}</span><div class="bar prog"><i style="width:${Math.round(100*p.done/p.total)}%"></i></div></button>`;
  }).join('') + '</div>' : '';
  $('campNewBlock').hidden = !fresh.length;
  $('campNew').innerHTML = fresh.map(f => { const C = CAMPAIGNS[f];
    return `<button class="faction" data-cf="${f}">${facArt(f)}<b>${FACTIONS[f].nombre}</b><span>${esc(C.nombre)}. ${esc(C.lema)}</span><span class="prog">Primera misión: ${esc(C.misiones[0].nombre)}</span></button>`; }).join('');
  applyTheme(started[0] || soloFaction);
}
function openCampStart(){ renderCampStart(); showScreen('campStart'); pullRemote().then(() => { if(!$('campStart').hidden) renderCampStart(); }); }
// Elegir campaña: abre sus misiones con la siguiente pendiente seleccionada (sin pestañas de otras facciones)
function openCampaign(f){ CAMP.faction = f; CAMP.sel = null; renderCampaign(); $('campTabs').hidden = true; showScreen('campaign'); }
$('campStart').addEventListener('click', e => { const b = e.target.closest('button[data-cf]'); if(!b) return; sfx('click'); openCampaign(b.dataset.cf); });
$('btnCampaign').addEventListener('click', openCampStart);
$('btnSkirmish').addEventListener('click', openSkirmish);
$('btnSkirBack').addEventListener('click', backFromEntry);
$('btnCampStartBack').addEventListener('click', backFromEntry);
$('btnCampBack').addEventListener('click', openCampStart);
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
           names:REC ? REC.names : ['Jugador 1','Jugador 2'], local:REC ? REC.local : 0, map:CURRENT_MAP, mission:S.mission ? S.mission.def : null, aiLevel:CURRENT_LEVEL, creditos:CURRENT_CREDITS, equipos:S.players.map(p => p.team), fecha:new Date().toISOString(), ticks:S.tick, winner:S.winner, log:S.log };
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
  CURRENT_TEAMS = Array.isArray(d.equipos) ? d.equipos : null;
  startGame(d.seed, 'replay', d.factions, d.ai || [], d.map || null, d.mission || null, d.aiLevel || 'normal', d.creditos || 3000);
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
addEventListener('message', ev => { const d = ev.data; if(!window.opener || ev.source!==window.opener) return; if(d && d.type==='fa-map' && d.map){ setSoloMap(d.map); if(soloMap){ openSkirmish(); menuMsg(`Mapa recibido del editor: ${soloMap.nombre || 'sin nombre'}`); } } });
if(window.opener){ try { window.opener.postMessage({ type:'fa-ready' }, '*'); } catch(e){} }

// Fin de partida
const endEl = $('end');
let endShown = false;
const REASONS = { abandono:'Un jugador abandonó la partida.', desincronizacion:'Partida anulada: los clientes perdieron la sincronía.', discrepancia:'Los clientes reportaron resultados distintos.' };
let RECORDED = false, GAME_MODE = 'solo', CURRENT_LEVEL = 'normal', CURRENT_CREDITS = 3000;
function showEnd(){
  endShown = true; endEl.hidden = false;
  $('btnReplaySave').hidden = !!REPLAY;
  ['btnNextMission','btnRetry','btnCampMenu'].forEach(id => $(id).hidden = true); $('endStars').textContent = '';
  if(REPLAY){
    $('endTitle').textContent = 'Fin de la repetición';
    $('endText').textContent = S.winner>=0 ? `Ganó ${S.players.filter(p => p.team===S.winner).length > 1 ? 'el equipo ' + (S.winner+1) : 'el jugador ' + (S.players.findIndex(p => p.team===S.winner)+1) + ' (' + FACTIONS[S.players.find(p => p.team===S.winner).faction].nombre + ')'} en ${clock(Math.floor(S.tick/TICK_HZ))}.` : `Duración ${clock(Math.floor(S.tick/TICK_HZ))}.`;
    $('btnRestart').textContent = 'Salir de la repetición'; return;
  }
  const s = Math.floor(S.tick/TICK_HZ), reason = NET.online && NET.ended ? NET.ended.reason : null, pl = S.players[LOCAL];
  const win = !ELIMINADO && S.winner>=0 && S.winner===S.players[LOCAL].team;
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
  $('endTitle').textContent = ELIMINADO ? 'Derrota' : S.winner<0 ? 'Partida anulada' : win ? 'Victoria' : 'Derrota';
  $('endText').textContent = (REASONS[reason] ? REASONS[reason]+' ' : '') + `Duración ${Math.floor(s/60)} min ${s%60} s. Bajas causadas: ${pl.kills}. Bajas sufridas: ${S.players[1-LOCAL].kills}. Rango alcanzado: ${pl.rank}.`;
  $('btnRestart').textContent = NET.online ? (RETURN_URL ? 'Volver al lobby' : 'Volver al menú') : 'Jugar de nuevo';
  if(!RECORDED){ RECORDED = true; recordGame({ modo: NET.online ? 'online' : 'solo', faccion:pl.faction, rival: NET.online ? String(NET.names[1-LOCAL]||'Rival') : S.players.length > 2 ? `${S.players.filter(p => isEnemy(LOCAL, S.players.indexOf(p))).length} rivales IA` : `IA ${FACTIONS[S.players[1-LOCAL].faction].nombre} (${DIFF_TXT[CURRENT_LEVEL]})`, resultado: S.winner<0 ? 'anulada' : win ? 'victoria' : 'derrota', duracion:s, mision:null }); }
}
function startGame(seed, mode, factions, aiList, map, mission, aiLevel, creditos){
  GRUPOS.clear();
  for(const o of meshes.values()) scene.remove(o.g); meshes.clear();
  for(const f of effects) scene.remove(f.obj); effects.length = 0;
  selected.clear(); setAMove(false); cancelPlacing(); cancelTargeting(); endShown = false; endEl.hidden = true; wasLow = false; RECORDED = false;
  if(SFX.voces) SFX.voces.callar();
  METRICS.cmds = 0; METRICS.frames = 0; METRICS.time = 0;
  if(mode==='online') cmdSink = c => { delete c.tick; netSend({ t:'cmd', c }); };
  else if(mode==='replay'){ LOCAL = 0; NET.online = false; cmdSink = () => {}; }
  else { LOCAL = mode==='solo' ? soloSlot : 0; NET.online = false; cmdSink = null; }
  if(mode!=='mision' && mode!=='replay'){ MISSION_UI.id = null; }
  // Facción enemiga elegida en la escaramuza, o una distinta a la propia al azar (solo interfaz, fuera de la simulación)
  const others = Object.keys(FACTIONS).filter(k => k!==soloFaction);
  const rival = FACTIONS[soloEnemy] ? soloEnemy : others[Math.floor(Math.random()*others.length)];
  let fac = factions || (LOCAL===0 ? [soloFaction, rival] : [rival, soloFaction]);
  // Más de 2 jugadores (solo escaramuza local): todos contra todos, posición al azar, facciones enemigas al azar o la elegida
  if(!factions && mode==='solo' && soloPlayers > 2){ LOCAL = Math.floor(Math.random()*soloPlayers); const ks = Object.keys(FACTIONS);
    fac = [...Array(soloPlayers)].map((_, p) => p===LOCAL ? soloFaction : FACTIONS[soloEnemy] ? soloEnemy : ks[Math.floor(Math.random()*ks.length)]); CURRENT_MAP_FORZADO = true;
    CURRENT_TEAMS = soloEquipos ? fac.map((_, p) => Math.floor(p / (soloPlayers/2))) : null; }
  else if(!factions) CURRENT_TEAMS = null;
  ELIMINADO = false;
  CURRENT_MAP = map !== undefined ? map : (mode==='solo' ? soloMap : null);
  CURRENT_LEVEL = aiLevel || (mode==='solo' ? soloDiff : 'normal');
  CURRENT_CREDITS = creditos || (mode==='solo' ? soloCredits : 3000);
  applyAmbiente(mode==='mision' && mission ? (MISSION_LIGHT[MISSION_UI.id] || 'dia') : mode==='solo' ? (soloLight==='aleatoria' ? ['dia','atardecer','noche'][Math.floor(Math.random()*3)] : soloLight) : 'dia');
  newGame(seed, mode==='online' ? [] : (mode==='replay' || mode==='mision') ? aiList : fac.map((_, p) => p).filter(p => p!==LOCAL), fac, fac.length > 2 ? null : CURRENT_MAP, mission || null, CURRENT_LEVEL, CURRENT_CREDITS, CURRENT_TEAMS);
  GAME_MODE = mode;
  ajustarMundo();
  preloadIcons(S.players[LOCAL].faction);   // íconos generados de la facción, si existen
  buildWater();
  REC = { names: mode==='online' ? NET.names.slice() : ['Jugador', 'IA'], local:LOCAL };
  buildRocks(); buildRuins(); buildVegetation(); updateFog(0, true);
  btnPause.hidden = mode!=='solo' && mode!=='mision'; $('pingChip').hidden = mode!=='online'; powersEl.hidden = mode==='replay';
  applyTheme(S.players[LOCAL].faction);
  $('tree').hidden = true; $('transmission').hidden = true; renderObjectives();
  const c = S.ents.find(e => e.kind==='bld' && e.owner===LOCAL && e.type==='centro');
  const sx = Math.sign(WORLD/2-c.x), sz = Math.sign(WORLD/2-c.z);
  cam.x = c.x + sx*(W<700?3:9); cam.z = c.z + sz*5; cam.dist = 50; cam.tdist = undefined;
  acc = 0;
  precompileShaders();
}
// Compila de antemano los shaders de la escena y de los efectos (muestras bajo el suelo), para que el primer
// disparo o la primera explosión no congelen el juego un instante.
let PRECOMPILED = '';
function precompileShaders(){
  if(PRECOMPILED === OPTIONS.calidad) return;
  PRECOMPILED = OPTIONS.calidad;
  const muestras = [
    new THREE.Mesh(fxSphere, new THREE.MeshBasicMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending })),
    new THREE.Mesh(fxSphere, new THREE.MeshBasicMaterial({ transparent:true, depthWrite:false })),
    new THREE.Sprite(new THREE.SpriteMaterial({ map:TEX.smoke, transparent:true, depthWrite:false })),
    new THREE.Mesh(FXG.chip, FXM.spark), new THREE.Mesh(FXG.casing, FXM.brass), new THREE.Mesh(FXG.chip, CHAR_MAT)
  ];
  for(const m of muestras){ m.position.set(WORLD/2, -50, WORLD/2); scene.add(m); }
  try { renderer.compile(scene, camera); } catch(e){}
  for(const m of muestras){ scene.remove(m); if(m.material !== FXM.spark && m.material !== FXM.brass && m.material !== CHAR_MAT) m.material.dispose(); }
}
$('btnRestart').addEventListener('click', () => {
  if(REPLAY){ exitReplay(); return; }
  if(GAME_MODE==='mision'){ endEl.hidden = true; startGame(20261004, 'solo'); paused = true; powersEl.hidden = true; $('objectives').hidden = true; showHome(); return; }
  if(NET.online){
    if(RETURN_URL){ location.href = RETURN_URL; return; }
    const ws = NET.ws; NET.ws = null; if(ws) ws.close(); NET.online = false; NET.started = false;
    endEl.hidden = true; $('menu').hidden = false; menuMsg(''); startGame(20261004, 'solo'); paused = true; return;
  }
  startGame((S.seed*16807 + 11) % 2147483647, 'solo');
});

// Bucle principal: simulación a 15 Hz, render a la tasa del navegador con interpolación
let acc = 0, last = performance.now(), uiT = 0;
// ======================= POSPROCESADO (calidad Alta) =======================
// Resplandor propio (r128 local no incluye EffectComposer): escena a una textura, paso de brillo con umbral,
// desenfoque gaussiano separable a 1/4 de resolución y composición con viñeta y leve gradación cálida.
const POST = { ready:false, w:0, h:0 };
const POST_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function postMat(frag, uniforms){ return new THREE.ShaderMaterial({ uniforms, vertexShader:POST_VS, fragmentShader:frag, depthTest:false, depthWrite:false }); }
function postInit(w, h){
  if(POST.ready){ POST.scene.dispose(); POST.a.dispose(); POST.b.dispose(); }
  const RT = renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget ? THREE.WebGLMultisampleRenderTarget : THREE.WebGLRenderTarget;
  POST.scene = new RT(w, h, { format:THREE.RGBAFormat });                      // con antialias si hay WebGL2
  const bw = Math.max(1, w>>2), bh = Math.max(1, h>>2);
  POST.a = new THREE.WebGLRenderTarget(bw, bh); POST.b = new THREE.WebGLRenderTarget(bw, bh);
  if(!POST.quad){
    POST.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); POST.qs = new THREE.Scene(); POST.qs.add(POST.quad);
    POST.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    POST.bright = postMat(`uniform sampler2D tMap; uniform float uTh; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tMap, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uTh, uTh + 0.12, l), 1.0); }`,
      { tMap:{ value:null }, uTh:{ value:0.97 } });
    POST.blur = postMat(`uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tMap, vUv).rgb * 0.227;
        c += (texture2D(tMap, vUv + uDir*1.385).rgb + texture2D(tMap, vUv - uDir*1.385).rgb) * 0.316;
        c += (texture2D(tMap, vUv + uDir*3.231).rgb + texture2D(tMap, vUv - uDir*3.231).rgb) * 0.070;
        gl_FragColor = vec4(c, 1.0); }`, { tMap:{ value:null }, uDir:{ value:new THREE.Vector2() } });
    POST.comp = postMat(`uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uStr; uniform float uTime; uniform float uCalor; uniform vec3 uTono; varying vec2 vUv;
      void main(){
        vec2 uv = vUv + vec2(sin(vUv.y*110.0 + uTime*2.4), cos(vUv.x*85.0 + uTime*1.9)) * 0.00055 * uCalor;    // calor que ondula el aire (opción)
        vec3 c = texture2D(tScene, uv).rgb + texture2D(tBloom, vUv).rgb * uStr;
        c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.06);                  // un poco más de saturación
        c *= uTono;                                                                   // tono del ambiente (día, atardecer o noche)
        float v = smoothstep(0.95, 0.3, length(vUv - 0.5)); c *= mix(0.78, 1.0, v);    // viñeta suave
        gl_FragColor = vec4(c, 1.0); }`, { tScene:{ value:null }, tBloom:{ value:null }, uStr:{ value:0.9 }, uTime:{ value:0 }, uCalor:{ value:0 }, uTono:{ value:new THREE.Vector3(1.03, 1.0, 0.96) } });
  }
  POST.w = w; POST.h = h; POST.ready = true;
}
function postPass(material, target){ POST.quad.material = material; renderer.setRenderTarget(target); renderer.render(POST.qs, POST.qc); }
function renderFrame(){
  if(OPTIONS.calidad !== 'alta'){ renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if(!POST.ready || POST.w !== size.x || POST.h !== size.y) postInit(size.x, size.y);
  renderer.setRenderTarget(POST.scene); renderer.render(scene, camera);
  POST.bright.uniforms.tMap.value = POST.scene.texture; postPass(POST.bright, POST.a);
  const tx = 1/POST.a.width, ty = 1/POST.a.height;
  for(let i=0; i<2; i++){
    POST.blur.uniforms.tMap.value = POST.a.texture; POST.blur.uniforms.uDir.value.set(tx*(1+i), 0); postPass(POST.blur, POST.b);
    POST.blur.uniforms.tMap.value = POST.b.texture; POST.blur.uniforms.uDir.value.set(0, ty*(1+i)); postPass(POST.blur, POST.a);
  }
  POST.comp.uniforms.uTime.value = performance.now()/1000; POST.comp.uniforms.uCalor.value = OPTIONS.calor ? 1 : 0; POST.comp.uniforms.uTono.value.set(...AMBIENTE.tono);
  POST.comp.uniforms.tScene.value = POST.scene.texture; POST.comp.uniforms.tBloom.value = POST.a.texture; postPass(POST.comp, null);
}

// Calidad adaptativa: solo cuenta segundos con la ventana visible y enfocada (el navegador frena las ventanas de fondo)
let SLOW_S = 0, FX_CLOCK = 0;
function adaptQuality(){
  if(document.visibilityState!=='visible' || !document.hasFocus() || paused || S.tick < 15 || OPTIONS.calidad==='baja'){ SLOW_S = 0; return; }
  SLOW_S = FPS.v < 28 ? SLOW_S + 1 : 0;
  if(SLOW_S >= 8){ SLOW_S = 0; const next = OPTIONS.calidad==='alta' ? 'media' : 'baja';
    OPTIONS = cleanOptions(Object.assign({}, OPTIONS, { calidad:next })); saveOptions(); applyOptions(false);
    toast(`Rendimiento bajo: la calidad gráfica pasó a ${next==='media' ? 'Media' : 'Baja'}. Puede cambiarla en Opciones.`); }
}

let linkLines = null, linkT = 0;
function updateLinks(dt){
  linkT -= dt; if(linkT > 0 && linkLines){ linkLines.material.opacity = 0.35 + 0.25*Math.sin(FX_CLOCK*5); return; }
  linkT = 0.3;
  const bs = S.ents.filter(e => !e.dead && e.kind==='bld' && e.type==='bateria' && e.built && e.owner>=0 && seenLocal(e)), pts = [];
  for(let i=0; i<bs.length; i++) for(let j=i+1; j<bs.length; j++){ const a = bs[i], b = bs[j], R = BT(a.owner,'bateria').linkR;
    if(a.owner===b.owner && Math.hypot(a.x-b.x, a.z-b.z) <= R && !(a.offUntil > S.tick) && !(b.offUntil > S.tick)){ const ya = terrainH(a.x,a.z)+1.85, yb = terrainH(b.x,b.z)+1.85; pts.push(a.x-0.6, ya, a.z-0.6, b.x-0.6, yb, b.z-0.6); } }
  if(!linkLines){ linkLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color:0x6fe3ff, transparent:true, opacity:0.5, depthWrite:false })); linkLines.frustumCulled = false; scene.add(linkLines); }
  linkLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); linkLines.geometry.computeBoundingSphere();
  linkLines.visible = pts.length > 0;
}
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
  updateSun(cam.x, cam.z, cam.dist);
  const fxt = REPLAY ? (REPLAY.paused ? 0 : REPLAY.speed) : 1;   // escala de tiempo visual (cámara lenta en repeticiones)
  FX_CLOCK += dt*fxt;
  syncMeshes(Math.min(1, acc/DT), dt*fxt, FX_CLOCK);
  updateGhost(); updateAim();
  updateFog(dt, false);
  updateEffects(dt*fxt);
  updateFlares(dt*fxt);
  updateTracks(dt*fxt);
  updateLinks(dt);
  updateHover(dt);
  drawOverlay();
  if(S.tick>0 && !S.over && !paused){ METRICS.frames++; METRICS.time += dt; }
  FPS.n++; FPS.t += dt; if(FPS.t >= 1){ FPS.v = Math.round(FPS.n/FPS.t); FPS.n = 0; FPS.t = 0; if(OPTIONS.fps) $('fpsVal').textContent = FPS.v; adaptQuality(); }
  uiT -= dt; if(uiT <= 0){ uiT = 0.2; renderPanel(); renderPowers(); updateTopbar(); drawMinimap(); if(S.mission) renderObjectives(); if(NET.online) $('pingVal').textContent = NET.ping==null ? '–' : NET.ping; }
  if(S.over && !endShown && (!NET.online || NET.ended || now - NET.overAt > 1500)) showEnd();
  else if(!S.over && !endShown && !REPLAY && S.players.length > 2 && S.tick % 15 === 0 && !S.ents.some(e => !e.dead && e.kind==='bld' && e.owner===LOCAL && e.type!=='pozo')){ ELIMINADO = true; showEnd(); }
  renderFrame();
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
powersEl.hidden = true;
if(ENTRY==='escaramuza'){ openSkirmish(); if(REMOTE) pullRemote(); }
else if(ENTRY==='campania') openCampStart();       // openCampStart ya sincroniza con la cuenta
else if(REMOTE) pullRemote();
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
