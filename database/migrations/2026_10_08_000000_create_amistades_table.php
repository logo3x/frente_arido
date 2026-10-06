<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Una fila por relación: solicitante -> destinatario. Al aceptar, la relación vale en ambos sentidos.
        Schema::create('amistades', function (Blueprint $table) {
            $table->id();
            $table->foreignId('solicitante_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('destinatario_id')->constrained('users')->cascadeOnDelete();
            $table->string('estado', 10)->default('pendiente'); // pendiente | aceptada
            $table->timestamps();
            $table->unique(['solicitante_id', 'destinatario_id']);
            $table->index(['destinatario_id', 'estado']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('amistades');
    }
};
