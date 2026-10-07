<?php

namespace App\Http\Controllers;

use App\Events\SalasActualizadas;
use App\Models\Partida;
use App\Models\User;
use App\Services\GameToken;
use App\Services\PerfilToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Illuminate\View\View;

class LobbyController extends Controller
{
    public function index(Request $request): View
    {
        $user = $request->user();

        $misPartidas = Partida::with(['anfitrion:id,name', 'rival:id,name', 'jugadores:id,name'])
            ->whereIn('estado', [Partida::ESPERANDO, Partida::LISTA])
            ->delUsuario($user)
            ->latest()->get();

        $historial = Partida::with(['anfitrion:id,name', 'rival:id,name', 'ganador:id,name', 'jugadores:id,name'])
            ->where('estado', Partida::FINALIZADA)
            ->delUsuario($user)
            ->latest('finalizada_at')->limit(10)->get();

        $ranking = User::query()
            ->select('users.id', 'users.name', 'users.elo', DB::raw('COUNT(partidas.id) AS victorias'))
            ->leftJoin('partidas', function ($j) {
                $j->on('partidas.ganador_id', '=', 'users.id')->where('partidas.estado', Partida::FINALIZADA);
            })
            ->groupBy('users.id', 'users.name', 'users.elo')
            ->havingRaw('COUNT(partidas.id) > 0 OR users.elo <> 1000')
            ->orderByDesc('users.elo')
            ->limit(10)->get();

        // Resumen del perfil de campaña e historial del cliente
        $campania = DB::table('campania_progresos')->where('user_id', $user->id)->get()->groupBy('faccion');
        $registros = DB::table('registros_juego')->where('user_id', $user->id)->latest('created_at')->limit(8)->get();

        return view('lobby.index', compact('misPartidas', 'historial', 'ranking', 'campania', 'registros'));
    }

    // Salas abiertas de otros jugadores (el lobby las consulta cada 5 s).
    public function listado(Request $request): JsonResponse
    {
        $partidas = Partida::abiertas()
            ->with('anfitrion:id,name')
            ->withCount('jugadores')
            ->whereNull('invitado_id')                       // los retos directos no aparecen en el listado público
            ->where('anfitrion_id', '!=', $request->user()->id)
            ->where('created_at', '>=', now()->subHours(2))
            ->latest()->limit(30)->get()
            ->map(fn (Partida $p) => [
                'codigo' => $p->codigo,
                'anfitrion' => $p->anfitrion->name,
                'plazas' => (int) $p->plazas,
                'ocupadas' => $p->plazas > 2 ? (int) $p->jugadores_count : 1,
                'modo' => $p->modo,
                'creada' => $p->created_at->diffForHumans(),
                'unirse_url' => route('lobby.unirse', $p),
            ]);

        return response()->json($partidas);
    }

    public function store(Request $request): RedirectResponse
    {
        // Reto directo: el invitado debe ser un amigo aceptado.
        $datos = $request->validate([
            'invitado' => ['nullable', 'integer'],
            'plazas' => ['nullable', 'integer', 'in:'.implode(',', Partida::PLAZAS)],
            'modo' => ['nullable', 'in:todos,equipos'],
        ]);
        $invitado = $datos['invitado'] ?? null;
        $plazas = (int) ($datos['plazas'] ?? 2);
        if ($invitado !== null && $plazas > 2) {
            return back()->with('error', 'Los retos directos son de 2 jugadores.');
        }
        if ($invitado !== null && ! $request->user()->esAmigoDe((int) $invitado)) {
            return back()->with('error', 'Solo puede retar a jugadores de su lista de amigos.');
        }

        $partida = Partida::create([
            'codigo' => Partida::nuevoCodigo(),
            'plazas' => $plazas,
            'modo' => $plazas > 2 ? ($datos['modo'] ?? 'todos') : 'todos',
            'anfitrion_id' => $request->user()->id,
            'invitado_id' => $invitado,
        ]);
        if ($plazas > 2) {
            $partida->jugadores()->attach($request->user()->id, ['plaza' => 0, 'equipo' => $partida->modo === 'equipos' ? 0 : null]);
        }
        $this->avisarLobby();

        return redirect()->route('lobby.jugar', $partida);
    }

    public function unirse(Request $request, Partida $partida): RedirectResponse
    {
        $user = $request->user();

        // Bloqueo de fila: dos usuarios no pueden tomar el mismo cupo.
        $ok = DB::transaction(function () use ($partida, $user) {
            $p = Partida::whereKey($partida->id)->lockForUpdate()->first();
            if ($p->participa($user)) {
                return true;
            }
            if ($p->esMultijugador()) {
                // Sala de más de 2: se toma la siguiente plaza libre; la sala queda lista al completarse
                $ocupadas = $p->jugadores()->count();
                if ($p->estado !== Partida::ESPERANDO || $ocupadas >= $p->plazas) {
                    return false;
                }
                $p->jugadores()->attach($user->id, ['plaza' => $ocupadas, 'equipo' => $p->modo === 'equipos' ? intdiv($ocupadas, intdiv($p->plazas, 2)) : null]);
                if ($ocupadas + 1 >= $p->plazas) {
                    $p->update(['estado' => Partida::LISTA]);
                }

                return true;
            }
            if ($p->estado !== Partida::ESPERANDO || $p->rival_id !== null || ! $p->puedeUnirse($user)) {
                return false;
            }
            $p->update(['rival_id' => $user->id, 'estado' => Partida::LISTA]);

            return true;
        });
        $this->avisarLobby();

        return $ok
            ? redirect()->route('lobby.jugar', $partida)
            : redirect()->route('lobby.index')->with('error', 'La sala ya no está disponible.');
    }

    public function jugar(Request $request, Partida $partida): RedirectResponse
    {
        $user = $request->user();
        abort_unless($partida->participa($user), 403, 'No participa en esta partida.');
        abort_if(in_array($partida->estado, [Partida::FINALIZADA, Partida::CANCELADA], true), 410, 'La partida ya no está activa.');

        $query = http_build_query([
            'server' => config('game.ws_url'),
            'room' => $partida->codigo,
            'name' => $user->name,
            'token' => GameToken::make($partida, $user),
            'return' => route('lobby.index'),
        ]);

        return redirect()->to(config('game.client_url').'?'.$query);
    }

    // Abre el cliente en la pantalla de campaña (continuar o nueva) con un token de perfil de corta duración
    public function campania(Request $request): RedirectResponse
    {
        return $this->abrirCliente($request, 'campania');
    }

    // Abre el cliente directamente en la configuración de escaramuza; los resultados se registran en la cuenta
    public function escaramuza(Request $request): RedirectResponse
    {
        return $this->abrirCliente($request, 'escaramuza');
    }

    private function abrirCliente(Request $request, string $modo): RedirectResponse
    {
        $query = http_build_query([
            'modo' => $modo,
            'api' => url('/api'),
            'perfil' => PerfilToken::make($request->user()),
            'return' => route('dashboard'),
        ]);

        return redirect()->to(config('game.client_url').'?'.$query);
    }

    // Descarga la repetición guardada. Solo para los participantes (la repetición revela la estrategia completa).
    public function repeticion(Request $request, Partida $partida): StreamedResponse
    {
        abort_unless($partida->participa($request->user()), 403, 'Solo los participantes pueden ver esta repetición.');
        abort_unless($partida->repeticion && Storage::disk('local')->exists($partida->repeticion), 404, 'La partida no tiene repetición.');

        return Storage::disk('local')->download($partida->repeticion, "frente-arido-{$partida->codigo}.json", ['Content-Type' => 'application/json']);
    }

    public function verRepeticion(Request $request, Partida $partida): RedirectResponse
    {
        abort_unless($partida->participa($request->user()), 403, 'Solo los participantes pueden ver esta repetición.');
        $query = http_build_query(['replay' => route('lobby.repeticion', $partida), 'return' => route('lobby.index')]);

        return redirect()->to(config('game.client_url').'?'.$query);
    }

    // El creador cierra su sala mientras espera jugadores o está lista para empezar. Si la partida ya se jugó
    // en el servidor, su resultado se registra igual al terminar (el webhook solo ignora las finalizadas).
    public function cancelar(Request $request, Partida $partida): RedirectResponse
    {
        abort_unless((int) $partida->anfitrion_id === (int) $request->user()->id, 403, 'Solo el creador puede cerrar la sala.');
        abort_unless(in_array($partida->estado, [Partida::ESPERANDO, Partida::LISTA], true), 409, 'La sala ya terminó o ya se cerró.');
        $partida->update(['estado' => Partida::CANCELADA]);
        $this->avisarLobby();

        return redirect()->route('lobby.index')->with('ok', 'Sala cerrada.');
    }

    // Notifica por Reverb. Si la difusión no está configurada, el lobby sigue con la consulta periódica.
    private function avisarLobby(): void
    {
        try {
            broadcast(new SalasActualizadas());
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
