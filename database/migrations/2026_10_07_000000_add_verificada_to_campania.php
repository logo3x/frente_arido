<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('campania_progresos', function (Blueprint $table) {
            $table->boolean('verificada')->default(false)->after('intentos');   // re-simulada por el servidor de partidas
        });
    }

    public function down(): void
    {
        Schema::table('campania_progresos', fn (Blueprint $t) => $t->dropColumn('verificada'));
    }
};
