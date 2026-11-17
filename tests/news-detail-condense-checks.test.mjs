/* ============================================================================
 *  news-detail-condense — the event detail says each thing once, and folds the rest
 * ----------------------------------------------------------------------------
 *  The reader (2026-11-17): the skeleton is right (every sentence names its source), but the page
 *  repeats itself — the AI summary, the evidence and each outlet's quote all said «the three leaders
 *  will meet»; «CNBC reported last» is a publishing status, not what was learned; the source list
 *  repeated near-identical headlines from one outlet. ⇒ what is already on screen is MEASURED
 *  (js/news-brief.js novelty/condenseGist/latest/groupCoverage) and the rest is folded, not deleted.
 *
 *  These checks EVALUATE the rules with fixtures shaped like production descriptions; the one
 *  source-reading check at the end pins that the UI calls those rules and folds rather than drops.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { makeNewsClaims } = await import('../js/news-claims.js');
const { makeNewsBrief } = await import('../js/news-brief.js');
const B = makeNewsBrief(makeNewsClaims());

const m = (o) => ({
  id: o.id || 1, title: o.title || '', description: o.description || '', url: o.url || 'https://example.org/' + (o.id || 1),
  sourceId: o.sourceId || 'x', sourceName: o.sourceName || 'X', family: o.family || o.sourceId || 'x',
  publishedAt: o.publishedAt || '2026-11-16T00:00:00Z',
});

/* The reported page: a summit, three outlets, a late CNBC piece. */
const SUMMARY = [
  'The leaders of Japan, South Korea and China will meet in Tokyo next week to discuss trade and regional security.',
  'It will be the first trilateral summit since 2024.',
];
const SUMMIT = [
  m({ id: 1, sourceId: 'bbc', family: 'bbc', sourceName: 'BBC', publishedAt: '2026-11-16T01:00:00Z',
    title: 'Japan, South Korea and China leaders to meet in Tokyo',
    description: 'The leaders of Japan, South Korea and China will meet in Tokyo next week to discuss trade and regional security.' }),
  m({ id: 2, sourceId: 'bbc', family: 'bbc', sourceName: 'BBC', publishedAt: '2026-11-16T01:40:00Z',
    title: 'Japan, South Korea and China leaders to meet in Tokyo next week',
    description: 'The three leaders will meet in Tokyo next week to discuss trade and regional security, officials said.' }),
  m({ id: 3, sourceId: 'f24', family: 'f24', sourceName: 'France 24', publishedAt: '2026-11-16T02:00:00Z',
    title: 'Tokyo to host first trilateral summit since 2024',
    description: 'Japan, South Korea and China will hold their first trilateral summit since 2024 in Tokyo next week.' }),
  m({ id: 4, sourceId: 'yon', family: 'yon', sourceName: 'Yonhap', publishedAt: '2026-11-16T02:30:00Z',
    title: 'Summit agenda to include a 15 billion dollar currency swap line',
    description: 'Seoul said the agenda would include a proposed currency swap line worth 15 billion dollars and North Korea policy.' }),
  m({ id: 5, sourceId: 'cnbc', family: 'cnbc', sourceName: 'CNBC', publishedAt: '2026-11-16T09:00:00Z',
    title: 'Tokyo summit moved up to December 3 as leaders confirm attendance',
    description: 'The summit has been moved forward to December 3, and all three leaders have confirmed they will attend in person.' }),
];

test('novelty: a quote that only restates the summary is covered; one with a new fact or number is not', () => {
  const restate = B.novelty('The three leaders will meet in Tokyo next week to discuss trade and regional security, officials said.', SUMMARY);
  assert.equal(restate.covered, true, 'a near-restatement of the summary was treated as new: ' + JSON.stringify(restate));
  const swap = B.novelty('Seoul said the agenda would include a proposed currency swap line worth 15 billion dollars and North Korea policy.', SUMMARY);
  assert.equal(swap.covered, false, 'a quote with new facts was folded');
  assert.ok(swap.newNumbers.includes('15'), 'the new number was not found');
  /* a number nobody stated before keeps a line in front even when its words are all already there */
  const num = B.novelty('The leaders of Japan, South Korea and China will meet in Tokyo on 3 December.', [SUMMARY[0] + ' They will meet in December.']);
  assert.equal(num.covered, false, 'a new date was hidden because the words overlapped');
  /* unmeasurable is not «already said» */
  assert.equal(B.novelty('—', SUMMARY).covered, false);
  assert.equal(B.novelty('Anything at all here.', []).covered, false, 'with nothing on screen yet nothing is covered');
  /* text without spaces is measured too (bigrams), not waved through or folded blindly */
  const ja = B.novelty('日本と韓国と中国の首脳が来週東京で会談する。', ['日本と韓国と中国の首脳が来週東京で会談する予定だ。']);
  assert.equal(ja.covered, true, 'an unspaced restatement was not measured: ' + JSON.stringify(ja));
});

test('condenseGist: restating quotes fold, new-angle quotes stay in front, order and sources kept, nothing dropped', () => {
  const gist = B.gist(SUMMIT);
  assert.ok(gist.length >= 3, 'fixture should yield several quotes: ' + JSON.stringify(gist.map((g) => g.text)));
  const cg = B.condenseGist(gist, SUMMARY);
  assert.equal(cg.shown.length + cg.folded.length, gist.length, 'a quote was lost rather than folded');
  const shownSrc = cg.shown.map((g) => g.source);
  assert.ok(shownSrc.includes('Yonhap'), 'the outlet that added the swap line was folded');
  assert.ok(cg.folded.some((g) => g.source === 'BBC'), 'the quote that repeats the summary word for word stayed in front');
  for (const g of [...cg.shown, ...cg.folded]) assert.ok(g.source && g.text, 'a quote lost its source');
  /* order among the shown lines is the published order */
  const idx = cg.shown.map((g) => gist.findIndex((x) => x.text === g.text));
  assert.deepEqual(idx, idx.slice().sort((a, b) => a - b));

  /* without an AI summary the first quote plays the summary: always shown */
  const solo = B.condenseGist(gist, []);
  assert.equal(solo.shown[0].text, gist[0].text);
});

test('latest: leads with what the late report newly said, not «X reported last»', () => {
  const u = B.latest(SUMMIT);
  assert.ok(u, 'a report 8 hours later with a new date was not called an update');
  assert.equal(u.source, 'CNBC');
  assert.ok(u.learned.length >= 1, 'nothing learned was extracted');
  assert.match(u.learned[0].text, /December 3/, 'the lead line is not the new fact: ' + u.learned[0].text);
  assert.ok(u.learned[0].newNumbers.includes('3'), 'the new date number was not found');
  assert.equal(u.text, u.learned[0].text);

  /* a late report from a NEW outlet that only repeats the earlier ones is not an update any more */
  const echo = B.latest([
    ...SUMMIT.slice(0, 1),
    m({ id: 9, sourceId: 'cnbc', family: 'cnbc', sourceName: 'CNBC', publishedAt: '2026-11-16T09:00:00Z',
      title: 'Japan, South Korea and China leaders to meet in Tokyo',
      description: 'The leaders of Japan, South Korea and China will meet in Tokyo next week to discuss trade and regional security.' }),
  ]);
  assert.equal(echo, null, 'a newcomer that adds nothing was reported as «the latest report added»');
});

test('groupCoverage: one representative per family, the rest folded under it, near-identical headlines from other families as echoes', () => {
  const extra = m({ id: 6, sourceId: 'afp-copy', family: 'afpc', sourceName: 'Japan Today', publishedAt: '2026-11-16T03:00:00Z',
    title: 'Tokyo to host first trilateral summit since 2024' });
  const groups = B.groupCoverage([...SUMMIT, extra]);
  const leads = groups.map((g) => g.lead.sourceName);
  assert.deepEqual(leads, ['BBC', 'France 24', 'Yonhap', 'CNBC'], 'leads are one per family in published order');
  const bbc = groups[0];
  assert.equal(bbc.lead.id, 1, 'the representative is the family\'s first article');
  assert.deepEqual(bbc.more.map((x) => x.id), [2], 'the second BBC article was not folded under BBC');
  const f24 = groups[1];
  assert.deepEqual(f24.echoes.map((x) => x.sourceName), ['Japan Today'], 'an identical headline from another family was not folded as an echo');
  const all = groups.flatMap((g) => [g.lead, ...g.more, ...g.echoes]).map((x) => x.id).sort();
  assert.deepEqual(all, [1, 2, 3, 4, 5, 6], 'an article disappeared from the list');
  /* different headlines from different families are never folded together (independent reports) */
  assert.equal(groups.find((g) => g.lead.sourceName === 'Yonhap').echoes.length, 0);
});

test('the detail page calls those rules and folds instead of deleting', () => {
  const ui = readFileSync(join(ROOT, 'js/news-events.js'), 'utf8');
  const open = ui.slice(ui.indexOf('function openDetail(item)'), ui.indexOf('window._imReader = {'));
  assert.match(open, /BRIEF\.condenseGist\(/);
  assert.match(open, /BRIEF\.groupCoverage\(/);
  assert.match(open, /u\.learned/);
  /* the folded quotes, same-family articles and the mechanism text are inside <details>, not removed */
  assert.match(open, /<details class="ev-fold"><summary>'[\s\S]*for \(const g of cg\.folded\)/);
  assert.match(open, /<details class="ev-fold ev-cov-more"><summary>'[\s\S]*for \(const m of g\.more\) html \+= covRow\(m, true/);
  assert.match(open, /<details class="ev-d-sec ev-why ev-fold"><summary>/);
  /* the up-front explanation is one line; the long machine-check text lives only in the folded block */
  const iLong = open.indexOf('The program does not check that the sentence states');   /* (integrate) the accurate wording news-quality wrote */
  const iWhy = open.indexOf('<details class="ev-d-sec ev-why ev-fold">');
  assert.ok(iLong > iWhy, 'the long verification text is still printed above the fold');
  assert.doesNotMatch(open, /became the newest outlet to report this/, '«X reported last» is back as the update');
});
