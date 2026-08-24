/* ============================================================================
 *  #R349 — reaching 1850, and the two world wars day by day
 * ----------------------------------------------------------------------------
 *  ⚠ EVERY CHECK HERE RUNS THE SHIPPED CODE OR READS THE SHIPPED DATA. #R317's lesson is the reason:
 *  a check written as a regular expression over a source file answers a question about the spelling,
 *  and the two defects this round could actually ship are not spelling. They are (a) a front line
 *  that divides a country the wrong way round, which looks exactly like one that divides it correctly,
 *  and (b) a floor written down twice, where the copy in the UI is lower or higher than the kernel's
 *  and nothing anywhere reports a fault.
 *
 *  ⚠ AND THE FILES ARE READ THROUGH `readLF`. Two of them are `w/crlf` in a Windows working copy and
 *  `i/lf` in the index, so a pattern with a `\n` in it is green in CI for ever and red here for ever
 *  (#R283, and #R317 found a check that had never once run because of it).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { WarGeom } from '../js/war-geom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));

/* ── ① the floor is one number, and the UI reads it rather than repeating it ─────────────────── */
test('R349 ①: the clock reaches 1850, and js/news-timeline.js has no second copy of the floor', () => {
  const chronos = R('js/chronos.js');
  const m = chronos.match(/const YMIN\s*=\s*(\d{4})\s*;/);
  assert.ok(m, 'js/chronos.js must declare YMIN');
  assert.equal(m[1], '1850', 'the kernel floor is 1850');

  const ntl = R('js/news-timeline.js');
  assert.match(ntl, /const YMIN\s*=\s*\(\)\s*=>\s*\{[^}]*IntMapTime\.min/,
    'the panel must READ IntMapTime.min, not hold its own number');
  /* the four places that used to hold 1900: the slider min, the input guard, the reflect clamp and
     the ruler. None of them may name a year again. */
  for (const re of [/slider\.min\s*=\s*'1900'/, /y\s*>=\s*1900/, /Math\.max\(1900,/, /<span>1900<\/span>/]) {
    assert.doesNotMatch(ntl, re, 'a hard-coded 1900 came back to js/news-timeline.js: ' + re);
  }
  /* index.html's attribute is only the pre-JS value, but it must not contradict the kernel either */
  assert.match(R('index.html'), /id="ntl-slider"[^>]*min="1850"/, 'the slider markup starts at the floor');
});

/* ── ② the snapshot fallback reaches below CShapes, and picks the NEARER of the two down there ── */
test('R349 ②: nearest() answers 1875 with the 1880 snapshot and 1830 with 1815', () => {
  const src = R('js/time-borders.js');
  const years = src.match(/const YEARS\s*=\s*\[([^\]]+)\]/);
  assert.ok(years, 'js/time-borders.js must declare YEARS');
  const YEARS = years[1].split(',').map((n) => +n.trim());
  assert.ok(YEARS.includes(1815) && YEARS.includes(1880), 'the two pre-1900 snapshots are offered');

  /* run the shipped resolver rather than reading it: lift the exact source of `nearest` */
  const fn = src.match(/const nearest\s*=\s*y\s*=>\s*\{[\s\S]*?\};/);
  assert.ok(fn, 'the nearest() resolver must still be a single expression this test can lift');
  const nearest = new Function('YEARS', 'MAXGAP', 'CS_MIN',
    fn[0].replace(/^const nearest\s*=/, 'const nearest =') + ' return nearest;')(YEARS, 20, 1886);

  assert.equal(nearest(1875), 1880, '1875 is nearer 1880 than 1815 — and below CShapes there is nothing better');
  assert.equal(nearest(1850), 1880, 'the midpoint of the 1815/1880 gap is 1847.5');
  assert.equal(nearest(1830), 1815, '…and 1830 is on the other side of it');
  /* the guard is still doing its job ABOVE CShapes, where the snapshots are only a fallback */
  assert.equal(nearest(1980), 1960, 'a degraded 1980 must not be answered with the post-Soviet 1994 map');
});

/* ── ③ the historical series was extended, not rewritten ────────────────────────────────────── */
test('R349 ③: Maddison reaches 1850 and every cell is a real pair', () => {
  const j = JSON.parse(readFileSync(join(ROOT, 'data', 'maddison.json'), 'utf8'));
  const codes = Object.keys(j);
  assert.equal(codes.length, 168, 'the same 168 entities as before');
  let lo = Infinity, hi = -Infinity, pre = 0;
  for (const c of codes) {
    for (const y of Object.keys(j[c])) {
      const n = +y;
      assert.ok(Number.isInteger(n) && n >= 1850 && n <= 2018, `${c} ${y} is out of range`);
      const v = j[c][y];
      assert.ok(Array.isArray(v) && v.length === 2, `${c} ${y} is not a [gdppc, pop] pair`);
      assert.ok(v[0] != null || v[1] != null, `${c} ${y} is an empty pair — an absent year is absent, not null`);
      if (n < lo) lo = n; if (n > hi) hi = n;
      if (n < 1900) pre++;
    }
  }
  assert.equal(lo, 1850, 'the series starts at the clock floor');
  assert.equal(hi, 2018, 'and still ends where MPD2020 does');
  assert.ok(pre > 1500, `only ${pre} pre-1900 cells — the extension did not happen`);
  /* js/history.js must MEASURE that floor rather than declare one beside it */
  const h = R('js/history.js');
  assert.match(h, /get minYear\(\)\s*\{\s*return _minY;\s*\}/, 'minYear is derived from the loaded file');
  assert.doesNotMatch(h, /minYear:\s*1900/, 'the old literal floor is gone');
});

/* ── ④ the era→article table starts each polity at its own beginning ────────────────────────── */
test('R349 ④: no era span still opens at 1900 just because the window used to', () => {
  const src = R('js/time-borders.js');
  const tbl = src.slice(src.indexOf('const _ERA_WIKI'), src.indexOf('};', src.indexOf('const _ERA_WIKI')));
  /* ⚠⚠ (#R380) THIS CHECK USED TO BE A LIST OF TWENTY CODES WRITTEN OUT BY HAND, AND IT WAS GREEN
     WHILE FIFTEEN ROWS OF THE TABLE STILL OPENED AT 1900 — a check answering its own prose instead of
     the artefact it names. It reads the TABLE now: every row is parsed, and a row may open at exactly
     1900 only if 1900 really is that polity's start, which has to be said out loud in ALLOW below.
     The named cases stay underneath as evidence, not as the population. */
  const rows = [...tbl.matchAll(/\b([A-Z]{3}):\[(\[[^\]]*\](?:,\[[^\]]*\])*)\]/g)];
  assert.ok(rows.length >= 100, `only ${rows.length} rows parsed out of the era table — the parser, not the table, is what failed`);
  const ALLOW = { NER: 'the Third Military Territory of Niger was created in 1900 — there was no «Niger» to name before it' };
  const stillOpen = rows.map((m) => [m[1], +/^\[\s*(\d{4})/.exec(m[2])[1]])
    .filter(([code, first]) => first === 1900 && !ALLOW[code]).map(([code]) => code);
  assert.deepEqual(stillOpen, [], `these era spans still open at the old window bound: ${stillOpen.join(', ')}`);
  /* the states that certainly existed before 1900 — each must now say when it began */
  for (const [code, want] of [['CHN', 1850], ['RUS', 1850], ['GBR', 1850], ['TUR', 1850], ['GRC', 1850],
    ['IRN', 1850], ['THA', 1850], ['ETH', 1850], ['PRT', 1850], ['IDN', 1850],
    ['GUY', 1850], ['SUR', 1850], ['KWT', 1899], ['FJI', 1874], ['SLB', 1893], ['LAO', 1893]]) {
    const m = tbl.match(new RegExp(code + ':\\[\\[(\\d{4}),'));
    assert.ok(m, `${code} is missing from the era table`);
    assert.equal(+m[1], want, `${code} still opens at ${m[1]}`);
  }
  /* and the ones that needed an EARLIER era of their own, not just a lower bound */
  for (const [code, era] of [['FRA', 'Second_French_Empire'], ['DEU', 'German_Confederation'],
    ['JPN', 'Tokugawa_shogunate'], ['ITA', 'Kingdom_of_Sardinia'], ['AUT', 'Austrian_Empire'],
    ['IND', 'Company_rule_in_India'], ['KOR', 'Joseon'], ['BRA', 'Empire_of_Brazil'],
    ['MMR', 'Konbaung_dynasty'], ['TWN', 'Taiwan_under_Qing_rule']]) {
    assert.ok(tbl.includes("'" + era + "'"), `${code}'s pre-1900 era (${era}) is missing`);
  }
});

/* ── ⑤ the cut is arithmetic, and the arithmetic is checkable ───────────────────────────────── */
test('R349 ⑤: cutting a polygon by a line conserves its area, however often the line crosses', () => {
  const sq = [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]];
  const area = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
  const cases = {
    /* two crossings — the shape a front line usually has */
    simple: [[4, -1], [5, 5], [6, 11]],
    /* four — a line that runs along a border before turning in */
    zigzag: [[-1, 2], [5, 2], [5, 8], [-1, 8]],
    /* eight, leaving THREE pieces on one side: the case the first version of the cut refused */
    sawtooth: [[-1, 5], [2, 5], [3, 11], [4, 5], [7, 5], [8, 11], [9, 5], [11, 5]],
  };
  for (const [name, path] of Object.entries(cases)) {
    const r = WarGeom.cutPolygon(sq, path);
    assert.equal(r.problem, null, `${name}: ${r.problem}`);
    const sum = r.left.concat(r.right).reduce((s, p) => s + area(p[0]), 0);
    assert.ok(Math.abs(sum - 100) < 1e-6, `${name}: the pieces total ${sum}, not 100`);
    assert.ok(r.left.length && r.right.length, `${name}: the line produced only one side`);
  }
});

/* ── ⑥ the shipped record, read the way the layer reads it ──────────────────────────────────── */
const wars = JSON.parse(readFileSync(join(ROOT, 'data', 'wars.json'), 'utf8'));
const csText = readFileSync(join(ROOT, 'data', 'cshapes.js'), 'utf8');
const CS = JSON.parse(csText.slice(csText.indexOf('=') + 1).replace(/;\s*$/, ''));
const dnum = (d) => { const p = String(d).split('-'); return (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]); };
const polysOf = (f) => f[8].map((poly) => poly.map((ri) => CS.rings[ri]));

test('R349 ⑥: data/wars.json is shaped the way js/war-fronts.js reads it', () => {
  /* (#R409) v:2 — the file gained the shipped `kinds` table, a derived `span` per war, and the two
     optional figures on an operation. Every assertion below still holds; the version is pinned
     because a reader of this file that has not been taught the new members would drop them
     silently, and a bump is the one thing that says «go and look». */
  assert.equal(wars.v, 2);
  assert.deepEqual(wars.wars.map((w) => w.id), ['ww1', 'ww2'], 'both wars, in order');
  const LANGS = ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko'];
  const full = (o, what) => { for (const k of LANGS) assert.ok(o && o[k], `${what} has no ${k}`); };
  for (const w of wars.wars) {
    assert.match(w.from, /^\d{4}-\d{2}-\d{2}$/); assert.ok(w.to > w.from);
    full(w.name, w.id + ' name');
    assert.ok(w.factions.NEUTRAL, 'a country nobody lists must have something to be');
    for (const [k, f] of Object.entries(w.factions)) { assert.match(f.col, /^#[0-9a-f]{6}$/i, k); full(f.name, k); }
    for (const [gw, tl] of Object.entries(w.control)) {
      let prev = '';
      for (const [d, k] of tl) {
        assert.ok(d > prev, `${w.id} gw${gw}: ${d} does not come after ${prev}`); prev = d;
        assert.ok(d >= w.from && d <= w.to, `${w.id} gw${gw}: ${d} is outside the war`);
        assert.ok(w.factions[k], `${w.id} gw${gw}: unknown faction ${k}`);
      }
    }
    for (const F of w.fronts) {
      full(F.name, F.id);
      assert.ok(w.factions[F.left] && w.factions[F.right], F.id + ': both sides must be declared factions');
      let prev = '';
      for (const D of F.dates) {
        assert.ok(D.d > prev, `${F.id}: ${D.d} does not come after ${prev}`); prev = D.d;
        for (const p of D.pts) {
          assert.ok(Array.isArray(p) && p.length === 2 && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90,
            `${F.id} ${D.d}: ${JSON.stringify(p)} is not a coordinate`);
        }
        if (D.note) full(D.note, F.id + ' ' + D.d + ' note');
      }
    }
    for (const e of w.events) {
      full(e.name, e.wiki);
      assert.ok(Array.isArray(e.at) && e.at.length === 2, e.wiki + ': no place');
      assert.ok(!e.d2 || e.d2 >= e.d, e.wiki + ': it ends before it starts');
    }
  }
});

/* ⚠ THIS IS THE ONE THAT WOULD CATCH A FRONT DRAWN THE WRONG WAY ROUND. It resolves cities through
   WarGeom — the same code the browser paints with — from the SHIPPED file, so it is asking «what
   will a reader see», not «what did the author mean». scripts/build-wars.mjs runs the same list
   before it writes; this runs it against what was actually committed. */
test('R349 ⑦: named cities fall under the army the record says held them', () => {
  const CHECKS = [
    ['ww1', '1914-11-20', [4.352, 50.847], 'CENTRAL'],   /* Brussels */
    ['ww1', '1914-11-20', [2.352, 48.857], 'ALLIED'],    /* Paris */
    ['ww1', '1915-09-19', [21.012, 52.230], 'CENTRAL'],  /* Warsaw */
    ['ww1', '1915-09-19', [27.567, 53.902], 'ALLIED'],   /* Minsk */
    ['ww2', '1939-09-28', [21.012, 52.230], 'AXIS'],     /* Warsaw */
    ['ww2', '1939-09-28', [24.032, 49.842], 'NEUTRAL'],  /* Lviv — the Soviet side, and the USSR was neutral */
    ['ww2', '1940-06-25', [2.352, 48.857], 'AXIS'],      /* Paris */
    ['ww2', '1940-06-25', [3.426, 46.128], 'NEUTRAL'],   /* Vichy */
    ['ww2', '1941-12-05', [27.567, 53.902], 'AXIS'],     /* Minsk */
    ['ww2', '1941-12-05', [37.618, 55.756], 'ALLIED'],   /* Moscow */
    ['ww2', '1942-11-19', [39.720, 47.222], 'AXIS'],     /* Rostov-on-Don */
    ['ww2', '1943-11-06', [30.524, 50.450], 'ALLIED'],   /* Kyiv */
    ['ww2', '1944-09-15', [2.352, 48.857], 'ALLIED'],    /* Paris */
    ['ww2', '1945-04-16', [13.405, 52.520], 'AXIS'],      /* Berlin */
    /* ⚠ THE FOUR A SELF-AUDIT CAUGHT AFTER THE FIRST GREEN BUILD, none of which any gate was asking
       about. The July-1943 salients INTERLOCK — German at Orel bulging east, Soviet at Kursk bulging
       west — so a line drawn straight between them hands Orel to the Red Army a month early. And a
       front with no end keeps cutting after the army it belongs to has surrendered: Italy was whole
       and Allied from 2 May 1945 and Germany's own polygon ENDS on 7 May (CShapes replaces it with
       the two occupation zones), so «who holds Berlin in August» is a question about gw260/gw265. */
    ['ww2', '1943-07-04', [36.187, 51.731], 'ALLIED'],    /* Kursk — inside the Soviet salient */
    ['ww2', '1943-07-04', [36.062, 52.967], 'AXIS'],      /* Orel — inside the German one */
    ['ww2', '1943-07-04', [36.231, 49.988], 'AXIS'],      /* Kharkov, held since March */
    ['ww2', '1945-08-01', [13.405, 52.520], 'ALLIED'],    /* Berlin, three months after the surrender */
  ];
  const cutsFor = (war, gw, d) => {
    const out = [];
    for (const F of war.fronts) {
      if (F.until && d >= F.until) continue;
      let cur = null;
      for (const D of F.dates) { if (D.d <= d) cur = D; }
      if (!cur || cur.cuts.indexOf(gw) < 0) continue;
      out.push({ pts: cur.pts, left: cur.left || F.left, right: cur.right || F.right });
    }
    return out;
  };
  for (const [id, d, pt, want] of CHECKS) {
    const war = wars.wars.find((w) => w.id === id);
    const t = dnum(d);
    let hit = null;
    for (const f of CS.feats) {
      if (f[2] * 10000 + f[3] * 100 + f[4] > t || f[5] * 10000 + f[6] * 100 + f[7] < t) continue;
      if (WarGeom.pointInPolys(pt, polysOf(f))) { hit = f; break; }
    }
    assert.ok(hit, `${d}: no country contains ${pt}`);
    const tl = war.control[hit[1]];
    let base = 'NEUTRAL';
    if (tl) for (const [dd, k] of tl) { if (dd <= d) base = k; }
    const got = WarGeom.factionAt(pt, polysOf(hit), base, cutsFor(war, hit[1], d));
    assert.equal(got, want, `on ${d} the map puts ${pt} (${hit[0]}) under ${got}, the record says ${want}`);
  }
});

/* ── ⑧ the anchors are places, not typos ────────────────────────────────────────────────────── */
test('R349 ⑧: every front anchor that the bundled gazetteer knows is where the gazetteer puts it', async () => {
  const GZ = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-world.json.gz'))).toString());
  const { PLACES } = await import('../scripts/wars/places.mjs');
  const idx = new Map();
  for (const r of GZ.rows) idx.set(String(r[0]).toLowerCase() + '|' + r[2], [r[3], r[4]]);
  const km = (a, b) => {
    const rad = Math.PI / 180;
    const s = Math.sin((b[1] - a[1]) * rad / 2) ** 2
      + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
  };
  let proved = 0;
  for (const [name, v] of Object.entries(PLACES)) {
    assert.ok(Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90, name + ': coordinate out of range');
    if (v[3] === '!') continue;                       /* the six the gazetteer knows as somewhere else */
    const g = idx.get(name.toLowerCase() + '|' + v[2]);
    if (!g) continue;
    assert.ok(km(v, g) < 30, `${name} (${v[2]}) is ${km(v, g).toFixed(0)} km from the gazetteer's own ${name}`);
    proved++;
  }
  assert.ok(proved > 200, `only ${proved} anchors could be cross-checked — the gazetteer read is broken`);
});
