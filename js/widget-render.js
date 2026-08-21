/* ============================================================================
 *  IntMap · THE RENDER KIT — THE SHAPES A CARD IS ALLOWED TO BE
 * ----------------------------------------------------------------------------
 *  window.IntMapWidgetRender — the pieces every widget's S/M/L renderers are built from.
 *
 *  ══ WHY A KIT RATHER THAN ONE TEMPLATE ════════════════════════════════════════════════════════
 *  The previous board had exactly one card shape — title, one big value, one caption — and every
 *  one of the 39 widgets was squeezed into it. A list of three earthquakes, a month of dates, a
 *  moon's phase and a currency rate are not the same kind of fact, and printing them all as "a big
 *  string" is what forced the earthquake card to encode three events as one line of HTML.
 *  So there are seven shapes here (§16): value · series · list · geo · alert · article · calendar,
 *  plus progress. A definition picks the shape that matches its data at each size.
 *
 *  ══ ⚠ NOTHING HERE INVENTS DATA ═══════════════════════════════════════════════════════════════
 *  §2.6 forbids a graph the source did not provide. `series()` therefore takes REAL points and
 *  refuses to draw fewer than three of them — a "sparkline" from one value is decoration shaped
 *  like evidence. Where a source has no history, the renderer shows the value and says when it was
 *  measured, which is all it actually knows.
 *
 *  ⚠ AND COLOUR IS NEVER THE ONLY CARRIER (§16). Every severity gets a shape and a word; every
 *  change gets an arrow and a sign as well as a hue.
 * ==========================================================================*/
window.IntMapWidgetRender = (function () {
  'use strict';

  var WC = window.IntMapWidgetCore;
  var R = {};
  var el = WC.el;

  /* ── the card header. `sub` is the small right-hand slot: a source, a time, a status pip. ─── */
  R.head = function (o) {
    var kids = [];
    if (o.icon) kids.push(el('span', { class: 'wgt-h-i' }, [WC.icon(o.icon, { size: 14 })]));
    kids.push(el('span', { class: 'wgt-h-t', text: o.title }));
    if (o.trailing) kids.push(el('span', { class: 'wgt-h-x' }, [o.trailing]));
    return el('div', { class: 'wgt-h' }, kids);
  };

  /* ── VALUE: one number, its unit, an optional change and a caption ───────────────────────── */
  R.value = function (o) {
    var v = el('div', { class: 'wgt-val' + (o.small ? ' sm' : '') }, [
      el('span', { class: 'wgt-val-n', text: o.value == null ? '' : String(o.value) }),
      o.unit ? el('span', { class: 'wgt-val-u', text: o.unit }) : null,
    ]);
    var box = el('div', { class: 'wgt-value' }, [v]);
    if (o.delta != null) box.appendChild(R.delta(o.delta, o.deltaUnit, o.deltaLabel));
    if (o.caption) box.appendChild(el('div', { class: 'wgt-cap', text: o.caption }));
    if (o.sub) box.appendChild(el('div', { class: 'wgt-sub' }, Array.isArray(o.sub) ? o.sub : [o.sub]));
    return box;
  };
  /* ⚠ an arrow AND a sign AND a word — not a green number (§16, §18) */
  R.delta = function (v, unit, label) {
    var up = v > 0, flat = (v === 0 || v == null || !isFinite(v));
    var word = flat ? WC.L('no change', '変化なし', 'unverändert', 'без изменений', 'sin cambios')
      : up ? WC.L('up', '上昇', 'aufwärts', 'рост', 'sube')
        : WC.L('down', '下落', 'abwärts', 'падение', 'baja');
    return el('span', {
      class: 'wgt-delta ' + (flat ? 'flat' : up ? 'up' : 'down'),
      'aria-label': (label ? label + ' ' : '') + word + ' ' + (flat ? '' : Math.abs(v)) + (unit || ''),
    }, [
      el('span', { class: 'wgt-delta-a', 'aria-hidden': 'true', text: flat ? '→' : up ? '▲' : '▼' }),
      el('span', { text: flat ? '0' : (up ? '+' : '−') + WC.num(Math.abs(v), { maximumFractionDigits: 2 }) }),
      unit ? el('span', { class: 'wgt-delta-u', text: unit }) : null,
    ]);
  };

  /* ── LIST: rows with a leading mark, a title, a trailing fact ────────────────────────────── */
  R.list = function (rows, opts) {
    opts = opts || {};
    var ul = el('ul', { class: 'wgt-list' + (opts.dense ? ' dense' : ''), role: 'list' });
    rows.forEach(function (r) {
      var kids = [];
      if (r.mark) kids.push(el('span', { class: 'wgt-li-m' + (r.tone ? ' ' + r.tone : ''), text: r.mark }));
      else if (r.icon) kids.push(el('span', { class: 'wgt-li-m' }, [WC.icon(r.icon, { size: 13 })]));
      var mid = el('span', { class: 'wgt-li-b' }, [el('span', { class: 'wgt-li-t', text: r.title })]);
      if (r.sub) mid.appendChild(el('span', { class: 'wgt-li-s', text: r.sub }));
      kids.push(mid);
      if (r.trailing) kids.push(el('span', { class: 'wgt-li-x', text: r.trailing }));
      var inner;
      if (r.onClick) {
        inner = el('button', { type: 'button', class: 'wgt-li-hit', 'aria-label': r.label || r.title, onclick: function (ev) { ev.stopPropagation(); r.onClick(ev); } }, kids);
      } else if (r.href) {
        inner = WC.link(r.href, kids, { class: 'wgt-li-hit', 'aria-label': r.label || r.title });
      } else {
        inner = el('span', { class: 'wgt-li-hit static' }, kids);
      }
      ul.appendChild(el('li', { class: 'wgt-li' }, [inner]));
    });
    return ul;
  };

  /* ── SERIES: a real line, from real points. Refuses to draw a trend it was not given. ────── */
  R.series = function (points, opts) {
    opts = opts || {};
    var pts = (points || []).filter(function (p) { return p && isFinite(p.v); });
    if (pts.length < 3) return null;                      /* §2.6 — no pseudo-sparkline */
    var w = opts.width || 260, h = opts.height || 56, pad = 3;
    var vs = pts.map(function (p) { return p.v; });
    var lo = opts.min != null ? opts.min : Math.min.apply(null, vs);
    var hi = opts.max != null ? opts.max : Math.max.apply(null, vs);
    if (hi === lo) { hi = lo + 1; lo = lo - 1; }
    var x = function (i) { return pad + (w - 2 * pad) * (pts.length === 1 ? 0.5 : i / (pts.length - 1)); };
    var y = function (v) { return pad + (h - 2 * pad) * (1 - (v - lo) / (hi - lo)); };
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('class', 'wgt-series');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label || (WC.L('Trend', '推移', 'Verlauf', 'Динамика', 'Evolución') + ': ' +
      WC.num(vs[0], { maximumFractionDigits: 2 }) + ' → ' + WC.num(vs[vs.length - 1], { maximumFractionDigits: 2 })));
    /* a zero/baseline rule, when the range crosses it */
    if (lo < 0 && hi > 0) {
      var z = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      z.setAttribute('x1', String(pad)); z.setAttribute('x2', String(w - pad));
      z.setAttribute('y1', String(y(0))); z.setAttribute('y2', String(y(0)));
      z.setAttribute('class', 'wgt-series-0');
      svg.appendChild(z);
    }
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
    if (opts.fill !== false) {
      var area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      area.setAttribute('d', d + ' L' + x(pts.length - 1).toFixed(1) + ' ' + (h - pad) + ' L' + x(0).toFixed(1) + ' ' + (h - pad) + ' Z');
      area.setAttribute('class', 'wgt-series-a');
      svg.appendChild(area);
    }
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', d);
    line.setAttribute('class', 'wgt-series-l');
    svg.appendChild(line);
    var box = el('div', { class: 'wgt-serieswrap' }, [svg]);
    if (opts.axis) {
      box.appendChild(el('div', { class: 'wgt-series-ax' }, [
        el('span', { text: opts.axis[0] }), el('span', { text: opts.axis[1] }),
      ]));
    }
    return box;
  };

  /* ── BARS: a labelled horizontal comparison (real values only) ───────────────────────────── */
  R.bars = function (rows, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.v) || 0; }).concat([1]));
    var box = el('div', { class: 'wgt-bars' });
    rows.forEach(function (r) {
      var w = Math.max(2, Math.round(100 * Math.abs(r.v) / max));
      box.appendChild(el('div', { class: 'wgt-bar-r' }, [
        el('span', { class: 'wgt-bar-l', text: r.label }),
        el('span', { class: 'wgt-bar-t' }, [el('span', { class: 'wgt-bar-f' + (r.tone ? ' ' + r.tone : ''), style: 'width:' + w + '%' })]),
        el('span', { class: 'wgt-bar-v', text: r.text != null ? r.text : WC.num(r.v, { maximumFractionDigits: 1 }) }),
      ]));
    });
    return box;
  };

  /* ── PROGRESS: bar, ring, or timeline. Percent is stated in text as well as drawn. ───────── */
  R.progress = function (pct, opts) {
    opts = opts || {};
    var p = Math.max(0, Math.min(100, pct));
    if (opts.ring) {
      var size = opts.size || 62, r = size / 2 - 5, c = 2 * Math.PI * r;
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
      svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
      svg.setAttribute('class', 'wgt-ring');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', (opts.label ? opts.label + ' ' : '') + WC.pct(p, 1));
      ['wgt-ring-t', 'wgt-ring-f'].forEach(function (cls, i) {
        var ci = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ci.setAttribute('cx', String(size / 2)); ci.setAttribute('cy', String(size / 2)); ci.setAttribute('r', String(r));
        ci.setAttribute('class', cls);
        if (i) { ci.setAttribute('stroke-dasharray', c.toFixed(2)); ci.setAttribute('stroke-dashoffset', (c * (1 - p / 100)).toFixed(2)); ci.setAttribute('transform', 'rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')'); }
        svg.appendChild(ci);
      });
      return el('div', { class: 'wgt-ringwrap' }, [svg, el('span', { class: 'wgt-ring-n', text: WC.pct(p, opts.digits == null ? 1 : opts.digits) })]);
    }
    return el('div', {
      class: 'wgt-prog', role: 'progressbar',
      'aria-valuenow': String(Math.round(p)), 'aria-valuemin': '0', 'aria-valuemax': '100',
      'aria-label': opts.label || WC.L('Progress', '進捗', 'Fortschritt', 'Прогресс', 'Progreso'),
    }, [el('span', { class: 'wgt-prog-f' + (opts.tone ? ' ' + opts.tone : ''), style: 'width:' + p + '%' })]);
  };
  /* a marked position on a span — "now" inside a day / a week / a year */
  R.timeline = function (o) {
    var p = Math.max(0, Math.min(100, o.pct));
    var marks = (o.marks || []).map(function (m) {
      return el('span', { class: 'wgt-tl-m', style: 'left:' + Math.max(0, Math.min(100, m.pct)) + '%', title: m.label, 'aria-hidden': 'true' });
    });
    return el('div', { class: 'wgt-tl' }, [
      el('div', { class: 'wgt-tl-hd' }, [el('span', { text: o.from }), el('span', { text: o.to })]),
      el('div', { class: 'wgt-tl-t', role: 'img', 'aria-label': (o.label || '') + ' ' + WC.pct(p, 1) },
        marks.concat([el('span', { class: 'wgt-tl-f', style: 'width:' + p + '%' }), el('span', { class: 'wgt-tl-n', style: 'left:' + p + '%' })])),
    ]);
  };

  /* ── GEO: a locator drawn as SVG, NOT a second map engine ─────────────────────────────────
     §20 forbids spinning up map instances inside cards. This is an equirectangular plot of the
     points a card already has, with a graticule for orientation — cheap, static, and honest about
     being a locator rather than a map. */
  R.geo = function (points, opts) {
    opts = opts || {};
    var w = opts.width || 260, h = opts.height || 118;
    var b = opts.bounds;
    var west = b ? b.w : -180, east = b ? b.e : 180, south = b ? b.s : -85, north = b ? b.n : 85;
    if (east <= west) east = west + 1;
    if (north <= south) north = south + 1;
    var X = function (lng) { return ((lng - west) / (east - west)) * w; };
    var Y = function (lat) { return (1 - (lat - south) / (north - south)) * h; };
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('class', 'wgt-geo');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label || WC.L('Locator', '位置図', 'Übersichtskarte', 'Схема расположения', 'Mapa de situación'));
    function add(tag, attrs) {
      var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (var k in attrs) n.setAttribute(k, String(attrs[k]));
      svg.appendChild(n); return n;
    }
    add('rect', { x: 0, y: 0, width: w, height: h, class: 'wgt-geo-bg' });
    var stepX = (east - west) / 6, stepY = (north - south) / 3;
    for (var i = 1; i < 6; i++) add('line', { x1: X(west + stepX * i), x2: X(west + stepX * i), y1: 0, y2: h, class: 'wgt-geo-g' });
    for (var j = 1; j < 3; j++) add('line', { x1: 0, x2: w, y1: Y(south + stepY * j), y2: Y(south + stepY * j), class: 'wgt-geo-g' });
    if (south < 0 && north > 0) add('line', { x1: 0, x2: w, y1: Y(0), y2: Y(0), class: 'wgt-geo-eq' });
    (opts.track || []).forEach(function (seg) {
      if (!seg || seg.length < 2) return;
      add('path', { d: seg.map(function (p, k) { return (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' '), class: 'wgt-geo-tr' });
    });
    (points || []).forEach(function (p) {
      if (!isFinite(p.lng) || !isFinite(p.lat)) return;
      add('circle', { cx: X(p.lng).toFixed(1), cy: Y(p.lat).toFixed(1), r: p.r || 3.6, class: 'wgt-geo-p' + (p.tone ? ' ' + p.tone : '') });
    });
    return el('div', { class: 'wgt-geowrap' }, [svg]);
  };

  /* ── ALERT: severity as a SHAPE and a WORD, then what/where/when ─────────────────────────── */
  R.severityMark = function (level) {
    /* 0 none · 1 advisory · 2 watch · 3 warning · 4 emergency */
    return ['·', '!', '!!', '!!!', '!!!!'][Math.max(0, Math.min(4, level | 0))];
  };
  R.severityWord = function (level) {
    var L = WC.L;
    return [
      L('none', 'なし', 'keine', 'нет', 'ninguno'),
      L('advisory', '注意', 'Hinweis', 'информация', 'aviso'),
      L('watch', '警戒', 'Vorwarnung', 'наблюдение', 'vigilancia'),
      L('warning', '警報', 'Warnung', 'предупреждение', 'alerta'),
      L('emergency', '特別警報', 'Notfall', 'экстренное', 'emergencia'),
    ][Math.max(0, Math.min(4, level | 0))];
  };
  R.alertRow = function (a) {
    return {
      mark: R.severityMark(a.level), tone: 'sev' + Math.max(0, Math.min(4, a.level | 0)),
      title: a.kind, sub: [a.place, a.issuer].filter(Boolean).join(' · '),
      trailing: a.at ? WC.ago(a.at) : '',
      label: R.severityWord(a.level) + ' — ' + a.kind + (a.place ? ' — ' + a.place : ''),
      onClick: a.onClick,
    };
  };

  /* ── ARTICLE: headline, publisher, when ──────────────────────────────────────────────────── */
  R.article = function (a) {
    var kids = [el('span', { class: 'wgt-art-t', text: a.title })];
    var meta = [a.source, a.at ? WC.ago(a.at) : '', a.distance].filter(Boolean).join(' · ');
    if (meta) kids.push(el('span', { class: 'wgt-art-m', text: meta }));
    if (a.excerpt) kids.push(el('span', { class: 'wgt-art-x', text: a.excerpt }));
    return a.href ? WC.link(a.href, kids, { class: 'wgt-art' }) : el('div', { class: 'wgt-art' }, kids);
  };

  /* ── CALENDAR: a real date grid ──────────────────────────────────────────────────────────── */
  R.calendar = function (o) {
    var y = o.year, m = o.month;                                    /* month is 0-based */
    var first = new Date(Date.UTC(y, m, 1));
    var days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    /* the week's first day, in the reader's locale, without a table */
    var wkStart = 1;
    try { var lo = new Intl.Locale(WC.locale()); wkStart = (lo.weekInfo && lo.weekInfo.firstDay) || (lo.getWeekInfo && lo.getWeekInfo().firstDay) || 1; } catch (e) {}
    var lead = (first.getUTCDay() - (wkStart % 7) + 7) % 7;
    var grid = el('div', { class: 'wgt-cal', role: 'grid', 'aria-label': WC.date(first, { year: 'numeric', month: 'long', timeZone: 'UTC' }) });
    var hdr = el('div', { class: 'wgt-cal-h', role: 'row' });
    for (var d = 0; d < 7; d++) {
      var dow = new Date(Date.UTC(2024, 0, 7 + ((wkStart % 7) + d) % 7));  /* 2024-01-07 is a Sunday */
      hdr.appendChild(el('span', { role: 'columnheader', text: WC.date(dow, { weekday: 'narrow', timeZone: 'UTC' }) }));
    }
    grid.appendChild(hdr);
    var body = el('div', { class: 'wgt-cal-b', role: 'rowgroup' });
    for (var i = 0; i < lead; i++) body.appendChild(el('span', { class: 'wgt-cal-d pad', 'aria-hidden': 'true' }));
    for (var day = 1; day <= days; day++) {
      var mark = (o.marks || {})[day];
      var cls = 'wgt-cal-d' + (day === o.today ? ' today' : '') + (mark ? ' mark ' + (mark.tone || '') : '');
      var cell = el('span', { class: cls, role: 'gridcell', text: String(day) });
      if (day === o.today) cell.setAttribute('aria-current', 'date');
      if (mark && mark.label) cell.setAttribute('title', mark.label);
      if (mark && mark.label) cell.setAttribute('aria-label', day + ' — ' + mark.label);
      body.appendChild(cell);
    }
    grid.appendChild(body);
    return grid;
  };

  /* ── CHIPS: small facts side by side ─────────────────────────────────────────────────────── */
  R.chips = function (list) {
    return el('div', { class: 'wgt-chips' }, list.filter(Boolean).map(function (c) {
      return el('span', { class: 'wgt-chip' + (c.tone ? ' ' + c.tone : '') }, [
        c.icon ? WC.icon(c.icon, { size: 12 }) : null,
        el('span', { text: c.label }),
        c.value != null ? el('b', { text: String(c.value) }) : null,
      ]);
    }));
  };
  /* ── KEY/VALUE: the standard fact grid ───────────────────────────────────────────────────── */
  R.facts = function (list, opts) {
    return el('dl', { class: 'wgt-facts' + ((opts && opts.cols) ? ' c' + opts.cols : '') }, list.filter(Boolean).reduce(function (acc, f) {
      acc.push(el('dt', { text: f.k }));
      acc.push(el('dd', { text: f.v == null ? '—' : String(f.v), class: f.tone || null }));
      return acc;
    }, []));
  };

  /* ── ACTION BAR: every entry is a <button> or an <a> (§10) ───────────────────────────────── */
  R.actions = function (list) {
    var use = list.filter(Boolean);
    if (!use.length) return null;
    return el('div', { class: 'wgt-acts' }, use.map(function (a) {
      if (a.href) return WC.link(a.href, [a.icon ? WC.icon(a.icon, { size: 13 }) : null, el('span', { text: a.label })], { class: 'wgt-act' });
      return el('button', {
        type: 'button', class: 'wgt-act' + (a.primary ? ' primary' : '') + (a.on ? ' on' : ''),
        'aria-pressed': a.toggle ? (a.on ? 'true' : 'false') : null,
        'aria-label': a.label, title: a.title || a.label,
        onclick: function (ev) { ev.stopPropagation(); a.run(ev); },
      }, [a.icon ? WC.icon(a.icon, { size: 13 }) : null, el('span', { class: 'wgt-act-t', text: a.label })]);
    }));
  };

  /* ── the source / freshness footnote every data card carries ─────────────────────────────── */
  R.source = function (o) {
    var bits = [];
    if (o.source) bits.push(o.source);
    if (o.at) bits.push(WC.ago(o.at));
    if (!bits.length) return null;
    return el('div', { class: 'wgt-src', text: bits.join(' · ') });
  };

  /* ── the "where" line, kept off the fact line and never wrapped mid-phrase (#R214) ───────── */
  R.where = function (label) {
    if (!label) return null;
    return el('div', { class: 'wgt-where', text: label });
  };

  return R;
})();
