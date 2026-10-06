/* (hist-border-same-look) 「歴史地図は、現在の地図の国境や地方区分境界線と、ちょっと違う…見た目を同じにしろ」
   「いや地方区分線も違う」(2026-10-06). The era lines are cut from polygon rings, so a boundary two units
   share was struck once per neighbour; today's lines come from a line layer and are struck once. These
   checks hold `strokedOnce` (js/border-coast.js) to that, on the shipped records, and hold both time
   modules to handing their line sources through it. The stroke paint itself is held in
   tests/history-era-display-checks.test.mjs (it needs that file's module harness). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { codeOnly } from '../scripts/code-only.mjs';
import { importModule } from './helpers/import-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const bundle = (p) => { const s = rd(p); return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); };
const segsOf = (fc) => { const out = []; for (const f of fc.features) { const g = f.geometry; for (const c of (g.type === 'LineString' ? [g.coordinates] : g.coordinates)) for (let i = 0; i + 1 < c.length; i++) out.push([c[i], c[i + 1]]); } return out; };
const ek = ([a, b]) => { const p = a.join(','), q = b.join(','); return p < q ? p + '|' + q : q + '|' + p; };

async function borderCoast() {
  const win = { addEventListener() {}, document: { createElement: () => ({}) } }; win.window = win;
  const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
  const { IntMapBorderCoast } = await importModule('js/border-coast.js', { globals: { window: win, document: win.document }, mocks: {
    'js/chronos.js': { IntMapTime: chain }, 'js/geo-engine.js': { IntMapGeoEngine: chain } } });
  return IntMapBorderCoast;
}

test('strokedOnce: two squares sharing a side stroke that side once, and keep every other edge', async () => {
  const BC = await borderCoast();
  const A = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], B = [[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]];
  const fc = { type: 'FeatureCollection', features: [A, B].map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } })) };
  const out = BC.strokedOnce(fc), segs = segsOf(out);
  assert.equal(segs.length, 7, 'eight edges, one shared');
  assert.equal(new Set(segs.map(ek)).size, 7, 'no edge struck twice');
  assert.equal(BC.strokedOnce(fc), out, 'memoised on the collection');
});

test('strokedOnce on the shipped CShapes borders of 1950: every segment once, none lost', async () => {
  const BC = await borderCoast();
  const j = bundle('data/cshapes.js'), draw = bundle('data/border-coast.js').sets.cs.draw;
  const t = 1950.5, live = j.feats.filter((f) => f[2] + f[3] / 12 <= t && f[5] + f[6] / 12 >= t);
  const closed = (r) => { const a = r[0], b = r[r.length - 1]; return a[0] === b[0] && a[1] === b[1] ? r : r.concat([a]); };
  const fc = { type: 'FeatureCollection', features: live.map((f) => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: f[8].flat().flatMap((ri) => {
    const m = draw[ri], V = closed(j.rings[ri]); if (m === 0) return []; if (!Array.isArray(m)) return [V]; return m.map(([a, b]) => V.slice(a, b + 1)); }) } })) };
  const before = segsOf(fc).filter(([a, b]) => a[0] !== b[0] || a[1] !== b[1]), after = segsOf(BC.strokedOnce(fc));
  const uniq = new Set(before.map(ek));
  assert.ok(before.length - uniq.size > 1000, `the doubling this exists for is gone from the data? ${before.length} vs ${uniq.size}`);
  assert.equal(after.length, uniq.size, 'each distinct segment exactly once');
  assert.deepEqual(new Set(after.map(ek)), uniq);
});

test('both time modules hand their bundle line sources through strokedOnce', () => {
  const tb = codeOnly(rd('js/time-borders.js'));
  const writes = tb.match(/setSourceData\('imtb-ln-src',[^)]*\)/g) || [];
  assert.ok(writes.length >= 3, 'the era border line writes were not found');
  for (const w of writes) assert.ok(!/_linesFor\(/.test(w), `imtb-ln-src written without strokedOnce: ${w}`);
  assert.match(tb, /const _ln=\(\)=>\{ try\{ return _strokeFor\(fc\)/);
  const ta = codeOnly(rd('js/time-admin1.js'));
  for (const fn of ['linesFor', 'gapLinesFor']) {
    const at = ta.indexOf('function ' + fn + '('); assert.ok(at >= 0, fn);
    const body = ta.slice(at, ta.indexOf('\n      }', at));
    assert.ok(!/return \{ type: 'FeatureCollection', features: feats/.test(body), `${fn} returns an un-deduplicated collection`);
  }
});
