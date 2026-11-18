/* ============================================================================
 *  deploy-applied-migrations — «added but not pending» is two different facts
 * ----------------------------------------------------------------------------
 *  THE DEFECT, as observed 2026-11-18: run 44283726249 (550726ac, #1205) applied
 *  20261118090000 and was green. The next two push runs (44325999621 at f20ec5e8, 44340692025 at
 *  734d2299) chose the green run BEFORE it (65aad08b) as their base, so the diff still "added"
 *  20261118090000. The dry run correctly did not list it (production already records it), and
 *  migrationMismatch called that a mismatch — 22 Edge Functions and 20261118120000 stayed
 *  undeployed until a hand deploy.
 *
 *  An older base is the SAFE direction (more functions redeployed); it must never turn a deploy red.
 *  What decides is the production history: recorded → already applied (fine); not recorded → it is
 *  timestamped before the remote head and db push will never apply it (refuse).
 *  The dry-run text and the version numbers below are the real ones from those runs' logs.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingFromDryRun, migrationMismatch, alreadyApplied } from '../scripts/supabase-deploy.mjs';
import { parseMigrationTable } from '../scripts/release-state.mjs';

const DRY_44325999621 = [
  'Initialising login role...',
  'DRY RUN: migrations will *not* be pushed to the database.',
  'Connecting to remote database...',
  'Would push these migrations:',
  ' • 20261118120000_atlas_delegation.sql',
].join('\n');
/* the shape `supabase migration list --linked` prints (local | remote | time) */
const table = (rows) => ['', '   Local          | Remote         | Time (UTC)', '  ----------------|----------------|---------------------',
  ...rows.map(([l, r]) => `   ${l.padEnd(14)} | ${r.padEnd(14)} | 2026-11-18 09:00:00`)].join('\n');

test('⑴ added, not pending, but recorded in production → already applied, not a mismatch (the 2026-11-18 run)', () => {
  const pending = pendingFromDryRun(DRY_44325999621);
  assert.deepEqual(pending, ['20261118120000']);
  const added = ['20261118090000', '20261118120000'];   // base 65aad08b..f20ec5e8
  const t = parseMigrationTable(table([['20261117160000', '20261117160000'], ['20261118090000', '20261118090000'], ['20261118120000', '']]));
  const remote = [...t.both, ...t.remoteOnly];
  assert.equal(migrationMismatch(pending, added, remote), null, 'an older base must not turn the deploy red');
  assert.deepEqual(alreadyApplied(added, remote), ['20261118090000']);
});

test('⑴ every added version already applied (the hand deploy happened first) → nothing to refuse, nothing pending', () => {
  const added = ['20261118090000', '20261118120000'];
  assert.equal(migrationMismatch([], added, ['20261118090000', '20261118120000']), null);
});

test('⑵ added, not pending, NOT recorded → timestamped before the remote head; db push never applies it — refuse', () => {
  const why = migrationMismatch(['20261118120000'], ['20261118090000', '20261118120000'], ['20261117160000', '20261118130000']);
  assert.match(why, /would NOT apply 20261118090000/);
  assert.match(why, /does not record them/);
  assert.doesNotMatch(why, /20261118120000 although/);
});

test('⑵ the production history could not be read → refuse; «could not measure» is not «already applied»', () => {
  const why = migrationMismatch([], ['20261118090000'], null);
  assert.match(why, /could not be read/);
  assert.deepEqual(alreadyApplied(['20261118090000'], null), []);
});

test('the other direction is unchanged: db push would apply something the diff did not add → refuse even when it is "recorded"', () => {
  assert.match(migrationMismatch(['20260718090000', '20261118120000'], ['20261118120000'], ['20261118090000']), /ALSO apply 20260718090000/);
});
