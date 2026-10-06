<?php

namespace Tests\Feature;

use App\Models\Partida;
use App\Models\User;
use App\Services\GameToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Recorrido del sitio: páginas públicas y del panel, salas de 2 y de 4 plazas, amigos y webhook de resultado.
 */
class SitioTest extends TestCase
{
    use RefreshDatabase;

    public function test_paginas_publicas(): void
    {
        foreach (['/', '/login', '/register', '/forgot-password', '/up'] as $url) {
            $this->get($url)->assertOk();
        }
    }

    public function test_paginas_del_panel(): void
    {
        $u = User::factory()->create();
        foreach (['/dashboard', '/lobby', '/profile'] as $url) {
            $this->actingAs($u)->get($url)->assertOk();
        }
        $this->actingAs($u)->getJson('/lobby/partidas')->assertOk();
        $this->actingAs($u)->get('/lobby/campania')->assertRedirect();
        $this->actingAs($u)->get('/lobby/escaramuza')->assertRedirect();
    }

    public function test_sala_de_dos_jugadores(): void
    {
        [$a, $b] = User::factory()->count(2)->create();
        $this->actingAs($a)->post('/lobby/partidas')->assertRedirect();
        $p = Partida::latest('id')->firstOrFail();
        $this->actingAs($b)->post("/lobby/partidas/{$p->codigo}/unirse")->assertRedirect();
        $this->assertSame((int) $b->id, (int) $p->fresh()->rival_id);
        $this->actingAs($a)->get("/lobby/partidas/{$p->codigo}/jugar")->assertRedirect();
        $this->actingAs($a)->get('/lobby')->assertOk();
    }

    public function test_sala_de_cuatro_por_equipos_y_resultado(): void
    {
        $us = User::factory()->count(4)->create();
        $this->actingAs($us[0])->post('/lobby/partidas', ['plazas' => 4, 'modo' => 'equipos'])->assertRedirect();
        $p = Partida::latest('id')->firstOrFail();
        foreach ([1, 2, 3] as $i) {
            $this->actingAs($us[$i])->post("/lobby/partidas/{$p->codigo}/unirse")->assertRedirect();
        }
        $this->assertSame(4, $p->jugadores()->count());
        foreach ($us as $u) {
            $this->actingAs($u)->get('/lobby')->assertOk();
            $this->actingAs($u)->get('/dashboard')->assertOk();
        }

        $cuerpo = json_encode(['room' => $p->codigo, 'reason' => 'victoria', 'ticks' => 5000, 'winner_team' => 0,
            'jugadores' => $us->values()->map(fn ($u, $i) => ['uid' => (string) $u->id, 'team' => $i < 2 ? 0 : 1])->all()]);
        $firma = hash_hmac('sha256', $cuerpo, config('game.secret'));
        $this->call('POST', '/api/partidas/resultado', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_GAME_SIGNATURE' => $firma], $cuerpo)->assertNoContent();
        $this->assertSame(Partida::FINALIZADA, $p->fresh()->estado);
        $this->assertGreaterThan(1000, (int) $us[0]->fresh()->elo);
        $this->assertLessThan(1000, (int) $us[3]->fresh()->elo);
        $this->actingAs($us[0])->get('/lobby')->assertOk()->assertSee('Victoria')->assertSee(e($us[3]->name));
    }

    public function test_amigos(): void
    {
        [$a, $b] = User::factory()->count(2)->create();
        $this->actingAs($a)->post('/amigos', ['email' => $b->email])->assertRedirect();
        $this->actingAs($b)->get('/dashboard')->assertOk();
    }

    public function test_firma_invalida(): void
    {
        $this->postJson('/api/partidas/resultado', ['room' => 'X'], ['X-Game-Signature' => 'malo'])->assertStatus(401);
    }
}
