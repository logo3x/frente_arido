<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Reto directo entre amigos: la sala solo la puede tomar el invitado.
        Schema::table('partidas', function (Blueprint $table) {
            $table->foreignId('invitado_id')->nullable()->after('rival_id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('partidas', function (Blueprint $table) {
            $table->dropConstrainedForeignId('invitado_id');
        });
    }
};
