/* ============================================================================
 *  #R519 — four more wars on the day-by-day layer
 * ----------------------------------------------------------------------------
 *  「戦争の時間地図がWWI・WWIIに集中… 朝鮮戦争、ベトナム戦争、中東戦争、ユーゴ紛争などを同じ
 *  war-layer形式へ追加すると、既存基盤をそのまま使えるので強いです。」
 *
 *  The base WAS reusable. This file is about the three ways reusing it could go quietly wrong.
 *
 *  1. A WAR IN THE RECORD THAT NO ROW REACHES, or a row whose id no war answers to. The panel row
 *     and the curated record live in two different files and nothing paired them: a war could ship
 *     inside data/wars.json, pass every gate that reads that file, and be unreachable.
 *  2. A NAME THAT DEFAULTS. Two of the places that turn a war id into words were two-branch
 *     ternaries, because two wars were all there could be. A ternary over an id is not a lookup, it
 *     is a default, and the default was the Second World War: the third war would have opened its
 *     legend under 「第二次世界大戦（日ごと）」 and registered with IntMapOS as «World war II · show /
 *     hide», with every gate green.
 *  3. ⚠⚠ THE ONE THAT IS NOT ABOUT CODE AT ALL — A BASE MAP THAT IS ALREADY AN ANSWER. CShapes
 *     carries ONE geometry for the two Koreas from 1945-08-15 to 2019 (measured: the identical 248
 *     points), and that geometry is the 1953 armistice line, not the 38th parallel — its North
 *     Korean edge reaches down to 37.789°N and its South Korean edge up to 38.625°N. Draw the Korean
 *     War on it with no front and the opening day of the war shows the line that ENDED it, with
 *     Kaesong — in the Republic of Korea until 1951 — already on the northern side. Nothing in the
 *     build could see this: every gate there asks whether the record is self-consistent, and the
 *     record would be. ⑥ asks the shipped geometry instead.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { WarGeom } from '../js/war-geom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const wars = JSON.parse(R('data/wars.json'));
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* the panel rows, read out of the file that declares them rather than repeated here */
const ROWS = [...codeOnly(R('js/war-fronts.js'))
  .matchAll(/\{\s*id:\s*'([a-z0-9]+)',\s*sw:\s*'([^']+)',\s*os:\s*'([^']+)'/g)]
  .map((m) => ({ id: m[1], sw: m[2], os: m[3] }));

/* ── ① the Layers panel and the curated record name the same wars ────────────────────────────── */
test('R519 ①: every row is a war in data/wars.json, and every war has a row', () => {
  assert.ok(ROWS.length >= 6, 'js/war-fronts.js declares ' + ROWS.length + ' war rows; #R519 ships six');
  const rowIds = ROWS.map((r) => r.id);
  const warIds = wars.wars.map((w) => w.id);
  assert.deepEqual(rowIds, warIds, 'the Layers rows and the shipped record disagree about which wars exist: rows '
    + rowIds.join(' ') + ' / record ' + warIds.join(' '));
});

/* ── ② …and every one of them is on a shelf in the Layers panel ──────────────────────────────── */
test('R519 ②: every war row is listed in the politics group', () => {
  const m = codeOnly(R('js/data-layers.js')).match(/\['lyrGrpPolitics',\[([^\]]+)\]/);
  assert.ok(m, 'the politics group is no longer a literal list — this check reads the list itself');
  const ids = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  for (const r of ROWS) assert.ok(ids.includes(r.id), r.id + ' has a row but no shelf: it would strand under 「その他」');
});

/* ── ③ Atlas can be asked for each of them by name ───────────────────────────────────────────── */
test('R519 ③: every war has Atlas aliases pointing at its row', () => {
  const atlas = R('js/atlas-console.js');
  for (const r of ROWS) {
    const n = (atlas.match(new RegExp(":'dl-" + r.id + "'", 'g')) || []).length;
    assert.ok(n >= 4, 'dl-' + r.id + ' has ' + n + ' Atlas aliases; a war reachable only by its full label is'
      + ' the defect #R409 fixed for the world wars');
  }
});

/* ── ④ the row name exists in all nine languages ─────────────────────────────────────────────── */
/* ⚠ FIVE ARE POSITIONAL ARGUMENTS AND FOUR ARE TABLE LOOKUPS KEYED BY THE ENGLISH STRING. That split
   is why a row can be fully translated for en/ja/de/ru/es and silently English in zh-Hant, zh-Hans,
   fr and ko — the first five cannot be missing, and the last four can. */
test('R519 ④: every row label is translated in the four table languages too', () => {
  const labels = [...R('js/war-fronts.js').matchAll(/label:\s*\(\)\s*=>\s*L\('([^']+)'/g)].map((m) => m[1]);
  assert.equal(labels.length, ROWS.length, 'a row has no label, or a label has no row');
  for (const f of ['ui.zh.js', 'ui.zh-hans.js', 'ui.fr.js', 'ui.ko.js']) {
    const t = R('js/locales/' + f);
    for (const en of labels) {
      assert.ok(t.includes("'" + en + "'"), 'js/locales/' + f + ' has no entry for «' + en
        + '» — that row reads in English for those readers');
    }
  }
});

/* ── ⑤ no place turns a war id into words by defaulting to the other war ─────────────────────── */
test('R519 ⑤: the war name is looked up, not chosen by a two-branch ternary', () => {
  const os = ROWS.map((r) => r.os);
  assert.equal(new Set(os).size, os.length, 'two wars register with IntMapOS under the same label: ' + os.join(' / '));
  const layer = codeOnly(R('js/war-layer.js'));
  const shell = codeOnly(R('js/war-fronts.js'));
  for (const id of ROWS.map((r) => r.id)) {
    const re = new RegExp("id\\s*===\\s*'" + id + "'\\s*\\n?\\s*\\?");
    assert.ok(!re.test(layer), "js/war-layer.js still names a war with a ternary on id === '" + id
      + "'; the else-branch of that is every other war");
    assert.ok(!re.test(shell), "js/war-fronts.js still names a war with a ternary on id === '" + id
      + "'; the else-branch of that is every other war");
  }
});

/* ── ⑥ ⚠ the Korean War opens on the border it opened on, not on the one it ended on ─────────── */
test('R519 ⑥: on 25 June 1950 the map shows the 38th parallel, not the 1953 armistice line', () => {
  const csText = R('data/cshapes.js');
  const CS = JSON.parse(csText.slice(csText.indexOf('=') + 1).replace(/;\s*$/, ''));
  const polysOf = (f) => f[8].map((poly) => poly.map((ri) => CS.rings[ri]));
  const dnum = (d) => { const p = String(d).split('-'); return (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]); };
  const war = wars.wars.find((w) => w.id === 'korea');
  assert.ok(war, 'no Korean War in the shipped record');

  /* the base map really is the wrong shape — measured, not assumed, so the check below is known to
     be asking something */
  const t0 = 19500625;
  const nk = CS.feats.find((f) => f[1] === 731
    && f[2] * 10000 + f[3] * 100 + f[4] <= t0 && f[5] * 10000 + f[6] * 100 + f[7] >= t0);
  assert.ok(nk, 'CShapes has no North Korea on 25 June 1950');
  let edge = Infinity;
  for (const poly of polysOf(nk)) for (const ring of poly) for (const p of ring) {
    if (p[0] >= 126.6 && p[0] <= 128.5 && p[1] < edge) edge = p[1];
  }
  assert.ok(edge < 38, "CShapes' North Korea now stops at " + edge.toFixed(3)
    + '°N; this check exists because its polygon used to reach below the 38th parallel');

  const cutsFor = (gw, d) => {
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
  /* ⚠ THIS ASKS THE GEOMETRY, NOT A CITY, AND THAT IS THE SECOND HALF OF THE LESSON. The obvious
     check is «on 25 June 1950, whose is Kaesong» — Kaesong being the town that was South Korean
     until 1951 and that the base map alone puts in the north. But Kaesong is an ANCHOR of the line
     the record quotes for that day, so the cut passes through it and the answer is whichever side of
     a town-hall coordinate the arithmetic lands on. scripts/wars/ww1.mjs says exactly this about
     Ypres and Cambrai, and this file walked into it anyway.
     So the question is asked of the pieces instead: on the opening day the front has to divide BOTH
     Koreas, because the parallel it ran along is inside CShapes' North Korea in the west and inside
     its South Korea in the east. Two claims, no anchors, and neither can be satisfied by a layer
     that simply paints the two polygons whole. */
  const t = dnum('1950-06-25');
  const piecesFor = (gw) => {
    const f = CS.feats.find((x) => x[1] === gw
      && x[2] * 10000 + x[3] * 100 + x[4] <= t && x[5] * 10000 + x[6] * 100 + x[7] >= t);
    assert.ok(f, 'CShapes has no gw' + gw + ' on 25 June 1950');
    const tl = war.control[gw];
    let base = 'NEUTRAL';
    if (tl) for (const [dd, k] of tl) { if (dd <= '1950-06-25') base = k; }
    return { base, pieces: WarGeom.warPieces(polysOf(f), base, cutsFor(gw, '1950-06-25')) };
  };

  const north = piecesFor(731);
  assert.ok(north.pieces.some((p) => p.faction !== north.base),
    'on 25 June 1950 the whole of CShapes’ North Korea is painted ' + north.base
    + '; that polygon reaches down to 37.789°N, so the Ongjin peninsula and Kaesong — in the Republic of'
    + ' Korea until 1951 — are being handed to the north. The record needs a front along the 38th parallel'
    + ' cutting gw731 from the opening day');
  const south = piecesFor(732);
  assert.ok(south.pieces.some((p) => p.faction !== south.base),
    'on 25 June 1950 the whole of CShapes’ South Korea is painted ' + south.base
    + '; that polygon reaches up to 38.625°N, so the ground north of the parallel that the war began on'
    + ' is being handed to the south. The same front has to cut gw732 as well');
});

/* ── ⑦ no year of any war is a blank map ────────────────────────────────────────────────────── */
/* ⚠ THIS IS THE CLAIM THAT REPLACES tests/r381 ② FOR THE FOUR DISCONTINUOUS WARS, and it is a
   different claim rather than a weaker one. R381 ② asks for a dated front line in every calendar
   year, which is true of a war fought continuously and false of four wars that were not: Korea's
   last twenty months after the truce line was agreed, and the twenty-two years the Middle East
   spent between its wars, have no line because there was none to quote. Padding those years would
   mean writing positions nobody recorded — the one thing scripts/wars/lang.mjs refuses.
   What IS true of every war, and what a reader actually depends on, is that the layer can always
   answer «who held the ground». That is what this asks, and silence cannot satisfy it: a control
   table that stops early, a war whose span runs past the CShapes lifetime of its own countries, or
   a war whose gwcodes never existed all paint an empty map, and all fail here. ⚠ THE THIRD ONE IS
   NOT HYPOTHETICAL — CShapes ends on 2019-12-31, so a war set after it would render nothing at all,
   with every other gate in this repository green. */
test('R519 ⑦: every war paints somebody, in every year it was fought', () => {
  const csText = R('data/cshapes.js');
  const CS = JSON.parse(csText.slice(csText.indexOf('=') + 1).replace(/;\s*$/, ''));
  const dnum = (d) => { const p = String(d).split('-'); return (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]); };
  for (const w of wars.wars) {
    /* `from`..`to`, not `span` — the span reaches up to 120 days either side to keep events like the
       assassination at Sarajevo on screen, and on those days nobody has declared anything yet.
       Neutral is the right answer there, and asking for a side would be asking for a wrong one. */
    for (let y = +w.from.slice(0, 4); y <= +w.to.slice(0, 4); y++) {
      let probe = y + '-07-01';
      if (probe < w.from) probe = w.from;
      if (probe > w.to) probe = w.to;
      const t = dnum(probe);
      let live = 0;
      for (const gw of Object.keys(w.control)) {
        const f = CS.feats.find((x) => x[1] === +gw
          && x[2] * 10000 + x[3] * 100 + x[4] <= t && x[5] * 10000 + x[6] * 100 + x[7] >= t);
        if (!f) continue;
        let base = 'NEUTRAL';
        for (const [d, k] of w.control[gw]) if (d <= probe) base = k;
        if (base !== 'NEUTRAL') live++;
      }
      assert.ok(live > 0, w.id + ': on ' + probe + ' not one country the record names both exists in CShapes'
        + ' and is painted — that day of the war is a blank map');
    }
  }
});
