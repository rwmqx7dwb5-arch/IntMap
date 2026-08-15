/* ============================================================================
 *  IntMap · #R249 source checks
 * ----------------------------------------------------------------------------
 *  ① the seismic seam has ONE cell — the far raster copies the fine field's, so the ratio the
 *     reader sees at 1,500 km is 1.00 by construction rather than by tuning;
 *  ② the fifteenth translation surface — a reader-facing document's own <title> and
 *     <meta description> — is localised and GATED, with the instrument shown to fire;
 *  ③ every .html a reader can open is either measured by that instrument or excluded WITH A REASON,
 *     enumerated from disk so a new page cannot be forgotten;
 *  ④ the proper-noun exemption cannot be used to silence UI prose, and its count is printed;
 *  ⑤ the OPEN GAP ratchet — the twelfth shape may only ever go down.
 *
 *  ⚠ Every assertion that matches on TEXT reads the source with COMMENTS STRIPPED —
 *  [[intmap-recurring-lessons]] E has caught nine rounds writing a check that trips on its own
 *  explanation of the defect, #R248 being the most recent.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const json = (f, ...a) => JSON.parse(execFileSync(process.execPath,
  [join(ROOT, 'scripts', f), '--json', ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

/* ── ① ONE PICTURE, ONE CELL ────────────────────────────────────────────────────────────────── */
test('#R249 ① the far seismic raster is handed the fine field\'s cell, and the ceiling is a cell count', () => {
  const s = code(read('js/seismic.js'));

  /* the fine grid must be SOLVED BEFORE the far window, or the far window cannot copy it */
  const iGrid = s.indexOf('const CELL_KM=1.0, N_MIN=');
  const iFar = s.indexOf('farWindow(C0,rEdgeSurf+rupMaxKm');
  assert.ok(iGrid > 0, 'the fine grid rule is still declared in one place');
  assert.ok(iFar > 0, 'buildField still builds the far window');
  assert.ok(iGrid < iFar,
    'the fine grid must be solved BEFORE farWindow — otherwise the far raster cannot be handed the cell it has to match');

  /* …and it is actually handed it, rather than the two being tuned to look alike */
  assert.match(s, /farWindow\(C0,\s*rEdgeSurf\+rupMaxKm\s*,\s*spanKm0\/N\)/,
    'buildField no longer passes the fine cell to farWindow — the seam step goes back to being a coincidence');
  assert.match(s, /function farWindow\(C0,\s*rKm,\s*wantCellKm\)/, 'farWindow no longer accepts a target cell');

  /* the target is honoured, never coarser than #R248's budget, and bounded by a CELL COUNT
     (the transient RGBA canvas) rather than by a taste */
  assert.match(s, /Math\.min\(Math\.sqrt\(sx\*sy\)\/NF,\s*cellWant\)/,
    'the far cell is no longer min(budget, wanted) — it must never be coarser than #R248 already achieved');
  assert.match(s, /FAR_MAX_CELLS\s*=\s*\(\)\s*=>/, 'the ceiling is not declared as a cell count');
  assert.match(s, /if\(sx\*sy\/\(cell\*cell\)>maxCells\)/, 'the ceiling is not applied');

  /* the achieved ratio is REPORTED — a ceiling that is silently exceeded is how this report
     ([[intmap-recurring-lessons]] F) comes back a fourth time */
  assert.match(s, /step:\(wantCellKm>0\)\?\+\(cellKm\/wantCellKm\)\.toFixed\(2\):null/,
    'farWindow no longer reports the ratio it actually achieved');
  assert.match(s, /farStep:farWin\.step/, 'the field stats no longer carry the seam ratio');
  assert.match(s, /fineCellKm:fldFar\.fineCellKm,\s*step:fldFar\.step/,
    'state().far no longer carries the seam ratio');

  /* #R245's tiling depends on the fine box being snapped to the far grid — that must still be true */
  assert.match(s, /snapLngFar=\(v,out\)=>/, 'the fine box is no longer snapped onto the far grid (#R245)');
  assert.match(s, /'raster-resampling':'nearest'/, 'the far layer stopped drawing each cell as the value it is (#R245)');
});

/* ── ② THE FIFTEENTH SURFACE ────────────────────────────────────────────────────────────────── */
test('#R249 ② a reader-facing document localises its own <title> and <meta description>', () => {
  /* ⚠ THE WIRING LIVES IN THE REGISTRY, NOT IN THE SHELL. js/lang-registry.js already owns `lang`
     and the keyed table, and js/app-body.js has a ceiling that only ever comes down
     ([[intmap-recurring-lessons]] K) — the first version of this round put it in the shell and
     pushed that file from 4,386 to 4,401 against a 4,400 budget, which is exactly the pressure the
     ceiling exists to apply. */
  const reg = code(read('js/lang-registry.js'));
  assert.match(reg, /function syncDocument\(code\)/, 'the registry no longer owns the document surface');
  assert.match(reg, /document\.title\s*=\s*d\.docTitle/, 'index.html no longer localises its <title>');
  assert.match(reg, /meta\[name="description"\]/, 'index.html no longer localises its description');
  /* …and it is reached on BOTH paths: a saved language at boot, and a switch at run time */
  assert.match(reg, /syncDocument\(null\)/, 'syncChrome no longer syncs the document at boot');
  assert.match(code(read('js/app-body.js')), /IntMapLang\.syncDocument\(currentLang\)/,
    'a language SWITCH no longer updates the document');
  /* the shell must not have grown to hold it */
  assert.ok(read('js/app-body.js').split('\n').length < 4_400, 'js/app-body.js grew past its ceiling');

  /* every language declares the keys — this is what makes it a keyed surface rather than a literal */
  for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
    const src = read(`js/locales/ui.${c}.js`);
    assert.match(src, /\bdocTitle\s*:/, `ui.${c}.js does not declare docTitle`);
    assert.match(src, /\bdocDesc\s*:/, `ui.${c}.js does not declare docDesc`);
  }
  /* ⚠ AND THEY MUST NOT ALL BE THE ENGLISH STRING. #R239's lesson: a coverage instrument that counts
     «is there a string at this path» calls an English copy 100 %. */
  const en = /docTitle:"([^"]+)"/.exec(read('js/locales/ui.en.js'))[1];
  for (const c of ['jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
    const m = /docTitle:"([^"]+)"/.exec(read(`js/locales/ui.${c}.js`));
    assert.ok(m && m[1] !== en, `ui.${c}.js's docTitle is still the English string`);
  }

  /* the instrument is in the ONE gate rather than being a sixteenth free-standing percentage */
  const g = code(read('scripts/i18n-audit.mjs'));
  assert.match(g, /i18n-doc-audit\.mjs/, 'the one gate does not spawn the document instrument');
  assert.match(g, /unlocalised <title>/, 'the gate does not print the document surface');

  const j = json('i18n-doc-audit.mjs');
  assert.equal(j.bad.length, 0, `document(s) with unlocalised metadata: ${j.bad.join(', ')}`);
});

/* ── ③ NO READER-FACING DOCUMENT IS SIMPLY ABSENT FROM THE INSTRUMENT ───────────────────────── */
test('#R249 ③ every .html on disk is measured or excluded with a stated reason', () => {
  const onDisk = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  const j = json('i18n-doc-audit.mjs');
  const measured = new Set(j.rows.map((r) => r.file));
  const excluded = new Set(Object.keys(j.excluded));
  for (const f of onDisk) {
    assert.ok(measured.has(f) || excluded.has(f),
      `${f} is neither measured by scripts/i18n-doc-audit.mjs nor excluded there with a reason — `
      + 'a new reader-facing page must be added to DOCS, or to EXCLUDED with why');
  }
  /* the exclusions must carry a REASON, not just a name */
  for (const [f, why] of Object.entries(j.excluded)) {
    assert.ok(typeof why === 'string' && why.length > 20, `${f} is excluded without a stated reason`);
  }
});

/* ── ④ THE PROPER-NOUN EXEMPTION IS NOT AN ESCAPE HATCH ─────────────────────────────────────── */
test('#R249 ④ @i18n-entity-data is validated, gated, and its count is printed', () => {
  const a = read('scripts/i18n-pair-audit.mjs');
  /* the marker is honoured only where the row carries a non-linguistic key to the entity */
  assert.match(a, /function hasEntityKey\(node\)/, 'the marker is no longer validated');
  assert.match(a, /badMarkers\.push/, 'a misapplied marker is no longer reported');

  /* …and a misapplied marker STOPS THE BUILD — this is the one way the whole family of
     instruments could be defeated (declare your prose to be proper nouns and go green) */
  const g = code(read('scripts/i18n-audit.mjs'));
  assert.match(g, /misapplied @i18n-entity-data marker/, 'a misapplied marker is not a gate failure');
  assert.match(g, /exempt — proper-noun records and match-term lists/, 'the exempt count is not printed');

  const j = json('i18n-pair-audit.mjs');
  assert.equal(j.badMarkers.length, 0,
    `misapplied marker(s): ${j.badMarkers.map((b) => b.file + ':' + (b.line || '?')).join(', ')}`);
  assert.ok(j.exempt > 0, 'nothing is exempt — the marker mechanism is not reaching the entity tables');

  /* ⚠ THE MATCHER RULE IS ABOUT SHAPE, NOT INDEX. #R248 checked `parent.elements[0] === n`, so the
     328 match-term lists js/gazetteer.js keeps at slot 1 were counted as UI text for two rounds. */
  assert.match(a, /parent\.elements\.includes\(node\)/,
    'the match-term exemption is back to testing slot 0 only — js/gazetteer.js puts its list at slot 1');
});

/* ── ⑤ THE OPEN GAP ONLY EVER GOES DOWN ─────────────────────────────────────────────────────── */
test('#R249 ⑤ the twelfth shape\'s ratchet', () => {
  const j = json('i18n-pair-audit.mjs');
  /* #R246 2,262 → #R247 2,255 → #R248 2,031 → #R249 696.
     ⚠ THE STEP THIS ROUND IS MOSTLY MEASUREMENT, NOT CONVERSION, AND THAT IS SAID OUT LOUD: 1,335
     containers moved to `exempt` because they are proper-noun records or match-term lists (the
     reader's decision — 「固有名詞は構造的に除外し、UI文だけ全言語化」). What is left is UI prose.
     The ratchet is on the number that has to reach zero. */
  assert.ok(j.total <= 696, `the open gap grew to ${j.total} — write the new tuple as pickArgs() instead`);
  /* …and it must not be able to go green by exempting everything: the exemption is validated (④)
     and every exempt container is reported per file. */
  assert.ok(Array.isArray(j.exemptFiles) && j.exemptFiles.length > 0, 'the exemption is not reported per file');
});
