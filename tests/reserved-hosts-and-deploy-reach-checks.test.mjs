/* ============================================================================
 *  reserved-hosts-and-deploy-reach — a red deploy run is not an unpublished one
 * ----------------------------------------------------------------------------
 *  ① the prod smoke's host sweep drops special-use names (RFC 2606 / 6761) by their reservation:
 *    MapLibre 6's `https://maplibre.invalid` turned three production deploys red as a «dead host»
 *  ② `worktree status` reads the job that PUBLISHES (found in deploy.yml by actions/deploy-pages),
 *    so a run red only on its smoke still counts as on production
 *  記録: dev-notes/2026-09-29-reserved-hosts-and-deploy-reach.md
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

test('① the host sweep drops special-use names, and only those', () => {
  const src = rd('tests/prod-smoke.spec.js');
  const m = /const SPECIAL_USE = (\/.+\/);\n/.exec(src.replace(/\r\n/g, '\n'));
  assert.ok(m, 'tests/prod-smoke.spec.js declares SPECIAL_USE');
  const re = new Function('return ' + m[1])();
  for (const h of ['maplibre.invalid', 'foo.test', 'a.example', 'localhost', 'x.localhost', 'example.com', 'docs.example.org'])
    assert.ok(re.test(h), `${h} is special-use`);
  for (const h of ['api.maplibre.org', 'invalid.org', 'testing.com', 'example-data.com', 'examples.com', 'tiles.openfreemap.org'])
    assert.ok(!re.test(h), `${h} is an ordinary host and is still probed`);
  assert.match(src, /!SKIP\.test\(h\) && !SPECIAL_USE\.test\(h\)/, 'and the sweep applies it');
});

test('② the publishing job is found in deploy.yml, not named by hand', () => {
  const src = rd('scripts/worktree.mjs').replace(/\r\n/g, '\n');
  const start = src.indexOf('export function pagesJobName(');
  const end = src.indexOf('\n}\n', start) + 3;
  assert.ok(start > 0 && end > start, 'scripts/worktree.mjs defines pagesJobName');
  const pagesJobName = new Function(src.slice(start, end).replace('export ', '') + '\nreturn pagesJobName;')();
  const real = pagesJobName(rd('.github/workflows/deploy.yml'));
  assert.ok(real, 'the real deploy.yml has a job that uses actions/deploy-pages');
  const yml = rd('.github/workflows/deploy.yml').replace(/\r\n/g, '\n');
  const block = yml.slice(yml.indexOf('    name: ' + real));
  /* the job's own text, up to the next job key — not a fixed window (deploy-order: the guard steps above
     the publish pushed it past the 1,200 characters this used to read) */
  const next = block.slice(1).search(/\n  [A-Za-z0-9_-]+:\s*\n/);
  assert.match(next < 0 ? block : block.slice(0, next + 1), /uses:\s*actions\/deploy-pages@/, `the job named «${real}» is the one that publishes`);
  const fixture = ['jobs:', '  build:', '    name: Build', '    steps:', '      - run: x',
    '  ship:', '    name: "Ship it"', '    steps:', '      - uses: actions/deploy-pages@abc', ''].join('\n');
  assert.equal(pagesJobName(fixture), 'Ship it');
  assert.equal(pagesJobName('jobs:\n  a:\n    steps:\n      - uses: actions/deploy-pages@v5\n'), 'a', 'a job without a display name is known by its key');
  assert.equal(pagesJobName('jobs:\n  a:\n    name: A\n'), null, 'no publishing job → null, never a guess');
});
