# Instala el servidor de partidas (Node.js) como servicio de Windows con NSSM.
# Ejecutar en PowerShell como administrador, desde la carpeta del proyecto en el servidor:
#   .\despliegue\iis\instalar-servicio-juego.ps1 -Dominio "juego.ejemplo.co"
# Requisitos: Node.js 18 o superior y NSSM (https://nssm.cc) en el PATH o en -Nssm.
# La clave GAME_SECRET se lee del .env de Laravel (no se muestra en pantalla ni se guarda en este script).
param(
  [Parameter(Mandatory = $true)][string]$Dominio,          # dominio público, sin https://
  [string]$Raiz = (Resolve-Path "$PSScriptRoot\..\..").Path,
  [string]$Nssm = "nssm",
  [int]$Puerto = 8080,
  [string]$Servicio = "FrenteAridoJuego"
)
$ErrorActionPreference = "Stop"

$envArchivo = Join-Path $Raiz ".env"
if (-not (Test-Path $envArchivo)) { throw "No se encontró $envArchivo. Configure Laravel primero." }
$linea = Select-String -Path $envArchivo -Pattern '^\s*GAME_SECRET\s*=' | Select-Object -First 1
if (-not $linea) { throw "Falta GAME_SECRET en el .env." }
$secreto = ($linea.Line -split '=', 2)[1].Trim().Trim('"')
if ($secreto.Length -lt 32) { throw "GAME_SECRET debe tener al menos 32 caracteres." }

$node = (Get-Command node -ErrorAction Stop).Source
$servidor = Join-Path $Raiz "servidor"
$salas = Join-Path $Raiz "storage\app\salas"
$registros = Join-Path $Raiz "storage\logs"
New-Item -ItemType Directory -Force $salas | Out-Null

Push-Location $servidor
npm ci --omit=dev
Pop-Location

# Si ya existe, se detiene y se reinstala con la configuración nueva
if (Get-Service $Servicio -ErrorAction SilentlyContinue) { & $Nssm stop $Servicio | Out-Null; & $Nssm remove $Servicio confirm | Out-Null }

& $Nssm install $Servicio $node "server.js"
& $Nssm set $Servicio AppDirectory $servidor
& $Nssm set $Servicio DisplayName "Frente Árido · servidor de partidas"
& $Nssm set $Servicio Start SERVICE_AUTO_START
& $Nssm set $Servicio AppStdout (Join-Path $registros "servidor-juego.log")
& $Nssm set $Servicio AppStderr (Join-Path $registros "servidor-juego.log")
& $Nssm set $Servicio AppRotateFiles 1
& $Nssm set $Servicio AppRotateBytes 10485760
& $Nssm set $Servicio AppEnvironmentExtra `
  "NODE_ENV=production" `
  "HOST=127.0.0.1" `
  "PORT=$Puerto" `
  "GAME_SECRET=$secreto" `
  "RESULT_WEBHOOK=https://$Dominio/api/partidas/resultado" `
  "ALLOWED_ORIGINS=https://$Dominio" `
  "ROOMS_DIR=$salas" `
  "CLIENTE_DIR=$(Join-Path $Raiz 'public\juego')"
& $Nssm start $Servicio

Start-Sleep -Seconds 2
try {
  $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Puerto/health" -TimeoutSec 5
  Write-Host "Servicio $Servicio en marcha (salud: $($r.StatusCode))."
} catch {
  Write-Warning "El servicio no respondió en 127.0.0.1:$Puerto. Revise $registros\servidor-juego.log"
}
