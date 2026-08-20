// R147 source-level regression checks (deterministic, no browser needed).
// Guards the config / prompt / map-style changes that are hard to assert headless:
//   #12 model Luna→Terra   #13 free quota 30→10   #10 Atlas scope/safety layer
//   #2  Japanese keigo      #5  SV fluorescent 水色  #9  satellite instant fade
//   #14 monitor create map-view fallback
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const aiproxy = readFileSync(new URL('supabase/functions/ai-proxy/index.ts', root), 'utf8');

test('R147 #13 free AI quota is 10/day on the client and server', () => {
  assert.match(html, /const AI_FREE_DAILY\s*=\s*10\b/, 'client AI_FREE_DAILY=10');
  assert.match(aiproxy, /free:\s*10\b/, 'server PLAN_LIMITS.free=10');
  assert.ok(!/up to 30 uses per day/.test(html), 'no stale "30 uses per day" copy');
  assert.ok(!/1日30回/.test(html), 'no stale JP "1日30回"');
});

test('R150 #9 Atlas model = GPT-5.6 Terra (re-verified reachable); Luna is the fallback; Gemini Flash-Lite unused', () => {
  // (#R150) R148 ran Luna because this project 403'd Terra. Re-verified 2026-07-21 via the refresh-news proxy
  // (same key + AI_MODEL, no model fallback): AI_MODEL=gpt-5.6-terra geocoded 61/63 EN + 104/116 JP → Terra is
  // now reachable, so it is the default per the user's standing request. Luna stays the resilient FALLBACK_MODEL.
  assert.match(aiproxy, /provider === "openai" \? OPENAI_DEFAULT_MODEL/, 'openai default = OPENAI_DEFAULT_MODEL');
  assert.match(aiproxy, /const OPENAI_DEFAULT_MODEL = "gpt-5\.6-terra"/, 'default model = Terra');
  assert.match(aiproxy, /const FALLBACK_MODEL = "gpt-5\.6-luna"/, 'fallback model = Luna (resilience)');
  assert.match(aiproxy, /Flash-Lite is never used/, 'documents that Gemini Flash-Lite is never used');
  const aiproxyNoNote = aiproxy.replace(/Gemini 3\.1 Flash-Lite is never used\./g, '');
  assert.ok(!/flash-lite/i.test(aiproxyNoNote), 'flash-lite appears only in the "never used" note');
  assert.ok(!/flash-lite/i.test(html), 'no flash-lite in index.html');
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

/* (#R285 追記) THE RULE DID NOT GO AWAY — IT MOVED, AND IT STOPPED HAVING AN EXIT.
   #R147's contract was «Atlas is polite in Japanese», and it checked the app SHELL because that is
   where the instruction was written, twice, by hand. #R285 made the register part of the persona, so
   the one place it may live is js/atlas-persona.js — which is not in the shell, and this test would
   have gone quiet had it kept pointing there. It now asserts the SAME contract at its real home, and
   the strengthening the specification asked for: 「ただし常に自然な敬語」 — no "unless the user is
   casual" escape anywhere. tests/r285-checks ⑥ is the other half (nothing carries a second copy). */
test('R147 #2 Atlas is polite in Japanese — always, and from exactly one place', () => {
  const persona = readFileSync(new URL('js/atlas-persona.js', root), 'utf8');
  assert.match(persona, /です・ます／自然な敬語/, 'the keigo instruction is in the persona');
  assert.match(persona, /at all times, including when the user writes casually/,
    'the register is unconditional — 「ただし常に自然な敬語」');
  assert.ok(!/unless the user is clearly casual/i.test(persona),
    'the superseded opt-out came back into the persona');
  /* ⚠ NOT «the rule appears nowhere else» — `html` here is appSource(), which is index.html + css +
     ALL of js/, so it contains js/atlas-persona.js and the canonical copy would fail its own check.
     That question belongs to tests/r285-checks ⑥, which walks the same tree with the two canonical
     files excluded. This test owns «the rule exists, at its one home, without an exit». */
  assert.match(html, /です・ます／自然な敬語/, 'the instruction still reaches the bundled app');
});

test('R147/R152 Street View coverage is a cyan light-blue, THINNER line (R152 dropped the glow)', () => {
  assert.match(html, /'raster-saturation':0\.9/, 'kept saturated cyan');
  assert.match(html, /'raster-hue-rotate':-42/, 'stronger cyan hue');
  // (#R152) the R147 brightness-min:0.5 + contrast:0.15 glow bloated the line — dropped for a thinner stroke
  assert.match(html, /'raster-hue-rotate':-42,'raster-resampling':'linear'/, 'R152: glow paint dropped, linear resampling for thin smooth edges');
  assert.ok(!/'raster-brightness-min':0\.5,'raster-contrast':0\.15/.test(html), 'R152: the brightness-min+contrast glow pair is gone');
});

test('R147 #9 satellite base layer does not use MapLibre’s 300 ms cross-fade', () => {
  /* (#R191) #R147 was right that 300 ms of half-drawn imagery under a moving finger reads as lag, and
     that is still the contract here. But 0 is a HARD SWAP per tile, and a screenful of children
     replacing their parents one at a time is exactly the reported 点滅 — plus at 0 there is nothing
     holding the parent while the child loads. 180 ms is under the threshold at which a transition
     reads as a delay. What this test pins is the range: fast, and not MapLibre's default. */
  const m = /id:'layer-sat'[\s\S]{0,140}'raster-fade-duration':(\d+)/.exec(html);
  assert.ok(m, 'layer-sat declares a fade duration');
  assert.ok(+m[1] < 300, `layer-sat fade is faster than MapLibre's 300 ms default (got ${m[1]})`);
  assert.match(html, /'satellite':\{type:'raster',tiles:\(window\.__imSatProto\?\['imapsat/, 'satellite source uses the R158 tile protocol (grey-tile fix)');
  assert.match(html, /'satellite':\{type:'raster'[\s\S]{0,400}maxzoom:19,attribution/, 'satellite source maxzoom cap 19');
});

test('R147 #14 monitor create dialog falls back to the current map view', () => {
  assert.match(html, /if\(!area\)\{ const mv=mapViewArea\(\); if\(mv\)\{ area=mv; usingView=true; \} \}/,
    'openCreateDialog defaults to mapViewArea when no area is set');
});
