/* R802 — what 46 questions put to the production Atlas measured, written as the defects themselves.
 *
 * Every assertion below names a thing a reader SAW on https://rwmqx7dwb5-arch.github.io/IntMap/
 * (build 2026-09-18-R783, signed in) and not the shape of the repair, because a check written as the
 * repair defends the repair and stops defending the reader — [[intmap-restate-the-defect-not-the-fix]].
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONSOLE_SRC = codeOnly(readLF(join(ROOT, 'js/atlas-console.js')));
const AGENT_SRC = codeOnly(readLF(join(ROOT, 'js/atlas-agent.js')));

const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const CAPS = makeAtlasCapabilities({});
CAPS.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });
const top = (q) => CAPS.search(q, { want: 3, min: 1 }).ranked.map((r) => r.id);

/* ══ ① THE MEASURED SILENCE: A JAPANESE REQUEST REACHED NOTHING THE ENGLISH ONE REACHED ═══════════
   「東京から大阪までの鉄道ルートを引いて、所要時間と距離を教えて。」 — eight find_capability calls,
   ZERO operations, stopped at the step budget in 45 s, and the reader was told the turn had hit its
   working limit. 「世界の原子力発電所を地図に表示して、日本のものだけ強調して。」 — the same, 57 s.
   「東京の今日の天気と、今後3日間の予報を教えて。」 — data.weather never called; the reader was told the
   numbers could not be obtained, with the temperature layer painted on the map behind that sentence.
   IntMap authors in English AND Japanese (CONSTITUTION.md §7): a door only English opens is shut. */
test('R802 ① a request in Japanese reaches the same capability the English one reaches', () => {
  for (const [ja, en, id] of [
    ['東京から大阪までの鉄道ルート', 'plan a rail route from Tokyo to Osaka', 'routing.route'],
    ['天気予報', 'weather forecast', 'data.weather'],
    ['東京の今日の天気と3日間の予報', 'weather forecast for Tokyo today and the next three days', 'data.weather'],
  ]) {
    assert.ok(top(en).includes(id), 'the English request reaches ' + id + ' — ' + top(en).join(', '));
    assert.ok(top(ja).includes(id), 'the Japanese request reaches ' + id + ' — ' + ja + ' → ' + (top(ja).join(', ') || '(nothing)'));
  }
});

/* ══ ② AND WHAT IT REACHED INSTEAD WAS THE REGISTRY, IN ORDER ═════════════════════════════════════
   Measured with the tool surface instrumented: 「世界の原子力発電所を表示し、日本の原子力発電所だけを
   強調する」 answered layers.aircraftTrack, layers.allOff, layers.baseDisplay, layers.countryInfo,
   layers.isobars, layers.nightSide, layers.opacity, layers.planeAltitude — the first eight «layers.*»
   ids in alphabetical order — and «nuclear power plants …» answered the first eight «map.*».
   That is worse than answering nothing: Atlas believed them, rephrased, and spent the whole turn.
   A capability is a match because something in the request MATCHED IT, never because of where it sits. */
test('R802 ② a match is evidence about that capability, not its place in the registry', () => {
  const runs = {};
  for (const id of CAPS.all().map((c) => c.id)) { const p = id.split('.')[0]; (runs[p] = runs[p] || []).push(id); }
  for (const p of Object.keys(runs)) runs[p].sort();
  for (const q of [
    '世界の原子力発電所を表示し、日本の原子力発電所だけを強調する',
    '原子力発電所の世界データを地図に表示し、国別に日本だけ強調する',
    'nuclear power plants worldwide',
  ]) {
    const got = CAPS.search(q, { want: 8, min: 1 }).ranked.map((r) => r.id);
    if (got.length < 3) continue;                    /* nothing matched is an honest answer — ① covers the reaching */
    for (const p of Object.keys(runs)) {
      assert.notDeepEqual(got, runs[p].slice(0, got.length), q + ' answered with the head of «' + p + '.*» in registry order');
    }
  }
});

/* ══ ③ A THANK-YOU IS STILL NOT A SPATIAL QUERY (#R745's measurement, kept) ═══════════════════════ */
test('R802 ③ a request that names nothing IntMap has still matches nothing', () => {
  assert.deepEqual(top('ありがとう'), [], 'ありがとう → ' + top('ありがとう').join(', '));
});

/* ══ ④ THE PINS WERE JUDGED BY COUNTING THEM ══════════════════════════════════════════════════════
   research.situationMap returned «ok» and «not_rendered» ALTERNATELY for the same subject inside one
   turn, so Atlas read a success as a failure and fired again: seven times for 「日本の令制国を1750年の
   地図に描いて」 (9 m 16 s), six for 「1914年のヨーロッパの国境」 (6 m 55 s), five research.analyze calls
   for «Draw the 200 nautical mile EEZ around Iceland» (6 m 51 s). The cause is that the pin surface had
   no painter's declaration (#R742's third rung), so the verdict fell to a CARDINAL — and a redraw of
   the same pins moves no count. The surface must be one the reading holds and the painter can name. */
test('R802 ④ the markers are a surface the painter declares and the reading holds', () => {
  const era = codeOnly(readLF(join(ROOT, 'js/atlas-era-highlight.js')));
  assert.match(era, /PAINTED_IDS\s*=\s*\{[\s\S]{0,900}?\bpoi\s*:/, 'the reading holds a «poi» surface');
  assert.match(CONSOLE_SRC, /_ERA\.paintState\(\{[^}]*\bpoi\s*:\s*\(\)\s*=>\s*_pois/, 'the console supplies the markers to that reading');
  const pinned = (CONSOLE_SRC.match(/_PINNED\(/g) || []).length;
  assert.ok(pinned >= 6, 'every pinning capability declares through the one declaration (found ' + pinned + ')');
});

/* ══ ⑤ AN ABBREVIATION IS NOT A SENTENCE END ══════════════════════════════════════════════════════
   In the reader's own bubble: 「It identifies Dujuan (JMA Typhoon No.⏎⏎25 / 2625) in the western North
   Pacific」 and 「to simplify U.⏎⏎S. Antarctic Program flights」 — the reflow put a paragraph break inside
   «No. 25» and inside «U.S.». ⚠ AND THE GENUINE BOUNDARIES MUST STILL SPLIT: a repair that joins
   «…the Red Sea. The Nile…» has replaced one defect with another. */
test('R802 ⑤ the reflow keeps an abbreviation whole and still splits real sentences', () => {
  const src = codeOnly(readLF(join(ROOT, 'js/atlas-reply.js')));
  const line = src.split('\n').find((l) => l.indexOf('const _ATL_ATOM=') >= 0);
  assert.ok(line, 'the held atoms are one declaration');
  const ATOM = new Function('return ' + line.trim().replace(/^const _ATL_ATOM=/, '').replace(/;\s*$/, ''))();
  const SENT = /[^.!?。！？…]+(?:[.!?。！？…]+["”』）)]*|$)/g;
  const split = (s) => {
    const A = [];
    const held = String(s).replace(ATOM, (m) => { A.push(m); return '' + (A.length - 1) + ''; });
    return (held.match(SENT) || [held]).map((x) => (A.length ? x.replace(/(\d+)/g, (m, i) => A[+i]) : x));
  };
  assert.equal(split('It identifies Dujuan (JMA Typhoon No. 25 / 2625) in the western North Pacific.').length, 1, 'No. 25');
  assert.equal(split('a convention to simplify U.S. Antarctic Program flights and schedules.').length, 1, 'U.S.');
  assert.equal(split('St. Petersburg is in Russia. Mt. Fuji is in Japan.').length, 2, 'St. / Mt. — two sentences, not four');
  assert.equal(split('The ship crossed the Red Sea. The Nile is longer than the Amazon.').length, 2, 'a real boundary still splits');
  assert.equal(split('We flew to Italy. The Colosseum was open. It rained.').length, 3, 'three real boundaries still split');
});

/* ══ ⑥ A PLACE IntMap COULD NOT FIND WAS ANSWERED ABOUT ANYWAY ════════════════════════════════════
   data.layerValues {place:'Korean Peninsula'} and {place:'Amazon Basin'} answered
   「◈ map center — BWh · Hot desert」: a reading of wherever the reader happened to be looking, handed
   back as an answer about the place they named. */
test('R802 ⑥ a named place that did not resolve is not answered about the map centre', () => {
  const i = CONSOLE_SRC.indexOf("case 'layerData':");
  assert.ok(i > 0, 'the layer reading is one case');
  const body = CONSOLE_SRC.slice(i, i + 4000);
  const placeAt = body.indexOf('if(a.place)');
  const centreAt = body.indexOf('GE().camera.getCenter()');
  assert.ok(placeAt > 0 && centreAt > placeAt, 'the named place is resolved before the centre is used');
  assert.match(body.slice(placeAt, centreAt), /else\s+return\s+R\(false/,
    'a named place that did not resolve stops here instead of falling through to the camera centre');
});

/* ══ ⑦ THE HIGHLIGHT'S NAME OUTLIVED THE HIGHLIGHT ════════════════════════════════════════════════
   Five consecutive turns opened by clearing 「the previous Syria highlight」, each spending an operation
   on a map that held nothing, because the state kept naming a highlight clearHl() had already emptied.
   The name is forgotten where the set is emptied, so every clearing path gets it. */
test('R802 ⑦ emptying the highlight forgets what it was called', () => {
  const fn = liftFunction(CONSOLE_SRC, 'clearHl');
  assert.match(fn, /_hl\s*=\s*new Set\(\)/, 'clearHl empties the set');
  assert.match(fn, /_wctx\.highlight\s*=\s*null/, 'and forgets the name the state reports from');
});

/* ══ ⑧ A CUT TURN SAID 「working limit」 AND NEVER SAID THE ANSWER ══════════════════════════════════
   23 of the 46 measured turns ended with 「このターンは作業の上限に達したため…」. In several the work had
   SUCCEEDED and only the sentence was missing: «Show the top 10 countries by GDP per capita … and tell
   me which of them are NOT in the top 10 by total GDP» drew both tables and the choropleth, and all the
   prose the reader received was «I'm comparing the two rankings now.» The closing call existed but was
   reachable only when NOTHING had been said, and a first-step narration is something. */
test('R802 ⑧ a turn that ran out still gets the step that writes the answer', () => {
  const cutLine = AGENT_SRC.split('\n').find((l) => /CUT_STOPS\s*=/.test(l));
  assert.ok(cutLine, 'the stops that cut a turn short are named in one place');
  const CUT = new Function('return ' + cutLine.replace(/^[^=]*=/, '').replace(/;\s*$/, ''))();
  for (const s of ['step_budget', 'call_budget', 'time_budget', 'repeated_calls', 'malformed_limit']) {
    assert.equal(CUT[s], 1, s + ' is a turn that was cut short');
  }
  assert.equal(CUT.answered, undefined, 'a turn that answered was not cut short');
  assert.equal(CUT.awaiting_user, undefined, 'a turn that ended by asking the reader was not cut short');
  const i = AGENT_SRC.indexOf('cutShort');
  assert.ok(i > 0 && /if\s*\(cutShort\)\s*writeAnswer\s*=\s*true/.test(AGENT_SRC.slice(i, i + 800)),
    'being cut short is itself a reason to write the answer');
});
