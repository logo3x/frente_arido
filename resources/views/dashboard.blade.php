@php
    $r = $resumen;
    $n = $r['nivel'];
    $facciones = config('game.facciones');
    $tiempo = fn (int $s) => intdiv($s, 60).':'.str_pad($s % 60, 2, '0', STR_PAD_LEFT);
    $resultados = ['victoria' => 'Victoria', 'derrota' => 'Derrota', 'anulada' => 'Anulada', 'sin_resultado' => 'Sin resultado'];
    $pctOnline = $r['online']['jugadas'] ? round(100 * $r['online']['victorias'] / $r['online']['jugadas']) : null;
@endphp
<x-layouts.sitio titulo="Panel">

    {{-- Ficha del comandante --}}
    <section class="ficha" aria-labelledby="ficha-titulo">
        <div class="ficha-id">
            <div class="insignia" aria-hidden="true">
                <span>{{ $n['numero'] }}</span>
            </div>
            <div>
                <p class="etiqueta">{{ $n['nombre'] }} · Nivel {{ $n['numero'] }}</p>
                <h1 id="ficha-titulo">{{ auth()->user()->name }}</h1>
                <div class="xp-carrera" title="En línea {{ $r['xp_detalle']['En línea'] }} · Campaña {{ $r['xp_detalle']['Campaña'] }} · Escaramuza {{ $r['xp_detalle']['Escaramuza'] }}">
                    <div class="xp-barra"><i style="width:{{ $n['progreso'] }}%"></i></div>
                    <small>
                        {{ number_format($r['xp'], 0, ',', '.') }} XP
                        @if ($n['hasta'])
                            · faltan {{ number_format($n['hasta'] - $r['xp'], 0, ',', '.') }} para {{ $n['siguiente'] }}
                        @else
                            · nivel máximo
                        @endif
                    </small>
                </div>
            </div>
        </div>

        <dl class="ficha-datos">
            <div><dt>Elo</dt><dd>{{ $r['elo'] }}</dd><small>{{ $r['online']['jugadas'] ? 'Puesto '.$r['posicion'].' del escalafón' : 'Sin clasificar' }}</small></div>
            <div><dt>En línea</dt><dd>{{ $r['online']['victorias'] }}<span>–{{ $r['online']['derrotas'] }}</span></dd><small>{{ $pctOnline !== null ? $pctOnline.' % de victorias' : 'Sin partidas aún' }}</small></div>
            <div>
                <dt>Racha</dt>
                @if ($r['racha'])
                    <dd @class(['bien' => $r['racha']['tipo'] === 'victoria', 'mal' => $r['racha']['tipo'] === 'derrota'])>{{ $r['racha']['n'] }}</dd>
                    <small>
                        @if ($r['racha']['n'] === 1) {{ $r['racha']['tipo'] === 'victoria' ? 'Última: victoria' : 'Última: derrota' }}
                        @else {{ $r['racha']['tipo'] === 'victoria' ? 'victorias' : 'derrotas' }} seguidas
                        @endif
                    </small>
                @else
                    <dd>–</dd><small>Sin resultados</small>
                @endif
            </div>
            <div><dt>Campaña</dt><dd>{{ $r['estrellas'] }}<span>/{{ $r['estrellas_max'] }}</span></dd><small>{{ $r['misiones'] }} de {{ $r['misiones_max'] }} misiones</small></div>
        </dl>

        <div class="ficha-acciones">
            <a class="btn primario" href="{{ route('lobby.campania') }}">Jugar campaña</a>
            <a class="btn" href="{{ route('lobby.index') }}">Partidas en línea</a>
            <a class="btn" href="{{ route('lobby.escaramuza') }}">Escaramuza contra la IA</a>
        </div>
    </section>

    {{-- Retos recibidos y partidas activas --}}
    @if ($retos->isNotEmpty() || $activas->isNotEmpty())
        <section class="franja" aria-label="Partidas pendientes">
            @foreach ($retos as $p)
                <div class="franja-item reto">
                    <span><b>{{ $p->anfitrion->name }}</b> lo reta a un duelo · {{ $p->created_at->diffForHumans() }}</span>
                    <form method="POST" action="{{ route('lobby.unirse', $p) }}">@csrf<button class="btn primario">Aceptar reto</button></form>
                </div>
            @endforeach
            @foreach ($activas as $p)
                <div class="franja-item">
                    <span>
                        Sala <b>{{ $p->codigo }}</b> ·
                        @if ($p->rival) {{ $p->anfitrion->name }} contra {{ $p->rival->name }}
                        @elseif ($p->invitado) Esperando a {{ $p->invitado->name }}
                        @else Esperando rival
                        @endif
                    </span>
                    <a class="btn primario" href="{{ route('lobby.jugar', $p) }}">Entrar</a>
                </div>
            @endforeach
        </section>
    @endif

    <div class="tablero">
        <div class="col-principal">
            {{-- Historial --}}
            <section class="bloque" aria-labelledby="hist-titulo">
                <header class="bloque-cab">
                    <h2 id="hist-titulo">Historial de partidas</h2>
                    <nav class="pestanas" aria-label="Filtrar historial">
                        <a href="{{ route('dashboard') }}" @class(['activa' => $modo === null]) @if ($modo === null) aria-current="page" @endif>Todas</a>
                        @foreach (\App\Services\Carrera::MODOS as $clave => $nombre)
                            <a href="{{ route('dashboard', ['modo' => $clave]) }}" @class(['activa' => $modo === $clave]) @if ($modo === $clave) aria-current="page" @endif>{{ $nombre }}</a>
                        @endforeach
                    </nav>
                </header>

                @forelse ($historial as $h)
                    <article class="partida {{ $h['resultado'] }}">
                        <div class="partida-res">
                            <strong>{{ $resultados[$h['resultado']] ?? $h['resultado'] }}</strong>
                            <span>{{ \App\Services\Carrera::MODOS[$h['modo']] }}</span>
                        </div>
                        <div class="partida-fac" title="{{ $h['faccion'] ? $facciones[$h['faccion']]['nombre'] : 'Facción no registrada' }}">
                            @if ($h['faccion'])<x-emblema :faccion="$h['faccion']" />@else<span class="sin-fac">–</span>@endif
                        </div>
                        <div class="partida-info">
                            <span class="rival">contra <b>{{ $h['rival'] }}</b></span>
                            @if ($h['detalle'])<span class="detalle">{{ $h['detalle'] }}</span>@endif
                        </div>
                        <div class="partida-dato"><small>Duración</small>{{ $tiempo($h['duracion']) }}</div>
                        <div class="partida-dato">
                            <small>Elo</small>
                            @if ($h['elo'] !== null)
                                <span @class(['bien' => $h['elo'] > 0, 'mal' => $h['elo'] < 0])>{{ $h['elo'] > 0 ? '+' : '' }}{{ $h['elo'] }}</span>
                            @else – @endif
                        </div>
                        <div class="partida-fin">
                            <time datetime="{{ $h['fecha']->toIso8601String() }}" title="{{ $h['fecha']->format('d/m/Y H:i') }}">{{ $h['fecha']->diffForHumans() }}</time>
                            <span class="partida-acc">
                                @if ($h['repeticion'])<a class="btn mini" href="{{ $h['repeticion'] }}">Repetición</a>@endif
                                @if ($h['rival_id'] && ! in_array($h['rival_id'], $idsAmigos))
                                    <form method="POST" action="{{ route('amigos.store') }}">@csrf<input type="hidden" name="jugador" value="{{ $h['rival_id'] }}"><button class="btn mini">Agregar</button></form>
                                @endif
                            </span>
                        </div>
                    </article>
                @empty
                    <p class="vacio">
                        @if ($modo) No hay partidas de este tipo todavía.
                        @else Aún no tiene partidas registradas. Empiece por el entrenamiento o la campaña.
                        @endif
                    </p>
                @endforelse
            </section>

            {{-- Campaña --}}
            <section class="bloque" aria-labelledby="camp-titulo">
                <header class="bloque-cab"><h2 id="camp-titulo">Campaña</h2></header>
                <div class="campanias">
                    @foreach (config('game.misiones') as $fac => $misiones)
                        <div class="campania {{ $fac }}">
                            <h3><x-emblema :faccion="$fac" />{{ config("game.campanias.$fac") }}</h3>
                            <ol>
                                @foreach ($misiones as $id)
                                    @php $prog = $campania[$id] ?? null; @endphp
                                    <li @class(['hecha' => $prog])>
                                        <span>{{ config("game.nombres_mision.$id") }}</span>
                                        <span class="estrellas" aria-label="{{ $prog ? $prog->estrellas : 0 }} de 3 estrellas">@for ($i = 1; $i <= 3; $i++)<i @class(['llena' => $prog && $prog->estrellas >= $i])></i>@endfor</span>
                                    </li>
                                @endforeach
                            </ol>
                        </div>
                    @endforeach
                </div>
            </section>
        </div>

        <aside class="col-lateral">
            {{-- Amigos --}}
            <section class="bloque" aria-labelledby="amigos-titulo">
                <header class="bloque-cab"><h2 id="amigos-titulo">Amigos</h2><span class="contador">{{ $amigos->count() }}</span></header>

                @foreach ($recibidas as $s)
                    <div class="solicitud">
                        <span><b>{{ $s->solicitante->name }}</b> quiere agregarlo</span>
                        <form method="POST" action="{{ route('amigos.aceptar', $s) }}">@csrf @method('PATCH')<button class="btn mini primario">Aceptar</button></form>
                        <form method="POST" action="{{ route('amigos.destroy', $s) }}">@csrf @method('DELETE')<button class="btn mini">Rechazar</button></form>
                    </div>
                @endforeach

                @forelse ($amigos as $a)
                    <div class="amigo">
                        <div>
                            <b>{{ $a['jugador']->name }}</b>
                            <small>Elo {{ $a['jugador']->elo }} · Balance {{ $a['balance'][0] }}–{{ $a['balance'][1] }}</small>
                        </div>
                        <form method="POST" action="{{ route('lobby.store') }}">@csrf<input type="hidden" name="invitado" value="{{ $a['jugador']->id }}"><button class="btn mini primario">Retar</button></form>
                        <form method="POST" action="{{ route('amigos.destroy', $a['relacion']) }}">@csrf @method('DELETE')<button class="btn mini fantasma" aria-label="Quitar a {{ $a['jugador']->name }} de amigos" title="Quitar de amigos">×</button></form>
                    </div>
                @empty
                    <p class="vacio">Todavía no tiene amigos agregados.</p>
                @endforelse

                @foreach ($enviadas as $s)
                    <div class="solicitud enviada">
                        <span>Solicitud enviada a <b>{{ $s->destinatario->name }}</b></span>
                        <form method="POST" action="{{ route('amigos.destroy', $s) }}">@csrf @method('DELETE')<button class="btn mini fantasma">Cancelar</button></form>
                    </div>
                @endforeach

                <form class="agregar" method="POST" action="{{ route('amigos.store') }}">
                    @csrf
                    <label for="email-amigo">Agregar por correo</label>
                    <div>
                        <input id="email-amigo" type="email" name="email" required maxlength="255" placeholder="correo@ejemplo.com" autocomplete="off">
                        <button class="btn">Enviar</button>
                    </div>
                </form>
            </section>

            {{-- Escalafón --}}
            <section class="bloque" aria-labelledby="esc-titulo">
                <header class="bloque-cab"><h2 id="esc-titulo">Escalafón</h2></header>
                @if ($escalafon->isEmpty())
                    <p class="vacio">Aún no hay partidas en línea con resultado.</p>
                @else
                    <table class="escalafon">
                        <thead><tr><th scope="col">#</th><th scope="col">Jugador</th><th scope="col">Elo</th><th scope="col">Vict.</th></tr></thead>
                        <tbody>
                            @foreach ($escalafon as $i => $u)
                                <tr @class(['yo' => $u->id === auth()->id()])>
                                    <td>{{ $i + 1 }}</td>
                                    <td>{{ $u->name }}</td>
                                    <td>{{ $u->elo }}</td>
                                    <td>{{ $u->victorias }}</td>
                                </tr>
                            @endforeach
                            @if (! $escalafon->contains('id', auth()->id()))
                                <tr class="yo separado"><td>{{ $r['posicion'] }}</td><td>{{ auth()->user()->name }}</td><td>{{ $r['elo'] }}</td><td>{{ $r['online']['victorias'] }}</td></tr>
                            @endif
                        </tbody>
                    </table>
                @endif
            </section>
        </aside>
    </div>
</x-layouts.sitio>
