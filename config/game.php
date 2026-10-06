<?php

return [
    // Clave compartida con el servidor Node (variable GAME_SECRET en ambos lados).
    'secret' => env('GAME_SECRET'),

    // Dirección pública del servidor de partidas (wss:// en producción).
    'ws_url' => env('GAME_WS_URL', 'ws://localhost:8080'),

    // Ruta del cliente del juego dentro de public/.
    'client_url' => env('GAME_CLIENT_URL', '/juego/index.html'),

    // Vigencia del token de conexión, en segundos.
    'token_ttl' => (int) env('GAME_TOKEN_TTL', 3600),

    // Vigencia del token del perfil de campaña, en segundos.
    'perfil_ttl' => (int) env('GAME_PERFIL_TTL', 7200),

    // Duración mínima (en ticks, 15 por segundo) para que una partida en línea afecte el Elo.
    // Reduce el abuso con cuentas propias que abandonan de inmediato.
    'elo_min_ticks' => (int) env('GAME_ELO_MIN_TICKS', 1800),

    // Validador de misiones del servidor de partidas (POST firmado). Vacío: el progreso queda sin verificar.
    'validator_url' => env('GAME_VALIDATOR_URL', 'http://127.0.0.1:8080/validar-mision'),
    // true: si el validador no responde, no se registra la misión. false: se registra como no verificada.
    'validar_campania' => (bool) env('GAME_VALIDAR_CAMPANIA', true),
    'sim_version' => env('GAME_SIM_VERSION', '0.9.5'),
    'version' => '0.9.5',   // versión que muestra el sitio
    // Fichas de unidades y edificios que muestra la landing (public/img/ficha-<clave>-<facción>.webp)
    'arsenal' => [
        'atlas' => [
            ['infanteria', 'Infantería'],
            ['ingeniero', 'Ingeniero'],
            ['tanque', 'Tanque'],
            ['antiaereo', 'Antiaéreo'],
            ['avion', 'Avión de ataque'],
            ['helicoptero-carga', 'Helicóptero de carga'],
            ['plataforma-ingenieria', 'Plataforma de ingeniería'],
            ['lancha', 'Lancha patrullera'],
            ['fragata', 'Fragata lanzamisiles'],
            ['comando-atlas', 'Comando Atlas'],
            ['centro-mando', 'Centro de mando'],
            ['planta-energia', 'Planta de energía'],
            ['plataforma-carga', 'Plataforma de carga'],
        ],
        'hierro' => [
            ['infanteria', 'Infantería'],
            ['ingeniero', 'Ingeniero'],
            ['tanque', 'Tanque'],
            ['tanque-pesado', 'Tanque pesado'],
            ['antiaereo', 'Antiaéreo'],
            ['helicoptero-ataque', 'Helicóptero de ataque'],
            ['camion-minero', 'Camión minero'],
            ['topadora', 'Topadora'],
            ['lancha', 'Lancha patrullera'],
            ['monitor-fluvial', 'Monitor fluvial'],
            ['mariscal-hierro', 'Mariscal de Hierro'],
        ],
        'guerrilla' => [
            ['rebelde', 'Rebelde'],
            ['ingeniero', 'Ingeniero'],
            ['tecnico', 'Técnico'],
            ['artilleria', 'Artillería ligera'],
            ['antiaereo', 'Antiaéreo'],
            ['trabajador', 'Trabajador'],
            ['camion-grua', 'Camión grúa'],
            ['lancha-rapida', 'Lancha rápida'],
            ['fragata', 'Fragata'],
            ['jefe-rebelde', 'Jefe rebelde'],
        ],
    ],


    // Presentación de las facciones en el sitio (resumen de FACTIONS del cliente).
    'facciones' => [
        'atlas' => [
            'nombre' => 'Coalición Atlas',
            'lema' => 'Tecnología y aviación',
            'rasgos' => ['Aeródromo y aviones de ataque', 'Tanques más resistentes y costosos', 'Poder exclusivo: ataque de precisión', 'Superarma: cañón de partículas'],
        ],
        'hierro' => [
            'nombre' => 'Frente Hierro',
            'lema' => 'Masa y blindaje',
            'rasgos' => ['Tanque pesado y helicóptero de ataque', 'Horda: +25 % de daño con 4 aliados cerca', 'Poder exclusivo: bombardeo de artillería', 'Superarma: silo nuclear'],
        ],
        'guerrilla' => [
            'nombre' => 'Red Guerrillera',
            'lema' => 'Emboscada y movilidad',
            'rasgos' => ['No necesita energía', 'Rebeldes camuflados y red de túneles', 'Poder exclusivo: sabotaje', 'Superarma: tormenta de cohetes'],
        ],
    ],

    // Nombres de las campañas y misiones (CAMPAIGNS del cliente), para mostrarlos en el panel.
    'campanias' => ['atlas' => 'Operación Horizonte', 'hierro' => 'Puño de Hierro', 'guerrilla' => 'Red de Sombras'],
    'nombres_mision' => [
        'atlas-1' => 'Cabeza de playa', 'atlas-2' => 'Cielo abierto', 'atlas-3' => 'Tormenta de acero', 'atlas-4' => 'Dominio del canal',
        'hierro-1' => 'La leva', 'hierro-2' => 'Muro de acero', 'hierro-3' => 'Ocaso nuclear', 'hierro-4' => 'Bloqueo fluvial',
        'guerrilla-1' => 'Arena y pozos', 'guerrilla-2' => 'Sabotaje', 'guerrilla-3' => 'La gran rebelión', 'guerrilla-4' => 'Piratas del canal',
        'tutorial' => 'Entrenamiento básico',
    ],

    // Experiencia de carrera (se calcula en Laravel con datos del servidor; ver App\Services\Carrera).
    'carrera' => [
        'xp' => [
            'online_victoria' => 300,   // partidas en línea con duración mínima (elo_min_ticks)
            'online_derrota' => 100,
            'estrella' => 120,          // por estrella de campaña (verificada si validar_campania = true)
            'escaramuza_victoria' => 60, // registros del cliente de al menos escaramuza_min_s
            'escaramuza_derrota' => 20,
        ],
        'escaramuza_min_s' => 180,
        'niveles' => [
            ['nombre' => 'Recluta', 'xp' => 0],
            ['nombre' => 'Soldado', 'xp' => 500],
            ['nombre' => 'Cabo', 'xp' => 1500],
            ['nombre' => 'Sargento', 'xp' => 3000],
            ['nombre' => 'Teniente', 'xp' => 5500],
            ['nombre' => 'Capitán', 'xp' => 9000],
            ['nombre' => 'Mayor', 'xp' => 14000],
            ['nombre' => 'Coronel', 'xp' => 21000],
            ['nombre' => 'General', 'xp' => 30000],
        ],
    ],

    // Misiones válidas por facción (deben coincidir con CAMPAIGNS del cliente).
    'misiones' => [
        'atlas' => ['atlas-1', 'atlas-2', 'atlas-3', 'atlas-4'],
        'hierro' => ['hierro-1', 'hierro-2', 'hierro-3', 'hierro-4'],
        'guerrilla' => ['guerrilla-1', 'guerrilla-2', 'guerrilla-3', 'guerrilla-4'],
    ],
];
