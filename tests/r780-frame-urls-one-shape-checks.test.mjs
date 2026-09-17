/* ============================================================================
 *  R780 — THE SECOND #R773 REGRESSION, STANDING RIGHT BEHIND THE FIRST
 * ----------------------------------------------------------------------------
 *  Measured on production 2026-09-17, on the build that had just shipped #R777's fix for #R773's
 *  OTHER regression. The bubble appeared — #R777's spec ⑦ presses send and checks exactly that —
 *  and then went red:
 *
 *      Cannot read properties of null (reading 'concat')
 *      turn: { status: 'error', operations: 0 }   ·   lastPlan: { steps: 0, toolCalls: 0 }
 *
 *  `makeViewCapture().urls()` returned `null` when no frame had been captured, and an ARRAY when
 *  one had. js/ai-core.js cannot tell those apart (`(imageDatas||[]).filter(Boolean)`), so the two
 *  shapes cost nothing for as long as it was the only reader. #R773 then gave that one call site a
 *  second source of images:
 *
 *      VFRAMES.urls().concat(_atlRecallImgs)
 *
 *  …and every turn that had not first called `look_at_map` — which is nearly every turn — threw
 *  before the first model call. Zero requests reached ai-proxy.
 *
 *  ⚠ WHY #R777's SPEC DID NOT CATCH IT. It measures that `run()` reaches its own bubble, and the
 *  login gate sits BETWEEN the bubble and `_model` — so an unauthenticated browser run stops one
 *  step short of the line that throws, every time. That is not a flaw anybody should have seen
 *  coming; it is the reason this file measures the SHAPE instead, where no login is needed.
 *
 *  ⚠ AND THE FIX IS THE SHAPE, NOT A GUARD AT THE CALLER. A `||[]` at the call site leaves the next
 *  reader to find this out for itself (#R429's shape). `frames.length` already answers 「are there
 *  any」, so the function does not need a second way to say it.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* the real module, evaluated — not read (#R505: a check that reads source cannot see behaviour) */
const { makeViewCapture } = await import(pathToFileURL(join(ROOT, 'js/atlas-view-capture.js')).href);

function capture() {
  /* the dependencies it actually reaches for; none of them are touched by urls()/reset() */
  return makeViewCapture({
    HOST: {}, GE: () => null, L: (en) => en, esc: (s) => String(s),
    note: (s) => s, warn: (s) => s, R: (ok, html) => ({ ok: !!ok, html: html || '' }),
  });
}

test('R780 ① urls() is an array before any frame exists, not null', () => {
  const V = capture();
  const before = V.urls();
  assert.ok(Array.isArray(before),
    'urls() returned ' + JSON.stringify(before) + ' with no frames captured. Its one reader now does '
    + '`.concat()` on it (js/atlas-console.js, the `_model` closure), so a second shape is a turn that '
    + 'dies before the first model call — measured in production.');
  assert.equal(before.length, 0, 'no frames means no urls');
});

test('R780 ② …and after reset(), which is what every turn starts with', () => {
  const V = capture();
  V.reset();
  const after = V.urls();
  assert.ok(Array.isArray(after) && after.length === 0,
    'reset() put urls() back into the shape that threw: ' + JSON.stringify(after));
  /* the turn prologue calls reset() and then, on the first model call, concat()s the result */
  assert.doesNotThrow(() => V.urls().concat(['data:image/png;base64,x']),
    'the exact expression js/atlas-console.js evaluates on every turn');
});

test('R780 ③ the kernel still combines the two image sources (the reason the shape matters)', () => {
  const src = read('js/atlas-console.js');
  assert.ok(/VFRAMES\.urls\(\)\.concat\(/.test(src),
    'the call site changed — if the two sources are no longer combined, say so here and re-derive ①②; '
    + 'if a `||[]` guard was added at the caller instead, that is the fix this round refused (#R429)');
});
