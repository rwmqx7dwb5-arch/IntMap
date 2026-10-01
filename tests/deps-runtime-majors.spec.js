/* ============================================================================
 *  deps-runtime-majors · THE PASSKEY CONTROLS THAT supabase-js 2.117 BRINGS TO THE SURFACE
 * ----------------------------------------------------------------------------
 *  The passkey sign-in button and the account sheet's passkey list were written in #R155 against an
 *  SDK that did not have the methods yet, so they were feature-detected away for every session until
 *  this update. 2.117 has them, and the project answers the challenge request with its relying party
 *  (rpId = the production host, site-origin.js SITE_HOST — measured on production, the body below is
 *  that answer). So on
 *  production the controls work; everywhere else they must fail in a way the reader can act on, and
 *  must not stay on screen as a button that can only fail.
 *
 *  Nothing here replaces the SDK. The clicks run the real `signInWithPasskey()` / `passkey.list()`
 *  from the shipped bundle, the browser's own WebAuthn refuses the relying party, and the assertions
 *  read what js/auth-ui.js wrote:
 *    ① guest, network down        → «failed», the button stays, the caret goes to the password form
 *    ② guest, RP the origin cannot use → «cannot be used on this site», the button is withdrawn
 *    ③ signed in, list request fails   → «Could not load your passkeys», not «No passkeys yet»
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { SITE_HOST } from '../supabase/functions/_shared/site-origin.js';

const UNTIL = `const until = async (f, ms = 8000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (f()) return true; } catch {} await new Promise((r) => setTimeout(r, 20)); } return false; };`;
const withUntil = (fn, arg) => new Function('arg', UNTIL + 'return (' + fn.toString() + ')(arg);');

/* The production answer to POST /auth/v1/passkeys/authentication/options, measured 2026-09-27. */
const OPTIONS_FIXTURE = {
  challenge_id: '28661140-2142-4089-bfa0-049143d2812f',
  options: { challenge: 'D6d730q_Lwo6IUkk5-IlWTmLaI-y4-M6Oe7RFtfUoWw', timeout: 300000, rpId: SITE_HOST, userVerification: 'preferred' },
  expires_at: 1790456706,
};

test.describe.configure({ mode: 'serial' });

test('deps-runtime-majors ①② a passkey failure is said, hands over to the password form, and a refused origin loses the button', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  const page = await context.newPage();
  const diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('btn-account'), null, { timeout: 60000 });

  const sdk = await page.evaluate(() => ({
    signIn: typeof (window.sb && window.sb.auth && window.sb.auth.signInWithPasskey),
    list: typeof (window.sb && window.sb.auth && window.sb.auth.passkey && window.sb.auth.passkey.list),
    webauthn: typeof window.PublicKeyCredential,
  }));
  expect(sdk.signIn, 'the shipped SDK has the passkey sign-in (2.58 did not)').toBe('function');
  expect(sdk.list, 'and the passkey namespace').toBe('function');
  expect(sdk.webauthn, 'this browser has WebAuthn, so the control is offered').toBe('function');

  /* ① the challenge request is blocked by the hermetic policy — a network failure */
  const first = await page.evaluate(withUntil(async () => {
    document.getElementById('btn-account').click();
    await until(() => document.getElementById('auth-modal')?.style.display === 'flex');
    const b = document.getElementById('am-passkey');
    const shown = b && getComputedStyle(b).display !== 'none';
    b.click();
    const msg = document.getElementById('am-msg');
    await until(() => !b.disabled && /password|パスワード/i.test(msg.textContent || ''));
    return { shown, msg: msg.textContent, stillShown: getComputedStyle(b).display !== 'none',
      focus: document.activeElement ? document.activeElement.id : '' };
  }));
  expect(first.shown, 'the passkey button is on the login tab').toBe(true);
  expect(first.msg, 'the failure is said').toMatch(/Passkey sign-in failed or was canceled|パスキーのログインに失敗/);
  expect(first.msg, 'and the way out is named').toMatch(/email and password|メールアドレスとパスワード/);
  expect(first.stillShown, 'a network failure is a real failure — the button stays for a fresh attempt').toBe(true);
  expect(['am-email', 'am-pass'], 'the caret is in the password form').toContain(first.focus);

  /* ② the server answers, and the browser's own WebAuthn refuses the relying party for this origin */
  await page.route('**/auth/v1/passkeys/authentication/options', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OPTIONS_FIXTURE) }));
  const second = await page.evaluate(withUntil(async () => {
    const b = document.getElementById('am-passkey'), msg = document.getElementById('am-msg');
    msg.textContent = '';
    b.click();
    await until(() => /can.t be used on this site|利用できません/.test(msg.textContent || ''));
    const said = msg.textContent, hiddenNow = getComputedStyle(b).display === 'none';
    /* …and it stays withdrawn when the tab is redrawn (switching tabs clears the message, so it was read above) */
    window.__amSetTab && window.__amSetTab('signup'); window.__amSetTab && window.__amSetTab('login');
    return { msg: said, hiddenNow, hiddenAfterRedraw: getComputedStyle(b).display === 'none',
      passUsable: !document.getElementById('am-pass').disabled };
  }));
  expect(second.msg, 'the refusal is named as this site, not as the reader').toMatch(/Passkeys can't be used on this site right now|このサイトでは現在パスキーを利用できません/);
  expect(second.msg, 'with the password route').toMatch(/email and password|メールアドレスとパスワード/);
  expect(second.hiddenNow, 'a button that can only fail is withdrawn').toBe(true);
  expect(second.hiddenAfterRedraw, 'and the login tab does not bring it back').toBe(true);
  expect(second.passUsable, 'the password form is untouched').toBe(true);
  expect(diag.pageErrors, 'no uncaught exception on either path').toEqual([]);
  await context.close();
});

/* A session the CLIENT accepts from localStorage (the r753 spec's device): the account sheet opens on
   the signed-in path and its passkey list request is blocked by the hermetic policy. */
const FAKE_SESSION = {
  access_token: 'hermetic.test.token', token_type: 'bearer', expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'hermetic-test-refresh',
  user: { id: '00000000-0000-4000-8000-000000000776', aud: 'authenticated', role: 'authenticated',
    email: 'deps.reader@example.invalid', app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {}, created_at: new Date().toISOString() },
};

test('deps-runtime-majors ③ a failed passkey list is said as a failure, not as an empty list', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  await context.addInitScript((sess) => {
    try {
      localStorage.setItem('intmap_ws4', JSON.stringify({ on: false }));
      localStorage.setItem('sb-vpekfwdpurzejrrmacac-auth-token', JSON.stringify(sess));
    } catch { /* ignore */ }
  }, FAKE_SESSION);
  const page = await context.newPage();
  const diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#btn-account .acct-av'), null, { timeout: 60000 });
  const res = await page.evaluate(withUntil(async () => {
    document.getElementById('btn-account').click();
    await until(() => document.getElementById('acct-modal')?.style.display === 'flex');
    const box = document.getElementById('acct-passkeys');
    await until(() => box && box.textContent && !/Loading passkeys|読み込み中/.test(box.textContent));
    return { text: box ? box.textContent : '', add: !document.getElementById('acct-add-passkey').hidden };
  }));
  expect(res.text, 'the blocked request is not reported as an empty list').not.toMatch(/No passkeys yet|パスキーはまだありません/);
  expect(res.text, 'it is reported as what it is').toMatch(/Could not load your passkeys|パスキーを読み込めませんでした/);
  expect(res.add, 'a failed LIST is not a refused origin — adding one is still offered').toBe(true);
  expect(diag.pageErrors).toEqual([]);
  await context.close();
});
