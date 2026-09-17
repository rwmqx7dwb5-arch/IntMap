/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  R776 — 「Atlasに聞く」 from a reading surface arrives ON the thing being read
 *
 *  THE DEFECT, restated as the defect and not as the fix (memory: restate-the-defect-not-the-fix):
 *  the reading surface's «Ask Atlas» — the bar built once in js/article-reader.js `readerBar()` and
 *  worn by BOTH the article reader and the Event detail — called `IntMapAtlas.call('open')`. Pressing
 *  it switched the tab and nothing else: the console opened on its generic intro, and a reader who
 *  had a headline in front of them had to type that headline back in before Atlas could be asked
 *  anything. The subject was never missing — `window._imReader` has carried it since #R430 and
 *  `_selectionState()` reads it — so the console could already have answered 「この記事の背景は？」.
 *  What was missing was any sign, at the moment of arrival, that it could.
 *
 *  ⚠ The map's right-click «Ask Atlas» (`askHere`) has arrived on its subject since #R392. Two
 *    buttons with the same label behaved differently because the arrival was written inside one of
 *    them. These checks measure the four facts that keep them from drifting again.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* Pull one top-level `function <name>(` block out of a source file by matching braces. The checks
   below RUN it (#R505: a check that only reads source cannot see what the code decides). */
function extractFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `${name}() not found`);
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, j + 1); }
  }
  throw new Error(`${name}() has no closing brace`);
}

const ATLAS = read('js/atlas-console.js');
/* ⚠ The arrival lives in its own module because the kernel is under a shrink-only line ceiling and
   was sitting ONE line below it — writing this inside js/atlas-console.js measured 4,964 lines and
   turned five checks red. The rule beside that ceiling is «a feature moves out, never the ceiling
   up», so the subject of ①②③ is this file. */
const READING = read('js/atlas-reading.js');

/* ── 1. The starters are DERIVED from the item, not a fixed trio ──────────────────────────────
   #R392 took fixed sentences out of askHere because the most subject-specific gesture there is was
   opening with the same question for Hormuz, Baikal and empty Gobi. The reading surface's arrival
   must not reintroduce them: an item with a place, an item without one, an event with a body and a
   bare article have different things they can usefully be asked about. */
function starters(rd, langIndex) {
  const L = (...a) => a[langIndex];
  // eslint-disable-next-line no-new-func
  const fn = new Function('L', extractFn(READING, 'readingStarters') + '; return readingStarters;')(L);
  return fn(rd);
}

test('R776 ① the reading starters differ with what the item actually has', () => {
  const bare = starters({ kind: 'article', title: 'T' }, 0);
  const placed = starters({ kind: 'article', title: 'T', place: 'Gaza' }, 0);
  const evented = starters({ kind: 'event', title: 'T', place: 'Gaza', body: 'x' }, 0);

  for (const s of [bare, placed, evented]) {
    assert.ok(Array.isArray(s) && s.length >= 2 && s.length <= 3, `expected 2–3 starters, got ${JSON.stringify(s)}`);
    for (const q of s) assert.ok(q && typeof q === 'string' && q.trim(), 'a starter is empty');
  }
  /* the three shapes must not be the same three sentences */
  assert.notDeepEqual(bare, placed, 'an item WITH a place gets the same starters as one without');
  assert.notDeepEqual(placed, evented, 'a clustered event with sources gets the same starters as a bare article');
  /* an item with no place must not be offered a question about one */
  assert.ok(!bare.some((q) => /\{p\}/.test(q)), 'an unsubstituted {p} placeholder reached a starter');
  assert.ok(placed.some((q) => q.includes('Gaza')), 'the place the item carries is never named in a starter');
  assert.ok(!bare.some((q) => q.includes('Gaza')), 'a place leaked into an item that has none');
});

test('R776 ② the substitution is done in every language, not only English', () => {
  /* ⚠ a `.replace('{p}', …)` applied to the English string only would leave 「{p} を地図で見せて」 on
     screen for eight of the nine languages — the failure shape of a translated sentence whose
     assembly is written once against one of its translations. */
  for (let lang = 0; lang < 5; lang++) {
    const s = starters({ kind: 'article', title: 'T', place: 'Gaza' }, lang);
    assert.ok(!s.some((q) => /\{p\}/.test(q)), `language index ${lang} kept an unsubstituted {p}: ${JSON.stringify(s)}`);
    assert.ok(s.some((q) => q.includes('Gaza')), `language index ${lang} dropped the place name`);
  }
  /* and the languages are actually different sentences, not the English one nine times */
  assert.notDeepEqual(starters({ kind: 'event', title: 'T', body: 'x' }, 0),
    starters({ kind: 'event', title: 'T', body: 'x' }, 1), 'jp starters are identical to en');
});

/* ── 2. One arrival builder, not two ──────────────────────────────────────────────────────────
   The defect existed because «arrive naming the subject» lived INSIDE askHere. If a second copy of
   the chip markup appears, the two entries can disagree again — and the next surface to want an
   arrival will copy one of them rather than call it. */
test('R776 ③ the arrival bubble is built in exactly one place', () => {
  /* across BOTH files: a copy left behind in the kernel would be just as much a second copy */
  const chipMarkup = (ATLAS + READING).split('class="atl-here-q"').length - 1;
  assert.equal(chipMarkup, 1, `the starter-chip markup appears ${chipMarkup} times; it is built once, by _arrive()`);
  const wiring = (ATLAS + READING).split(".querySelectorAll('.atl-here-q')").length - 1;
  assert.equal(wiring, 1, 'the chip click wiring has more than one copy');
  for (const caller of ['function arrive(', 'function askReading(']) assert.ok(READING.includes(caller), `${caller} is gone`);
  assert.ok(ATLAS.includes('function askHere'), 'askHere is gone');
  assert.ok(ATLAS.includes('makeAtlasReading('), 'the kernel no longer builds the arrival module');
  /* askHere must be a CALLER of the shared builder, not its own copy again */
  const here = extractFn(ATLAS, 'askHere');
  assert.ok(here.includes('.arrive('), 'askHere stopped using the shared arrival');
  assert.ok(!here.includes('class="atl-here-q"'), 'askHere grew its own chip markup back');
});

/* ── 3. The route from the reading surface carries the subject ─────────────────────────────────
   ⚠ `askReading` opens the console itself and returns false when nothing is being read, so the
   reading surface has no second plan to keep in step. That is the point of checking BOTH ends: a
   kernel method nobody calls, and a caller naming a method the kernel does not export, look the same
   from either side alone (memory: contract-reached-only-from-one-side). */
test('R776 ④ the reading surface asks for the reading arrival, and the kernel exports it', () => {
  const reader = read('js/article-reader.js');
  const fn = extractFn(reader, 'askAtlasAboutReading');
  assert.ok(fn.includes("call('askReading')"), 'the reading surface no longer asks Atlas for the reading arrival');
  assert.ok(!fn.includes("call('open')"), "the reading surface is back to `call('open')` — a tab switch and nothing else");
  /* the kernel's public API object actually offers it */
  const api = ATLAS.slice(ATLAS.lastIndexOf('return { open, toggle,'));
  /* ⚠ the kernel must also still be able to REACH it — an export naming a method the module does not
     define, and a module method nobody exports, look the same from either side alone. */
  assert.ok(READING.includes('return { arrive, askReading'), 'js/atlas-reading.js stopped exporting the arrival');
  assert.ok(/\baskReading\b/.test(api.slice(0, api.indexOf('};'))), 'askReading is not on the console\'s public API');
  /* and the fallback for a press with nothing open still exists */
  assert.ok(fn.includes('IntMapConsole'), 'the no-kernel fallback route is gone');
});

/* ── 4. Every writer of the bridge carries `kind` ──────────────────────────────────────────────
   ⚠ memory: object-built-twice — a field written by only one of an object's builders evaporates for
   the others. The writers are DISCOVERED here, not listed: a fourth surface that starts feeding the
   bridge is measured the day it is added, which a hand-written list of three would not be. */
test('R776 ⑤ every window._imReader writer declares what kind of thing is being read', () => {
  const files = ['js/article-reader.js', 'js/news-ui.js', 'js/news-events.js'];
  let found = 0;
  for (const f of files) {
    const src = read(f);
    const re = /window\._imReader\s*=\s*\{/g;
    let m;
    while ((m = re.exec(src))) {
      found++;
      /* the literal runs to the matching brace */
      let depth = 0, end = -1;
      for (let j = src.indexOf('{', m.index); j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
      }
      const lit = src.slice(m.index, end + 1);
      assert.ok(/\bkind\s*:/.test(lit), `a window._imReader literal in ${f} has no kind: ${lit.slice(0, 120)}`);
      assert.ok(/'(article|event)'/.test(lit), `a window._imReader literal in ${f} declares a kind that is neither article nor event`);
    }
  }
  assert.ok(found >= 3, `expected at least the three known bridge writers, found ${found}`);
  /* and the state the model reads passes it on — a field the writers fill and the reader drops is
     the same defect one level down */
  assert.ok(/o\.article=\{\s*kind:/.test(ATLAS), '_selectionState() builds o.article without kind');
});
