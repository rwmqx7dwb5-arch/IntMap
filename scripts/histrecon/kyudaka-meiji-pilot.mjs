#!/usr/bin/env node
/* ==========================================================================
 * scripts/histrecon/kyudaka-meiji-pilot.mjs   (hist-recon-expand · PILOT, nothing is drawn)
 *
 * Measures a two-pass transcription of 明治大学図書館『舊高舊領取調帳』(IIIF, public domain) against
 * itself and against the parts the Meiji reconstruction already has:
 *
 *   1. agreement of pass 1 and pass 2 (rows, village names, 石高, holders) — read from
 *      scripts/histrecon/kyudaka-meiji-<item>.json (`read1` / `read2`), nothing re-read here;
 *   2. how many fully read village names bind to a 2020 e-Stat 大字 (町丁・字) inside the 1920 町村 of
 *      the same 郡 (estat-koaza.mjs matchVillages, the same rule the Meiji v2 build uses), and how many
 *      equal a 1920 町村 name of N03-1920.
 *
 * It does NOT use, open or compare against the 国立歴史民俗博物館 旧高旧領取調帳データベース or the
 * Kyudaka_agrivillage holder column (excluded for licence reasons — see kyudaka-meiji-pilot.json).
 *
 * Every outbound request (N03-2020 pages/zips, e-Stat 小地域 zips — through estat-koaza.mjs) carries the
 * project User-Agent below and nothing that identifies a person.
 *
 *   node scripts/histrecon/kyudaka-meiji-pilot.mjs [--item LI00001164]
 * ========================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { zipEntries, shapefileToGeoJSON } from '../lib/elections-geo.mjs';

const UA = 'IntMap-histrecon/1.0 (+https://github.com/rwmqx7dwb5-arch/IntMap)';
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) => realFetch(url, { ...init, headers: { ...(init.headers || {}), 'User-Agent': UA } });
const { modernCodesFor, koaza, matchVillages, prefixSet, fold } = await import('./estat-koaza.mjs');

const HERE = dirname(fileURLToPath(import.meta.url));
const item = (process.argv.includes('--item') ? process.argv[process.argv.indexOf('--item') + 1] : 'LI00001164');
const T = JSON.parse(readFileSync(join(HERE, 'kyudaka-meiji-' + item + '.json'), 'utf8'));
const rows = T.rows;

/* ── 1. agreement ─────────────────────────────────────────────────────────────────────────── */
const FIELDS = ['village', 'holder', 'koku', 'ken'];
const unread = (s) => (s.match(/□/g) || []).length;
const agreement = {};
for (const k of FIELDS) {
  let eq = 0, both = 0, eqBoth = 0, chars = 0, unr = 0, posBoth = 0, posConflict = 0, lenConflict = 0;
  for (const r of rows) {
    const a = r.read1[k], b = r.read2[k];
    if (a === b) eq++;
    if (!a.includes('□') && !b.includes('□')) { both++; if (a === b) eqBoth++; }
    chars += [...a].length + [...b].length; unr += unread(a) + unread(b);
    const x = [...a], y = [...b];
    if (x.length !== y.length) { lenConflict++; continue; }
    for (let i = 0; i < x.length; i++) { if (x[i] === '□' || y[i] === '□') continue; posBoth++; if (x[i] !== y[i]) posConflict++; }
  }
  agreement[k] = {
    rowsEqual: eq, rows: rows.length, pctRowsEqual: +(100 * eq / rows.length).toFixed(1),
    rowsBothFullyRead: both, pctBothFullyRead: +(100 * both / rows.length).toFixed(1), equalWhenBothFullyRead: eqBoth,
    unreadCharShare: +(100 * unr / chars).toFixed(1),
    charsReadByBoth: posBoth, charsConflicting: posConflict, fieldsWithDifferentLength: lenConflict,
  };
}

/* ── 2. binding to existing parts ─────────────────────────────────────────────────────────── */
const N03_1920 = join(tmpdir(), 'intmap-histrecon-cache', 'n03-1920');
const PREF = '28';                                     /* the N03-1920 file of today's 兵庫県 holds 播磨 */
const zip = join(N03_1920, 'N03-200101_' + PREF + '_GML.zip');
if (!existsSync(zip)) throw new Error(zip + ' missing: run scripts/histrecon/blocks-n03-1920.mjs once to fill the cache');
const fc = shapefileToGeoJSON(zipEntries(readFileSync(zip)), { encoding: 'shift_jis' });
const gunsWanted = new Set(rows.map((r) => r.gun));
const munis = new Map();
const names1920 = new Set();
for (const f of fc.features) {
  const p = f.properties; if (p.N03_004) names1920.add(p.N03_004);
  if (!gunsWanted.has(p.N03_003)) continue;
  const key = p.N03_003 + '/' + p.N03_004;
  if (!munis.has(key)) munis.set(key, { gun: p.N03_003, name: p.N03_004, coords: [] });
  const g = f.geometry; if (!g) continue;
  for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) munis.get(key).coords.push(poly);
}
const prefixes = prefixSet([...names1920]);

/* villages: the agreed reading, not a ditto, no unread character */
const byGun = new Map();
for (const r of rows) {
  const v = r.agreed.village;
  if (!v || v === '〃') continue;
  if (!byGun.has(r.gun)) byGun.set(r.gun, { all: [], legible: [] });
  byGun.get(r.gun).all.push(v);
  if (!v.includes('□')) byGun.get(r.gun).legible.push(v);
}
const LEVEL = { exact: 3, prefixed: 2, fuzzy: 1, unmatched: 0 };
const binding = {};
for (const [gun, vs] of byGun) {
  const best = new Map(vs.legible.map((v) => [v, { level: 'unmatched', where: [] }]));
  const ms = [...munis.values()].filter((m) => m.gun === gun);
  for (const m of ms) {
    const codes = await modernCodesFor(m.coords, PREF, { log: (s) => process.stderr.write(s + '\n') });
    for (const c of codes) {
      const feats = await koaza(c.code, { log: (s) => process.stderr.write(s + '\n') });
      const { res } = matchVillages(vs.legible, feats, m.coords, prefixes);
      for (const x of res) {
        const b = best.get(x.village);
        if (LEVEL[x.level] > LEVEL[b.level]) best.set(x.village, { level: x.level, where: [m.name + ' → ' + c.name + ': ' + (x.names.length ? x.names.join('・') : x.fuzzy.join('・'))] });
        else if (LEVEL[x.level] === LEVEL[b.level] && x.level !== 'unmatched') b.where.push(m.name + ' → ' + c.name + ': ' + (x.names.length ? x.names.join('・') : x.fuzzy.join('・')));
      }
    }
  }
  const muniNames = new Set(ms.map((m) => fold(m.name)));
  const count = (lv) => [...best.values()].filter((b) => b.level === lv).length;
  /* REPORTED, NOT USED: an unmatched name that is a positional prefix (東西南北上下中) + a stem whose stem
     occurs in a 町丁・字 name of the same modern municipalities — the pattern of villages merged into one
     大字 after 1889 (上石野村・中石野村 → 別所町石野). Such a village is a PART of that 大字, not the 大字. */
  const allNames = new Set();
  for (const m of ms) for (const c of await modernCodesFor(m.coords, PREF)) for (const f of await koaza(c.code)) if (f.hcode === 8101) allNames.add(fold(f.s));
  const positional = [...best].filter(([, b]) => b.level === 'unmatched').map(([v]) => v)
    .filter((v) => /^[東西南北上下中]/.test(v)).map((v) => [v, fold(v.slice(1)).replace(/(新田村|新田|村|町)$/, '')])
    .filter(([, st]) => st.length >= 2 && [...allNames].some((n) => n.includes(st))).map(([v]) => v);
  binding[gun] = {
    villageEntries: vs.all.length, fullyRead: vs.legible.length,
    municipalities1920: ms.length,
    estatExact: count('exact'), estatPrefixed: count('prefixed'), estatFuzzyOnly: count('fuzzy'), unmatched: count('unmatched'),
    boundAtMoreThanOnePlace: [...best.values()].filter((b) => b.level !== 'unmatched' && b.level !== 'fuzzy' && b.where.length > 1).length,
    equalTo1920MunicipalityName: vs.legible.filter((v) => muniNames.has(fold(v))).length,
    unmatchedButPositionalPartOfA大字: positional,
    unmatchedNames: [...best].filter(([, b]) => b.level === 'unmatched').map(([v]) => v),
    fuzzyNames: [...best].filter(([, b]) => b.level === 'fuzzy').map(([v, b]) => v + ' ~ ' + b.where.join(' | ')),
  };
}

console.log(JSON.stringify({ item, rows: rows.length, agreement, binding }, null, 1));
