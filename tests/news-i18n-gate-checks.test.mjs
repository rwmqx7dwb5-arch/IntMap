/* ============================================================================
 *  IntMap · the translation gate — every language held to what scripts/lang-policy.mjs says of it
 * ----------------------------------------------------------------------------
 *  #R239 が作った翻訳の門と、それが本当に門であること。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatedStampProblems } from './helpers/build-stamp.mjs';
import { npmTestRunsScript } from './helpers/ci-reach.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

/* ════════ #R239 — from tests/r239-checks.test.mjs (7 of its 16 tests) ════════ */
{
/* ============================================================================
 *  #R239 — the translation gate, the dock, and the rupture's trailing front
 * ----------------------------------------------------------------------------
 *  ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). The three that do NOT
 *  fail on the old tree are marked where they are, and each is a proof rather than a diff: they
 *  state a property the new code has to keep, not a line it happens to contain.
 * ==========================================================================*/
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');
/* (#R208/#R215) comments quote the instruction, and the instruction contains the very strings these
   tests look for — so every syntax check reads the file with its comments stripped. */
const code = (p) => codeOnly(R(p));
const run = (f, ...a) => execFileSync(process.execPath, [join(ROOT, 'scripts', f), ...a],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
/* (tests-by-topic) ① and ④ below both ask the SAME audit of the SAME tree, and each run costs
   ~35–50 s. Asked once per process and handed to both — the answer cannot differ between them, and
   running it twice put this file over a minute. */
let _audit = null;
const auditJSON = () => _audit || (_audit = JSON.parse(run('i18n-audit.mjs', '--json')));

/* ══ ① THE GATE — every language, every surface, one exit code ═══════════════════════════════════
   「今後言語を追加するのが完璧に100%にできるような仕組みを作っておいて。今回のように、いつまでたっても
     言語対応の漏れが見つかることは許されない。」 */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R239 ① every language is held to what scripts/lang-policy.mjs says of it', async () => {
  const a = auditJSON();
  assert.ok(a.rows.length >= 9, 'the audit sees every registered language');
  /* ⚠⚠⚠ (#R707) THIS ASSERTED A POLICY THAT NO LONGER EXISTS, AND IT ASSERTED IT FROM A SECOND
     COPY. The 2026-09-11 amendment (CONSTITUTION.md §7) narrowed what IntMap AUTHORS to en + jp
     and holds the other seven to a FLOOR instead of 100 % — narrowing what is written next is not
     licence to delete what is written already, so the seven may not DROP, but a new English-only
     string is allowed because it lowers no count. scripts/i18n-audit.mjs enforces exactly that and
     stayed green; this file kept the pre-amendment rule and went red for two strings written the
     way the amendment asks.
     ⚠ THE FIX IS NOT TO LOWER THE BAR — IT IS TO STOP KEEPING A SECOND COPY OF IT. The judgement
     lives in scripts/lang-policy.mjs; a judgement that already exists somewhere is DISTRIBUTED,
     not copied (.agents/rules/no-ad-hoc-hardcoding.md §2-3, [[intmap-recurring-lessons]] G). So the
     authored set is still held to 100 % on every surface — that half is unchanged — and the
     carried set is held to the same floor the gate reads. Restore the nine (`return all;` in
     scripts/lang-policy.mjs) and this returns to «every language, 100 %» with no edit here. */
  const { authoredLangs, carriedLangs } = await import('../scripts/lang-policy.mjs');
  const AUTHORED = new Set(authoredLangs(ROOT));
  const CARRIED = new Set(carriedLangs(ROOT));
  const FLOOR = JSON.parse(readFileSync(join(ROOT, 'tests', 'i18n-coverage-floor.json'), 'utf8')).langs;
  assert.ok(AUTHORED.size > 0, 'scripts/lang-policy.mjs authors no language at all');
  let checkedAuthored = 0, checkedCarried = 0;
  for (const r of a.rows) {
    const surfaces = ['keyed', 'inline', 'positional', 'pages'].filter((k) => r[k]);
    if (AUTHORED.has(r.code)) {
      for (const k of surfaces) { assert.equal(r[k][0], r[k][1], `${r.code}: ${k} table incomplete — IntMap authors this language`); checkedAuthored++; }
    } else if (CARRIED.has(r.code)) {
      const f = FLOOR[r.code] || {};
      for (const k of surfaces) {
        if (f[k] == null) continue;
        assert.ok(r[k][0] >= f[k], `${r.code}: ${k} fell to ${r[k][0]}, below the floor of ${f[k]} — narrowing what is authored next is not licence to delete what is written already`);
        checkedCarried++;
      }
    } else { assert.fail(`${r.code} is neither authored nor carried by scripts/lang-policy.mjs`); }
  }
  /* ⚠ a check that measured nothing must not be green (#R699). */
  assert.ok(checkedAuthored > 0, 'r239 ①: no authored surface was measured');
  assert.ok(checkedCarried > 0, 'r239 ①: no carried surface was measured — the floor is asserting nothing');
  assert.equal(a.twoBranch, 0, 'no two-branch language ternary carries prose');
  assert.equal(a.orphanKeys.length, 0, 'every data-i18n key in the markup is declared somewhere');
});

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R239 ① the gate exits non-zero when a language is short — it is a gate, not a report', () => {
  /* run the audit against a doctored keyed table, in a temp copy, and require failure */
  const audit = code('scripts/i18n-audit.mjs');
  assert.match(audit, /--gate/, 'the gate flag exists');
  assert.match(audit, /process\.exit\(1\)/, 'and it exits 1');
  /* and it is wired into the suite the round runs, not only available */
  /* (gate-parity-and-shards) asked of `npm test`'s evaluated plan (tests/helpers/ci-reach.mjs), not of
     scripts/test-parallel.mjs's text: that file discovers its gates from package.json and names none. */
  assert.ok(npmTestRunsScript('i18n-audit'), 'npm test runs the translation gate');
});

/* ⚠ THIS ONE PASSES ON THE OLD TREE TOO, and is meant to: it is a property of the measurement, not
   of any file. A coverage rule that counts a copy of English as «done» is the exact defect this
   round was about, and it was one command away from shipping — so the rule itself is pinned. */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R239 ① page coverage means TRANSLATED, not merely present', () => {
  const en = R('js/locales/pages.en.js');
  const de = R('js/locales/pages.de.js');
  /* a sentence that is word-for-word English in a non-English document is not coverage */
  const s = 'Every terrain feature shares one elevation sampler.';
  assert.ok(en.includes(s), 'the English sentence is where this test thinks it is');
  assert.ok(!de.includes(s), 'and the German document does not simply carry it verbatim');
  const src = code('scripts/i18n-pages-audit.mjs');
  assert.match(src, /doc\.get\(k\) !== en\.get\(k\)/, 'coverage compares against English');
});

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R239 ① the keyed universe is every declaration site, not just ui.en.js', () => {
  const k = JSON.parse(run('i18n-keyed-audit.mjs', '--json'));
  /* js/i18n-late.js and five other modules add keys at run time; the ones that were invisible */
  assert.ok(k.want > 400, `the universe is the whole app (${k.want})`);
  const src = code('scripts/i18n-keyed-audit.mjs');
  assert.match(src, /Object[\s\S]{0,40}assign/, 'the audit reads Object.assign(i18n.x, …) sites');
  assert.match(src, /data-i18n/, 'and the keys the markup asks for');
});

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R239 ① adding a language is one command, and it writes every file the gate asks for', () => {
  const s = code('scripts/i18n-new-language.mjs');
  assert.match(s, /ui\.\$\{code\}\.js|ui\.'\s*\+\s*code/, 'it writes the app locale file');
  assert.match(s, /i18n-pages-audit\.mjs['"]\)\s*,\s*['"]--template/, 'and the reading pages');
  assert.match(s, /i18n-langs\.mjs/, 'and regenerates the generated language list');
  assert.match(s, /survey\(\)/, 'and seeds the keyed table from the WHOLE universe');
});

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R239 ④ every string the HUD prints is held to what the language policy says of it', async () => {
  const a = auditJSON();
  /* ⚠ (#R707) the bar is read from scripts/lang-policy.mjs, not kept as a second copy of it —
     see the note on ① . Authored languages 100 %, carried languages at or above their floor. */
  const { authoredLangs, carriedLangs } = await import('../scripts/lang-policy.mjs');
  const AUTHORED = new Set(authoredLangs(ROOT));
  const CARRIED = new Set(carriedLangs(ROOT));
  const FLOOR = JSON.parse(readFileSync(join(ROOT, 'tests', 'i18n-coverage-floor.json'), 'utf8')).langs;
  let seenA = 0, seenC = 0;
  for (const r of a.rows) {
    if (!r.inline) continue;
    if (AUTHORED.has(r.code)) { assert.equal(r.inline[0], r.inline[1], `${r.code}: inline table incomplete — IntMap authors this language`); seenA++; }
    else { const f = (FLOOR[r.code] || {}).inline; if (f == null) continue; assert.ok(r.inline[0] >= f, `${r.code}: inline fell to ${r.inline[0]}, below the floor of ${f}`); seenC++; }
  }
  /* ⚠ `seenA` is STRUCTURALLY zero here and that is not a gap: measured 2026-09-12, the inline
     table is the surface of exactly the four languages that are NOT carried positionally
     (fr, ko, zh, zh-hans); en and jp have no inline row to be complete on. So this surface is
     entirely about carried languages, and what it must never do is pass without looking (#R699). */
  assert.equal(seenA, 0, 'an authored language grew an inline table — this test is measuring the wrong surface');
  assert.ok(seenC > 0, 'the inline surface measured nothing at all');
  /* the HUD's strings are L(…) sites, so the inline table above covers fr/ko/zh — and the five
     positional languages are covered by the positional audit in ①. */
  assert.match(code('js/seismic.js'), /L\('Draw the rupture area','震源域を描く'/, 'the HUD uses L(…)');
});

/* ══ ⑤ THE BUILD STAMPS (#R234/#R236 — they only ever fail after the notes are written) ══════════ */
test('#R239 ⑤ both build stamps name this round', async () => {
  /* ⚠ (#R240) NOT OLDER THAN R239, rather than exactly R239 — the shape #R203 ⑦ and #R204 ⑦b already
     use. A hard pin here is a test that fails on the FOLLOWING round for doing the right thing, and
     the assertion it was making («the stamps were bumped») is kept by the floor. The two must still
     agree with each other, and tests/r207 ⑬ separately requires them to name the newest round in
     DEV-NOTES, so nothing is lost by loosening this one. */
  /* (2026-09-25) «the stamps were bumped» is kept by the build now — it writes both from the commit
     being built (scripts/build-stamp.mjs) — so what is asked is what could still break that. */
  assert.deepEqual(await generatedStampProblems(R('index.html')), [], 'the build stamp can go stale again');
});
}
