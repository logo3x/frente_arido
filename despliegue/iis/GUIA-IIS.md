# Despliegue en IIS · Frente Árido

Guía para publicar el proyecto en Windows Server con IIS (10 o posterior).

## Arquitectura

| Pieza | Qué es | Cómo se publica |
|---|---|---|
| Sitio, lobby, cuentas y Elo | Laravel (PHP) | Sitio de IIS con raíz en `public/`, PHP por FastCGI |
| Cliente del juego | Archivos estáticos en `public/juego/` | Los sirve IIS directamente |
| Servidor de partidas | Node.js (`servidor/server.js`) en `127.0.0.1:8080` | Servicio de Windows (NSSM); IIS lo publica en `wss://dominio/ws` con ARR |
| Validador de misiones | Parte del servidor de partidas (`/validar-mision`) | Solo interno: Laravel lo llama por `127.0.0.1`; IIS lo bloquea hacia afuera |

El puerto 8080 no se abre en el firewall: todo entra por 443.

## 1. Requisitos en el servidor

| Componente | Detalle |
|---|---|
| IIS | Con «CGI» (para FastCGI) y «Protocolo WebSocket» (Administrador del servidor → Roles → Servidor web → Desarrollo de aplicaciones) |
| URL Rewrite 2.1 | https://www.iis.net/downloads/microsoft/url-rewrite |
| Application Request Routing 3.0 | https://www.iis.net/downloads/microsoft/application-request-routing |
| PHP 8.3 o posterior, NTS x64 | https://windows.php.net/download · requiere Visual C++ Redistributable |
| Extensiones PHP | `pdo_sqlite` (o `pdo_mysql`), `mbstring`, `openssl`, `fileinfo`, `curl`, `intl`, `zip` |
| Composer | https://getcomposer.org |
| Node.js 18 o posterior (LTS) | https://nodejs.org |
| NSSM | https://nssm.cc (copie `nssm.exe` a `C:\Windows\System32` o indique la ruta con `-Nssm`) |
| Git | Para clonar y actualizar el repositorio |

## 2. Habilitar el proxy de ARR

1. Administrador de IIS → nodo del servidor → **Application Request Routing Cache** → **Server Proxy Settings**.
2. Marque **Enable proxy** y aplique.
3. En la misma pantalla, suba el **Time-out** a 600 segundos (las partidas son conexiones largas).

## 3. Registrar PHP en IIS

1. Descomprima PHP en `C:\php` y copie `php.ini-production` como `php.ini`.
2. En `php.ini`: active las extensiones de la tabla, `fastcgi.impersonate = 1`, `cgi.fix_pathinfo = 1`, `upload_max_filesize = 8M`.
3. Administrador de IIS → nodo del servidor → **Asignaciones de controlador** → **Agregar asignación de módulo**:
   - Ruta de solicitud: `*.php` · Módulo: `FastCgiModule` · Ejecutable: `C:\php\php-cgi.exe` · Nombre: `PHP_FastCGI`.
4. En **Configuración de FastCGI**, edite `php-cgi.exe` y suba **Activity Timeout** y **Request Timeout** a 300.

## 4. Copiar el proyecto

```powershell
cd C:\inetpub
git clone https://github.com/logo3x/frente_arido.git frente-arido
cd frente-arido
git checkout v0.9.4        # o main, cuando la rama esté fusionada
copy .env.example .env
```

## 5. Configurar el `.env` (producción)

| Variable | Valor |
|---|---|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_URL` | `https://juego.ejemplo.co` |
| `APP_KEY` | se genera con `php artisan key:generate` |
| `DB_CONNECTION` | `sqlite` (crear `database\database.sqlite` vacío) o `mysql` con sus datos |
| `SESSION_SECURE_COOKIE` | `true` |
| `QUEUE_CONNECTION` | `sync` (el proyecto no usa colas) |
| `BROADCAST_CONNECTION` | `log` (el lobby consulta las salas cada 5 s; Reverb es opcional) |
| `GAME_SECRET` | clave aleatoria de 32 caracteres o más, la misma para Laravel y el servidor de partidas |
| `GAME_WS_URL` | `wss://juego.ejemplo.co/ws` |
| `GAME_VALIDATOR_URL` | `http://127.0.0.1:8080/validar-mision` |
| `GAME_CLIENT_URL` | `/juego/index.html` |

Para generar la clave en PowerShell (cópiela al `.env` sin espacios ni comillas extra):

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

Luego:

```powershell
php artisan key:generate
New-Item -ItemType File database\database.sqlite   # solo con SQLite
.\despliegue\iis\publicar.ps1
```

`publicar.ps1` instala dependencias, migra, genera las cachés de Laravel y da permisos de escritura a `IIS_IUSRS` sobre `storage`, `bootstrap\cache` y `database`.

## 6. Crear el sitio en IIS

1. Administrador de IIS → **Sitios** → **Agregar sitio web**.
   - Nombre: `FrenteArido` · Ruta física: `C:\inetpub\frente-arido\public` · Enlace: `https`, puerto 443, nombre de host `juego.ejemplo.co`.
2. **Grupo de aplicaciones**: «Sin código administrado», canalización integrada.
3. El archivo `public\web.config` ya trae las reglas: Laravel, el proxy `/ws` hacia el servidor de partidas, los tipos `.webp` y `.ogg`, el bloqueo de `.env` y la política de seguridad del cliente.
4. Certificado HTTPS: con win-acme (https://www.win-acme.com) se obtiene y renueva gratis con Let's Encrypt. Agregue también un enlace `http` en el puerto 80 y una regla de redirección a HTTPS (win-acme puede crearla).

## 7. Instalar el servidor de partidas como servicio

```powershell
.\despliegue\iis\instalar-servicio-juego.ps1 -Dominio "juego.ejemplo.co"
```

El script lee `GAME_SECRET` del `.env`, instala las dependencias de `servidor\`, crea el servicio `FrenteAridoJuego` (inicio automático), lo deja escuchando solo en `127.0.0.1:8080`, guarda las partidas en curso en `storage\app\salas` y el registro en `storage\logs\servidor-juego.log`. Al terminar comprueba `http://127.0.0.1:8080/health`.

## 8. Comprobaciones

| Prueba | Resultado esperado |
|---|---|
| `https://juego.ejemplo.co` | Landing del juego |
| `https://juego.ejemplo.co/login` | Pantalla de acceso con el arte de la portada |
| `https://juego.ejemplo.co/juego/index.html` | Menú del juego (escaramuza sin cuenta) |
| `https://juego.ejemplo.co/.env` | Error 404 |
| `https://juego.ejemplo.co/validar-mision` | Error 404 |
| Crear sala en el lobby y entrar con dos cuentas | Ambos jugadores conectados (`wss://…/ws`) |
| Completar una misión con cuenta | Las estrellas aparecen como verificadas en el panel |

Si la partida en línea no conecta: revise que el servicio esté en marcha (`Get-Service FrenteAridoJuego`), que ARR tenga el proxy habilitado, que IIS tenga el «Protocolo WebSocket» instalado y que `ALLOWED_ORIGINS` coincida con el dominio exacto (con `https://`).

## 9. Actualizar a una versión nueva

```powershell
cd C:\inetpub\frente-arido
git pull
.\despliegue\iis\publicar.ps1
```

Si cambió `SIM_VERSION`, las partidas en curso de la versión anterior no se pueden reanudar: publique cuando no haya partidas en línea abiertas.

## 10. Seguridad

- No suba el `.env` al repositorio ni lo copie a `public\`.
- Datos del piloto (`storage\app\piloto`) y repeticiones (`storage\app\repeticiones`) quedan fuera de `public\` y no se sirven.
- El puerto 8080 no debe abrirse en el firewall de Windows ni en el del proveedor.
- Respaldos: `database\database.sqlite` (o la base MySQL), `.env` y `storage\app`.
