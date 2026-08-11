/* ============================================================================
 *  IntMap · BUILD THE WORLD GAZETTEER — data/gazetteer-world.json   (#R198)
 * ----------------------------------------------------------------------------
 *  「Gazetteerを今の10倍の網羅性に。」
 *
 *  js/gazetteer.js carries 334 hand-written rows. They are the places world news is ABOUT, and they
 *  stay exactly as they are — this script does not touch them. What it adds is the long tail: every
 *  populated place above a population floor, worldwide, with real coordinates and real names in the
 *  five languages the app speaks.
 *
 *  ══ (#R208) TEN TIMES AGAIN — cities1000, AND THE NAMES COME FROM A DIFFERENT PLACE ═══════════
 *  「Gazetteer拡張（倍率を下げる＝10倍前後、cities1000相当15万件、圧縮して数MB、クライアント同梱）
 *    ＋英語/日本語以外のニュース解析システムと gazetteer の充実＋地点解析の精度向上。」
 *
 *  ⚠ AND THE WIKIDATA PASS COULD NOT COME WITH IT. #R198's reasoning below is still correct about
 *  the `alternatenames` COLUMN inside cities15000 — it is a flat comma-separated list with no
 *  language tag. But GeoNames also publishes `alternateNamesV2`, a SEPARATE file whose third column
 *  IS an ISO language code, with `isPreferredName` / `isColloquial` / `isHistoric` flags. That file
 *  answers the objection, and at this scale it is the only thing that can: 150,000 ids through the
 *  Wikidata SPARQL endpoint is 375 batched queries against a rate-limited public service, where the
 *  same facts are one 202 MB download that is cached and read once. Same publisher as the place
 *  list, same licence (CC BY 4.0), and the names arrive ATTACHED to their language, which was the
 *  whole requirement.
 *
 *  ── WHERE THE FACTS COME FROM ───────────────────────────────────────────────────────────────
 *  · GeoNames `cities1000` (CC BY 4.0) — the LIST: which places exist, where they are, how many
 *    people live there, and which country they are in. Downloaded as the published .zip and read
 *    here; nothing is retyped.
 *  · GeoNames `alternateNamesV2` (CC BY 4.0) — the NAMES, keyed on the same geonameid and tagged
 *    with their language. Historic and colloquial forms are dropped; a name flagged
 *    `isPreferredName` wins its language.
 *
 *  ── WHICH LANGUAGES, AND WHY NOT MORE ───────────────────────────────────────────────────────
 *  Only the ones the MATCHER can read. js/newsgeo.js tokenises Latin, Greek and Cyrillic, and runs
 *  a character scanner over Han/kana; Hangul, Arabic, Hebrew, Thai and Devanagari are in NEITHER,
 *  so shipping those names would add bytes that can never match a headline. That is the honest
 *  boundary, and it is what LANGS below is derived from rather than a taste in languages.
 *
 *  ── WHAT IS DELIBERATELY THROWN AWAY ────────────────────────────────────────────────────────
 *  Coverage that costs precision is not coverage. A locator that knows 3,000 more towns and starts
 *  reading "Nice"/"Split"/"Mobile"/"Reading" as places is worse than one that knows fewer. So:
 *    · a Latin surface form shorter than 4 characters is dropped (an acronym is not a town);
 *    · a surface form that is an ordinary word in any of the five UI languages is dropped (STOP);
 *    · a name already carried by the curated tables is dropped — the curated coordinate wins;
 *    · the same name in two places keeps the more populous one only, so "Springfield" resolves to
 *      one point instead of scattering.
 *  scripts/newsgeo-eval.mjs is the gate that says whether that was enough: it must stay at 100 %.
 *
 *      node scripts/build-gazetteer.mjs            # rebuild data/gazetteer-world.json
 *      node scripts/build-gazetteer.mjs --limit 50 # a quick shape check, no Wikidata pass
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync, gzipSync } from 'node:zlib';
import { buildPhoneGazetteer } from './build-gazetteer-phone.mjs';   /* (#R217) the phone's slice, derived from what this writes */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* (#R208) the shipped artefact is GZIPPED. 150,000 rows is ~9 MB of JSON and ~2.5 MB compressed,
   and the client decompresses it with DecompressionStream (js/gazetteer.js). Serving it compressed
   is not the same thing and cannot be relied on — this file has to be a few MB IN THE REPOSITORY
   too, and a static host that decides not to encode a response would otherwise ship all 9 MB. */
const OUT = join(ROOT, 'data', 'gazetteer-world.json.gz');
const CACHE = join(ROOT, 'node_modules', '.cache', 'intmap-gazetteer');
const SRC = 'https://download.geonames.org/export/dump/cities1000.zip';
const ALT = 'https://download.geonames.org/export/dump/alternateNamesV2.zip';
const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap) gazetteer-build';

/* The languages js/newsgeo.js can actually match (see the header). `ja` is kept in its own column
   because the app's UI is bilingual and every caller reads row[1] as "the Japanese name". */
const LANGS = ['ja', 'de', 'ru', 'es', 'fr', 'pt', 'it', 'nl', 'pl', 'tr', 'uk', 'zh', 'el', 'sv', 'cs', 'ro', 'id', 'vi'];

const argv = process.argv.slice(2);
const LIMIT = (() => { const i = argv.indexOf('--limit'); return i >= 0 ? +argv[i + 1] : 0; })();

/* ── a minimal ZIP reader: one published archive, one member, no dependency ─────────────────── */
function unzipFirst(buf) {
  /* end-of-central-directory → central directory → the first entry's local header */
  let eocd = -1;
  for (let p = buf.length - 22; p >= 0 && p > buf.length - 66000; p--) {
    if (buf.readUInt32LE(p) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error('not a zip (no end-of-central-directory)');
  const cdOff = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cdOff) !== 0x02014b50) throw new Error('bad central directory');
  const method = buf.readUInt16LE(cdOff + 10);
  const compSize = buf.readUInt32LE(cdOff + 20);
  const nameLen = buf.readUInt16LE(cdOff + 28);
  const extraLen = buf.readUInt16LE(cdOff + 30);
  const cmtLen = buf.readUInt16LE(cdOff + 32);
  const localOff = buf.readUInt32LE(cdOff + 42);
  const name = buf.toString('utf8', cdOff + 46, cdOff + 46 + nameLen);
  void extraLen; void cmtLen;
  if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('bad local header');
  const lNameLen = buf.readUInt16LE(localOff + 26), lExtraLen = buf.readUInt16LE(localOff + 28);
  const dataAt = localOff + 30 + lNameLen + lExtraLen;
  const raw = buf.subarray(dataAt, dataAt + compSize);
  return { name, text: (method === 0 ? raw : inflateRawSync(raw)).toString('utf8') };
}

/* (#R208) …and the same central directory walked for a NAMED member. alternateNamesV2.zip carries
   two files (the names and a language-code table) and the one we want is not necessarily first. */
function zipEntry(buf, want) {
  let eocd = -1;
  for (let p = buf.length - 22; p >= 0 && p > buf.length - 66000; p--) {
    if (buf.readUInt32LE(p) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error('not a zip (no end-of-central-directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), cmtLen = buf.readUInt16LE(p + 32);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (want.test(name)) {
      const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20);
      const localOff = buf.readUInt32LE(p + 42);
      if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('bad local header');
      const dataAt = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
      return { name, method, raw: buf.subarray(dataAt, dataAt + compSize) };
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  throw new Error('no member matching ' + want + ' in the archive');
}

/** download once into the cache, then hand back the bytes */
async function cached(url, file) {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const p = join(CACHE, file);
  if (existsSync(p)) return readFileSync(p);
  process.stdout.write(`downloading ${url} … `);
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('GeoNames HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(p, buf);
  console.log(`${(buf.length / 1e6).toFixed(2)} MB`);
  return buf;
}

async function geonames() {
  const { name, text } = unzipFirst(await cached(SRC, 'cities1000.zip'));
  console.log(`  ${name}: ${text.length.toLocaleString()} bytes`);
  return text;
}

/* ── alternateNamesV2: names attached to their language, for the ids we kept ──────────────────
   ⚠ STREAMED AND FILTERED ON BYTES. The member is ~800 MB of about 16 million rows; decoding all
   of it into JavaScript strings to throw 99 % away is minutes of work and roughly a gigabyte of
   string. The two columns that decide whether a row matters — geonameid and isolanguage — are
   pure ASCII, so they are read straight out of the buffer and only a surviving row's NAME is ever
   decoded as UTF-8.
   Columns: 0 altId, 1 geonameid, 2 isolanguage, 3 name, 4 isPreferred, 5 isShort, 6 isColloquial,
   7 isHistoric. */
async function alternateNames(keepIds) {
  const { name, method, raw } = zipEntry(await cached(ALT, 'alternateNamesV2.zip'), /alternateNamesV2\.txt$/);
  process.stdout.write(`  ${name}: inflating … `);
  const buf = method === 0 ? raw : inflateRawSync(raw, { maxOutputLength: 1.5e9 });
  console.log(`${(buf.length / 1e6).toFixed(0)} MB`);

  const want = new Set(LANGS);
  const out = new Map();            // gid → { lang → name }
  const preferred = new Set();      // gid+'|'+lang already settled by isPreferredName
  const TAB = 9, NL = 10;
  let start = 0, seen = 0, took = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i !== buf.length && buf[i] !== NL) continue;
    const end = (i > start && buf[i - 1] === 13) ? i - 1 : i;
    parse: {
      if (end <= start) break parse;
      seen++;
      /* column offsets, found by scanning for tabs — bounded to the first eight */
      const t = []; for (let p = start; p < end && t.length < 8; p++) if (buf[p] === TAB) t.push(p);
      if (t.length < 3) break parse;
      const gid = buf.toString('latin1', t[0] + 1, t[1]);
      if (!keepIds.has(gid)) break parse;
      const lang = buf.toString('latin1', t[1] + 1, t[2]);
      if (!want.has(lang)) break parse;
      const isPref = t.length >= 4 && buf.toString('latin1', t[3] + 1, t[4] === undefined ? end : t[4]) === '1';
      const isColloq = t.length >= 6 && buf.toString('latin1', t[5] + 1, t[6] === undefined ? end : t[6]) === '1';
      const isHist = t.length >= 7 && buf.toString('latin1', t[6] + 1, t[7] === undefined ? end : t[7]) === '1';
      if (isColloq || isHist) break parse;
      const value = buf.toString('utf8', t[2] + 1, t.length >= 4 ? t[3] : end).trim();
      if (!value) break parse;
      const key = gid + '|' + lang;
      const cur = out.get(gid) || (out.set(gid, {}), out.get(gid));
      /* first one wins, unless a later row is flagged preferred (and then the first preferred wins) */
      if (cur[lang] === undefined || (isPref && !preferred.has(key))) cur[lang] = value;
      if (isPref) preferred.add(key);
      took++;
    }
    start = i + 1;
  }
  console.log(`  ${seen.toLocaleString()} alternate-name rows scanned, ${took.toLocaleString()} kept `
    + `for ${out.size.toLocaleString()} of the ${keepIds.size.toLocaleString()} places`);
  return out;
}

/* ── names that are ordinary words somewhere, and therefore not usable as a bare place cue ──── */
const STOP = new Set(`the and for with from that this these those there their they them then than
  all any are but can did does had has have her him his how its may more most must not now off one
  only our out over own said same see she should since some such take than that them they this
  through time too two under until very was way well were what when where which while who why will
  with would year years you your city town village state province county district region area north
  south east west central new old great little big small upper lower port saint san santa mount lake
  river valley island hill park green white black red blue gold silver spring springs falls creek bay
  beach point rock ridge grove field fields view heights center centre plain plains star sun moon
  best first second third top end side line mark rank order match place home work life world news
  data map time date name type kind sort form part case fact idea plan role rule term unit user
  general national federal union republic democratic people public private social nation government
  service services system group company limited international american african asian european
  nice split mobile reading bath deal march may june july august sale sales normal rich hope grand
  liberty independence victory concord union pride energy summit mission progress
  /* (#R208) cities1000 reaches far enough down to hit the institutions themselves. MEASURED on the
     labelled corpus: 「Paris Hilton testifies before Congress…」 pinned Congress, Arizona (pop
     1,714). These are the words a headline uses for the BODY, and no headline means the village. */
  congress parliament senate cabinet assembly council court supreme embassy consulate ministry
  university college academy institute hospital clinic church chapel temple mosque abbey
  market bazaar station airport harbour harbor port terminal bridge tower castle palace fortress
  garden gardens forest desert prairie tundra glacier volcano canyon crater lagoon reef strait
  border frontier capital colony commonwealth kingdom empire dynasty senate treaty accord charter
  eagle falcon phoenix atlas orion apollo mercury venus mars jupiter saturn neptune pluto
  paradise eden zion sparta troy babylon carthage utopia surprise boring accident hazard rainbow
  economy industry commerce finance bank market trade export import tariff sanction embargo`
  .split(/\s+/).filter((w) => /^[a-z]+$/.test(w)));

const isLatin = (s) => /^[\x20-\x7EÀ-ɏ'’\- .]+$/.test(s);
const hasCJK = (s) => /[぀-ヿ㐀-鿿]/.test(s);

/* ── the curated rows this file must not shadow ─────────────────────────────────────────────── */
function curatedSurfaces() {
  const src = readFileSync(join(ROOT, 'js', 'gazetteer.js'), 'utf8') + '\n' +
              readFileSync(join(ROOT, 'js', 'newsgeo.js'), 'utf8') + '\n' +
              readFileSync(join(ROOT, 'js', 'tables.js'), 'utf8');
  const out = new Set();
  /* every single-quoted literal in those three files, lowercased. */
  for (const m of src.matchAll(/'([^'\\\n]{2,40})'/g)) out.add(m[1].toLowerCase());
  /* ⚠ (#R208) …AND THE SURFACE FORMS *INSIDE* THEM, WHICH IS THE HALF THAT WAS MISSING.
     Those tables are PACKED strings — `'GB|イギリス|…|England|イングランド|…'`, `'Frankfurt|…'` —
     so a literal-only scan collects the whole packed row and never the names in it. `curated` was
     therefore missing nearly every curated surface, and `admit` below could not drop a long-tail
     row that collided with one.
     At cities15000 that mostly did not show. At cities1000 it does, because the tail is now full of
     small American towns named after the things the curated table is about: MEASURED on the
     labelled corpus, England (Arkansas, pop 2,791) out-scored Cambridge in 「Cambridge scientists
     in England…」 — the curated England is a REGION that the hierarchy rule would have absorbed,
     but it was competing with a homonymous village instead.
     Splitting on the pack separators is the conservative direction: it can only make this build
     DROP more of the tail, and what it drops is exactly what a curated row already answers. */
  for (const lit of [...out]) {
    for (const part of lit.split(/[|;]/)) {
      const s = part.trim();
      if (s.length >= 3 && !/^[\d.\-+]+$/.test(s)) out.add(s);
    }
  }
  return out;
}

async function main() {
  const text = await geonames();
  const curated = curatedSurfaces();
  console.log(`  curated surface forms to avoid: ${curated.size.toLocaleString()}`);

  /* GeoNames columns: 0 id, 1 name, 2 ascii, 3 alternates, 4 lat, 5 lng, 6 fclass, 7 fcode,
     8 country, …, 14 population */
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c[6] !== 'P') continue;
    const pop = +c[14] || 0, lat = +c[4], lng = +c[5];
    if (!isFinite(lat) || !isFinite(lng)) continue;
    rows.push({ gid: c[0], en: c[2] || c[1], local: c[1], iso2: c[8], lat, lng, pop });
  }
  rows.sort((a, b) => b.pop - a.pop);
  console.log(`  populated places in the source: ${rows.length.toLocaleString()}`);

  /* Keep the most populous worldwide, and — separately — the largest place in every country, so a
     small country is never absent just because nowhere in it clears a global threshold. */
  /* (#R198) 15,000, not 3,400. MEASURED: at 3,400 the population floor of the global block lands at
     ~164,000 — which reads as "ten times the rows" and still cannot find Tuzla (110 k), Kamloops
     (90 k) or Rovaniemi (62 k), i.e. exactly the long tail the request was about. 15,000 puts the
     floor near 40,000 people. The two costs were measured rather than feared: the file is ~1.1 MB
     (fetched on first need, never on the boot path — see js/gazetteer.js), and registering the rows
     into the locator is 6.0 ms per 1,000 rows on this machine, so ~90 ms once. js/gazetteer.js caps
     the phone at MOBILE_CAP rows for that second reason. */
  /* ══ (#R208) 150,000 — THE WHOLE OF cities1000 THAT SURVIVES THE PRECISION FILTERS ═══════════
     The instruction fixed the multiplier itself ("倍率を下げる＝10倍前後、cities1000相当15万件"),
     so TARGET stops being the interesting number and the filters below become the only thing that
     decides. Everything the source offers is offered to `admit`, and what comes out is what passed. */
  const TARGET = LIMIT || Infinity;
  const keep = [], seenCountry = new Set(), seenName = new Set();
  const admit = (r) => {
    const key = r.en.toLowerCase();
    if (seenName.has(key)) return false;          /* the more populous homonym already won */
    if (curated.has(key)) return false;           /* a curated row owns this name */
    if (isLatin(r.en) && (r.en.length < 4 || STOP.has(key))) return false;
    seenName.add(key); keep.push(r); seenCountry.add(r.iso2); return true;
  };
  for (const r of rows) { if (keep.length >= TARGET) break; admit(r); }
  for (const r of rows) { if (!seenCountry.has(r.iso2)) admit(r); }
  console.log(`  kept: ${keep.length.toLocaleString()} places across ${seenCountry.size} countries`);

  const labels = LIMIT ? new Map() : await alternateNames(new Set(keep.map((r) => r.gid)));

  /* row = [en, ja, iso2, lng, lat, pop, [extra surface forms…]] — the client turns this into the
     [type, terms, lng, lat, nameEn, nameJp] shape js/gazetteer.js already publishes. */
  const perLang = Object.create(null);
  const out = keep.map((r) => {
    const L = labels.get(r.gid) || {};
    const extra = [], seenHere = new Set([r.en.toLowerCase()]);
    /* the endonym first, then every language the matcher can read, in LANGS order */
    for (const lang of ['', ...LANGS]) {
      const v = lang === '' ? r.local : L[lang];
      if (!v || v === r.en) continue;
      const k = v.toLowerCase();
      if (seenHere.has(k)) continue;
      if (curated.has(k)) continue;
      if (isLatin(v) && (v.length < 4 || STOP.has(k))) continue;
      if (!hasCJK(v) && !isLatin(v) && v.length < 4) continue;
      if (lang === 'ja') continue;                 /* ja has its own column, below */
      seenHere.add(k); extra.push(v);
      if (lang) perLang[lang] = (perLang[lang] || 0) + 1;
    }
    const ja = (L.ja && !curated.has(L.ja.toLowerCase())) ? L.ja : '';
    if (ja) perLang.ja = (perLang.ja || 0) + 1;
    return [r.en, ja, r.iso2, +r.lng.toFixed(4), +r.lat.toFixed(4), r.pop, extra];
  });

  const doc = {
    v: 2,
    built: new Date().toISOString().slice(0, 10),
    attribution: 'Places, populations and names: GeoNames (cities1000 + alternateNamesV2, CC BY 4.0).',
    langs: LANGS,
    fields: ['en', 'ja', 'iso2', 'lng', 'lat', 'pop', 'alt'],
    rows: out
  };
  const json = Buffer.from(JSON.stringify(doc), 'utf8');
  const gz = gzipSync(json, { level: 9 });
  writeFileSync(OUT, gz);
  const withJa = out.filter((r) => r[1]).length;
  const withAlt = out.filter((r) => r[6].length).length;
  console.log(`\nwrote data/gazetteer-world.json.gz — ${out.length.toLocaleString()} rows, `
    + `${(json.length / 1048576).toFixed(1)} MB of JSON → ${(gz.length / 1048576).toFixed(2)} MB gzipped`);
  console.log(`  ${withJa.toLocaleString()} with a Japanese name, ${withAlt.toLocaleString()} with at least one other`);
  console.log('  names per language: ' + Object.entries(perLang).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => k + ' ' + v.toLocaleString()).join(', '));

  /* (#R217) …and the phone's slice of the same file, so the two artefacts can never drift apart:
     a rebuild that produced a new world list and left an old phone list would ship a phone a
     gazetteer from a different build. It is derived, not re-derived — see the script's header. */
  const p = buildPhoneGazetteer();
  console.log(`\nwrote data/gazetteer-phone.json.gz — ${p.rows.toLocaleString()} rows → ${(p.gz / 1024).toFixed(0)} kB gzipped`);
}

main().catch((e) => { console.error(e); process.exit(1); });
