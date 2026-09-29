/* ============================================================================
 *  IntMap · auth features and admin.html hardening
 * ----------------------------------------------------------------------------
 *  Moved from tests/r155-checks.test.mjs (its security and auth half — the UX items of that batch
 *  went to the Köppen, Atlas-panel and sidebar topic files). From its header:
 * ==========================================================================*/
//  R155 regression checks (node --test) — security overhaul + auth features.
//  Static/behavioural assertions over index.html + admin.html so a future edit
//  that silently drops a hardening measure or an auth feature fails CI.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';
import { installSafe } from './helpers/safe-html.mjs';

const root = new URL('..', import.meta.url);
const index = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const admin = readFileSync(new URL('admin.html', root), 'utf8');
// ── index.html: auth features ───────────────────────────────────────────────
test('#R155 passkeys: experimental flag + sign-in + enroll wired', () => {
  /* spelling kept — auth flows call Supabase/HIBP from the app shell in a browser; the claim is which calls and payloads the code makes */
  /* (#R175) the client is created in src/vendor.js now (bundled SDK, no CDN race) — same options. */
  assert.match(index, /experimental:\s*\{\s*passkey:\s*true\s*\}/, 'passkey experimental flag on the client');
  assert.match(index, /signInWithPasskey\(/, 'passkey sign-in');
  assert.match(index, /registerPasskey\(/, 'passkey enroll');
  assert.match(index, /passkey\.delete\(/, 'passkey delete');
});

test('#R155 account deletion calls the delete-account Edge Function with confirm', () => {
  /* spelling kept — auth flows call Supabase/HIBP from the app shell in a browser; the claim is which calls and payloads the code makes */
  assert.match(index, /functions\/v1\/delete-account/, 'delete-account endpoint');
  assert.match(index, /confirm:'DELETE'/, 'explicit confirm payload');
});

test('#R155 password reset + change + email change + logout-all', () => {
  /* spelling kept — auth flows call Supabase/HIBP from the app shell in a browser; the claim is which calls and payloads the code makes */
  assert.match(index, /resetPasswordForEmail\(/, 'reset email');
  assert.match(index, /PASSWORD_RECOVERY/, 'recovery event handled');
  assert.match(index, /updateUser\(\{password:/, 'change password');
  assert.match(index, /updateUser\(\{email:/, 'change email');
  assert.match(index, /signOut\(\{scope:'global'\}\)/, 'log out all devices');
});

test('#R155 weak/breached password rejection (strength + HIBP k-anonymity)', () => {
  /* spelling kept — auth flows call Supabase/HIBP from the app shell in a browser; the claim is which calls and payloads the code makes */
  assert.match(index, /_pwStrength\(/, 'strength check');
  assert.match(index, /api\.pwnedpasswords\.com\/range\//, 'HIBP range API (k-anonymity)');
  assert.match(index, /_pwBreachCount\(/, 'breach count');
  // The HIBP check must send only a 5-char prefix (privacy): slice(0,5).
  assert.match(index, /hex\.slice\(0,5\)/, 'only the 5-char SHA-1 prefix is sent');
});

test('#R155 token-leak: GA page_location is sanitized', () => {
  /* spelling kept — auth flows call Supabase/HIBP from the app shell in a browser; the claim is which calls and payloads the code makes */
  assert.match(index, /__imScrubAuthUrl/, 'auth-url scrubber');
  assert.match(index, /page_location:_scrub/, 'GA config uses the sanitized location');
});

// ── admin.html: isolation + hardening ───────────────────────────────────────
test('#R155 admin.html has a Content-Security-Policy', () => {
  /* spelling kept — admin.html is a standalone page; its CSP meta, its absent sign-up and its re-auth prompt are its markup and inline script */
  assert.match(admin, /http-equiv="Content-Security-Policy"/, 'CSP meta present');
  assert.match(admin, /object-src 'none'/, 'object-src locked');
  assert.match(admin, /connect-src 'self' https:\/\/\*\.supabase\.co/, 'connect-src locked to self + supabase');
});

test('#R155 admin.html has NO public sign-up', () => {
  /* spelling kept — admin.html is a standalone page; its CSP meta, its absent sign-up and its re-auth prompt are its markup and inline script */
  assert.ok(!/seg-signup/.test(admin), 'signup toggle removed');
  assert.ok(!/\.auth\.signUp\(/.test(admin), 'no signUp() call anywhere in admin');
});

test('#R155 admin.html re-authenticates before the destructive import', () => {
  /* spelling kept — admin.html is a standalone page; its CSP meta, its absent sign-up and its re-auth prompt are its markup and inline script */
  assert.match(admin, /Re-authenticate before this destructive/, 'sudo gate comment');
  assert.match(admin, /Confirm your admin password to replace ALL/, 'password re-prompt');
});

test('#R155 admin esc() neutralizes XSS payloads (incl. the single quote)', () => {
  /* (safe-output-single-module) admin.html delegates to the app's encoder, loaded before its inline script */
  assert.ok(admin.indexOf('<script src="./js/safe-html.js"></script>') > 0
    && admin.indexOf('<script src="./js/safe-html.js"></script>') < admin.indexOf('const esc=(s)=>'), 'admin.html loads js/safe-html.js before the console script');
  const window = {}; installSafe(window);   // eslint-disable-line no-unused-vars -- read by the eval below
  const m = admin.match(/const esc=\(s\)=>[^\n]+/);
  assert.ok(m, 'esc() found');
  const esc = eval('(' + m[0].replace(/^const esc=/, '').replace(/;\s*$/, '') + ')');
  const out = esc('<img src=x onerror=alert(1)>');
  assert.ok(!/[<>]/.test(out), 'angle brackets escaped');
  assert.equal(esc(`a'b"c&d<e>f`), 'a&#39;b&quot;c&amp;d&lt;e&gt;f', 'all five chars escaped incl. apostrophe');
});

test('#R155 admin safeUrl() rejects dangerous schemes', () => {
  const window = {}; installSafe(window);   // eslint-disable-line no-unused-vars -- read by the eval below
  const m = admin.match(/const safeUrl=\(u\)=>[^\n]+/);
  assert.ok(m, 'safeUrl() found');
  const safeUrl = eval('(' + m[0].replace(/^const safeUrl=/, '').replace(/;\s*$/, '') + ')');
  assert.equal(safeUrl('javascript:alert(1)'), '', 'javascript: rejected');
  assert.equal(safeUrl('data:text/html,<script>'), '', 'data: rejected');
  assert.equal(safeUrl('  JavaScript:alert(1)'), '', 'case/space-obfuscated javascript: rejected');
  assert.equal(safeUrl('https://example.com/x'), 'https://example.com/x', 'https allowed');
  assert.equal(safeUrl('/relative/path'), '/relative/path', 'relative path allowed');
});
