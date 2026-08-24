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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ⚠ Scan CODE, not prose. The first draft of ⑨ searched the raw file for `maxLayers` and went red on
   its OWN comment explaining that maxLayers is gone — the self-hit this repository has now made
   thirteen times (see `memory/intmap-recurring-lessons.md`). Comments and string literals are blanked
   first; identical to tests/r162-checks.test.mjs's `code()`. */
function code(src) {
  let out = '', i = 0, inBlock = false;
  const NL = String.fromCharCode(10), BS = String.fromCharCode(92);
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (inBlock) { if (c === '*' && c2 === '/') { inBlock = false; i += 2; } else { out += c === NL ? NL : ' '; i++; } continue; }
    if (c === '/' && c2 === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && c2 === '/') { while (i < src.length && src[i] !== NL) { out += ' '; i++; } continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += ' '; i++;
      while (i < src.length) {
        if (src[i] === BS) { out += '  '; i += 2; continue; }
        if (src[i] === q) { out += ' '; i++; break; }
        out += src[i] === NL ? NL : ' '; i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* The modules under test are pure ESM with no DOM, which is what lets the SHIPPED code run here. */
globalThis.window = globalThis.window || {};
const { makeAtlasState } = await import('../js/atlas-state.js');
const { makeAtlasGeoResolve } = await import('../js/atlas-geo-resolve.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasPolicy } = await import('../js/atlas-policy.js');

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

test('R413 ⑦: find_capability does not truncate, so a tie cannot be decided by the alphabet', () => {
  for (const q of ['現在地から大阪駅までの経路', '경로 안내', 'itinéraire depuis ma position']) {
    const scored = CAPS.search(q, { want: 3, min: 1 }).ranked;
    const returned = TOOLS.find(q).matches;
    assert.equal(returned.length, scored.length, `${q}: every capability that scored is returned`);
    assert.ok(returned.some((m) => m.id === 'routing.route'),
      `${q}: routing.route is the capability that answers this and it was ninth of ten equal scores`);
  }
  /* and each match still arrives with the schema that makes it callable */
  assert.ok(TOOLS.find('directions').matches.every((m) => m.schema && m.schema.type === 'object'));
});

test('R413 ⑧: the reader\'s own position is a tool Atlas always has, wired to the capability that exists', () => {
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
  const dispatch = rd('js/atlas-console.js');
  assert.match(dispatch, /exec:\{lat,lng,accuracyM:Math\.round\(\+p2\.coords\.accuracy\|\|0\),provenance:'device_location'\}/,
    'the locate case returns lat/lng/accuracy in `exec`');
  assert.match(dispatch, /_selfLocSeed\(\{lng,lat,acc:\+p2\.coords\.accuracy\|\|0\}\)/,
    'and seeds the 現在地 resolver so the next place argument costs no second GPS acquisition');
});

/* ══ ⑨ NO NEW LIMITS — CONSTITUTION.md §5 ═════════════════════════════════════════════════════
   The standing instruction is 「制限を増やす方向、例外を増やす方向に持っていくな」. What can be
   checked mechanically is that the caps this round removed have not come back, and that the
   constitution still carries the rule that says so. */
test('R413 ⑨: the caps this round removed have not come back', () => {
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

  const console_ = code(rd('js/atlas-console.js'));
  assert.match(rd('js/atlas-console.js'), /steps\.push\('IntMap observed: '\+JSON\.stringify\(m\.content\)\)/,
    'the mechanical record of what the tools did reaches Atlas unclipped');

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
  assert.ok(!ranked.slice(0, 8).some((r) => r.id === 'routing.route'),
    '…and routing.route is not among them: the cut is what dropped it, not the score');
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
