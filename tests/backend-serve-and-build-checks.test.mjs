/* ============================================================================
 *  Serving and shipping the build — the local server that stands in for GitHub Pages
 *  (scripts/serve.mjs), the build stamp and the stale-build guard, the development record's order, and
 *  the shared-app browser harness the specs boot through.
 * ----------------------------------------------------------------------------
 *  Gathered from tests/r208-checks ④ ⑩ (the suite's boots and the stamp; the server answers
 *  Accept-Encoding the way Pages does) and tests/r219-checks ⑪ (the record leads with the newest entry
 *  and the stamp agrees). Titles keep the round that wrote them.
 *
 *  ⚠ tests/suite-hygiene-checks.test.mjs (and the retired tests/r415-checks) name the file R208 ⑩ lives
 *  in, as "the file this round was reported against" — R208 ⑩ is below, in THIS file.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedStampProblems } from './helpers/build-stamp.mjs';
import { entries, latestEntry, renderIndex } from '../scripts/dev-notes.mjs';
import { codeOnly as codeOnlyOf } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══ #R208 ④ THE SUITE — the boots, and the stamp ═════════════════════════════════════════════ */

/* ⚠ READ, NOT RUN: a Playwright fixture's scope and reset are only exercised by booting a browser. */
test('R208 ④a: the shared app is worker-scoped, and says why', () => {
  const h = read('tests/helpers/app.js');
  assert.ok(/scope:\s*'worker'/.test(h), 'one boot per worker, so tests still run in parallel');
  assert.ok(/autoReset/.test(h), 'the reset runs before every test rather than being remembered');
  /* ⚠ THE PANEL'S OWN ✕ — not a new global. js/app-body.js is under a shrink-only ceiling and
     js/tool-panel.js is a DECLARATION-ONLY factory, so a helper that needs to close a tool uses the
     affordance that already exists rather than making either file grow a running statement. */
  assert.ok(/#tool-panel \.tp-close/.test(h), 'the reset closes the tool through the panel button');
  /* comments stripped first: the header explains the trap by naming it */
  const codeOnly = codeOnlyOf(h);
  assert.ok(!/IM_HOST\.exitTool/.test(codeOnly),
    'and NOT through IM_HOST, which is a module-local const in js/app-body.js — calling that from ' +
    'a test is the silent no-op #R205 is about, and it cost two runs of r171 to spot');
});

/* ⚠ READ, NOT RUN: as above — test.use() inside a spec is only ignored by a live worker-scoped page. */
test('R208 ④b: no converted spec uses test.use — a worker-scoped page cannot honour it', () => {
  for (const s of ['r170', 'r179-engine', 'r184-drone', 'r184-routing']) {
    const src = read(`tests/${s}.spec.js`);
    assert.ok(/helpers\/app\.js/.test(src), `tests/${s}.spec.js is converted`);
    assert.ok(!/test\.use\(/.test(src),
      `tests/${s}.spec.js uses test.use() — those options configure the PER-TEST context and a ` +
      'worker-scoped page is built before they are known, so it would ignore them SILENTLY. ' +
      'tests/r179-imagery.spec.js was reverted for exactly this.');
  }
});

test('R208 ④c: the stale-build guard compares build times, not the stamp as text', () => {
  const html = read('index.html');
  /* RUN: the stamp is written by the build (<committer time>Z-<sha>); the page's own parser is evaluated */
  const src = /var timeOf=(function\(s\)\{[^\n]*?\});/.exec(html);
  assert.ok(src, 'the page parses a time out of the stamp (timeOf)');
  const timeOf = new Function('return ' + src[1])();
  const older = '2026-08-09T10:00:00Z-aaaaaaa', newer = '2026-08-11T09:00:00Z-bbbbbbb';
  assert.ok(timeOf(newer) > timeOf(older), 'a later build compares greater');
  assert.ok(Number.isNaN(timeOf('2026-08-09-R208')), 'a legacy round stamp is not mistaken for a time');
  /* ⚠ READ (this half): the comparison runs in the page's inline head script at load */
  assert.ok(/tSeen>tNow/.test(html) && /tNow>tSeen/.test(html), 'both directions compare numerically');
  /* the hazard this closes: `'2026-08-09-R208' > '2026-08-11-R207'` is FALSE as text */
  assert.ok('2026-08-09-R208' < '2026-08-11-R207', 'sanity: this is exactly the string comparison that used to decide it');
});

/* ═══ #R208 ⑩ THE LOCAL SERVER STANDS IN FOR GITHUB PAGES, INCLUDING THE COMPRESSION ════════════ */

test('R208 ⑩: scripts/serve.mjs answers Accept-Encoding the way Pages does', async () => {
  /* ⚠ THE INSTRUMENT WAS LYING, AND IN THE DIRECTION THAT MAKES THE WORK LOOK URGENT (#R202 again). The
     file claimed since #R133 to serve "exactly as GitHub Pages would" and did not compress at all.
     MEASURED against the live site: assets/main-*.js is 3,603 kB raw and 1,331 kB from Pages, so every
     load measurement over an emulated phone network was 2.7x pessimistic on the download term. This
     starts the real server and asks it. */
  const { spawn } = await import('node:child_process');
  /* ⚠⚠ THE PORT IS THE OPERATING SYSTEM'S TO CHOOSE, NOT THIS TEST'S (#R415). Two literal ports once
     made the second of forty-two parallel checkouts fail with «serve.mjs did not come up» in a tree
     whose own code was fine. Port 0: the kernel hands out a free port and serve.mjs's ready line names
     the one it actually bound, so the number comes back off stdout instead of being invented. */
  const serve = (extra, whenLate) => {
    const proc = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs'), '--port', '0', ...extra],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    /* the ready line can arrive split across chunks, so match against everything seen so far */
    const port = new Promise((ok, no) => {
      const t = setTimeout(() => no(new Error(whenLate)), 15000);
      let out = '';
      proc.stdout.on('data', (d) => {
        out += String(d);
        const m = /static server on http:\/\/[^\s:/]+:(\d+)\//.exec(out);
        if (m) { clearTimeout(t); ok(Number(m[1])); }
      });
      proc.on('error', no);
    });
    return { proc, port };
  };

  const srv = serve([], 'serve.mjs did not come up');
  try {
    const PORT = await srv.port;
    const get = async (p, accept) => {
      const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { headers: accept ? { 'accept-encoding': accept } : {} });
      return { enc: r.headers.get('content-encoding'), len: Number(r.headers.get('content-length') || 0),
        type: r.headers.get('content-type'), vary: r.headers.get('vary'), body: await r.arrayBuffer() };
    };
    /* ⚠ `identity` rather than an empty header: undici supplies its own Accept-Encoding otherwise */
    const plain = await get('/index.html', 'identity');
    const gz = await get('/index.html', 'gzip, deflate, br, zstd');
    assert.equal(plain.enc, null, 'a client that does not ask for compression gets the bytes raw');
    assert.equal(gz.enc, 'gzip', 'a client that asks gets gzip');
    assert.ok(/Accept-Encoding/i.test(gz.vary || ''), 'and the response varies on the request header');
    /* ⚠ GZIP EVEN THOUGH br WAS OFFERED — measured, Pages answers gzip to the same header */
    assert.ok(gz.len > 0 && gz.len < plain.len, `compressed ${gz.len} against raw ${plain.len} — it has to actually be smaller`);
    /* ⚠⚠ data/*.json.gz IS A GZIP-TYPED BODY, NOT A GZIP-ENCODED RESPONSE — js/gazetteer.js un-gzips it
       itself, so Content-Encoding would make the browser hand the client plain JSON */
    const g = await get('/data/gazetteer-world.json.gz', 'gzip, br');
    assert.equal(g.enc, null, 'the gazetteer is served as a gzip BODY, never as a gzip-ENCODED response');
    assert.equal(g.type, 'application/gzip');
    const head = new Uint8Array(g.body.slice(0, 2));
    assert.ok(head[0] === 0x1f && head[1] === 0x8b, 'and it still arrives as gzip bytes');
    /* ⚠ AND IT STILL DOES NOT SERVE ANYTHING ABOVE ITS ROOT — asserted from a SUBDIRECTORY ROOT, the only
       way to ask: `fetch` normalises `/../x` client-side, and at the repo root a surviving `..` lands on
       a file legitimately inside it. Rooted at tests/, package.json is genuinely outside. */
    const sub = serve(['--root', join(ROOT, 'tests')], 'the subdirectory server did not come up');
    try {
      const SUB = await sub.port;
      const inside = await fetch(`http://127.0.0.1:${SUB}/${basename(fileURLToPath(import.meta.url))}`);
      assert.equal(inside.status, 200, 'a file inside the served root is still served');
      for (const evil of ['/%2e%2e/package.json', '/%2e%2e%2f%2e%2e%2fpackage.json',
        '/data/%2e%2e/%2e%2e/package.json', '/..%5cpackage.json']) {
        const r = await fetch(`http://127.0.0.1:${SUB}${evil}`, { redirect: 'manual' });
        const body = r.status === 200 ? await r.text() : '';
        assert.ok(!/"name":\s*"intmap-ops"/.test(body),
          `${evil} returned ${r.status} and the repo's package.json — nothing may escape the served root`);
      }
    } finally { sub.proc.kill(); }
  } finally {
    srv.proc.kill();
  }
});

/* ═══ #R219 ⑪ THE RECORD LEADS WITH THE NEWEST ENTRY, AND THE STAMP AGREES ════════════════════════
   ⚠ (#R218 ③) NOT PINNED TO A ROUND: what this protects is «the newest entry is at the top», so it asks
   for the maximum. (2026-09-25) DEV-NOTES.md is the GENERATED index of dev-notes/ (scripts/dev-notes.mjs),
   asked through the one function every reader of «the newest record» uses; the stamp is written by the
   build from the commit (scripts/build-stamp.mjs), so «it agrees» means: not typed back in, and still
   filled by the build. */
test('R219 ⑪ DEV-NOTES leads with the newest round, and the build stamp agrees', async () => {
  const all = entries(ROOT);
  assert.ok(all.length > 3);
  assert.equal(latestEntry(ROOT).file, all[0].file, 'the newest record must lead');
  const legacy = all.filter((e) => e.kind === 'legacy').map((e) => e.round);
  for (let i = 1; i < legacy.length; i++) assert.ok(legacy[i] < legacy[i - 1], `newest-first: R${legacy[i]} follows R${legacy[i - 1]}`);
  const firstLink = /\]\(([^)]+)\)/.exec(renderIndex(ROOT).split('\n').find((l) => l.startsWith('- ')) || '');
  assert.equal(firstLink && firstLink[1], all[0].file, 'the generated index opens with the newest record');
  assert.deepEqual(await generatedStampProblems(read('index.html')), [], 'the build stamp can go stale again');
});
