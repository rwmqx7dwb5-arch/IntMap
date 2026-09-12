/* Pleiades' dated settlement names, including places with no modern-name assertion.
 * This is a second SOURCE of places, never a guess about a modern city's identity.
 * The city label's visibility, typography, scale and colours remain their owners.
 * Dates are approximate vocabulary periods; points are upstream representative points.
 */
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.histPlaces = function (HOST) {
  const GE = () => window.IntMapGeoEngine;
  const HS = () => window.IntMapHistScale;
  const SOURCE = 'imhp-src', LABEL = 'imhp-lbl', CITY = 'ofm-city';
  const empty = () => ({ type: 'FeatureCollection', features: [] });
  let data = null, pending = null, controller = null, disposed = false, painting = false;
  let fc = empty(), key = '', popup = null;
  const byId = new Map();
  const text = (en, jp) => window.IntMapLang.t(HOST.lang, en, jp);
  const escape = value => window.IntMapSafe.html(String(value == null ? '' : value));
  /* Pleiades explicitly documents [-1000,-1] as 1000–1 BCE, not JS years:
     https://pleiades.stoa.org/vocabularies/time-periods/1st-millennium-bce */
  const astro = raw => HS().fromEra(Math.abs(raw), raw < 0);
  const namesAt = (p, year) => p.names.filter(n => astro(n.s) <= year && astro(n.e) >= year);
  function when() {
    if (disposed) return null;
    const clock = window.IntMapTime;
    return clock && !clock.isLive() ? clock.when() : null;
  }
  function label(names) {
    const mode = window.imLabelLang || 'ui';
    const lang = mode === 'en' ? 'en' : window.IntMapLang.htmlTag(HOST.lang);
    const own = names.find(n => n.l === lang && (n.a || n.r));
    if (mode === 'local') return (own && (own.a || own.r)) || (names.find(n => n.a) || names[0]).a || names[0].r;
    return (own && (own.r || own.a)) || names[0].r || names[0].a;
  }
  function build(date) {
    const features = [], year = date.getUTCFullYear();
    for (const p of data.places) {
      const active = namesAt(p, year);
      if (!active.length) continue;
      let name = label(active);
      /* Pleiades' romanization can list dozens of comma-separated variants
         (measured longest 357 characters). The map uses its first form; the
         source record and popup retain the entire literal without truncation. */
      name = name.split(',')[0].trim();
      /* The source's uncertainty is kept visible, not lost when its title is
         replaced with the particular name attested for the selected period. */
      if (p.title.includes('?') && !name.includes('?')) name += ' ?';
      features.push({ type: 'Feature', id: p.id, geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: { id: p.id, name, title: p.title, source: 'Pleiades',
          coordinatePrecision: data.coordinatePrecision, datePrecision: data.datePrecision } });
    }
    return { type: 'FeatureCollection', features };
  }
  function close() { if (popup) popup.remove(); popup = null; }
  function period(n) {
    const tag = window.IntMapLang.htmlTag(HOST.lang);
    return HS().yearText(astro(n.s), tag) + ' – ' + HS().yearText(astro(n.e), tag);
  }
  function card(p, names) {
    const rows = names.map(n => {
      const forms = [...new Set([n.a, n.r].filter(Boolean))].map(escape).join(' · ');
      return '<div style="margin-top:6px">' + forms + '<div style="color:var(--text-muted)">'
        + escape(period(n)) + '</div></div>';
    }).join('');
    const url = 'https://pleiades.stoa.org/places/' + p.id.slice(3);
    return '<div style="min-width:180px;padding-right:20px"><strong>' + escape(p.title) + '</strong>'
      + '<div style="max-height:40vh;overflow:auto">' + rows + '</div>'
      + '<p style="font-size:11px;color:var(--text-muted)">' + escape(text(
        'Approximate source periods for these names; they do not establish founding or abandonment dates.',
        '各名称に出典が付けた概略の時代区分です。創建・廃絶の年代を示すものではありません。')) + '</p>'
      + '<p style="font-size:11px;color:var(--text-muted)">' + escape(text(
        'Source representative point. The exact site may differ; see the source locations and uncertainty.',
        '出典の代表点です。実際の遺跡の位置と異なる場合があります。出典の位置情報と不確実性をご確認ください。')) + '</p>'
      + '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + escape(text('Pleiades source record', 'Pleiades の出典記録')) + '</a>'
      + '<div style="font-size:10px;margin-top:6px">' + escape(data.source.publisher) + ' · '
      + '<a href="' + escape(data.source.licenceUrl) + '" target="_blank" rel="noopener noreferrer">' + escape(data.source.licence) + '</a></div></div>';
  }
  function open(id, at) {
    const p = byId.get(id), date = when();
    if (disposed || !p || !date || !GE().layers.isVisible(LABEL)) return false;
    const names = namesAt(p, date.getUTCFullYear());
    if (!names.length) return false;
    let lng = p.lon;
    if (at && Number.isFinite(at.lng)) { while (lng - at.lng > 180) lng -= 360; while (lng - at.lng < -180) lng += 360; }
    close();
    popup = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, maxWidth: '320px', className: 'plc-popup' })
      .setLngLat({ lng, lat: p.lat }).setHTML(card(p, names)));
    return !!popup;
  }
  /* Copy values, not policy: the city's actual current style is the reference.
     A theme, label-mode or visibility change fires styledata. Only changed
     properties are written, and synchronous re-entry is guarded. */
  function apply() {
    if (disposed || painting) return;
    painting = true;
    try {
      const date = when();
      const next = date ? [date.getUTCFullYear(), HOST.lang, window.imLabelLang || 'ui'].join('|') : '';
      // A DOM card must stop asserting the old date even while a basemap is rebuilding.
      if (popup && (!date || next !== key)) close();
      const drawable = HOST.canDraw ? HOST.canDraw() : GE().ready();
      if (!drawable || !GE().layers.has(CITY)) return;
      const visible = !!date && !!data && GE().layers.isVisible(CITY);
      if (date && data) {
        if (next !== key) { fc = build(date); key = next; if (popup) close(); }
      }
      if (!visible) {
        if (GE().layers.has(LABEL) && GE().layers.isVisible(LABEL)) GE().layers.setVisible(LABEL, false);
        if (popup) close();
        return;
      }
      const fresh = !GE().layers.hasSource(SOURCE);
      if (fresh) GE().layers.addSource(SOURCE, { type: 'geojson', data: fc,
        attribution: 'Pleiades and its contributors (CC BY 3.0)' });
      const layout = { visibility: 'visible', 'text-field': ['get', 'name'],
        'text-font': window.IntMapMapTypography.readerFont(),
        'text-size': window.IntMapLabelScale.place('city') };
      for (const prop of ['text-max-width', 'text-variable-anchor', 'text-radial-offset', 'text-justify', 'text-padding']) {
        const value = GE().layers.getLayout(CITY, prop);
        if (value !== undefined) layout[prop] = value;
      }
      const paint = {};
      for (const prop of ['text-color', 'text-halo-color', 'text-halo-width', 'text-opacity']) {
        const value = GE().layers.getPaint(CITY, prop);
        if (value !== undefined) paint[prop] = value;
      }
      if (!GE().layers.has(LABEL)) {
        const city = GE().layers.get(CITY);
        const spec = { id: LABEL, source: SOURCE, type: 'symbol', layout, paint };
        if (Number.isFinite(city.minzoom)) spec.minzoom = city.minzoom;
        if (Number.isFinite(city.maxzoom)) spec.maxzoom = city.maxzoom;
        GE().layers.add(spec, CITY);
      } else {
        for (const [prop, value] of Object.entries(layout)) {
          if (JSON.stringify(GE().layers.getLayout(LABEL, prop)) !== JSON.stringify(value)) GE().layers.setLayout(LABEL, prop, value);
        }
        for (const [prop, value] of Object.entries(paint)) {
          if (JSON.stringify(GE().layers.getPaint(LABEL, prop)) !== JSON.stringify(value)) GE().layers.setPaint(LABEL, prop, value);
        }
      }
      if (!fresh && published !== fc) GE().layers.setSourceData(SOURCE, fc);
      published = fc;
    } finally { painting = false; }
  }
  let published = null;
  function ensure() {
    if (disposed || data) return Promise.resolve(data);
    if (pending) return pending;
    controller = new AbortController();
    pending = fetch(new URL('data/hist-places.json', document.baseURI).href, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Historical places: HTTP ' + r.status); return r.json(); })
      .then(value => {
        if (disposed) return null;
        if (value.v !== 1 || !Array.isArray(value.places)) throw new Error('Invalid historical places record');
        data = value;
        for (const p of data.places) byId.set(p.id, p);
        apply(); return data;
      }).catch(error => { if (!disposed) console.warn('Historical places could not load', error); return null; })
      .finally(() => { pending = null; controller = null; });
    return pending;
  }
  function refresh() { if (disposed) return; if (when() && !data) ensure(); else apply(); }
  const stopClock = window.IntMapTime.on(refresh);
  GE().events.on('styledata', apply);
  GE().events.on('load', apply);
  /* The shared place reader owns exact and padded hits, hover, ownership and
     closure. A second layer handler could make two readers refuse each other. */
  const stopReader = window.IntMapPlaceReaders.register(LABEL, {
    open: (feature, event) => open(feature && feature.properties && feature.properties.id, event && event.lngLat),
    close,
  });
  window.addEventListener('intmap-lang', refresh);
  function dispose() {
    if (disposed) return;
    disposed = true;
    stopClock();
    if (controller) controller.abort();
    GE().events.off('styledata', apply); GE().events.off('load', apply);
    stopReader();
    window.removeEventListener('intmap-lang', refresh);
    close(); GE().layers.remove(LABEL); GE().layers.removeSource(SOURCE);
  }
  function state() {
    const date = when(), year = date ? date.getUTCFullYear() : null;
    return { ready: !!data, loading: !!pending, year,
      activeRecords: date && data ? data.places.reduce((n, p) => n + (namesAt(p, year).length ? 1 : 0), 0) : 0,
      enabled: !disposed && GE().layers.isVisible(CITY),
      visible: !disposed && !!date && GE().layers.isVisible(LABEL),
      source: data ? data.source.url : 'https://pleiades.stoa.org/', asOf: data ? data.asOf : null,
      periodCaveat: 'Approximate source periods for names, not founding or abandonment dates.',
      positionCaveat: 'Source representative points, not exact site positions.' };
  }
  refresh();
  return { ensure, refresh, dispose, open, state, lookup: id => byId.get(id) || null,
    currentFC: () => when() ? fc : empty(),
    coverage: () => ({ active: !!when(), places: when() ? fc.features.length : 0,
      source: data ? data.source.publisher : null, asOf: data ? data.asOf : null,
      datePrecision: 'approximate-source-period', coordinatePrecision: 'source-representative-point' }) };
};
