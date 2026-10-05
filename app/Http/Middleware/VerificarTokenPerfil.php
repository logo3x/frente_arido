<?php

namespace App\Http\Middleware;

use App\Services\PerfilToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Valida X-Perfil-Token y deja el id del usuario en el atributo "perfil_uid" de la petición. */
class VerificarTokenPerfil
{
    public function handle(Request $request, Closure $next): Response
    {
        $uid = PerfilToken::verify($request->header('X-Perfil-Token'));
        abort_if($uid === null, 401, 'Token de perfil inválido o vencido');
        $request->attributes->set('perfil_uid', $uid);

        return $next($request);
    }
}
