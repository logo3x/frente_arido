<?php

namespace App\Services;

use App\Models\User;
use RuntimeException;

/**
 * Token del perfil de campaña. Permite al cliente del juego leer y guardar el progreso del usuario
 * sin cookies de sesión ni CSRF: viaja en la cabecera X-Perfil-Token y vence en pocas horas.
 * Formato: base64url(json).base64url(hmac_sha256(payload, GAME_SECRET)), con alcance "perfil".
 */
class PerfilToken
{
    public static function make(User $user): string
    {
        $payload = self::b64(json_encode([
            'scope' => 'perfil',
            'uid' => (string) $user->id,
            'exp' => time() + (int) config('game.perfil_ttl', 7200),
        ]));

        return $payload.'.'.self::b64(hash_hmac('sha256', $payload, GameToken::secret(), true));
    }

    /** Devuelve el id del usuario si el token es válido; null en otro caso. */
    public static function verify(?string $token): ?int
    {
        if (! is_string($token) || substr_count($token, '.') !== 1 || strlen($token) > 512) {
            return null;
        }
        [$payload, $sig] = explode('.', $token);
        $expected = self::b64(hash_hmac('sha256', $payload, GameToken::secret(), true));
        if (! hash_equals($expected, $sig)) {
            return null;
        }
        $data = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
        if (! is_array($data) || ($data['scope'] ?? null) !== 'perfil' || ($data['exp'] ?? 0) < time() || ! ctype_digit((string) ($data['uid'] ?? ''))) {
            return null;
        }

        return (int) $data['uid'];
    }

    private static function b64(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }
}
