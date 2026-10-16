/* ============================================================================
 *  IntMap · js/readiness-page.js — readiness.html, the network and device check   (wave4-sales)
 * ----------------------------------------------------------------------------
 *  The page (scripts/org-pages.mjs readinessBody) is the allowlist: one table row per host the browser
 *  requests, each carrying the request that asks it (data-probe) and its tier (data-tier). This module
 *  runs the check on press — never on load: it contacts every row's host, and a reader decides that —
 *  with js/readiness-check.js (the same rules Atlas's `system.readiness` uses), writes each answer into
 *  its row, joins a host it could not reach to last night's check (js/service-status.js, imported when
 *  needed so a page whose status file cannot be read still checks), and offers the result as text:
 *  copied, downloaded, or carried into an enquiry (contact.html?attach=readiness — js/org-page.js puts
 *  it in the message box; the reader still writes and sends the enquiry themselves).
 *  Holds no words: every sentence is in the page's data-live / data-report / data-tiers, in its language.
 *  ⚠ Nothing a host answered is shown — a no-cors probe cannot read it — and nothing is inserted as markup.
 * ==========================================================================*/
import { probeAll, deviceReport, assess, TIERS } from './readiness-check.js';

/* the key js/org-page.js reads on contact.html?attach=readiness — sessionStorage, so it lives only in this tab */
const ATTACH_KEY = 'intmap_readiness_report';

const root = document.getElementById('rd');
if (root) wire(root);

function wire(main) {
  const json = (name) => { try { return JSON.parse(main.getAttribute(name) || '{}'); } catch (_) { return {}; } };
  const LIVE = json('data-live'), REP = json('data-report'), TIER = json('data-tiers');
  const lang = main.getAttribute('data-lang') === 'jp' ? 'ja' : 'en';
  const timeoutMs = Number(main.getAttribute('data-timeout-ms')) || undefined;
  const concurrency = Number(main.getAttribute('data-concurrency')) || undefined;
  const ctx = main.getAttribute('data-context') || '';
  const fill = (s, v) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m));
  const $ = (id) => document.getElementById(id);
  const start = $('rd-start'), result = $('result'), progress = $('rd-progress');
  const rows = Array.prototype.slice.call(main.querySelectorAll('tr[data-probe]'));
  const probes = rows.map((tr) => ({ host: tr.getAttribute('data-host'), url: tr.getAttribute('data-probe'), tier: tr.getAttribute('data-tier'),
    what: tr.cells[1] ? tr.cells[1].textContent : '' }));   /* the use, in the page's own language */
  const siteRow = main.querySelector('tr[data-site]');
  let report = '', attach = '';

  /* ── the allowlist as text, usable before (and without) a check ── */
  const allowText = () => {
    const lines = [];
    for (const t of TIERS) {
      lines.push('# ' + (TIER[t] || t));
      if (t === 'first' && siteRow) lines.push(location.origin);
      for (const p of probes) if (p.tier === t) lines.push(p.host);
      lines.push('');
    }
    return lines.join('\n');
  };
  const copy = (btn, text) => {
    const label = btn.textContent;
    const done = () => { btn.textContent = LIVE.copied || label; setTimeout(() => { btn.textContent = label; }, 2200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => { /* refused: the label stays */ });
  };
  const copyAllow = $('rd-copy-allow');
  if (copyAllow && navigator.clipboard) { copyAllow.hidden = false; copyAllow.addEventListener('click', () => copy(copyAllow, allowText())); }

  if (!start || !rows.length) return;
  start.hidden = false;

  const setState = (tr, text, cls) => { const c = tr.querySelector('.rd-state'); if (c) { c.textContent = text; c.className = 'rd-state' + (cls ? ' is-' + cls : ''); } };
  const stateText = (r) => r.verdict === 'reached' ? fill(LIVE.reached, { ms: r.ms }) : r.verdict === 'timeout' ? fill(LIVE.timeout, { s: Math.round((timeoutMs || 0) / 1000) }) : LIVE.blocked;
  const li = (ul, text, cls) => { const e = document.createElement('li'); e.textContent = text; if (cls) e.className = 'is-' + cls; ul.appendChild(e); };

  start.addEventListener('click', async () => {
    start.disabled = true;
    result.hidden = false;
    $('rd-verdict').hidden = true;
    for (const tr of rows) setState(tr, LIVE.pending, '');
    if (siteRow) setState(siteRow, LIVE.site, 'ok');   /* this page loaded from it */
    progress.textContent = fill(LIVE.running, { n: 0, total: probes.length });
    try { result.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) { /* an old browser: the reader scrolls */ }
    const device = deviceReport(document, window);
    const results = await probeAll(probes, {
      timeoutMs, concurrency,
      onResult: (r, i, done) => { setState(rows[i], stateText(r), r.verdict === 'reached' ? 'ok' : 'bad'); progress.textContent = fill(LIVE.running, { n: done, total: probes.length }); },
    });
    /* last night's answer for the hosts not reached — read only now, and a failure to read it leaves «unknown» */
    let lastNight = null;
    if (results.some((r) => r.verdict !== 'reached')) {
      try { const S = await import('./service-status.js'); const b = await S.loadStatus((main.getAttribute('data-up') || './') + 'data/service-status.json'); if (S.usable(b)) lastNight = (h) => S.upstreamFor(b, h); } catch (_) { lastNight = null; }
    }
    const m = assess(device, results, lastNight);
    const rowOf = new Map(rows.map((tr) => [tr.getAttribute('data-probe'), tr]));
    for (const r of m.missing) {
      const tr = rowOf.get(r.url);
      if (!tr) continue;
      const note = r.supplier === 'down' ? LIVE.supplierDown : r.supplier === 'up' ? LIVE.supplierUp : '';
      setState(tr, stateText(r) + (note ? ' — ' + note : ''), r.supplier === 'down' ? 'warn' : 'bad');
    }
    render(device, m);
    progress.textContent = '';
    start.textContent = LIVE.again || start.textContent;
    start.disabled = false;
  });

  function render(device, m) {
    const head = { ready: [LIVE.ready, LIVE.readyNote], partial: [LIVE.partial, LIVE.partialNote], 'not-ready': [LIVE.notReady, LIVE.notReadyNote] }[m.overall];
    $('rd-verdict-h').textContent = head[0];
    $('rd-verdict-p').textContent = head[1];
    $('rd-verdict').className = 'lp-tile rd-verdict is-' + m.overall;
    const dev = $('rd-device'); dev.textContent = '';
    const devLines = [];
    const add = (text, cls) => { devLines.push(text); li(dev, text, cls); };
    if (device.online === false) add(LIVE.offline, 'bad');
    add(fill(device.map ? LIVE.mapOk : LIVE.mapNo, { ctx }), device.map ? 'ok' : 'bad');
    if (device.map && device.accelerated != null) add(device.accelerated ? LIVE.accelOk : LIVE.accelNo, device.accelerated ? 'ok' : 'warn');
    add(device.workers ? LIVE.workersOk : LIVE.workersNo, device.workers ? 'ok' : 'bad');
    add(device.offline ? LIVE.offlineOk : LIVE.offlineNo, device.offline ? 'ok' : 'warn');
    if (device.storage === false) add(LIVE.storageNo, 'warn');
    const tiers = $('rd-tiers'); tiers.textContent = '';
    const tierLines = [];
    for (const t of TIERS) {
      const c = m.tiers[t];
      const line = (TIER[t] || t) + ': ' + fill(LIVE.tierCount, { reached: c.reached, total: c.total });
      tierLines.push(line);
      li(tiers, line, c.reached === c.total ? 'ok' : t === 'layer' ? 'warn' : 'bad');
      const badge = main.querySelector('[data-count-for="' + t + '"]');
      if (badge) badge.textContent = fill(LIVE.tierCount, { reached: c.reached, total: c.total });
    }
    const hostLine = (r) => '  ' + r.host + ' — ' + r.what + ' [' + stateText(r) + ']';
    let when = '';
    try { when = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'long' }).format(new Date()); } catch (_) { when = new Date().toISOString(); }
    /* the enquiry's copy names each host without its description: the message box has a length the form enforces */
    const shortLine = (r) => '  ' + r.host + ' [' + stateText(r) + ']';
    const compose = (line) => [
      REP.title, fill(REP.when, { when }), fill(REP.page, { url: location.href.split('#')[0] }), fill(REP.browser, { ua: navigator.userAgent }), '',
      fill(REP.verdict, { verdict: head[0] }), ...devLines, ...tierLines, '',
      REP.notReached, ...(m.allow.length ? m.allow.map(line) : ['  ' + REP.none]), '',
      REP.supplier, ...(m.supplierDown.length ? m.supplierDown.map(line) : ['  ' + REP.none]),
    ].join('\n');
    report = compose(hostLine);
    attach = compose(shortLine);
    $('rd-verdict').hidden = false;
  }

  const copyReport = $('rd-copy-report');
  if (copyReport) copyReport.addEventListener('click', () => { if (report) copy(copyReport, report); });
  const download = $('rd-download');
  if (download) download.addEventListener('click', () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([report + '\n'], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'intmap-network-check.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const send = $('rd-send');
  if (send) send.addEventListener('click', () => { try { if (attach) sessionStorage.setItem(ATTACH_KEY, attach); } catch (_) { /* no storage: the form opens empty */ } });
}
