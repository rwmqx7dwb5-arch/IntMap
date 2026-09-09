/* ============================================================================
 *  IntMap · THE WAVE LAYER — window.IntMapWaves  (#R572)
 * ----------------------------------------------------------------------------
 *  The row in the Layers panel, the legend, the model switch and the plumbing between the forecast
 *  reader (js/wx-ecmwf.js) and the renderer (js/waves-gl.js). This file draws nothing itself and it
 *  fetches nothing itself: it is the join.
 *
 *  ── WHAT EACH PIECE OWNS, SO NO TWO OF THEM HOLD THE SAME FACT ───────────────────────────────────
 *    js/waves-palette.js  the colour ramp — Windy's own 1024-entry LUT, byte for byte, and the CSS
 *                         gradient this legend's bar is painted with. No colour is written here.
 *    js/waves-gl.js       the raster pass and the particle pass. It is handed a grid and a viewport
 *                         and knows nothing about models, hours or panels.
 *    js/wx-ecmwf.js       the time axis, the forecast steps, the read queue, the block cache and the
 *                         master clock (it subscribes to window.IntMapTime itself — see its
 *                         `_followClock`). One instance per model, `window.IntMapWxEngine.model(id)`.
 *    js/wx-models.js      WHICH models may draw this layer. ⚠ ASKED, NEVER SPELLED: the roster is
 *                         `roles` contains 'wave', so a third wave model added there appears in this
 *                         legend's picker with no edit here, and a model id written into this file
 *                         would be the first thing to go stale.
 *
 *  ── ⚠⚠⚠ ONE READ CARRIES TWO FIELDS, AND THE SECOND ONE IS NOT WHAT IT SAYS ─────────────────────
 *  MEASURED (#R572, SDK 0.0.19): asking for `wave_direction` returns `wave_height`'s numbers. The
 *  reader has a DERIVATION RULE for the pair — either name reads both files and answers
 *  `{values: height, directions: direction}`, the same shape it uses for wind u/v — so this module
 *  asks for `wave_height` ONCE and takes the direction off `.directions`. `wave_period` matches no
 *  rule and is read on its own. Asking for `wave_direction` here would have painted the height field
 *  as the direction field, which looks like a renderer fault and is not one.
 *
 *  ── ⚠⚠ THE ROW ORDER IS NOT ASSUMED, AND IT IS NOT A TABLE OF PLACES EITHER ──────────────────────
 *  The renderer indexes the grid as `iy * nx + ix` with row 0 at `latMin`. Whether the decoded array
 *  is in that order is a property of the upstream file, so it is ASKED rather than declared:
 *  `sampler()` is the SDK's own point read — the same one the coordinate readout prints numbers from
 *  — so «which latitude does row `iy` hold?» is answered by the module that decoded it. Only when
 *  that read is unavailable (0.0.19's grid object exposes no public point read on every domain) does
 *  this fall back to the grid's OWN declaration, `latMin + iy·dy`, which is what `domainOptions`
 *  states. Nothing here knows where the Atlantic is; a probe table of seven oceans would be a second
 *  copy of the world, and the first one to be wrong about a new domain.
 *
 *  ── ⚠ ON THE GLOBE TOO — WHICH WINDY DOES NOT DO ─────────────────────────────────────────────────
 *  Windy's own `waves` overlay carries `globeNotSupported`, and this layer copied that: it refused to
 *  paint while the view was spherical and said why. ⚠ THAT WAS THE WRONG THING TO COPY. IntMap OPENS
 *  ON THE GLOBE, so a flat-only wave layer draws nothing in the view every reader starts in — the
 *  match with Windy would have been perfect in a view most readers never reach. js/waves-gl.js
 *  projects through MapLibre's own `projectTile` prelude and unprojects the particles by ray/sphere
 *  intersection, so there is nothing left here to refuse. The FLAT picture is unchanged to the pixel;
 *  what is new is a spherical one Windy has no counterpart for.
 * ==========================================================================*/
import './waves-palette.js';
import './waves-gl.js';

window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.waves = function (HOST) {
  const GE = () => window.IntMapGeoEngine;
  const L = window.IntMapLang.pick(() => HOST.lang);
  const LA = window.IntMapLang.pickArgs();
  const WXM = () => window.IntMapWxModels;
  const ENG = () => window.IntMapWxEngine;
  const PAL = () => window.IntMapWavePalette;
  const GLR = () => window.IntMapWavesGL;

  const ROW_ID = 'waves';                     /* the checkbox is `dl-waves` (js/data-layers.js) */
  const LYR = 'im-waves';                     /* the custom layer's id on the map */
  const LEG = 'data-legend-waves';
  /* ⚠ `wave_height` reads the direction too — see the header. `wave_direction` is deliberately NOT
     in this list: asking for it returns the height a second time. */
  const VAR_H = 'wave_height', VAR_P = 'wave_period';

  /* ── the models that may draw this layer ─────────────────────────────────────────────────────
     Discovered from the registry by ROLE, in the registry's own order. A model added to
     js/wx-models.js with `roles:['wave']` appears in the picker; nothing here names one. */
  const MODELS = () => { try { return WXM().all().filter(m => m.map && m.roles.indexOf('wave') >= 0); } catch (_) { return []; } };

  const st = {
    on: false,
    op: 1,                       /* the renderer's own opacity, 0–1 */
    particles: true,
    modelId: '',                 /* what the reader asked for */
    loading: null,               /* what is being built right now, or null */
    displayed: null,             /* ⚠ what is actually painted — everything the reader is told comes from here */
    orientation: '',             /* how the row order was decided: 'sampler' | 'declared' */
    blocked: ''                  /* why nothing is painted, when nothing is: 'globe' | 'renderer' | '' */
  };
  st.modelId = (MODELS()[0] || {}).id || '';

  let renderer = null, box = null, wired = Object.create(null), paintSeq = 0, watching = false;

  const EC = () => { try { return ENG() && ENG().model(st.modelId || null); } catch (_) { return null; } };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ── can this be drawn at all, right now ─────────────────────────────────────────────────────
     Three separate questions, because the reader can act on two of them and only one of them is
     permanent. `blocked` carries which, so the legend never has to guess. */
  function canDraw() {
    if (!GLR() || !PAL()) { st.blocked = 'renderer'; return false; }
    try { if (!GE().hasRenderer()) { st.blocked = 'renderer'; return false; } } catch (_) { st.blocked = 'renderer'; return false; }
    /* the WebGL custom layer is MapLibre's — a second engine has its own drawing model */
    try { if (GE().id() !== 'maplibre') { st.blocked = 'renderer'; return false; } } catch (_) { }
    /* ⚠ THERE IS NO GLOBE CHECK HERE ANY MORE, AND ITS ABSENCE IS THE POINT. This asked
       `globeness() > 0` and refused, because js/waves-gl.js drew a Web-Mercator quad and Windy's
       own `waves` overlay carries `globeNotSupported`. But IntMap OPENS ON THE GLOBE, so matching
       Windy's limitation meant the layer drew nothing in the view every reader starts in — a
       competitor's constraint imported as if it were ours. The renderer projects through
       MapLibre's own `projectTile` prelude now and unprojects the particles by ray/sphere
       intersection, so both projections are drawn; see js/waves-gl.js. */
    st.blocked = '';
    return true;
  }

  /* ── the map ─────────────────────────────────────────────────────────────────────────────── */
  function ensureRenderer() {
    if (renderer) return renderer;
    try { renderer = GLR().create({}); } catch (_) { renderer = null; return null; }
    try { renderer.setOpacity(st.op); renderer.setParticles(st.particles); } catch (_) { }
    return renderer;
  }
  function hasLayer() { try { return GE().layers.has(LYR); } catch (_) { return false; } }
  function addLayer() {
    if (hasLayer() || !renderer) return false;
    let before = null;
    /* the same anchor every weather field is placed at, so the sea state sits under the labels and
       the borders rather than over them */
    try { const E = EC(); before = E && E.before ? E.before() : null; } catch (_) { }
    try { GE().layers.add(renderer.layer(LYR), before); } catch (_) { return false; }
    return hasLayer();
  }
  function dropLayer() {
    /* ⚠ removing the layer calls the renderer's own `onRemove`, which destroys its GL objects — so
       the renderer handle goes with it and a re-add builds a fresh one. Keeping the handle would
       leave every later call talking to a destroyed context. */
    try { if (hasLayer()) GE().layers.remove(LYR); } catch (_) { }
    renderer = null;
  }
  function repaint() { try { GE().render.triggerRepaint(); } catch (_) { } }

  /* ── the grid the renderer is handed ─────────────────────────────────────────────────────────
     The SDK's domain table is where the geometry of a regular grid is declared, and the decoded
     array has to BE that grid — a banded or derived read is a different shape, and painting it as
     though it were the globe would put the sea in the wrong place. Refused rather than guessed. */
  function gridFor(E, frame) {
    try {
      const sdk = E.sdk && E.sdk(); if (!sdk || !sdk.domainOptions) return null;
      const dom = sdk.domainOptions.find(d => d.value === E.DOMAIN);
      const g = dom && dom.grid; if (!g) return null;
      const out = { nx: g.nx | 0, ny: g.ny | 0, lonMin: +g.lonMin, latMin: +g.latMin, dx: +g.dx, dy: +g.dy };
      if (!(out.nx > 1 && out.ny > 1)) return null;
      if (![out.lonMin, out.latMin, out.dx, out.dy].every(v => v === v && isFinite(v))) return null;
      if (!(out.dx > 0 && out.dy > 0)) return null;   /* a declared grid runs south→north; see rowsAreFlipped */
      if (!frame || !frame.data || !frame.data.values) return null;
      if (frame.data.values.length !== out.nx * out.ny) return null;   /* not this grid — see above */
      return out;
    } catch (_) { return null; }
  }

  /* ── which end of the array is row 0 ─────────────────────────────────────────────────────────
     See the header: the authority is the reader's own point read, and the fallback is the grid's
     own declaration. Returns true when the rows have to be flipped before the upload. */
  function rowsAreFlipped(E, g, values) {
    let sample = null;
    try { const s = E.sampler(VAR_H); sample = s && s.value ? s.value.bind(s) : null; } catch (_) { sample = null; }
    if (!sample) { st.orientation = 'declared'; return false; }
    /* the probe points are the GRID's own nodes, spread over it — nothing geographic is named */
    let asIs = 0, flipped = 0;
    for (let k = 1; k <= 11; k++) {
      const iy = Math.min(g.ny - 1, Math.round(g.ny * k / 12));
      const ix = Math.min(g.nx - 1, Math.round(g.nx * ((k * 7) % 12) / 12));
      const v = values[iy * g.nx + ix];
      if (!(v === v && isFinite(v))) continue;          /* land tells us nothing about row order */
      const lon = g.lonMin + ix * g.dx;
      let a = NaN, b = NaN;
      try { a = sample(g.latMin + iy * g.dy, lon); } catch (_) { }
      try { b = sample(g.latMin + (g.ny - 1 - iy) * g.dy, lon); } catch (_) { }
      if (a === a && Math.abs(a - v) < 1e-3) asIs++;
      if (b === b && Math.abs(b - v) < 1e-3) flipped++;
    }
    if (asIs === 0 && flipped === 0) { st.orientation = 'declared'; return false; }
    st.orientation = 'sampler';
    return flipped > asIs;
  }
  function orient(a, g, flip) {
    if (!flip || !a) return a || null;
    const o = new a.constructor(a.length);
    for (let y = 0; y < g.ny; y++) o.set(a.subarray((g.ny - 1 - y) * g.nx, (g.ny - y) * g.nx), y * g.nx);
    return o;
  }

  /* ── the read → the picture ──────────────────────────────────────────────────────────────────
     ⚠ THE WHOLE GRID, not a latitude band. The renderer uploads one texture and unprojects the
     whole viewport against it, so a band would leave the rest of the screen with no data at all —
     and a wave grid is 1440×721 (WAM 0.25°, MEASURED 1.43 MB a step), which is a fifth of what the
     9 km surface fields cost the wind layer. */
  function paint() {
    if (!st.on) return Promise.resolve(false);
    if (!canDraw()) { dropLayer(); st.displayed = null; st.loading = null; render(); return Promise.resolve(false); }
    const E = EC(); if (!E) return Promise.resolve(false);
    const mine = ++paintSeq;
    st.loading = { modelId: E.DOMAIN, modelName: (WXM().get(E.DOMAIN) || {}).nameKey || E.DOMAIN };
    render();
    return E.ready()
      .then(() => Promise.all([E.load(VAR_H, null, null), E.load(VAR_P, null, null)]))
      .then(fr => {
        if (mine !== paintSeq || !st.on) return false;
        const fh = fr[0], fp = fr[1];
        if (!fh || !fh.data || !fh.data.values) return fail();
        const g = gridFor(E, fh); if (!g) return fail();
        const flip = rowsAreFlipped(E, g, fh.data.values);
        if (!ensureRenderer()) return fail();
        const ok = renderer.setData({
          values: orient(fh.data.values, g, flip),
          directions: orient(fh.data.directions || null, g, flip),
          periods: (fp && fp.data && fp.data.values && fp.data.values.length === g.nx * g.ny)
            ? orient(fp.data.values, g, flip) : null,
          grid: g
        });
        if (!ok) return fail();
        addLayer();
        st.displayed = WXM().provenance({ modelId: E.DOMAIN, validTime: E.validTime(), referenceTime: E.referenceTime(), variable: VAR_H });
        st.loading = null;
        render(); repaint();
        return true;
      })
      .catch(() => fail());
  }
  /* a read that did not produce a picture says so, once, and puts the row back — the same shape
     js/weather.js uses, for the same reason: a checkbox that is on over a map with nothing on it is
     the failure this project keeps paying for. */
  function fail() {
    if (!st.on) return false;
    st.loading = null;
    try { HOST.satToast(L('Could not load the wave forecast', '波の予報データを読み込めませんでした', 'Wellenvorhersage konnte nicht geladen werden', 'Не удалось загрузить прогноз волнения', 'No se pudo cargar la previsión del oleaje')); } catch (_) { }
    setRow(false);
    toggle(false);
    return false;
  }

  /* ── the axis, and the master clock ──────────────────────────────────────────────────────────
     The engine subscribes to window.IntMapTime itself and moves its own index (js/wx-ecmwf.js
     `_followClock`), so following the master clock is: listen to the model this layer is on. One
     subscription per model — a step on a model this layer is NOT reading must not re-read anything. */
  function wireModel(E) {
    if (!E || !E.DOMAIN || wired[E.DOMAIN]) return; wired[E.DOMAIN] = 1;
    E.on(ev => {
      if (!st.on || !E || E.DOMAIN !== st.modelId) return;
      if (ev.type === 'index') { touchWhen(); return; }
      if (ev.type === 'time') { paint(); return; }
      if (ev.type === 'meta' || ev.type === 'play') render();
    });
  }
  /* the projection can change under a layer that is already on, and so can the style */
  function watchView() {
    if (watching) return; watching = true;
    const check = () => {
      if (!st.on) return;
      const ok = canDraw();
      if (ok && !hasLayer()) { paint(); return; }
      if (!ok && hasLayer()) { dropLayer(); st.displayed = null; render(); }
    };
    try { GE().events.on('moveend', check); GE().events.on('styledata', () => setTimeout(check, 80)); } catch (_) { }
  }

  /* ── the legend ──────────────────────────────────────────────────────────────────────────────
     Its own box, under its own name, holding its own ramp — the shape #R284 settled on for every
     weather legend, and the classes are the ones js/data-layers.js already styles. */
  /* ⚠⚠ THE TICKS ARE WINDY'S, AND THEY ARE NOT EVENLY SPACED. MEASURED 2026-09-09 on windy.com's
     wave overlay legend: 0.5 / 1 / 1.5 / 2 / 6 / 9 m. They are printed at their TRUE positions along
     a bar whose gradient is value-linear (js/waves-palette.js `cssGradient`), so the crowding at the
     low end is the data's — most of the world's sea is under 3 m, which is a quarter of the ramp.
     ⚠ EXPIRY: if Windy re-labels its legend these stop matching it; they are a reading of an
     upstream legend, not a scale invented here. */
  const TICKS_M = [0.5, 1, 1.5, 2, 6, 9];
  /* metres or feet — the app already has ONE unit setting (Settings ▸ Units), so this follows it
     rather than growing a second switch that could disagree with the rest of the map. */
  const imperial = () => { try { return HOST.unitMode === 'imperial'; } catch (_) { return false; } };
  const toDisplay = (m) => imperial() ? Math.round(m * 3.28084) : m;
  const unitLabel = () => imperial() ? 'ft' : 'm';

  function newBox() {
    const mc = document.getElementById('map-container') || document.body;
    const el = document.createElement('div');
    el.className = 'data-legend'; el.id = LEG;
    el.style.bottom = '140px'; el.style.display = 'none';
    mc.appendChild(el);
    try { window._wireLegendDrag && window._wireLegendDrag(el); } catch (_) { }
    return el;
  }
  function boxFor() { return box || (box = newBox()); }

  function barBody() {
    const P = PAL();
    const pct = (m) => ((m - P.MIN) / (P.MAX - P.MIN) * 100).toFixed(1);
    const ticks = TICKS_M.map(m => '<span style="left:' + pct(m) + '%">' + toDisplay(m) + '</span>').join('');
    return '<div class="ecl-unitline">' + unitLabel() + '</div>'
      + '<div class="ecl-bar" style="background:' + P.cssGradient() + ';"></div>'
      + '<div class="ecl-ticks">' + ticks + '</div>'
      + '<div class="ecl-desc">'
      + esc(L('Significant wave height, with the mean wave direction animated over it.',
        '有義波高と、その上に重ねた平均波向きのアニメーション。',
        'Signifikante Wellenhöhe, darüber die animierte mittlere Wellenrichtung.',
        'Значительная высота волн, поверх — анимация среднего направления волнения.',
        'Altura significativa de la ola, con la dirección media del oleaje animada encima.'))
      + ' ' + esc(L('Colours follow Windy’s wave scale.', '配色は Windy の波スケールに準拠。',
        'Die Farben folgen der Wellenskala von Windy.', 'Цвета соответствуют шкале волн Windy.',
        'Los colores siguen la escala de olas de Windy.'))
      + '</div>';
  }
  function opRow() {
    return '<div class="dl-op-row">' + esc(L('Opacity', '不透明度', 'Deckkraft', 'Непрозрачность', 'Opacidad'))
      + '<input type="range" class="wv-op" min="0" max="1" step="0.05" value="' + st.op + '">'
      + '<span class="dl-op-val">' + Math.round(st.op * 100) + '%</span></div>';
  }
  function particleRow() {
    return '<label class="kl-period wind-parts-row" style="margin:7px 0 2px;cursor:pointer;">'
      + '<input type="checkbox" class="wv-parts"' + (st.particles ? ' checked' : '')
      + ' style="accent-color:var(--primary-color);margin:0;cursor:pointer;">'
      + '<span style="font-size:11px;color:var(--text-muted);">'
      + esc(L('Wave animation', '波のアニメーション', 'Wellen-Animation', 'Анимация волн', 'Animación de olas'))
      + '</span></label>';
  }
  /* why a model is not offered, in words a reader can act on — the codes are js/wx-models.js's */
  function whyNot(code) {
    if (code === 'no_such_variable') return L('no wave data', '波のデータなし', 'keine Wellendaten', 'нет данных о волнении', 'sin datos de oleaje');
    if (code === 'role_not_offered') return L('not a wave model', '波モデルではありません', 'kein Wellenmodell', 'не волновая модель', 'no es un modelo de oleaje');
    if (code === 'no_metadata') return L('not answering', '応答なし', 'antwortet nicht', 'нет ответа', 'sin respuesta');
    return L('unavailable', '利用できません', 'nicht verfügbar', 'no disponible', 'no disponible');
  }
  function availFor(id) {
    try {
      const inst = ENG() && (ENG().peek ? ENG().peek(id) : ENG().model(id));
      const meta = inst && inst.metaSync();
      return WXM().availability({ modelId: id, meta: meta, variable: VAR_H, role: 'wave' });
    } catch (_) { return { ok: true }; }
  }
  /* opening the legend fetches the offered models' 3 kB metadata ONCE, so the picker can say
     「この変数は無い」 before it is clicked. A session that never opens it fetches nothing. */
  let metaWarmed = false;
  function warmModels() {
    if (metaWarmed) return; metaWarmed = true;
    MODELS().forEach(m => {
      try {
        const inst = ENG() && ENG().model(m.id); if (!inst || inst.metaSync()) return;
        inst.meta().then(() => { if (st.on) render(); }).catch(() => { });
      } catch (_) { }
    });
  }
  function modelLine() {
    const opts = MODELS().map(m => {
      const a = availFor(m.id), off = (a.ok === false && a.code !== 'no_metadata');
      return '<option value="' + esc(m.id) + '"' + (m.id === st.modelId ? ' selected' : '') + (off ? ' disabled' : '')
        + '>' + esc(m.nameKey) + (off ? (' — ' + whyNot(a.code)) : '') + '</option>';
    }).join('');
    const sel = '<div class="ecl-modelpick"><label>' + esc(L('Model', 'モデル', 'Modell', 'Модель', 'Modelo'))
      + '<select class="wv-model">' + opts + '</select></label></div>';
    const d = st.displayed;
    if (!d) return sel + '<div class="ecl-model">' + esc(L('loading…', '読み込み中…', 'wird geladen…', 'загрузка…', 'cargando…')) + '</div>';
    const busy = st.loading && st.loading.modelId && st.loading.modelId !== d.modelId;
    const swap = busy ? (' · ' + esc(L('switching to', '切替中', 'wechselt zu', 'переключение на', 'cambiando a')) + ' ' + esc(st.loading.modelName) + '…') : '';
    const E = EC();
    return sel + '<div class="ecl-model">' + esc(d.modelName) + ' · ' + d.nativeResolutionKm + ' km'
      + (d.runTime && E ? (' · ' + esc(L('run', '初期時刻', 'Lauf', 'прогон', 'pasada')) + ' '
        + esc(E.fmt(d.runTime, { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric', timeZone: 'UTC' })) + ' UTC') : '')
      + swap + '</div>';
  }
  function relTxt(iso) {
    try {
      const dh = Math.round((Date.parse(/[zZ]$/.test(iso) ? iso : iso + 'Z') - Date.now()) / 3600000);
      if (dh === 0) return L('now', '現在', 'jetzt', 'сейчас', 'ahora');
      return (dh > 0 ? '+' : '') + dh + ' ' + L('h', '時間', 'h', 'ч', 'h');
    } catch (_) { return ''; }
  }
  /* ⚠ EVERY WORD HERE IS BUILT FROM `st.displayed`, NEVER FROM `st.modelId` — a legend that recites
     the request describes a picture that is not on the screen for as long as the read takes. */
  function whenLine() {
    /* ⚠ 「Not drawn on the globe」 used to be answered here. It is gone rather than left unreachable:
       a legend line nothing can produce is a claim about the renderer that stopped being true, and
       the next reader of this file would believe it. `blocked` no longer has a 'globe' value. */
    if (st.blocked === 'renderer') {
      return L('This renderer cannot draw the wave layer.', 'この描画エンジンでは波レイヤーを描けません。',
        'Diese Renderer-Engine kann die Wellenebene nicht zeichnen.',
        'Этот движок не умеет рисовать слой волнения.', 'Este motor de dibujo no puede pintar la capa de oleaje.');
    }
    const d = st.displayed, E = EC();
    if (!d || !d.validTime || !E) return L('loading…', '読み込み中…', 'wird geladen…', 'загрузка…', 'cargando…');
    return L('valid', '有効時刻', 'gültig', 'действ.', 'válido') + ' ' + E.fmt(d.validTime) + ' · ' + relTxt(d.validTime);
  }
  function touchWhen() {
    try { const w = box && box.querySelector('.ecl-when'); if (w) w.textContent = whenLine(); } catch (_) { }
  }

  function render() {
    if (!st.on) return;
    warmModels();
    const el = boxFor();
    el.style.display = 'block';
    const E = EC();
    const clock = (E && window.IntMapWxPlayer) ? window.IntMapWxPlayer.timeUI('wv-time', E, L) : '';
    const drag = '<span class="dl-drag" title="' + esc(L('Drag to move', 'ドラッグして移動', 'Zum Verschieben ziehen', 'Потяните, чтобы переместить', 'Arrastre para mover')) + '">⋮⋮</span>';
    el.innerHTML = drag
      + '<button class="layer-popup-x" title="' + esc((function () { try { return HOST.t('close'); } catch (_) { return ''; } })() || '×') + '">×</button>'
      + '<h4>' + esc(name()) + '</h4>'
      + '<div class="ecl-one">' + barBody() + opRow() + particleRow() + modelLine() + clock
      + '<div class="ecl-when">' + esc(whenLine()) + '</div>'
      + '</div>';
    const x = el.querySelector('.layer-popup-x');
    if (x) x.onclick = () => { setRow(false); toggle(false); };
    const op = el.querySelector('.wv-op');
    if (op) op.oninput = () => { setOpacity(+op.value); const lb = el.querySelector('.dl-op-val'); if (lb) lb.textContent = Math.round(st.op * 100) + '%'; };
    const pa = el.querySelector('.wv-parts');
    if (pa) pa.onchange = () => setParticles(pa.checked);
    const ms = el.querySelector('.wv-model');
    if (ms) ms.onchange = () => setModel(ms.value);
    if (clock && E) { try { window.IntMapWxPlayer.wireTimeUI(el, 'wv-time', E); } catch (_) { } }
    try { window._tileLegends && window._tileLegends(); } catch (_) { }
  }
  function hideLegend() { if (box) box.style.display = 'none'; try { window._tileLegends && window._tileLegends(); } catch (_) { } }

  /* the layer's own name, in the reader's language — the Layers row shows the same words */
  function name() { return L('Waves', '波', 'Wellen', 'Волны', 'Olas'); }

  /* ── the doors ───────────────────────────────────────────────────────────────────────────── */
  function setRow(on) {
    try {
      const cb = document.getElementById('dl-' + ROW_ID);
      if (cb) { cb.checked = !!on; const r = cb.closest('.lyr-row'); if (r) r.classList.toggle('on', !!on); }
    } catch (_) { }
  }
  function toggle(on) {
    on = !!on;
    if (on === st.on) { if (on) render(); return Promise.resolve(st.on); }
    st.on = on;
    if (!on) { paintSeq++; dropLayer(); st.displayed = null; st.loading = null; hideLegend(); return Promise.resolve(false); }
    watchView();
    const E = EC(); if (E) wireModel(E);
    render();
    return paint().then(() => st.on);
  }
  function setOpacity(v) {
    v = Math.max(0, Math.min(1, +v || 0));
    st.op = v;
    try { if (renderer) renderer.setOpacity(v); } catch (_) { }
    repaint();
    return v;
  }
  function setParticles(b) {
    st.particles = !!b;
    try { if (renderer) renderer.setParticles(st.particles); } catch (_) { }
    repaint();
    return st.particles;
  }
  /* ⚠ THE ANSWER IS ABOUT THE PICTURE, NOT ABOUT THE REQUEST. A caller that wants to REPORT the
     change (Atlas) has to be able to tell 「切り替えた」 from 「切り替えを頼んだ」, so the result names
     which one it is and the codes are the ones js/weather.js's `setModel` already uses. */
  function setModel(id) {
    const m = MODELS().filter(x => x.id === id)[0];
    if (!m) return Promise.resolve({ ok: false, code: 'unknown_model', modelId: id });
    if (id === st.modelId && st.displayed && st.displayed.modelId === id) {
      return Promise.resolve({ ok: true, code: 'displayed', modelId: id, modelName: m.nameKey });
    }
    st.modelId = id;
    const E = EC(); if (E) wireModel(E);
    if (!st.on) { render(); return Promise.resolve({ ok: true, code: 'chosen_layer_off', modelId: id, modelName: m.nameKey }); }
    render();
    return paint().then(ok => (ok && st.displayed && st.displayed.modelId === id)
      ? { ok: true, code: 'displayed', modelId: id, modelName: m.nameKey, validTime: st.displayed.validTime, runTime: st.displayed.runTime }
      : { ok: false, code: 'not_painted_yet', modelId: id, modelName: m.nameKey });
  }

  /* the reader changed language or units: the legend is words and numbers, so it is rebuilt */
  window.addEventListener('intmap-lang', () => { if (st.on) render(); });
  window.addEventListener('intmap-units', () => { if (st.on) render(); });

  return {
    open: () => toggle(true), close: () => toggle(false), toggle,
    isOn: () => st.on,
    setOpacity, opacity: () => st.op,
    setParticles, particles: () => st.particles,
    setModel, model: () => (st.displayed ? st.displayed.modelId : ''), models: () => MODELS().map(m => ({ id: m.id, name: m.nameKey, km: m.km })),
    available: canDraw, blocked: () => st.blocked,
    name,
    /* what is on the screen, in the same shape every weather layer answers with */
    provenance: () => st.displayed,
    state: () => ({ on: st.on, opacity: st.op, particles: st.particles, model: st.modelId, displayed: st.displayed, blocked: st.blocked, orientation: st.orientation, painted: hasLayer() }),
    /* test seams — never called by the app */
    _variables: () => [VAR_H, VAR_P], _ticks: () => TICKS_M.slice(), _gridFor: gridFor, _rowsAreFlipped: rowsAreFlipped, _orient: orient
  };
};
