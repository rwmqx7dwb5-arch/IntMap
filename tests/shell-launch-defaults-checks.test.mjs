/* ============================================================================
 *  shell-launch-defaults-checks — the launch screen and what a fresh boot looks like
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r206-checks.test.mjs
 *  tests/r231-checks.test.mjs
 *  tests/r203-checks.test.mjs
 *  tests/r225-checks.test.mjs
 *  tests/r170-checks.test.mjs
 *  tests/r186-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import * as LM from '../js/layer-manifest.js';
import { OpeningView } from '../js/opening-view.js';
import { appShell } from './app-source.mjs';
import { publishedList } from './helpers/layer-groups.mjs';
import { codeOnly, codeOnly as stripComments } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R206 · from r206-checks.test.mjs ═══════════════════════ */
/* (#R206 — the round's own account of why these checks exist heads its other half, in tests/shell-test-infra-checks.test.mjs) */
{
const rd = read;

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
}

/* ═══════════════════════ #R231 · from r231-checks.test.mjs ═══════════════════════ */
/* (#R231 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
const noCss = (p) => codeOnly(read(p), { lang: 'css' });

/* ── ① the launch mark's field IS the launch screen ─────────────────────────────────────────── */
test('R231 launch screen: the dark mark is flattened onto the dark screen colour', () => {
  /* the CSS half — the tile is right in the frame before the PNG decodes */
  const css = read('css/intmap.css');
  const rule = css.slice(css.indexOf('.boot-icon{'), css.indexOf('.boot-icon{') + 260);
  assert.match(rule, /background:var\(--bg-color\)/, 'the dark tile takes the screen variable');
  assert.ok(!/background:#0a0a0c/.test(noCss('css/intmap.css')), 'and the hand-picked near-black is gone from the stylesheet');

  /* the FILE half — measured, not asserted from the script's own output */
  const buf = readFileSync(join(ROOT, 'IntMap.Icon.png'));
  const px = decodePNG(buf);
  const corners = [[0, 0], [px.w - 1, 0], [0, px.h - 1]];
  for (const [x, y] of corners) {
    const o = (y * px.w + x) * px.bpp;
    assert.ok(px.data[o] === 0 && px.data[o + 1] === 0 && px.data[o + 2] === 0,
      `the mark's field at ${x},${y} is the dark screen colour, not (${px.data[o]},${px.data[o + 1]},${px.data[o + 2]})`);
  }
  /* the script that produced it is idempotent and says so */
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/boot-icon-flatten.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /already wears the screen colour/);
});

/* a minimal truecolour PNG reader — the same one the build scripts carry */
function decodePNG(buf) {
  let i = 8, w = 0, h = 0, depth = 0, colour = -1;
  const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('ascii', i + 4, i + 8);
    const d = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; colour = d[9]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    i += 12 + len;
  }
  assert.equal(depth, 8); assert.ok(colour === 2 || colour === 6);
  const bpp = colour === 2 ? 3 : 4, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++], row = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0, c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}
}

/* ═══════════════════════ #R203 · from r203-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · R203 source-level checks
 * ----------------------------------------------------------------------------
 *  Node tests, no browser. Every one of these is DERIVED from the source rather than copied out of
 *  it — #R202's lesson about `r185`'s altitude floor is that the same number written in two places
 *  eventually disagrees, and a test is one of the two places.
 * ==========================================================================*/
{
const { subsolarPoint, solarElevation, openingCentre, MIN_ELEV_DEG } = OpeningView;
const rd = read;

/* ── ① THE APP DOES NOT OPEN ON A BLACK PLANET ─────────────────────────────────────────────────
   The measured defect: the whole canvas at [29,30,36] with 52 % of pixels under luminance 15,
   because 10°E was half past midnight. The fix is a longitude, and the thing worth pinning is the
   PROPERTY — after openingCentre(), the Sun is up over the centre — at every hour of the day. */
test('R203 ① the opening centre is always in daylight, at every hour of the day', () => {
  const day = Date.UTC(2026, 7, 8);
  for (let h = 0; h < 24; h++) {
    const ms = day + h * 3600e3;
    const c = openingCentre(ms, [10, 20]);
    const e = solarElevation(ms, c[1], c[0]);
    assert.ok(e >= MIN_ELEV_DEG - 1e-6, `at ${h}:00 UTC the opening centre ${c} has the Sun at ${e.toFixed(1)}°`);
  }
  /* …and it does not move when it does not have to: at the hour 10°E is in full daylight, the
     opening view is the one the app has always had. */
  const noon10E = Date.UTC(2026, 7, 8, 11);   /* ~12:40 local at 10°E */
  assert.deepEqual(openingCentre(noon10E, [10, 20]), [10, 20]);
});

test('R203 ①b the sub-solar point agrees with the almanac at the solstices and equinoxes', () => {
  /* declination: 0° at the equinoxes, ±23.44° at the solstices, to a tenth of a degree */
  const cases = [
    [Date.UTC(2026, 2, 20, 14, 46), 0],        /* March equinox 2026 */
    [Date.UTC(2026, 5, 21, 8, 25), 23.44],     /* June solstice */
    [Date.UTC(2026, 8, 23, 0, 6), 0],          /* September equinox */
    [Date.UTC(2026, 11, 21, 20, 51), -23.44],  /* December solstice */
  ];
  for (const [ms, dec] of cases) {
    const s = subsolarPoint(ms);
    assert.ok(Math.abs(s.lat - dec) < 0.15, `declination ${s.lat.toFixed(3)} vs ${dec} at ${new Date(ms).toISOString()}`);
    /* and the sub-solar point is where the Sun is overhead, by construction */
    assert.ok(Math.abs(solarElevation(ms, s.lat, s.lng) - 90) < 1e-6);
    /* local apparent noon: the sub-solar longitude is ~15°/h west of Greenwich at UT noon */
    const utHours = (ms - Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), new Date(ms).getUTCDate())) / 3600e3;
    const expect = ((-15 * (utHours - 12) + 540) % 360) - 180;
    assert.ok(Math.abs(((s.lng - expect + 540) % 360) - 180) < 5,
      `sub-solar longitude ${s.lng.toFixed(2)} is not within the equation of time of ${expect.toFixed(2)}`);
  }
});

test('R203 ①c the map is created at that centre, and js/opening-view.js is its only owner', () => {
  const body = rd('js/app-body.js');
  assert.match(body, /const _openingCentre=OpeningView\.openingCentre\(OpeningView\.openingClockMs\(\),\[10,20\]\)/,
    'the opening centre is computed once');
  assert.match(body, /center:_openingCentre,/, 'and the view is created at it');
  /* ⚠ published, so a test READS what the app decided instead of re-deriving a number that moves
     0.25° a minute — which is what took tests/r180-cesium red on the first post-merge run. */
  assert.match(body, /window\.__imOpeningCentre=_openingCentre/, 'and published for the tests');
  assert.match(body, /import \{ OpeningView \} from '\.\/opening-view\.js'/);
  /* nothing else may re-derive the Sun's position for this purpose */
  assert.doesNotMatch(body, /280\.460 \+ 0\.9856474/, 'the solar series lives in js/opening-view.js only');
});
}

/* ═══════════════════════ #R225 · from r225-checks.test.mjs ═══════════════════════ */
/* (#R225 — the round's own account of why these checks exist heads its other half, in tests/shell-tiles-perf-checks.test.mjs) */
{
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/* ── ⑤ A DEFAULT-ON ROW THAT WAS SWITCHED OFF STAYS OFF ────────────────────────────────────────────
   「base map & labelsも勝手に全部オンになる」. index.html ships seven base toggles CHECKED; the session
   saved them correctly as absent and the restore only ever turned OFF the ids in IntMapDefaultLayers,
   so every reload put them back at their HTML default. */
test('R225 ⑤ every default-ON id is in ONE list, and the restore turns all of them off', () => {
  const dl = read('js/data-layers.js');
  /* (layer-manifest) declared once is now ONE FIELD: \`on\` in js/layer-manifest.js, which both ticks the generated
     box and puts the id in window.IntMapDefaultOn (published FROM the manifest, checked by publishedList) */
  const union = publishedList('IntMapDefaultOn');
  assert.deepEqual(union.slice(union.length - publishedList('IntMapDefaultLayers').length), publishedList('IntMapDefaultLayers'),
    'the union is the markup half, then the thematic list it extends');
  /* every id in it is genuinely shipped checked (or is a thematic default)
     ⚠ (#R476) DERIVED, NOT COPIED. This loop used to carry its own hand-written copy of the seven ids,
     so the eighth (cb-coast) could be added to the list above and be checked by nobody — the shape
     #R309 spent a round removing from the product is not one to keep in the gate. */
  const declared = LM.LAYERS.filter((l) => l.html && l.on).map((l) => l.id);
  /* ⚠ (#R719) a «the regex matched» guard, not a count of how many toggles ought to be on — the
     same floor in tests/r476-checks ① failed the first lawful request to switch one OFF. */
  assert.ok(declared.length > 0, 'the base half is parsed, not assumed');
  for (const id of declared) {
    /* shipped = the markup js/layer-rows.js writes for it */
    const m = new RegExp('id="' + id + '"[^>]*checked|checked[^>]*id="' + id + '"');
    assert.ok(m.test(LM.rowHTML(LM.LAYERS.find((l) => l.id === id))), `${id} must actually be shipped checked, or it does not belong in the list`);
    assert.ok(union.includes(id), id + ' is in window.IntMapDefaultOn');
  }
  const st = read('js/session-tabs.js');
  assert.match(st, /const defOff=\(window\.IntMapDefaultOn\|\|window\.IntMapDefaultLayers\|\|\[\]\)\.filter/,
    'the off-sweep reads the union');
  assert.match(read('js/app-body.js'), /const IDS=\(\)=>\(window\.IntMapDefaultOn\|\|/,
    'and so does the default-on dispatcher — one list, two readers');
});
}

/* ═══════════════════════ #R170 · from r170-checks.test.mjs ═══════════════════════ */
/* (#R170 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language (see js/lang-registry.js). Asking this
   reader for js/i18n.js therefore hands back the whole table, which is what these assertions mean. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const R = (f) => (String(f).endsWith('js/i18n.js')
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js — so INDEX
   is the concatenation. Pointed at the new index.html these assertions would pass vacuously.
   JS_FILES stays the MODULE list: js/app-body.js is the page's own program, not a module. */
const INDEX = appShell(new URL('../', import.meta.url));
/* (#R178) …and js/geo-engine.js is not a module either — it is the renderer adapter, carved out of
   app-body.js this round. It is part of the page's program (see appShell), so questions asked of
   the MODULES must not be asked of it: it is the one file that is SUPPOSED to name MapLibre. */
/* (#R180) …and js/cesium-engine.js joins js/geo-engine.js on that exemption for the same
   reason: this check asks whether a MODULE gates a layer add on the renderer's own
   isStyleLoaded() instead of on canDraw(). An ADAPTER is where that question is answered, not
   asked — `isStyleLoaded()` on the Cesium view IS the implementation the contract's
   styleReady() delegates to, exactly as `map.isStyleLoaded()` is on the MapLibre side. */
const ADAPTERS = new Set(['geo-engine.js', 'cesium-engine.js']);
const JS_FILES = readdirSync(new URL('../js', import.meta.url)).filter(f => f.endsWith('.js') && f !== 'app-body.js' && !ADAPTERS.has(f));

/* strip /* … *\/ and // comments so "the code says X" is never satisfied by prose about X */

/* ---------------------------------------------------------------- requested defaults */

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('#R170 the bottom ticker defaults to OFF', () => {
  assert.match(INDEX, /window\.imTicker='off';/, 'imTicker must default to off on every device');
  assert.ok(!/window\.imTicker=\(window\.matchMedia/.test(INDEX), 'the old desktop-on default must be gone');
  // and the Settings label that has claimed "Off (default)" since #R63 is now true
  assert.match(INDEX, /data-i18n="tickerOff">Off \(default\)/);
});

/* spelling kept: browser script (js/workspace.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 desktop defaults to normal mode; workspace is opt-in', () => {
  const ws = stripComments(R('js/workspace.js'));
  const m = ws.match(/const _wantWS=\(\)=>\{[^\n]*\n?[^\n]*/);
  assert.ok(m, '_wantWS must still exist');
  assert.ok(!/return !isMob\(\)/.test(m[0]), 'desktop must no longer default INTO workspace mode');
  assert.match(m[0], /s\.on===1\|\|s\.on===true/, 'only an explicitly saved on:1 may enter workspace mode');
});

/* spelling kept: browser script (js/session-tabs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 a fresh desktop boot selects the Countries tab, once', () => {
  /* (#R200) the tab bar and the session that restores it are js/session-tabs.js now — a real ES
     module, so this asks THAT file rather than the page shell. Not a loosening: the shell no longer
     contains any of these four lines, so pointed at it every assertion below would fail. */
  const s = stripComments(R('js/session-tabs.js'));
  assert.match(s, /function _defaultTab\(\)/);
  assert.match(s, /IntMapOS\.exec\('tab\.stats',\{source:'default'\}\)/, 'the default tab must be Countries (tab.stats)');
  assert.match(s, /_tabInit=true/, 'it must record that it has run so it never overrides a user who closed every tab');
  assert.match(s, /tabInit:_tabInit/, 'and persist that in the session snapshot');
});

/* spelling kept: the source text is the subject (what a file carries, or that a copy is absent). */
test('#R170 every geolocation call asks for the best available fix', () => {
  const bad = [];
  for (const f of JS_FILES) {
    const src = R('js/' + f);
    for (const m of src.matchAll(/\{enableHighAccuracy:(\w+)[^}]*\}/g)) {
      if (m[1] !== 'true') bad.push(f + ' → ' + m[0].slice(0, 70));
      if (/maximumAge:(?!0\b)/.test(m[0])) bad.push(f + ' accepts a cached fix → ' + m[0].slice(0, 70));
    }
  }
  assert.deepEqual(bad, [], 'geolocation must be high-accuracy with no cached fix (「位置情報はできる限り高精度に」)');
});
}

/* ═══════════════════════ #R186 · from r186-checks.test.mjs ═══════════════════════ */
/* (#R186 — the round's own account of why these checks exist heads its other half, in tests/shell-sky-space-checks.test.mjs) */
{
/* (layer-manifest) the lists are views of js/layer-manifest.js */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n')
  : fs.readFileSync(path.join(ROOT, p), 'utf8'));
const bytes = (p) => fs.readFileSync(path.join(ROOT, p));

/* spelling kept: browser script (js/data-layers.js, js/session-tabs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R186 defaults: Köppen and the submarine cables are named once, and read by three places', () => {
  /* (#R200) the reader is js/session-tabs.js now — the session block left js/app-body.js for its own
     real ES module. Asked of that file directly rather than of a concatenation: stricter, because a
     third move would have to say so here. */
  const dl = read('js/data-layers.js'), ab = read('js/session-tabs.js');
  assert.deepEqual(publishedList('IntMapDefaultLayers'), ['dl-climate', 'dl-subcables']);   /* (layer-manifest) one field, \`on\`, in js/layer-manifest.js */
  assert.ok(/IntMapDefaultLayers/.test(ab), 'the session block must read the same list');
  /* …and the session restore must be able to turn one OFF again, or "default on" becomes "stuck on" */
  assert.match(ab, /defOff/, 'the restore has to switch a default-on layer back off when the session says so');
});

test('R186 launch screen: static markup, the real icon, and a failsafe', () => {
  const html = read('index.html');
  assert.match(html, /id="boot-splash"/, 'the splash must be in the HTML, not injected by JS');
  assert.match(html, /IntMap\.Icon\.png/, 'it must use the app icon');
  assert.ok(html.indexOf('id="boot-splash"') < html.indexOf('class="operation-room"'),
    'the splash has to be parsed before the app it covers');
  assert.match(html, /window\.__imBoot\s*=/, 'the milestone API');
  assert.match(html, /no ready signal after 20 s/, 'a launch screen that cannot be dismissed is worse than none');
  const icon = bytes('IntMap.Icon.png');
  assert.ok(icon[1] === 0x50 && icon[2] === 0x4e && icon[3] === 0x47, 'PNG');
  assert.ok(icon.length < 300_000, `${icon.length} bytes delays the very first paint`);
  assert.equal(icon.readUInt32BE(16), icon.readUInt32BE(20), 'an app icon is square');
  /* the splash styles must be in the render-blocking stylesheet, so it paints in the first frame */
  assert.match(read('css/intmap.css'), /\.boot-splash\{/);
});
}
