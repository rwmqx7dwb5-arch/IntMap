/* ============================================================================
 *  R670 · A TOOL IS REACHABLE WHEN IT IS IN THE LIST THE PANEL A READER OPENS IS BUILT FROM
 * ----------------------------------------------------------------------------
 *  #R666 answered 「LayersのToolsからアクセスできるように。」 by appending a button to `#layer-tools`.
 *  MEASURED on the shipped R666 build: the button existed, its handler opened the simulator, the OS
 *  action answered — and its bounding rect was 0×0, because `#layer-tools` lives inside
 *  `#layer-dropdown`, the CLASSIC dropdown, and `imLayerPanel` has defaulted to `'right'` since
 *  #R154. The reader's Tools list had ten rows and none of them was the pandemic simulator.
 *
 *  ⚠⚠⚠ THAT IS THE SECOND TIME THE SAME ANSWER WAS GIVEN TO THE SAME INSTRUCTION — #R242 did it for
 *  the earthquake simulator and #R243 had to re-do it. Two rounds, one shape. #R258 ⑨ and #R261 ⑨
 *  already assert that certain simulations have a row here, but they do it from a HAND-WRITTEN LIST
 *  of ids, so a simulation added afterwards is invisible to them: a list written by hand cannot
 *  notice the thing that was not added to it. The check below does not carry a list. It DISCOVERS
 *  the simulations — every `sim.*` command the app registers with the kernel — and requires each of
 *  them to be in the registry the visible panel is built from.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const nocomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* ── ① every simulation the kernel knows has a row in the list the reader sees ─────────────── */
test('R670 ①: every sim.* command is a row in the registry the visible Tools panel draws', () => {
  /* The two places a `sim.*` command is registered: js/map-ui.js's own SIM_TOOLS loop, and the ones
     js/app-body.js registers beside the kernel because their module is lazy. Only the second kind can
     drift, which is exactly the drift #R666 shipped. */
  const shell = nocomment(read('js/app-body.js'));
  const ui = nocomment(read('js/map-ui.js'));

  const registered = [...shell.matchAll(/IntMapOS\.register\('(sim\.[a-zA-Z]+)'/g)].map((m) => m[1]);
  assert.ok(registered.length >= 2,
    'the shell registers at least the two lazy simulations; found ' + JSON.stringify(registered));

  for (const id of registered) {
    assert.ok(ui.includes("id:'" + id + "'"),
      id + ' is registered with the kernel but has no row in js/map-ui.js — the reader cannot reach it. '
      + '#R666 shipped exactly this: a button in `#layer-tools`, which the default panel does not draw.');
  }
});

/* ── ② …and the pandemic simulator in particular, since that is what was asked for ─────────── */
test('R670 ②: the pandemic simulator is a Tools row, with a name, a hint and a second press', () => {
  const ui = read('js/map-ui.js');
  const row = ui.slice(ui.indexOf("{ id:'sim.pandemic'"), ui.indexOf("{ id:'sim.pandemic'") + 1400);
  assert.ok(row.startsWith("{ id:'sim.pandemic'"), 'the row exists');
  assert.match(row, /mod:'IntMapPandemic'/, 'it names the module, so the row lights while the run is on');
  assert.match(row, /run:null/, 'and the open is the OS action, not a second copy of the open sequence');
  assert.match(row, /label:\(\)=>T\('Pandemic Simulator'/, 'it has the name the hub card already uses');
  assert.match(row, /hint:\(\)=>T\('Seed an outbreak/, 'and a hint, like every other row');
  assert.match(row, /keys:'[^']*pandemic[^']*パンデミック/, 'and search keys in more than one language');

  /* the contract `_toolOn` / `_toolOff` ask for — published by the module, from inside its own door */
  const pg = read('js/playground.js');
  assert.match(pg, /window\.IntMapPandemic=\{ isOpen:\(\)=>!!document\.getElementById\('pg-pan-hud'\), close:/,
    'js/playground.js publishes isOpen/close for the row to ask');
  const decl = pg.indexOf('window.IntMapPandemic=');
  const door = pg.indexOf('window._pgPandemic=function');
  assert.ok(door >= 0 && decl > door,
    'and publishes it from INSIDE the door, so drawing the row cannot make the lazy module load (#R209)');
});

/* ── ③ the classic dropdown's button is not removed, and not the thing being relied on ──────── */
test('R670 ③: #btn-pandemic-sim stays for the classic panel, and is not the reachability claim', () => {
  /* ⚠ NOT DELETED. `imLayerPanel` still has a `classic` setting and `#layer-tools` is what that
     setting draws — the earthquake simulator keeps its button there for the same reason (#R242).
     What changed is what the repository CLAIMS: reachability is the row in js/map-ui.js. */
  assert.match(read('js/data-layers.js'), /b\.id='btn-pandemic-sim'/, 'the classic panel keeps its button');
  assert.match(read('js/map-ui.js'), /id:'sim\.pandemic'/, '…and the default panel has the row');
});
