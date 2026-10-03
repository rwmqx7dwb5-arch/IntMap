/* ============================================================================
 *  IntMap · js/layer-manifest.js — WHICH LAYERS EXIST, AS DATA (derived from the declarations)
 * ----------------------------------------------------------------------------
 *  Every checkbox of the Layers registry (`#layer-dropdown`), in the order the panel shows them,
 *  on the shelf the panel files them under, with the facts the readers of that registry need:
 *
 *      id      the checkbox id — the key the session, the share link, the favourites and Atlas hold
 *      kind    'display' for an item of the MAP DISPLAY (基本表示: labels, borders, roads, day & night …);
 *              absent for a LAYER. Every row of the registry is one or the other — see the note below
 *      key     the short name reorganizeLayerPanel files it by (`climate`, `wbgini`, `nightside` …);
 *              absent for a row nothing names that way
 *      label   the i18n key of its name, when the row names itself through one (`data-i18n`);
 *              absent when the module that builds the row composes its own name
 *      rest    folded behind 「その他N件」 inside its shelf (#R469 — the reader named the others)
 *      on      ticked for a first-time reader (was window.IntMapDefaultOn)
 *      share   carried by the share link's `&l=` (was a prefix selector in js/map-ui.js)
 *      html    the row is generated from this file by js/layer-rows.js (it was markup in index.html)
 *      lazy    the on-demand module(s) (js/lazy-modules.js LAZY_REGISTRY) its toggle loads
 *
 *  ══ ⚠⚠⚠ (layer-descriptor) THIS FILE NO LONGER HOLDS THE LIST — IT DERIVES IT ══════════════════════
 *  A layer is ONE declaration, js/layers/<id>.js (what it may say: scripts/lib/layer-descriptor.mjs). The shelves
 *  and their order are js/layers/_shelves.js. The set of declarations is turned into the list when the region
 *  below is written (scripts/layer-descriptors.mjs), and this module hands it on in the shape
 *  every reader has always asked for — SHELVES, LAYERS and the views below are unchanged, and
 *  tests/layer-descriptor-checks.test.mjs holds the derived value byte-for-byte equal to the
 *  photograph of the hand-kept list it replaced (tests/fixtures/layer-descriptor-before.json).
 *  The history notes that stood beside each row moved into that row's own file.
 *
 *  ══ ⚠⚠⚠ (basic-display-not-layers) THE MAP DISPLAY IS NOT A LAYER ══════════════════════════════════════
 *  The reader, 2026-10-02:「基本表示をレイヤーって言うな。」 The registry (`#layer-dropdown`) holds both, because both
 *  are switched the same way; what they ARE is the declaration's `kind`, and every reader that says «layer» —
 *  a count, a list, the share link's `l=`, the usage count, Atlas, the landing page — asks it here:
 *  `isDisplay(id)`, `dataLayers()` (the layers, display items excluded) and `displayItems()`. `LAYERS` and
 *  `isLayer` keep their meaning of «a row of the registry», display items included: the time kernel, the row
 *  builder and the panel file every row, whichever it is.
 *  ⚠ ADDING A LAYER: add js/layers/<id>.js — `id`, `shelf`, `order` and the facts above — and build its
 *  row as before. `npm run build` indexes the directory (scripts/layer-descriptors.mjs --write); the gate
 *  fails while the index disagrees with the directory, and on any link a registry does not hold.
 *  (layer-manifest, still true) A row the document has and no declaration names is still filed (the
 *  safety sweep puts it under Beta), but tests/layer-manifest.spec.js fails.
 *  ⚠ PURE DATA + PURE FUNCTIONS: no DOM, no `window`. Node tests import it as it is; the DOM side is
 *  js/layer-rows.js.
 *  (layer-packages) …and the one thing here that is not data: `loadPackage(name)`, the literal dynamic import of
 *  each LAYER PACKAGE a declaration names (`pkg` → js/layer-pkg-<pkg>.js). It fetches nothing until called, so
 *  importing this file still runs no code of any layer; js/data-layers.js calls it the first time one of the
 *  package's rows is switched, which is what keeps a package off the boot path.
 * ==========================================================================*/
/* ⚠ THE REGION BELOW IS GENERATED: the list already derived from the declarations (scripts/lib/layer-descriptor.mjs
   deriveShelves, run by `node scripts/layer-descriptors.mjs --write`, which `npm run build` runs first) and every
   declaration's value. Copied in rather than imported — the boot path carries no module per layer and no index
   module either (check:perf eager.modules; the same reason the capability rows are copied into
   js/atlas-capabilities.js). Edit js/layers/<id>.js, never the region. */
/* ⚠ GENERATED LAYERS — BEGIN (scripts/layer-descriptors.mjs --write; DO NOT EDIT) */
/** the Layers list — every shelf of js/layers/_shelves.js in panel order, its rows in `order` (scripts/lib/layer-descriptor.mjs deriveShelves) */
const DERIVED = [
  { key: "base", layers: [
    { id: "cb-names", kind: "display", label: "placeNames", on: true, html: true },
    { id: "cb-geolabels", kind: "display", label: "geoLabels", on: true, html: true },
    { id: "cb-poi", kind: "display", label: "poiLabels", on: true, html: true },
    { id: "cb-borders", kind: "display", label: "borders", on: true, html: true },
    { id: "cb-coast", kind: "display", label: "coastline", html: true },
    { id: "cb-admin1", kind: "display", label: "adminBounds", on: true, html: true },
    { id: "cb-roads", kind: "display", label: "roadsLayer", on: true, html: true },
    { id: "cb-rail2", kind: "display", label: "railLayer", on: true, html: true },
    { id: "cb-grid", kind: "display", label: "gridLayer", html: true },
    { id: "dl-nightside", kind: "display", key: "nightside", label: "lyrNightSide", share: true },
    { id: "beta-dl-bldg3d", kind: "display", key: "bldg3d", share: true },
  ] },
  { key: "lyrGrpClimate", layers: [
    { id: "dl-climate", key: "climate", label: "lyrClimate", share: true },
    { id: "dl-wind", key: "wind", label: "lyrWind", share: true },
    { id: "dl-annprecip", key: "annprecip", share: true },
    { id: "dl-ec-temp", key: "ec-temp", share: true },
    { id: "dl-ec-precip", key: "ec-precip", share: true },
    { id: "dl-radar", key: "radar", label: "lyrRadar", share: true },
    { id: "dl-ec-slp", key: "ec-slp", share: true },
    { id: "dl-ec-gust", key: "ec-gust", share: true },
    { id: "dl-snow", key: "snow", label: "lyrSnow", share: true },
    { id: "dl-ec-cloud", key: "ec-cloud", rest: true, share: true },
    { id: "dl-ec-dew", key: "ec-dew", rest: true, share: true },
    { id: "dl-aod", key: "aod", label: "lyrAOD", rest: true, share: true },
    { id: "dl-ec-cape", key: "ec-cape", rest: true, share: true },
    { id: "bx-wbpm25", key: "wbpm25", rest: true },
    { id: "bx-wbco2", key: "wbco2", rest: true },
  ] },
  { key: "lyrGrpOrbit", layers: [
    { id: "dl-sats", key: "sats", label: "lyrSats", share: true, lazy: ["satellitesLive"] },
    { id: "l9-dl-aurora", key: "aurora", share: true },
    { id: "fac-dl-osmspace", key: "osmspace", rest: true },
  ] },
  { key: "lyrGrpMaritime", layers: [
    { id: "dl-sst", key: "sst", label: "lyrSST", share: true },
    { id: "dl-waves", key: "waves", share: true, lazy: ["waves"] },
    { id: "wp-dl-currents", key: "currents", share: true },
    { id: "gx-gxsstanom", key: "gxsstanom", rest: true, share: true },
    { id: "wp-dl-tides", key: "tides", rest: true, share: true, lazy: ["worldPacksBody"] },
    { id: "gx-gxseaice", key: "gxseaice", rest: true, share: true },
  ] },
  { key: "lyrGrpTerrain", layers: [
    { id: "eco-dl-plates", key: "plates", share: true },
    { id: "dl-relief", key: "relief", label: "lyrRelief", share: true },
    { id: "dl-sealevel", key: "sealevel", label: "lyrSeaLevel", share: true },
    { id: "dl-hillshade", key: "hillshade", label: "lyrHillshade", rest: true, share: true },
    { id: "gx-gxrelief", key: "gxrelief", rest: true, share: true },
  ] },
  { key: "lyrGrpNature", layers: [
    { id: "eco-dl-worldcover", key: "worldcover", share: true },
    { id: "eco-dl-ecoregions", key: "ecoregions", share: true },
    { id: "gx-gxndvi", key: "gxndvi", share: true },
    { id: "bx-wbforest", key: "wbforest", rest: true },
  ] },
  { key: "lyrGrpDemo", layers: [
    { id: "dl-popgrid", key: "popgrid", label: "lyrPopGrid", share: true },
    { id: "dl-nightsat", key: "nightsat", label: "lyrNightSat", share: true },
    { id: "dl-tfr", key: "tfr", label: "lyrTFR", share: true },
    { id: "dl-pop", key: "pop", label: "lyrPop", rest: true, share: true },
    { id: "bx-wbpopgrow", key: "wbpopgrow", rest: true },
    { id: "bx-wbaging", key: "wbaging", rest: true },
    { id: "bx-wbfert", key: "wbfert", rest: true },
    { id: "bx-wbadofert", key: "wbadofert", rest: true },
    { id: "bx-wburb", key: "wburb", rest: true },
    { id: "bx-wbrural", key: "wbrural", rest: true },
    { id: "bx-wbdensity", key: "wbdensity", rest: true },
    { id: "bx-wbref", key: "wbref", rest: true },
  ] },
  { key: "lyrGrpHazard", layers: [
    { id: "wp-dl-alerts", key: "alerts", share: true, lazy: ["worldPacksBody"] },
    { id: "bx-eq", key: "eq" },
    { id: "beta-dl-volc2", key: "volc2", share: true },
    { id: "dl-thermal", key: "thermal", label: "lyrThermal", rest: true, share: true },
    { id: "fac-dl-osmemg", key: "osmemg", rest: true },
    { id: "beta-dl-radobs", key: "radobs", rest: true, share: true, lazy: ["radiationLayer"] },
  ] },
  { key: "lyrGrpPolitics", layers: [
    { id: "dl-dem", key: "dem", label: "lyrDem", share: true },
    { id: "beta-dl-cpi", key: "cpi", share: true },
    { id: "dl-eez", key: "eez", label: "lyrEEZ", share: true },
    { id: "dl-uselect", key: "uselect", share: true },
    { id: "dl-eu", key: "eu", label: "lyrEU", share: true },
    { id: "dl-ww2", key: "ww2", share: true, lazy: ["warLayer"] },
    { id: "dl-elect", key: "elect", rest: true, share: true },
    { id: "dl-newspulse", key: "newspulse", share: true, lazy: ["newsIntel"] },
    { id: "dl-ww1", key: "ww1", rest: true, share: true, lazy: ["warLayer"] },
    { id: "dl-korea", key: "korea", rest: true, share: true, lazy: ["warLayer"] },
    { id: "dl-vietnam", key: "vietnam", rest: true, share: true, lazy: ["warLayer"] },
    { id: "dl-mideast", key: "mideast", rest: true, share: true, lazy: ["warLayer"] },
    { id: "dl-yugoslavia", key: "yugoslavia", rest: true, share: true, lazy: ["warLayer"] },
    { id: "dl-tz", key: "tz", rest: true, share: true },
    { id: "bx-wbwomparl", key: "wbwomparl", rest: true },
    { id: "fac-dl-osmdiplo", key: "osmdiplo", rest: true },
  ] },
  { key: "lyrGrpSecurity", layers: [
    { id: "dl-milSpend", key: "milSpend", label: "lyrMilSpend", share: true },
    { id: "dl-nato", key: "nato", label: "lyrNATO", share: true },
    { id: "beta-dl-ukrfront", key: "ukrfront", share: true },
    { id: "bx-wbmilgdp", key: "wbmilgdp", rest: true },
    { id: "bx-wbmilppl", key: "wbmilppl", rest: true },
    { id: "fac-dl-osmmil", key: "osmmil", rest: true },
  ] },
  { key: "lyrGrpHealth", layers: [
    { id: "beta-dl-lifeexp", key: "lifeexp", share: true },
    { id: "bx-wbinfmort", key: "wbinfmort" },
    { id: "bx-wbsuicide", key: "wbsuicide" },
    { id: "bx-wbsmoke", key: "wbsmoke" },
    { id: "bx-wbalcohol", key: "wbalcohol" },
    { id: "bx-wbwater", key: "wbwater" },
    { id: "bx-wbhealth", key: "wbhealth", rest: true },
    { id: "bx-wbphys", key: "wbphys", rest: true },
    { id: "bx-wbbeds", key: "wbbeds", rest: true },
    { id: "bx-wbu5mort", key: "wbu5mort", rest: true },
    { id: "bx-wblife", key: "wblife", rest: true },
    { id: "bx-wbsan", key: "wbsan", rest: true },
    { id: "bx-wboverwt", key: "wboverwt", rest: true },
    { id: "fac-dl-osmhealth", key: "osmhealth", rest: true },
    { id: "fac-dl-osmwater", key: "osmwater", rest: true },
  ] },
  { key: "lyrGrpTech", layers: [
    { id: "dl-subcables", key: "subcables", label: "lyrSubcables", share: true },
    { id: "beta-dl-dc", key: "dc", rest: true, share: true, lazy: ["dataCenters"] },
    { id: "dl-nethlth", key: "nethlth", rest: true, share: true, lazy: ["netHealthLive"] },
    { id: "dl-netreach", key: "netreach", rest: true, share: true, lazy: ["netHealthLive"] },
    { id: "bx-wbnet", key: "wbnet", rest: true },
    { id: "bx-wbmobile", key: "wbmobile", rest: true },
    { id: "bx-wbbbnd", key: "wbbbnd", rest: true },
    { id: "bx-wbrnd", key: "wbrnd", rest: true },
    { id: "bx-wbresearch", key: "wbresearch", rest: true },
    { id: "bx-wbpatent", key: "wbpatent", rest: true },
    { id: "fac-dl-osmtelecom", key: "osmtelecom", rest: true },
  ] },
  { key: "lyrGrpEconomy", layers: [
    { id: "dl-gdppc", key: "gdppc", label: "lyrGDPpc", share: true },
    { id: "wp-dl-trade", key: "trade", share: true, lazy: ["worldPacksBody"] },
    { id: "bx-wbgini", key: "wbgini" },
    { id: "wp-dl-industry", key: "industry", rest: true, share: true },
    { id: "bx-wbgdpgrow", key: "wbgdpgrow", rest: true },
    { id: "bx-wbinfl", key: "wbinfl", rest: true },
    { id: "bx-wbtrade", key: "wbtrade", rest: true },
    { id: "bx-wbtax", key: "wbtax", rest: true },
    { id: "bx-wbdebt", key: "wbdebt", rest: true },
    { id: "bx-wbmanuf", key: "wbmanuf", rest: true },
    { id: "bx-wbhitech", key: "wbhitech", rest: true },
    { id: "bx-wbfdi", key: "wbfdi", rest: true },
    { id: "bx-wbunemp", key: "wbunemp", rest: true },
    { id: "bx-wbgni", key: "wbgni", rest: true },
    { id: "bx-wbpov", key: "wbpov", rest: true },
    { id: "bx-wbflfp", key: "wbflfp", rest: true },
    { id: "bx-wbremit", key: "wbremit", rest: true },
    { id: "bx-wbtour", key: "wbtour", rest: true },
    { id: "beta-dl-pharma", key: "pharma", rest: true, share: true },
  ] },
  { key: "lyrGrpSociety", layers: [
    { id: "dl-hdi", key: "hdi", label: "lyrHDI", share: true },
    { id: "bx-wbhomicide", key: "wbhomicide" },
    { id: "beta-dl-cat-language", key: "cat-language", share: true },
    { id: "beta-dl-whs", key: "whs", rest: true, share: true },
    { id: "bx-wblit", key: "wblit", rest: true },
    { id: "bx-wbschool", key: "wbschool", rest: true },
    { id: "bx-wbtert", key: "wbtert", rest: true },
    { id: "bx-wbedu", key: "wbedu", rest: true },
    { id: "fac-dl-osmedu", key: "osmedu", rest: true },
    { id: "beta-dl-cat-religion", key: "cat-religion", rest: true, share: true },
  ] },
  { key: "lyrGrpTransport", layers: [
    { id: "dl-planes", key: "planes", label: "lyrPlanes", share: true, lazy: ["aviationLive"] },
    { id: "beta-dl-rail", key: "rail", share: true, lazy: ["railways"] },
    { id: "dl-ships", key: "ships", label: "lyrShips", rest: true, share: true },
    { id: "ox-oxrail", key: "oxrail", rest: true },
    { id: "ox-oxsea", key: "oxsea", rest: true },
    { id: "fac-dl-osmair", key: "osmair", rest: true },
    { id: "fac-dl-osmport", key: "osmport", rest: true },
    { id: "dl-webcams", key: "webcams", rest: true, share: true },
  ] },
  { key: "lyrGrpAgri", layers: [
    { id: "wp-dl-crops", key: "crops", share: true, lazy: ["worldPacksBody"] },
    { id: "bx-wbagremp", key: "wbagremp" },
    { id: "bx-wbunder", key: "wbunder" },
    { id: "bx-wbagri", key: "wbagri", rest: true },
    { id: "gx-gxsoil", key: "gxsoil", rest: true, share: true },
  ] },
  { key: "lyrGrpEnergy", layers: [
    { id: "wp-dl-energy", key: "energy", share: true, lazy: ["worldPacksBody"] },
    { id: "bx-wbrenew", key: "wbrenew" },
    { id: "bx-wbelec", key: "wbelec" },
    { id: "fac-dl-osmpower", key: "osmpower", rest: true },
    { id: "fac-dl-osmextract", key: "osmextract", rest: true },
    { id: "l9-dl-dams", key: "dams", rest: true, share: true },
    { id: "bx-wbcook", key: "wbcook", rest: true },
    { id: "bx-wbelecuse", key: "wbelecuse", rest: true },
    { id: "bx-wbrenelec", key: "wbrenelec", rest: true },
    { id: "bx-wbenergy", key: "wbenergy", rest: true },
  ] },
  { key: "lyrGrpIndic", layers: [] },
  { key: "lyrGrpOthersReal", layers: [] },
  { key: "lyrGrpOthers", layers: [
    { id: "dl-precip", key: "precip", label: "lyrPrecip", share: true },
    { id: "dl-ec-wind", key: "ec-wind", share: true },
    { id: "beta-dl-volcash", share: true, lazy: ["volcanoLayers"] },
    { id: "beta-dl-volchaz", share: true, lazy: ["volcanoLayers"] },
    { id: "beta-dl-volcso2", share: true, lazy: ["volcanoLayers"] },
    { id: "beta-dl-unemp", share: true },
    { id: "beta-dl-internet", share: true },
    { id: "beta-dl-precip", share: true },
    { id: "beta-dl-spin", share: true },
    { id: "wp-dl-outbreaks", share: true },
    { id: "bx-heat" },
  ] },
  { key: "hidden", layers: [
    { id: "cb-countries", label: "countries", html: true },
    { id: "dl-contours", label: "lyrContours", share: true },
  ] },
];
/** every declaration whole, links included, in panel order */
const DECLARATIONS = [
  { id: "cb-names", kind: "display", shelf: "base", order: 10, label: "placeNames", on: true, html: true },   // cb-names.js
  { id: "cb-geolabels", kind: "display", shelf: "base", order: 20, label: "geoLabels", on: true, html: true },   // cb-geolabels.js
  { id: "cb-poi", kind: "display", shelf: "base", order: 30, label: "poiLabels", on: true, html: true },   // cb-poi.js
  { id: "cb-borders", kind: "display", shelf: "base", order: 40, label: "borders", on: true, html: true },   // cb-borders.js
  { id: "cb-coast", kind: "display", shelf: "base", order: 50, label: "coastline", html: true },   // cb-coast.js
  { id: "cb-admin1", kind: "display", shelf: "base", order: 60, label: "adminBounds", on: true, html: true },   // cb-admin1.js
  { id: "cb-roads", kind: "display", shelf: "base", order: 70, label: "roadsLayer", on: true, html: true },   // cb-roads.js
  { id: "cb-rail2", kind: "display", shelf: "base", order: 80, label: "railLayer", on: true, html: true },   // cb-rail2.js
  { id: "cb-grid", kind: "display", shelf: "base", order: 90, label: "gridLayer", html: true, atlas: ["view.grid"] },   // cb-grid.js
  { id: "dl-nightside", kind: "display", shelf: "base", order: 100, key: "nightside", label: "lyrNightSide", share: true, atlas: ["layers.nightSide"] },   // dl-nightside.js
  { id: "beta-dl-bldg3d", kind: "display", shelf: "base", order: 110, key: "bldg3d", share: true },   // beta-dl-bldg3d.js
  { id: "dl-climate", shelf: "lyrGrpClimate", order: 10, key: "climate", label: "lyrClimate", share: true, registry: ["climate"] },   // dl-climate.js
  { id: "dl-wind", shelf: "lyrGrpClimate", order: 20, key: "wind", label: "lyrWind", share: true, registry: ["wind"], atlas: ["layers.windParticles"] },   // dl-wind.js
  { id: "dl-annprecip", shelf: "lyrGrpClimate", order: 30, key: "annprecip", share: true, registry: ["annprecip"] },   // dl-annprecip.js
  { id: "dl-ec-temp", shelf: "lyrGrpClimate", order: 40, key: "ec-temp", share: true, registry: ["temp"] },   // dl-ec-temp.js
  { id: "dl-ec-precip", shelf: "lyrGrpClimate", order: 50, key: "ec-precip", share: true },   // dl-ec-precip.js
  { id: "dl-radar", shelf: "lyrGrpClimate", order: 60, key: "radar", label: "lyrRadar", share: true, pkg: "radar" },   // dl-radar.js
  { id: "dl-ec-slp", shelf: "lyrGrpClimate", order: 70, key: "ec-slp", share: true, atlas: ["layers.isobars"] },   // dl-ec-slp.js
  { id: "dl-ec-gust", shelf: "lyrGrpClimate", order: 80, key: "ec-gust", share: true },   // dl-ec-gust.js
  { id: "dl-snow", shelf: "lyrGrpClimate", order: 90, key: "snow", label: "lyrSnow", share: true, registry: ["snow"], sources: ["Open-Meteo"] },   // dl-snow.js
  { id: "dl-ec-cloud", shelf: "lyrGrpClimate", order: 100, key: "ec-cloud", rest: true, share: true },   // dl-ec-cloud.js
  { id: "dl-ec-dew", shelf: "lyrGrpClimate", order: 110, key: "ec-dew", rest: true, share: true },   // dl-ec-dew.js
  { id: "dl-aod", shelf: "lyrGrpClimate", order: 120, key: "aod", label: "lyrAOD", rest: true, share: true, registry: ["aod"] },   // dl-aod.js
  { id: "dl-ec-cape", shelf: "lyrGrpClimate", order: 130, key: "ec-cape", rest: true, share: true },   // dl-ec-cape.js
  { id: "bx-wbpm25", shelf: "lyrGrpClimate", order: 140, key: "wbpm25", rest: true },   // bx-wbpm25.js
  { id: "bx-wbco2", shelf: "lyrGrpClimate", order: 150, key: "wbco2", rest: true },   // bx-wbco2.js
  { id: "dl-sats", shelf: "lyrGrpOrbit", order: 10, key: "sats", label: "lyrSats", share: true, lazy: ["satellitesLive"], registry: ["satellites"], atlas: ["layers.satellites"], time: { kind: "elements", bands: [[11, 5], [1.5, 60], [-Infinity, 14]] } },   // dl-sats.js
  { id: "l9-dl-aurora", shelf: "lyrGrpOrbit", order: 20, key: "aurora", share: true },   // l9-dl-aurora.js
  { id: "fac-dl-osmspace", shelf: "lyrGrpOrbit", order: 30, key: "osmspace", rest: true },   // fac-dl-osmspace.js
  { id: "dl-sst", shelf: "lyrGrpMaritime", order: 10, key: "sst", label: "lyrSST", share: true, registry: ["sst"] },   // dl-sst.js
  { id: "dl-waves", shelf: "lyrGrpMaritime", order: 20, key: "waves", share: true, lazy: ["waves"] },   // dl-waves.js
  { id: "wp-dl-currents", shelf: "lyrGrpMaritime", order: 30, key: "currents", share: true },   // wp-dl-currents.js
  { id: "gx-gxsstanom", shelf: "lyrGrpMaritime", order: 40, key: "gxsstanom", rest: true, share: true },   // gx-gxsstanom.js
  { id: "wp-dl-tides", shelf: "lyrGrpMaritime", order: 50, key: "tides", rest: true, share: true, lazy: ["worldPacksBody"] },   // wp-dl-tides.js
  { id: "gx-gxseaice", shelf: "lyrGrpMaritime", order: 60, key: "gxseaice", rest: true, share: true },   // gx-gxseaice.js
  { id: "eco-dl-plates", shelf: "lyrGrpTerrain", order: 10, key: "plates", share: true },   // eco-dl-plates.js
  { id: "dl-relief", shelf: "lyrGrpTerrain", order: 20, key: "relief", label: "lyrRelief", share: true },   // dl-relief.js
  { id: "dl-sealevel", shelf: "lyrGrpTerrain", order: 30, key: "sealevel", label: "lyrSeaLevel", share: true },   // dl-sealevel.js
  { id: "dl-hillshade", shelf: "lyrGrpTerrain", order: 40, key: "hillshade", label: "lyrHillshade", rest: true, share: true },   // dl-hillshade.js
  { id: "gx-gxrelief", shelf: "lyrGrpTerrain", order: 50, key: "gxrelief", rest: true, share: true },   // gx-gxrelief.js
  { id: "eco-dl-worldcover", shelf: "lyrGrpNature", order: 10, key: "worldcover", share: true },   // eco-dl-worldcover.js
  { id: "eco-dl-ecoregions", shelf: "lyrGrpNature", order: 20, key: "ecoregions", share: true },   // eco-dl-ecoregions.js
  { id: "gx-gxndvi", shelf: "lyrGrpNature", order: 30, key: "gxndvi", share: true },   // gx-gxndvi.js
  { id: "bx-wbforest", shelf: "lyrGrpNature", order: 40, key: "wbforest", rest: true },   // bx-wbforest.js
  { id: "dl-popgrid", shelf: "lyrGrpDemo", order: 10, key: "popgrid", label: "lyrPopGrid", share: true },   // dl-popgrid.js
  { id: "dl-nightsat", shelf: "lyrGrpDemo", order: 20, key: "nightsat", label: "lyrNightSat", share: true },   // dl-nightsat.js
  { id: "dl-tfr", shelf: "lyrGrpDemo", order: 30, key: "tfr", label: "lyrTFR", share: true },   // dl-tfr.js
  { id: "dl-pop", shelf: "lyrGrpDemo", order: 40, key: "pop", label: "lyrPop", rest: true, share: true },   // dl-pop.js
  { id: "bx-wbpopgrow", shelf: "lyrGrpDemo", order: 50, key: "wbpopgrow", rest: true },   // bx-wbpopgrow.js
  { id: "bx-wbaging", shelf: "lyrGrpDemo", order: 60, key: "wbaging", rest: true },   // bx-wbaging.js
  { id: "bx-wbfert", shelf: "lyrGrpDemo", order: 70, key: "wbfert", rest: true },   // bx-wbfert.js
  { id: "bx-wbadofert", shelf: "lyrGrpDemo", order: 80, key: "wbadofert", rest: true },   // bx-wbadofert.js
  { id: "bx-wburb", shelf: "lyrGrpDemo", order: 90, key: "wburb", rest: true },   // bx-wburb.js
  { id: "bx-wbrural", shelf: "lyrGrpDemo", order: 100, key: "wbrural", rest: true },   // bx-wbrural.js
  { id: "bx-wbdensity", shelf: "lyrGrpDemo", order: 110, key: "wbdensity", rest: true },   // bx-wbdensity.js
  { id: "bx-wbref", shelf: "lyrGrpDemo", order: 120, key: "wbref", rest: true },   // bx-wbref.js
  { id: "wp-dl-alerts", shelf: "lyrGrpHazard", order: 10, key: "alerts", share: true, lazy: ["worldPacksBody"] },   // wp-dl-alerts.js
  { id: "bx-eq", shelf: "lyrGrpHazard", order: 20, key: "eq", registry: ["earthquakes"] },   // bx-eq.js
  { id: "beta-dl-volc2", shelf: "lyrGrpHazard", order: 30, key: "volc2", share: true, registry: ["volcanoes"], commands: ["volcano.open", "volcano.mode", "volcano.filter", "volcano.time"], atlas: ["map.volcanoFilter"], sources: ["Smithsonian GVP"] },   // beta-dl-volc2.js
  { id: "dl-thermal", shelf: "lyrGrpHazard", order: 40, key: "thermal", label: "lyrThermal", rest: true, share: true, registry: ["thermal"], sources: ["NASA FIRMS"], pkg: "thermal" },   // dl-thermal.js
  { id: "fac-dl-osmemg", shelf: "lyrGrpHazard", order: 50, key: "osmemg", rest: true },   // fac-dl-osmemg.js
  { id: "beta-dl-radobs", shelf: "lyrGrpHazard", order: 60, key: "radobs", rest: true, share: true, lazy: ["radiationLayer"], registry: ["radiation"], commands: ["radiation.observed", "radiation.near"], atlas: ["map.radiation"] },   // beta-dl-radobs.js
  { id: "dl-dem", shelf: "lyrGrpPolitics", order: 10, key: "dem", label: "lyrDem", share: true },   // dl-dem.js
  { id: "beta-dl-cpi", shelf: "lyrGrpPolitics", order: 20, key: "cpi", share: true },   // beta-dl-cpi.js
  { id: "dl-eez", shelf: "lyrGrpPolitics", order: 30, key: "eez", label: "lyrEEZ", share: true },   // dl-eez.js
  { id: "dl-uselect", shelf: "lyrGrpPolitics", order: 40, key: "uselect", share: true },   // dl-uselect.js
  { id: "dl-eu", shelf: "lyrGrpPolitics", order: 50, key: "eu", label: "lyrEU", share: true, pkg: "alliances" },   // dl-eu.js
  { id: "dl-ww2", shelf: "lyrGrpPolitics", order: 60, key: "ww2", share: true, lazy: ["warLayer"] },   // dl-ww2.js
  { id: "dl-elect", shelf: "lyrGrpPolitics", order: 70, key: "elect", rest: true, share: true },   // dl-elect.js
  { id: "dl-newspulse", shelf: "lyrGrpPolitics", order: 75, key: "newspulse", share: true, lazy: ["newsIntel"], commands: ["newspulse.toggle", "newspulse.rank", "newspulse.brief"] },   // dl-newspulse.js
  { id: "dl-ww1", shelf: "lyrGrpPolitics", order: 80, key: "ww1", rest: true, share: true, lazy: ["warLayer"] },   // dl-ww1.js
  { id: "dl-korea", shelf: "lyrGrpPolitics", order: 90, key: "korea", rest: true, share: true, lazy: ["warLayer"] },   // dl-korea.js
  { id: "dl-vietnam", shelf: "lyrGrpPolitics", order: 100, key: "vietnam", rest: true, share: true, lazy: ["warLayer"] },   // dl-vietnam.js
  { id: "dl-mideast", shelf: "lyrGrpPolitics", order: 110, key: "mideast", rest: true, share: true, lazy: ["warLayer"] },   // dl-mideast.js
  { id: "dl-yugoslavia", shelf: "lyrGrpPolitics", order: 120, key: "yugoslavia", rest: true, share: true, lazy: ["warLayer"] },   // dl-yugoslavia.js
  { id: "dl-tz", shelf: "lyrGrpPolitics", order: 130, key: "tz", rest: true, share: true },   // dl-tz.js
  { id: "bx-wbwomparl", shelf: "lyrGrpPolitics", order: 140, key: "wbwomparl", rest: true },   // bx-wbwomparl.js
  { id: "fac-dl-osmdiplo", shelf: "lyrGrpPolitics", order: 150, key: "osmdiplo", rest: true },   // fac-dl-osmdiplo.js
  { id: "dl-milSpend", shelf: "lyrGrpSecurity", order: 10, key: "milSpend", label: "lyrMilSpend", share: true, pkg: "alliances" },   // dl-milSpend.js
  { id: "dl-nato", shelf: "lyrGrpSecurity", order: 20, key: "nato", label: "lyrNATO", share: true, pkg: "alliances" },   // dl-nato.js
  { id: "beta-dl-ukrfront", shelf: "lyrGrpSecurity", order: 30, key: "ukrfront", share: true },   // beta-dl-ukrfront.js
  { id: "bx-wbmilgdp", shelf: "lyrGrpSecurity", order: 40, key: "wbmilgdp", rest: true },   // bx-wbmilgdp.js
  { id: "bx-wbmilppl", shelf: "lyrGrpSecurity", order: 50, key: "wbmilppl", rest: true },   // bx-wbmilppl.js
  { id: "fac-dl-osmmil", shelf: "lyrGrpSecurity", order: 60, key: "osmmil", rest: true },   // fac-dl-osmmil.js
  { id: "beta-dl-lifeexp", shelf: "lyrGrpHealth", order: 10, key: "lifeexp", share: true },   // beta-dl-lifeexp.js
  { id: "bx-wbinfmort", shelf: "lyrGrpHealth", order: 20, key: "wbinfmort" },   // bx-wbinfmort.js
  { id: "bx-wbsuicide", shelf: "lyrGrpHealth", order: 30, key: "wbsuicide" },   // bx-wbsuicide.js
  { id: "bx-wbsmoke", shelf: "lyrGrpHealth", order: 40, key: "wbsmoke" },   // bx-wbsmoke.js
  { id: "bx-wbalcohol", shelf: "lyrGrpHealth", order: 50, key: "wbalcohol" },   // bx-wbalcohol.js
  { id: "bx-wbwater", shelf: "lyrGrpHealth", order: 60, key: "wbwater" },   // bx-wbwater.js
  { id: "bx-wbhealth", shelf: "lyrGrpHealth", order: 70, key: "wbhealth", rest: true },   // bx-wbhealth.js
  { id: "bx-wbphys", shelf: "lyrGrpHealth", order: 80, key: "wbphys", rest: true },   // bx-wbphys.js
  { id: "bx-wbbeds", shelf: "lyrGrpHealth", order: 90, key: "wbbeds", rest: true },   // bx-wbbeds.js
  { id: "bx-wbu5mort", shelf: "lyrGrpHealth", order: 100, key: "wbu5mort", rest: true },   // bx-wbu5mort.js
  { id: "bx-wblife", shelf: "lyrGrpHealth", order: 110, key: "wblife", rest: true },   // bx-wblife.js
  { id: "bx-wbsan", shelf: "lyrGrpHealth", order: 120, key: "wbsan", rest: true },   // bx-wbsan.js
  { id: "bx-wboverwt", shelf: "lyrGrpHealth", order: 130, key: "wboverwt", rest: true },   // bx-wboverwt.js
  { id: "fac-dl-osmhealth", shelf: "lyrGrpHealth", order: 140, key: "osmhealth", rest: true },   // fac-dl-osmhealth.js
  { id: "fac-dl-osmwater", shelf: "lyrGrpHealth", order: 150, key: "osmwater", rest: true },   // fac-dl-osmwater.js
  { id: "dl-subcables", shelf: "lyrGrpTech", order: 10, key: "subcables", label: "lyrSubcables", share: true, pkg: "subcables" },   // dl-subcables.js
  { id: "beta-dl-dc", shelf: "lyrGrpTech", order: 20, key: "dc", rest: true, share: true, lazy: ["dataCenters"], registry: ["datacenters"] },   // beta-dl-dc.js
  { id: "dl-nethlth", shelf: "lyrGrpTech", order: 30, key: "nethlth", rest: true, share: true, lazy: ["netHealthLive"], commands: ["nethlth.report", "nethlth.signals"] },   // dl-nethlth.js
  { id: "dl-netreach", shelf: "lyrGrpTech", order: 40, key: "netreach", rest: true, share: true, lazy: ["netHealthLive"] },   // dl-netreach.js
  { id: "bx-wbnet", shelf: "lyrGrpTech", order: 50, key: "wbnet", rest: true },   // bx-wbnet.js
  { id: "bx-wbmobile", shelf: "lyrGrpTech", order: 60, key: "wbmobile", rest: true },   // bx-wbmobile.js
  { id: "bx-wbbbnd", shelf: "lyrGrpTech", order: 70, key: "wbbbnd", rest: true },   // bx-wbbbnd.js
  { id: "bx-wbrnd", shelf: "lyrGrpTech", order: 80, key: "wbrnd", rest: true },   // bx-wbrnd.js
  { id: "bx-wbresearch", shelf: "lyrGrpTech", order: 90, key: "wbresearch", rest: true },   // bx-wbresearch.js
  { id: "bx-wbpatent", shelf: "lyrGrpTech", order: 100, key: "wbpatent", rest: true },   // bx-wbpatent.js
  { id: "fac-dl-osmtelecom", shelf: "lyrGrpTech", order: 110, key: "osmtelecom", rest: true },   // fac-dl-osmtelecom.js
  { id: "dl-gdppc", shelf: "lyrGrpEconomy", order: 10, key: "gdppc", label: "lyrGDPpc", share: true },   // dl-gdppc.js
  { id: "wp-dl-trade", shelf: "lyrGrpEconomy", order: 20, key: "trade", share: true, lazy: ["worldPacksBody"] },   // wp-dl-trade.js
  { id: "bx-wbgini", shelf: "lyrGrpEconomy", order: 30, key: "wbgini" },   // bx-wbgini.js
  { id: "wp-dl-industry", shelf: "lyrGrpEconomy", order: 40, key: "industry", rest: true, share: true },   // wp-dl-industry.js
  { id: "bx-wbgdpgrow", shelf: "lyrGrpEconomy", order: 50, key: "wbgdpgrow", rest: true },   // bx-wbgdpgrow.js
  { id: "bx-wbinfl", shelf: "lyrGrpEconomy", order: 60, key: "wbinfl", rest: true },   // bx-wbinfl.js
  { id: "bx-wbtrade", shelf: "lyrGrpEconomy", order: 70, key: "wbtrade", rest: true },   // bx-wbtrade.js
  { id: "bx-wbtax", shelf: "lyrGrpEconomy", order: 80, key: "wbtax", rest: true },   // bx-wbtax.js
  { id: "bx-wbdebt", shelf: "lyrGrpEconomy", order: 90, key: "wbdebt", rest: true },   // bx-wbdebt.js
  { id: "bx-wbmanuf", shelf: "lyrGrpEconomy", order: 100, key: "wbmanuf", rest: true },   // bx-wbmanuf.js
  { id: "bx-wbhitech", shelf: "lyrGrpEconomy", order: 110, key: "wbhitech", rest: true },   // bx-wbhitech.js
  { id: "bx-wbfdi", shelf: "lyrGrpEconomy", order: 120, key: "wbfdi", rest: true },   // bx-wbfdi.js
  { id: "bx-wbunemp", shelf: "lyrGrpEconomy", order: 130, key: "wbunemp", rest: true },   // bx-wbunemp.js
  { id: "bx-wbgni", shelf: "lyrGrpEconomy", order: 140, key: "wbgni", rest: true },   // bx-wbgni.js
  { id: "bx-wbpov", shelf: "lyrGrpEconomy", order: 150, key: "wbpov", rest: true },   // bx-wbpov.js
  { id: "bx-wbflfp", shelf: "lyrGrpEconomy", order: 160, key: "wbflfp", rest: true },   // bx-wbflfp.js
  { id: "bx-wbremit", shelf: "lyrGrpEconomy", order: 170, key: "wbremit", rest: true },   // bx-wbremit.js
  { id: "bx-wbtour", shelf: "lyrGrpEconomy", order: 180, key: "wbtour", rest: true },   // bx-wbtour.js
  { id: "beta-dl-pharma", shelf: "lyrGrpEconomy", order: 190, key: "pharma", rest: true, share: true, registry: ["pharma"] },   // beta-dl-pharma.js
  { id: "dl-hdi", shelf: "lyrGrpSociety", order: 10, key: "hdi", label: "lyrHDI", share: true },   // dl-hdi.js
  { id: "bx-wbhomicide", shelf: "lyrGrpSociety", order: 20, key: "wbhomicide" },   // bx-wbhomicide.js
  { id: "beta-dl-cat-language", shelf: "lyrGrpSociety", order: 30, key: "cat-language", share: true },   // beta-dl-cat-language.js
  { id: "beta-dl-whs", shelf: "lyrGrpSociety", order: 40, key: "whs", rest: true, share: true, registry: ["heritage"], commands: ["heritage.open", "heritage.filter"], atlas: ["map.heritageFilter"], sources: ["UNESCO World Heritage Centre"] },   // beta-dl-whs.js
  { id: "bx-wblit", shelf: "lyrGrpSociety", order: 50, key: "wblit", rest: true },   // bx-wblit.js
  { id: "bx-wbschool", shelf: "lyrGrpSociety", order: 60, key: "wbschool", rest: true },   // bx-wbschool.js
  { id: "bx-wbtert", shelf: "lyrGrpSociety", order: 70, key: "wbtert", rest: true },   // bx-wbtert.js
  { id: "bx-wbedu", shelf: "lyrGrpSociety", order: 80, key: "wbedu", rest: true },   // bx-wbedu.js
  { id: "fac-dl-osmedu", shelf: "lyrGrpSociety", order: 90, key: "osmedu", rest: true },   // fac-dl-osmedu.js
  { id: "beta-dl-cat-religion", shelf: "lyrGrpSociety", order: 100, key: "cat-religion", rest: true, share: true },   // beta-dl-cat-religion.js
  { id: "dl-planes", shelf: "lyrGrpTransport", order: 10, key: "planes", label: "lyrPlanes", share: true, lazy: ["aviationLive"], registry: ["aircraft"], atlas: ["layers.planeAltitude", "layers.aircraftTrack"] },   // dl-planes.js
  { id: "beta-dl-rail", shelf: "lyrGrpTransport", order: 20, key: "rail", share: true, lazy: ["railways"], atlas: ["layers.railAxis"] },   // beta-dl-rail.js
  { id: "dl-ships", shelf: "lyrGrpTransport", order: 30, key: "ships", label: "lyrShips", rest: true, share: true, registry: ["ships"] },   // dl-ships.js
  { id: "ox-oxrail", shelf: "lyrGrpTransport", order: 40, key: "oxrail", rest: true },   // ox-oxrail.js
  { id: "ox-oxsea", shelf: "lyrGrpTransport", order: 50, key: "oxsea", rest: true },   // ox-oxsea.js
  { id: "fac-dl-osmair", shelf: "lyrGrpTransport", order: 60, key: "osmair", rest: true },   // fac-dl-osmair.js
  { id: "fac-dl-osmport", shelf: "lyrGrpTransport", order: 70, key: "osmport", rest: true },   // fac-dl-osmport.js
  { id: "dl-webcams", shelf: "lyrGrpTransport", order: 80, key: "webcams", rest: true, share: true, registry: ["webcams"] },   // dl-webcams.js
  { id: "wp-dl-crops", shelf: "lyrGrpAgri", order: 10, key: "crops", share: true, lazy: ["worldPacksBody"] },   // wp-dl-crops.js
  { id: "bx-wbagremp", shelf: "lyrGrpAgri", order: 20, key: "wbagremp" },   // bx-wbagremp.js
  { id: "bx-wbunder", shelf: "lyrGrpAgri", order: 30, key: "wbunder" },   // bx-wbunder.js
  { id: "bx-wbagri", shelf: "lyrGrpAgri", order: 40, key: "wbagri", rest: true },   // bx-wbagri.js
  { id: "gx-gxsoil", shelf: "lyrGrpAgri", order: 50, key: "gxsoil", rest: true, share: true },   // gx-gxsoil.js
  { id: "wp-dl-energy", shelf: "lyrGrpEnergy", order: 10, key: "energy", share: true, lazy: ["worldPacksBody"] },   // wp-dl-energy.js
  { id: "bx-wbrenew", shelf: "lyrGrpEnergy", order: 20, key: "wbrenew" },   // bx-wbrenew.js
  { id: "bx-wbelec", shelf: "lyrGrpEnergy", order: 30, key: "wbelec" },   // bx-wbelec.js
  { id: "fac-dl-osmpower", shelf: "lyrGrpEnergy", order: 40, key: "osmpower", rest: true },   // fac-dl-osmpower.js
  { id: "fac-dl-osmextract", shelf: "lyrGrpEnergy", order: 50, key: "osmextract", rest: true },   // fac-dl-osmextract.js
  { id: "l9-dl-dams", shelf: "lyrGrpEnergy", order: 60, key: "dams", rest: true, share: true },   // l9-dl-dams.js
  { id: "bx-wbcook", shelf: "lyrGrpEnergy", order: 70, key: "wbcook", rest: true },   // bx-wbcook.js
  { id: "bx-wbelecuse", shelf: "lyrGrpEnergy", order: 80, key: "wbelecuse", rest: true },   // bx-wbelecuse.js
  { id: "bx-wbrenelec", shelf: "lyrGrpEnergy", order: 90, key: "wbrenelec", rest: true },   // bx-wbrenelec.js
  { id: "bx-wbenergy", shelf: "lyrGrpEnergy", order: 100, key: "wbenergy", rest: true },   // bx-wbenergy.js
  { id: "dl-precip", shelf: "lyrGrpOthers", order: 10, key: "precip", label: "lyrPrecip", share: true, registry: ["precip"], sources: ["Open-Meteo"] },   // dl-precip.js
  { id: "dl-ec-wind", shelf: "lyrGrpOthers", order: 20, key: "ec-wind", share: true },   // dl-ec-wind.js
  { id: "beta-dl-volcash", shelf: "lyrGrpOthers", order: 30, share: true, lazy: ["volcanoLayers"] },   // beta-dl-volcash.js
  { id: "beta-dl-volchaz", shelf: "lyrGrpOthers", order: 40, share: true, lazy: ["volcanoLayers"] },   // beta-dl-volchaz.js
  { id: "beta-dl-volcso2", shelf: "lyrGrpOthers", order: 50, share: true, lazy: ["volcanoLayers"] },   // beta-dl-volcso2.js
  { id: "beta-dl-unemp", shelf: "lyrGrpOthers", order: 60, share: true },   // beta-dl-unemp.js
  { id: "beta-dl-internet", shelf: "lyrGrpOthers", order: 70, share: true },   // beta-dl-internet.js
  { id: "beta-dl-precip", shelf: "lyrGrpOthers", order: 80, share: true },   // beta-dl-precip.js
  { id: "beta-dl-spin", shelf: "lyrGrpOthers", order: 90, share: true },   // beta-dl-spin.js
  { id: "wp-dl-outbreaks", shelf: "lyrGrpOthers", order: 100, share: true, registry: ["outbreaks"], state: "outbreaks", commands: ["outbreaks.open", "outbreaks.close"], atlas: ["map.outbreaks"], sources: ["WHO Disease Outbreak News"] },   // wp-dl-outbreaks.js
  { id: "bx-heat", shelf: "lyrGrpOthers", order: 110 },   // bx-heat.js
  { id: "cb-countries", shelf: "hidden", order: 10, label: "countries", html: true },   // cb-countries.js
  { id: "dl-contours", shelf: "hidden", order: 20, label: "lyrContours", share: true },   // dl-contours.js
];
/** (layer-packages) every layer package a declaration names → its factory, fetched on first use (js/data-layers.js) */
const PACKAGES = {
  "alliances": () => import('./layer-pkg-alliances.js').then((m) => m.alliancesPackage),
  "radar": () => import('./layer-pkg-radar.js').then((m) => m.radarPackage),
  "subcables": () => import('./layer-pkg-subcables.js').then((m) => m.subcablesPackage),
  "thermal": () => import('./layer-pkg-thermal.js').then((m) => m.thermalPackage),
};
/* ⚠ GENERATED LAYERS — END */

/** every shelf in panel order, each with its rows — derived from js/layers/ */
export const SHELVES = DERIVED;

const DECL_BY = new Map();
for (const d of DECLARATIONS) for (const k of [d.id].concat(d.registry || [])) if (!DECL_BY.has(k)) DECL_BY.set(k, d);
/** the declaration of a layer, asked by its checkbox id or by any IntMapLayers id it registers */
export const layerDeclaration = (id) => DECL_BY.get(id) || null;
/** (layer-packages) the layer package that implements a row's switch (its declaration's `pkg`), by checkbox id —
    null while js/data-layers.js still implements it itself */
export const packageOf = (id) => { const d = DECL_BY.get(id); return (d && d.pkg) || null; };
/** (layer-packages) fetch a layer package's factory (js/layer-pkg-<name>.js). One request per call — js/data-layers.js
    keeps the one instance; a name no declaration gives has no module, and that is a rejection, not an empty package */
export const loadPackage = (name) => (Object.prototype.hasOwnProperty.call(PACKAGES, name) ? PACKAGES[name]() : Promise.reject(new Error('no layer package `' + name + '` is declared (js/layers/<id>.js `pkg`)')));

/** the heading of the shelf an unlisted row is swept onto (and of the listed beta rows) */
export const BETA = 'lyrGrpOthers';
/** pseudo-shelves: the map display at the top (its rows are `kind: 'display'`), and rows that keep a checkbox but no row (#R469) */
export const BASE = 'base';
export const HIDDEN = 'hidden';

/** every layer, flat, in panel order, each with its `shelf` */
export const LAYERS = Object.freeze(SHELVES.flatMap((s) => s.layers.map((l) => Object.freeze(Object.assign({ shelf: s.key }, l)))));
const BY_ID = new Map(LAYERS.map((l) => [l.id, l]));
const BY_KEY = new Map(LAYERS.filter((l) => l.key).map((l) => [l.key, l]));

/** the entry for a short name (`climate`) or, failing that, a checkbox id — reorganizeLayerPanel's `rowFor` */
export const layerFor = (k) => BY_KEY.get(k) || BY_ID.get(k) || null;
/** is this id a row this file declares — a layer OR a map display item (`isDisplay` tells them apart) */
export const isLayer = (id) => BY_ID.has(id);
/** (basic-display-not-layers) is this id an item of the map display (基本表示) — not a layer */
export const isDisplay = (id) => { const l = BY_ID.get(id); return !!l && l.kind === 'display'; };
/** (basic-display-not-layers) the LAYERS, in panel order — the registry without the map display. What every
    count of layers counts and every list of layers lists (the landing page, Atlas, the usage count) */
export const dataLayers = () => LAYERS.filter((l) => l.kind !== 'display');
/** (basic-display-not-layers) the map display, in panel order — the items the 基本表示 section switches */
export const displayItems = () => LAYERS.filter((l) => l.kind === 'display');

/** the curated shelves in panel order, in the shape reorganizeLayerPanel has always read:
    `[heading key, short names, how many the reader named]` (empty shelves included — their keys are kept) */
export function layerGroups() {
  return SHELVES.filter((s) => s.key !== BASE && s.key !== HIDDEN && s.key !== BETA)
    .map((s) => [s.key, s.layers.map((l) => l.key || l.id), s.layers.filter((l) => !l.rest).length]);
}
/** the rows filed under Beta explicitly, in order (the sweep adds any row this file does not list) */
export const betaKeys = () => (SHELVES.find((s) => s.key === BETA) || { layers: [] }).layers.map((l) => l.key || l.id);

/* the four lists js/data-layers.js used to write out by hand — derived, so they cannot disagree */
/** the always-on switches that are plain markup rows, in panel order (was window.IntMapBasicLayerRows) */
export const basicRows = () => LAYERS.filter((l) => l.shelf === BASE && l.html).map((l) => l.id);
/** the whole always-on section (was window.IntMapBasicLayers) — the map display, which is what every counter
    of layers subtracts (the `base` shelf holds exactly these: scripts/lib/layer-descriptor.mjs refuses anything else) */
export const basicLayers = () => displayItems().map((l) => l.id);
/** the rows that keep their checkbox and lose their row (was window.IntMapHiddenLayerRows) */
export const hiddenRows = () => LAYERS.filter((l) => l.shelf === HIDDEN).map((l) => l.id);
/** the thematic layers on for a first-time reader (was window.IntMapDefaultLayers) — none since 2026-10-02
    (basic-display-not-layers:「規定レイヤーは削除」); kept as the one place that would say so if a layer were */
export const defaultLayers = () => LAYERS.filter((l) => l.on && !l.html).map((l) => l.id);
/** every id ticked for a first-time reader, markup rows first (was window.IntMapDefaultOn) */
export const defaultOn = () => LAYERS.filter((l) => l.on && l.html).map((l) => l.id).concat(defaultLayers());
/** the LAYER ids the share link carries (`&l=`) — display items travel in their own field */
export const sharedIds = () => dataLayers().filter((l) => l.share).map((l) => l.id);
/** (basic-display-not-layers) the display items the share link carries (`&d=`, js/map-state.js `display`) */
export const sharedDisplayIds = () => displayItems().filter((l) => l.share).map((l) => l.id);

/** the rows this file generates (js/layer-rows.js), in the order they are inserted */
export const htmlRows = () => LAYERS.filter((l) => l.html);

/* (safe-output-single-module) the ONE output encoder — js/safe-html.js publishes globalThis.IntMapSafe
   (window.IntMapSafe in the browser) when imported, in Node as in the app, so this file keeps no copy. */
import './safe-html.js';
const esc = (s) => globalThis.IntMapSafe.html(s);
/** the markup of one generated row — byte-for-byte what index.html shipped before layer-manifest.
    `text(key)` is the English name (the i18n pass replaces it with the reader's language). */
export function rowHTML(l, text) {
  return '<label class="layer-option"><input type="checkbox" id="' + esc(l.id) + '"' + (l.on ? ' checked' : '')
    + '> <span data-i18n="' + esc(l.label) + '">' + esc(text ? (text(l.label) || '') : '') + '</span></label>';
}

/** what a reader that cannot see the document needs to know about every layer (Atlas's door):
    `[{ id, kind, key, shelf, label, rest, on, share, lazy }]` (`kind` 'layer' or 'display') — the name is `label` through i18n, or,
    for a row that composes its own name, whatever that row says once it is built. */
export function catalog() {
  return LAYERS.map((l) => ({ id: l.id, kind: l.kind || 'layer', key: l.key || null, shelf: l.shelf, label: l.label || null,
    rest: !!l.rest, on: !!l.on, share: !!l.share, lazy: l.lazy ? l.lazy.slice() : [] }));
}
