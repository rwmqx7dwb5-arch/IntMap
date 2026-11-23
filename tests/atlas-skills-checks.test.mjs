/* atlas-skills — Skills: reference material found through find_capability and read a section at a time.
   What is measured here is that a skill (1) is found by the words a person would use, in both languages, and
   NOT found for requests about something else; (2) names only capabilities and arguments that exist — checked
   against the live registry and schemas, with a stub that proves the check can fail; (3) is read one section
   at a time and says what the rest are; (4) arrives through the tool surface's own find_capability door and
   leaves what that door said for capabilities untouched. */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
const skills = await import('../js/atlas-skills.js');
const { ATLAS_SKILLS } = await import('../js/atlas-skills-data.js');
const caps = (await import('../js/atlas-capabilities.js')).makeAtlasCapabilities({});
const schemas = (await import('../js/atlas-schemas.js')).makeAtlasSchemas();

test('the skills are consistent with the live registry and schemas', () => {
  assert.deepEqual(skills.audit({ capabilities: caps, schemas }), []);
});

test('the audit can fail: a missing capability, a withdrawn one, an argument the schema lacks', () => {
  const none = { resolve: () => null };
  assert.ok(skills.audit({ capabilities: none, schemas }).some((m) => /is not a capability id/.test(m)));
  const withdrawn = { resolve: (id) => ({ id, withdrawn: true }) };
  assert.ok(skills.audit({ capabilities: withdrawn, schemas }).some((m) => /is withdrawn/.test(m)));
  const noArgs = { schemaFor: () => ({ properties: {} }) };
  assert.ok(skills.audit({ capabilities: caps, schemas: noArgs }).some((m) => /has no argument/.test(m)));
});

test('what a skill uses is read from its prose, in both languages alike', () => {
  for (const s of ATLAS_SKILLS) {
    const en = skills.capabilityRefs(s, 'en').map((r) => r.id).sort();
    const jp = skills.capabilityRefs(s, 'jp').map((r) => r.id).sort();
    assert.deepEqual(en, jp, s.id);
    assert.ok(en.length >= 4, s.id + ' should reach for several real capabilities');
  }
});

test('discovery: requests in either language reach the right skill, other requests reach none', () => {
  const top = (q) => (skills.searchSkills(q)[0] || {}).id;
  assert.equal(top('compare how the borders of Austria-Hungary changed between 1914 and 1923'), 'historical-border-comparison');
  assert.equal(top('1914年と1923年で国境がどう変わったか比較して'), 'historical-border-comparison');
  assert.equal(top('use satellite change detection to see what changed at this construction site'), 'satellite-change-detection');
  assert.equal(top('この場所の衛星画像の前後比較で何が変わったか'), 'satellite-change-detection');
  assert.equal(top('help with industrial location analysis for a new plant'), 'industrial-site-screening');
  assert.equal(top('工場の立地分析をしたい'), 'industrial-site-screening');
  assert.equal(top('compare port logistics risk between two ports'), 'port-logistics-risk');
  assert.equal(top('港湾の物流リスクを比較して'), 'port-logistics-risk');
  for (const q of ['what is the weather in Tokyo', '東京の天気は？', 'fly to Paris', 'ありがとう', 'show me the population of Brazil']) {
    assert.deepEqual(skills.searchSkills(q), [], q);
  }
});

test('a search hands over names and one line, never the text; the Japanese request gets Japanese', () => {
  const [hit] = skills.searchSkills('港湾の物流リスクを比較して');
  assert.match(hit.title, /港湾/);
  assert.ok(JSON.stringify(hit).length < 600);
  assert.match(hit.read, /skill:port-logistics-risk/);
});

test('reading is one section at a time, with the outline of the rest', () => {
  for (const s of ATLAS_SKILLS) {
    for (const lang of ['en', 'jp']) {
      const first = skills.readSkill(s.id, { lang });
      assert.equal(first.ok, true);
      assert.equal(first.section, s.sections[0].id);
      assert.equal(first.otherSections.length, s.sections.length - 1);
      for (const sec of s.sections) {
        const r = skills.readSkill(s.id, { section: sec.id, lang });
        assert.equal(r.section, sec.id);
        assert.ok(r.text.length > 100 && r.text.length <= skills.SECTION_MAX_CHARS);
      }
    }
  }
  const bad = skills.readSkill('port-logistics-risk', { section: 'nope' });
  assert.equal(bad.ok, false);
  assert.ok(bad.sections.length >= 3);
  const unknown = skills.readSkill('no-such-skill');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.skills.length, ATLAS_SKILLS.length);
  assert.equal(skills.parseSkillQuery('skill: port-logistics-risk'), 'port-logistics-risk');
  assert.equal(skills.parseSkillQuery('port logistics'), null);
});

test('a skill is material, not a command: the read result says so and carries no instruction to the turn', () => {
  const r = skills.readSkill('satellite-change-detection');
  assert.match(r.note, /reference material, not a procedure/);
  assert.equal(r.endsTurn, undefined);
});

test('the tool surface: the same find_capability door finds and reads skills, and capability answers are unchanged', async () => {
  const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
  const TS = makeAtlasToolSurface({ capabilities: caps, schemas, runAction: async () => ({ ok: true }) });
  const tools = TS.baseTools();
  assert.ok('section' in tools.find_capability.parameters.properties);
  assert.match(tools.find_capability.description, /skill:<id>/);
  const exec = TS.makeExecute(tools, {});
  const found = await exec({ name: 'find_capability', arguments: { query: 'compare port logistics risk between two ports' } });
  assert.equal(found.ok, true);
  assert.ok(found.skills.some((s) => s.id === 'port-logistics-risk'));
  assert.ok(!JSON.stringify(found.skills).includes('Dependence'), 'the text is not in the search answer');
  const plain = await exec({ name: 'find_capability', arguments: { query: 'fly to Paris' } });
  assert.equal(plain.skills, undefined);
  const read = await exec({ name: 'find_capability', arguments: { query: 'skill:port-logistics-risk', section: 'limits', language: 'jp' } });
  assert.equal(read.ok, true);
  assert.equal(read.section, 'limits');
  assert.match(read.text, /確率/);
  assert.equal(TS.footprintOf({ name: 'find_capability', arguments: { query: 'skill:x' } }, tools).pure, true);
});

/* ── readiness: what can actually be used, observed (skillReadiness) ───────────────────────────────────────────── */
const stub = (needs, text) => ({ id: 'probe-skill', title: ['t', 't'], summary: ['s', 's'], keywords: [['k'], ['k']], needs,
  sections: [{ id: 'a', title: ['a', 'a'], body: [text, text] }] });

test('readiness: each capability and each declared need is available / unavailable / unobservable — three states, and silence is not "unavailable"', async () => {
  const sk = stub([{ kind: 'layer', ref: 'ships', why: ['w', 'w'] }, { kind: 'runtime', ref: 'python', why: ['w', 'w'] }, { kind: 'dataset', ref: 'pop', why: ['w', 'w'] }, { kind: 'login', why: ['w', 'w'] }],
    'use `layers.toggle` and `data.weather{place}` and `no.suchThing`');
  const probes = { layer: (r) => ({ available: r === 'ships', label: 'Ships' }), runtime: () => ({ available: false, reason: 'worker-unavailable' }), dataset: () => ({ available: null }), login: () => { throw new Error('boom'); } };
  const live = { resolve: (id) => (id === 'no.suchThing' ? null : { id, availability: () => ({ available: true }), facets: {} }) };   /* the real registry answers `atlas-kernel-not-loaded` until the page boots the kernel */
  const r = await skills.skillReadiness(sk, { capabilities: live, probes });
  const need = (k) => r.needs.find((n) => n.kind === k);
  assert.equal(need('layer').state, 'available');
  assert.equal(need('runtime').state, 'unavailable');
  assert.equal(need('runtime').reason, 'worker-unavailable');
  assert.equal(need('dataset').state, 'unobservable', 'a probe that cannot tell is not "missing"');
  assert.equal(need('login').state, 'unobservable', 'a probe that throws is not "missing" either');
  assert.equal(r.capabilities.find((c) => c.id === 'layers.toggle').state, 'available');
  assert.equal(r.capabilities.find((c) => c.id === 'no.suchThing').state, 'unavailable');
  assert.equal(r.counts.available + r.counts.unavailable + r.counts.unobservable, r.capabilities.length + r.needs.length);
  const bare = await skills.skillReadiness(sk, { capabilities: live });
  assert.ok(bare.needs.every((n) => n.state === 'unobservable' && n.reason === 'no-probe'), 'no probes handed in: nothing is claimed either way');
});

test('readiness: a withdrawn capability is unavailable with its reason; a network capability is unavailable only while offline', async () => {
  const sk = stub([], 'use `data.weather{place}` and `layers.toggle`');
  const fake = { resolve: (id) => ({ id, availability: () => (id === 'layers.toggle' ? { available: false, reason: 'withdrawn' } : { available: true }), facets: { network: id === 'data.weather' } }) };
  const online = await skills.skillReadiness(sk, { capabilities: fake, probes: { network: () => ({ available: null }) } });
  assert.equal(online.capabilities.find((c) => c.id === 'layers.toggle').reason, 'withdrawn');
  const w = online.capabilities.find((c) => c.id === 'data.weather');
  assert.equal(w.state, 'available'); assert.equal(w.needsNetwork, true, 'the dependency is stated even when it cannot be probed');
  const off = await skills.skillReadiness(sk, { capabilities: fake, probes: { network: () => ({ available: false }) } });
  assert.equal(off.capabilities.find((c) => c.id === 'data.weather').reason, 'offline');
});

test('the shipped skills declare needs the audit accepts, and a malformed need fails it', () => {
  const port = ATLAS_SKILLS.find((s) => s.id === 'port-logistics-risk');
  assert.ok(skills.needsOf(port).length >= 1);
  const bad = JSON.parse(JSON.stringify(port)); bad.needs = [{ kind: 'warehouse', ref: 'x', why: ['a', 'b'] }, { kind: 'layer', ref: '', why: ['a'] }, { kind: 'layer', ref: 'x', for: 'data.nothing', why: ['a', 'b'] }];
  ATLAS_SKILLS.push(bad); bad.id = 'bad-needs';
  try {
    const out = skills.audit({ capabilities: caps, schemas });
    for (const re of [/kind "warehouse"/, /names nothing to look for/, /no reason in en \+ jp/, /which the text does not name/]) assert.ok(out.some((m) => re.test(m)), String(re));
  } finally { ATLAS_SKILLS.pop(); }
});

test('the tool surface reads a skill with its readiness beside the text, and reading refuses nothing', async () => {
  const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
  const calls = [];
  const T = makeAtlasToolSurface({ capabilities: caps, schemas, runAction: async () => ({ ok: true }), probes: { layer: (r) => { calls.push(r); return { available: false, reason: 'no-such-layer' }; } } });
  const res = await T.makeExecute(T.baseTools(), {})({ name: 'find_capability', arguments: { query: 'skill:port-logistics-risk', section: 'limits' } });
  assert.equal(res.ok, true);
  assert.match(res.text, /probability of disruption/);
  assert.deepEqual(calls, ['ships']);
  assert.equal(res.readiness.needs[0].state, 'unavailable');
  assert.match(res.readiness.note, /Nothing is refused/);
});
