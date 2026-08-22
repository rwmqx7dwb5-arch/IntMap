/* ============================================================================
 *  IntMap · #R298 — source-level checks
 * ----------------------------------------------------------------------------
 *  Everything below pins a RELATION that a report named, not a number a round happened to pick.
 *
 *    · 「日本と日本以外で、発表無しポリゴンの色を変えるのを辞めろ」
 *      「発表無しポリゴンだけ不透明度選択の対象外なのを辞めろ」
 *      「発表無しポリゴンの上に発表ありポリゴンを重ねる形式を今すぐ辞めろ」
 *      — three reports, ONE structure. 「発表なし」 had two implementations: Japan's went through
 *      `quietFeature()` into `wp-alert` (colour `NONE_COL`, opacity = the reader's slider) and
 *      everyone else's went into a SECOND source `wp-alert-quiet-src` and a SECOND layer
 *      `wp-alert-quiet` (colour rgba(220,220,224,0.42), fill-opacity 1 — outside the slider),
 *      placed UNDER `wp-alert-fill` and carrying EVERY unit of the country, warned ones included.
 *      The two sources also had different `tolerance` (1.2 and 2.5), so the same administrative
 *      border was simplified two ways and the edges did not meet.
 *    · 「ズームレベルが遠いとポリゴンがガビガビになる。境界線解像度が低すぎる」 — one collection, one
 *      simplification (the renderer's default), and the bundled 0.01° world index is left one zoom
 *      earlier for the country's own published boundaries.
 *    · 「更新が遅すぎる。リアルタイムにと言っている」 (5回目) — tick 20 s → 10 s, the rotation floor
 *      25 s → 15 s, the relay's edge cache 30 s → 15 s. And the panel printed 「30秒ごと」 while
 *      `TICK_MS` was 20,000: a number written down beside a constant goes stale, so it is computed.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const WP = () => read('js/world-packs.js');
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that twenty-two times; the answer is to ask the question of the text
   that RUNS. String literals are kept, because a layer id IS a string literal. */
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
/* …and this module holds a dozen packs; the alerts one is the subject here. */
const alertsModule = (src) => {
  const a = src.indexOf('(function alerts()'), b = src.indexOf('window.__wpAlerts=', a);
  if (!(a > 0 && b > a)) throw new Error('the alerts module could not be delimited');
  return src.slice(a, b);
};

/* ── ① 「発表なし」 has exactly one implementation ─────────────────────────────────────────── */
test('R298 ① 「発表なし」 is one collection, one colour, one opacity — for every country', () => {
  const s = WP();
  const code = noComments(s);
  /* the second source and its two layers are gone, name and all */
  assert.ok(!/wp-alert-quiet/.test(code), 'no second quiet source or layer');
  assert.ok(!/\bQFILL\b|\bQLINE\b|\bQSRC\b/.test(code), 'and no leftover handles for them');
  /* the producer is not country-specific */
  assert.match(s, /function quietFeature\(iso,feed,geometry,unit,name\)\{/);
  assert.ok(!/quietFeature\('[A-Z]{3}'/.test(code),
    'no country has a quiet path of its own — a literal ISO here was why Japan looked different');
  assert.match(s, /colA:NONE_COL, colN:NONE_COL/, 'one grey, in both palettes');
  /* it rides in the SAME collection as the warnings, and the warnings come after it */
  assert.match(s, /quietFeatures\(\)\.concat\(feats\)/,
    'array order is draw order: quiet first, the answer after');
  /* …and therefore the opacity control reaches it, because it is the same layer */
  /* ⚠ (#R308) …asked as a RELATION rather than as that array's spelling: the point is that the
     control reaches the fill the quiet units are drawn by and their dividing outline, not that the
     list has exactly four members (it gained a fifth when the hatch got a second surface). */
  const pl = /legendId:'wpalerts', layers:\(\)=>\[([^\]]*)\]/.exec(s);
  assert.ok(pl, 'the panel declares the layers the opacity control owns');
  ["'wp-alert-fill'", "'wp-alert-line'", 'CHORO', 'HATCH'].forEach((k) =>
    assert.ok(pl[1].split(',').includes(k), k + ' is owned by the slider'));
  const at = s.indexOf("id:'wp-alert-fill'");
  assert.ok(at > 0);
  assert.match(s.slice(at, at + 260), /'fill-opacity':OPACITY_DEFAULT/,
    'and that fill has a plain opacity for the slider to write');
});

/* ── ② a warned unit does not also get a grey underneath it ──────────────────────────────── */
test('R298 ② the grey is only where there is no warning', () => {
  const s = WP();
  /* ⚠⚠ (#R305) THE ANSWER GREW A THIRD VALUE. 「skip the warned unit」 and 「emit the quiet one」
     were the only two, so a warning SMALLER than the unit threw away the whole unit's grey — and
     with it the part of that unit where nothing is in force (measured: 20.3 % of Switzerland
     unpainted). The third answer is 「emit it with the warning cut out of it」. What #R298 pinned —
     grey and colour never share a pixel — is unchanged and is why the cut has to be exact. */
  assert.match(s, /const qg=quietGeomFor\(iso,g\);\s+if\(!qg\) return;/,
    'the quiet emitter asks what is true of this unit, and skips it when nothing is');
  const i = s.indexOf('function warnMeeting(iso,g){');
  assert.ok(i > 0, 'warnMeeting must exist');
  const body = s.slice(i, i + 1400);
  /* the test is the unit's own centre, not object identity — an agency that files its own polygon
     (the DWD, the NWS, MET Norway, a CAP polygon) never touches the unit index, so === cannot see it */
  /* ⚠ (#R306) …and the point it asks WITH has to be a point OF the unit. `geomCentre` is the
     average vertex of the largest ring, which for a concave or many-part subject lands outside its
     own outline — measured, that is how Russia lost 83 land samples' worth of quiet units to
     warnings that were in the NEIGHBOUR. `geomInside` scans a line across the middle and takes the
     midpoint of the widest interior span, and it is verified against the geometry before use. */
  assert.match(body, /geomInside\(g\)/);
  assert.match(body, /inGeom\(c,bin\[i\]\)/);
  assert.match(s, /function inGeom\(pt,g\)\{/, 'point-in-polygon, holes included');
  assert.match(s, /for\(let i=1;i<rings\.length;i\+\+\) if\(ptInRing\(pt,rings\[i\]\)\) return false;/,
    'a hole is not the inside');
  /* and it is bounded: only the countries whose units are actually being drawn are indexed */
  const wi = s.slice(s.indexOf('function warnIndex(){'), s.indexOf('function sameOutline'));
  assert.match(wi, /if\(!quietSet\[q\.iso\]\) return;/,
    'a country nobody is drawing grey for costs nothing');
  assert.match(wi, /_warnIdxOf===feats&&_warnIdxSet===setSig/,
    'and the index is rebuilt when either the warnings or the drawn set changes');
});

/* ── ③ the unit's name travels with the unit's shape ─────────────────────────────────────── */
test('R298 ③ a quiet unit can still say its own name', () => {
  const s = WP();
  assert.match(s, /function named\(g,nm\)\{/, 'the name is attached to the shape');
  assert.match(s, /_stash\(g,'__nm',String\(nm\)\)/);
  /* ⚠ (#R305) the GEOMETRY may now be the unit with the warned part cut out of it (`punchQuiet`),
     and the NAME still comes off the unit the cut was made from — which is the point of this test. */
  assert.match(s, /quietFeature\(iso,feed,qg,'unit',g\.__nm\|\|''\)/, 'and the feature carries it');
  /* every producer that HAS a name passes one — a shape with no name is a fact, not a bug */
  const ask = s.slice(s.indexOf('function askUnits(iso){'), s.indexOf('function askUnitsWorld(iso){'));
  ['jpMuniGeo', 'cnGeo', 'twTownGeo', 'nutsGeo', 'adm1Geo'].forEach(fn =>
    assert.ok(new RegExp(fn + '\\(\\)[\\s\\S]{0,600}named\\(').test(ask), fn + ' names its units'));
  /* the note must survive the worker boundary: it is NOT enumerable, so the structured clone
     the tiler receives does not carry it */
  assert.match(s, /Object\.defineProperty\(o,k,\{value:v,enumerable:false,configurable:true\}\)/,
    'the stash is invisible to the clone the tiler gets');
});

/* ── ④ one collection, one simplification ────────────────────────────────────────────────── */
test('R298 ④ the warning source is simplified once, at the renderer default', () => {
  const s = WP();
  const m = s.match(/addSource\(SRC,\{type:'geojson',tolerance:([\d.]+),buffer:(\d+)/);
  assert.ok(m, 'the source declares its tolerance');
  assert.equal(m[1], '0.375', 'the renderer’s own default — about a twentieth of a pixel per zoom');
  /* ⚠ (#R308) THE RULE IS ABOUT THE WARNINGS AND THE 「発表なし」 UNITS, which must be ONE collection
     at ONE tolerance — that is what 「日本と日本以外で色を変えるな」 came down to. It was written as
     「exactly one geojson source in this module」, which is a different sentence, and #R308's hatch cut
     (a source that carries no warning and no quiet unit — only the ground the hatch may still claim)
     turned it red. Asked as the rule: every collection of alert FEATURES goes to that one source. */
  const code = alertsModule(noComments(s));
  const adds = (code.match(/addSource\(([A-Z_]+),\{type:'geojson'/g) || [])
    .map((x) => /addSource\(([A-Z_]+),/.exec(x)[1]);
  assert.ok(adds.includes('SRC'), 'the warnings and the quiet units have their source');
  const feeds = [...new Set((code.match(/setSourceData\(([A-Z_]+),\{type:'FeatureCollection'/g) || [])
    .map((x) => /setSourceData\(([A-Z_]+),/.exec(x)[1]))];
  assert.deepEqual(feeds, ['SRC'],
    'every collection of alert features goes to that one source, got ' + feeds.join(','));
});

/* ── ⑤ the boundaries a reader sees are the country's own, one zoom earlier ──────────────── */
test('R298 ⑤ the bundled world index is left earlier', () => {
  const s = WP();
  const m = s.match(/const UNIT_HIRES_Z=(\d+);/);
  assert.ok(m, 'the constant exists');
  assert.ok(+m[1] <= 4, 'the upgrade happens at z4 or lower, got z' + m[1]);
  /* the floor it upgrades FROM is still the shipped index — the point is WHEN it is left, not that
     the file got finer (#R297 measured that a finer bundle only costs re-tiling) */
  assert.match(s, /const ADM1_URL='data\/admin1-world\.json\.gz';/);
});

/* ── ⑥ 「リアルタイム」 is the same number in three places, and it is computed once ────────── */
test('R298 ⑥ the refresh cadence agrees with itself, top to bottom', () => {
  const s = WP();
  const tick = +(/const TICK_MS=(\d+);/.exec(s) || [])[1];
  const floor = +(/const MIN_AGE_MS=(\d+);/.exec(s) || [])[1];
  const relay = read('supabase/functions/alerts-relay/index.ts');
  const edge = +(/const CACHE = "public, max-age=(\d+), s-maxage=\1,/.exec(relay) || [])[1];
  assert.ok(tick > 0 && floor > 0 && edge > 0, 'all three are declared');
  assert.ok(tick <= 10000, 'the tick is at most ten seconds, got ' + tick);
  assert.ok(floor >= edge * 1000,
    'the rotation floor is not shorter than the edge cache (asking sooner returns the same bytes)');
  assert.ok(floor <= edge * 1500, 'and not needlessly longer than it, got ' + floor + ' vs ' + (edge * 1000));
  /* the panel PRINTS this, and printing a literal is how it came to say 30 s while TICK_MS was 20,000 */
  assert.ok(!/every 30 s/.test(noComments(s)), 'no hand-written interval is left in the panel');
  assert.match(s, /L\('every \{0\} s','\{0\}秒ごと'[\s\S]{0,160}\.replace\('\{0\}',String\(Math\.round\(TICK_MS\/1000\)\)\)/,
    'the number the reader sees is the constant');
});

/* ── ⑫ Atlas is not an exception ──────────────────────────────────────────────────────────── */
test('R298 ⑫ the chosen route card opens on BOTH surfaces', () => {
  const cards = read('js/routing-cards.js');
  const atlas = read('js/atlas-console.js');
  const ui = read('js/routing-ui.js');
  /* 「Atlas内の経路UIを勝手に例外にするな」 — #R296 made the PANEL's card open (the card stopped being a
     <button>, so a list of step buttons can live inside it) and Atlas kept #R291's sibling block. One
     renderer drew two layouts depending on which surface asked. */
  assert.ok(!/atl-rdetail/.test(atlas), 'no sibling detail block is left in the chat');
  assert.ok(!/atl-rdetail/.test(cards), '…nor addressed from the renderer');
  /* both surfaces pass a detail renderer INTO the cards */
  assert.match(ui, /detail: \(i2, a2\) => detailFor\(a2\),/);
  assert.match(atlas, /transit:true,\s*\n?\s*detail:\(i2,a2\)=>window\.IntMapRouteCards\.legRows\(a2\.legs/);
  assert.match(atlas, /transit:false,\s*\n?\s*detail:\(i2,a2\)=>_stepList\(a2\.steps\)/);
  /* selecting one REDRAWS THE SET — the only thing that can move the detail from one card to another */
  assert.match(cards, /var box = document\.querySelector\('\.rt-alts\[data-rset="' \+ sid \+ '"\]'\);/);
  assert.match(cards, /box\.outerHTML = altCards\(alts, Object\.assign\(\{\}, o, \{ sel: ai \| 0/);
  assert.match(cards, /data-kind="' \+ \(transit \? 'transit' : 'road'\) \+ '"/,
    'and the set says which kind it is, so the redraw needs no second source of truth');
  /* a reply is a message in a scrolling log — the bound the inline style used to carry lives in CSS */
  assert.match(read('css/intmap.css'), /#atlas-panel \.rt-alt-detail\{ max-height:240px; overflow:auto; \}/);
});

/* ── ⑭ what production measured about the route panel, pinned ─────────────────────────────── */
test('R298 ⑭ the candidates can be clicked, one thing answers 「is there a route」, re-opening recomputes', () => {
  const css = read('css/intmap.css');
  /* MEASURED on production: typing 「Tokyo」 gave EIGHT candidates and `elementFromPoint` returned a
     panel element for all six visible rows — the list sat at z-index 1600 under `.im-front`'s 2650,
     so only the keyboard could reach it. That is what 「検索機能なし」 looked like from outside. */
  const front = +(/\.im-front\{ z-index:(\d+) !important; \}/.exec(css) || [])[1];
  const sug = +(/\.rtp-suggest\{\s*\n?\s*position:fixed; z-index:(\d+);/.exec(css) || [])[1];
  assert.ok(front > 0 && sug > 0, 'both z-indices are declared');
  assert.ok(sug > front, `the candidate list (${sug}) must sit above a fronted window (${front})`);
  /* MEASURED, same frame, right after closing: the store said false and the UI said true. */
  const rt = read('js/routing.js');
  const clr = rt.slice(rt.indexOf('function clear(){ _lastPaint=null;'), rt.indexOf('const PROFILES='));
  assert.match(clr, /_rsActive='';/, 'clearing detaches the active set, so hasRoute() cannot go stale');
  assert.match(clr, /window\.IntMapRouteStore\.clearRoute\(\)/, '…and the store is cleared with it');
  assert.ok(!/_rsets\s*=\s*new Map\(\)/.test(clr),
    'but the OTHER sets survive — an Atlas reply still in the transcript addresses its own by id');
  /* MEASURED: closing and re-opening left the fields filled and the pane empty, while two documents
     said re-opening shows the same journey. */
  const ui = read('js/routing-ui.js');
  assert.match(ui, /else if \(ST\(\)\._pure\.ready\(ST\(\)\.get\(\)\)\) schedule\(0\);/);
});

/* ── ⑮ what production found AFTER this round shipped ─────────────────────────────────────── */
test('R298 ⑮ a predicate is CALLED, a shape is painted once, and a pan repairs the cage', () => {
  /* ⑴ MEASURED on production the moment this round shipped: `#route-panel` carried
     `data-detent="full"` on a 1,280 px desktop, and only `setDetent` writes that — which `open()`
     calls behind `if (isMob())`. `HOST.isMobile` is the PREDICATE (js/app-body.js: `get isMobile(){
     return isMobile; }`), so `!!HOST.isMobile` was true on every device, `enableWindowing()`
     early-returned, and THIS ROUND'S drag and resize never bound at all. */
  const ui = read('js/routing-ui.js');
  assert.ok(!/!!HOST\.isMobile\s*\|\|/.test(ui), 'the function object must not be the answer');
  assert.match(ui, /typeof HOST\.isMobile === 'function' \? !!HOST\.isMobile\(\)/,
    'the predicate is called');
  /* every other module in this app already calls it — this file was the only one that did not */
  const others = ['js/countries-ui.js', 'js/data-layers.js', 'js/map-ui.js']
    .map(read).join('\n');
  assert.ok(!/!!HOST\.isMobile\s*[|&]/.test(others), 'and nothing else spells it that way either');

  /* ⑵ MEASURED: one point returned the SAME unit four and five times
     (DEU/dwd Kreis und Stadt Regensburg ×4, JPN/jma 日光市 ×5). At 0.38 four coats paint 0.85. */
  const s = WP();
  assert.match(s, /feats=dedupeSameShape\(feats\);/, 'the collection is deduplicated before it is published');
  const d = s.slice(s.indexOf('function dedupeSameShape(list){'), s.indexOf('function dedupeSameShape(list){') + 1800);
  assert.match(d, /if\(!p\|\|\(\+q\.norm\|\|0\)>\(\+\(\(p\.properties\|\|\{\}\)\.norm\)\|\|0\)\) win\.set\(k,f\);/,
    'the worst rank survives');
  assert.match(d, /MERGED\[rid\]=\(MERGED\[rid\]\|\|\[\]\)\.concat\(b\);/,
    'and the folded-in rows are kept, so the tap card still lists every warning');
  assert.match(d, /Object\.keys\(MERGED\)\.forEach\(k=>\{ delete MERGED\[k\]; \}\);/,
    'rebuilt from scratch each publish — appending in place would compound');
  assert.match(s, /const a=ROWS\[pr\.rid\]\|\|\[\], b=MERGED\[pr\.rid\]\|\|\[\];/,
    'and the reader of the rows consults both, so ROWS stays owned by unitFeature');

  /* ⑶ MEASURED: a caged map stayed caged for 21 s because `idle` never came. */
  const p = read('js/map-projection.js');
  assert.match(p, /GE\(\)\.events\.on\('moveend',_reassertFlatPan\);/,
    'dragging the map — the reader’s first instinct — repairs it');
});

/* ── ⑬ the message tools moved out rather than the ceiling moving up ─────────────────────── */
test('R298 ⑬ the Atlas kernel is under its ceiling because a subject left', () => {
  const n = (p) => read(p).split('\n').length;
  assert.ok(n('js/atlas-console.js') < 5_300, `js/atlas-console.js is ${n('js/atlas-console.js')} lines`);
  /* …and the subject is really somewhere, with its CSS, not deleted */
  const m = read('js/atlas-msg-tools.js');
  assert.match(m, /export const MSG_TOOLS_CSS/);
  assert.match(m, /export const MSG_TOOLS_CSS_MOBILE/);
  assert.match(m, /export function makeMsgTools\(CTX\)/);
  assert.match(m, /function copyBtn\(src\)\{/, 'the one copy button lives here now');
  assert.match(m, /\.atl-msgt\{display:flex/, 'and so do its rules');
  const k = read('js/atlas-console.js');
  assert.match(k, /^import \{ MSG_TOOLS_CSS, MSG_TOOLS_CSS_MOBILE, makeMsgTools \} from '\.\/atlas-msg-tools\.js';/m);
  assert.match(k, /const \{ copyBtn, editBtn, msgTools \} = makeMsgTools\(/);
  assert.ok(!/function copyBtn\(/.test(k), 'a second copy button cannot be written in the kernel');
  /* the reader's own bar is hidden until hovered, and only theirs */
  assert.match(m, /\.atl-msgt-u\{align-self:flex-end;margin:-10px 0 0;padding-top:2px;opacity:0;\}/);
  assert.match(m, /@media\(hover:none\)\{[^}]*\.atl-msgt-u\{opacity:0\.55;\}/,
    'a touch screen has no hover, so there it stays reachable');
  assert.match(m, /\.atl-msgt-u:focus-within\{opacity:1;\}|:focus-within/, 'and a keyboard reaches it');
});

/* ── ⑪ a retry that re-reads a cached body is not a retry ───────────────────────────────── */
test('R298 ⑪ the shape library can actually grow between two asks', () => {
  const s = WP();
  /* 「警報の塗漏れが多すぎる」 — #R288 put a member that is STILL short of a full library on a
     three-minute interval and #R297 stored what it learns for seven days. Both were defeated by a
     missing argument: this read went through `fetchJSON(u)` with no cache option while the relay
     answered `max-age=3600`, so the browser served the same bytes for an hour and the three-minute
     retry could not have learned anything. The register only holds what is in force RIGHT NOW. */
  const i = s.indexOf('function askSwicGeo(iso){');
  assert.ok(i > 0, 'askSwicGeo must exist');
  const body = s.slice(i, i + 4200);
  assert.match(body, /fetchJSON\(u,\{cache:'no-store'\}\)/,
    'the library read bypasses the HTTP cache — it is asking again ON PURPOSE');
  /* …and because a re-ask is now a real request, it is bounded by the view — but only for a country
     that already HAS a library. One with none is asked wherever it is (#R284: Moldova 0 of 42). */
  assert.match(body, /if\(swicGeoAsked\[iso\]&&Object\.keys\(swicGeoBy\[iso\]\|\|\{\}\)\.length&&!inViewISO\(iso\)\) return;/);
  /* and the relay's own window is not longer than the interval the app retries on */
  const relay = read('supabase/functions/alerts-relay/index.ts');
  const geo = relay.slice(relay.indexOf('summariseSWICGeo(r.text(), m)'));
  const m = /max-age=(\d+), s-maxage=\1, stale-while-revalidate=(\d+)/.exec(geo);
  assert.ok(m, 'the shape route declares a cache window');
  const shortMs = +(/const SWIC_GEO_SHORT_MS=(\d+);/.exec(s) || [])[1];
  assert.ok(+m[1] * 1000 <= shortMs,
    `the edge window (${m[1]} s) must not outlast the retry interval (${shortMs / 1000} s)`);
  assert.ok(+m[2] >= 3600, 'stale-while-revalidate still protects the upstream');
});

/* ── ⑦ 「持っていない」 and 「the globe」 are different answers ─────────────────────────────── */
test('R298 ⑦ the wind’s first read is the band on screen, which it never was', () => {
  const e = read('js/wx-ecmwf.js');
  /* MEASURED consequence of the old spelling: `heldBand()` answered null both when a GLOBAL frame
     was held and when NO frame was held, `bandCovers(null, …)` reads null as 「covers everything」,
     so the caller's `if(!bandCovers(heldBand(VAR), b)) b = nearBand()` was false on the very first
     load and the opening view (the globe) read 13,199,360 samples before a particle moved.
     #R297 wrote `bandNear` for exactly that load and it never ran. */
  assert.match(e, /heldBand: function \(variable\) \{[^}]*: false; \},/,
    'no frame at all is `false`, which is not `null`');
  assert.match(e, /if \(have === false\) return false;/, 'and bandCovers tells them apart');
  assert.match(e, /if \(have === null \|\| have === undefined\) return true;/,
    'while a global frame still covers everything');
  /* the caller is unchanged — the defect was in what it was told, not in what it asked */
  const w = read('js/weather.js');
  assert.match(w, /if\(!EC\(\)\.bandCovers\(EC\(\)\.heldBand\(VAR\),b\)\) b=nearBand\(\)\|\|b;/);
});

/* ── ⑧ nothing that the reader cannot see is read before the colour is up ────────────────── */
test('R298 ⑧ the reads that do not draw wait for the colour field', () => {
  const w = read('js/weather.js');
  /* one reader, one queue (js/wx-ecmwf.js `serial`), and the raster tiles decode through it too —
     so the next hour's prefetch (a DIFFERENT file, which re-points the reader), the wide band and
     the cursor readout were all queued ahead of the tiles the reader is waiting to see. */
  assert.match(w, /function afterFieldShown\(fn,graceMs\)\{/, 'there is one place that defers');
  assert.match(w, /afterFieldShown\(\(\)=>\{[\s\S]{0,240}EC\(\)\.prefetch\(/, 'the next hour waits');
  assert.match(w, /afterFieldShown\(\(\)=>\{[\s\S]{0,700}EC\(\)\.load\(VAR,null,want,true\)/, 'the wide band waits');
  assert.match(w, /if\(W&&W\.on&&W\.on\(\)&&W\.afterFieldShown\)\{ W\.afterFieldShown\(warmReadNow\); return; \}/,
    'and so does the cursor readout, but only while the wind is the layer holding the reader');
  assert.match(w, /fieldShown\(\);/, 'the reveal releases them');
  assert.match(w, /function fieldShown\(\)\{ fieldPending=false;/, 'exactly once, to everyone waiting');
  /* ⚠ never a path that waits for ever: the 12 s backstop runs the same reveal */
  assert.match(w, /_whenSrcLoaded\(s\.src,reveal,12000\);/);
  /* the particles' own first read is NOT deferred — deferring it would make the particles slower */
  const load = w.slice(w.indexOf('function load(opt){'), w.indexOf('function ensureRenderer()'));
  assert.ok(!/afterFieldShown\([\s\S]{0,120}return EC\(\)\.load\(VAR/.test(load),
    'the field the particles fly on is read immediately');
});

/* ── ⑩ the flat map wraps, and that is CHECKED rather than merely set once ───────────────── */
test('R298 ⑩ there is one way to be flat, and the free scroll is re-asserted', () => {
  /* ⚠ the subject left js/app-body.js in this same round — the app shell has a line budget
     (tests/r168 #8) and the rule beside it is that a subject moves out, never that the budget moves
     up. It is one file now, which is the point: 「there is one way to be flat」. */
  const b = read('js/map-projection.js');
  /* MEASURED on the built app before this: `?flat` set NO projection at all — `getProjection()`
     answered nothing, `currentProj` stayed 'globe', the Globe button stayed lit over a flat map,
     `minZoom` stayed 0 and `renderWorldCopies` stayed at the construction value (false). Five
     600-px pans left the centre on 141.3°: the camera did not move at all. 「自由スクロールできない」. */
  assert.match(b, /if\(\/\[\?&\]flat\\b\/\.test\(location\.search\)\)\{\s*\n?\s*if\(IntMapOS\.has&&IntMapOS\.has\('view\.proj\.flat'\)\) IntMapOS\.exec\('view\.proj\.flat'/,
    'the URL switch goes through the kernel command, not a second entrance');
  /* the invariant is READ before it is written — writing on every style event is #R297's oscillation */
  assert.match(b, /function _reassertFlatPan\(\)\{/);
  assert.match(b, /if\(c\.getRenderWorldCopies&&c\.getRenderWorldCopies\(\)\) return;/,
    'an already-free map costs nothing');
  assert.match(b, /GE\(\)\.events\.on\('styledata',_reassertFlatPan\); GE\(\)\.events\.on\('idle',_reassertFlatPan\);/,
    'and the check runs on the events that could have broken it');
  /* the cage is still cleared unconditionally — #R297's rule, kept */
  assert.match(b, /function applyFlatPanSetting\(\)\{[\s\S]{0,200}setMaxBounds\(null\)/);
  /* and both engines answer the question, so the contract has no hole */
  assert.match(read('js/geo-engine.js'), /getRenderWorldCopies\(\)\{ const m=_m\(\);/);
  assert.match(read('js/cesium-engine.js'), /getRenderWorldCopies\(\)\{ return false; \}/);
});

/* ── ⑨ a dated layer can only be asked for a date that exists ────────────────────────────── */
test('R298 ⑨ the dated weather layers step over dates the product actually published', () => {
  const d = read('js/data-layers.js');
  assert.match(d, /const DATED_SPEC=/, 'each dated layer declares its own range and cadence');
  /* the three facts, per layer — a single global 「now − 2 days」 was the thing being replaced */
  const spec = d.slice(d.indexOf('const DATED_SPEC='), d.indexOf('const DATED_SPEC=') + 1400);
  ['precip', 'sst', 'snow', 'aod'].forEach(id =>
    assert.ok(new RegExp(id + "\\s*:\\s*\\{[^}]*start:").test(spec), id + ' declares a start'));
  assert.match(spec, /lagDays:\s*0/, 'and the lag is per product — one of them publishes same-day');
  assert.match(d, /function _snapLayerDate\(/, 'a date the product does not have is snapped');
  assert.match(d, /function _stepDate\(/, 'and the steppers move by one published frame');
  /* the reader is told when the day they picked is not the day being drawn */
  assert.match(d, /function _dateNote\(/);
  /* the app-wide clock goes through the same rounding rather than a single global clamp */
  const g = d.slice(d.indexOf('window.setGlobalLayerDate'), d.indexOf('window.setGlobalLayerDate') + 900);
  assert.ok(/_snapLayerDate|_dateBounds/.test(g), 'setGlobalLayerDate rounds per layer');
});
