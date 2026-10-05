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
    'sim_version' => env('GAME_SIM_VERSION', '0.8'),

    // Misiones válidas por facción (deben coincidir con CAMPAIGNS del cliente).
    'misiones' => [
        'atlas' => ['atlas-1', 'atlas-2', 'atlas-3', 'atlas-4'],
        'hierro' => ['hierro-1', 'hierro-2', 'hierro-3', 'hierro-4'],
        'guerrilla' => ['guerrilla-1', 'guerrilla-2', 'guerrilla-3', 'guerrilla-4'],
    ],
];
