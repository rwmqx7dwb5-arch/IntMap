/* ============================================================================
 *  #R566 — WHO Disease Outbreak News as an event layer
 * ----------------------------------------------------------------------------
 *  ⚠ THESE ASK THE DATA AND THE FUNCTIONS, NOT THE SPELLING. #R488 / #R521 / #R546 all record the
 *  same failure: a check that fixes a literal keeps passing while the thing it names dies. So the
 *  country join is exercised on real rows, the «listed but not placed» state is asserted to EXIST
 *  in the shipped corpus (it is the honest answer for 179 items and a later change that silently
 *  drops them must go red), and the build script's two pure functions are imported and run.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaxonIndex, toEvent, eventName, readCorpus, WHO_ITEM_BASE } from '../scripts/build-who-don.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CORPUS = join(ROOT, 'data', 'who-don.json.gz');

/* one real WHO row, captured 2026-09-09 — the shape the join has to survive */
const ROW = {
  Id: 'c835cb1d-25ad-4dd9-b065-ee09c054fe81',
  Title: 'Ebola disease caused by Bundibugyo virus - Democratic Republic of the Congo',
  DonId: '2026-DON616', UrlName: '2026-DON616',
  PublicationDateAndTime: '2026-08-28T15:28:00Z',
  regionscountries: ['efb17dee-87bf-4f2d-abfa-69f46b84b2e5'],
  EmergencyEvent: {
    Title: 'Ebola disease caused by Bundibugyo virus', EventId: '2026-E000253',
    EmergencyEventStartDate: '2026-05-14T06:00:00Z',
  },
};
/* the place vocabulary a title's tail is verified against — WHO's own country and region titles,
   NORM-ed the way scripts/build-who-don.mjs does */
const PLACES = new Set(['democratic republic of the congo', 'uganda', 'india', 'senegal', 'african region', 'cambodia']);
const COUNTRIES = [
  { Id: 'cda4850d-6650-4a37-9b8a-97601205db52', Title: 'Democratic Republic of the Congo', Code: 'COD', regionscountries: ['efb17dee-87bf-4f2d-abfa-69f46b84b2e5'] },
  { Id: 'x', Title: 'Uganda', Code: 'UGA', regionscountries: ['11111111-1111-1111-1111-111111111111'] },
  /* WHO carries historical entities with no ISO code — they must not enter the index at all */
  { Id: 'y', Title: 'Union of Soviet Socialist Republics (former)', Code: '', regionscountries: [] },
];

test('① the country is a TAXON JOIN, not a name match — and an unjoinable taxon yields no country', () => {
  const { byTaxon, names } = buildTaxonIndex(COUNTRIES);
  assert.deepEqual(byTaxon.get('efb17dee-87bf-4f2d-abfa-69f46b84b2e5'), ['COD']);
  assert.equal(names.COD, 'Democratic Republic of the Congo');
  assert.ok(!Object.values(names).includes('Union of Soviet Socialist Republics (former)'),
    'a country WHO has no ISO code for must not enter the index — the join refuses rather than inventing a key');

  const e = toEvent(ROW, byTaxon, PLACES);
  assert.deepEqual(e.c, ['COD']);
  assert.equal(e.d, 'Ebola disease caused by Bundibugyo virus');
  assert.equal(e.s, '2026-05-14', 'the outbreak start is EmergencyEventStartDate, not the publication date');
  assert.equal(e.p, '2026-08-28');
  assert.notEqual(e.s, e.p, 'the two dates are different facts and must never be conflated');

  /* ⚠ THE HEART OF IT: an item whose taxon nothing resolves is KEPT with an empty country list.
     «Yellow fever – Global» is 179 items, and dropping them (or placing them at a region centre)
     is the failure this asserts against. */
  const global = toEvent({ ...ROW, UrlName: '2026-DON610', Title: 'Yellow fever - Global', regionscountries: ['deadbeef-0000-0000-0000-000000000000'] }, byTaxon, PLACES);
  assert.ok(global, 'an item about no one country is still an item');
  assert.deepEqual(global.c, [], 'and it carries NO country rather than a guessed one');
});

test('② an item with no slug is not an event — it has no citable WHO page', () => {
  const { byTaxon } = buildTaxonIndex(COUNTRIES);
  assert.equal(toEvent({ ...ROW, UrlName: '' }, byTaxon, PLACES), null);
  assert.equal(toEvent({ ...ROW, UrlName: '   ' }, byTaxon, PLACES), null);
});

test('③ a missing date is null, never a substituted one', () => {
  const { byTaxon } = buildTaxonIndex(COUNTRIES);
  const noStart = toEvent({ ...ROW, EmergencyEvent: { Title: 'Cholera' } }, byTaxon, PLACES);
  assert.equal(noStart.s, null);
  assert.equal(noStart.p, '2026-08-28', 'the publication date is still known');
  const noEv = toEvent({ ...ROW, EmergencyEvent: null }, byTaxon, PLACES);
  assert.equal(noEv.s, null);
  /* ⚠ NO EmergencyEvent DOES NOT MEAN NO NAME — the DON's own title carries it, and the place is
     cut off only because «Democratic Republic of the Congo» VERIFIED against WHO's vocabulary. */
  assert.equal(noEv.d, 'Ebola disease caused by Bundibugyo virus');
});

test("③b the title parse is verified, not trusted — and WHO’s decorations come off", () => {
  const nm = (t) => { const r = eventName(t, PLACES); return r && r.name; };
  /* a tail that verifies is cut; a tail that does not is LEFT ATTACHED rather than guessed away */
  assert.equal(nm('Nipah virus disease - India'), 'Nipah virus disease');
  assert.equal(nm('Yellow fever in Senegal'), 'Yellow fever');
  assert.equal(nm('Cholera – Global'), 'Cholera – Global', 'Global is not in WHO’s country vocabulary, so nothing is cut');
  /* WHO's own decorations: a year prefix and the two revision markers */
  assert.equal(nm('1998 - Cholera'), 'Cholera');
  assert.equal(nm('MERS-CoV – update'), 'MERS-CoV');
  /* ⚠ THE ONE THAT MADE «Avian influenza – situation» THE 2nd MOST COMMON DISEASE: the marker sits
     BEHIND the place, so it survives unless the head is stripped again after the cut. */
  assert.equal(nm('Avian influenza – situation in Cambodia – update'), 'Avian influenza');
  /* a bare year is not a name at all */
  assert.equal(eventName('2014', PLACES), null);
  /* and a title that IS only a marker keeps itself rather than becoming empty */
  assert.equal(nm('Update'), 'Update');
});

test('④ the shipped corpus is a corpus, and it still holds the three states', () => {
  assert.ok(existsSync(CORPUS), 'data/who-don.json.gz must be committed — the layer reads it, not the network');
  const c = readCorpus(CORPUS);
  assert.equal(c.v, 1);
  assert.ok(c.events.length >= 3000, `only ${c.events.length} events`);
  assert.equal(c.itemBase, WHO_ITEM_BASE);

  const placed = c.events.filter((e) => e.c.length);
  const unplaced = c.events.filter((e) => !e.c.length);
  assert.ok(placed.length / c.events.length > 0.9, `only ${placed.length} of ${c.events.length} placed`);
  /* ⚠ NOT A CURIOSITY — the panel lists these and the layer draws nothing for them. If a future
     change makes this zero it has either started guessing coordinates or started dropping items,
     and both are defects this number catches. */
  assert.ok(unplaced.length > 50, `only ${unplaced.length} items are «not one country» — did something start guessing?`);

  /* every code an event names must be nameable, or the card prints a bare ISO code at a reader */
  const used = new Set(); c.events.forEach((e) => e.c.forEach((i) => used.add(i)));
  const missing = [...used].filter((i) => !c.countries[i]);
  assert.deepEqual(missing, [], 'every ISO code used by an event has a name in the corpus');
  assert.ok(used.size > 100, `only ${used.size} distinct countries`);

  /* the taxon map is what makes the live tail one request rather than 33 */
  assert.ok(Object.keys(c.taxa).length > 150, 'the taxon → ISO map travels with the corpus');
  assert.ok(Object.values(c.taxa).every((v) => Array.isArray(v) && v.every((i) => /^[A-Z]{3}$/.test(i))));

  assert.ok(c.events.every((e) => e.p && /^\d{4}-\d{2}-\d{2}$/.test(e.p)), 'every item has a publication date');
  assert.ok(c.events.every((e) => Array.isArray(e.c)), 'every item has a country list, even an empty one');
  assert.ok(c.events.every((e) => !e.s || /^\d{4}-\d{2}-\d{2}$/.test(e.s)));

  /* ⚠⚠⚠ THE ONE THAT #R566's FIRST BUILD FAILED. `EmergencyEvent.Title` is PRESENT on 98.3 % of
     items and is a BARE YEAR on 2,700 of them — every item published in 2014 said «2014» — so the
     layer's pathogen filter offered years as diseases (#R534: a field's presence read as its
     meaning). Every event must carry a name, and no name may be a year. */
  assert.ok(c.events.every((e) => e.d), 'every event carries a name');
  const years = c.events.filter((e) => /^\d{4}$/.test(e.d));
  assert.deepEqual(years.slice(0, 5).map((e) => e.u + '=' + e.d), [], 'no event name is a bare year');
  const names = new Set(c.events.map((e) => e.d));
  assert.ok(names.size > 300, `only ${names.size} distinct event names`);
  /* the decorations WHO puts on a title must not survive into the facet list */
  assert.ok(![...names].some((n) => /\b(update[ds]?|situation)\s*$/i.test(n)),
    'a revision marker is not a disease');
});

test('⑤ the corpus carries no coordinates — where a country is, is the renderer\'s answer', () => {
  const c = readCorpus(CORPUS);
  const t = JSON.stringify(c.events.slice(0, 400));
  assert.ok(!/"(lat|lng|lon|coordinates)"/.test(t),
    'a coordinate frozen into the corpus would be a second copy of a fact countryGeo already owns');
});

test('⑥ the layer is wired into the eager shell — row, factory, and the module it publishes', () => {
  const main = read('src/main.js');
  assert.match(main, /import '\.\.\/js\/outbreaks\.js'/, 'imported');
  assert.match(main, /'outbreaks'/, 'and listed as an eager factory, not a lazy one');
  assert.match(read('js/app-body.js'), /window\.IntMapModules\.outbreaks\(IM_HOST\)/, 'and instantiated');
  const src = read('js/outbreaks.js');
  assert.match(src, /window\.IntMapModules\.outbreaks = function/);
  assert.match(src, /window\.IntMapOutbreaks =/);
  /* the row must exist before anyone can ask for the layer — that is WHY it is eager */
  assert.match(src, /wp-dl-outbreaks/);
});

test('⑦ nothing about this layer is a hand-written list of countries or diseases', () => {
  const src = read('js/outbreaks.js');
  /* .agents/rules/no-ad-hoc-hardcoding.md §1: an embedded list of names derivable from the data.
     The country names come from the corpus and the pathogen list is DISCOVERED from the window. */
  const iso3 = src.match(/'[A-Z]{3}'/g) || [];
  assert.deepEqual(iso3, [], `js/outbreaks.js names ISO codes literally: ${iso3.join(', ')}`);
  assert.ok(!/pathogens?\s*=\s*\[/.test(src), 'the pathogen list must be discovered, never written down');
  assert.match(src, /corpus\.countries\[i\]/, 'country names are read from WHO\'s own answer');
});

test('⑧ the case count is never encoded in a visual channel, because it is often missing', () => {
  const src = read('js/outbreaks.js');
  /* #R543: a channel cannot say «missing», so a missing value drawn small reads as a small value.
     The radius and the colour must be driven by `n` (item count) and `age`, both always known. */
  const radius = [];
  for (let i = src.indexOf("'circle-radius'"); i >= 0; i = src.indexOf("'circle-radius'", i + 1)) {
    const end = src.indexOf("'circle-color'", i);
    radius.push(src.slice(i, end > i ? end : i + 400));
  }
  assert.ok(radius.length >= 2, `both circle layers set a radius (found ${radius.length})`);
  radius.forEach((r) => {
    assert.ok(/\['get', 'n'\]/.test(r), 'the radius is driven by the item count');
    assert.ok(!/cases|deaths/.test(r), 'and never by a count that can be missing');
  });
  assert.ok(!/AGE_RAMP[\s\S]{0,200}cases/.test(src), 'nor is the colour');
  /* and «not extracted» has to be sayable in words */
  assert.match(src, /not extracted yet/);
});

test('⑨ Atlas can reach it, and the catalogue tells the planner the two things that mislead', () => {
  assert.match(read('js/atlas-capabilities.js'), /\['map\.outbreaks',/);
  assert.match(read('js/atlas-schemas.js'), /'map\.outbreaks':/);
  assert.match(read('js/atlas-console.js'), /case 'outbreaks':/);
  const cat = read('js/atlas-catalog-text.js');
  assert.match(cat, /ids: \['map\.outbreaks'\]/);
  assert.match(cat, /NULL IS NOT ZERO/, 'a missing case count must never be reported as no deaths');
  assert.match(cat, /NOT ABOUT ONE COUNTRY/, 'and the unplaced items must not be described as absent');
});

test('⑩ WHO is named in the one source registry the attribution page reads', () => {
  assert.match(read('js/reference-data.js'), /WHO Disease Outbreak News/);
});
