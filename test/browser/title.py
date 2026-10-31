# The title screen's sweeping flight: shots every few seconds of game time.
# python3 test/browser/title.py [phone|land] [count] [seconds between] [start second]
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from cdn import route_cdn, ARGS
VIEW = {'phone': (390, 844), 'land': (844, 390)}
async def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'phone'
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    gap = float(sys.argv[3]) if len(sys.argv) > 3 else 2.5
    start = float(sys.argv[4]) if len(sys.argv) > 4 else 0
    w, h = VIEW[mode]
    os.makedirs('test/shots', exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, has_touch=True, is_mobile=True)
        await route_cdn(ctx)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        await pg.goto('http://localhost:8765/index.html?manual')
        await pg.wait_for_function('window.__rv && window.__rv.state === "title"', timeout=240000)
        if start: await pg.evaluate(f'window.__rv.titleCam.t = {start}')
        await pg.evaluate('window.__rv.run(1.2)')
        for i in range(count):
            await pg.evaluate(f'window.__rv.run({gap}, 1/30)')
            info = await pg.evaluate('(() => { const c = window.__rv.titleCam, p = c.pose(c.t); return { t: c.t.toFixed(1), s: Math.round(p.s), d: Math.round(p.d), y: Math.round(c.pos.y - c.clearAt(c.pos.x, c.pos.z).ground), veil: c.veil.toFixed(2), tris: window.__rv.view.renderer.info.render.triangles }; })()')
            print(i, info)
            await pg.screenshot(path=f'test/shots/title_{mode}_{i}.png', timeout=120000)
        print('logs', logs[:8])
        await b.close()
asyncio.run(main())
