/* ============================================================================
 *  place-through-time — «この場所の歴史»: who held one point, and when
 *  (js/place-history.js, js/hist-bundles.js `contains`, js/time-borders.js / js/time-admin1.js `placeRecords`,
 *   scripts/build-hist-tiles.mjs box files, Atlas `time.placeHistory`)
 * ----------------------------------------------------------------------------
 *    ① THE SAME ANSWER FROM TILES AS FROM THE WHOLE FILE: for every record the timeline reads and the seven sites the
 *       development record checks, the door reading tiles (with the box files) returns exactly the rows, dates and sheet
 *       polygons the door reading the whole file returns — and reads less than the archive to do it;
 *    ② THE PREFILTER CANNOT DROP A ROW: against an exact test over every row with no box, at points spread over the
 *       world, `contains` answers the same rows;
 *    ③ THE TEST IS EXACT: a point in a concave notch or in a hole is outside;
 *    ④ the build refuses a box that misses one coordinate;
 *    ⑤ the composer: a handover is said only where a more precise record begins, a record's reach is never an end, the
 *       polity's own last year (Cliopatria) stays the polity's, gaps are listed, a row's button lands inside the entry;
 *    ⑥ AT THE SEVEN SITES: every edge called `stated` is the record's own day for that row; every year with no entry is
 *       inside a listed gap (a hole is said, not hidden); Kyoto reads as the records state it;
 *    ⑦ Atlas reaches the same record (`time.placeHistory`, target point);
 *    ⑧ the card's markup: no link inside a button, nothing interactive in Atlas's bubble.
 * ==========================================================================*/
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTiles, tileRecord, verifyBoxes, loadDoor } from '../scripts/build-hist-tiles.mjs';
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';
import { SITES, harness, historyAt } from '../scripts/place-history.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const J = (x) => JSON.stringify(x);
const GAPS = HIST_ADMIN_GAPS.filter((g) => existsSync(join(ROOT, g.file)));
const RECORDS = [
  { file: 'data/cshapes.js', global: '__CSHAPES' },
  { file: 'data/hist-borders.js', global: '__HISTB' },
  { file: 'data/hist-borders-late.js', global: '__HISTBLATE' },
  { file: 'data/hist-clio.js', global: '__HISTCLIO' },
  { file: 'data/hist-eras-rest.js', global: '__HISTERASREST' },
  { file: 'data/hist-admin1.js', global: '__HISTADM1', gaps: GAPS },
];

let OUT = null;
before(async () => {
  OUT = mkdtempSync(join(tmpdir(), 'intmap-ptt-'));
  await buildTiles({ outDir: join(OUT, 'data', 'hvt'), log: () => {} });
});
process.on('exit', () => { try { if (OUT) rmSync(OUT, { recursive: true, force: true }); } catch (_) { /* best effort */ } });

/* the app's clocked reader over the repository (data/) and the build (data/hvt/), honouring Range */
function reader({ tiles = true } = {}) {
  const log = [];
  const file = (url) => {
    const m = /(data\/[^?#]+)/.exec(String(url)); if (!m) return null;
    try { return readFileSync(m[1].startsWith('data/hvt/') ? join(OUT, m[1]) : join(ROOT, m[1])); } catch (_) { return null; }
  };
  return {
    log,
    clockFor: () => 60000,
    readWithin: async (url, ms, init, opts) => {
      let buf = /data\/hvt\//.test(url) && !tiles ? null : file(url);
      if (!buf) return { ok: false, status: 404, text: 'no', bytes: new ArrayBuffer(0) };
      const rg = init && init.headers && /^bytes=(\d+)-(\d+)$/.exec(init.headers.Range || '');
      let status = 200;
      if (rg) { buf = buf.subarray(+rg[1], +rg[2] + 1); status = 206; }
      log.push({ url: String(url), bytes: buf.length, range: !!rg });
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return opts && opts.bytes ? { ok: true, status, bytes: ab } : { ok: true, status, text: buf.toString('utf8') };
    },
  };
}
function door(FW) {
  const w = {};
  vm.runInNewContext(rd('js/hist-bundles.js'), { window: w, URL, Response, Blob, DecompressionStream, TextDecoder, console });
  return w.IntMapHistBundles.make({ win: {}, spawn: () => null, fetchWithin: FW });
}
const recordOf = (file) => { const t = rd(file); return JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); };

/* a point the first row with a polygon holds — found on a grid over its box, judged by the exact test below */
function aPointIn(d) {
  const i = (d.feats || []).findIndex((f) => f[8] && f[8].length);
  if (i < 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ri of d.feats[i][8][0]) for (const c of d.rings[ri]) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); }
  for (let a = 1; a < 20; a++) for (let b = 1; b < 20; b++) {
    const x = x0 + (x1 - x0) * a / 20, y = y0 + (y1 - y0) * b / 20;
    if (exactRows({ feats: [d.feats[i]], rings: d.rings }, x, y).length) return [x, y];
  }
  return null;
}

/* ═══ ① ═══ */
for (const R of RECORDS) {
  test(`place-through-time ①: ${R.file} — tiles and box files answer «contains» at the seven sites exactly as the whole file`, async () => {
    const FA = reader({ tiles: false }), FB = reader();
    const A = door(FA), B = door(FB);
    const hA = await A.open({ file: R.file, global: R.global, gaps: R.gaps }), hB = await B.open({ file: R.file, global: R.global, gaps: R.gaps });
    assert.equal(A.mode(R.global), 'whole');
    assert.equal(B.mode(R.global), 'tiled', 'the door read the tiles');
    let any = 0, first = null;
    /* the seven sites, and one point found inside the record's own first row (a record of colonial ground holds none of them) */
    const own = aPointIn(recordOf(R.file));
    for (const s of SITES.concat(own ? [{ name: 'a point of its first row', at: own }] : [])) {
      const a = await hA.contains(s.at[0], s.at[1]), b = await hB.contains(s.at[0], s.at[1]);
      assert.equal(J(b), J(a), `${R.file} at ${s.name}: the tiled answer differs from the whole file's`);
      any += a.rows.length + a.sheets.length;
      if (first == null) first = FB.log.filter((x) => x.range).reduce((n, x) => n + x.bytes, 0);   /* what ONE point cost */
    }
    assert.equal(B.mode(R.global), 'tiled', 'it did not fall back to the whole file');
    assert.ok(any > 0, R.file + ': no site is inside any row — the check would prove nothing');
    assert.ok(FB.log.some((x) => /\.box\.json$/.test(x.url)), 'the box file was read');
    const archive = first;
    const whole = readFileSync(join(OUT, 'data', 'hvt', R.file.replace(/^data\//, '').replace(/\.js$/, '.jsonl.gz'))).length;
    assert.ok(archive < whole, `${R.file}: read ${archive} of ${whole} archive bytes for one point — the box prefilter should read less than the archive`);
  });
}

/* ═══ ② ═══ */
function exactRows(d, x, y) {
  const out = [];
  d.feats.forEach((f, i) => {
    const hit = (f[8] || []).some((poly) => poly.reduce((ins, ri) => {
      const r = d.rings[ri]; let c = false;
      for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const ya = r[a][1], yb = r[b][1]; if ((ya > y) !== (yb > y) && x < r[b][0] + (y - yb) * (r[a][0] - r[b][0]) / (ya - yb)) c = !c; }
      return ins !== c; }, false));
    if (hit) out.push(i);
  });
  return out;
}
test('place-through-time ②: the box prefilter never drops a row an exact test over every row finds', async () => {
  for (const file of ['data/cshapes.js', 'data/hist-clio.js']) {
    const d = recordOf(file), A = door(reader({ tiles: false }));
    const h = await A.open({ file, global: file === 'data/cshapes.js' ? '__CSHAPES' : '__HISTCLIO' });
    let seed = 7, hits = 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let k = 0; k < 120; k++) {
      const x = -170 + rnd() * 340, y = -55 + rnd() * 125;
      const got = (await h.contains(x, y)).rows.map((r) => r[0]), want = exactRows(d, x, y);
      assert.equal(J(got), J(want), `${file} at ${x.toFixed(3)},${y.toFixed(3)}`);
      hits += want.length;
    }
    assert.ok(hits > 20, file + ': the sample hit too few rows to mean anything');
  }
});

/* ═══ ③ ═══ */
test('place-through-time ③: a concave notch and a hole are outside', async () => {
  const U = [[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]];          /* a U: the notch is x 1..2, y 1..3 */
  const sq = [[10, 0], [14, 0], [14, 4], [10, 4]], hole = [[11, 1], [13, 1], [13, 3], [11, 3]];
  const w = {};
  vm.runInNewContext(rd('js/hist-bundles.js'), { window: w, URL, Response, Blob, DecompressionStream, TextDecoder, console });
  const win = { __TESTREC: { rings: [U, sq, hole], feats: [['U', 1, 2000, 1, 1, 2001, 1, 1, [[0]]], ['holed', 2, 2000, 1, 1, 2001, 1, 1, [[1, 2]]]] } };
  const D = w.IntMapHistBundles.make({ win, spawn: () => null });
  const h = await D.open({ file: 'data/test.js', global: '__TESTREC' });
  const names = async (x, y) => J((await h.contains(x, y)).rows.map((r) => r[1][0]));
  assert.equal(await names(0.5, 2), J(['U']), 'an arm of the U');
  assert.equal(await names(1.5, 2), J([]), 'the notch of the U is outside although its box holds it');
  assert.equal(await names(10.5, 2), J(['holed']), 'the ring around the hole');
  assert.equal(await names(12, 2), J([]), 'the hole is outside');
  assert.equal((await h.contains(12, 2)).rows[0], undefined);
  const row = (await h.contains(0.5, 2)).rows[0][1];
  assert.equal(row[8], null, 'the geometry does not cross to the page');
});

/* ═══ ④ ═══ */
test('place-through-time ④: the build refuses a box that misses one coordinate', async () => {
  const d = loadDoor();
  const file = 'hist-borders-late.js', bytes = readFileSync(join(ROOT, 'data', file));
  const t = await tileRecord(d, { file, global: '__HISTBLATE', bytes });
  const rec = recordOf('data/' + file);
  assert.equal(verifyBoxes(t, rec), true);
  t.boxes.body.rows[2] -= 50;   /* the first row's box loses half a degree on its east side */
  assert.throws(() => verifyBoxes(t, rec), /outside its box/);
});

/* ═══ ⑤ ═══ */
test('place-through-time ⑤: the composer says a handover only where a finer record begins, and keeps reach and the polity\'s own end', async () => {
  const H = await harness('en');
  const { compose } = H.PH;
  const P = (tier, name, s, e, sEdge, eEdge, extra) => Object.assign({ tier, file: 'x', id: {}, name, label: name, i18n: { en: name }, s, e, sEdge, eEdge }, extra || {});
  const c = compose({ order: ['cshapes', 'ohm-late', 'ohm', 'clio', 'sheet'], records: [], missing: [], pieces: [
    P('clio', 'A', 15000101, 16890101, 'stated', 'stated', { life: [1400, 1800] }),            /* cut at OHM's start → handover */
    P('ohm', 'B', 16890101, 17000101, 'reach', 'stated'),
    P('clio', 'C', 17100101, 17500101, 'stated', 'stated', { life: [1700, 1749] }),             /* its own last year → stays stated */
    P('ohm', 'D', 17500101, 18860101, 'stated', 'reach'),
    P('cshapes', 'E', 18860101, 20200101, 'reach', 'reach'),
  ] });
  const by = (n) => c.entries.find((E) => E.name === n);
  assert.equal(by('A').to.edge, 'handover'); assert.equal(by('A').to.by, 'ohm');
  assert.equal(by('B').from.edge, 'reach', 'a record\'s first day is its reach, not a handover and not a beginning');
  assert.equal(by('C').to.edge, 'stated', 'Cliopatria states the polity ended in 1749 — the end is the polity\'s');
  assert.equal(by('E').to.edge, 'reach', 'CShapes\' last day is the record\'s, never the polity\'s');
  assert.deepEqual(c.gaps, [{ from: 17000101, to: 17100101 }], 'the decade no record covers is listed');
  for (const E of c.entries) assert.ok(E.jump.k >= E.from.k && E.jump.k < E.to.k, E.name + ': the button lands inside the entry');
  /* the same polity through two records is one entry */
  const m = compose({ order: ['ohm', 'clio'], records: [], missing: [], pieces: [P('clio', 'T', 16020101, 16890101, 'stated', 'stated', { id: { qid: 'Q1' } }), P('ohm', 'T', 16890101, 18680103, 'reach', 'stated', { id: { qid: 'Q1' } })] });
  assert.equal(m.entries.length, 1); assert.equal(m.entries[0].from.k, 16020101); assert.equal(m.entries[0].to.k, 18680103);
  /* the first-level band lists its gaps too: Kyoto's first-level record is silent between the abolition of Yamashiro (1871-08-29) and the prefecture the reconstruction states (1872-01-02) */
  const kyo = await H.PH.placeHistory({ lng: 135.7681, lat: 35.0116 });
  assert.ok(kyo.admin.gaps.some((g) => g.from === 18710829 && g.to === 18720102), 'the first-level gap is listed: ' + JSON.stringify(kyo.admin.gaps));
});

/* ═══ ⑥ ═══ */
test('place-through-time ⑥: at the seven sites every «stated» edge is the record\'s own day, and every uncovered year is a listed gap', async () => {
  const H = await harness('en');
  for (const s of SITES) {
    const raw = await H.borders.placeRecords(s.at[0], s.at[1]);
    assert.deepEqual(raw.missing, [], s.name + ': a record could not be read');
    for (const p of raw.pieces) {
      if (p.rawS != null && p.sEdge === 'stated') assert.equal(p.s, p.rawS, `${s.name} ${p.tier} ${p.name}: a «stated» start that is not the row's start`);
      if (p.rawE != null && p.eEdge === 'stated') assert.equal(p.e, p.rawE, `${s.name} ${p.tier} ${p.name}: a «stated» end that is not the row's end`);
      if (p.sEdge === 'reach') assert.ok(p.rawS == null || p.s >= p.rawS, `${s.name}: a reach start before the row`);
    }
    const rec = await historyAt(H, s.at[0], s.at[1]);
    const first = Math.min(...rec.nation.entries.map((E) => E.from.k)), last = Math.max(...rec.nation.entries.map((E) => E.to.k));
    for (let y = Math.ceil(first / 10000) + 1; y < Math.floor(last / 10000); y += 7) {
      const t = y * 10000 + 615;
      const held = rec.nation.entries.some((E) => E.from.k <= t && E.to.k > t), gap = rec.nation.gaps.some((g) => g.from <= t && g.to > t);
      assert.ok(held || gap, `${s.name} ${y}: neither an entry nor a listed gap`);
    }
  }
  const kyoto = await historyAt(H, 135.7681, 35.0116);
  const toku = kyoto.nation.entries.find((E) => E.name === 'Tokugawa Shogunate');
  assert.ok(toku, 'Kyoto: the Tokugawa shogunate');
  assert.deepEqual(toku.tiers.slice().sort(), ['clio', 'ohm'], 'one entry carried by Cliopatria and OpenHistoricalMap (the same Wikidata item)');
  assert.equal(toku.to.k, 18680103, 'its end is the day OpenHistoricalMap states (the restoration of imperial rule, 3 January 1868)');
  const japan = kyoto.nation.entries.find((E) => E.ids.some((x) => x.id.gw === 740));
  assert.equal(japan.to.edge, 'reach', 'CShapes stops in 2019; Japan did not');
  const yama = kyoto.admin.entries.find((E) => /Yamashiro/.test(E.name));
  assert.ok(yama && yama.from.edge === 'derived', 'Yamashiro\'s start is the class bound the record derived, and says so');
  assert.equal(yama.to.k, 18710829, '…and its end is the abolition of the han (29 August 1871) the record states');
});

/* ═══ ⑦ ═══ */
test('place-through-time ⑦: Atlas reaches the same record — time.placeHistory, a point, read-only, in the catalogue', async () => {
  const caps = (await import('../js/atlas-capabilities.js')).makeAtlasCapabilities({});
  const c = caps.get ? caps.get('time.placeHistory') : null;
  const row = rd('js/atlas-capabilities.js').match(/\["time\.placeHistory","placeHistory",[^\]]*\]/);
  assert.ok(row, 'the generated table carries the row');
  assert.match(row[0], /"read","none","point"/, 'read-only, no confirmation, a point is required');
  if (c) assert.equal(c.id, 'time.placeHistory');
  assert.match(rd('js/atlas-cap-time.js'), /import\('\.\/place-history\.js'\)/, 'the capability answers from js/place-history.js — the card\'s own record');
  assert.match(rd('js/atlas-caps-modules.js'), /atlas-cap-time/, 'the time namespace is in the dispatch');
});

/* ═══ ⑧ ═══ */
test('place-through-time ⑧: the markup — buttons hold no link, Atlas\'s bubble holds no button, en and jp are both written', async () => {
  const H = await harness('en');
  const rec = await historyAt(H, 21.0122, 52.2297);
  const html = H.PH.historyHtml(rec, 'en', {}), inert = H.PH.historyHtml(rec, 'en', { inert: true }), jp = H.PH.historyHtml(rec, 'jp', {});
  assert.ok(!/<button[^>]*>(?:(?!<\/button>).)*<a\b/s.test(html), 'a link inside a button');
  assert.match(html, /data-hn="ph:\d+"/); assert.match(html, /data-hn="pha:\d+"/);
  assert.ok(!/<button/.test(inert), 'Atlas\'s bubble is inert');
  assert.match(html, /First-level divisions here/); assert.match(jp, /この地点の第1級区分/);
  assert.match(html, /wikidata\.org\/wiki\/Q/, 'the record IDs link to their public pages');
});
