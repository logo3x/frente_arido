<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('partidas', function (Blueprint $table) {
            $table->id();
            $table->string('codigo', 8)->unique();
            $table->foreignId('anfitrion_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('rival_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('ganador_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('estado', 12)->default('esperando'); // esperando | lista | finalizada | cancelada
            $table->string('motivo', 20)->nullable();           // victoria | abandono | desincronizacion | discrepancia
            $table->unsignedInteger('duracion_ticks')->nullable();
            $table->timestamp('finalizada_at')->nullable();
            $table->timestamps();

            $table->index(['estado', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('partidas');
    }
};
