/* ============================================================================
 *  R515 — THE MAP DREW MEANINGLESS LINES BECAUSE THE POINTS WERE STRANGERS
 * ----------------------------------------------------------------------------
 *  Reported: 「なぜこうやって無意味な線で結ばれてしまう？」 over a 瀬戸内海 port map whose ⑦
 *  「岩国・大竹地区」 sat in 東京・築地 and whose ⑥ 「宇部港」 sat near 浜松.
 *
 *  ══ WHAT WAS ACTUALLY WRONG ═══════════════════════════════════════════════════════════════════
 *  Not the relations. THE POINTS. Nominatim's free-text search drops the terms it cannot match and
 *  ranks what is left, so a name that is simply not in OSM returns a stranger — with HTTP 200:
 *
 *      「宇部港, 日本」       → 日本郵便, a POST BOX in 浜松市        (importance 0.00007)
 *      「岩国・大竹地区, 日本」 → 国立がん研究センター中央病院, 築地, 東京都
 *      「徳山下松港, 日本」    → 福岡下山門団地郵便局, 福岡市
 *      「新居浜港, 日本」      → 西日本鉄道多々良工場, 福岡市
 *
 *  js/atlas-geo-resolve.js's geocode() asked for `limit=1` and took `j[0]`, so there was never a
 *  candidate to compare against; js/atlas-map-compose.js labelled the point with the name the model
 *  had written and joined the points with great-circle arcs. Every layer was «working».
 *
 *  ⚠ THE RULE ALREADY EXISTED IN THAT FILE. _nomExtent — eight candidates, a class penalty, an
 *  exact-name bonus, an honest-miss guard — has had it since #R53/#R116/#R136, and guarded only the
 *  REGION path. #R429's shape: a check written at one function protects that function.
 *
 *  ══ WHAT THESE TESTS DRIVE ════════════════════════════════════════════════════════════════════
 *  The SHIPPED modules. ① and ② drive the real geocode(), through the real js/fetch-deadline.js and
 *  js/nominatim-gate.js, with ONLY `fetch` replaced — by the responses the live gazetteer actually
 *  returned (tests/fixtures/r515-nominatim.json, captured 2026-09-07), so the URL that goes out and
 *  the refusal that comes back are the ones the app performs. ③ runs the real js/atlas-map-compose.js,
 *  ④ the real catalogue. Nothing here re-implements the thing it checks, and nothing reaches past a
 *  module's published surface: tests/r199 ② holds a factory's return and the kernel's destructuring
 *  to one set, so a judge exported only to be tested would make the module claim a surface nobody uses.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasGeoResolve } = await import('../js/atlas-geo-resolve.js');
const { makeAtlasMapCompose } = await import('../js/atlas-map-compose.js');
const { makeAtlasGeoLedger } = await import('../js/atlas-geo-ledger.js');
const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { NominatimGate } = await import('../js/nominatim-gate.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/r515-nominatim.json'), 'utf8')).queries;
const R = (f) => readFileSync(join(ROOT, f), 'utf8');

/* the resolver as js/atlas-console.js builds it, with only the host bits stubbed.
   ⚠ THE GUARD IS NOT REACHED DIRECTLY. tests/r199 ② holds the factory's return and the kernel's
   destructuring to the SAME set, and js/atlas-console.js has no use for a candidate judge — so
   exporting one to be tested would have made the module claim a surface nobody consumes. These
   drive the SHIPPED geocode(), through the real js/fetch-deadline.js and js/nominatim-gate.js,
   with only `fetch` replaced by the responses the live gazetteer gave on 2026-09-07. */
function resolver() {
  return makeAtlasGeoResolve({ lang: 'ja' }, {
    GE: () => ({ camera: { getCenter: () => ({ lng: 0, lat: 0 }) } }),
    L: (en) => en,
    _lnorm: (s) => String(s || '').toLowerCase().trim(),
    _setLast: (x) => x,
    lastPlace: () => null,
  });
}
/* replays tests/fixtures/r515-nominatim.json for the query in the URL; returns the URLs it served */
async function overFixtures(fn) {
  const urls = [];
  const realFetch = globalThis.fetch;
  NominatimGate.configure({ gapMs: 0, reset: true });
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    const q = decodeURIComponent(String(url).split('&q=')[1] || '');
    if (!(q in FIX)) throw new Error('no recorded response for ' + q);
    return { ok: true, status: 200, text: async () => JSON.stringify(FIX[q]) };
  };
  try { await fn(); } finally { globalThis.fetch = realFetch; NominatimGate.configure({ gapMs: 1100, reset: true }); }
  return urls;
}

/* ══ ① the four reported placements are refused, and every honest one still resolves ════════════ */
test('R515 ①: a candidate whose own name has nothing to do with the query is not a place', async () => {
  const R = resolver();
  const urls = await overFixtures(async () => {
    /* the map the reader was looking at */
    for (const q of ['宇部港, 日本', '岩国・大竹地区, 日本', '徳山下松港, 日本', '新居浜港, 日本', '福山港, 日本', '呉港, 日本']) {
      const hit = await R.geocode(q);
      assert.equal(hit, null, `${q} resolved to ${hit && hit.name} — the gazetteer has no such feature, so the answer is nothing`);
    }
    /* …and the ones that DID exist are still found, including the two the same call placed correctly */
    const mizushima = await R.geocode('水島港, 日本');
    assert.equal(mizushima.name, '水島港');
    assert.ok(Math.abs(mizushima.lat - 34.5012) < 0.01 && Math.abs(mizushima.lng - 133.6812) < 0.01, '水島港 is in 倉敷, where it was before');
    assert.equal((await R.geocode('高松港, 日本')).name, '高松港');
    /* an English query against a Japanese-named feature agrees through namedetails, not through luck */
    assert.equal((await R.geocode('Mount Fuji, Japan')).name, '富士山');
    /* the ordinary cases the point resolver carries for every other caller */
    assert.equal((await R.geocode('Paris, France')).name, 'Paris');
    assert.equal((await R.geocode('Riga')).name, 'Rīga');
    /* ⚠ a HOUSE NUMBER lives in the address and in no feature's name — the one gated exception */
    assert.equal((await R.geocode('1600 Pennsylvania Avenue NW, Washington')).name, 'White House');
  });
  /* ⚠ the request itself: one candidate cannot be compared with anything, and the language variants
     are what let an English query agree with a Japanese name. */
  assert.equal(urls.length, 12, 'every query went out exactly once');
  for (const u of urls) {
    assert.ok(!/[?&]limit=1(&|$)/.test(u), `still asking for a single hit: ${u}`);
    assert.match(u, /[?&]namedetails=1(&|$)/, `no name variants to agree with: ${u}`);
  }
});

/* ══ ② agreement is about the FEATURE'S NAME, never about its address ═══════════════════════════ */
test('R515 ②: standing on 新居浜港線 does not make a supermarket 新居浜港', async () => {
  const coop = FIX['新居浜港, 日本'].find((o) => /新居浜港線/.test(o.display_name || ''));
  assert.ok(coop, 'the fixture lost the candidate this rule exists for');
  assert.equal(coop.name, 'コープ');
  assert.ok(String(coop.display_name).indexOf('新居浜港') >= 0, 'the query IS a substring of its address');
  const R = resolver();
  await overFixtures(async () => {
    assert.equal(await R.geocode('新居浜港, 日本'), null, 'an address match would have kept the class of answer this fixes');
    /* the same measure says yes when the names really are the same thing */
    assert.equal((await R.geocode('水島港, 日本')).name, '水島港');
  });
});

/* ══ ③ compose: an unfound name places nothing, joins nothing, and hands the model the next move ══ */
function fakeEngine() {
  const layers = new Set(), sources = new Set();
  let data = null;
  const g = {
    layers: {
      hasSource: (id) => sources.has(id), addSource: (id) => sources.add(id),
      setSourceData: (id, d) => { data = d; }, has: (id) => layers.has(id),
      add: (d) => layers.add(d.id), setVisible: () => {}, getLayout: () => 'visible', setFilter: () => {},
    },
    camera: { flyTo: () => {}, fitBounds: () => {}, getZoom: () => 3 },
    events: { onLayer: () => {}, on: () => {} },
    render: { canvas: () => ({ style: {} }) },
  };
  return { GE: () => g, data: () => data };
}

test('R515 ③: a relation whose endpoint could not be placed is not drawn, and `tried` says what was spent', async () => {
  const eng = fakeEngine();
  const GEOBJ = makeAtlasGeoObject();
  const ledger = makeAtlasGeoLedger({ geoObject: GEOBJ.geoObject });
  /* the geocoder #R515 ships: 水島港 resolves, 宇部港 does not exist under that name */
  const geocode = async (q) => (/水島港/.test(q) ? { lng: 133.681, lat: 34.501, name: '水島港' }
    : /福山/.test(q) ? { lng: 133.383, lat: 34.485, name: '福山市' } : null);
  const C = makeAtlasMapCompose({ GE: eng.GE, geocode, ledger, geoObject: GEOBJ.geoObject, dispatch: async () => ({ ok: true }) });
  const r = await C.run({
    items: [{ name: '水島港', country: '日本' }, { name: '宇部港', country: '日本' }, { name: '福山市', country: '日本' }],
    relations: [{ from: 1, to: 2, type: 'flow', label: '沿岸物流' }, { from: 1, to: 3, type: 'flow', label: '沿岸物流' }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.exec.status, 'partial');
  assert.deepEqual(r.exec.placed.map((p) => p.name), ['水島港', '福山市'], 'the stranger was never a marker');
  assert.equal(r.exec.unplaced.length, 1);
  assert.equal(r.exec.unplaced[0].name, '宇部港');
  assert.equal(r.exec.unplaced[0].reason, 'not_found');
  /* ⚠ the model is the only party that can supply a different name, so it is told which it has spent */
  assert.deepEqual(r.exec.unplaced[0].tried, ['宇部港, 日本', '宇部港']);
  /* the line the reader called 無意味 is simply not there */
  assert.equal(r.exec.relationsDrawn, 1, 'only the relation between two real places');
  assert.equal(r.exec.relationsSkipped.length, 1);
  assert.equal(r.exec.relationsSkipped[0].reason, 'endpoint_unplaced');
  /* and the note names the move that is still open, instead of leaving the miss as a dead end */
  assert.match(r.exec.note, /not_found/);
  assert.match(r.exec.note, /compose_map again/);
});

/* ══ ④ what the model is TOLD about relations — the standard was never written down ═════════════ */
test('R515 ④: the catalogue states when a line is warranted, and that a name is never substituted', () => {
  const CAT = makeAtlasCatalogText({}, {});
  assert.ok(CAT.idsCovered().includes('map.compose'), 'map.compose left the catalogue');
  const t = { t: CAT.text(['map.compose']) };
  /* the relation is Atlas's claim, and Atlas is told what would make it one */
  assert.match(t.t, /GREAT-CIRCLE ARC/);
  assert.match(t.t, /NOT a surveyed road, shipping lane or pipeline/);
  assert.match(t.t, /sharing an industry, a region or a list is not a connection/);
  assert.match(t.t, /leave them unjoined/);
  /* and that an unfound name comes back as itself, not as somewhere else */
  assert.match(t.t, /NEVER SUBSTITUTED/);
});

/* ══ ⑤ THE STRUCTURE: the gazetteer is a shortcut, not the authority ════════════════════════════
 *  「いやそもそもコードで処理する構造そのものがおかしいやろが」 — right. Refusing a stranger
 *  (① above) only stops the map from lying; it does not put 宇部港 back on it. Deciding WHAT a name
 *  means is Atlas's work, and js/atlas-geo-resolve.js's geoVerify — one web-search-grounded question,
 *  cached, fail-open — has done exactly that since #R130 for the highlight path and no other.
 * ============================================================================================ */
test('R515 ⑤: a name no gazetteer holds goes to Atlas and the live web — in ONE question, and marked as such', async () => {
  const eng = fakeEngine();
  const GEOBJ = makeAtlasGeoObject();
  const ledger = makeAtlasGeoLedger({ geoObject: GEOBJ.geoObject });
  const asked = [];
  /* the gazetteer knows 水島港 and nothing else — the state ① leaves behind */
  const geocode = async (q) => { asked.push(q); return /水島港/.test(q) ? { lng: 133.681, lat: 34.501, name: '水島港' } : null; };
  /* ⚠ ONE call carrying the whole list — a call per name would spend the reader's daily allowance
     (supabase/functions/ai-proxy: ONE USER TURN = ONE USE, #R318, bounded by TURN_MAX_CALLS). */
  const batches = [];
  const verifyPlaces = async (names) => {
    batches.push(names.slice());
    const out = new Map();
    for (const q of names) out.set(q, verdict(q));
    return out;
  };
  const verdict = (q) => {
    if (/呉港/.test(q)) return { found: true, lat: 34.24, lng: 132.55, kind: 'unknown', country: 'Japan', altNames: ['Kure Port'], confidence: 0.8, webUsed: true };
    if (/宇部港/.test(q)) return { found: true, lat: 33.94, lng: 131.24, kind: 'unknown', country: 'Japan', altNames: [], confidence: 0.75, webUsed: true };
    /* ⚠ a guess with no web behind it is NOT a verification — #R130's own bar, not a new one */
    if (/周南コンビナート/.test(q)) return { found: true, lat: 34.05, lng: 131.8, confidence: 0.9, webUsed: false };
    return null;
  };
  const C = makeAtlasMapCompose({ GE: eng.GE, geocode, verifyPlaces, ledger, geoObject: GEOBJ.geoObject, dispatch: async () => ({ ok: true }), countryCodeAt: () => 'JPN' });
  const r = await C.run({
    items: [{ name: '水島港', country: '日本' }, { name: '宇部港', country: '日本' }, { name: '呉港', country: '日本' }, { name: '周南コンビナート', country: '日本' }],
    relations: [{ from: 1, to: 2, type: 'flow', label: '沿岸物流' }, { from: 1, to: 4, type: 'flow', label: '沿岸物流' }],
  });
  /* the two the web could ground are ON the map — and numbered in the order Atlas listed them */
  assert.deepEqual(r.exec.placed.map((x) => x.n + ':' + x.name), ['1:水島港', '2:宇部港', '3:呉港']);
  assert.deepEqual(r.exec.placed.map((x) => x.provenance), ['geocoded_point', 'web_verified', 'web_verified'],
    'a point only the web could vouch for must stay distinguishable from a gazetteer feature');
  /* ⚠ ONE wait, not one per name */
  assert.equal(batches.length, 1, 'ONE question, not one per name — a call each would spend the reader\'s daily allowance');
  assert.deepEqual(batches[0], ['宇部港, 日本', '呉港, 日本', '周南コンビナート, 日本'],
    'only the misses were escalated — 水島港 never went to the web');
  /* the unverifiable one is still refused, and says the web was asked too */
  assert.deepEqual(r.exec.unplaced, [{ name: '周南コンビナート', reason: 'not_found', tried: ['周南コンビナート, 日本', '周南コンビナート'], webVerified: false }]);
  /* and the relations follow: 1—2 is drawn now that 2 exists, 1—4 is not */
  assert.equal(r.exec.relationsDrawn, 1);
  assert.deepEqual(r.exec.relationsSkipped.map((x) => x.reason), ['endpoint_unplaced']);
  /* the ledger keeps what the web found, so the next turn inherits it instead of asking again */
  assert.ok(GEOBJ.pointLike(GEOBJ.geoObject({ name: '宇部港', lng: 131.24, lat: 33.94, provenance: 'web_verified' })),
    'a web-verified point denotes a spot');
  assert.ok(GEOBJ.rank(GEOBJ.geoObject({ name: 'x', lng: 1, lat: 2, provenance: 'geocoded_point' }))
    < GEOBJ.rank(GEOBJ.geoObject({ name: 'x', lng: 1, lat: 2, provenance: 'web_verified' })),
    'a gazetteer feature still outranks a web-verified point for the same object');
});

/* ══ ⑥ the rule this round was told to make permanent ═══════════════════════════════════════════ */
test('R515 ⑥: case-by-case hardcoding is forbidden by a standing rule that is actually loaded', () => {
  const rule = R('.agents/rules/no-ad-hoc-hardcoding.md');
  /* it forbids the thing, and it says what to do instead — a prohibition with no alternative is ignored */
  assert.match(rule, /場当たりのハードコーディング/);
  assert.match(rule, /直すのは事例ではなく/);
  assert.match(rule, /着手前の 3 問/);
  /* ⚠ a rule nobody loads is not a rule: AGENTS.md must point at it and CLAUDE.md must import it
     (scripts/agent-sync.mjs enforces the import; this holds the POINTER, which it does not). */
  assert.match(R('AGENTS.md'), /場当たりのハードコーディングで逐事的に対処してはならない/);
  assert.match(R('AGENTS.md'), /\.agents\/rules\/no-ad-hoc-hardcoding\.md/);
  assert.match(R('CLAUDE.md'), /@\.agents\/rules\/no-ad-hoc-hardcoding\.md/);
  assert.match(R('docs/README.md'), /no-ad-hoc-hardcoding\.md/, 'docs/README.md is the index — a document not in it has no owner');
  /* ⚠ AGENTS.md is read to a byte ceiling; the rule bought its room by MOVING a measurement out */
  assert.ok(Buffer.byteLength(R('AGENTS.md'), 'utf8') < 32768, 'AGENTS.md would be silently truncated');
  assert.match(R('docs/AGENT-SETUP.md'), /--use-api/, 'the measurement that made room has to land somewhere');
});
