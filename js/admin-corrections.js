/* ============================================================================
 *  IntMap · the map-corrections console — admin-corrections.html   (community-next)
 * ----------------------------------------------------------------------------
 *  Where an administrator reads what readers reported as wrong on the map (public.map_corrections), sees
 *  every report ON A MAP, opens the exact view the reader saw, checks it, answers the reader and publishes
 *  what was fixed. A page of its own beside admin.html and admin-inquiries.html (the same reasons as the
 *  enquiries console: admin.html is one inline console, and this one has no reason to load with it).
 *
 *  WHO MAY DO WHAT is decided by the database (20261003224500_map_corrections.sql): only an admin reads a
 *  report and changes its status / reply / note / fix reference / duplicate / published flag / public place
 *  name; nobody can change what the reader wrote. resolved_at follows the status by trigger. The publish
 *  rule (a reply is required, only an answer is publishable) is a CHECK — this page says it before saving.
 *
 *  THE MAP is the Natural Earth land mask this site already ships (data/land-mask.png — equirectangular,
 *  -180..180 × 90..-90, the same file js/ uses for land/sea), drawn in an SVG whose viewBox IS longitude and
 *  negated latitude, so a report's dot is placed by its own coordinates and nothing else. A click on a dot
 *  selects the report; «Open in IntMap» opens the reader's own view (the share fragment they sent) on the
 *  live map, layers and year included — the map the operator judges on is the one the reader saw.
 *
 *  ⚠ HISTORY IS VERIFIED AS HISTORY (.agents/rules/historical-verification.md). A report made on a historical
 *  map carries its year; the card then gives the enumeration command for that year and place
 *  (scripts/hist-fidelity.mjs --year --in) and the rule's five questions. Being reported is not being
 *  wrong, and the upstream saying so is not history either.
 *
 *  ⚠ Every value from the database goes into the DOM as textContent; links go through IntMapSafe.url
 *  (js/safe-html.js), which admits http(s) and mailto only. English only, like admin.html.
 * ==========================================================================*/
(function () {
  'use strict';
  var d = document.documentElement;
  try { d.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (_) { /* light */ }

  function meta(n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute('content') || '' : ''; }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function btn(label, cls, fn) { var b = el('button', 'btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; }
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.className = 'toast show'; clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast'; }, 3200); }
  function when(iso) { try { return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return String(iso || ''); } }
  function yearText(y) { return y == null ? '' : (y < 0 ? (-y) + ' BC' : String(y)); }

  /* The words the console offers are the page's (the generator writes them from _shared/correction-shape.js into
     data-* attributes on <main>), so this file restates no vocabulary. */
  var STATUSES = [], PUBLISHABLE = [], OPEN = [];
  /* how near another report must be to be offered as a possible duplicate. ESTIMATE: a place name or a border segment
     a reader points at is within a few km of where another reader points at the same thing; 25 km keeps a city's
     reports together without merging neighbouring towns. Expires when the console shows unrelated neighbours here. */
  var NEAR_KM = 25;
  var sb = null, filter = 'open', rows = [], selected = null, view = [-180, -90, 360, 180];

  document.addEventListener('DOMContentLoaded', function () {
    var main = $('mc-view-admin');
    STATUSES = String(main.getAttribute('data-statuses') || '').split(',').filter(Boolean);
    PUBLISHABLE = String(main.getAttribute('data-publishable') || '').split(',').filter(Boolean);
    OPEN = String(main.getAttribute('data-open') || '').split(',').filter(Boolean);
    if (!window.supabase || !window.supabase.createClient) { $('mc-auth-msg').textContent = 'Supabase SDK failed to loadCorrections (vendor/supabase-js.js missing from this deploy).'; return; }
    sb = window.supabase.createClient(meta('intmap-backend'), meta('intmap-anon-key'), { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    $('mc-auth-submit').addEventListener('click', adminSignIn);
    $('mc-auth-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') adminSignIn(); });
    $('mc-signout').addEventListener('click', function () { sb.auth.signOut().then(function () { location.reload(); }); });
    document.querySelectorAll('[data-filter]').forEach(function (b) {
      b.addEventListener('click', function () { filter = b.getAttribute('data-filter'); markFilterTabs(); loadCorrections(); });
    });
    $('mc-world').addEventListener('click', function () { view = [-180, -90, 360, 180]; drawReportMap(); });
    adminGate();
  });

  function markFilterTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab[data-filter]'), function (b) { b.classList.toggle('active', b.getAttribute('data-filter') === filter); });
  }
  function adminSignIn() {
    var email = $('mc-auth-email').value.trim(), password = $('mc-auth-pass').value;
    if (!email || !password) { $('mc-auth-msg').textContent = 'Enter email and password.'; return; }
    $('mc-auth-submit').disabled = true; $('mc-auth-msg').textContent = 'Working…';
    sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      if (r.error) { $('mc-auth-msg').textContent = 'Invalid email or password.'; return; }
      return adminGate();
    }, function () { $('mc-auth-msg').textContent = 'Invalid email or password.'; })
      .then(function () { $('mc-auth-submit').disabled = false; });
  }
  function showView(v) { $('mc-view-auth').classList.toggle('hide', v !== 'auth'); $('mc-view-admin').classList.toggle('hide', v !== 'admin'); }
  function adminGate() {
    return sb.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      if (!session) { showView('auth'); return; }
      return sb.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle().then(function (p) {
        if (p.error || !p.data || !p.data.is_admin) {
          showView('auth'); $('mc-auth-msg').textContent = 'This account is not an admin.';
          return sb.auth.signOut();
        }
        $('who').textContent = session.user.email || '';
        showView('admin'); markFilterTabs(); loadCorrections(); loadCorrectionSummary();
      });
    });
  }

  function loadCorrectionSummary() {
    sb.rpc('map_corrections_summary').then(function (r) {
      var s = r && r.data;
      $('mc-summary').textContent = (r.error || !s) ? 'Summary unavailable.'
        : s.received + ' received · ' + s.open + ' open · ' + s.fixed + ' fixed · ' + s.not_an_error + ' not an error · ' + s.cannot_fix + ' cannot fix · '
          + s.historical + ' about a historical year · ' + s.published + ' published'
          + (s.median_days_to_answer != null ? ' · median ' + s.median_days_to_answer + ' days to an answer (last 365 days)' : '');
    });
  }

  function loadCorrections() {
    var box = $('mc-list');
    box.textContent = ''; box.appendChild(el('p', 'empty', 'Loading…'));
    var q = sb.from('map_corrections').select('*').order('created_at', { ascending: false }).limit(500);
    if (filter === 'open') q = q.in('status', OPEN);
    else if (filter === 'answered') q = q.in('status', STATUSES.filter(function (s) { return OPEN.indexOf(s) < 0 && s !== 'spam'; }));
    else if (filter === 'published') q = q.eq('published', true);
    else if (filter === 'historical') q = q.not('year', 'is', null).neq('status', 'spam');
    else if (filter !== 'all') q = q.eq('status', filter);
    q.then(function (r) {
      box.textContent = '';
      if (r.error) { rows = []; drawReportMap(); box.appendChild(el('p', 'empty', 'Could not read corrections: ' + r.error.message)); return; }
      rows = r.data || [];
      if (selected && !rows.some(function (x) { return x.id === selected; })) selected = null;
      drawReportMap();
      if (!rows.length) { box.appendChild(el('p', 'empty', 'No corrections here.')); return; }
      rows.forEach(function (row) { box.appendChild(correctionCard(row)); });
    });
  }

  /* ── the map ───────────────────────────────────────────────────────────────────────────────── */
  function drawReportMap() {
    var svg = $('mc-map');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', view.join(' '));
    var img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    img.setAttribute('href', './data/land-mask.png'); img.setAttribute('x', '-180'); img.setAttribute('y', '-90');
    img.setAttribute('width', '360'); img.setAttribute('height', '180'); img.setAttribute('preserveAspectRatio', 'none'); img.setAttribute('class', 'land');
    svg.appendChild(img);
    var r = Math.max(0.35, view[2] / 140);
    rows.forEach(function (row) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', String(row.lng)); c.setAttribute('cy', String(-row.lat)); c.setAttribute('r', String(row.id === selected ? r * 1.6 : r));
      c.setAttribute('class', 'dot s-' + row.status + (row.id === selected ? ' sel' : ''));
      var t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = row.status + ' · ' + row.kind + ' · ' + (row.place_label || (row.lat.toFixed(3) + ', ' + row.lng.toFixed(3))) + (row.year != null ? ' · ' + yearText(row.year) : '');
      c.appendChild(t);
      /* a dot is a control: focusable and pressed with Enter or Space, like the list's buttons */
      c.setAttribute('tabindex', '0'); c.setAttribute('role', 'button'); c.setAttribute('aria-label', t.textContent);
      c.addEventListener('click', function () { selectReport(row.id, true); });
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectReport(row.id, true); } });
      svg.appendChild(c);
    });
  }
  function selectReport(id, scroll) {
    selected = id;
    var row = rows.filter(function (x) { return x.id === id; })[0];
    if (row) { var w = 24; view = [Math.max(-180, Math.min(180 - w, row.lng - w / 2)), Math.max(-90, Math.min(90 - w / 2, -row.lat - w / 4)), w, w / 2]; }
    drawReportMap();
    Array.prototype.forEach.call(document.querySelectorAll('.card[data-id]'), function (c) { c.classList.toggle('sel', c.getAttribute('data-id') === id); });
    if (scroll) { var c = document.querySelector('.card[data-id="' + id + '"]'); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function km(a, b) {
    var R = 6371, toR = Math.PI / 180, dl = (b.lat - a.lat) * toR, dg = (b.lng - a.lng) * toR;
    var h = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dg / 2) * Math.sin(dg / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* ── one report ────────────────────────────────────────────────────────────────────────────── */
  function correctionCard(row) {
    var c = el('div', 'card'); c.setAttribute('data-id', row.id);
    if (row.id === selected) c.classList.add('sel');
    var top = el('div', 'row');
    top.appendChild(el('span', 'pill ' + row.status, row.status));
    top.appendChild(el('span', 'pill', row.kind));
    if (row.year != null) top.appendChild(el('span', 'pill hist', 'map year ' + yearText(row.year)));
    if (row.published) top.appendChild(el('span', 'pill pub', 'published'));
    top.appendChild(el('span', 'meta', when(row.created_at) + (row.lang ? ' · ' + row.lang : '') + (row.user_id ? ' · signed in' : ' · anonymous')));
    c.appendChild(top);

    var where = el('h2', null, (row.place_label || 'No place name') + ' — ' + row.lat.toFixed(4) + ', ' + row.lng.toFixed(4) + (row.country ? ' · ' + row.country : ''));
    c.appendChild(where);
    var facts = el('div', 'row meta');
    facts.appendChild(el('span', null, 'Layer: ' + (row.layer_label ? row.layer_label + ' (' + row.layer_id + ')' : (row.layer_id || 'not named'))));
    if (row.zoom != null) facts.appendChild(el('span', null, 'zoom ' + row.zoom));
    if (row.map_time) facts.appendChild(el('span', null, 'clock ' + row.map_time));
    c.appendChild(facts);
    c.appendChild(el('div', 'msg', row.message));
    var links = el('div', 'row');
    if (row.evidence_url) { var u = window.IntMapSafe.url(row.evidence_url); if (u) { var a = el('a', null, 'Source the reader gave'); a.href = u; a.rel = 'noopener noreferrer'; a.target = '_blank'; links.appendChild(a); } }
    /* the reader's own view, as the share fragment the card attached (the table requires one); built as a URL object so
       nothing read from the database is re-read as markup */
    var open = el('a', null, 'Open the reader\'s view in IntMap');
    var u = new URL('./index.html', location.href); u.hash = String(row.map_link || '').replace(/^#/, ''); open.href = u.href; open.target = '_blank'; open.rel = 'noopener';
    links.appendChild(open);
    links.appendChild(btn('Show on the map above', 'sec sm', function () { selectReport(row.id, false); }));
    c.appendChild(links);

    if (row.year != null) c.appendChild(historyCheck(row));
    var near = rows.filter(function (o) { return o.id !== row.id && km(o, row) <= NEAR_KM; });
    if (near.length) c.appendChild(nearReports(row, near));
    c.appendChild(answerFields(row));
    return c;
  }

  /* .agents/rules/historical-verification.md §2 — the five things, and the command that enumerates the year and place */
  function historyCheck(row) {
    var b = el('div', 'hist');
    b.appendChild(el('strong', null, 'Historical claim — check it as history, not as a gate'));
    var w = (row.lng - 1).toFixed(2), s = (row.lat - 1).toFixed(2), e = (row.lng + 1).toFixed(2), n = (row.lat + 1).toFixed(2);
    var cmd = 'node scripts/hist-fidelity.mjs --year ' + row.year + ' --in ' + w + ',' + s + ',' + e + ',' + n;
    var code = el('code', null, cmd); b.appendChild(code);
    b.appendChild(btn('Copy command', 'sec sm', function () { try { navigator.clipboard.writeText(cmd).then(function () { toast('Copied'); }); } catch (_) { toast(cmd); } }));
    var ol = el('ol');
    ['List what is drawn at this year and place (the command above) — not totals.',
      'Hold each unit against when its institution was created and abolished — an upstream date is not history.',
      'Is the map stating a date no source states (a clock floor, a neighbour\'s date)?',
      'Measure coverage by area for this country, not by count.',
      'Two claims on one place: dispute, overlap or seam?'].forEach(function (t) { ol.appendChild(el('li', null, t)); });
    b.appendChild(ol);
    return b;
  }
  function nearReports(row, near) {
    var b = el('div', 'near');
    b.appendChild(el('strong', null, near.length + ' other report(s) within ' + NEAR_KM + ' km'));
    near.slice(0, 6).forEach(function (o) {
      var r = el('div', 'row');
      var a = el('a', null, o.status + ' · ' + o.kind + ' · ' + (o.place_label || '') + ' · ' + String(o.created_at).slice(0, 10) + (o.year != null ? ' · ' + yearText(o.year) : ''));
      a.href = '#'; a.addEventListener('click', function (e) { e.preventDefault(); selectReport(o.id, true); });
      r.appendChild(a);
      if (OPEN.indexOf(row.status) >= 0 && o.id !== row.duplicate_of) r.appendChild(btn('This one is a duplicate of it', 'sec sm', function () { saveCorrection(row, { status: 'duplicate', duplicate_of: o.id }); }));
      b.appendChild(r);
    });
    return b;
  }
  function answerFields(row) {
    var f = el('div', 'answer');
    var st = el('select');
    STATUSES.forEach(function (s) { var o = el('option', null, s); o.value = s; st.appendChild(o); });
    st.value = row.status;
    var place = el('input'); place.value = row.place_label || ''; place.maxLength = 200;
    var reply = el('textarea'); reply.value = row.reply || ''; reply.maxLength = 2000; reply.rows = 3;
    var ref = el('input'); ref.value = row.fixed_ref || ''; ref.maxLength = 400; ref.placeholder = 'https://github.com/…/pull/… or a short description';
    var note = el('textarea'); note.value = row.admin_note || ''; note.maxLength = 2000; note.rows = 2;
    var pub = el('input'); pub.type = 'checkbox'; pub.checked = !!row.published;
    [['Status', st], ['Place name shown publicly', place], ['Answer to the reader (shown to them; public if published)', reply], ['What was changed (link or text)', ref], ['Internal note (admins only)', note]].forEach(function (p) {
      var l = el('label', 'f', p[0]); l.appendChild(p[1]); f.appendChild(l);
    });
    var pl = el('label', 'chk'); pl.appendChild(pub); pl.appendChild(document.createTextNode(' Publish in the public corrections log (corrections.html) — only answers with a reply')); f.appendChild(pl);
    var acts = el('div', 'row acts');
    acts.appendChild(btn('Save', 'sm', function () {
      if (pub.checked && (PUBLISHABLE.indexOf(st.value) < 0 || !reply.value.trim())) { toast('Only an answer (' + PUBLISHABLE.join(', ') + ') with a reply can be published.'); return; }
      saveCorrection(row, { status: st.value, place_label: place.value.trim() || null, reply: reply.value.trim() || null, fixed_ref: ref.value.trim() || null,
        admin_note: note.value.trim() || null, published: pub.checked, duplicate_of: st.value === 'duplicate' ? row.duplicate_of : null });
    }));
    acts.appendChild(btn('Delete', 'danger sm', function () {
      if (!confirm('Delete this correction permanently? The reader\'s receipt will then read «no longer on record».')) return;
      sb.from('map_corrections').delete().eq('id', row.id).then(function (r) { if (r.error) toast('Delete failed: ' + r.error.message); else { toast('Deleted'); loadCorrections(); loadCorrectionSummary(); } });
    }));
    f.appendChild(acts);
    return f;
  }
  function saveCorrection(row, patch) {
    sb.from('map_corrections').update(patch).eq('id', row.id).then(function (r) {
      if (r.error) toast('Save failed: ' + r.error.message); else { toast('Saved — the reader sees it on their next check'); loadCorrections(); loadCorrectionSummary(); }
    });
  }
})();
