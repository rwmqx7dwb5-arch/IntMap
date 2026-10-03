/* ============================================================================
 *  IntMap · THE COMPANY FOOTPRINT — every company's sites at once, read from the land   (IntMapCompanyFootprint)
 * ----------------------------------------------------------------------------
 *  The company atlas answered «where is this company?» (js/company-panel.js + js/company-facilities.js: one
 *  profile, its sites). It could not answer the reader's other question — «who is HERE?»: which of the companies
 *  IntMap carries have a factory in this valley, a refinery on this coast, a data centre in this country, and which
 *  industry owns the map of a region. That reading needs every company's sites at once, and the profiles hold one
 *  company each (533 files, 3.8 MB). data/companies/footprint.json is their index — derived from the profiles by
 *  scripts/companies/footprint.mjs, held to them by scripts/companies-audit.mjs ㉒ — and this module draws it and
 *  reads it.
 *
 *  ── WHAT IT DOES ──────────────────────────────────────────────────────────────────────────────────────────────
 *    · draws all 4,466 published sites, clustered, coloured by the company atlas's six groups (js/company-data.js
 *      owns the colours, the group of a type and every word for a type — none is written here);
 *    · a card on the map: the groups as switches with their counts, the sector, and «in view» — the companies and
 *      countries with sites inside the part of the world on screen, recounted when the camera settles. Choosing a
 *      company opens its profile (the kernel's `company.open`, the door Atlas and the Companies tab use);
 *    · `query()` — the same reading without drawing, for Atlas (`company.footprint`): by country, by group or type,
 *      by sector, by a box.
 *  ── WHAT IT DOES NOT ──────────────────────────────────────────────────────────────────────────────────────────
 *    · move the camera (CONSTITUTION §3) — opening it shows what is already in view;
 *    · claim the world: the card says, every time, that these are the sites the sources publish for the companies
 *      IntMap carries — an empty valley on this map is not an empty valley on the ground (docs/COMPANIES.md §1);
 *    · show a city- or region-precision point as a site: the card says which the point is (docs/COMPANIES.md §5.2).
 *  The pure half (expand / select / tally / inBox) is exported for node (tests/ux-next-checks.test.mjs).
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { IntMapTables } from './tables.js';
import { icon } from './icons.js';
import { jsonWithin } from './fetch-deadline.js';
import './safe-html.js';

const FOOTPRINT_URL = 'data/companies/footprint.json';
const PRECISIONS = ['exact', 'city', 'region'];   /* the order scripts/companies/footprint.mjs writes them in */

/* ══ THE PURE HALF ═══════════════════════════════════════════════════════════════════════════════════════════ */
/** the compact file → one object per site. `groupOf(type)` and `companyOf(id)` are handed in (js/company-data.js). */
export function expand(fp, groupOf, companyOf) {
  if (!fp || !Array.isArray(fp.f)) return [];
  const g = typeof groupOf === 'function' ? groupOf : () => 'other';
  const co = typeof companyOf === 'function' ? companyOf : () => null;
  return fp.f.map((r, i) => {
    const cid = fp.companies[r[0]], type = fp.types[r[1]], c = co(cid) || {};
    return { i, cid, cname: c.n || cid, sec: c.sec || 'other', type, group: g(type), lon: +r[2], lat: +r[3], cc: r[4] || '', precision: PRECISIONS[r[5]] || 'exact', status: fp.statuses[r[6]] || 'operating', name: r[7] || '' };
  });
}
/** is (lon,lat) inside [w,s,e,n]? The box may run past ±180 (a camera over the Pacific) — it is unwrapped, not clipped. */
export function inBox(lon, lat, b) {
  if (!b) return true;
  const [w, s, e, n] = b;
  if (lat < s || lat > n) return false;
  if (e - w >= 360) return true;
  let x = lon; while (x < w) x += 360; while (x > w + 360) x -= 360;
  return x <= e;
}
/** the sites that match: groups / types / sectors (arrays — empty or absent = all), cc (ISO-3), box [w,s,e,n] */
export function select(rows, q) {
  const o = q || {};
  const set = (a) => (Array.isArray(a) && a.length ? new Set(a.map(String)) : null);
  const G = set(o.groups), T = set(o.types), S = set(o.sectors), C = set(o.cc ? [].concat(o.cc).map((x) => String(x).toUpperCase()) : null);
  return rows.filter((r) => (!G || G.has(r.group)) && (!T || T.has(r.type)) && (!S || S.has(r.sec)) && (!C || C.has(r.cc)) && inBox(r.lon, r.lat, o.box));
}
/** the counts a reader asks of a set of sites: by company (with its groups), by country, by group, by type */
export function tally(rows) {
  const by = (key) => { const m = new Map(); rows.forEach((r) => { const k = key(r); m.set(k, (m.get(k) || 0) + 1); }); return m; };
  const companies = new Map();
  rows.forEach((r) => {
    let c = companies.get(r.cid); if (!c) { c = { id: r.cid, name: r.cname, sec: r.sec, n: 0, groups: {}, types: {}, countries: new Set() }; companies.set(r.cid, c); }
    c.n++; c.groups[r.group] = (c.groups[r.group] || 0) + 1; c.types[r.type] = (c.types[r.type] || 0) + 1; c.countries.add(r.cc);
  });
  const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return {
    sites: rows.length,
    companies: [...companies.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((c) => Object.assign(c, { countries: c.countries.size })),
    countries: sorted(by((r) => r.cc)).filter(([k]) => k).map(([cc, n]) => ({ cc, n })),
    groups: Object.fromEntries(sorted(by((r) => r.group))),
    types: Object.fromEntries(sorted(by((r) => r.type))),
  };
}

/* ══ THE APP HALF ════════════════════════════════════════════════════════════════════════════════════════════ */
export function companyFootprint(HOST) {
  const GE = () => IntMapGeoEngine;
  const L = IntMapLang.pick(() => HOST.lang);
  const t = (en, jp) => IntMapLang.t(HOST.lang, en, jp);
  const H = (v) => globalThis.IntMapSafe.html(v == null ? '' : String(v));
  const CD = () => window.IntMapCompanyData;

  let _fp = null, _rows = null, _loadP = null;
  let _groups = null, _sectors = null, _shown = false, _wired = false, _styleT = 0, _moveT = 0, _popup = null;

  function load() {
    if (_rows) return Promise.resolve(_rows);
    if (_loadP) return _loadP;
    _loadP = Promise.all([
      /* same-origin, 271 kB (92 kB gzipped, measured 2026-10-03): bounded by the longest SILENCE (idle clock), not the
         total, so a slow body that keeps arriving is never cut. 20 s of silence is an ESTIMATE of «the link is dead, not
         slow» for a static file; revisit if the file grows past ~1 MB. A timeout is reported, and the next ask retries. */
      jsonWithin(FOOTPRINT_URL, 20000, undefined, { idle: true }),
      CD().index(),
    ]).then(([fp]) => {
      _fp = fp;
      _rows = expand(fp, (type) => { try { return CD().groupOf({ type }); } catch (_) { return 'other'; } }, (id) => CD().get(id));
      return _rows;
    }).catch((e) => { _loadP = null; throw e; });   /* a failed fetch is not «no sites» — the next ask retries */
    return _loadP;
  }
  const GROUPS = () => { try { return CD().GROUPS.slice(); } catch (_) { return ['hq', 'office', 'factory', 'rnd', 'logistics', 'other']; } };
  const gColor = (g) => { try { return CD().groupColor(g); } catch (_) { return '#8e8e93'; } };
  const gLabel = (g) => { try { return CD().groupLabel(g); } catch (_) { return g; } };
  const tLabel = (ty) => { try { return CD().typeLabel(ty); } catch (_) { return ty; } };
  const secLabel = (s) => { try { const v = IntMapTables.CO_SECTORS[s]; return v ? L.arr(v) : s; } catch (_) { return s; } };
  const ccName = (cc) => { try { const s = HOST.countryStats && HOST.countryStats[cc]; const n = s && HOST.cName(s); return (n && n !== '—') ? n : cc; } catch (_) { return cc; } };
  const coName = (c) => { const r = CD() && CD().get(c.id); return (HOST.lang === 'jp' && r && r.loc && r.loc.ja) ? r.loc.ja : c.name; };

  /* ─── the map: one clustered source, three layers ─────────────────────────────────────────────────────────── */
  const SRC = 'co-fp-src', CLU = 'co-fp-cluster', CNT = 'co-fp-count', PT = 'co-fp-pt';
  const visible = () => select(_rows || [], { groups: _groups, sectors: _sectors });
  const fc = () => ({ type: 'FeatureCollection', features: visible().map((r) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lon, r.lat] }, properties: { i: r.i, group: r.group } })) });
  const canDraw = () => { try { return !!HOST.canDraw(); } catch (_) { try { return !!GE().ready(); } catch (__) { return false; } } };
  const before = () => { try { return GE().layers.has('tool-poly') ? 'tool-poly' : undefined; } catch (_) { return undefined; } };
  function ensure() {
    if (!canDraw()) return false;
    try {
      /* clustering happens in the source, so a filter is applied by re-deriving the collection (push), never by a
         layer filter alone — a disc reading «12» must count the sites that are on the map (js/company-facilities.js) */
      if (!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC, { type: 'geojson', data: fc(), cluster: true, clusterRadius: 44, clusterMaxZoom: 8 });
      if (!GE().layers.has(CLU)) GE().layers.add({ id: CLU, type: 'circle', source: SRC, filter: ['has', 'point_count'], paint: {
        'circle-radius': ['step', ['get', 'point_count'], 12, 10, 16, 50, 21, 200, 27],
        'circle-color': 'rgba(94,92,230,0.82)', 'circle-stroke-color': 'rgba(255,255,255,0.9)', 'circle-stroke-width': 1.2 } }, before());
      if (!GE().layers.has(CNT)) GE().layers.add({ id: CNT, type: 'symbol', source: SRC, filter: ['has', 'point_count'], layout: {
        'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['literal', ['Noto Sans Regular']], 'text-allow-overlap': true, 'text-ignore-placement': true },
        paint: { 'text-color': '#ffffff' } }, before());
      if (!GE().layers.has(PT)) GE().layers.add({ id: PT, type: 'circle', source: SRC, filter: ['!', ['has', 'point_count']], paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 8, 5, 14, 8],
        'circle-color': ['match', ['get', 'group']].concat(GROUPS().reduce((a, g) => a.concat([g, gColor(g)]), []), [gColor('other')]),
        'circle-opacity': 0.92, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } }, before());
      /* the source is claimed under the effect key Atlas's `data.companySites` declares, so its verdict asks the renderer */
      try { GE().render.claim(SRC, 'map.companySites', { clear: close }); } catch (_) { }
      return GE().layers.has(PT);
    } catch (_) { return false; }
  }
  const push = () => { try { GE().layers.setSourceData(SRC, fc()); } catch (_) { } };

  /* ─── the site card (a map popup — the app's place-popup look) ──────────────────────────────────────────────── */
  function siteCard(r, lngLat) {
    try { if (_popup) _popup.remove(); } catch (_) { }
    const note = r.precision === 'city' ? t('The source names only the city: this is the city’s point, not the site.', '出典は市までしか示していません。この点は市の代表点で、施設の位置ではありません。')
      : r.precision === 'region' ? t('The source names only the region: this is the region’s point, not the site.', '出典は地域までしか示していません。この点は地域の代表点で、施設の位置ではありません。') : '';
    const html = '<div class="cfp-site"><div class="cfp-site-h"><span class="cfp-dot" style="background:' + H(gColor(r.group)) + '"></span><b>' + H(r.name || tLabel(r.type)) + '</b></div>'
      + '<div class="cfp-site-s">' + H(tLabel(r.type)) + ' · ' + H(ccName(r.cc)) + '</div>'
      + '<button type="button" class="cfp-open" data-cid="' + H(r.cid) + '">' + H(coName({ id: r.cid, name: r.cname })) + ' — ' + H(t('open the company', '企業を開く')) + '</button>'
      + (note ? '<div class="cfp-note">' + H(note) + '</div>' : '') + '</div>';
    try {
      _popup = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, maxWidth: '280px', className: 'plc-popup', offset: 8 }).setLngLat(lngLat).setHTML(html));
      const el = _popup.getElement && _popup.getElement();
      const b = el && el.querySelector('.cfp-open'); if (b) b.addEventListener('click', () => openCompany(r.cid));
    } catch (_) { }
  }
  function openCompany(cid) { try { window.IntMapOS.exec('company.open', { source: 'ui', params: { company: cid } }); } catch (_) { } }

  /* ─── listeners (GE().events.onLayer returns nothing: every registration is remembered and handed back) ────── */
  const regs = [];
  const onLayer = (type, layer, cb) => { try { GE().events.onLayer(type, layer, cb); regs.push({ k: 'l', type, layer, cb }); } catch (_) { } };
  const on = (type, cb) => { try { GE().events.on(type, cb); regs.push({ k: 'm', type, cb }); } catch (_) { } };
  const cursor = (v) => { try { GE().render.setCursor(v); } catch (_) { } };
  function wire() {
    if (_wired) return; _wired = true;
    onLayer('click', PT, (e) => { const f = e && e.features && e.features[0]; const r = f && _rows && _rows[+f.properties.i]; if (r) siteCard(r, { lng: r.lon, lat: r.lat }); });
    /* a cluster is opened by the reader, so the camera moves because a person asked it to */
    onLayer('click', CLU, (e) => { const f = e && e.features && e.features[0]; const c = f && f.geometry && f.geometry.coordinates; if (!c) return;
      try { GE().camera.easeTo({ center: { lng: c[0], lat: c[1] }, zoom: Math.min(14, (+GE().camera.getZoom() || 2) + 2), duration: 600 }); } catch (_) { } });
    ['mouseenter', 'mouseleave'].forEach((ev) => [PT, CLU].forEach((ly) => onLayer(ev, ly, () => cursor(ev === 'mouseenter' ? 'pointer' : ''))));
    on('styledata', () => { if (!_shown) return; clearTimeout(_styleT); _styleT = setTimeout(() => { if (_shown && ensure()) push(); }, 90); });
    on('moveend', () => { if (!_shown) return; clearTimeout(_moveT); _moveT = setTimeout(paintView, 200); });
  }
  function unwire() { _wired = false; regs.splice(0).forEach((r) => { try { if (r.k === 'l') GE().events.offLayer(r.type, r.layer, r.cb); else GE().events.off(r.type, r.cb); } catch (_) { } }); }

  /* ─── the card on the map ───────────────────────────────────────────────────────────────────────────────── */
  function viewBox() {
    try { const b = GE().camera.getBounds(); const w = b.getWest(), e = b.getEast(); return [w, Math.max(-90, b.getSouth()), e, Math.min(90, b.getNorth())]; } catch (_) { return null; }
  }
  let panel = null;
  function buildPanel() {
    if (panel && panel.isConnected) return panel;
    style();
    panel = document.createElement('section'); panel.id = 'co-fp-panel'; panel.setAttribute('aria-labelledby', 'cfp-title');
    (document.getElementById('map-container') || document.body).appendChild(panel);
    panel.addEventListener('click', (e) => {
      const el = /** @type {Element} */ (e.target);
      const g = el.closest('[data-cfp-group]'); if (g) { toggleGroup(g.getAttribute('data-cfp-group')); return; }
      const c = el.closest('[data-cfp-co]'); if (c) { openCompany(c.getAttribute('data-cfp-co')); return; }
      if (el.closest('.cfp-x')) close();
    });
    panel.addEventListener('change', (e) => { const s = /** @type {HTMLSelectElement} */ (e.target); if (s && s.classList.contains('cfp-sec')) setFilter({ sectors: s.value ? [s.value] : null }); });
    return panel;
  }
  function paintPanel() {
    if (!panel || !_rows) return;
    const all = select(_rows, { sectors: _sectors }), byG = tally(all).groups;
    const secs = [...new Set(_rows.map((r) => r.sec))].sort((a, b) => secLabel(a).localeCompare(secLabel(b)));
    const nCo = new Set(_rows.map((r) => r.cid)).size;
    panel.innerHTML = '<div class="cfp-head"><h2 id="cfp-title">' + icon('city', { size: 16 }) + ' ' + H(t('Company sites', '企業の拠点')) + '</h2>'
      + '<button type="button" class="cfp-x" aria-label="' + H(t('Close', '閉じる')) + '">' + icon('close', { size: 16 }) + '</button></div>'
      + '<p class="cfp-sub">' + H(t(_rows.length.toLocaleString('en') + ' sites of ' + nCo + ' companies · profiles of ' + (_fp.generatedAt || '—'),
        nCo + ' 社の拠点 ' + _rows.length.toLocaleString('ja') + ' か所 · プロフィール ' + (_fp.generatedAt || '—') + ' 時点')) + '</p>'
      + '<div class="cfp-groups" role="group" aria-label="' + H(t('Kinds of site', '拠点の種類')) + '">'
      + GROUPS().map((g) => { const on = !_groups || _groups.indexOf(g) >= 0;
        return '<button type="button" class="cfp-g' + H(on ? ' on' : '') + '" aria-pressed="' + H(String(on)) + '" data-cfp-group="' + H(g) + '"><span class="cfp-dot" style="background:' + H(gColor(g)) + '"></span>' + H(gLabel(g)) + ' <span class="cfp-n">' + H(byG[g] || 0) + '</span></button>'; }).join('')
      + '</div>'
      + '<label class="cfp-row">' + H(t('Sector', '業種')) + ' <select class="cfp-sec"><option value="">' + H(t('All sectors', 'すべての業種')) + '</option>'
      + secs.map((s) => '<option value="' + H(s) + '"' + (_sectors && _sectors[0] === s ? ' selected' : '') + '>' + H(secLabel(s)) + '</option>').join('') + '</select></label>'
      + '<div class="cfp-view" aria-live="polite"></div>'
      + '<p class="cfp-honest">' + H(t('Only the sites the sources publish, for the companies IntMap carries — an empty place on this map is not an empty place on the ground.',
        'IntMap が載せている企業について、出典が公表している拠点だけです。この地図で空いている場所が、実際に空いているとは限りません。')) + '</p>';
    paintView();
  }
  function paintView() {
    if (!panel || !_rows) return;
    const box = viewBox(), here = select(_rows, { groups: _groups, sectors: _sectors, box }), T = tally(here);
    const v = panel.querySelector('.cfp-view'); if (!v) return;
    v.innerHTML = '<div class="cfp-vh">' + H(t('In view: ' + T.sites + ' sites · ' + T.companies.length + ' companies', '表示範囲: ' + T.sites + ' か所 · ' + T.companies.length + ' 社')) + '</div>'
      + (T.companies.length ? '<ol class="cfp-list">' + T.companies.slice(0, 8).map((c) => '<li><button type="button" data-cfp-co="' + H(c.id) + '"><span class="cfp-co">' + H(coName(c)) + '</span>'
        + '<span class="cfp-bar">' + GROUPS().filter((g) => c.groups[g]).map((g) => '<span style="flex:' + H(c.groups[g]) + ';background:' + H(gColor(g)) + '" title="' + H(gLabel(g) + ' ' + c.groups[g]) + '"></span>').join('') + '</span>'
        + '<span class="cfp-n">' + H(c.n) + '</span></button></li>').join('') + '</ol>' : '<p class="cfp-sub">' + H(t('No published site of these companies in view.', '表示範囲に、これらの企業の公表された拠点はありません。')) + '</p>')
      + (T.countries.length > 1 ? '<div class="cfp-ccs">' + T.countries.slice(0, 6).map((c) => H(ccName(c.cc)) + ' <b>' + H(c.n) + '</b>').join(' · ') + '</div>' : '');
  }

  /* ─── the doors ─────────────────────────────────────────────────────────────────────────────────────────── */
  function toggleGroup(g) {
    const all = GROUPS(); let cur = _groups ? _groups.slice() : all.slice();
    cur = cur.indexOf(g) >= 0 ? cur.filter((x) => x !== g) : cur.concat([g]);
    setFilter({ groups: cur.length === all.length ? null : cur });
  }
  function setFilter(o) {
    if (o && o.groups !== undefined) _groups = (Array.isArray(o.groups) && o.groups.length) ? GROUPS().filter((g) => o.groups.indexOf(g) >= 0) : null;
    if (o && o.sectors !== undefined) _sectors = (Array.isArray(o.sectors) && o.sectors.length) ? o.sectors.map(String) : null;
    if (_shown) { push(); paintPanel(); }
    return state();
  }
  /** open({groups?, sectors?}) — draws every site and the card. Never moves the camera. → state() */
  async function open(o) {
    await window.IntMapLazy.need('companyData');
    await load();
    _shown = true;
    if (o) setFilter(o);
    if (!ensure()) { try { GE().events.once('idle', () => { if (_shown && ensure()) push(); }); } catch (_) { } } else push();
    wire(); buildPanel(); paintPanel();
    return state();
  }
  function close() {
    _shown = false; clearTimeout(_styleT); clearTimeout(_moveT); unwire();
    try { if (_popup) _popup.remove(); } catch (_) { } _popup = null;
    [PT, CNT, CLU].forEach((id) => { try { if (GE().layers.has(id)) GE().layers.remove(id); } catch (_) { } });
    try { if (GE().layers.hasSource(SRC)) GE().layers.removeSource(SRC); } catch (_) { }
    try { if (panel) panel.remove(); } catch (_) { } panel = null;
    return true;
  }
  /** query({cc?, groups?, types?, sectors?, box?, limit?}) — the reading, without drawing. Countries named by ISO-3. */
  async function query(q) {
    await window.IntMapLazy.need('companyData');
    await load();
    const o = q || {}, lim = Math.max(1, Math.min(50, +o.limit || 15));
    const T = tally(select(_rows, o));
    return { generatedAt: _fp.generatedAt, of: { sites: _rows.length, companies: _fp.companies.length },
      sites: T.sites, totalCompanies: T.companies.length, groups: T.groups, types: T.types, countries: T.countries.slice(0, lim),
      companies: T.companies.slice(0, lim).map((c) => ({ id: c.id, name: c.name, sector: c.sec, sites: c.n, groups: c.groups, types: c.types, countries: c.countries })) };
  }
  function state() {
    if (!_shown || !_rows) return { shown: false };
    return { shown: true, groups: _groups ? _groups.slice() : GROUPS(), sectors: _sectors ? _sectors.slice() : null, drawn: visible().length, of: _rows.length, layers: { source: SRC, cluster: CLU, count: CNT, point: PT } };
  }

  /* ─── the look ──────────────────────────────────────────────────────────────────────────────────────────── */
  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const st = document.createElement('style'); st.id = 'co-fp-css'; st.textContent = [
      '#co-fp-panel{position:absolute;left:12px;top:64px;z-index:var(--z-dropdown);width:min(330px,calc(100% - 24px));max-height:calc(100% - 140px);overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;padding:12px 14px 12px;border-radius:16px;background:var(--popup-bg);color:var(--text-main);border:1px solid rgba(128,128,128,0.2);box-shadow:var(--shadow);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);font-size:12.5px;}',
      '#co-fp-panel .cfp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
      '#co-fp-panel h2{display:flex;align-items:center;gap:6px;margin:0;font-size:15px;font-weight:700;}',
      '#co-fp-panel .cfp-x{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:none;border-radius:50%;background:var(--input-bg);color:var(--text-main);cursor:pointer;}',
      '#co-fp-panel .cfp-sub{margin:4px 0 8px;color:var(--text-muted);font-size:11.5px;}',
      '#co-fp-panel .cfp-groups{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;}',
      '#co-fp-panel .cfp-g{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:0 9px;border-radius:999px;border:1px solid rgba(128,128,128,0.25);background:transparent;color:var(--text-muted);font:inherit;font-size:11.5px;cursor:pointer;}',
      '#co-fp-panel .cfp-g.on{background:var(--input-bg);color:var(--text-main);border-color:rgba(128,128,128,0.4);}',
      '#co-fp-panel .cfp-g:not(.on) .cfp-dot{opacity:0.3;}',
      '.cfp-dot{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none;}',
      '#co-fp-panel .cfp-n{color:var(--text-muted);font-variant-numeric:tabular-nums;}',
      '#co-fp-panel .cfp-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;color:var(--text-muted);}',
      '#co-fp-panel select{min-height:30px;max-width:200px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);font:inherit;}',
      '#co-fp-panel .cfp-vh{font-weight:600;margin:4px 0 4px;}',
      '#co-fp-panel .cfp-list{list-style:none;margin:0;padding:0;}',
      '#co-fp-panel .cfp-list button{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:4px 6px;border:none;border-radius:8px;background:transparent;color:var(--text-main);font:inherit;text-align:left;cursor:pointer;}',
      '#co-fp-panel .cfp-list button:hover{background:var(--input-bg);}',
      '#co-fp-panel .cfp-co{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#co-fp-panel .cfp-bar{display:flex;width:64px;height:6px;border-radius:3px;overflow:hidden;background:rgba(128,128,128,0.2);flex:none;}',
      '#co-fp-panel .cfp-ccs{margin-top:6px;color:var(--text-muted);font-size:11.5px;}',
      '#co-fp-panel .cfp-honest{margin:8px 0 0;color:var(--text-muted);font-size:10.5px;line-height:1.5;}',
      '.cfp-site-h{display:flex;align-items:center;gap:7px;font-size:13px;padding-right:22px;}',
      '.cfp-site-s{margin:3px 0 8px;color:var(--text-muted);font-size:11.5px;}',
      '.cfp-open{display:block;width:100%;min-height:32px;padding:6px 9px;border:none;border-radius:8px;background:var(--input-bg);color:var(--text-main);font:inherit;font-size:11.5px;font-weight:600;text-align:left;cursor:pointer;}',
      '.cfp-note{margin-top:7px;color:var(--text-muted);font-size:10px;line-height:1.5;}',
      '@media (max-width:640px){#co-fp-panel{left:8px;right:8px;top:auto;bottom:calc(var(--sheet-cover, 20px) + 12px);width:auto;max-height:42vh;}}',
    ].join('\n');
    document.head.appendChild(st);
  }

  const API = { open, close, query, setFilter, state, isShown: () => !!_shown };
  return API;
}
