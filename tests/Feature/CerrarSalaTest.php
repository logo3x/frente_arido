<?php

namespace Tests\Feature;

use App\Models\Partida;
use App\Models\User;
use App\Services\GameToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Cierre de salas: solo el creador, mientras la sala espera jugadores o está lista; aviso del servidor de partidas.
 */
class CerrarSalaTest extends TestCase
{
    use RefreshDatabase;

    private function salaLista(): array
    {
        [$a, $b] = User::factory()->count(2)->create();
        $this->actingAs($a)->post('/lobby/partidas')->assertRedirect();
        $p = Partida::latest('id')->firstOrFail();
        $this->actingAs($b)->post("/lobby/partidas/{$p->codigo}/unirse")->assertRedirect();

        return [$a, $b, $p->fresh()];
    }

    public function test_el_creador_cierra_una_sala_en_espera(): void
    {
        $a = User::factory()->create();
        $this->actingAs($a)->post('/lobby/partidas')->assertRedirect();
        $p = Partida::latest('id')->firstOrFail();
        $this->actingAs($a)->delete("/lobby/partidas/{$p->codigo}")->assertRedirect('/lobby');
        $this->assertSame(Partida::CANCELADA, $p->fresh()->estado);
    }

    public function test_el_creador_cierra_una_sala_lista(): void
    {
        [$a, , $p] = $this->salaLista();
        $this->assertSame(Partida::LISTA, $p->estado);
        $this->actingAs($a)->get('/lobby')->assertOk()->assertSee('Cerrar sala');
        $this->actingAs($a)->delete("/lobby/partidas/{$p->codigo}")->assertRedirect('/lobby');
        $this->assertSame(Partida::CANCELADA, $p->fresh()->estado);
        $this->actingAs($a)->get("/lobby/partidas/{$p->codigo}/jugar")->assertStatus(410);
    }

    public function test_un_invitado_no_puede_cerrar_la_sala(): void
    {
        [, $b, $p] = $this->salaLista();
        $this->actingAs($b)->get('/lobby')->assertOk()->assertDontSee('Cerrar sala');
        $this->actingAs($b)->delete("/lobby/partidas/{$p->codigo}")->assertForbidden();
        $this->assertSame(Partida::LISTA, $p->fresh()->estado);
    }

    public function test_no_se_cierra_una_partida_terminada(): void
    {
        [$a, , $p] = $this->salaLista();
        $p->update(['estado' => Partida::FINALIZADA]);
        $this->actingAs($a)->delete("/lobby/partidas/{$p->codigo}")->assertStatus(409);
    }

    public function test_el_token_marca_al_creador(): void
    {
        [$a, $b, $p] = $this->salaLista();
        $datos = fn (User $u) => json_decode(base64_decode(strtr(explode('.', GameToken::make($p, $u))[0], '-_', '+/')), true);
        $this->assertTrue($datos($a)['anf']);
        $this->assertFalse($datos($b)['anf']);
    }

    public function test_el_servidor_avisa_que_el_creador_cerro_la_sala(): void
    {
        [$a, $b, $p] = $this->salaLista();
        $cuerpo = json_encode(['room' => $p->codigo, 'reason' => 'cerrada', 'ticks' => 0]);
        $firma = hash_hmac('sha256', $cuerpo, config('game.secret'));
        $this->call('POST', '/api/partidas/resultado', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_GAME_SIGNATURE' => $firma], $cuerpo)->assertNoContent();
        $p = $p->fresh();
        $this->assertSame(Partida::CANCELADA, $p->estado);
        $this->assertNull($p->ganador_id);
        $this->assertSame(1000, (int) ($a->fresh()->elo ?? 1000));
        $this->assertSame(1000, (int) ($b->fresh()->elo ?? 1000));
    }
}
