/* ============================================================================
 *  IntMap · COMPANY ATLAS — the profile panel behind a company  (#R354)
 * ----------------------------------------------------------------------------
 *  「企業をクリックしたら、その企業そのものと、世界のどこで実際に活動しているかが1枚で分かること。」
 *
 *  This is the reader's half of docs/COMPANIES.md: the identity, the numbers, the businesses, the
 *  group structure and — the reason the dataset exists — every published FACILITY, grouped, counted
 *  and filterable. The data comes from js/company-data.js and from nowhere else; this file fetches
 *  no upstream of its own (docs/COMPANIES.md §10: the browser calls nothing).
 *
 *  ── THE ONE RULE THE WHOLE PANEL OBEYS ─────────────────────────────────────────────────────────
 *  「公表されていない事実は、欠損として扱う。埋めない。」 A field the sources do not carry is a row
 *  that is NOT DRAWN — never a zero, never an em dash, never an estimate. Which is why every builder
 *  below returns '' rather than a placeholder, and why a financial figure is printed only when its
 *  VALUE, its CURRENCY and its FISCAL YEAR / AS-OF date are all three present: a number without the
 *  year it belongs to is a different claim from the one the filing made (docs/COMPANIES.md §4.2, and
 *  checks ⑪⑫ of `npm run check:companies` refuse to ship one).
 *  ⚠ AND A COORDINATE SAYS HOW EXACT IT IS. `precision` is `exact | city | region`; anything but
 *  `exact` carries `precisionNote()` on its own row, because a city centroid presented as a factory
 *  is the invention the whole dataset is written to avoid (docs/COMPANIES.md §5.2 names this function).
 *
 *  ── WHY IT IS A `.country-popup` ───────────────────────────────────────────────────────────────
 *  Same shell as the country card, the aircraft card and the satellite card: the app's detail-card
 *  look, `HOST.makeDraggable`, `bringToFront`, and — the part that is invisible until a phone opens
 *  it — the bottom-sheet rule in css/intmap.css, which turns exactly this class into a sheet. A
 *  bespoke shell would have to reimplement all four (#R148), and its close button would fall out of
 *  window-manager's NODRAG list and out of the 32×32 mobile touch target (#R261), so the × is a
 *  `.country-popup-close` and not a private class.
 *  ⚠ `.country-popup` is `position:absolute` WITH NO left/top OF ITS OWN. An element merely appended
 *  is drawn at the end of the document flow — which is how #R255's data-centre card spent two rounds
 *  rendering exactly on the bottom edge of the viewport while every test agreed it "existed". So
 *  `place()` positions it, against the OFFSET PARENT (`#map-container`, `position:relative`), which
 *  is why the projected point — canvas-relative (#R252) — is converted through the canvas rect and
 *  then back out of the container rect rather than used raw.
 *
 *  ── RENDERER / MODULE RULES ────────────────────────────────────────────────────────────────────
 *  · No <style> here and no CSS inside a template literal — the rules live in css/intmap.css.
 *  · Every value that reaches the DOM goes through window.IntMapSafe (#R138).
 *  · Five languages inline through window.IntMapLang.pick(); tuples held as data resolve through
 *    `L.arr()` — never by subscripting the row, which gives every language past the fifth English
 *    for ever (#R251).
 *  · ONE element, built once and refilled. The listeners are attached to the shell, and everything
 *    inside is reached by delegation, so re-rendering can never leave a dead button or a second copy
 *    of a handler behind.
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.companyPanel = function (HOST) {
  const GE = () => window.IntMapGeoEngine;   /* the renderer through the contract — never the raw handle */
  const L = window.IntMapLang.pick(() => HOST.lang);
  const LA = window.IntMapLang.pickArgs();   /* the five-language tuples below are DATA — see L.arr() */
  const S = (v) => { try { return window.IntMapSafe.html(v == null ? '' : String(v)); } catch (_) { return ''; } };
  const U = (v) => { try { return window.IntMapSafe.url(String(v || '')); } catch (_) { return ''; } };

  const NLOC = () => { try { return window.IntMapLang.locale(HOST.lang); } catch (_) { return 'en'; } };
  const TAG = () => { try { return String(window.IntMapLang.htmlTag(HOST.lang) || 'en').toLowerCase(); } catch (_) { return 'en'; } };
  const nfmt = (v) => { try { return Number(v).toLocaleString(NLOC()); } catch (_) { return String(v); } };

  /* ── THE FACILITY VOCABULARY ────────────────────────────────────────────────────────────────
     ⚠ It is NOT here. js/company-data.js owns the one copy, and js/company-facilities.js reads the
     same one — the two used to carry it separately and had already drifted ("Data centre" against
     "Data center", "Offices" against "Office"). Everything below is a lookup, never a table. */
  const CD = () => window.IntMapCompanyData;
  const typeName = (k) => { try { return CD().typeLabel(k); } catch (_) { return String(k || ''); } };
  const groupName = (k) => { try { return CD().groupLabel(k); } catch (_) { return String(k || ''); } };
  const kindName = (k) => { try { return CD().kindLabel(k); } catch (_) { return String(k || ''); } };
  const statusName = (k) => { try { return CD().statusLabel(k); } catch (_) { return String(k || ''); } };
  const groupColor = (k) => { try { return CD().groupColor(k); } catch (_) { return '#8e8e93'; } };
    /* the six map groups — the filter, the counts and the legend all read these and only these */
    /* ⚠ `presence[].kinds` is a DIFFERENT vocabulary from `group` (docs/COMPANIES.md §4.2) — it says
     what kind of presence the company has in that country, not which map colour a point gets. */
    /* only the three that are NOT `operating` — printing "Operating" on every row is noise, and the
     absence of a badge already says it */
    const GROUPS_FALLBACK = ['hq', 'office', 'factory', 'rnd', 'logistics', 'other'];

  const typeLabel = (t) => typeName(String(t || 'other'));
  const groupLabel = (g) => groupName(String(g || 'other'));
  const kindLabel = (k) => kindName(String(k || ''));
  /* ⚠ 'operating' deliberately prints NOTHING here. A badge on every row would be
     noise, and the absence of a badge already says the site is running; only the
     three exceptional states are worth the ink. */
  const statusLabel = (s) => (String(s || 'operating') === 'operating' ? '' : statusName(String(s)));

  /** docs/COMPANIES.md §5.2 names this function: anything but `exact` must SAY how exact it is. */
  function precisionNote(f) {
    const p = String((f && f.precision) || 'exact');
    if (p === 'city') return L('Located to the city only', '市までの精度', 'Nur stadtgenau', 'Точность только до города', 'Precisión solo a nivel de ciudad');
    if (p === 'region') return L('Located to the region only', '州・県までの精度', 'Nur regionsgenau', 'Точность только до региона', 'Precisión solo a nivel de región');
    return '';
  }

  /* ── data access ───────────────────────────────────────────────────────────────────────────────
     js/company-data.js is a lazy module. ⚠ `IntMapLazy.need()` on a name it does not know logs to
     the console before it resolves false, so the registry is asked FIRST and the direct global is
     the fallback — this panel must be able to run before the module is wired, and silently. */
  function dataMod() {
    if (window.IntMapCompanyData) return Promise.resolve(window.IntMapCompanyData);
    try {
      const Z = window.IntMapLazy;
      const known = !!(Z && Z.names && Z.names().indexOf('companyData') >= 0);
      if (Z && Z.need && known) return Z.need('companyData').then(() => window.IntMapCompanyData || null, () => null);
    } catch (_) { /* the direct global below is the answer */ }
    return Promise.resolve(window.IntMapCompanyData || null);
  }

  /* A name held per language, resolved for the reader. `strict` refuses the English fallback, which
     is what the header's subtitle needs: falling back there would print the company's own name twice. */
  function localText(v, strict) {
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v !== 'object') return '';
    const tag = TAG();
    const tries = [tag, tag.split('-')[0], String(HOST.lang || '').toLowerCase()];
    if (!strict) tries.push('en');
    for (const k of tries) { if (k && v[k]) return String(v[k]).trim(); }
    for (const k in v) { if (String(k).toLowerCase() === tag && v[k]) return String(v[k]).trim(); }
    return '';
  }

  /* A country's name in the reader's language, through the app's ONE resolver (js/app-body.js cName
     → CLDR). Until the country dataset has landed the honest answer is the ISO-3 code itself, so
     `warmCC()` asks for that dataset the first time a panel opens and redraws when it arrives. */
  let ccWarmed = false;
  function ccName(cc) {
    const k = String(cc || '').trim().toUpperCase();
    if (!k) return '';
    try { const s = HOST.countryStats && HOST.countryStats[k]; if (s) { const n = HOST.cName(s); if (n && n !== '—') return n; } } catch (_) { }
    return k;
  }
  function warmCC() {
    if (ccWarmed) return; ccWarmed = true;
    try { const s = HOST.countryStats; if (s && Object.keys(s).length) return; } catch (_) { }
    try {
      const p = HOST.loadCountryData && HOST.loadCountryData();
      if (p && p.then) p.then(() => { if (isOpen()) draw(true); }, () => { });
    } catch (_) { }
  }

  /* ── the money rule (docs/COMPANIES.md §4.2) ───────────────────────────────────────────────────
     A figure is «value + currency + fiscal year / as-of», or it is not printed. The value is
     formatted compactly in the reader's own locale; the CURRENCY CODE and the PERIOD ride beside it
     as a stamp, so a "$" can never be read as the wrong dollar and a figure can never float free of
     its year. */
  function money(v, cur) {
    const n = Number(v);
    if (!isFinite(n)) return '';
    try { return new Intl.NumberFormat(NLOC(), { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 2 }).format(n); } catch (_) { }
    try { return new Intl.NumberFormat(NLOC(), { notation: 'compact', maximumFractionDigits: 2 }).format(n); } catch (_) { }
    return nfmt(n);
  }
  function moneyRow(label, m) {
    if (!m || !isFinite(Number(m.value))) return '';
    const cur = String(m.currency || '').trim();
    const when = String(m.fiscalYear || m.asOf || '').trim();
    if (!cur || !when) return '';       /* an unstamped figure is a claim the sources did not make */
    return row(label, money(m.value, cur), cur + ' · ' + when);
  }

  /* ── HTML builders ─────────────────────────────────────────────────────────────────────────────
     `row` escapes its value; `rowH` takes markup a caller has already escaped (links). Both return
     '' for an absent value, which is how "leave the row out" is spelled everywhere below. */
  const sec = (title) => '<div class="cop-sec">' + S(title) + '</div>';
  const rowH = (k, html, stamp) => (!html ? '' : '<div class="cop-row"><span class="cop-k">' + S(k) + '</span>'
    + '<span class="cop-v">' + html + (stamp ? '<span class="cop-stamp">' + S(stamp) + '</span>' : '') + '</span></div>');
  const row = (k, v, stamp) => rowH(k, (v == null || v === '') ? '' : S(v), stamp);
  const link = (url, text) => { const u = U(url); return u ? '<a class="cop-link" href="' + u + '" target="_blank" rel="noopener noreferrer">' + S(text || url) + '</a>' : ''; };

  function tagRow(label, arr) {
    const a = (Array.isArray(arr) ? arr : []).filter((x) => x != null && String(typeof x === 'object' ? (x.name || '') : x).trim() !== '');
    if (!a.length) return '';
    const items = a.map((x) => {
      if (typeof x !== 'object') return '<span class="cop-tag">' + S(x) + '</span>';
      const nm = String(x.name || '').trim();
      if (!nm) return '';
      const sub = x.country ? ccName(x.country) : '';
      const inner = S(nm) + (sub ? '<small>' + S(sub) + '</small>' : '');
      /* a related company IntMap itself holds is a door, not a word */
      return x.id ? '<button type="button" class="cop-tag cop-tag-b" data-cop-open="' + S(x.id) + '">' + inner + '</button>'
        : '<span class="cop-tag">' + inner + '</span>';
    }).filter(Boolean).join('');
    if (!items) return '';
    return '<div class="cop-tagrow"><div class="cop-k">' + S(label) + '</div><div class="cop-tags">' + items + '</div></div>';
  }

  /* ── the mark. `identity.logo` is whatever the sources published; when it will not load the panel
     shows the company's own initial rather than a broken image, and remembers the failure so a
     re-render does not request it again (the shape js/companies-ui.js uses for the list). */
  const logoBad = new Set();
  function logoHTML(name, url) {
    const chars = Array.from(String(name || '').trim());
    const ch = (chars.length ? chars[0] : '?').toUpperCase();
    const hue = chars.reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    const u = U(url);
    if (!u || logoBad.has(u)) {
      return '<span class="cop-logo-box"><span class="cop-mono" style="background:hsl(' + hue + ',52%,44%)">' + S(ch) + '</span></span>';
    }
    return '<span class="cop-logo-box"><img class="cop-logo" alt="" decoding="async" src="' + S(u) + '"'
      + ' data-cop-mono="' + S(ch) + '" data-cop-hue="' + hue + '"></span>';
  }
  function wireLogo(img) {
    if (!img) return;
    img.onerror = function () {
      this.onerror = null;
      try { logoBad.add(this.getAttribute('src') || ''); } catch (_) { }
      const m = document.createElement('span');
      m.className = 'cop-mono';
      m.textContent = this.getAttribute('data-cop-mono') || '?';
      try { m.style.background = 'hsl(' + (this.getAttribute('data-cop-hue') || 0) + ',52%,44%)'; } catch (_) { }
      try { this.replaceWith(m); } catch (_) { }
    };
  }

  /* ── state ─────────────────────────────────────────────────────────────────────────────────── */
  let el = null;
  let curId = null;         /* the company being shown */
  let curRow = null;        /* its index row, when we have one (header before the profile lands) */
  let curProf = null;       /* the profile, once fetched */
  let errMsg = '';
  let tab = 'ov';           /* ov | biz | loc */
  let grp = '';             /* '' = every group; otherwise exactly one map group */
  let ccFilter = '';        /* '' = every country; otherwise one ISO-3 */
  let ctryOpen = false;     /* the country disclosure's state, kept across re-renders */
  let seq = 0;              /* a reply that lands after the reader has moved on is dropped */

  const facsAll = () => ((curProf && curProf.facilities) || []);
  const groupOf = (f) => {
    try { const D = window.IntMapCompanyData; if (D && D.groupOf) return D.groupOf(f); } catch (_) { }
    return (f && f.group) || 'other';
  };
  const allGroups = () => { const D = window.IntMapCompanyData; return (D && D.GROUPS) || GROUPS_FALLBACK; };
  const facsOf = (g) => facsAll().filter((f) => groupOf(f) === g);
  const availGroups = () => allGroups().filter((g) => facsOf(g).length);
  const groupsNow = () => { const a = availGroups(); return (grp && a.indexOf(grp) >= 0) ? [grp] : a.slice(); };
  const hasXY = (f) => Number.isFinite(Number(f && f.lon)) && Number.isFinite(Number(f && f.lat));
  function listNow() {
    const want = new Set(groupsNow());
    const ord = allGroups();
    const out = facsAll().filter((f) => want.has(groupOf(f))
      && (!ccFilter || String(f.cc || '').toUpperCase() === ccFilter));
    return out.sort((a, b) => (ord.indexOf(groupOf(a)) - ord.indexOf(groupOf(b)))
      || String(ccName(a.cc)).localeCompare(String(ccName(b.cc)), NLOC())
      || String(a.name || '').localeCompare(String(b.name || ''), NLOC()));
  }
  const srcName = (i) => { const s = (curProf && curProf.sources) || []; const r = (i != null && s[i]) ? s[i] : null; return r ? String(r.name || '') : ''; };

  /* ── the map layer. js/company-facilities.js owns every pixel of it; this panel only ever asks,
         and asks nothing at all when that module is not present. */
  const FAC = () => window.IntMapCompanyFacilities;
  function mapShow(fit) { const F = FAC(); if (F && F.show && curProf) { try { F.show(curProf, { groups: groupsNow(), fit: fit !== false }); } catch (_) { } } }
  function mapGroups() { const F = FAC(); if (F && F.setGroups) { try { F.setGroups(groupsNow()); } catch (_) { } } }
  function mapFocus(id) { const F = FAC(); if (F && F.focus && id) { try { F.focus(id); } catch (_) { } } }
  function mapHide() { const F = FAC(); if (F && F.hide) { try { F.hide(); } catch (_) { } } }

  /* ── the shell, built once ─────────────────────────────────────────────────────────────────── */
  function ensureEl() {
    if (el && document.body.contains(el)) return el;
    el = document.createElement('div');
    el.className = 'country-popup co-popup';
    el.id = 'co-popup';
    el.innerHTML = '<button class="country-popup-close" type="button" data-cop="close"'
      + ' aria-label="' + S(L('Close', '閉じる', 'Schließen', 'Закрыть', 'Cerrar')) + '"'
      + ' title="' + S(L('Close', '閉じる', 'Schließen', 'Закрыть', 'Cerrar')) + '">×</button>'
      + '<div class="country-popup-header" id="cop-head"></div>'
      + '<div id="cop-tabs"></div><div id="cop-body"></div><div id="cop-src"></div>';
    (document.getElementById('map-container') || document.body).appendChild(el);
    try { HOST.makeDraggable(el, el.querySelector('#cop-head')); } catch (_) { }
    el.addEventListener('mousedown', () => { try { HOST.bringToFront(el); } catch (_) { } });
    /* ⚠ ONE listener for the whole panel. The body is replaced on every draw, so a handler bound to
       anything inside it would either die with its element or be re-bound once per render — and a
       reader who opens the same company twice would then get two of everything. */
    el.addEventListener('click', onClick);
    return el;
  }

  function onClick(ev) {
    const t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;
    const a = t.closest('[data-cop]');
    if (a) {
      const k = a.getAttribute('data-cop');
      if (k === 'close') { close(); return; }
      if (k === 'clearcc') { ccFilter = ''; draw(false); return; }
    }
    const tb = t.closest('[data-cop-tab]');
    if (tb) { tab = tb.getAttribute('data-cop-tab') || 'ov'; draw(false); return; }
    const gb = t.closest('[data-cop-grp]');
    if (gb) { const g = gb.getAttribute('data-cop-grp') || ''; grp = (g === grp) ? '' : g; draw(false); mapGroups(); return; }
    const cb = t.closest('[data-cop-cc]');
    if (cb) { const c = (cb.getAttribute('data-cop-cc') || '').toUpperCase(); ccFilter = (c === ccFilter) ? '' : c; tab = 'loc'; draw(false); return; }
    const fb = t.closest('[data-cop-fac]');
    if (fb) { mapFocus(fb.getAttribute('data-cop-fac')); return; }
    const ob = t.closest('[data-cop-open]');
    if (ob) { const id = ob.getAttribute('data-cop-open'); if (id) open(id); return; }
    const mk = t.closest('[data-cop-mkt]');
    if (mk) { const tk = mk.getAttribute('data-cop-mkt'); try { window.showCompanyDetail(tk); } catch (_) { } return; }
    /* the disclosure keeps its own `open` natively; this only remembers it across a re-render */
    const sb = t.closest('[data-cop-ctry]');
    if (sb) { ctryOpen = !ctryOpen; }
  }

  /* ── header ────────────────────────────────────────────────────────────────────────────────── */
  function headHTML() {
    const idn = (curProf && curProf.identity) || {};
    const r = curRow || {};
    const nameEn = String(idn.name || r.n || curId || '').trim();
    const localName = localText(idn.local || r.loc, true);
    const title = localName || nameEn;
    /* whichever names are NOT the title — the reader gets both spellings without either repeating */
    const others = [];
    if (nameEn && nameEn !== title) others.push(nameEn);
    /* ⚠ THE LEGAL NAME IS NOT AN ALTERNATIVE NAME. It has its own row in Overview, and putting it
       here too printed the same string twice on every company whose display name is the short one —
       measured on Toyota: subtitle トヨタ自動車株式会社, then «Legal name トヨタ自動車株式会社».
       The header carries the names the company is CALLED; the register name is a fact about it. */
    const meta = [ccName(idn.country || r.cc), sectorLabel(idn.sector || r.sec), tickerText(idn, r)].filter(Boolean).join(' · ');
    /* (#R354) the door BACK to the market card in js/companies-ui.js — live market cap, share
       price, P/E and the sparkline. Those are LIVE figures on a two-minute cache and they stay
       where they are; this panel holds the permanent record. Offered only for a company that is in
       the curated table, because the card is keyed by its ticker. */
    const mkt = (r && r.tk && typeof window.showCompanyDetail === 'function')
      ? '<button type="button" class="cop-mkt" data-cop-mkt="' + S(r.tk) + '">'
        + S(L('Market data', '市場データ', 'Marktdaten', 'Рыночные данные', 'Datos de mercado')) + '</button>'
      : '';
    return '<div class="cop-head">' + logoHTML(title, idn.logo || '')
      + '<div class="cop-headt">'
      + '<h3 class="cop-name" title="' + S(title) + '">' + S(title) + '</h3>'
      + (others.length ? '<div class="cop-alt">' + S(others.join(' · ')) + '</div>' : '')
      + (meta ? '<div class="cop-meta">' + S(meta) + '</div>' : '')
      + mkt
      + '</div></div>';
  }
  function sectorLabel(k) {
    const key = String(k || '').trim();
    if (!key) return '';
    try { const T = window.IntMapTables && window.IntMapTables.CO_SECTORS; const a = T && T[key]; if (a) return L.arr(a); } catch (_) { }
    return key;
  }
  function tickerText(idn, r) {
    const ex = (idn && Array.isArray(idn.exchanges)) ? idn.exchanges : [];
    for (const e of ex) { if (e && e.ticker) return (e.name ? String(e.name) + ': ' : '') + String(e.ticker); }
    return String((r && r.tk) || '').trim();
  }

  /* ── tabs ──────────────────────────────────────────────────────────────────────────────────── */
  const TABS = () => [
    ['ov', L('Overview', '概要', 'Überblick', 'Обзор', 'Resumen')],
    ['biz', L('Business', '事業', 'Geschäft', 'Бизнес', 'Negocio')],
    ['loc', L('Locations', '拠点', 'Standorte', 'Объекты', 'Ubicaciones')],
  ];
  function tabsHTML() {
    if (!curProf) return '';
    return '<div class="ios-segment cop-tabs">' + TABS().map(([k, lbl]) =>
      '<button type="button" class="ios-segment-btn' + (tab === k ? ' active' : '') + '" data-cop-tab="' + k + '" title="' + S(lbl) + '">'
      + S(lbl) + '</button>').join('') + '</div>';
  }

  /* ── Overview ──────────────────────────────────────────────────────────────────────────────── */
  function ovHTML() {
    const p = curProf, idn = p.identity || {}, sc = p.scale || {};
    const desc = localText(idn.description != null ? idn.description : p.description, false);
    const hq = p._hq || null;
    const hqTxt = hq ? [hq.city, hq.region, ccName(hq.cc)].filter(Boolean).join(', ') : '';
    const site = String(idn.website || '').trim();
    let out = '';
    if (desc) out += '<p class="cop-desc">' + S(desc) + '</p>';
    out += row(L('Legal name', '正式名称', 'Firmenname', 'Юридическое наименование', 'Razón social'), String(idn.legalName || '').trim())
      + row(L('Industry', '業種', 'Branche', 'Отрасль', 'Industria'), (Array.isArray(idn.industry) ? idn.industry : []).filter(Boolean).join(', '))
      + row(L('Headquarters', '本社', 'Hauptsitz', 'Штаб-квартира', 'Sede'), hqTxt)
      + row(L('Founded', '設立年', 'Gegründet', 'Год основания', 'Fundada'), String(idn.founded || '').trim())
      + row(L('Employees', '従業員数', 'Mitarbeiter', 'Сотрудники', 'Empleados'),
        isFinite(Number(sc.employees && sc.employees.value)) ? nfmt(sc.employees.value) : '',
        (sc.employees && String(sc.employees.asOf || '').trim()) || '')
      + rowH(L('Website', 'ウェブサイト', 'Website', 'Сайт', 'Sitio web'), link(site, String(site).replace(/^https?:\/\//, '').replace(/\/$/, '')));

    const lead = (Array.isArray(p.leadership) ? p.leadership : []).filter((x) => x && x.name);
    if (lead.length) {
      out += sec(L('Leadership', '経営陣', 'Führung', 'Руководство', 'Dirección'));
      /* ⚠ the ROLE is the sources' own word (Wikidata's label). Translating it here would be
         inventing a mapping nobody published; the reader gets what the filing actually says. */
      lead.forEach((x) => { out += row(String(x.role || '').trim() || L('Leadership', '経営陣', 'Führung', 'Руководство', 'Dirección'), String(x.name).trim(), String(x.since || '').trim()); });
    }

    const fin = moneyRow(L('Market cap', '時価総額', 'Marktkap.', 'Капитализация', 'Cap. bursátil'), sc.marketCap)
      + moneyRow(L('Revenue', '売上高', 'Umsatz', 'Выручка', 'Ingresos'), sc.revenue)
      + moneyRow(L('Operating income', '営業利益', 'Betriebsergebnis', 'Операционная прибыль', 'Resultado de explotación'), sc.operatingIncome)
      + moneyRow(L('Net income', '純利益', 'Nettogewinn', 'Чистая прибыль', 'Beneficio neto'), sc.netIncome)
      + moneyRow(L('Total assets', '総資産', 'Bilanzsumme', 'Совокупные активы', 'Activos totales'), sc.totalAssets);
    if (fin) out += sec(L('Financial figures', '財務', 'Finanzkennzahlen', 'Финансовые показатели', 'Cifras financieras')) + fin;

    const ex = (Array.isArray(idn.exchanges) ? idn.exchanges : [])
      .filter((e) => e && (e.name || e.ticker))
      .map((e) => [e.name, e.ticker].filter(Boolean).join(': ')).join(' · ');
    const ids = row(L('Listed on', '上場市場', 'Notiert an', 'Торгуется на', 'Cotiza en'), ex)
      + row(L('Legal form', '法人形態', 'Rechtsform', 'Организационно-правовая форма', 'Forma jurídica'), String(idn.legalForm || '').trim())
      + row('ISIN', String(idn.isin || '').trim())
      + row('LEI', String(idn.lei || '').trim());
    if (ids) out += sec(L('Listing and identifiers', '上場・識別子', 'Börsennotierung und Kennungen', 'Листинг и идентификаторы', 'Cotización e identificadores')) + ids;
    return out || emptyMsg(L('Nothing about this company is published yet.', 'この企業について公表されている情報はまだありません。', 'Zu diesem Unternehmen ist noch nichts veröffentlicht.', 'Об этой компании пока ничего не опубликовано.', 'Todavía no hay información publicada sobre esta empresa.'));
  }

  /* ── Business ──────────────────────────────────────────────────────────────────────────────── */
  function bizHTML() {
    const b = (curProf && curProf.business) || {};
    const o = (curProf && curProf.org) || {};
    let out = tagRow(L('Main activities', '主要事業', 'Haupttätigkeiten', 'Основная деятельность', 'Actividades principales'), b.segments)
      + tagRow(L('Products', '製品', 'Produkte', 'Продукция', 'Productos'), b.products)
      + tagRow(L('Services', 'サービス', 'Dienstleistungen', 'Услуги', 'Servicios'), b.services)
      + tagRow(L('Brands', 'ブランド', 'Marken', 'Бренды', 'Marcas'), b.brands);
    const org = (o.parent && o.parent.name ? tagRow(L('Parent company', '親会社', 'Muttergesellschaft', 'Материнская компания', 'Empresa matriz'), [o.parent]) : '')
      + tagRow(L('Subsidiaries', '主要子会社', 'Tochtergesellschaften', 'Дочерние компании', 'Filiales'), o.subsidiaries)
      + tagRow(L('Affiliates', '主要関連会社', 'Beteiligungen', 'Ассоциированные компании', 'Empresas asociadas'), o.affiliates);
    if (org) out += sec(L('Organization', '組織', 'Konzernstruktur', 'Структура группы', 'Organización')) + org;
    return out || emptyMsg(L('No business detail is published for this company.', 'この企業の事業内容は公表されていません。', 'Zu diesem Unternehmen sind keine Geschäftsangaben veröffentlicht.', 'Сведения о деятельности этой компании не опубликованы.', 'No hay datos de negocio publicados para esta empresa.'));
  }

  /* ── Locations ─────────────────────────────────────────────────────────────────────────────── */
  function locHTML() {
    const facs = facsAll();
    if (!facs.length) {
      return ctryHTML() + emptyMsg(L('No facilities are published for this company.', 'この企業の拠点は公表されていません。', 'Für dieses Unternehmen sind keine Standorte veröffentlicht.', 'Для этой компании не опубликованы объекты.', 'No hay instalaciones publicadas para esta empresa.'));
    }
    const list = listNow();
    let out = ctryHTML() + chipsHTML();
    if (ccFilter) {
      out += '<div class="cop-active"><span>' + S(ccName(ccFilter)) + '</span>'
        + '<button type="button" class="cop-active-x" data-cop="clearcc">'
        + S(L('Clear', 'クリア', 'Löschen', 'Очистить', 'Limpiar')) + '</button></div>';
    }
    out += list.length
      ? '<div class="cop-facs">' + list.map(facHTML).join('') + '</div>'
      : emptyMsg(L('No facilities match this filter.', 'この条件に該当する拠点はありません。', 'Keine Standorte entsprechen diesem Filter.', 'Нет объектов, соответствующих фильтру.', 'Ninguna instalación coincide con este filtro.'));
    out += storeHTML();
    return out;
  }

  function chipsHTML() {
    const total = facsAll().length;
    if (!total) return '';
    const chip = (key, label, n, on) => '<button type="button" class="cop-chip' + (on ? ' on' : '') + '" data-cop-grp="' + S(key) + '">'
      + S(label) + '<span class="cop-chip-n">' + S(nfmt(n)) + '</span></button>';
    let out = chip('', L('All', 'すべて', 'Alle', 'Все', 'Todos'), total, !grp);
    availGroups().forEach((g) => { out += chip(g, groupLabel(g), facsOf(g).length, grp === g); });
    return '<div class="cop-chips">' + out + '</div>';
  }

  function facHTML(f) {
    const nm = String(f.name || '').trim();
    const place = [f.city, f.region, ccName(f.cc)].filter((x) => x && String(x).trim()).join(' · ');
    const when = [f.opened, f.closed].filter(Boolean).join(' – ');
    const made = [].concat(Array.isArray(f.products) ? f.products : [], Array.isArray(f.research) ? f.research : []).filter(Boolean).join(', ');
    const badges = ['<span class="cop-badge">' + S(typeLabel(f.type)) + '</span>'];
    const st = String(f.status || 'operating') === 'operating' ? '' : statusLabel(f.status);
    if (st) badges.push('<span class="cop-badge dim">' + S(st) + '</span>');
    if (Number.isFinite(f.employees) && f.employees > 0) {
      badges.push('<span class="cop-badge dim">' + S(L('Employees', '従業員数', 'Mitarbeiter', 'Сотрудники', 'Empleados') + ' ' + nfmt(f.employees)) + '</span>');
    }
    const pn = precisionNote(f);
    if (pn) badges.push('<span class="cop-badge warn">' + S(pn) + '</span>');
    /* ⚠ a facility with no coordinates STAYS IN THE LIST — it is a real place the sources named;
       it simply cannot be drawn, and the row says so instead of the panel quietly losing it. */
    const drawable = hasXY(f);
    if (!drawable) badges.push('<span class="cop-badge warn">' + S(L('No coordinates published', '座標は非公表', 'Keine Koordinaten veröffentlicht', 'Координаты не опубликованы', 'Sin coordenadas publicadas')) + '</span>');
    const src = srcName(f.src);
    const inner = '<span class="cop-fac-n">' + S(nm) + '</span>'
      + (place ? '<span class="cop-fac-s">' + S(place) + '</span>' : '')
      + (made ? '<span class="cop-fac-s">' + S(made) + '</span>' : '')
      + (when ? '<span class="cop-fac-s">' + S(when) + '</span>' : '')
      + '<span class="cop-fac-b">' + badges.join('') + '</span>';
    const ttl = src ? ' title="' + S(src) + '"' : '';
    return drawable
      ? '<button type="button" class="cop-fac" data-cop-fac="' + S(f.id) + '"' + ttl + '>' + inner + '</button>'
      : '<div class="cop-fac cop-fac-off"' + ttl + '>' + inner + '</div>';
  }

  /* ⚠ `presence` is «countries where the company has facilities or legal entities» — it is the
     authored answer, so it is preferred over what the facility list happens to contain. A country
     the facility list cannot reach is shown but is NOT a filter, because filtering to it would
     produce an empty list and blame the reader. */
  function ctryHTML() {
    const pres = (Array.isArray(curProf && curProf.presence) ? curProf.presence : [])
      .map((p) => ({ cc: String((p && p.cc) || '').toUpperCase(), n: Number(p && p.facilities) || 0, kinds: Array.isArray(p && p.kinds) ? p.kinds : [] }))
      .filter((r) => r.cc);
    const withFac = new Set(facsAll().map((f) => String(f.cc || '').toUpperCase()).filter(Boolean));
    let rows = pres;
    if (!rows.length) rows = [...withFac].map((cc) => ({ cc, n: facsAll().filter((f) => String(f.cc || '').toUpperCase() === cc).length, kinds: [] }));
    if (!rows.length) return '';
    rows = rows.slice().sort((a, b) => (b.n - a.n) || String(ccName(a.cc)).localeCompare(String(ccName(b.cc)), NLOC()));
    const items = rows.map((r) => {
      const kn = r.kinds.map(kindLabel).filter(Boolean).join(' · ');
      const body = '<span class="cop-ctry-n">' + S(ccName(r.cc)) + '</span>'
        + (kn ? '<span class="cop-ctry-k">' + S(kn) + '</span>' : '')
        + (r.n ? '<span class="cop-ctry-c">' + S(nfmt(r.n)) + '</span>' : '');
      return withFac.has(r.cc)
        ? '<button type="button" class="cop-ctry-b' + (ccFilter === r.cc ? ' on' : '') + '" data-cop-cc="' + S(r.cc) + '">' + body + '</button>'
        : '<div class="cop-ctry-b cop-ctry-off">' + body + '</div>';
    }).join('');
    return '<details class="cop-ctry"' + (ctryOpen ? ' open' : '') + '>'
      + '<summary class="cop-ctry-sum" data-cop-ctry="1">'
      + '<span>' + S(L('Countries with facilities', '進出国', 'Länder mit Standorten', 'Страны присутствия', 'Países con instalaciones')) + '</span>'
      + '<b>' + S(nfmt(withFac.size))
      + (rows.length > withFac.size
        ? '</b><span class="cop-ctry-extra">' + S(L('+' + nfmt(rows.length - withFac.size) + ' retail only',
          '＋' + nfmt(rows.length - withFac.size) + ' か国は小売のみ',
          '+' + nfmt(rows.length - withFac.size) + ' nur Einzelhandel',
          '+' + nfmt(rows.length - withFac.size) + ' только розница',
          '+' + nfmt(rows.length - withFac.size) + ' solo comercio')) + '</span>'
        : '</b>') + '</summary>'
      + '<div class="cop-ctry-list">' + items + '</div></details>';
  }

  /* docs/COMPANIES.md §8 — a store network is NOT carried with the facilities, so the count is
     stated here rather than left to look like a gap in the list above. */
  function storeHTML() {
    let has = false;
    try { const D = window.IntMapCompanyData; has = !!(D && D.hasStores && D.hasStores(curProf)); } catch (_) { }
    if (!has) return '';
    const n = Number((curProf.storeNetwork || {}).count);
    if (!isFinite(n) || n <= 0) return '';
    return row(L('Retail network', '店舗網', 'Filialnetz', 'Розничная сеть', 'Red de tiendas'), nfmt(n));
  }

  /* ── sources (docs/COMPANIES.md §7 ⑩: every facility carries one) ───────────────────────────── */
  function srcHTML() {
    const s = (curProf && curProf.sources) || [];
    const items = s.map((x) => {
      const nm = String((x && x.name) || '').trim();
      if (!nm) return '';
      const at = String((x && x.retrievedAt) || '').trim();
      const body = link(x && x.url, nm) || S(nm);
      return '<li>' + body + (at ? '<span class="cop-stamp">' + S(at) + '</span>' : '') + '</li>';
    }).filter(Boolean).join('');
    if (!items) return '';
    return '<div class="cop-srch">' + S(L('Sources', '出典', 'Quellen', 'Источники', 'Fuentes')) + '</div>'
      + '<ul class="cop-srcs">' + items + '</ul>';
  }

  const emptyMsg = (m) => '<div class="cop-empty">' + S(m) + '</div>';

  /* ── draw ──────────────────────────────────────────────────────────────────────────────────── */
  function bodyHTML() {
    if (errMsg) return emptyMsg(errMsg);
    if (!curProf) return '<div class="cop-load">' + S(L('Loading…', '読み込み中…', 'Wird geladen…', 'Загрузка…', 'Cargando…')) + '</div>';
    if (tab === 'loc') return locHTML();
    if (tab === 'biz') return bizHTML();
    return ovHTML();
  }
  /* `keep` — the panel scrolls (the .country-popup shell is what has overflow-y), so a redraw that
     is not the reader's own navigation must leave them where they were (js/aircraft-detail.js). */
  function draw(keep) {
    if (!curId) return;
    const e = ensureEl();
    const top = keep ? e.scrollTop : 0;
    const h = e.querySelector('#cop-head'); if (h) h.innerHTML = headHTML();
    const tb = e.querySelector('#cop-tabs'); if (tb) tb.innerHTML = tabsHTML();
    const b = e.querySelector('#cop-body'); if (b) b.innerHTML = bodyHTML();
    const s = e.querySelector('#cop-src'); if (s) s.innerHTML = curProf ? srcHTML() : '';
    try { e.querySelectorAll('.cop-logo').forEach(wireLogo); } catch (_) { }
    e.scrollTop = top;
  }

  /* ⚠ THE OFFSET PARENT IS #map-container, NOT THE PAGE. js/datacenters.js does this same sum
     against <body>; here the element lives inside the map container (`position:relative`), so the
     projected point — which `project()` returns CANVAS-relative (#R252) — is lifted into viewport
     coordinates through the canvas rect and then dropped back into container coordinates. Skipped
     entirely once the reader has dragged the panel: after that, where it sits is their decision. */
  function place() {
    const e = ensureEl();
    if (e.getAttribute('data-dragged') === '1') return;
    try {
      const mc = e.offsetParent || document.getElementById('map-container') || document.documentElement;
      const mr = mc.getBoundingClientRect();
      const w = e.offsetWidth || 400, h = e.offsetHeight || 360;
      /* the sidebars overlay the map (#R160), so the right edge keeps clear of the layer panel */
      const rs = (() => {
        try {
          const sb = document.getElementById('layer-sidebar-r');
          return (sb && document.body.classList.contains('lsr-open')) ? sb.getBoundingClientRect().width : 0;
        } catch (_) { return 0; }
      })();
      const at = anchor();
      const px = at ? (() => {
        try { const p = GE().coords.project({ lng: at[0], lat: at[1] }); const cr = GE().render.canvas().getBoundingClientRect(); return cr.left + p.x; } catch (_) { return null; }
      })() : null;
      const right = Math.min(mr.left + mr.width, (window.innerWidth || 1200) - rs);
      let left = (px != null) ? (px + 18) : (right - w - 24);
      left = Math.max(mr.left + 12, Math.min(left, right - w - 12));
      e.style.left = Math.round(left - mr.left) + 'px';
      e.style.top = Math.round(Math.max(12, Math.min(84, mr.height - h - 16))) + 'px';
    } catch (_) { e.style.left = '16px'; e.style.top = '84px'; }
  }
  function anchor() {
    try { const hq = curProf && curProf._hq; if (hq && hasXY(hq)) return [Number(hq.lon), Number(hq.lat)]; } catch (_) { }
    try {
      const r = curRow;
      if (r && Array.isArray(r.hq) && r.hq.length === 2 && Number.isFinite(Number(r.hq[0])) && Number.isFinite(Number(r.hq[1]))) return [Number(r.hq[0]), Number(r.hq[1])];
    } catch (_) { }
    return null;
  }

  /* ── the public doors ──────────────────────────────────────────────────────────────────────── */
  /**
   * @param idOrRow  a company id, a ticker, a name, or an index row from IntMapCompanyData
   * @param opts     {focus:'locations'|'business'|'overview'} — which tab the caller wants first
   */
  function open(idOrRow, opts) {
    opts = opts || {};
    let id = '', rowIn = null;
    if (typeof idOrRow === 'string') id = idOrRow.trim();
    else if (idOrRow && typeof idOrRow === 'object') { rowIn = idOrRow; id = String(idOrRow.id || '').trim(); }
    if (!id) return Promise.resolve(false);

    const my = ++seq;
    /* ⚠ a DIFFERENT company means the previous one leaves the map first. `show()` would replace the
       source anyway, but the profile arrives asynchronously — without this the old company's points
       stay on the map for as long as the fetch takes, under the new company's name. */
    if (curId && curId !== id) mapHide();
    curId = id; curRow = rowIn; curProf = null; errMsg = '';
    grp = ''; ccFilter = ''; ctryOpen = false;
    const f = String(opts.focus || '');
    tab = (f === 'locations' || f === 'loc') ? 'loc' : ((f === 'business' || f === 'biz') ? 'biz' : 'ov');

    const e = ensureEl();
    e.style.display = 'block';
    try { HOST.bringToFront(e); } catch (_) { }
    draw(false); place(); warmCC();

    return dataMod().then((D) => {
      if (my !== seq) return false;
      if (!D) {
        errMsg = L('The company atlas is not available yet.', '企業アトラスをまだ利用できません。', 'Der Unternehmensatlas ist noch nicht verfügbar.', 'Атлас компаний пока недоступен.', 'El atlas de empresas aún no está disponible.');
        draw(false); return false;
      }
      /* an id, a ticker or a name — all three resolve through the index, which needs it loaded */
      const pre = curRow ? Promise.resolve(null) : D.index().then(() => null, () => null);
      return pre.then(() => {
        if (my !== seq) return false;
        if (!curRow) {
          let r = null;
          try { r = D.get(curId) || D.resolve(curId) || null; } catch (_) { r = null; }
          if (r) { curRow = r; if (r.id) curId = r.id; draw(false); }
        }
        return D.profile(curId).then((prof) => {
          if (my !== seq) return false;
          curProf = prof; errMsg = '';
          draw(false); place(); mapShow(true);
          return true;
        }, () => {
          if (my !== seq) return false;
          errMsg = L('This company profile could not be loaded.', 'この企業のプロフィールを読み込めませんでした。', 'Dieses Unternehmensprofil konnte nicht geladen werden.', 'Не удалось загрузить профиль этой компании.', 'No se pudo cargar el perfil de esta empresa.');
          draw(false); return false;
        });
      });
    });
  }

  function close() {
    seq++;
    curId = null; curRow = null; curProf = null; errMsg = '';
    if (el) el.style.display = 'none';
    mapHide();
  }
  const isOpen = () => !!(el && el.style.display !== 'none' && curId);
  const current = () => (curId || null);
  const render = () => { if (isOpen()) draw(true); };

  const API = { open, close, isOpen, current, render, precisionNote };
  window.IntMapCompanyPanel = API;
  return API;
};
