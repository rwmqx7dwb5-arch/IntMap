/* ============================================================================
 *  IntMap · the Atlas panel — how a reply is typeset, which language it is in, and the panel's own controls
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r152-checks.test.mjs #3 #5, tests/r153-checks.test.mjs #3,
 *  tests/r154-checks.test.mjs #2 #7, tests/r155-checks.test.mjs (reply-language lock, geolocation,
 *  typography mandate) and tests/r233-checks.test.mjs ⑧ (the full-screen picture viewer).
 *  From their headers:
 * ==========================================================================*/
//   #3  Atlas typography — flat prose gets a bold LEAD line + bigger headings + more spacing
//   #5  Atlas toggles — fullscreen switch + generic on/off control switch (catch-all)
//   #3  Atlas typography — _atlStanza synthesises structure from ANY unstructured reply (multi-paragraph too, CJK-weighted;
//       model "Label:" leads → ## headings; opening sentence → bold lead); bigger lead + more paragraph spacing
//   #2  Atlas typography — headings differentiate by SIZE + SPACING only, NO colour ("目次を色分けするのはやめる");
//       _atlStanza no longer FABRICATES headings (opening-sentence bold-lead + "Label:"→## removed = "判定がおかしい" fix)
//   #7  Atlas voice input — .atl-mic button + Web Speech API dictation
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const index = html;             /* #R155's name for the same concatenation */
const read = (p) => readFileSync(new URL(p, root), 'utf8');
/* ⚠ WHY THESE READ THE SOURCE. The reply renderer, the system prompt and the panel controls live inside the
   Atlas console / attach modules, which run only against the whole app host (DOM, renderer, auth);
   the prompt sentences ARE the behaviour (the model reads them). What is pinned is that text. */
test('R152 #3 Atlas typography — size + spacing hierarchy, NO fabricated headings', () => {
  /* spelling kept — Atlas panel / prompt code that runs only with the whole app host; prompt sentences are the behaviour the model reads */
  // (#R154) the opening-sentence→bold-lead fabrication was the "テキストを大きくする箇所がおかしい／判定がおかしい" cause — REMOVED
  assert.ok(!/out\.push\('\*\*'\+first\+'\*\*'\)/.test(html), 'R154: opening sentence is NOT promoted to a bold lead (no wrong enlargement)');
  // (#R158) hierarchy strengthened (bigger jumps + stronger neutral divider) — still no colour, no fabricated headings
  assert.match(html, /font-size:1\.9em;letter-spacing:\.012em/, 'h1 (1.9em, R158)');
  assert.match(html, /font-size:1\.56em;line-height:1\.25;letter-spacing:\.006em/, 'h2 (1.56em, R158)');
  /* (#R494) the same 1.5em rhythm, declared once on the paragraph instead of emitted as an empty div */
  assert.match(html, /\.atl-p\{margin:0 0 1\.5em;/, 'generous paragraph gap (1.5em, R158)');
});

test('R152 #5 Atlas toggles — fullscreen switch + generic on/off control switch', () => {
  /* spelling kept — Atlas panel / prompt code that runs only with the whole app host; prompt sentences are the behaviour the model reads */
  assert.match(html, /fullscreen:\{ lbl:\(\)=>L\('Fullscreen'/, 'fullscreen has a _FEAT_TOG entry');
  assert.match(html, /_featTogHtml\('fullscreen'\)/, 'fullscreen case renders the switch');
  assert.match(html, /function _ctlTogHtml\(target, el\)\{/, 'generic control toggle exists');
  assert.match(html, /note\('✓ '\+nm\+': '\+\(want\?'on':'off'\)\)\+_ctlTogHtml\(a\.target\|\|el\.id,el\)/, 'checkbox controls get a switch');
  assert.match(html, /closest\('\.atl-ctl-gen'\)/, 'generic-toggle click handler (before the layer-toggle branch)');
});

test('R153/R154 #3 Atlas typography — safe reflow only, NO fabricated headings', () => {
  /* spelling kept — Atlas panel / prompt code that runs only with the whole app host; prompt sentences are the behaviour the model reads */
  assert.match(html, /function _atlStanza\(raw\)\{/, 'stanza reflow exists');
  // (#R154) "判定がおかしい" fix: stop guessing headings from prose — only the MODEL's own ## / whole-line **bold** enlarge
  assert.ok(!/out\.push\('## '\+label\)/.test(html), 'R154: a sentence-initial "Label:" is NOT turned into a ## heading');
  assert.ok(!/out\.push\('\*\*'\+first\+'\*\*'\)/.test(html), 'R154: the opening sentence is NOT promoted to a bold lead');
  assert.match(html, /model emitted real headings already → respect verbatim/, 'model-authored ## structure is respected as-is');
  assert.match(html, /long run-on → ~2-sentence stanzas \(spacing only, no enlargement\)/, 'the only reflow is stanza-splitting (spacing, not enlargement)');
  /* (#R494) the same 1.5em rhythm, declared once on the paragraph instead of emitted as an empty div */
  assert.match(html, /\.atl-p\{margin:0 0 1\.5em;/, 'paragraph gap 1.5em (R158)');
  // headings are colourless now
  assert.match(html, /HEADINGS DIFFERENTIATE BY SIZE \+ SPACING ONLY — NO COLOUR/, 'headings size/spacing only, no colour');
});

test('R154 #2 Atlas typography — size/spacing only, no colour, no fabricated headings', () => {
  /* spelling kept — Atlas panel / prompt code that runs only with the whole app host; prompt sentences are the behaviour the model reads */
  assert.match(html, /HEADINGS DIFFERENTIATE BY SIZE \+ SPACING ONLY — NO COLOUR/, 'explicit no-colour heading policy');
  // none of the four heading rules may carry --primary-color
  assert.ok(!/margin:1\.\d+em 0 [^;]*;font-size:1\.\d+em;line-height:1\.3\d*;">\$1<\/div>'\)\s*$/m.test(html) || true, 'sanity');
  assert.ok(!/color:var\(--primary-color\);margin:1\.\d+em 0 [^;]*;font-size:1\.\d/.test(html), 'no heading rule uses --primary-color');
  /* (#R494) the heading style is a CSS rule on real <h1>…<h6> now; weight and colour — what this
     line exists for — are stated once, for every level, instead of three times for three of them */
  assert.match(html, /\.atl-h\{font-weight:600;color:var\(--text-main\);/, 'h3 heading is text-main (R159 weight 600 — no bold, no colour)');
  assert.ok(!/out\.push\('## '\+label\)/.test(html), 'no "Label:"→## fabrication');
  assert.ok(!/out\.push\('\*\*'\+first\+'\*\*'\)/.test(html), 'no opening-sentence→bold-lead fabrication');
  assert.match(html, /NO MORE HEADING FABRICATION/, '_atlStanza documents the removal of guesswork');
  // the prompt tells the model not to enlarge ordinary sentences
  assert.match(html, /Use a heading ONLY for a genuine section title, never to enlarge an ordinary sentence\./, 'prompt forbids enlarging non-headings');
});

test('R154 #7 Atlas voice input', () => {
  /* spelling kept — Atlas panel / prompt code that runs only with the whole app host; prompt sentences are the behaviour the model reads */
  assert.match(html, /<button class="atl-mic"/, 'mic button in the input bar');
  assert.match(html, /const SR=window\.SpeechRecognition\|\|window\.webkitSpeechRecognition;/, 'Web Speech API');
  assert.match(html, /if\(mic&&!SR\)\{ mic\.style\.display='none'; \}/, 'mic hidden when unsupported');
  /* ⚠ (#R318) THE INVARIANT IS "RECOGNITION FOLLOWS THE UI LANGUAGE", NOT "there is a table of
     five". The table WAS the defect: IntMap has nine languages and four of them were dictating in
     American English. js/lang-registry.js `locale()` answers for all nine (and for the tenth). */
  /* (module-graph) the registry is an imported binding now, no longer read off window */
  assert.match(html, /rec\.lang=IntMapLang\.locale\(HOST\.lang\)\|\|'en-US';/, 'recognition language follows the UI language');
  assert.doesNotMatch(html, /const langMap=\{jp:'ja-JP'/, 'the five-language table must not come back');
  assert.match(html, /L\('Voice input','音声入力','Spracheingabe','Голосовой ввод','Entrada de voz'\)/, 'mic title localized to 5 languages');
});

test('#R155 Atlas reply-language lock (no "mirror the message, never UI")', () => {
  /* spelling kept — Atlas panel / prompt code that runs only with the whole app host; prompt sentences are the behaviour the model reads */
  assert.ok(!/ALWAYS mirror the user's language, never the UI language/.test(index), 'the message-mirror wording is gone');
  assert.match(index, /NEVER changes the reply language/, 'place names do not change the reply language');
});

test('#R155 Atlas geolocation asks / gives actionable denial (not a dead-end)', async () => {
  /* (installable-app) RUN, not read. The reading moved to js/locate-me.js (one implementation for every
     door), so the claims are asked of view.locate itself with a device stub: a site the browser has
     HARD-blocked is told so without the sensor being asked (#R155 — the browser will never re-prompt),
     and a refusal at the prompt is told apart from a sensor that simply had no fix. */
  const locate = (await import('../js/atlas-cap-view.js')).default.find((e) => e.row[0] === 'view.locate');
  const K = { R: (ok, html, extra) => Object.assign({ ok, html }, extra || {}), warn: (x) => x, note: (x) => x, L: (en) => en,
    GE: () => ({ camera: { flyTo() {}, getZoom: () => 3 } }), _selfLocSeed() {} };
  const run = async (nav) => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
    try { return await locate.run({}, {}, K); }
    finally { if (had) Object.defineProperty(globalThis, 'navigator', had); else delete globalThis.navigator; }
  };
  let asked = 0;
  const geo = (code) => ({ getCurrentPosition: (_ok, err) => { asked++; err({ code }); } });
  const blocked = await run({ geolocation: geo(1), permissions: { query: async () => ({ state: 'denied' }) } });
  assert.equal(blocked.ok, false);
  assert.equal(asked, 0, 'permission state pre-check: a hard-blocked site is not asked again');
  assert.match(blocked.html, /blocked for this site.*browser/i, 'and is told where to turn it back on');
  const denied = await run({ geolocation: geo(1), permissions: { query: async () => ({ state: 'prompt' }) } });
  assert.match(denied.html, /permission was denied.*browser settings/i, 'distinguishes PERMISSION_DENIED');
  const noFix = await run({ geolocation: geo(2), permissions: { query: async () => ({ state: 'granted' }) } });
  assert.doesNotMatch(noFix.html, /denied|blocked/i, 'a sensor with no fix is not reported as a refusal');
});

test('#R155 Atlas typography: forceful format mandate + sharper heading render', () => {
  /* spelling kept — Atlas panel / prompt code that runs only with the whole app host; prompt sentences are the behaviour the model reads */
  assert.match(index, /NEVER write more than ~3 sentences in a row without a "## " heading or a bullet/, 'mandate present');
  // (#R159) the "## " section hairline divider was removed ("区切りの横線はいらない") — no reply carries a horizontal rule
  assert.doesNotMatch(index, /border-top:1\.5px solid rgba\(128,128,128,\.34\)/, 'R159 removed the ## section hairline divider');
});

/* ── ⑧ the Atlas picture viewer ──────────────────────────────────────────────────────────────── */
test('R233 Atlas: the full-screen picture zooms, and its ✕ is a square', () => {
  /* spelling kept — Atlas panel / prompt code that runs only with the whole app host; prompt sentences are the behaviour the model reads */
  const a = read('js/atlas-attach.js');
  /* every input a viewer is expected to answer */
  assert.match(a, /addEventListener\('wheel'/, 'wheel zooms');
  assert.match(a, /addEventListener\('dblclick'/, 'double-click toggles');
  assert.match(a, /pts\.size >= 2/, 'two fingers pinch');
  assert.match(a, /pointermove/, '…and one finger pans');
  /* zoom is about the POINTER — the arithmetic that keeps the pixel under the finger fixed */
  assert.match(a, /TX = dx - \(dx - TX\) \* \(s2 \/ S\)/, 'the point under the cursor stays put');
  /* a pan that ends over the backdrop must not be read as "close" */
  assert.match(a, /if \(moved\) \{ moved = false; return; \}/, 'dragging a zoomed picture cannot dismiss it');
  /* the pinch has to reach the element rather than the browser's page zoom */
  assert.match(a, /touch-action:none/, 'the image owns its own touch gestures');

  /* 「×ボタンは丸ではなく四角に。」 — the circle is gone from the ✕ rule specifically */
  const xRule = /\.atl-lightbox \.atl-lb-x\{([^}]*)\}/.exec(a);
  assert.ok(xRule, 'the close button still has a rule');
  assert.doesNotMatch(xRule[1], /border-radius:50%/, 'the ✕ is not a circle any more');
  assert.match(xRule[1], /border-radius:\d+px/, '…it is a rounded square');
});
