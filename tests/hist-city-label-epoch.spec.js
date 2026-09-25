/* ============================================================================================
 *  hist-city-label-epoch · in the real app, a move of the clock that crosses no name span does
 *  not touch `ofm-city`'s text-field; a move that crosses one writes it once, with the new name
 * --------------------------------------------------------------------------------------------
 *  tests/hist-city-label-epoch-checks.test.mjs runs js/hist-cities.js alone and proves the
 *  expression is the same object inside one interval and byte-identical to a fresh build at every
 *  boundary it samples. What only a browser can show is the other half: that js/place-labels.js,
 *  run by the app's own redraw on the app's own clock event, then leaves MapLibre alone — the
 *  ~0.9 MB `setLayoutProperty` this round exists to stop repeating — and that a real crossing still
 *  reaches the renderer with the record's name.
 *
 *  The dates are chosen FROM THE RECORD (data/hist-cities.json), not typed: the first interval after
 *  1916-07-01 that is longer than a day, and the first boundary after it at which the record itself
 *  renames a city.
 * ========================================================================================== */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './helpers/app.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/hist-cities.json'), 'utf8'));

const dnum = (d) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
function dayOf(v) {
  const y = Math.floor(v / 10000), md = v - y * 10000;
  const d = new Date(0); d.setUTCHours(12, 0, 0, 0); d.setUTCFullYear(y, Math.floor(md / 100) - 1, md % 100);
  return (Number.isFinite(d.getTime()) && dnum(d) === v) ? d : null;
}
const shift = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
function straddle(b) { const p = dayOf(b - 1); if (p) return [p, shift(p, 1)]; const a = dayOf(b); return a ? [shift(a, -1), a] : null; }
const BOUNDS = (() => {
  const s = new Set();
  for (const c of DATA.cities) for (const e of c.e) { if (e.f) s.add(e.f); if (e.t) s.add(e.t + 1); }
  return [...s].filter(straddle).sort((a, b) => a - b);
})();
const nameAt = (c, d) => { for (const e of c.e) if ((!e.f || d >= e.f) && (!e.t || d <= e.t)) return e; return null; };
const label = (e) => { const s = e && ((e.n && e.n.en) || ''); return s ? s + (e.f ? '' : ' [?]') : ''; };

/* ── the three instants, from the record ───────────────────────────────────────────────────── */
const START = dnum(new Date('1916-07-01T12:00:00Z'));
let IN_A, IN_B, idx = BOUNDS.findIndex((b) => b > START);
for (; idx + 1 < BOUNDS.length; idx++) {
  IN_A = straddle(BOUNDS[idx])[1]; IN_B = straddle(BOUNDS[idx + 1])[0];
  if (IN_B > IN_A) break;
}
const EDGE = BOUNDS.find((b) => b > dnum(IN_B) && DATA.cities.some((c) => {
  const [x, y] = straddle(b).map(dnum); return label(nameAt(c, x)) !== label(nameAt(c, y));
}));
const CROSS = straddle(EDGE)[1];
/* a city the crossing renames, with the name on each side — asserted on the renderer's own value */
const RENAMED = DATA.cities.map((c) => ({ c, was: label(nameAt(c, dnum(IN_B))), now: label(nameAt(c, dnum(CROSS))) }))
  .find((r) => r.was !== r.now && r.now);

/* the label the layer's own text-field gives a tile feature at the city's recorded position.
   ⚠ A walk of the expression, not MapLibre's evaluator (which the page does not expose); `distance`
   is the great-circle metres to the one point the feature is — the city's own coordinate — so it is
   0 for its own guard and the rest of the walk is exactly `let`/`var`/`match`/`case`/`!=`/`coalesce`/`get`. */
const READ_LABEL = ({ spelling, lon, lat }) => {
  const tf = window.__imap.getLayoutProperty('ofm-city', 'text-field');
  const props = { 'name:en': spelling };
  const R = Math.PI / 180;
  const metres = (p) => {
    const [bLon, bLat] = p.coordinates, dLat = (bLat - lat) * R, dLon = (bLon - lon) * R;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat * R) * Math.cos(bLat * R) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
  };
  const ev = (x, env) => {
    if (!Array.isArray(x)) return x;
    switch (x[0]) {
      /* lazily, as MapLibre does: a binding is evaluated where its `var` is used, in the scope the
         `let` was written in */
      case 'let': { const e2 = Object.assign({}, env); for (let i = 1; i < x.length - 1; i += 2) { const b = x[i + 1]; e2[x[i]] = () => ev(b, env); } return ev(x[x.length - 1], e2); }
      case 'var': return env[x[1]]();
      case 'get': return props[x[1]] == null ? null : props[x[1]];
      case 'coalesce': for (let i = 1; i < x.length; i++) { const v = ev(x[i], env); if (v != null && v !== '') return v; } return null;
      case 'match': {
        const v = ev(x[1], env);
        for (let i = 2; i < x.length - 1; i += 2) { const k = x[i]; if (Array.isArray(k) ? k.includes(v) : k === v) return ev(x[i + 1], env); }
        return ev(x[x.length - 1], env);
      }
      case 'case': for (let i = 1; i < x.length - 1; i += 2) if (ev(x[i], env)) return ev(x[i + 1], env); return ev(x[x.length - 1], env);
      case '<=': return ev(x[1], env) <= ev(x[2], env);
      case '!=': return ev(x[1], env) !== ev(x[2], env);
      case 'distance': return metres(x[1]);
      default: return undefined;   /* an operator this walk does not know: fails the comparison below */
    }
  };
  return ev(tf, {});
};

test('a move inside one name epoch leaves ofm-city alone; a crossing writes it once, with the new name', async ({ app }) => {
  test.setTimeout(150_000);
  const page = app.page;
  expect(RENAMED, 'the record renames a city at the chosen boundary').toBeTruthy();
  const at = (d) => page.evaluate((iso) => window.IntMapTime.set(new Date(iso), { source: 'test' }), d.toISOString());

  await at(IN_A);
  await page.waitForFunction(() => {
    try { return window.IntMapHistCities.ready() && window.__imap.getLayoutProperty('ofm-city', 'text-field')[0] === 'let'; } catch (_) { return false; }
  }, null, { timeout: 90_000, polling: 500 });

  /* count what reaches the renderer, and what reaches the app's redraw.
     ⚠ The page is the worker's shared one (tests/helpers/app.js): both wrappers and the clock are
     put back in `finally`, or the next spec on this worker inherits 1916 and a counting renderer. */
  await page.evaluate(() => {
    const m = window.__imap, set = m.setLayoutProperty, redraw = window.applyLabelLang;
    window.__cityWrites = 0; window.__redraws = 0;
    m.setLayoutProperty = function (id, p, v, o) { if (id === 'ofm-city' && p === 'text-field') { window.__cityWrites++; window.__cityOpts = o === undefined ? 'none' : JSON.stringify(o); } return set.call(m, id, p, v, o); };
    window.applyLabelLang = function () { window.__redraws++; return redraw.apply(this, arguments); };
    window.__epochSpecRestore = () => { m.setLayoutProperty = set; window.applyLabelLang = redraw; };
  });
  try {
    await test.step(`${IN_A.toISOString().slice(0, 10)} → ${IN_B.toISOString().slice(0, 10)} crosses no span: no write`, async () => {
      await at(IN_B);
      /* the clock subscriber's redraw is what used to rewrite it — wait for it to have run */
      await page.waitForFunction(() => window.__redraws > 0, null, { timeout: 20_000 });
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.__cityWrites), 'the era text-field is not handed to MapLibre again').toBe(0);
      const was = await page.evaluate(READ_LABEL, { spelling: RENAMED.c.k[0], lon: RENAMED.c.lon, lat: RENAMED.c.lat });
      expect(was, `${RENAMED.c.id} before the boundary`).toBe(RENAMED.was || RENAMED.c.k[0]);
    });

    await test.step(`→ ${CROSS.toISOString().slice(0, 10)} crosses one: written, and ${RENAMED.c.id} reads «${RENAMED.now}»`, async () => {
      await page.evaluate(() => { window.__cityWrites = 0; });
      await at(CROSS);
      await page.waitForFunction(() => window.__cityWrites > 0, null, { timeout: 20_000 });
      const now = await page.evaluate(READ_LABEL, { spelling: RENAMED.c.k[0], lon: RENAMED.c.lon, lat: RENAMED.c.lat });
      expect(now, `${RENAMED.c.id} after the boundary`).toBe(RENAMED.now);
      /* the generated expression skips MapLibre's second parse; its validation is the node test's ④ */
      expect(await page.evaluate(() => window.__cityOpts), 'written with {validate:false}').toBe('{"validate":false}');
    });
  } finally {
    await page.evaluate(() => { try { window.__epochSpecRestore(); } catch (_) {} window.IntMapTime.set(null, { source: 'test' }); }).catch(() => {});
  }
});
