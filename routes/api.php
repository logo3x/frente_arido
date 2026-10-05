<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\Api\ProgresoController;
use App\Http\Controllers\Api\ResultadoPartidaController;
use App\Http\Middleware\VerificarTokenPerfil;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');




Route::post('/partidas/resultado', ResultadoPartidaController::class)
    ->middleware('throttle:60,1')
    ->name('api.partidas.resultado');

Route::middleware([VerificarTokenPerfil::class, 'throttle:30,1'])->prefix('progreso')->group(function () {
    Route::get('/', [ProgresoController::class, 'show'])->name('api.progreso');
    Route::post('/mision', [ProgresoController::class, 'mision'])->name('api.progreso.mision');
    Route::post('/registro', [ProgresoController::class, 'registro'])->name('api.progreso.registro');
});
