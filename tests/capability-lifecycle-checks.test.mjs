/* ============================================================================
 *  IntMap · the capability lifecycle — dispose is not the end, and dispose leaves nothing behind
 * ----------------------------------------------------------------------------
 *  (Moved from tests/r322-checks.test.mjs ⑤–⑧, by topic. The census half of that round — whose
 *   header below describes both halves — is tests/command-census-checks.test.mjs.)
 *
 *  From #R322's header:
 *    ⑤–⑥ the lifecycle is EXECUTED too — js/runtime.js is a real ES module, so `dispose` followed
 *       by `activate` can simply be run. #R322 found that pair broken (the register deleted the
 *       definition), and a check that reads the source would have been satisfied by the old code.
 *    ⑦–⑧ every capability that was connected this round can be given back AND asked for again.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ⚠ comments in this repository QUOTE the spellings they replaced, so a raw grep proves nothing —
   the mistake has been made eight times (see #R313's note). Everything below reads `code()`. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}


/* ── ⑤–⑥ the lifecycle, executed ───────────────────────────────────────────── */
async function freshRuntime() {
  /* the register touches window / document / rAF through guards or through functions called later;
     supplying them here is what lets the state machine be RUN rather than read. */
  const g = globalThis;
  const had = { w: g.window, d: g.document, r: g.requestAnimationFrame, c: g.cancelAnimationFrame, i: g.requestIdleCallback };
  g.window = g.window || {};
  g.document = g.document || { addEventListener() { }, hidden: false };
  g.requestAnimationFrame = g.requestAnimationFrame || (() => 0);
  g.cancelAnimationFrame = g.cancelAnimationFrame || (() => { });
  const { makeRuntime } = await import('../js/runtime.js');
  const rt = makeRuntime({});
  return { rt, restore() { g.window = had.w; g.document = had.d; g.requestAnimationFrame = had.r; g.cancelAnimationFrame = had.c; g.requestIdleCallback = had.i; } };
}

test('R322 ⑤ a capability that has been disposed can be opened again', async () => {
  const { rt, restore } = await freshRuntime();
  try {
    const seen = [];
    rt.define('t.cap', {
      load: () => { seen.push('load'); return 'V'; },
      activate: () => seen.push('activate'),
      suspend: () => seen.push('suspend'),
      dispose: () => seen.push('dispose'),
    });
    await rt.activate('t.cap');
    assert.equal(rt.stateOf('t.cap'), 'active');
    rt.dispose('t.cap');
    assert.equal(rt.stateOf('t.cap'), 'disposed',
      'the definition must survive dispose — deleting it is what made a second open impossible');
    await rt.activate('t.cap');
    assert.equal(rt.stateOf('t.cap'), 'active', 'activate after dispose must bring the capability back');
    /* dispose() suspends first, deliberately: whatever it releases must not be undone by a task of
       its own that was already queued for this frame (js/runtime.js). */
    assert.deepEqual(seen, ['load', 'activate', 'suspend', 'dispose', 'load', 'activate'],
      'the re-open must re-run load: the memo that made load idempotent has to be dropped by dispose');
  } finally { restore(); }
});

test('R322 ⑥ dispose sweeps every register a capability can have put work into — idle included', async () => {
  const { rt, restore } = await freshRuntime();
  try {
    let ran = 0;
    rt.define('t.idle', { activate: () => { }, dispose: () => { } });
    await rt.activate('t.idle');
    rt.idle('t.idle.task', () => { ran++; }, { capability: 't.idle' });
    rt.onCamera('t.idle.cam', () => { }, { capability: 't.idle' });
    rt.every('t.idle.timer', 1000, () => { }, { capability: 't.idle' });
    const before = rt.stats();
    assert.ok(before.timers >= 1 && before.camera >= 1, 'the capability registered work to be swept');
    rt.dispose('t.idle');
    const after = rt.stats();
    assert.equal(after.timers, 0, 'a disposed capability must not leave a timer behind');
    assert.equal(after.camera, 0, 'a disposed capability must not leave a camera subscriber behind');
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(ran, 0,
      'the idle queue was not swept: a disposed capability ran a task against resources it had just released');
  } finally { restore(); }
});

/* ── ⑦ the two worker clients can give the thread back, and be asked again ───── */
for (const [file, what] of [['src/tsunami-worker-client.js', 'tsunami'], ['src/sat-worker-client.js', 'satellite tiles']]) {
  test(`R322 ⑦ the ${what} worker client has a public way to give the thread back`, () => {
    /* spelling kept — a Web Worker cannot be constructed in Node; terminate / clear / re-arm are read from dispose() */
    const src = code(read(file));
    assert.ok(/\bdispose\s*\(\s*\)\s*\{/.test(src), `${file} has no public dispose — the worker outlives every close`);
    const at = src.indexOf('dispose()');
    const body = src.slice(at, src.indexOf('state:', at) > at ? src.indexOf('state:', at) : at + 900);
    assert.ok(/\.terminate\(\)/.test(body), `${file}: dispose must actually terminate the worker`);
    assert.ok(/\.clear\(\)/.test(body), `${file}: dispose must settle and drop the pending jobs — a promise whose worker was terminated under it never resolves`);
    assert.ok(/tried\s*=\s*false/.test(body), `${file}: dispose must allow a new worker to be built, or the feature is dead for the rest of the tab`);
    /* …and the crash path must NOT do that: a worker that just died should not be respawned in a loop */
    const err = src.slice(src.indexOf('onerror'), src.indexOf('onerror') + 320);
    assert.ok(!/tried\s*=\s*false/.test(err), `${file}: the crash path must stay one-way — only an explicit dispose may re-arm it`);
  });
}

/* ── ⑧ every capability connected this round can be suspended AND given back ─── */
test('R322 ⑧ every capability defined in js/ supplies all three verbs and a public dispose', () => {
  /* spelling kept — the three definitions sit inside map-host modules (weather, tsunami, live satellites) that cannot run in Node; the verbs are read from each define() object, whose lifecycle ⑤–⑥ runs for real */
  const files = ['js/weather.js', 'js/tsunami.js', 'js/satellites-live.js'];
  const found = [];
  for (const f of files) {
    const src = code(read(f));
    /* ⚠ the definition object contains arrow bodies with their own braces (`activate:(o)=>open(o||{})`),
       so a lazy `[\s\S]*?}` stops inside one and reports a verb as missing that is plainly there.
       Match the braces instead of guessing where the object ends. */
    const re = /\.define\(\s*'([\w.]+)'\s*,\s*\{/g;
    let m;
    while ((m = re.exec(src))) {
      const name = m[1];
      let i = src.indexOf('{', m.index + m[0].length - 1), depth = 0, end = -1;
      for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (!depth) { end = i; break; } }
      }
      assert.ok(end > 0, `${f}: could not find the end of the definition for "${name}"`);
      const def = src.slice(m.index + m[0].length, end);
      found.push(name);
      for (const verb of ['activate', 'suspend', 'dispose']) {
        assert.ok(new RegExp('\\b' + verb + '\\s*:').test(def),
          `${f}: capability "${name}" has no ${verb} — a lifecycle missing a verb is the register knowing less than the feature`);
      }
    }
    assert.ok(/\bdispose\s*:/.test(src),
      `${f} defines a capability but publishes no dispose on its own API — the only door to it would be the register`);
  }
  assert.deepEqual(found.sort(), ['sat.live', 'sim.tsunami', 'wx.wind'],
    'the three capabilities this round connected are the three that are defined');
});
