/* ============================================================================
 *  IntMap · THE DEM TILE DECODE, OFF THE PAGE'S THREAD  (speed-overhaul)
 * ----------------------------------------------------------------------------
 *  MEASURED (desktop, unminified build, CDP sampler over 8.4 s of camera moves): the page spent
 *  ~100 ms of its own thread drawing terrarium tiles into a canvas and reading them back, because the
 *  elevation readout warms 49 points of the view 200 ms after every settle — and a reader who moves
 *  again inside that window met the decode under their finger. The fetch, the image decode, the
 *  readback and the conversion to metres all happen here now; the page receives a transferred
 *  Float32Array it can store as it is. The conversion is js/dem-decode.js — the same function the
 *  page runs when no worker is available.
 *  Protocol: {id, url, ms} → {id, ok:true, el:ArrayBuffer, voids} | {id, ok:false, err}.
 * ==========================================================================*/
import { decodeTerrarium } from '../js/dem-decode.js';

let cv = null, cx = null;
self.onmessage = async (ev) => {
  const m = ev.data || {};
  if (!m.id || !m.url) return;
  if (!(m.ms > 0)) { self.postMessage({ id: m.id, ok: false, err: 'no deadline' }); return; }   /* the caller owns the deadline; no second copy of it here */
  try {
    /* the store's own deadline (js/map-readout.js DEM_REQUEST_TIMEOUT_MS), so a silent host ends here too */
    const r = await fetch(m.url, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(m.ms) });
    if (!r.ok) throw new Error('http ' + r.status);
    const bmp = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    if (!cv) { cv = new OffscreenCanvas(256, 256); cx = cv.getContext('2d', { willReadFrequently: true }); }
    cx.clearRect(0, 0, 256, 256);
    cx.drawImage(bmp, 0, 0, 256, 256);
    try { bmp.close(); } catch (_) { }
    const { el, voids } = decodeTerrarium(cx.getImageData(0, 0, 256, 256).data);
    self.postMessage({ id: m.id, ok: true, el: el.buffer, voids }, [el.buffer]);
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, err: String((e && e.message) || e) });
  }
};
