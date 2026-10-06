{{-- Pantallas de acceso (inicio de sesión, registro y recuperación): arte de la portada y formulario con el estilo del sitio --}}
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf-token" content="{{ csrf_token() }}">
<title>{{ isset($titulo) ? $titulo.' · ' : '' }}Frente Árido</title>
<meta name="theme-color" content="#1d2220">
<link rel="stylesheet" href="{{ asset('css/sitio.css') }}">
<x-favicons />
<link rel="preload" as="image" href="{{ asset('img/portada.webp') }}">
</head>
<body>
<div class="acceso">
    <aside class="acceso-arte" aria-hidden="true">
        <div class="texto">
            <h2>Controle el <span>desierto</span>.<br>Domine el frente.</h2>
            <p>Estrategia en tiempo real en el navegador. Tres facciones, campaña, escaramuzas de hasta 8 jugadores y partidas en línea con Elo.</p>
            <div class="retratos">
                @foreach (['atlas', 'hierro', 'guerrilla'] as $f)
                    <img src="{{ asset('juego/img/comandante-'.$f.'.png') }}" alt="" width="52" height="52">
                @endforeach
            </div>
        </div>
    </aside>
    <main class="acceso-panel" id="contenido">
        <a class="marca" href="{{ url('/') }}"><x-emblema faccion="general" /> Frente Árido <small>v{{ config('game.version') }}</small></a>
        <div class="acceso-caja">
            {{ $slot }}
        </div>
    </main>
</div>
</body>
</html>
