#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/histnames.json — one historical-name table for three records   (#R695)
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ WHETHER A HISTORICAL NAME REACHED A READER IN THEIR LANGUAGE WAS DECIDED BY WHICH RECORD
 *  HAPPENED TO ANSWER THAT YEAR. Measured on main, 2026-09-11, as a fraction of the features each
 *  record actually draws:
 *
 *      data/cshapes.js       1886–2019   de 32.0%  fr 18.6%  jp 38.0%  ko 18.6%  zh 18.6%
 *      data/hist-borders.js  1689–1885   de 57.5%  fr 71.0%  jp 65.7%  ko 87.1%  zh 64.4%
 *      data/hist-eras.js     ≤ 1688      de 20.5%  fr 18.2%  jp 31.4%  ko 22.8%  zh 24.8%
 *
 *  The middle band is high because OpenHistoricalMap writes `name:xx` itself. The bottom band got
 *  #R686's Wikidata lane. The TOP band — the years a reader visits most — had nothing but
 *  js/time-borders.js's hand-written tables, so a French reader standing in 1950 read「Japan」,
 *  「Brazil」,「Egypt」. Three records, three different lucks, one kind of question.
 *
 *  ⇒ THE RULE GOES ON THE NAME, NOT ON THE RECORD (#R429). This build asks the question once and
 *  answers for all three, in three lanes that are three DIFFERENT kinds of evidence:
 *
 *    · identifier — data/hist-borders.js states the polity's QID on 1,305 of its 1,411 features,
 *      because OHM tagged it. An identifier is not a spelling: there is no ranker to get it wrong
 *      and nothing to make agree (#R515 does not apply). Ask Wikidata and stop.
 *    · measure — cshapes and the era snapshots have no identifier, so #R686's rule stands: every
 *      item carrying the English string, scored against WHERE the map draws the shape and WHEN,
 *      and a tie refused. That code is not copied — scripts/histeras/match.mjs is imported.
 *    · prose — the era cartographer writes English SENTENCES where there is no polity to name.
 *      scripts/histnames/prose.mjs decides which strings those are, by measure, and
 *      scripts/histnames/prose-text.mjs says them in the reader's language. Marked `d:1`.
 *
 *  ⚠ THIS FILE SUPERSEDES scripts/build-histeras-names.mjs AND data/histeras-names.json. Keeping
 *  both would put two answers for one era name in two files, which is the state AGENTS.md §9
 *  forbids and #R536 shows the cost of: `tagSame` reads one of them first, and the other quietly
 *  stops being reachable. Every row #R686 shipped is rebuilt here from the same cache by the same
 *  matcher; nothing it could answer is lost.
 *
 *  ⚠ THE SHIPPED LANGUAGES ARE A POLICY AND LIVE IN ONE PLACE — scripts/histnames/langs.mjs. The
 *  harvest always asks for all nine; only the table is narrowed. Nothing here names a language.
 *
 *      node scripts/build-histnames.mjs --fetch   # candidates, facts, classes, QID labels (cached)
 *      node scripts/build-histnames.mjs           # build data/histnames.json
 *      node scripts/build-histnames.mjs --check    # rebuild and compare with what is shipped
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { census, eraBundle } from './histeras/census.mjs';
import { candidatesFor, factsFor, rejectedClasses, acceptedClasses, labelsByQid, CACHE } from './histeras/harvest.mjs';
import { decide, labelsFor, plainLabel } from './histeras/match.mjs';
import { timeBorders } from './histeras/time-borders.mjs';
import { shipLangs, attestedLangs, appLangs } from './histnames/langs.mjs';
import { censusCShapes, censusHistBorders, histBordersQidGaps, bundle } from './histnames/records.mjs';
import { commonWords, isProse } from './histnames/prose.mjs';
import { PROSE } from './histnames/prose-text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'histnames.json');
const CAND = join(CACHE, 'candidates.json');
const CS_CAND = join(CACHE, 'candidates-cshapes.json');
const QLAB = join(CACHE, 'qid-labels.json');

export const V = 1;
export const SRC = {
  wikidata: 'Wikidata (wikidata.org) · CC0 1.0 Universal (wikidata.org/wiki/Wikidata:Licensing, read 2026-09-11)',
  prose: 'IntMap — translation of the upstream cartographer’s own English description (aourednik/historical-basemaps), not a name any source attests',
};

/* ── Chinese ────────────────────────────────────────────────────────────────
   Two orthographies of one language. #R224 settled that IntMap never hand-writes the second:
   whichever a source gives is normalised and the other converted from it, and the attestation
   mask records which one the SOURCE wrote. Loaded lazily because it only matters when the
   shipped set contains a Chinese code — under the amended policy it does not. */
async function converters(langs) {
  if (!langs.some((l) => l === 'zh' || l === 'zh-hans')) return null;
  const OpenCC = (await import('opencc-js')).default;
  return { t2s: OpenCC.Converter({ from: 'tw', to: 'cn' }), s2t: OpenCC.Converter({ from: 'cn', to: 'tw' }) };
}

const readJSON = (f) => JSON.parse(readFileSync(f, 'utf8'));

function candsOf(store, name) {
  return (store.byName[name] || []).map(([q, ex]) => {
    const f = store.facts[q] || { labels: {}, coord: null, starts: [], ends: [], p31: [], geo: false };
    return { qid: q, exact: !!ex, ...f };
  });
}

/* ── the fetch ──────────────────────────────────────────────────────────────
   ⚠ THE CSHAPES CANDIDATES GET THEIR OWN NAMESPACE IN THE CACHE. #R686's batches were keyed by
   where they sat in ITS list, so a second caller with a different list would have read #R686's
   answers under the same keys and silently gone unanswered (#R690's shape, quieter direction).
   scripts/histeras/harvest.mjs now keys new callers by the CONTENT of the batch. */
async function fetchAll() {
  const log = (s) => process.stderr.write('  ' + s + '\r');
  const eraRows = census(eraBundle(ROOT));
  const cs = censusCShapes(ROOT);

  for (const [what, rows, file, ns] of [['era', eraRows, CAND, ''], ['cshapes', cs.rows, CS_CAND, 'cs']]) {
    process.stderr.write(what + ': ' + rows.length + ' names\n');
    const byName = await candidatesFor(rows.map((r) => r.name), log, ns);
    const qids = new Set(); for (const m of byName.values()) for (const q of m.keys()) qids.add(q);
    process.stderr.write('\n  ' + qids.size + ' distinct candidate items\n');
    const facts = await factsFor(qids, log);
    const classes = new Set(); for (const f of Object.values(facts)) for (const c of f.p31) classes.add(c);
    const internal = await rejectedClasses(classes);
    const subject = await acceptedClasses(classes);
    process.stderr.write('\n  classes: ' + internal.size + ' not a kind this map draws, '
      + subject.size + ' a kind it does, of ' + classes.size + '\n');
    writeFileSync(file, JSON.stringify({
      byName: Object.fromEntries([...byName].map(([n, m]) => [n, [...m].map(([q, ex]) => [q, ex ? 1 : 0])])),
      facts, internal: [...internal], subject: [...subject],
    }));
  }

  /* the identifier lane — every QID data/hist-borders.js states for a feature still missing a
     language the app has. All nine are asked for; the narrowing happens at build time. */
  const need = histBordersQidGaps(appLangs(ROOT), ROOT);
  process.stderr.write('hist-borders: ' + need.size + ' QIDs with a gap\n');
  writeFileSync(QLAB, JSON.stringify(await labelsByQid([...need.keys()], log)));
  process.stderr.write('\ncached → ' + CACHE + '\n');
}

/* ── one record's names, by measure ─────────────────────────────────────────
   `owned` is the set of names js/time-borders.js's hand tables already answer IN A SHIPPED
   LANGUAGE. Such a name must NOT get a row here: `tagSame` reads `_i18n` first, so a row that
   lacks the language the hand table has would make the hand table unreachable and the reader
   would LOSE a name they already had (#R536). The tables are evaluated, never read (#R505). */
function ownedNames(rows, langs) {
  const owned = new Set();
  for (const lg of langs) {
    if (lg === 'en') continue;
    const { api } = timeBorders({ lang: lg });
    for (const row of rows) if (api.eraLocName(row.name)) owned.add(row.name);
  }
  return owned;
}

function labelRow(ent, english, langs, cc) {
  const raw = labelsFor(ent);
  let dropped = 0;
  for (const k of Object.keys(raw)) if (!plainLabel(raw[k])) { delete raw[k]; dropped++; }
  const att = new Set(Object.keys(raw));
  if (cc) {
    if (raw.zh) raw.zh = cc.s2t(raw.zh);
    if (raw['zh-hans']) raw['zh-hans'] = cc.t2s(raw['zh-hans']);
    if (raw.zh && !raw['zh-hans']) raw['zh-hans'] = cc.t2s(raw.zh);
    else if (raw['zh-hans'] && !raw.zh) raw.zh = cc.s2t(raw['zh-hans']);
  }
  /* ⚠ ENGLISH IS THE UPSTREAM'S, ALWAYS. Wikidata's English label is a second opinion about the
     same shape, and shipping it would silently rename the map in its own language. */
  delete raw.en; att.delete('en');
  const n = {};
  for (const code of langs) { if (code === 'en') continue; const v = raw[code]; if (v && v !== english) n[code] = v; }
  const all = appLangs(ROOT);
  let a = 0; for (const code of att) { const i = all.indexOf(code); if (i >= 0) a |= (1 << i); }
  return { n, a, dropped };
}

function byMeasure(rows, years, store, langs, cc, why) {
  const internal = new Set(store.internal);
  const subject = new Set(store.subject || []);
  const owned = ownedNames(rows, langs);
  const out = {};
  let dropped = 0;
  for (const row of rows) {
    if (owned.has(row.name)) { why['hand-table'] = (why['hand-table'] || 0) + 1; continue; }
    const cands = candsOf(store, row.name).map((c) => ({ ...c, subject: c.geo || (c.p31 || []).some((p) => subject.has(p)) }));
    const d = decide(row, cands, internal, years);
    if (!d.qid) { why[d.why] = (why[d.why] || 0) + 1; continue; }
    const { n, a, dropped: dd } = labelRow(store.facts[d.qid], row.name, langs, cc);
    dropped += dd;
    /* ⚠ A ROW WITH NOTHING TO SAY IN A SHIPPED LANGUAGE IS NOT SHIPPED. Under the amended policy
       most decided names have no Japanese label on Wikidata; keeping their rows would put the
       attestation mask of eight unshipped languages in the reader's download and localize
       nothing. The DECISION is not lost — it is reproducible from the cache at any time, which is
       what `--check` re-runs — only its silence is left out of the file. */
    if (!Object.keys(n).length) { why.nothing = (why.nothing || 0) + 1; continue; }
    out[row.name] = { q: d.qid, a, n };
  }
  return { out, dropped };
}

async function build({ check = false } = {}) {
  if (!existsSync(CAND) || !existsSync(CS_CAND) || !existsSync(QLAB)) {
    throw new Error('no harvest cache — run `node scripts/build-histnames.mjs --fetch` first');
  }
  /* ⚠ TWO LANGUAGE SETS, BECAUSE THE AMENDMENT IS ABOUT AUTHORING (scripts/histnames/langs.mjs).
     A label Wikidata or OHM wrote is carried in every language a source wrote it in; a string
     IntMap writes is carried in the narrowed set. */
  const langs = attestedLangs(ROOT);
  const authored = shipLangs(ROOT);
  const cc = await converters(langs);
  const eraB = eraBundle(ROOT);
  const eraRows = census(eraB);
  const cs = censusCShapes(ROOT);
  const eraStore = readJSON(CAND), csStore = readJSON(CS_CAND), qlab = readJSON(QLAB);
  const whyEra = {}, whyCs = {};

  const eras = byMeasure(eraRows, eraB.snaps.map((s) => s.y), eraStore, langs, cc, whyEra);
  const cshapes = byMeasure(cs.rows, cs.years, csStore, langs, cc, whyCs);

  /* ── the identifier lane ────────────────────────────────────────────────
     Keyed by QID, not by name: two hist-borders features can share a polity and disagree about
     which languages OHM wrote for them, so the question «what is missing» is only true of a
     feature, and the answer is stored where it was asked. js/time-borders.js merges it under the
     record's own names, which are never overwritten — this only fills what OHM left empty. */
  const byQid = {};
  const gaps = histBordersQidGaps(langs, ROOT);
  for (const [q, want] of gaps) {
    const ent = { labels: qlab[q] || {} };
    if (!Object.keys(ent.labels).length) continue;
    const { n, a } = labelRow(ent, '', langs, cc);
    const keep = {};
    for (const l of want) if (n[l]) keep[l] = n[l];
    if (Object.keys(keep).length) byQid[q] = { a, n: keep };
  }

  /* ── the prose lane ─────────────────────────────────────────────────────
     Membership is derived; the words are authored. A string the classifier calls prose with no
     line in the table FAILS THE BUILD — that is what keeps an authored table from going stale. */
  const common = commonWords(eraRows.map((r) => r.name));
  const proseRows = eraRows.filter((r) => isProse(r.name, (eraStore.byName[r.name] || []).length > 0, common));
  const prose = {}; const missing = [];
  for (const r of proseRows) {
    const n = {};
    for (const lg of authored) { if (lg === 'en') continue; const t = PROSE[lg] && PROSE[lg][r.name]; if (t) n[lg] = t; }
    const wanted = authored.filter((l) => l !== 'en' && PROSE[l]);
    if (wanted.some((l) => !n[l])) missing.push(r.name);
    if (Object.keys(n).length) prose[r.name] = { n, d: 1 };
  }
  if (missing.length) {
    throw new Error('scripts/histnames/prose-text.mjs has no line for ' + missing.length
      + ' string(s) the classifier calls the upstream’s prose:\n  ' + missing.slice(0, 20).join('\n  '));
  }

  const doc = {
    /* ⚠ `langs` IS WHAT IS SHIPPED; `mask` IS WHAT THE ATTESTATION BITS COUNT IN. They were the
       same array while the policy shipped all nine, and the moment it stopped they had to part:
       a bit position taken from the SHIPPED list would move every time the policy moves, and a
       mask already written would start naming other languages. The bit order is the app
       registry's, always. */
    v: V, src: SRC, built: new Date().toISOString().slice(0, 10), langs, authored, mask: appLangs(ROOT),
    byQid, byName: { cshapes: cshapes.out, eras: eras.out }, prose,
  };
  const json = JSON.stringify(doc);

  if (check) {
    if (!existsSync(OUT)) throw new Error('data/histnames.json is not shipped');
    const have = readJSON(OUT);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const diffs = [];
    for (const k of ['v', 'langs', 'authored', 'mask', 'byQid', 'byName', 'prose']) if (!same(have[k], doc[k])) diffs.push(k);
    if (diffs.length) throw new Error('data/histnames.json differs from a rebuild in: ' + diffs.join(', '));
    console.log('data/histnames.json — reproduces from the cache; '
      + Object.keys(byQid).length + ' by identifier, '
      + (Object.keys(cshapes.out).length + Object.keys(eras.out).length) + ' by measure, '
      + Object.keys(prose).length + ' prose');
    return doc;
  }

  writeFileSync(OUT, json);
  const kb = (Buffer.byteLength(json) / 1024).toFixed(0);
  console.log('data/histnames.json — ' + kb + ' kB · attested ' + langs.join(' ') + ' · authored ' + authored.join(' '));
  console.log('  identifier lane  ' + Object.keys(byQid).length + ' QIDs of ' + gaps.size + ' with a gap');
  console.log('  measure · cshapes ' + Object.keys(cshapes.out).length + ' of ' + cs.rows.length
    + ' — refused: ' + Object.entries(whyCs).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · '));
  console.log('  measure · eras    ' + Object.keys(eras.out).length + ' of ' + eraRows.length
    + ' — refused: ' + Object.entries(whyEra).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · '));
  console.log('  prose            ' + Object.keys(prose).length + ' descriptions');
  return doc;
}

const arg = process.argv.slice(2);
if (arg.includes('--fetch')) await fetchAll();
else await build({ check: arg.includes('--check') });
