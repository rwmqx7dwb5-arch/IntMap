/* ============================================================================
 *  IntMap · NATIONAL ELECTIONS — IntMapElections   (#R582)
 * ----------------------------------------------------------------------------
 *  「アメリカ大統領選挙以外の選挙レイヤーも作って。衆院選、参院選など。欧米日豪韓中露」
 *
 *  ══ WHY THIS IS NOT A SECOND js/us-elections.js ═════════════════════════════════════════════
 *  #R243 built one country's one election as one file that knew its own data by heart — the fifty
 *  states, the electoral college, the two party colours. Ten more polities cannot be ten more of
 *  those. This file therefore knows NOTHING about any country: no polity name, no chamber name, no
 *  party name, no colour, no seat count, no district code appears anywhere below. All of that
 *  arrives from data/elections/, whose shape is defined once in scripts/lib/elections-schema.mjs
 *  and verified on every `npm test` by `node scripts/build-elections.mjs --check`.
 *  ⚠ IF YOU FIND YOURSELF ADDING «if the country is X» HERE, THE PACK IS WRONG, NOT THIS FILE
 *  (`.agents/rules/no-ad-hoc-hardcoding.md`).
 *
 *  ⚠ THE U.S. PRESIDENTIAL LAYER IS UNTOUCHED AND STAYS. It answers a different question (who took
 *  each state's electoral votes, in all sixty elections since 1789) with a data set this contract
 *  cannot express — an election with no districts, no parliamentary seats and no popular vote at
 *  all before 1824. Folding it in here would have cost capability, which §0.3 of CONSTITUTION.md
 *  forbids without asking. The two layers sit side by side in 政治 / Politics.
 *
 *  ══ WHAT THE MAP MEANS ══════════════════════════════════════════════════════════════════════
 *  The fill is 「which party won THIS DISTRICT」 and nothing else. It is deliberately not 「who
 *  governs」, because in most of these systems those are different questions: Japan's 465 members
 *  are 289 districts plus 176 from proportional blocks, Germany's chamber is apportioned by the
 *  second vote, and Australia's winner is the last one standing after preferences rather than the
 *  one with the most first preferences. So the CHAMBER is the bar chart in the legend, the DISTRICT
 *  is the colour, and the legend says which is which in the reader's language.
 *
 *  ⚠ A DISTRICT WITH NO RECORDED WINNER GETS NO COLOUR AT ALL — not grey, which is a party colour
 *  somewhere. #R243 measured the same thing on the American map and the reason is repeated here
 *  because the mechanism is the same: `['has','col']` cannot be ambiguous, a present-but-null
 *  property is not absent, and the opacity SLIDER overwrites any `case` expression in fill-opacity
 *  the moment it initialises (measured: `"0.85"`), so «absent» has to live in the colour's alpha.
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.elections = function (HOST) {
  /* (#R251) the array form of the language helper — a bare array literal is invisible to the i18n
     audit, so every language past the two it happened to list would silently read English. */
  const LA = window.IntMapLang.pickArgs();
  const L = window.IntMapLang.pick(() => HOST.lang);
  const GE = () => window.IntMapGeoEngine;
  const IDS = ['elec-fill', 'elec-line'];
  const SRC = 'elec-src';
  const CB = 'dl-elect';

  let index = null, polity = null, election = null, geo = null, res = null;
  let on = false, loading = null, popup = null, busy = 0;

  const geoCache = new Map(), resCache = new Map();

  function _canDraw() { try { return !!HOST.canDraw(); } catch (_) { try { return !!GE().ready(); } catch (__) { return false; } } }
  const setVis = (v) => IDS.forEach(id => { try { if (GE().layers.has(id)) GE().layers.setLayout(id, 'visibility', v ? 'visible' : 'none'); } catch (_) {} });

  /* ── names ──────────────────────────────────────────────────────────────────────────────────
     Every name in the data is a table of language → string. ⚠ `native` IS NOT ONE OF THE
     TRANSLATIONS: 「新潟5区」 is what is written on the ballot paper and 「Niigata 5」 is a
     convenience, so a reader whose language the pack does not carry is shown the native form
     rather than English wherever the two differ. */
  /* ⚠⚠ THE KEY IS NORMALISED THROUGH THE REGISTRY, NOT COMPARED RAW. The app's own code for
     Japanese is `jp` and for Traditional Chinese `zh`, while every upstream record and most packs
     spell them `ja` and `zh-Hant`. A raw `t[HOST.lang]` therefore missed BOTH — measured on this
     round's own data: 113 elections carried Japanese and Chinese notes that no Japanese or Chinese
     reader could ever be shown, and nothing looked broken because the fallback is a real string.
     js/lang-registry.js already holds both spellings (each row's `alias`), so it is asked. */
  function nm(t) {
    if (!t) return '';
    const R = window.IntMapLang;
    const want = R.normalise(String(HOST.lang || 'en'));
    for (const k of Object.keys(t)) {
      if (k === 'native') continue;
      if (R.normalise(k) === want && t[k]) return t[k];
    }
    return t.native || t.en || Object.values(t)[0] || '';
  }
  /* the native form, only when it adds something to what `nm` already said */
  function alt(t) {
    if (!t) return '';
    const main = nm(t);
    return (t.native && t.native !== main) ? t.native : '';
  }

  const fmt = (n) => { try { return Number(n).toLocaleString(window.IntMapLang.locale(HOST.lang, 'en-US')); } catch (_) { return String(n); } };
  const partyOf = (pid) => (index && index.parties && index.parties[pid]) || null;
  const colourOf = (pid) => { const p = partyOf(pid); return (p && p.col) || null; };
  const partyName = (pid) => { const p = partyOf(pid); return p ? nm(p.n) : String(pid || ''); };

  /* ── loading ────────────────────────────────────────────────────────────────────────────────
     The index is small; the geometry and the results are one fetch each and are cached by name, so
     stepping between two elections fought on the same map re-fetches nothing at all — which is the
     whole reason the boundary ERA is a separate file from the election (see the schema's header). */
  async function loadIndex() {
    if (index) return true;
    if (loading) return loading;
    loading = (async () => {
      try {
        const base = (document.baseURI || './');
        const r = await fetch(new URL('data/elections/index.json', base).href);
        if (!r.ok) return false;
        index = await r.json();
        if (!index || !Array.isArray(index.elections) || !index.elections.length) { index = null; return false; }
        return true;
      } catch (_) { index = null; return false; } finally { loading = null; }
    })();
    return loading;
  }
  async function part(name) {
    const cache = /\.geo\.json$/.test(name) ? geoCache : resCache;
    if (cache.has(name)) return cache.get(name);
    const base = (document.baseURI || './');
    const r = await fetch(new URL('data/elections/' + name, base).href);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const v = await r.json();
    cache.set(name, v);
    return v;
  }

  const electionsOf = (pid) => (index ? index.elections.filter(e => e.polity === pid) : []);
  const polityOf = (pid) => (index ? index.polities.find(p => p.id === pid) : null);

  /* ── select an election and paint it ────────────────────────────────────────────────────────
     ⚠ EVERY SELECTION IS SEQUENCED. Two clicks on 「next」 start two loads, and the slower one used
     to be able to land second and paint the earlier election over the later one. `busy` is the
     token of the most recent request; a load that finishes holding a stale token paints nothing.
     (#R551 measured the same class of bug from the other end — a stale result frozen into a cache
     and served as if it were current.) */
  async function select(eid, { fly = false } = {}) {
    if (!index) return false;
    const e = index.elections.find(x => x.id === eid);
    if (!e) return false;
    const token = ++busy;
    let g = null, r = null;
    try {
      [g, r] = await Promise.all([e.geo ? part(e.geo) : Promise.resolve(null), part(e.res)]);
    } catch (_) {
      if (token === busy) { try { HOST.imToast(L('Could not load the election data', '選挙データを読み込めませんでした', 'Wahldaten konnten nicht geladen werden', 'Не удалось загрузить данные о выборах', 'No se pudieron cargar los datos electorales')); } catch (__) {} }
      return false;
    }
    if (token !== busy) return false;                 /* a later selection already won */
    election = e; polity = e.polity; geo = g; res = r;
    paint();
    renderPanel();
    if (fly) { try { window.IntMapLayerHome && window.IntMapLayerHome.goTo(CB); } catch (_) {} }
    return true;
  }

  /* ⚠ THE FEATURES ARE REWRITTEN, NOT RE-EXPRESSED. Writing `col` onto each feature and calling
     setSourceData is a fraction of a millisecond for a few hundred districts, and unlike a `match`
     expression rebuilt per election it can express 「this district has no recorded winner」. */
  /* ⚠ AN ELECTION MAY HAVE NO GEOMETRY AT ALL, and then the map must be EMPTIED rather than left
     alone. Germany's returns run back to 1949 but the constituency outlines only to 1980, so
     stepping from 2025 to 1949 used to leave the 2025 map painted under a 1949 legend — the exact
     shape #R551 measured, where a stale result stays on screen and the caption says otherwise. */
  const EMPTY = { type: 'FeatureCollection', features: [] };
  function paint() {
    if (!res) return;
    if (!geo) { try { GE().layers.setSourceData(SRC, EMPTY); } catch (_) {} return; }
    const d = res.d || {};
    geo.features.forEach(f => {
      const p = f.properties || (f.properties = {});
      const row = d[p.cd];
      const col = row && row.w ? colourOf(row.w) : null;
      if (!col) { delete p.col; delete p.win; return; }
      p.col = col;
      p.win = partyName(row.w);
    });
    try { GE().layers.setSourceData(SRC, geo); } catch (_) {}
  }

  function ensure() {
    if (GE().layers.hasSource(SRC)) return true;
    if (!_canDraw()) return false;
    try {
      /* the source exists even for an election with no outlines, so that the layer is switched ON
         and the legend is readable rather than the whole layer silently failing to mount */
      GE().layers.addSource(SRC, { type: 'geojson', data: geo || EMPTY, attribution: attribution() });
      const before = GE().layers.has('tool-poly') ? 'tool-poly' : undefined;
      /* the transparent COLOUR, not a zero opacity — see the header */
      GE().layers.add({
        id: 'elec-fill', type: 'fill', source: SRC, layout: { visibility: 'none' },
        paint: { 'fill-color': ['coalesce', ['get', 'col'], 'rgba(0,0,0,0)'], 'fill-opacity': 0.78 }
      }, before);
      GE().layers.add({
        id: 'elec-line', type: 'line', source: SRC, layout: { visibility: 'none' },
        paint: { 'line-color': ['case', ['has', 'col'], 'rgba(255,255,255,0.5)', 'rgba(0,0,0,0)'], 'line-width': 0.6 }
      }, before);
      try { GE().events.onLayer('click', 'elec-fill', onClick); } catch (_) {}
      return true;
    } catch (_) { return false; }
  }
  /* ⚠ THE ATTRIBUTION FOLLOWS THE SELECTION. Every election carries the credit line its own
     publisher requires (`src`), and several of these licences — CC BY, dl-de/by-2.0, the Open
     Parliament Licence, data.gov.hk's terms — make that credit the CONDITION of the right to
     redistribute at all. A layer-wide constant would attribute Britain's data to Germany. */
  function attribution() { return (election && election.src) || ''; }

  /* ── the district popup ─────────────────────────────────────────────────────────────────────
     ⚠ WHAT IS ABSENT IS ABSENT, NOT ZERO. A pack may know who won a district without knowing the
     count (an unopposed return, a record that survives only as a name). Those districts get the
     winner and a line saying there is no count — never a bar of length zero, which would read as
     «this candidate received no votes». */
  function districtHtml(cd) {
    const esc = (x) => HOST.escapeHtml(String(x == null ? '' : x));
    const f = geo && geo.features.find(x => (x.properties || {}).cd === cd);
    const row = (res && res.d && res.d[cd]) || null;
    const title = f ? nm(f.properties.n) : cd;
    const sub = f ? alt(f.properties.n) : '';
    let h = '<div class="elec-pop"><b class="elec-pop-h">' + esc(title) + '</b>'
      + (sub ? '<div class="elec-pop-s">' + esc(sub) + '</div>' : '')
      + '<div class="elec-pop-y">' + esc(nm(election.body)) + ' · ' + esc(election.date) + '</div>';
    if (!row) return h + '<div class="elec-note">' + L('No result is recorded for this district.', 'この選挙区の結果は記録されていません。', 'Für diesen Wahlkreis ist kein Ergebnis verzeichnet.', 'Результат по этому округу не зафиксирован.', 'No hay resultado registrado para esta circunscripción.') + '</div></div>';

    const cands = Array.isArray(row.c) ? row.c.slice() : [];
    const anyV = cands.some(c => c.v != null);
    if (anyV) cands.sort((a, b) => (b.v || 0) - (a.v || 0));
    const maxV = anyV ? Math.max.apply(null, cands.map(c => c.v || 0)) : 0;
    const tot = row.t != null ? row.t : (anyV ? cands.reduce((a, c) => a + (c.v || 0), 0) : 0);

    if (!cands.length && row.w) {
      h += '<div class="elec-row"><span class="elec-nm"><i style="background:' + esc(colourOf(row.w) || '#888') + ';"></i><b>' + esc(partyName(row.w)) + '</b></span></div>';
    }
    cands.forEach(c => {
      const col = colourOf(c.p) || '#888';
      const w = (anyV && maxV) ? Math.max(1.5, Math.round((c.v || 0) / maxV * 100)) : 0;
      const pct = (tot && c.v != null) ? (c.v / tot * 100) : null;
      const won = row.w && c.p === row.w && (!anyV || c.v === maxV);
      h += '<div class="elec-row' + (won ? ' elec-won' : '') + '">'
        + '<span class="elec-nm"><i style="background:' + esc(col) + ';"></i><b>' + esc(c.n) + '</b></span>'
        + '<span class="elec-ev">' + (c.v != null ? esc(fmt(c.v)) : '') + '</span>'
        + (anyV ? '<span class="elec-bar"><i style="width:' + w + '%;background:' + esc(col) + ';"></i></span>' : '')
        + '<span class="elec-pv">' + esc(partyName(c.p)) + (pct != null ? ' · ' + pct.toFixed(1) + '%' : '') + '</span>'
        + '</div>';
    });
    if (anyV && tot) h += '<div class="elec-note">' + L('Total votes cast', '総投票数', 'Abgegebene Stimmen', 'Всего голосов', 'Votos emitidos') + ': ' + esc(fmt(tot)) + '</div>';
    else h += '<div class="elec-note">' + L('The record does not carry a vote count for this district.', 'この選挙区の得票数は記録にありません。', 'Für diesen Wahlkreis ist keine Stimmenzahl verzeichnet.', 'Число голосов по этому округу не зафиксировано.', 'El registro no incluye el recuento de votos de esta circunscripción.') + '</div>';
    return h + '</div>';
  }
  function onClick(ev) {
    try {
      const f = (ev && ev.features && ev.features[0]); if (!f) return;
      const cd = (f.properties || {}).cd; if (!cd) return;
      _css();
      if (popup) { try { popup.remove(); } catch (_) {} }
      popup = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, className: 'plc-popup', maxWidth: '320px' })
        .setLngLat(ev.lngLat).setHTML(districtHtml(String(cd))));
    } catch (_) {}
  }

  /* ── the legend: two selectors and the chamber ─────────────────────────────────────────────── */
  function _css() {
    if (document.getElementById('elec-css')) return;
    const s = document.createElement('style'); s.id = 'elec-css';
    /* ⚠ CONSTITUTION §2: not one back-tick anywhere in here, comments included — a back-tick inside
       CSS that lives in a JS template literal terminates the literal and blanks the whole site.
       These are ordinary quoted strings for exactly that reason. */
    s.textContent = [
      '.elec-pick{display:flex;flex-direction:column;gap:6px;margin:7px 0 9px;}',
      '.elec-pick select{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:9px;'
        + 'border:1px solid rgba(128,128,128,0.28);background:var(--input-bg);color:var(--text-main);'
        + 'font-size:12.5px;font-variant-numeric:tabular-nums;}',
      '.elec-yr{display:flex;align-items:center;gap:6px;}',
      '.elec-yr select{flex:1;min-width:0;}',
      /* (#R289) 38 px box, 22 px glyph, 44 px on a phone — the same finger target the U.S. layer
         was corrected to. The two layers sit next to each other and must not feel different. */
      '.elec-step{flex:0 0 auto;width:38px;height:38px;border-radius:50%;border:1px solid rgba(128,128,128,0.24);'
        + 'background:var(--input-bg);color:var(--text-main);font-size:22px;font-weight:600;line-height:1;'
        + 'cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;}',
      '.elec-step:hover:not(:disabled){background:var(--primary-color);color:#fff;border-color:transparent;}',
      '@media(max-width:768px){.elec-step{width:44px;height:44px;font-size:24px;}}',
      '.elec-step:disabled{opacity:.35;cursor:default;}',
      '.elec-row{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:baseline;margin-bottom:7px;}',
      '.elec-nm{font-size:11.5px;color:var(--text-main);display:flex;align-items:center;gap:5px;min-width:0;}',
      '.elec-nm i{flex:0 0 auto;width:9px;height:9px;border-radius:2px;font-style:normal;}',
      '.elec-nm b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.elec-ev{font-size:11.5px;font-weight:700;color:var(--text-main);font-variant-numeric:tabular-nums;}',
      '.elec-bar{grid-column:1/3;height:9px;border-radius:5px;background:rgba(128,128,128,0.18);overflow:hidden;}',
      '.elec-bar i{display:block;height:100%;border-radius:5px;}',
      '.elec-pv{grid-column:1/3;font-size:10.5px;color:var(--text-muted);font-variant-numeric:tabular-nums;}',
      '.elec-won .elec-nm b{text-decoration:underline;text-underline-offset:2px;}',
      '.elec-head{font-size:10.5px;color:var(--text-muted);margin:-3px 0 8px;}',
      '.elec-note{font-size:10.5px;color:var(--text-muted);line-height:1.5;margin-top:6px;}',
      '.elec-pop{font-size:12px;line-height:1.5;min-width:200px;color:var(--text-main);}',
      '.elec-pop-h{font-size:13.5px;display:block;}',
      '.elec-pop-s{font-size:11px;color:var(--text-muted);}',
      '.elec-pop-y{color:var(--text-muted);font-size:11px;margin:1px 0 8px;}',
      '.elec-pop .elec-ev{white-space:nowrap;}'
    ].join('');
    document.head.appendChild(s);
  }

  function renderPanel() {
    const el = document.getElementById('data-legend-elect');
    if (!el || !index || !election) return;
    /* (#R244) this legend rebuilds its whole body whenever a selector moves and its height varies
       with the number of parties, so it must grow DOWNWARD — a bottom-anchored box would grow out
       from under the very control being operated. tileLegends() in js/data-layers.js reads this. */
    el.dataset.growDown = '1';
    _css();
    let box = el.querySelector('.elec-box');
    if (!box) {
      box = document.createElement('div'); box.className = 'elec-box';
      const op = el.querySelector('.dl-op-row');
      if (op) el.insertBefore(box, op); else el.appendChild(box);
    }
    const esc = (s) => HOST.escapeHtml(String(s == null ? '' : s));
    const mine = electionsOf(polity);
    const i = mine.findIndex(e => e.id === election.id);

    /* the chamber, from the recorded national totals — never derived from the districts on screen,
       because that would drop every seat won from a list (see the schema's header) */
    const nat = (res && Array.isArray(res.n) ? res.n.slice() : []).filter(r => r && (r.seats != null || r.pct != null));
    nat.sort((a, b) => (b.seats || 0) - (a.seats || 0) || (b.pct || 0) - (a.pct || 0));
    /* ⚠ THE BAR MEASURES WHAT THE RECORD ACTUALLY HAS. Seats where the apportionment is recorded;
       vote share where it is not — and a pack is right to withhold seats it cannot honestly derive
       (MEASURED: the Russian party-list returns are counts of votes, and turning them into seats
       would mean this file re-running a national apportionment formula it has no business knowing).
       Reading `seats||0` for every row in that case drew every bar at the minimum width, which said
       «they all did equally badly» about an election nobody had claimed that of. */
    const byPct = !nat.some(r => r.seats != null);
    const size = (r) => (byPct ? (r.pct || 0) : (r.seats || 0));
    const maxSize = Math.max.apply(null, [byPct ? 0.001 : 1].concat(nat.map(size)));
    const total = election.seatsTotal || nat.reduce((a, r) => a + (r.seats || 0), 0);
    /* the majority line only means something when the bars ARE seats */
    const need = (!byPct && total) ? Math.floor(total / 2) + 1 : 0;

    /* ⚠ THE LEGEND SHOWS WHO IS IN THE CHAMBER, AND FOLDS THE REST — because a ballot paper is
       long. MEASURED: Germany 2025 returns 27 parties in the record and seven of them hold a seat;
       drawing all 27 gave a legend taller than the window, in which the two largest parties and a
       party with 0.2 % and no seats were the same size of row. The rest are NOT dropped: they go
       under the `.im-more` disclosure CONSTITUTION names for exactly this, so nothing the record
       carries becomes unreachable.
       ⚠ The split is «did this party win a seat», not a count of rows — a number would be a limit
       somebody typed, and it would be wrong for the chamber that returns eight members and for the
       one that returns six hundred and thirty. Where NO seats are recorded at all (the bars are
       vote share, §byPct) there is nothing to split on, so everything is shown. */
    const held = byPct ? nat : nat.filter(r => (r.seats || 0) > 0);
    const rest = byPct ? [] : nat.filter(r => !((r.seats || 0) > 0));
    const rowOf = (r) => {
      const col = colourOf(r.p) || '#888';
      const w = Math.max(1.5, Math.round(size(r) / maxSize * 100));
      const detail = [];
      if (r.dseats != null) detail.push(r.dseats + ' ' + L('district', '選挙区', 'Wahlkreis', 'округ', 'distrito'));
      /* ⚠ THE OFF-MAP SEATS ARE NAMED BY THE ELECTION WHEN THEY ARE NOT A PARTY LIST — see
         `listName` in scripts/lib/elections-schema.mjs. Calling France's eighteen overseas
         single-member seats 「比例代表」 would simply be untrue. */
      if (r.lseats != null) detail.push(r.lseats + ' ' + (election.listName ? nm(election.listName)
        : L('list', '比例', 'Liste', 'список', 'lista')));
      if (r.pct != null) detail.push(r.pct.toFixed(1) + '%');
      return '<div class="elec-row">'
        + '<span class="elec-nm"><i style="background:' + esc(col) + ';"></i><b>' + esc(partyName(r.p)) + '</b></span>'
        + '<span class="elec-ev">' + (r.seats != null ? r.seats : '') + '</span>'
        + '<span class="elec-bar"><i style="width:' + w + '%;background:' + esc(col) + ';"></i></span>'
        + '<span class="elec-pv">' + esc(detail.join(' · ')) + '</span>'
        + '</div>';
    };
    const rows = held.map(rowOf).join('')
      + (rest.length
        ? '<details class="im-more"><summary>' + esc(L('Parties with no seat', '議席の無い政党', 'Parteien ohne Sitz', 'Партии без мест', 'Partidos sin escaño'))
          + ' (' + rest.length + ')</summary>' + rest.map(rowOf).join('') + '</details>'
        : '');

    const polOpts = index.polities.map(p =>
      '<option value="' + esc(p.id) + '"' + (p.id === polity ? ' selected' : '') + '>' + esc(nm(p.n)) + '</option>').join('');
    const eOpts = mine.map(e =>
      '<option value="' + esc(e.id) + '"' + (e.id === election.id ? ' selected' : '') + '>' + esc(e.y + ' · ' + nm(e.body)) + '</option>').join('');

    box.innerHTML = '<div class="elec-pick">'
        + '<select class="elec-pol" aria-label="' + esc(L('Country or territory', '国・地域', 'Land oder Gebiet', 'Страна или территория', 'País o territorio')) + '">' + polOpts + '</select>'
        + '<div class="elec-yr">'
          + '<button class="elec-step elec-prev" aria-label="' + esc(L('Earlier election', '前の選挙', 'Frühere Wahl', 'Предыдущие выборы', 'Elección anterior')) + '"' + (i <= 0 ? ' disabled' : '') + '>&lsaquo;</button>'
          + '<select class="elec-sel">' + eOpts + '</select>'
          + '<button class="elec-step elec-next" aria-label="' + esc(L('Later election', '次の選挙', 'Spätere Wahl', 'Следующие выборы', 'Elección siguiente')) + '"' + (i >= mine.length - 1 ? ' disabled' : '') + '>&rsaquo;</button>'
        + '</div>'
      + '</div>'
      + '<div class="elec-head">' + esc(election.date) + ' · '
        + (byPct ? L('Share of the vote', '得票率', 'Stimmenanteil', 'Доля голосов', 'Porcentaje de votos')
                 : L('Seats', '議席', 'Sitze', 'Места', 'Escaños'))
        + (need ? (' · ' + L('majority', '過半数', 'Mehrheit', 'большинство', 'mayoría') + ' ' + need + '/' + total) : '') + '</div>'
      + rows
      /* ⚠ THE LEGEND SAYS WHAT THE COLOUR MEANS, because in most of these systems the party that
         won the most districts is not necessarily the party that holds the most seats. */
      + '<div class="elec-note">'
        /* ⚠ «including seats the map does not draw» rather than «including party lists»: for France
           the eighteen seats missing from the map are single-member constituencies abroad, not a
           list at all, and for Hong Kong they are functional and election-committee seats. */
        + L('Colour = the party that won the district. The bars are the whole chamber, including the seats this map does not draw.',
            '塗り分けは、その選挙区で当選した候補の政党です。バーは議会全体の議席で、地図に描かれない議席も含みます。',
            'Farbe = die Partei, die den Wahlkreis gewonnen hat. Die Balken zeigen das gesamte Parlament, einschließlich der Sitze, die diese Karte nicht darstellt.',
            'Цвет — партия, победившая в округе. Полосы показывают весь состав палаты, включая места, которые эта карта не изображает.',
            'El color indica el partido que ganó la circunscripción. Las barras muestran toda la cámara, incluidos los escaños que este mapa no dibuja.')
      + '</div>'
      /* ⚠ `note` is a NAME TABLE, not a string — it is prose the reader reads, so it is translated
         like every other visible string (AGENTS.md §3.5). `src` and `lic` are not: an attribution
         line is the publisher's own wording and the condition of the licence. */
      + (election.note ? '<div class="elec-note">' + esc(nm(election.note)) + '</div>' : '')
      /* ⚠ AND IF THE MAP IS EMPTY, THE LEGEND SAYS WHY. An election whose constituency outlines were
         never published still has a real, readable result — the chamber below is that result — but a
         blank map with no explanation reads as a broken layer rather than as a gap in the record. */
      + (election.geo ? '' : '<div class="elec-note">'
        + L('No constituency boundaries have been published for this election, so the map stays empty. The chamber below is the recorded result.',
            'この選挙の選挙区の境界は公開されていないため、地図には何も描かれません。下の議席は記録された結果です。',
            'Für diese Wahl sind keine Wahlkreisgrenzen veröffentlicht, daher bleibt die Karte leer. Die Sitze unten sind das verzeichnete Ergebnis.',
            'Границы округов для этих выборов не опубликованы, поэтому карта остаётся пустой. Места ниже — зафиксированный результат.',
            'No se han publicado los límites de las circunscripciones de esta elección, por lo que el mapa queda vacío. Los escaños de abajo son el resultado registrado.')
        + '</div>')
      + '<div class="elec-note">' + esc(election.src) + (election.lic ? ' · ' + esc(election.lic) : '') + '</div>';

    const pol = box.querySelector('.elec-pol');
    pol.onchange = () => {
      const list = electionsOf(pol.value);
      /* the most recent election that polity has — the one a reader asking about a country means */
      if (list.length) select(list[list.length - 1].id, { fly: true });
    };
    const sel = box.querySelector('.elec-sel');
    sel.onchange = () => select(sel.value);
    box.querySelector('.elec-prev').onclick = () => { if (i > 0) select(mine[i - 1].id); };
    box.querySelector('.elec-next').onclick = () => { if (i < mine.length - 1) select(mine[i + 1].id); };
    try { window._tileLegends && window._tileLegends(); } catch (_) {}
  }

  /* ── the switch ─────────────────────────────────────────────────────────────────────────────── */
  async function toggle(want) {
    on = !!want;
    if (!on) {
      setVis(false);
      if (popup) { try { popup.remove(); } catch (_) {} popup = null; }
      try { window._hideGenericLegend && window._hideGenericLegend('elect'); } catch (_) {}
      return false;
    }
    if (!await loadIndex()) {
      try { HOST.imToast(L('Could not load the election data', '選挙データを読み込めませんでした', 'Wahldaten konnten nicht geladen werden', 'Не удалось загрузить данные о выборах', 'No se pudieron cargar los datos electorales')); } catch (_) {}
      return false;
    }
    if (!election) {
      /* the most recent election anywhere in the pack — the index is sorted by polity then date, so
         «most recent» is asked of the data rather than assumed of any one country */
      const latest = index.elections.reduce((a, b) => (a && a.date > b.date ? a : b), null);
      if (!await select(latest.id)) return false;
    }
    if (!ensure()) return false;
    setVis(true);
    try {
      window._registerLayerOpacity && window._registerLayerOpacity('elect',
        LA('National elections', '国政選挙', 'Parlamentswahlen', 'Национальные выборы', 'Elecciones nacionales'),
        IDS, CB);
    } catch (_) {}
    paint();
    renderPanel();
    /* (#R313) the camera is moved by js/layer-home.js and by nothing else — this layer's data lives
       inside whichever polity is selected, which is exactly the shape that file exists for. */
    try { window.IntMapLayerHome && window.IntMapLayerHome.arrive(CB); } catch (_) {}
    return true;
  }

  /* the row in the Layers panel. The layer owns its own entry (#R164). The swatch is a strip of the
     colours actually in the pack rather than two invented ones, so it changes when the data does. */
  function buildRow() {
    const dd = document.getElementById('layer-dropdown');
    if (!dd || document.getElementById(CB)) return;
    const w = document.createElement('div'); w.className = 'lyr-row'; w.id = 'lyrrow-elect';
    w.innerHTML = '<label class="layer-option"><input type="checkbox" id="' + CB + '"> '
      + '<span class="lyr-sw" style="background:linear-gradient(90deg,#c8102e 33%,#0087dc 33%,#0087dc 66%,#3c8a45 66%)"></span> '
      + '<span id="' + CB + '-lbl"></span></label>';
    dd.appendChild(w);
    relabel();
    w.querySelector('input').addEventListener('change', (ev) => {
      ev.target.closest('.lyr-row').classList.toggle('on', ev.target.checked);
      toggle(ev.target.checked);
    });
    try { window.reorganizeLayerPanel && window.reorganizeLayerPanel(); } catch (_) {}
  }
  function relabel() {
    const e = document.getElementById(CB + '-lbl');
    if (e) e.textContent = L('National elections', '国政選挙', 'Parlamentswahlen', 'Национальные выборы', 'Elecciones nacionales');
  }
  if (document.readyState !== 'loading') setTimeout(buildRow, 0); else document.addEventListener('DOMContentLoaded', buildRow);
  window.addEventListener('intmap-lang', () => setTimeout(() => { relabel(); if (on) renderPanel(); }, 20));
  /* self-heal across basemap swaps, exactly like the other vector overlays */
  try { GE().events.on('styledata', () => { if (on) setTimeout(() => { if (ensure()) { setVis(true); paint(); } }, 80); }); } catch (_) {}

  window.IntMapElections = {
    toggle,
    isOn: () => on,
    /* what js/layer-home.js frames: the geometry actually on screen, measured, never a typed box */
    fc: () => geo,
    /* and the box the pack recorded for the selected polity, for the moment before geometry lands */
    homeBox: () => { const p = polityOf(polity); return (p && p.home) || null; },
    polities: () => (index ? index.polities.map(p => p.id) : []),
    elections: () => (index ? index.elections.map(e => e.id) : []),
    current: () => (election ? election.id : null),
    select: (id) => select(id)
  };
  return window.IntMapElections;
};
