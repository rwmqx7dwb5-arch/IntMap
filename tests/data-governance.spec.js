/* ============================================================================
 *  #729 · 読者に届く出典の行は、同じ条件を二度言わず、一度も隠さない
 * ----------------------------------------------------------------------------
 *  #729 made each source's licence a VALUE (`lic` on js/reference-data.js's DATA_SOURCES rows) and
 *  had the reader-visible sentence DERIVED from it. That creates one display hazard, in both
 *  directions, and only the built page can show which way it fell:
 *
 *    ⚠ SAYING IT TWICE — most rows that can now state their terms have ALWAYS stated them in prose
 *      («…ライブ取得（ODbL）»). MEASURED over the real rows with the first rule, which compared the
 *      WHOLE value: of the 63 rows carrying a value, 37 would have appended it and 18 of those were
 *      already saying it, because the prose names the licence WITHOUT its version.
 *    ⚠ HIDING IT — the fix is a comparison on the licence NAME, and a name is a prefix of other
 *      names: 「CC BY」 begins 「CC BY-NC-SA」. A plain substring test would let a row whose prose says
 *      CC BY-NC-SA 4.0 swallow a value of CC BY 4.0, and the reader would be shown somebody else's
 *      terms in place of this row's. HIDING TERMS IS THE WORSE FAILURE — it is the one #R689 shipped
 *      (Pleiades rows under CC BY 3.0 with no credit on any reader-facing page).
 *
 *  ⚠ THIS MEASURES THE RENDERED PAGE, not the predicate. The predicate lives inside the module's
 *  closure, and a test that re-implemented it would be a second opinion agreeing with itself
 *  ([[intmap-co-designed-reader-cannot-falsify]]). What a reader is shown is the fact.
 *
 *  ⚠⚠ AND THE SUBJECT IS THE DERIVED SENTENCE, NOT THE WHOLE ENTRY. MEASURED on the built page:
 *  nine entries name one licence twice across their NAME and their description — «historical-basemaps
 *  (aourednik) — GPL-3.0» followed by a Japanese description that also says GPL-3.0. Those pairs
 *  predate this round, live in prose this round did not author, and rewriting reader-visible text to
 *  make a test pass would be a change nobody asked for (AGENTS.md §3-2). What #729 owns is whether
 *  the sentence it DERIVES repeats what that same sentence already said.
 *
 *  ⚠ THIS PAGE IS LOADED IN ENGLISH, AND `NAME` BELOW KNOWS ENGLISH SPELLINGS ONLY — so it could not
 *  see the Japanese page state 「パブリックドメイン」 and then 「— Public domain」 on four rows (measured
 *  on production 2026-09-26). Every row × every language, with the names each language gives a
 *  licence read from the vocabulary rather than written here, is tests/licence-stated-once-checks.test.mjs.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

/* Licence NAMES — no versions. Not a statement of anybody's terms: it is how a name is recognised
   inside a sentence, so that 「the same one twice」 can be asked at all. */
const NAME = /\b(CC0|CC BY(?:-[A-Z]{2})*|ODbL|ODC-BY|OGL|GPL-\d|MIT|Apache|Public domain)\b/i;

/* The derived tail, as the page renders it: the sentence's last « — X ». */
async function derivedTails(page) {
  return page.evaluate(() => {
    const out = [];
    for (const u of document.querySelectorAll('.pg-use')) {
      const t = (u.textContent || '').trim();
      const i = t.lastIndexOf(' — ');
      if (i < 0) continue;
      out.push({ head: t.slice(0, i), tail: t.slice(i + 3), whole: t });
    }
    return out;
  });
}

test('#729 ① 派生した出典の行は、その同じ文が既に述べたライセンスを繰り返さない', async ({ page }) => {
  await page.goto('/sources.html', { waitUntil: 'load' });
  const rows = await derivedTails(page);
  expect(rows.length, 'no source sentence rendered at all — this case measured nothing').toBeGreaterThan(50);

  const repeated = [];
  let carrying = 0;
  for (const r of rows) {
    const m = NAME.exec(r.tail);
    /* only a tail that BEGINS with a licence name is the derived one; a sentence that happens to
       end in an em-dash clause of its own is not this mechanism's output */
    if (!m || m.index !== 0) continue;
    carrying++;
    const stem = m[1].toLowerCase();
    const hay = r.head.toLowerCase();
    for (let k = hay.indexOf(stem); k >= 0; k = hay.indexOf(stem, k + 1)) {
      /* a letter or hyphen after the name means the prose named a DIFFERENT, longer licence */
      if (!/[a-z-]/.test(hay.charAt(k + stem.length))) { repeated.push(stem + ' :: ' + r.whole.slice(0, 100)); break; }
    }
  }
  /* ⚠ THE MECHANISM HAS TO BE LIVE FOR THE ABOVE TO MEAN ANYTHING. A suppression rule that grew too
     eager would empty this out and every assertion about repetition would pass vacuously. */
  expect(carrying, 'not one sentence carries a derived licence — the mechanism is silent, so 「二度言わない」 is vacuous').toBeGreaterThan(5);
  expect(repeated, 'these sentences state the same licence twice:\n' + repeated.join('\n')).toEqual([]);
});

test('#729 ② 行が持つ条件は、別のより長いライセンス名に飲み込まれない', async ({ page }) => {
  await page.goto('/sources.html', { waitUntil: 'load' });
  const body = await page.evaluate(() => document.body.innerText || '');
  /* Both families are named on this page, which is what makes the prefix hazard real rather than
     hypothetical: 「CC BY」 and 「CC BY-NC-SA」 both appear, and a substring test could not tell them
     apart. If either disappears from the page this assertion stops being about anything, and it
     says so rather than passing quietly. */
  expect(/\bCC BY\b(?!-)/i.test(body), 'a plain CC BY licence is named nowhere on the page').toBe(true);
  expect(/\bCC BY-[A-Z]{2}/i.test(body), 'no compound CC BY licence is named on the page').toBe(true);

  /* …and no sentence shows a compound licence as the TAIL of a row whose own prose named the plain
     one, which is what swallowing would look like from the reader's side. */
  const rows = await derivedTails(page);
  const swallowed = rows.filter((r) => /^CC BY-[A-Z]{2}/i.test(r.tail) && /\bCC BY\b(?!-)/i.test(r.head));
  expect(swallowed.map((r) => r.whole.slice(0, 100)), 'a row states a plain CC BY and is shown a stricter one').toEqual([]);
});
