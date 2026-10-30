# The sound around the finish: the engine during the race, quiet after the line, the calm tune on
# the results screen, silence again after "KÖR IGEN". Measured with an analyser on the output.
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from cdn import route_cdn, ARGS
MEASURE = '''() => { const a = window.__rv.audio; if (!a.__an) { a.__an = a.ctx.createAnalyser(); a.__an.fftSize = 4096; a.master.connect(a.__an); }
  const an = a.__an, buf = new Float32Array(an.fftSize); an.getFloatTimeDomainData(buf);
  let s = 0; for (const v of buf) s += v * v;
  return { rms: Math.sqrt(s / buf.length), eng: a.eng.out.gain.value, rival: a.rival.out.gain.value, wind: a.wind.gain.gain.value, music: !!a.music, calm: a.calm, state: window.__rv.state }; }'''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        await route_cdn(ctx)
        pg = await ctx.new_page()
        logs = []
        pg.on('pageerror', lambda e: logs.append(str(e)))
        await pg.goto('http://localhost:8765/index.html?manual')
        await pg.wait_for_function('window.__rv && window.__rv.state === "title"', timeout=240000)
        await pg.evaluate('window.__rv.toSelect(); window.__rv.setCar("lo")')
        await pg.locator('#go').click()
        await pg.evaluate('window.__rv.run(5.9, 1/60)')
        await pg.evaluate('''async () => { const { Driver } = await import('/src/ai.js'); const g = window.__rv.game;
            const d = new Driver(g, g.player, { name: 'Du', skill: 1, base: 2, dist: g.player.dist, player: true }); d.hold = false; g.player.auto = d; }''')
        await pg.evaluate('window.__rv.run(4, 1/60, false)')
        await pg.evaluate(MEASURE)   # (the analyser starts listening here)
        for _ in range(8): await pg.evaluate('window.__rv.run(0.1, 1/60, false)'); await pg.wait_for_timeout(60)
        race = await pg.evaluate(MEASURE)
        print('racing      ', race)
        # to the line: stop just after the finish, then let real time pass (the audio clock is real)
        await pg.evaluate('window.__rv.until(() => window.__rv.game.player.finished, 300)')
        fin = await pg.evaluate(MEASURE); print('at the line ', fin)
        for _ in range(30): await pg.evaluate('window.__rv.run(0.1, 1/60, false)'); await pg.wait_for_timeout(100)
        res = await pg.evaluate(MEASURE); print('results     ', res)
        await pg.wait_for_timeout(2500)
        res2 = await pg.evaluate(MEASURE); print('results +2.5', res2)
        ok = race['eng'] > 0.05 and race['rms'] > 0.01 and res2['state'] == 'results' and res2['eng'] < 0.003 and res2['rival'] < 0.003 and res2['music'] and res2['rms'] > 0.002
        await pg.locator('#rAgain').click()
        for _ in range(25): await pg.evaluate('window.__rv.run(0.1, 1/60, false)'); await pg.wait_for_timeout(100)
        again = await pg.evaluate(MEASURE); print('kör igen    ', again)
        ok = ok and not again['music'] and not again['calm'] and again['eng'] > 0.03
        print('SOUND ok' if ok else 'SOUND FAILED', 'logs', logs[:5])
        await b.close()
asyncio.run(main())
