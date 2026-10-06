'use strict';
/**
 * Activa un lote de imágenes guardado en arte/imagenes/lotes/ (lo copia sobre public/img y public/juego/img).
 * Antes de copiar respalda lo publicado en arte/imagenes/respaldos/<fecha-hora>/, así nada se pierde.
 * Solo reemplaza los archivos que el lote trae; el resto queda como está. Al final regenera iconos.json.
 *
 *   node pruebas/activar-lote-imagenes.js                      → lista los lotes
 *   node pruebas/activar-lote-imagenes.js lote-1-2026-10-05-manual
 *   node pruebas/activar-lote-imagenes.js lote-1 --solo img/faccion-atlas.webp juego/img/comandante-atlas.png
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const RAIZ = path.resolve(__dirname, '..'), ARTE = path.join(RAIZ, 'arte', 'imagenes'), LOTES = path.join(ARTE, 'lotes');
const PUBLICO = path.join(RAIZ, 'public');
const SUBS = ['img', path.join('juego', 'img')];
const archivos = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => /\.(png|jpg|webp)$/i.test(n)) : [];

const lotes = fs.existsSync(LOTES) ? fs.readdirSync(LOTES).filter(n => fs.statSync(path.join(LOTES, n)).isDirectory()).sort() : [];
const pedido = process.argv[2];
if(!pedido){
  console.log('Lotes disponibles:');
  for(const l of lotes) console.log(`  ${l.padEnd(36)} ${SUBS.map(s => archivos(path.join(LOTES, l, s)).length).join(' sitio / ')} juego`);
  process.exit(0);
}
const lote = lotes.find(l => l === pedido) || lotes.find(l => l.startsWith(pedido));
if(!lote){ console.error(`No existe el lote «${pedido}».`); process.exit(1); }
const i = process.argv.indexOf('--solo'), solo = i > 0 ? process.argv.slice(i + 1).map(s => path.normalize(s)) : null;

// Respaldo de lo publicado
const sello = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const resp = path.join(ARTE, 'respaldos', sello);
let copiados = 0, respaldados = 0;
for(const s of SUBS){
  for(const n of archivos(path.join(LOTES, lote, s))){
    const rel = path.join(s, n); if(solo && !solo.includes(rel)) continue;
    const pub = path.join(PUBLICO, rel);
    if(fs.existsSync(pub)){ fs.mkdirSync(path.dirname(path.join(resp, rel)), { recursive:true }); fs.copyFileSync(pub, path.join(resp, rel)); respaldados++; }
    fs.mkdirSync(path.dirname(pub), { recursive:true }); fs.copyFileSync(path.join(LOTES, lote, rel), pub); copiados++;
  }
}
execFileSync(process.execPath, [path.join(__dirname, 'generar-iconos.js')], { stdio:'inherit' });
console.log(`Lote ${lote}: ${copiados} imágenes activadas; ${respaldados} anteriores respaldadas en ${path.relative(RAIZ, resp) || '(ninguna)'}.`);
