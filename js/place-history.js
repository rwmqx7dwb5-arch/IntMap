/* ============================================================================
 *  IntMap · THIS PLACE THROUGH TIME — who held one point, and when   (place-through-time)
 * ----------------------------------------------------------------------------
 *  Press anywhere on the map and the place card lists, oldest first, every polity the historical records say held
 *  that ground — from the deepest era sheet to the last day CShapes covers — each with its span, the record that says
 *  so (and that record's own ID for the row), and a button that moves the clock to it. Below, the first-level units
 *  (令制国・府県・州…) of the same point, from the same subdivision record the era layer draws. Atlas reaches the same
 *  record through `research.placeHistory` (js/atlas-cap-research.js).
 *
 *  ══ NOTHING IS DECIDED HERE THAT THE MAP DECIDES ELSEWHERE ═══════════════════════════════════════════════════════
 *    · which rows hold the point — js/hist-bundles.js `contains`, on the thread that holds every row: a box prefilter
 *      that cannot drop a row (the build proves it) and the exact even-odd test on the rings;
 *    · which record is drawn in which years, the name each row is drawn with, the names withheld and why, the label in
 *      the reader's language — js/time-borders.js `placeRecords` (and js/time-admin1.js for the subdivisions), the
 *      module that draws them, so this timeline is the map's own statement over the point, read across time;
 *    · what an edge IS — the pieces arrive classified (`stated`, `reach`, `rename`, `sheet`, `review`, and for the
 *      subdivisions `derived`, `unstated`, `undocumented`, `open`). This file adds exactly ONE judgement, and it is about
 *      the records, not about history: an end that falls on the day a MORE PRECISE record begins at this point is that
 *      record taking over (`handover`) — the records were cut against each other on those days
 *      (scripts/build-hist-clio.mjs) — unless the polity's own span in its record (Cliopatria's `ids`) ends there too.
 *  ⚠ A DATE NO RECORD STATES IS NEVER WRITTEN AS IF ONE DID (.agents/rules/historical-verification.md §2-3): an edge
 *    that is the edge of a record, a sheet's display years, or a derived bound is said as such, and a span no record
 *    covers is listed as a gap, not closed over.
 *  ⚠ A RECORD THAT COULD NOT BE READ IS NAMED, never answered as «nothing was here» (one-pass-or-a-reason §5).
 *  Strings IntMap writes here are en + jp (CONSTITUTION.md §7). No emoji; marks are js/icons.js line icons.
 * ==========================================================================*/
import { IntMapTime } from './chronos.js';
import { IntMapLang } from './lang-registry.js';
import './safe-html.js';

const HS = () => window.IntMapHistScale;

/* ── YYYYMMDD arithmetic (proleptic, never Date.UTC — js/hist-scale.js `utcAt`) ── */
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const kParts = (k) => { const y = Math.floor(k / 10000), r = k - y * 10000, m = Math.floor(r / 100); return [y, m, r - m * 100]; };
const kShift = (k, days) => { const p = kParts(k), t = new Date(0); t.setUTCFullYear(p[0], p[1] - 1, p[2]); t.setUTCDate(t.getUTCDate() + days); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };

/* the identity a piece is grouped by: its Wikidata item when the record binds one, else the name it is drawn with in
   its record's own English — so the same polity carried by two records (Cliopatria to 1689, OpenHistoricalMap after)
   is one entry, and two polities that share nothing are two */
function keyOf(p) {
  if (p.unnamed) return 'unnamed';
  if (p.withheld) return 'w:' + p.withheld.name;
  if (p.id && p.id.qid) return 'q:' + p.id.qid;
  return 'n:' + (p.name || '');
}

/**
 * compose(raw) — the national pieces of js/time-borders.js `placeRecords` → the timeline.
 *   → { entries:[{ key, name, i18n, labels:[{k,label}], from:{k,edge,tier,sheet?}, to:{k,edge,tier,by?,sheet?}, tiers, ids, realm,
 *                  of, life, withheld, unnamed, notes, sheets, jump }], gaps:[{from,to}], records, missing }
 * Pure: no map, no clock, no DOM — js/place-history checks and scripts/place-history.mjs evaluate it directly.
 */
export function compose(raw) {
  const order = (raw && raw.order) || [];
  const rank = (t) => { const i = order.indexOf(t); return i < 0 ? order.length : i; };
  const pieces = ((raw && raw.pieces) || []).slice().sort((a, b) => a.s - b.s || a.e - b.e);
  const entries = [];
  const open = new Map();   /* key → the entry whose last end may still touch the next piece */
  for (const p of pieces) {
    const k = keyOf(p);
    let E = open.get(k);
    /* the same name carried on across a record boundary by a record that binds no Wikidata item (CShapes binds none:
       its «Ottoman Empire» of 1886 continues OpenHistoricalMap's of 1885 on the same day) is the same entry */
    if ((!E || E.to.k < p.s) && p.name && !p.unnamed && !p.withheld) {
      const X = entries.find((x) => x.to.k === p.s && x.name === p.name && !x.unnamed && !x.withheld && (!(p.id && p.id.qid) || !x.ids.some((i) => i.id && i.id.qid)));
      if (X) { E = X; open.set(k, E); }
    }
    if (!E || E.to.k < p.s) {
      E = { key: k, name: p.name || '', i18n: p.i18n || null, labels: [], from: { k: p.s, edge: p.sEdge, tier: p.tier }, to: { k: p.e, edge: p.eEdge, tier: p.tier },
        tiers: [], ids: [], realm: !!p.realm, of: p.of || null, life: p.life || null, withheld: p.withheld || null, unnamed: !!p.unnamed, notes: [], sheets: [] };
      entries.push(E); open.set(k, E);
    }
    if (p.sheet != null) { if (E.sheets.indexOf(p.sheet) < 0) E.sheets.push(p.sheet); }
    if (p.e > E.to.k) E.to = { k: p.e, edge: p.eEdge, tier: p.tier };
    if (E.tiers.indexOf(p.tier) < 0) E.tiers.push(p.tier);
    const idk = JSON.stringify([p.tier, p.id || {}]);
    if (!E.ids.some((x) => JSON.stringify([x.tier, x.id]) === idk)) E.ids.push({ tier: p.tier, file: p.file, id: p.id || {} });
    const last = E.labels[E.labels.length - 1], lb = p.label || p.name || '';
    if (lb && (!last || last.label !== lb)) E.labels.push({ k: p.s, label: lb });
    if (!E.life && p.life) E.life = p.life;
    for (const n of p.notes || []) if (E.notes.indexOf(n) < 0) E.notes.push(n);
  }
  /* ⚠ THE ONE JUDGEMENT (see the header): an edge on the day a more precise record begins (or ends) here is a handover */
  const starts = new Map(), ends = new Map();
  for (const p of pieces) {
    if (!starts.has(p.s)) starts.set(p.s, []); starts.get(p.s).push(p);
    if (!ends.has(p.e)) ends.set(p.e, []); ends.get(p.e).push(p);
  }
  for (const E of entries) {
    if (E.to.edge === 'stated') {
      const by = (starts.get(E.to.k) || []).filter((q) => rank(q.tier) < rank(E.to.tier)).sort((a, b) => rank(a.tier) - rank(b.tier))[0];
      /* Cliopatria states the polity's own last year; when that is the year before this day, the end is the polity's */
      const ownEnd = E.life && E.to.tier === 'clio' && (E.life[1] + 1) === kParts(E.to.k)[0];
      if (by && !ownEnd) E.to = Object.assign({}, E.to, { edge: 'handover', by: by.tier });
    }
    if (E.from.edge === 'stated') {
      const by = (ends.get(E.from.k) || []).filter((q) => rank(q.tier) < rank(E.from.tier)).sort((a, b) => rank(a.tier) - rank(b.tier))[0];
      const ownStart = E.life && E.from.tier === 'clio' && E.life[0] === kParts(E.from.k)[0];
      if (by && !ownStart) E.from = Object.assign({}, E.from, { edge: 'handover', by: by.tier });
    }
    if (E.from.edge === 'sheet' && E.sheets.length) E.from.sheet = E.sheets[0];
    if (E.to.edge === 'sheet' && E.sheets.length) E.to.sheet = E.sheets[E.sheets.length - 1];
    E.jump = jumpOf(E);
  }
  entries.sort((a, b) => a.from.k - b.from.k || a.to.k - b.to.k);
  /* the spans no piece covers, between the first statement and the last — listed, never closed over */
  const gaps = [];
  let reach = null;
  for (const p of pieces) {
    if (reach != null && p.s > reach) gaps.push({ from: reach, to: p.s });
    reach = reach == null ? p.e : Math.max(reach, p.e);
  }
  return { entries, gaps, records: (raw && raw.records) || [], missing: (raw && raw.missing) || [], order };
}

/* the instant a row's button moves the clock to: a sheet's own year (the map then draws that sheet), else the first
   day the entry holds the point (the record's own day). Clamped to nothing — the clock refuses what it cannot reach. */
function jumpOf(E) {
  if (E.sheets.length && E.from.edge === 'sheet') return { k: ymd(E.sheets[0], 6, 15), sheet: E.sheets[0] };
  return { k: E.from.k };
}

/** composeAdmin(rows) — the first-level rows of js/time-admin1.js `placeRecords` → entries, oldest first */
function composeAdmin(rows) {
  const list = (rows || []).slice().sort((a, b) => a.s - b.s || a.e - b.e);
  const out = [];
  for (const r of list) {
    const k = (r.id && r.id.relation != null) ? 'r:' + r.id.relation : (r.id && r.id.qid) ? 'q:' + r.id.qid : 'n:' + r.file + ':' + r.name;
    const prev = out.find((x) => x.key === k && x.to.k >= r.s);
    if (prev) { if (r.e > prev.to.k) prev.to = { k: r.e, edge: r.eEdge, dates: r.dates && r.dates.end }; continue; }
    out.push({ key: k, name: r.name, label: r.label || r.name, names: r.names, level: r.level, file: r.file, record: r.record, id: r.id,
      from: { k: r.s, edge: r.sEdge, dates: r.dates && r.dates.start }, to: { k: r.e, edge: r.eEdge, dates: r.dates && r.dates.end }, jump: { k: r.s } });
  }
  /* the spans no row covers between the first and the last — listed, never closed over */
  const gaps = [];
  let reach = null;
  for (const r of list) { if (reach != null && r.s > reach) gaps.push({ from: reach, to: r.s }); reach = reach == null ? r.e : Math.max(reach, r.e); }
  out.gaps = gaps;
  return out;
}

/**
 * placeHistory({lng,lat}) → { at, nation:{status, …compose()}, admin:{status, entries, reason?} } — the ONE gatherer, for the
 * card, for Atlas and for the screen reader. A section that could not be read is `unavailable` with its reason.
 */
export async function placeHistory(pt) {
  const lng = +pt.lng, lat = +pt.lat;
  if (!isFinite(lng) || !isFinite(lat)) throw new Error('placeHistory: no point');
  const TB = window.IntMapTimeBorders, TA = window.IntMapTimeAdmin1;
  const [nat, adm] = await Promise.all([
    (TB && typeof TB.placeRecords === 'function') ? TB.placeRecords(lng, lat).then((v) => ({ v }), (e) => ({ e })) : Promise.resolve({ e: { reason: 'history-borders-not-loaded' } }),
    (TA && typeof TA.placeRecords === 'function') ? TA.placeRecords(lng, lat).then((v) => ({ v }), (e) => ({ e })) : Promise.resolve({ e: { reason: 'history-subdivisions-not-loaded' } }),
  ]);
  const out = { at: { lng, lat } };   /* no clock of its own: the card's record carries `asOf` */
  if (nat.e) out.nation = { status: 'unavailable', reason: String(nat.e.reason || 'failed'), entries: [], gaps: [], records: [], missing: [] };
  else { const c = compose(nat.v); out.nation = Object.assign({ status: (c.entries.length ? 'ok' : (c.records.length ? 'none' : 'unavailable')), reason: c.records.length ? null : 'no-record-readable' }, c); }
  if (adm.e) out.admin = { status: 'unavailable', reason: String(adm.e.reason || 'failed'), entries: [] };
  else { const a = composeAdmin(adm.v); out.admin = { status: a.length ? 'ok' : 'none', entries: a, gaps: a.gaps || [] }; }
  return out;
}

/** the entry (national) in force at year Y (astronomical), or null — what Atlas answers «who held this in 1600» with */
export function entriesAt(rec, y) {
  const t0 = ymd(+y, 1, 1), t1 = ymd(+y + 1, 1, 1);
  const pick = (list) => (list || []).filter((E) => E.from.k < t1 && E.to.k > t0);
  return { nation: pick(rec && rec.nation && rec.nation.entries), admin: pick(rec && rec.admin && rec.admin.entries) };
}

/* ══ WHAT ATLAS RECEIVES — the same record, JSON-safe and dated as text (astronomical years; `to` is the first day no
   longer in force) so the model quotes the record's days, never a day it computed ══════════════════════════════════ */
const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = (k) => { const p = kParts(k); return (p[0] < 0 ? '-' + String(-p[0]).padStart(6, '0') : String(p[0]).padStart(4, '0')) + '-' + pad2(p[1]) + '-' + pad2(p[2]); };
const edgeOf = (x) => Object.assign({ date: isoOf(x.k), edge: x.edge }, x.by ? { handedTo: x.by } : {}, x.sheet != null ? { sheet: x.sheet } : {});
export function entryBrief(E) {
  return Object.assign({ name: (E.unnamed || E.withheld) ? null : (E.name || null), names: E.labels.map((x) => ({ from: isoOf(x.k), label: x.label })),
    from: edgeOf(E.from), to: edgeOf(E.to), records: E.ids },
  E.realm ? { realm: true } : {}, E.of ? { partOf: E.of } : {}, E.life ? { cliopatriaLifespan: E.life } : {},
  E.withheld ? { withheld: { name: E.withheld.name, why: E.withheld.lines } } : {}, E.unnamed ? { unnamed: true } : {}, E.notes && E.notes.length ? { notes: E.notes } : {});
}
export function adminBrief(E) {
  const side = (x) => Object.assign({ date: isoOf(x.k), edge: x.edge }, x.dates && x.dates.raw ? { recordWrites: x.dates.raw } : {}, x.dates && x.dates.derived ? { derived: x.dates.derived === true ? (x.dates.basis || true) : x.dates.derived } : {});
  return { name: E.name, label: E.label, level: E.level, record: E.file, id: E.id, kind: E.record && E.record.reconstructed ? 'reconstructed by IntMap' : E.record && E.record.derived ? 'derived by IntMap' : E.record && E.record.gap ? 'surveyed atlas' : 'OpenHistoricalMap', from: side(E.from), to: side(E.to) };
}
export function forAtlas(rec) {
  const N = rec.nation || {}, A = rec.admin || {};
  return { at: rec.at, datesAre: 'astronomical YYYY-MM-DD; "to" is the first day no longer in force',
    nation: { status: N.status, reason: N.reason || null, entries: (N.entries || []).map(entryBrief), gaps: (N.gaps || []).map((g) => ({ from: isoOf(g.from), to: isoOf(g.to) })), records: N.records || [], missing: N.missing || [] },
    admin: { status: A.status, reason: A.reason || null, entries: (A.entries || []).map(adminBrief), gaps: (A.gaps || []).map((g) => ({ from: isoOf(g.from), to: isoOf(g.to) })) } };
}

/* ══ WORDS ═════════════════════════════════════════════════════════════════════════════════════════════════════ */
/* a record is named in its own words: the head of the `src` it states («CShapes 2.0 (Schvitz et al. …) · CC BY-NC-SA 4.0»
   → «CShapes 2.0», «aourednik/historical-basemaps (github.com/…) · GPL-3.0 · …» → «historical-basemaps») */
const shortSrc = (src) => String(src || '').split(' · ')[0].replace(/\s*\(.*$/, '').replace(/^.*\//, '').trim();
function words(lang, records) {
  const L = (en, jp) => IntMapLang.t(lang, en, jp);
  const tag = (() => { try { return IntMapLang.htmlTag(lang) || 'en'; } catch (_) { return 'en'; } })();
  const yearT = (y) => { try { return HS().yearText(y, tag, lang === 'jp' ? '年' : null); } catch (_) { return String(y); } };
  const dayT = (k) => { const p = kParts(k); try { return HS().dateText(p[0], p[1], p[2], tag); } catch (_) { return p.join('-'); } };
  const recordName = (tier, rec) => {
    const r = tier ? (records || []).find((x) => x.tier === tier) : null;
    if (r && r.src) return shortSrc(r.src);
    if (tier) return tier;
    if (rec && rec.reconstructed) return L('IntMap reconstruction', 'IntMap 自作復元');
    if (rec && rec.derived) return L('IntMap (derived)', 'IntMap（導出）');
    return L('surveyed atlas', '調査地図');
  };
  return { L, yearT, dayT, recordName };
}
/* a day the record states, at the precision it is stated: Cliopatria and the sheets state years; a day-exact record's
   1 January is shown as its year (the records write a bare year as its first day) */
function stated(k, tier, W) {
  const p = kParts(k);
  if (tier === 'clio' || tier === 'sheet' || (p[1] === 1 && p[2] === 1)) return W.yearT(p[0]);
  return W.dayT(k);
}
/* the LAST day (or year) an exclusive end still covers */
function lastOf(k, tier, W) {
  const p = kParts(k);
  if (tier === 'clio' || tier === 'sheet' || (p[1] === 1 && p[2] === 1)) return W.yearT(p[0] - 1);
  return W.dayT(kShift(k, -1));
}
function edgeText(side, x, W) {
  const L = W.L, recName = (t) => W.recordName(t);
  const at = side === 'from' ? stated(x.k, x.tier, W) : lastOf(x.k, x.tier, W);
  switch (x.edge) {
    case 'stated': return at;
    case 'rename': return at;
    case 'review': return at + L(' (reviewed span)', '（査読済みの年代）');
    case 'reach': {
      const rn = recName(x.tier);
      return side === 'from' ? L(at + ' (where ' + rn + ' begins)', at + '（' + rn + ' の記録の始まり）') : L(at + ' (where ' + rn + ' ends)', at + '（' + rn + ' の記録の終わり）');
    }
    case 'handover': {
      const rn = recName(x.by);
      return side === 'from' ? L(at + ' (before this, ' + rn + ')', at + '（それ以前は ' + rn + ' の記録）') : L(at + ' (after this, ' + rn + ')', at + '（以降は ' + rn + ' の記録）');
    }
    case 'sheet': return x.sheet != null ? L(recName('sheet') + ' map of ' + W.yearT(x.sheet), recName('sheet') + ' の ' + W.yearT(x.sheet) + ' の図') : at;
    default: return at;
  }
}
function adminEdgeText(side, x, W) {
  const L = W.L, p = kParts(x.k);
  const at = side === 'from' ? (p[1] === 1 && p[2] === 1 ? W.yearT(p[0]) : W.dayT(x.k)) : (p[1] === 1 && p[2] === 1 ? W.yearT(p[0] - 1) : W.dayT(kShift(x.k, -1)));
  const raw = x.dates && x.dates.raw;
  switch (x.edge) {
    case 'open': return L('still in force in the record', '記録上は現在も');
    case 'stated': return (x.dates && x.dates.corrected && x.dates.corrected.at) ? L(at + ' (reviewed date; the source writes ' + raw + ')', at + '（査読済みの日付。出典の記載は ' + raw + '）') : at;
    case 'derived': return L(at + ' (derived, not stated)', at + '（導出。記録は述べていない）');
    case 'unstated': return L('no date stated (drawn from ' + at + ')', '日付の記載なし（' + at + ' から描画）');
    default: return L(at + ' (this row carries no source date)', at + '（この行に出典の日付はない）');
  }
}
/* ══ THE MARKUP — every piece built in IntMapSafe.markup templates (js/safe-html.js), so each value is escaped for where
   it lands and a link's start is a checked URL; nothing here vouches for a string ═══════════════════════════════ */
const html = (s, ...v) => globalThis.IntMapSafe.markup(s, ...v);   /* js/safe-html.js, imported above, publishes it on globalThis */
/* items with « · » between them, as one piece of markup */
const joined = (items, sep) => items.map((x, i) => (i ? html`${sep}${x}` : html`${x}`));
/* the record IDs of an entry, as text and (where the record has a public page for the ID) a link */
function idsMarkup(ids, W) {
  const L = W.L, out = [];
  for (const x of ids || []) {
    const id = x.id || {}, rn = W.recordName(x.tier);
    if (id.gw != null) out.push(html`${rn} gwcode ${id.gw}`);
    else if (id.sheet != null) {
      /* the sheets of one entry are one record: «historical-basemaps: 10000 BC, 8000 BC, …» */
      const prev = out.length && out[out.length - 1].sheet ? out[out.length - 1] : null;
      if (prev) prev.years.push(W.yearT(id.sheet)); else out.push({ sheet: true, rn, years: [W.yearT(id.sheet)] });
    }
    else if (id.qid) out.push(html`${rn} · <a href="${'https://www.wikidata.org/wiki/' + encodeURIComponent(id.qid)}" target="_blank" rel="noopener">${id.qid}</a>`);
    else if (id.wiki) out.push(html`${rn} · ${L('article ', '記事 ') + id.wiki}`);
    else out.push(html`${rn}`);
  }
  return joined(out.map((x) => (x.sheet ? html`${x.rn}: ${x.years.join(', ')}` : x)), ' · ');
}

/** the record as markup — the card's section and Atlas's bubble (`opts.inert`: no buttons, nothing listens there).
    A row is the name and the span (a button on the card — it sets the clock) and, beside it, the record and its IDs
    (links where the record has a public page for the ID — never inside the button). */
export function historyMarkup(rec, lang, opts) {
  opts = opts || {};
  const W = words(lang, rec && rec.nation && rec.nation.records), L = W.L;
  const row = (hn, head, tail, cls, dim) => html`<div class="${'ph-row ' + (cls || '')}"><span class="${dim ? 'ph-dot ph-dim' : 'ph-dot'}"></span><span class="ph-main">${opts.inert || !hn ? html`<span class="ph-head">${head}</span>` : html`<button type="button" class="ph-go" data-hn="${hn}">${head}</button>`}${tail}</span></div>`;
  const gapRow = (g, what) => row(null, html`<span class="ph-n">${what}</span><span class="ph-when">${stated(g.from, 'ohm', W) + ' – ' + lastOf(g.to, 'ohm', W)}</span>`, '', 'ph-gap', true);
  const N = rec && rec.nation;
  if (!N) return html`<div class="hn-why" data-pending>${L('Reading the historical records…', '歴史の記録を読み込み中…')}</div>`;
  const parts = [];
  if (N.status === 'unavailable') parts.push(html`<div class="hn-why">${L('The historical border records could not be read (' + N.reason + ').', '歴史国境の記録を読み込めませんでした（' + N.reason + '）。')}</div>`);
  else if (N.status === 'none') parts.push(html`<div class="hn-why">${L('No historical record draws a polity over this point.', 'この地点に政体を描く歴史の記録はありません。')}</div>`);
  else {
    const noPolity = L('No record draws a polity here', 'この期間、ここに政体を描く記録はない');
    const rows = N.entries.map((E, i) => ({ k: E.from.k, m: entryMarkup(E, i, W, row) })).concat((N.gaps || []).map((g) => ({ k: g.from, m: gapRow(g, noPolity) })));
    rows.sort((x, y) => x.k - y.k);
    parts.push(html`<div class="ph-list">${rows.map((r) => r.m)}</div>`);
  }
  if (N.missing && N.missing.length) parts.push(html`<div class="hn-why">${L('Not read: ', '読めなかった記録: ') + N.missing.map((m) => m.file + ' (' + m.reason + ')').join(', ')}</div>`);
  const A = rec.admin;
  if (A && A.status === 'ok') {
    const noUnit = L('No record draws a first-level division here', 'この期間、ここに第1級区分を描く記録はない');
    const rows = A.entries.map((E, i) => ({ k: E.from.k, m: row('pha:' + i, html`<span class="ph-n">${E.label || E.name}</span><span class="ph-when">${adminEdgeText('from', E.from, W) + ' – ' + adminEdgeText('to', E.to, W)}</span>`,
      html`<span class="ph-src">${W.recordName(E.record && E.record.gap ? null : 'ohm', E.record)}${E.id && E.id.relation != null ? html` · <a href="${'https://www.openhistoricalmap.org/relation/' + encodeURIComponent(E.id.relation)}" target="_blank" rel="noopener">${L('relation ', 'リレーション ') + E.id.relation}</a>` : ''}${E.id && E.id.row != null ? ' · ' + E.file + ' #' + E.id.row : ''}${E.id && E.id.qid ? html` · <a href="${'https://www.wikidata.org/wiki/' + encodeURIComponent(E.id.qid)}" target="_blank" rel="noopener">${E.id.qid}</a>` : ''}</span>`, '', false) }))
      .concat((A.gaps || []).map((g) => ({ k: g.from, m: gapRow(g, noUnit) })));
    rows.sort((x, y) => x.k - y.k);
    parts.push(html`<div class="ph-sub">${L('First-level divisions here', 'この地点の第1級区分')}</div><div class="ph-list">${rows.map((r) => r.m)}</div>`);
  } else if (A && A.status === 'unavailable') parts.push(html`<div class="hn-why">${L('The subdivision record could not be read (' + A.reason + ').', '地方区分の記録を読み込めませんでした（' + A.reason + '）。')}</div>`);
  /* who said it — each record in its own words */
  const srcs = (N.records || []).map((r) => r.src).filter(Boolean);
  if (srcs.length) parts.push(html`<div class="acp-src">${L('Records: ', '記録: ') + srcs.join(' · ')}</div>`);
  return html`${parts}`;
}
/** the same as an HTML string (Atlas's bubble is a string; a sink calls String() itself) */
export function historyHtml(rec, lang, opts) { return String(historyMarkup(rec, lang, opts)); }
/* how many of an entry's later names the card lists before counting the rest (Atlas receives all of them) */
const RENAMES_SHOWN = 3;
function entryMarkup(E, i, W, row) {
  const L = W.L;
  const name = E.unnamed ? L('A shape the record draws without a name', '記録が名前を与えずに描いている形')
    : E.withheld ? L('Name withheld: «' + E.withheld.name + '»', '名前を描いていない: 「' + E.withheld.name + '」')
    : (E.labels.length ? E.labels[0].label : E.name);
  const later = E.labels.slice(1), renames = later.slice(0, RENAMES_SHOWN).map((x) => L('from ' + stated(x.k, E.from.tier, W) + ': ' + x.label, stated(x.k, E.from.tier, W) + ' から「' + x.label + '」'));
  if (later.length > RENAMES_SHOWN) renames.push(L('and ' + (later.length - RENAMES_SHOWN) + ' more names in the record', 'ほか記録上の名前 ' + (later.length - RENAMES_SHOWN) + ' 件'));
  /* an entry the sheets alone answer is dated by its sheets, and by the years the clock shows them — not as two «edges» */
  const shown = W.yearT(kParts(E.from.k)[0]) + '–' + W.yearT(kParts(E.to.k)[0] - 1);
  /* (an entry only the sheets answer already names them in its span; its ID line would repeat it) */
  const sheetOnly = E.from.edge === 'sheet' && E.to.edge === 'sheet' && E.sheets.length > 0 && E.ids.every((x) => x.id && x.id.sheet != null);
  const when = (E.from.edge === 'sheet' && E.to.edge === 'sheet' && E.sheets.length)
    ? (E.sheets.length === 1 ? L(W.recordName('sheet') + ' map of ' + W.yearT(E.sheets[0]) + ' (the clock shows it ' + shown + ')', W.recordName('sheet') + ' の ' + W.yearT(E.sheets[0]) + ' の図（時計 ' + shown + ' で表示）')
      : L(W.recordName('sheet') + ' maps of ' + W.yearT(E.sheets[0]) + '–' + W.yearT(E.sheets[E.sheets.length - 1]) + ' (the clock shows them ' + shown + ')', W.recordName('sheet') + ' の ' + W.yearT(E.sheets[0]) + '〜' + W.yearT(E.sheets[E.sheets.length - 1]) + ' の図（時計 ' + shown + ' で表示）'))
    : edgeText('from', E.from, W) + ' – ' + edgeText('to', E.to, W);
  const extra = [];
  if (E.realm) extra.push(L('the realm, drawn over its members', '構成国の上に描く上位の政体'));
  if (E.of) extra.push(L('part of ' + E.of, E.of + ' の一部'));
  if (E.life && E.tiers.indexOf('clio') >= 0) extra.push(L('Cliopatria dates the polity ' + W.yearT(E.life[0]) + '–' + W.yearT(E.life[1]), 'Cliopatria による政体の年代 ' + W.yearT(E.life[0]) + '–' + W.yearT(E.life[1])));
  const notes = (E.withheld ? E.withheld.lines : []).concat(E.notes || []);
  const quiet = E.unnamed || !!E.withheld;
  return row('ph:' + i, html`<span class="ph-n">${name}</span><span class="ph-when">${when}</span>`,
    html`${renames.length ? html`<span class="ph-src">${renames.join(' · ')}</span>` : ''}${extra.length ? html`<span class="ph-src">${extra.join(' · ')}</span>` : ''}${notes.length ? html`<span class="ph-src">${notes.join(' ')}</span>` : ''}${sheetOnly ? '' : html`<span class="ph-src">${idsMarkup(E.ids, W)}</span>`}`,
    quiet ? 'ph-quiet' : '', quiet);
}

/** the same record as plain sentences — js/map-reader.js speaks the place card; Atlas reads the JSON */
export function historySpeech(rec, lang) {
  const N = rec && rec.nation, W = words(lang, N && N.records), L = W.L;
  if (!N || N.status !== 'ok') return '';
  return N.entries.filter((E) => !E.unnamed && !E.withheld).map((E) => (E.labels.length ? E.labels[0].label : E.name) + ', ' + edgeText('from', E.from, W) + L(' to ', ' から ') + edgeText('to', E.to, W) + L('.', '。')).join(' ');
}

/* ══ THE CLOCK — a row's button ═════════════════════════════════════════════════════════════════════════════════ */
/** move the clock to an entry (`{jump}`); → true when the clock accepted it */
export function jumpTo(E) {
  if (!E || !E.jump) return false;
  const p = kParts(E.jump.k);
  try {
    if (E.jump.sheet != null) { IntMapTime.setYear(E.jump.sheet, { source: 'place-history' }); return true; }
    const t = HS().utcAt(p[0], p[1] - 1, p[2], 12);
    IntMapTime.set(t, { source: 'place-history' });
    return true;
  } catch (_) { return false; }
}

/* the timeline's rules — injected with the place card's (js/place-dossier.js `placeCardStyle`) */
export const PLACE_HISTORY_CSS = [
  '.ph-list{position:relative;margin:2px 0 4px;}',
  '.ph-list::before{content:"";position:absolute;left:5px;top:10px;bottom:10px;width:2px;border-radius:1px;background:rgba(128,128,128,0.22);}',
  '.ph-row{position:relative;display:flex;gap:10px;align-items:flex-start;padding:5px 0;color:var(--text-main);font-size:12.5px;}',
  '.ph-go,.ph-head{display:flex;flex-direction:column;gap:1px;width:100%;text-align:left;background:none;border:none;border-radius:8px;padding:2px 6px;margin:-2px -6px;color:inherit;font:inherit;}',
  '.ph-go{cursor:pointer;} .ph-go:hover{background:var(--input-bg);} .ph-go:active{transform:scale(0.99);}',
  '.ph-row.ph-gap,.ph-row.ph-quiet{color:var(--text-muted);}',
  '.ph-dot{flex:0 0 auto;width:12px;height:12px;margin-top:3px;border-radius:50%;background:var(--primary-color);box-shadow:0 0 0 3px var(--panel-bg,rgba(255,255,255,0.9));position:relative;}',
  '.ph-dot.ph-dim,.ph-gap .ph-dot{background:rgba(128,128,128,0.45);}',
  '.ph-main{display:flex;flex-direction:column;min-width:0;gap:1px;}',
  '.ph-n{font-weight:650;overflow-wrap:anywhere;}',
  '.ph-when{font-size:11.5px;color:var(--text-main);font-variant-numeric:tabular-nums;}',
  '.ph-src{font-size:10.5px;color:var(--text-muted);overflow-wrap:anywhere;}',
  '.ph-src a{color:var(--primary-color);text-decoration:none;}',
  '.ph-sub{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin:10px 0 3px;}',
].join('\n');
