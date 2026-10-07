'use strict';
// Exporta FRASES (public/juego/sonido.js) a frases.json con el nombre de archivo y el carácter de cada voz.
// Uso: node herramientas/voces/exportar-frases.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const raiz = path.resolve(__dirname, '../..'), c = { window:{}, performance, console }; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/juego/sonido.js'), 'utf8'), c);
const F = c.window.FASonido.FRASES, out = [];
// Carácter por facción: velocidad y tono (SSML). El héroe habla más grave y pausado; las órdenes de ataque, más rápido.
const CAR = { atlas:{ rate:1.08, pitch:-4 }, hierro:{ rate:1.0, pitch:-16 }, guerrilla:{ rate:1.14, pitch:-7 } };
for(const f in F) for(const [ev, cats] of Object.entries(F[f])) for(const [cat, l] of Object.entries(cats)) l.forEach((t, i) => {
  let { rate, pitch } = CAR[f];
  if(cat==='heroe'){ rate -= 0.06; pitch -= 8; }
  if(ev==='atacar'){ rate += 0.1; pitch += 4; }
  out.push({ archivo: cat==='_' ? `voz-${f}-${ev}-${i+1}` : `voz-${f}-${cat}-${ev}-${i+1}`, texto:t, faccion:f, evento:ev, rate:rate.toFixed(2), pitch });
});
fs.writeFileSync(path.join(__dirname, 'frases.json'), JSON.stringify(out, null, 1)); console.log(out.length, 'frases');
