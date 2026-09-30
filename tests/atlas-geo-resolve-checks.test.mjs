/* ============================================================================
 *  Atlas · resolving a place — js/atlas-geo-resolve.js (geocode / placeExtent / whereMiss / the
 *  self-location phrases) and what the turn is told about the reader's own position
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from four round files; every test keeps the title it had there:
 *    · tests/r413-checks.test.mjs                    — 「現在地から大阪駅まで」: the device position,
 *                                                      nine languages of 「現在地」, and the caps #R413 removed
 *    · tests/r667-checks.test.mjs                    — 「渡されていない」 vs 「解決できなかった」 (whereMiss)
 *    · tests/r736-atlas-multiprobe-checks.test.mjs ①② — the camera's resolver refuses a stranger
 *    · tests/r737-geocode-noise-floor-checks.test.mjs  — …and so does the point resolver (both doors)
 *  (#R736 ③④ are about the model table and live in tests/atlas-ai-proxy-models-checks.test.mjs.)
 *  Their histories follow, each above its own tests.
 * ==========================================================================*/
/* ============================================================================
 *  #R413 — 「Atlasに全権を委任しろ。全権だ。」 の回帰テスト
 * ----------------------------------------------------------------------------
 *  報告は 1 枚のスクリーンショットだった。「現在地から大阪駅まで」に対して Atlas は
 *  「こちらには実際の GPS 現在地が届いておらず、地図中央（約44.76, 50.46）しか取得できません。
 *   現在地の地名・駅名、または地図上の出発地点を指定してください。」と答え、**何も実行しなかった**。
 *
 *  それは嘘ではない。**Atlas に渡されていたもの全部の、正確な報告**である。渡していなかった側を
 *  4 か所測った:
 *
 *    · `js/atlas-state.js` の deviceLocation 行は `dl.lat` を読んでいた。provider が publish して
 *      いるのは `{active, last:{lng,lat,acc}}` なので `dl.lat` は永久に `undefined` ——
 *      **書かれた日から 1 度も出力されていない**。しかも出た場合の文面は
 *      «never as the subject of a question that named a place» と書いてあり、
 *      「現在地から**大阪駅**まで」はまさに place を名指している。
 *    · `find_capability` は上位 **8 件**で切り、同点は id のアルファベット順だった。
 *      「現在地から大阪駅までの経路」は 10 件が同点 16 で、`routing.route` は **9 位**＝脱落。
 *      返ってきた 5 本の `navigation.*` は全部「先に経路を計画してください」と答える実装。
 *    · `norm()` が camelCase を分割しないので `find_capability('my location')` は **0 件**で
 *      「IntMap may not have this」と答えていた。#R155 から動いている `view.locate` に、
 *      どの言語からも届かない。表全体で **186 綴り中 93** が同じ穴に落ちていた。
 *    · `SELFLOC_RE` は ja/en/ru/es/de の 5 言語だけ。fr/ko/zh の読者は「現在地」と言えず、
 *      しかも言えなかったとき `geocode()` は**地図中心を成功として返していた**。
 *
 *  ⚠ このファイルが検査するのは「今は直っている」ではなく **「戻したら赤くなる」** である。
 *  ⑤〜⑨ は実装を壊して赤を実測する（#R392: 変異させて赤を見るまで検査は完成していない）。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { capsSource } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');   /* (#R667's name for the same reader) */
/* ⚠ Scan CODE, not prose. The first draft of ⑨ searched the raw file for `maxLayers` and went red on
   its OWN comment explaining that maxLayers is gone — the self-hit this repository has now made
   thirteen times (see `memory/intmap-recurring-lessons.md`). Comments and string literals are blanked
   first; identical to tests/r162-checks.test.mjs's `code()`. */
function code(src) { return codeOnly(src, { literals: 'blank' }); }

/* The modules under test are pure ESM with no DOM, which is what lets the SHIPPED code run here.
   ⚠ (tests-by-topic) ONE window for the whole file: #R413 used a bare {} and #R667 used globalThis
   itself; the language registry #R667 loads writes to whichever it is, and nothing here reads the
   difference — so it is globalThis, the shape every other Atlas file in tests/ uses. */
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasState } = await import('../js/atlas-state.js');
const { makeAtlasGeoResolve } = await import('../js/atlas-geo-resolve.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasPolicy } = await import('../js/atlas-policy.js');
const { NominatimGate } = await import('../js/nominatim-gate.js');

const CAPS = makeAtlasCapabilities();
const TOOLS = makeAtlasToolSurface({ capabilities: CAPS, schemas: makeAtlasSchemas(), runAction: null });

/* A geo-resolver with no browser: `navigator.geolocation` is absent, which is the DENIED case. */
function geoResolve() {
  return makeAtlasGeoResolve({}, {
    GE: () => ({ camera: { getCenter: () => ({ lng: 50.46, lat: 44.76 }) } }),
    L: (...a) => a[0], _setLast: (x) => x,
    lastPlace: () => ({ lng: 2.35, lat: 48.85, name: 'Paris' }),
  });
}

/* ⚠ THE PHRASE TABLE IS NOT EXPORTED, AND MUST NOT BE. tests/r199-checks ② requires the factory's
   return to be EXACTLY what js/atlas-console.js destructures, so adding `SELFLOC_WORDS` to it for a
   test's convenience would break a real invariant. The table is read out of the source — which is
   the 正本, not a copy of it — and every word it names is then driven through the SHIPPED
   `geocode()`, which is the only path the app has. */
const GEO_SRC = rd('js/atlas-geo-resolve.js');
function selflocTable() {
  const block = /const SELFLOC_WORDS=Object\.freeze\(\{([\s\S]*?)\}\);/.exec(GEO_SRC);
  assert.ok(block, 'js/atlas-geo-resolve.js declares the self-location phrase table');
  const table = {};
  const row = /(?:^|\n)\s*'?([A-Za-z-]+)'?\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = row.exec(block[1]))) {
    table[m[1]] = m[2].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  }
  return table;
}

/* Run `fn` with a device that answers with this fix — or, with `fix` null, with no geolocation at
   all, which is what a permanently blocked browser looks like to the code. */
async function withDevice(fix, fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const geolocation = fix ? { getCurrentPosition: (ok) => ok({ coords: { longitude: fix.lng, latitude: fix.lat, accuracy: fix.acc || 0 } }) } : undefined;
  Object.defineProperty(globalThis, 'navigator', { value: geolocation ? { geolocation } : {}, configurable: true });
  try { return await fn(); } finally {
    if (had) Object.defineProperty(globalThis, 'navigator', had);
    else delete globalThis.navigator;
  }
}

/* ══ ① THE LINE THAT NEVER FIRED ══════════════════════════════════════════════════════════════
   The snapshot is built by calling the REAL provider over a stub of the real global, so the shape
   the renderer reads is the shape the provider writes. A literal `{lat, lng}` written by hand here
   is exactly how the defect survived: it passes against a shape nothing produces. */
function snapshotWith(locate) {
  const S = makeAtlasState();
  const prev = globalThis.window.IntMapLocate;
  globalThis.window.IntMapLocate = locate;
  try {
    S.registerDefaultProviders({ GE: () => null, host: {} });
    return { S, snap: S.snapshot({ only: ['deviceLocation'] }) };
  } finally { globalThis.window.IntMapLocate = prev; }
}

test('R413 ①: the device position reaches the model in the shape the provider actually publishes', () => {
  const { S, snap } = snapshotWith({ isActive: () => true, last: () => ({ lng: 135.4959, lat: 34.7016, acc: 18 }) });
  assert.ok(snap.deviceLocation && snap.deviceLocation.last, 'the provider published a fix');
  const line = S.renderPrompt(snap);
  assert.match(line, /34\.70/, 'renderPrompt states the latitude the provider published');
  assert.match(line, /135\.49/, 'and the longitude');
  /* the defect, stated as a test: reading a top-level `lat` finds nothing */
  assert.equal(snap.deviceLocation.lat, undefined,
    'the provider has never published a top-level `lat` — a renderer that reads one prints nothing');
});

test('R413 ②: knowing where the reader is no longer forbids using it for a request that names a place', () => {
  const { S, snap } = snapshotWith({ isActive: () => true, last: () => ({ lng: 135.4959, lat: 34.7016, acc: 18 }) });
  const line = S.renderPrompt(snap);
  assert.doesNotMatch(line, /never as the subject of a question that named a place/,
    '「現在地から大阪駅まで」 names a place; the old sentence ruled out the one request the position was for');
  assert.match(line, /origin of a route to a named place/, 'and it says so positively instead');
});

test('R413 ③: with no fix yet, Atlas is told to go and get one — not that it has only the map centre', () => {
  const { S, snap } = snapshotWith({ isActive: () => false, last: () => null });
  const line = S.renderPrompt(snap);
  assert.match(line, /my_location/, 'the tool that obtains it is named');
  assert.match(line, /map centre is NOT a substitute/i, 'and the map centre is ruled out explicitly');
  /* absent subsystem ≠ idle subsystem: no provider at all still says nothing (this file's §1 rule) */
  assert.equal(makeAtlasState().renderPrompt({ deviceLocation: null }), '',
    'a section nobody owns stays silent rather than claiming the position is unknown');
});

/* ══ ④ NINE LANGUAGES, READ OFF THE SHIPPED LOCALES ═══════════════════════════════════════════
   ⚠ NOT a hand-written list of language codes. js/locale-boot.js globs js/locales/, so the set of
   languages IS the set of ui.<code>.js files; that directory is the population. */
test('R413 ④: every language IntMap ships can say "my location", through the path the app uses', async () => {
  const shipped = readdirSync(join(ROOT, 'js/locales'))
    .map((f) => /^ui\.(.+)\.js$/.exec(f)).filter(Boolean).map((m) => m[1]).sort();
  assert.ok(shipped.length >= 9, `js/locales ships ${shipped.length} ui tables`);
  const table = selflocTable();
  assert.deepEqual(shipped.filter((lc) => !table[lc]), [],
    'the phrase table has a row for every language js/locales ships');

  const FIX = { lng: 135.4959, lat: 34.7016, acc: 18 };
  await withDevice(FIX, async () => {
    for (const lc of shipped) {
      assert.ok(table[lc].length, `${lc} has at least one spelling`);
      for (const w of table[lc]) {
        const got = await geoResolve().geocode(w);
        assert.ok(got && Math.abs(got.lat - FIX.lat) < 1e-9 && Math.abs(got.lng - FIX.lng) < 1e-9,
          `${lc}: "${w}" must resolve to the DEVICE, not to ${JSON.stringify(got)}`);
      }
    }
    /* everything the pre-#R413 expression accepted — nothing was traded away for the new languages */
    for (const w of ['現在地', '現在の位置', '今いる場所', '自分の居場所', 'マイ ロケーション',
      'my location', 'my current position', 'current location', 'where i am', 'where iam',
      'где я', 'моё местоположение', 'mi ubicación', 'mein standort']) {
      const got = await geoResolve().geocode(w);
      assert.ok(got && got.lat === FIX.lat, `the old expression accepted "${w}" and this one still does`);
    }
    /* …and it is still a SELF-location phrase: deixis keeps meaning the last place Atlas touched */
    assert.deepEqual(await geoResolve().geocode(''), { lng: 2.35, lat: 48.85, name: 'Paris' },
      'an empty place is deixis, not the reader');
    assert.deepEqual(await geoResolve().geocode('here'), { lng: 2.35, lat: 48.85, name: 'Paris' });
  });
});

test('R413 ⑤: a refused GPS resolves to NOTHING — never to the map centre, never to the last place', async () => {
  await withDevice(null, async () => {          /* no navigator.geolocation at all = permanently blocked */
    for (const w of ['現在地', 'my location', 'ma position', '내 위치', '我的位置']) {
      assert.equal(await geoResolve().geocode(w), null,
        `"${w}" with no device fix must fail rather than silently become 44.76,50.46 (the map centre) or Paris (the last place Atlas touched)`);
    }
    /* deixis is a different question and still answers with the last place */
    assert.deepEqual(await geoResolve().geocode(''), { lng: 2.35, lat: 48.85, name: 'Paris' });
    /* …and coordinates Atlas obtained from the device can be handed straight back to any place argument */
    assert.deepEqual(await geoResolve().geocode('34.7016, 135.4959'),
      { lng: 135.4959, lat: 34.7016, name: '34.7016, 135.4959' });
    assert.equal(await geoResolve().geocode('91, 0'), null, 'a latitude past the pole is not a coordinate');
  });
});

/* ══ ⑥ THE DOOR OPENS FOR ITS OWN SPELLINGS ═══════════════════════════════════════════════════
   The population is the registry itself: every alias written in camelCase, asked for in the words
   it is made of. Before #R413, 93 of 186 scored zero — and `find_capability` answers a zero-score
   query with «IntMap may not have this», so those capabilities did not exist for Atlas. */
test('R413 ⑥: every camelCase spelling in the registry is reachable by the words it is made of', () => {
  const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const unreachable = [];
  let camel = 0;
  for (const cap of CAPS.all()) {
    for (const a of (cap.aliases || [])) {
      const w = words(a);
      if (w === a.toLowerCase()) continue;          /* not camelCase — nothing to split */
      camel++;
      if (CAPS.score(cap, w) <= 0) unreachable.push(`${cap.id} <- "${w}"`);
    }
  }
  assert.ok(camel >= 100, `the registry really does hold camelCase spellings (${camel})`);
  assert.deepEqual(unreachable, [], 'a capability must answer to its own alias written as ordinary words');
  /* and the identifier a planner emits verbatim still wins outright */
  assert.equal(CAPS.resolve('myLocation').id, 'view.locate');
  assert.ok(CAPS.score(CAPS.resolve('view.locate'), 'myLocation') >= 100, 'the verbatim identifier is an exact hit');
});

test('R413 ⑦: find_capability does not truncate, so a tie cannot be decided by the alphabet', async () => {
  for (const q of ['現在地から大阪駅までの経路', '경로 안내', 'itinéraire depuis ma position']) {
    const scored = CAPS.search(q, { want: 3, min: 1 }).ranked;
    const returned = (await TOOLS.find(q)).matches;
    assert.equal(returned.length, scored.length, `${q}: every capability that scored is returned`);
    assert.ok(returned.some((m) => m.id === 'routing.route'),
      `${q}: routing.route is the capability that answers this and it was ninth of ten equal scores`);
  }
  /* and each match still arrives with the schema that makes it callable */
  assert.ok((await TOOLS.find('directions')).matches.every((m) => m.schema && m.schema.type === 'object'));
});

test('R413 ⑧: the reader\'s own position is a tool Atlas always has, wired to the capability that exists', () => {
  /* kept as a spelling: what is pinned is the source (a literal i18n key, the console’s dispatch line), which the i18n audit and the page read as text */
  const tools = TOOLS.baseTools();
  assert.ok(tools.my_location, 'my_location is in the always-present set, not one find_capability away');
  assert.equal(tools.my_location.capabilityId, 'view.locate',
    'and it is the capability that has read the device since #R155 — not a second one alongside it');
  assert.equal(TOOLS.actionFor('my_location', {}, tools).action.type, 'locate',
    'it reaches the dispatch case that actually asks the browser');
  assert.match(tools.my_location.description, /never ask them to type their own location/i);
  assert.match(tools.ask_user.description, /Never for something you could obtain with another tool/i,
    'and the asking tool says what it is NOT for');

  /* the dispatch hands the coordinates back as a FACT: js/atlas-toolsurface.js forwards `exec` and
     nothing else, so a coordinate that exists only in rendered HTML is one Atlas never learns */
  const dispatch = (rd('js/atlas-console.js') + '\n' + capsSource());
  assert.match(dispatch, /exec:\{lat,lng,accuracyM:Math\.round\(\+p2\.coords\.accuracy\|\|0\),provenance:'device_location'\}/,
    'the locate case returns lat/lng/accuracy in `exec`');
  assert.match(dispatch, /_selfLocSeed\(\{lng,lat,acc:\+p2\.coords\.accuracy\|\|0\}\)/,
    'and seeds the 現在地 resolver so the next place argument costs no second GPS acquisition');
});

/* ══ ⑨ NO NEW LIMITS — CONSTITUTION.md §5 ═════════════════════════════════════════════════════
   The standing instruction is 「制限を増やす方向、例外を増やす方向に持っていくな」. What can be
   checked mechanically is that the caps this round removed have not come back, and that the
   constitution still carries the rule that says so. */
test('R413 ⑨: the caps this round removed have not come back', async () => {
  /* spellings on purpose where they read code: «the removed cap is absent» is a claim about the source; the record half is RUN below */
  const surface = code(rd('js/atlas-toolsurface.js'));
  assert.ok(!/var MAX_FIND\s*=/.test(surface), 'find_capability has no per-search result cap');
  assert.ok(!/var MAX_DOC\s*=/.test(surface), 'and no per-capability documentation cap');

  const state = code(rd('js/atlas-state.js'));
  for (const gone of ['maxLayers', 'maxReadable', 'maxObjects', 'maxObjectName', 'maxPolyNames', 'maxSearch']) {
    assert.ok(!state.includes(gone), `renderPrompt no longer clips ${gone} — that was the app's own state`);
  }
  /* the two that remain clip text arriving from OUTSIDE, which has no bound at all */
  assert.match(state, /var RENDER_LIMITS = \{ maxTitle: \d+, maxBody: \d+ \};/,
    'only the headline and the article body are still clipped, and the comment above says why');

  const console_ = code((rd('js/atlas-console.js') + '\n' + capsSource()));
  /* ⚠ (atlas-native-tools) THE RECORD IS BUILT IN js/atlas-agent.js NOW, AND IT IS MEASURED BY RUNNING IT. The
     old assertion read the spelling of one line of `_agentPrompt`; that line was unclipped and the
     transport cut the whole string at 24,000 characters anyway. What this guards is the fact: a
     result reaches Atlas whole, and one too large for an item is cut only WITH its size and the way
     to read the rest — never silently. */
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const A = (await import('../js/atlas-agent.js')).makeAtlasAgent();
  const turnOf = (big) => ({ transcript: [{ role: 'user', content: 'q' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'find_capability', arguments: { query: 'x' } }] },
    { role: 'tool', content: [{ id: 'c1', ok: true, documentation: big }] }], request: 'q' });
  const whole = A.composeInput(turnOf('w'.repeat(20000))).input.find((it) => it.type === 'function_call_output');
  assert.ok(whole.output.indexOf('w'.repeat(20000)) >= 0, 'the mechanical record of what the tools did reaches Atlas unclipped');
  const cut = A.composeInput(turnOf('z'.repeat(A.INPUT_BUDGET.item + 5000))).input.find((it) => it.type === 'function_call_output');
  assert.match(cut.output, /read_result/, 'a result cut to fit says how to read the rest');

  const agent = code(rd('js/atlas-agent.js'));
  const steps = /maxSteps:\s*(\d+)/.exec(agent);
  assert.ok(steps && +steps[1] >= 8, `a turn may take at least 8 steps (it is ${steps && steps[1]})`);
  const proxy = code(rd('supabase/functions/ai-proxy/index.ts'));
  /* the caps that were relaxed with maxSteps, so the room is real rather than nominal */
  assert.ok(+(/maxToolCalls:\s*(\d+)/.exec(agent) || [])[1] >= 4 * +steps[1],
    'a turn may run at least four tool calls per step — maxPerStep alone allows eight');
  /* ⚠ ONE place bounds the conversation, and it is not the prompt. The first draft asserted a number
     on the PROMPT's slice and stayed green when the number was put back, because the STORE caps it
     first — two numbers for one limit, and the check was watching the one that did not decide. */
  assert.ok(!/_hist\.slice\(/.test(console_.split('rewindHist')[0] || ''),
    'the prompt reads all of the conversation the store kept, rather than clipping it a second time');
  const kept = /_hist\.length>(\d+)\) _hist=_hist\.slice\(-(\d+)\)/.exec(console_);
  assert.ok(kept && kept[1] === kept[2], 'the store bounds itself with ONE number, not two');
  assert.ok(kept && +kept[1] >= 32, `the store keeps at least 32 conversation entries (it keeps ${kept && kept[1]})`);
  assert.ok(!/\.slice\(0, 160\)/.test(surface), 'a capability summary is not clipped');
  assert.ok(!/\.slice\(0, 400\)/.test(surface), 'and neither is the reason a call failed');
  const calls = /const TURN_MAX_CALLS = (\d+);/.exec(proxy);
  assert.ok(calls && +calls[1] >= +steps[1] + 2,
    `the server budget (${calls && calls[1]}) leaves room above the client's ${steps && steps[1]} steps — the client must not be the stricter of the two`);

  const law = rd('CONSTITUTION.md');   /* prose on purpose: this one IS the sentence */
  assert.match(law, /制限を増やす方向・例外を増やす方向へ\s*\r?\n?\s*持っていってはならない/,
    'CONSTITUTION.md §5 carries the standing instruction this round was given');
});

test('R413 ⑩: the policy says who is supposed to go and get the missing thing', () => {
  const core = makeAtlasPolicy().core();
  assert.match(core, /only the reader can supply it/, 'asking is for what only the reader can supply');
  assert.match(core, /if a tool can obtain it, obtain it/i, 'and everything else Atlas obtains itself');
  /* the persona is still the only place identity is written — #R285's rule, unchanged by this round */
  assert.ok(!/You are Atlas/.test(makeAtlasPolicy().all()), 'the policy still states no identity of its own');
});

/* ══ ⑪ EVERY CHECK ABOVE CAN GO RED ═══════════════════════════════════════════════════════════
   A check that cannot fail is a comment (#R392). Each mutation below is the DEFECT this round
   found, re-applied to the shipped source, and the matching assertion must reject it. */
test('R413 ⑪: re-introducing each defect makes the matching check fail', async () => {

  /* ⓐ the renderer reading the shape nothing produces */
  const brokenRender = (snap) => (snap.deviceLocation && isFinite(snap.deviceLocation.lat))
    ? 'The reader\'s DEVICE location is known: …' : '';
  assert.equal(brokenRender({ deviceLocation: { active: true, last: { lng: 135.5, lat: 34.7, acc: 18 } } }), '',
    'ⓐ the pre-#R413 renderer prints nothing for the real provider shape — which is why ① reads the provider');

  /* ⓑ the five-language expression: a French, Korean or Chinese reader cannot say it */
  const OLD = /^\s*(現在地|現在の位置|今(いる|の)(場所|位置)|自分の(位置|居場所|現在地)|マイ ?ロケーション|my (current )?(location|position)|current (location|position)|where i ?am|где я|моё ?местоположение|mi ubicación|mein standort)\s*$/i;
  const FIX = { lng: 2.2945, lat: 48.8584, acc: 5 };
  await withDevice(FIX, async () => {
    for (const w of ['ma position', '내 위치', '我的位置', '当前位置']) {
      assert.ok(!OLD.test(w), `ⓑ "${w}" was unsayable before this round`);
      const got = await geoResolve().geocode(w);
      assert.ok(got && got.lat === FIX.lat, `ⓑ "${w}" now reaches the device`);
    }
  });

  /* ⓒ norm() without the camelCase split — the 93 */
  const oldNorm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[\s·・･_\-]+/g, ' ').trim();
  assert.equal(oldNorm('my location').indexOf(oldNorm('myLocation')), -1,
    'ⓒ the old normaliser could not match an alias against the words it is made of');

  /* ⓓ the eight-result cut, with the alphabet breaking the tie */
  const ranked = CAPS.search('現在地から大阪駅までの経路', { want: 3, min: 1 }).ranked;
  assert.ok(ranked.length > 8, 'ⓓ more than eight capabilities score on this request');
  assert.ok(new Set(ranked.slice(0, 8).map((r) => r.score)).size === 1,
    '…all of them equally, so the first eight were an alphabetical accident');
  /* (atlas-semantic-search) the alphabet no longer breaks this tie — the ranking DECLARES it (the tied rows share one
     `rank`) — so the defect is re-applied here the way it ran: equal scores, then the alphabet. */
  const alphabetical = ranked.slice().sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  assert.ok(!alphabetical.slice(0, 8).some((r) => r.id === 'routing.route'),
    '…and routing.route is not among them: the cut is what dropped it, not the score');
  assert.equal(new Set(ranked.filter((r) => r.score === ranked[0].score).map((r) => r.rank)).size, 1,
    '…and today the tie is declared as a tie, not decided by the spelling');
});

/* ══ ⑫ AND NO TEST MAY GO ON ASSERTING THE LIMIT EITHER (#R433) ═══════════════════════════════
   ⑨ scans js/ for `MAX_FIND`, and ⑦ proves by running the real surface that nothing caps the
   result. Both were green for the twelve days that tests/r318-atlas.spec.js asserted
   `hit.matches.length <= 8` — this round's own number, kept alive in the one place neither check
   looks. ⚠ A RETIRED LIMIT SURVIVES IN WHATEVER STILL CHECKS FOR IT, and this one survived at the
   worst address available: that spec is deep tier (scripts/tiers.mjs), which runs on schedule and
   on dispatch only, so it failed every night and no pull request ever saw it. R413 did update
   tests/r406-turn.test.mjs — the comment at its line 166 says so — and simply never opened the
   other one. That is what this check is for: the sweep across the whole test tree that neither the
   source scan nor the behavioural test can perform.

   ⚠ THE BOUND THAT IS ALLOWED IS THE ONE WITH NO NUMBER IN IT. `expect(r.matches).toBeLessThan(
   r.registry)` says «this is a search and not the registry», which is the claim tests/r318-atlas
   .spec.js ② now makes. A LITERAL says «Atlas may know eight things», which is the defect. So the
   needle is the digit, not the comparison.

   ⚠ AND THE NEEDLE IS ASSEMBLED FROM PIECES ON PURPOSE. Written out whole it would stand in this
   file as code and match itself — the self-hit the header above counts thirteen of. `code()` blanks
   string literals, so these fragments disappear when this file is the one being scanned, while a
   real assertion written here would still be caught. */
test('R413 ⑫: no test asserts an upper bound on what find_capability returns', () => {
  const LT = 'toBeLess' + 'Than';
  const EXPECT = new RegExp('matches(?:[.]length)?[^;]{0,200}[.]' + LT + '(?:OrEqual)?[(][ ]*[0-9]');
  const COMPARE = new RegExp('matches[.]length[ ]*<=?[ ]*[0-9]');

  /* ⚠ the needle bites before it is trusted: the exact line this round removed, and the assert form */
  assert.ok(EXPECT.test('expect(hit.' + 'matches.length).' + LT + 'OrEqual(8);'),
    'the pattern no longer matches the assertion that caused this check to exist');
  assert.ok(EXPECT.test('expect(r.' + 'matches, `returned ${r.matches}`).' + LT + '(9);'),
    'the pattern misses the form that carries a message');
  assert.ok(COMPARE.test('assert.ok(hit.' + 'matches.length <= 8);'), 'the comparison form is not caught');
  /* …and does not bite the bound that is a fact about the registry rather than a ceiling */
  assert.ok(!EXPECT.test('expect(r.' + 'matches).' + LT + '(r.registry);'),
    'bounding the result by the size of the registry is the correct claim and must stay legal');

  const DIR = join(ROOT, 'tests');
  const walk = (d) => readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  const files = walk(DIR).filter((f) => /\.spec\.js$|\.test\.mjs$/.test(f));
  assert.ok(files.length > 250, `the walk found only ${files.length} test files — it is not reaching them`);

  const guilty = [];
  for (const f of files) {
    const src = code(readFileSync(f, 'utf8'));
    for (const re of [EXPECT, COMPARE]) {
      const m = re.exec(src);
      if (m) guilty.push(`${f.slice(ROOT.length + 1)}:${src.slice(0, m.index).split(String.fromCharCode(10)).length}`);
    }
  }
  assert.deepEqual(guilty, [],
    'a test caps find_capability at a literal — CONSTITUTION.md §5: the answer to a defect is not a bigger number');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R667 — the two walls #R663 measured and left standing (formerly tests/r667-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  R667 — THE TWO WALLS #R663 MEASURED AND LEFT STANDING
 * ----------------------------------------------------------------------------
 *  #R663 got the call made (a turn could no longer end by narrating what it was about to do) and
 *  got the failure's reason back to Atlas. The reported sentence still painted nothing, and the
 *  wire said why, twice over:
 *
 *    ① `geocode('東北沖（日本海溝）')` has no gazetteer entry to find and correctly refuses to accept
 *       a stranger (#R515). The case then answered 「震源はどこですか（地名または経緯度）」 — the
 *       question you ask something that gave you NOTHING. Atlas had given a place; it re-spelled it
 *       and asked again, seven times. Measured across the dispatch: 39 cases call geocode(), 32
 *       refuse when no point comes back, and NOT ONE distinguished 「渡されていない」 from
 *       「解決できなかった」 — there was no shared helper to fix, because there was no shared helper.
 *    ② `IntMapTsunami.open()` delegates to `IntMapRuntime.activate()`, which is
 *       `load(name).then(…)`, and threw the promise away to return a synchronous `true`. Measured
 *       immediately after it returned: `open:false`, and the PREVIOUS epicentre still in place. The
 *       `run()` on the very next line therefore found no epicentre. 2.5 s later the same arguments
 *       solved normally.
 *
 *  ⚠ WHAT THESE HOLD THE ROUND TO: one owner for the distinction rather than 32 edited sentences,
 *  a literal i18n key so the new sentence is not English in four languages (#R548's shape), and a
 *  refusal that is UNCHANGED whenever nothing was given — nothing Atlas could do before is refused
 *  now (CONSTITUTION.md §5).
 * ==========================================================================*/
/* ⚠ the registry reads the language DIRECTORY from a global (js/locales/_langs.js) or from the
   real module graph; without it `pick()` has no index for fr / ko and returns argument 0 —
   which is exactly the English fallback this test exists to catch, so it must be loaded. */
await import('../js/locales/_langs.js');
await import('../js/lang-registry.js');
/* the tables `pick()` answers fr / ko / zh out of — they register themselves on import */
for (const f of ['ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) await import('../js/locales/ui.' + (f === 'ja' ? 'jp' : f) + '.js');
const LANG = globalThis.window.IntMapLang;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* the module as js/atlas-console.js builds it, with the language actually switchable */
let LANGCODE = 'en';
const geoFor = () => makeAtlasGeoResolve({}, {
  GE: () => ({ camera: { getCenter: () => ({ lng: 0, lat: 0 }) } }),
  L: LANG.pick(() => LANGCODE), esc,
  lastPlace: () => null,
});

/* ══ ① THE DISTINCTION EXISTS, AND IT HAS EXACTLY ONE OWNER ════════════════════════════════════ */
test('R667 ①: a place that could not be resolved is said so; nothing given leaves the sentence alone', () => {
  const { whereMiss } = geoFor();
  const sentence = 'Where? Give an epicenter (place, or lng/lat).';
  /* nothing was given — the caller's own sentence, byte for byte */
  assert.equal(whereMiss(sentence, ''), sentence);
  assert.equal(whereMiss(sentence, null), sentence);
  assert.equal(whereMiss(sentence, '   '), sentence, 'and whitespace is nothing');
  /* a place WAS given and did not resolve — and the answer names it */
  const said = whereMiss(sentence, '東北沖（日本海溝）');
  assert.match(said, /東北沖（日本海溝）/, 'the reader and Atlas are told WHICH name failed');
  assert.match(said, /lng\/lat/, '…and what to do instead');
  assert.ok(!said.includes(sentence), 'it replaces the question that reads as "you gave me nothing"');
});

test('R667 ①b: the name is escaped — it arrives from the model and lands in HTML', () => {
  const { whereMiss } = geoFor();
  const said = whereMiss('Where?', '<img src=x onerror=alert(1)>');
  assert.ok(!/<img/.test(said), 'no markup survives');
  assert.match(said, /&lt;img/);
});

/* ══ ② FOUR LANGUAGES ANSWER FROM THE INLINE TABLE, WHICH A CONCATENATED KEY CANNOT REACH ══════ */
test('R667 ②: the sentence is translated in all nine languages, not five', () => {
  /* kept as a spelling: what is pinned is the source (a literal i18n key, the console’s dispatch line), which the i18n audit and the page read as text */
  const seen = new Map();
  for (const code of ['en', 'ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh-Hant', 'zh-Hans']) {
    LANGCODE = code;
    const { whereMiss } = geoFor();
    const said = whereMiss('Where?', 'Tohoku-oki');
    assert.match(said, /Tohoku-oki/, code + ': the name is interpolated');
    assert.ok(!said.includes('{n}'), code + ': the placeholder was consumed');
    seen.set(code, said);
  }
  /* ⚠ THE POINT: fr / ko / zh answer from `inline[code][argument 0]`, so they are the four a
     concatenated key would have left in English. Each must differ from the English text. */
  for (const code of ['fr', 'ko', 'zh-Hant', 'zh-Hans', 'ja', 'de', 'ru', 'es']) {
    assert.notEqual(seen.get(code), seen.get('en'), code + ' is not the English string');
  }
  /* and the key in the source is a literal — the thing that makes the table reachable at all */
  const src = R('js/atlas-geo-resolve.js');
  assert.match(src, /L\('“\{n\}” could not be resolved to a place\./, 'argument 0 is a literal with a placeholder');
});

/* ══ ③ ONE OWNER, NOT THIRTY-TWO EDITED SENTENCES ═════════════════════════════════════════════ */
test('R667 ③: the ambiguous refusals go through the one helper, and it lives beside geocode()', () => {
  /* a spelling on purpose: «one owner, and every refusal asks it» is a claim about where the code IS — no run can count call sites */
  const con = (R('js/atlas-console.js') + '\n' + capsSource());
  const uses = (con.match(/whereMiss\(L\(/g) || []).length;
  assert.ok(uses >= 8, 'every "where?" refusal that could not tell the two apart now asks the helper (found ' + uses + ')');
  /* the helper is defined ONCE, in the module that owns the resolution */
  assert.equal((R('js/atlas-geo-resolve.js').match(/function whereMiss\(/g) || []).length, 1);
  assert.ok(!/function whereMiss\(/.test(con), 'and not a second time in the console');
  /* it decides from the ARGUMENT, never from which case called it */
  const geo = R('js/atlas-geo-resolve.js');
  const body = geo.slice(geo.indexOf('function whereMiss('), geo.indexOf('\n  }', geo.indexOf('function whereMiss(')));
  assert.ok(!/tsunami|epicent|震源|transmitter/i.test(body), 'no case is named inside the helper');
  /* the console did not grow: it is under a shrink-only ceiling with no headroom */
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
});

/* ══ ④ THE ACTIVATION RACE: THE RUNTIME'S PROMISE IS HANDED BACK, AND THE CALLER WAITS ════════ */
test('R667 ④: open() returns what the runtime returns, and a promise is still truthy', () => {
  /* a spelling: open() and the tsunami case live in DOM closures (js/tsunami.js, js/atlas-console.js) this process cannot build */
  const tsu = R('js/tsunami.js');
  const fn = tsu.slice(tsu.indexOf('function openPublic('), tsu.indexOf('\n    }', tsu.indexOf('function openPublic(')));
  assert.match(fn, /return RT\.activate\('sim\.tsunami'/, 'the promise is returned, not discarded');
  assert.ok(!/;\s*return true;/.test(fn), 'no synchronous true stands in front of an async activation');
  /* the caller that drives the panel immediately afterwards now waits for it */
  const con = (R('js/atlas-console.js') + '\n' + capsSource());
  assert.match(con, /try\{ await T\.open\(\{ lng:ll\.lng/, 'the tsunami case awaits activation before driving the module');
  /* ⚠ and the reason a promise is safe here: every existing caller reads the result as truthy */
  assert.ok(!!Promise.resolve(true), 'a promise is truthy');
  assert.ok(!/\.open\([^)]*\)\s*===\s*true/.test(con), 'nothing compares the result to `true`');
});

/* ══ ⑤ THE RUNTIME REALLY IS ASYNC — the fact the whole round rests on ═══════════════════════ */
test('R667 ⑤: IntMapRuntime.activate() resolves later, so a synchronous return could not have carried it', () => {
  /* a spelling: js/runtime.js activates through the app-wide frame loop and lifecycle, which need the running page */
  const rt = R('js/runtime.js');
  const fn = rt.slice(rt.indexOf('function activate(name, arg)'), rt.indexOf('\n    function suspend'));
  assert.match(fn, /return load\(name\)\.then\(/, 'activation is a promise chain');
  /* load() itself may run an async import — that is the tick the caller was not waiting for */
  assert.match(rt, /c\.p = Promise\.resolve\(\)\.then\(\(\) => \(c\.def\.load/);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R736 ①② / #R737 — a stranger with HTTP 200 is not the place that was asked for
   (formerly tests/r736-atlas-multiprobe-checks.test.mjs ①② and tests/r737-geocode-noise-floor-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  R736 — THE CAMERA WENT TO A BAPTIST CHURCH IN VIRGINIA AND THE REPLY SAID
 *         「Moved to: Korean Peninsula」
 * ----------------------------------------------------------------------------
 *  Measured on the live site, 2026-09-15, signed in. Asked to turn on the night-lights layer and fly
 *  to the Korean peninsula, IntMap turned the layer on, answered `ok:true` with the destination named
 *  in plain text — and left the reader over Chesapeake Bay. `IntMapConsole.dispatch({type:'flyTo',
 *  place:'Korean Peninsula'})` reproduces it with the map standing still.
 *
 *  ⚠ THE RULE THAT STOPS THIS EXISTS IN THE SAME FILE. #R515 put a name-agreement floor on the POINT
 *  resolver (`geocode`) precisely because free-text Nominatim drops the terms it cannot match and
 *  returns a stranger with HTTP 200. `placeExtent`'s `_nomExtent` — the resolver the CAMERA uses —
 *  ranked by importance and took the top row, with only a guard for low-importance SETTLEMENT types
 *  under it. #R429 / #R488's shape again: a rule written at one function protects that function.
 *
 *  tests/fixtures/r736-nominatim.json is what the live gazetteer returned for three queries on
 *  2026-09-15. It is the evidence for both halves of the repair: OSM holds no feature called «Korean
 *  Peninsula», so all eight candidates are Korean restaurants, marts, a language school and a church,
 *  every one of them at importance 0.000 — while the two real features in the same capture score
 *  0.604 and 0.608. These tests drive the SHIPPED js/atlas-geo-resolve.js over that capture, with
 *  only `fetch` replaced, exactly as tests/r515-checks.test.mjs does.
 * ==========================================================================*/
/* ============================================================================
 *  R737 — #R736's OWN LESSON, HAPPENING TO #R736's OWN FIX
 * ----------------------------------------------------------------------------
 *  #R736 found that `flyTo('Korean Peninsula')` answered 「Moved to: Korean Peninsula」 with `ok:true`
 *  and put the reader in Newport News, Virginia, and it put the repair on `placeExtent`'s resolver.
 *  Production verification the same day, on the deployed build: THE SAME CALL, THE SAME CHURCH.
 *
 *  The POINT resolver (`geocode` → `_pickNominatim`) has the #R515 name-agreement floor and nothing
 *  under it, and free-text Nominatim hands both endpoints the same eight strangers — measured here,
 *  live, on both URLs. So #R736 fixed one of the two functions that answer this question, which is
 *  precisely the shape (#R429 / #R488, and #R736 §2 itself) that round was written about.
 *
 *  ⇒ The rule is stated ONCE, beside the measure it extends (`_rankableFor`), and both resolvers ask
 *  it. These tests drive the SHIPPED js/atlas-geo-resolve.js over the captured responses with only
 *  `fetch` replaced, the way tests/r515-checks.test.mjs does — and they drive BOTH doors, because a
 *  test that drove one of them is how this round came to exist.
 * ==========================================================================*/
const FIX = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/r736-nominatim.json'), 'utf8')).queries;

function resolver() {
  return makeAtlasGeoResolve({ lang: 'en' }, {
    GE: () => ({ camera: { getCenter: () => ({ lng: 0, lat: 0 }) } }),
    L: (en) => en,
    _lnorm: (s) => String(s || '').toLowerCase().trim(),
    _setLast: (x) => x,
    lastPlace: () => null,
    _classBonus: () => 0,
    regionBox: () => null,
  });
}

async function overFixtures(fn) {
  const urls = [];
  const realFetch = globalThis.fetch;
  NominatimGate.configure({ gapMs: 0, reset: true });
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    const q = decodeURIComponent(String(url).split('&q=')[1] || '');
    if (!(q in FIX)) throw new Error('no recorded response for ' + q);
    return { ok: true, status: 200, text: async () => JSON.stringify(FIX[q]) };
  };
  try { await fn(); } finally { globalThis.fetch = realFetch; NominatimGate.configure({ gapMs: 1100, reset: true }); }
  return urls;
}

test('R736 ①: the resolver the camera uses refuses a stranger, and still finds what is really there', async () => {
  const R = resolver();
  const urls = await overFixtures(async () => {
    /* the reported failure: nothing in this answer is the place that was asked for */
    const kp = await R.placeExtent('Korean Peninsula');
    assert.equal(kp, null, `Korean Peninsula resolved to ${kp && kp.name} — OSM holds no such feature, so the answer is nothing`);
    /* …and the honest answers are untouched, including one whose name is not in the query's script */
    const cb = await R.placeExtent('Chesapeake Bay');
    assert.equal(cb && cb.name, 'Chesapeake Bay');
    const mf = await R.placeExtent('Mount Fuji');
    assert.equal(mf && mf.name, 'Mount Fuji');
    assert.ok(Math.abs(mf.lat - 35.36) < 0.2 && Math.abs(mf.lng - 138.73) < 0.2, 'Mount Fuji is where it has always been');
  });
  /* the request itself has to carry the evidence the measure reads: one candidate cannot be compared
     with anything, and the name variants are what let an English query agree with a local name. */
  assert.equal(urls.length, 3, 'every query went out exactly once');
  for (const u of urls) {
    assert.ok(!/[?&]limit=1(&|$)/.test(u), `still asking for a single hit: ${u}`);
    assert.match(u, /[?&]namedetails=1(&|$)/, `no name variants to agree with: ${u}`);
  }
});

test('R736 ②: the defect is not caught by the bigram floor alone — the capture says why', async () => {
  /* Stated as a fact about the DATA, so that a future round that tries to solve this with the
     similarity threshold alone can see, from the fixture, that it cannot: the church shares almost
     every bigram of the query. What separates them is that the gazetteer itself ranks it at nothing. */
  const strangers = FIX['Korean Peninsula'];
  assert.ok(strangers.length >= 8, 'the capture holds the whole candidate list');
  for (const o of strangers) {
    assert.ok((+o.importance || 0) < 0.05, `${o.name} scored ${o.importance} — above the noise floor the guard uses`);
    assert.ok(!/^korean peninsula$/i.test(String(o.name || '')), `${o.name} IS the query — the exemption would apply`);
  }
  for (const q of ['Chesapeake Bay', 'Mount Fuji']) {
    assert.ok((+FIX[q][0].importance || 0) >= 0.5, `${q} is ranked far above the floor (${FIX[q][0].importance})`);
  }
});
test('R737 ①: BOTH doors refuse the stranger — the point resolver is the one that shipped broken', async () => {
  const R = resolver();
  await overFixtures(async () => {
    const point = await R.geocode('Korean Peninsula');
    assert.equal(point, null, `geocode resolved to ${point && point.name} — this is the door flyTo actually used in production`);
    const extent = await R.placeExtent('Korean Peninsula');
    assert.equal(extent, null, `placeExtent resolved to ${extent && extent.name}`);
  });
});

test('R737 ②: the honest answers are untouched — including a POI whose own name IS the query', async () => {
  const R = resolver();
  await overFixtures(async () => {
    /* real features, far above the floor, through both doors */
    assert.equal((await R.geocode('Chesapeake Bay')).name, 'Chesapeake Bay');
    assert.equal((await R.placeExtent('Mount Fuji')).name, 'Mount Fuji');
  });
  /* …and the exemption is CONTAINMENT, which is what keeps a low-importance POI answerable. Stated as
     a fact about the rule rather than about one place: the fixture holds no such row, and inventing
     one would be testing the fixture. */
  const SRC = readFileSync(join(ROOT, 'js/atlas-geo-resolve.js'), 'utf8').replace(/\r\n/g, '\n');
  const fn = (SRC.match(/function _rankableFor\(core,o\)\{[\s\S]*?return ag; \}/) || [])[0] || '';
  assert.ok(fn, 'the shared rule is gone');
  assert.match(fn, /ag<1/, 'the exemption is not containment — a low-importance POI named exactly as asked would be refused');
});

test('R737 ③: the rule is asked by both resolvers and written once', () => {
  /* a spelling on purpose: «written once, read by exactly two» is a claim about the source, not about any one answer */
  const SRC = readFileSync(join(ROOT, 'js/atlas-geo-resolve.js'), 'utf8').replace(/\r\n/g, '\n');
  const bare = codeOnly(SRC);
  /* one definition … */
  assert.equal((bare.match(/function _rankableFor\(/g) || []).length, 1);
  /* … and exactly two readers: the point picker and the extent filter. A third would be a copy, and a
     first would be the state this round found. */
  assert.equal((bare.match(/_rankableFor\(/g) || []).length, 3, 'the shared rule has a reader it should not have, or has lost one');
  /* the floor it adds is a NUMBER WITH A NAME, so the measurement can be re-run against the fixture */
  assert.match(bare, /const IMPORTANCE_FLOOR=/);
});
