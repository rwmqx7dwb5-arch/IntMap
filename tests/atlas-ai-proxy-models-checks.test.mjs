/* ============================================================================
 *  Atlas · which model answers — the model table (supabase/functions/_shared/ai-provider.js), the
 *  developer's picker and the fallback walk in ai-proxy, and what the browser may and may not name
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from six round files; every test keeps the title it had there:
 *    · tests/r722-model-picker-checks.test.mjs     — only the developer account picks; the catalogue is asked
 *    · tests/r736-atlas-multiprobe-checks.test.mjs ③④ — Terra for every account; a withdrawn model
 *    · tests/r147-checks.test.mjs #13 and «R150 #9», tests/r151-checks.test.mjs #9,
 *      tests/r150-checks.test.mjs #9, tests/r156-checks.test.mjs #7 — the quota, the fallback shape,
 *      the shell naming no model, vision_read
 *  ⚠ (tests-by-topic) THE MODEL TABLE IS IMPORTED, NOT READ. ai-provider.js is plain JavaScript
 *  written to be imported by node (its own header says so), so OPENAI_DEFAULT_MODEL, FALLBACK_CHAIN
 *  and PROVIDER_DEFAULT_MODEL are the values themselves here, not a regular expression over their
 *  declarations. supabase/functions/ai-proxy/index.ts is Deno TypeScript and cannot be imported by
 *  node, so what it does stays asserted on its code (read through codeOnly where #R722 did).
 * ==========================================================================*/
/* ============================================================================
 *  #R722 — 開発者アカウントだけが、設定画面から自分のモデルを選べる
 * ----------------------------------------------------------------------------
 *  「わたしのアカウントに関しては、私（開発者アカウント）として、設定画面からモデルを自由に
 *    変えられるように。私に関しては、GPT 6 Astra も利用可能に。」
 *
 *  Until this round ai-proxy's own header said the model is fixed «— users never pick it», and that
 *  was the whole security model: there was no field to abuse because there was no field. Adding one
 *  adds a way to be wrong, and these checks pin the four ways:
 *
 *  ① THE GATE IS THE ACCOUNT, NOT THE BROWSER. js/ai-core.js has an aiDev() that any reader can turn
 *     on from a console (js/auth-ui.js:445 says so in writing). If the server ever read `model` on
 *     that word, every reader would have a model picker — and a model picker is a spending decision.
 *     So: every read of the new fields must sit behind the server's own isDev.
 *  ② THE CATALOGUE IS ASKED, NOT WRITTEN DOWN. A list of model names in this repository is a
 *     photograph of the day it was typed (#R707): the thing it silently fails to offer is the new
 *     model the developer opened the panel to try. The names must come from the providers.
 *  ③ AI_MODEL IS AN ID FOR **ITS OWN** PROVIDER. It holds an OpenAI id. A developer who switches the
 *     provider must not inherit it — that sends «gpt-5.6-terra» to Google, which answers 404 for a
 *     reason that names neither the setting nor the switch.
 *  ④ A CHOSEN MODEL DOES NOT FALL BACK. The 403-retry exists so a model the PROJECT lost access to
 *     cannot blanket-kill Atlas for everybody. It is not hypothetical here: measured 2026-09-15 with
 *     this project's own key, gpt-5.6-sol AND gpt-5.6-terra both answered 403 «does not have access
 *     to model» while gpt-5.6-luna and gpt-6-astra answered 200 — and gpt-5.6-terra was the configured
 *     AI_MODEL, so every Atlas answer since #R150 had been coming from the fallback with nothing on
 *     screen saying so. (The access was granted later the same day; all four answer 200 now.) A
 *     developer testing a model must not be handed another one in silence.
 *
 *  ⚠ Every source is read through codeOnly, so this file's prose — and the modules' — can never be
 *  what a check matches (#R345).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';
import { OPENAI_DEFAULT_MODEL, FALLBACK_CHAIN, PROVIDER_DEFAULT_MODEL } from '../supabase/functions/_shared/ai-provider.js';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CODE = (p) => codeOnly(readLF(join(ROOT, p)));
const PROXY = CODE('supabase/functions/ai-proxy/index.ts');
/* (edge-spend-and-models) the model table ai-proxy imports — one table for every function that calls a model */
const MODELS = CODE('supabase/functions/_shared/ai-provider.js');
const CORE = CODE('js/ai-core.js');
const BODY = CODE('js/app-body.js');
const RAW = (p) => readLF(join(ROOT, p));   /* the source as written, comments included (#R736 read it so) */
const html = appSource(new URL('../', import.meta.url));   /* (#R162) index.html + css/intmap.css + js/*.js */
const aiproxy = RAW('supabase/functions/ai-proxy/index.ts');
/* Lift the arrow-function IIFE that decides the pick, by brace matching from its own declaration —
   not by a lazy regex that ends wherever the block happens to end today (#R531). */
function liftBlock(src, head, tsDecl) {
  const at = src.indexOf(head);
  assert.ok(at >= 0, 'no ' + head);
  /* ⚠ THE FIRST BRACE IS NOT ALWAYS THE BODY. In the Edge Function the declaration carries its
     types, and `): Promise<{ provider: string; … }>` opens a brace of its own — liftFunction's
     JS-shaped assumption lifts the signature and nothing else. A TypeScript declaration's body is
     the first brace that ENDS ITS LINE. */
  const BODY_BRACE = new RegExp(String.raw`{[ 	]*?
`);
  let i = tsDecl ? src.slice(at).search(BODY_BRACE) + at : src.indexOf('{', at + head.length - 1);
  let depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return src.slice(at, i + 1); }
  }
  throw new Error('unbalanced ' + head);
}

/* ── ① the client may ASK for a model; only the account may HAVE one ──────────────────────── */
test('R722 ① every read of the request model/provider sits behind the server-side isDev', () => {
  /* kept as a spelling: supabase/functions/ai-proxy/index.ts is Deno TypeScript node cannot import, and js/ai-core.js / js/app-body.js run only in the signed-in page */
  const pick = liftBlock(PROXY, 'const devPick = (() => {');
  assert.match(pick, /if \(!isDev\) return null;/, 'the pick must refuse before it reads anything');

  /* The fields exist in exactly two places: the payload TYPE (a declaration, reads nothing) and the
     guarded block. A third reader is the bug this check exists to catch — it would be a model picker
     for everyone, and nothing on screen would say so. */
  for (const field of ['payload.provider', 'payload.model']) {
    const all = PROXY.split(field).length - 1;
    const inside = pick.split(field).length - 1;
    assert.equal(all, inside, field + ' is read outside the isDev-guarded block (' + all + ' total, ' + inside + ' guarded)');
    assert.ok(inside >= 1, field + ' is never read at all');
  }

  /* the catalogue is developer-only too: a list of every model the org can reach is not public. */
  const op = PROXY.slice(PROXY.indexOf('if (String(payload.op || "") === "models")'));
  assert.match(op.slice(0, 400), /if \(!isDev\) return json\(\{ error: "not_found" \}, 404\);/);

  /* and the whole grant is decided from the immutable account id, not from an address or a plan. */
  /* (ai-one-ledger) decided in _shared/ai-ledger.js accountFor (shared with monitor-run), from the id */
  assert.match(PROXY, /const isDev = account\.isDev;/);
  assert.match(CODE('supabase/functions/_shared/ai-ledger.js'), /const isDev = devUserIds\(env\)\.includes\(id\.toLowerCase\(\)\)/);
});

/* ── ② the names come from the providers ──────────────────────────────────────────────────── */
test('R722 ② the model catalogue is fetched from each provider, never listed in this repo', () => {
  /* kept as a spelling: supabase/functions/ai-proxy/index.ts is Deno TypeScript node cannot import, and js/ai-core.js / js/app-body.js run only in the signed-in page */
  const list = liftBlock(PROXY, 'async function listModels(', true);

  /* one upstream per provider, each asked for its own catalogue */
  assert.match(list, /https:\/\/api\.openai\.com\/v1\/models/);
  assert.match(list, /generativelanguage\.googleapis\.com\/v1beta\/models/);
  assert.match(list, /https:\/\/api\.anthropic\.com\/v1\/models/);

  /* ⚠ NO MODEL NAME IS TYPED HERE. A single "gpt-…" / "claude-…" / "gemini-…" literal inside this
     function would mean the panel offers what this file remembers rather than what exists. */
  assert.equal((list.match(/["'`](?:gpt|claude|gemini|o)[-.][0-9][-.0-9a-z]*["'`]/gi) || []).length, 0,
    'listModels names a model — the catalogue must be discovered, not remembered');

  /* Gemini publishes which models can answer a prompt, so that fact is READ rather than guessed. */
  assert.match(list, /supportedGenerationMethods/);
  assert.match(list, /includes\("generateContent"\)/);

  /* a provider with no key is reported as having no key — not as an empty list of models (#R565) */
  assert.match(list, /available: false, note: "no key"/);
});

/* ── ③ the secret's id belongs to the secret's provider ───────────────────────────────────── */
/* ── ③ the secret's id belongs to the secret's provider ───────────────────────────────────── */
test('R722 ③ a provider switch does not inherit the AI_MODEL secret', () => {
  assert.match(PROXY, /const envModel = provider === envProvider \? \(Deno\.env\.get\("AI_MODEL"\) \|\| ""\) : "";/);
  assert.match(PROXY, /const model = devPick\?\.model \|\| envModel \|\| PROVIDER_DEFAULT_MODEL\[provider\]/);

  /* ⚠ ONE TABLE OF DEFAULTS, NOT A TERNARY AT EVERY READER. Two readers exist now (the call and the
     catalogue's serverDefault); #R515's shape is two copies of one rule drifting apart.
     ⚠ (tests-by-topic) the table is IMPORTED: frozen, and one row per provider, as values. */
  assert.ok(Object.isFrozen(PROVIDER_DEFAULT_MODEL), 'PROVIDER_DEFAULT_MODEL is one frozen table');
  assert.match(PROXY, /\bPROVIDER_DEFAULT_MODEL\b[\s\S]*?from "\.\.\/_shared\/ai-provider\.js"/, 'ai-proxy reads the shared table');
  assert.doesNotMatch(PROXY, /provider === "gemini" \? "gemini-[^"]+" :/,
    'the inline per-provider default ternary is back — it is the second copy of PROVIDER_DEFAULT_MODEL');
  for (const p of ['openai', 'gemini', 'anthropic']) {
    assert.ok(typeof PROVIDER_DEFAULT_MODEL[p] === 'string' && PROVIDER_DEFAULT_MODEL[p].length > 0, 'PROVIDER_DEFAULT_MODEL has no ' + p + ' row');
  }
});

/* ── ④ a chosen model reports its own 403 instead of quietly running another one ──────────── */
test('R722 ④ the fallback walks sol → terra → luna, and stops for a model the developer chose', () => {
  /* kept as a spelling: supabase/functions/ai-proxy/index.ts is Deno TypeScript node cannot import, and js/ai-core.js / js/app-body.js run only in the signed-in page */
  assert.match(PROXY, /const noFallbackForPick = !!devPick\?\.model;/);
  const call = PROXY.slice(PROXY.indexOf('out = await callOpenAI(model, key'));
  assert.match(call.slice(0, 260), /imageDetail, noFallbackForPick, oaFormat[,)]/,   /* (atlas-native-tools) the turn and its cache key follow it */
    'the call site still hard-codes false — a chosen model would be substituted in silence');

  /* ⚠ THE WALK IS BOUNDED BY POSITION, NOT BY A COUNTER. Each failure takes the model AFTER the one
     that just failed (a model outside the chain starts at its head), so the sequence moves strictly
     right and ends at the end of the array — with two fallbacks a boolean "already fell back" guard
     would have stopped the walk one step early, at the model this project had ALSO lost access to. */
  const oa = liftBlock(PROXY, 'async function callOpenAI(', true);
  assert.match(oa, /const nextModel = noFallback \? "" : \(FALLBACK_CHAIN\[FALLBACK_CHAIN\.indexOf\(model\) \+ 1\] \|\| ""\);/);
  assert.match(oa, /if \(nextModel && \(r\.status === 403 \|\| r\.status === 404\)/);
  assert.match(oa, /callOpenAI\(nextModel, key,/);

  /* and what actually ANSWERED is the provider's own word, not the id we sent — otherwise the field
     that reports a substitution is computed from the thing the substitution replaced. */
  assert.match(PROXY, /modelServed: out\.served \|\| ""/);
  assert.match(oa, /served: String\(j\?\.model \|\| ""\)/);

  /* and the answer says who decided, so a pick that did not take effect is visible */
  assert.match(PROXY, /modelChosenBy: devPick\?\.model \? "developer" : "server"/);
});

/* ── ⑤ the pick is stored where the account record already travels ────────────────────────── */
test('R722 ⑤ the pick follows the account, and is sent with every call this account makes', () => {
  /* kept as a spelling: supabase/functions/ai-proxy/index.ts is Deno TypeScript node cannot import, and js/ai-core.js / js/app-body.js run only in the signed-in page */
  /* ⚠ saveSettings() REBUILDS the record from these globals (js/app-body.js), so a key written
     straight into localStorage is dropped by the next save. Both halves, or the setting is a
     one-device setting that silently forgets itself. */
  assert.match(liftFunction(BODY, 'saveSettings'), /aiModel:\(window\.imAiModel\|\|null\)/);
  assert.match(liftFunction(BODY, 'loadSettings'), /window\.imAiModel=s\.aiModel/);

  /* the answer call carries it — for every task, which is what "全部" asked for: no task list here */
  const send = CORE.slice(CORE.indexOf('const mp=aiModelPick();'));
  assert.match(send.slice(0, 200), /body\.model=mp\.model/);
  assert.match(send.slice(0, 200), /if\(mp\.provider\) body\.provider=mp\.provider/);

  /* one door: the catalogue call and the answer call build their auth the same way, so a change to
     one cannot leave the other unauthenticated (they were two copies while this was written) */
  assert.equal((CORE.match(/headers\['apikey'\]=window\.SUPABASE_ANON_KEY/g) || []).length, 1);
  assert.match(liftFunction(CORE, 'aiFetchModels'), /headers:await aiAuthHeaders\(\)/);
});

/* ── ⑥ the panel's own sentences are IntMap's, so they are written in en + jp ──────────────── */
test('R722 ⑥ the picker speaks through the language registry (CONSTITUTION §7)', () => {
  /* kept as a spelling: supabase/functions/ai-proxy/index.ts is Deno TypeScript node cannot import, and js/ai-core.js / js/app-body.js run only in the signed-in page */
  const paint = liftFunction(CORE, 'aiPaintModelPicker');
  /* ⚠ NOT «contains Japanese»: a Japanese string with no English beside it is the same defect as an
     English one with no Japanese. Both sides travel together, through t(lang, en, jp). */
  assert.match(CORE, /const L=\(en,jp\)=>window\.IntMapLang\.t\(HOST\.lang,en,jp\);/);
  for (const s of ['Server default', 'Chosen: ', 'Using the server default.']) {
    assert.ok(paint.includes("L('" + s + "'"), 'the picker prints «' + s + '» outside the registry');
  }
  /* the one thing the panel must say out loud: this does not touch the unattended jobs */
  assert.match(CORE, /Scheduled background jobs keep the server model\./);
  assert.match(CORE, /自動実行のバックグラウンド処理はサーバー既定のままです。/);
});

/* ── ⑦ the one place a model id is written, and the document that has to agree ────────────── */
test('R722 ⑦ the shipped model is named once, and Architecture.md names the same one', () => {
  /* kept as a spelling: Architecture.md is prose, so the imported constants are compared with the sentence the document states; js/ai-core.js needs the page */
  /* (tests-by-topic) the constants themselves, imported — not a regular expression over their declarations */
  const dflt = OPENAI_DEFAULT_MODEL;
  const chain = FALLBACK_CHAIN.slice();
  assert.ok(dflt && chain.length >= 1);

  /* ⚠ THIS IS THE CHECK #R150 NEEDED AND DID NOT HAVE. From #R150 until this round the setting said
     «gpt-5.6-terra» while OpenAI answered 403 for it — measured 2026-09-15 — so every answer came
     from the fallback and three documents described a model that had not run in months. Prose
     cannot be kept true by hand; it is compared to the constant here. */
  const arch = readLF(join(ROOT, 'Architecture.md'));
  assert.ok(arch.includes('`AI_MODEL` シークレット（現行 `' + dflt + '`）'),
    'Architecture.md names a different current model than ai-proxy ships (' + dflt + ')');
  /* the chain is stated in order, and the document has to walk the same ladder the code walks */
  assert.ok(arch.includes('**`' + chain.join('` → `') + '` の順に 1 段ずつ**フォールバック'),
    'Architecture.md states a different fallback chain than ai-proxy ships (' + chain.join(' → ') + ')');

  /* and the id stays out of the browser bundle: the shell cannot keep it true (tests/r150 ⑨). */
  assert.equal((CORE.match(/gpt-[0-9.]+-[a-z]+/g) || []).length, 0, 'js/ai-core.js names a model id');
});


/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R736 ③④ — 「一般向けアカウントのモデルは GPT 5.6 Terra に。6 Astra は管理者アカウントの選択肢から削除。
   管理者アカウントのデフォルトも Terra に。」 (formerly tests/r736-atlas-multiprobe-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ══ THE MODEL THE READER GETS, AND THE ONE THE OWNER WITHDREW ═════════════════════════════════
 *  Instruction (2026-09-15): 「一般向けアカウントのモデルは GPT 5.6 Terra に。6 Astra は管理者アカウ
 *  ントの選択肢から削除。管理者アカウントのデフォルトも Terra に。」
 *
 *  ⚠ The admin's default IS the reader's model — js/ai-core.js offers 「Server default — <id>」 as an
 *  explicit option and `serverDefault.model` is the same value the call uses. So the third sentence
 *  needs no separate setting, and a test that invented one would be testing something IntMap does not
 *  have. What is measured here is the one value both sentences name, and the withdrawal.
 *  ⚠ The SECRET wins over the constant at run time (`AI_MODEL`), which is exactly how #R722's defect
 *  worked; the two are set together and tests/r722 ⑦ holds the constant and Architecture.md to each
 *  other. This file holds the constant to the instruction.
 * ==========================================================================================*/
const PROXY_RAW = RAW('supabase/functions/ai-proxy/index.ts');
const AICORE = RAW('js/ai-core.js');
test('R736 ③: the model every account gets — the developer account included — is Terra', () => {
  /* (tests-by-topic) the constants are imported, not matched in the source text */
  const dflt = OPENAI_DEFAULT_MODEL;
  assert.equal(dflt, 'gpt-5.6-terra');
  /* the ladder under it may not start at the model it is the ladder FOR */
  const chain = FALLBACK_CHAIN.slice();
  assert.ok(chain.length >= 1, 'there is still a ladder');
  assert.ok(!chain.includes(dflt), 'the fallback chain starts with the model it exists to replace (' + dflt + ')');
  /* the developer's own default is the SAME value, offered by name rather than as an empty state */
  assert.match(PROXY_RAW, /serverDefault: \{ provider: envProv, model: Deno\.env\.get\("AI_MODEL"\) \|\| PROVIDER_DEFAULT_MODEL\[envProv\] \|\| "" \}/);
  assert.match(AICORE, /L\('Server default','サーバー既定'\)\+\(def\.model\?' — '\+def\.model:''\)/);
});

test('R736 ④: a withdrawn model is not OFFERED, is not BLOCKED, and is named exactly once', () => {
  /* kept as a spelling: supabase/functions/ai-proxy/index.ts is Deno TypeScript node cannot import, and js/ai-core.js / js/app-body.js run only in the signed-in page */
  /* declared once, beside the other model constants */
  const decl = PROXY_RAW.match(/const WITHDRAWN_MODELS = new Set\(\[([^\]]*)\]\);/);
  assert.ok(decl, 'no withdrawal set');
  const withdrawn = decl[1].split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
  assert.deepEqual(withdrawn, ['gpt-6-astra']);
  /* ⚠ MEASURED ON THE CODE, NOT ON THE PROSE — two comments narrate the 2026-09-15 measurement that
     found this id answering 200, and a check that counted those would fail the sentence explaining it
     (#R621: strip the comments before measuring). */
  const bare = codeOnly(PROXY_RAW);
  assert.equal((bare.match(/gpt-6-astra/g) || []).length, 1, 'the withdrawn id is spelled more than once in the code');

  /* applied where the picker's options are built … */
  assert.match(PROXY_RAW, /const keep = \(id: string\) => MODEL_ID_OK\.test\(id\) && !WITHDRAWN_MODELS\.has\(id\);/);

  /* … and NOWHERE ELSE. A withdrawal that also refused the call would be a capability boundary, which
     is the thing CONSTITUTION.md §0.3 forbids: the proxy still calls whatever id it is handed. */
  const uses = (bare.match(/WITHDRAWN_MODELS/g) || []).length;
  assert.equal(uses, 2, `WITHDRAWN_MODELS is read ${uses - 1} time(s) — it may only filter what is OFFERED`);

  /* and the client lets go of a pick the catalogue stopped offering, so an account that had already
     chosen one is not left sending it invisibly for ever. Held only when the provider ANSWERED. */
  assert.match(AICORE, /row0\.available/);
  assert.match(AICORE, /row0\.models\.indexOf\(pk\.model\)<0\) aiSetModelPick\(pk\.provider,''\)/);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   R147–R156 (formerly tests/r147-, r150-, r151-, r156-checks.test.mjs) — the quota, the fallback
   shape, the model the shell may not name, the vision task. ai-proxy is Deno TypeScript: what it
   does is asserted on its source; the model table is imported.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R147 #13 free AI quota is 10/day on the client and server', () => {
  /* kept as a spelling: supabase/functions/ai-proxy/index.ts is Deno TypeScript node cannot import, and js/ai-core.js / js/app-body.js run only in the signed-in page */
  assert.match(html, /const AI_FREE_DAILY\s*=\s*10\b/, 'client AI_FREE_DAILY=10');
  assert.match(RAW('supabase/functions/_shared/ai-ledger.js'), /free:\s*10\b/, 'server PLAN_LIMITS.free=10 (ai-one-ledger: _shared/ai-ledger.js, shared with monitor-run)');
  assert.ok(!/up to 30 uses per day/.test(html), 'no stale "30 uses per day" copy');
  assert.ok(!/1日30回/.test(html), 'no stale JP "1日30回"');
});
test('R150 #9 the OpenAI path has a default model and a DIFFERENT fallback; Gemini Flash-Lite unused', () => {
  /* kept as a spelling: supabase/functions/ai-proxy/index.ts is Deno TypeScript node cannot import, and js/ai-core.js / js/app-body.js run only in the signed-in page */
  // (#R150) R148 ran Luna because this project 403'd Terra; #R150 re-verified Terra and made it the default.
  // ⚠ (#R722) THE ID IS NO LONGER WRITTEN HERE. Which model is current is a setting (AI_MODEL) and it has
  // changed twice; a literal here made a model change fail a check about R147. What must stay true is the
  // SHAPE: a default, and a fallback that is a different model — a fallback equal to the default is not a
  // fallback, it is a second attempt at the thing that just 403'd. The id itself: tests/r722 ⑦.
  /* (#R722) the per-provider ternary became a table; the fact is the same one — the OpenAI row of
     that table IS this constant, so a model id is written in one place rather than two.
     ⚠ (tests-by-topic) asked of the imported table, not of its declaration's text. */
  assert.equal(PROVIDER_DEFAULT_MODEL.openai, OPENAI_DEFAULT_MODEL, 'PROVIDER_DEFAULT_MODEL.openai = OPENAI_DEFAULT_MODEL');
  const dflt = OPENAI_DEFAULT_MODEL;
  const chain = FALLBACK_CHAIN.slice();
  assert.ok(dflt, 'ai-proxy has no OPENAI_DEFAULT_MODEL');
  assert.ok(chain.length >= 1, 'ai-proxy has no FALLBACK_CHAIN');
  /* (#R722) a step that repeats the model that just failed is not a step. The chain must be a
     sequence of DISTINCT models, none of them the default — otherwise a 403 retries itself. */
  assert.equal(new Set([dflt, ...chain]).size, chain.length + 1,
    'the fallback chain repeats a model (or the default): ' + JSON.stringify([dflt, ...chain]));
  assert.match(aiproxy, /Flash-Lite is never used/, 'documents that Gemini Flash-Lite is never used');
  const aiproxyNoNote = aiproxy.replace(/Gemini 3\.1 Flash-Lite is never used\./g, '');
  assert.ok(!/flash-lite/i.test(aiproxyNoNote), 'flash-lite appears only in the "never used" note');
  assert.ok(!/flash-lite/i.test(html), 'no flash-lite in index.html');
});

test('R151 #9 Atlas model = GPT-5.6 Terra (Luna only as model-not-found fallback)', () => {
  /* kept as a spelling: supabase/functions/ai-proxy/index.ts is Deno TypeScript node cannot import, and js/ai-core.js / js/app-body.js run only in the signed-in page */
  /* (#R722) the ids moved out of this check — see tests/r147 ⑨ and tests/r722 ⑦ for why. What R151
     is about is that the fallback is reached ONLY by model_not_found, and that survives any model.
     (tests-by-topic) the two constants are imported values now, not two declarations matched as text. */
  assert.ok(typeof OPENAI_DEFAULT_MODEL === 'string' && OPENAI_DEFAULT_MODEL.length > 0, 'ai-proxy has a default model');
  assert.ok(Array.isArray(FALLBACK_CHAIN) && FALLBACK_CHAIN.length > 0 && FALLBACK_CHAIN.every((m) => typeof m === 'string' && m), 'ai-proxy has a fallback chain');
  assert.match(aiproxy, /OPENAI_DEFAULT_MODEL, FALLBACK_CHAIN, PROVIDER_DEFAULT_MODEL[\s\S]*?from "\.\.\/_shared\/ai-provider\.js"/, 'ai-proxy reads them from the shared table');
  assert.match(aiproxy, /model_not_found\|does not have access to model/, 'fallback only on model-not-found');
});

test('R150 #9 the app shell does not name a model the server stopped using', () => {
  /* kept as a spelling: supabase/functions/ai-proxy/index.ts is Deno TypeScript node cannot import, and js/ai-core.js / js/app-body.js run only in the signed-in page */
  /* (#R722) This used to require the literal «gpt-5.6-terra» in the shell's provider comment, which
     made the shell a SECOND place the current model is written down — and #R150's own measurement is
     what shows how that ends: AI_MODEL named Terra from #R150 until #R722 while Terra answered 403
     and every answer came from the fallback. A name in the shell cannot be kept true by anything, so
     the rule is that the shell may not name an OpenAI model id at all. ai-proxy names it once. */
  const ids = (html.match(/gpt-5\.[0-9]+-[a-z]+|gpt-[0-9]+-[a-z]+/g) || []).filter((m) => !/^gpt-[0-9]+-turbo$/.test(m));
  assert.deepEqual([...new Set(ids)], [], 'the app shell names an OpenAI model id — it will outlive the setting');
  assert.ok(!/#R148 reverted from Terra/.test(html), 'the stale R148 revert note is gone');
});
test('R156 #7 ai-proxy: vision_read task + input_image detail:high', () => {
  assert.match(aiproxy, /vision_read: 3000,/, 'vision_read output budget');
  assert.match(aiproxy, /vision_read: "medium",/, 'vision_read reasoning (effortHint:"high" bumps it)');
  /* (#R350) analysis_structured joined the set — the AnswerEnvelope is a strict JSON task too. */
  /* (#R491) …and "gloss" at the tail: the term card is a strict JSON task too (GLOSS_SCHEMA). */
  assert.match(aiproxy, /new Set\(\["atlas_turn", "map_report", "analysis_structured", "json_extract", "geo_verify", "geo_resolve", "research_map", "vision_read", "gloss"\]\)/, 'vision_read returns strict JSON (#R406 put atlas_turn at the head of the same set)');
  /* (#R722) the neighbouring argument was renamed _isFallback → noFallback when the single fallback
     became a chain, and it changed MEANING with the name: it used to say "this call IS the fallback"
     (a recursion guard), and it now says "the caller forbids substituting another model" — which is
     how a developer's named model is protected from being answered by a different one. What this
     check owns is imageDetail's position in that signature, so it reads the pair, not the spelling
     of the flag alone. */
  assert.match(aiproxy, /imageDetail = "auto", noFallback = false/, 'callOpenAI takes an imageDetail param');
  assert.match(aiproxy, /content\.push\(\{ type: "input_image", image_url: `data:\$\{ip\.mime\};base64,\$\{ip\.b64\}`, detail: _detail \}\);/, 'input_image carries the detail flag');
  assert.match(aiproxy, /const imageDetail = \(payload\.imageDetail === "high" \|\| payload\.imageDetail === "low"\) \? payload\.imageDetail : "auto";/, 'server clamps imageDetail to a safe set');
  assert.match(aiproxy, /task === "atlas_plan" \|\| task === "analysis" \|\| task === "analysis_structured" \|\| task === "vision_read"\)\) effort = "high"/, 'vision_read may think at "high" via effortHint');
});
