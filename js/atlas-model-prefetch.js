/* The reading half of `model.run` (js/atlas-cap-model.js), registered with the prefetch registry (js/atlas-prefetch.js).
   It lives HERE and not in the capability module because a capability module may hold no top-level statement: the build copies it
   into the kernel as well, and a registration there would run twice (scripts/atlas-caps-split.mjs). This file is imported by
   js/atlas-toolsurface.js — the one reader of the registry — so the reading is registered wherever a turn can start one.
   Where, then the external model: no pin, no camera, nothing the reader sees. */
import { MODELS, RUNNERS } from './specialist-models.js';
import { registerPrefetch } from './atlas-prefetch.js';

/* K._fetchJSON already sends an Open-Meteo URL through the one guarded client (js/atlas-deadlines.js → js/wx-source.js: shared breaker, cache, the turn's deadline) */
export const readerIO = (K) => ({ now: new Date(), getJSON: async (u) => { try { return await K._fetchJSON(u); } catch (_) { return null; } } });

registerPrefetch('model.run', async (a, K) => {
  const m = MODELS.find((x) => x.id === a.model);
  if (!m || m.status !== 'integrated') return null;
  const ref = (a.lat != null && a.lng != null) ? { lat: +a.lat, lng: +a.lng, name: String(a.place || '') } : (a.place ? await K.geocode(a.place) : null);
  if (!ref) return null;
  return { ref, r: await RUNNERS[m.run](ref, readerIO(K)) };
});
