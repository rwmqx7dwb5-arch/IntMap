// @ts-check
/* ============================================================================
 *  IntMap · WHERE THE READER IS — one reading of the device position   (installable-app)
 * ----------------------------------------------------------------------------
 *  「現在地へ移動」 is asked for from three doors, and until this file each read the sensor with code
 *  of its own:
 *
 *      js/atlas-cap-view.js     view.locate          permission pre-check, 25 s GPS, 28 s guard,
 *                                                    denied / failed / timed-out, each worded
 *      js/atlas-geo-resolve.js  「現在地から…」       20 s GPS, no pre-check, every failure `null`
 *      js/map-extras.js         IntMapLocate.start   20 s GPS, no pre-check, denied / failed — the live
 *                                                    marker the phone FAB and the desktop control drive
 *
 *  Readers of one sensor disagreed in the only places that matter to a reader: whether a site the
 *  browser has BLOCKED is told so before it waits (only view.locate checked), how long «no answer»
 *  is allowed to take, and whether a refusal, a sensor with no fix and a timeout are three things or
 *  one. ⚠ IntMapLocate keeps its watchPosition: refining a fix as the GPS converges is the marker's
 *  job, not a second reading — only its FIRST fix comes from here. So the reading has ONE owner and it answers with a REASON rather than a sentence:
 *
 *      { ok: true,  lng, lat, acc, at }
 *      { ok: false, reason: 'unsupported' | 'blocked' | 'denied' | 'unavailable' | 'timeout' }
 *
 *  ⚠ THE WORDS STAY WITH THE DOOR. Atlas speaks to the reader in its own voice («ask me again»)
 *  and the map's control in the interface's; what they must agree on is the FACT, and the fact is
 *  the reason. A door that cannot tell `blocked` from `timeout` is the defect this replaces.
 *  ⚠ «Could not observe» IS NOT «failed» (.agents/rules/one-pass-or-a-reason.md §5): a timeout is
 *  reported as `timeout`, never as a refusal the reader would then go and «fix» in their settings.
 *  ⚠ IT REMEMBERS NOTHING. Each door already keeps the fix it is entitled to reuse (Atlas's
 *  five-minute 「現在地」 cache, the live marker's last sample); a memory here would let one door's
 *  stale fix answer for another door that was asked to read the sensor.
 * ==========================================================================*/

/** The reasons a reading can end without a position. Exported so the doors and the tests name the
 *  same strings; nothing else in the app spells them. */
export const FIX_FAILURE = Object.freeze({
  UNSUPPORTED: 'unsupported',   /* no navigator.geolocation (an insecure context, an old engine) */
  BLOCKED: 'blocked',           /* the browser already holds a hard «deny» for this site — it will not ask */
  DENIED: 'denied',             /* the reader answered the prompt with «deny» (PositionError 1) */
  UNAVAILABLE: 'unavailable',   /* the device has no fix to give (PositionError 2) */
  TIMEOUT: 'timeout',           /* no answer inside the budget (PositionError 3, or the guard below) */
});

/* ══ THE BUDGET, AND WHY IT IS THIS ═══════════════════════════════════════════════════════════
   OBSERVED (#R155, #R170, recorded beside view.locate where it was first set): a GPS cold start that
   follows the permission prompt genuinely takes about 25 s on a phone, and the prompt itself has to
   be answerable inside the same window — 9 s and then 15 s were both measured too short. The GUARD
   outlasts the sensor's own timeout so that a sensor which does answer «timeout» is the one heard;
   it exists only for engines that never call back at all (#R170: «must outlast the 25 s budget, or
   this outer guard would report a timeout while the GPS was still converging»).
   ⚠ It expires when a browser's first-fix behaviour changes; the one place to retune it is here. */
const FIX_TIMEOUT_MS = 25000;
const GUARD_MARGIN_MS = 3000;

/** @typedef {{ ok: true, lng: number, lat: number, acc: number, at: number }} Fix */
/** @typedef {{ ok: false, reason: string }} NoFix */

/** Map a PositionError code to a reason. 1/2/3 are the W3C constants; anything else is the sensor
 *  having no fix to give, which is what an engine-specific error amounts to for the reader. */
function reasonOf(err) {
  const c = err && err.code;
  return c === 1 ? FIX_FAILURE.DENIED : c === 3 ? FIX_FAILURE.TIMEOUT : FIX_FAILURE.UNAVAILABLE;
}

/**
 * Read the device position once.
 * ⚠ `maximumAge: 0` and `enableHighAccuracy: true` (#R170): a cached fix is the LAST one the device
 * computed — possibly a coarse network fix another app asked for, a different city.
 * @param {{ timeoutMs?: number, geolocation?: Geolocation, permissions?: Permissions }} [opts]
 * @returns {Promise<Fix|NoFix>}
 */
export async function requestFix(opts) {
  const o = opts || {};
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const geo = o.geolocation || (nav && nav.geolocation);
  if (!geo || typeof geo.getCurrentPosition !== 'function') return { ok: false, reason: FIX_FAILURE.UNSUPPORTED };
  /* (#R155) a HARD-denied site is never re-prompted by the browser, so asking would only wait out the
     timeout and then say something untrue. Where the Permissions API can tell, say «blocked» now. */
  const perms = o.permissions || (nav && nav.permissions);
  try {
    if (perms && typeof perms.query === 'function') {
      const st = await perms.query({ name: 'geolocation' });
      if (st && st.state === 'denied') return { ok: false, reason: FIX_FAILURE.BLOCKED };
    }
  } catch (_) { /* a browser that cannot answer the question is asked the sensor directly */ }
  const timeoutMs = o.timeoutMs > 0 ? +o.timeoutMs : FIX_TIMEOUT_MS;
  return await new Promise((resolve) => {
    let done = false;
    /** @type {any} */
    let guard = null;
    const fin = (r) => { if (!done) { done = true; if (guard) clearTimeout(guard); resolve(r); } };
    guard = setTimeout(() => fin({ ok: false, reason: FIX_FAILURE.TIMEOUT }), timeoutMs + GUARD_MARGIN_MS);
    try {
      geo.getCurrentPosition(
        (p) => {
          const lng = +p.coords.longitude, lat = +p.coords.latitude;
          if (!isFinite(lng) || !isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fin({ ok: false, reason: FIX_FAILURE.UNAVAILABLE });
          fin({ ok: true, lng, lat, acc: Math.max(0, +p.coords.accuracy || 0), at: Date.now() });
        },
        (err) => fin({ ok: false, reason: reasonOf(err) }),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 });
    } catch (_) { fin({ ok: false, reason: FIX_FAILURE.UNAVAILABLE }); }
  });
}
