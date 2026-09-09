/* ============================================================================
 *  IntMap · DISEASE OUTBREAKS — window.IntMapOutbreaks  (#R650)
 * ----------------------------------------------------------------------------
 *  「感染症アウトブレイク。WHOのDisease Outbreak Newsを地理化。病原体 / 国・地域 / 発生日 /
 *    WHO公表日 / 症例数 / 死亡数 のイベントレイヤー。WHO自身に現在JSON APIがあります。」
 *
 *  ══ FIVE OF THE SIX FIELDS ARE WHO'S OWN STRUCTURED DATA ═══════════════════════════════════════
 *  Measured 2026-09-09 against https://www.who.int/api/news/ (Sitefinity OData), 3,195 items back
 *  to 1996. `scripts/build-who-don.mjs` explains the shape and the taxon join in full; what matters
 *  here is that NOTHING on this layer is parsed out of a headline:
 *
 *      病原体      EmergencyEvent.Title            98.3 %
 *      国・地域    regionscountries → countries    94.4 % resolve to an ISO-3166 alpha-3 code
 *      発生日      EmergencyEventStartDate         2019+ ≈ 88 %, before 2019 ≈ 0 %
 *      WHO公表日   PublicationDateAndTime          100 %
 *      症例数/死亡数  ── not structured anywhere ──  supabase/functions/who-don asks Atlas
 *
 *  ⚠⚠ 179 ITEMS ARE NOT A COUNTRY AND ARE NOT PUT ON THE MAP. «Yellow fever – Global», «Cholera –
 *  Multi-country», «Oropouche virus disease – Region of the Americas». Dropping a WHO region's
 *  centroid on those would invent a precision WHO did not publish, so the panel LISTS them under
 *  「広域・全球」 and the map draws nothing for them. Three states, kept apart on purpose, because
 *  the warnings layer learned the same lesson (#R297): PLACED / PUBLISHED ABOUT NO ONE COUNTRY /
 *  NOT LOOKED AT. A reader must never have to guess which one a blank means.
 *
 *  ⚠⚠ THE CIRCLE IS SIZED BY SOMETHING THAT IS ALWAYS KNOWN. Case counts are missing for a large
 *  share of the corpus, and a visual channel cannot say «missing» — a small circle and an unknown
 *  circle look the same, which is #R543's 「欠損値が実測0の棒になる」 drawn instead of printed. So
 *  radius = HOW MANY DON ITEMS the clock's window holds for that country (never missing) and colour
 *  = HOW RECENT the newest of them is (never missing). The case and death counts are shown as TEXT,
 *  where 「未抽出」 can be a word.
 *
 *  ⚠ NO RELAY IN FRONT OF THE FEED. WHO answers `Access-Control-Allow-Origin: *` — measured with an
 *  `Origin:` header set to the Pages origin — so the live tail is fetched straight from the page.
 *  #R266: a relay that is not needed is one more thing to be down. The 3,195-item history is bundled
 *  because it costs 32 round trips at WHO's hard `$top=100` cap, which is a build cost, not a page
 *  load cost. `supabase/functions/who-don` exists for the ONE thing the browser cannot do: hold the
 *  provider key that reads a case count out of WHO's prose.
 *
 *  ⚠ ONE PANEL (#R215). The legend, the window picker, the pathogen filter and whatever country is
 *  selected are the SAME box — the app's own `.data-legend.generic-legend`, through `makePanel`.
 *  Its × unchecks the layer row and the layer row drives the layer.
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.outbreaks = function (HOST) {
  const GE = () => window.IntMapGeoEngine;

  window.IntMapOutbreaks = (function () {
    if (!GE().hasRenderer()) return { state: () => ({ on: false }) };
    /* the shared layer-family toolkit — handed over rather than copied (js/world-packs.js `_ui`) */
    const W = (window.IntMapWorld && window.IntMapWorld._ui) || null;
    if (!W) return { state: () => ({ on: false, err: 'world-packs not loaded' }) };
    const { makePanel, ensureHead, row, esc, whenDrawable, onRestyle, centroidOf, withCountryGeo, hiResCountries } = W;

    /* ⚠ EVERY TUPLE IS WRITTEN `L.arr(LA(…))` AT THE CALL SITE. Binding either helper to a shorter
       name takes the whole file out of scripts/i18n-audit.mjs's universe — the audit finds a
       CallExpression whose callee is `IntMapLang.pick…`, so an aliased helper does not merely go
       untranslated, it stops being COUNTED (#R548, #R546). */
    const LA = window.IntMapLang.pickArgs();
    const L = window.IntMapLang.pick(() => HOST.lang);

    const DATA_URL = 'data/who-don.json.gz';
    const WHO_API = 'https://www.who.int/api/news/diseaseoutbreaknews';
    const WHO_SITE = 'https://www.who.int/emergencies/disease-outbreak-news';
    const ITEM_BASE = 'https://www.who.int/emergencies/disease-outbreak-news/item/';

    const SRC = 'who-don-src';
    const LYR_HALO = 'who-don-halo', LYR_PT = 'who-don-pt', LYR_LB = 'who-don-lb';
    const LYR = [LYR_HALO, LYR_PT, LYR_LB];
    const CB_ID = 'wp-dl-outbreaks';

    /* ── the window the clock opens ──────────────────────────────────────────────────────────────
       A DON is an EPISODE of a continuing outbreak, not a state that persists, so «what is on the
       map at time T» has to be «what WHO published in the run-up to T». The length of that run-up
       is a reader's question and not ours, so it is a control. ⚠ The values are days; `null` is
       everything WHO has ever published up to the clock. */
    const WINDOWS = [
      { d: 90, nm: () => LA('90 days', '90日', '90 Tage', '90 дней', '90 días') },
      { d: 365, nm: () => LA('1 year', '1年', '1 Jahr', '1 год', '1 año') },
      { d: 1826, nm: () => LA('5 years', '5年', '5 Jahre', '5 лет', '5 años') },
      { d: null, nm: () => LA('Everything up to this date', 'この日までの全部', 'Alles bis zu diesem Datum', 'Всё до этой даты', 'Todo hasta esta fecha') },
    ];

    let on = false, corpus = null, loading = null, err = null;
    let winDays = 365, pathogen = '', sel = null, tail = { at: 0, n: 0, err: null };
    let shown = [];                 /* the events inside the window, newest first */
    let noOutline = [];             /* ISO codes WHO named that countryGeo has no outline for */
    const counts = Object.create(null);   /* urlName → {cases,deaths,asOf,…} | 'none' */
    let countsAsked = Object.create(null);

    /* ══ THE CLOCK ════════════════════════════════════════════════════════════════════════════════
       ONE master clock (#R94). `state().isLive` means «now», and any other value is the day the
       reader has moved to — the layer answers about that day and re-renders when it moves. */
    function clockDay() {
      try {
        const st = window.IntMapTime.state();
        const d = st.isLive ? new Date() : new Date(st.when);
        return isFinite(d.getTime()) ? d : new Date();
      } catch (_) { return new Date(); }
    }
    const iso = (d) => d.toISOString().slice(0, 10);
    const DAY_MS = 86400000;

    /* ── loading ─────────────────────────────────────────────────────────────────────────────────
       ⚠ THE PROMISE IS THE CACHE, so everything that asks inside one tick shares one request. */
    function load() {
      if (loading) return loading;
      loading = (async () => {
        if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream unavailable');
        const r = await fetch(DATA_URL);
        if (!r.ok || !r.body) throw new Error('who-don ' + r.status);
        const t = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
        const j = JSON.parse(t);
        if (!j || !Array.isArray(j.events)) throw new Error('who-don: not a corpus');
        return j;
      })().then((j) => { corpus = j; err = null; return j; })
        .catch((e) => { loading = null; err = String(e && e.message || e); throw e; });
      return loading;
    }

    /* ══ THE LIVE TAIL ════════════════════════════════════════════════════════════════════════════
       The bundle is as fresh as the last deploy; WHO publishes roughly twice a week. ONE request for
       the newest page keeps the layer current in between, and the taxon→ISO map travels in the
       bundle so the country join is local (see scripts/build-who-don.mjs).
       ⚠ A FAILED TAIL IS NOT AN EMPTY TAIL. `tail.err` is kept and printed; the archive still draws.
       #R499: a fetch that failed must never be counted as a fetch that found nothing. */
    async function fetchTail() {
      if (!corpus) return;
      if (Date.now() - tail.at < 600000 && !tail.err) return;
      const q = new URLSearchParams({
        $top: '100',
        $orderby: 'PublicationDateAndTime desc',
        $select: 'Title,DonId,UrlName,PublicationDateAndTime,regionscountries',
        $expand: 'EmergencyEvent',
      });
      try {
        const r = await fetch(WHO_API + '?' + q.toString().replace(/%24/g, '$'),
          { headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error('WHO ' + r.status);
        const j = await r.json();
        const rows = (j && j.value) || [];
        if (!rows.length) throw new Error('WHO returned no items');
        const have = new Set(corpus.events.map((e) => e.u));
        let added = 0;
        for (const d of rows) {
          const u = String(d.UrlName || '').trim();
          if (!u || have.has(u)) continue;
          const ev = d.EmergencyEvent || null;
          const day = (s) => (typeof s === 'string' && s.length >= 10 ? s.slice(0, 10) : null);
          const c = [];
          for (const g of (d.regionscountries || [])) {
            for (const i of (corpus.taxa[String(g).toLowerCase()] || [])) if (!c.includes(i)) c.push(i);
          }
          corpus.events.push({
            u, n: String(d.DonId || '').trim() || null, t: String(d.Title || '').trim(),
            p: day(d.PublicationDateAndTime), s: ev ? day(ev.EmergencyEventStartDate) : null,
            c: c.sort(), d: ev && ev.Title ? String(ev.Title).trim() : null,
            e: ev && ev.EventId ? String(ev.EventId).trim() : null,
          });
          added++;
        }
        if (added) corpus.events.sort((a, b) => String(b.p || '').localeCompare(String(a.p || '')));
        tail = { at: Date.now(), n: added, err: null };
      } catch (e) {
        tail = { at: Date.now(), n: 0, err: String(e && e.message || e) };
      }
    }

    /* ── selection ───────────────────────────────────────────────────────────────────────────────
       Half-open on the young end: an item published ON the clock's day is in. The old end is
       `now - winDays`, inclusive, so a 90-day window really holds 90 days (#R531: put the half-open
       edge on an endpoint deliberately, not by accident). */
    function inWindow() {
      if (!corpus) return [];
      const now = clockDay();
      const hi = iso(now);
      const lo = winDays == null ? '0000-00-00' : iso(new Date(now.getTime() - winDays * DAY_MS));
      return corpus.events.filter((e) => e.p && e.p <= hi && e.p >= lo &&
        (!pathogen || (e.d || '') === pathogen));
    }

    /** every pathogen WHO named inside the window, with its item count — DISCOVERED, never listed. */
    function pathogens(list) {
      const m = new Map();
      (list || shown).forEach((e) => { if (e.d) m.set(e.d, (m.get(e.d) || 0) + 1); });
      return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }

    function countryName(i) {
      return (corpus && corpus.countries && corpus.countries[i]) || i;
    }

    /* ── the picture ─────────────────────────────────────────────────────────────────────────────
       ONE point per country, carrying the whole window's items for it. Overlapping three thousand
       identical dots would not be an event map, it would be a smear. */
    /* ══ ⚠⚠⚠ (#R650) ONE SNAPSHOT, READ BY BOTH THE MAP AND THE PANEL ═════════════════════════════
       `collection()` used to be called separately by `publish()` and by `open()`, and the panel
       therefore described a DIFFERENT computation from the one the renderer was holding. Measured by
       tests/r650.spec.js ①: the map carried 18 countries from the 110 m outlines while the panel's
       `noOutline` came from a later run against the detailed set, so «drawn + undrawable» came to 19
       against the 20 countries WHO named — a legend that does not describe the map on screen, which
       is #R551's whole lesson. `rebuild()` is now the only place either number is produced. */
    let lastFC = { type: 'FeatureCollection', features: [] };
    function rebuild() { lastFC = collection(); return lastFC; }
    function collection() {
      const byIso = new Map();
      shown.forEach((e) => e.c.forEach((i) => {
        if (!byIso.has(i)) byIso.set(i, []);
        byIso.get(i).push(e);
      }));
      const feats = [];
      noOutline = [];
      const nowMs = clockDay().getTime();
      byIso.forEach((evs, i) => {
        const pt = centroidOf(i);
        /* ══ ⚠⚠ (#R650) A COUNTRY THE MAP HAS NO OUTLINE FOR IS A FOURTH STATE, AND IT IS SAID ═════
           Not «placed», not «WHO published about no one country», not «not looked at» — this is
           «WHO named a country and countryGeo does not carry it» (measured: ESH, XKX, GRL among
           others; the collection holds 258 units). Dropping it silently is how a reader counts the
           circles, gets a smaller number than the panel's, and has no way to learn why. */
        if (!pt) { noOutline.push(i); return; }
        const latest = evs[0];
        const ageD = Math.max(0, Math.round((nowMs - Date.parse(latest.p + 'T00:00:00Z')) / DAY_MS));
        feats.push({
          type: 'Feature', id: undefined,
          geometry: { type: 'Point', coordinates: [pt[0], pt[1]] },
          properties: { iso: i, n: evs.length, age: ageD, nm: countryName(i), top: latest.d || latest.t },
        });
      });
      return { type: 'FeatureCollection', features: feats };
    }

    /* colour = age of the newest item in the window. A sequential ramp, dark/old → hot/new. */
    const AGE_RAMP = ['interpolate', ['linear'], ['get', 'age'],
      0, '#ff3b30', 30, '#ff9f0a', 120, '#ffd60a', 365, '#5ac8fa', 1826, '#5e6b7d'];

    function ensureLayers() {
      const g = GE();
      if (!g.layers.hasSource(SRC)) g.layers.addSource(SRC, { type: 'geojson', data: lastFC });
      if (!g.layers.has(LYR_HALO)) {
        g.layers.add({
          id: LYR_HALO, type: 'circle', source: SRC,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'],
              2, ['+', 7, ['*', 3.2, ['sqrt', ['get', 'n']]]],
              6, ['+', 11, ['*', 5.0, ['sqrt', ['get', 'n']]]]],
            'circle-color': AGE_RAMP, 'circle-opacity': 0.18, 'circle-blur': 0.35,
          },
        });
      }
      if (!g.layers.has(LYR_PT)) {
        g.layers.add({
          id: LYR_PT, type: 'circle', source: SRC,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'],
              2, ['+', 3.5, ['*', 1.7, ['sqrt', ['get', 'n']]]],
              6, ['+', 5, ['*', 2.6, ['sqrt', ['get', 'n']]]]],
            'circle-color': AGE_RAMP, 'circle-opacity': 0.9,
            'circle-stroke-width': 1.1, 'circle-stroke-color': 'rgba(255,255,255,0.85)',
          },
        });
      }
      if (!g.layers.has(LYR_LB)) {
        g.layers.add({
          id: LYR_LB, type: 'symbol', source: SRC,
          layout: {
            'text-field': ['to-string', ['get', 'n']], 'text-size': 10,
            'text-font': ['Noto Sans Regular'], 'text-allow-overlap': false, 'text-offset': [0, 0.05],
          },
          paint: { 'text-color': '#0b0f14', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.1 },
        });
      }
    }

    function publish() {
      try {
        if (GE().layers.hasSource(SRC)) GE().layers.setSourceData(SRC, lastFC);
      } catch (_) { }
    }

    function clear() {
      try { LYR.slice().reverse().forEach((l) => { if (GE().layers.has(l)) GE().layers.remove(l); }); } catch (_) { }
      try { if (GE().layers.hasSource(SRC)) GE().layers.removeSource(SRC); } catch (_) { }
    }

    /* ══ THE CASE AND DEATH COUNTS ════════════════════════════════════════════════════════════════
       WHO does not publish them as data — they exist only inside the prose of each item — so they
       are read by supabase/functions/who-don, which holds the provider key, and cached there for
       every reader. This asks ONLY for the items currently written into the card.
       ⚠ «not extracted yet» is its own answer and is NEVER shown as zero (#R543). */
    function fnBase() {
      try { return ((window.SUPABASE_URL || '').replace(/\/$/, '')) || ''; } catch (_) { return ''; }
    }
    async function needCounts(urls) {
      const b = fnBase(); if (!b) return;
      const want = urls.filter((u) => u && counts[u] === undefined && !countsAsked[u]).slice(0, 100);
      if (!want.length) return;
      want.forEach((u) => { countsAsked[u] = 1; });
      try {
        const r = await fetch(b + '/functions/v1/who-don?ids=' + encodeURIComponent(want.join(',')),
          { headers: { apikey: (window.SUPABASE_ANON_KEY || '') } });
        if (!r.ok) throw new Error('who-don ' + r.status);
        const j = await r.json();
        const rows = (j && j.rows) || {};
        want.forEach((u) => { counts[u] = rows[u] || 'none'; });
        if (on) open();
      } catch (_) {
        /* leave `counts[u]` undefined and clear the ask, so a later open may retry — an outage is
           not an answer about the disease. */
        want.forEach((u) => { delete countsAsked[u]; });
      }
    }

    /* ── the panel ───────────────────────────────────────────────────────────────────────────────*/
    const panel = makePanel('who-don-panel',
      () => L.arr(LA('Disease outbreaks (WHO)', '感染症アウトブレイク（WHO）', 'Krankheitsausbrüche (WHO)', 'Вспышки болезней (ВОЗ)', 'Brotes de enfermedades (OMS)')),
      CB_ID,
      {
        legendId: 'whodon', layers: () => LYR.slice(),
        names: () => LA('Disease outbreaks (WHO)', '感染症アウトブレイク（WHO）', 'Krankheitsausbrüche (WHO)', 'Вспышки болезней (ВОЗ)', 'Brotes de enfermedades (OMS)'),
      });

    const fmt = (n) => { try { return Number(n).toLocaleString(window.IntMapLang.locale(HOST.lang)); } catch (_) { return String(n); } };
    const UNKNOWN = () => L.arr(LA('not extracted yet', '未抽出', 'noch nicht ausgelesen', 'ещё не извлечено', 'aún sin extraer'));
    const NOTSTATED = () => L.arr(LA('not stated by WHO', 'WHO は記載していない', 'von der WHO nicht genannt', 'ВОЗ не указывает', 'la OMS no lo indica'));

    function countLine(e) {
      const c = counts[e.u];
      if (c === undefined) return '<span style="opacity:.6">' + esc(UNKNOWN()) + '</span>';
      if (c === 'none' || (c.cases == null && c.deaths == null)) return '<span style="opacity:.6">' + esc(NOTSTATED()) + '</span>';
      const bits = [];
      if (c.cases != null) bits.push(esc(L.arr(LA('cases', '症例', 'Fälle', 'случаев', 'casos'))) + ' ' + esc(fmt(c.cases)));
      if (c.deaths != null) bits.push(esc(L.arr(LA('deaths', '死亡', 'Todesfälle', 'смертей', 'muertes'))) + ' ' + esc(fmt(c.deaths)));
      if (c.asOf) bits.push('<span style="opacity:.6">(' + esc(L.arr(LA('as of', '時点', 'Stand', 'на', 'al'))) + ' ' + esc(c.asOf) + ')</span>');
      return bits.join(' · ');
    }

    function eventHtml(e) {
      const lbl = (a, b) => '<div style="display:flex;gap:6px;line-height:1.5;"><span style="min-width:5.6em;opacity:.62;">' + a + '</span><span style="flex:1;">' + b + '</span></div>';
      return '<div style="border-top:1px solid rgba(128,128,128,0.22);padding:6px 0;">'
        + '<div style="font-weight:600;margin-bottom:2px;">' + esc(e.d || e.t) + '</div>'
        + (e.d ? '<div style="font-size:9.5px;opacity:.6;margin-bottom:3px;">' + esc(e.t) + '</div>' : '')
        + lbl(esc(L.arr(LA('Outbreak', '発生日', 'Ausbruch', 'Начало', 'Inicio'))), e.s ? esc(e.s) : '<span style="opacity:.6">' + esc(NOTSTATED()) + '</span>')
        + lbl(esc(L.arr(LA('WHO note', 'WHO公表', 'WHO-Meldung', 'Публикация ВОЗ', 'Publicación OMS'))), esc(e.p || ''))
        + lbl(esc(L.arr(LA('Reported', '報告数', 'Gemeldet', 'Сообщено', 'Notificado'))), countLine(e))
        + '<div style="margin-top:3px;"><a href="' + esc(ITEM_BASE + e.u) + '" target="_blank" rel="noopener noreferrer" style="font-size:10px;">'
        + esc(L.arr(LA('Read the WHO item', 'WHO の原文を読む', 'WHO-Meldung lesen', 'Читать сообщение ВОЗ', 'Leer la nota de la OMS'))) + ' ↗</a></div>'
        + '</div>';
    }

    function open() {
      const total = shown.length;
      const unplaced = shown.filter((e) => !e.c.length);
      const feats = lastFC.features;
      const win = WINDOWS.find((w) => w.d === winDays) || WINDOWS[1];

      let b = '<div style="font-size:10.5px;line-height:1.6;">';

      /* what the picture encodes — said in words, because two of the six fields cannot be drawn */
      b += '<div style="opacity:.72;margin-bottom:5px;">'
        + esc(L.arr(LA('Circle size = WHO notes in the window · colour = how recent the newest is.',
          '円の大きさ＝期間内の WHO 公表件数 ／ 色＝いちばん新しいものの新しさ。',
          'Kreisgröße = WHO-Meldungen im Zeitraum · Farbe = Aktualität der neuesten.',
          'Размер круга — число публикаций ВОЗ за период · цвет — свежесть новейшей.',
          'Tamaño = notas de la OMS en el periodo · color = cuán reciente es la más nueva.'))) + '</div>';

      /* the window picker */
      b += '<div style="margin:5px 0;"><div style="opacity:.62;margin-bottom:2px;">'
        + esc(L.arr(LA('Window ending', '期間の終わり', 'Zeitfenster bis', 'Окно до', 'Ventana hasta'))) + ' ' + esc(iso(clockDay())) + '</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:4px;">'
        + WINDOWS.map((w) => '<button data-od-win="' + (w.d == null ? '' : w.d) + '" style="border:1px solid rgba(128,128,128,0.3);border-radius:7px;padding:3px 7px;font-size:10px;cursor:pointer;'
          + (w.d === winDays ? 'background:var(--accent,#0a84ff);color:#fff;' : 'background:var(--input-bg);color:var(--text-main);') + '">'
          + esc(L.arr(w.nm())) + '</button>').join('')
        + '</div></div>';

      b += '<div style="margin:6px 0 2px;">' + esc(fmt(total)) + ' '
        + esc(L.arr(LA('WHO notes', 'WHO 公表', 'WHO-Meldungen', 'публикаций ВОЗ', 'notas de la OMS')))
        + ' · ' + esc(fmt(feats.length)) + ' ' + esc(L.arr(LA('countries on the map', 'か国を地図に', 'Länder auf der Karte', 'стран на карте', 'países en el mapa'))) + '</div>';

      /* the pathogen filter — the list is DISCOVERED from the window, never written down here */
      const ps = pathogens(pathogen ? inWindowAll() : shown);
      if (ps.length) {
        b += '<details style="margin:4px 0;"' + (pathogen ? ' open' : '') + '><summary style="cursor:pointer;opacity:.8;">'
          + esc(L.arr(LA('Pathogen', '病原体', 'Erreger', 'Возбудитель', 'Patógeno')))
          + (pathogen ? (' · <b>' + esc(pathogen) + '</b>') : (' · ' + esc(fmt(ps.length)))) + '</summary>'
          + '<div style="max-height:150px;overflow:auto;margin-top:3px;">'
          + (pathogen ? '<div><button data-od-path="" style="border:0;background:none;color:var(--accent,#0a84ff);cursor:pointer;font-size:10px;padding:1px 0;">← '
            + esc(L.arr(LA('all pathogens', 'すべての病原体', 'alle Erreger', 'все возбудители', 'todos los patógenos'))) + '</button></div>' : '')
          + ps.slice(0, 60).map(([nm, n]) => '<div><button data-od-path="' + esc(nm) + '" style="border:0;background:none;color:var(--text-main);cursor:pointer;font-size:10px;padding:1px 0;text-align:left;'
            + (nm === pathogen ? 'font-weight:700;' : '') + '">' + esc(nm) + ' <span style="opacity:.55">' + esc(fmt(n)) + '</span></button></div>').join('')
          + '</div></details>';
      }

      /* ⚠ THE ITEMS THAT ARE NOT ON THE MAP ARE NAMED, NOT SILENTLY DROPPED. */
      if (unplaced.length) {
        b += '<details style="margin:4px 0;"><summary style="cursor:pointer;opacity:.8;">'
          + esc(L.arr(LA('Not one country', '広域・全球', 'Kein einzelnes Land', 'Не одна страна', 'No es un solo país')))
          + ' · ' + esc(fmt(unplaced.length)) + '</summary>'
          + '<div style="max-height:180px;overflow:auto;margin-top:3px;">'
          + '<div style="opacity:.62;font-size:9.5px;margin-bottom:3px;">'
          + esc(L.arr(LA('WHO published these about a region or the whole world, so they are listed and not placed.',
            'WHO が地域または全球について公表したもの。座標を推測しないので、一覧にだけ出します。',
            'Die WHO hat diese über eine Region oder die ganze Welt veröffentlicht — daher gelistet, nicht verortet.',
            'ВОЗ опубликовала их о регионе или всём мире, поэтому они в списке, но не на карте.',
            'La OMS las publicó sobre una región o el mundo entero: se listan, no se ubican.'))) + '</div>'
          + unplaced.slice(0, 40).map(eventHtml).join('') + '</div></details>';
        needCounts(unplaced.slice(0, 40).map((e) => e.u));
      }

      /* ⚠ AND THE FOURTH STATE IS PRINTED TOO — see the ⚠ in `collection()`. */
      if (noOutline.length) {
        b += '<div style="opacity:.62;margin:3px 0;">'
          + esc(L.arr(LA('No outline on this map for', 'この地図に輪郭が無い国', 'Keine Umrisse auf dieser Karte für', 'На этой карте нет контура для', 'Sin contorno en este mapa para')))
          + ' ' + esc(noOutline.map(countryName).join(', ')) + '</div>';
      }

      /* the selected country */
      if (sel) {
        const evs = shown.filter((e) => e.c.includes(sel));
        b += '<div style="margin-top:7px;border-top:1px solid rgba(128,128,128,0.3);padding-top:5px;">'
          + '<div style="font-weight:700;">' + esc(countryName(sel)) + ' <span style="opacity:.6;font-weight:400;">' + esc(fmt(evs.length)) + '</span></div>'
          + '<div style="max-height:260px;overflow:auto;">' + evs.slice(0, 40).map(eventHtml).join('') + '</div></div>';
        needCounts(evs.slice(0, 40).map((e) => e.u));
      } else if (feats.length) {
        b += '<div style="opacity:.6;margin-top:5px;">'
          + esc(L.arr(LA('Tap a circle for the items behind it.', '円をタップすると、その中身が出ます。', 'Auf einen Kreis tippen für die Meldungen dahinter.', 'Нажмите на круг, чтобы увидеть публикации.', 'Toca un círculo para ver sus notas.'))) + '</div>';
      }

      if (!total) {
        b += '<div style="opacity:.7;margin-top:5px;">'
          + esc(L.arr(LA('WHO published no Disease Outbreak News in this window.', 'この期間に WHO の Disease Outbreak News はありません。', 'Die WHO hat in diesem Zeitraum keine Disease Outbreak News veröffentlicht.', 'ВОЗ не публиковала Disease Outbreak News в этот период.', 'La OMS no publicó Disease Outbreak News en este periodo.'))) + '</div>';
      }

      /* ⚠ THE STATE OF THE LIVE TAIL IS PRINTED. «Could not refresh» and «nothing new» are not the
         same sentence and a reader must be able to tell which one they are looking at (#R499). */
      b += '<div style="margin-top:7px;font-size:9.5px;opacity:.6;line-height:1.5;">'
        + esc(L.arr(LA('Archive built', 'アーカイブ生成', 'Archiv erstellt', 'Архив собран', 'Archivo generado'))) + ' ' + esc((corpus && corpus.built) || '?')
        + (tail.err
          ? (' · <span style="color:var(--warn,#ff9f0a)">' + esc(L.arr(LA('could not check WHO for newer items', 'WHO の最新分を確認できませんでした', 'Neuere WHO-Meldungen nicht abrufbar', 'не удалось проверить новые публикации ВОЗ', 'no se pudo comprobar si hay notas nuevas'))) + '</span>')
          : (' · ' + esc(L.arr(LA('checked WHO for newer items', 'WHO の最新分を確認済み', 'auf neuere WHO-Meldungen geprüft', 'проверены новые публикации ВОЗ', 'comprobadas las notas nuevas'))) + (tail.n ? (' +' + esc(fmt(tail.n))) : '')))
        + '<br><a href="' + esc(WHO_SITE) + '" target="_blank" rel="noopener noreferrer">' + esc(L.arr(LA('Source: WHO Disease Outbreak News', '出典: WHO Disease Outbreak News', 'Quelle: WHO Disease Outbreak News', 'Источник: WHO Disease Outbreak News', 'Fuente: WHO Disease Outbreak News'))) + ' ↗</a>'
        + '</div>';

      if (err) {
        b += '<div style="margin-top:5px;color:var(--warn,#ff9f0a);">'
          + esc(L.arr(LA('Could not load the outbreak archive.', 'アウトブレイクのアーカイブを読み込めませんでした。', 'Ausbruchsarchiv konnte nicht geladen werden.', 'Не удалось загрузить архив вспышек.', 'No se pudo cargar el archivo de brotes.'))) + '</div>';
      }
      b += '</div>';
      panel.open(b);
      wire();
    }

    /* the same window, ignoring the pathogen filter — so the filter list never shrinks to itself */
    function inWindowAll() {
      const keep = pathogen; pathogen = '';
      const all = inWindow();
      pathogen = keep;
      return all;
    }

    function wire() {
      const el = panel.body && panel.body();
      const root = el || document;
      try {
        root.querySelectorAll('[data-od-win]').forEach((btn) => btn.addEventListener('click', () => {
          const v = btn.getAttribute('data-od-win');
          winDays = v === '' ? null : Number(v);
          render();
        }));
        root.querySelectorAll('[data-od-path]').forEach((btn) => btn.addEventListener('click', () => {
          pathogen = btn.getAttribute('data-od-path') || '';
          sel = null; render();
        }));
      } catch (_) { }
    }

    function render() {
      shown = inWindow();
      if (sel && !shown.some((e) => e.c.includes(sel))) sel = null;
      rebuild();
      whenDrawable(() => { if (!on) return; ensureLayers(); publish(); });
      open();
    }

    /* ── the switch ──────────────────────────────────────────────────────────────────────────────*/
    /* ══ ⚠⚠⚠ (#R650) THE OUTLINES ARRIVE OVER THE NETWORK, AND THE FIRST DRAW HAD NOT WAITED ═══════
       `centroidOf` reads `HOST.countryGeo`, which js/countries-ui.js fetches from Natural Earth.
       Switching the layer on before it lands made EVERY centroid null and the layer drew NOTHING —
       and nothing put it back, because the only things that called `publish()` were the switch, the
       window buttons and a restyle. MEASURED by tests/r650.spec.js ①: 0 features with two playwright
       workers, 18 of 20 with one — i.e. a race whose slow side is what CI would see.
       ⇒ wait for the collection, and repaint again when `hiResCountries` swaps in the detailed set
       (a unit the 110 m stand-in lacks can only appear then — see the ⚠ on `centroidOf`). */
    let _hiResAsked = false;
    function toggle(v) {
      on = !!v;
      if (!on) { clear(); panel.hide(); return; }
      /* ⚠⚠⚠ THE BUNDLE DRAWS FIRST, AND THE TAIL ONLY EVER ADDS. The first version chained
         `render()` BEHIND `fetchTail()`, which made the whole layer wait on who.int — measured at
         2.1 s on a good day, and on a bad one the map would have stayed empty behind a feed this
         file's own header calls best-effort. That is the shape #R499 names: a fetch that failed
         being allowed to stand for «there is nothing». The archive is on disk and needs no network,
         so it is drawn as soon as the outlines are here; the tail re-renders when (and if) it
         lands. tests/r650.spec.js ① is what caught it — the gate saw 0 features for 1.6 s. */
      Promise.all([load(), withCountryGeo()])
        .then(() => {
          if (!on) return;
          render();
          if (!_hiResAsked) { _hiResAsked = true; try { hiResCountries(() => { if (on) { rebuild(); publish(); open(); } }); } catch (_) { } }
        })
        .catch(() => { if (on) { shown = []; open(); } })
        .then(() => fetchTail())
        .then(() => { if (on && corpus) render(); });
      open();
    }

    /* clicking a circle selects that country */
    /* ⚠ `onLayer`, NOT `on` — the registration IS the record of what is clickable, and that record
       is what stops a tap on this circle from also opening the place label beneath it (#R207). */
    try {
      GE().events.onLayer('click', LYR_PT, (e) => {
        try {
          const f = e.features && e.features[0];
          if (!f) return;
          sel = f.properties && f.properties.iso;
          open();
        } catch (_) { }
      });
      GE().events.onLayer('mouseenter', LYR_PT, () => { try { GE().render.setCursor('pointer'); } catch (_) { } });
      GE().events.onLayer('mouseleave', LYR_PT, () => { try { GE().render.setCursor(''); } catch (_) { } });
    } catch (_) { }

    /* a basemap swap drops every added layer (#R72) — but a restyle that left them standing is not
       a reason to rebuild (#R258). */
    onRestyle(() => {
      if (!on) return;
      try { if (GE().layers.has(LYR_PT) && GE().layers.hasSource(SRC)) return; } catch (_) { }
      whenDrawable(() => { if (on) { ensureLayers(); publish(); } });
    });

    /* ⚠ ONE clock, one subscription. Moving the time axis re-selects the window and repaints. */
    try { window.IntMapTime.on(() => { if (on) render(); }); } catch (_) { }

    /* the layer row, under the same "World data" heading the family shares */
    function buildUI() {
      const dd = ensureHead(); if (!dd) return;
      const cb = row(dd, CB_ID, L.arr(LA('Disease outbreaks (WHO)', '感染症アウトブレイク（WHO）', 'Krankheitsausbrüche (WHO)', 'Вспышки болезней (ВОЗ)', 'Brotes de enfermedades (OMS)')), '#ff375f');
      if (!cb || cb.__odWired) return; cb.__odWired = true;
      cb.addEventListener('change', (e) => {
        const r = e.target.closest('.lyr-row'); if (r) r.classList.toggle('on', e.target.checked);
        try { toggle(e.target.checked); } catch (x) { console.warn('outbreaks toggle', x); }
      });
    }
    if (document.readyState !== 'loading') setTimeout(buildUI, 0); else document.addEventListener('DOMContentLoaded', buildUI);
    window.addEventListener('intmap-lang', () => setTimeout(() => {
      const e = document.getElementById(CB_ID + '-lbl');
      if (e) e.textContent = L.arr(LA('Disease outbreaks (WHO)', '感染症アウトブレイク（WHO）', 'Krankheitsausbrüche (WHO)', 'Вспышки болезней (ВОЗ)', 'Brotes de enfermedades (OMS)'));
      if (on) open();
    }, 20));

    /* the choice travels in a share link, like the rest of the family (#R211) */
    try {
      window.IntMapShareState && window.IntMapShareState.register('outbreaks', {
        get() { return on ? { w: winDays == null ? 0 : winDays, p: pathogen || '', s: sel || '' } : null; },
        set(v) {
          if (!v) return;
          if (v.w != null) winDays = Number(v.w) === 0 ? null : Number(v.w);
          pathogen = String(v.p || ''); sel = String(v.s || '') || null;
          const cb = document.getElementById(CB_ID);
          if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
        },
      });
    } catch (_) { }

    /* ══ THE KERNEL COMMANDS ══════════════════════════════════════════════════════════════════════
       CONSTITUTION: every feature is operable from Atlas, and that is true because the button and
       Atlas call the SAME registered command (#R353) — not because Atlas simulates a click. */
    function setRow(v) {
      const cb = document.getElementById(CB_ID);
      if (cb && !!cb.checked !== !!v) { cb.checked = !!v; cb.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      return false;
    }
    try {
      window.IntMapOS && window.IntMapOS.register && window.IntMapOS.register('outbreaks.open', () => { setRow(true); return { ok: true }; });
      window.IntMapOS && window.IntMapOS.register && window.IntMapOS.register('outbreaks.close', () => { setRow(false); return { ok: true }; });
    } catch (_) { }

    /* the layer registry — how Atlas reads what is actually drawn (js/map-ui.js `register`) */
    try {
      window.IntMapLayers && window.IntMapLayers.register('outbreaks', {
        label: () => L.arr(LA('Disease outbreaks (WHO)', '感染症アウトブレイク（WHO）', 'Krankheitsausbrüche (WHO)', 'Вспышки болезней (ВОЗ)', 'Brotes de enfermedades (OMS)')),
        on: () => on,
        featuresIn: (bounds) => {
          try {
            const b = bounds || GE().camera.getBounds();
            const w = b.getWest ? b.getWest() : b[0][0], e = b.getEast ? b.getEast() : b[1][0];
            const s = b.getSouth ? b.getSouth() : b[0][1], n = b.getNorth ? b.getNorth() : b[1][1];
            return lastFC.features.filter((f) => {
              const c = f.geometry.coordinates;
              return c[0] >= w && c[0] <= e && c[1] >= s && c[1] <= n;
            });
          } catch (_) { return null; }
        },
        summary: () => (on && corpus)
          ? (shown.length + ' ' + L.arr(LA('WHO notes', 'WHO 公表', 'WHO-Meldungen', 'публикаций ВОЗ', 'notas de la OMS'))
            + (pathogen ? (' · ' + pathogen) : ''))
          : null,
        time: () => (winDays == null ? ('… → ' + iso(clockDay())) : (iso(new Date(clockDay().getTime() - winDays * DAY_MS)) + ' → ' + iso(clockDay()))),
        source: () => 'WHO Disease Outbreak News',
      });
    } catch (_) { }

    /* ══ THE ATLAS ENTRY POINT ════════════════════════════════════════════════════════════════════
       js/atlas-console.js dispatches ONE line to here (that file is at its line ceiling, tests/r318
       ⓑ), so the body of the capability lives with the layer it operates — the same arrangement
       js/shakemap.js has. ⚠ IT ANSWERS FROM WHAT IS ACTUALLY DRAWN: every number below is counted
       out of `shown`, which is the same array the circles are built from, so the reply and the map
       cannot disagree (#R551). */
    async function run(a) {
      a = a || {};
      const act = String(a.action || (a.close ? 'close' : 'open')).toLowerCase();
      if (act === 'close') {
        setRow(false);
        return { ok: true, html: L.arr(LA('Closed the outbreak layer.', 'アウトブレイクのレイヤーを閉じました。', 'Ausbruchs-Ebene geschlossen.', 'Слой вспышек закрыт.', 'Capa de brotes cerrada.')) };
      }
      if (a.days != null || a.all) winDays = a.all ? null : (Number(a.days) === 0 ? null : Number(a.days));
      try { await load(); } catch (_) {
        return { ok: false, html: L.arr(LA('Could not load the WHO outbreak archive.', 'WHO のアウトブレイク・アーカイブを読み込めませんでした。', 'Das WHO-Ausbruchsarchiv konnte nicht geladen werden.', 'Не удалось загрузить архив вспышек ВОЗ.', 'No se pudo cargar el archivo de brotes de la OMS.')), meta: { code: 'unavailable' } };
      }
      await fetchTail();

      /* ⚠ A PATHOGEN IS MATCHED AGAINST WHAT WHO ACTUALLY NAMED, and a name that matches nothing is
         REFUSED rather than silently ignored — an unfiltered map returned under a filtered question
         is a wrong answer that looks like a right one (#R515). */
      if (a.pathogen != null) {
        const want = String(a.pathogen).trim().toLowerCase();
        if (!want) pathogen = '';
        else {
          pathogen = '';
          const all = inWindow();
          const names = [...new Set(all.map((e) => e.d).filter(Boolean))];
          const hit = names.find((n) => n.toLowerCase() === want) ||
            names.find((n) => n.toLowerCase().indexOf(want) >= 0);
          if (!hit) {
            return {
              ok: false, meta: { code: 'not_found', pathogens: names.slice(0, 40) },
              html: L.arr(LA('WHO published no Disease Outbreak News about that in this window.', 'この期間に、それについての WHO の Disease Outbreak News はありません。', 'Die WHO hat dazu in diesem Zeitraum keine Disease Outbreak News veröffentlicht.', 'ВОЗ не публиковала об этом Disease Outbreak News в этот период.', 'La OMS no publicó Disease Outbreak News sobre eso en este periodo.')),
            };
          }
          pathogen = hit;
        }
      }
      setRow(true);
      if (!on) { on = true; }
      render();
      if (a.country) {
        const q = String(a.country).trim();
        const up = q.toUpperCase();
        const hit = /^[A-Z]{3}$/.test(up) ? up
          : Object.keys((corpus && corpus.countries) || {}).find((i) => corpus.countries[i].toLowerCase() === q.toLowerCase());
        if (hit) { sel = hit; open(); }
      }
      /* the counts for what the answer is about — asked once, cached for every reader */
      const top = shown.slice(0, 25);
      await needCounts(top.map((e) => e.u));

      const byC = new Map();
      shown.forEach((e) => e.c.forEach((i) => byC.set(i, (byC.get(i) || 0) + 1)));
      const lead = [...byC.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
      const line = (k, v) => '<div style="display:flex;gap:8px;"><span style="opacity:.62;min-width:8em;">' + k + '</span><span>' + v + '</span></div>';
      const html = line(esc(L.arr(LA('Time window', '期間', 'Zeitraum', 'Период', 'Periodo'))),
        esc((winDays == null ? '…' : iso(new Date(clockDay().getTime() - winDays * DAY_MS))) + ' → ' + iso(clockDay())))
        + line(esc(L.arr(LA('WHO notes', 'WHO 公表', 'WHO-Meldungen', 'публикаций ВОЗ', 'notas de la OMS'))), esc(fmt(shown.length)))
        + (pathogen ? line(esc(L.arr(LA('Pathogen', '病原体', 'Erreger', 'Возбудитель', 'Patógeno'))), esc(pathogen)) : '')
        + line(esc(L.arr(LA('Countries drawn', '地図上の国', 'Länder gezeichnet', 'Стран на карте', 'Países dibujados'))), esc(fmt(byC.size)))
        + (lead.length ? line(esc(L.arr(LA('Most notes', '最多', 'Meiste Meldungen', 'Больше всего', 'Más notas'))),
          lead.map(([i, n]) => esc(countryName(i)) + ' ' + esc(fmt(n))).join(' · ')) : '')
        + (shown.some((e) => !e.c.length) ? line(esc(L.arr(LA('Not one country', '広域・全球', 'Kein einzelnes Land', 'Не одна страна', 'No es un solo país'))),
          esc(fmt(shown.filter((e) => !e.c.length).length)) + ' <span style="opacity:.62">' + esc(L.arr(LA('listed, not placed', '一覧のみ・地図には無し', 'gelistet, nicht verortet', 'в списке, не на карте', 'listadas, no ubicadas'))) + '</span>') : '');

      return {
        ok: true, html,
        meta: {
          code: 'ok', asOf: iso(clockDay()), window: winDays, pathogen: pathogen || null,
          notes: shown.length, countries: byC.size,
          unplaced: shown.filter((e) => !e.c.length).length,
          /* ⚠ THE ITEMS THEMSELVES, so the answer quotes WHO rather than paraphrasing a count. */
          items: top.map((e) => ({
            id: e.u, title: e.t, pathogen: e.d, countries: e.c.slice(),
            outbreakStart: e.s, published: e.p,
            cases: (counts[e.u] && counts[e.u] !== 'none') ? counts[e.u].cases : null,
            deaths: (counts[e.u] && counts[e.u] !== 'none') ? counts[e.u].deaths : null,
            countsKnown: !!(counts[e.u] && counts[e.u] !== 'none' && counts[e.u].cases != null),
            url: ITEM_BASE + e.u,
          })),
          source: 'WHO Disease Outbreak News',
        },
      };
    }

    return {
      toggle, run,
      /** the window, in days; null = everything up to the clock */
      setWindow: (d) => { winDays = (d == null || Number(d) === 0) ? null : Number(d); if (on) render(); return winDays; },
      windows: () => WINDOWS.map((w) => w.d),
      /** narrow to one pathogen, exactly as WHO names it. '' clears. */
      setPathogen: (p) => { pathogen = String(p || ''); sel = null; if (on) render(); return pathogen; },
      pathogens: () => pathogens().map(([nm, n]) => ({ name: nm, notes: n })),
      select: (i) => { sel = String(i || '').toUpperCase() || null; if (on) open(); return sel; },
      /** every item the window holds — what Atlas answers questions from */
      events: () => shown.map((e) => ({
        id: e.u, donId: e.n, title: e.t, pathogen: e.d, event: e.e,
        countries: e.c.slice(), outbreakStart: e.s, published: p2(e.p),
        cases: (counts[e.u] && counts[e.u] !== 'none') ? counts[e.u].cases : null,
        deaths: (counts[e.u] && counts[e.u] !== 'none') ? counts[e.u].deaths : null,
        url: ITEM_BASE + e.u,
      })),
      loaded: () => !!corpus,
      state: () => ({
        on, err, window: winDays, pathogen, selected: sel,
        asOf: iso(clockDay()),
        total: corpus ? corpus.events.length : 0,
        shown: shown.length,
        placed: shown.filter((e) => e.c.length).length,
        unplaced: shown.filter((e) => !e.c.length).length,
        /* ⚠ BOTH OF THESE COME FROM THE SAME `rebuild()` — see the ⚠ above it. `drawn` is what the
           map is holding; `noOutline` is why the rest of WHO's countries are not on it. */
        drawn: lastFC.features.length,
        noOutline: noOutline.slice(),
        built: corpus ? corpus.built : null,
        tail: { added: tail.n, err: tail.err },
        source: 'WHO Disease Outbreak News',
      }),
    };
    function p2(s) { return s || null; }
  })();
};
