<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Plazas de jugadores IA en las salas en línea de más de 2. Las informa el servidor de partidas con un aviso firmado:
 * el lobby las cuenta como ocupadas y una partida con IA no cambia el Elo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('partidas', function (Blueprint $table) {
            $table->unsignedTinyInteger('ia')->default(0)->after('modo');
        });
    }

    public function down(): void
    {
        Schema::table('partidas', function (Blueprint $table) {
            $table->dropColumn('ia');
        });
    }
};
