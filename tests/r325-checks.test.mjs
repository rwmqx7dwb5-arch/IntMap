/* ════════════════════════════════════════════════════════════════════════════════════════════════
 *  R325 — 「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」(7回目)
 *
 *  Six rounds (#R297 #R299 #R305 #R307 #R308 #R310 #R314) measured the FIELD read — the latitude
 *  band the particles fly in — and made it smaller, earlier, joinable, cached and finally read one
 *  hour ahead, until a step cost the particles nothing at all. None of them measured the OTHER
 *  read. This round instrumented the SDK's own reader on the built page:
 *
 *      zoomed in over Japan (z6, 132.8,32.3 → 143.2,39.6), one step of the axis
 *          the particles' band read          535,608 values      ← the latitudes on screen
 *          the COLOUR TILES' read          6,599,680 values      ← THE WHOLE PLANET
 *          over the wire                 9.76 MB, 31 requests
 *          readVariable, on the main thread   1,537 ms
 *
 *  Seven tiles of Japan served out of a decode of every grid point on Earth. READ OUT OF THE
 *  SHIPPED BUNDLE, the cause is one line: a tile's `dataOptions` is built as
 *  `{domain, variable, bounds: h.currentBounds}`, `h.currentBounds` starts `undefined`, and
 *  `getRanges(grid, undefined)` answers `[{0,ny},{0,nx}]` — everything. One exported function sets
 *  it, `updateCurrentBounds`, and this app had never called it.
 *
 *  Two more, from the same trace:
 *      · `setToOmFile` 629 ms IN FRONT of the tile read, for a file #R310's pool already had open —
 *        the tiles were the one reader left outside that pool;
 *      · a single 1,276 ms long task the moment twelve tiles were dispatched — the SDK posts the
 *        decoded field to its render worker with no transfer list, so each tile STRUCTURED-CLONES
 *        about 53 MB of Float32Array on the main thread.
 *
 *  A/B against origin/main, alternating the two trees inside ONE browser process (#R314's rule:
 *  the run-to-run swing to the data host is larger than the difference being measured).
 *
 *  ⚠ THE PICTURE IS THE SAME PICTURE. Same file, same 9 km spacing, same colour table, same
 *  tiles — what stops happening is reading the part of the grid no tile was going to draw, opening
 *  a file that was already open, and copying one field twelve times to draw it once. The two trees
 *  were screenshotted at four views with the particles switched off (they are a random simulation)
 *  and compared pixel for pixel; the numbers are in DEV-NOTES.md #R325.
 *
 *  ⚠ THESE CHECKS ASK FOR RELATIONS, NOT SPELLINGS (#R310's rule, and the lessons behind it).
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
/* ⚠ (#R283/#R317) READ THROUGH `readLF` — a Windows checkout has CRLF in the working tree, and a
   pattern that names a bare newline is then false here and true in CI, i.e. a check that never
   runs. `scripts/eol.mjs` NORMALISES; IT DOES NOT RELAX. */
import { readLF } from '../scripts/eol.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(join(ROOT, p));
/* this round's own prose names every mechanism it describes; prose about a rule is not the rule */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
/* the body of a named function, by brace matching — never by a character count (#R283/#R306) */
function fnBody(src, name) {
  /* ⚠ the OPENING PAREN is part of the name, or `omUrl` would find `omUrlOfSomethingElse` */
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return src.slice(i);
}
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
const WX = () => codeOnly(read('js/weather.js'));

/* ── ① the colour tiles are told what is on screen ────────────────────────────────────────────── */
test('R325 ① the tile protocol is handed the view before it runs', () => {
  const e = EC();
  /* the box comes from the camera, not from a constant */
  const vb = fnBody(e, 'viewBounds');
  assert.ok(vb, 'there is one named source for the box the tiles are read at');
  assert.match(vb, /camera\.getBounds\(\)/, 'and it is the live camera');
  assert.match(vb, /VIEW_PAD/, '…padded, for the tiles MapLibre keeps beyond the edge of the viewport');

  /* and it reaches the SDK on the protocol's own path, before the protocol runs */
  const reg = fnBody(e, 'registerProtocol');
  assert.ok(reg, 'the protocol is still registered in one place');
  const iApply = reg.indexOf('applyTileBounds');
  const iProto = reg.indexOf('omProtocol(');
  assert.ok(iApply > 0, 'the handler applies the box');
  assert.ok(iProto > 0 && iApply < iProto,
    'the box is applied BEFORE omProtocol reads it — the SDK samples `currentBounds` while it parses the url');

  /* the SDK's own setter, not a reimplementation of its snapping */
  assert.match(fnBody(e, 'applyTileBounds'), /updateCurrentBounds\(/,
    'through the SDK’s exported setter, which snaps the box OUTWARD to the tile grid');
});

/* ── ② …and at world zoom the box is NOT said, or one read becomes two ────────────────────────── */
test('R325 ② past WORLD_RATIO of the grid the box is left unsaid', () => {
  const e = EC();
  const tb = fnBody(e, 'tileBounds');
  assert.ok(tb, 'one place decides whether the box is worth saying');
  assert.match(tb, /WORLD_RATIO/, 'and the decision is a declared share of the grid');
  /* ⚠ THE RANGES, NOT THE DEGREES. The domain is a reduced Gaussian grid (#R299): a row holds
     points in proportion to cos φ, so a box that is half the planet in degrees can hold nearly all
     of its points. The SDK's own `getRanges` is the only honest answer. */
  assert.match(tb, /getRanges\(/, 'measured in grid points (getRanges), not in degrees');
  /* and when the box is not worth saying, it is CLEARED — a stale box would keep the tiles reading
     the wrong region for ever */
  assert.match(fnBody(e, 'applyTileBounds'), /currentBounds\s*=\s*undefined/,
    'the box is cleared rather than left standing at whatever the last zoomed-in view was');

  /* the reason it must be cleared: a GLOBAL field read shares the tiles’ state, because this
     module’s key IS the SDK’s `fileAndVariableKey` for a read with no band. */
  const load = fnBody(e, 'load');
  assert.match(load, /getOrCreateState\(\s*inst\.stateByKey/,
    'the field read still goes into the SDK’s own state map, which is what lets a global rung cost nothing');
});

/* ── ②b a tile can never fall outside the data its own read covers ───────────────────────────── */
test('R325 ②b the box always contains the tile that is being asked for', () => {
  const e = EC();
  const tb = fnBody(e, 'tileBounds');
  /* `getBounds()` is what the reader can SEE; `coveringTiles` is what MapLibre decides to FETCH,
     and under pitch the frustum reaches past the horizon the bounds stop at. A tile outside the
     box is not a slower picture, it is a MISSING one. */
  assert.match(tb, /tileBox\(/, 'the requested tile’s own bbox is taken into account');
  assert.match(tb, /Math\.min\([\s\S]{0,80}Math\.max\(/,
    'and it is UNIONED with the view rather than replacing it');
  const box = fnBody(e, 'tileBox');
  assert.ok(box, 'the tile bbox has one named source');
  assert.match(box, /tile2lon|tile2lat/, 'from the SDK’s own tile maths, not a second copy of it');
  /* ⚠ `tile2lon` wraps: the right edge of the world comes back as −180 rather than +180 */
  assert.match(box, /e\s*<=\s*w/, 'and the wrap at the antimeridian is handled');
  /* the url the handler received is what carries the tile index */
  assert.match(fnBody(e, 'registerProtocol'), /applyTileBounds\(\s*params[\s\S]{0,20}url/,
    'the handler passes the request’s own url, which is where the z/x/y lives');
});

/* ── ③ the tiles read through the ONE reader per file that #R310 built ────────────────────────── */
test('R325 ③ the colour tiles are inside the reader pool, not beside it', () => {
  const e = EC();
  const tr = fnBody(e, 'tileReader');
  assert.ok(tr, 'there is one named proxy for the reader the tiles use');
  assert.match(tr, /readerFor\(/, 'and it routes to the per-file pool');
  assert.match(tr, /omFileReader\s*=/, '…by replacing the instance’s own singleton');
  /* the SDK reaches THROUGH the reader for both of these; a proxy that dropped them would throw
     inside getProtocolInstance / clearCache rather than merely be slow */
  assert.match(tr, /config/, 'it forwards `config` (getProtocolInstance compares useSAB through it)');
  assert.match(tr, /cache/, 'and `cache` (clearCache calls omFileReader.cache.clear())');
  /* it must never dispose: the pool owns those readers and the field read may be using one */
  assert.match(tr, /dispose:\s*function\s*\(\)\s*\{\s*\}/,
    'and it never disposes — READER_MAX owns the lifetime, and a field read may hold the same reader');

  /* ⚠ AND THE OLD PIN MUST REFUSE IT. `pinReader` memoises `setToOmFile` by url; in front of the
     proxy that would skip the assignment which tells the next `readVariable` which pooled reader
     it belongs to. */
  const pin = fnBody(e, 'pinReader');
  assert.ok(pin, 'the per-reader pin is still there for the pool’s own readers');
  assert.match(pin, /_imProxy/, 'and it refuses the tile proxy');

  /* nothing pins the instance reader any more — that is the proxy’s job now */
  assert.ok(!/pinReader\(\s*inst\.omFileReader\s*\)/.test(e),
    'the instance reader is no longer pinned in place of being pooled');
});

/* ── ④ the next hour is OPENED ahead — and that is not a licence to READ it ───────────────────── */
test('R325 ④ opening the next hour is not reading it', () => {
  const e = EC(), w = WX();
  const oa = fnBody(e, 'openAhead');
  assert.ok(oa, 'there is one named door for the open-ahead');
  assert.match(oa, /openReader\(/, 'it opens through the pool, so the step’s own open is a no-op');
  assert.match(oa, /_touchDir/, 'in the direction the reader is travelling (#R305)');
  /* it must not start a read: no `load(`, no `readVariable`, no `prefetchVariable` in it */
  assert.ok(!/\bload\(|readVariable|prefetchVariable/.test(oa),
    'and it moves no data — an open is a HEAD, a trailer and a tree walk, which is `touch`’s price class, not a band’s');
  /* it is out of range at the ends of the axis rather than building a broken url */
  assert.match(oa, /validTimes\.length|\bn\b/, 'and it stops at the ends of the axis');

  /* ⚠ #R276 追記’S RULE IS UNTOUCHED: the BYTES of the next hour are still only spent once the
     reader has actually moved the axis. */
  assert.match(w, /opt&&opt\.step[\s\S]{0,240}?readAhead\(/,
    'the read-ahead of the next hour still happens only after a step, not on switch-on');
});

/* ── ⑤ the raster tile size is ONE declaration, and vector tiles do not get it ─────────────────── */
test('R325 ⑤ tile_size and tileSize are one number', () => {
  const e = EC(), w = WX();
  assert.match(e, /TILE_PX\s*=\s*(64|128|256|512|1024|2048)\b/,
    'the size is declared once, and it is one of the sizes the SDK accepts');
  /* the url side */
  const ru = fnBody(e, 'omRasterUrl');
  assert.ok(ru, 'the raster url is its own function');
  assert.match(ru, /tile_size=.*TILE_PX|TILE_PX/, 'and it spells the size from that one declaration');
  /* the plain url — the one the VECTOR sources use — must NOT carry it: for an MVT the SDK writes
     `tile_size` as the layer extent and lays the arrows out against it, which is a different
     decision and one this round did not measure */
  assert.ok(!/tile_size/.test(fnBody(e, 'omUrl')),
    'omUrl (isobars, wind arrows — vector sources) is unchanged');

  /* the renderer side: every raster source that carries an om:// url declares the same size, and
     it reads it from the module rather than repeating the number */
  const srcs = w.match(/addSource\([^;]*type:'raster'[^;]*\)/g) || [];
  assert.ok(srcs.length >= 2, 'both om raster sources are still built here');
  for (const s of srcs) {
    /* ⚠ (#R356) `EC` TAKES AN ARGUMENT NOW, AND THE CLAIM IS UNCHANGED. This pinned `EC()` because
       there was one model and therefore one accessor; each weather layer picks its own model since
       #R356, so the raster sources call `EC(cfg)` — the SAME accessor, resolved to the instance
       THIS layer is reading. What #R325 requires is that the size is READ from the module's one
       declaration rather than written down again beside the url, and that is what is asserted:
       any `EC(…)`, and never a numeric literal. */
    assert.match(s, /tileSize:\s*EC\([^)]*\)\.TILE_PX/,
      'every om raster source asks for the same size the url does — half of it would draw the map at the wrong resolution');
    assert.ok(!/tileSize:\s*\d/.test(s), '…and none of them writes the number down');
    assert.match(s, /omRasterUrl\(|url:url/, 'and it is a url that carries tile_size');
  }
  assert.match(w, /omRasterUrl\(/, 'the raster url helper is the one the raster sources use');
});
