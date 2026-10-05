<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedSmallInteger('elo')->default(1000)->index();
        });
        Schema::table('partidas', function (Blueprint $table) {
            $table->string('repeticion')->nullable()->after('duracion_ticks'); // ruta en storage/app
            $table->smallInteger('elo_cambio')->nullable()->after('repeticion');
        });
    }

    public function down(): void
    {
        Schema::table('partidas', fn (Blueprint $t) => $t->dropColumn(['repeticion', 'elo_cambio']));
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('elo'));
    }
};
