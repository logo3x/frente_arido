<x-guest-layout>
    <h1>Verifique su correo</h1>
    <p class="bajada">Le enviamos un enlace de verificación. Ábralo para activar su cuenta. Si no lo recibió, puede pedir otro.</p>

    @if (session('status') == 'verification-link-sent')
        <div class="aviso ok" role="status">Se envió un nuevo enlace al correo que registró.</div>
    @endif

    <form method="POST" action="{{ route('verification.send') }}" class="formulario">
        @csrf
        <button class="btn primario grande">Reenviar el enlace</button>
    </form>

    <form method="POST" action="{{ route('logout') }}" class="acceso-pie">
        @csrf
        <button class="btn fantasma">Cerrar sesión</button>
    </form>
</x-guest-layout>
