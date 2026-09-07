// R301 source-level regression checks.
//
// The round: `tests/r210-checks.test.mjs` and `tests/r211-checks.test.mjs` were never in the
// `test:checks` list, so from the rounds that wrote them until now neither had ever been executed.
// r210 would have passed. r211 was RED — five of its twelve tests — and nothing printed it.
//
// The cure this round wrote — a hand-maintained list, and a guard comparing it against tests/ —
// was itself retired by #R529: `test:checks` now discovers `tests/**/*.test.mjs`, so there is no
// list for a file to be left out of. «Is this file listed?» is no longer a question anything can
// ask, and the checks that asked it (①–④ here) went with the list.
//
// Everything below is a RELATION, per the standing practice — and where a relation is about a piece
// of machinery, the machinery is RUN rather than grepped for. #R298 paid for the difference: a
// check that asks 「is the call written?」 is green while the call returns early on every device.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ⑤ the revived r211 asserts RELATIONS, derived from the repository ──────────────────── */
/* ⚠ ASKED IN THE POSITIVE ONLY, ON PURPOSE. The obvious version of this test — 「tests/r211 no
   longer contains `collectPond(`, `label:'➤'`, `for(const mult of [`」 — cannot work: the rewritten
   r211 names every one of those spellings, in the comment explaining why it stopped pinning it and
   in the assertion that it has not come back. A check written that way hits its own prose, which
   this project has now done more than twenty times. What is checkable is the shape of what
   REPLACED them: a construct that reads the repository cannot be satisfied by a literal. */
test('#R301 ⑤ the revived r211 derives its assertions instead of pinning spellings', () => {
  const r211 = read('tests/r211-checks.test.mjs');
  assert.match(r211, /\[\.\.\.code\.matchAll\(\/\\bfetch\\\(\/g\)\]/,
    'the fetch guard is swept over every call site rather than four named throws');
  assert.match(r211, /readdirSync\(new URL\('\.\.\/js\/locales\//,
    'the science page is asked about every language the app ships, not about five');
  assert.match(r211, /const pushesFirst =/, 'undo is asserted as an ORDER, not as a signature');
  assert.match(r211, /matchAll\(\/kind:'\(\[a-z\]\+\)'\/g\)/, 'the vector kinds are read off the file');
  /* and it records what it cost, so the next reader does not have to re-derive it */
  assert.match(r211, /THIS FILE WAS NEVER RUN/, 'the header says why five of its tests were red');
});

/* ── ⑥ the defect the revived file found: no fetch in world-packs reads a body it did not check ── */
test('#R301 ⑥ the crop cell read checks its status, so an outage cannot read as «no cultivation»', () => {
  const src = read('js/world-packs.js');
  const i = src.indexOf("GAEZ+'/identify?");
  assert.ok(i > 0, 'the crop identify call is still there');
  const body = src.slice(i, i + 700);
  /* ⚠ THE ORDER IS THE POINT. ArcGIS answers an outage two ways: an HTTP status, and 200 with an
     error body. Both have to be asked BEFORE `j.value` is read, because the line that reads it
     prints 「no cultivation recorded in this cell」 for a null — a server error handed to the reader
     as a measured fact about the ground. */
  const ok = body.indexOf('if(!r.ok) throw'), errBody = body.indexOf('j.error) throw'), val = body.indexOf('const v=j&&j.value');
  assert.ok(ok >= 0, 'the HTTP status is checked');
  assert.ok(errBody >= 0, 'and the 200-with-an-error-body case is checked');
  assert.ok(val >= 0, 'and the value is still read');
  assert.ok(ok < val && errBody < val, 'both are checked BEFORE the value is read');
  assert.match(src.slice(i, i + 1400), /no cultivation recorded in this cell/,
    'the sentence that must never be printed for an outage is the one downstream of these guards');
});

/* ── ⑦ the round is written down where the next session will look ─────────────────────────────── */
test('#R301 ⑦ the round is in DEV-NOTES, and the two build stamps name it', () => {
  const dn = read('DEV-NOTES.md');
  assert.match(dn, /R301/, 'DEV-NOTES has this round');
  /* ⚠ (#R302) BOTH STAMPS NAME **THIS** ROUND, AND 「THIS」 IS NOT A LITERAL. These two lines read
     `='R301'` and `-R301'`, which every subsequent round breaks by doing the one thing #R174 requires
     of it — bumping them. The relation is what #R174 actually wrote down: the two stamps name the
     SAME round, and it is the newest round DEV-NOTES has. */
  const idx = read('index.html');
  const a = /window\.__imBuild='R(\d+)';/.exec(idx);
  const b = /window\.INTMAP_BUILD='[0-9-]+-R(\d+)';/.exec(idx);
  assert.ok(a, 'the first build stamp names a round');
  assert.ok(b, '…and so does the second');
  assert.equal(a[1], b[1], 'and they name the SAME round — the pair #R174 found three rounds apart');
  const newest = Math.max(...[...dn.matchAll(/^## R(\d+)/gm)].map((x) => Number(x[1])));
  assert.equal(Number(a[1]), newest, 'and it is the round DEV-NOTES leads with');
});
