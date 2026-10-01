/* ============================================================================
 *  VOLCANOES — the bundled GVP record, the agency joins and the volcano modules
 * ----------------------------------------------------------------------------
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *  The doc-facts mutation test (#R353 ⑮, about two minutes) is in hazard-volcano-doc-facts-checks.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The bundled record and the relay parsers are run; what
 *    is read is the lazy-module wiring and the shipped strings, which are claims about the text.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { LAZY_NAMES } from '../js/lazy-modules.js';
import { readLF } from '../scripts/eol.mjs';
import { importModule } from './helpers/import-module.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r353-checks.test.mjs (tests #1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13, #15 of 15) ═══
    #R353 — Volcano Intelligence: the bundled record, the joins, and the two feed parsers
    「現在はGVPの完新世火山1,215座を全部入れてありますが、視覚上の主要分類は「1950年以降」
     「1500年以降」「古い／不明」です。ここは恐ろしく深くできます。」

    What a failure here means, in order of severity:
      · ④/⑤ a join table naming a GVP number the catalog does not have = a country's alert levels,
        or a survey's hazard zones, silently attach to nothing and the map draws grey for them
      · ⑥/⑦ a feed parser that stops reading its upstream = the live rungs of the status ladder go
        quiet while the UI keeps saying "reading…" — the shape #R209 exists to prevent
      · ①–③ the bundled record losing its join key or its ordering = every card is wrong at once
      · ⑧/⑭ the count written into prose again = a label that disagrees with the file it describes
      · ⑨ the modules falling back into the eager bundle = every session pays for a card most
        readers never open

    ⚠ (#R440) ⑧ AND ⑭ GUARD TWO DIFFERENT NUMBERS AND SWEEP DIFFERENTLY. ⑧ is the VOLCANO count and
    reads CODE — it strips block comments, because a header may cite the measurement. ⑭ is the
    ERUPTION count and does not strip anything, because all four places that number was written
    down were block comments, and the six languages that stated it on sources.html are locale files
    ⑧ never opened. ⑮ then proves the document half of the same guard actually goes red.

    ⚠ ⑥ and ⑦ run against supabase/functions/_shared/volcano-parse.js — the code the EDGE FUNCTION
    runs — over answers captured from both upstreams (tests/fixtures/). A regex scraper of somebody
    else's feed is exactly the kind of code that gets believed instead of tested. */
{
/* ⚠ #R317: read source text through readLF so a CRLF working copy cannot make a source check
   permanently red on Windows and permanently green on CI. */
const { readLF } = await import('../scripts/eol.mjs');
const { lazyModules } = await import('./app-source.mjs');
const { parseWeekly, parseAsh } = await import('../supabase/functions/_shared/volcano-parse.js');

const LAYER = JSON.parse(readLF(join(ROOT, 'data', 'volcanoes_gvp.json')));
const DETAIL = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'volcano-detail.json.gz'))).toString('utf8'));
const INTEL = readLF(join(ROOT, 'js', 'volcano-intel.js'));
const LAYERS = readLF(join(ROOT, 'js', 'volcano-layers.js'));
const BETA = readLF(join(ROOT, 'js', 'beta-overlays.js'));

/* ── ① the layer file carries the JOIN KEY, which is the whole point of the rebuild ── */
test('#R353 ① every volcano in the layer file has a GVP number, a position, and the new measured fields', () => {
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
test('#R353 ② the detail record covers every volcano and its eruption rows are the documented twelve fields', () => {
  const keys = Object.keys(DETAIL.volcanoes);
  assert.equal(keys.length, LAYER.features.length, 'the two files describe different catalogs');
  assert.ok(Array.isArray(DETAIL.vocab.evidence) && DETAIL.vocab.evidence.length > 10, 'no evidence vocabulary');

  let eruptions = 0, withVei = 0, confirmed = 0;
  for (const f of LAYER.features) {
    const d = DETAIL.volcanoes[String(f.properties.v)];
    assert.ok(d, f.properties.n + ' (' + f.properties.v + ') has no detail record');
    assert.ok(Array.isArray(d.p) && d.p.length === 4, f.properties.n + ' has no four population radii');
    assert.ok(Array.isArray(d.er), f.properties.n + ' has no eruption array');
    for (const r of d.er) {
      assert.equal(r.length, 12, 'an eruption row of ' + f.properties.n + ' is not 12 fields');
      assert.ok(r[9] === 0 || r[9] === 1, 'confirmed flag is not 0/1');
      if (r[9] === 1) confirmed++;
      if (r[7] != null) { assert.ok(r[7] >= 0 && r[7] <= 8, 'VEI ' + r[7]); withVei++; }
      if (r[10] != null) assert.ok(DETAIL.vocab.evidence[r[10]] != null, 'evidence index ' + r[10] + ' is out of range');
      eruptions++;
    }
  }
  /* ⚠ #R440: THIS USED TO BE `eruptions > 10000` AND `withVei > 7000`, AND THAT IS WHY THE FILE
     COULD SIT 46 ROWS UNDER WHAT SIX SHIPPED LANGUAGES AND FOUR DOCUMENTS SAID IT HELD. A floor
     passes for 11,043 and for 11,089 alike, so it could not see the gap it was the only check
     positioned to see. Every assertion below is an EQUALITY against something measured elsewhere. */

  /* ① the file states its own size, and the walk agrees with it (scripts/build-volcanoes.mjs
     counts these in the loop that writes the records, not over the upstream response) */
  assert.equal(typeof DETAIL.eruptions, 'number', 'the detail file does not state how many eruptions it holds');
  assert.equal(typeof DETAIL.eruptionsWithVei, 'number', 'the detail file does not state how many carry a VEI');
  assert.equal(eruptions, DETAIL.eruptions,
    'the file says it holds ' + DETAIL.eruptions + ' eruptions and holds ' + eruptions);
  assert.equal(withVei, DETAIL.eruptionsWithVei,
    'the file says ' + DETAIL.eruptionsWithVei + ' eruptions carry a VEI and ' + withVei + ' do');

  /* ② the two bundled files agree on the size of the record. `q` is written from the layer side,
     the rows from the detail side; a build that dropped rows from one would part them. */
  const q = LAYER.features.reduce((s, f) => s + f.properties.q, 0);
  assert.equal(confirmed, q, 'the layer counts ' + q + ' confirmed eruptions, the detail record holds ' + confirmed);

  /* ③ …and the history really came through. The three equalities above are all self-consistent at
     zero, so this one asks an INDEPENDENT upstream field: `y` is Last_Eruption_Year from the
     VOLCANO feature type, and a volcano that GVP dates a last eruption for must have a row for it.
     If the eruption feature type ever answers with nothing, 848 volcanoes go red here at once. */
  const dated = LAYER.features.filter((f) => f.properties.y != null);
  const silent = dated.filter((f) => DETAIL.volcanoes[String(f.properties.v)].er.length === 0);
  assert.equal(silent.length, 0, silent.length + ' volcanoes have a last-eruption year and no eruption row'
    + (silent.length ? ' — e.g. ' + silent[0].properties.n : ''));
  assert.ok(dated.length > 0, 'no volcano in the layer carries a last-eruption year');
});

/* ── ③ the history is newest-first, and the layer's summary numbers agree with it ──
   The card prints d.er in file order; if the build ever stopped sorting, «most recent first» would
   silently become «in whatever order the WFS returned», which no reader could detect. */
test('#R353 ③ each history is newest-first and the layer file agrees with it on max VEI and eruption count', () => {
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
test('#R353 ④ every GVP number in the JMA join table is a Japanese volcano in the catalog', () => {
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
test('#R353 ⑤ every GVP number in the USGS hazard-zone table is a US volcano in the catalog', () => {
  const src = LAYERS.slice(LAYERS.indexOf('const HAZ_TO_GVP={'), LAYERS.indexOf('};', LAYERS.indexOf('const HAZ_TO_GVP={')));
  /* ⚠ (#R432) A ZONE MAY NAME MORE THAN ONE VOLCANO NOW. «Long Valley Volcanic Region» covers the
     caldera (GVP 323822, which this map carries since #R432) and the Mono-Inyo chain (323120)
     alike; the entry is an array, and every number in it still has to be a US volcano here. */
  const pairs = [...src.matchAll(/'([^']+)':(\[[^\]]*\]|\d+)/g)]
    .map(([, name, nums]) => [name, [...nums.matchAll(/\d+/g)].map((m) => +m[0])]);
  assert.equal(pairs.length, 7, 'the USGS service publishes seven volcanic centres');
  const byNum = new Map(LAYER.features.map((f) => [f.properties.v, f.properties]));
  for (const [name, nums] of pairs) {
    assert.ok(nums.length > 0, 'hazard zone ' + name + ' points at no volcano at all');
    for (const num of nums) {
      const p = byNum.get(num);
      assert.ok(p, 'hazard zone ' + name + ' points at GVP ' + num + ', which is not in the catalog');
      assert.equal(p.c, 'United States', 'hazard zone ' + name + ' points at ' + p.n + ' in ' + p.c);
    }
  }
});

/* ── ⑥ the weekly-report parser reads the JOIN KEY out of <guid>, and drops what it cannot join ── */
test('#R353 ⑥ parseWeekly reads the GVP number out of <guid> and refuses an item without one', () => {
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
test('#R353 ⑦ parseAsh keeps only hazard VA, preserves the flight-level band, and reports how many it read', () => {
  const raw = readLF(join(ROOT, 'tests', 'fixtures', 'volcano-isigmet.json'));
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
/* ⚠⚠⚠ (#R432) THE GATE WAS NARROWER THAN THE RULE IT ENFORCES. It scanned three files, and the
   count was written down in a fourth: js/atlas-catalog-text.js said «the Smithsonian GVP Holocene
   catalog, 1,214 of them» in the SYS text sent to Atlas on every turn — a shipped string, outside
   the scan, stale the moment the catalog grew. A gate that watches three of the four places a fact
   lives reports green about the one it cannot see ([[intmap-recurring-lessons]]). */
test('#R353 ⑧ no file writes the volcano count as a literal', () => {
  const files = { 'js/beta-overlays.js': BETA, 'js/volcano-intel.js': INTEL, 'js/volcano-layers.js': LAYERS,
    'js/atlas-catalog-text.js': readLF(join(ROOT, 'js', 'atlas-catalog-text.js')),
    'js/atlas-capabilities.js': readLF(join(ROOT, 'js', 'atlas-capabilities.js')),
    'js/atlas-controls.js': readLF(join(ROOT, 'js', 'atlas-controls.js')) };
  for (const [name, src] of Object.entries(files)) {
    /* the header comments describe the round and may cite the measurement; the check is on CODE, so
       strip block comments first and then look for a count literal next to a volcano word. */
    const code = codeOnly(src);
    assert.equal(/1[,.]?215/.test(code), false, name + ' still writes 1,215 as a count');
    assert.equal(/1[,.]?214/.test(code), false, name + ' hardcodes the Holocene count — read it from the file');
    assert.equal(/1[,.]?218/.test(code), false, name + ' hardcodes the current total — read it from the file');
  }
  /* …and the legend really does read it */
  assert.ok(/volcFC\s*\?\s*volcFC\.features\.length/.test(BETA), 'the legend no longer reads the count from the file');
});

/* ── ⑨ both modules are LOAD-ON-DEMAND, and the loader knows how to publish them ──
   Derived from js/lazy-modules.js's own tables (tests/app-source.mjs), never from a list here. */
test('#R353 ⑨ volcanoIntel and volcanoLayers are lazy, with a file, a factory and a published global', () => {
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
  const imports = codeOnly(main);
  assert.equal(/import\s+'\.\.\/js\/volcano-intel\.js'/.test(imports), false, 'volcano-intel is imported eagerly');
  assert.equal(/import\s+'\.\.\/js\/volcano-layers\.js'/.test(imports), false, 'volcano-layers is imported eagerly');
  assert.ok(LAZY_NAMES.includes('volcanoIntel') && LAZY_NAMES.includes('volcanoLayers'), 'the boot guard does not know them (its list is the registry\'s — #R798)');
});

/* ── ⑩ the relay is declared, bounded, and reads only the two feeds that need relaying ── */
test('#R353 ⑩ volcano-feed is declared, guarded, and relays exactly the two CORS-less upstreams', () => {
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
  const fnCode = codeOnly(fn);
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
test('#R353 ⑪ nothing in the volcano modules draws a modelled hazard radius', () => {
  const code = codeOnly(LAYERS + INTEL);
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
test('#R353 ⑬ no volcano paint value wraps a zoom expression inside another expression', () => {
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

/* ── ⑭ the ERUPTION count is read too, and the sweep does not stop at code (#R440) ──
   ⑧ was written for the volcano count and it works: it strips block comments and looks for a
   literal in CODE. That shape could not see this one. All four places the eruption count was
   written into a shipped module were BLOCK COMMENTS, and the six languages that stated it on
   sources.html are locale files ⑧ never opened. The count itself came from the build's own
   completion line, which printed the upstream response's length and called it «wrote … eruptions»,
   so every copy of it was 46 rows too large from the day it was written.

   So this one reads the number FROM the file, sweeps the shipped modules WITHOUT stripping
   comments, and reads the sources-page row in every language the directory holds. */
test('#R353 ⑭ the eruption count is never written down — not in a comment, not in a shipped string', () => {
  const n = DETAIL.eruptions;
  assert.equal(Number.isInteger(n) && n > 0, true, 'the detail file states no eruption total');
  /* «11,043» / «11.043» / «11 043» / «11043» — built from the measurement, never typed here */
  const groups = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').split(' ');
  const SEP = '[,.\\u00a0\\u202f ]?';
  const CURRENT = new RegExp('(?<![\\d])' + groups.join(SEP) + '(?![\\d])');
  /* …and the exact number this round found in fourteen places, which is the UPSTREAM total and was
     never the file's. It is a historical constant, so it is safe to name: it can only come back by
     somebody copying it back out of the WFS row again. */
  const UPSTREAM = new RegExp('(?<![\\d])11' + SEP + '089(?![\\d])');

  const MODULES = {
    'js/beta-overlays.js': BETA, 'js/volcano-intel.js': INTEL,
    'js/volcano-layers.js': LAYERS, 'js/lazy-modules.js': readLF(join(ROOT, 'js', 'lazy-modules.js')),
  };
  for (const [name, src] of Object.entries(MODULES)) {
    assert.equal(UPSTREAM.test(src), false, name + ' writes 11,089 — that is what the GVP WFS answers'
      + ' with, not what data/volcano-detail.json.gz holds');
    assert.equal(CURRENT.test(src), false, name + ' hardcodes the eruption count (' + n + ')'
      + ' — read it from the file, or say what is there instead of how much');
  }

  /* the sources page, in every language there is a file for */
  const locales = readdirSync(join(ROOT, 'js', 'locales')).filter((f) => /^pages\..+\.js$/.test(f)).sort();
  assert.ok(locales.length >= 9, 'only ' + locales.length + ' page locales — the sweep lost languages');
  for (const file of locales) {
    const src = readLF(join(ROOT, 'js', 'locales', file));
    const m = /(['"])Smithsonian GVP\1:\s*(['"])([\s\S]*?)\2,$/m.exec(src);
    assert.ok(m, file + ' has no Smithsonian GVP row on the sources page');
    const text = m[3];
    /* the row legitimately names the four population radii (5 / 10 / 30 / 100 km), so what is
       banned is a number of FOUR OR MORE digits — grouped or not. No count of anything in this
       record is smaller than that, and no radius is that large. */
    const big = new RegExp('(?<![\\d])\\d{1,3}[,.\\u00a0\\u202f ]\\d{3}(?![\\d])'
      + '|(?<![\\d])\\d{4,}(?![\\d])').exec(text);
    assert.equal(big, null, file + ' states «' + (big && big[0]) + '» in the Smithsonian GVP row'
      + ' — the sources page cannot count the bundled file, so it must not say how big it is');
  }
});

/* ── ⑫ the status ladder never merges two agencies into one number on screen ──
   ①②③ are different instruments of different agencies. `rank` exists only so the MAP can sort
   colours; the panel must print the agency's own words with the agency's name against them. */
test('#R353 ⑫ the status ladder keeps each agency\'s own vocabulary', () => {
  assert.ok(/tier:1/.test(INTEL) && /tier:2/.test(INTEL) && /tier:3/.test(INTEL) && /tier:0/.test(INTEL),
    'the four rungs are gone');
  /* every rung that reports something must carry a source, and the ⓪ rung must carry none */
  const statusFn = INTEL.slice(INTEL.indexOf('function status(vn){'), INTEL.indexOf('/* every volcano the three feeds'));
  assert.ok(statusFn.length > 200, 'status() moved — this check no longer reads it');
  assert.equal((statusFn.match(/source:/g) || []).length, 4, 'a rung reports without naming its source');
  assert.ok(/tier:0,\s*rank:null/.test(statusFn.replace(/\s+/g, ' ')),
    'the "nothing published" rung has a rank — it would be drawn as a level');
});
}

/* ═══ from tests/r432-checks.test.mjs (the whole file) ═══
    IntMap · #R432 — the status ladder could name volcanoes this map cannot draw
    ⚠⚠⚠ WHAT WAS ACTUALLY WRONG. #R395 gave the ladder a fifth feed — USGS
    `volcano/getMonitoredVolcanoes`, the whole set of volcanoes an American observatory publishes a
    level for — so that «an observatory looked and says normal» could stop being drawn as «nobody
    publishes anything». Measured 2026-08-25, that feed answers 70 rows, and SIX of the keys it put
    into `statusIndex()` had no feature in the bundled catalog:

        0        ← «Alaskan Volcanoes» (AVO) and «Cascade Range» (CVO), both `vnum: null`, both
                   observatory-wide bulletins rather than volcanoes; `+null` is 0
        311161   ← «Korovin», AVO's number for the active northern cone of GVP 311160 «Atka
                   Volcanic Complex». GVP has no 311161 in either catalog
        311370   ← Isanotski Peaks
        323180   ← Coso Volcanic Field
        323822   ← Long Valley
        325010   ← Yellowstone

    The last four are real GVP volcanoes, filed under the PLEISTOCENE catalog because their youngest
    known eruption predates the Holocene — so the Holocene-only bundle could never hold them. Their
    status was fetched every session and thrown away: `volcApplyStatus` writes the rank ONTO the
    features, and there was no feature. Yellowstone, with its own USGS observatory, was not on
    IntMap's volcano layer at all.

    The answer is not an exemption list (`CONSTITUTION.md` §5). A volcano the USGS publishes a
    current alert level for belongs on a volcano map, so the bundle is now the Holocene catalog PLUS
    whatever an observatory is speaking about — DERIVED at build time from the live feed, never
    listed by hand — and the two rows that name no volcano stop becoming a volcano numbered 0.

    What these hold:
     ① the bundle says what it is made of, and the two files agree about it;
     ② the volcanoes beyond the Holocene list are real GVP records whose Holocene-only fields are
        ABSENT rather than guessed;
     ③ the shipped module, RUN: a row that names no volcano makes no key, AVO's number lands on the
        Smithsonian's volcano, and when two rows share one dot the more severe one is the answer;
     ④ the build derives that second set from the feed, reads the correspondence out of the running
        module instead of keeping a second copy, and refuses to drop what it cannot place;
     ⑤ the live spec watches EVERY feed the module has — it named four while the module had five,
        which is why the feed that broke it was the one nobody was watching settle;
     ⑥ no shipped string still calls the bundle the Holocene catalog, and the card branches on the
        epoch instead of asserting it. */
{
const { readLF } = await import('../scripts/eol.mjs');
const rd = read;
/* ⚠ an assertion about what the code DOES may not read the comments (#R427). */
const code = (p) => codeOnly(rd(p));

const LAYER = JSON.parse(readLF(join(ROOT, 'data', 'volcanoes_gvp.json')));
const DETAIL = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'volcano-detail.json.gz'))).toString('utf8'));
const EPOCH = DETAIL.vocab.epoch;
const epochOf = (v) => { const d = DETAIL.volcanoes[String(v)]; return (d && d.ep != null) ? EPOCH[d.ep] : null; };

test('#R432 ① the bundle says what it is made of, and both files agree about it', () => {
  assert.ok(Number.isInteger(LAYER.holocene), 'the layer file does not carry its Holocene count');
  assert.ok(LAYER.holocene > 1000, `only ${LAYER.holocene} Holocene volcanoes`);
  assert.ok(LAYER.holocene <= LAYER.features.length, 'more Holocene volcanoes than volcanoes');
  /* ⚠ DERIVED FROM THE OTHER FILE, NOT FROM A NUMBER WRITTEN HERE. The detail record carries each
     volcano's geological epoch, so «how many are not Holocene» is a question the data answers. */
  const nonHolocene = LAYER.features.filter((f) => epochOf(f.properties.v) !== 'Holocene');
  assert.equal(LAYER.features.length - LAYER.holocene, nonHolocene.length,
    'the layer\'s Holocene count and the detail record\'s epochs disagree about the composition');
  assert.ok(EPOCH.length >= 1 && EPOCH.includes('Holocene'), 'the epoch vocabulary lost Holocene');
});

test('#R432 ② the volcanoes beyond the Holocene list are real GVP records with nothing invented', () => {
  const extra = LAYER.features.filter((f) => epochOf(f.properties.v) !== 'Holocene');
  assert.ok(extra.length > 0,
    'nothing beyond the Holocene list — if USGS stopped monitoring every volcano GVP files elsewhere '
    + 'this is legitimate, but check the build before relaxing it');
  for (const f of extra) {
    const p = f.properties, d = DETAIL.volcanoes[String(p.v)];
    assert.ok(Number.isInteger(p.v) && p.v > 0, 'no GVP number');
    assert.ok(p.n && p.c && p.r, `${p.v} is missing name, country or region`);
    const [lon, lat] = f.geometry.coordinates;
    assert.ok(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90, `${p.v} is not on Earth`);
    /* ⚠ THE PLEISTOCENE FEATURE TYPE PUBLISHES NINE OF THE HOLOCENE ONE'S NINETEEN FIELDS, and the
       eruption list and the population layer are both Holocene-only. Every field that has no source
       is null — a guessed VEI or an invented last-eruption year would be worse than an empty row. */
    for (const k of ['y', 'k', 's', 'x', 'p']) {
      assert.equal(p[k], null, `${p.v} carries a ${k} the Pleistocene record cannot supply`);
    }
    assert.equal(p.q, 0, `${p.v} claims confirmed Holocene eruptions`);
    assert.ok(d, `${p.v} has no detail entry`);
    assert.deepEqual(d.er.length, 0, `${p.v} carries eruption rows it has no source for`);
    assert.equal(d.ev, null, `${p.v} carries an inclusion basis the Pleistocene record does not have`);
    assert.equal(d.ph, null, `${p.v} carries a photo the Pleistocene record does not have`);
    assert.equal(d.p.filter((x) => x != null).length, 0, `${p.v} carries population figures`);
    assert.ok(d.g && d.g.length > 40, `${p.v} has no geological summary`);
    assert.ok(EPOCH.includes(epochOf(p.v)), `${p.v} has an epoch outside the vocabulary`);
  }
});

/* ══ ⚠⚠⚠ ③ THE SHIPPED MODULE, RUN ═══════════════════════════════════════════════════════════
   Everything above reads files. The defect was in a coercion — `+r.vnum` on a row whose vnum is
   null — and a spelling check cannot see a coercion, so this boots js/volcano-intel.js in a sandbox
   with a stub `fetch` that serves USGS-shaped rows and asks the real `statusIndex()` what it made
   of them. The rows below are the shapes the live feed actually carries (measured 2026-08-25),
   not a paraphrase of them. */
async function boot(usgsMonRows, elevatedRows) {
  /* (module-graph) IMPORTED, not run as text in a vm: js/volcano-intel.js is an ES module that exports
     its factory. The browser it runs in is installed on the global (this file's process); the language
     registry is the REAL one (`lang: 'en'`), and the engine edge answers nothing — the sandbox this
     replaced had no renderer either. */
  const answer = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  const fetch = (url) => {
    const u = String(url);
    if (u.includes('getMonitoredVolcanoes')) return answer(usgsMonRows);
    if (u.includes('getElevatedVolcanoes')) return answer(elevatedRows || []);
    if (u.includes('getVonasWithinLastYear')) return answer([]);
    if (u.includes('jma.go.jp')) return answer([]);
    return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null) });
  };
  const { volcanoIntel } = await importModule('js/volcano-intel.js', {
    globals: {
      document: { baseURI: 'https://example.invalid/' },
      IntMapSafe: { html: (v) => String(v) },
      __imVolcLayer: { data: () => LAYER, count: () => LAYER.features.length },
      fetch,
    },
    mocks: { 'js/geo-engine.js': { IntMapGeoEngine: undefined } },
  });
  return volcanoIntel({ lang: 'en' });
}

/* the two AVO/CVO bulletins, AVO's Korovin, GVP's Atka, and Yellowstone — the shapes measured live */
const BULLETIN_AVO = { volcano_name: 'Alaskan Volcanoes', vnum: null, alert_level: 'NORMAL', color_code: 'GREEN', obs_fullname: 'Alaska Volcano Observatory', sent_unixtime: 1282336788 };
const BULLETIN_CVO = { volcano_name: 'Cascade Range', vnum: null, alert_level: 'NORMAL', color_code: 'GREEN', obs_fullname: 'Cascades Volcano Observatory', sent_unixtime: 1787355763 };
const ATKA = { volcano_name: 'Atka volcanic complex', vnum: '311160', alert_level: 'NORMAL', color_code: 'GREEN', obs_fullname: 'Alaska Volcano Observatory', sent_unixtime: 1784664522 };
const KOROVIN = { volcano_name: 'Korovin', vnum: '311161', alert_level: 'NORMAL', color_code: 'GREEN', obs_fullname: 'Alaska Volcano Observatory', sent_unixtime: 1607113755 };
const YELLOWSTONE = { volcano_name: 'Yellowstone', vnum: '325010', alert_level: 'NORMAL', color_code: 'GREEN', obs_fullname: 'Yellowstone Volcano Observatory', sent_unixtime: 1785596723 };
const keys = (idx) => [...idx.keys()].sort((a, b) => a - b).join(',');

test('#R432 ③ a row that names no volcano makes no key, and AVO’s number lands on the Smithsonian’s volcano', async () => {
  const V = await boot([BULLETIN_AVO, BULLETIN_CVO, ATKA, KOROVIN, YELLOWSTONE]);
  await V.warm();
  const idx = V.statusIndex();

  /* ⚠ `+null` IS 0. Before this, five rows produced five keys and one of them was a volcano numbered
     zero — a key the catalog can never hold, and the sixth of the six that broke the live spec. */
  assert.equal(idx.has(0), false, 'a row with vnum: null became volcano number 0');
  assert.equal(keys(idx), '311160,325010', 'the index is not exactly the two volcanoes named');

  /* every key the ladder produced is a volcano this map can draw — the claim the live spec makes
     against the real feed, made here against the shapes that used to break it */
  const have = new Set(LAYER.features.map((f) => f.properties.v));
  for (const v of idx.keys()) assert.ok(have.has(v), `the ladder named ${v}, which the catalog does not have`);

  /* Yellowstone is IN the catalog now, and its rung is a statement rather than silence */
  const y = idx.get(325010);
  assert.equal(y.tier, 1, 'Yellowstone did not reach the United States rung');
  assert.equal(y.rank, 0, 'GREEN/NORMAL is rank 0 — «an observatory looked», not «nothing published»');
  assert.ok(y.source, 'a rung reported without naming its source');

  /* the monitored/unmonitored distinction follows the same correspondence: 311161 is not a GVP
     number, so nothing may claim USGS monitors it under that number */
  assert.equal(V.usgsMonitors(311160), true, 'Atka is monitored and the map does not know it');
  assert.equal(V.usgsMonitors(311161), false, 'AVO’s own number leaked out as a GVP number');
  assert.equal(V.usgsMonitors(0), false, 'volcano number 0 is monitored');
});

test('#R432 ③b when two USGS rows share one GVP dot, the more severe one is the answer', async () => {
  /* Atka is watched as two units — the complex (ak17) and Korovin (ak171) — and the map has one dot
     for both. Returning whichever came first in the array would let an ORANGE cone hide behind a
     GREEN complex, which is a defect the reconciliation would otherwise have introduced. */
  const loud = { ...KOROVIN, alert_level: 'WATCH', color_code: 'ORANGE', sent_unixtime: 1800000000 };
  const V = await boot([ATKA, loud]);
  await V.warm();
  const st = V.statusIndex().get(311160);
  assert.equal(st.rank, 3, 'the quiet row won: ' + JSON.stringify({ label: st.label, unit: st.unit }));
  assert.equal(st.unit, 'Korovin', 'the severe row’s own unit name is not what the card would print');

  /* …and the order in the array does not decide it */
  const W = await boot([loud, ATKA]);
  await W.warm();
  assert.equal(W.statusIndex().get(311160).rank, 3, 'the answer depends on the order USGS listed them');
});

test('#R432 ④ the build derives the second set from the feed and keeps ONE copy of the correspondence', () => {
  const b = code('scripts/build-volcanoes.mjs');
  assert.match(b, /getMonitoredVolcanoes/, 'the build does not read the monitored roster');
  assert.match(b, /Smithsonian_VOTW_Pleistocene_Volcanoes/, 'the build cannot reach the Pleistocene catalog');
  assert.match(b, /holocene:\s*V\.features\.length/, 'the build does not record what the Holocene half is');
  /* ⚠ LOUD, NOT SILENT: a monitored number GVP holds under neither catalog must stop the build. If
     it were dropped, the map would be back where this round found it — a status fetched and thrown
     away — and nothing would say so. */
  assert.match(b, /throw new Error\(`USGS monitors/, 'the build drops what it cannot place');
  /* the correspondence is read out of the running module, not copied into the build */
  assert.match(b, /volcano-intel\.js'\)/, 'the build does not read js/volcano-intel.js');
  assert.match(b, /USGS_TO_GVP/, 'the build does not look for the correspondence');
  const intel = code('js/volcano-intel.js');
  const m = /const\s+USGS_TO_GVP\s*=\s*\{([\s\S]*?)\}/.exec(intel);
  assert.ok(m, 'js/volcano-intel.js no longer declares USGS_TO_GVP — the build throws on this exact shape');
  assert.ok([...m[1].matchAll(/(\d+)\s*:\s*(\d+)/g)].length > 0, 'the correspondence parsed empty');
  /* and it is declared in exactly one place */
  assert.equal(/USGS_TO_GVP\s*=/.test(code('scripts/build-volcanoes.mjs')), false,
    'the build keeps its own copy of the correspondence');
});

test('#R432 ⑤ the live spec watches every feed the module has', async () => {
  const V = await boot([ATKA]);
  await V.warm();
  const declared = Object.keys(V.feeds());
  assert.ok(declared.length >= 5, 'the module lost a feed: ' + declared.join(', '));
  const spec = rd('tests/r353-live.spec.js');
  const loop = /for \(const k of \[([^\]]+)\]\)/.exec(spec);
  assert.ok(loop, 'tests/r353-live.spec.js no longer has a settle loop to check');
  const watched = [...loop[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  /* ⚠⚠⚠ DERIVED FROM THE MODULE, NOT FROM A LIST HERE. The loop named four feeds for 37 rounds
     after #R395 made it five, and the one it did not name is the one that produced every unplaced
     volcano. A hand-kept list cannot say what it is missing (#R335). */
  for (const k of declared) {
    assert.ok(watched.includes(k), `the live spec never checks that «${k}» settled`);
  }
});

/* ⚠ (#R432) ADDING A DOT CAN MAKE ANOTHER ANSWER WRONG. «Long Valley Volcanic Region» was placed on
   Mono-Inyo Craters because GVP's own «Long Valley» was not in this catalog. It is now — and if the
   zone stayed on one dot, the other would print «no hazard-zone GIS is published» about a zone USGS
   publishes under that exact name. The polygons cover both, so the entry names both. */
test('#R432 ⑦ a USGS hazard zone can name more than one GVP volcano, and the lookup honours it', () => {
  const src = code('js/volcano-layers.js');
  const block = /const HAZ_TO_GVP=\{([\s\S]*?)\};/.exec(src);
  assert.ok(block, 'js/volcano-layers.js no longer declares HAZ_TO_GVP');
  const lv = /'Long Valley Volcanic Region':(\[[^\]]*\]|\d+)/.exec(block[1]);
  assert.ok(lv, 'the Long Valley zone is gone from the table');
  const nums = [...lv[1].matchAll(/\d+/g)].map((m) => +m[0]);
  const have = new Set(LAYER.features.map((f) => f.properties.v));
  assert.ok(nums.includes(323822) && nums.includes(323120),
    'the zone names ' + nums.join(', ') + ' — it covers the caldera (323822) and Mono-Inyo (323120)');
  for (const n of nums) assert.ok(have.has(n), `the zone names ${n}, which the catalog does not have`);
  /* …and the lookup reads a list, not a single number — otherwise the table would say two and the
     card would still answer for one */
  assert.match(src, /\[\]\.concat\(HAZ_TO_GVP\[k\]\)/, 'hazardFor still compares against one number');
});

test('#R432 ⑥ no shipped string calls the bundle the Holocene catalog, and the card asks the epoch', () => {
  const beta = code('js/beta-overlays.js');
  assert.equal(/GVP Holocene/.test(beta), false, 'the layer label still names the epoch');
  assert.equal(/full Holocene catalog/.test(beta), false, 'the layer row still says «full Holocene catalog»');
  assert.equal(/in the Holocene catalog\./.test(code('js/atlas-controls.js')), false,
    'Atlas still tells the reader the miss means «not in the Holocene catalog»');
  /* the legend states the composition, and both halves come out of the file */
  assert.match(beta, /volcFC\.holocene/, 'the legend does not read the Holocene count from the file');
  assert.match(beta, /\{h\}[\s\S]{0,400}\{m\}/, 'the composition is not one string with placeholders (#R355)');
  /* ⚠ THE «no dated eruption» HINT ASSERTED THE HOLOCENE CATALOG AS THE REASON. For Yellowstone that
     is the wrong reason for an empty record, and it is the one field the reader is looking at. */
  const intel = code('js/volcano-intel.js');
  assert.match(intel, /epochName\s*&&\s*epochName\s*!==\s*'Holocene'/,
    'the empty-record hint does not branch on the epoch');
  assert.match(intel, /'Pleistocene'\s*:\s*LA\(/, 'the epoch vocabulary has no Pleistocene row');
});
}
