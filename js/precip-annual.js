/* ============================================================================
 *  IntMap · ANNUAL PRECIPITATION — the measured field, not the country average   (#R266)
 * ----------------------------------------------------------------------------
 *  「年降水量レイヤーを追加して。単に国別に塗るとかではないガチのやつ。ガチの細かいやつ。」
 *
 *  There already WAS an annual-precipitation layer and it was the thing the report rules out: the
 *  World Bank's AG.LND.PRCP.MM, one number per country, painted flat across Russia and across
 *  Singapore alike. This is the field underneath it, at two resolutions and in two senses:
 *
 *    · THE CLIMATOLOGY — CHELSA V2.1 bio12, 1981–2010, 30 arc-seconds (~1 km at the equator),
 *      reprojected to the same 8192² Web-Mercator frame the Köppen rasters use so the two climate
 *      layers register pixel for pixel. `_precip_convert.py` builds it; the sea is masked with the
 *      Köppen raster's OWN alpha, because CHELSA is a land-surface product and two climate layers
 *      must not disagree about where the coast is.
 *    · THE YEARS — GPCC Full Data Monthly V2022 (DWD), 0.5°, the twelve months of each year summed,
 *      1981 through 2020, stacked into ONE image so switching year costs no network at all.
 *      `_precip_years_convert.py` builds it.
 *
 *  ⚠ THE GRID IS READ OUT OF THE MANIFESTS, NEVER TYPED HERE. data/precip-mm.json carries the bands,
 *  the colours, the log encoding and the size; data/precip-year.json carries the year list. #R263
 *  lost a round to a grid held as a `const` while the file on disk was rebuilt at another
 *  resolution, and every lookup landed 5× off. One source of truth, on disk, beside the pixels.
 *
 *  ⚠ WHAT THE COLOURS MEAN IS EXACT. The picture is BANDED, not a continuous ramp — so a colour maps
 *  back to a range rather than being inverted by nearest-neighbour guesswork, and a flat band
 *  compresses the way Köppen's categories do (3.6 MB for 67 M pixels). The point readout does not
 *  read the picture at all: it reads data/precip-mm.png, an 8-bit log(mm) grid, so a number never
 *  comes from a colour.
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.precipAnnual = function (HOST) {
  const GE = () => window.IntMapGeoEngine;
  const L = window.IntMapLang.pick(() => HOST.lang);
  const LA = window.IntMapLang.pickArgs();
  const esc = (v) => { try { return window.IntMapSafe.html(v == null ? '' : String(v)); } catch (_) { return ''; } };
  function canDraw() { try { return !!HOST.canDraw(); } catch (_) { try { return !!GE().ready(); } catch (__) { return false; } } }

  const SRC = 'src-annprecip', LYR = 'lyr-annprecip', ROW = 'dl-annprecip';
  const CLIM = '';                     /* the year-select value that means «the 1981–2010 normal» */
  let on = false, year = CLIM, opacity = 0.82;
  let mm = null, yr = null;            /* the two manifests */
  let mmVals = null;                   /* the climatology readout grid, decoded on first question */
  let yearVals = Object.create(null);  /* year -> Uint8Array(720×360), decoded on first use */
  let lastPainted = null;

  const url = (f) => { try { return new URL(f, document.baseURI).toString(); } catch (_) { return f; } };
  const phone = () => { try { return window.matchMedia('(pointer:coarse)').matches && !window.matchMedia('(any-pointer:fine)').matches; } catch (_) { return false; } };

  function manifests() {
    if (mm && yr) return Promise.resolve(true);
    return Promise.all([
      fetch(url('data/precip-mm.json')).then((r) => r.json()),
      fetch(url('data/precip-year.json')).then((r) => r.json()),
    ]).then(([a, b]) => { mm = a; yr = b; return true; }).catch(() => false);
  }

  /* the log encoding both rasters share, decoded exactly the way the builders wrote it */
  const decode = (e, logMax) => (e ? (Math.exp((e - 1) / 254 * Math.log1p(logMax / 10)) - 1) * 10 : null);
  const bandOf = (v) => { const B = mm.bands; let i = 0; while (i < B.length && v >= B[i]) i++; return i; };

  /* ── the picture ─────────────────────────────────────────────────────────────────────────── */
  function climURL() { return url(phone() ? mm.mercator.phone : mm.mercator.file); }

  /* One year, painted into a Mercator canvas. The source is 0.5°, so 2048² is already finer than
     the data — this exists to put an equirectangular grid into the frame MapLibre wants, not to
     invent detail. */
  function yearCanvas(y) {
    const vals = yearVals[y]; if (!vals) return null;
    const N = 2048, W = yr.width, H = yr.height, LIM = mm.mercator.latLimit;
    const c = document.createElement('canvas'); c.width = c.height = N;
    const cx = c.getContext('2d'); const img = cx.createImageData(N, N);
    const D = img.data;
    const COLS = mm.colors.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
    for (let py = 0; py < N; py++) {
      const ym = (1 - 2 * (py + 0.5) / N) * Math.PI;
      const lat = Math.atan(Math.sinh(ym)) * 180 / Math.PI;
      if (lat > LIM || lat < -LIM) continue;
      const sy = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / 180 * H)));
      for (let px = 0; px < N; px++) {
        const lon = (px + 0.5) / N * 360 - 180;
        const sx = Math.min(W - 1, Math.max(0, Math.floor((lon + 180) / 360 * W)));
        const e = vals[sy * W + sx]; if (!e) continue;
        const col = COLS[bandOf(decode(e, yr.logMax))] || COLS[0];
        const o = (py * N + px) * 4;
        D[o] = col[0]; D[o + 1] = col[1]; D[o + 2] = col[2]; D[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  /* the year bands live in ONE image; `createImageBitmap`'s crop form decodes exactly the band asked
     for, so a 40-year stack never exists as 41 MB of ImageData on a phone */
  function loadYear(y) {
    if (yearVals[y]) return Promise.resolve(true);
    const i = yr.years.indexOf(+y); if (i < 0) return Promise.resolve(false);
    return fetch(url('data/precip-year.png'), { cache: 'force-cache' }).then((r) => r.blob())
      .then((b) => (typeof createImageBitmap === 'function'
        ? createImageBitmap(b, 0, i * yr.height, yr.width, yr.height)
        : Promise.reject(new Error('no createImageBitmap'))))
      .then((bm) => {
        const c = document.createElement('canvas'); c.width = yr.width; c.height = yr.height;
        const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(bm, 0, 0);
        try { bm.close(); } catch (_) { }
        const d = cx.getImageData(0, 0, yr.width, yr.height).data;
        const out = new Uint8Array(yr.width * yr.height);
        for (let k = 0; k < out.length; k++) out[k] = d[k * 4];
        yearVals[y] = out; return true;
      }).catch(() => false);
  }

  function ensure(u) {
    if (!canDraw()) return false;
    try {
      if (!GE().layers.hasSource(SRC)) {
        GE().layers.addSource(SRC, { type: 'image', url: u, coordinates: window.KCOORDS });
        const anchor = ['layer-sat-labels', 'borders-only-line', 'ofm-country', 'ofm-city', 'ofm-other'].find((id) => { try { return !!GE().layers.get(id); } catch (_) { return false; } });
        GE().layers.add({ id: LYR, type: 'raster', source: SRC, layout: { visibility: 'none' }, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 } }, anchor);
      } else if (u !== lastPainted) {
        /* (#R178) the renderer through the contract — `layers.updateImage` is the app's own name for
           «this image source now points at a different picture», and it is what the Köppen era
           switch uses too. Never `map.getSource(...)` from a module. */
        GE().layers.updateImage(SRC, { url: u, coordinates: window.KCOORDS });
      }
      lastPainted = u;
      return true;
    } catch (_) { return false; }
  }
  function setVis(v) { try { if (GE().layers.has(LYR)) GE().layers.setLayout(LYR, 'visibility', v ? 'visible' : 'none'); } catch (_) { } }

  function paint() {
    if (!on) { setVis(false); return; }
    manifests().then((ok) => {
      if (!ok) { legend(); return; }
      if (year === CLIM) { if (ensure(climURL())) { setVis(true); try { window._raiseLabelLayers && window._raiseLabelLayers(); } catch (_) { } } else { GE().events.once('idle', paint); } legend(); return; }
      loadYear(year).then((got) => {
        if (!got) { year = CLIM; paint(); return; }
        const u = yearCanvas(year);
        if (u && ensure(u)) { setVis(true); try { window._raiseLabelLayers && window._raiseLabelLayers(); } catch (_) { } } else { GE().events.once('idle', paint); }
        legend();
      });
    });
  }

  /* ── the legend ──────────────────────────────────────────────────────────────────────────── */
  function legend() {
    let el = null;
    /* (#R268) the NAME TABLE, not the resolved string - see ensureGenericLegend in js/data-layers.js */
    try { el = window._registerLayerOpacity && window._registerLayerOpacity('annprecip', NM, [LYR], ROW); } catch (_) { }
    if (!el) return;
    if (!on) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    let b = el.querySelector('.pa-body');
    if (!b) { b = document.createElement('div'); b.className = 'pa-body'; el.appendChild(b); }
    if (!mm) { b.textContent = L('Loading…', '読み込み中…', 'Wird geladen…', 'Загрузка…', 'Cargando…'); return; }
    const B = mm.bands, C = mm.colors;
    const swatch = C.map((c, i) => '<span title="' + esc(i === 0 ? ('< ' + B[0]) : (i === C.length - 1 ? ('≥ ' + B[B.length - 1]) : (B[i - 1] + '–' + B[i]))) + ' mm"'
      + ' style="flex:1;height:10px;background:' + esc(c) + ';"></span>').join('');
    const opts = '<option value="">' + esc(L('Normal 1981–2010 (1 km)', '平年値 1981–2010（1km）', 'Normalwert 1981–2010 (1 km)', 'Норма 1981–2010 (1 км)', 'Media 1981–2010 (1 km)')) + '</option>'
      + (yr ? yr.years.slice().reverse().map((y) => '<option value="' + y + '">' + y + '</option>').join('') : '');
    b.innerHTML = '<div style="display:flex;border-radius:3px;overflow:hidden;border:1px solid rgba(128,128,128,0.28);margin-top:5px;">' + swatch + '</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-muted);margin-top:2px;"><span>0</span><span>500</span><span>1000</span><span>2000</span><span>≥5000 mm</span></div>'
      + '<div style="display:flex;align-items:center;gap:6px;margin-top:7px;font-size:10.5px;color:var(--text-muted);">'
      + '<span>' + esc(L('Year', '年', 'Jahr', 'Год', 'Año')) + '</span>'
      + '<select class="pa-year" style="flex:1;padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px;">' + opts + '</select></div>'
      + '<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;margin-top:6px;">' + esc(year === CLIM ? CLIM_ONE() : YEAR_ONE(year)) + '</div>'
      + '<details class="im-more"><summary>' + esc(L('Sources', '出典', 'Quellen', 'Источники', 'Fuentes')) + '</summary>'
      + '<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">' + esc(SRC_TEXT()) + '</div></details>';
    const s = b.querySelector('.pa-year'); if (s) { s.value = year; s.onchange = () => { year = s.value; paint(); }; }
  }
  const NAME = () => L.arr(NM);
  const NM = LA('Annual precipitation', '年降水量', 'Jahresniederschlag', 'Годовое количество осадков', 'Precipitación anual');
  const CLIM_ONE = () => L('The 1981–2010 average, on a 1 km grid — how much rain and snow a place gets in a normal year.',
    '1981–2010 年の平均を 1km 格子で描いたものです。平年の1年間に降る雨と雪の合計量を表します。',
    'Das Mittel 1981–2010 auf einem 1-km-Gitter — wie viel Regen und Schnee ein Ort in einem normalen Jahr bekommt.',
    'Среднее за 1981–2010 на сетке 1 км — сколько осадков выпадает в обычный год.',
    'La media 1981–2010 en una malla de 1 km: cuánta lluvia y nieve recibe un lugar en un año normal.');
  const YEAR_ONE = (y) => L('That single year’s total, on a 55 km gauge analysis — land only.',
    'その年1年間の合計です。観測点解析の 55km 格子（陸地のみ）。',
    'Die Summe genau dieses Jahres, 55-km-Stationsanalyse — nur Land.',
    'Сумма именно этого года, станционный анализ 55 км — только суша.',
    'El total de ese año concreto, análisis de pluviómetros de 55 km — solo tierra.').replace('%y', y);
  const SRC_TEXT = () => L(
    'Normal: CHELSA V2.1 bio12, mean annual precipitation 1981–2010, 30 arc-seconds (~1 km), reprojected to Web Mercator and masked to land. Its 16-bit storage saturates at 6,553 mm, so the very wettest places (parts of Meghalaya, the Chilean fjords) are shown at that ceiling. Years: GPCC Full Data Monthly V2022 (Deutscher Wetterdienst), a rain-gauge analysis at 0.5° over land, with the twelve monthly totals of each year summed. A gauge analysis has nothing to say over the ocean, which is why the sea is empty in both.',
    '平年値: CHELSA V2.1 bio12（1981–2010 年平均降水量、30秒角＝約1km）をウェブメルカトルに再投影し、陸域のみを描いています。16bit 保存の上限のため 6,553 mm で頭打ちになり、最も多雨な地域（メガラヤ州の一部、チリ南部のフィヨルドなど）はその上限値で表示されます。年別: GPCC Full Data Monthly V2022（ドイツ気象庁）。陸上の雨量計解析（0.5°）で、各年の12か月分を合計しています。雨量計解析は海上について何も言えないため、どちらも海は空白です。',
    'Normal: CHELSA V2.1 bio12 (1981–2010, 30 Bogensekunden ≈ 1 km), nach Web-Mercator umprojiziert, nur Land; 16-Bit-Sättigung bei 6.553 mm. Jahre: GPCC Full Data Monthly V2022 (DWD), Stationsanalyse 0,5° über Land, Monatssummen je Jahr addiert. Über dem Meer sagt eine Stationsanalyse nichts.',
    'Норма: CHELSA V2.1 bio12 (1981–2010, 30 угловых секунд ≈ 1 км), перепроецировано в веб-Меркатор, только суша; 16-битное насыщение на 6553 мм. Годы: GPCC Full Data Monthly V2022 (DWD), станционный анализ 0,5° по суше, месячные суммы каждого года сложены. Над океаном станционный анализ ничего не говорит.',
    'Normal: CHELSA V2.1 bio12 (1981–2010, 30 segundos de arco ≈ 1 km), reproyectado a Web Mercator, solo tierra; saturación de 16 bits en 6.553 mm. Años: GPCC Full Data Monthly V2022 (DWD), análisis pluviométrico de 0,5° sobre tierra, sumando los doce totales mensuales de cada año.');

  /* ── the point value, read from the VALUE grid and never from the picture ─────────────────── */
  function ensureVals() {
    if (mmVals) return Promise.resolve(true);
    return manifests().then((ok) => (ok ? fetch(url('data/precip-mm.png'), { cache: 'force-cache' }).then((r) => r.blob())
      .then((b) => createImageBitmap(b))
      .then((bm) => {
        const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
        const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(bm, 0, 0);
        try { bm.close(); } catch (_) { }
        const d = cx.getImageData(0, 0, c.width, c.height).data;
        const out = new Uint8Array(c.width * c.height);
        for (let k = 0; k < out.length; k++) out[k] = d[k * 4];
        mmVals = out; return true;
      }) : false)).catch(() => false);
  }
  function valueAt(lng, lat) {
    if (year !== CLIM) {
      const v = yearVals[year]; if (!v || !yr) return null;
      const x = Math.min(yr.width - 1, Math.max(0, Math.floor((((lng + 180) % 360 + 360) % 360) / 360 * yr.width)));
      const y = Math.min(yr.height - 1, Math.max(0, Math.floor((90 - lat) / 180 * yr.height)));
      return decode(v[y * yr.width + x], yr.logMax);
    }
    if (!mmVals || !mm) return null;
    const x = Math.min(mm.width - 1, Math.max(0, Math.floor((((lng + 180) % 360 + 360) % 360) / 360 * mm.width)));
    const y = Math.min(mm.height - 1, Math.max(0, Math.floor((90 - lat) / 180 * mm.height)));
    return decode(mmVals[y * mm.width + x], mm.logMax);
  }

  function toggle(v) {
    on = !!v;
    if (!on) { setVis(false); try { window._hideGenericLegend && window._hideGenericLegend('annprecip'); } catch (_) { } return; }
    paint(); ensureVals();
  }

  function buildRow() {
    const dd = document.getElementById('layer-dropdown'); if (!dd) { setTimeout(buildRow, 400); return; }
    if (!document.getElementById(ROW)) {
      const w = document.createElement('div'); w.className = 'lyr-row'; w.id = 'lyrrow-annprecip';
      w.innerHTML = '<label class="layer-option"><input type="checkbox" id="' + ROW + '"> <span class="lyr-sw" style="background:#1f8fb8"></span> <span id="' + ROW + '-lbl"></span></label>';
      dd.appendChild(w);
      w.querySelector('input').addEventListener('change', (e) => { w.classList.toggle('on', e.target.checked); toggle(e.target.checked); });
    }
    const lab = document.getElementById(ROW + '-lbl'); if (lab) lab.textContent = L.arr(NM);
    try { window.reorganizeLayerPanel && window.reorganizeLayerPanel(); } catch (_) { }
  }
  if (document.readyState !== 'loading') setTimeout(buildRow, 300); else document.addEventListener('DOMContentLoaded', () => setTimeout(buildRow, 300));
  window.addEventListener('intmap-lang', () => { setTimeout(buildRow, 20); if (on) legend(); });
  GE().events.on('styledata', () => { if (on) setTimeout(() => { lastPainted = null; paint(); }, 90); });

  try {
    window.IntMapLayers && window.IntMapLayers.register('annprecip', {
      on: () => on, label: () => L.arr(NM),
      sampleAt: (x, y) => ensureVals().then(() => { const v = valueAt(x, y); return v == null ? null : (Math.round(v) + ' mm'); }),
      time: () => (year === CLIM ? '1981–2010' : String(year)),
      source: () => (year === CLIM ? 'CHELSA V2.1 bio12' : 'GPCC Full Data Monthly V2022'),
    });
  } catch (_) { }

  window.IntMapPrecipAnnual = {
    toggle, isOn: () => on, year: () => year, setYear: (y) => { year = String(y || ''); if (on) paint(); return year; },
    years: () => (yr ? yr.years.slice() : []), valueAt, ready: () => manifests(),
    /* ⚠ (#R495) `valueAt` READS A GRID THE LAYER LOADS WHEN IT IS SWITCHED ON, and until this round
       `ensureVals()` was reachable only from `toggle(true)`. So a caller that wants the NUMBER and not
       the picture — js/atlas-query.js's `precipMm` column, which must answer 「年間降水量500mm未満」 for
       several hundred cities — got `null` for every point unless the reader happened to have the layer
       on. This is that load, with nothing painted and nothing toggled. */
    warmValues: () => ensureVals(),
    state: () => ({ on, year, hasClim: !!mmVals, yearsLoaded: Object.keys(yearVals), painted: lastPainted }),
  };
  return window.IntMapPrecipAnnual;
};
