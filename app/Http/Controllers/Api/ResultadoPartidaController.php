<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Events\SalasActualizadas;
use App\Models\Partida;
use App\Services\GameToken;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Webhook que llama el servidor Node al terminar una partida.
 * El cuerpo viene firmado con HMAC-SHA256 (hexadecimal) en la cabecera X-Game-Signature.
 */
class ResultadoPartidaController extends Controller
{
    public function __invoke(Request $request): Response
    {
        abort_unless(GameToken::verificarCuerpo($request->getContent(), $request->header('X-Game-Signature')), 401, 'Firma inválida');

        $datos = $request->validate([
            'room' => ['required', 'string', 'max:8'],
            'reason' => ['required', 'in:victoria,abandono,desincronizacion,discrepancia,reinicio'],
            'ticks' => ['required', 'integer', 'min:0'],
            'winner_uid' => ['nullable', 'string'],
            'winner_team' => ['nullable', 'integer', 'min:-1', 'max:7'],
            'jugadores' => ['nullable', 'array', 'max:8'],
            'jugadores.*.uid' => ['required_with:jugadores', 'string'],
            'jugadores.*.team' => ['required_with:jugadores', 'integer', 'min:0', 'max:7'],
            'replay' => ['nullable', 'array'],
        ]);

        $partida = Partida::where('codigo', $datos['room'])->firstOrFail();
        if ($partida->estado === Partida::FINALIZADA) {
            return response()->noContent(); // idempotente
        }

        if ($partida->esMultijugador()) {
            return $this->resultadoMultijugador($partida, $datos, $request);
        }

        $ganador = $datos['winner_uid'] ?? null;
        $valido = $ganador !== null && in_array((int) $ganador, [(int) $partida->anfitrion_id, (int) $partida->rival_id], true);

        // Repetición: se guarda tal cual la envía el servidor (semilla, facciones y órdenes por tick)
        $ruta = null;
        if (! empty($datos['replay'])) {
            $ruta = "repeticiones/{$partida->codigo}.json";
            Storage::disk('local')->put($ruta, json_encode($request->input('replay'), JSON_UNESCAPED_UNICODE));
        }

        DB::transaction(function () use ($partida, $datos, $valido, $ganador, $ruta) {
            // Bloqueo de fila: dos webhooks simultáneos no pueden aplicar el Elo dos veces
            $partida = Partida::whereKey($partida->id)->lockForUpdate()->first();
            if ($partida->estado === Partida::FINALIZADA) {
                return;
            }
            $cambio = null;
            $minimo = (int) config('game.elo_min_ticks', 1800);
            if ($valido && $partida->rival_id && in_array($datos['reason'], ['victoria', 'abandono'], true) && $datos['ticks'] >= $minimo) {
                $perdedorId = (int) $ganador === (int) $partida->anfitrion_id ? $partida->rival_id : $partida->anfitrion_id;
                $cambio = $this->actualizarElo((int) $ganador, (int) $perdedorId);
            }
            $partida->update([
                'estado' => Partida::FINALIZADA,
                'ganador_id' => $valido ? (int) $ganador : null,
                'motivo' => $datos['reason'],
                'duracion_ticks' => $datos['ticks'],
                'repeticion' => $ruta,
                'elo_cambio' => $cambio,
                'finalizada_at' => now(),
            ]);
        });

        try {
            broadcast(new SalasActualizadas('resultado')); // refresca historial y clasificación en los lobbies abiertos
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->noContent();
    }

    // Sala de más de 2: cada jugador gana o pierde según su equipo. Elo por equipos: el promedio de los ganadores contra el
    // de los perdedores (K = 32); cada ganador suma el cambio y los perdedores lo pierden repartido entre ellos.
    private function resultadoMultijugador(Partida $partida, array $datos, Request $request): Response
    {
        $equipoGanador = $datos['winner_team'] ?? -1;
        $equipos = collect($datos['jugadores'] ?? [])->mapWithKeys(fn ($j) => [(int) $j['uid'] => (int) $j['team']]);
        $ruta = null;
        if (! empty($datos['replay'])) {
            $ruta = "repeticiones/{$partida->codigo}.json";
            Storage::disk('local')->put($ruta, json_encode($request->input('replay'), JSON_UNESCAPED_UNICODE));
        }
        DB::transaction(function () use ($partida, $datos, $equipoGanador, $equipos, $ruta) {
            $partida = Partida::whereKey($partida->id)->lockForUpdate()->first();
            if ($partida->estado === Partida::FINALIZADA) {
                return;
            }
            $ids = $partida->jugadores()->pluck('users.id')->map(fn ($v) => (int) $v);
            // Solo cuentan los jugadores registrados en la sala; los equipos los informa el servidor de partidas firmado
            $valido = $equipoGanador >= 0 && $ids->every(fn ($id) => $equipos->has($id));
            $ganadores = $valido ? $ids->filter(fn ($id) => $equipos[$id] === $equipoGanador)->values() : collect();
            $perdedores = $valido ? $ids->reject(fn ($id) => $equipos[$id] === $equipoGanador)->values() : collect();
            $conElo = $valido && $ganadores->isNotEmpty() && $perdedores->isNotEmpty() && in_array($datos['reason'], ['victoria', 'abandono'], true) && $datos['ticks'] >= (int) config('game.elo_min_ticks', 1800);
            $cambio = 0;
            if ($conElo) {
                $elos = DB::table('users')->whereIn('id', $ids)->lockForUpdate()->pluck('elo', 'id');
                $g = $ganadores->avg(fn ($id) => $elos[$id] ?? 1000); $p = $perdedores->avg(fn ($id) => $elos[$id] ?? 1000);
                $cambio = max(1, (int) round(32 * (1 - 1 / (1 + 10 ** (($p - $g) / 400)))));
            }
            foreach ($ids as $id) {
                $gana = $ganadores->contains($id);
                $delta = $conElo ? ($gana ? $cambio : -max(1, (int) round($cambio * $ganadores->count() / $perdedores->count()))) : null;
                if ($delta !== null) {
                    DB::table('users')->where('id', $id)->update(['elo' => max(100, (int) ($elos[$id] ?? 1000) + $delta)]);
                }
                $partida->jugadores()->updateExistingPivot($id, ['resultado' => $valido ? ($gana ? 'victoria' : 'derrota') : null, 'elo_cambio' => $delta, 'equipo' => $equipos[$id] ?? null]);
            }
            $partida->update(['estado' => Partida::FINALIZADA, 'equipo_ganador' => $valido ? $equipoGanador : null, 'ganador_id' => $ganadores->first(),
                'motivo' => $datos['reason'], 'duracion_ticks' => $datos['ticks'], 'repeticion' => $ruta, 'elo_cambio' => $conElo ? $cambio : null, 'finalizada_at' => now()]);
        });
        try {
            broadcast(new SalasActualizadas('resultado'));
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->noContent();
    }

    // Elo estándar con K = 32. Devuelve los puntos que gana el vencedor (y pierde el vencido).
    private function actualizarElo(int $ganadorId, int $perdedorId): int
    {
        $g = DB::table('users')->where('id', $ganadorId)->lockForUpdate()->value('elo') ?? 1000;
        $p = DB::table('users')->where('id', $perdedorId)->lockForUpdate()->value('elo') ?? 1000;
        $esperado = 1 / (1 + 10 ** (($p - $g) / 400));
        $cambio = max(1, (int) round(32 * (1 - $esperado)));
        DB::table('users')->where('id', $ganadorId)->update(['elo' => $g + $cambio]);
        DB::table('users')->where('id', $perdedorId)->update(['elo' => max(100, $p - $cambio)]);

        return $cambio;
    }
}
