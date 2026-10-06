# Pruebas de seguridad del cliente en un navegador real (requiere: pip install playwright && playwright install chromium)
# Uso: python prueba-seguridad-cliente.py [ruta/a/public/juego/index.html]
import asyncio, sys, pathlib
from playwright.async_api import async_playwright
G = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else str(pathlib.Path(__file__).resolve().parent.parent / 'public' / 'juego' / 'index.html')).resolve().as_uri()
async def main():
    fallos = 0
    def check(n, ok, extra=''):
        nonlocal fallos
        print(('  ok    ' if ok else '  FALLO ') + n + (' · ' + extra if extra else ''))
        if not ok: fallos += 1
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"])
        pg = await b.new_page(); errs = []
        local = pathlib.Path(__file__).resolve().parent / 'three.min.js'   # opcional: copia local si no hay acceso a cdnjs
        if local.exists(): await pg.route('**/three.min.js', lambda r: r.fulfill(path=str(local), content_type='application/javascript'))
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: (errs.append('DIALOGO:' + d.message), asyncio.ensure_future(d.dismiss())))
        async def page(q=''):
            errs.clear()
            await pg.goto('about:blank'); await pg.goto(G + q, timeout=60000); await pg.wait_for_timeout(1500)
            return pg, errs
        pg, errs = await page('?return=javascript:alert(document.domain)')
        check('?return=javascript: no se acepta', await pg.evaluate('RETURN_URL') is None)
        pg, errs = await page('?return=https://malicioso.ejemplo/phish')
        v = await pg.evaluate('RETURN_URL')
        check('?return= externo: rechazado en http(s); en file:// no hay origen que comparar', v is None or G.startswith('file:'), str(v))
        pg, errs = await page('?replay=javascript:alert(1)')
        await pg.wait_for_timeout(500)
        check('?replay=javascript: rechazado sin errores', not any('DIALOGO' in e for e in errs) and await pg.is_visible('#menu'))
        pg, errs = await page('?server=javascript:alert(1)&room=ABC')
        check('?server= que no es ws:// no conecta', await pg.evaluate('NET.ws') is None)
        pg, errs = await page()
        await pg.evaluate("onNet({ t:'start', seed:'x', slot:0, factions:['atlas'], log:[] })")
        await pg.evaluate("onNet({ t:'start', seed:5, slot:0, factions:['atlas','hierro'], map:{ formato:'frente-arido-mapa', grid:64, terrain:'<img>', depots:[], wells:[] }, log:[] })")
        check('mensaje de inicio malicioso ignorado', await pg.evaluate('NET.started') is False and not errs, ';'.join(errs))
        await pg.evaluate("NET.queue.length=0; onNet({ t:'tick', n:'0', c:'x' }); onNet({ t:'tick', n:0, c:{} });")
        check('paquetes de tick inválidos descartados', await pg.evaluate('NET.queue.length') == 0)
        await pg.evaluate("applyCmd(null); applyCmd({t:'move', p:0, ids:'1'}); applyCmd({t:'move', p:7, ids:[1]}); applyCmd({t:'unlock', p:0, power:{}}); applyCmd({t:'place', p:0, ids:[1], type:'__proto__', cx:1, cz:1});")
        check('órdenes basura no rompen la simulación', not errs, ';'.join(errs))
        await pg.evaluate("setSoloMap({ formato:'frente-arido-mapa', version:1, nombre:'<img src=x onerror=alert(1)>', grid:64, terrain:'.'.repeat(4096), depots:[], wells:[] })")
        html = await pg.inner_html('#mapName')
        check('nombre de mapa se muestra como texto (sin XSS)', '<img' not in html and '&lt;img' in html)
        await pg.evaluate("localStorage.setItem('frente-arido-perfil-v1', JSON.stringify({ v:1, nombre:'<b>x</b>'.repeat(10), historial:[{ rival:'<img src=x onerror=alert(1)>', fecha:'2026', modo:'solo', faccion:'atlas', resultado:'victoria', duracion:5 }], stats:{ partidas:'x' } }))")
        pg, errs = await page()
        await pg.evaluate("renderHistory(); document.getElementById('history').hidden=false;")
        tbl = await pg.inner_html('#histTable')
        check('historial manipulado se muestra escapado', '<img' not in tbl and not any('DIALOGO' in e for e in errs))
        check('perfil manipulado se sanea', await pg.evaluate('PROFILE.nombre.length <= 24 && Number.isInteger(PROFILE.stats.partidas)'))
        await pg.evaluate("window.postMessage({ type:'fa-map', map:{ formato:'frente-arido-mapa', version:1, nombre:'Intruso', grid:64, terrain:'.'.repeat(4096), depots:[], wells:[] } }, '*')")
        await pg.wait_for_timeout(300)
        check('mapas por postMessage de ventanas ajenas ignorados', await pg.inner_text('#mapName') != 'Intruso')
        await b.close()
    print('\nCLIENTE: ' + ('TODAS LAS PRUEBAS CORRECTAS' if not fallos else f'{fallos} FALLO(S)'))
    sys.exit(1 if fallos else 0)
asyncio.run(main())
