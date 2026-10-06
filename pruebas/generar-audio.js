'use strict';
/**
 * Actualiza public/juego/audio/audio.json con los archivos de sonido definitivos (.ogg y .mp3).
 * El juego solo carga los archivos de esta lista; los demás sonidos los genera su motor (public/juego/sonido.js).
 * Los WAV son marcadores del estudio y no se incluyen salvo con la opción --wav.
 * Uso: node pruebas/generar-audio.js [--wav]
 */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'public', 'juego', 'audio');
const conWav = process.argv.includes('--wav');
fs.mkdirSync(dir, { recursive: true });
const lista = fs.readdirSync(dir).filter(n => /^[a-z0-9-]+\.(ogg|mp3)$/.test(n) || (conWav && /^[a-z0-9-]+\.wav$/.test(n))).sort();
fs.writeFileSync(path.join(dir, 'audio.json'), JSON.stringify(lista, null, 1) + '\n');
console.log(`audio.json: ${lista.length} archivos`);
