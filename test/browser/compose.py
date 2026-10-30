# The delivery's screenshot sheet: phone shots in a grid with yellow captions (Big Shoulders Display).
# python3 test/browser/compose.py out.png cols "test/shots/a.png|Caption" "test/shots/b.png|Caption" …
import asyncio, sys, os, base64
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def data_url(path):
    ext = 'png' if path.endswith('.png') else 'jpeg'
    with open(path, 'rb') as f:
        return f'data:image/{ext};base64,' + base64.b64encode(f.read()).decode()

async def main():
    out, cols, items = sys.argv[1], int(sys.argv[2]), [a.split('|', 1) for a in sys.argv[3:]]
    font = data_url(os.path.join(ROOT, 'fonts/big-shoulders-display-latin-900-normal.woff2')).replace('image/jpeg', 'font/woff2')
    cells = ''.join(f'<figure><figcaption>{cap}</figcaption><img src="{data_url(path)}"></figure>' for path, cap in items)
    html = f'''<!doctype html><html><head><style>
@font-face {{ font-family: 'BSD'; src: url({font}) format('woff2'); font-weight: 900; }}
body {{ margin: 0; background: #101216; }}
.grid {{ display: grid; grid-template-columns: repeat({cols}, 390px); gap: 26px; padding: 30px; width: max-content; }}
figure {{ margin: 0; }}
figcaption {{ font: 900 30px/1.05 'BSD', sans-serif; color: #ffcf33; letter-spacing: 0.02em; height: 66px; display: flex; align-items: flex-end; padding-bottom: 10px; }}
img {{ width: 390px; height: 844px; display: block; border-radius: 22px; }}
</style></head><body><div class="grid">{cells}</div></body></html>'''
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 400, 'height': 400}, device_scale_factor=1)
        await pg.set_content(html)
        await pg.evaluate('document.fonts.ready')
        await pg.wait_for_timeout(200)
        await pg.locator('.grid').screenshot(path=out)
        await b.close()

asyncio.run(main())
