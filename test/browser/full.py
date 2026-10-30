# The whole flow: picker for all three cars, a race on autopilot to the finish, the results.
# python3 test/browser/full.py [phone|land] [car]
import asyncio, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from cdn import route_cdn, ARGS
VIEW = {'phone': (390, 844), 'land': (844, 390), 'desk': (1280, 720)}
async def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'phone'
    car = sys.argv[2] if len(sys.argv) > 2 else 'falk'
    w, h = VIEW[mode]
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
        shot = lambda name: pg.screenshot(path=f'test/shots/full_{mode}_{name}.png', timeout=120000)
        await pg.evaluate('window.__rv.toSelect()')
        for c in ['svala', 'falk', 'lo']:
            await pg.evaluate(f'window.__rv.setCar("{c}"); window.__rv.run(1.2)')
            await shot(f'pick_{c}')
        # a paint swatch click goes through the real UI
        await pg.evaluate(f'window.__rv.setCar("{car}")')
        await pg.locator('#paints button').nth(1).click()
        await pg.evaluate('window.__rv.run(0.6)')
        await shot('pick_paint')
        await pg.locator('#go').click()
        await pg.evaluate('window.__rv.run(5.9, 1/60)')
        await pg.evaluate('''async () => { const { Driver } = await import('/src/ai.js'); const g = window.__rv.game;
            const d = new Driver(g, g.player, { name: 'Du', skill: 1.02, base: 2, dist: g.player.dist, player: true }); d.hold = false; g.player.auto = d; }''')
        await pg.evaluate('window.__rv.run(8, 1/60)'); await shot('race1')
        t0 = time.time()
        for k in range(30):
            done = await pg.evaluate('(() => { window.__rv.run(10, 1/60); return window.__rv.state; })()')
            if done == 'results': break
        print('race took', round(time.time() - t0), 's real; state', done)
        await pg.evaluate('window.__rv.run(0.5)')
        await shot('results')
        info = await pg.evaluate('({ pos: window.__rv.game.player.finishPos, t: window.__rv.game.player.finishTime, table: document.getElementById("rTable").innerText })')
        print(info)
        # restart from the results
        await pg.locator('#rAgain').click()
        await pg.evaluate('window.__rv.run(1.0)')
        await shot('again')
        print('state after again', await pg.evaluate('window.__rv.state'), await pg.evaluate('window.__rv.game.phase'))
        print('logs', logs[:12])
        await b.close()
asyncio.run(main())
