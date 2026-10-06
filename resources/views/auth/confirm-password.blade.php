<x-guest-layout>
    <h1>Confirme su contraseña</h1>
    <p class="bajada">Esta es una zona protegida. Ingrese su contraseña para continuar.</p>

    <form method="POST" action="{{ route('password.confirm') }}" class="formulario">
        @csrf
        <div class="campo">
            <label for="password">Contraseña</label>
            <input id="password" type="password" name="password" required autofocus autocomplete="current-password" @error('password') aria-invalid="true" aria-describedby="password-error" @enderror>
            @error('password')<p class="error-campo" id="password-error">{{ $message }}</p>@enderror
        </div>
        <button class="btn primario grande">Confirmar</button>
    </form>
</x-guest-layout>
