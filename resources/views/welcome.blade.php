@php
    $facciones = config('game.facciones');
    $arsenal = config('game.arsenal');
    $rangos = [[1, 0, 'Inicio de la partida'], [2, 2500, '+1 punto de comandante'], [3, 6000, 'Habilita la superarma'], [4, 11000, 'Habilita el héroe'], [5, 18000, '+1 punto · rango máximo']];
@endphp
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Frente Árido · Estrategia en tiempo real en el navegador</title>
<meta name="description" content="Frente Árido es un juego de estrategia en tiempo real para navegador: tres facciones, campaña de 12 misiones, escaramuzas y partidas en línea de 2 a 8 jugadores con Elo, guerra naval y editor de mapas.">
<meta name="theme-color" content="#1d2220">
<link rel="stylesheet" href="{{ asset('css/sitio.css') }}">
<link rel="preload" as="image" href="{{ asset('img/portada.webp') }}">
<x-favicons />
{{-- Vista previa al compartir el enlace --}}
<meta property="og:type" content="website">
<meta property="og:title" content="Frente Árido · Estrategia en tiempo real">
<meta property="og:description" content="Tres facciones, campaña de 12 misiones y partidas de 2 a 8 jugadores con Elo. Se juega en el navegador.">
<meta property="og:image" content="{{ asset('img/og.jpg') }}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="{{ url('/') }}">
<meta name="twitter:card" content="summary_large_image">
</head>
<body>
<a class="saltar" href="#contenido">Saltar al contenido</a>

<header class="barra">
    <div class="contenedor">
        <a class="marca" href="{{ url('/') }}">
            <x-emblema faccion="general" />
            Frente Árido <small>v{{ config('game.version') }}</small>
        </a>
        <nav aria-label="Secciones">
            <a href="#facciones">Facciones</a>
            <a href="#arsenal">Arsenal</a>
            <a href="#modos">Modos de juego</a>
            <a href="#perfil">Perfil</a>
        </nav>
        <div class="acciones">
            @auth
                <a class="btn primario" href="{{ route('dashboard') }}">Ir al panel</a>
            @else
                <a class="btn fantasma" href="{{ route('login') }}">Iniciar sesión</a>
                @if (Route::has('register'))
                    <a class="btn primario" href="{{ route('register') }}">Crear cuenta</a>
                @endif
            @endauth
        </div>
    </div>
</header>

<main id="contenido">
    <section class="portada">
        <div class="contenedor">
            <div>
                <span class="etiqueta">Estrategia en tiempo real · Navegador</span>
                <h1>Controle el <span>desierto</span>.<br>Domine el frente.</h1>
                <p class="intro">Recolecte recursos, levante su base y dirija ejércitos de tierra, aire y mar. Tres facciones con estilos de juego distintos, partidas de hasta 8 jugadores y sin instalar nada.</p>
                <div class="cta">
                    @auth
                        <a class="btn primario grande" href="{{ route('dashboard') }}">Ir al panel</a>
                        <a class="btn grande" href="{{ route('lobby.index') }}">Buscar partida</a>
                    @else
                        <a class="btn primario grande" href="{{ route('register') }}">Crear cuenta gratuita</a>
                        <a class="btn grande" href="{{ config('game.client_url') }}?modo=escaramuza">Probar sin cuenta</a>
                    @endauth
                </div>
                <p class="nota">Requiere un navegador actual con WebGL. Con cuenta se guardan la campaña, el historial y el Elo.</p>
            </div>

            <div class="tactica" aria-hidden="true">
                <svg class="mapa" viewBox="0 0 560 420" role="presentation">
                    <defs>
                        <pattern id="reticula" width="35" height="35" patternUnits="userSpaceOnUse"><path d="M35 0 H0 V35" fill="none" stroke="#2b3531" stroke-width="1"/></pattern>
                        <radialGradient id="niebla" cx="78%" cy="22%" r="45%"><stop offset="0" stop-color="#0d1110" stop-opacity=".78"/><stop offset="1" stop-color="#0d1110" stop-opacity="0"/></radialGradient>
                    </defs>
                    <rect width="560" height="420" fill="#262c25"/>
                    <rect width="560" height="420" fill="url(#reticula)"/>
                    {{-- Curvas de nivel --}}
                    <g fill="none" stroke="#3a4136" stroke-width="1.4">
                        <path d="M-10 120 C80 90 150 140 230 110 S380 60 570 95"/>
                        <path d="M-10 150 C90 125 160 170 240 140 S390 95 570 130"/>
                        <path d="M60 300 C110 260 190 270 210 310 S150 380 90 360 S20 330 60 300 Z"/>
                        <path d="M85 305 C120 285 170 290 180 315 S140 350 105 342 S65 322 85 305 Z"/>
                        <path d="M360 250 C420 220 500 240 510 290 S440 360 390 330 S320 280 360 250 Z"/>
                    </g>
                    {{-- Río --}}
                    <path d="M250 -10 C230 80 300 140 270 210 S220 330 300 430" fill="none" stroke="#24434c" stroke-width="22"/>
                    <path d="M250 -10 C230 80 300 140 270 210 S220 330 300 430" fill="none" stroke="#2e5560" stroke-width="10"/>
                    <rect x="248" y="196" width="46" height="16" fill="#5b5446"/>
                    {{-- Pozos petroleros --}}
                    <g fill="#e8a33d"><path d="M190 220 l8 -8 l8 8 l-8 8 z"/><path d="M350 175 l8 -8 l8 8 l-8 8 z"/></g>
                    {{-- Base azul (jugador 1) --}}
                    <g fill="#2f6fd8" stroke="#9cc3ff" stroke-width="1.2">
                        <rect x="56" y="318" width="44" height="44"/><rect x="110" y="330" width="30" height="30"/><rect x="62" y="270" width="28" height="28"/><rect x="150" y="350" width="22" height="22"/>
                    </g>
                    {{-- Unidades azules seleccionadas y orden de avance --}}
                    <path d="M176 262 L330 196" stroke="#9be36b" stroke-width="1.5" stroke-dasharray="5 5"/>
                    <circle cx="334" cy="194" r="7" fill="none" stroke="#9be36b" stroke-width="1.5"/>
                    <rect x="146" y="240" width="56" height="46" fill="rgba(155,227,107,.10)" stroke="#9be36b" stroke-width="1"/>
                    <g fill="#5f9bff" stroke="#e6eef5" stroke-width="1"><circle cx="160" cy="254" r="5"/><circle cx="176" cy="262" r="5"/><circle cx="190" cy="252" r="5"/><circle cx="168" cy="274" r="5"/><circle cx="188" cy="274" r="5"/></g>
                    {{-- Base roja (jugador 2), parcialmente bajo niebla --}}
                    <g fill="#c8452f" stroke="#ffb199" stroke-width="1.2">
                        <rect x="452" y="54" width="44" height="44"/><rect x="414" y="64" width="30" height="30"/><rect x="466" y="108" width="28" height="28"/>
                    </g>
                    <g fill="#e0553d"><circle cx="392" cy="140" r="5"/><circle cx="404" cy="152" r="5"/></g>
                    <rect width="560" height="420" fill="url(#niebla)"/>
                </svg>
                <div class="chips">
                    <span class="chip ambar">Créditos <b>2.000</b></span>
                    <span class="chip">Energía <b>+12</b></span>
                    <span class="chip">Unidades <b>14</b></span>
                    <span class="chip">Tiempo <b>4:32</b></span>
                </div>
                <div class="panelito">
                    <strong>Escuadra de infantería</strong>
                    <span>5 unidades · avance con ataque</span>
                    <div class="barrita"><i></i></div>
                </div>
            </div>
        </div>
    </section>

    <section class="seccion" id="facciones">
        <div class="contenedor">
            <span class="etiqueta">Tres facciones</span>
            <h2>Cada bando juega de otra manera</h2>
            <p class="bajada">Las facciones tienen unidades, edificios, poderes y superarmas propias. La interfaz también cambia de aspecto según el bando elegido.</p>
            <div class="facciones">
                @foreach ($facciones as $clave => $f)
                    <article class="faccion {{ $clave }}">
                        <img class="arte" src="{{ asset('img/faccion-'.$clave.'.webp') }}" alt="" width="800" height="1000" loading="lazy">
                        <header>
                            <img class="retrato" src="{{ asset('juego/img/comandante-'.$clave.'.png') }}" alt="Comandante de {{ $f['nombre'] }}" width="64" height="64" loading="lazy">
                            <x-emblema :faccion="$clave" />
                            <h3>{{ $f['nombre'] }}</h3>
                        </header>
                        <p class="lema">{{ $f['lema'] }}</p>
                        <ul>
                            @foreach ($f['rasgos'] as $rasgo)
                                <li>{{ $rasgo }}</li>
                            @endforeach
                        </ul>
                    </article>
                @endforeach
            </div>
        </div>
    </section>

    <section class="seccion alterna" id="arsenal">
        <div class="contenedor arsenal">
            <span class="etiqueta">Arsenal</span>
            <h2>Unidades de cada bando</h2>
            <p class="bajada">Infantería, blindados, aviación y flota. Cada facción tiene diseños y nombres propios.</p>
            @foreach ($arsenal as $clave => $lista)
                <input type="radio" name="arsenal" id="ars-{{ $clave }}" @checked($loop->first)>
            @endforeach
            <div class="arsenal-tabs" role="presentation">
                @foreach ($arsenal as $clave => $lista)
                    <label for="ars-{{ $clave }}">{{ $facciones[$clave]['nombre'] ?? ucfirst($clave) }}</label>
                @endforeach
            </div>
            @foreach ($arsenal as $clave => $lista)
                <div class="galeria {{ $clave }}">
                    @foreach ($lista as [$archivo, $nombre])
                        @if (file_exists(public_path("img/ficha-$archivo-$clave.webp")))
                            <figure class="unidad">
                                <img src="{{ asset("img/ficha-$archivo-$clave.webp") }}" alt="{{ $nombre }} de {{ $facciones[$clave]['nombre'] ?? $clave }}" width="1200" height="900" loading="lazy">
                                <figcaption>{{ $nombre }}</figcaption>
                            </figure>
                        @endif
                    @endforeach
                </div>
            @endforeach
        </div>
    </section>

    <section class="seccion" id="modos">
        <div class="contenedor">
            <span class="etiqueta">Modos de juego</span>
            <h2>Del entrenamiento a la competencia</h2>
            <p class="bajada">Aprenda los controles con un recorrido guiado, avance en la campaña y mida su nivel contra otros jugadores.</p>
            <div class="modos">
                <div class="modo"><span class="num">01</span><h3>Campaña</h3><p>Doce misiones, cuatro por facción, incluidas operaciones navales. Las estrellas se verifican en el servidor.</p></div>
                <div class="modo"><span class="num">02</span><h3>Escaramuza</h3><p>De 2 a 8 jugadores contra la IA, todos contra todos o en dos equipos, en tres niveles de dificultad. Mapas continentales para partidas grandes.</p></div>
                <div class="modo"><span class="num">03</span><h3>En línea</h3><p>Salas de 2 a 8 jugadores, todos contra todos o por equipos, con Elo, reconexión automática y repetición de cada partida.</p></div>
                <div class="modo"><span class="num">04</span><h3>Editor de mapas</h3><p>Diseñe terreno, agua, recursos y pozos petroleros, y pruebe el mapa al instante.</p></div>
            </div>
            <h3 class="etiqueta" style="margin-top:34px">Novedades de la versión {{ config('game.version') }}</h3>
            <div class="novedades">
                <div class="novedad"><h3>Escaramuza a medida</h3><p>Vista previa del mapa y, para cada jugador, facción, equipo, color, dificultad y lugar de aparición.</p></div>
                <div class="novedad"><h3>Bombardero</h3><p>Un ala volante de Atlas suelta una sola bomba de gran poder y vuelve a su hangar.</p></div>
                <div class="novedad"><h3>Aeródromo con hangares</h3><p>Los aviones aterrizan por la pista, se guardan en su hangar y despegan al recibir una orden.</p></div>
                <div class="novedad"><h3>Armas secundarias</h3><p>Ametralladoras para los tanques y cañón sin retroceso para los técnicos, con mejoras en la fábrica.</p></div>
            </div>
        </div>
    </section>

    <section class="seccion alterna" id="perfil">
        <div class="contenedor carrera">
            <div>
                <span class="etiqueta">Perfil de comandante</span>
                <h2>Su progreso queda registrado</h2>
                <p class="bajada">Con una cuenta, el panel reúne su actividad y su posición frente a otros jugadores.</p>
                <ul class="lista-datos">
                    <li><b>Historial</b><span>Resultado, rival, facción y duración de cada partida, con acceso a la repetición.</span></li>
                    <li><b>Escalafón</b><span>Clasificación general por Elo y victorias en partidas en línea.</span></li>
                    <li><b>Campaña</b><span>Misiones completadas y estrellas obtenidas por facción.</span></li>
                    <li><b>Amigos</b><span>Agregue a sus compañeros y rete a un duelo directo.</span></li>
                </ul>
            </div>
            <div class="rangos">
                <h3>Rangos durante la partida</h3>
                @foreach ($rangos as [$n, $xp, $desc])
                    <div class="rango">
                        <span class="ins">@for ($i = 0; $i < $n; $i++)<i style="height:{{ 6 + $i * 3 }}px"></i>@endfor</span>
                        <div>
                            <div>Rango {{ $n }} · <small>{{ $desc }}</small></div>
                            <div class="xp"><i style="width:{{ round($xp / 180) }}%"></i></div>
                        </div>
                        <small>{{ number_format($xp, 0, ',', '.') }} XP</small>
                    </div>
                @endforeach
            </div>
        </div>
    </section>

    <section class="cierre">
        <div class="contenedor">
            <h2>Listo para el despliegue</h2>
            <p>Cree su cuenta en menos de un minuto y empiece por el entrenamiento guiado.</p>
            <div class="cta">
                @auth
                    <a class="btn primario grande" href="{{ route('dashboard') }}">Ir al panel</a>
                @else
                    <a class="btn primario grande" href="{{ route('register') }}">Crear cuenta gratuita</a>
                    <a class="btn grande" href="{{ route('login') }}">Ya tengo cuenta</a>
                @endauth
            </div>
        </div>
    </section>
</main>

<footer class="pie">
    <div class="contenedor">
        <p>Frente Árido v{{ config('game.version') }} · Proyecto académico de Ingeniería Informática, UNIPAZ.</p>
        <p>Diseño, arte y sonido originales.</p>
    </div>
</footer>
</body>
</html>
