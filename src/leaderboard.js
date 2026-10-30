// The online leaderboard: a table in the Supabase project "cityguess" (riksvag7_highscores, see
// supabase/riksvag7_highscores.sql), reached the same way cityguess reaches its own highscores:
// plain fetch calls to Supabase's REST API with the project's publishable key. Lower time is better.
const SUPABASE_URL = 'https://jisleyrtpojsfjtlbplp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ts0hUrMnRc00kDfzeAZXsg_SZBQeETG';
const TABLE = 'riksvag7_highscores';
const BASE = `${SUPABASE_URL}/rest/v1/${TABLE}`;
export const CARS = ['svala', 'falk', 'lo'];
export const MIN_MS = 100000, MAX_MS = 900000;   // the table refuses anything outside 1:40–15:00

function headers(extra = {}) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, ...extra };
}

async function call(url, opts = {}, ms = 7000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (!r.ok) throw new Error(`Supabase svarade ${r.status}`);
    return r;
  } finally { clearTimeout(t); }
}

// a name as the table wants it: trimmed, no control characters, 1–16 characters
export function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

// the best `limit` times, for one car or all of them
export async function fetchTop(car = null, limit = 10) {
  const q = new URLSearchParams({ select: 'id,name,car,time_ms,created_at', order: 'time_ms.asc,created_at.asc', limit: String(limit) });
  if (car) q.set('car', `eq.${car}`);
  const r = await call(`${BASE}?${q}`, { headers: headers() });
  return r.json();
}

// save a finished race; returns the new row (with its id)
export async function submit({ name, car, timeMs, position, version }) {
  const row = { name: cleanName(name), car, time_ms: Math.round(timeMs), position, version };
  if (!row.name) throw new Error('Skriv ett namn');
  if (!CARS.includes(car)) throw new Error('Okänd bil');
  if (!(row.time_ms >= MIN_MS && row.time_ms <= MAX_MS)) throw new Error('Tiden räknas inte');
  const r = await call(BASE, { method: 'POST', headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify(row) });
  const out = await r.json();
  return Array.isArray(out) ? out[0] : out;
}

// where a time ranks: { rank, total } (rank 1 = best). For one car or all.
export async function rankOf(timeMs, car = null) {
  const count = async (filter) => {
    const q = new URLSearchParams({ select: 'id', limit: '1' });
    if (filter) q.set('time_ms', filter);
    if (car) q.set('car', `eq.${car}`);
    const r = await call(`${BASE}?${q}`, { headers: headers({ Prefer: 'count=exact' }) });
    const cr = r.headers.get('content-range') || '';
    const n = Number(cr.split('/')[1]);
    return Number.isFinite(n) ? n : null;
  };
  const [better, total] = await Promise.all([count(`lt.${Math.round(timeMs)}`), count(null)]);
  return better === null || total === null ? null : { rank: better + 1, total };
}
