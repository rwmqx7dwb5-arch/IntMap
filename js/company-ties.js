/* ============================================================================
 *  IntMap · COMPANIES BETWEEN COUNTRIES — whose companies operate where   (IntMapCompanyTies)
 * ----------------------------------------------------------------------------
 *  The company atlas answered «where is this company?» (one profile, js/company-panel.js) and «who is here?» (every
 *  site in a place, js/company-footprint.js). Neither answers the question a reporter, an analyst or a student of the
 *  world economy actually asks of a country: WHOSE companies run the factories, offices and laboratories here, and
 *  WHERE do this country's own companies operate abroad. That is a reading of PAIRS — the country a company is
 *  headquartered in against the country each of its published sites stands in — and the two facts are already in
 *  hand: the index's `cc` (the company's own country) and the footprint's `cc` (the site's country). This module
 *  reads the footprint's rows (js/company-footprint.js `rows()` — one fetch, one copy) by those pairs.
 *
 *  ── WHAT IT DOES ──────────────────────────────────────────────────────────────────────────────────────────────
 *    · one country, two directions: «abroad» — the countries where companies headquartered here publish sites, and
 *      the share of their sites that are abroad; «here» — the home countries of the companies with sites here, and
 *      the share of the sites here that belong to companies from elsewhere;
 *    · no country: the network itself — every country pair joined by at least one company's published site;
 *    · draws the partner countries shaded by how many companies join them to the chosen one, and a great-circle line
 *      from home to host for each pair (js/routing-ops.js `greatCircleLine` — the one densifier), both claimed under
 *      'map.companyTies' so Atlas's verdict asks the renderer;
 *    · narrows by kind of site (factories only, research only …) and by sector, with the company atlas's own words.
 *  ── WHAT IT DOES NOT ──────────────────────────────────────────────────────────────────────────────────────────
 *    · claim investment statistics: these are the sites the sources publish for the companies IntMap carries — a
 *      pair with no line is not a pair with no investment (docs/COMPANIES.md §1). The card says so every time;
 *    · move the camera (CONSTITUTION §3);
 *    · invent a country's position: a line is drawn between the label points Natural Earth publishes for the two
 *      countries (`countryStats[cc].latlng`); a pair whose country has none is listed and counted as not drawn.
 *  The pure half (between / ties / network / pairLine) is exported for node (tests/wave4-companies-checks.test.mjs).
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { IntMapTables } from './tables.js';
import { icon } from './icons.js';
import { select } from './company-footprint.js';
import { greatCircleLine, countryOutlines } from './routing-ops.js';
import './safe-html.js';

/* ══ THE PURE HALF ═══════════════════════════════════════════════════════════════════════════════════════════ */
/** the sites that can be read as a pair: both countries known, narrowed by groups / sectors (js/company-footprint.js select) */
export function between(rows, q) {
  const o = q || {};
  return select(rows || [], { groups: o.groups, sectors: o.sectors, types: o.types }).filter((r) => r.home && r.cc);
}
const share = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
function agg(list, keyOf) {
  const m = new Map();
  list.forEach((r) => {
    const k = keyOf(r); let p = m.get(k);
    if (!p) { p = { cc: k, sites: 0, groups: {}, _co: new Map() }; m.set(k, p); }
    p.sites++; p.groups[r.group] = (p.groups[r.group] || 0) + 1;
    const c = p._co.get(r.cid); if (c) c.sites++; else p._co.set(r.cid, { id: r.cid, name: r.cname, sec: r.sec, sites: 1 });
  });
  return [...m.values()].map((p) => {
    const companies = [...p._co.values()].sort((a, b) => b.sites - a.sites || a.name.localeCompare(b.name));
    return { cc: p.cc, sites: p.sites, groups: p.groups, nCompanies: companies.length, companies };
  }).sort((a, b) => b.nCompanies - a.nCompanies || b.sites - a.sites || a.cc.localeCompare(b.cc));
}
const nCo = (list) => new Set(list.map((r) => r.cid)).size;
/** one country's ties. dir 'out' = where companies headquartered in `cc` publish sites abroad;
    dir 'in' = whose companies publish sites in `cc`. Shares are of the sites in the reading, to one decimal. */
export function ties(rows, cc, dir) {
  const C = String(cc || '').toUpperCase(), out = dir !== 'in';
  const mine = (rows || []).filter((r) => (out ? r.home === C : r.cc === C));
  const domestic = mine.filter((r) => r.home === r.cc), cross = mine.filter((r) => r.home !== r.cc);
  return {
    cc: C, dir: out ? 'out' : 'in', sites: mine.length, companies: nCo(mine),
    domestic: { sites: domestic.length, companies: nCo(domestic) },
    cross: { sites: cross.length, companies: nCo(cross), share: share(cross.length, mine.length) },
    partners: agg(cross, (r) => (out ? r.cc : r.home)),
  };
}
/** every cross-border pair: from = the company's home, to = the site's country */
export function network(rows) {
  const cross = (rows || []).filter((r) => r.home !== r.cc);
  const m = new Map();
  cross.forEach((r) => { const k = r.home + '>' + r.cc; let p = m.get(k); if (!p) { p = []; m.set(k, p); } p.push(r); });
  const pairs = [...m.entries()].map(([k, list]) => { const [from, to] = k.split('>'); return { from, to, sites: list.length, nCompanies: nCo(list), companies: agg(list, () => k)[0].companies }; })
    .sort((a, b) => b.nCompanies - a.nCompanies || b.sites - a.sites || (a.from + a.to).localeCompare(b.from + b.to));
  return { sites: (rows || []).length, cross: { sites: cross.length, companies: nCo(cross), share: share(cross.length, (rows || []).length) }, pairs };
}
/** the countries a reader can choose: every home and every host in the rows, with how many sites each holds either way */
export function countriesOf(rows) {
  const m = new Map(); (rows || []).forEach((r) => { [r.home, r.cc].forEach((k) => { if (k) m.set(k, (m.get(k) || 0) + 1); }); });
  return [...m.keys()];
}
/* the longest piece of a drawn pair line: 200 km keeps a 10,000 km arc smooth at world zoom (50 pieces) and is the
   order of the shortest pair in the file (neighbouring countries' label points). An estimate of «looks like a curve». */
const ARC_STEP_M = 200000;
/** the great-circle line between two [lon,lat] points, or null when either is missing */
export function pairLine(a, b) {
  if (!a || !b || !isFinite(a[0]) || !isFinite(a[1]) || !isFinite(b[0]) || !isFinite(b[1])) return null;
  if (a[0] === b[0] && a[1] === b[1]) return null;
  return greatCircleLine([a, b], ARC_STEP_M);
}

/* ══ THE APP HALF ════════════════════════════════════════════════════════════════════════════════════════════ */
export function companyTies(HOST) {
  const GE = () => IntMapGeoEngine;
  const t = IntMapLang.pick(() => HOST.lang);
  const H = (v) => globalThis.IntMapSafe.html(v == null ? '' : String(v));
  const CD = () => window.IntMapCompanyData;
  const FP = () => window.IntMapCompanyFootprint;

  let _src = null, _shown = false, _wired = false, _styleT = 0, _popup = null;
  let _cc = null, _dir = 'in', _groups = null, _sectors = null, _open = null;

  async function load() {
    if (_src) return _src;
    await window.IntMapLazy.need('companyFootprint');
    _src = await FP().rows();
    return _src;
  }
  const GROUPS = () => { try { return CD().GROUPS.slice(); } catch (_) { return ['hq', 'office', 'factory', 'rnd', 'logistics', 'other']; } };
  const gColor = (g) => { try { return CD().groupColor(g); } catch (_) { return '#8e8e93'; } };
  const gLabel = (g) => { try { return CD().groupLabel(g); } catch (_) { return g; } };
  const secLabel = (s) => { try { const v = IntMapTables.CO_SECTORS[s]; return v ? t.arr(v) : s; } catch (_) { return s; } };
  const stat = (cc) => { try { return (HOST.countryStats && HOST.countryStats[cc]) || null; } catch (_) { return null; } };
  const ccName = (cc) => { try { const s = stat(cc); const n = s && HOST.cName(s); return (n && n !== '—') ? n : cc; } catch (_) { return cc; } };
  const anchor = (cc) => { const s = stat(cc); const ll = s && s.latlng; return (ll && isFinite(ll[0]) && isFinite(ll[1])) ? [+ll[1], +ll[0]] : null; };
  const coName = (c) => { const r = CD() && CD().get(c.id); return (HOST.lang === 'jp' && r && r.loc && r.loc.ja) ? r.loc.ja : c.name; };
  const num = (n) => Number(n).toLocaleString(HOST.lang === 'jp' ? 'ja' : 'en');

  /** the reading the card, the map and Atlas share */
  function reading() {
    const rows = between(_src.rows, { groups: _groups, sectors: _sectors });
    if (_cc) return { kind: 'country', ...ties(rows, _cc, _dir) };
    return { kind: 'world', ...network(rows) };
  }

  /* ─── the map: shaded partner countries + one line per pair ─────────────────────────────────────────────────── */
  const FSRC = 'co-ties-fill-src', LSRC = 'co-ties-line-src', FILL = 'co-ties-fill', EDGE = 'co-ties-edge', LINE = 'co-ties-line';
  let _undrawn = [];
  function features(R) {
    const fills = [], lines = []; _undrawn = [];
    const edges = R.kind === 'country'
      ? R.partners.map((p) => (R.dir === 'out' ? { from: R.cc, to: p.cc, n: p.nCompanies, sites: p.sites } : { from: p.cc, to: R.cc, n: p.nCompanies, sites: p.sites }))
      : R.pairs.map((p) => ({ from: p.from, to: p.to, n: p.nCompanies, sites: p.sites }));
    const max = edges.reduce((m, e) => Math.max(m, e.n), 1);
    edges.forEach((e) => {
      const line = pairLine(anchor(e.from), anchor(e.to));
      if (!line) { _undrawn.push(e.from + '>' + e.to); return; }
      lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: { from: e.from, to: e.to, n: e.n, sites: e.sites, w: e.n / max } });
    });
    if (R.kind === 'country') {
      const shade = new Map(R.partners.map((p) => [p.cc, p.nCompanies]));
      const maxP = R.partners.reduce((m, p) => Math.max(m, p.nCompanies), 1);
      const geo = countryOutlines();
      (geo && geo.features || []).forEach((f) => {
        const code = f && f.properties && f.properties.__code; if (!code) return;
        if (code === R.cc) fills.push({ type: 'Feature', geometry: f.geometry, properties: { cc: code, focus: 1, w: 1 } });
        else if (shade.has(code)) fills.push({ type: 'Feature', geometry: f.geometry, properties: { cc: code, focus: 0, n: shade.get(code), w: shade.get(code) / maxP } });
      });
    }
    return { fills: { type: 'FeatureCollection', features: fills }, lines: { type: 'FeatureCollection', features: lines } };
  }
  const canDraw = () => { try { return !!HOST.canDraw(); } catch (_) { try { return !!GE().ready(); } catch (__) { return false; } } };
  const before = () => { try { return GE().layers.has('tool-poly') ? 'tool-poly' : undefined; } catch (_) { return undefined; } };
  const ACCENT = '#5e5ce6';
  function ensure() {
    if (!canDraw()) return false;
    try {
      const empty = { type: 'FeatureCollection', features: [] };
      if (!GE().layers.hasSource(FSRC)) GE().layers.addSource(FSRC, { type: 'geojson', data: empty });
      if (!GE().layers.hasSource(LSRC)) GE().layers.addSource(LSRC, { type: 'geojson', data: empty });
      if (!GE().layers.has(FILL)) GE().layers.add({ id: FILL, type: 'fill', source: FSRC, paint: {
        'fill-color': ['case', ['==', ['get', 'focus'], 1], '#ff9f0a', ACCENT],
        'fill-opacity': ['case', ['==', ['get', 'focus'], 1], 0.42, ['interpolate', ['linear'], ['get', 'w'], 0, 0.14, 1, 0.62]] } }, before());
      if (!GE().layers.has(EDGE)) GE().layers.add({ id: EDGE, type: 'line', source: FSRC, paint: { 'line-color': '#ffffff', 'line-opacity': 0.7, 'line-width': 0.6 } }, before());
      if (!GE().layers.has(LINE)) GE().layers.add({ id: LINE, type: 'line', source: LSRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
        'line-color': ACCENT, 'line-opacity': ['interpolate', ['linear'], ['get', 'w'], 0, 0.35, 1, 0.9],
        'line-width': ['interpolate', ['linear'], ['get', 'w'], 0, 1, 1, 6] } }, before());
      /* both sources are claimed under the effect Atlas's `data.companyTies` declares, so its verdict asks the renderer */
      try { GE().render.claim([FSRC, LSRC], 'map.companyTies', { clear: close }); } catch (_) { }
      return GE().layers.has(LINE);
    } catch (_) { return false; }
  }
  function push() {
    if (!_src) return;
    const F = features(reading());
    try { GE().layers.setSourceData(FSRC, F.fills); GE().layers.setSourceData(LSRC, F.lines); } catch (_) { }
  }

  /* ─── listeners ───────────────────────────────────────────────────────────────────────────────────────────── */
  const regs = [];
  const onLayer = (type, layer, cb) => { try { GE().events.onLayer(type, layer, cb); regs.push({ k: 'l', type, layer, cb }); } catch (_) { } };
  const on = (type, cb) => { try { GE().events.on(type, cb); regs.push({ k: 'm', type, cb }); } catch (_) { } };
  const cursor = (v) => { try { GE().render.setCursor(v); } catch (_) { } };
  function wire() {
    if (_wired) return; _wired = true;
    /* a pair line names the pair and its companies; a shaded country becomes the country read */
    onLayer('click', LINE, (e) => { const f = e && e.features && e.features[0]; if (f && f.properties) pairCard(String(f.properties.from), String(f.properties.to), e.lngLat); });
    onLayer('click', FILL, (e) => { const f = e && e.features && e.features[0]; const cc = f && f.properties && f.properties.cc; if (cc && cc !== _cc) setView({ country: String(cc) }); });
    ['mouseenter', 'mouseleave'].forEach((ev) => [LINE, FILL].forEach((ly) => onLayer(ev, ly, () => cursor(ev === 'mouseenter' ? 'pointer' : ''))));
    on('styledata', () => { if (!_shown) return; clearTimeout(_styleT); _styleT = setTimeout(() => { if (_shown && ensure()) push(); }, 90); });
  }
  function unwire() { _wired = false; regs.splice(0).forEach((r) => { try { if (r.k === 'l') GE().events.offLayer(r.type, r.layer, r.cb); else GE().events.off(r.type, r.cb); } catch (_) { } }); }

  /* ─── a pair: its companies (a map popup — the app's place-popup look) ─────────────────────────────────────── */
  function pairCard(from, to, lngLat) {
    try { if (_popup) _popup.remove(); } catch (_) { }
    const pair = network(between(_src.rows, { groups: _groups, sectors: _sectors })).pairs.find((p) => p.from === from && p.to === to);
    if (!pair) return;
    const html = '<div class="cti-pair"><div class="cti-pair-h"><b>' + H(ccName(from)) + ' → ' + H(ccName(to)) + '</b></div>'
      + '<div class="cti-pair-s">' + H(t(pair.nCompanies + ' companies headquartered in ' + ccName(from) + ' · ' + pair.sites + ' published sites in ' + ccName(to),
        ccName(from) + 'に本社を置く ' + pair.nCompanies + ' 社 · ' + ccName(to) + 'の公表拠点 ' + pair.sites + ' か所')) + '</div>'
      + '<ol class="cti-list">' + pair.companies.map((c) => '<li><button type="button" data-cti-co="' + H(c.id) + '"><span class="cti-co">' + H(coName(c)) + '</span><span class="cti-n">' + H(c.sites) + '</span></button></li>').join('') + '</ol></div>';
    try {
      _popup = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, maxWidth: '300px', className: 'plc-popup', offset: 8 }).setLngLat(lngLat).setHTML(html));
      const el = _popup.getElement && _popup.getElement();
      if (el) el.addEventListener('click', (ev) => { const b = /** @type {Element} */ (ev.target).closest('[data-cti-co]'); if (b) openCompany(b.getAttribute('data-cti-co')); });
    } catch (_) { }
  }
  function openCompany(cid) { try { window.IntMapOS.exec('company.open', { source: 'ui', params: { company: cid } }); } catch (_) { } }

  /* ─── the card ─────────────────────────────────────────────────────────────────────────────────────────────── */
  let panel = null;
  function buildPanel() {
    if (panel && panel.isConnected) return panel;
    style();
    panel = document.createElement('section'); panel.id = 'co-ties-panel'; panel.setAttribute('aria-labelledby', 'cti-title');
    (document.getElementById('map-container') || document.body).appendChild(panel);
    panel.addEventListener('click', (e) => {
      const el = /** @type {Element} */ (e.target);
      const d = el.closest('[data-cti-dir]'); if (d) { setView({ direction: d.getAttribute('data-cti-dir') }); return; }
      const c = el.closest('[data-cti-co]'); if (c) { openCompany(c.getAttribute('data-cti-co')); return; }
      const p = el.closest('[data-cti-cc]'); if (p) { const k = p.getAttribute('data-cti-cc'); _open = _open === k ? null : k; paintPanel(); return; }
      const w = el.closest('[data-cti-pair]'); if (w) { const [a, b] = String(w.getAttribute('data-cti-pair')).split('>'); const l = pairLine(anchor(a), anchor(b)); if (l) pairCard(a, b, { lng: l[Math.floor(l.length / 2)][0], lat: l[Math.floor(l.length / 2)][1] }); return; }
      if (el.closest('.cti-sites')) { close(); try { window.IntMapOS.exec('company.footprint', { source: 'ui', params: {} }); } catch (_) { } return; }
      if (el.closest('.cti-x')) close();
    });
    panel.addEventListener('change', (e) => {
      const s = /** @type {HTMLSelectElement} */ (e.target); if (!s) return;
      if (s.classList.contains('cti-cc')) setView({ country: s.value || null });
      else if (s.classList.contains('cti-grp')) setView({ groups: s.value ? [s.value] : null });
      else if (s.classList.contains('cti-sec')) setView({ sectors: s.value ? [s.value] : null });
    });
    return panel;
  }
  const bar = (groups) => '<span class="cti-bar">' + GROUPS().filter((g) => groups[g]).map((g) => '<span style="flex:' + H(groups[g]) + ';background:' + H(gColor(g)) + '" title="' + H(gLabel(g) + ' ' + groups[g]) + '"></span>').join('') + '</span>';
  function summary(R) {
    if (R.kind === 'world') return t(R.cross.sites + ' of ' + R.sites + ' published sites (' + R.cross.share + '%) belong to a company headquartered in another country · ' + R.pairs.length + ' country pairs',
      '公表拠点 ' + R.sites + ' か所のうち ' + R.cross.sites + ' か所（' + R.cross.share + '%）が他国に本社を置く企業のもの · 国の組 ' + R.pairs.length);
    const n = ccName(R.cc);
    if (!R.sites) return R.dir === 'out' ? t('No company headquartered in ' + n + ' publishes a site in this reading.', 'この条件で、' + n + 'に本社を置く企業の公表拠点はありません。')
      : t('No published site in ' + n + ' in this reading.', 'この条件で、' + n + 'の公表拠点はありません。');
    return R.dir === 'out'
      ? t(R.companies + ' companies headquartered in ' + n + ' publish ' + R.sites + ' sites — ' + R.cross.sites + ' (' + R.cross.share + '%) in ' + R.partners.length + ' other countries',
        n + 'に本社を置く ' + R.companies + ' 社の公表拠点 ' + R.sites + ' か所のうち ' + R.cross.sites + ' か所（' + R.cross.share + '%）が他の ' + R.partners.length + ' か国にあります')
      : t('Of the ' + R.sites + ' published sites in ' + n + ', ' + R.cross.sites + ' (' + R.cross.share + '%) belong to ' + R.cross.companies + ' companies headquartered in ' + R.partners.length + ' other countries',
        n + 'にある公表拠点 ' + R.sites + ' か所のうち ' + R.cross.sites + ' か所（' + R.cross.share + '%）は、他の ' + R.partners.length + ' か国に本社を置く ' + R.cross.companies + ' 社のものです');
  }
  function paintPanel() {
    if (!panel || !_src) return;
    const R = reading();
    const ccs = countriesOf(between(_src.rows, {})).map((cc) => ({ cc, n: ccName(cc) })).sort((a, b) => a.n.localeCompare(b.n, HOST.lang === 'jp' ? 'ja' : 'en'));
    /* a country asked for by name (Atlas) that holds no site either way is still the one being read — the picker says so */
    if (_cc && !ccs.some((c) => c.cc === _cc)) ccs.unshift({ cc: _cc, n: ccName(_cc) });
    const secs = [...new Set(_src.rows.map((r) => r.sec))].sort((a, b) => secLabel(a).localeCompare(secLabel(b)));
    const head = '<div class="cti-head"><h2 id="cti-title">' + icon('network', { size: 16 }) + ' ' + H(t('Companies between countries', '企業でつながる国')) + '</h2>'
      + '<button type="button" class="cti-x" aria-label="' + H(t('Close', '閉じる')) + '">' + icon('close', { size: 16 }) + '</button></div>';
    const controls = '<label class="cti-row">' + H(t('Country', '国')) + ' <select class="cti-cc"><option value="">' + H(t('The world — every pair', '世界 — すべての組')) + '</option>'
      + ccs.map((c) => '<option value="' + H(c.cc) + '"' + (_cc === c.cc ? ' selected' : '') + '>' + H(c.n) + '</option>').join('') + '</select></label>'
      + (_cc ? '<div class="cti-seg" role="group" aria-label="' + H(t('Direction', '向き')) + '">'
        + [['in', t('Foreign companies here', 'ここに来ている外国企業')], ['out', t('Its companies abroad', '海外に出ている自国企業')]].map(([k, l]) =>
          '<button type="button" data-cti-dir="' + H(k) + '" aria-pressed="' + H(String(_dir === k)) + '" class="' + H(_dir === k ? 'on' : '') + '">' + H(l) + '</button>').join('') + '</div>' : '')
      + '<label class="cti-row">' + H(t('Kind of site', '拠点の種類')) + ' <select class="cti-grp"><option value="">' + H(t('All kinds', 'すべての種類')) + '</option>'
      + GROUPS().map((g) => '<option value="' + H(g) + '"' + (_groups && _groups[0] === g ? ' selected' : '') + '>' + H(gLabel(g)) + '</option>').join('') + '</select></label>'
      + '<label class="cti-row">' + H(t('Sector', '業種')) + ' <select class="cti-sec"><option value="">' + H(t('All sectors', 'すべての業種')) + '</option>'
      + secs.map((s) => '<option value="' + H(s) + '"' + (_sectors && _sectors[0] === s ? ' selected' : '') + '>' + H(secLabel(s)) + '</option>').join('') + '</select></label>';
    let list = '';
    if (R.kind === 'country') {
      const lead = R.dir === 'out' ? t('Where they operate', '進出先') : t('Where they come from', '本社のある国');
      list = '<div class="cti-vh">' + H(lead) + '</div>' + (R.partners.length ? '<ol class="cti-list">' + R.partners.map((p) => {
        const openRow = _open === p.cc;
        return '<li><button type="button" data-cti-cc="' + H(p.cc) + '" aria-expanded="' + H(String(openRow)) + '"><span class="cti-co">' + H(ccName(p.cc)) + '</span>' + bar(p.groups)
          + '<span class="cti-n">' + H(t(p.nCompanies + ' co. · ' + p.sites, p.nCompanies + ' 社 · ' + p.sites)) + '</span></button>'
          + (openRow ? '<ol class="cti-sub">' + p.companies.map((c) => '<li><button type="button" data-cti-co="' + H(c.id) + '"><span class="cti-co">' + H(coName(c)) + '</span><span class="cti-n">' + H(c.sites) + '</span></button></li>').join('') + '</ol>' : '')
          + '</li>';
      }).join('') + '</ol>' : '');
    } else {
      list = '<div class="cti-vh">' + H(t('Country pairs, by number of companies', '国の組（企業数の多い順）')) + '</div>' + (R.pairs.length ? '<ol class="cti-list">' + R.pairs.map((p) =>
        '<li><button type="button" data-cti-pair="' + H(p.from + '>' + p.to) + '"><span class="cti-co">' + H(ccName(p.from)) + ' → ' + H(ccName(p.to)) + '</span><span class="cti-n">' + H(t(p.nCompanies + ' co. · ' + p.sites, p.nCompanies + ' 社 · ' + p.sites)) + '</span></button></li>').join('') + '</ol>' : '');
    }
    const undrawn = _undrawn.length ? '<p class="cti-honest">' + H(t(_undrawn.length + ' pairs are listed but not drawn: a country has no label point on this map.', _undrawn.length + ' 組は一覧にありますが、地図上の代表点を持たない国を含むため線を描いていません。')) + '</p>' : '';
    panel.innerHTML = head
      + '<p class="cti-sub">' + H(t(num(_src.rows.length) + ' published sites of ' + _src.companies + ' companies · profiles of ' + (_src.generatedAt || '—'),
        _src.companies + ' 社の公表拠点 ' + num(_src.rows.length) + ' か所 · プロフィール ' + (_src.generatedAt || '—') + ' 時点')) + '</p>'
      + controls + '<p class="cti-sum" aria-live="polite">' + H(summary(R)) + '</p>' + list + undrawn
      + '<p class="cti-honest">' + H(t('A company counts for the country of its headquarters, a site for the country it stands in. Only the sites the sources publish, for the companies IntMap carries — not investment statistics: a pair with no line is not a pair with no business.',
        '企業は本社のある国、拠点は所在する国で数えます。IntMap が載せている企業について出典が公表している拠点だけで、投資統計ではありません。線の無い組に取引が無いとは限りません。')) + '</p>'
      + '<button type="button" class="cti-sites">' + icon('map', { size: 14 }) + ' ' + H(t('Every site on the map', '拠点の地図に戻る')) + '</button>';
  }

  /* ─── the doors ─────────────────────────────────────────────────────────────────────────────────────────── */
  function setView(o) {
    const v = o || {};
    if (v.country !== undefined) { _cc = v.country ? String(v.country).toUpperCase() : null; _open = null; }
    if (v.direction === 'in' || v.direction === 'out') _dir = v.direction;
    if (v.groups !== undefined) _groups = (Array.isArray(v.groups) && v.groups.length) ? GROUPS().filter((g) => v.groups.indexOf(g) >= 0) : null;
    if (v.sectors !== undefined) _sectors = (Array.isArray(v.sectors) && v.sectors.length) ? v.sectors.map(String) : null;
    if (_shown) { push(); paintPanel(); }
    return state();
  }
  /** open({country?, direction?, groups?, sectors?}) — draws the ties and the card. Never moves the camera. → state() */
  async function open(o) {
    await load();
    try { await (HOST.loadCountryData && HOST.loadCountryData()); } catch (_) { /* no outlines: the lines and the list still stand */ }
    /* the sites map and this card sit in the same corner — one reading of the company atlas at a time */
    try { if (FP() && FP().isShown()) FP().close(); } catch (_) { }
    _shown = true;
    setView(o || {});
    if (!ensure()) { try { GE().events.once('idle', () => { if (_shown && ensure()) push(); }); } catch (_) { } } else push();
    wire(); buildPanel(); paintPanel();
    return state();
  }
  function close() {
    _shown = false; clearTimeout(_styleT); unwire();
    try { if (_popup) _popup.remove(); } catch (_) { } _popup = null;
    [LINE, EDGE, FILL].forEach((id) => { try { if (GE().layers.has(id)) GE().layers.remove(id); } catch (_) { } });
    [LSRC, FSRC].forEach((id) => { try { if (GE().layers.hasSource(id)) GE().layers.removeSource(id); } catch (_) { } });
    try { if (panel) panel.remove(); } catch (_) { } panel = null;
    return true;
  }
  /** query({country?, direction?, groups?, sectors?}) — the reading, without drawing. Countries named by ISO-3. */
  async function query(q) {
    await load();
    const o = q || {};
    const rows = between(_src.rows, { groups: o.groups, sectors: o.sectors });
    const of = { sites: _src.rows.length, companies: _src.companies, generatedAt: _src.generatedAt };
    if (o.country) return Object.assign({ kind: 'country', of }, ties(rows, o.country, o.direction === 'out' ? 'out' : 'in'));
    return Object.assign({ kind: 'world', of }, network(rows));
  }
  function state() {
    if (!_shown || !_src) return { shown: false };
    return { shown: true, country: _cc, direction: _cc ? _dir : null, groups: _groups ? _groups.slice() : GROUPS(), sectors: _sectors ? _sectors.slice() : null,
      undrawn: _undrawn.slice(), layers: { fill: FILL, line: LINE } };
  }

  /* ─── the look (the company sites card's: same corner, same glass) ──────────────────────────────────────── */
  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const st = document.createElement('style'); st.id = 'co-ties-css'; st.textContent = [
      '#co-ties-panel{position:absolute;left:12px;top:64px;z-index:var(--z-dropdown);width:min(340px,calc(100% - 24px));max-height:calc(100% - 140px);overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;padding:12px 14px 12px;border-radius:16px;background:var(--popup-bg);color:var(--text-main);border:1px solid rgba(128,128,128,0.2);box-shadow:var(--shadow);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);font-size:12.5px;}',
      '#co-ties-panel .cti-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
      '#co-ties-panel h2{display:flex;align-items:center;gap:6px;margin:0;font-size:15px;font-weight:700;}',
      '#co-ties-panel .cti-x{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:none;border-radius:50%;background:var(--input-bg);color:var(--text-main);cursor:pointer;}',
      '#co-ties-panel .cti-sub{margin:4px 0 8px;color:var(--text-muted);font-size:11.5px;}',
      '#co-ties-panel .cti-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;color:var(--text-muted);}',
      '#co-ties-panel select{min-height:30px;max-width:210px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);font:inherit;}',
      '#co-ties-panel .cti-seg{display:flex;padding:2px;margin-bottom:8px;border-radius:9px;background:var(--input-bg);}',
      '#co-ties-panel .cti-seg button{flex:1;min-height:30px;border:none;border-radius:7px;background:transparent;color:var(--text-muted);font:inherit;font-size:11.5px;cursor:pointer;}',
      '#co-ties-panel .cti-seg button.on{background:var(--popup-bg);color:var(--text-main);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.18);}',
      '#co-ties-panel .cti-sum{margin:2px 0 8px;font-weight:600;line-height:1.45;}',
      '#co-ties-panel .cti-vh{margin:4px 0 4px;color:var(--text-muted);font-size:11.5px;}',
      '.cti-list,.cti-sub{list-style:none;margin:0;padding:0;}',
      '.cti-sub{margin:0 0 4px 14px;}',
      '.cti-list button{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:4px 6px;border:none;border-radius:8px;background:transparent;color:var(--text-main);font:inherit;text-align:left;cursor:pointer;}',
      '.cti-list button:hover{background:var(--input-bg);}',
      '.cti-co{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.cti-n{color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap;}',
      '.cti-bar{display:flex;width:56px;height:6px;border-radius:3px;overflow:hidden;background:rgba(128,128,128,0.2);flex:none;}',
      '#co-ties-panel .cti-honest{margin:8px 0 0;color:var(--text-muted);font-size:10.5px;line-height:1.5;}',
      '#co-ties-panel .cti-sites{display:flex;align-items:center;gap:6px;width:100%;min-height:32px;margin-top:8px;padding:6px 9px;border:none;border-radius:8px;background:var(--input-bg);color:var(--text-main);font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;}',
      '.cti-pair-h{font-size:13px;padding-right:22px;}',
      '.cti-pair-s{margin:3px 0 6px;color:var(--text-muted);font-size:11.5px;}',
      '.cti-pair .cti-list{max-height:220px;overflow-y:auto;}',
      '@media (max-width:640px){#co-ties-panel{left:8px;right:8px;top:auto;bottom:calc(var(--sheet-cover, 20px) + 12px);width:auto;max-height:46vh;}}',
    ].join('\n');
    document.head.appendChild(st);
  }

  return { open, close, query, setView, state, isShown: () => !!_shown };
}
