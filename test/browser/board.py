# The online leaderboard against a fake Supabase (the sandbox can't reach the real one):
# python3 test/browser/board.py [phone|land]
import asyncio, sys, os, json
from urllib.parse import urlparse, parse_qs
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from cdn import route_cdn, ARGS
VIEW = {'phone': (390, 844), 'land': (844, 390)}
ROWS = [
    {'id': 1, 'name': 'Turbo-Tord', 'car': 'lo', 'time_ms': 128900, 'created_at': '2026-10-30T16:00:00Z'},
    {'id': 2, 'name': 'Jimmy', 'car': 'falk', 'time_ms': 131200, 'created_at': '2026-10-30T16:01:00Z'},
    {'id': 3, 'name': 'Sonja', 'car': 'svala', 'time_ms': 134800, 'created_at': '2026-10-30T16:02:00Z'},
    {'id': 4, 'name': '<b>Hacker</b>', 'car': 'lo', 'time_ms': 139000, 'created_at': '2026-10-30T16:03:00Z'},
    {'id': 5, 'name': 'Mormor', 'car': 'svala', 'time_ms': 152300, 'created_at': '2026-10-30T16:04:00Z'},
    {'id': 6, 'name': 'Kvällsugglan', 'car': 'falk', 'time_ms': 127500, 'created_at': '2026-10-30T20:00:00Z', 'track': 2},
    {'id': 7, 'name': 'Nattis', 'car': 'lo', 'time_ms': 133300, 'created_at': '2026-10-30T20:05:00Z', 'track': 2},
]
for r in ROWS: r.setdefault('track', 1)        # the column's default: everything before 1.3 is course 1
async def fake(route):
    req = route.request
    u = urlparse(req.url); q = parse_qs(u.query)
    if req.method == 'OPTIONS':
        return await route.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*'})
    hdr = {'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Type': 'application/json'}
    if req.method == 'POST':
        row = json.loads(req.post_data); row['id'] = len(ROWS) + 1; row['created_at'] = '2026-10-30T17:00:00Z'
        ROWS.append(row)
        return await route.fulfill(status=201, headers=hdr, body=json.dumps([row]))
    rows = sorted(ROWS, key=lambda r: r['time_ms'])
    if 'track' in q: rows = [r for r in rows if r['track'] == int(q['track'][0][3:])]
    if 'car' in q: rows = [r for r in rows if r['car'] == q['car'][0][3:]]
    if 'time_ms' in q: rows = [r for r in rows if r['time_ms'] < int(q['time_ms'][0][3:])]
    if req.headers.get('prefer') == 'count=exact': hdr['Content-Range'] = f'0-0/{len(rows)}'
    lim = int(q.get('limit', ['10'])[0])
    await route.fulfill(status=200, headers=hdr, body=json.dumps(rows[:lim]))
async def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'phone'
    w, h = VIEW[mode]
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True)
        await route_cdn(ctx)
        await ctx.route('https://jisleyrtpojsfjtlbplp.supabase.co/rest/v1/**', fake)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        await pg.goto('http://localhost:8765/index.html?manual')
        await pg.wait_for_function('window.__rv && window.__rv.state === "title"', timeout=240000)
        shot = lambda n: pg.screenshot(path=f'test/shots/board_{mode}_{n}.png', timeout=120000)
        await pg.evaluate('window.__rv.run(3)')
        await pg.locator('#topBtn').click()
        await pg.wait_for_function('document.querySelectorAll("#bList li").length === 5')
        names = await pg.evaluate('[...document.querySelectorAll("#bList li span")].map(s => s.firstChild.textContent)')
        print('top list', names)
        assert names[0] == 'Turbo-Tord' and '<b>Hacker</b>' in names, 'names shown as text, fastest first'
        assert await pg.evaluate('!document.querySelector("#bList b b")'), 'no HTML injected'
        await pg.evaluate('window.__rv.run(0.2)'); await shot('1_title_board')
        await pg.locator('#bChips button[data-car="lo"]').click()
        await pg.wait_for_function('document.querySelectorAll("#bList li").length === 2')
        await pg.evaluate('window.__rv.run(0.2)'); await shot('2_lo')
        # course 2 has a list of its own
        await pg.locator('#bChips button[data-car=""]').click()
        await pg.locator('#bTracks button[data-track="2"]').click()
        await pg.wait_for_function('document.querySelectorAll("#bList li").length === 2')
        names2 = await pg.evaluate('[...document.querySelectorAll("#bList li span")].map(s => s.firstChild.textContent)')
        print('course 2 list', names2); assert names2 == ['Kvällsugglan', 'Nattis'], 'course 2 shows its own times'
        await pg.evaluate('window.__rv.run(0.2)'); await shot('2b_course2')
        await pg.locator('#bClose').click()
        # Enter while typing doesn't start the game; the keys WASD go into the name field
        await pg.evaluate('window.__rv.toSelect(); window.__rv.setCar("falk")')
        await pg.locator('#courses button[data-course="2"]').click()
        await pg.locator('#go').click()
        await pg.evaluate('window.__rv.run(5.9, 1/60)')
        await pg.evaluate('''async () => { const { Driver } = await import('/src/ai.js'); const g = window.__rv.game;
            const d = new Driver(g, g.player, { name: 'Du', skill: 1.02, base: 2, dist: g.player.dist, player: true }); d.hold = false; g.player.auto = d; }''')
        await pg.evaluate('window.__rv.until(() => window.__rv.state === "results", 300)')
        await pg.evaluate('window.__rv.run(0.3)')
        await pg.locator('#pName').fill('')
        await pg.locator('#pName').type('Wasd Racer')
        val = await pg.evaluate('document.getElementById("pName").value')
        print('typed', repr(val)); assert val == 'Wasd Racer', 'game keys type into the name field'
        await pg.locator('#pSave').click()
        await pg.wait_for_function('document.getElementById("saveMsg").className === "ok"', timeout=20000)
        msg = await pg.evaluate('document.getElementById("saveMsg").textContent')
        print('saved:', msg, '| sent', ROWS[-1])
        assert ROWS[-1]['track'] == 2 and 'bana 2' in msg, 'the time is saved on course 2 and ranked there'
        await pg.evaluate('window.__rv.run(0.2)'); await shot('3_saved')
        await pg.locator('#rBoard').click()
        await pg.wait_for_function('document.querySelector("#bList li.me")')
        assert await pg.evaluate('document.querySelector("#bTracks .on").dataset.track') == '2', 'the list opens on the course you raced'
        await pg.evaluate('window.__rv.run(0.2)'); await shot('4_me')
        print('remembered name', await pg.evaluate('window.__rv.settings.name'))
        # no network: a friendly message
        await ctx.unroute('https://jisleyrtpojsfjtlbplp.supabase.co/rest/v1/**')
        await ctx.route('https://jisleyrtpojsfjtlbplp.supabase.co/rest/v1/**', lambda r: r.abort())
        await pg.locator('#bChips button[data-car=""]').click()
        await pg.wait_for_function('document.getElementById("bMsg").textContent.includes("gick inte")')
        print('offline:', await pg.evaluate('document.getElementById("bMsg").textContent'))
        print('logs', [l for l in logs if 'topplistan' not in l][:8])
        await b.close()
asyncio.run(main())
