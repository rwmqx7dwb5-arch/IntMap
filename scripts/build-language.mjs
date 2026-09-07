/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  IntMap · THE LANGUAGE ENGINE — build the world's languages, not a colour key   (#R538)
 *
 *  WHAT THIS REPLACES
 *  The language layer used to be built by a table of 119 regular expressions inside
 *  build-culture.mjs that turned Factbook prose into ISO 639-1 tags. Anything the table did not
 *  recognise was not «unknown» — it was GONE, and the next language down became the country's
 *  primary one. Measured on the shipped file: Burkina Faso came out Fula 7.8% while the Factbook
 *  says Mossi 52.9%; Namibia came out Afrikaans 9.4% behind Oshiwambo 49.7%; Mozambique came out
 *  Portuguese 16.6% behind Makhuwa 26.1%. Mauritius and the Seychelles both came out as HAITIAN
 *  Creole. Kirundi was recorded as Kinyarwanda. Six Sinitic languages shared one tag.
 *
 *  WHAT IT BUILDS INSTEAD
 *    data/language.json       — per country: every language the Factbook names, in the order it
 *                               names them, with its share when one is published, the ROLE the
 *                               source gives it (official / national / lingua franca / …), and a
 *                               Glottocode. «Most spoken» and «official» stop being the same field.
 *    data/language-tree.json  — the languoid registry: name, level, parent, family, ISO 639-3,
 *                               category and endangerment status, for every family and language
 *                               Glottolog knows plus every dialect a country record points at.
 *                               This is what makes the map and the family tree two views of one
 *                               model rather than two features.
 *
 *  ⚠ WHERE THE SOURCE PUBLISHES NO SHARE, THIS BUILD PUBLISHES NO SHARE. Half the world's
 *  countries get a bare list of official languages out of the Factbook and nothing else. The old
 *  build took the FIRST NAME IN THAT LIST and called it the country's primary language, which is
 *  how Kenya became «English» and the DRC «French» on a map whose legend says «largest share».
 *  Those countries now carry top:null and are drawn in their own colour, and their official
 *  languages are still there — under «official», where they belong.
 *
 *  Usage:  node scripts/build-language.mjs            rebuild from the network
 *          node scripts/build-language.mjs --check    verify the shipped files, offline
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAW, SOURCE_STAMP, deent, j, useCache, countryFiles, isoIndex, isoOf, shortNameOf, yearOf } from './lib/factbook.mjs';
import { loadGlottolog, loadLedger, normName, GLOTTOLOG_STAMP, LEVELS, AES } from './lib/glottolog.mjs';
import { alpha3to2, CLDR_STAMP } from './lib/cldr.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/* the nine languages IntMap speaks; Glottolog carries localized languoid names for some of them */
const UI_LANGS = ['ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh'];

/* ── ROLES ──────────────────────────────────────────────────────────────────────────────────────
   The Factbook states a language's standing in a parenthetical, and the old build threw the
   parenthetical away. «English (official)» in Nigeria and «Hausa» in Nigeria are both true and
   they are not the same claim; a map that cannot tell them apart has to pick one and call it
   «primary». These are the words the Factbook actually uses, measured across its 250 country
   files — not a taxonomy invented here. */
const ROLE_TESTS = [
  [/\bde facto official\b/i, 'de-facto-official'],
  [/\bco-?official\b/i, 'co-official'],
  [/\bregional(ly)? official\b|\bofficial in\b/i, 'regional-official'],
  [/\bminority (language|official)\b/i, 'minority'],
  [/\bnational (language|and official)\b|\bnational\b/i, 'national'],
  [/\blingua franca\b|\btrade language\b|\bcommercial language\b/i, 'lingua-franca'],
  [/\bworking language\b/i, 'working'],
  [/\bofficial\b/i, 'official'],
];

/* ── WHAT IS NOT A LANGUAGE NAME ────────────────────────────────────────────────────────────────
   «other 6.6%», «more than 120 languages and dialects», «numerous indigenous languages». These
   are the Factbook declining to enumerate, and they must not become a language — but they must
   not silently vanish either: they are counted as UNNAMED share, and the popup can say how much of
   a country the source left unnamed. A phrase that is neither a language nor recognised here nor
   bound in the ledger fails the build. */
const DESCRIPTOR = /^(?:other|others|unspecified|undeclared|unknown|no answer|no response|none|no data|est|note|two languages|two mother tongues|multilingual|speakers|more than \d+|over \d+|about \d+|\d+ (?:other )?(?:native |indigenous |local )?(?:languages|dialects)|numerous|many|several|various|minority|indigenous|native|tribal|local|regional|vernacular|foreign|major|european|african|asian|amerindian|mozambican|nordic)\b/i
  ;
/* «Thai and other languages 6.4%», «only other languages 2.9%» — census buckets, not languages.
   «33 Melanesian-Polynesian dialects», «over 500 additional indigenous languages» — counts. */
const BUCKET = /\bother languages?\b|\ball other\b|^\s*\d+\b.*\b(?:languages|dialects)\b/i;

/* ⚠ THE LANGUAGES FIELD IS NOT ONLY A LIST. It ends in sentences: «English is a secondary language
   among the elite», «Turkmen and Syriac are recognized as official languages where native speakers
   of these languages are present». Those are prose about a language, not an entry with a share,
   and a list parser that keeps them invents languages called «english is a secondary among the
   elite». A clause with a finite verb in it is prose. */
const PROSE = /\b(?:is|are|was|were|has|have|includes?|included|serves?|used|spoken|speaking|understood|recognized|recognised|remains?|considered|taught|permitted)\b/i;

/* ── ONE ENTRY IN THE FACTBOOK'S LANGUAGES SENTENCE ─────────────────────────────────────────────
   ⚠ SPLITTING ON COMMAS IS WRONG, AND WRONG IN A WAY THAT LOOKS RIGHT. Algeria's entry is
   «Tamazight (official) (dialects include Kabyle (Taqbaylit), Shawiya (Tacawit), Mzab, Tuareg
   (Tamahaq))» — one language, whose parenthetical contains four commas and three nested
   parentheses. A flat split yields «Tamazight (dialects include Kabyle» and three phantom
   languages. The split below tracks parenthesis depth, so a clause is a clause. */
function splitTop(text) {
  const out = []; let depth = 0, cur = '';
  for (const c of text) {
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    if ((c === ',' || c === ';') && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function stripParens(s) {
  let depth = 0, name = '', parens = '';
  for (const c of s) {
    if (c === '(') { depth++; if (depth === 1) { parens += ' '; continue; } }
    if (c === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) parens += c; else name += c;
  }
  return [name, parens];
}

export function parseLanguages(text) {
  let t = deent(String(text || '')).replace(/<[^>]*>/g, ' ');
  t = t.replace(/\bnote\s*[-–:].*$/is, '');              /* the Factbook's trailing editorial note */
  const out = [];
  for (const chunk of splitTop(t)) {
    let [name, paren] = stripParens(chunk);
    /* «Nyanja 8.1» — Mozambique really does ship one share without its per-cent sign */
    const pm = name.match(/(\d+(?:\.\d+)?)\s*%/) || name.match(/(\d+(?:\.\d+)?)\s*$/);
    const pct = pm ? parseFloat(pm[1]) : null;
    const rawName = name.replace(/\s+/g, ' ').trim();
    name = name.replace(/\d+(?:\.\d+)?\s*%?/g, ' ')
      .replace(/^[\s.]*(?:and|or|incl\.?|includes?|including)\b/i, ' ')
      /* ⚠ QUANTIFIERS ARE NOT PART OF ANYONE'S NAME. «Thai (official) only 90.7%», «German
         (official) less than 1%», «some French» — a closed class of English words about how many,
         which the old build never had to think about because it matched name prefixes. */
      .replace(/\b(?:only|some|about|around|approximately|roughly|at least|less than|more than|over|nearly|mostly|mainly|chiefly|primarily)\b/gi, ' ')
      .replace(/[\s.]+$/, '').replace(/^[\s.]+/, '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    /* ⚠ AND A LANGUAGE NAME IS A PROPER NOUN. Everything the Factbook's languages field contains
       that is not a name — «mountain area languages», «commercial communication», «persons under 5
       or mute», «two mother tongues» — is written entirely in lower case, because it is a
       description and not a name. One test replaces a growing list of phrases to ignore. */
    if (!/[A-ZÀ-Þ]/.test(name)) { out.push({ name, paren: paren.trim(), pct: Number.isFinite(pct) ? pct : null, roles: [], descriptor: true, prose: true }); continue; }
    const roles = [];
    const hay = rawName + ' ' + paren;
    for (const [re, role] of ROLE_TESTS) if (re.test(hay) && !roles.includes(role)) roles.push(role);
    const prose = PROSE.test(name) || name.split(/\s+/).length > 6;
    /* ⚠ TEST THE DESCRIPTOR AGAINST THE CLAUSE AS WRITTEN, NOT AFTER THE NUMBERS COME OUT.
       «more than 120 languages and dialects» and «over 500 additional indigenous languages» are
       the Factbook declining to enumerate; strip their numbers first and they read as the language
       names «more than and» and «over additional indigenous». */
    const isDesc = DESCRIPTOR.test(name) || DESCRIPTOR.test(rawName) || BUCKET.test(name) || BUCKET.test(rawName) || prose;
    out.push({ name, paren: paren.trim(), pct: Number.isFinite(pct) ? pct : null, roles,
      descriptor: isDesc, prose });
  }
  return out;
}

/* «Peuhl/Foulfoulbe/Fulani» and «Standard Chinese or Mandarin» are one language written three
   ways and two ways. Try the whole string first — some real names contain a slash — then the
   alternatives, left to right. */
function alternates(name) {
  const out = [name];
  if (/\//.test(name)) for (const p of name.split('/')) if (p.trim()) out.push(p.trim());
  if (/\bor\b/i.test(name)) for (const p of name.split(/\bor\b/i)) if (p.trim()) out.push(p.trim());
  return out;
}

/* ═══ BUILD ════════════════════════════════════════════════════════════════════════════════════ */
async function build() {
  useCache(ROOT);
  console.log('Glottolog …');
  const G = await loadGlottolog(ROOT);
  const led = loadLedger(ROOT);
  console.log('  languoids', G.nodes.size);

  console.log('Factbook …');
  const byName = await isoIndex();
  A2 = await alpha3to2(ROOT);
  for (const [i3, i2] of byName.alpha2) if (!A2.has(i3)) A2.set(i3, i2);
  const files = await countryFiles();
  console.log('  country files', files.length);

  const countries = {}, unresolved = new Map(), usedLedger = new Set(), audit = new Map();
  let missed = [];
  for (const f of files) {
    let d; try { d = await j(RAW + f); } catch (e) { console.log('skip', f, e.message); continue; }
    const iso = isoOf(byName, shortNameOf(d));
    if (!iso) { missed.push(f); continue; }
    const ps = d['People and Society'] || {};
    const text = ((ps.Languages || {}).Languages || {}).text || (ps.Languages || {}).text || '';
    if (!text) continue;
    const cc = iso2of(iso);
    const rec = fromText(text, cc, G, led, unresolved, usedLedger, audit);
    if (rec) countries[iso] = rec;
    process.stdout.write('.');
  }
  console.log('\n  countries', Object.keys(countries).length, missed.length ? '(unmatched files ' + missed.length + ')' : '');

  if (audit.size) {
    console.log('\nresolved by resemblance (' + audit.size + ') — check each one:');
    for (const k of [...audit.keys()].sort()) console.log('  ' + k);
  }

  /* ⚠ AN UNRESOLVED NAME IS NOT A WARNING, IT IS A STOP. The failure this build exists to fix was
     exactly a name silently going missing, so a name this build cannot place must be placed by a
     person — in data/language-aliases.json, with the reason written next to it. */
  if (unresolved.size) {
    console.error('\nUNRESOLVED language names (' + unresolved.size + '). Bind each one in data/language-aliases.json:');
    for (const [k, v] of [...unresolved].sort((a, b) => b[1].n - a[1].n)) {
      console.error('  ' + k.padEnd(38) + ' ×' + v.n + '  ' + v.how + (v.cands ? '  candidates: ' + v.cands.map((g) => G.nodes.get(g).name + ' [' + g + ']').join(' | ') : '') + '   seen in ' + v.where.slice(0, 4).join(','));
    }
    process.exitCode = 1;
    return;
  }

  writeFiles(countries, G, led);
}

/* ISO 3166 alpha-3 → alpha-2, which is how Glottolog spells countries. DERIVED FROM TWO
   STANDARDS, NOT TABULATED HERE: CLDR carries the ISO assignment, and Natural Earth carries the
   codes ISO never assigned (Kosovo is XKX/XK to everyone and ISO to nobody). A fourth hand-typed
   country table in this repository is a fourth country table to keep in step. */
let A2 = null;
function iso2of(iso3) { return (A2 && A2.get(iso3)) || null; }

/* one written name → one Glottocode, or nothing. The ledger outranks the rules, because a person
   who wrote down a reason outranks a rule that could not decide. */
function resolveName(name, cc, G, led, usedLedger) {
  const bound = led.lookup(name, cc);
  if (bound) { usedLedger.add(normName(name) + '@' + cc); usedLedger.add(normName(name)); return { g: bound.g, how: 'ledger' }; }
  let soft = null;
  for (const alt of alternates(name)) {
    const b = led.lookup(alt, cc);
    if (b) { usedLedger.add(normName(alt) + '@' + cc); usedLedger.add(normName(alt)); return { g: b.g, how: 'ledger' }; }
    const r = G.resolve(alt, cc);
    if (r.g) return r;
    if (!soft && r.how === 'ambiguous') soft = r;
  }
  for (const alt of alternates(name)) {
    const r = G.resolveFuzzy(alt, cc);
    if (r.g) return r;
  }
  return soft || { g: null, how: 'unmatched' };
}

/* every match a rule made by resemblance rather than by name is printed at the end of the build,
   because a rule that resolves names nobody checked is a rule that resolves them wrongly */
function note(audit, name, cc, hit) {
  if (!/^(spelling|class-prefix|word-order|macrolanguage)/.test(hit.how || '')) return;
  const k = name + ' @' + cc + '  →  ' + hit.how;
  audit.set(k, (audit.get(k) || 0) + 1);
}

function fromText(text, cc, G, led, unresolved, usedLedger, audit) {
  const parsed = parseLanguages(text);
  const entries = [];
  for (const e of parsed) {
    /* ⚠ THE LEDGER IS CONSULTED BEFORE THE RULES, INCLUDING ITS «IGNORE» SIDE. Namibia's «Zambezi
       languages 4.9%» names a region's languages, and the alternative-name index will happily
       resolve it to Tonga (Zambia) if asked — so it must not be asked. A decision a person wrote
       down outranks a rule that cannot know it is wrong. */
    if (e.descriptor || led.ignored(e.name)) { entries.push({ ...e, g: null, kind: 'unnamed' }); continue; }
    /* ⚠ ONE CLAUSE CAN NAME SEVERAL LANGUAGES BECAUSE THE SOURCE HAS A TYPO. Congo-Brazzaville's
       entry reads «French Lingala and Monokutuba (trade languages)» — a missing comma, and no rule
       can invent one. A ledger row may therefore bind a phrase to a LIST, and the share (there is
       none here) is never split between them. */
    const many = led.lookup(e.name, cc);
    if (many && many.gs) {
      for (const g of many.gs) entries.push({ ...e, pct: null, g, how: 'ledger', kind: 'language' });
      if (e.pct != null) entries.push({ ...e, g: null, kind: 'unnamed' });
      usedLedger.add(normName(e.name) + '@' + cc); usedLedger.add(normName(e.name));
      continue;
    }
    const hit = resolveName(e.name, cc, G, led, usedLedger);
    if (hit.g) { note(audit, e.name, cc, hit); entries.push({ ...e, g: hit.g, how: hit.how, kind: 'language' }); continue; }

    /* ⚠ «GILAKI AND MAZANDARANI» IS TWO LANGUAGES, AND «FRENCH, LINGALA AND MONOKUTUBA» IS THREE.
       The Factbook joins languages with «and» both when it is listing them and when it is counting
       the people who speak the combination. Splitting keeps all of them on the map — and the share,
       when there is one, is NOT given to any of them, because the source did not say how it
       divides. It goes to the unnamed remainder, where it can be seen and not mistaken. */
    const parts = e.name.split(/\s*,\s*|\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      const got = parts.map((p) => ({ p, desc: DESCRIPTOR.test(p), r: null }));
      for (const x of got) if (!x.desc) x.r = resolveName(x.p, cc, G, led, usedLedger);
      const named2 = got.filter((x) => x.r && x.r.g);
      if (named2.length && got.every((x) => x.desc || (x.r && x.r.g))) {
        /* ⚠ A SHARE IS ONLY UNATTRIBUTABLE WHEN THERE IS MORE THAN ONE LANGUAGE TO ATTRIBUTE IT TO.
           Liberia's entry is «English 20% (official) and 27 indigenous languages» — one language and
           a phrase that names none, so the 20% is English's and giving it to the unnamed remainder
           left Liberia with no leading language at all. Two or more named languages IS ambiguous
           («Gilaki and Mazandarani»), and then the share goes to the remainder, where it can be seen. */
        const sole = named2.length === 1;
        for (const x of named2) { note(audit, x.p, cc, x.r); entries.push({ ...e, name: x.p, pct: sole ? e.pct : null, g: x.r.g, how: x.r.how + '+split', kind: 'language' }); }
        if (!sole && e.pct != null) entries.push({ ...e, g: null, kind: 'unnamed' });
        continue;
      }
    }

    if (led.ignored(e.name)) { entries.push({ ...e, g: null, kind: 'unnamed' }); continue; }
    const k = normName(e.name);
    let u = unresolved.get(k);
    if (!u) { u = { n: 0, how: hit.how, cands: hit.cands, where: [] }; unresolved.set(k, u); }
    u.n++; if (cc && !u.where.includes(cc)) u.where.push(cc);
  }
  if (!entries.length) return null;

  const named = entries.filter((e) => e.g);
  const measured = named.filter((e) => e.pct != null);
  const mix = {};
  for (const e of measured) mix[e.g] = Math.round(((mix[e.g] || 0) + e.pct) * 10) / 10;
  const ranked = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  const roles = {};
  for (const e of named) if (e.roles.length) roles[e.g] = [...new Set([...(roles[e.g] || []), ...e.roles])];

  return {
    /* ⚠ top is the LARGEST MEASURED SHARE or nothing at all. It is never «the first one listed». */
    top: ranked.length ? ranked[0][0] : null,
    pct: ranked.length ? ranked[0][1] : null,
    shareType: ranked.length ? 'measured' : 'listed',
    mix,
    /* in the order the source names them, each language once — Niue's entry names Niuean three
       times in one sentence and the list is a list of languages, not of mentions */
    listed: named.map((e) => e.g).filter((g, i, a) => a.indexOf(g) === i),
    roles,
    unnamed: Math.round(entries.filter((e) => !e.g && e.pct != null).reduce((s, e) => s + e.pct, 0) * 10) / 10 || 0,
    y: yearOf(text),
    src: text.slice(0, 400),
  };
}

function writeFiles(countries, G, led) {
  /* the tree carries every family and language Glottolog knows, plus the dialects the country
     records actually point at (the four post-Yugoslav standards are dialects of one language) */
  const keep = new Set();
  for (const n of G.nodes.values()) if (n.level !== 'dialect' && G.usable(n.g)) keep.add(n.g);
  for (const rec of Object.values(countries)) for (const g of rec.listed) {
    let cur = g;
    while (cur && !keep.has(cur)) { keep.add(cur); cur = (G.nodes.get(cur) || {}).parent; }
  }
  const ids = [...keep].sort();
  const at = new Map(ids.map((g, i) => [g, i]));
  const N = (g) => G.nodes.get(g);
  const tree = {
    ...GLOTTOLOG_STAMP,
    built: new Date().toISOString().slice(0, 10),
    levels: LEVELS,
    aesScale: AES,
    /* parallel arrays: one repeated key per node costs more than the node */
    g: ids,
    n: ids.map((g) => N(g).name),
    lv: ids.map((g) => LEVELS.indexOf(N(g).level)),
    p: ids.map((g) => (N(g).parent != null && at.has(N(g).parent) ? at.get(N(g).parent) : -1)),
    ae: ids.map((g) => (N(g).aes ? AES.indexOf(N(g).aes) : -1)),
    cat: ids.map((g) => N(g).cat),
    iso: ids.map((g) => N(g).iso || ''),
  };
  const treeFile = path.join(ROOT, 'data', 'language-tree.json');
  fs.writeFileSync(treeFile, JSON.stringify(tree));

  /* names, only for the codes the map itself needs — the tree file carries the rest */
  const used = new Set();
  for (const rec of Object.values(countries)) { if (rec.top) used.add(rec.top); for (const g of rec.listed) used.add(g); }
  const names = {}, loc = {}, iso = {};
  for (const g of [...used].sort()) {
    names[g] = N(g).name;
    /* the ISO 639-3 code is what lets the browser name a language in the reader's own language;
       Glottolog's own localized names cover the rest, and neither is invented */
    if (N(g).iso) iso[g] = N(g).iso;
    const l = G.localized.get(g);
    if (l) { const keepL = {}; for (const k of UI_LANGS) if (l[k]) keepL[k] = l[k]; if (Object.keys(keepL).length) loc[g] = keepL; }
  }
  const out = {
    ...SOURCE_STAMP,
    built: new Date().toISOString().slice(0, 10),
    glottolog: GLOTTOLOG_STAMP,
    names, iso, loc, countries,
  };
  const file = path.join(ROOT, 'data', 'language.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('wrote data/language.json', fs.statSync(file).size, 'B ·', Object.keys(countries).length, 'countries ·', Object.keys(names).length, 'languoids');
  console.log('wrote data/language-tree.json', fs.statSync(treeFile).size, 'B ·', ids.length, 'nodes');
  const withShare = Object.values(countries).filter((c) => c.shareType === 'measured').length;
  console.log('  measured share', withShare, '· listed only', Object.keys(countries).length - withShare);
}

/* ═══ CHECK — offline, and it is the gate ══════════════════════════════════════════════════════ */
function check() {
  const fail = [];
  const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'language.json'), 'utf8'));
  const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'language-tree.json'), 'utf8'));
  const led = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'language-aliases.json'), 'utf8'));
  const at = new Map(T.g.map((g, i) => [g, i]));

  const cs = Object.entries(L.countries || {});
  if (cs.length < 180) fail.push('only ' + cs.length + ' countries (expected ≥180)');

  for (const [iso, r] of cs) {
    for (const g of r.listed || []) {
      if (!at.has(g)) fail.push(iso + ': ' + g + ' is not in language-tree.json');
      if (!L.names[g]) fail.push(iso + ': ' + g + ' has no name');
    }
    /* ⚠ top must BE the largest measured share, not merely look like one. This is the check that
       would have caught Burkina Faso, and did not exist. */
    const ranked = Object.entries(r.mix || {}).sort((a, b) => b[1] - a[1]);
    if (ranked.length) {
      if (r.top !== ranked[0][0]) fail.push(iso + ': top=' + r.top + ' but largest share is ' + ranked[0][0]);
      if (r.pct !== ranked[0][1]) fail.push(iso + ': pct=' + r.pct + ' but largest share is ' + ranked[0][1]);
      if (r.shareType !== 'measured') fail.push(iso + ': has shares but shareType=' + r.shareType);
    } else {
      if (r.top !== null) fail.push(iso + ': no measured share but top=' + r.top);
      if (r.shareType !== 'listed') fail.push(iso + ': no shares but shareType=' + r.shareType);
    }
    for (const g of Object.keys(r.roles || {})) if (!at.has(g)) fail.push(iso + ': role on unknown ' + g);
  }

  /* the tree must be a tree: every parent resolves, no node is its own ancestor */
  for (let i = 0; i < T.g.length; i++) {
    const p = T.p[i];
    if (p === -1) continue;
    if (p < 0 || p >= T.g.length) { fail.push(T.g[i] + ': parent index out of range'); continue; }
    let cur = p, hops = 0;
    while (cur !== -1 && hops++ < 64) { if (cur === i) { fail.push(T.g[i] + ': cycle in the tree'); break; } cur = T.p[cur]; }
  }
  if (T.g.length !== new Set(T.g).size) fail.push('language-tree.json has duplicate glottocodes');

  /* a ledger entry nobody used is a decision about a name the source no longer prints */
  const seen = new Set();
  for (const [, r] of cs) for (const g of r.listed || []) seen.add(g);
  for (const [k, v] of Object.entries(led.bind || {})) {
    const gs = v && (v.gs || (v.g ? [v.g] : null));
    if (!gs || !gs.length) fail.push('ledger ' + k + ': no glottocode');
    else for (const g of gs) if (!at.has(g)) fail.push('ledger ' + k + ': ' + g + ' is not in the tree');
    if (!v || !v.why || v.why.length < 12) fail.push('ledger ' + k + ': no reason written down');
  }
  /* ⚠ AND A REASON IS REQUIRED FOR EVERY IGNORED PHRASE TOO. «Ignore» throws away a share; that is
     a decision, and an undocumented decision is indistinguishable from an oversight. */
  for (const s of led.ignore || []) if (!(led.ignoreWhy || {})[s] || led.ignoreWhy[s].length < 12) fail.push('ledger ignore ' + s + ': no reason written down');

  if (fail.length) { console.error('language check FAILED'); for (const f of fail.slice(0, 60)) console.error('  · ' + f); if (fail.length > 60) console.error('  … and ' + (fail.length - 60) + ' more'); process.exitCode = 1; return; }
  console.log('language check ok ·', cs.length, 'countries ·', T.g.length, 'languoids ·',
    cs.filter(([, r]) => r.shareType === 'measured').length, 'with a measured share');
}

if (CHECK) check(); else await build();
