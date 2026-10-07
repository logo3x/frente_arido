<?php

namespace App\Services;

use App\Models\Partida;
use App\Models\User;
use RuntimeException;

/**
 * Token de conexión al servidor de partidas.
 * Formato: base64url(json).base64url(hmac_sha256(payload, GAME_SECRET))
 * El servidor Node verifica la firma, la sala y la expiración.
 */
class GameToken
{
    public static function make(Partida $partida, User $user): string
    {
        $payload = self::b64(json_encode([
            'room' => $partida->codigo,
            'plazas' => (int) ($partida->plazas ?: 2),
            'modo' => $partida->modo === 'equipos' ? 'equipos' : 'todos',
            'uid' => (string) $user->id,
            'anf' => (int) $partida->anfitrion_id === (int) $user->id,   // el creador puede cerrar la sala desde el juego
            'name' => mb_substr($user->name, 0, 24),
            'exp' => time() + (int) config('game.token_ttl'),
        ], JSON_UNESCAPED_UNICODE));

        return $payload.'.'.self::b64(hash_hmac('sha256', $payload, self::secret(), true));
    }

    // Verifica la firma hexadecimal que el servidor envía en X-Game-Signature.
    public static function verificarCuerpo(string $cuerpo, ?string $firma): bool
    {
        return is_string($firma) && hash_equals(hash_hmac('sha256', $cuerpo, self::secret()), $firma);
    }

    // Clave compartida. Se exige una longitud mínima para que el HMAC no sea atacable por fuerza bruta.
    public static function secret(): string
    {
        $secret = (string) config('game.secret');
        if (strlen($secret) < 32) {
            throw new RuntimeException('GAME_SECRET debe tener al menos 32 caracteres (genere una con: php -r "echo bin2hex(random_bytes(32));")');
        }

        return $secret;
    }

    private static function b64(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }
}
