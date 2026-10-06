# Frente Árido

Juego de estrategia en tiempo real para navegador, con multijugador en línea y campaña. Está hecho con three.js, un servidor de partidas en Node.js y una plataforma en Laravel.

Es un proyecto original inspirado en los RTS clásicos. No usa nombres, arte ni sonido de títulos comerciales.

**Versión actual:** 0.9.1 (beta para piloto con estudiantes).

## Características

| Área | Contenido |
|---|---|
| Facciones | Coalición Atlas (tecnología y aviación), Frente Hierro (masa y blindaje) y Red Guerrillera (emboscada, camuflaje y túneles) |
| Campaña | 12 misiones (4 por facción, incluida una naval) y un entrenamiento guiado de 5 pasos |
| Sistemas | Economía con depósitos y pozos, energía, construcción, árbol del comandante, superarmas, héroes, guerra naval y niebla de guerra |
| Multijugador | Lockstep determinista con reloj de servidor, reconexión y persistencia de salas |
| Plataforma | Lobby en Laravel, clasificación Elo, repeticiones, perfil e historial, y validación de misiones en el servidor |
| Herramientas | Editor de mapas, 8 plantillas de mapa, opciones gráficas y paleta accesible |

## Estructura del repositorio

```
frente-arido/            Proyecto Laravel (raíz del repositorio)
├── app/ config/ database/ resources/ routes/   Lobby, API de progreso, webhook y tokens
├── public/juego/        Cliente del juego (index.html, juego.js, estilos.css, editor.html, vendor/)
├── servidor/            Servidor de partidas en Node.js (server.js, validador.js)
├── pruebas/             Pruebas automáticas y verificación entre navegadores
├── despliegue/          Docker, Nginx, systemd y lista de despliegue
├── docs/                GDD, informes de seguridad, guía de pilotaje y decisiones
└── CLAUDE.md            Contexto del proyecto para Claude Code
```

## Instalación local

**Requisitos:** PHP 8.2 o superior, Composer, Node.js 18 o superior, y MySQL o MariaDB.

```bash
composer install
npm install && npm run build
cp .env.example .env
php artisan key:generate
php artisan migrate
```

En `.env`:

```env
GAME_SECRET=          # 64 caracteres: php -r "echo bin2hex(random_bytes(32));"
GAME_WS_URL=ws://localhost:8090
GAME_CLIENT_URL=/juego/index.html
GAME_VALIDATOR_URL=http://127.0.0.1:8090/validar-mision
```

Servidor de partidas (otra terminal, **misma clave** que en `.env`):

```powershell
cd servidor
npm install
$env:PORT="8090"; $env:GAME_SECRET="la-misma-clave"; $env:RESULT_WEBHOOK="http://localhost:8000/api/partidas/resultado"; npm start
```

Laravel:

```bash
php artisan serve
```

Abra `http://localhost:8000/register`, cree un usuario y entre a `/lobby`.

**Solo el juego, sin Laravel:** abra `public/juego/index.html` en Chrome o Edge. Campaña, escaramuza y editor funcionan sin servidor.

## Pruebas

```bash
cd servidor
npm test
```

| Prueba | Verifica |
|---|---|
| `auditoria-determinismo.js` | Sin funciones matemáticas no deterministas; misma semilla, mismo resultado; repeticiones exactas |
| `prueba-motores.js` | Misma simulación en V8 y QuickJS |
| `prueba-campania.js` | Las 13 misiones funcionan y son deterministas |
| `prueba-entrenamiento.js` | El entrenamiento se completa con órdenes de jugador |
| `prueba-validador.js` | El servidor confirma misiones legítimas y rechaza registros alterados |
| `prueba-seguridad.js` | 14 casos de seguridad del servidor |
| `prueba-lockstep.js` | Dos clientes en red con huellas iguales, con y sin reconexión |
| `prueba-persistencia.js` | Una partida se restaura tras reiniciar el servidor |
| `prueba-token.js` | Tokens firmados y webhook |
| `prueba-repeticion-servidor.js` | La repetición del servidor reproduce la partida |

Opcionales (requieren Python y Playwright): `pruebas/prueba-seguridad-cliente.py` y `pruebas/verificar-navegadores.py` (Chromium, Firefox y WebKit).

## Seguridad

- `GAME_SECRET` de al menos 32 caracteres, igual en Laravel y en el servidor.
- Nunca subir `.env`, `storage/app/repeticiones`, `storage/app/piloto` ni carpetas de salas.
- En producción: `wss://` tras Nginx, `ALLOWED_ORIGINS`, `TRUST_PROXY=1` y `NODE_ENV=production`.
- El validador (`/validar-mision`) solo debe ser accesible desde la red interna.
- Detalle en `docs/` (informe de seguridad v0.9) y en `despliegue/LISTA-DESPLIEGUE.md`.

## Hoja de ruta

| Versión | Estado | Contenido |
|---|---|---|
| 0.1 – 0.8 | Terminadas | Prototipo, construcción, red, facciones, campañas, seguridad, naval, despliegue |
| 0.9 / 0.9.1 | Actual | Entrenamiento, misiones navales, opciones, métricas, piloto, menú de partida, curación, mapas nuevos |
| 1.0 | Pendiente | Ajustes según el piloto, verificación en Firefox y Safari, publicación |

## Créditos y licencias

- Autor: Mg. Luis Guillermo Oviedo Ochoa · Ingeniería Informática, UNIPAZ.
- three.js r128 (MIT), incluido en `public/juego/vendor/` con su licencia.
- Efectos de sonido generados en el navegador con Web Audio (sin archivos de terceros).
