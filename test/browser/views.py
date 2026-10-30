# Big screenshots of places along the road, from the chase camera: python3 test/browser/views.py TAG s1 s2 ...
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from cdn import route_cdn, ARGS
async def main():
    tag = sys.argv[1]; spots = [float(x) for x in sys.argv[2:]]
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1)
        await route_cdn(ctx)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        await pg.goto('http://localhost:8765/index.html?manual')
        await pg.wait_for_function('window.__rv && window.__rv.state === "title"', timeout=240000)
        await pg.evaluate('window.__rv.startRace(); window.__rv.run(6.5)')
        for i, s in enumerate(spots):
            await pg.evaluate(f'''() => {{ const g = window.__rv.game, T = g.track, p = g.player; const q = T.beside({s}, 2.2, {{}});
                p.place(g, q.x, q.z, Math.atan2(q.dx, q.dz)); p.dist = {s}; const sp = 30; p.vx = q.dx * sp; p.vz = q.dz * sp;
                for (const d of g.drivers) d.hold = true; g.drivers.forEach((d, k) => {{ const r = T.beside({s} + 18 + k * 9, k % 2 ? -2.2 : 2.2, {{}}); d.car.place(g, r.x, r.z, Math.atan2(r.dx, r.dz)); d.dist = {s} + 18 + k * 9; }});
                window.__rv.view.rig.yaw = Math.atan2(q.dx, q.dz); window.__rv.view.rig.blendT = 1; window.__rv.run(0.5, 1/60); }}''')
            await pg.screenshot(path=f'test/shots/{tag}_{i}.png', timeout=120000)
        print('logs', logs[:8])
        await b.close()
asyncio.run(main())
