/* ============================================================================
 *  IntMap · THE BRIEFING A LINK CARRIES — the owner of MapState's `brief` field   (atlas-briefing)
 * ----------------------------------------------------------------------------
 *  A link may carry an Atlas briefing (js/map-state.js SCHEMA `brief`, `&b=…` in the fragment). The
 *  reader that shows it is Atlas's (js/atlas-briefing.js, in the lazy Atlas chunk), but the FIELD has to
 *  be owned from boot: the address bar is rewritten by the store on every move (js/map-ui.js save()),
 *  and a field nobody reads is a field the next write drops — a reload would lose the briefing.
 *
 *  So this small eager module is the owner and nothing more: it remembers the packed value, answers it
 *  to the store, and hands a value the restore gives it to the Atlas kernel — fetching that kernel
 *  through window.IntMapAtlas (js/atlas-loader.js) only when a link actually carries a briefing. Unpacking,
 *  validating and drawing are the reader's (js/atlas-briefing-codec.js); this file never looks inside.
 * ==========================================================================*/
import { MapState } from './map-state.js';

let packed = '';

function set(v, fromRestore) {
  const s = MapState.briefText(v);
  if (s === packed) return false;
  packed = s;
  MapState.changed('brief', fromRestore ? undefined : { cause: 'reader' });
  return true;
}

/* a restore hands the link's value: absent is «no briefing», so a plain map link opened over a briefing closes it */
MapState.own('brief', {
  read: () => packed,
  apply: (v) => {
    if (!set(v, true)) return;
    if (packed) { try { window.IntMapAtlas.call('openBriefing', packed); } catch (_) { } }
    else { try { const K = window.IntMapConsole; if (K && K.closeBriefing) K.closeBriefing(); } catch (_) { } }   /* closing must not fetch the kernel (js/atlas-loader.js) */
  },
});

/** the reader's side: the briefing it shows is the one the address bar carries (set), and closing it takes it out (clear) */
export const BriefingLink = {
  packed: () => packed,
  set: (v) => set(v, false),
  clear: () => set('', false),
};
