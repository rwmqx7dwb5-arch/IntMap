/* (geopolitics-layers) sanctions, UN General Assembly votes, border crossings — the committed records and the rules every reader
   (the map, the route panel, Atlas) asks, evaluated as they run (no source text read). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAt, parse, localParts } from '../js/opening-hours.js';
import { sanctionLinks, sanctionsOn, sanctionFeatures, voteAtOrBefore, findVote, searchVotes, decodeVote, sessionFile, voteFlags,
  nearestCrossings, crossingState, citizenship, crossingFeatures, km } from '../js/geopolitics-core.js';
import { countryNameIndex } from '../scripts/lib/country-name-index.mjs';
import { readEUText, readUK, linksOf } from '../scripts/build-sanctions.mjs';
import { crossingOf } from '../scripts/build-border-crossings.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const S = J('data/sanctions.json');
const I = J('data/unga-votes/index.json');
const B = J('data/border-crossings.json');
const session = (s) => J(sessionFile(s));

/* ── the sanctions record ── */
test('sanctions: three authorities, each with its list, its date, its seat and its own licence', () => {
  assert.deepEqual(S.authorities.map((a) => a.id).sort(), ['EU', 'UK', 'US']);
  for (const a of S.authorities) {
    assert.ok(a.parties > 1000, a.id + ' holds ' + a.parties + ' parties');
    assert.match(a.listDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(a.seat) && a.seat.length === 2 && a.seat.every(Number.isFinite));
    assert.ok(a.licence && a.licenceUrl && a.url && a.publisher);
    assert.ok(S.unplaced[a.id] && Number.isInteger(S.unplaced[a.id].n), a.id + ' states how many parties it places nowhere');
  }
  /* the UN Security Council list is not read (non-commercial terms): no authority claims it */
  assert.ok(!S.authorities.some((a) => /security council/i.test(a.list + a.publisher)));
});
test('sanctions: every link counts what it says — kinds and bases add up, the country has a place', () => {
  for (const l of S.links) {
    assert.ok(l.n > 0);
    assert.equal(Object.values(l.kinds).reduce((s, n) => s + n, 0), l.n, l.a + '→' + l.c + ' kinds');
    assert.equal(Object.values(l.basis).reduce((s, n) => s + n, 0), l.n, l.a + '→' + l.c + ' basis');
    assert.ok(S.places[l.c], l.c + ' has a place row');
    assert.ok(l.un <= l.n);
    if (l.first) assert.ok(l.first <= l.last);
  }
  /* only the UK list states measures per party; EU and US state the list's one measure instead */
  assert.ok(S.links.filter((l) => l.a === 'UK').some((l) => l.measures.length));
  assert.ok(S.links.filter((l) => l.a !== 'UK').every((l) => l.measures.length === 0));
  assert.ok(S.authorities.find((a) => a.id === 'US').measure && S.authorities.find((a) => a.id === 'EU').measure);
});
test('sanctions: the facts a reader expects are there — all three lists link parties to Russia and to Iran', () => {
  for (const c of ['RUS', 'IRN']) {
    const r = sanctionsOn(S, c);
    assert.deepEqual(r.by.map((b) => b.authority).sort(), ['EU', 'UK', 'US'], c);
    assert.equal(r.total, r.by.reduce((s, b) => s + b.n, 0));
  }
  assert.equal(sanctionLinks(S, { authority: 'uk', country: 'rus' }).length, 1);
});
test('sanctions: the map draws an arc from the seat to the country for each link it shows, and a point per country', () => {
  const f = sanctionFeatures(S, { authorities: ['UK'], country: 'RUS' });
  const arcs = f.filter((x) => x.properties.k === 'arc');
  assert.equal(arcs.length, 1);
  const seat = S.authorities.find((a) => a.id === 'UK').seat;
  assert.ok(km(arcs[0].geometry.coordinates[0], seat) < 1, 'the arc starts at the seat');
  const end = arcs[0].geometry.coordinates[arcs[0].geometry.coordinates.length - 1];
  assert.ok(km([((end[0] + 540) % 360) - 180, end[1]], [S.places.RUS.x, S.places.RUS.y]) < 1, 'the arc ends at the country');
  assert.equal(f.filter((x) => x.properties.k === 'end').length, 1);
});
test('sanctions builder: a quoted «;» inside the EU file does not shift its columns; the UK list keeps its measures', () => {
  const eu = 'fileGenerationDate;Entity_LogicalId;Entity_UnitedNationId;Entity_DesignationDate;Entity_SubjectType_ClassificationCode;Entity_Regulation_Programme;Entity_Regulation_NumberTitle;Entity_Regulation_PublicationDate;Address_CountryIso2Code;Citizenship_CountryIso2Code\n'
    + '17/11/2026;1;;2014-03-17;person;UKR;"2014/269 (OJ; L 78)";2014-03-17;RU;\n'
    + '17/11/2026;2;UN.1;2001-10-06;enterprise;TAQA;x;2001-10-06;;AF\n';
  const r = readEUText(eu);
  assert.equal(r.listDate, '2026-11-17');
  assert.equal(r.parties.length, 2);
  assert.deepEqual([...r.parties[0]._a2addr], ['RU']);
  assert.equal(r.parties[1].un, true);
  const names = countryNameIndex(join(ROOT, 'data', 'ne-countries', 'ne_110m_admin_0_countries.json.gz'));
  const L = linksOf('EU', r.parties, names);
  assert.deepEqual(L.links.map((l) => [l.c, l.basis]).sort(), [['AFG', { nationality: 1 }], ['RUS', { address: 1 }]]);
  const uk = 'Report Date: 12-Nov-2026\nLast Updated,Unique ID,Name type,Regime Name,Designation Type,Designation source,Sanctions Imposed,Address Country,Nationality(/ies),Current believed flag of ship,Date Designated\n'
    + 'x,RUS1,Primary Name,The Russia (Sanctions) (EU Exit) Regulations 2019,Individual,UK,Asset freeze|Travel Ban,Russia,,,15/03/2022\n'
    + 'x,RUS1,Alias,The Russia (Sanctions) (EU Exit) Regulations 2019,Individual,UK,Asset freeze|Travel Ban,United Arab Emirates,,,15/03/2022\n';
  const u = readUK(uk, names);
  assert.equal(u.listDate, '2026-11-12');
  assert.deepEqual([...u.parties[0].countries.keys()].sort(), ['ARE', 'RUS'], 'a party with two addresses is linked to both');
  assert.deepEqual([...u.parties[0].measures.values()], ['Asset freeze', 'Travel Ban']);
});
test('country names: a name two records give to different codes resolves to nothing, an alias never overrules a primary name', () => {
  const ne = join(ROOT, 'data', 'ne-countries', 'ne_110m_admin_0_countries.json.gz');
  const x = countryNameIndex(ne, [['Russia', 'GEO'], ['Burma', 'MMR'], ['DPRK', 'PRK']]);
  assert.equal(x.resolve('Russia'), 'RUS');
  assert.equal(x.resolve('Korea, North'), 'PRK');
  assert.equal(x.resolve('DPRK'), 'PRK');
  assert.equal(x.resolve('Burma'), 'MMR');
  assert.equal(x.resolve('Region: Gaza'), null);
});

/* ── the UN General Assembly votes ── */
test('UN votes: every session file holds one character per member for each vote, and the totals are those characters', () => {
  const ids = new Set();
  for (const s of I.sessions) {
    assert.ok(existsSync(join(ROOT, sessionFile(s.s))), 'session ' + s.s);
    const sj = session(s.s);
    assert.equal(sj.votes.length, s.n);
    for (const v of sj.votes) {
      assert.equal(v.v.length, I.members.length);
      const count = (ch) => [...v.v].filter((c) => c === ch).length;
      assert.deepEqual([v.y, v.n, v.a, v.x], [count('Y'), count('N'), count('A'), count('X')], 'rcid ' + v.id);
      assert.match(v.v, /^[YANX-]+$/);
      ids.add(v.id);
    }
  }
  assert.equal(ids.size, I.votes.length);
  assert.equal(new Set(I.members.map((m) => m.c)).size, I.members.length);
  for (let i = 1; i < I.votes.length; i++) assert.ok(I.votes[i - 1][1] <= I.votes[i][1], 'the index is in date order');
  assert.equal(I.first, I.votes[0][1]); assert.equal(I.last, I.votes[I.votes.length - 1][1]);
  assert.equal(I.licence, 'CC0 1.0');
});
test('UN votes: checked against the Assembly\'s own record — A/RES/68/262 (territorial integrity of Ukraine) 100–11–58', () => {
  for (const sym of ['A/RES/68/262', 'R/68/262', 'a/res/68/262']) {
    const r = findVote(I, sym);
    assert.ok(r, sym);
    const v = decodeVote(I, session(r.s), r.id);
    assert.equal(v.d, '2014-03-27');
    assert.deepEqual([v.y, v.n, v.a], [100, 11, 58]);
    assert.equal(v.by.RUS, 'N'); assert.equal(v.by.UKR, 'Y'); assert.equal(v.by.CHN, 'A');
    assert.match(v.ds, /Territorial integrity of Ukraine/);
  }
  assert.deepEqual(searchVotes(I, 'territorial integrity ukraine').map((r) => r.sym), ['R/68/262']);
});
test('UN votes: the measured gaps of the record are still what the layer and Atlas say they are', () => {
  /* if a newer CC0 edition fills them, these fail and the sentences in js/layer-pkg-geopolitics.js and js/atlas-cap-data.js must change */
  assert.equal(I.sessions.find((s) => s.s === 76).to, '2021-12-24');
  assert.equal(I.votes.filter((r) => r[1] > '2021-12-24' && r[1] < '2022-09-01').length, 0);
  assert.equal(findVote(I, 'R/26/2758C').d, '1971-10-07');
  /* session 19 (1964-65, the Article 19 crisis) took one recorded vote — the Albanian appeal against the President's ruling; the
     record dates it 1965-02-06 although its own description names the ruling of 8 February it appeals (another early date that is
     not the meeting's) */
  /* no code for Serbia: its seat votes as YUG «Yugoslavia» to the last session (the legend and Atlas say so) */
  assert.ok(!I.members.some((m) => m.c === 'SRB'));
  const yug = I.members.findIndex((m) => m.c === 'YUG');
  assert.ok(session(77).votes.some((v) => v.v[yug] === 'Y'));
  const s19 = I.votes.filter((r) => r[4] === 19);
  assert.equal(s19.length, 1);
  assert.match(s19[0][6], /ALBANIAN APPEAL/);
});
test('UN votes: the vote drawn at an instant is the last at or before its day; none before the first', () => {
  assert.equal(voteAtOrBefore(I, '1900-01-01'), null);
  const r = voteAtOrBefore(I, '2014-03-27');
  assert.ok(r.d <= '2014-03-27');
  assert.equal(voteAtOrBefore(I, '2099-01-01').d, I.last);
  assert.deepEqual(voteFlags(1 | 2 | (8 << 3)), { important: true, amendment: true, paragraph: false, issues: ['hr'] });
});

/* ── border crossings and their hours ── */
test('crossings: every post is a point with its OpenStreetMap id and a real IANA zone', () => {
  assert.equal(B.count, B.crossings.length);
  assert.ok(B.count > 5000);
  const zones = new Set();
  for (const c of B.crossings) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && /^[nwr]\d+$/.test(c.i));
    if (c.tz) zones.add(c.tz);
  }
  for (const z of zones) assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: z }), z);
  /* a tag OpenStreetMap does not carry is absent, never filled */
  assert.deepEqual(crossingOf({ type: 'node', id: 1, lon: 1, lat: 2, tags: { barrier: 'border_control' } }, null), { x: 1, y: 2, i: 'n1' });
});
test('opening hours: read in the post\'s own zone, a later rule replaces an earlier one, past midnight carries over', () => {
  const at = (iso) => Date.parse(iso);
  assert.equal(openAt('24/7', at('2026-11-17T03:00:00Z'), 'UTC').state, 'open');
  assert.equal(openAt('closed', at('2026-11-17T12:00:00Z'), 'UTC').state, 'closed');
  /* 10:00 UTC is 11:00 in Warsaw and 16:00 in Almaty */
  assert.equal(openAt('08:00-15:00', at('2026-11-17T10:00:00Z'), 'Europe/Warsaw').state, 'open');
  assert.equal(openAt('08:00-15:00', at('2026-11-17T10:00:00Z'), 'Asia/Almaty').state, 'closed');
  assert.equal(localParts(at('2026-11-17T10:00:00Z'), 'Asia/Tokyo').min, 19 * 60);
  /* «Nov-Mar 07:00-17:00; Apr-Oct 08:00-18:00»: a month range, then a time — not «Mar 07» */
  assert.equal(openAt('Nov-Mar 07:00-17:00; Apr-Oct 08:00-18:00', at('2026-11-17T06:30:00Z'), 'UTC').state, 'closed');
  assert.equal(openAt('Nov-Mar 07:00-17:00; Apr-Oct 08:00-18:00', at('2026-11-17T07:30:00Z'), 'UTC').state, 'open');
  assert.equal(openAt('Jun 01-Aug 31: 08:00-20:00', at('2026-07-01T09:00:00Z'), 'UTC').state, 'open');
  assert.equal(openAt('Mo-Su 08:00-20:00; Tu off', at('2026-11-17T10:00:00Z'), 'UTC').state, 'closed', '2026-11-17 is a Tuesday');
  assert.equal(openAt('22:00-02:00', at('2026-11-18T01:00:00Z'), 'UTC').state, 'open');
  assert.equal(openAt('Tu, Th, Sa-Su 07:00-16:00', at('2026-11-17T10:00:00Z'), 'UTC').state, 'open');
  const u = openAt('24/7 unknown "not on bad weather days"', at('2026-11-17T10:00:00Z'), 'UTC');
  assert.deepEqual([u.state, u.comment], ['unknown', 'not on bad weather days']);
  assert.equal(openAt('Mo-Su,PH 08:00-20:00', at('2026-11-17T10:00:00Z'), 'UTC').holidays, true);
});
test('opening hours: what this reader does not read is «unread» with its token — never open, never closed', () => {
  for (const [s, tok] of [['sunrise-sunset', 'sunrise'], ['Mar-Oct Su[-1] 08:00-20:00', '[-1]'], ['Mo-Su 07:00+', '+'], ['11-18', '11-18'], ['PH 08:00-12:00', 'PH']]) {
    const r = openAt(s, Date.parse('2026-11-17T10:00:00Z'), 'UTC');
    assert.equal(r.state, 'unread', s);
    assert.equal(r.token, tok, s);
  }
  assert.throws(() => parse(''));
});
test('opening hours: of the schedules the record carries, all but a named few are read', () => {
  const ms = Date.parse('2026-11-17T10:00:00Z');
  const withHours = B.crossings.filter((c) => c.oh);
  const unread = withHours.filter((c) => openAt(c.oh, ms, c.tz).state === 'unread');
  /* measured 2026-11-17: 14 of 1,019 (sunrise/sunset, the nth weekday, «-1 day», «+», «@», bare hours); a rebuild that grows
     this is a new form in OpenStreetMap to read, not a reason to move the number */
  assert.ok(unread.length / withHours.length < 0.05, unread.length + ' of ' + withHours.length + ' unread');
});
test('crossings: the nearest posts come nearest first; state and who may cross are what the tags say', () => {
  const near = nearestCrossings(B, 23.5, 52.1, 3);
  assert.equal(near.length, 3);
  assert.ok(near[0].km <= near[1].km && near[1].km <= near[2].km);
  assert.equal(crossingState({ x: 0, y: 0, i: 'n1' }, Date.now()).state, 'unstated');
  assert.deepEqual(citizenship({ cz: 'RU;KZ' }), { kind: 'codes', codes: ['RU', 'KZ'], words: ['RU', 'KZ'] });
  assert.equal(citizenship({ cz: 'interstate' }).kind, 'interstate');
  assert.equal(citizenship({}).kind, null);
  const f = crossingFeatures({ crossings: [{ x: 1, y: 2, i: 'n1', oh: '24/7', tz: 'UTC' }] }, Date.now());
  assert.equal(f[0].properties.st, 'open');
});
