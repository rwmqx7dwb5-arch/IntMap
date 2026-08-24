/* ============================================================================
 *  IntMap · #R285 source checks
 * ----------------------------------------------------------------------------
 *  「Atlasの最低限の人格設定を正式仕様として追加してください。… 可能なら人格設定は
 *    1か所を正本として管理し、system prompt等への重複記述を最小化してください。」
 *
 *  Two properties are asserted here, and they pull in opposite directions on purpose:
 *
 *    A. EVERY Atlas system prompt carries the persona.   (nothing was missed)
 *    B. NOTHING carries a second copy of it.             (nothing was duplicated)
 *
 *  A check that only tested A would pass on a codebase that pasted the persona into nine
 *  prompts, which is the exact state 「1か所を正本として」 rules out; a check that only
 *  tested B would pass on a codebase that had deleted it. Both, or neither.
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SEARCH. js/atlas-persona.js's own header quotes all eight
 *  of the opening lines it replaced — "You are Atlas, the analysis engine…", "You are a precise
 *  geocoder…" — so a check that read the raw file would fail on the paragraph explaining the fix
 *  (「自分の検査が自分のコメントに当たる」, fifteen times now).
 *  ⚠ §① RUNS THE SAME PREDICATES ON SYNTHETIC SOURCE CARRYING THE OLD SHAPE, so green below means
 *  «looked and found nothing», not «looked at nothing» (#R274 ③).
 *  ⚠ §⑧ IS ABOUT DELIVERY, NOT ABOUT SOURCE. scripts/atlas-catalog.mjs proves the catalogue is
 *  WRITTEN; this proves it ARRIVES. For as long as `system` shared MAX_PROMPT with `prompt`, the
 *  planner prompt was cut from 80,495 characters to 24,000 — 29.8 % delivered — and the catalogue
 *  gate stayed green throughout, because the source it reads was complete.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { personaPrompt } from '../js/atlas-persona.js';
/* (#R318) the action catalogue lives in its own module now — see plannerPromptSize() below */
import * as catalogModule from '../js/atlas-catalog-text.js';
/* (#R397) SYS() now reads three clauses out of js/atlas-policy.js. The stub Proxy answers an unknown
   name with `() => ''`, so leaving POLICY out would not fail — it would make `POLICY.all` a missing
   property on a function and throw, and if it ever stopped throwing it would silently measure a
   prompt with the clauses MISSING. The real module is what keeps this a real measurement. */
import { makeAtlasPolicy } from '../js/atlas-policy.js';
const ATLAS_PERSONA = personaPrompt.spec;   /* the specification hangs off the single export (#R175) */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* Every file that builds an Atlas system prompt. The generated mirror is deliberately absent: it
   IS a second copy, by construction, and scripts/sync-atlas-persona.mjs owns it. */
/* ⚠ THE FIRST SWEEP FOR THESE FILES WAS TOO NARROW and found eleven of them: it looked for
   "You are Atlas" / "You are IntMap", so it never saw the nine prompts that opened "You are a
   precise geocoder", "You are a satellite-imagery analyst", "You are a geographic verification
   service"… — i.e. exactly the ones that had drifted furthest from Atlas. The predicate below
   is the one that found the rest, and it is the one that keeps them found. */
const EXPECTED_CALLS = {
  'js/atlas-console.js': 9,          /* analyze, researchMap, brief, mapReport, historical, planner, vision, region outline, region units */
  /* (#R322) the two prompts moved with the AI-research body when js/analysis-panels.js was split
     into an eager shell and five lazy implementations. Same two calls, same file's worth of code —
     only the file name changed, and the count is what this table is actually about. */
  'js/analysis-research.js': 2,      /* place brief, ask-about-this-point */
  'js/app-body.js': 2,               /* satellite-image comparison, area news summary */
  'js/atlas-geo-resolve.js': 2,      /* place verification, region resolution */
  'js/news-ui.js': 3,                /* publisher HQ, headline subject, article translation */
  'supabase/functions/monitor-run/index.ts': 1,
  'supabase/functions/refresh-news/index.ts': 1,
  /* ⚠ (#R397) THIS ROW WAS MISSING FOR FORTY-ONE ROUNDS. #R351 added a `personaPrompt("translating
     world-news headlines…", {mode:"internal"})` to supabase/functions/news-ingest/index.ts and did
     not add it here — and because every check below iterates PROMPT_FILES, which is
     Object.keys(EXPECTED_CALLS), THE TABLE WAS THE POPULATION. A prompt in a file the table does not
     name could drift, restate the register clause, or introduce itself in its own words, and nothing
     would go red. Architecture.md carried the same «20» and the same omission.
     The row is the smaller half of the fix; test (2b) below is the other half. */
  /* (#R404) TWO now. The second is the `locate` stage's geolocation prompt. ⚠ Two call sites is not
     two personas — it is the sanctioned shape: each prompt declares its OWN task to the one shared
     persona (`translating world-news headlines…` / `locating world news on the map…`), which is
     exactly what CONSTITUTION.md §5 allows the caller to add. Collapsing them into one call would
     make one of the two lie about what it is doing. */
  'supabase/functions/news-ingest/index.ts': 2,   /* headline translation, subject geolocation (both internal mode) */
};
const PROMPT_FILES = Object.keys(EXPECTED_CALLS);

/* An identity opener = a string literal that NAMES who the assistant is: "You are Atlas…",
   "You are a geopolitical…", "You are IntMap's…". ⚠ It is deliberately not the looser /'You are /,
   which also matches the persona's own «You are not a chat feature attached to the side of a map
   product» — a negation inside a clause, not a second identity. A predicate wider than the thing it
   is looking for reports its own source as the defect (「探し方が対象より広い」). */
const openers = (code) => code.match(/(['"])You are (?:Atlas|IntMap|an? )[^\n]{0,80}/g) || [];

/* ── ① THE CHECKS CAN GO RED ───────────────────────────────────────────────────────────────── */
const OLD_SHAPE = [
  "      let s='You are Atlas, the analysis engine of the IntMap world map. Current local time: '+nowCtx.local;",
  "      const sysB='You are a geopolitical and area-studies research assistant. The real current date is '+today;",
  "    const _langLine=()=>{ const l2=_replyLang(); return l2+'…'+(l2==='Japanese'?'; use polite Japanese (です・ます／敬語) by default unless the user is clearly casual':''); };",
].join('\n');

test('R285 (1) the predicates name the old shape when it is there', () => {
  const code = codeOnly(OLD_SHAPE);
  assert.equal(openers(code).length, 2, 'two hand-written identity openers are seen in the old shape');
  assert.equal((code.match(/personaPrompt\(/g) || []).length, 0, 'the old shape calls nothing shared');
  assert.match(code, /です・ます/, 'the old shape carries its own register clause — this is what regressing looks like');
});

/* ── ② EVERY ATLAS PROMPT OPENS WITH THE SHARED PERSONA ────────────────────────────────────── */
test('R285 (2) every Atlas system prompt is built from js/atlas-persona.js', () => {
  for (const f of PROMPT_FILES) {
    const code = codeOnly(read(f));
    assert.equal(
      (code.match(/personaPrompt\(/g) || []).length, EXPECTED_CALLS[f],
      `${f}: expected ${EXPECTED_CALLS[f]} personaPrompt() call sites`,
    );
    assert.match(code, /atlas-persona\.js/, `${f}: does not import the persona`);
  }
});

/* ── ②b THE TABLE IS NOT THE POPULATION ───────────────────────────────────────────────────────
   (#R397) Every check in this file iterates PROMPT_FILES. That makes EXPECTED_CALLS a declaration of
   what exists, and a declaration is exactly what #R351's addition slipped past. So ask the repository
   instead: which files import the persona? Any file that does and is not in the table is a prompt
   nothing here has ever inspected.
   ⚠ MUTATION THAT MUST GO RED: delete the news-ingest row above. */
test('R285 (2b) no file imports the persona without appearing in the table', () => {
  const roots = ['js', 'supabase/functions'];
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!/\.(js|ts|mjs)$/.test(e.name)) continue;
      if (rel.endsWith('atlas-persona.js')) continue;   /* the source of truth and its generated mirror */
      const src = readFileSync(resolve(ROOT, rel), 'utf8');
      if (/from\s+['"][^'"]*atlas-persona\.js['"]/.test(src)) found.push(rel);
    }
  };
  roots.forEach(walk);
  assert.ok(found.length > 0, 'nothing imports the persona — this check has lost its subject');
  const missing = found.filter((f) => !(f in EXPECTED_CALLS));
  assert.deepEqual(missing, [],
    `these files build a system prompt from the persona and are absent from EXPECTED_CALLS, so no check in this file has ever read them: ${missing.join(', ')}`);
});

/* ── ③ …AND NONE OF THEM STILL INTRODUCES ITSELF IN ITS OWN WORDS ──────────────────────────── */
test('R285 (3) no prompt carries a hand-written identity line any more', () => {
  for (const f of PROMPT_FILES) {
    const found = openers(codeOnly(read(f)));
    assert.deepEqual(found, [], `${f}: still names who it is by hand: ${found.join(' | ')}`);
  }
  /* …and the ONE place the sentence legitimately survives is the builder. Asserting where it still
     exists is what makes ③ a de-duplication check rather than a deletion check (#R279 ④). */
  const persona = codeOnly(read('js/atlas-persona.js'));
  assert.deepEqual(openers(persona), [], 'js/atlas-persona.js hard-codes an identity too — it must assemble one');
  assert.equal(
    (persona.match(/'You are ' \+/g) || []).length, 1,
    'js/atlas-persona.js no longer assembles the identity line — every prompt now has no name at all',
  );
});

/* ── ③b …AND NO FILE ANYWHERE GROWS A NEW ONE ─────────────────────────────────────────────── */
/* ③ only looks at the files that are known to build a prompt, so it cannot see a TENTH prompt added
   to a file this list has never heard of — which is exactly how the nine extra ones survived the
   first sweep. This walks js/ and supabase/functions/ whole. */
/* every source file under a directory, recursively — the file set ③b and ⑥ both sweep */
const walkSources = (dir, out = []) => {
  for (const e of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walkSources(rel, out);
    else if (/\.(js|ts|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
};

test('R285 (3b) no file in js/ or supabase/functions/ hand-writes an Atlas identity', () => {
  const offenders = [];
  for (const f of [...walkSources('js'), ...walkSources('supabase/functions')]) {
    for (const hit of openers(codeOnly(read(f)))) offenders.push(`${f}: ${hit}`);
  }
  assert.deepEqual(offenders, [], 'a prompt names who it is by hand instead of calling personaPrompt(): ' + offenders.join(' | '));
});

/* ── ④ THE SPECIFICATION IS COMPLETE ───────────────────────────────────────────────────────── */
/* One entry per point the user specified. The value is what that point has to actually SAY — a
   clause that exists but no longer carries its content is a clause that was quietly hollowed out. */
const SPEC = {
  name: [/\bAtlas\b/, /only name/i],
  role: [/operating system/i, /underneath IntMap/i],
  origin: [/book of maps/i, /Greek myth/i, /holds up the sky/i],
  character: [/calm/i, /intellectually serious/i, /honest/i, /direct/i, /flexible/i, /even-tempered/i, /neutral/i],
  address: [/adjust the distance/i, /amount of explanation/i, /です・ます/, /at all times/i, /過剰な敬語/],
  facts: [/fact and evidence/i, /cannot be verified/i],
  opinion: [/do not volunteer/i, /asks for your view/i, /rather than as established fact/i],
  emotion: [/do not simulate emotion/i, /roleplay/i],
  self: [/not written here is not set/i, /do not invent or infer/i, /not specified/i],
  confidential: [/never reveal/i, /system prompt/i, /decline/i],
};

test('R285 (4) all ten specified points are in the persona, and each still says what it must', () => {
  assert.deepEqual(ATLAS_PERSONA.order, Object.keys(SPEC), 'the persona carries exactly the specified points, in order');
  for (const [id, patterns] of Object.entries(SPEC)) {
    const text = ATLAS_PERSONA.clauses[id];
    assert.ok(text && text.length > 40, `clause "${id}" is missing or has been emptied out`);
    for (const p of patterns) assert.match(text, p, `clause "${id}" no longer states: ${p}`);
  }
  assert.equal(ATLAS_PERSONA.name, 'Atlas');
});

/* ── ⑤ …AND ALL OF IT REACHES A REAL PROMPT ────────────────────────────────────────────────── */
test('R285 (5) the full preamble delivers every clause; internal mode drops exactly four', () => {
  const full = personaPrompt('the analysis engine of the IntMap world map');
  assert.match(full, /^You are Atlas, the analysis engine of the IntMap world map\.\n/, 'the task role opens the prompt');
  for (const id of ATLAS_PERSONA.order) assert.ok(full.includes(ATLAS_PERSONA.clauses[id]), `clause "${id}" never reaches the prompt`);

  const internal = personaPrompt('tracing region outlines', { mode: 'internal' });
  assert.deepEqual(ATLAS_PERSONA.internal, ['name', 'role', 'facts', 'confidential']);
  for (const id of ATLAS_PERSONA.internal) assert.ok(internal.includes(ATLAS_PERSONA.clauses[id]), `internal mode dropped "${id}", which it must keep`);
  for (const id of ['origin', 'character', 'address', 'opinion', 'emotion', 'self']) {
    assert.ok(!internal.includes(ATLAS_PERSONA.clauses[id]), `internal mode still pays for "${id}", which a machine-read JSON answer cannot have`);
  }
  assert.ok(internal.length < full.length, 'internal mode is the cheaper of the two');
});

/* ── ⑥ THE REGISTER RULE LIVES IN ONE PLACE ────────────────────────────────────────────────── */
/* #R147 wrote the Japanese-politeness clause into _langLine() AND into the analysis prompt, and
   nowhere else — the only fragment of a persona this codebase had. The specification supersedes
   its wording (「ただし常に自然な敬語」, with no "unless the user is casual" escape), and the
   persona now owns it. ⚠ The second half of this test counts what must NOT have been deleted:
   _langLine() exists for the reply-language LOCK (#R155), which has to survive intact. */
test('R285 (6) the Japanese register rule appears once, and the language lock survived', () => {
  /* ⚠ (#R285 追記) THIS USED TO LOOK AT ONE FILE, AND THAT IS HOW IT MISSED THE THIRD COPY.
     js/app-body.js's `_aiLangLine()` carried the same clause — with the same superseded «unless the
     user is clearly casual» escape that the specification replaces with 「ただし常に自然な敬語」 —
     and it is appended to four prompts. ③ and ③b sweep the repository for a hand-written IDENTITY;
     nothing swept it for a hand-written REGISTER, so the register survived in a file the identity
     sweep had already cleared. It is the same defect one field over, and the fix is the same shape:
     look at every file, not at the one that was on your mind. Found by production verification. */
  const CANON = ['js/atlas-persona.js', 'supabase/functions/_shared/atlas-persona.js'];
  const dupes = [];
  for (const f of [...walkSources('js'), ...walkSources('supabase/functions')]) {
    if (CANON.includes(f)) continue;
    const code = codeOnly(read(f));
    if (/です・ます|敬語|polite Japanese/.test(code)) dupes.push(f);
    if (/unless the user is clearly casual/i.test(code)) dupes.push(f + ' (superseded escape)');
  }
  assert.deepEqual(dupes, [], 'a second copy of the register rule survives — it belongs only in js/atlas-persona.js: ' + dupes.join(' | '));

  const console_ = codeOnly(read('js/atlas-console.js'));
  assert.ok(!/です・ます/.test(console_), 'js/atlas-console.js still carries its own copy of the register rule');
  assert.ok(!/unless the user is clearly casual/i.test(console_), 'the superseded "unless the user is casual" escape is still in the prompts');

  const persona = ATLAS_PERSONA.clauses.address;
  assert.match(persona, /です・ます/, 'the persona is where the register rule lives');

  /* not deleted: the reply-language lock and its Han-characters carve-out (#R155) */
  assert.match(console_, /_langLine=\(\)=>/, '_langLine() itself was removed');
  assert.match(console_, /NEVER changes the reply language/, 'the #R155 reply-language lock was removed with the register clause');
  assert.match(console_, /Han\/Chinese or Korean characters/, 'the #R155 Han-characters carve-out was removed with the register clause');
});

/* ── ⑦ THE EDGE-FUNCTION MIRROR IS THE SAME TEXT ───────────────────────────────────────────── */
test('R285 (7) the Edge Function copy is byte-identical to the source of truth', async () => {
  const { inSync } = await import('../scripts/sync-atlas-persona.mjs');
  assert.ok(inSync(), 'supabase/functions/_shared/atlas-persona.js has drifted — run: node scripts/sync-atlas-persona.mjs');
});

/* ── ⑧ THE WHOLE PLANNER CATALOGUE ACTUALLY ARRIVES ────────────────────────────────────────── */
/* Rebuild the planner prompt the way the browser does — the real persona, and the three runtime
   catalogues at the sizes measured live on the built app (window.IntMapOS.catalog(), #R285) — and
   compare it with the bound the deployed proxy applies to `system`. */
const LIVE_CATALOGUES = 3727 + 3750 + 1482;   /* controls + layers + modules, measured */

function plannerPromptSize() {
  const lines = read('js/atlas-console.js').split(/\r?\n/);
  /* (#R318) SYS takes the capability selection now — `SYS(sel)`, where a null selection means the
     WHOLE catalogue, i.e. the prompt this check has always measured. */
  const s = lines.findIndex((l) => /^\s*function SYS\((sel)?\)\s*\{/.test(l));
  const e = lines.findIndex((l, i) => i > s && /^    \}$/.test(l));
  assert.ok(s >= 0 && e > s, 'function SYS() was not found — the planner prompt moved');
  /* ⚠ (#R318) THE CATALOGUE HAS TO COME BACK IN, OR THIS CHECK STOPS MEASURING THE THING IT NAMES.
     The 38 action blocks moved to js/atlas-catalog-text.js and SYS() composes them with
     `_DOCS.text(...)`. Stubbing that with '' would shrink the measured prompt by 57 kB and the
     assertion would pass on a prompt nobody sends. So the stub is the REAL module, asked for the
     REAL full catalogue — which is also the honest worst case, since a low-confidence request
     falls back to exactly that. */
  const { makeAtlasCatalogText } = catalogModule;
  const DOCS = makeAtlasCatalogText({}, {});
  const env = {
    personaPrompt,
    POLICY: makeAtlasPolicy(),
    _DOCS: DOCS,
    _langLine: () => 'English (write EVERYTHING in English, every sentence — a place, person or organization name in the request, even one written in Han/Chinese or Korean characters, NEVER changes the reply language)',
    controlCatalog: () => 'x'.repeat(3727),
    layerCatalogText: () => 'x'.repeat(3750),
    moduleCatalog: () => 'x'.repeat(1482),
  };
  const stub = new Proxy(env, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : (typeof k === 'string' ? () => '' : undefined))) });
  /* `new Function` bodies are sloppy-mode, so `with` is available even from this ES module. */
  return new Function('__stub', 'with(__stub){ ' + lines.slice(s, e + 1).join('\n') + ' return SYS(); }')(stub).length;
}

test('R285 (8) ai-proxy admits the whole planner prompt, with room to grow', () => {
  const proxy = read('supabase/functions/ai-proxy/index.ts');
  const sysCap = Number((proxy.match(/const MAX_SYSTEM = ([\d_]+)/) || [])[1]?.replace(/_/g, ''));
  const promptCap = Number((proxy.match(/const MAX_PROMPT = ([\d_]+)/) || [])[1]?.replace(/_/g, ''));
  assert.ok(Number.isFinite(sysCap), 'ai-proxy no longer declares MAX_SYSTEM');
  assert.ok(Number.isFinite(promptCap), 'ai-proxy no longer declares MAX_PROMPT');

  const code = codeOnly(proxy);
  assert.match(code, /payload\.system[^\n]*MAX_SYSTEM/, '`system` is not clamped with MAX_SYSTEM — the shared cap is back');
  assert.match(code, /payload\.prompt[^\n]*MAX_PROMPT/, '`prompt` must keep its own, tighter cap: it is the half that carries user text');

  const size = plannerPromptSize();
  assert.ok(size > promptCap, `the planner prompt (${size}) no longer exceeds MAX_PROMPT (${promptCap}) — if that is real, this check has stopped meaning anything`);
  assert.ok(size < sysCap, `the planner prompt is ${size} chars but MAX_SYSTEM is ${sysCap}: ${size - sysCap} chars would be cut off, mid-word, and the model would never know`);
  assert.ok(sysCap >= size * 1.5, `MAX_SYSTEM (${sysCap}) leaves less than 50% headroom over the current planner prompt (${size}) — a normal round's additions would start truncating again silently`);
  assert.ok(LIVE_CATALOGUES > 0);
});

/* ── ⑨ THE DOCUMENT POINTS AT THE SOURCE OF TRUTH INSTEAD OF COPYING IT ────────────────────── */
/* 「1か所を正本として管理し」 is a property of the DOCUMENTS too: a prose copy of the traits in
   Architecture.md is a second normative text, and #R274 is the round about what happens next. */
test('R285 (9) Architecture.md names the source of truth and does not restate the persona', () => {
  const arch = read('Architecture.md');
  assert.match(arch, /js\/atlas-persona\.js/, 'Architecture.md does not name the persona file at all');
  /* (#R280 moved the file ledger out of §3 and into docs/FILES.md; the entry lives there now.) */
  assert.match(read('docs/FILES.md'), /atlas-persona\.js\s+Atlas の人格/, 'docs/FILES.md does not list js/atlas-persona.js');

  /* the giveaway that the traits were pasted in: the clause bodies themselves */
  for (const id of ATLAS_PERSONA.order) {
    const sentence = ATLAS_PERSONA.clauses[id].split('. ')[1] || ATLAS_PERSONA.clauses[id];
    assert.ok(!arch.includes(sentence.slice(0, 60)), `Architecture.md has a second copy of clause "${id}" — link to js/atlas-persona.js instead`);
  }
});
