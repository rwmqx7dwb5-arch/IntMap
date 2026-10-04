/* ============================================================================
 *  IntMap · wave2-prod-fixes — what production measured wrong after the second wave (cb3a391), as node checks
 * ----------------------------------------------------------------------------
 *  The browser half is in the specs that already open the page these defects live on (no new page, no new spec):
 *    tests/map-next.spec.js       the pin card's «Edit» is readable before the My map panel opens (WCAG ratio, both
 *                                 themes); on a phone the Companies bar is not over the search list
 *    tests/community-next.spec.js at 1000 px: the shell cannot be scrolled sideways; the report card and its × are on
 *                                 the screen and Escape puts it away; the list of reports stays on the screen
 *    tests/ux-next.spec.js        every tool row's command is in the palette by its name; «radiation» / «plume»
 *  This file runs the palette's naming rule as it is shipped — what a command is called, and why it is refused.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameCommand } from '../js/command-palette.js';

const txt = (v) => v[1];   /* the reader reads Japanese */

test('① a command a control names is called by that control, and found by the capability registry\'s spellings too', () => {
  const n = nameCommand('sim.radiation', {
    meta: { label: 'Radioactive plume simulator', group: 'sim' },
    control: { title: '放射性プルーム拡散シミュレーター', sub: '実際の風の場で放出を拡散させる', terms: ['radioactive plume simulator disperse'] },
    cap: { legacy: 'radiation', aliases: ['fallout', 'dispersion', 'plume', 'radiationSim'] },
    txt,
  });
  assert.equal(n.refused, undefined);
  assert.equal(n.title, '放射性プルーム拡散シミュレーター', 'the reader\'s language, from the row that names it');
  assert.equal(n.from, 'control');
  assert.equal(n.sub, '実際の風の場で放出を拡散させる');
  for (const w of ['radiation', 'fallout', 'plume', 'sim.radiation']) assert.ok(n.terms.includes(w), 'found by «' + w + '»');
});

test('② a command with no control on screen is called by the title its meta declares, in the reader\'s language', () => {
  const n = nameCommand('company.sites', { meta: { label: 'Company sites · show', title: ['Company sites map', '企業の拠点地図'] }, control: null, cap: null, txt });
  assert.equal(n.title, '企業の拠点地図');
  assert.equal(n.from, 'title');
});

test('③ a command nothing names is refused — and the refusal says why (its only names are an id and a developer label)', () => {
  const n = nameCommand('layer.on', { meta: { label: 'layer.on {id}' }, control: null, cap: null, txt });
  assert.equal(typeof n.refused, 'string');
  assert.match(n.refused, /no control names it/);
  assert.match(n.refused, /developer label/);
  /* a capability's spellings alone are not a reader-facing name either: they make a named command findable, nothing more */
  const c = nameCommand('sim.ghost', { meta: { label: 'Ghost' }, control: null, cap: { legacy: 'ghost', aliases: ['spectre'] }, txt });
  assert.equal(typeof c.refused, 'string');
  /* an empty control name is no name */
  assert.equal(typeof nameCommand('x.y', { meta: {}, control: { title: '' }, txt }).refused, 'string');
});
