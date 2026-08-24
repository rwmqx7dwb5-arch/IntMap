/* ============================================================================
 *  #R409 — TWO WAR LAYERS, A SLIDER THAT DOES NOT OWN THE APP'S CLOCK, AND A
 *          RECORD THAT CANNOT CARRY A FACT NOTHING CAN DRAW
 * ----------------------------------------------------------------------------
 *  「World Wars layerをもっと充実させろ。また、凡例内にタイムスライダーをつけろ。また、WW1とWW2で
 *   レイヤーを分けろ。」
 *
 *  Every check below reads the SHIPPED artefacts — data/wars.json as it will be fetched, and the
 *  source of the files that read it — because that is what a reader meets. The three mistakes they
 *  exist to catch are each invisible on a working map:
 *    · a row split in two while something else still resolves the old single id, so a link people
 *      already sent each other silently opens nothing;
 *    · a legend control that writes window.IntMapTime, which looks identical on screen and moves
 *      the news, the borders, the terminator and every statistic once per animation frame;
 *    · a record that grows a fact — a kind, a figure, an operation before the first shot — that no
 *      part of the layer can put on screen.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');
const WARS = JSON.parse(R('data/wars.json'));
/* comments are prose: a rule asserted only inside a comment block asserts nothing */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const LANGS = ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko'];

/* ── ① the split is complete: two rows, and nothing still answers to the old one ─────────────── */
test('R409 ①: the Layers panel offers ww1 and ww2, and the retired single row is gone from it', () => {
  const shell = R('js/war-fronts.js');
  for (const id of ['ww1', 'ww2']) {
    assert.ok(shell.includes("id: '" + id + "'"), 'js/war-fronts.js does not declare the ' + id + ' row');
    assert.ok(shell.includes("'dl-' + R.id"), 'the checkbox id is no longer derived from the row id');
  }
  const cat = codeOnly(R('js/data-layers.js'));
  const row = /\['lyrGrpPolitics',\s*\[([^\]]*)\]\]/.exec(cat);
  assert.ok(row, 'the politics group is no longer a literal list — this check reads the list itself');
  const ids = row[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.ok(ids.includes('ww1') && ids.includes('ww2'), 'the two war rows are not both in the politics group: ' + ids.join(' '));
  assert.ok(!ids.includes('wars'), 'the retired combined row is still listed in the Layers panel');
});

/* ── ② …and a link that names the retired row still opens the two that replaced it ───────────── */
/* ⚠ THE RESTORE LOOP RESOLVES IDS WITH getElementById AND THEN CLOSES EVERYTHING NOT WANTED. So a
   share link, a bookmark or a session tab carrying `l=dl-wars` would not merely fail to open the
   war layer — it would also be read as «the reader did not want it», which is the shape that makes
   an old link look like a working link showing an empty map. */
test('R409 ②: a share link that still names dl-wars opens dl-ww1 and dl-ww2', () => {
  const src = codeOnly(R('js/map-ui.js'));
  const i = src.indexOf("wantSet.has('dl-wars')");
  assert.ok(i > 0, 'js/map-ui.js no longer migrates the retired dl-wars id');
  const near = src.slice(i, i + 420);
  assert.ok(/dl-ww1/.test(near) && /dl-ww2/.test(near), 'the migration does not name both replacements');
  assert.ok(/wantSet\.delete\('dl-wars'\)/.test(near), 'the retired id is left in the wanted set, so the close-everything-else pass will still see it');
  /* and it must run BEFORE the pass that switches unwanted layers off */
  const off = src.indexOf('querySelectorAll(DATASEL)');
  assert.ok(off > i, 'the migration runs after the pass that closes unwanted layers');
});

/* ── ③ the legend's own controls never write the master clock ────────────────────────────────── */
/* ⚠ 「付ける。Chronosは動かすな。」 — this is the check that would catch the one-word change that
   turns the day slider back into a master-clock driver. `IntMapTime.set` / `setYear` / `setNow` may
   appear in js/war-layer.js exactly once, in `toggle()`, which is the single seeding move the
   reader asked for; it may not appear anywhere the slider, the transport or the play loop reach. */
test('R409 ③: only toggle() writes window.IntMapTime — the slider, the transport and play do not', () => {
  const src = codeOnly(R('js/war-layer.js'));
  const writes = [...src.matchAll(/window\.IntMapTime\.(set|setYear|setNow|setIndex)\s*\(/g)];
  assert.equal(writes.length, 1, 'js/war-layer.js writes the master clock ' + writes.length + ' time(s); exactly one — the seed in toggle() — is allowed');
  /* the one write is inside toggle(), not inside the control wiring or the play loop */
  const fnAt = (name) => { const i = src.indexOf(name); assert.ok(i > 0, name + ' is gone'); return i; };
  const tog = fnAt('async function toggle(want)');
  const wire = fnAt('function wireLegend(');
  const play = fnAt('function togglePlay(');
  const at = writes[0].index;
  assert.ok(at > tog, 'the clock write is not inside toggle()');
  assert.ok(at < wire || at > wire + 2600, 'the clock write sits inside wireLegend()');
  assert.ok(at < play || at > play + 900, 'the clock write sits inside togglePlay()');
  /* and the play loop steps the LAYER's own date */
  const loop = src.slice(play, play + 900);
  assert.ok(/setDate\(/.test(loop), 'the play loop no longer moves the layer date');
  assert.ok(!/IntMapTime/.test(loop), 'the play loop touches the master clock');
});

/* ── ④ …and the controls are built once, not rebuilt under the finger holding them ───────────── */
test('R409 ④: a date change updates the legend controls in place instead of replacing them', () => {
  const src = codeOnly(R('js/war-layer.js'));
  assert.ok(/function syncControls\(/.test(src), 'the in-place update is gone — a range that rebuilds itself drops the drag after one pixel');
  const rp = src.slice(src.indexOf('function renderPanel('));
  assert.ok(/dataset\.built\s*!==\s*sig/.test(rp), 'renderPanel no longer guards the rebuild with a signature');
  /* the only innerHTML the per-date path writes is the prose block */
  const info = /\.war-info'\)\.innerHTML\s*=/.test(rp);
  assert.ok(info, 'the per-date render no longer writes into .war-info');
  /* ⚠ `_tileLegends()` re-lays out EVERY legend on the map. In the per-date path there may be
     exactly one call and it must sit behind the `!playT` guard — at nine frames a second an
     unguarded one is the animation's whole cost. */
  const dated = rp.slice(rp.indexOf('const sig ='));
  assert.ok(dated.length > 200, 'renderPanel no longer has a per-date path to check');
  const calls = [...dated.matchAll(/window\._tileLegends\s*\(/g)];
  assert.equal(calls.length, 1, 'the per-date path calls _tileLegends ' + calls.length + ' time(s); one, guarded, is allowed');
  const guard = dated.indexOf('if (!playT)');
  assert.ok(guard >= 0, 'the re-tile is no longer skipped while playing');
  assert.ok(calls[0].index > guard && calls[0].index - guard < 80, 'the re-tile is not inside the !playT guard');
});

/* ── ⑤ the shipped kind vocabulary is complete, and the layer reads IT rather than a copy ─────── */
test('R409 ⑤: every kind in the record has a colour and nine names, and no kind is hard-coded', () => {
  assert.ok(WARS.kinds && Object.keys(WARS.kinds).length >= 9, 'data/wars.json ships no kind table');
  for (const [k, v] of Object.entries(WARS.kinds)) {
    assert.match(v.col || '', /^#[0-9a-f]{6}$/i, 'kind ' + k + ' has no colour');
    for (const L of LANGS) assert.ok(v.name && v.name[L], 'kind ' + k + ' has no ' + L + ' name');
  }
  /* distinct colours: two kinds that paint the same dot are one kind with two names */
  const cols = Object.values(WARS.kinds).map((v) => v.col.toLowerCase());
  assert.equal(new Set(cols).size, cols.length, 'two kinds share a colour: ' + cols.join(' '));
  /* every kind a war actually uses is in the table */
  for (const w of WARS.wars) {
    for (const e of w.events) assert.ok(WARS.kinds[e.kind || 'battle'], w.id + ' event ' + e.wiki + ' has kind «' + e.kind + '», which the shipped table does not define');
  }
  const src = codeOnly(R('js/war-layer.js'));
  assert.ok(/function kindColourExpr\(/.test(src), 'the circle colour is no longer built from the shipped table');
  assert.ok(/data\.kinds/.test(src), 'js/war-layer.js does not read the shipped kind table');
  /* the old hand-written match expression must not come back */
  assert.ok(!/'political',\s*'#f0d264'/.test(src), 'a kind colour is hard-coded in the layer again — the record and the map can now disagree');
});

/* ── ⑥ nothing in the record is unreachable: every operation is inside the span the layer draws ─ */
/* ⚠ THIS IS THE CHECK THAT WOULD HAVE CAUGHT WHAT #R349 SHIPPED. The assassination at Sarajevo was
   in data/wars.json from the first day, 30 days before WW1's `from` — and the layer only drew a war
   between `from` and `to`, so it was never once on screen. An unreachable row is invisible in
   exactly the way an absent row is. */
test('R409 ⑥: every war carries a span, and every operation falls inside it', () => {
  for (const w of WARS.wars) {
    assert.ok(Array.isArray(w.span) && w.span.length === 2, w.id + ' ships no span — the layer would fall back to the fighting dates');
    assert.ok(w.span[0] <= w.from && w.span[1] >= w.to, w.id + ' span does not contain the war itself');
    for (const e of w.events) {
      assert.ok(e.d >= w.span[0], w.id + ' ' + e.wiki + ' starts before the span the layer draws');
      assert.ok((e.d2 || e.d) <= w.span[1], w.id + ' ' + e.wiki + ' ends after the span the layer draws');
    }
    /* the span is DERIVED, so it is exactly the record's own extent — never wider */
    let lo = w.from, hi = w.to;
    for (const e of w.events) { if (e.d < lo) lo = e.d; if ((e.d2 || e.d) > hi) hi = e.d2 || e.d; }
    assert.deepEqual(w.span, [lo, hi], w.id + ' span is not the record’s own extent');
  }
  /* and the layer draws by the span, not by from/to */
  const src = codeOnly(R('js/war-layer.js'));
  assert.ok(/const spanOf\s*=/.test(src), 'js/war-layer.js no longer reads the shipped span');
  assert.ok(/dateStr < sp\[0\] \|\| dateStr > sp\[1\]/.test(src), 'build() no longer bounds the frame by the span');
});

/* ── ⑦ the figures are shaped the way the popup and the radius read them ─────────────────────── */
test('R409 ⑦: every strength / casualty figure is an ordered pair or a positive integer', () => {
  let withCas = 0, withStr = 0, ranges = 0;
  for (const w of WARS.wars) for (const e of w.events) {
    for (const k of ['str', 'cas']) {
      const v = e[k]; if (v == null) continue;
      if (k === 'cas') withCas++; else withStr++;
      if (Array.isArray(v)) {
        ranges++;
        assert.equal(v.length, 2, w.id + ' ' + e.wiki + ' ' + k + ' is not a pair');
        assert.ok(v.every((n) => Number.isInteger(n) && n > 0), w.id + ' ' + e.wiki + ' ' + k + ' is not two positive integers');
        assert.ok(v[0] < v[1], w.id + ' ' + e.wiki + ' ' + k + ' is a pair whose ends are not ordered — a pair with equal ends must ship as one number');
      } else {
        assert.ok(Number.isInteger(v) && v > 0, w.id + ' ' + e.wiki + ' ' + k + ' is not a positive integer');
      }
      assert.ok((Array.isArray(v) ? v[1] : v) <= 30000000, w.id + ' ' + e.wiki + ' ' + k + ' is larger than any world-war operation');
    }
  }
  assert.ok(withCas >= 120, 'only ' + withCas + ' operations carry a casualty figure — the round put numbers on the record');
  assert.ok(withStr >= 60, 'only ' + withStr + ' operations carry a strength figure');
  assert.ok(ranges >= 20, 'only ' + ranges + ' figures are cited as a range — a single number claims the sources agree');
});

/* ── ⑧ the round's own promise: the record actually grew, in every direction it was asked to ─── */
test('R409 ⑧: the record carries more than it did, and no war is thin in any of the four', () => {
  const by = Object.fromEntries(WARS.wars.map((w) => [w.id, w]));
  /* the numbers #R409 started from: ww1 62 events / 9 fronts / 69 lines / 111 territories,
     ww2 159 / 12 / 95 / 114. Every one of these floors is above where the round began. */
  const floor = { ww1: { ev: 150, fr: 9, ln: 80, ct: 120 }, ww2: { ev: 300, fr: 12, ln: 115, ct: 130 } };
  for (const [id, f] of Object.entries(floor)) {
    const w = by[id]; assert.ok(w, id + ' is missing from the shipped record');
    const lines = w.fronts.reduce((a, F) => a + F.dates.length, 0);
    assert.ok(w.events.length >= f.ev, id + ' has ' + w.events.length + ' operations, below the ' + f.ev + ' this round set');
    assert.ok(w.fronts.length >= f.fr, id + ' lost a front: ' + w.fronts.length);
    assert.ok(lines >= f.ln, id + ' has ' + lines + ' dated front lines, below ' + f.ln);
    assert.ok(Object.keys(w.control).length >= f.ct, id + ' names ' + Object.keys(w.control).length + ' territories, below ' + f.ct);
    /* and the new kinds are actually used, not merely declared */
    const used = new Set(w.events.map((e) => e.kind || 'battle'));
    for (const k of ['air', 'siege', 'landing', 'conference', 'uprising']) {
      assert.ok(used.has(k), id + ' uses no operation of kind «' + k + '» — the vocabulary was declared and not written');
    }
    /* nothing may fall back to the default silently any more */
    const bare = w.events.filter((e) => !e.kind).length;
    assert.equal(bare, 0, id + ' still has ' + bare + ' operations with no kind — «battle» must be written, not implied');
  }
  /* ⚠ WW2 is the war with the camps, and a history layer that leaves them out is not neutral */
  const atroc = by.ww2.events.filter((e) => e.kind === 'atrocity');
  assert.ok(atroc.length >= 8, 'the WW2 record carries ' + atroc.length + ' mass-atrocity entries');
});

/* ── ⑨ every name the record ships is in all nine languages ──────────────────────────────────── */
test('R409 ⑨: every operation, front and faction name is complete in nine languages', () => {
  let n = 0;
  const chk = (o, what) => { n++; for (const L of LANGS) assert.ok(o && typeof o[L] === 'string' && o[L].trim(), what + ' has no ' + L); };
  for (const w of WARS.wars) {
    chk(w.name, w.id + ' name');
    for (const [k, f] of Object.entries(w.factions)) chk(f.name, w.id + '/' + k);
    for (const F of w.fronts) { chk(F.name, w.id + '/' + F.id); for (const D of F.dates) if (D.note) chk(D.note, w.id + '/' + F.id + ' ' + D.d); }
    for (const e of w.events) chk(e.name, w.id + ' ' + e.wiki);
  }
  for (const [k, v] of Object.entries(WARS.kinds)) chk(v.name, 'kind ' + k);
  assert.ok(n > 500, 'only ' + n + ' localized names were checked');
});

/* ── ⑩ the layer's own attribution is the record's, not a second copy ────────────────────────── */
/* ⚠ `src` was written by the build from the first day and NOTHING read it; the credit on screen was
   a hand-kept string in js/war-layer.js that named CShapes and not the record behind it. */
test('R409 ⑩: the shipped source line is what the map and the legend show', () => {
  assert.ok(WARS.src && WARS.src.length > 40, 'data/wars.json ships no source line');
  const src = codeOnly(R('js/war-layer.js'));
  assert.ok(/attrib = \(data && data\.src\)/.test(src), 'the map attribution is not read from the shipped source line');
  assert.ok(/war-src[\s\S]{0,80}data\.src/.test(src), 'the legend does not print the shipped source line');
  assert.ok(!/'CShapes 2\.0 \(Schvitz et al\. 2022\) · IntMap war record'/.test(src), 'the hand-kept second copy of the credit is back');
});

/* ── ⑪ Atlas can name both layers, in the languages the request arrives in ───────────────────── */
test('R409 ⑪: the two war rows have aliases Atlas can resolve', () => {
  const src = R('js/atlas-console.js');
  const need = [['world war ii', 'dl-ww2'], ['第二次世界大戦', 'dl-ww2'], ['ww2', 'dl-ww2'],
    ['world war i', 'dl-ww1'], ['第一次世界大戦', 'dl-ww1'], ['ww1', 'dl-ww1']];
  for (const [k, v] of need) {
    assert.ok(src.includes("'" + k + "':'" + v + "'"), 'LAYER_ALIASES does not map «' + k + '» to ' + v);
  }
  /* and the control plane exposes both, by name */
  const shell = codeOnly(R('js/war-fronts.js'));
  assert.ok(/R\.id \+ '\.toggle'/.test(shell) && /R\.id \+ '\.show'/.test(shell), 'the per-war IntMapOS commands are gone');
  assert.ok(/register\('wars\.toggle'/.test(shell) && /register\('wars\.show'/.test(shell), 'the pre-split command names no longer answer — a saved plan that says them does nothing');
});

/* ── ⑫ the transport is the app's one player, not a fourth copy of one ───────────────────────── */
test('R409 ⑫: the legend transport is built from window.IntMapWxPlayer', () => {
  const src = codeOnly(R('js/war-layer.js'));
  assert.ok(/window\.IntMapWxPlayer/.test(src), 'the war legend builds its own transport buttons');
  assert.ok(/B\.IC\.(first|prev|play|pause|next)/.test(src), 'the transport does not use the shared icon set');
  /* the shared CSS is what dresses them: no new rule for the player may appear in this file */
  const cssBlock = /function css\(\)[\s\S]*?\]\.join\(''\)/.exec(R('js/war-layer.js'));
  assert.ok(cssBlock, 'the legend stylesheet is gone');
  assert.ok(!/ecl-b\s*\{|ecl-player\s*\{|ecl-timerange\s*\{/.test(cssBlock[0]), 'the war legend restyles the shared player — two declarations of one control is how they drift apart');
});

/* ── ⑬ the favourite chip says the layer's name, not its id ──────────────────────────────────── */
/* ⚠ js/layer-favs.js reads a row's name from `span[data-i18n]` or `span.ec-lbl` and FALLS BACK TO
   THE RAW ID. The row this round replaced had neither, so pinning the world wars put a chip on
   screen labelled 「wars」 — in all nine languages. Splitting the row was the moment to fix it, and
   this is the check that keeps it fixed: the fallback is silent, so nothing else would say. */
test('R409 ⑬: each war row carries a label span that the favourites bar can read', () => {
  const shell = R('js/war-fronts.js');
  /* ⚠ read the block by OFFSET, not by a pattern anchored to a line end. This repository is checked
     out with CRLF on Windows and LF in CI, and the first spelling of this check — `';\n` — passed
     on the file as written and failed the moment git rewrote the endings. A check that depends on
     which machine wrote the file is not a check. */
  const at = shell.indexOf('w.innerHTML =');
  assert.ok(at > 0, 'the row markup is no longer a literal — this check reads it');
  const markup = shell.slice(at, at + 400);
  assert.ok(/class="ec-lbl"/.test(markup), 'the label span has no class js/layer-favs.js looks for, so a pinned war row is labelled with its raw id');
  const favs = codeOnly(R('js/layer-favs.js'));
  assert.ok(/querySelector\('span\.ec-lbl'\)/.test(favs), 'js/layer-favs.js no longer reads span.ec-lbl — the class above now means nothing');
});

/* ── ⑭ a layer whose era the clock has left holds its own day ────────────────────────────────── */
/* ⚠ THE SPLIT CREATED A CASE THAT DID NOT EXIST BEFORE. With one layer, «follow Chronos» had no
   wrong answer. With two, a clock at 1916 is inside WW1 and outside WW2 — and `setDate` clamps, so
   an unguarded follow would drag the WW2 layer to 1 September 1939 and stop its playback for a date
   that says nothing about it. */
test('R409 ⑭: the clock handler only follows an instant that lands inside this war', () => {
  const src = codeOnly(R('js/war-layer.js'));
  const i = src.indexOf('window.IntMapTime.on(');
  assert.ok(i > 0, 'the layer no longer subscribes to the master clock at all');
  const h = src.slice(i, i + 520);
  assert.ok(/if \(d < sp\[0\] \|\| d > sp\[1\]\) return;/.test(h), 'the clock handler no longer refuses an instant outside this war');
  /* and it refuses BEFORE it stops playback or repaints */
  const bail = h.indexOf('sp[1]) return;');
  const stop = h.indexOf('stopPlay()');
  assert.ok(bail > 0 && stop > bail, 'the handler stops playback before deciding whether the instant even belongs to this war');
});

/* ── ⑮ a SAVED SESSION that had the world wars on comes back with both wars on ───────────────── */
/* ⚠ THIS IS THE THIRD DOOR THE OLD ID COMES THROUGH, and each one closes separately: the Layers
   panel (①), a share link (②) and the session snapshot restored on the next visit. js/session-tabs.js
   keeps a RETIRED table precisely so a retirement is recorded in ONE place — but every entry it had
   was a RENAME, one id to one id, and this round is the first SPLIT. Translating dl-wars to one of
   the two would be choosing for the reader; translating it to neither is the feature quietly
   disappearing in a round that was about splitting, not removing. */
test('R409 ⑮: the retired dl-wars session id restores both war rows, and the rename entries still work', () => {
  const src = codeOnly(R('js/session-tabs.js'));
  const m = /const RETIRED=\{([\s\S]*?)\};/.exec(src);
  assert.ok(m, 'js/session-tabs.js no longer keeps the retirement table as a literal');
  assert.ok(/'dl-wars':\s*\[\s*'dl-ww1'\s*,\s*'dl-ww2'\s*\]/.test(m[1]), 'the retirement table does not turn dl-wars into both war rows');
  for (const keep of ['dl-oceancur', 'dl-night', 'dl-temp', 'bx-wbco2t', 'dl-milSpendGDP']) {
    assert.ok(m[1].includes("'" + keep + "'"), 'the rename entry for ' + keep + ' was dropped when the table learned to hold a list');
  }
  /* the loop must handle BOTH shapes — and de-duplicate, which is what the old entries relied on */
  const loop = src.slice(src.indexOf('const RETIRED='), src.indexOf('const RETIRED=') + 900);
  assert.ok(/Array\.isArray\(to\)/.test(loop), 'the loop still assumes every value is a single id, so the list form would be spliced in as an array');
  assert.ok(/want\.indexOf\(id\)\s*<\s*0/.test(loop), 'the list form does not de-duplicate — a session holding dl-wars AND dl-ww1 would tick one row twice');
  assert.ok(/if\(want\.indexOf\(to\)<0\)\s*want\[i\]=to;\s*else\s*want\.splice\(i,1\);/.test(loop), 'the single-id path changed shape — the five rename entries above rely on it exactly as it was');
});
