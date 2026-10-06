<?php

namespace App\Http\Controllers;

use App\Models\Amistad;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class AmistadController extends Controller
{
    // Solicitud por correo (formulario) o por id de jugador (botón en historial y escalafón).
    public function store(Request $request): RedirectResponse
    {
        $datos = $request->validate([
            'email' => ['required_without:jugador', 'nullable', 'email', 'max:255'],
            'jugador' => ['required_without:email', 'nullable', 'integer'],
        ]);
        $yo = $request->user();
        $otro = isset($datos['jugador'])
            ? User::find($datos['jugador'])
            : User::where('email', $datos['email'])->first();

        // Mensaje genérico: no revela si un correo está registrado.
        $generico = 'Si la cuenta existe, se envió la solicitud de amistad.';
        if (! $otro) {
            return back()->with('ok', $generico);
        }
        if ((int) $otro->id === (int) $yo->id) {
            return back()->with('error', 'No puede agregarse a sí mismo.');
        }

        $existente = Amistad::entre($yo->id, $otro->id)->first();
        if ($existente) {
            if ($existente->estado === Amistad::PENDIENTE && (int) $existente->destinatario_id === (int) $yo->id) {
                $existente->update(['estado' => Amistad::ACEPTADA]);

                return back()->with('ok', "Ahora {$otro->name} es su amigo.");
            }

            return back()->with('ok', $existente->estado === Amistad::ACEPTADA ? 'Ese jugador ya está en su lista de amigos.' : $generico);
        }

        Amistad::create(['solicitante_id' => $yo->id, 'destinatario_id' => $otro->id]);

        return back()->with('ok', isset($datos['jugador']) ? "Solicitud enviada a {$otro->name}." : $generico);
    }

    public function aceptar(Request $request, Amistad $amistad): RedirectResponse
    {
        abort_unless((int) $amistad->destinatario_id === (int) $request->user()->id && $amistad->estado === Amistad::PENDIENTE, 403);
        $amistad->update(['estado' => Amistad::ACEPTADA]);

        return back()->with('ok', 'Solicitud aceptada.');
    }

    // Rechazar, cancelar una solicitud enviada o eliminar a un amigo.
    public function destroy(Request $request, Amistad $amistad): RedirectResponse
    {
        $uid = (int) $request->user()->id;
        abort_unless(in_array($uid, [(int) $amistad->solicitante_id, (int) $amistad->destinatario_id], true), 403);
        $amistad->delete();

        return back()->with('ok', 'Lista de amigos actualizada.');
    }
}
