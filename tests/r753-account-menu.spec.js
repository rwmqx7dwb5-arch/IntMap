/* ============================================================================
 *  R753 · THE ACCOUNT BUTTON AND THE ACCOUNT MENU, IN A REAL BROWSER
 * ----------------------------------------------------------------------------
 *  「アカウントのボタンは、アイコンを表示しないように。また、アカウントメニューにもAIの残使用回数を
 *    書くように。その他、アカウントメニューで、機能や実態、UI含めて全面見直しして。」
 *
 *  ⚠ THE LOGGED-IN HALF OF THIS PANEL HAD NEVER BEEN TESTED. tests/r168.spec.js says so in its own
 *  header — it covers the account BUTTON and the guest path (click → #auth-modal), and states that
 *  currentUser is out of reach because the hermetic policy blocks Supabase and credentials do not
 *  belong in a test. That is true of the NETWORK, and it turns out not to be true of the SESSION:
 *  supabase-js answers getSession() from localStorage without asking anybody, so a session object
 *  with a future `expires_at` is enough for refreshCurrentUser() to populate the user and for the
 *  real openAccountMenu() to run. Every call it then makes against the project (the profile row,
 *  today's usage rows) fails exactly as the hermetic policy intends, and the module's own catches
 *  take over — which is the state this panel must survive anyway.
 *
 *  So nothing here is a replica of the sheet: the assertions read the markup the module built, and
 *  the sizes/visibility are the browser's computed values, not the stylesheet's text.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics, isBenign } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { readFileSync } from 'node:fs';

/* ⚠ no fixed sleeps: every wait below stands for a CONDITION, and a spec that stands in the gate
   pays for its own seconds (scripts/tiers.mjs · scripts/test-budget.mjs). */
const UNTIL = `const until = async (f, ms = 5000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (f()) return true; } catch {} await new Promise((r) => setTimeout(r, 20)); } return false; };`;
const withUntil = (fn) => new Function(UNTIL + 'return (' + fn.toString() + ')();');

test.describe.configure({ mode: 'serial' });

let page, diag;

/* A session the CLIENT accepts: supabase-js reads it out of localStorage and, because expires_at is
   in the future, returns it from getSession() with no network call. The token is not valid for the
   server and is never meant to be — every request it signs is blocked by the hermetic route anyway. */
const FAKE_SESSION = {
  access_token: 'hermetic.test.token',
  token_type: 'bearer',
  expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  refresh_token: 'hermetic-test-refresh',
  user: {
    id: '00000000-0000-4000-8000-000000000750',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'r753.reader@example.invalid',
    app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: { full_name: 'R753 Reader' },
    created_at: new Date().toISOString(),
  },
};

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  await context.addInitScript((sess) => {
    try {
      localStorage.setItem('intmap_ws4', JSON.stringify({ on: false }));
      /* the project ref is the one in index.html; the key shape is supabase-js's own */
      localStorage.setItem('sb-vpekfwdpurzejrrmacac-auth-token', JSON.stringify(sess));
      localStorage.removeItem('intmap_avatar_img');
      localStorage.setItem('intmap_avatar', '\u{1F30D}');
    } catch { /* ignore */ }
  }, FAKE_SESSION);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('btn-account'), null, { timeout: 60000 });
  /* refreshCurrentUser() is awaited inside bootSupabase; wait for its visible consequence */
  await page.waitForFunction(() => !!document.querySelector('#btn-account .acct-av'), null, { timeout: 60000 });
});

test.afterAll(async () => { await page?.context()?.close(); });

test('R753 ① the account button carries no icon on a wide screen, and still is the icon on a phone', async () => {
  const wide = await page.evaluate(() => {
    const b = document.getElementById('btn-account');
    const av = b.querySelector('.acct-av'), nm = b.querySelector('.acct-name');
    return {
      avDisplay: getComputedStyle(av).display,
      avBox: av.getBoundingClientRect().width,
      nameDisplay: nm ? getComputedStyle(nm).display : '',
      text: (b.innerText || '').trim(),
    };
  });
  expect(wide.avDisplay, 'the icon is not displayed on the desktop row').toBe('none');
  expect(wide.avBox, 'and it occupies no width there').toBe(0);
  expect(wide.nameDisplay, 'the name is what the button shows').not.toBe('none');
  expect(wide.text.length, 'the button is not empty').toBeGreaterThan(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await page.evaluate(() => {
    const b = document.getElementById('btn-account'), av = b.querySelector('.acct-av');
    const nm = b.querySelector('.acct-name');
    return { avDisplay: getComputedStyle(av).display, avW: Math.round(av.getBoundingClientRect().width),
      nameDisplay: getComputedStyle(nm).display, btnW: Math.round(b.getBoundingClientRect().width) };
  });
  /* ⚠ unchanged on purpose: on a phone the icon IS the button (#R30 measured the header wrapping
     when the name was shown there), so the withdrawal is a desktop presentation, not a rewrite. */
  expect(phone.avDisplay, 'the icon comes back on a phone').not.toBe('none');
  expect(phone.avW, 'as the 34 px round button it has been since #R32').toBe(34);
  expect(phone.nameDisplay, 'and the name stays hidden there').toBe('none');
  expect(phone.btnW).toBe(34);
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('R753 ② the menu opens on the logged-in path and states BOTH daily AI counters', async () => {
  const res = await page.evaluate(withUntil(async () => {
    document.getElementById('btn-account').click();
    await until(() => { const x = document.getElementById('acct-modal'); return x && x.style.display === 'flex'
      && document.querySelectorAll('#acct-ai .acct-ai-row').length === 2; });
    const m = document.getElementById('acct-modal');
    const ai = document.getElementById('acct-ai');
    return {
      display: m ? m.style.display : '',
      rows: ai ? ai.querySelectorAll('.acct-ai-row').length : -1,
      bars: ai ? ai.querySelectorAll('.acct-ai-bar i').length : -1,
      text: ai ? ai.innerText : '',
      focus: document.activeElement ? document.activeElement.className : '',
      dialog: m && m.querySelector('[role="dialog"][aria-modal="true"]') ? 1 : 0,
      email: (document.getElementById('acct-email') || {}).textContent || '',
      how: (document.getElementById('acct-pro') || {}).textContent || '',
    };
  }));
  expect(res.display, 'openAccountMenu() built and showed the sheet').toBe('flex');
  expect(res.dialog, 'the sheet announces itself as a modal dialog').toBe(1);
  expect(res.rows, 'two counters, because the server keeps two rows').toBe(2);
  expect(res.bars, 'each one draws its own bar').toBe(2);
  expect(res.text.length, 'the AI card is not empty').toBeGreaterThan(10);
  expect(res.focus, 'focus moved into the sheet').toContain('acct-sheet');
  expect(res.email, 'the identity header names the signed-in address').toContain('@');
  expect(res.how, 'and how this session signs in').toMatch(/Google/i);
});

test('R753 ③ every .acct-* rule matches something, and every .acct-* class has a rule', async () => {
  /* (#R488's shape, applied here.) The sheet shipped `acct-danger` with NO rule behind it — the
     separation its own comment described was never drawn — and the stylesheet kept `.acct-color`
     rules for a control that had been gone for rounds. Neither is visible to a check that fixes
     spellings; both are visible to the CSSOM, asked while the panel is on screen.
     ⚠ A SELECTOR THAT MATCHES NOTHING RIGHT NOW IS NOT AUTOMATICALLY DEAD: `.acct-ai-out` is the
     out-of-uses colour and `.acct-ask-go.acct-ask-danger` is the destructive confirm, and a panel
     can only be in one state at a time. So the discriminator is not a hand-written list of
     exceptions — it is whether the class is one the MODULE applies: a state class is written in
     js/auth-ui.js, and a class for a control that no longer exists is written nowhere. */
  const modules = ['js/auth-ui.js', 'js/app-body.js'].map((f) => readFileSync(f, 'utf8')).join('\n');
  const res = await page.evaluate(withUntil(async () => {
    /* the destructive asker, so its own rules have their elements */
    document.getElementById('acct-delete').click();
    await until(() => { const a = document.getElementById('acct-ask'); return a && a.style.display === 'flex'; });
    const sels = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      /* ⚠ a CSSStyleRule ALSO has a (usually empty) .cssRules in a browser with nested CSS, so
         «has cssRules → it is a group, skip it» silently skipped every ordinary rule: measured 0
         selectors where there are 52. Recurse into groups AND read this rule's own selector. */
      const walk = (list) => { for (const r of list) { if (r.cssRules && r.cssRules.length) walk(r.cssRules);
        if (r.selectorText && /\.acct-/.test(r.selectorText)) sels.push(r.selectorText); } };
      walk(rules);
    }
    const dead = [];
    for (const s of sels) {
      /* drop state pseudo-classes we cannot synthesise, and :empty which is a live state */
      const probe = s.split(',').map((p) => p.trim().replace(/:(hover|active|focus|focus-visible|empty)\b/g, '')).join(',');
      let hit = 0; try { hit = document.querySelectorAll(probe).length; } catch { hit = -1; }
      if (hit === 0) dead.push(s);
    }
    const classes = new Set();
    document.querySelectorAll('#acct-modal *, #acct-ask *, #btn-account *').forEach((el) => {
      el.classList.forEach((c) => { if (/^acct-/.test(c)) classes.add(c); });
    });
    const unstyled = [...classes].filter((c) => !sels.some((s) => s.split(',').some((p) => new RegExp('\.' + c + '(?![\w-])').test(p))));
    document.getElementById('acct-ask-no').click();
    return { dead, unstyled, seen: classes.size, rules: sels.length };
  }));
  expect(res.rules, 'the sheet really is styled from the stylesheet').toBeGreaterThan(20);
  expect(res.seen, 'and the markup really uses those classes').toBeGreaterThan(10);
  expect(res.unstyled, 'no class in the panel is without a rule').toEqual([]);
  /* whatever did not match must be a state THIS module can put an element into */
  const orphaned = res.dead.filter((sel) => (sel.match(/\.(acct-[\w-]+)/g) || [])
    .some((c) => !modules.includes("'" + c.slice(1) + "'") && !modules.includes('"' + c.slice(1) + '"') && !modules.includes('class="' + c.slice(1))));
  expect(orphaned, 'no .acct-* rule survives for a control the module never builds').toEqual([]);
});

test('R753 ④ asking happens inside the sheet, and Escape closes what is on top', async () => {
  const res = await page.evaluate(withUntil(async () => {
    const out = {};
    document.getElementById('acct-delete').click();
    await until(() => { const a = document.getElementById('acct-ask'); return a && a.style.display === 'flex'; });
    const ask = document.getElementById('acct-ask');
    out.askOpen = ask.style.display;
    out.danger = !!ask.querySelector('.acct-ask-go.acct-ask-danger');
    out.hasField = !document.getElementById('acct-ask-in').hidden;
    out.focus = document.activeElement ? document.activeElement.id : '';
    /* Esc closes the asker, NOT the sheet under it */
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => ask.style.display === 'none');
    out.askAfter = ask.style.display;
    out.sheetAfter = document.getElementById('acct-modal').style.display;
    /* now Esc closes the sheet */
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => document.getElementById('acct-modal').style.display === 'none');
    out.sheetClosed = document.getElementById('acct-modal').style.display;
    out.focusBack = document.activeElement ? document.activeElement.id : '';
    return out;
  }));
  expect(res.askOpen, 'Delete account asks inside the app, not through window.prompt').toBe('flex');
  expect(res.danger, 'and it says so in the confirm button').toBe(true);
  expect(res.hasField, 'the email field is the confirmation').toBe(true);
  expect(res.focus, 'focus lands in the field').toBe('acct-ask-in');
  expect(res.askAfter, 'Escape dismisses the asker').toBe('none');
  expect(res.sheetAfter, 'and leaves the sheet standing').toBe('flex');
  expect(res.sheetClosed, 'a second Escape closes the sheet').toBe('none');
  expect(res.focusBack, 'focus returns to the button that opened it').toBe('btn-account');
});

test('R753 ⑤ a Google session is not offered a password field it has no password for', async () => {
  const res = await page.evaluate(withUntil(async () => {
    document.getElementById('btn-account').click();
    await until(() => { const x = document.getElementById('acct-modal'); return x && x.style.display === 'flex'; });
    document.getElementById('acct-change-pw').click();
    await until(() => document.getElementById('acct-msg').textContent.length > 0);
    const set = document.getElementById('setpw-modal');
    const out = { msg: document.getElementById('acct-msg').textContent, setpw: set ? set.style.display : '(not built)' };
    /* the image is not there, so the way to withdraw it must not be either */
    out.removeHidden = getComputedStyle(document.getElementById('acct-avatar-clear')).display;
    document.getElementById('acct-close').click();
    return out;
  }));
  expect(res.msg.length, 'it explains instead of opening a field').toBeGreaterThan(10);
  expect(res.msg, 'and names the provider it read from the session').toMatch(/Google/i);
  expect(res.setpw, 'the set-password sheet stays shut for an OAuth account').not.toBe('flex');
  expect(res.removeHidden, '«Remove image» is not offered with no image to remove').toBe('none');
});

test('R753 ⑥ nothing in the panel threw', async () => {
  /* ⚠ ONE EXCLUSION, AND IT IS NOT THE PANEL'S: «Could not compile fragment shader» is MapLibre
     failing to build a program on this machine's GPU — measured here when several browser runs
     shared it — and the account sheet is DOM, drawn by no renderer at all. Excluding the renderer's
     own GPU failure keeps this assertion about the subject; everything else still fails it. */
  const gpu = (e) => /(compile|link)\w*\s+(fragment|vertex)?\s*shader|WebGL context/i.test(String(e));
  expect(diag.pageErrors.filter((e) => !gpu(e)), 'the account panel raised no page error').toEqual([]);
  expect(diag.consoleErrors.filter((e) => !isBenign(String(e)) && !gpu(e)), 'and logged no error of its own').toEqual([]);
});
