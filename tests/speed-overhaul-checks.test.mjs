/* ============================================================================
 *  speed-overhaul — 「速度を根本的に劇的に早くして」
 *  The facts this round made true, held as facts rather than as the spellings that carry them today.
 *  The measurements behind each are in dev-notes/2026-11-17-speed-overhaul.md.
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ① A canvas whose pixels are READ BACK is a CPU canvas. MEASURED (Chromium, fresh page): the first
   accelerated 2D context plus one getImageData of an 80×60 sprite cost 131 ms; with willReadFrequently
   1 ms — and the news pill sprite paid it inside the boot. The rule is a fact about every reader in js/,
   so it is checked over every file: the 2D context nearest above a getImageData call must ask for it. */
test('① every 2D canvas read back with getImageData is created willReadFrequently', () => {
  const misses = [];
  for (const f of readdirSync(join(ROOT, 'js')).filter((n) => n.endsWith('.js'))) {
    const lines = read('js/' + f).split(/\r?\n/);
    lines.forEach((ln, i) => {
      if (!/\.getImageData\(/.test(ln)) return;
      for (let j = i; j >= Math.max(0, i - 40); j--) {
        const m = lines[j].match(/getContext\((['"])2d\1([^)]*)\)/);
        if (!m) continue;
        /* only a canvas MADE here: getContext on a canvas someone else made returns THEIR context and the
           options are ignored (js/map-recorder.js probes other canvases for taint that way) */
        const made = lines.slice(Math.max(0, j - 15), j + 1).some((l) => /createElement\((['"])canvas\1\)|new OffscreenCanvas\(|newCanvas\(/.test(l));
        if (made && !/willReadFrequently\s*:\s*true/.test(m[2])) misses.push(`js/${f}:${j + 1} (read at :${i + 1})`);
        return;
      }
    });
  }
  assert.deepEqual(misses, [], 'a 2D context read back without willReadFrequently pays a GPU readback');
});

/* ② The star field is not drawn star by star on the CPU each camera frame. */
test('② the sky draws its square stars in one GPU draw, and keeps the canvas loop as the fallback', () => {
  const src = read('js/space-sky.js');
  assert.match(src, /gl\.drawArrays\(gl\.POINTS/, 'one draw call for the field');
  /* (mobile-map-speed) …and it is SHOWN where it was drawn: copying the WebGL canvas into the 2D one each frame was a GPU read-back */
  assert.doesNotMatch(src, /drawImage\(\s*field/, 'the field is not copied onto #space-canvas every frame');
  assert.match(src, /c\.id='space-stars'/, 'the GL canvas is its own page element');
  assert.match(read('css/intmap.css'), /#space-canvas,#space-stars\{/, 'with the same box as #space-canvas');
  assert.match(src, /stars\.big/, 'the loop paints only the halos and discs when the GPU drew the field');
  assert.match(src, /webglcontextlost/, 'a lost context falls back to the canvas loop instead of a blank sky');
});

/* ③ What the first frame does not draw waits for the app to be touchable — on every device. */
test('③ a settled row is settled on a desktop too, and the runtime check reads the same rule', async () => {
  globalThis.window = globalThis;
  delete globalThis.__imBootStage;
  const { BootStage } = await import('../js/boot-stage.js?speed-overhaul');
  for (const r of BootStage.plan()) {
    const desk = BootStage.stageFor(r, false);
    if (r.other) assert.equal(desk, r.other, r.id);
    else if (r.phone === 'settled') assert.equal(desk, 'settled', r.id + ' is settled on a phone and must be on a desktop');
    else assert.equal(desk, 'boot', r.id);
  }
  assert.match(read('scripts/frame-profile.mjs'), /BootStage\.stageFor\(/, 'frame-profile must not keep its own copy of the rule');
});

/* ④ An Atlas step does not wait for Auth and then the plan, and does not pay a preflight every time. */
test('④ ai-proxy reads the plan beside the token check and lets the browser keep its preflight', () => {
  const ask = read('supabase/functions/ai-proxy/ask.ts');
  const iEarly = ask.indexOf('accountFor(db, claimed');
  const iUser = ask.indexOf('await userClient.auth.getUser()');
  assert.ok(iEarly > 0 && iUser > iEarly, 'the plan read starts before getUser() is awaited');
  assert.match(ask, /claimed === user\.id && await early/, 'the early read is used only for the verified user');
  assert.match(read('supabase/functions/ai-proxy/config.ts'), /"Access-Control-Max-Age":\s*"\d+"/);
});

/* ⑤ The 10 m outline upgrade gives the thread back by TIME in both of its walks. MEASURED (390×844, CPU ×4):
   the second walk (home/full extents of ~250 codes) never yielded — a ~600 ms task under the next pan. */
test('⑤ both walks of the 10 m country upgrade yield on a time budget', () => {
  const src = read('js/countries-ui.js');
  const up = src.slice(src.indexOf('const upgrade=async()=>{'), src.indexOf("HOST.countryGeo=hi; window.countryGeo=hi;"));
  assert.ok(up.length > 200, 'the upgrade pass was found');
  assert.match(up, /const slice=async\(\)=>\{ if\(performance\.now\(\)-_t0<SLICE_MS\) return;/, 'one time-budgeted yield');
  assert.equal((up.match(/await slice\(\);/g) || []).length, 2, 'used by the area walk AND the extents walk');
  assert.doesNotMatch(up, /best\.forEach\(/, 'no synchronous walk over the codes is left');
});
