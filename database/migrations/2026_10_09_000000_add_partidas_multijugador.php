<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Partidas en línea de 2 a 8 jugadores. Las de 2 siguen usando anfitrion_id y rival_id; las de más de 2 registran
 * a cada jugador en partida_jugadores (plaza, equipo, resultado y cambio de Elo).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('partidas', function (Blueprint $table) {
            $table->unsignedTinyInteger('plazas')->default(2)->after('codigo');
            $table->string('modo', 10)->default('todos')->after('plazas');          // todos | equipos
            $table->unsignedTinyInteger('equipo_ganador')->nullable()->after('ganador_id');
        });

        Schema::create('partida_jugadores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('partida_id')->constrained('partidas')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedTinyInteger('plaza');
            $table->unsignedTinyInteger('equipo')->nullable();
            $table->string('resultado', 10)->nullable();                            // victoria | derrota
            $table->integer('elo_cambio')->nullable();
            $table->timestamps();

            $table->unique(['partida_id', 'user_id']);
            $table->unique(['partida_id', 'plaza']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('partida_jugadores');
        Schema::table('partidas', function (Blueprint $table) {
            $table->dropColumn(['plazas', 'modo', 'equipo_ganador']);
        });
    }
};
