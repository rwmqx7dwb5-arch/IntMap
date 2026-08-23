/* ============================================================================
 *  R352 — three things production verification found in #R341's own code
 * ----------------------------------------------------------------------------
 *  #R341 replaced the aviation layer. Its production verification, run against the deployed site,
 *  reported the round green on every claim it made — and then found three places where the new
 *  code answered with something other than what it appeared to answer:
 *
 *   ① THE DETAIL CARD CREDITED THE WRONG PROVIDER, ON 10 CARDS OUT OF 10. #R341 moved the live
 *      feed to adsb.lol, whose data is ODbL 1.0 — a licence that REQUIRES the source to be named —
 *      and taught the hover tooltip to name it. The card kept the literal 'airplanes.live · ADS-B',
 *      which by then supplied none of the aircraft on screen. Naming the wrong source is worse
 *      than naming none: it is an attribution obligation discharged onto a third party.
 *
 *   ② snapshotFor() RETURNED GEOMETRY WITHOUT IDENTITY. The store holds the ICAO address of every
 *      aircraft in it; the public snapshot omitted it, so the verification could not ask "which
 *      aircraft are these" and fell back to firing pick() at a grid of screen points. A method
 *      that looks like it answered while answering something else is the expensive kind of bug.
 *
 *   ③ ONE HEADER CARRIED TWO MEANINGS. `x-intmap-age-ms` was the SNAPSHOT'S AGE on the world
 *      channel and the OLDEST AIRCRAFT IN THE BOX on the view channel. Measured in production:
 *      12.7-13.5 s from one, 531-564 s from the other, alternating in a single field, so neither
 *      could be read. §22.2 requires the age of the ANSWER and the age of an OBSERVATION to be
 *      distinguishable, which is precisely the distinction that field destroyed.
 *
 *  ⚠ ③ IS THE ONE THAT COMES BACK. ① and ② are single lines; the conflation is a SHAPE — any new
 *  channel added to the function can reintroduce it by passing whichever age is at hand. So ⑤
 *  below does not look for the old spelling: it enumerates every binResponse() call site and
 *  requires each to name BOTH ages. A channel that omits one cannot be written.
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANYTHING IS COUNTED (scripts/code-only.mjs, #R345) — ten times
 *  now a check in this repository has matched the prose explaining it, and this file names the
 *  identifiers it is asserting about. ⚠ AND THE FILES ARE READ THROUGH readLF (scripts/eol.mjs,
 *  #R283): js/ is CRLF in this checkout and LF in CI, and #R317 measured what that costs — a
 *  check whose pattern spans a line break is otherwise permanently red on one platform and
 *  permanently green on the other, which is the same thing as never running.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const DETAIL = codeOnly(readLF('js/aircraft-detail.js'));
const LAYERS = codeOnly(readLF('js/data-layers.js'));
const LIVE   = codeOnly(readLF('js/aviation-live.js'));
const WORKER = codeOnly(readLF('src/aviation-worker.js'));
const FEED   = codeOnly(readLF('supabase/functions/aviation-feed/index.ts'));

test('R352 ① the detail card renders the source line it was GIVEN, not a provider literal', () => {
  /* The whole expression that builds the credit line, from the class name to the end of the
     statement. Whatever it is, the record's own value has to reach it. */
  const m = /acp-src[\s\S]{0,400}?;/.exec(DETAIL);
  assert.ok(m, '.acp-src is no longer built where this check expects it');
  const expr = m[0];

  assert.match(expr, /_srcLine/,
    'the card must render the source the record carries — this line was the literal that credited '
    + 'airplanes.live for adsb.lol data on every card production served');

  /* A provider name may still appear, but only BEHIND the record's value: the v1 rollback path
     (?aviation=v1) builds records with no _srcLine and really did use that provider. So the
     literal is required to sit on the right-hand side of a fallback, never on its own. */
  const literals = expr.match(/'[^']*(?:airplanes\.live|adsb\.lol|opensky)[^']*'/gi) || [];
  for (const lit of literals) {
    const at = expr.indexOf(lit);
    const before = expr.slice(Math.max(0, at - 40), at);
    assert.match(before, /_srcLine\s*\|\|\s*$/,
      `provider literal ${lit} is printed unconditionally; it must be the fallback after `
      + '`p._srcLine||`, otherwise a change of provider leaves this line crediting the old one');
  }
});

test('R352 ② the record the card is opened with carries that source line', () => {
  /* ① is only true if something sets _srcLine. The v2 path builds its records in _av2Plane(). */
  const m = /function _av2Plane\([\s\S]*?\n    \}/.exec(LAYERS);
  assert.ok(m, '_av2Plane is no longer shaped the way this check reads it');
  assert.match(m[0], /_srcLine\s*:\s*_planeSourceLine\(\)/,
    '_av2Plane must carry the same line the tooltip shows; without it the card falls through to '
    + 'the literal and ① is satisfied by a value nobody supplies');
});

test('R352 ③ snapshotFor() returns identity, not only geometry', () => {
  const m = /function snapshotFor\([\s\S]*?\n  \}/.exec(LIVE);
  assert.ok(m, 'snapshotFor is no longer shaped the way this check reads it');
  assert.match(m[0], /hex\s*:\s*hexOf\(/,
    'snapshotFor must name the aircraft it describes — production verification asked it for '
    + 'identities, got four geometry fields, and had to pick() a screen grid instead');
});

test('R352 ④ the two ages are two headers, and both are readable cross-origin', () => {
  assert.match(FEED, /"x-intmap-age-ms":/,    'the answer age header is gone');
  assert.match(FEED, /"x-intmap-oldest-ms":/, 'the observation age needs a header of its own');

  /* ⚠ #R341 measured what a missing entry here costs: the browser reads null for every custom
     header, with no error and no warning, and the ODbL attribution simply never appears. */
  const exp = /Access-Control-Expose-Headers"\s*:\s*((?:\s*"[^"]*"\s*\+?)+)/.exec(FEED);
  assert.ok(exp, 'Access-Control-Expose-Headers is no longer declared as a concatenation');
  const exposed = exp[1].replace(/["+\s]/g, ' ');
  for (const h of ['x-intmap-age-ms', 'x-intmap-oldest-ms']) {
    assert.ok(exposed.includes(h), `${h} is set but not exposed — JS would read null for it`);
  }
});

test('R352 ⑤ EVERY channel names both ages — the conflation cannot be reintroduced', () => {
  /* Enumerate the call sites by walking the parentheses, so a channel added later is included by
     existing rather than by matching a spelling this check happened to anticipate. */
  const sites = [];
  for (let i = FEED.indexOf('binResponse('); i >= 0; i = FEED.indexOf('binResponse(', i + 1)) {
    if (/[\w.]/.test(FEED[i - 1] || '')) continue;
    if (/function\s+$/.test(FEED.slice(Math.max(0, i - 12), i))) continue;
    let depth = 0, j = i + 'binResponse'.length;
    for (; j < FEED.length; j++) {
      const c = FEED[j];
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (!depth) break; }
    }
    sites.push(FEED.slice(i, j + 1));
  }

  assert.ok(sites.length >= 3,
    `expected every channel to answer through binResponse; found ${sites.length} call sites`);

  for (const site of sites) {
    const ch = (/channel:\s*"([^"]+)"/.exec(site) || [, '(unnamed)'])[1];
    assert.match(site, /\bageMs\s*:/,    `the ${ch} channel does not say how old its ANSWER is`);
    assert.match(site, /\boldestMs\s*:/, `the ${ch} channel does not say how old its OLDEST OBSERVATION is — `
      + 'that omission is exactly how one field came to carry both meanings');
  }

  /* The specific defect, named so it cannot come back by its original spelling either: the view
     channel passed the oldest aircraft in the box as the age of the answer. */
  assert.doesNotMatch(FEED, /ageMs\s*:\s*oldest\b/,
    'ageMs is being handed the oldest OBSERVATION again — that is the #R341 defect verbatim');
});

test('R352 ⑥ the oldest-observation age costs nothing per request', () => {
  /* The world channel serves the SAME cached bytes to everyone, so re-deriving this by walking up
     to 50,000 records on each request would buy nothing. It is recorded where the set is already
     being walked. */
  const start = FEED.indexOf('const force = url.searchParams');
  assert.ok(start > 0, 'the world channel is no longer spelled this way');
  const end = FEED.indexOf('channel: "world"', start);
  assert.ok(end > start, 'the world channel no longer names itself in its response');
  const handler = FEED.slice(start, end);
  assert.doesNotMatch(handler, /for\s*\([^)]*STATE\.world\.values\(\)/,
    'the world request path walks the whole set again; noteOldest() already records this where the '
    + 'set changes (build, hydrate, prune)');
  assert.match(FEED, /function noteOldest\(\)/, 'noteOldest is what makes ⑥ true');
  /* …and it has to actually be called from the places that change the set, or the field freezes. */
  const calls = (FEED.match(/\bnoteOldest\(\)/g) || []).length;
  assert.ok(calls >= 3, `noteOldest is called ${calls} times; the set changes in more places than that`);
});

test('R352 ⑦ the worker keeps the two ages apart all the way to stats()', () => {
  assert.match(WORKER, /x-intmap-age-ms/,    'the worker stopped reading the answer age');
  assert.match(WORKER, /x-intmap-oldest-ms/, 'the worker never reads the observation age');
  /* Two headers read into one field would be the same defect one layer down. */
  assert.doesNotMatch(WORKER, /S\.ageMs\s*=\s*Number\(r\.headers\.get\('x-intmap-oldest-ms'\)\)/,
    'the observation age is being stored as the answer age');

  for (const [src, name] of [[WORKER, 'src/aviation-worker.js'], [LIVE, 'js/aviation-live.js']]) {
    assert.match(src, /oldestObservationMs/, `${name} drops the observation age before anyone can read it`);
  }
  const st = /aircraftReceived[\s\S]{0,1200}/.exec(LIVE);
  assert.ok(st, 'stats() is no longer shaped the way this check reads it');
  assert.match(st[0], /serverAgeMs\s*:/,          'stats() no longer reports the answer age');
  assert.match(st[0], /oldestObservationMs\s*:/,  'stats() reports one age again — the two are not the same fact');
});

test('R352 ⑧ the codec and model mirrors are still byte-identical', async () => {
  /* The Edge Function imports its copies from supabase/functions/_shared/. A change to one side of
     a mirror that does not reach the other is a server decoding a wire format the browser no
     longer writes. */
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, ['scripts/sync-aviation.mjs', '--check'], { encoding: 'utf8' });
  assert.match(out, /in sync/, out);
});

test('R352 ⑨ the SHIPPING binResponse, actually run, emits two independent ages', () => {
  /* ⚠ SOURCE-LEVEL CHECKS ABOVE PROVE THE SPELLING; THIS ONE PROVES THE VALUES. #R317 measured
     what the difference is worth: a check that reads a function is satisfied by a function that
     is never reached, and #R341's whole diagnosis turned on a header whose VALUE — one em dash —
     made Deno throw. So the two helpers are lifted out of the deployed file and executed here
     against the platform's own Response, exactly as Deno would construct it. */
  const pick = (name) => {
    const at = FEED.indexOf('function ' + name + '(');
    assert.ok(at >= 0, name + ' is gone from the Edge Function');
    let depth = 0, i = FEED.indexOf('{', at);
    for (let j = i; j < FEED.length; j++) {
      if (FEED[j] === '{') depth++;
      else if (FEED[j] === '}') { depth--; if (!depth) return FEED.slice(at, j + 1); }
    }
    throw new Error(name + ' does not close');
  };

  const make = new Function(
    'CORS', 'ATTRIBUTION', 'STATE',
    pick('hdr') + '\n' + pick('binResponse') + '\nreturn binResponse;',
  );
  const binResponse = make({ 'access-control-allow-origin': '*' }, { adsblol: 'adsb.lol - ODbL 1.0' }, { saveNote: '' });

  /* The two facts the production measurement found fused: a FRESH answer that happens to contain
     an OLD observation. If one field carried both, one of these numbers would be missing. */
  const r = binResponse(new Uint8Array(8), {
    provider: 'adsblol', count: 12, ageMs: 350, oldestMs: 540_000,
    seq: 7, channel: 'view', ttlMs: 15000, coverage: 'partial',
  });
  assert.equal(r.headers.get('x-intmap-age-ms'), '350',
    'the age of the ANSWER is not what was passed as the age of the answer');
  assert.equal(r.headers.get('x-intmap-oldest-ms'), '540000',
    'the age of the OLDEST OBSERVATION is not reported');
  assert.notEqual(r.headers.get('x-intmap-age-ms'), r.headers.get('x-intmap-oldest-ms'),
    'both headers carry the same number for inputs 350 ms apart from 540 s — they are fused again');

  /* Infinity is what `now - 0` gives before the first refresh, and String(Infinity) is a header
     value no client can parse. Both fields have to survive it as numbers. */
  const cold = binResponse(new Uint8Array(0), {
    provider: 'adsblol', count: 0, ageMs: Infinity, oldestMs: Infinity,
    seq: 0, channel: 'world', ttlMs: 30000, coverage: '',
  });
  for (const h of ['x-intmap-age-ms', 'x-intmap-oldest-ms']) {
    assert.ok(Number.isFinite(Number(cold.headers.get(h))), h + ' is not a number a client can parse');
  }
});
