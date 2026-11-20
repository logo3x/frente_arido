<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cabeceras de seguridad. Desde la v0.8 el cliente carga three.js y su código desde el mismo dominio:
 * la política de scripts no necesita 'unsafe-inline' ni dominios externos. Ajustar GAME_WS_URL y REVERB_HOST según el despliegue.
 */
class CabecerasSeguridad
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        // Origen del servidor de partidas para connect-src. Si GAME_WS_URL es relativa (/ws tras el proxy de IIS), basta 'self'.
        $u = parse_url((string) config('game.ws_url')) ?: [];
        $ws = isset($u['scheme'], $u['host']) && in_array($u['scheme'], ['ws', 'wss'], true)
            ? $u['scheme'].'://'.$u['host'].(isset($u['port']) ? ':'.$u['port'] : '')
            : '';
        // En desarrollo (npm run dev) Vite deja su dirección en public/hot: se permite solo ese origen y su WebSocket
        $vite = '';
        if (is_file(public_path('hot'))) {
            $h = parse_url(trim((string) file_get_contents(public_path('hot'))));
            if (isset($h['scheme'], $h['host']) && in_array($h['scheme'], ['http', 'https'], true)) {
                $origen = $h['host'].(isset($h['port']) ? ':'.$h['port'] : '');
                $vite = " {$h['scheme']}://{$origen}";
                $ws .= ' '.($h['scheme'] === 'https' ? 'wss' : 'ws')."://{$origen}{$vite}";
            }
        }
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('Referrer-Policy', 'same-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        $response->headers->set('Content-Security-Policy', implode('; ', [
            "default-src 'self'",
            "script-src 'self'{$vite}",
            "style-src 'self' 'unsafe-inline'{$vite}",
            "img-src 'self' data: blob:",
            trim("connect-src 'self' {$ws}").(config('reverb.apps.apps.0.options.host') ? ' wss://'.config('reverb.apps.apps.0.options.host') : ''),
            "object-src 'none'",
            "frame-ancestors 'self'",
            "base-uri 'self'",
            "form-action 'self'",
        ]));
        if ($request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
