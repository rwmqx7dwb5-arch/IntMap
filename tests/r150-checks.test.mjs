// R150 source-level regression checks (deterministic, no browser).
// Guards the batch:
//   #1  Companies icon slot pixel-matches the Countries flag slot
//   #2  Atlas Street-View OFF reply also offers the on/off toggle
//   #3  Köppen legend ceiling is VIEWPORT-based (drag to the screen bottom)  [also in r149-checks]
//   #4  Atlas typography: _atlStanza groups a flat wall + a sentence-end newline becomes a soft gap
//   #5  Stop-answering square slightly smaller (17.5 → 15.5)                 [also in r149-checks]
//   #6  Monitor "Could not save" ROOT CAUSE — client sets user_id + DB default auth.uid()
//   #7  Geo-target unification — ONE ambiguity gate; confirmation never co-displays with a painted result
//   #8  Satellite: flight-sim prefetch ahead of the aircraft + sat-labels host round-robin
//   #9  Atlas model = GPT-5.6 Terra (default), Luna fallback                 [also in r147-checks]
//   #10 Research-mapping code-side verification (pure audit + merge-not-wipe orchestrator + no empty catch)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const aiproxy = readFileSync(new URL('supabase/functions/ai-proxy/index.ts', root), 'utf8');
const migDir = new URL('supabase/migrations/', root);
const migs = readdirSync(migDir).map(f => readFileSync(new URL(f, migDir), 'utf8')).join('\n');

test('R150 #6 monitor save root cause — client sets user_id AND the DB defaults it to auth.uid()', () => {
  // area_monitors.user_id is `not null` + insert RLS `with check (user_id = auth.uid())`; the client row
  // previously OMITTED user_id, so every UI insert failed → "Could not save the monitor."
  // (#R162) IntMapMonitors moved to js/monitors.js, so the session user now arrives through the
  // explicit host interface (H.user, a live getter over currentUser) instead of the closure.
  // Same behaviour — create() still derives user_id client-side rather than omitting it.
  // (#R163) the host parameter was renamed H → HOST (the old name collided with ordinary `H` locals
  // for Height/Hourly in the newly-split modules) and the object itself is now the shared IM_HOST.
  assert.match(html, /const _uid=\(HOST\.user&&HOST\.user\.id\)\|\|null;/, 'create() derives the session user id');
  assert.match(html, /get user\(\)\{ return currentUser; \}/, 'HOST.user is a LIVE read of currentUser (login/logout must not go stale)');
  assert.match(html, /const row=\{ user_id:_uid, name:/, 'insert row now carries user_id (like feedback/bug_reports/donations)');
  // belt-and-suspenders DB default
  assert.match(migs, /alter column user_id set default auth\.uid\(\)/, 'migration adds a DB default of auth.uid()');
});

test('R150 #3 Köppen legend ceiling is viewport-based so the grip reaches the screen bottom', () => {
  assert.match(html, /const renderedMax=Math\.round\(window\.innerHeight - top - 8\)/, 'ceiling = viewport bottom (R154: 12→8), not content height');
  assert.ok(!/const cap=Math\.round\(window\.innerHeight - 84\)/.test(html), 'old content-clamp removed');
  assert.match(html, /一番下まで伸ばせない/, 'comment records the exact re-report it fixes');
});

test('R150 #5 stop-answering square trimmed 17.5 → 15.5', () => {
  assert.match(html, /_GO_STOP_SVG='<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4\.25" y="4\.25" width="15\.5" height="15\.5"/, 'rect is 15.5 in a 24 viewBox');
  assert.ok(!/width="17\.5" height="17\.5" rx="3\.5"/.test(html), 'the R149 17.5 square is gone');
});

test('R150 #4 typography: flat prose gets code-side rhythm (stanza + sentence-end gap)', () => {
  assert.match(html, /function _atlStanza\(raw\)\{/, 'stanza grouping helper exists');
  // (R153) the ">1 newline → return raw" bail was the reason multi-paragraph flat prose stayed monotone; it is REMOVED.
  // _atlStanza now restructures multi-paragraph prose too — respecting only replies that already have real ## headings.
  assert.ok(!/if\(\(raw\.match\(\/\\n\/g\)\|\|\[\]\)\.length>1\) return raw;/.test(html), 'R153: the >1-newline bail is gone (was why multi-paragraph prose stayed flat)');
  assert.match(html, /if\(\/\^\\s\*#\{1,6\}\\s\/m\.test\(raw\)\) return raw;/, 'R153: only ALREADY-##-structured replies are left untouched');
  assert.match(html, /esc\(_dedupText\(_atlStanza\(s\)\)\)/, 'mdMini runs the stanza pass first (R156: on the placeholder-protected string)');
  assert.match(html, /\.replace\(\/\(\[\.!\?。！？…”"』）\)\]\)\\n\(\?=\\S\)\/g,'\$1<div style="height:\.82em"><\/div>'\)/, 'a sentence-end + single newline becomes a soft paragraph gap (R158 .82em)');
});

test('R150 #10 research-mapping: PURE audit helpers exist and are exposed for tests', () => {
  for (const fn of ['_atlNorm', '_atlNameOk', '_atlExtractPlaces', '_atlRegDomain', '_atlAuditSources', '_atlMappingVerdict', '_atlMappingNoteHtml', '_atlGeocodeStrict']) {
    assert.ok(new RegExp('function ' + fn + '\\b').test(html) || new RegExp('const ' + fn + '\\b').test(html), fn + ' is defined');
  }
  // exposed on IntMapAtlasDebug for the runtime spec
  assert.match(html, /extractPlaces:function\(t\)\{/, 'extractPlaces exposed on IntMapAtlasDebug');
  assert.match(html, /auditSources:function\(c\)\{/, 'auditSources exposed');
  assert.match(html, /mappingVerdict:function\(s\)\{/, 'mappingVerdict exposed');
});

test('R150 #10 orchestrator: MERGES with existing pins (no skip-on-pins) and NEVER an empty catch', () => {
  // the old `!(_pois&&_pois.length)` skip guard is gone from BOTH call sites
  assert.ok(!/&&!\(_pois&&_pois\.length\)\)\{ try\{ html\+=await _pinReplyPlaces/.test(html), 'analyze no longer skips when pins exist');
  assert.ok(!/a\.places\.length&&!\(_pois&&_pois\.length\)/.test(html), 'answer no longer skips when pins exist');
  /* the analyze call passes the final text + citations.
     ⚠ (#R350) THE PROPERTY IS UNCHANGED AND THE NOUNS MOVED. `txt` was the model's prose and
     `_aCites` was `window._aiLastCitations` — a global whichever call answered LAST overwrites. The
     reconciliation now reads the ANSWER STRUCTURE's text and the evidence registry of THIS call, so
     the audit still sees the finished answer and its real sources; it just cannot be handed another
     turn's. Asserting the old two variable names would pin the defect, not the requirement. */
  /* ⚠ (#R397) The `.map(...)` in the middle is gone — it was re-flattening the places and discarding
     the coordinates merged in by the contract. The property this check is about (the finished text and
     THIS call's registry, never another turn's) is unchanged, so only the middle is relaxed. */
  assert.match(html, /_pinReplyPlaces\(_env\.places\|\|\[\][\s\S]{0,60}?\{text:answerPlainText\(_env\),citations:_reg\.all\(\)/, 'analyze passes the answer text + its own citations');
  // no empty catch — it logs the cause and returns an honest note
  assert.match(html, /console\.warn\('reply-mapping audit failed',e\)/, 'orchestrator records the failure cause');
  assert.match(html, /Could not run the map self-check for this answer\./, 'honest fallback note (not silent)');
  // merge, not wipe: existing pins are read into `pre` and concatenated
  assert.match(html, /const merged=pre\.concat\(newPins\.map/, 'merges existing pins with the new ones');
});

test('R150 #10 source-concentration audit is real (normalized domains + official detection)', () => {
  assert.match(html, /function _atlIsOfficial\(dom\)\{/, 'official/primary detection by institutional TLD (no per-site hardcoding)');
  assert.match(html, /concentrated = total>=2 && \(domains\.length===1/, 'single-domain concentration detected');
  assert.match(html, /Sources here concentrate on one site/, 'honest one-domain caveat');
});

test('R150 #7 geo-target: ONE ambiguity gate; confirmation never co-displays with a painted result', () => {
  assert.match(html, /const _hlAmbigConfirm=\(ambigArr, clearNames\)=>\{/, 'single shared confirmation builder');
  // BOTH paths gate on ambiguity BEFORE painting and return a stop
  assert.match(html, /if\(gAmbig\.length\)\{ if\(_hlMyGen!==_hlGen\) return R\(true,''\); return R\(false, _hlAmbigConfirm\(gAmbig/, 'multi-region path gates before paint');
  assert.match(html, /if\(ambig\.length\)\{ if\(_hlMyGen!==_hlGen\) return R\(true,''\); const clear=/, 'single-colour path gates before paint');
  // the old co-display (ambiguous shown as a warning alongside the painted success) is GONE
  assert.ok(!/if\(gAmbig\.length\) hh\+=warn/.test(html), 'multi-region no longer appends an ambiguous warning to a painted reply');
  assert.ok(!/if\(ambig\.length\) hh\+=warn/.test(html), 'single-colour no longer appends an ambiguous warning to a painted reply');
  // the confirmation suppresses the planner say via meta.partial so "highlighted X" can't precede "which X?"
  assert.match(html, /_hlAmbigConfirm\(ambig, clear\)\+cwarn, \{meta:\{partial:true\}\}/, 'confirmation flags partial to suppress the planner say');
});

test('R150 #8 satellite: flight-sim prefetches ahead of the aircraft + sat-labels host round-robin', () => {
  assert.match(html, /window\._imPredictivePrefetch=predictivePrefetch/, 'directional prefetch exposed for the flight loop');
  assert.match(html, /if\(now-\(st\._pfT\|\|0\)>300\)\{ st\._pfT=now; try\{ window\._imPredictivePrefetch&&window\._imPredictivePrefetch\(true\)/, 'flight loop warms tiles ~3.3x/s aggressively (moveend never fires mid-flight)');
  // sat-labels reference source now round-robins BOTH Esri hosts (was one)
  assert.match(html, /'sat-labels':\{type:'raster',tiles:\['https:\/\/server\.arcgisonline\.com[^']*','https:\/\/services\.arcgisonline\.com/, 'sat-labels uses two hosts');
});

test('R150 #1 Companies icon slot pixel-matches the Countries flag slot (30x30)', () => {
  assert.match(html, /\.co-logo-box\{ display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px;/, 'logo box is 30x30 like .stat-flag');
});

test('R150 #2 Atlas Street-View OFF reply offers the on/off toggle', () => {
  assert.match(html, /Street View off','ストリートビューをオフ'[\s\S]{0,120}\)\)\+_featTogHtml\('streetview'\)\)/, 'the OFF reply carries the toggle to flip it back on');
});

test('R150 #9 Atlas model comment in index.html reflects Terra (not the reverted-Luna note)', () => {
  assert.match(html, /gpt-5\.6-terra; #R150 Terra re-verified reachable/, 'legal/provider comment names Terra');
  assert.ok(!/#R148 reverted from Terra/.test(html), 'the stale R148 revert note is gone');
});
