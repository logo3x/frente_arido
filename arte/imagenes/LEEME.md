# Archivo de imágenes · Frente Árido

Las imágenes **activas** están donde el juego y el sitio las cargan:

| Ruta | Contenido |
|---|---|
| `public/img/` | Sitio: portada, fondo del panel, vista previa `og.jpg`, ícono de la aplicación, tarjetas de facción y fichas de unidades |
| `public/juego/img/` | Juego: retratos de comandante, íconos de unidades y edificios, `iconos.json` |

Esta carpeta guarda **todos los diseños**, activos y anteriores, para poder cambiar de estilo sin perder nada.

## Estructura

| Carpeta | Contenido |
|---|---|
| `lotes/lote-1-2026-10-05-manual/` | Primer lote manual (ChatGPT o Gemini): portada, fondo del panel, vista previa, tarjetas de facción, comandantes, helicóptero de carga de Atlas |
| `lotes/lote-2-2026-10-05-manual-atlas/` | Segundo lote manual de Atlas: infantería y plataforma de ingeniería (con fondo transparente) e ingeniero, comando, tanque, antiaéreo, avión, lancha y fragata (íconos con su fondo; nunca se activaron) |
| `lotes/lote-3-2026-10-06-estudio/` | Lote actual, generado con el estudio de recursos (`herramientas/estudio`). `sin-retoque/` guarda las tres imágenes antes de borrar el texto pintado y las franjas negras |
| `lotes/lote-4-2026-10-07-estudio/` | Cuarto lote del estudio: fichas e íconos de edificios, insignias de grado, íconos de interfaz e ilustraciones de misión (85 imágenes). Las insignias y los íconos de interfaz traen fondo de color, no transparente |
| `lotes/lote-5-2026-10-07-manual/` | Pantallas de carga de las tres facciones y fondo del menú del juego (1920 × 1080). Atlas y Guerrilla se recortaron para quitar el nombre y la barra de carga pintados; los originales están en `fuentes/lote-5/` |
| `fuentes/lotes-1-y-2/` | Originales sin procesar de los lotes 1 y 2 (JPG y PNG tal como salieron) |
| `referencia/` | Láminas de estilo por facción (con texto; solo documentación) |
| `revisiones/` | Copias grandes de íconos sobre fondo arena para revisar recortes |
| `respaldos/<fecha>/` | Se crea sola: copia de lo publicado antes de activar un lote o de que el estudio sobrescriba un archivo |

Cada lote repite la estructura de `public/` (`img/` y `juego/img/`), con los mismos nombres de archivo del catálogo `docs/prompts-imagenes.md`.

## Cambiar de diseño

```bash
node pruebas/activar-lote-imagenes.js                                  # lista los lotes
node pruebas/activar-lote-imagenes.js lote-1                           # activa un lote completo
node pruebas/activar-lote-imagenes.js lote-1 --solo img/faccion-atlas.webp juego/img/comandante-atlas.png
```

El script respalda lo publicado en `respaldos/`, copia solo los archivos que trae el lote y regenera `iconos.json`.

## Agregar un lote nuevo

1. Cree `lotes/lote-N-AAAA-MM-DD-origen/` con `img/` y `juego/img/`.
2. Use los nombres y tamaños del catálogo (`docs/prompts-imagenes.md`): fichas WebP 1200 × 900, íconos PNG 128 × 128, comandantes PNG 256 × 256.
3. Actívelo con el script. El estudio de recursos escribe directo en `public/`, pero ya respalda en `respaldos/` lo que reemplaza.
