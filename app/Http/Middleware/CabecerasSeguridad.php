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
        $ws = parse_url((string) config('game.ws_url'), PHP_URL_SCHEME).'://'.parse_url((string) config('game.ws_url'), PHP_URL_HOST).(parse_url((string) config('game.ws_url'), PHP_URL_PORT) ? ':'.parse_url((string) config('game.ws_url'), PHP_URL_PORT) : '');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('Referrer-Policy', 'same-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        $response->headers->set('Content-Security-Policy', implode('; ', [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "connect-src 'self' {$ws}".(config('reverb.apps.apps.0.options.host') ? ' wss://'.config('reverb.apps.apps.0.options.host') : ''),
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
