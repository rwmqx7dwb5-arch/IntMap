/* ui-layer-owner — the layout/device owner, installed into a harness's fake window.
   js/ now asks `window.IntMapDevice.compact()` where it used to call `matchMedia('(max-width:768px)')`
   itself. A harness that fakes `matchMedia` gets the REAL owner (js/ui-device.js, evaluated) wired to
   that fake — not a stub that could disagree with it. The media query lists it hands the owner are
   live: they re-ask the harness's `matchMedia` on every read, so a harness that flips its answer
   between cases (phone, then desktop) is heard. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../js/ui-device.js', import.meta.url), 'utf8');

export function installDevice(win) {
  const ask = (q) => { try { const m = win.matchMedia && win.matchMedia(q); return !!(m && m.matches); } catch (_) { return false; } };
  const g = {
    Math, Set, Object,
    matchMedia: (q) => ({ get matches() { return ask(q); }, addEventListener() { } }),
    get screen() { return win.screen || {}; },
    document: win.document && win.document.body ? win.document : undefined,
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(SRC, g, { filename: 'ui-device.js' });
  win.IntMapDevice = g.IntMapDevice;
  return win;
}
