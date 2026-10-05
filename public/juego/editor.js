"use strict";
const GRID = 64, N = GRID*GRID;
const BASE_ZONES = [[0,44,15,63], [48,0,63,19]];   // igual que en la simulación
const inBase = (x,z) => BASE_ZONES.some(([a,b,c,d]) => x>=a && x<=c && z>=b && z<=d);
const map = { terrain: new Array(N).fill('.'), depots: [], wells: [] };
let tool = 'r', brush = 1, painting = false;
const cv = document.getElementById('cv'), ctx = cv.getContext('2d'), CS = cv.width / GRID;
const $ = id => document.getElementById(id);

function mirrorCell(x,z){ return [GRID-1-x, GRID-1-z]; }
function mirror2(x,z){ return [GRID-2-x, GRID-2-z]; }
function setTerrain(x,z,ch){
  if(x<0||z<0||x>=GRID||z>=GRID||inBase(x,z)) return;
  if(ch!=='.' && resourceAt(x,z)) return;
  map.terrain[z*GRID+x] = ch;
}
function resourceAt(x,z){
  const hit = r => x>=r[0] && x<=r[0]+1 && z>=r[1] && z<=r[1]+1;
  return map.depots.find(hit) || map.wells.find(hit);
}
function canResource(x,z){
  for(let dz=0; dz<2; dz++) for(let dx=0; dx<2; dx++){
    const xx=x+dx, zz=z+dz;
    if(xx<0||zz<0||xx>=GRID||zz>=GRID||inBase(xx,zz)||map.terrain[zz*GRID+xx]!=='.'||resourceAt(xx,zz)) return false;
  }
  return true;
}
function addResource(kind, x, z){
  if(!canResource(x,z)) return false;
  if(kind==='depot') map.depots.push([x,z,Math.max(500,Math.min(20000,Number($('amount').value)||3000))]); else map.wells.push([x,z]);
  return true;
}
function removeResource(x,z){
  const r = resourceAt(x,z); if(!r) return;
  map.depots = map.depots.filter(d => d!==r); map.wells = map.wells.filter(w => w!==r);
}
function apply(x,z){
  const mir = $('mirror').checked;
  if(tool==='r' || tool==='w' || tool==='.'){
    const o = Math.floor((brush-1)/2);
    for(let dz=0; dz<brush; dz++) for(let dx=0; dx<brush; dx++){
      const xx=x+dx-o, zz=z+dz-o; setTerrain(xx,zz,tool);
      if(mir){ const [mx,mz]=mirrorCell(xx,zz); setTerrain(mx,mz,tool); }
    }
  } else if(tool==='depot' || tool==='well'){
    const [mx,mz] = mirror2(x,z);
    if(mir && (mx===x && mz===z)) addResource(tool,x,z);
    else if(mir){ if(canResource(x,z) && canResource(mx,mz)){ addResource(tool,x,z); addResource(tool,mx,mz); } }
    else addResource(tool,x,z);
  } else if(tool==='erase'){
    const r = resourceAt(x,z); if(!r) return;
    removeResource(x,z);
    if(mir){ const [mx,mz] = mirror2(r[0],r[1]); removeResource(mx,mz); }
  }
  draw(); validate();
}
function cellFrom(ev){
  const r = cv.getBoundingClientRect();
  return [Math.floor((ev.clientX-r.left)/r.width*GRID), Math.floor((ev.clientY-r.top)/r.height*GRID)];
}
cv.addEventListener('pointerdown', ev => { cv.setPointerCapture(ev.pointerId); painting = true; const [x,z] = cellFrom(ev); apply(x,z); });
cv.addEventListener('pointermove', ev => { if(!painting || !['r','w','.'].includes(tool)) return; const [x,z] = cellFrom(ev); apply(x,z); });
cv.addEventListener('pointerup', () => painting = false);
cv.addEventListener('pointercancel', () => painting = false);

function draw(){
  for(let z=0; z<GRID; z++) for(let x=0; x<GRID; x++){
    const ch = map.terrain[z*GRID+x];
    ctx.fillStyle = ch==='r' ? '#7d6f5d' : ch==='w' ? '#3d6e8c' : ((x+z)%2 ? '#cdb68a' : '#c8b184');
    ctx.fillRect(x*CS, z*CS, CS, CS);
  }
  BASE_ZONES.forEach(([a,b,c,d], i) => {
    ctx.fillStyle = i===0 ? 'rgba(47,111,216,.28)' : 'rgba(200,69,47,.28)';
    ctx.fillRect(a*CS, b*CS, (c-a+1)*CS, (d-b+1)*CS);
    ctx.fillStyle = '#ece5d1'; ctx.font = '600 15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(i===0 ? 'Base jugador 1' : 'Base jugador 2', (a+c+1)/2*CS, (b+d+1)/2*CS);
  });
  for(const [x,z,a] of map.depots){ ctx.fillStyle = '#d9a23a'; ctx.fillRect(x*CS+1, z*CS+1, CS*2-2, CS*2-2); ctx.fillStyle = '#1d2220'; ctx.font = '600 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(Math.round(a/100)/10+'k', (x+1)*CS, (z+1)*CS+4); }
  for(const [x,z] of map.wells){ ctx.fillStyle = '#8a8070'; ctx.fillRect(x*CS+1, z*CS+1, CS*2-2, CS*2-2); ctx.strokeStyle = '#ece5d1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo((x+0.5)*CS,(z+1.6)*CS); ctx.lineTo((x+1)*CS,(z+0.4)*CS); ctx.lineTo((x+1.5)*CS,(z+1.6)*CS); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(29,34,32,.18)'; ctx.lineWidth = 1;
  for(let i=0; i<=GRID; i+=8){ ctx.beginPath(); ctx.moveTo(i*CS,0); ctx.lineTo(i*CS,cv.height); ctx.moveTo(0,i*CS); ctx.lineTo(cv.width,i*CS); ctx.stroke(); }
}
// Conectividad terrestre entre las dos bases (búsqueda en anchura sobre celdas libres)
function connected(){
  const free = (x,z) => x>=0 && z>=0 && x<GRID && z<GRID && map.terrain[z*GRID+x]==='.' && !resourceAt(x,z);
  const seen = new Uint8Array(N), q = [[7,54]]; seen[54*GRID+7] = 1;
  while(q.length){
    const [x,z] = q.shift();
    if(x>=48 && z<=19) return true;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx, nz=z+dz; if(free(nx,nz) && !seen[nz*GRID+nx]){ seen[nz*GRID+nx]=1; q.push([nx,nz]); } }
  }
  return false;
}
function validate(){
  const blocked = map.terrain.filter(c => c!=='.').length, water = map.terrain.filter(c => c==='w').length;
  const conn = connected(), total = map.depots.reduce((a,d) => a+d[2], 0);
  const lines = [
    conn ? '<span class="ok">Las bases están conectadas por tierra.</span>' : '<span class="err">Las bases no están conectadas por tierra.</span>',
    `Terreno bloqueado: ${(blocked/N*100).toFixed(0)} % (agua ${(water/N*100).toFixed(0)} %).`,
    `Depósitos: ${map.depots.length} (${total.toLocaleString('es-CO')} créditos). Pozos: ${map.wells.length}.`
  ];
  if(map.depots.length > 24) lines.push('<span class="err">Máximo 24 depósitos.</span>');
  if(map.wells.length > 16) lines.push('<span class="err">Máximo 16 pozos.</span>');
  if(map.depots.length < 2) lines.push('<span class="err">Se recomiendan al menos 2 depósitos.</span>');
  $('status').innerHTML = lines.join('<br>');
  return conn && map.depots.length <= 24 && map.wells.length <= 16;
}
function exportData(){
  return { formato:'frente-arido-mapa', version:1, nombre:$('name').value.trim() || 'Mapa sin nombre', grid:GRID,
           terrain:map.terrain.join(''), depots:map.depots.map(d => d.slice()), wells:map.wells.map(w => w.slice()) };
}
function importData(d){
  if(!d || d.formato!=='frente-arido-mapa' || d.grid!==GRID || typeof d.terrain!=='string' || d.terrain.length!==N){ alert('El archivo no es un mapa válido de Frente Árido.'); return; }
  map.terrain = d.terrain.split('').map(c => 'rw.'.includes(c) ? c : '.');
  for(let z=0; z<GRID; z++) for(let x=0; x<GRID; x++) if(inBase(x,z)) map.terrain[z*GRID+x] = '.';
  map.depots = (d.depots||[]).filter(r => Array.isArray(r)).map(r => [r[0]|0, r[1]|0, r[2]|0]);
  map.wells = (d.wells||[]).filter(r => Array.isArray(r)).map(r => [r[0]|0, r[1]|0]);
  $('name').value = d.nombre || 'Mapa importado'; draw(); validate();
}
function clearAll(){ map.terrain = new Array(N).fill('.'); map.depots = []; map.wells = []; }
// Recursos del mapa estándar del juego
function standardResources(){
  map.depots = []; map.wells = [];
  for(const [x,z,a] of [[12,50,2500],[2,40,2500],[21,44,3500]]){ map.depots.push([x,z,a]); map.depots.push([62-x,62-z,a]); }
  map.depots.push([31,31,6000]);
  for(const [x,z] of [[14,30],[34,50]]){ map.wells.push([x,z]); map.wells.push([62-x,62-z]); }
  map.depots = map.depots.filter(([x,z]) => !inBase(x,z) && !inBase(x+1,z+1));
}
function randomMap(){
  clearAll(); standardResources();
  const seed = Math.random()*1000;
  const n = (x,z) => Math.sin(x*0.21+seed)*Math.cos(z*0.17+seed*0.7) + Math.sin((x+z)*0.09+seed*1.3)*0.6;
  for(let z=0; z<GRID; z++) for(let x=0; x<GRID; x++){
    if(x+z > GRID-1) continue;                         // medio mapa; el resto por simetría
    const v = n(x,z), ch = v > 0.95 ? 'r' : v < -0.9 ? 'w' : '.';
    if(ch!=='.'){ setTerrain(x,z,ch); const [mx,mz] = mirrorCell(x,z); setTerrain(mx,mz,ch); }
  }
  $('name').value = 'Mapa aleatorio';
}
document.getElementById('tools').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; tool = b.dataset.tool; document.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('on', x===b)); });
document.querySelectorAll('[data-brush]').forEach(b => b.addEventListener('click', () => { brush = +b.dataset.brush; document.querySelectorAll('[data-brush]').forEach(x => x.classList.toggle('on', x===b)); }));
$('btnNew').addEventListener('click', () => { clearAll(); draw(); validate(); });
$('btnStd').addEventListener('click', () => { standardResources(); draw(); validate(); });
$('btnRandom').addEventListener('click', () => { let k=0; do { randomMap(); k++; } while(!connected() && k<20); draw(); validate(); });
$('btnImport').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', e => { const f = e.target.files[0]; if(!f) return; f.text().then(t => importData(JSON.parse(t))).catch(() => alert('No fue posible leer el archivo.')); e.target.value = ''; });
$('btnExport').addEventListener('click', () => {
  if(!validate() && !confirm('El mapa tiene observaciones. ¿Exportar de todos modos?')) return;
  const d = exportData(), blob = new Blob([JSON.stringify(d)], { type:'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = (d.nombre.replace(/[^\w\-]+/g,'-').toLowerCase() || 'mapa') + '.json';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
});
// Abre el juego y le envía el mapa cuando avisa que está listo
let gameWin = null;
$('btnTest').addEventListener('click', () => { if(!validate() && !confirm('El mapa tiene observaciones. ¿Probar de todos modos?')) return; gameWin = window.open('index.html', 'frente-arido-prueba'); });
addEventListener('message', ev => { if(ev.data && ev.data.type==='fa-ready' && gameWin && ev.source===gameWin) gameWin.postMessage({ type:'fa-map', map:exportData() }, '*'); });
standardResources(); draw(); validate();
