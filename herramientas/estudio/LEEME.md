# Estudio de recursos · Frente Árido

Genera en cola las imágenes del juego con la API de NVIDIA y las pistas de audio con un sintetizador local.

## Inicio (PowerShell)

```powershell
$env:GEMINI_API_KEYS="AIza...,AIza..."   # Google AI Studio; varias claves separadas por comas
$env:XAI_API_KEYS="xai-..."              # xAI (Grok Imagine)
$env:OPENAI_API_KEYS="sk-..."            # OpenAI (GPT Image)
$env:OPENROUTER_API_KEY="sk-or-..."      # opcional
$env:NVIDIA_API_KEY="nvapi-..."          # traducción de indicaciones
$env:ELEVENLABS_API_KEY="..."            # opcional: efectos de sonido
node herramientas/estudio/servidor.js
```

Abra `http://localhost:5173`. El servidor solo acepta conexiones del mismo equipo.

## Proveedores gratuitos (recomendados)

| Proveedor | Variable | Cuota | Cómo obtener el acceso |
|---|---|---|---|
| Cloudflare Workers AI | `CLOUDFLARE_CUENTAS="idCuenta:token"` (varias separadas por comas) | 10.000 neuronas diarias por cuenta (unas 170 imágenes FLUX de 1024 × 1024). Se reinicia a las 00:00 UTC (7:00 p. m. en Colombia). Al agotarse, bloquea; no cobra | dash.cloudflare.com → Workers AI → «Use REST API»: copiar el ID de cuenta y crear un token con permiso Workers AI |
| Pollinations.ai | `POLLINATIONS_TOKEN` (opcional) | Sin token: marca de agua y 1 imagen cada 15 s. Con token gratuito: sin marca de agua y 1 cada 5 s | enter.pollinations.ai: iniciar sesión y copiar la clave `sk_…` o `pk_…` |

Con el catálogo de 167 imágenes, una cuenta de Cloudflare cubre el trabajo en uno o dos días; Pollinations completa lo que falte.

## Claves y proveedores

| Proveedor | Variable | Modelos | Notas |
|---|---|---|---|
| Google Gemini | `GEMINI_API_KEYS` | gemini-3.1-flash-image, gemini-2.5-flash-image | Claves en aistudio.google.com |
| xAI | `XAI_API_KEYS` | grok-imagine-image, grok-imagine-image-quality | Claves en console.x.ai |
| OpenAI | `OPENAI_API_KEYS` | gpt-image-1-mini, gpt-image-2, gpt-image-2.5-flare | Fondo transparente real en íconos (sin recorte magenta) |
| OpenRouter | `OPENROUTER_API_KEY` | Catálogo en vivo | Modelos gratuitos con límites por minuto |
| NVIDIA | `NVIDIA_API_KEY` | FLUX (desactivado por defecto) | Se usa para traducir las indicaciones al inglés |

Cada clave aparece como una entrada propia en la cadena. Cuando una clave se queda sin cuota o crédito, se desactiva y el estudio sigue con la siguiente clave o proveedor.

**Importante:** las variables deben definirse en la misma ventana de PowerShell donde se inicia el servidor. Si cierra la ventana, se pierden.

## Proveedores de imagen y salto automático

| Elemento | Funcionamiento |
|---|---|
| Cadena | Lista ordenada de proveedores y modelos: NVIDIA (FLUX.1-schnell, FLUX.1-dev, SD 3.5) y los modelos de imagen de OpenRouter, leídos en vivo de su catálogo |
| Modo Prioridad | Intenta en orden; si uno falla, pasa al siguiente en la misma imagen |
| Modo Alternar | Reparte las imágenes entre los proveedores disponibles para no saturar ninguno |
| Límite de solicitudes (429) | El proveedor queda en espera el tiempo que indique (o 30 s) y se usa el siguiente |
| Error temporal o sin respuesta | Espera creciente: 45, 90, 135 s… hasta 4 minutos |
| Clave inválida, sin crédito o modelo inexistente | El proveedor se desactiva en la sesión (botón «Reactivar» en el panel de estado) |
| Modelos de pago | Desactivados por defecto. Se usan solo si su último costo cabe en el presupuesto en USD |
| Panel de estado | Disponible, en espera o desactivado; correctas, errores, tiempo promedio y último error por proveedor |
| Traducción | Con NVIDIA; si falla, con un modelo gratuito de OpenRouter |

El orden y la activación de la cadena se guardan en el navegador.

## Catálogos del proyecto

El estudio reconoce directamente `docs/prompts-imagenes.md` y `docs/prompts-audio.md` (formato `### N.º · Título`, línea `Archivo:` y bloque de código).

| Elemento | Tratamiento |
|---|---|
| Ruta y tamaño | Cada archivo se guarda en la ruta exacta del catálogo, recortado y escalado al tamaño indicado (128 × 128, 1200 × 900, etc.) y en su formato (PNG, WebP o JPG) |
| Fondo transparente | Se genera sobre magenta puro y el estudio lo vuelve transparente (los modelos FLUX no producen transparencia) |
| Lámina de referencia | Se omite esa frase: los modelos de NVIDIA no reciben imágenes de referencia. El estilo se mantiene por el texto de cada prompt y la semilla fija |
| Idioma | Opción «Traducir al inglés» con un modelo de lenguaje de NVIDIA (misma clave) |
| Efectos y ambiente | Con `ELEVENLABS_API_KEY`: ElevenLabs Sound Effects con la duración y el bucle del catálogo, guardado en MP3. Sin esa clave: sonido procedural provisional en WAV con el mismo nombre |
| Música | Marcada como externa (Suno o Udio, instrumental). Botón «Copiar prompt» |
| Voces | No entran a la cola: requieren diseño de voz en ElevenLabs |
| Selección | Por sección y rango de números, para generar por partes y controlar créditos |
| Lista de control | Botón «Exportar lista de control» con las casillas marcadas |

Conversión opcional a OGG (requiere ffmpeg), en la carpeta `public/juego/audio`:

```powershell
Get-ChildItem *.mp3, *.wav | ForEach-Object { ffmpeg -y -i $_.FullName -c:a libvorbis -q:a 5 ($_.BaseName + ".ogg") }
```

## Uso

1. Cargue `recursos-juego.json` (17 imágenes y 14 pistas), un `.md` como `ejemplo-indicaciones.md` o un `.txt` con una indicación por línea.
2. Elija el modelo de imagen y el tipo de audio.
3. Ajuste la cola: simultáneas, intervalo mínimo entre solicitudes, tiempo máximo y reintentos.
4. Pulse «Iniciar». Puede pausar, cancelar y reintentar los fallidos.

Los archivos se guardan en `public/juego/arte/` y `public/juego/audio/`.

## Control de la cola

| Situación | Comportamiento |
|---|---|
| Límite de solicitudes (429) | Toda la cola espera el tiempo indicado por la API y reintenta |
| Error temporal (5xx) o tiempo agotado | Reintento con espera creciente: 4, 8, 16 s… |
| Filtro de contenido | Error sin reintento: ajuste la indicación |
| Pausa | No inicia solicitudes nuevas; las que están en curso terminan |

## Formatos de entrada

**JSON:** `{ "estilo": "...", "imagenes": [{ "nombre", "prompt", "ancho", "alto", "semilla", "modelo" }], "audios": [{ "nombre", "clase": "musica|efecto", "faccion", "ambiente": "menu|campana|combate", "duracion", "tempo", "efecto" }] }`

**Markdown:** cada entrada empieza con `## nombre`, seguida de la indicación. Las líneas `- clave: valor` fijan parámetros (`tipo: audio`, `clase`, `faccion`, `ambiente`, `duracion`, `ancho`, `alto`, `semilla`, `modelo`).

## Modelos

| Modelo | Licencia | Uso |
|---|---|---|
| FLUX.1-schnell | Apache 2.0 (uso comercial) | Recomendado para el juego |
| FLUX.1-dev | No comercial sin acuerdo | Prototipos de estilo |
| Stable Diffusion 3.5 Large | Stability Community License | Escenas complejas |

Para agregar modelos de imagen, edite `modelos.json` y reinicie el servidor.

NVIDIA no ofrece por ahora generación de música por API REST, y sus voces (Magpie TTS) usan gRPC. Por eso el audio se sintetiza en el navegador: música en bucle por facción y ambiente, y efectos de sonido, exportados en WAV.

## Seguridad

- La clave solo vive en la variable de entorno del servidor. El navegador nunca la recibe.
- No suba la clave al repositorio ni la comparta en chats.
- El servidor solo reenvía a modelos de la lista blanca y limpia los nombres de archivo para evitar rutas maliciosas.
