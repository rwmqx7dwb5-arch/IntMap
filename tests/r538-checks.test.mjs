/* ============================================================================
 *  IntMap · #R538 the language engine — source & data checks
 * ----------------------------------------------------------------------------
 *  Every assertion here is about something that WAS wrong and was measured before it was changed.
 *  The failure this round exists to fix was SILENT: the old build resolved Factbook prose through a
 *  hand table of 119 regular expressions and dropped whatever it did not recognise, so the country
 *  took the next language down and 3,136 tests stayed green. So these are written against the
 *  RELATION — «top is the largest number the source printed» — rather than against the answer for
 *  one country, because an assertion that names Burkina Faso protects Burkina Faso and nothing else.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const L = json('data/language.json');
const T = json('data/language-tree.json');
const AT = new Map(T.g.map((g, i) => [g, i]));
const ancestors = (g) => { const out = []; let i = AT.get(g); while (T.p[i] >= 0) { i = T.p[i]; out.push(T.g[i]); } return out; };

/* ── ① the defect itself: the leading language is the largest number the source printed ────────
   ⚠ MEASURED ON THE OLD SHIPPED FILE: Burkina Faso came out «Fula 7.8%» from a sentence beginning
   «Mossi 52.9%»; Namibia «Afrikaans 9.4%» from one beginning «Oshiwambo languages 49.7%»;
   Mozambique «Portuguese 16.6%» from one beginning «Makhuwa 26.1%». Not one test noticed, because
   every test asked whether the file was well-formed and none asked whether it was RIGHT. */
test('R538 ① every country leads in the largest percentage its source prints', () => {
  let checked = 0, listedOnly = 0;
  for (const [iso, r] of Object.entries(L.countries)) {
    /* the record keeps the first 400 characters of the source; a truncated sentence cannot be
       compared against, so those are skipped rather than guessed at */
    if ((r.src || '').length >= 400) continue;
    /* ⚠ A PERCENTAGE INSIDE A PARENTHESIS IS NOT A SHARE OF THE LIST. Sierra Leone's entry has two
       — «a first language for 10% of the population but understood by 95%» — inside a gloss on
       Krio, and the sentence itself publishes no shares at all. Only the numbers attached to the
       entries are shares, so the glosses come out before the numbers are read. */
    let flat = r.src || '';
    for (let i = 0; i < 6; i++) flat = flat.replace(/\([^()]*\)/g, ' ');
    const nums = [...flat.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => parseFloat(m[1]))
      .filter((n) => n <= 100);
    if (!nums.length) { assert.equal(r.top, null, `${iso}: the source prints no percentage, so there is no leading language`); listedOnly++; continue; }
    const biggest = Math.max(...nums);
    assert.ok(r.pct != null, `${iso}: the source prints percentages but the record has no share`);
    /* ⚠ THE LARGEST NUMBER IS NOT ALWAYS A LANGUAGE. Ghana's sentence ends «other 31.2%», which is
       larger than any language in it — that share is counted as UNNAMED and given to nobody, which
       is the whole point of keeping it. So the claim is: the biggest number the source printed is
       accounted for, either as the leading language or as the remainder the source did not name.
       (`pct` may also EXCEED any single printed number — Ghana's Akan is Asante 16% + Fante 11.6% +
       Akyem 3.2%, three names for one language, which is exactly what the old model could not do.) */
    assert.ok(Math.max(r.pct, r.unnamed || 0) >= biggest - 0.051,
      `${iso}: the source's largest share is ${biggest}% but the record accounts for at most ${Math.max(r.pct, r.unnamed || 0)}%`);
    checked++;
  }
  assert.ok(checked > 60, `only ${checked} countries could be compared against their own source text`);
  assert.ok(listedOnly > 40, `only ${listedOnly} countries were recognised as having no published share`);
});

/* ── ② «no share published» is a state, not the first name in the list ─────────────────────── */
test('R538 ② a country with no measured share says so instead of naming its first language', () => {
  const cs = Object.entries(L.countries);
  const none = cs.filter(([, r]) => !r.top);
  assert.ok(none.length > 90, `only ${none.length} countries carry no measured share`);
  for (const [iso, r] of none) {
    assert.equal(r.pct, null, `${iso}: no leading language but a share`);
    assert.equal(r.shareType, 'listed', `${iso}: shareType must say the source only listed`);
    assert.equal(Object.keys(r.mix).length, 0, `${iso}: no measured share but a mix`);
    assert.ok(r.listed.length > 0, `${iso}: the languages the source names must still be recorded`);
  }
  /* the four the old build turned into English / English / French / French */
  for (const iso of ['KEN', 'NGA', 'COD', 'TCD']) {
    assert.equal(L.countries[iso].top, null, `${iso} publishes no shares and must not lead in anything`);
    assert.ok(Object.keys(L.countries[iso].roles).length > 0, `${iso} must still record which of its languages are official`);
  }
  /* and the layer paints them in their own colour rather than falling through to the fallback */
  const s = codeOnly(read('js/layer-packs.js'));
  assert.match(s, /const NO_SHARE='@no-share'/, 'the category must exist');
  assert.match(s, /if\(key==='language'\) e\.push\(NO_SHARE,NO_SHARE_COL\)/, 'and the paint expression must carry it');
  assert.match(s, /M\[f\.id\]\.top\|\|\(key==='language'\?NO_SHARE:null\)/, 'and a country with no top must be given it');
});

/* ── ③ identity: the collisions ISO 639-1 forced are gone ─────────────────────────────────── */
test('R538 ③ languages the old tags merged are distinct languoids now', () => {
  const g = (iso) => L.countries[iso];
  /* Kirundi was recorded as Kinyarwanda — one code for two languages */
  const bdi = g('BDI').listed[0], rwa = g('RWA').top;
  assert.notEqual(bdi, rwa, 'Burundi and Rwanda must not share a language code');
  /* ⚠ EVERY CREOLE ON EARTH WAS «ht». Comparing the three countries' LEADING languages would not
     catch that coming back — Haiti's entry («French (official), Creole (official)») publishes no
     shares, so its leading language is null, and a set of {null, x, y} has three members whatever x
     and y are. The claim is that each of the three names a language the other two do not. */
  const sets = ['HTI', 'MUS', 'SYC'].map((k) => new Set(g(k).listed));
  for (let i = 0; i < 3; i++) {
    const others = new Set([...sets[(i + 1) % 3], ...sets[(i + 2) % 3]]);
    const own = [...sets[i]].filter((x) => !others.has(x));
    assert.ok(own.length > 0, `${['HTI', 'MUS', 'SYC'][i]} names no language the other two do not — the creoles have merged again`);
  }
  /* six Sinitic languages shared one tag */
  const cn = g('CHN').listed;
  assert.ok(cn.length >= 6, `China names only ${cn.length} languages`);
  assert.equal(new Set(cn).size, cn.length, 'and they must all be different');
  const sin = ancestors(cn[0]).concat(cn[0]);
  assert.ok(cn.every((x) => x === cn[0] || ancestors(x).some((a) => sin.includes(a))),
    'the Sinitic languages must share an ancestor — distinct is not the same as unrelated');
  /* Persian, Dari and Tajik were one tag; they are three languoids in three countries */
  const fa = [g('IRN').listed[0], g('AFG').top, g('TJK').top];
  assert.equal(new Set(fa).size, 3, 'Iran, Afghanistan and Tajikistan must not share one language code');
});

/* ── ④ the tree is a tree, and the map reads it ───────────────────────────────────────────── */
test('R538 ④ every language a country names exists in the classification, with a path to a root', () => {
  const used = new Set();
  for (const r of Object.values(L.countries)) { if (r.top) used.add(r.top); r.listed.forEach((x) => used.add(x)); }
  assert.ok(used.size > 250, `only ${used.size} languages are named across the world`);
  for (const g of used) {
    assert.ok(AT.has(g), `${g} is used by a country but absent from the classification`);
    assert.ok(L.names[g], `${g} has no name`);
    const a = ancestors(g);
    assert.ok(a.length <= 32, `${g} has an implausible lineage of ${a.length}`);
    assert.equal(new Set(a).size, a.length, `${g} has a cycle in its lineage`);
  }
  assert.ok(T.g.length > 12000, `the classification holds only ${T.g.length} languoids`);
  assert.equal(T.g.length, T.n.length, 'the parallel arrays must be the same length');
  assert.equal(T.g.length, T.p.length, 'the parallel arrays must be the same length');
});

/* ── ⑤ nothing is resolved by guesswork ───────────────────────────────────────────────────── */
test('R538 ⑤ every ledger decision is bound to a real languoid and says why', () => {
  const led = json('data/language-aliases.json');
  const rows = Object.entries(led.bind || {});
  assert.ok(rows.length > 40, `the ledger holds only ${rows.length} decisions — the rules cannot have resolved everything`);
  for (const [k, v] of rows) {
    const gs = v.gs || [v.g];
    assert.ok(gs.length && gs.every(Boolean), `ledger ${k}: no glottocode`);
    for (const g of gs) assert.ok(AT.has(g), `ledger ${k}: ${g} is not a languoid`);
    assert.ok(v.why && v.why.length >= 20, `ledger ${k}: the reason must be written down`);
  }
  for (const s of led.ignore || []) {
    assert.ok((led.ignoreWhy || {})[s] && led.ignoreWhy[s].length >= 20,
      `ledger ignore ${s}: throwing away a share is a decision and needs a reason`);
  }
  /* and the build refuses rather than guessing */
  const b = codeOnly(read('scripts/build-language.mjs'));
  assert.match(b, /UNRESOLVED language names/, 'the build must report what it could not place');
  assert.match(b, /process\.exitCode = 1/, '…and must fail rather than ship a hole');
});

/* ── ⑥ what the source said, kept apart from what it measured ─────────────────────────────── */
test('R538 ⑥ standing and unnamed share are recorded, not folded into the leading language', () => {
  let withRoles = 0, withUnnamed = 0;
  for (const r of Object.values(L.countries)) {
    if (Object.keys(r.roles || {}).length) withRoles++;
    if (r.unnamed > 0) withUnnamed++;
    for (const g of Object.keys(r.roles || {})) assert.ok(AT.has(g), `a standing is recorded for the non-languoid ${g}`);
    /* the unnamed remainder is never given to a language */
    const sum = Object.values(r.mix || {}).reduce((a, b) => a + b, 0);
    assert.ok(sum <= 210, 'a country cannot be more than fully counted twice over');
  }
  assert.ok(withRoles > 150, `only ${withRoles} countries record what their languages officially are`);
  assert.ok(withUnnamed > 40, `only ${withUnnamed} countries record the share the source never named`);
  /* Mozambique is the case: Portuguese is official AND not the most spoken language */
  const mz = L.countries.MOZ;
  assert.ok(Object.values(mz.roles).some((rs) => rs.includes('official')), 'Mozambique must record an official language');
  assert.ok(!(mz.roles[mz.top] || []).includes('official'), 'and its most spoken language is not that one');
});

/* ── ⑦ the model is reachable, so the map and the tree are two views of it ─────────────────── */
test('R538 ⑦ the language model is published, not reverse-engineered from the paint', () => {
  const s = codeOnly(read('js/layer-packs.js'));
  for (const api of ['langName:', 'isoOf:', 'tree:', 'lineage:', 'noShare:']) {
    assert.ok(s.includes(api), `IntMapCulture must publish ${api}`);
  }
  /* the classification is 726 kB and must not be a startup cost */
  assert.match(s, /if\(key==='language'\) loadTree\(\)/, 'the tree is fetched when the layer is turned on');
  const eager = read('src/main.js') + read('js/app-body.js') + read('index.html');
  assert.ok(!/language-tree\.json/.test(eager), 'nothing on the startup path may fetch the classification');
});
