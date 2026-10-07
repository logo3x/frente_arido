'use strict';
/**
 * Motor de sonido de Frente Árido (diseño original, síntesis por capas).
 *
 * Cada sonido se construye con capas: transitorio (chasquido), cuerpo (ruido filtrado con barrido), golpe grave
 * con caída de tono, parciales metálicos, chisporroteo de escombros y reverberación de exterior. Las recetas tienen
 * variante por facción:
 *   Atlas     → armas electromagnéticas: carga, chasquido seco, zumbido de capacitores; interfaz digital limpia.
 *   Hierro    → calibre pesado: golpe grave, metal, cierres de recámara, vapor; interfaz de relés y bocinas.
 *   Guerrilla → armas viejas: matraqueo, pólvora sucia, metal flojo; interfaz de radio, estática y silbidos.
 *
 * Uso:
 *   FASonido.renderizar(clave, semilla)  → Promise<AudioBuffer> (OfflineAudioContext; lo usa el juego y el estudio)
 *   FASonido.aWav(buffer)                → Uint8Array con un WAV de 16 bits
 *   new FASonido.Motor(ctx, destino)     → reproducción en el juego con banco, archivos opcionales y música adaptativa
 * Las claves son «base-facción» (rifle-atlas) o «base» (boom). No usa la simulación: solo sonido.
 *   new FASonido.Voces(motor)            → voces de las unidades: archivo grabado (audio/voz-…) o voz del sistema
 * Realismo: disparos y explosiones con onda de choque, fogonazo, presión grave, cola en el terreno, ecos lejanos y
 * escombros; sin osciladores con barrido de tono (sonaban a juguete).
 */
(function(){
const FAC = ['atlas', 'hierro', 'guerrilla'];
const CACHE = new WeakMap();

// ---------- Recursos por contexto: ruidos y respuesta de impulso ----------
function recursos(ctx){
  if(CACHE.has(ctx)) return CACHE.get(ctx);
  const sr = ctx.sampleRate, n = sr * 2, mk = () => ctx.createBuffer(1, n, sr);
  const blanco = mk(), rosa = mk(), marron = mk();
  const b = blanco.getChannelData(0), p = rosa.getChannelData(0), m = marron.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0, last = 0;
  for(let i=0; i<n; i++){
    const w = Math.random()*2 - 1; b[i] = w;
    b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759; b2 = 0.969*b2 + w*0.153852; b3 = 0.8665*b3 + w*0.3104856;
    b4 = 0.55*b4 + w*0.5329522; b5 = -0.7616*b5 - w*0.016898; p[i] = (b0+b1+b2+b3+b4+b5+b6 + w*0.5362)*0.11; b6 = w*0.115926;
    last = (last + 0.02*w)/1.02; m[i] = last*3.5;
  }
  const impulso = (dur, caida, brillo) => {
    const len = Math.floor(sr*dur), buf = ctx.createBuffer(2, len, sr);
    for(let c=0; c<2; c++){
      const d = buf.getChannelData(c); let lp = 0;
      for(let i=0; i<len; i++){
        const t = i/sr, w = Math.random()*2 - 1; lp += (w - lp) * brillo * Math.exp(-t*2);   // se oscurece con el tiempo
        d[i] = lp * Math.exp(-t*caida) * (t < 0.012 ? t/0.012 : 1);
      }
      // reflexiones tempranas de terreno abierto
      for(const [tt, g] of [[0.019, 0.5], [0.037, 0.35], [0.061, 0.22]]){ const k = Math.floor((tt + c*0.004)*sr); if(k < len) d[k] += g; }
    }
    return buf;
  };
  const R = { blanco, rosa, marron, irCorta: impulso(1.4, 3.2, 0.5), irLarga: impulso(4.5, 1.1, 0.35) };
  CACHE.set(ctx, R); return R;
}
const curvaSat = (() => { const c = {}; return k => c[k] || (c[k] = Float32Array.from({ length:1024 }, (_, i) => { const x = i/511.5 - 1; return Math.tanh(k*x)/Math.tanh(k); })); })();

// ---------- Sintetizador sobre un contexto: capas reutilizables ----------
// Criterio de realismo: los disparos y las explosiones se construyen con ruido, presión y ecos, no con osciladores
// que cambian de tono (ese barrido es lo que suena a juguete). Los tonos quedan para motores, alarmas y radio.
function sintetizador(ctx, salida, grande){
  const Rc = recursos(ctx);
  const seco = ctx.createGain(); seco.connect(salida);
  const conv = ctx.createConvolver(); conv.buffer = grande ? Rc.irLarga : Rc.irCorta;
  const envio = ctx.createGain(); envio.gain.value = 1; envio.connect(conv); conv.connect(salida);
  // Ecos de terreno abierto: reflexiones lejanas en acantilados y dunas, cada vez más oscuras y débiles
  const eco = ctx.createGain(); eco.gain.value = 1;
  for(const [d, g, fc] of [[0.23, 0.30, 1900], [0.52, 0.17, 1150], [0.88, 0.09, 700], [1.31, 0.05, 480]]){
    const dl = ctx.createDelay(2), lp = ctx.createBiquadFilter(), gg = ctx.createGain();
    dl.delayTime.value = d; lp.type = 'lowpass'; lp.frequency.value = fc; gg.gain.value = g;
    eco.connect(dl); dl.connect(lp); lp.connect(gg); gg.connect(salida); const s = ctx.createGain(); s.gain.value = 0.5; gg.connect(s); s.connect(envio);
  }
  const sat = (k, dest) => { const w = ctx.createWaveShaper(); w.curve = curvaSat(k); w.oversample = '2x'; w.connect(dest); return w; };
  // Envolvente: subida lineal y caída exponencial natural
  const env = (g, t, ataque, vol, dur, curva=4) => {
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + ataque);
    g.gain.setTargetAtTime(0.0001, t + ataque, Math.max(0.004, dur/curva));
  };
  const ruteo = (nodo, pan, rev, ec=0) => {
    const g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    nodo.connect(g); const o = p || g;
    if(p){ p.pan.value = Math.max(-1, Math.min(1, pan || 0)); g.connect(p); }
    o.connect(seco);
    if(rev){ const s = ctx.createGain(); s.gain.value = rev; o.connect(s); s.connect(envio); }
    if(ec){ const s = ctx.createGain(); s.gain.value = ec; o.connect(s); s.connect(eco); }
    return g;
  };
  const S = {
    ctx, sat,
    // Ruido filtrado con barrido de frecuencia
    ruido({ t=0, dur=0.3, tipo='blanco', filtro='lowpass', f0=1000, f1, q=0.7, vol=0.5, ataque=0.002, curva=4, pan=0, rev=0.2, eco:ec=0, k=0 }){
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter();
      s.buffer = Rc[tipo] || Rc.blanco; s.loop = true;
      f.type = filtro; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if(f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      s.connect(f); let n = f; if(k){ const g2 = ctx.createGain(); f.connect(sat(k, g2)); n = g2; }
      const g = ruteo(n, pan, rev, ec); env(g, t, ataque, vol, dur, curva);
      s.start(t, Math.random()*1.5); s.stop(t + dur*1.6 + 0.05);
    },
    // Tono con barrido, voces desafinadas, paso bajo opcional (lp) y saturación
    tono({ t=0, dur=0.3, onda='sine', f0=440, f1, vol=0.3, ataque=0.003, curva=4, voces=1, des=0, pan=0, rev=0.15, eco:ec=0, k=0, vib=0, lp=0 }){
      const mezcla = ctx.createGain(); mezcla.gain.value = 1/Math.sqrt(voces);
      for(let v=0; v<voces; v++){
        const o = ctx.createOscillator(), d = voces > 1 ? (v/(voces-1) - 0.5)*2*des : 0;
        o.type = onda; o.frequency.setValueAtTime(f0, t); o.detune.value = d;
        if(f1) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
        if(vib){ const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.5; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur*1.6 + 0.05); }
        o.connect(mezcla); o.start(t); o.stop(t + dur*1.6 + 0.05);
      }
      let n = mezcla;
      if(lp){ const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.6; n.connect(f); n = f; }
      if(k){ const g2 = ctx.createGain(); n.connect(sat(k, g2)); n = g2; }
      const g = ruteo(n, pan, rev, ec); env(g, t, ataque, vol, dur, curva);
    },
    // Presión grave: seno corto con poca caída de tono (se siente en el pecho; no «cae» como un bombo electrónico)
    grave({ t=0, f0=60, f1=42, dur=0.5, vol=0.8, k=2, rev=0.1 }){ S.tono({ t, dur, onda:'sine', f0, f1, vol, ataque:0.003, curva:3, k, rev }); },
    // Onda de choque: un pulso en «N» de pocos milisegundos (el chasquido de la bala supersónica o del frente de la explosión)
    crack({ t=0, vol=0.6, ancho=0.0008, pan=0 }){
      const sr = ctx.sampleRate, n = Math.max(8, Math.floor(ancho*sr)), b = ctx.createBuffer(1, n + 8, sr), d = b.getChannelData(0);
      for(let i=0; i<n; i++) d[i] = 1 - 2*i/(n - 1);
      const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(); s.buffer = b; hp.type = 'highpass'; hp.frequency.value = 450; s.connect(hp);
      const g = ruteo(hp, pan, 0.25, 0.3); g.gain.value = vol; s.start(t);
    },
    // Disparo por capas. calibre: 0,5 fusil … 3 obús · brillo: más agudos (Atlas) · sucio: saturación y medios (armas viejas)
    disparo({ t=0, vol=1, calibre=1, brillo=1, sucio=0, pan=0, cola=1 }){
      const c = calibre, rc = Math.sqrt(c);
      S.crack({ t, vol:0.5*vol, ancho:0.0007*rc, pan });
      S.ruido({ t, dur:0.03*c + 0.02, filtro:'lowpass', f0:Math.min(16000, 9500*brillo/rc), f1:1600/rc, vol, ataque:0.0004, curva:6, k:1.5 + sucio*3, pan, rev:0.15 });   // fogonazo
      S.ruido({ t, dur:0.06*c + 0.05, tipo:'rosa', filtro:'bandpass', f0:(sucio ? 1150 : 780)/rc, q:0.6, vol:0.55*vol, ataque:0.0006, curva:5, k:2 + sucio*3, pan, rev:0.2 });   // cuerpo
      S.ruido({ t, dur:0.1*c + 0.06, tipo:'marron', filtro:'lowpass', f0:280/rc, vol:0.9*vol, ataque:0.001, curva:4, k:2.5, pan, rev:0.1 });   // presión
      S.grave({ t, f0:40 + 60/rc, f1:30 + 40/rc, dur:0.07*c + 0.05, vol:0.3*vol*Math.min(1.6, c), k:1.5, rev:0.05 });
      if(cola) S.ruido({ t:t + 0.01, dur:(0.45 + 0.35*c)*cola, tipo:'rosa', filtro:'lowpass', f0:2300/rc, f1:280, vol:0.22*vol*cola, ataque:0.012, curva:3, pan, rev:0.7, eco:0.9 });   // cola en el terreno
    },
    // Parciales inarmónicos: metal, cierres de recámara, campanas
    metal({ t=0, base=800, parciales=[1, 2.76, 5.4, 8.93], dur=0.3, vol=0.2, pan=0, rev=0.3, onda='sine' }){
      parciales.forEach((r, i) => S.tono({ t, dur: dur/(1 + i*0.35), onda, f0: base*r, vol: vol/(1 + i*0.6), ataque:0.001, curva:3, pan, rev }));
    },
    // Chisporroteo: ráfagas diminutas de densidad decreciente (escombros, arena, estática, motor cohete)
    chispas({ t=0, dur=1, densidad=40, vol=0.2, f=3000, filtro='bandpass', q=1.2, rev=0.3, R=Math.random }){
      const n = Math.floor(densidad*dur);
      for(let i=0; i<n; i++){ const u = R(), tt = t + dur*u*u; S.ruido({ t:tt, dur:0.006 + R()*0.03, filtro, f0:f*(0.6 + R()*0.9), q, vol:vol*(0.4 + R())*(1 - u*0.7), pan:(R() - 0.5)*1.4, rev, ataque:0.0008, curva:3 }); }
    },
    // Escombros que caen: terrones sordos primero, gravilla y arena después
    escombros({ t=0, dur=1.4, vol=0.3, R=Math.random }){
      S.chispas({ t:t + 0.12, dur, densidad:20, vol:vol*1.3, f:420, filtro:'lowpass', q:0.7, rev:0.25, R });
      S.chispas({ t:t + 0.3, dur:dur*1.1, densidad:42, vol:vol*0.45, f:3000, filtro:'bandpass', q:1.4, rev:0.3, R });
      S.ruido({ t:t + 0.2, dur:dur*1.3, tipo:'rosa', filtro:'bandpass', f0:2600, q:0.5, vol:vol*0.12, ataque:0.4, curva:2, rev:0.3 });
    },
    // Retumbo que rueda por el desierto después de una detonación grande
    retumbo({ t=0, n=3, vol=0.35, R=Math.random }){
      for(let i=0; i<n; i++) S.ruido({ t:t + i*r(R, 0.35, 0.7), dur:1.3, tipo:'marron', filtro:'lowpass', f0:r(R, 200, 360), vol:vol*(1 - i*0.18), ataque:0.18, curva:2.5, pan:(R() - 0.5)*0.8, rev:0.9, eco:0.4 });
    },
    // Motor cohete: rugido de banda ancha que se aleja (baja de tono y de volumen) con chisporroteo de combustión
    cohete({ t=0, dur=1.1, vol=0.5, f=1500, crepita=0.5, pan0=-0.2, pan1=0.4, R=Math.random }){
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(); s.buffer = Rc.rosa; s.loop = true;
      fl.type = 'bandpass'; fl.Q.value = 0.55; fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(f*0.4, t + dur);
      s.connect(fl); const g2 = ctx.createGain(); fl.connect(sat(2, g2));
      const g = ruteo(g2, pan0, 0.4, 0.5); env(g, t, 0.03, vol, dur, 2.2);
      s.start(t, Math.random()); s.stop(t + dur*1.6);
      S.ruido({ t, dur:dur*0.9, tipo:'marron', filtro:'lowpass', f0:420, vol:vol*0.6, ataque:0.02, curva:2.4, pan:pan1, rev:0.3 });
      if(crepita) S.chispas({ t, dur:dur*0.8, densidad:90*crepita, vol:0.1*vol/0.5, f:3200, filtro:'highpass', q:0.7, rev:0.2, R });
    },
    // Barrido de ruido de banda estrecha (zumbido de turbina, viento)
    silbido({ t=0, dur=0.8, f0=600, f1=3200, vol=0.3, q=3, pan0=-0.3, pan1=0.4, rev=0.35, tipo='rosa' }){
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(); s.buffer = Rc[tipo]; s.loop = true;
      f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur*0.7);
      s.connect(f); const g = ruteo(f, pan0, rev); env(g, t, dur*0.12, vol, dur, 2.5);
      s.start(t, Math.random()); s.stop(t + dur*1.5);
    },
    // Metales de orquesta: dientes de sierra con paso bajo que se abre al atacar (soplo) y vibrato tardío
    bronce({ t=0, dur=1, f=220, vol=0.2, voces=3, des=8, pan=0, rev=0.55 }){
      const mezcla = ctx.createGain(); mezcla.gain.value = 1/Math.sqrt(voces);
      for(let v=0; v<voces; v++){
        const o = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = voces > 1 ? (v/(voces-1) - 0.5)*2*des : 0;
        l.frequency.value = 5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f*0.005, t + 0.5); l.connect(lg); lg.connect(o.frequency);
        o.connect(mezcla); o.start(t); o.stop(t + dur*1.6 + 0.05); l.start(t); l.stop(t + dur*1.6 + 0.05);
      }
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(f*1.2, t); lp.frequency.linearRampToValueAtTime(f*6, t + 0.07); lp.frequency.setTargetAtTime(f*3, t + 0.09, 0.2);
      mezcla.connect(lp); const g = ruteo(lp, pan, rev);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.06); g.gain.setValueAtTime(vol*0.85, t + dur*0.7); g.gain.setTargetAtTime(0.0001, t + dur*0.7, dur*0.15);
    },
    // Radio de campaña: apertura o cierre de canal (chasquido y soplo de estática en banda telefónica)
    canal({ t=0, vol=0.2, f=2000, cierre=false }){
      S.ruido({ t, dur:0.006, filtro:'bandpass', f0:1200, q:1.5, vol:vol*0.35, ataque:0.001, curva:3, rev:0 });   // clic suave
      S.ruido({ t:t + 0.004, dur:cierre ? 0.12 : 0.06, filtro:'bandpass', f0:f*0.7, q:0.9, vol:vol*0.4, ataque:0.006, curva:cierre ? 2.5 : 4, rev:0.05 });
    }
  };
  return S;
}

// ---------- Recetas ----------
// Cada receta recibe (S, R, f): sintetizador, aleatorio con semilla (variantes) y facción. Duración en DUR.
const r = (R, a, b) => a + (b - a)*R();
const ARMAS = {
  rifle(S, R, f){
    if(f==='atlas'){   // fusil electromagnético: chispa de bobina, chasquido muy seco y agudo, poco retroceso
      S.ruido({ dur:0.006, filtro:'highpass', f0:5500, vol:0.3, ataque:0.0005, curva:3, rev:0 });
      S.disparo({ t:0.004, calibre:0.55, brillo:1.5, vol:0.95 });
      S.metal({ t:0.004, base:r(R,5200,6000), parciales:[1, 1.41], dur:0.05, vol:0.025, rev:0.2 });
    } else if(f==='hierro'){   // fusil de batalla de calibre grande; casquillo que cae
      S.disparo({ calibre:0.85, brillo:0.9, vol:1 });
      S.metal({ t:r(R,0.32,0.4), base:r(R,2600,3100), parciales:[1, 2.7], dur:0.05, vol:0.02, rev:0.05 });
    } else {   // fusil viejo: más medios, saturado y con piezas flojas
      S.disparo({ calibre:0.75, brillo:0.8, sucio:0.8, vol:1 });
      S.ruido({ t:0.03, dur:0.03, filtro:'bandpass', f0:r(R,2600,3400), q:3, vol:0.07, ataque:0.001, curva:3, rev:0.05 });
    }
  },
  heroe(S, R, f){ S.disparo({ calibre:1.2, brillo: f==='atlas' ? 1.4 : 0.9, sucio: f==='guerrilla' ? 0.6 : 0, vol:1 }); },
  ametralla(S, R, f){
    const n = f==='hierro' ? 4 : 5, cal = f==='hierro' ? 1.0 : 0.7; let t = 0;
    for(let i=0; i<n; i++){ S.disparo({ t, calibre:cal*r(R,0.92,1.08), brillo: f==='atlas' ? 1.4 : 0.9, sucio: f==='guerrilla' ? 0.8 : 0, vol:r(R,0.75,0.9), cola:0, pan:r(R,-0.05,0.05) }); t += f==='hierro' ? r(R,0.085,0.1) : r(R,0.062,0.078); }
    S.ruido({ t:0.02, dur:t + 0.6, tipo:'rosa', filtro:'lowpass', f0:2000, f1:300, vol:0.22, ataque:0.05, curva:2.5, rev:0.7, eco:0.9 });
  },
  aa(S, R, f){   // cañón automático antiaéreo y estallidos de las granadas en el aire
    const n = f==='hierro' ? 3 : 4, paso = f==='hierro' ? 0.17 : 0.12;
    for(let i=0; i<n; i++) S.disparo({ t:i*paso, calibre:1.35, brillo: f==='atlas' ? 1.3 : 0.9, sucio: f==='guerrilla' ? 0.5 : 0, vol:0.85, cola:0 });
    S.ruido({ t:0.02, dur:1.2, tipo:'rosa', filtro:'lowpass', f0:1800, f1:300, vol:0.25, ataque:0.05, curva:2.5, rev:0.7, eco:0.9 });
    for(let i=0; i<n; i++) S.ruido({ t:0.55 + i*paso + r(R,0,0.05), dur:0.35, tipo:'marron', filtro:'lowpass', f0:1100, vol:0.22, ataque:0.003, curva:4, pan:r(R,-0.6,0.6), rev:0.8, eco:0.5 });
  },
  canon(S, R, f){
    if(f==='atlas'){   // cañón de riel: carga breve de capacitores, arco eléctrico y estampido
      S.tono({ dur:0.16, onda:'sine', f0:7000, f1:9800, vol:0.02, ataque:0.12, curva:1.5, rev:0.1 });
      S.chispas({ dur:0.16, densidad:140, vol:0.05, f:6500, filtro:'highpass', R: () => 1 - R()*R() });
      S.disparo({ t:0.15, calibre:2.2, brillo:1.4, vol:1 });
    } else if(f==='hierro'){   // cañón de gran calibre y cierre de la recámara
      S.disparo({ calibre:2.6, brillo:0.8, vol:1 });
      S.metal({ t:1.2, base:r(R,220,260), parciales:[1, 2.4, 3.9], dur:0.25, vol:0.05, rev:0.2, onda:'triangle' });
      S.ruido({ t:1.2, dur:0.03, filtro:'highpass', f0:2000, vol:0.12, ataque:0.001, curva:3, rev:0.1 });
    } else {   // cañón sin retroceso: chorro de gases y polvo levantado
      S.disparo({ calibre:2.0, brillo:0.8, sucio:0.8, vol:1 });
      S.ruido({ t:0.01, dur:0.6, tipo:'blanco', filtro:'bandpass', f0:900, q:0.5, vol:0.3, ataque:0.004, curva:3, rev:0.3 });
      S.escombros({ t:0.05, dur:0.6, vol:0.08, R });
    }
  },
  torre(S, R, f){ ARMAS.canon(S, R, f); },
  canonaval(S, R, f){ S.disparo({ calibre:3, brillo:0.75, vol:1 }); S.grave({ t:0.01, f0:48, f1:36, dur:1.1, vol:0.6, k:2 }); S.retumbo({ t:0.5, n:3, vol:0.35, R }); },
  obus(S, R, f){ S.disparo({ calibre:3, brillo:0.7, sucio: f==='guerrilla' ? 0.5 : 0, vol:1 }); S.retumbo({ t:0.45, n:3, vol:0.38, R }); },
  misil(S, R, f){   // lanzamiento: golpe de expulsión y motor que se aleja
    S.disparo({ calibre:1.1, brillo:0.9, vol:0.6, cola:0 });
    if(f==='atlas') S.cohete({ t:0.03, dur:1.0, vol:0.45, f:2000, crepita:0.25, R });
    else if(f==='hierro') S.cohete({ t:0.03, dur:1.2, vol:0.55, f:1300, crepita:0.45, R });
    else S.cohete({ t:0.03, dur:0.9, vol:0.5, f:1600, crepita:0.8, R });
  },
  cohete(S, R, f){ ARMAS.misil(S, R, f); },
  misilsam(S, R, f){ ARMAS.misil(S, R, 'atlas'); S.disparo({ t:0.22, calibre:1.0, brillo:1.0, vol:0.45, cola:0, pan:0.3 }); S.cohete({ t:0.25, dur:1.0, vol:0.35, f:2100, crepita:0.25, pan0:0.3, pan1:-0.3, R }); },
  antitanque(S, R, f){   // lanzador al hombro: contrafuego trasero, motor corto
    S.disparo({ calibre:1.6, brillo:0.85, sucio: f==='guerrilla' ? 0.7 : 0, vol:1 });
    S.ruido({ t:0.005, dur:0.4, tipo:'blanco', filtro:'bandpass', f0:1100, q:0.5, vol:0.32, ataque:0.003, curva:3, pan:-0.3, rev:0.3 });
    S.cohete({ t:0.06, dur:0.7, vol:0.4, f: f==='atlas' ? 2200 : 1500, crepita: f==='guerrilla' ? 0.9 : 0.35, R });
  },
  ametralladora(S, R, f){   // ametralladora pesada sobre la torre: ráfaga corta y grave, cadencia lenta y eco
    const n = 6; let t = 0;
    for(let i=0; i<n; i++){ S.disparo({ t, calibre:1.25*r(R,0.95,1.05), brillo: f==='atlas' ? 1.2 : 0.85, sucio: f==='guerrilla' ? 0.6 : 0, vol:r(R,0.8,0.92), cola:0, pan:r(R,-0.05,0.05) }); t += r(R,0.105,0.125); }
    S.ruido({ t:0.02, dur:t + 0.7, tipo:'rosa', filtro:'lowpass', f0:1800, f1:260, vol:0.26, ataque:0.05, curva:2.4, rev:0.7, eco:0.9 });
    S.chispas({ t:0.2, dur:t, densidad:14, vol:0.03, f:3800, filtro:'bandpass', q:3, R });   // casquillos sobre el blindaje
  },
  sinretroceso(S, R, f){   // cañón sin retroceso: estampido seco, chorro de gases hacia atrás y polvo
    S.disparo({ calibre:1.9, brillo:0.85, sucio: f==='guerrilla' ? 0.7 : 0.2, vol:1 });
    S.ruido({ t:0.005, dur:0.55, tipo:'blanco', filtro:'bandpass', f0:950, q:0.5, vol:0.32, ataque:0.003, curva:3, pan:-0.25, rev:0.3 });
    S.escombros({ t:0.05, dur:0.5, vol:0.07, R });
  },
  bomba(S, R, f){   // suelta: golpe del enganche y aire que corta la bomba al caer (ruido que crece, sin tonos)
    S.metal({ base:r(R,700,900), parciales:[1, 2.6], dur:0.08, vol:0.04, rev:0.2 });
    S.ruido({ t:0.04, dur:0.9, tipo:'rosa', filtro:'bandpass', f0:2200, f1:800, q:2.2, vol:0.2, ataque:0.75, curva:1.2, rev:0.4 });
  },
  minigun(S, R, f){   // motor eléctrico y ráfaga continua
    S.tono({ dur:1.0, onda:'sawtooth', f0:170, f1:215, vol:0.05, ataque:0.08, curva:1.5, lp:900, rev:0.05 });
    for(let i=0; i<30; i++) S.disparo({ t:0.06 + i*0.021, calibre:0.5, brillo:1.1, vol:0.5, cola:0, pan:r(R,-0.05,0.05) });
    S.ruido({ t:0.06, dur:1.2, tipo:'rosa', filtro:'lowpass', f0:2000, f1:300, vol:0.24, ataque:0.08, curva:2.2, rev:0.7, eco:0.9 });
    S.chispas({ t:0.15, dur:0.8, densidad:30, vol:0.035, f:4200, filtro:'bandpass', q:3, R });   // casquillos
  }
};
const EXPLOS = {
  boom(S, R){
    S.crack({ vol:0.5, ancho:0.0025 });
    S.ruido({ dur:0.25, filtro:'lowpass', f0:7000, f1:900, vol:0.9, ataque:0.0005, curva:5, k:3, rev:0.3 });   // estallido
    S.ruido({ dur:0.9, tipo:'marron', filtro:'lowpass', f0:160, vol:1, ataque:0.002, curva:3.5, k:3, rev:0.2 });   // onda de presión
    S.grave({ f0:r(R,56,66), f1:38, dur:0.6, vol:0.55, k:2 });
    S.ruido({ t:0.01, dur:1.4, tipo:'rosa', filtro:'lowpass', f0:2400, f1:250, vol:0.5, ataque:0.01, curva:3, k:2, rev:0.6, eco:0.7 });   // fuego y polvo
    S.escombros({ t:0.05, dur:1.2, vol:0.22, R });
  },
  big(S, R){
    S.crack({ vol:0.6, ancho:0.004 });
    S.ruido({ dur:0.4, filtro:'lowpass', f0:6000, f1:600, vol:1, ataque:0.0005, curva:5, k:4, rev:0.4 });
    S.ruido({ dur:1.6, tipo:'marron', filtro:'lowpass', f0:120, vol:1, ataque:0.003, curva:3, k:3.5, rev:0.3 });
    S.grave({ f0:r(R,44,52), f1:30, dur:1.3, vol:0.7, k:2.5 });
    S.ruido({ t:0.02, dur:2.6, tipo:'rosa', filtro:'lowpass', f0:2200, f1:160, vol:0.6, ataque:0.02, curva:2.6, k:2.5, rev:0.8, eco:0.8 });
    S.escombros({ t:0.1, dur:2.2, vol:0.28, R }); S.retumbo({ t:0.7, n:3, vol:0.4, R });
    for(let i=0; i<3; i++) S.metal({ t:r(R,0.6,1.8), base:r(R,600,1100), parciales:[1, 2.3, 4.1], dur:0.3, vol:0.03, rev:0.4 });   // fragmentos metálicos
  },
  bombazo(S, R){   // bomba de aviación: estallido enorme, presión muy grave, escombros que llueven y retumbo largo
    EXPLOS.big(S, R);
    S.grave({ t:0.01, f0:r(R,38,44), f1:24, dur:1.8, vol:0.75, k:2.5 });
    S.ruido({ t:0.05, dur:2.4, tipo:'marron', filtro:'lowpass', f0:90, vol:0.9, ataque:0.01, curva:2.2, k:3, rev:0.5 });
    S.escombros({ t:0.6, dur:2.4, vol:0.3, R }); S.retumbo({ t:1.2, n:4, vol:0.38, R });
  },
  edificio(S, R){
    EXPLOS.big(S, R);
    S.ruido({ t:0.6, dur:2.6, tipo:'marron', filtro:'lowpass', f0:650, f1:180, vol:0.55, ataque:0.35, curva:2, k:2, rev:0.7 });   // derrumbe
    S.escombros({ t:0.8, dur:2.8, vol:0.3, R });
    for(let i=0; i<4; i++) S.ruido({ t:0.5 + i*r(R,0.35,0.7), dur:0.8, tipo:'rosa', filtro:'bandpass', f0:r(R,350,750), f1:r(R,180,300), q:9, vol:0.06, ataque:0.12, curva:2, rev:0.6 });   // vigas que se doblan
  },
  caida(S, R){   // aeronave en barrena: turbina que pierde tono, rugido que se acerca e impacto
    S.silbido({ dur:1.6, f0:3600, f1:900, vol:0.22, q:5, pan0:-0.6, pan1:0.5 });
    S.ruido({ dur:1.6, tipo:'marron', filtro:'lowpass', f0:300, f1:700, vol:0.4, ataque:1.2, curva:1.2, rev:0.4 });
    const T = 1.5;
    S.crack({ t:T, vol:0.5, ancho:0.003 }); S.ruido({ t:T, dur:0.3, filtro:'lowpass', f0:6000, f1:800, vol:0.9, ataque:0.0005, curva:5, k:3, rev:0.3 });
    S.ruido({ t:T, dur:1.2, tipo:'marron', filtro:'lowpass', f0:150, vol:1, ataque:0.002, curva:3, k:3 }); S.grave({ t:T, f0:55, f1:36, dur:0.8, vol:0.6, k:2 });
    S.ruido({ t:T + 0.01, dur:1.8, tipo:'rosa', filtro:'lowpass', f0:2200, f1:200, vol:0.5, ataque:0.01, curva:3, rev:0.6, eco:0.7 });
    S.escombros({ t:T + 0.05, dur:1.6, vol:0.3, R });
  },
  hundimiento(S, R){   // casco que se parte, agua que entra y burbujeo (ruido resonante, sin tonos)
    EXPLOS.boom(S, R);
    S.ruido({ t:0.3, dur:3, tipo:'rosa', filtro:'lowpass', f0:800, f1:160, vol:0.4, ataque:0.5, curva:2, rev:0.6 });
    for(let i=0; i<16; i++) S.ruido({ t:0.7 + i*r(R,0.1,0.22), dur:r(R,0.04,0.1), tipo:'rosa', filtro:'bandpass', f0:r(R,220,520), f1:r(R,450,900), q:5, vol:0.1, ataque:0.006, curva:3, pan:r(R,-0.5,0.5), rev:0.35 });
    for(let i=0; i<2; i++) S.ruido({ t:1 + i*r(R,0.5,0.9), dur:1, tipo:'rosa', filtro:'bandpass', f0:r(R,300,600), f1:r(R,150,250), q:10, vol:0.06, ataque:0.2, curva:2, rev:0.6 });   // casco que cruje
  }
};
// Superarmas: cine, varias fases y reverberación larga
const SUPER = {
  'super-particulas-carga'(S, R){   // Atlas: zumbido de potencia que sube y arcos eléctricos crecientes
    S.tono({ dur:4.2, onda:'sawtooth', f0:55, f1:165, vol:0.3, voces:4, des:22, ataque:3.6, curva:0.8, k:2, lp:1400, rev:0.4 });
    S.ruido({ dur:4.2, filtro:'bandpass', f0:1500, f1:7000, q:2.5, vol:0.12, ataque:3.6, curva:0.8, rev:0.5 });
    S.chispas({ t:0.5, dur:3.6, densidad:90, vol:0.12, f:5000, filtro:'highpass', R: () => 1 - Math.pow(R(), 2.2) });
    S.grave({ t:3.9, f0:55, f1:40, dur:0.6, vol:0.6, k:2 });
  },
  'super-particulas-impacto'(S, R){
    S.crack({ vol:0.7, ancho:0.005 }); S.ruido({ dur:0.5, filtro:'highpass', f0:3000, f1:600, vol:0.7, ataque:0.0005, curva:4, rev:0.6 });
    S.ruido({ dur:2.4, tipo:'marron', filtro:'lowpass', f0:110, vol:1, ataque:0.003, curva:2.6, k:4, rev:0.4 }); S.grave({ f0:42, f1:28, dur:2.4, vol:0.8, k:3 });
    S.ruido({ dur:5.5, tipo:'rosa', filtro:'lowpass', f0:3000, f1:120, vol:0.8, rev:1, eco:0.8, k:3, curva:2.4 });
    S.chispas({ t:0.1, dur:3.5, densidad:110, vol:0.15, f:5500, filtro:'highpass', R });
    S.escombros({ t:0.2, dur:3.5, vol:0.3, R }); S.retumbo({ t:1.2, n:5, vol:0.45, R });
  },
  'super-nuclear-lanzamiento'(S, R){   // Hierro: sirena de silo, ignición y rugido que se aleja
    for(let i=0; i<3; i++) S.tono({ t:i*0.9, dur:0.8, onda:'sawtooth', f0:330, f1:520, vol:0.12, voces:2, des:12, ataque:0.3, curva:2, lp:1600, rev:0.6 });
    S.ruido({ t:2.4, dur:3.6, tipo:'marron', filtro:'lowpass', f0:200, f1:1400, vol:1, ataque:0.6, curva:1.6, k:3, rev:0.7 });
    S.grave({ t:2.4, f0:45, f1:34, dur:2.5, vol:0.7, k:3 }); S.cohete({ t:3.2, dur:2.6, vol:0.45, f:900, crepita:0.6, R });
  },
  'super-nuclear-impacto'(S, R){
    S.crack({ vol:0.8, ancho:0.008 }); S.ruido({ dur:0.6, filtro:'lowpass', f0:5000, f1:400, vol:1, ataque:0.0005, curva:4, k:4 });
    S.ruido({ dur:4, tipo:'marron', filtro:'lowpass', f0:90, vol:1, ataque:0.005, curva:2.4, k:5, rev:0.5 }); S.grave({ f0:38, f1:24, dur:4, vol:0.9, k:4 });
    S.ruido({ dur:9, tipo:'marron', filtro:'lowpass', f0:2400, f1:60, vol:1, rev:1, eco:0.6, k:4, curva:2.2 });
    S.ruido({ t:0.6, dur:6, tipo:'rosa', filtro:'bandpass', f0:300, f1:1600, q:0.8, vol:0.35, ataque:1.2, curva:1.8, rev:0.8 });   // onda de viento
    S.escombros({ t:0.4, dur:6, vol:0.35, R }); S.retumbo({ t:1.5, n:5, vol:0.5, R });
  },
  'super-cohetes-lanzamiento'(S, R){   // Guerrilla: andanada de cohetes que salen escalonados
    for(let i=0; i<14; i++){ const t = i*r(R,0.12,0.24); S.disparo({ t, calibre:0.9, brillo:0.9, sucio:0.6, vol:0.55, cola:0, pan:(R()-0.5)*1.2 }); S.cohete({ t:t + 0.02, dur:1.0, vol:0.25, f:r(R,1300,1800), crepita:0.7, pan0:(R()-0.5)*1.6, pan1:(R()-0.5)*1.6, R }); }
    S.ruido({ dur:3.6, tipo:'marron', filtro:'lowpass', f0:600, vol:0.5, ataque:0.3, curva:2, rev:0.8 });
  },
  'super-cohetes-impacto'(S, R){ for(let i=0; i<9; i++){ const t = i*r(R,0.15,0.35); S.crack({ t, vol:0.35, ancho:0.002, pan:(R()-0.5)*1.4 }); S.ruido({ t, dur:0.25, filtro:'lowpass', f0:6000, f1:800, vol:0.6, ataque:0.0005, curva:5, k:3, pan:(R()-0.5)*1.4, rev:0.3 }); S.ruido({ t, dur:0.9, tipo:'marron', filtro:'lowpass', f0:150, vol:0.8, ataque:0.002, curva:3.5, k:3 }); S.ruido({ t, dur:1.2, tipo:'rosa', filtro:'lowpass', f0:1800, f1:200, vol:0.4, rev:0.8, eco:0.6 }); } S.escombros({ t:0.2, dur:3, vol:0.25, R }); }
};
// Interfaz por facción: equipos reales (conmutadores, relés, radio), no pitidos de juguete
const UI = {
  click(S, R, f){
    if(f==='atlas'){ S.ruido({ dur:0.006, filtro:'bandpass', f0:4200, q:3, vol:0.5, ataque:0.0004, curva:3, rev:0.05 }); S.ruido({ t:0.012, dur:0.01, filtro:'bandpass', f0:2400, q:4, vol:0.25, ataque:0.0005, curva:3, rev:0.05 }); }   // tecla de consola
    else if(f==='hierro'){ S.ruido({ dur:0.008, filtro:'bandpass', f0:950, q:2.5, vol:0.45, ataque:0.0005, curva:3, rev:0 }); S.ruido({ t:0.004, dur:0.012, tipo:'marron', filtro:'lowpass', f0:500, vol:0.3, ataque:0.0005, curva:3, rev:0 }); }   // interruptor de baquelita: toc corto y apagado
    else { S.ruido({ dur:0.008, filtro:'bandpass', f0:1400, q:3, vol:0.55, ataque:0.0005, curva:3, rev:0.05 }); S.ruido({ t:0.03, dur:0.008, filtro:'bandpass', f0:1100, q:3, vol:0.35, ataque:0.0005, curva:3, rev:0.05 }); }   // perilla de radio
  },
  // Confirmación de orden: un «tum» corto y apagado (sin clic agudo), con un leve matiz por facción
  ack(S, R, f){ S.ruido({ dur:0.07, tipo:'marron', filtro:'lowpass', f0: f==='atlas' ? 900 : f==='hierro' ? 600 : 750, vol:0.5, ataque:0.004, curva:3.5, rev:0.05 }); S.tono({ dur:0.06, onda:'sine', f0: f==='atlas' ? 520 : f==='hierro' ? 330 : 420, vol:0.08, ataque:0.004, curva:3, rev:0.05 }); },
  ready(S, R, f){
    if(f==='atlas'){ S.canal({ vol:0.16, f:2600 }); S.tono({ t:0.06, dur:0.09, onda:'triangle', f0:1240, vol:0.07, lp:3000, rev:0.15 }); S.tono({ t:0.16, dur:0.12, onda:'triangle', f0:1240, vol:0.06, lp:3000, rev:0.15 }); }
    else if(f==='hierro'){ S.ruido({ dur:0.015, filtro:'bandpass', f0:1500, q:2, vol:0.5, ataque:0.0005, curva:3 }); S.metal({ t:0.01, base:240, parciales:[1, 2.4, 3.9], dur:0.35, vol:0.12, rev:0.3, onda:'triangle' }); }
    else { S.canal({ vol:0.18, f:2000 }); S.canal({ t:0.25, vol:0.12, f:2000, cierre:true }); }
  },
  place(S, R, f){ S.ruido({ dur:0.25, tipo:'marron', filtro:'lowpass', f0:300, vol:0.7, ataque:0.002, curva:4, k:2, rev:0.15 }); S.ruido({ dur:0.35, tipo:'rosa', filtro:'lowpass', f0:1400, f1:300, vol:0.3, rev:0.2 }); S.escombros({ dur:0.4, vol:0.08, R }); if(f==='hierro') S.metal({ t:0.04, base:420, parciales:[1, 2.2], dur:0.2, vol:0.05, onda:'triangle' }); },
  chime(S, R, f){   // construcción terminada
    if(f==='atlas'){ S.tono({ dur:0.5, onda:'triangle', f0:880, vol:0.07, lp:2600, rev:0.4 }); S.tono({ t:0.14, dur:0.7, onda:'triangle', f0:1318.5, vol:0.06, lp:2600, rev:0.45 }); }
    else if(f==='hierro'){ S.metal({ base:180, parciales:[1, 2.76, 5.4], dur:1.0, vol:0.12, rev:0.5, onda:'triangle' }); S.ruido({ dur:0.02, filtro:'bandpass', f0:1800, q:2, vol:0.3, ataque:0.0005, curva:3 }); }   // martillo sobre acero
    else { for(let i=0; i<2; i++) S.metal({ t:i*0.18, base:r(R,520,600), parciales:[1, 2.6, 4.3], dur:0.35, vol:0.08, rev:0.3, onda:'triangle' }); S.ruido({ dur:0.3, tipo:'marron', filtro:'lowpass', f0:600, vol:0.2 }); }   // herramienta y chapa
  },
  alert(S, R, f){
    if(f==='atlas') for(let i=0; i<2; i++){ S.tono({ t:i*0.5, dur:0.2, onda:'square', f0:880, vol:0.06, lp:2400, rev:0.3 }); S.tono({ t:i*0.5 + 0.22, dur:0.2, onda:'square', f0:660, vol:0.06, lp:2400, rev:0.3 }); }   // alarma de consola
    else if(f==='hierro') for(let i=0; i<2; i++) S.tono({ t:i*0.5, dur:0.4, onda:'sawtooth', f0:290, vol:0.12, voces:3, des:14, k:2, ataque:0.02, curva:1.6, lp:1800, rev:0.4 });   // bocina
    else S.tono({ dur:1.0, onda:'sawtooth', f0:380, f1:720, vol:0.09, voces:2, des:10, ataque:0.25, curva:1.4, lp:1500, rev:0.45 });   // sirena de manivela
  },
  capture(S, R, f){ UI.chime(S, R, f); },
  rank(S, R, f){ const b = f==='hierro' ? 130.8 : f==='guerrilla' ? 146.8 : 174.6; S.bronce({ dur:0.5, f:b, vol:0.14 }); S.bronce({ t:0.22, dur:1.4, f:b*1.5, vol:0.14 }); S.bronce({ t:0.22, dur:1.4, f:b*2, vol:0.1 }); S.grave({ t:0.22, f0:70, f1:60, dur:0.6, vol:0.4 }); },
  obj(S, R, f){ UI.ready(S, R, f); },
  radio(S, R, f){ S.canal({ vol:0.18, f: f==='atlas' ? 2800 : 2100 }); if(f==='guerrilla') S.chispas({ dur:0.2, densidad:80, vol:0.04, f:2500, R }); },
  win(S, R, f){ const b = f==='hierro' ? 65.4 : f==='guerrilla' ? 82.4 : 73.4; [[0,7,12],[5,9,12],[7,11,14],[12,16,19]].forEach((ch, i) => ch.forEach(s => S.bronce({ t:i*0.55, dur:i===3 ? 2.2 : 0.6, f:b*2*Math.pow(2, s/12), vol:0.08 }))); for(let i=0; i<4; i++) S.grave({ t:i*0.55, f0:70, f1:62, dur:0.5, vol:0.5 }); },
  lose(S, R, f){ const b = f==='hierro' ? 65.4 : f==='guerrilla' ? 82.4 : 73.4; [[0,3,7],[-2,2,5],[-4,0,3],[-5,-2,2]].forEach((ch, i) => ch.forEach(s => S.bronce({ t:i*0.75, dur:i===3 ? 2.2 : 0.8, f:b*2*Math.pow(2, s/12), vol:0.07, des:5 }))); S.ruido({ dur:3.5, tipo:'marron', filtro:'lowpass', f0:200, vol:0.4, ataque:0.6, rev:1 }); },
  squelch(S, R, f){ S.canal({ vol:0.2, f: f==='atlas' ? 2800 : f==='hierro' ? 1700 : 2100 }); },
  'squelch-fin'(S, R, f){ S.canal({ vol:0.16, f: f==='atlas' ? 2800 : f==='hierro' ? 1700 : 2100, cierre:true }); if(f==='guerrilla') S.chispas({ dur:0.15, densidad:80, vol:0.04, f:2500, R }); }
};
// Instrumentos de la música (se generan una vez y se reproducen con cambio de velocidad)
const INSTR = {
  'm-bombo'(S){ S.grave({ f0:110, f1:42, dur:0.45, vol:1, k:2.5, rev:0.1 }); S.ruido({ dur:0.02, filtro:'lowpass', f0:3000, vol:0.3 }); },
  'm-tambor'(S){ S.grave({ f0:150, f1:85, dur:0.5, vol:0.9, k:2, rev:0.35 }); S.ruido({ dur:0.15, tipo:'rosa', filtro:'bandpass', f0:500, q:0.8, vol:0.3, rev:0.3 }); },
  'm-taiko'(S){ S.grave({ f0:85, f1:48, dur:1.0, vol:1, k:3, rev:0.5 }); S.ruido({ dur:0.3, tipo:'marron', filtro:'lowpass', f0:700, vol:0.5, rev:0.5 }); },
  'm-caja'(S){ S.ruido({ dur:0.18, filtro:'bandpass', f0:2200, q:0.7, vol:0.6, rev:0.3 }); S.tono({ dur:0.08, f0:240, f1:180, vol:0.4 }); },
  'm-plato'(S){ S.ruido({ dur:0.06, filtro:'highpass', f0:7000, vol:0.35, rev:0.2 }); },
  'm-yunque'(S){ S.metal({ base:520, parciales:[1, 2.76, 5.4, 8.9, 13.3], dur:0.9, vol:0.45, rev:0.4 }); },
  'm-dum'(S){ S.grave({ f0:120, f1:75, dur:0.35, vol:0.9, rev:0.3 }); S.ruido({ dur:0.04, tipo:'rosa', filtro:'lowpass', f0:900, vol:0.3 }); },
  'm-tek'(S){ S.ruido({ dur:0.06, filtro:'bandpass', f0:3200, q:2, vol:0.7, rev:0.25 }); S.tono({ dur:0.03, f0:900, vol:0.2 }); },
  'm-campana'(S){ S.metal({ base:440, parciales:[1, 2, 3.01, 4.2], dur:2.6, vol:0.35, rev:0.6 }); },
  'm-metal'(S){ S.tono({ dur:1.4, onda:'sawtooth', f0:110, vol:0.3, voces:3, des:9, ataque:0.05, curva:2, k:1.5, rev:0.5 }); },
  'm-pulsada'(S, R){ /* cuerda pulsada (Karplus-Strong simplificado con ruido filtrado y tono) */ S.tono({ dur:1.2, onda:'triangle', f0:220, vol:0.35, ataque:0.002, curva:3, rev:0.45 }); S.tono({ dur:0.6, onda:'sawtooth', f0:220, vol:0.08, curva:5 }); S.ruido({ dur:0.03, filtro:'bandpass', f0:2200, q:2, vol:0.3 }); },
  'm-bajo'(S){ S.tono({ dur:0.5, onda:'sawtooth', f0:55, vol:0.45, voces:2, des:7, ataque:0.004, curva:3, k:1.8, rev:0.05 }); S.tono({ dur:0.5, onda:'sine', f0:55, vol:0.5, curva:2.5 }); },
  'm-impacto'(S, R){ S.grave({ f0:70, f1:24, dur:1.6, vol:1, k:4, rev:0.7 }); S.ruido({ dur:2.2, tipo:'marron', filtro:'lowpass', f0:1600, f1:100, vol:0.7, rev:0.9 }); S.metal({ base:180, parciales:[1, 2.3, 3.8], dur:1.4, vol:0.12, rev:0.8 }); },
  'm-subida'(S){ S.ruido({ dur:2.2, tipo:'blanco', filtro:'bandpass', f0:300, f1:6000, q:2, vol:0.35, ataque:2, curva:0.5, rev:0.6 }); S.tono({ dur:2.2, onda:'sawtooth', f0:110, f1:440, vol:0.06, voces:3, des:20, ataque:2, curva:0.5, rev:0.5 }); }
};
// Tema principal (menú y partida): marcha militar sobria en re menor, 84 pulsos por minuto, 16 compases en bucle.
// Notas fijas (sin deslizamientos): cuerdas de fondo, bajo, timbales con redobles, caja militar y melodía de cornos.
const TEMA_BPM = 84, TEMA_COMPASES = 16, TEMA_PULSO = 60/TEMA_BPM, TEMA_DUR = TEMA_COMPASES*4*TEMA_PULSO;
const SEMI = { C:-9, 'C#':-8, D:-7, Eb:-6, E:-5, F:-4, 'F#':-3, G:-2, Ab:-1, A:0, Bb:1, B:2 };
const NOTA = (n, o) => 440*Math.pow(2, (SEMI[n] + (o - 4)*12)/12);
INSTR['m-tema'] = (S) => {
  const P = TEMA_PULSO, C = 4*P;
  // Acordes de dos compases: primera mitad Dm Bb F C; segunda mitad Dm Bb Gm A (cadencia que vuelve a re)
  const acordes = [
    [['D',3],['F',3],['A',3]], [['Bb',2],['D',3],['F',3]], [['F',3],['A',3],['C',4]], [['C',3],['E',3],['G',3]],
    [['D',3],['F',3],['A',3]], [['Bb',2],['D',3],['F',3]], [['G',2],['Bb',2],['D',3]], [['A',2],['C#',3],['E',3]]
  ];
  acordes.forEach((ac, i) => {
    const t = i*2*C, raiz = ac[0];
    for(const [n, o] of ac) S.tono({ t, dur:2*C + 0.4, onda:'sawtooth', f0:NOTA(n, o), vol:0.05, voces:3, des:7, ataque:0.7, curva:1.1, lp:1100, rev:0.6 });   // cuerdas
    S.tono({ t, dur:2*C, onda:'sine', f0:NOTA(raiz[0], raiz[1] - 1), vol:0.22, ataque:0.06, curva:1.4, rev:0.15 });                                      // bajo
    S.tono({ t, dur:2*C, onda:'triangle', f0:NOTA(raiz[0], raiz[1] - 1), vol:0.06, ataque:0.06, curva:1.6, lp:400, rev:0.1 });
    // timbal en el primer pulso de cada acorde y en el tercero del segundo compás
    for(const tt of [t, t + C + 2*P]) { S.grave({ t:tt, f0:NOTA(raiz[0], 2), f1:NOTA(raiz[0], 2)*0.97, dur:1.3, vol:0.45, k:1.4, rev:0.5 }); S.ruido({ t:tt, dur:0.25, tipo:'marron', filtro:'lowpass', f0:500, vol:0.25, ataque:0.002, curva:4, rev:0.4 }); }
  });
  // Redobles de timbal antes de la segunda mitad y antes de volver al inicio
  for(const fin of [8*C, 16*C]) for(let k=0; k<8; k++){ const tt = fin - P*2 + k*P/4; S.grave({ t:tt, f0:NOTA('A', 2), f1:NOTA('A', 2)*0.97, dur:0.5, vol:0.12 + k*0.03, k:1.3, rev:0.5 }); }
  // Caja militar suave en la segunda mitad: pulsos 1 a 3 y un floreo en el 4
  for(let bar=8; bar<16; bar++) for(const [b, v] of [[0, 0.07], [1, 0.05], [2, 0.06], [3, 0.05], [3.5, 0.04], [3.75, 0.05]]) {
    const tt = bar*C + b*P; S.ruido({ t:tt, dur:0.12, filtro:'bandpass', f0:2300, q:0.8, vol:v, ataque:0.001, curva:4, rev:0.35 }); S.tono({ t:tt, dur:0.06, f0:210, vol:v*0.8, curva:3, rev:0.2 });
  }
  // Melodía de cornos (compases 5 a 8 y 13 a 16): [nota, octava, pulsos]; null es silencio
  const corno = (inicio, frase) => { let t = inicio*C; for(const [n, o, d] of frase){ if(n) S.bronce({ t, dur:d*P*0.95, f:NOTA(n, o), vol:0.11, voces:3, des:6, rev:0.6 }); t += d*P; } };
  corno(4, [['A',4,1],['D',5,1],['C',5,1],['A',4,1], ['Bb',4,2],['A',4,1],['F',4,1], ['A',4,2],['G',4,1],['F',4,1], ['E',4,3],[null,0,1]]);
  corno(12, [['A',4,1],['D',5,1],['E',5,1],['F',5,1], ['D',5,2],['Bb',4,2], ['G',4,1],['Bb',4,1],['D',5,1],['C',5,1], ['C#',5,3],[null,0,1]]);
};
const DUR = { ametralladora:2.0, sinretroceso:2.6, bomba:1.2, bombazo:6.0, rifle:1.6, heroe:1.8, ametralla:2.0, aa:2.2, canon:3.0, torre:3.0, canonaval:4.0, obus:4.0, misil:2.0, cohete:2.0, misilsam:2.2, antitanque:2.2, minigun:2.4,
  boom:3.0, big:4.5, edificio:5.5, caida:4.4, hundimiento:4.5, squelch:0.25, 'squelch-fin':0.35,
  'super-particulas-carga':5, 'super-particulas-impacto':8, 'super-nuclear-lanzamiento':6.5, 'super-nuclear-impacto':11, 'super-cohetes-lanzamiento':4.5, 'super-cohetes-impacto':4,
  click:0.2, ack:0.4, ready:0.8, place:0.6, chime:1.6, alert:1.1, capture:1.6, rank:2.2, obj:0.8, radio:0.4, win:3.8, lose:4.2,
  'm-bombo':0.6, 'm-tambor':0.8, 'm-taiko':1.4, 'm-caja':0.4, 'm-plato':0.2, 'm-yunque':1.4, 'm-dum':0.5, 'm-tek':0.3, 'm-campana':3, 'm-metal':1.8, 'm-pulsada':1.6, 'm-bajo':0.7, 'm-impacto':2.8, 'm-subida':2.6, 'm-tema':TEMA_DUR + 1.5 };
// Volumen final de cada familia tras normalizar (interfaz más baja que las armas; explosiones al máximo)
// Los clics de la interfaz son los más frecuentes: van más bajos que el resto (el de Hierro, un poco más)
const NIVEL = k => /^m-/.test(k) ? 0.8 : /^super/.test(k) ? 1 : k==='click-hierro' ? 0.2 : base(k)==='click' ? 0.26 : base(k)==='ack' ? 0.22 : /^squelch/.test(base(k)) ? 0.2 : UI[base(k)] ? 0.42 : EXPLOS[k] ? 0.95 : 0.8;
const base = k => k.replace(/-(atlas|hierro|guerrilla)$/, '');
const faccionDe = k => (k.match(/-(atlas|hierro|guerrilla)$/) || [])[1] || 'atlas';
function receta(k){
  const b = base(k), f = faccionDe(k);
  if(SUPER[k]) return { fn:SUPER[k], grande:true };
  if(INSTR[k]) return { fn:INSTR[k] };
  if(ARMAS[b]) return { fn:(S, R) => ARMAS[b](S, R, f) };
  if(EXPLOS[b]) return { fn:EXPLOS[b], grande: b!=='boom' };
  if(UI[b]) return { fn:(S, R) => UI[b](S, R, f) };
  return null;
}
function rngSemilla(s){ let a = s>>>0 || 1; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a>>>15, 1|a); t = t + Math.imul(t ^ t>>>7, 61|t) ^ t; return ((t ^ t>>>14)>>>0)/4294967296; }; }
const hash = s => { let h = 2166136261; for(const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h>>>0; };

// Renderiza una clave a un AudioBuffer estéreo normalizado
async function renderizar(clave, semilla=0, sr=44100){
  const rc = receta(clave); if(!rc) throw new Error('Sonido desconocido: ' + clave);
  const dur = DUR[base(clave)] || DUR[clave] || 1.5;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr*dur), sr);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.15; comp.connect(ctx.destination);
  const S = sintetizador(ctx, comp, rc.grande);
  rc.fn(S, rngSemilla(hash(clave) + semilla*7919));
  const buf = await ctx.startRendering();
  let pico = 0; for(let c=0; c<buf.numberOfChannels; c++){ const d = buf.getChannelData(c); for(let i=0; i<d.length; i++){ const a = Math.abs(d[i]); if(a > pico) pico = a; } }
  const g = pico > 0 ? NIVEL(clave)/pico : 1;
  for(let c=0; c<buf.numberOfChannels; c++){ const d = buf.getChannelData(c); for(let i=0; i<d.length; i++) d[i] *= g; const fin = Math.min(d.length, Math.floor(sr*0.03)); for(let i=0; i<fin; i++) d[d.length-1-i] *= i/fin; }
  return buf;
}
function aWav(buf){
  const ch = buf.numberOfChannels, n = buf.length, v = new DataView(new ArrayBuffer(44 + n*ch*2)), w = (o, s) => { for(let i=0; i<s.length; i++) v.setUint8(o+i, s.charCodeAt(i)); };
  w(0,'RIFF'); v.setUint32(4, 36 + n*ch*2, true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,ch,true);
  v.setUint32(24,buf.sampleRate,true); v.setUint32(28,buf.sampleRate*ch*2,true); v.setUint16(32,ch*2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*ch*2,true);
  const cs = [...Array(ch)].map((_, c) => buf.getChannelData(c)); let o = 44;
  for(let i=0; i<n; i++) for(let c=0; c<ch; c++){ const s = Math.max(-1, Math.min(1, cs[c][i])); v.setInt16(o, s < 0 ? s*0x8000 : s*0x7fff, true); o += 2; }
  return new Uint8Array(v.buffer);
}
// Lista de claves que el estudio puede generar como marcadores
function claves(){
  const out = [];
  for(const b of Object.keys(ARMAS)) for(const f of FAC) out.push(`${b}-${f}`);
  out.push(...Object.keys(EXPLOS), ...Object.keys(SUPER));
  for(const b of Object.keys(UI)) for(const f of FAC) out.push(`${b}-${f}`);
  return out;
}

// ---------- Música adaptativa: concentración ↔ combate ----------
const MUS = {
  atlas:    { raiz:73.42, calma:76, combate:120, acordes:[[0,7,14],[-3,4,11],[5,12,16],[2,9,14]], escala:[0,2,4,7,9,11,14], voz:'m-campana', golpe:'m-bombo', tambor:'m-tambor', extra:'m-plato' },
  hierro:   { raiz:65.41, calma:72, combate:104, acordes:[[0,7,15],[-4,3,10],[-2,5,12],[-5,2,10]], escala:[0,2,3,5,7,8,10], voz:'m-metal', golpe:'m-taiko', tambor:'m-tambor', extra:'m-yunque' },
  guerrilla:{ raiz:82.41, calma:78, combate:116, acordes:[[0,7,13],[1,8,13],[0,7,12],[-2,5,10]], escala:[0,1,4,5,7,8,10], voz:'m-pulsada', golpe:'m-dum', tambor:'m-tek', extra:'m-caja' }
};
// Patrones de combate por facción (16 pasos): 1 = golpe, 2 = acento
const PATRON = {
  atlas:    { golpe:'2000100020001010', tambor:'0010001000100011', extra:'1010101010101010', bajo:'1011101110111011' },
  hierro:   { golpe:'2000000010000000', tambor:'0000200000002000', extra:'0000100000001000', bajo:'1000100010001010' },
  guerrilla:{ golpe:'2001001020010010', tambor:'0110110101101101', extra:'0000100000001000', bajo:'1001001010010010' }
};
class Motor {
  constructor(ctx, destino){
    this.ctx = ctx; this.buf = new Map(); this.pend = new Map(); this.archivos = new Map(); this.voces = 0;
    // Mezcla: efectos y música por separado, compresor maestro que evita saturar en batallas grandes
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.attack.value = 0.003; this.comp.release.value = 0.25; this.comp.connect(destino);
    this.efectos = ctx.createGain(); this.efectos.connect(this.comp);
    this.musica = ctx.createGain(); this.musica.gain.value = 0.32; this.musica.connect(this.comp);
    this.temaG = ctx.createGain(); this.temaG.gain.value = 0; this.temaG.connect(this.musica);   // tema principal en bucle
    this.amb = ctx.createGain(); this.amb.gain.value = 0; this.amb.connect(this.comp);
    this.rev = ctx.createConvolver(); this.rev.buffer = recursos(ctx).irCorta; this.rev.connect(this.efectos);
    this.cola = []; this.trabajando = false;
    this.musicaModo = 'ambiente';   // 'adaptativa' | 'ambiente' (solo viento) | 'no'
    this.c = 0; this.modo = 'calma'; this.faccion = 'atlas'; this.paso = 0; this.sig = 0; this.compas = 0; this.activa = false; this.hasta = 0;
  }
  // Archivos reales (ElevenLabs, estudio de grabación) que reemplazan la síntesis: lista de audio/audio.json
  cargarArchivos(lista, ruta='audio/'){
    for(const n of lista){ const k = n.replace(/\.(ogg|mp3|wav)$/i, '');
      fetch(ruta + n).then(r => r.ok ? r.arrayBuffer() : null).then(a => a && this.ctx.decodeAudioData(a)).then(b => { if(b) this.archivos.set(k, b); }).catch(() => {}); }
  }
  // Prepara variantes de una clave en segundo plano (una a la vez para no trabar el juego)
  preparar(clave, variantes=2, primero=false){
    if(this.buf.has(clave) || this.pend.has(clave)) return;
    this.pend.set(clave, true); this.cola[primero ? 'unshift' : 'push']([clave, variantes]); this._procesar();
  }
  async _procesar(){
    if(this.trabajando) return; this.trabajando = true;
    while(this.cola.length){
      const [clave, n] = this.cola.shift(), lista = [];
      for(let v=0; v<n; v++){ try { lista.push(await renderizar(clave, v)); } catch(e){ break; } await new Promise(r => setTimeout(r, 0)); }
      if(lista.length) this.buf.set(clave, lista); this.pend.delete(clave);
    }
    this.trabajando = false;
  }
  _buffer(b, f){
    const k1 = f ? `${b}-${f}` : b;
    if(this.archivos.has(k1)) return this.archivos.get(k1);
    if(this.archivos.has(b)) return this.archivos.get(b);
    const k = receta(k1) ? k1 : b;
    const l = this.buf.get(k); if(!l){ this.preparar(k); return null; }
    return l[Math.floor(Math.random()*l.length)];
  }
  // Reproduce: vol (0..1), pan (−1..1), lejos (0..1: atenúa agudos y suma reverberación)
  tocar(b, f, { vol=1, pan=0, lejos=0, vel=1 } = {}){
    const buf = this._buffer(b, f); if(!buf || this.voces > 28) return false;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), lp = c.createBiquadFilter();
    s.buffer = buf; s.playbackRate.value = vel*(0.96 + Math.random()*0.08);
    lp.type = 'lowpass'; lp.frequency.value = 18000 - 15500*lejos; g.gain.value = vol;
    s.connect(lp); lp.connect(g);
    let n = g; if(c.createStereoPanner){ const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); n = p; }
    n.connect(this.efectos); if(lejos > 0.05){ const e = c.createGain(); e.gain.value = 0.25 + lejos*0.5; n.connect(e); e.connect(this.rev); }
    this.voces++; s.onended = () => { this.voces--; }; s.start(); return true;
  }
  // Voces grabadas: primer prefijo con archivos cargados (variantes -1, -2…); se elige una al azar
  archivoVoz(prefijos){
    for(const p of prefijos){ const l = []; for(const [k, b] of this.archivos) if(k.startsWith(p)) l.push(b); if(l.length) return l[Math.floor(Math.random()*l.length)]; }
    return null;
  }
  // Reproduce una voz por un canal de radio: banda telefónica, saturación leve y chasquidos de apertura y cierre
  tocarRadio(buf, vol=0.8, f='atlas'){
    const c = this.ctx, s = c.createBufferSource(), hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), w = c.createWaveShaper(), g = c.createGain();
    // Las voces grabadas ya vienen procesadas como radio de campo (despliegue: voces/procesar.py): aquí solo se limpia el extremo
    hp.type = 'highpass'; hp.frequency.value = 150; lp.type = 'lowpass'; lp.frequency.value = 7000; w.curve = curvaSat(1);
    s.buffer = buf; g.gain.value = Math.min(2.2, vol*2.2); s.connect(hp); hp.connect(lp); lp.connect(w); w.connect(g); g.connect(this.efectos);
    this.tocar('squelch', f, { vol:0.7 }); s.start(c.currentTime + 0.05);
    s.onended = () => this.tocar('squelch-fin', f, { vol:0.7 });
  }
  // Baja la música unos segundos (superarmas, explosiones enormes)
  agachar(seg=3){ const t = this.ctx.currentTime; this.musica.gain.cancelScheduledValues(t); this.musica.gain.setTargetAtTime(0.08, t, 0.08); this.musica.gain.setTargetAtTime(0.32, t + seg, 1.2); }

  // --- Música ---
  modoMusica(modo){
    this.musicaModo = modo; if(!this.activa) return; const t = this.ctx.currentTime;
    this.temaG.gain.setTargetAtTime(modo==='no' ? 0 : 0.85, t, 1.2);   // sin viento ni colchón grave: solo el tema
  }
  _arrancarTema(buf){
    if(this.temaSrc || !this.activa) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0; s.loopEnd = Math.min(buf.duration, TEMA_DUR);
    s.connect(this.temaG); s.start(); this.temaSrc = s;
    this.temaG.gain.setTargetAtTime(this.musicaModo==='no' ? 0 : 0.85, this.ctx.currentTime, 1.5);
  }
  iniciarMusica(f){
    this.faccion = MUS[f] ? f : 'atlas';
    for(const k of ['m-bombo','m-tambor','m-taiko','m-caja','m-plato','m-yunque','m-dum','m-tek','m-campana','m-metal','m-pulsada','m-bajo','m-impacto','m-subida']) this.preparar(k, 1, true);
    if(this.activa) return; this.activa = true;
    const c = this.ctx, M = MUS[this.faccion];
    // Colchón: tres voces de sierras desafinadas por un pasa bajos que respira; sub-bajo; viento del desierto
    // Colchón sobrio: tónica y quinta graves en triángulo, apenas desafinadas, con filtro fijo (sin barridos ni deslizamientos de tono)
    this.pad = c.createGain(); this.pad.gain.value = 0; this.padF = c.createBiquadFilter(); this.padF.type = 'lowpass'; this.padF.frequency.value = 420; this.padF.Q.value = 0.4;
    this.padF.connect(this.pad); this.pad.connect(this.musica);
    this.osc = [];
    for(let v=0; v<2; v++) for(const d of [-3, 3]){ const o = c.createOscillator(); o.type = 'triangle'; o.detune.value = d; o.connect(this.padF); o.start(); this.osc.push(o); }
    this.sub = c.createOscillator(); this.sub.type = 'sine'; this.subG = c.createGain(); this.subG.gain.value = 0.0; this.sub.connect(this.subG); this.subG.connect(this.musica); this.sub.start();
    const vs = c.createBufferSource(), vf = c.createBiquadFilter(), vl = c.createOscillator(), vlg = c.createGain();
    vs.buffer = recursos(c).rosa; vs.loop = true; vf.type = 'lowpass'; vf.frequency.value = 650; vf.Q.value = 0.3; vl.frequency.value = 0.03; vlg.gain.value = 90; vl.connect(vlg); vlg.connect(vf.frequency);
    vs.connect(vf); vf.connect(this.amb); vs.start(); vl.start(); this.amb.gain.value = 0;   // el viento ya no suena (era un zumbido continuo)
    this.preparar('m-tema', 1, true);
    clearInterval(this.temaEspera); this.temaEspera = setInterval(() => { const l = this.buf.get('m-tema'); if(!l || !this.activa) return; clearInterval(this.temaEspera); this._arrancarTema(l[0]); }, 300);
    this.acorde(0, c.currentTime);

    this.sig = c.currentTime + 0.2; this.paso = 0; this.compas = 0;
    this.timer = setInterval(() => this._programar(), 40);
  }
  detenerMusica(){ if(!this.activa) return; this.activa = false; clearInterval(this.timer); clearInterval(this.temaEspera); const t = this.ctx.currentTime;
    if(this.temaSrc){ const s = this.temaSrc; this.temaSrc = null; this.temaG.gain.setTargetAtTime(0, t, 0.6); setTimeout(() => { try { s.stop(); } catch(e){} }, 3000); } this.pad.gain.setTargetAtTime(0, t, 0.6); this.subG.gain.setTargetAtTime(0, t, 0.6); this.amb.gain.setTargetAtTime(0, t, 0.6);
    const os = this.osc.concat([this.sub]); setTimeout(() => os.forEach(o => { try { o.stop(); } catch(e){} }), 3000); }
  acorde(i, t){
    const M = MUS[this.faccion], raiz = M.acordes[i % M.acordes.length][0], ivs = [0, 7];
    this.osc.forEach((o, k) => o.frequency.setValueAtTime(M.raiz*Math.pow(2, (raiz + ivs[Math.floor(k/2)])/12), t));
    this.sub.frequency.setValueAtTime(M.raiz/2*Math.pow(2, raiz/12), t);
  }
  // Intensidad del combate: los disparos y bajas cercanas suman; se apaga sola
  combate(x){ this.c = Math.min(1, this.c + x); this.hasta = this.ctx.currentTime + 7; }
  _uno(k, t, vol, vel=1){
    const l = this.buf.get(k); if(!l) return; const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = l[0]; s.playbackRate.value = vel; g.gain.value = vol; s.connect(g); g.connect(this.musica); s.start(t);
  }
  _programar(){
    const c = this.ctx, M = MUS[this.faccion], P = PATRON[this.faccion];
    // La intensidad decae si no hay combate; el modo cambia con histéresis al empezar cada compás
    const ahora = c.currentTime; if(ahora > this.hasta) this.c = Math.max(0, this.c - 0.012);
    if(this.musicaModo !== 'adaptativa'){ this.sig = Math.max(this.sig, ahora); return; }
    while(this.sig < ahora + 0.15){
      const t = this.sig, p = this.paso % 16;
      if(p === 0){
        const antes = this.modo;
        if(this.modo==='calma' && this.c > 0.45) this.modo = 'combate';
        else if(this.modo==='combate' && this.c < 0.1) this.modo = 'calma';
        if(antes !== this.modo){
          if(this.modo==='combate') this._uno('m-impacto', t, 0.6);
        }

        if(this.modo==='combate' && this.compas % 8 === 4) this._uno('m-impacto', t, 0.35);
        this.compas++;
      }
      const tempo = this.modo==='combate' ? M.combate : M.calma, dt = 60/tempo/4;
      if(this.modo==='combate'){
        const acc = (pat, i) => pat[i]==='2' ? 1 : pat[i]==='1' ? 0.6 : 0;
        let v;
        if((v = acc(P.golpe, p))) this._uno(M.golpe, t, 0.75*v);
        if((v = acc(P.tambor, p))) this._uno(M.tambor, t, 0.45*v, this.faccion==='guerrilla' ? 1 : 1 + (p%4)*0.06);
        if((v = acc(P.extra, p))) this._uno(M.extra, t, this.faccion==='hierro' ? 0.25*v : 0.18*v);
        if(P.bajo[p]==='1'){ const s = M.acordes[Math.floor((this.compas-1)/8) % M.acordes.length][0]; this._uno('m-bajo', t, 0.42, M.raiz/55*Math.pow(2, s/12)); }
      } else {
        // Concentración: pulso grave como un latido y un tambor lejano cada cuatro compases; sin melodía

      }
      this.sig += dt; this.paso++;
    }
  }
}
// ---------- Voces de las unidades ----------
// Frases por facción, evento y categoría de unidad. Español neutro y sin tuteo. «_» vale para cualquier categoría.
const FRASES = {
  atlas: {   // técnica y serena
    seleccion: { infanteria:['Unidad en línea.', 'Le escucho, comandante.', 'Escuadra lista.', 'Esperando instrucciones.'], vehiculo:['Sistemas en verde.', 'Blindado listo.', 'Tripulación a la escucha.'],
      aereo:['Piloto en espera.', 'Cabina lista.'], naval:['Puente a la escucha.', 'Navío listo.'], constructor:['Ingeniería en línea.', 'Plataforma lista.'], recolector:['Carga en espera.', 'Rotores listos.'], heroe:['Comando a la escucha.', 'Aquí el comandante de operaciones.'] },
    mover: { _:['Recibido.', 'En ruta.', 'Coordenadas fijadas.', 'Afirmativo.', 'Nos movemos.'], aereo:['Rumbo fijado.', 'En vuelo.'], naval:['Rumbo fijado.', 'Avante.'], recolector:['Ruta de carga confirmada.'] },
    atacar: { _:['Objetivo fijado.', 'Abriendo fuego.', 'Blanco confirmado.', 'Enganchando.'], aereo:['Iniciando pasada de ataque.'] },
    listo: { _:['Unidad desplegada.', 'Lista para el servicio.'] },
    construir: { _:['Iniciando construcción.', 'Montaje en curso.'] }
  },
  hierro: {   // disciplinada y seca
    seleccion: { infanteria:['¡Presente!', '¡A la orden!', '¡Firmes, comandante!', '¿Órdenes?'], vehiculo:['Blindado listo.', 'Tripulación en sus puestos.', 'El acero responde.'],
      aereo:['Rotores en marcha.', 'Helicóptero en espera.'], naval:['Monitor listo.', 'Cubierta en orden.'], constructor:['Brigada de obras lista.'], recolector:['Camión listo para la mina.'], heroe:['El mariscal escucha.', 'Hable, comandante.'] },
    mover: { _:['¡Entendido!', '¡En marcha!', '¡Avanzamos!', 'Orden recibida.', '¡Sin retroceder!'] },
    atacar: { _:['¡Fuego!', '¡Al ataque!', '¡Por el Frente!', '¡Aplástenlos!'] },
    listo: { _:['Unidad formada.', 'Lista para el frente.'] },
    construir: { _:['Levantando la obra.', 'A construir.'] }
  },
  guerrilla: {   // cercana pero sin tuteo
    seleccion: { infanteria:['Aquí estamos.', 'Diga, comandante.', 'Listos.', '¿Qué se ofrece?'], vehiculo:['El motor aguanta.', 'Técnica lista.'],
      aereo:['Listos en el aire.'], naval:['Lancha lista.'], constructor:['Manos a la obra.'], recolector:['Listos para cargar.'], heroe:['El comandante escucha.', 'Hable.'] },
    mover: { _:['Vamos.', 'Andando.', 'Entendido.', 'Por el monte.', 'Nos movemos.'] },
    atacar: { _:['¡Fuego!', '¡Duro con ellos!', '¡Emboscada!', '¡Vamos por ellos!'] },
    listo: { _:['Listos para pelear.', 'Gente nueva en el campamento.'] },
    construir: { _:['A levantar el campamento.', 'Manos a la obra.'] }
  }
};
// Carácter de la voz sintetizada (Web Speech) por facción; el héroe habla más grave y pausado
const CARACTER = {
  atlas:     { idiomas:['es-US', 'es-MX', 'es-ES'], tono:1.0, velocidad:1.12 },
  hierro:    { idiomas:['es-ES', 'es-MX', 'es-US'], tono:0.7, velocidad:1.0 },
  guerrilla: { idiomas:['es-CO', 'es-MX', 'es-419', 'es-US', 'es-ES'], tono:0.95, velocidad:1.15 }
};
const VOZ_MASCULINA = /ra[uú]l|pablo|jorge|[aá]lvaro|enrique|diego|carlos|juan|jos[eé]|male|hombre|masculin/i;
// Orden de búsqueda: archivo grabado (audio/voz-<facción>-<categoría>-<evento>-<n>.mp3 o voz-<facción>-<evento>-<n>.mp3)
// pasado por un filtro de radio; si no hay, la voz del sistema operativo (speechSynthesis) entre dos chasquidos de radio.
class Voces {
  constructor(motor){
    this.motor = motor; this.activa = true; this.hasta = 0; this.inicio = 0; this.ultima = {}; this.lista = []; this.volumen = 0.8;
    this.sintesis = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
    if(this.sintesis){
      const leer = () => { this.lista = speechSynthesis.getVoices().filter(v => /^es([-_]|$)/i.test(v.lang)); this.porFaccion = {}; };
      leer(); if(speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', leer);
    }
  }
  _vozPara(f){
    if(this.porFaccion && this.porFaccion[f] !== undefined) return this.porFaccion[f];
    const C = CARACTER[f] || CARACTER.atlas, norm = l => l.replace('_', '-').toLowerCase();
    // Primero una voz masculina en los idiomas preferidos, luego cualquier voz masculina en español y al final cualquiera
    const deIdioma = id => this.lista.filter(x => norm(x.lang) === id.toLowerCase());
    let v = null;
    for(const id of C.idiomas){ v = deIdioma(id).find(x => VOZ_MASCULINA.test(x.name)); if(v) break; }
    if(!v) v = this.lista.find(x => VOZ_MASCULINA.test(x.name));
    if(!v) for(const id of C.idiomas){ v = deIdioma(id)[0]; if(v) break; }
    if(!v) v = this.lista[0] || null;
    // Si dos facciones caen en la misma voz, la tercera usa otra disponible para distinguirlas
    const usadas = Object.values(this.porFaccion || {}).filter(Boolean);
    if(v && usadas.includes(v) && this.lista.length > usadas.length) v = this.lista.find(x => !usadas.includes(x)) || v;
    (this.porFaccion = this.porFaccion || {})[f] = v; return v;
  }
  _frase(f, cat, evento){
    const E = (FRASES[f] || FRASES.atlas)[evento]; if(!E) return null;
    const l = E[cat] || E._ || (cat==='heroe' ? E.infanteria : null) || E.vehiculo; if(!l || !l.length) return null;
    const k = `${f}-${cat}-${evento}`; let i = Math.floor(Math.random()*l.length);
    if(l.length > 1 && i === this.ultima[k]) i = (i + 1) % l.length;
    this.ultima[k] = i; return l[i];
  }
  // evento: 'seleccion' | 'mover' | 'atacar' | 'listo' | 'construir'. Devuelve true si habló.
  decir(f, cat, evento){
    if(!this.activa) return false;
    const ahora = performance.now(), urgente = evento==='mover' || evento==='atacar' || evento==='construir';
    // Una sola voz a la vez: las órdenes interrumpen una frase empezada hace más de 0,6 s; la selección espera
    if(ahora < this.hasta && !(urgente && ahora - this.inicio > 600)) return false;
    const archivo = this.motor.archivoVoz([`voz-${f}-${cat}-${evento}-`, `voz-${f}-${evento}-`]);
    if(archivo){
      if(this.sintesis) speechSynthesis.cancel();
      this.motor.tocarRadio(archivo, this.volumen, f); this.inicio = ahora; this.hasta = ahora + archivo.duration*1000 + 120; return true;
    }
    if(!this.sintesis) return false;
    const texto = this._frase(f, cat, evento), voz = this._vozPara(f); if(!texto || !voz) return false;
    const C = CARACTER[f] || CARACTER.atlas, u = new SpeechSynthesisUtterance(texto);
    u.voice = voz; u.lang = voz.lang; u.volume = Math.max(0, Math.min(1, this.volumen));
    u.pitch = Math.max(0.1, C.tono*(cat==='heroe' ? 0.85 : cat==='vehiculo' || cat==='naval' ? 0.95 : 1));
    u.rate = C.velocidad*(cat==='heroe' ? 0.93 : 1)*(evento==='atacar' ? 1.08 : 1);
    u.onend = u.onerror = () => { this.hasta = 0; this.motor.tocar('squelch-fin', f, { vol:0.7 }); };
    speechSynthesis.cancel(); this.motor.tocar('squelch', f, { vol:0.7 });
    speechSynthesis.speak(u); this.inicio = ahora; this.hasta = ahora + 900 + texto.length*75; return true;
  }
  callar(){ if(this.sintesis) speechSynthesis.cancel(); this.hasta = 0; }
}
window.FASonido = { renderizar, aWav, claves, Motor, Voces, FRASES, receta, DUR };
})();
