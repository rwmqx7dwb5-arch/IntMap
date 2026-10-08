// (security-hardening) Four weaknesses measured on 2026-10-08 and closed by structure, each checked here by
// EVALUATING the rule on the repository's own data — never by reading the spelling of the fix:
//   ① the lock contradicted the packages it locks (DOMPurify 3.4.13 under Cesium's ^3.4.14, inside two advisories)
//   ② the secret scan read only familiar extensions, judged only the first JWT, and did not know the shapes of
//      the credentials this project's own operation uses
//   ③ the developers page's postMessage sample accepted a reply from any window
//   ④ the article relay's address check answered «public» for IPv6 special-purpose blocks and 6to4 / IPv4-mapped
//      spellings of private IPv4 addresses
// ⑤ and the watcher that was missing: nothing reported a published advisory against the lock.
// See dev-notes/2026-10-08-security-hardening.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lockEdges, overrideEdges, satisfies, parseRange } from '../scripts/lock-ranges.mjs';
import { findSecrets, secretScanUniverse, SECRET_PATTERNS, SECRET_SCAN_SELF } from '../scripts/secret-scan.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = JSON.parse(fs.readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ══ ① the lock meets every range its own packages declare ══ */
test('① the shipped lock meets every dependency range it records — and the rule reads every edge', () => {
  const r = lockEdges(LOCK);
  assert.ok(r.edges >= Object.keys(LOCK.packages).length, `only ${r.edges} edges were read from ${Object.keys(LOCK.packages).length} packages`);
  assert.deepEqual(r.unmet, [], 'a locked version outside the range its dependent declares');
  assert.deepEqual(r.unjudged, [], 'a spec the rule cannot read is refused, so none may remain');
  assert.deepEqual(r.missing, [], 'a required dependency the lock does not hold');
  /* the package that ships DOMPurify to the browser, and the floor it declares, read from the lock — not written here */
  const dependents = Object.entries(LOCK.packages).filter(([, e]) => e.dependencies && e.dependencies.dompurify);
  assert.ok(dependents.length > 0, 'something in the lock depends on dompurify');
  for (const [, e] of dependents) assert.equal(satisfies(LOCK.packages['node_modules/dompurify'].version, e.dependencies.dompurify), true);
});

test('① every caret floor in the real lock is enforced: one patch below it is reported as unmet, at the dependency\'s own path', () => {
  let probed = 0;
  for (const [from, entry] of Object.entries(LOCK.packages)) {
    for (const [name, range] of Object.entries(entry.dependencies || {})) {
      const m = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
      if (!m || +m[3] === 0) continue;
      const below = `${m[1]}.${m[2]}.${+m[3] - 1}`;
      const lock = clone(LOCK);
      /* the entry the dependent resolves to: nearest node_modules at or above it (the rule's own lookup is what is under test) */
      let base = from, key = null;
      for (;;) { const k = (base ? base + '/' : '') + 'node_modules/' + name; if (lock.packages[k]) { key = k; break; } if (!base) break; const i = base.lastIndexOf('/node_modules/'); base = i < 0 ? '' : base.slice(0, i); }
      if (!key || lock.packages[key].link) continue;
      lock.packages[key].version = below;
      const unmet = lockEdges(lock).unmet;
      assert.ok(unmet.some((u) => u.name === name && u.locked === below && u.at === key && u.from === (from || '(root)')), `${from} → ${name}@${range} with ${below} locked`);
      probed++;
    }
  }
  assert.ok(probed > 50, `the real lock offered only ${probed} caret floors to probe`);
});

test('① ranges are read the way npm reads them (node-semver semantics, every form the lock contains)', () => {
  const cases = [
    ['3.4.13', '^3.4.14', false], ['3.4.16', '^3.4.14', true], ['4.0.0', '^3.4.14', false],
    ['0.2.5', '^0.2.3', true], ['0.3.0', '^0.2.3', false], ['0.0.4', '^0.0.3', false],
    ['1.1.9', '~1.1.0', true], ['1.2.0', '~1.1.0', false], ['3.9.0', '3.x', true], ['4.0.0', '3.x', false],
    ['2.20.3', '2', true], ['1.0.0', '>=1.0.0', true], ['0.9.9', '>=1.0.0', false],
    ['4.0.4', '^3 || ^4', true], ['5.0.0', '^3 || ^4', false], ['0.151.0', '=0.151.0', true], ['0.151.1', '=0.151.0', false],
    ['22.13.0', '^20.19.0 || >=22.12.0', true], ['21.0.0', '^20.19.0 || >=22.12.0', false],
    ['0.1.0-alpha.2', '^0.1.0-alpha.2', true], ['0.1.0-alpha.1', '^0.1.0-alpha.2', false],
    ['3.0.0-beta.1', '^2.0.0', false], ['3.0.0-beta.1', '<3.0.0', false], ['2.9.9', '<3.0.0', true],
    ['1.2.3', '1.2.0 - 1.3', true], ['1.4.0', '1.2.0 - 1.3', false], ['7.7.7', '*', true],
  ];
  for (const [v, r, want] of cases) assert.equal(satisfies(v, r), want, `${v} ${want ? 'satisfies' : 'does not satisfy'} ${r}`);
  assert.equal(parseRange('not a range ¬'), null, 'an unreadable range is null, so the gate refuses it rather than passing it');
});

/* ══ ② the secret scan ══ */
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (role) => [b64url({ alg: 'HS256', typ: 'JWT' }), b64url({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role, iat: 1700000000, exp: 2000000000 }), 'c2lnbmF0dXJlLXNpZ25hdHVyZQ'].join('.');

test('② a service_role JWT is refused wherever it sits in a file, not only when it is the first JWT', () => {
  const anon = jwt('anon'), svc = jwt('service_role');
  assert.equal(findSecrets(`const ANON = "${anon}";`).serviceRoleJwt, false);
  assert.equal(findSecrets(`const SVC = "${svc}";`).serviceRoleJwt, true);
  const both = findSecrets(`const ANON = "${anon}";\n// …\nconst SVC = "${svc}";`);
  assert.equal(both.jwts, 2);
  assert.equal(both.serviceRoleJwt, true, 'the public key before it used to hide it');
});

test('② the shapes of the credentials this project operates with are refused (built at run time — no token is in this file)', () => {
  const rnd = (alphabet, n) => Array.from({ length: n }, (_, i) => alphabet[(i * 7 + 3) % alphabet.length]).join('');
  const AN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', HEX = '0123456789abcdef';
  const samples = {
    'Supabase personal access token': 'sbp' + '_' + rnd(HEX, 40),
    'Stripe restricted live key': 'rk' + '_live_' + rnd(AN, 24),
    'Stripe webhook signing secret': 'whsec' + '_' + rnd(AN, 32),
    'Google OAuth client secret': 'GOCSPX' + '-' + rnd(AN, 28),
    'npm access token': 'npm' + '_' + rnd(AN, 36),
  };
  for (const [name, tok] of Object.entries(samples)) {
    assert.ok(SECRET_PATTERNS.some((p) => p.name === name), name + ' is a pattern');
    assert.deepEqual(findSecrets(`key = "${tok}"`).secrets.map((s) => s.name), [name], name);
  }
  assert.deepEqual(findSecrets('see sbp_ tokens in the dashboard; rk_live_ keys; whsec_ secrets').secrets, [], 'naming a prefix in prose is not a secret');
});

test('② the scan reads every file git would commit that is text, whatever its extension', () => {
  const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.pdf', '.zip', '.gz', '.tif', '.tiff', '.mp4', '.mov']);
  const universe = new Set(secretScanUniverse(ROOT, [], BINARY_EXT).map((f) => f.rel));
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean);
  let text = 0;
  const missed = [];
  for (const name of tracked) {
    if (BINARY_EXT.has(extname(name).toLowerCase())) continue;
    let bytes;
    try { bytes = fs.readFileSync(join(ROOT, name)); } catch { continue; }
    if (bytes.subarray(0, 8192).includes(0)) continue;
    text++;
    if (!universe.has(name)) missed.push(name);
  }
  assert.deepEqual(missed, [], 'tracked text files the secret scan does not read');
  /* the kinds the extension list never read are in it now — found from the tree, not named here */
  const OLD_TEXT_EXT = ['.html', '.htm', '.js', '.mjs', '.cjs', '.ts', '.json', '.yml', '.yaml', '.md', '.css', '.py', '.txt', '.xml', '.svg', '.sql', '.toml'];
  const outside = tracked.filter((n) => universe.has(n) && !OLD_TEXT_EXT.includes(extname(n).toLowerCase()));
  assert.ok(outside.length > 0 && text > outside.length, `${outside.length} tracked text files beyond the old extension list`);
  for (const self of SECRET_SCAN_SELF) assert.ok(fs.existsSync(join(ROOT, self)), self + ' — a skipped file must exist, or the skip names nothing');
});

/* ══ ③ the sample people copy checks who sent the message ══ */
function samples(page) {
  const html = fs.readFileSync(join(ROOT, page), 'utf8');
  const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return [...html.matchAll(/<pre class="lp-code"><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => unesc(m[1])).filter((c) => /addEventListener\('message'/.test(c) && !/import /.test(c));
}
for (const page of ['developers.html', 'ja/developers.html']) {
  test(`③ ${page}: the raw-protocol sample acts on a reply from the framed map and ignores one from any other window`, () => {
    const codes = samples(page);
    assert.equal(codes.length, 1, 'the page shows one raw-protocol sample');
    const SRC = 'https://maps.example/IntMap/index.html?embed=1';
    const frameWin = { postMessage: () => {} }, otherWin = { postMessage: () => {} };
    const listeners = [], logged = [];
    const sandbox = {
      URL,
      document: { querySelector: () => ({ src: SRC, contentWindow: frameWin }) },
      window: { addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); } },
      console: { log: (...a) => logged.push(a) },
    };
    vm.runInNewContext(codes[0], sandbox);
    assert.equal(listeners.length, 1);
    const reply = { protocol: 'intmap-embed', v: 1, type: 'reply', id: '1', ok: true, hash: '#forged' };
    listeners[0]({ source: otherWin, origin: 'https://evil.example', data: reply });
    listeners[0]({ source: otherWin, origin: new URL(SRC).origin, data: reply });
    listeners[0]({ source: frameWin, origin: 'https://evil.example', data: reply });
    assert.deepEqual(logged, [], 'a reply from a window that is not the framed map, or from another origin, is ignored');
    listeners[0]({ source: frameWin, origin: new URL(SRC).origin, data: { ...reply, hash: '#v=1' } });
    assert.deepEqual(logged, [[true, '#v=1']], 'the framed map\'s own reply is acted on');
  });
}

/* ══ ④ the article relay's address rule ══ */
test('④ publicAddress refuses every IANA special-purpose IPv6 block and every spelling of a private IPv4 inside IPv6', async () => {
  const { publicAddress, resolvesPublic } = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/relay-guard.js')).href);
  const refused = [
    '2002:a00:1::1', '2002:7f00:1::', '2002:a9fe:a9fe::1',   /* 6to4 carrying 10.0.0.1, 127.0.0.1, 169.254.169.254 */
    '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001:2::1', '2001:1ff::1',   /* Teredo, benchmarking, the rest of 2001::/23 */
    '100::1', '3fff::1', '5f00::1', 'fec0::1', '64:ff9b:1::1',
    '::ffff:a00:1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:0a00:0001', '64:ff9b::a9fe:a9fe', '64:ff9b::169.254.169.254',
    'fe80::1%eth0', '[::1]', '::', '::1', 'fd00::1', 'ff02::1', '2001:db8::1', '::a00:1',
    '1::2::3', '12345::1', '1:2:3:4:5:6:7:8:9', 'g::1', '',
  ];
  for (const a of refused) assert.equal(publicAddress(a), false, a);
  const allowed = ['2a02:26f0::1', '2001:4860:4860::8888', '2606:4700::1111', '2400:cb00::1', '::ffff:8.8.8.8', '::ffff:808:808', '2002:808:808::1', '64:ff9b::8.8.8.8', '8.8.8.8'];
  for (const a of allowed) assert.equal(publicAddress(a), true, a);

  /* and the resolver that guards the article rule refuses a public NAME whose AAAA answer is one of them */
  const saved = globalThis.Deno;
  try {
    globalThis.Deno = { resolveDns: async (_h, type) => (type === 'A' ? ['93.184.215.14'] : ['2002:a9fe:a9fe::1']) };
    assert.equal(await resolvesPublic('news.example'), false, 'one private answer among public ones refuses the name');
    globalThis.Deno = { resolveDns: async (_h, type) => (type === 'A' ? ['93.184.215.14'] : ['2606:2800:21f:cb07:6820:80da:af6b:8b2c']) };
    assert.equal(await resolvesPublic('news.example'), true);
  } finally { if (saved === undefined) delete globalThis.Deno; else globalThis.Deno = saved; }
});

/* ══ ⑤ a watcher for published advisories against the lock ══ */
test('⑤ a workflow asks the advisory database about the lock — shipped code at any severity, weekly and on every PR', async () => {
  const { load } = await import('js-yaml');
  const wfDir = join(ROOT, '.github/workflows');
  const hits = [];
  for (const f of fs.readdirSync(wfDir).filter((n) => /\.ya?ml$/.test(n))) {
    const wf = load(fs.readFileSync(join(wfDir, f), 'utf8'));
    const on = wf.on || wf[true] || {};
    for (const [id, job] of Object.entries(wf.jobs || {})) {
      const runs = (job.steps || []).map((s) => s.run || '').filter((r) => /\bnpm audit\b/.test(r));
      if (runs.length) hits.push({ f, id, runs, on, job });
    }
  }
  assert.ok(hits.length > 0, 'no workflow runs npm audit');
  const shipped = hits.filter((h) => h.runs.some((r) => /--omit=dev/.test(r) && /--audit-level=low\b/.test(r) && /--package-lock-only/.test(r)));
  assert.ok(shipped.length > 0, 'the browser-shipped dependencies are audited at every severity, from the lock');
  for (const h of shipped) {
    assert.ok(h.on.schedule && h.on.pull_request !== undefined, `${h.f}:${h.id} runs on a schedule and on pull requests`);
    assert.deepEqual(h.job.permissions, { contents: 'read' }, `${h.f}:${h.id} needs to read the repository and nothing else`);
  }
});

test('①b every root override is met by the lock — an exact pin that was a floor must not become a ceiling npm ci refuses', () => {
  const ROOTDIR = join(dirname(fileURLToPath(import.meta.url)), '..');
  const pkg = JSON.parse(fs.readFileSync(join(ROOTDIR, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(join(ROOTDIR, 'package-lock.json'), 'utf8'));
  assert.ok(Object.keys(pkg.overrides || {}).length, 'the shipped package.json carries overrides — the rule must have something to read');
  assert.deepEqual(overrideEdges(pkg, lock), []);
  /* the measured failure (PR #1041 first CI run): the pin left at 3.4.13 after the lock moved to 3.4.16 */
  const stale = overrideEdges({ overrides: { ...pkg.overrides, dompurify: '3.4.13' } }, lock);
  assert.ok(stale.some((o) => o.name === 'dompurify' && o.locked !== '3.4.13'), 'a stale exact pin is reported');
  assert.ok(overrideEdges({ overrides: { dompurify: { '.': '1' } } }, lock).some((o) => o.why), 'a form it cannot read is refused, not passed');
});
