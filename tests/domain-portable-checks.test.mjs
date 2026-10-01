/* ============================================================================
 *  domain-portable · THE PRODUCTION ADDRESS IS ONE VALUE, AND THE SITE DOES NOT CARE WHERE IT IS MOUNTED
 * ----------------------------------------------------------------------------
 *  The site is going to move from its GitHub Pages address to a domain of its own. Before this round the
 *  address was spelled by hand in 69 tracked files; now supabase/functions/_shared/site-origin.js holds it
 *  and everything derives from it. These checks hold the four claims that makes:
 *    ① the value derives everything a reader of it needs, with or without a domain of its own;
 *    ② PAGES_URL is not a choice — it is what the repository's own name makes it;
 *    ③ nothing else spells it (the rule check:static runs), and the rule refuses what it says it refuses;
 *    ④ the build works from the Pages sub-path AND from a domain root — the same dist/, served both ways.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as SITE from '../supabase/functions/_shared/site-origin.js';
import {
  CANONICAL, DEF_RE, SITE_TOKEN, guardedHosts, renderDefinitions, siteSpellings, siteUrlPlugin, spellingsIn,
} from '../scripts/site-url.mjs';
import { pagesUrlFromRemote } from '../scripts/release-state.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* The canonical module, evaluated with a different CUSTOM_DOMAIN — the one edit the move will make —
   so the derivations are tested on the day-after state too, not only on today's. */
async function siteWith(domain) {
  const src = read(CANONICAL);
  const line = 'export const CUSTOM_DOMAIN = "";';
  assert.ok(src.includes(line), `${CANONICAL} no longer declares CUSTOM_DOMAIN as ${line}`);
  const text = src.replace(line, `export const CUSTOM_DOMAIN = ${JSON.stringify(domain)};`);
  return import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
}

/* ── ① the value derives the rest ──────────────────────────────────────────────────────────────── */

test('domain-portable ① with no domain of its own the site is the Pages address, at its sub-path', () => {
  assert.equal(SITE.CUSTOM_DOMAIN, '', 'this round does not choose a domain — the reader has not bought one');
  assert.equal(SITE.SITE_URL, SITE.PAGES_URL);
  assert.equal(SITE.SITE_ORIGIN, new URL(SITE.PAGES_URL).origin);
  assert.equal(SITE.SITE_BASE_PATH, new URL(SITE.PAGES_URL).pathname);
  assert.deepEqual([...SITE.SITE_ORIGINS], [SITE.SITE_ORIGIN], 'one origin until there are two');
  assert.equal(SITE.siteUrl('terms.html'), SITE.PAGES_URL + 'terms.html');
  assert.throws(() => SITE.siteUrl('/terms.html'), /root-absolute/, 'a leading slash would drop the /IntMap/ prefix on Pages');
  assert.equal(SITE.SITE_USER_AGENT, `IntMap/1.0 (+${SITE.SITE_URL})`);
});

test('domain-portable ① with a domain of its own: served at the root, and the Pages origin still accepted', async () => {
  const S = await siteWith('intmap.example');
  assert.equal(S.SITE_URL, 'https://intmap.example/');
  assert.equal(S.SITE_BASE_PATH, '/', 'a custom domain serves the site at its root');
  assert.equal(S.SITE_HOST, 'intmap.example');
  assert.deepEqual([...S.SITE_ORIGINS], ['https://intmap.example', new URL(S.PAGES_URL).origin],
    'the Pages origin stays accepted — a reader with an old tab or service worker is still on it');
  assert.ok(S.isSiteOrigin(new URL(S.PAGES_URL).origin));
  assert.ok(!S.isSiteOrigin('https://evil.example'));
  assert.equal(S.siteUrl('privacy.html'), 'https://intmap.example/privacy.html');
  for (const bad of ['https://intmap.example', 'intmap.example/', 'IntMap.Example', 'intmap', '-x.example']) {
    await assert.rejects(siteWith(bad), /CUSTOM_DOMAIN must be a lower-case host name/, `${bad} must be refused, not half-used`);
  }
});

test('domain-portable ① the readers that decide something ask the value, not a copy', async () => {
  const shape = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/client-error-shape.js')).href);
  for (const o of SITE.SITE_ORIGINS) assert.ok(shape.originAllowed(o) && shape.isProductionOrigin(o), o);
  assert.ok(shape.originAllowed('http://127.0.0.1:4173') && !shape.isProductionOrigin('http://127.0.0.1:4173'),
    'a local preview may talk to the function and does not report');
  assert.ok(!shape.originAllowed('https://evil.example'));
  assert.equal(shape.PRODUCTION_ORIGIN, SITE.SITE_ORIGIN);
  const report = await import(pathToFileURL(join(ROOT, 'js/client-error-report.js')).href);
  const sent = [];
  const rep = report.createReporter({ origin: SITE.SITE_ORIGIN, release: 'r', path: () => SITE.SITE_BASE_PATH,
    endpoint: () => 'https://x/functions/v1/client-errors', send: (u, b) => sent.push(b) });
  assert.equal(await rep.report({ kind: 'error', message: 'Error: x', stack: 'Error: x\n    at f (https://h/a.js:1:1)' }), 'sent');
  /* the Edge Functions that introduce themselves upstream do so with the value */
  for (const f of ['alerts-relay', 'gdelt-relay', 'sv-cov']) {
    const src = read(`supabase/functions/${f}/index.ts`);
    assert.match(src, /from "\.\.\/_shared\/site-origin\.js"/, `${f} must import the address`);
    assert.doesNotMatch(src, /IntMap\/1\.0 \(\+https?:/, `${f} spells its User-Agent's address by hand`);
  }
});

/* ── ② PAGES_URL is what the repository's name makes it ───────────────────────────────────────── */

test('domain-portable ② PAGES_URL is the address GitHub gives this repository', (t) => {
  let remote = '';
  try { remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* none */ }
  const derived = pagesUrlFromRemote(remote);
  if (!derived) { t.skip(`no GitHub remote to derive the Pages address from (${remote || 'none'})`); return; }
  assert.equal(SITE.PAGES_URL, derived, 'the repository was renamed or transferred — PAGES_URL must follow it');
});

/* ── ③ nothing else spells it ──────────────────────────────────────────────────────────────────── */

test('domain-portable ③ the tracked tree spells the address only in the value and its rendered definitions', () => {
  const bad = siteSpellings(ROOT);
  assert.deepEqual(bad.map((b) => `${b.file}:${b.line}: ${b.why}`), []);
});

test('domain-portable ③ the rule refuses what it says it refuses, and spares what it says it spares', () => {
  const host = new URL(SITE.PAGES_URL).host;
  const hosts = guardedHosts();
  assert.ok(hosts.includes(host));
  const hit = (rel, text) => spellingsIn(rel, text, hosts).length;
  assert.equal(hit('js/x.js', `fetch('${SITE.PAGES_URL}data.json')`), 1, 'a URL in code');
  assert.equal(hit('docs/x.md', `the host ${host.toUpperCase()} answered`), 1, 'a bare host, in any case');
  assert.equal(hit('dev-notes/2026-10-01-x.md', `measured on ${SITE.PAGES_URL}`), 0, 'history keeps what was measured');
  assert.equal(hit('DEV-NOTES-ARCHIVE.md', `measured on ${SITE.PAGES_URL}`), 0);
  assert.equal(hit(CANONICAL, `"${SITE.PAGES_URL}"`), 0, 'the value itself');
  assert.equal(hit('README.md', `[site:terms.html]: ${SITE.siteUrl('terms.html')}`), 0, 'a rendered definition');
  assert.equal(hit('README.md', `[site:terms.html]: ${SITE.siteUrl('privacy.html')}`), 1, 'a definition that is not what --write renders');
  assert.equal(hit('README.md', `[site:/terms.html]: ${SITE.siteUrl('terms.html')}`), 1, 'a root-absolute path');
  assert.equal(hit('README.md', `see [site:]: ${SITE.SITE_URL}`), 1, 'only a whole definition line is rendered');
  assert.equal(hit('js/x.js', `'https://not-${host}/'`), 0, 'another host that merely contains it');
});

test('domain-portable ③ --write renders every definition from the value, and leaves the rest of the line alone', () => {
  const stale = ['# t', '[site:]: https://old.example/', '  [site:sources.html]: https://old.example/sources.html', 'text [site:] stays'].join('\r\n');
  const out = renderDefinitions(stale);
  assert.equal(out, ['# t', `[site:]: ${SITE.SITE_URL}`, `  [site:sources.html]: ${SITE.siteUrl('sources.html')}`, 'text [site:] stays'].join('\r\n'),
    'CRLF kept, indentation kept, prose untouched');
  /* the documents that carry the address carry it as definitions, and they resolve */
  for (const f of ['README.md', 'AGENTS.md', '.agents/roles/intmap-prod-verifier.md']) {
    const defs = read(f).split(/\r?\n/).map((l) => DEF_RE.exec(l)).filter(Boolean);
    assert.ok(defs.length, `${f} has no [site:] definition`);
    for (const d of defs) assert.equal(d[3], SITE.siteUrl(d[2]), `${f}: [site:${d[2]}]`);
    for (const label of read(f).match(/\]\[site:[^\]]*\]/g) || []) {
      const want = label.slice(2, -1);
      assert.ok(defs.some((d) => `site:${d[2]}` === want), `${f} uses [${want}] with no definition`);
    }
  }
});

/* ── ④ the build does not care where it is mounted ─────────────────────────────────────────────── */

test('domain-portable ④ the build is relative: base, service worker, social card', async () => {
  assert.match(read('vite.config.js'), /\bbase: '\.\/'/, 'the bundle must resolve its assets relative to the page');
  assert.match(read('js/tile-warm.js'), /serviceWorker\.register\('sw\.js'\)/, 'a relative script URL scopes the worker to the page\'s directory');
  assert.doesNotMatch(read('sw.js'), /['"`]\/IntMap\//, 'the service worker must not name a base path');
  const html = read('index.html');
  assert.ok(html.includes(`content="${SITE_TOKEN}og-image.jpg"`) && html.includes(`content="${SITE_TOKEN}"`),
    'index.html carries the address as the token the build fills, not as text');
  const p = siteUrlPlugin();
  assert.equal(p.transformIndexHtml.handler(`<meta content="${SITE_TOKEN}og-image.jpg">`), `<meta content="${SITE.SITE_URL}og-image.jpg">`);
  const emitted = [];
  p.generateBundle.call({ emitFile: (f) => emitted.push(f) });
  assert.deepEqual(emitted, [], 'no domain of its own → no CNAME');
  const S = await siteWith('intmap.example');
  const q = siteUrlPlugin(S);
  q.generateBundle.call({ emitFile: (f) => emitted.push(f) });
  assert.deepEqual(emitted, [{ type: 'asset', fileName: 'CNAME', source: 'intmap.example\n' }], 'a domain → dist/CNAME holds it');
  assert.equal(q.transformIndexHtml.handler(`x${SITE_TOKEN}y`), 'xhttps://intmap.example/y');
});

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
function serveUnder(dist, mount) {
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith(mount)) { res.writeHead(404).end(); return; }
    let rel = decodeURIComponent(u.pathname.slice(mount.length)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const abs = normalize(join(dist, rel));
    if (!abs.startsWith(dist + sep) || !existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(abs)] || 'application/octet-stream' }).end(readFileSync(abs));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

test('domain-portable ④ the same dist/ works from a domain root and from the Pages sub-path', async (t) => {
  const dist = join(ROOT, 'dist');
  if (!existsSync(join(dist, 'index.html'))) { t.skip('no build in dist/ — `npm run build` first'); return; }
  const built = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.ok(!built.includes(SITE_TOKEN), 'the build filled the address in');
  assert.ok(built.includes(`content="${SITE.SITE_URL}"`), 'og:url is the value');
  /* every same-origin URL the built page names, as the browser resolves it */
  const refs = [...built.matchAll(/\b(?:src|href)="([^"#?]+)/g)].map((m) => m[1])
    .filter((r) => !/^(?:[a-z]+:|\/\/|data:|#)/i.test(r));
  assert.ok(refs.length >= 3, `the built page names only ${refs.length} local resources`);
  /* …and no page the build ships names a root-absolute one (it would resolve outside /IntMap/ on Pages) */
  for (const f of readdirSync(dist).filter((n) => n.endsWith('.html'))) {
    const rootAbsolute = [...readFileSync(join(dist, f), 'utf8').matchAll(/\b(?:src|href)="(\/[^/"][^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(rootAbsolute, [], `dist/${f} names a root-absolute URL`);
  }
  for (const mount of ['/', new URL(SITE.PAGES_URL).pathname]) {
    const server = await serveUnder(dist, mount);
    try {
      const page = `http://127.0.0.1:${server.address().port}${mount}`;
      assert.equal((await fetch(page)).status, 200, `${mount} index`);
      for (const r of refs) {
        const url = new URL(r, page).href;
        assert.equal((await fetch(url)).status, 200, `${r} from a page mounted at ${mount} → ${url}`);
      }
    } finally { server.close(); }
  }
});
