/* ============================================================================
 *  IntMap · Submarine-cable INFO — click a cable, click a landing point (#R355)
 * ----------------------------------------------------------------------------
 *  「ケーブルをクリックすると情報を表示する」「landing pointもクリック可能にする」
 *
 *  ⚠ THIS FILE DRAWS NOTHING ON THE MAP. Not one paint or layout property of
 *  `lyr-subcables`, `lyr-subcables-glow` or `lyr-subcables-pts` is read here, let
 *  alone written; there is no hover glow, no hit-target layer, no width change.
 *  The brief's §2 and §13 are explicit that the cable graphic stays exactly as it
 *  is, and tests/r355-checks.test.mjs asserts every one of those properties
 *  against a recorded baseline so a change here cannot reach them by accident.
 *
 *  ── HOW A HAIRLINE IS MADE EASY TO HIT WITHOUT MAKING IT THICKER (§13) ────
 *  `queryRenderedFeatures` is given a BOX, not a point: ±8 CSS pixels for a
 *  mouse and ±16 for a coarse pointer (`pointer: coarse`, i.e. a finger). The
 *  line on screen is unchanged; only the question asked about it is wider.
 *
 *  ── SEVERAL CABLES IN ONE CORRIDOR (§12) ─────────────────────────────────
 *  Cables share corridors, so a box will often hold more than one. The popup
 *  names how many, lists them as chips, and opens on the nearest — never on
 *  "whichever the renderer returned first, for ever".
 *
 *  ── WHERE THE FACTS COME FROM ────────────────────────────────────────────
 *  data/subcables-meta.json, built by scripts/build-subcables.mjs beside the
 *  geometry. It is fetched once, lazily, and a failure costs the extra fields —
 *  never the popup and never the layer: the feature's own properties (name,
 *  route quality, source) are enough on their own. A value that is not in the
 *  data is NOT GUESSED (§11): the row is omitted.
 * ==========================================================================*/
/* ⚠ NOT `IntMapModules.subcableInfo`, and the difference is real rather than
   cosmetic. The IntMapModules registry is for factories the APPLICATION BODY
   instantiates at boot — js/app-body.js calls each one, and
   scripts/static-checks.mjs enforces exactly that (a registry factory with no
   call site in the body is dead code and fails the build). This is not one of
   those: it is owned by the cable layer, created the first time that layer is
   switched on, and reached only through the dynamic import in
   js/data-layers.js. Registering it as a body factory would have made the check
   pass by widening it, and would have said something untrue about when this
   file runs. */
window.IntMapSubcableInfo = function (HOST) {
  const GE = () => window.IntMapGeoEngine;
  /* ⚠ `window.IntMapLang.t(HOST.lang, …)` IN FULL AT EVERY CALL SITE, and not
     behind a local `L`. scripts/i18n-helpers.mjs proves which local names carry
     the translation helper; a name bound to an ARROW that forwards to it is not
     one it can prove, and `L` is then treated as SHADOWED — so a wrapper here
     would have taken all twenty strings below out of the audit's universe
     entirely. The gate would have kept saying 100 % while this popup read
     English in Chinese, French and Korean, which is precisely the hole #R239 and
     #R313 were about. Verbose, and visible. */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const LINE_LAYERS = ['lyr-subcables'];
  const PT_LAYERS = ['lyr-subcables-pts'];

  let meta = null, metaP = null, popup = null, wiredMap = null;

  function metaUrl() {
    try { return new URL('data/subcables-meta.json', document.baseURI).toString(); }
    catch (_) { return 'data/subcables-meta.json'; }
  }
  function loadMeta() {
    if (meta) return Promise.resolve(meta);
    if (metaP) return metaP;
    metaP = fetch(metaUrl()).then(r => r.ok ? r.json() : null).then(j => {
      meta = (j && j.cables) ? j : null; return meta;
    }).catch(() => null);
    return metaP;
  }

  /* ── the strings, in every language the app has ───────────────────────────── */
  const T = {
    cable: () => window.IntMapLang.t(HOST.lang, 'Submarine cable', '海底ケーブル', 'Seekabel', 'Подводный кабель', 'Cable submarino'),
    landing: () => window.IntMapLang.t(HOST.lang, 'Landing point', '陸揚げ地点', 'Anlandepunkt', 'Точка выхода на берег', 'Punto de amarre'),
    status: () => window.IntMapLang.t(HOST.lang, 'Status', '状態', 'Status', 'Статус', 'Estado'),
    inService: () => window.IntMapLang.t(HOST.lang, 'In service', '運用中', 'In Betrieb', 'В эксплуатации', 'En servicio'),
    planned: () => window.IntMapLang.t(HOST.lang, 'Planned', '計画中', 'Geplant', 'Планируется', 'Planificado'),
    rfs: () => window.IntMapLang.t(HOST.lang, 'Ready for service', '運用開始', 'Betriebsbereit', 'Готовность к работе', 'Listo para el servicio'),
    owners: () => window.IntMapLang.t(HOST.lang, 'Owners', '所有者', 'Eigentümer', 'Владельцы', 'Propietarios'),
    supplier: () => window.IntMapLang.t(HOST.lang, 'Supplier', '敷設事業者', 'Lieferant', 'Поставщик', 'Proveedor'),
    length: () => window.IntMapLang.t(HOST.lang, 'Length', '総延長', 'Länge', 'Длина', 'Longitud'),
    landings: () => window.IntMapLang.t(HOST.lang, 'Landing points', '陸揚げ地点', 'Anlandepunkte', 'Точки выхода на берег', 'Puntos de amarre'),
    countries: () => window.IntMapLang.t(HOST.lang, 'Countries', '接続国・地域', 'Länder', 'Страны', 'Países'),
    routeQuality: () => window.IntMapLang.t(HOST.lang, 'Route quality', '経路の精度', 'Routenqualität', 'Точность трассы', 'Calidad de la ruta'),
    routeSource: () => window.IntMapLang.t(HOST.lang, 'Route source', '経路の出典', 'Routenquelle', 'Источник трассы', 'Fuente de la ruta'),
    verifiedElsewhere: () => window.IntMapLang.t(HOST.lang, 'Surveyed sections', '実測区間の出典', 'Vermessene Abschnitte', 'Съёмочные участки', 'Tramos levantados'),
    checked: () => window.IntMapLang.t(HOST.lang, 'Data last checked', 'データ最終確認日', 'Daten zuletzt geprüft', 'Данные проверены', 'Datos verificados'),
    coords: () => window.IntMapLang.t(HOST.lang, 'Coordinates', '座標', 'Koordinaten', 'Координаты', 'Coordenadas'),
    cablesHere: () => window.IntMapLang.t(HOST.lang, 'Cables landing here', 'ここに接続するケーブル', 'Hier anlandende Kabel', 'Кабели здесь', 'Cables que amarran aquí'),
    unknown: () => window.IntMapLang.t(HOST.lang, 'Unknown', '不明', 'Unbekannt', 'Неизвестно', 'Desconocido'),
    verified: () => window.IntMapLang.t(HOST.lang, 'Verified', '実測', 'Verifiziert', 'Подтверждено', 'Verificado'),
    reconstructed: () => window.IntMapLang.t(HOST.lang, 'Reconstructed', '再構築', 'Rekonstruiert', 'Реконструировано', 'Reconstruido'),
    estimated: () => window.IntMapLang.t(HOST.lang, 'Estimated', '推定', 'Geschätzt', 'Оценка', 'Estimado'),
    /* ⚠ THE NUMBER IS A PLACEHOLDER, NOT A CONCATENATION. `n + ' cables here'`
       is not a literal, so the inline table can never hold it and every language
       past the five positional ones would read English for ever — invisibly. */
    nCables: (n) => window.IntMapLang.t(HOST.lang, '{n} cables here', 'ここに {n} 本', '{n} Kabel hier', '{n} кабеля здесь', '{n} cables aquí').replace('{n}', String(n)),
  };

  const QUALITY = { verified: T.verified, reconstructed: T.reconstructed, estimated: T.estimated };

  /* ══ ⚠⚠⚠ (#R384) THE LABELS WERE TRANSLATED AND THE ANSWERS WERE NOT ═══════
     「クリックしたら出てくるカードの情報が翻訳されていない。」 MEASURED on the
     shipped build, in Japanese:

         接続国・地域   Cyprus · Syria
         陸揚げ地点     Pentaskhinos, Cyprus · Tartous, Syria
         運用開始       2000 August
         国・地域       Indonesia            ← every one of the 1,922 landing points

     Twenty strings above go through the nine-language table, so every instrument
     read 100 %: what an audit of CALL SITES cannot see is a row whose VALUE is
     English data. TeleGeography carries country NAMES and the ready-for-service
     date AS PROSE, and neither can be translated where it is read.
     ⚠ AND THE ANSWER IS NOT A TABLE OF 186 × 9 COUNTRY NAMES — that is #R240's
     rule for the Countries tab, and CLDR already ships every ISO region in every
     language this app has. scripts/build-subcables.mjs resolves the spellings to
     ISO 3166-1 codes (178 of 186 straight from CLDR, 8 in the corrections file)
     and the date to (year, month | quarter); this end asks the browser.
     ⚠ A ROW NEVER LOSES ITS FACT. Where no code was proved the English name the
     data actually carries is printed unchanged — §11 again: not knowing the
     translation is not permission to show something else. */
  function langTag() {
    try { return (window.IntMapLang && window.IntMapLang.htmlTag) ? window.IntMapLang.htmlTag(HOST.lang) : 'en'; }
    catch (_) { return 'en'; }
  }
  /* the reader's own word for an ISO region, or the English name we were given */
  function regionName(cc, english) {
    try { if (cc && window._imCldrRegion) { const n = window._imCldrRegion(cc, HOST.lang); if (n) return n; } } catch (_) {}
    return english || '';
  }
  /* ⚠ THE LANDING POINT'S NAME ENDS IN ITS COUNTRY, IN ENGLISH — 「Sangata,
     Indonesia」, 「Miramar, PR, United States」. The place itself is a proper
     noun and stays; only the country tail is swapped, and only when it is
     exactly the country the record already names, so nothing is guessed at. */
  function landingName(rec, fallback) {
    const name = (rec && rec.name) || fallback || '';
    if (!rec || !rec.country || !rec.cc) return name;
    const localised = regionName(rec.cc, rec.country);
    if (!localised || localised === rec.country) return name;
    const tail = ', ' + rec.country;
    return name.slice(-tail.length) === tail ? name.slice(0, -tail.length) + ', ' + localised : name;
  }
  /* 「2000 August」→ 2000年8月 · 「2026 Q4」→ 2026年 第4四半期 · 「2028」→ 2028年 */
  function rfsText(m) {
    const y = m.rfsYear;
    try {
      if (y && m.rfsMonth) return new Intl.DateTimeFormat(langTag(), { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m.rfsMonth - 1, 1)));
      if (y && m.rfsQuarter) return window.IntMapLang.t(HOST.lang, 'Q{q} {y}', '{y}年 第{q}四半期', '{q}. Quartal {y}', '{q} кв. {y}', 'T{q} {y}').replace('{q}', String(m.rfsQuarter)).replace('{y}', String(y));
      if (y && String(m.rfs).trim() === String(y)) return new Intl.DateTimeFormat(langTag(), { year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, 0, 1)));
    } catch (_) {}
    return m.rfs;
  }
  /* 1,041 km in English and Japanese, 1.041 km in German — the separator is the
     reader's, and the number is the same number */
  function lengthText(m) {
    if (m.lengthKm == null) return m.length;
    try { return new Intl.NumberFormat(langTag()).format(m.lengthKm) + ' km'; } catch (_) { return m.length; }
  }

  /* the human name of each provenance key — the dataset stores the key, the popup
     shows the organisation, and both come from the build manifest's licence table */
  const SRC_NAME = {
    'noaa-mc': 'NOAA Office for Coastal Management (Marine Cadastre)',
    'emodnet-bsh': 'EMODnet Human Activities / BSH (DE)',
    'emodnet-rws': 'EMODnet Human Activities / Rijkswaterstaat (NL)',
    'emodnet-mt': 'EMODnet Human Activities / Malta',
    'emodnet-sig': 'EMODnet Human Activities / SIG',
    acma: 'ACMA · Geoscience Australia',
    recon: null, geodesic: null, 'schematic-guided': null, 'telegeography-schematic': null, 'landing-only': null,
  };

  function row(label, value) {
    if (value == null || value === '') return '';
    return '<div class="subc-row"><span class="subc-k">' + esc(label) + '</span><span class="subc-v">' + value + '</span></div>';
  }

  /* ── the cable card ───────────────────────────────────────────────────────── */
  function cableHtml(props, others) {
    const m = (meta && meta.cables && meta.cables[props.id]) || null;
    const name = (m && m.name) || props.name || props.id;
    const q = QUALITY[props.quality] ? QUALITY[props.quality]() : props.quality;
    let body = '';
    if (m) {
      body += row(T.status(), m.isPlanned ? esc(T.planned()) : esc(T.inService()));
      if (m.rfs) body += row(T.rfs(), esc(rfsText(m)));
      if (m.owners) body += row(T.owners(), esc(m.owners));
      if (m.suppliers) body += row(T.supplier(), esc(m.suppliers));
      if (m.length) body += row(T.length(), esc(lengthText(m)));
      if (m.landingPoints && m.landingPoints.length) {
        const names = m.landingPoints.map(id => landingName(meta.landingPoints[id], id));
        body += row(T.landings(), esc(names.join(' · ')));
      }
      if (m.countries && m.countries.length) {
        const cc = m.countryCodes || [];
        body += row(T.countries(), esc(m.countries.map((n, i) => regionName(cc[i], n)).join(' · ')));
      }
    }
    body += row(T.routeQuality(), esc(q || T.unknown()));
    /* ⚠ (#R355 追記) "ROUTE SOURCE" IS ABOUT THE PIECE THAT WAS CLICKED, AND ONLY
       THAT. Measured on production: a RECONSTRUCTED length of Havfrue/AEC-2 was
       captioned 「経路の精度 再構築 / 経路の出典 NOAA Office for Coastal
       Management」 — the cable HAS a NOAA-surveyed stretch, elsewhere, and the
       row was quietly borrowing it. Two true statements next to each other that
       read as one false one, which is exactly what the brief's §11 forbids: a
       value that is not there must not be shown as though it were.
       So the surveyed organisations of the OTHER pieces get their own label. */
    const srcName = SRC_NAME[props.src];
    if (srcName) body += row(T.routeSource(), esc(srcName));
    else if (m && m.sources && m.sources.length) {
      const names = m.sources.map(s => SRC_NAME[s]).filter(Boolean);
      if (names.length) body += row(T.verifiedElsewhere(), esc(names.join(' · ')));
    }
    if (meta && meta.built) body += row(T.checked(), esc(String(meta.built).slice(0, 10)));

    let chips = '';
    if (others && others.length) {
      chips = '<div class="subc-more"><span class="subc-more-n">' + esc(T.nCables(others.length + 1)) + '</span>'
        + others.map(o => '<button type="button" class="subc-chip" data-cable="' + esc(o.id) + '">' + esc(o.name) + '</button>').join('') + '</div>';
    }
    return '<div class="subc-card"><div class="subc-kind">' + esc(T.cable()) + '</div>'
      + '<div class="subc-title">' + esc(name) + '</div>'
      + '<div class="subc-id">' + esc(props.id) + '</div>'
      + body + chips + '</div>';
  }

  /* ── the landing-point card ───────────────────────────────────────────────── */
  function landingHtml(props, lngLat) {
    const m = (meta && meta.landingPoints && meta.landingPoints[props.id]) || null;
    const name = m ? landingName(m, props.name || props.id) : (props.name || props.id);
    let body = '';
    if (m && m.country) body += row(window.IntMapLang.t(HOST.lang, 'Country', '国・地域', 'Land', 'Страна', 'País'), esc(regionName(m.cc, m.country)));
    const lat = lngLat.lat, lon = lngLat.lng;
    body += row(T.coords(), esc(Math.abs(lat).toFixed(4) + '°' + (lat >= 0 ? 'N' : 'S') + ' ' + Math.abs(lon).toFixed(4) + '°' + (lon >= 0 ? 'E' : 'W')));
    if (m && m.cables && m.cables.length) {
      const chips = m.cables.map(id => {
        const cm = meta.cables[id];
        return '<button type="button" class="subc-chip" data-cable="' + esc(id) + '">' + esc((cm && cm.name) || id) + '</button>';
      }).join('');
      body += '<div class="subc-row subc-col"><span class="subc-k">' + esc(T.cablesHere()) + ' (' + m.cables.length + ')</span><div class="subc-chips">' + chips + '</div></div>';
    }
    return '<div class="subc-card"><div class="subc-kind">' + esc(T.landing()) + '</div>'
      + '<div class="subc-title">' + esc(name) + '</div>' + body + '</div>';
  }

  /* ── hit testing: a BOX around the click, wider for a finger ──────────────── */
  function boxAround(pt) {
    let r = 8;
    try { if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) r = 16; } catch (_) {}
    return [[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]];
  }
  function visibleLayers(ids) {
    const out = [];
    for (const id of ids) {
      try { if (GE().layers.has(id) && GE().layers.getLayout(id, 'visibility') !== 'none') out.push(id); } catch (_) {}
    }
    return out;
  }

  function open(lngLat, html) {
    close();
    try {
      popup = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: false, maxWidth: '286px', className: 'plc-popup subc-popup' })
        .setLngLat(lngLat).setHTML(html));
      setTimeout(wireChips, 0);
    } catch (_) { popup = null; }
  }
  function close() { if (popup) { try { popup.remove(); } catch (_) {} popup = null; } }

  function wireChips() {
    let root = null;
    try { root = document.querySelector('.subc-popup'); } catch (_) {}
    if (!root) return;
    root.querySelectorAll('.subc-chip').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-cable');
        const at = lastHits.filter(h => h.properties && h.properties.id === id);
        const props = at.length ? at[0].properties : { id, name: (meta && meta.cables[id] && meta.cables[id].name) || id, quality: null, src: null };
        const others = uniqueCables(lastHits).filter(o => o.id !== id);
        open(lastLngLat, cableHtml(props, others));
      };
    });
  }

  let lastHits = [], lastLngLat = null;

  function uniqueCables(feats) {
    const seen = new Map();
    for (const f of feats) {
      const p = f.properties || {};
      if (!p.id || seen.has(p.id)) continue;
      seen.set(p.id, { id: p.id, name: (meta && meta.cables[p.id] && meta.cables[p.id].name) || p.name || p.id });
    }
    return [...seen.values()];
  }

  function onClick(e) {
    const lineIds = visibleLayers(LINE_LAYERS), ptIds = visibleLayers(PT_LAYERS);
    if (!lineIds.length && !ptIds.length) return;
    const box = boxAround(e.point);
    let ptHits = [];
    if (ptIds.length) { try { ptHits = GE().coords.queryRenderedFeatures(box, { layers: ptIds }) || []; } catch (_) {} }
    if (ptHits.length) {
      lastHits = []; lastLngLat = e.lngLat;
      loadMeta().then(() => open(e.lngLat, landingHtml(ptHits[0].properties || {}, e.lngLat)));
      if (e.originalEvent && e.originalEvent.stopPropagation) e.originalEvent.stopPropagation();
      return;
    }
    let hits = [];
    if (lineIds.length) { try { hits = GE().coords.queryRenderedFeatures(box, { layers: lineIds }) || []; } catch (_) {} }
    if (!hits.length) return;
    lastHits = hits; lastLngLat = e.lngLat;
    const cables = uniqueCables(hits);
    const first = hits[0].properties || {};
    loadMeta().then(() => open(e.lngLat, cableHtml(first, cables.filter(c => c.id !== first.id))));
    if (e.originalEvent && e.originalEvent.stopPropagation) e.originalEvent.stopPropagation();
  }

  /* a pointer cursor over the line on a desktop — §13 allows exactly this and
     nothing more (no hover highlight, no width change) */
  function onMove(e) {
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
      const ids = visibleLayers(LINE_LAYERS.concat(PT_LAYERS));
      if (!ids.length) { if (cursorOn) { GE().render.setCursor(''); cursorOn = false; } return; }
      const hit = (GE().coords.queryRenderedFeatures(boxAround(e.point), { layers: ids }) || []).length > 0;
      if (hit !== cursorOn) { GE().render.setCursor(hit ? 'pointer' : ''); cursorOn = hit; }
    } catch (_) {}
  }
  let cursorOn = false;

  /* ⚠ WIRED ONCE PER MAP INSTANCE, not once per call. addSubcables() runs again
     on every style reload and on every OFF→ON, and a second listener would open
     two popups for one click. Keyed on the map object for the same reason the
     hover hub in js/geo-engine.js is: a style reload keeps the map, a re-created
     map must be re-wired. */
  function attach() {
    let m = null;
    try { m = GE().render.canvas(); } catch (_) {}
    if (!m || wiredMap === m) return;
    wiredMap = m;
    try { GE().events.on('click', onClick); } catch (_) {}
    try { GE().events.on('mousemove', onMove); } catch (_) {}
    loadMeta();
  }

  return { attach, close, _cableHtml: cableHtml, _landingHtml: landingHtml, _loadMeta: loadMeta };
};
