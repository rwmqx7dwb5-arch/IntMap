/* admin-origin — the operator console on its own origin, with its own session, and admin rights only for
 * an MFA session (docs/SECURITY-ARCHITECTURE.md §3, §8 item 20, §11.4).
 *
 * What is measured here, and not by spelling:
 *   · the console's own origin is a different origin AND a different host from every origin the app is
 *     served from (site-origin.js) — a second repository of the same owner would have failed this;
 *   · the console pages are DISCOVERED (they load js/admin-auth.js), and the built console site holds
 *     every file they name, with links to app pages pointed at the app's own address;
 *   · nothing the console alone needs is in the app's static copy list, and the app's build refuses one;
 *   · the pointer page left at an old address runs nothing and stores nothing;
 *   · js/admin-auth.js, EVALUATED with a stub SDK, stores the session in sessionStorage under a key of its
 *     own and never touches localStorage;
 * The app signing an administrator account out is measured in a browser (tests/admin-origin.spec.js);
 * the database half (aal2) is pgTAP 50.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  ADMIN_URL, ADMIN_ORIGIN, SITE_ORIGINS, siteUrl,
} from '../supabase/functions/_shared/site-origin.js';
import {
  consolePages, consoleFiles, consoleOnlyFiles, appFiles, buildAdminSite, pointerPage, rewriteOutbound, CONSOLE_AUTH, SDK_PATH,
} from '../scripts/admin-site.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('the console is served from an origin — and a host — the app is never served from', () => {
  assert.equal(new URL(ADMIN_URL).protocol, 'https:');
  for (const o of SITE_ORIGINS) {
    assert.notEqual(ADMIN_ORIGIN, o, `console origin ${ADMIN_ORIGIN} equals an app origin`);
    assert.notEqual(new URL(ADMIN_URL).host, new URL(o).host, 'same host would be the same origin');
  }
});

test('console pages are the pages that sign in through js/admin-auth.js — and the three consoles all do', () => {
  const pages = consolePages(ROOT);
  for (const p of ['admin.html', 'admin-inquiries.html', 'admin-corrections.html']) assert.ok(pages.includes(p), `${p} is a console page`);
  assert.ok(!pages.includes('index.html'), 'the app is not a console page');
  for (const p of pages) assert.match(read(p), /js\/admin-auth\.js/);
  assert.ok(existsSync(join(ROOT, CONSOLE_AUTH)));
});

test('what the console needs is discovered through its pages and scripts', () => {
  const { files, outbound } = consoleFiles(ROOT);
  for (const f of [CONSOLE_AUTH, SDK_PATH, 'js/safe-html.js', 'js/admin-literal.js', 'js/admin-inquiries.js', 'js/admin-pipeline.js', 'js/admin-corrections.js'])
    assert.ok(files.includes(f), `${f} is part of the console`);
  assert.ok(outbound.every((p) => p.endsWith('.html') && !consolePages(ROOT).includes(p)), 'outbound links are app pages only');
});

test('nothing only the console needs is in the app\'s static copy list', async () => {
  const { STATIC_ASSETS } = await import('../vite.config.js');
  const only = new Set(consoleOnlyFiles(ROOT));
  assert.ok(only.has(CONSOLE_AUTH) && only.has('admin.html'), 'the sign-in module and the console itself are console-only');
  const leaked = STATIC_ASSETS.filter((f) => only.has(f));
  assert.deepEqual(leaked, [], 'console-only files would be published on the app\'s origin');
  /* the app still has what it shares with the console */
  assert.ok(appFiles(ROOT).has('js/safe-html.js'));
  /* …and the build refuses a console-only file whatever list names it */
  assert.match(read('vite.config.js'), /consoleOnlyFiles\(ROOT\)[\s\S]{0,400}this\.error\(/);
  assert.doesNotMatch(read('vite.config.js'), /input:\s*\{[^}]*admin/, 'admin.html is no longer an entry of the app build');
});

test('the built console site holds every file, and links to app pages leave for the app\'s address', (t) => {
  if (!existsSync(join(ROOT, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'))) { t.skip('no node_modules'); return; }
  const out = mkdtempSync(join(tmpdir(), 'intmap-admin-site-'));
  try {
    const r = buildAdminSite(out, { root: ROOT, source: 'f'.repeat(40) });
    for (const f of r.files) assert.ok(existsSync(join(out, f)), `${f} is in the site`);
    const src = JSON.parse(readFileSync(join(out, 'source.json'), 'utf8'));
    assert.equal(src.source, 'f'.repeat(40));
    assert.match(readFileSync(join(out, 'robots.txt'), 'utf8'), /Disallow: \//);
    assert.match(readFileSync(join(out, 'index.html'), 'utf8'), /url=admin\.html/);
    for (const p of r.pages) {
      const html = readFileSync(join(out, p), 'utf8');
      /* the app's files the console reads (sitemap, land mask) come from the app's origin: named for reading and images only */
      const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
      const dir = (n) => (csp.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === n) || []);
      const app = new URL(siteUrl('')).origin;
      assert.ok(dir('connect-src').includes(app) && dir('img-src').includes(app), `${p}: the app's origin may be read`);
      assert.ok(!dir('script-src').includes(app), `${p}: but no script of the app's origin runs in the console`);
      assert.ok(!html.includes('__INTMAP_SITE_URL__'), `${p}: the app's address is filled in`);
      for (const o of r.outbound) assert.ok(!new RegExp(`href=["']\\.?/?${o.replace('.', '\\.')}`).test(html), `${p} still links ${o} relatively`);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('rewriteOutbound points only app pages at the app, keeping fragments', () => {
  const html = '<a href="./corrections.html#x">log</a><a href="./admin.html">console</a><a href="https://e.test/">e</a>';
  const got = rewriteOutbound(html, 'admin-corrections.html', ['corrections.html']);
  assert.ok(got.includes(`href="${siteUrl('corrections.html')}#x"`));
  assert.ok(got.includes('href="./admin.html"'));
  assert.ok(got.includes('href="https://e.test/"'));
});

test('the pointer page at an old console address runs nothing', () => {
  const p = pointerPage(new URL('admin.html', ADMIN_URL).href);
  assert.doesNotMatch(p, /<script/i);
  assert.match(p, /default-src 'none'/);
  assert.ok(p.includes(`url=${new URL('admin.html', ADMIN_URL).href}`));
  assert.match(p, /noindex/);
});

/* ── js/admin-auth.js, evaluated ────────────────────────────────────────────────────────────── */
function storageStub(name, log) {
  const m = new Map();
  return { name, getItem: (k) => { log.push([name, 'get', k]); return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => { log.push([name, 'set', k]); m.set(k, String(v)); }, removeItem: (k) => { log.push([name, 'remove', k]); m.delete(k); }, key: () => null, get length() { return m.size; }, clear: () => m.clear() };
}
test('the console\'s client keeps its session in this tab\'s sessionStorage under its own key', () => {
  const log = [];
  const created = [];
  const local = storageStub('local', log), session = storageStub('session', log);
  const metas = { 'intmap-backend': 'https://backend.test', 'intmap-anon-key': 'anon' };
  const document = {
    querySelector: (sel) => { const m = /meta\[name="([^"]+)"\]/.exec(sel); return m && metas[m[1]] ? { getAttribute: () => metas[m[1]], content: metas[m[1]] } : null; },
    getElementById: () => ({ dataset: {}, classList: { toggle() {} }, addEventListener() {}, value: '', textContent: '', setAttribute() {}, removeAttribute() {}, focus() {} }),
    addEventListener() {}, readyState: 'complete', documentElement: {},
  };
  const window = {
    localStorage: local, sessionStorage: session, document, location: { href: ADMIN_URL, origin: ADMIN_ORIGIN },
    supabase: { createClient: (url, key, opts) => { created.push({ url, key, opts }); return { auth: { onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }, getSession: async () => ({ data: { session: null } }), mfa: {} }, from() { return {}; } }; } },
  };
  window.window = window;
  const ctx = vm.createContext({ window, document, localStorage: local, sessionStorage: session, console, setTimeout, clearTimeout, URL });
  vm.runInContext(read(CONSOLE_AUTH), ctx, { filename: CONSOLE_AUTH });
  const api = window.IntMapAdminAuth;
  assert.ok(api, 'js/admin-auth.js exposes window.IntMapAdminAuth');
  const sb = api.init({ prefix: '' });
  assert.ok(sb, 'init() returns the console\'s client');
  assert.equal(created.length, 1, 'one client');
  const auth = created[0].opts.auth;
  assert.equal(auth.storage, session, 'the session is kept in sessionStorage');
  assert.ok(auth.storageKey && !/^sb-/.test(auth.storageKey), 'under a key of its own, not the app\'s sb-<ref>-auth-token');
  assert.equal(auth.detectSessionInUrl, false, 'nothing arrives through the URL');
  assert.ok(!log.some(([n]) => n === 'local'), 'localStorage is never read or written');
});
