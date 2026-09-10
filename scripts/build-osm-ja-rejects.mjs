#!/usr/bin/env node
/* ══ IntMap · scripts/build-osm-ja-rejects.mjs ═══════════════════════════════════════════════════
   Rebuild the table of OSM `name:ja` values that js/place-labels.js REFUSES to use as a label.

   ⚠ THIS IS A CASE-BY-CASE TABLE, AND .agents/rules/no-ad-hoc-hardcoding.md §6 IS WHY IT IS ALLOWED
   TO EXIST: the upstream record is wrong, and no rule IntMap can evaluate at draw time separates a
   wrong Japanese name from a right one. MapLibre style expressions have no regular expressions, so
   the criterion below cannot run in the renderer — it runs HERE, once, against live OSM, and what
   ships is the observation it made. Re-run it to re-observe; the pairs it no longer finds are the
   ones upstream has fixed.

   WHY THERE IS ANYTHING TO REFUSE. Measured 2026-09-11 over Adana province: 1,950 elements carry
   `name:ja`, 78 of them on features that produce a map label, and the version history says 73 of
   those 78 were last written by a single account. Of that 73, 45 are the Turkish words translated
   into kanji or spelled out in ateji — 平和 (Barış), 征服者 (Fatih), 新弾幕 (Yenibaraj),
   白家 (Beyazevler), 園都市 (Bahçeşehir), 失礼顎鬚 (Kabasakal), 蚊流酢人達 (Karslılar),
   良癖 (Yüreğir), 強川 (Seyhan), 黄松 (Sarıçam). The two label names in the province that ARE
   right (`Adana → アダナ`, `Ceyhan → ジェイハン`) are the two written by somebody else.

   THE CRITERION (all three, or the pair is not listed):

     1. the feature is a SETTLEMENT or an ADMINISTRATIVE AREA — `place` in the settlement classes
        below, or `boundary=administrative`. Seas, straits, faults, parks, universities and
        embassies are deliberately out: those are the feature kinds Japanese really does translate
        (黒海 for Karadeniz, 金角湾 for Haliç, 東アナトリア断層, 中東工科大学, フランス大使館 —
        all correct, all present in the same sweep, all left alone).
     2. `name` is Latin script — the place is outside the CJK sphere, so its Japanese name is a
        transliteration of the name, not a translation of the words in it.
     3. `name:ja`, after a trailing generic feature word is removed (…県/市/区/町/村/島/地方…),
        STILL contains Han characters. `ヨズガト県` strips to `ヨズガト` and is kept; `平和`,
        `征服者`, `新弾幕`, `良癖` do not strip to anything and are refused.

   WHAT THE TABLE IS NOT: a correction. IntMap does not know what these places are called in
   Japanese and does not invent one — a refused pair falls through the existing key chain in
   `OSM_NAME_KEYS` (`name:en` → `name:latin` → `name_int` → `name`), which is the same label every
   other Turkish place without a `name:ja` already gets.

   IT EXPIRES BY ITSELF. The runtime matches the WHOLE pair (`name` + `name:ja`). The moment OSM
   carries a different `name:ja`, the row stops matching and the new upstream value is used — no
   edit here required. `Adana → 亜駄名` and `Toros → 強山` were already repaired upstream between
   the report and this sweep and are, correctly, absent from the output.

   Usage:  node scripts/build-osm-ja-rejects.mjs [--check]
           --check  fails if js/place-labels.js does not already hold what a fresh sweep produces.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'js', 'place-labels.js');
const BEGIN = '/* ══ BEGIN GENERATED osm-ja-rejects';
const END = '/* ══ END GENERATED osm-ja-rejects';

/* the regions swept. Each is an Overpass area selector plus the human reason it is on the list. */
export const REGIONS = [
  { area: '["ISO3166-1"="TR"][admin_level=2]', why: 'Türkiye (the reported contamination, Adana province)' }
];

/* ⚠ THE CRITERION HAS FALSE POSITIVES, AND THEY ARE NAMED HERE RATHER THAN DESIGNED AWAY.
   Criterion 3 asks whether the Japanese string translates the words instead of transliterating the
   name — and for a handful of features the answer is «yes, and that is the correct Japanese name»,
   because the thing itself is named after something Japanese has its own word for. Every entry
   below was read, and carries why it is right. A tighter rule was tried and rejected: cutting the
   sweep off at an admin_level would have been a line drawn to fit one row, not a fact about names
   (the same account reached place=city, and Türkiye's provinces are all transliterated already). */
export const KEEP = new Map([
  ['Karadeniz Bölgesi|黒海地方', '黒海 is the established Japanese name of the Black Sea, so the region that is named after it is 黒海地方 in Japanese too — a translated common noun, not a calque of a proper one.']
]);

export const SETTLEMENT = new Set(['city', 'town', 'village', 'suburb', 'quarter', 'neighbourhood',
  'hamlet', 'borough', 'municipality', 'county', 'state', 'province', 'district', 'locality',
  'isolated_dwelling', 'allotments']);

/* trailing words that name the KIND of thing rather than the thing — a Japanese exonym may carry
   one and still be a transliteration. Ordered longest-first so 特別市 wins over 市. */
export const GENERIC_TAIL = ['特別市', '国立公園', '自治区', '地方', '村落', '地区', '県', '府',
  '都', '市', '区', '町', '村', '郡', '州', '島'];

/* ⚠ THE FIELD SEPARATOR IS PART OF THE CONTRACT. It joins the two halves into the single packed
   record the runtime matches on, and it is `|` because that is the separator the i18n pair audit
   already recognises as «this string carries its own key» (scripts/i18n-pair-audit.mjs, PACKED).
   A record whose own text contains one would split wrong, so the sweep refuses to emit it. */
export const FIELD = '|';

const HAN = /[一-鿿㐀-䶿豈-﫿]/;
const KANA = /[぀-ヿ]/;
const HANGUL = /[가-힯]/;

export function stripGenericTail(ja) {
  let s = String(ja || '');
  for (let again = true; again;) {
    again = false;
    for (const t of GENERIC_TAIL) {
      if (s.length > t.length && s.endsWith(t)) { s = s.slice(0, -t.length); again = true; break; }
    }
  }
  return s;
}

export function isLatinName(name) {
  const s = String(name || '');
  return /[A-Za-z]/.test(s) && !HAN.test(s) && !KANA.test(s) && !HANGUL.test(s);
}

export function isSettlement(tags) {
  return SETTLEMENT.has(String(tags.place || '')) || String(tags.boundary || '') === 'administrative';
}

/** The whole criterion, in one place, so a test can EVALUATE it rather than read it. */
export function isRefusable(tags) {
  const ja = String((tags && tags['name:ja']) || ''), name = String((tags && tags.name) || '');
  if (!ja || !name) return false;
  if (!isSettlement(tags)) return false;
  if (!isLatinName(name)) return false;
  return HAN.test(stripGenericTail(ja));
}

async function overpass(body) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body,
      headers: { 'User-Agent': 'IntMap/1.0 (+https://github.com/rwmqx7dwb5-arch/IntMap)', 'Content-Type': 'text/plain' }
    });
    if (r.ok) return r.json();
    await new Promise(s => setTimeout(s, 5000 * (i + 1)));
  }
  throw new Error('Overpass refused four times');
}

export async function sweep() {
  const pairs = new Map();
  for (const reg of REGIONS) {
    const j = await overpass(`[out:json][timeout:300];\narea${reg.area}->.r;\n(nwr["name:ja"](area.r););\nout tags 20000;`);
    for (const e of j.elements || []) {
      const t = e.tags || {};
      if (!isRefusable(t)) continue;
      if (String(t.name).includes(FIELD) || String(t['name:ja']).includes(FIELD)) throw new Error(`a record contains the field separator and cannot be packed: ${t.name} / ${t['name:ja']}`);
      const key = t.name + FIELD + t['name:ja'];
      if (KEEP.has(key)) continue;
      pairs.set(key, [t.name, t['name:ja']]);
    }
  }
  return Array.from(pairs.values()).sort((a, b) => a[0].localeCompare(b[0], 'en'));
}

function render(rows, when) {
  const body = rows.map(([n, ja]) => `    ${JSON.stringify(n + FIELD + ja)}`).join(',\n');
  return `${BEGIN} — node scripts/build-osm-ja-rejects.mjs ═══════════════
     Observed ${when} over ${REGIONS.map(r => r.why).join('; ')}: ${rows.length} upstream records
     in which a Latin-named settlement carries a Japanese name that translates the words instead of
     transliterating the name. The criterion, why this is a list rather than a rule, and why the
     list expires by itself are all in scripts/build-osm-ja-rejects.mjs — not restated here.
     ⚠ EDIT THE SCRIPT, NOT THIS BLOCK. Re-run it to re-observe.
     @i18n-entity-data  ONE PACKED RECORD PER ROW — \`name|name:ja\`, the fingerprint of an upstream
     record, exactly the shape js/newsgeo.js's matcher tables carry and for the same reason: the key
     is INSIDE the string. ⚠ The two halves are NOT a translation pair. The right half is the value
     being REFUSED and the left half is what identifies the record it sits on; translating either
     would destroy the match. Nothing here is ever shown to a reader in any language. */
  const OSM_JA_REFUSED = [
${body}
  ];
${END} ═══════════════════════════════════════════════════════ */`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  const rows = await sweep();
  const src = fs.readFileSync(TARGET, 'utf8');
  const i = src.indexOf(BEGIN), j = src.indexOf(END);
  if (i < 0 || j < 0) { console.error(`${TARGET} has no generated block — add the BEGIN/END markers first.`); process.exit(1); }
  const tail = src.indexOf('\n', j);
  const when = new Date().toISOString().slice(0, 10);
  if (check) {
    const cur = src.slice(i, tail < 0 ? src.length : tail);
    const curPairs = [...cur.matchAll(/\n {4}("(?:[^"\\]|\\.)*")/g)].map(m => JSON.parse(m[1]).split(FIELD));
    if (JSON.stringify(curPairs) !== JSON.stringify(rows)) {
      console.error(`osm-ja-rejects: js/place-labels.js holds ${curPairs.length} pairs, a fresh sweep finds ${rows.length}. Run: node scripts/build-osm-ja-rejects.mjs`);
      process.exit(1);
    }
    console.log(`osm-ja-rejects ok — ${rows.length} pairs, upstream unchanged`);
  } else {
    fs.writeFileSync(TARGET, src.slice(0, i) + render(rows, when) + src.slice(tail < 0 ? src.length : tail));
    console.log(`osm-ja-rejects: wrote ${rows.length} pairs into js/place-labels.js (observed ${when})`);
    for (const [n, ja] of rows) console.log(`  ${n}  →  ${ja}`);
  }
}
