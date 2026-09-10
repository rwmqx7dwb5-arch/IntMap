#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/histeras-names.json — the deep past, in nine languages      (#R686)
 * ----------------------------------------------------------------------------
 *  ══ WHAT WAS THERE BEFORE, MEASURED (2026-09-11) ═══════════════════════════════════════════
 *  data/hist-eras.js ships 53 world snapshots and 10,212 named features, and every name on every
 *  one of them is `{en:…}` — the upstream cartographer's English. So EVERY name before 1850 was
 *  English in all nine languages: a Japanese reader in 323 BC read "Empire of Alexander", and in
 *  1500 read "Kalmar Union". The 1850–1885 record beside it (data/hist-borders.js) has carried
 *  nine languages since #R224, because OpenHistoricalMap tags them; this upstream has one NAME
 *  field and nothing else, which is why the deep past was left behind.
 *  ⚠ `npm run check:i18n` passes on all of it and always did — it audits the app's own string
 *  tables, and these are data. Nothing was going to notice.
 *
 *  ══ WHAT COULD BE FILLED, MEASURED BEFORE ANY OF IT WAS DESIGNED ═══════════════════════════
 *  The 10,212 features hold 3,028 DISTINCT names (a name is drawn in up to 36 snapshots), so the
 *  translation unit is the string. Of those 3,028:
 *    · 13 carry the upstream's own `wikipedia` link — 0.4%. There is no identifier to join on.
 *    · a first sweep on exact English Wikipedia titles resolved 1,335 (44.1%), and 353 of those
 *      were Wikimedia DISAMBIGUATION PAGES — "Ainu" resolved to Q226570, whose Korean label is
 *      "아이누 (동음이의)". A quarter of what a spelling match returns is not a thing at all.
 *    · a large part of the remainder is not a polity name in any language. The upstream writes
 *      prose where it has no polity to name: "Australian aboriginal hunter-gatherers" (36
 *      snapshots), "Savanna hunter-gatherers", "Plain bison hunters", "West African cereal
 *      farmers", and typos of its own making ("Khoiasan", "Plateau fichers"). No source on earth
 *      carries those in Japanese, because they are one cartographer's English sentences.
 *  So the honest ceiling was never 100%, and this build does not pretend to one: what it cannot
 *  attest it does not write, and the upstream English stands — the rule #R679 set for the city
 *  names, and the rule js/time-borders.js already followed for the 1850–1885 record.
 *
 *  ══ HOW A NAME IS DECIDED ══════════════════════════════════════════════════════════════════
 *  scripts/histeras/harvest.mjs finds EVERY Wikidata item carrying the string as an English
 *  label or alias — no ranking, no first hit — and scripts/histeras/match.mjs decides, by
 *  agreement with the map's own geometry and clock. Both are separate files because the second
 *  is pure and is EVALUATED by the gate.
 *
 *      node scripts/build-histeras-names.mjs --fetch    # candidates + facts (network, cached)
 *      node scripts/build-histeras-names.mjs            # build data/histeras-names.json
 *      node scripts/build-histeras-names.mjs --check    # verify the COMMITTED file (offline)
 *      node scripts/build-histeras-names.mjs --sweep    # re-measure the tolerance table
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { census, eraBundle } from './histeras/census.mjs';
import { candidatesFor, factsFor, rejectedClasses, CACHE } from './histeras/harvest.mjs';
import { decide, score, labelsFor, plainLabel, timeSlack, REJECT } from './histeras/match.mjs';
import { timeBorders } from './histeras/time-borders.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'histeras-names.json');
const CAND = join(CACHE, 'candidates.json');

export const V = 1;
export const SRC = 'Wikidata (wikidata.org) · CC0 1.0 Universal (wikidata.org/wiki/Wikidata:Licensing, read 2026-09-11)';

/* ── the nine languages come from the app's own registry, evaluated ──────────
   js/locales/_langs.js is generated from js/locales/ itself, so a tenth language reaches this
   build with no edit here. The BIT ORDER of the attestation mask is this array's order. */
export function appLangs(root = ROOT) {
  const w = {};
  new Function('window', readFileSync(join(root, 'js', 'locales', '_langs.js'), 'utf8'))(w);
  const codes = w.INTMAP_LANGS || (w.IntMapLangCodes);
  if (!Array.isArray(codes) || !codes.length) throw new Error('js/locales/_langs.js published no language list');
  return codes.slice();
}

/* ── Chinese ────────────────────────────────────────────────────────────────
   The two orthographies are one language written twice, and #R224 settled that IntMap never
   hand-writes the second: whichever one a source gives is normalised and the other is converted
   from it. The attestation mask records which one the SOURCE wrote — a converted sibling is a
   real name to read and not a second attestation. */
async function converters() {
  const OpenCC = (await import('opencc-js')).default;
  return { t2s: OpenCC.Converter({ from: 'tw', to: 'cn' }), s2t: OpenCC.Converter({ from: 'cn', to: 'tw' }) };
}

function loadCandidates() {
  if (!existsSync(CAND)) throw new Error('no candidate cache — run `node scripts/build-histeras-names.mjs --fetch` first');
  return JSON.parse(readFileSync(CAND, 'utf8'));
}

async function fetchAll() {
  const rows = census(eraBundle(ROOT));
  const log = (s) => process.stderr.write('  ' + s + '\r');
  const byName = await candidatesFor(rows.map((r) => r.name), log);
  const qids = new Set(); for (const m of byName.values()) for (const q of m.keys()) qids.add(q);
  process.stderr.write('\n  ' + qids.size + ' distinct candidate items\n');
  const facts = await factsFor(qids, log);
  const classes = new Set(); for (const f of Object.values(facts)) for (const c of f.p31) classes.add(c);
  const internal = await rejectedClasses(classes);
  process.stderr.write('\n  ' + internal.size + ' of ' + classes.size + ' candidate classes are not a kind this map draws\n');
  const out = { byName: Object.fromEntries([...byName].map(([n, m]) => [n, [...m].map(([q, ex]) => [q, ex ? 1 : 0])])), facts, internal: [...internal] };
  writeFileSync(CAND, JSON.stringify(out));
  console.log('cached ' + Object.keys(out.byName).length + ' names, ' + Object.keys(facts).length + ' items → ' + CAND);
}

function candsOf(store, name) {
  return (store.byName[name] || []).map(([q, ex]) => {
    const f = store.facts[q] || { labels: {}, coord: null, starts: [], ends: [], p31: [], geo: false };
    return { qid: q, exact: !!ex, ...f };
  });
}

async function build() {
  const bundle = eraBundle(ROOT);
  const YEARS = bundle.snaps.map((s) => s.y);
  const rows = census(bundle);
  const store = loadCandidates();
  const internal = new Set(store.internal);
  const langs = appLangs(ROOT);
  const { t2s, s2t } = await converters();
  /* ══ ⚠ A NAME THE OLD TABLES ALREADY ANSWER IS NOT WRITTEN HERE ═══════════════════════════
     js/time-borders.js localizes era names by RECOGNISING English ones, out of four hand-written
     tables (IntMapHistStates.STATES 19, _VANISHED 8, _ERA_LOC 242, _COLONIZER 26) consulted in
     one order. `tagSame` reads `_i18n` FIRST, so a name in both lanes would have two answers and
     only ever show one — the shape #R536 paid for, where a second branch quietly stopped being
     reachable. Measured 2026-09-11 those tables answer 250 of the 3,028 names in Japanese and
     Russian and only 107 in French, Korean and both Chinese scripts (the four languages that
     reach them through the inline tables rather than the five positional slots), so this is a
     real overlap and not a formality. The tables are EVALUATED for the answer, not read.
     ⚠ ONE FURTHER PATH IS NOT PART OF THIS MEASUREMENT AND DOES NOT NEED TO BE: `_eraLocName`'s
     last resort matches `countryStats`, which does not exist outside a browser. It cannot collide
     — `tagSame` sends a feature whose name IS a present-day country down the `_same` branch and
     labels it with that country's own localized name, before `_locName` is ever computed. */
  const owned = new Set();
  for (const lg of langs) {
    if (lg === 'en') continue;
    const { api } = timeBorders({ lang: lg });
    for (const row of rows) if (api.eraLocName(row.name)) owned.add(row.name);
  }

  const names = {}; const why = { 'hand-table': 0 };
  let decided = 0, qualified = 0;
  for (const row of rows) {
    if (owned.has(row.name)) { why['hand-table']++; continue; }
    const d = decide(row, candsOf(store, row.name), internal, YEARS);
    if (!d.qid) { why[d.why] = (why[d.why] || 0) + 1; continue; }
    const ent = store.facts[d.qid];
    const raw = labelsFor(ent);
    /* a label that carries a bracketed qualifier is a disambiguation, not a map label */
    for (const k of Object.keys(raw)) if (!plainLabel(raw[k])) { delete raw[k]; qualified++; }
    const att = new Set(Object.keys(raw));                 /* what a source actually wrote */
    /* Chinese: normalise the attested orthography, convert the other one */
    if (raw.zh) raw.zh = s2t(raw.zh);
    if (raw['zh-hans']) raw['zh-hans'] = t2s(raw['zh-hans']);
    if (raw.zh && !raw['zh-hans']) raw['zh-hans'] = t2s(raw.zh);
    else if (raw['zh-hans'] && !raw.zh) raw.zh = s2t(raw['zh-hans']);
    /* ⚠ ENGLISH IS THE UPSTREAM'S, ALWAYS. Wikidata's English label is a second opinion about
       the same shape, and shipping it would silently rename the map in its own language. */
    delete raw.en; att.delete('en');
    const n = {};
    for (const code of langs) {
      if (code === 'en') continue;
      const v = raw[code];
      if (v && v !== row.name) n[code] = v;                /* identical to English carries nothing */
    }
    let a = 0; for (const code of att) { const i = langs.indexOf(code); if (i >= 0) a |= (1 << i); }
    if (!Object.keys(n).length && !a) continue;            /* nothing to say about this name */
    names[row.name] = { q: d.qid, a, n };
    decided++;
  }
  const doc = { v: V, src: SRC, built: new Date().toISOString().slice(0, 10), langs, names };
  writeFileSync(OUT, JSON.stringify(doc));
  const per = Object.fromEntries(langs.filter((l) => l !== 'en').map((l) => [l, 0]));
  for (const r of Object.values(names)) for (const l of Object.keys(r.n)) per[l]++;
  console.log('data/histeras-names.json — ' + decided + ' of ' + rows.length + ' names decided ('
    + (100 * decided / rows.length).toFixed(1) + '%), ' + (Buffer.byteLength(JSON.stringify(doc)) / 1024).toFixed(0) + ' kB');
  console.log('  per language: ' + Object.entries(per).map(([k, v]) => k + ' ' + v).join(' · '));
  console.log('  refused: ' + Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · '));
  console.log('  ' + qualified + ' label(s) dropped for carrying a bracketed qualifier');
}

/* `--sweep` — what the two slacks are actually worth on this corpus. It prints the gap RELATIVE
   to the row's own slack, because that is what the rule compares: 1.0 is the edge of agreement. */
function sweep() {
  const bundle = eraBundle(ROOT);
  const YEARS = bundle.snaps.map((s) => s.y);
  const rows = census(bundle);
  const store = loadCandidates();
  const internal = new Set(store.internal);
  const sp = [], tm = [], slT = [];
  for (const row of rows) {
    const ts = timeSlack(row, YEARS);
    slT.push(ts);
    for (const c of candsOf(store, row.name)) {
      const v = score(row, c, internal, YEARS);
      if (v.space != null) sp.push(v.space);
      if (v.time != null) tm.push(v.time / ts);
    }
  }
  const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
  const pc = (a, f) => (100 * a.filter(f).length / a.length).toFixed(1) + '%';
  console.log('coordinate-bearing candidates, n=' + sp.length + ': inside a drawn shape ' + pc(sp, (d) => d === 0));
  console.log('time slack per row (years): p10 ' + q(slT, .1) + ' p50 ' + q(slT, .5) + ' p90 ' + q(slT, .9));
  console.log('  gap / slack, n=' + tm.length + ': overlapping ' + pc(tm, (d) => d === 0)
    + ' · within slack ' + pc(tm, (d) => d <= 1) + ' · p50 ' + q(tm, .5).toFixed(2) + ' p90 ' + q(tm, .9).toFixed(1));
}

/* ── --check: the committed file, offline ──────────────────────────────────── */
function check() {
  if (!existsSync(OUT)) throw new Error('data/histeras-names.json is missing');
  const doc = JSON.parse(readFileSync(OUT, 'utf8'));
  const fail = (m) => { throw new Error('data/histeras-names.json: ' + m); };
  if (doc.v !== V) fail('v is ' + doc.v + ', expected ' + V);
  if (typeof doc.src !== 'string' || !/wikidata/i.test(doc.src) || !/CC0/.test(doc.src)) fail('src must name Wikidata and CC0');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.built || '')) fail('built is not a date');
  const langs = appLangs(ROOT);
  if (JSON.stringify(doc.langs) !== JSON.stringify(langs)) fail('langs ' + JSON.stringify(doc.langs) + ' is not the app registry ' + JSON.stringify(langs));
  const rows = census(eraBundle(ROOT));
  const known = new Map(rows.map((r) => [r.name, r]));
  let rowsN = 0, strings = 0;
  for (const [name, rec] of Object.entries(doc.names || {})) {
    rowsN++;
    /* ⚠ A KEY THAT NAMES NOTHING IS A STALE ROW. The table is keyed by the upstream's own string,
       so every key must still be drawn by data/hist-eras.js — otherwise the two files have parted
       and the table would answer for a name the map no longer has. */
    if (!known.has(name)) fail('names["' + name + '"] is not a name in data/hist-eras.js');
    if (!/^Q\d+$/.test(rec.q || '')) fail('names["' + name + '"].q is not a Wikidata item id');
    if (!Number.isInteger(rec.a) || rec.a < 0 || rec.a >= (1 << langs.length)) fail('names["' + name + '"].a is not a mask over ' + langs.length + ' languages');
    if (rec.a & 1 << langs.indexOf('en')) fail('names["' + name + '"] claims an English attestation — English is the upstream\'s');
    for (const [code, v] of Object.entries(rec.n || {})) {
      strings++;
      if (!langs.includes(code)) fail('names["' + name + '"].n has "' + code + '", which is not an app language');
      if (code === 'en') fail('names["' + name + '"].n carries English — English is the upstream\'s');
      if (typeof v !== 'string' || !v.trim()) fail('names["' + name + '"].n.' + code + ' is not a name');
      if (v === name) fail('names["' + name + '"].n.' + code + ' repeats the English — such a row carries nothing');
      if (v.includes('�')) fail('names["' + name + '"].n.' + code + ' contains U+FFFD');
    }
  }
  if (!rowsN) fail('no names at all');
  console.log('data/histeras-names.json ok — ' + rowsN + ' names, ' + strings + ' localized strings, '
    + langs.length + ' languages, src ' + JSON.stringify(doc.src.slice(0, 40) + '…'));
}

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
try {
  if (has('--fetch')) await fetchAll();
  else if (has('--check')) check();
  else if (has('--sweep')) sweep();
  else await build();
} catch (e) { console.error(String(e && e.message || e)); process.exit(1); }
