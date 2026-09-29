/* ============================================================================
 *  ROUTING · THE STORE AND THE PANEL — 経路の状態・パネル・カード
 * ----------------------------------------------------------------------------
 *  js/routing-store.js (the journey state, pure and measured in Node) and the route panel and cards
 *  around it: options, units, times, alternatives, turns, export and sharing, the doors in, minimising,
 *  closing, and what a selection may and may not do to the camera.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSafe } from './helpers/safe-html.mjs';
import { until } from './helpers/wx-ecmwf-page.mjs';
import { readLF } from '../scripts/eol.mjs';
import { ROOT, isolate, read } from './helpers/geo-shared.mjs';
import { resolveValue as zResolve, tokens as zTokens } from '../scripts/z-layers.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R291 · the route store and panel   (was tests/r291-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  IntMap · #R291 — the routing subsystem, verified without a browser
 * ----------------------------------------------------------------------------
 *  「経路計算、UI表示、Atlas表示で異なる結果や状態を持たせない。」
 *  「新規テストは、外部サービスへ依存しない決定的なテストを中心にしてください。」
 *
 *  The four pure modules this round adds — the store, the provider capability table, the shared
 *  render layer and the export — touch no DOM, no renderer and no network, which is the property
 *  that lets §24.1's whole list be answered here instead of through a browser boot. What is left
 *  for tests/smoke.spec.js is only what genuinely needs a page: the entry in Layers → Tools, the
 *  combobox keyboard, the bottom sheet and the map's own layers.
 *
 *  ⚠ SOURCES ARE READ THROUGH scripts/eol.mjs (#R283) — line endings belong to the checkout.
 * ==========================================================================*/
describe('§ #R291 · the route store and panel', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  const ROOT = fileURLToPath(new URL('../', import.meta.url));
  const read = (p) => readLF(resolve(ROOT, p));
  /* ⚠ AN «X IS GONE» CHECK MUST READ THE CODE, NOT THE NOTE THAT SAYS X IS GONE.
     Every such assertion in this project has, at some point, been satisfied or defeated by its own
     explanatory comment ([[intmap-recurring-lessons]] records the shape fourteen times, and three of
     the checks below hit it on their first run: `<style>` matched 「this file adds no <style>」,
     `max="2025"` matched 「max="2025"の固定値を廃止し」, `.rp-close').onclick` matched the sentence
     describing the handler that was deleted). So the negative checks read a comment-free copy. */
  const bare = (p) => read(p)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/(^|[^:'"\\`])\/\/.*$/, '$1')).join('\n');

  /* ── the browser shim these four modules need, and nothing more ─────────────────────────────────
     `pick` / `t` reproduce js/lang-registry.js's positional rule for the five languages the call
     sites carry; a language past them falls to English, exactly as the registry does when its inline
     table has no row. Nothing under test depends on WHICH language it gets — only that it gets one. */
  const IDX = { en: 0, jp: 1, de: 2, ru: 3, es: 4 };
  function makeWindow() {
    const w = {};
    w.IntMapLang = {
      pick(get) {
        const f = function () {
          const i = IDX[(() => { try { return get(); } catch { return 'en'; } })()];
          const v = (i != null && i > 0) ? arguments[i] : null;
          return (v != null && v !== '') ? v : arguments[0];
        };
        f.arr = (a) => (Array.isArray(a) ? f.apply(null, a) : String(a == null ? '' : a));
        return f;
      },
      t(lang, ...a) { const i = IDX[lang]; return (i != null && a[i] != null && a[i] !== '') ? a[i] : a[0]; },
      pickArgs() { return function () { return Array.prototype.slice.call(arguments); }; },
      locale(l, d) { return ({ en: 'en-GB', jp: 'ja-JP', de: 'de-DE', ru: 'ru-RU', es: 'es-ES' })[l] || d || 'en'; },
    };
    installSafe(w);   /* js/routing-cards.js escapes through window.IntMapSafe — the shipped one, not a stub */
    return w;
  }
  function load(w, ...files) {
    for (const f of files) {
      const src = readFileSync(resolve(ROOT, f), 'utf8');
      // eslint-disable-next-line no-new-func
      new Function('window', 'Intl', 'Date', 'Math', 'console', src)(w, Intl, Date, Math, console);
    }
    return w;
  }
  function fresh() {
    return load(makeWindow(), 'js/routing-store.js', 'js/routing-providers.js', 'js/routing-cards.js', 'js/routing-export.js');
  }
  const PLACE = (lng, lat, name) => ({ lng, lat, name, kind: 'place' });

  /* ══ ① THE STORE IS THE ONE PLACE THE JOURNEY LIVES ═══════════════════════════════════════════ */
  test('R291 ① the store holds a journey, and only a resolved place counts as a point', () => {
    const w = fresh(); const S = w.IntMapRouteStore;
    assert.equal(S._pure.ready(S.get()), false, 'an empty store is not routable');
    S.setText('from', 'Tok');
    assert.equal(S._pure.ready(S.get()), false, 'half-typed text is not a place');
    S.setPlace('from', PLACE(139.7671, 35.6812, 'Tokyo'));
    S.setPlace('to', PLACE(139.638, 35.4658, 'Yokohama'));
    assert.equal(S._pure.ready(S.get()), true);
    const pts = S._pure.points(S.get());
    assert.equal(pts.length, 2);
    /* an UNRESOLVED stop is skipped rather than sent as a coordinate */
    S.addVia(null);
    assert.equal(S._pure.points(S.get()).length, 2, 'an empty stop must not become a waypoint');
    S.setPlace(0, PLACE(139.7, 35.55, 'Kawasaki'));
    assert.equal(S._pure.points(S.get()).length, 3);
  });

  /* ⚠ ② THE DEFECT §4.4 NAMES: a confirmed coordinate behind an edited label ───────────────────── */
  test('R291 ② editing the text invalidates the coordinate that was confirmed for it', () => {
    const w = fresh(); const S = w.IntMapRouteStore;
    S.setPlace('to', PLACE(139.638, 35.4658, 'Yokohama'));
    assert.ok(S.get().to.place, 'the place is confirmed');
    S.setText('to', 'Yokoham');                       /* one character deleted */
    assert.equal(S.get().to.place, null, 'the old coordinate must not survive an edit');
    assert.equal(S._pure.ready(S.get()), false);
    /* …and setting the SAME text a place already carries must not clear it (a re-render writes it back) */
    S.setPlace('to', PLACE(139.638, 35.4658, 'Yokohama'));
    S.setText('to', 'Yokohama');
    assert.ok(S.get().to.place, 'writing the identical label back is not an edit');
  });

  /* ⚠ ③ SWAP REVERSES THE ITINERARY (§5.3) — the old panel exchanged only A and B ──────────────── */
  test('R291 ③ A → 1 → 2 → B swapped is B → 2 → 1 → A, not B → 1 → 2 → A', () => {
    const w = fresh(); const S = w.IntMapRouteStore;
    S.setPlace('from', PLACE(0, 0, 'A'));
    S.setPlace('to', PLACE(3, 3, 'B'));
    S.addVia(PLACE(1, 1, '1')); S.addVia(PLACE(2, 2, '2'));
    S.swap();
    const names = S._pure.points(S.get()).map((p) => p.name);
    assert.deepEqual(names, ['B', '2', '1', 'A']);
    S.swap();
    assert.deepEqual(S._pure.points(S.get()).map((p) => p.name), ['A', '1', '2', 'B'], 'and back again');
  });

  test('R291 ④ a stop moves within the list, and the ends never move', () => {
    const w = fresh(); const S = w.IntMapRouteStore;
    S.setPlace('from', PLACE(0, 0, 'A')); S.setPlace('to', PLACE(9, 9, 'B'));
    ['1', '2', '3'].forEach((n, i) => S.addVia(PLACE(i + 1, i + 1, n)));
    S.moveVia(2, 0);
    assert.deepEqual(S._pure.points(S.get()).map((p) => p.name), ['A', '3', '1', '2', 'B']);
    S.moveVia(0, 99);                                  /* clamped, not thrown */
    assert.deepEqual(S._pure.points(S.get()).map((p) => p.name), ['A', '1', '2', '3', 'B']);
    S.moveVia(-1, 0);                                  /* ignored */
    assert.deepEqual(S._pure.points(S.get()).map((p) => p.name), ['A', '1', '2', '3', 'B']);
  });

  /* ⚠ ⑤ A STALE ANSWER MUST NOT BECOME THE STATE (§8.3/§23) ────────────────────────────────────── */
  test('R291 ⑤ a result from a superseded request is refused by the store', () => {
    const w = fresh(); const S = w.IntMapRouteStore;
    S.setPlace('from', PLACE(0, 0, 'A')); S.setPlace('to', PLACE(1, 1, 'B'));
    const first = S.begin('a');
    const second = S.begin('b');                        /* the reader changed something */
    assert.equal(S.settle(first, { ok: true, routeSetId: 'rs1', duration: 10 }), false,
      'the OLD request must not be able to write the state');
    assert.equal(S.get().result, null);
    assert.equal(S.settle(second, { ok: true, routeSetId: 'rs2', duration: 20 }), true);
    assert.equal(S.get().routeSetId, 'rs2');
    assert.equal(S.hasRoute(), true);
    /* …and clearing is the only thing that throws it away */
    S.clearRoute();
    assert.equal(S.hasRoute(), false);
    assert.equal(S.get().from.place.name, 'A', 'clearing the ROUTE does not clear the journey');
  });

  /* ⚠ ⑥ THE REQUEST IS DERIVED, SO ATLAS AND THE PANEL CANNOT BUILD DIFFERENT ONES (§17) ───────── */
  test('R291 ⑥ the request options come out of the state, once', () => {
    const w = fresh(); const S = w.IntMapRouteStore;
    S.setPlace('from', PLACE(11, 51, 'A')); S.setPlace('to', PLACE(12, 52, 'B'));
    S.addVia(PLACE(11.5, 51.5, '1'));
    S.setMode('driving'); S.setAvoid('toll', true);
    let r = S.requestOptions();
    assert.deepEqual(r.opts.avoid, ['toll']);
    assert.equal(r.opts.via.length, 1);
    assert.equal(r.opts.time, undefined, 'no time was chosen, so none is sent');
    /* transit-only options are not sent on a road request, and vice versa */
    S.setTransitModes(['RAIL']); S.setMaxWalk(800);
    r = S.requestOptions();
    assert.equal(r.opts.transitModes, undefined);
    assert.equal(r.opts.maxWalkM, undefined);
    S.setMode('transit');
    r = S.requestOptions();
    assert.deepEqual(r.opts.transitModes, ['RAIL']);
    assert.equal(r.opts.maxWalkM, 800);
    assert.equal(r.opts.avoid, undefined, 'the avoid chips are a road capability');
  });

  /* ⚠ ⑦ THE TIME THE READER TYPED IS IN THE APP'S ZONE, NOT THE DEVICE'S (§7.1) ────────────────── */
  test('R291 ⑦ a departure time is written in the clock timezone the app is set to', () => {
    const w = fresh(); const S = w.IntMapRouteStore;
    S.setPlace('from', PLACE(0, 0, 'A')); S.setPlace('to', PLACE(1, 1, 'B'));
    S.setWhen('depart', '2026-08-21T14:30');
    const tokyo = S._pure.whenISO(S.get(), 'Asia/Tokyo');
    assert.equal(new Date(tokyo).toISOString(), '2026-08-21T05:30:00.000Z',
      '14:30 in Asia/Tokyo is 05:30Z whatever the machine running this is set to');
    const utc = S._pure.whenISO(S.get(), 'UTC');
    assert.equal(new Date(utc).toISOString(), '2026-08-21T14:30:00.000Z');
    /* ⚠ AND A DST BOUNDARY IS NOT A FIXED OFFSET: the same wall clock in New York is −4 in August
       and −5 in January, and the conversion has to read the offset AT THAT INSTANT. */
    S.setWhen('depart', '2026-08-21T12:00');
    assert.equal(new Date(S._pure.whenISO(S.get(), 'America/New_York')).toISOString(), '2026-08-21T16:00:00.000Z');
    S.setWhen('depart', '2026-01-21T12:00');
    assert.equal(new Date(S._pure.whenISO(S.get(), 'America/New_York')).toISOString(), '2026-01-21T17:00:00.000Z');
    S.setWhen('now', '');
    assert.equal(S._pure.whenISO(S.get(), 'UTC'), null, '“leave now” sends no time at all');
  });

  /* ══ ⑧ WHAT EACH PROVIDER CAN DO IS DATA, AND THE UI READS IT (§8.1/§14.1) ════════════════════ */
  test('R291 ⑧ provider capabilities decide what may be offered, and none of them has traffic', () => {
    const w = fresh(); const P = w.IntMapRouteProviders;
    assert.equal(P.supports('driving', 'liveTraffic'), false);
    assert.equal(P.supports('transit', 'liveTraffic'), false);
    /* ⚠ (#R347) THIS ASSERTION MOVED FROM A SPELLING TO A PROPERTY. It used to read
       `p.liveTraffic === false` on every provider, which asserted BOTH «nobody has traffic» and
       «the flag is spelled liveTraffic on the provider object». #R347 added a provider that does have
       traffic, behind a key this repository does not hold — so the first half is now a claim about
       AVAILABILITY, not about the table, and pinning the second half would have made a correct
       implementation fail. The property that must survive is: nothing may offer traffic to a reader
       unless a provider that really carries it is usable RIGHT NOW. */
    P.list().forEach((p) => {
      if (p.caps.traffic) {
        assert.equal(p.keyed, true, `${p.id} claims traffic, so it must need a key — no open router has it`);
        assert.notEqual(P.availability(p.id), true,
          `${p.id} may not be available until a probe says its key is configured`);
      }
    });
    assert.equal(P.supports('driving', 'avoid'), true);
    assert.equal(P.supports('walking', 'avoid'), false, 'the toll/highway/ferry chips are driving-only');
    assert.equal(P.supports('walking', 'avoidAreas'), true, 'a drawn keep-out area works on foot too');
    assert.equal(P.supports('transit', 'arriveBy'), true);
    assert.equal(P.supports('driving', 'arriveBy'), false, 'no road provider takes an arrival time');
    assert.equal(P.supports('transit', 'realtimeTransit'), true);
    assert.ok(P.maxVia('driving') > 0 && P.maxVia('driving') < 100,
      'the stop limit is derived from a provider, not a made-up constant');
  });

  test('R291 ⑨ choosing a provider by capability says what choosing it costs', () => {
    const w = fresh(); const P = w.IntMapRouteProviders;
    const plain = P.forRequest({ mode: 'driving' });
    assert.equal(plain.provider.id, 'osrm');
    assert.deepEqual(plain.lost, [], 'a plain A→B keeps its alternatives');
    const withVia = P.forRequest({ mode: 'driving', via: [{}] });
    assert.deepEqual(withVia.lost, ['alternatives'], 'stops cost the alternatives on this provider (§9.2)');
    const avoiding = P.forRequest({ mode: 'driving', avoid: ['toll'] });
    assert.equal(avoiding.provider.id, 'valhalla', 'only Valhalla honours an avoid list');
    assert.deepEqual(avoiding.lost, ['alternatives']);
    assert.equal(avoiding.fallback.id, 'osrm');
    const area = P.forRequest({ mode: 'walking', avoidAreas: [[]] });
    assert.equal(area.provider.id, 'valhalla', 'a keep-out area is a capability, on foot as well');
    const transit = P.forRequest({ mode: 'transit' });
    assert.equal(transit.provider.id, 'motis');
    assert.equal(transit.fallback.id, 'jr-bridge');
  });

  /* ══ ⑩ THE SHARED RENDER LAYER (§17) ═════════════════════════════════════════════════════════ */
  test('R291 ⑩ distances follow the measurement-units setting, in one place', () => {
    const w = fresh(); const C = w.IntMapRouteCards;
    assert.equal(C.distance(31_000, { lang: 'en', units: 'metric' }), '31 km');
    /* the two systems round the same way — one decimal under ten, whole numbers above */
    assert.equal(C.distance(31_000, { lang: 'en', units: 'imperial' }), '19 mi');
    assert.equal(C.distance(9_000, { lang: 'en', units: 'imperial' }), '5.6 mi');
    assert.equal(C.distance(31_000, { lang: 'en', units: 'both' }), '31 km (19 mi)');
    assert.equal(C.distance(420, { lang: 'en', units: 'metric' }), '420 m', 'metric flips to metres under 1 km');
    assert.equal(C.distance(120, { lang: 'en', units: 'imperial' }), '394 ft', 'imperial flips to feet');
    assert.equal(C.duration(90 * 60, { lang: 'en' }), '1 h 30 min');
    assert.equal(C.duration(45, { lang: 'en' }), '1 min');
    assert.match(C.duration(90 * 60, { lang: 'jp' }), /時間/, 'and it is translated');
  });

  test('R291 ⑪ an arrival time is a clock time in the app’s zone, and says so when it lands tomorrow', () => {
    const w = fresh(); const C = w.IntMapRouteCards;
    const start = Date.UTC(2026, 7, 21, 22, 0, 0);
    assert.equal(C.clock(start, { lang: 'en', tz: 'UTC' }), '22:00');
    assert.equal(C.clock(start, { lang: 'en', tz: 'Asia/Tokyo' }), '07:00', 'the same instant, the app’s zone');
    const eta = C.eta(start, 4 * 3600, { lang: 'en', tz: 'UTC' });
    assert.match(eta, /^02:00/);
    assert.match(eta, /next day/i, 'a journey that crosses midnight must say so');
    assert.equal(/next day/i.test(C.eta(start, 3600, { lang: 'en', tz: 'UTC' })), false);
  });

  /* ⚠ ⑫ «LIVE» IS EARNED, NEVER ASSUMED (§13.1) ────────────────────────────────────────────────── */
  test('R291 ⑫ real-time, partly real-time and timetable are three different answers', () => {
    const w = fresh(); const C = w.IntMapRouteCards;
    const walk = { walk: 1, mode: 'WALK', duration: 300 };
    const live = (delay) => ({ walk: 0, mode: 'RAIL', duration: 900, rt: true, delay });
    const sched = { walk: 0, mode: 'BUS', duration: 900, rt: false, delay: 0 };
    assert.equal(C.realtimeOf([walk, sched]).kind, 'timetable');
    assert.equal(C.realtimeOf([walk, live(0)]).kind, 'live');
    assert.equal(C.realtimeOf([walk, live(3), sched]).kind, 'partial',
      'one live leg out of two does not make the itinerary live');
    assert.equal(C.realtimeOf([walk, live(3), live(7)]).delay, 7, 'the worst delay is the one to report');
    assert.equal(C.realtimeOf([walk]).kind, 'timetable', 'an all-walk plan rides nothing');
    /* a delay of zero is «on time», not «+0 min» (§13.1) */
    assert.match(C.delayText(0, { lang: 'en' }), /on time/);
    assert.match(C.delayText(4, { lang: 'en' }), /\+4/);
    assert.match(C.delayText(-2, { lang: 'en' }), /early/);
    /* only a genuinely real-time leg is badged */
    assert.equal(C.legBadge(sched, { lang: 'en' }), '');
    assert.equal(C.legBadge(walk, { lang: 'en' }), '');
    assert.match(C.legBadge(live(5), { lang: 'en' }), /rt-badge/);
  });

  test('R291 ⑬ an alternative card is selectable, labelled and not distinguished by colour alone', () => {
    const w = fresh(); const C = w.IntMapRouteCards;
    const alts = [{ duration: 2160, distance: 31000, label: 'Fastest', color: '#1a73e8', roads: ['A1'] },
                  { duration: 2460, distance: 39000, label: '+5 min', color: '#e8710a', roads: ['E83'] }];
    const html = C.altCards(alts, { lang: 'en', units: 'metric', sel: 1, setId: 'rs7', startMs: Date.UTC(2026, 0, 1, 9, 0) });
    assert.match(html, /data-rset="rs7"/);
    assert.match(html, /role="radiogroup"/);
    assert.equal((html.match(/role="radio"/g) || []).length, 2);
    assert.equal((html.match(/aria-checked="true"/g) || []).length, 1, 'exactly one is selected');
    /* ⚠ (#R296) `tabindex` sits between the two attributes now, because the card is a `div[role=radio]`
       rather than a `<button>` — 「経路カードが広がって詳細が表示されるUIに」, and a list of step BUTTONS
       cannot be nested inside a button (which is the reason #R291 put the detail below the list). What
       is asserted is unchanged: the selected card is the one the caller named. */
    assert.match(html, /aria-checked="true"[^>]*data-ai="1"/, 'and it is the one the caller named');
    assert.match(html, /<div class="rt-alt on"/, 'a card is an element that can contain the turn list');
    const withDetail = C.altCards(alts, { lang: 'en', units: 'metric', sel: 1, setId: 'rs7', detail: () => '<b id="dtl">x</b>' });
    assert.match(withDetail, /aria-checked="true"[\s\S]*?rt-alt-detail[\s\S]*?id="dtl"/, 'and the SELECTED card holds it');
    assert.equal((withDetail.match(/rt-alt-detail/g) || []).length, 1, 'only the selected one');
    assert.match(html, /aria-label="[^"]*Fastest/, 'the label is in the accessible name, not only in colour');
    assert.match(html, /rt-alt-key[^>]*>1</, 'each card carries its own number, matching the map');
    assert.match(html, /A1/, 'the road that makes this route different is named (§9.1)');
    assert.match(html, /arrive/, 'and the arrival time');
  });

  test('R291 ⑭ a turn is a button with an icon, a sentence and a spoken lane description', () => {
    const w = fresh(); const C = w.IntMapRouteCards;
    const mv = () => ({ icon: '→', text: 'Turn right onto A1', lane: '▯▮▮', key: 'right' });
    const html = C.stepRows([{ distance: 1200 }], { lang: 'en', units: 'metric', maneuver: mv, step: 0 });
    assert.match(html, /<button type="button" class="rt-step on"/, 'a step is a button, not a div with a click');
    assert.match(html, /aria-current="step"/);
    assert.match(html, /1\.2 km/);
    assert.match(html, /Lanes: use 2, 3 of 3/, 'the lane bars are described, not only drawn (§12/§19)');
    assert.equal(C.laneText('▯▯', { lang: 'en' }), '', 'no valid lane means nothing to say');
    assert.match(C.stepRows([{ distance: 5 }], { lang: 'en', units: 'metric', maneuver: mv }), /aria-current="false"/);
  });

  test('R291 ⑮ the honest notes exist for every shortfall, and none of them claims traffic', () => {
    const w = fresh(); const C = w.IntMapRouteCards;
    for (const k of ['roadTypical', 'altsViaOsrm', 'altsAvoid', 'avoidDropped', 'areaDropped',
      'motorwayPref', 'shapeGap', 'jrEstimate', 'transitTimetable', 'transitLive']) {
      assert.match(C.note(k, { lang: 'en', mode: 'driving' }), /rt-note/, k + ' must have a sentence');
      assert.match(C.note(k, { lang: 'jp', mode: 'driving' }), /rt-note/, k + ' must have a Japanese one');
    }
    assert.match(C.note('roadTypical', { lang: 'en', mode: 'driving' }), /live traffic is not included/i);
    assert.equal(C.note('nothing-like-this', { lang: 'en' }), '', 'an unknown note prints nothing rather than a stub');
    assert.match(C.providerLine('osrm', { lang: 'en' }), /OSRM/);
    assert.equal(C.providerLine('a-provider-that-does-not-exist', { lang: 'en' }), '');
  });

  /* ══ ⑯ EXPORT AND SHARE (§16) ════════════════════════════════════════════════════════════════ */
  test('R291 ⑯ GPX and GeoJSON keep the shapes older files had, and gain the metadata', () => {
    const w = fresh(); const X = w.IntMapRouteExport;
    const payload = {
      coords: [[139.7, 35.6], [139.6, 35.5]], distance: 31000, duration: 2160,
      mode: 'driving', provider: 'osrm', avoid: ['toll'], avoidAreas: 1, liveTraffic: false,
      generatedISO: '2026-08-21T00:00:00.000Z',
      waypoints: [{ lng: 139.7, lat: 35.6, name: 'Tokyo', role: 'start' }, { lng: 139.6, lat: 35.5, name: 'Yokohama', role: 'destination' }],
    };
    const gpx = X.gpx(payload);
    assert.match(gpx, /<trk><name>IntMap route<\/name><trkseg>/, 'the shape an existing reader parses');
    assert.match(gpx, /<trkpt lat="35\.600000" lon="139\.700000"\/>/);
    assert.match(gpx, /<metadata>/);
    assert.match(gpx, /<wpt [^>]*><name>Tokyo<\/name><type>start<\/type><\/wpt>/);
    assert.match(gpx, /live_traffic=no/, 'the file says what it does NOT contain');
    const gj = JSON.parse(X.geojson(payload));
    assert.equal(gj.features[0].geometry.type, 'LineString');
    assert.equal(gj.features[0].properties.source, 'IntMap');
    assert.equal(gj.features[0].properties.distance_m, 31000);
    assert.equal(gj.features[0].properties.live_traffic, false);
    assert.equal(gj.features.filter((f) => f.geometry.type === 'Point').length, 2);
    assert.equal(X.gpx({ coords: [] }), null, 'no route is not an empty file');
  });

  test('R291 ⑰ a shared route carries the places and NOT the geometry, and survives a round trip', () => {
    const w = fresh(); const S = w.IntMapRouteStore; const X = w.IntMapRouteExport;
    S.setPlace('from', PLACE(139.76712345, 35.68123456, 'Tokyo Station'));
    S.setPlace('to', PLACE(135.5, 34.7335, 'Shin-Osaka'));
    S.addVia(PLACE(136.8816, 35.1706, 'Nagoya'));
    S.setMode('transit'); S.setWhen('arrive', '2026-08-21T09:00'); S.setSel(2);
    const packed = X.encodeShare(S.get());
    const wire = JSON.stringify(packed);
    assert.ok(wire.length < 400, 'a share payload must fit an address bar — it was ' + wire.length + ' bytes');
    assert.equal(/coordinates|LineString|geometry/.test(wire), false, 'no geometry travels (§16.2)');
    const back = X.decodeShare(packed);
    assert.equal(back.from.name, 'Tokyo Station');
    assert.equal(back.via.length, 1);
    assert.equal(back.via[0].name, 'Nagoya');
    assert.equal(back.mode, 'transit');
    assert.equal(back.when.kind, 'arrive');
    assert.equal(back.sel, 2);
    assert.equal(Math.abs(back.from.lng - 139.76712345) < 1e-4, true, 'about a metre of precision is kept');
    /* a hostile or truncated payload yields null rather than a half-applied journey */
    assert.equal(X.decodeShare(null), null);
    assert.equal(X.decodeShare({ f: ['x', 'y'], t: [1, 2] }), null);
    assert.equal(X.decodeShare({ f: [1, 2], t: [3, 4], m: 'teleport' }).mode, 'driving', 'an unknown mode falls back');
    assert.deepEqual(X.decodeShare({ f: [1, 2], t: [3, 4], a: ['toll', 'rockets'] }).avoid, ['toll']);
    /* what the reader is told they are sending */
    const d = X.describe(S.get());
    assert.equal(d.from, 'Tokyo Station'); assert.equal(d.stops, 1); assert.equal(d.timed, true);
  });

  /* ══ ⑱ THE ENTRY — §2, and the defect that made it the first thing this round did ═════════════ */
  test('R291 ⑱ the official door is Layers → Tools → Directions, and nothing else was added', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（扉はパネルと道具メニュー）。 */
    const ui = read('js/map-ui.js');
    assert.match(ui, /id:'tool\.directions'/, 'the Tools list must carry the routing row');
    assert.match(ui, /run:_lazy\('routeUi'/, 'and it opens the panel through the lazy module');
    assert.match(ui, /mod:'IntMapRouteUI'/, 'so the row can read whether the panel is open');
    /* the row's own text, in the three places §2.2 names */
    assert.match(ui, /T\('Directions','経路'/);
    assert.match(ui, /Plan routes by car, transit, walking or cycling/);
    assert.match(ui, /keys:'route directions/, 'and it is findable by search (§2.2)');
    /* ⚠ NO NEW PERSISTENT FLOATING BUTTON (§0/§2.1). The routing UI's only ids are the panel and its
       candidate popup; nothing in this round creates a map-anchored button. */
    const uiSrc = read('js/routing-ui.js');
    assert.equal(/m-fab|map-fab|floating-btn|position:fixed;\s*right/.test(uiSrc), false,
      'the panel must not grow a floating map button');
    const ids = [...uiSrc.matchAll(/\.id\s*=\s*'([^']+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(ids, ['route-panel', 'rtp-suggest']);
  });

  /* ⚠⚠ ⑲ (#R296) CLOSING **IS** CLEARING NOW, AND THAT IS THE READER'S DECISION ─────────────────
     #R291 read §2.2 as 「the panel's × must not destroy the route」 and made closing keep the drawing.
     「経路機能を閉じても地図に経路が残り続けるのをやめろ」 says the opposite in as many words, so the
     invariant is inverted rather than dropped: closing takes the route with it, and 「経路を消去」 still
     exists for a reader who wants a clean map with the panel open. ⚠ The ENDPOINTS survive either way,
     which is what keeps re-opening the panel a continuation rather than a blank form. */
  test('R291 ⑲ / R296 closing the panel takes the route off the map', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（close() はパネルと地図のレイヤー）。 */
    const src = read('js/routing-ui.js');
    const close = /function close\(\)\s*\{([\s\S]*?)\n    \}/.exec(src);
    assert.ok(close, 'close() must be findable');
    assert.match(close[1], /RT\(\)\.clear\(\); RT\(\)\.clearAreas\(\)/,
      'closing the panel clears the drawn route and the keep-out areas');
    assert.equal(/setPlace|clearEndpoints|reset\(\)/.test(close[1]), false,
      'and does NOT throw away the endpoints — re-opening shows the same journey');
    assert.match(src, /\.rtp-clear'\)\.addEventListener\('click', clearRoute\)/,
      'the explicit button still clears WITHOUT closing');
    /* the old panel's × called clear() — the shape must be gone from js/routing.js too */
    const r = bare('js/routing.js');
    assert.equal(/rp-close/.test(r), false, 'the old close-and-clear handler is gone from the code');
    /* the Tools row closes the PANEL, never the route */
    const ui = read('js/map-ui.js');
    assert.match(ui, /const _toolOff=\(t\)=>\{ const m=_tmod\(t\); if\(!m\|\|typeof m\.close!=='function'\) return false;/);
  });

  /* ⚠ ⑳ THE PANEL DOES NOT LIVE IN js/app-body.js, AND ITS STYLE IS IN THE STYLESHEET (§0/§18) ─── */
  test('R291 ⑳ no new code in the app shell, and no new inline-style panel', () => {
    /* 綴りのまま: 主張が app shell／バンドルの import グラフという静的な構造で、実行しても観測できない。 */
    const body = read('js/app-body.js');
    assert.equal(/routeUi|IntMapRouteUI|routing-ui/.test(body), false,
      '「js/app-body.js へ新機能を追加しない」 — the panel is mounted by js/lazy-modules.js');
    /* (#R795, completed in gate-parity-and-shards) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. #R795's own detector missed this one on its spelling; tests/helpers/line-ceilings.mjs asks about the fact. */
    const ui = bare('js/routing-ui.js');
    assert.equal(/<style|createElement\('style'\)/.test(ui), false, 'the CSS is in css/intmap.css');
    /* the panel it replaces was ~9 kB of `style="…"`; what is left is per-instance geometry only */
    const inline = [...ui.matchAll(/style="[^"]*"/g)].map((m) => m[0]);
    assert.ok(inline.length <= 6, 'inline style strings in the panel: ' + inline.length + ' — ' + inline.join(' | '));
    const css = read('css/intmap.css');
    for (const cls of ['.rtp{', '.rtp-suggest{', '.rt-alt{', '.rt-step{', '.rt-leg{', '.rtp-grip{']) {
      assert.ok(css.includes(cls), 'css/intmap.css is missing ' + cls);
    }
    assert.match(css, /@media \(max-width:767px\)\{[\s\S]*?\.rtp\{/, 'the phone layout must exist');
    assert.match(css, /env\(safe-area-inset-bottom/, 'and be safe-area aware');
    assert.match(css, /--rtp-kb/, 'and lift for the on-screen keyboard (§3.2)');
  });

  /* ⚠ ㉑ ONE RENDER LAYER — Atlas and the panel draw the same card (§17) ────────────────────────── */
  test('R291 ㉑ Atlas and the panel call the same renderer, and neither keeps a private copy', () => {
    /* 綴りのまま: 主張が「2 つ目が無い／1 か所だけ」という構造の不在で、実行した答えからは不在を観測できない（描画器の写しが無いこと）。 */
    const atlas = read('js/atlas-console.js');
    assert.match(atlas, /window\.IntMapRouteCards\.altCards\(/, 'Atlas builds its cards from the shared layer');
    assert.match(atlas, /window\.IntMapRouteCards\.legRows\(/);
    assert.match(atlas, /window\.IntMapRouteCards\.stepRows\(/);
    const panel = read('js/routing-ui.js');
    assert.match(panel, /CD\(\)\.altCards\(/); assert.match(panel, /CD\(\)\.legRows\(/); assert.match(panel, /CD\(\)\.stepRows\(/);
    /* ⚠ AND THE ROUTER NO LONGER RENDERS. `stepRows` / `legRows` were declared in js/routing.js and
       were a second implementation of exactly these — that is the duplicate §17 forbids. */
    const r = read('js/routing.js');
    assert.equal(/function stepRows\(|function legRows\(/.test(r), false,
      'js/routing.js must not carry its own step/leg renderer any more');
    /* both surfaces share the SELECTION too, which is what lets a tap on the map drive a card */
    assert.match(r, /ST\.setSel\(i\)/, 'selectAlt writes the store');
    assert.match(r, /onLayer\('click','imroute-hit'/, 'and the map line is clickable');
  });

  /* ⚠ ㉒ THE MAP DRAWS WHAT THE PANEL SAYS (§5.1/§11) ──────────────────────────────────────────── */
  test('R291 ㉒ every waypoint is lettered, the camera knows where the panel is, and the ends are not colour alone', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（地図のシンボルと fitBounds の padding）。 */
    const r = read('js/routing.js');
    assert.match(r, /function _wpLabel\(i,n\)\{ return i===0\?'A':\(i===n-1\?'B':String\(i\)\); \}/,
      'A / 1 / 2 / B is one rule, shared by the marker and the field');
    assert.match(r, /id:'imroute-wp',type:'symbol'/, 'the letters are drawn on the map, not implied');
    assert.match(r, /id:'imroute-hit'/, 'and there is a touch target wider than the line');
    assert.match(r, /function setInsets/, 'the camera can be told where the panel is (§11.3)');
    assert.equal(/fitBounds\(bb,\{padding:70/.test(r), false, 'the fixed padding:70 is gone');
    assert.match(r, /fitBounds\(bb,\{padding:_pad\(/, 'and replaced by the measured one');
    /* the unselected alternatives stay visible enough to be picked */
    assert.match(r, /op:on\?1:0\.55/, 'an alternative you cannot see is not an alternative you can pick');
    const ui = read('js/routing-ui.js');
    assert.match(ui, /function applyInsets\(\)/);
    assert.match(ui, /RT\(\)\.setInsets\(\{ bottom:/, 'the phone sheet reserves the bottom');
    assert.match(ui, /RT\(\)\.setInsets\(\{ left:/, 'the desktop panel reserves the left');
  });

  /* ⚠ ㉓ NOTHING IS FABRICATED, AND NOTHING SILENTLY IGNORED (§0/§8.4) ─────────────────────────── */
  test('R291 ㉓ an option that could not be applied is reported, not swallowed', () => {
    const r = read('js/routing.js');
    assert.match(r, /opts\._avoidDropped=true; opts\._areaDropped=true;/,
      'a keep-out area that could not be applied is distinguishable from an avoid option that could not');
    assert.match(r, /altsSuppressed:\(via\.length&&alts\.length<2\)\?'via':''/,
      'and «only one route, because you added a stop» is stated rather than left to be noticed');
    assert.match(r, /function _notesFor\(res\)/, 'the notes are computed from the RESULT');
    /* the fabrications the standing rules forbid, still forbidden */
    assert.match(r, /a broken\/absent TRANSIT leg shape is NEVER replaced by a station-to-\n[\s\S]{0,120}station straight line/,
      'the #R126 rule against a fake ride geometry must still be in force');
    /* ⚠ (#R347) THIS ASSERTION MOVED FROM «NOBODY HAS TRAFFIC» TO «NOBODY CLAIMS WHAT THEY DO NOT
       HAVE», for two independent reasons, both of which made the old form wrong rather than strict.
         · IT WAS READING A COMMENT. `bare()` exists in this file for exactly this, and this one line
           did not use it — so #R347's explanatory note in js/routing-cards.js («a duration that looks
           exactly like a traffic-aware one and is not») satisfied the pattern it was written to
           forbid. That is the shape this file's own header warns about, on its nineteenth occurrence.
         · THE PREMISE EXPIRED. #R347 added a provider that really does carry traffic. «No provider
           has traffic» is no longer a fact about this app, so a check that encodes it would have to be
           deleted the day the key is set — and a check that gets deleted was never guarding anything.
       What must stay true is the PROPERTY: a claim about traffic may only be printed when a provider
       that carries traffic is USABLE. That is a question about the table, not about the strings. */
    const cards = bare('js/routing-cards.js');
    const claims = /渋滞考慮|traffic-aware|with live traffic/.test(cards);
    const w2 = fresh();
    assert.equal(w2.IntMapRouteProviders.supports('driving', 'traffic'), false,
      'no traffic provider is usable in this checkout (none is configured)');
    assert.equal(claims, false,
      'nothing may claim traffic awareness while no provider that carries traffic is usable');
    /* …and the honest half: there IS a sentence for the case where traffic was wanted and not had */
    assert.match(cards, /trafficDropped/,
      'a route that could not get traffic says so — silence would read as «traffic was considered»');
  });

  /* ⚠ ㉔ THE HISTORICAL YEAR CEILING IS DERIVED, NOT TYPED (§15.6) ─────────────────────────────── */
  test('R291 ㉔ the historical-network year cannot be set into the future', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（入力欄の max と入力時の clamp）。 */
    const ui = bare('js/routing-ui.js');
    assert.equal(/max="\d{4}"/.test(ui), false, 'no literal year may be the ceiling');
    assert.match(ui, /const nowY = new Date\(\)\.getUTCFullYear\(\);/);
    assert.match(ui, /max="' \+ nowY \+ '"/, 'the input’s ceiling is this year');
    assert.match(ui, /y = Math\.max\(1800, Math\.min\(nowY, y\)\);/, 'and a typed year is clamped as well');
  });

  /* ⚠ ㉕ ACCESSIBILITY IS IN THE MARKUP, NOT IN A PROMISE (§19) ────────────────────────────────── */
  test('R291 ㉕ the panel is operable and describable without sight or a mouse', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（ARIA 属性とキーボード操作）。 */
    const ui = read('js/routing-ui.js');
    assert.match(ui, /role', 'dialog'/);
    assert.match(ui, /aria-labelledby', 'rtp-title'/);
    assert.match(ui, /role="combobox"/); assert.match(ui, /aria-autocomplete="list"/);
    assert.match(ui, /role', 'listbox'/); assert.match(ui, /role="option"/);
    assert.match(ui, /aria-activedescendant/);
    assert.match(ui, /aria-pressed/); assert.match(ui, /role="tablist"/); assert.match(ui, /role="tabpanel"/);
    assert.match(ui, /aria-live="polite"/); assert.match(ui, /role="alert"/);
    /* every icon-only control names itself */
    const iconBtns = [...ui.matchAll(/class="rtp-btn-ico[^"]*"([\s\S]{0,220}?)>/g)].map((m) => m[1]);
    assert.ok(iconBtns.length >= 5, 'expected the icon buttons to be found: ' + iconBtns.length);
    iconBtns.forEach((b, i) => assert.match(b, /aria-label=/, 'icon button ' + i + ' has no accessible name'));
    /* Escape is a ladder, and the close returns focus where it came from */
    assert.match(ui, /candidates → map picking → area drawing → the panel/);
    assert.match(ui, /focusReturn && focusReturn\.isConnected\) focusReturn\.focus\(\)/);
    /* the keyboard can reorder a stop as well as a drag can */
    assert.match(ui, /rtp-up/); assert.match(ui, /rtp-down/);
    const css = read('css/intmap.css');
    assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[\s\S]{0,200}\.rtp/, 'reduced motion is honoured');
    assert.match(css, /\.rtp-btn-ico\{ width:44px; height:44px/, 'the phone targets are 44 px');
  });

  /* ⚠ ㉖ THE PANEL ASKS FOR NOTHING UNTIL IT IS ASKED (§4.3/§23) ───────────────────────────────── */
  test('R291 ㉖ opening the panel requests no location and computes no route', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（open() は DOM と navigator.geolocation）。 */
    const ui = read('js/routing-ui.js');
    const openFn = /function open\(o\) \{([\s\S]*?)\n    \}/.exec(ui);
    assert.ok(openFn, 'open() must be findable');
    assert.equal(/geolocation/.test(openFn[1]), false, 'opening must not ask for a location (§4.3)');
    assert.match(ui, /function useHere\(which\)/, 'the permission prompt belongs to a press');
    assert.match(ui, /navigator\.geolocation\.getCurrentPosition/);
    /* the search debounces and cancels; the route is never computed from a keystroke */
    assert.match(ui, /sugTimer = setTimeout\(async \(\) => \{/);
    assert.match(ui, /}, 240\);/, 'the candidate search debounces (§4.1: 200–300 ms)');
    assert.match(ui, /sugAC\.abort\(\)/, 'and cancels the previous one');
    const onInput = /function onInput\(e\) \{([\s\S]*?)\n    \}/.exec(ui);
    assert.ok(onInput);
    assert.equal(/schedule\(|recompute\(/.test(onInput[1]), false, 'typing must never start a route request (§23)');
    assert.match(ui, /if \(key === lastKey && Date\.now\(\) - lastAt < 1500/, 'and an identical request is not re-sent');
  });

  /* ⚠ ㉗ THE GEOCODER OFFERS CANDIDATES; IT DOES NOT CHOOSE (§4.1) ─────────────────────────────── */
  test('R291 ㉗ the place search ranks a list instead of confirming one hit', () => {
    const w = makeWindow();
    const g = load(w, 'js/routing-geocode.js').IntMapRouteGeocode;
    /* a coordinate is a place, and it never leaves the browser */
    const ll = g.parseLatLng('35.6812, 139.7671');
    assert.equal(ll.lat, 35.6812); assert.equal(ll.lng, 139.7671); assert.equal(ll.kind, 'coord');
    assert.equal(g.parseLatLng('99, 200'), null, 'a coordinate off the planet is not a coordinate');
    assert.equal(g.parseLatLng('Potsdam'), null);
    /* the SAME-NAME case #R126 measured, now answered with a list */
    const cands = [
      { lng: -73.94, lat: 44.66, name: 'Potsdam', admin: 'New York, United States', pop: 15000 },
      { lng: 13.06, lat: 52.4, name: 'Potsdam', admin: 'Brandenburg, Germany', pop: 180000 },
    ];
    const nearBerlin = g.rank(cands.slice(), [13.4, 52.5]);
    assert.equal(nearBerlin[0].admin, 'Brandenburg, Germany', 'the near one leads from a German view');
    assert.equal(nearBerlin.length, 2, '…and the other is still offered, which is the whole point');
    assert.ok(nearBerlin[0].distKm < 60 && nearBerlin[1].distKm > 5000, 'each row carries its distance');
    const far = g.rank(cands.slice(), [140, 36]);
    assert.equal(far[0].admin, 'Brandenburg, Germany', 'with no near candidate, population decides');
    /* an exact registry hit outranks everything */
    const withExact = g.rank(cands.concat([{ lng: 13.06, lat: 52.39, name: 'Potsdam Hbf', exact: true }]), [140, 36]);
    assert.equal(withExact[0].exact, true);
    /* two rows for the same place collapse; two different places with one name do not */
    assert.equal(g.dedupe([{ lng: 13.06, lat: 52.4, name: 'Potsdam' }, { lng: 13.0601, lat: 52.4001, name: 'potsdam' }]).length, 1);
    assert.equal(g.dedupe(cands.slice()).length, 2);
    /* the kind is read off the source's own vocabulary, never guessed from the name */
    assert.equal(g.kindOf('railway', 'station'), 'station');
    assert.equal(g.kindOf('aeroway', 'aerodrome'), 'airport');
    assert.equal(g.kindOf('place', 'city'), 'city');
    assert.equal(g.kindOf('building', 'house'), 'address');
    assert.equal(g.kindOf('', '', 'PPLC'), 'city');
  });

  /* ⚠ THE STRIPPER ITSELF IS CHECKED. Three assertions above are «X does not appear»; if `bare()`
     returned an empty string they would all pass and measure nothing (#R274's rule: prove the green
     is not blindness). */
  test('R291 ㉗b the comment-free reader keeps the code and drops the prose', () => {
    /* 綴りのまま: この検査が測るのはこのファイル自身の読み手（bare）で、製品の挙動ではない。 */
    const ui = bare('js/routing-ui.js');
    assert.ok(ui.length > 20000, 'the stripper must not be eating the file: ' + ui.length);
    assert.match(ui, /function open\(o\) \{/, 'code survives');
    assert.match(ui, /rtp-suggest/, 'and so do string literals');
    assert.equal(/幅約346px/.test(ui), false, 'the header prose is gone');
    assert.equal(/openPanel` has been exported/.test(bare('js/routing.js')), false);
    /* a URL inside a string is not a comment */
    assert.match(bare('js/routing-geocode.js'), /https:\/\/nominatim\.openstreetmap\.org\/search/);
  });

  /* ⚠⚠ ㉗c (追記) THE CARD FOLLOWS A LANGUAGE SWITCH ────────────────────────────────────────────
     Found by PRODUCTION VERIFICATION: compute a route, switch the app to Japanese, and the card still
     read 「Fastest」. Every other string on it is produced at render time; this one was a STRING baked
     when the route was computed, which is the «translation held as data» shape one level up. */
  test('R291 ㉗c an alternative’s differentiator is a descriptor, so it re-renders in the new language', () => {
    const w = fresh(); const C = w.IntMapRouteCards;
    const fastest = { duration: 2160, distance: 31000, labelKey: { k: 'fastest', avoid: null }, label: 'Fastest' };
    const delta = { duration: 2460, distance: 39000, labelKey: { k: 'delta', min: 5, avoid: ['toll'] }, label: '+5 min · avoids tolls' };
    assert.equal(C.altLabel(fastest, { lang: 'en' }), 'Fastest');
    assert.equal(C.altLabel(fastest, { lang: 'jp' }), '最速', 'the SAME object must answer in Japanese');
    assert.equal(C.altLabel(delta, { lang: 'en' }), '+5 min · avoids tolls');
    assert.equal(C.altLabel(delta, { lang: 'jp' }), '+5 分 · 回避: 有料');
    assert.equal(C.altLabel({ labelKey: { k: 'shortest' } }, { lang: 'de' }), 'Kürzeste');
    assert.equal(C.altLabel({ labelKey: { k: 'route' } }, { lang: 'es' }), 'Ruta');
    /* an alternative from BEFORE this change still has only the sentence — it is printed, not lost */
    assert.equal(C.altLabel({ label: 'Fastest' }, { lang: 'jp' }), 'Fastest');
    assert.equal(C.altLabel({}, { lang: 'en' }), '');
    /* and the card really uses it: the same alternatives, two languages, two different card texts */
    const en = C.altCards([fastest, delta], { lang: 'en', units: 'metric', sel: 0, setId: 'rs1' });
    const jp = C.altCards([fastest, delta], { lang: 'jp', units: 'metric', sel: 0, setId: 'rs1' });
    assert.match(en, /Fastest/); assert.equal(/Fastest/.test(jp), false, 'the Japanese card must not carry the English word');
    assert.match(jp, /最速/);
    /* ⚠ AND THE ROUTER STILL WRITES BOTH — an Atlas message already in the transcript prints `label` */
    const src = read('js/routing.js');
    assert.match(src, /a\.labelKey=\{k:'fastest'/);
    assert.match(src, /a\.label=LL\('Fastest'/, 'the sentence is still produced for older callers');
    assert.match(src, /label:a\.label,labelKey:a\.labelKey/, 'and both travel in the result');
    /* the panel rebuilds its ANSWERS on a language switch, not only its chrome */
    const ui = read('js/routing-ui.js');
    assert.match(ui, /addEventListener\('intmap-lang', \(\) => \{ if \(!el\) return; el\.innerHTML = shell\(\); wire\(\); render\(\); \}\)/);
  });

  /* ⚠ ㉘ THE DATELINE (§14.2/§11.3) ────────────────────────────────────────────────────────────── */
  test('R291 ㉘ a keep-out box drawn across the antimeridian is the strip, not its complement', () => {
    /* ⚠ THE SHIPPED CODE IS RUN, NOT A COPY OF IT. This used to pin the line's spelling and then run
       an arithmetic it had written out itself — a copy that stays green when the shipped line changes.
       The ring is built inside the area-draw click handler (a closure over the renderer), so the
       handler cannot be called in Node; what CAN be run is the exact block that turns two clicks into
       a ring, cut out of js/routing.js from `let x1=` to `const ring=…;` and evaluated with the two
       clicks as its only inputs. */
    const r = read('js/routing.js');
    const at = r.indexOf('let x1=first[0], x2=ll[0];');
    assert.ok(at > 0, 'the two-click ring is no longer built from `first` and `ll` where this test cuts it');
    const end = r.indexOf('\n', r.indexOf('const ring=', at));
    // eslint-disable-next-line no-new-func
    const ringOf = new Function('first', 'll', r.slice(at, end) + '\nreturn ring;');
    const width = (ring) => Math.max(...ring.map((p) => p[0])) - Math.min(...ring.map((p) => p[0]));
    /* two clicks either side of 180° must give a NARROW box */
    assert.equal(width(ringOf([179, 10], [-179, 12])), 2, 'two degrees apart across the line');
    assert.equal(width(ringOf([-179, 10], [179, 12])), 2);
    assert.equal(width(ringOf([10, 10], [40, 12])), 30, 'and an ordinary box is unaffected');
    const r1 = ringOf([179, 10], [-179, 12]);
    assert.deepEqual(r1[0], r1[r1.length - 1], 'the ring is closed');
    /* the route's own bounds were already dateline-safe (#R126 §3.19) — that must not have been lost.
       ⚠ Asked of `_bounds` itself (cut out and run), not of the comment above it. */
    const b0 = r.indexOf('function _bounds(coords){');
    assert.ok(b0 > 0, '_bounds is no longer one function');
    const b1 = r.indexOf('return (isFinite(a)&&c>=a)?[[a,b],[c,d]]:null; }', b0);
    assert.ok(b1 > b0, '_bounds no longer ends where this test cuts it');
    // eslint-disable-next-line no-new-func
    const bounds = new Function('return (' + r.slice(b0, b1 + 'return (isFinite(a)&&c>=a)?[[a,b],[c,d]]:null; }'.length) + ');')();
    const bb = bounds([[179, 0], [-179, 1]]);
    assert.equal(bb[1][0] - bb[0][0], 2, 'a route across the line is framed as the strip it is');
    assert.deepEqual(bounds([[10, 0], [40, 1]]), [[10, 0], [40, 1]], 'and an ordinary route is unaffected');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R298 · route cards on both surfaces, what production measured   (was tests/r298-checks.test.mjs, in part)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* (#R298's own header — the reports that opened the round — is kept with its block in
   tests/geo-weather-alerts-checks.test.mjs.) */
describe('§ #R298 · route cards on both surfaces, what production measured', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  const WP = () => read('js/world-packs.js');

  /* ── ⑫ Atlas is not an exception ──────────────────────────────────────────────────────────── */
  test('R298 ⑫ the chosen route card opens on BOTH surfaces', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（カードは両面の DOM）。 */
    const cards = read('js/routing-cards.js');
    const atlas = read('js/atlas-console.js');
    const ui = read('js/routing-ui.js');
    /* 「Atlas内の経路UIを勝手に例外にするな」 — #R296 made the PANEL's card open (the card stopped being a
       <button>, so a list of step buttons can live inside it) and Atlas kept #R291's sibling block. One
       renderer drew two layouts depending on which surface asked. */
    assert.ok(!/atl-rdetail/.test(atlas), 'no sibling detail block is left in the chat');
    assert.ok(!/atl-rdetail/.test(cards), '…nor addressed from the renderer');
    /* both surfaces pass a detail renderer INTO the cards */
    assert.match(ui, /detail: \(i2, a2\) => detailFor\(a2\),/);
    assert.match(atlas, /transit:true,\s*\n?\s*detail:\(i2,a2\)=>window\.IntMapRouteCards\.legRows\(a2\.legs/);
    assert.match(atlas, /transit:false,\s*\n?\s*detail:\(i2,a2\)=>_stepList\(a2\.steps\)/);
    /* selecting one REDRAWS THE SET — the only thing that can move the detail from one card to another */
    assert.match(cards, /var box = document\.querySelector\('\.rt-alts\[data-rset="' \+ sid \+ '"\]'\);/);
    assert.match(cards, /box\.outerHTML = altCards\(alts, Object\.assign\(\{\}, o, \{ sel: ai \| 0/);
    assert.match(cards, /data-kind="' \+ \(transit \? 'transit' : 'road'\) \+ '"/,
      'and the set says which kind it is, so the redraw needs no second source of truth');
    /* a reply is a message in a scrolling log — the bound the inline style used to carry lives in CSS */
    assert.match(read('css/intmap.css'), /#atlas-panel \.rt-alt-detail\{ max-height:240px; overflow:auto; \}/);
  });

  /* ── ⑭ what production measured about the route panel, pinned ─────────────────────────────── */
  test('R298 ⑭ the candidates can be clicked, one thing answers 「is there a route」, re-opening recomputes', () => {
    /* 綴りのまま: 対象が CSS の規則で、Node には CSSOM もレイアウトも無い。後半の js/routing.js も描画エンジンの closure。 */
    const css = read('css/intmap.css');
    /* MEASURED on production: typing 「Tokyo」 gave EIGHT candidates and `elementFromPoint` returned a
       panel element for all six visible rows — the list sat at z-index 1600 under `.im-front`'s 2650,
       so only the keyboard could reach it. That is what 「検索機能なし」 looked like from outside. */
    const zOf = (m) => (m ? zResolve(m[1], zTokens(css)) : 0);   /* (map-a11y-structure) a z-index is a named layer — resolve, then compare */
    const front = zOf(/\.im-front\{ z-index:([^;!}]+?) !important; \}/.exec(css));
    const sug = zOf(/\.rtp-suggest\{\s*\n?\s*position:fixed; z-index:([^;}]+);/.exec(css));
    assert.ok(front > 0 && sug > 0, 'both z-indices are declared');
    assert.ok(sug > front, `the candidate list (${sug}) must sit above a fronted window (${front})`);
    /* MEASURED, same frame, right after closing: the store said false and the UI said true. */
    const rt = read('js/routing.js');
    const clr = rt.slice(rt.indexOf('function clear(){ _lastPaint=null;'), rt.indexOf('const PROFILES='));
    assert.match(clr, /_rsActive='';/, 'clearing detaches the active set, so hasRoute() cannot go stale');
    assert.match(clr, /window\.IntMapRouteStore\.clearRoute\(\)/, '…and the store is cleared with it');
    assert.ok(!/_rsets\s*=\s*new Map\(\)/.test(clr),
      'but the OTHER sets survive — an Atlas reply still in the transcript addresses its own by id');
    /* MEASURED: closing and re-opening left the fields filled and the pane empty, while two documents
       said re-opening shows the same journey. */
    const ui = read('js/routing-ui.js');
    assert.match(ui, /else if \(ST\(\)\._pure\.ready\(ST\(\)\.get\(\)\)\) schedule\(0\);/);
  });

  /* ── ⑮ what production found AFTER this round shipped ─────────────────────────────────────── */
  test('R298 ⑮ a predicate is CALLED, a shape is painted once, and a pan repairs the cage', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（パネル・警報レイヤー・地図の moveend）。 */
    /* ⑴ MEASURED on production the moment this round shipped: `#route-panel` carried
       `data-detent="full"` on a 1,280 px desktop, and only `setDetent` writes that — which `open()`
       calls behind `if (isMob())`. `HOST.isMobile` is the PREDICATE (js/app-body.js: `get isMobile(){
       return isMobile; }`), so `!!HOST.isMobile` was true on every device, `enableWindowing()`
       early-returned, and THIS ROUND'S drag and resize never bound at all. */
    const ui = read('js/routing-ui.js');
    assert.ok(!/!!HOST\.isMobile\s*\|\|/.test(ui), 'the function object must not be the answer');
    assert.match(ui, /typeof HOST\.isMobile === 'function' \? !!HOST\.isMobile\(\)/,
      'the predicate is called');
    /* every other module in this app already calls it — this file was the only one that did not */
    const others = ['js/countries-ui.js', 'js/data-layers.js', 'js/map-ui.js']
      .map(read).join('\n');
    assert.ok(!/!!HOST\.isMobile\s*[|&]/.test(others), 'and nothing else spells it that way either');

    /* ⑵ MEASURED: one point returned the SAME unit four and five times
       (DEU/dwd Kreis und Stadt Regensburg ×4, JPN/jma 日光市 ×5). At 0.38 four coats paint 0.85. */
    const s = WP();
    assert.match(s, /feats=dedupeSameShape\(feats\);/, 'the collection is deduplicated before it is published');
    const d = s.slice(s.indexOf('function dedupeSameShape(list){'), s.indexOf('function dedupeSameShape(list){') + 1800);
    assert.match(d, /if\(!p\|\|\(\+q\.norm\|\|0\)>\(\+\(\(p\.properties\|\|\{\}\)\.norm\)\|\|0\)\) win\.set\(k,f\);/,
      'the worst rank survives');
    assert.match(d, /MERGED\[rid\]=\(MERGED\[rid\]\|\|\[\]\)\.concat\(b\);/,
      'and the folded-in rows are kept, so the tap card still lists every warning');
    assert.match(d, /Object\.keys\(MERGED\)\.forEach\(k=>\{ delete MERGED\[k\]; \}\);/,
      'rebuilt from scratch each publish — appending in place would compound');
    assert.match(s, /const a=ROWS\[pr\.rid\]\|\|\[\], b=MERGED\[pr\.rid\]\|\|\[\];/,
      'and the reader of the rows consults both, so ROWS stays owned by unitFeature');

    /* ⑶ MEASURED: a caged map stayed caged for 21 s because `idle` never came. */
    const p = read('js/map-projection.js');
    assert.match(p, /GE\(\)\.events\.on\('moveend',_reassertFlatPan\);/,
      'dragging the map — the reader’s first instinct — repairs it');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R299 · the route panel as a window, selection and closing   (was tests/r299-checks.test.mjs, in part)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* (#R299's own header — the reports that opened the round — is kept with its block in
   tests/geo-weather-alerts-checks.test.mjs.) */
describe('§ #R299 · the route panel as a window, selection and closing', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
     This project has paid for that twenty-four times; ask the question of the text that RUNS. */
  const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  test('R299 ⑦ minimising banks the size before it takes it away', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（最小化ボタンと MutationObserver）。 */
    const code = noComments(read('js/routing-ui.js'));
    const i = code.indexOf(".rtp-minb').addEventListener('click'");
    assert.ok(i > 0, 'the minimise button still has one handler');
    const h = code.slice(i, i + 700);
    /* saveGeom is debounced by a MutationObserver, so the height has to be written down BEFORE the
       class that removes it — otherwise restore puts back MIN_H (measured: 642 → 360). */
    assert.ok(/saveGeom\(\)[\s\S]{0,120}classList\.toggle\('rtp-min'\)/.test(h),
      'the geometry is saved before rtp-min is applied');
    assert.ok(/restoreGeom\(\)/.test(h), 'and restoring puts the stored rectangle back');
  });

  test('R299 ⑦ the upper half is capped and the answer list has a floor — on the DESKTOP only', () => {
    /* 綴りのまま: 対象が CSS の規則で、Node には CSSOM もレイアウトも無い。 */
    const css = read('css/intmap.css');
    const i = css.indexOf('.rtp-fixed');
    assert.ok(i > 0, 'the fixed head block is still there');
    assert.ok(/@media \(min-width:\s*768px\)/.test(css), 'the new sizing is behind a desktop query');
    /* the two halves of the fix: a ceiling above and a floor below */
    assert.ok(/\.rtp-fixed\s*\{[^}]*max-height/.test(css.replace(/\s+/g, ' ')) || /rtp-fixed[^{]*\{[^}]*max-height/.test(css),
      '.rtp-fixed has a ceiling');
    assert.ok(/\.rtp-body[^{]*\{[^}]*min-height/.test(css), '.rtp-body has a floor');
    /* ⚠ the phone sheet is not touched: 44 px targets and 13 px text are what tests/smoke R291 ⑧ measures */
    assert.ok(/@media\s*\(max-width:\s*767px\)/.test(css), 'the phone sheet block still exists');
  });

  /* ── ⑧ the routing module never shrinks its own public face ────────────────────────────────── */
  test('R299 ⑧ routing has no renderer-less stub — a missing method is how it went silent', () => {
    /* 綴りのまま: 主張が「2 つ目が無い／1 か所だけ」という構造の不在で、実行した答えからは不在を観測できない（2 メソッドだけの代用品が無いこと）。 */
    const code = noComments(read('js/routing.js'));
    assert.ok(!/!GE\(\)\.hasRenderer\(\)\s*\|\|\s*!GE\(\)\.hasRenderer\(\)/.test(code),
      'the duplicated condition is gone');
    assert.ok(!/return\s*\{\s*route\(\)\s*\{[\s\S]{0,80}\},\s*clear\(\)\s*\{\s*\}\s*\}/.test(code),
      'and so is the two-method object it returned — callers wrap every call in try/catch');
    /* ensureLayers must be able to repair a style that has the source but not the layers */
    assert.ok(/_layersOK\(/.test(code), 'ensureLayers asks whether the LAYERS are there, not just the source');
  });

  test('R299 ⑧ the Atlas route toggle names every layer the route draws', () => {
    /* 綴りのまま: 対象が js/atlas-console.js の重ね合わせ表で、Atlas は DOM の上でしか組み立たない。 */
    const code = noComments(read('js/atlas-console.js'));
    const m = code.match(/route:\[[^\]]*\]/);
    assert.ok(m, 'the overlay table still has a route row');
    /* ⚠ imroute-hit is the one that matters most: leaving it visible is 「the line is gone but it is
       still clickable」, which is half of the report about a route that will not go away. */
    for (const id of ['imroute-cas', 'imroute-walk', 'imroute-rail', 'imroute-pt', 'imroute-wp',
      'imroute-durlab', 'imroute-hit', 'imroute-area', 'imroute-diff', 'imroute-hist']) {
      assert.ok(m[0].includes(id), 'the toggle covers ' + id);
    }
  });

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     #R299 追記 — what production said when the round was measured on the live site.
     Four of these pin things the round's OWN comments claimed and had not checked.
     ══════════════════════════════════════════════════════════════════════════════════════════ */

  /* ── ⑪ choosing an alternative repaints, it does not re-frame ──────────────────────────────── */
  test('R299 追記 ⑪ selectAlt repaints without fitting — a selection never moves the camera', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（selectAlt は描画エンジンの closure）。 */
    const code = noComments(read('js/routing.js'));
    const i = code.indexOf('function selectAlt(');
    assert.ok(i > 0, 'selectAlt is still one function');
    const s = code.slice(i, i + 700);
    /* MEASURED on production R299: a tap on the line moved the camera by Δzoom −0.0359 and ~5 px,
       because `_drawAlts` always hands `_paint` the selected alternative's coordinates as `fitCoords`.
       The relation: the selection path suppresses the fit with the same switch `repaint()` uses. */
    assert.ok(/_noFit\s*=\s*true/.test(s), 'the selection suppresses the fit');
    assert.ok(/finally/.test(s), '…and restores the switch, so a NEW route set still fits');
    /* ⚠ and the deliberate one is untouched: asking for one step MEANS flying to it */
    const j = code.indexOf('function selectStep(');
    assert.ok(j > 0 && /easeTo|flyTo|fitBounds/.test(code.slice(j, j + 1600)),
      'selectStep still moves the camera on purpose');
  });

  /* ── ⑫ 「open」 is not 「visible」 ──────────────────────────────────────────────────────────── */
  test('R299 追記 ⑫ a tap on the line reveals a MINIMISED panel, and does not steal focus', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（パネルの表示とフォーカス）。 */
    const rt = noComments(read('js/routing.js'));
    const i = rt.indexOf('function _revealPanel(');
    assert.ok(i > 0, '_revealPanel is still one function');
    const p = rt.slice(i, i + 600);
    /* the early return on isOpen() is what left a minimised panel minimised (measured: sel 0→1,
       .rtp-min still on, height 46). `open()` is idempotent and `reveal` is what drops the class. */
    assert.ok(!/isOpen\(\)\)\s*return;/.test(p), 'it no longer decides from isOpen() that there is nothing to do');
    assert.ok(/reveal:\s*true/.test(p) && /keepView:\s*true/.test(p), 'it asks to be seen without a re-frame');
    /* …and because open() is now re-entrant, the two opening-only side effects are guarded */
    const ui = noComments(read('js/routing-ui.js'));
    const j = ui.indexOf('function open(o)');
    assert.ok(j > 0, 'open() is still one function');
    const o = ui.slice(j, j + 3000);
    assert.ok(/const wasOpen = openState;/.test(o), 'open() knows whether it was already open');
    assert.ok(/if \(!wasOpen\)[\s\S]{0,120}focusReturn/.test(o), 'the focus-return target is captured once');
    assert.ok(/if \(!wasOpen\) setTimeout/.test(o), 'and the cursor does not jump into the field on every tap');
  });

  /* ── ⑬ closing is clearing, in all three files that say so ─────────────────────────────────── */
  test('R299 追記 ⑬ no file still claims the Tools row leaves the route drawn', () => {
    /* 綴りのまま: 主張の対象が文書・註の文面そのもの（註の中の退役した一文）。 */
    /* This is a check ON THE PROSE, deliberately: the defect was three files stating one fact and one
       of them being four rounds out of date. MEASURED: a second press leaves hasRoute() false and every
       imroute-* layer at 0 features. */
    /* ⚠⚠ AND IT HAD TO LEARN THE DIFFERENCE BETWEEN A CLAIM AND A QUOTATION — the first version of
       this check went red on the very note that corrects the defect, because that note QUOTES the
       sentence it is retiring. (This project's twenty-fifth time; see the header of this file.)
       A retired sentence is allowed to appear as a quotation — inside 「」, which is how every note in
       this codebase quotes — and is not allowed to appear as an assertion. */
    const RETIRED = [/the route stays drawn/, /the Tools row still only closes the panel/];
    for (const p of ['js/routing.js', 'js/map-ui.js', 'js/routing-ui.js']) {
      const lines = read(p).split(/\r?\n/);
      for (const re of RETIRED) {
        lines.forEach((l, n) => {
          if (!re.test(l)) return;
          const quoted = /「[^」]*$/.test(l.slice(0, l.search(re))) || /「/.test(l);
          assert.ok(quoted, p + ':' + (n + 1) + ' states a retired rule outside a quotation: ' + l.trim().slice(0, 70));
        });
      }
    }
    /* and the behaviour the prose now describes is the one that runs */
    const ui = noComments(read('js/routing-ui.js'));
    const i = ui.indexOf('function close(');
    assert.ok(i > 0 && /clear\(\)/.test(ui.slice(i, i + 900)), 'close() still clears the route');
  });

  ISOLATED.built();
});
