<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Exporta los datos del piloto en CSV, sin datos personales.
 * Cada usuario se identifica con un código seudónimo (HMAC del id con la APP_KEY), estable entre exportaciones.
 * Uso: php artisan juego:exportar-piloto --desde=2026-10-01 --hasta=2026-10-31
 */
class ExportarPiloto extends Command
{
    protected $signature = 'juego:exportar-piloto {--desde= : Fecha inicial (AAAA-MM-DD)} {--hasta= : Fecha final (AAAA-MM-DD)}';

    protected $description = 'Exporta partidas y avance de campaña del piloto en CSV seudonimizado';

    public function handle(): int
    {
        $desde = $this->option('desde') ?: '2000-01-01';
        $hasta = ($this->option('hasta') ?: now()->toDateString()).' 23:59:59';
        $codigo = fn ($id) => 'P-'.substr(hash_hmac('sha256', (string) $id, (string) config('app.key')), 0, 10);
        $fecha = now()->format('Ymd-His');

        $partidas = DB::table('registros_juego')->whereBetween('created_at', [$desde, $hasta])->orderBy('created_at')->get();
        $filas = [['participante', 'fecha', 'modo', 'faccion', 'resultado', 'duracion_s', 'mision', 'apm', 'fps']];
        foreach ($partidas as $r) {
            $filas[] = [$codigo($r->user_id), $r->created_at, $r->modo, $r->faccion, $r->resultado, $r->duracion, $r->mision, $r->apm, $r->fps];
        }
        Storage::disk('local')->put("piloto/partidas-{$fecha}.csv", $this->csv($filas));

        $avance = DB::table('campania_progresos')->whereBetween('updated_at', [$desde, $hasta])->orderBy('user_id')->get();
        $filas = [['participante', 'faccion', 'mision', 'estrellas', 'mejor_tiempo_s', 'dificultad', 'intentos']];
        foreach ($avance as $r) {
            $filas[] = [$codigo($r->user_id), $r->faccion, $r->mision, $r->estrellas, $r->mejor_tiempo, $r->dificultad, $r->intentos];
        }
        Storage::disk('local')->put("piloto/campania-{$fecha}.csv", $this->csv($filas));

        $this->info("Exportadas {$partidas->count()} partidas y {$avance->count()} registros de campaña en storage/app/piloto/.");

        return self::SUCCESS;
    }

    private function csv(array $filas): string
    {
        $h = fopen('php://temp', 'r+');
        fwrite($h, "\xEF\xBB\xBF");   // BOM para que Excel reconozca UTF-8
        foreach ($filas as $f) {
            fputcsv($h, $f);
        }
        rewind($h);

        return stream_get_contents($h);
    }
}
