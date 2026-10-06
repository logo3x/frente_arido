<?php

namespace App\Http\Controllers;

use App\Models\Amistad;
use App\Models\Partida;
use App\Services\Carrera;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

class DashboardController extends Controller
{
    public function __invoke(Request $request, Carrera $carrera): View
    {
        $user = $request->user();
        $modo = $request->query('modo');
        $modo = array_key_exists($modo, Carrera::MODOS) ? $modo : null;

        // Amigos aceptados con su Elo y el balance de partidas en línea entre ambos
        $relaciones = Amistad::with(['solicitante:id,name,elo', 'destinatario:id,name,elo'])
            ->where(fn ($q) => $q->where('solicitante_id', $user->id)->orWhere('destinatario_id', $user->id))
            ->get();
        $amigos = $relaciones->where('estado', Amistad::ACEPTADA)
            ->map(fn (Amistad $a) => ['relacion' => $a, 'jugador' => $a->otro($user->id), 'balance' => $carrera->caraACara($user->id, $a->otro($user->id)->id)])
            ->sortByDesc(fn ($a) => $a['jugador']->elo)->values();
        $recibidas = $relaciones->where('estado', Amistad::PENDIENTE)->where('destinatario_id', $user->id)->values();
        $enviadas = $relaciones->where('estado', Amistad::PENDIENTE)->where('solicitante_id', $user->id)->values();
        $idsAmigos = $relaciones->map(fn (Amistad $a) => $a->otro($user->id)?->id)->filter()->all();

        // Retos directos de amigos que esperan respuesta y partidas propias activas
        $retos = Partida::with('anfitrion:id,name')->abiertas()->where('invitado_id', $user->id)
            ->where('created_at', '>=', now()->subHours(2))->latest()->get();
        $activas = Partida::with(['anfitrion:id,name', 'rival:id,name', 'invitado:id,name', 'jugadores:id,name'])
            ->whereIn('estado', [Partida::ESPERANDO, Partida::LISTA])
            ->delUsuario($user)
            ->latest()->get();

        $campania = DB::table('campania_progresos')->where('user_id', $user->id)->get()->keyBy('mision');

        return view('dashboard', [
            'resumen' => $carrera->resumen($user),
            'historial' => $carrera->historial($user, $modo, 15),
            'modo' => $modo,
            'escalafon' => $carrera->escalafon(10),
            'amigos' => $amigos,
            'recibidas' => $recibidas,
            'enviadas' => $enviadas,
            'idsAmigos' => $idsAmigos,
            'retos' => $retos,
            'activas' => $activas,
            'campania' => $campania,
        ]);
    }
}
