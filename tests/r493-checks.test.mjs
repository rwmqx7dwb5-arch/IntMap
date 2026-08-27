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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const lines = (p) => read(p).split(/\r?\n/);
/* comments carry the reasoning and quote the very code they explain; a check that reads them is
   reading prose. Every assertion below runs on the stripped source. */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

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
const CONSOLE_SRC = codeOnly(read('js/atlas-console.js'));

/* ══ ① ONE CAPTURE, TWO CALLERS ═══════════════════════════════════════════════════════════════ */

test('R493 ①: Atlas and the screenshot button take the SAME picture, by running the same code', () => {
  const cap = read('js/atlas-view-capture.js');
  const shot = read('js/screenshot.js');
  const atlas = read('js/atlas-console.js');

  /* the module really is the capture: the WebGL-inside-a-render-tick read, the #R231 single
     coordinate system, and the overlay pass all live here */
  assert.match(cap, /events\.once\('render'/, 'the frame is read inside a render tick (preserveDrawingBuffer is OFF)');
  assert.match(cap, /cont\.clientWidth/, 'the output box comes from the container, not the backing store (#R231)');
  assert.match(cap, /html2canvas\(cont,/, 'the DOM overlay pass is here');
  assert.match(cap, /export function makeViewCapture/, 'and it has ONE door — tests/r175 ③ makes a dynamically-reached export look dead, so the three pieces are members rather than exports');
  assert.equal((cap.match(/^export /gm) || []).length, 1, 'exactly one export');

  /* …and BOTH callers reach it rather than re-implementing it. ⚠ js/screenshot.js reaches it with a
     DYNAMIC import on purpose: that file rides the eager bundle so the button is wired at boot, and
     `npm run check:perf` measured the static import putting the whole capture into every reader's
     startup for a button most of them never press (eager.modules 283 → 284). js/atlas-console.js is
     itself lazy, so its import is static. */
  assert.match(codeOnly(shot), /await import\('\.\/atlas-view-capture\.js'\)/,
    'js/screenshot.js fetches the capture when someone captures, not at boot');
  assert.match(codeOnly(atlas), /from '\.\/atlas-view-capture\.js'/,
    'js/atlas-console.js imports the shared capture');
  const shotCode = codeOnly(shot);
  assert.doesNotMatch(shotCode, /events\.once\('render'/, 'js/screenshot.js must not keep a second frame grab');
  assert.doesNotMatch(shotCode, /html2canvas\(cont/, 'js/screenshot.js must not keep a second overlay pass');
  assert.match(shotCode, /makeViewCapture\(/, '…it opens the shared door');
  assert.match(shotCode, /CAP\.captureCanvas\(/, '…and takes the shared picture through it');
  /* what stays in the button is the BUTTON's: the class across the whole operation, and the file */
  assert.match(shotCode, /classList\.add\(CAPTURE_CLASS\)/, 'the button still owns capture-mode…');
  assert.match(shotCode, /finally\{[^}]*classList\.remove\(CAPTURE_CLASS\)/,
    '…and still takes it off in `finally` (#R231: a capture that dies must not hide every control)');
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
    render: { canvas: canvas, triggerRepaint() {} },
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
  const max = +(/const MAX_IMAGES = (\d+);/.exec(read('supabase/functions/ai-proxy/index.ts')) || [])[1];
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
  const dead = () => Object.assign(GE(), { events: { once: () => {} } });   /* nothing ever fires */
  const V = makeViewCapture({ GE: dead, L: (en) => en, esc: (x) => String(x), snapshot: () => SNAP, waitIdle: async () => {} });
  const r = await V.captureFrame({ include: 'map' });
  assert.equal(r.ok, false, 'an undrawn frame must not be handed to the model');
  assert.match(r.message, /background/i, 'and the reason must be the one Atlas can act on');
  assert.equal(V.urls(), null, 'nothing was recorded…');
  assert.equal(V.promptBlock(), '', '…and nothing is described');
});

test('R493 ②e: the console binds it — frames to the vision argument, reset to the turn', () => {
  /* the three lines that make the module reachable. The transport's third argument used to be
     `null` on every atlas_turn call; this is the one place that changes. */
  assert.match(CONSOLE_SRC, /const VFRAMES=makeViewCapture\(/, 'the ledger is built once, with the app injected');
  assert.match(CONSOLE_SRC, /askAIJSONEnvelope\(_agentPrompt\(req,q\)\+_fileBlock,_sys,VFRAMES\.urls\(\)/,
    'the atlas_turn call carries the frames as IMAGES');
  assert.match(CONSOLE_SRC, /p\+=VFRAMES\.promptBlock\(\)/, 'and the prompt names them');
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
  const spellings = new Set(dispatchGroups(lines('js/atlas-console.js')).flatMap((g) => g.names));
  for (const s of ['inspect'].concat(cap.aliases || [])) {
    assert.ok(spellings.has(s), `the dispatch has no case for "${s}", which the registry promises`);
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

test('R493 ⑤: the frame shown to the reader is styled AND opens in the viewer', () => {
  /* ⚠ #R488's shape: a selector that stops matching fails SILENTLY — the tap simply does nothing.
     All three spellings are read out of the three sources, so a rename on one side cannot pass. */
  const styles = read('js/atlas-styles.js');
  const attach = codeOnly(read('js/atlas-attach.js'));
  const capture = codeOnly(read('js/atlas-view-capture.js'));
  assert.match(styles, /\.atl-viewframe\{/, 'the frame has a size — otherwise it renders as a full-width second map');
  assert.match(styles, /\.atl-viewframe-cap\{/, 'and the caption has a style');
  assert.match(capture, /class="atl-viewframe"/, 'the ledger emits that class…');
  assert.match(capture, /class="atl-viewframe-cap"/, '…with the caption, so «Atlas looked» is auditable rather than asserted');
  assert.match(attach, /closest\('[^']*\.atl-viewframe img[^']*'\)/,
    'the lightbox delegation must name .atl-viewframe img, or tapping the frame does nothing at all');
});
