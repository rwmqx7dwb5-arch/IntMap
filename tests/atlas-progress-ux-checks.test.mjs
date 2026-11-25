/* atlas-progress-ux — what the reader is shown while Atlas works, and what is kept for the developer.
   Measured against the modules where a question is one of behaviour (knownWordFor, the plan view's gating) and against the source
   only where the question is "is this wired / is this removed". */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

test('① a tool with no word of its own gets NO preview word — never 「作業中」 repeated', async () => {
  const mod = await import('../js/atlas-progress.js');
  const caps = (await import('../js/atlas-capabilities.js')).makeAtlasCapabilities({});
  const P = mod.makeAtlasProgress({}, { L: (en) => en, esc: (s) => String(s), capabilities: () => caps });
  assert.equal(P.knownWordFor('run.capability'), '', 'the generic door was given a placeholder word');
  assert.equal(P.knownWordFor('find.capability'), '');
  assert.notEqual(P.knownWordFor('data.weather'), '', 'a real capability lost its word');
  /* the rows keep their fallback: an unknown id still says Working, because a row is a fact that something ran */
  assert.equal(P.wordFor('nonsense'), 'Working');
});

test('② the draft has no blinking caret, and nothing styles one', () => {
  const live = read('js/atlas-live.js');
  assert.ok(!/atl-caret|CARET/.test(live), 'a text cursor is still drawn after the answer text');
});

test('③ cost, model names and tool names are the developer view\'s; so are a failed step\'s raw warnings', () => {
  const c = read('js/atlas-console.js');
  assert.match(c, /_isDevView\(\)&&AGENT\.runLine/, 'the run line is not gated on the developer view');
  assert.match(c, /_shown=_devView\?_interim:_interim\.filter\(r=>r&&r\.ok!==false\)/, 'a failed step\'s raw warning is listed for every reader');
  assert.match(c, /AGENT\.runLine/, 'the measurement itself was removed — it is only hidden');
});

test('④ the head says how the turn ended without a separator, and the trace has no left bar', () => {
  const p = read('js/atlas-progress.js');
  assert.ok(!/ENDWORD\[tr\.how\]\(\) \+ ' · '/.test(p), 'the ending word and the count are joined by a middle dot again');
  assert.ok(!/\.atl-trace\{[^}]*border-left/.test(p), 'the trace has a left bar again');
  assert.match(p, /\.atl-trace-plan\{[^}]*border-radius:12px/, 'the checklist is not a bordered, rounded region');
});

test('⑤ parallel workers are lines under their operation, written from the tasks and not from the spend', () => {
  const p = read('js/atlas-progress.js');
  assert.match(p, /ev\.progress\.tasks/, 'progress tasks are not read');
  const body = p.slice(p.indexOf('function paintTasks'), p.indexOf('/* step(bubble, action)'));
  assert.ok(!body.includes('costUsd'), 'a worker line carries a cost');
});

test('⑥ a plan is drawn into the trace only in the turn that declared it', () => {
  const pl = read('js/atlas-plan.js');
  assert.match(pl, /!s\.thisTurn\) return/, 'an earlier turn\'s plan is drawn into every new trace');
  assert.ok(!/lastSlot !== slot\) \{ try \{ lastSlot\.innerHTML = ''/.test(pl), 'the earlier trace is emptied when a later turn starts');
});
