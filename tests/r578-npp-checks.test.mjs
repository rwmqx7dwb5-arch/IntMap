/* ============================================================================
 *  R578 — the nuclear ledger: shipped data/npp.json is measured, not typed
 * ----------------------------------------------------------------------------
 *  The plume model used to carry twelve hand-written regular expressions with
 *  coordinates typed next to them (js/sims.js, `SITES`). data/npp.json replaces
 *  that with what an upstream that knows the world's nuclear facilities answers
 *  (scripts/build-npp-registry.mjs). These gates guard the two ways that can go
 *  wrong: a rebuild that quietly ships fewer/garbage records, and a ledger that
 *  cannot answer for the places the program already promises to place.
 *
 *  ⚠ ③ does NOT restate the twelve sites. It READS them out of js/sims.js, so
 *  the day that table is finally deleted the gate has nothing left to demand —
 *  and while the table is still there, every one of its entries must resolve.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');
const NPP = JSON.parse(R('data/npp.json'));

/* The languages the product is READ in are not restated here: they are the
   locale files themselves (js/locales/pages.<code>.js — the same directory
   js/locale-boot.js globs and scripts/i18n-langs.mjs generates from). A tenth
   language added to IntMap therefore arrives in these gates on its own. */
const UI_CODES = readdirSync(join(ROOT, 'js', 'locales'))
  .map((f) => /^pages\.([A-Za-z0-9-]+)\.js$/.exec(f)).filter(Boolean)
  .map((m) => m[1].toLowerCase()).sort();

/* The languages a record's own country is officially governed in, as the
   builder discovered them (Wikidata P37 → P424) and shipped them. Nothing here
   restates a country→language table: the file says which languages it treated
   as each country's own, and these gates hold it to that.

   Codes are compared by their BASE subtag. Wikidata files China's official
   language under `zh-cn` and Taiwan's under `zh-tw` (measured), while the labels
   themselves are filed under `zh`, `zh-Hans` and `zh-Hant` — the same language
   written with a different code, not a different language. */
const base = (c) => String(c).toLowerCase().split('-')[0];
const homeLangs = (p) => (NPP.officialLangs || {})[p.country] || [];

/* Which languages a record can be NAMED in. `labels` deliberately omits the
   label that is already `name`, so `nameLang` is what says which languages
   that one covers. A plain `zh` label is Chinese of unstated script (the
   builder keeps the code it came from rather than inventing one), so it
   answers a reader of either script. */
function namedIn(p) {
  const k = new Set([...(p.nameLang || []), ...Object.keys(p.labels || {})].map((s) => s.toLowerCase()));
  if (k.has('zh')) { k.add('zh-hans'); k.add('zh-hant'); }
  return k;
}
/* Every spelling the ledger holds for one site — the exact set js/sims.js
   indexes to answer a reader who types a name. */
const spellings = (p) => [p.name, ...Object.values(p.labels || {}), ...(p.alias || [])];

/* ── ① the file is the format the program expects ────────────────────────── */
test('① data/npp.json is a v1 registry with a generation timestamp', () => {
  assert.equal(NPP.v, 1);
  assert.ok(Array.isArray(NPP.plants) && NPP.plants.length, 'plants[] must be a non-empty array');
  assert.ok(Array.isArray(NPP.sources) && NPP.sources.length, 'sources[] must name where the records came from');
  assert.ok(!Number.isNaN(Date.parse(NPP.generated)), 'generated must be a parseable timestamp: ' + NPP.generated);
  for (const s of NPP.sources) {
    for (const k of ['id', 'licence', 'url', 'count']) assert.ok(s[k] != null, 'source ' + s.id + ' is missing ' + k);
  }
  /* Every record says which of those sources it came from — a second upstream
     under a second licence must not become invisible once merged in. */
  const known = new Set(NPP.sources.map((s) => s.id));
  for (const p of NPP.plants) assert.ok(known.has(p.src), p.id + ' cites an undeclared source: ' + p.src);
});

/* ── ② every coordinate is a coordinate ──────────────────────────────────── */
test('② coordinates are in range and no record sits at Null Island', () => {
  const VOCAB = new Set(['operational', 'shutdown', 'under-construction', 'planned', 'decommissioned', 'cancelled', 'unknown']);
  for (const p of NPP.plants) {
    assert.ok(typeof p.name === 'string' && p.name.trim(), p.id + ' has no name');
    assert.ok(Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90, p.id + ' lat out of range: ' + p.lat);
    assert.ok(Number.isFinite(p.lon) && p.lon >= -180 && p.lon <= 180, p.id + ' lon out of range: ' + p.lon);
    /* 0,0 is in the Gulf of Guinea. A nuclear facility there is a missing value
       that survived as a number, which is exactly what a range check misses. */
    assert.ok(!(p.lat === 0 && p.lon === 0), p.id + ' sits at 0,0 — that is a dropped coordinate, not a place');
    assert.ok(VOCAB.has(p.status), p.id + ' has a status outside the product vocabulary: ' + p.status);
    /* An unrecognised upstream state must arrive as "unknown", never as a raw QID. */
    assert.ok(!/^Q\d+$/.test(String(p.status)), p.id + ' leaks a Wikidata QID as its status');
  }
});

/* ── ③ the ledger answers for everything the plume model already promises ─── */
test('③ every site js/sims.js still hard-codes is present in the ledger', () => {
  const src = R('js/sims.js');
  const block = /const\s+SITES\s*=\s*\[([\s\S]*?)\n\s*\];/.exec(src);
  if (!block) return;   /* the hand-written table is gone — that was the point of R578 */
  const rows = [...block[1].matchAll(/\{\s*re:\s*\/((?:[^/\\]|\\.)+)\/([a-z]*)\s*,/g)];
  assert.ok(rows.length, 'js/sims.js declares SITES but no entry could be parsed — the gate would pass blind');
  /* Every spelling the ledger can be asked with, in every language — not just
     the English label. The hand-written table answered 「福島第一」 and
     «Чернобыльская АЭС» too, and a replacement that only answers in English
     would be a smaller product, not a better-sourced one. */
  const names = NPP.plants.flatMap((p) => [...spellings(p), ...((p.also || []).map((a) => a.name))]);
  for (const [, body, flags] of rows) {
    const re = new RegExp(body, flags);
    assert.ok(names.some((n) => re.test(n)), 'no ledger record matches the hard-coded site /' + body + '/');
  }
  /* ⚠ No distance assertion, deliberately. MEASURED 2026-09-09: sims.js places
     Bushehr at 52.23°E, 130.8 km from the plant. Wikidata (50.887) and OSM
     (50.885, relation نیروگاه اتمی بوشهر) agree with each other and not with the
     typed list — the hand-written side is the wrong one, so it cannot be the
     reference the ledger is measured against. */
});

/* ── ④ a rebuild that loses the world is not a rebuild ───────────────────── */
test('④ the ledger still covers the world', () => {
  /* MEASURED 2026-09-09 by scripts/build-npp-registry.mjs: 638 sites, of which
     211 operational, across 57 ISO countries. The floors below sit at roughly
     two thirds of each — low enough that ordinary Wikidata churn (an item
     retyped, a coordinate removed) never fires them, high enough that a broken
     query, a truncated fetch or a scope class that was renamed does. They
     expire the day the upstream scope changes shape: rerun the builder and read
     its printed census before moving them. The independent floor is the world
     itself — there are ~440 power reactors at 200+ sites, plus research
     reactors and fuel-cycle plants, so 400 is under any honest count. */
  assert.ok(NPP.plants.length >= 400, 'only ' + NPP.plants.length + ' sites — the build lost a large share');
  const operational = NPP.plants.filter((p) => p.status === 'operational').length;
  assert.ok(operational >= 140, 'only ' + operational + ' operational sites');
  const countries = new Set(NPP.plants.map((p) => p.country).filter(Boolean));
  assert.ok(countries.size >= 38, 'only ' + countries.size + ' countries represented');
  const sum = NPP.sources.reduce((n, s) => n + s.count, 0);
  assert.equal(sum, NPP.plants.length, 'sources[].count must account for every record');
});

/* ── ⑤ one point, one pin ────────────────────────────────────────────────── */
test('⑤ no two records share a point', () => {
  /* 0.001° ≈ 110 m: inside the footprint of one site, far below the spacing of
     two distinct ones. Wikidata gives co-located items the same coordinate
     (Sizewell A/B/C, Chooz A/B, Tokai / Tokai No.2); the builder folds those
     into one site and keeps the rest in `also`, so a collision here means the
     fold stopped working and the map would carry a pin the reader cannot click. */
  const seen = new Map();
  for (const p of NPP.plants) {
    const k = Math.round(p.lat * 1000) + '/' + Math.round(p.lon * 1000);
    const prev = seen.get(k);
    assert.ok(!prev, 'co-located records: ' + prev + ' and ' + p.id + ' at ' + p.lat + ',' + p.lon);
    seen.set(k, p.id);
  }
});

/* ── ⑥ the facts are facts, or they are null ─────────────────────────────── */
test('⑥ optional fields are asserted values, never filler', () => {
  const ISO = /^[A-Z]{2}$/;
  const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;   /* Wikidata states years and months too; a day is never invented */
  let dated = 0, powered = 0;
  for (const p of NPP.plants) {
    if (p.country != null) assert.ok(ISO.test(p.country), p.id + ' country is not ISO 3166-1 alpha-2: ' + p.country);
    for (const k of ['start', 'end']) {
      if (p[k] == null) continue;
      assert.ok(DATE.test(p[k]), p.id + ' ' + k + ' is not a Wikidata-precision date: ' + p[k]);
      dated++;
    }
    if (p.netMW != null) { assert.ok(Number.isFinite(p.netMW) && p.netMW > 0, p.id + ' netMW: ' + p.netMW); powered++; }
    if (p.units != null) assert.ok(Number.isInteger(p.units) && p.units > 0, p.id + ' units: ' + p.units);
    if (p.end != null && p.start != null && p.end.length >= 4 && p.start.length >= 4) {
      assert.ok(p.end.slice(0, 4) >= p.start.slice(0, 4), p.id + ' ends before it starts: ' + p.start + ' → ' + p.end);
    }
  }
  /* The optional fields have to be populated for a real share of the ledger —
     a build that silently stopped reading claims would otherwise pass every
     check above by shipping nulls. MEASURED 2026-09-09: 286 netMW ratings and 542 service dates. */
  assert.ok(powered >= 200, 'only ' + powered + ' records carry a power rating');
  assert.ok(dated >= 300, 'only ' + dated + ' service dates were read');
});

/* ── ⑦ the names are names, and each one is stored once ──────────────────── */
test('⑦ labels and aliases are well-formed and never repeat the name', () => {
  assert.ok(UI_CODES.length, 'no js/locales/pages.*.js found — the language list could not be discovered');
  for (const p of NPP.plants) {
    /* Every language code a record may carry: the ones the product is READ in,
       plus the ones the country it stands in is GOVERNED in. Anything else is a
       code nothing declared, which is how a stray label reaches the reader. */
    const known = new Set([...UI_CODES, 'zh', ...homeLangs(p).map((c) => c.toLowerCase())]);
    assert.ok(Array.isArray(p.nameLang) && p.nameLang.length, p.id + ' does not say which language its name is in');
    for (const c of p.nameLang) assert.ok(known.has(String(c).toLowerCase()), p.id + ' nameLang has a code neither the product nor ' + p.country + ' declares: ' + c);
    const L = p.labels || {};
    const seen = new Set([p.name]);
    for (const [c, v] of Object.entries(L)) {
      assert.ok(known.has(c.toLowerCase()), p.id + ' has a label in a language neither the product nor ' + p.country + ' declares: ' + c);
      assert.ok(typeof v === 'string' && v.trim(), p.id + ' label ' + c + ' is empty');
      /* A label equal to the name is not a second name, it is the same string
         twice — 638 sites × nine languages of that is size the reader downloads
         for nothing. `nameLang` records that language instead. Two different
         LANGUAGES that happen to agree (18 cases, measured) are NOT a
         duplicate: a lookup map has to answer for the language it is asked. */
      assert.ok(v !== p.name, p.id + ' repeats its name as label ' + c + ' instead of naming it in nameLang');
      seen.add(v);
    }
    /* `zh` means "Chinese, script not stated" and earns its place only where no
       script-specific label exists (272 items, measured). Where one does, the
       two strings are the same bytes twice. */
    if (L.zh) assert.ok(L.zh !== L['zh-Hans'] && L.zh !== L['zh-Hant'], p.id + ' carries zh identical to its script-specific Chinese label');
    for (const a of (p.alias || [])) {
      assert.ok(typeof a === 'string' && a.trim(), p.id + ' has an empty alias');
      assert.ok(!seen.has(a), p.id + ' repeats ' + JSON.stringify(a) + ' as an alias');
      seen.add(a);
    }
  }
});

/* ── ⑧ the ledger answers in the language the reader is reading in ───────── */
test('⑧ every UI language can name a real share of the ledger', () => {
  /* MEASURED 2026-09-09 over the 638 shipped sites, counted the way `namedIn`
     counts (a plain `zh` label answers both scripts): en 576, fr 466, de 458,
     ja 389, ru 337, zh-Hans 276, zh-Hant 265, es 258, ko 71. The builder
     prints the same census, per label code, at the end of a build.
     Korean is the thinnest, and the floor sits below it rather
     than below each language separately: what this gate exists to catch is a
     BUILD that stopped asking for a language (the wbgetentities `languages`
     parameter is one string — lose it and a language goes to zero), not the
     slow drift of how much of Wikidata has been translated. A per-language
     table of today's numbers would be that drift written down as a demand.
     EXPIRY: the day a UI language is added it starts at zero — read the census
     from a fresh build before assuming this floor still fits. */
  const FLOOR = 50;
  for (const c of UI_CODES) {
    const n = NPP.plants.filter((p) => namedIn(p).has(c)).length;
    assert.ok(n >= FLOOR, 'only ' + n + ' sites can be named in ' + c + ' — a language stopped being fetched');
  }
  /* The aliases are the spellings people actually type («ЧАЭС», 福島第一原発,
     Windscale) and they are the half of the index a label cannot supply.
     MEASURED 2026-09-09: 1,978 aliases over 445 sites. The floor is two thirds
     of that, for the same reason as ④: churn must not fire it, a build that
     stopped asking for `aliases` must. */
  const aliases = NPP.plants.reduce((n, p) => n + ((p.alias || []).length), 0);
  assert.ok(aliases >= 1200, 'only ' + aliases + ' aliases — the alias fetch is failing');
});

/* ── ⑩ a plant is called something in the country it stands in ───────────── */
test('⑩ the ledger holds each site\'s name in the language of its own country', () => {
  /* ⑧ measures the nine languages the product is READ in. That is not the same
     question as this one, and the difference had a measured cost: with only the
     nine, «чорнобиль» — Ukrainian, the language of the country Chornobyl NPP
     stands in — could not be resolved in this ledger at all, while the twelve
     hand-written regular expressions it replaced could answer it. The name a
     place is known by at home is the name of the place, not a translation of it.

     The country→language join is the builder's (P17 → P37 → P424) and is shipped
     as `officialLangs`; this gate asks whether the labels actually arrived. */
  const OL = NPP.officialLangs || {};
  /* MEASURED 2026-09-09: 57 countries occur in the ledger, every one of them
     with at least one official language. The floor is well under that so that a
     country losing its last record never fires it, while an empty or missing map
     — which would make everything below vacuous — does. */
  assert.ok(Object.keys(OL).length >= 30, 'officialLangs names only ' + Object.keys(OL).length + ' countries — the P37/P424 join did not run');
  for (const [c, langs] of Object.entries(OL)) {
    assert.ok(Array.isArray(langs) && langs.length, c + ' is declared with no official language');
    for (const l of langs) assert.ok(/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(l), c + ' declares something that is not a language code: ' + JSON.stringify(l));
  }

  const homeable = NPP.plants.filter((p) => homeLangs(p).length);
  const named = (p) => {
    const has = new Set([...namedIn(p)].map(base));
    return homeLangs(p).some((c) => has.has(base(c)));
  };
  /* MEASURED 2026-09-09 by scripts/build-npp-registry.mjs (it prints this
     census): 631 of the 638 sites stand in a country with a declared official
     language, and 569 of those — 90.2% — carry that language's label. The
     missing 62 are dominated by 51 in the US, whose P37 in Wikidata is five
     territorial languages and NOT English, so "not named at home" there is a
     property of the upstream statement, not a gap in the fetch. The floor is
     75%, below the drift such upstream oddities cause and far above what a
     broken fetch leaves. EXPIRES when the builder's census moves: rerun it and
     read the printed percentage before touching this number. */
  const rate = homeable.filter(named).length / (homeable.length || 1);
  assert.ok(homeable.length >= 400, 'only ' + homeable.length + ' sites have a country with a declared official language');
  assert.ok(rate >= 0.75, 'only ' + (100 * rate).toFixed(1) + '% of sites carry a label in an official language of their own country');

  /* The sharp half of the question. Most nuclear countries are governed in one
     of IntMap's nine languages, so the rate above stays high even if the extra
     fetch dies completely. These are the sites whose home language the product
     does NOT read — 81 of them, of which 78 named (96.3%, measured). If the
     P37/P424 fetch, the language paging or the per-record filter breaks, this
     number goes to zero and nothing else in the file notices. */
  const foreign = homeable.filter((p) => !homeLangs(p).some((c) => UI_CODES.some((u) => base(u) === base(c))));
  assert.ok(foreign.length >= 40, 'only ' + foreign.length + ' sites are named at home in a language the product does not read — the join lost countries');
  const ok = foreign.filter(named).length;
  assert.ok(ok >= 50, 'only ' + ok + ' of ' + foreign.length + ' sites carry a label in a home language outside the nine UI languages — that fetch is not arriving');
  /* …and the observed failure itself, kept as the one case-specific line in
     this file (`.agents/rules/no-ad-hoc-hardcoding.md` §6). «чорнобиль» is the
     spelling the deleted hand-written table in js/sims.js carried and the ledger
     could not resolve on 2026-09-09; it is not derivable from anything still in
     the tree, because that table is gone. The rate above cannot see it — Ukraine
     is 7 of 81 sites, well inside the slack. It asserts no QID: whatever record
     stands in Ukraine and is spelled with that stem must exist. Remove it when
     the per-country rates below are measured per country rather than in
     aggregate, which would cover this case structurally. */
  const uk = NPP.plants.filter((p) => p.country === 'UA' && spellings(p).some((s) => /чорнобиль/i.test(s)));
  assert.ok(uk.length, 'no site in Ukraine can be reached by the Ukrainian spelling чорнобиль');
});

/* ── ⑨ the sites the product itself names to every reader ────────────────── */
test('⑨ the plume presets resolve to a site nameable in every UI language', () => {
  /* js/sims.js still hard-codes the source-term presets (`SOURCES`) with a
     coordinate each: those are the sites the product puts in front of EVERY
     reader, in every language, before anybody has typed anything. So they are
     the sites for which "the reader can name it in their own language" is not
     a statistic but a requirement — and, like ③, the requirement is READ out
     of js/sims.js, so it disappears together with the table it belongs to. */
  const src = R('js/sims.js');
  const blk = /const\s+SOURCES\s*=\s*\{([\s\S]*?)\n/.exec(src);
  if (!blk) return;
  const presets = [...blk[1].matchAll(/'([a-z0-9_-]+)'\s*:\s*\{[^{}]*?ll\s*:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)];
  if (!presets.length) return;   /* the presets no longer carry coordinates */
  for (const [, key, lon, lat] of presets) {
    let best = null, bd = Infinity;
    for (const p of NPP.plants) {
      const dy = (p.lat - +lat) * 111.32, dx = (p.lon - +lon) * 111.32 * Math.cos(+lat * Math.PI / 180);
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = p; }
    }
    /* 5 km: MEASURED 2026-09-09, both presets land 0.05 km from their ledger
       record, so this is two orders of magnitude of slack for a coordinate
       that was typed by hand — and still far tighter than the distance to the
       next nuclear site in either country. */
    assert.ok(best && bd <= 5, 'preset ' + key + ' has no ledger site within 5 km (nearest ' + (best && best.id) + ' at ' + bd.toFixed(1) + ' km)');
    const langs = namedIn(best);
    const missing = UI_CODES.filter((c) => !langs.has(c));
    assert.equal(missing.join(','), '', 'preset ' + key + ' → ' + best.id + ' (' + best.name + ') cannot be named in: ' + missing.join(','));
    /* …and it must carry the spellings a reader types, which is what the
       twelve hand-written regular expressions used to hold for these sites. */
    assert.ok(spellings(best).length >= 5, 'preset ' + key + ' → ' + best.id + ' carries only ' + spellings(best).length + ' spellings');
  }
});
