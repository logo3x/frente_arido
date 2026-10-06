'use strict';
/**
 * Regenera public/juego/img/iconos.json con la lista de íconos disponibles (icono-<clave>-<facción>.png).
 * El juego solo carga los íconos de esa lista; si un ícono falta, el botón queda con texto.
 * Uso: node pruebas/generar-iconos.js   (después de copiar íconos nuevos a public/juego/img/)
 */
const fs = require('fs'), path = require('path');
const dir = path.join(require('./rutas').CLIENTE_DIR, 'img');
fs.mkdirSync(dir, { recursive: true });
const lista = fs.readdirSync(dir).filter(n => /^icono-[a-z0-9-]+-(atlas|hierro|guerrilla)\.png$/.test(n)).sort();
fs.writeFileSync(path.join(dir, 'iconos.json'), JSON.stringify(lista, null, 1) + '\n');
console.log(`iconos.json: ${lista.length} íconos`);
