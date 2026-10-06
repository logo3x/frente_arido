<x-guest-layout>
    <h1>Crear cuenta</h1>
    <p class="bajada">Con una cuenta se guardan la campaña, el historial, los amigos y el Elo.</p>

    <form method="POST" action="{{ route('register') }}" class="formulario">
        @csrf
        <div class="campo">
            <label for="name">Nombre de comandante</label>
            <input id="name" type="text" name="name" value="{{ old('name') }}" required autofocus autocomplete="nickname" maxlength="255" @error('name') aria-invalid="true" aria-describedby="name-error" @enderror>
            @error('name')<p class="error-campo" id="name-error">{{ $message }}</p>@enderror
        </div>
        <div class="campo">
            <label for="email">Correo electrónico</label>
            <input id="email" type="email" name="email" value="{{ old('email') }}" required autocomplete="username" @error('email') aria-invalid="true" aria-describedby="email-error" @enderror>
            @error('email')<p class="error-campo" id="email-error">{{ $message }}</p>@enderror
        </div>
        <div class="campo">
            <label for="password">Contraseña</label>
            <input id="password" type="password" name="password" required autocomplete="new-password" @error('password') aria-invalid="true" aria-describedby="password-error" @enderror>
            @error('password')<p class="error-campo" id="password-error">{{ $message }}</p>@enderror
        </div>
        <div class="campo">
            <label for="password_confirmation">Confirme la contraseña</label>
            <input id="password_confirmation" type="password" name="password_confirmation" required autocomplete="new-password">
            @error('password_confirmation')<p class="error-campo">{{ $message }}</p>@enderror
        </div>
        <button class="btn primario grande">Crear cuenta</button>
    </form>

    <p class="acceso-pie">¿Ya tiene cuenta? <a href="{{ route('login') }}">Inicie sesión</a></p>
</x-guest-layout>
