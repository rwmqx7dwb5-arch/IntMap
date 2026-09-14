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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CODE = (p) => codeOnly(readLF(join(ROOT, p)));
const PROXY = CODE('supabase/functions/ai-proxy/index.ts');
const CORE = CODE('js/ai-core.js');
const BODY = CODE('js/app-body.js');

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
  assert.match(PROXY, /const isDev = devIds\.includes\(String\(user\.id \|\| ""\)\.toLowerCase\(\)\)/);
});

/* ── ② the names come from the providers ──────────────────────────────────────────────────── */
test('R722 ② the model catalogue is fetched from each provider, never listed in this repo', () => {
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
test('R722 ③ a provider switch does not inherit the AI_MODEL secret', () => {
  assert.match(PROXY, /const envModel = provider === envProvider \? \(Deno\.env\.get\("AI_MODEL"\) \|\| ""\) : "";/);
  assert.match(PROXY, /const model = devPick\?\.model \|\| envModel \|\| PROVIDER_DEFAULT_MODEL\[provider\]/);

  /* ⚠ ONE TABLE OF DEFAULTS, NOT A TERNARY AT EVERY READER. Two readers exist now (the call and the
     catalogue's serverDefault); #R515's shape is two copies of one rule drifting apart. */
  assert.match(PROXY, /const PROVIDER_DEFAULT_MODEL: Record<string, string> = \{/);
  assert.doesNotMatch(PROXY, /provider === "gemini" \? "gemini-[^"]+" :/,
    'the inline per-provider default ternary is back — it is the second copy of PROVIDER_DEFAULT_MODEL');
  for (const p of ['openai', 'gemini', 'anthropic']) {
    assert.ok(PROXY.includes('  ' + p + ': '), 'PROVIDER_DEFAULT_MODEL has no ' + p + ' row');
  }
});

/* ── ④ a chosen model reports its own 403 instead of quietly running another one ──────────── */
test('R722 ④ the fallback walks sol → terra → luna, and stops for a model the developer chose', () => {
  assert.match(PROXY, /const noFallbackForPick = !!devPick\?\.model;/);
  const call = PROXY.slice(PROXY.indexOf('out = await callOpenAI(model, key'));
  assert.match(call.slice(0, 260), /imageDetail, noFallbackForPick, oaFormat\)/,
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
  const dflt = (PROXY.match(/const OPENAI_DEFAULT_MODEL = "([^"]+)"/) || [])[1];
  const chain = ((PROXY.match(/const FALLBACK_CHAIN = \[([^\]]*)\]/) || [])[1] || '')
    .split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
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
