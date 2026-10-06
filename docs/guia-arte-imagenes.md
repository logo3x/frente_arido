# Guía de arte e imágenes · Frente Árido

Guía para crear las imágenes 2D del juego con ChatGPT (generador de imágenes) o Gemini, con un estándar visual común. Los modelos 3D del juego se generan por código; esta guía cubre ilustraciones, íconos y retratos.

**Para generar, use el catálogo `docs/prompts-imagenes.md`:** tiene un prompt completo, listo para pegar, por cada una de las 167 imágenes. Esta guía explica las reglas y el estilo.

## 1. Reglas que no cambian

| Regla | Motivo |
|---|---|
| Diseño original: no mencionar juegos, estudios ni franquicias comerciales en los prompts | Regla del proyecto (CLAUDE.md) y derechos de autor |
| Sin insignias, banderas ni uniformes de ejércitos o países reales | Las facciones son ficticias |
| Sin texto dentro de la imagen (salvo el logotipo, que se rehace a mano) | Los modelos escriben mal; los textos van en HTML |
| Sin sangre ni violencia explícita | Proyecto académico con estudiantes |
| Revisar los términos de uso de la herramienta antes de publicar | ChatGPT y Gemini permiten el uso, pero las condiciones cambian |

## 2. Identidad visual

### Paleta (colores del juego)

| Uso | Color |
|---|---|
| Fondo de interfaz | `#1d2220` |
| Paneles | `#232c2e` |
| Texto claro | `#ece5d1` |
| Ámbar (acento principal) | `#e8a33d` |
| Arena clara / oscura | `#c6ae80` / `#a58c60` |
| Mineral (recurso) | `#d9a23a` |
| Equipo 1 (azul) / Equipo 2 (rojo) | `#2f6fd8` / `#c8452f` |

### Facciones

| Facción | Carácter | Colores | Formas y materiales |
|---|---|---|---|
| Coalición Atlas | Tecnología y aviación | Blanco hueso `#c6ced4`, gris `#58636c`, cian `#6fe3ff` | Cascos lisos y redondeados, cúpulas, vidrio, luces cian, antenas |
| Frente Hierro | Masa y blindaje | Acero `#5f5a52`, óxido `#8c5a3a`, naranja `#ff8a4a` | Concreto en talud, placas remachadas, chimeneas, franjas de peligro |
| Red Guerrillera | Emboscada y movilidad | Oliva `#7e7248`, caqui `#9a8a5c`, verde lima `#b8d057` | Camionetas adaptadas, lonas, sacos terreros, láminas corrugadas, tambores |

## 3. Bloque de estilo maestro

Copie este bloque **al inicio de todos los prompts**. Es lo que mantiene el estándar.

```
ESTILO FRENTE ÁRIDO: ilustración digital semi-realista estilizada para un videojuego de estrategia en tiempo real ambientado en un desierto ficticio. Formas limpias y legibles, siluetas claras, biseles suaves, materiales con desgaste leve (polvo, rayones, arena). Iluminación de sol bajo de tarde, cálida y lateral, sombras definidas, cielo despejado con bruma de polvo. Paleta: arena #c6ae80, ámbar #e8a33d, fondo oscuro #1d2220, texto claro #ece5d1. Sin texto, sin logotipos, sin insignias reales, sin sangre. Diseño original, no imita ningún juego existente.
```

### Bloques por facción (agregar después del maestro)

```
FACCIÓN ATLAS: vehículos y edificios de alta tecnología, cascos blanco hueso #c6ced4 y gris #58636c, cúpulas, vidrio, luces y sensores cian #6fe3ff, líneas aerodinámicas, aspecto limpio y avanzado.
```
```
FACCIÓN HIERRO: blindaje pesado, acero oscuro #5f5a52 con acentos de óxido #8c5a3a y naranja #ff8a4a, concreto en talud, placas remachadas, chimeneas con humo, franjas de peligro amarillas y negras, aspecto industrial y masivo.
```
```
FACCIÓN GUERRILLA: equipo improvisado, camionetas civiles adaptadas, lonas y redes de camuflaje oliva #7e7248 y caqui #9a8a5c, sacos terreros, láminas corrugadas, tambores de combustible, detalles verde lima #b8d057, aspecto recursivo y móvil.
```

## 4. Imágenes necesarias y prompts

| # | Imagen | Tamaño final | Formato | Ubicación |
|---|---|---|---|---|
| 1 | Arte principal (landing) | 1920 × 1080 | WebP | `public/img/portada.webp` |
| 2 | Retratos de facción | 800 × 1000 | WebP | `public/img/faccion-*.webp` |
| 3 | Retratos de comandantes (transmisiones) | 256 × 256 | PNG transparente | `public/juego/img/comandante-*.png` |
| 4 | Íconos de unidades y edificios (sección 4.4) | 128 × 128 | PNG transparente | `public/juego/img/icono-*.png` |
| 4b | Fichas de unidades y edificios (sección 4.4) | 1200 × 900 | WebP | `public/img/ficha-*.webp` |
| 5 | Ilustraciones de misión (12 + entrenamiento) | 1280 × 720 | WebP | `public/juego/img/mision-*.webp` |
| 6 | Pantalla de carga | 1920 × 1080 | WebP | `public/juego/img/carga.webp` |
| 7 | Imagen para redes (vista previa de enlaces) | 1200 × 630 | JPG | `public/img/og.jpg` |
| 8 | Insignias de grado (9 niveles) | 128 × 128 | PNG transparente | `public/img/grado-*.png` |

### 4.1 Arte principal

```
[ESTILO MAESTRO]
Escena panorámica de batalla en un desierto al atardecer. A la izquierda, una base de alta tecnología con cúpulas blancas y luces cian; a la derecha, una fortaleza industrial de concreto con chimeneas humeantes; en el centro, un cañón de arena con pozos petroleros. Helicópteros de carga sobrevuelan, tanques avanzan levantando polvo, explosiones lejanas. Vista aérea en tres cuartos, como la cámara de un juego de estrategia. Composición horizontal 16:9 con espacio libre a la izquierda para el título. Alto detalle, profundidad atmosférica.
```

### 4.2 Retrato de facción (uno por facción)

```
[ESTILO MAESTRO]
[BLOQUE DE LA FACCIÓN]
Ilustración vertical 4:5 que presenta a la facción: en primer plano, su vehículo más representativo (Atlas: tanque de casco en cuña con torre hexagonal; Hierro: tanque pesado de doble cañón con placas remachadas; Guerrilla: camioneta artillada con ametralladora y lonas). Al fondo, su base característica. Fondo que se oscurece hacia abajo hasta #1d2220 para poder poner texto encima.
```

### 4.3 Retrato de comandante

```
[ESTILO MAESTRO]
[BLOQUE DE LA FACCIÓN]
Retrato de busto de un comandante ficticio, mirando a cámara, iluminación lateral cálida. (Atlas: casco blanco con visor cian, uniforme gris técnico. Hierro: casco de acero de ala ancha, abrigo largo oscuro con hombreras doradas. Guerrilla: turbante caqui, bandolera, rostro curtido por el sol.) Fondo liso #232c2e, encuadre cuadrado 1:1, sin texto. Personaje adulto, expresión seria y profesional.
```

### 4.4 Unidades y edificios por facción

Las láminas de referencia ya generadas (`atlas.png`, `hierro.png`, `guerrilla.png`) definen el estilo de cada facción. Guárdelas en `docs/arte/referencias/` y **adjunte la de la facción en cada prompt**.

**Importante:** solo existen las unidades de estas tablas. Las láminas incluyen vehículos que no están en el juego (helicóptero y buggy de la Guerrilla, transporte 8×8 de Hierro, vehículo de reconocimiento de Atlas); no los use.

#### Plantilla por unidad

Copie la plantilla y reemplace `[DESCRIPCIÓN VISUAL]` con la columna de la tabla. Genere dos versiones de cada unidad:

| Versión | Uso | Formato |
|---|---|---|
| Ícono | Botones de producción y panel de selección | 1:1, fondo transparente, 128 × 128 final |
| Ficha | Enciclopedia, landing y pantalla de carga | 4:3 con fondo de desierto, 1200 × 900 final |

```
[ESTILO MAESTRO]
[BLOQUE DE LA FACCIÓN]
Mantenga exactamente el estilo, los colores, los materiales y el nivel de detalle de la lámina de referencia adjunta.
Unidad: [NOMBRE]. [DESCRIPCIÓN VISUAL].
Una franja de color de equipo azul #2f6fd8 visible en el vehículo o en las hombreras.
ÍCONO: vista isométrica en tres cuartos desde arriba, unidad centrada ocupando el 80 % del cuadro, silueta muy legible a 64 px, fondo totalmente transparente, sin sombra proyectada, sin texto, formato 1:1.
FICHA: la misma unidad en el desierto, luz de tarde, polvo en el aire, encuadre 4:3, sin texto.
```

Use solo una de las dos últimas líneas (ÍCONO o FICHA) en cada generación.

#### Coalición Atlas

| Unidad | Descripción visual |
|---|---|
| Helicóptero de carga (recolector) | Helicóptero de transporte de fuselaje alargado y liso blanco hueso, cabina de vidrio cian, rotor principal y de cola, patines, cabrestante con cable y contenedor de mineral dorado colgando |
| Plataforma de ingeniería (constructor) | Vehículo de cuatro ruedas bajo y redondeado, cabina de vidrio, brazo robótico articulado con soldador de luz cian en la punta |
| Infantería | Soldado con casco blanco redondeado y visor cian luminoso, placa pectoral gris, fusil compacto con mira cian |
| Ingeniero | Soldado con casco amarillo de obra, mochila de herramientas y llave, uniforme gris técnico |
| Comando Atlas (héroe) | Francotirador de élite con fusil largo de precisión, capa corta, visor cian, insignia dorada flotante |
| Tanque | Tanque de casco bajo en cuña, faldones laterales, torre hexagonal plana, cañón largo con freno de boca, línea de luz cian en el frontal |
| Antiaéreo | Vehículo de seis ruedas con lanzador de misiles inclinado de cuatro tubos y radar giratorio |
| Avión de ataque | Caza de ala en delta con doble deriva inclinada, cabina de vidrio, misiles bajo las alas, toberas con brillo cian |
| Lancha patrullera | Lancha rápida de casco claro tipo hidroala, cabina de vidrio, ametralladora en la proa |
| Fragata lanzamisiles | Fragata de casco claro con cúpula de radar blanca, celdas de misiles en cubierta y cañón en la proa |

| Edificio | Descripción visual |
|---|---|
| Centro de mando | Edificio blanco de compuesto con ventanales cian, cúpula de radar, helipuerto en la azotea y antena con luz roja |
| Plataforma de carga | Helipuerto circular con anillo de luces cian, silos de vidrio redondeados y módulo de control |
| Planta de energía | Reactor de fusión con cúpula blanca y anillo luminoso cian, paneles inclinados a los lados |
| Cuartel | Barracón con techo en arco blanco, portón de vidrio y ventanas cian |
| Fábrica | Gran hangar en arco con nervaduras, portón oscuro con franja de luz cian |
| Torre de defensa | Pilar estilizado con torreta esférica blanca y cañón largo |
| Aeródromo | Pista con luces, hangar en arco y torre de control con cúpula y radar |
| Astillero | Muelle con hangar en arco y grúa giratoria |
| Cañón de partículas (superarma) | Torre cónica con antena parabólica invertida y anillo de luces cian |

#### Frente Hierro

| Unidad | Descripción visual |
|---|---|
| Camión minero (recolector) | Camión de seis ruedas de acero oscuro con cabina inclinada, tolva trapezoidal llena de mineral dorado, chimenea de escape y parachoques reforzado |
| Topadora (constructor) | Topadora de orugas con pala frontal grande, cabina blindada con ventanas estrechas y chimenea |
| Infantería | Soldado con casco de acero de ala ancha, abrigo largo oscuro, máscara, fusil robusto |
| Ingeniero | Soldado con casco amarillo de obra, mochila de herramientas, abrigo de trabajo |
| Mariscal de Hierro (héroe) | Oficial corpulento con gorra de plato, hombreras doradas, abrigo largo y capa, aura de mando |
| Tanque | Tanque de casco alto en placas con glacis remachado, torre en talud, cañón grueso con freno de boca, chimeneas traseras |
| Tanque pesado | Tanque masivo de doble cañón, faldones blindados, placas superpuestas y remaches |
| Antiaéreo | Vehículo de orugas con cuatro cañones automáticos inclinados en una torre blindada |
| Helicóptero de ataque | Helicóptero en tándem de cabina doble, alas cortas con lanzacohetes, ametralladora bajo el morro, fuselaje de acero con franjas naranjas |
| Lancha | Lancha blindada con cabina de acero y ametralladora |
| Monitor fluvial | Barco de casco bajo y ancho, gran torre de cañón en la proa y chimenea |

| Edificio | Descripción visual |
|---|---|
| Centro de mando | Fortaleza de concreto con muros en talud, troneras, dos chimeneas humeantes y antena |
| Depósito minero | Tolva de concreto llena de mineral dorado, cinta transportadora inclinada y dos silos metálicos |
| Planta de energía | Dos torres de enfriamiento de perfil curvo con vapor y edificio de turbinas con franjas de peligro |
| Cuartel | Búnker de concreto en talud con portón de acero y troneras |
| Fábrica | Nave industrial con techo en diente de sierra, portón enrollable y chimeneas con humo |
| Torre de defensa | Casamata de concreto en talud con torreta blindada de cañón corto |
| Astillero | Muelle industrial con nave en talud y grúa |
| Silo nuclear (superarma) | Plataforma con compuertas abiertas en ángulo y misil de punta cónica |

#### Red Guerrillera

| Unidad | Descripción visual |
|---|---|
| Trabajador (recolector) | Trabajador civil con gorra, saco de mineral dorado a la espalda, pico al hombro y armazón de madera |
| Camión con grúa (constructor) | Camión viejo de cuatro ruedas con cabina descolorida, plataforma con cajas y herramientas y pequeña grúa de pluma |
| Rebelde (infantería) | Combatiente con turbante caqui, rostro cubierto, bandolera y fusil de cargador curvo |
| Ingeniero | Combatiente con casco amarillo de obra, mochila de herramientas y ropa civil |
| Jefe rebelde (héroe) | Líder con boina verde oscura, bandolera cruzada, capa corta y fusil |
| Técnico | Camioneta civil artillada con ametralladora en la caja, cajas de munición y lona |
| Artillería ligera | Camión de seis ruedas con rampa de cohetes múltiple inclinada |
| Antiaéreo | Camioneta con ametralladora antiaérea doble en la caja |
| Lancha rápida | Lancha civil con motor fuera de borda, lona y ametralladora improvisada |
| Fragata | Barco pesquero armado con cañón en la proa, cajas, lonas y mástil |

| Edificio | Descripción visual |
|---|---|
| Campamento (centro de mando) | Galpón con techo de lona, lámina corrugada, sacos terreros, tambores y bandera |
| Acopio de recursos | Cobertizo de lámina corrugada sobre postes de madera, sacos de mineral, cajas y rampa de madera |
| Cuartel | Tienda militar oliva a dos aguas rodeada de sacos terreros |
| Taller (fábrica) | Estructura de madera con techo de lámina, grúa improvisada y chatarra |
| Torre de vigilancia | Torre de madera de cuatro patas con plataforma de sacos terreros y ametralladora |
| Red de túneles | Entrada excavada en un montículo con marco de madera, sacos y ametralladora |
| Astillero | Muelle de madera con cobertizo de lona y tambores |
| Tormenta de cohetes (superarma) | Tres rampas de cohetes inclinadas rodeadas de sacos terreros |

#### Nombres de archivo

`icono-[unidad]-[faccion].png` y `ficha-[unidad]-[faccion].webp`, en minúsculas, sin tildes y con guiones. Ejemplos: `icono-helicoptero-carga-atlas.png`, `ficha-tanque-pesado-hierro.webp`.

### 4.5 Ilustración de misión

```
[ESTILO MAESTRO]
[BLOQUE DE LA FACCIÓN QUE JUEGA]
Ilustración de la misión «[NOMBRE DE LA MISIÓN]»: [RESUMEN DEL BRIEFING, por ejemplo «capturar dos pozos petroleros y destruir la fábrica enemiga de blindados»]. Escena cinematográfica 16:9, vista aérea en tres cuartos, la facción enemiga visible a lo lejos. Ambiente: [amanecer / mediodía con bruma / atardecer / noche con bengalas].
```

Los resúmenes de cada misión están en el campo `briefing` de `CAMPAIGNS` en `public/juego/juego.js`.

### 4.6 Pantalla de carga e imagen para redes

```
[ESTILO MAESTRO]
Vista aérea amplia de un desierto con dunas, un río serpenteante, pozos petroleros y tres bases lejanas de facciones distintas (cúpulas blancas, fortaleza industrial, campamento con lonas). Atardecer cálido, polvo en suspensión. Composición [16:9 / 1,91:1] con el centro despejado para el logotipo.
```

### 4.7 Insignias de grado

```
[ESTILO MAESTRO]
Insignia militar ficticia de grado [NÚMERO] de 9, diseño de escudo metálico ámbar #e8a33d sobre fondo transparente, [número] galones o estrellas según el nivel (1 = un galón simple; 9 = escudo con corona de laurel y tres estrellas), estilo plano con biseles suaves, sin texto, sin símbolos de ejércitos reales. Cuadrado 1:1.
```

Grados: Recluta, Soldado, Cabo, Sargento, Teniente, Capitán, Mayor, Coronel, General.

## 5. Flujo de trabajo recomendado

| Paso | Acción |
|---|---|
| 1 | **Hoja de referencia por facción.** Hecho: `atlas.png`, `hierro.png` y `guerrilla.png`. Guárdelas en `docs/arte/referencias/`. |
| 2 | **Use la lámina como imagen de referencia** en cada prompt siguiente («mantener exactamente el estilo, los colores y el nivel de detalle de la imagen adjunta»). Es la clave de la consistencia. |
| 3 | **Mantenga una sola conversación por serie** (por ejemplo, todos los íconos de Atlas en el mismo chat) para que el modelo conserve el estilo. |
| 4 | **Genere 2 a 4 variantes** y elija; pida ajustes concretos («más contraste en la silueta», «menos saturación»). |
| 5 | **Posproceso:** recorte, tamaño final, fondo transparente si aplica, exportar a WebP (calidad 80) o PNG optimizado. |
| 6 | **Nombre de archivo** en español, minúsculas y con guiones: `icono-helicoptero-carga-atlas.png`. |
| 7 | **Registre** cada imagen en `docs/registro-imagenes.md`: herramienta, fecha, prompt y ajustes. Sirve para rehacerla y como evidencia de autoría. |

### ChatGPT o Gemini

| Necesidad | Recomendación |
|---|---|
| Seguir instrucciones largas y mantener el estilo en una serie | ChatGPT (generador de imágenes): responde bien a prompts largos y a imágenes de referencia |
| Editar una imagen existente (cambiar color, quitar un objeto) conservando el resto | Gemini: destaca en edición y en mantener personajes y objetos entre imágenes |
| Fondos transparentes | ChatGPT los genera directamente; en Gemini puede ser necesario quitar el fondo después |

Se puede combinar: crear con ChatGPT y retocar con Gemini.

## 6. Lista de control antes de usar una imagen

- [ ] Se parece a la hoja de referencia de su facción (colores, formas y desgaste).
- [ ] No contiene texto, logotipos, insignias ni banderas reales.
- [ ] La silueta se entiende a 64 px (íconos).
- [ ] Tiene el tamaño y el formato de la tabla de la sección 4.
- [ ] Quedó registrada en `docs/registro-imagenes.md`.
