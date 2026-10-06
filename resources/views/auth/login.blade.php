<x-guest-layout>
    <h1>Iniciar sesión</h1>
    <p class="bajada">Ingrese con su correo para continuar su campaña y jugar en línea.</p>

    @if (session('status'))<div class="aviso ok" role="status">{{ session('status') }}</div>@endif

    <form method="POST" action="{{ route('login') }}" class="formulario">
        @csrf
        <div class="campo">
            <label for="email">Correo electrónico</label>
            <input id="email" type="email" name="email" value="{{ old('email') }}" required autofocus autocomplete="username" @error('email') aria-invalid="true" aria-describedby="email-error" @enderror>
            @error('email')<p class="error-campo" id="email-error">{{ $message }}</p>@enderror
        </div>
        <div class="campo">
            <label for="password">Contraseña</label>
            <input id="password" type="password" name="password" required autocomplete="current-password" @error('password') aria-invalid="true" aria-describedby="password-error" @enderror>
            @error('password')<p class="error-campo" id="password-error">{{ $message }}</p>@enderror
        </div>
        <div class="linea">
            <label class="casilla"><input type="checkbox" name="remember"> Mantener la sesión</label>
            @if (Route::has('password.request'))<a href="{{ route('password.request') }}">¿Olvidó su contraseña?</a>@endif
        </div>
        <button class="btn primario grande">Ingresar</button>
    </form>

    <p class="acceso-pie">
        ¿No tiene cuenta? <a href="{{ route('register') }}">Cree una gratis</a> ·
        <a href="{{ config('game.client_url') }}?modo=escaramuza">Probar sin cuenta</a>
    </p>
</x-guest-layout>
