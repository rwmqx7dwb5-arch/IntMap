// @ts-check
/* ============================================================================
 *  IntMap · js/tileset-budget.js — how much 3D Tiles memory and detail THIS device is given
 * ----------------------------------------------------------------------------
 *  One tileset costs what its tiles cost; a world of 3D cities (PLATEAU's 306 cities, Google/Cesium-ion style open
 *  tilesets) is many datasets at once, and the device decides how many tiles it can hold. Cesium evicts only
 *  tiles outside the current selection, so the sum is governed from outside (cesium-engine `_governTilesets`).
 *  This module is the single place the NUMBERS come from.
 *
 *  OBSERVATION. 2026-11-19 desktop, 23 Tokyo wards at once: 503 MB held at 9 km altitude against a 384 MiB
 *  per-dataset figure (dev-notes/2026-11-19-plateau-render-quality.md). The `high` and `mobile` rows below are
 *  that desktop figure and the phone figure the engine already used (384/128 MiB, SSE 16/24); `mid` and `low` are
 *  proportional steps for devices that report less memory — NOT yet measured on such hardware.
 *  EXPIRES when a measurement on a 4 GB / low-core device gives different ceilings: change TIERS, nothing else.
 *  SOURCE OF TRUTH: TIERS. Inputs are read from navigator by `readEnv`; the decision is `deviceTier`.
 * ==========================================================================*/

/** @typedef {'low'|'mobile'|'mid'|'high'} DeviceTier */
/** @typedef {{ sse: number, cacheMiB: number, overflowMiB: number, totalMiB: number, maxSse: number }} TilesetBudget */

/** @type {Record<DeviceTier, TilesetBudget>} */
export const TIERS = Object.freeze({
  low:    { sse: 32, cacheMiB: 64,  overflowMiB: 32,  totalMiB: 96,  maxSse: 128 },
  mobile: { sse: 24, cacheMiB: 128, overflowMiB: 64,  totalMiB: 128, maxSse: 96 },
  mid:    { sse: 16, cacheMiB: 256, overflowMiB: 128, totalMiB: 256, maxSse: 64 },
  high:   { sse: 16, cacheMiB: 384, overflowMiB: 192, totalMiB: 384, maxSse: 64 },
});

/** @param {{ deviceMemory?: number, hardwareConcurrency?: number, userAgent?: string, saveData?: boolean }} [env] */
export function deviceTier(env) {
  const e = env || {};
  const mobile = /Mobi|Android|iPhone|iPad/.test(e.userAgent || '');
  const mem = typeof e.deviceMemory === 'number' && e.deviceMemory > 0 ? e.deviceMemory : null;   /* GB, Chromium only */
  const cores = typeof e.hardwareConcurrency === 'number' && e.hardwareConcurrency > 0 ? e.hardwareConcurrency : null;
  if (e.saveData || (mem != null && mem <= 2) || (cores != null && cores <= 2)) return 'low';
  if (mobile) return 'mobile';
  if ((mem != null && mem <= 4) || (cores != null && cores <= 4)) return 'mid';
  return 'high';
}

/** reads the running browser; every field is optional and an unreadable one is simply absent */
function readEnv() {
  try {
    const n = /** @type {any} */ (typeof navigator !== 'undefined' ? navigator : {});
    return { deviceMemory: n.deviceMemory, hardwareConcurrency: n.hardwareConcurrency, userAgent: n.userAgent || '',
             saveData: !!(n.connection && n.connection.saveData) };
  } catch (_) { return {}; }
}

/** @param {{ deviceMemory?: number, hardwareConcurrency?: number, userAgent?: string, saveData?: boolean }} [env] */
export function tilesetBudget(env) { return TIERS[deviceTier(env || readEnv())]; }
