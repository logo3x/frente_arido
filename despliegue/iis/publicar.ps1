# Publica o actualiza Laravel en el servidor IIS. Ejecutar como administrador desde la carpeta del proyecto:
#   .\despliegue\iis\publicar.ps1
# Hace: dependencias de producción, migraciones, cachés de Laravel, permisos de escritura para IIS
# y reinicio del servidor de partidas (si está instalado como servicio).
param(
  [string]$Raiz = (Resolve-Path "$PSScriptRoot\..\..").Path,
  [string]$Servicio = "FrenteAridoJuego",
  [string]$GrupoIis = "IIS_IUSRS"
)
$ErrorActionPreference = "Stop"
Set-Location $Raiz

if (-not (Test-Path ".env")) { throw "Falta el .env. Copie .env.example a .env y complete los valores (ver la guía)." }

composer install --no-dev --optimize-autoloader --no-interaction
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
Write-Host "Publicación terminada."
