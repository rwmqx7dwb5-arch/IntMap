/* ============================================================================
 *  admin-origin · AN ADMINISTRATOR ACCOUNT IS NOT KEPT SIGNED IN TO THE APP — in a real browser
 * ----------------------------------------------------------------------------
 *  The app (js/auth-ui.js refreshCurrentUser) reads the reader's own profile row after sign-in. When the
 *  database says the account is an administrator, the app ends that session (scope 'local': this session
 *  only, and its refresh token is revoked by the server), keeps no user, and tells the reader to use the
 *  operator console — which lives on its own origin (docs/SECURITY-ARCHITECTURE.md §11.4).
 *
 *  Nothing here is a replica: the session is supabase-js's own localStorage entry (as tests/r753-account-menu.spec.js
 *  explains, getSession() answers from it without the network), the profile row is the answer the real
 *  request receives, and the sign-out is the request supabase-js really sends.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const KEY = 'sb-vpekfwdpurzejrrmacac-auth-token';
const session = (id) => ({
  access_token: 'hermetic.test.token', token_type: 'bearer', expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'hermetic-test-refresh',
  user: { id, aud: 'authenticated', role: 'authenticated', email: 'reader@example.invalid',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Reader' }, created_at: new Date().toISOString() },
});

async function open(browser, { isAdmin }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  const id = isAdmin ? '00000000-0000-4000-8000-0000000a0001' : '00000000-0000-4000-8000-0000000a0002';
  await context.addInitScript(([k, s]) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } } catch { /* ignore */ } }, [KEY, session(id)]);
  const logouts = [];
  /* routes on the context registered after the hermetic ones take precedence for these two paths */
  await context.route(/\/rest\/v1\/profiles\?/, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ display_name: isAdmin ? 'Operator' : 'Reader', is_admin: isAdmin, is_pro: false }),
  }));
  await context.route(/\/auth\/v1\/logout/, (route) => { logouts.push(route.request().url()); return route.fulfill({ status: 204, body: '' }); });
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('btn-account'), null, { timeout: 60000 });
  return { context, page, logouts };
}

test('an administrator account is signed out of the app and pointed at the console', async ({ browser }) => {
  const { context, page, logouts } = await open(browser, { isAdmin: true });
  try {
    await expect.poll(() => logouts.length, { timeout: 30000, message: 'the app ends the session' }).toBeGreaterThan(0);
    expect(new URL(logouts[0]).searchParams.get('scope'), 'this session only, not the console\'s').toBe('local');
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), KEY), { message: 'nothing of the session is left in the app\'s storage' }).toBeNull();
    await expect(page.getByText(/An administrator account cannot stay signed in|管理者アカウントではアプリにログインしたままにできません/)).toBeVisible({ timeout: 15000 });
    /* the built page carries the console's address (scripts/site-url.mjs fills the token) */
    const url = await page.evaluate(() => (document.querySelector('meta[name="intmap-admin-url"]') || {}).content || '');
    expect(url).toMatch(/^https:\/\//);
    expect(new URL(url).origin).not.toBe(new URL(page.url()).origin);
  } finally { await context.close(); }
});

test('an ordinary account stays signed in', async ({ browser }) => {
  const { context, page, logouts } = await open(browser, { isAdmin: false });
  try {
    await page.waitForFunction(() => !!document.querySelector('#btn-account .acct-av'), null, { timeout: 60000 });
    expect(logouts, 'no sign-out for a reader who is not an administrator').toEqual([]);
    expect(await page.evaluate((k) => !!localStorage.getItem(k), KEY)).toBe(true);
  } finally { await context.close(); }
});
