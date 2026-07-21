// R149 source-level regression checks (deterministic, no browser needed).
// Guards the batch:
//   #7  monitor "create does nothing" ROOT CAUSE  (window.imToast was undefined → toasts silently no-op'd)
//   #3  Köppen legend compacted so all 30 zones fit + stretch to the last class
//   #4  Atlas reply typography — stronger em-based heading hierarchy
//   #5  send button ↑ arrow solid black even when idle
//   #6  bigger stop square    #8 choice free-input send button = white + SVG (no plain-text →)
//   #9  image paste / vision (client wiring)     #10 mapping-quality commission
//   #2  ticker on/off toggle
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const aiproxy = readFileSync(new URL('supabase/functions/ai-proxy/index.ts', root), 'utf8');

test('R149 #7 monitor toast root cause: _toast calls the closure fns (not window.imToast) with an alert fallback', () => {
  // The bug: index.html is NOT a module, so imToast/aiToast are closure-scoped, never on window.
  // Guarding on window.imToast made EVERY monitor toast (incl. create-failure feedback) silently no-op.
  const m = html.match(/function _toast\(msg\)\{[^\n]*\}/);
  assert.ok(m, '_toast is defined on one line');
  const t = m[0];
  assert.ok(/typeof imToast==='function'/.test(t), '_toast uses typeof imToast guard');
  assert.ok(/typeof aiToast==='function'/.test(t), '_toast falls back to aiToast');
  assert.ok(/alert\(String\(msg\)\)/.test(t), '_toast has a guaranteed alert() last resort');
  assert.ok(!/if\(window\.imToast\)\s*return imToast/.test(html), 'the broken window.imToast guard is gone');
});

test('R149 #7 monitor create dialog shows guaranteed INLINE failure feedback', () => {
  assert.match(html, /id="mon-create-err"/, 'inline error element exists in the create dialog');
  assert.match(html, /const showErr=\(m\)=>\{/, 'create handler has a showErr helper');
  // both the no-area path and the create() failure path surface it
  assert.ok((html.match(/showErr\(/g) || []).length >= 2, 'showErr used for no-area AND create failure');
});

test('R149/R150 #3 Köppen legend stretches to the screen bottom (viewport-based ceiling)', () => {
  assert.match(html, /max-height:calc\(100dvh - 84px\)/, 'CSS ceiling near full viewport');
  // (#R150) fit is now VIEWPORT-based (down to ~12px above the screen bottom), NOT clamped to content — so the
  // resize grip can be dragged all the way down; the old content-height cap made "一番下まで伸ばせない".
  assert.match(html, /const renderedMax=Math\.round\(window\.innerHeight - top - 8\)/, 'JS fit is viewport-based (R154: 12→8 for more reach)');
  assert.ok(!/const cap=Math\.round\(window\.innerHeight - 84\)/.test(html), 'old content-clamp cap removed');
  assert.match(html, /\.kl-item\{ display:flex; align-items:center; gap:6px; padding:0 4px; cursor:pointer; border-radius:5px; white-space:nowrap;/, 'R152/R153: single-line compact rows (nowrap kills the 2-line wrap; R153 padding 0 for a shorter 30-row block)');
  assert.match(html, /\.kl-item \.kl-nm\{ flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis;/, 'R152: climate name ellipsises on one line');
  assert.match(html, /\.kl-sw\{ width:11px; height:11px;/, 'smaller swatch');
});

test('R149 #4 Atlas typography: em-based heading hierarchy in mdMini', () => {
  // (#R154) headings differentiate by SIZE + SPACING only — NO colour ("目次を色分けするのはやめる")
  assert.match(html, /font-size:1\.68em;letter-spacing:\.01em/, 'h1 ~1.68em (R155)');
  assert.match(html, /font-size:1\.44em;line-height:1\.28;letter-spacing:\.005em/, 'h2 ~1.44em (R155)');
  assert.match(html, /font-size:1\.18em;line-height:1\.32/, 'h3 ~1.18em (R155)');
  assert.ok(!/color:var\(--primary-color\);margin:1\.\d+em 0 [^;]*;font-size:1\.\d+em/.test(html), 'R154: heading rules no longer use --primary-color (size/spacing only)');
  assert.match(html, /'<div style="height:1\.3em"><\/div>'/, 'paragraph gap ~1.3em (R155)');
  // prompts mandate the structure
  assert.match(html, /FORMAT FOR READABILITY — REQUIRED for any answer longer than/, 'answer prompt mandates structure');
});

test('R149 #5/#6 send button arrow solid black when idle; bigger stop square', () => {
  assert.match(html, /\.atl-go\.idle\{background:#fff;box-shadow:0 1px 4px rgba\(0,0,0,0\.12\);color:#111;\}/, 'idle icon is #111 (not muted rgba)');
  assert.ok(!/\.atl-go\.idle\{[^}]*rgba\(120,120,128,0\.75\)/.test(html), 'old faded idle colour removed');
  assert.match(html, /_GO_STOP_SVG='<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4\.25" y="4\.25" width="15\.5" height="15\.5"/, 'stop square slightly smaller (R150 17.5→15.5)');
});

test('R149 #8 choice free-input send button = white bg + SVG (no plain-text →)', () => {
  // the .atl-choice-go button must no longer be accent bg with a plain-text arrow
  assert.match(html, /class="atl-choice-go"/, 'atl-choice-go button present');
  assert.match(html, /background:#fff;color:#111;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;box-shadow:0 1px 4px rgba\(0,0,0,0\.14\);"><svg/, 'white bg + black + SVG icon');
  assert.ok(!/;">→<\/button>/.test(html), 'no plain-text → glyph in a send button');
});

test('R149 #9 image paste/vision wired on the client (transport + proxy already support images)', () => {
  assert.match(html, /let _atlImgs=\[\]/, 'pending image buffer');
  assert.match(html, /inEl\.addEventListener\('paste'/, 'paste handler on the input');
  assert.match(html, /async function _atlAddFiles\(files\)/, 'add-files helper');
  assert.match(html, /compressImage\(f,1100,0\.72\)/, 'reuses compressImage → JPEG data URL');
  // run() threads images to the planner call (was hardcoded null)
  assert.match(html, /async function run\(q,imgs\)\{/, 'run accepts images');
  assert.match(html, /buildPrompt\(q,_profile\)\+\(imgs\.length\?[\s\S]*?\),SYS\(\),imgs,\{task:'atlas_plan'/, 'planner call gets imgs (not null)');
  assert.match(html, /class="atl-attach"/, 'attach button present');
  // server already supports vision
  assert.match(aiproxy, /const MAX_IMAGES = 4/, 'proxy caps images');
  assert.match(aiproxy, /type: "input_image"/, 'proxy forwards OpenAI input_image');
});

test('R149 #10 mapping-quality commission: reply places get pinned + honest self-audit', () => {
  assert.match(html, /async function _pinReplyPlaces\(places, ctx\)/, 'reply-place pinning helper');
  // (#R150) the orchestrator now audits via the pure verdict (mapped/unplaced/ambiguous) + merges pins; see r150-checks.
  assert.match(html, /_atlMappingNoteHtml\(_atlMappingVerdict\(spots\)/, 'reply mapping folds into the pure verdict');
  assert.match(html, /but not placed \(couldn/, 'honest not-placed note (R150 wording)');
  // analyze parses a PLACES: trailer (no extra AI call), answer carries a places array
  assert.match(html, /PLACES\\s\*\[:：\]/, 'analyze strips a PLACES: trailer');
  assert.match(html, /"type":"answer","text":str,"places"\?:\[\{"n":str,"c":str,"k":str\}\]/, 'answer action schema has places');
  assert.match(html, /MAPPING MANDATE/, 'planner carries the mapping mandate');
  assert.match(html, /Self-audit before finishing/, 'self-audit instruction');
});

test('R149 #2 ticker gets an on/off toggle', () => {
  assert.match(html, /ticker:\{ lbl:\(\)=>L\('Bottom ticker'/, 'ticker in _FEAT_TOG');
  assert.match(html, /note\('✓ '\+L\('Bottom ticker'[\s\S]*?\)\)\+_featTogHtml\('ticker'\)/, 'ticker reply offers the toggle');
});
