@props(['titulo' => null, 'erroresGlobales' => true])
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf-token" content="{{ csrf_token() }}">
<title>{{ $titulo ? $titulo.' · ' : '' }}Frente Árido</title>
<meta name="theme-color" content="#1d2220">
<link rel="stylesheet" href="{{ asset('css/sitio.css') }}">
</head>
<body class="app">
<a class="saltar" href="#contenido">Saltar al contenido</a>

<header class="barra">
    <div class="contenedor">
        <a class="marca" href="{{ route('dashboard') }}">
            <x-emblema faccion="general" />
            Frente Árido
        </a>
        <nav aria-label="Principal">
            <a href="{{ route('dashboard') }}" @class(['activo' => request()->routeIs('dashboard')])>Panel</a>
            <a href="{{ route('lobby.index') }}" @class(['activo' => request()->routeIs('lobby.*')])>Partidas en línea</a>
            <a href="{{ route('profile.edit') }}" @class(['activo' => request()->routeIs('profile.*')])>Cuenta</a>
        </nav>
        <div class="acciones">
            <span class="usuario">{{ auth()->user()->name }}</span>
            <form method="POST" action="{{ route('logout') }}">
                @csrf
                <button class="btn fantasma">Cerrar sesión</button>
            </form>
        </div>
    </div>
</header>

<main id="contenido" class="contenedor pagina">
    @if (session('error'))<div class="aviso error" role="alert">{{ session('error') }}</div>@endif
    @if (session('ok'))<div class="aviso ok" role="status">{{ session('ok') }}</div>@endif
    @if ($erroresGlobales && $errors->any())<div class="aviso error" role="alert">{{ $errors->first() }}</div>@endif
    {{ $slot }}
</main>

<footer class="pie">
    <div class="contenedor">
        <p>Frente Árido v0.9.1 · UNIPAZ</p>
        <p><a href="{{ url('/') }}">Página de inicio</a></p>
    </div>
</footer>
</body>
</html>
