# Catálogo de audio y prompts · Frente Árido

Un prompt completo por archivo. Copie el bloque y péguelo tal cual en la herramienta indicada, sin agregar nada. Cada prompt repite el estilo y la identidad de la facción, porque las herramientas no ven el resto del documento.

> **Sintetizador propio.** El juego ya trae un sintetizador de buena calidad (motor `public/juego/sonido.js`). Los archivos de este catálogo lo **reemplazan** cuando existen; si un archivo falta, suena el sintetizador. Los sonidos que no figuran aquí (motores, edificios, poderes) siguen a cargo del sintetizador.
>
> **Registro de archivos.** Tras agregar o quitar archivos en `public/juego/audio/`, ejecute `node pruebas/generar-audio.js`. El script actualiza `public/juego/audio/audio.json`, y el juego solo carga los archivos que figuran en esa lista.

> **Advertencia.** Los WAV que genera el estudio de recursos (`herramientas/estudio`) cuando no hay clave de ElevenLabs son **marcadores provisionales** de síntesis procedural. Sirven para probar nombres y tiempos. No representan la calidad final y deben reemplazarse por los archivos generados con estos prompts.

## Regla de nombres

| Regla | Detalle |
|---|---|
| Carpeta | Todos los archivos van en `public/juego/audio/`. |
| Formato | OGG Vorbis (`.ogg`), 44,1 kHz. |
| Búsqueda | El juego busca primero `<clave>-<faccion>.ogg` y, si no existe, `<clave>.ogg`. Si tampoco existe, usa el sintetizador. |
| Facción de un disparo | La facción dueña de la unidad o del edificio que dispara. |
| Facción de la interfaz | La facción del jugador local. |
| Facciones | `atlas` (Coalición Atlas), `hierro` (Frente Hierro), `guerrilla` (Red Guerrillera). |
| Combinaciones omitidas | Se omite la variante de un arma que la facción no fabrica (ver la matriz de armas). Si una facción obtiene esa arma por captura, suena la variante genérica `<clave>.ogg`. |
| Variante genérica | Para las armas omitidas, copie la variante de la facción que sí la usa con el nombre genérico. Ejemplo: `obus-guerrilla.ogg` → `obus.ogg`. La excepción es `canonaval.ogg`, que tiene prompt propio (ver 023). |

### Matriz de armas por facción

| Clave | Unidad o edificio | Atlas | Hierro | Guerrilla | Genérica `<clave>.ogg` |
|---|---|---|---|---|---|
| `rifle` | Infantería, técnico, red de túneles | 001 | 002 | 003 | No necesaria |
| `aa` | Antiaéreo | 004 | 005 | 006 | No necesaria |
| `canon` | Tanque, tanque pesado | 007 | 008 | — (no fabrica tanques) | Copia de `canon-hierro` |
| `torre` | Torre de defensa | 009 | 010 | 011 | No necesaria |
| `obus` | Artillería ligera | — | — | 012 | Copia de `obus-guerrilla` |
| `misil` | Avión de ataque | 013 | — | — | Copia de `misil-atlas` |
| `cohete` | Helicóptero de ataque | — | 014 | — | Copia de `cohete-hierro` |
| `heroe` | Comando Atlas, Mariscal de Hierro, Jefe rebelde | 015 | 016 | 017 | No necesaria |
| `ametralla` | Lancha patrullera, lancha rápida | 018 | 019 | 020 | No necesaria |
| `canonaval` | Fragata lanzamisiles, monitor fluvial, fragata | 021 | 022 | — (usa la genérica) | 023, prompt propio |
| `antitanque` | Granadero, cazacarros, rebelde antitanque | 024 | 025 | 026 | No necesaria |
| `minigun` | Torreta minigun | — | 027 | — | No necesaria |
| `misilsam` | Batería de misiles enlazada | 028 | — | — | No necesaria |

La Red Guerrillera puede construir una fragata en el astillero, pero no tiene diseño naval propio. Por eso su fragata usa `canonaval.ogg`, una versión neutra.

## Resumen

| Sección | Números | Archivos | Duración | Canales | Bucle | Herramienta | Sonoridad |
|---|---|---|---|---|---|---|---|
| 1. Armas por facción | 001–028 | 28 | 0,6–3 s | Mono | No | ElevenLabs Sound Effects | −14 a −12 LUFS a corto plazo |
| 2. Explosiones | 029–033 | 5 | 1,8–5 s | Mono | No | ElevenLabs Sound Effects | −14 a −12 LUFS a corto plazo |
| 3. Superarmas | 034–039 | 6 | 6–10 s | Estéreo | No | ElevenLabs Sound Effects | −14 a −12 LUFS a corto plazo |
| 4. Interfaz por facción | 040–075 | 36 | 0,1–4 s | Mono (victoria y derrota en estéreo) | No | ElevenLabs Sound Effects | −16 a −14 LUFS a corto plazo |
| 5. Música adaptativa | 076–088 | 13 | 10 s a 1:20 | Estéreo | Sí (salvo stingers) | Suno o Udio (instrumental) | −16 LUFS integrados |
| 6. Ambiente | 089–092 | 4 | 60 s | Estéreo | Sí | ElevenLabs Sound Effects | −20 LUFS integrados |
| 7. Voces de unidades | 093–098 | 6 diseños de voz y sus líneas | 0,6–2,5 s por línea | Mono | No | ElevenLabs Voice Design y TTS | −16 LUFS integrados |
| 8. Voces del anunciador | 099 | 1 diseño de voz y 27 líneas | 0,8–2,5 s por línea | Mono | No | ElevenLabs Voice Design y TTS | −16 LUFS integrados |

Total: 92 prompts de efectos, música y ambiente, y 7 prompts de diseño de voz.

## Identidad sonora por facción

| Aspecto | Coalición Atlas | Frente Hierro | Red Guerrillera |
|---|---|---|---|
| Idea central | Precisión tecnológica | Masa industrial | Ingenio improvisado |
| Armas | Electromagnéticas y de riel: carga de capacitores, chasquido eléctrico seco, latigazo supersónico, zumbido de bobina | Calibre pesado: golpe de presión, cierre de recámara, retroceso hidráulico, purga de vapor, eslabones de acero | Armas viejas: matraqueo, pólvora sucia, metal flojo, culatas de madera, piezas oxidadas |
| Interfaz | Digital limpia: clics de vidrio, tonos filtrados, destellos cristalinos | Relés, palancas, bocinas de fábrica, campanas sobre acero | Radio con estática, chasquidos de transmisor, silbidos humanos, golpes de madera |
| Música | Electrónica orquestal con sintetizadores modernos | Metal industrial, metales graves, percusión de yunque | Percusión de mano, cuerdas pulsadas del desierto, voces sin palabras |
| Voz | Operador sereno con filtro digital de casco | Tripulante grave con intercomunicador metálico | Rebelde en voz baja con radio vieja |

| Regla común | Detalle |
|---|---|
| Calidad | Cine o videojuego AAA: capas reales, transitorio con pegada, cuerpo con peso, cola natural y sub-bajos. |
| Acústica de exterior | Desierto abierto: reflexión seca y eco corto contra dunas lejanas; sin sala ni eco largo. |
| Interfaz | Seca y breve, sin reverberación de exterior, para no confundirse con la batalla. |
| Prohibido | Chiptune, 8 bits, sintetizador retro, ondas cuadradas de consola, sonidos de caricatura. |
| Diseño original | No nombrar ni imitar juegos, películas, compositores, bandas, artistas ni marcas. No usar voces de personas reales. |
| Variantes | Para disparos frecuentes conviene generar 3 o 4 tomas y conservar la mejor. |

## Guía de herramientas

| Tipo | Herramienta | Ajustes |
|---|---|---|
| Efectos, superarmas, interfaz y ambiente | ElevenLabs Sound Effects | Fije la **duración** del catálogo (no use «automática»). **Influencia de la indicación** (*prompt influence*) alta: 0,7 a 1,0. Genere 4 tomas por prompt. Para ambientes active la opción de bucle si está disponible. |
| Música | Suno o Udio | Modo **instrumental**. Pegue el prompt completo en la descripción. Si el campo de estilo es corto, use la línea «Estilo corto». Genere 2 o 3 minutos y recorte el bucle exacto (sección 9). |
| Voces | ElevenLabs Voice Design y TTS | Cree la voz con el prompt de diseño y genere cada línea por separado. Estabilidad 45 a 60 %, similitud 75 %, estilo 15 a 30 %. |

Notas de uso:

- La duración mínima de ElevenLabs es 0,5 s. Para clics más cortos, genere 0,5 s y recorte.
- La duración máxima por solicitud es de unos 22 a 30 s, según la versión. Para los ambientes de 60 s, genere dos tramos de 30 s con el mismo prompt y únalos con fundido cruzado (sección 9).
- El estudio de recursos envía cada prompt recortado a 1000 caracteres. Todos los prompts de este catálogo cumplen ese límite.
- Los prompts empiezan por el sonido principal. Si una herramienta acorta el texto, conserva lo esencial.
- Suno y Udio no siempre respetan el tempo pedido. Verifique el BPM y, si difiere, ajústelo con estiramiento de tiempo sin cambiar la tonalidad.

Los prompts de efectos y música están en inglés porque las herramientas responden mejor. Cada uno lleva antes una línea en español que describe el sonido. Los textos de voz están en español neutro formal.

## 1. Armas por facción

### 001 · Fusil · Coalición Atlas
Archivo: `public/juego/audio/rifle-atlas.ogg` · 0,6 s · sin bucle · mono · infantería Atlas

Disparo de fusil electromagnético: latigazo eléctrico seco, golpe compacto y resonancia breve de bobina.
```
Single shot of a futuristic electromagnetic coilgun assault rifle. Atlas Coalition sound identity: high-tech electromagnetic and railgun weaponry, capacitor charge whine, dry electric snap, clean and precise. Layers: punchy transient fusing a supersonic crack with a dry electric snap; tight low-mid body with a compact sub-bass thump; a faint high capacitor whine and descending coil ring after the shot; tiny servo click of the magazine. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 0.6 seconds, one-shot, mono, starts exactly on the transient with no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 002 · Fusil · Frente Hierro
Archivo: `public/juego/audio/rifle-hierro.ogg` · 0,6 s · sin bucle · mono · infantería Hierro

Disparo de fusil de batalla de calibre grueso: estampido pesado y golpe metálico del cerrojo.
```
Single shot of a heavy large-caliber battle rifle. Iron Front sound identity: heavy industrial army, large-caliber steel, breech blocks, hydraulics and steam vents, massive and mechanical. Layers: punchy, chesty transient with a hard powder blast; thick low-mid body with a strong sub-bass punch; heavy steel bolt carrier slamming back and locking with a deep metallic clack; faint ring of a thick steel barrel. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 0.6 seconds, one-shot, mono, starts exactly on the transient with no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 003 · Fusil · Red Guerrillera
Archivo: `public/juego/audio/rifle-guerrilla.ogg` · 0,6 s · sin bucle · mono · rebelde, técnico y red de túneles

Disparo de fusil viejo y gastado: estallido sucio de pólvora y traqueteo de piezas flojas.
```
Single shot of an old, worn assault rifle with a wooden stock. Guerrilla Network sound identity: old worn improvised weapons, rattling loose metal, dirty black powder, wood stocks, gritty and raw. Layers: rough, slightly uneven transient with a dirty powder pop; mid-heavy body with a modest sub-bass thump; loose receiver cover and sling swivel rattling, worn bolt clattering back, a dull knock of wood. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 0.6 seconds, one-shot, mono, starts exactly on the transient with no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 004 · Antiaéreo · Coalición Atlas
Archivo: `public/juego/audio/aa-atlas.ogg` · 1,0 s · sin bucle · mono · antiaéreo Atlas

Ráfaga antiaérea de riel: tres pulsos eléctricos rápidos con silbido de proyectiles hacia el cielo.
```
Short burst of a vehicle-mounted electromagnetic anti-aircraft rail cannon firing upward. Atlas Coalition sound identity: high-tech electromagnetic and railgun weaponry, capacitor charge whine, dry electric snap, clean and precise. Layers: three rapid punchy transients, each a sharp electric crack with a metallic zap; compact body with sub-bass pulses; rising capacitor recharge whine between shots; high hypersonic hiss of projectiles climbing away; servo whir of the turret. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 1.0 second, one-shot, mono, starts exactly on the first transient. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 005 · Antiaéreo · Frente Hierro
Archivo: `public/juego/audio/aa-hierro.ogg` · 1,0 s · sin bucle · mono · antiaéreo Hierro

Cañones antiaéreos cuádruples: ráfaga pesada y rítmica con eslabones y vainas que caen.
```
Short burst of a quad-barrel heavy anti-aircraft autocannon on a tracked vehicle. Iron Front sound identity: heavy industrial army, large-caliber steel, breech blocks, hydraulics and steam vents, massive and mechanical. Layers: four fast, heavy, punchy transients in a mechanical rhythm; thick body with deep sub-bass thumps; steel feed links clanking, hydraulic recoil buffers hissing, heavy brass casings bouncing on steel deck. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 1.0 second, one-shot, mono, starts exactly on the first transient. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 006 · Antiaéreo · Red Guerrillera
Archivo: `public/juego/audio/aa-guerrilla.ogg` · 1,0 s · sin bucle · mono · antiaéreo guerrillero

Ametralladora antiaérea doble y vieja sobre una camioneta: traqueteo áspero y carrocería que vibra.
```
Short burst of an old twin heavy anti-aircraft machine gun bolted onto a pickup truck bed. Guerrilla Network sound identity: old worn improvised weapons, rattling loose metal, dirty black powder, wood stocks, gritty and raw. Layers: rapid uneven punchy transients with dirty powder blasts; mid-heavy body with sub-bass thumps; loose mount bolts and thin truck sheet metal rattling hard, worn belt links jangling, spent casings falling on the truck bed. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 1.0 second, one-shot, mono, starts exactly on the first transient. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 007 · Cañón de tanque · Coalición Atlas
Archivo: `public/juego/audio/canon-atlas.ogg` · 2,0 s · sin bucle · mono · tanque Atlas

Cañón de riel de tanque: carga breve, descarga eléctrica violenta y estampido supersónico.
```
Single shot of a main battle tank railgun. Atlas Coalition sound identity: high-tech electromagnetic and railgun weaponry, capacitor charge whine, dry electric snap, clean and precise. Layers: a 0.2 s rising capacitor whine, then a massive punchy transient of electric discharge fused with a supersonic boom; heavy body with a deep sub-bass impact; crackling electric arcs along the rails; magnetic coils ringing down; cooling vents hissing softly. Tail: dry open-desert outdoor reverb with a rolling slap echo off distant dunes, no indoor room sound. 2.0 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 008 · Cañón de tanque · Frente Hierro
Archivo: `public/juego/audio/canon-hierro.ogg` · 2,0 s · sin bucle · mono · tanque y tanque pesado Hierro

Cañón de gran calibre: golpe de presión enorme, retroceso hidráulico y cierre de recámara.
```
Single shot of a heavy large-caliber tank main gun. Iron Front sound identity: heavy industrial army, large-caliber steel, breech blocks, hydraulics and steam vents, massive and mechanical. Layers: huge punchy concussive transient with a pressure wave; massive body with a chest-hitting sub-bass impact; hydraulic recoil cylinder groaning, breech block sliding open with a heavy steel clank, hot casing ejected, short steam hiss from the bore evacuator. Tail: dry open-desert outdoor reverb with a long rolling slap echo off distant dunes, no indoor room sound. 2.0 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 009 · Torre de defensa · Coalición Atlas
Archivo: `public/juego/audio/torre-atlas.ogg` · 1,6 s · sin bucle · mono · torre Atlas

Torre de bobinas: pulso eléctrico concentrado con chasquido y zumbido de recarga.
```
Single shot of a fixed defensive coil-cannon tower. Atlas Coalition sound identity: high-tech electromagnetic and railgun weaponry, capacitor charge whine, dry electric snap, clean and precise. Layers: sharp punchy transient of an electromagnetic pulse with a dry snap; solid body with a sub-bass thump; bright electric crackle around the barrel; capacitor bank recharging with a rising whine; turret servos repositioning with a precise whir. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 1.6 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 010 · Torre de defensa · Frente Hierro
Archivo: `public/juego/audio/torre-hierro.ogg` · 1,6 s · sin bucle · mono · torre Hierro

Torreta blindada de cañón: estampido grave, retroceso pesado y vapor.
```
Single shot of an armored defensive gun turret. Iron Front sound identity: heavy industrial army, large-caliber steel, breech blocks, hydraulics and steam vents, massive and mechanical. Layers: heavy punchy transient with a powder blast; thick body with deep sub-bass impact; thick armor plates resonating, hydraulic recoil and return, breech clank, short burst of steam from a vent, heavy gear teeth turning the turret. Tail: dry open-desert outdoor reverb with a rolling slap echo off distant dunes, no indoor room sound. 1.6 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 011 · Torre de defensa · Red Guerrillera
Archivo: `public/juego/audio/torre-guerrilla.ogg` · 1,6 s · sin bucle · mono · torre guerrillera

Cañón viejo sin retroceso en un puesto de sacos y chapa: estallido sucio y metal que vibra.
```
Single shot of an old recoilless gun mounted in an improvised sandbag and scrap-metal emplacement. Guerrilla Network sound identity: old worn improvised weapons, rattling loose metal, dirty black powder, wood stocks, gritty and raw. Layers: rough punchy transient with a dirty back-blast whoosh; mid-heavy body with a sub-bass thump; corrugated scrap sheets rattling, sand falling from sandbags, rusty mount creaking, a wooden plank knock. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 1.6 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 012 · Obús de artillería ligera · Red Guerrillera
Archivo: `public/juego/audio/obus-guerrilla.ogg` · 2,5 s · sin bucle · mono · artillería ligera; copie también como `obus.ogg`

Pieza de campaña vieja: estampido hueco, ruedas y armazón que crujen, silbido del proyectil.
```
Single shot of an old towed light field gun used by irregular fighters. Guerrilla Network sound identity: old worn improvised weapons, rattling loose metal, dirty black powder, wood stocks, gritty and raw. Layers: deep punchy transient with a hollow, dirty powder boom; heavy body with a strong sub-bass impact; worn carriage frame creaking, wheel rims shifting on sand, loose metal fittings rattling, the shell whistling away high into the sky. Tail: dry open-desert outdoor reverb with a long rolling echo off distant dunes, no indoor room sound. 2.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 013 · Misil de avión de ataque · Coalición Atlas
Archivo: `public/juego/audio/misil-atlas.ogg` · 1,8 s · sin bucle · mono · avión de ataque; copie también como `misil.ogg`

Lanzamiento de misil guiado: liberación magnética, encendido limpio y estela que se aleja.
```
Air-to-ground guided missile launch from a fast attack jet. Atlas Coalition sound identity: high-tech electromagnetic and railgun weaponry, capacitor charge whine, dry electric snap, clean and precise. Layers: crisp magnetic release clamp snap as transient; instant clean rocket motor ignition with a punchy whoosh; bright, smooth hiss of the motor accelerating away with a slight Doppler drop; faint electronic guidance chirp; low sub-bass rumble under the ignition. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 1.8 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 014 · Cohetes de helicóptero · Frente Hierro
Archivo: `public/juego/audio/cohete-hierro.ogg` · 1,6 s · sin bucle · mono · helicóptero de ataque; copie también como `cohete.ogg`

Salva de cohetes desde un contenedor de tubos de acero: siseos encadenados y golpes graves.
```
Ripple salvo of four unguided rockets fired from a steel rocket pod on an attack helicopter. Iron Front sound identity: heavy industrial army, large-caliber steel, breech blocks, hydraulics and steam vents, massive and mechanical. Layers: four quick punchy ignition transients; aggressive raw whooshes tearing away with Doppler; heavy body with sub-bass thumps; steel launch tubes ringing, pod frame shuddering, rotor wash faintly underneath. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 1.6 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 015 · Arma del héroe · Coalición Atlas
Archivo: `public/juego/audio/heroe-atlas.ogg` · 1,2 s · sin bucle · mono · Comando Atlas (francotirador)

Fusil de riel de francotirador: carga contenida, latigazo eléctrico enorme y eco limpio.
```
Single shot of an elite sniper railgun rifle. Atlas Coalition sound identity: high-tech electromagnetic and railgun weaponry, capacitor charge whine, dry electric snap, clean and precise. Layers: 0.15 s tight rising capacitor whine, then a powerful punchy transient: a supersonic whip crack fused with a deep electric snap; dense body with a sub-bass punch; air tearing behind the slug; magnetic rails ringing; precise mechanical chamber click. Tail: dry open-desert outdoor reverb with a clear slap echo off distant dunes, no indoor room sound. 1.2 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 016 · Arma del héroe · Frente Hierro
Archivo: `public/juego/audio/heroe-hierro.ogg` · 1,2 s · sin bucle · mono · Mariscal de Hierro

Carabina pesada de grueso calibre: doble disparo contundente y cierre de acero.
```
Two quick shots from a heavy large-bore marshal's carbine. Iron Front sound identity: heavy industrial army, large-caliber steel, breech blocks, hydraulics and steam vents, massive and mechanical. Layers: two very heavy punchy transients with thunderous powder blasts; thick body with strong sub-bass impacts; massive steel lever action cycling with a deep clack, brass casing ringing on stone, faint hiss of hot metal. Tail: dry open-desert outdoor reverb with a rolling slap echo off distant dunes, no indoor room sound. 1.2 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 017 · Arma del héroe · Red Guerrillera
Archivo: `public/juego/audio/heroe-guerrilla.ogg` · 1,2 s · sin bucle · mono · Jefe rebelde

Fusil de cerrojo antiguo con mira: disparo seco y potente, cerrojo de madera y metal gastado.
```
Single shot of an old bolt-action scoped rifle with a worn wooden stock. Guerrilla Network sound identity: old worn improvised weapons, rattling loose metal, dirty black powder, wood stocks, gritty and raw. Layers: sharp punchy transient with a dirty powder crack; solid body with a sub-bass thump; the old bolt worked back and forward with gritty metal friction, a casing dropping on sand, a soft wooden creak of the stock, cloth wrap rustling. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 1.2 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 018 · Ametralladora de lancha · Coalición Atlas
Archivo: `public/juego/audio/ametralla-atlas.ogg` · 1,2 s · sin bucle · mono · lancha patrullera Atlas

Cañón automático electromagnético naval: ráfaga rápida de chasquidos eléctricos sobre el agua.
```
Short burst of a boat-mounted electromagnetic autocannon. Atlas Coalition sound identity: high-tech electromagnetic and railgun weaponry, capacitor charge whine, dry electric snap, clean and precise. Layers: six rapid, evenly spaced punchy transients of dry electric snaps; compact body with sub-bass pulses; continuous low capacitor hum under the burst; stabilized mount servos whirring; faint water slap against the hull. Tail: dry open-air reverb over water with a short slap echo off desert banks, no indoor room sound. 1.2 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 019 · Ametralladora de lancha · Frente Hierro
Archivo: `public/juego/audio/ametralla-hierro.ogg` · 1,2 s · sin bucle · mono · lancha patrullera Hierro

Ametralladora pesada sobre cubierta de acero: ráfaga gruesa, eslabones y vainas sobre metal.
```
Short burst of a heavy-caliber machine gun on a steel patrol boat. Iron Front sound identity: heavy industrial army, large-caliber steel, breech blocks, hydraulics and steam vents, massive and mechanical. Layers: rapid heavy punchy transients in a steady mechanical rhythm; thick body with sub-bass thumps; steel belt links feeding, heavy brass casings cascading onto a steel deck, armored gun shield vibrating, water slapping the hull. Tail: dry open-air reverb over water with a short slap echo off desert banks, no indoor room sound. 1.2 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 020 · Ametralladora de lancha · Red Guerrillera
Archivo: `public/juego/audio/ametralla-guerrilla.ogg` · 1,2 s · sin bucle · mono · lancha rápida guerrillera

Ametralladora vieja en una lancha ligera: ráfaga irregular, casco de fibra que retumba y motor fuera de borda.
```
Short burst of an old belt-fed machine gun on a light speedboat. Guerrilla Network sound identity: old worn improvised weapons, rattling loose metal, dirty black powder, wood stocks, gritty and raw. Layers: rapid, slightly irregular punchy transients with dirty powder pops; mid body with sub-bass thumps; loose pintle mount rattling, worn belt links jangling, casings splashing into water, thin fiberglass hull drumming, outboard motor idling underneath. Tail: dry open-air reverb over water with a short slap echo off desert banks, no indoor room sound. 1.2 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 021 · Cañón naval · Coalición Atlas
Archivo: `public/juego/audio/canonaval-atlas.ogg` · 3,0 s · sin bucle · mono · fragata lanzamisiles

Lanzamiento vertical de misiles desde una fragata: escotilla magnética, encendido potente y estela larga.
```
Vertical missile launch from a high-tech frigate, plus the hatch cycle. Atlas Coalition sound identity: high-tech electromagnetic and railgun weaponry, capacitor charge whine, dry electric snap, clean and precise. Layers: magnetic hatch unlocking with a crisp electric snap; huge punchy ignition transient; roaring clean rocket motor climbing with Doppler; massive sub-bass rumble shaking the deck; hull resonance; electronic guidance chirps; spray hissing off the deck. Tail: dry open-air reverb over water with a long rolling echo off desert coastlines, no indoor room sound. 3.0 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 022 · Cañón naval · Frente Hierro
Archivo: `public/juego/audio/canonaval-hierro.ogg` · 3,0 s · sin bucle · mono · monitor fluvial

Torre doble de cañones navales: estampido descomunal, casco que vibra y vapor de purga.
```
Twin heavy naval guns of an armored river monitor firing together. Iron Front sound identity: heavy industrial army, large-caliber steel, breech blocks, hydraulics and steam vents, massive and mechanical. Layers: colossal punchy double transient with a crushing pressure blast; massive body with a deep sub-bass impact; thick steel hull groaning and ringing, hydraulic recoil cylinders, breech blocks clanking open, steam purge hissing, water displaced in a heavy wash. Tail: dry open-air reverb over water with a long rolling echo off desert coastlines, no indoor room sound. 3.0 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 023 · Cañón naval · versión genérica
Archivo: `public/juego/audio/canonaval.ogg` · 3,0 s · sin bucle · mono · fragata de la Red Guerrillera y fragatas capturadas

Cañón naval convencional de calibre medio: estampido grave sobre el agua, sin rasgos de facción.
```
Single shot of a conventional medium-caliber naval deck gun on a frigate. Neutral military sound, no faction-specific technology: a standard gunpowder cannon. Layers: strong punchy transient with a clean powder blast; heavy body with a deep sub-bass impact; steel hull vibrating, gun recoiling and returning, casing ejected onto the deck, water rippling against the hull. Tail: dry open-air reverb over water with a long rolling echo off desert coastlines, no indoor room sound. 3.0 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 024 · Lanzacohetes antitanque · Coalición Atlas
Archivo: `public/juego/audio/antitanque-atlas.ogg` · 2,0 s · sin bucle · mono · granadero antitanque

Lanzador portátil guiado: expulsión magnética silenciosa, encendido limpio y vuelo con chirrido de guía.
```
Shoulder-fired guided anti-tank launcher with a magnetic soft-launch. Atlas Coalition sound identity: high-tech electromagnetic and railgun weaponry, capacitor charge whine, dry electric snap, clean and precise. Layers: short capacitor whine, then a punchy magnetic ejection thump with an electric snap; a beat later the flight motor ignites with a clean, bright whoosh flying away with Doppler; electronic lock-on chirp; sub-bass punch under the ejection. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 2.0 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 025 · Lanzacohetes antitanque · Frente Hierro
Archivo: `public/juego/audio/antitanque-hierro.ogg` · 2,0 s · sin bucle · mono · cazacarros

Fusil sin retroceso de gran calibre: estampido brutal con chorro trasero y recarga metálica.
```
Single shot of a heavy recoilless anti-tank rifle. Iron Front sound identity: heavy industrial army, large-caliber steel, breech blocks, hydraulics and steam vents, massive and mechanical. Layers: brutal punchy transient with a violent back-blast roar; massive body with a deep sub-bass impact; heavy steel breech swinging open with a hinged clank, hot gas hissing out like steam, dust and grit kicked up behind. Tail: dry open-desert outdoor reverb with a rolling slap echo off distant dunes, no indoor room sound. 2.0 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 026 · Lanzacohetes antitanque · Red Guerrillera
Archivo: `public/juego/audio/antitanque-guerrilla.ogg` · 2,0 s · sin bucle · mono · rebelde antitanque

Lanzacohetes viejo de hombro: disparo sucio, motor del cohete que chisporrotea y vuela irregular.
```
Single shot of an old shoulder-fired rocket-propelled grenade launcher. Guerrilla Network sound identity: old worn improvised weapons, rattling loose metal, dirty black powder, wood stocks, gritty and raw. Layers: rough punchy launch pop with a dirty back-blast; a split second later the rocket motor kicks in, sputtering and hissing as it flies away slightly unsteady with Doppler; sub-bass thump on launch; loose sight and wooden grip rattling, sand blown behind. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 2.0 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 027 · Torreta minigun · Frente Hierro
Archivo: `public/juego/audio/minigun-hierro.ogg` · 2,0 s · sin bucle · mono · torreta minigun

Ametralladora rotativa: arranque del motor, rugido continuo de cañones y desaceleración mecánica.
```
Rotary multi-barrel machine gun turret: spin-up, burst and spin-down. Iron Front sound identity: heavy industrial army, large-caliber steel, breech blocks, hydraulics and steam vents, massive and mechanical. Layers: heavy electric motor and gear train spinning up with a rising mechanical whine; then a dense, tearing, buzzsaw-like roar of continuous fire with punchy low-end and sub-bass weight; brass casings pouring onto steel plates; barrels spinning down with a descending ratchet whir and a hydraulic hiss. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 2.0 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 028 · Batería de misiles enlazada · Coalición Atlas
Archivo: `public/juego/audio/misilsam-atlas.ogg` · 2,2 s · sin bucle · mono · batería de misiles enlazada

Batería antiaérea: tono de fijación digital, dos misiles en rápida sucesión y estelas hacia el cielo.
```
Linked surface-to-air missile battery firing two missiles in quick succession. Atlas Coalition sound identity: high-tech electromagnetic and railgun weaponry, capacitor charge whine, dry electric snap, clean and precise. Layers: short clean digital lock-on tone; two punchy launch transients with magnetic rail snaps; bright fast rocket whooshes climbing steeply with Doppler; sub-bass thumps on each launch; launcher servos realigning with a precise whir. Tail: dry open-desert outdoor reverb with a short slap echo off distant dunes, no indoor room sound. 2.2 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

## 2. Explosiones

Las explosiones son genéricas: no llevan sufijo de facción.

### 029 · Explosión de vehículo
Archivo: `public/juego/audio/boom.ogg` · 1,8 s · sin bucle · mono

Vehículo destruido: detonación seca, combustible que se inflama, metal desgarrado y restos que caen.
```
Military vehicle destroyed by a direct hit. Layers: punchy, sharp detonation transient; dense explosive body with a heavy sub-bass impact; fuel tank igniting in a short fireball whoosh; armor plates tearing and buckling; small metal debris and wheel parts clattering onto sand; crackling fire starting. Tail: dry open-desert outdoor reverb with a rolling slap echo off distant dunes, no indoor room sound. 1.8 seconds, one-shot, mono, starts on the transient with no leading silence. Hyper-realistic, layered, cinematic AAA game audio for a desert strategy game, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 030 · Explosión grande
Archivo: `public/juego/audio/big.ogg` · 3,5 s · sin bucle · mono

Detonación grande de munición o tanque pesado: golpe enorme, onda de choque y retumbo largo.
```
Large explosion of an ammunition-loaded heavy vehicle. Layers: massive punchy detonation transient with a pressure crack; huge body with a deep, chest-shaking sub-bass impact; secondary cook-off pops of ammunition; shockwave rushing through the air; heavy steel fragments raining down on sand and rocks; roaring fireball. Tail: dry open-desert outdoor reverb with a long rolling thunder echo off distant dunes, no indoor room sound. 3.5 seconds, one-shot, mono, starts on the transient with no leading silence. Hyper-realistic, layered, cinematic AAA game audio for a desert strategy game, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 031 · Destrucción de edificio
Archivo: `public/juego/audio/edificio.ogg` · 5,0 s · sin bucle · mono

Edificio que estalla y se derrumba: explosión interna, vigas que ceden, hormigón y chapa que caen.
```
Military building destroyed and collapsing. Layers: punchy internal explosion transient; heavy body with a deep sub-bass impact; steel beams groaning and snapping; concrete walls cracking and crumbling in a long cascade; corrugated metal roof sheets crashing down; glass shattering; dust settling with small debris trickling. Tail: dry open-desert outdoor reverb with a long rolling echo off distant dunes, no indoor room sound. 5.0 seconds, one-shot, mono, starts on the transient with no leading silence. Hyper-realistic, layered, cinematic AAA game audio for a desert strategy game, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 032 · Caída de aeronave
Archivo: `public/juego/audio/caida.ogg` · 4,0 s · sin bucle · mono

Aeronave derribada: motor que falla y cae en picada, silbido creciente e impacto contra el suelo.
```
Aircraft shot down: falling and crashing into the desert. Layers: damaged engine sputtering and whining down in pitch; rising air whistle and wind roar as it dives with Doppler; then a punchy crash transient on impact; heavy explosive body with a deep sub-bass hit; metal fuselage tearing and tumbling across sand; fire flaring. Tail: dry open-desert outdoor reverb with a rolling slap echo off distant dunes, no indoor room sound. 4.0 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio for a desert strategy game, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 033 · Hundimiento de barco
Archivo: `public/juego/audio/hundimiento.ogg` · 5,0 s · sin bucle · mono

Barco hundido: explosión en el casco, acero que cruje, agua que entra y burbujas que se apagan.
```
Warship hit and sinking. Layers: punchy hull explosion transient with a water burst; heavy body with a deep sub-bass impact; steel hull groaning and bending under pressure; water rushing in with a powerful gurgling roar; large air bubbles bursting at the surface; the sound slowly submerging and fading into low murky rumble. Tail: dry open-air reverb over water with a long rolling echo off desert coastlines, no indoor room sound. 5.0 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game audio for a desert strategy game, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

## 3. Superarmas

Cada superarma tiene dos archivos y cada archivo describe sus fases con tiempos. Son estéreo y deben impactar: es el momento más espectacular de la partida.

### 034 · Cañón de partículas · carga · Coalición Atlas
Archivo: `public/juego/audio/super-particulas-carga.ogg` · 7,0 s · sin bucle · estéreo · superarma Atlas

Carga del cañón de partículas: bancos de capacitores que despiertan, zumbido creciente, arcos eléctricos y bloqueo final.
```
Particle cannon superweapon charging up, cinematic and awe-inspiring. Atlas Coalition sound identity: high-tech electromagnetic power, capacitor charge whine, dry electric snap, clean and precise. Phase 1 (0-3 s): huge capacitor banks powering up in sequence with deep electric thunks and a rising layered whine; low sub-bass drone swelling. Phase 2 (3-6 s): energy focusing, a resonant harmonic hum climbing in pitch, violent crackling arcs jumping across coils, stereo energy swirling around the listener, magnetic field pressure building. Phase 3 (6-7 s): a heavy mechanical lock clunk and a sudden held breath of near silence before firing. Outdoor desert air, wide stereo. 7 seconds, one-shot, stereo. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 035 · Cañón de partículas · impacto · Coalición Atlas
Archivo: `public/juego/audio/super-particulas-impacto.ogg` · 8,0 s · sin bucle · estéreo · superarma Atlas

Disparo e impacto del haz: desgarro eléctrico ensordecedor, rugido del haz, detonación colosal y crepitar residual.
```
Particle cannon superweapon firing and striking the ground, cinematic and devastating. Atlas Coalition sound identity: high-tech electromagnetic power, dry electric snap, clean and precise. Phase 1 (0-2 s): a blinding punchy transient, the air ripped apart by an electric tearing crack, then a sustained roaring beam with sizzling plasma and wide stereo spread. Phase 2 (2-4 s): colossal impact detonation with a massive sub-bass impact that shakes the chest, ground vaporizing, shockwave rushing outward. Phase 3 (4-8 s): rolling thunder across the desert, sand and debris raining down, ionized air crackling with fading electric arcs. Dry open-desert outdoor reverb with long echoes off distant dunes. 8 seconds, one-shot, stereo. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 036 · Silo nuclear · lanzamiento · Frente Hierro
Archivo: `public/juego/audio/super-nuclear-lanzamiento.ogg` · 8,0 s · sin bucle · estéreo · superarma Hierro

Lanzamiento desde el silo: compuertas hidráulicas, bocina de alarma, vapor, ignición atronadora y ascenso del misil.
```
Heavy ballistic missile launched from an underground silo, cinematic and ominous. Iron Front sound identity: heavy industrial army, massive steel, hydraulics, steam vents, mechanical and brutal. Phase 1 (0-2.5 s): huge hydraulic silo doors grinding open, heavy steel locks releasing with deep clanks, a distant industrial klaxon horn wailing, steam venting. Phase 2 (2.5-5 s): rocket engine ignition with an enormous punchy transient, a thunderous roar with deep sub-bass rumble shaking the ground, concrete resonating. Phase 3 (5-8 s): the missile climbing away, roar rising and thinning with Doppler into the sky, wide stereo, echoes off distant dunes. Dry open-desert outdoor reverb. 8 seconds, one-shot, stereo. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 037 · Silo nuclear · impacto · Frente Hierro
Archivo: `public/juego/audio/super-nuclear-impacto.ogg` · 10,0 s · sin bucle · estéreo · superarma Hierro

Detonación nuclear: destello con silencio cortado, onda de choque descomunal, rugido profundo y viento que arrasa.
```
Massive nuclear-scale detonation in the desert, cinematic, overwhelming and terrifying. Iron Front sound identity: heavy industrial army, brute force, massive and mechanical. Phase 1 (0-1 s): high incoming shriek cut by a sharp pressure crack and a split second of muffled silence. Phase 2 (1-4 s): colossal punchy blast with an enormous sub-bass impact, a deep layered roar that grows and swallows everything, the shockwave sweeping past in wide stereo with a violent wind blast. Phase 3 (4-10 s): long rolling thunder across the open desert, sand storm hissing, debris and metal raining down, a deep low rumble slowly fading. Dry open-desert outdoor reverb with very long echoes off distant dunes. 10 seconds, one-shot, stereo. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 038 · Tormenta de cohetes · lanzamiento · Red Guerrillera
Archivo: `public/juego/audio/super-cohetes-lanzamiento.ogg` · 6,0 s · sin bucle · estéreo · superarma Guerrilla

Salva masiva de cohetes improvisados: decenas de encendidos en cascada, siseos sucios y armazones oxidados que traquetean.
```
Massive ripple salvo of dozens of improvised rockets launched from rusty truck-mounted racks, cinematic and chaotic. Guerrilla Network sound identity: old worn improvised weapons, rattling loose metal, dirty black powder, wood and scrap, gritty and raw. Phase 1 (0-0.5 s): a crude metal switch clack and a short electrical buzz. Phase 2 (0.5-4 s): a rapid cascade of punchy ignition pops, dirty sputtering rocket motors screaming away one after another, panning across a wide stereo field, rusty launch rails rattling violently, sub-bass thumps under each launch. Phase 3 (4-6 s): the swarm hissing into the distance in irregular streaks, sand and smoke settling, a loose metal sheet still vibrating. Dry open-desert outdoor reverb with echoes off distant dunes. 6 seconds, one-shot, stereo. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

### 039 · Tormenta de cohetes · impacto · Red Guerrillera
Archivo: `public/juego/audio/super-cohetes-impacto.ogg` · 8,0 s · sin bucle · estéreo · superarma Guerrilla

Bombardeo de saturación: silbidos que caen, explosiones encadenadas que barren la zona, fuego y escombros.
```
Saturation rocket barrage landing on a target area, cinematic and relentless. Guerrilla Network sound identity: improvised rockets, dirty black powder, scrap metal, gritty and raw. Phase 1 (0-1.5 s): many rockets whistling and wobbling down from the sky, overlapping in wide stereo. Phase 2 (1.5-5.5 s): a rapid walking chain of punchy explosions, at least twenty detonations sweeping left to right, each with a sharp crack and sub-bass impact, building to a dense roar; scrap metal and rock fragments flying. Phase 3 (5.5-8 s): last scattered blasts, burning fires crackling, debris clattering down, a distant secondary explosion. Dry open-desert outdoor reverb with rolling echoes off distant dunes. 8 seconds, one-shot, stereo. Hyper-realistic, layered, cinematic AAA game audio, original design. No chiptune, no 8-bit, no retro synth, no cartoon, no music, no voices.
```

## 4. Interfaz por facción

La interfaz suena con la facción del jugador local. Es seca, sin reverberación de exterior, para distinguirse de la batalla. Los clics y confirmaciones se repiten cientos de veces: deben ser agradables y no cansar.

### 040 · Clic · Coalición Atlas
Archivo: `public/juego/audio/click-atlas.ogg` · 0,1 s · sin bucle · mono

Clic de consola táctica: toque de vidrio nítido con un brillo digital mínimo.
```
Ultra-short premium button click for a high-tech military command console. Atlas Coalition UI identity: clean high-tech digital military console, glassy, precise, cyan holographic feel. Layers: crisp punchy transient like a tiny tactile glass switch; a very short filtered digital tick with a soft high harmonic; almost no body, just a faint sub-bass touch for weight; 50 ms dry tail, no reverb. Subtle, expensive and comfortable when repeated hundreds of times. 0.1 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 041 · Orden recibida · Coalición Atlas
Archivo: `public/juego/audio/ack-atlas.ogg` · 0,3 s · sin bucle · mono

Confirmación de orden: dos pasos digitales limpios con un chasquido eléctrico suave.
```
Short order-acknowledged confirmation for a high-tech military command interface. Atlas Coalition UI identity: clean high-tech digital military console, glassy, precise, cyan holographic feel. Layers: crisp punchy transient of a soft electric snap; two quick clean filtered tones stepping upward, glassy and modern; light sub-bass pulse for weight; tiny data-burst shimmer at the end; dry 80 ms tail, no reverb. Confident and precise. 0.3 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 042 · Unidad lista · Coalición Atlas
Archivo: `public/juego/audio/ready-atlas.ogg` · 0,8 s · sin bucle · mono

Unidad lista: tono holográfico ascendente con carga breve de capacitor y cierre limpio.
```
Unit-ready notification for a high-tech military command interface. Atlas Coalition UI identity: clean high-tech digital military console, glassy, precise, cyan holographic feel. Layers: soft punchy transient of a magnetic latch; a short rising capacitor charge; a clean, bright holographic tone blooming upward; gentle sub-bass swell underneath; crisp digital lock click to finish; dry tail, no reverb. Positive and alert. 0.8 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 043 · Edificio ubicado · Coalición Atlas
Archivo: `public/juego/audio/place-atlas.ogg` · 0,7 s · sin bucle · mono

Edificio ubicado: anclaje magnético sólido con zumbido holográfico que se apaga.
```
Building placement confirmation for a high-tech military command interface. Atlas Coalition UI identity: clean high-tech digital military console, glassy, precise, cyan holographic feel. Layers: solid punchy transient of magnetic clamps locking into the ground; compact body with a clean sub-bass thump; a short holographic projector hum fading out; two precise servo clicks; dry tail, no reverb. Solid and satisfying. 0.7 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 044 · Construcción o mejora terminada · Coalición Atlas
Archivo: `public/juego/audio/chime-atlas.ogg` · 1,5 s · sin bucle · mono

Construcción terminada: campana digital cristalina ascendente con destello eléctrico.
```
Construction or upgrade complete notification for a high-tech military command interface. Atlas Coalition UI identity: clean high-tech digital military console, glassy, precise, cyan holographic feel. Layers: crisp punchy transient of a glass-like strike; a crystalline three-note digital bell rising, clean and modern; soft electric shimmer sparkling around it; warm sub-bass bloom underneath; short controlled decay, no outdoor reverb. Rewarding and refined. 1.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 045 · Alerta · Coalición Atlas
Archivo: `public/juego/audio/alert-atlas.ogg` · 1,5 s · sin bucle · mono

Alerta de ataque: pulso de advertencia moderno, urgente y limpio, con latido grave.
```
Base-under-attack warning for a high-tech military command interface. Atlas Coalition UI identity: clean high-tech digital military console, glassy, precise, cyan holographic feel. Layers: sharp punchy transient; two pulsing clean filtered warning tones, urgent but not harsh, with a slight electric edge; deep sub-bass heartbeat pulse under each tone; brief data-glitch flicker; dry tail, no reverb. Urgent, controlled, modern. 1.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 046 · Captura · Coalición Atlas
Archivo: `public/juego/audio/capture-atlas.ogg` · 1,5 s · sin bucle · mono

Captura de pozo o edificio: barrido digital de enlace de datos y bloqueos sucesivos.
```
Capture complete notification (oil well or building taken) for a high-tech military command interface. Atlas Coalition UI identity: clean high-tech digital military console, glassy, precise, cyan holographic feel. Layers: punchy transient of an electric snap; a fast clean data-link sweep rising across the spectrum; three precise digital lock clicks; a short confirming tone; sub-bass thump on the final lock; dry tail, no reverb. Decisive and technological. 1.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 047 · Ascenso · Coalición Atlas
Archivo: `public/juego/audio/rank-atlas.ogg` · 2,5 s · sin bucle · mono

Ascenso de rango: acorde luminoso que asciende, destello eléctrico y floración grave.
```
Rank promotion effect for a high-tech military command interface, not a melody. Atlas Coalition UI identity: clean high-tech digital military console, glassy, precise, cyan holographic feel. Layers: powerful punchy transient of an electric discharge; a luminous, wide rising chord of clean modern tones; bright electric shimmer and crystalline sparkles; deep sub-bass bloom that swells and settles; smooth controlled decay without outdoor reverb. Proud, solemn and rewarding. 2.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 048 · Objetivo cumplido · Coalición Atlas
Archivo: `public/juego/audio/obj-atlas.ogg` · 1,8 s · sin bucle · mono

Objetivo cumplido: confirmación digital de tres pasos con resolución clara y destello.
```
Mission objective complete notification for a high-tech military command interface. Atlas Coalition UI identity: clean high-tech digital military console, glassy, precise, cyan holographic feel. Layers: crisp punchy transient; a clean three-step digital confirmation resolving upward to a stable tone; soft electric shimmer; firm sub-bass thump on the final step; dry, controlled decay, no reverb. Clear sense of accomplishment. 1.8 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 049 · Transmisión · Coalición Atlas
Archivo: `public/juego/audio/radio-atlas.ogg` · 1,0 s · sin bucle · mono

Transmisión entrante cifrada: ráfaga de datos limpia, apertura de canal y silenciador digital.
```
Incoming encrypted transmission cue for a high-tech military command interface. Atlas Coalition UI identity: clean high-tech digital military console, glassy, precise, cyan holographic feel. Layers: crisp punchy transient of a channel opening; a short compressed digital data burst with clean modulated chirps; a soft, very clean digital squelch; light sub-bass pulse; tiny decrypt tick at the end; dry tail, no reverb. 1.0 second, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no static noise, no music, no voices.
```

### 050 · Victoria · Coalición Atlas
Archivo: `public/juego/audio/win-atlas.ogg` · 4,0 s · sin bucle · estéreo

Victoria: descarga triunfal de energía, acorde amplio brillante y destellos que se expanden.
```
Victory impact effect for a high-tech military faction, not a melody. Atlas Coalition UI identity: clean high-tech digital military console, glassy, precise, cyan holographic feel. Layers: huge punchy transient of a clean electric discharge; a wide, bright, triumphant sustained chord of modern tones expanding in stereo; crystalline sparkles rising; massive sub-bass impact and swell; a slow, polished decay with a light airy space. Triumphant and spectacular. 4 seconds, one-shot, stereo, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music track, no voices.
```

### 051 · Derrota · Coalición Atlas
Archivo: `public/juego/audio/lose-atlas.ogg` · 4,0 s · sin bucle · estéreo

Derrota: sistemas que se apagan, tono que cae, interferencia y silencio final.
```
Defeat effect for a high-tech military faction, not a melody. Atlas Coalition UI identity: clean high-tech digital military console, glassy, precise, cyan holographic feel. Layers: heavy punchy transient of a power failure clunk; capacitors discharging with a descending whine; a clean tone bending slowly downward; digital interference flickering in stereo; deep sub-bass drop; systems shutting down to silence with a final relay tick. Somber and controlled. 4 seconds, one-shot, stereo, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music track, no voices.
```

### 052 · Clic · Frente Hierro
Archivo: `public/juego/audio/click-hierro.ogg` · 0,1 s · sin bucle · mono

Clic de puesto de mando industrial: relé pesado y pequeño interruptor de acero.
```
Ultra-short button click for an industrial military command post. Iron Front UI identity: industrial command post with heavy relays, steel levers, brass horns and pneumatic hiss. Layers: firm punchy transient of a heavy electromechanical relay closing; tiny steel toggle switch snap; short low-mid body with a faint sub-bass knock for weight; 50 ms dry tail, no reverb. Solid, mechanical and comfortable when repeated hundreds of times. 0.1 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 053 · Orden recibida · Frente Hierro
Archivo: `public/juego/audio/ack-hierro.ogg` · 0,3 s · sin bucle · mono

Confirmación de orden: palanca de acero accionada, golpe de relé y soplo neumático.
```
Short order-acknowledged confirmation for an industrial military command post. Iron Front UI identity: industrial command post with heavy relays, steel levers, brass horns and pneumatic hiss. Layers: punchy transient of a steel lever thrown into position; deep relay clunk; short low pneumatic hiss; compact sub-bass thump; dry 80 ms tail, no reverb. Firm and disciplined. 0.3 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 054 · Unidad lista · Frente Hierro
Archivo: `public/juego/audio/ready-hierro.ogg` · 0,8 s · sin bucle · mono

Unidad lista: bocina de fábrica breve de dos tonos graves con relé de cierre.
```
Unit-ready notification for an industrial military command post. Iron Front UI identity: industrial command post with heavy relays, steel levers, brass horns and pneumatic hiss. Layers: punchy transient of a relay closing; a short two-tone low brass factory horn blast, rich and resonant; sub-bass weight under the horn; a small steam puff; heavy relay opening at the end; dry tail, no reverb. Strong and ready. 0.8 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 055 · Edificio ubicado · Frente Hierro
Archivo: `public/juego/audio/place-hierro.ogg` · 0,7 s · sin bucle · mono

Edificio ubicado: plancha de acero asentada con golpe de prensa hidráulica.
```
Building placement confirmation for an industrial military command post. Iron Front UI identity: industrial command post with heavy relays, steel levers, brass horns and pneumatic hiss. Layers: heavy punchy transient of a thick steel plate set down; a hydraulic press thump with deep sub-bass; short hydraulic hiss releasing; bolts ratcheting tight; dry tail, no reverb. Massive and solid. 0.7 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 056 · Construcción o mejora terminada · Frente Hierro
Archivo: `public/juego/audio/chime-hierro.ogg` · 1,5 s · sin bucle · mono

Construcción terminada: campana grave golpeada sobre acero, trinquete y liberación de vapor.
```
Construction or upgrade complete notification for an industrial military command post. Iron Front UI identity: industrial command post with heavy relays, steel levers, brass horns and pneumatic hiss. Layers: punchy transient of a hammer striking a deep steel bell; rich metallic ring with low harmonics; a heavy ratchet clicking; a satisfying steam release hiss; sub-bass bloom under the bell; controlled decay, no outdoor reverb. Proud and industrial. 1.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 057 · Alerta · Frente Hierro
Archivo: `public/juego/audio/alert-hierro.ogg` · 1,5 s · sin bucle · mono

Alerta de ataque: claxon industrial de dos toques con relés que golpean.
```
Base-under-attack warning for an industrial military command post. Iron Front UI identity: industrial command post with heavy relays, steel levers, brass horns and pneumatic hiss. Layers: punchy relay transient; two blasts of a harsh, powerful industrial klaxon horn with mechanical rasp; deep sub-bass under each blast; relays chattering between blasts; a burst of steam; dry tail, no reverb. Urgent and heavy. 1.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 058 · Captura · Frente Hierro
Archivo: `public/juego/audio/capture-hierro.ogg` · 1,5 s · sin bucle · mono

Captura: interruptor de palanca pesado, engranajes que encajan y bocina breve.
```
Capture complete notification (oil well or building taken) for an industrial military command post. Iron Front UI identity: industrial command post with heavy relays, steel levers, brass horns and pneumatic hiss. Layers: punchy transient of a big knife switch slammed shut; heavy gears meshing and locking; a short low brass horn blast; sub-bass thump on the lock; pneumatic hiss; dry tail, no reverb. Decisive and powerful. 1.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 059 · Ascenso · Frente Hierro
Archivo: `public/juego/audio/rank-hierro.ogg` · 2,5 s · sin bucle · mono

Ascenso de rango: golpe de yunque, acorde de bocinas graves y vapor solemne.
```
Rank promotion effect for an industrial military command post, not a melody. Iron Front UI identity: industrial command post with heavy relays, steel levers, brass horns and pneumatic hiss. Layers: massive punchy transient of a hammer on an anvil; a sustained chord of deep brass factory horns swelling; ringing anvil overtones; a long steam release; huge sub-bass bloom; controlled decay, no outdoor reverb. Proud, solemn and heavy. 2.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 060 · Objetivo cumplido · Frente Hierro
Archivo: `public/juego/audio/obj-hierro.ogg` · 1,8 s · sin bucle · mono

Objetivo cumplido: secuencia de relés y bocina de dos notas ascendentes.
```
Mission objective complete notification for an industrial military command post. Iron Front UI identity: industrial command post with heavy relays, steel levers, brass horns and pneumatic hiss. Layers: punchy transient of a relay bank switching in sequence; a brass horn sounding two rising notes, resonant and confident; sub-bass weight under the horn; a steel lever locking at the end; dry decay, no reverb. Clear accomplishment. 1.8 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 061 · Transmisión · Frente Hierro
Archivo: `public/juego/audio/radio-hierro.ogg` · 1,0 s · sin bucle · mono

Transmisión entrante: intercomunicador de válvulas que se enciende, zumbido y relé.
```
Incoming transmission cue for an industrial military command post. Iron Front UI identity: industrial command post with heavy relays, steel levers, brass horns and pneumatic hiss. Layers: punchy transient of a heavy relay; a vacuum-tube intercom warming up with a low hum; a short burst of coarse crackle through a metal loudspeaker; sub-bass hum; the channel opening with a mechanical click; dry tail, no reverb. 1.0 second, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 062 · Victoria · Frente Hierro
Archivo: `public/juego/audio/win-hierro.ogg` · 4,0 s · sin bucle · estéreo

Victoria: bocinas de fábrica triunfales, golpes de yunque y vapor que estalla.
```
Victory impact effect for a heavy industrial military faction, not a melody. Iron Front UI identity: industrial command post with heavy relays, steel levers, brass horns and pneumatic hiss. Layers: huge punchy transient of a giant anvil strike; a chorus of deep brass factory horns blasting a triumphant sustained chord across wide stereo; two more anvil hits; steam vents bursting; massive sub-bass impact; slow heavy decay with a light open-air space. Powerful and triumphant. 4 seconds, one-shot, stereo, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music track, no voices.
```

### 063 · Derrota · Frente Hierro
Archivo: `public/juego/audio/lose-hierro.ogg` · 4,0 s · sin bucle · estéreo

Derrota: bocina que muere descendiendo, maquinaria que se detiene y metal que se asienta.
```
Defeat effect for a heavy industrial military faction, not a melody. Iron Front UI identity: industrial command post with heavy relays, steel levers, brass horns and pneumatic hiss. Layers: heavy punchy transient of a main breaker tripping; a deep brass horn sagging and dying downward; machinery winding down with slowing gears; steam pressure escaping; deep sub-bass drop; a final steel creak settling into silence. Somber and heavy. 4 seconds, one-shot, stereo, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music track, no voices.
```

### 064 · Clic · Red Guerrillera
Archivo: `public/juego/audio/click-guerrilla.ogg` · 0,1 s · sin bucle · mono

Clic de radio de campaña: botón plástico viejo con un toque mínimo de estática.
```
Ultra-short button click for an improvised guerrilla field command setup. Guerrilla Network UI identity: old field radio with static, transmitter clicks, human whistles and wooden knocks. Layers: dry punchy transient of an old worn plastic radio button; a tiny tick of radio static; a faint wooden knock for body with a light sub-bass touch; 50 ms dry tail, no reverb. Raw but comfortable when repeated hundreds of times. 0.1 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 065 · Orden recibida · Red Guerrillera
Archivo: `public/juego/audio/ack-guerrilla.ogg` · 0,3 s · sin bucle · mono

Confirmación de orden: botón de transmisión del radio, ráfaga de estática y cierre del silenciador.
```
Short order-acknowledged confirmation for an improvised guerrilla field command setup. Guerrilla Network UI identity: old field radio with static, transmitter clicks, human whistles and wooden knocks. Layers: punchy transient of a walkie-talkie push-to-talk click; a short crackling burst of static; the squelch tail closing with a soft chirp; light sub-bass touch; dry 80 ms tail, no reverb. Quick and discreet. 0.3 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 066 · Unidad lista · Red Guerrillera
Archivo: `public/juego/audio/ready-guerrilla.ogg` · 0,8 s · sin bucle · mono

Unidad lista: silbido humano breve de dos notas a través de un radio viejo.
```
Unit-ready notification for an improvised guerrilla field command setup. Guerrilla Network UI identity: old field radio with static, transmitter clicks, human whistles and wooden knocks. Layers: punchy transient of a radio key click; a short two-note human finger whistle signal, heard through a small old radio speaker with light static; a wooden knock for body with a faint sub-bass thump; squelch closing; dry tail, no reverb. Alert and clever. 0.8 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 067 · Edificio ubicado · Red Guerrillera
Archivo: `public/juego/audio/place-guerrilla.ogg` · 0,7 s · sin bucle · mono

Edificio ubicado: caja de madera asentada sobre arena, cuerda que cruje y chapa suelta.
```
Building placement confirmation for an improvised guerrilla field command setup. Guerrilla Network UI identity: old field radio with static, transmitter clicks, human whistles and wooden knocks. Layers: punchy transient of a heavy wooden crate dropped onto packed sand; dull body with a sub-bass thump; a rope creaking tight; a loose sheet of scrap metal rattling once; sand settling; dry tail, no reverb. Earthy and practical. 0.7 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 068 · Construcción o mejora terminada · Red Guerrillera
Archivo: `public/juego/audio/chime-guerrilla.ogg` · 1,5 s · sin bucle · mono

Construcción terminada: dos golpes de martillo sobre un tubo de chatarra con chasquido de radio.
```
Construction or upgrade complete notification for an improvised guerrilla field command setup. Guerrilla Network UI identity: old field radio with static, transmitter clicks, human whistles and wooden knocks. Layers: punchy transient of a hammer striking a hanging scrap metal pipe; a second, higher strike; rough metallic ringing with uneven overtones; a wooden knock; sub-bass bloom under the first strike; a short radio squelch at the end; controlled decay, no outdoor reverb. Resourceful and satisfying. 1.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 069 · Alerta · Red Guerrillera
Archivo: `public/juego/audio/alert-guerrilla.ogg` · 1,5 s · sin bucle · mono

Alerta de ataque: ráfaga de estática, silbido agudo urgente y sirena de manivela breve.
```
Base-under-attack warning for an improvised guerrilla field command setup. Guerrilla Network UI identity: old field radio with static, transmitter clicks, human whistles and wooden knocks. Layers: punchy transient of a harsh static burst; two sharp urgent human whistles; a short wind-up of an old hand-cranked siren; sub-bass thump under the first whistle; radio crackling; dry tail, no reverb. Urgent and raw. 1.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 070 · Captura · Red Guerrillera
Archivo: `public/juego/audio/capture-guerrilla.ogg` · 1,5 s · sin bucle · mono

Captura: pestillo metálico, golpe de madera, silbido de aviso y chasquido del radio.
```
Capture complete notification (oil well or building taken) for an improvised guerrilla field command setup. Guerrilla Network UI identity: old field radio with static, transmitter clicks, human whistles and wooden knocks. Layers: punchy transient of a rusty metal latch snapped shut; a firm wooden knock with sub-bass weight; a short rising human whistle; radio squelch and a crackle of static; dry tail, no reverb. Sly and decisive. 1.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 071 · Ascenso · Red Guerrillera
Archivo: `public/juego/audio/rank-guerrilla.ogg` · 2,5 s · sin bucle · mono

Ascenso de rango: golpe de tambor de marco, sonajero de metal, silbido ascendente y estática.
```
Rank promotion effect for an improvised guerrilla field command setup, not a melody. Guerrilla Network UI identity: old field radio with static, transmitter clicks, human whistles and wooden knocks. Layers: powerful punchy transient of a deep frame drum hit; a metal bottle-cap shaker rattling; a long rising human whistle; a second drum hit with a strong sub-bass bloom; radio static swelling and closing with a squelch; controlled decay, no outdoor reverb. Proud and earthy. 2.5 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 072 · Objetivo cumplido · Red Guerrillera
Archivo: `public/juego/audio/obj-guerrilla.ogg` · 1,8 s · sin bucle · mono

Objetivo cumplido: silbido de dos notas, palmada de madera y cierre del radio.
```
Mission objective complete notification for an improvised guerrilla field command setup. Guerrilla Network UI identity: old field radio with static, transmitter clicks, human whistles and wooden knocks. Layers: punchy transient of two wooden blocks clapped; a confident two-note human whistle rising; a light metal rattle; sub-bass thump on the clap; radio squelch closing; dry decay, no reverb. Clear accomplishment. 1.8 seconds, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 073 · Transmisión · Red Guerrillera
Archivo: `public/juego/audio/radio-guerrilla.ogg` · 1,0 s · sin bucle · mono

Transmisión entrante: radio de onda corta que se sintoniza, estática, silbido de portadora y chasquido.
```
Incoming transmission cue for an improvised guerrilla field command setup. Guerrilla Network UI identity: old field radio with static, transmitter clicks, human whistles and wooden knocks. Layers: punchy transient of an old radio switch; shortwave tuning sweep through crackling static and a thin carrier whistle; the signal locking in; light sub-bass hum; squelch opening with a click; dry tail, no reverb. 1.0 second, one-shot, mono, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music, no voices.
```

### 074 · Victoria · Red Guerrillera
Archivo: `public/juego/audio/win-guerrilla.ogg` · 4,0 s · sin bucle · estéreo

Victoria: coro de silbidos, tambores de marco, chatarra que suena y estática que se abre.
```
Victory impact effect for an improvised guerrilla faction, not a melody. Guerrilla Network UI identity: old field radio with static, transmitter clicks, human whistles and wooden knocks. Layers: huge punchy transient of several frame drums hit together; a chorus of rising human whistles spreading in wide stereo; scrap metal and bottle caps rattling in celebration; a second drum hit with a massive sub-bass impact; radio static opening wide; slow decay with a light open-air space. Joyful and defiant. 4 seconds, one-shot, stereo, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music track, no voices.
```

### 075 · Derrota · Red Guerrillera
Archivo: `public/juego/audio/lose-guerrilla.ogg` · 4,0 s · sin bucle · estéreo

Derrota: señal de radio que se pierde en la estática, silbido lento descendente y chasquido final.
```
Defeat effect for an improvised guerrilla faction, not a melody. Guerrilla Network UI identity: old field radio with static, transmitter clicks, human whistles and wooden knocks. Layers: heavy punchy transient of a dull wooden thud; a radio signal breaking up and drowning in static across stereo; a slow, sad descending human whistle; deep sub-bass drop; the static fading to silence with a final radio switch click. Somber and quiet. 4 seconds, one-shot, stereo, no leading silence. Hyper-realistic, layered, cinematic AAA game UI audio, original design. No chiptune, no 8-bit, no retro synth, no square-wave beeps, no cartoon, no music track, no voices.
```

## 5. Música adaptativa

Cada facción tiene una pista de calma (concentración) y una de combate. Ambas comparten tonalidad, centro tonal y motivo, para que el cambio de una a otra suene como la misma obra que acelera, y no como dos canciones distintas.

| Archivo | Tonalidad | BPM | Compás | Compases del bucle | Duración exacta | Motivo de facción |
|---|---|---|---|---|---|---|
| `musica-menu.ogg` | La menor | 72 | 4/4 | 24 | 80,000 s | La–Do–Mi–Re |
| `musica-calma-atlas.ogg` | Re menor | 76 | 4/4 | 24 | 75,789 s | Re–Fa–La–Mi |
| `musica-combate-atlas.ogg` | Re menor | 114 | 4/4 | 32 | 67,368 s | Re–Fa–La–Mi |
| `musica-victoria-atlas.ogg` | Re menor → Re mayor | 114 | 4/4 | — | 10 s | Re–Fa#–La |
| `musica-derrota-atlas.ogg` | Re menor | 60 | 4/4 | — | 10 s | Re–Fa–La–Mi lento |
| `musica-calma-hierro.ogg` | Do menor | 74 | 4/4 | 24 | 77,838 s | Do–Do–Mib–Sol–Fa |
| `musica-combate-hierro.ogg` | Do menor | 111 | 4/4 | 32 | 69,189 s | Do–Do–Mib–Sol–Fa |
| `musica-victoria-hierro.ogg` | Do menor → Do mayor | 111 | 4/4 | — | 10 s | Do–Mi–Sol |
| `musica-derrota-hierro.ogg` | Do menor | 56 | 4/4 | — | 10 s | Do–Do–Mib–Sol–Fa lento |
| `musica-calma-guerrilla.ogg` | Mi frigio dominante | 80 | 4/4 | 24 | 72,000 s | Mi–Fa–Sol#–La |
| `musica-combate-guerrilla.ogg` | Mi frigio dominante | 120 | 4/4 | 36 | 72,000 s | Mi–Fa–Sol#–La |
| `musica-victoria-guerrilla.ogg` | Mi mayor | 120 | 4/4 | — | 10 s | Mi–Sol#–Si |
| `musica-derrota-guerrilla.ogg` | Mi frigio | 64 | 4/4 | — | 10 s | Mi–Fa–Mi lento |

| Regla de transición | Detalle |
|---|---|
| Relación de tempo | Combate = calma × 1,5. Dos compases de calma duran lo mismo que tres de combate. El cambio queda alineado en el límite de frase. |
| Tonalidad | Calma, combate y stingers de una facción comparten la misma tónica. El fundido cruzado no produce choques armónicos. |
| Entrada y salida | Calma → combate al detectar combate cercano; combate → calma tras unos segundos sin combate. Fundido de 1,5 a 3 s. |
| Espacio para los efectos | Calma sin melodía protagonista ni golpes fuertes. Combate con energía en graves y percusión, sin solos que tapen las alertas. |
| Bucle | Sin introducción ni final: la pista debe empezar y terminar en el mismo estado musical. Recorte según la sección 9. |
| Stingers | Victoria y derrota no son bucles: tienen ataque inmediato y cola natural de 2 a 3 s dentro de los 10 s. |

Notas para Suno o Udio:

- Active el modo instrumental. En la Red Guerrillera, si el modo instrumental elimina las voces sin palabras, use el modo personalizado con la letra `[wordless chant]` y sin texto.
- Genere una pista de 2 a 3 minutos y extraiga el bucle desde un tiempo fuerte estable del medio, no desde el inicio.
- Si el campo de estilo es corto, pegue la línea «Estilo corto» y, en la descripción, el prompt completo.

### 076 · Menú principal
Archivo: `public/juego/audio/musica-menu.ogg` · 1:20 · bucle · estéreo · La menor · 72 BPM · 24 compases

Tema del menú: amplio y sereno, con un guiño a las tres facciones; amanecer en el desierto.

Estilo corto (Suno): `instrumental cinematic desert theme, A minor, 72 BPM, low strings, soft synth pulse, frame drum, anvil hits, plucked strings, wide, calm, no vocals`
```
Instrumental main menu theme for an original desert military strategy game. Key A minor, 72 BPM, 4/4, 24 bars, seamless loop with no intro and no ending. Mood: vast desert at dawn, calm, grand and focused, quiet tension before a campaign. Instrumentation blends three faction colors: a soft modern synth pulse and evolving pads (high-tech coalition), distant low brass and a muted anvil strike every four bars (industrial army), a soft frame drum and plucked desert lute-like strings (guerrilla network). Low string ensemble sustains, wide cinematic stereo, deep sub-bass swells every eight bars. Recurring four-note motif A, C, E, D, stated gently. Hyper-realistic film-score production, layered, cinematic. No vocals, no lyrics, no chiptune, no 8-bit, no retro game music. Original composition, not imitating any composer, band, film or game.
```

### 077 · Calma · Coalición Atlas
Archivo: `public/juego/audio/musica-calma-atlas.ogg` · 1:16 · bucle · estéreo · Re menor · 76 BPM · 24 compases

Concentración Atlas: pulso lento de sintetizador, pads que evolucionan, piano apagado y tensión contenida.

Estilo corto (Suno): `instrumental cinematic electronica, D minor, 76 BPM, focus loop, evolving synth pads, felt piano, low strings, slow pulse, contained tension, no vocals`
```
Instrumental adaptive game music, calm concentration loop for a high-tech military faction. Key D minor, 76 BPM, 4/4, 24 bars, seamless loop with no intro and no ending. Atlas Coalition identity: modern orchestral electronica with clean contemporary synthesizers, precise and cool. Slow pulsing synth bass on D in eighth notes, warm evolving pads, soft felt piano stating the motif D, F, A, E sparsely, long low string sustains, subtle granular glitch textures, a gentle ticking hi-hat, deep cinematic sub-bass swells every eight bars. Contained tension, focused and calm, leaves space for sound effects, no busy melody, no drops, no big drums. Wide, clean, modern film-score mix. Hyper-realistic production, layered, cinematic. No vocals, no lyrics, no chiptune, no 8-bit, no retro synth. Original composition, not imitating any composer, band, film or game.
```

### 078 · Combate · Coalición Atlas
Archivo: `public/juego/audio/musica-combate-atlas.ogg` · 1:07 · bucle · estéreo · Re menor · 114 BPM · 32 compases

Combate Atlas: misma tonalidad y motivo que la calma, ahora con percusión híbrida potente y ostinato electrónico.

Estilo corto (Suno): `instrumental hybrid orchestral electronic battle music, D minor, 114 BPM, driving synth ostinato, staccato strings, taiko, brass stabs, sub-bass, no vocals`
```
Instrumental adaptive game music, intense battle loop for a high-tech military faction. Key D minor, 114 BPM, 4/4, 32 bars, seamless loop with no intro and no ending. Same tonal center and motif as its calm track: the motif D, F, A, E now played boldly by brass and synth lead. Atlas Coalition identity: modern orchestral electronica with clean contemporary synthesizers. Powerful hybrid percussion: deep taiko-like drums, tight punchy electronic kicks, big snares, a driving sixteenth-note synth ostinato on D, staccato string ostinato, short brass stabs, rising risers every eight bars, heavy sub-bass hits. Urgent, focused, relentless but not chaotic; leaves midrange space for alerts. Hyper-realistic production, layered, cinematic. No vocals, no lyrics, no chiptune, no 8-bit, no retro synth. Original composition, not imitating any composer, band, film or game.
```

### 079 · Victoria · Coalición Atlas
Archivo: `public/juego/audio/musica-victoria-atlas.ogg` · 0:10 · sin bucle · estéreo · Re mayor · 114 BPM

Stinger de victoria Atlas: el motivo resuelve en mayor con metales y sintetizadores brillantes.

Estilo corto (Suno): `short instrumental victory sting, D major, 114 BPM, triumphant brass, bright synths, big drums, cinematic, 10 seconds, no vocals`
```
Short instrumental victory stinger, 10 seconds, for a high-tech military faction. Starts immediately on a strong hit, no intro. Key resolves from D minor to D major, 114 BPM. Atlas Coalition identity: modern orchestral electronica with clean contemporary synthesizers. A big punchy drum and sub-bass impact, the motif D, F-sharp, A played triumphantly by brass and a bright synth lead, shimmering arpeggios, a final sustained D major chord with a natural 2 to 3 second decay. Proud, clean, spectacular. Hyper-realistic production, layered, cinematic. No vocals, no lyrics, no chiptune, no 8-bit, no retro synth. Original composition, not imitating any composer, band, film or game.
```

### 080 · Derrota · Coalición Atlas
Archivo: `public/juego/audio/musica-derrota-atlas.ogg` · 0:10 · sin bucle · estéreo · Re menor · 60 BPM

Stinger de derrota Atlas: el motivo lento en piano y pads que se apagan.

Estilo corto (Suno): `short instrumental defeat sting, D minor, 60 BPM, slow felt piano, fading synth pads, low strings, somber, 10 seconds, no vocals`
```
Short instrumental defeat stinger, 10 seconds, for a high-tech military faction. Starts immediately, no intro. Key D minor, 60 BPM. Atlas Coalition identity: modern orchestral electronica with clean contemporary synthesizers. A deep sub-bass hit, then the motif D, F, A, E played slowly on felt piano, low strings sustaining a dark D minor chord, synth pads slowly detuning and fading as if systems power down, a final low D with a natural decay. Somber, dignified, not melodramatic. Hyper-realistic production, layered, cinematic. No vocals, no lyrics, no chiptune, no 8-bit, no retro synth. Original composition, not imitating any composer, band, film or game.
```

### 081 · Calma · Frente Hierro
Archivo: `public/juego/audio/musica-calma-hierro.ogg` · 1:18 · bucle · estéreo · Do menor · 74 BPM · 24 compases

Concentración Hierro: cuerdas graves, metales profundos, yunque lejano y tictac mecánico.

Estilo corto (Suno): `instrumental dark industrial orchestral, C minor, 74 BPM, focus loop, low cellos drone, deep brass, distant anvil, mechanical ticking, steam textures, no vocals`
```
Instrumental adaptive game music, calm concentration loop for a heavy industrial army. Key C minor, 74 BPM, 4/4, 24 bars, seamless loop with no intro and no ending. Iron Front identity: industrial metal and orchestra, low brass, anvil percussion, steel and steam. Low bowed cellos and basses droning on C, deep tubas and horns holding slow dark chords, the motif C, C, E-flat, G, F stated softly by a low horn, a distant anvil strike on beat one every two bars, a mechanical steel ticking like a factory clock, faint steam hiss and metal resonance textures, deep sub-bass swells every eight bars. Contained, heavy, patient tension; leaves space for sound effects; no big drums. Hyper-realistic production, layered, cinematic. No vocals, no lyrics, no chiptune, no 8-bit, no retro synth. Original composition, not imitating any composer, band, film or game.
```

### 082 · Combate · Frente Hierro
Archivo: `public/juego/audio/musica-combate-hierro.ogg` · 1:09 · bucle · estéreo · Do menor · 111 BPM · 32 compases

Combate Hierro: misma tonalidad y motivo que la calma, con percusión de yunque, metales y riff industrial.

Estilo corto (Suno): `instrumental industrial metal orchestral battle, C minor, 111 BPM, anvil percussion, huge toms, palm-muted baritone guitar riff, low brass ostinato, no vocals`
```
Instrumental adaptive game music, intense battle loop for a heavy industrial army. Key C minor, 111 BPM, 4/4, 32 bars, seamless loop with no intro and no ending. Same tonal center and motif as its calm track: the motif C, C, E-flat, G, F now hammered by low brass. Iron Front identity: industrial metal and orchestra, low brass, anvil percussion, steel and steam. Massive percussion of anvils, struck steel sheets and huge low toms; a chugging palm-muted baritone guitar riff on C locked to the kick; a relentless low brass and string ostinato; hissing steam bursts as transitions; heavy sub-bass impacts every four bars. Brutal, disciplined, marching forward; leaves midrange space for alerts. Hyper-realistic production, layered, cinematic. No vocals, no lyrics, no chiptune, no 8-bit, no retro synth. Original composition, not imitating any composer, band, film or game.
```

### 083 · Victoria · Frente Hierro
Archivo: `public/juego/audio/musica-victoria-hierro.ogg` · 0:10 · sin bucle · estéreo · Do mayor · 111 BPM

Stinger de victoria Hierro: metales graves triunfales, yunques y un acorde mayor final.

Estilo corto (Suno): `short instrumental victory sting, C major, 111 BPM, massive low brass, anvil hits, war drums, industrial, triumphant, 10 seconds, no vocals`
```
Short instrumental victory stinger, 10 seconds, for a heavy industrial army. Starts immediately on a strong hit, no intro. Key resolves from C minor to C major, 111 BPM. Iron Front identity: industrial metal and orchestra, low brass, anvil percussion, steel and steam. A huge anvil and war drum impact with deep sub-bass, massive low brass playing C, E, G triumphantly, two more anvil strikes, a burst of steam, a final sustained C major brass chord with a natural 2 to 3 second decay. Powerful, proud, monumental. Hyper-realistic production, layered, cinematic. No vocals, no lyrics, no chiptune, no 8-bit, no retro synth. Original composition, not imitating any composer, band, film or game.
```

### 084 · Derrota · Frente Hierro
Archivo: `public/juego/audio/musica-derrota-hierro.ogg` · 0:10 · sin bucle · estéreo · Do menor · 56 BPM

Stinger de derrota Hierro: metales que caen, yunque apagado y maquinaria que se detiene.

Estilo corto (Suno): `short instrumental defeat sting, C minor, 56 BPM, slow low brass, muted anvil, low strings, machinery winding down, somber, 10 seconds, no vocals`
```
Short instrumental defeat stinger, 10 seconds, for a heavy industrial army. Starts immediately, no intro. Key C minor, 56 BPM. Iron Front identity: industrial metal and orchestra, low brass, anvil percussion, steel and steam. A heavy muted anvil hit with deep sub-bass, the motif C, C, E-flat, G, F played slowly by a solo low horn, low strings sinking to a dark C minor chord, distant machinery winding down, a last steam sigh and a natural decay into silence. Somber, heavy, dignified, not melodramatic. Hyper-realistic production, layered, cinematic. No vocals, no lyrics, no chiptune, no 8-bit, no retro synth. Original composition, not imitating any composer, band, film or game.
```

### 085 · Calma · Red Guerrillera
Archivo: `public/juego/audio/musica-calma-guerrilla.ogg` · 1:12 · bucle · estéreo · Mi frigio dominante · 80 BPM · 24 compases

Concentración guerrillera: percusión de mano suave, cuerdas pulsadas del desierto y voces lejanas sin palabras.

Estilo corto (Suno): `instrumental desert ambient, E phrygian dominant, 80 BPM, focus loop, soft frame drum, goblet drum, plucked lute, nylon guitar, drone, distant wordless hum`
```
Instrumental adaptive game music, calm concentration loop for an improvised guerrilla network. Key E phrygian dominant, 80 BPM, 4/4, 24 bars, seamless loop with no intro and no ending. Guerrilla Network identity: hand percussion, plucked desert strings, wordless human voices, raw and intimate. A low drone on E, soft frame drum and light goblet drum pattern, a seed shaker, plucked desert lute-like strings and a dry nylon guitar playing the motif E, F, G-sharp, A sparsely, a breathy end-blown reed flute far away, a distant wordless human hum, deep sub-bass swells every eight bars. Stealthy, patient, contained tension, like waiting in the shadows; leaves space for sound effects. Hyper-realistic production, layered, cinematic. No lyrics, no words, no chiptune, no 8-bit, no retro synth. Original composition, not imitating any composer, band, film or game.
```

### 086 · Combate · Red Guerrillera
Archivo: `public/juego/audio/musica-combate-guerrilla.ogg` · 1:12 · bucle · estéreo · Mi frigio dominante · 120 BPM · 36 compases

Combate guerrillero: misma tonalidad y motivo que la calma, con tambores de mano intensos, cuerdas rápidas y cantos sin palabras.

Estilo corto (Suno): `instrumental desert battle music, E phrygian dominant, 120 BPM, driving frame drums, goblet drums, hand claps, scrap metal percussion, fast plucked strings, wordless chants`
```
Instrumental adaptive game music, intense battle loop for an improvised guerrilla network. Key E phrygian dominant, 120 BPM, 4/4, 36 bars, seamless loop with no intro and no ending. Same tonal center and motif as its calm track: the motif E, F, G-sharp, A now driven by fast plucked strings. Guerrilla Network identity: hand percussion, plucked desert strings, wordless human voices, raw and intimate. Driving layered frame drums and goblet drums, hand claps, scrap metal and bottle-cap percussion, a fast plucked lute and guitar ostinato, a low drone on E, powerful wordless group chants answering the motif, punchy sub-bass hits every four bars. Fierce, agile, ambush energy; leaves midrange space for alerts. Hyper-realistic production, layered, cinematic. No lyrics, no words, no chiptune, no 8-bit, no retro synth. Original composition, not imitating any composer, band, film or game.
```

### 087 · Victoria · Red Guerrillera
Archivo: `public/juego/audio/musica-victoria-guerrilla.ogg` · 0:10 · sin bucle · estéreo · Mi mayor · 120 BPM

Stinger de victoria guerrillera: tambores, cuerdas pulsadas y un canto colectivo sin palabras que resuelve en mayor.

Estilo corto (Suno): `short instrumental victory sting, E major, 120 BPM, frame drums, plucked strings, joyful wordless group chant, defiant, 10 seconds`
```
Short instrumental victory stinger, 10 seconds, for an improvised guerrilla network. Starts immediately on a strong hit, no intro. Key E major, the tonic chord of E phrygian dominant, 120 BPM. Guerrilla Network identity: hand percussion, plucked desert strings, wordless human voices. A big hit of frame drums with sub-bass weight, fast plucked strings rising E, G-sharp, B, a joyful wordless group chant, rattling metal percussion, a final sustained E major chord with a natural 2 to 3 second decay. Defiant, warm, celebratory. Hyper-realistic production, layered, cinematic. No lyrics, no words, no chiptune, no 8-bit, no retro synth. Original composition, not imitating any composer, band, film or game.
```

### 088 · Derrota · Red Guerrillera
Archivo: `public/juego/audio/musica-derrota-guerrilla.ogg` · 0:10 · sin bucle · estéreo · Mi frigio · 64 BPM

Stinger de derrota guerrillera: cuerda pulsada sola, tambor apagado y voz lejana que se pierde.

Estilo corto (Suno): `short instrumental defeat sting, E phrygian, 64 BPM, solo plucked lute, muted frame drum, distant wordless voice fading, somber, 10 seconds`
```
Short instrumental defeat stinger, 10 seconds, for an improvised guerrilla network. Starts immediately, no intro. Key E phrygian, 64 BPM. Guerrilla Network identity: hand percussion, plucked desert strings, wordless human voices. A single muted frame drum hit with deep sub-bass, a solo plucked lute playing E, F, E slowly, a low drone, a distant lone wordless voice fading into the wind, a natural decay into silence. Somber, quiet, dignified, not melodramatic. Hyper-realistic production, layered, cinematic. No lyrics, no words, no chiptune, no 8-bit, no retro synth. Original composition, not imitating any composer, band, film or game.
```

## 6. Ambiente

Bucles de 60 s, estéreo, sin eventos que llamen la atención (se notarían al repetirse). ElevenLabs genera hasta unos 30 s por solicitud: genere dos tramos con el mismo prompt y únalos según la sección 9.

### 089 · Desierto de día
Archivo: `public/juego/audio/amb-dia.ogg` · 60 s · bucle · estéreo

Desierto a mediodía: viento seco constante, arena que corre y algún insecto lejano.
```
Seamless looping ambience of a vast open desert at midday, for an original strategy game. Hyper-realistic field-recording quality, layered, wide stereo. Layers: a steady dry wind with slow gusts rising and falling; fine sand grains hissing across dunes; a loose tarp or wire faintly flapping far away; very occasional distant insect buzz; a low, barely audible sub-bass rumble of open space. Dry open-desert outdoor acoustics, no close sounds, no sudden events, no birdsong melodies. Calm and hot. 60 seconds, seamless loop, stereo, no fade-in, no fade-out. No music, no voices, no chiptune, no 8-bit, no retro synth.
```

### 090 · Desierto al atardecer
Archivo: `public/juego/audio/amb-atardecer.ogg` · 60 s · bucle · estéreo

Desierto al atardecer: viento que se calma, arena suave, aves lejanas y metal que se enfría.
```
Seamless looping ambience of a vast open desert at sunset, for an original strategy game. Hyper-realistic field-recording quality, layered, wide stereo. Layers: a softer, warmer wind settling down; gentle sand movement; a few distant birds calling far away, sparse and irregular; faint ticking of metal cooling after the heat; a low, warm sub-bass bed of open space. Dry open-desert outdoor acoustics, no close sounds, no sudden events. Calm, golden and slightly melancholic. 60 seconds, seamless loop, stereo, no fade-in, no fade-out. No music, no voices, no chiptune, no 8-bit, no retro synth.
```

### 091 · Desierto de noche
Archivo: `public/juego/audio/amb-noche.ogg` · 60 s · bucle · estéreo

Desierto de noche: viento frío y bajo, grillos dispersos y silencio amplio.
```
Seamless looping ambience of a vast open desert at night, for an original strategy game. Hyper-realistic field-recording quality, layered, wide stereo. Layers: a cold, low, steady wind with slow distant gusts; sparse desert crickets far away on both sides; occasional soft sand slide; a faint metal creak of a distant structure; a deep, quiet sub-bass bed that makes the silence feel huge. Dry open-desert outdoor acoustics, no close sounds, no sudden events. Still, tense and vast. 60 seconds, seamless loop, stereo, no fade-in, no fade-out. No music, no voices, no chiptune, no 8-bit, no retro synth.
```

### 092 · Batalla lejana
Archivo: `public/juego/audio/amb-batalla-lejana.ogg` · 60 s · bucle · estéreo

Batalla a varios kilómetros: retumbos de artillería, ráfagas apagadas y viento del desierto.
```
Seamless looping ambience of a battle raging several kilometers away across an open desert, for an original strategy game. Hyper-realistic field-recording quality, layered, wide stereo. Layers: steady desert wind in the foreground; distant muffled artillery thuds rolling across the dunes with deep sub-bass; faint, dull machine-gun bursts far away; occasional low rumble of a distant explosion; no close or sharp sounds, all high frequencies softened by distance. Dry open-desert outdoor acoustics with long, soft echoes. Tense, ominous, continuous. 60 seconds, seamless loop, stereo, no fade-in, no fade-out. No music, no voices, no chiptune, no 8-bit, no retro synth.
```

## 7. Voces de unidades por facción

Procedimiento para cada voz:

1. En ElevenLabs Voice Design, pegue el prompt de diseño (en inglés, porque la herramienta lo interpreta mejor) y guarde la voz con el nombre indicado.
2. En ElevenLabs TTS, seleccione esa voz y pegue **solo el texto** de cada línea. Una línea por generación.
3. Use la columna «Tono» para elegir entre las variantes o ajustar estabilidad y estilo.
4. Aplique el procesamiento de la facción (tabla siguiente), exporte en OGG mono, 44,1 kHz, y guarde con el nombre exacto en `public/juego/audio/`.

Las voces son sintéticas. No use la clonación de voz con grabaciones de personas reales. Las respuestas no llevan gritos, quejidos ni sonidos de dolor.

| Facción | Carácter de la voz | Procesamiento posterior (filtro de ffmpeg) |
|---|---|---|
| Coalición Atlas | Operador sereno y técnico, dicción precisa | Casco digital limpio: `highpass=f=250,lowpass=f=6500,acompressor=threshold=0.125:ratio=3:attack=5:release=80` |
| Frente Hierro | Tripulante grave y firme, pecho resonante | Intercomunicador metálico: `highpass=f=140,lowpass=f=4200,volume=4dB,asoftclip=type=tanh,acompressor=threshold=0.125:ratio=4` |
| Red Guerrillera | Rebelde joven, voz baja y rápida | Radio vieja: `highpass=f=450,lowpass=f=3200,volume=3dB,asoftclip=type=hard`, y en el editor una cama de estática a −30 dB con un chasquido de radio al final |
| Héroes | Más cercanos y con más cuerpo que la tropa | Solo compresión suave; sin filtro de radio, para que se distingan |

### 093 · Voz de soldado · Coalición Atlas
Archivos: `public/juego/audio/voz-atlas-<línea>.ogg` · mono · nombre de la voz: «FA Atlas soldado»

Voz adulta, serena y técnica, con color de casco de comunicaciones digital.
```
Synthetic voice design for an original strategy game character. Adult soldier of a high-tech military coalition, gender-neutral to slightly male, age around 30 to 40. Speaks neutral Latin American Spanish with clear diction and no regional accent. Calm, precise, cool and professional, like a trained drone operator reading coordinates; every consonant crisp. Medium pitch, steady even pace, short clipped phrases, no emotion spikes. Clean studio quality with a subtle, modern digital helmet-comms color, slightly bright, no background noise. Not based on any real person or existing character.
```

| Archivo | Texto (copie tal cual) | Tono |
|---|---|---|
| `voz-atlas-seleccion-1.ogg` | Coalición en línea. | Sereno, atento |
| `voz-atlas-seleccion-2.ogg` | Sistemas listos. | Seguro, breve |
| `voz-atlas-seleccion-3.ogg` | A la escucha, comandante. | Profesional |
| `voz-atlas-seleccion-4.ogg` | Esperando coordenadas. | Neutro, técnico |
| `voz-atlas-mover-1.ogg` | Coordenadas recibidas. | Firme |
| `voz-atlas-mover-2.ogg` | Ruta calculada. | Preciso |
| `voz-atlas-mover-3.ogg` | En desplazamiento. | Sereno |
| `voz-atlas-mover-4.ogg` | Afirmativo, en camino. | Decidido |
| `voz-atlas-atacar-1.ogg` | Objetivo fijado. | Concentrado |
| `voz-atlas-atacar-2.ogg` | Iniciando ataque. | Firme, algo más intenso |
| `voz-atlas-atacar-3.ogg` | Blanco confirmado. | Frío, preciso |
| `voz-atlas-atacar-4.ogg` | Fuego autorizado. | Decidido |
| `voz-atlas-constructor-1.ogg` | Listo para construir. | Colaborador |
| `voz-atlas-constructor-2.ogg` | Estructura en proceso. | Técnico |
| `voz-atlas-recolector-1.ogg` | Plataforma de carga en ruta. | Sereno |
| `voz-atlas-recolector-2.ogg` | Carga asegurada. | Satisfecho, breve |

### 094 · Voz de soldado · Frente Hierro
Archivos: `public/juego/audio/voz-hierro-<línea>.ogg` · mono · nombre de la voz: «FA Hierro soldado»

Voz grave, firme y áspera, de tripulante de blindado, con color de intercomunicador metálico.
```
Synthetic voice design for an original strategy game character. Adult soldier of a heavy armored industrial army, male, age around 35 to 50. Speaks neutral Latin American Spanish with clear diction and no regional accent. Deep, gravelly, chesty, firm and disciplined, with controlled strength, never shouting; sounds like a tank crewman used to engine noise. Low pitch, deliberate heavy pace, short weighty phrases. Clean studio quality with a faint metallic tank-intercom color, slightly saturated low mids, no background noise. Not based on any real person or existing character.
```

| Archivo | Texto (copie tal cual) | Tono |
|---|---|---|
| `voz-hierro-seleccion-1.ogg` | Frente Hierro, presente. | Grave, disciplinado |
| `voz-hierro-seleccion-2.ogg` | Blindaje listo. | Seguro |
| `voz-hierro-seleccion-3.ogg` | Ordene, comandante. | Firme, respetuoso |
| `voz-hierro-seleccion-4.ogg` | Motores en marcha. | Contenido |
| `voz-hierro-mover-1.ogg` | Avanzamos. | Pesado, decidido |
| `voz-hierro-mover-2.ogg` | En marcha. | Firme |
| `voz-hierro-mover-3.ogg` | Columna en movimiento. | Disciplinado |
| `voz-hierro-mover-4.ogg` | Nada nos detiene. | Orgulloso, sin gritar |
| `voz-hierro-atacar-1.ogg` | Fuego a discreción. | Intenso |
| `voz-hierro-atacar-2.ogg` | Golpe en camino. | Duro |
| `voz-hierro-atacar-3.ogg` | Por el Frente. | Orgulloso |
| `voz-hierro-atacar-4.ogg` | Objetivo a la vista. | Concentrado |
| `voz-hierro-constructor-1.ogg` | Listo para levantar la obra. | Trabajador |
| `voz-hierro-constructor-2.ogg` | Cimientos en camino. | Firme |
| `voz-hierro-recolector-1.ogg` | Camión minero en ruta. | Grave, tranquilo |
| `voz-hierro-recolector-2.ogg` | Carga completa. | Satisfecho, breve |

### 095 · Voz de rebelde · Red Guerrillera
Archivos: `public/juego/audio/voz-guerrilla-<línea>.ogg` · mono · nombre de la voz: «FA Guerrilla rebelde»

Voz joven, baja y rápida, casi en susurro, alerta, como por una radio vieja.
```
Synthetic voice design for an original strategy game character. Young adult member of an improvised guerrilla network, female or male, age around 25 to 35. Speaks neutral Latin American Spanish with clear diction and no regional accent. Low, quick and alert, half-whispered as if hiding, quietly determined, slightly rough and breathy texture. Medium-low pitch, fast pace, very short phrases. Clean, dry and very close to the microphone, suitable for an old handheld radio effect added later, no background noise. Not based on any real person or existing character.
```

| Archivo | Texto (copie tal cual) | Tono |
|---|---|---|
| `voz-guerrilla-seleccion-1.ogg` | Aquí la Red. | Bajo, alerta |
| `voz-guerrilla-seleccion-2.ogg` | Listos y ocultos. | Susurrado |
| `voz-guerrilla-seleccion-3.ogg` | ¿Cuál es el plan, comandante? | Atento, en voz baja |
| `voz-guerrilla-seleccion-4.ogg` | Atentos. | Breve, tenso |
| `voz-guerrilla-mover-1.ogg` | Nos movemos. | Rápido |
| `voz-guerrilla-mover-2.ogg` | Por la sombra. | Susurrado |
| `voz-guerrilla-mover-3.ogg` | Sin dejar rastro. | Sigiloso |
| `voz-guerrilla-mover-4.ogg` | Entendido, vamos. | Ágil |
| `voz-guerrilla-atacar-1.ogg` | Emboscada lista. | Tenso, contenido |
| `voz-guerrilla-atacar-2.ogg` | Ahora, todos. | Intenso, sin gritar |
| `voz-guerrilla-atacar-3.ogg` | Golpe rápido. | Decidido |
| `voz-guerrilla-atacar-4.ogg` | Por la Red. | Orgulloso, bajo |
| `voz-guerrilla-constructor-1.ogg` | Manos a la obra. | Dispuesto |
| `voz-guerrilla-constructor-2.ogg` | Lo levantamos con lo que hay. | Ingenioso |
| `voz-guerrilla-recolector-1.ogg` | A recoger. | Breve |
| `voz-guerrilla-recolector-2.ogg` | Sacos llenos. | Satisfecho |

### 096 · Voz del héroe · Comando Atlas
Archivos: `public/juego/audio/voz-heroe-atlas-<línea>.ogg` · mono · nombre de la voz: «FA Comando Atlas»

Francotirador de élite: voz tranquila, fría y segura.
```
Synthetic voice design for an original strategy game hero. Elite sniper commando of a high-tech coalition, adult, age around 35 to 45. Speaks neutral Latin American Spanish with clear diction and no regional accent. Very calm, cold, controlled and quietly confident, every word measured, almost a murmur with perfect clarity. Medium-low pitch, slow pace, short phrases. Clean studio quality, intimate and close, no radio filter, no background noise. Not based on any real person or existing character.
```

| Archivo | Texto (copie tal cual) | Tono |
|---|---|---|
| `voz-heroe-atlas-seleccion-1.ogg` | Comando Atlas en posición. | Calmo, seguro |
| `voz-heroe-atlas-seleccion-2.ogg` | Tengo el campo a la vista. | Frío |
| `voz-heroe-atlas-mover-1.ogg` | Cambio de posición. | Medido |
| `voz-heroe-atlas-atacar-1.ogg` | Tengo el blanco. | Concentrado |
| `voz-heroe-atlas-atacar-2.ogg` | Un disparo basta. | Seguro, sereno |

### 097 · Voz del héroe · Mariscal de Hierro
Archivos: `public/juego/audio/voz-heroe-hierro-<línea>.ogg` · mono · nombre de la voz: «FA Mariscal de Hierro»

Líder veterano: voz muy grave, autoritaria y resonante.
```
Synthetic voice design for an original strategy game hero. Veteran marshal leading a heavy armored army, male, age around 55 to 65. Speaks neutral Latin American Spanish with clear diction and no regional accent. Very deep, resonant, authoritative and inspiring, commanding without shouting, with a slight gravel of age. Low pitch, slow and weighty pace, short phrases. Clean studio quality with natural chest resonance, no radio filter, no background noise. Not based on any real person or existing character.
```

| Archivo | Texto (copie tal cual) | Tono |
|---|---|---|
| `voz-heroe-hierro-seleccion-1.ogg` | El Mariscal toma el mando. | Autoritario |
| `voz-heroe-hierro-seleccion-2.ogg` | Firmes, soldados. | Inspirador |
| `voz-heroe-hierro-mover-1.ogg` | Avancen conmigo. | Firme, resonante |
| `voz-heroe-hierro-atacar-1.ogg` | Ningún muro resiste. | Orgulloso |
| `voz-heroe-hierro-atacar-2.ogg` | Golpeen con todo. | Intenso, sin gritar |

### 098 · Voz del héroe · Jefe rebelde
Archivos: `public/juego/audio/voz-heroe-guerrilla-<línea>.ogg` · mono · nombre de la voz: «FA Jefe rebelde»

Líder carismático y astuto: voz media, segura, con ironía leve.
```
Synthetic voice design for an original strategy game hero. Charismatic and cunning leader of an improvised guerrilla network, adult, age around 40 to 50. Speaks neutral Latin American Spanish with clear diction and no regional accent. Confident, sly and composed, with a faint hint of irony and a warm, slightly husky texture, speaking low as if sharing a secret. Medium pitch, relaxed but sharp pace, short phrases. Clean studio quality, close and dry, no radio filter, no background noise. Not based on any real person or existing character.
```

| Archivo | Texto (copie tal cual) | Tono |
|---|---|---|
| `voz-heroe-guerrilla-seleccion-1.ogg` | La Red no olvida. | Seguro, bajo |
| `voz-heroe-guerrilla-seleccion-2.ogg` | Siempre un paso adelante. | Astuto |
| `voz-heroe-guerrilla-mover-1.ogg` | Nadie nos verá llegar. | Sigiloso, irónico |
| `voz-heroe-guerrilla-atacar-1.ogg` | Nos verán cuando sea tarde. | Confiado |
| `voz-heroe-guerrilla-capturar-1.ogg` | Ese pozo será nuestro. | Decidido |

## 8. Voces del anunciador

Un solo anunciador para las tres facciones: es la voz del sistema de mando, neutra, para que no compita con las voces de facción. Mismo procedimiento que en la sección 7, sin filtro de radio.

### 099 · Voz del anunciador
Archivos: `public/juego/audio/anuncio-<línea>.ogg` · mono · nombre de la voz: «FA Anunciador»

Voz de sistema militar: neutra, clara, serena y sin emoción marcada.
```
Synthetic voice design for the announcer of an original strategy game. Military command system voice, gender-neutral to slightly female, adult. Speaks neutral Latin American Spanish with perfect clear diction and no regional accent. Calm, neutral, authoritative and informative, like a tactical computer reading status reports, minimal emotion. Medium pitch, even pace, short phrases. Very clean studio quality with a subtle digital polish, no background noise. Not based on any real person or existing character.
```

| Archivo | Texto (copie tal cual) | Uso en el juego | Tono |
|---|---|---|---|
| `anuncio-construccion.ogg` | Construcción terminada. | Edificio terminado (`built`) | Neutro |
| `anuncio-unidad.ogg` | Unidad lista. | Unidad producida (`spawn`) | Neutro |
| `anuncio-mejora.ogg` | Mejora completada. | Tecnología investigada | Neutro, leve satisfacción |
| `anuncio-ataque.ogg` | Atención: la base está bajo ataque. | Edificio propio atacado | Urgente, controlado |
| `anuncio-unidad-perdida.ogg` | Unidad perdida. | Muerte de unidad propia | Sobrio |
| `anuncio-energia.ogg` | Energía insuficiente. | Aviso de energía | Advertencia |
| `anuncio-creditos.ogg` | Créditos insuficientes. | Aviso de créditos | Advertencia |
| `anuncio-seleccion.ogg` | Seleccione unidades primero. | Orden sin selección | Neutro |
| `anuncio-pozo-capturado.ogg` | Pozo petrolero capturado. | Captura propia de pozo | Positivo |
| `anuncio-pozo-perdido.ogg` | Se perdió un pozo petrolero. | Pozo capturado por el enemigo | Advertencia |
| `anuncio-edificio-capturado.ogg` | Edificio capturado. | Captura propia de edificio | Positivo |
| `anuncio-rango.ogg` | Ascenso de rango. Punto de comandante disponible. | Subida de rango (`rankUp`) | Positivo, solemne |
| `anuncio-superarma-lista.ogg` | Superarma lista. | Carga completa | Solemne |
| `anuncio-superarma-enemiga.ogg` | Alerta: superarma enemiga en uso. | Disparo enemigo (`superFire`) | Urgente, controlado |
| `anuncio-poder-enemigo.ogg` | Alerta: el enemigo usó un poder. | Poder enemigo (`power`) | Advertencia |
| `anuncio-heroe-caido.ogg` | Nuestro héroe ha caído. | Héroe propio abatido (`heroDown`) | Sobrio |
| `anuncio-heroe-enemigo.ogg` | Héroe enemigo abatido. | Héroe enemigo abatido | Positivo, contenido |
| `anuncio-chatarra.ogg` | Chatarra recuperada. | Recolección de chatarra (`crate`) | Neutro |
| `anuncio-transmision.ogg` | Transmisión entrante. | Mensaje de misión | Neutro |
| `anuncio-objetivo.ogg` | Objetivo cumplido. | Objetivo de misión (`obj`) | Positivo |
| `anuncio-nuevo-objetivo.ogg` | Nuevo objetivo disponible. | Objetivo agregado | Neutro |
| `anuncio-mision-cumplida.ogg` | Misión cumplida. | Fin de misión con victoria | Positivo, solemne |
| `anuncio-mision-fallida.ogg` | Misión fallida. | Fin de misión con derrota | Sobrio |
| `anuncio-victoria.ogg` | Victoria. | Fin de partida ganada | Positivo, solemne |
| `anuncio-derrota.ogg` | Derrota. | Fin de partida perdida | Sobrio |
| `anuncio-rendicion.ogg` | El rival se ha rendido. | Rendición en línea | Neutro |
| `anuncio-reconexion.ogg` | Conexión restablecida. | Reconexión en línea | Neutro |

## 9. Normalización, recorte y conversión

| Tipo | Números | Sonoridad objetivo | Pico máximo | Recorte y bordes |
|---|---|---|---|---|
| Armas y explosiones | 001–033 | −14 a −12 LUFS a corto plazo (máximo de la ventana de 3 s) | −1 dBTP | Inicio en el transitorio (menos de 5 ms de silencio); fundido final de 20 a 50 ms; silencio final recortado por debajo de −60 dBFS. |
| Superarmas | 034–039 | −14 a −12 LUFS a corto plazo | −1 dBTP | Igual que las armas; conserve la cola completa de cada fase. |
| Interfaz | 040–075 | −16 a −14 LUFS a corto plazo | −1 dBTP | Inicio inmediato; fundido final de 10 a 30 ms. Un poco por debajo de las armas, porque se repite mucho. |
| Música | 076–088 | −16 LUFS integrados | −1 dBTP | Bucles sin silencio ni clic (ver abajo). Stingers: cola natural y fundido final de 300 ms. |
| Ambiente | 089–092 | −20 LUFS integrados | −1 dBTP | Bucles sin clic, fundido cruzado de 2 s. Por debajo de la música para no competir con ella. |
| Voces | 093–099 | −16 LUFS integrados | −1 dBTP | 20 ms de silencio antes de la voz y 50 ms después; sin respiraciones al inicio ni al final. |

Reglas generales:

- Trabaje en WAV de 24 bits y convierta a OGG al final. No normalice dos veces un archivo ya comprimido.
- Efectos de armas, explosiones, interfaz y voces en mono. Si la herramienta entrega estéreo, mezcle a mono y revise que no se cancelen frecuencias. Superarmas, victoria, derrota, música y ambiente en estéreo.
- Elimine el ruido de fondo y los artefactos de la generación antes de normalizar.
- La medida LUFS de archivos de menos de 3 s es poco fiable. Mídalos con un medidor de corto plazo (Audacity, Reaper o el filtro `ebur128`) y ajuste con `volume` si quedan fuera del rango.
- Escuche cada bucle repetido al menos tres veces seguidas antes de aprobarlo.
- Verifique los niveles a volumen bajo (40 a 45 %, el valor por defecto de Opciones): los disparos no deben tapar las voces ni las alertas.

### Bucles sin clic

| Tipo | Método |
|---|---|
| Música | Recorte un número exacto de compases desde un tiempo fuerte (duración de la tabla de la sección 5) **más** 2 a 4 s de cola. Luego sume esa cola sobre el inicio. El bucle conserva la duración exacta y la reverberación del último compás continúa al volver al principio. |
| Ambiente | Una los dos tramos de 30 s con fundido cruzado y después haga el fundido cruzado del final con el inicio (2 s, curva de igual potencia). |
| Comprobación | El primer y el último cuadro deben estar cerca de cero. Escuche el punto de unión con auriculares. |

### Comandos de referencia con ffmpeg

Ejecute los comandos desde la raíz del proyecto. Requieren ffmpeg 5 o superior.

```bash
# Medir sonoridad (integrada, corto plazo y pico real) de un archivo
ffmpeg -hide_banner -i entrada.wav -af ebur128=peak=true -f null -

# Efecto corto (armas, explosiones, superarmas): recorta silencios, fundido final de 30 ms, normaliza a -13 LUFS y -1 dBTP, mono, OGG q5
ffmpeg -i entrada.wav -af "silenceremove=start_periods=1:start_threshold=-60dB,areverse,silenceremove=start_periods=1:start_threshold=-60dB,afade=t=in:d=0.03,areverse,loudnorm=I=-13:TP=-1:LRA=11" -ar 44100 -ac 1 -c:a libvorbis -q:a 5 public/juego/audio/rifle-atlas.ogg

# Interfaz: igual que el efecto corto, a -15 LUFS
ffmpeg -i entrada.wav -af "silenceremove=start_periods=1:start_threshold=-60dB,areverse,silenceremove=start_periods=1:start_threshold=-60dB,afade=t=in:d=0.02,areverse,loudnorm=I=-15:TP=-1:LRA=11" -ar 44100 -ac 1 -c:a libvorbis -q:a 5 public/juego/audio/click-atlas.ogg

# Música en bucle: toma 24 compases (75,789 s) desde el segundo 32 más 3 s de cola y suma la cola al inicio
ffmpeg -ss 32 -t 78.789 -i suno.wav -filter_complex "[0]atrim=0:75.789,asetpts=PTS-STARTPTS[cuerpo];[0]atrim=start=75.789,asetpts=PTS-STARTPTS[cola];[cuerpo][cola]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1:LRA=11" -ar 44100 -ac 2 -c:a libvorbis -q:a 5 public/juego/audio/musica-calma-atlas.ogg

# Ambiente en bucle: fundido cruzado de 2 s del final con el inicio, -20 LUFS, estéreo
ffmpeg -i ambiente-62s.wav -filter_complex "[0]atrim=0:2,asetpts=PTS-STARTPTS[ini];[0]atrim=start=2,asetpts=PTS-STARTPTS[resto];[resto][ini]acrossfade=d=2:c1=qsin:c2=qsin,loudnorm=I=-20:TP=-1:LRA=11" -ar 44100 -ac 2 -c:a libvorbis -q:a 5 public/juego/audio/amb-dia.ogg

# Voz Atlas: filtro de facción, 20 ms de silencio inicial, -16 LUFS, mono
ffmpeg -i entrada.wav -af "silenceremove=start_periods=1:start_threshold=-55dB,highpass=f=250,lowpass=f=6500,acompressor=threshold=0.125:ratio=3:attack=5:release=80,adelay=20,apad=pad_dur=0.05,loudnorm=I=-16:TP=-1:LRA=7" -ar 44100 -ac 1 -c:a libvorbis -q:a 5 public/juego/audio/voz-atlas-seleccion-1.ogg
```

Conversión por lotes en PowerShell (efectos ya editados en `crudos\efectos\`, con el nombre final y extensión `.wav`):

```powershell
Get-ChildItem .\crudos\efectos\*.wav | ForEach-Object {
  ffmpeg -y -i $_.FullName -af "loudnorm=I=-13:TP=-1:LRA=11" -ar 44100 -ac 1 -c:a libvorbis -q:a 5 ("public\juego\audio\" + $_.BaseName + ".ogg")
}
node pruebas/generar-audio.js
```

La sonoridad final depende de la cadena completa. Ajuste los valores de `loudnorm` si la medida con `ebur128` queda fuera del rango de la tabla.

## Lista de control

Marque cada archivo cuando esté generado, normalizado, convertido a OGG y guardado con el nombre exacto.

### Armas
- [ ] 001 `rifle-atlas.ogg`
- [ ] 002 `rifle-hierro.ogg`
- [ ] 003 `rifle-guerrilla.ogg`
- [ ] 004 `aa-atlas.ogg`
- [ ] 005 `aa-hierro.ogg`
- [ ] 006 `aa-guerrilla.ogg`
- [ ] 007 `canon-atlas.ogg`
- [ ] 008 `canon-hierro.ogg` (y copia como `canon.ogg`)
- [ ] 009 `torre-atlas.ogg`
- [ ] 010 `torre-hierro.ogg`
- [ ] 011 `torre-guerrilla.ogg`
- [ ] 012 `obus-guerrilla.ogg` (y copia como `obus.ogg`)
- [ ] 013 `misil-atlas.ogg` (y copia como `misil.ogg`)
- [ ] 014 `cohete-hierro.ogg` (y copia como `cohete.ogg`)
- [ ] 015 `heroe-atlas.ogg`
- [ ] 016 `heroe-hierro.ogg`
- [ ] 017 `heroe-guerrilla.ogg`
- [ ] 018 `ametralla-atlas.ogg`
- [ ] 019 `ametralla-hierro.ogg`
- [ ] 020 `ametralla-guerrilla.ogg`
- [ ] 021 `canonaval-atlas.ogg`
- [ ] 022 `canonaval-hierro.ogg`
- [ ] 023 `canonaval.ogg`
- [ ] 024 `antitanque-atlas.ogg`
- [ ] 025 `antitanque-hierro.ogg`
- [ ] 026 `antitanque-guerrilla.ogg`
- [ ] 027 `minigun-hierro.ogg`
- [ ] 028 `misilsam-atlas.ogg`

### Explosiones y superarmas
- [ ] 029 `boom.ogg`
- [ ] 030 `big.ogg`
- [ ] 031 `edificio.ogg`
- [ ] 032 `caida.ogg`
- [ ] 033 `hundimiento.ogg`
- [ ] 034 `super-particulas-carga.ogg`
- [ ] 035 `super-particulas-impacto.ogg`
- [ ] 036 `super-nuclear-lanzamiento.ogg`
- [ ] 037 `super-nuclear-impacto.ogg`
- [ ] 038 `super-cohetes-lanzamiento.ogg`
- [ ] 039 `super-cohetes-impacto.ogg`

### Interfaz
| Clave | Atlas | Hierro | Guerrilla |
|---|---|---|---|
| `click` | [ ] 040 | [ ] 052 | [ ] 064 |
| `ack` | [ ] 041 | [ ] 053 | [ ] 065 |
| `ready` | [ ] 042 | [ ] 054 | [ ] 066 |
| `place` | [ ] 043 | [ ] 055 | [ ] 067 |
| `chime` | [ ] 044 | [ ] 056 | [ ] 068 |
| `alert` | [ ] 045 | [ ] 057 | [ ] 069 |
| `capture` | [ ] 046 | [ ] 058 | [ ] 070 |
| `rank` | [ ] 047 | [ ] 059 | [ ] 071 |
| `obj` | [ ] 048 | [ ] 060 | [ ] 072 |
| `radio` | [ ] 049 | [ ] 061 | [ ] 073 |
| `win` | [ ] 050 | [ ] 062 | [ ] 074 |
| `lose` | [ ] 051 | [ ] 063 | [ ] 075 |

### Música
- [ ] 076 `musica-menu.ogg`
- [ ] 077 `musica-calma-atlas.ogg`
- [ ] 078 `musica-combate-atlas.ogg`
- [ ] 079 `musica-victoria-atlas.ogg`
- [ ] 080 `musica-derrota-atlas.ogg`
- [ ] 081 `musica-calma-hierro.ogg`
- [ ] 082 `musica-combate-hierro.ogg`
- [ ] 083 `musica-victoria-hierro.ogg`
- [ ] 084 `musica-derrota-hierro.ogg`
- [ ] 085 `musica-calma-guerrilla.ogg`
- [ ] 086 `musica-combate-guerrilla.ogg`
- [ ] 087 `musica-victoria-guerrilla.ogg`
- [ ] 088 `musica-derrota-guerrilla.ogg`
- [ ] Prueba de transición: calma → combate → calma en cada facción, sin salto de tonalidad ni de pulso.

### Ambiente
- [ ] 089 `amb-dia.ogg`
- [ ] 090 `amb-atardecer.ogg`
- [ ] 091 `amb-noche.ogg`
- [ ] 092 `amb-batalla-lejana.ogg`

### Voces
- [ ] 093 «FA Atlas soldado»: 16 líneas `voz-atlas-*.ogg`
- [ ] 094 «FA Hierro soldado»: 16 líneas `voz-hierro-*.ogg`
- [ ] 095 «FA Guerrilla rebelde»: 16 líneas `voz-guerrilla-*.ogg`
- [ ] 096 «FA Comando Atlas»: 5 líneas `voz-heroe-atlas-*.ogg`
- [ ] 097 «FA Mariscal de Hierro»: 5 líneas `voz-heroe-hierro-*.ogg`
- [ ] 098 «FA Jefe rebelde»: 5 líneas `voz-heroe-guerrilla-*.ogg`
- [ ] 099 «FA Anunciador»: 27 líneas `anuncio-*.ogg`

### Cierre
- [ ] Todos los archivos en `public/juego/audio/`, en OGG Vorbis q5, con el nombre exacto.
- [ ] Copias genéricas creadas: `canon.ogg`, `obus.ogg`, `misil.ogg`, `cohete.ogg`.
- [ ] WAV provisionales del estudio reemplazados o eliminados.
- [ ] Niveles verificados con `ebur128` y a volumen bajo en el juego.
- [ ] `node pruebas/generar-audio.js` ejecutado; `public/juego/audio/audio.json` actualizado.
- [ ] Prueba en partida con las tres facciones: armas, interfaz, superarmas y cambio de música.

## Voces de las unidades

Las unidades propias hablan al seleccionarlas, al recibir una orden y al salir de producción (opción «Voces de las unidades» en Opciones). Sin archivos, el juego usa la voz en español del sistema operativo entre dos chasquidos de radio. Con archivos, los reproduce por un filtro de radio de campaña.

| Regla | Detalle |
|---|---|
| Nombre | `voz-<facción>-<categoría>-<evento>-<n>.mp3` (por ejemplo `voz-hierro-infanteria-seleccion-1.mp3`) o, para todas las categorías, `voz-<facción>-<evento>-<n>.mp3` |
| Categorías | infanteria, vehiculo, aereo, naval, constructor, recolector, heroe |
| Eventos | seleccion, mover, atacar, listo, construir |
| Variantes | `-1`, `-2`, `-3`…: el juego elige una al azar |
| Formato | MP3 u OGG mono, 44,1 kHz, sin silencio al inicio ni al final, voz seca (el juego agrega el efecto de radio) |
| Registro | Ejecute `node pruebas/generar-audio.js` después de agregar archivos |
| Herramienta | Texto a voz (ElevenLabs u otra) con la dirección de voz de cada facción; o grabación propia |

Las frases son las mismas que usa la voz del sistema (`FRASES` en `public/juego/sonido.js`). Si cambia una frase allí, actualice esta tabla.

### Voces · Coalición Atlas

Dirección de voz (péguela como descripción de la voz o como instrucción de estilo):

```
Voz masculina adulta, español latinoamericano neutro, tono sereno y técnico de operador militar profesional; frases cortas, dicción limpia, sin emoción exagerada. Grabación seca, sin música ni efectos.
```

| Archivo | Evento | Texto |
|---|---|---|
| `voz-atlas-infanteria-seleccion-1.mp3` | Al seleccionar · infanteria | Unidad en línea. |
| `voz-atlas-infanteria-seleccion-2.mp3` | Al seleccionar · infanteria | Le escucho, comandante. |
| `voz-atlas-infanteria-seleccion-3.mp3` | Al seleccionar · infanteria | Escuadra lista. |
| `voz-atlas-infanteria-seleccion-4.mp3` | Al seleccionar · infanteria | Esperando instrucciones. |
| `voz-atlas-vehiculo-seleccion-1.mp3` | Al seleccionar · vehiculo | Sistemas en verde. |
| `voz-atlas-vehiculo-seleccion-2.mp3` | Al seleccionar · vehiculo | Blindado listo. |
| `voz-atlas-vehiculo-seleccion-3.mp3` | Al seleccionar · vehiculo | Tripulación a la escucha. |
| `voz-atlas-aereo-seleccion-1.mp3` | Al seleccionar · aereo | Piloto en espera. |
| `voz-atlas-aereo-seleccion-2.mp3` | Al seleccionar · aereo | Cabina lista. |
| `voz-atlas-naval-seleccion-1.mp3` | Al seleccionar · naval | Puente a la escucha. |
| `voz-atlas-naval-seleccion-2.mp3` | Al seleccionar · naval | Navío listo. |
| `voz-atlas-constructor-seleccion-1.mp3` | Al seleccionar · constructor | Ingeniería en línea. |
| `voz-atlas-constructor-seleccion-2.mp3` | Al seleccionar · constructor | Plataforma lista. |
| `voz-atlas-recolector-seleccion-1.mp3` | Al seleccionar · recolector | Carga en espera. |
| `voz-atlas-recolector-seleccion-2.mp3` | Al seleccionar · recolector | Rotores listos. |
| `voz-atlas-heroe-seleccion-1.mp3` | Al seleccionar · heroe | Comando a la escucha. |
| `voz-atlas-heroe-seleccion-2.mp3` | Al seleccionar · heroe | Aquí el comandante de operaciones. |
| `voz-atlas-mover-1.mp3` | Orden de movimiento | Recibido. |
| `voz-atlas-mover-2.mp3` | Orden de movimiento | En ruta. |
| `voz-atlas-mover-3.mp3` | Orden de movimiento | Coordenadas fijadas. |
| `voz-atlas-mover-4.mp3` | Orden de movimiento | Afirmativo. |
| `voz-atlas-mover-5.mp3` | Orden de movimiento | Nos movemos. |
| `voz-atlas-aereo-mover-1.mp3` | Orden de movimiento · aereo | Rumbo fijado. |
| `voz-atlas-aereo-mover-2.mp3` | Orden de movimiento · aereo | En vuelo. |
| `voz-atlas-naval-mover-1.mp3` | Orden de movimiento · naval | Rumbo fijado. |
| `voz-atlas-naval-mover-2.mp3` | Orden de movimiento · naval | Avante. |
| `voz-atlas-recolector-mover-1.mp3` | Orden de movimiento · recolector | Ruta de carga confirmada. |
| `voz-atlas-atacar-1.mp3` | Orden de ataque | Objetivo fijado. |
| `voz-atlas-atacar-2.mp3` | Orden de ataque | Abriendo fuego. |
| `voz-atlas-atacar-3.mp3` | Orden de ataque | Blanco confirmado. |
| `voz-atlas-atacar-4.mp3` | Orden de ataque | Enganchando. |
| `voz-atlas-aereo-atacar-1.mp3` | Orden de ataque · aereo | Iniciando pasada de ataque. |
| `voz-atlas-listo-1.mp3` | Unidad producida | Unidad desplegada. |
| `voz-atlas-listo-2.mp3` | Unidad producida | Lista para el servicio. |
| `voz-atlas-construir-1.mp3` | Orden de construir o reparar | Iniciando construcción. |
| `voz-atlas-construir-2.mp3` | Orden de construir o reparar | Montaje en curso. |

### Voces · Frente Hierro

Dirección de voz (péguela como descripción de la voz o como instrucción de estilo):

```
Voz masculina grave y firme, español neutro, tono disciplinado de soldado de un ejército estricto; enérgica en las órdenes de ataque, sin gritar. Grabación seca, sin música ni efectos.
```

| Archivo | Evento | Texto |
|---|---|---|
| `voz-hierro-infanteria-seleccion-1.mp3` | Al seleccionar · infanteria | ¡Presente! |
| `voz-hierro-infanteria-seleccion-2.mp3` | Al seleccionar · infanteria | ¡A la orden! |
| `voz-hierro-infanteria-seleccion-3.mp3` | Al seleccionar · infanteria | ¡Firmes, comandante! |
| `voz-hierro-infanteria-seleccion-4.mp3` | Al seleccionar · infanteria | ¿Órdenes? |
| `voz-hierro-vehiculo-seleccion-1.mp3` | Al seleccionar · vehiculo | Blindado listo. |
| `voz-hierro-vehiculo-seleccion-2.mp3` | Al seleccionar · vehiculo | Tripulación en sus puestos. |
| `voz-hierro-vehiculo-seleccion-3.mp3` | Al seleccionar · vehiculo | El acero responde. |
| `voz-hierro-aereo-seleccion-1.mp3` | Al seleccionar · aereo | Rotores en marcha. |
| `voz-hierro-aereo-seleccion-2.mp3` | Al seleccionar · aereo | Helicóptero en espera. |
| `voz-hierro-naval-seleccion-1.mp3` | Al seleccionar · naval | Monitor listo. |
| `voz-hierro-naval-seleccion-2.mp3` | Al seleccionar · naval | Cubierta en orden. |
| `voz-hierro-constructor-seleccion-1.mp3` | Al seleccionar · constructor | Brigada de obras lista. |
| `voz-hierro-recolector-seleccion-1.mp3` | Al seleccionar · recolector | Camión listo para la mina. |
| `voz-hierro-heroe-seleccion-1.mp3` | Al seleccionar · heroe | El mariscal escucha. |
| `voz-hierro-heroe-seleccion-2.mp3` | Al seleccionar · heroe | Hable, comandante. |
| `voz-hierro-mover-1.mp3` | Orden de movimiento | ¡Entendido! |
| `voz-hierro-mover-2.mp3` | Orden de movimiento | ¡En marcha! |
| `voz-hierro-mover-3.mp3` | Orden de movimiento | ¡Avanzamos! |
| `voz-hierro-mover-4.mp3` | Orden de movimiento | Orden recibida. |
| `voz-hierro-mover-5.mp3` | Orden de movimiento | ¡Sin retroceder! |
| `voz-hierro-atacar-1.mp3` | Orden de ataque | ¡Fuego! |
| `voz-hierro-atacar-2.mp3` | Orden de ataque | ¡Al ataque! |
| `voz-hierro-atacar-3.mp3` | Orden de ataque | ¡Por el Frente! |
| `voz-hierro-atacar-4.mp3` | Orden de ataque | ¡Aplástenlos! |
| `voz-hierro-listo-1.mp3` | Unidad producida | Unidad formada. |
| `voz-hierro-listo-2.mp3` | Unidad producida | Lista para el frente. |
| `voz-hierro-construir-1.mp3` | Orden de construir o reparar | Levantando la obra. |
| `voz-hierro-construir-2.mp3` | Orden de construir o reparar | A construir. |

### Voces · Red Guerrillera

Dirección de voz (péguela como descripción de la voz o como instrucción de estilo):

```
Voz masculina adulta algo ronca, español latinoamericano, tono cercano y decidido de combatiente irregular; natural, sin caricatura ni acento exagerado. Grabación seca, sin música ni efectos.
```

| Archivo | Evento | Texto |
|---|---|---|
| `voz-guerrilla-infanteria-seleccion-1.mp3` | Al seleccionar · infanteria | Aquí estamos. |
| `voz-guerrilla-infanteria-seleccion-2.mp3` | Al seleccionar · infanteria | Diga, comandante. |
| `voz-guerrilla-infanteria-seleccion-3.mp3` | Al seleccionar · infanteria | Listos. |
| `voz-guerrilla-infanteria-seleccion-4.mp3` | Al seleccionar · infanteria | ¿Qué se ofrece? |
| `voz-guerrilla-vehiculo-seleccion-1.mp3` | Al seleccionar · vehiculo | El motor aguanta. |
| `voz-guerrilla-vehiculo-seleccion-2.mp3` | Al seleccionar · vehiculo | Técnica lista. |
| `voz-guerrilla-aereo-seleccion-1.mp3` | Al seleccionar · aereo | Listos en el aire. |
| `voz-guerrilla-naval-seleccion-1.mp3` | Al seleccionar · naval | Lancha lista. |
| `voz-guerrilla-constructor-seleccion-1.mp3` | Al seleccionar · constructor | Manos a la obra. |
| `voz-guerrilla-recolector-seleccion-1.mp3` | Al seleccionar · recolector | Listos para cargar. |
| `voz-guerrilla-heroe-seleccion-1.mp3` | Al seleccionar · heroe | El comandante escucha. |
| `voz-guerrilla-heroe-seleccion-2.mp3` | Al seleccionar · heroe | Hable. |
| `voz-guerrilla-mover-1.mp3` | Orden de movimiento | Vamos. |
| `voz-guerrilla-mover-2.mp3` | Orden de movimiento | Andando. |
| `voz-guerrilla-mover-3.mp3` | Orden de movimiento | Entendido. |
| `voz-guerrilla-mover-4.mp3` | Orden de movimiento | Por el monte. |
| `voz-guerrilla-mover-5.mp3` | Orden de movimiento | Nos movemos. |
| `voz-guerrilla-atacar-1.mp3` | Orden de ataque | ¡Fuego! |
| `voz-guerrilla-atacar-2.mp3` | Orden de ataque | ¡Duro con ellos! |
| `voz-guerrilla-atacar-3.mp3` | Orden de ataque | ¡Emboscada! |
| `voz-guerrilla-atacar-4.mp3` | Orden de ataque | ¡Vamos por ellos! |
| `voz-guerrilla-listo-1.mp3` | Unidad producida | Listos para pelear. |
| `voz-guerrilla-listo-2.mp3` | Unidad producida | Gente nueva en el campamento. |
| `voz-guerrilla-construir-1.mp3` | Orden de construir o reparar | A levantar el campamento. |
| `voz-guerrilla-construir-2.mp3` | Orden de construir o reparar | Manos a la obra. |
