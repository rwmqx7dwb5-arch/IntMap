/* ============================================================================
 *  ww2-tour — the Second World War tour, held to the war record on each step's own day
 * ----------------------------------------------------------------------------
 *  The tour `ww2-world` draws the dl-ww2 layer on every step, so the generic tour checks (which ask the BORDER
 *  record for a step's names — tests/classroom-tours-checks ③) cannot see what its sentences claim. Asked HERE,
 *  the way a reader sees it (tests/helpers/war-faction.mjs: the CShapes country under a point, its side that day
 *  in data/wars.json, the fronts that cut it, decided by js/war-geom.js):
 *    ① each step's sentences — which side held which city on that day, which lines are drawn
 *    ② the border record keeps what the sentences say it keeps (Austria and Czechoslovakia in 1939, two parts of
 *       Germany and of Korea on 2 September 1945) — the reason the sentences talk about the layer at all
 *    ③ the unit map answers 歴史総合 Ｃ（3） with this tour, and every step speaks English and Japanese
 *  dev-notes/2026-10-11-ww2-tour.md has the pictures' check and what was left out.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tourById } from '../js/tours.js';
import { faction, countryAt, war } from './helpers/war-faction.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = tourById('ww2-world');
const P = {
  Vienna: [16.37, 48.21], Prague: [14.42, 50.08], Warsaw: [21.01, 52.23], Lviv: [24.03, 49.84], Paris: [2.35, 48.86],
  Bordeaux: [-0.58, 44.84], Vichy: [3.43, 46.13], London: [-0.13, 51.51], Rome: [12.5, 41.9], Milan: [9.19, 45.46],
  Naples: [14.27, 40.85], Oslo: [10.75, 59.91], Copenhagen: [12.57, 55.68], Amsterdam: [4.9, 52.37], Brussels: [4.35, 50.85],
  Moscow: [37.62, 55.75], Shanghai: [121.47, 31.23], Chongqing: [106.55, 29.56], Hanoi: [105.85, 21.03], Manila: [120.98, 14.6],
  Washington: [-77.04, 38.9], Rangoon: [96.16, 16.84], Singapore: [103.85, 1.29], Jakarta: [106.85, -6.2], Bangkok: [100.5, 13.75],
  Guadalcanal: [160.2, -9.6], Seoul: [126.98, 37.57], Pyongyang: [125.75, 39.03], Berlin: [13.4, 52.52], Frankfurt: [8.68, 50.11], Tokyo: [139.69, 35.69],
};
const stepAt = (id) => { const s = T.steps.find((x) => x.id === id); assert.ok(s, 'the step ' + id + ' exists'); return s.at; };
const sides = (d, want) => { for (const [city, side] of Object.entries(want)) assert.equal(faction('ww2', d, P[city]), side, `${d}: ${city}`); };
const frontOn = (fid, d) => { const F = war('ww2').fronts.find((f) => f.id === fid); return !!F && F.dates[0].d <= d && (!F.until || d < F.until); };

test('① what each step says is what the layer draws on that day', () => {
  assert.ok(T, 'the tour is declared');
  assert.ok(T.steps.filter((s) => !s.example).every((s) => s.layers.includes('dl-ww2')), 'every step of its own draws the war layer');
  /* 3 September 1939: Austria and Bohemia–Moravia already held by Germany; Poland, Britain and France Allied; Italy not at war */
  sides(stepAt('ww2-europe-1939'), { Vienna: 'AXIS', Prague: 'AXIS', Warsaw: 'ALLIED', Paris: 'ALLIED', London: 'ALLIED', Rome: 'NEUTRAL' });
  /* 1 July 1940: Poland split at the German–Soviet line, the Soviet side grey; France split at the armistice line, Vichy grey */
  sides(stepAt('ww2-europe-1940'), { Warsaw: 'AXIS', Lviv: 'NEUTRAL', Paris: 'AXIS', Bordeaux: 'AXIS', Vichy: 'NEUTRAL', Oslo: 'AXIS',
    Copenhagen: 'AXIS', Amsterdam: 'AXIS', Brussels: 'AXIS', Rome: 'AXIS', London: 'ALLIED' });
  /* 8 December 1941: the China front (Japan behind it), Indochina held, the Soviet Union and the United States Allied, the Philippines fought over */
  const d41 = stepAt('ww2-asia-1941');
  assert.ok(frontOn('china', d41), 'the China front is drawn');
  sides(d41, { Shanghai: 'AXIS', Chongqing: 'ALLIED', Hanoi: 'AXIS', Moscow: 'ALLIED', Washington: 'ALLIED', Manila: 'CONTESTED' });
  /* 1 November 1942 in Europe: the Eastern Front and the North African front are both drawn */
  const ex = T.steps.find((s) => s.example === 'ww2-1942');
  assert.ok(ex, 'the 1942 example of the war layer is a step');
  assert.ok(frontOn('east2', '1942-11-01') && frontOn('northafrica', '1942-11-01'), 'the lines the step sends the reader to are drawn');
  /* 1 November 1942 in Asia: Burma, Singapore, the Philippines and the Dutch East Indies held; Thailand at Japan's side; Guadalcanal fought over */
  sides(stepAt('ww2-asia-1942'), { Rangoon: 'AXIS', Singapore: 'AXIS', Manila: 'AXIS', Jakarta: 'AXIS', Bangkok: 'COBELL', Guadalcanal: 'CONTESTED' });
  /* 6 June 1944: all of France occupied, Italy divided by a front, the east pressed back; the camps are on the layer */
  const d44 = stepAt('ww2-europe-1944');
  sides(d44, { Paris: 'AXIS', Milan: 'AXIS', Naples: 'ALLIED', Moscow: 'ALLIED', Warsaw: 'AXIS' });
  assert.ok(frontOn('italy2', d44) && frontOn('east2', d44) && frontOn('west44', d44), 'three fronts are drawn on D-Day');
  const camps = war('ww2').events.filter((e) => e.kind === 'atrocity' && e.d <= d44 && (e.d2 || e.d) >= d44);
  assert.ok(camps.length >= 3, 'the layer marks the camps on that day (' + camps.length + ')');
});

test('② the border record keeps what the sentences say it keeps', () => {
  const d39 = stepAt('ww2-europe-1939');
  assert.equal(countryAt(d39, P.Vienna)[1], 305, 'the border map still draws Austria on 3 September 1939');
  assert.equal(countryAt(d39, P.Prague)[1], 315, '…and Czechoslovakia');
  const d45 = stepAt('ww2-world-1945');
  assert.equal(countryAt(d45, P.Frankfurt)[1], 260, 'two parts of Germany: the Western Allies’ zones');
  assert.equal(countryAt(d45, P.Berlin)[1], 265, '…and the Soviet zone');
  assert.equal(countryAt(d45, P.Seoul)[1], 732, 'Korea is divided at the 38th parallel');
  assert.equal(countryAt(d45, P.Pyongyang)[1], 731);
  assert.equal(countryAt(d45, P.Tokyo)[1], 740, 'and no longer drawn as part of Japan');
});

test('③ the unit map answers 歴史総合 Ｃ（3）, and every step speaks English and Japanese', () => {
  const units = JSON.parse(readFileSync(join(ROOT, 'data/curriculum-units.json'), 'utf8'));
  const all = units.frameworks.flatMap((f) => f.subjects.flatMap((s) => s.units));
  const c3 = all.find((u) => u.key === 'rekishi-c3');
  assert.ok(c3.basis && c3.tours && c3.tours.includes('ww2-world'), '歴史総合 Ｃ（3） is no longer «not covered yet»');
  for (const k of ['sekaishi-d4', 'uk-his-1901']) assert.ok(all.find((u) => u.key === k).tours.includes('ww2-world'), k + ' lists the tour');
  for (const s of T.steps) for (const f of ['say', 'ask']) {
    assert.ok(Array.isArray(s[f]) && s[f][0] && s[f][1], (s.id || s.example) + ' has ' + f + ' in English and Japanese');
  }
});
