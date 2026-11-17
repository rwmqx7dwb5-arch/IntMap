/* ============================================================================
 *  IntMap · js/layer-pkg-geopolitics.js — LAYER PACKAGE: sanctions, UN General Assembly votes, border crossings
 *  (geopolitics-layers)
 * ----------------------------------------------------------------------------
 *  The implementation of the three rows whose declarations say `pkg: 'geopolitics'`:
 *    dl-sanctions  arcs from the authority that designates parties (U.S. OFAC, the UK, the EU) to each country its list
 *                  links them to — width ∝ the number of parties; a tap on a country opens what each list states about it
 *    dl-unvotes    one recorded vote of the UN General Assembly, every member coloured by how it voted — the vote the
 *                  record states last at or before the clock's day, or the one the reader (or Atlas) chose
 *    dl-crossings  the border control posts OpenStreetMap maps, coloured by whether their published schedule is open at
 *                  the clock's instant in their own time zone; a tap opens who may cross, how, and when
 *  What each record says is NOT decided here: js/geopolitics-core.js holds the rules (the same functions Atlas asks,
 *  through js/geopolitics-atlas.js), and js/opening-hours.js reads the schedules. This file draws what they answer.
 *
 *  ⚠ LAZY: nothing is fetched or drawn until a row is switched on, and `off` removes everything it added (the vote's
 *  feature-states on the shared `countries` source included).
 *  Strings IntMap writes here are en + jp (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/
import { IntMapTime } from './chronos.js';
import * as bus from './bus.js';
import { IntMapLang } from './lang-registry.js';
import { layerState } from './layer-state.js';
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';
import { sanctionFeatures, sanctionsOn, voteAtOrBefore, findVote, searchVotes, decodeVote, sessionFile, crossingFeatures, crossingState, citizenship } from './geopolitics-core.js';

/* ── the records, each read once (a failed read is forgotten so the next asks again) ── */
const cache = new Map();
/** @param {string} path */
export function loadRecord(path) {
  if (!cache.has(path)) cache.set(path, jsonWithin(path, clockFor(path)).catch((e) => { cache.delete(path); throw e; }));
  return cache.get(path);
}
export const PATHS = Object.freeze({ sanctions: 'data/sanctions.json', votes: 'data/unga-votes/index.json', crossings: 'data/border-crossings.json' });

/* ── the package, once it has been built, for js/geopolitics-atlas.js (Atlas switches the row, then asks it) ── */
/** @type {{ api: any, wait: ((v: any) => void)[] }} */
const LIVE = { api: null, wait: [] };
export function whenPackage() { return LIVE.api ? Promise.resolve(LIVE.api) : new Promise((res) => LIVE.wait.push(res)); }

/* authority colours — three hues far apart on a dark and a light base map; a key in the legend names each */
const AUTH_COLOUR = { US: '#3b82f6', UK: '#e5484d', EU: '#f2b705' };
/* vote colours — the conventional reading (green yes, red no, amber abstain), grey for a member that did not vote */
const VOTE_COLOUR = { Y: '#2fa65a', A: '#e8a33d', N: '#d64545', X: '#8b95a1' };
const VOTE_STATE = { Y: 1, A: 2, N: 3, X: 4 };
const CROSS_COLOUR = { open: '#2fa65a', closed: '#d64545', unknown: '#e8a33d', unread: '#8b95a1', unstated: '#8b95a1' };

/** @param {any} K the layer kit js/data-layers.js hands every package (`packageKit` there)
    @returns {{ rows: Record<string, { on: () => any, off: () => void, opacity: (v: number) => void }>, onLegendsRebuilt?: () => void }} */
export function geopoliticsPackage(K) {
  const { GE, HOST, opacities } = K;
  const html = window.IntMapSafe.markup;
  const Safe = window.IntMapSafe;   /* the app's URL guard (js/safe-html.js), read once for every link below */
  const text = IntMapLang.pick(() => HOST.lang);
  const tag = () => IntMapLang.htmlTag(HOST.lang);
  const jp = () => HOST.lang === 'jp';
  const nf = () => new Intl.NumberFormat(tag());
  const dayText = (/** @type {string} */ d) => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString(tag(), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (_) { return d; } };
  const clockMs = () => { try { return IntMapTime.isLive() ? Date.now() : IntMapTime.nowMs(); } catch (_) { return Date.now(); } };
  const clockDay = () => { try { return IntMapTime.isLive() ? null : new Date(IntMapTime.nowMs()).toISOString().slice(0, 10); } catch (_) { return null; } };
  /* above the base map's fills, under the reader's own pins (the stacking js/world-flows.js measured) */
  const topBefore = () => ['user-pin-shadow', 'user-pin-dot'].find((id) => { try { return !!GE().layers.has(id); } catch (_) { return false; } });

  /* ══ THE LEGEND CARD every row shows (the app's own .data-legend: drag, ×, opacity row, tiling) ══════════════════ */
  function legend(/** @type {string} */ key) {
    let el = document.getElementById('data-legend-' + key);
    if (!el) {
      el = document.createElement('div'); el.className = 'data-legend gp-legend'; el.id = 'data-legend-' + key;
      el.style.maxWidth = '300px';
      el.innerHTML = html`<span class="dl-drag" title="${text('Drag to move', 'ドラッグして移動')}">⋮⋮</span><button class="layer-popup-x" data-x="${key}" title="${text('Close', '閉じる')}">×</button><h4></h4><div class="gp-body"></div><div class="dl-hint gp-hint"></div>`;
      const mc = document.getElementById('map-container');
      if (mc) mc.appendChild(el);
      const x = el.querySelector('.layer-popup-x');
      if (x) x.addEventListener('click', () => { const cb = document.getElementById('dl-' + key); if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change')); } });
      try { K.wireDrag(el); } catch (_) { /* the legend still shows; it does not move */ }
    }
    return el;
  }
  function showLegend(/** @type {HTMLElement} */ el, /** @type {boolean} */ on) {
    el.style.display = on ? 'block' : 'none';
    if (on) { try { window._ensureLegendOpacity && window._ensureLegendOpacity(el); } catch (_) { /* no opacity row */ } }
    try { K.tileLegends(); } catch (_) { /* placed where it stands */ }
  }
  const sourceLine = (/** @type {Array<{n:string,u:string,lic?:string,licUrl?:string}>} */ rows) => html`<div style="font-size:10px;margin-top:6px;color:var(--text-muted)">${rows.map((r, i) => html`${i ? ' · ' : ''}<a href="${Safe.url(r.u)}" target="_blank" rel="noopener noreferrer">${r.n}</a>${r.lic ? html` (${r.licUrl ? html`<a href="${Safe.url(r.licUrl)}" target="_blank" rel="noopener noreferrer">${r.lic}</a>` : r.lic})` : ''}`)}</div>`;
  const note = (/** @type {string} */ s) => html`<p style="font-size:11px;color:var(--text-muted);margin:6px 0 0">${s}</p>`;
  let popup = null;
  function closePopup() { if (popup) { try { popup.remove(); } catch (_) { /* gone */ } } popup = null; }
  function openPopup(/** @type {[number, number]} */ at, /** @type {any} */ body) {
    closePopup();
    popup = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, maxWidth: '360px', className: 'plc-popup' }).setLngLat({ lng: at[0], lat: at[1] }).setHTML(String(body)));
    return !!popup;
  }
  function safeRemove(/** @type {string[]} */ layers, /** @type {string[]} */ sources) {
    for (const id of layers) { try { if (GE().layers.has(id)) GE().layers.remove(id); } catch (_) { /* gone with the style */ } }
    for (const id of sources) { try { if (GE().layers.hasSource(id)) GE().layers.removeSource(id); } catch (_) { /* gone with the style */ } }
  }

  /* ══ SANCTIONS ══════════════════════════════════════════════════════════════════════════════════════════════════ */
  const SAN = { on: false, data: /** @type {any} */ (null), show: new Set(['US', 'UK', 'EU']), country: /** @type {string|null} */ (null), stops: /** @type {(() => void)[]} */ ([]), op: typeof opacities.sanctions === 'number' ? opacities.sanctions : 0.85, wired: false };
  const S_SRC = 'gp-sanc-src', S_ARC = 'gp-sanc-arc', S_END = 'gp-sanc-end', S_SEAT = 'gp-sanc-seat';
  const authName = (/** @type {any} */ a) => (a ? (jp() ? a.name[1] : a.name[0]) : '');
  const placeName = (/** @type {string} */ c) => { const p = SAN.data && SAN.data.places[c]; return p ? (jp() && p.ja ? p.ja : p.en) : c; };
  function sanPaint() {
    if (!SAN.on || !SAN.data) return;
    const L = GE().layers;
    const fc = { type: 'FeatureCollection', features: sanctionFeatures(SAN.data, { authorities: [...SAN.show], country: SAN.country }) };
    const colour = ['match', ['get', 'a'], 'US', AUTH_COLOUR.US, 'UK', AUTH_COLOUR.UK, 'EU', AUTH_COLOUR.EU, '#999999'];
    if (L.hasSource(S_SRC)) L.setSourceData(S_SRC, fc);
    else {
      L.addSource(S_SRC, { type: 'geojson', data: fc, attribution: 'OFAC SDN (U.S. Gov.) · UK Sanctions List (OGL v3.0) · EU FSF (Decision 2011/833/EU)' });
      const before = topBefore();
      L.add({ id: S_ARC, type: 'line', source: S_SRC, filter: ['==', ['get', 'k'], 'arc'], layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colour, 'line-width': ['interpolate', ['linear'], ['get', 'w'], 0, 0.8, 1, 6], 'line-opacity': ['*', SAN.op, ['interpolate', ['linear'], ['get', 'w'], 0, 0.35, 1, 0.85]] } }, before);
      L.add({ id: S_END, type: 'circle', source: S_SRC, filter: ['==', ['get', 'k'], 'end'],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 1, 3, 10, 7, 80, 16], 'circle-color': '#ffffff', 'circle-opacity': 0.9 * SAN.op, 'circle-stroke-color': '#334155', 'circle-stroke-width': 1.2 } }, before);
      L.add({ id: S_SEAT, type: 'circle', source: S_SRC, filter: ['==', ['get', 'k'], 'seat'],
        paint: { 'circle-radius': 7, 'circle-color': colour, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } }, before);
    }
    if (!SAN.wired) {
      SAN.wired = true;
      const click = (/** @type {any} */ ev) => { const f = ev && ev.features && ev.features[0]; const c = f && f.properties && f.properties.c; if (!c) return; try { GE().events.claimClick(ev); } catch (_) { /* the fill beneath keeps it */ } sanCard(c); };
      const enter = () => { try { GE().render.canvas().style.cursor = 'pointer'; } catch (_) { /* cosmetic */ } };
      const leave = () => { try { GE().render.canvas().style.cursor = ''; } catch (_) { /* cosmetic */ } };
      GE().events.onLayer('click', S_END, click); GE().events.onLayer('mouseenter', S_END, enter); GE().events.onLayer('mouseleave', S_END, leave);
      SAN.stops.push(() => { try { GE().events.offLayer('click', S_END, click); GE().events.offLayer('mouseenter', S_END, enter); GE().events.offLayer('mouseleave', S_END, leave); } catch (_) { /* gone */ } SAN.wired = false; });
    }
    sanLegend();
  }
  function sanCard(/** @type {string} */ c) {
    const S = SAN.data; if (!S) return false;
    const r = sanctionsOn(S, c);
    if (!r.place || r.place.x == null) return false;
    const A = new Map(S.authorities.map((/** @type {any} */ a) => [a.id, a]));
    const kindWord = { individual: text('individuals', '個人'), entity: text('entities', '団体・企業'), ship: text('ships', '船舶'), aircraft: text('aircraft', '航空機') };
    const basisWord = { address: text('address', '所在地'), nationality: text('nationality', '国籍'), flag: text('ship flag', '船籍') };
    const blocks = r.by.filter((b) => SAN.show.has(b.authority)).map((b) => {
      const a = A.get(b.authority);
      const kinds = Object.entries(b.kinds).map(([k, n]) => nf().format(/** @type {number} */ (n)) + ' ' + (kindWord[k] || k)).join(' · ');
      const basis = Object.entries(b.basis).map(([k, n]) => (basisWord[k] || k) + ' ' + nf().format(/** @type {number} */ (n))).join(' · ');
      const measures = b.measures.length ? b.measures.slice(0, 6).map((m) => m[0] + ' (' + nf().format(m[1]) + ')').join('; ') : (a && a.measure ? (jp() ? a.measure[1] : a.measure[0]) : '');
      const regimes = b.regimes.slice(0, 8).map((g) => g[0] + ' (' + nf().format(g[1]) + ')').join('; ') + (b.regimes.length > 8 ? ' …' : '');
      const dates = b.first ? text('Designated ' + dayText(b.first) + ' – ' + dayText(b.last), '指定日 ' + dayText(b.first) + '〜' + dayText(b.last)) : '';
      return html`<div style="margin-top:8px;padding-left:8px;border-left:3px solid ${AUTH_COLOUR[b.authority] || '#999'}">
        <div><b>${authName(a)}</b> — ${nf().format(b.n)} ${text('parties', '件')}</div>
        <div style="font-size:11px;color:var(--text-muted)">${kinds}</div>
        <div style="font-size:11px;margin-top:3px"><b>${text('Measures', '措置')}:</b> ${measures}</div>
        <div style="font-size:11px;margin-top:3px"><b>${text('Regimes / programmes', '制裁体制・プログラム')}:</b> ${regimes}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${text('Linked by', '結び付けの根拠')}: ${basis}${b.un ? html` · ${text('of which implementing UN designations', 'うち国連指定の実施')}: ${nf().format(b.un)}` : ''}${dates ? html` · ${dates}` : ''}</div></div>`;
    });
    const body = html`<div style="min-width:240px;max-width:340px;padding-right:18px"><strong>${placeName(c)}</strong>
      <div style="font-size:11px;color:var(--text-muted)">${text('Parties the lists link to this country (address, else nationality, else ship flag) — as each list stands today', '各リストがこの国に結び付けている指定対象（所在地、なければ国籍、なければ船籍）— 各リストの現時点の内容')}</div>
      ${blocks.length ? blocks : note(text('No list shown links a designated party to this country.', '表示中のリストには、この国に結び付く指定対象はありません。'))}
      ${note(text('A party with addresses in several countries is counted in each. This is the list of designated parties, not every trade restriction: sector-wide export bans and embargoes on goods are not in these files.', '複数の国に所在地を持つ対象は各国で数えています。これは指定対象の名簿であり、すべての貿易規制ではありません。分野全体の輸出禁止や物品の禁輸はこれらのファイルには含まれません。'))}</div>`;
    return openPopup([r.place.x, r.place.y], body);
  }
  function sanLegend() {
    const S = SAN.data; const el = legend('sanctions');
    const h4 = el.querySelector('h4'); if (h4) h4.textContent = text('Sanctions — designated parties', '経済制裁 — 指定対象');
    const body = el.querySelector('.gp-body');
    if (!S || !body) return;
    const rows = S.authorities.map((/** @type {any} */ a) => html`<label style="display:flex;align-items:flex-start;gap:6px;margin-top:5px;font-size:11.5px;cursor:pointer">
      <input type="checkbox" data-gp-auth="${a.id}"${SAN.show.has(a.id) ? ' checked' : ''} style="margin-top:2px">
      <i style="display:inline-block;width:12px;height:4px;border-radius:2px;margin-top:6px;background:${AUTH_COLOUR[a.id]}"></i>
      <span><b>${authName(a)}</b> — ${nf().format(a.parties)} ${text('parties', '件')}<br><span style="color:var(--text-muted)">${a.list} · ${text('as of', '時点')} ${dayText(a.listDate)}${S.unplaced[a.id] && S.unplaced[a.id].n ? html` · ${text('placed in no country', '国を特定できない')}: ${nf().format(S.unplaced[a.id].n)}` : ''}</span></span></label>`);
    body.innerHTML = String(html`${rows}
      ${SAN.country ? html`<div style="margin-top:6px;font-size:11px">${text('Showing', '表示中')}: <b>${placeName(SAN.country)}</b> <button type="button" data-gp-all style="font-size:10.5px;margin-left:4px">${text('All countries', 'すべての国')}</button></div>` : ''}
      ${note(text('Each line runs from the authority to a country its list links designated parties to; the wider the line, the more parties. Tap a country for the measures and regimes.', '線は制裁を科す主体から、そのリストが指定対象を結び付けている国へ引いています。太いほど対象が多いことを示します。国をタップすると措置と制裁体制を表示します。'))}`);
    const hint = el.querySelector('.gp-hint');
    if (hint) hint.innerHTML = String(sourceLine(S.authorities.map((/** @type {any} */ a) => ({ n: a.publisher, u: a.url, lic: a.licence, licUrl: a.licenceUrl }))));
    body.querySelectorAll('input[data-gp-auth]').forEach((cb) => cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-gp-auth');
      if (/** @type {HTMLInputElement} */ (cb).checked) SAN.show.add(id); else SAN.show.delete(id);
      closePopup(); sanPaint();
    }));
    const all = body.querySelector('[data-gp-all]'); if (all) all.addEventListener('click', () => { SAN.country = null; closePopup(); sanPaint(); });
  }
  function sanOn() {
    if (SAN.on) return SAN.req;
    SAN.on = true;
    showLegend(legend('sanctions'), true);
    SAN.req = K.whenStyleReady().then(() => loadRecord(PATHS.sanctions)).then((d) => {
      SAN.data = d;
      if (!SAN.on) return;
      sanPaint();
      const re = () => { if (SAN.on && !GE().layers.hasSource(S_SRC)) { SAN.wired = false; sanPaint(); } };
      GE().events.on('styledata', re);
      SAN.stops.push(() => GE().events.off('styledata', re), bus.on('intmap-lang', () => { if (SAN.on) sanLegend(); }));
    }).catch((e) => { console.warn('Sanctions could not load', e); try { layerState.report('dl-sanctions', e); } catch (_) { /* the row's own */ } sanOff(); });
    return SAN.req;
  }
  function sanOff() {
    SAN.on = false; SAN.req = null;
    for (const s of SAN.stops.splice(0)) { try { s(); } catch (_) { /* detached */ } }
    closePopup(); safeRemove([S_SEAT, S_END, S_ARC], [S_SRC]);
    const el = document.getElementById('data-legend-sanctions'); if (el) showLegend(el, false);
  }

  /* ══ UN GENERAL ASSEMBLY VOTES ══════════════════════════════════════════════════════════════════════════════════ */
  const UNV = { on: false, index: /** @type {any} */ (null), vote: /** @type {any} */ (null), pinned: /** @type {number|null} */ (null), painted: /** @type {string[]} */ ([]), stops: /** @type {(() => void)[]} */ ([]), op: typeof opacities.unvotes === 'number' ? opacities.unvotes : 0.7, query: '', hover: false, seq: 0, req: /** @type {any} */ (null) };
  const U_FILL = 'gp-unv-fill', U_LINE = 'gp-unv-line';
  const voteWord = (/** @type {string} */ ch) => ({ Y: text('Voted yes', '賛成'), A: text('Abstain', '棄権'), N: text('Voted no', '反対'), X: text('Absent (did not vote)', '不参加（投票せず）'), '-': text('Not a member', '非加盟') })[ch] || ch;
  const memberName = (/** @type {string} */ c) => { const m = UNV.index && UNV.index.members.find((/** @type {any} */ x) => x.c === c); return m ? (jp() && m.ja ? m.ja : m.n) : c; };
  /** the vote to draw: the reader's choice while the clock stays on its day, else the last the record states at or before the clock */
  function unvPick() {
    const I = UNV.index; if (!I) return null;
    const day = clockDay();
    if (UNV.pinned != null) { const p = findVote(I, String(UNV.pinned)); if (p && (day == null || p.d === day)) return p; UNV.pinned = null; }
    return day == null ? voteAtOrBefore(I, I.last) : voteAtOrBefore(I, day);
  }
  async function unvPaint() {
    if (!UNV.on || !UNV.index) return;
    const seq = ++UNV.seq;
    const row = unvPick();
    let v = null;
    if (row) { const sj = await loadRecord(sessionFile(row.s)); v = decodeVote(UNV.index, sj, row.id); }
    if (seq !== UNV.seq || !UNV.on) return;
    UNV.vote = v;
    K.withCountries(() => {
      const L = GE().layers;
      if (!L.has(U_FILL)) {
        L.add({ id: U_FILL, type: 'fill', source: 'countries', paint: {
          'fill-color': ['match', ['to-number', ['feature-state', 'unv'], 0], 1, VOTE_COLOUR.Y, 2, VOTE_COLOUR.A, 3, VOTE_COLOUR.N, 4, VOTE_COLOUR.X, 'rgba(0,0,0,0)'],
          'fill-opacity': ['case', ['>', ['to-number', ['feature-state', 'unv'], 0], 0], UNV.op, 0] } }, K.beforeId);
        L.add({ id: U_LINE, type: 'line', source: 'countries', paint: { 'line-color': '#ffffff', 'line-width': 0.4,
          'line-opacity': ['case', ['>', ['to-number', ['feature-state', 'unv'], 0], 0], 0.6 * UNV.op, 0] } }, K.beforeId);
      }
      for (const id of UNV.painted) { try { L.removeFeatureState({ source: 'countries', id }, 'unv'); } catch (_) { /* gone */ } }
      UNV.painted = [];
      const have = new Set(((HOST.countryGeo && HOST.countryGeo.features) || []).map((/** @type {any} */ f) => f.id).filter((/** @type {any} */ x) => x != null));
      UNV.notDrawn = [];
      if (v) for (const [code, ch] of Object.entries(v.by)) {
        const s = VOTE_STATE[/** @type {string} */ (ch)];
        if (!s) continue;
        if (!have.has(code)) { UNV.notDrawn.push(code); continue; }
        L.setFeatureState({ source: 'countries', id: code }, { unv: s }); UNV.painted.push(code);
      }
      if (!UNV.hover) {
        UNV.hover = true;
        const move = (/** @type {any} */ e) => {
          const f = e.features && e.features[0]; if (!f || !UNV.vote) return;
          const ch = UNV.vote.by[f.id]; if (!ch || ch === '-') return;
          const tip = K.ensureMapTooltip(); window.showMapTooltip(tip);
          window.setMapTooltipHTML(tip, String(html`<div style="font-weight:600">${memberName(f.id)}</div><div style="margin-top:4px;font-size:12px"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${VOTE_COLOUR[ch]};margin-right:5px"></i>${voteWord(ch)} — ${UNV.vote.sym}</div>`));
          K.positionTooltip(e.point);
        };
        const out = () => { if (HOST.mapTooltipEl) window.hideMapTooltip(HOST.mapTooltipEl); };
        GE().events.onLayer('mousemove', U_FILL, move); GE().events.onLayer('mouseleave', U_FILL, out);
        UNV.stops.push(() => { try { GE().events.offLayer('mousemove', U_FILL, move); GE().events.offLayer('mouseleave', U_FILL, out); } catch (_) { /* gone */ } UNV.hover = false; });
      }
      unvLegend();
    });
  }
  function unvLegend() {
    const I = UNV.index; const el = legend('unvotes'); const v = UNV.vote;
    const h4 = el.querySelector('h4'); if (h4) h4.textContent = text('UN General Assembly vote', '国連総会の採決');
    const body = el.querySelector('.gp-body'); if (!body || !I) return;
    const day = clockDay();
    const carried = v && (day == null ? true : v.d !== day);
    const flagWords = v ? [v.important ? text('U.S. State Department «important vote»', '米国務省の「重要投票」') : '', v.amendment ? text('vote on an amendment', '修正案への投票') : '', v.paragraph ? text('vote on a paragraph', '段落への投票') : ''].filter(Boolean) : [];
    const key = ['Y', 'N', 'A', 'X'].map((ch) => html`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:9px"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${VOTE_COLOUR[ch]}"></i>${voteWord(ch)} ${v ? nf().format(ch === 'Y' ? v.y : ch === 'N' ? v.n : ch === 'A' ? v.a : v.x) : ''}</span>`);
    const results = UNV.query ? searchVotes(I, UNV.query, { limit: 25 }) : [];
    const notDrawn = (UNV.notDrawn || []).filter((c) => v && v.by[c] !== '-');
    body.innerHTML = String(html`${v ? html`<div style="font-size:12px;margin-top:2px"><b>${v.sym || text('(no symbol)', '（文書番号なし）')}</b> · ${dayText(v.d)}</div>
        <div style="font-size:12px;margin-top:3px">${v.ds || v.t}</div>
        ${v.ds && v.t && v.ds.toLowerCase() !== v.t.toLowerCase() ? html`<div style="font-size:10.5px;margin-top:2px;color:var(--text-muted)">${text('Subject heading', '主題')}: ${v.t}</div>` : ''}
        ${flagWords.length ? html`<div style="font-size:10.5px;color:var(--text-muted);margin-top:3px">${flagWords.join(' · ')}</div>` : ''}
        <div style="display:flex;flex-wrap:wrap;font-size:11px;margin-top:6px;font-variant-numeric:tabular-nums">${key}</div>
        ${carried ? note(day == null ? text('The clock is live: this is the last vote in the record (' + dayText(I.last) + ').', '時計が現在なので、記録の最後の採決（' + dayText(I.last) + '）を表示しています。') : text('No vote on the clock\'s day: this is the last one before it.', '時計の日には採決がないため、その前の最後の採決を表示しています。')) : ''}
        ${notDrawn.length ? note(text('Members with no outline on the map: ', '地図に輪郭がない加盟国: ') + notDrawn.map((c) => memberName(c) + ' (' + voteWord(v.by[c]) + ')').join(', ')) : ''}`
      : note(text('The record\'s first vote is ' + dayText(I.first) + '; the clock is before it.', '記録の最初の採決は ' + dayText(I.first) + ' で、時計はそれより前です。'))}
      <div style="display:flex;gap:5px;margin-top:7px">
        <button type="button" data-gp-step="-1" style="flex:1">${text('‹ Previous', '‹ 前の採決')}</button>
        <button type="button" data-gp-step="1" style="flex:1">${text('Next ›', '次の採決 ›')}</button></div>
      <input type="search" data-gp-q value="${UNV.query}" placeholder="${text('Search resolutions (e.g. Palestine, nuclear, A/RES/77/321)', '決議を検索（例: Palestine、nuclear、A/RES/77/321）')}" style="width:100%;box-sizing:border-box;margin-top:6px;font-size:11.5px;padding:4px 6px">
      ${results.length ? html`<div style="max-height:22vh;overflow:auto;margin-top:4px">${results.map((r) => html`<button type="button" data-gp-vote="${r.id}" style="display:block;width:100%;text-align:left;font-size:11px;padding:3px 4px;margin-top:2px;background:transparent;border:0;border-bottom:1px solid rgba(128,128,128,.2);color:inherit;cursor:pointer"><b>${r.sym}</b> ${dayText(r.d)} — ${r.t}</button>`)}</div>` : (UNV.query ? note(text('No recorded vote matches.', '一致する採決は記録にありません。')) : '')}
      ${note(text('Recorded votes only (votes adopted without a vote are not in the record). Each member is coloured on today\'s outline of the country its code names. Selecting a vote moves the clock to its day.', '記録投票のみです（無投票採択は記録にありません）。各加盟国は、そのコードが指す国の現在の輪郭で色分けしています。採決を選ぶと時計がその日に移動します。'))}
      ${note(text('Dates and titles are the dataset\'s. Gaps measured against the Assembly\'s own record: session 76 holds no vote after 24 Dec 2021, so the 2022 emergency special session votes on Ukraine are not in it; some early votes carry a date other than the meeting\'s (the 1971 China representation votes are dated 7 October; the Assembly voted on 25 October); the dataset keeps one code, «Yugoslavia» (YUG), for the seat that is Serbia\'s today, so Serbia is listed, not drawn.','日付と題名はデータセットのものです。総会の記録と照合して分かった欠落: 第76会期は 2021年12月24日より後の採決を含まないため、2022年のウクライナに関する緊急特別会期の採決は入っていません。また初期の一部の採決は会合日と異なる日付を持ちます（1971年の中国代表権の採決は10月7日付ですが、総会の採決は10月25日でした）。データセットは現在のセルビアの議席を「ユーゴスラビア」（YUG）という1つのコードで記録しているため、セルビアは地図に塗らず一覧に示します。'))}`);
    const hint = el.querySelector('.gp-hint');
    if (hint) hint.innerHTML = String(sourceLine([{ n: 'Voeten, Strezhnev & Bailey — UN General Assembly Voting Data (Harvard Dataverse)', u: I.url, lic: I.licence, licUrl: I.licenceUrl }]));
    body.querySelectorAll('[data-gp-step]').forEach((b) => b.addEventListener('click', () => unvStep(+(/** @type {string} */ (b.getAttribute('data-gp-step'))))));
    body.querySelectorAll('[data-gp-vote]').forEach((b) => b.addEventListener('click', () => unvSelect(+(/** @type {string} */ (b.getAttribute('data-gp-vote'))))));
    const q = /** @type {HTMLInputElement|null} */ (body.querySelector('[data-gp-q]'));
    if (q) {
      let t = 0;
      q.addEventListener('input', () => { clearTimeout(t); t = window.setTimeout(() => { UNV.query = q.value; unvLegend(); const q2 = /** @type {HTMLInputElement|null} */ (el.querySelector('[data-gp-q]')); if (q2) { q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); } }, 250); });
    }
  }
  /** choose one vote: the clock goes to its day (the map shows the world of that day) and the vote stays chosen there */
  function unvSelect(/** @type {number} */ id) {
    const I = UNV.index; const r = I && findVote(I, String(id));
    if (!r) return false;
    UNV.pinned = r.id;
    try { IntMapTime.set(new Date(r.d + 'T12:00:00Z'), { source: 'unvotes' }); } catch (_) { /* the clock refuses an instant it cannot reach: the vote is still drawn */ unvPaint(); }
    return true;
  }
  function unvStep(/** @type {number} */ dir) {
    const I = UNV.index; if (!I) return;
    const cur = UNV.vote ? I.votes.findIndex((/** @type {any} */ r) => r[0] === UNV.vote.id) : -1;
    const next = I.votes[Math.max(0, Math.min(I.votes.length - 1, (cur < 0 ? I.votes.length : cur) + dir))];
    if (next) unvSelect(next[0]);
  }
  function unvOn() {
    if (UNV.on) return UNV.req;
    UNV.on = true;
    showLegend(legend('unvotes'), true);
    UNV.req = K.whenStyleReady().then(() => loadRecord(PATHS.votes)).then((I) => {
      UNV.index = I;
      if (!UNV.on) return undefined;
      UNV.stops.push(IntMapTime.on(() => { if (UNV.on) unvPaint(); }), bus.on('intmap-lang', () => { if (UNV.on) unvLegend(); }));
      const re = () => { if (UNV.on && !GE().layers.has(U_FILL)) unvPaint(); };
      GE().events.on('styledata', re); UNV.stops.push(() => GE().events.off('styledata', re));
      return unvPaint();
    }).catch((e) => { console.warn('UN votes could not load', e); try { layerState.report('dl-unvotes', e); } catch (_) { /* the row's own */ } unvOff(); });
    return UNV.req;
  }
  function unvOff() {
    UNV.on = false; UNV.req = null; UNV.seq++;
    for (const s of UNV.stops.splice(0)) { try { s(); } catch (_) { /* detached */ } }
    for (const id of UNV.painted) { try { GE().layers.removeFeatureState({ source: 'countries', id }, 'unv'); } catch (_) { /* gone */ } }
    UNV.painted = [];
    safeRemove([U_LINE, U_FILL], []);
    if (HOST.mapTooltipEl) { try { window.hideMapTooltip(HOST.mapTooltipEl); } catch (_) { /* none */ } }
    const el = document.getElementById('data-legend-unvotes'); if (el) showLegend(el, false);
  }

  /* ══ BORDER CROSSINGS ═══════════════════════════════════════════════════════════════════════════════════════════ */
  const BC = { on: false, data: /** @type {any} */ (null), minute: -1, counts: /** @type {Record<string, number>} */ ({}), stops: /** @type {(() => void)[]} */ ([]), op: typeof opacities.crossings === 'number' ? opacities.crossings : 0.9, wired: false, req: /** @type {any} */ (null) };
  const C_SRC = 'gp-cross-src', C_DOT = 'gp-cross-dot';
  const stateWord = (/** @type {string} */ s) => ({ open: text('Open by its hours', '時刻表では開いている'), closed: text('Closed by its hours', '時刻表では閉まっている'), unknown: text('Schedule says «unknown»', '時刻表が「不明」と記載'), unread: text('Schedule not evaluated', '時刻表を評価できない'), unstated: text('No schedule in OpenStreetMap', 'OpenStreetMap に時刻表がない') })[s] || s;
  function bcPaint(force = false) {
    if (!BC.on || !BC.data) return;
    const ms = clockMs(), minute = Math.floor(ms / 60000);
    if (!force && minute === BC.minute && GE().layers.hasSource(C_SRC)) return;
    BC.minute = minute;
    const feats = crossingFeatures(BC.data, ms);
    BC.counts = {};
    for (const f of feats) BC.counts[f.properties.st] = (BC.counts[f.properties.st] || 0) + 1;
    const fc = { type: 'FeatureCollection', features: feats };
    const L = GE().layers;
    if (L.hasSource(C_SRC)) L.setSourceData(C_SRC, fc);
    else {
      L.addSource(C_SRC, { type: 'geojson', data: fc, attribution: '© OpenStreetMap contributors (ODbL)' });
      L.add({ id: C_DOT, type: 'circle', source: C_SRC, paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2.5, 6, 4.5, 11, 7],
        'circle-color': ['match', ['get', 'st'], 'open', CROSS_COLOUR.open, 'closed', CROSS_COLOUR.closed, 'unknown', CROSS_COLOUR.unknown, CROSS_COLOUR.unread],
        'circle-opacity': BC.op, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 8, 1.2], 'circle-stroke-opacity': BC.op } }, topBefore());
    }
    if (!BC.wired) {
      BC.wired = true;
      const click = (/** @type {any} */ ev) => { const f = ev && ev.features && ev.features[0]; if (!f) return; try { GE().events.claimClick(ev); } catch (_) { /* kept */ } bcCard(+f.properties.i); };
      const enter = () => { try { GE().render.canvas().style.cursor = 'pointer'; } catch (_) { /* cosmetic */ } };
      const leave = () => { try { GE().render.canvas().style.cursor = ''; } catch (_) { /* cosmetic */ } };
      GE().events.onLayer('click', C_DOT, click); GE().events.onLayer('mouseenter', C_DOT, enter); GE().events.onLayer('mouseleave', C_DOT, leave);
      BC.stops.push(() => { try { GE().events.offLayer('click', C_DOT, click); GE().events.offLayer('mouseenter', C_DOT, enter); GE().events.offLayer('mouseleave', C_DOT, leave); } catch (_) { /* gone */ } BC.wired = false; });
    }
    bcLegend();
  }
  function bcCard(/** @type {number} */ i) {
    const c = BC.data && BC.data.crossings[i]; if (!c) return false;
    const ms = clockMs();
    const st = crossingState(c, ms);
    let local = '';
    try { local = new Date(ms).toLocaleString(tag(), { timeZone: c.tz || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { /* no zone */ }
    const cz = citizenship(c);
    const czWord = cz.kind === 'all' ? text('Anyone', '誰でも') : cz.kind === 'international' ? text('International travellers (any nationality)', '国際旅行者（国籍を問わない）')
      : cz.kind === 'local' ? text('Local residents only', '地元住民のみ') : cz.kind === 'interstate' ? text('Citizens of the two neighbouring states only', '隣接する両国の国民のみ')
      : cz.kind === 'codes' ? text('Citizens of: ', '次の国・地域の国民: ') + cz.codes.join(', ') : '';
    const MODE = { access: text('General access', '一般の通行'), foot: text('On foot', '徒歩'), bicycle: text('Bicycle', '自転車'), horse: text('Horse', '馬'), motorcycle: text('Motorcycle', 'オートバイ'),
      motorcar: text('Car', '乗用車'), motor_vehicle: text('Motor vehicles', '自動車全般'), vehicle: text('Vehicles', '車両全般'), bus: text('Bus', 'バス'), hgv: text('Lorry (HGV)', '大型貨物車'), goods: text('Goods vehicles', '貨物車') };
    const modes = c.m ? Object.entries(c.m).map(([k, v]) => (MODE[k] || k) + ': ' + (v === 'yes' || v === 'designated' ? text('allowed', '可') : v === 'no' ? text('not allowed', '不可') : v)) : [];
    const osm = 'https://www.openstreetmap.org/' + ({ n: 'node', w: 'way', r: 'relation' }[c.i[0]] || 'node') + '/' + c.i.slice(1);
    const body = html`<div style="min-width:230px;max-width:330px;padding-right:18px"><strong>${c.n || c.en || text('Border control', '国境検問所')}</strong>${c.en && c.n ? html`<div style="color:var(--text-muted)">${c.en}</div>` : ''}
      <div style="margin-top:6px;font-size:12px"><i style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${CROSS_COLOUR[st.state] || '#999'};margin-right:5px"></i><b>${stateWord(st.state)}</b>${local ? html` <span style="color:var(--text-muted)">— ${text('local time', '現地時刻')} ${local}${c.tz ? ' (' + c.tz + ')' : ''}</span>` : ''}</div>
      ${st.comment ? note('«' + st.comment + '»') : ''}
      ${c.oh ? html`<div style="font-size:11px;margin-top:4px"><b>${text('Hours (as written in OpenStreetMap)', '開所時間（OpenStreetMap の記載）')}:</b> <code style="font-size:10.5px">${c.oh}</code></div>` : ''}
      ${st.state === 'unread' ? note(text('IntMap does not evaluate «' + st.token + '» in this schedule, so it states no open or closed.', 'この時刻表の「' + st.token + '」は IntMap が評価しないため、開閉を述べていません。')) : ''}
      ${st.holidays ? note(text('Public holidays are not known here; the weekday rule is shown.', '祝日はここでは分からないため、曜日の規則で判定しています。')) : ''}
      <div style="font-size:11px;margin-top:6px"><b>${text('Who may cross', '通過できる人')}:</b> ${czWord || text('not stated in OpenStreetMap', 'OpenStreetMap に記載なし')}</div>
      <div style="font-size:11px;margin-top:3px"><b>${text('Ways of crossing', '通過手段')}:</b> ${modes.length ? modes.join(' · ') : text('not stated in OpenStreetMap', 'OpenStreetMap に記載なし')}</div>
      ${c.bc ? html`<div style="font-size:11px;margin-top:3px"><b>${text('Kind of control', '検問の種類')}:</b> ${c.bc}</div>` : ''}
      ${c.op ? html`<div style="font-size:11px;margin-top:3px"><b>${text('Operated by', '運営')}:</b> ${c.op}</div>` : ''}
      ${c.d ? html`<div style="font-size:11px;margin-top:3px">${c.d}</div>` : ''}
      ${c.cd ? note(text('Last checked by a mapper: ' + c.cd, 'マッパーの最終確認: ' + c.cd)) : ''}
      ${note(text('From the schedule OpenStreetMap publishes, not a live feed: a crossing may close without notice.', 'OpenStreetMap が公開する時刻表に基づくもので、リアルタイムの情報ではありません。予告なく閉鎖されることがあります。'))}
      <div style="font-size:10px;margin-top:6px">${c.w ? html`<a href="${Safe.url(c.w)}" target="_blank" rel="noopener noreferrer">${text('Website of the post', 'ウェブサイト')}</a> · ` : ''}<a href="${Safe.url(osm)}" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> (ODbL)</div></div>`;
    return openPopup([c.x, c.y], body);
  }
  function bcLegend() {
    const el = legend('crossings'); const B = BC.data;
    const h4 = el.querySelector('h4'); if (h4) h4.textContent = text('Border control posts', '国境検問所');
    const body = el.querySelector('.gp-body'); if (!body || !B) return;
    const rows = ['open', 'closed', 'unknown', 'unread', 'unstated'].filter((s) => BC.counts[s]).map((s) => html`<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-top:3px"><i style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${CROSS_COLOUR[s]}"></i>${stateWord(s)} <span style="margin-left:auto;font-variant-numeric:tabular-nums">${nf().format(BC.counts[s])}</span></div>`);
    let when = '';
    try { when = new Date(clockMs()).toLocaleString(tag(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (_) { /* none */ }
    body.innerHTML = String(html`<div style="font-size:11px;color:var(--text-muted)">${text('At', '時刻')} ${when} — ${text('each in its own time zone', 'それぞれの現地時刻で判定')}</div>${rows}
      ${note(text('Border control posts mapped in OpenStreetMap (as of ' + dayText(B.asOf) + '). Open or closed is read from the published schedule, not a live feed. Tap a post for who may cross and how.', 'OpenStreetMap に登録された国境検問所（' + dayText(B.asOf) + ' 時点）。開閉は公開された時刻表から判定しており、リアルタイムではありません。地点をタップすると、通過できる人と手段を表示します。'))}`);
    const hint = el.querySelector('.gp-hint');
    if (hint) hint.innerHTML = String(sourceLine([{ n: 'OpenStreetMap contributors', u: 'https://www.openstreetmap.org/copyright', lic: 'ODbL 1.0', licUrl: 'https://opendatacommons.org/licenses/odbl/1-0/' }, { n: B.tz.publisher, u: B.tz.url, lic: B.tz.licence, licUrl: B.tz.licenceUrl }]));
  }
  function bcOn() {
    if (BC.on) return BC.req;
    BC.on = true;
    showLegend(legend('crossings'), true);
    BC.req = K.whenStyleReady().then(() => loadRecord(PATHS.crossings)).then((d) => {
      BC.data = d;
      if (!BC.on) return;
      bcPaint(true);
      BC.stops.push(IntMapTime.on(() => { if (BC.on) bcPaint(); }), bus.on('intmap-lang', () => { if (BC.on) bcLegend(); }));
      /* a live clock moves without telling anyone: the minute is checked once a minute while the row is on */
      const t = window.setInterval(() => { if (BC.on) bcPaint(); }, 60000);
      BC.stops.push(() => window.clearInterval(t));
      const re = () => { if (BC.on && !GE().layers.hasSource(C_SRC)) { BC.wired = false; bcPaint(true); } };
      GE().events.on('styledata', re); BC.stops.push(() => GE().events.off('styledata', re));
    }).catch((e) => { console.warn('Border crossings could not load', e); try { layerState.report('dl-crossings', e); } catch (_) { /* the row's own */ } bcOff(); });
    return BC.req;
  }
  function bcOff() {
    BC.on = false; BC.req = null; BC.minute = -1;
    for (const s of BC.stops.splice(0)) { try { s(); } catch (_) { /* detached */ } }
    closePopup(); safeRemove([C_DOT], [C_SRC]);
    const el = document.getElementById('data-legend-crossings'); if (el) showLegend(el, false);
  }

  /* ══ WHAT ATLAS ASKS (js/geopolitics-atlas.js) — each answer is read from the map after it was drawn ══════════════ */
  const api = {
    /** show one country's links (or all with null); → the number of arcs the map now draws */
    async sanctionsFocus(/** @type {string|null} */ country, /** @type {string[]|null} */ authorities) {
      await sanOn();
      SAN.country = country ? String(country).toUpperCase() : null;
      if (authorities && authorities.length) SAN.show = new Set(authorities.map((a) => String(a).toUpperCase()));
      sanPaint();
      if (SAN.country) sanCard(SAN.country);
      let drawn = 0;
      try { const d = GE().layers.sourceData ? GE().layers.sourceData(S_SRC) : null; drawn = d && d.features ? d.features.filter((/** @type {any} */ f) => f.properties.k === 'arc').length : -1; } catch (_) { drawn = -1; }
      return { drawn };
    },
    /** draw one vote; → { vote, painted: members coloured on the map, notDrawn } */
    async voteShow(/** @type {number} */ id) {
      await unvOn();
      if (!unvSelect(id)) return { vote: null, painted: 0, notDrawn: [] };
      await unvPaint();
      await new Promise((res) => K.withCountries(() => res(undefined)));
      return { vote: UNV.vote, painted: UNV.painted.length, notDrawn: (UNV.notDrawn || []).slice() };
    },
    async crossingsShow() { await bcOn(); return { counts: Object.assign({}, BC.counts) }; },
    openCrossing(/** @type {number} */ i) { return bcCard(i); },
  };
  LIVE.api = api;
  for (const w of LIVE.wait.splice(0)) w(api);

  const setPaint = (/** @type {string} */ id, /** @type {string} */ p, /** @type {any} */ v) => { try { if (GE().layers.has(id)) GE().layers.setPaint(id, p, v); } catch (_) { /* not drawn yet: the value is read when it is */ } };
  return {
    rows: {
      'dl-sanctions': { on: sanOn, off: sanOff, opacity: (v) => { SAN.op = v; setPaint(S_ARC, 'line-opacity', ['*', v, ['interpolate', ['linear'], ['get', 'w'], 0, 0.35, 1, 0.85]]); setPaint(S_END, 'circle-opacity', 0.9 * v); } },
      'dl-unvotes': { on: unvOn, off: unvOff, opacity: (v) => { UNV.op = v; setPaint(U_FILL, 'fill-opacity', ['case', ['>', ['to-number', ['feature-state', 'unv'], 0], 0], v, 0]); } },
      'dl-crossings': { on: bcOn, off: bcOff, opacity: (v) => { BC.op = v; setPaint(C_DOT, 'circle-opacity', v); setPaint(C_DOT, 'circle-stroke-opacity', v); } },
    },
    onLegendsRebuilt() { if (SAN.on) sanLegend(); if (UNV.on) unvLegend(); if (BC.on) bcLegend(); },
  };
}
