<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Mejor resultado por usuario y misión de campaña
        Schema::create('campania_progresos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('faccion', 12);
            $table->string('mision', 20);
            $table->unsignedTinyInteger('estrellas');
            $table->unsignedInteger('mejor_tiempo');           // segundos
            $table->string('dificultad', 8);
            $table->unsignedInteger('intentos')->default(1);
            $table->timestamps();
            $table->unique(['user_id', 'mision']);
        });

        // Historial de partidas jugadas en el cliente (escaramuza y campaña)
        Schema::create('registros_juego', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('modo', 12);                         // solo | mision | online
            $table->string('faccion', 12);
            $table->string('rival', 60);
            $table->string('resultado', 12);                    // victoria | derrota | anulada
            $table->unsignedInteger('duracion');                // segundos
            $table->string('mision', 20)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('registros_juego');
        Schema::dropIfExists('campania_progresos');
    }
};
