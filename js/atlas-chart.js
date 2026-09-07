/* ============================================================================
 *  IntMap · Atlas — THE CHART RENDERER  (#R543)
 * ----------------------------------------------------------------------------
 *  One generic chart builder for Atlas answers. It returns an HTML **string**, because that is the
 *  contract a reply body actually has: js/atlas-console.js's `_atlCompose` concatenates every
 *  result's `.html` and assigns the join to `ai.innerHTML`. A DOM node handed to the bubble is
 *  discarded the next time the same turn composes (#R492 — 装飾は DOM でなく文字列へ).
 *
 *  ══ WHY THIS FILE EXISTS ══════════════════════════════════════════════════════════════════════
 *  Before this round Atlas could put a picture of numbers in front of the reader in exactly ONE
 *  place: `ballisticProfileSVG` in js/atlas-sims.js, hand-built for one missile trajectory. Every
 *  other capability that computes numbers — rank, ratio, relate, query, compareStats, timeSeries —
 *  could only describe them in a sentence, or open a panel that the answer does not contain.
 *  The map became a declared answer mode in #R511; the numbers never did.
 *
 *  ══ ⚠ NOTHING HERE INVENTS DATA ═══════════════════════════════════════════════════════════════
 *  This inherits js/widget-render.js's rule verbatim: a graph the source did not provide is
 *  forbidden, so `series()` there refuses fewer than three real points because "a sparkline from one
 *  value is decoration shaped like evidence". The same minimum is applied here, from the same
 *  constant, for the same reason — a trend line needs three points to be a trend rather than a
 *  segment. Bars need two, because one bar is not a comparison.
 *
 *  ⚠ AND EVERY CHART STATES WHERE ITS NUMBERS CAME FROM. `spec.source` is required and refused when
 *  empty. This is `.agents/rules/no-ad-hoc-hardcoding.md` §2.2 applied to pixels: the renderer's job
 *  is not to judge whether Atlas's numbers are right, it is to refuse to draw numbers that arrive
 *  with no stated origin. A chart is the most credible shape a claim can take, so it is the shape
 *  that must carry its provenance.
 *
 *  ⚠ DROPPED ROWS ARE COUNTED, NEVER SILENT. A non-finite value is removed and said out loud in the
 *  caption. Quietly plotting the rows that happened to parse is how a chart lies while every
 *  instrument stays green.
 *
 *  ══ COLOUR IS NEVER THE ONLY CARRIER ══════════════════════════════════════════════════════════
 *  Series carry a name in the legend as well as a hue, bars print their value as text, and the whole
 *  figure gets an `aria-label` naming the range it spans. css/intmap.css owns every colour through
 *  `--chart-cat-*`; nothing in this file hard-codes one, so dark mode needs no branch here.
 *
 *  ══ ⚠ WHY THIS FILE EXPORTS NOTHING ═══════════════════════════════════════════════════════════
 *  A lazily-loaded module registers its factory on `window.IntMapModules` and exports no name, the
 *  way js/atlas-query.js does. The alternative fails a real invariant rather than a style rule:
 *  tests/r175 ③ requires every `export` in js/ to be imported BY NAME by some other js/ module, and
 *  the only file that could do that here is js/atlas-console.js — whose static import would fold
 *  this whole module back into its chunk, which is the 4,901-byte ceiling this round went out of
 *  its way to stay under. So the door is the registration, and a node check reaches the factory
 *  through `window.IntMapModules` after setting `globalThis.window` — which is also how it proves
 *  the module EVALUATES rather than merely parses (#R505).
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.atlasChart = function (HOST, CTX) {
  /* Self-sufficient by construction: js/lazy-modules.js mounts a lazy module with HOST alone, and a
     renderer that could only be built from js/atlas-console.js's closure could not be mounted that
     way. `CTX` is still honoured when the console builds it directly, so there is one implementation
     either way rather than a lazy copy and an eager copy (CONSTITUTION.md §5 — Atlas is ONE system).
     ⚠ The bare `L` binding is shape ④ of scripts/i18n-helpers.mjs: `npm run check:i18n` reads the
     five positional arguments below, and a language added later needs no edit in this file. */
  const L = (CTX && CTX.L) || window.IntMapLang.pick(function () { try { return HOST ? HOST.lang : 'en'; } catch (_) { return 'en'; } });
  const esc = (CTX && CTX.esc) || function (s) { try { return window.IntMapSafe.esc(s); } catch (_) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); } };

  /* ⚠ EVERY PLOTTED MARK CARRIES `data-mark`. The chart observer (js/atlas-capabilities.js) counts
     them IN THE EMITTED HTML and holds the total against the count the renderer reports, so what is
     verified is the artefact the reader will actually receive — not the renderer's own say-so. A
     figure that comes back `ok` with nothing drawn in it is `not_rendered`, exactly as a map draw
     that painted nothing is. ⚠ It is an attribute rather than a class name on purpose: #R488 showed
     that a check pinned to a CSS spelling keeps passing after the rule it names has stopped
     matching anything, and a restyle must not be able to silently blind the verifier. */
  const MARK = ' data-mark="1"';

  /* The bubble is `width:min(400px,100vw-28px)` with `.atl-b.a` at `padding:2px 1px`, and its tab
     form sets `overflow-x:hidden` — content wider than the column is CUT, not scrolled
     (js/atlas-styles.js). 340px is the width the two existing in-bubble figures already committed
     to (`.atl-viewframe` and the ballistic profile), so it is the width that is known to fit. */
  const MAXW = 340;
  const VBW = 320;                       /* viewBox width; the SVG scales to the column uniformly */

  /* §2.6's minimum, kept as one number with one reason rather than re-decided per kind. */
  const MIN_TREND = 3;                   /* a line/scatter needs three real points to be a trend */
  const MIN_COMPARE = 2;                 /* a bar chart needs two categories to be a comparison */

  const KINDS = ['line', 'bar', 'scatter', 'timeline'];

  /* ── numbers. Intl only, in the app's locale — never a hand-rolled k/M/B table. js/widget-core.js
        already owns this decision; use it when the board module is present and fall back to the same
        Intl call when it is not, so this file never becomes a second answer to "how do we format a
        number" (#R492: 数の区切りはロケールに訊く). ──────────────────────────────────────────── */
  const _nf = {};
  function locale() {
    try { return window.IntMapWidgetCore ? window.IntMapWidgetCore.locale() : window.IntMapLang.locale(HOST && HOST.lang, 'en-GB'); }
    catch (_) { return 'en-GB'; }
  }
  function num(v, opts) {
    if (v == null || !isFinite(v)) return '';
    try {
      if (window.IntMapWidgetCore) return window.IntMapWidgetCore.num(v, opts) || '';
      const k = locale() + '|' + JSON.stringify(opts || {});
      if (!_nf[k]) _nf[k] = new Intl.NumberFormat(locale(), opts || {});
      return _nf[k].format(v);
    } catch (_) { return String(v); }
  }
  /* axis labels want to stay short without lying about magnitude */
  const tick = (v) => num(v, { notation: 'compact', maximumFractionDigits: 1 });
  const full = (v) => num(v, { maximumFractionDigits: 3 });

  /* ── nice-number ticks. js/ had no tick generator at all before this round: every existing chart
        prints its two end points and calls that an axis, which is why none of them can show where
        zero is or how far apart two bars really are. Standard 1/2/5×10^k. ──────────────────────── */
  function niceStep(span, target) {
    if (!(span > 0)) return 1;
    const raw = span / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    /* 2.5 belongs in the family: without it a 0–100 range asks for four intervals and is given two,
       because 2.5 rounds up to 5 and the step doubles. Quarters read as naturally as halves. */
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  function niceScale(lo, hi, target) {
    if (!isFinite(lo) || !isFinite(hi)) return null;
    if (lo === hi) { const p = Math.abs(lo) || 1; lo -= p * 0.5; hi += p * 0.5; }
    const step = niceStep(hi - lo, target || 4);
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
    const ticks = [];
    /* accumulate by index, not by repeated addition — 0.1 added thirty times is not 3 */
    for (let i = 0; a + i * step <= b + step * 1e-9; i++) ticks.push(a + i * step);
    return { lo: a, hi: b, step, ticks };
  }

  /* ── the honest intake. Returns the rows that are real, and how many were not. ───────────────── */
  /* ⚠⚠ `isFinite(+v)` IS NOT "IS THIS A NUMBER". `+null`, `+''`, `+false` and `+[]` are all 0 and all
     finite, so a row whose value is MISSING would be plotted as a real zero — the chart would show a
     country emitting nothing rather than a country whose figure was not reported, and the caption
     would say nothing was dropped because nothing was. That is precisely the "a chart lies while
     every instrument stays green" failure this file exists to refuse, so absence is tested for
     before conversion and only a genuine number (or a numeric string) survives. */
  const isNum = (v) => (v !== null && v !== '' && typeof v !== 'boolean' && !Array.isArray(v) && v !== undefined && isFinite(+v));
  function clean(points, needX) {
    const rows = [], out = { rows, dropped: 0 };
    (points || []).forEach((p) => {
      if (!p || !isNum(p.y) || (needX && !isNum(p.x))) { out.dropped++; return; }
      rows.push({ x: +p.x, y: +p.y, label: p.label == null ? '' : String(p.label) });
    });
    return out;
  }

  function refuse(reason, detail) { return { ok: false, reason, detail: detail || '' }; }

  /* ── the figure shell. Title, the drawing, a legend when there is more than one series, and the
        caption that carries the source and any dropped rows. ─────────────────────────────────── */
  function figure(inner, o) {
    const legend = (o.legend || []).length > 1
      ? '<div class="atl-ch-lg">' + o.legend.map((s, i) =>
        '<span class="atl-ch-lgi"><i class="atl-ch-sw" style="background:var(--chart-cat-' + (i % 10 + 1) + ')"></i>' + esc(s) + '</span>').join('') + '</div>'
      : '';
    const drops = o.dropped
      ? ' · ' + L('{n} row(s) had no usable value and are not drawn',
        '{n} 件は値が読めないため描いていません',
        '{n} Zeile(n) ohne verwertbaren Wert sind nicht dargestellt',
        '{n} строк(и) без пригодного значения не показаны',
        '{n} fila(s) sin valor utilizable no se dibujan').split('{n}').join(o.dropped)
      : '';
    return '<figure class="atl-ch" style="max-width:' + MAXW + 'px;">'
      + (o.title ? '<div class="atl-ch-t">' + esc(o.title) + '</div>' : '')
      + inner + legend
      + '<figcaption class="atl-ch-c">' + esc(o.source) + esc(drops) + '</figcaption>'
      + '</figure>';
  }

  /* the plot frame shared by every numeric kind */
  function frame(H, pad, yS, xLabels, opts) {
    const iw = VBW - pad.l - pad.r, ih = H - pad.t - pad.b;
    let g = '';
    yS.ticks.forEach((t) => {
      const y = pad.t + ih * (1 - (t - yS.lo) / (yS.hi - yS.lo));
      g += '<line class="atl-ch-g" x1="' + pad.l + '" x2="' + (pad.l + iw) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>'
        + '<text class="atl-ch-ax" x="' + (pad.l - 4) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + esc(tick(t)) + '</text>';
    });
    if (yS.lo < 0 && yS.hi > 0) {
      const z = pad.t + ih * (1 - (0 - yS.lo) / (yS.hi - yS.lo));
      g += '<line class="atl-ch-0" x1="' + pad.l + '" x2="' + (pad.l + iw) + '" y1="' + z.toFixed(1) + '" y2="' + z.toFixed(1) + '"/>';
    }
    (xLabels || []).forEach((t) => {
      g += '<text class="atl-ch-ax" x="' + t.x.toFixed(1) + '" y="' + (H - pad.b + 12) + '" text-anchor="' + (t.anchor || 'middle') + '">' + esc(t.text) + '</text>';
    });
    if (opts && opts.yTitle) g += '<text class="atl-ch-ax" x="2" y="' + (pad.t - 4) + '">' + esc(opts.yTitle) + '</text>';
    return g;
  }

  function open(H, aria) {
    return '<svg class="atl-ch-s" viewBox="0 0 ' + VBW + ' ' + H + '" width="100%" role="img" aria-label="' + esc(aria) + '">';
  }

  /* ── LINE / SCATTER ─────────────────────────────────────────────────────────────────────────── */
  function numeric(spec, kind) {
    const H = 168, pad = { l: 40, r: 8, t: 14, b: 26 };
    const iw = VBW - pad.l - pad.r, ih = H - pad.t - pad.b;
    let dropped = 0;
    const series = [];
    (spec.series || []).forEach((s) => {
      const c = clean(s.points, true); dropped += c.dropped;
      if (c.rows.length) series.push({ label: String(s.label == null ? '' : s.label), rows: c.rows.sort((a, b) => a.x - b.x) });
    });
    const all = series.reduce((a, s) => a.concat(s.rows), []);
    if (all.length < MIN_TREND) {
      return refuse('too_few_points', L(
        'a {kind} needs at least {min} real points; {n} arrived',
        '{kind} には実データが最低 {min} 点必要ですが {n} 点しかありません',
        'ein {kind} braucht mindestens {min} echte Punkte; {n} erhalten',
        'для {kind} нужно минимум {min} реальных точек, получено {n}',
        'un {kind} necesita al menos {min} puntos reales; llegaron {n}')
        .split('{kind}').join(kind).split('{min}').join(MIN_TREND).split('{n}').join(all.length));
    }
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const yS = niceScale(Math.min.apply(null, ys), Math.max.apply(null, ys), 4);
    const xlo = Math.min.apply(null, xs), xhi = Math.max.apply(null, xs);
    const X = (v) => pad.l + iw * (xhi === xlo ? 0.5 : (v - xlo) / (xhi - xlo));
    const Y = (v) => pad.t + ih * (1 - (v - yS.lo) / (yS.hi - yS.lo));
    /* an x axis is two honest end points when the axis is a year, and the extremes otherwise */
    const xf = spec.x && spec.x.type === 'year' ? (v) => String(Math.round(v)) : tick;
    /* ⚠ …but the SPOKEN label may not use the compact form. `tick` exists because an axis label has
       a few millimetres; a screen reader has a sentence. Compact rounds 2000 and 2020 to the same
       "2K", so the aria said «2K to 2K» — a range with no range in it, for the one reader who has
       nothing else to go on. The axis keeps compact; the sentence gets the real number. */
    const xa = spec.x && spec.x.type === 'year' ? (v) => String(Math.round(v)) : full;
    let plotted = 0;
    let body = frame(H, pad, yS, [
      { x: pad.l, text: xf(xlo), anchor: 'start' },
      { x: pad.l + iw, text: xf(xhi), anchor: 'end' },
    ], { yTitle: spec.y && spec.y.label });
    series.forEach((s, i) => {
      const col = 'var(--chart-cat-' + (i % 10 + 1) + ')';
      if (kind === 'line' && s.rows.length >= 2) {
        plotted++;
        body += '<path class="atl-ch-l"' + MARK + ' style="stroke:' + col + '" d="'
          + s.rows.map((p, k) => (k ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ') + '"/>';
      }
      /* scatter draws every point; a line marks them only when there are few enough to read */
      if (kind === 'scatter' || s.rows.length <= 24) {
        s.rows.forEach((p) => {
          plotted++;
          body += '<circle class="atl-ch-p"' + MARK + ' style="fill:' + col + '" cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="' + (kind === 'scatter' ? 3.2 : 2.2) + '"><title>'
            + esc((p.label ? p.label + ' · ' : '') + xf(p.x) + ' · ' + full(p.y)) + '</title></circle>';
        });
      }
    });
    /* ⚠ the aria label is the WHOLE chart for a reader who cannot see it, so it is translated like
       any other sentence. The static key with {…} holes is the form the inline tables can match —
       a concatenated first argument never equals a table key, so fr/ko/zh would silently stay
       English while `check:i18n` reported full coverage (it can only extract literals). */
    const aria = (spec.title ? spec.title + ' — ' : '') + L(
      '{kind} chart, {x0} to {x1}, values {y0} to {y1}',
      '{kind} のグラフ、{x0} から {x1}、値は {y0} から {y1}',
      '{kind}-Diagramm, {x0} bis {x1}, Werte {y0} bis {y1}',
      'диаграмма {kind}, от {x0} до {x1}, значения от {y0} до {y1}',
      'gráfico {kind}, de {x0} a {x1}, valores de {y0} a {y1}')
      .split('{kind}').join(kind).split('{x0}').join(xa(xlo)).split('{x1}').join(xa(xhi))
      .split('{y0}').join(full(Math.min.apply(null, ys))).split('{y1}').join(full(Math.max.apply(null, ys)));
    return { ok: true, plotted, kind, html: figure(open(H, aria) + body + '</svg>', { title: spec.title, source: spec.source, dropped, legend: series.map((s) => s.label) }) };
  }

  /* ── BAR — a ranked comparison. Horizontal, because the labels are country and city names and a
        vertical bar chart 320px wide cannot show them. ────────────────────────────────────────── */
  function bars(spec) {
    const s0 = (spec.series || [])[0] || {};
    const c = clean(s0.points, false);
    const rows = c.rows.filter((r) => r.label);
    if (rows.length < MIN_COMPARE) {
      return refuse('too_few_categories', L(
        'a bar chart needs at least {min} labelled values; {n} arrived',
        '棒グラフには名前つきの値が最低 {min} 件必要ですが {n} 件しかありません',
        'ein Balkendiagramm braucht mindestens {min} benannte Werte; {n} erhalten',
        'для столбчатой диаграммы нужно минимум {min} именованных значений, получено {n}',
        'un gráfico de barras necesita al menos {min} valores con nombre; llegaron {n}')
        .split('{min}').join(MIN_COMPARE).split('{n}').join(rows.length));
    }
    /* the caller's order is the answer's order — the renderer does not decide the ranking */
    const vs = rows.map((r) => r.y);
    const lo = Math.min(0, Math.min.apply(null, vs)), hi = Math.max(0, Math.max.apply(null, vs));
    const span = (hi - lo) || 1, zero = (0 - lo) / span;
    const html = rows.map((r, i) => {
      const f = (r.y - lo) / span;
      const left = Math.min(zero, f) * 100, w = Math.max(0.8, Math.abs(f - zero) * 100);
      return '<div class="atl-ch-br"><span class="atl-ch-bl">' + esc(r.label) + '</span>'
        + '<span class="atl-ch-bt"><i class="atl-ch-bf"' + MARK + ' style="left:' + left.toFixed(2) + '%;width:' + w.toFixed(2) + '%;background:var(--chart-cat-' + (i % 10 + 1) + ')"></i></span>'
        + '<span class="atl-ch-bv">' + esc(full(r.y)) + '</span></div>';
    }).join('');
    return {
      ok: true, plotted: rows.length, kind: 'bar',
      html: figure('<div class="atl-ch-bs" role="img" aria-label="' + esc((spec.title ? spec.title + ' — ' : '') + L(
        'bar chart, {n} values from {y0} to {y1}',
        '棒グラフ、{n} 件の値、{y0} から {y1}',
        'Balkendiagramm, {n} Werte von {y0} bis {y1}',
        'столбчатая диаграмма, {n} значений от {y0} до {y1}',
        'gráfico de barras, {n} valores de {y0} a {y1}')
        .split('{n}').join(rows.length).split('{y0}').join(full(Math.min.apply(null, vs))).split('{y1}').join(full(Math.max.apply(null, vs)))) + '">' + html + '</div>',
      { title: spec.title, source: spec.source, dropped: c.dropped, legend: [] }),
    };
  }

  /* ── TIMELINE — events on a real time axis. IntMap's subject is largely history (CShapes, the war
        layers, the historical city names, Chronos), and until now an answer about a stretch of time
        could only draw the map at ONE instant of it. ─────────────────────────────────────────── */
  function timeline(spec) {
    const H = 96, pad = { l: 8, r: 8, t: 30, b: 22 };
    const iw = VBW - pad.l - pad.r;
    let dropped = 0;
    const evs = [];
    /* a timeline's rows are events, so it accepts them under their own name as well as in the
       `series[0].points` shape the numeric kinds use — one caller should not have to know which */
    const src = spec.events || ((spec.series || [])[0] || {}).points || [];
    src.forEach((e) => {
      const t = e && e.t != null ? Date.parse(e.t) : NaN;
      if (!isFinite(t) || !e.label) { dropped++; return; }
      evs.push({ t, label: String(e.label) });
    });
    if (evs.length < MIN_COMPARE) {
      return refuse('too_few_events', L(
        'a timeline needs at least {min} dated events; {n} arrived',
        '年表には日付のある出来事が最低 {min} 件必要ですが {n} 件しかありません',
        'eine Zeitleiste braucht mindestens {min} datierte Ereignisse; {n} erhalten',
        'для хронологии нужно минимум {min} событий с датами, получено {n}',
        'una cronología necesita al menos {min} eventos fechados; llegaron {n}')
        .split('{min}').join(MIN_COMPARE).split('{n}').join(evs.length));
    }
    evs.sort((a, b) => a.t - b.t);
    const t0 = evs[0].t, t1 = evs[evs.length - 1].t, span = (t1 - t0) || 1;
    const X = (t) => pad.l + iw * ((t - t0) / span);
    const yr = (t) => new Date(t).getUTCFullYear();
    /* year gridlines when the span is long enough for them to mean something */
    let g = '', y0 = yr(t0), y1 = yr(t1);
    if (y1 > y0) {
      const st = Math.max(1, niceStep(y1 - y0, 4));
      for (let y = Math.ceil(y0 / st) * st; y <= y1; y += st) {
        const x = X(Date.UTC(y, 0, 1));
        if (x < pad.l || x > pad.l + iw) continue;
        g += '<line class="atl-ch-g" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + pad.t + '" y2="' + (H - pad.b) + '"/>'
          + '<text class="atl-ch-ax" x="' + x.toFixed(1) + '" y="' + (H - pad.b + 12) + '" text-anchor="middle">' + y + '</text>';
      }
    }
    g += '<line class="atl-ch-tl" x1="' + pad.l + '" x2="' + (pad.l + iw) + '" y1="' + (H - pad.b - 8) + '" y2="' + (H - pad.b - 8) + '"/>';
    /* labels alternate above the rule so that neighbours in time do not overprint */
    evs.forEach((e, i) => {
      const x = X(e.t), up = i % 2 === 0;
      g += '<line class="atl-ch-tk" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + (H - pad.b - 8) + '" y2="' + (up ? pad.t + 8 : H - pad.b - 2) + '"/>'
        + '<circle class="atl-ch-p"' + MARK + ' style="fill:var(--chart-cat-' + (i % 10 + 1) + ')" cx="' + x.toFixed(1) + '" cy="' + (H - pad.b - 8) + '" r="3"><title>'
        + esc(new Date(e.t).toISOString().slice(0, 10) + ' · ' + e.label) + '</title></circle>'
        + '<text class="atl-ch-ev" x="' + x.toFixed(1) + '" y="' + (up ? pad.t + 4 : H - pad.b + 2) + '" text-anchor="middle">' + esc(e.label) + '</text>';
    });
    const aria = (spec.title ? spec.title + ' — ' : '') + L(
      'timeline, {n} events from {y0} to {y1}',
      '年表、{y0} から {y1} までの {n} 件の出来事',
      'Zeitleiste, {n} Ereignisse von {y0} bis {y1}',
      'хронология, {n} событий с {y0} по {y1}',
      'cronología, {n} eventos de {y0} a {y1}')
      .split('{n}').join(evs.length).split('{y0}').join(yr(t0)).split('{y1}').join(yr(t1));
    return { ok: true, plotted: evs.length, kind: 'timeline', html: figure(open(H, aria) + g + '</svg>', { title: spec.title, source: spec.source, dropped, legend: [] }) };
  }

  /* ── the one entry point ────────────────────────────────────────────────────────────────────── */
  function render(spec) {
    spec = spec || {};
    const kind = String(spec.kind || '').toLowerCase();
    if (KINDS.indexOf(kind) < 0) {
      return refuse('unknown_kind', L(
        'chart kind must be one of {kinds}',
        'グラフの種類は {kinds} のいずれかです',
        'Diagrammtyp muss einer von {kinds} sein',
        'тип диаграммы должен быть одним из {kinds}',
        'el tipo de gráfico debe ser uno de {kinds}').split('{kinds}').join(KINDS.join(', ')));
    }
    /* ⚠ the provenance gate. A chart with no stated origin is refused — see the header. */
    if (!spec.source || !String(spec.source).trim()) {
      return refuse('no_source', L(
        'every chart must say where its numbers came from (source)',
        'グラフには数字の出所 (source) が必ず要ります',
        'jedes Diagramm muss seine Datenherkunft nennen (source)',
        'каждая диаграмма должна указывать источник данных (source)',
        'todo gráfico debe indicar el origen de sus datos (source)'));
    }
    try {
      if (kind === 'bar') return bars(spec);
      if (kind === 'timeline') return timeline(spec);
      return numeric(spec, kind);
    } catch (e) { return refuse('render_failed', (e && e.message) || 'error'); }
  }

  return { render, niceScale, KINDS, MIN_TREND, MIN_COMPARE, MAXW };
};
