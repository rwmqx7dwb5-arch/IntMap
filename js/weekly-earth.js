/* ============================================================================
 *  IntMap · THIS WEEK ON EARTH — one ISO week of the planet's large natural events   (js/weekly-earth.js)
 * ----------------------------------------------------------------------------
 *  (weekly-earth) data/weekly-earth.json is an ARCHIVE of ISO weeks (scripts/build-weekly-earth.mjs adds each week
 *  once it has ended, from two public upstreams, and keeps every week it already holds): the earthquakes of magnitude
 *  5.5 and above the USGS catalogue lists, and the natural events NASA's EONET tracks — severe storms, volcanoes,
 *  floods, sea and lake ice, and the wildfires whose stated burned area reaches the archive's floor. This file is its
 *  ONE reader, for every door:
 *    · the generated pages, their Atom feeds and the post drafts (scripts/weekly-earth-pages.mjs) — the pure half
 *      below is imported by Node, so a page and the app cannot describe a week differently;
 *    · Atlas — `time.weeklyEarth` (js/atlas-cap-time.js) reads the same weeks and opens the same links;
 *    · the builder itself (the week arithmetic: what an ISO week is, decided once).
 *
 *  ⚠ IT SAYS WHAT AN UPSTREAM SAYS. An earthquake is USGS's magnitude, time, depth and place string (USGS writes
 *  the place in English and it is carried as written — CONSTITUTION.md §7); an EONET event is EONET's title, its
 *  dates and the source EONET names for it. The week's headline is CHOSEN BY A COUNT (the largest magnitude), never
 *  by a judgement of what mattered, and nothing here writes a sentence about consequences no upstream states.
 *  ⚠ A LINK OPENS THE PLACE AND THE DAY, AND PINS THE EVENT. The earthquake layer is a live feed the share link
 *  does not carry (js/layer-manifest.js: `bx-eq` has no `share`), so the event is put on the map as a received
 *  «my map» pin (js/my-map-doc.js — the share link's own `mm=` field, shown read-only to whoever opens it).
 *  ⚠ LOADED ON DEMAND: nothing on the start-up path imports it. IntMap-authored text is en + jp. No emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { encode, captionText, TITLE_MAX } from './map-state.js';
import { makeFeature, toLinkValue, PALETTE } from './my-map-doc.js';
import { fitView } from './on-this-day.js';   /* the one camera fit the generated pages share */
/* ⚠ STATIC, NOT import() — the reason js/on-this-day.js gives: both are in the start-up bundle already, and a dynamic
   import of one would split it into a chunk of its own (more requests before the map draws) */
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';

export const INDEX_PATH = 'data/weekly-earth.json';
/** where the generated pages live, under the site root (and under ja/ for Japanese) */
export const HUB = 'weekly/';
/** the hub's address for the reader's language, relative to the app's page */
export const hubHref = (lang) => './' + (lang === 'jp' ? 'ja/' : '') + HUB;

/* ══ THE WEEK — ISO 8601, in UTC ═══════════════════════════════════════════════════════════════════
   A week is Monday 00:00 UTC to the next Monday 00:00 UTC, numbered as ISO 8601 numbers it (week 1 holds the year's
   first Thursday). UTC because both upstreams date their events in UTC; a reader's own calendar would put an event
   near midnight into two different weeks for two readers. */
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
/** the ISO week holding an instant (a Date, epoch ms or an ISO string) → { slug:'YYYY-Www', from, to } (to is exclusive) */
export function weekOf(x) {
  const t = new Date(x);
  if (isNaN(t.getTime())) return null;
  const day0 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const mon = day0 - ((new Date(day0).getUTCDay() + 6) % 7) * DAY;
  const y = new Date(mon + 3 * DAY).getUTCFullYear();          /* the week's Thursday names its year */
  const jan4 = Date.UTC(y, 0, 4);
  const w1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  const n = Math.round((mon - w1) / (7 * DAY)) + 1;
  return { slug: y + '-W' + pad(n), from: isoDay(mon), to: isoDay(mon + 7 * DAY) };
}
/** 'YYYY-Www' → the same record as weekOf, or null when the text names no week (W53 only in a year that has one) */
export function weekFromSlug(slug) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(slug == null ? '' : slug).trim());
  if (!m) return null;
  const y = +m[1], n = +m[2];
  const jan4 = Date.UTC(y, 0, 4);
  const w1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  const w = weekOf(w1 + (n - 1) * 7 * DAY);
  return w && w.slug === m[1] + '-W' + m[2] ? w : null;
}
/** the newest week that has ENDED at the instant `now` (the week before the one holding it) */
export const lastEndedWeek = (now) => weekOf(Date.parse(weekOf(now).from) - DAY);

/* ══ THE WORDS ══════════════════════════════════════════════════════════════════════════════════════
   EONET's categories are a closed vocabulary of its own (https://eonet.gsfc.nasa.gov/api/v3/categories, 13 ids on
   2026-10-04); the English is EONET's title for each, the Japanese is IntMap's. An id EONET adds later falls back to
   the title EONET gave it in the data, so a new category is shown under its own name rather than dropped. */
const CATEGORY_JP = { drought: '干ばつ', dustHaze: '砂塵・煙霧', earthquakes: '地震', floods: '洪水', landslides: '地すべり', manmade: '人為的な事象',
  seaLakeIce: '海氷・湖氷（氷山）', severeStorms: '激しい嵐（熱帯低気圧など）', snow: '雪', tempExtremes: '異常な気温', volcanoes: '火山', waterColor: '水の色の変化', wildfires: '山火事' };
/** the category's name in the reader's language; `title` is EONET's own English for it (carried in the data) */
export const categoryWords = (id, title, lang) => (lang === 'jp' && CATEGORY_JP[id]) || title || id;
/* the pin colour of each kind of event — the my-map palette's indices (red, orange, yellow, green, blue, purple) */
const COLOUR = { earthquakes: 0, wildfires: 1, volcanoes: 2, floods: 4, seaLakeIce: 4, severeStorms: 5 };
const colourOf = (cat) => PALETTE[cat in COLOUR ? COLOUR[cat] : 3];
/* EONET's units as it writes them → the reader's words; an unknown unit is shown as written */
const unitWords = (u, lang) => (u === 'kts' ? IntMapLang.t(lang, 'kt', 'ノット') : u === 'hectare' ? IntMapLang.t(lang, 'ha', 'ヘクタール') : u === 'acres' ? IntMapLang.t(lang, 'acres', 'エーカー')
  : u === 'NM^2' ? IntMapLang.t(lang, 'sq NM', '平方海里') : String(u || ''));
const num = (v, lang) => (+v).toLocaleString(lang === 'jp' ? 'ja-JP' : 'en-US', { maximumFractionDigits: 1 });
/** 'YYYY-MM-DD HH:MM UTC' of an ISO instant (both languages: the upstreams' own clock) */
const utcWords = (iso) => String(iso).slice(0, 10) + ' ' + String(iso).slice(11, 16) + ' UTC';
/** '21–27 September 2026', '28 September – 4 October 2026' / '2026年9月21日〜27日', '2026年9月28日〜10月4日' for a week (its seven UTC days) */
export function weekWords(w, lang) {
  const a = new Date(w.from + 'T00:00:00Z'), b = new Date(Date.parse(w.to + 'T00:00:00Z') - DAY);
  const f = (d, o) => d.toLocaleDateString(lang === 'jp' ? 'ja-JP' : 'en-GB', Object.assign({ timeZone: 'UTC' }, o));
  const sameY = a.getUTCFullYear() === b.getUTCFullYear(), sameM = sameY && a.getUTCMonth() === b.getUTCMonth();
  const full = { year: 'numeric', month: 'long', day: 'numeric' };
  if (lang === 'jp') return f(a, full) + '〜' + (sameM ? b.getUTCDate() + '日' : f(b, sameY ? { month: 'long', day: 'numeric' } : full));
  return (sameM ? String(a.getUTCDate()) + '–' : f(a, sameY ? { month: 'long', day: 'numeric' } : full) + ' – ') + f(b, full);
}

/** what one item of a week says, in the reader's language: { kind, title, sub, when, at, url, sources } */
export function describe(item, idx, lang) {
  if (item.kind === 'quake') {
    const what = item.ty ? item.ty : IntMapLang.t(lang, 'Earthquake', '地震');
    const title = 'M ' + (+item.m).toFixed(1) + ' — ' + (item.p || coordWords(item.at, lang));
    const sub = [what + (item.mt ? ' (' + item.mt + ')' : ''), IntMapLang.t(lang, 'depth ', '深さ ') + num(item.at[2], lang) + ' km', utcWords(item.t)];
    if (item.ts) sub.push(IntMapLang.t(lang, 'USGS tsunami flag set', 'USGS の津波フラグあり'));
    if (item.al) sub.push(IntMapLang.t(lang, 'PAGER alert: ', 'PAGER 警報: ') + item.al);
    return { kind: 'quake', title, sub: sub.join(' · '), when: item.t, at: item.at, url: idx.sources.usgs.eventPage + item.id,
      sources: [{ name: 'USGS', url: idx.sources.usgs.eventPage + item.id }] };
  }
  const sub = [categoryWords(item.cat, idx.categories && idx.categories[item.cat], lang)];
  if (item.mag != null) sub.push((item.cat === 'severeStorms' ? IntMapLang.t(lang, 'max wind ', '最大風速 ') : item.cat === 'wildfires' ? IntMapLang.t(lang, 'burned area ', '焼失面積 ') : '') + num(item.mag, lang) + ' ' + unitWords(item.unit, lang));
  sub.push(item.d0.slice(0, 10) === item.d1.slice(0, 10) ? item.d0.slice(0, 10) : item.d0.slice(0, 10) + ' – ' + item.d1.slice(0, 10));
  if (!item.at) sub.push(IntMapLang.t(lang, 'not placed: EONET gives this event only an outline whose axis order it does not state', '位置は示しません: EONET はこの事象に軸順の明示されない輪郭しか与えていません'));
  return { kind: 'event', title: item.title, sub: sub.join(' · '), when: item.d1, at: item.at, url: (item.src[0] && item.src[0].url) || idx.sources.eonet.eventApi + item.id,
    sources: [...item.src.map((s) => ({ name: s.id, url: s.url })), { name: 'EONET', url: idx.sources.eonet.eventApi + item.id }] };
}
function coordWords(at, lang) {
  const lat = Math.abs(at[1]).toFixed(2) + '°' + (at[1] < 0 ? 'S' : 'N'), lng = Math.abs(at[0]).toFixed(2) + '°' + (at[0] < 0 ? 'W' : 'E');
  return lang === 'jp' ? lat + ' ' + lng : lat + ', ' + lng;
}

/** every item of a week, earthquakes first (largest first), then the EONET events by category (as stored) */
export const itemsOf = (week) => [...week.quakes.map((q) => Object.assign({ kind: 'quake' }, q)), ...week.events.map((e) => Object.assign({ kind: 'event' }, e))];
/** The week's headline: its largest earthquake (USGS's magnitude — a COUNT, not a judgement), or with none its
 *  strongest storm by EONET's stated wind, or its first event; null for a week with nothing in it. */
export function headline(week) {
  if (week.quakes.length) return Object.assign({ kind: 'quake' }, week.quakes[0]);   /* stored largest first */
  const storms = week.events.filter((e) => e.cat === 'severeStorms' && e.mag != null).sort((a, b) => b.mag - a.mag);
  const e = storms[0] || week.events[0];
  return e ? Object.assign({ kind: 'event' }, e) : null;
}
/** the counts a summary is written from: { quakes, byCategory:[{cat, n}], fewer } */
function counts(week) {
  const by = new Map();
  for (const e of week.events) { const o = by.get(e.cat) || { cat: e.cat, n: 0 }; o.n++; by.set(e.cat, o); }
  return { quakes: week.quakes.length, byCategory: [...by.values()], fewer: week.fewer || {} };
}
/** one sentence of counts, in the reader's language */
export function summary(week, idx, lang) {
  const C = counts(week);
  const parts = [IntMapLang.t(lang, C.quakes + ' earthquake' + (C.quakes === 1 ? '' : 's') + ' of M ' + idx.rule.minMagnitude + '+', 'M' + idx.rule.minMagnitude + ' 以上の地震 ' + C.quakes + ' 件')];
  for (const c of C.byCategory) parts.push(lang === 'jp' ? categoryWords(c.cat, idx.categories[c.cat], lang) + ' ' + c.n + ' 件' : c.n + ' ' + String(categoryWords(c.cat, idx.categories[c.cat], lang)).toLowerCase());
  return parts.join(lang === 'jp' ? '、' : ', ');
}

/* ══ THE LINKS ══════════════════════════════════════════════════════════════════════════════════════
   The share link's own form (js/map-state.js encode): the camera, the day (UTC) and the event(s) as received pins. */
/* an event opens on its place at the zoom js/on-this-day.js opens a war event at (the war layers' own operation zoom) */
const POINT_ZOOM = 5;
const WORLD = () => fitView(-180, -60, 180, 75);
const mapId = (s) => ('we' + String(s).toLowerCase().replace(/[^a-z0-9]/g, '')).slice(0, 41);
function pin(item, idx, lang) {
  if (!item.at) return null;
  const D = describe(item, idx, lang);
  const r = makeFeature({ kind: 'pin', name: D.title, note: D.sub, color: colourOf(item.kind === 'quake' ? 'earthquakes' : item.cat), coords: [[item.at[0], item.at[1]]] });
  return r.ok ? r.feature : null;
}
const doc = (id, title, features) => ({ v: 1, id: mapId(id), title: captionText(title, TITLE_MAX), updated: 0, features });
/** the map state that opens one item: its place, its day, and the item as a pin */
export function stateFor(item, week, idx, lang) {
  const D = describe(item, idx, lang);
  const f = pin(item, idx, lang);
  const view = item.at ? { lng: item.at[0], lat: item.at[1], zoom: POINT_ZOOM, bearing: 0, pitch: 0, proj: 'flat' } : WORLD();
  return { view, layers: [], time: { at: String(D.when).slice(0, 10) }, title: D.title, mymap: f ? toLinkValue(doc(item.id, week.w, [f])) : null };
}
/** the map state that opens a whole week: every placed item as a pin, framed together, on the week's last day */
export function weekState(week, idx, lang) {
  const items = itemsOf(week);
  const feats = items.map((it) => pin(it, idx, lang)).filter(Boolean);
  const pts = items.filter((it) => it.at).map((it) => it.at);
  let view = WORLD();
  if (pts.length) {
    const w = Math.min(...pts.map((p) => p[0])), e = Math.max(...pts.map((p) => p[0])), s = Math.min(...pts.map((p) => p[1])), n = Math.max(...pts.map((p) => p[1]));
    view = e - w > 180 || pts.length === 1 ? (pts.length === 1 ? { lng: w, lat: s, zoom: POINT_ZOOM, bearing: 0, pitch: 0, proj: 'flat' } : WORLD()) : fitView(w - 5, s - 5, e + 5, n + 5, POINT_ZOOM);
  }
  const title = IntMapLang.t(lang, 'This week on Earth — ', '今週の地球 — ') + weekWords(week, lang);
  return { view, layers: [], time: { at: isoDay(Date.parse(week.to + 'T00:00:00Z') - DAY) }, title, mymap: feats.length ? toLinkValue(doc(week.w, title, feats)) : null };
}
/** the addresses: 'index.html#v=…' */
export const linkFor = (item, week, idx, lang) => 'index.html' + encode(stateFor(item, week, idx, lang));
export const weekLink = (week, idx, lang) => 'index.html' + encode(weekState(week, idx, lang));
/** a week's page, relative to the site root, for a language directory ('' or 'ja/') */
export const pagePath = (week, dir) => (dir || '') + HUB + week.w + '/';

/* ══ THE ARCHIVE, READ ONCE ════════════════════════════════════════════════════════════════════════ */
let _idx = null;
/** the archive, through the app's one clocked reader (js/fetch-deadline.js) — read the first time a door asks */
export async function loadIndex() {
  if (!_idx) _idx = jsonWithin(INDEX_PATH, clockFor(INDEX_PATH)).catch((e) => { _idx = null; throw e; });
  return _idx;
}
/** a week of the archive by its slug, or the newest one when `slug` is empty; null when the archive does not hold it */
export function weekIn(idx, slug) {
  if (!idx || !Array.isArray(idx.weeks) || !idx.weeks.length) return null;
  if (slug == null || String(slug).trim() === '') return idx.weeks[0];
  const w = weekFromSlug(slug) || weekOf(slug);   /* a slug, or any date inside the week */
  return w ? idx.weeks.find((x) => x.w === w.slug) || null : null;
}
