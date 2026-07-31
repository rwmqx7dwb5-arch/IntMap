/* (#R185b) SGP4 diverges on some element sets and says nothing about it.
 *
 * Found during production verification of #R185: the live satellite layer reported a maximum
 * altitude of 9,166,588 km. Propagating the shipped catalogue names the three objects outside a
 * sane band, and two of them are propagation blow-ups rather than deep-space orbits —
 * ASTROCAST-0201 at 9,244,632 km and MENUT at 238,361 km, both with a mean motion near 16
 * revolutions a day, which is a ninety-minute orbit a few hundred kilometres up. The third,
 * EXPLORER 50 (IMP-8), really is 270,956 km out.
 *
 * So the discriminator cannot be an altitude threshold — it has to be the object's own orbit. This
 * test asserts the physics the layer's guard is built on, against the real catalogue it ships. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as SAT from 'satellite.js';

const R_EARTH = 6378.137;
const ROOT = process.cwd();

const propagated = () => {
  const lines = fs.readFileSync(path.join(ROOT, 'data/tle/catalogue.tle'), 'utf8').split(/\r?\n/);
  const now = new Date(), gmst = SAT.gstime(now);
  const out = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const name = (lines[i] || '').trim(), l1 = lines[i + 1], l2 = lines[i + 2];
    if (!l1 || !l2 || l1[0] !== '1') continue;
    let r; try { r = SAT.twoline2satrec(l1, l2); } catch (_) { continue; }
    if (!r || r.error) continue;
    const pv = SAT.propagate(r, now); if (!pv || !pv.position) continue;
    const gd = SAT.eciToGeodetic(pv.position, gmst);
    if (!isFinite(gd.height)) continue;
    out.push({ name, altKm: gd.height, apoKm: r.a > 0 ? r.a * R_EARTH * (1 + (r.ecco || 0)) : 0 });
  }
  return out;
};

/* the guard, stated once — the layer implements exactly this */
const keeps = (o) => o.altKm > 80 && !(o.apoKm > 0 && (R_EARTH + o.altKm) > o.apoKm * 1.5);

test('R185b: the guard drops divergences and keeps real deep-space orbits', () => {
  const all = propagated();
  assert.ok(all.length > 500, 'the catalogue propagates');
  const kept = all.filter(keeps), dropped = all.filter((o) => !keeps(o));

  /* nothing plausible is thrown away: at most a handful of the catalogue */
  assert.ok(dropped.length < all.length * 0.02,
    `dropped ${dropped.length} of ${all.length} — a guard that removes a fiftieth of the sky is the wrong guard`);

  /* and what survives is inside its own orbit */
  for (const o of kept) {
    assert.ok(o.altKm > 80, o.name + ' has re-entered');
    if (o.apoKm > 0) assert.ok(R_EARTH + o.altKm <= o.apoKm * 1.5, o.name + ' is outside its own apogee');
  }

  /* the discriminator is the orbit, not the altitude: a genuine high orbit is kept while a
     ninety-minute orbit reported at hundreds of thousands of km is not */
  const imp8 = all.find((o) => /IMP-8|EXPLORER 50/i.test(o.name));
  if (imp8) {
    assert.ok(imp8.altKm > 100000, 'IMP-8 really is far out — that is the point of the case');
    assert.ok(keeps(imp8), 'a real deep-space orbit must survive the guard');
  }
  const maxKept = kept.reduce((m, o) => Math.max(m, o.altKm), 0);
  assert.ok(maxKept < 500000, 'nothing kept is beyond the Moon');
});

test('R185b: the layer implements that guard and reports what it dropped', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/satellites-live.js'), 'utf8');
  assert.match(src, /if\(!\(altKm>80\)\)\{ dropped\+\+; continue; \}/);
  assert.match(src, /apoKm=\(s\.satrec\.a>0\)\?\(s\.satrec\.a\*R_EARTH\*\(1\+\(s\.satrec\.ecco\|\|0\)\)\):0/);
  assert.match(src, /if\(apoKm>0&&\(R_EARTH\+altKm\)>apoKm\*1\.5\)\{ dropped\+\+; continue; \}/);
  /* silently dropping objects would be its own dishonesty — the count is in the state */
  assert.match(src, /diverged:_diverged/);
});
