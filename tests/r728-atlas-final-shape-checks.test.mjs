/* ============================================================================
 *  #R728 — the second production verification of #R726/#R727, and its three findings
 * ----------------------------------------------------------------------------
 *  ① find_capability returned SIXTY ids and 42 kB of documentation for the ISS request once the
 *     catalogue counted (#R727): half a point per common term summed to «score > 0» for nearly every
 *     capability, and the next model call took 94 s. A term carried by more than four blocks is no
 *     match at all.
 *  ② the reader's last bubble read «{"turn":"continuing","tool_calls":[…» — a forced final reply
 *     that came back as unparsable JSON was handed over as prose. Machine-shaped text is refused.
 *  ③ asked when the ISS next passes over Tokyo, Atlas re-called the satellite tool with invented
 *     modes («track», «track_and_passes») looking for a pass table: the result held ONE pass, a 5°
 *     graze. The result now lists up to three passes within 48 h, and the catalogue says there is
 *     no mode to look for.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { satelliteFacts } = await import('../js/atlas-result-facts.js');

test('R728 ① a search returns only the capabilities a distinctive term reaches, not the whole registry', () => {
  const CAPS = makeAtlasCapabilities({});
  CAPS.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });
  const total = CAPS.all().filter((c) => !c.withdrawn).length;
  for (const q of ['ISS（NORAD 25544）のリアルタイム位置と、指定地点からの次回可視通過予測（見え始め・最大仰角・見え終わり、方位、仰角、明るさ、JST）', 'where is the ISS now', 'ISSは今どこ？次に東京の上空を通るのはいつ？']) {
    const r = CAPS.search(q, { want: 3, min: 1 }).ranked;
    assert.equal(r[0].id, 'layers.satellites', q);
    assert.ok(r.length <= 12, q + ' → ' + r.length + ' rows of ' + total + ' (was 60)');
  }
  assert.match(codeOnly(readLF(join(ROOT, 'js/atlas-capabilities.js'))), /DOC_TERM_MAX_DF = 4/);
});

test('R728 ② machine-shaped text is not prose — a JSON turn that failed to parse is refused as the answer', () => {
  const A = makeAtlasAgent({});
  const raw = '{"turn":"continuing","tool_calls":[{"name":"run_capability","arguments_json":"{\\"id\\":\\"layers.satellites\\"}"}]} , {"name":"research"';
  assert.equal(A.readReply(null, raw).text, '', 'the raw JSON is not handed to the reader');
  assert.equal(A.readReply(null, '東京は晴れです。').text, '東京は晴れです。', 'prose still passes');
  assert.equal(A.readReply(null, '{"note": "a JSON the model quoted in prose"} — is not the turn schema').text.length > 0, true, 'only the turn schema\'s own keys are refused');
  assert.equal(A.readReply({ final_text: 'ok' }, raw).text, 'ok', 'a parsed reply is read from its fields as before');
});

test('R728 ③ the satellite result lists the next passes within 48 h, not only the first graze', () => {
  const L = (en) => en;
  /* a fake live layer: three passes an orbit apart, the first a 5° graze, then 62°, then 20° */
  const t0 = Date.now(), M = 60000;
  const passes = [
    { none: false, inProgress: false, riseMs: t0 + 10 * M, maxMs: t0 + 13 * M, setMs: t0 + 17 * M, maxEl: 5, durationS: 420 },
    { none: false, inProgress: false, riseMs: t0 + 100 * M, maxMs: t0 + 105 * M, setMs: t0 + 110 * M, maxEl: 62, durationS: 600 },
    { none: false, inProgress: false, riseMs: t0 + 190 * M, maxMs: t0 + 194 * M, setMs: t0 + 198 * M, maxEl: 20, durationS: 480 },
  ];
  let calls = 0;
  const A = { lookFrom: () => ({ elDeg: -30 }), observer: (o) => o, nextPass: (id, from) => { const t = from.getTime(); return passes.find((p) => p.riseMs >= t) || { none: true }; } };
  const found = { id: 25544, lat: 35.1, lng: 139.2, altKm: 423, velKmS: 7.66, periodMin: 93, sunlit: true };
  const txt = satelliteFacts(A, found, { lng: 139.7, lat: 35.7 }, 'Tokyo', L);
  assert.match(txt, /max elevation 5°/, 'the first pass');
  assert.match(txt, /later pass .*max elevation 62°/, 'the second');
  assert.match(txt, /max elevation 20°/, 'the third');
  assert.match(txt, /passes within 48 h: 3\+/);
  assert.match(txt, /a low pass, unlikely to be visible/, 'the graze is still marked');
  const doc = readLF(join(ROOT, 'js/atlas-catalog-text.js'));
  assert.match(doc, /there is no track\/pass mode/, 'and Atlas is told not to look for one');
});
