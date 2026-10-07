<?php

namespace Tests\Feature;

use App\Models\Partida;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Salas en línea con jugadores IA: el servidor de partidas informa las plazas de IA (aviso «configuracion»),
 * el inicio de la partida («iniciada») y el resultado. Con IA no hay Elo.
 */
class SalaConIaTest extends TestCase
{
    use RefreshDatabase;

    // Aviso firmado del servidor de partidas (mismo esquema que el webhook real)
    private function aviso(array $datos): TestResponse
    {
        $cuerpo = json_encode($datos + ['ticks' => 0]);
        $firma = hash_hmac('sha256', $cuerpo, config('game.secret'));

        return $this->call('POST', '/api/partidas/resultado', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_GAME_SIGNATURE' => $firma], $cuerpo);
    }

    // Sala de 4 creada por el primer usuario, con los demás unidos desde el lobby
    private function sala(int $unidos): array
    {
        $us = User::factory()->count(4)->create();
        $this->actingAs($us[0])->post('/lobby/partidas', ['plazas' => 4, 'modo' => 'todos'])->assertRedirect();
        $p = Partida::latest('id')->firstOrFail();
        for ($i = 1; $i <= $unidos; $i++) {
            $this->actingAs($us[$i])->post("/lobby/partidas/{$p->codigo}/unirse")->assertRedirect();
        }

        return [$us, $p->fresh()];
    }

    public function test_las_plazas_de_ia_llenan_la_sala_y_se_pueden_liberar(): void
    {
        [$us, $p] = $this->sala(1);
        $this->aviso(['room' => $p->codigo, 'reason' => 'configuracion', 'ia' => 2])->assertNoContent();
        $p->refresh();
        $this->assertSame(2, $p->ia);
        $this->assertSame(Partida::LISTA, $p->estado);
        $this->assertSame(4, $p->ocupadas());
        // Llena con la IA: nadie más entra
        $this->actingAs($us[2])->post("/lobby/partidas/{$p->codigo}/unirse")->assertRedirect('/lobby');
        $this->assertFalse($p->participa($us[2]));
        // El creador quita una IA: vuelve a esperar y otro jugador puede unirse
        $this->aviso(['room' => $p->codigo, 'reason' => 'configuracion', 'ia' => 1])->assertNoContent();
        $this->assertSame(Partida::ESPERANDO, $p->fresh()->estado);
        $this->actingAs($us[3])->getJson('/lobby/partidas')->assertOk()->assertJsonFragment(['codigo' => $p->codigo, 'ocupadas' => 3, 'ia' => 1]);
        $this->actingAs($us[2])->post("/lobby/partidas/{$p->codigo}/unirse")->assertRedirect();
        $this->assertTrue($p->fresh()->participa($us[2]));
        $this->assertSame(Partida::LISTA, $p->fresh()->estado);
    }

    public function test_al_iniciar_quedan_solo_los_que_entraron(): void
    {
        [$us, $p] = $this->sala(2);
        $jugadores = [['uid' => (string) $us[0]->id, 'slot' => 0, 'team' => 0], ['uid' => (string) $us[1]->id, 'slot' => 1, 'team' => 1]];
        $this->aviso(['room' => $p->codigo, 'reason' => 'iniciada', 'ia' => 2, 'jugadores' => $jugadores])->assertNoContent();
        $p->refresh();
        $this->assertSame(Partida::LISTA, $p->estado);
        $this->assertSame(2, $p->ia);
        $this->assertFalse($p->participa($us[2]));   // se unió en el lobby, pero la sala se llenó con IA antes de que entrara
        $this->assertTrue($p->participa($us[1]));
    }

    public function test_con_ia_no_hay_elo_y_si_gana_la_ia_todos_pierden(): void
    {
        [$us, $p] = $this->sala(1);
        $jugadores = [['uid' => (string) $us[0]->id, 'slot' => 0, 'team' => 0], ['uid' => (string) $us[1]->id, 'slot' => 1, 'team' => 0]];
        $this->aviso(['room' => $p->codigo, 'reason' => 'victoria', 'ticks' => 5000, 'winner_team' => 1, 'ia' => 2, 'jugadores' => $jugadores])->assertNoContent();
        $p->refresh();
        $this->assertSame(Partida::FINALIZADA, $p->estado);
        $this->assertNull($p->elo_cambio);
        $this->assertSame(1000, (int) $us[0]->fresh()->elo);
        $this->assertSame(['derrota', 'derrota'], $p->jugadores->pluck('pivot.resultado')->all());
    }

    public function test_con_ia_las_personas_ganan_sin_elo(): void
    {
        [$us, $p] = $this->sala(1);
        $jugadores = [['uid' => (string) $us[0]->id, 'slot' => 0, 'team' => 0], ['uid' => (string) $us[1]->id, 'slot' => 1, 'team' => 1]];
        $this->aviso(['room' => $p->codigo, 'reason' => 'victoria', 'ticks' => 5000, 'winner_team' => 0, 'ia' => 2, 'jugadores' => $jugadores])->assertNoContent();
        $p->refresh();
        $this->assertSame(1000, (int) $us[0]->fresh()->elo);
        $this->assertSame(1000, (int) $us[1]->fresh()->elo);
        $this->assertSame(['victoria', 'derrota'], $p->jugadores->pluck('pivot.resultado')->all());
    }

    public function test_la_sala_de_dos_no_registra_ia(): void
    {
        $a = User::factory()->create();
        $this->actingAs($a)->post('/lobby/partidas')->assertRedirect();
        $p = Partida::latest('id')->firstOrFail();
        $this->aviso(['room' => $p->codigo, 'reason' => 'configuracion', 'ia' => 1])->assertNoContent();
        $this->assertSame(0, (int) $p->fresh()->ia);
        $this->assertSame(Partida::ESPERANDO, $p->fresh()->estado);
    }
}
