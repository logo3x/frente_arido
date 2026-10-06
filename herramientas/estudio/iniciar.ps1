# Inicio del estudio. Copie este archivo como iniciar.local.ps1, complete sus claves y ejecútelo con:
#   powershell -ExecutionPolicy Bypass -File .\iniciar.local.ps1
# No suba iniciar.local.ps1 al repositorio (agréguelo al .gitignore).

# Gratuitos
$env:CLOUDFLARE_CUENTAS = ""     # "idCuenta32caracteres:token" (varias separadas por comas)
$env:POLLINATIONS       = "1"    # "0" para desactivarlo
$env:POLLINATIONS_TOKEN = ""     # gratuito en enter.pollinations.ai: quita la marca de agua

# Con saldo o facturación (opcionales)
$env:GEMINI_API_KEYS    = ""     # "clave1,clave2"
$env:XAI_API_KEYS       = ""
$env:OPENAI_API_KEYS    = ""
$env:OPENROUTER_API_KEY = ""

# Otros
$env:NVIDIA_API_KEY     = ""     # traducción de indicaciones al inglés
$env:ELEVENLABS_API_KEY = ""     # efectos de sonido
node "$PSScriptRoot\servidor.js"
