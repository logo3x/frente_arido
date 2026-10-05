<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Métricas del piloto: acciones por minuto y cuadros por segundo promedio
    public function up(): void
    {
        Schema::table('registros_juego', function (Blueprint $table) {
            $table->unsignedSmallInteger('apm')->nullable()->after('mision');
            $table->unsignedSmallInteger('fps')->nullable()->after('apm');
        });
    }

    public function down(): void
    {
        Schema::table('registros_juego', fn (Blueprint $t) => $t->dropColumn(['apm', 'fps']));
    }
};
