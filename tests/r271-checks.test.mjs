/* ============================================================================
 *  IntMap · #R271 source checks
 * ----------------------------------------------------------------------------
 *  Seven reports, four of them the SECOND or THIRD time the same sentence has arrived. The
 *  assertions below are about the PROPERTIES that make each defect impossible again, never about
 *  the literals this round happened to write.
 *
 *    ① a warning is drawn at the unit the agency issues for — Japan at its class10 regions, and
 *       the country wash means «areas that could not be placed», not «the worst rank in force»
 *    ② two more services read directly, with their own polygons (DWD, MET Norway)
 *    ③ the colour key has one swatch per category — 89 languages, 89 colours
 *    ④ the clear ✕ is placed from the FIELD's box, not from the wrapper around it
 *    ⑤ the terrain & water panel has one column: one inset, one gap, one right edge
 *    ⑥ a new water source never rebuilds the grid while the basin can be extended to it
 *    ⑦ the layer taxonomy: twenty rows moved, and every id appears in exactly one group
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* ⚠ (#R267) read CODE, not comments — this file's own prose names the things it checks for, and a
   check that matches its own explanation is the failure this project has paid for eleven times. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① the issuing unit, and what a country wash is allowed to mean ─────────────────────────── */
test('R271 ① Japan is drawn at the JMA’s own issuing regions, not at the prefecture', () => {
  const s = codeOnly(read('js/world-packs.js'));
  assert.match(s, /geojson\/class10s\.json/,
    'the JMA publishes the geometry of the units it issues for; that is what the layer must draw');
  assert.match(s, /jmaClass10Geo/, 'the class10 geometry must have a loader of its own');
  /* the bucket is the class10 code, and the prefecture only survives as the row's admin-1 label */
  assert.match(s, /byC10/, 'warnings must be bucketed by the class10 area they were issued for');
  /* the coarse path is a FALLBACK, and it must say which one is on screen */
  assert.match(s, /jmaUnit\s*=\s*'(class10|pref)'/,
    'the panel has to be able to say which unit Japan is drawn at');
});

test('R271 ① a country is washed only for what could NOT be placed', () => {
  const s = codeOnly(read('js/world-packs.js'));
  /* the hand-written list of «countries that draw their own areas» is gone: it stops being true the
     day a feed starts publishing shapes, and four of them did this round */
  assert.ok(!/GEOM_FEEDS\s*=\s*\{/.test(s),
    'the set of countries drawn at their own units must be derived, not written down');
  assert.match(s, /drawnISO/, 'it is rebuilt from the features that actually reached the source');
  assert.match(s, /const drawsAreas\s*=\s*\(c\)\s*=>\s*!!drawnISO\[c\]/,
    'drawsAreas must ask the map, not a table');
  /* the wash's rank comes from the unplaced areas only — that is what stops one district's
     top-tier warning from colouring a whole country */
  const m = /function agencyTier\(c\)\{([\s\S]*?return UNPL\[c\]\|\|0; \})/.exec(s);
  assert.ok(m, 'agencyTier() must exist and end at the unplaced-tier lookup');
  assert.match(m[1], /UNPL\[c\]/, 'the wash rank must come from the areas that could not be placed');
  assert.ok(!/cmaRec\.worst/.test(m[1]) && !/bomRec\.worst/.test(m[1]),
    'the worst rank anywhere in a country is not what a wash is allowed to say');
});

test('R271 ① what could not be placed is COUNTED and printed (#R185: no silent caps)', () => {
  const s = codeOnly(read('js/world-packs.js'));
  assert.match(s, /PLACED\[/, 'every resolver must record placed-of-total');
  assert.match(s, /function placedLine\(\)/, 'and the panel must print the shortfall');
  assert.match(s, /\+placedLine\(\)/, '…and actually call it');
  /* ⚠ (#R271 追記) …and a boundary set that could not be READ is «nothing could be placed», not
     «nothing is in force»: without this the country gets neither polygons nor a wash, and a CDN
     hiccup would take three hundred Chinese warnings off the map (#R212's rule). */
  assert.match(s, /if\(!idx\)\{ UNPL\[iso\]=worst\(\); return \[\]; \}/,
    'a failed boundary fetch must fall back to the country wash, not to silence');
});

/* ⚠ (#R271 追記) the panel must name the unit it is actually drawing — measured on production right
   after the deploy, it said 「115 prefectures」 while drawing 115 CLASS10 REGIONS (Japan has 47). */
test('R271 ① the panel counts the unit Japan is drawn at, not a fixed word', () => {
  const s = codeOnly(read('js/world-packs.js'));
  const m = /jp\+' '\+\(jmaUnit===[\s\S]{0,420}/.exec(s);
  assert.ok(m, 'the Japanese count must be labelled from jmaUnit, not from a fixed word');
  assert.match(m[0], /issuing regions/, 'class10 areas are issuing regions');
  assert.match(m[0], /prefectures/, '…and the fallback geometry really is prefectures');
});

/* ── ② the two services that answer a browser directly, with geometry ───────────────────────── */
test('R271 ② Germany and Norway are read from their own service', () => {
  const s = codeOnly(read('js/world-packs.js'));
  assert.match(s, /maps\.dwd\.de/, 'the DWD publishes its warning polygons on its own GeoServer');
  assert.match(s, /api\.met\.no\/weatherapi\/metalerts/, 'MET Norway publishes its alerts as GeoJSON');
  assert.match(s, /DEU:'dwd'/, 'Germany must be routed to the DWD, not to the MeteoAlarm relay');
  assert.match(s, /NOR:'metno'/, 'Norway must be routed to MET Norway');
  /* …and the MeteoAlarm table must no longer carry them, or the relay would fetch 10 MB for a
     country whose own service is already wired */
  const ma = /const MA=\{([\s\S]*?)\};/.exec(s);
  assert.ok(ma, 'the MeteoAlarm table must exist');
  assert.ok(!/\bDEU:/.test(ma[1]), 'Germany must not also be fetched from MeteoAlarm');
  assert.ok(!/\bNOR:/.test(ma[1]), 'Norway must not also be fetched from MeteoAlarm');
});

test('R271 ② Europe’s regions get a shape from the feed’s own polygon or the region it names', () => {
  const s = codeOnly(read('js/world-packs.js'));
  assert.match(s, /gisco-services\.ec\.europa\.eu[\s\S]*?NUTS_RG/,
    'the NUTS regions are the published geometry for the names MeteoAlarm prints');
  assert.match(s, /function capPolygon/, 'a CAP <polygon> is lat,lon — it must be converted in ONE place');
  assert.match(s, /function lookupUnit/, 'a zone named «province + part» must still find its province');
  /* the relay has to carry the areas at all, or none of the above has anything to work with */
  const r = read('supabase/functions/alerts-relay/index.ts');
  assert.match(r, /areas/, 'the relay must project one row per region, not one joined string');
  assert.match(r, /EMMA_ID/, 'regions are deduplicated by the id the feed publishes them under');
});

/* ── ③ one swatch, one category ─────────────────────────────────────────────────────────────── */
test('R271 ③ the culture palette continues instead of repeating', async () => {
  const s = read('js/layer-packs.js');
  const code = codeOnly(s);
  assert.ok(!/LPAL\[i%LPAL\.length\]/.test(code.replace(/\s/g, '')),
    'indexing a fixed palette modulo its length gives several categories the same swatch');
  assert.match(code, /function paletteOf\(/, 'the palette must be built for the number of categories');
  assert.match(code, /IntMapCulture[\s\S]*?palette:/, 'and published, so this can be checked');

  /* the property, evaluated: the language layer’s own category count must come out all-distinct */
  const m = /const LPAL=(\[[\s\S]*?\]);/.exec(s);
  assert.ok(m, 'LPAL must be a literal array');
  const LPAL = JSON.parse(m[1].replace(/'/g, '"'));
  const hex2 = (v) => { const n = Math.max(0, Math.min(255, Math.round(v))).toString(16); return n.length < 2 ? ('0' + n) : n; };
  const hsl = (h, sp, lp) => { const sat = sp / 100, l = lp / 100, c = (1 - Math.abs(2 * l - 1)) * sat,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)), mm = l - c / 2;
    const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return '#' + hex2((t[0] + mm) * 255) + hex2((t[1] + mm) * 255) + hex2((t[2] + mm) * 255); };
  const paletteOf = (n) => { const out = LPAL.slice(0, Math.min(n, LPAL.length));
    const seen = Object.create(null); out.forEach((c) => { seen[c.toLowerCase()] = 1; });
    for (let i = out.length; i < n; i++) { const h = Math.round((i * 137.508) % 360), k = (i - LPAL.length) % 3;
      const sat = [58, 40, 74][k]; let lig = [44, 64, 54][k];
      let c = hsl(h, sat, lig), guard = 0;
      while (seen[c.toLowerCase()] && guard < 24) { lig = ((lig + 7 - 28) % 44) + 28; c = hsl(h, sat, lig); guard++; }
      seen[c.toLowerCase()] = 1; out.push(c); }
    return out; };
  /* the real number of categories the shipped data carries, not a guess */
  const data = JSON.parse(read('data/language.json'));
  const tops = new Set(Object.values(data.countries || {}).map((v) => v.top));
  assert.ok(tops.size > LPAL.length, 'this check is only meaningful past the hand-picked palette');
  const pal = paletteOf(tops.size);
  assert.equal(new Set(pal.map((c) => c.toLowerCase())).size, tops.size,
    'every category in the language layer must carry a colour no other category uses');
});

/* ── ④ the clear mark is placed from the field ──────────────────────────────────────────────── */
test('R271 ④ the ✕ is measured against the input, not the box around it', () => {
  const s = codeOnly(read('js/map-ui.js'));
  assert.match(s, /window\.IntMapPlaceClear\s*=/, 'one definition, because there are two search boxes');
  const m = /window\.IntMapPlaceClear=function\(inp,btn,gap\)\{([\s\S]*?)\n  return place; \};/.exec(s.replace(/\s*\n\s*/g, '\n'))
         || /IntMapPlaceClear=function[\s\S]*?return place;/.exec(s);
  assert.ok(m, 'the helper must exist');
  assert.match(m[0], /inp\.offsetTop/, 'the vertical placement must come from the field’s own box');
  assert.match(m[0], /inp\.offsetHeight/, '…and from its height, not the wrapper’s');
  /* both boxes must use it — #R239's standing lesson */
  assert.match(codeOnly(read('js/map-ui.js')), /IntMapPlaceClear\(inp,b\)/, 'the sidebar box calls it');
  assert.match(codeOnly(read('js/map-extras.js')), /IntMapPlaceClear\(inp,clr\)/, 'the classic panel box calls it');
});

/* ── ⑤ one column in the terrain & water panel ──────────────────────────────────────────────── */
test('R271 ⑤ the panel’s scrollbar width is measured and given to the panes that do not scroll', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  assert.match(s, /function _squareColumn\(\)/, 'the measurement must have a name');
  assert.match(s, /offsetWidth-b\.clientWidth/, 'the scrollbar width is read off the element');
  assert.match(s, /paddingRight/, '…and written where an inline style cannot outrank it');
  assert.match(s, /scrollbar-gutter:stable/, 'so the column does not change width as content grows');
  /* the section heading and the row it labels start at the same inset */
  assert.match(s, /\.tw-cap\{[^}]*padding:0 11px/, 'a section heading is inset like the rows under it');
  /* a one-line prose block is a row, not something shorter than one */
  assert.match(s, /\.tw-blk\{[^}]*min-height:44px/, 'a prose block must sit on the row rhythm');
});

/* ── ⑥ a new source must not restart the water that is already flowing ──────────────────────── */
test('R271 ⑥ placing a source extends the basin instead of rebuilding the grid', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  assert.match(s, /function padsToReach\(/, 'how much lattice it would take must be computed');
  assert.match(s, /async function extendToPoint\(/, 'and the basin extended, not the rectangle moved');
  assert.match(s, /basinMaxCells\(\)/, 'the extension is budgeted');
  /* the tap tries the basin first, and only then falls back to the rebuild that DOES reset */
  const oc = /function onClick\(e\)\{[\s\S]*?\n    \}/.exec(s);
  assert.ok(oc, 'onClick must exist');
  const m = /else if\(mode==='source'\)\{([\s\S]*)$/.exec(oc[0]);
  assert.ok(m, 'the source branch of onClick must exist');
  assert.match(m[1], /basinCellOf\(lng,lat\)/, 'a point the basin already covers needs nothing at all');
  assert.match(m[1], /extendToPoint\(lng,lat\)/, 'and a point just outside it is reached by growing');
  assert.ok(m[1].indexOf('extendToPoint') < m[1].indexOf('rebuildAround'),
    'the rebuild is the last resort, not the first move');
  /* …and the programmatic door takes the same route (#R255/#R258/#R268: one entry, not two) */
  const a = /async addSource\(lng,lat,m3,o\)\{([\s\S]*?)courseSoon\(\); return r; \}/.exec(s);
  assert.ok(a, 'addSource must exist');
  assert.match(a[1], /extendToPoint/, 'the Atlas door must reach the point the same way the tap does');
});

/* ── ⑦ the taxonomy ─────────────────────────────────────────────────────────────────────────── */
test('R271 ⑦ every layer id is in exactly one group, and the moved rows are where they were sent', () => {
  const s = read('js/data-layers.js');
  const m = /const GROUPS=\[([\s\S]*?)\n        \];/.exec(s);
  assert.ok(m, 'GROUPS must be a literal');
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, ' ');
  const groups = {};
  const re = /\['(lyrGrp\w+)',\[([^\]]*)\]\]/g;
  let g;
  while ((g = re.exec(body))) {
    groups[g[1]] = g[2].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  }
  assert.ok(Object.keys(groups).length >= 15, 'the panel has more than a handful of shelves');
  /* ⚠ an id in two groups renders only in the last one — `order.push` MOVES the element (#R255) */
  const seen = new Map();
  for (const [name, ids] of Object.entries(groups)) {
    for (const id of ids) {
      assert.ok(!seen.has(id), 'layer "' + id + '" is in both ' + seen.get(id) + ' and ' + name);
      seen.set(id, name);
    }
  }
  const where = (id) => seen.get(id);
  assert.equal(where('dem'), 'lyrGrpPolitics', 'the Democracy Index belongs with governance');
  assert.equal(where('cpi'), 'lyrGrpPolitics', 'so does the corruption index');
  assert.equal(where('lifeexp'), 'lyrGrpHealth', 'life expectancy belongs with health');
  assert.equal(where('energy'), 'lyrGrpEnergy', 'the energy mix belongs on the energy shelf');
  assert.equal(where('aurora'), 'lyrGrpOrbit', 'an aurora forecast is space weather');
  assert.equal(where('nightsat'), 'lyrGrpDemo', 'night lights show where people are');
  assert.equal(where('bldg3d'), 'lyrGrpTech', 'a building is built infrastructure, not terrain');
  for (const id of ['worldcover', 'ecoregions', 'gxndvi', 'wbforest']) {
    assert.equal(where(id), 'lyrGrpNature', id + ' is land cover, not elevation');
  }
  for (const id of ['wbpopgrow', 'wbaging', 'wbfert', 'wburb', 'wbrural', 'wbdensity', 'wbref']) {
    assert.equal(where(id), 'lyrGrpDemo', id + ' is a population series');
  }
  assert.ok(!(groups.lyrGrpIndic || []).length, 'the one-row shelf is empty; its key is kept');
  const code = codeOnly(s);
  assert.match(code, /rowFor\('tz'\)/, 'the time-zone overlay joins the always-on switches');
  /* ⚠ …AND IT HAS TO BE MARKED PLACED, or the safety sweep files it under Beta and `order.push`
     MOVES it there. MEASURED on the built page before this line existed: 🕒 タイムゾーン came out in
     Beta, i.e. pushing it into the always-on block had done nothing at all. Same shape as #R233's
     note about the day/night row, one row later. */
  assert.match(code, /if\(tzRow\) placed\.add\(tzRow\)/,
    'a row pushed into the always-on block must be marked placed, or the sweep re-files it');
  assert.match(code, /if\(nsRow\) placed\.add\(nsRow\)/, '…the same way the day/night row is');
});

test('R271 ⑦ every group key the panel uses has a heading in all nine languages', () => {
  const s = read('js/data-layers.js');
  const m = /const GROUPS=\[([\s\S]*?)\n        \];/.exec(s);
  const keys = [...m[1].replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/\['(lyrGrp\w+)'/g)].map((x) => x[1]);
  const files = ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans'];
  for (const f of files) {
    const src = read('js/locales/ui.' + f + '.js');
    for (const k of keys) {
      assert.ok(new RegExp('["\']?' + k + '["\']?\\s*:').test(src),
        'ui.' + f + '.js has no heading for ' + k);
    }
  }
});

/* ── the three rows that were Japanese in every other language ──────────────────────────────── */
test('R271 the beta row labels are resolved through the language table, not a two-way ternary', () => {
  const s = codeOnly(read('js/beta-overlays.js'));
  assert.ok(!/jp\(\)\?BLBL\[k\]\[0\]:BLBL\[k\]\[1\]/.test(s),
    'a two-branch ternary over a five-slot table cannot serve nine languages, and this one was reversed');
  assert.match(s, /function relabel\(\)\{[\s\S]*?L\.arr\(BLBL\[k\]\)/,
    'the label must be resolved the same way buildUI resolves it');
});
