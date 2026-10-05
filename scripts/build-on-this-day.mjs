#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ON THIS DAY — every calendar day's dated events, read off the records the map draws   (marketing-next)
 * ----------------------------------------------------------------------------
 *  「次の流入エンジン」 (2026-10-03). A historical map has something new to say every single day of the year —
 *  «on 3 October 1990 the map stops drawing the German Democratic Republic» — and IntMap already holds every one
 *  of those days: the border records the map draws state the day a polity appears, ends or is redrawn, and the war
 *  record (data/wars.json) dates its operations. Nothing could READ them by calendar day. This file writes the
 *  index that can: data/on-this-day.json, «MM-DD → the events of that day in every year the records cover».
 *  Its readers are the app (js/on-this-day.js — the card in the search's empty state, the sheet, Atlas's
 *  `time.onThisDay`), the generated day pages and their pictures (scripts/on-this-day-pages.mjs) and the draft
 *  queue for posts (same file, `--queue`). One index, so the four cannot disagree about a day.
 *
 *  ══ ⚠⚠⚠ IT STATES ONLY WHAT A RECORD STATES, ON THE DAY THE RECORD STATES (historical-verification.md) ══════
 *  A border day is computed BY THE MAP'S OWN CODE — js/time-borders.js instantiated (scripts/history-pages.mjs
 *  `mapReader`, the reader the entry pages already use): `changeDates()` lists the days its records change,
 *  `collectionAt` answers the day before and the day itself, and the names are the ones the map WRITES on the
 *  outlines that day (the `tagSame` pass — «German Democratic Republic», 朝鮮（ソ連）, not a second table). A
 *  polity in the day but not the day before APPEARS, the reverse ENDS, and one in both whose drawn area differs
 *  by at least 1 km² (the precision the year book prints) is REDRAWN. What is NOT an event is left out, and each
 *  omission is counted in the index's `skipped`, so it is visible:
 *    · THE OPENHISTORICALMAP RECORD (1689–1885) ALTOGETHER. Its dates carry no precision, and the record shows it
 *      writes coarser dates as days. ⚠ (no-ad-hoc-hardcoding §4) observed 2026-10-03 on data/hist-borders.js: of its
 *      2,480 start and end dates inside 1689–1886, 918 fall on day 1 (720 on 1 January), against about 80 for an
 *      even spread over the 31 day numbers — and a first draft that kept its other days published «4 July 1805:
 *      the map stops drawing the United States». A day the record cannot vouch for is not «on this day». Lapses:
 *      when the bundle carries the precision OpenHistoricalMap states. Canon: `DAY_RECORDS` here, and the day
 *      pages say it in words;
 *    · a SEAM — the record answering the instant changes between the two days (OpenHistoricalMap → CShapes on
 *      1886-01-01): the difference is between two records, not two worlds (historical-verification.md §4-4);
 *    · a NAME the record does not date. The map's name table (js/time-borders.js _CS_ERA) is written in YEARS,
 *      read as 1 January where the record has no edge that year, so a name can turn on a border day that belongs
 *      to another polity. A polity is listed on a day only if the record itself has an edge for it there (a row
 *      of its state-system code starts, or ended the day before) — «Zaire» is not listed on 15 August 1971, the
 *      day Bahrain begins;
 *    · the sheets before 1689 — they state a period, never a day.
 *  CShapes dates a state's entry by the day (the Gleditsch–Ward system dates). Its 1 January rows are kept but
 *  marked `maybeYearOnly` — the same mark js/atlas-reasoning.js rankChanges gives a 1 January border day — because
 *  some of them are years (1889-01-01 «Southern Rhodesia») and some are days (1956-01-01 Sudan); the readers say
 *  so and never make one the day's headline.
 *  A war event is the record's own row with its own full date (`d`, and `d2` where the operation lasts) — read by
 *  js/time-index.js `warRecords`, the same reading the year book makes of the same file.
 *
 *  ══ (time-index-unify) THE INDEX, NOT ONLY THE CALENDAR ══════════════════════════════════════════════════════
 *  This file writes THE index of dated events (js/time-index.js holds its records and its cuts). `days` is its
 *  calendar cut — the records the map's own records date by the day, exactly as before. `events` beside it holds the
 *  dated events neither record states, as WIKIDATA states them (scripts/fetch-world-events.mjs → the committed
 *  snapshot scripts/time-index/wikidata-events.json, read here; this builder never asks the network): each with its
 *  item, the property that dated it and the precision Wikidata gives. They are read by year (the year book) and up
 *  to an instant (the dashboard's «World events»), not by the calendar pages, whose promise is the map's records.
 *
 *    node scripts/build-on-this-day.mjs           write data/on-this-day.json
 *    node scripts/build-on-this-day.mjs --check   re-derive and compare with the committed file (exit 1 on a difference)
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const GOVERNANCE = {
  'data/on-this-day.json': {
    /* the calendar index of the border records' change days (CShapes 2.0 · OpenHistoricalMap) and the war record's dated events,
       computed by the map's own code from the bundles here — it names CShapes polities, so CShapes' terms travel with it */
    publisher: 'IntMap (derived from CShapes 2.0, OpenHistoricalMap and the war record in this repository; dated events beside them from Wikidata, CC0)',
    url: 'https://icr.ethz.ch/data/cshapes/',
    licence: 'CC BY-NC-SA 4.0',
    attribution: true,
    paidBy: 'CShapes 2.0 (Schvitz et al., ETH Zürich)',
    cadence: 'static',
    cadenceBasis: {
      observed: 'derived only from other bundles in this repository (data/cshapes.js, data/hist-borders.js, data/wars.json) and the committed Wikidata snapshot scripts/time-index/wikidata-events.json (written by scripts/fetch-world-events.mjs, retrieved 2026-10-04), never from an upstream at build time; it changes when they are rebuilt, and `--check` says whether it still matches them',
      expires: 'if the builder starts reading an upstream directly, or when scripts/fetch-world-events.mjs is run again',
      canon: 'scripts/build-on-this-day.mjs GOVERNANCE',
    },
    builtBy: 'scripts/build-on-this-day.mjs',
  },
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = 'data/on-this-day.json';
/* the Wikidata statements the index carries, as last fetched (scripts/fetch-world-events.mjs SNAPSHOT) */
const WIKIDATA_SNAPSHOT = 'scripts/time-index/wikidata-events.json';

/* the records whose dates are days (header): CShapes, from its first year — the OpenHistoricalMap record is not one of them */
export const DAY_RECORDS = ['cshapes'];
/* the precision the year book prints an area at (js/year-book.js fmtInt km²): below it two drawn shapes are the same shape */
const REDRAWN_KM2 = 1;

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => (y < 0 ? '-' + String(-y).padStart(6, '0') : String(y).padStart(4, '0')) + '-' + pad(m) + '-' + pad(d);
/** local noon of a calendar day — what collectionAt reads (getFullYear / getMonth / getDate) */
function localNoon(y, m, d) { const t = new Date(2000, 0, 1, 12, 0, 0); t.setFullYear(y, m - 1, d); return t; }
const round2 = (x) => Math.round(x * 100) / 100;
/* a shipped `window.X = {…};` bundle, read the way the history pages read it */
const readBundle = (rel) => { const t = readFileSync(join(ROOT, rel), 'utf8'); return JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); };

/* the drawn area of a feature on the sphere (km²) — js/year-book.js areaKm2, the year book's own measure */
async function areaReader() { const YB = await import('../js/year-book.js'); return YB.areaKm2; }
function bboxOf(g, b) {
  const walk = (cs) => { for (const x of cs) { if (typeof x[0] === 'number') { if (x[0] < b[0]) b[0] = x[0]; if (x[1] < b[1]) b[1] = x[1]; if (x[0] > b[2]) b[2] = x[0]; if (x[1] > b[3]) b[3] = x[1]; } else walk(x); } };
  if (g && g.coordinates) walk(g.coordinates);
  return b;
}

/** name (en, as the map writes it) → { en, jp, km, bb } over one instant's features */
function polities(r, areaKm2) {
  const m = new Map();
  if (!r || !r.fc) return m;
  r.fc.features.forEach((f, i) => {
    const en = r.labels.en[i]; if (!en) return;   /* an outline the record leaves unnamed is drawn without a label; it is not a polity this page can name */
    /* (hist-coverage-expansion) the day record is CShapes: Cliopatria's pieces under it (`_rec: 'clio'`) state years, and a
       piece sharing a state's name (the Russian Empire's Arctic islands) must not move that state's area or box on a day */
    if (f.properties && f.properties._rec) return;
    const jp = r.labels.jp[i];
    let row = m.get(en);
    if (!row) { row = { en, jp: jp && jp !== en ? jp : null, km: 0, bb: [Infinity, Infinity, -Infinity, -Infinity], gw: new Set() }; m.set(en, row); }
    if (f.properties && f.properties._gw != null) row.gw.add(+f.properties._gw);
    row.km += areaKm2(f.geometry);
    bboxOf(f.geometry, row.bb);
  });
  return m;
}
const out1 = (row) => {
  const o = { en: row.en };
  if (row.jp) o.jp = row.jp;
  if (isFinite(row.bb[0])) o.bb = row.bb.map(round2);
  if (row.gw.size) o.gw = [...row.gw].sort((a, b) => a - b);   /* the record's own codes — what the day's picture (scripts/lib/map-card.mjs) fills */
  return o;
};

/** → the index object (what data/on-this-day.json holds) */
export async function build() {
  const { mapReader } = await import('./history-pages.mjs');
  const R = await mapReader();
  const B = R.bands;
  const areaKm2 = await areaReader();
  /* the record's own edges: day key → the state-system codes whose row starts that day or ended the day before */
  const CS = readBundle('data/cshapes.js');
  const edges = new Map();
  const edge = (y, m, d, gw) => { const k = isoOf(y, m, d); (edges.get(k) || edges.set(k, new Set()).get(k)).add(+gw); };
  for (const f of CS.feats) {
    edge(f[2], f[3], f[4], f[1]);
    const e = new Date(Date.UTC(2000, f[6] - 1, f[7] + 1)); e.setUTCFullYear(f[5], f[6] - 1, f[7] + 1);
    edge(e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate(), f[1]);
  }
  const days = {};
  const put = (md, ev) => (days[md] || (days[md] = [])).push(ev);
  const skipped = { seam: 0, notADayRecord: 0, undatedName: 0, unchanged: 0 };

  /* ── the border records' change days ── */
  const dates = await R.api.changeDates();
  for (const k of dates) {
    const y = k.getUTCFullYear(), m = k.getUTCMonth() + 1, d = k.getUTCDate();
    if (y < B.ohmFrom || y > B.csTo) continue;   /* below 1689: a sheet states a period, not a day — and it is not a change of the record either */
    if (y < B.csFrom) { skipped.notADayRecord++; continue; }   /* 1689–1885: the OpenHistoricalMap record (header) — counted, not asked */
    const day = localNoon(y, m, d), prev = localNoon(y, m, d - 1);
    const after = await R.labelsAt(day), before = await R.labelsAt(prev);
    if (!after || !before || !after.fc || !before.fc) continue;
    /* (hist-coverage-expansion) a composed answer is named by its records in order (`composite:cshapes+clio`): the day
       is its FIRST record's — Cliopatria under CShapes states years and carries no state-system code, so it adds no event */
    const tierOf = (r) => (String(r.tier).indexOf('composite:') === 0 ? String(r.tier).slice(10).split('+')[0] : r.tier);
    if (tierOf(after) !== tierOf(before)) { skipped.seam++; continue; }
    if (!DAY_RECORDS.includes(tierOf(after))) { skipped.notADayRecord++; continue; }
    const A = polities(before, areaKm2), Bn = polities(after, areaKm2);
    const here = edges.get(isoOf(y, m, d)) || new Set();
    const dated = (p) => [...p.gw].some((g) => here.has(g));
    const appeared0 = [...Bn.values()].filter((p) => !A.has(p.en));
    const ended0 = [...A.values()].filter((p) => !Bn.has(p.en));
    const redrawn0 = [...Bn.values()].filter((p) => A.has(p.en) && Math.abs(A.get(p.en).km - p.km) >= REDRAWN_KM2);
    const appeared = appeared0.filter(dated), ended = ended0.filter(dated), redrawn = redrawn0.filter(dated);
    skipped.undatedName += appeared0.length + ended0.length + redrawn0.length - appeared.length - ended.length - redrawn.length;
    if (!appeared.length && !ended.length && !redrawn.length) { skipped.unchanged++; continue; }
    const byArea = (a, b) => b.km - a.km || a.en.localeCompare(b.en);
    const ev = { d: isoOf(y, m, d), src: tierOf(after) };
    if (m === 1 && d === 1) ev.maybeYearOnly = true;
    if (appeared.length) ev.appeared = appeared.sort(byArea).map(out1);
    if (ended.length) ev.ended = ended.sort(byArea).map(out1);
    if (redrawn.length) ev.redrawn = redrawn.sort(byArea).map(out1);
    put(pad(m) + '-' + pad(d), ev);
  }

  /* ── the war record's dated events (js/time-index.js warRecords — the year book's reading of the same file; only a
        full date is a day) ── */
  const W = JSON.parse(readFileSync(join(ROOT, 'data/wars.json'), 'utf8'));
  const TI = await import('../js/time-index.js');
  const wars = {};
  for (const w of W.wars) wars[w.id] = { en: w.name.en, jp: w.name.jp, from: w.from, to: w.to };
  for (const ev of TI.warRecords(W, ['en', 'jp'])) put(ev.d.slice(5, 7) + '-' + ev.d.slice(8, 10), ev);

  /* ── the dated events beside them, as Wikidata states them (the committed snapshot — header) ── */
  const WD = JSON.parse(readFileSync(join(ROOT, WIKIDATA_SNAPSHOT), 'utf8'));
  const events = WD.rows.map((r) => {
    const ev = { d: r.d, src: 'wikidata', prec: r.prec, q: r.q, prop: r.prop, kind: r.kind };
    if (r.cal) ev.cal = r.cal;
    if (r.at) ev.at = r.at;
    ev.name = r.name;
    if (r.desc) ev.desc = r.desc;
    if (r.wiki && (r.wiki.en || r.wiki.jp)) ev.wiki = r.wiki;
    return ev;
  });

  /* each day's events oldest first; a border day before a war event on the same date */
  const order = { cshapes: 0, wars: 1 };
  const sorted = {};
  for (const md of Object.keys(days).sort()) sorted[md] = days[md].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : order[a.src] - order[b.src]));
  return {
    v: 1,
    built: 'scripts/build-on-this-day.mjs',
    src: { cshapes: CS.src, wars: W.src, wikidata: WD.src + ' — retrieved ' + WD.retrieved },
    span: { from: B.csFrom, to: B.csTo },
    dayRecords: DAY_RECORDS,   /* the border records this index carries BY THE DAY — the year book asks it (js/year-book.js) */
    skipped,
    wars,
    days: sorted,
    events,
  };
}

const serialize = (o) => JSON.stringify(o) + '\n';

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const t0 = Date.now();
  const idx = await build();
  const body = serialize(idx);
  const n = Object.values(idx.days).reduce((a, l) => a + l.length, 0);
  if (process.argv.includes('--check')) {
    const was = readFileSync(join(ROOT, OUT), 'utf8');
    if (was !== body) { console.error('build-on-this-day: ' + OUT + ' does not match what the records give — run `node scripts/build-on-this-day.mjs`'); process.exit(1); }
    console.log('build-on-this-day: ' + OUT + ' matches (' + n + ' events on ' + Object.keys(idx.days).length + ' days, ' + (Date.now() - t0) + ' ms)');
  } else {
    writeFileSync(join(ROOT, OUT), body);
    console.log('build-on-this-day: wrote ' + OUT + ' — ' + n + ' events on ' + Object.keys(idx.days).length + ' days, ' + body.length + ' bytes, skipped ' + JSON.stringify(idx.skipped) + ' (' + (Date.now() - t0) + ' ms)');
  }
}
