<?php

use App\Http\Controllers\AmistadController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\LobbyController;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/dashboard', DashboardController::class)->middleware(['auth', 'verified'])->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::post('/amigos', [AmistadController::class, 'store'])->middleware('throttle:20,1')->name('amigos.store');
    Route::patch('/amigos/{amistad}', [AmistadController::class, 'aceptar'])->name('amigos.aceptar');
    Route::delete('/amigos/{amistad}', [AmistadController::class, 'destroy'])->name('amigos.destroy');

    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

require __DIR__.'/auth.php';




// El código de sala es alfanumérico en mayúsculas (6 a 8 caracteres)
Route::pattern('partida', '[A-Z0-9]{3,8}');

Route::middleware('auth')->prefix('lobby')->name('lobby.')->group(function () {
    Route::get('/', [LobbyController::class, 'index'])->name('index');
    Route::get('/partidas', [LobbyController::class, 'listado'])->name('listado');
    Route::post('/partidas', [LobbyController::class, 'store'])->middleware('throttle:10,1')->name('store');
    Route::get('/campania', [LobbyController::class, 'campania'])->name('campania');
    Route::get('/escaramuza', [LobbyController::class, 'escaramuza'])->name('escaramuza');
    Route::post('/partidas/{partida}/unirse', [LobbyController::class, 'unirse'])->middleware('throttle:20,1')->name('unirse');
    Route::get('/partidas/{partida}/jugar', [LobbyController::class, 'jugar'])->name('jugar');
    Route::delete('/partidas/{partida}', [LobbyController::class, 'cancelar'])->name('cancelar');
    Route::get('/partidas/{partida}/repeticion', [LobbyController::class, 'repeticion'])->name('repeticion');
    Route::get('/partidas/{partida}/ver', [LobbyController::class, 'verRepeticion'])->name('ver');
});
