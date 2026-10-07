'use strict';
// Lobby: lista de salas abiertas. Se actualiza cada 5 s; con Laravel Reverb (window.Echo), en tiempo real.
// Archivo aparte porque la política de seguridad solo admite scripts del propio dominio (sin código en línea).
(function () {
  const tabla = document.getElementById('abiertas');
  if (!tabla) return;
  const url = tabla.dataset.url, token = document.querySelector('meta[name="csrf-token"]').content, estado = document.getElementById('estadoTR');
  const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const vacio = texto => `<tr><td colspan="5" class="vacio">${texto}</td></tr>`;

  async function cargar() {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(res.status);
      const salas = await res.json();
      tabla.innerHTML = salas.length
        ? salas.map(s => `<tr><td><b>${esc(s.codigo)}</b></td><td>${esc(s.anfitrion)}</td><td class="num">${Number(s.ocupadas)}/${Number(s.plazas)}${s.modo === 'equipos' ? ' · equipos' : ''}</td><td>${esc(s.creada)}</td>
            <td class="acc"><form method="POST" action="${esc(s.unirse_url)}"><input type="hidden" name="_token" value="${esc(token)}"><button class="btn primario mini">Unirse</button></form></td></tr>`).join('')
        : vacio('No hay salas abiertas. Cree una y comparta el código.');
    } catch (e) {
      tabla.innerHTML = vacio('No fue posible cargar las salas. Se reintentará en unos segundos.');
    }
  }

  let intervalo = setInterval(cargar, 5000), avisado = false;
  function avisarHistorial() {
    if (avisado) return; avisado = true;
    const p = document.createElement('div');
    p.className = 'aviso ok'; p.setAttribute('role', 'status');
    p.append('Hay resultados nuevos. ');
    const a = document.createElement('a'); a.href = ''; a.className = 'btn mini'; a.textContent = 'Actualizar'; p.append(a);
    document.getElementById('contenido').prepend(p);
  }
  function conectarTiempoReal() {
    if (!window.Echo) return false;
    window.Echo.channel('lobby').listen('.salas.actualizadas', e => { cargar(); if (e && e.tipo === 'resultado') avisarHistorial(); });
    clearInterval(intervalo); intervalo = setInterval(cargar, 30000);   // respaldo ante eventos perdidos
    if (estado) { estado.textContent = 'Tiempo real activo'; estado.classList.add('activo'); }
    return true;
  }
  cargar();
  // app.js (Echo) se carga como módulo y puede terminar después de este script
  if (!conectarTiempoReal()) window.addEventListener('load', conectarTiempoReal);
})();

// Confirmación de acciones del lobby, como «Cerrar sala» (formularios con data-confirmar)
document.addEventListener('submit', e => {
  const f = e.target.closest ? e.target.closest('form[data-confirmar]') : null;
  if (f && !window.confirm(f.dataset.confirmar)) e.preventDefault();
});
