// ============================================================================
//  R155 regression checks (node --test) — security overhaul + auth features.
//  Static/behavioural assertions over index.html + admin.html so a future edit
//  that silently drops a hardening measure or an auth feature fails CI.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const index = readFileSync(new URL('index.html', root), 'utf8');
const admin = readFileSync(new URL('admin.html', root), 'utf8');

// ── index.html: auth features ───────────────────────────────────────────────
test('passkeys: experimental flag + sign-in + enroll wired', () => {
  assert.match(index, /experimental:\{passkey:true\}/, 'passkey experimental flag on the client');
  assert.match(index, /signInWithPasskey\(/, 'passkey sign-in');
  assert.match(index, /registerPasskey\(/, 'passkey enroll');
  assert.match(index, /passkey\.delete\(/, 'passkey delete');
});

test('account deletion calls the delete-account Edge Function with confirm', () => {
  assert.match(index, /functions\/v1\/delete-account/, 'delete-account endpoint');
  assert.match(index, /confirm:'DELETE'/, 'explicit confirm payload');
});

test('password reset + change + email change + logout-all', () => {
  assert.match(index, /resetPasswordForEmail\(/, 'reset email');
  assert.match(index, /PASSWORD_RECOVERY/, 'recovery event handled');
  assert.match(index, /updateUser\(\{password:/, 'change password');
  assert.match(index, /updateUser\(\{email:/, 'change email');
  assert.match(index, /signOut\(\{scope:'global'\}\)/, 'log out all devices');
});

test('weak/breached password rejection (strength + HIBP k-anonymity)', () => {
  assert.match(index, /_pwStrength\(/, 'strength check');
  assert.match(index, /api\.pwnedpasswords\.com\/range\//, 'HIBP range API (k-anonymity)');
  assert.match(index, /_pwBreachCount\(/, 'breach count');
  // The HIBP check must send only a 5-char prefix (privacy): slice(0,5).
  assert.match(index, /hex\.slice\(0,5\)/, 'only the 5-char SHA-1 prefix is sent');
});

test('token-leak: GA page_location is sanitized', () => {
  assert.match(index, /__imScrubAuthUrl/, 'auth-url scrubber');
  assert.match(index, /page_location:_scrub/, 'GA config uses the sanitized location');
});

// ── admin.html: isolation + hardening ───────────────────────────────────────
test('admin.html has a Content-Security-Policy', () => {
  assert.match(admin, /http-equiv="Content-Security-Policy"/, 'CSP meta present');
  assert.match(admin, /object-src 'none'/, 'object-src locked');
  assert.match(admin, /connect-src 'self' https:\/\/\*\.supabase\.co/, 'connect-src locked to self + supabase');
});

test('admin.html has NO public sign-up', () => {
  assert.ok(!/seg-signup/.test(admin), 'signup toggle removed');
  assert.ok(!/\.auth\.signUp\(/.test(admin), 'no signUp() call anywhere in admin');
});

test('admin.html re-authenticates before the destructive import', () => {
  assert.match(admin, /Re-authenticate before this destructive/, 'sudo gate comment');
  assert.match(admin, /Confirm your admin password to replace ALL/, 'password re-prompt');
});

test('admin esc() neutralizes XSS payloads (incl. the single quote)', () => {
  const m = admin.match(/const esc=\(s\)=>[^\n]+/);
  assert.ok(m, 'esc() found');
  const esc = eval('(' + m[0].replace(/^const esc=/, '').replace(/;\s*$/, '') + ')');
  const out = esc('<img src=x onerror=alert(1)>');
  assert.ok(!/[<>]/.test(out), 'angle brackets escaped');
  assert.equal(esc(`a'b"c&d<e>f`), 'a&#39;b&quot;c&amp;d&lt;e&gt;f', 'all five chars escaped incl. apostrophe');
});

test('admin safeUrl() rejects dangerous schemes', () => {
  const m = admin.match(/const safeUrl=\(u\)=>[^\n]+/);
  assert.ok(m, 'safeUrl() found');
  const safeUrl = eval('(' + m[0].replace(/^const safeUrl=/, '').replace(/;\s*$/, '') + ')');
  assert.equal(safeUrl('javascript:alert(1)'), '', 'javascript: rejected');
  assert.equal(safeUrl('data:text/html,<script>'), '', 'data: rejected');
  assert.equal(safeUrl('  JavaScript:alert(1)'), '', 'case/space-obfuscated javascript: rejected');
  assert.equal(safeUrl('https://example.com/x'), 'https://example.com/x', 'https allowed');
  assert.equal(safeUrl('/relative/path'), '/relative/path', 'relative path allowed');
});
