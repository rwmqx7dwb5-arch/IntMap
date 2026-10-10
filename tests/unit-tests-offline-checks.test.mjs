/* tests/unit-tests-offline-checks.test.mjs — (unit-tests-offline) the node regression suite does not reach
   another host, and a file that must says why in itself.

   MEASURED 2026-10-10: a CI «Regression» shard went red after 45.8 s on `geoBoundaries HTTP 504 … after 3
   attempts` in tests/hist-recon-expand-checks.test.mjs — a claim about the dossier checker's cache that needed
   no network, made by running a CLI that fetched catalogues. The runner (scripts/test-checks.mjs) now preloads
   tests/helpers/offline.mjs into every process of the suite. These checks run the RUNNER on throwaway files,
   so they see what CI's shards see — not a guard imported by hand. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* the hosts below are reserved (RFC 2606 .invalid): if the guard were missing the probes would fail on DNS,
   never reach anybody, and still be red — the assertion is on the guard's own words */
const FILES = {
  'fetch.test.mjs': `import test from 'node:test'; import assert from 'node:assert/strict';
test('fetch to another host is refused, by name', async () => { await assert.rejects(fetch('https://example.invalid/x'), /no-network: fetch https:\\/\\/example\\.invalid\\/x/); });`,
  'socket.test.mjs': `import test from 'node:test'; import assert from 'node:assert/strict'; import https from 'node:https';
test('a socket under https is refused', async () => { await assert.rejects(new Promise((res, rej) => { try { https.get('https://example.invalid/', res).on('error', rej); } catch (e) { rej(e); } }), /no-network: connect example\\.invalid:443/); });`,
  'spawned.test.mjs': `import test from 'node:test'; import assert from 'node:assert/strict'; import { execFileSync, spawnSync } from 'node:child_process';
test('a node script a test spawns is refused too (the shape of the geoBoundaries 504)', () => {
  const o = execFileSync(process.execPath, ['-e', "fetch('https://example.invalid/').then(()=>console.log('reached'),(e)=>console.log(e.message))"], { encoding: 'utf8' });
  assert.match(o, /no-network: fetch/);
});
test('a network client that is not node is refused; a local clone is not', () => {
  assert.throws(() => spawnSync('curl', ['-s', 'https://example.invalid/']), /no-network: child_process\\.spawnSync curl/);
  assert.throws(() => execFileSync('git', ['clone', 'https://example.invalid/x.git', 'x']), /no-network: child_process\\.execFileSync git clone/);
  const r = spawnSync('git', ['--version'], { encoding: 'utf8' });
  assert.equal(r.error, undefined);
});
test('loopback stays open', async () => {
  await assert.rejects(fetch('http://127.0.0.1:9/'), (e) => !/no-network/.test(String(e && e.message)));
});`,
  'allowed.test.mjs': `/* network-allowed: the probe of the exemption itself — it asserts the reason reaches the process and what it spawns */
import test from 'node:test'; import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process';
test('an exempt file carries its reason, and so do its children', () => {
  assert.match(process.env.INTMAP_NETWORK_ALLOWED, /probe of the exemption/);
  assert.match(execFileSync(process.execPath, ['-e', 'console.log(process.env.INTMAP_NETWORK_ALLOWED)'], { encoding: 'utf8' }), /probe of the exemption/);
});`,
  'notallowed.test.mjs': `/* network-allowed: x */
import test from 'node:test'; import assert from 'node:assert/strict';
test('a marker without a reason is not an exemption', async () => {
  assert.equal(process.env.INTMAP_NETWORK_ALLOWED, undefined);
  await assert.rejects(fetch('https://example.invalid/'), /no-network/);
});`,
};

test('the regression runner refuses other hosts in every file and every node script it starts; an exemption is a stated reason', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-offline-'));
  try {
    for (const [n, s] of Object.entries(FILES)) fs.writeFileSync(path.join(dir, n), s + '\n');
    const env = { ...process.env, IM_CHECKS_GLOB: path.join(dir, '*.test.mjs') };
    /* NODE_TEST_CONTEXT must not reach the nested runner (tests/process-test-tiers-and-shards-checks.test.mjs has why);
       nor may this file's own preload or exemption — the runner must supply the guard itself */
    delete env.NODE_TEST_CONTEXT; delete env.NODE_OPTIONS; delete env.INTMAP_NETWORK_ALLOWED; delete env.INTMAP_OFFLINE_TEST;
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'test-checks.mjs')], { cwd: ROOT, encoding: 'utf8', env });
    const out = (r.stdout || '') + (r.stderr || '');
    const pass = /^(?:#|ℹ) pass (\d+)\s*$/m.exec(out), fail = /^(?:#|ℹ) fail (\d+)\s*$/m.exec(out);
    assert.ok(pass, 'the probe could not run its own fixtures — this check is blind, fix it rather than deleting it\n' + out.slice(-2000));
    assert.equal(Number(fail[1]), 0, out.slice(-4000));
    assert.equal(Number(pass[1]), 7, out.slice(-2000));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
