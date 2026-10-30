# Photo studio for the car models: python3 test/browser/studio.py TAG "car=svala&paint=gul&yaw=0.7" ...
import asyncio, sys, os
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdn import route_cdn, ARGS
async def main():
    tag = sys.argv[1]
    os.makedirs('test/shots', exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': 1200, 'height': 700})
        await route_cdn(ctx)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(str(e)))
        for i, qs in enumerate(sys.argv[2:]):
            await pg.goto(f'http://localhost:8765/test/studio.html?{qs}')
            await pg.wait_for_function('window.__ready === true', timeout=120000)
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'test/shots/{tag}_{i}.png')
            if i == 0: print('stats', await pg.evaluate('window.__stats'))
        print('logs', logs[:8])
        await b.close()
asyncio.run(main())
