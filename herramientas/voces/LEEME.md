# Voces de las unidades

Las voces se graban con la voz del sistema de Windows (Microsoft Raúl, español de México) y se procesan como
transmisiones de radio de campo: filtro telefónico, compresión, saturación, estática y combate lejano de fondo,
con un carácter distinto por facción (Atlas: radio digital limpia; Hierro: radio analógica vieja y voz grave;
Guerrilla: transmisor barato con más distorsión). El juego usa estos archivos y, si faltan, la voz del navegador.

## Regenerar (por ejemplo, tras cambiar `FRASES` en `public/juego/sonido.js`)

```powershell
node herramientas\voces\exportar-frases.js          # frases.json con nombres de archivo y carácter
powershell -File herramientas\voces\sintetizar.ps1   # graba voces\crudo\*.wav (requiere la voz Microsoft Raúl)
python herramientas\voces\procesar.py                 # radio de campo → public\juego\audio\voz-*.mp3 (requiere ffmpeg y numpy)
node pruebas\generar-audio.js                         # registra los archivos en audio.json
```

Para usar grabaciones propias o de otra herramienta, guarde los archivos con el mismo nombre (`voz-<facción>-...mp3`).
