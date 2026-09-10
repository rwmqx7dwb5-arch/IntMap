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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
/* ⚠ the registry reads the language DIRECTORY from a global (js/locales/_langs.js) or from the
   real module graph; without it `pick()` has no index for fr / ko and returns argument 0 —
   which is exactly the English fallback this test exists to catch, so it must be loaded. */
await import('../js/locales/_langs.js');
await import('../js/lang-registry.js');
/* the tables `pick()` answers fr / ko / zh out of — they register themselves on import */
for (const f of ['ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) await import('../js/locales/ui.' + (f === 'ja' ? 'jp' : f) + '.js');
const LANG = globalThis.window.IntMapLang;
const { makeAtlasGeoResolve } = await import('../js/atlas-geo-resolve.js');

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
  const con = R('js/atlas-console.js');
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
  assert.ok(con.split(String.fromCharCode(10)).length < 4_910, 'js/atlas-console.js stayed under its ceiling');
});

/* ══ ④ THE ACTIVATION RACE: THE RUNTIME'S PROMISE IS HANDED BACK, AND THE CALLER WAITS ════════ */
test('R667 ④: open() returns what the runtime returns, and a promise is still truthy', () => {
  const tsu = R('js/tsunami.js');
  const fn = tsu.slice(tsu.indexOf('function openPublic('), tsu.indexOf('\n    }', tsu.indexOf('function openPublic(')));
  assert.match(fn, /return RT\.activate\('sim\.tsunami'/, 'the promise is returned, not discarded');
  assert.ok(!/;\s*return true;/.test(fn), 'no synchronous true stands in front of an async activation');
  /* the caller that drives the panel immediately afterwards now waits for it */
  const con = R('js/atlas-console.js');
  assert.match(con, /try\{ await T\.open\(\{ lng:ll\.lng/, 'the tsunami case awaits activation before driving the module');
  /* ⚠ and the reason a promise is safe here: every existing caller reads the result as truthy */
  assert.ok(!!Promise.resolve(true), 'a promise is truthy');
  assert.ok(!/\.open\([^)]*\)\s*===\s*true/.test(con), 'nothing compares the result to `true`');
});

/* ══ ⑤ THE RUNTIME REALLY IS ASYNC — the fact the whole round rests on ═══════════════════════ */
test('R667 ⑤: IntMapRuntime.activate() resolves later, so a synchronous return could not have carried it', () => {
  const rt = R('js/runtime.js');
  const fn = rt.slice(rt.indexOf('function activate(name, arg)'), rt.indexOf('\n    function suspend'));
  assert.match(fn, /return load\(name\)\.then\(/, 'activation is a promise chain');
  /* load() itself may run an async import — that is the tick the caller was not waiting for */
  assert.match(rt, /c\.p = Promise\.resolve\(\)\.then\(\(\) => \(c\.def\.load/);
});
