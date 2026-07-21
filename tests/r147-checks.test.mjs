// R147 source-level regression checks (deterministic, no browser needed).
// Guards the config / prompt / map-style changes that are hard to assert headless:
//   #12 model Luna→Terra   #13 free quota 30→10   #10 Atlas scope/safety layer
//   #2  Japanese keigo      #5  SV fluorescent 水色  #9  satellite instant fade
//   #14 monitor create map-view fallback
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const aiproxy = readFileSync(new URL('supabase/functions/ai-proxy/index.ts', root), 'utf8');

test('R147 #13 free AI quota is 10/day on the client and server', () => {
  assert.match(html, /const AI_FREE_DAILY\s*=\s*10\b/, 'client AI_FREE_DAILY=10');
  assert.match(aiproxy, /free:\s*10\b/, 'server PLAN_LIMITS.free=10');
  assert.ok(!/up to 30 uses per day/.test(html), 'no stale "30 uses per day" copy');
  assert.ok(!/1日30回/.test(html), 'no stale JP "1日30回"');
});

test('R147 #12 Atlas model is GPT-5.6 Terra; Gemini 3.1 Flash-Lite is never used', () => {
  assert.match(aiproxy, /provider === "openai" \? "gpt-5\.6-terra"/, 'openai default = terra');
  assert.match(aiproxy, /Flash-Lite is never used/, 'documents that Gemini Flash-Lite is never used');
  // flash-lite is allowed ONLY in that "never used" note — nowhere else (esp. not as a model id).
  const aiproxyNoNote = aiproxy.replace(/Gemini 3\.1 Flash-Lite is never used\./g, '');
  assert.ok(!/flash-lite/i.test(aiproxyNoNote), 'flash-lite appears only in the "never used" note');
  assert.ok(!/flash-lite/i.test(html), 'no flash-lite in index.html');
  // The active model id in comments/docs is Terra, not Luna.
  assert.ok(!/gpt-5\.6-luna/.test(aiproxy), 'no lingering gpt-5.6-luna in ai-proxy');
});

test('R147 #10 Atlas planner prompt carries the scope/safety judgment layer', () => {
  assert.match(html, /SCOPE & SAFETY/, 'scope/safety section present');
  for (const axis of ['PURPOSE', 'TARGET', 'PRECISION', 'OUTPUT']) {
    assert.ok(html.includes(axis + ':'), 'decomposition axis ' + axis);
  }
  assert.match(html, /TRANSFORM it and EXECUTE/, 'transform-not-refuse');
  assert.match(html, /full refusal is the LAST resort/i, 'refuse = last resort');
  for (const dom of ['disasters', 'disease', 'chemicals', 'crime', 'cyber', 'critical infrastructure']) {
    assert.ok(html.includes(dom), 'domain generality includes ' + dom);
  }
  // constructive (non-dead-end) provider_blocked message
  assert.match(html, /Try rephrasing it as a public-information, broad-area analysis/);
});

test('R147 #2 Atlas defaults to polite Japanese (keigo) unless the user opts out', () => {
  assert.match(html, /敬語/, 'keigo instruction present');
  assert.match(html, /polite form/, 'polite-form instruction present');
});

test('R147 #5 Street View coverage is a vivid fluorescent light-blue', () => {
  assert.match(html, /'raster-saturation':0\.95/, 'boosted saturation');
  assert.match(html, /'raster-hue-rotate':-42/, 'stronger cyan hue');
  assert.match(html, /'raster-brightness-min':0\.5/, 'brightness lift (glow)');
});

test('R147 #9 satellite base layer has instant tile fade (no 300ms cross-fade)', () => {
  assert.match(html, /id:'layer-sat'[\s\S]{0,140}'raster-fade-duration':0/, 'layer-sat fade 0');
  assert.match(html, /'satellite':\{type:'raster'[\s\S]{0,260}maxzoom:19\}/, 'satellite source maxzoom cap');
});

test('R147 #14 monitor create dialog falls back to the current map view', () => {
  assert.match(html, /if\(!area\)\{ const mv=mapViewArea\(\); if\(mv\)\{ area=mv; usingView=true; \} \}/,
    'openCreateDialog defaults to mapViewArea when no area is set');
});
