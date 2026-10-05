<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Aviso al lobby de que cambió la lista de salas.
 * Se emite por el canal público "lobby" mediante Laravel Reverb.
 * Solo indica el tipo de cambio. Cada cliente vuelve a pedir el listado (respeta filtros por usuario).
 */
class SalasActualizadas implements ShouldBroadcastNow
{
    use Dispatchable;

    // 'salas' cuando cambia la lista; 'resultado' cuando termina una partida.
    public function __construct(public string $tipo = 'salas')
    {
    }

    public function broadcastWith(): array
    {
        return ['tipo' => $this->tipo];
    }

    public function broadcastOn(): Channel
    {
        return new Channel('lobby');
    }

    public function broadcastAs(): string
    {
        return 'salas.actualizadas';
    }
}
