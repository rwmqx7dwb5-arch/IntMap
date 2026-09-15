/* ============================================================================
 *  #R729 — the same call, made again after its own answer was handed back, is not progress
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

test('R729 ① a turn that repeats its own answered call stops after two identical steps and goes to the answer', async () => {
  const { out, ran, seen } = await turn([same, same, same, same, same, same, same, same, { text: '', toolCalls: [], final_text: '' }]);
  assert.equal(out.stopped, 'repeated_calls');
  assert.equal(ran.length, 1, 'the tool ran once; the reuse answered the rest');
  const finals = seen.filter((r) => r && r.final);
  assert.equal(finals.length, 1, 'one forced final was asked for');
  assert.ok(seen.length <= 4, 'model calls: ' + seen.length + ' (was 9)');
});

test('R729 ② a step that asks something different resets the count — nothing is taken from a turn that moves', async () => {
  const other = { text: '', toolCalls: [{ id: 'b', name: 'run_capability', arguments: { id: 'layers.satellites', args: { name: 'HST', place: 'Tokyo' } } }], turnState: 'continuing' };
  const { out, ran } = await turn([same, same, other, { text: 'done', toolCalls: [] }]);
  assert.equal(out.stopped, 'answered');
  assert.equal(ran.length, 2, 'ISS once, HST once');
  assert.equal(out.text, 'done');
});

test('R729 ③ the forced final that says nothing leaves the console one honest sentence, in the reader\'s language', () => {
  const con = codeOnly(readLF(join(ROOT, 'js/atlas-console.js')));
  assert.match(con, /ai\.__atlSay=out\.text\|\|\(\(out\.results&&out\.results\.length\)\?L\('Atlas ran its tools but did not write an answer this time/);
  assert.match(codeOnly(readLF(join(ROOT, 'js/atlas-agent.js'))), /maxRepeatSteps: 2,/);
});
