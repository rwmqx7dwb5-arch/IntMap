/* host-narrow-deps — a factory is handed the IM_HOST members it reads, and the list is its contract.
   ① hostSlice() is a live, narrow view (never a snapshot, setter only where HOST has one, unknown member = error).
   ② every `factory(hostSlice(IM_HOST, [...]))` in js/app-body.js lists EXACTLY the members the factory's
      own source reads — derived from that source, so the list cannot under- or over-declare.
   ③ a sliced factory never reads HOST any other way (no `HOST[...]`, no passing it on, no destructuring),
      which is what makes ② a complete statement of what it can reach.
   ④ the whole-shell register (scripts/global-surface.mjs hostWhole) and the slice sites are disjoint. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostSlice } from '../js/host-slice.js';
import { wholeHostFactories } from '../scripts/global-surface.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const APP = read('js/app-body.js');

test('hostSlice: live accessors, narrow, writable only where HOST is', () => {
  let lang = 'en', mode = 'a';
  const HOST = { get lang() { return lang; }, get mode() { return mode; }, set mode(v) { mode = v; }, get other() { return 1; } };
  const s = hostSlice(HOST, ['lang', 'mode']);
  assert.deepEqual(Object.keys(s).sort(), ['lang', 'mode']);
  assert.equal(s.lang, 'en');
  lang = 'jp';
  assert.equal(s.lang, 'jp', 'a snapshot would still say en');
  s.mode = 'b';
  assert.equal(mode, 'b', 'the setter of a writable member reaches HOST');
  assert.throws(() => { 'use strict'; s.lang = 'x'; }, TypeError, 'a read-only member stays read-only');
  assert.equal(s.other, undefined, 'a member that was not listed is not reachable');
  assert.throws(() => hostSlice(HOST, ['nope']), /no member "nope"/);
});

/* every sliced call site in app-body.js: callee, the listed members */
const SITES = [...APP.matchAll(/\b([A-Za-z_$][\w$]*)\(hostSlice\(IM_HOST,\s*\[([^\]]*)\]\)/g)].map((m) => ({
  callee: m[1],
  listed: m[2].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean),
}));

function importedFile(callee) {
  for (const m of APP.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([\w.-]+\.js)'/g)) {
    for (const part of m[1].split(',')) if (part.trim().split(/\s+as\s+/).pop() === callee) return 'js/' + m[2];
  }
  return null;
}

test('there are slice call sites to check', () => {
  assert.ok(SITES.length >= 20, 'found ' + SITES.length);
});

for (const { callee, listed } of SITES) {
  test(`${callee}: the slice lists what the factory reads, and nothing else is reachable`, () => {
    const file = importedFile(callee);
    assert.ok(file, callee + ' is imported by js/app-body.js');
    const src = read(file);
    const fm = src.match(new RegExp('export function ' + callee + '\\((\\w+)'));
    assert.ok(fm, callee + ' is an exported function of ' + file);
    const p = fm[1];
    const read_ = [...new Set([...src.matchAll(new RegExp('\\b' + p + '\\.(\\w+)', 'g'))].map((x) => x[1]))].sort();
    assert.deepEqual([...listed].sort(), read_, `${file}: hostSlice list vs ${p}.<member> reads`);
    assert.deepEqual(listed, [...listed].sort(), 'the list is sorted');
    const whole = (src.match(new RegExp('\\b' + p + '\\b(?!\\.)', 'g')) || []).length;
    assert.equal(whole, 1, `${file}: ${p} is used only as member reads (the one bare occurrence is the parameter)`);
  });
}

test('a factory is either sliced or on the whole-shell register, never both', () => {
  const whole = new Set(wholeHostFactories(ROOT));
  for (const { callee } of SITES) assert.ok(!whole.has(callee), callee + ' is sliced AND still handed IM_HOST whole somewhere');
});
