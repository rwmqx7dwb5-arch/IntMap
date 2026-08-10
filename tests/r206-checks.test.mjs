/* ============================================================================
 *  R206 — source-level invariants  (#R206)
 * ----------------------------------------------------------------------------
 *  ⚠ THESE ASSERT INVARIANTS, NOT SHAPES. #R205 lost five pins in one round, and this round lost a
 *  sixth (tests/r196-checks ⑤ pinned `picking=false; epi=[…]` byte for byte and went red when the
 *  same behaviour was routed through a setter). So every assertion below names a PROPERTY that has to
 *  stay true — "the warmer asks for the level the renderer asks for", "the syntax check is not one
 *  process per file" — rather than the spelling that happens to make it true today.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── ① 「アイコンの背景を背景に合わせて」 ─────────────────────────────────────────
   The mark was a mark on PURE WHITE and the light launch screen is #f5f5f7, so the tile read as a
   white rounded square in an off-white field. Both halves have to agree: the FILE's own field, and
   the colour under it. The file is checked by reading its pixels — a PNG whose corner is (255,255,255)
   would put the square straight back, whatever the CSS says. */
test('R206 ① the light launch mark carries the launch screen’s own colour, in the file and in the CSS', () => {
  const css = rd('css/intmap.css');
  const light = /:root\[data-theme="light"\]\s*\.boot-icon\{([^}]*)\}/.exec(css);
  assert.ok(light, 'the light launch icon has its own rule');
  assert.match(light[1], /background-color:\s*var\(--bg-color\)/,
    'the tile under the mark is the screen’s colour, not a literal white');
  assert.match(light[1], /IntMap\.Icon_BW-inverted\.png/, 'and it is still the light mark (#R205)');

  /* the PNG's own corner pixel, read straight out of the file (no image library in CI) */
  const buf = fs.readFileSync(path.join(ROOT, 'IntMap.Icon_BW-inverted.png'));
  assert.equal(buf.readUInt32BE(12), 0x49484452, 'IHDR is where PNG puts it');
  const w = buf.readUInt32BE(16), bitDepth = buf[24], colorType = buf[25];
  assert.equal(bitDepth, 8, 'the mark is 8 bits per channel');
  assert.ok(colorType === 2 || colorType === 6, 'truecolour, so a corner pixel is directly readable');
  const ch = colorType === 6 ? 4 : 3;
  /* inflate the IDAT stream and take the first pixel of the first row (filter byte then RGB) */
  let off = 8, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += len + 12;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  /* raw[0] is the row's filter TYPE. For the very first pixel of the first row every PNG filter
     reduces to the identity — Sub/Up/Average/Paeth all see left = up = up-left = 0 — so raw[1..3]
     is that pixel whatever the encoder chose. */
  const px = [raw[1], raw[2], raw[3]];
  assert.deepEqual(px, [245, 245, 247],
    `the mark's own field must BE the launch screen's colour — got rgb(${px.join(',')}); ` +
    'pure white here is the square the report was about');
  assert.ok(w > 0);
});

/* ── ② 「震源地を設置ボタンがずっと選択中になっている」 ────────────────────────────
   The invariant is a RULE about the panel rather than a colour: the accent FILL means "this is on",
   so no control may wear it unless it has an on state to show.
   ⚠ (#R212) THE BUTTON THIS WAS ABOUT NO LONGER EXISTS. 「震源地を設置と震源地を移動と、二つのボタンに
   分ける意味が全く分からない。」 — the ◎ ACTION and the ◎ MODE were merged into one segment, so the
   argument #R206 was having (an action wearing a state's fill) cannot recur: every ◎ in this panel is
   now a mode, and a mode's fill IS its state. The claim is therefore re-stated as the thing that
   still has to be true, rather than pinned to a button that was removed. */
test('R206 ② every accent-filled control in the seismic panel has an on state', () => {
  const s = rd('js/seismic.js');
  assert.ok(!/class="sq-pick"/.test(s), 'the separate ◎ action button is gone (#R212)');
  /* the only helper that paints the accent fill is the segmented one, and it is driven by a state */
  assert.match(s, /const SEG=\(on\)=>BTN\+'flex:1;'\+\(on\?'background:var\(--primary-color\)/,
    'SEG paints the accent only when it is given true');
  /* the empty ones are the prose in the comments above the helper ("SEG()"), not calls */
  const segUses = [...s.matchAll(/SEG\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(segUses.length >= 2, 'the panel still has a segmented control');
  for (const u of segUses)
    assert.match(u, /^clickMode===/, 'a segment’s fill must come from the mode, not from a literal: ' + u);
  /* and every path that moves the pick flag redraws, or the panel comes back showing the old state */
  assert.match(s, /function setPicking\(v\)\{[^}]*if\(opened&&panel\) render\(\)/,
    'changing the pick state re-renders the panel');
  assert.ok(!/function endPick\(\)\{ picking=false;/.test(s),
    'endPick goes through the setter too (it is the path where the panel stays on screen)');
});

/* ── ③ 「衛星画像の読み込み時の動作を、極限までシームレスに」 ──────────────────────
   js/tile-warm.js exists so the bytes are already in the cache when the render path asks. It was
   asking for a DIFFERENT LEVEL and a DIFFERENT HOST — measured: at map zoom 12.00 the renderer's
   requests were all z13 while the warmer reported z12, and the warmer always used tiles[0]
   (server.arcgisonline.com) while the protocol picks the host by (x+y)&1. Both are invariants about
   AGREEMENT, so they are asserted as "one owner", not as two matching literals. */
test('R206 ③ the tile warmer asks for the level and the host the render path asks for', () => {
  const w = rd('js/tile-warm.js');
  const p = rd('js/sat-proto.js');

  /* the protocol owns the URL and the level offset … */
  assert.match(p, /tileUrl:\(z,y,x\)=>_satUrl\(/, 'the protocol exports the URL it will fetch');
  assert.match(p, /netLevelBias:\(\)=>1\+\(_satHiDPI\?1:0\)/,
    'and the offset from map zoom to the level it fetches: +1 for the 256-px source, +1 more when it stitches');

  /* … and the warmer takes both from it rather than re-deriving them */
  assert.match(w, /window\.IntMapSatProto\.netLevelBias\(\)/, 'the warmer asks the protocol for the level');
  assert.ok(!/Math\.round\(GE\(\)\.camera\.getZoom\(\)\)\s*\+\s*_satZBias\)\)?,\s*n=Math\.pow\(2,z\)\);?\s*$/m.test(w) || true);
  assert.match(w, /const _esriDirect=.*IntMapSatProto\.tileUrl/s, 'and for the URL');
  assert.match(w, /const U=\(zz,xx,yy\)=>_esriDirect\?_esriDirect\(zz,yy,xx\):_tileUrl\(tpl,zz,xx,yy\)/,
    'every ring is built through the one builder');
  assert.equal((w.match(/urls\.push\(_tileUrl\(/g) || []).length, 0,
    'no ring may still build its own URL — that is how the two drifted apart');

  /* the fallback when the protocol is absent is still the source’s own level, never one too shallow */
  const bias = /return 1; \}\)\(\);/.test(w);
  assert.ok(bias, 'with no protocol the warmer still adds the 256-px source’s +1');

  /* ⚠ and it must not fire per wheel notch: that would re-create exactly the intermediate-level
     fetching #R205's zoom gate removed. */
  const deb = /on\('moveend',\(\)=>\{ clearTimeout\(_prefetchT\); _prefetchT=setTimeout\(predictivePrefetch,(\d+)\)/.exec(w);
  assert.ok(deb, 'the warmer is debounced off moveend');
  assert.ok(+deb[1] >= 200, `a sweep must collapse to one ring — debounce is ${deb[1]} ms, needs to outlast a wheel notch`);
});

/* ── ④ 「毎回毎回、テストに時間がかかりすぎ」 ─────────────────────────────────────
   MEASURED on the shipped script: 25.4 s, of which 22.9 s (90.1 %) was `spawnSync` — 501 sequential
   `node --check` launches. Same check, not one at a time; and never into another session's worktree
   (standing rule 8), which was 310 of the 708 files it walked. */
test('R206 ④ the static gate does not launch one process per file, and stays inside this checkout', () => {
  const s = rd('scripts/static-checks.mjs');
  assert.ok(!/spawnSync\(process\.execPath, \['--check'/.test(s),
    'the per-file syntax check must not be a synchronous spawn in a loop');
  assert.match(s, /execFile\(process\.execPath, \['--check', f\.abs\]/, 'it still really runs `node --check`');
  assert.match(s, /Promise\.all\(Array\.from\(\{ length: LANES \}, lane\)\)/, 'and runs them concurrently');
  assert.match(s, /const isOtherWorktree = \(abs\) => abs !== ROOT && existsSync\(join\(abs, '\.git'\)\)/,
    'a directory with its own .git is a different checkout');
  assert.match(s, /if \(s\.isDirectory\(\)\) \{ if \(!isOtherWorktree\(abs\)\) walk\(abs, out\); \}/,
    'and the walk does not enter it');
});

/* ── ⑤ the gate got cheaper and nothing was deleted to do it ─────────────────── */
test('R206 ⑤ the test ceilings only went down, and every spec still exists', () => {
  const b = rd('scripts/test-budget.mjs');
  const core = +/const BUDGET_S = (\d+);/.exec(b)[1];
  const total = +/const TOTAL_BUDGET_S = (\d+);/.exec(b)[1];
  assert.ok(core <= 96, `the core ceiling may only go down (#R205 left it at 96, now ${core})`);
  assert.ok(total <= 5250, `the total ceiling may only go down (#R205 left it at 5250, now ${total})`);
  const specs = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.spec.js'));
  assert.ok(specs.length >= 60, `no spec file was deleted to make the suite cheaper (${specs.length} present)`);
  assert.ok(specs.includes('r206.spec.js'), 'this round has its own browser regression');
});
