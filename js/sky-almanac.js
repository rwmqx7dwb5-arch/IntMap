/* ============================================================================
 *  IntMap · TONIGHT'S SKY OVER ONE PLACE — window.IntMapSkyAlmanac
 * ----------------------------------------------------------------------------
 *  The panel that reads js/space-almanac.js out loud: for ONE point on the Earth and ONE night, when the Sun
 *  sets and how dark it gets, the Moon and its phase, which planets can be seen and when they are best, the
 *  meteor showers that are active, the satellites that will pass over visibly, and the next eclipses this
 *  place can see — each section with the source of its numbers.
 *
 *  ── EVERYTHING HERE IS SOMEONE ELSE'S ARITHMETIC ─────────────────────────────────────────────────
 *    · the night, the Sun, the Moon, the planets, the showers, the eclipses → js/space-almanac.js (window.IntMapAlmanac),
 *      itself built on js/ephemeris.js, js/space-events.js and js/space-eclipse-path.js;
 *    · the satellite passes → js/satellites-live.js `passesOver` (CelesTrak elements + SGP4), loaded on demand;
 *    · an eclipse's ground track → js/layer-pkg-eclipse.js (the dl-eclipse row), pinned to the eclipse asked for;
 *    · «look from here» → js/night-sky.js, opened at the instant of the eclipse.
 *  What is new in this file is only presentation, and the four things presentation needs that none of those
 *  computes: the ORDER of the planets (`orderPlanets`), the order of the passes (`orderPasses`), the drawing of
 *  the Moon's lit face (`moonLitGeometry` / `moonSvg`) and the formatting of an instant in two clocks
 *  (`formatClock`). All four are exported and held by tests/space-almanac-panel-checks.test.mjs.
 *
 *  ── (#R302) THE POINT COMES FIRST ────────────────────────────────────────────────────────────────
 *  Every number here is a property of one coordinate. With no point the panel computes NOTHING and asks for a
 *  tap through the shared pick bar (js/map-pick.js), exactly as js/sims.js's sun panel does — never the map's
 *  centre. ⚠ `open(ll)` with a point answers for that point; `open()` without one opens empty and asks.
 *
 *  ── WHICH NIGHT, WHICH CLOCK ─────────────────────────────────────────────────────────────────────
 *  The night is js/space-almanac.js's: from the Sun's upper transit at or before the instant to the next one,
 *  so «tonight» is never cut at midnight. The instant is the master clock's (IntMapTime) and the panel follows
 *  it; ‹ › and the date field move only the panel, and «Now» hands it back to the clock. Every time is printed
 *  in the reader's own time zone; when the place's standard time differs (window.IntMapTimeZones, the
 *  Time-zones layer's Natural Earth zones, read only if already downloaded — this panel never starts that 5 MB
 *  read) it is printed beside it, and when the place's zone is not known, UTC is.
 * ==========================================================================*/
import { IntMapTime } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';
import * as bus from './bus.js';
import { IntMapLang } from './lang-registry.js';
import { icon } from './icons.js';
import './safe-html.js';   /* globalThis.IntMapSafe — moonSvg is also read in Node */
import './ephemeris.js';                                      /* window.IntMapEphemeris — the Moon's bright limb */
import { IntMapAlmanac } from './space-almanac.js';
import { jdTT } from './space-eclipse-path.js';
import { showEclipse } from './layer-pkg-eclipse.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI, MIN = 60000, HOUR = 3600000, DAY = 86400000;

/* ══ THE PURE PARTS ═══════════════════════════════════════════════════════════════════════════════ */

/** the sections, top to bottom */
export const SECTIONS = Object.freeze(['sun', 'moon', 'planets', 'showers', 'satellites', 'eclipses']);

/** relative air mass at an apparent altitude (degrees) — Kasten & Young (1989), Applied Optics 28:4735 */
export function airmass(/** @type {number} */ altDeg) {
  if (!(altDeg > -1)) return Infinity;
  const h = Math.max(0, altDeg);
  return 1 / (Math.sin(h * D2R) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
}
/* The planets are ordered by how bright they LOOK at their best altitude tonight: the magnitude dimmed by the
   atmosphere along the line of sight, m + k·X. k is an ESTIMATE, ≈ 0.2 mag per air mass, the V-band extinction of
   a clear low-altitude site (good mountain sites measure ~0.1–0.15, hazy lowland skies 0.3 and more). It sets
   only the ORDER of the list and is never printed; it lapses if the panel learns the observer's own sky. */
export const EXTINCTION_V = 0.2;
/** the apparent magnitude at the planet's best altitude tonight (lower = easier), null when it is not seen */
export function planetEase(/** @type {any} */ p) {
  if (!p || !p.visibleTonight || !Number.isFinite(p.altAtDarkMaxDeg) || !Number.isFinite(p.magnitude)) return null;
  return p.magnitude + EXTINCTION_V * airmass(p.altAtDarkMaxDeg);
}
/** js/space-almanac.js `almanac().planets` → the seen ones easiest first, then the rest nearest the Sun first */
export function orderPlanets(/** @type {any[]} */ planets) {
  const seen = [], hidden = [];
  for (const p of planets || []) (planetEase(p) == null ? hidden : seen).push(p);
  seen.sort((a, b) => /** @type {number} */ (planetEase(a)) - /** @type {number} */ (planetEase(b)));
  hidden.sort((a, b) => (a.elongationDeg ?? 999) - (b.elongationDeg ?? 999));
  return { seen, hidden };
}

/* The ISS by the catalogue's own identifier: NORAD 25544 is the number the US Space Force's catalogue (and
   CelesTrak, which js/satellites-live.js reads) gives ISS (ZARYA). It does not change while the station flies. */
export const ISS_NORAD = '25544';
/** js/satellites-live.js `passesOver` rows → the ISS first, then the highest passes first (a higher pass is nearer
    and longer; `magnitude` is null for every object there — no standard-magnitude table with a source ships —
    so «brightest» cannot be ordered on), then by the instant of maximum */
export function orderPasses(/** @type {any[]} */ passes) {
  return (passes || []).slice().sort((a, b) => {
    const ia = String(a.id) === ISS_NORAD ? 0 : 1, ib = String(b.id) === ISS_NORAD ? 0 : 1;
    if (ia !== ib) return ia - ib;
    const ea = (a.max && a.max.elevDeg) || 0, eb = (b.max && b.max.elevDeg) || 0;
    if (ea !== eb) return eb - ea;
    return ((a.max && a.max.ms) || 0) - ((b.max && b.max.ms) || 0);
  });
}

/** the position angle of the Moon's bright limb (degrees, from celestial north through east) — Meeus,
    Astronomical Algorithms ch. 48 (48.5), from the Sun's and the Moon's RA/Dec of date (degrees) */
export function brightLimbPA(/** @type {{raDeg:number,decDeg:number}} */ sun, /** @type {{raDeg:number,decDeg:number}} */ moon) {
  const a0 = sun.raDeg * D2R, d0 = sun.decDeg * D2R, a = moon.raDeg * D2R, d = moon.decDeg * D2R;
  const y = Math.cos(d0) * Math.sin(a0 - a), x = Math.sin(d0) * Math.cos(d) - Math.cos(d0) * Math.sin(d) * Math.cos(a0 - a);
  return ((Math.atan2(y, x) * R2D) % 360 + 360) % 360;
}
/**
 * How the lit face is drawn on a disc of radius `r`, the sky's way round: celestial north up and EAST LEFT
 * (what looking up does to the compass), turned upside down for an observer south of the equator (who sees the
 * Moon with south up). The lit side is a half disc on the bright-limb side, closed by the terminator — a half
 * ellipse of semi-axis r·|2k − 1| bulging into the dark side when gibbous (k > ½), into the lit side when a crescent.
 * So the lit area is (1 ± |2k − 1|)/2 of the disc = k, exactly.
 * @returns {{ r:number, rx:number, gibbous:boolean, rotateDeg:number, litDir:[number,number] }}
 *   rotateDeg turns the local frame (lit side toward +x) into the screen's (SVG, y down); litDir is the unit
 *   vector from the centre toward the bright limb on the screen.
 */
export function moonLitGeometry(/** @type {number} */ k, /** @type {number} */ chiDeg, /** @type {boolean} */ southUp, r = 1) {
  const kk = Math.max(0, Math.min(1, +k || 0));
  const chi = chiDeg * D2R;
  /* north = (0,−1) and east = (−1,0) on the screen; the bright limb is north·cos χ + east·sin χ */
  let dx = -Math.sin(chi), dy = -Math.cos(chi);
  if (southUp) { dx = -dx; dy = -dy; }
  return { r, rx: r * Math.abs(2 * kk - 1), gibbous: kk > 0.5, rotateDeg: Math.atan2(dy, dx) * R2D, litDir: [dx, dy] };
}
/** the share of the disc the drawing lights, from its own geometry (what the test holds against k) */
export function litFraction(/** @type {{r:number,rx:number,gibbous:boolean}} */ g) {
  return g.gibbous ? (1 + g.rx / g.r) / 2 : (1 - g.rx / g.r) / 2;
}
/** the small Moon, as an SVG string: the dark disc, and the lit face on it */
export function moonSvg(/** @type {number} */ k, /** @type {number} */ chiDeg, /** @type {boolean} */ southUp, size = 44, /** @type {string} */ label = '') {
  const r = size / 2 - 1.5, g = moonLitGeometry(k, chiDeg, southUp, r), c = size / 2;
  const f = (/** @type {number} */ v) => +v.toFixed(3);
  /* top → bright limb → bottom along the disc (sweep 1 = the positive-angle way on a y-down screen), then
     bottom → top along the terminator: the dark side's way when gibbous (sweep 1), the lit side's way when not */
  const lit = g.rx >= r - 1e-9 && !g.gibbous ? ''
    : '<path d="M0,' + f(-r) + ' A' + f(r) + ',' + f(r) + ' 0 0 1 0,' + f(r) + ' A' + f(Math.max(g.rx, 1e-6)) + ',' + f(r) + ' 0 0 ' + (g.gibbous ? 1 : 0) + ' 0,' + f(-r) + ' Z" fill="#f2f0e6"/>';
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + globalThis.IntMapSafe.html(label) + '">'
    + '<circle cx="' + c + '" cy="' + c + '" r="' + f(r) + '" fill="#2c2c2e" stroke="rgba(255,255,255,.18)" stroke-width="1"/>'
    + '<g transform="translate(' + c + ',' + c + ') rotate(' + f(g.rotateDeg) + ')">' + lit + '</g></svg>';
}

/** the UTC offset (minutes, east positive) of a time zone at an instant; the device's own when none is named */
export function zoneOffsetMin(/** @type {number} */ ms, /** @type {string | undefined} */ timeZone) {
  if (!timeZone) return -new Date(ms).getTimezoneOffset();
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName');
    const m = part && /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part.value);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + (+m[3] || 0));
  } catch (_) { return 0; }
}
const offsetLabel = (/** @type {number} */ min) => 'UTC' + (min === 0 ? '' : (min < 0 ? '−' : '+') + Math.floor(Math.abs(min) / 60) + (Math.abs(min) % 60 ? ':' + String(Math.abs(min) % 60).padStart(2, '0') : ''));
/**
 * An instant in the reader's clock, and — when it differs — in the place's standard time, or UTC when the
 * place's zone is not known.
 * @param {number} ms
 * @param {{ locale?: string, timeZone?: string, siteOffsetH?: number | null, withDate?: boolean }} [o]
 *   `timeZone` is the reader's (absent: the device's); `siteOffsetH` the place's standard offset in hours, null if unknown
 * @returns {{ main: string, alt: string | null, altLabel: string | null }}
 */
export function formatClock(ms, o) {
  o = o || {};
  if (!Number.isFinite(ms)) return { main: '—', alt: null, altLabel: null };
  const opts = /** @type {Intl.DateTimeFormatOptions} */ ({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if (o.withDate) Object.assign(opts, { month: 'numeric', day: 'numeric' });
  const fmt = (/** @type {Intl.DateTimeFormatOptions} */ x, /** @type {number} */ t) => new Intl.DateTimeFormat(o.locale || 'en-GB', x).format(new Date(t));
  const main = fmt(o.timeZone ? Object.assign({ timeZone: o.timeZone }, opts) : opts, ms);
  const mine = zoneOffsetMin(ms, o.timeZone);
  const site = (o.siteOffsetH == null || !Number.isFinite(+o.siteOffsetH)) ? null : Math.round(+o.siteOffsetH * 60);
  const other = site == null ? 0 : site;
  if (other === mine) return { main, alt: null, altLabel: null };
  return { main, alt: fmt(Object.assign({ timeZone: 'UTC' }, opts), ms + other * MIN), altLabel: offsetLabel(other) };
}

/** the stretches of [a, b] in which `altFn(t)` is above `h0` — sampled every `step` ms, each edge bisected to a
    second (js/space-almanac.js finds its rise and set the same way, over the whole noon-to-noon window) */
export function upIntervals(/** @type {(t: number) => number} */ altFn, /** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ step, /** @type {number} */ h0) {
  const out = [];
  if (!(b > a)) return out;
  const f = (/** @type {number} */ t) => altFn(t) - h0;
  const edge = (/** @type {number} */ lo, /** @type {number} */ hi) => {
    const up = f(hi) > 0;
    for (let i = 0; i < 40 && hi - lo > 1000; i++) { const m = (lo + hi) / 2; if ((f(m) > 0) === up) hi = m; else lo = m; }
    return (lo + hi) / 2;
  };
  let t0 = a, v0 = f(a) > 0, from = v0 ? a : null;
  for (let t = a + step; ; t += step) {
    const t1 = Math.min(t, b), v1 = f(t1) > 0;
    if (v1 !== v0) { const x = edge(t0, t1); if (v1) from = x; else { out.push({ from: /** @type {number} */ (from), to: x }); from = null; } }
    t0 = t1; v0 = v1;
    if (t1 >= b) break;
  }
  if (from != null) out.push({ from, to: b });
  return out;
}

/* ══ THE PANEL ════════════════════════════════════════════════════════════════════════════════════ */
/** @param {any} HOST the shared host (js/app-body.js IM_HOST) */
export function skyAlmanac(HOST) {
  const GE = () => IntMapGeoEngine;
  const T = IntMapLang.pick(() => HOST.lang);
  const LA = IntMapLang.pickArgs();   /* translation tuples held as data, resolved with T.arr() */
  const esc = (/** @type {any} */ v) => window.IntMapSafe.html(String(v == null ? '' : v));
  /* the collaborators read off the page, one accessor each: the ephemeris (always here — imported above), the sidereal
     angle (js/space-sky.js, through js/space-eclipse-path.js), and the on-demand satellites, its card, the pick bar */
  const EPH = () => window.IntMapEphemeris, SKY = () => window.IntMapSky;
  const SATS = () => window.IntMapSatellites, SATCARD = () => window.IntMapSatPanel, PICK = () => window.IntMapPick;
  const locale = () => IntMapLang.locale(HOST.lang, 'en-GB');
  const nf = (/** @type {number} */ d) => new Intl.NumberFormat(IntMapLang.htmlTag(HOST.lang), { maximumFractionDigits: d, minimumFractionDigits: 0 });
  /** a number in the reader's locale, as text for markup (a locale's digits and separators are not markup, and the encoder says so) */
  const fmtN = (/** @type {number} */ d, /** @type {number} */ v) => esc(nf(d).format(v));

  let panel = /** @type {HTMLElement | null} */ (null);
  let site = /** @type {{lng:number,lat:number} | null} */ (null);
  let whenMs = IntMapTime.nowMs(), follow = true, gen = 0, busy = false;
  let alm = /** @type {any} */ (null), almErr = '';
  let ecl = /** @type {{lunar:any, solar:any} | null} */ (null);
  let passes = /** @type {{ state: string, list: any[], err?: string }} */ ({ state: 'idle', list: [] });
  let passT = /** @type {any} */ (null), showAllPasses = false;
  /** @type {(() => void)[]} */ const stops = [];

  const hasSite = () => !!(site && Number.isFinite(site.lng) && Number.isFinite(site.lat));
  const pickMsg = () => T('Tap the map to choose a point', '地図をタップして地点を選んでください');
  let siteOff = /** @type {number | null} */ (null);   /* read once per render: offsetAt walks every zone polygon */
  const siteOffsetH = () => {
    try { const Z = window.IntMapTimeZones; if (Z && Z.ready && Z.ready() && hasSite()) { const z = Z.offsetAt(/** @type {any} */ (site).lng, /** @type {any} */ (site).lat); return z == null ? null : +z; } } catch (_) { /* not downloaded */ }
    return null;
  };
  /** an instant as HTML: the reader's clock, and the place's (or UTC) beside it in muted type */
  const when = (/** @type {number | null | undefined} */ ms, withDate = false) => {
    if (ms == null || !Number.isFinite(ms)) return '<span style="color:var(--text-muted)">—</span>';
    const f = formatClock(ms, { locale: locale(), siteOffsetH: siteOff, withDate });
    return esc(f.main) + (f.alt ? ' <span style="color:var(--text-muted);font-size:10.5px">(' + esc(f.altLabel + ' ' + f.alt) + ')</span>' : '');
  };
  const almDirOf = (/** @type {number} */ az) => { try { const C = window.IntMapCompass; const p = C && C.point(az, HOST.lang, 8); if (p) return esc(p); } catch (_) { /* degrees alone */ } return ''; };
  const almDeg = (/** @type {number} */ v, d = 0) => esc(nf(d).format(v)) + '°';
  const almDaysUntil = (/** @type {number} */ ms) => Math.max(0, Math.round((ms - whenMs) / DAY));

  /* the azimuth (from north, through east) of a body at an instant — the same RA/Dec of date and Greenwich mean
     sidereal time js/space-almanac.js measures its altitudes with */
  function azimuthOf(/** @type {string} */ id, /** @type {number} */ ms) {
    const q = EPH().equatorial(id, jdTT(ms)); if (!q || !hasSite()) return null;
    const s = /** @type {any} */ (site), H = (SKY().gmstDeg(ms) + s.lng - q.raDeg) * D2R, d = q.decDeg * D2R, p = s.lat * D2R;
    const A = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(p) - Math.tan(d) * Math.cos(p)) * R2D;
    return ((A + 180) % 360 + 360) % 360;
  }
  /* …and its geometric altitude, through js/space-almanac.js `altitudeOf` (the function its rise and set use) */
  function altitudeNow(/** @type {string} */ id, /** @type {number} */ ms) {
    const q = EPH().equatorial(id, jdTT(ms)), s = /** @type {any} */ (site);
    return IntMapAlmanac.altitudeOf(q.raDeg, q.decDeg, ms, s.lat, s.lng);
  }

  /* ── computing ────────────────────────────────────────────────────────────────────────────── */
  function compute() {
    if (!hasSite()) { alm = null; ecl = null; passes = { state: 'idle', list: [] }; render(); return; }
    const my = ++gen; busy = true; almErr = ''; render();
    /* one frame for «computing…» to paint: the almanac is ~0.2–0.3 s of arithmetic (measured 2026-11-17, Tokyo) */
    setTimeout(() => {
      if (my !== gen) return;
      const s = /** @type {any} */ (site);
      try {
        alm = IntMapAlmanac.almanac({ lat: s.lat, lng: s.lng, when: whenMs });
        if (!alm || !alm.window || alm.window.from == null) { almErr = T('The night could not be computed for this place.', 'この地点の夜を計算できませんでした。'); alm = null; }
      } catch (e) { console.warn('sky almanac', e); alm = null; almErr = T('The night could not be computed for this place.', 'この地点の夜を計算できませんでした。'); }
      try {
        const from = alm ? alm.window.from : whenMs;
        ecl = {
          lunar: IntMapAlmanac.localEclipses({ lat: s.lat, lng: s.lng, from, count: 1, type: 'lunar', visibleOnly: true })[0] || null,
          solar: IntMapAlmanac.localEclipses({ lat: s.lat, lng: s.lng, from, count: 1, type: 'solar', visibleOnly: true })[0] || null,
        };
      } catch (e) { console.warn('sky almanac eclipses', e); ecl = null; }
      busy = false; render();
      loadPasses(my);
    }, 16);
  }
  /* the satellites: js/satellites-live.js is on demand, and passesOver begins at the clock's instant (it propagates
     elements that speak for days around their epoch, never back in time) */
  async function loadPasses(/** @type {number} */ my) {
    if (!alm || !hasSite()) return;
    const clock = IntMapTime.nowMs(), a = alm.window.from, b = alm.window.to;
    if (b <= clock) { passes = { state: 'past', list: [] }; render(); return; }
    passes = { state: 'loading', list: [] }; render();
    try {
      const ok = await window.IntMapLazy.need('satellitesLive');
      const S = SATS();
      if (!ok || !S || typeof S.passesOver !== 'function') throw new Error('satellites module unavailable');
      const s = /** @type {any} */ (site);
      const list = await S.passesOver({ lng: s.lng, lat: s.lat }, { hours: (b - clock) / HOUR, minElevDeg: 10, visibleOnly: true, limit: Infinity });
      if (my !== gen) return;
      passes = { state: 'ok', list: orderPasses(list.filter((x) => x.max && x.max.ms >= a && x.max.ms < b)) };
    } catch (e) {
      if (my !== gen) return;
      console.warn('sky almanac passes', e);
      passes = { state: 'fail', list: [], err: String((e && e.message) || e) };
    }
    render();
  }

  /* ── the sections ─────────────────────────────────────────────────────────────────────────── */
  const SRC = (/** @type {string} */ s) => '<div class="ska-src">' + esc(T('Source', '出典')) + ': ' + esc(s) + '</div>';
  const row = (/** @type {string} */ k, /** @type {string} */ v) => '<div class="ska-row"><span class="ska-k">' + esc(k) + '</span><span class="ska-v">' + v + '</span></div>';
  const head = (/** @type {string} */ ic, /** @type {string} */ t) => '<div class="ska-h">' + icon(ic) + '<span>' + esc(t) + '</span></div>';

  function sunSection() {
    const s = alm.sun;
    let h = head('sun', T('Sun', '太陽'));
    if (s.polar === 'day') h += row(T('Midnight Sun', '白夜'), esc(T('The Sun does not set tonight.', '今夜は太陽が沈みません。')));
    else if (s.polar === 'night') h += row(T('Polar night', '極夜'), esc(T('The Sun does not rise today.', '今日は太陽が昇りません。')));
    else {
      h += row(T('Sunset', '日の入り'), when(s.set)) + row(T('Sunrise', '日の出'), when(s.rise));
    }
    h += row(T('Noon (transit)', '南中'), when(s.transit));
    const tw = (/** @type {string} */ name, /** @type {any} */ x) => row(name, x.dusk == null && x.dawn == null ? '<span style="color:var(--text-muted)">' + esc(T('not tonight', '今夜はなし')) + '</span>' : when(x.dusk) + ' – ' + when(x.dawn));
    h += tw(T('Civil twilight ends / begins', '市民薄明 終 / 始'), s.civil) + tw(T('Nautical twilight ends / begins', '航海薄明 終 / 始'), s.nautical) + tw(T('Astronomical twilight ends / begins', '天文薄明 終 / 始'), s.astronomical);
    if (alm.dark) h += row(T('Dark sky', '暗い時間帯'), when(alm.dark.from) + ' – ' + when(alm.dark.to) + ' <span class="ska-m">' + esc(T('(Sun below −18°)', '（太陽高度 −18° 以下）')) + '</span>');
    else if (alm.observing) h += row(T('Darkest it gets', '最も暗い時間帯'), when(alm.observing.from) + ' – ' + when(alm.observing.to) + ' <span class="ska-m">' + esc(T('(the Sun never reaches −18°; below ' + Math.round(alm.observing.sunBelowDeg) + '°)', '（太陽は −18° に届かない。' + Math.round(alm.observing.sunBelowDeg) + '° 以下）')) + '</span>');
    else h += row(T('Dark sky', '暗い時間帯'), esc(T('none — the sky does not get dark tonight', 'なし（今夜は空が暗くなりません）')));
    return h + SRC(T('JPL approximate elements; rising and setting Meeus ch. 15', 'JPL 近似要素・出没は Meeus 15 章'));
  }

  function moonSection() {
    const m = alm.moon, s = /** @type {any} */ (site);
    let chi = 270;
    try { const E = EPH(), jd = jdTT(whenMs); chi = brightLimbPA(E.equatorial('sun', jd), E.equatorial('moon', jd)); } catch (_) { /* drawn waxing-side if the ephemeris is not answering */ }
    const name = T(m.phaseName.en, m.phaseName.jp);
    let h = head('moon', T('Moon', '月'));
    h += '<div style="display:flex;gap:12px;align-items:center;margin:4px 0 6px">' + moonSvg(+m.illumination, +chi, s.lat < 0, 46, esc(name))
      + '<div><div style="font-weight:600">' + esc(name) + '</div><div class="ska-m">' + esc(T('Illuminated', '輝面比')) + ' ' + fmtN(0, m.illumination * 100) + '%'
      + (m.ageDays != null ? ' · ' + esc(T('age', '月齢')) + ' ' + fmtN(1, m.ageDays) : '') + '</div></div></div>';
    if (m.always === 'up') h += row(T('Moon', '月'), esc(T('above the horizon all night', '一晩中地平線の上')));
    else if (m.always === 'down') h += row(T('Moon', '月'), esc(T('below the horizon all night', '一晩中地平線の下')));
    else h += row(T('Moonrise', '月の出'), when(m.rise)) + row(T('Moonset', '月の入り'), when(m.set));
    h += row(T('Meridian transit', '南中'), when(m.transit));
    h += row(T('Next new Moon', '次の新月'), when(m.nextNew, true) + (m.nextNew ? ' <span class="ska-m">' + esc(T('in ' + almDaysUntil(m.nextNew) + ' d', 'あと ' + almDaysUntil(m.nextNew) + ' 日')) + '</span>' : ''));
    h += row(T('Next full Moon', '次の満月'), when(m.nextFull, true) + (m.nextFull ? ' <span class="ska-m">' + esc(T('in ' + almDaysUntil(m.nextFull) + ' d', 'あと ' + almDaysUntil(m.nextFull) + ' 日')) + '</span>' : ''));
    return h + SRC(T('ELP-2000/82 (truncated, Meeus ch. 47); phase Meeus ch. 48', 'ELP-2000/82（Meeus 47 章の短縮版）・位相は Meeus 48 章'));
  }

  const PLANET = /** @type {Record<string, [string, string]>} */ ({ mercury: LA('Mercury', '水星'), venus: LA('Venus', '金星'), mars: LA('Mars', '火星'), jupiter: LA('Jupiter', '木星'), saturn: LA('Saturn', '土星'), uranus: LA('Uranus', '天王星'), neptune: LA('Neptune', '海王星') });
  function planetSection() {
    const { seen, hidden } = orderPlanets(alm.planets);
    const obs = alm.observing;
    let h = head('planet', T('Planets', '惑星'));
    if (!seen.length) h += '<div class="ska-m">' + esc(T('No planet is above the horizon in a dark sky tonight.', '今夜、暗い空で地平線より上に出る惑星はありません。')) + '</div>';
    for (const p of seen) {
      const nm = PLANET[p.id] ? T.arr(PLANET[p.id]) : p.id;
      /* the planets' h0 is js/space-almanac.js's: −34′ of refraction, lowered by nothing (the panel's observer is at 0 m) */
      const ups = obs ? upIntervals((t) => altitudeNow(p.id, t), obs.from, obs.to, 5 * MIN, -34 / 60) : [];
      const az = p.bestTimeMs != null ? azimuthOf(p.id, p.bestTimeMs) : null;
      h += '<div class="ska-item"><div class="ska-row"><span class="ska-k" style="color:var(--text-main);font-weight:600">' + esc(nm) + '</span><span class="ska-v">' + esc(T('apparent mag. ', '等級 ')) + fmtN(1, p.magnitude) + '</span></div>'
        + '<div class="ska-m">' + (ups.length ? esc(T('Visible ', '見える時間 ')) + ups.map((u) => when(u.from) + ' – ' + when(u.to)).join(', ') + ' · ' : '')
        + esc(T('best viewing ', '見頃 ')) + when(p.bestTimeMs) + ' · ' + esc(T('altitude ', '高度 ')) + almDeg(p.altAtDarkMaxDeg)
        + (az != null ? ' · ' + esc(T('azimuth ', '方位 ')) + almDeg(az) + ' ' + esc(almDirOf(az)) : '') + '</div></div>';
    }
    if (hidden.length) {
      h += '<div class="ska-sub">' + esc(T('Not seen tonight', '今夜は見えない')) + '</div>';
      for (const p of hidden) {
        const nm = PLANET[p.id] ? T.arr(PLANET[p.id]) : p.id;
        const why = !obs ? T('the sky does not get dark', '空が暗くならない')
          : T('below the horizon while the sky is dark (' + fmtN(0, p.elongationDeg) + '° from the Sun)', '暗い時間帯は地平線の下（太陽から ' + fmtN(0, p.elongationDeg) + '°）');
        h += row(nm, '<span class="ska-m">' + esc(why) + '</span>');
      }
    }
    return h + SRC(T('JPL approximate elements; magnitudes Astronomical Almanac 1984 (Meeus ch. 41); order: magnitude dimmed by the air mass at the best altitude', 'JPL 近似要素・等級は天体暦 1984（Meeus 41 章）・並びは最良高度での大気による減光を加えた等級順'));
  }

  function showerSection() {
    let h = head('star', T('Meteor showers', '流星群'));
    const sh = alm.showers || [];
    if (!sh.length) h += '<div class="ska-m">' + esc(T('None of the major annual showers is active tonight.', '今夜活動中の主要な流星群はありません。')) + '</div>';
    for (const x of sh) {
      const nm = T(x.name.en, x.name.jp);
      const moonUp = x.moon.altAtBestDeg > 0;
      const moonLine = moonUp
        ? T('Moonlight: ' + fmtN(0, x.moon.illumination * 100) + '% lit, ' + fmtN(0, x.moon.altAtBestDeg) + '° up when the radiant is highest', '月明かり: 輝面比 ' + fmtN(0, x.moon.illumination * 100) + '%、放射点が最も高い時刻に月の高度 ' + fmtN(0, x.moon.altAtBestDeg) + '°')
        : T('No moonlight when the radiant is highest (the Moon is below the horizon)', '放射点が最も高い時刻に月は地平線の下（月明かりの影響なし）');
      const peak = Math.round(x.daysFromPeak);
      h += '<div class="ska-item"><div class="ska-row"><span class="ska-k" style="color:var(--text-main);font-weight:600">' + esc(nm) + '</span><span class="ska-v">ZHR ' + esc(x.zhr) + '</span></div>'
        + '<div class="ska-m">' + esc(T('Radiant highest ', '放射点が最も高い ')) + when(x.radiantBestMs) + ' · ' + almDeg(x.radiantAltMaxDeg)
        + ' · ' + esc(peak === 0 ? T('peak night', '極大の夜') : peak < 0 ? T(-peak + ' d before the peak', '極大の ' + (-peak) + ' 日前') : T(peak + ' d after the peak', '極大の ' + peak + ' 日後')) + '</div>'
        + '<div class="ska-m">' + esc(moonLine) + '</div></div>';
    }
    /* the next maximum of the list after this instant (this year's and next year's) */
    let next = null;
    try {
      const y = new Date(whenMs).getUTCFullYear();
      for (const z of IntMapAlmanac.meteorShowers(y).concat(IntMapAlmanac.meteorShowers(y + 1))) if (z.peakMs != null && z.peakMs > whenMs && (!next || z.peakMs < next.peakMs)) next = z;
    } catch (_) { /* the list is the module's own */ }
    if (next) h += row(T('Next maximum', '次の極大'), esc(T(next.name.en, next.name.jp)) + ' · ' + when(next.peakMs, true) + ' <span class="ska-m">' + esc(T('in ' + almDaysUntil(next.peakMs) + ' d', 'あと ' + almDaysUntil(next.peakMs) + ' 日')) + '</span>');
    return h + SRC('IMO 2026 Meteor Shower Calendar (Rendtel), Tables 5–6');
  }

  function passSection() {
    let h = head('satellite', T('Satellite passes', '衛星の通過'));
    if (passes.state === 'past') h += '<div class="ska-m">' + esc(T('Passes are computed only from the clock’s instant on (the orbital elements speak for days around their epoch, not for past nights).', '衛星の通過は時計の時点より後だけを計算します（軌道要素は元期の前後数日だけを述べるため、過去の夜は扱えません）。')) + '</div>';
    else if (passes.state === 'loading' || passes.state === 'idle') h += '<div class="ska-m">' + esc(T('Computing the passes…', '通過を計算中…')) + '</div>';
    else if (passes.state === 'fail') h += '<div class="ska-m" style="color:#ff453a">' + esc(T('Satellite passes could not be computed.', '衛星の通過を取得できませんでした。')) + '</div>';
    else if (!passes.list.length) h += '<div class="ska-m">' + esc(T('No visible pass (sunlit satellite, dark sky, 10° or higher) tonight.', '今夜は見える通過（衛星に日が当たり空が暗く、高度 10° 以上）がありません。')) + '</div>';
    else {
      const many = passes.list.length;
      const shown = showAllPasses ? passes.list : passes.list.slice(0, 8);
      const canSelect = (() => { try { return typeof SATS().select === 'function'; } catch (_) { return false; } })();
      for (const p of shown) {
        h += (canSelect ? '<div role="button" tabindex="0" class="ska-pass" data-sat="' + esc(p.id) + '">' : '<div class="ska-pass">') + '<div class="ska-row"><span class="ska-k" style="color:var(--text-main);font-weight:600">' + esc(p.name) + '</span><span class="ska-v">' + esc(T('max ', '最大 ')) + almDeg(p.max.elevDeg) + '</span></div>'
          + '<div class="ska-m">' + esc(T('rises ', '出現 ')) + when(p.rise.ms) + (p.rise.azDeg != null ? ' ' + esc(almDirOf(p.rise.azDeg)) : '')
          + ' · ' + esc(T('max ', '最大 ')) + when(p.max.ms) + ' ' + almDeg(p.max.elevDeg) + ' ' + esc(almDirOf(p.max.azDeg))
          + ' · ' + esc(T('sets ', '消滅 ')) + when(p.set.ms) + (p.set.azDeg != null ? ' ' + esc(almDirOf(p.set.azDeg)) : '') + '</div></div>';
      }
      if (many > shown.length) h += '<button type="button" class="ska-btn ska-more">' + esc(T('Show all ' + many, 'すべて表示（' + many + ' 件）')) + '</button>';
      h += '<div class="ska-m" style="margin-top:3px">' + esc(T('The ISS first, then the highest passes (no magnitudes are published with the elements). ' + (canSelect ? 'Tap a pass to select the satellite on the map.' : ''), 'ISS を先頭に、最大高度の高い順（軌道要素に等級は付いていません）。' + (canSelect ? '行を押すと地図上でその衛星を選びます。' : ''))) + '</div>';
    }
    return h + SRC('CelesTrak + SGP4');
  }

  function eclipseSection() {
    let h = head('sparkle', T('Eclipses from here', 'この地点から見える食'));
    if (!ecl) return h + '<div class="ska-m" style="color:#ff453a">' + esc(T('The eclipses could not be computed.', '食を計算できませんでした。')) + '</div>';
    const kindL = (/** @type {string} */ k) => k === 'total' ? T('Total lunar eclipse', '皆既月食') : k === 'partial' ? T('Partial lunar eclipse', '部分月食') : T('Penumbral lunar eclipse', '半影月食');
    const kindS = (/** @type {string} */ k) => k === 'total' ? T('total eclipse', '皆既') : k === 'annular' ? T('annular', '金環') : T('partial', '部分');
    const L = ecl.lunar;
    if (L) {
      const mag = L.kind === 'penumbral' ? L.penumbralMagnitude : L.magnitude;
      h += '<div class="ska-item"><div class="ska-row"><span class="ska-k" style="color:var(--text-main);font-weight:600">' + esc(kindL(L.kind)) + '</span><span class="ska-v">' + esc(T('in ' + almDaysUntil(L.maxMs) + ' d', 'あと ' + almDaysUntil(L.maxMs) + ' 日')) + '</span></div>'
        + '<div class="ska-m">' + esc(T('Greatest ', '食の最大 ')) + when(L.maxMs, true) + ' · ' + esc(L.kind === 'penumbral' ? T('penumbral magnitude ', '半影食分 ') : T('magnitude ', '食分 ')) + fmtN(3, mag)
        + ' · ' + esc(L.aboveHorizonAtMax ? T('Moon ' + fmtN(0, L.moonAltAtMaxDeg) + '° up', '月の高度 ' + fmtN(0, L.moonAltAtMaxDeg) + '°') : T('the Moon is up during part of it', '一部の時間だけ月が出ている')) + '</div>'
        + '<div class="ska-acts"><button type="button" class="ska-btn" data-sky="' + esc(L.maxMs) + '">' + icon('telescope') + ' ' + esc(T('See it from here', 'ここから見る')) + '</button></div></div>';
    } else h += row(T('Lunar', '月食'), '<span class="ska-m">' + esc(T('none visible from here within 30 years', '30 年以内にこの地点から見えるものはありません')) + '</span>');
    const S = ecl.solar;
    if (S) {
      const at = S.visible ? S.visible.ms : S.maxMs, mag = S.visible ? S.visible.magnitude : S.magnitude;
      h += '<div class="ska-item"><div class="ska-row"><span class="ska-k" style="color:var(--text-main);font-weight:600">' + esc(T('Solar eclipse', '日食')) + ' · ' + esc(T('seen here as ', 'この地点では ')) + esc(kindS(S.localKind || 'partial')) + '</span><span class="ska-v">' + esc(T('in ' + almDaysUntil(at) + ' d', 'あと ' + almDaysUntil(at) + ' 日')) + '</span></div>'
        + '<div class="ska-m">' + esc(T('Greatest seen here ', 'この地点での最大 ')) + when(at, true) + ' · ' + esc(T('magnitude ', '食分 ')) + fmtN(3, mag)
        + (S.visible && Number.isFinite(S.visible.sunAltDeg) ? ' · ' + esc(T('Sun ' + fmtN(0, S.visible.sunAltDeg) + '° up', '太陽高度 ' + fmtN(0, S.visible.sunAltDeg) + '°')) : '')
        + ' · ' + esc(T('globally ', '全体では ')) + esc(S.kind === 'total' ? T('total eclipse', '皆既') : S.kind === 'annular' ? T('annular', '金環') : S.kind === 'hybrid' ? T('hybrid', '金環皆既') : T('partial', '部分')) + '</div>'
        + '<div class="ska-acts"><button type="button" class="ska-btn" data-path="' + esc(S.globalMaxMs) + '">' + icon('map') + ' ' + esc(T('Show the path on the map', '通過帯を地図に表示')) + '</button>'
        + '<button type="button" class="ska-btn" data-sky="' + esc(at) + '">' + icon('telescope') + ' ' + esc(T('See it from here', 'ここから見る')) + '</button></div></div>';
    } else h += row(T('Solar eclipse', '日食'), '<span class="ska-m">' + esc(T('none visible from here within 30 years', '30 年以内にこの地点から見えるものはありません')) + '</span>');
    return h + SRC(T('Meeus ch. 54 (lunar); the shadow cones on the WGS-84 ellipsoid (solar) — JPL approximate elements, ELP-2000/82', 'Meeus 54 章（月食）・WGS-84 楕円体上の影の円錐（日食）— JPL 近似要素・ELP-2000/82'));
  }

  /* ── the DOM ──────────────────────────────────────────────────────────────────────────────── */
  const STYLE = '#sky-almanac{position:fixed;left:12px;top:76px;width:min(360px,calc(100vw - 24px));max-height:calc(100dvh - 96px);z-index:calc(var(--z-dropdown) + 102);display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,.3));border-radius:16px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.45);font-size:12px}'
    + '#sky-almanac .ska-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--input-bg);cursor:move}'
    + '#sky-almanac .ska-title{flex:1;font-size:13.5px;font-weight:700;display:flex;align-items:center;gap:6px}'
    + '#sky-almanac .ska-x{border:none;background:transparent;color:var(--text-muted);font-size:18px;line-height:1;cursor:pointer;padding:2px 4px}'
    + '#sky-almanac .ska-bar{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--glass-border,rgba(128,128,128,.2));flex-wrap:wrap}'
    + '#sky-almanac .ska-bar input[type=date]{flex:1 1 120px;min-width:0;height:30px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,.28));background:var(--input-bg);color:var(--text-main);font-size:12px;padding:0 6px}'
    + '#sky-almanac .ska-btn{height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,.28));background:var(--input-bg);color:var(--text-main);font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}'
    + '#sky-almanac .ska-where{padding:6px 12px 0;font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;flex-wrap:wrap}'
    + '#sky-almanac .ska-body{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px 12px 12px;display:flex;flex-direction:column}'
    + '#sky-almanac .ska-sec{padding:9px 0;border-bottom:1px solid var(--glass-border,rgba(128,128,128,.16))}'
    + '#sky-almanac .ska-sec:last-child{border-bottom:none}'
    + '#sky-almanac .ska-h{display:flex;align-items:center;gap:6px;font-weight:700;font-size:12.5px;margin-bottom:4px}'
    + '#sky-almanac .ska-row{display:flex;flex-wrap:wrap;justify-content:space-between;column-gap:10px;line-height:1.55}'
    + '#sky-almanac .ska-k{color:var(--text-muted);flex:0 1 auto;min-width:0}'
    + '#sky-almanac .ska-v{margin-left:auto;text-align:right;min-width:0;font-variant-numeric:tabular-nums}'   /* a long value drops under its label on a phone instead of overflowing */
    + '#sky-almanac .ska-m{color:var(--text-muted);font-size:11px;line-height:1.5;font-variant-numeric:tabular-nums}'
    + '#sky-almanac .ska-sub{margin-top:6px;font-size:11px;font-weight:600;color:var(--text-muted)}'
    + '#sky-almanac .ska-item{padding:4px 0}'
    + '#sky-almanac .ska-pass{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:transparent;border:none;border-radius:10px;padding:5px 6px;margin:0 -6px;cursor:pointer;box-sizing:content-box}'
    + '#sky-almanac .ska-pass:not([role]){cursor:default}'
    + '#sky-almanac .ska-pass[role]:hover,#sky-almanac .ska-pass[role]:focus-visible{background:var(--input-bg);outline:none}'
    + '#sky-almanac .ska-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px}'
    + '#sky-almanac .ska-src{margin-top:5px;font-size:9.5px;color:var(--text-muted);opacity:.85}'
    + '#sky-almanac .ska-note{padding:6px 12px 0;font-size:10.5px;color:var(--text-muted)}'
    + '#sky-almanac .ska-more{margin-top:4px}'
    + '#sky-almanac .im-icon{flex:0 0 auto}';

  function ensurePanel() {
    if (panel) return panel;
    if (!document.getElementById('sky-almanac-css')) { const st = document.createElement('style'); st.id = 'sky-almanac-css'; st.textContent = STYLE; document.head.appendChild(st); }
    const p = document.createElement('div'); p.id = 'sky-almanac'; p.setAttribute('role', 'dialog'); p.setAttribute('tabindex', '-1');   /* the dialog takes focus; its controls are buttons and role=button rows */
    p.setAttribute('aria-label', T('Tonight’s sky', '今夜の空'));
    p.innerHTML = '<div class="ska-head"><span class="ska-title">' + icon('moon') + '<span>' + esc(T('Tonight’s sky', '今夜の空')) + '</span></span>'
      + '<button type="button" class="ska-x" aria-label="' + esc(T('Close', '閉じる')) + '">×</button></div>'
      + '<div class="ska-where"></div>'
      + '<div class="ska-bar"><button type="button" class="ska-btn ska-prev" aria-label="' + esc(T('Previous night', '前の夜')) + '">' + icon('chevronL') + '</button>'
      + '<input type="date" class="ska-date" aria-label="' + esc(T('Night of', '夜の日付')) + '">'
      + '<button type="button" class="ska-btn ska-next" aria-label="' + esc(T('Next night', '次の夜')) + '">' + icon('chevronR') + '</button>'
      + '<button type="button" class="ska-btn ska-now">' + esc(T('Now', '現在')) + '</button></div>'
      + '<div class="ska-note"></div>'
      + '<div class="ska-body"></div>';
    document.body.appendChild(p);
    panel = p;
    /** @type {any} */ (p.querySelector('.ska-x')).onclick = () => close();
    /** @type {any} */ (p.querySelector('.ska-prev')).onclick = () => step(-1);
    /** @type {any} */ (p.querySelector('.ska-next')).onclick = () => step(1);
    /** @type {any} */ (p.querySelector('.ska-now')).onclick = () => { follow = true; whenMs = IntMapTime.nowMs(); compute(); };
    /** @type {any} */ (p.querySelector('.ska-date')).onchange = (/** @type {any} */ e) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.target.value || ''); if (!m || !hasSite()) return;
      /* the afternoon of that date at this longitude (mean solar 15:00) — js/space-almanac.js's «night of D» */
      follow = false; whenMs = Date.UTC(+m[1], +m[2] - 1, +m[3]) + (15 - /** @type {any} */ (site).lng / 15) * HOUR; compute();
    };
    p.addEventListener('click', (e) => {
      const t = /** @type {any} */ (e.target);
      const b = t && t.closest && t.closest('[data-sat],[data-sky],[data-path],.ska-more,.ska-pick');
      if (!b) return;
      if (b.classList.contains('ska-more')) { showAllPasses = true; render(); return; }
      if (b.classList.contains('ska-pick')) { askSite(); return; }
      if (b.hasAttribute('data-path')) { showEclipse(+b.getAttribute('data-path')); return; }
      if (b.hasAttribute('data-sky')) { lookFrom(+b.getAttribute('data-sky')); return; }
      if (b.hasAttribute('data-sat')) selectSatellite(b.getAttribute('data-sat'));
    });
    p.addEventListener('keydown', (e) => {
      const t = /** @type {any} */ (e.target);
      if ((e.key === 'Enter' || e.key === ' ') && t && t.hasAttribute && t.hasAttribute('data-sat')) { e.preventDefault(); selectSatellite(t.getAttribute('data-sat')); }
    });
    try { if (typeof HOST.makeDraggable === 'function') HOST.makeDraggable(p, p.querySelector('.ska-head')); } catch (_) { /* fixed in place */ }
    return p;
  }

  function render() {
    if (!panel) return;
    const wh = /** @type {any} */ (panel.querySelector('.ska-where')), body = /** @type {any} */ (panel.querySelector('.ska-body'));
    const note = /** @type {any} */ (panel.querySelector('.ska-note')), di = /** @type {any} */ (panel.querySelector('.ska-date'));
    if (!hasSite()) {
      wh.innerHTML = esc(pickMsg());
      note.textContent = ''; body.innerHTML = ''; if (di) di.value = '';
      return;
    }
    const s = /** @type {any} */ (site);
    wh.innerHTML = icon('pin') + ' ' + esc(fmtN(4, s.lat) + ', ' + fmtN(4, s.lng)) + ' <button type="button" class="ska-btn ska-pick" style="height:24px">' + esc(T('Change point', '地点を変える')) + '</button>';
    /* the reader's clock, and what the brackets mean */
    const off = siteOff = siteOffsetH(), mine = zoneOffsetMin(whenMs);
    note.textContent = T('Times in your time zone (' + offsetLabel(mine) + ')', '時刻は端末のタイムゾーン（' + offsetLabel(mine) + '）')
      + (off == null ? (mine === 0 ? '' : T('; UTC in brackets (the place’s time zone is not loaded)', '。（ ）内は UTC（地点の時刻帯は未取得）'))
        : (Math.round(off * 60) === mine ? '' : T('; the place’s standard time in brackets', '。（ ）内は地点の標準時')));
    if (di && alm && alm.window) di.value = new Date(alm.window.from + s.lng * 240000).toISOString().slice(0, 10);
    if (busy || (!alm && !almErr)) { body.innerHTML = '<div class="ska-sec ska-m">' + esc(T('Computing tonight’s sky…', '今夜の空を計算中…')) + '</div>'; return; }
    if (!alm) { body.innerHTML = '<div class="ska-sec ska-m" style="color:#ff453a">' + esc(almErr) + '</div>'; return; }
    /* one section by its key — named calls, so the markup each returns is judged where it is built (scripts/output-taint.mjs) */
    /* a section that throws is left out, not the whole panel */
    function almanacSectionHtml(/** @type {string} */ k) {
      try {
        return k === 'sun' ? sunSection() : k === 'moon' ? moonSection() : k === 'planets' ? planetSection()
          : k === 'showers' ? showerSection() : k === 'satellites' ? passSection() : k === 'eclipses' ? eclipseSection() : '';
      } catch (e) { console.warn('sky almanac ' + k, e); return ''; }
    }
    body.innerHTML = SECTIONS.map((k) => '<section class="ska-sec" data-sec="' + esc(k) + '">' + almanacSectionHtml(k) + '</section>').join('');
  }

  function step(/** @type {number} */ dir) {
    if (!alm || !alm.window) return;
    follow = false; whenMs = (alm.window.from + alm.window.to) / 2 + dir * DAY; compute();
  }

  /* ── the doors out ────────────────────────────────────────────────────────────────────────── */
  function lookFrom(/** @type {number} */ ms) {
    if (!hasSite() || !Number.isFinite(ms)) return;
    const s = /** @type {any} */ (site);
    window.IntMapLazy.need('nightSky').then((ok) => { try { const N = window.IntMapNightSky; if (ok && N) N.open({ lng: s.lng, lat: s.lat, when: ms }); } catch (e) { console.warn('night sky', e); } });
  }
  async function selectSatellite(/** @type {string | null} */ id) {
    if (id == null) return;
    try {
      const cb = /** @type {HTMLInputElement | null} */ (document.getElementById('dl-sats'));
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      await window.IntMapLazy.need('satellitesLive');
      const S = SATS();
      const sid = /^\d+$/.test(id) ? +id : id;
      if (S && S.select) S.select(sid);
      try { const C = SATCARD(); if (C && C.open) C.open(sid); } catch (_) { /* the card is optional */ }
    } catch (e) { console.warn('select satellite', e); }
  }

  /* ── the point ────────────────────────────────────────────────────────────────────────────── */
  let pickH = /** @type {any} */ (null);
  function endPick() {
    try { if (pickH) GE().events.off('click', pickH); } catch (_) { /* gone */ }
    pickH = null;
  }
  function setSite(/** @type {any} */ ll) { if (ll && Number.isFinite(+ll.lng) && Number.isFinite(+ll.lat)) site = { lng: +ll.lng, lat: +ll.lat }; return site; }
  function askSite() {
    endPick();
    const done = (/** @type {any} */ ll) => { endPick(); setSite(ll); showAllPasses = false; compute(); };
    try {
      const P = PICK();
      if (P && P.start && P.start({ panel, hint: pickMsg(), announce: false, onPick: done })) { render(); return true; }
    } catch (_) { /* the shared bar is not here: the map's own click */ }
    try { GE().render.canvas().style.cursor = 'crosshair'; } catch (_) { /* no canvas */ }
    pickH = (/** @type {any} */ e) => { try { GE().render.canvas().style.cursor = ''; } catch (_) { /* no canvas */ } done(e.lngLat); };
    try { GE().events.once('click', pickH); } catch (_) { /* no map */ }
    render();
    return true;
  }

  /* ── follow the clock ─────────────────────────────────────────────────────────────────────── */
  function onClock() {
    if (!panel || panel.style.display === 'none') return;
    const t = IntMapTime.nowMs();
    follow = true; whenMs = t;
    if (alm && alm.window && t >= alm.window.from && t < alm.window.to) {
      /* the same night: only the passes depend on where the clock stands inside it */
      clearTimeout(passT); passT = setTimeout(() => loadPasses(gen), 600);
      return;
    }
    compute();
  }

  function open(/** @type {any} */ ll, /** @type {any} */ opts) {
    setSite(ll);
    const o = opts || {};
    if (o.when != null && Number.isFinite(+new Date(o.when))) { whenMs = +new Date(o.when); follow = false; }
    else if (!panel || panel.style.display === 'none') { whenMs = IntMapTime.nowMs(); follow = true; }
    ensurePanel(); /** @type {any} */ (panel).style.display = 'flex';
    if (!stops.length) {
      stops.push(IntMapTime.on(onClock));
      stops.push(bus.on('intmap-lang', () => { if (!panel) return; const was = panel.style.display !== 'none'; panel.remove(); panel = null; if (was) { ensurePanel(); /** @type {any} */ (panel).style.display = 'flex'; render(); } }));
    }
    try { if (HOST.bringToFront) HOST.bringToFront(panel); } catch (_) { /* stacking is cosmetic */ }
    if (!hasSite()) { render(); askSite(); return true; }
    compute();
    return true;
  }
  function close() {
    endPick();
    try { const P = PICK(); if (P && P.active && P.active()) P.abort(); } catch (_) { /* nothing armed */ }
    if (panel) panel.style.display = 'none';
    for (const s of stops.splice(0)) { try { s(); } catch (_) { /* already detached */ } }
    clearTimeout(passT);
    gen++;
    site = null;   /* (#R298) shutting the panel forgets its subject — the next open states its own */
    alm = null; ecl = null; passes = { state: 'idle', list: [] };
    return true;
  }
  function state() {
    return {
      open: !!(panel && panel.style.display !== 'none'), site: site ? { lng: site.lng, lat: site.lat } : null,
      when: new Date(whenMs).toISOString(), follow, busy,
      night: alm && alm.window ? { from: new Date(alm.window.from).toISOString(), to: new Date(alm.window.to).toISOString() } : null,
      sections: SECTIONS.slice(), error: almErr || null,
      planetsSeen: alm ? orderPlanets(alm.planets).seen.map((p) => p.id) : [],
      showers: alm ? alm.showers.map((/** @type {any} */ s) => s.code) : [],
      passes: { state: passes.state, count: passes.list.length },
      eclipses: ecl ? { lunar: ecl.lunar ? new Date(ecl.lunar.maxMs).toISOString() : null, solar: ecl.solar ? new Date(ecl.solar.maxMs).toISOString() : null } : null,
    };
  }

  /* the same arithmetic the panel prints, for a caller that needs the facts (Atlas's sim.skyTonight) — through the
     panel's own door, so the almanac and its ephemeris stay on the panel's lazy load */
  const API = { open, close, state, almanac: (/** @type {any} */ o) => IntMapAlmanac.almanac(o) };
  window.IntMapSkyAlmanac = API;
  return API;
}
