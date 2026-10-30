# Load the game and walk through every screen, driving the clock by hand (?manual) so software
# WebGL keeps up: python3 test/browser/smoke.py [phone|land|desk] [car]
import asyncio, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from cdn import route_cdn, ARGS
VIEW = {'phone': (390, 844), 'land': (844, 390), 'desk': (1280, 720)}
async def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'phone'
    car = sys.argv[2] if len(sys.argv) > 2 else 'svala'
    w, h = VIEW[mode]
    os.makedirs('test/shots', exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, has_touch=mode != 'desk', is_mobile=mode != 'desk')
        await route_cdn(ctx)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        t0 = time.time()
        await pg.goto('http://localhost:8765/index.html?manual')
        await pg.wait_for_function('window.__rv && window.__rv.state === "title"', timeout=240000)
        print('title after', round(time.time() - t0, 1), 's')
        shot = lambda name: pg.screenshot(path=f'test/shots/smoke_{mode}_{name}.png', timeout=120000)
        await pg.evaluate('window.__rv.run(4)'); await shot('1_title')
        await pg.evaluate(f'window.__rv.toSelect(); window.__rv.setCar("{car}"); window.__rv.run(2)'); await shot('2_select')
        await pg.evaluate('window.__rv.startRace(); window.__rv.run(1.4)'); await shot('3_intro')
        await pg.evaluate('window.__rv.run(2.6)'); await shot('4_count')
        # drive: the autopilot takes the player's car
        await pg.evaluate('''async () => { const { Driver } = await import('/src/ai.js'); const g = window.__rv.game; window.__rv.run(2.4, 1/60);
            const d = new Driver(g, g.player, { name: 'Du', skill: 1, base: 2, dist: g.player.dist, player: true }); d.hold = false; g.player.auto = d; }''')
        await pg.evaluate('window.__rv.run(6, 1/60)'); await shot('5_race')
        for i, sec in enumerate([20, 25, 22, 30]):
            await pg.evaluate(f'window.__rv.run({sec}, 1/60)')
            info = await pg.evaluate('({ s: Math.round(window.__rv.game.player.dist), pos: window.__rv.game.position, kmh: Math.round(window.__rv.game.player.kmh), t: window.__rv.game.raceTime.toFixed(1) })')
            print('drive', info)
            await shot(f'6_road{i}')
        print('logs', logs[:12])
        await b.close()
asyncio.run(main())
