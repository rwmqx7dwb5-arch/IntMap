/* ============================================================================
 *  IntMap · THE WINDOW GLOBALS THE TYPE-CHECKED FILES READ
 * ----------------------------------------------------------------------------
 *  Not every name on window — only those a file under `// @ts-check` reaches for
 *  (the population is described in tsconfig.json). A checked file that reads a
 *  global not declared here fails `npm run check:types` with TS2339, which is the
 *  point: the name has to be declared once, here, with its type if it has one.
 *
 *  ⚠ THIS FILE MAY NOT INVENT A GLOBAL. Two interfaces, because two kinds of
 *  publisher exist, and tests/typecheck-gate-checks.test.mjs holds each to
 *  its register:
 *    · IntMapPublished — names a js/ or src/ file publishes with `window.X =`.
 *      Every one of them must be in tests/global-surface-baseline.json `window`
 *      (the register `npm run check:surface` keeps; that is where a new global is
 *      named, not here).
 *    · PublishedElsewhere — names the program reads but does not publish from
 *      js/ or src/ (an inline <script> in index.html, a vendor bundle). None of
 *      them may be in that register — if one moves into js/, it moves up.
 *
 *  It is a MODULE (`export {}` + `declare global`) rather than a bare script: `npm run
 *  check:static` runs `node --check` on every .ts, and Node strips types only on its ES-module
 *  path — a script-shaped .d.ts is read as CommonJS and `interface` is a syntax error there.
 * ==========================================================================*/

export {};

declare global {

interface IntMapPublished {
  /* the typed seam */
  IntMapGeoEngine: import('./geo-engine').IntMapGeoEngine;
  IntMapTime: import('./chronos').Chronos;
  IntMapModules: Record<string, (...args: any[]) => any>;

  /* the renderer handle and the engine's own diagnostics — untyped escape hatches by design */
  __imap: any;
  __imCesium: any;
  __fsCamActive: any;
  __imGesture: boolean;
  __imRuntime: { errors: any[] } & Record<string, any>;
  __imLazyCheck: { loaded: string[]; failed: string[] };
  CESIUM_BASE_URL: string;
  mlcontour: any;
  maplibregl: any;

  /* published by files not yet under @ts-check; typed `any` until they are */
  IntMapCesiumEngine: any;
  IntMapCesiumInput: any;
  IntMapCesiumLayers: any;
  IntMapVectorTiles: any;
  IntMapStyle: any;
  IntMapWorldBase: any;
  IntMapPlaneGlyph: any;
  IntMapLang: any;
  IntMapSkyModel: any;
  IntMapHistScale: any;
  IntMapRuntime: any;
  IntMapLazy: any;

  /* the load-on-demand modules js/lazy-modules.js mounts (LAZY_REGISTRY `publishes`) */
  IntMapFlightSim: any;
  IntMapStreetView: any;
  IntMapConsole: any;
  IntMapQuery: any;
  IntMapAtlasChart: any;
  IntMapAnswerView: any;
  IntMapRouteUI: any;
  IntMapGis: any;
  IntMapAircraftPanel: any;
  IntMapStatsCompare: any;
  IntMapAviation: any;
  IntMapCompanyData: any;
  IntMapCompanyPanel: any;
  IntMapCompanyFacilities: any;
  IntMapWaves: any;
  IntMapNewsEvents: any;
  IntMapPhotoGeo: any;
  IntMapShakeMap: any;
  IntMapRadiationObs: any;
  IntMapVolume3D: any;
}

interface PublishedElsewhere {
  /** index.html's inline <script> (the XSS output encoder, #R138) */
  IntMapSafe: any;
  /** maplibre-contour's older UMD global name; `mlcontour` is the current one */
  maplibreContour: any;
}

interface Window extends IntMapPublished, PublishedElsewhere {}

/** js/geo-engine.js is the one file allowed to name the renderer; it does so through this global. */
var maplibregl: any;

}
