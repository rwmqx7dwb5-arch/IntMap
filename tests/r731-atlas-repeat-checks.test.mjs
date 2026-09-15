/* ============================================================================
 *  #R731 — the same call, made again after its own answer was handed back, is not progress
 * ----------------------------------------------------------------------------
 *  Measured on production (2026-09-15, 「ISSは今どこ？次に東京の上空を通るのはいつ？」, gpt-5.6-sol):
 *  the model was handed the full satellite result AND the note 「this turn has ALREADY made this
 *  exact call — use this result」, and replied with the identical call seven more times, each with
 *  turn:"continuing", until the step budget ran out; the forced final came back as a JSON turn too.
 *  The reader got result rows and no sentence, after 46 s.
 *
 *  Two consecutive steps made only of reused calls is the earliest moment the loop can KNOW that
 *  nothing new is coming: the turn then stops calling and goes to the answer (`stopped:
 *  'repeated_calls'`). A call that asks anything different is not counted — nothing is taken from
 *  Atlas (CONSTITUTION.md §5). And when even the forced final says nothing, the console writes one
 *  sentence of its own saying what happened.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();
const same = { text: '計算します。', toolCalls: [{ id: 'a', name: 'run_capability', arguments: { id: 'layers.satellites', args: { name: 'ISS', place: 'Tokyo' } } }], turnState: 'continuing' };

async function turn(script) {
  const ran = [];
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS,
    runAction: async (action) => { ran.push(action); return { ok: true, html: '<div>✓ ISS — next pass 16:24, max 74°</div>', meta: { status: 'completed', produced: ['map'] } }; } });
  const tools = surface.baseTools();
  const seen = [];
  let i = 0;
  const model = async (req) => { seen.push(req); const r = script[Math.min(i, script.length - 1)]; i++; return typeof r === 'function' ? r(req) : r; };
  const out = await AGENT.runTurn({ model, tools, execute: surface.makeExecute(tools, AGENT), system: 'sys', messages: [{ role: 'user', content: 'ISSは今どこ？' }] });
  return { out, ran, seen };
}

test('R731 ① a turn that repeats its own answered call stops after two identical steps and goes to the answer', async () => {
  const { out, ran, seen } = await turn([same, same, same, same, same, same, same, same, { text: '', toolCalls: [], final_text: '' }]);
  assert.equal(out.stopped, 'repeated_calls');
  assert.equal(ran.length, 1, 'the tool ran once; the reuse answered the rest');
  const finals = seen.filter((r) => r && r.final);
  assert.equal(finals.length, 1, 'one forced final was asked for');
  assert.ok(seen.length <= 4, 'model calls: ' + seen.length + ' (was 9)');
});

test('R731 ② a step that asks something different resets the count — nothing is taken from a turn that moves', async () => {
  const other = { text: '', toolCalls: [{ id: 'b', name: 'run_capability', arguments: { id: 'layers.satellites', args: { name: 'HST', place: 'Tokyo' } } }], turnState: 'continuing' };
  const { out, ran } = await turn([same, same, other, { text: 'done', toolCalls: [] }]);
  assert.equal(out.stopped, 'answered');
  assert.equal(ran.length, 2, 'ISS once, HST once');
  assert.equal(out.text, 'done');
});

/* ⚠ (#R740) THIS USED TO PIN THE SPELLING OF THE EXPRESSION, AND THE NEXT CORRECT CHANGE FAILED IT.
   The assertion was a regex over `ai.__atlSay=out.text||((out.results&&out.results.length)?L('Atlas
   ran its tools…`, so #R740 — which inserted `String(out.stopped||'')!=='awaiting_user'&&` to stop the
   sentence appearing above a question Atlas had just asked the reader — was reported as a regression
   while doing exactly what this check exists to protect. #R488's shape: a rule fastened to a spelling
   measures the spelling. So the EXPRESSION IS EVALUATED instead, with the four turns that matter. */
test('R731 ③ the forced final that says nothing leaves the console one honest sentence, in the reader\'s language', () => {
  const con = codeOnly(readLF(join(ROOT, 'js/atlas-console.js')));
  /* the shipped right-hand side of `ai.__atlSay=`, taken to the end of its statement by matching
     brackets — not by a closing spelling (tests/helpers/lift-function.mjs exists for the same reason) */
  const L = (en) => en;   /* the reader's language is `pick()`'s job; here it is the English slot */
  const HEAD = 'ai.__atlSay=';
  const fns = [];
  for (let at = con.indexOf(HEAD); at >= 0; at = con.indexOf(HEAD, at + 1)) {
    let i = at + HEAD.length;
    if (con[i] === '=') continue;   /* `__atlSay==` is a comparison, not the assignment */
    let depth = 0, q = null, end = -1;
    for (; i < con.length; i++) {
      const c = con[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if ('([{'.indexOf(c) >= 0) depth++;
      else if (')]}'.indexOf(c) >= 0) depth--;
      else if (c === ';' && !depth) { end = i; break; }
    }
    if (end < 0) continue;
    try { fns.push(new Function('out', 'L', 'return (' + con.slice(at + HEAD.length, end) + ');')); } catch (_) { /* not an expression on its own */ }
  }
  assert.ok(fns.length, 'the console assigns the turn\'s sentence somewhere');
  /* exactly one of those assignments is THE answer — the one that hands back what the model wrote */
  const cands = fns.filter((f) => { try { return f({ text: 'x', results: [{}], stopped: 'answered' }, L) === 'x'; } catch (_) { return false; } });
  assert.equal(cands.length, 1, 'exactly one assignment decides the turn\'s sentence');
  const say = cands[0];

  /* ① the model wrote an answer → that answer, untouched */
  assert.equal(say({ text: 'ここが震源です。', results: [{}], stopped: 'answered' }, L), 'ここが震源です。');
  /* ② tools ran, the forced final said nothing → ONE sentence of IntMap's own, saying what happened */
  const forced = say({ text: '', results: [{}, {}], stopped: 'repeated_calls' }, L);
  assert.match(String(forced), /did not write an answer/, 'a turn that ran tools and wrote nothing says so');
  /* ③ nothing ran and nothing was written → nothing is invented */
  assert.equal(say({ text: '', results: [], stopped: 'answered' }, L), '');
  /* ④ (#R740) the turn STOPPED TO ASK THE READER. The question is the turn's text, so the sentence
     above must not appear — measured in production: 「半径を指定してください」 with three options and
     their volumes, under a notice saying Atlas had failed to write an answer. */
  assert.equal(say({ text: '', results: [{}], stopped: 'awaiting_user' }, L), '',
    'a turn that asked the reader a question is not a turn that failed to write one');

  assert.match(codeOnly(readLF(join(ROOT, 'js/atlas-agent.js'))), /maxRepeatSteps: 2,/);
});
