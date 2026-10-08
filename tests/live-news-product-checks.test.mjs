/* ============================================================================
 *  live-news-product — «Earthquake record here» (js/quake-history.js over js/quake-history-core.js): what Node can answer
 * ----------------------------------------------------------------------------
 *    ① the request: earthquakes only, from before the oldest catalogue entry, the point ROUNDED to the grid and the radius
 *      widened by exactly the cell's half-diagonal — so no exact position reaches USGS — and the read capped;
 *    ② the record, evaluated on a REAL ComCat answer (tests/fixtures/quake-history-kobe.json, the very request the card
 *      makes for Kobe): the exact circle on the device, the largest, the decades with their smallest recorded magnitude,
 *      the 1995 Hyōgo-ken Nanbu earthquake's rank and the last one at least as large — each against the fixture itself;
 *    ③ the record at an instant (the master clock): what was catalogued by then, and the age bands;
 *    ④ the floor: raised to the next step when a count does not fit one read, said as such; an unanswered count is
 *      «unknown», not «fits»;
 *    ⑤ the link round-trips; ⑥ Atlas `time.quakeHistory` is registered, described in en and jp, refuses a call with no
 *      target, and the boot doors (popup button, command, `?qh=`, place card) exist.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const Q = await import('../js/quake-history-core.js');
const { haversineKm } = await import('../supabase/functions/_shared/great-circle.js');
const FIX = JSON.parse(src('tests/fixtures/quake-history-kobe.json'));
const KOBE = { lng: 135.19, lat: 34.69 };

test('① the request names a whole-degree point, a widened radius, earthquakes only, and a capped read', () => {
  const u = new URL(Q.queryUrl('query', { lng: KOBE.lng, lat: KOBE.lat, radiusKm: 300, minMag: 5 }));
  assert.equal(u.origin + u.pathname, 'https://earthquake.usgs.gov/fdsnws/event/1/query');
  assert.equal(u.searchParams.get('latitude'), '35');
  assert.equal(u.searchParams.get('longitude'), '135');
  assert.equal(u.searchParams.get('eventtype'), 'earthquake');
  assert.equal(+u.searchParams.get('limit'), Q.QH.CAP);
  assert.equal(+u.searchParams.get('maxradiuskm'), 300 + Q.SLACK_KM);
  /* the slack covers the farthest point of any cell from its rounded centre — at every latitude */
  for (let lat = -80; lat <= 80; lat += 10) {
    for (const d of [[0.49, 0.49], [-0.49, 0.49], [0.49, -0.49]]) {
      const p = { lng: 10.5 + d[0], lat: lat + 0.5 + d[1] }, c = Q.roundedCentre(p.lng, p.lat);
      assert.ok(haversineKm(c.lng, c.lat, p.lng, p.lat) <= Q.SLACK_KM, 'slack covers ' + JSON.stringify(p));
    }
  }
  /* the exact centre never appears in any request this module writes */
  for (const kind of ['count', 'query']) assert.doesNotMatch(Q.queryUrl(kind, { lng: KOBE.lng, lat: KOBE.lat, radiusKm: 100, minMag: 6 }), /135\.19|34\.69/);
  assert.equal(new URL(Q.queryUrl('count', { lng: 0, lat: 0, radiusKm: 100, minMag: 5 })).pathname, '/fdsnws/event/1/count');
  assert.ok(Q.QH.FROM < '1568', 'the request starts before the oldest ComCat entry (1568, measured)');
});

test('② the record, evaluated on the real ComCat answer for Kobe', () => {
  const ev = Q.within(FIX.features, KOBE, 300);
  /* the exact circle: every kept event inside it, every dropped one outside */
  const kept = new Set(ev.map((e) => e.id));
  for (const f of FIX.features) {
    const d = haversineKm(KOBE.lng, KOBE.lat, f.geometry.coordinates[0], f.geometry.coordinates[1]);
    assert.equal(kept.has(f.id), d <= 300, f.id);
  }
  assert.ok(ev.length > 100 && ev.length < FIX.features.length, 'the widened read holds more than the circle');
  const kobe = ev.find((e) => e.id === 'usp0006rew');
  assert.ok(kobe, 'the 1995 Hyōgo-ken Nanbu earthquake is in the record');
  assert.equal(new Date(kobe.t).toISOString().slice(0, 10), '1995-01-16');
  const rec = Q.buildRecord(ev, { anchor: kobe, radiusKm: 300, minMag: 5, centre: KOBE, now: Date.parse('2026-10-08') });
  assert.equal(rec.n, ev.length);
  /* the largest, against the fixture itself */
  const maxMag = Math.max(...ev.map((e) => e.mag));
  assert.equal(rec.largest[0].mag, maxMag);
  assert.ok(rec.largest.length <= Q.QH.TOP);
  /* the rank: 1 + the number strictly larger; the previous one at least as large is the latest before it */
  const larger = ev.filter((e) => e.mag > kobe.mag).length;
  assert.equal(rec.anchor.rank, larger + 1);
  const prev = ev.filter((e) => e !== kobe && e.mag >= kobe.mag && e.t < kobe.t).sort((a, b) => b.t - a.t)[0];
  assert.equal(rec.anchor.prev && rec.anchor.prev.id, prev && prev.id);
  /* the decades: continuous from the first record's to now, counts summing to the record, the smallest per decade */
  const D = rec.decades;
  for (let i = 1; i < D.length; i++) assert.equal(D[i].decade - D[i - 1].decade, 10);
  assert.equal(D.reduce((s, d) => s + d.n, 0), rec.n);
  assert.equal(D[D.length - 1].decade, 2020);
  const firstDec = D.find((d) => d.n), lastDec = D.slice().reverse().find((d) => d.n);
  assert.ok(firstDec.minMag > lastDec.minMag, 'the early record misses the smaller quakes the late record holds (measured, not assumed)');
  /* the summary Atlas reads says what the record is not */
  const A = Q.forAtlas(rec, null, { raised: false });
  assert.match(A.caveat, /No rate or probability/);
  assert.match(A.source, /ISC-GEM.*CC BY-SA 3\.0/, 'ISC-GEM entries are present, so their credit is');
  assert.equal(A.anchor.rank, larger + 1);
});

test('③ the record at the clock\'s instant, and the age bands', () => {
  const ev = Q.within(FIX.features, KOBE, 300);
  const rec = Q.buildRecord(ev, { radiusKm: 300, minMag: 5, centre: KOBE });
  const T = Date.parse('1995-01-16T20:46:52.120Z');
  const a = Q.at(rec, T);
  assert.equal(a.shown.length + a.after, rec.n);
  assert.ok(a.shown.every((e) => e.t <= T) && a.last.id === 'usp0006rew');
  assert.equal(Q.at(rec, null).after, 0, 'no instant: the whole record');
  assert.equal(Q.ageBand(T, T), 0);
  assert.equal(Q.ageBand(T - 5 * 365.25 * 864e5, T), 1);
  assert.equal(Q.ageBand(T - 200 * 365.25 * 864e5, T), Q.AGE_BANDS.length - 1);
  /* a ring is closed */
  const r = Q.ring(KOBE, 300, 24);
  assert.deepEqual(r[0], r[r.length - 1]);
});

test('④ the floor rises to the next step that fits one read, and an unanswered count is not «fits»', async () => {
  const counts = { 4.5: 6284, 5: 1835, 5.5: 755 };
  const f = await Q.floorFor(4.5, async (m) => counts[m]);
  assert.deepEqual([f.minMag, f.asked, f.raised, f.total], [5, 4.5, true, 1835]);
  const g = await Q.floorFor(5, async () => 10);
  assert.deepEqual([g.minMag, g.raised], [5, false]);
  const h = await Q.floorFor(5, async () => null);
  assert.equal(h.unknown, true);
  const all = await Q.floorFor(4.5, async () => Q.QH.CAP + 1);
  assert.equal(all.cut, true);
  assert.equal(Q.magStep(6.8), 6);
  assert.equal(Q.magStep(4.6), 4.5);
  assert.equal(Q.radiusStep(250), 300);
  assert.equal(Q.readCount({ count: 12, maxAllowed: 20000 }), 12);
  assert.equal(Q.readCount('x'), null);
});

test('⑤ the link round-trips', () => {
  const l = Q.encodeLink({ lat: 34.69, lng: 135.19, radiusKm: 300, minMag: 5, eventId: 'usp0006rew' });
  assert.equal(l, 'qh=34.690,135.190,300,5,usp0006rew');
  assert.deepEqual(Q.decodeLink('?' + l), { lat: 34.69, lng: 135.19, radiusKm: 300, minMag: 5, eventId: 'usp0006rew' });
  assert.equal(Q.decodeLink('?qh=999,0,300,5'), null);
  assert.equal(Q.decodeLink('?qh=1,2,300,5,<script>').eventId, undefined, 'an id that is not an id is dropped');
});

test('⑥ Atlas and the doors', async () => {
  const caps = src('js/atlas-capabilities.js');
  assert.match(caps, /\["time\.quakeHistory","quakeHistory",[^\]]*"panel","panel\.quakeHistory,camera"[^\]]*"quakeHistory"\]/);
  const T = (await import('../js/atlas-cap-time.js')).default;
  const e = T.find((x) => x.row[0] === 'time.quakeHistory');
  assert.ok(e, 'the entry exists');
  const doc = e.doc.map((d) => d.text).join(' ');
  assert.match(doc, /EARTHQUAKE RECORD OF A PLACE/);
  assert.match(doc, /この場所の地震の記録/);
  assert.match(doc, /NO rate, probability or return period/);
  /* no place and no quake: answered, not guessed (#R302) */
  const K = { R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), warn: (s) => s, esc: (s) => String(s), L: (en) => en, geocode: async () => null };
  const r = await e.run({}, {}, K);
  assert.equal(r.ok, false);
  assert.equal(r.meta.code, 'NEEDS_INPUT');
  /* the doors */
  assert.match(src('js/lazy-modules.js'), /quakeHistory: \{ publishes: 'IntMapQuakeHistory', load: \(\) => import\('\.\/quake-history\.js'\)/);
  const wb = src('js/wb-layers.js');
  assert.match(wb, /data-qh-open=/);
  assert.match(wb, /register\('quakehistory\.open'/);
  assert.match(wb, /\[\?&\]qh=/);
  assert.match(src('js/place-dossier.js'), /data-hn="qrecord"/);
  /* the privacy text names what is sent, in both languages */
  const legal = src('js/legal-text.js');
  assert.match(legal, /earthquake record of a place, that place rounded to whole degrees/);
  assert.match(legal, /整数度に丸めた地点と選んだ半径/);
});
