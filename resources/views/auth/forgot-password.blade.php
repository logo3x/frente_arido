<x-guest-layout>
    <h1>Recuperar contraseña</h1>
    <p class="bajada">Indique su correo y le enviaremos un enlace para elegir una contraseña nueva.</p>

    @if (session('status'))<div class="aviso ok" role="status">{{ session('status') }}</div>@endif

    <form method="POST" action="{{ route('password.email') }}" class="formulario">
        @csrf
        <div class="campo">
            <label for="email">Correo electrónico</label>
            <input id="email" type="email" name="email" value="{{ old('email') }}" required autofocus autocomplete="username" @error('email') aria-invalid="true" aria-describedby="email-error" @enderror>
            @error('email')<p class="error-campo" id="email-error">{{ $message }}</p>@enderror
        </div>
        <button class="btn primario grande">Enviar enlace</button>
    </form>

    <p class="acceso-pie"><a href="{{ route('login') }}">Volver a iniciar sesión</a></p>
</x-guest-layout>
