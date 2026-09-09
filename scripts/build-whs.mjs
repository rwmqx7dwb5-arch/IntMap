#!/usr/bin/env node
/* ============================================================================
 *  build-whs.mjs — data/whc-sites.json + data/whc-detail.json.gz
 * ----------------------------------------------------------------------------
 *  「世界遺産をすべてマッピングしたレイヤーを作って。」
 *
 *  ── WHAT UPSTREAM PUBLISHES ────────────────────────────────────────────────────────────────
 *  The World Heritage Centre serves the whole List as one XML document per site language:
 *
 *      https://whc.unesco.org/<locale>/list/xml/
 *
 *  Measured 2026-09-09: 1,273 inscribed properties, 216 columns, and — the reason this layer can
 *  claim 「すべて」 — a <geolocations> block holding one <poi> per COMPONENT PART. 484 of the
 *  properties are serial or transboundary and carry more than one point; 6,009 points in all. A
 *  layer that drew one pin per row would be drawing a third of what is inscribed.
 *
 *  ⚠ THE ENDPOINT IS BEHIND CLOUDFLARE AND REFUSES A DEFAULT USER-AGENT (403, an interstitial, not
 *  an error page). It also sends no CORS header. Both facts say the same thing: the browser cannot
 *  read this feed, so the data is BUILT HERE and shipped in data/. The List changes once a year,
 *  at the Committee session.
 *
 *  ── THE LANGUAGES ARE PROBED, NOT LISTED ───────────────────────────────────────────────────
 *  UNESCO's own language switcher advertises only en/fr (the Convention's working languages), yet
 *  es, ru, zh, ja and ar all answer the XML endpoint with a full, translated List. There is no
 *  published index of that, so this script DISCOVERS it: it reads IntMap's locale directory
 *  through js/lang-registry.js — the same registry the app uses, so 'jp'→'ja' and the two Chinese
 *  rows come from there and not from a table here — takes each language subtag, and asks. de and
 *  ko answer 404 and are simply absent; nothing here names them.
 *
 *  ⚠ AND THE SCRIPT OF UNESCO'S CHINESE IS MEASURED, NOT ASSUMED. The registry is explicit that
 *  「handing one script's reader the other because the first two letters match is a guess」
 *  (js/lang-registry.js, #R223). So the Chinese names are run through scripts/zh-hans.mjs's
 *  toHans(): text that is already Simplified comes back unchanged, and that is what identifies the
 *  feed as zh-Hans. It is stored under the BCP-47 tag that measurement produced. A zh-Hant reader
 *  is offered English, because UNESCO publishes no Traditional list — which is the honest answer.
 *
 *  ── ⚠⚠⚠ THE <danger> COLUMN IS STALE AND IS NOT USED ───────────────────────────────────────
 *  The XML has a <danger> column. It is not maintained. Measured 2026-09-09, every one of these is
 *  EMPTY in it while every one of them is on the List of World Heritage in Danger:
 *
 *      23    Site of Palmyra                          in danger since 2013
 *      385   Old City of Sana'a                       in danger since 2015
 *      527   Kyiv: Saint-Sophia Cathedral …           in danger since 2023
 *      1703  The Historic Centre of Odesa             in danger since 2023
 *
 *  The column's newest entry of any kind is «Y 2014». Shipping it would put a decade-old snapshot
 *  on the map under a present-tense label. So the danger dimension is asked of something that does
 *  know: Wikidata's `significant event → listed as World Heritage in Danger (Q222384)` statements,
 *  where an open-ended statement (no P582 end qualifier) is a site in danger NOW. It joins on P757
 *  (World Heritage Site ID), which upstream writes for component parts too («23bis», «527-002») —
 *  those are folded onto the numeric property id. Both sources are credited separately.
 *
 *  ── WHY TWO FILES ──────────────────────────────────────────────────────────────────────────
 *  data/whc-sites.json is fetched when the LAYER is switched on: names in every language the feed
 *  publishes, and the facts the map draws or filters by. data/whc-detail.json.gz is fetched when
 *  the first site PANEL is opened: UNESCO's description in every one of those languages, the
 *  criteria, the photograph and the location line. A reader who never opens a site never pays.
 *
 *  Source & licence: UNESCO World Heritage Centre (© UNESCO, whc.unesco.org) for the List itself;
 *  Wikidata (CC0) for the current in-danger status. Both declared in js/reference-data.js.
 *
 *  Usage:  node scripts/build-whs.mjs [--cache <dir>] [--offline] [--check]
 *          --cache   keep the raw answers so a rebuild does not re-download ~16 MB
 *          --offline build from --cache only; fail if anything is missing
 *          --check   rebuild into memory and exit 1 if the committed files differ
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toHans } from './zh-hans.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CACHE = argOf('--cache', '');
const OFFLINE = args.includes('--offline');
const CHECK = args.includes('--check');

const OUT_LAYER = path.join(ROOT, 'data', 'whc-sites.json');
/* ⚠ ONE FILE PER LANGUAGE, NOT ONE FILE WITH EVERY LANGUAGE IN IT. The six descriptions of a
   property are six times the bytes of one, and a reader needs exactly one of them: a single
   combined file measured 2.0 MB gzipped, of which any one reader wanted a sixth. Each per-language
   file is COMPLETE on its own — where UNESCO publishes no translation for a property the English
   text is written into that language's file — so opening a panel is one fetch, not a fetch and a
   fallback fetch. The name is computed from the locale the reader is in, which scripts/asset-report
   classifies as `prefix`: the directory and stem are literal and the tag is not. */
const detailPath = (tag) => path.join(ROOT, 'data', `whc-detail.${tag}.json.gz`);

const WHC = 'https://whc.unesco.org';
const WHC_ATTRIB = 'UNESCO World Heritage Centre';
const WD_ATTRIB = 'Wikidata';
const WDQS = 'https://query.wikidata.org/sparql';
/* Q222384 — «World Heritage Site in Danger», the value Wikidata's P793 (significant event) takes
   when a property is inscribed on the List in Danger. P580/P582 qualify when it began and ended;
   a statement with no end is a site that is in danger today. */
const WD_DANGER = `SELECT ?id ?start WHERE {
  ?whs p:P793 ?st . ?st ps:P793 wd:Q222384 . ?whs wdt:P757 ?id .
  OPTIONAL { ?st pq:P580 ?start } FILTER NOT EXISTS { ?st pq:P582 ?end }
}`;

/* ⚠⚠⚠ THE FETCH IS curl, AND THAT IS NOT A PREFERENCE. whc.unesco.org sits behind Cloudflare's
   bot check, and the check is not looking at the User-Agent header — it fingerprints the TLS
   handshake. Measured 2026-09-09 on this endpoint: Node's own fetch() answers 403 with a
   «Just a moment…» interstitial under a bare UA, under UA + Accept + Accept-Language, and under a
   full set of Chrome's sec-ch-ua / sec-fetch-* client hints — three tries, three 403s, no <row>
   element in any of the three bodies. curl gets 200 and 2.5 MB of List. Dressing the Node request
   up further would be guessing at what the check measures; calling the client that is already
   allowed through is not. curl ships with Windows 10+ and with every CI image this project uses.
   ⚠ The body is written to a file rather than piped, because these documents are megabytes of
   UTF-8 and a shell pipe on Windows is not a safe transport for that. */
function curlText(url, accept) {
  const tmp = path.join(os.tmpdir(), `whs-${process.pid}-${(curlText.n = (curlText.n || 0) + 1)}.tmp`);
  try {
    const r = spawnSync('curl', ['-sS', '-L', '--compressed', '--max-time', '120',
      '-A', UA, '-H', `Accept: ${accept}`, '-o', tmp, '-w', '%{http_code}', url],
      { encoding: 'utf8' });
    if (r.error) throw new Error(`curl could not be run (${r.error.message}) — this build needs it, see the note above`);
    const status = +String(r.stdout).trim();
    const body = fs.existsSync(tmp) ? fs.readFileSync(tmp, 'utf8') : '';
    if (status !== 200) { const e = new Error(`${url} → HTTP ${status}`); e.status = status; throw e; }
    return body;
  } finally { try { fs.unlinkSync(tmp); } catch (_) {} }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
         + 'Chrome/140.0.0.0 Safari/537.36';

function get(url, { accept, cacheKey } = {}) {
  const cached = CACHE && cacheKey ? path.join(CACHE, cacheKey) : '';
  if (cached && fs.existsSync(cached)) return fs.readFileSync(cached, 'utf8');
  if (OFFLINE) throw new Error(`--offline and ${cacheKey || url} is not in the cache`);
  const body = curlText(url, accept || '*/*');
  if (cached) { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(cached, body); }
  return body;
}

/* ══ THE LANGUAGE SET COMES FROM THE APP'S OWN REGISTRY ═══════════════════════════════════════
   js/lang-registry.js is a browser global, not a module, and it is the only place that knows both
   that IntMap's Japanese code is 'jp' and that its two Chinese rows are zh-Hant and zh-Hans. It is
   evaluated here rather than copied, so a language added to js/locales/ reaches this build with no
   edit — which is the property scripts/i18n-langs.mjs already relies on for the reading pages. */
function appLanguages() {
  const sandbox = { window: {}, navigator: { language: 'en' }, document: undefined, Intl, console };
  sandbox.window.window = sandbox.window;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'locales', '_langs.js'), 'utf8'), ctx,
    { filename: '_langs.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'lang-registry.js'), 'utf8'), ctx,
    { filename: 'lang-registry.js' });
  const L = sandbox.window.IntMapLang;
  if (!L || typeof L.htmlTag !== 'function') throw new Error('js/lang-registry.js did not define IntMapLang.htmlTag');
  return L.list().map((row) => ({ code: row.code, tag: L.htmlTag(row.code) }));
}

/* ══ XML ═════════════════════════════════════════════════════════════════════════════════════ */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function unent(s) {
  /* run to a fixed point: UNESCO double-encodes the HTML inside <short_description> (&lt;p&gt;),
     so one pass leaves markup behind and the caller cannot tell text from tags. */
  let prev, out = String(s);
  do { prev = out; out = out.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, k) => {
    if (k[0] === '#') { const n = k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : +k.slice(1);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m; }
    return Object.prototype.hasOwnProperty.call(ENT, k) ? ENT[k] : m; }); } while (out !== prev);
  return out;
}
const field = (row, tag) => {
  const m = row.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? unent(m[1]).trim() : '';
};
const rowsOf = (xml) => {
  const rows = xml.split('<row>').slice(1).map((r) => r.slice(0, r.indexOf('</row>')));
  if (!rows.length) throw new Error('no <row> elements — the endpoint did not answer with the List');
  return rows;
};
/* the description is HTML (<p>…</p>, the occasional <em>). The panel renders text, so the tags come
   off here rather than at 1,273 call sites; block ends become paragraph breaks so the text keeps
   its shape. */
function plain(html) {
  return unent(html)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ══ ROMAN NUMERALS — the ten criteria, read from what the feed wrote ════════════════════════
   criteria_txt is «(i)(iii)(vi)». The order the letters are stored in is the order upstream wrote
   them; the vocabulary is the set that actually occurs, not a list of ten written down here. */
const critOf = (txt) => (txt.match(/\(([ivx]+)\)/gi) || []).map((s) => s.slice(1, -1).toLowerCase());

async function main() {
  /* ── ① which languages can be had ─────────────────────────────────────────────────────── */
  const langs = appLanguages();
  const subtags = [...new Set(langs.map((l) => l.tag.split('-')[0]))].sort();
  const feeds = new Map();      /* subtag → rows */
  const missing = [];
  for (const sub of subtags) {
    try {
      const xml = get(`${WHC}/${sub}/list/xml/`, { accept: 'application/xml,text/xml',
        cacheKey: `whc-${sub}.xml` });
      feeds.set(sub, rowsOf(xml));
    } catch (e) { missing.push(`${sub} (${e.status || e.message})`); }
  }
  if (!feeds.has('en')) throw new Error('the English List did not load; nothing can be built without it — '
    + `probed ${subtags.join(', ')}; refusals: ${missing.join(' | ') || 'none'}`);

  /* ── ② which BCP-47 tag each feed actually speaks ──────────────────────────────────────
     For every language but Chinese the subtag IS the answer. Chinese has two rows in the registry
     and one feed, so the feed is asked which script it is written in: Simplified text is a fixed
     point of toHans(). ⚠ This compares SITE NAMES, not the whole document — the description text
     carries proper nouns and quotations that behave differently — and it needs a majority, not a
     single sample, because a name made only of characters the two scripts share (人民, 大同) is a
     fixed point in either script. */
  const tagOf = new Map();
  for (const [sub, rows] of feeds) {
    const variants = langs.filter((l) => l.tag.split('-')[0] === sub).map((l) => l.tag);
    if (variants.length <= 1) { tagOf.set(sub, variants[0] || sub); continue; }
    const names = rows.map((r) => field(r, 'site')).filter((n) => /[㐀-鿿]/.test(n));
    const already = names.filter((n) => toHans(n) === n).length;
    const isHans = already * 2 > names.length;
    const want = isHans ? 'Hans' : 'Hant';
    const pick = variants.find((t) => t.includes(want));
    if (!pick) throw new Error(`the ${sub} feed reads as ${want} and no app language declares it`);
    tagOf.set(sub, pick);
    console.log(`  ${sub}: ${already}/${names.length} site names are already Simplified → ${pick}`);
  }
  const locales = [...feeds.keys()].map((s) => tagOf.get(s)).sort();

  /* ── ③ the danger list, from something that maintains it ──────────────────────────────── */
  const danger = new Map();     /* numeric site id → year in danger since (0 when unqualified) */
  let dangerRows = 0;
  {
    const body = get(`${WDQS}?query=${encodeURIComponent(WD_DANGER)}`,
      { accept: 'application/sparql-results+json', cacheKey: 'wd-danger.json' });
    const j = JSON.parse(body);
    for (const b of j.results.bindings) {
      dangerRows++;
      /* «23bis», «527-002» and «1208bis» are component parts of one property; the map draws the
         property. Anything with no leading number is not a List id and is dropped loudly below. */
      const m = /^(\d+)/.exec(b.id.value);
      if (!m) continue;
      const id = +m[1];
      const y = b.start ? +b.start.value.slice(0, 4) : 0;
      const have = danger.get(id);
      if (have == null || (y && (!have || y < have))) danger.set(id, y);
    }
  }

  /* ── ④ assemble ───────────────────────────────────────────────────────────────────────── */
  const en = feeds.get('en');
  const byId = new Map();       /* subtag → id → row, for the translated feeds */
  for (const [sub, rows] of feeds) {
    if (sub === 'en') continue;
    const m = new Map(); for (const r of rows) m.set(field(r, 'id_number'), r); byId.set(sub, m);
  }

  const regions = new Vocab(), categories = new Vocab(), countries = new Vocab();
  const sites = [];
  const points = [];            /* [siteIndex, lng, lat, countryIndex] — flat, one number each */
  const detail = {};
  let noPoint = [], dangerMatched = 0;

  for (const r of en) {
    const id = +field(r, 'id_number');
    if (!Number.isFinite(id)) throw new Error('a row has no id_number; the schema changed');
    const names = { en: field(r, 'site') };
    const descs = { en: plain(field(r, 'short_description')) };
    /* ⚠ THE COUNTRIES NAME THEMSELVES IN EACH FEED. <states> is «日本» in the Japanese List and
       «Japan» in the English one, so a panel can say who a property belongs to in the reader's
       language without this project owning an ISO-code→name table for 173 countries in six
       languages. The <iso_code> column stays too, but only for what codes are good at: filtering. */
    const states = { en: field(r, 'states') };
    for (const [sub, m] of byId) {
      const tr = m.get(String(id)); if (!tr) continue;
      const tag = tagOf.get(sub);
      const n = field(tr, 'site'); if (n) names[tag] = n;
      const d = plain(field(tr, 'short_description')); if (d) descs[tag] = d;
      const st = field(tr, 'states'); if (st) states[tag] = st;
    }
    const iso = field(r, 'iso_code').split(',').map((s) => s.trim()).filter(Boolean);
    const idx = sites.length;
    const poi = [...r.matchAll(/<poi>([\s\S]*?)<\/poi>/g)].map((m) => m[1]);
    for (const p of poi) {
      const lng = +field(p, 'longitude'), lat = +field(p, 'latitude');
      /* a component with no usable coordinate is not a place on a map. It is counted, not invented. */
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0)) continue;
      const cc = field(p, 'iso2') || iso[0] || '';
      points.push(idx, round(lng, 5), round(lat, 5), cc ? countries.id(cc) : -1);
    }
    const mine = points.length && points[points.length - 4] === idx;
    if (!mine) noPoint.push(`${id} ${names.en}`);

    const dy = danger.has(id) ? (danger.get(id) || -1) : 0;   /* -1: in danger, year unpublished */
    if (dy) dangerMatched++;
    sites.push({
      id, n: names,
      c: categories.id(field(r, 'category')),
      r: field(r, 'regions').split(',').map((s) => regions.id(s.trim())),
      y: +field(r, 'date_inscribed') || 0,
      cr: critOf(field(r, 'criteria_txt')),
      s: iso.map((c) => countries.id(c)),
      t: field(r, 'transnational') === '1' ? 1 : 0,
      x: field(r, 'extension') === '1' ? 1 : 0,
      d: dy,
    });
    detail[id] = {
      d: descs, st: states,
      l: field(r, 'location') || null,
      img: field(r, 'image_url') || null,
      url: field(r, 'http_url') || null,
      sec: field(r, 'secondary_dates').split(',').map((s) => +s.trim()).filter(Boolean),
    };
  }

  /* ⚠ A DANGER ROW THAT MATCHES NO PROPERTY IS A JOIN THAT FAILED, AND SILENCE WOULD READ AS
     «nothing is in danger». It is printed; the file states both numbers so nothing downstream has
     to count them or, worse, quote a number measured somewhere else. */
  const known = new Set(sites.map((s) => s.id));
  const orphanDanger = [...danger.keys()].filter((id) => !known.has(id));

  const layer = {
    v: 1,
    built: new Date().toISOString().slice(0, 10),
    attribution: WHC_ATTRIB,
    source: `${WHC}/en/list/xml/`,
    danger: { attribution: WD_ATTRIB, source: 'https://query.wikidata.org/', count: dangerMatched },
    locales,
    /* ⚠ THE LOCALE'S PATH SEGMENT, BECAUSE IT IS NOT THE TAG. Every feed writes the same
       «/en/list/<id>» URL whatever language it is in, and whc.unesco.org serves the same page under
       each of its own segments — 'zh' for what this build measured as zh-Hans. The reverse of the
       probe is recorded rather than reconstructed, so the panel can send a reader to the page in
       the language they are reading. */
    localePath: Object.fromEntries([...feeds.keys()].map((sub) => [tagOf.get(sub), sub])),
    categories: categories.list,
    regions: regions.list,
    countries: countries.list,
    sites,
    points,
  };
  const layerText = JSON.stringify(layer);
  const perLocale = new Map();
  for (const tag of locales) {
    const sitesOut = {};
    for (const id of Object.keys(detail)) {
      const d = detail[id];
      sitesOut[id] = { d: d.d[tag] || d.d.en || '', st: d.st[tag] || d.st.en || '',
        l: d.l, img: d.img, url: d.url, sec: d.sec };
    }
    perLocale.set(tag, JSON.stringify({ v: 1, built: layer.built, attribution: WHC_ATTRIB, locale: tag,
      translated: Object.keys(detail).filter((id) => detail[id].d[tag]).length, sites: sitesOut }));
  }

  if (CHECK) {
    const stale = [];
    if (!fs.existsSync(OUT_LAYER) || fs.readFileSync(OUT_LAYER, 'utf8') !== layerText) stale.push('data/whc-sites.json');
    /* gzip is not byte-stable across zlib versions — compare what it decompresses to. */
    for (const [tag, text] of perLocale) {
      const f = detailPath(tag);
      if (!fs.existsSync(f) || zlib.gunzipSync(fs.readFileSync(f)).toString('utf8') !== text) stale.push(path.basename(f));
    }
    if (stale.length) { console.error(`stale: ${stale.join(', ')} — run node scripts/build-whs.mjs`); process.exit(1); }
    console.log(`data/whc-sites.json and ${perLocale.size} description file(s) are current`);
    return;
  }

  fs.writeFileSync(OUT_LAYER, layerText);
  let detailBytes = 0;
  for (const [tag, text] of perLocale) {
    const gz = zlib.gzipSync(Buffer.from(text), { level: 9 });
    fs.writeFileSync(detailPath(tag), gz); detailBytes += gz.length;
  }

  const pointCount = points.length / 4;
  const serial = sites.filter((_, i) => countFor(points, i) > 1).length;
  console.log(`\nwrote data/whc-sites.json — ${sites.length.toLocaleString()} inscribed properties, `
            + `${pointCount.toLocaleString()} component points, ${(layerText.length / 1024).toFixed(0)} kB`);
  console.log(`  ${serial.toLocaleString()} properties are drawn as more than one point`);
  console.log(`  languages: ${locales.join(', ')}`
            + (missing.length ? `; upstream publishes none for ${missing.join(', ')}` : ''));
  console.log(`  categories ${categories.list.join('/')} · regions ${regions.list.length} · `
            + `countries ${countries.list.length}`);
  console.log(`  ${dangerMatched} in danger now, from ${dangerRows} Wikidata statements`
            + (orphanDanger.length ? `; ${orphanDanger.length} named an id the List does not hold: ${orphanDanger.join(', ')}` : ''));
  if (noPoint.length) console.log(`  ⚠ ${noPoint.length} publish no usable coordinate and cannot be drawn: ${noPoint.join(' · ')}`);
  console.log(`wrote ${perLocale.size} description files — data/whc-detail.<${locales.join('|')}>.json.gz, `
            + `${(detailBytes / 1024).toFixed(0)} kB gzipped in all, `
            + `${(detailBytes / perLocale.size / 1024).toFixed(0)} kB the one a reader fetches`);
}

function countFor(points, idx) { let n = 0; for (let i = 0; i < points.length; i += 4) if (points[i] === idx) n++; return n; }
function round(x, n) { const m = 10 ** n; return Math.round(x * m) / m; }

/* a growing vocabulary: the file carries the strings once and the rows carry indices. */
function Vocab() { const at = new Map(); this.list = [];
  this.id = (s) => { if (at.has(s)) return at.get(s); at.set(s, this.list.length); this.list.push(s); return this.list.length - 1; }; }

main().catch((e) => { console.error('build-whs failed:', e.message); process.exit(1); });
