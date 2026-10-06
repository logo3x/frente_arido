# Verificación automática de determinismo en Chromium, Firefox y WebKit (motor de Safari).
# Requisitos: pip install playwright && playwright install chromium firefox webkit
# Uso: python verificar-navegadores.py
import asyncio, pathlib, sys
from playwright.async_api import async_playwright
PAGINA = (pathlib.Path(__file__).resolve().parent / 'verificar-navegador.html').as_uri()
async def main():
    resumen = []
    async with async_playwright() as p:
        for nombre in ['chromium', 'firefox', 'webkit']:
            try:
                b = await getattr(p, nombre).launch()
            except Exception as e:
                resumen.append((nombre, 'no instalado')); continue
            pg = await b.new_page()
            await pg.goto(PAGINA); await pg.click('#go')
            await pg.wait_for_function("document.getElementById('sum').textContent.length>0", timeout=300000)
            filas = await pg.inner_text('#res'); ok = 'NO coincide' not in filas
            print(f'== {nombre} ({await pg.evaluate("navigator.userAgent")})\n{filas}\n')
            resumen.append((nombre, 'coincide' if ok else 'DIFERENTE')); await b.close()
    print('Resumen:'); [print(f'  {n:9} {r}') for n, r in resumen]
    sys.exit(1 if any(r == 'DIFERENTE' for _, r in resumen) else 0)
asyncio.run(main())
