<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

class Partida extends Model
{
    public const ESPERANDO = 'esperando';
    public const LISTA = 'lista';
    public const FINALIZADA = 'finalizada';
    public const CANCELADA = 'cancelada';

    protected $table = 'partidas';

    public const PLAZAS = [2, 4, 6, 8];

    protected $fillable = ['codigo', 'plazas', 'modo', 'anfitrion_id', 'rival_id', 'invitado_id', 'ganador_id', 'equipo_ganador', 'estado', 'motivo', 'duracion_ticks', 'repeticion', 'elo_cambio', 'finalizada_at'];

    protected $casts = ['finalizada_at' => 'datetime', 'plazas' => 'integer'];

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

    public function invitado(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invitado_id');
    }

    // Jugadores de las partidas de más de 2 (las de 2 usan anfitrion_id y rival_id)
    public function jugadores(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'partida_jugadores')->withPivot(['plaza', 'equipo', 'resultado', 'elo_cambio'])->withTimestamps()->orderBy('partida_jugadores.plaza');
    }

    public function esMultijugador(): bool
    {
        return (int) $this->plazas > 2;
    }

    public function scopeAbiertas(Builder $q): Builder
    {
        return $q->where('estado', self::ESPERANDO)->where(fn ($w) => $w->where('plazas', '>', 2)->orWhereNull('rival_id'));
    }

    // Partidas en las que participa el usuario (anfitrión, rival o jugador de una sala de más de 2)
    public function scopeDelUsuario(Builder $q, User $user): Builder
    {
        return $q->where(fn ($w) => $w->where('anfitrion_id', $user->id)->orWhere('rival_id', $user->id)
            ->orWhereHas('jugadores', fn ($j) => $j->where('users.id', $user->id)));
    }

    public function ocupadas(): int
    {
        return $this->esMultijugador() ? $this->jugadores()->count() : ($this->rival_id ? 2 : 1);
    }

    // Texto de jugadores para las tablas
    public function nombresJugadores(): string
    {
        if (! $this->esMultijugador()) {
            return ($this->anfitrion->name ?? '—').' vs '.($this->rival?->name ?? '—');
        }
        $nombres = $this->jugadores->map(fn ($u) => $u->name.($this->modo === 'equipos' ? ' (eq. '.($u->pivot->equipo + 1).')' : ''));

        return $nombres->implode(', ').' · '.$this->jugadores->count().'/'.$this->plazas;
    }

    // victoria | derrota | sin_resultado para un usuario
    public function resultadoPara(User $user): string
    {
        if ($this->esMultijugador()) {
            $j = $this->jugadores->firstWhere('id', $user->id);

            return $j && $j->pivot->resultado ? $j->pivot->resultado : 'sin_resultado';
        }
        if ($this->ganador_id === null) {
            return 'sin_resultado';
        }

        return (int) $this->ganador_id === (int) $user->id ? 'victoria' : 'derrota';
    }

    // Cambio de Elo (con signo) para un usuario
    public function eloPara(User $user): ?int
    {
        if ($this->esMultijugador()) {
            $j = $this->jugadores->firstWhere('id', $user->id);

            return $j ? $j->pivot->elo_cambio : null;
        }
        if (! $this->elo_cambio) {
            return null;
        }

        return $this->resultadoPara($user) === 'victoria' ? (int) $this->elo_cambio : -(int) $this->elo_cambio;
    }

    // Salas visibles para un usuario: públicas o retos dirigidos a él.
    public function scopeVisiblesPara(Builder $q, User $user): Builder
    {
        return $q->where(fn ($w) => $w->whereNull('invitado_id')->orWhere('invitado_id', $user->id));
    }

    public function puedeUnirse(User $user): bool
    {
        return $this->invitado_id === null || (int) $this->invitado_id === (int) $user->id;
    }

    public function participa(User $user): bool
    {
        return in_array((int) $user->id, [(int) $this->anfitrion_id, (int) $this->rival_id], true)
            || ($this->esMultijugador() && $this->jugadores()->where('users.id', $user->id)->exists());
    }

    public static function nuevoCodigo(): string
    {
        do {
            $codigo = strtoupper(Str::random(6));
        } while (static::where('codigo', $codigo)->exists());

        return $codigo;
    }
}
