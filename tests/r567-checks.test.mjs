/* ============================================================================
 *  R567 — the UNESCO World Heritage layer
 * ----------------------------------------------------------------------------
 *  「世界遺産をすべてマッピングしたレイヤーを作って。」
 *
 *  What these check is not that the file exists but that the CLAIMS the layer makes about it are
 *  ones the file can support: that «all of them» means the component parts and not the rows, that
 *  the properties nobody can place are counted rather than invented, that the in-danger flag is not
 *  the stale column upstream still publishes, and that the category vocabulary lives in the DATA
 *  and not in the code that draws it.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(readFileSync(join(ROOT, 'data', 'whc-sites.json'), 'utf8'));

/* every index in `points` is [siteIndex, lng, lat, countryIndex] */
const POINT_STRIDE = 4;
function pointsPerSite() {
  const n = new Array(doc.sites.length).fill(0);
  for (let i = 0; i < doc.points.length; i += POINT_STRIDE) n[doc.points[i]]++;
  return n;
}

test('R567 ① every index in the file resolves — a point belongs to a property, a property to a category', () => {
  assert.equal(doc.points.length % POINT_STRIDE, 0, 'the flat point array is not a whole number of points');
  assert.ok(doc.sites.length > 0 && doc.points.length > 0);
  for (let i = 0; i < doc.points.length; i += POINT_STRIDE) {
    const [si, lng, lat, ci] = doc.points.slice(i, i + POINT_STRIDE);
    assert.ok(doc.sites[si], `point ${i / POINT_STRIDE} names site index ${si}, which the file does not hold`);
    assert.ok(Number.isFinite(lng) && lng >= -180 && lng <= 180, `point ${i / POINT_STRIDE} longitude ${lng}`);
    assert.ok(Number.isFinite(lat) && lat >= -90 && lat <= 90, `point ${i / POINT_STRIDE} latitude ${lat}`);
    assert.ok(ci === -1 || doc.countries[ci], `point ${i / POINT_STRIDE} names country index ${ci}`);
  }
  for (const s of doc.sites) {
    assert.ok(doc.categories[s.c] != null, `property ${s.id} names category index ${s.c}`);
    for (const r of s.r) assert.ok(doc.regions[r] != null, `property ${s.id} names region index ${r}`);
    for (const c of s.s) assert.ok(doc.countries[c] != null, `property ${s.id} names country index ${c}`);
  }
});

test('R567 ② «すべて» is the component parts, not the rows — a serial property is drawn as all of them', () => {
  const per = pointsPerSite();
  const serial = per.filter((n) => n > 1).length;
  /* ⚠ NOT A PINNED NUMBER. The claim is structural: UNESCO publishes one coordinate per component
     part, so a build that read only the first <poi> of each row would leave `serial` at zero and
     `doc.points.length / 4` equal to the number of rows. Both of those are what this measures. */
  assert.ok(serial > 0, 'no property is drawn as more than one point — the component parts were dropped');
  assert.ok(doc.points.length / POINT_STRIDE > doc.sites.length,
    `${doc.points.length / POINT_STRIDE} points for ${doc.sites.length} properties — that is one pin per row`);
});

test('R567 ③ a property with no published coordinate is still in the file, counted, not invented', () => {
  const per = pointsPerSite();
  const undrawn = doc.sites.filter((_, i) => per[i] === 0);
  /* Measured 2026-09-09: three of them (1567, 72, 868). The test does not pin WHICH — upstream may
     publish a coordinate for any of them tomorrow, and that is a fix, not a regression. What it
     pins is that a property the map cannot draw is not deleted from the list it belongs to, and
     that nothing invented a coordinate to keep the point count tidy. */
  for (const s of undrawn) {
    assert.ok(s.n && s.n.en, `property ${s.id} has no coordinate AND no name — it was half-dropped`);
    assert.ok(doc.categories[s.c] != null, `property ${s.id} has no coordinate and no category`);
  }
  assert.equal(doc.sites.length, doc.sites.filter((s) => s.id > 0).length, 'a property lost its id');
});

test('R567 ④ every declared locale can name every property — the fallback is English, and it is present', () => {
  assert.ok(Array.isArray(doc.locales) && doc.locales.includes('en'), 'the file must declare English');
  for (const s of doc.sites) {
    assert.ok(s.n.en, `property ${s.id} has no English name, so no locale can fall back`);
    /* a name key the file does not declare as a locale is a name nothing will ever read */
    for (const k of Object.keys(s.n)) assert.ok(doc.locales.includes(k), `property ${s.id} carries a name under undeclared locale ${k}`);
  }
  /* the reverse of the probe: the panel builds whc.unesco.org URLs from this, so every locale needs one */
  for (const t of doc.locales) assert.ok(doc.localePath[t], `locale ${t} has no upstream path segment`);
});

test('R567 ⑤ one description file per declared locale, complete on its own', () => {
  for (const tag of doc.locales) {
    const p = join(ROOT, 'data', `whc-detail.${tag}.json.gz`);
    assert.ok(existsSync(p), `data/whc-detail.${tag}.json.gz is missing — the panel would fetch a 404`);
    const d = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));
    assert.equal(d.locale, tag, `data/whc-detail.${tag}.json.gz says it is ${d.locale}`);
    /* ⚠ COMPLETE ON ITS OWN is the property that makes a panel one fetch rather than two: where
       UNESCO publishes no translation the English text is written into that language's file. */
    for (const s of doc.sites) {
      const row = d.sites[String(s.id)];
      assert.ok(row, `${tag}: property ${s.id} has no row`);
      assert.equal(typeof row.st, 'string', `${tag}: property ${s.id} names no states party`);
    }
  }
});

test('R567 ⑥ the in-danger flag is not UNESCO’s own column, and the file can prove it', () => {
  const inDanger = doc.sites.filter((s) => s.d);
  assert.ok(inDanger.length > 0, 'nothing is in danger — the join failed and the layer would say the world is fine');
  assert.equal(doc.danger.count, inDanger.length, 'the file’s own danger count disagrees with its rows');
  assert.ok(doc.danger.attribution && doc.danger.attribution !== doc.attribution,
    'the danger status must credit the source that maintains it, not the one that does not');
  /* ⚠⚠⚠ THE MEASUREMENT THAT MAKES THIS A TEST AND NOT A WISH. The <danger> column in UNESCO's own
     XML has no entry newer than «Y 2014» — it is empty for Palmyra (2013), Sana'a (2015), Kyiv
     (2023) and Odesa (2023). So a build that went back to reading that column could not produce a
     single property whose danger listing began after 2014. One that does is proof the flag came
     from somewhere that maintains it. */
  const STALE_NEWEST = 2014;
  assert.ok(inDanger.some((s) => s.d > STALE_NEWEST),
    `no property is listed in danger after ${STALE_NEWEST} — that is exactly the shape of UNESCO’s abandoned column`);
});

test('R567 ⑦ the category vocabulary lives in the data — the code keys tables by it, never branches on it', () => {
  const src = readFileSync(join(ROOT, 'js', 'beta-overlays.js'), 'utf8');
  const ast = parse(src, { ecmaVersion: 2022, sourceType: 'module' });
  const terms = new Set(doc.categories);
  const bad = [];
  /* ⚠ A CATEGORY NAME IS ALLOWED TO APPEAR AS THE KEY OF A LOOKUP TABLE (the palette, the
     translated word) and NOWHERE ELSE. The moment one turns up in a comparison, a filter or a
     colour ladder, the drawing code has stopped reading `whsDoc.categories` and started knowing
     the answer — which is the shape #R515 made a standing rule about, and which would make a
     category UNESCO adds simply vanish from the map. */
  walk.ancestor(ast, {
    Literal(node, _state, ancestors) {
      if (typeof node.value !== 'string' || !terms.has(node.value)) return;
      const parent = ancestors[ancestors.length - 2];
      const asKey = parent && parent.type === 'Property' && parent.key === node && !parent.computed;
      /* …and as the ENGLISH MEMBER OF A TRANSLATION TUPLE: `LA('Cultural','文化遺産',…)` is the word
         the reader sees, keyed by the same term, which is the second half of the same table. What
         stays forbidden is the term in a comparison, a filter or a paint ladder. */
      const call = ancestors.slice().reverse().find((n) => n.type === 'CallExpression');
      const asText = !!(call && call.callee.type === 'Identifier' && /^LA?$/.test(call.callee.name)
        && call.arguments.indexOf(node) >= 0);
      if (!asKey && !asText) bad.push(`${node.value} at character ${node.start}`);
    },
  });
  assert.deepEqual(bad, [], 'a UNESCO category name is used as something other than a table key in js/beta-overlays.js');
});

test('R567 ⑨ «clear» resets the narrowing and lets the same call apply the rest', () => {
  /* ⚠ MEASURED IN THE BROWSER, NOT IMAGINED: `heritage.filter {clear:true, danger:true}` answered
     «6,009 shown» — every property — because the clear branch RETURNED. A caller that says «start
     over, then show me the ones in danger» is one call, and the reply it got was the opposite of
     what it asked for. `clear` is a starting point, not a terminator, and the shape that makes it
     one is that its branch falls through. */
  const src = readFileSync(join(ROOT, 'js', 'beta-overlays.js'), 'utf8');
  const ast = parse(src, { ecmaVersion: 2022, sourceType: 'module' });
  let found = 0;
  walk.simple(ast, {
    IfStatement(node) {
      const t = node.test;
      if (!(t.type === 'MemberExpression' && !t.computed && t.property.name === 'clear')) return;
      if (!/whsOff/.test(src.slice(node.start, node.end))) return;
      found++;
      let returns = 0;
      walk.simple(node.consequent, { ReturnStatement() { returns++; } });
      assert.equal(returns, 0, 'the clear branch returns, so anything else in the same call is dropped');
    },
  });
  assert.equal(found, 1, 'the World Heritage clear branch was not found — this check has lost its subject');
});

test('R567 ⑧ the layer is wired to the panel, the read-out and the kernel by the same id', () => {
  const beta = readFileSync(join(ROOT, 'js', 'beta-overlays.js'), 'utf8');
  const layers = readFileSync(join(ROOT, 'js', 'data-layers.js'), 'utf8');
  const mapui = readFileSync(join(ROOT, 'js', 'map-ui.js'), 'utf8');
  /* the checkbox the row builder makes, the shelf reorganiser's list, and the two kernel commands
     the legend buttons and Atlas both press — one id, four places, and a row that reaches none of
     the shelves falls into Others(beta) rather than failing (#R271), so the shelf is asserted. */
  assert.match(beta, /\['whs','#c9903a',whsToggle\]/, 'js/beta-overlays.js does not build the World Heritage row');
  assert.match(layers, /'lyrGrpSociety',\[[^\]]*'whs'/, 'the row is on no shelf — it would fall through to Others(beta)');
  for (const cmd of ['heritage.open', 'heritage.filter']) {
    assert.ok(beta.includes(`OS2.register('${cmd}'`), `js/beta-overlays.js does not register ${cmd}`);
  }
  assert.match(mapui, /register\('heritage'/, 'js/map-ui.js does not register the layer for the in-view read-out');
  /* the source it registers must be the source the layer actually creates */
  assert.match(mapui, /_srcFeatsIn\('whs-src'/, 'the read-out names a source the layer does not create');
  assert.match(beta, /addSource\('whs-src'/, 'the layer does not create whs-src');
});
