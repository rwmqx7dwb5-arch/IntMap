/* ============================================================================
 *  BUILD STAMPS, TIMING TABLES AND THE GATES THAT READ THE TREE
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. Build stamps and gate scripts are claims about files;
 *    the gates are run where they have a CLI.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { generatedStampProblems } from './helpers/build-stamp.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r191-checks.test.mjs (tests #11 of 11) ═══
    R191 — source-level checks for the round's eight reports.
    Node's own test runner; no browser. The things that need a real renderer or
    live pixels are in tests/r191.spec.js. */
{

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readLF(join(ROOT, f))).join('\n')
  : readLF(join(ROOT, p)));

/* ── 7 · the profiling command actually runs the profiler ────────────────────────────────────── */
test('R191 ops: npm run test:profile cannot silently do nothing', () => {
  const pkg = JSON.parse(read('package.json'));
  const p = pkg.scripts['test:profile'];
  assert.match(p, /shell:process\.platform==='win32'/, 'the Windows launcher is resolvable');
  assert.match(p, /process\.exit\(r\.status==null\?1:r\.status\)/,
    'and a spawn that never started is a failure, not a pass');
});
}

/* ═══ from tests/r193-checks.test.mjs (tests #8 of 9) ═══
    R193 — source contracts. The parts that can be proved without a renderer. */
{
const R = path.resolve(import.meta.dirname, '..');

test('R193 ⑧ nothing large is fetched on the boot path that nobody is waiting for', () => {
  /* Köppen: the small file first, the full one behind an idle callback */
  const d = read('js/data-layers.js');
  assert.match(d, /function koppenDisplayURL\(p\)\{ return koppenPhone\(\)\?koppenSmallURL\(p\):koppenSmallURL\(p\); \}/,
    'the first Köppen picture is the 4k one on every device');
  assert.match(d, /function koppenUpgrade\(/, 'and the full-resolution one is swapped in later');
  assert.match(d, /requestIdleCallback\(run,\{timeout:8000\}\)/, 'behind an idle callback');
  /* the layer-preview queue does not open until the panel is shown or the page is idle */
  const lp = read('js/layer-previews.js');
  assert.match(lp, /function _imgPump\(\)\{ if\(!_imgOpen\) return;/, 'the preview queue starts closed');
  assert.match(lp, /function kick\(container\)\{ _openQueue\(\);/, 'opening the panel opens it');
  /* katex and html2canvas are deferred, not merely split */
  const v = read('src/vendor.js');
  /* ⚠ (#R224) DEFERRED BECAME ON-DEMAND, which is what #R193 was reaching for. An idle callback with
     a 6 s ceiling still fetched, parsed and compiled 456 kB on EVERY session (measured this round at
     t = 1.04 s on a clean phone load) for two features most sessions never touch. They are keyed to
     their first use now: html2canvas when the shutter is pressed, KaTeX when an answer carries LaTeX. */
  assert.ok(!/requestIdleCallback\(load/.test(v), 'the vendors are no longer merely delayed');
  assert.match(v, /window\.IntMapVendor = /, 'they are behind an explicit first-use gate');
  /* ⚠ (#R493) THE FETCH MOVED WITH THE CAPTURE, AND THE CLAIM DID NOT. js/screenshot.js used to hold
     the picture; it now holds the BUTTON and calls js/atlas-view-capture.js, which Atlas calls too
     (view.inspect). Reading the old file would only prove that a second copy of the fetch had been
     left behind — the duplication that round removed. The property is unchanged: whoever composes
     the screen pulls its own 198 kB library at that moment and never at boot. */
  assert.match(read('js/atlas-view-capture.js'), /IntMapVendor\.html2canvas\(\)/, 'the capture path fetches its own library');
  assert.match(read('js/screenshot.js'), /await import\('\.\/atlas-view-capture\.js'\)/, '…and the shutter reaches it on demand, not at boot');
  assert.match(read('js/atlas-reply.js'), /IntMapVendor\.katex\(\)/, 'and the maths path fetches KaTeX');
  /* the country file waits for the map's own idle */
  const ab = read('js/app-body.js');
  assert.match(ab, /GE\(\)\.events\.once\('idle',\(\)=>setTimeout\(once,300\)\);[\s\S]{0,80}setTimeout\(once,5000\);/,
    'the gazetteer warm-up waits for the map to settle');
  /* and the analytics tag is inserted at idle rather than at parse time */
  const h = read('index.html');
  /* ⚠ THE PROPERTY IS «SCHEDULED AT IDLE WITH A CEILING», NOT «the callback is named `ins`». The
     scheduled function is `guarded` now — it re-checks that no OAuth/magic-link credential is still
     sitting in the URL before inserting the tag, because Clarity records the page URL and a DOM
     replay (see the note beside the tag). Same scheduler, same 6 s ceiling, same "not at parse
     time"; pinning the identifier made this fail on a privacy fix that changes none of that. */
  assert.match(h, /if\(typeof requestIdleCallback==='function'\) requestIdleCallback\(\w+,\{timeout:6000\}\)/,
    'the Clarity tag is inserted at idle');
  assert.match(h, /var authy=function\(\)/, 'and only once the URL carries no auth credential');
  assert.match(h, /c\[a\]=c\[a\]\|\|function\(\)\{\(c\[a\]\.q=c\[a\]\.q\|\|\[\]\)\.push\(arguments\)\}/,
    '…while its queue shim is still defined immediately, so nothing that calls it breaks');
});
}

/* ═══ from tests/r202-checks.test.mjs (tests #15, #17 of 17) ═══
    R202 — the sky is computed, the source is integrated, and the far plane reaches the horizon
    Twelve instructions, and the ones with physics or arithmetic behind them are checked by RUNNING
    that arithmetic rather than by asserting on the text that contains it:

      ① js/sky-model.js is pure — no DOM, no renderer — so the scattering integral runs here.
      ② src/tsunami-worker.js loads into a Node vm (the harness tests/r197-checks.test.mjs built), so
         the cell-averaged source is compared against the centre sample it replaces.

    The rest are seam checks of the kind this suite has used since #R162: a capability that is
    declared must be implemented, a contract method that is called must exist, and a value that two
    files have to agree on is derived from one of them rather than written down twice. */
{
const rd = read;

test('R202 ③h the timing tables finally have a writer, and it cannot delete what it did not see', () => {
  const sp = rd('scripts/shard-plan.mjs'), bl = rd('scripts/baseline.mjs'), ci = rd('.github/workflows/ci.yml');
  /* (#R203) the ten steps a browser shard runs moved into a composite action when the suite grew a
     second tier — one copy of the recipe, two callers. The restore/merge half of this lives there. */
  const act = rd('.github/actions/browser-tier/action.yml');
  assert.match(sp, /has\('--merge'\)/, 'shard-plan can union the per-shard fragments');
  assert.match(bl, /has\('--merge'\)/, 'and so can baseline');
  assert.match(sp, /carried over/, 'a partial fragment set must not drop the specs it does not mention');
  assert.match(ci, /timings:/, 'and CI has the job the comment has been promising since #R195');
  /* ⚠ AND IT DOES NOT COMMIT THEM. The first version pushed to main and came back GH013: the
     «Protect main» ruleset requires a pull request and status checks and lists no bypass actors.
     That rule is right, and a DERIVED measurement is the wrong thing to weaken it for — so the
     tables travel by cache, which a pull-request run can read from the default branch. */
  assert.doesNotMatch(ci, /git push origin HEAD:main/, 'nothing in CI pushes to main');
  /* ⚠ THE ACTION, NOT THE REF. Every remote action is pinned to a full-length commit SHA now (a
     mutable tag is a supply-chain hole: whoever can move `v4` can run code in this repo's CI), so a
     test that spells `@v4` fails on the hardening rather than on a regression. */
  assert.match(ci, new RegExp('actions/cache/save@[0-9a-f]{40}'), 'the measured times are published as a cache');
  assert.match(act, new RegExp('actions/cache/restore@[0-9a-f]{40}[\\s\\S]{0,240}intmap-timings-'), 'and the browser job restores them');
  assert.match(act, /--merge _timecache\/durations\.json/, 'merging them into the committed table before planning');
});

test('R202 ③j the build stamps name THIS round', async () => {
  /* #R174: both stamps sat at R171 through two rounds, so a reload could not be told apart from a
     stale cache. The exact pin lives in the CURRENT round's file and becomes the negative form in
     the next one (tests/r201-checks ⑥ is now that negative form).
     ⚠ AND THIS IS WHY THE WHOLE NODE SUITE RUNS AFTER EVERY CHANGE, NOT ONCE. This round bumped the
     stamp late, re-ran only the two check files it thought were involved, and shipped a red CI: the
     assertion that broke was the PREVIOUS round's pin, in a file nobody had reason to look at. */
  /* (#R203) …and this became the NEGATIVE form, which is what the paragraph above says happens to it.
     (2026-09-25) The stamp is now written by the build from the commit being built
     (scripts/build-stamp.mjs) — «this round» is whatever is being built — so what is asked is that
     nobody types it back in and the build keeps filling it. */
  assert.deepEqual(await generatedStampProblems(rd('index.html')), [], 'the build stamp can go stale again');
});
}

/* ═══ from tests/r218-checks.test.mjs (tests #28 of 28) ═══
    #R218 — source-level checks (Node only; no browser, no network)
    The rule this file follows is #R217's: where a round replaced a NUMERICAL METHOD, the test RUNS
    it rather than looking for its text. ①–④ execute real arithmetic (the streamline integrator, the
    ear clipper, the profile interpolation, the sky model). The rest check wiring and contracts that
    cannot be run without a renderer. */
{

/* ── ⑨ the split gate learned about the standalone pages ────────────────────────────────── */
test('#R218 ⑨ a module reached only by a page <script src> counts as reachable, and only that way', () => {
  const s = read('scripts/static-checks.mjs');
  assert.match(s, /for \(const page of \['sources\.html', 'science\.html', 'admin\.html', 'privacy\.html', 'terms\.html'\]\)/,
    'the reachability scan does not read the standalone pages');
  /* ⚠ read the check WITHOUT its comments: the two file names appear in the note that explains why
     the scan reads the pages, and that note is the thing this test is here to protect (#R216). */
  assert.equal(/page-i18n|sources-list/.test(codeOnly(s)), false,
    'the two modules are exempted by name instead of being found in the page that loads them');
});
}

/* ═══ from tests/r236-checks.test.mjs (tests #9 of 14) ═══
    R236 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).

    ⚠⚠ AND THE FIRST GROUP DRIVES THE REAL SCHEDULER RATHER THAN GREPPING FOR IT.
    #R235's own lesson was that `_pathDeg`'s unit test passed while the caller threw
    its result away — «関数を検査しても配線は検査されない». The runtime is an
    ES module with one export, so the honest check is to RUN it: stub the four
    globals it touches, pump the frame clock by hand, and count. */
{

/* ── 4a · the specification is not allowed to drift away from the directory ──────────────────── */
test('R236 docs: Architecture.md §3 still describes every file in js/', () => {
  /* 「現状にそぐわない記述が増加しており」 — §3 is the section that rots fastest, because a split or
     a rename leaves it silently wrong. When this check was written it described 117 modules against
     139 on disk, and the twenty-three it had never heard of included js/app-body.js (396 kB, the
     largest file in the project) and js/geo-engine.js (176 kB, the renderer seam). Both were
     MENTIONED inside other files' entries, which is exactly why nobody noticed they had none.
     ⚠ It checks membership, not prose: what a file is FOR stays hand-written. */
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/arch-files-check.mjs'), '--check'],
    { encoding: 'utf8' });
  assert.match(out, /§3 is in sync with js\//);
});
}

/* ═══ from tests/r240-checks.test.mjs (tests #9 of 9) ═══
    IntMap · R240 source-level checks
    Every assertion below is written against the MECHANISM that was wrong, not against a value this
    round happened to pick (#R203's rule). Each one fails on the tree as it stood before this round. */
{
const R = read;

/* ══ ⑥ THE BUILD STAMPS ════════════════════════════════════════════════════════════════════════ */
test('R240 ⑥ both build stamps name this round', async () => {
  /* (2026-09-25) both are written by the build from the commit being built (scripts/build-stamp.mjs) */
  assert.deepEqual(await generatedStampProblems(R('index.html')), [], 'the build stamp can go stale again');
});
}

/* ═══ from tests/r241-checks.test.mjs (tests #11 of 11) ═══
    R241 — six reports, and the one that has now been sent five times
    ① 「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において
       対応が完璧かどうか点検し、未了点があれば修正して。いつまでたっても言語対応の漏れが見つかる
       ことは許されない。」
    ② 「地震シミュレータの地震波伝播は断層破壊を考慮していない。震央からほぼ同心円状に広がるだけ。」
       → 「いや破壊速度 Vr ≤ 波速 Vだから同心円でオッケーですってどんな理屈やねんアホ」
    ③ 「サイドバーのパネル内モバイル版で、左に合ったスクロールバーが消えているから、つけて。」
    ④ 「MapLibreで大気にもやがかかりすぎ。地図をちゃんと見せろ。それに、ある程度までズームしたら
       いきなりもやが消えるものさらに不自然。」＋「衛生写真ではあっても、標準マップでは大気はなし」
    ⑤ 「各地の表内のJMAの背景の四角は、JMAで大きさをそろえるように。MMIはまた別の幅。」
       → 「左右に大きすぎに見えただけ。（テキストがとっている幅の割に）」
    ⑥ 「地震シミュレータの地点表が左右方向にスクロールできなくなっている。」

    ⚠ Every assertion here is written against a MECHANISM, and comments are stripped before the
    source is matched (`code()`), because this file quotes the instructions it is testing —
    [[intmap-recurring-lessons]] E, eight rounds running. */
{
const R = read;

/* ══ THE BUILD STAMPS — two of them, and they only ever fail after DEV-NOTES is written ════════ */

test('R241 the build stamps moved together', async () => {
  /* ⚠ (#R242) THIS WAS TWO LITERALS AND IT ASKED THE WRONG QUESTION. Pinned to `R241`, it fails on
     the next round for a reason that is not a defect — and every previous round's copy of it would
     fail with it, so the only way to keep the suite green is to edit them all. What the round
     actually wants held is a RELATION: the two stamps name the same round, and that round is the
     newest one in DEV-NOTES (#R207 ⑬ and #R219 ⑪ state the second half; this states the first).
     Same rule as every other pin that broke on a change that kept its meaning (#R205, #R207). */
  /* (2026-09-25) the relation is kept by the build now: it fills both stamps with the SAME value, the
     stamp of the commit being built (scripts/build-stamp.mjs). */
  assert.deepEqual(await generatedStampProblems(R('index.html')), [], 'the build stamp can go stale again');
});
}

/* ═══ from tests/r261-checks.test.mjs (tests #13 of 13) ═══
    #R261 — source-level checks
    One test per defect this round measured, in the shape the measurement took.
    Source assertions (no browser): the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here.

    ⚠ (#R283) EVERY ASSERTION BELOW IS ABOUT THE CONTENT OF A FILE, SO IT READS THE
    CONTENT. This file used to read the bytes the checkout produced, and ③ demands a
    line break at a named place — which on a CRLF working copy has a carriage return
    in front of it, so ③ has been red on Windows and green in CI ever since #R275 gave
    it that shape. See scripts/eol.mjs: the line break ③ requires is still required,
    and nothing else moved.

   (layer-manifest) which layers exist, and their facts */
{

/* ── ⑬ the build stamps ─────────────────────────────────────────────────────────────────────────
   ⚠⚠ (#R262) THIS PINNED THE LITERAL 'R261' AND BROKE THE VERY NEXT ROUND. #R262 bumped the stamp,
   as every round must, and this test went red for doing the right thing — the sixth time in two
   rounds that a per-round check froze a literal instead of the property it meant (r202 ③c, r212 ①,
   r246 ③, r254 ⑦, r258 ⑩, and now this one, which was MINE).
   What a round can honestly assert about the stamps is that they AGREE and that they never go
   backwards past the round that wrote them; tests/r169-checks already owns the format and the
   monotonicity, so this keeps only the part that is about #R261: the two markers name one round,
   and it is not older than #R261. */
test('R261 ⑬: both build markers name one round, and it is not older than R261', async () => {
  /* (2026-09-25) both markers are filled by the build from the commit (scripts/build-stamp.mjs) */
  assert.deepEqual(await generatedStampProblems(read('index.html')), [], 'the build stamp can go stale again');
});
}

/* ═══ from tests/r264-checks.test.mjs (tests #7 of 7) ═══
    #R264 — source-level checks
    One test per defect this round measured, in the shape the measurement took.
    Source assertions (no browser): the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here. */
{

/* ── ⑦ both build stamps name this round ────────────────────────────────────────────────────────
   #R260's lesson: adding a DEV-NOTES round without bumping BOTH stamps in index.html fails the
   static checks, and it has now happened twice. */
test('R264 ⑦: the two build stamps name the newest DEV-NOTES round', async () => {
  /* (2026-09-25) #R260's lesson — a record written without bumping BOTH stamps — cannot happen once
     nobody bumps them: the build writes both from the commit being built (scripts/build-stamp.mjs). */
  assert.deepEqual(await generatedStampProblems(read('index.html')), [], 'the build stamp can go stale again');
});
}

/* ═══ from tests/r275-checks.test.mjs (tests #12 of 12) ═══
    IntMap · #R275 source checks
    「地形編集・水流で地形のポップアップのUI、他の凡例やポップアップに比べて内部要素のサイズが大きすぎる。
      また、ツールは上部にスティックしろ。」
    「地形編集・水流を開くと勝手にズームするのを辞めろ。」
    「気象警報はまだ対応していない国は、灰色斜線で、発令されていないだけの地域は灰色に。」
    「今発表されている警報欄は、一国一行までにしろ。」
    「水流シミュレーションの解像度が低すぎる。また、一回きりの水源、再生できない。ふざけるな。
      一回きりと継続の差は、水が継続的に発生し続けるか否かしかないようにするべき。ふざけるな。」
    「警報レイヤー、日本以外でも区分単位、発令単位ごとに色分けしろ。…対応国も増やせ。更新が遅すぎる。
      リアルタイムにと言っている。ソースは一国一ソース。…GDACSを完全に撤廃しろ。また、押した地点の
      警報情報が別ポップアップで出るようにしろ。」

    ⚠ EVERY ASSERTION HERE IS ABOUT A PROPERTY, NOT ABOUT A NUMBER OR A CALL SITE. Twelve consecutive
    rounds have had a previous round's test pin a literal and turn a correct change into a false
    regression — this round fixed nine of them. So: the panel's scale is checked as «one declaration
    used everywhere», not as «30 px»; the source model as «one delivery mechanism», not as one line.

   (#R308 追記2) 5本が同じ1行を逐語で固定していたので、規則ごとに1つの読み手へ — tests/wash-tier.mjs */
{

/* ── ⑫ the build marks name this round ──────────────────────────────────────────────────────── */
test('R275 ⑫ both build markers name a round no older than R275', async () => {
  /* ⚠ THE TWO STAMPS, NOT EVERY «R###» IN THE FILE — index.html is full of round tags in comments.
     (2026-09-25) both are filled by the build from the commit being built (scripts/build-stamp.mjs). */
  assert.deepEqual(await generatedStampProblems(read('index.html')), [], 'the build stamp can go stale again');
});
}
