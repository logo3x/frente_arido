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

        $misPartidas = Partida::with(['anfitrion:id,name', 'rival:id,name'])
            ->whereIn('estado', [Partida::ESPERANDO, Partida::LISTA])
            ->where(fn ($q) => $q->where('anfitrion_id', $user->id)->orWhere('rival_id', $user->id))
            ->latest()->get();

        $historial = Partida::with(['anfitrion:id,name', 'rival:id,name', 'ganador:id,name'])
            ->where('estado', Partida::FINALIZADA)
            ->where(fn ($q) => $q->where('anfitrion_id', $user->id)->orWhere('rival_id', $user->id))
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
            ->where('anfitrion_id', '!=', $request->user()->id)
            ->where('created_at', '>=', now()->subHours(2))
            ->latest()->limit(30)->get()
            ->map(fn (Partida $p) => [
                'codigo' => $p->codigo,
                'anfitrion' => $p->anfitrion->name,
                'creada' => $p->created_at->diffForHumans(),
                'unirse_url' => route('lobby.unirse', $p),
            ]);

        return response()->json($partidas);
    }

    public function store(Request $request): RedirectResponse
    {
        $partida = Partida::create([
            'codigo' => Partida::nuevoCodigo(),
            'anfitrion_id' => $request->user()->id,
        ]);
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
            if ($p->estado !== Partida::ESPERANDO || $p->rival_id !== null) {
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

    // Abre el cliente en modo campaña con un token de perfil de corta duración
    public function campania(Request $request): RedirectResponse
    {
        $query = http_build_query([
            'api' => url('/api'),
            'perfil' => PerfilToken::make($request->user()),
            'return' => route('lobby.index'),
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

    public function cancelar(Request $request, Partida $partida): RedirectResponse
    {
        abort_unless((int) $partida->anfitrion_id === (int) $request->user()->id, 403);
        abort_unless($partida->estado === Partida::ESPERANDO, 409, 'Solo se cancelan salas sin rival.');
        $partida->update(['estado' => Partida::CANCELADA]);
        $this->avisarLobby();

        return redirect()->route('lobby.index')->with('ok', 'Sala cancelada.');
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
