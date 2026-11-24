/* ============================================================================
 *  derive-tier-sizes — a tier's size is derived (scripts/tiers.mjs --sizes) and written nowhere
 * ----------------------------------------------------------------------------
 *  The number used to be copied into five places, and `deep-tier-size` checked the copies. That kept them from
 *  drifting and made a race: every PR that adds a spec edits the same lines, so two of them merging together
 *  leave the count wrong with no conflict to say so, and each merge conflicts every other open PR on them.
 *  These checks hold the replacement: the command exists and agrees with tierSpecs, and the rule in
 *  scripts/doc-facts.mjs fails on a written size and on a lost pointer.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tiers = await import('../scripts/tiers.mjs');

test('① --sizes prints what tierSpecs derives, and importing tiers.mjs prints nothing', () => {
  const out = execFileSync(process.execPath, ['scripts/tiers.mjs', '--sizes'], { cwd: ROOT, encoding: 'utf8' });
  const s = tiers.tierSizes();
  assert.equal(s.deep, tiers.tierSpecs('deep').length);
  assert.equal(s.core, tiers.tierSpecs('core', { fixed: true }).length);
  assert.equal(s.all, tiers.tierSpecs('all').length);
  assert.ok(out.includes('deep ' + s.deep) && out.includes('core ' + s.core) && out.includes('whole ' + s.all), out);
  const quiet = execFileSync(process.execPath, ['scripts/tiers.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(quiet, '', 'running without the flag is not a request for the numbers');
});

test('② no source writes a tier size, and the three sessions-facing ones say where it is', () => {
  const CMD = 'tiers.mjs --sizes';
  for (const f of ['package.json', 'docs/TESTING.md', 'scripts/worktree.mjs']) {
    assert.ok(fs.readFileSync(path.join(ROOT, f), 'utf8').includes(CMD), f + ' must point at the derivation');
  }
  for (const f of ['package.json', 'docs/TESTING.md', 'docs/FILES.md', 'scripts/worktree.mjs']) {
    const body = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.equal(/(?:deep|core)[ \t]*\**[ \t]*\d[\d,]*[ \t]*本/i.test(body), false, f + ' writes a tier size in Japanese');
    assert.equal(/against (?:the )?core(?: tier)?'s\s*\**\d+/.test(body), false, f + " writes «against core's N»");
  }
});

test('③ the rule in doc-facts reports the derivation, not a count to keep in step', () => {
  let out = '';
  try { out = execFileSync(process.execPath, ['scripts/doc-facts.mjs', '--check'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }   /* another rule may fail in a checkout without the pulled data; this one is read alone */
  const line = out.split('\n').find((l) => l.includes('deep-tier-size'));
  assert.ok(line, 'the rule ran');
  assert.ok(!line.includes('✖'), line);
  assert.match(line, /no tier size is written anywhere/);
});
