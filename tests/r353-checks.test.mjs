/* ============================================================================
 *  #R353 — Volcano Intelligence: the bundled record, the joins, and the two feed parsers
 * ----------------------------------------------------------------------------
 *  「現在はGVPの完新世火山1,215座を全部入れてありますが、視覚上の主要分類は「1950年以降」
 *   「1500年以降」「古い／不明」です。ここは恐ろしく深くできます。」
 *
 *  What a failure here means, in order of severity:
 *    · ④/⑤ a join table naming a GVP number the catalog does not have = a country's alert levels,
 *      or a survey's hazard zones, silently attach to nothing and the map draws grey for them
 *    · ⑥/⑦ a feed parser that stops reading its upstream = the live rungs of the status ladder go
 *      quiet while the UI keeps saying "reading…" — the shape #R209 exists to prevent
 *    · ①–③ the bundled record losing its join key or its ordering = every card is wrong at once
 *    · ⑧ the count written into prose again = a label that disagrees with the file it describes
 *    · ⑨ the modules falling back into the eager bundle = every session pays for a card most
 *      readers never open
 *
 *  ⚠ ⑥ and ⑦ run against supabase/functions/_shared/volcano-parse.js — the code the EDGE FUNCTION
 *  runs — over answers captured from both upstreams (tests/fixtures/). A regex scraper of somebody
 *  else's feed is exactly the kind of code that gets believed instead of tested.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* ⚠ #R317: read source text through readLF so a CRLF working copy cannot make a source check
   permanently red on Windows and permanently green on CI. */
const { readLF } = await import('../scripts/eol.mjs');
const { lazyModules } = await import('./app-source.mjs');
const { parseWeekly, parseAsh } = await import('../supabase/functions/_shared/volcano-parse.js');

const LAYER = JSON.parse(readFileSync(join(ROOT, 'data', 'volcanoes_gvp.json'), 'utf8'));
const DETAIL = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'volcano-detail.json.gz'))).toString('utf8'));
const INTEL = readLF(join(ROOT, 'js', 'volcano-intel.js'));
const LAYERS = readLF(join(ROOT, 'js', 'volcano-layers.js'));
const BETA = readLF(join(ROOT, 'js', 'beta-overlays.js'));

/* ── ① the layer file carries the JOIN KEY, which is the whole point of the rebuild ── */
test('① every volcano in the layer file has a GVP number, a position, and the new measured fields', () => {
  assert.ok(Array.isArray(LAYER.features) && LAYER.features.length > 1000, 'the catalog is not there');
  assert.ok(Array.isArray(LAYER.rocks) && LAYER.rocks.length >= 8, 'the rock-type vocabulary is missing');
  assert.ok(Array.isArray(LAYER.settings) && LAYER.settings.length >= 8, 'the tectonic vocabulary is missing');

  const seen = new Set();
  for (const f of LAYER.features) {
    const p = f.properties;
    assert.equal(typeof p.v, 'number', 'a feature has no GVP volcano number');
    assert.ok(Number.isInteger(p.v) && p.v > 0, 'volcano number ' + p.v + ' is not a positive integer');
    assert.equal(seen.has(p.v), false, 'volcano number ' + p.v + ' appears twice');
    seen.add(p.v);
    const [lng, lat] = f.geometry.coordinates;
    assert.ok(lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90, p.n + ' is off the Earth');
    assert.ok(typeof p.n === 'string' && p.n.length, 'a feature has no name');
    /* the four fields the colour modes read. null is allowed — "no figure published" is a state the
       legend draws — but the KEY must be there, because `coalesce(get(x), …)` is what makes the
       missing case a distinct colour instead of an accidental one. */
    for (const k of ['x', 'q', 'p', 'k', 's', 'y', 'e']) assert.ok(k in p, p.n + ' has no `' + k + '`');
    if (p.x != null) assert.ok(p.x >= 0 && p.x <= 8, p.n + ' has VEI ' + p.x);
    if (p.k != null) assert.ok(LAYER.rocks[p.k] != null, p.n + ' points at rock index ' + p.k);
    if (p.s != null) assert.ok(LAYER.settings[p.s] != null, p.n + ' points at setting index ' + p.s);
  }
});

/* ── ② the detail file covers the SAME volcanoes, and its eruption rows keep their documented shape ── */
test('② the detail record covers every volcano and its eruption rows are the documented twelve fields', () => {
  const keys = Object.keys(DETAIL.volcanoes);
  assert.equal(keys.length, LAYER.features.length, 'the two files describe different catalogs');
  assert.ok(Array.isArray(DETAIL.vocab.evidence) && DETAIL.vocab.evidence.length > 10, 'no evidence vocabulary');

  let eruptions = 0, withVei = 0;
  for (const f of LAYER.features) {
    const d = DETAIL.volcanoes[String(f.properties.v)];
    assert.ok(d, f.properties.n + ' (' + f.properties.v + ') has no detail record');
    assert.ok(Array.isArray(d.p) && d.p.length === 4, f.properties.n + ' has no four population radii');
    assert.ok(Array.isArray(d.er), f.properties.n + ' has no eruption array');
    for (const r of d.er) {
      assert.equal(r.length, 12, 'an eruption row of ' + f.properties.n + ' is not 12 fields');
      assert.ok(r[9] === 0 || r[9] === 1, 'confirmed flag is not 0/1');
      if (r[7] != null) { assert.ok(r[7] >= 0 && r[7] <= 8, 'VEI ' + r[7]); withVei++; }
      if (r[10] != null) assert.ok(DETAIL.vocab.evidence[r[10]] != null, 'evidence index ' + r[10] + ' is out of range');
      eruptions++;
    }
  }
  assert.ok(eruptions > 10000, 'only ' + eruptions + ' eruptions — the history did not come through');
  assert.ok(withVei > 7000, 'only ' + withVei + ' eruptions carry a VEI');
});

/* ── ③ the history is newest-first, and the layer's summary numbers agree with it ──
   The card prints d.er in file order; if the build ever stopped sorting, «most recent first» would
   silently become «in whatever order the WFS returned», which no reader could detect. */
test('③ each history is newest-first and the layer file agrees with it on max VEI and eruption count', () => {
  let checked = 0;
  for (const f of LAYER.features) {
    const d = DETAIL.volcanoes[String(f.properties.v)];
    let prev = Infinity;
    for (const r of d.er) {
      const y = r[1] == null ? -1e9 : r[1];
      assert.ok(y <= prev, f.properties.n + ' is not sorted newest-first');
      prev = y;
    }
    const confirmed = d.er.filter((r) => r[9] === 1);
    assert.equal(f.properties.q, confirmed.length, f.properties.n + ' disagrees on the eruption count');
    const veis = d.er.map((r) => r[7]).filter((v) => v != null);
    assert.equal(f.properties.x, veis.length ? Math.max(...veis) : null, f.properties.n + ' disagrees on max VEI');
    checked++;
  }
  assert.ok(checked > 1000);
});

/* ── ④ JMA's warning units all resolve to a Japanese volcano that EXISTS ──
   JMA names its unit in Japanese and gives it a JMA code; nothing in either feed carries a GVP
   number, so this hand-built table is the join. A catalog revision that retires a number must fail
   the build here, not silently drop Japan's alert levels off the map. */
test('④ every GVP number in the JMA join table is a Japanese volcano in the catalog', () => {
  const src = INTEL.slice(INTEL.indexOf('const JMA_TO_GVP={'), INTEL.indexOf('};', INTEL.indexOf('const JMA_TO_GVP={')));
  const pairs = [...src.matchAll(/'([^']+)':(\d+)/g)];
  assert.ok(pairs.length >= 60, 'only ' + pairs.length + ' JMA rows — the table shrank');

  const byNum = new Map(LAYER.features.map((f) => [f.properties.v, f.properties]));
  for (const [, name, num] of pairs) {
    const p = byNum.get(+num);
    assert.ok(p, 'JMA unit ' + name + ' points at GVP ' + num + ', which is not in the catalog');
    assert.equal(p.c, 'Japan', 'JMA unit ' + name + ' points at ' + p.n + ', which is in ' + p.c);
  }
  /* many-to-one is DELIBERATE (桜島 and 若尊 are both Aira) — assert it is still possible rather
     than asserting uniqueness, so a future round cannot "fix" it into a wrong one-to-one. */
  const nums = pairs.map(([, , n]) => n);
  assert.ok(new Set(nums).size < nums.length, 'no JMA unit shares a GVP volcano — the many-to-one join was lost');
});

/* ── ⑤ …and the same for the USGS hazard zones ── */
test('⑤ every GVP number in the USGS hazard-zone table is a US volcano in the catalog', () => {
  const src = LAYERS.slice(LAYERS.indexOf('const HAZ_TO_GVP={'), LAYERS.indexOf('};', LAYERS.indexOf('const HAZ_TO_GVP={')));
  const pairs = [...src.matchAll(/'([^']+)':(\d+)/g)];
  assert.equal(pairs.length, 7, 'the USGS service publishes seven volcanic centres');
  const byNum = new Map(LAYER.features.map((f) => [f.properties.v, f.properties]));
  for (const [, name, num] of pairs) {
    const p = byNum.get(+num);
    assert.ok(p, 'hazard zone ' + name + ' points at GVP ' + num + ', which is not in the catalog');
    assert.equal(p.c, 'United States', 'hazard zone ' + name + ' points at ' + p.n + ' in ' + p.c);
  }
});

/* ── ⑥ the weekly-report parser reads the JOIN KEY out of <guid>, and drops what it cannot join ── */
test('⑥ parseWeekly reads the GVP number out of <guid> and refuses an item without one', () => {
  const xml = readFileSync(join(ROOT, 'tests', 'fixtures', 'volcano-weekly.xml'), 'latin1');
  const rows = parseWeekly(xml);
  assert.ok(rows.length >= 10, 'only ' + rows.length + ' weekly rows parsed');
  for (const r of rows) {
    assert.ok(Number.isInteger(r.v) && r.v > 100000, 'a row has no GVP volcano number');
    assert.ok(typeof r.name === 'string' && r.name.length, 'a row has no volcano name');
    assert.ok(!/[<>]/.test(r.text), 'the narrative still carries markup');
  }
  /* the title is «Name (Country) - Report for … - Status»; the country must not end up in the name */
  const named = rows.find((r) => r.country);
  assert.ok(named, 'no row carried a country');
  assert.ok(!named.name.includes('('), 'the country leaked into the volcano name');

  /* ⚠ THE JOIN KEY IS THE ONE REQUIRED FIELD. An item that loses its guid is dropped, because a
     weekly report this map cannot attach to a volcano is not something it can place. */
  assert.equal(parseWeekly(xml.replace(/#vn_\d+/g, '#nope')).length, 0);
  assert.equal(parseWeekly('').length, 0);
  assert.equal(parseWeekly(null).length, 0);
});

/* ── ⑦ the ash parser keeps only volcanic ash, keeps its flight levels, and counts what it read ── */
test('⑦ parseAsh keeps only hazard VA, preserves the flight-level band, and reports how many it read', () => {
  const raw = readFileSync(join(ROOT, 'tests', 'fixtures', 'volcano-isigmet.json'), 'utf8');
  const all = JSON.parse(raw);
  const a = parseAsh(raw);

  assert.equal(a.read, all.length, '`read` must count every SIGMET, not just the ash ones');
  assert.equal(a.areas.length, all.filter((s) => s.hazard === 'VA' && Array.isArray(s.coords) && s.coords.length >= 3).length);
  assert.ok(a.areas.length > 0, 'the fixture was captured with no volcanic-ash SIGMET in it');
  assert.ok(a.areas.length < a.read, 'everything was kept — the VA filter is not filtering');

  for (const z of a.areas) {
    assert.ok(Array.isArray(z.coords) && z.coords.length >= 3, 'an ash area has no ring');
    for (const [lng, lat] of z.coords) {
      assert.equal(typeof lng, 'number'); assert.equal(typeof lat, 'number');
      assert.ok(lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90, 'ash vertex off the Earth');
    }
    /* the altitude band is the reason this feed is used at all */
    assert.ok(z.top == null || typeof z.top === 'number', 'top is not a number');
    assert.ok(z.base == null || typeof z.base === 'number', 'base is not a number');
  }
  /* ⚠ ZERO ASH AREAS IS A VALID ANSWER; an unreadable feed is not the same thing. */
  const empty = parseAsh('[]');
  assert.equal(empty.read, 0);
  assert.deepEqual(empty.areas, []);
  assert.throws(() => parseAsh('{"not":"an array"}'));
});

/* ── ⑧ the catalog count is READ, never written into prose ──
   It said «1,215» in the layer row in five languages while the catalog held 1,214. A number written
   down in six places is a number that will disagree with itself. */
test('⑧ no file writes the volcano count as a literal', () => {
  const files = { 'js/beta-overlays.js': BETA, 'js/volcano-intel.js': INTEL, 'js/volcano-layers.js': LAYERS };
  for (const [name, src] of Object.entries(files)) {
    /* the header comments describe the round and may cite the measurement; the check is on CODE, so
       strip block comments first and then look for a count literal next to a volcano word. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/1[,.]?215/.test(code), false, name + ' still writes 1,215 as a count');
    assert.equal(/1[,.]?214/.test(code), false, name + ' hardcodes the current count — read it from the file');
  }
  /* …and the legend really does read it */
  assert.ok(/volcFC\s*\?\s*volcFC\.features\.length/.test(BETA), 'the legend no longer reads the count from the file');
});

/* ── ⑨ both modules are LOAD-ON-DEMAND, and the loader knows how to publish them ──
   Derived from js/lazy-modules.js's own tables (tests/app-source.mjs), never from a list here. */
test('⑨ volcanoIntel and volcanoLayers are lazy, with a file, a factory and a published global', () => {
  const mods = lazyModules(new URL('../', import.meta.url));
  const byName = new Map(mods.map((m) => [m.name, m]));
  for (const [name, file, global] of [
    ['volcanoIntel', 'js/volcano-intel.js', 'IntMapVolcano'],
    ['volcanoLayers', 'js/volcano-layers.js', 'IntMapVolcanoLayers'],
  ]) {
    const m = byName.get(name);
    assert.ok(m, name + ' is not in the lazy loader');
    assert.equal(m.file, file, name + ' points at ' + m.file);
    assert.equal(m.global, global, name + ' publishes ' + m.global);
    assert.equal(m.factory, true, name + ' has no mount call');
  }
  /* ⚠ AND THEY MUST NOT ALSO BE EAGER. #R340 found the opposite check («git grep says nothing
     imports it») resting on a premise that was not true; this asserts the entry graph directly. */
  const main = readLF(join(ROOT, 'src', 'main.js'));
  const imports = main.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/import\s+'\.\.\/js\/volcano-intel\.js'/.test(imports), false, 'volcano-intel is imported eagerly');
  assert.equal(/import\s+'\.\.\/js\/volcano-layers\.js'/.test(imports), false, 'volcano-layers is imported eagerly');
  assert.ok(/'volcanoIntel'/.test(main) && /'volcanoLayers'/.test(main), 'the boot guard does not know them');
});

/* ── ⑩ the relay is declared, bounded, and reads only the two feeds that need relaying ── */
test('⑩ volcano-feed is declared, guarded, and relays exactly the two CORS-less upstreams', () => {
  const cfg = readLF(join(ROOT, 'supabase', 'config.toml'));
  assert.ok(/\[functions\.volcano-feed\]/.test(cfg), 'volcano-feed is not declared in supabase/config.toml');
  assert.ok(/\[functions\.volcano-feed\][\s\S]*?verify_jwt\s*=\s*false/.test(cfg), 'volcano-feed must be keyless');

  const fn = readLF(join(ROOT, 'supabase', 'functions', 'volcano-feed', 'index.ts'));
  assert.ok(/from "\.\.\/_shared\/relay-guard\.js"/.test(fn), 'the relay does not use the shared guard');
  assert.ok(/fetchGuarded\(/.test(fn), 'the upstream fetch is not bounded');
  assert.ok(/relayFail\(/.test(fn), 'the error path may leak the exception');
  /* exactly two upstream hosts, as string constants — a pattern is how a relay becomes a proxy */
  const hosts = [...fn.matchAll(/https:\/\/([a-z0-9.-]+)\//g)].map((m) => m[1])
    .filter((h) => h !== 'github.com');
  assert.deepEqual([...new Set(hosts)].sort(), ['aviationweather.gov', 'volcano.si.edu']);

  /* ⚠ the four sources that DO send CORS must not be relayed — a relay that is not needed is one
     more thing to be down (#R266). They are fetched by the page; assert they are not in the relay's
     CODE. ⚠ Comments are stripped first: the function's header carries the measurement table that
     NAMES all six upstreams and says which of them sends the header, and reading that as "it fetches
     them" would make the check fail for saying the right thing. */
  const fnCode = fn.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  for (const direct of ['volcanoes.usgs.gov', 'www.jma.go.jp', 'services.arcgis.com', 'earthquake.usgs.gov']) {
    assert.equal(fnCode.includes(direct), false, direct + ' is relayed although it answers with CORS');
  }
  for (const direct of ['volcanoes.usgs.gov/hans-public', 'www.jma.go.jp/bosai/volcano', 'earthquake.usgs.gov/fdsnws']) {
    assert.ok(INTEL.includes(direct), direct + ' is no longer read by the page');
  }
});

/* ── ⑪ the panel never draws a hazard reach it did not read ──
   The round's instruction was: hazard zones only where a survey publishes GIS, and an explicit
   absence everywhere else. This is a weak, source-level assertion — it cannot prove intent — but it
   catches the one shape that would break the promise: a radius drawn around a volcano. */
test('⑪ nothing in the volcano modules draws a modelled hazard radius', () => {
  const code = (LAYERS + INTEL).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const shape of ['circle-radius-km', 'hazardCircle', 'reachKm', 'modelledZone']) {
    assert.equal(code.includes(shape), false, 'a modelled hazard shape (' + shape + ') appeared');
  }
  /* the absence is SAID — the string the card prints when nothing is published must still be there */
  assert.ok(/No machine-readable hazard-zone GIS is published/.test(INTEL),
    'the card no longer says that no hazard data is published');
  assert.ok(/hazardFor/.test(LAYERS) && /hazardFor/.test(INTEL),
    'the card no longer asks which hazard zones exist');
});

/* ── ⑬ every zoom-driven paint value is a TOP-LEVEL interpolate ──
   MapLibre requires it and does NOT throw when it is missing — addLayer validates, fires an
   ErrorEvent and skips the layer, so the failure looks exactly like a layer nobody switched on.
   `['*', 2.6, <zoom interpolate>]` cost `volc2-halo` its whole existence and every browser test
   still passed. This is the cheap half of the guard; tests/r353.spec.js ② asks the RENDERER, which
   is the half that actually proves it. */
test('⑬ no volcano paint value wraps a zoom expression inside another expression', () => {
  const block = BETA.slice(BETA.indexOf('const VL_IDS='), BETA.indexOf('function volcToggle'));
  assert.ok(block.length > 1000, 'the volcano block moved — this check no longer reads it');
  /* every `['zoom']` in the block must be preceded by `['interpolate',['linear'],` or `['step',` —
     i.e. it is the INPUT of a top-level curve, never an argument of an arithmetic operator. */
  let n = 0;
  for (const m of block.matchAll(/\[\s*'zoom'\s*\]/g)) {
    const before = block.slice(Math.max(0, m.index - 60), m.index).replace(/\s+/g, '');
    assert.ok(/\['interpolate',\['linear'\],$|\['step',$/.test(before),
      'a zoom expression is nested inside another expression: …' + before.slice(-40));
    n++;
  }
  assert.ok(n >= 2, 'only ' + n + ' zoom expressions found — the radius ramps are gone');
  /* …and the two radius ramps are their own top-level interpolates, not multiples of one another */
  for (const name of ['volcRadius', 'volcHaloRadius']) {
    const i = block.indexOf('const ' + name + '=');
    assert.ok(i >= 0, name + ' is gone');
    assert.ok(block.slice(i).replace(/\s+/g, '').startsWith('const' + name + "=['interpolate',"),
      name + ' is not a top-level interpolate');
  }
  assert.equal(/circle-radius':\s*\['\*'/.test(block), false,
    'a circle-radius multiplies a ramp instead of being one');
});

/* ── ⑫ the status ladder never merges two agencies into one number on screen ──
   ①②③ are different instruments of different agencies. `rank` exists only so the MAP can sort
   colours; the panel must print the agency's own words with the agency's name against them. */
test('⑫ the status ladder keeps each agency\'s own vocabulary', () => {
  assert.ok(/tier:1/.test(INTEL) && /tier:2/.test(INTEL) && /tier:3/.test(INTEL) && /tier:0/.test(INTEL),
    'the four rungs are gone');
  /* every rung that reports something must carry a source, and the ⓪ rung must carry none */
  const statusFn = INTEL.slice(INTEL.indexOf('function status(vn){'), INTEL.indexOf('/* every volcano the three feeds'));
  assert.ok(statusFn.length > 200, 'status() moved — this check no longer reads it');
  assert.equal((statusFn.match(/source:/g) || []).length, 4, 'a rung reports without naming its source');
  assert.ok(/tier:0,\s*rank:null/.test(statusFn.replace(/\s+/g, ' ')),
    'the "nothing published" rung has a rank — it would be drawn as a level');
});
