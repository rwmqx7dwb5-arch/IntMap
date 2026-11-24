/* A relation is confirmed, inferred or unconfirmed — and an answer cannot complete one the graph does not hold
   (js/relation-evidence.js · js/atlas-world-objects.js · research.object `check`). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { linkState, relatedState, checkClaims, STATES } from '../js/relation-evidence.js';
import { makeAtlasWorldObjects } from '../js/atlas-world-objects.js';
import { makeAtlasGeoObject } from '../js/atlas-geo-object.js';

const geo = makeAtlasGeoObject();

test('① a tie is confirmed only when a source or evidence record stands behind it', () => {
  assert.equal(linkState({ rel: 'operated_by', ref: 'company:x', source: 'Wikidata P137', confidence: 'high' }).state, 'confirmed');
  assert.equal(linkState({ rel: 'operated_by', ref: 'company:x', evidenceIds: ['ev1'] }).state, 'confirmed');
  const bare = linkState({ rel: 'operated_by', ref: 'company:x' });
  assert.equal(bare.state, 'unconfirmed'); assert.match(bare.why, /no source/);
});

test('② a derived tie is inferred and carries its rule; a derivation that cannot say how is not even that', () => {
  const ok = linkState({ rel: 'served_by', ref: 'rail:y', basis: 'inferred', rule: 'nearest rail terminal within 5 km' });
  assert.equal(ok.state, 'inferred'); assert.equal(ok.rule, 'nearest rail terminal within 5 km');
  assert.equal(linkState({ rel: 'served_by', ref: 'rail:y', basis: 'inferred' }).state, 'unconfirmed');
  /* a source on a tie marked inferred does not turn it into a fact */
  assert.equal(linkState({ rel: 'served_by', ref: 'r', basis: 'inferred', rule: 'near', source: 'IntMap' }).state, 'inferred');
});

test('③ a look-alike or an identifier disagreement is never a confirmed tie, whatever source it names', () => {
  for (const rel of ['candidate_match', 'conflicting_identity']) assert.equal(linkState({ rel, ref: 'x', source: 'IntMap', confidence: 'high' }).state, 'unconfirmed', rel);
});

test('④ the link record keeps basis and rule only when derived', () => {
  const k = geo.cleanLink({ rel: 'near_port', ref: 'port:a', basis: 'inferred', rule: 'within 40 km', source: 'IntMap' });
  assert.equal(k.basis, 'inferred'); assert.equal(k.rule, 'within 40 km');
  const s = geo.cleanLink({ rel: 'operated_by', ref: 'company:a', source: 'Wikidata', basis: 'stated' });
  assert.equal(s.basis, undefined, 'stated is the default and is not stored as a field');
});

const W = makeAtlasWorldObjects();
const mk = (type, id, name, lng, lat, links) => geo.worldObject({ type, kind: 'point', id, name, lng, lat, provenance: 'gazetteer', links });
W.clear && W.clear();
const port = mk('facility', 'p1', 'Port A', 10, 50, [
  { rel: 'operated_by', ref: 'company:c1', source: 'Wikidata P137', confidence: 'high' },
  { rel: 'part_of', ref: 'facility:p2' },
  { rel: 'served_by', ref: 'facility:r1', basis: 'inferred', rule: 'nearest rail terminal within 5 km' }]);
const comp = mk('company', 'c1', 'Company One', 10.01, 50.01, []);
const rail = mk('facility', 'r1', 'Rail One', 10.02, 50.02, []);
const other = mk('facility', 'p2', 'Port Two', 10.03, 50.03, []);
[port, comp, rail, other].forEach((o) => W.register(o));

test('⑤ related(): a stated tie is confirmed, a derived one inferred, and an unsourced tie never confirms', () => {
  const res = W.related(port, { km: 50 });
  const by = (name) => res.items.find((i) => i.object.name === name);
  assert.equal(by('Company One').state, 'confirmed');
  assert.equal(by('Rail One').state, 'inferred');
  const p2 = by('Port Two');
  assert.equal(p2.state, 'inferred', 'near (a rule) beats an unsourced tie; both grounds are named');
  assert.deepEqual(p2.grounds.map((g) => g.kind + ':' + g.state).sort(), ['near:inferred', 'tie:unconfirmed']);
});

test('⑥ checkRelations: recorded ties come back with their state, a claim nobody recorded is "not recorded", and nothing is added', () => {
  const before = JSON.stringify(W.brief(port));
  const r = W.checkRelations(port, [
    { rel: 'operated_by', ref: 'company:c1' },     /* recorded, sourced */
    { rel: 'owned_by', ref: 'company:c1' },        /* the graph holds operated_by, not owned_by */
    { rel: 'operates', ref: 'facility:p1' },       /* asked from the other end: read through the inverse */
  ]);
  assert.equal(r[0].recorded, true); assert.equal(r[0].state, 'confirmed'); assert.equal(r[0].evidence.source, 'Wikidata P137');
  assert.equal(r[1].recorded, false); assert.equal(r[1].state, 'unconfirmed'); assert.match(r[1].why, /not evidence/);
  assert.equal(r[2].recorded, false, 'the subject is the PORT; "port operates port" is not recorded');
  const back = W.checkRelations(comp, [{ rel: 'operates', ref: 'facility:p1' }])[0];
  assert.equal(back.recorded, true, 'the company\'s end of the same tie is found through the inverse, no second copy'); assert.equal(back.state, 'confirmed');
  assert.equal(JSON.stringify(W.brief(port)), before, 'checking adds nothing to the graph');
});

test('⑦ brief() annotates every link with its state, so a model reading the object sees which ties are which', () => {
  const b = W.brief(port);
  const st = Object.fromEntries(b.links.map((l) => [l.rel, l.state]));
  assert.deepEqual(st, { operated_by: 'confirmed', part_of: 'unconfirmed', served_by: 'inferred' });
});

test('⑧ the three states are the whole vocabulary, and an unknown object checks as unconfirmed', () => {
  assert.deepEqual([...STATES], ['confirmed', 'inferred', 'unconfirmed']);
  const r = W.checkRelations('nothing:here', [{ rel: 'part_of', ref: 'x' }]);
  assert.equal(r[0].state, 'unconfirmed'); assert.equal(r[0].recorded, false);
  assert.equal(relatedState([], ['near'], { km: 5 }).state, 'inferred');
  assert.equal(checkClaims('a', [], [], [{ rel: 'r', ref: 'b' }])[0].recorded, false);
});
