# Instala el servidor de partidas (Node.js) como servicio de Windows con NSSM.
# Ejecutar en PowerShell como administrador, desde la carpeta del proyecto en el servidor:
#   .\despliegue\iis\instalar-servicio-juego.ps1 -Dominio "juego.ejemplo.co"
# Requisitos: Node.js 18 o superior y NSSM (https://nssm.cc) en el PATH o en -Nssm.
# Al final habilita el proxy de ARR en IIS (reenvía wss://dominio/ws a este servicio) y avisa si falta el Protocolo WebSocket.
# La clave GAME_SECRET se lee del .env de Laravel (no se muestra en pantalla ni se guarda en este script).
param(
  [Parameter(Mandatory = $true)][string]$Dominio,          # dominio público, sin https://
  [string]$Raiz = (Resolve-Path "$PSScriptRoot\..\..").Path,
  [string]$Nssm = "nssm",
  [int]$Puerto = 8080,
  [string]$Servicio = "FrenteAridoJuego"
)
$ErrorActionPreference = "Stop"

# Requisitos: se revisan antes de cambiar nada
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "No se encontró Node.js. Instale la versión LTS (https://nodejs.org) y abra una consola nueva." }
if (-not (Get-Command $Nssm -ErrorAction SilentlyContinue)) {
  throw "No se encontró NSSM. Descargue https://nssm.cc/release/nssm-2.24.zip, copie win64\nssm.exe a C:\Windows\System32 (o indique la ruta con -Nssm) y vuelva a ejecutar este script."
}

$envArchivo = Join-Path $Raiz ".env"
if (-not (Test-Path $envArchivo)) { throw "No se encontró $envArchivo. Configure Laravel primero." }
$linea = Select-String -Path $envArchivo -Pattern '^\s*GAME_SECRET\s*=' | Select-Object -First 1
if (-not $linea) { throw "Falta GAME_SECRET en el .env." }
$secreto = ($linea.Line -split '=', 2)[1].Trim().Trim('"').Trim("'")   # igual que Laravel: sin espacios ni comillas
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

# IIS: el proxy de ARR reenvía wss://dominio/ws a este servicio (sin él, /ws responde 404) y necesita el Protocolo WebSocket
$appcmd = Join-Path $env:windir "system32\inetsrv\appcmd.exe"
if (Test-Path $appcmd) {
  $ErrorActionPreference = "Continue"   # appcmd puede escribir en stderr; el resultado se lee en $LASTEXITCODE
  & $appcmd set config -section:system.webServer/proxy /enabled:"True" /timeout:"00:10:00" /commit:apphost 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "Proxy de ARR habilitado (tiempo de espera de 10 minutos)." }
  else { Write-Warning "No se pudo habilitar el proxy de ARR: instale Application Request Routing 3.0 (ver la guía) y vuelva a ejecutar este script." }
  if (-not (Test-Path (Join-Path $env:windir "system32\inetsrv\iiswsock.dll"))) {
    Write-Warning "Falta el Protocolo WebSocket de IIS: Install-WindowsFeature Web-WebSockets (Windows Server) o Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebSockets (Windows 10 y 11)."
  }
}
