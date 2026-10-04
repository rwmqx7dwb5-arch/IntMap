/* ============================================================================
 *  IntMap · DATA STUDIO — the reader's own table: on the map, analysed, published, in one surface   (data-studio)
 * ----------------------------------------------------------------------------
 *  「自分の表を、地図・分析・公開まで 1 つの面で」
 *
 *  WHAT WAS THERE. Every part of this existed and none of it was joined: a file reader that decodes CSV, TSV,
 *  GeoJSON, KML, Shapefile … (js/geo-import.js), a registry where an imported table is a dataset (js/gis-datasets.js),
 *  a `join` on identifiers (js/gis-ops.js), a classifier that colours an imported layer by a column with its legend
 *  (js/map-ui.js `GeoJSONUpload.style`), a data panel (js/gis-panel.js), writers for GeoJSON / CSV / GeoPackage
 *  (js/gis-export.js) and the map postcard (js/map-recorder.js). Three steps were missing, and they were the ones a
 *  spreadsheet of statistics needs first:
 *    ① a table that states no coordinates — a column of country names, ISO codes or city names — could not be
 *      bound to places at all (js/table-bind.js is that step);
 *    ② an Excel workbook could not reach the map (js/atlas-attach.js read it for Atlas only; its sheets are now
 *      handed to the map's import as cells, js/geo-import.js);
 *    ③ what was made could not be passed on (a drawing has `mm=`, a collection carries places — a coloured table
 *      had nothing).
 *  This file is the one surface over all of them. It READS FILES THROUGH THE MAP'S FILE DOOR
 *  (`GeoJSONUpload.handle`), registers through IntMapData, joins with IntMapGisOps `join`, draws with IntMapGis
 *  `draw`, colours with `GeoJSONUpload.style`, exports with js/gis-export.js and makes the picture with
 *  js/map-recorder.js — it copies none of them.
 *
 *  THE PUBLISHED LINK (③). A country's shape and a city's position are things the recipient's IntMap already has
 *  (the same Natural Earth countries, the same GeoNames places), so a coloured table is reproduced from three
 *  things only: the place each row named, the value of the coloured column, and the colouring. That is the map
 *  state's `ds` field (js/map-state.js), packed by js/link-codec.js — the same packing a classroom tour's link uses
 *  — and kept in the FRAGMENT, which no server receives. Nothing is stored anywhere: the link IS the data, and
 *  whoever is given the link can read the table's two columns (js/legal-text.js says so to the reader).
 *  ⚠ THE LINK IS NOT TRUSTED. `readStudio` re-reads every field against what this file writes; a key that does not
 *  name a place here is counted and shown as unresolved, never guessed at.
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7). The reader's table is theirs, shown as text.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { MapState } from './map-state.js';
import { IntMapGeoEngine } from './geo-engine.js';   /* (studio-wait-edge-cursor) whenCanDraw — the map is told to the studio, not guessed */
import { icon } from './icons.js';
import './safe-html.js';   /* publishes globalThis.IntMapSafe — the one encoder every string below is written with */
import * as bus from './bus.js';   /* the declared events: the language change is heard through it */
import * as TB from './table-bind.js';
import { packText, unpackText, LINK_LIMIT_MEASURED } from './link-codec.js';
/* ⚠ js/ne-countries.js AND js/data-door.js ARE NOT IMPORTED HERE — they are reached through the host (HOST.loadNECountries /
   HOST.neCountriesPath, js/app-body.js) and window.IntMapDataDoor (published by js/data-door.js for exactly this). Both are
   boot-path modules, and a static edge from this LAZY chunk to either made them modules main shares with a lazy chunk:
   the bundler's merge of shared modules back into main then refuses the cycle data-door → fetch-deadline → proxy-fetch.
   MEASURED with `npm run build` on this branch: eager requests 9 → 11 (fetch-deadline and proxy-fetch split out of main);
   a dynamic import instead made it 12 (data-door split out too). The same shape js/star-catalogue.js and vite.config.js
   («fetch-deadline-layer») record. One instance either way: the host's loader is the one js/countries-ui.js uses. */
const loadData = (url, opts) => window.IntMapDataDoor.load(url, opts);
import { ATL_FILE } from './atlas-attach.js';

/* ══ THE LINK'S DOCUMENT ═══════════════════════════════════════════════════════════════════════════════
   { v: 1, t: title, k: kind (js/table-bind.js KINDS), c: [key column, coloured column, country column],
     r: [[key cell, place key, coloured cell, country cell], …], s: {mode, method, classes} | null }
   The coloured column is `c[1]` ('' when nothing is coloured); the country column (`c[2]`) exists only for a city key
   narrowed by country. Trailing empty cells are left off a row. */
const STUDIO_VERSION = 1;
/* ⚠ HOW BIG A LINK MAY INFLATE TO: the ceiling on what a DROPPED FILE may be read into this tab (ATL_FILE.LIMITS.readBytes,
   js/atlas-attach.js). A table that arrives in a link is read by the same tab, so it gets no wider door than the same
   table arriving as a file. Reused, not invented — expires with that ceiling. */
const LINK_INFLATE_CAP = ATL_FILE.LIMITS.readBytes;
const MODES = ['categorical', 'graduated'], METHODS = ['quantile', 'equal'];
const KEY_SPELLING = /^[A-Za-z0-9:_-]{1,40}$/;   /* a Natural Earth key (ISO alpha-3 / ADM0_A3) or a GeoNames id — what js/table-bind.js keys are made of */
/* the files the two indexes are read from — the same files the map draws countries from and the search finds places in */
const NE_SCALE = '50m';   /* 242 records: the scale that carries the small states 110 m drops (Singapore, Bahrain …); measured in js/ne-countries.js's index.json `quality.rows` */
const GAZETTEER = 'data/gazetteer-phone.json.gz';

const str = (v) => String(v == null ? '' : v);
const kindGroup = (k) => (k === 'city' ? 'city' : 'country');

/** the studio's state → the link's document (pure) */
export function linkDoc(m) {
  const cols = [str(m.column), str(m.value || ''), str(m.within || '')];
  while (cols.length > 1 && !cols[cols.length - 1]) cols.pop();
  const rows = (m.rows || []).map((r) => {
    const a = [str(r.cell), r.key == null ? null : str(r.key), str(r.value), str(r.within)];
    while (a.length > 2 && a[a.length - 1] === '') a.pop();
    return a;
  });
  const s = m.style && m.value ? { mode: m.style.mode, method: m.style.method || null, classes: m.style.classes == null ? null : +m.style.classes } : null;
  return { v: STUDIO_VERSION, t: str(m.title), k: str(m.kind), c: cols, r: rows, s };
}
/** a link's document → the studio's state, read against what linkDoc writes. → {ok, model, dropped} | {ok:false, why} */
export function readStudio(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, why: 'not-a-studio-link' };
  if (o.v !== STUDIO_VERSION) return { ok: false, why: o.v > STUDIO_VERSION ? 'newer-version' : 'not-a-studio-link' };
  const kind = str(o.k); if (TB.KINDS.indexOf(kind) < 0) return { ok: false, why: 'kind-unknown' };
  const c = Array.isArray(o.c) ? o.c.map((x) => MapState.captionText(x, MapState.TITLE_MAX)) : [];
  if (!c[0]) return { ok: false, why: 'no-key-column' };
  const value = c[1] || null, within = kind === 'city' ? (c[2] || null) : null;
  if (!Array.isArray(o.r)) return { ok: false, why: 'no-rows' };
  let dropped = 0; const rows = [];
  for (const r of o.r) {
    if (!Array.isArray(r) || r.length < 2) { dropped++; continue; }
    const key = (r[1] == null) ? null : str(r[1]);
    if (key != null && !KEY_SPELLING.test(key)) { dropped++; continue; }
    rows.push({ cell: str(r[0]), key, value: str(r[2]), within: str(r[3]) });
  }
  let style = null;
  if (o.s && value) {
    const mode = MODES.indexOf(o.s.mode) >= 0 ? o.s.mode : null;
    if (mode) style = { field: value, mode, method: METHODS.indexOf(o.s.method) >= 0 ? o.s.method : null, classes: isFinite(+o.s.classes) && o.s.classes != null ? Math.round(+o.s.classes) : null };
  }
  return { ok: true, dropped, model: { title: MapState.captionText(o.t, MapState.TITLE_MAX), kind, column: c[0], value, within, rows, style } };
}
/** the studio's state → the `ds` value @returns {Promise<string>} */
export async function packStudio(m) { return packText(JSON.stringify(linkDoc(m))); }
/** a `ds` value → readStudio's answer, or {ok:false, why} — never throws */
export async function unpackStudio(v) {
  const t = await unpackText(v, LINK_INFLATE_CAP);
  if (t == null) return { ok: false, why: 'unreadable' };
  let o; try { o = JSON.parse(t); } catch (_) { return { ok: false, why: 'unreadable' }; }
  return readStudio(o);
}
/** how long the link to a map whose fragment is `hash` would be, against the browser ceiling (js/link-codec.js) */
export function linkFits(url) { const n = str(url).length; return { chars: n, limit: LINK_LIMIT_MEASURED, fits: n <= LINK_LIMIT_MEASURED }; }

/* ══ THE ONE CONTROLLER, AND HOW IT IS REACHED ═════════════════════════════════════════════════════════
   ⚠ NOTHING IS PUBLISHED ON window. Every entry — js/map-ui.js (the button beside «Import map data», Layers ▸ Tools, a dropped
   table, a restore that carries `ds`) and js/atlas-cap-data.js — writes the same literal `import('./data-studio.js')` and calls
   studio(HOST); the module is one instance, so the controller is one. The Atlas observer (js/atlas-capabilities.js) imports the
   module the same way and reads studioState(), which answers null while nobody has opened the studio (it never makes one). */
let CTL = null;
/** the controller — made on the first call, the same one after (its MapState owner is registered once) */
export function studio(HOST) { if (!CTL) CTL = dataStudio(HOST); return CTL; }
/** what the studio holds now, or null when it was never opened in this page */
export function studioState() { return CTL ? CTL.state() : null; }

/** the first name in `taken` order that is not taken: `base`, `base_2`, `base_3` … (a column the reader's table already has
   is never overwritten by a column this file adds) */
function freeName(base, taken) { if (taken.indexOf(base) < 0) return base; let i = 2; while (taken.indexOf(base + '_' + i) >= 0) i++; return base + '_' + i; }

function dataStudio(HOST) {
  const L = (en, jp) => IntMapLang.t(HOST.lang, en, jp);
  const H = (s) => globalThis.IntMapSafe.html(s);
  const toast = (m) => { try { HOST.imToast(m); } catch (_) { } };
  const GU = () => { try { return window.GeoJSONUpload || null; } catch (_) { return null; } };
  const DATA = () => { try { return window.IntMapData || null; } catch (_) { return null; } };

  /* ══ THE INDEXES — read once, on the first table ════════════════════════════════════════════════════ */
  let IDX = null, idxP = null, nePath = '';
  function indexes() {
    if (IDX) return Promise.resolve(IDX);
    if (!idxP) idxP = (async () => {
      nePath = HOST.neCountriesPath(NE_SCALE);
      const [ne, gaz, neIndex] = await Promise.all([
        Promise.resolve().then(() => HOST.loadNECountries(NE_SCALE)).catch(() => null),
        loadData(GAZETTEER, { as: 'json' }).catch(() => null),
        loadData('data/ne-countries/index.json', { as: 'json' }).catch(() => null),
      ]);
      const countries = ne && ne.features ? TB.countriesFrom(ne.features) : null;
      IDX = { ne, countries: countries ? TB.countryIndex(countries) : null, cities: gaz ? TB.cityIndex(gaz) : null,
        neGov: (neIndex && neIndex.gov) || null, gazetteer: gaz ? { attribution: gaz.attribution || null, built: gaz.built || null } : null };
      return IDX;
    })().catch(() => { idxP = null; return null; });
    return idxP;
  }
  async function gis() { let ok = false; try { ok = await window.IntMapLazy.need('gisCore'); } catch (_) { ok = false; } return ok && DATA() && window.IntMapGisOps && window.IntMapGis ? true : false; }

  /* ══ STATE ═════════════════════════════════════════════════════════════════════════════════════════ */
  const S = {
    source: null,      /* {name, from:'file'|'paste'|'attachment'|'link', author:'reader'|'shared-link', table, importId, placed, format, sheet} */
    detected: null,    /* js/table-bind.js detect() */
    binding: null,     /* js/table-bind.js bind() */
    style: null,       /* {field (a table column), mode, method, classes} */
    legend: null,
    result: null,      /* {datasetId, made:[ids this studio registered], fieldOf:{column → dataset field}} */
    packed: null, url: '', fits: null,
    problem: null,     /* {why, detail} — the last thing that could not be done, said in the panel */
    busy: '',
  };
  let countriesId = null;

  /* ══ IN — a file, a paste, an attachment ═════════════════════════════════════════════════════════════
     All three become a File and go through the map's own file door, so the studio and a drop on the map are one reader. */
  async function loadFiles(files, from) {
    const U = GU(); if (!U || typeof U.handle !== 'function') { S.problem = { why: 'map-unavailable' }; render(); return { ok: false, why: 'map-unavailable' }; }
    S.busy = L('Reading…', '読み込み中…'); render();
    let outs = []; try { outs = await U.handle(files, { quiet: true }); } catch (_) { outs = []; }
    S.busy = '';
    const o = (outs || []).find((x) => x && x.ok && !x.grid) || null;
    if (!o) { const f = (outs || []).find((x) => x && !x.ok); S.problem = { why: (f && f.why) || 'unreadable' }; render(); return { ok: false, why: S.problem.why }; }
    return receive(o, from);
  }
  async function loadText(text, name) {
    const nm = MapState.captionText(name || L('Pasted table', '貼り付けた表'), MapState.TITLE_MAX) || 'table';
    let f = null; try { f = new File([str(text)], nm, { type: 'text/plain' }); } catch (_) { f = null; }
    if (!f) return { ok: false, why: 'unreadable' };
    return loadFiles([f], 'paste');
  }
  /** an Atlas attachment (js/atlas-attach-log.js record): its text, a workbook's first sheet as the tab-separated lines it was read as */
  async function loadAttachment(rec) {
    if (!rec || rec.kind !== 'text' || typeof rec.text !== 'string') return { ok: false, why: 'attachment-not-a-table' };
    let text = rec.text, name = str(rec.name || 'attachment');
    if (rec.from === 'xlsx') { const sec = ATL_FILE.sheetSections(rec.text)[0]; if (!sec) return { ok: false, why: 'attachment-not-a-table' }; text = sec.text; name = name + ' › ' + sec.name; }
    let f = null; try { f = new File([text], name, { type: 'text/plain' }); } catch (_) { f = null; }
    if (!f) return { ok: false, why: 'unreadable' };
    const r = await loadFiles([f], 'attachment');
    return r;
  }

  /** what the file door made of a file (js/map-ui.js handleFiles' outcome) → the studio's source; binds at once when a key is found */
  async function receive(o, from) {
    if (!o || !o.ok || !o.fc) return { ok: false, why: 'unreadable' };
    open();
    clearResult();
    S.problem = null; S.style = null; S.legend = null; S.binding = null; S.detected = null;
    const table = TB.tableOf({ features: o.fc.features, stats: o.stats });
    const placed = o.format !== 'table';
    S.source = { name: str(o.label), from: from || 'file', author: 'reader', table, importId: o.datasetId || null, placed, format: o.format || null,
      sheet: (o.stats && o.stats.sheet) || null, rows: table.rows.length };
    if (placed) {
      /* the file had its own coordinates: it is on the map already (the file door drew it), so the studio colours THAT layer */
      S.result = { datasetId: o.datasetId || null, made: [], fieldOf: null, placed: true };
      render(); await autoStyle(); return { ok: true, placed: true, datasetId: o.datasetId || null };
    }
    S.busy = L('Looking for place columns…', '場所の列を探しています…'); render();
    const I = await indexes();
    S.busy = '';
    if (!I || (!I.countries && !I.cities)) { S.problem = { why: 'places-unavailable' }; render(); return { ok: false, why: 'places-unavailable' }; }
    S.detected = TB.detect(table, I);
    if (!S.detected.key) { render(); return { ok: true, bound: false, detected: S.detected }; }
    return bindTo({ column: S.detected.key, kind: S.detected.kind, within: S.detected.within }, { auto: true });
  }

  /* ══ BIND ═══════════════════════════════════════════════════════════════════════════════════════════
     choice {column, kind, within?} — `chosen` marks the reader's own choice (a numeric code with dropped zeros is then read) */
  async function bindTo(choice, o) {
    if (!S.source || S.source.placed) return { ok: false, why: 'no-table' };
    const I = await indexes(); if (!I) { S.problem = { why: 'places-unavailable' }; render(); return { ok: false, why: 'places-unavailable' }; }
    /* a column named without its kind takes the kind its own cells were measured to be (detect), never a default */
    const c = Object.assign({}, choice);
    if (!c.kind && c.column) { const d = S.detected || TB.detect(S.source.table, I); S.detected = d; const x = (d.columns || []).find((y) => y.name === c.column); c.kind = x && x.kind ? x.kind : ''; }
    const b = TB.bind(S.source.table, Object.assign(c, { chosen: !(o && o.auto) }), I);
    if (!b.ok) { S.problem = { why: b.why }; render(); return b; }
    S.binding = b; S.problem = null;
    const r = await realise();
    if (r.ok && (o && o.auto) && !S.style) await autoStyle();
    else if (r.ok && S.style) await applyStyle(S.style);
    else render();
    return Object.assign({ ok: r.ok, resolved: b.resolved, total: b.total, unresolved: b.unresolved.length }, r.ok ? { datasetId: r.datasetId } : { why: r.why });
  }

  /* the Natural Earth countries as a dataset of their own — registered once, and the left side of every country join */
  function countriesDataset(I) {
    const D = DATA(); if (!D) return null;
    if (countriesId && D.has(countriesId)) return countriesId;
    const feats = [];
    for (const f of I.ne.features) {
      const p = f.properties || {}; const key = TB.placeKey(p); if (!key || !f.geometry) continue;
      feats.push({ type: 'Feature', geometry: f.geometry, properties: { place_key: key, NAME: p.NAME == null ? null : p.NAME, NAME_JA: p.NAME_JA == null ? null : p.NAME_JA,
        ISO_A2_EH: p.ISO_A2_EH, ISO_A3_EH: p.ISO_A3_EH, ISO_N3_EH: p.ISO_N3_EH } });
    }
    const g = I.neGov || {};
    const rec = D.add({ title: L('Countries (Natural Earth 1:50m)', '国（Natural Earth 1:5,000 万）'), features: feats, sourceCrs: 'EPSG:4326',
      provenance: { kind: 'builtin', file: nePath, publisher: g.publisher || null, url: g.url || null, licence: g.licence || null, licenceUrl: g.licenceUrl || null,
        columns: 'NAME, NAME_JA, ISO_A2_EH, ISO_A3_EH, ISO_N3_EH as published; place_key = ISO_A3_EH, else ADM0_A3 (js/table-bind.js placeKey)' } });
    countriesId = rec && rec.id ? rec.id : null;
    return countriesId;
  }

  function clearResult() {
    const D = DATA(), U = GU();
    if (S.result && !S.result.placed) {
      try { const it = U && S.result.datasetId ? U.find(S.result.datasetId) : null; if (it) U.remove(it.n); } catch (_) { }
      /* the datasets this studio made for the previous binding go with it — newest first, so an op's input outlives its output */
      if (D) (S.result.made || []).slice().reverse().forEach((id) => { try { D.remove(id); } catch (_) { } });
    }
    S.result = null; S.legend = null; S.packed = null; S.url = ''; S.fits = null;
  }

  /** the binding → a dataset on the map: countries joined by key (js/gis-ops.js `join`), or the cities as points */
  async function realise() {
    if (!(await gis())) { S.problem = { why: 'gis-unavailable' }; return { ok: false, why: 'gis-unavailable' }; }
    const I = await indexes(); const D = DATA(), b = S.binding, src = S.source;
    clearResult();
    const cols = src.table.columns, rows = src.table.rows, made = [];
    const stated = { file: src.name, from: src.from, author: src.author, importedAs: src.importId, keyColumn: b.column, keyKind: b.kind,
      within: b.within || null, resolved: b.resolved, rows: b.total, unresolved: b.unresolved.filter((u) => u.why !== 'empty').length, boundWith: 'js/table-bind.js' };
    const title = src.name + (src.author === 'shared-link' ? ' — ' + L('shared', '共有') : '');
    let resultId = null, fieldOf = {};
    S.busy = L('Joining…', '結合しています…'); render();
    try {
      if (kindGroup(b.kind) === 'country') {
        if (!I.ne || !I.ne.features) throw Object.assign(new Error('countries'), { why: 'countries-unavailable' });
        const left = countriesDataset(I); if (!left) throw Object.assign(new Error('registry'), { why: 'registry-refused' });
        const leftFields = ['place_key', 'NAME', 'NAME_JA', 'ISO_A2_EH', 'ISO_A3_EH', 'ISO_N3_EH'];
        const keyField = freeName('place_key', cols);
        /* a table column that a country column already uses would be refused by the join (join-column-collision): the
           table's columns then arrive under a prefix the reader can see — decided here, before the run, not by a retry */
        const prefix = cols.some((c) => leftFields.indexOf(c) >= 0) ? 'table_' : '';
        cols.forEach((c) => { fieldOf[c] = prefix + c; });
        const feats = rows.map((r, i) => { const p = Object.assign({}, r); p[keyField] = b.rows[i].key; return { type: 'Feature', geometry: null, properties: p }; });
        const bound = D.add({ title: L('Bound: ', '場所に結んだ表: ') + src.name, features: feats, sourceCrs: null,
          provenance: Object.assign({ kind: 'bind', keyField, places: { publisher: (I.neGov && I.neGov.publisher) || null, file: nePath, licence: (I.neGov && I.neGov.licence) || null } }, stated) });
        made.push(bound.id);
        const res = await window.IntMapGisOps.run({ op: 'join', inputs: [left, bound.id], title,
          params: { leftField: 'place_key', rightField: keyField, prefix, unmatched: 'keep', duplicates: 'refuse' } });
        if (!res || !res.ok) throw Object.assign(new Error('join'), { why: (res && res.why) || 'join-failed', detail: res && res.detail });
        resultId = res.dataset.id; made.push(resultId);
      } else {
        const gidF = freeName('place_gid', cols), nameF = freeName('place_name', cols), ccF = freeName('place_country', cols);
        cols.forEach((c) => { fieldOf[c] = c; });
        const feats = rows.map((r, i) => {
          const c = TB.placeOf('city', b.rows[i].key, I); const p = Object.assign({}, r);
          if (c) { p[gidF] = c.gid; p[nameF] = c.name; p[ccF] = c.iso2; }
          return { type: 'Feature', geometry: c ? { type: 'Point', coordinates: [c.lng, c.lat] } : null, properties: p };
        });
        const rec = D.add({ title, features: feats, sourceCrs: 'EPSG:4326',
          provenance: Object.assign({ kind: 'bind', places: { publisher: 'GeoNames', file: GAZETTEER, attribution: (I.gazetteer && I.gazetteer.attribution) || null, built: (I.gazetteer && I.gazetteer.built) || null } }, stated) });
        resultId = rec.id; made.push(resultId);
      }
    } catch (e) {
      S.busy = ''; made.slice().reverse().forEach((id) => { try { D.remove(id); } catch (_) { } });
      S.problem = { why: (e && e.why) || 'registry-refused', detail: e && e.detail };
      return { ok: false, why: S.problem.why, detail: S.problem.detail };
    }
    S.result = { datasetId: resultId, made, fieldOf, placed: false };
    /* (studio-wait-edge-cursor) A MAP THAT IS STILL LOADING IS NOT A MAP THAT CANNOT DRAW. A shared link opened before the
       style had finished loading (or while it was being swapped) failed at addSource with «Style is not done loading», and
       the studio told the reader to switch to the flat map — advice about the projection for a matter of time (production,
       2026-10-04). The engine already answers «when can I draw» (js/geo-engine.js whenCanDraw); the studio waits for it and
       says it is waiting. The refusal below is now only what the renderer refused with a style in hand. */
    try { if (!IntMapGeoEngine.canDraw()) { S.busy = L('Waiting for the map to finish loading…', '地図の読み込みが終わるのを待っています…'); render(); await IntMapGeoEngine.whenCanDraw(); } } catch (_) { /* no engine: draw() answers below */ }
    const d = window.IntMapGis.draw(resultId);
    S.busy = '';
    if (!d || !d.ok) { S.problem = { why: (d && d.why) || 'draw-not-rendered' }; return { ok: false, why: S.problem.why }; }
    await repack();
    return { ok: true, datasetId: resultId };
  }

  /* ══ COLOUR — js/map-ui.js style(), the one classifier, and its legend ═══════════════════════════════ */
  function datasetField(col) { const fo = S.result && S.result.fieldOf; return fo ? (fo[col] || col) : col; }
  function numericColumn(col) {
    const D = DATA(); if (!D || !S.source) return false;
    try { const t = D.typeColumn(col, S.source.table.rows.map((r) => r[col])); return !!(t && t.type === 'number'); } catch (_) { return false; }
  }
  /** the first column that is neither the key nor the country column and whose every value is a number — graduated; none → nothing */
  async function autoStyle() {
    if (!S.source || !S.result || !(await gis())) { render(); return null; }
    const skip = S.binding ? [S.binding.column, S.binding.within] : [];
    const col = S.source.table.columns.find((c) => skip.indexOf(c) < 0 && numericColumn(c));
    if (!col) { render(); return null; }
    return applyStyle({ field: col, mode: 'graduated', method: 'quantile', classes: null });
  }
  async function applyStyle(spec) {
    const U = GU(); if (!U || !S.result || !S.result.datasetId) { S.problem = { why: 'nothing-drawn' }; render(); return { ok: false, why: 'nothing-drawn' }; }
    if (spec == null) { const r = await U.style(S.result.datasetId, null); S.style = null; S.legend = null; await repack(); render(); return r; }
    /* no mode stated: a column whose every value is a number is graduated, any other is categorised (the classifier's own rule for «numeric») */
    const s = { field: str(spec.field), mode: MODES.indexOf(spec.mode) >= 0 ? spec.mode : (numericColumn(str(spec.field)) ? 'graduated' : 'categorical'), method: METHODS.indexOf(spec.method) >= 0 ? spec.method : null,
      classes: spec.classes == null || spec.classes === '' ? null : Math.round(+spec.classes) };
    if (!S.source || S.source.table.columns.indexOf(s.field) < 0) { S.problem = { why: 'no-such-column', detail: { column: s.field } }; render(); return { ok: false, why: 'no-such-column' }; }
    const out = { field: datasetField(s.field), mode: s.mode };
    if (s.mode === 'graduated') { out.method = s.method || 'quantile'; if (s.classes != null) out.classes = s.classes; }
    const r = await U.style(S.result.datasetId, out);
    if (!r || !r.ok) { S.problem = { why: (r && r.why) || 'paint-failed', styleWhy: true }; render(); return r || { ok: false, why: 'paint-failed' }; }
    S.style = s; S.legend = r.legend || null; S.problem = null;
    await repack(); render();
    return r;
  }

  /* ══ PUBLISH ═════════════════════════════════════════════════════════════════════════════════════════ */
  function model() {
    if (!S.source || S.source.placed || !S.binding || !S.result) return null;
    const b = S.binding, t = S.source.table, v = S.style ? S.style.field : null;
    return { title: S.source.name, kind: b.kind, column: b.column, value: v, within: b.within || null, style: S.style,
      rows: t.rows.map((r, i) => ({ cell: r[b.column], key: b.rows[i].key, value: v ? r[v] : '', within: b.within ? r[b.within] : '' })) };
  }
  let packGen = 0;
  async function repack() {
    const m = model(), my = ++packGen;
    if (!m) { S.packed = null; S.url = ''; S.fits = null; try { MapState.changed('ds'); } catch (_) { } return; }
    let v = null; try { v = await packStudio(m); } catch (_) { v = null; }
    if (my !== packGen) return;
    S.packed = v;
    try { MapState.changed('ds'); } catch (_) { }
    try { S.url = location.origin + location.pathname + MapState.hash(); } catch (_) { S.url = ''; }
    S.fits = linkFits(S.url);
  }
  function link() {
    if (!S.packed) return { ok: false, reason: S.source && S.source.placed ? 'has-own-coordinates' : 'nothing-bound' };
    if (!onMap()) return { ok: false, reason: 'nothing-drawn' };
    let url = ''; try { url = location.origin + location.pathname + MapState.hash(); } catch (_) { url = ''; }
    const f = linkFits(url);
    if (!f.fits) return Object.assign({ ok: false, reason: 'too-long' }, f);
    return Object.assign({ ok: true, url }, f);
  }
  async function copyLink() {
    const r = link(); if (!r.ok) { S.problem = { why: r.reason, detail: r }; render(); return r; }
    let copied = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(r.url); copied = true; } } catch (_) { copied = false; }
    S.said = copied ? L('Link copied (' + r.chars.toLocaleString() + ' characters). Whoever opens it sees this table on their own map.', 'リンクをコピーしました（' + r.chars.toLocaleString() + ' 文字）。開いた人の地図にこの表が描かれます。') : '';
    S.saidUrl = copied ? '' : r.url;
    render(); return Object.assign({}, r, { copied });
  }
  async function exportFile(format) {
    const D = DATA(); const id = S.result && S.result.datasetId; const ds = D && id ? D.get(id) : null;
    if (!ds) return { ok: false, reason: 'nothing-drawn' };
    let X = null; try { X = (await import('./gis-export.js')).makeGisExport(); } catch (_) { X = null; }
    if (!X) return { ok: false, reason: 'export-unavailable' };
    const r = X.write(ds, { format });
    if (!r || !r.ok) return { ok: false, reason: (r && r.why) || 'export-failed' };
    try {
      const url = URL.createObjectURL(new Blob([r.bytes], { type: r.mediaType }));
      const a = document.createElement('a'); a.href = url; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) { } }, 4000);
    } catch (_) { return { ok: false, reason: 'download-refused' }; }
    return { ok: true, filename: r.filename, bytes: r.bytes.length };
  }
  async function exportFormats() { try { return (await import('./gis-export.js')).makeGisExport().formats('vector').map((f) => f.id); } catch (_) { return []; } }
  async function postcard() {
    let R = null; try { R = await import('./map-recorder.js'); } catch (_) { R = null; }
    if (!R || typeof R.postcard !== 'function') return { ok: false, reason: 'postcard-unavailable' };
    const l = link();
    const r = await R.postcard({ title: S.source ? S.source.name : '', link: l.ok ? l.url : '', lang: HOST.lang });
    if (!r || !r.ok) return { ok: false, reason: (r && r.error) || 'postcard-failed' };
    try { const a = document.createElement('a'); a.href = r.url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove(); } catch (_) { return { ok: false, reason: 'download-refused' }; }
    return { ok: true, filename: r.name };
  }

  /* ══ THE MAP STATE'S `ds` FIELD ══════════════════════════════════════════════════════════════════════
     read: the packed table while a bound table is on the map (nothing otherwise). apply: a link's table — read without
     trust, its places re-found in this IntMap's own indexes, joined, drawn and coloured the same way. */
  async function applyLink(v) {
    if (v == null) { if (S.source && S.source.author === 'shared-link') clear(); return; }
    const r = await unpackStudio(v);
    if (!r.ok) { toast(L('The table in this link could not be read', 'このリンクの表は読めませんでした')); return; }
    const m = r.model, I = await indexes();
    if (!I) { toast(L('The places this table names could not be loaded', 'この表が指す場所を読み込めませんでした')); return; }
    open();
    clearResult();
    const columns = [m.column].concat(m.value ? [m.value] : []).concat(m.within ? [m.within] : []);
    const rows = m.rows.map((x) => { const o = {}; o[m.column] = x.cell; if (m.value) o[m.value] = x.value; if (m.within) o[m.within] = x.within; return o; });
    S.source = { name: m.title || L('Shared table', '共有された表'), from: 'link', author: 'shared-link', table: { columns, rows }, importId: null, placed: false, format: 'link', rows: rows.length, dropped: r.dropped };
    /* the link states each row's place by its key; a key this IntMap does not know is unresolved, never re-guessed from the cell */
    const brows = m.rows.map((x) => { if (x.key == null) return { key: null, why: x.cell ? 'unknown' : 'empty' }; return TB.placeOf(m.kind, x.key, I) ? { key: x.key, why: null } : { key: null, why: 'unknown' }; });
    const unresolved = []; let resolved = 0, total = 0;
    brows.forEach((b, i) => { if (b.why === 'empty') { unresolved.push({ row: i, cell: '', why: 'empty' }); return; } total++; if (b.key) resolved++; else unresolved.push({ row: i, cell: m.rows[i].cell, why: b.why }); });
    S.binding = { ok: true, column: m.column, kind: m.kind, within: m.within, rows: brows, resolved, total, ratio: total ? resolved / total : 0, unresolved };
    S.detected = null; S.style = null; S.legend = null; S.problem = null;
    const rr = await realise();
    if (rr.ok && m.style) await applyStyle(m.style); else render();
  }
  /* the link carries the table only while it is on the map: a reader who took the layer off (its × in the upload list)
     is not sharing it any more, whatever the studio still holds */
  const onMap = () => { try { const U = GU(), id = S.result && S.result.datasetId; return !!(U && id && U.find(id)); } catch (_) { return false; } };
  MapState.own('ds', { read: () => (S.packed && onMap() ? S.packed : null), apply: (v) => { applyLink(v); } });

  function clear() {
    clearResult(); S.source = null; S.detected = null; S.binding = null; S.style = null; S.problem = null; S.said = ''; S.saidUrl = '';
    try { MapState.changed('ds'); } catch (_) { }
    render(); return { ok: true };
  }

  /* ══ ANALYSE — the existing doors ════════════════════════════════════════════════════════════════════ */
  async function openAnalysis() { if (!(await gis())) return { ok: false, reason: 'gis-unavailable' }; try { window.IntMapGis.open(); } catch (_) { return { ok: false, reason: 'gis-unavailable' }; } return { ok: true, datasetId: S.result && S.result.datasetId }; }
  async function askAtlas() { try { await window.IntMapAtlas.call('open'); return { ok: true }; } catch (_) { return { ok: false, reason: 'atlas-unavailable' }; } }

  /* ══ THE PANEL ═══════════════════════════════════════════════════════════════════════════════════════ */
  const STYLE_TEXT = [
    /* the same layer and material as My map's panel (js/my-map.js #im-mymap): one floating-panel look */
    '#im-datastudio{position:fixed;top:14px;right:14px;z-index:var(--z-front);width:min(380px,calc(100vw - 28px));max-height:calc(100dvh - var(--credit-h,23px) - 28px);display:flex;flex-direction:column;box-sizing:border-box;border-radius:22px;background:color-mix(in srgb,var(--card-bg) 94%,transparent);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));box-shadow:var(--shadow);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);font-size:13px;line-height:1.4;}',
    '#im-datastudio .ds-head{display:flex;align-items:center;gap:8px;padding:14px 14px 8px;}',
    '#im-datastudio h2{flex:1 1 auto;margin:0;font-size:17px;font-weight:700;letter-spacing:-0.01em;}',
    '#im-datastudio .ds-body{overflow:auto;padding:0 14px 14px;}',
    '#im-datastudio .ds-card{margin:0 0 10px;padding:12px;border-radius:16px;background:color-mix(in srgb,var(--input-bg) 60%,transparent);border:1px solid rgba(128,128,128,0.16);}',
    '#im-datastudio .ds-step{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-weight:700;font-size:13px;}',
    '#im-datastudio .ds-n{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:999px;background:var(--primary-fill,var(--primary-color));color:#fff;font-size:11px;font-weight:700;}',
    '#im-datastudio .ds-n.ds-off{background:rgba(128,128,128,0.35);}',
    '#im-datastudio .ds-drop{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px;border:1.5px dashed rgba(128,128,128,0.45);border-radius:14px;text-align:center;color:var(--text-muted);}',
    '#im-datastudio .ds-drop.ds-over{border-color:var(--primary-color);background:color-mix(in srgb,var(--primary-color) 8%,transparent);}',
    '#im-datastudio .ds-muted{color:var(--text-muted);font-size:12px;}',
    '#im-datastudio .ds-row{display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap;}',
    '#im-datastudio label.ds-f{display:flex;flex-direction:column;gap:3px;flex:1 1 120px;font-size:11.5px;color:var(--text-muted);}',
    '#im-datastudio select,#im-datastudio input[type=number],#im-datastudio textarea{font:inherit;font-size:13px;color:var(--text-main);background:var(--input-bg);border:1px solid rgba(128,128,128,0.25);border-radius:10px;padding:7px 8px;min-height:36px;}',
    '#im-datastudio textarea{width:100%;min-height:70px;resize:vertical;box-sizing:border-box;}',
    '#im-datastudio button.ds-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 12px;border-radius:12px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font:inherit;font-weight:600;font-size:13px;cursor:pointer;}',
    '#im-datastudio button.ds-btn.ds-primary{background:var(--primary-fill,var(--primary-color));border-color:transparent;color:#fff;}',
    '#im-datastudio button.ds-btn:disabled{opacity:0.4;cursor:default;}',
    '#im-datastudio button.ds-icon{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:none;border-radius:999px;background:var(--input-bg);color:var(--text-main);cursor:pointer;}',
    '#im-datastudio button:focus-visible,#im-datastudio select:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px;}',
    '#im-datastudio .ds-seg{display:flex;gap:4px;padding:3px;border-radius:12px;background:var(--input-bg);margin-top:8px;}',
    '#im-datastudio .ds-seg button{flex:1 1 0;min-height:34px;border:none;border-radius:9px;background:transparent;color:var(--text-main);font:inherit;font-weight:600;font-size:12.5px;cursor:pointer;}',
    '#im-datastudio .ds-seg button[aria-pressed=true]{background:var(--card-bg);box-shadow:0 1px 4px rgba(0,0,0,0.14);color:var(--primary-color);}',
    '#im-datastudio .ds-bar{height:6px;border-radius:999px;background:rgba(128,128,128,0.2);overflow:hidden;margin-top:6px;}',
    '#im-datastudio .ds-bar span{display:block;height:100%;background:#34c759;}',
    '#im-datastudio .ds-un{margin:8px 0 0;padding:0;list-style:none;max-height:150px;overflow:auto;font-size:12px;}',
    '#im-datastudio .ds-un li{padding:4px 0;border-top:1px solid rgba(128,128,128,0.14);}',
    '#im-datastudio .ds-lg{display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0;}',
    '#im-datastudio .ds-sw{width:12px;height:12px;border-radius:3px;flex:0 0 auto;}',
    '#im-datastudio .ds-warn{margin:0 0 10px;padding:10px 12px;border-radius:14px;background:color-mix(in srgb,#ff9500 14%,transparent);font-size:12.5px;}',
    '#im-datastudio .ds-recv{margin:0 0 10px;padding:10px 12px;border-radius:14px;background:color-mix(in srgb,#34c759 12%,transparent);font-size:12.5px;}',
    '#im-datastudio .ds-said{margin-top:8px;font-size:12px;color:var(--text-muted);word-break:break-all;}',
    '#im-datastudio .ds-said input{width:100%;margin-top:6px;font-size:12px;box-sizing:border-box;}',
    '@media (max-width:640px){#im-datastudio{top:auto;left:8px;right:8px;bottom:calc(var(--credit-h,23px) + 8px);width:auto;max-height:66dvh;border-radius:20px;}}',
  ].join('\n');
  let styled = false;
  function style() { if (styled) return; styled = true; const st = document.createElement('style'); st.id = 'im-datastudio-css'; st.textContent = STYLE_TEXT; document.head.appendChild(st); }

  let panel = null, pasteOpen = false, formats = null;
  const btn = (act, label, cls, extra, ic) => '<button type="button" class="' + (cls || 'ds-btn') + '" data-ds="' + act + '"' + (extra || '') + '>' + (ic ? icon(ic, { size: 16 }) : '') + H(label) + '</button>';
  const kindLabel = (k) => ({ iso3: L('ISO 3166 alpha-3 code', 'ISO 3166 3 文字コード'), iso2: L('ISO 3166 alpha-2 code', 'ISO 3166 2 文字コード'),
    numeric: L('ISO 3166 numeric code', 'ISO 3166 数字コード'), country: L('Country name', '国名'), city: L('City name', '都市名') }[k] || k);
  function reasonText(why, detail) {
    const m = {
      'map-unavailable': L('The map cannot take files right now', 'いまは地図がファイルを受け付けられません'),
      'unreadable': L('That file could not be read', 'そのファイルは読めませんでした'),
      'places-unavailable': L('The country and city lists could not be loaded', '国と都市の一覧を読み込めませんでした'),
      'gis-unavailable': L('The analysis module did not load', '分析モジュールを読み込めませんでした'),
      'registry-refused': L('The data panel did not accept this table', 'データパネルがこの表を受け付けませんでした'),
      'join-right-not-unique': L('Several rows name the same country — the map can colour one value per country. Rows: ', '同じ国を指す行が複数あります。地図は国ごとに 1 つの値で塗ります。該当: ') + ((detail && detail.keys) || []).join(', '),
      'join-column-collision': L('A column name clashes with the country data', '列名が国のデータと重なっています'),
      'draw-not-rendered': L('This map view cannot draw the result — switch to the flat map', 'この地図表示では結果を描けません。平面地図に切り替えてください'),
      'map-unavailable-draw': L('The map is not ready', '地図の準備ができていません'),
      'no-such-column': L('There is no such column', 'その列はありません'),
      'kind-unknown': L('Unknown kind of place', '不明な場所の種類です'),
      'cities-unavailable': L('The city list could not be loaded', '都市の一覧を読み込めませんでした'),
      'countries-unavailable': L('The country list could not be loaded', '国の一覧を読み込めませんでした'),
      'nothing-drawn': L('Nothing from the studio is on the map yet', 'スタジオの表はまだ地図にありません'),
      'nothing-bound': L('Bind the table to places first', '先に表を場所に結んでください'),
      'has-own-coordinates': L('This file has its own coordinates; a link carries tables bound by country or city — export it as a file instead', 'このファイルは座標を持っています。リンクで渡せるのは国や都市に結んだ表です。ファイルとして書き出してください'),
      'too-long': L('This table does not fit in a link (' + ((detail && detail.chars) || 0).toLocaleString() + ' of the ' + LINK_LIMIT_MEASURED.toLocaleString() + ' characters Chromium keeps; other browsers were not measured). Export it as GeoJSON instead.', 'この表はリンクに入りきりません（' + ((detail && detail.chars) || 0).toLocaleString() + ' 文字。Chromium が保てるのは ' + LINK_LIMIT_MEASURED.toLocaleString() + ' 文字で、他のブラウザは未計測です）。GeoJSON として書き出してください。'),
      'attachment-not-a-table': L('That attachment is not a table', 'その添付は表ではありません'),
      'empty': L('The file is empty', 'ファイルが空です'),
    };
    if (m[why]) return m[why];
    const U = GU(); if (U && typeof U.styleReason === 'function') return U.styleReason(why);
    return L('This could not be done', 'できませんでした');
  }
  const whyText = (w) => ({ unknown: L('not recognised', '見つからない'), ambiguous: L('ambiguous', '曖昧'), empty: L('empty', '空欄') }[w] || w);

  /* ⚠ HOW MANY UNRESOLVED ROWS ARE LISTED IN THE PANEL: 100. ESTIMATE — a list a reader scrolls through to fix spellings,
     not a measurement; the count of the rest is printed, and every one is in state() for Atlas and in the exported file
     (an unresolved row keeps its cells and has no place). Expires if the panel gains a search over the list. */
  const UNRESOLVED_SHOWN = 100;

  function sourceHtml() {
    const s = S.source;
    let h = '<div class="ds-card" data-ds-drop="1"><div class="ds-step"><span class="ds-n">1</span>' + H(L('Data', 'データ')) + '</div>';
    if (s) h += '<div><b>' + H(s.name) + '</b></div><div class="ds-muted">' + H(L(s.rows + ' rows · ' + s.table.columns.length + ' columns', s.rows + ' 行・' + s.table.columns.length + ' 列')) + (s.placed ? ' · ' + H(L('has its own coordinates', '座標あり')) : '') + '</div>';
    h += '<div class="ds-drop" style="margin-top:8px">' + icon('folder', { size: 20 }) + '<div>' + H(L('Drop a CSV, TSV or Excel file here', 'CSV・TSV・Excel ファイルをここに落とす')) + '</div>'
      + '<div class="ds-row" style="justify-content:center">' + btn('choose', L('Choose a file', 'ファイルを選ぶ')) + btn('paste', pasteOpen ? L('Hide paste', '貼り付けを閉じる') : L('Paste a table', '表を貼り付ける')) + '</div></div>';
    if (pasteOpen) h += '<textarea data-ds-f="paste" aria-label="' + H(L('Paste a table copied from a spreadsheet', 'スプレッドシートからコピーした表を貼り付け')) + '" placeholder="' + H(L('Country\tValue\nJapan\t125', '国\t値\n日本\t125')) + '"></textarea><div class="ds-row">' + btn('paste-go', L('Use this table', 'この表を使う'), 'ds-btn ds-primary') + '</div>';
    return h + '</div>';
  }
  function bindHtml() {
    const s = S.source, b = S.binding, d = S.detected;
    const on = !!(s && !s.placed);
    let h = '<div class="ds-card"><div class="ds-step"><span class="ds-n' + (on ? '' : ' ds-off') + '">2</span>' + H(L('Bind to places', '場所に結ぶ')) + '</div>';
    if (!s) return h + '<div class="ds-muted">' + H(L('Countries by name or ISO code, or cities by name.', '国（名前・ISO コード）または都市（名前）に結びます。')) + '</div></div>';
    if (s.placed) return h + '<div class="ds-muted">' + H(L('This file already states where each row is.', 'このファイルは各行の位置を持っています。')) + '</div></div>';
    const cols = s.table.columns;
    const cur = b || (d && d.key ? { column: d.key, kind: d.kind, within: d.within } : { column: cols[0], kind: 'country', within: null });
    if (d && !d.key && !b) h += '<div class="ds-warn">' + H(L('No column was recognised as places — choose the column and its kind.', '場所の列を自動では見つけられませんでした。列と種類を選んでください。')) + '</div>';
    const colInfo = (c) => { const x = d && d.columns.find((y) => y.name === c); return x && x.kind ? ' — ' + kindLabel(x.kind) + ' ' + Math.round(x.ratio * 100) + '%' : ''; };
    h += '<div class="ds-row"><label class="ds-f">' + H(L('Column', '列')) + '<select data-ds-f="column">' + cols.map((c) => '<option value="' + H(c) + '"' + (c === cur.column ? ' selected' : '') + '>' + H(c + colInfo(c)) + '</option>').join('') + '</select></label>'
      + '<label class="ds-f">' + H(L('It holds', '中身')) + '<select data-ds-f="kind">' + TB.KINDS.map((k) => '<option value="' + H(k) + '"' + (k === cur.kind ? ' selected' : '') + '>' + H(kindLabel(k)) + '</option>').join('') + '</select></label></div>';
    if (cur.kind === 'city') h += '<div class="ds-row"><label class="ds-f">' + H(L('Narrow by the country in column', '同じ行の国の列で絞る')) + '<select data-ds-f="within"><option value="">' + H(L('(none)', '（なし）')) + '</option>' + cols.filter((c) => c !== cur.column).map((c) => '<option value="' + H(c) + '"' + (c === cur.within ? ' selected' : '') + '>' + H(c) + '</option>').join('') + '</select></label></div>';
    h += '<div class="ds-row">' + btn('bind', L('Bind', '結ぶ'), 'ds-btn ds-primary') + '</div>';
    if (b) {
      const pct = b.total ? Math.round(b.resolved / b.total * 100) : 0;
      h += '<div style="margin-top:10px"><b>' + H(L(b.resolved + ' of ' + b.total + ' rows found a place', b.total + ' 行中 ' + b.resolved + ' 行が場所に結び付きました')) + '</b> <span class="ds-muted">(' + pct + '%)</span></div><div class="ds-bar"><span style="width:' + pct + '%"></span></div>';
      const un = b.unresolved.filter((u) => u.why !== 'empty');
      if (un.length) {
        h += '<ul class="ds-un" aria-label="' + H(L('Rows that found no place', '場所に結び付かなかった行')) + '">' + un.slice(0, UNRESOLVED_SHOWN).map((u) => '<li><b>' + H(u.cell) + '</b> <span class="ds-muted">' + H(L('row ', '行 ') + (u.row + 1) + ' · ' + whyText(u.why))
          + (u.candidates && u.candidates.length ? ' — ' + H(u.candidates.map((c) => typeof c === 'string' ? c : (c.name + ' (' + c.iso2 + ')')).join(', ')) : '') + '</span></li>').join('') + '</ul>';
        if (un.length > UNRESOLVED_SHOWN) h += '<div class="ds-muted">' + H(L('…and ' + (un.length - UNRESOLVED_SHOWN) + ' more', '…ほか ' + (un.length - UNRESOLVED_SHOWN) + ' 行')) + '</div>';
        if (un.some((u) => u.why === 'ambiguous')) h += '<div class="ds-muted" style="margin-top:6px">' + H(L('An ambiguous name is left unplaced rather than guessed. For cities, add a country column and narrow by it.', '曖昧な名前は推測せず、場所に結びません。都市なら国の列を加えて絞ってください。')) + '</div>';
      }
    }
    return h + '</div>';
  }
  function colourHtml() {
    const s = S.source, on = !!(S.result && S.result.datasetId);
    let h = '<div class="ds-card"><div class="ds-step"><span class="ds-n' + (on ? '' : ' ds-off') + '">3</span>' + H(L('Colour', '塗り分け')) + '</div>';
    if (!on) return h + '<div class="ds-muted">' + H(L('Once the table is on the map, colour it by a column.', '表が地図に載ったら、列で塗り分けます。')) + '</div></div>';
    const skip = S.binding ? [S.binding.column, S.binding.within] : [];
    const cols = s.table.columns.filter((c) => skip.indexOf(c) < 0);
    const st = S.style || { field: cols[0], mode: numericColumn(cols[0]) ? 'graduated' : 'categorical', method: 'quantile', classes: null };
    const max = (GU() && GU().maxClasses) || null;
    h += '<div class="ds-row"><label class="ds-f">' + H(L('Column', '列')) + '<select data-ds-f="field">' + cols.map((c) => '<option value="' + H(c) + '"' + (c === st.field ? ' selected' : '') + '>' + H(c) + '</option>').join('') + '</select></label></div>'
      + '<div class="ds-seg" role="group" aria-label="' + H(L('Colouring', '塗り方')) + '">' + MODES.map((m) => '<button type="button" data-ds="mode" data-mode="' + m + '" aria-pressed="' + (st.mode === m) + '">' + H(m === 'graduated' ? L('Graduated', '段階') : L('Categories', '分類')) + '</button>').join('') + '</div>';
    if (st.mode === 'graduated') h += '<div class="ds-row"><label class="ds-f">' + H(L('Classes cut by', '区切り方')) + '<select data-ds-f="method">' + METHODS.map((m) => '<option value="' + m + '"' + ((st.method || 'quantile') === m ? ' selected' : '') + '>' + H(m === 'equal' ? L('Equal intervals', '等間隔') : L('Quantiles', '分位')) + '</option>').join('') + '</select></label>'
      + '<label class="ds-f">' + H(L('Number of classes', '階級数')) + '<input type="number" data-ds-f="classes" min="2"' + (max ? ' max="' + Number(max) + '"' : '') + ' value="' + (st.classes != null ? Number(st.classes) : ((S.legend && S.legend.classes.length) || '')) + '"></label></div>';
    h += '<div class="ds-row">' + btn('style', L('Colour the map', '地図を塗る'), 'ds-btn ds-primary') + btn('unstyle', L('One colour', '単色に戻す')) + '</div>';
    const lg = S.legend;
    if (lg && lg.classes && lg.classes.length) {
      const nf = (v) => { try { return Number(v).toLocaleString(IntMapLang.locale(HOST.lang), { maximumFractionDigits: 3 }); } catch (_) { return String(v); } };
      h += '<div style="margin-top:10px">' + lg.classes.map((c) => '<div class="ds-lg"><span class="ds-sw" style="background:' + H(c.color) + '"></span><span style="flex:1">' + H(c.label != null ? c.label : nf(c.from) + ' – ' + nf(c.to)) + '</span><span class="ds-muted">' + H(nf(c.count)) + '</span></div>').join('')
        + (lg.other ? '<div class="ds-lg"><span class="ds-sw" style="background:' + H(lg.other.color) + '"></span><span style="flex:1">' + H(L('Other', 'その他') + ' (' + lg.other.distinct + ')') + '</span><span class="ds-muted">' + H(nf(lg.other.count)) + '</span></div>' : '')
        + (lg.missing && lg.missing.count ? '<div class="ds-lg"><span class="ds-sw" style="background:' + H(lg.missing.color) + '"></span><span style="flex:1">' + H(L('No value', '値なし')) + '</span><span class="ds-muted">' + H(nf(lg.missing.count)) + '</span></div>' : '')
        + (lg.collapsed > 0 ? '<div class="ds-muted">' + H(L('Tied values merged classes', '同値が多く区分が統合されました') + ' (−' + lg.collapsed + ')') + '</div>' : '') + '</div>';
    }
    h += '<div class="ds-muted" style="margin-top:8px">' + H(L('Data: ', 'データ: ') + s.name + (s.author === 'shared-link' ? L(' — shared by the person who sent the link', ' — リンクを送った人が共有') : '')) + '</div>';
    if (S.binding) h += '<div class="ds-muted">' + H(kindGroup(S.binding.kind) === 'city' ? L('Places: GeoNames (CC BY 4.0)', '場所: GeoNames（CC BY 4.0）') : L('Countries: Natural Earth', '国: Natural Earth')) + '</div>';
    return h + '</div>';
  }
  function analyseHtml() {
    const on = !!(S.result && S.result.datasetId);
    return '<div class="ds-card"><div class="ds-step"><span class="ds-n' + (on ? '' : ' ds-off') + '">4</span>' + H(L('Analyse', '分析')) + '</div>'
      + (on ? '<div class="ds-muted">' + H(L('Dataset ', 'データセット ') + S.result.datasetId) + '</div><div class="ds-row">' + btn('gis', L('Data and analysis', 'データと分析'), null, '', 'chart') + btn('atlas', L('Ask Atlas', 'Atlas に聞く'), null, '', 'chat') + '</div>'
        : '<div class="ds-muted">' + H(L('The table becomes a dataset you can filter, join, aggregate and query.', '表は、絞り込み・結合・集計・問い合わせができるデータセットになります。')) + '</div>') + '</div>';
  }
  function publishHtml() {
    const on = !!(S.result && S.result.datasetId);
    let h = '<div class="ds-card"><div class="ds-step"><span class="ds-n' + (on ? '' : ' ds-off') + '">5</span>' + H(L('Publish', '公開')) + '</div>';
    if (!on) return h + '<div class="ds-muted">' + H(L('A link that opens this coloured map — no account, nothing stored on a server.', 'この塗り分け地図を開くリンク。アカウント不要で、サーバには何も保存しません。')) + '</div></div>';
    if (S.packed && S.fits) h += '<div class="ds-muted">' + H(L('Link: ' + S.fits.chars.toLocaleString() + ' characters (Chromium keeps up to ' + S.fits.limit.toLocaleString() + ').', 'リンク: ' + S.fits.chars.toLocaleString() + ' 文字（Chromium の上限 ' + S.fits.limit.toLocaleString() + ' 文字）。')) + '</div>';
    h += '<div class="ds-muted">' + H(L('The link holds the place and the coloured value of every row: whoever has the link can read them.', 'リンクには各行の場所と塗った値が入ります。リンクを受け取った人は、その中身を読めます。')) + '</div>';
    h += '<div class="ds-row">' + btn('link', L('Copy link', 'リンクをコピー'), 'ds-btn ds-primary', S.packed && S.fits && S.fits.fits ? '' : ' disabled', 'link') + btn('postcard', L('Postcard image', '絵葉書画像'), null, '', 'image') + '</div>';
    h += '<div class="ds-row">' + (formats || []).map((f) => btn('export', L('Export ', '書き出し ') + f.toUpperCase(), null, ' data-format="' + H(f) + '"', 'save')).join('') + '</div>';
    if (S.said || S.saidUrl) h += '<div class="ds-said" role="status">' + H(S.said || L('Copy this link:', 'このリンクをコピーしてください:')) + (S.saidUrl ? '<input type="text" readonly aria-label="' + H(L('The link', 'リンク')) + '" value="' + H(S.saidUrl) + '">' : '') + '</div>';
    return h + '</div>';
  }
  function noticeHtml() {
    const s = S.source;
    let body = '';
    if (s && s.author === 'shared-link') body += '<div class="ds-recv"><b>' + H(L('A shared table', '共有された表')) + '</b><div>' + H(L('Opened from a link. The table and its colouring came with it; the shapes are this map\'s own.', 'リンクから開きました。表と塗り方はリンクに入っていたもので、形はこの地図のものです。')) + '</div>' + (s.dropped ? '<div class="ds-muted">' + H(L(s.dropped + ' rows of the link could not be read', 'リンクの ' + s.dropped + ' 行は読めませんでした')) + '</div>' : '') + '</div>';
    if (S.problem) body += '<div class="ds-warn" role="alert">' + H(reasonText(S.problem.why, S.problem.detail)) + '</div>';
    if (S.busy) body += '<div class="ds-muted" role="status" style="margin:0 0 8px">' + H(S.busy) + '</div>';
    return body;
  }
  function render() {
    if (!panel) return;
    const s = S.source;
    panel.innerHTML = '<div class="ds-head"><h2 id="im-datastudio-h">' + H(L('Data studio', 'データスタジオ')) + '</h2>'
      + (s ? '<button type="button" class="ds-icon" data-ds="clear" title="' + H(L('Take the table off the map', '表を地図から外す')) + '" aria-label="' + H(L('Take the table off the map', '表を地図から外す')) + '">' + icon('trash', { size: 16 }) + '</button>' : '')
      + '<button type="button" class="ds-icon" data-ds="close" title="' + H(L('Close', '閉じる')) + '" aria-label="' + H(L('Close the data studio', 'データスタジオを閉じる')) + '">' + icon('close', { size: 16 }) + '</button></div>'
      + '<div class="ds-body">' + noticeHtml() + sourceHtml() + bindHtml() + colourHtml() + analyseHtml() + publishHtml() + '</div>';
  }
  function readForm() {
    const v = (f) => { const el = panel && panel.querySelector('[data-ds-f="' + f + '"]'); return el ? el.value : null; };
    return { column: v('column'), kind: v('kind'), within: v('within') || null, field: v('field'), method: v('method'), classes: v('classes') };
  }
  async function onClick(e) {
    const b = e.target && e.target.closest ? e.target.closest('[data-ds]') : null; if (!b || b.disabled) return;
    const a = b.getAttribute('data-ds'), f = readForm();
    if (a === 'close') { close(); return; }
    if (a === 'clear') { clear(); return; }
    if (a === 'choose') { pickFile(); return; }
    if (a === 'paste') { pasteOpen = !pasteOpen; render(); return; }
    if (a === 'paste-go') { const ta = panel.querySelector('[data-ds-f="paste"]'); const t = ta ? ta.value : ''; if (t.trim()) { pasteOpen = false; await loadText(t); } return; }
    if (a === 'bind') { await bindTo({ column: f.column, kind: f.kind, within: f.kind === 'city' ? f.within : null }); return; }
    if (a === 'mode') { await applyStyle({ field: f.field, mode: b.getAttribute('data-mode'), method: f.method, classes: f.classes }); return; }
    if (a === 'style') { const cur = S.style ? S.style.mode : (numericColumn(f.field) ? 'graduated' : 'categorical'); await applyStyle({ field: f.field, mode: cur, method: f.method, classes: f.classes }); return; }
    if (a === 'unstyle') { await applyStyle(null); return; }
    if (a === 'gis') { const r = await openAnalysis(); if (!r.ok) { S.problem = { why: r.reason }; render(); } return; }
    if (a === 'atlas') { const r = await askAtlas(); if (!r.ok) { S.problem = { why: r.reason }; render(); } return; }
    if (a === 'link') { await copyLink(); return; }
    if (a === 'export') { const r = await exportFile(b.getAttribute('data-format')); S.said = r.ok ? L('Saved ' + r.filename, r.filename + ' を保存しました') : ''; S.saidUrl = ''; if (!r.ok) S.problem = { why: r.reason }; render(); return; }
    if (a === 'postcard') { const r = await postcard(); S.said = r.ok ? L('Saved ' + r.filename, r.filename + ' を保存しました') : ''; S.saidUrl = ''; if (!r.ok) S.problem = { why: r.reason }; render(); return; }
  }
  function onChange(e) {
    const el = e.target, f = el && el.getAttribute && el.getAttribute('data-ds-f'); if (!f) return;
    if (f === 'kind' || f === 'column') {
      /* the city row's narrowing control appears and goes with the kind; nothing is bound until «Bind» */
      const cur = readForm(); S.binding = null; S.detected = S.detected ? Object.assign({}, S.detected, { key: cur.column, kind: cur.kind, within: cur.kind === 'city' ? (S.detected.within || null) : null }) : { columns: [], key: cur.column, kind: cur.kind, within: null };
      render();
    }
  }
  function pickFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.style.display = 'none';
    try { inp.setAttribute('aria-label', L('Choose a table file', '表のファイルを選ぶ')); } catch (_) { }
    inp.addEventListener('change', () => { const fs = inp.files; if (fs && fs.length) loadFiles(fs, 'file'); inp.remove(); });
    document.body.appendChild(inp); inp.click();
  }
  function onDrag(e) {
    const zone = e.target && e.target.closest ? e.target.closest('[data-ds-drop]') : null; if (!zone) return;
    if (!(e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0)) return;
    e.preventDefault();
    const d = zone.querySelector('.ds-drop'); if (d) d.classList.toggle('ds-over', e.type === 'dragover');
    if (e.type === 'drop' && e.dataTransfer.files && e.dataTransfer.files.length) loadFiles(e.dataTransfer.files, 'file');
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

  function open() {
    style();
    if (!panel) {
      panel = document.createElement('section'); panel.id = 'im-datastudio';
      panel.setAttribute('role', 'region'); panel.setAttribute('aria-labelledby', 'im-datastudio-h');
      panel.addEventListener('click', onClick); panel.addEventListener('change', onChange); panel.addEventListener('keydown', onKey);
      ['dragover', 'dragleave', 'drop'].forEach((t) => panel.addEventListener(t, onDrag));
      document.body.appendChild(panel);
      if (!formats) exportFormats().then((f) => { formats = f; render(); });
    }
    render();
    return true;
  }
  function close() { if (panel) { panel.remove(); panel = null; } S.said = ''; S.saidUrl = ''; return true; }
  try { bus.on('intmap-lang', () => { if (panel) render(); }); } catch (_) { }

  /** everything Atlas and the observer may know (the counts, the columns, the choices — not the table) */
  function state() {
    const U = GU(), id = S.result && S.result.datasetId;
    let drawn = false; try { drawn = !!(U && id && U.find(id)); } catch (_) { drawn = false; }
    const b = S.binding;
    return {
      loaded: true, open: !!panel,
      source: S.source ? { name: S.source.name, rows: S.source.rows, columns: S.source.table.columns.slice(), from: S.source.from, author: S.source.author, placed: !!S.source.placed, sheet: S.source.sheet || null } : null,
      detected: S.detected ? { key: S.detected.key, kind: S.detected.kind, within: S.detected.within,
        columns: (S.detected.columns || []).filter((c) => c.kind).map((c) => ({ name: c.name, kind: c.kind, ratio: +c.ratio.toFixed(3) })) } : null,
      binding: b ? { column: b.column, kind: b.kind, within: b.within || null, resolved: b.resolved, total: b.total,
        unresolved: b.unresolved.filter((u) => u.why !== 'empty').length, sample: b.unresolved.filter((u) => u.why !== 'empty').slice(0, 10) } : null,
      style: S.style ? Object.assign({}, S.style) : null,
      legend: S.legend ? { classes: S.legend.classes.length, collapsed: S.legend.collapsed || 0, missing: S.legend.missing ? S.legend.missing.count : 0 } : null,
      datasetId: id || null, drawn,
      link: S.packed && S.fits ? { chars: S.fits.chars, limit: S.fits.limit, fits: S.fits.fits } : null,
      problem: S.problem ? { why: S.problem.why, text: reasonText(S.problem.why, S.problem.detail) } : null,
    };
  }

  return {
    open, close, isOpen: () => !!panel, state, receive, loadFiles, loadText, loadAttachment,
    bind: (c) => bindTo(c), style: (s) => applyStyle(s), clear, link, copyLink, exportFile, postcard, openAnalysis, askAtlas, reasonText,
  };
}
