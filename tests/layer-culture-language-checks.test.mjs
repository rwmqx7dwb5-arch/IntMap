/* ============================================================================
 *  The language and religion layers: the data, the classification and the palette
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r266-checks.test.mjs, tests/r268-checks.test.mjs, tests/r538-checks.test.mjs, tests/r271-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r266-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/layer-packs.js・js/wb-layers.js・js/osm-facilities.js・js/precip-annual.js などはレイヤー群のファクトリで DOM・MapLibre・fetch を前提にし node では組み立てられない（データファイルは読み込んで値を検査している） */
/* (#R266) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */
const json = (p) => JSON.parse(read(p));

test('R266 ⑨: religion is split by denomination and language is not sixteen entries', () => {
  const rel = json('data/religion.json'), lang = json('data/language.json');
  assert.ok(Object.keys(rel.countries).length >= 180, 'religion covers ' + Object.keys(rel.countries).length + ' countries');
  assert.ok(Object.keys(lang.countries).length >= 180, 'language covers ' + Object.keys(lang.countries).length + ' countries');
  for (const j of [rel, lang]) assert.match(j.source, /World Factbook/);

  const tops = new Set(Object.values(rel.countries).map((r) => r.top));
  for (const k of ['catholic', 'protestant', 'orthodox']) {
    assert.ok(tops.has(k), 'no country leads with ' + k + ' — the denominations are not separated');
  }
  /* the three are genuinely apart, on the countries the report is about */
  assert.equal(rel.countries.POL.top, 'catholic');
  assert.equal(rel.countries.GRC.top, 'orthodox');
  assert.equal(rel.countries.SWE.top, 'protestant');
  /* …and where the Factbook does NOT separate them, neither does the map */
  assert.equal(rel.countries.GBR.top, 'christian_other');

  const lt = new Set(Object.values(lang.countries).map((r) => r.top));
  assert.ok(lt.size >= 60, 'only ' + lt.size + ' distinct languages lead a country (the old table had 16)');

  const s = read('js/layer-packs.js');
  assert.match(s, /file:'data\/religion\.json'/);
  assert.match(s, /file:'data\/language\.json'/);
  assert.ok(!s.includes("christian:'USA CAN MEX BRA ARG"), 'the hand-typed ISO lists are back');
});
}

/* ══════════ from tests/r268-checks.test.mjs — 3 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/layer-packs.js・js/wb-layers.js・js/osm-facilities.js・js/precip-annual.js などはレイヤー群のファクトリで DOM・MapLibre・fetch を前提にし node では組み立てられない（データファイルは読み込んで値を検査している） */
/* (#R268) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */
const json = (p) => JSON.parse(read(p));
/* ⚠ (#R267) COUNT IN CODE, NOT IN COMMENTS. This file's own prose names the strings it checks for,
   which is how an audit ends up catching itself (nine rounds and counting). Comments are stripped
   before any «does X still exist» question is asked. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ⑧ religion / language ─────────────────────────────────────────────────────────────────── */
test('R268 ⑧ the ex-Yugoslav standards are separate names with one fill', () => {
  const L = json('data/language.json'), T = json('data/language-tree.json');
  /* ⚠ (#R538) THIS USED TO PIN THE ISO TAGS sr / hr / bs / cnr / sh, AND THE TAGS ARE GONE — the
     categories are Glottocodes now, because ISO 639-1 could not tell Mauritian Creole from Haitian.
     Pinning the spelling would only have asserted that the old model was still there. What #R268
     was ABOUT is a property, and the property is checked instead: the three countries lead in three
     DIFFERENT standards, and those standards are siblings under the one language Glottolog holds
     them as standards of — which is the fact the family tree and the shared hue both rest on.
     ⚠ It caught a real regression the day it was rewritten: with the ledger unwritten, «Croatian»
     and «Serbian» both resolved to that parent LANGUAGE, and Croatia's 95.2% Croatian and 1.2%
     Serbian silently added up to one 96.4% figure. */
  const at = new Map(T.g.map((g, i) => [g, i]));
  const ancestors = (g) => { const out = []; let i = at.get(g); while (T.p[i] >= 0) { i = T.p[i]; out.push(T.g[i]); } return out; };
  /* the nearest ancestor Glottolog calls a LANGUAGE — the four standards are dialects of it, with
     one intermediate node (Eastern Herzegovinian Shtokavian) in between */
  const langOf = (g) => ancestors(g).find((a) => T.lv[at.get(a)] === T.levels.indexOf('language')) || null;
  const lead = ['SRB', 'HRV', 'BIH'].map((k) => L.countries[k].top);
  for (const g of lead) assert.ok(at.has(g), `${g} must exist in the language tree`);
  assert.equal(new Set(lead).size, 3, 'Serbia, Croatia and Bosnia must lead in three different standards');
  const joint = langOf(lead[0]);
  assert.ok(joint, 'the standards must descend from the language they are standards of');
  for (const g of lead) assert.equal(langOf(g), joint, `${g} must be a standard of ${joint}`);
  const cnr = Object.keys(L.countries.MNE.mix).find((g) => !lead.includes(g) && g !== joint && langOf(g) === joint);
  assert.ok(cnr, 'Montenegrin must appear in Montenegro as a fourth standard of the same language');
  /* the joint language itself survives ONLY where the source says Serbo-Croat */
  for (const [iso, rec] of Object.entries(L.countries)) {
    if (!(rec.mix || {})[joint]) continue;
    assert.match(rec.src, /Serbo[- ]?Croat/i, `${iso} is bucketed as the joint standard without the source saying so`);
  }
  const s = codeOnly(read('js/layer-packs.js'));
  /* ⚠ (#R270) THE ONE FILL IS GONE, AND THAT IS THE SAME INSTRUCTION CARRIED ONE STEP FURTHER.
     #R268 was told 「塗は同じ色のままでいい」 and kept one colour for the four South-Slavic standards.
     #R270 was then told 「凡例はまだ単に『セルビア語』のまま」 (confirmed: 色の凡例) — with one fill,
     the three rows in the key carry the SAME swatch, so the colour on the map is named by whichever
     row uses it first, and that row is 「セルビア語」. A key whose swatches are not distinct is not a
     key. What #R268 is about — the NAMES are separated and nothing merges them again — is checked
     below and unchanged. */
  assert.ok(!/LANG_ONE_COLOUR/.test(s), 'the shared fill must be gone (#R270), not merely unused');
  /* the platform's own name for the joint standard is the risky one this round is about */
  assert.match(s, /[a-z0-9]{8}:LA\('Serbo-Croatian'/, 'the joint standard must be named Serbo-Croatian, not Serbian (Latin)');
  assert.match(s, /[a-z0-9]{8}:LA\('Montenegrin'/, 'Montenegrin must be named Montenegrin');
});

test('R268 ⑧ every language code the data carries has a name to show', () => {
  const L = json('data/language.json');
  const s = read('js/layer-packs.js');
  /* ⚠ (#R538) THE QUESTION IS THE SAME AND THE ANSWER IS NO LONGER A LIST OF TWELVE. Every
     category used to need a hand-written name because `Intl.DisplayNames` has none for a Pacific
     language; now the data ships Glottolog's own name for every code it uses, so the check is over
     ALL of them rather than over a list somebody remembered to extend. */
  const codes = new Set();
  for (const r of Object.values(L.countries)) { if (r.top) codes.add(r.top); Object.keys(r.mix || {}).forEach((k) => codes.add(k)); (r.listed || []).forEach((k) => codes.add(k)); }
  assert.ok(codes.size > 250, `only ${codes.size} languages in the data — the old hand table carried 89`);
  for (const c of codes) {
    assert.ok(L.names[c] && L.names[c].length > 1, `language ${c} has no name to show`);
    assert.match(c, /^[a-z0-9]{4}\d{4}$/, `${c} is not a Glottocode`);
  }
  /* the hand-written names are still needed and still reachable: each one must name a language the
     data actually carries, or it is a translation nobody will ever see */
  const fixed = [...s.matchAll(/^\s{6}([a-z0-9]{4}\d{4}):LA\(/gm)].map((m) => m[1]);
  assert.ok(fixed.length >= 14, `LANG_FIX names only ${fixed.length} languages`);
  for (const c of fixed) assert.ok(codes.has(c), `${c} is named by hand but no longer in the data — drop it or keep the data`);
});

test('R268 ⑧ the composition popup is a bar chart and states the year', () => {
  const s = codeOnly(read('js/layer-packs.js'));
  const i = s.indexOf('function popupHTML(');
  /* (#R538) the popup grew — it prints the standing the source gives each language and the share
     it never names — so the window that reads it grew with it */
  const body = s.slice(i, i + 8000);
  assert.match(body, /width:'\+w\.toFixed\(1\)\+'%/, 'each row must carry a bar scaled to the largest share');
  assert.match(body, /rec\.y\?/, 'the year must come from the record');
  assert.match(body, /'Data year','データの年'/, 'the year must be labelled');
  /* …and the year is in the data for most of it */
  const R = json('data/religion.json'), L = json('data/language.json');
  const withY = (j) => Object.values(j.countries).filter((r) => r.y).length;
  assert.ok(withY(R) > Object.keys(R.countries).length * 0.8, 'most religion rows must carry a year');
  assert.ok(withY(L) > 60, 'the language rows the Factbook dates must carry a year');
});
}

/* ══════════ from tests/r538-checks.test.mjs — 7 of its 7 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/layer-packs.js・js/wb-layers.js・js/osm-facilities.js・js/precip-annual.js などはレイヤー群のファクトリで DOM・MapLibre・fetch を前提にし node では組み立てられない（データファイルは読み込んで値を検査している）（言語データそのものは読み込んで値を検査している） */
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
}

/* ══════════ from tests/r271-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/layer-packs.js・js/wb-layers.js・js/osm-facilities.js・js/precip-annual.js などはレイヤー群のファクトリで DOM・MapLibre・fetch を前提にし node では組み立てられない（データファイルは読み込んで値を検査している）（パレットの性質はデータから数えて評価している） */
/* (#R271) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */
/* ⚠ (#R267) read CODE, not comments — this file's own prose names the things it checks for, and a
   check that matches its own explanation is the failure this project has paid for eleven times. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

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
}
