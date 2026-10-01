/* ============================================================================
 *  shell-i18n-audits-checks — the i18n instruments — audits, dead keys, line endings, the gates that measure coverage
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r231-checks.test.mjs
 *  tests/r467-checks.test.mjs
 *  tests/r459-checks.test.mjs
 *  tests/r249-checks.test.mjs
 *  tests/r450-checks.test.mjs
 *  tests/r548-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';
import { dominantEol, joinLines, normaliseEol, readLF, splitLines } from '../scripts/eol.mjs';
import { scanSource } from '../scripts/i18n-attr-audit.mjs';
import { audit, classifier, codes, tableOf } from '../scripts/i18n-dead-key-audit.mjs';
import { cutDeadRows } from '../scripts/i18n-dead-key-codemod.mjs';
import { context, parseAll, shapeOf } from '../scripts/i18n-helpers.mjs';
import { build } from '../scripts/zh-hans.mjs';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { readSpec } from '../scripts/architecture-spec.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R231 · from r231-checks.test.mjs ═══════════════════════ */
/* (#R231 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
test('R231 i18n: coverage is MEMBERSHIP, and Chinese is actually complete', () => {
  /* ⚠⚠ THE REPORT USED TO DIVIDE TWO SIZES. A table of 2,068 entries against 2,038 live strings
     printed "100 %" while five of those live strings had no entry at all — thirty stale keys, left
     over from call sites since edited, padded the number that hid them. That is this round's own
     headline defect one level down: an instrument reporting green for something it is not looking
     at. It counts the intersection now. */
  const rep = read('scripts/i18n-report.mjs');
  assert.match(rep, /const covered = \[\.\.\.inline\.keys\(\)\]\.filter\(\(s\) => i\.has\(s\)\)\.length;/,
    'coverage counts the intersection');
  assert.ok(!/i\.size \/ Math\.max\(1, inline\.size\)/.test(rep), 'not a size ratio');
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/i18n-report.mjs')], { encoding: 'utf8' });
  /* ⚠⚠⚠ (#R752) THIS USED TO ASSERT `/100\.0%/` FOR zh, AND THE PERCENTAGE WAS THE WRONG SUBJECT
     TWICE OVER.
     ① CONSTITUTION.md §7 was amended on 2026-09-11: IntMap's own prose is authored in en + jp, and
        the seven carried languages are held at a FLOOR — 「新しい英語だけの文字列は数を下げないので
        通り、韓国語の 1 行を消すと落ちる」, in as many words. fr and ko sit at 96.3 % and are
        correct. A line demanding 100 % of zh alone is the pre-amendment regime left behind in one
        test, and it made the FIRST round to add an en+jp refusal sentence fail for obeying the
        constitution. ⚠ The alternative — translating the new strings into zh — is what AGENTS.md
        §3-5 forbids outright (9 言語体制は完全凍結・言語を、それ自体を目的とした作業の対象にしない).
     ② AND IT WAS ALREADY ONLY ACCIDENTALLY TRUE. Measured on origin/main the day this changed:
        zh held 6338 of 6339 live strings and the report printed 100.0 %. One missing member, hidden
        by rounding — which is THIS TEST'S OWN HEADLINE DEFECT (a table of 2,068 against 2,038
        printing 「100 %」) in its own assertion, one level down.
     ⇒ What is measured now is MEMBERSHIP, exactly, against the keeper that the amendment appointed:
     tests/i18n-coverage-floor.json. Nothing is relaxed — a zh row DELETED still fails, and it fails
     on a count rather than on a rounded percentage. */
  const floors = JSON.parse(read('tests/i18n-coverage-floor.json')).langs;
  for (const code of ['zh', 'zh-hans']) {
    const line = out.split('\n').find((l) => l.startsWith(code + ' ') || l.startsWith(code.padEnd(6) + ' '));
    assert.ok(line, `the report has a row for ${code}`);
    /* covered/live, printed as members and not only as a ratio — the whole point of this test. */
    const m = /(\d+)\/(\d+)\s+\d+\.\d%\s*$/.exec(line.trim());
    assert.ok(m, `${code} does not report inline coverage as a membership count: ${line}`);
    const covered = Number(m[1]);
    const floor = floors[code] && floors[code].inline;
    assert.ok(typeof floor === 'number', `no recorded floor for ${code} — the keeper the amendment appointed is missing`);
    assert.ok(covered >= floor,
      `${code} lost ground: ${covered} rows against a floor of ${floor}. Narrowing what is authored next is not licence to delete what is written already (CONSTITUTION.md §0-3): ${line}`);
  }
});
}

/* ═══════════════════════ #R467 · from r467-checks.test.mjs ═══════════════════════ */
/* (#R467 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
const R = read;

/* ⚠ THE SHAPE ITSELF IS STILL THERE, AND IT IS NOT A DEFECT ON ITS OWN — js/auth-ui.js keeps
   `_authL` for ~60 other strings, all of them textContent rather than attributes. What this pins is
   that the shape is DECLARED where the next reader will look, rather than rediscovered from
   production for a third time (js/map-readout.js was the first). */
/* spelling kept: the source text is the subject (what a file carries, or that a copy is absent). */
test('R467 ③ the lazy-wrapper blind spot is written down where the instruments are described', () => {
  const arch = readSpec(ROOT);   /* the spec: the map and its chapters (architecture-split) */
  assert.match(arch, /map-readout/, '§10.1 still names the first instance');
  assert.match(arch, /_authL/, '…and now names js/auth-ui.js as the second');
});
}

/* ═══════════════════════ #R459 · from r459-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · R459 — the sixth surface was measuring two files of markup
 * ----------------------------------------------------------------------------
 *  ① 「レイヤーのツールチップが9言語すべてで英語のまま。」
 *
 *  `scripts/i18n-attr-audit.mjs` (#R240) describes itself as «title / aria-label / placeholder /
 *  alt with NO key at all» and reported 0 — while `tg.title='Layers'` and two writers of
 *  `title='Favorite'` shipped English in all nine languages. Its universe was
 *  `FILES = ['index.html','admin.html']`; every attribute JavaScript writes at runtime was outside
 *  it. This file pins the widened universe, and it pins it in the only way that means anything:
 *  by handing the scanner the three defect lines AS THEY WERE WRITTEN and asserting it reports
 *  them. A check that can only say «the repo is at zero» is the check that was green for 216
 *  rounds — [[intmap-recurring-lessons]] B.
 * ==========================================================================*/
{
const R = read;
/* ⚠ THE 15th TIME A CHECK READ ITS OWN NOTE. The comment that EXPLAINS the defect spells the
   defect out, so a raw search finds the explanation and calls it the disease. Strip comments
   before asking whether the CODE still holds a string. */

/* ══ ① THE CHECK FIRES — the three lines, exactly as they shipped ════════════════════════════ */

/* ⚠ VERBATIM. These are the three sites as they stood at 03d942a, so this test is a REPRODUCTION
   and not a paraphrase of one. If the scanner ever stops seeing them, it has regressed to the
   universe that could not see them for 216 rounds. */
const AS_IT_SHIPPED = `
  const tg=document.createElement('button'); tg.id='lsr-toggle'; tg.title='Layers'; tg.innerHTML='<span class="chev"></span>';
  const st=document.createElement('button'); st.type='button'; st.textContent='★'; st.title='Favorite';
  const star=document.createElement('button'); star.type='button'; star.title='Favorite'; star.dataset.key=info.key;
`;

test('R459 ① the widened audit reports the three tooltips that shipped English in nine languages', () => {
  const hits = scanSource(AS_IT_SHIPPED, 'as-it-shipped.js');
  assert.equal(hits.length, 3,
    'expected 3 findings, got ' + hits.length + ': ' + JSON.stringify(hits.map((h) => h.text)));
  assert.deepEqual(hits.map((h) => h.text).sort(), ['Favorite', 'Favorite', 'Layers']);
  for (const h of hits) assert.equal(h.attr, 'title');
});

test('R459 ① …and the two shapes the markup-only universe could not hold', () => {
  /* a runtime setAttribute */
  assert.equal(scanSource(`el.setAttribute('aria-label','Close popup');`).length, 1);

  /* ⚠ MARKUP SPLIT ACROSS A `+` CHAIN. Neither literal contains a whole start tag, so a scanner
     that reads each string ALONE sees `<input … value="` with no `>` and reports nothing. Two live
     findings (js/app-body.js's ACLED credential boxes) hid in exactly this shape. */
  const chain = `x.innerHTML='<input id="acled-email" type="email" placeholder="email" value="'+esc(v)+'" style="flex:1;">';`;
  const hits = scanSource(chain);
  assert.equal(hits.length, 1, 'a tag spread over a + chain is still one tag');
  assert.equal(hits[0].text, 'email');
  assert.equal(hits[0].attr, 'placeholder');
});

test('R459 ① a value that goes through a translation call is NOT a finding', () => {
  /* otherwise the check above proves nothing: an instrument that reports everything reports nothing */
  assert.equal(scanSource(`tg.title=window.IntMapLang.t(lang,'Layers','レイヤー','Ebenen','Слои','Capas');`).length, 0);
  assert.equal(scanSource(`el.setAttribute('aria-label',window.IntMapLang.t(lang,'Close','閉じる','Schließen','Закрыть','Cerrar'));`).length, 0);
  /* (module-graph) every reader now IMPORTS the registry and calls the bare binding — the same holds for it */
  assert.equal(scanSource(`tg.title=IntMapLang.t(lang,'Layers','レイヤー','Ebenen','Слои','Capas');`).length, 0);
  assert.equal(scanSource(`el.setAttribute('aria-label',IntMapLang.t(lang,'Close','閉じる','Schließen','Закрыть','Cerrar'));`).length, 0);
  /* …and neither is a value that is not language: a unit symbol, a URL, a proper noun with punctuation */
  assert.equal(scanSource(`el.title='m'; el.title='https://example.org/x'; el.title='IntMap — '+t;`).length, 0);
});

/* ⚠⚠ AND NAMING THE LANGUAGE IS NOT A TRANSLATION CALL. The first draft of the widened audit waved
   through any expression mentioning `lang`, on the theory that a hand-written ladder belongs to
   scripts/i18n-two-branch-audit.mjs. Measured: that hatch covered exactly one site in the repo —
   js/tool-panel.js's minimise button, whose branches are themselves conditionals, so that audit
   could not match it either. Five languages named by hand, four told «Expand». */
test('R459 ① a hand-written language ladder is a finding, not another instrument’s problem', () => {
  const ladder = `mb.title=(HOST.lang==='jp'?(on?'展開':'最小化'):HOST.lang==='de'?(on?'Ausklappen':'Minimieren'):(on?'Expand':'Minimize'));`;
  assert.ok(scanSource(ladder).length > 0, 'a ladder that names five of nine languages is reported');
  assert.doesNotMatch(code(R('js/tool-panel.js')), /HOST\.lang==='jp'\?\(on\?/, 'and js/tool-panel.js no longer holds one');
});

/* ══ ② …AND THE REPOSITORY IS AT ZERO AGAINST THAT WIDER UNIVERSE ════════════════════════════ */

test('R459 ② every reader-facing attribute in js/ carries a translation, and the gate says so', () => {
  const out = JSON.parse(execFileSync(process.execPath,
    [path.join(ROOT, 'scripts', 'i18n-attr-audit.mjs'), '--json'], { encoding: 'utf8' }));
  assert.equal(out.total, 0, 'unkeyed reader-facing attributes: '
    + [...new Set(out.findings.map((f) => `${f.file}:${f.line} ${f.text}`))].join(' · '));

  /* the universe is BOTH files of markup AND every file of js/ — a count, so it cannot shrink back */
  const g = R('scripts/i18n-attr-audit.mjs');
  assert.match(g, /parseAll/, 'it reads the shared parse of js/');
  assert.match(g, /shapeOf/, 'and asks the ONE question about what a translation call is');
  assert.doesNotMatch(g, /from 'acorn-walk';[\s\S]{0,80}FILES = \['index\.html', 'admin\.html'\];\s*$/,
    'index.html and admin.html are no longer the whole universe');
});

/* ══ ④ THE FINDING HAS TO BE OPENABLE ════════════════════════════════════════════════════════ */

/* spelling kept: the source text is the subject (what a file carries, or that a copy is absent). */
test('R459 ④ no shipped file holds a lone CR, so a reported line is the line on disk', () => {
  /* js/satellite.js carried one. JavaScript treats a bare \r as a line terminator and grep does
     not, so acorn numbered that file one line higher than the editor from line 12 down — every
     instrument in this family reported it wrong, and a finding nobody can open is half a finding. */
  const bad = [];
  for (const f of readdirSync(path.join(ROOT, 'js')).filter((n) => n.endsWith('.js'))) {
    if (/\r(?!\n)/.test(R('js/' + f))) bad.push(f);
  }
  assert.deepEqual(bad, [], 'lone CR in: ' + bad.join(' '));
});

test('R459 ④ a finding inside a multi-line template names the line the attribute is on', () => {
  /* the line the BACKTICK is on sends the reader to the wrong end of a panel-sized template */
  const src = ['const a = `<div>', '  <span>x</span>', '  <button title="Delete this">y</button>', '`;'].join('\n');
  const hits = scanSource(src);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 3, 'reported line ' + hits[0].line + ', the attribute is on 3');
});
}

/* ═══════════════════════ #R249 · from r249-checks.test.mjs ═══════════════════════ */
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
{
const json = (f, ...a) => JSON.parse(execFileSync(process.execPath,
  [join(ROOT, 'scripts', f), '--json', ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

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
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */

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
}

/* ═══════════════════════ #R450 · from r450-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  #R450 — rows in a locale table that nothing can ask for
 * ----------------------------------------------------------------------------
 *  `"Volcanoes (GVP Holocene, all 1,215)"` was translated into fr / ko / zh-Hant / zh-Hans in
 *  #R251 and orphaned in #R353, when the volcano layer was rebuilt and its legend took the shorter
 *  `"Volcanoes (GVP Holocene)"`. Four rows survived their English side by two rounds, carrying a
 *  catalogue count upstream had already revised (1,215 → 1,214, and #R432 re-counted it again).
 *  Nothing could render them, nothing could fail, and — this is the part that matters — no gate
 *  could see them: all seventeen surfaces in scripts/i18n-audit.mjs count `want ∩ have`, so a row
 *  in `have` that is in no `want` drops out of the numerator AND the denominator in silence.
 *  Measured when the eighteenth surface was written: 413 such keys, 1,959 rows, in all nine files.
 *
 *  ⚠⚠⚠ THE CHECK THAT MATTERS HERE IS ④. The obvious way to find these rows is `have − want`,
 *  reusing the universe the other seventeen already build. `want` has holes — js/map-readout.js
 *  binds `L` to a lazy wrapper that scripts/i18n-helpers.mjs cannot resolve, so its ten call sites
 *  are invisible to every instrument in the family — and for a coverage surface a hole is an
 *  undercount, while here it is a DELETION. ④ pins the difference by naming a string that is live
 *  only through that wrapper: if a later round ever «simplifies» the audit onto `shapeOf()`, that
 *  string becomes deletable and this check goes red before the translation does.
 * ==========================================================================*/
{
const R = (p) => readLF(join(ROOT, p));

/* ⚠ the label has now been rewritten TWICE — «…, all 1,215» → «Volcanoes (GVP Holocene)» (#R353)
   → «Volcanoes (Smithsonian GVP)» (#R432) — and each rewrite orphaned the one before it in four
   languages. So the live half is read out of the file that draws the layer rather than written
   here: a third rename must move this check, not quietly make it vacuous. */
const GONE = ['Volcanoes (GVP Holocene, all 1,215)', 'Volcanoes (GVP Holocene)'];

function liveVolcanoLabel() {
  const m = /_registerLayerOpacity\('volc2',\s*LA\('([^']+)'/.exec(R('js/beta-overlays.js'));
  assert.ok(m, 'js/beta-overlays.js no longer registers the volcano layer with an LA(…) label');
  return m[1];
}

test('#R450 ① every orphaned volcano label is gone from every table, and the one on screen is not', () => {
  const live = liveVolcanoLabel();
  assert.ok(!GONE.includes(live), `the label ${JSON.stringify(live)} is both drawn and listed as dead`);
  for (const c of codes()) {
    const inline = new Set(tableOf(c, 'inline').map((d) => d.key));
    if (!inline.size) continue;                       /* the five positional languages have no inline table */
    for (const g of GONE) assert.ok(!inline.has(g), `ui.${c}.js still carries ${JSON.stringify(g)}`);
    assert.ok(inline.has(live), `ui.${c}.js has no row for ${JSON.stringify(live)} — that one IS on screen`);
  }
  /* …and the orphans cannot come back: scripts/i18n-apply-inline.mjs merges every staging file and
     scripts/i18n-append-inline.mjs inserts every key the locale does not already have. */
  const staging = JSON.parse(R('scripts/i18n/r251-c.json'));
  for (const g of GONE) assert.ok(!(g in staging), `scripts/i18n/r251-c.json would put ${JSON.stringify(g)} straight back`);
});

test('#R450 ② no locale table holds a row nothing can ask for, and no staging file would add one', () => {
  const r = audit();
  assert.equal(r.keys.length, 0,
    'unreachable keys: ' + r.keys.slice(0, 8).map((k) => JSON.stringify(k)).join(', '));
  assert.equal(r.rows.length, 0);
  assert.equal(r.staging.length, 0,
    'unreachable staging rows: ' + r.staging.slice(0, 8).map((s) => `${s.file} ${JSON.stringify(s.key)}`).join(', '));
  /* every table was actually looked at — a corpus that failed to load would also report zero */
  assert.ok(r.corpus > 200, `only ${r.corpus} shipped file(s) in the corpus`);
  assert.ok(r.literals > 10000, `only ${r.literals} literal string(s) — the parse half of the corpus is empty`);
  assert.equal(r.per.filter((p) => p.table === 'inline').length, 4, 'the four inline tables are what carry English-keyed rows');
  assert.equal(r.per.filter((p) => p.table === 'ui').length, 9, 'every language declares a keyed table');
});

test('#R450 ③ the instrument can say «dead» — it is not a check that cannot fire', () => {
  const { verdict } = classifier();
  const nonce = 'r450 nonce — no shipped file says this ✻';
  assert.equal(verdict(nonce), 'dead');
  /* and it says «live» for something that plainly is */
  assert.equal(verdict(liveVolcanoLabel()), 'live');
});

test('#R450 ④ ⚠ a string live ONLY through the lazy wrapper is live here — the audit does not inherit shapeOf()', () => {
  /* the universe the other seventeen surfaces measure against */
  const want = new Set();
  for (const f of parseAll().keys()) {
    const ctx = context(f, 'strict');
    walk.simple(ctx.ast, {
      CallExpression(n) {
        const i = shapeOf(n, ctx); if (i < 0) return;
        const a = n.arguments[i];
        if (a && a.type === 'Literal' && typeof a.value === 'string' && a.value.trim()) want.add(a.value);
      },
    });
  }
  /* js/map-readout.js: `const L=(...a)=>{ if(!_L) _L=IntMapLang.pick(()=>HOST.lang); … }` */
  const wrapper = 'Tropic of Cancer';
  const src = R('js/map-readout.js');
  assert.ok(src.includes(`L('${wrapper}'`), 'js/map-readout.js no longer calls L() with this string — pick another witness');
  assert.ok(!want.has(wrapper),
    'the lazy wrapper is resolved now, so this check has stopped asserting anything: point it at another blind spot or delete it');
  const { verdict } = classifier();
  assert.equal(verdict(wrapper), 'live',
    'the audit called a live row dead — it must not be built on the want set (see the header)');
  /* the same holds for every row the four inline tables still carry */
  const fr = new Set(tableOf('fr', 'inline').map((d) => d.key));
  assert.ok(fr.has(wrapper), 'ui.fr.js lost a row that IS reachable');
});

test('#R450 ⑤ ⚠ an assembled key is held back rather than deleted, and a wildcard is not a pattern', () => {
  const { verdict, pats } = classifier();
  assert.ok(pats.length > 50, `only ${pats.length} assembly pattern(s) — the safety net stopped finding the concatenations`);
  /* build a string each pattern can produce, and check the audit refuses to call it dead.
     ⚠ `/` is in the list because RegExp#source escapes it on its own, whatever the pattern was
     built from — reading the source back is not the same as reading what was written. */
  const unesc = (s) => s.replace(/\\([.*+?^${}()|[\]\\/])/g, '$1');
  let checked = 0;
  for (const p of pats.slice(0, 40)) {
    const body = p.re.source.replace(/^\^/, '').replace(/\$$/, '');
    if (!body.includes('[\\s\\S]*')) continue;
    const made = body.split('[\\s\\S]*').map(unesc).join('r450✱');
    assert.ok(p.re.test(made), 'the candidate does not match the pattern it was built from');
    assert.equal(verdict(made), 'assembled', `a key ${p.where} can produce was not held back: ${JSON.stringify(made)}`);
    checked++;
  }
  assert.ok(checked >= 10, `only ${checked} pattern(s) exercised`);
  /* ⚠ and a chain with no constant part must NOT become a pattern: it would match every key and
     hold the whole table back, i.e. a green that asserts nothing */
  assert.ok(!pats.some((p) => p.re.source === '^[\\s\\S]*$'), 'a wildcard got into the pattern set');
});

test('#R450 ⑥ the eighteenth surface is wired into the one gate, and it is a gate rather than a printed number', () => {
  const gate = codeOnly(R('scripts/i18n-audit.mjs'));
  assert.match(gate, /run\('i18n-dead-key-audit\.mjs'\)/, 'scripts/i18n-audit.mjs does not run the audit');
  /* ⚠ it must reach `problems`, which is what makes --gate exit 1 — printing the number is not a
     gate, and the condition must be the bare count. A `> N` here would be a ratchet: #R242's rule
     that makes the adjacent-data tuples a ceiling does not apply to rows that are DELETED rather
     than translated, so a threshold would be a number with no argument behind it. */
  assert.match(gate, /if \(dead\.keys\.length\) problems\.push\(/, 'the unreachable keys do not fail the gate at zero');
  assert.match(gate, /if \(dead\.staging\.length\) problems\.push\(/, 'the staging rows do not fail the gate at zero');
  /* …asked of the gate BLOCK alone — the report above it truncates its own list with a `>`, and a
     check that cannot tell the two apart would be answering about the wrong half of the file */
  const block = gate.slice(gate.indexOf("if (process.argv.includes('--gate'))"));
  assert.ok(block.includes('dead.keys.length'), 'the gate block does not mention the eighteenth surface');
  assert.doesNotMatch(block, /dead\.(keys|rows|staging)\.length\s*[<>]/, 'the eighteenth surface became a ratchet');
  /* the count travels in the machine-readable output too, so a reader is not the only consumer */
  const json = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(/i18n-audit\.mjs --gate/.test(json.scripts['check:i18n']), 'check:i18n no longer runs the one gate');
  assert.match(gate, /deadKeys: dead\.keys\.length/, '--json does not carry the count');
});
}

/* ═══════════════════════ #R548 · from r548-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · R548 — TWO DEFINITIONS OF «A LINE», AGREEING ON EVERY FILE BUT ONE
 * ----------------------------------------------------------------------------
 *  scripts/i18n-dead-key-codemod.mjs died with
 *
 *      TypeError: Cannot read properties of undefined (reading 'slice')
 *      const before = lines0[a - 1].slice(0, pr.loc.start.column);
 *
 *  on js/locales/ui.zh-hans.js — but only after scripts/zh-hans.mjs had been run in the same
 *  checkout, which scripts/i18n-apply-inline.mjs does as its LAST STEP. So the ordinary order
 *  «apply the new keys, then remove the dead ones» met it every time, and the tool worked only
 *  from a clean checkout.
 *
 *  The generator pasted a header out of a .mjs (LF — .gitattributes forces it) in front of a body
 *  sliced out of a .js (CRLF, under core.autocrlf on Windows): fourteen LF lines, then 6,271 CRLF
 *  ones. The codemod chose ONE terminator for the whole file and split on it, coming out fourteen
 *  short of acorn's count — 6,272 against 6,286, measured by rebuilding the real file the way the
 *  old generator wrote it, where the first row past the desync is "Fine tuning" on line 6,273 and
 *  reproduces the reported TypeError exactly. Rows past the desync crashed; rows before it did worse
 *  — read a line fourteen away and decided from IT whether to delete a whole line.
 *
 *  ⚠ EVERY ASSERTION HERE EVALUATES THE SHIPPED CODE. The broken version and the fixed one are
 *  spelled almost identically, and a check reading either one's TEXT would have passed on both
 *  ([[intmap-edge-function-must-be-evaluated]]): the codemod's own transform is imported and run,
 *  the generator's build() is imported and run, and scripts/i18n-append-inline.mjs is executed as
 *  the command it is. ①②③ also assert that the OLD rule FAILS the same input, so «the check passes»
 *  cannot quietly mean «the check can no longer tell».
 * ==========================================================================*/
{
const LOCALES = join(ROOT, 'js', 'locales');
const LF = String.fromCharCode(10), CR = String.fromCharCode(13), CRLF = CR + LF;
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);

/* the line acorn puts the last character of the source on — (module-graph) parsed as a module, which is
   what every js/locales file is now (it imports the registry); line terminators are the same in both goals */
const acornLines = (src) => parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }).loc.end.line;
/* ⚠ THE RULE AS IT WAS, reproduced so the check can tell the fix from its absence. */
const oldSplit = (src) => src.split(src.includes(CRLF) ? CRLF : LF);

const kindsOf = (src) => new Set(splitLines(src).map((l) => l.eol).filter(Boolean));
const show = (s) => JSON.stringify(s);

/* A locale file in the exact shape the generator produced: an LF header glued to a CRLF body.
   The dead rows deliberately sit PAST the point where the two line counts diverge. */
function mixedLocale({ headEol = LF, bodyEol = CRLF, headLines = 14 } = {}) {
  const head = ['/* ' + '='.repeat(70)];
  for (let i = 2; i < headLines; i++) head.push(' *  header line ' + i + ' — this is what a .mjs contributes');
  head.push(' * ' + '='.repeat(70) + '*/');
  assert.equal(head.length, headLines);
  /* (module-graph) the body is the shape js/locales/ui.*.js has now: an import of the registry, then a bare define */
  const body = [
    "import { IntMapLang } from '../lang-registry.js';",
    "IntMapLang.define('xx', {",
    '  ui: {',
    '    alive: "A", doomed: "B", stillAlive: "C"',
    '  },',
    '  inline: {',
    '    "Live one": "L",',
    '    "Dead one": "D",',
    '    "Another live one": "M",',
    '  },',
    '});',
    '',
  ];
  return head.join(headEol) + headEol + body.join(bodyEol);
}

/* ── ① THE SPLITTER COUNTS LINES THE WAY THE PARSER DOES ─────────────────────────────────────────
   This is the property the crash violated, stated for every source acorn will accept — not for the
   one file that happened to be reported. ECMAScript's LineTerminatorSequence is <LF>, <CR>,
   <CR><LF>, <LS>, <PS>; a tool that indexes its own array with `loc.line` must split on that set,
   and on nothing else. */
test('R548 ① splitLines() agrees with acorn on every line terminator ECMAScript defines', () => {
  const cases = {
    'pure LF': 'var a = 1;' + LF + 'var b = 2;' + LF,
    'pure CRLF': 'var a = 1;' + CRLF + 'var b = 2;' + CRLF,
    'LF header + CRLF body': mixedLocale(),
    'lone CR': 'var a = 1;' + CR + 'var b = 2;' + CR,
    'a stray CR before a real break': 'var a = 1;' + CR + CRLF + 'var b = 2;' + CRLF,
    'U+2028 / U+2029': 'var a = 1;' + LS + 'var b = 2;' + PS,
    'no terminator at all': 'var a = 1;',
    'empty': '',
    'trailing blank lines': 'var a = 1;' + CRLF + CRLF + CRLF,
  };
  for (const [name, src] of Object.entries(cases)) {
    assert.equal(splitLines(src).length, acornLines(src),
      name + ': split ' + splitLines(src).length + ' vs acorn ' + acornLines(src));
    assert.equal(joinLines(splitLines(src)), src,
      name + ': the round trip must be byte-exact — a codemod must not re-punctuate lines it did not touch');
  }

  /* and the same, measured against the files this actually runs on */
  const locales = readdirSync(LOCALES).filter((f) => f.endsWith('.js')).sort();
  assert.ok(locales.length >= 18, 'js/locales holds ' + locales.length + ' files');
  for (const f of locales) {
    const src = readFileSync(join(LOCALES, f), 'utf8');
    assert.equal(splitLines(src).length, acornLines(src), 'js/locales/' + f + ' — split and acorn disagree');
    assert.equal(joinLines(splitLines(src)), src, 'js/locales/' + f + ' — the round trip is not byte-exact');
  }

  /* ⚠ AND THE OLD RULE MUST STILL FAIL THE MIXED ONE */
  const mixed = mixedLocale();
  assert.notEqual(oldSplit(mixed).length, acornLines(mixed),
    'the rule this replaced must still be wrong about this input, or the input stopped reproducing the defect');
});

/* ── ② THE CODEMOD SURVIVES THE FILE ITS OWN PIPELINE PRODUCES ───────────────────────────────────
   The transform is imported and RUN — and importing it must not audit the corpus or rewrite nine
   locales, which is why the command lives behind IS_MAIN. */
test('R548 ② cutDeadRows() removes the row from a mixed-ending locale without crashing', () => {
  const src = mixedLocale();
  const dead = new Set(['Dead one', 'doomed']);

  /* the precondition: this input really is one the old rule could not index */
  const deadLine = splitLines(src).findIndex((l) => l.text.includes('Dead one')) + 1;
  assert.ok(deadLine > oldSplit(src).length,
    'the dead row must sit past the desync (line ' + deadLine + ' vs ' + oldSplit(src).length
    + ' old entries), or nothing is being reproduced');

  const cut = cutDeadRows(src, dead, 'ui.xx.js');
  assert.equal(cut.rows, 2, 'both dead rows were found');
  parse(cut.text, { ecmaVersion: 2022, sourceType: 'module' });   /* it must still parse (as the module it is) */
  assert.ok(!cut.text.includes('Dead one'), 'the dead inline row is gone');
  assert.ok(!/\bdoomed\b/.test(cut.text), 'the dead packed row is gone');
  for (const live of ['Live one', 'Another live one', 'alive', 'stillAlive']) {
    assert.ok(cut.text.includes(live), 'the live row «' + live + '» survived');
  }

  /* ⚠ AND IT KEPT THE ENDINGS IT FOUND. Rejoining with one terminator would «fix» the crash by
     rewriting 6,285 lines the codemod was never asked to touch. */
  const out = splitLines(cut.text);
  assert.equal(out[0].eol, LF, 'the header line kept its LF: ' + show(out[0].eol));
  const bodyStart = out.findIndex((l) => l.text.includes('IntMapLang.define'));
  assert.equal(out[bodyStart].eol, CRLF, 'the body line kept its CRLF: ' + show(out[bodyStart].eol));
  assert.deepEqual(kindsOf(cut.text), kindsOf(src), 'no ending was introduced or removed');
});

/* ── ③ THE GENERATOR NO LONGER INTRODUCES A SECOND CONVENTION ────────────────────────────────────
   ⚠ THE PROPERTY IS A SUBSET, NOT «THE OUTPUT IS UNIFORM». The body is the source's own bytes and
   this script has no business re-punctuating lines it did not write — js/locales/pages.zh-hant.js
   carries a stray lone CR from a different tool, and a generator that normalised the whole output
   would launder that defect into its own diff. What must hold is that the DERIVATION adds no
   terminator its source does not already use, which is exactly what the header did. */
test('R548 ③ zh-hans build() introduces no line ending its source does not have', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-r548-'));
  try {
    const src = [
      '/* a Traditional table, checked out the way git checks out a .js on Windows */',
      "import { IntMapLang } from '../lang-registry.js';",
      "IntMapLang.define('zh', {",
      '  ui: {',
      '    a: "網路", b: "資料"',
      '  },',
      '  inline: {',
      '    "Network": "網路",',
      '    "Data": "資料",',
      '  },',
      '});',
      '',
    ].join(CRLF);
    const p = join(dir, 'ui.zh.js');
    writeFileSync(p, src);

    const out = build({
      src: p, out: join(dir, 'ui.zh-hans.js'), what: 'UI STRINGS',
      from: "IntMapLang.define('zh'", to: "IntMapLang.define('zh-hans'",
    });

    assert.ok(out.length > src.length, 'the header was prepended');
    assert.ok(out.includes("define('zh-hans'"), 'the tag was rewritten');
    assert.ok(out.includes('网络'), 'the vocabulary table still ran — 網路 became 网络, not 网路');

    const introduced = [...kindsOf(out)].filter((e) => !kindsOf(src).has(e));
    assert.deepEqual(introduced, [], 'the derivation introduced ' + show(introduced)
      + ' — the header is not punctuated like the body it is glued to');
    assert.equal(splitLines(out).length, acornLines(out), 'the generated file is one acorn can index by line');

    /* ⚠ AND THE SHAPE THIS REPLACED MUST STILL BE WRONG: a header written as a literal in a .mjs is
       LF, and gluing it straight onto the CRLF body is what produced the fourteen. */
    const cutAt = splitLines(out).findIndex((l) => l.text.includes('IntMapLang.define'));
    const headLF = normaliseEol(joinLines(splitLines(out).slice(0, cutAt)), LF);
    const oldWay = headLF + src.slice(src.indexOf('IntMapLang.define'));
    assert.ok([...kindsOf(oldWay)].some((e) => !kindsOf(src).has(e)),
      'the shape this replaced must still introduce an ending, or the test is no longer about it');
    assert.notEqual(oldSplit(oldWay).length, acornLines(oldWay),
      'and its output must still be one the old splitter miscounts');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ── ④ THE OTHER SITE OF THE SAME GUESS, RUN AS THE COMMAND IT IS ────────────────────────────────
   scripts/i18n-append-inline.mjs never crashed — it punctuates only the rows it ADDS — so the guess
   there was silent: one stray CRLF anywhere in an LF file and every new row got CRLF. It takes its
   target as an argument, so this drives the real script over a temporary file. */
test('R548 ④ i18n-append-inline punctuates new rows like the file, not like its first CRLF', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-r548-'));
  try {
    const lines = [
      '/* a locale that is LF apart from one stray CRLF */',
      "import { IntMapLang } from '../lang-registry.js';",
      "IntMapLang.define('xx', {",
      '  inline: {',
      '    "Existing": "E",',
      '  },',
      '});',
      '',
    ];
    const src = lines.slice(0, 3).join(LF) + CRLF + lines.slice(3).join(LF);   /* exactly one CRLF */
    const target = join(dir, 'ui.xx.js');
    const add = join(dir, 'add.json');
    writeFileSync(target, src);
    writeFileSync(add, JSON.stringify({ 'Brand new': 'B' }));
    assert.equal(dominantEol(src), LF, 'the fixture is an LF file with one stray CRLF in it');
    assert.equal(src.includes(CRLF) ? CRLF : LF, CRLF, 'and the rule this replaced would have called it a CRLF file');

    execFileSync(process.execPath, [join(ROOT, 'scripts', 'i18n-append-inline.mjs'), target, add], { stdio: 'pipe' });

    const after = readFileSync(target, 'utf8');
    parse(after, { ecmaVersion: 2022, sourceType: 'module' });
    assert.ok(after.includes('"Brand new"'), 'the row was added');
    const crlfBefore = splitLines(src).filter((l) => l.eol === CRLF).length;
    const crlfAfter = splitLines(after).filter((l) => l.eol === CRLF).length;
    assert.equal(crlfAfter, crlfBefore,
      'the new rows were punctuated LF like the rest of the file, not CRLF like the stray one');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
}
