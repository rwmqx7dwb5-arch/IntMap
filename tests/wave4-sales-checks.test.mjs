/* ============================================================================
 *  wave4-sales — the network and device check (readiness.html, Atlas `system.readiness`)   (node --test)
 * ----------------------------------------------------------------------------
 *  ① THE CHECK ASKS WHAT THE PRODUCT NEEDS, FROM ITS OWNERS: the drawing context is maplibre-gl's own declaration; the
 *    clock and the lanes are the nightly check's; the probes are exactly the requests the nightly check makes (one per
 *    requested host of scripts/outbound-hosts.json), shipped in data/connection-ledger.json; the first-view tier is
 *    index.html's own preconnect, the backend tier src/vendor.js's backend.
 *  ② ONE PROBE, THREE ANSWERS, MEASURED APART: an answer is «reached», a refusal «blocked», a silent host «timeout» —
 *    and the verdict joins a host not reached to last night's row: answering then = this network (IT can allow it),
 *    silent then = the service, unreadable = unknown (never blamed on either).
 *  ③ THE DEVICE: a browser that cannot make the context cannot draw the map; a context refused only under the performance
 *    caveat is software drawing — slow, not absent.
 *  ④ THE PAGE IS THE ALLOWLIST: every probe is a row of both pages (en, ja) with its tier; the page may connect to any
 *    https origin (a probe the host redirects must not be reported as blocked) and names no backend in its policy; it
 *    loads its module; the words the running check needs are all in the page.
 *  ⑤ WHAT A RAW-SERVED PAGE IMPORTS IS SHIPPED: the import graph (static and literal dynamic imports) of every module
 *    vite.config.js copies verbatim is copied too — the status reader's bus.js was not, until this round.
 *  ⑥ THE WAYS IN AND OUT: the schools page and the handout point at the check, every page's footer reaches it, the
 *    report travels to the enquiry form through one key, and Atlas reaches the same rules.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const RC = await import('../js/readiness-check.js');
const LIVENESS = await import('../scripts/upstream-liveness.mjs');
const { readLedger, deriveConnectionLedger } = await import('../scripts/outbound-hosts.mjs');
const GEN = await import('../scripts/org-pages.mjs');
const { TEXT, ORG_NAV } = await import('../scripts/org-pages-text.mjs');
const OUT = GEN.outputs();
const unhtml = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/* ── ① ────────────────────────────────────────────────────────────────────────────────────── */
test('wave4-sales ① the context, the clock, the lanes and the probes come from their owners', () => {
  const map = src('node_modules/maplibre-gl/src/ui/map.ts');
  const declared = /export type ContextType = '([a-z0-9]+)';/.exec(map);
  assert.ok(declared, 'maplibre-gl still declares the context it asks for');
  assert.equal(RC.MAP_CONTEXT, declared[1], 'the check asks for the context the map engine asks for');
  assert.equal(RC.PROBE_TIMEOUT_MS, LIVENESS.TIMEOUT_MS, '«no answer in time» means the same as in the nightly check');
  assert.equal(RC.PROBE_CONCURRENCY, LIVENESS.CONCURRENCY);

  const raw = readLedger();
  const nightly = LIVENESS.declared(raw).probes;
  const shipped = JSON.parse(src('data/connection-ledger.json'));
  assert.deepEqual(shipped, JSON.parse(JSON.stringify(deriveConnectionLedger(raw))), 'data/connection-ledger.json is what the ledger derives');
  const index = src('index.html');
  const firstView = RC.firstViewHosts([...index.matchAll(/<link rel="preconnect" href="([^"]+)"/g)].map((m) => m[1]));
  const backend = new URL(/window\.SUPABASE_URL = '([^']+)'/.exec(src('src/vendor.js'))[1]).hostname;
  const probes = RC.probeRows(shipped.hosts, { firstView, backend });
  assert.deepEqual(probes.map((p) => p.url).sort(), nightly.map((p) => p.url).sort(), 'the readiness check asks exactly what the nightly check asks');
  assert.ok(firstView.length >= 1, 'index.html declares what the first view needs');
  for (const h of firstView) assert.ok(probes.some((p) => p.tier === 'first' && LIVENESS.hostMatches(p.host, h)), h + ' (preconnect) is checked in the first tier');
  assert.deepEqual(probes.filter((p) => p.tier === 'backend').map((p) => p.host), [backend], 'the backend tier is IntMap\'s backend');
  /* link and dormant rows are never asked */
  for (const r of shipped.hosts.filter((h) => h.form !== 'disclosure')) assert.equal(r.probe, undefined, r.host + ' is not requested and carries no probe');
});

/* ── ② ────────────────────────────────────────────────────────────────────────────────────── */
test('wave4-sales ② reached / blocked / timeout, and last night decides whose fault it is', async () => {
  const p = (host, tier) => ({ host, url: 'https://' + host + '/x', tier, what: host, whatJp: host });
  const fetchImpl = (url) => url.includes('ok.') ? Promise.resolve({ type: 'opaque' }) : url.includes('no.') ? Promise.reject(new TypeError('Failed to fetch')) : new Promise(() => {});
  const res = await RC.probeAll([p('ok.example', 'first'), p('no.example', 'layer'), p('hang.example', 'layer')], { fetchImpl, timeoutMs: 30, concurrency: 2 });
  assert.deepEqual(res.map((r) => r.verdict), ['reached', 'blocked', 'timeout']);
  assert.equal(typeof res[0].ms, 'number');
  assert.equal(res[1].ms, null, 'no time is claimed for an answer that did not come');

  const device = { map: true, workers: true };
  const night = { 'no.example': { verdict: 'alive' }, 'hang.example': { verdict: 'dead' } };
  let m = RC.assess(device, res, (h) => night[h] || null);
  assert.equal(m.overall, 'partial', 'the map draws; two layers do not');
  assert.deepEqual(m.allow.map((r) => r.host), ['no.example'], 'answering last night, not here → blocked on this network');
  assert.deepEqual(m.supplierDown.map((r) => r.host), ['hang.example'], 'silent last night too → the service');
  m = RC.assess(device, res, null);
  assert.ok(m.missing.every((r) => r.supplier === 'unknown'), 'an unread night blames nobody');
  assert.equal(m.allow.length, 2, '…and leaves both on the list IT can act on');

  const blockedFirst = [{ ...res[1], tier: 'first' }];
  assert.equal(RC.assess(device, blockedFirst, () => ({ verdict: 'alive' })).overall, 'not-ready', 'a first-view host blocked here: the map opens broken');
  assert.equal(RC.assess(device, blockedFirst, () => ({ verdict: 'dead' })).overall, 'partial', '…but a first-view supplier that is down is not this network');
  assert.equal(RC.assess({ map: false, workers: true }, [res[0]], null).overall, 'not-ready', 'no drawing context: no map');
  assert.equal(RC.assess(device, [res[0]], null).overall, 'ready');
});

/* ── ③ ────────────────────────────────────────────────────────────────────────────────────── */
test('wave4-sales ③ the device: no context is no map, a caveat-only refusal is software drawing', () => {
  const doc = (ctx) => ({ createElement: () => ({ getContext: (type, attrs) => ctx(type, attrs) }) });
  const gl = { MAX_TEXTURE_SIZE: 1, getParameter: () => 8192, getExtension: () => null };
  const win = { Worker: function () {}, isSecureContext: true, navigator: { serviceWorker: {}, onLine: true }, localStorage: { setItem() {}, removeItem() {} } };
  let d = RC.deviceReport(doc(() => null), win);
  assert.equal(d.map, false); assert.equal(d.accelerated, null, 'no context: acceleration is not measured, not «no»');
  d = RC.deviceReport(doc((t, a) => (t === RC.MAP_CONTEXT && !(a && a.failIfMajorPerformanceCaveat) ? gl : null)), win);
  assert.equal(d.map, true); assert.equal(d.accelerated, false, 'software drawing');
  d = RC.deviceReport(doc((t) => (t === RC.MAP_CONTEXT ? gl : null)), win);
  assert.equal(d.accelerated, true); assert.equal(d.maxTexture, 8192); assert.equal(d.workers, true); assert.equal(d.offline, true); assert.equal(d.storage, true);
  d = RC.deviceReport(doc(() => gl), { ...win, Worker: undefined, localStorage: { setItem() { throw new Error('denied'); } } });
  assert.equal(d.workers, false); assert.equal(d.storage, false);
});

/* ── ④ ────────────────────────────────────────────────────────────────────────────────────── */
test('wave4-sales ④ the page is the allowlist, in both languages, and its policy lets the probes through', () => {
  const F = GEN.orgFacts();
  for (const [rel, k] of [['readiness.html', 0], ['ja/readiness.html', 1]]) {
    const html = OUT[rel];
    assert.ok(html, rel + ' is generated');
    assert.equal(src(rel).replace(/\r\n/g, '\n'), html, rel + ' is what the generator writes');
    const rows = [...html.matchAll(/<tr data-probe="([^"]+)" data-host="([^"]+)" data-tier="([a-z]+)">/g)].map((m) => ({ url: unhtml(m[1]), host: unhtml(m[2]), tier: m[3] }));
    assert.deepEqual(rows, F.readiness.probes.map((p) => ({ url: p.url, host: p.host, tier: p.tier })), rel + ': one row per probe, in the check\'s order');
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
    assert.match(csp, /connect-src 'self' https:;/, rel + ': any https origin, nothing else');
    assert.ok(!csp.includes(F.backend), rel + ': names no backend (it is not one of the pages that talk to it)');
    assert.match(html, /<script type="module" src="(\.\.\/|\.\/)js\/readiness-page\.js"><\/script>/);
    assert.match(html, /id="rd-start"[^>]*data-effect="none"[^>]*hidden/, 'the start button appears only when the script runs');
    const live = JSON.parse(unhtml(/data-live="([^"]+)"/.exec(html)[1]));
    for (const key of Object.keys(TEXT.readiness.live)) assert.equal(live[key], TEXT.readiness.live[key][k], rel + ': live word ' + key);
    for (const t of RC.TIERS) assert.match(html, new RegExp('id="tier-' + t + '"'), rel + ': tier ' + t);
  }
  /* the words the script fills are the words the script names */
  const js = src('js/readiness-page.js');
  for (const m of js.matchAll(/LIVE\.(\w+)/g)) assert.ok(TEXT.readiness.live[m[1]], 'js/readiness-page.js reads LIVE.' + m[1] + ', which the page carries');
  for (const m of js.matchAll(/REP\.(\w+)/g)) assert.ok(TEXT.readiness.report[m[1]], 'js/readiness-page.js reads REP.' + m[1]);
  assert.ok(!/innerHTML/.test(js), 'nothing is inserted as markup');
});

/* ── ⑤ ────────────────────────────────────────────────────────────────────────────────────── */
test('wave4-sales ⑤ every module a verbatim-copied page can reach is copied too', async () => {
  const { STATIC_ASSETS } = await import(pathToFileURL(join(ROOT, 'vite.config.js')).href);
  const shipped = (rel) => { const parts = rel.split('/'); return parts.some((_, i) => STATIC_ASSETS.includes(parts.slice(0, i + 1).join('/'))); };
  const missing = [], seen = new Set();
  const IMPORT = /(?:^|[;\n}])\s*import\s+(?:[^'"()]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
  const walk = (rel, from) => {
    if (seen.has(rel)) return; seen.add(rel);
    if (!existsSync(join(ROOT, rel))) return;
    if (!shipped(rel)) missing.push(rel + ' ← ' + from);
    for (const m of src(rel).matchAll(IMPORT)) walk(posix.normalize(posix.join(posix.dirname(rel), m[1] || m[2])), rel);
  };
  for (const a of STATIC_ASSETS) if (/\.m?js$/.test(a)) walk(a, 'vite.config.js STATIC_ASSETS');
  assert.ok(seen.has('js/readiness-check.js') && seen.has('js/service-status.js'), 'the walk reaches the check and the status reader');
  assert.deepEqual(missing, [], 'imported by a raw-served module but absent from dist/');
  for (const p of ['readiness.html', 'js/readiness-page.js']) assert.ok(STATIC_ASSETS.includes(p), p + ' is shipped');
  const ga = src('.gitattributes');
  for (const p of ['/readiness.html', 'ja/readiness.html']) assert.match(ga, new RegExp('^' + p.replace(/[./]/g, '\\$&') + '\\s+merge=intmap-generated', 'm'), p + ' is declared to the merge driver');
});

/* ── ⑥ ────────────────────────────────────────────────────────────────────────────────────── */
test('wave4-sales ⑥ the ways in, the report into the enquiry, and Atlas', () => {
  assert.ok(ORG_NAV.some(([p, , o]) => p === 'readiness' && o && o.bar === false), 'readiness is an organisation page, linked from the footers');
  for (const dir of ['', 'ja/']) {
    assert.match(OUT[dir + 'for-schools.html'], /id="it">[\s\S]*?href="\.\/readiness\.html"[\s\S]*?<\/section>/, dir + 'for-schools: the IT checklist links the check');
    assert.match(OUT[dir + 'school-handout.html'], /href="\.\/readiness\.html">__INTMAP_SITE_URL__(ja\/)?readiness\.html</, dir + 'school-handout prints its address');
    assert.match(OUT[dir + 'contact.html'], /data-msg-attached="/, dir + 'contact: the form can say a report was attached');
    assert.match(src(dir + 'about.html'), /href="\.\/readiness\.html"/, dir + 'about.html footer reaches it');
  }
  assert.match(src('sitemap.xml'), /__INTMAP_SITE_URL__readiness\.html/);
  /* one key, written by the check and read by the form */
  const key = /const ATTACH_KEY = '([^']+)'/.exec(src('js/readiness-page.js'))[1];
  assert.match(src('js/org-page.js'), new RegExp("get\\('attach'\\) === 'readiness'[\\s\\S]{0,200}sessionStorage\\.getItem\\('" + key + "'\\)"), 'the form reads the key the check writes');
  assert.match(src('js/org-page.js'), /box\.maxLength[\s\S]{0,200}slice\(0, max - 1\)/, 'and holds the report to the box\'s own limit');
  /* Atlas: a registered capability that runs the same rules and links the page */
  const cap = src('js/atlas-cap-system.js');
  const at = /row: \['system\.readiness'[\s\S]*?at: (\d+)/.exec(cap);
  assert.ok(at && +at[1] >= 800 && +at[1] <= 839, 'system.readiness is declared, its catalogue text at its place');
  const body = cap.slice(cap.indexOf("row: ['system.readiness'"), cap.indexOf("row: ['system.whatsNew'"));
  for (const fn of ['probeRows', 'probeAll', 'deviceReport', 'assess', 'firstViewHosts']) assert.match(body, new RegExp('C\\.' + fn + '\\('), 'Atlas uses ' + fn);
  assert.match(body, /\.\/readiness\.html/, 'Atlas links the full check');
  assert.match(src('js/atlas-capabilities.js'), /\["system\.readiness","readiness"/, 'the registry carries the row');
});
