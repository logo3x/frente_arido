'use strict';
// Ruta del cliente para las pruebas. Por defecto public/juego; se puede cambiar con la variable CLIENTE_DIR.
const path = require('path');

const CLIENTE_DIR = process.env.CLIENTE_DIR || path.join(__dirname, '../public/juego');

module.exports = { CLIENTE_DIR, JUEGO_JS: path.join(CLIENTE_DIR, 'juego.js') };
