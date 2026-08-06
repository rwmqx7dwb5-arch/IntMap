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
 *  ── WHERE THE FACTS COME FROM ───────────────────────────────────────────────────────────────
 *  · GeoNames `cities15000` (CC BY 4.0) — the LIST: which places exist, where they are, how many
 *    people live there, and which country they are in. Downloaded as the published .zip and read
 *    here; nothing is retyped.
 *  · Wikidata (CC0) — the NAMES. GeoNames publishes an `alternatenames` column, but it is a flat
 *    comma-separated list with no language tag, so picking "the Japanese one" out of it would be a
 *    guess dressed as data — and a guess that puts 北京 and 베이징 in the same bucket. Wikidata keys
 *    on the GeoNames id (P1566), so the labels come back ATTACHED to their language: ja, de, ru, es.
 *    Queried in batches of ids with `VALUES`, which is a bounded query rather than a scan.
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
import { inflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'gazetteer-world.json');
const CACHE = join(ROOT, 'node_modules', '.cache', 'intmap-gazetteer');
const SRC = 'https://download.geonames.org/export/dump/cities15000.zip';
const WDQS = 'https://query.wikidata.org/sparql';
const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap) gazetteer-build';

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

async function geonames() {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const zipPath = join(CACHE, 'cities15000.zip');
  let buf;
  if (existsSync(zipPath)) { buf = readFileSync(zipPath); }
  else {
    process.stdout.write(`downloading ${SRC} … `);
    const r = await fetch(SRC, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error('GeoNames HTTP ' + r.status);
    buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(zipPath, buf);
    console.log(`${(buf.length / 1e6).toFixed(2)} MB`);
  }
  const { name, text } = unzipFirst(buf);
  console.log(`  ${name}: ${text.length.toLocaleString()} bytes`);
  return text;
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
  liberty independence victory concord union pride energy summit mission progress`
  .split(/\s+/).filter(Boolean));

const isLatin = (s) => /^[\x20-\x7EÀ-ɏ'’\- .]+$/.test(s);
const hasCJK = (s) => /[぀-ヿ㐀-鿿]/.test(s);

/* ── Wikidata: labels attached to their language, keyed on the GeoNames id ──────────────────── */
async function wikidataLabels(ids) {
  const out = new Map();
  const BATCH = 400;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const values = chunk.map((g) => `"${g}"`).join(' ');
    const q = `SELECT ?gid ?ja ?de ?ru ?es WHERE {
      VALUES ?gid { ${values} } ?item wdt:P1566 ?gid .
      OPTIONAL{ ?item rdfs:label ?ja FILTER(lang(?ja)="ja") }
      OPTIONAL{ ?item rdfs:label ?de FILTER(lang(?de)="de") }
      OPTIONAL{ ?item rdfs:label ?ru FILTER(lang(?ru)="ru") }
      OPTIONAL{ ?item rdfs:label ?es FILTER(lang(?es)="es") } }`;
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const r = await fetch(WDQS + '?format=json&query=' + encodeURIComponent(q),
          { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        for (const b of j.results.bindings) {
          const g = b.gid.value, cur = out.get(g) || {};
          for (const k of ['ja', 'de', 'ru', 'es']) if (b[k] && b[k].value) cur[k] = b[k].value;
          out.set(g, cur);
        }
        ok = true;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      }
    }
    process.stdout.write(`\r  Wikidata ${Math.min(i + BATCH, ids.length)}/${ids.length} … `);
  }
  console.log('done');
  return out;
}

/* ── the curated rows this file must not shadow ─────────────────────────────────────────────── */
function curatedSurfaces() {
  const src = readFileSync(join(ROOT, 'js', 'gazetteer.js'), 'utf8') + '\n' +
              readFileSync(join(ROOT, 'js', 'newsgeo.js'), 'utf8') + '\n' +
              readFileSync(join(ROOT, 'js', 'tables.js'), 'utf8');
  const out = new Set();
  /* every single-quoted literal in those three files, lowercased — a superset of the curated
     surface forms, which is exactly the safe direction: it can only make this file yield MORE. */
  for (const m of src.matchAll(/'([^'\\\n]{2,40})'/g)) out.add(m[1].toLowerCase());
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
  const TARGET = LIMIT || 3400;
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

  let labels = new Map();
  if (!LIMIT) labels = await wikidataLabels(keep.map((r) => r.gid));

  /* row = [en, ja, iso2, lng, lat, pop, [extra surface forms…]] — the client turns this into the
     [type, terms, lng, lat, nameEn, nameJp] shape js/gazetteer.js already publishes. */
  const out = keep.map((r) => {
    const L = labels.get(r.gid) || {};
    const extra = [];
    for (const v of [r.local, L.de, L.ru, L.es]) {
      if (!v || v === r.en) continue;
      const k = v.toLowerCase();
      if (curated.has(k)) continue;
      if (isLatin(v) && (v.length < 4 || STOP.has(k))) continue;
      if (!hasCJK(v) && !isLatin(v) && v.length < 4) continue;
      if (!extra.includes(v)) extra.push(v);
    }
    const ja = (L.ja && !curated.has(L.ja.toLowerCase())) ? L.ja : '';
    return [r.en, ja, r.iso2, +r.lng.toFixed(4), +r.lat.toFixed(4), r.pop, extra];
  });

  const doc = {
    v: 1,
    built: new Date().toISOString().slice(0, 10),
    attribution: 'Places and populations: GeoNames (cities15000, CC BY 4.0). ' +
                 'Names in ja/de/ru/es: Wikidata (CC0), keyed on GeoNames id (P1566).',
    fields: ['en', 'ja', 'iso2', 'lng', 'lat', 'pop', 'alt'],
    rows: out
  };
  writeFileSync(OUT, JSON.stringify(doc));
  const bytes = readFileSync(OUT).length;
  const withJa = out.filter((r) => r[1]).length;
  console.log(`\nwrote data/gazetteer-world.json — ${out.length.toLocaleString()} rows, ` +
              `${withJa.toLocaleString()} with a Japanese name, ${(bytes / 1024).toFixed(0)} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
