/* ============================================================================
 *  IntMap · the aviation feed — which sky a view asks about, and what an answer says about its age
 * ----------------------------------------------------------------------------
 *  Consolidated from the viewport halves of tests/r401-checks.test.mjs (①–④),
 *  tests/r411-checks.test.mjs (① ① b ① c) and tests/r434-checks.test.mjs (④–⑥), and from
 *  tests/r352-checks.test.mjs (two ages, two headers; the credit follows the record). The MARK half
 *  of those rounds is tests/aircraft-mark-checks.test.mjs, with #R411's and #R434's headers.
 *  Original headers follow.
 * ==========================================================================*/
/* ============================================================================
 *  #R401 — 「地図を傾けても、航空レイヤーの飛行機アイコンが同じ向きなのを修正して。
 *           また、より低ズームでもより多くの航空機が表示されるように。」
 * ----------------------------------------------------------------------------
 *  Two reports, two root causes, and neither of them was in the place the symptom pointed at.
 *
 *  ① THE MARK'S ANGLE WAS A COMPASS BEARING HANDED TO A SCREEN-ALIGNED SPRITE. A gl.POINTS sprite
 *     is axis-aligned to the viewport, so `v_rot = a_form.y` draws every aircraft against a compass
 *     that is not on the screen any more the moment the map turns or tilts. Measured with a probe
 *     aircraft at the canvas centre (sprite box 64 px), the mark ignored PITCH, ignored BEARING and
 *     was MIRRORED as well — a track of 090° drew the nose pointing 085° west. The angle is now the
 *     difference of two projections, so the map's own matrix supplies all three answers.
 *     ⚠ The claim that the PIXELS moved is in tests/r379.spec.js, which owns the mark's rendering.
 *     Nothing here can see a shader; what a source-level check can hold is that the angle is no
 *     longer read straight out of the attribute, and that the rotation turns the way it says.
 *
 *  ② THE VIEWPORT CHANNEL WAS NOT ASKED BELOW z3.5, AND WHEN IT WAS ASKED IT READ THE WRONG SKY.
 *     Measured against production, parked over North America with the layer on for 45 s:
 *
 *         z3.2  →  ?ch=world ×3 only          4 aircraft on screen  →   4
 *         z4.2  →  ?ch=view ×4 as well        0 aircraft on screen  → 177
 *
 *     …and `tilesForBbox`, the function that decides WHICH tiles a viewport read asks for, walked
 *     its candidates from the box's SOUTH-WEST CORNER and stopped at `max × 8` of them before
 *     sorting by distance from the centre. For any view wider than about 40° the cap was reached on
 *     the first row, so the sort could only choose between tiles on the box's southern edge:
 *
 *         the whole world (centred on Tokyo)  →  four tiles at latitude −58  (the Southern Ocean)
 *         Europe at z2                        →  four tiles at latitude  26  (the Sahara)
 *         Japan  at z3                        →  four tiles at latitude  18  (the Philippine Sea)
 *
 *     A cap applied before the selection IS the selection (#R320, #R388). The candidates now fan
 *     out from the centre, so the cap can only ever discard the farthest.
 *
 *  ⚠ Every source-text check reads CODE ONLY (scripts/code-only.mjs). Twelve times now a check in
 *  this repository has matched its own prose, and this file's prose is full of the words it greps
 *  for.
 * ==========================================================================*/
/* ============================================================================
 *  R352 — three things production verification found in #R341's own code
 * ----------------------------------------------------------------------------
 *  #R341 replaced the aviation layer. Its production verification, run against the deployed site,
 *  reported the round green on every claim it made — and then found three places where the new
 *  code answered with something other than what it appeared to answer:
 *
 *   ① THE DETAIL CARD CREDITED THE WRONG PROVIDER, ON 10 CARDS OUT OF 10. #R341 moved the live
 *      feed to adsb.lol, whose data is ODbL 1.0 — a licence that REQUIRES the source to be named —
 *      and taught the hover tooltip to name it. The card kept the literal 'airplanes.live · ADS-B',
 *      which by then supplied none of the aircraft on screen. Naming the wrong source is worse
 *      than naming none: it is an attribution obligation discharged onto a third party.
 *
 *   ② snapshotFor() RETURNED GEOMETRY WITHOUT IDENTITY. The store holds the ICAO address of every
 *      aircraft in it; the public snapshot omitted it, so the verification could not ask "which
 *      aircraft are these" and fell back to firing pick() at a grid of screen points. A method
 *      that looks like it answered while answering something else is the expensive kind of bug.
 *
 *   ③ ONE HEADER CARRIED TWO MEANINGS. `x-intmap-age-ms` was the SNAPSHOT'S AGE on the world
 *      channel and the OLDEST AIRCRAFT IN THE BOX on the view channel. Measured in production:
 *      12.7-13.5 s from one, 531-564 s from the other, alternating in a single field, so neither
 *      could be read. §22.2 requires the age of the ANSWER and the age of an OBSERVATION to be
 *      distinguishable, which is precisely the distinction that field destroyed.
 *
 *  ⚠ ③ IS THE ONE THAT COMES BACK. ① and ② are single lines; the conflation is a SHAPE — any new
 *  channel added to the function can reintroduce it by passing whichever age is at hand. So ⑤
 *  below does not look for the old spelling: it enumerates every binResponse() call site and
 *  requires each to name BOTH ages. A channel that omits one cannot be written.
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANYTHING IS COUNTED (scripts/code-only.mjs, #R345) — ten times
 *  now a check in this repository has matched the prose explaining it, and this file names the
 *  identifiers it is asserting about. ⚠ AND THE FILES ARE READ THROUGH readLF (scripts/eol.mjs,
 *  #R283): js/ is CRLF in this checkout and LF in CI, and #R317 measured what that costs — a
 *  check whose pattern spans a line break is otherwise permanently red on one platform and
 *  permanently green on the other, which is the same thing as never running.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { readLF } = await import('../scripts/eol.mjs');
const { codeOnly } = await import('../scripts/code-only.mjs');
const code = (rel) => codeOnly(readLF(join(ROOT, rel)));

globalThis.window = globalThis.window || {};
await import('../js/aviation-model.js');
const M = globalThis.IntMapAviationModel || globalThis.window.IntMapAviationModel;

const FEED   = code('supabase/functions/aviation-feed/index.ts');
const DETAIL = code('js/aircraft-detail.js');
const LAYERS = code('js/data-layers.js');
const LIVE   = code('js/aviation-live.js');
const WORKER = code('src/aviation-worker.js');

/* ══════════════════════════ #R401 · the viewport asks about the middle of the view ══════════════════════════ */
/* The three views the report was measured on, as the app's own `getBounds()` reported them, plus
   the camera latitude each one was taken at. ⚠ The bbox mid-latitude is NOT the camera latitude —
   Mercator stretches away from the equator — and mistaking one for the other is half of ②. */
const VIEWS = [
  { name: 'the whole world, centred on Tokyo', bbox: [5.1, -58.2, 274.4, 81.4], camera: [139.767, 35.681] },
  { name: 'Japan at z3', bbox: [101.1, 6.6, 178.4, 57.1], camera: [139.75, 35.681] },
  { name: 'Europe at z2', bbox: [-60, 20, 80, 70], camera: [10, 51.4] },
];
const RADIUS_NM = 250;
/* one lattice row, in degrees of latitude — the resolution the answer can possibly have */
const ROW_DEG = (RADIUS_NM * 1.852 * Math.sqrt(3) * 0.96) * (Math.sqrt(3) / 2) / 111.32;

/* ── ① THE VIEWPORT READ ASKS ABOUT THE SKY IN THE MIDDLE OF THE VIEW ─────────────────────────
   This is the assertion the old implementation fails by 90 degrees of latitude. */
test('R401 ① a wide viewport asks for tiles at the centre of the view, not along its edge', () => {
  for (const v of VIEWS) {
    const [w, s, e, n] = v.bbox;
    const tiles = M.tilesForBbox(w, s, e, n, RADIUS_NM, 4, 75);
    assert.ok(tiles.length > 0, v.name + ': it asks for something');
    const [cLon, cLat] = v.camera;
    for (const t of tiles) {
      assert.ok(Math.abs(t.lat - cLat) <= ROW_DEG * 1.5,
        v.name + ': tile latitude ' + t.lat + ' is not the view centre ' + cLat +
        ' (arithmetic mid-latitude would be ' + ((s + n) / 2).toFixed(1) + ')');
    }
    /* …and in longitude too, allowing for the wrap */
    for (const t of tiles) {
      const d = Math.abs(((t.lon - cLon + 540) % 360) - 180);
      assert.ok(d <= 12, v.name + ': tile longitude ' + t.lon + ' is far from ' + cLon);
    }
  }
});

/* ── ② THE CAP MAY ONLY DISCARD THE FARTHEST ──────────────────────────────────────────────────
   The defect was not "too few tiles", it was that the truncation happened BEFORE the choice. So
   the property to hold is that asking for more tiles never changes which sky the first ones cover:
   the four a viewport read takes must be among the twelve a bigger budget would take. Under the
   old corner-first walk this is false for a wide box — a larger cap reaches further north and the
   nearest-first sort then returns an entirely different set. */
test('R401 ② asking for more tiles only ADDS sky — the first ones do not move', () => {
  const key = (t) => t.lat + '/' + t.lon;
  for (const v of VIEWS) {
    const [w, s, e, n] = v.bbox;
    const four = M.tilesForBbox(w, s, e, n, RADIUS_NM, 4, 75).map(key);
    const twelve = new Set(M.tilesForBbox(w, s, e, n, RADIUS_NM, 12, 75).map(key));
    for (const k of four) {
      assert.ok(twelve.has(k), v.name + ': ' + k + ' is dropped when the budget grows');
    }
  }
});

/* ── ③ AND THE BOUNDS #R341 MEASURED STILL HOLD ───────────────────────────────────────────────
   The fan-out is a change to WHICH tiles are asked for, never to HOW MANY. The cap, the latitude
   limit and the antimeridian are the three things a bbox-to-tiles routine gets wrong, and #R341
   pinned all three in tests/r341-checks — this re-asks them of a WIDE box, which is the case that
   never reached those assertions because the old walk never got past the first row. */
test('R401 ③ a world-sized view is still capped, clamped, wrapped and free of duplicates', () => {
  for (const max of [1, 4, 8, 12]) {
    const tiles = M.tilesForBbox(-180, -85, 180, 85, RADIUS_NM, max, 75);
    assert.ok(tiles.length > 0 && tiles.length <= max, 'cap ' + max + ' respected: ' + tiles.length);
    const seen = new Set();
    for (const t of tiles) {
      assert.ok(t.lat >= -75.001 && t.lat <= 75.001, 'clamped to the latitude limit: ' + t.lat);
      assert.ok(t.lon >= -180 && t.lon <= 180, 'longitude stays wrapped: ' + t.lon);
      assert.ok(!seen.has(t.lat + '/' + t.lon), 'no duplicate tile centre');
      seen.add(t.lat + '/' + t.lon);
    }
  }
});

/* ── ④ ZOOM NO LONGER DECIDES WHETHER THE VIEWPORT IS ASKED ABOUT ─────────────────────────────
   The floor was a `return` in pollView, not a flag anybody could see from outside — so the check
   has to read the function. It also has to make sure the floor did not come back as a constant of
   zero, which is a gate that can never fire and reads as a live rule to the next person. */
test('R401 ④ pollView asks about the viewport at every zoom', () => {
  /* spelling kept — pollView is a timer-driven browser poller inside js/aviation-live.js that needs the map and the worker; the claim is the ABSENCE of a zoom test in it */
  const src = code('js/aviation-live.js');
  const m = /async function pollView\(\)\s*\{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(m, 'pollView is still a function in js/aviation-live.js');
  const body = m[1];
  assert.doesNotMatch(body, /getZoom/, 'pollView does not consult the zoom: ' + body.trim());
  assert.doesNotMatch(src, /VIEW_ZOOM_MIN/, 'the floor is gone, not renamed');
  assert.doesNotMatch(src, /VIEW_POLL_MIN_ZOOM/, 'and it did not come back as a floor of zero');
  /* the world channel never had a floor and must not acquire one */
  const mw = /async function pollWorld\(\)\s*\{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(mw, 'pollWorld is still a function');
  assert.doesNotMatch(mw[1], /getZoom/, 'and the world channel still does not consult the zoom');
  /* zoom is still allowed to decide the SIZE of the mark — that is the LOD, and it stays */
  assert.match(src, /function sizeForZoom\(z\)/, 'zoom still decides how big an aircraft is drawn');
});
/* ══════════════════════════ #R411 · a longitude is an angle ══════════════════════════ */
/* ── ① THE BOX THE APP ACTUALLY SENDS ────────────────────────────────────────────────────────
   These four are what `map.getBounds()` returned in the running application, at the zooms named.
   Two of them are outside [−180, 180] — that is not a fault in MapLibre, it is what a bounding box
   MEANS for a camera that has gone past the seam — and the ordered comparisons could not read them.
   `meridiansKept` counts the 72 five-degree meridians the filter admits, which is the same quantity
   the aircraft themselves are subject to. */
const SEAM_VIEWS = [
  { name: 'the whole world at z1', bbox: [-180, -63.463, 180, 90], before: 72, after: 72 },
  { name: 'Japan at z3', bbox: [43.568, -15.743, 232.432, 75.347], before: 28, after: 38 },
  { name: 'North America at z3', bbox: [-197.494, -12.343, -2.506, 76.439], before: 35, after: 39 },
  { name: 'Japan at z6', bbox: [130.156, 30.863, 140.844, 38.182], before: 2, after: 2 },
];

/* what supabase/functions/aviation-feed/index.ts did before this round, kept here so the claim
   "this recovers aircraft" is a comparison and not an assertion about one number */
function orderedComparisons(lo, w, e) {
  if (e < w) { return (lo >= w || lo <= e); }
  return !(lo < w || lo > e);
}
const MERIDIANS = [];
for (let lo = -175; lo <= 180; lo += 5) MERIDIANS.push(lo);

test('R411 ① a longitude is an angle, so the view keeps the sky on both sides of the seam', () => {
  assert.equal(typeof M.lonInSpan, 'function', 'the model declares the containment test');
  for (const v of SEAM_VIEWS) {
    const [w, , e] = v.bbox;
    const before = MERIDIANS.filter((lo) => orderedComparisons(lo, w, e)).length;
    const after = MERIDIANS.filter((lo) => M.lonInSpan(lo, w, e)).length;
    assert.equal(before, v.before, v.name + ': the ordered comparisons kept ' + before + ' meridians');
    assert.equal(after, v.after, v.name + ': the angle test keeps ' + after + ' meridians');
    /* ⚠ THE POINT OF THE ROUND, AS A COMPARISON. A wide view must gain and a narrow one must not
       change — a test that only said "≥ before" would pass a function that returns true always. */
    assert.ok(after >= before, v.name + ': the fix never keeps FEWER');
  }
  const wide = SEAM_VIEWS.filter((v) => v.after > v.before);
  assert.ok(wide.length >= 2, 'and at least two of the measured views actually gained sky');
});

test('R411 ① b the seam is not a special case, and a span is not an interval', () => {
  /* a box that really does straddle the antimeridian still EXCLUDES the far side */
  assert.equal(M.lonInSpan(175, 170, -170), true, '175°E is inside 170°E … 170°W');
  assert.equal(M.lonInSpan(-175, 170, -170), true, 'and so is 175°W');
  assert.equal(M.lonInSpan(0, 170, -170), false, 'but 0°E is not — a 20° span is still 20° wide');
  /* a narrow ordinary box is unchanged */
  assert.equal(M.lonInSpan(135, 130.156, 140.844), true);
  assert.equal(M.lonInSpan(120, 130.156, 140.844), false);
  assert.equal(M.lonInSpan(-120, 130.156, 140.844), false);
  /* the unwrapped views the application reports, aircraft by aircraft rather than by meridian */
  assert.equal(M.lonInSpan(-150, 43.568, 232.432), true, 'the eastern Pacific IS inside Japan at z3');
  assert.equal(M.lonInSpan(10, 43.568, 232.432), false, '…and western Europe is not');
  assert.equal(M.lonInSpan(170, -197.494, -2.506), true, 'the western Pacific IS inside N. America at z3');
  assert.equal(M.lonInSpan(30, -197.494, -2.506), false, '…and Africa is not');
  /* a camera zoomed out past one whole turn covers the planet rather than a sliver of it */
  assert.equal(M.lonInSpan(-33, -200, 200), true, 'a span of 400° is the whole planet');
  assert.equal(M.lonInSpan(77, -180, 180), true, 'and so is exactly 360°');
  /* nothing is inside a box made of nonsense */
  assert.equal(M.lonInSpan(NaN, 0, 10), false);
  assert.equal(M.lonInSpan(5, NaN, 10), false);
});

test('R411 ① c the Edge Function asks the model, once, and no longer compares longitudes in order', () => {
  /* spelling kept — the Edge Function is Deno TypeScript whose handler needs the provider network; the predicate itself is evaluated in ① and ① b */
  const src = code('supabase/functions/aviation-feed/index.ts');
  /* ⚠ `assert.ok(!re.test(…))`, NOT assert.doesNotMatch: a failing doesNotMatch prints the whole
     subject, and this subject is a thousand lines of Edge Function (the #R390 lesson). */
  const absent = (re, msg) => assert.ok(!re.test(src), msg);

  assert.match(src, /MODEL\.lonInSpan\(rec\.lon,\s*w,\s*e\)/,
    'the viewport channel filters through the shared model');
  /* ⚠ ONE COPY. The predicate lived in two places — the first collection and the re-collection a
     stale box does after its tiles land — and fixing the one the report pointed at left the other,
     which is the path a wide view actually goes down. Counting the declaration is what stops a
     third from appearing. */
  const calls = (src.match(/MODEL\.lonInSpan\(/g) || []).length;
  assert.equal(calls, 1, 'and does so from ONE place (found ' + calls + ')');
  assert.match(src, /const collectBox = \(\) => \{/, 'the collection is one declaration');
  const collects = (src.match(/= collectBox\(\);/g) || []).length;
  assert.equal(collects, 2,
    'and BOTH users call it — the first pass and the re-collection after a stale box waits (found '
    + collects + ')');
  /* the exact shapes that were wrong, so a later round cannot reintroduce them beside the call */
  absent(/lo\s*<\s*w\s*\|\|\s*lo\s*>\s*e/, 'the ordered comparison on longitude is gone');
  absent(/if\s*\(e\s*<\s*w\)\s*\{\s*if\s*\(!\(lo\s*>=\s*w/,
    'and so is the antimeridian special case it needed');
});
/* ══════════════════════════ #R434 · the ledger and the burst budget ══════════════════════════ */
/* ── ④ THE LEDGER RECORDS THE ASK, NOT THE CATCH ─────────────────────────────────────────────
   Two thirds of the planet is ocean without receiver coverage. A tile that answered "nothing here"
   thirty seconds ago is not the same as one nobody has ever looked at, and a ledger that only
   remembered aircraft could never tell them apart — so a wide view would spend its whole budget on
   the same empty water for ever. */
test('R434 ④ every completed tile read stamps the sky it asked about, wherever it came from', () => {
  /* spelling kept — the ledger lives in the Deno Edge Function's request path; askCell is lifted and evaluated below, the one-door rule is read */
  assert.match(FEED, /markAsked\(tiles\[i\]\.lat, tiles\[i\]\.lon, at\);/,
    'readSerial stamps each tile it actually read');
  /* ⚠ THE WRITERS ARE NAMED BY COUNTING THE DOOR, NOT THE CALLERS (#R504 widened this). Upstream
     reads reach the ledger through readSerial — the ONE place both the viewport channel and the
     lattice sweep go through, so a ledger only one of them wrote would lie about half the sky (the
     #R411 ① c shape); hydration seeds it from the shared snapshot (#R434 addendum); and #R504's
     persisted ledger restores it from Storage. Three writers, and the cap and the latest-wins rule
     have to hold for all of them — so what is counted is the single assignment they must all go
     through. A fourth writer that does its own STATE.asked.set() is what this forbids. */
  const doors = (FEED.match(/STATE\.asked\.set\(/g) || []).length;
  assert.equal(doors, 1, 'the ledger has exactly one assignment, in stampCell (found ' + doors + ')');
  assert.match(FEED, /function markAsked\(lat, lon, at\) \{[\s\S]*?stampCell\(askCell\(lat, lon\), at\);/,
    'markAsked is the lat/lon door onto it');
  const serials = (FEED.match(/await readSerial\(/g) || []).length;
  assert.equal(serials, 2, 'and both upstream readers go through readSerial (found ' + serials + ')');
  /* the stamp is inside the loop and AFTER the rate-limit check, because a 429 taught us nothing */
  const rs = /async function readSerial\(provider, tiles\) \{([\s\S]*?)\n\}/.exec(FEED);
  assert.ok(rs, 'readSerial is still one function');
  assert.ok(rs[1].indexOf('RATE_LIMITED') < rs[1].indexOf('markAsked'),
    'a refused read does not count as having looked');

  /* the cell grain, evaluated from the shipped expression */
  const m = /const askCell = \(lat, lon\) =>\s*([\s\S]*?);\n/.exec(FEED);
  assert.ok(m, 'askCell is one expression');
  const deg = +(/const ASK_CELL_DEG = (\d+);/.exec(FEED) || [])[1];
  assert.equal(deg, 2, 'the ledger\'s grain is 2° — about half a 250 nm tile');
  // eslint-disable-next-line no-new-func
  const askCell = new Function('ASK_CELL_DEG', 'lat', 'lon', 'return ' + m[1] + ';').bind(null, deg);
  assert.equal(askCell(35.0, 139.0), askCell(35.6, 139.6), 'sky within one cell is one entry');
  assert.notEqual(askCell(35.0, 139.0), askCell(38.0, 139.0), 'three degrees north is different sky');
  assert.equal(askCell(0, 180), askCell(0, -180), 'and the antimeridian is not a seam');
});

/* ── ④ b …AND A COLD ISOLATE INHERITS IT FROM THE SNAPSHOT ──────────────────────────────────
   Supabase hands out cold isolates often enough that the function treats isolate memory as not a
   cache at all (the snapshot exists for exactly that reason). An empty ledger makes a cold isolate
   decide the view centre is the stalest sky on the planet and spend its one read there, whatever
   the shared snapshot already holds — measured in production immediately after this round
   deployed, three consecutive polls of one wide view were answered by three isolates reporting
   askedCells 3, 0 and 0. An aircraft observed in a cell at time T is proof somebody asked about
   that cell at least at T, so hydration can seed the ledger with no new state and no new format. */
test('R434 ④ b the hydrated snapshot seeds the ledger, so a cold isolate does not restart the walk', () => {
  /* spelling kept — hydrate()/stampCell() run inside the Deno Edge Function against its snapshot store; the latest-wins rule is read from their bodies */
  const hyd = /function hydrate\(msg\) \{([\s\S]*?)\n\}/.exec(FEED);
  assert.ok(hyd, 'hydrate is still one function');
  assert.match(hyd[1], /markAsked\(msg\.lat\[i\], msg\.lon\[i\], seenAt\);/,
    'every hydrated aircraft stamps the sky it was seen in, at the time it was seen');
  /* ⚠ THE LATEST WINS. Hydration arrives out of order — fifty aircraft in one cell carry fifty
     observation times — so an unconditional set would leave the OLDEST of them in the ledger and
     make well-covered sky look stale. */
  /* (#R504) the rule is unchanged; it moved one function inwards so all three writers obey it. */
  const mk = /function stampCell\(key, at\) \{([\s\S]*?)\n\}/.exec(FEED);
  assert.ok(mk, 'stampCell is the one place the ledger is written');
  assert.match(mk[1], /if \(at > prev\) STATE\.asked\.set\(key, at\);/, 'the latest stamp wins');
  assert.ok(!/^\s*STATE\.asked\.set\(askCell\(lat, lon\), at\);/m.test(mk[1]),
    'and the unconditional write is gone');
  assert.match(mk[1], /if \(STATE\.asked\.size >= ASK_MAX\) STATE\.asked\.clear\(\);/,
    'the cap is inside the one door, so no writer can miss it');
  const mk2 = /function markAsked\(lat, lon, at\) \{([\s\S]*?)\n\}/.exec(FEED);
  assert.ok(mk2, 'markAsked is still one function');
  assert.match(mk2[1], /if \(!\(at > 0\) \|\| lat == null \|\| lon == null\) return;/,
    'a record with no position and no time stamps nothing');
});

/* ── ⑤ A WIDE VIEW WALKS ACROSS ITSELF INSTEAD OF RE-READING ITS MIDDLE ──────────────────────
   The simulation below is the real `tilesForBbox` and the real ranking, lifted out of the shipped
   file, over the bbox the application really reports for Japan at z3 (#R411 ① in this file
   measured that box in the running app). What it counts is patches of sky bought per ten polls. */
test('R434 ⑤ ten polls of the same wide view buy twenty-four patches of sky, not four', async () => {
  globalThis.window = globalThis.window || {};
  await import('../js/aviation-model.js');
  const M = globalThis.IntMapAviationModel || globalThis.window.IntMapAviationModel;

  const num = (name) => {
    const m = new RegExp('const ' + name + ' = (\\d+);').exec(FEED);
    assert.ok(m, name + ' is a named constant');
    return +m[1];
  };
  const MAX = num('VIEW_MAX_TILES'), FAN = num('VIEW_FAN'), DEG = num('ASK_CELL_DEG');
  const RADIUS = num('RADIUS_NM'), LAT = num('LAT_LIMIT');
  assert.equal(MAX, 4, 'the per-read budget is unchanged — the provider\'s is');

  const rank = /const ranked = cands\n([\s\S]*?);\n/.exec(FEED);
  assert.ok(rank, 'the ranking is one expression');
  // eslint-disable-next-line no-new-func
  const rankFn = new Function('cands', 'askedAt', 'VIEW_MAX_TILES',
    'const ranked = cands' + rank[1] + '; return ranked;');

  const cell = (t) => Math.round(t.lat / DEG) * 1000 + Math.round((((t.lon + 540) % 360) - 180) / DEG);
  const BOX = [43.568, -15.743, 232.432, 75.347];   /* Japan at z3, as the app reports it */

  /* what #R341 did: the same `max` tiles, nearest the centre, every time */
  const before = new Set();
  for (let poll = 0; poll < 10; poll++) {
    for (const t of M.tilesForBbox(...BOX, RADIUS, MAX, LAT)) before.add(cell(t));
  }
  /* what it does now: rank a wider fan by when that sky was last asked about */
  const ledger = new Map();
  const after = new Set();
  for (let poll = 0; poll < 10; poll++) {
    const cands = M.tilesForBbox(...BOX, RADIUS, MAX * FAN, LAT);
    const picked = rankFn(cands, (la, lo) => ledger.get(cell({ lat: la, lon: lo })) || 0, MAX);
    assert.equal(picked.length, MAX, 'a poll still spends exactly ' + MAX + ' tiles');
    for (const r of picked) { after.add(cell(r.t)); ledger.set(cell(r.t), poll + 1); }
  }
  assert.equal(before.size, MAX, 'ten polls used to buy the same ' + MAX + ' patches (' + before.size + ')');
  assert.equal(after.size, MAX * FAN, 'and now buy ' + MAX * FAN + ' (' + after.size + ')');
  /* ⚠ THE FIRST POLL IS UNCHANGED, which is what makes this a widening and not a different answer:
     an empty ledger leaves the sort on the tie-break, and the tie-break is tilesForBbox's own
     centre-out order. A narrow view — one that has only `max` candidates — never moves at all. */
  const first = rankFn(M.tilesForBbox(...BOX, RADIUS, MAX * FAN, LAT), () => 0, MAX);
  const centre = M.tilesForBbox(...BOX, RADIUS, MAX, LAT);
  assert.deepEqual(first.map((r) => cell(r.t)), centre.map(cell),
    'a cold ledger still reads the middle of the view first');
});

/* ── ⑥ THE READ IS NOT STARTED UNLESS IT IS WANTED ───────────────────────────────────────────
   `once()` hands back a RUNNING promise, not a thunk. #R341 built it above the branch and let
   `boxStale` decide only whether the caller waited — so four upstream reads went out on every
   request that missed the 15 s cache, which is three times the whole measured burst budget and
   therefore a 429 and RATE_BACKOFF_MS of silence for every channel at once. */
test('R434 ⑥ the viewport spends the burst budget once per VIEW_STALE_S, for the whole function', () => {
  /* spelling kept — the view channel's branch is Deno request-handler code around once() and the token bucket; the ranking it feeds is evaluated in ⑤ */
  assert.match(FEED, /function once\(key, make\) \{\s*const running = STATE\.inflight\.get\(key\);/,
    'once() is still the single-flight, and still starts what it is handed');
  const view = /if \(channel === "view"\) \{([\s\S]*?)\n {4}\}\n/.exec(FEED);
  assert.ok(view, 'the viewport channel is still one block');
  const body = view[1];
  /* ⚠ (#R504) THE CONDITION KEPT ITS JOB AND CHANGED ITS NAME. `spaced` asked "has the whole
     function waited VIEW_STALE_S?"; that was a fact about the PROVIDER wearing a constant named
     after the sky, and it was measured at a fifth of what the provider grants. It is now a token
     taken from the one bucket — still global, still synchronous, still decided before anything
     awaits, and now it also says HOW MANY tiles may go. */
  const gate = body.indexOf('if (grant > 0) {');
  assert.ok(gate > 0, 'the decision is one condition');
  assert.ok(body.indexOf('await once(key,') > gate,
    'and the read is built INSIDE it, not above it');
  assert.ok(!/const work = once\(/.test(body), 'nothing holds a started read outside the branch');

  /* the ceiling is the function's, not the bbox's: the budget belongs to one address */
  assert.match(body, /const grant = worthIt \? takeTokens\(ranked\.length, now\) : 0;/,
    'the ceiling is global, and it is the same bucket the lattice sweep draws from');
  assert.ok(!/const spaced = /.test(FEED),
    'the old per-45-s spacing is gone — see tests/r504-checks.test.mjs ④');
  assert.match(body, /const spent = ranked\.slice\(0, grant\);/,
    'and the read is over what was granted, not over what was ranked');
  assert.match(body, /STATE\.viewReadAt = now;\n\s*await once\(/,
    '…and is stamped BEFORE the await, so two callers in one tick cannot both pass');
  assert.match(body, /const worthIt = ranked\.length > 0 && \(now - stalest\) \/ 1000 > VIEW_STALE_S;/,
    'and the read has to be worth something: the stalest chosen tile is actually stale');
  /* ⚠ WHAT IS GONE, NAMED SO IT CANNOT COME BACK. Deciding by the freshest aircraft ANYWHERE in the
     box is what made a view containing Europe never read and a view over open ocean read on every
     cache miss. */
  assert.ok(!/const boxStale =/.test(FEED), 'the box-wide freshness gate is gone');
  assert.ok(!/!inBox\.length \|\|/.test(FEED), '…and so is "an empty box is always worth four reads"');
});
/* ══════════════════════════ #R352 · two ages, two headers ══════════════════════════ */
test('R352 ① the detail card renders the source line it was GIVEN, not a provider literal', () => {
  /* spelling kept — the detail card is DOM built inside js/aircraft-detail.js for a live record; what is pinned is that the record's own line reaches it */
  /* The whole expression that builds the credit line, from the class name to the end of the
     statement. Whatever it is, the record's own value has to reach it. */
  const m = /acp-src[\s\S]{0,400}?;/.exec(DETAIL);
  assert.ok(m, '.acp-src is no longer built where this check expects it');
  const expr = m[0];

  assert.match(expr, /_srcLine/,
    'the card must render the source the record carries — this line was the literal that credited '
    + 'airplanes.live for adsb.lol data on every card production served');

  /* A provider name may still appear, but only BEHIND the record's value: the v1 rollback path
     (?aviation=v1) builds records with no _srcLine and really did use that provider. So the
     literal is required to sit on the right-hand side of a fallback, never on its own. */
  const literals = expr.match(/'[^']*(?:airplanes\.live|adsb\.lol|opensky)[^']*'/gi) || [];
  for (const lit of literals) {
    const at = expr.indexOf(lit);
    const before = expr.slice(Math.max(0, at - 40), at);
    assert.match(before, /_srcLine\s*\|\|\s*$/,
      `provider literal ${lit} is printed unconditionally; it must be the fallback after `
      + '`p._srcLine||`, otherwise a change of provider leaves this line crediting the old one');
  }
});

test('R352 ② the record the card is opened with carries that source line', () => {
  /* spelling kept — _av2Plane is inside js/data-layers.js's map-host closure, which cannot run in Node */
  /* ① is only true if something sets _srcLine. The v2 path builds its records in _av2Plane(). */
  const m = /function _av2Plane\([\s\S]*?\n    \}/.exec(LAYERS);
  assert.ok(m, '_av2Plane is no longer shaped the way this check reads it');
  assert.match(m[0], /_srcLine\s*:\s*_planeSourceLine\(\)/,
    '_av2Plane must carry the same line the tooltip shows; without it the card falls through to '
    + 'the literal and ① is satisfied by a value nobody supplies');
});

test('R352 ③ snapshotFor() returns identity, not only geometry', () => {
  /* spelling kept — snapshotFor reads the live worker store in js/aviation-live.js; the claim is that identity is in its return shape */
  const m = /function snapshotFor\([\s\S]*?\n  \}/.exec(LIVE);
  assert.ok(m, 'snapshotFor is no longer shaped the way this check reads it');
  assert.match(m[0], /hex\s*:\s*hexOf\(/,
    'snapshotFor must name the aircraft it describes — production verification asked it for '
    + 'identities, got four geometry fields, and had to pick() a screen grid instead');
});

test('R352 ④ the two ages are two headers, and both are readable cross-origin', () => {
  /* spelling kept — the header set is declared by the Deno Edge Function; ⑨ runs binResponse for the values */
  assert.match(FEED, /"x-intmap-age-ms":/,    'the answer age header is gone');
  assert.match(FEED, /"x-intmap-oldest-ms":/, 'the observation age needs a header of its own');

  /* ⚠ #R341 measured what a missing entry here costs: the browser reads null for every custom
     header, with no error and no warning, and the ODbL attribution simply never appears. */
  const exp = /Access-Control-Expose-Headers"\s*:\s*((?:\s*"[^"]*"\s*\+?)+)/.exec(FEED);
  assert.ok(exp, 'Access-Control-Expose-Headers is no longer declared as a concatenation');
  const exposed = exp[1].replace(/["+\s]/g, ' ');
  for (const h of ['x-intmap-age-ms', 'x-intmap-oldest-ms']) {
    assert.ok(exposed.includes(h), `${h} is set but not exposed — JS would read null for it`);
  }
});

test('R352 ⑤ EVERY channel names both ages — the conflation cannot be reintroduced', () => {
  /* spelling kept — every call site is enumerated from the Deno source so that a future channel is included by existing; ⑨ runs the function */
  /* Enumerate the call sites by walking the parentheses, so a channel added later is included by
     existing rather than by matching a spelling this check happened to anticipate. */
  const sites = [];
  for (let i = FEED.indexOf('binResponse('); i >= 0; i = FEED.indexOf('binResponse(', i + 1)) {
    if (/[\w.]/.test(FEED[i - 1] || '')) continue;
    if (/function\s+$/.test(FEED.slice(Math.max(0, i - 12), i))) continue;
    let depth = 0, j = i + 'binResponse'.length;
    for (; j < FEED.length; j++) {
      const c = FEED[j];
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (!depth) break; }
    }
    sites.push(FEED.slice(i, j + 1));
  }

  assert.ok(sites.length >= 3,
    `expected every channel to answer through binResponse; found ${sites.length} call sites`);

  for (const site of sites) {
    const ch = (/channel:\s*"([^"]+)"/.exec(site) || [, '(unnamed)'])[1];
    assert.match(site, /\bageMs\s*:/,    `the ${ch} channel does not say how old its ANSWER is`);
    assert.match(site, /\boldestMs\s*:/, `the ${ch} channel does not say how old its OLDEST OBSERVATION is — `
      + 'that omission is exactly how one field came to carry both meanings');
  }

  /* The specific defect, named so it cannot come back by its original spelling either: the view
     channel passed the oldest aircraft in the box as the age of the answer. */
  assert.doesNotMatch(FEED, /ageMs\s*:\s*oldest\b/,
    'ageMs is being handed the oldest OBSERVATION again — that is the #R341 defect verbatim');
});

test('R352 ⑥ the oldest-observation age costs nothing per request', () => {
  /* spelling kept — the world channel is Deno request-handler code; the claim is where noteOldest() is called */
  /* The world channel serves the SAME cached bytes to everyone, so re-deriving this by walking up
     to 50,000 records on each request would buy nothing. It is recorded where the set is already
     being walked. */
  const start = FEED.indexOf('const force = url.searchParams');
  assert.ok(start > 0, 'the world channel is no longer spelled this way');
  const end = FEED.indexOf('channel: "world"', start);
  assert.ok(end > start, 'the world channel no longer names itself in its response');
  const handler = FEED.slice(start, end);
  assert.doesNotMatch(handler, /for\s*\([^)]*STATE\.world\.values\(\)/,
    'the world request path walks the whole set again; noteOldest() already records this where the '
    + 'set changes (build, hydrate, prune)');
  assert.match(FEED, /function noteOldest\(\)/, 'noteOldest is what makes ⑥ true');
  /* …and it has to actually be called from the places that change the set, or the field freezes. */
  const calls = (FEED.match(/\bnoteOldest\(\)/g) || []).length;
  assert.ok(calls >= 3, `noteOldest is called ${calls} times; the set changes in more places than that`);
});

test('R352 ⑦ the worker keeps the two ages apart all the way to stats()', () => {
  /* spelling kept — src/aviation-worker.js is a Web Worker and js/aviation-live.js its browser client; the header reads and stats() shape are pinned */
  assert.match(WORKER, /x-intmap-age-ms/,    'the worker stopped reading the answer age');
  assert.match(WORKER, /x-intmap-oldest-ms/, 'the worker never reads the observation age');
  /* Two headers read into one field would be the same defect one layer down. */
  assert.doesNotMatch(WORKER, /S\.ageMs\s*=\s*Number\(r\.headers\.get\('x-intmap-oldest-ms'\)\)/,
    'the observation age is being stored as the answer age');

  for (const [src, name] of [[WORKER, 'src/aviation-worker.js'], [LIVE, 'js/aviation-live.js']]) {
    assert.match(src, /oldestObservationMs/, `${name} drops the observation age before anyone can read it`);
  }
  const st = /aircraftReceived[\s\S]{0,1200}/.exec(LIVE);
  assert.ok(st, 'stats() is no longer shaped the way this check reads it');
  assert.match(st[0], /serverAgeMs\s*:/,          'stats() no longer reports the answer age');
  assert.match(st[0], /oldestObservationMs\s*:/,  'stats() reports one age again — the two are not the same fact');
});

test('R352 ⑧ the codec and model mirrors are still byte-identical', async () => {
  /* The Edge Function imports its copies from supabase/functions/_shared/. A change to one side of
     a mirror that does not reach the other is a server decoding a wire format the browser no
     longer writes. */
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, ['scripts/sync-aviation.mjs', '--check'], { encoding: 'utf8', cwd: ROOT });
  assert.match(out, /in sync/, out);
});

test('R352 ⑨ the SHIPPING binResponse, actually run, emits two independent ages', () => {
  /* ⚠ SOURCE-LEVEL CHECKS ABOVE PROVE THE SPELLING; THIS ONE PROVES THE VALUES. #R317 measured
     what the difference is worth: a check that reads a function is satisfied by a function that
     is never reached, and #R341's whole diagnosis turned on a header whose VALUE — one em dash —
     made Deno throw. So the two helpers are lifted out of the deployed file and executed here
     against the platform's own Response, exactly as Deno would construct it. */
  const pick = (name) => {
    const at = FEED.indexOf('function ' + name + '(');
    assert.ok(at >= 0, name + ' is gone from the Edge Function');
    let depth = 0, i = FEED.indexOf('{', at);
    for (let j = i; j < FEED.length; j++) {
      if (FEED[j] === '{') depth++;
      else if (FEED[j] === '}') { depth--; if (!depth) return FEED.slice(at, j + 1); }
    }
    throw new Error(name + ' does not close');
  };

  const make = new Function(
    'CORS', 'ATTRIBUTION', 'STATE',
    pick('hdr') + '\n' + pick('binResponse') + '\nreturn binResponse;',
  );
  const binResponse = make({ 'access-control-allow-origin': '*' }, { adsblol: 'adsb.lol - ODbL 1.0' }, { saveNote: '' });

  /* The two facts the production measurement found fused: a FRESH answer that happens to contain
     an OLD observation. If one field carried both, one of these numbers would be missing. */
  const r = binResponse(new Uint8Array(8), {
    provider: 'adsblol', count: 12, ageMs: 350, oldestMs: 540_000,
    seq: 7, channel: 'view', ttlMs: 15000, coverage: 'partial',
  });
  assert.equal(r.headers.get('x-intmap-age-ms'), '350',
    'the age of the ANSWER is not what was passed as the age of the answer');
  assert.equal(r.headers.get('x-intmap-oldest-ms'), '540000',
    'the age of the OLDEST OBSERVATION is not reported');
  assert.notEqual(r.headers.get('x-intmap-age-ms'), r.headers.get('x-intmap-oldest-ms'),
    'both headers carry the same number for inputs 350 ms apart from 540 s — they are fused again');

  /* Infinity is what `now - 0` gives before the first refresh, and String(Infinity) is a header
     value no client can parse. Both fields have to survive it as numbers. */
  const cold = binResponse(new Uint8Array(0), {
    provider: 'adsblol', count: 0, ageMs: Infinity, oldestMs: Infinity,
    seq: 0, channel: 'world', ttlMs: 30000, coverage: '',
  });
  for (const h of ['x-intmap-age-ms', 'x-intmap-oldest-ms']) {
    assert.ok(Number.isFinite(Number(cold.headers.get(h))), h + ' is not a number a client can parse');
  }
});
