@php
    $nombres = ['atlas' => 'Coalición Atlas', 'hierro' => 'Frente Hierro', 'guerrilla' => 'Red Guerrillera'];
@endphp
<x-layouts.sitio titulo="Partidas en línea">
    <x-slot:cabeza>
        @if (file_exists(public_path('build/manifest.json')) || file_exists(public_path('hot')))
            @vite(['resources/js/app.js'])
        @endif
        <script src="{{ asset('js/lobby.js') }}" defer></script>
    </x-slot:cabeza>

    <header class="cabecera-pagina">
        <nav class="migas" aria-label="Ruta"><a href="{{ route('dashboard') }}">← Volver al panel</a></nav>
        <p class="etiqueta">Lobby</p>
        <h1>Partidas en línea</h1>
        <p class="vacio">{{ auth()->user()->name }} · Elo {{ auth()->user()->elo ?? 1000 }} · <span id="estadoTR" class="estado-tr">Actualización cada 5 s</span></p>
    </header>

    <div class="tablero">
        <div class="pila">
            <section class="bloque" aria-labelledby="abiertas-titulo">
                <header class="bloque-cab"><h2 id="abiertas-titulo">Salas abiertas</h2></header>
                <div class="tabla-scroll">
                    <table class="tabla">
                        <thead><tr><th>Sala</th><th>Anfitrión</th><th>Jugadores</th><th>Creada</th><th></th></tr></thead>
                        <tbody id="abiertas" data-url="{{ route('lobby.listado') }}"><tr><td colspan="5" class="vacio">Cargando…</td></tr></tbody>
                    </table>
                </div>
                <div class="nueva-sala">
                    <form method="POST" action="{{ route('lobby.store') }}">
                        @csrf
                        <label>Jugadores
                            <select name="plazas">@foreach (\App\Models\Partida::PLAZAS as $n)<option value="{{ $n }}">{{ $n }} jugadores{{ $n > 2 ? ' (mapa continental)' : '' }}</option>@endforeach</select>
                        </label>
                        <label>Modo
                            <select name="modo"><option value="todos">Todos contra todos</option><option value="equipos">Dos equipos</option></select>
                        </label>
                        <button class="btn primario">Crear sala</button>
                    </form>
                    <a class="btn" href="{{ route('lobby.campania') }}">Jugar campaña</a>
                    <a class="btn" href="{{ route('lobby.escaramuza') }}">Escaramuza contra la IA</a>
                </div>
            </section>

            <section class="bloque" aria-labelledby="activas-titulo">
                <header class="bloque-cab"><h2 id="activas-titulo">Mis partidas activas</h2></header>
                @forelse ($misPartidas as $p)
                    @if ($loop->first)<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Sala</th><th>Jugadores</th><th>Estado</th><th></th></tr></thead><tbody>@endif
                    <tr>
                        <td><b>{{ $p->codigo }}</b></td>
                        <td>{{ $p->nombresJugadores() }}</td>
                        <td>{{ $p->estado === 'esperando' ? ($p->esMultijugador() ? 'Esperando jugadores' : 'Esperando rival') : 'Lista' }}</td>
                        <td class="acc">
                            <a class="btn primario mini" href="{{ route('lobby.jugar', $p) }}">Entrar</a>
                            @if ($p->estado === 'esperando' && $p->anfitrion_id == auth()->id())
                                <form method="POST" action="{{ route('lobby.cancelar', $p) }}">@csrf @method('DELETE')<button class="btn mini">Cancelar</button></form>
                            @endif
                        </td>
                    </tr>
                    @if ($loop->last)</tbody></table></div>@endif
                @empty
                    <p class="vacio">No tiene partidas activas.</p>
                @endforelse
            </section>

            <section class="bloque" aria-labelledby="historial-titulo">
                <header class="bloque-cab"><h2 id="historial-titulo">Historial reciente</h2></header>
                @forelse ($historial as $p)
                    @if ($loop->first)<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Sala</th><th>Jugadores</th><th>Resultado</th><th></th></tr></thead><tbody>@endif
                    <tr>
                        <td><b>{{ $p->codigo }}</b></td>
                        <td>{{ $p->nombresJugadores() }}</td>
                        <td>
                            @php $res = $p->resultadoPara(auth()->user()); @endphp
                            @if ($res === 'sin_resultado') Sin ganador ({{ $p->motivo }})
                            @elseif ($res === 'victoria') Victoria{{ $p->motivo === 'abandono' ? ' por abandono' : '' }}
                            @else Derrota{{ $p->motivo === 'abandono' ? ' por abandono' : '' }}
                            @endif
                            @php $elo = $p->eloPara(auth()->user()); @endphp
                            @if ($elo) <span class="vacio">({{ $elo > 0 ? '+' : '' }}{{ $elo }} Elo)</span> @endif
                        </td>
                        <td class="acc">@if ($p->repeticion)<a class="btn mini" href="{{ route('lobby.ver', $p) }}">Ver repetición</a>@endif</td>
                    </tr>
                    @if ($loop->last)</tbody></table></div>@endif
                @empty
                    <p class="vacio">Aún no hay partidas terminadas.</p>
                @endforelse
            </section>
        </div>

        <div class="pila">
            <section class="bloque" aria-labelledby="campania-titulo">
                <header class="bloque-cab"><h2 id="campania-titulo">Campaña</h2></header>
                <table class="tabla">
                    <thead><tr><th>Facción</th><th>Misiones</th><th>Estrellas</th></tr></thead>
                    <tbody>
                        @foreach ($nombres as $clave => $nombre)
                            @php $filas = $campania[$clave] ?? collect(); @endphp
                            <tr><td>{{ $nombre }}</td><td class="num">{{ $filas->count() }} / {{ count(config("game.misiones.$clave")) }}</td><td class="num">{{ $filas->sum('estrellas') }} / {{ 3 * count(config("game.misiones.$clave")) }}</td></tr>
                        @endforeach
                    </tbody>
                </table>
            </section>

            <section class="bloque" aria-labelledby="recientes-titulo">
                <header class="bloque-cab"><h2 id="recientes-titulo">Partidas recientes</h2></header>
                @forelse ($registros as $r)
                    @if ($loop->first)<table class="tabla"><tbody>@endif
                    <tr><td>{{ ['solo' => 'Escaramuza', 'mision' => 'Campaña'][$r->modo] ?? $r->modo }}</td><td>{{ $r->resultado }}</td><td class="num">{{ gmdate('i:s', $r->duracion) }}</td></tr>
                    @if ($loop->last)</tbody></table>@endif
                @empty
                    <p class="vacio">Sin partidas registradas desde el cliente.</p>
                @endforelse
            </section>

            <section class="bloque" aria-labelledby="clasif-titulo">
                <header class="bloque-cab"><h2 id="clasif-titulo">Clasificación</h2></header>
                @forelse ($ranking as $i => $u)
                    @if ($loop->first)<table class="tabla"><thead><tr><th>#</th><th>Jugador</th><th>Elo</th><th>Victorias</th></tr></thead><tbody>@endif
                    <tr><td class="num">{{ $i + 1 }}</td><td>{{ $u->name }}</td><td class="num">{{ $u->elo }}</td><td class="num">{{ $u->victorias }}</td></tr>
                    @if ($loop->last)</tbody></table>@endif
                @empty
                    <p class="vacio">Sin partidas registradas.</p>
                @endforelse
            </section>
        </div>
    </div>
</x-layouts.sitio>
