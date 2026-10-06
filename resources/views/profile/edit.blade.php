@php
    $n = $resumen['nivel'];
    $sinVerificar = $user instanceof \Illuminate\Contracts\Auth\MustVerifyEmail && ! $user->hasVerifiedEmail();
@endphp
<x-layouts.sitio titulo="Cuenta" :errores-globales="false">
    <header class="cabecera-pagina">
        <p class="etiqueta">Configuración</p>
        <h1>Cuenta</h1>
    </header>

    <div class="cuenta">
        <aside class="cuenta-resumen bloque" aria-label="Resumen del comandante">
            <div class="insignia chica" aria-hidden="true"><span>{{ $n['numero'] }}</span></div>
            <strong>{{ $user->name }}</strong>
            <span class="grado">{{ $n['nombre'] }} · {{ number_format($resumen['xp'], 0, ',', '.') }} XP</span>
            <dl>
                <div><dt>Elo</dt><dd>{{ $resumen['elo'] }}</dd></div>
                <div><dt>Partidas en línea</dt><dd>{{ $resumen['online']['jugadas'] }}</dd></div>
                <div><dt>Estrellas</dt><dd>{{ $resumen['estrellas'] }} / {{ $resumen['estrellas_max'] }}</dd></div>
                <div><dt>Miembro desde</dt><dd>{{ $user->created_at?->translatedFormat('F \d\e Y') ?? '—' }}</dd></div>
            </dl>
            <a class="btn" href="{{ route('dashboard') }}">Volver al panel</a>
        </aside>

        <div class="cuenta-secciones">
            {{-- Datos del comandante --}}
            <section class="bloque" aria-labelledby="datos-titulo">
                <header class="bloque-cab bloque-cab-texto">
                    <h2 id="datos-titulo">Datos del comandante</h2>
                    <p>El nombre se muestra en el escalafón, en el historial de sus rivales y en su lista de amigos.</p>
                </header>

                @if (session('status') === 'profile-updated')<div class="aviso ok" role="status">Datos guardados.</div>@endif

                <form method="POST" action="{{ route('profile.update') }}" class="formulario">
                    @csrf
                    @method('PATCH')
                    <div class="campo">
                        <label for="name">Nombre visible</label>
                        <input id="name" name="name" type="text" value="{{ old('name', $user->name) }}" required maxlength="255" autocomplete="nickname" @error('name') aria-invalid="true" aria-describedby="name-error" @enderror>
                        @error('name')<p class="error-campo" id="name-error">{{ $message }}</p>@enderror
                    </div>
                    <div class="campo">
                        <label for="email">Correo electrónico</label>
                        <input id="email" name="email" type="email" value="{{ old('email', $user->email) }}" required maxlength="255" autocomplete="username" @error('email') aria-invalid="true" aria-describedby="email-error" @enderror>
                        <p class="ayuda">Sus amigos pueden enviarle solicitudes con este correo. No se muestra a otros jugadores.</p>
                        @error('email')<p class="error-campo" id="email-error">{{ $message }}</p>@enderror
                        @if ($sinVerificar)
                            <p class="ayuda alerta">
                                Su correo no está verificado.
                                <button form="reenviar-verificacion" class="enlace">Reenviar el correo de verificación</button>
                            </p>
                            @if (session('status') === 'verification-link-sent')<p class="ayuda bien">Se envió un nuevo enlace de verificación.</p>@endif
                        @endif
                    </div>
                    <div class="acciones-form"><button class="btn primario">Guardar cambios</button></div>
                </form>
                @if ($sinVerificar)
                    <form id="reenviar-verificacion" method="POST" action="{{ route('verification.send') }}">@csrf</form>
                @endif
            </section>

            {{-- Contraseña --}}
            <section class="bloque" aria-labelledby="clave-titulo">
                <header class="bloque-cab bloque-cab-texto">
                    <h2 id="clave-titulo">Contraseña</h2>
                    <p>Use una contraseña larga que no utilice en otros sitios.</p>
                </header>

                @if (session('status') === 'password-updated')<div class="aviso ok" role="status">Contraseña actualizada.</div>@endif

                <form method="POST" action="{{ route('password.update') }}" class="formulario">
                    @csrf
                    @method('PUT')
                    <input type="text" value="{{ $user->email }}" autocomplete="username" hidden aria-hidden="true">
                    <div class="campo">
                        <label for="current_password">Contraseña actual</label>
                        <input id="current_password" name="current_password" type="password" required autocomplete="current-password" @if ($errors->updatePassword->has('current_password')) aria-invalid="true" @endif>
                        @if ($errors->updatePassword->has('current_password'))<p class="error-campo">{{ $errors->updatePassword->first('current_password') }}</p>@endif
                    </div>
                    <div class="campos-dobles">
                        <div class="campo">
                            <label for="password">Nueva contraseña</label>
                            <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" @if ($errors->updatePassword->has('password')) aria-invalid="true" @endif>
                            @if ($errors->updatePassword->has('password'))<p class="error-campo">{{ $errors->updatePassword->first('password') }}</p>@endif
                        </div>
                        <div class="campo">
                            <label for="password_confirmation">Confirmar la nueva contraseña</label>
                            <input id="password_confirmation" name="password_confirmation" type="password" required minlength="8" autocomplete="new-password">
                        </div>
                    </div>
                    <div class="acciones-form"><button class="btn primario">Cambiar contraseña</button></div>
                </form>
            </section>

            {{-- Datos personales --}}
            <section class="bloque" aria-labelledby="datos-pers-titulo">
                <header class="bloque-cab bloque-cab-texto">
                    <h2 id="datos-pers-titulo">Tratamiento de datos</h2>
                    <p>Información sobre los datos que guarda el sitio (Ley 1581 de 2012).</p>
                </header>
                <ul class="lista-simple">
                    <li>Se guardan su nombre visible, su correo, el resultado de sus partidas, el Elo y el progreso de campaña.</li>
                    <li>Las repeticiones de partidas en línea solo las pueden ver los dos participantes.</li>
                    <li>Los datos del piloto académico se exportan seudonimizados, sin nombre ni correo.</li>
                </ul>
            </section>

            {{-- Eliminar cuenta --}}
            <section class="bloque peligro" aria-labelledby="borrar-titulo">
                <header class="bloque-cab bloque-cab-texto">
                    <h2 id="borrar-titulo">Eliminar la cuenta</h2>
                    <p>Se borran de forma permanente su perfil, su historial, su progreso de campaña y su lista de amigos. Esta acción no se puede deshacer.</p>
                </header>
                <details @if ($errors->userDeletion->isNotEmpty()) open @endif>
                    <summary class="btn peligro">Eliminar mi cuenta</summary>
                    <form method="POST" action="{{ route('profile.destroy') }}" class="formulario confirmar-borrado">
                        @csrf
                        @method('DELETE')
                        <input type="text" value="{{ $user->email }}" autocomplete="username" hidden aria-hidden="true">
                        <div class="campo">
                            <label for="password_borrar">Escriba su contraseña para confirmar</label>
                            <input id="password_borrar" name="password" type="password" required autocomplete="current-password" @if ($errors->userDeletion->has('password')) aria-invalid="true" @endif>
                            @if ($errors->userDeletion->has('password'))<p class="error-campo">{{ $errors->userDeletion->first('password') }}</p>@endif
                        </div>
                        <div class="acciones-form"><button class="btn peligro">Eliminar definitivamente</button></div>
                    </form>
                </details>
            </section>
        </div>
    </div>
</x-layouts.sitio>
