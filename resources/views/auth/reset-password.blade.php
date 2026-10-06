<x-guest-layout>
    <h1>Nueva contraseña</h1>
    <p class="bajada">Elija una contraseña nueva para su cuenta.</p>

    <form method="POST" action="{{ route('password.store') }}" class="formulario">
        @csrf
        <input type="hidden" name="token" value="{{ $request->route('token') }}">
        <div class="campo">
            <label for="email">Correo electrónico</label>
            <input id="email" type="email" name="email" value="{{ old('email', $request->email) }}" required autofocus autocomplete="username" @error('email') aria-invalid="true" aria-describedby="email-error" @enderror>
            @error('email')<p class="error-campo" id="email-error">{{ $message }}</p>@enderror
        </div>
        <div class="campo">
            <label for="password">Contraseña nueva</label>
            <input id="password" type="password" name="password" required autocomplete="new-password" @error('password') aria-invalid="true" aria-describedby="password-error" @enderror>
            @error('password')<p class="error-campo" id="password-error">{{ $message }}</p>@enderror
        </div>
        <div class="campo">
            <label for="password_confirmation">Confirme la contraseña</label>
            <input id="password_confirmation" type="password" name="password_confirmation" required autocomplete="new-password">
            @error('password_confirmation')<p class="error-campo">{{ $message }}</p>@enderror
        </div>
        <button class="btn primario grande">Guardar contraseña</button>
    </form>
</x-guest-layout>
