/* ============================================================================
 *  IntMap · CHRONOS (window.IntMapTime) — the master clock's public shape
 * ----------------------------------------------------------------------------
 *  js/chronos.js assigns its object to `window.IntMapTime`, which types/globals.d.ts
 *  declares as `Chronos`; tsc therefore checks the object the IIFE returns against
 *  this interface (a member removed there, or renamed, fails `npm run check:types`).
 * ==========================================================================*/

/** What every subscriber receives, and what `state()` answers. */
export interface ChronosEvent {
  /** the pinned instant, or null when the clock is live */
  date: Date | null;
  /** always a Date — now, when live */
  when: Date;
  /** YYYY-MM-DD, with the expanded year form outside 0…9999 (js/hist-scale.js `ymd`) */
  iso: string;
  year: number;
  isLive: boolean;
  source: string;
}

export interface ChronosSetOptions {
  source?: string;
  allowFuture?: boolean;
}

export interface Chronos {
  get(): Date | null;
  when(): Date;
  /** `when()` in epoch ms — now when live */
  nowMs(): number;
  iso(): string;
  year(): number;
  isLive(): boolean;
  /** the oldest year the clock accepts — read at call time from js/hist-scale.js FLOOR */
  min: number;
  state(): ChronosEvent;
  /** subscribe; the return value unsubscribes */
  on(fn: (e: ChronosEvent) => void): () => void;
  set(d: Date | number | string | null, opts?: ChronosSetOptions): Chronos;
  setYear(y: number, opts?: ChronosSetOptions): Chronos;
  setDaysAgo(days: number, opts?: ChronosSetOptions): Chronos;
  setNow(opts?: ChronosSetOptions): Chronos;
  /** the reader is on the way to the past — fired once (js/chronos.js); a late subscriber is called at once */
  intent(source?: string): Chronos;
  intended(): { source: string; at: number } | null;
  onIntent(fn: (i: { source: string; at: number }) => void): () => void;
}
