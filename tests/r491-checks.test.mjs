/* ============================================================================
 *  #R491 — 回答文の語句を選んで訊くと、辞書ではなく「この文での意味」が返る
 * ----------------------------------------------------------------------------
 *  「Atlas内の回答文を選択して、右クリックしたらミニポップアップがでて、その言葉の辞書的解説が
 *    AI生成される」
 *
 *  Two things make that feature either work or be pointless, and both are checkable here.
 *
 *  ① WHAT THE MODEL IS SHOWN. The card's whole claim over a browser dictionary is `inContext` —
 *     which Georgia, which flank, which article. That answer exists only if the PASSAGE reaches
 *     the model, and a long answer has to be clipped. Clipping it from the FRONT would drop the
 *     paragraph a phrase near the end lives in, i.e. exactly the paragraph that could answer the
 *     question, and nothing on screen would say so — the card would simply be vaguer. ①–③ drive
 *     the SHIPPED functions with data, through the factory that uses them.
 *
 *  ② WHOSE DAY IT SPENDS. A lookup runs on public.ai_gloss_usage, not on the reader's ten daily
 *     questions. That separation is made of four small facts, and every one of them can be
 *     un-made by a plausible edit: the lane header must be VERIFIED against the parsed task
 *     (or it is a free door into `atlas_turn`), the gloss reply must not carry `used`/`limit`
 *     (or js/ai-core.js mirrors the gloss count into the QUESTION counter), the entry point must
 *     not gate on the question quota (or the lane is blocked by the thing it exists to avoid),
 *     and a failed lookup must refund the counter it charged. ④–⑧ pin all four.
 *
 *  ⚠ THE WIRING CHECKS READ THE SOURCES THROUGH `codeOnly`, so this file's own prose — and the
 *  modules' — can never be what a check matches (#R345).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { makeAtlasGloss, GLOSS_CSS, GLOSS_CSS_MOBILE } from '../js/atlas-gloss.js';

/* ⚠ THE SHIPPED FUNCTIONS, NOT A COPY. `makeAtlasGloss` touches nothing at construction time — no
   DOM, no globals, no network — so the factory runs here and hands back the three it decides
   context with. They are not exported separately because nothing in js/ would import them, and
   tests/r175 ③ is right that an export nothing imports is dead code. */
const { tidy: glossTidy, sentence: glossSentence, passage: glossPassage } =
  makeAtlasGloss({}, { L: (en) => en, esc: (x) => x, chat: () => null, ask: () => {} }).text;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));

/* ── ① the sentence around the phrase, in a Latin script and in a CJK one ─────────────────── */
test('R491 ① the context is the SENTENCE the phrase sits in, not the whole answer', () => {
  const en = 'Talks stalled in Vienna. NATO reinforced its eastern flank after the escalation. Berlin disagreed.';
  assert.equal(glossSentence(en, 'eastern flank'), 'NATO reinforced its eastern flank after the escalation.');

  /* ⚠ THE CJK FULL STOP IS A SENTENCE ENDER TOO. Without 。 in the ender set a Japanese answer is
     one sentence from end to end, so the "sentence" bound degenerates into the passage bound and
     the model is handed a paragraph where a clause was meant. */
  const ja = 'ウィーンでの協議は停滞した。NATOは緊張の高まりを受けて東側面を増強した。ベルリンは反対した。';
  assert.equal(glossSentence(ja, '東側面'), 'NATOは緊張の高まりを受けて東側面を増強した。');

  /* a phrase that is not in the text at all still yields context rather than nothing */
  assert.ok(glossSentence(en, 'not present here').length > 0);
});

test('R491 ② whitespace a drag-selection picks up does not become part of the phrase', () => {
  assert.equal(glossTidy('  eastern\n   flank \t'), 'eastern flank');
  assert.equal(glossTidy(null), '');
  /* the same collapse runs over the answer, so a hard-wrapped bubble is one line of prose */
  assert.equal(glossSentence('A\n  b\n  c.', 'b'), 'A b c.');
});

/* ── ③ the clip is AROUND the phrase — the check that would have failed on the obvious edit ── */
test('R491 ③ a long answer is clipped around the phrase, never from the front', () => {
  const head = 'H'.repeat(3000), tail = 'T'.repeat(3000);
  const long = head + ' Bretton Woods system ' + tail;
  const out = glossPassage(long, 'Bretton Woods system');

  assert.ok(out.length <= 1400 + 2, `the bound holds: ${out.length}`);
  assert.ok(out.includes('Bretton Woods system'), 'the phrase itself survived the clip');
  /* it came from the MIDDLE, so both ellipses are there — a front-clip would have neither and
     would not contain the phrase at all */
  assert.ok(out.startsWith('…') && out.endsWith('…'), 'the clip is marked on both sides');
  assert.notEqual(out, long.slice(0, 1400));

  /* an answer that already fits is passed through whole */
  const short = 'NATO reinforced its eastern flank.';
  assert.equal(glossPassage(short, 'eastern flank'), short);
});

/* ── ④ the lane header is a claim about a body nobody has read — so it is verified after ───── */
test('R491 ④ ai-proxy verifies the declared lane against the parsed task, and refunds a mismatch', () => {
  const fn = CODE('supabase/functions/ai-proxy/index.ts');

  assert.match(fn, /x-intmap-lane/, 'the lane travels in a header, like the turn key (#R318)');
  assert.match(fn, /isGloss\s*!==\s*\(task\s*===\s*"gloss"\)/,
    'the header is checked against the task BOTH ways — "lane: gloss" carrying atlas_turn would buy the expensive task out of the cheap counter');
  /* the mismatch must give the charge back before it 400s, or a probe would cost the reader lookups */
  const at = fn.indexOf('isGloss !== (task === "gloss")');
  assert.ok(at > 0);
  const after = fn.slice(at, at + 260);
  assert.match(after, /await refund\(\)/, 'a rejected lane refunds what it charged');
  assert.match(after, /bad_lane/);

  /* …and the cheap lane may not buy the expensive inputs */
  assert.match(fn, /isGloss\s*&&\s*\(imgs\.length\s*\|\|\s*web\)/,
    'the gloss lane refuses images and hosted web search — those cost what vision_read and brief cost');
  assert.match(fn, /consume_ai_gloss/);
  assert.match(fn, /refund_ai_gloss/);
});

/* ── ⑤ …and the answer must not name its numbers `used`/`limit` ───────────────────────────── */
test('R491 ⑤ a gloss reply carries its own two numbers, never the question counter\'s', () => {
  const fn = CODE('supabase/functions/ai-proxy/index.ts');
  /* js/ai-core.js writes ANY `used` it sees into HOST.aiUsage — the reader's QUESTION mirror — so a
     gloss that answered with `used`/`limit` would show the gloss budget as the question budget. */
  assert.match(fn, /lane:\s*GLOSS_LANE,\s*glossUsed,\s*glossLimit/);
  assert.match(fn, /:\s*\{\s*used,\s*limit,\s*remaining:/,
    'the ordinary lane still answers with used/limit — the two shapes are exclusive');

  const core = CODE('js/ai-core.js');
  assert.match(core, /if\s*\(typeof j\.glossUsed===['"]?number['"]?\)|typeof j\.glossUsed===\s*'number'/,
    'the client mirrors glossUsed into its OWN counter');
  assert.ok(!/aiSetUsage\(j\.glossUsed/.test(core), 'and never into the question counter');
});

/* ── ⑥ the entry point does not gate on the quota it is separate from ─────────────────────── */
test('R491 ⑥ askAIGloss gates on the gloss counter, not on the reader\'s questions', () => {
  const core = CODE('js/ai-core.js');
  const at = core.indexOf('async function askAIGloss');
  assert.ok(at > 0, 'js/ai-core.js exposes askAIGloss');
  const body = core.slice(at, core.indexOf('function aiParseJSON', at));

  assert.match(body, /aiGlossOverQuota\(\)/, 'it asks its own counter');
  assert.ok(!/aiQuotaBlocked\(/.test(body),
    'and NOT the question counter — a lane that stopped working once the reader had asked ten questions is the exact failure it exists to prevent');
  assert.match(body, /lane:\s*['"]gloss['"]/);
  assert.match(body, /task:\s*['"]gloss['"]/);
  assert.match(body, /webMode:\s*['"]off['"]/);
  /* the #R447 rule applies to the second counter too: re-read the row before turning anyone away */
  assert.match(body, /await aiFetchGlossUsage\(\)/);

  assert.match(core, /ai_gloss_usage/, 'the mirror is filled from the row the owner may read under RLS');
  assert.match(core, /askAIGloss/, 'and it is exported');
});

/* ── ⑦ the migration is the one that makes the separation real ────────────────────────────── */
test('R491 ⑦ the gloss counter is its own table, written only by SECURITY DEFINER RPCs', () => {
  const sql = R('supabase/migrations/20260828090000_r491_gloss_quota.sql');
  assert.match(sql, /create table if not exists public\.ai_gloss_usage/);
  assert.match(sql, /create or replace function public\.consume_ai_gloss/);
  assert.match(sql, /create or replace function public\.refund_ai_gloss/);
  /* the same three guarantees ai_usage has (docs/DATABASE.md): RLS on, owner reads own row,
     EXECUTE revoked from everybody except service_role */
  assert.match(sql, /alter table public\.ai_gloss_usage enable row level security/);
  assert.match(sql, /using \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(sql, /revoke execute on function public\.consume_ai_gloss\(uuid, integer\) from public, anon, authenticated/);
  assert.match(sql, /grant\s+execute on function public\.consume_ai_gloss\(uuid, integer\) to service_role/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
});

/* ── ⑧ the card is reachable both ways, and is one card ───────────────────────────────────── */
test('R491 ⑧ the reader raises the card by gesture and Atlas raises the SAME card by action', () => {
  const gloss = CODE('js/atlas-gloss.js');
  const console_ = CODE('js/atlas-console.js');

  /* the gesture: right-click on a selection inside an ANSWER — and nowhere else, or the browser's
     own menu (where Copy lives) would be taken away from the rest of the panel */
  assert.match(gloss, /addEventListener\('contextmenu'/);
  assert.match(gloss, /\.atl-b\.a/, 'the target is an Atlas answer bubble');
  assert.match(gloss, /selectionchange/, 'and a touch screen, which has no right-click, gets the pill');

  /* the action: one dispatch case, one catalogue entry, one registry row — #R278 / #R318 */
  assert.match(console_, /case 'gloss': return GLOSS\.dispatch\(a\);/,
    'ONE line in the kernel — js/atlas-console.js is at its shrink-only ceiling (tests/r318 ⑨b), so the body is in the module');
  assert.match(gloss, /function dispatch\(a\)/);
  assert.match(gloss, /try \{ open\(term, null\); \}/, 'the action opens the same card the gesture does');
  assert.match(CODE('js/atlas-catalog-text.js'), /"type":"gloss"/,
    'an action the catalogue does not describe does not exist for the planner (#R278)');
  assert.match(CODE('js/atlas-capabilities.js'), /'reader\.gloss'/);
  assert.match(CODE('js/atlas-schemas.js'), /'reader\.gloss'/);

  /* the CSS is exported the way js/atlas-msg-tools.js exports its own — the kernel owns the style */
  assert.ok(GLOSS_CSS.includes('.atl-gloss'), 'the card has rules');
  assert.ok(GLOSS_CSS_MOBILE.includes('.atl-gloss'), 'and a phone has its own');
  assert.match(CODE('js/atlas-styles.js'), /GLOSS_CSS/);
  /* ⚠ NOT scoped under #atlas-panel: the card is appended to <body> so the panel's overflow cannot
     clip it, and a rule written `#atlas-panel .atl-gloss` would therefore match nothing (#R488). */
  assert.ok(!/#atlas-panel\s+\.atl-gloss/.test(GLOSS_CSS + GLOSS_CSS_MOBILE),
    'the rules do not name a panel the card does not live inside');
});
