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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasGeoResolve } = await import('../js/atlas-geo-resolve.js');
const { NominatimGate } = await import('../js/nominatim-gate.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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
const PROXY = readFileSync(join(ROOT, 'supabase/functions/ai-proxy/index.ts'), 'utf8').replace(/\r\n/g, '\n');
const AICORE = readFileSync(join(ROOT, 'js/ai-core.js'), 'utf8').replace(/\r\n/g, '\n');

test('R736 ③: the model every account gets — the developer account included — is Terra', () => {
  const dflt = (PROXY.match(/const OPENAI_DEFAULT_MODEL = "([^"]+)"/) || [])[1];
  assert.equal(dflt, 'gpt-5.6-terra');
  /* the ladder under it may not start at the model it is the ladder FOR */
  const chain = ((PROXY.match(/const FALLBACK_CHAIN = \[([^\]]*)\]/) || [])[1] || '')
    .split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
  assert.ok(chain.length >= 1, 'there is still a ladder');
  assert.ok(!chain.includes(dflt), `the fallback chain starts with the model it exists to replace (${dflt})`);
  /* the developer's own default is the SAME value, offered by name rather than as an empty state */
  assert.match(PROXY, /serverDefault: \{ provider: envProv, model: Deno\.env\.get\("AI_MODEL"\) \|\| PROVIDER_DEFAULT_MODEL\[envProv\] \|\| "" \}/);
  assert.match(AICORE, /L\('Server default','サーバー既定'\)\+\(def\.model\?' — '\+def\.model:''\)/);
});

test('R736 ④: a withdrawn model is not OFFERED, is not BLOCKED, and is named exactly once', () => {
  /* declared once, beside the other model constants */
  const decl = PROXY.match(/const WITHDRAWN_MODELS = new Set\(\[([^\]]*)\]\);/);
  assert.ok(decl, 'no withdrawal set');
  const withdrawn = decl[1].split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
  assert.deepEqual(withdrawn, ['gpt-6-astra']);
  /* ⚠ MEASURED ON THE CODE, NOT ON THE PROSE — two comments narrate the 2026-09-15 measurement that
     found this id answering 200, and a check that counted those would fail the sentence explaining it
     (#R621: strip the comments before measuring). */
  const bare = PROXY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal((bare.match(/gpt-6-astra/g) || []).length, 1, 'the withdrawn id is spelled more than once in the code');

  /* applied where the picker's options are built … */
  assert.match(PROXY, /const keep = \(id: string\) => MODEL_ID_OK\.test\(id\) && !WITHDRAWN_MODELS\.has\(id\);/);

  /* … and NOWHERE ELSE. A withdrawal that also refused the call would be a capability boundary, which
     is the thing CONSTITUTION.md §0.3 forbids: the proxy still calls whatever id it is handed. */
  const uses = (bare.match(/WITHDRAWN_MODELS/g) || []).length;
  assert.equal(uses, 2, `WITHDRAWN_MODELS is read ${uses - 1} time(s) — it may only filter what is OFFERED`);

  /* and the client lets go of a pick the catalogue stopped offering, so an account that had already
     chosen one is not left sending it invisibly for ever. Held only when the provider ANSWERED. */
  assert.match(AICORE, /row0\.available/);
  assert.match(AICORE, /row0\.models\.indexOf\(pk\.model\)<0\) aiSetModelPick\(pk\.provider,''\)/);
});
