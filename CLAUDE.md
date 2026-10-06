# CLAUDE.md · Frente Árido

Contexto del proyecto para Claude Code. Se carga automáticamente al abrir esta carpeta.

## Proyecto

- RTS para navegador: three.js r128 (cliente), Node.js con `ws` (servidor de partidas) y Laravel 11/12 (lobby, progreso, Elo).
- Autor y responsable: Mg. Luis Guillermo Oviedo Ochoa, profesor de Ingeniería Informática (UNIPAZ), desarrollador Laravel.
- Versión actual: **0.9.6** (`SIM_VERSION`). Grilla fina de 0,5 unidades (`SUBC = 4`); datos de diseño (mapas, misiones, bases) en celdas de 2 unidades convertidas con `L2F`. Próxima: 1.0 (ajustes del piloto con estudiantes).
- Historial de versiones y decisiones: @docs/DECISIONES.md

## Convenciones obligatorias

- Todo en **español**: interfaz, comentarios, mensajes, documentación y commits.
- Textos de interfaz y documentos: español neutro formal, **sin tuteo** (usar «seleccione», no «selecciona»), frases cortas, sin dramatismo.
- Documentos Word: Calibri, tamaño carta. Contenido técnico en tablas y listas.
- Explicaciones en el chat: breves. El detalle va en archivos.
- Diseño original: no usar nombres, arte ni sonido de juegos comerciales.

## Estructura

| Ruta | Contenido |
|---|---|
| `public/juego/juego.js` | Cliente completo: simulación, campaña, render, interfaz, red y perfil |
| `public/juego/sonido.js` | Motor de sonido: síntesis por capas por facción (disparos y explosiones con onda de choque, ecos y escombros), banco, archivos opcionales (`audio/audio.json`), música adaptativa y voces de las unidades (`Voces`, `FRASES`) |
| `public/juego/index.html`, `estilos.css` | Interfaz (sin scripts en línea: CSP `script-src 'self'`) |
| `public/juego/editor.html`, `editor.js` | Editor de mapas |
| `public/juego/vendor/three.min.js` | three.js r128 local (no usar CDN) |
| `servidor/server.js` | Lockstep, salas, tokens, persistencia, webhook y `/validar-mision` |
| `servidor/validador.js` | Hilo que re-simula misiones con la definición oficial |
| `app/`, `routes/`, `database/` | Lobby, `ProgresoController`, `ResultadoPartidaController`, `GameToken`, `PerfilToken` |
| `pruebas/` | Pruebas automáticas (ver comandos) |
| `arte/imagenes/` | Archivo de imágenes por lotes (activos y anteriores), originales y referencias. Ver su `LEEME.md` |
| `despliegue/iis/` | Despliegue en IIS: guía, `publicar.ps1` e `instalar-servicio-juego.ps1` (el `web.config` está en `public/`) |

## Arquitectura de `juego.js`

El archivo está dividido por marcadores. Las pruebas y el validador extraen secciones por estos textos exactos; **no los cambie**:

```
// ======================= SIM-START =======================
   ... simulación determinista (sin DOM ni three.js) ...
// ======================= SIM-END =======================
// ======================= CAMPAIGN-START =======================
   ... CAMPAIGNS, MISSIONS, generateMap, missionDef ...
// ======================= CAMPAIGN-END =======================
   ... render, interfaz, red, perfil, opciones ...
```

- La simulación avanza a 15 ticks por segundo. Todo cambio de estado entra como orden por `queueCmd` → `applyCmd`.
- Los ganchos `hooks.*` comunican la simulación con la interfaz.
- La IA es parte de la simulación (`aiTick`) y usa `S.rng` (semilla).

## Reglas de determinismo (críticas para el multijugador)

1. En la simulación **solo** se permiten `+ - * /`, `Math.sqrt`, `floor`, `round`, `abs`, `min`, `max` e `imul`.
2. Prohibido en la simulación: `Math.hypot`, `sin`, `cos`, `atan2`, `pow`, `exp`, `log`, el operador `**`, `Math.random`, `Date` y `performance`. Use `hyp(x,y)`.
3. La interfaz nunca escribe cachés de la simulación. Las consultas desde el render usan `peek=true` (`hordeActive(u, true)`, `detectedBy(e, p, true)`).
4. Si cambia la simulación: suba `SIM_VERSION` en `juego.js` **y** en `servidor/server.js`, y regenere el verificador (`npm run verificador`).
5. Antes de entregar cambios en la simulación, ejecute `node pruebas/auditoria-determinismo.js` y `node pruebas/prueba-motores.js 1500`.

## Comandos

```bash
cd servidor && npm test                         # suite completa (puede tardar varios minutos)
node pruebas/auditoria-determinismo.js          # determinismo y repeticiones
node pruebas/prueba-campania.js 6000            # 12 misiones y entrenamiento
node pruebas/prueba-seguridad.js                # seguridad del servidor
node pruebas/prueba-lockstep-n.js 4 2400 equipos   # partida en línea de N jugadores con un abandono
node pruebas/prueba-huellas.js                  # compara con huellas-base.json (refactorizar sin cambiar resultados)
node pruebas/prueba-huellas.js guardar          # nueva línea base (solo tras un cambio de simulación intencional)
node pruebas/generar-iconos.js                  # actualiza public/juego/img/iconos.json tras agregar íconos
node pruebas/activar-lote-imagenes.js lote-1    # activa un lote de arte/imagenes/lotes (respalda lo publicado)
node pruebas/generar-audio.js                   # actualiza public/juego/audio/audio.json (solo .ogg y .mp3)
node pruebas/generar-verificador.js             # regenerar verificar-navegador.html
php artisan migrate                             # migraciones de Laravel
php artisan juego:exportar-piloto --desde=AAAA-MM-DD   # CSV seudonimizado del piloto
```

Servidor local en PowerShell (la clave debe ser **idéntica** a `GAME_SECRET` del `.env`, sin texto adicional):

```powershell
$env:PORT="8090"; $env:GAME_SECRET="..."; $env:RESULT_WEBHOOK="http://localhost:8000/api/partidas/resultado"; npm start
```

## Seguridad

- No leer, imprimir ni subir `.env`. No escribir claves en el código ni en los commits.
- Validar toda entrada: mensajes del servidor (`start`, `tick`), órdenes (`applyCmd`), mapas (`mapError`), perfil (`cleanProfile`) y opciones (`cleanOptions`).
- URL externas solo con `safeUrl` (mismo origen, http/https).
- Textos de usuarios siempre con `esc()` o `textContent`, nunca `innerHTML` directo.
- El servidor fija el jugador de cada orden; el cliente nunca decide resultados de campaña (los verifica `/validar-mision`).
- Datos del piloto: seudonimizados (Ley 1581 de 2012). No subir `storage/app/piloto` ni `storage/app/repeticiones`.

## Tareas pendientes (prioridad)

1. ~~Rutas de las pruebas~~ (resuelto): `pruebas/rutas.js` y `servidor/server.js` usan `public/juego/` o la variable `CLIENTE_DIR`. `pruebas/package.json` fuerza CommonJS porque el `package.json` raíz es `"type": "module"`.
2. ~~Primer arranque real de Laravel~~ (resuelto): migraciones aplicadas y `php artisan test` (31 pruebas, incluida `tests/Feature/SitioTest.php`: páginas, salas de 2 y 4, amigos y webhook). Falta probar el lobby con varios usuarios reales.
3. Ejecutar `python pruebas/verificar-navegadores.py` con Firefox y WebKit instalados.
4. Piloto con estudiantes según `docs/frente-arido-guia-pilotaje-v0.9.docx`.
5. Riesgos residuales abiertos: lectura del mapa completo (propia del lockstep) y abuso parcial del Elo.
6. Probar el estudio de recursos (`herramientas/estudio`) con la clave de OpenRouter (`OPENROUTER_API_KEY`): listado de modelos de imagen, cadena de proveedores y traducción de respaldo. Pendiente de prueba por el autor.
