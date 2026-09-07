/* ============================================================================
 *  IntMap · #R520 — 一国につき一つ: the era country names were made per RING
 * ----------------------------------------------------------------------------
 *  「昔の国名ラベルが1国につき何十個も出る。」
 *
 *  `imtb-lbl` / `imtb-lbl2` drew their text from `imtb-src` — the BORDER POLYGONS — with
 *  `symbol-placement:'point'`. maplibre-gl's symbol bucket answers a polygon by walking
 *  `classifyRings(feature.geometry, 0)` and placing one anchor per outer ring, so the number of
 *  label candidates was the number of ISLANDS, not the number of countries. Measured on the data
 *  this app ships (data/cshapes.js, the source for every year 1886–2019), 1900-07-01: 151 features,
 *  1,583 outer rings. Japan alone had 30 candidates, Korea 7, Canada 268.
 *
 *  ⚠ THE OLD SHAPE PASSED EVERY EXISTING GATE. tests/r309 compares the two layers' declared style to
 *  `ofm-country` key by key and they agreed; tests/r410 reads the drawn text and it was right. Both
 *  were true ABOUT A LAYER MAKING FORTY COPIES OF IT. Nothing anywhere counted the candidates.
 *
 *  So §1 does not read the source for a spelling: it lifts the shipped `_labelFC` and its helpers
 *  out of js/time-borders.js, EVALUATES them, and runs them over a real CShapes snapshot — and §2
 *  runs the per-ring rule the renderer used to apply beside it, so the file demonstrates the gap it
 *  is guarding rather than asserting one. §3 is the structural half: the layers may not read the
 *  polygon source again, and every push of the polygons must push the points with them (the labels
 *  and the borders are one state; #R410's late identities arrive as a re-tag of the SAME snapshot).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const TB = read('js/time-borders.js');
const TBC = codeOnly(TB);

/* ── lift a function declaration out of the shipped file, body and all ─────────────────────────────
   ⚠ Not a copy of the algorithm: the text below IS the text that ships. A brace matcher that steps
   over string literals, run on the comment-stripped source, so a `{` inside a comment or a quoted
   'FeatureCollection' cannot end a function early. */
const lift = (name) => {
  const head = 'function ' + name + '(';
  const at = TBC.indexOf(head);
  assert.ok(at >= 0, 'js/time-borders.js no longer declares ' + name);
  let i = TBC.indexOf('{', at), depth = 0, q = null;
  for (; i < TBC.length; i++) {
    const c = TBC[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return TBC.slice(at, i + 1); }
  }
  throw new Error('unbalanced body for ' + name);
};

const NEEDED = ['_ringArea', '_mainPoly', '_segD2', '_polyD', '_qPush', '_qPop', '_pole', '_thinRing',
                '_anchor', '_labelFC', '_bbox', '_contains', '_interiorPts'];
const sandbox = { WeakMap, Map, Math, Infinity, String, Array, Number, isFinite, JSON, Object };
vm.createContext(sandbox);
vm.runInContext('var _lblPt = new WeakMap();\n' + NEEDED.map(lift).join('\n') + '\nvar LBL = _labelFC;', sandbox);
const labelFC = sandbox.LBL;

/* ── the real snapshot: CShapes at 1900-07-01, decoded the way csFC decodes it ─────────────────── */
const CS = (() => {
  const w = {};
  new Function('window', read('data/cshapes.js'))(w);
  return w.__CSHAPES;
})();
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const snapshot = (Y) => {
  const t = ymd(Y, 7, 1), feats = [];
  for (const f of CS.feats) {
    if (ymd(f[2], f[3], f[4]) > t || ymd(f[5], f[6], f[7]) < t) continue;
    const polys = f[8].map((poly) => poly.map((ri) => CS.rings[ri]));
    const geometry = (polys.length === 1) ? { type: 'Polygon', coordinates: polys[0] }
                                          : { type: 'MultiPolygon', coordinates: polys };
    feats.push({ type: 'Feature', geometry, properties: { NAME: f[0], name: f[0], _gw: f[1] } });
  }
  return { type: 'FeatureCollection', features: feats };
};
const FC = snapshot(1900);
const outerRings = (fc) => fc.features.reduce((n, f) =>
  n + (f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length), 0);

/* an INDEPENDENT point-in-polygon — deliberately not the module's `_polyD`, so §1 ③ cannot pass by
   agreeing with the same mistake twice */
const inRing = (x, y, r) => { let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) hit = !hit;
  } return hit; };
const inGeom = (x, y, g) => {
  const polys = (g.type === 'Polygon') ? [g.coordinates] : g.coordinates;
  for (const p of polys) { if (!inRing(x, y, p[0])) continue;
    let hole = false; for (let k = 1; k < p.length; k++) if (inRing(x, y, p[k])) { hole = true; break; }
    if (!hole) return true; }
  return false; };

/* ── ① the shipped rule makes one point per country, and puts it on that country ───────────────── */
test('R520 ①: _labelFC answers a snapshot with exactly one anchor per country', () => {
  const out = labelFC(FC);
  assert.ok(Array.isArray(out.features), '_labelFC did not return a FeatureCollection');

  const names = FC.features.map((f) => String(f.properties.NAME || '').trim()).filter(Boolean);
  const distinct = new Set(names);
  assert.ok(distinct.size > 100, 'the 1900 snapshot decoded to ' + distinct.size + ' countries — the fixture is wrong, not the code');

  /* one per identity: no country twice… */
  const seen = new Map();
  for (const f of out.features) {
    const nm = String(f.properties.NAME || '');
    assert.equal(f.geometry.type, 'Point', nm + ' is not a Point — the labels would be per-ring again');
    assert.ok(!seen.has(nm), nm + ' got more than one label anchor');
    seen.set(nm, f.geometry.coordinates);
  }
  /* …and no country lost one */
  for (const nm of distinct) assert.ok(seen.has(nm), nm + ' lost its name label entirely');
  assert.equal(out.features.length, distinct.size);

  /* ③ every anchor is really on its own country's land */
  for (const f of out.features) {
    const nm = String(f.properties.NAME || '');
    const src = FC.features.filter((g) => String(g.properties.NAME || '') === nm);
    const [x, y] = f.geometry.coordinates;
    assert.ok(src.some((g) => inGeom(x, y, g.geometry)),
      nm + ' is labelled at ' + x.toFixed(2) + ',' + y.toFixed(2) + ' — a point that is not inside it');
  }

  /* the properties are the ones the two layers filter and read, carried over untouched */
  const jp = out.features.find((f) => f.properties.NAME === 'Japan');
  assert.ok(jp, 'Japan is not labelled at 1900');
  assert.equal(jp.properties._gw, 740, 'the anchor dropped the CShapes code the click resolver reads');
});

/* ── ② the point OWNS its properties — the invariant that makes the source writeable ───────────── */
test('R520 ②: a point carries a COPY of the properties, not the polygon’s own object', () => {
  /* ⚠⚠⚠ THIS IS NOT TIDINESS. js/geo-command-log.js `_sourceHolds` skips a write whose payload the
     source already holds, and its own comment names the trap: «an object that was mutated is the same
     object». `tagSame` mutates each feature's properties IN PLACE when the late identities land
     (#R410). Share the reference and the held collection changes at the same instant as the one being
     built from it — deep-equal, write skipped, tiles never re-parsed. MEASURED before this was fixed:
     at 1916 `imtb-src` re-parsed with «Austria-Hungary» while the era label went on drawing the
     untagged name, and the push that should have corrected it ran, built its 151 features and was
     dropped one layer below. `imtb-src` escapes only because it is handed the very same object and
     that function's rule ① refuses to read identity as equality. */
  const one = FC.features.find((f) => f.properties.NAME === 'Japan');
  const fc = { type: 'FeatureCollection', features: [one] };
  const pt = labelFC(fc).features[0];
  assert.ok(pt, 'Japan produced no anchor');
  assert.notEqual(pt.properties, one.properties, 'the point shares the polygon’s properties object');

  /* stated as the behaviour rather than as the mechanism: mutate the source the way tagSame does,
     and the already-built point must NOT follow */
  const was = one.properties._modName;
  one.properties._modName = 'MUTATED';
  assert.notEqual(pt.properties._modName, 'MUTATED',
    'mutating the polygon changed a point that was already handed to the renderer — the next write will compare equal and be skipped');
  /* …and a REBUILD must pick the new value up, or the labels would never follow the identities at all */
  assert.equal(labelFC(fc).features[0].properties._modName, 'MUTATED', 'a rebuild does not read the current tags');
  if (was === undefined) delete one.properties._modName; else one.properties._modName = was;
});

/* ── ② one candidate is one chance, so the one candidate may step aside ────────────────────────── */
test('R520 ②: the single label is allowed to move rather than be dropped', () => {
  /* Before this round a country had one candidate per outer ring, so a blocked label was replaced by
     another island's copy — the thicket was also, accidentally, the redundancy. MEASURED the moment
     the duplicates went: «German Empire» vanished at 1916 over Europe, its pole of inaccessibility
     landing on `ofm-city`'s «Frankfurt am Main». `text-variable-anchor` is one symbol with several
     possible placements, which is the redundancy without the copies. */
  assert.ok(/text-variable-anchor/.test(TBC), 'the era labels have no alternative placements: a country whose anchor is blocked now loses its name outright');
  const va = /const _ERAVAR=\{([^}]*)\}/.exec(TBC);
  assert.ok(va, 'the variable-anchor block is not declared in one place for both layers');
  assert.ok(/'text-justify':'auto'/.test(va[1]),
    "text-justify must be 'auto' with variable anchors, or a wrapped name keeps centre justification while sitting beside its anchor");
  assert.ok(/text-radial-offset/.test(va[1]), 'the alternative placements have no offset, so they are all the same placement');
  for (const id of ['imtb-lbl', 'imtb-lbl2']) {
    const def = new RegExp("id:'" + id + "'[\\s\\S]{0,400}?layout:Object\\.assign\\(\\{[\\s\\S]{0,600}?\\},_ERAVAR\\)").test(TBC);
    assert.ok(def, id + ' does not take the shared variable-anchor block');
  }
});

/* ── ② the gap this round closes, measured rather than described ───────────────────────────────── */
test('R520 ②: the renderer’s own per-ring rule would have made ten times as many', () => {
  /* maplibre-gl, symbol_bucket addFeature: `for (const polygon of classifyRings(geometry, 0))` —
     one anchor per OUTER RING. That is the rule `source:'imtb-src'` was handing the labels. */
  const perRing = outerRings(FC);
  const perCountry = labelFC(FC).features.length;
  assert.ok(perRing > perCountry * 5,
    'the fixture no longer exhibits the defect (' + perRing + ' rings vs ' + perCountry + ' countries) — this check has stopped measuring anything');
  /* the two worst offenders in the report */
  const rings = (nm) => { const f = FC.features.find((g) => g.properties.NAME === nm);
    return f ? (f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length) : 0; };
  assert.ok(rings('Japan') > 10, 'Japan no longer has the archipelago that produced the thicket');
  assert.ok(rings('Korea') > 1, 'Korea no longer has the islands that produced the thicket');
});

/* ── ③ the structure: the labels have their own source, and it never falls behind ──────────────── */
test('R520 ③: neither name layer reads the border polygons any more', () => {
  for (const id of ['imtb-lbl', 'imtb-lbl2']) {
    const def = new RegExp("id:'" + id + "',type:'symbol',source:'([a-z0-9-]+)'").exec(TBC);
    assert.ok(def, id + ' is not declared as a symbol layer any more');
    assert.equal(def[1], 'imtb-lbl-src',
      id + " reads '" + def[1] + "' — a polygon source gives one label PER RING, which is the whole defect");
  }
  assert.ok(/addSource\('imtb-lbl-src'/.test(TBC), 'the point source is never created');
  /* it must be a point source built from the polygons, not a second fetch of the same data */
  assert.ok(/_labelFC\(fc\)|_labelFC\(/.test(TBC), 'the points are not derived from the polygons');
  assert.ok(/type:'Point'/.test(TBC), '_labelFC does not emit Point geometry');
});

test('R520 ③: every push of the borders pushes the names with them', () => {
  /* ⚠ THE FAILURE THIS GUARDS is silent: the borders move to 1914 and the names stay at 1939,
     because they are now two sources and only one of them was written. Each site that writes
     `imtb-src` — apply()'s two paths, clear(), the late-identity re-tag (#R410), the styledata
     rebuild (#R126/#R140) — must write the label source in the same statement list. */
  /* ⚠ COUNTING BOTH AND COMPARING THE TOTALS IS NOT THIS CLAIM: `_pushLbl` appears once as its own
     declaration, so a build that dropped the call from ONE site still counted high enough. Asked per
     site instead — every write of the polygons is followed, before the statement list moves on, by a
     write of the points. That also survives a new push site being added, which a named list would not. */
  const sites = [...TBC.matchAll(/setSourceData\('imtb-src'/g)].map((m) => m.index);
  assert.ok(sites.length >= 5, 'js/time-borders.js writes imtb-src at ' + sites.length + ' sites — fewer than the five this check was written against');
  const missed = sites.filter((i) => !/_pushLbl\(|setSourceData\('imtb-lbl-src'/.test(TBC.slice(i, i + 160)));
  assert.equal(missed.length, 0, missed.length + ' of the ' + sites.length +
    ' imtb-src writes do not push the names with them — those will keep showing the previous year: ' +
    missed.map((i) => JSON.stringify(TBC.slice(i, i + 60))).join(' / '));

  /* clear() must empty BOTH: an era name left over the present map is the same bug as an era border */
  const clr = /function clear\(\)\{[\s\S]*?_restoreBase\(\);/.exec(TBC);
  assert.ok(clr, 'clear() cannot be read');
  assert.ok(/setSourceData\('imtb-lbl-src',\{type:'FeatureCollection',features:\[\]\}\)/.test(clr[0]),
    'returning to Now empties the borders but leaves the era names on the map');
});

test('R520 ③: the anchor is cached on the geometry, so a decade of travel pays once', () => {
  /* `_csGeomOf` memoizes ONE geometry object per CShapes record, and travelling re-selects the same
     records year after year. Without the cache every year re-solves ~150 poles of inaccessibility. */
  assert.ok(/const _lblPt=\(typeof WeakMap!=='undefined'\)\?new WeakMap\(\):null/.test(TBC),
    'the anchor cache is gone — every year change would re-solve every country');
  const a = lift('_anchor');
  assert.ok(/_lblPt&&_lblPt\.has\(geom\)/.test(a) && /_lblPt\.set\(geom/.test(a),
    '_anchor no longer reads and writes that cache');

  /* …and it really is cached. ⚠ The measurement needs a geometry the cache has NEVER seen, which the
     snapshot above no longer offers — so Canada (268 rings) is deep-cloned into a fresh object. The
     first pass solves its pole, the second may only re-read it. */
  const canada = FC.features.find((f) => f.properties.NAME === 'Canada');
  const fresh = { type: 'FeatureCollection', features: [JSON.parse(JSON.stringify(canada))] };
  const t0 = process.hrtime.bigint(); const a1 = labelFC(fresh); const cold = Number(process.hrtime.bigint() - t0);
  const t1 = process.hrtime.bigint(); const a2 = labelFC(fresh); const warm = Number(process.hrtime.bigint() - t1);
  assert.deepEqual(a2.features[0].geometry.coordinates, a1.features[0].geometry.coordinates, 'the cached anchor is not the computed one');
  assert.ok(warm * 8 < cold, 'the second pass over the same geometry cost ' + warm + 'ns against ' + cold + 'ns — nothing was cached');
});
