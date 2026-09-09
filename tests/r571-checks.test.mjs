/* ============================================================================
 *  R571 — the World Heritage source has ONE writer
 * ----------------------------------------------------------------------------
 *  #R567 shipped the layer and its production verification found this: changing the interface
 *  language a second time left the map drawing the FIRST language's names. Measured on
 *  https://rwmqx7dwb5-arch.github.io/IntMap/ —
 *
 *    · `__imWhsLayer.locale()`, `__imWhsLayer.fc()` and the style's own
 *      `sources['whs-src'].data` were all correct for the new language;
 *    · `queryRenderedFeatures` / `querySourceFeatures` kept returning the old one, through
 *      66 seconds of polling, a `triggerRepaint()` and a jump to another continent and back;
 *    · ONE hand-made `getSource('whs-src').setData(__imWhsLayer.fc())` — the same data — fixed it
 *      in under four seconds.
 *
 *  So the payload was never wrong. What was wrong is that a language change put FIVE
 *  `setSourceData` calls into ONE tick (the lang listener rebuilds; the relabel moves the style,
 *  which runs the basemap self-heal; the self-heal calls whsLoad(), which writes again), and the
 *  geojson worker does not survive that burst.
 *
 *  ⚠ THE PROPERTY IS «ONE WRITER», NOT «FEWER CALLS». Each of those four places is right to want
 *  the source refreshed; none of them can know whether another is about to ask in the same tick.
 *  So the check below is structural: nothing in js/beta-overlays.js may write to `whs-src` except
 *  the single coalescing function, and that function must both defer (so a tick collapses to one
 *  write) and skip a repeat of the collection it last wrote.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'js', 'beta-overlays.js');

/* ⚠ THE PROSE IS NOT THE CODE. The note above the writer spells the call it replaced, so a raw
   grep answers «yes» to the explanation of the defect (this repository has paid for that nine
   times — docs/TESTING.md). scripts/code-only.mjs blanks comments and strings first. */
const src = readFileSync(FILE, 'utf8');
const code = codeOnly(src);
const ast = parse(code, { ecmaVersion: 2022, sourceType: 'module' });

function writesTo(sourceId) {
  const hits = [];
  walk.ancestor(ast, {
    CallExpression(node, _state, ancestors) {
      const c = node.callee;
      const name = c.type === 'MemberExpression' && !c.computed ? c.property.name : null;
      if (name !== 'setSourceData' && name !== 'setData') return;
      const first = node.arguments[0];
      /* setSourceData('whs-src', …) — and setData(…) on a source that was fetched by that id */
      const idArg = first && first.type === 'Literal' && first.value === sourceId;
      if (!idArg) return;
      /* which function does this call sit in? */
      const fn = ancestors.slice().reverse().find((a) =>
        a.type === 'FunctionDeclaration' || a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression');
      hits.push({ node, fn });
    },
  });
  return hits;
}

test('R571 ① exactly one place in js/beta-overlays.js writes the World Heritage source', () => {
  const hits = writesTo('whs-src');
  assert.equal(hits.length, 1,
    `${hits.length} call(s) write whs-src — a language change already put five of them in one tick, `
    + 'and the map stopped following. Every caller must go through the coalescing writer.');
});

test('R571 ② that writer defers, so a tick’s worth of asks becomes one write', () => {
  /* deferring is the half that fixes the burst: without it, five callers in one tick are still
     five writes however carefully each one is guarded. */
  const hits = writesTo('whs-src');
  const [{ node }] = hits;
  /* the write must sit inside a callback handed to a scheduler, not run inline in whsPush */
  const inCallback = (() => {
    let found = false;
    walk.ancestor(ast, {
      CallExpression(n, _s, anc) {
        if (n !== node) return;
        found = anc.some((a) => (a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression')
          && anc.some((b) => b.type === 'CallExpression' && b.arguments.includes(a)));
      },
    });
    return found;
  })();
  assert.ok(inCallback, 'the whs-src write runs inline — a tick with five askers still makes five writes');
});

test('R571 ③ …and it skips a repeat of the collection it last wrote', () => {
  /* the second half: a caller that asks again with the SAME object (whsLoad’s early return, the
     self-heal after a basemap swap) must not produce a write at all. whsBuild() makes a new object
     for every genuine rebuild, so identity is the right question to ask. */
  let guarded = false;
  walk.simple(ast, {
    FunctionDeclaration(fn) {
      if (fn.id && fn.id.name === 'whsPush') {
        const body = code.slice(fn.start, fn.end);
        guarded = /whsWrote\s*===\s*whsFC/.test(body) && /whsWrote\s*=\s*whsFC/.test(body);
      }
    },
  });
  assert.ok(guarded,
    'whsPush does not compare against, and record, the collection it last wrote — a repeat of the '
    + 'same object would still reach the renderer');
});

test('R571 ④ a re-created source forgets what was written to the old one', () => {
  /* ⚠ the skip in ③ is a claim about what the RENDERER holds. addSource makes a new source that
     holds nothing this module wrote, so the memory has to be dropped there or the first write
     after a basemap swap is skipped and the layer comes back empty. */
  const i = code.indexOf("addSource('whs-src'");
  assert.ok(i > 0, 'the layer no longer creates whs-src under that name');
  const before = code.slice(Math.max(0, i - 400), i);
  assert.match(before, /whsWrote\s*=\s*null/,
    'whsWrote is not cleared when whs-src is re-created — after a basemap swap the first write '
    + 'would be skipped and the layer would come back empty');
});
