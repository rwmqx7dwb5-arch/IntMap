/* ============================================================================
 *  IntMap · the operator consoles' ONE sign-in path — window.IntMapAdminAuth   (admin-origin)
 * ----------------------------------------------------------------------------
 *  admin.html, admin-inquiries.html and admin-corrections.html each kept their own createClient,
 *  signInWithPassword and is_admin gate. They sign in here now, and only here.
 *
 *  WHAT AN ADMINISTRATOR'S SESSION IS. The database grants admin rights only to a session whose JWT says
 *  aal = 'aal2' — a password AND a TOTP code. So a password alone never opens a console: after it, the
 *  account's verified TOTP factor is challenged; an account that has none enrols one here (a QR code and
 *  the key as text), and the first code it shows verifies it. Only then is profiles.is_admin read.
 *  ⚠ A fresh password sign-in DROPS a session back to aal1, so a «confirm it is you» step for a destructive
 *  action is a new TOTP challenge (stepUp), never a second password sign-in.
 *
 *  WHERE THE SESSION LIVES. sessionStorage under its own key: this tab only, never localStorage, gone when
 *  the tab closes. The three pages link to one another in the same tab, so one sign-in carries across them.
 *  Signing out is scope 'local' — this tab's session, not the account's sessions elsewhere.
 *
 *  THE PAGE'S PART. Each page's auth view carries the same ids under its own prefix ('' for admin.html,
 *  'mc-' and 'aq-' for the generated consoles — scripts/org-pages.mjs writes their markup):
 *    {p}view-auth  {p}view-admin                       the two views this module switches
 *    {p}auth-pw    {p}auth-email {p}auth-pass {p}auth-submit     the password step
 *    {p}auth-mfa   {p}auth-mfa-lead {p}auth-enrol {p}auth-qr {p}auth-secret
 *                  {p}auth-code {p}auth-verify {p}auth-cancel    the TOTP step
 *    {p}auth-msg   {p}signout                          the message line, the header's sign-out
 *    who                                               the header's signed-in address
 *  and calls  var sb = IntMapAdminAuth.init({ prefix, onReady(sb, session), notAdmin?(session, msgEl),
 *  profileError?(error, session, msgEl) }). The backend and the publishable key are the page's
 *  <meta name="intmap-backend"> / <meta name="intmap-anon-key">.
 *
 *  ⚠ The real boundary is the database (RLS, the RPCs' is_admin() and the aal2 rule): this gate only saves an
 *  operator from an empty console. Messages before the password is accepted never say whether an address
 *  exists or is an administrator. English only, like the consoles.
 * ==========================================================================*/
(function () {
  'use strict';
  var STORAGE_KEY = 'intmap-admin-auth';
  var FACTOR_NAME = 'IntMap console';
  var CODE_RE = /^[0-9]{6}$/;
  var BAD_CODE = 'That code was not accepted. Check that the time on the device running your authenticator app is correct, then try the next code.';

  var sb = null, opts = null, factorId = null;

  function meta(n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute('content') || '' : ''; }
  function $(id) { return document.getElementById((opts && opts.prefix || '') + id); }
  function msg(text) { var m = $('auth-msg'); if (m) m.textContent = text || ''; }
  function toggle(id, on) { var e = $(id); if (e) e.classList.toggle('hide', !on); }
  function codeOf(v) { return String(v == null ? '' : v).replace(/\s+/g, ''); }

  /** the page's one client — the tab's own session store, nothing read from the URL */
  function client() {
    if (sb) return sb;
    var url = meta('intmap-backend'), key = meta('intmap-anon-key');
    if (!window.supabase || !window.supabase.createClient || !url || !key) return null;
    sb = window.supabase.createClient(url, key, {
      auth: { storage: window.sessionStorage, storageKey: STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    return sb;
  }

  function showView(v) { toggle('view-auth', v !== 'admin'); toggle('view-admin', v === 'admin'); }
  function showStep(step) {
    showView('auth');
    toggle('auth-pw', step === 'password');
    toggle('auth-mfa', step === 'mfa');
    if (step !== 'mfa') clearEnrolment();
  }
  function clearEnrolment() {
    factorId = null;
    var qr = $('auth-qr'), sec = $('auth-secret'), code = $('auth-code');
    if (qr) qr.removeAttribute('src');
    if (sec) sec.textContent = '';
    if (code) code.value = '';
    toggle('auth-enrol', false);
  }

  /** this tab's sign-out: the session here, not the account's sessions elsewhere */
  function signOut() { return sb.auth.signOut({ scope: 'local' }); }

  /** profiles.is_admin for the signed-in account → { ok, admin, error } */
  function readAdmin(session) {
    return sb.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle().then(function (p) {
      if (p.error) return { ok: false, admin: false, error: p.error };
      return { ok: true, admin: !!(p.data && p.data.is_admin) };
    }, function (e) { return { ok: false, admin: false, error: e }; });
  }

  function refuse(session) {
    showStep('password');
    var m = $('auth-msg');
    if (opts.notAdmin) opts.notAdmin(session, m); else msg('This account is not an admin.');
    return signOut();
  }

  /** where the tab's session stands, and the view that follows from it */
  function gate() {
    return sb.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      if (!session) { showStep('password'); return; }
      return sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (a) {
        if (a.error || !a.data) { showStep('password'); msg('Could not read this session: ' + ((a.error && a.error.message) || 'no answer') + '. Sign in again.'); return signOut(); }
        if (a.data.currentLevel !== 'aal2') {
          /* an account the database plainly says is not an administrator is turned away BEFORE an authenticator is
             enrolled on it; an unreadable answer is not a «no» — the read at aal2 below decides */
          return readAdmin(session).then(function (p) { return (p.ok && !p.admin) ? refuse(session) : startMfa(); });
        }
        return readAdmin(session).then(function (p) {
          if (!p.ok) {
            showStep('password');
            if (opts.profileError) { opts.profileError(p.error, session, $('auth-msg')); return; }
            return refuse(session);
          }
          if (!p.admin) return refuse(session);
          var who = document.getElementById('who');
          if (who) who.textContent = session.user.email || '';
          showView('admin');
          if (opts.onReady) opts.onReady(sb, session);
        });
      });
    });
  }

  /** the TOTP step: challenge the verified factor, or enrol one when the account has none */
  function startMfa() {
    return sb.auth.mfa.listFactors().then(function (lf) {
      if (lf.error || !lf.data) { showStep('password'); msg('Could not read this account’s authenticators: ' + ((lf.error && lf.error.message) || 'no answer') + '.'); return signOut(); }
      var verified = (lf.data.totp || [])[0];
      if (verified) {
        showStep('mfa');
        factorId = verified.id;
        $('auth-mfa-lead').textContent = 'Enter the 6-digit code from your authenticator app.';
        msg('');
        focusCode();
        return;
      }
      /* an enrolment that was never verified (a closed tab, a wrong first code) holds the factor's name: remove it first */
      var stale = (lf.data.all || []).filter(function (f) { return f.factor_type === 'totp' && f.status !== 'verified'; });
      return stale.reduce(function (p, f) { return p.then(function () { return sb.auth.mfa.unenroll({ factorId: f.id }); }); }, Promise.resolve())
        .then(function () { return sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: FACTOR_NAME }); })
        .then(function (en) {
          if (en.error || !en.data || !en.data.totp) { showStep('password'); msg('Could not set up an authenticator: ' + ((en.error && en.error.message) || 'no answer') + '.'); return signOut(); }
          showStep('mfa');
          factorId = en.data.id;
          $('auth-mfa-lead').textContent = 'This administrator account has no authenticator yet. Scan the QR code with an authenticator app (or enter the key by hand), then enter the 6-digit code it shows.';
          var qr = String(en.data.totp.qr_code || '');
          /* the SDK's own SVG data URL — the only scheme admitted here, and the CSP's img-src admits data: */
          if (qr.indexOf('data:image/svg+xml') === 0) $('auth-qr').setAttribute('src', qr); else $('auth-qr').removeAttribute('src');
          $('auth-secret').textContent = String(en.data.totp.secret || '');
          toggle('auth-enrol', true);
          msg('');
          focusCode();
        }, function (e) { showStep('password'); msg('Could not set up an authenticator: ' + ((e && e.message) || e) + '.'); return signOut(); });
    });
  }
  function focusCode() { var c = $('auth-code'); if (c) { c.value = ''; try { c.focus(); } catch (_) { /* not focusable yet */ } } }

  function passwordSignIn() {
    var email = $('auth-email').value.trim(), password = $('auth-pass').value;
    if (!email || !password) { msg('Enter email and password.'); return; }
    var b = $('auth-submit');
    b.disabled = true; msg('Working…');
    sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      /* enumeration-safe: never say whether the address exists or is an administrator */
      if (r.error) { msg('Invalid email or password.'); return; }
      $('auth-pass').value = '';
      return gate();
    }, function () { msg('Invalid email or password.'); })
      .then(function () { b.disabled = false; }, function (e) { b.disabled = false; msg(String((e && e.message) || e)); });
  }

  function verifyCode() {
    var code = codeOf($('auth-code').value);
    if (!CODE_RE.test(code)) { msg('Enter the 6-digit code.'); return; }
    if (!factorId) { msg('Sign in again.'); showStep('password'); return; }
    var b = $('auth-verify');
    b.disabled = true; msg('Working…');
    sb.auth.mfa.challengeAndVerify({ factorId: factorId, code: code }).then(function (r) {
      if (r.error) { msg(BAD_CODE); focusCode(); return; }
      clearEnrolment();
      return gate();
    }, function () { msg(BAD_CODE); })
      .then(function () { b.disabled = false; }, function (e) { b.disabled = false; msg(String((e && e.message) || e)); });
  }

  /**
   * Set the page up and decide its first view. Returns the client (null when the SDK or the page's
   * backend metas are missing — the message line then says so).
   */
  function init(o) {
    opts = o || {};
    if (!client()) { msg('Supabase SDK failed to load (vendor/supabase-js.js missing from this deploy).'); return null; }
    var submit = $('auth-submit'), pass = $('auth-pass'), verify = $('auth-verify'), code = $('auth-code'), cancel = $('auth-cancel'), out = $('signout');
    /* what each control does, for js/atlas-controls.js and scripts/data-effects.mjs: they change this tab's session only */
    submit.dataset.effect = 'private'; pass.dataset.effect = 'private'; verify.dataset.effect = 'private'; code.dataset.effect = 'private'; cancel.dataset.effect = 'private'; out.dataset.effect = 'private';
    submit.addEventListener('click', passwordSignIn);
    pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') passwordSignIn(); });
    verify.addEventListener('click', verifyCode);
    code.addEventListener('keydown', function (e) { if (e.key === 'Enter') verifyCode(); });
    cancel.addEventListener('click', function () { signOut().then(function () { showStep('password'); msg(''); }); });
    out.addEventListener('click', function () { signOut().then(function () { location.reload(); }); });
    gate();
    return sb;
  }

  /**
   * A fresh proof that the operator at the keyboard holds the account's authenticator, for a destructive action:
   * a new challenge against the verified TOTP factor (the session stays aal2). → Promise<{ ok, cancelled?, error? }>
   */
  function stepUp(question) {
    if (!sb) return Promise.resolve({ ok: false, error: 'Not signed in.' });
    return sb.auth.mfa.listFactors().then(function (lf) {
      var f = lf && !lf.error && lf.data && (lf.data.totp || [])[0];
      if (!f) return { ok: false, error: 'This account has no verified authenticator — sign in again.' };
      var typed = window.prompt(question || 'Enter the 6-digit code from your authenticator app to continue:');
      if (typed == null) return { ok: false, cancelled: true };
      var code = codeOf(typed);
      if (!CODE_RE.test(code)) return { ok: false, error: 'Enter the 6-digit code.' };
      return sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: code }).then(function (r) {
        return r.error ? { ok: false, error: BAD_CODE } : { ok: true };
      }, function () { return { ok: false, error: BAD_CODE }; });
    }, function (e) { return { ok: false, error: String((e && e.message) || e) }; });
  }

  window.IntMapAdminAuth = { init: init, stepUp: stepUp };
})();
