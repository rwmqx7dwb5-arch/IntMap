/* atlas-tool-cancel — the turn facts must REACH the executor.
   js/atlas-agent.js hands every call `facts` (externalContentSeen, callSignal); the surface calls runAction(action, turn).
   The console's lambda took only `action`, so every turn fact — including the signal that cancels an overdue call
   (atlas-timeout-cancel) — was dropped before the executor saw it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
const surface = readFileSync(new URL('../js/atlas-toolsurface.js', import.meta.url), 'utf8');

test('the surface passes `turn` to runAction, and the console forwards it to the turn executor', () => {
  assert.match(surface, /makeExecute\(tools, agent, run = runAction\)/);
  assert.match(surface, /run\(built\.action, turn\)/);
  assert.match(src, /runAction:\(action,turn\)=>\(_turnRunAction\?_turnRunAction\(action,turn\)/,
    'dropping `turn` here silently disabled every turn fact');
});

test('_runOne reads the call signal from the forwarded turn', () => {
  assert.match(src, /action\.__callSignal=\(turn&&turn\.callSignal\)/);
});
