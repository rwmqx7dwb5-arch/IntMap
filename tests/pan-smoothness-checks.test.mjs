import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawFloorTile } from '../js/world-floor-tile.js';

/* the floor tile is one drawImage per output row, from a source row that moves down the picture */
test('drawFloorTile fills every row once, top to bottom, inside the picture', () => {
  const calls = [];
  const g = { drawImage: (...a) => calls.push(a) };
  const T = 64, sw = 4096, sh = 2048;
  drawFloorTile(g, {}, sw, sh, 3, 2, 3, T);
  assert.equal(calls.length, T);
  calls.forEach((c, j) => { assert.equal(c[6], j); assert.equal(c[7], T); assert.equal(c[8], 1); assert.ok(c[2] >= 0 && c[2] <= sh); });
  for (let j = 1; j < T; j++) assert.ok(calls[j][2] >= calls[j - 1][2], 'source rows never move back up');
  assert.equal(calls[0][1], (2 / 8) * sw);
});

/* the one routine has two callers; neither may grow a second copy of the reprojection */
test('world-base.js and the satellite worker share js/world-floor-tile.js', () => {
  const wb = readFileSync(new URL('../js/world-base.js', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../src/sat-worker.js', import.meta.url), 'utf8');
  /* both are dynamic imports: a static one adds a module to every start (perf-budget eager.modules), and the worker's vm test harnesses (sat-mobile-speed, sat-arcgis-3d) evaluate it as a script */
  assert.match(wb, /import\('\.\/world-floor-tile\.js'\)/);
  assert.match(sw, /import\('\.\.\/js\/world-floor-tile\.js'\)/);
  assert.doesNotMatch(wb, /Math\.sinh/);
});
