/* ============================================================================
 *  R175 source-level checks
 * ----------------------------------------------------------------------------
 *  Three subjects this round:
 *    ① the eye-anchored tilt must DOLLY on zoom instead of freezing the look-at target's altitude
 *    ② the hover tooltip must be clamped as the box it really is, and the aircraft detail card exists
 *    ③ the Vite migration's load-bearing invariants — the ones that, if they quietly stopped holding,
 *       would break the whole app at build time rather than at review time
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as acorn from 'acorn';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const ROOT = fileURLToPath(root);
const html = appSource(root);
const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
/* (#R175) the application body is js/app-body.js now — the camera hook, the tooltip clamp and the
   module instantiations all live there. THAT is what those assertions must read: pointed at
   index.html they would pass vacuously, which is precisely the failure this file exists to prevent. */
const body = readFileSync(join(ROOT, 'js/app-body.js'), 'utf8');
const entry = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
const vendor = readFileSync(join(ROOT, 'src/vendor.js'), 'utf8');
const panel = readFileSync(join(ROOT, 'js/aircraft-detail.js'), 'utf8');
const sim = readFileSync(join(ROOT, 'js/flight-sim.js'), 'utf8');
const jsFiles = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).sort();

/* ── ① the camera: zoom must move the eye, at every tilt ─────────────────────────────────────
   #R174 fixed "cannot zoom in past a point" by freezing the solve at the APPLIED zoom. That made a
   pure zoom pass through, but it also froze the look-at target's ALTITUDE — and after any tilt that
   target is up in the sky (6,914 m at pitch 85 from z12 over Tokyo). Since MapLibre's zoom means
   "approach the target", the eye then converged on a point in the air: measured 8,373 → 7,205 m over
   2.3 zoom levels at pitch 85, and 8,373 → 12,955 m (i.e. AWAY from the ground) at pitch 110. */
test('R175 ①: the tilt hook dollies — the target scales with the look distance', () => {
  /* (#R176) SUPERSEDED IN MECHANISM, KEPT IN INTENT — the same shape as the note #R175 left on
     #R174's version of this test. The whole solve moved out of metres-per-degree into MERCATOR units,
     because the tangent plane it stood on is only true while the look distance is small next to the
     Earth (16 km at z12, 8,573 km at z3 — measured drift 22,218 km). In merc units the dolly is free:
     k·d0 IS d1, so "pre-scale the eye by k" and "take the old attitude at the new look distance" are
     the same expression, and a pure zoom is still the identity.
     (#R177) SUPERSEDED AGAIN. Two things changed and both are forced:
       · the geometry is now gEye/gSolve, which speak the renderer's SPHERE model as well as its
         mercator one — `globe` uses both, and the merc expressions named above were wrong by
         thousands of kilometres below z12, where the app spends most of its time;
       · `k` is measured against the PROPOSAL's own previous zoom, not the applied zoom, because the
         sphere branch returns a zoom and `_requestedCameraState` never receives it. Measured on a
         globe z3 drag with the old reference: cur z3 against was z2.967, i.e. every frame of a plain
         tilt read as a 2.3 % dolly, six frames running.
     The claim is #R175's, unchanged: the dolly scales the anchored eye, a pure zoom is the identity,
     and the target is solved at the PROPOSED look distance. */
  assert.match(body, /const zRef=\(last&&isFinite\(last\.zoom\)\)\?last\.zoom:was\.zoom;/,
    'the dolly is measured against the proposal’s own history (the applied zoom now diverges from it)');
  assert.match(body, /const k=\(isFinite\(cur\.zoom\)&&isFinite\(zRef\)\)\?Math\.pow\(2,zRef-cur\.zoom\):1;/,
    'the look-distance ratio must be derived from the zoom difference');
  assert.match(body, /function gEye\(cam,c2c,tile,sphere,k\)\{/,
    'the dolly is a parameter of the ONE camera geometry, not a hand-written term');
  assert.match(body, /const anchor=gEye\(was,c2c,tile,sphere,k\);/,
    'the anchored eye is still scaled by k, so a pure zoom is a dolly and a pure tilt is unchanged');
  assert.match(body, /const sol=gSolve\(anchor,cur\.pitch,cur\.bearing,c2c,tile,cur\.zoom,sphere,cur,zLim\);/,
    'and the target is solved at the PROPOSED look distance (#R174 froze it at was.zoom)');
  assert.doesNotMatch(body, /d1=c2c\*mpp\(lat,was\.zoom\)/,
    'the #R174 frozen-distance solve must be gone — it is what made the report come back');
});

test('R175 ①: a zoom that also travels still carries the target altitude', () => {
  /* wheel zoom is zoom-around-the-POINTER, so the centre moves and every frame is classified as
     travel; without this branch the frozen-elevation bug survives the fix on the commonest gesture */
  /* (#R177) SUPERSEDED IN MECHANISM, KEPT IN INTENT: the mercator branch still scales the target's
     altitude by k and leaves the centre alone. The SPHERE branch cannot — its pivot is welded to the
     surface, so the target's elevation moves the camera not at all — and it must actively zero the
     number instead of letting a mercator-era one ride along: one did (1,488 km, at pitch 120) and
     the next camera change froze the renderer inside its tile cover. */
  assert.match(body, /if\(movedFromApplied&&\(movedFromLast\|\|!last\)\)\{[\s\S]*?if\(!zoomed\) return \{\};[\s\S]*?if\(sphere\) return \{ elevation:0 \};[\s\S]*?const el=was\.elevation\*k; return isFinite\(el\)\?\{ elevation:el \}:\{\};/,
    'a travelling frame that also zooms must scale the elevation and leave the centre alone');
});

/* ── ② the tooltip and the aircraft card ─────────────────────────────────────────────────── */
test('R175 ②: the hover tooltip is clamped as the box it really is', () => {
  assert.match(body, /const below=\(h\+TIP_GAP>py-TIP_EDGE\)&&\(h\+TIP_GAP<=mc\.height-py-TIP_EDGE\);/,
    'it must flip below the anchor when it cannot fit above');
  assert.match(body, /el\.classList\.toggle\('map-tooltip-below',below\)/, 'and say so, so the arrow can follow');
  assert.match(body, /top=Math\.max\(TIP_EDGE,Math\.min\(mc\.height-h-TIP_EDGE,top\)\)/,
    'the RENDERED top edge is what gets clamped, not the anchor');
  assert.doesNotMatch(body, /let y=Math\.max\(160, Math\.min\(mc\.height-h-12, point\.y\)\)/,
    'the old anchor-space clamp (which put a 300 px tooltip 158 px above the window) must be gone');
  const css = readFileSync(join(ROOT, 'css/intmap.css'), 'utf8');
  assert.match(css, /\.map-tooltip\.map-tooltip-below\{ transform:translate\(-50%,18px\); \}/);
  assert.match(css, /\.map-tooltip::after\{[^}]*left:var\(--tip-ax,50%\)/, 'the arrow tracks the anchor after a clamp');
});

test('R175 ②: the click opens a detail card, and the ADS-B record carries the whole feed', () => {
  const dl = readFileSync(join(ROOT, 'js/data-layers.js'), 'utf8');
  for (const f of ['ias:', 'tas:', 'mach:', 'oat:', 'navAlt:', 'navQnh:', 'roll:', 'trueHdg:', 'magHdg:', 'windDir:', 'windSpd:', 'rssi:', 'messages:', 'src:', 'emergency:']) {
    assert.ok(dl.includes(f), `adsbToPlane must carry ${f} — the card shows it and the sim starts from it`);
  }
  assert.match(dl, /if\(openPlaneCard\(d\)\)\{ if\(HOST\.mapTooltipEl\) HOST\.mapTooltipEl\.style\.display='none'; \}/,
    'a click opens the card and stands the tooltip down');
  assert.ok(dl.includes('else { const el=ensureMapTooltip();'), 'and falls back to the pinned tooltip if the card module is absent');
  assert.match(dl, /P\.update\(d,\{track:_trackCard\(d\.icao24\)\}\)/, 'the open card is refreshed by the live poll');
  assert.ok(body.includes('window.IntMapAircraftPanel=window.IntMapModules.aircraftDetail(map,IM_HOST);'),
    'the factory is instantiated');
  assert.ok(/'droneNav',\s*'aircraftDetail'/.test(entry), 'both new factories are covered by the required-module guard');
});

test('R175 ②: the flight starts from the aircraft’s OWN conditions', () => {
  assert.match(panel, /FS\.start\(\{ aircraft:ic\.key, lng:ic\.lng, lat:ic\.lat, alt:ic\.alt, hdg:ic\.hdg, speed:ic\.speed, keepAlt:true \}\)/,
    'position, altitude, heading, airspeed and the machine — and keepAlt, or the sim would raise it');
  /* the spawn-clearance opt-out must exist AND leave the old default alone */
  assert.match(sim, /const _clrLift=\(\)=>\(st&&st\._keepAlt\)\?30:1500, _clrMin=\(\)=>\(st&&st\._keepAlt\)\?30:1200;/,
    'ground+1,500 m stays the default for every caller that does not know its altitude');
  assert.match(sim, /st\._keepAlt=!!opts\.keepAlt;/);
  assert.match(sim, /function spec\(k\)\{ const a=AIRCRAFT\[k\]; if\(!a\) return null;/,
    'the flight envelope is read from the simulator, never copied into the card');
  /* the type→machine ladder: an A0 emitter category is "no information", and taking it at face value
     is what flew a Boeing 737-800 as a Cessna in the first build of this card */
  assert.match(panel, /if\(\/BOEING\|AIRBUS\|EMBRAER/, 'the registry description is consulted when the category says nothing');
  assert.ok(panel.includes("A0:") === false, 'A0 (“no information”) is never printed as if it were a fact');
});

test('R175 ②: the card speaks all five languages and credits the photographer', () => {
  const calls = [...panel.matchAll(/\bL\(/g)].length;
  assert.ok(calls > 40, `the card should be fully localised (found ${calls} L() calls)`);
  /* every L(...) must carry five arguments — a four-argument call is a missing language */
  const short = [...panel.matchAll(/L\((?:'[^']*'|"[^"]*")(?:\s*,\s*(?:'[^']*'|"[^"]*")){0,3}\)/g)];
  assert.equal(short.length, 0, `every L() takes five languages; ${short.length} call(s) do not: ${short.slice(0, 2).map((m) => m[0]).join(' | ')}`);
  assert.match(panel, /planespotters\.net/i, 'the photo source is named');
  assert.match(panel, /acp-credit/, 'and the photographer is credited — the licence requires it');
  const refs = readFileSync(join(ROOT, 'js/reference-data.js'), 'utf8');
  assert.match(refs, /Planespotters\.net/, 'the photo API is registered in Sources ▸ terms');
});

/* ── ③ the Vite migration's invariants ───────────────────────────────────────────────────── */
test('R175 ③: every js/ module is imported by the entry, in index.html’s old order', () => {
  const imported = [...entry.matchAll(/import '\.\.\/(js\/[^']+)';/g)].map((m) => m[1]);
  for (const f of jsFiles) assert.ok(imported.includes('js/' + f), `js/${f} is never imported by src/main.js`);
  for (const rel of imported) assert.ok(existsSync(join(ROOT, rel)), `src/main.js imports ${rel}, which does not exist`);
  assert.equal(imported[0], 'js/newsgeo.js', 'newsgeo stays first');
  assert.equal(imported[imported.length - 1], 'js/app-body.js', 'the application body is imported LAST');
  assert.equal(new Set(imported).size, imported.length, 'no module is imported twice');
});

test('R175 ③: no js/ module has a top-level declaration — the reason ESM is safe here', () => {
  /* This is THE property the whole migration rests on. A classic script's top-level `const`/`function`
     is a global; a module's is private. Every one of these files publishes itself on `window` and has
     no top-level declaration at all, so bundling them cannot change a single name resolution — and if
     someone ever adds one, this test fails before the silent breakage ships. */
  const offenders = [];
  for (const f of jsFiles) {
    const ast = acorn.parse(readFileSync(join(ROOT, 'js', f), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
    for (const n of ast.body) {
      if (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') offenders.push(`js/${f}: ${n.type} ${n.id && n.id.name}`);
      if (n.type === 'VariableDeclaration') offenders.push(`js/${f}: ${n.kind} declaration`);
    }
  }
  assert.deepEqual(offenders, [], 'these must be wrapped or attached to window instead:\n' + offenders.join('\n'));
});

test('R175 ③: index.html is markup again — the program is not inlined in it', () => {
  const inline = [...index.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1].length);
  const biggest = Math.max(0, ...inline);
  assert.ok(biggest < 20000, `the largest inline <script> is ${biggest} bytes — a bundler cannot minify inline code`);
  assert.ok(index.length < 120000, `index.html is ${index.length} bytes; it was 566 KB before #R175 and must not grow back`);
  assert.match(index, /<script type="module" src="\/src\/main\.js"><\/script>/, 'one module entry');
  assert.doesNotMatch(index, /<script src="js\//, 'no classic js/ tags remain');
  assert.doesNotMatch(index, /<script[^>]*src="https:\/\/unpkg\.com/, 'the CDN library tags are gone');
  assert.doesNotMatch(index, /<script[^>]*src="https:\/\/cdn\.jsdelivr\.net/, 'and so are the jsDelivr ones');
});

test('R175 ③: the vendor shim republishes every global the CDN tags used to define', () => {
  for (const g of ['maplibregl', 'mlcontour', 'turf', 'topojson', 'supabase', 'sb', 'html2canvas', 'katex']) {
    assert.match(vendor, new RegExp(`window\\.${g}\\s*=`), `window.${g} must still exist — call sites read it by name`);
  }
  assert.match(vendor, /persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, experimental: \{ passkey: true \}/,
    'the Supabase client keeps the exact options it had inline');
  assert.match(vendor, /import\('html2canvas'\)/, 'html2canvas stays off the critical path');
  assert.match(vendor, /import\('katex'\)/, 'and so does KaTeX');
});

test('R175 ③: the pinned versions did not drift when they moved to npm', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['maplibre-gl'], '5.24.0', 'pinned EXACTLY since #R158 — camera-API behaviour depends on it');
  assert.equal(pkg.dependencies['maplibre-contour'], '0.1.0');
  assert.equal(pkg.dependencies['katex'], '0.16.11');
  assert.equal(pkg.dependencies['html2canvas'], '1.4.1');
  assert.equal(pkg.scripts.build, 'vite build');
  assert.match(pkg.scripts.serve, /npm run build && node scripts\/serve\.mjs --root dist/, '`npm run serve` still means "the real site" — it just builds first');
});

test('R175 ③: every root asset the site references is in the build’s copy list', async () => {
  const { STATIC_ASSETS } = await import('../vite.config.js');
  const referenced = new Set();
  for (const m of index.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) referenced.add(m[1]);
  for (const m of html.matchAll(/['"]([\w-]+\.(?:png|jpg|woff2|json))['"]/g)) referenced.add(m[1]);
  const copied = new Set(STATIC_ASSETS);
  const missing = [];
  for (const r of referenced) {
    const clean = r.split('?')[0].split('#')[0].replace(/^\.?\//, '');
    if (!clean || !/^[\w\-./]+$/.test(clean)) continue;
    if (clean.startsWith('src/') || clean.startsWith('js/') || clean.startsWith('css/')) continue;  // bundled
    if (!existsSync(join(ROOT, clean))) continue;                                                   // built by CI, e.g. build-info.json
    if (clean.endsWith('.png')) continue;                                                           // every root PNG is copied
    const topDir = clean.split('/')[0];
    if (!copied.has(clean) && !copied.has(topDir)) missing.push(clean);
  }
  assert.deepEqual(missing, [], 'these ship today but the Vite build would not copy them: ' + missing.join(', '));
  assert.ok(copied.has('sw.js') && copied.has('admin.html') && copied.has('data'));
});

test('R175 ③: production publishes the build output, not the sources', () => {
  const dep = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
  assert.match(dep, /run: npm run build/, 'the deploy builds');
  assert.match(dep, /cp -r dist\/\. _site\//, 'and publishes dist/');
  assert.doesNotMatch(dep, /git archive HEAD \| tar -x -C _site/, 'the raw-tree publish is gone');
  const pw = readFileSync(join(ROOT, 'playwright.config.js'), 'utf8');
  assert.match(pw, /npm run build && node scripts\/serve\.mjs --port \$\{PORT\} --root dist/,
    'the browser tests run against the built site, so a build-only failure cannot reach production');
});

test('R175 ③: the build stamp was bumped', () => {
  /* (#R176) The point of this test is that the stamp MOVES, so pinning R175's own value would make it
     stop testing anything the round after. It now asserts the negative — the stamp is no longer R175's
     — and the current round pins the exact value in its own checks file. */
  assert.doesNotMatch(index, /window\.INTMAP_BUILD='2026-07-28-R175'/, 'the anti-stale-version stamp must move every round');
  assert.match(index, /window\.INTMAP_BUILD='\d{4}-\d{2}-\d{2}-R\d+'/, 'and must still be a dated round stamp');
});
