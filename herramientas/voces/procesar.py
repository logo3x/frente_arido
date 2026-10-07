# Convierte las voces grabadas en transmisiones de radio de campo: filtro telefónico, compresión, saturación,
# estática y combate lejano de fondo. Resultado: public/juego/audio/voz-*.mp3 (mono, 22 kHz).
import json, os, random, subprocess, wave
import numpy as np

BASE = os.path.dirname(os.path.abspath(__file__))
CRUDO = os.path.join(BASE, 'crudo'); FONDOS = os.path.join(BASE, 'fondos'); os.makedirs(FONDOS, exist_ok=True)
SALIDA = os.path.join(BASE, '..', '..', 'public', 'juego', 'audio')
SR = 22050

def onepole(x, fc):
    a = np.exp(-2*np.pi*fc/SR); y = np.empty_like(x); acc = 0.0
    for i in range(len(x)): acc = (1-a)*x[i] + a*acc; y[i] = acc
    return y

def fondo_batalla(semilla, dur=8.0):
    """Combate lejano: rumor grave, ráfagas de fusil y explosiones a la distancia (todo apagado por la distancia)."""
    rng = np.random.default_rng(semilla); n = int(SR*dur)
    rumor = onepole(onepole(rng.standard_normal(n), 90), 90); rumor /= np.abs(rumor).max() + 1e-9
    y = rumor*0.35
    t = 0.2
    while t < dur - 0.5:   # ráfagas de 2 a 7 disparos
        k = rng.integers(2, 8); paso = rng.uniform(0.07, 0.12); amp = rng.uniform(0.25, 0.6)
        for j in range(k):
            i0 = int((t + j*paso)*SR); L = int(0.09*SR)
            if i0 + L >= n: break
            env = np.exp(-np.arange(L)/(0.022*SR)); y[i0:i0+L] += rng.standard_normal(L)*env*amp
        t += k*paso + rng.uniform(0.35, 1.6)
    for _ in range(rng.integers(1, 3)):   # explosiones lejanas
        i0 = int(rng.uniform(0.5, dur-1.5)*SR); L = int(1.2*SR)
        env = np.exp(-np.arange(L)/(0.35*SR)); y[i0:i0+L] += onepole(rng.standard_normal(L), 160)*env*4.0
    y = onepole(y, 1400)   # la distancia quita los agudos
    y /= np.abs(y).max() + 1e-9
    return (y*0.8).astype(np.float32)

def guardar_wav(ruta, x):
    with wave.open(ruta, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(x, -1, 1)*32767).astype(np.int16).tobytes())

for i, f in enumerate(['atlas', 'hierro', 'guerrilla']):
    guardar_wav(os.path.join(FONDOS, f'fondo-{f}.wav'), fondo_batalla(100 + i))

# Radio por facción: banda, saturación, digitalización, estática y fondo de batalla
RADIO = {
    'atlas':     dict(hp=300, lp=3800, clip='tanh', pre=1.6, crush='acrusher=bits=11:mix=0.25:mode=log,', ruido=0.008, fondo=0.22),
    'hierro':    dict(hp=380, lp=3000, clip='atan', pre=2.4, crush='', ruido=0.014, fondo=0.26),
    'guerrilla': dict(hp=480, lp=2700, clip='hard', pre=2.0, crush='acrusher=bits=8:mix=0.18:mode=lin,', ruido=0.02, fondo=0.3),
}
frases = json.load(open(os.path.join(BASE, 'frases.json'), encoding='utf-8'))
rng = random.Random(7); hechas = 0
for fr in frases:
    entrada = os.path.join(CRUDO, fr['archivo'] + '.wav')
    with wave.open(entrada) as w: dur = w.getnframes()/w.getframerate()
    dur += 0.25; R = RADIO[fr['faccion']]; ini = rng.uniform(0, 8 - dur - 0.1) if dur < 7.9 else 0
    fuerte = 1.25 if fr['evento'] == 'atacar' else 1.0
    filtro = (
        f"[0:a]aresample={SR},pan=mono|c0=c0,apad=pad_dur=0.25,highpass=f={R['hp']}:poles=2,lowpass=f={R['lp']}:poles=2,"
        f"acompressor=threshold=-22dB:ratio=6:attack=2:release=90:makeup=4,volume={R['pre']*fuerte},"
        f"asoftclip=type={R['clip']},{R['crush']}highpass=f={R['hp']},lowpass=f={R['lp']}[v];"
        f"[1:a]atrim=start={ini:.2f}:duration={dur:.2f},asetpts=PTS-STARTPTS,volume={R['fondo']}[b];"
        f"anoisesrc=color=pink:amplitude={R['ruido']}:sample_rate={SR}:duration={dur:.2f},highpass=f=600,lowpass=f=4000[n];"
        f"[v][b][n]amix=inputs=3:normalize=0:duration=first,alimiter=limit=0.89,afade=t=in:d=0.015,afade=t=out:st={dur-0.06:.2f}:d=0.06"
    )
    salida = os.path.join(SALIDA, fr['archivo'] + '.mp3')
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', entrada, '-i', os.path.join(FONDOS, f"fondo-{fr['faccion']}.wav"),
                        '-filter_complex', filtro, '-ac', '1', '-ar', str(SR), '-b:a', '48k', salida], capture_output=True, text=True)
    if r.returncode: print('ERROR', fr['archivo'], r.stderr[:300]); break
    hechas += 1
print('procesadas', hechas, 'de', len(frases))
