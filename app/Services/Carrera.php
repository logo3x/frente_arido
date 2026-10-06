<?php

namespace App\Services;

use App\Models\Partida;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Carrera del comandante: experiencia, nivel, estadísticas, historial unificado y escalafón.
 *
 * La experiencia se calcula en Laravel a partir de datos que el cliente no decide:
 * partidas en línea (las registra el servidor de partidas), estrellas de campaña (verificadas por
 * re-simulación) y escaramuzas del cliente con duración mínima y peso bajo.
 */
class Carrera
{
    public const MODOS = ['online' => 'En línea', 'mision' => 'Campaña', 'solo' => 'Escaramuza'];

    public function resumen(User $user): array
    {
        $cfg = config('game.carrera');
        $online = $this->partidasOnline($user)->get();
        $minTicks = (int) config('game.elo_min_ticks', 1800);

        $ganadas = $online->filter(fn ($p) => $p->resultadoPara($user) === 'victoria')->count();
        $perdidas = $online->filter(fn ($p) => $p->resultadoPara($user) === 'derrota')->count();
        $validas = $online->filter(fn ($p) => $p->resultadoPara($user) !== 'sin_resultado' && $p->duracion_ticks >= $minTicks);
        $xpOnline = $validas->sum(fn ($p) => $p->resultadoPara($user) === 'victoria' ? $cfg['xp']['online_victoria'] : $cfg['xp']['online_derrota']);

        $campania = DB::table('campania_progresos')->where('user_id', $user->id)->get();
        $contables = config('game.validar_campania', true) ? $campania->where('verificada', true) : $campania;
        $xpCampania = $contables->sum('estrellas') * $cfg['xp']['estrella'];

        $escaramuzas = DB::table('registros_juego')->where('user_id', $user->id)->where('modo', 'solo')
            ->selectRaw("SUM(CASE WHEN resultado = 'victoria' THEN 1 ELSE 0 END) AS v")
            ->selectRaw("SUM(CASE WHEN resultado = 'derrota' THEN 1 ELSE 0 END) AS d")
            ->selectRaw("SUM(CASE WHEN resultado = 'victoria' AND duracion >= ? THEN 1 ELSE 0 END) AS vx", [$cfg['escaramuza_min_s']])
            ->selectRaw("SUM(CASE WHEN resultado = 'derrota' AND duracion >= ? THEN 1 ELSE 0 END) AS dx", [$cfg['escaramuza_min_s']])
            ->first();
        $xpEscaramuza = (int) $escaramuzas->vx * $cfg['xp']['escaramuza_victoria'] + (int) $escaramuzas->dx * $cfg['xp']['escaramuza_derrota'];

        $xp = $xpOnline + $xpCampania + $xpEscaramuza;
        $totalMisiones = collect(config('game.misiones'))->flatten()->count();

        return [
            'xp' => $xp,
            'xp_detalle' => ['En línea' => $xpOnline, 'Campaña' => $xpCampania, 'Escaramuza' => $xpEscaramuza],
            'nivel' => $this->nivel($xp),
            'elo' => (int) ($user->elo ?? 1000),
            'posicion' => User::where('elo', '>', $user->elo ?? 1000)->count() + 1,
            'online' => ['jugadas' => $online->count(), 'victorias' => $ganadas, 'derrotas' => $perdidas],
            'escaramuza' => ['victorias' => (int) $escaramuzas->v, 'derrotas' => (int) $escaramuzas->d],
            'estrellas' => (int) $campania->sum('estrellas'),
            'estrellas_max' => $totalMisiones * 3,
            'misiones' => $campania->count(),
            'misiones_max' => $totalMisiones,
            'racha' => $this->racha($this->historial($user, null, 30)),
        ];
    }

    // Nivel de carrera según la experiencia acumulada, con el avance hacia el siguiente.
    public function nivel(int $xp): array
    {
        $niveles = config('game.carrera.niveles');
        $i = 0;
        foreach ($niveles as $k => $n) {
            if ($xp >= $n['xp']) {
                $i = $k;
            }
        }
        $actual = $niveles[$i];
        $siguiente = $niveles[$i + 1] ?? null;

        return [
            'numero' => $i + 1,
            'nombre' => $actual['nombre'],
            'desde' => $actual['xp'],
            'hasta' => $siguiente['xp'] ?? null,
            'siguiente' => $siguiente['nombre'] ?? null,
            'progreso' => $siguiente ? (int) floor(100 * ($xp - $actual['xp']) / ($siguiente['xp'] - $actual['xp'])) : 100,
        ];
    }

    /**
     * Historial unificado: partidas en línea (servidor) y partidas del cliente (escaramuza y campaña).
     * Cada elemento: fecha, modo, resultado, rival, faccion, duracion (s), elo, detalle, repeticion.
     */
    public function historial(User $user, ?string $modo = null, int $limite = 20): Collection
    {
        $items = collect();

        if ($modo === null || $modo === 'online') {
            $this->partidasOnline($user)->with(['anfitrion:id,name', 'rival:id,name'])
                ->latest('finalizada_at')->limit($limite)->get()
                ->each(function (Partida $p) use ($user, $items) {
                    $soyAnfitrion = (int) $p->anfitrion_id === (int) $user->id;
                    $rival = $p->esMultijugador() ? null : ($soyAnfitrion ? $p->rival : $p->anfitrion);
                    $res = $p->resultadoPara($user); $gane = $res === 'victoria';
                    $items->push([
                        'fecha' => $p->finalizada_at ?? $p->updated_at,
                        'modo' => 'online',
                        'resultado' => $res,
                        'rival' => $p->esMultijugador() ? ($p->plazas.' jugadores'.($p->modo === 'equipos' ? ' por equipos' : '')) : ($rival?->name ?? 'Sin rival'),
                        'rival_id' => $rival?->id,
                        'faccion' => null,
                        'duracion' => (int) round(($p->duracion_ticks ?? 0) / 15),
                        'elo' => $p->eloPara($user),
                        'detalle' => $p->motivo === 'abandono' ? 'Por abandono' : ($res === 'sin_resultado' ? 'Sin ganador' : null),
                        'repeticion' => $p->repeticion ? route('lobby.ver', $p) : null,
                    ]);
                });
        }

        if ($modo === null || in_array($modo, ['solo', 'mision'], true)) {
            $nombres = config('game.nombres_mision');
            DB::table('registros_juego')->where('user_id', $user->id)
                ->when($modo, fn ($q) => $q->where('modo', $modo), fn ($q) => $q->whereIn('modo', ['solo', 'mision']))
                ->latest('created_at')->limit($limite)->get()
                ->each(function ($r) use ($items, $nombres) {
                    $items->push([
                        'fecha' => Carbon::parse($r->created_at),
                        'modo' => $r->modo,
                        'resultado' => $r->resultado,
                        'rival' => $r->rival,
                        'rival_id' => null,
                        'faccion' => $r->faccion,
                        'duracion' => (int) $r->duracion,
                        'elo' => null,
                        'detalle' => $r->mision ? ($nombres[$r->mision] ?? $r->mision) : null,
                        'repeticion' => null,
                    ]);
                });
        }

        return $items->sortByDesc('fecha')->take($limite)->values();
    }

    // Escalafón por Elo. Solo jugadores con actividad en línea (o Elo distinto del inicial).
    public function escalafon(int $limite = 10): Collection
    {
        return User::query()
            ->select('users.id', 'users.name', 'users.elo', DB::raw('COUNT(partidas.id) AS victorias'))
            ->leftJoin('partidas', function ($j) {
                $j->on('partidas.ganador_id', '=', 'users.id')->where('partidas.estado', Partida::FINALIZADA);
            })
            ->groupBy('users.id', 'users.name', 'users.elo')
            ->havingRaw('COUNT(partidas.id) > 0 OR users.elo <> 1000')
            ->orderByDesc('users.elo')->orderByDesc('victorias')
            ->limit($limite)->get();
    }

    // Balance de partidas en línea entre dos jugadores: [victorias de $a, victorias de $b].
    public function caraACara(int $a, int $b): array
    {
        $filas = Partida::where('estado', Partida::FINALIZADA)
            ->where(fn ($q) => $q->where(fn ($w) => $w->where('anfitrion_id', $a)->where('rival_id', $b))
                ->orWhere(fn ($w) => $w->where('anfitrion_id', $b)->where('rival_id', $a)))
            ->pluck('ganador_id');

        return [$filas->filter(fn ($g) => (int) $g === $a)->count(), $filas->filter(fn ($g) => (int) $g === $b)->count()];
    }

    private function partidasOnline(User $user)
    {
        return Partida::where('estado', Partida::FINALIZADA)->delUsuario($user)->with('jugadores:id,name');
    }

    // Racha actual: resultados iguales consecutivos más recientes (ignora partidas sin resultado).
    private function racha(Collection $historial): ?array
    {
        $tipo = null;
        $n = 0;
        foreach ($historial as $h) {
            if (! in_array($h['resultado'], ['victoria', 'derrota'], true)) {
                continue;
            }
            if ($tipo === null) {
                $tipo = $h['resultado'];
            }
            if ($h['resultado'] !== $tipo) {
                break;
            }
            $n++;
        }

        return $tipo ? ['tipo' => $tipo, 'n' => $n] : null;
    }
}
