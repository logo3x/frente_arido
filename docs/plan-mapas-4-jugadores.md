# Plan · Mapas grandes y partidas de 4 jugadores

Estado: propuesta para revisar antes de implementar. Versión de referencia: 0.9.2.

## Resumen

La simulación actual está diseñada para **exactamente 2 jugadores** en un mapa de **64 × 64 celdas**. Pasar a 4 jugadores no es un cambio de parámetros: afecta la simulación determinista, el servidor de partidas, el lobby de Laravel, el Elo y las repeticiones. Se propone hacerlo en una versión propia (1.1), después del piloto con estudiantes.

## Supuestos de 2 jugadores en el código

| Área | Dónde | Situación actual |
|---|---|---|
| Estado por jugador | `newGame` | Arreglos fijos de dos posiciones: `players`, `vis`, `exp`, `power`, `heroes`, `bonus`, `thinkMult`, `tab`, `ai` |
| Rival | IA (`foe`, 15 usos), `1-LOCAL` (4), `1-p` (3) | Se asume un único enemigo |
| Bases | `BASE`, `BASE_ZONES`, `mir()` | Dos bases en esquinas opuestas; terreno simétrico por reflexión central |
| Victoria | `S.winner` | Gana quien queda; no hay equipos |
| Colores | `TEAM`, `TEAM_DARK` | Dos colores (azul y rojo) |
| Servidor | `servidor/server.js` | Salas con `players: [null, null]` y 24 referencias a `slot` |
| Lobby | Tabla `partidas` | Columnas `anfitrion_id` y `rival_id` |
| Elo | `ResultadoPartidaController` | Elo de dos jugadores (K = 32) |

## Cambios propuestos

| # | Cambio | Detalle |
|---|---|---|
| 1 | Número de jugadores variable | `S.players` de longitud N (2 a 4); todos los arreglos por jugador se crean con N posiciones |
| 2 | Equipos | Campo `team` por jugador. Modos: todos contra todos, 2 contra 2, 1 contra 2 (con IA) |
| 3 | Enemigos | Reemplazar `foe` y `1-p` por funciones `enemies(p)` y `isEnemy(a,b)` según el equipo |
| 4 | Victoria | Termina cuando queda un solo equipo con edificios; `S.winner` pasa a ser el equipo ganador |
| 5 | Mapas | Tamaños 64 (2 jugadores), 96 y 128 (4 jugadores). `GRID` deja de ser constante y pasa a `S.grid` |
| 6 | Bases | 4 esquinas; simetría rotacional de 90° para que ninguna posición tenga ventaja |
| 7 | IA | Elige objetivo entre los enemigos (el más cercano o el más débil); coopera con el aliado en ataques |
| 8 | Visión | Niebla compartida entre aliados |
| 9 | Colores | Paleta accesible de 4 colores (Okabe-Ito): azul, bermellón, verde azulado y amarillo |
| 10 | Servidor | Salas de 2 a 4 plazas, inicio cuando todos marcan «Listo», reconexión por plaza |
| 11 | Lobby | Tabla `partida_jugadores` (partida, usuario, plaza, equipo, resultado) en lugar de `rival_id` |
| 12 | Elo | Elo por equipos: promedio del equipo contra promedio del rival; en todos contra todos, pares por orden de eliminación |
| 13 | Repeticiones | Guardan N jugadores, equipos y tamaño del mapa |

## Rendimiento

| Aspecto | 64 × 64 | 128 × 128 | Medida |
|---|---|---|---|
| Celdas | 4.096 | 16.384 | Búsqueda de rutas A* con límite de nodos y caché por destino |
| Unidades estimadas | ~80 | ~250 | Rejilla espacial para buscar objetivos (hoy se recorre toda la lista) |
| Textura de niebla | 64² | 128² | Sin problema |
| Minimapa | Escala fija | Escala según el tamaño | Ajuste menor |

## Orden sugerido

1. ~~Generalizar el estado por jugador manteniendo 2 jugadores~~ **Hecho (0.9.2).** Arreglos por jugador de longitud N, campo `team`, `isEnemy`, `enemyOf` y `allyOf`, victoria por equipos y caché de detección por jugador. `pruebas/prueba-huellas.js` confirmó resultados idénticos en 5 escenarios. Pendiente para el paso 2: la IA ataca solo al primer enemigo (`enemyOf`) y las comparaciones de aliados (curación, horda, reparación) aún usan «mismo dueño».
2. Agregar equipos y la función `isEnemy`.
3. ~~Mapa variable y bases para N jugadores~~ **Hecho (0.9.3).** `setGrid(LG)`, mapas de 64, 96 y 128 celdas de diseño con grilla fina, bases en anillo con simetría rotacional para 2, 3, 4, 6 y 8 jugadores.
4. ~~Escaramuza local de 4 jugadores contra la IA~~ **Hecho (0.9.3)**, hasta 8 jugadores, todos contra todos. Equipos (2 contra 2, 3 contra 3, 4 contra 4) con visión compartida: hechos.
5. ~~Servidor y lobby para 4 jugadores en línea~~ **Hecho (0.9.3)**: salas de 2 a 8 plazas, retiro de jugadores con la orden `rendir`.
6. ~~Elo por equipos~~ **Hecho (0.9.3)**. Pendiente: probar el lobby con varios usuarios reales en el piloto.

Cada paso sube `SIM_VERSION` y debe pasar `auditoria-determinismo.js` y `prueba-motores.js`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Romper el determinismo al generalizar | Paso 1 sin cambios de resultado: se comparan huellas antes y después |
| Partidas largas en mapas grandes | Límite de tiempo opcional y recursos ajustados al tamaño |
| Computadores de laboratorio lentos | Mapas de 96 como máximo en calidad Baja |
| Abuso del Elo en equipos | Elo solo en partidas con duración mínima y sin IA |
