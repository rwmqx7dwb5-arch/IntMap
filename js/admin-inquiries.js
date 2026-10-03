/* ============================================================================
 *  IntMap · the enquiries console — admin-inquiries.html   (sales-channels)
 * ----------------------------------------------------------------------------
 *  Where an administrator reads what organisations sent through contact.html (public.org_inquiries)
 *  and keeps the public list of supporters (public.supporters). A page of its own beside admin.html,
 *  not a tab inside it: admin.html is one 2,000-line inline console, and this one has no reason to load
 *  with it. It signs in with the same Supabase project, so a session started in admin.html is the
 *  session here (supabase-js keeps it under one key per project, in this origin's storage).
 *
 *  WHO MAY DO WHAT is decided by the database, not by this file (20261003150000_org_inquiries.sql):
 *  RLS lets only an admin read an enquiry, change its status / note / handled_at (the message and the
 *  address cannot be changed by anyone), delete it, and write a supporter row. The gate below only
 *  saves a non-admin from an empty page — a non-admin who skipped it would read nothing.
 *
 *  THE SUPPORTER FLOW (no webhook, no payment data — PRODUCT.md §2.4 left the webhook unapproved):
 *  a supporter sends an enquiry with purpose «supporter_listing»; the admin checks the gift in the
 *  Stripe dashboard BY HAND, then «List as supporter» writes the row with consented_at = the moment the
 *  enquiry was sent (the request to be named IS the consent). Unlisting hides the row from the public
 *  page; deleting removes it.
 *
 *  THE PIPELINE (sales-next): the Pipeline tab loads js/admin-pipeline.js with import() — where each conversation
 *  stands (lead → talking → trial → adopted | declined), what the operator will do next and by when. The triage
 *  words below and the stages are read from <main>'s data-* (written by scripts/org-pages.mjs from
 *  supabase/functions/_shared/inquiry-shape.js INQUIRY_PIPELINE), not spelled here.
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

  /* the triage words — the table's CHECK, carried by the page (see the header) */
  var STATUSES = [];
  var sb = null, filter = null, only = null, pipe = null;

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.supabase || !window.supabase.createClient) { $('aq-auth-msg').textContent = 'Supabase SDK failed to load (vendor/supabase-js.js missing from this deploy).'; return; }
    var main = $('aq-view-admin');
    STATUSES = String((main && main.getAttribute('data-statuses')) || '').split(',').filter(Boolean);
    filter = STATUSES[0] || 'all';   /* the console opens on the first triage word: what nobody has answered yet */
    sb = window.supabase.createClient(meta('intmap-backend'), meta('intmap-anon-key'), { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

    $('aq-auth-submit').addEventListener('click', signIn);
    $('aq-auth-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') signIn(); });
    $('aq-signout').addEventListener('click', function () { sb.auth.signOut().then(function () { location.reload(); }); });
    document.querySelectorAll('[data-filter]').forEach(function (b) {
      b.addEventListener('click', function () { filter = b.getAttribute('data-filter'); only = null; markTabs(); loadInquiries(); });
    });
    $('tab-sup').addEventListener('click', function () { filter = 'supporters'; markTabs(); loadSupporters(); });
    $('tab-pipe').addEventListener('click', function () { filter = 'pipeline'; markTabs(); loadPipeline(); });
    gate();
  });

  function markTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.classList.toggle('active', (b.getAttribute('data-filter') || (b.id === 'tab-pipe' ? 'pipeline' : 'supporters')) === filter);
    });
    $('list-inq').classList.toggle('hide', filter === 'supporters' || filter === 'pipeline');
    $('list-sup').classList.toggle('hide', filter !== 'supporters');
    $('list-pipe').classList.toggle('hide', filter !== 'pipeline');
  }

  function signIn() {
    var email = $('aq-auth-email').value.trim(), password = $('aq-auth-pass').value;
    if (!email || !password) { $('aq-auth-msg').textContent = 'Enter email and password.'; return; }
    $('aq-auth-submit').disabled = true; $('aq-auth-msg').textContent = 'Working…';
    sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      /* enumeration-safe, as admin.html: never say whether the address exists or is an admin */
      if (r.error) { $('aq-auth-msg').textContent = 'Invalid email or password.'; return; }
      return gate();
    }, function () { $('aq-auth-msg').textContent = 'Invalid email or password.'; })
      .then(function () { $('aq-auth-submit').disabled = false; });
  }

  function show(v) { $('aq-view-auth').classList.toggle('hide', v !== 'auth'); $('aq-view-admin').classList.toggle('hide', v !== 'admin'); }

  function gate() {
    return sb.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      if (!session) { show('auth'); return; }
      return sb.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle().then(function (p) {
        if (p.error || !p.data || !p.data.is_admin) {
          show('auth'); $('aq-auth-msg').textContent = 'This account is not an admin.';
          return sb.auth.signOut();
        }
        $('who').textContent = session.user.email || '';
        show('admin'); markTabs(); loadInquiries();
      });
    });
  }

  /* ── enquiries ─────────────────────────────────────────────────────────────────────────── */
  function loadInquiries() {
    var box = $('list-inq');
    box.textContent = ''; box.appendChild(el('p', 'empty', 'Loading…'));
    var q = sb.from('org_inquiries').select('*').order('created_at', { ascending: false }).limit(200);
    if (only) q = q.eq('id', only);   /* one enquiry, opened from the pipeline */
    else if (filter !== 'all') q = q.eq('status', filter);
    q.then(function (r) {
      box.textContent = '';
      if (r.error) { box.appendChild(el('p', 'empty', 'Could not read enquiries: ' + r.error.message)); return; }
      if (!r.data.length) { box.appendChild(el('p', 'empty', 'No enquiries with this status.')); return; }
      r.data.forEach(function (row) { box.appendChild(inquiryCard(row)); });
    });
  }

  function inquiryCard(row) {
    var c = el('div', 'card');
    var top = el('div', 'row');
    top.appendChild(el('span', 'pill ' + row.status, row.status));
    top.appendChild(el('span', 'pill', row.audience));
    top.appendChild(el('span', 'pill', row.purpose));
    if (row.stage) top.appendChild(el('span', 'pill stage', 'stage: ' + row.stage));
    top.appendChild(el('span', 'meta', when(row.created_at) + (row.lang ? ' · ' + row.lang : '') + (row.page ? ' · ' + row.page : '')));
    c.appendChild(top);

    var who = el('h2', null, row.name + (row.organization ? ' — ' + row.organization : ''));
    c.appendChild(who);
    var facts = el('div', 'row meta');
    if (row.role) facts.appendChild(el('span', null, row.role));
    if (row.country) facts.appendChild(el('span', null, row.country));
    var mail = el('a', null, row.email);
    mail.href = window.IntMapSafe.url('mailto:' + row.email + '?subject=' + encodeURIComponent('Re: your enquiry to IntMap'));
    facts.appendChild(mail);
    if (row.website) {
      var w = window.IntMapSafe.url(row.website);
      if (w) { var a = el('a', null, row.website); a.href = w; a.rel = 'noopener noreferrer'; a.target = '_blank'; facts.appendChild(a); }
    }
    c.appendChild(facts);
    c.appendChild(el('div', 'msg', row.message));

    var note = el('textarea'); note.value = row.admin_note || ''; note.maxLength = 2000;
    var lab = el('label', 'f', 'Internal note (only admins see it)'); lab.appendChild(note); c.appendChild(lab);

    var acts = el('div', 'row acts');
    STATUSES.filter(function (s) { return s !== row.status; }).forEach(function (s) {
      acts.appendChild(btn('Mark ' + s, 'sec sm', function () { update(row, { status: s, admin_note: note.value || null, handled_at: s === STATUSES[0] ? null : new Date().toISOString() }); }));
    });
    acts.appendChild(btn('Save note', 'sec sm', function () { update(row, { admin_note: note.value || null }); }));
    acts.appendChild(btn('Delete', 'danger sm', function () {
      if (!confirm('Delete this enquiry permanently?')) return;
      sb.from('org_inquiries').delete().eq('id', row.id).then(function (r) { if (r.error) toast('Delete failed: ' + r.error.message); else { toast('Deleted'); loadInquiries(); } });
    }));
    c.appendChild(acts);
    if (row.purpose === 'supporter_listing') c.appendChild(listForm(row));
    return c;
  }

  function update(row, patch) {
    sb.from('org_inquiries').update(patch).eq('id', row.id).then(function (r) {
      if (r.error) toast('Update failed: ' + r.error.message); else { toast('Saved'); loadInquiries(); }
    });
  }

  /* ── the pipeline (js/admin-pipeline.js, fetched the first time the tab opens) ─────────────────────── */
  function loadPipeline() {
    var box = $('list-pipe');
    if (pipe) { pipe.then(function (p) { if (p) p.reload(); }); return; }
    box.textContent = ''; box.appendChild(el('p', 'empty', 'Loading…'));
    pipe = import('./admin-pipeline.js').then(function (M) {
      return M.mountPipeline(box, { sb: sb, words: M.wordsFrom($('aq-view-admin')), toast: toast,
        openEnquiry: function (row) { filter = 'all'; only = row.id; markTabs(); loadInquiries(); } });
    }, function (e) { pipe = null; box.textContent = ''; box.appendChild(el('p', 'empty', 'Could not load the pipeline: ' + (e && e.message || e))); return null; });
  }

  /* «List as supporter» — after the admin has matched the gift in the Stripe dashboard by hand */
  function listForm(row) {
    var f = el('div', 'sup-form');
    var name = el('input'); name.value = row.name.slice(0, 60); name.maxLength = 60;
    var month = el('input'); month.type = 'month'; month.value = String(row.created_at || '').slice(0, 7);
    var noteIn = el('input'); noteIn.maxLength = 140;
    [['Display name', name], ['Month of the gift', month], ['Optional line (up to 140 characters)', noteIn]].forEach(function (p) { var l = el('label', 'f', p[0]); l.appendChild(p[1]); f.appendChild(l); });
    f.appendChild(btn('List as supporter (gift checked in Stripe)', 'sm', function () {
      if (!name.value.trim() || !/^\d{4}-\d{2}$/.test(month.value)) { toast('A display name and a month are required.'); return; }
      sb.from('supporters').insert({ display_name: name.value.trim(), since_month: month.value + '-01', note: noteIn.value.trim() || null, consented_at: row.created_at })
        .then(function (r) { if (r.error) toast('Could not list: ' + r.error.message); else toast('Listed on support.html'); });
    }));
    return f;
  }

  /* ── supporters ────────────────────────────────────────────────────────────────────────── */
  function loadSupporters() {
    var box = $('list-sup');
    box.textContent = ''; box.appendChild(el('p', 'empty', 'Loading…'));
    sb.from('supporters').select('*').order('since_month', { ascending: true }).then(function (r) {
      box.textContent = '';
      if (r.error) { box.appendChild(el('p', 'empty', 'Could not read supporters: ' + r.error.message)); return; }
      if (!r.data.length) { box.appendChild(el('p', 'empty', 'No supporter is listed. Supporters are added from a «supporter_listing» enquiry.')); return; }
      r.data.forEach(function (s) {
        var c = el('div', 'card');
        var top = el('div', 'row');
        top.appendChild(el('strong', null, s.display_name));
        top.appendChild(el('span', 'meta', String(s.since_month).slice(0, 7) + ' · consent ' + when(s.consented_at)));
        top.appendChild(el('span', 'pill' + (s.listed ? '' : ' spam'), s.listed ? 'listed' : 'hidden'));
        c.appendChild(top);
        if (s.note) c.appendChild(el('div', 'msg', s.note));
        var acts = el('div', 'row');
        acts.appendChild(btn(s.listed ? 'Hide' : 'Show', 'sec sm', function () {
          sb.from('supporters').update({ listed: !s.listed }).eq('id', s.id).then(function (u) { if (u.error) toast('Update failed: ' + u.error.message); else loadSupporters(); });
        }));
        acts.appendChild(btn('Remove', 'danger sm', function () {
          if (!confirm('Remove this supporter from the list permanently?')) return;
          sb.from('supporters').delete().eq('id', s.id).then(function (u) { if (u.error) toast('Remove failed: ' + u.error.message); else loadSupporters(); });
        }));
        c.appendChild(acts);
        box.appendChild(c);
      });
    });
  }
})();
