/* ============================================================================
 *  IntMap · IM_HOST — the shared host every split-out module is handed
 * ----------------------------------------------------------------------------
 *  `const IM_HOST={…}` in js/app-body.js has 277 members (tests/global-surface-
 *  baseline.json `host`, 55 of them writable — `hostWritable`). This type declares
 *  the part of it the type-checked files and the most-read members use; it is a
 *  CLOSED interface, so a checked file that reads a member not declared here fails
 *  `npm run check:types` — the member is then declared here, not cast away.
 *
 *  ⚠ IT MAY NOT CONTRADICT THE REGISTER. tests/typecheck-gate-checks.test.mjs
 *  asserts that every member named here is in `host`, that a member declared
 *  writable (no `readonly`) is in `hostWritable`, and that every member in
 *  `hostWritable` that is declared here is not `readonly`. The register is written
 *  by `node scripts/global-surface.mjs --update`; this file follows it.
 *
 *  Only the getters' SHAPES are claimed. What app-body.js keeps behind them is
 *  not re-typed here (js/app-body.js is not under @ts-check).
 * ==========================================================================*/

export interface IMHost {
  /** the UI language code of the moment (`jp` / `zh` are the repository's spellings) */
  readonly lang: string;
  /** the positional translator: t(lang, en, jp, de, ru, es, …) */
  readonly t: (...args: any[]) => string;
  user: any;
  mode: any;
  readonly proj: any;
  readonly mapType: any;
  readonly DB: any;
  countryGeo: any;
  readonly canDraw: () => boolean;
  readonly isMobile: () => boolean;
  readonly imToast: (msg: string) => void;
  readonly escapeHtml: (s: string) => string;
  toolMode: any;
  readonly makeDraggable: (...args: any[]) => any;
  readonly bringToFront: (...args: any[]) => any;
  readonly userTZ: string;
  userTheme: string;
  unitMode: string;
  /** YYYY-MM-DD — the one rule is js/hist-scale.js `ymd` */
  readonly ymdISO: (d: Date) => string;
  readonly renderUI: (...args: any[]) => any;
}
