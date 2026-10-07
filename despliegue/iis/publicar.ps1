# Publica o actualiza Laravel en el servidor IIS. Ejecutar como administrador desde la carpeta del proyecto:
#   .\despliegue\iis\publicar.ps1
# Hace: dependencias de producción, clave de la aplicación (si falta), base SQLite (si falta), revisión del .env,
# migraciones, cachés de Laravel, permisos de escritura para IIS y reinicio del servidor de partidas (si es un servicio).
param(
  [string]$Raiz = (Resolve-Path "$PSScriptRoot\..\..").Path,
  [string]$Servicio = "FrenteAridoJuego",
  [string]$GrupoIis = "IIS_IUSRS"
)
$ErrorActionPreference = "Stop"
Set-Location $Raiz

if (-not (Test-Path ".env")) { throw "Falta el .env. Copie .env.example a .env y complete los valores (ver la guía)." }

# Valor de una variable del .env (sin comillas ni espacios). No se muestra en pantalla.
function ValorEnv([string]$nombre) {
  $l = Select-String -Path ".env" -Pattern "^\s*$nombre\s*=" | Select-Object -First 1
  if (-not $l) { return "" }
  return ($l.Line -split '=', 2)[1].Trim().Trim('"').Trim("'").Trim()
}

composer install --no-dev --optimize-autoloader --no-interaction

# Clave de Laravel: se genera solo si falta (requiere las dependencias recién instaladas)
if (-not (ValorEnv "APP_KEY")) { php artisan key:generate --force; Write-Host "Clave de la aplicación generada." }

# Base SQLite: se crea vacía si la conexión es sqlite y el archivo no existe
if ((ValorEnv "DB_CONNECTION") -eq "sqlite" -and -not (Test-Path "database\database.sqlite")) {
  New-Item -ItemType File "database\database.sqlite" | Out-Null; Write-Host "Base SQLite creada."
}

# Revisión del .env: solo avisa (no muestra valores)
$avisos = @()
if ((ValorEnv "APP_URL") -notmatch '^https?://') { $avisos += "APP_URL debe empezar con https:// (por ejemplo https://su-dominio)." }
if ((ValorEnv "GAME_WS_URL") -notmatch '^wss?://[^/]+/ws$') { $avisos += "GAME_WS_URL debe ser wss://su-dominio/ws (con dos puntos y dos barras)." }
if ((ValorEnv "GAME_VALIDATOR_URL") -notmatch '^http://(127\.0\.0\.1|localhost):\d+/validar-mision$') { $avisos += "GAME_VALIDATOR_URL debe ser http://127.0.0.1:8080/validar-mision (es interno; IIS lo bloquea hacia afuera)." }
if ((ValorEnv "GAME_SECRET").Length -lt 32) { $avisos += "GAME_SECRET debe tener 32 caracteres o más." }
if ((ValorEnv "APP_DEBUG") -eq "true") { $avisos += "APP_DEBUG debe ser false en producción." }
if (Select-String -Path ".env" -Pattern '^\s*[A-Z_]+\s*=\s+\S' -Quiet) { $avisos += "Hay variables con un espacio después del signo =; quítelo (por ejemplo GAME_SECRET=valor)." }
foreach ($a in $avisos) { Write-Warning $a }

php artisan down --retry=30 2>$null
try {
  php artisan migrate --force
  php artisan config:cache
  php artisan route:cache
  php artisan view:cache
} finally {
  php artisan up
}

# IIS necesita escribir en storage, bootstrap\cache y en la carpeta de la base SQLite (si se usa)
foreach ($carpeta in @("storage", "bootstrap\cache", "database")) {
  icacls (Join-Path $Raiz $carpeta) /grant "${GrupoIis}:(OI)(CI)M" /T /Q | Out-Null
}

if (Get-Service $Servicio -ErrorAction SilentlyContinue) { Restart-Service $Servicio; Write-Host "Servidor de partidas reiniciado." }
if ($avisos.Count) { Write-Warning "Publicación terminada con $($avisos.Count) aviso(s) en el .env: corríjalos y vuelva a ejecutar este script." }
else { Write-Host "Publicación terminada." }
