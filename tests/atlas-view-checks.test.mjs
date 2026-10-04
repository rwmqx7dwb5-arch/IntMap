/* ============================================================================
 *  Atlas · looking at the map — the picture Atlas takes (js/atlas-view-capture.js) and what the
 *  picture is grounded against (js/atlas-view-ground.js)
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from two round files; every test keeps the title it had there:
 *    · tests/r493-checks.test.mjs — view.inspect: one capture, the vision channel, the exec carry
 *    · tests/r589-checks.test.mjs — 「これなに」 must not be answered by inventing a name
 *  ⚠ #R493's ledger installs a document stub; it is put back after the file.
 * ==========================================================================*/
/* ============================================================================
 *  IntMap · R493 — ATLAS CAN LOOK AT THE MAP  (view.inspect)
 * ----------------------------------------------------------------------------
 *  「Atlas自身が地図画像を添付できるようにする」
 *
 *  Atlas has read IntMap's inside since #R318 and had never seen its outside. This round gives it
 *  one capability whose result is a PICTURE — and the three things that can quietly make such a
 *  feature a no-op are what is checked here:
 *
 *   ① two captures. The screenshot button's picture and Atlas's picture must be the same code, or
 *      「読者が見ているもの」 becomes two different claims (#R231 measured what that costs INSIDE
 *      one file, when the map layer was sized from the backing store and the overlays from the CSS box).
 *   ② the image in the wrong channel. js/atlas-agent.js hands tool results back as JSON inside the
 *      PROMPT TEXT; a data URL put there is not an image, it is half a megabyte of base64. The
 *      pixels have to leave through the vision argument and the record has to stay small.
 *   ③ a capability that exists everywhere except in the switch. Registry, schema, catalogue, tool
 *      surface and dispatch are five files, and four of five is a tool that always fails.
 *
 *  ④ is not about this feature at all. Building it surfaced that the mechanical `exec` block a
 *  dispatch case returns has NEVER reached Atlas: js/atlas-results.js reads it out of
 *  `observed.exec`, and the only writer of that key is `fromLegacy`, which the app does not call.
 *  #R413 fixed `view.locate` to return one and its check pinned the SPELLING of the line — so the
 *  block was written, asserted, and dropped. The test below drives the REAL executor.
 * ==========================================================================*/
import { aiProxySource } from './helpers/ai-proxy-source.mjs';
import test from 'node:test';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeViewGround } from '../js/atlas-view-ground.js';
import { makeAtlasAnswerRender } from '../js/atlas-answer-render.js';
import { codeOnly } from '../scripts/code-only.mjs';
import { capsSource } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

const _saved = { document: globalThis.document };
after(() => { globalThis.document = _saved.document; });
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const lines = (p) => read(p).split(/\r?\n/);
/* comments carry the reasoning and quote the very code they explain; a check that reads them is
   reading prose. Every assertion below runs on the stripped source. */

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeViewCapture } = await import('../js/atlas-view-capture.js');
const { installAtlasKernel } = await import('../js/atlas-executor.js');
const { dispatchGroups } = await import('../scripts/atlas-capability-audit.mjs');

const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();
const CONSOLE_SRC = codeOnly((read('js/atlas-console.js') + '\n' + capsSource()));

/* ══ ① ONE CAPTURE, TWO CALLERS ═══════════════════════════════════════════════════════════════ */

test('R493 ①: Atlas and the map\'s picture take the SAME capture, by running the same code', () => {
  const cap = read('js/atlas-view-capture.js');
  /* (country-analysis-unify) the second caller was js/screenshot.js; 「Screenshot」 opens the share panel's Image tab now
     (tests/country-analysis-unify-checks ⑤), and that tab's picture — js/map-recorder.js postcard — is the caller */
  const shot = read('js/map-recorder.js');
  const atlas = (read('js/atlas-console.js') + '\n' + capsSource());

  /* the module really is the capture: the WebGL-inside-a-render-tick read, the #R231 single
     coordinate system, and the overlay pass all live here */
  /* (#R768) the fact is unchanged — the frame is read INSIDE a render tick — but the WAIT moved to
     js/geo-engine.js (`render.onNextFrame`), because the camera verdict needed the same question
     («is this page compositing?») and had nowhere to ask it, so it answered `no_change` instead. */
  assert.match(cap, /render\.onNextFrame\(/, 'the frame is read inside a render tick (preserveDrawingBuffer is OFF)');
  assert.match(cap, /cont\.clientWidth/, 'the output box comes from the container, not the backing store (#R231)');
  assert.match(cap, /html2canvas\(cont,/, 'the DOM overlay pass is here');
  assert.match(cap, /export function makeViewCapture/, 'and it has ONE door — tests/r175 ③ makes a dynamically-reached export look dead, so the three pieces are members rather than exports');
  assert.equal((cap.match(/^export /gm) || []).length, 1, 'exactly one export');

  /* …and BOTH callers reach it rather than re-implementing it. Both are fetched on demand — the share panel imports
     js/map-recorder.js the first time its Image tab is shown, js/atlas-console.js is the lazy kernel — so both import it
     statically and neither puts the capture into every reader's startup (the #R493 eager.modules 283 → 284 measurement
     is why the old button's file had to import it dynamically). */
  assert.match(codeOnly(shot), /import \{ makeViewCapture \} from '\.\/atlas-view-capture\.js'/,
    'js/map-recorder.js imports the shared capture');
  assert.match(codeOnly(atlas), /from '\.\/atlas-view-capture\.js'/,
    'js/atlas-console.js imports the shared capture');
  const shotCode = codeOnly(shot);
  assert.doesNotMatch(shotCode, /events\.once\('render'/, 'js/map-recorder.js must not keep a second frame grab');
  assert.doesNotMatch(shotCode, /html2canvas\(cont/, 'js/map-recorder.js must not keep a second overlay pass');
  assert.match(shotCode, /makeViewCapture\(/, '…it opens the shared door');
  assert.match(shotCode, /\.captureCanvas\(/, '…and takes the shared picture through it');
  /* no file in js/ builds a picture of the map on a path of its own any more */
  assert.ok(!existsSync(join(ROOT, 'js/screenshot.js')), 'the old button\'s own capture path is gone');
});

/* ══ ② THE IMAGE LEAVES BY THE VISION CHANNEL, NOT IN THE PROMPT TEXT ═════════════════════════
   ⚠ THESE RUN THE LEDGER, THEY DO NOT READ IT. A fake renderer and a fake document are enough to
   drive js/atlas-view-capture.js end to end, so what is asserted below is the behaviour the browser
   gets — not a spelling that could stay true while the thing it names dies (#R488). */

function fakeDom() {
  let n = 0;
  const canvas = () => ({
    width: 800, height: 600,
    getContext: () => ({ drawImage() {} }),
    toDataURL: () => 'data:image/jpeg;base64,FRAME' + (++n),
  });
  const doc = {
    body: { classList: { contains: () => false, add() {}, remove() {} } },
    getElementById: (id) => (id === 'map-container' ? { clientWidth: 800, clientHeight: 600 } : null),
    createElement: () => canvas(),
  };
  const GE = () => ({
    hasRenderer: () => true,
    /* (#R768) the engine runs the reader INSIDE the tick — `live` says a real frame arrived */
    render: { canvas: canvas, triggerRepaint() {}, onNextFrame: (_ms, fn) => fn(true) },
    events: { once: (_e, f) => f() },
  });
  return { doc, GE };
}

function ledger(state) {
  const { doc, GE } = fakeDom();
  globalThis.document = doc;
  if (typeof globalThis.window.devicePixelRatio !== 'number') globalThis.window.devicePixelRatio = 1;
  return makeViewCapture({
    GE, L: (en) => en, esc: (x) => String(x),
    snapshot: () => state || null,
    waitIdle: async () => {},
  });
}

const SNAP = {
  camera: { lat: 35.68, lng: 139.77, zoom: 5.82, bearing: 12, pitch: 40, base: 'satellite', projection: 'globe' },
  viewport: { west: 129.3, south: 31.1, east: 145.8, north: 45.7 },
  activeLayers: [{ label: 'Precipitation' }, { label: 'Earthquakes' }],
  time: { travelDate: '2026-08-28' },
};

test('R493 ②a: the record Atlas reads describes the frame WITHOUT carrying it', async () => {
  const V = ledger(SNAP);
  const r = await V.captureFrame({ include: 'screen', reason: 'check whether precipitation actually painted' });
  assert.equal(r.ok, true, 'the capture must succeed against a renderer that returns a frame');

  /* js/atlas-agent.js serialises every tool result into the PROMPT TEXT. A data URL put there is
     not an image — it is half a megabyte of base64 the model reads as characters. */
  const asTranscript = JSON.stringify(r.facts);
  assert.ok(!/data:image/.test(asTranscript), 'the tool result must not contain the image: ' + asTranscript.slice(0, 120));
  assert.ok(asTranscript.length < 700, `the record is ${asTranscript.length} bytes — it is meant to be small`);

  /* …and it states the things a picture can only approximate */
  assert.equal(r.facts.frame, 'view-frame-1');
  assert.equal(r.facts.include, 'screen');
  assert.deepEqual(r.facts.bbox, { west: 129.3, south: 31.1, east: 145.8, north: 45.7 });
  assert.deepEqual(r.facts.center, { lat: 35.68, lng: 139.77 });
  assert.equal(r.facts.zoom, 5.82);
  assert.equal(r.facts.bearing, 12);
  assert.equal(r.facts.pitch, 40);
  assert.deepEqual(r.facts.layersOn, ['Precipitation', 'Earthquakes']);
  assert.equal(r.facts.chronos, '2026-08-28');

  /* the pixels exist — in the ledger, which is the only thing that hands them to the vision call */
  assert.deepEqual(V.urls(), ['data:image/jpeg;base64,FRAME1']);
  /* and the reader is shown what Atlas was given */
  assert.match(r.html, /class="atl-viewframe"/);
  assert.match(r.html, /check whether precipitation actually painted/);
});

test('R493 ②b: a turn that looks more than the server accepts drops the OLDEST, and says so', async () => {
  const V = ledger(SNAP);
  for (let i = 0; i < 5; i++) await V.captureFrame({ include: 'map' });
  const max = +(/const MAX_IMAGES = (\d+);/.exec(aiProxySource()) || [])[1];
  assert.ok(max > 0, 'the server ceiling must be readable');
  assert.ok(V.SENT <= max, `the ledger attaches ${V.SENT} frames; supabase/functions/ai-proxy accepts ${max}`);

  const urls = V.urls();
  assert.equal(urls.length, V.SENT, 'only the most recent are attached');
  assert.deepEqual(urls, ['data:image/jpeg;base64,FRAME3', 'data:image/jpeg;base64,FRAME4', 'data:image/jpeg;base64,FRAME5'],
    'and "most recent" means the LAST ones, not the first');

  const block = V.promptBlock();
  /* ⚠ a silent truncation reads to the model as «you were shown all of them» */
  assert.match(block, /2 earlier frames are NOT attached/, 'the drop is stated');
  assert.match(block, /image 1 = view-frame-3/, 'image N is bound to the frame it actually is');
  assert.match(block, /image 3 = view-frame-5/);
  assert.equal((block.match(/^image /gm) || []).length, V.SENT, 'exactly as many descriptions as images');
});

test('R493 ②c: the prompt block gives the numbers, and says not to measure the picture', async () => {
  const V = ledger(SNAP);
  await V.captureFrame({ include: 'screen' });
  const block = V.promptBlock();
  assert.match(block, /visible bounds W 129\.30, S 31\.10, E 145\.80, N 45\.70/, 'the bbox is stated exactly');
  assert.match(block, /zoom 5\.82/);
  assert.match(block, /pitch 40°/);
  assert.match(block, /layers ON: Precipitation, Earthquakes/);
  assert.match(block, /Chronos date 2026-08-28/);
  assert.match(block, /Take every QUANTITY[\s\S]*never by measuring the picture/,
    'a picture is a poor ruler, and the model has to be told which half is which');
  /* the two pictures are described as what they are, so Atlas can tell a legend question from a data question */
  assert.match(block, /map \+ legends, scale, markers, bands, timebar/);
  const V2 = ledger(SNAP);
  await V2.captureFrame({ include: 'map' });
  assert.match(V2.promptBlock(), /renderer frame only — no legends, no DOM overlays/);
});

test('R493 ②d: a frame is a fact about a MOMENT — the next turn starts with none', async () => {
  const V = ledger(SNAP);
  await V.captureFrame({});
  assert.equal(V.urls().length, 1);
  V.reset();
  assert.equal(V.urls(), null, 'urls() must be null, not an empty array — that is what the transport takes for "no images"');
  assert.equal(V.promptBlock(), '', 'and no sentences describe images that are not attached');
});

test('R493 ②f: a frame that did not come from a render tick is REFUSED, not described', async () => {
  /* ⚠⚠⚠ MEASURED, NOT SUPPOSED. In a browser tab whose hidden flag is set, requestAnimationFrame
     fires 0 times in 700 ms and no 'render' event arrives — so the read falls through to the timer
     and returns an UNDRAWN WebGL buffer: 628 of 628 sampled pixels were (0,0,0). That is not a
     failed capture, it is a black rectangle that a vision model will confidently describe as a dark
     map. The ledger has to refuse it, and say why. */
  const { doc, GE } = fakeDom();
  globalThis.document = doc;
  const dead = () => Object.assign(GE(), { render: Object.assign({}, GE().render, { onNextFrame: (_ms, fn) => fn(false) }), events: { once: () => {} } });   /* nothing ever fires */
  const V = makeViewCapture({ GE: dead, L: (en) => en, esc: (x) => String(x), snapshot: () => SNAP, waitIdle: async () => {} });
  const r = await V.captureFrame({ include: 'map' });
  assert.equal(r.ok, false, 'an undrawn frame must not be handed to the model');
  assert.match(r.message, /background/i, 'and the reason must be the one Atlas can act on');
  assert.equal(V.urls(), null, 'nothing was recorded…');
  assert.equal(V.promptBlock(), '', '…and nothing is described');
});

test('R493 ②e: the console binds it — frames to the vision argument, reset to the turn', () => {
  /* kept as a spelling: the console’s transport binding is closure code inside js/atlas-console.js, which needs the page */
  /* the three lines that make the module reachable. The transport's third argument used to be
     `null` on every atlas_turn call; this is the one place that changes. */
  assert.match(CONSOLE_SRC, /const VFRAMES=makeViewCapture\(/, 'the ledger is built once, with the app injected');
  /* ⚠ (#R779) 第 3 引数は `VFRAMES.urls()` そのものではなくなった——#R773 が取り戻した添付の
     画像を同じチャネルに載せるので、**フレームと取り寄せを 1 か所で束ねる**（そしてそこが
     `urls()` の「空なら null」を受け止める。直接 `.concat` して本番が死んだのが #R779）。
     束ねる側が `urls()` を読んでいることは、ここで綴りを 2 つとも読んで結び直す。 */
  /* (atlas-native-tools) the frames are bundled once for the step and the call carries them as the images.
     (atlas-legacy-protocol-removal) there is one transport now — the one-string envelope's second call is gone. */
  assert.match(CONSOLE_SRC, /_tImgs=_atlTurnImgs\(VFRAMES\.urls\(\),/, 'the frames are bundled for the step');
  assert.match(CONSOLE_SRC, /askAIJSONEnvelope\('',_sys,_tImgs,/, 'the atlas_turn call carries the frames as IMAGES');
  assert.match(CONSOLE_SRC, /tail\+=VFRAMES\.promptBlock\(\)/, 'and the prompt names them');
  assert.match(CONSOLE_SRC, /VFRAMES\.reset\(\)/, 'and a new turn starts with none');
  assert.match(CONSOLE_SRC, /VFRAMES\.captureFrame\(a\)[\s\S]{0,200}exec:_vf\.facts/,
    'the dispatch hands back the RECORD; the pixels never enter the switch\'s return value');
});

/* ══ ③ THE CAPABILITY IS REAL IN ALL FIVE PLACES ══════════════════════════════════════════════ */

test('R493 ③: view.inspect is registered, typed, documented, offered and dispatched', () => {
  const cap = CAPS.resolve('view.inspect');
  assert.ok(cap, 'the registry knows it');
  assert.equal(cap.id, 'view.inspect');
  assert.equal(cap.legacy, 'inspect');
  /* it looks and changes nothing — so it holds no conflict key and can run beside anything */
  assert.deepEqual((cap.effects && cap.effects.writes) || [], [], 'view.inspect writes nothing');
  assert.equal(cap.risk, 'read-only', 'looking is a read');

  const schema = SCHEMAS.schemaFor('view.inspect');
  assert.ok(schema && schema.properties && schema.properties.include, 'it has a real schema');
  assert.deepEqual(schema.properties.include.enum, ['screen', 'map'], 'the two pictures are a closed set');
  assert.ok(!schema.required, 'an inspect with no arguments takes the whole screen — that is the right default');

  const DOCS = makeAtlasCatalogText({}, {});
  assert.ok(DOCS.idsCovered().includes('view.inspect'), 'the catalogue describes it');

  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: () => ({ ok: true }) });
  const core = surface.CORE.find((c) => c.cap === 'view.inspect');
  assert.ok(core, 'it is a CORE tool — a capability Atlas has to go looking for is one it never uses on the turn it matters');
  const tools = surface.baseTools();
  assert.ok(tools[core.name], `${core.name} is present on every turn`);
  assert.deepEqual(tools[core.name].parameters.properties.include.enum, ['screen', 'map'],
    'and it arrives with its real schema');
  assert.ok(!tools[core.name].endsTurn, 'looking does not end the turn');

  /* the switch — every spelling the registry promises */
  const spellings = new Set(dispatchGroups().flatMap((g) => g.names));
  for (const s of ['inspect'].concat(cap.aliases || [])) {
    assert.ok(spellings.has(CAPS.dispatchName(s)), `the dispatch has no case for "${s}", which the registry promises`);   /* (atlas-one-declaration) through the resolver the dispatch calls */
  }
});

/* ══ ④ THE `exec` BLOCK A CASE RETURNS ACTUALLY REACHES ATLAS ═════════════════════════════════ */

function kernel() { return installAtlasKernel({}, {}, { capabilities: makeAtlasCapabilities({}) }); }

test('R493 ④a: a case\'s mechanical `exec` survives the executor (it never had)', async () => {
  const { caps, exec } = kernel();
  caps.define({ id: 'test.execcarry', execute: () => ({ ok: true, html: 'x', exec: { frame: 'view-frame-1', zoom: 5.8 } }),
    effects: { reads: [], writes: [], conflictKeys: [] }, produces: [] });
  const r = await exec.execute('test.execcarry', {});
  assert.equal(r.status, 'completed');
  assert.deepEqual(r.observed.exec, { frame: 'view-frame-1', zoom: 5.8 },
    'the block the case returned must be on the result — js/atlas-toolsurface.js forwards this and nothing else');
});

test('R493 ④b: …including through an observer that reports an observation of its own', async () => {
  /* #R413's case. `view.locate` uses the `camera` observer, whose verdict carries `observed`, and
     the executor assigns the verdict over the composed object — so a carry placed inside that
     composition would be thrown away again for exactly the capability the block was written for. */
  const { caps, exec } = kernel();
  caps.define({ id: 'test.execcamera', execute: () => ({ ok: true, exec: { lat: 35.6, lng: 139.7, provenance: 'device_location' } }),
    effects: { reads: [], writes: [], conflictKeys: [] }, produces: [],
    observe: () => 1, verify: () => ({ status: 'completed', code: 'ok', observed: { camera: { zoom: 11 } } }) });
  const r = await exec.execute('test.execcamera', {});
  assert.equal(r.observed.camera.zoom, 11, 'the observer still says what it saw');
  assert.deepEqual(r.observed.exec, { lat: 35.6, lng: 139.7, provenance: 'device_location' },
    'and the case\'s own account survives beside it');
});

test('R493 ④c: an observer that reports its own `exec` still wins', async () => {
  const { caps, exec } = kernel();
  caps.define({ id: 'test.execwins', execute: () => ({ ok: true, exec: { from: 'case' } }),
    effects: { reads: [], writes: [], conflictKeys: [] }, produces: [],
    observe: () => 1, verify: () => ({ status: 'completed', code: 'ok', observed: { exec: { from: 'observer' } } }) });
  const r = await exec.execute('test.execwins', {});
  assert.deepEqual(r.observed.exec, { from: 'observer' }, 'the verifier watching the app is the authority');
});

/* ══ ⑤ THE THUMBNAIL IS ONE CLASS, NAMED BY EVERYTHING THAT NEEDS IT ══════════════════════════ */

test('R493 ⑤: the frame shown to the reader is styled AND opens in the viewer', async () => {
  /* ⚠ #R488's shape: a selector that stops matching fails SILENTLY — the tap simply does nothing.
     All three spellings are read out of the three sources, so a rename on one side cannot pass.
     ⚠ (tests-by-topic) TWO OF THE THREE ARE NOW WHAT THE MODULES EMIT: the stylesheet
     js/atlas-styles.js actually injects (atlasPanelCSS()), and the markup a real capture returns. The
     third — the lightbox delegation — is a click handler in js/atlas-attach.js that needs a document,
     so it stays a spelling. */
  const { atlasPanelCSS } = await import('../js/atlas-styles.js');
  const styles = atlasPanelCSS();
  const attach = codeOnly(read('js/atlas-attach.js'));
  const capture = (await ledger(SNAP).captureFrame({ include: 'screen' })).html;
  assert.match(styles, /\.atl-viewframe\{/, 'the frame has a size — otherwise it renders as a full-width second map');
  assert.match(styles, /\.atl-viewframe-cap\{/, 'and the caption has a style');
  assert.match(capture, /class="atl-viewframe"/, 'the ledger emits that class…');
  assert.match(capture, /class="atl-viewframe-cap"/, '…with the caption, so «Atlas looked» is auditable rather than asserted');
  assert.match(attach, /closest\('[^']*\.atl-viewframe img[^']*'\)/,
    'the lightbox delegation must name .atl-viewframe img, or tapping the frame does nothing at all');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R589 (formerly tests/r589-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  R589 — 「これなに」 must not be answered by inventing a name  (tests)
 * ----------------------------------------------------------------------------
 *  A satellite view of ロジポート名古屋 (a 355,000 m² warehouse) was answered 「名古屋市中村区の八田
 *  フランテ館です。建物内にはアスティスポーツクラブ八田が入っています。(mapion.co.jp)」 — wrong
 *  building, invented tenant, and a live anchor to a page the turn never fetched.
 *
 *  ⚠⚠⚠ EVERY CHECK BELOW EVALUATES THE FUNCTION. None of them reads the source for a spelling. The
 *  round that taught this (#R505) had a check that read a file and therefore could not see the
 *  ORDER things happened in; and #R488 had one that pinned a CSS selector's spelling and went on
 *  passing after the rule it named stopped matching anything. A grep for `toFixed(2)` would pass the
 *  moment someone wrote `.toFixed(DP)` with DP=2, which is exactly the bug it claims to prevent.
 * ==========================================================================*/
const G = makeViewGround();

/* ── ① THE COORDINATE MUST BE ABLE TO NAME THE BUILDING ─────────────────────────────────────── */

test('R589 ①: the coordinate handed to the model resolves finer than one pixel of the frame', () => {
  /* the property, stated as arithmetic rather than as a table of expected numbers: whatever
     coordDecimals returns must not be coarser than the pixel the reader is looking at. A table
     would pass forever after someone changed the tile size. */
  for (let z = 0; z <= 22; z++) {
    const degPerPixel = 360 / (256 * Math.pow(2, z));
    const written = Math.pow(10, -G.coordDecimals(z));
    if (z >= 7 && z <= 21) {
      assert.ok(written <= degPerPixel * 10,
        `zoom ${z}: writing ${G.coordDecimals(z)} decimals names ${written}°, coarser than the ${degPerPixel}° pixel it describes`);
    }
    assert.ok(G.coordDecimals(z) >= 2 && G.coordDecimals(z) <= 7, `zoom ${z}: ${G.coordDecimals(z)} decimals is outside the sane range`);
  }
});

test('R589 ①: at the zoom that produced the wrong answer, the coordinate resolves the building', () => {
  /* ⚠ THE REGRESSION ITSELF. The frame was zoom 16 at latitude 35.17. Two decimals is 0.01°, which
     is 1.11 km north-south — and the building is about 400 m across, so the coordinate named an
     area roughly eight times its footprint and could not have identified it. */
  const dp = G.coordDecimals(16);
  const metresNS = Math.pow(10, -dp) * 111320;
  assert.ok(metresNS < 400, `zoom 16 writes ${dp} decimals = ${metresNS.toFixed(0)} m; the misidentified building is ~400 m across`);
});

/* ── ② THE RANKING MUST PREFER WHAT THE FRAME CONTAINS ──────────────────────────────────────── */

const FRAME = { south: 0, west: 0, north: 1, east: 1 };
const el = (name, s, w, n, e, tags) => ({ type: 'way', id: name, tags: Object.assign({ name }, tags || {}), bounds: { minlat: s, minlon: w, maxlat: n, maxlon: e } });

test('R589 ②: a feature far larger than the view does not outrank one the view contains', () => {
  /* measured live at 東京スカイツリー: a district-heating service area spanned 1.43 frames and took
     first place on frame coverage alone. It is not what anybody framed. */
  const r = G.rankFramed([
    el('the region around it', -10, -10, 11, 11),      /* swallows the frame whole */
    el('the thing in the middle', 0.1, 0.1, 0.9, 0.9), /* 64% of the frame, entirely inside it */
  ], FRAME);
  assert.equal(r.kept[0].name, 'the thing in the middle');
});

test('R589 ②: a feature outside the frame is not reported at all', () => {
  const r = G.rankFramed([el('next valley over', 5, 5, 6, 6)], FRAME);
  assert.equal(r.total, 0, 'a feature that does not overlap the view is not in the view');
});

test('R589 ②: an unnamed footprint is never offered as an identification', () => {
  const r = G.rankFramed([{ type: 'way', id: 1, tags: { building: 'yes' }, bounds: { minlat: 0.1, minlon: 0.1, maxlat: 0.9, maxlon: 0.9 } }], FRAME);
  assert.equal(r.total, 0, 'an unnamed building cannot answer «what is this»');
});

test('R589 ②: the tags survive, so Atlas can tell a road from a building', () => {
  /* ⚠ the candidates carry their OSM tags VERBATIM and this file must not start reducing them to a
     curated «kind». The reduction is where a tag allow-list gets born, and a hand-written list of
     interesting tags silently drops whatever OSM adds next (.agents/rules/no-ad-hoc-hardcoding.md). */
  const r = G.rankFramed([el('some street', 0.1, 0.1, 0.9, 0.9, { highway: 'unclassified' })], FRAME);
  assert.equal(r.kept[0].tags.highway, 'unclassified');
});

test('R589 ②: the reported list is a head of a measured order, and says how much it dropped', () => {
  const many = [];
  for (let i = 0; i < 40; i++) many.push(el('f' + i, 0.1, 0.1, 0.1 + (i + 1) / 100, 0.1 + (i + 1) / 100));
  const r = G.rankFramed(many, FRAME, 12);
  assert.equal(r.kept.length, 12);
  assert.equal(r.dropped, 28);
  for (let i = 1; i < r.kept.length; i++) assert.ok(r.kept[i - 1].score >= r.kept[i].score, 'the head is ordered');
});

/* ── ③ THE EMPTY ANSWER IS THE ONE THAT STOPS THE INVENTION ─────────────────────────────────── */

test('R589 ③: finding nothing produces a POSITIVE statement, never an empty block', () => {
  /* ⚠⚠⚠ THIS IS THE CHECK THAT GUARDS THE ACTUAL BUG. An empty string here puts the model back
     exactly where it was: a picture, a question, and no way to tell «I was not told» from «there is
     nothing to tell». It answered from the one legible label at the edge of the frame. */
  const p = G.groundBlock({ drawn: { kept: [], dropped: 0, total: 0 }, framed: { kept: [], dropped: 0, total: 0 } });
  assert.ok(p.length > 0, 'an empty ground block is the bug');
  assert.match(p, /NO named/i, 'it has to SAY that nothing was found');
  assert.match(p, /do NOT name a building/i, 'and say what follows from that');
});

test('R589 ③: a failed lookup is never reported as «nothing is there»', () => {
  const p = G.groundBlock({ framedError: 'every Overpass mirror refused' });
  assert.match(p, /did NOT complete/i);
  assert.doesNotMatch(p, /has NO named feature/i, 'a lookup that failed did not establish an absence');
});

test('R589 ③: the block names the failure mode instead of asking for care in general', () => {
  const p = G.groundBlock({ drawn: { kept: [{ name: 'アスティスポーツクラブ', kind: 'sports' }], dropped: 0, total: 1 }, framed: { kept: [], dropped: 0, total: 0 } });
  assert.match(p, /アスティスポーツクラブ/, 'a drawn label is reported');
  assert.match(p, /tenant/i, 'the invented-tenant failure mode is named explicitly');
});

/* ── ④ AN ANCHOR IS A CLAIM THAT SOMETHING WAS FETCHED ──────────────────────────────────────── */

const { demoteUnfetchedLinks } = makeAtlasAnswerRender();

test('R589 ④: a link to a host the turn never fetched stops being a link', () => {
  const html = '<p>建物内にはアスティスポーツクラブ八田が入っています。(<a href="https://www.mapion.co.jp/x" class="atl-a" target="_blank" rel="noopener">mapion.co.jp</a>)</p>';
  const out = demoteUnfetchedLinks(html, ['gdelt.org']);
  assert.doesNotMatch(out, /<a /, 'the unearned anchor is gone');
  assert.match(out, /mapion\.co\.jp/, 'and the words the reader read are still there');
});

test('R589 ④: the sentence is never deleted — Atlas loses no capability to this rule', () => {
  /* ⚠ standing rule: Atlas gets no new limits (memory: atlas-full-authority-no-new-limits). This
     removes a false claim carried by the MARKUP, not a statement carried by the prose. */
  const html = '<p>Before <a href="https://nope.example/x">the label</a> after.</p>';
  assert.equal(demoteUnfetchedLinks(html, []), '<p>Before the label after.</p>');
});

test('R589 ④: a host the turn actually fetched keeps its link', () => {
  const html = '<a href="https://www.mapion.co.jp/x" class="atl-a">mapion.co.jp</a>';
  assert.match(demoteUnfetchedLinks(html, ['mapion.co.jp']), /<a /, 'a page IntMap really retrieved is a real citation');
  assert.match(demoteUnfetchedLinks(html, ['www.mapion.co.jp']), /<a /, 'and www. is the same host');
});

test('R589 ④: citation pills are built from the registry and are not this rule\'s business', () => {
  const html = '<a class="atl-cite" href="https://anything.example/p" target="_blank">1</a>';
  assert.equal(demoteUnfetchedLinks(html, []), html);
});

/* ── ⑤ A VIEW TOO WIDE TO HAVE A «THIS» IN IT ───────────────────────────────────────────────── */

test('R589 ⑤: a world view is not asked what single object is in it', () => {
  assert.equal(G.framedBudget({ south: -60, west: -180, north: 70, east: 180 }).ok, false);
});

test('R589 ⑤: the frame that produced the wrong answer is well inside the budget', () => {
  assert.equal(G.framedBudget({ south: 35.148, west: 136.842, north: 35.155, east: 136.8515 }).ok, true);
});

test('R589 ⑤: skipping the lookup is reported as «not looked up», never as an absence', () => {
  /* ⚠ the distinction the whole round is about. «We did not ask» and «there is nothing there» are
     different facts, and collapsing them is what let a picture be answered from imagination. */
  const p = G.groundBlock({ framedError: G.framedBudget({ south: -60, west: -180, north: 70, east: 180 }).reason });
  assert.match(p, /did NOT complete/i);
  assert.doesNotMatch(p, /has NO named feature/i);
});

/* ── ⑥ A ROUTE'S BOUNDING BOX IS NOT A FOOTPRINT ────────────────────────────────────────────── */

test('R589 ⑥: relations are asked for only where the schema says they are areas', () => {
  /* ⚠ MEASURED, not anticipated. Over the 名古屋 frame an unrestricted relation query put SIX
     名古屋市営バス routes in the top eleven, each at cover 1.00, because a route crossing the view has
     a bounding box the size of the view — and a bounding box cannot tell a line from an area.
     `type=multipolygon|boundary` is OSM's own definition of an area relation, so this asks the schema
     the question the measurement needs rather than curating a list of interesting kinds. */
  const q = G.overpassFramedQuery({ south: 0, west: 0, north: 1, east: 1 }, 25);
  assert.match(q, /relation\[name\]\[type~/, 'relations are restricted to area types');
  assert.match(q, /multipolygon\|boundary/, 'and to those two, which is what «is an area» means in OSM');
  assert.match(q, /way\[name\]\(/, 'ways are NOT restricted — a linear way is thin, so inView already ranks it down');
  assert.doesNotMatch(q, /building|landuse|amenity|aeroway/, 'no tag allow-list: the filtering is the ranking');
});

test('R589 ⑥: the bbox is written at full precision and the timeout is bounded', () => {
  const q = G.overpassFramedQuery({ south: 35.148, west: 136.842, north: 35.155, east: 136.8515 }, 9999);
  assert.match(q, /35\.148000,136\.842000,35\.155000,136\.851500/);
  assert.match(q, /\[timeout:60\]/, 'an absurd timeout is clamped rather than forwarded');
});

