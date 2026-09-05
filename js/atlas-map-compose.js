/* ============================================================================
 *  IntMap · ATLAS — ONE MAP EXPLANATION, DRAWN IN ONE CALL  (#R511)
 * ----------------------------------------------------------------------------
 *  「MapをToolからOutput Modalityへ昇格させる」
 *
 *  ══ WHAT WAS THERE ═══════════════════════════════════════════════════════════════════════════
 *  Atlas could move the camera (`map_view`), colour countries (`highlight`), toggle a layer, and
 *  reach a hundred-odd other capabilities one `find_capability` at a time. What it could NOT do is
 *  the thing a person does when they explain something with a map: put A, B and C down, number
 *  them, draw the flow from A to B, shade the region C, frame the whole thing, and then say what
 *  ① ② ③ mean. That is ONE act of explanation, and IntMap offered it as six or seven separate tool
 *  calls across as many steps — each of which had to be chosen, typed, checked and looked at —
 *  so on most turns Atlas wrote the paragraph and left the map alone. The #R406 policy is right
 *  that whether to use the map is Atlas's decision; what was missing is a way to carry that
 *  decision out in one motion.
 *
 *  ══ WHAT THIS IS ═════════════════════════════════════════════════════════════════════════════
 *  `map.compose` (CORE tool `compose_map`) takes the EXPLANATION — places with roles, links
 *  between them, regions to shade, a title — and compiles it to the map: numbered markers, great-
 *  circle lines with arrowheads, fills through the existing highlight path, one camera fit over
 *  everything that landed, and a legend in the reader's bubble whose rows are the same numbers.
 *  The prose Atlas writes afterwards is linked to those numbers by code (`linkProse`): hovering a
 *  name in the answer lights its marker; hovering a marker lights the name.
 *
 *  ⚠ THE MODEL NAMES PLACES; IT NEVER WRITES A COORDINATE. Every item is resolved the way
 *  js/atlas-geo-ledger.js already resolves: a place this conversation has seen is taken from the
 *  ledger (no second lookup), anything else is geocoded by name+country with the #R489 rule that the
 *  country is appended only when it is not already there, and a place that cannot be resolved in
 *  time is reported as UNPLACED — by name, to Atlas and to the reader — never guessed. Everything
 *  resolved is filed back into the ledger with its ROLE, so the next turn inherits it as data.
 *
 *  ⚠ IT DECIDES NOTHING FOR ATLAS (CONSTITUTION.md §5). It does not choose whether to map, what to
 *  map, or what the places mean. It makes the thing Atlas decided cheap enough to actually do.
 *
 *  ⚠ NO DOM AT CONSTRUCTION, NO NETWORK OF ITS OWN, NO GLOBALS READ. `GE`, `geocode`, `ledger`,
 *  `dispatch` are injected, so tests/r511-checks.test.mjs drives THIS module with a scripted
 *  geocoder and a fake engine and asserts the resolution order, the honesty of `unplaced`, and the
 *  prose linking — the js/atlas-agent.js pattern. The subject is its own file because
 *  js/atlas-console.js has a shrink-only line ceiling (tests/r318 ⓑ) with no room left.
 * ==========================================================================*/

export function makeAtlasMapCompose(deps) {
  return (function () {
    deps = deps || {};
    const GE = deps.GE;                       /* () => the geo engine (js/geo-engine.js) */
    const L = (typeof deps.L === 'function') ? deps.L : ((a) => a);
    const esc = (typeof deps.esc === 'function') ? deps.esc
      : ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]));
    const geocode = deps.geocode;             /* async (query) -> {lng,lat,name,bbox?} | null */
    const ledger = deps.ledger || null;       /* js/atlas-geo-ledger.js */
    const geoObject = deps.geoObject || null; /* js/atlas-geo-object.js — provenance classes */
    const dispatch = deps.dispatch;           /* the console's dispatch, for fills (highlight) */
    const parseColor = deps.parseColor || null;
    const now = (typeof deps.now === 'function') ? deps.now : (() => Date.now());

    /* ── Budgets: measured against js/atlas-verify.js's pinning pass (8 s a name, 20 s a pass) ── */
    const ITEM_TIMEOUT_MS = Math.max(1000, +deps.itemTimeoutMs || 8000);
    const PASS_BUDGET_MS = Math.max(2000, +deps.passBudgetMs || 26000);
    const MAX_ITEMS = 24;
    const MAX_RELATIONS = 24;

    /* ── Sources and layers. ONE source; every layer reads it and filters by `t`. ──────────────
       ⚠ THE SOURCE ID IS ALSO IN js/atlas-capabilities.js paintNow(): the `paint` observer counts
       features here to decide whether a compose actually drew. Renaming one without the other makes
       every compose `not_rendered`. */
    const SRC = 'atl-compose-src';
    const LAYERS = ['atl-compose-line', 'atl-compose-dash', 'atl-compose-arrow', 'atl-compose-c', 'atl-compose-hl', 'atl-compose-n', 'atl-compose-t'];

    /* iOS system colours, in the order markers take them when the model names none. */
    const PALETTE = ['#0a84ff', '#ff453a', '#30d158', '#ff9f0a', '#bf5af2', '#64d2ff', '#ffd60a', '#ff375f', '#5e5ce6', '#ac8e68'];

    /* Kinds whose resolved coordinate stands in for an AREA, not a spot (js/atlas-geo-object.js). */
    const AREA_KINDS = ['country', 'admin1', 'admin2', 'region', 'sea', 'ocean', 'gulf', 'bay', 'basin', 'water', 'desert', 'plateau', 'range', 'continent'];

    let records = [];          /* placed items, in numbering order — what the legend and the prose link read */
    let relations = [];        /* drawn relations */
    let seq = 0;               /* compose counter, for stable record ids across a session */
    let hoverId = '';
    let mapBound = false;

    const str = (v, n) => { const s = String(v == null ? '' : v).trim(); return n ? s.slice(0, n) : s; };
    const num = (v) => { if (v == null || v === '' || typeof v === 'boolean') return null; const x = Number(v); return isFinite(x) ? x : null; };
    const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[‘’“”'".,()（）、。]/g, '').replace(/\s+/g, ' ').trim();
    const isArea = (kind) => AREA_KINDS.indexOf(String(kind || '').toLowerCase()) >= 0;

    function colourOf(v, i) {
      const s = str(v, 40);
      if (s) {
        if (parseColor) { try { const p = parseColor(s); if (p) return p; } catch (_) { /* fall through */ } }
        if (/^#[0-9a-f]{3,8}$/i.test(s) || /^(rgb|hsl)a?\(/i.test(s)) return s;
      }
      return PALETTE[i % PALETTE.length];
    }

    /* ── Great circles: a relation between two far places is an arc, not a chord. ─────────────── */
    function gcPoints(a, b) {
      const toR = Math.PI / 180, toD = 180 / Math.PI;
      const la1 = a.lat * toR, lo1 = a.lng * toR, la2 = b.lat * toR, lo2 = b.lng * toR;
      const d = 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2)));
      const km = d * 6371;
      const n = Math.max(2, Math.min(96, Math.round(km / 120)));
      if (!(d > 1e-9)) return [[a.lng, a.lat], [b.lng, b.lat]];
      const out = [];
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
        const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
        const z = A * Math.sin(la1) + B * Math.sin(la2);
        out.push([Math.atan2(y, x) * toD, Math.atan2(z, Math.sqrt(x * x + y * y)) * toD]);
      }
      return out;
    }
    /* Split at the antimeridian so a Tokyo → San Francisco arc is two pieces, not a line across the world. */
    function splitAntimeridian(pts) {
      const parts = [[pts[0]]];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i];
        if (Math.abs(q[0] - p[0]) > 180) parts.push([q]); else parts[parts.length - 1].push(q);
      }
      const multi = parts.filter((p) => p.length >= 2);
      if (multi.length <= 1) return { type: 'LineString', coordinates: multi[0] || pts };
      return { type: 'MultiLineString', coordinates: multi };
    }

    /* ── The engine side. Every call is guarded: a test without a renderer must still resolve. ── */
    function ensureLayers() {
      if (!GE) return false;
      let g = null;
      try { g = GE(); } catch (_) { g = null; }
      if (!g || !g.layers) return false;
      try {
        /* the literal, not `SRC`: tests/r397 ② finds «where a source is created» by grepping `addSource('<id>'` */
        if (!g.layers.hasSource('atl-compose-src')) g.layers.addSource('atl-compose-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        if (g.layers.has('atl-compose-c')) return true;
        /* ⚠ AT THE TOP OF THE STACK, JUST UNDER THE READER'S OWN PINS. The first draft borrowed the POI
           layer's anchor list («before nlq-poi-c, else nlq-fill, …»), and measured on the preview the
           seven layers landed at index 23–29 of 72 — under `country-fill` at 30 — so three placed
           markers and two arcs rendered ZERO features while the result said ok. A composed marker is
           an annotation like a user pin, and sits where pins sit. */
        const before = ['user-pin-shadow', 'user-pin-dot'].find((id) => { try { return !!g.layers.has(id); } catch (_) { return false; } });
        const font = ['literal', ['Noto Sans Regular']];
        let sub = 11;
        try { if (window.IntMapLabelScale && window.IntMapLabelScale.sub) sub = window.IntMapLabelScale.sub(0.9); } catch (_) { sub = 11; }
        g.layers.add({ id: 'atl-compose-line', type: 'line', source: SRC, filter: ['all', ['==', ['get', 't'], 'rel'], ['!=', ['get', 'dash'], 1]],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'w'], 'line-opacity': 0.85 } }, before);
        g.layers.add({ id: 'atl-compose-dash', type: 'line', source: SRC, filter: ['all', ['==', ['get', 't'], 'rel'], ['==', ['get', 'dash'], 1]],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'w'], 'line-opacity': 0.8, 'line-dasharray': [2, 2] } }, before);
        g.layers.add({ id: 'atl-compose-arrow', type: 'symbol', source: SRC, filter: ['all', ['==', ['get', 't'], 'rel'], ['==', ['get', 'arrow'], 1]],
          layout: { 'symbol-placement': 'line', 'symbol-spacing': 110, 'text-field': '›', 'text-font': font, 'text-size': 18, 'text-keep-upright': false,
            'text-rotation-alignment': 'map', 'text-allow-overlap': true, 'text-ignore-placement': true },
          paint: { 'text-color': ['get', 'color'], 'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1.2 } }, before);
        g.layers.add({ id: 'atl-compose-hl', type: 'circle', source: SRC, filter: ['all', ['==', ['get', 't'], 'pt'], ['==', ['get', 'hl'], 1]],
          paint: { 'circle-radius': 17, 'circle-color': ['get', 'color'], 'circle-opacity': 0.28, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.9 } }, before);
        g.layers.add({ id: 'atl-compose-c', type: 'circle', source: SRC, filter: ['==', ['get', 't'], 'pt'],
          paint: { 'circle-radius': 11, 'circle-color': ['get', 'color'], 'circle-opacity': 0.96, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } }, before);
        g.layers.add({ id: 'atl-compose-n', type: 'symbol', source: SRC, filter: ['==', ['get', 't'], 'pt'],
          layout: { 'text-field': ['get', 'n'], 'text-font': font, 'text-size': 11.5, 'text-allow-overlap': true, 'text-ignore-placement': true },
          paint: { 'text-color': '#ffffff' } }, before);
        g.layers.add({ id: 'atl-compose-t', type: 'symbol', source: SRC, filter: ['==', ['get', 't'], 'pt'], minzoom: 3,
          layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': sub, 'text-offset': [0, 1.25], 'text-anchor': 'top', 'text-optional': true },
          paint: { 'text-color': ['get', 'color'], 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 1.4 } }, before);
        bindMap(g);
        return true;
      } catch (_) { return false; }
    }

    function features() {
      const out = [];
      records.forEach((r) => {
        out.push({ type: 'Feature', id: out.length, geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
          properties: { t: 'pt', id: r.id, n: String(r.n), name: r.name, kind: r.kind, role: r.role, color: r.color, hl: (hoverId && hoverId === r.id) ? 1 : 0 } });
      });
      relations.forEach((rel) => {
        out.push({ type: 'Feature', id: out.length, geometry: rel.geo,
          properties: { t: 'rel', from: rel.from, to: rel.to, type: rel.type, label: rel.label, color: rel.color, w: rel.w, dash: rel.dash ? 1 : 0, arrow: rel.arrow ? 1 : 0 } });
      });
      return { type: 'FeatureCollection', features: out };
    }

    function paint() {
      if (!ensureLayers()) return false;
      try { GE().layers.setSourceData(SRC, features()); return true; } catch (_) { return false; }
    }

    /* ⚠ THE STYLE IS NOT ALWAYS THERE YET. Measured on the preview: a compose dispatched in the first
       seconds after boot found every `addSource` / `addLayer` refused with «Style is not done
       loading», so three placed markers reported `ok:false` and nothing was drawn. An engine that
       cannot answer `getStyle()` is one to wait for — briefly, and only when there is one to ask. */
    function styleReady() {
      if (!GE) return true;
      let g = null;
      try { g = GE(); } catch (_) { return true; }
      if (!g || !g.scene || typeof g.scene.getStyle !== 'function') return true;   /* nothing to wait for (the node checks, a bare adapter) */
      try { const st = g.scene.getStyle(); return !!(st && Array.isArray(st.layers)); } catch (_) { return false; }
    }
    async function awaitStyle(ms) {
      const until = now() + Math.max(0, ms || 0);
      while (!styleReady()) {
        if (now() >= until) return false;
        await new Promise((res) => setTimeout(res, 200));
      }
      return true;
    }

    /** clear() — a new conversation, a reset, or a «clear the map». */
    function clear() {
      records = []; relations = []; hoverId = '';
      try { if (GE && GE().layers.hasSource(SRC)) GE().layers.setSourceData(SRC, { type: 'FeatureCollection', features: [] }); } catch (_) { /* no renderer */ }
    }

    function setVisible(v) {
      try { LAYERS.forEach((id) => { if (GE().layers.has(id)) GE().layers.setVisible(id, !!v); }); } catch (_) { /* no renderer */ }
    }
    function isVisible() {
      try { return LAYERS.some((id) => GE().layers.has(id) && GE().layers.getLayout(id, 'visibility') !== 'none'); } catch (_) { return false; }
    }

    /* ── Resolution: ledger → geocoder, with a clock. Never a guess. ──────────────────────────── */
    function withTimeout(p, ms) {
      let tm = null;
      const clock = new Promise((res) => { tm = setTimeout(() => res(undefined), ms); });
      return Promise.race([Promise.resolve(p), clock]).finally(() => { try { clearTimeout(tm); } catch (_) { /* fired */ } });
    }

    function fromLedger(it) {
      if (!ledger) return null;
      let e = null;
      try {
        const id = str(it.stableId || it.geoId || it.id, 80);
        if (id) e = ledger.resolve(id, {});
        if (!e) e = ledger.resolve(it.name, { kind: str(it.kind, 40) || undefined });
        if (!e && it.name) e = ledger.resolve(it.name, {});
      } catch (_) { e = null; }
      return (e && e.lng != null && e.lat != null) ? e : null;
    }

    async function resolveOne(it, deadline) {
      const name = str(it.name, 120);
      if (!name) return { ok: false, reason: 'no_name' };
      const country = str(it.country, 90);
      const kind = str(it.kind, 40).toLowerCase();
      const known = fromLedger(it);
      if (known) {
        return { ok: true, lng: known.lng, lat: known.lat, canonical: known.canonicalName || known.name, cc: known.countryCode || '',
          provenance: known.provenance || (isArea(known.kind || kind) ? 'resolved_place_centroid' : 'geocoded_point'), bbox: known.bbox || null, source: 'ledger', stableId: known.stableId };
      }
      if (typeof geocode !== 'function') return { ok: false, reason: 'no_geocoder' };
      const left = deadline - now();
      if (left <= 0) return { ok: false, reason: 'timeout' };
      /* (#R489) the country is appended only when it is not already there — 「Kotovsk, Russia, Russia」 returns 0.
         ⚠ AND THE BARE NAME IS THE SECOND TRY, NOT THE ONLY ONE. Measured on the live gazetteer:
         「Strait of Hormuz, Iran」 returns nothing — a strait is not IN a country — while 「Strait of
         Hormuz」 resolves at once. The country narrows a town; it disqualifies a sea. */
      const withCountry = !!(country && norm(name).indexOf(norm(country)) < 0);
      const tries = withCountry ? [name + ', ' + country, name] : [name];
      let g = null;
      for (const q of tries) {
        const remain = deadline - now();
        if (remain <= 0) return { ok: false, reason: 'timeout' };
        try { g = await withTimeout(geocode(q), Math.min(ITEM_TIMEOUT_MS, remain)); } catch (_) { g = null; }
        if (g === undefined) return { ok: false, reason: 'timeout' };
        if (g && num(g.lng) != null && num(g.lat) != null) break;
        g = null;
      }
      if (!g) return { ok: false, reason: 'not_found' };
      const bbox = (g.bbox && Array.isArray(g.bbox) && g.bbox.length === 2) ? [g.bbox[0][0], g.bbox[0][1], g.bbox[1][0], g.bbox[1][1]] : null;
      let cc = '';
      try { if (typeof deps.countryCodeAt === 'function') cc = str(deps.countryCodeAt(+g.lng, +g.lat), 3); } catch (_) { cc = ''; }
      return { ok: true, lng: +g.lng, lat: +g.lat, canonical: str(g.name, 120) || name, cc,
        provenance: isArea(kind) || (bbox && (bbox[2] - bbox[0] > 2 || bbox[3] - bbox[1] > 2)) ? 'resolved_place_centroid' : 'geocoded_point', bbox, source: 'geocode' };
    }

    function fileInLedger(it, res, role) {
      if (!ledger) return '';
      try {
        const e = ledger.record({ stableId: res.stableId || str(it.stableId || it.geoId, 80) || undefined, name: it.name, canonicalName: res.canonical,
          kind: str(it.kind, 40) || 'unknown', countryName: str(it.country, 80), countryCode: res.cc || undefined,
          lng: res.lng, lat: res.lat, provenance: res.provenance, bbox: res.bbox || undefined, role: role, source: res.source === 'ledger' ? undefined : 'compose' });
        return (e && e.stableId) || '';
      } catch (_) { return ''; }
    }

    /* ── Fills: a shaded region goes through the highlight path that already knows every border. ─ */
    async function fill(it, colour, act) {
      if (typeof dispatch !== 'function') return { ok: false, reason: 'no_dispatch' };
      const kind = str(it.kind, 40).toLowerCase();
      const sub = { type: 'highlight', color: colour, interpretation: str(it.role || it.note, 120) || undefined, __paintRun: act && act.__paintRun };
      if (kind === 'country' || !kind) sub.countries = [str(it.name, 120)]; else sub.place = str(it.name, 120);
      let r = null;
      try { r = await withTimeout(dispatch(sub), ITEM_TIMEOUT_MS * 2); } catch (_) { r = null; }
      if (r === undefined) return { ok: false, reason: 'timeout' };
      return { ok: !!(r && r.ok !== false), reason: (r && r.ok === false) ? 'not_found' : '' };
    }

    /* ── Camera: frame everything that landed. ──────────────────────────────────────────────────── */
    function frame(recs) {
      if (!GE || !recs.length) return false;
      try {
        const g = GE();
        if (recs.length === 1) {
          const r = recs[0];
          g.camera.flyTo({ center: [r.lng, r.lat], zoom: Math.min(Math.max(g.camera.getZoom(), isArea(r.kind) ? 4 : 8), isArea(r.kind) ? 6 : 11), duration: 900 });
          return true;
        }
        let w = 180, s = 90, e = -180, n = -90;
        recs.forEach((r) => {
          const b = r.bbox || [r.lng, r.lat, r.lng, r.lat];
          w = Math.min(w, b[0]); s = Math.min(s, b[1]); e = Math.max(e, b[2]); n = Math.max(n, b[3]);
        });
        if (!(e >= w && n >= s) || (e - w) > 340) return false;
        const pad = Math.max(0.15, (e - w) * 0.08, (n - s) * 0.08);
        g.camera.fitBounds([[Math.max(-180, w - pad), Math.max(-85, s - pad)], [Math.min(180, e + pad), Math.min(85, n + pad)]], { padding: 70, maxZoom: 10, duration: 900 });
        return true;
      } catch (_) { return false; }
    }

    /* ── Legend: the same numbers the markers carry, in the bubble. ─────────────────────────────── */
    function legendHtml(title, recs, rels, unplaced, fills) {
      const T = str(title, 120);
      let h = '<div class="atl-cmp">';
      h += '<div class="atl-cmp-h">' + esc(T || L('Places on the map', '地図上の場所', 'Orte auf der Karte', 'Места на карте', 'Lugares en el mapa')) + '</div>';
      if (recs.length) {
        h += '<ol class="atl-cmp-l">' + recs.map((r) => '<li data-geo="' + esc(r.id) + '"><span class="atl-geo-n" style="background:' + esc(r.color) + '">' + r.n + '</span>'
          + '<span class="atl-cmp-nm">' + esc(r.name) + '</span>' + (r.role ? ('<span class="atl-cmp-role">' + esc(r.role) + '</span>') : '') + '</li>').join('') + '</ol>';
      }
      if (rels.length) {
        h += '<div class="atl-cmp-rels">' + rels.map((x) => '<span class="atl-cmp-rel"><span class="atl-geo-n" style="background:' + esc(x.color) + '">' + x.fromN + '</span>'
          + '<span class="atl-cmp-arr">' + (x.arrow ? '→' : '—') + '</span><span class="atl-geo-n" style="background:' + esc(x.color) + '">' + x.toN + '</span>'
          + (x.label ? ('<span class="atl-cmp-rl">' + esc(x.label) + '</span>') : '') + '</span>').join('') + '</div>';
      }
      const fd = (fills || []).filter((f) => f.ok).map((f) => f.name);
      if (fd.length) h += '<div class="atl-cmp-f">' + esc(L('Shaded', '塗り分け', 'Eingefärbt', 'Заливка', 'Sombreado')) + ': ' + esc(fd.join(', ')) + '</div>';
      if (unplaced.length) h += '<div class="atl-cmp-un">' + esc(L('Could not be placed', '配置できなかった場所', 'Nicht platzierbar', 'Не удалось разместить', 'No se pudo ubicar')) + ': ' + esc(unplaced.map((u) => u.name).join(', ')) + '</div>';
      return h + '</div>';
    }

    /**
     * run(a, ctx) -> legacy dispatch result {ok, html, meta, exec}
     *
     * a.items[]      {name, country?, kind?, stableId?, role?, color?, fill?}   the places, in the order to number them
     * a.relations[]  {from, to, type?, label?, color?}                          from/to = an item's name, its 1-based number, or its stableId
     * a.title?       the legend's heading
     * a.camera?      'fit' (default) | 'keep'
     */
    async function run(a, ctx) {
      a = a || {}; ctx = ctx || {};
      const items = (Array.isArray(a.items) ? a.items : []).filter((x) => x && str(x.name)).slice(0, MAX_ITEMS);
      const wantRels = (Array.isArray(a.relations) ? a.relations : []).filter((x) => x && (x.from != null) && (x.to != null)).slice(0, MAX_RELATIONS);
      if (!items.length) {
        return { ok: false, html: '', meta: { code: 'PLACE_NOT_FOUND', category: 'input', retryable: false, produced: [] },
          exec: { status: 'failed', reason: 'no_items', message: 'compose needs at least one item with a name.' } };
      }
      const composeId = 'c' + (++seq);
      const deadline = now() + PASS_BUDGET_MS;
      /* additive within one turn, replaced between turns — the #R489 rule the highlight paths follow */
      const prun = a.__paintRun || null;
      if (!(prun != null && records.length && records[0].run === prun)) { records = []; relations = []; }
      const base = records.length;
      const placed = [], unplaced = [], fills = [];

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const role = str(it.role || it.note, 120);
        const colour = colourOf(it.color, base + placed.length);
        const wantFill = it.fill === true || String(it.style || '').toLowerCase() === 'fill';
        if (wantFill) {
          const f = await fill(it, colour, a);
          fills.push({ name: str(it.name, 120), ok: f.ok, reason: f.reason || '' });
        }
        const res = await resolveOne(it, deadline);
        if (!res.ok) { unplaced.push({ name: str(it.name, 120), reason: res.reason }); continue; }
        const sid = fileInLedger(it, res, role);
        const rec = { id: sid || (composeId + ':' + (base + placed.length + 1)), n: base + placed.length + 1, name: str(it.name, 120), canonical: res.canonical,
          kind: str(it.kind, 40), country: str(it.country, 90), role: role, color: colour, lng: res.lng, lat: res.lat, provenance: res.provenance,
          bbox: res.bbox, source: res.source, compose: composeId, run: prun,
          item: i + 1,   /* the 1-based position in THIS call's `items` — what a numeric `from`/`to` refers to (see below) */
          spellings: [str(it.name, 120), res.canonical].filter(Boolean) };
        placed.push(rec);
      }
      records = records.concat(placed);

      /* relations, against everything placed so far (an earlier compose this turn included).
         ⚠ A NUMBER IN `from`/`to` IS THE POSITION IN THE CALLER'S `items`, NOT THE MARKER NUMBER. The
         model wrote the relation knowing only its own list; the markers are numbered by what LANDED.
         Measured: with item 1 unplaced, «from: 2» resolved to marker 2 — the THIRD item — and the
         second relation reported `same_endpoint`. Names resolve by spelling as before. */
      const byKey = Object.create(null), byItem = Object.create(null);
      records.forEach((r) => { byKey[norm(r.name)] = r; byKey[norm(r.canonical)] = byKey[norm(r.canonical)] || r; byKey[r.id] = r; });
      placed.forEach((r) => { byItem[String(r.item)] = r; });
      const endpoint = (v) => {
        if (typeof v === 'number' || /^\d+$/.test(str(v))) return byItem[str(v)] || null;
        return byKey[norm(v)] || byKey[str(v)] || null;
      };
      const drawn = [], skipped = [];
      wantRels.forEach((x, i) => {
        const A = endpoint(x.from), B = endpoint(x.to);
        if (!A || !B || A === B) { skipped.push({ from: str(x.from, 80), to: str(x.to, 80), reason: (!A || !B) ? 'endpoint_unplaced' : 'same_endpoint' }); return; }
        const type = str(x.type, 20).toLowerCase() || 'link';
        const rel = { from: A.id, to: B.id, fromN: A.n, toN: B.n, type, label: str(x.label, 120), color: colourOf(x.color, base + placed.length + i),
          w: type === 'flow' || type === 'route' ? 3 : 2.2, dash: type === 'influence' || type === 'border' || type === 'claim', arrow: type === 'flow' || type === 'route' || type === 'supply',
          geo: splitAntimeridian(gcPoints(A, B)) };
        relations.push(rel); drawn.push(rel);
      });

      await awaitStyle(Math.min(6000, Math.max(0, deadline - now())));
      const painted = paint();
      if (a.camera !== 'keep') frame(placed.length ? placed : records);

      const anyDrawn = painted && (placed.length > 0 || drawn.length > 0);
      const anyFill = fills.some((f) => f.ok);
      const ok = anyDrawn || anyFill;
      const exec = { status: ok ? (unplaced.length || skipped.length ? 'partial' : 'ok') : 'failed', compose: composeId,
        placed: placed.map((r) => ({ n: r.n, id: r.id, name: r.name, provenance: r.provenance })),
        unplaced, relationsDrawn: drawn.length, relationsSkipped: skipped, fills: fills.length ? fills : undefined,
        note: unplaced.length ? 'The places listed under `unplaced` are NOT on the map. Say so to the reader; do not describe them as shown.' : undefined };
      const html = ok ? legendHtml(a.title, placed, drawn, unplaced, fills) : '';
      const meta = { code: ok ? 'ok' : 'PLACE_NOT_FOUND', produced: ok ? ['map', 'explanation'] : [], compose: { id: composeId, placed: placed.map(pub), unplaced, relations: drawn.length, fills: fills.length } };
      if (!ok) { meta.category = 'input'; meta.retryable = true; meta.message = 'None of the named places could be placed.'; }
      return { ok, html, meta, exec };
    }

    /* what the bubble is allowed to keep about a record — no functions, no engine handles */
    function pub(r) { return { id: r.id, n: r.n, name: r.name, canonical: r.canonical, kind: r.kind, role: r.role, color: r.color, lng: r.lng, lat: r.lat, spellings: r.spellings.slice() }; }

    /**
     * recordsFor(results) — the compose records carried by a set of dispatch results (the bubble's
     * `__atlResults`), so the prose link reads the records that THIS reply drew, not a global.
     */
    function recordsFor(results) {
      const out = [];
      (Array.isArray(results) ? results : []).forEach((r) => {
        const c = r && r.meta && r.meta.compose;
        if (c && Array.isArray(c.placed)) c.placed.forEach((p) => { if (p && p.id && !out.some((o) => o.id === p.id)) out.push(p); });
      });
      return out;
    }

    /**
     * linkProse(html, recs) -> html
     *
     * Wraps the FIRST occurrence of each placed record's spelling in the reply's text nodes with a
     * numbered reference, so the paragraph and the marker share a number. Text nodes only: never
     * inside a tag, an attribute, a link, code or a heading id. The spellings are the ones the model
     * itself wrote in `items` (plus the canonical name), so the prose it writes next matches.
     */
    function linkProse(html, recs) {
      const src = String(html || '');
      if (!src || !Array.isArray(recs) || !recs.length) return src;
      const parts = src.split(/(<[^>]*>)/);
      const done = Object.create(null);
      const SKIP = /^<(a|code|pre|sup|script|style)\b/i, UNSKIP = /^<\/(a|code|pre|sup|script|style)\s*>/i;
      let depth = 0;
      const cands = [];
      recs.forEach((r) => (r.spellings || [r.name]).forEach((s) => { const e = esc(str(s, 120)); if (e && e.length >= 2) cands.push({ id: r.id, n: r.n, color: r.color, s: e, k: e.toLowerCase() }); }));
      cands.sort((x, y) => y.s.length - x.s.length);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p) continue;
        if (p.charAt(0) === '<') { if (SKIP.test(p)) depth++; else if (UNSKIP.test(p)) depth = Math.max(0, depth - 1); continue; }
        if (depth > 0) continue;
        /* ⚠ MATCHES ARE FOUND ON THE ORIGINAL TEXT AND ASSEMBLED AFTERWARDS. Rewriting the string as
           each match lands would put the record id (`data-geo="city:JP:tokyo"`) into the text the
           next candidate searches — and «Tokyoite» taught the first draft that the FIRST occurrence
           is not always the one to take: a word boundary refused must move on to the next one. */
        const lower = p.toLowerCase();
        const taken = [];   /* [start, end, html] — non-overlapping, one per record */
        const free = (s, e) => taken.every((t) => e <= t[0] || s >= t[1]);
        for (const c of cands) {
          if (done[c.id]) continue;
          let from = 0, at = -1;
          while ((at = lower.indexOf(c.k, from)) >= 0) {
            from = at + 1;
            /* a Latin spelling must not be matched inside another word */
            const before = at > 0 ? p.charAt(at - 1) : ' ', after = p.charAt(at + c.s.length) || ' ';
            if (/[A-Za-z0-9]/.test(c.s.charAt(0)) && /[A-Za-z0-9]/.test(before)) continue;
            if (/[A-Za-z0-9]/.test(c.s.charAt(c.s.length - 1)) && /[A-Za-z0-9]/.test(after)) continue;
            if (!free(at, at + c.s.length)) continue;
            taken.push([at, at + c.s.length, '<span class="atl-geo-ref" data-geo="' + esc(c.id) + '">' + p.slice(at, at + c.s.length)
              + '<span class="atl-geo-n" style="background:' + esc(c.color) + '">' + c.n + '</span></span>']);
            done[c.id] = 1;
            break;
          }
        }
        if (!taken.length) continue;
        taken.sort((x, y) => x[0] - y[0]);
        let out = '', pos = 0;
        taken.forEach((t) => { out += p.slice(pos, t[0]) + t[2]; pos = t[1]; });
        parts[i] = out + p.slice(pos);
      }
      return parts.join('');
    }

    /* ── The two-way link. Bubble → map: hover a name, the marker gets a ring. Map → bubble: hover
       a marker, every mention lights; click it, the first mention scrolls into view. ───────────── */
    function focus(id) {
      hoverId = str(id, 120);
      if (records.length) paint();
      try {
        document.querySelectorAll('.atl-geo-on').forEach((el) => el.classList.remove('atl-geo-on'));
        if (hoverId) document.querySelectorAll('[data-geo="' + hoverId.replace(/"/g, '') + '"]').forEach((el) => el.classList.add('atl-geo-on'));
      } catch (_) { /* no DOM */ }
    }
    function bind(el) {
      if (!el || !el.querySelectorAll) return 0;
      let n = 0;
      el.querySelectorAll('[data-geo]').forEach((node) => {
        if (node.__atlGeoBound) return;
        node.__atlGeoBound = true; n++;
        const id = node.getAttribute('data-geo');
        node.addEventListener('mouseenter', () => focus(id));
        node.addEventListener('mouseleave', () => focus(''));
        node.addEventListener('click', (ev) => {
          const r = records.find((x) => x.id === id);
          if (!r) return;
          try { ev.preventDefault(); } catch (_) { /* not an Event */ }
          try { GE().camera.flyTo({ center: [r.lng, r.lat], zoom: Math.max(GE().camera.getZoom(), isArea(r.kind) ? 4 : 7), duration: 700 }); } catch (_) { /* no renderer */ }
        });
      });
      return n;
    }
    function bindMap(g) {
      if (mapBound || !g || !g.events || !g.events.onLayer) return;
      mapBound = true;
      try {
        g.events.onLayer('mousemove', 'atl-compose-c', (e) => { try { const f = e.features && e.features[0]; if (!f) return; g.render.canvas().style.cursor = 'pointer'; const id = f.properties && f.properties.id; if (id && id !== hoverId) focus(id); } catch (_) { /* cosmetic */ } });
        g.events.onLayer('mouseleave', 'atl-compose-c', () => { try { g.render.canvas().style.cursor = ''; } catch (_) { /* cosmetic */ } focus(''); });
        g.events.onLayer('click', 'atl-compose-c', (e) => { try { const f = e.features && e.features[0]; const id = f && f.properties && f.properties.id; if (!id) return;
          const target = document.querySelector('.atl-geo-ref[data-geo="' + String(id).replace(/"/g, '') + '"]') || document.querySelector('[data-geo="' + String(id).replace(/"/g, '') + '"]');
          if (target) { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); target.classList.add('atl-geo-flash'); setTimeout(() => { try { target.classList.remove('atl-geo-flash'); } catch (_) { /* gone */ } }, 1400); } } catch (_) { /* cosmetic */ } });
        g.events.on('styledata', () => { if (records.length || relations.length) setTimeout(() => { try { paint(); } catch (_) { /* renderer swapped */ } }, 160); });
      } catch (_) { /* engine without layer events */ }
    }

    const API = { SRC, LAYERS, PALETTE, run, clear, paint, focus, bind, linkProse, recordsFor, setVisible, isVisible,
      records: () => records.map(pub), relations: () => relations.map((r) => ({ from: r.from, to: r.to, type: r.type, label: r.label })),
      gcPoints, splitAntimeridian };
    try { window.IntMapAtlasCompose = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
