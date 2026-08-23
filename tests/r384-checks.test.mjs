/* ============================================================================
 *  R384 — the card's ANSWERS in nine languages, the legend's caveat, and the
 *         41,489 km of cable that was drawn over land
 * ----------------------------------------------------------------------------
 *  「海底ケーブルレイヤーの正確化を引き続き進めて。また、クリックしたら出てくる
 *    カードの情報が翻訳されていない。凡例に、正確な位置を示しているわけでは
 *    ないという趣旨の文言を書いておいて。」
 *
 *  Three claims, and each one is checked where it can actually fail.
 *
 *  ① THE VALUES ARE TRANSLATABLE, NOT JUST THE LABELS. #R355 put twenty strings
 *     through the nine-language table and every instrument read 100 %, while the
 *     card printed 「接続国・地域 Cyprus · Syria」 and 「国・地域 Indonesia」 to a
 *     Japanese reader on all 1,922 landing points. An audit of CALL SITES cannot
 *     see a row whose VALUE is English data. So the join keys are checked in the
 *     data (every country spelling carries an ISO code, index-aligned) and the
 *     use of them is checked in the source (the popup reaches CLDR, and cannot
 *     go back to printing the English string while a code exists).
 *
 *  ② A CAVEAT IS ONLY IN THE LEGEND IF IT IS IN ALL NINE. And it must survive a
 *     language switch without multiplying — ensureGenericLegend() refreshes by
 *     removing `.dl-desc`, so a note that is a SIBLING of it accumulates.
 *
 *  ③ THE ROUTES. The measured defect was that a 9.26 km cell turns a fjord, an
 *     inlet or a river mouth into a pond of a few cells with no path to the
 *     ocean: the leg came back unroutable and fell through to a geodesic drawn
 *     over land. Ceilings here are RATCHETS — they may come down, never up.
 *
 *  ⚠ AND ④ IS THE ONE THIS ROUND EXISTS BECAUSE OF. js/locales/ui.fr.js shipped
 *  「Tron�ons relev�s」 — U+FFFD, twice, in a string #R355 added. Every
 *  translation instrument passed it, because they all ask 「is there an entry,
 *  and is it different from English?」 and the answer to both was yes. Nothing
 *  asked whether it was TEXT.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { resolveRegion, normaliseRegionName, regionIndex } from '../scripts/subcables/regions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(path.join(ROOT, p));
const readJSON = (p) => JSON.parse(read(p));
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const INFO = read('js/subcable-info.js');
const DL = read('js/data-layers.js');
const OVR = readJSON('data/subcable-overrides.json');
const hasData = exists('data/subcables-meta.json') && exists('data/subcables.build.json');
const META = hasData ? readJSON('data/subcables-meta.json') : null;
const BUILD = hasData ? readJSON('data/subcables.build.json') : null;

const LOCALES = ['fr', 'ko', 'zh', 'zh-hans'];          /* the inline-table languages */
const NOTE_EN = 'Routes are approximate: a few stretches are published survey positions, most are reconstructed from sea-floor terrain. A line is not the exact position of the cable. Click one for the accuracy of that stretch.';

/* ══ ① THE CARD'S ANSWERS ══════════════════════════════════════════════════ */

test('① every country spelling in the inventory carries an ISO region code', { skip: !hasData }, () => {
  assert.ok(BUILD.regions, 'the build manifest reports nothing about country spellings');
  assert.equal(BUILD.regions.unresolved.length, 0,
    'these spellings reached no ISO code and would print English: ' + BUILD.regions.unresolved.join(', '));
  assert.equal(BUILD.regions.resolved, BUILD.regions.spellings);
  assert.ok(BUILD.regions.spellings >= 150, 'suspiciously few spellings: ' + BUILD.regions.spellings);
});

test('① the codes are index-aligned with the names they translate', { skip: !hasData }, () => {
  let cables = 0;
  for (const [id, c] of Object.entries(META.cables)) {
    if (!c.countries || !c.countries.length) continue;
    cables++;
    assert.ok(Array.isArray(c.countryCodes), id + ' has countries but no countryCodes');
    assert.equal(c.countryCodes.length, c.countries.length, id + ': countryCodes is not aligned with countries');
    for (let i = 0; i < c.countries.length; i++) {
      const cc = c.countryCodes[i];
      if (cc === null) continue;                        /* allowed — the row keeps its English name */
      assert.match(String(cc), /^[A-Z]{2}$/, id + ': ' + cc + ' is not an alpha-2 code');
      assert.equal(cc, resolveRegion(c.countries[i], OVR.countryCodes),
        id + ': the stored code for ' + c.countries[i] + ' is not the one the resolver gives');
    }
  }
  assert.ok(cables > 600, 'only ' + cables + ' cables carry countries');
});

test('① every landing point that names a country carries its code', { skip: !hasData }, () => {
  let withCountry = 0, withCode = 0;
  for (const lp of Object.values(META.landingPoints)) {
    if (!lp.country) continue;
    withCountry++;
    if (lp.cc) { withCode++; assert.match(lp.cc, /^[A-Z]{2}$/); }
  }
  assert.ok(withCountry > 1800, 'only ' + withCountry + ' landing points name a country');
  assert.equal(withCode, withCountry, (withCountry - withCode) + ' landing points would print an English country');
});

test('① the ready-for-service date is data, not English prose', { skip: !hasData }, () => {
  const MONTH = /^(\d{4})\s+(January|February|March|April|May|June|July|August|September|October|November|December)$/;
  const QUARTER = /^(\d{4})\s+Q([1-4])$/i;
  let months = 0, quarters = 0, bare = 0;
  for (const [id, c] of Object.entries(META.cables)) {
    if (!c.rfs) continue;
    const s = String(c.rfs).trim();
    let m;
    if ((m = MONTH.exec(s))) { months++; assert.ok(c.rfsMonth >= 1 && c.rfsMonth <= 12, id + ': ' + s + ' did not yield a month'); assert.equal(c.rfsQuarter, null); }
    else if ((m = QUARTER.exec(s))) { quarters++; assert.equal(c.rfsQuarter, Number(m[2]), id + ': ' + s); assert.equal(c.rfsMonth, null); }
    else { bare++; assert.match(s, /^\d{4}$/, id + ': unrecognised rfs shape ' + JSON.stringify(s)); }
  }
  assert.ok(months > 50 && quarters > 20 && bare > 100, 'rfs shapes: ' + JSON.stringify({ months, quarters, bare }));
});

test('① the published length is a number as well as a string', { skip: !hasData }, () => {
  let n = 0;
  for (const [id, c] of Object.entries(META.cables)) {
    if (!c.length) { assert.equal(c.lengthKm, null, id); continue; }
    if (c.lengthKm == null) continue;                   /* a length that is not «N km» */
    n++;
    assert.equal(c.lengthKm, Number(String(c.length).replace(/,/g, '').match(/([\d.]+)\s*km/i)[1]), id);
  }
  assert.ok(n > 500, 'only ' + n + ' cables carry a numeric length');
});

/* ⚠ THE SOURCE SIDE. The data can carry a code and the popup can still print the
   English name next to it; this is the half that regresses silently. */
test('① the popup translates a country through its code, never by printing the name', () => {
  const code = codeOnly(INFO);
  assert.match(code, /window\._imCldrRegion/, 'the popup no longer reaches the app’s one CLDR resolver');
  /* the countries row must go through regionName(), i.e. the code must appear in
     the same expression as the name */
  assert.match(code, /m\.countries\.map\(\(n, i\) => regionName\(cc\[i\], n\)\)/,
    'the countries row does not resolve each name through its code');
  assert.ok(!/row\(T\.countries\(\), esc\(m\.countries\.join/.test(code),
    'the countries row is back to printing the English names it was handed');
  assert.ok(!/row\(window\.IntMapLang\.t\(HOST\.lang, 'Country'[^)]*\), esc\(m\.country\)\)/.test(code),
    'the landing card is back to printing the English country');
  /* …and the fallback is the English name, never an empty row (§11) */
  assert.match(code, /return english \|\| '';/, 'regionName no longer falls back to the name it was given');
});

test('① the date and the number are formatted for the reader, from the parts', () => {
  const code = codeOnly(INFO);
  assert.match(code, /new Intl\.DateTimeFormat\(langTag\(\), \{ year: 'numeric', month: 'long', timeZone: 'UTC' \}\)/);
  assert.match(code, /new Intl\.NumberFormat\(langTag\(\)\)/);
  assert.ok(!/row\(T\.rfs\(\), esc\(m\.rfs\)\)/.test(code), 'the RFS row prints the raw English prose again');
  assert.ok(!/row\(T\.length\(\), esc\(m\.length\)\)/.test(code), 'the length row prints the raw string again');
});

/* ══ ② THE LEGEND'S CAVEAT ═════════════════════════════════════════════════ */

test('② the cable legend carries an accuracy caveat in all five positional languages', () => {
  const at = DL.indexOf('const LEGEND_NOTE=');
  assert.ok(at > 0, 'there is no LEGEND_NOTE table');
  const decl = DL.slice(at, DL.indexOf('};', at));
  assert.match(decl, /subcables:LA\(/, 'the cable layer has no note');
  const args = /subcables:LA\((.*)\)\n?/s.exec(decl)[1];
  /* five quoted arguments, none of them equal to another */
  const parts = args.split(/','/);
  assert.equal(parts.length, 5, 'the note does not carry all five positional languages');
  assert.equal(new Set(parts).size, 5, 'two of the five languages carry the same text');
  for (const p of parts) assert.ok(p.length > 80, 'one language’s note is a stub: ' + p.slice(0, 40));
});

test('② …and in the four inline-table languages', () => {
  for (const code of LOCALES) {
    const src = read('js/locales/ui.' + code + '.js');
    const at = src.indexOf(JSON.stringify(NOTE_EN) + ':');
    assert.ok(at > 0, code + ' has no entry for the legend’s accuracy note');
    const value = /:\s*("(?:[^"\\]|\\.)*")/.exec(src.slice(at + JSON.stringify(NOTE_EN).length))[1];
    assert.notEqual(JSON.parse(value), NOTE_EN, code + ' still reads the English note');
    assert.ok(JSON.parse(value).length > 40, code + '’s note is a stub');
  }
});

/* ⚠⚠⚠ THE ONE THAT WOULD HAVE SHIPPED. The caveat's first class name was
   `dl-note`, which js/data-layers.js ~1078 already uses for a LAYER ROW's date
   note — and that one is `display:none` until a date is set. The caveat was in
   the DOM in nine languages and rendered nothing; the browser test passed too,
   because it read `textContent`, which walks hidden nodes. A class name is a
   namespace, and this asserts that nothing else in the app owns this one. */
test('② the caveat’s class belongs to the caveat alone, and is not hidden by anything', () => {
  const CLASS = 'dl-caveat';
  const users = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
    if (!/\.js$/.test(f)) continue;
    const src = read('js/' + f);
    if (src.includes(CLASS) && f !== 'data-layers.js') users.push('js/' + f);
  }
  for (const f of fs.existsSync(path.join(ROOT, 'css')) ? fs.readdirSync(path.join(ROOT, 'css')) : []) {
    if (/\.css$/.test(f) && read('css/' + f).includes(CLASS)) users.push('css/' + f);
  }
  assert.deepEqual(users, [], CLASS + ' is also used by: ' + users.join(', '));
  /* …and inside data-layers.js it is written exactly twice: the rule and the div */
  const hits = (DL.match(new RegExp(CLASS, 'g')) || []).length;
  assert.equal(hits, 3, CLASS + ' appears ' + hits + ' times in js/data-layers.js (rule, div, and the comment naming it)');
  /* no rule anywhere hides it */
  const rule = new RegExp('\.' + CLASS + '[^{]*\{([^}]*)\}', 'g');
  for (const m of DL.matchAll(rule)) assert.ok(!/display\s*:\s*none/.test(m[1]), 'a rule for .' + CLASS + ' sets display:none');
});

test('② the note lives INSIDE the .dl-desc block, so a language switch cannot duplicate it', () => {
  const code = codeOnly(DL);
  assert.match(code, /return '<div class="dl-desc">'\+desc\+note\+'<\/div>';/,
    'the note is not wrapped by the element ensureGenericLegend() removes on refresh');
  /* the refresh really does remove only `.dl-desc` — that is the premise above */
  assert.match(code, /const old=el\.querySelector\('\.dl-desc'\); if\(old\) old\.remove\(\);/);
  assert.match(DL, /\.data-legend \.dl-caveat\{/, 'the note has no style rule');
});

/* ══ ③ THE ROUTES ══════════════════════════════════════════════════════════ */

test('③ the router refuses to snap two ends into two different bodies of water', () => {
  const code = codeOnly(read('scripts/subcables/router.mjs'));
  assert.match(code, /components\(\)/, 'the router cannot tell one body of water from another');
  assert.match(code, /if \(cmp\[si\] !== cmp\[ti\]\) \{/, 'the two ends are not checked for being in the same water');
  assert.match(code, /sharedSnap\(from, to, maxSnap\)/, 'there is no shared-water snap');
  /* ⚠ AND THE BOUND #R355 PUT ON THE SNAP IS THE SAME BOUND. The re-snap is
     allowed to choose different water, never further water — that is what keeps
     a river cable from being dragged out to sea and back. */
  assert.match(code, /const maxSnap = opts\.maxSnapM \?\? 60e3;/);
  assert.ok(!/sharedSnap\(from, to, [^m)]/.test(code), 'the shared snap is given a bound of its own');
});

test('③ almost nothing is a geodesic any more, and the ceiling is a ratchet', { skip: !hasData }, () => {
  const km = BUILD.lengthKm;
  const share = km.estimated / km.total;
  /* MEASURED this round: 5,692 km of 2,067,525 = 0.28 %. #R355 shipped 47,181 km
     = 2.28 %. The ceiling may come DOWN when a round improves on it; a round
     that pushes it back up has undone this one. */
  assert.ok(share < 0.006, 'estimated route is ' + (share * 100).toFixed(2) + '% (ceiling 0.6%)');
  assert.ok(km.estimated < 12000, 'estimated km rose to ' + km.estimated);
  assert.ok(BUILD.router.failures < 150, 'router failures rose to ' + BUILD.router.failures);
  assert.ok(BUILD.router.reSnapped > 0, 'the shared-water snap never fired — it is not doing anything');
});

test('③ the QA’s land-crossing count came down and stays down', { skip: !hasData }, () => {
  /* MEASURED: 4,085 sampled points on land before, 1,262 after. */
  assert.ok(BUILD.qa.landCrossingSamples < 2000, 'land-crossing samples rose to ' + BUILD.qa.landCrossingSamples);
  assert.ok(BUILD.qa.landCrossingFeatures <= 259, 'land-crossing features rose to ' + BUILD.qa.landCrossingFeatures);
  /* …without buying it with detours: the shape of the distribution is unchanged */
  assert.ok(BUILD.qa.detour.p99 <= 1.902, 'detour p99 rose to ' + BUILD.qa.detour.p99);
  assert.ok(BUILD.qa.lengthRatio.p50 > 0.93 && BUILD.qa.lengthRatio.p50 < 1.07, 'built/published p50 moved to ' + BUILD.qa.lengthRatio.p50);
});

test('③ every declared river says why it is there, is pinned by a bbox, and opened cells', { skip: !hasData }, () => {
  assert.ok(Array.isArray(OVR.rivers) && OVR.rivers.length, 'no rivers are declared');
  for (const r of OVR.rivers) {
    assert.ok(r.name, 'a river entry has no name');
    assert.ok(r.why && r.why.length > 80, r.name + ' has no real `why`');
    assert.ok(Array.isArray(r.bbox) && r.bbox.length === 4, r.name + ' has no bbox — a name alone is four rivers');
    const [w, s, e, n] = r.bbox;
    assert.ok(w < e && s < n && w >= -180 && e <= 180 && s >= -90 && n <= 90, r.name + ' has a nonsense bbox');
    const row = BUILD.rivers.find(x => x.name === r.name);
    assert.ok(row, r.name + ' is declared but the build reports nothing about it');
    assert.ok(row.features >= 1, r.name + ' matched no Natural Earth feature');
    assert.ok(row.cellsOpened > 50, r.name + ' opened only ' + row.cellsOpened + ' cells');
  }
  assert.ok(BUILD.licences['ne-rivers'], 'the river source is used but not licensed in the manifest');
});

/* ══ ④ A TRANSLATION THAT IS NOT TEXT ══════════════════════════════════════ */

test('④ no locale file contains a replacement character', () => {
  const bad = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js', 'locales'))) {
    if (!/\.js$/.test(f)) continue;
    const s = read('js/locales/' + f);
    const n = (s.match(/�/g) || []).length;
    if (n) bad.push(f + ' (' + n + ')');
  }
  assert.deepEqual(bad, [], 'U+FFFD in: ' + bad.join(', ') + ' — a translation that is not text');
});

test('④ …and that check can go red: a planted U+FFFD is found', () => {
  /* ⚠ #R347's lesson, applied to a NEGATIVE assertion: a check that says «none
     of these exist» passes just as happily when it is looking at nothing. The
     detector is exercised on a string it must reject. */
  const planted = '{ "Surveyed sections": "Tron�ons relev�s" }';
  assert.equal((planted.match(/�/g) || []).length, 2);
  const clean = read('js/locales/ui.fr.js');
  assert.equal((clean.match(/�/g) || []).length, 0);
  assert.match(clean, /"Surveyed sections": "Tronçons relevés"/, 'the French string was repaired to real text');
});

/* ══ ⑤ THE RESOLVER ITSELF ═════════════════════════════════════════════════ */

test('⑤ the region resolver reads CLDR, refuses ambiguity, and never guesses', () => {
  assert.ok(regionIndex().size > 200, 'the CLDR index is empty — this Node has no ICU region data');
  /* the spellings CLDR agrees with */
  assert.equal(resolveRegion('Japan', OVR.countryCodes), 'JP');
  assert.equal(resolveRegion('United Kingdom', OVR.countryCodes), 'GB');
  assert.equal(resolveRegion('Antigua and Barbuda', OVR.countryCodes), 'AG');
  assert.equal(resolveRegion('Saint Pierre and Miquelon', OVR.countryCodes), 'PM');
  /* the eight it does not, from the corrections file */
  assert.equal(resolveRegion('Congo, Dem. Rep.', OVR.countryCodes), 'CD');
  assert.equal(resolveRegion('Virgin Islands (U.S.)', OVR.countryCodes), 'VI');
  assert.equal(resolveRegion('Virgin Islands (U.K.)', OVR.countryCodes), 'VG');
  assert.equal(resolveRegion('Turkey', OVR.countryCodes), 'TR');
  /* …and a name that is not a country is null, not a near miss */
  assert.equal(resolveRegion('Atlantis', OVR.countryCodes), null);
  assert.equal(resolveRegion('', OVR.countryCodes), null);
  assert.equal(normaliseRegionName('St. Vincent & the Grenadines'), 'saint vincent grenadines');
});

test('⑤ deprecated alpha-2 codes are what made the index ambiguous, and they are skipped', () => {
  /* GB/UK, DE/DD, RU/SU, VN/VD, YE/YD, VU/NH, TL/TP, BJ/DY, CW/AN — ICU resolves
     both halves of each pair to the same English name. Without the canonical
     filter every one of those countries resolved to nothing. */
  for (const [dead, live] of [['UK', 'GB'], ['DD', 'DE'], ['SU', 'RU'], ['TP', 'TL'], ['NH', 'VU']]) {
    let canon = dead;
    try { canon = new Intl.Locale('und-' + dead).maximize().region || dead; } catch (_) {}
    assert.equal(canon, live, dead + ' should canonicalise to ' + live + ' — this Node’s ICU disagrees');
  }
  assert.equal(regionIndex().get(normaliseRegionName('United Kingdom')), 'GB');
  assert.equal(regionIndex().get(normaliseRegionName('Timor-Leste')), 'TL');
});
