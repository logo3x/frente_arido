'use strict';
// Genera verificar-navegador.html: página autocontenida que ejecuta la simulación en el navegador
// y compara las huellas con las calculadas en Node (V8). Abrirla en Firefox y Safari.
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(require('./rutas').JUEGO_JS, 'utf8');
const sim = html.split('// ======================= SIM-START =======================')[1].split('// ======================= SIM-END =======================')[0];
const camp = html.split('// ======================= CAMPAIGN-START =======================')[1].split('// ======================= CAMPAIGN-END =======================')[0];
const version = (sim.match(/SIM_VERSION = '([^']+)'/) || [])[1];
const mapa = JSON.parse(fs.readFileSync(path.join(__dirname, 'mapa-rio.json'), 'utf8'));
const TICKS = 4500;
const ESC = [
  { nombre:'Guerrilla contra Hierro', seed:20261004, factions:['guerrilla','hierro'], map:null },
  { nombre:'Atlas contra Guerrilla', seed:7, factions:['atlas','guerrilla'], map:null },
  { nombre:'Hierro contra Atlas, mapa del río', seed:11, factions:['hierro','atlas'], map:mapa },
  { nombre:'Hierro contra Guerrilla, mapa Canal (flota)', seed:21, factions:['hierro','guerrilla'], tpl:'canal' }
];
const ctx = {}; vm.createContext(ctx); vm.runInContext(sim + camp + '\nglobalThis.api = { S, newGame, simTick, stateHash, generateMap };', ctx);
for(const e of ESC) if(e.tpl){ e.map = ctx.api.generateMap(e.tpl, 3); delete e.tpl; }
for(const e of ESC){ ctx.api.newGame(e.seed, [0,1], e.factions, e.map); while(ctx.api.S.tick < TICKS && !ctx.api.S.over) ctx.api.simTick(); e.esperado = ctx.api.stateHash(); e.ticks = ctx.api.S.tick; }
const page = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Frente Árido · Verificación de determinismo</title>
<style>body{margin:0;background:#1d2220;color:#ece5d1;font-family:"Bahnschrift","Roboto Condensed","Arial Narrow",system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px}h1{font-size:26px;font-weight:600;margin:0 0 6px}p{color:#a9a48f;line-height:1.45}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:15px}td,th{text-align:left;padding:8px 6px;border-top:1px solid #344041}th{color:#a9a48f;font-weight:500}
.ok{color:#79c25a}.bad{color:#e0553d}button{font:inherit;color:#ece5d1;background:#5a3f16;border:1px solid #e8a33d;border-radius:3px;padding:8px 14px;cursor:pointer}
code{background:#263133;padding:2px 6px;border-radius:2px}</style></head>
<body><main>
<h1>Verificación de determinismo</h1>
<p>Simulación versión <code>${version}</code>. La página ejecuta ${ESC.length} partidas de IA contra IA de hasta ${TICKS} ticks y compara la huella final con la calculada en Node (motor V8).
Si las huellas coinciden en Chrome, Firefox y Safari, el multijugador entre navegadores distintos es seguro.</p>
<p>Navegador: <code id="ua"></code></p>
<button id="go">Ejecutar verificación</button>
<table><thead><tr><th>Escenario</th><th>Esperada (V8)</th><th>Este navegador</th><th>Resultado</th></tr></thead><tbody id="res"></tbody></table>
<p id="sum"></p>
</main>
<script>
${sim}
const ESC = ${JSON.stringify(ESC.map(e => ({ nombre:e.nombre, seed:e.seed, factions:e.factions, map:e.map, esperado:e.esperado, ticks:e.ticks })))};
document.getElementById('ua').textContent = navigator.userAgent;
const res = document.getElementById('res');
res.innerHTML = ESC.map((e,i) => '<tr><td>'+e.nombre+'</td><td>'+e.esperado+'</td><td id="h'+i+'">–</td><td id="r'+i+'">pendiente</td></tr>').join('');
document.getElementById('go').onclick = async () => {
  document.getElementById('go').disabled = true; let ok = 0;
  for(let i=0; i<ESC.length; i++){
    const e = ESC[i]; newGame(e.seed, [0,1], e.factions, e.map);
    while(S.tick < ${TICKS} && !S.over){ for(let k=0; k<150 && S.tick < ${TICKS} && !S.over; k++) simTick(); document.getElementById('r'+i).textContent = 'tick ' + S.tick; await new Promise(r => setTimeout(r, 0)); }
    const h = stateHash(), good = h === e.esperado && S.tick === e.ticks; if(good) ok++;
    document.getElementById('h'+i).textContent = h;
    const r = document.getElementById('r'+i); r.textContent = good ? 'coincide' : 'NO coincide'; r.className = good ? 'ok' : 'bad';
  }
  const sum = document.getElementById('sum');
  sum.textContent = ok === ESC.length ? 'Todas las huellas coinciden. Este navegador reproduce la simulación igual que V8.' : 'Hay diferencias. Este navegador no debe jugar en línea contra otros motores hasta revisar la simulación.';
  sum.className = ok === ESC.length ? 'ok' : 'bad';
};
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, 'verificar-navegador.html'), page);
console.log('verificar-navegador.html generado:', ESC.map(e => e.nombre + ' = ' + e.esperado).join('; '));
