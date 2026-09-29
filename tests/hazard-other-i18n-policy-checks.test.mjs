/* ============================================================================
 *  LANGUAGES — every language is held to the policy (one test, ~80 s)
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r241-checks.test.mjs (tests #4 of 11) ═══
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

test('R241 ① every language is held to the policy, and the universe is the bigger one', async () => {
  const out = JSON.parse(execFileSync(process.execPath,
    [join(ROOT, 'scripts', 'i18n-audit.mjs'), '--json'], { encoding: 'utf8' }));
  /* ⚠ (#R707) the bar is read from scripts/lang-policy.mjs, not kept as a second copy of it —
     see the note on ① . Authored languages 100 %, carried languages at or above their floor. */
  const { authoredLangs, carriedLangs } = await import('../scripts/lang-policy.mjs');
  const AUTHORED = new Set(authoredLangs(ROOT));
  const CARRIED = new Set(carriedLangs(ROOT));
  const FLOOR = JSON.parse(readLF(join(ROOT, 'tests', 'i18n-coverage-floor.json'))).langs;
  let seenA = 0, seenC = 0;
  for (const r of out.rows) {
    const surfaces = ['keyed', 'inline', 'positional', 'pages'].filter((k) => r[k]);
    if (AUTHORED.has(r.code)) { for (const k of surfaces) { assert.equal(r[k][0], r[k][1], `${r.code}: ${k} — IntMap authors this language`); seenA++; } }
    else if (CARRIED.has(r.code)) { const f = FLOOR[r.code] || {}; for (const k of surfaces) { if (f[k] == null) continue; assert.ok(r[k][0] >= f[k], `${r.code}: ${k} fell to ${r[k][0]}, below the floor of ${f[k]}`); seenC++; } }
    else assert.fail(`${r.code} is neither authored nor carried by scripts/lang-policy.mjs`);
  }
  assert.ok(seenA > 0 && seenC > 0, 'one side of the policy measured nothing');
  assert.equal(out.positionalArrays, 0, 'no tuple is held as data');
  /* ⚠ AND THE COUNTS MAY NOT SHRINK. A round that "fixes" a gap by making the instrument see less
     is the failure this file exists to prevent — the inline universe was 2,136 before this round
     and the positional one 2,195. */
  const inline = out.rows.find((r) => r.code === 'fr').inline[1];
  const positional = out.rows.find((r) => r.code === 'de').positional[1];
  assert.ok(inline >= 2324, `the inline universe is ${inline}; it was 2,324 when this was written`);
  assert.ok(positional >= 2413, `the positional universe is ${positional}; it was 2,413`);
});
}
