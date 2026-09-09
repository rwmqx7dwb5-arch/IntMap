/* ============================================================================
 *  R587 — 「これなに」 must not be answered by inventing a name  (tests)
 * ----------------------------------------------------------------------------
 *  A satellite view of ロジポート名古屋 (a 355,000 m² warehouse) was answered 「名古屋市中村区の八田
 *  フランテ館です。建物内にはアスティスポーツクラブ八田が入っています。(mapion.co.jp)」 — wrong
 *  building, invented tenant, and a live anchor to a page the turn never fetched.
 *
 *  ⚠⚠⚠ EVERY CHECK BELOW EVALUATES THE FUNCTION. None of them reads the source for a spelling. The
 *  round that taught this (#R505) had a check that read a file and therefore could not see the
 *  ORDER things happened in; and #R488 had one that pinned a CSS selector's spelling and went on
 *  passing after the rule it named stopped matching anything. A grep for `toFixed(2)` would pass the
 *  moment someone wrote `.toFixed(DP)` with DP=2, which is exactly the bug it claims to prevent.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeViewGround } from '../js/atlas-view-ground.js';
import { makeAtlasAnswerRender } from '../js/atlas-answer-render.js';

const G = makeViewGround();

/* ── ① THE COORDINATE MUST BE ABLE TO NAME THE BUILDING ─────────────────────────────────────── */

test('R587 ①: the coordinate handed to the model resolves finer than one pixel of the frame', () => {
  /* the property, stated as arithmetic rather than as a table of expected numbers: whatever
     coordDecimals returns must not be coarser than the pixel the reader is looking at. A table
     would pass forever after someone changed the tile size. */
  for (let z = 0; z <= 22; z++) {
    const degPerPixel = 360 / (256 * Math.pow(2, z));
    const written = Math.pow(10, -G.coordDecimals(z));
    if (z >= 7 && z <= 21) {
      assert.ok(written <= degPerPixel * 10,
        `zoom ${z}: writing ${G.coordDecimals(z)} decimals names ${written}°, coarser than the ${degPerPixel}° pixel it describes`);
    }
    assert.ok(G.coordDecimals(z) >= 2 && G.coordDecimals(z) <= 7, `zoom ${z}: ${G.coordDecimals(z)} decimals is outside the sane range`);
  }
});

test('R587 ①: at the zoom that produced the wrong answer, the coordinate resolves the building', () => {
  /* ⚠ THE REGRESSION ITSELF. The frame was zoom 16 at latitude 35.17. Two decimals is 0.01°, which
     is 1.11 km north-south — and the building is about 400 m across, so the coordinate named an
     area roughly eight times its footprint and could not have identified it. */
  const dp = G.coordDecimals(16);
  const metresNS = Math.pow(10, -dp) * 111320;
  assert.ok(metresNS < 400, `zoom 16 writes ${dp} decimals = ${metresNS.toFixed(0)} m; the misidentified building is ~400 m across`);
});

/* ── ② THE RANKING MUST PREFER WHAT THE FRAME CONTAINS ──────────────────────────────────────── */

const FRAME = { south: 0, west: 0, north: 1, east: 1 };
const el = (name, s, w, n, e, tags) => ({ type: 'way', id: name, tags: Object.assign({ name }, tags || {}), bounds: { minlat: s, minlon: w, maxlat: n, maxlon: e } });

test('R587 ②: a feature far larger than the view does not outrank one the view contains', () => {
  /* measured live at 東京スカイツリー: a district-heating service area spanned 1.43 frames and took
     first place on frame coverage alone. It is not what anybody framed. */
  const r = G.rankFramed([
    el('the region around it', -10, -10, 11, 11),      /* swallows the frame whole */
    el('the thing in the middle', 0.1, 0.1, 0.9, 0.9), /* 64% of the frame, entirely inside it */
  ], FRAME);
  assert.equal(r.kept[0].name, 'the thing in the middle');
});

test('R587 ②: a feature outside the frame is not reported at all', () => {
  const r = G.rankFramed([el('next valley over', 5, 5, 6, 6)], FRAME);
  assert.equal(r.total, 0, 'a feature that does not overlap the view is not in the view');
});

test('R587 ②: an unnamed footprint is never offered as an identification', () => {
  const r = G.rankFramed([{ type: 'way', id: 1, tags: { building: 'yes' }, bounds: { minlat: 0.1, minlon: 0.1, maxlat: 0.9, maxlon: 0.9 } }], FRAME);
  assert.equal(r.total, 0, 'an unnamed building cannot answer «what is this»');
});

test('R587 ②: the tags survive, so Atlas can tell a road from a building', () => {
  /* ⚠ the candidates carry their OSM tags VERBATIM and this file must not start reducing them to a
     curated «kind». The reduction is where a tag allow-list gets born, and a hand-written list of
     interesting tags silently drops whatever OSM adds next (.agents/rules/no-ad-hoc-hardcoding.md). */
  const r = G.rankFramed([el('some street', 0.1, 0.1, 0.9, 0.9, { highway: 'unclassified' })], FRAME);
  assert.equal(r.kept[0].tags.highway, 'unclassified');
});

test('R587 ②: the reported list is a head of a measured order, and says how much it dropped', () => {
  const many = [];
  for (let i = 0; i < 40; i++) many.push(el('f' + i, 0.1, 0.1, 0.1 + (i + 1) / 100, 0.1 + (i + 1) / 100));
  const r = G.rankFramed(many, FRAME, 12);
  assert.equal(r.kept.length, 12);
  assert.equal(r.dropped, 28);
  for (let i = 1; i < r.kept.length; i++) assert.ok(r.kept[i - 1].score >= r.kept[i].score, 'the head is ordered');
});

/* ── ③ THE EMPTY ANSWER IS THE ONE THAT STOPS THE INVENTION ─────────────────────────────────── */

test('R587 ③: finding nothing produces a POSITIVE statement, never an empty block', () => {
  /* ⚠⚠⚠ THIS IS THE CHECK THAT GUARDS THE ACTUAL BUG. An empty string here puts the model back
     exactly where it was: a picture, a question, and no way to tell «I was not told» from «there is
     nothing to tell». It answered from the one legible label at the edge of the frame. */
  const p = G.groundBlock({ drawn: { kept: [], dropped: 0, total: 0 }, framed: { kept: [], dropped: 0, total: 0 } });
  assert.ok(p.length > 0, 'an empty ground block is the bug');
  assert.match(p, /NO named/i, 'it has to SAY that nothing was found');
  assert.match(p, /do NOT name a building/i, 'and say what follows from that');
});

test('R587 ③: a failed lookup is never reported as «nothing is there»', () => {
  const p = G.groundBlock({ framedError: 'every Overpass mirror refused' });
  assert.match(p, /did NOT complete/i);
  assert.doesNotMatch(p, /has NO named feature/i, 'a lookup that failed did not establish an absence');
});

test('R587 ③: the block names the failure mode instead of asking for care in general', () => {
  const p = G.groundBlock({ drawn: { kept: [{ name: 'アスティスポーツクラブ', kind: 'sports' }], dropped: 0, total: 1 }, framed: { kept: [], dropped: 0, total: 0 } });
  assert.match(p, /アスティスポーツクラブ/, 'a drawn label is reported');
  assert.match(p, /tenant/i, 'the invented-tenant failure mode is named explicitly');
});

/* ── ④ AN ANCHOR IS A CLAIM THAT SOMETHING WAS FETCHED ──────────────────────────────────────── */

const { demoteUnfetchedLinks } = makeAtlasAnswerRender();

test('R587 ④: a link to a host the turn never fetched stops being a link', () => {
  const html = '<p>建物内にはアスティスポーツクラブ八田が入っています。(<a href="https://www.mapion.co.jp/x" class="atl-a" target="_blank" rel="noopener">mapion.co.jp</a>)</p>';
  const out = demoteUnfetchedLinks(html, ['gdelt.org']);
  assert.doesNotMatch(out, /<a /, 'the unearned anchor is gone');
  assert.match(out, /mapion\.co\.jp/, 'and the words the reader read are still there');
});

test('R587 ④: the sentence is never deleted — Atlas loses no capability to this rule', () => {
  /* ⚠ standing rule: Atlas gets no new limits (memory: atlas-full-authority-no-new-limits). This
     removes a false claim carried by the MARKUP, not a statement carried by the prose. */
  const html = '<p>Before <a href="https://nope.example/x">the label</a> after.</p>';
  assert.equal(demoteUnfetchedLinks(html, []), '<p>Before the label after.</p>');
});

test('R587 ④: a host the turn actually fetched keeps its link', () => {
  const html = '<a href="https://www.mapion.co.jp/x" class="atl-a">mapion.co.jp</a>';
  assert.match(demoteUnfetchedLinks(html, ['mapion.co.jp']), /<a /, 'a page IntMap really retrieved is a real citation');
  assert.match(demoteUnfetchedLinks(html, ['www.mapion.co.jp']), /<a /, 'and www. is the same host');
});

test('R587 ④: citation pills are built from the registry and are not this rule\'s business', () => {
  const html = '<a class="atl-cite" href="https://anything.example/p" target="_blank">1</a>';
  assert.equal(demoteUnfetchedLinks(html, []), html);
});

/* ── ⑤ A VIEW TOO WIDE TO HAVE A «THIS» IN IT ───────────────────────────────────────────────── */

test('R587 ⑤: a world view is not asked what single object is in it', () => {
  assert.equal(G.framedBudget({ south: -60, west: -180, north: 70, east: 180 }).ok, false);
});

test('R587 ⑤: the frame that produced the wrong answer is well inside the budget', () => {
  assert.equal(G.framedBudget({ south: 35.148, west: 136.842, north: 35.155, east: 136.8515 }).ok, true);
});

test('R587 ⑤: skipping the lookup is reported as «not looked up», never as an absence', () => {
  /* ⚠ the distinction the whole round is about. «We did not ask» and «there is nothing there» are
     different facts, and collapsing them is what let a picture be answered from imagination. */
  const p = G.groundBlock({ framedError: G.framedBudget({ south: -60, west: -180, north: 70, east: 180 }).reason });
  assert.match(p, /did NOT complete/i);
  assert.doesNotMatch(p, /has NO named feature/i);
});

/* ── ⑥ A ROUTE'S BOUNDING BOX IS NOT A FOOTPRINT ────────────────────────────────────────────── */

test('R587 ⑥: relations are asked for only where the schema says they are areas', () => {
  /* ⚠ MEASURED, not anticipated. Over the 名古屋 frame an unrestricted relation query put SIX
     名古屋市営バス routes in the top eleven, each at cover 1.00, because a route crossing the view has
     a bounding box the size of the view — and a bounding box cannot tell a line from an area.
     `type=multipolygon|boundary` is OSM's own definition of an area relation, so this asks the schema
     the question the measurement needs rather than curating a list of interesting kinds. */
  const q = G.overpassFramedQuery({ south: 0, west: 0, north: 1, east: 1 }, 25);
  assert.match(q, /relation\[name\]\[type~/, 'relations are restricted to area types');
  assert.match(q, /multipolygon\|boundary/, 'and to those two, which is what «is an area» means in OSM');
  assert.match(q, /way\[name\]\(/, 'ways are NOT restricted — a linear way is thin, so inView already ranks it down');
  assert.doesNotMatch(q, /building|landuse|amenity|aeroway/, 'no tag allow-list: the filtering is the ranking');
});

test('R587 ⑥: the bbox is written at full precision and the timeout is bounded', () => {
  const q = G.overpassFramedQuery({ south: 35.148, west: 136.842, north: 35.155, east: 136.8515 }, 9999);
  assert.match(q, /35\.148000,136\.842000,35\.155000,136\.851500/);
  assert.match(q, /\[timeout:60\]/, 'an absurd timeout is clamped rather than forwarded');
});
