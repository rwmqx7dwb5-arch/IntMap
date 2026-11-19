/* ============================================================================
 *  IntMap · the admin console's DELEGATION panel — how Atlas's delegated child calls went
 * ----------------------------------------------------------------------------
 *  Reads ONE thing: the RPC `delegation_overview(p_days)` (admin-only; reads the 30-day journal
 *  ai_delegation_journal). Contract, per day: children / ok / failed / refused / p50_ms / p90_ms / cost_usd;
 *  codes: [{code, n}] (the refusal and failure codes); roots: {turns, p50_ms, p90_ms, cost_usd}.
 *  NOTHING IS MADE UP: a null percentile prints a dash, an error prints its own text, no rows prints
 *  an empty state. A figure the RPC does not return (a percentile across days) is not computed here.
 *  `unobserved` = children - ok - failed - refused, when positive: children whose outcome was never
 *  recorded. It is DERIVED from the four counts and labelled as such; it is not a fifth server field.
 *
 *  A classic script (like admin-auth.js): window.IntMapAdminDelegation = { RANGES, model, html, load }.
 *  `model` and `html` are pure (tests/admin-delegation-checks.test.mjs evaluates them); `load` calls the RPC.
 *  English only, like admin.html. Every value goes through the escaper handed in (window.IntMapSafe.html).
 * ==========================================================================*/
(function () {
  'use strict';
  var RANGES = [1, 7, 30];

  function num(v) { var n = Number(v); return v !== null && v !== '' && isFinite(n) ? n : 0; }
  /* a percentile: null/NaN stays null (printed as a dash), never 0 */
  function pct(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function fmtMs(v) { var n = pct(v); return n === null ? '–' : n < 1000 ? Math.round(n) + ' ms' : (n / 1000).toFixed(n < 10000 ? 2 : 1) + ' s'; }
  function fmtUsd(v) { var n = num(v); return '$' + n.toFixed(Math.abs(n) < 1 ? 4 : 2); }

  /** the RPC's jsonb (or null) -> everything the table needs */
  function model(data) {
    var d = data && typeof data === 'object' ? data : {};
    var rows = (Array.isArray(d.days) ? d.days : []).map(function (r) {
      var children = num(r.children), ok = num(r.ok), failed = num(r.failed), refused = num(r.refused);
      return { day: String(r.day == null ? '' : r.day), children: children, ok: ok, failed: failed, refused: refused,
        unobserved: Math.max(0, children - ok - failed - refused), p50: pct(r.p50_ms), p90: pct(r.p90_ms), cost: num(r.cost_usd) };
    }).sort(function (a, b) { return a.day < b.day ? 1 : a.day > b.day ? -1 : 0; });   /* newest first */
    var total = rows.reduce(function (t, r) {
      t.children += r.children; t.ok += r.ok; t.failed += r.failed; t.refused += r.refused; t.unobserved += r.unobserved; t.cost += r.cost; return t;
    }, { children: 0, ok: 0, failed: 0, refused: 0, unobserved: 0, cost: 0 });
    var codes = (Array.isArray(d.codes) ? d.codes : []).map(function (c) { return { code: String(c.code == null ? '' : c.code), n: num(c.n) }; })
      .sort(function (a, b) { return b.n - a.n; });
    var r0 = d.roots && typeof d.roots === 'object' ? d.roots : null;
    var roots = r0 ? { turns: num(r0.turns), p50: pct(r0.p50_ms), p90: pct(r0.p90_ms), cost: num(r0.cost_usd) } : null;
    return { rows: rows, total: total, codes: codes, roots: roots, peak: rows.reduce(function (m, r) { return Math.max(m, r.children); }, 0),
      empty: !rows.length && !codes.length && !(roots && roots.turns) };
  }

  var CLR = { ok: '#30d158', failed: '#ff453a', refused: '#ff9f0a', unobserved: '#8e8e93' };
  var KINDS = ['ok', 'failed', 'refused', 'unobserved'];
  /** a day's stacked bar: widths are shares of the busiest day, so days compare */
  function bar(r, peak, H) {
    if (!peak || !r.children) return '';
    var parts = KINDS.filter(function (k) { return r[k] > 0; }).map(function (k) {
      return '<span title="' + H(k + ': ' + r[k]) + '" style="display:block;height:100%;background:' + CLR[k] + ';width:' + (r[k] / peak * 100).toFixed(2) + '%;"></span>';
    });
    return '<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--in,#eee);" role="img" aria-label="' +
      H(r.ok + ' ok, ' + r.failed + ' failed, ' + r.refused + ' refused' + (r.unobserved ? ', ' + r.unobserved + ' unobserved' : '')) + '">' + parts.join('') + '</div>';
  }

  /** the panel body (a string of HTML) for one RPC answer; `H` is the escaper. error -> its text, never data. */
  function html(data, error, H) {
    H = H || function (s) { return String(s); };
    if (error) return '<p class="muted">Could not read the delegation overview: ' + H(error.message || String(error)) + '</p>';
    var m = model(data);
    if (m.empty) return '<p class="muted">No delegated calls recorded in this period.</p>';
    var td = 'style="text-align:right;font-variant-numeric:tabular-nums;"';
    var out = '';
    out += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin:0 0 12px;font-size:12px;" class="muted">' +
      KINDS.map(function (k) {
        return '<span><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:' + CLR[k] + ';margin-right:5px;"></span>' + k + '</span>';
      }).join('') + '</div>';
    out += '<div style="overflow:auto;max-height:360px;"><table><thead><tr><th>Day (UTC)</th><th>Children</th><th>ok</th><th>failed</th><th>refused</th><th>unobserved</th>' +
      '<th>p50</th><th>p90</th><th>Cost</th><th style="width:26%;"></th></tr></thead><tbody>';
    out += m.rows.map(function (r) {
      return '<tr><td style="white-space:nowrap;">' + H(r.day) + '</td><td ' + td + '>' + H(r.children) + '</td><td ' + td + '>' + H(r.ok) + '</td><td ' + td + '>' + H(r.failed) +
        '</td><td ' + td + '>' + H(r.refused) + '</td><td ' + td + '>' + H(r.unobserved) + '</td><td ' + td + '>' + H(fmtMs(r.p50)) + '</td><td ' + td + '>' + H(fmtMs(r.p90)) +
        '</td><td ' + td + '>' + H(fmtUsd(r.cost)) + '</td><td>' + bar(r, m.peak, H) + '</td></tr>';
    }).join('');
    if (m.rows.length) {
      out += '<tr style="font-weight:700;"><td>Total</td><td ' + td + '>' + H(m.total.children) + '</td><td ' + td + '>' + H(m.total.ok) + '</td><td ' + td + '>' + H(m.total.failed) +
        '</td><td ' + td + '>' + H(m.total.refused) + '</td><td ' + td + '>' + H(m.total.unobserved) + '</td><td></td><td></td><td ' + td + '>' + H(fmtUsd(m.total.cost)) + '</td><td></td></tr>';
    } else out += '<tr><td colspan="10" class="muted">No delegated child calls in this period.</td></tr>';
    out += '</tbody></table></div>';
    if (m.roots) {
      out += '<h3 style="margin:16px 0 6px;font-size:14px;">Root turns</h3><table><thead><tr><th>Turns</th><th>p50</th><th>p90</th><th>Cost</th></tr></thead><tbody><tr><td ' + td + '>' +
        H(m.roots.turns) + '</td><td ' + td + '>' + H(fmtMs(m.roots.p50)) + '</td><td ' + td + '>' + H(fmtMs(m.roots.p90)) + '</td><td ' + td + '>' + H(fmtUsd(m.roots.cost)) + '</td></tr></tbody></table>';
    }
    out += '<h3 style="margin:16px 0 6px;font-size:14px;">Top refusal and failure codes</h3>';
    out += m.codes.length ? '<table><tbody>' + m.codes.slice(0, 15).map(function (c) {
      return '<tr><td style="word-break:break-all;">' + H(c.code === '' ? '(none)' : c.code) + '</td><td ' + td + '>' + H(c.n) + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="muted">No refusal or failure codes in this period.</p>';
    return out;
  }

  /** call the RPC for a range and return the HTML; `sb` is the console's signed-in client */
  function load(sb, days, H) {
    var p = Math.max(1, Math.min(30, parseInt(days, 10) || 7));
    return Promise.resolve().then(function () { return sb.rpc('delegation_overview', { p_days: p }); })
      .then(function (r) { return html(r && r.data, r && r.error, H); }, function (e) { return html(null, e, H); });
  }

  var api = { RANGES: RANGES, model: model, html: html, load: load, fmtMs: fmtMs, fmtUsd: fmtUsd };
  if (typeof window !== 'undefined') window.IntMapAdminDelegation = api;
})();
