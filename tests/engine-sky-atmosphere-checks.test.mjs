/* The sky over the map — js/sky-model.js (the atmosphere integral) and the horizon band / limb that
 * js/theme-sky.js paints from it.
 *
 * Gathered from tests/r213-checks ⑨ (the atmosphere band is the model's hue at #R196's measured
 * brightness) and tests/r222-checks ④ (an eye outside the shell, and the limb it sees). Titles keep the
 * round that wrote them.
 *
 * ⚠ THE CLAIMS ARE RELATIONS, NOT THIS ROUND'S NUMBERS (#R199/#R203): a test that pins the value its own
 * round produced fails the next time anybody improves it. js/sky-model.js is a pure ES module and is
 * RUN; js/theme-sky.js paints into a live MapLibre sky, so how it CALLS the model is read and says so. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skyColour, limbViewElev } from '../js/sky-model.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/* THE ATMOSPHERE BAND IS THE MODEL'S HUE AT #R196'S MEASURED BRIGHTNESS. Above +6° the band keeps what
   #R196 measured, and through twilight it becomes WARMER than the old ramp — the physical effect that
   was missing. */
test('R213 ⑨: the horizon band keeps the measured daylight colour and gains a real twilight', () => {
  /* ⚠ READ (this half): how theme-sky samples the model and weights it is the paint path of a live sky */
  const sky = read('js/theme-sky.js');
  assert.match(sky, /const _HZ_VIEW_ELEV=0\.6;/, 'the band is sampled just above the horizon');
  assert.match(sky, /skyColour\(e,_eyeAltM\(\),_relAzimuth\(\),_HZ_VIEW_ELEV\)/, 'from the same integral the far end uses');
  /* ⚠ (#R224) THE +6° CUT-OFF IS GONE ON PURPOSE: #R213 zeroed the model's hue above a +6° Sun because
     the model answered OLIVE there; #R224 found that was the march's quadrature and fixed it. The weight
     rides the model's own LUMINANCE instead. */
  assert.match(sky, /const w=Math\.max\(0,Math\.min\(1,lm\/12\)\);/, 'the hue weight follows the model’s luminance, not the Sun’s elevation');
  assert.ok(!/\(6-e\)\/12/.test(sky), 'the elevation cut-off is not still there beside it');

  /* RUN: the same weighting the file uses, against the same model */
  const NIGHT = [0x0a, 0x15, 0x26], DAY = [0xc2, 0xcc, 0xd1];
  const band = (e) => {
    const t0 = Math.max(0, Math.min(1, (e + 6) / 12)), t = t0 * t0 * (3 - 2 * t0);
    const ramp = [0, 1, 2].map((i) => Math.round(NIGHT[i] + (DAY[i] - NIGHT[i]) * t));
    const m = skyColour(e, 0, 90, 0.6).rgb, lm = lum(m);
    if (!(lm > 1)) return ramp;
    const w = Math.max(0, Math.min(1, lm / 12));
    const k = lum(ramp) / lm;
    return [0, 1, 2].map((i) => Math.max(NIGHT[i], Math.min(255, Math.round(ramp[i] + (Math.min(255, m[i] * k) - ramp[i]) * w))));
  };
  /* (#R224) a high Sun keeps #R196's measured BRIGHTNESS — that is what `k` guarantees — and carries the
     model's hue on top of it. Luminance within a count, and blue. */
  for (const e of [45, 6]) {
    const b = band(e);
    assert.ok(Math.abs(lum(b) - lum(DAY)) <= 1.5, `sun ${e}°: the band's brightness is still #R196's (${b})`);
  }
  assert.ok(band(45)[2] > band(45)[0], `a high Sun's band is BLUE where the grey ramp was neutral (${band(45)})`);
  assert.ok(band(6)[0] > band(6)[2], `and +6° is already gold rather than grey (${band(6)})`);
  const set = band(0), old0 = (() => { const t0 = 0.5, t = t0 * t0 * (3 - 2 * t0); return [0, 1, 2].map((i) => Math.round(NIGHT[i] + (DAY[i] - NIGHT[i]) * t)); })();
  assert.ok(set[0] > set[2], `at sunset the band is red-dominant (${set}), which the old grey ramp never was (${old0})`);
  assert.ok(set[0] > old0[0] && set[2] < old0[2], 'redder and less blue than the ramp it replaces');
  assert.ok(lum(band(-20)) <= lum([0x0a, 0x15, 0x26]) + 1, 'deep night floors at the night colour rather than going black');

  /* the band THICKNESS is geometric, and still 0.55 at the height #R196 measured it at */
  assert.match(sky, /'sky-horizon-blend':_horizonBlend\(\)/);
  /* (#R221) the height term is unchanged; the Sun factor is normalised to #R196's measuring condition. */
  assert.match(sky, /0\.14\+0\.41\*frac/, 'at ground level the height term is unchanged');
  assert.match(sky, /const _HB_REF=/, 'and the Sun term is normalised to the reference #R196 measured at');
});

test('#R222 ④ the sky model integrates from outside the atmosphere, and the ground answer is unmoved', () => {
  /* the geometry: a limb ray exists only when the eye is above that shell */
  assert.equal(limbViewElev(1000, 12000), null, 'no limb from inside the shell');
  const ve = limbViewElev(5e6, 12000);
  assert.ok(ve < 0 && ve > -90, 'the limb is below the horizontal');
  assert.ok(limbViewElev(5e6, 6000) < limbViewElev(5e6, 55000), 'a lower tangent looks further down');
  /* the day-side limb is bright and blue-dominant; the night-side limb is not */
  const day = skyColour(60, 5e6, 90, limbViewElev(5e6, 12000)).rgb;
  const night = skyColour(-80, 5e6, 180, limbViewElev(5e6, 12000)).rgb;
  assert.ok(lum(day) > 100, `the sunlit limb is bright (${day})`);
  assert.ok(day[2] > day[1], `and blue-dominant (${day})`);
  assert.ok(lum(night) < lum(day) * 0.25, `the night limb is far darker (${night})`);
  /* higher up the shell the limb has less air in it, so it is darker */
  assert.ok(lum(skyColour(60, 5e6, 90, limbViewElev(5e6, 60000)).rgb) < lum(day));
  /* ⚠ AND THE GROUND ANSWER IS UNCHANGED — this round widened the geometry, it did not retune the model */
  const noon = skyColour(45, 0, 90, 55).rgb;
  assert.ok(noon[2] > noon[0] && lum(noon) > 60, `a noon sky is bright and blue (${noon})`);
  assert.deepEqual(skyColour(45, 0, 90, 55).rgb, noon, 'and it is deterministic');
});

/* ⚠ READ, NOT RUN: _limbHex lives in makeThemeSky's closure over the live camera and Sun position. */
test('#R222 ④ …and theme-sky only uses the limb where there IS one, and where the Sun is known', () => {
  const ts = read('js/theme-sky.js');
  assert.ok(/limbViewElev/.test(ts) && /_limbHex/.test(ts), 'the limb path exists');
  const fn = ts.slice(ts.indexOf('function _limbHex'), ts.indexOf('function _horizonColour'));
  assert.ok(/alt>_ATM_TOP_M/.test(fn.replace(/\s/g, '')), 'it refuses below the top of the atmosphere');
  assert.ok(/_sunElevAtCentre\(\)/.test(fn) && /e==null\)\s*return null/.test(fn),
    'and it returns null when the Sun is unknown, so #R221’s day/night gate still decides');
});
