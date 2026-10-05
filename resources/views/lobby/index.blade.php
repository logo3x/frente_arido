<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf-token" content="{{ csrf_token() }}">
<title>Frente Árido · Lobby</title>
@if (file_exists(public_path('build/manifest.json')) || file_exists(public_path('hot')))
  @vite(['resources/js/app.js'])
@endif
<style>
  :root{--bg:#1d2220;--panel:#232c2e;--line:#3f4c4c;--ink:#ece5d1;--muted:#a9a48f;--amber:#e8a33d;--bad:#e0553d;--ok:#79c25a;
        --font:"Bahnschrift","DIN Alternate","Roboto Condensed","Arial Narrow",system-ui,sans-serif}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font)}
  main{max-width:980px;margin:0 auto;padding:24px 16px 48px}
  header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:18px}
  h1{margin:0;font-size:32px;font-weight:600}
  header p{margin:0;color:var(--muted)}
  .grid{display:grid;grid-template-columns:2fr 1fr;gap:16px}
  section{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:14px 16px}
  h2{margin:0 0 10px;font-size:18px;font-weight:600;color:var(--amber)}
  table{width:100%;border-collapse:collapse;font-size:15px}
  td,th{text-align:left;padding:7px 6px;border-top:1px solid #344041}
  th{color:var(--muted);font-weight:500;border-top:none}
  button,.btn{font:inherit;font-size:14px;color:var(--ink);background:#2c3739;border:1px solid #4b5a5a;border-radius:3px;padding:7px 12px;cursor:pointer;text-decoration:none;display:inline-block}
  button:hover,.btn:hover{background:#37464a}
  .primary{background:#5a3f16;border-color:var(--amber)}
  .empty{color:var(--muted);padding:8px 0}
  .flash{padding:9px 12px;border-radius:3px;margin-bottom:14px;border:1px solid}
  .flash.err{border-color:var(--bad);color:var(--bad)} .flash.ok{border-color:var(--ok);color:var(--ok)}
  form{display:inline}
  .stack>section+section{margin-top:16px}
  @media (max-width:760px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
  <header>
    <h1>Frente Árido</h1>
    <p>Lobby de partidas en línea · {{ auth()->user()->name }} · Elo {{ auth()->user()->elo ?? 1000 }} · <span id="estadoTR">actualización cada 5 s</span></p>
  </header>

  @if (session('error'))<div class="flash err">{{ session('error') }}</div>@endif
  @if (session('ok'))<div class="flash ok">{{ session('ok') }}</div>@endif

  <div class="grid">
    <div class="stack">
      <section>
        <h2>Salas abiertas</h2>
        <table>
          <thead><tr><th>Sala</th><th>Anfitrión</th><th>Creada</th><th></th></tr></thead>
          <tbody id="abiertas"><tr><td colspan="4" class="empty">Cargando…</td></tr></tbody>
        </table>
        <div style="margin-top:12px">
          <form method="POST" action="{{ route('lobby.store') }}">
            @csrf
            <button class="primary">Crear sala</button>
          </form>
          <a class="btn" href="{{ route('lobby.campania') }}">Jugar campaña</a>
        </div>
      </section>

      <section>
        <h2>Mis partidas activas</h2>
        @forelse ($misPartidas as $p)
          @if ($loop->first)<table><thead><tr><th>Sala</th><th>Jugadores</th><th>Estado</th><th></th></tr></thead><tbody>@endif
            <tr>
              <td>{{ $p->codigo }}</td>
              <td>{{ $p->anfitrion->name }} vs {{ $p->rival?->name ?? '—' }}</td>
              <td>{{ $p->estado === 'esperando' ? 'Esperando rival' : 'Lista' }}</td>
              <td>
                <a class="btn primary" href="{{ route('lobby.jugar', $p) }}">Entrar</a>
                @if ($p->estado === 'esperando' && $p->anfitrion_id == auth()->id())
                  <form method="POST" action="{{ route('lobby.cancelar', $p) }}">@csrf @method('DELETE')<button>Cancelar</button></form>
                @endif
              </td>
            </tr>
          @if ($loop->last)</tbody></table>@endif
        @empty
          <p class="empty">No tiene partidas activas.</p>
        @endforelse
      </section>

      <section>
        <h2>Historial reciente</h2>
        @forelse ($historial as $p)
          @if ($loop->first)<table><thead><tr><th>Sala</th><th>Jugadores</th><th>Resultado</th><th></th></tr></thead><tbody>@endif
            <tr>
              <td>{{ $p->codigo }}</td>
              <td>{{ $p->anfitrion->name }} vs {{ $p->rival?->name ?? '—' }}</td>
              <td>
                @if ($p->ganador_id === null) Sin ganador ({{ $p->motivo }})
                @elseif ($p->ganador_id == auth()->id()) Victoria{{ $p->motivo === 'abandono' ? ' por abandono' : '' }}
                @else Derrota{{ $p->motivo === 'abandono' ? ' por abandono' : '' }}
                @endif
                @if ($p->elo_cambio) <span class="empty">(±{{ $p->elo_cambio }} Elo)</span> @endif
              </td>
              <td>@if ($p->repeticion)<a class="btn" href="{{ route('lobby.ver', $p) }}">Ver repetición</a>@endif</td>
            </tr>
          @if ($loop->last)</tbody></table>@endif
        @empty
          <p class="empty">Aún no hay partidas terminadas.</p>
        @endforelse
      </section>
    </div>

    <div class="stack">
    <section>
      <h2>Campaña</h2>
      @php $nombres = ['atlas' => 'Coalición Atlas', 'hierro' => 'Frente Hierro', 'guerrilla' => 'Red Guerrillera']; @endphp
      <table><thead><tr><th>Facción</th><th>Misiones</th><th>Estrellas</th></tr></thead><tbody>
        @foreach ($nombres as $clave => $nombre)
          @php $filas = $campania[$clave] ?? collect(); @endphp
          <tr><td>{{ $nombre }}</td><td>{{ $filas->count() }} / 3</td><td>{{ $filas->sum('estrellas') }} / 9</td></tr>
        @endforeach
      </tbody></table>
      <h2 style="margin-top:12px">Partidas recientes</h2>
      @forelse ($registros as $r)
        @if ($loop->first)<table><tbody>@endif
          <tr><td>{{ ['solo' => 'Escaramuza', 'mision' => 'Campaña'][$r->modo] ?? $r->modo }}</td><td>{{ $r->resultado }}</td><td>{{ gmdate('i:s', $r->duracion) }}</td></tr>
        @if ($loop->last)</tbody></table>@endif
      @empty
        <p class="empty">Sin partidas registradas desde el cliente.</p>
      @endforelse
    </section>
    <section>
      <h2>Clasificación</h2>
      @forelse ($ranking as $i => $u)
        @if ($loop->first)<table><thead><tr><th>#</th><th>Jugador</th><th>Elo</th><th>Victorias</th></tr></thead><tbody>@endif
          <tr><td>{{ $i + 1 }}</td><td>{{ $u->name }}</td><td>{{ $u->elo }}</td><td>{{ $u->victorias }}</td></tr>
        @if ($loop->last)</tbody></table>@endif
      @empty
        <p class="empty">Sin partidas registradas.</p>
      @endforelse
    </section>
    </div>
  </div>
</main>

<script>
  // Actualización periódica de salas abiertas (en la 0.4 se reemplaza por Laravel Reverb).
  const token = document.querySelector('meta[name="csrf-token"]').content;
  const esc = s => String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  async function cargar() {
    try {
      const res = await fetch(@json(route('lobby.listado')), { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(res.status);
      const salas = await res.json();
      document.getElementById('abiertas').innerHTML = salas.length
        ? salas.map(s => `<tr><td>${esc(s.codigo)}</td><td>${esc(s.anfitrion)}</td><td>${esc(s.creada)}</td>
            <td><form method="POST" action="${esc(s.unirse_url)}"><input type="hidden" name="_token" value="${token}"><button class="primary">Unirse</button></form></td></tr>`).join('')
        : '<tr><td colspan="4" class="empty">No hay salas abiertas. Cree una y comparta el código.</td></tr>';
    } catch (e) {
      document.getElementById('abiertas').innerHTML = '<tr><td colspan="4" class="empty">No fue posible cargar las salas. Se reintentará en 5 s.</td></tr>';
    }
  }
  // Tiempo real con Reverb (canal público "lobby"). Sin Echo, se mantiene la consulta cada 5 s.
  let intervalo = setInterval(cargar, 5000);
  let historialDesfasado = false;
  function conectarTiempoReal() {
    if (!window.Echo) return false;
    window.Echo.channel('lobby').listen('.salas.actualizadas', e => { cargar(); if (e && e.tipo === 'resultado') { historialDesfasado = true; avisarHistorial(); } });
    clearInterval(intervalo);
    intervalo = setInterval(cargar, 30000); // respaldo ante eventos perdidos
    document.getElementById('estadoTR').textContent = 'tiempo real activo';
    return true;
  }
  function avisarHistorial() {
    if (!historialDesfasado || document.getElementById('avisoHist')) return;
    const p = document.createElement('p');
    p.id = 'avisoHist'; p.className = 'empty';
    p.innerHTML = 'Hay resultados nuevos. <a class="btn" href="">Actualizar</a>';
    document.querySelector('.stack').prepend(p);
  }
  cargar();
  // app.js se carga como módulo y puede terminar después de este script
  if (!conectarTiempoReal()) window.addEventListener('load', conectarTiempoReal);
</script>
</body>
</html>
