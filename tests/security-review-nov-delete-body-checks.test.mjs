// security review N4 — delete-account reads its body under a byte cap and a deadline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const B = await import(pathToFileURL(join(ROOT, 'supabase/functions/delete-account/body.js')).href);
const CAP = 64;
const mk = (body, headers) => new Request('https://x.test/f', { method: 'POST', body, headers, duplex: 'half' });
const stream = (chunks, { hang = false } = {}) => new ReadableStream({
  start(c) { for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch)); if (!hang) c.close(); },
});

test('the legitimate 20-byte body is accepted', async () => {
  const r = await B.readDeleteConfirm(mk('{"confirm":"DELETE"}'), { maxBytes: CAP, deadlineMs: 1000 });
  assert.deepEqual(r, { ok: true, payload: { confirm: 'DELETE' } });
});

test('the client body fits the shipped cap with room to spare', () => {
  const src = readFileSync(join(ROOT, 'js/auth-ui.js'), 'utf8');
  assert.ok(src.includes("body:JSON.stringify({confirm:'DELETE'})"), 'the client body changed: re-derive DELETE_BODY_MAX_BYTES');
  assert.ok(JSON.stringify({ confirm: 'DELETE' }).length * 10 <= B.DELETE_BODY_MAX_BYTES);
});

test('exactly the cap is accepted, one more byte is too_large', async () => {
  const pad = (n) => '{"a":"' + 'x'.repeat(n - 8) + '"}';
  assert.equal(pad(CAP).length, CAP);
  assert.equal((await B.readDeleteConfirm(mk(pad(CAP)), { maxBytes: CAP, deadlineMs: 1000 })).ok, true);
  assert.deepEqual(await B.readDeleteConfirm(mk(pad(CAP + 1)), { maxBytes: CAP, deadlineMs: 1000 }), { ok: false, error: 'too_large' });
});

test('a streamed body with no Content-Length is counted by bytes actually read', async () => {
  const req = mk(stream(['{"a":"', 'x'.repeat(40), 'x'.repeat(40), '"}']));
  assert.equal(req.headers.get('content-length'), null);
  assert.deepEqual(await B.readDeleteConfirm(req, { maxBytes: CAP, deadlineMs: 1000 }), { ok: false, error: 'too_large' });
});

test('a Content-Length over the cap is refused early; a lying small one is still counted', async () => {
  const big = await B.readDeleteConfirm(mk('{"a":"' + 'x'.repeat(200) + '"}', { 'content-length': '215' }), { maxBytes: CAP, deadlineMs: 1000 });
  assert.equal(big.error, 'too_large');
  const lying = mk(stream(['{"a":"', 'x'.repeat(100), '"}']), { 'content-length': '20' });
  assert.equal(lying.headers.get('content-length'), '20');
  assert.equal((await B.readDeleteConfirm(lying, { maxBytes: CAP, deadlineMs: 1000 })).error, 'too_large');
});

test('a body that never finishes times out within the deadline and the reader is cancelled', async () => {
  let cancelled = false;
  const s = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"confirm"')); }, cancel() { cancelled = true; } });
  const t0 = Date.now();
  const r = await B.readDeleteConfirm(mk(s), { maxBytes: CAP, deadlineMs: 150 });
  const dt = Date.now() - t0;
  assert.deepEqual(r, { ok: false, error: 'timeout' });
  assert.ok(dt >= 140 && dt < 1000, 'returned after ' + dt + ' ms');
  await new Promise((r2) => setTimeout(r2, 20));
  assert.ok(cancelled, 'the source was not cancelled');
});

test('overflow cancels the source', async () => {
  let cancelled = false;
  const s = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('x'.repeat(CAP + 5))); }, cancel() { cancelled = true; } });
  assert.equal((await B.readDeleteConfirm(mk(s), { maxBytes: CAP, deadlineMs: 1000 })).error, 'too_large');
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(cancelled);
});

test('invalid JSON, null, array, primitive and an empty body are typed refusals', async () => {
  const run = (b) => B.readDeleteConfirm(mk(b), { maxBytes: CAP, deadlineMs: 1000 });
  assert.deepEqual(await run('{nope'), { ok: false, error: 'invalid_json' });
  assert.deepEqual(await run(''), { ok: false, error: 'invalid_json' });
  assert.deepEqual(await run('null'), { ok: false, error: 'not_object' });
  assert.deepEqual(await run('[1]'), { ok: false, error: 'not_object' });
  assert.deepEqual(await run('"DELETE"'), { ok: false, error: 'not_object' });
  assert.deepEqual(await run('7'), { ok: false, error: 'not_object' });
});

test('every refusal has a distinct stable HTTP status', () => {
  assert.equal(B.rejectionStatus('too_large'), 413);
  assert.equal(B.rejectionStatus('timeout'), 408);
  assert.equal(B.rejectionStatus('invalid_json'), 400);
  assert.equal(B.rejectionStatus('not_object'), 400);
});

test('index.ts refuses a rejected body before the admin check, the purge and the auth deletion', () => {
  const code = codeOnly(readFileSync(join(ROOT, 'supabase/functions/delete-account/index.ts'), 'utf8'));
  const at = (s) => code.indexOf(s);
  const read = at('readDeleteConfirm(req)');
  assert.ok(!/req\.json\(\)/.test(code), 'an unbounded req.json() is back');
  assert.ok(at('recentSignIn(') > 0 && at('recentSignIn(') < read, 're-auth must precede the body read');
  assert.ok(read > 0 && read < at('if (!body.ok) return json('), 'the result is not checked');
  assert.ok(at('if (!body.ok) return json(') < at('auth.admin.getUserById'));
  assert.ok(at('if (!body.ok) return json(') < at('delete_account_data'));
  assert.ok(at('if (!body.ok) return json(') < at('auth.admin.deleteUser'));
  assert.ok(at('if (!body.ok) return json(') < at('"DELETE"'), 'confirm check stays after');
  assert.match(code, /!== "DELETE"/);
});
