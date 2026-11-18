/* ============================================================================
 *  IntMap · returning to a saved news event says what changed since  (exploration-flows)
 * ----------------------------------------------------------------------------
 *  Measured on this tree before the change: the ★ copy of an event (js/news-events.js `snapshotOf`) was read only
 *  once the member articles had expired and was never compared with the event as it is now — a reader returning to
 *  a saved event could not tell whether anything had been reported since. The News list was asked worldwide while
 *  nothing on screen said it did not follow the map.
 *
 *  These checks EVALUATE: the one comparison (`sinceSaved`) on every case it decides — more reports, outlets new to
 *  the event, new figures by the claims module's own `quantityKey`, a rewritten summary, nothing, a copy written
 *  before the new fields existed, expired members; the view count (`countInView`) across the antimeridian; and the
 *  real factory run against a fake store and reading surface — the copy's new fields, the detail's section, the
 *  ★ Saved badge, «Mark as read» through the same write path, and the line under All / ★ Saved.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { importModule } from './helpers/import-module.mjs';
import { makeNewsClaims } from '../js/news-claims.js';
import { sinceSaved, countInView } from '../js/news-events.js';
import '../js/safe-html.js';

const KEY = makeNewsClaims().quantityKey;
const M = (at, family) => ({ publishedAt: at, family, sourceId: family });

/* ══ ① the comparison ═════════════════════════════════════════════════════════════════════════════ */
test('① more reports: members published after the copy\'s latest article; outlets new to the event from the recorded groups', () => {
  const snap = { savedAt: '2026-11-15T00:00:00Z', at: '2026-11-15T00:00:00Z', lastAt: '2026-11-14T20:00:00Z', lastArticleAt: '2026-11-14T20:00:00Z', families: ['a', 'b'], figures: [], summaryFp: null };
  const live = { lastAt: '2026-11-16T09:00:00Z', members: [M('2026-11-14T10:00:00Z', 'a'), M('2026-11-14T20:00:00Z', 'b'), M('2026-11-15T08:00:00Z', 'b'), M('2026-11-16T09:00:00Z', 'c')], figures: [], summaryFp: null };
  const c = sinceSaved(snap, live, KEY);
  assert.equal(c.newReports, 2, 'the two members after 20:00 on the 14th — not the article_count difference');
  assert.equal(c.newOutlets, 1, 'only «c» had not reported it');
  assert.equal(c.newerAt, '2026-11-16T09:00:00Z');
  assert.equal(c.any, true);
  assert.equal(c.marked, false);
  assert.equal(c.since, '2026-11-15T00:00:00Z');
});

test('① new figures are the live figures whose quantityKey the copy lacks — £10bn and $10bn are two figures', () => {
  const claims = makeNewsClaims();
  const before = claims.quantities('The storm killed 3 people and £10bn was pledged');
  const now = claims.quantities('The storm killed 3 people; later reports said 7 killed, and $10bn was pledged');
  assert.ok(before.length >= 2 && now.length >= 3, 'the claims module extracted the figures this case is about');
  const snap = { savedAt: '2026-11-15T00:00:00Z', lastAt: '2026-11-15T00:00:00Z', figures: before.map((q) => ({ kind: q.kind, unit: q.unit, value: q.value })) };
  const c = sinceSaved(snap, { lastAt: '2026-11-15T00:00:00Z', members: [M('2026-11-14T00:00:00Z', 'a')], figures: now }, KEY);
  const keys = c.newFigures.map(KEY);
  for (const q of now) assert.equal(keys.includes(KEY(q)), !before.some((b) => KEY(b) === KEY(q)), 'figure ' + KEY(q));
  assert.ok(c.newFigures.length >= 2, 'the new death count and the dollar amount');
  assert.equal(c.newReports, 0);
  assert.equal(c.any, true);
});

test('① the summary is «rewritten» only when both sides carry its fingerprint and it (or the version) differs', () => {
  const base = { savedAt: '2026-11-15T00:00:00Z', lastAt: '2026-11-15T00:00:00Z' };
  const live = { lastAt: '2026-11-15T00:00:00Z', members: [M('2026-11-14T00:00:00Z', 'a')] };
  assert.equal(sinceSaved({ ...base, summaryFp: 'x', summaryVersion: 1 }, { ...live, summaryFp: 'y', summaryVersion: 1 }, KEY).rewritten, true);
  assert.equal(sinceSaved({ ...base, summaryFp: 'x', summaryVersion: 1 }, { ...live, summaryFp: 'x', summaryVersion: 2 }, KEY).rewritten, true);
  assert.equal(sinceSaved({ ...base, summaryFp: 'x', summaryVersion: 1 }, { ...live, summaryFp: 'x', summaryVersion: 1 }, KEY).rewritten, false);
  assert.equal(sinceSaved({ ...base, summaryFp: 'x' }, { ...live, summaryFp: null }, KEY).rewritten, false, 'a summary that is gone was not rewritten');
  assert.equal(sinceSaved({ ...base, summaryFp: null }, { ...live, summaryFp: 'y' }, KEY).rewritten, false, 'nothing to compare with');
});

test('① nothing differs → compared, not any; a copy marked as read says so', () => {
  const snap = { savedAt: '2026-11-10T00:00:00Z', at: '2026-11-15T00:00:00Z', lastAt: '2026-11-14T00:00:00Z', lastArticleAt: '2026-11-14T00:00:00Z', families: ['a'], figures: [], summaryFp: 'x', summaryVersion: 1 };
  const c = sinceSaved(snap, { lastAt: '2026-11-14T00:00:00Z', members: [M('2026-11-14T00:00:00Z', 'a')], figures: [], summaryFp: 'x', summaryVersion: 1 }, KEY);
  assert.equal(c.compared, true);
  assert.equal(c.any, false);
  assert.equal(c.newReports, 0);
  assert.equal(c.marked, true, '`at` after `savedAt` is a baseline taken by «Mark as read»');
  assert.equal(c.since, '2026-11-15T00:00:00Z');
});

test('① a copy written before the new fields: compares what both have, says nothing for the rest', () => {
  const v1 = { v: 1, savedAt: '2026-11-15T00:00:00Z', lastAt: '2026-11-14T00:00:00Z', sources: [{ outlet: 'A' }] };
  const c = sinceSaved(v1, { lastAt: '2026-11-16T00:00:00Z', members: [M('2026-11-16T00:00:00Z', 'z')], figures: [{ kind: 'dead', unit: '', value: 9, text: '9 killed' }], summaryFp: 'y', summaryVersion: 1 }, KEY);
  assert.equal(c.newReports, 1, 'lastAt was in every copy');
  assert.equal(c.newOutlets, null, 'no recorded groups: no claim about outlets');
  assert.deepEqual(c.newFigures, [], 'no recorded figures: no claim about figures');
  assert.equal(c.rewritten, false, 'no recorded fingerprint: no claim about the summary');
  assert.equal(c.marked, false);
});

test('① expired members: a later report is recorded but not countable — newerAt, no count', () => {
  const snap = { savedAt: '2026-11-10T00:00:00Z', lastAt: '2026-11-09T00:00:00Z', families: ['a'], figures: [] };
  const c = sinceSaved(snap, { lastAt: '2026-11-12T00:00:00Z', members: null, figures: null }, KEY);
  assert.equal(c.newReports, null);
  assert.equal(c.newOutlets, null);
  assert.equal(c.newerAt, '2026-11-12T00:00:00Z');
  assert.deepEqual(c.newFigures, [], 'the copy is not compared with itself');
  assert.equal(c.any, true);
  assert.equal(sinceSaved(null, {}, KEY), null);
  assert.equal(sinceSaved({ savedAt: 'x' }, { lastAt: '' }, KEY).compared, false, 'nothing comparable → nothing said');
});

/* ══ ② how many of the listed events are in the view ════════════════════════════════════════════ */
test('② countInView: inside, outside, across the antimeridian, a world-wide span, no bounds', () => {
  const pts = [[139.7, 35.7], [-74, 40.7], [179.5, -17], [-179.5, -18], null, [0, 89]];
  assert.equal(countInView(pts, { w: 120, s: 20, e: 150, n: 50 }), 1, 'Tokyo');
  assert.equal(countInView(pts, { w: 170, s: -30, e: -170, n: 0 }), 2, 'Fiji on both sides of 180°');
  assert.equal(countInView(pts, { w: 170, s: -30, e: 190, n: 0 }), 2, 'MapLibre writes the same box with an east past 180');
  assert.equal(countInView(pts, { w: -540, s: -85, e: 540, n: 85 }), 4, 'world copies: every longitude, latitude still counts');
  assert.equal(countInView(pts, null), null);
  assert.equal(countInView(pts, { w: NaN, s: 0, e: 1, n: 1 }), null);
});

/* ══ ③ the real factory ═════════════════════════════════════════════════════════════════════════ */
function fakeDb(tables, writes) {
  return {
    from(name) {
      const ops = [];
      const b = {
        select: () => b, order: () => b, limit: () => b, delete: () => b, or: () => b, lte: () => b, gte: () => b, gt: () => b,
        eq: (k, v) => { ops.push(['eq', k, v]); return b; }, is: (k, v) => { ops.push(['is', k, v]); return b; }, in: (k, v) => { ops.push(['in', k, v]); return b; },
        upsert: (row) => { writes.push([name, row]); return Promise.resolve({ error: null }); },
        then: (res, rej) => {
          let rows = (tables[name] || []).slice();
          for (const [op, k, v] of ops) {
            if (op === 'eq') rows = rows.filter((r) => r[k] === v);
            if (op === 'in') rows = rows.filter((r) => v.includes(r[k]));
            if (op === 'is') rows = rows.filter((r) => (r[k] ?? null) === v);
          }
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
}
function fakeSurface() {
  const els = new Map();
  const mk = (id) => ({ id, hidden: false, disabled: false, onclick: null, textContent: '', style: {} });
  const pane = { style: { display: 'flex' }, scrollTop: 0, _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); for (const k of [...els.keys()]) if (k !== 'news-scope-note') els.delete(k); },
    querySelector: () => null };
  const note = mk('news-scope-note'); note.hidden = true;
  els.set('news-scope-note', note);
  const document = {
    getElementById: (id) => {
      if (id === 'news-reader-pane') return pane;
      if (id === 'news-scope-note') return note;
      if (!new RegExp('id="' + id + '"').test(pane._html)) return null;
      if (!els.has(id)) els.set(id, mk(id));
      return els.get(id);
    },
    querySelector: () => null, createElement: () => ({ style: {}, appendChild() { } }), head: { appendChild() { } },
  };
  return { pane, note, document };
}
const ART = (id, at, src, desc) => ({ id, title: 'Floods in Riverton', description: desc, canonical_url: 'https://example.invalid/' + id, source_id: src, published_at: at, subject_name_en: 'Riverton', subject_type: 'city' });
const ROW = (arts, extra) => Object.assign({
  id: 1, public_id: 'ev-flood', representative_title: 'Floods in Riverton', representative_article_id: null, primary_category: 'disasters',
  secondary_categories: [], category_confidence: 1, category_evidence: null, rep_lng: 10, rep_lat: 50, rep_place_name_en: 'Riverton',
  location_confidence: 0.9, first_published_at: arts[0].published_at, last_article_at: arts[arts.length - 1].published_at,
  materially_updated_at: arts[arts.length - 1].published_at, article_count: arts.length, independent_source_count: new Set(arts.map((a) => a.source_id)).size,
  cluster_confidence: 1, manual_lock: false, status: 'active', merged_into: null, summary: null, summary_evidence: null, summary_version: null,
  news_event_articles: arts.map((a) => ({ relation: 'same_event', news_articles: a })),
}, extra || {});
const SOURCES = [{ id: 7, name: 'Example Times', source_family: 'fam-example' }, { id: 8, name: 'Other Post', source_family: 'fam-other' }];
const DAY1 = [ART(1, '2026-11-14T06:00:00Z', 7, 'The river burst its banks on Friday morning, killing 3 people and forcing evacuations, officials said.')];
const DAY2 = DAY1.concat([
  ART(2, '2026-11-15T09:00:00Z', 7, 'Floodwater rose overnight, killing 3 people and injuring 12 people in the lower town, officials said.'),
  ART(3, '2026-11-15T11:00:00Z', 8, 'Rescuers searched for survivors after the floods, killing 3 people, swept through the valley on Friday.'),
]);

async function factory(store, tables, opts) {
  const S = fakeSurface();
  const writes = [];
  const toasts = [];
  const mod = await importModule('js/news-events.js', {
    globals: { window: globalThis, document: S.document, MutationObserver: undefined,
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } },
    mocks: { 'js/geo-engine.js': { IntMapGeoEngine: { camera: { flyTo() { }, getBounds: () => (opts && opts.bounds) || null }, events: { on() { } }, layers: { hasSource: () => false } } } },
  });
  const HOST = {
    lang: 'en', mode: (opts && opts.mode) || 'news', user: (opts && opts.user) || null, DB: fakeDb(tables, writes), globalData: [],
    enterReaderPane: () => S.pane,
    readerBar: (o) => '<div class="nrp-bar"><button id="' + o.backId + '">' + o.back + '</button>' + (o.extra || '') + '</div>',
    closeReaderPane: () => { S.pane.innerHTML = ''; }, imToast: (t) => toasts.push(t), setMode() { },
    applyPinMode: (a) => { a.loc = a.subjectLoc; a.name = a.subjectName; a.mapped = !!a.subjectLoc; },
  };
  const API = mod.newsEvents(HOST);
  return { S, API, HOST, writes, toasts };
}

test('③ the copy records the row\'s counts, latest article, summary version + fingerprint, outlet groups and figures', async () => {
  const store = {};
  const { API } = await factory(store, { news_sources: SOURCES, news_events: [ROW(DAY1, { summary_version: 1, summary_evidence: { fp: 'fp-day1', sentences: [] } })] });
  assert.equal(await API.load(), true);
  const item = API.loaded()[0];
  const snap = API.snapshotOf(item);
  assert.equal(snap.v, 2);
  assert.equal(snap.articles, 1);
  assert.equal(snap.outlets, 1);
  assert.equal(snap.lastArticleAt, '2026-11-14T06:00:00Z');
  assert.equal(snap.summaryVersion, 1);
  assert.equal(snap.summaryFp, 'fp-day1');
  assert.deepEqual(snap.families, ['fam-example']);
  assert.ok(snap.figures.length >= 1, 'the figures the detail showed');
  for (const q of snap.figures) assert.deepEqual(Object.keys(q).sort(), ['kind', 'unit', 'value'], 'kind, unit and value — the parts of quantityKey');
  assert.deepEqual(snap.figures.map(KEY), item._event.brief.figures.map(KEY), 'the same figures as the detail\'s «Key figures»');
  assert.equal(snap.savedAt, snap.at);
  assert.ok(JSON.stringify(snap).length < 32768, 'inside the row\'s 32 KiB check');
});

test('③ reopening a saved event: the detail says what was reported since, the ★ Saved card carries the badge, «Mark as read» moves the baseline', async () => {
  const store = {};
  const d1 = await factory(store, { news_sources: SOURCES, news_events: [ROW(DAY1, { summary_version: 1, summary_evidence: { fp: 'fp-day1', sentences: [] } })] });
  await d1.API.load();
  assert.equal(await d1.API.toggleStar(d1.API.loaded()[0]), true);
  /* the same device the next day: the event gathered two reports, one from a group that had not reported it, a new figure, a rewritten summary */
  const d2 = await factory(store, { news_sources: SOURCES, news_events: [ROW(DAY2, { summary_version: 1, summary_evidence: { fp: 'fp-day2', sentences: [] } })] }, { mode: 'saved' });
  await d2.API.load();
  const item = d2.API.loaded()[0];
  const c = d2.API.changedSince(item);
  assert.equal(c.newReports, 2);
  assert.equal(c.newOutlets, 1);
  assert.ok(c.newFigures.some((q) => q.kind === 'injured' && q.value === 12), '12 injured is new; 3 killed is not');
  assert.ok(!c.newFigures.some((q) => q.kind === 'dead' && q.value === 3));
  assert.equal(c.rewritten, true);

  d2.API.openDetail(item, { fly: false });
  const html = d2.S.pane.innerHTML;
  assert.match(html, /id="ev-since"/);
  assert.match(html, /Since you saved this/);
  assert.match(html, /2 new reports/);
  assert.match(html, /from 1 outlet that had not reported it/);
  assert.match(html, /New figures/);
  assert.match(html, /The AI summary was rewritten/);
  assert.doesNotMatch(html, /correct/i, 'no correction is claimed — nothing writes one');

  /* the ★ Saved list card */
  const head = { html: '', insertAdjacentHTML(_, h) { this.html += h; } };
  const foot = { insertBefore() { }, querySelector: () => null };
  const card = { classList: { add() { } }, querySelector: (sel) => (sel === '.news-head' ? head : sel === '.news-foot' ? foot : null) };
  d2.API.decorate(card, item);
  assert.match(head.html, /class="ev-badge since"[^>]*>Updated · 2 new</, 'the badge carries the count from the same comparison');

  /* «Mark as read» — the same write path (logged out: localStorage) */
  const btn = d2.S.document.getElementById('ev-since-read');
  assert.ok(btn, 'the section offers «Mark as read»');
  const starAt = JSON.parse(store.intmap_saved_event_snaps)['ev-flood'].savedAt;
  await btn.onclick();
  const saved = JSON.parse(store.intmap_saved_event_snaps)['ev-flood'];
  assert.equal(saved.savedAt, starAt, 'the day of the ★ is kept');
  assert.ok(saved.at && saved.at >= starAt, 'the baseline moved to the moment of «Mark as read»');
  assert.equal(saved.lastArticleAt, '2026-11-15T11:00:00Z', 'the baseline is now the event as it is');
  assert.equal(saved.summaryFp, 'fp-day2');
  const after = d2.API.changedSince(item);
  assert.equal(after.any, false);
  d2.API.openDetail(item, { fly: false });
  assert.match(d2.S.pane.innerHTML, /No new reports since you (saved this|marked this as read)/);
  const head2 = { html: '', insertAdjacentHTML(_, h) { this.html += h; } };
  d2.API.decorate({ classList: { add() { } }, querySelector: (sel) => (sel === '.news-head' ? head2 : sel === '.news-foot' ? foot : null) }, item);
  assert.doesNotMatch(head2.html, /ev-badge since/, 'no badge once read');
});

test('③ logged in, «Mark as read» writes the saved row through the same upsert as the ★', async () => {
  const store = {};
  const user = { id: 'u1' };
  const d1 = await factory(store, { news_sources: SOURCES, news_events: [ROW(DAY1)] }, { user });
  await d1.API.load();
  await d1.API.toggleStar(d1.API.loaded()[0]);
  assert.equal(d1.writes.length, 1);
  const d2 = await factory(store, { news_sources: SOURCES, news_events: [ROW(DAY2)], saved_news_events: [] }, { user });
  await d2.API.load();
  const item = d2.API.loaded()[0];
  assert.equal(await d2.API.markRead(item), true);
  const [table, row] = d2.writes.at(-1);
  assert.equal(table, 'saved_news_events');
  assert.equal(row.event_id, 1);
  assert.equal(row.snapshot.lastArticleAt, '2026-11-15T11:00:00Z');
});

test('③ a copy written before the new fields still answers what it can', async () => {
  const store = { intmap_saved_events: JSON.stringify(['ev-flood']), intmap_saved_event_snaps: JSON.stringify({ 'ev-flood': { v: 1, savedAt: '2026-11-14T07:00:00Z', lastAt: '2026-11-14T06:00:00Z', title: 'Floods in Riverton', sources: [] } }) };
  const d = await factory(store, { news_sources: SOURCES, news_events: [ROW(DAY2, { summary_evidence: { fp: 'fp-day2', sentences: [] } })] });
  await d.API.load();
  const item = d.API.loaded().find((x) => x._event.publicId === 'ev-flood');
  d.API.openDetail(item, { fly: false });
  const html = d.S.pane.innerHTML;
  assert.match(html, /2 new reports/);
  assert.doesNotMatch(html, /had not reported it/, 'outlets are not claimed from a copy that did not record them');
  assert.doesNotMatch(html, /New figures|rewritten/);
});

test('③ the line under All / ★ Saved says the list is worldwide and counts the listed events in view; hidden in ★ Saved', async () => {
  const store = {};
  const d = await factory(store, { news_sources: SOURCES, news_events: [ROW(DAY1)] }, { bounds: { getWest: () => 0, getSouth: () => 40, getEast: () => 20, getNorth: () => 60 } });
  await d.API.load();
  d.HOST.globalData = d.API.loaded();
  d.API.scopeNote();
  assert.equal(d.S.note.hidden, false);
  assert.match(d.S.note.textContent, /^Worldwide · not limited to the map view · 1 of 1 in view$/);
  d.HOST.mode = 'saved';
  d.API.scopeNote();
  assert.equal(d.S.note.hidden, true);
  d.HOST.mode = 'news';
  d.HOST.lang = 'jp';
  d.API.scopeNote();
  assert.match(d.S.note.textContent, /^世界全体・地図の表示範囲とは連動しない/);
});
