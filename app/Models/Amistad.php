<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Amistad extends Model
{
    public const PENDIENTE = 'pendiente';
    public const ACEPTADA = 'aceptada';

    protected $table = 'amistades';

    protected $fillable = ['solicitante_id', 'destinatario_id', 'estado'];

    public function solicitante(): BelongsTo
    {
        return $this->belongsTo(User::class, 'solicitante_id');
    }

    public function destinatario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'destinatario_id');
    }

    // Relación entre dos usuarios, sin importar quién la inició.
    public function scopeEntre(Builder $q, int $a, int $b): Builder
    {
        return $q->where(fn ($o) => $o
            ->where(fn ($w) => $w->where('solicitante_id', $a)->where('destinatario_id', $b))
            ->orWhere(fn ($w) => $w->where('solicitante_id', $b)->where('destinatario_id', $a)));
    }

    public function otro(int $userId): ?User
    {
        return (int) $this->solicitante_id === $userId ? $this->destinatario : $this->solicitante;
    }
}
