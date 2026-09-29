/* ============================================================================
 *  The ocean-current layer
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r216-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

/* ══════════ from tests/r216-checks.test.mjs — 3 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/ocean-currents.js は描画エンジンに閉じたファクトリで node では組み立てられない（同梱データは読み込んで値を検査している） */
/* (#R216) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
/* ⚠ a comment that DESCRIBES a defect is not the defect. Two checks below assert that a string does
   NOT appear in a file, and both files explain in prose why it must not — so they are read with the
   block comments taken out, or the note about the bug would trip the test for the bug. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ── ⑪ ocean currents: measured, never a shipped table ──────────────────────────────── */
/* ⚠ (#R218) THIS LAYER WAS REPLACED, ON PURPOSE, AND THESE TESTS WERE UPDATED WITH IT.
   「海流レイヤー、思ってたのと違う。ちゃんとレイヤーとして地図上に描画してください。作り直せ。」 — #R216's
   24 single arrows became a STREAMLINE field (js/ocean-currents.js + js/streamline.js), so the two
   assertions below that quoted #R216's own lines (`const dT=(a.sst!=null…)` and the point-symbol
   arrow layer) no longer describe anything. What they were PROTECTING is unchanged and is still
   checked here: the values are the model's, warm/cold is a measurement against the water upstream, a
   difference inside the model's noise is grey, and no current is named or drawn by this file.
   The new form of the same guarantees is re-checked in tests/r218-checks ⑦; this is the older
   statement of them, kept live rather than deleted. */
test('#R216 ⑪ the ocean-current layer draws the bundled, measured dataset (#R219)', () => {
  /* ══ ⚠ (#R219) INTENDED REPLACEMENT — THE LAYER IS NOW A BUNDLED DATASET ═══════════════════════
     「海流レイヤー、思ってたのと違う。ちゃんと**もとからデータが固定された**レイヤーとして地図上に
      描画してください。作り直せ。」（確認済：「同梱の固定データで常時描画」）
     #R216/#R218's invariant — «this file ships no current of its own, every number is fetched live»
     — was the right answer to the question those rounds were asked, and it is the OPPOSITE of the
     one this round was asked. The provenance rule is unchanged and is what these assertions now
     check ONE LEVEL OUT: the paths are still traced through a measured velocity field (NASA/JPL
     OSCAR), warm/cold is still derived rather than asserted, and nothing is a drawing — the tracing
     simply happens in scripts/build-ocean-currents.mjs instead of in the browser, and the answer
     ships as data/ocean-currents.json. See tests/r219-checks ④ and DEV-NOTES #R219 §3. */
  const s = read('js/ocean-currents.js');
  assert.match(s, /data\/ocean-currents\.json/, 'the layer must read the bundled dataset');
  assert.equal(/marine-api\.open-meteo/.test(s), false, 'a fixed dataset does not fetch a field per viewport');
  assert.equal(/wd:Q129558/.test(s), false, 'the names ship with the data now, in five languages');
  /* the provenance moved to the build script and to the file; both must still carry it */
  const b = read('scripts/build-ocean-currents.mjs');
  assert.match(b, /jplOscar/, 'the paths must still be traced through the measured OSCAR field');
  assert.match(b, /poleward/i, 'warm/cold must still be DERIVED from the flow, not asserted');
  const doc = JSON.parse(read('data/ocean-currents.json'));
  /* (#R221) the dataset was rebuilt: the velocity is NOAA CoastWatch blended altimetry (geostrophic)
     plus a Ralph & Niiler Ekman term, and the classification is NOAA OISST v2.1. The claim this
     assertion stands for — the file NAMES where its numbers came from — is unchanged. */
  assert.match(String(doc.source || ''), /NOAA/, 'the dataset must name its source');
  assert.ok(doc.named.length >= 20 && doc.named.every((c) => Array.isArray(c.path) && c.path.length >= 5),
    'every named current carries a traced path');
  /* the image is still registered on the object that has addImage (#R216 ③).
     ⚠ against the COMMENT-STRIPPED source: the file explains the trap in prose, and a scan of the
     prose is not a scan of the program. */
  const c = code('js/ocean-currents.js');
  assert.equal(/layers\.addImage/.test(c), false, 'addImage is on scene, not layers');
  /* (#R220) two glyphs now — the head that repeats along a named current and the dart of the field —
     registered through one helper, so the contract to check is the OBJECT and the names. */
  assert.match(c, /GE\(\)\.scene\.addImage\(name,/, 'the registration is on scene');
  assert.match(c, /_mkIcon\('oc-arrow-img',/); assert.match(c, /_mkIcon\('oc-dart-img',/);
});
test('#R216 ⑪ …and its arrow image is registered on the object that actually has addImage', () => {
  const s = code('js/ocean-currents.js');
  /* ⚠ THE SAME CLASS AS ③: a plausible member name on the wrong object. `GE().layers.addImage` is
     undefined — images live on `scene`, beside the sky and the terrain (js/geo-engine.js) — and the
     TypeError was swallowed by ensureIcon's own catch, leaving a symbol layer whose `icon-image`
     named an image nobody had registered. MEASURED: layer `visible`, 37 features,
     `queryRenderedFeatures` = 0, and only the speed labels on the map. */
  assert.equal(/layers\.addImage/.test(s), false, 'addImage is on scene, not layers');
  assert.match(s, /GE\(\)\.scene\.addImage\(name,/, 'the arrow image is never registered');
  /* ⚠ …and getImageData is NOT transformed: reading at (−S/2, −S/2) after a translate returns a
     fully transparent block, which registers happily and then draws nothing at all. */
  assert.match(s, /getImageData\(0,0,S,S\)/, 'the icon is read from outside the canvas again');
  assert.match(s, /return GE\(\)\.scene\.hasImage\(name\);/, 'a failed registration is not detected');
});
test('#R216 ⑪ …and both of its sources are in the registry', () => {
  const r = read('js/reference-data.js');
  assert.match(r, /Open-Meteo Marine/, 'the marine model is not registered');
  /* (#R246) what each source is USED FOR is `sourceUse` in js/locales/pages.<code>.js now — the
     registry carries the name and the URL, and the English original lives with the translations. */
  const en = read('js/locales/pages.en.js');
  assert.match(en, /ocean-current velocity and direction/, 'what it is used for is not stated');
  assert.match(en, /ocean currents with their published coordinates/, 'the Wikidata use is not stated');
});
}
