<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

/**
 * Progreso de campaña e historial del cliente del juego. Autenticación por X-Perfil-Token.
 * Desde la v0.8 el servidor de partidas vuelve a simular cada misión con la definición oficial antes de registrarla.
 * Las estrellas y el tiempo que se guardan son los del validador, no los que declara el cliente.
 */
class ProgresoController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $uid = $request->attributes->get('perfil_uid');
        $user = User::findOrFail($uid);

        $campania = ['atlas' => (object) [], 'hierro' => (object) [], 'guerrilla' => (object) []];
        foreach (DB::table('campania_progresos')->where('user_id', $uid)->get() as $r) {
            $campania[$r->faccion] = (array) $campania[$r->faccion];
            $campania[$r->faccion][$r->mision] = ['estrellas' => $r->estrellas, 'mejor' => $r->mejor_tiempo, 'dificultad' => $r->dificultad];
        }

        $historial = DB::table('registros_juego')->where('user_id', $uid)->latest('created_at')->limit(50)->get()
            ->map(fn ($r) => ['fecha' => (string) $r->created_at, 'modo' => $r->modo, 'faccion' => $r->faccion, 'rival' => $r->rival,
                'resultado' => $r->resultado, 'duracion' => $r->duracion, 'mision' => $r->mision, 'apm' => $r->apm ?? null, 'fps' => $r->fps ?? null]);

        $stats = DB::table('registros_juego')->where('user_id', $uid)
            ->selectRaw("COUNT(*) AS partidas, SUM(CASE WHEN resultado = 'victoria' THEN 1 ELSE 0 END) AS victorias")->first();

        return response()->json([
            'nombre' => mb_substr($user->name, 0, 24),
            'campania' => $campania,
            'historial' => $historial,
            'stats' => ['partidas' => (int) $stats->partidas, 'victorias' => (int) $stats->victorias],
        ]);
    }

    public function mision(Request $request): JsonResponse
    {
        $uid = $request->attributes->get('perfil_uid');
        $misiones = config('game.misiones');
        $datos = $request->validate([
            'faccion' => ['required', Rule::in(array_keys($misiones))],
            'mision' => ['required', 'string', 'max:20'],
            'estrellas' => ['required', 'integer', 'between:1,3'],
            'segundos' => ['required', 'integer', 'between:20,14400'],
            'dificultad' => ['required', Rule::in(['facil', 'normal', 'dificil'])],
            'version' => ['required', 'string', 'max:10'],
            'ticks' => ['required', 'integer', 'between:1,54000'],
            'log' => ['present', 'array', 'max:20000'],
        ]);
        abort_unless(in_array($datos['mision'], $misiones[$datos['faccion']], true), 422, 'Misión desconocida');

        // Orden de la campaña: no se acepta una misión si la anterior no está completada
        $idx = array_search($datos['mision'], $misiones[$datos['faccion']], true);
        if ($idx > 0) {
            $previa = $misiones[$datos['faccion']][$idx - 1];
            abort_unless(DB::table('campania_progresos')->where('user_id', $uid)->where('mision', $previa)->exists(), 422, 'La misión anterior no está completada');
        }

        // Verificación en el servidor de partidas (re-simulación de la misión)
        $verificada = false;
        $url = config('game.validator_url');
        if ($url) {
            $cuerpo = json_encode(['mision' => $datos['mision'], 'dificultad' => $datos['dificultad'], 'version' => $datos['version'],
                'ticks' => $datos['ticks'], 'log' => $request->input('log')]);
            try {
                $r = Http::withHeaders(['X-Game-Signature' => hash_hmac('sha256', $cuerpo, \App\Services\GameToken::secret())])
                    ->withBody($cuerpo, 'application/json')->timeout(40)->post($url);
                $res = $r->json();
            } catch (\Throwable $e) {
                Log::warning('Validador de misiones no disponible: '.$e->getMessage());
                $res = null;
            }
            if (is_array($res) && ($res['ok'] ?? false) === true) {
                $verificada = true;
                $datos['estrellas'] = max(1, min(3, (int) $res['estrellas']));
                $datos['segundos'] = max(1, (int) $res['segundos']);
            } elseif (is_array($res)) {
                abort(422, 'La misión no superó la verificación: '.($res['motivo'] ?? 'resultado distinto'));
            } elseif (config('game.validar_campania')) {
                abort(503, 'El validador de misiones no está disponible. Intente más tarde.');
            }
        }

        DB::transaction(function () use ($uid, $datos, $verificada) {
            $actual = DB::table('campania_progresos')->where('user_id', $uid)->where('mision', $datos['mision'])->lockForUpdate()->first();
            if (! $actual) {
                DB::table('campania_progresos')->insert([
                    'user_id' => $uid, 'faccion' => $datos['faccion'], 'mision' => $datos['mision'], 'estrellas' => $datos['estrellas'],
                    'mejor_tiempo' => $datos['segundos'], 'dificultad' => $datos['dificultad'], 'intentos' => 1, 'verificada' => $verificada,
                    'created_at' => now(), 'updated_at' => now(),
                ]);

                return;
            }
            DB::table('campania_progresos')->where('id', $actual->id)->update([
                'estrellas' => max($actual->estrellas, $datos['estrellas']),
                'mejor_tiempo' => min($actual->mejor_tiempo, $datos['segundos']),
                'dificultad' => $datos['estrellas'] >= $actual->estrellas ? $datos['dificultad'] : $actual->dificultad,
                'intentos' => $actual->intentos + 1,
                'verificada' => $actual->verificada || $verificada,
                'updated_at' => now(),
            ]);
        });

        return response()->json(['estrellas' => $datos['estrellas'], 'segundos' => $datos['segundos'], 'verificada' => $verificada]);
    }

    public function registro(Request $request): Response
    {
        $uid = $request->attributes->get('perfil_uid');
        $datos = $request->validate([
            'modo' => ['required', Rule::in(['solo', 'mision'])],           // las partidas en línea las registra el servidor
            'faccion' => ['required', Rule::in(['atlas', 'hierro', 'guerrilla'])],
            'rival' => ['required', 'string', 'max:60'],
            'resultado' => ['required', Rule::in(['victoria', 'derrota', 'anulada'])],
            'duracion' => ['required', 'integer', 'between:0,14400'],
            'mision' => ['nullable', 'string', 'max:20'],
            'apm' => ['nullable', 'integer', 'between:0,1000'],
            'fps' => ['nullable', 'integer', 'between:0,240'],
        ]);
        DB::table('registros_juego')->insert([
            'user_id' => $uid, 'modo' => $datos['modo'], 'faccion' => $datos['faccion'],
            'rival' => strip_tags($datos['rival']), 'resultado' => $datos['resultado'], 'duracion' => $datos['duracion'],
            'mision' => $datos['mision'] ?? null, 'apm' => $datos['apm'] ?? null, 'fps' => $datos['fps'] ?? null, 'created_at' => now(),
        ]);
        // Retención: se conservan los 200 registros más recientes por usuario
        $corte = DB::table('registros_juego')->where('user_id', $uid)->orderByDesc('id')->skip(200)->value('id');
        if ($corte) {
            DB::table('registros_juego')->where('user_id', $uid)->where('id', '<=', $corte)->delete();
        }

        return response()->noContent();
    }
}
