/* ============================================================================
 *  atlas-delegation-efficiency — what made a turn re-try, and what made a delegated worker useless
 *  js/atlas-plan.js (stepState) · js/atlas-cap-web.js (web.fetchFile) · supabase/functions/ai-proxy (worker window)
 *  Measured on production 2026-11-25 (public.ai_delegation_journal):
 *    ① a step where one call failed and another completed was reported 「failed」 to the reader and to the model
 *    ② a file that downloaded but is not a dataset was reported 「unreadable」 and its bytes dropped: the model had it in hand and tried five more addresses
 *    ③ (worker window — see the second half)
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasPlan } = await import('../js/atlas-plan.js');
const { CAPABILITY_MODULES } = await import('../js/atlas-caps-modules.js');

const entry = (id) => Object.values(CAPABILITY_MODULES).flat().find((e) => e.row[0] === id);

function stepStateOf(states) {
  const P = makeAtlasPlan(); P.beginTurn();
  P.declare({ goal: 'g', steps: ['a'], current: 1 });
  states.forEach(([cap, state], i) => {
    P.started('c' + i, { step: 0, capability: cap });
    P.settled('c' + i, { capability: cap, ok: state === 'completed', status: state });
  });
  return P.snapshot().steps[0].state;
}

test('① a step where one call failed and another completed is 「partial」, not 「failed」', () => {
  assert.equal(stepStateOf([['web.fetchFile', 'failed'], ['web.browse', 'completed']]), 'partial');
  assert.equal(stepStateOf([['web.fetchFile', 'failed'], ['web.browse', 'failed']]), 'failed', 'every call failed: failed');
  assert.equal(stepStateOf([['web.fetchFile', 'completed'], ['web.browse', 'completed']]), 'completed');
  /* the same capability retried: the later answer replaces the earlier (unchanged) */
  assert.equal(stepStateOf([['web.fetchFile', 'failed'], ['web.fetchFile', 'completed']]), 'completed');
});

test('② a downloaded file the dataset reader refuses is read back to the model as text', async () => {
  const text = '{"route":[[-0.12,51.53],[2.35,48.88]]}';
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  window.SUPABASE_URL = 'https://x.test';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 200, json: async () => ({ ok: true, file: { b64, name: 'full.json', type: 'application/json', bytes: text.length, url: 'https://x.test/full.json', sha256: 'z' } }) });
  window.GeoJSONUpload = { handle: async () => [{ ok: false, why: 'unreadable' }] };
  const HOST = { DB: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } } };
  const K = { HOST, R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), L: (en) => en, esc: (x) => String(x), warn: (x) => x, note: (x) => x };
  try {
    const r = await entry('web.fetchFile').run({ url: 'https://x.test/full.json' }, { source: 'atlas' }, K);
    assert.equal(r.ok, false);
    assert.equal(r.meta.code, 'file_unreadable');
    assert.equal(r.exec.web.excerpt, text, 'the head of the file reaches the model');
    assert.equal(r.exec.web.excerptOf, text.length);
    assert.equal(r.exec.web.untrusted, true, 'and stays fenced as outside content');
  } finally { globalThis.fetch = realFetch; delete window.GeoJSONUpload; }
});

test('② a binary download carries no excerpt, a long one is cut at a page\'s worth', async () => {
  window.SUPABASE_URL = 'https://x.test';
  const realFetch = globalThis.fetch;
  const run = async (buf) => {
    globalThis.fetch = async () => ({ status: 200, json: async () => ({ ok: true, file: { b64: buf.toString('base64'), name: 'a.bin', type: 'application/octet-stream', bytes: buf.length, url: 'https://x.test/a', sha256: 'z' } }) });
    window.GeoJSONUpload = { handle: async () => [{ ok: false, why: 'unreadable' }] };
    const HOST = { DB: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } } };
    const K = { HOST, R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), L: (en) => en, esc: (x) => String(x), warn: (x) => x, note: (x) => x };
    return entry('web.fetchFile').run({ url: 'https://x.test/a' }, { source: 'atlas' }, K);
  };
  try {
    const bin = await run(Buffer.from([80, 75, 3, 4, 0, 0, 0, 1, 2, 3]));
    assert.equal(bin.exec.web.excerpt, undefined);
    const long = await run(Buffer.from('x'.repeat(20000)));
    assert.equal(long.exec.web.excerpt.length, 6000);
    assert.equal(long.exec.web.excerptOf, 20000);
  } finally { globalThis.fetch = realFetch; delete window.GeoJSONUpload; }
});
