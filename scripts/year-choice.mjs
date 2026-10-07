/* ============================================================================
 *  IntMap · scripts/year-choice.mjs — WHICH YEARS GET A PAGE, and where they live   (history-year-pages)
 * ----------------------------------------------------------------------------
 *  The rule scripts/year-pages.mjs writes pages for, split out so scripts/history-pages.mjs can ask it with a
 *  STATIC import. ⚠ It imports nothing from history-pages: the two page generators import each other, and a
 *  dynamic import of year-pages inside history-pages' collect() deadlocked under vite's bundled config loader
 *  (vite build exited 0 having written nothing — measured on PR #1028's CI and locally).
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* under the history pages' hub (scripts/history-pages.mjs HUB — the checks hold the prefix to it). Written out, not derived at
   load: history-pages imports this file for its sitemap index, and in that cycle its bindings are not yet initialised here. */
export const YEAR_HUB = 'history/years/';
export const YEAR_SITEMAP = 'sitemap-years.xml';

/* ⚠ (no-ad-hoc-hardcoding §4) THE SHARE OF YEAR-TO-YEAR CHANGES THAT MAKES A YEAR A TURNING POINT.
   observation: 2026-10-07, over the records as shipped — 657 non-zero year-to-year changes from 3200 BC to 2019; the top
   5% are the changes of 21 or more names, 34 years (the list is in dev-notes/2026-10-07-history-year-pages.md). With the
   sheets and the event years it gives about a hundred pages, the size the brief set (40–120).
   lapses: never by itself — the threshold is recomputed from the records on every build; the share changes only if the
   number of pages wanted does. canonical: here. */
export const TURN_SHARE = 0.05;
/* ⚠ THE EVENT KINDS THAT ARE ABOUT POLITIES. The kinds are the dated-events index's own (scripts/fetch-world-events.mjs SEED,
   the categories the dashboard colours by). A page about the political map is chosen for the events that change or found
   polities; the others are still LISTED on every chosen year's page. Every kind the index holds must be classified here —
   a new kind stops the build rather than being silently left out (`chooseYears`).
   observation: the seven kinds the index held on 2026-10-07; lapses: when the seed adds a kind; canonical: the seed. */
export const EVENT_KINDS = { geo: true, war: true, revolution: true, disaster: false, space: false, economic: false, assassination: false };

/** the instant 1 July of an astronomical year, local time — what collectionAt reads (scripts/history-pages.mjs does the same) */
export function july1(y) { const d = new Date(2000, 6, 1, 12, 0, 0); d.setFullYear(y); return d; }
export const readBundle = (rel, root = ROOT) => { const t = readFileSync(join(root, rel), 'utf8'); return JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); };

/** the records an answer is composed of, in order: 'composite:cshapes+clio' → ['cshapes','clio']; a single tier → [it] */
export function partsOfTier(tier) {
  const t = String(tier || '');
  if (t.indexOf('composite:') === 0) return t.slice(10).split('+');
  return [{ snapshot: 'sheet', ohm: 'ohm', cshapes: 'cshapes' }[t] || t];
}
/** which record drew a feature: its own `_rec`; the two collections that write none are CShapes (from 1886) and the
 *  OpenHistoricalMap band (1689–1885), told apart by the records the answer is composed of */
export function recordOf(p, parts) {
  if (p && p._rec) return p._rec;
  if (parts.includes('cshapes')) return 'cshapes';
  if (parts.includes('ohm')) return 'ohm';
  throw new Error('year-pages: a feature names no record and the answer (' + parts.join('+') + ') has none that writes none');
}

/* ══ WHICH YEARS ═══════════════════════════════════════════════════════════════════════════════════ */
/**
 * @param {{ api: object, bands: object }} R   mapReader()
 * @param {object} idx                         data/on-this-day.json
 * @returns {Promise<{ years: number[], why: Map<number, object>, turn: object }>}
 */
export async function chooseYears(R, idx, root = ROOT) {
  const B = R.bands;
  const why = new Map();
  const add = (y, k, v) => { const w = why.get(y) || {}; w[k] = v === undefined ? true : v; why.set(y, w); };
  /* ① the sheets */
  const sheets = readBundle('data/hist-eras.js', root).snaps.map((s) => s.y).filter((y) => y <= B.csTo).sort((a, b) => a - b);
  for (const y of sheets) add(y, 'sheet');
  /* ② the turning points: where the dated records begin — the first sheet year whose answer composes one, from the sheet before it */
  const datedIn = async (y) => { const r = await R.api.collectionAt(july1(y)); return r && r.fc ? r : null; };
  let from = null;
  for (let i = 0; i < sheets.length; i++) {
    const r = await datedIn(sheets[i]);
    const parts = r && r.record && r.record.parts ? r.record.parts.map((p) => p.tier) : [];
    if (parts.some((p) => p !== 'sheet')) { from = i ? sheets[i - 1] : sheets[i]; break; }
  }
  if (from == null) throw new Error('year-pages: no year the map answers composes a dated record');
  const changes = [];
  const seams = [];
  let prev = null, prevKey = null;
  for (let y = from; y <= B.csTo; y++) {
    const r = await datedIn(y);
    if (!r) throw new Error('year-pages: the map answered nothing for the year ' + y);
    const parts = r.record && r.record.parts ? r.record.parts.map((p) => p.tier) : partsOfTier(r.tier);
    const key = parts.join('+');
    const set = new Set();
    for (const f of r.fc.features) {
      const p = f.properties || {};
      const rec = recordOf(p, parts);
      if (rec === 'sheet' || !p.NAME) continue;
      set.add(rec + '\u0001' + p.NAME);
    }
    if (prev && key !== prevKey) seams.push({ y, from: prevKey, to: key });
    else if (prev) {
      let a = 0, b = 0;
      for (const x of set) if (!prev.has(x)) a++;
      for (const x of prev) if (!set.has(x)) b++;
      if (a + b) changes.push({ y, n: a + b });
    }
    prev = set; prevKey = key;
  }
  const sorted = changes.map((c) => c.n).sort((a, b) => b - a);
  const cut = sorted[Math.max(0, Math.ceil(sorted.length * TURN_SHARE) - 1)];
  for (const c of changes) if (c.n >= cut) add(c.y, 'turn', c.n);
  /* ③ the event years */
  for (const e of idx.events || []) {
    if (!(e.kind in EVENT_KINDS)) throw new Error('year-pages: the dated-events index has a kind EVENT_KINDS does not classify: ' + e.kind);
    if (!EVENT_KINDS[e.kind]) continue;
    const y = +String(e.d).match(/^-?\d+/)[0];
    if (y < B.floor || y > B.csTo) continue;
    const w = why.get(y) || {};
    add(y, 'event', (w.event || []).concat([e]));
  }
  const years = [...why.keys()].sort((a, b) => a - b);
  return { years, why, turn: { from, cut, share: TURN_SHARE, changes: changes.length, seams } };
}
