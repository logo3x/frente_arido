<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Partida extends Model
{
    public const ESPERANDO = 'esperando';
    public const LISTA = 'lista';
    public const FINALIZADA = 'finalizada';
    public const CANCELADA = 'cancelada';

    protected $table = 'partidas';

    protected $fillable = ['codigo', 'anfitrion_id', 'rival_id', 'ganador_id', 'estado', 'motivo', 'duracion_ticks', 'repeticion', 'elo_cambio', 'finalizada_at'];

    protected $casts = ['finalizada_at' => 'datetime'];

    // Las rutas usan el código de sala en lugar del id.
    public function getRouteKeyName(): string
    {
        return 'codigo';
    }

    public function anfitrion(): BelongsTo
    {
        return $this->belongsTo(User::class, 'anfitrion_id');
    }

    public function rival(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rival_id');
    }

    public function ganador(): BelongsTo
    {
        return $this->belongsTo(User::class, 'ganador_id');
    }

    public function scopeAbiertas(Builder $q): Builder
    {
        return $q->where('estado', self::ESPERANDO)->whereNull('rival_id');
    }

    public function participa(User $user): bool
    {
        return in_array((int) $user->id, [(int) $this->anfitrion_id, (int) $this->rival_id], true);
    }

    public static function nuevoCodigo(): string
    {
        do {
            $codigo = strtoupper(Str::random(6));
        } while (static::where('codigo', $codigo)->exists());

        return $codigo;
    }
}
