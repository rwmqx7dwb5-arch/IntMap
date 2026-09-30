/* ============================================================================
 *  VOLCANOES — check:docs goes red when a document misstates the bundled record
 * ----------------------------------------------------------------------------
 *  One test, kept apart because it runs the documentation gate against mutated documents (~2 minutes).
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r353-checks.test.mjs (tests #14 of 15) ═══
    #R353 — Volcano Intelligence: the bundled record, the joins, and the two feed parsers
    「現在はGVPの完新世火山1,215座を全部入れてありますが、視覚上の主要分類は「1950年以降」
     「1500年以降」「古い／不明」です。ここは恐ろしく深くできます。」

    What a failure here means, in order of severity:
      · ④/⑤ a join table naming a GVP number the catalog does not have = a country's alert levels,
        or a survey's hazard zones, silently attach to nothing and the map draws grey for them
      · ⑥/⑦ a feed parser that stops reading its upstream = the live rungs of the status ladder go
        quiet while the UI keeps saying "reading…" — the shape #R209 exists to prevent
      · ①–③ the bundled record losing its join key or its ordering = every card is wrong at once
      · ⑧/⑭ the count written into prose again = a label that disagrees with the file it describes
      · ⑨ the modules falling back into the eager bundle = every session pays for a card most
        readers never open

    ⚠ (#R440) ⑧ AND ⑭ GUARD TWO DIFFERENT NUMBERS AND SWEEP DIFFERENTLY. ⑧ is the VOLCANO count and
    reads CODE — it strips block comments, because a header may cite the measurement. ⑭ is the
    ERUPTION count and does not strip anything, because all four places that number was written
    down were block comments, and the six languages that stated it on sources.html are locale files
    ⑧ never opened. ⑮ then proves the document half of the same guard actually goes red.

    ⚠ ⑥ and ⑦ run against supabase/functions/_shared/volcano-parse.js — the code the EDGE FUNCTION
    runs — over answers captured from both upstreams (tests/fixtures/). A regex scraper of somebody
    else's feed is exactly the kind of code that gets believed instead of tested. */
{
/* ⚠ #R317: read source text through readLF so a CRLF working copy cannot make a source check
   permanently red on Windows and permanently green on CI. */
const { readLF } = await import('../scripts/eol.mjs');
const { scratchTree } = await import('./helpers/scratch-tree.mjs');
const DETAIL = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'volcano-detail.json.gz'))).toString('utf8'));

/* ── ⑮ the document rule added with this one really goes red (#R440) ──
   `npm run check:docs` grew a `volcano-eruptions` rule that re-derives the size of the bundled
   record from the file and demands the three documents that state it agree. A rule nobody has
   watched fail is indistinguishable from a rule that never runs — #R428 shipped one of those and
   found out in production — so each half is made wrong on disk once and the gate must name it.
   ⚠ (mutation-tests-off-tree) THE FACTS ARE BROKEN IN A PRIVATE COPY OF THE CHECKOUT
   (tests/helpers/scratch-tree.mjs), never in the working tree: `node --test` runs the files in
   parallel, and a mutant written in place is visible to every file that reads the same documents
   — the tree lock only serialised the writers, and readers that took no lock saw the mutant.
   ⚠ `--rule=` keeps this to the one rule (and skips the rules that shell out), which is what
   makes three mutations cost about three seconds instead of thirty. */
test('#R353 ⑮ check:docs goes red when a document misstates the size of the bundled record', () => {
  const held = DETAIL.eruptions;
  const fmt = held.toLocaleString('en-US');
  const WRONG = '11,089';                      /* the upstream total — what all four documents said */
  assert.notEqual(fmt, WRONG, 'the bundled record now holds exactly the upstream total; pick another mutation');

  const SCRATCH = scratchTree();
  const docFacts = () => SCRATCH.node('scripts/doc-facts.mjs', ['--check', '--rule=volcano-eruptions']);

  const CASES = [
    /* the number, written the two ways these documents write it */
    { file: 'PRODUCT.md', from: fmt + ' 件の噴火履歴', to: WRONG + ' 件の噴火履歴' },
    { file: 'docs/FILES.md', from: '噴火履歴' + fmt + '件', to: '噴火履歴' + WRONG + '件' },
    /* …and the other half: a document that stops stating it at all */
    { file: 'docs/VOLCANO-INTELLIGENCE.md', from: fmt + ' 件の噴火履歴', to: '噴火履歴' },
  ];

  /* the precondition is asked of the same copy the mutations run in */
  assert.equal(docFacts().code, 0, 'volcano-eruptions is already red on the committed tree');
  for (const c of CASES) {
    /* ⚠ #R286/#R317: match on LF text; the copy gets its ORIGINAL BYTES back after the run. */
    const original = readLF(SCRATCH.path(c.file));
    assert.ok(original.includes(c.from), c.file + ' no longer contains «' + c.from + '»');
    const r = SCRATCH.mutate([{ file: c.file, text: original.replace(c.from, () => c.to) }], docFacts);
    assert.equal(r.code, 1, 'check:docs stayed green with ' + c.file + ' saying «' + c.to + '»');
    assert.ok(r.out.includes('volcano-eruptions'),
      'check:docs failed but never named volcano-eruptions:\n' + r.out);
  }
  assert.equal(docFacts().code, 0, 'the restore left check:docs failing in the copy');
});
}
