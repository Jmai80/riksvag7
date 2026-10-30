# The screenshot sheet for a delivery: phone shots along a whole race on autopilot.
# python3 test/browser/sheet.py [car] [course 1|2] → test/shots/sheet_*.png (course 2: sheet2_*.png)
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from cdn import route_cdn, ARGS
async def main():
    car = sys.argv[1] if len(sys.argv) > 1 else 'lo'
    course = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        await route_cdn(ctx)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        await pg.goto('http://localhost:8765/index.html?manual')
        await pg.wait_for_function('window.__rv && window.__rv.state === "title"', timeout=240000)
        shot = lambda n: pg.screenshot(path=f'test/shots/sheet{course if course > 1 else ""}_{n}.png', timeout=180000)
        await pg.evaluate('window.__rv.run(5)'); await shot('0_title')
        await pg.evaluate(f'window.__rv.toSelect(); window.__rv.setCourse({course}); window.__rv.setCar("{car}"); window.__rv.run(2.4)'); await shot('1_pick')
        await pg.evaluate('window.__rv.startRace(); window.__rv.run(4.2)'); await shot('2_count')
        await pg.evaluate('''async () => { window.__rv.run(1.7, 1/60); const { Driver } = await import('/src/ai.js'); const g = window.__rv.game;
            const d = new Driver(g, g.player, { name: 'Du', skill: 0.94, base: 2, dist: g.player.dist, player: true }); d.hold = false; g.player.auto = d; }''')
        async def until(cond, maxsec=200):
            return await pg.evaluate(f'window.__rv.until(() => {{ const g = window.__rv.game, p = g.player, T = g.track; return {cond}; }}, {maxsec})')
        if course == 2:
            # road positions (R) turned into course distances: course 2 runs backwards along the road
            await until('p.dist > 760'); await shot('3_ridge')
            await until('p.dist > T.L - (T.road.zones.mellby[0] + T.road.zones.mellby[1]) / 2'); await shot('4_mellby')
            await until('p.dist > T.L - T.road.zones.bridge[1] + 90'); await shot('5_bridge')
            await until('p.air && p.airTime > 0.12 && p.dist > T.L - T.road.zones.bumps[0] - 60'); await shot('6_jump')
            await until('p.dist > T.zones.finish - 140'); await shot('7_ekeby')
            await until('p.finished'); await pg.evaluate('window.__rv.run(0.8, 1/60)'); await shot('8_finish')
            await until('window.__rv.state === "results"', 300); await pg.evaluate('window.__rv.run(0.4)'); await shot('9_results')
            print('logs', logs[:8])
            await b.close()
            return
        await until('p.dist > 1180'); await shot('3_farm')
        await until('p.air && p.airTime > 0.12 && p.dist > T.zones.bumps[0] - 20'); await shot('4_jump')
        await until('p.dist > T.zones.bridge[0] + 70'); await shot('5_bridge')
        await until('p.dist > T.cornerS[8] - 90'); await shot('6_mellby')
        await until('window.__rv.state === "results"', 300); await pg.evaluate('window.__rv.run(0.4)'); await shot('7_results')
        print('logs', logs[:8])
        await b.close()
asyncio.run(main())
