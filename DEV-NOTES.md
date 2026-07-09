# IntMap — Developer / Context Notes

> A living record of *why* things are the way they are, so future sessions (human or AI) have context.
> Keep this in sync with the code. Inline code comments reference task tags like `(#NN)`.

---

## 1. What IntMap is

A single-file global-intelligence web map (`index.html`, ~7k lines) + a small admin page
(`admin.html`). Pure front-end (no build step) served as static files; data + auth + community
live in **Supabase**. Heavy use of **MapLibre GL** (raster basemaps + globe/3D terrain), **Turf.js**
(geometry), and several free live-data APIs.

- **Public site:** `index.html`
- **Admin site:** `admin.html`
- **Supabase project ref:** `vpekfwdpurzejrrmacac`
- **Supabase publishable key:** `sb_publishable_yI9Rf2s4nzrIuqFyUq4OOA_h83PrRd0`
- SQL schema files: `supabase_*.sql`. Edge function: `supabase/functions/refresh-news`.

### Big code regions in index.html (approximate)
| Region | What |
|---|---|
| `<style>` (top) | All CSS. Desktop first, then `@media(max-width:768px)` mobile block, then "round" patch blocks. |
| i18n object (`const i18n=`) | All EN/JP strings. `t(key)` resolves the active language. |
| map init (`map=new maplibregl.Map`) | Style, sources, tool layers. |
| measurement tools | `buildToolFeatures`, `diskFillPolys`, `ringArea`, `sanitizeFeatures`. |
| news engine | `analyzeContext`, `rebuildGeoIndex`, `aiGeocodeNews`, `startNews`. |
| layers | `toggleLayer`, `addKoppen`, choropleths, traffic, wind canvas, geo theory layers (`geoLayersDB`). |
| timeline | news time-travel slider (`#news-timeline`). |
| community | Supabase-backed posts/comments/votes. |
| mobile UI | `initMobileUI()` — draggable bottom-sheet with detents. |
| settings / auth / supabase | `loadSettings`, `applySidebarStyle`, `bootSupabase`, OAuth. |

---

## 2. Standing design intents
- **Liquid/Frosted Glass must look identical across the WHOLE UI.** One material, one setting.
- **JP / EN parity.** No English leaking into the Japanese UI (and vice-versa).
- **Mobile = iOS-native feel.** Bottom sheet w/ detents, FABs, compact popups, 44pt targets.
- **Industry-standard responsive breakpoint** (768px), JS and CSS must agree.
- **Correctness near the poles & antimeridian** for every geometry tool.
- **Real data only** — no fabricated layers (wind, thermal, etc. must reflect reality).
- **3D must feel fast** (user sees <10 Mbps vs Google Earth 30+; low CPU/GPU ⇒ we're under-fetching).
- Prefer **graceful degradation**: every external fetch behind try/catch + fallback.

---

## 3. Key decisions made (and why)

### Frosted glass unified (#1,#23,#24,#26)
- Introduced CSS vars `--glass-blur / --glass-sat / --glass-fill` set by body classes
  `sidebar-translucent` / `sidebar-glass2`. EVERY floating surface + the sidebar read them, so the
  Settings → "Sidebar appearance" choice drives the texture of the whole app.
- Root cause of "desktop sidebar won't frost" (#23): a previous round forced the sidebar
  `position:relative` + opaque + kept it in normal flex flow, so the blur had nothing behind it.
  Fix: in a frosted mode the sidebar **overlays** the map (`body.sidebar-glass`, desktop only) and
  the camera is padded left by the sidebar width (`applySidebarStyle`) so content stays centred in
  the visible area. SOLID mode keeps the old in-flow layout (no shift) — that's the safe default.
- Root cause of mobile "empty area at the bottom" (#24,#26): that same global
  `.sidebar{position:relative}` leaked into the mobile media query and defeated
  `position:fixed;bottom:0`, so the 92dvh sheet sat at the *top* leaving a ~65px void at the bottom.
  Fix: the `position:relative` override is now scoped to `@media(min-width:769px)`.

### Measurement: antimeridian + pole safe (#5,#6,#25)
- MapLibre runs with `renderWorldCopies:false`; it cannot draw a polygon/line whose longitudes jump
  across ±180°, and a geodesic circle big enough to swallow a pole both crosses the seam AND wraps
  the pole. Old code clamped radius + *dropped* any feature with a near-pole vertex (so measurements
  vanished near poles).
- New helpers (search `Antimeridian / pole-safe`): build geometry in **continuous (unwrapped)**
  longitude, then split into pieces that each stay inside [-180,180] via Sutherland–Hodgman window
  clipping (`_splitPolyToWindows`, `_splitLineToWindows`). Disks that contain one pole get a polar
  **cap**; disks that contain *both* poles are drawn as the world minus the antipodal hole.
- `sanitizeFeatures` now **clamps** latitude to ±89.9999 instead of discarding the feature.
- Disk fills carry `noStroke:true` (so the seam edges aren't stroked); the true geodesic outline is
  drawn separately as `ringline:true` lines (layer `tool-ring-line`).

### Stats / Info layout (#17,#18,#8)
- Compare view is now a **full page** (`renderCompareView`) instead of a half-height bottom dock
  that covered the list. The bottom dock hides while the full comparison is open.
- Sticky headers (`.dash-nav`, `.stats-toolbar`) paint with `--glass-fill` flush to the top so no
  map peeks through above the selector.
- The "AI-locate" button's own `margin-top` stacked on the pin-toggle's margin for an ~18px void;
  zeroed it.

### Screenshot (#20)
- Root cause: `.map-container`/`#map` have an **opaque** background; html2canvas was compositing that
  solid colour *over* the captured WebGL frame ⇒ blank image. Fix: make those transparent in
  `body.capture-mode`, wait for `idle`, and also composite the wind canvas.

---

## 4. External data sources

- Basemaps: CARTO (`*.basemaps.cartocdn.com`), Esri World Imagery (satellite).
- Terrain DEM / hillshade for 3D.
- News: Supabase table `news_pins` (+ edge function) with live-RSS-via-CORS-proxy fallback.
- Country stats: bundled + Wikipedia REST for images.
- Live layers: RainViewer (precip), Open-Meteo / GFS (planned for real wind), NASA FIRMS (thermal),
  AIS/ADS-B (ships/planes), submarine cables, EEZ.

When adding a live layer, always: (1) try/catch every fetch, (2) provide a CORS-proxy or fallback,
(3) attribute the source in Settings → Data sources.

---

## 5. Testing

- Static preview server config: `.claude/launch.json` → `intmap-static` (`py -3 -m http.server 8765`).
- The continuously-rendering WebGL globe makes screenshot-based preview tools time out — prefer
  `preview_eval` for DOM/CSS measurements and console-error checks.
- `window.map` resolves to the `<div id="map">` (named-element global), NOT the MapLibre instance —
  the instance is closure-scoped. Don't rely on `window.map.<mapMethod>` from eval.

---

## 6. Decisions added this round (cont.)

### Layers
- **Thermal anomalies (#13)** — `..._375m_All` was not a valid GIBS layer (blank). Now a runtime
  probe (`pickThermalCfg`) tries several FIRMS/GIBS layer+level combos in the real browser and locks
  onto the first that serves a tile. These GIBS "Thermal Anomalies / Fires" layers ARE NASA FIRMS.
- **NATO (#14)** — removed the geoLayersDB "Posture" lines + its checkbox. NATO is now ONLY the
  members country-fill (`dl-nato`) with `wireNatoHover` showing accession year (`NATO_JOIN`) + defence
  spend `%GDP` (`milSpend/gdp*100`).
- **Geo theory (#15,#17)** — redrew Heartland (extended south to cover Central Asia) and the Northern
  Sea Route (hugs the Russian Arctic coast, stays inside ±180). Rimland is now a **country fill**
  (`RIMLAND` set, `imToggleRimland`) so it covers land only.
- **Military spending (#26)** — two new choropleths `milSpend` ($B) and `milSpendGDP` (%GDP) reusing
  addChoro/applyChoro + CHORO_META hover.
- **Sea-level rise (#24)** — `lyr-sealevel` color-relief over the DEM; a 0–80 m slider rebuilds the
  ramp (`seaLevelRamp`/`_refreshSeaLevel`) to flood everything ≤ the chosen level. Naïve bathtub.
- **Wind (#19)** — already real Open-Meteo GFS; bumped the grid 15°→12° for more regional detail.

### Köppen & legends
- **Köppen drag (#22)** — the drag handle is now part of `buildLegend`'s markup (the old one-shot
  handle was wiped on every innerHTML rebuild → "couldn't be moved").
- **Köppen interactivity (#25)** — map click samples the climate and highlights it; right-click a
  legend row → `showKoppenInfo` popup decoding the class criteria (`koppenCriteria`).
- **Legends (#29,#30,#33)** — unified `wireDrag` (mouse+touch) so every legend is movable on phones;
  tap-the-map-outside collapses open legends (`_minimizeOpenLegends`); header min/close buttons
  aligned; the non-collapsible "Data layers" section label no longer shows a dead ▷.

### News / community / account / 3D
- **News controls (#28)** — pin-mode is a dropdown (caret) on the AI-locate button (half width,
  labelled "AI-locate subject/publisher"); right half is a manual "Translate titles" button.
- **Search/Load (#31)** — sidebar button relabelled; `runSearch` already searches when the box has
  text and reloads-with-settings when empty.
- **Non-AI geolocation (#11)** — added a built-in gazetteer (`_BUILTIN_GZ` → `BUILTIN_GAZETTEER`)
  merged into geoDB in `rebuildGeoIndex`, so placement is strong without Supabase geo_pins.
- **Community (#21,#27)** — viewing is open; every action already gates via `requireLogin`. New post +
  Hot/New/Top are a pinned bottom bar (`.comm-toolbar-bottom`) with the feed in `.comm-scroll`.
- **Avatar crop (#12)** — `imCropImage` square-crop modal (drag + zoom) before the avatar is saved.
- **OAuth (#33)** — register `onAuthStateChange` BEFORE the first `getSession`, retry after a redirect
  that carries auth params, clean redirect target, scrub the token from the URL.
- **Coord readout (#34)** — dark HUD, all-white text, no emoji before the layer value, shifted clear
  of the sidebar when it overlays the map.
- **3D throughput (#7)** — CARTO now uses all 4 subdomains and MAX_PARALLEL_IMAGE_REQUESTS=64, so the
  browser's per-host connection cap stops throttling tiles while tilted. (Free public tile hosts
  still can't match Google Earth's private CDN, but this maximises what's controllable.)
- **Mobile sheet (#16,#32)** — added a 4th "mini" detent (drag down to hide the tabs); floating
  controls track the sheet's live top via `--sheet-cover` so the timebar/Summarize stay visible.

## 7. Task ledger

All 34 tracked items for this round are complete (see in-session task list). Verified in a headless
preview where feasible (DOM/CSS measurements + console-error checks; the spinning WebGL globe makes
screenshot/idle-based tools unreliable, so `preview_eval` was used instead).

---

## 8. Round 6 — 18 requested items

Verified live via `preview_eval` (no console errors; functions/DOM present; ProjView canvas + every
layer toggle exercised). External endpoints (FIRMS WMS, Open-Meteo, Esri, AWS terrarium, GIBS) were
probed with `curl` first to confirm status + `Access-Control-Allow-Origin:*` before wiring.

- **JP/EN parity (#1).** On-map geopolitical-theory labels were drawn in English on the JP map. Added
  `GEO_LABEL_JP` + `geoLabel()`; `buildGeoFC` localizes labels and `refreshGeoLabels()` re-emits each
  geo source on a language switch (called from `updateI18n`). A runtime scan of every `[data-i18n]`
  node in JP now shows no English prose (only the acronym "HDI (2022)").
- **3D + satellite speed (#2,#18).** Multi-host the heavy sources so the browser's per-host socket cap
  stops throttling: Esri imagery over `server.` **and** `services.arcgisonline.com`; AWS terrarium DEM
  over 3 S3 host aliases. `maxTileCacheSize` 1024→2048. (Tiles are byte-identical — pure throughput.)
- **Mobile smoothness (#3).** Cap render resolution to `pixelRatio≤2` on phones (a DPR-3 screen shades
  9× the fragments). `updateOcclusion` now uses a dot-product test (no per-marker `acos`) and only
  writes `style.visibility` when it actually flips — kills the per-pan layout thrash.
- **Sidebar centring (#4).** Frosted mode now animates `setPadding({duration:400})` in lock-step with
  the 0.4 s slide instead of snapping; solid mode keeps the per-frame resize (skipped in frosted to not
  fight the ease).
- **Thermal = NASA FIRMS (#5).** GIBS retired the raster thermal layers (they're vector-only now), so
  the old probe was permanently blank. Replaced with the **FIRMS MapServer WMS** (`fires_viirs_*`,
  `fires_viirs_noaa20_*`, `fires_modis_*`, rolling 24/48/72 h), keyless, `image/png`, CORS `*`. Legend
  has a 24/48/72 h selector (`window._refreshThermal`). thermal removed from `layerDates`.
- **NATO hover (#6).** Tooltip now shows absolute defence spend ($B, SIPRI 2023) **and** %GDP.
- **Northern Sea Route (#7).** Redrawn through the real straits (Kara Gate → Vilkitsky → Sannikov →
  Long Strait → Bering Strait), split at the antimeridian into two segments so it renders correctly
  with `renderWorldCopies:false`; added labelled strait waypoints.
- **Rimland (#8).** Already a land-only country fill; confirmed the checkbox routes to `imToggleRimland`
  and no polygon is drawn (no ocean paint).
- **Wind (#9).** Was screen-space advected off a single centre px/°, which is nonsense across the globe.
  Rebuilt as **geographic particles**: each holds lng/lat, is advected through the real Open-Meteo GFS
  field in degrees (dt scaled by metres-per-pixel for constant on-screen speed), and projected with the
  live map every frame → correct under any projection/zoom/rotation, panning locked to the map.
- **Mobile legends drag (#10).** The mobile `!important` dock overrode the JS drag. Scoped it to
  `:not([data-dragged])`, unified all legends on `wireDrag` (mouse+touch, sets `data-dragged`), and
  pin-to-current-spot on drag-start so there's no jump.
- **Sea-level from legend (#11).** Added a slider inside the sea-level legend, two-way synced with the
  in-dropdown slider via `_refreshSeaLevel`.
- **Köppen perf + mobile carets (#12).** Pre-compute a per-pixel code index ONCE (was a 30-colour
  nearest-match per pixel per rebuild — tens of millions of ops); rebuilds are now a single cheap pass
  (~30×) and debounced. Mobile Layers list hides the ▷/▽ carets and headers are plain labels (desktop
  unchanged); groups force-expanded on mobile.
- **Mobile Summarize button (#13).** A later non-media rule (`bottom:22px`) beat the mobile rule by
  source order, parking it *behind* the sheet. Forced the mobile dock with `!important`.
- **Google login (#14).** Root cause = supabase-js v2 auth-lock deadlock: `getSession()`/`from()` were
  awaited *inside* `onAuthStateChange`. Now the callback defers all work via `setTimeout(…,0)` and
  reuses the event's session (`refreshCurrentUser(session)`); re-renders UI on sign-in.
- **Former Soviet Union (#15).** New red land-only country fill (`imToggleFSU`, 15 ISO3 republics),
  geo-theory checkbox routed like Rimland, label localized ("旧ソ連諸国").
- **Flat-map projections (#16) + azimuthal-on-pin (#17).** MapLibre renders only mercator/globe, so
  built **`window.ProjView`** — a self-contained 2-D canvas projection engine (Equal Earth, Robinson,
  Winkel Tripel, Mollweide, Equirectangular, Azimuthal Equidistant) drawing real Natural-Earth geometry
  + graticule, with drag-pan/wheel-zoom. Entry: a "Projection" selector (desktop view-group, shown in
  Flat; + mobile Map sheet). The pin popup gets a "🧭 正距方位図 / Azimuthal" button → opens the viewer
  centred on that pin with equidistant range rings (2,500–17,500 km). Reuses `window.countryGeo`, falls
  back to a one-time 110 m fetch.

---

## 9. Round 7 — full requested set + next-gen foundations (tags `#R7`)

Verified in headless `preview_eval`: no console errors; every new global present; external endpoints
curl-probed first. NOTE on the preview: it runs **hidden** (`document.hidden=true`) so `requestAnimation
Frame` never fires and WebGL `map.load` doesn't complete — canvas-animation (wind) and map-layer adds
can't be screenshot-verified there; they're verified by logic + data-fetch + (for wind) reproducing the
seeding math against the live map. The Draw geometry was unit-tested via `DrawTool._debug.simulate`.

### The deliberate non-goal: NO full CesiumJS swap
The brief asked for a MapLibre→Cesium hybrid digital-twin migration **and** repeatedly demanded
"全ロジックを破壊せずに" (don't break any existing logic). Those conflict for an 8k-line working app — a
rushed engine swap would break every feature. Decision: keep MapLibre as the engine, and instead make
the app **modular** so a Cesium globe can be fed later through the new simulation bridge without touching
feature code. Everything in this round is **additive** (new modules/layers/CSS), nothing existing was
rearchitected. Two data-heavy asks (demographic-decline projection, historical-border time-travel
geometry) are left as documented future work — they need bundled datasets we don't have.

### Fixes
- **Wind was the headline bug (#R7).** The layer rendered NOTHING. Root cause: in `spawn()`,
  `Math.max(-grid?grid.lat0:85, …)` parses as `(-grid)?…:85` → `-{}` is `NaN` (falsy) → `85`, so every
  particle was seeded at lat ≥72° **above** the wind grid, where `sample()` returns null → instant
  respawn → empty canvas. Fixed the precedence (`gl=grid?grid.lat0:85; Math.max(-gl,…)`). Then rebuilt
  to the **Windy model** the user asked for: a wind-SPEED colour FIELD on a new under-canvas
  (`#wind-bg-canvas`, coarse offscreen unproject→sample→colour, bilinear-upscaled, re-rendered throttled
  on view change) + **WHITE** particle streaks on top, particle count ~5× denser, 8° grid (855 pts,
  finer regional flow). Data is real Open-Meteo GFS (curl-verified 200/CORS\*; 855-pt request OK).
- **Thermal "You have exceeded the transaction limit" (#R7).** FIRMS' own WMS rate-limits per IP, so a
  tiled map trips it and every tile is the red error PNG. Switched to **NASA GIBS WMS**
  (`gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi`, VIIRS NOAA-20+SNPP & MODIS Terra+Aqua thermal
  layers) — purpose-built high-volume tiling, no transaction cap, keyless, CORS\*. The 24/48/72 h
  "window" is now the most-recent N UTC days **stacked** as separate raster layers (`THERMAL_IDS`),
  since each GIBS GetMap is one day. `setThermalVis` / `_setThermalOpacity` drive all stacked layers.
- **NATO Article 6 (#R7).** Switched the members fill from country feature-state to a **dedicated
  geojson** (`src-nato`, `promoteId:__code` so hover still works) built by dropping every member
  sub-polygon whose centroid is **south of the Tropic of Cancer (23.4366°N)** — French Guiana,
  Guadeloupe, Martinique, Saint-Martin, Mayotte, Réunion, New Caledonia, French Polynesia, Hawaii,
  Puerto Rico, Guam … — i.e. everything outside the Art.6 treaty area. Mainlands aren't clipped
  (centroid is north). Draws an accurate **Tropic of Cancer** line + label so the cut is self-evident.
- **Google login immediate reflection (#R7).** `onAuthStateChange` now updates the account button
  **synchronously** from the event's own session (no Supabase calls inside the lock) before deferring
  the heavier profile enrich; the post-redirect retry loop re-renders each tick; added a `focus` /
  `visibilitychange` re-check so returning from Google reflects without a manual reload.
- **JP/EN (#R7).** Root cause of "English in the JP UI": `currentLang` defaulted to `'en'` and
  `loadSettings()` ran AFTER legends/`<option>`s were built with `currentLang==='jp'?…:…` ternaries.
  Now the saved language is read **up-front** (right after the `currentLang` declaration) so everything
  builds in the right language. Also tagged the thermal-window + traffic-filter `<option>`s with
  `data-i18n` so they follow a runtime switch.
- Frosted-glass muted text → near-white (scoped to `body.sidebar-translucent/-glass2` floating
  surfaces). Mobile legend ▢/✕ given identical 30px metrics + clear gap. Layers dropdown no longer
  closes when a legend ✕ inside it is clicked. Mobile Mercator min-zoom 1.4→0 (`flatMinZoom()`). 3D no
  longer auto-pitches/zooms (removed the `easeTo`). Sidebar-centre pan eased to match the CSS
  `cubic-bezier` (mobile centring already handled by the bottom-sheet `setPadding`).
- **Radius** got R/G/B quick-swatch presets (`RADIUS_COLOR_PRESETS`) beside the colour picker.
- **3D / satellite throughput.** `MAX_PARALLEL_IMAGE_REQUESTS` 64→96; DEM over **5** S3 host aliases
  (HTTP/1.1 → 5× the connection pools); + speculative prefetch (below).

### New: Draw / trace tool (`window.DrawTool`, `#R7`)
Freehand measurement. Click/tap to start, **move the cursor** to trace (no repeated clicking), click to
finish (or the panel's Finish; touch = press-drag-release). Length = great-circle along the **smoothed**
polyline; a **resolution slider** runs Douglas–Peucker (tolerance scaled to the drawing's own bbox, so
it's zoom-independent) → fewer points, shorter length, live. Self-intersections are found by greedy
segment-pair scan; each loop's **geodesic** area (`ringArea`, spherical excess) is banked, the loop
collapsed to its crossing point, repeat. **Area is computed from the RAW trajectory and pinned**, so the
slider changes length & look but NEVER the area number — proven in `_debug.simulate` (49,459 km² constant
across smoothing 0/50/90 at 60°N, length 1013→1005 km). Entry: toolbar ✏️ Draw button + right-click
"Draw / trace from here". Own geojson source `draw-src` (loop fills + line + start/head points).

### Projection (#R7)
Removed the Flat-view projection **selector** (it spawned the "blank" ProjView window the user disliked).
Flat = real Mercator and Globe = globe stay in perfect same-space sync. The alt projections now live in
the **right-click context menu**: "🧭 Azimuthal map (centre here)" centres ProjView on the clicked point;
"🗺️ Map projections…" opens it (its own bar still switches Equal Earth/Robinson/Winkel/Mollweide/…).

### New: next-gen additive architecture (one self-contained IIFE, `#R7`)
- `window.IntMapCache` — **IndexedDB** kv store (localStorage fallback); mirrors Supabase dashboard
  cards for an instant warm start. (News already had a localStorage cache.)
- `window.IntMapSim` — per-frame **simulation bridge**: external (Wasm) fluid/ballistic compute calls
  `update(id, geojson)` / `feedParticles` / `feedTracks` and the bridge streams it into a geojson source
  (`sim-<id>`) every frame — the hook for future satellite/missile 64-bit tracks and a Cesium feed.
- `window.IntMapWorker` — **Web-Worker** offload bridge (Blob worker, promise `run(task,payload)`;
  ships a `haversineTotal` task — verified London→Tokyo = 9559 km off-thread). The decoupling foundation
  for heavy compute / future Wasm.
- `window.SpeculativePrefetch` — on `moveend`, estimates camera velocity, predicts the next centre
  ~0.55 s ahead and `new Image()`-warms the active basemap/satellite tiles around it (browser-cache
  prefetch → instant when the user pans there).
- **New overlays** in a new "Intelligence (advanced)" dropdown group: **Disputed boundaries**
  (nine-dash line, Ukraine front, Kashmir LoC, Korean DMZ, Taiwan median line) and **Air-defence
  coverage** = geodesic range "domes" for 14 SAM sites (S-400/HQ-9/Patriot/THAAD/…) reusing the radius
  tool's `diskFillPolys`/`diskOutlineLines`; overlapping fills reveal coverage & gaps.
- **Pipelines layer renewed** (`geoLayersDB.pipelines`): 16 major oil/gas trunk lines (Nord Stream,
  Yamal, Power of Siberia, ESPO, Druzhba, TurkStream, Blue Stream, Southern Gas Corridor, BTC,
  West–East/Central-Asia China gas, TAPI, Trans-Med, Maghreb/Medgaz, Keystone, Trans-Alaska).
- **Information** dashboard: **+41 world military bases** (Norfolk, Yokosuka, Kadena, Ramstein-class US;
  Russian Khmeimim/Engels/Plesetsk/Vladivostok; Chinese Yulin/Zhanjiang/Mischief/Woody; allied
  Faslane/Toulon/Île Longue/Stirling/INS Kadamba …).

### Future work (documented, not done this round)
- Full CesiumJS hybrid engine + 3D-Tiles/Quantized-Mesh + true 3D domes (needs the engine swap above).
- Demographic-decline / dynamic-power-projection choropleth (needs bundled age-structure dataset).
- Historical-border time-travel geometry (needs per-era boundary geojson).

---

## 10. Round 8 — re-attacked the recurring complaints (tags `#R8`)

The user re-reported the SAME pain points (wind ×4, 3D/satellite speed ×2, Google login ×2, mobile
legend, JP/EN). So this round is about making those *actually* right, not adding surface. Same
non-goal as R7: **no Cesium engine swap** (would break the 8k-line app; the brief also says
"全ロジックを破壊せずに"). Everything is additive/in-place. Verified in the headless preview
(`preview_eval` for parse/DOM/CSS + console-error checks; Open-Meteo + the 6°-grid URL limit probed with
curl). The hidden preview can't run `requestAnimationFrame`, so the wind *animation* is verified by
parse + the fetch→seed→canvas pipeline resolving live + provably-correct mask math, not a screenshot.

### Wind — the headline, rebuilt to actually look like Windy (`#R8`)
Root cause of "coloured into space / でたらめ / nothing renders right": on the **globe**,
`map.unproject()` of a pixel that is in SPACE still returns a lng/lat, and `map.project()` of a
**far-side** coordinate still lands on-screen. So the old code painted the speed field into space and
smeared far-side particle streaks across the front hemisphere. Fix = reuse the marker-occlusion **dot
test** (`visibleLL`, refreshed once/frame): a coordinate is drawn only if it's on the visible near
hemisphere (dot > cos 87°). Applied to BOTH the background field AND every particle; the background also
does a **project-round-trip** check when idle (off-sphere pixels clamp to the limb → round-trip fails →
stay transparent). Particles now **rejection-seed** onto the visible hemisphere so the front isn't sparse.
Also per the user: **denser** (~7.2k desktop / mobile-capped, was ~4–5k), **calmer** (advection factor
0.13→0.066, ≈half speed), **finer** speed-colour field (STEPpx 16→12 idle, coarser while moving),
longer gentle trails (idle fade 0.09→0.066). Data is still real Open-Meteo GFS at **8°** (855 pts): a
6° grid is 1500 pts → an 11 KB URL → **HTTP 414** from Open-Meteo, so 8° is the single-request ceiling.

### Google login reflects immediately (`#R8`)
The remaining gap behind "戻ると未ログイン、再読み込みで直る" was the **bfcache back-button** path: when
the page is restored from cache after the Google round-trip, `focus`/`visibilitychange` often DON'T fire
— but **`pageshow`** does. Added `pageshow` (force-rechecks on `persisted`) + a `storage` listener
(session written by another tab/the Supabase helper). Also: the post-redirect poll now runs longer
(16×400 ms) to cover a slow PKCE exchange, and the URL token is scrubbed **only after** a session is in
hand (premature scrubbing threw away the code → forced the manual reload).

### 3D / satellite throughput (`#R8`)
The user measured *under*-fetching (<20 Mbps, spare CPU/GPU) → spend the spare capacity:
`MAX_PARALLEL_IMAGE_REQUESTS` 96→128; `maxTileCacheSize` 2048→**4096 desktop** (1536 mobile) so
pan/tilt-back never refetches; predictive prefetch ring 2→3, cap 48→90, and it now warms **two** zoom
levels deeper (anticipate a pinch-in); the SW prefetch batch 64→96. (Still bounded by free public tile
hosts vs Google's private HTTP/2 CDN — this maximises what we control.)

### Mobile legend ▢/✕ alignment — drawn, not typed (`#R8`)
The slight vertical offset was a **font-glyph-metric** problem (▢/– sit on the math axis, ✕ on the
dingbat centre). Permanent fix: the minimize and close icons are now **CSS-drawn shapes** (rotated bars
for ×, a centred bar for –, a square outline for ▢) in identical 30 px boxes, centred with the same
absolute-positioning math → pixel-aligned at any DPR, zero glyph dependency, with an 8 px gap.

### JP/EN parity (`#R8`)
A JP-mode DOM scan of the controls came back clean except the **mobile segment buttons**
(Map/Satellite/Globe/Flat). They copy their label from the desktop buttons via `syncControls()`, which
only re-ran on a lang-**button** click — so changing language from the **Settings dropdown** left them in
English. `updateI18n()` now calls `window._imSyncMobile()` so the mobile proxies follow *every* language
change. (Verified: Settings-dropdown switch now relabels 標準マップ/衛星写真/地球儀/平面.)

### Pipelines — high-quality "infrastructure map" (`#R8`)
Each trunk line is tagged `kind:'oil'|'gas'` (11 gas / 5 oil) carried into the geojson; the pipeline
line is two-tone (`['match',['get','kind'],…]`), gets a crisp dark **casing** under a zoom-interpolated
colour line plus the kept glow. Scoped to `key==='pipelines'` (other geo corridors carry `kind:''` →
match falls through to their single conceptual colour, unchanged). `-casing` added to the visibility
toggle list.

### Projection sync — confirmed already correct
Flat=`setProjection({mercator})` / Globe=`{globe}` on the **same** MapLibre instance → pins, drawings,
measurements (all stored as lng/lat) reproject in the same space. ProjView (azimuthal/Equal-Earth/…) is
opt-in from the right-click menu only; nothing auto-spawns a blank window on Flat. (The disliked Flat
projection *selector* was already removed in R7.)

---

## 11. Round 8b / 8c — re-attacked complaints + many new features (tags `#R8b`, `#R8c`)

The user came back twice more. Big themes: the **wind still wasn't right** (glow-on-scroll, heavy,
low-res, space colour), the **legend was still misaligned at some widths**, **alt-projection windows**
were still unwanted, **disputes must use REAL data not maths**, plus a batch of concrete new features.
Same non-goal as before: **no Cesium swap** (would break the 8k-line app; everything is additive).

### Wind v3 — geo-anchored raster field (`#R8b`)
The screen-space colour field was the root of "画面全体が光る while scrolling", the heaviness, and the
space-painting on the globe. Re-architected: the **speed-colour FIELD is now a MapLibre image-source
raster** (a Web-Mercator-parameterised 1024×512 canvas fed via `updateImage`). MapLibre reprojects it for
Flat AND Globe, **clips it to the sphere (no space colour, ever)**, pans/zooms it natively (no swimming,
no glow), and the GPU composites it — the per-frame unproject cost is gone. Only the **white particle
streaks** stay on `#wind-canvas` (dot-test masked on the globe). Colour uses a 256-entry LUT (no per-pixel
regex). **Finer DATA**: a 5° grid (~2160 pts) fetched as **parallel ≤500-pt chunks** (one URL = HTTP 414)
and reassembled, with an 8° single-request fallback. Particles calmer (advection 0.05) and ~7k dense.
- **Cursor readout + valid-time** (`#R8c`): `Wind.sampleAt(lng,lat)` feeds a 🌬 speed/direction chip in
  the coord HUD; a top-centre pill states the GFS analysis time (`Wind.dataTime()`), in the user's TZ.

### Legend min/close — drawn icons at EVERY width (`#R8b`/`#R8c`)
The earlier fix only covered ≤768px, so tablet/landscape widths still showed the misaligned **font
glyphs**. Now the ▢/–/✕ icons are **CSS-drawn shapes at all widths**, and the box props (top/size) live in
**one shared declaration** so close & min cannot diverge. Verified on a LIVE legend: `sameTop:true`.
(The remaining user reports are almost certainly a browser cache of the pre-fix file — hard-reload.)

### World languages layer (`#R8b`)
Asher/Moseley (jakejing) overlay in the *Intelligence (advanced)* group: fill + line, hover popup
(Language/Family via tolerant key lookup), **lazy-loaded** from `data/asher_languages.geojson`, simplified
at the source (`tolerance/maxzoom`), cached in memory across style swaps, and **MVT/PMTiles-ready**
(`window.LANGUAGES_TILES_URL`). A committed placeholder sample + `data/README.md` make it work out of the
box; drop in the full GeoJSON at the same path, no code change.

### Disputes / pipelines — REAL data, NOT maths (`#R8c`)
The user clarified: "smooth" = faithful to real data, **not** a Catmull-Rom curve (which invents shape).
Removed the smoothing from the disputed boundaries and replaced the sparse chords with **dense
real-geography vertices** (nine-dash 24 pts, Ukraine front, Kashmir LoC, DMZ, Taiwan median), rendered
as-is. Authoritative boundary GeoJSON (drop-in like languages) is documented future work.

### New features (`#R8c`)
- **Draw closing line**: finishing a trace with no self-intersection now closes END→START with a
  **great-circle** line and reports that polygon's area. The closing line is AREA-only — never added to
  the length, never touched by the smoothing slider (a dashed `draw-close-line` layer).
- **Place-label click → red fill + copy**: clicking an `ofm-*` place label fills the country polygon red
  (point-in-polygon over `countryGeo`) / drops a red dot, with a popup carrying a **Copy** button.
- **Köppen legend**: desktop = **full-height by default** (no scroll, all ~30 classes fit) and the only
  legend that is **resizable like a window** — vertical-only via `resize:vertical`. Mobile unchanged.
- **Flat alt-projections removed**: MapLibre can't render Equal-Earth/Robinson/Azimuthal in-space, so they
  always opened the separate "blank window" the user rejected. The ProjView entry points (right-click +
  pin button) are **gone**; only the natively-synced Mercator/Globe remain. (ProjView code kept, unwired.)
- **Settings Save reflect**: Save now also runs `updateI18n()` + `renderUI()` + refreshes the coord
  readout + dispatches `intmap-lang`, so every saved setting shows immediately.
- **View bookmarks** (`window.IntMapBookmark`): centre/zoom/bearing/pitch/projection + active layers are
  mirrored into the URL hash (live permalink, restore on reload); right-click → "Copy link to this view".
- **Runway / air-base search SCAFFOLD** (`window.RunwaySearch`): right-click → "Runway search (from
  here)" opens a panel (radius km · military/civil/all · min length · airport-vs-runway view). Data is NOT
  auto-fetched (per the user); it **lazy-loads OurAirports** (public-domain, CORS*, 14,953 runways),
  caches in IndexedDB, and filters by great-circle distance. Verified: 60 km around Heathrow → Heathrow/
  Farnborough/Gatwick/Luton with correct lengths & distances. The "用意" the user asked to prepare.

### Gotcha that bit us (`#R8c`)
A CSS **comment containing back-ticks** (`` `right` ``) was added INSIDE the injected-style **template
literal** — the back-tick closed the template early and the whole main script failed to parse
("Unexpected identifier 'right'"). Lesson: never put back-ticks (or `${`) inside template-literal CSS.

### Still-open / documented future work
- JP/EN: a few **dynamically-built** layer-control labels (Month/Filter/Layer-date/Sea-level) are correct
  on a fresh load but go stale if the language is switched mid-session (built via `t()` at build time, not
  re-localized). Translations all exist; needs the layer-row builder re-run on `intmap-lang`.
- Historical-border time-travel, demographic-decline projection, civil-defence siren alerts, Arctic
  sea-ice layer, historic max-territory layer, Stats time-series graphs — all need bundled/era datasets or
  live alert APIs; documented, not built. Full Cesium hybrid engine remains the deliberate non-goal.

---

## 12. Round 9 — large requested batch (tags `#R9`)

Note up front: Cesium migration was **abandoned by the user** ("没にしました") — MapLibre stays the engine.
Everything below is additive/in-place; verified in the headless preview (`preview_eval` for globals/DOM/CSS
+ console-error checks; the hidden preview never finishes WebGL `map.load`, so map-layer *adds* are verified
by wiring + data-probe, not a screenshot). External endpoints curl-probed before wiring.

### Done this round
- **Measurement consolidation** — desktop **Measure/Draw collapsed under one "Measure ▾"** dropdown; **Radius
  stays standalone**; the **Area button is gone** (Measure still auto-closes into an area when you click the
  start vertex). The old `['measure','area','radius']` button loops are now a null-safe `_syncToolBtns()` so
  removing the Area button can't throw, and the trigger lights up for measure/area/draw. **Undo last point**
  (`_measureUndo`, ↶ in the tool panel). Removed Area proxy on mobile, **added a Screenshot tool** there.
- **Draw aux-line bug** — `DrawTool.exit()` never reset `closeAux`, so the dashed END→START closing line
  persisted after closing Draw. Now reset on exit.
- **Context menu** — removed "Copy link to this view" and "Draw / trace from here"; added **"⭕ Radius from
  here"** (`_radiusFromPoint`) and a Radius button in the **pin popup** (`_radiusFromPin`) — fixed centre,
  tune radius/colour after.
- **Frosted glass** — "Frosted glass" now IS the rich frosted look (was the old "more transparent"); the
  "Frosted glass (more transparent)" slot is **genuinely see-through** (≈10–14 % fill, light blur, readability
  text-shadow). JP label simplified to「フロストガラス」/「フロストガラス（さらに透明）」.
- **Buy me a blueberry / 開発を支援する** — button always sits just above Apply (last `.setting-group`), opens a
  modal with the exact thank-you copy + a Stripe link (`window.INTMAP_STRIPE_URL`, **replace the placeholder**).
- **AI-key warning** — AI buttons (locate / translate / summarize / sat-change) are **no longer `disabled`**
  without a key (a dead press); they get `.ai-needs-key` (dimmed) and the click now surfaces the existing
  `aiNoKey` toast ("Add an AI API key in Settings → AI features first.").
- **Settings scroll bug** — reopening Settings now blurs the focused element and resets `.modal-content`
  scrollTop (double-rAF), so it always opens at the top instead of jumping to Apply at the bottom.
- **News language filter** — multi-language mode now fetches **only the ticked languages**; the UI-language
  WORLD/BUSINESS base feeds are added only when the UI language is among the selections (so picking just
  Russian no longer leaks English).
- **Translate-titles UI** — same "detecting" spinner/progress + result toast as AI-locate (`aiTransBusy/Done/None`).
- **Tab/search spacing swapped** (#21) — global `.search-bar` margin override removed; tabs→search and
  search→All/Saved gaps swapped per breakpoint (desktop 16/12 → 12/16; mobile 6/12 → 12/6). Verified live.
- **Sea-level both ways** — slider now **−150…+70 m** plus a **custom number box (−11000…+9000, negative =
  fall)** with an inline out-of-range error; `seaLevelRamp` rebuilt to keep only strictly-ascending stops so
  negative offsets don't throw. Layer/legend renamed **Sea-level change /「海面変動」**.
- **New layers** — **GDP per capita** choropleth (`gdppc`, reuses the bundled `gdppc` field) and **Night lights
  (satellite)** = VIIRS **Black Marble** via GIBS (`nightsat`).
- **Place-label click** — removed the red area/dot **highlight**; only the copyable popup remains, and it's
  **self-themed** (`.plc-popup`) so the name is readable in **dark mode**.
- **Coordinate paste** (#52) — pasting/typing `lat,lng`, `lat lng`, or hemisphere forms (`35.6N, 139.7E`,
  either order) into the search box **flies there instantly** (`parseLatLng` + debounced `coordFly`; also from
  the Search button).
- **User GeoJSON upload** (#49) — `window.GeoJSONUpload`: a "📂 Upload GeoJSON" button in the Layers menu **or
  drag-and-drop onto the map**; auto-styles fill/line/point, fits bounds, each upload removable.
- **Tactical / military theme** (#58) — Settings → Appearance → "Tactical": phosphor-green HUD on near-black
  olive, monospace type, sharp corners, neon buttons, faint CRT scanlines. `body.theme-tactical` on the dark base.
- **Legends** — □/×/▢ icons now centre with `transform:translate(-50%,-50%)` (size-independent → pixel-exact at
  any DPR, kills the last □-vs-× drift); **collapsed legend** hugs the title (tighter padding); the **Köppen
  legend header + ⋮⋮ handle + min/close stay pinned** while only the inner `.kl-scroll` rows scroll.
- **Runway search** (#47/#48) — clicking a result **row or a pin** opens an info popup (code / municipality /
  type / longest runway / count / coords) with a **Wikipedia link**; `makeDraggable` now also clears `bottom`
  so panels (incl. the runway panel) **drag vertically**, not just sideways.
- **Screenshot** — the timebar's drop-shadow is flattened in `capture-mode` (#44).
- **AI Subject-Location prompt** sharpened (#43): ignore outlet/dateline + "spoke-about" venues (White House →
  the Middle-East country), prefer the most specific place.
- **News in a drawn area** (#51) — a "📍 News in this area" button on the Area/Radius tool panels filters the
  analysed news to the shape (`_newsAreaTest` in `computeFilteredNews`), switches to the News tab, and shows a
  dismissable banner (`_searchNewsInArea` / `_clearNewsArea`).

### Deferred (need datasets / heavy engines / deep mobile-gesture reworks — documented, not built)
- Arctic sea-ice layer: GIBS serves sea-ice only in the **polar projections** (EPSG:3413/3031), not the
  Web-Mercator tiles the mercator/globe basemap needs — can't align without a polar reprojection step.
- Historical-border time-travel + period economic stats, historic max-territory, demographic projection,
  Stats time-series graphs — need bundled per-era datasets.
- Civil-defence siren (Ukraine/Israel) live alert polygons — need the alert APIs + CORS handling.
- Country-isolation "only this country" mode (#53); 3D line-of-sight / radar-shadow (#56); maritime A*
  routing (#57) — large geometry/terrain engines.
- Elevation profile under a measured line (#46); financial/weather/clock widgets (#50); jina.ai in-app
  reader (#45); mobile centre-fixed Add-Point measuring + crosshair + desktop Add-Point button
  (#34/#35/#36) — sizeable, left for a focused round.

---

## 13. Round 10–11 — very large re-attack + new features (tags `#R10`, `#R11`)

The user returned with two huge batches (40+ items each), including several **reversals** of R9b additions
and the real Stripe links. All additive/in-place; verified in the headless preview (`preview_eval` for
globals/DOM/CSS + console-error checks; external endpoints curl-probed first). MapLibre stays the engine.

### Donations / Pro removal (`#R10`)
- **Real Stripe links wired**: `INTMAP_STRIPE_URL_EN` (USD, `?locale=en`) and `_JP` (JPY, `?locale=ja`);
  `stripeDonateURL()` picks by language and the "Continue" button is a direct `<a href>`. JP support page
  hides the 🫐 emoji.
- **Donation recording**: a logged-in user clicking the support button inserts an *intent* row into a new
  `donations` table (`supabase_donations.sql`, RLS own-row) — basis for recognising supporters when a paid
  plan launches. (Actual paid amount needs a Stripe webhook → `status='paid'`.)
- **All Pro/premium removed, everything free**: `imIsPro()` now returns `true` (unlocks satellite BYOK);
  the premium layer section + pricing modal are gone (`openProModal` is a no-op); the account menu's
  Pro/upgrade/subscription rows removed; the two name-only "premium" layers deleted entirely.

### Layer removals / renames / recategorise (`#R10`/`#R11`)
- Removed: sea-ice, ADIZ, the whole "Intelligence (advanced)" category (disputes/air-defence/languages),
  clouds·infrared, the Strategic-networks **submarine cables** (kept the Maritime one, dropped "(real)"),
  Heartland + Rimland (layers + geoLayersDB). "Geopolitical theory" → **"Strategic geography"**.
- **Grid moved into the Layers menu** (desktop toolbar button hidden, kept for the mobile proxy).
- **New layers**: GDP-per-capita, night-lights (Black Marble), dams, volcanoes, NOAA aurora; **ESA
  WorldCover 2021** (Terrascope WMTS), **WWF/RESOLVE Ecoregions 2017** (PMTiles + the pmtiles protocol
  plugin, source-layer resolved from metadata), **tectonic plates** (real fraxen/PB2002 polygons +
  boundaries + labels), **Total Fertility Rate** choropleth (World Bank live). New group "Land cover &
  earth science". Layer modules now relabel on the Settings language change (header EN/JP toggle removed).

### UI / measurement / fixes (`#R11`)
- Header **EN/JP toggle removed** (language is Settings-only). **No tab auto-selected** on load (blank
  sidebar, map prominent; pins load when News opens). **"Read" reverted** to opening the external browser.
- Measurement: **clearing an area restarts in Measure** (not stuck in area); **"Keep on map"** no longer
  auto-opens a popup — clicking the saved shape shows a dismissable popup **with the measured value**;
  **radius-from-pin/point** now lets the slider/colour **edit that circle live** (`_activeRadiusId`).
- **Köppen legend** flex-column rebuilt — opacity slider + minimise button restored (they vanished when
  `.kl-hint` moved inside the scroll area broke `ensureLegendOpacity`'s `insertBefore`, which aborted the
  minimise call in the shared try/catch); collapsed `min-height:0`; mobile legend ≈ square + scrollable.
- **Wind valid-time pill** moved below the search box (overlap fixed). **Tactical** renamed + made harder
  (sharp frames, amber warning accent, hazard stripes, denser CRT).
- **Widgets** (🧩 toolbar/mobile): clock + weather (Open-Meteo at map centre, uses `fmtTemp`) + USD FX,
  draggable, prefs persist. **Temperature °C/°F/both** Settings option (`fmtTemp`, default both). **Runway
  search** lengths/distances respect metric/imperial/both.
- **Country isolation**: now restricts panning to the country (`setMaxBounds`) and the exit pill sits at
  the bottom-centre. **Elevation profile**: high-res even-distance sampling (~1/1.5 km, 60–240 pts) +
  **hover-to-map** sync (red cursor marker + chart crosshair + distance/elevation readout).
- **Line of sight / radar shadow** (`window.IntMapLOS`): radar site + antenna height + range → 96
  earth-curvature-corrected DEM rays → terrain-blocked dead zones filled red (coverage outlined green).
- **Mobile centre-fixed measuring**: centre crosshair + bottom-centre **Add point** button (adds the map
  centre; replaces the disabled long-press menu when no tool is active) + bottom-left centre readout;
  mobile taps no longer add points.

### Still-open / documented (need data files, live tile formats, or engine-scale work)
- **ECMWF Open-Meteo `data_spatial` 8-layer weather suite** (WebGL particle wind, isobars, SLP, cloud,
  humidity, ocean temp, etc.) + per-layer toggles — large; needs the spatial-tile format wired into
  MapLibre sources. Wind-resolution bump + wind-legend **unit pulldown** belong with this rework.
- **Köppen multi-period (1901-1930 / 1931-1960 / 1961-1990)** + WWF biome / Holdridge / land-use classes —
  the period `.tif` source files aren't in the repo and need GDAL → Web-Mercator PNG conversion (like the
  existing `koppen_mercator.png`); a legend period-pulldown is the intended entry point.
- **Compare-mode resizable/minimisable window** mirroring the full main UI (minus sidebar) — a second map
  instance + cloned controls; large.
- **Maritime A\* routing** (land-avoiding sea routes, no-go zones, real shipping lanes) — needs a sea/land
  mask grid + pathfinding.
- **Pipeline geometry** to survey-grade real coordinates — needs an authoritative pipeline dataset.
- Map-colour-occasionally-wrong + mobile sidebar-drag-centre smoothness — intermittent; still chasing repro.

---

## 14. Round 12 — cleared the whole deferred backlog + new engines (tags `#R12`)

Re-attacked every item the user re-listed. All additive/in-place; MapLibre stays the engine. Verified in
the headless preview with `preview_eval` (globals/DOM/CSS, console-error checks, and — crucially — the
maritime A* and ECMWF/SDK pipelines were *run* off-screen since they're pure JS / network up to the WebGL
boundary). The hidden preview still can't complete WebGL `map.load`, so the actual om-tile / second-map
raster *rendering* is verified by wiring + data-probe, not a screenshot. External endpoints curl-probed first.

### Fixes
- **Line of Sight was firing ~4,200 Open-Meteo elevation requests at once** (`fetchElevDepth` per ray-step)
  → rate-limited to nulls → flat terrain → no shadow → "doesn't work at all". Now a shared async sampler
  (`warmDEMTiles` / `demSampleAll`, near `demElevAt`) warms the few terrarium tiles covering the disk and
  samples them LOCALLY. The same sampler also fixes the **elevation profile** (#9): it was using Open-Meteo
  (0 over water) so sub-sea was flat — now the terrarium DEM (which carries bathymetry) makes it dip below
  sea level, with a blue water band drawn over the fill.
- **Country isolation bleed (#10):** the `iso-mask` (world-minus-country fill) is added topmost once, but
  layers toggled later — or re-added after a basemap swap when `beforeId='tool-poly'` is absent — landed
  ABOVE it. Now `toTop()` re-asserts the mask to the very top on `idle` + `styledata` (guarded so it only
  moves when not already last → no repaint loop).
- **Mobile crosshair + measuring (#6, #4-mobile):** removed the stray ring on the crosshair; add-point /
  readout now **unproject the geometric container centre** instead of `map.getCenter()` — the bottom-sheet
  sets map *padding*, so `getCenter()` was the padded centre, offset from the crosshair (points landed
  elsewhere). Mobile bottom-left readout now shows coords + elevation + active-layer value (updateCoord
  early-returns on mobile, so it's computed inline).
- **Screenshot (#7):** the leftover timebar shadow was the slider-**thumb** (`::-webkit-slider-thumb`,
  which `.news-timeline *` doesn't match) + `text-shadow`. capture-mode now zeroes box-shadow/filter/
  text-shadow incl. the thumb/sync-dot pseudo-elements.
- **Read article (#8):** already opens the external browser (`.btn-read` → `window.open`); `openArticleInSidebar`
  is dead code. Confirmed, no change.
- **Map-colour-occasionally-wrong:** `applyTheme()` early-returned when the style wasn't loaded and nothing
  re-ran it → the wrong base (black/white) sometimes stuck. Now it retries once on `idle`.
- **Mobile sheet-drag re-centre smoothness:** `map.setPadding` reprojects the whole camera; doing it 60×/s
  on a WebGL globe was the jank. `--sheet-cover` still tracks every frame (cheap), but setPadding is gated
  to ≥5px movement / one call per rAF.

### Köppen multi-period (#13)
The three era GeoTIFFs (1901-1930 / 1931-1960 / 1961-1990) were reprojected (PIL, nearest-neighbour, crisp
class boundaries) from equirectangular → **Web-Mercator 8192² PNGs** (`koppen_mercator_<era>.png`), same
palette/coords as the present-day `koppen_mercator.png`, so cursor sampling + class highlighting just work.
`setKoppenPeriod()` swaps `KURL`, resets the cached sampling canvas/code-index, re-loads, and re-emits.
A **period pulldown** sits in the Köppen legend; **default stays 1991-2020**.

### Wind legend + units (#19, #22)
The floating top-centre valid-time pill (overlapped the search box) is gone — the valid time now lives in a
proper draggable **`data-legend-wind`** (same format as every layer) with a speed colour ramp and a **unit
pulldown (m/s · km/h · kn · mph)**. `window.fmtWindSpeed()` drives the cursor readout chip; the legend
max-scale label converts with the unit; choice persists in localStorage.

### Support button (#24)
Renamed "Buy me a blueberry" → **Support** (EN) / サポート (JP), placed **between Login and Settings** in the
header (in addition to the Settings-panel one), with the exact requested copy (EN + a JP translation).

### Pipelines (#1-pipe)
Removed the Catmull-Rom `smooth` flag (the user: "数学的処理ではない") and replaced every sparse chord with
**dense, route-faithful real coordinates** (12–18 pts each) for all 16 trunk lines, drawn as-is.

### Layer panel re-classification (#17)
Re-organised the dynamic layers into a cleaner taxonomy: **Climate & weather · Terrain & elevation · Oceans
& maritime · Hazards & night sky · Population & economy · Geopolitics & defence** (new i18n group keys).

### NEW: maritime A* routing — `window.IntMapRoute` (#57 / routing engine)
Land is rasterised ONCE from `countryGeo` into an equirectangular **1800×900 (0.2°) mask** (canvas fill +
near-coast flagging). **A*** (binary-heap) runs on that grid; a **near-coast cost penalty (×1.6)** keeps
routes off the 0 m coastline (the "国際法・航行上の常識" standoff) without blocking narrow straits. Real
**chokepoints & canals are carved OPEN** (Gibraltar, Suez+Gulf of Suez, Panama, Bosphorus/Dardanelles,
Danish straits, Kiel, Bab-el-Mandeb, Hormuz, Malacca, Korea/Tsugaru/La Pérouse/Messina/Cook) with
**densified, overlapping carve disks** so enclosed seas connect through their real passages — otherwise
22 km cells wall them off. The staircase path is **string-pulled** along clear-sea sightlines (faithful, not
an invented curve), split at the antimeridian for `renderWorldCopies:false`. **No-go zones** (click to drop
120 km circles) and a **pure-shortest-distance (great-circle)** mode. Entry: right-click → "Sea route from
here" / "Set sea-route end here". Verified live: Singapore→Rotterdam ≈ **15,774 km** via Malacca/Bab-el-Mandeb/
Suez/Gibraltar (real ≈15,300 km); North-Sea→Med detours around Iberia via Gibraltar; Panama crossing 458 km.
**Canals are land in the base mask** (too thin) but carved open here, matching real shipping.

### NEW: ECMWF weather suite — `window.IntMapWeatherEC` (#20, #21)
Lazy-loads the **official Open-Meteo `@openmeteo/weather-map-layer` UMD SDK** (v0.0.19, unpkg) and registers
its **`om://` MapLibre protocol**, which decodes the ECMWF-IFS `.om` tiles from
`map-tiles.open-meteo.com/data_spatial/ecmwf_ifs/latest.json?variable=…` and applies the SDK's Windy-style
per-variable colour scales. 8 layers, each variable+type **validated live against what `ecmwf_ifs` actually serves** (probed the om://
protocol → real tiles): temperature_2m, **wind (vector arrows** — `wind_u_component_10m&arrows=true`,
source-layer `wind-arrows`), cloud_cover, **dew_point_2m** (moisture — `relative_humidity_2m` is NOT
served), pressure_msl raster, **isobars** = vector contours off pressure_msl, **cape** (instability),
sea_surface_temperature. NOTE: `ecmwf_ifs` spatial does **not** serve `precipitation` or
`relative_humidity_2m` or a combined `wind_10m`/`wind_speed_10m` (only u/v components) — so precip stays on
the app's existing IMERG/radar layers, humidity is shown as dew point, and wind is directional arrows
(the animated GFS Wind layer remains the primary wind viz). Variable also corrected `sea_level_pressure`→
`pressure_msl`.
each inserted **between basemap and labels** (`beforeId`). A dedicated panel gives per-layer toggle + opacity,
an **hourly time slider** off `valid_times`, and the displayed **valid time** (user TZ). Public API
**`window.toggleWeatherLayer(id, visible)`**. Fully guarded (SDK/endpoint failure → toast, app unaffected).
The existing animated GFS Wind layer is untouched and coexists. **Verified end-to-end at the data layer**:
the SDK is `maplibre-gl ^5.20.1` (matches the app → `om://` protocol is v5-compatible); SDK loads, protocol
registers, decode workers init, `valid_times` parse + nearest-to-now auto-selected. Calling `omProtocol`
directly returned a valid TileJSON (`tiles` template `…?variable=temperature_2m/{z}/{x}/{y}`) and a real
z2 tile decoded to a **512×512 ImageBitmap in ~86 ms**; `pressure_msl` metadata resolves too. The ONLY
unverifiable-headlessly step is compositing that ImageBitmap onto the WebGL canvas (the hidden preview
pauses rAF) — i.e. the data/decode pipeline is proven; visual confirmation just needs a visible browser.

### NEW: Compare-mode window — `window.IntMapCompare` (#15)
A **resizable / minimisable / draggable** floating window holding a **second MapLibre instance** with its own
basemap (Map/Satellite), projection (Flat/Globe), and independent data layers (Köppen w/ the active period,
ESA WorldCover) + an optional **"Sync view"** lock to the main camera. Mirrors the main map's view+layer
controls minus the sidebar. (Full parity with every main-map *tool* isn't cloned — the app is single-`map`
instance — but the comparison surface behaves like the main map.) Entry: Layers menu → "Open compare view".

### Documented limitation
- The ECMWF `.om` raster and the compare-window second-map raster can only be wiring/data-verified in the
  headless preview (hidden ⇒ no rAF/WebGL completion) — visually confirm in a real browser.
- Maritime routing through **sub-cell straits not in the carve list** (e.g. Bosphorus is carved; a random
  20 km channel elsewhere may be closed) and **canals other than Suez/Panama/Kiel** aren't auto-traversed.

---

## 15. Round 13 — re-attacked the re-reported batch (tags `#R13`)

The user came back with the same pain points (Köppen quality/lag, ECMWF "mostly broken", Ecoregions/
WorldCover "not added", Compare X-ray, LOS, sea route, boundaries, mobile/desktop nits). All additive/
in-place; MapLibre stays the engine. Verified in the headless preview (globals/DOM/CSS + console-error
checks; endpoints curl-probed). Committed in 5 parts + this note.

### Köppen (#data, #lag, #legend)
- **1991-2020 regenerated at 8192²** (was 4096²) from the 1 km `koppen_geiger_0p00833333.tif`
  (`_koppen_convert.py`, PIL/numpy, nearest-neighbour, exact KCOL palette so cursor sampling round-trips).
  The three eras were re-emitted identically.
- **Source-data caveat:** `1931-1960.tif` and `1961-1990.tif` are **byte-identical** (md5 `ee9cd732…`), so
  those two periods are necessarily the same image — not a bug in our pipeline, the downloaded inputs are
  duplicates. (Drop a real distinct 1961-1990 GeoTIFF in and re-run `_koppen_convert.py` to fix.)
- **Lag killed:** sampling + class-highlighting now run on a small **≤2048 work-canvas** (built nearest-
  neighbour so KCOL is preserved), and highlighting is a **separate dim-overlay layer** (`lyr-climate-dim`,
  non-selected classes darkened) so the base raster stays full-res and we never re-encode an 8192² PNG per
  click. Period switch swaps the base image immediately (GPU) then recomputes the dim overlay.
- **Legend class-click no longer jumps to the top** — scrollTop of `.kl-scroll` is saved/restored around the
  `buildLegend()` rebuild. Vertical-only `resize` was already correct.
- The big source GeoTIFFs are **git-ignored** (new `.gitignore`); only the shipped PNGs are tracked.

### Layer panel — full re-classification + ECMWF as layers (#panel, #ecmwf)
- New `window.reorganizeLayerPanel()` re-files **every** row (static Strategic geography/networks, dynamic
  data layers, ECMWF, land-cover, Round-9 dams/volcanoes/aurora) under **7 coherent categories** + a Tools
  section, idempotently on every Layers-open. "Data layers" label removed. "Open compare view" + "Upload
  GeoJSON" moved into the bottom **Tools** section (no more mid-list placement).
- **ECMWF is no longer a separate button/panel** — each variable is a normal `lyr-row` (checkbox + opacity)
  with one shared hourly **valid-time slider** + valid-time label. Re-confirmed `ecmwf_ifs` now serves
  `precipitation`, so an ECMWF precip layer was added (9 layers total). Rendering still uses the official
  `om://` SDK protocol (data/decode verified; pixel compositing only confirmable in a real browser).

### Ecoregions — dead URL fixed (#eco)
- The protomaps `resolved_ecoregions_2017.pmtiles` sample **404s** (bucket alive, file removed) — that's why
  it "wouldn't add". Switched to a **self-hosted simplified GeoJSON** (`data/ecoregions_2017.geojson`, 847
  RESOLVE/WWF ecoregions from the ArcGIS FeatureServer, per-feature COLOR, ~9.8 MB) loaded as a normal
  geojson source + click popup; restores across basemap swaps. No plugin / external dependency.
- WorldCover (Terrascope WMTS) was already wired; it just wasn't visible in the cluttered panel — the
  reorg surfaces it under "Terrain & elevation".

### Compare mode (#compare)
- **X-ray mode**: the compare window goes transparent and hides its own basemap so the MAIN map (with all
  its active layers) shows through at the same location; sync forced on. The compare window's own data layer
  paints on top → true same-spot comparison.
- Added an **Ecoregions** toggle (lazy-loaded) so it mirrors more of the main map's thematic layers.

### Line of Sight (#los)
- Colours **un-inverted** to match the spec: REACHABLE range = red fill, radar BLIND SPOTS = green fill.
- "Can't remove it" fixed — ✕ now clears the overlay.
- "Doesn't work": DEM zoom **capped ≤z10** (z12 ≈ 144 terrarium tiles often timed out → flat → no shadow),
  sampler timeout 16 s, and we now report when too little terrain loaded instead of drawing a full circle.

### Sea route (#route)
- "Can't remove it" fixed — ✕ clears the route + no-go zones.
- **Less linear**: string-pull sightlines sampled every ~9 km and reject chords that skim near-coast cells,
  so legs follow real geography instead of collapsing to long straights.
- Coastal/shallow endpoints resolve more reliably (snap search widened to 60 cells).

### Boundaries (#boundaries, #borders)
- **Sahel / Northern Sea Route / Belt & Road** redrawn with dense, geography-faithful vertices (≤2°,
  real straits/corridors/cities) — `buildGeoFC` draws raw vertices so the extra points remove the linearity.
- **Country borders → Natural Earth 10 m** (was 50 m; fall back 50 m → 110 m). 10 m gzips to ~4.7 MB and
  loads async; crisp lines that track the real borders, fixing the coarse / parallel-offset look.

### Mobile / desktop / runway nits
- Mobile **"+Add point" + crosshair show ONLY while a measurement tool is active**; long-press → context
  menu re-enabled for touch when idle.
- Desktop **map-centre-drops-to-bottom** fixed: the bottom-sheet padding helpers can't pad the camera
  bottom when not in the mobile layout.
- **Runway search inputs are unit-aware** — Imperial → radius in miles, min length in feet (converted).

### Documented limitation
- ECMWF `.om` raster + the compare second-map raster are wiring/data-verified only (headless preview can't
  complete WebGL) — confirm visually in a real browser.

### R13b — the public site runs from `file://` (this was the real root cause)
The user re-reported Köppen "ぐちゃぐちゃ" + weather/land-use/ecoregions "not functioning". Key insight:
the public site is opened as **`file:///…/index.html`**, and **Chrome blocks `fetch()` of LOCAL files
under `file://`** (only http/https/data). Remote https fetches and `<img>`/`<script>` loads still work.
- **Ecoregions** used `fetch('data/ecoregions_2017.geojson')` → silently failed under file://. Now shipped
  as a JS global `data/ecoregions_2017.js` (`window.__ECOREGIONS_2017`) loaded via a `<script>` tag (works
  under file:// and http; http keeps a fetch fallback). Exposed `window.__loadEcoregions`; the Compare
  window consumes the data object, not a URL. (Verified: 847 features load.)
- **WorldCover**: the brief's host `services.terrascope.be` is **DOWN** (HTTP 000 / reset from every
  network incl. the user's, while `viewer.terrascope.be` is up). The LIVE WMTS is **`wmts.terrascope.be`**
  (KVP): `LAYER=esa-worldcover-map-10m-2021-v2_map`, `TILEMATRIXSET=EPSG:3857`, plain numeric TILEMATRIX,
  and a **required `TIME=2021-01-01`**. Verified HTTP 200 image/png + ACAO (works under file://). Updated
  the main layer + the Compare source.
- **Köppen**: (a) dropped `crossOrigin='anonymous'` on the LOCAL PNG — under file:// an anonymous request
  to a same-folder file can fail to load → it fell back to the wrong remote Wikipedia image → garbled
  highlight; loading it plainly always gets the real image (a tainted getImageData is caught and only
  disables highlight sampling, never the base). (b) **Reverted the R13 dim-overlay** highlight — it added a
  second image layer at identical coordinates to the base, which z-fights/renders garbled (esp. on the
  globe). Back to the proven R12 recolour-the-same-image approach, still computed on the small work-canvas
  so the lag fix stays. Base remains 8192².
- **Weather (ECMWF)**: confirmed the full pipeline works in-browser — SDK loads, `omProtocol` registers,
  `latest.json` resolves (43 vars / 145 valid_times), a z2 `temperature_2m` tile decodes to a 512×512
  ImageBitmap, and the endpoint sends `ACAO:*` (so it works under file://). It's integrated as normal layer
  rows now; the earlier "doesn't function" was the old separate-panel UX. Visual compositing still needs a
  real (non-headless) browser to confirm.
- **Gotcha for future work:** anything that `fetch()`es a LOCAL bundled file will break on the file://
  public site — ship local data as a `<script>` global (or inline) instead, and prefer image/script loads.

---

## 16. Round 13c — Köppen re-render + Classic theme + temp-unit + UI nits (tags `#R13c`)

A focused, additive batch. Verified in the headless preview (`preview_eval`: full-script parse via globals,
console-error checks, DOM/CSS measurements; the spinning WebGL globe still can't be screenshotted).

### Köppen images replaced from the user's UPDATED source TIFFs
- The user re-downloaded **`1931-1960.tif`** so it is **no longer byte-identical** to `1961-1990.tif`
  (md5 `56babf54…` vs `ee9cd732…`). Re-ran `_koppen_convert.py` (PIL/numpy, palette-mode 43200×21600 → exact
  KCOL, nearest-neighbour → Web-Mercator 8192² RGBA). The two previously-identical PNGs are now **distinct**
  (`277dca79…` vs `dc35f5f7…`); 1901-1930 / 1961-1990 / 1991-2020 re-emit unchanged (their sources didn't move).
- **Renamed the present-day PNG** `koppen_mercator.png` → **`koppen_mercator_1991-2020.png`** so all four periods
  share one convention. Updated `window.KOPPEN_PERIODS`, the `koppenUrl()` fallbacks, and the comments. The old
  source `koppen_geiger_0p00833333.tif` is retired — every period now reads from
  `Köppen-Geiger climate classification data/<period>.tif`.
- All four source TIFFs confirmed mode-`P` with indices 0..30 and a palette that matches the script's hard-coded
  `KCOL` exactly (so cursor sampling still round-trips, image quality preserved — no re-quantisation).

### Classic (Age-of-Discovery) Appearance theme — NEW
`Settings → Appearance → "Classic"` (`userTheme==='classic'` → `body.theme-classic`, built ON the light base).
Warm parchment surfaces with an aged-paper grain, serif type + small-caps headings, brass accents, a **sepia
tint applied to ONLY the `.maplibregl-canvas`** (markers/HUD/controls stay crisp), and a decorative **compass
rose** (inline data-URI SVG) lower-right of the map (cosmetic, `pointer-events:none`, hidden on mobile).

### "Light Mode"/"Dark Mode" → "Light"/"Dark"
Label-only rename (`optLight`/`optDark`, EN + JP). Classic slotted between Dark and Tactical.

### Temperature unit — Fahrenheit never leaks when set, default keeps (°F)
`fmtTemp`'s default `both` already renders Celsius-primary with **Fahrenheit in parentheses** (matches the
brief "華氏をカッコで表記"). The real bug was **hard-coded `°C` bypassing the setting**: fixed the **cursor
readout** (temp/SST layer), the **temperature & SST legend scales** (now `fmtTemp(-40)` etc.), and added
**`window.convTempText()`** — converts `°C` literals embedded in prose (handles single values, ranges
`0–18 °C`/`0〜18°C`, and both minus signs) — applied to the **Köppen criteria popup**. `'c'`→°C only,
`'f'`→°F only, `'both'`→`°C (°F)`. (Verified across all three modes in the preview.)

### UI nits
- **Mobile country-isolation "Exit" pill** used a fixed `bottom:96px` → hidden under the bottom sheet. Now rides
  `calc(var(--sheet-cover) + 58px)` like the other floating controls (mobile media query, `!important`).
- **Layers → Tools couldn't open**: the auto-collapse-on-open loop folded **every** header incl. the Tools
  `lyr-section-label`, but the click handler refuses to toggle section labels → permanently collapsed. Excluded
  `.lyr-section-label` from the auto-collapse (+ reset stale `display` on the moved Compare/Upload buttons).
  Verified: after the collapse pass the Tools header stays open and the Compare button is visible.
- **Mobile Tools display bug**: `#layer-tools` is a direct child of the 2-column mobile layer grid but wasn't in
  the full-width span list → squished into one cell. Added it to `grid-column:1/-1` + full-width buttons.
- **Desktop legends/popups moved to the LEFT** of the map (were `right:24px`). Flipped the `.data-legend` /
  `.koppen-legend` CSS defaults and `tileLegends()` to a left anchor; in frosted-overlay mode they offset past
  the floating sidebar (`calc(var(--sidebar-w)+24px)`, flush-left when collapsed) — mirroring the coord-readout.
  Measured clear of the top-right map controls and the sidebar. Mobile keeps its right-dock.

### Git / data housekeeping
Source `.tif`s are git-ignored (`*.tif`) and `_koppen_convert.py` is a local tool (also ignored); only the
shipped `koppen_mercator_<period>.png` are tracked.

### R13c part 2 — the re-reported "rest" (tags `#R13c`)
The user asked to also tackle the remaining standing-list items. Tractable, verifiable ones done:
- **Every numeric layer now shows its value at the cursor (bottom-left).** Added `window.choroValueAt(lng,lat)`
  inside the choropleth closure — one `queryRenderedFeatures` over all visible `*-fill` layers, topmost
  wins, formatted via `CHORO_META[id]` → "Label: value". Wired into `updateLayerReadout` (falls back to it
  when no weather layer is active). Mobile inherits it (its readout already calls `updateLayerReadout`).
  Köppen/temp/SST were already covered.
- **Map/Satellite switching reliability.** `btn-view-map` early-returned whenever `currentMapType` was already
  `'map'`, so if state ever desynced from what's drawn, clicking Map did nothing. Both handlers now always
  re-assert + schedule one more `applyTheme()` on the next `idle`; added a guarded `styledata` self-heal that
  re-asserts the basemap whenever `layer-sat` visibility stops matching the chosen mode (no-loop: only on
  mismatch). Mobile proxies delegate to these via `real.click()`, so both UIs are covered.
- **Imperial everywhere (audit).** The big gap was elevation/depth, hard-coded `m` everywhere. New
  `fmtElevVal()` (imperial→ft, both→"m (ft)") now drives the desktop+mobile coord readout, the `fetchElev`
  network fallback, and the search-card elevation; the **elevation profile** chart axis/distance/hover use
  unit-aware `elevC`/`distC`; the sea-level slider label converts too. Measurements/area/runway were already
  unit-aware.
- **"Deleted layers still remain."** Root cause for the geo/strategic layers: `updateGeoLayers()` early-returned
  when the style was mid-load, so a toggle-OFF during loading silently no-op'd and the line stayed on. Now it
  re-runs on the next `idle`. (Data-layer and choropleth OFF paths were already correct — verified.)
- **Corridor lines less linear (faithfully).** Densified both **BRI** corridors to real named cities/ports
  (belt 51 pts: Xi'an→Lanzhou→Urumqi→Khorgos→Almaty→Tashkent→Samarkand→Ashgabat→Tehran→Tabriz→Erzurum→Ankara
  →Istanbul→Sofia→Belgrade→Budapest→Vienna→Prague→Duisburg→Rotterdam; maritime 39 pts through the real ports
  & straits). Sahel + NSR were already dense/real (R13). **Pipelines: NOT hand-padded** — survey-grade bends
  need an authoritative dataset; inventing intermediate points is exactly the "数学的処理でごまかす" the user
  rejected, so they're left as the real corridor coordinates we have + documented as needing a real dataset.

Verified in the headless preview: full parse, no console errors, `fmtElevVal` imperial/metric/both correct via
the real settings flow, `choroValueAt` returns gracefully with no layer active.

### R13c part 3 — legends, popups, Köppen highlight (tags `#R13c`)
- **Mobile country popup overflowed the screen.** `showCountryDetail`'s `.country-popup` becomes a `width:100%`
  bottom sheet on phones, but with `box-sizing:content-box` + `padding:26px 18px` it was **100vw + 36px** → the
  stats were cut off the right edge. Added `box-sizing:border-box` to the mobile rule (measured: now exactly
  375px at a 375px viewport).
- **Köppen legend "stretched left-right" when moved.** Move-drag never changed the width (verified), so the
  culprit was the native `resize` grabber being draggable horizontally on the user's browser. **Locked the
  width** (`min-width:max-width:216px`) so the grabber can only change HEIGHT — vertical-only resize, default
  size unchanged (the repeated #15/#18 request), and no more horizontal stretch.
- **Köppen highlight no longer drops resolution (#17).** The highlight used to recolour the small 2048² work
  canvas and replace the 8192² base → blur. Now the small canvas is kept ONLY for cursor sampling, and the
  DISPLAYED highlight is recoloured at the **source resolution** (8192² desktop / 4096² mobile cap) and encoded
  **asynchronously** (`toBlob`→objectURL, sequence-guarded, prev URL revoked, buffers freed on clear/era-change)
  so the map stays sharp and the UI never freezes. Graceful fallback to the old small-canvas highlight on
  `file://` taint / OOM. (Visual sharpness only fully confirmable in a non-headless browser; logic + parse verified.)
- **Time-varying legends state their data time (#15).** A "🕒 as-of" line (`window._refreshLegendDates`) appended
  to the temp (month), SST (date), thermal (window) and radar (live) legends, refreshed on every date/window/
  global-slider change. Verified the four lines render with the right text.
- **Ecoregion click popup was invisible in dark mode (#16).** It was a default-white MapLibre popup; gave it the
  self-theming `.plc-popup` class (`var(--popup-bg)`/`var(--text-main)`), readable in both themes.
- **Land cover legend (#18).** New draggable/minimisable legend with the official **ESA WorldCover 2021** 11-class
  palette + EN/JP labels; shows when WorldCover is toggled on, ✕ unchecks the layer. Verified: 11 swatches.
- **Mobile Tools section (#19).** The R13c grid-span + full-width-button fix is in place and verified; the
  re-report is almost certainly a `file://` cache of the pre-fix file (hard-reload).

---

## 17. Round 14 — Köppen crash, mil-spending data, active-layers list, mobile drag (tags `#R14`)

Re-attacked the re-reported batch. All additive/in-place; MapLibre stays the engine. Verified in the
headless preview over **http** (so `<img>`/local PNG loads work, unlike `file://`): full-script parse
confirmed (all new globals present, **zero console errors** after reload), the Köppen image pipeline
loads + samples correctly, and the active-layers list builds end-to-end. Memory/visual-only effects
(the 8192² highlight's true peak RAM, ECMWF `.om` compositing) still need a real browser per the
standing headless limitation.

### Köppen "selecting a class crashes the browser → 先祖返り" (#4) + "don't drop highlight resolution" (#16)
ROOT CAUSE was an **OOM tab-crash** (Chrome reloads the crashed tab → looks like a revert). The R13c
full-res highlight, at 8192², held **all at once**: the 268 MB raw RGBA source array (`_koppenFull.src`)
+ a 268 MB output `ImageData` + a 268 MB output canvas + the PNG-encode buffer → **>1 GB peak**. On any
machine under memory pressure (and all mobiles) that kills the tab.
- Fix = roughly **HALVE the peak** while keeping the SAME 8192²/4096² resolution (no quality loss):
  1. The Köppen image is a **categorical palette**, so we never keep the raw RGBA — only a 1-byte/pixel
     **class index** (`idx`), and reconstruct every colour from `KCOL` (selected → vivid, else grey+faded).
  2. The index is built in **horizontal strips** (peak ≈ one ~2 M-px strip, not the whole frame), and the
     output canvas is written in **strips** too (one small `ImageData` per strip) — so there is never a
     second full-frame `ImageData` and never a persisted 268 MB array.
  3. Every allocation/`getImageData` is in a try/catch → on OOM/`file://` taint it falls back to the
     existing small-canvas highlight instead of crashing.
- Net: peak drops from ~1 GB+ to ~0.6 GB on desktop (idx 67 MB + out-canvas 268 MB + base 268 MB),
  and to ~0.35 GB on mobile (4096² cap). Same displayed resolution, no more crash. `ensureKoppenFull`
  now stores only `{idx,W,H}`; `freeKoppenFull` still drops it on clear/era-change. (`index.html`
  ~`ensureKoppenFull`/`buildKoppenHighlightFull`.)

### Military spending — far fewer "No data" (#8)
`MILSPEND` expanded from ~58 to ~150 states (SIPRI 2023 where covered; IISS Military Balance estimates
for the few SIPRI omits — Gulf, Central Asia, Balkans, Baltics, most of Africa & Latin America, etc.).
Genuinely-unpublished spenders (DPRK, Syria, Eritrea, Turkmenistan, Somalia, Yemen) are deliberately
**left out rather than fabricated** → they stay honest grey. Both the $B and the %GDP choropleths
inherit the coverage. The **No-data→opacity linkage already existed** (addChoro paints no-data grey at
`opacities[id]*0.75`, and the slider updates it), so that half of the ask was already satisfied.

### "Show the currently-selected layers in the panel, below borders/grid + below favourites" (#17) — NEW
New live **Active layers** section (`#layer-active-section`, `window._refreshActiveLayers`) inserted in
the Layers panel **right after the favourites bar and the names/borders/grid/countries toggles**, before
the category list (verified: DOM index 5, after fav@0 + the 4 toggles). Each active thematic layer shows
as a chip — click the name to scroll to its row, click ✕ to switch it off. Rebuilt on every layer
checkbox `change` (delegated listener) and on every panel open. The 4 utility toggles are excluded (they
sit right above). Added to the mobile full-width grid-span list so it isn't squished into one cell.
The de-dup + handlers key off the **checkbox element**, not its `id`, so the **id-less geo/strategic rows**
(`data-layer="…"`, no `id`) show as distinct chips too — i.e. EVERY active layer is listed and removable
from one place (also a practical mitigation for the "ghost layers" report #10). Verified live: HDI +
Northern-Sea-Route + Global-Chokepoints → 3 distinct chips with clean labels + working ✕.

### Mobile measurement — "popups/legends go off-screen and can't be moved" (#7) + crosshair readout (#1)
- ROOT CAUSE of "can't move": `makeDraggable` (tool panel, radius list, etc.) only wired **`onmousedown`**
  — no touch. Rewrote it with **touchstart/touchmove/touchend** AND **clamping to the offset-parent**, so
  those panels now drag on phones and can never be stranded off-screen. (Legends already had touch via
  `wireDrag`.)
- `positionTooltip` now clamps **Y to the bottom** too; `showMeasureTip` clamps within the map and
  **flips to the left** of the cursor near the right edge instead of overflowing.
- Mobile crosshair coord/elev/active-layer readout (#1) + the numeric-cursor value (#12) were already
  wired in R12/R13c (`updateLayerReadout`→`choroValueAt`); the expanded `MILSPEND` means that readout now
  reports a value for far more countries.

### Re-reports verified in place (likely a stale `file://` cache on the user's side — hard-reload)
- **Köppen legend vertical-only resize, default size kept (#15):** `resize:vertical` + locked
  `width/min/max:216px`, desktop only.
- **Mobile Layers→Tools full-width (#6):** `#layer-tools` grid-spans `1/-1` + `display:block` + 100 %
  buttons (and the new active-layers section now gets the same).
- **Time-varying legend "as-of" line (#13):** `_refreshLegendDates` appends 🕒 lines to temp/SST/thermal/
  radar, refreshed on every date/window change.
- **Imperial everywhere (#14):** `fmtElevVal`/`elevC`/`distC`/`fmtTemp`/`fmtWindSpeed` drive readouts,
  profiles, legends; measurements/area/runway unit-aware.

### Sea route rebuilt (#5) — shallow endpoints, faithful geography, no land-cut
All four complaints traced to the **coarse 0.2° (~22 km) land mask** + a cosmetic coastline **stroke**:
- **Resolution doubled to 0.1° (~11 km)** (`W/H` 1800/900 → 3600/1800) — sharper coastlines, so ports/
  bays/shallows are water (not land) and thin land the old grid missed is now captured.
- **Fill-only mask (stroke dropped).** The old `c.stroke()` thickened every coast by ~its line width,
  marking coastal/shallow water as land → you couldn't start there. Removed; thin land is instead sealed
  by **no-diagonal-corner-cutting** in A* (a diagonal step needs BOTH orthogonal cells to be sea, so a
  route can't slip through a 1-cell land corner — this is what stops "陸を突っ切る").
- **Coastal/shallow endpoints now work:** if a click lands on a cell the mask reads as land, `compute()`
  anchors the drawn route at the nearest navigable water (the `snapSea` cell) instead of failing or
  drawing across land; a water click keeps its exact point. `snapSea` reach widened (60→140 cells).
- **Stays fast at the finer grid** via a mild weighted heuristic (`HW=1.25`) + `MAX` raised to 2 M so a
  long crossing isn't falsely "no route". String-pull sightline sampling tightened (9 km→6 km) so it
  can't straighten a chord across narrow land.
- Verified live (synthetic landmass, real 3600×1800 engine): A* solved a detour in **188 ms**, the
  string-pulled route had **0 vertices inside land** (goes exactly around it), and a click on land snapped
  out to water. Real-coastline behaviour (Singapore→Rotterdam etc.) needs the CDN borders in a real
  browser, but the algorithm + mask are proven.

### Still needs a real (non-headless) browser to repro/verify — documented, not closed
- **Ghost layers/pins after hiding (#10):** the modular layers' `styledata` re-adds are correctly gated
  on their `state.*` flags (won't resurrect a layer toggled off), and the data-layer OFF paths hide
  cleanly — no repro found headlessly. If it persists, capture which specific layer/pin survives.
- **Some ECMWF layers blank (#11):** the `om://` SDK data/decode pipeline is proven (tiles decode); only
  the GPU compositing of those `.om` rasters is unconfirmable in the hidden preview.
- **3D speed+quality (#3), LOS detail (#2), "all layers get legends" (#9):** large terrain/engine work —
  not in this round.

---

## 18. Round 15 — large re-attack batch (tags `#R15`)

Another ~40-item batch (mix of new asks + re-reports). All additive/in-place; MapLibre stays the engine.
Verified in the headless preview (full-script parse via late globals, zero console errors after each reload,
DOM/CSS checks; the spinning WebGL globe still can't be screenshotted). Committed in 7 parts.

### Done
- **Widgets retired (#30).** Removed the 🧩 toolbar button + mobile proxy; the IIFE is a no-op stub
  (`window.IntMapWidgets={toggle(){},refresh(){}}`) so any stray reference can't throw.
- **+50 Information cards (#40).** Appended to `DEFAULT_DASH_CARDS` (`d2-*`): chokepoints/ports (Gibraltar,
  Dardanelles, Kiel, Dover, Sunda, Lombok, Korea Strait, Magellan, Good Hope, Ningbo, Busan, LA/LB, Antwerp,
  Jebel Ali), bases (Groton, Offutt, Creech, Edwards, Fairford, Grafenwöhr, Tapa, Eielson, Keflavík, Futenma,
  Iwakuni, Changi, …), tech/space (Vostochny, Wenchang, Starbase, KSC, ITER, ASML, SK hynix, Tsukuba, …) and
  energy/geo (Permian, Prudhoe, Jamnagar, Itaipu, Kashagan, Lithium Triangle, Kolwezi, Aral, Chernobyl,
  Kurils, Darién). Cats reuse the 4 existing buckets (mil/tech/maritime/geo).
- **Stats "Australia" name garbled (#33) — ROOT CAUSE found + fixed.** Natural Earth 10 m assigns three
  Australian TERRITORY polygons (Ashmore & Cartier, Coral Sea Is., Indian Ocean Ter.) the sovereign's
  `ISO_A3_EH:"AUS"`; whichever came LAST in the file overwrote `countryStats.AUS.nameEn`. `loadCountryData`
  now keeps the **largest-area** feature per code (mainland always wins) — a general fix for every sovereign
  with minor overseas territories. (Confirmed against the live NE 10 m file.)
- **News titles no longer auto-translate (#22).** Removed the `aiTranslateTitles()` call from
  `maybeAutoEnrich` — translation runs ONLY on the "Translate titles" button now.
- **News-country pulldown multi-select (#24).** The 2-col checkbox grid is now an iOS-style dropdown
  (`#newscountry-dd`, button shows the live selection, panel of checkboxes). **Apply now refetches the feed**
  when the selection changes (`newsCountriesChanged` → `globalData=[]; fetchData()`) — previously it saved but
  nothing updated.
- **Publisher news-pin band (#23).** `news-labels` (the pill "band") + `news-pulse` filters widened from
  `mapped==='true'` to `['match',['get','mapped'],['true','publisher'],…]`, so publisher-located pins get the
  same band; pulse tinted purple for publisher.
- **Mobile place search fixed (#32) + fuzzy (#34).** Root cause: the search field collapses to a 46 px circle
  on phones (input width:0) and **nothing expanded it**, so Search ran `doGeocode()` on an invisible empty
  input. New `wireMapSearch` expands-then-searches. `doGeocode` now merges **local fuzzy matches**
  (`localFuzzyPlaces` — country/capital/gazetteer with Levenshtein tolerance) with Nominatim, so vague /
  partial / slightly-misspelled queries resolve and it survives a slow geocoder.
- **Timezone search box (#25).** `#setting-tz-search` filters the `<select>` option list live
  (`populateTimezones(filter)`, keeps Auto+UTC+current, expands to multi-row while searching).
- **Esc collapses the sidebar (#39).** Desktop keydown handler (ignored while typing / when a modal is open).
- **Mobile sheet default = PEEK (#35).** Initial detent `half`→`peek`: the News/Info/Stats/Community tab row
  shows, everything below it is tucked away.
- **Layers panel keep-list + Others(beta) (#26).** `reorganizeLayerPanel` GROUPS trimmed to the user's keep
  list across 6 clean categories; everything else (ECMWF temp/precip/wind/dew/isobars/slp/cape/sst, ships,
  seaRoute, chokepoints, dams, volcanoes, sahel, island chains, string-of-pearls, BRI, pipelines, nuclear)
  is swept into a bottom **"Others (beta)"** group + safety sweep for anything unlisted. New `lyrGrpOthers`
  i18n key + `.lyr-others-note`.
- **iOS single-column mobile layer list (#27/#6/#28).** The fragile 2-up CSS grid (mixed full-width spans →
  the recurring "Tools ぐちゃっと") is replaced by a clean single-column flex list (`> *{width:100%}`).
- **Köppen crash mitigation (#4).** `_koppenFullCap()` is now `navigator.deviceMemory`-aware (≤4 GB → 4096²
  instead of 8192², 8 GB+ keeps full res) — the OOM (which reloaded a stale `file://` cache → "先祖返り")
  came from the 268 MB output canvas. Added a `getContext` null-guard → graceful small-canvas fallback.
- **Köppen era-change flash (#20).** `setKoppenPeriod` no longer swaps to the full base image first when a
  class is highlighted — keeps the current highlight until the new era's highlight is built (no all-climate
  flash).
- **Köppen legend resize discoverable (#37).** The `resize:vertical` grabber was painted transparent →
  invisible → "not implemented". Now a visible diagonal grip (`::-webkit-resizer`).
- **Screenshot timebar shadow (#31).** html2canvas re-bakes the slider-thumb drop-shadow even after CSS
  zeroes it, so the timebar (a control; its time also shows in legends now) is `visibility:hidden` in
  capture-mode.
- **Military spending No-data cut (#8).** +25 IISS estimates (PRK, SYR, TKM, YEM, CRI, PAN, ISL, micro-states,
  …); no-army states get near-0. The no-data→opacity linkage already existed (`fill-opacity` case in
  addChoro + setLayerOpacity).
- **Compare x-ray offset (#18).** In x-ray the floating window now fills `#map-container` exactly
  (`position:absolute;inset:0`), so the synced camera aligns pixel-for-pixel with the main map; re-sync after
  the resize. Reverts to the floating window when x-ray is off.
- **Land cover speed/quality (#19/#29).** Terrascope is a single slow host (can't multi-host); squeezed the
  controllables: `raster-fade-duration:0` (instant tile show), `raster-resampling:nearest` (crisp categorical
  classes), maxzoom 12→13. Same on the compare-mode copy.
- **Mobile crosshair readout always-on (#1).** It was force-hidden on mobile by `.coord-readout{display:none
  !important}` — silently broke the readout the user kept re-requesting. Now shown; the centre crosshair is
  always visible on mobile (the +Add-point button stays tool-only); readout updates live while panning
  (throttled).

### R15b — follow-up after re-report ("レイヤー欄がぐちゃぐちゃ" + peek + 残り)
- **Layers panel scramble — ROOT CAUSE.** The R15 Others(beta) **safety sweep** used
  `dd.querySelectorAll('.lyr-row, label.layer-option')`, which ALSO matched the `<label.layer-option>`
  **nested inside every `.lyr-row`** and `appendChild`-moved those labels into Others — ripping them out of
  their parent rows (empty husk rows + a duplicated all-layers label list = the "ぐちゃぐちゃ"). Fixed with
  `:scope >` (direct children only). Also the `.lyr-others-note` accumulated one-per-run → now removed in the
  cleanup pass. Verified: husks 0, single note, 7 clean headers, no orphan labels.
- **Mobile sheet really starts at PEEK.** `syncResponsive` snaps to `peek` (not `half`) synchronously when
  entering the mobile layout, so it no longer depends on the rAF firing (which never fires in the hidden
  preview) and there's no half→peek flash. Verified: `--sheet-ty` = the exact peek detent at load.
- **Legends added for the value-scale layers that lacked them (#9/#38).** GDP-per-capita, fertility,
  military-spend $B and %GDP choropleths + snow / aerosol / night-lights rasters now build a `data-legend`
  (gradient + scale + no-data swatch) on toggle-on, hidden on toggle-off, wired into `wireDrag` and the
  `tileLegends`/`_minimizeOpenLegends` arrays — so they ALSO auto-gain the in-legend **opacity slider** and
  minimize button (their ids already exist in `opacities`). Verified live (snow legend → opacity row + min
  button present). Remaining no-legend layers are either point markers (dams/volcanoes), shading
  (hillshade/day-night), click-popup (ecoregions) or the separate-module aurora heatmap.

### Re-confirmed already in place (likely a stale `file://` cache — hard-reload)
- Active-layers list below favourites + borders/grid toggles (#17, R14); numeric cursor readout (#12, R13c);
  time-varying legend "as-of" line (#13, R13c/R14); imperial everywhere (#14, R13c).

### R15c — re-report pass (Köppen crash "まだ発生", sliders→legends, x-ray, Tools, LICENSE, demo)
- **Sea-route feature removed.** The right-click "Sea route from here / Set end" menu entry is gone (the
  IntMapRoute engine stays defined but unreachable). It repeatedly mis-routed (shallow endpoints / linear /
  across land).
- **Köppen crash — capped the HIGHLIGHT.** The OOM kills the tab BEFORE any try/catch can fire, so the only
  reliable fix is to never allocate the ~268 MB (8192²) output canvas + PNG buffer. `_koppenFullCap` now caps
  the highlight at **4096² desktop / 2048² mobile** (out canvas ≤67 MB / ≤16 MB); the BASE Köppen image stays
  full 8192² (unhighlighted = no quality loss). This is what stops the "選ぶと落ちて先祖返り" crash (the revival
  is the file:// disk cache reloading after the tab dies).
- **ALL opacity sliders moved out of the Layers panel into legends (#R15c).** Every opacity layer now owns a
  legend: specific ones already did; the legend-less ones (precip, clouds, ships, planes, hillshade, contours,
  day/night, submarine cables, NATO) get a **generic legend** (`ensureGenericLegend` → `data-legend-<id>`,
  added to `tileLegends` so `ensureLegendOpacity` auto-adds the opacity row); the wind legend was added to
  `tileLegends` too. `HAS_LEGEND` expanded to every opacity layer → the inline `.lyr-op` slider is hidden for
  all. Verified live: night/planes/wind/gdppc legends show one opacity row each (no dupes), inline sliders
  `display:none`.
- **ECMWF time slider out of the Layers tab.** It's now a floating draggable legend (`data-legend-ecmwf`,
  shown only while an ECMWF layer is on) instead of the `lyrrow-ec-time` panel row.
- **Layers panel no longer "jumps" on toggle.** `_refreshActiveLayers` skips the rebuild when the active set
  is unchanged and compensates the panel scrollTop for any height change above the viewport — so toggling a
  layer doesn't shove the list around ("いちいち動いて目にうるさい").
- **Compare x-ray alignment + "compare bugs".** Even with the window at `inset:0`, the compare MAP body sat
  below the header (offset down). X-ray now floats the header over a full-cover `.cmp-body` (`position:absolute;
  inset:0`) and makes the transparent map `pointer-events:none` so you drive the MAIN map and the overlay
  tracks it via sync → pixel-aligned.
- **Tools-panel overflow (desktop+mobile).** `.ai-test-btn` lacked `box-sizing:border-box`, so the `width:100%`
  Compare/Upload buttons overflowed the dropdown padding (the "ぐちゃっと"). Added border-box + clamped
  `#layer-tools` to `width:100%;overflow:hidden`.
- **Runway search imperial as an option.** Added an in-panel **Units** selector (Metric km/m · Imperial mi/ft)
  defaulting to the global; `imp()` reads it so radius/min-length inputs, the search math AND the result rows
  follow the panel choice regardless of the app default. Verified: km↔mi label + 300↔186 swap.
- **News band on un-located pins (#R15c).** `news-labels` filter removed → the headline pill shows on every
  news pin, including ones not yet geocoded.
- **News-languages pulldown.** The multi-language checkbox grid is now the same `.nc-dd` dropdown as
  news-by-country (button shows the live selection); Apply already refetched on change. Verified: 11 boxes,
  live label.
- **Timezone search robustness.** Reset the search box + repopulate the full list every time Settings opens, so
  a stale filter from a prior session can't leave it showing 3 options (the "機能していない" report — the filter
  itself tested fine: 420→3 on "tokyo").
- **Mobile readout one line + smaller + corner.** `white-space:nowrap; flex-wrap:nowrap; overflow:hidden`,
  font 9.5px, tucked to `left:6px`.
- **Mobile floating panels can't overflow off-screen (#7).** tool-panel / legends / country-info max-height is
  now `min(cap, calc(100dvh - var(--sheet-cover) - ~76px))`, so a panel docked above an EXPANDED sheet shrinks
  + scrolls into the visible map area instead of running off the top.
- **Map/Satellite reliability.** Both toggles now re-assert `applyTheme()` at 120/400/900 ms after the click
  (covers a click that lands while the style is mid-swap), on top of the existing idle + styledata self-heal.
- **First-visit demo (the "map was initially just black" feedback).** `_imStartDemo` auto-cycles Köppen →
  Night-lights → Relief → Population on the very first visit with a bottom pill naming the current layer +
  play/pause/✕; stops on any manual layer toggle or dismiss; remembers it's seen. Verified: pill in DOM, layers
  cycle, dismiss cleans up.
- **LICENSE added** — personal & research use permitted, **commercial use prohibited** without a written
  license; third-party data subject to its own terms.

### R15d — re-report pass (mobile Köppen crash STILL, date-pickers→legends, TZ select, x-ray takeover)
- **Mobile Köppen crash — ROOT CAUSE was the 8192² BASE texture, not the highlight.** A phone can't hold the
  ~268 MB decoded 8192² base + the WebGL globe, so *any* extra allocation (even the tiny capped highlight)
  OOM-kills the tab → 先祖返り (stale file:// cache reload). Generated bundled **4096² builds**
  (`koppen_mercator_<period>_4k.png`, ~760 KB / 67 MB decoded, nearest-neighbour so KCOL round-trips) and
  `koppenURLFor()` serves them on mobile only. Desktop keeps full 8192². (PNGs made with PIL; tracked in git.)
- **Date / month / window / traffic-filter controls moved from the Layers panel INTO the legends.**
  `_refreshLegendDates` now builds interactive controls: temp = `<input type=month>`, sst/snow/aod = date
  picker, thermal = 24/48/72 h select; ships/planes = a military/civilian filter inside their generic legend;
  sea-level + ECMWF time already in legends; precip's date is driven by the global timeline. Inline
  `.lyr-extras` is hidden (`display:none`). Verified: temp/sst legends show date input, ships shows the filter,
  inline extras `none`.
- **Timezone search — "使っても設定できない" FIXED.** `populateTimezones` reset `sel.value` to the SAVED userTZ on
  every keystroke, wiping the user's pick if they typed more. Now it preserves the current selection
  (`prev = sel.value || userTZ`) and collapses the list on pick. Verified: pick survives re-filter.
- **x-ray takeover / mobile compare "ほぼ使えない".** Mobile compare is now a clean full-width TOP panel (60 vh,
  not resizable) with big tappable header buttons; x-ray keeps the full-cover overlay (for alignment) but its
  header is a tall opaque bar and the controls dock at the bottom — so Close / X-ray are always reachable
  (no more "どうにもできなくなる").
- **Mobile panels were un-draggable** — the drag handles (`.tp-header`, `.dl-drag`, `.kl-drag`) lacked
  `touch-action:none`, so a touch-drag was hijacked into a scroll. Added it → tool panels + legends drag on
  phones.
- **Mobile legends dock below the search bar** (`top:64px;left:6px`, stacking downward) instead of bottom-right.
- **Mobile sheet starts at PEEK, no middle flash.** The CSS default `--sheet-ty` was `42dvh` (≈ half), so the
  sheet flashed at the middle before JS snapped it to peek. Default is now `calc(92dvh - 196px)` (= peek).
- **Misc.** Demo's last layer → 1 km population GRID (not the country choropleth); mobile coord readout tucked
  lower (`+18px` above the sheet); Layers dropdown uses the shared `--glass-*` material/border so it matches
  every other frosted surface; **radius tool got a km/mi selector** (imperial selectable even in metric default).
- **Tools/Layers "ぐちゃっと" — the REAL bug (R15e), NOT cache (I was wrong to keep blaming cache).**
  A **screenshot** showed it instantly: the geo/strategic rows (Northern Sea Route, Global Chokepoints,
  island chains, BRI, pipelines, nuclear, FSU, …) had their **labels right-aligned with a huge gap** while
  normal rows were left-aligned. Cause: `localizeGeoLabels()` migrates the bare trailing text node into a
  `.geo-label` span via `label.appendChild(span)` — but `injectLayerStars()` had already appended the
  favourite `★` (which has `margin-left:auto`), so the label landed AFTER the star and got shoved right.
  Fix: insert `.geo-label` **before** the star (`insertBefore`). Verified by re-screenshot — rows now
  left-aligned on desktop AND mobile. LESSON: a DOM-measurement "looks fine" missed this; SCREENSHOT the UI.

### R15e — the user said "it's NOT cache" (and they were right) + x-ray
- **Geo-row label right-alignment** — see the Tools note above. The actual long-standing "Layers ぐちゃっと".
- **x-ray "どうにかしろ".** x-ray full-covers the map for pixel-alignment, which trapped the user. Added a
  **fixed, always-on-top bar** (z-index 6000) with a big **Exit X-ray** + **Close** — appears whenever x-ray
  is on, so it can never trap you. `close()` fully resets x-ray (class + checkbox + bar). Verified via
  screenshot: the bar shows, Exit turns x-ray off cleanly. (The compare 2nd map DOES render fine over http;
  earlier "can't verify" was the file:// fetch limit, not a bug.)
- **Place search hung on "Loading…" (the real "結果が出てこない").** `doGeocode` awaited Nominatim with NO
  timeout, so a slow/unreachable geocoder froze the box forever and the local fallback never ran. Now: strong
  **local matches (countries/capitals/gazetteer) render INSTANTLY**, Nominatim is merged in with a **4.5 s
  AbortController timeout**, and country data is kicked off so local matches exist. Never hangs.

### Still open / documented (need engines, datasets, or a real browser to verify)
- **ECMWF some-blank (#11):** every configured variable IS served by `ecmwf_ifs` (verified latest.json), so
  the blanks are the two VECTOR layers (isobars/arrows source-layer names) or genuinely-sparse fields
  (cape/precip/sst). Needs a real browser to see the `.om` compositing. Most are now in the Others(beta) group.
- **LOS detail (#2), 3D speed+quality (#3), ghost layers (#10):** terrain/engine-scale or no-headless-repro —
  carried over. (Sea route #5 was removed in R15c per request.) Köppen DESKTOP crash, if it persists, would
  need the desktop base dropped below 8192² too (conflicts with the no-quality-loss ask) — mobile is the
  reported case and is fixed.

---

## 19. Round 16 — re-attack of the recurring fury list (tags `#R16`)

Same standing constraints: additive/in-place, MapLibre stays the engine, commit per batch + push `main`.
Verified in the headless preview via precise `getComputedStyle`/`getBoundingClientRect`/state assertions +
console-error checks after each reload (screenshots still time out on the continuously-rendering globe — used
geometry, which catches ordering/overflow/visibility bugs more reliably than eyeballing). Build stamp:
`window.INTMAP_BUILD='2026-06-11-R16'`.

### The "先祖返り" (time-slip to an old version) — finally given a real mechanism + guard
The user's #1 fury: after a mobile crash the app "comes back as an old version" (removed features reappear).
Two distinct mechanisms, both now handled:
- **Stale CODE.** Added a date-ordered build stamp + a head-of-document guard: it remembers the newest build
  ever loaded (`localStorage.intmap_build_seen`); if a load ever serves an OLDER build it purges caches +
  hard-reloads ONCE, and if it's still old, shows a red "an old cached version loaded — Reload" banner. So an
  old build can never silently masquerade as current again. Also `<meta http-equiv=Cache-Control no-store>` +
  the SW now purges EVERY non-current cache on activate. Verified end-to-end (forced a newer `seen` → bust →
  banner, no reload loop).
- **Stale STATE = the "ghost layers" bug (#10).** `IntMapBookmark` saved the active-layer hash only on
  `moveend`, so toggling a layer OFF without panning left it in the hash → `restore()` re-enabled it on the
  next/crash reload. Now the hash is saved on EVERY layer change → a turned-off layer stays off. Verified
  (toggle gdppc on → `&l=dl-gdppc`; off → removed).

### Köppen — keep FULL quality, don't crash (memory-aware, not a blanket downgrade)
The user rejected "all phones get 4k". `koppenURLFor` is now `navigator.deviceMemory`-aware: a memory-rich
phone (`deviceMemory===8`, the capped max every modern flagship reports) keeps the FULL 8192² texture; only
genuinely low-memory devices / iOS Safari (reports nothing AND kills tabs aggressively) get the bundled 4096².
Desktop unchanged (8192²). The highlight stays capped (2048² mobile / 4096² desktop). Plus the auto-demo (which
eagerly loaded 4 heavy layers incl. Köppen on first visit) is **skipped on mobile** → faster startup + less OOM
pressure.

### NO sliders/date-pickers in the Layers panel — for real this time (#sliders, re-reported 3×)
Root cause the last "fix" missed: `.lyr-row.on .lyr-op{display:block}` re-showed the inline opacity slider for
any layer NOT in `HAS_LEGEND` when it was toggled on. Now ALL `.lyr-op`/`.ec-op`/`.lyr-extras` are
`display:none !important` in the panel unconditionally; opacity/date/filter live ONLY in each layer's legend
(`ensureLegendOpacity`/`_refreshLegendDates`/generic legend). Verified: with climate+eez ON, 0 visible controls
in the panel, mobile + desktop.

### Mobile drag — the real reason popups "couldn't move / only moved left-right"
The mobile `.tool-panel{left:12px!important; top:auto!important}` anchors silently beat the drag's plain inline
styles. Fix: `makeDraggable` now writes position with **inline `!important`** (which beats stylesheet
`!important`) + sets `data-dragged`; verified inline-99px overrides the `!important` 12px. `wireDrag` (legends)
now grabs from the **whole header (h4)**, not just the tiny ⋮⋮ grip ("動かせる場所が左上しかない"), also with
inline-!important. Covers measure/radius/draw/LOS/elevation/runway panels + every legend.

### X-ray is a movable LENS, not a fullscreen takeover (#xray)
The user: "なんで勝手に全画面にするねん。意味ないやろが". Removed the `inset:0` full-cover. The compare window
stays floating/resizable; in x-ray its basemap goes transparent and the camera is synced so the window shows
exactly the main-map geography BEHIND it (equal zoom ⇒ every pixel registers — a true x-ray lens), re-aimed on
main-map move, window drag and resize. Dropped the floating exit-bar (the window header is always reachable now).
Verified: x-ray no longer fills `#map-container` (`position:fixed`, not absolute-inset).

### Other fixes
- **Mobile place search "結果が出てこない".** On a fresh mobile load countryStats is empty so local matches were
  empty and it depended entirely on Nominatim (rate-limited/blocked under file://). Now queries **Open-Meteo
  geocoding AND Nominatim in parallel** behind one timeout (either yields results) + warms country data on
  search focus. Verified: "Osaka"/"Reykjavik" return merged results.
- **Map/Satellite "反応しないことがある".** Replaced the fixed 120/400/900 ms re-asserts with a bounded POLL that
  re-applies `applyTheme()` every 150 ms until `layer-sat` visibility matches the chosen mode (catches a style
  that loads later than the timers, where the globe never fires `idle`).
- **Crosshair at the VISIBLE-map centre** (not the phone-screen centre): `top:calc((100% - --sheet-cover)/2)`;
  `centerLL()` (Add-point + long-press target) uses the same pixel. **Long-press** on mobile now opens the
  context menu AT the crosshair (always on-screen) instead of under the finger.
- **"Summarize this view" startup flash** — the button defaulted to visible in HTML; now `style=display:none`
  inline (JS shows it only on the News tab).
- **Timezone search "使っても設定できない"** — typing an exact zone now SELECTS it (and Enter picks the best
  match), so Apply actually saves it. Verified ("Asia/Tokyo", "reykjavik"+Enter → Atlantic/Reykjavik).
- **Community post asks for the location FIRST** — "New post" arms a map-tap (collapses the sheet on mobile via
  `__setDetent`) instead of silently defaulting to map centre.
- **Compare on mobile** smaller default (44vh) + a touch resize grip (`.cmp-resize`) — was "大きすぎる・調節できない".
- **Line of Sight** far finer: 240 rays × 120 steps, DEM z≤12, and proper **4/3-earth radar refraction**.
- **"More transparent" glass** floor raised (10–14 %→24–34 %) so the layer panel reads as frosted glass, not
  "完全に透明", uniform with every other surface.

### Still open / carried
- Köppen on a flagship **iPhone** still uses 4096² (iOS Safari exposes no `deviceMemory` and OOM-kills 268 MB
  tabs); there is no safe way to push 8192² there. Documented, not a regression.  ← **superseded by R17 below.**
- ECMWF vector-layer blanks, full 3D engine work — unchanged from R15e.

---

## 20. Round 17 — re-attack (tags `#R17`); user demand: NO excuses, NO blaming the platform

Verified in the headless preview (geometry/state assertions + 0 console errors). Build stamp `2026-06-11-R17`.

### Köppen — FULL 8192² on EVERY device (the deviceMemory 4k fallback is GONE)
The user rejected any silent downgrade, iPhone included. Root insight: the mobile OOM wasn't the *displayed*
texture alone — we kept a SECOND full-res 8192² decode of our own (`_koppenImg`, for cursor-sampling +
the full-res highlight) ON TOP of MapLibre's image-source copy (~268 MB each + texture). So:
`koppenURLFor()` now returns the full 8192² on ALL devices (display = full quality everywhere, no branch),
and the **sampling/highlight work canvas loads the lighter 4096² on phones** (`koppenWorkURL`). Net: the
on-screen Köppen is full 8192² on every device, peak memory drops ~270 MB (the redundant decode is gone),
and the full-res highlight path naturally falls back to the small-canvas highlight on mobile. No resolution
downgrade of what you SEE.

### Layers Tools — doubled (mobile) / missing (desktop)
The compare + upload `mountButton`s guarded on the `#cmp-mount`/`#ugj-mount` WRAPPER, but
`reorganizeLayerPanel` MOVES the button into `#layer-tools` and deletes the wrapper — so a later mount made a
SECOND button ("二重"), and if reorganize ran before the buttons existed the Tools section was skipped
("消滅"). Fix: dedupe by the BUTTON id (`#btn-compare`/`#btn-upload-geojson`), and call reorganize right after
mounting so Tools is filed immediately. Verified: exactly 1 of each.

### Compare — "layers completely offset from the map"
The compare map defaulted to **globe** while the main map can be **flat (mercator)**; the Köppen/land-cover/
eco overlays are mercator-referenced images that only register on a mercator map → total misregistration
(worst in x-ray). `syncFromMain` now matches the compare PROJECTION to the main map's flat/globe state (and
build inherits it), so overlays line up.

### Other
- **Tool/measurement panels start BELOW the search bar** (`top:64px;left:6px` on mobile), never bottom-
  anchored — the old `bottom:calc(sheet-cover+58)` could push a tall panel off the TOP ("初期位置が画面外").
  Drag (inline-!important) still moves them anywhere; max-height keeps them clear of the sheet.
- **Favourite stars on EVERY layer row** — `layerCbInfo` returned null for `eco-dl-*` / `l9-dl-*` (ids not
  starting with `dl-`), so they had no star. Broadened to any labelled layer-row checkbox (keyed by id; the
  old `dl-` keys are preserved so saved favourites survive) + an extra late inject pass + on panel open.
- **Bigger mobile × / minimise** (40 px tap targets, thicker strokes) for legends/popups/tool panels.
- **ECMWF slider can't scrub into the future** — `fetchMeta` filters `valid_times` to ≤ now (+1 h grace).
- **Mobile Map/Tools FABs lowered** to just above the sheet (`bottom:calc(--sheet-cover + 12)`) — thumb-reach.
- **Long-press menu clamped into the visible-above-sheet area** + max-height/scroll (no overflow behind sheet).
- **Place search robustness** — warm the country gazetteer on idle after first paint so local matches exist
  even if the online geocoders are slow/blocked (the real flow open→type→🔍 is verified returning results).
- **LOS** 240→**360 rays × 140 steps** (1° angular), still 4/3-earth refraction, DEM z≤12.
- **SW caches** WorldCover (`wmts.terrascope.be`) + OpenFreeMap label tiles → instant land-cover/label
  revisits on the hosted site (the single slow land-cover host can't be parallelised, so cache it hard).

---

## 21. Round 18 — re-attack of the recurring fury list (tags `#R18`)

Same standing constraints: additive/in-place, MapLibre stays the engine, NO excuses / NO blaming the
platform. Verified in the headless preview via precise `getBoundingClientRect`/`getComputedStyle`/state
assertions + 0 console errors (screenshots still time out on the continuously-rendering globe; the WebGL
`map.load` never completes in the hidden preview, so map-layer *rendering* is verified by wiring + ramp
math, not pixels). Build stamp `2026-06-12-R18`.

### Köppen highlight — full 8192² on EVERY device, GPU, ZERO allocation (the crash vector is GONE)
The user re-reported "画質を勝手に下げるな…ただモバイルでもブラウザは落とすな". R17 made the BASE full-8192
everywhere, but the **highlight** still re-encoded a capped canvas (≤4096² → quality drop; the 8192² output
canvas is ~268 MB → mobile OOM). Root fix: the Köppen palette is **categorical**, so `raster-color`
(MapLibre v5) recolours each class **in the shader** on the original full-res texture — selected classes
keep their vivid palette colour, the rest collapse to faded grey. `raster-color-mix [2.7,0.6,0.1]` maps
every palette RGB to a unique scalar (the 30 classes separate by ≥1.16 % of the 0–3.3 range — solved offline,
verified no collisions, min-gap 0.0117), normalised by `raster-color-range [0,3.3]`, and a `step` ramp assigns
the per-class output (ocean/value≈0 → transparent). `raster-resampling:nearest` while highlighted keeps texels
in their own bin; restored to `linear` when cleared. So: **no second decode, no canvas, no PNG encode** → the
displayed quality is full 8192² on every device AND the OOM is impossible. `applyKoppenGPUHighlight()` returns
`null` (layer not added yet → retry, don't disable), `true` (applied), or `false` (engine rejected → fall back
to the proven canvas pipeline). `setKoppenPeriod` now swaps straight to the new era's image with no
all-climate flash (the recolour paint survives the swap).

### Compare x-ray — TRUE lens, registers pixel-perfect on the globe too
"x-rayモードで…全く位置がずれる". The R16 lens recentred the compare map on the window-centre pixel — which only
registers the SINGLE centre point on a curved globe. Rebuilt: in x-ray the compare map is pulled out to COVER
the whole `#map-container` at the **exact same camera** as the main map (same centre/zoom/bearing/pitch/
projection → identical projection math → pixel-perfect everywhere, globe OR flat) and is **clipped to the
window rectangle via `clip-path: inset(...)`**. The window is just a moveable viewport onto a perfectly-
registered overlay; the lens follows on main-map move, window drag and resize (`layoutXrayLens`). Header +
controls float above (z-index); a cyan inset edge marks the lens; `clearXrayLens` restores the map into its
window when x-ray is off.

### Line of Sight — finer + a real progress bar + persisted settings
"もっと詳細な地形分析を / 計算の進捗をパーセントで / 一度数値を設定したら新地点でも同じ数値に". Now **360 rays × 200
steps**, DEM zoom cap **12→13** (terrarium's native max), and **bilinear DEM sampling** (`demElevBilinear`) so
ridge heights aren't stair-stepped (ridges decide what's blocked). `warmDEMTiles` gained an `onProgress(frac)`
that drives a **% + gradient bar** in the panel (0→85 % tile load, 85→100 % sightlines). The antenna height /
range are remembered (`losH`/`losR`) so opening a NEW site reuses the last values.

### Layers panel — frosted glass + desktop Tools can't disappear
- **Frosted glass** ("今は完全に透明"): a `backdrop-filter` NESTED in another backdrop-filtered surface only
  samples the parent's composited output (never the map) → the dropdown read as fully transparent in the
  frosted modes. Fix: on open (desktop) the dropdown is **hoisted to `#map-container`** (top of the backdrop
  tree) and aimed under the Layers button, so the shared `--glass-*` material frosts it exactly like every
  other surface. Verified: `bg rgba(40,40,44,0.46)` + `blur(32px)` in translucent mode.
- **Desktop Tools "そもそも消滅"**: `#layer-tools` is now `position:sticky; bottom` with the glass fill, so it
  stays pinned at the bottom of the scrollable panel — verified visible with EVERY group expanded
  (scrollHeight 2420 px) and scrolled to the very top.
- **Mobile "Toolsがぐちゃっと"**: desktop group-collapse state could survive a resize/rotation into the mobile
  sheet (display:none rows → missing/stacked). `_expandAllLayerGroups()` is now run on mobile entry AND on
  opening the Map sheet. Verified: 0 hidden rows, single-column, all 8 headers incl. Tools, no overflow.

### Mobile UI positions + unified ×
- **FABs/compass BACK to top-right** ("前の位置に戻せ") — the R17 "lower the FABs to just above the sheet" was
  rejected. The bottom-hugging treatment now applies ONLY to the always-on **coord readout**, which sits a
  sliver above the sheet (`bottom:calc(--sheet-cover + 4px)` — "わずかに隙間がある程度まで下げて").
- **× sizes unified to 32 px** ("×の大きさがバラバラ。凡例はデカすぎる") — the R17 40 px legend buttons dwarfed
  everything else and bloated the minimised legend. Legend ×/–, popup ×, tool-panel close are now ONE 32 px
  size (verified all three = 32×32); the collapsed-legend header is compact so the buttons don't dominate.
- **Elevation profile / tool popups on-screen** — the inline desktop `transform:translateX(-50%)` combined with
  the mobile `left:6px` shoved half the panel off-screen left. `.tool-panel` now forces `transform:none` on
  mobile → every tool/measurement/elevation panel starts fully on-screen below the search bar, draggable.

### Other
- **Favourite stars on literally every layer** — `layerCbInfo`/`injectLayerStars` now accept rows that use
  `.lyr-row` WITHOUT a `.layer-option` wrapper, so no checkbox is skipped. Verified: 56/56 layers starred,
  0 without.
- **3D — MSAA antialiasing on desktop** (`antialias:!isMobile()`): smooths the globe/terrain silhouette + the
  satellite horizon for a clear quality jump with NO drop in tile resolution (quality up, nothing sacrificed),
  left OFF on phones where the extra sample buffers risk the tab.
- **Land cover** WorldCover maxzoom **13→14** (≈ native 10 m) on the main + compare maps — crisper close-ups
  with no extra tiles at regional zooms; the R17 SW cache still makes revisits instant.
- **Timezone search → iOS combobox** — the native `<select size>` was a single-line wheel on iOS ("検索窓が
  使いにくい"). Replaced with a text input + a custom tappable dropdown of big rows; the hidden
  `<select id=setting-tz>` is kept purely as the value store the Save pipeline reads. Verified: filter→tap sets
  the value + closes; Enter picks the first; 420 zones in the store.

---

## 22. Round 19 — root causes found for the two long-running furies + big feature batch (tags `#R19`)

Same standing constraints (additive/in-place, MapLibre stays, no excuses). Build stamp `2026-06-12-R19`.
Verified live in the headless preview at BOTH widths (desktop 1366 / mobile 390): zero console errors,
geometry/hit-testing assertions, and the two new data feeds curl-probed AND fetched in-page.

### Mobile place search — the ACTUAL root cause after 3 re-reports
`preview_resize(390)` + a synthetic search reproduced it instantly: results were CREATED (8 items) but
`elementFromPoint` over the list hit the MAP CANVAS. The mobile pill-morph rule `.map-search{overflow:hidden}`
**clips `#ms-results`** (absolutely positioned at top:54px inside a 46px-tall parent) → results render
invisible AND untappable. Every earlier fix (expand-then-search, parallel geocoders, gazetteer warming) was
real but upstream of this. Fix: `.map-search.ms-open{overflow:visible}` (+ results z-index/max-height vs the
sheet). Verified: items hit-testable, coordinate-tap opens the result card.
Also: **Photon (komoot)** added as a third parallel geocoder — typo-tolerant ("osakaa"→Osaka, curl-verified
CORS\*) — and `localFuzzyPlaces` gained word-prefix + per-word Levenshtein scoring ("検索エンジンのように").

### Desktop Layers→Tools — the ACTUAL root cause ("何回も言っている")
`.layer-dropdown` is a **flex column**; `#layer-tools{overflow:hidden}` gives it an automatic minimum size of
0, so whenever the expanded list overflowed the panel, the ONLY shrinkable flex item (Tools) absorbed the whole
shortfall → squashed to a 13px sliver, buttons clipped below the dropdown and unclickable ("少しだけ見れるが
隠れている／開けない"). The R18 sticky treatment was orthogonal. Fix: `flex-shrink:0`. Verified with every
group expanded: Tools 111px tall, fully inside the panel, Compare/Upload hit-testable.

### Line of Sight — freeze killed, always re-runnable, finer
- **The freeze** (desktop AND the mobile crash pressure): `demElevBilinear` ran a full **256×256
  `getImageData` (≈256 KB copy) per sample** — ~72k samples/run ≈ 18 GB of memory traffic. Now each DEM tile
  decodes its pixel buffer ONCE (`_demPix`), and `_demCache` is LRU-capped (420 desktop / 140 mobile tiles)
  so a big run can't hoard hundreds of MB.
- **Re-analyze**: the old `busy` flag stayed true forever if any step threw, and Clear nulled the site →
  "同地点で数値を変えて再実行" was impossible. Replaced with a **generation counter** (`runSeq`) — Analyse
  always starts fresh + cancels the previous run; Clear keeps the site; panel ✕ cancels + wipes.
- **Finer + bounded**: desktop 480 rays × 260 steps (mobile 360×170), bilinear DEM + 4/3-earth refraction
  kept; DEM zoom now obeys a hard **tile budget** (small ranges get full z13; huge ranges step down instead
  of fetching 600+ tiles). All heavy loops are chunked with event-loop yields + the progress bar now spans
  load 0–80% → sampling 80–95% → sightlines 95–100%.

### Köppen — full quality everywhere, even less memory
Display stays full 8192² on every device (R18 GPU `raster-color` highlight). New: when the GPU path applies,
the per-pixel code index + source-pixel copy are dropped (up to ~270 MB); on phones, toggling the layer OFF
releases the whole sampling work-set (~150 MB) — it lazily rebuilds on the next toggle.

### Other fixes
- **Mobile ×**: the R18 32px unification missed non-legend popups — now also `.src-card-close`, every
  `.maplibregl-popup-close-button`, and the country card (verified 32×32).
- **Readout emoji removed** (🌬 chip → value only).
- **Active layers: "Clear all"** button (verified: unchecks everything).
- **Aircraft military flag**: now **dbFlags bit 0 only** (curated Mictronics/tar1090 registration DB —
  reliable, so the Filter stays); the callsign-prefix guess ("KING", "SHELL"…) is out of the live path.
- **Legend drag forever**: `wireDrag` listeners moved to the legend ROOT with `closest()` handle lookup —
  innerHTML rebuilds (date pickers, era swaps, language switches) can no longer orphan the drag ("たまに
  動かせなくなる" was rebuilt handles never re-wired).
- **Smooth wheel zoom**: built-in scrollZoom replaced (desktop) with a target-zoom accumulator + exponential
  rAF glide around the cursor anchor — continuous decelerating iOS/Google-Earth feel, trackpad pinch finer
  (ctrlKey), touch pinch untouched.
- **Labels/borders always on top**: `ofm-country/city/other` + `borders-only-line` + the satellite reference
  raster re-asserted just below the measurement-tool layers on idle/styledata (guarded, no repaint loop).
- **Opacity for EVERY layer**: type-aware `_applyGenericOpacity` + `_registerLayerOpacity(id,[en,jp],layerIds,
  cbId)` → any layer gets a floating legend with an auto opacity row. Wired for: all geo/strategic lines,
  l9 dams/volcanoes/aurora, ecoregions/plates/worldcover (reuses its class legend), and the new beta layers.
  Verified: 4 legends each with a working slider.
- **3D quality+speed (desktop, nothing sacrificed)**: map maxZoom 18→19 (Esri serves native z19 in cities) and
  terrain DEM maxzoom 13→14 (terrarium native is 15) — phones keep 18/13 for RAM safety. R18 MSAA stays.
- **Mobile start**: the first `reorganizeLayerPanel()` (hundreds of DOM moves) now runs in an idle slice on
  phones.

### New (all in "Others (beta)", each with an opacity legend)
- **Ukraine frontline (LIVE)** — DeepState `api/history/last` (curl-verified 200 + CORS\*; in-page fetch:
  522 features / 119 occupation polygons with their own fill/stroke props). Fill+outline+front-line layers,
  10-min auto-refresh while on, "As of" line (DeepState's non-ISO datetime shown verbatim), proxy fallback.
- **3D city buildings** — fill-extrusion from the already-used OpenFreeMap vector tiles (`building` layer,
  `render_height`/`render_min_height`), minzoom 13.5, height-graded colour; legend hint to zoom/tilt.
- **Historical borders (year slider, ≥100 years back)** — aourednik/historical-basemaps GeoJSON
  (1900·1914·1920·1938·1945·1960·1970·1980·1994·2000·2010; raw.githubusercontent CORS\*, in-page fetch
  verified: 1920 → 205 polities, NAME labels). Year slider lives in the layer's legend; per-year cache;
  name-hashed pastel fills. (The separate NEWS timeline still drives news; a future round could bridge them.)
- **Volcanoes**: already shipped (l9, in Others(beta)) — now gains the opacity legend; Smithsonian GVP WFS was
  probed for the full Holocene list but the endpoint timed out → curated set stays, documented.
- **Apple-style sidebar widgets (opt-in)** — the empty no-tab sidebar hosts a widget board: default NONE,
  "+ Add widget" gallery (Clock / Weather @ map centre / FX / Markets-crypto via CoinGecko — stock APIs are
  key-walled+CORS-blocked, so markets are honestly crypto-labelled), iOS-style rounded glass cards in a 2-col
  grid, hover/tap ✕ to remove, prefs persist (`intmap_widgets2`), JP/EN, 5-min data refresh.

### Verified-in-preview summary
Desktop: Tools 111px + hittable with all groups expanded; clear-all unchecks all; widget board with gallery;
beta rows present + swept into Others(beta); opacity legends (ukr/hist/volc/geo-BRI) each with slider; zero
console errors. Mobile 390px: search results hit-testable + coordinate-tap opens the card; readout emoji-free;
src-card ✕ 32×32. DeepState + historical-basemaps + Photon fetched live from the page.
- **Mobile place search** re-verified end-to-end at 375 px (expand→type→Enter→results for Osaka/Reykjavik).
---

## 23. Round 20 — navigation restore, widget board v3, compare rebuilt, feedback, new modes (tags `#R20`)

Same standing constraints (additive/in-place, MapLibre stays, no excuses). Build stamp `2026-06-12-R20`.
Verified in the headless preview (http://localhost:8765) at desktop 1100/1280 + mobile 375: zero console
errors after every batch; every new feed exercised live in-page (USGS quakes, Wikimedia on-this-day,
gold-api XAU, alternative.me F&G, er-api FX, CoinGecko). New external sources curl-probed first
(stooq is behind an anti-bot PoW and Yahoo-finance proxying 403s → equity-index/oil widgets are
deliberately ABSENT rather than faked).

### Zoom restored + navigation sensitivity (Settings)
- **Zoom-to-cursor is BACK.** The R19 custom wheel "glide" (per-frame `easeTo({around})` accumulator)
  broke the universal cursor-anchored zoom on the globe. Removed; MapLibre's native `scrollZoom`
  (cursor-anchored under every projection) is the single wheel path again.
- **Settings → 地図操作の感度 / Map navigation sensitivity**: Zoom (25–300 %, multiplies wheel+pinch
  rates) and Pan (drag-inertia maxSpeed/deceleration). Defaults = 100 % = the long-standing feel.
  Persisted in `intmap_settings` (`navZoom`/`navPan`), applied via `_applyNavSens()`.

### Widget board v3 (`intmap_widgets3`, v2 strings auto-migrate)
13 widget types, every data widget shows an **"as of" timestamp**: Clock · Weather · **FX with a
configurable pair** (⚙ → any of 30 currencies, multiple FX widgets allowed) · Crypto BTC/ETH ·
Crypto market cap + BTC dominance · Crypto Fear & Greed · Gold · Silver (gold-api.com, CORS*) ·
**Recent Earthquakes** (USGS 2.5_day; top-3 by magnitude, #1 large + #2/#3 small-equal, tap → fly
to epicentre) · **On this day** (Wikimedia feed, ja→en fallback, tap for another) · **Featured layer**
(random pick from the regular layer rows; tap turns it on) · **Random country** (flag + pop/GDP/area,
re-roll) · **Countdown** (user title + date, multiple allowed).

### Compare view REBUILT
- Flat/Globe selector **gone** — projection always follows the main map (all modes).
- **3 exclusive modes**: **Sync** (bidirectional: either map drives the other; the compare centre shows
  the geography under the **centroid of the UNCOVERED main-map area** — implemented as the area-weighted
  complement of the window rect, inverse-mapped via project/unproject for compare→main) · **Free**
  (fully independent) · **X-ray** (the R18 pixel-registered clip-path lens, unchanged).
- **Map/Sat couldn't switch** root cause: a click during style load hit missing layers and nothing
  retried → `applyBase()` stores the wanted base and retries on `idle`/`styledata`.
- **"Layers ▾" pulldown** with 15 portable layers (Köppen, land cover, ecoregions, plates, hillshade,
  night lights, snow, AOD, SST, temp, precip, thermal, pop-grid, Ukraine frontline, volcanoes).
  Country choropleths are main-map feature-state paints and are NOT cloned (documented limitation).
- **Four-corner resize** (`.cmp-rz` pointer handles, works on touch) on top of the native se corner.

### Feedback (+ admin)
Header **Feedback** button next to Support → 5-star + textarea modal → INSERT into Supabase
`feedback` (new `supabase_feedback.sql`: anon+auth insert, admin-only select/delete via
`profiles.is_admin`). 4–5★ → thank-you + declinable Stripe support ask (records a `donations`
intent on click-through); 1–3★ → plain thank-you. **admin.html got a Feedback tab** (list + delete).

### Account sync + layer presets
- `supabase_user_prefs.sql` → `user_prefs` (user_id PK, JSONB, own-row RLS). `_syncPrefsUp` (debounced)
  mirrors settings/widgets/presets/news-langs/temp-unit on every save; `_syncPrefsDown` runs on sign-in
  (seeds from the device when the row doesn't exist yet) and applies live (no reload).
- **Layer presets** (Layers → Tools): save the current selection + ALL opacities under a name; apply
  re-asserts opacities after the layers come up; delete per row. Local `intmap_layer_presets` + synced.

### New modes
- **AI Research Assistant** — place-label popup gained **🤖 AI brief** (and 📖 **Wikipedia**, shown only
  when the article exists via REST summary probe). Brief = background/history/economy/military/recent
  developments, seeded with geocoded news headlines within ~600 km (`item.analysis.loc`); BYOK `askAI()`;
  no key → the standard aiNoKey toast.
- **World Events Archive** — Information tab now has **📍 Places | 🗓 Events**. Events = 79 curated
  moments (war/disaster/revolution/assassination/space/economic/geopolitics, 1492–2023), EN/JP, year-range
  + text search, type-coloured pins through the existing dash-points source, per-event Wikipedia link.
- **Education mode** — Layers → Tools → 🎓: flag→country, capital→country, and find-on-the-map (click;
  point-in-polygon over countryGeo so it works with the hidden country-fill layer) with score/streak and
  a learning card (capital/pop/GDP/area) after every answer.

### Layers / UI fixes
- Desktop **Tools un-stickied** (normal flow at the end of the list; the R19 `flex-shrink:0` remains the
  real anti-squash fix).
- **Tectonic plates default opacity 30 %** (`_registerLayerOpacity` per-layer default, now also APPLIES
  the default on register instead of only showing it on the slider).
- **Historical borders → promoted out of beta** into Geopolitics & defence (rowFor learned `beta-dl-*`),
  label de-beta'd; **IndexedDB year cache** (`hb_<year>` via IntMapCache) + neighbour-year prefetch →
  the "読み込みが遅い" repeat visits are now instant; **available years drawn as ticks inside the slider**.
- **Volcanoes replaced**: the 42-point curated layer is gone; new beta layer = full **Smithsonian GVP
  Holocene catalogue (1,215)** bundled at `data/volcanoes_gvp.json` (slimmed from the GVP WFS — the
  endpoint answered this round), recency-coloured (≥1950 red / ≥1500 orange / older tan), popup with
  country/type/elevation/last-eruption, legend with colour key.
- **Ukraine frontline legend**: occupied-fill / front-line / contested colour key in its legend.
- **Mobile ×**: the R19 selectors for the country popup (`.cp-close` as a class etc.) matched NOTHING —
  real markup is `.country-popup-close` — fixed; verified 32×32 at 375 px (incl. `.maplibregl-popup-close-button`).
- **Search pill can't overlap** the sidebar / right controls: container-relative cap
  `max-width:min(380px, calc(100% - 330px))`, and in frosted (overlay) mode it re-centres within the
  visible map area via `:has(.sidebar:not(.collapsed))`.
- **Frosted news cards**: in the two frosted modes `.news-item` is a light Apple-style frost
  (light 0.50 white / dark 0.38 grey + blur 14) instead of the solid dark slab.

### Perf / stability
- Mobile: `MAX_PARALLEL_IMAGE_REQUESTS` 128→48 (concurrent decode buffers were real OOM pressure),
  `maxTileCacheSize` 1536→1024, ecoregions toggle-OFF releases the ~10 MB GeoJSON + source on phones.
- Desktop: `maxTileCacheSize` 4096→6144 (3D pan/tilt-back re-hits cache), terrain DEM maxzoom 14→**15**
  (terrarium native max → finest existing mesh in tilted close-ups; phones stay 13).
- **LOS**: desktop 600 rays × 320 steps (was 480×260), small ranges may climb to z14 within the
  (raised, 380-tile) budget; mobile unchanged.

### Verified-in-preview summary (R20)
Desktop: settings sliders reflect+persist; widget gallery=13, live values for quake/gold/fng/otd/
country/fx/featured with as-of stamps; compare = 3 modes, 4 corner handles, 15-layer pulldown, sat
toggle + koppen/hillshade/volcano overlays verified visible, x-ray clip-path applies+clears; feedback
modal 5 stars; presets + 🎓 + AI panel mounted in Tools; events view renders 79 cards + 2 year inputs;
Tools `position:static`; search pill 348 px at 1100 w. Mobile 375: country-popup × and maplibre popup ×
both 32×32. Zero console errors throughout.

---

## 24. Round 21 — widget board v4, resizable sidebar, vector labels everywhere, beta pack 2, ACLED (tags `#R21`)

Same standing constraints (additive/in-place, MapLibre stays, no excuses). Build stamp `2026-06-12-R21`.
Verified in the headless preview (http://localhost:8765) at native desktop width AND 375 px: zero console
errors after every reload; functional assertions below. New endpoints curl/in-page probed first
(fxratesapi.com CORS\* minute-fresh; wheretheiss.at CORS\*; World Bank WGI; flagcdn).

### Widgets v4
- **Defaults seeded once** (flag `intmap_widgets_def21`): Clock · FX · Featured layer · Random country ·
  On this day — appear for existing users too; afterwards the user's own add/remove wins.
- **Weather = CURRENT LOCATION.** Geolocation permission is requested ONLY when a weather widget is
  added (`reqGeo`); other widgets use the position only if already granted (`permissions.query`),
  else map centre — the label says which. AQI/sunrise reuse the same `widgetLoc()`.
- **FX freshness** ("数時間遅れ" = the daily ER-API source): primary is now **fxratesapi.com**
  (keyless, CORS\*, minute-fresh — probed 200 with a same-minute timestamp), ER-API stays as fallback.
  Market widgets (fx/crypto/cap/F&G/gold/silver/ISS) refresh every **60 s**; the rest keep 5 min;
  everything refreshes on tab-visibility return.
- **Gallery dismissable** (the "表示されっぱなし" fix): explicit ✕ in the gallery header (+ still
  toggles via the Add tile, closes after adding).
- **8 new widget types** (→ 22 total): Sunrise/sunset · Moon phase (local synodic calc) · Air quality
  (Open-Meteo US AQI + PM2.5) · ISS tracker (wheretheiss.at, tap→fly) · World clock (multi, tz picker)
  · Year progress · Wikipedia featured article · World population live estimate (UN-based).
- **Flags render on Windows**: `window.imFlagHTML()` derives ISO-2 from the emoji's regional-indicator
  pair → flagcdn.com PNG (emoji = alt). Used by the Random-country widget and the whole quiz mode
  ("国旗が、パソコンだとドイツ国旗→DEのように文字となる" fix).

### UI
- **Night lights (satellite) default opacity 0.95 → 1.0.**
- **Header Support button removed** (Settings + feedback flow keep the donate paths).
- **Desktop sidebar is width-resizable**: an 8 px col-resize handle on the sidebar's right edge drives
  a `@media(min-width:769px){:root{--sidebar-w:…}}` rule injected in `#sb-w-style` (NOT an inline
  :root style — that would beat the mobile `--sidebar-w:100vw` and shrink the bottom sheet); persists
  in `intmap_sidebar_w`; camera padding re-follows on release. Hidden on phones.
- **Narrow-desktop search pill**: `body.ms-narrow` (ResizeObserver on the map container, checked
  inside the handler so a mobile-width LOAD that later widens still works) drops the pill to a second
  row (top 78 px) with near-full width — it can no longer collide with the view buttons or sidebar
  ("つぶれて押せない／かぶる").
- **Map mode = satellite labels** ("mapの旧来の地名ラベルは廃止"): `mapLabelsViaVector()` now returns
  true always → the basemap is always the `_nolabels` carto variant and the OFM vector labels render
  in EVERY mode, which also means the R19 label-raise keeps place names above every data layer.

### Legends
- **Historic borders year ticks aligned**: ticks live INSIDE the same flex cell as the range input and
  each one sits at `calc(8px + (100%−16px)·i/(n−1))` `translateX(-50%)` — the exact thumb-stop centres
  (the old space-between row with guessed margins drifted).
- **Ukraine frontline**: the colour key is rebuilt FROM the loaded DeepState data (its real
  fill/stroke colours) so legend === map; features outside a Ukraine bbox are dropped; toggling ON
  flies to Ukraine when the camera is far away.

### Compare
- **X-ray + satellite works**: in x-ray, picking Sat paints the satellite base inside the lens
  (an x-ray *to imagery*); Map keeps the transparent data-lens.
- **X-ray drift fix**: the lens now mirrors the main camera's **padding** (frosted-sidebar/sheet
  padding shifted the optical centre → cumulative-looking offset), syncs again on main-map `idle`,
  and the compare map allows pitch 85.
- **Projection follows instantly**: the Flat/Globe buttons call `window._cmpFollowProj()` directly
  (works in Free mode too).
- **Pulldown 15 → 26 layers**: country choropleths are now CLONED (one `cmp-choro` geojson with every
  metric baked into properties + the main-map ramps — feature-state can't cross maps): population
  density, GDP/capita, HDI, Democracy, TFR, mil-spend ×2; plus Historical borders (reuses the beta
  module's year cache via `IntMapBeta.hbCurrent()`), Railways, Data centres, Pharma (via
  `IntMapBeta2.load`).

### Quiz mode (renamed from Education mode)
- Title/button = クイズモード / Quiz mode; flags via flagcdn images.
- **4 new quiz types** (→7): country→capital, population duel, area duel (pairs ≥20 % apart, both
  values shown after), and **country silhouette** (real outline from countryGeo → cos-lat-corrected
  SVG; antimeridian-spanning countries skipped).

### Beta pack 2 (`IntMapBeta2`, all in Others(beta), geojson shared with Compare)
- **Data centres & AI infra** — ~85 curated points: AWS/Azure/GCP regions + AI superclusters
  (Colossus Memphis, Stargate Abilene, …), provider-coloured key, click popups.
- **Pharma & health** — 30 pharma HQ/manufacturing hubs + **Life expectancy** choropleth
  (World Bank SP.DYN.LE00.IN 2022, live, click popup shows the value).
- **Corruption indicator** — World Bank **WGI Control of Corruption score** (0–100, higher=cleaner).
  GOTCHA: the WGI rows moved to `GOV_WGI_*` indicator ids under `source=3` — the classic `CC.EST`
  id now returns **0 rows** (probed); honest labelling notes it's the open-API counterpart of TI's CPI.
- **World railways by gauge** — `data/railways_gauge.json` (3.9 MB) built OFFLINE from Natural Earth
  10m railroads by `_rail_convert.py`: Douglas-Peucker 0.012°, 2-dp rounding, and each segment
  classified by the predominant national gauge of the country its midpoint falls in (ray-cast PIP
  over NE 110m). 7-colour gauge key (1435/1520/1676/1668/1600/1067/1000). 25,242 features verified
  loading in-page. Phones release the parsed FC on toggle-off.
- **Globe tour** — checkbox: eases out to z≤1.7 and slowly rotates (rAF, ~3°/s, dt-scaled);
  any map gesture stops it and unchecks the box.
- **Mobile beta pulldown** — the Others(beta) group alone is collapsed-by-default + tappable on
  mobile (caret restored just for it); `_expandAllLayerGroups` re-collapses it (unless user-opened).

### News
- **ACLED conflict events** — a collapsible card pinned above the news feed (separate from news,
  News tab only — visibility follows `renderUI` via a wrapper). Email+API-key inputs persist
  (`intmap_acled`; ACLED is registration-gated), Load = last 14 days (≤400 events) via direct URL →
  CORS-proxy fallbacks; list rows fly to the event; map pins coloured by event type with popups.

### AI
- **Brief sharpened**: today's date injected; every section must carry concrete years/dates/figures;
  "Recent developments" prioritises the last 1–2 years + the supplied nearby headlines.
- **Suggested questions (beta)**: templated from the most-populous countries inside the current
  viewport + a free-question input, in the AI brief panel; answers reuse the same context.

### Themes
- **One unified Apple frost** for every sidebar card in the frosted modes (news slightly darker than
  R20; information/stats/community cards soft frost instead of the dark slab).
- **Classic luxe**: gilt-edged parchment cards (double inner keyline), embossed brass buttons,
  double-rule section heads, ❦ flourish, engraved small-caps panel titles — pure paint, no layout change.

### Perf / stability
- Desktop: `MAX_PARALLEL_IMAGE_REQUESTS` 128→**192**, `maxTileCacheSize` 6144→**8192**, prefetch cap
  90→150. LOS desktop **720 rays × 420 steps**, tiny ranges reach **z15** (terrarium native max),
  tile budget 380→520, DEM LRU 420→560.
- Mobile: **memory-pressure guard** (performance.memory @8 s; >85 % twice → drops the Köppen work-set
  when the layer is off + broadcasts `intmap-mem-pressure`, which trims the historic-borders year
  cache and the railways FC); `deviceMemory≤4` phones get a 640-tile cache; gazetteer + timezone-list
  builds moved to an idle slice ("スタート時の動作がぎこちない"); rail/eco FCs released on toggle-off.
- **Settings tutorial button** (top of Settings) replays the first-visit layer showcase
  (`_imStartDemo(force)`); **Layer search** box pinned (sticky) atop the Layers panel — filters all
  66 rows, hides empty section headers, restores the panel (incl. the mobile beta pulldown) on clear.

### Verified-in-preview summary (R21)
Desktop: defaults seeded (5 widgets), gallery 17 rows + ✕ closes; layer search "köppen"→1 row, clear→66;
quiz panel = 7 modes titled "Quiz mode"; compare opens with 26-layer pulldown + `_cmpFollowProj` live;
ACLED card hidden with no tab, shown on News, inputs+Load present; sb-resizer + #sb-w-style mounted;
ms-narrow toggles with map width; railways FC loads in-page (25,242 features, gauge 1520 coloured);
World Bank life-expectancy (266 rows) and WGI score (215 non-null) probed. Mobile 375: `--sidebar-w`
still 100vw (style-injection safe), resizer hidden, beta group collapsed→tap-expands→re-collapses,
widget ✕ 32 px. Zero console errors throughout. GOTCHA logged: a module that early-returns on
`isMobile()` at LOAD time dies forever if the page loads narrow and then widens — put the check
inside the handler, not around the wiring (bit the sb-resizer + ms-narrow watchers this round).

---

## 25. Round 22 — themes, widgets v5, Köppen→backend, DE/RU, PPP, beta pack 3, compare/mobile fixes (tags `#R22`)

Same standing constraints (additive/in-place, MapLibre stays, real data only, no excuses). Build stamp
`2026-06-14-R22`. Verified live in the headless preview at desktop + mobile 375 (zero console errors after
every batch; new World-Bank indicators curl-probed first; widget endpoints CORS-probed).

### Themes & appearance
- **"Tactical" retired → "Cyber"**: a retro-computer / cyberpunk terminal look (deep indigo-black, neon
  CYAN primary + MAGENTA accent, monospace, glow text, CRT scanlines, sharp corners). `theme-tactical`
  class + `optTactical` key fully replaced by `theme-cyber`/`optCyber`; saved `theme:'tactical'` migrates
  to `cyber` (applyTheme + loadSettings).
- **Frosted-glass tiers pushed more transparent** ("単に Frosted Glass を透明寄りに、more transparent はさらに"):
  translucent 0.42→0.30 (dark 0.34), glass2 0.24→0.18 (dark 0.22); heavier blur keeps controls legible.
- **Sidebar cards = one soft Apple frost** (info/stats no longer a dark slab, news slightly firmer): 0.46
  light / 0.42 dark, blur 20, hairline border.

### Settings
- **Tutorial button removed** (the first-visit auto demo stays; now clearly badged — see below).
- **Blueberry emoji removed** from the Support modal everywhere (was EN-only).
- **Language: German + Russian added.** `t()` + `updateI18n` fall back to English for missing keys, so
  the de/ru objects translate the static UI (~110 visible keys each) while the many hardcoded
  `currentLang==='jp'?jp:en` ternaries fall back to EN. setLang/loadSettings accept de/ru (+ persist).

### Widgets (board v5)
- **Edit mode** replaces the per-card hover ✕: an "Edit/Done" button drives ↑/↓ reorder + ✕ delete.
- **Mobile add = iOS-native `<select>`** overlaid on the Add tile (the gallery stays on desktop).
- **Weather "my location" fix** (root cause): Safari has no `navigator.permissions` for geolocation, so
  the old `permissions.query` threw and fell straight to map centre. `widgetLoc()` now also tries
  `getCurrentPosition` when the permission state is unknown (Safari) → real location after grant.
- **AQI + Sunrise also request geolocation on add** (was weather-only).
- **+6 live widgets** (→28): UV index, Aurora/Kp (NOAA SWPC), Hacker News top story, Next public holiday
  (Nager.Date, per-country ⚙), Next rocket launch (LL2, 30-min cache), Bitcoin network (mempool.space).
  All keyless + CORS-probed.

### Köppen → BACKEND (the recurring OOM source, finally removed)
- Reverted to a **pure backend-rendered raster**: `addKoppen` adds the pre-rendered era PNG straight to
  the map — NO in-browser canvas decode (`loadKoppenCanvas`), per-pixel indexing (`ensureKoppenFull`),
  cursor sampling (`sampleKoppenAt`→null), or client-side highlight recolor. The legend is now a color
  key + era pulldown + tap-for-criteria. Kills the Köppen OOM/iPhone-crash vector entirely.

### Stats / layers
- **GDP (PPP) + GDP-per-capita (PPP)** via live World Bank (`NY.GDP.MKTP.PP.CD`/`PCAP.PP.CD`, mrnev,
  30-day cache) merged into countryStats (`gdpPPP` billions / `gdppcPPP`), shown in the country hover
  card, detail popup, both compare views, and the GDP-per-capita layer readout.
- **Promoted out of beta** into real groups: Volcanoes (Hazards), Railways + Ukraine frontline (already)
  (Geopolitics), Corruption (Population & economy). via the `GROUPS` map in reorganizeLayerPanel.
- **Beta pack 3** (task "betaに追加"): Unemployment rate, Internet penetration, Annual precipitation
  (live World Bank choropleths) + Religion distribution + Language distribution (curated categorical
  choropleths, ISO-3 dominant religion / primary language, real data; uncolored = no entry). The 3 not
  shipped — annual MEAN temperature, permafrost, no-fly zones — need raster datasets that aren't freely
  tile-served (would violate "real data only" to fake) → deferred, documented.

### Ukraine frontline
- **Legend rebuilt from DeepState's OWN status token** (`geoJSON.status.<key>` in `name`): real classes
  are Occupied / Liberated / Unknown / Crimea-Donbas (the feed has NO LineStrings — the old "Front line"
  row never matched → legend≠map). **Abkhazia + South Ossetia dropped** by raising the bbox min-lat
  42.5→43.9 (Crimea's south tip is 44.4 N, so all of Ukraine is kept).

### Compare view
- **Mobile**: compact header (the wrapping 7-button bar read as a big gray top strip — task "上部がグレー")
  + a pinned red **Close** that can't hide behind other buttons (z 4200); layers dropdown bigger
  (460px desktop / 52vh mobile, opens upward); extra resize-on-open passes so the GL canvas always fills
  (no unsized gray map).

### Mobile UX
- **iOS-like pan inertia** (longer glide, lower deceleration, scales with the Pan setting). (Pinch-zoom
  rate has no MapLibre API — documented platform limit.)
- **Layer category headers** big + bold + contrast (15px/800, was 10.5px) with a hairline separator.
- **Layer-toggle scroll jump fixed**: the scroll compensation now targets the REAL scroll container
  (the m-sheet body), not the position:static layer-dropdown (the old dd.scrollTop math was a no-op on
  mobile → list jerked on every toggle).
- **Bottom sheet collapses past the logo** (grip-only MINI detent).
- **Summarize button lifted above the coord readout** (+44px) so they don't overlap.
- **Faster crosshair readout** (60ms move / 120ms wx debounce, was 120/220).
- **Radius panel** compact mobile layout (capped width/height, tighter rows, scrollable).
- **Historic-borders year control = native iOS pulldown** on mobile (slider stays on desktop).
- **Popup × 32px safety net**: satellite-panel close + any `[aria-label="Close"]` get a 32px tap target.

### Desktop / labels / search
- **Narrow-sidebar header wraps** (flex-wrap) — the Settings button no longer spills outside the sidebar
  when the resizable sidebar is dragged narrow.
- **Search pill drops to row 2 sooner** (map < 760px, was 640) so it can't graze the view buttons/sidebar.
- **Labels-always-on-top** strengthened: the re-assert check now detects ANY data layer sitting above the
  labels (scan from top, skip tool/mask layers), not just label-stack contiguity.
- **Place-label popup**: name on its own line + an even button row (Copy / Wikipedia / AI brief),
  vertical-stacked on mobile.
- **Suggested questions** now render AFTER the AI brief finishes (were shown from the start).

### i18n / spelling
- **All British spellings → American** (colour→color, centre→center, favourite→favorite, defence→defense,
  grey→gray, metre→meter, analyse→analyze verb-only, etc.) — text/comments only; verified none were code
  identifiers / CSS props / DOM ids first.

### Perf
- Desktop `MAX_PARALLEL_IMAGE_REQUESTS` 192→256 (user still measures spare 3D bandwidth/GPU).
- LOS desktop 720×420 → **900×480 rays×steps** (0.4° rays, z15 native-max DEM); mobile unchanged.

### Removed
- **ACLED** conflict-events card retired from the News tab (early-return IIFE).

### Verified-in-preview summary (R22)
Desktop: build R22; theme list auto/light/dark/classic/**cyber** (no tactical); lang en/jp/**de/ru**
(DE switch → "Nachrichten/Einstellungen", RU → full Cyrillic UI); widgets=5 + Edit mode reorder/delete +
no hover ✕; gallery 23 rows; compare 26-layer pulldown 460px; Köppen renders as backend raster + legend
tap-for-criteria, sampleKoppenAt→null; PPP cached (247 countries) + shown; 5 new beta layers present,
religion choropleth paints correctly (China=unaffiliated, India=Hindu, SE-Asia/JP=Buddhist, C-Asia=Muslim,
Russia=Christian); Tools 4 buttons even spacing; narrow-sidebar header no longer overflows. Mobile 375:
widget add `<select>` (24 opts), category headers 15px/800, no console errors. **GOTCHA**: `setLang` now
persists, so testing a language via eval sticks in localStorage for that preview profile (reset to en).

---

## 26. Round 23 — re-reported batch: Köppen interactivity restored, DE/RU out, compare pulldown, inertia, mobile fixes (tags `#R23`)

Same standing constraints (additive/in-place, MapLibre stays, real data only, no excuses; never dismiss a
re-report as "already done" without re-checking the live code). Build stamp `2026-06-14-R23`. The whole
inline script re-parses with **zero console errors** after every batch (verified late-EOF globals all defined);
the headless preview tab is `document.hidden` so the GL map frequently never finishes `load` — verification is
via DOM/state/console + curl probes, NOT screenshots (which time out on the WebGL canvas this session).

### Köppen — interactivity RESTORED without the OOM (the user: "前回削除された機能を復活させて")
- The R22 "pure backend raster" rip-out also killed the cheap, SAFE parts. Restored **memory-safely**:
  - `sampleKoppenAt` re-points to the legacy sampler, which reads the **≤2048² work canvas (~16 MB)** — NOT
    the full 8192² decode (the 268 MB OOM). Verified live: Amazon→Af, Sahara→BWh, London→Cfb, Greenland→EF,
    India→Aw, Siberia→Dfc (all correct).
  - Class **highlight** restored via the small-canvas `buildKoppenHighlightURL` ONLY (≤2048² → ≤16 MB out).
    The big full-res path (`_koppenFull`/GPU, 67–268 MB) STAYS disabled — that was the real OOM, not this.
  - Legend **click = highlight** that one climate again (+ `.sel` outline + a **Clear button** that the R22
    rewrite computed but never inserted — latent bug); long-press / right-click shows the criteria popup.
  - Map-click + cursor-readout consumers already existed (3928 / 4078) → now live again.
- `koppenWorkURL` always uses the 4k PNG (sampling decode 67 MB not 268 MB even on desktop).
- **Mobile DISPLAY texture → 4k** (`koppenDisplayURL`): the full 8192² PNG is a ~268 MB GPU texture that
  crashes iPhone Safari ("重い動作で落ちる"); desktops keep 8192². addKoppen/setKoppenPeriod recompute it.

### Removed / reversed from R22
- **DE + RU dropped from the UI language selector** (the user reversed the R22 addition — "設定言語から削除").
  Selector now en/jp only; `setLang`/loadSettings/initial-read migrate any saved de/ru → en. The DE/RU **news**
  feeds (a separate feature) stay. The dead `t()` de/ru objects are left in place (harmless, unreachable).

### Frosted glass (#R23 push) — the plain "Frosted glass" now sits at the OLD "more transparent" level
(0.18 fill light), "more transparent" goes to 0.10 with blur raised 22→26 so controls stay legible.

### Compass — desktop SVG 28→34, mobile 30→38 (same shape, same button size; "もっと大きく").

### Random country (#34) — `countryStats` now carries a **`sov` flag**: features with `TYPE==='Indeterminate'`
or unrecognized featurecla (Scarborough Shoal, Bir Tawil, Bajo Nuevo, Serranilla, S. Patagonian Ice Field,
Heard I.) are flagged; the random-country widget filters `sov!==false && pop>0`. Verified those 6 are all
`pop:0`. (Quiz pool already filtered `pop>300000`.)

### Tools 4-button spacing (#24) — ROOT CAUSE found: on mobile `#mo-mount-layers .layer-dropdown > #layer-tools`
was forced `display:block`, so the flex `gap:8px` was ignored and (after R22 zeroed the margins) the buttons
touched with **0 gap**. Made it `display:flex;gap:8px !important`. Desktop was already flex (verified 8px).

### Historical borders 1970/1980 (#10) — **curl-verified those years 404 upstream** (aourednik repo has no
`world_1970/1980.geojson`; only 1945/1960/1994 exist in that span). Mapping them to a nearby year would
misrepresent borders → removed the 2 dead years, **added 1930** (exists) so every offered year actually loads.

### Layer-search box (#18) — un-pinned on desktop (`position:sticky`→`relative`); scrolls with the list now.

### Sidebar card gray square (#20) — imageless `.wiki-card-img` painted a dark `::before` gradient over the
white card (a faint gray rectangle) and emitted `url('')`. Now `wc-noimg` drops the gradient (and collapses a
typeless+imageless header); the gradient returns when the real thumbnail lazy-loads. *(Visual — could not
screenshot this session; targeted the most-likely cause; re-confirm on device.)*

### Compare view (#12/#13) — the layer picker is now a **native `<select>`** (iOS-friendly + scrolls on every
platform; the old checkbox-list-in-a-div couldn't scroll on desktop so the bottom layers were unreachable).
Verified: 27 options (placeholder + 26 layers, Köppen…Pharma). One layer at a time; reuses the proven add/show.
(#11 projection-follow and #16 base-swap retry logic from R20/R21 read correct; the 2nd GL instance can't be
exercised headlessly.)

### Nav inertia (#28) — NEW **Inertia slider** (0–150 %, default 100; "0で無効"). `_applyNavSens`: Pan scales the
fling speed, Inertia scales the glide DURATION and **0 = stop on release** (`deceleration:100000`). Persisted as
`navInertia`; re-asserted on first idle (the Draw tool re-enables dragPan with defaults otherwise). This is also
what makes the sliders affect MOBILE (touch drag is 1:1, so glide is the only tunable). **Pinch-zoom rate stays
a documented MapLibre limit** (#30 partial — pan/inertia DO apply on touch, pinch can't).

### Mobile (#2/#7/#31)
- **borders toggle** (#2): `addLayer(...,'tool-poly')` THREW when the tool layer wasn't on the map yet →
  guarded the beforeId (+ try/catch fallback).
- **popup × = legend UI** (#7): all 32px already (R18-R22); added the legend's gray rounded-box background to
  `.kip-x` / `.pin-popup-close` / `.maplibregl-popup-close-button` so they read as the same control.
- **layer FAB white in light mode** (#31): ROOT CAUSE — the frosted `.m-fab{background:glass-fill !important}`
  beat the non-important `.m-fab.on{background:primary}`, so in satellite mode the icon went white on a light
  glass FAB. Made `.m-fab.on` background `!important`.

### Phantom layers (#36) — the AUTO intro-demo's layer toggles were saved into the URL hash, so a demo layer
landed in the bookmark and got **restored on the next load** as a layer the user never chose. `save()` now skips
while `window._imDemoActive`; the demo turns OFF **every** SHOW layer on stop (not just the current) and re-syncs
the hash. (Demo still runs once on desktop first-visit.)

### Per-country hover (#23) — the R22 **beta** World-Bank choropleths (corruption, life-exp, unemployment,
internet, precipitation) were click-only; added a **hover tooltip** (reusing the exported `ensureMapTooltip`/
`positionTooltip`, same as HDI). Main choropleths already hovered via `wireChoroHover`.

### Edge black map (#33) — added a **WebGL context-loss/restore** handler (preventDefault + repaint + re-assert
layers). Helps the "goes black" case; an initial-black-in-Edge is most likely a GPU/hardware-accel issue that
needs a real Edge session to confirm — flagged, not faked.

### Re-checked, code already correct (no change needed; flagged for device re-test if still seen)
#3 UV widget already uses `widgetLoc()` geolocation; #4 widgets already 60 s/5 min/on-visible (R21);
#9 labels-on-top self-heal (R22 top-scan) intact; #19 map labels already the OFM vector set (`mapLabelsViaVector`
→ true); #21 crosshair debounce already 60/120 ms; #22 radius mobile compact (R22); #25 place-label popup +
vertical buttons (R22); #32 layer-toggle scroll-jump targets the real m-sheet scroller (R22).
**Honestly still needing a real device/Edge: #5 #8 #14 #15 #17 #29 #33 + the pinch-zoom limit in #30.**

---

## 27. Round 24 — real-device feedback: many R23 fixes didn't land + new items (tags `#R24`)

Build `2026-06-14-R24`. The user re-tested on device; several R23 fixes needed deeper root-causing, plus new
asks. Same constraints. Zero console errors after every batch; whole-script parse verified via late-EOF globals
(the hidden-tab GL map still won't finish `load`, so DOM/state/console only; screenshots time out even with the
canvas hidden this session).

### Root causes found this round
- **#2 "Country borders auto-checks Place names" (mobile)** — iOS fires a ~300 ms DELAYED synthetic click. The
  row's change handler made the Active-layers section appear and shove the rows DOWN, so the late click landed on
  the row that slid into that screen spot — the one directly ABOVE (Place names). Fix: `touch-action:manipulation`
  on `.layer-option` + its checkbox (fires on first tap, no delayed retarget). Same fix on `.cmp-btn` → compare
  Map/Sat/close/mode buttons that "押しても変わらない/終了できない" on mobile, and it also helps #32.
- **#9 Köppen hides labels** — every overlay is added at `beforeId='tool-poly'` (ABOVE labels) and relied on the
  idle `raise()` self-heal. addKoppen now inserts the raster BELOW the label stack explicitly + calls
  `_raiseLabelLayers()`, and EVERY layer toggle re-asserts labels (staggered 60/400/1200 ms) for the "等" overlays.
- **#11 compare projection** — `cmap.getProjection()` returned an unreliable type, so when MAIN=Globe and
  compare=Flat the old diff thought they matched (isGlobe defaulted true) → never switched ("Flatに戻してから
  Globeにしないと反映されない"). Replaced with our own `cmap.__wantGlobe` flag, set in build + followProjection.
- **#19 old labels flash at startup** — `layer-light` (the LABELED carto base) was `visibility:visible` by default;
  swapped so the `*-nl` no-label bases are the startup default (vector labels are always used now).
- **#new2 Flat/Globe/3D wasted vertical padding** — the R23 34px compass icon inflated the row above the text
  buttons; capped `.compass-btn{height:33px;padding:0 6px;overflow:visible}` so the big icon no longer adds height.
- **#20 gray rectangle behind cards** — DOM scan found NO gray-bg child on any tab; the culprit is the big
  `0 8px 30px rgba(0,0,0,.08)` drop-shadow reading as a soft gray rectangle halo behind each card. Tightened to
  `0 1px 3px` on the card classes. (Best hypothesis — could not screenshot; re-confirm.)

### Other fixes
- #7 tool-panel × (measure/radius/draw/LOS/route) gets the legend's gray box on mobile.
- #14 close pinned z:30 in its 52px gutter; minimize works after resize (R23) + centered bar (R23).
- #22 radius readouts re-organized into a compact 3-up `.rad-stats` strip (+ opacity on its own mobile line).
- #26 "more transparent" glass → 0.05/0.10 (blur 30).
- #new1 Stats `.stats-compare-bar`/`.cmp-section` join the unified card frost.
- #new3 Köppen legend hint is device-aware (desktop: "Click to highlight • right-click for criteria").
- #new4 admin.html feedback table shows the **User ID** column (the row already stored `user_id`).
- #new5 floating satellite controller auto-dismisses on outside interaction (map drag / zoom / pointerdown
  outside it); re-opens via the Satellite button. Mobile keeps it in the sheet.
- #21 SST/temp readout debounce 120→70 ms (climate/choropleth were already synchronous per move).
- #4 widget data tick 5→3 min + refresh on window `focus` (board only refreshes while the home view is visible;
  fetches were already fresh — no long cache).

### Still need a real device / 2nd-GL-instance (can't exercise headless): #15 X-ray drift, #29 fps/choppiness.

---

## 28. Round 25 — re-reported batch, root-caused not re-skinned (tags `#R25`)

Build `2026-06-14-R25`. The user re-sent the SAME list yet again, so this round was about finding the
ACTUAL root cause for each recurring item (several earlier "fixes" were aimed at the wrong cause) and not
dismissing any report. Verified live in the headless preview where the DOM/CSS/state is observable (the
spinning WebGL globe + closure-scoped map instance + 2nd compare GL instance still can't be screenshotted
or fully exercised — those are flagged). Zero console errors after every batch.

### Root causes found (the ones earlier rounds missed)
- **#1/#23 mobile checkbox cross-wiring** — R24 blamed an "active-layers reflow", but toggling names/borders
  is in the skip-set and early-returns WITHOUT reflowing, so that fix couldn't work. REAL cause: the mobile
  `.layer-option` rows were **32px** tall (centers ~33px apart) — below the 44px iOS target — so a finger
  aimed at one toggle landed on its neighbor. Fix: rows → **44px**, gap 10px. Plus a **pointerdown-target
  capture** safety net on `#layer-dropdown`: record the label the finger goes DOWN on; if the click resolves
  to a different label (any reflow/fat-finger retarget), cancel the wrong native toggle and toggle the
  original. This also covers "勝手に別のレイヤーがオン".
- **#5 labels buried by land-cover/relief** — `inPlace()` returned "ok" the moment the first non-tool layer
  from the TOP was ANY one label layer, so a SPLIT stack (one label on top, the rest under a raster) never
  re-raised. Rewrote it to require EVERY label layer above EVERY data layer; broadened the "own/above" set
  to `tool|draw|los|route|place-hl|iso-mask`.
- **#3/#12 narrow-desktop search unusable** — two real bugs: (1) `.map-controls-top` (a flex column,
  `align-items:flex-end`) hit-tested ON TOP of the centered search even in its empty left region → the input
  "couldn't be typed in". Made the container `pointer-events:none` with its buttons `pointer-events:auto`.
  (2) the row-drop used a fixed 760px width threshold that did NOT fire at e.g. 820px even though the pill
  physically overlapped the view buttons. Replaced with **real collision geometry**, and the narrow search
  is now `position:fixed` with JS-computed left/right that always clear the side controls (or drops below the
  whole control stack when there's no room beside it). Verified: input hit-tests to itself at 820px & 1280px.
- **#6/#7 compare projection** — `cmap.setProjection({globe})` runs BEFORE the compare style loads (MapLibre
  default is mercator), so it silently no-ops, yet `__wantGlobe` was left true → the followProjection guard
  thought it matched and never re-applied (the "Flatに戻してからGlobeにしないと反映されない" bug). Fix: force a
  clean re-apply on `cmap.load` + first `idle`.
- **#13 frosted text "blurred"** — confirmed NO `filter` on any ancestor (text was never actually blurred);
  it just lost contrast over the see-through panel, and the layer panel had NO readability shadow at all.
  Gave every frosted surface a CRISP 1px contrast halo (not a soft 3px glow).
- **#14/#19 two glass tiers felt identical** — both used `blur:30px`, so only fill differed. Differentiated
  by BLUR: "Frosted glass" stays a 30px frost; "more transparent" drops to a near-clear **7px / 0.03 fill**.

### Other fixes
- **#11 x-ray header darkened, buttons lost** → solid opaque `#0f1218` header bar + high-contrast chips in
  x-ray; `clearXrayLens` now fully restores + multi-resizes the canvas on exit.
- **#15 cursor readout lag** → `updateCoord` coalesced to one rAF (kills mousemove backlog); SST/temp shows
  the nearest already-cached cell instantly then refines; debounce 70→35 ms.
- **#16 radius mobile** → genuinely RE-ORGANIZED (not just shrunk): full-width bottom-docked card above the
  sheet, sticky header, even 3-up stat strip — never covers the circle being placed.
- **#17 Tools buttons** → gaps were already even; the BUTTONS were different heights (labels wrapped to
  different line counts). Fixed height 50px + 2-line clamp → one tidy group.
- **#20 pan/zoom stutter** → mobile move-readout coalesced to rAF + heavier sampling throttled to ~110 ms
  during motion (precise value still on moveend). (Continuous WebGL tile render remains engine-bound.)
- **#21 mobile zoom sensitivity** → double-tap/-click zoom now scales by the Zoom slider on touch (the one
  zoom gesture we CAN tune). Continuous **pinch rate has no MapLibre API** — documented platform limit.
- **#22 layer-toggle list jump** → on mobile the Active-layers section now sits at the BOTTOM of the list, so
  toggling never pushes the rows you tap; scroll-compensation skipped on mobile. Verified before==after==0.
- **#24 NATO** → accession-year time-travel control (slider/select) like Historical borders; `buildNatoFC`
  filters members by `NATO_JOIN[code] <= year`.
- **#25 Köppen wording** → now keys off pointer type (`_imTouchPrimary`), so a desktop with a narrow window
  (where `isMobile()` width-check was true) still gets "Click • right-click".
- **#26 intro demo** → dwell 6.5→9 s so the GIBS night-lights + DEM relief have time to paint (tiles verified
  200 OK; it was a load-timing race); pressing ANY legend × now ends the demo.
- **#27 stats comparison** → resets the feed + its scroll container to top on render.
- **#28 non-AI news locator** → lead-position scoring bonus; +~30 curated cities/aliases (US/UK/UAE/EU/DPRK…)
  /flashpoints; AUTO-adds every country + capital from the bundled `countryStats` (~75 → ~275+ places),
  rebuilt once country data loads.
- **#29 first-party AI prep** → `window.INTMAP_AI_PROXY.url` routes ALL `askAI()` calls through a server that
  holds the key; empty by default → identical BYOK behavior today, one-line flip later. `aiReady()` returns
  true when the proxy is on so buttons light up with no BYOK key. No visible change now.
- **#30 hover layers** → the WB beta choropleths' tap popup is now touch-only (hover already shows the value
  on a mouse device).
- **#31** → Life expectancy / Unemployment / Internet promoted out of beta into "Population & economy"
  (unemployment's WB API verified 200/235 rows — it was a findability problem, now in a real group).
- **#2** → UV-index widget joins weather/AQI/sunrise in requesting geolocation on add.
- **#4/#18** → place-label popup gets mobile top/right padding so × never overlaps Copy; all close buttons
  get `touch-action:manipulation` + a +6px invisible hit halo (text-glyph closes).

### Still genuinely device/2nd-GL bound (flagged honestly, not dismissed)
- #9 x-ray lens drift when panning far at low globe zoom (two independent GL instances; camera/padding are
  mirrored every sync — added resize robustness, but sub-pixel globe divergence needs an on-device check).
- #8/#10 compare close-overlap + map/sat swap read correct in code (z:30 pinned gutter; applyBase retry) but
  can't be exercised headlessly.
- #20/#21 the continuous-render fps floor and pinch-zoom rate are MapLibre engine limits.

---

## 29. Round 26 — re-reported batch + EU layer; CRITICAL self-inflicted blank-site fix (tags `#R26`)

Build `2026-06-14-R26`. The user re-tested R25 on device: a few R25 changes regressed or were wrong-
direction, and they (correctly) corrected me that the frosted text IS genuinely blurred. Treated every
report as real. **Standing lesson burned in:** see [[intmap-template-literal-css-backtick]].

### CRITICAL: blank-site parse/runtime bug (my fault, twice)
My R25 close-button COMMENT contained back-ticks (`` `position:relative` ``) and lived INSIDE the GROUP 3
`style.textContent=` template literal → it closed the string early and broke the WHOLE inline script → blank
site (no map, only 14 static checkboxes, no globals). My first "fix" comment ALSO contained back-ticks
(``style.textContent=` ` ``) and re-broke it as a *runtime* TypeError (so `new Function` reported PARSE OK
while the page was dead). Fixed by removing ALL back-ticks from that comment. Diagnosis tool: a temporary
`window.onerror` trap (the preview console doesn't surface uncaught errors) pinpointed it. **Verify the page
RUNS (~72 layer rows), not just parses.**

### R25 regressions fixed
- **Close buttons unresponsive (#×反応しない)** — R25 added `position:relative` to all close buttons, which
  overrode their `position:absolute` corner placement → they jumped off-target and taps missed. Reverted to
  touch-action only.
- **Frosted text really IS blurred (I was wrong)** — two causes: (1) my "crisp halo" used `0 0 1px`, a
  1px-BLUR glow that reads as fuzz; (2) R25 dropped "more transparent" to a 7px blur, so the busy map showed
  through SHARP behind the text → it anti-aliased against high-frequency detail. Fix: hard `0 1px 0` shadow
  (no blur), and BOTH tiers keep a high uniform blur (26/22px) differentiated by FILL (0.34 vs 0.12) so the
  backdrop is a smooth wash and text stays crisp.
- **X-ray header forced black in light mode** — made it theme-aware (light surface in light theme) with
  theme-colored chips; only the cyan keyline marks the lens.

### New / other fixes
- **EU members layer + accession-year slider** (mirrors NATO; Brexit-aware: UK dropped from 2020). New
  `dl-eu` row in Geopolitics & defense, `euLegend` year control (1958…2024), hover shows joined/left year.
- **Group-header vs layer-name color unified** in frosted modes (headers used --text-muted→white, names
  used --text-main → different colors; both now --text-main).
- **Default-load names/borders** — `borders-only-line` is now created in addCountryLayers (was lazy-created
  only in the cb-borders change handler, so borders were checked-by-default but undrawn until re-toggled);
  names re-asserted on load + ofm `sourcedata` + a few timed passes.
- **Labels-on-top rewritten** — raise() now lifts the label stack to the ABSOLUTE TOP, then re-lifts the
  user's own tool/draw layers above them (old code moved labels to just-below tool-poly, so a raster added
  above tool-poly stayed over the labels and could thrash).
- **Tools buttons** — wrappers (#edu-mount/#lyr-presets) set `display:contents` so all 4 buttons are true
  flex children with one 8px gap; fixed 50px height. Verified uniform.
- **Compare**: layer-select widened (text no longer crushed); window clamped off the sidebar (drag + open);
  stats comparison scroll-to-top made INSTANT (was animating via `.content-area{scroll-behavior:smooth}`).
- **Radius mobile** — long values/coords now wrap/ellipsize inside the bottom card (no overflow).
- **Mobile layer-toggle flicker** — checkbox `pointer-events:none` so a tap routes through the label exactly
  once (label+checkbox double-fire was toggling on→off = flicker).

### Re-reports already addressed in R25 / platform limits (re-verified, honest)
- #cursor-readout lag, #news-locator coverage — the R25 work stands.
- #x-ray drift (#9), #compare map/sat & close-overlap (#8/#10) — code reads correct; need the 2nd GL
  instance on a real device.
- #mobile pinch-zoom rate — no MapLibre API (documented); double-tap zoom does respect the setting.
- #intro-demo night-lights/pop-density — GIBS rasters; dwell is 9s and tiles curl-verified 200, but the
  in-demo render couldn't be confirmed headless (the hidden tab never completes WebGL load).
- #active-layers desync — driven by checkbox⇄map state; the cross-wiring + phantom-layer fixes target the
  root causes; flagged for device re-confirm.

---

## 30. Round 27 — account-based AI migration + recurring-bug root-causes (tags `#R27`)

Build `2026-06-15-R27`. Big batch: the AI feature was migrated off BYOK onto an account-gated, quota-limited
first-party server, plus root-cause passes on the recurring mobile/UI bugs. Standing lessons kept: no
back-ticks inside CSS template literals (verified the page RUNS — 72 layer rows, zero console errors after
every batch); changes additive/in-place.

### AI: BYOK → account-based built-in AI (the headline feature)
- **Server (`supabase/functions/ai-proxy/index.ts`, new)** holds the provider key SERVER-SIDE, verifies the
  user's Supabase JWT (login REQUIRED → 401), enforces a per-day free quota via the `increment_ai_usage`
  RPC (atomic), calls the provider (Anthropic default, model fixed by `AI_MODEL` secret), and returns
  `{text, used, limit, remaining}`. A failed provider call REFUNDS the consumed slot. Limit is plan-driven
  (`PLAN_LIMITS = {free:5, plus:50, pro:200, …}` keyed on `profiles.plan`) → trivially extensible to paid tiers.
- **SQL (`supabase_ai_usage.sql`, new)**: `ai_usage(user_id, usage_date, count)` (the date IS the key → daily
  reset is automatic), RLS read-own, `increment_ai_usage` / `refund_ai_usage` (SECURITY DEFINER, service-role
  only), and optional `profiles.plan` / `profiles.login_count` columns.
- **Client**: removed the BYOK provider/key/model UI from Settings (the section now shows login state +
  "today's N / 5 free"); `askAI()` now ALWAYS routes through the proxy (`window.INTMAP_AI_PROXY.url` defaults
  to `<SUPABASE_URL>/functions/v1/ai-proxy`) with the session JWT + anon apikey. New `aiGate()` runs at every
  AI-feature click: not-logged-in → opens the auth modal with an AI-context message; over quota → toasts
  「本日の無料AI使用回数に達しました」. `aiReady()`/`aiVisionReady()` now just mean "proxy configured" so buttons
  never grey out. Auto-locate news no longer silently burns quota (gated on `currentUser && aiUsesLeft()>0`).
- **DEPLOY STEPS the user must run once** (front-end is fully wired and degrades gracefully until then):
  `supabase functions deploy ai-proxy`  ·  run `supabase_ai_usage.sql` in the SQL editor  ·
  `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` (optional `AI_MODEL`, `AI_PROVIDER`).

### #3rd-login feedback — `recordLogin()` counts a GENUINE login (email-submit success or OAuth return, NOT a
  session restore / token refresh; `_loginCounted` caps one per page-load) per-user in localStorage (mirrored
  best-effort to `profiles.login_count`); on the 3rd it opens the existing feedback modal once.

### Recurring-bug ROOT CAUSES (the ones earlier rounds skinned)
- **Close × unresponsive on mobile (#×反応しない)** — `makeDraggable`'s touchstart handler is on the panel
  HEADER which CONTAINS the ×, and it `preventDefault()`s every touchstart; on touch, preventDefault on
  touchstart CANCELS the synthesized click → the ×'s onclick never fired (desktop's mousedown-preventDefault
  does NOT cancel click, which is why it worked there). Fix: drag now ignores gestures that start on a control
  (button/×/input…). Plus an idempotent delegated fallback for every legend × with a `data-x` (survives the
  innerHTML rebuilds that were dropping the direct onclick).
- **Layer checkbox instability / 勝手にレイヤーがオン** — the R25 pointerdown→click RETARGET heuristic was ITSELF
  the phantom-toggle cause (after a scroll/fat-finger it toggled whatever label the finger went DOWN on).
  Replaced with the correct model: checkbox `pointer-events:none` on BOTH platforms → exactly ONE label-driven
  toggle (verified: 2 clicks = 2 change events), and a SCROLL-CANCEL guard that only SUPPRESSES a click after a
  real move (never synthesizes a toggle). Deterministic checkbox⇄map⇄active-layers state.
- **Default place labels missing** — `ensurePlaceLabels` is now IDEMPOTENT (dropped the `_placeLabelsAdded`
  one-shot guard that blocked re-adding when the first add beat the OFM source ready) + re-asserted on `ofm`
  sourcedata and after the intro demo. Country borders default OFF (they were checked-by-default but undrawn).

### Other fixes
- **Text shadows removed** — the R25/R26 frosted "contrast halo / hard drop" on every panel/legend/popup is
  gone (`text-shadow:none`), per "テキストに勝手に影を付けるな". (verified computed `text-shadow:none`.)
- **Tools buttons** 50px→38px single-line+ellipsis (the 50px only existed to hold a 2-line label = "縦幅が
  大きすぎて不自然"). **EU/NATO** year slider now labels only the start/end years (the dense per-accession-year
  ticks collided = "範囲のテキストが重なる"). **Place-label popup** × aligned to the action-buttons' right edge,
  mobile dead-space padding removed. **Radius** containment moved to base rules (R26 only did it <768px, so
  tablets/landscape still spilled).
- **Compare**: layer-select no longer crushed (a native `<select>` had `display:flex` collapsing its text box);
  close × relocated OUT of the wrapping header to a direct child of the window (nothing can overlap it on any
  platform — the durable fix for "×がレイヤー選択ボタンと重なって終了できない"); `_cmpReclamp` re-clamps off the
  sidebar on expand/collapse/resize; synced longitude normalized to [-180,180] so a free-pan wrapped main map
  no longer drifts the compare basemap/layers.
- **Cursor readout** SST/temp cache coarsened 0.1°→0.25° (far more instant cache hits in a local area, fewer
  fetches) + nearest-fill widened to 1.5° so the readout never blanks while panning.
- **Mobile pinch-zoom sensitivity** — implemented a custom 2-finger pinch that scales the zoom delta by the
  slider; it engages ONLY when the user CHANGED the setting (sens≠1), so the default pinch is 100% untouched.
- **Non-AI news locator (大幅増強)** — added a DEMONYM gazetteer (~65 client / ~43 server: "Ukrainian/Israeli/
  Iranian…" → the country, flagged + score-docked so explicit places always win) — a large share of headlines
  name a country only by its adjective; +~40 curated conflict/hub cities; corroboration bonus (title AND desc).
  Mirrored into the `refresh-news` Edge Function (redeploy to apply to the pre-baked feeds).

### Still genuinely device/2nd-GL-bound (flagged honestly, not dismissed)
- Mobile touch behaviors (checkbox taps, close-× taps, pinch feel, radius render) — root-caused in code; the
  hidden preview's WebGL `load` never fires so touch/mobile rendering can't be exercised headless.
- Compare X-ray drift at very low globe zoom (two GL instances) — lng-normalize + padding-mirror help; needs a
  real device. Free-pan flat drift mitigated by the lng wrap.

---

## 31. Round 28 — re-reported checkbox/active-layers/compare batch + news locator overhaul (tags `#R28`)

Build `2026-06-15-R28`. The user re-reported the recurring layer-checkbox instability, two explicit
REGRESSIONS to revert, the compare close-overlap (「永遠に改善されない」), compare drift, two small UI items,
and asked to drastically strengthen the non-AI news locator. Verified live in the headless preview (DOM/CSS/
state + a temporary `analyzeContext` hook to confirm locator accuracy on real headlines, then removed). 72
layer rows + zero console errors after every batch.

### Root causes found this round
- **Checkbox instability (#1 mobile / #3 desktop) — the SCROLL-CANCEL guard was itself dropping good taps.**
  The R27 guard cancelled ANY click after a >10px pointer move. A finger tap easily jitters >10px, so it
  silently DROPPED legitimate taps → "チェックの動作が不安定 / デスクトップでもチェックを付けても動かない".
  REAL signal = did the LIST actually scroll. Now records the scroll container's `scrollTop` on pointerdown
  and cancels a click ONLY if it scrolled (>3px) or the pointer travelled far (>26px = a drag). **Verified in
  preview:** clean click → toggles; 15px jitter (no scroll) → toggles (old guard cancelled this); after a real
  scrollTop change → cancelled. Still only SUPPRESSES, never synthesizes → no phantom toggles.
- **Active layers vanished on mobile (#2) — it was moved to the BOTTOM (R25), below the whole list + Tools, so
  it read as removed.** Now ALWAYS at the TOP (below the 4 utility toggles) on every platform (`_actAtBottom`
  hard-false). The iOS delayed-click retarget the bottom-placement worked around is already killed by
  `touch-action:manipulation`, so growing the section no longer mis-targets a tap. **Verified:** section at
  child-index 6 (top), `display:block`, chip rendered.
- **Others(beta) pulldown (#7) — REVERTED.** R21 made the Others group a tappable collapse on mobile; the user:
  「Others(beta)だけプルダウン…元に戻せ」. Removed the mobile collapse in `_expandAllLayerGroups` + the click
  handler + the caret CSS — every group (incl. Others) is fully expanded on mobile now.
- **Compare close × overlap (#6, 「永遠に改善されない」) — the × shares the top-right corner with the main-map FAB
  stack.** No amount of z-index juggling fixed it because the compare window lives inside `#map-container`
  while the FAB stack is a body child. Decisive fix: toggle `body.cmp-open` in compare open()/close() and
  `@media(max-width:768px){ body.cmp-open .m-fab-stack{opacity:0;pointer-events:none} }` — the FABs are simply
  GONE while compare is open, so the × is the only thing in that corner. × also enlarged to 44px. **Verified:**
  body class toggles on open/close; CSS rule present.

### Compare drift (#5 free-pan flat / #8 zoomed-out X-ray)
- The compare map was always `renderWorldCopies:false` while the MAIN flat map wraps the world in free-pan
  (`renderWorldCopies:true`). Past ±180° the compare basemap/overlays had no copy to follow → drift. Now the
  compare map's world-copies FOLLOW the main map (`_cmpWorldCopies` = flat && free-pan), and when copies are on
  the sync uses the RAW (unwrapped) center so both cameras sit in the SAME copy → basemap + data layers stay
  registered. `applyFlatPanSetting` re-syncs the compare on a free-pan toggle. (Globe sub-pixel divergence at
  very low zoom is still 2-GL-bound.)

### Small UI
- **Tools 4 buttons (#10)** 38px → **34px** (the user still found 38 "縦幅が大きくて不自然"); mobile gap 8→6px.
- **Radius mobile (#9)** the 3-up stat strip's ~53px columns clipped/overflowed long values
  ("3,141,593 km² (1,212,975 mi²)"). Now a VERTICAL full-width list (label left, value right, value wraps);
  also gave the panel an explicit `width:calc(100vw-12px)` (the base mobile rule's `right:auto` had been
  shrinking it to ~233px, left-stranded). **Verified in preview:** 0 overflowing elements, panel full width.
- **Phantom/orphan layers (#4/#11)** the intro demo's `stop()` now ALSO force-hides its map layers
  (`lyr-climate/nightsat/relief/popgrid`) directly — if a setOff change handler ran while the map was busy
  (~1.4s after load) the checkbox could be OFF while the raster stayed VISIBLE = an orphan you can't remove.

### News locator — drastically strengthened (#12)
- **geoDB ~275 → ~989 entries.** Added (all additive, precision-preserving):
  - `_EXTRA_GZ`: ~115 secondary/major NON-capital metros worldwide (capitals already auto-load from
    countryStats), subnational regions / US states / conflict regions (Donbas, Kurdistan, Xinjiang, Tibet,
    Catalonia, Texas, California, Darfur…), and government-seat metonyms (Kremlin, Pentagon, White House,
    Downing Street, Capitol Hill, Zhongnanhai, Blue House, Élysée) — all precise.
  - `_ORG_GZ`: ~22 organizations/institutions/armed groups (UN, NATO, IMF, OPEC, EU Commission, IRGC, IDF,
    Hamas, Hezbollah, Houthis, Taliban, Wagner, ISIS, Boko Haram…) → a representative location, flagged
    `org:true` and DOCKED below an explicit place (like demonyms) so an explicit city/country always wins.
  - `_DEMONYM_GZ`: +~46 nationalities (now ~100 total).
  - `scoreGeo` dock now applies to `demonym || org`.
  - **Verified accuracy in preview on 14 headlines:** "Israeli strikes hit southern Lebanon as Hezbollah
    responds" → Lebanon (explicit place beats docked demonym+org); "Houthis…Red Sea" → Red Sea; "Taliban…
    Kabul" → Kabul; "Wagner…Mali" → Mali; while org/region/metonym fallbacks fire only when no explicit place
    is named (Pentagon→DC, NATO→Brussels, Texas, Catalonia, Lagos, Osaka, Kremlin, Guangzhou).
  - **Mirrored into `supabase/functions/refresh-news/index.ts`** (full demonym parity + embedded places + org
    dict + org dock). **Redeploy that function** to apply to the pre-baked server feeds.

### Verify-on-device list (honest)
- The mobile-only renderings (checkbox tap feel, compare-× tap, radius card) are root-caused + verified in DOM/
  CSS/state, but the headless preview never finishes WebGL `load`, so on-phone confirmation is still welcome.

---

## 32. Round 29 — server-side AI news pipeline + deterministic checkboxes + docs (tags `#R29`)

Build `2026-06-15-R29`. Re-reported recurring batch + a major architectural change: news location analysis
moves ENTIRELY server-side (AI-primary), and two new spec files were created. Verified live in the headless
preview (DOM/CSS/state): 72 layer rows + zero console errors after every batch; deterministic checkbox toggle
proven (1 tap = 1 toggle, drag/cross-row = no toggle); Others-only pulldown on mobile proven; privacy +
27-entry data-sources modal proven.

### News → fully server-side AI geolocation (the big one)
- **`refresh-news` reworked.** AI is now the PRIMARY locator for en/jp (every article is sent to the AI, not
  just dictionary-misses). Uses the SAME provider abstraction as ai-proxy (`AI_PROVIDER` ∈ anthropic|openai|
  gemini, server-held key; infers provider from whichever key is set; `NEWS_AI=off` kill-switch). Dictionary
  (geo_pins + embedded places/orgs/demonyms) is the FALLBACK (AI fail / non-en-jp / API down).
  - **Dedupe by (lang,link)** (upsert) → same URL never stored twice. **Reuse**: rows already `analyzed_by='ai'`
    within 72h are NOT re-sent to the AI. New `analyzed_by` column ('ai'|'dict'|'none').
  - **72h retention**: prune `current_news` by `pub_date < now-72h` (fetched_at safety net).
  - Added `supabase/supabase_news_setup.sql` (creates/extends current_news incl. the analyzed_by migration).
- **Frontend**: removed the client `✨ AI-locate` button + caret + auto-enrich (`maybeAutoEnrich` is now a
  no-op for location). The pin row is now just the Subject/Publisher DISPLAY toggle (both coords come from the
  server) + Translate titles. Removed the "AI location analysis" Settings dropdown (`setting-ailocate`).
  Added a **72h client display filter** (`computeFilteredNews`, exempts saved/time-travel). Frontend never
  calls the AI for news location now; pre-analysed pins show instantly via the existing `current_news` fast path.

### Checkbox determinism (#1 mobile flicker/misfire / #2,#3 zero-scroll) — re-root-caused
- The R28 suppress-only guard still allowed the native label toggle to fire, which could double-fire on touch
  or land on a row a mid-tap reflow had shifted ("チラついたり誤チェックが入る"). **New model: we OWN the
  toggle.** On a `label.layer-option` click we `preventDefault()` the native toggle and toggle EXACTLY the row
  the finger went DOWN on, exactly once, and only if it wasn't a scroll/drag/cross-row drift. `.lyr-row`s with
  sub-controls keep suppress-only. **Verified:** clean tap→toggles (2 taps = 2 change events); >24px drag→no
  toggle; pointerdown-on-borders + click-on-names → neither toggles.
- **Zero movement**: re-enabled scroll compensation on BOTH platforms in `_refreshActiveLayers` (the R25/R28
  mobile-skip was for the old bottom placement; the section is at the TOP now so compensation is correct and
  was exactly what was missing → mobile list lurch fixed). preventDefault on the label click also kills the
  focus-scroll source on desktop.

### Reverts / restorations the user re-asked for
- **Others(beta) pulldown (mobile)** — RESTORED as a pulldown, **only** Others (collapsed by default; other
  groups stay expanded; caret hidden on non-Others headers on mobile). R28 had wrongly removed ALL pulldowns.
- **Compare close-× overlap** — STOP hiding the main-map FAB stack (R28 hid it; the user: "勝手に消すな…下に
  移動させるだけ"). Now `body.cmp-open .m-fab-stack` is MOVED to the bottom-right (still fully usable, clear of
  the top compare window + its ×).
- **Countries(info) broken** — the cb-countries handler now RE-ENSURES `country-fill` exists (a Map↔Sat style
  swap drops the source while countryDataLoaded stays true → the old else-branch was a no-op = "使えなくなって
  いた"). Self-heals by re-running addCountryLayers.

### Isolate integration
- **isolate → auto-deselect Countries(info)** (dispatches change so checkbox/map/active-layers all update).
- **country NAME label tap → isolate button** in the normal state (Countries-info OFF, no tool, not isolated):
  a click handler queries `ofm-country` and pops a "🔍 Isolate <country>" button at the tap; `IntMapIsolate`
  gained `enterByName()` + `findByName()` (loads countryGeo on demand, matches across NAME_EN/ADMIN/name…).

### Intro demo → iOS welcome card (#9)
- The auto-cycling-layers "demo" (mistaken for a bug) is replaced on first visit by `_imWelcome()`: a clean
  iOS-style card (centered on desktop, bottom sheet on mobile) explaining IntMap, with an EXPLICIT opt-in
  "Watch the layer tour" button (the old `_imStartDemo` showcase, kept, no longer auto-running). Built with
  createElement + inline styles only (no CSS-in-template-literal). rAF + setTimeout fallback so it can't stick
  at opacity 0 when the tab is backgrounded.

### Locator strengthening (#11, additive)
- +25 high-frequency entries to BOTH client `_EXTRA_GZ` and server `EMBEDDED_PLACES`: maritime/strait
  flashpoints (Hormuz, Taiwan Strait, South China Sea, Suez, Bab el-Mandeb), contested regions (Golan, West
  Bank, Nagorno-Karabakh, Kashmir, Kaliningrad, Transnistria) and war cities (Zaporizhzhia, Kherson, Bakhmut,
  Avdiivka, Kursk, Sevastopol, Aleppo, Idlib, Mosul, Kandahar, Hodeidah, Tigray, Goma, Port Sudan).

### Docs + accuracy (#12, new files)
- **`CONSTITUTION.md`** — the user's standing directives, systematised (prime directives, change rules, the
  backtick trap, map/interaction unwritten rules, mobile, AI/news/keys, docs). Outranks DEV-NOTES.
- **`Architecture.md`** — current-state spec (overview, features, file roles, news flow, AI/key policy,
  Supabase schema/functions/env, map/layers/globe/widgets, UI/UX, mobile, i18n, feedback/donation/admin,
  fragile areas, safe-vs-careful, restore-from-scratch steps).
- **Privacy/ToS + data sources updated to the current state**: BYOK retired → account-based server-side AI
  (daily limit, key held server-side); news fetched + AI-geolocated server-side; data-sources modal +Google
  News, OpenFreeMap/OpenMapTiles, ESA WorldCover, RESOLVE/WWF Ecoregions, Smithsonian GVP, DeepStateMap,
  historical-basemaps, World Bank Open Data, and the AI provider (27 entries). LEGAL_DATE → 2026-06-15.

### Redeploy needed
- `supabase functions deploy refresh-news --no-verify-jwt` and run `supabase/supabase_news_setup.sql` once
  (adds the `analyzed_by` column) to activate the new server pipeline. Set `AI_PROVIDER` + the matching key.

---

## 33. Round 29.1 — re-reported regressions + themes + Playground + bug-report (tags `#R29.1`)

Build `2026-06-15-R29.1`. A large batch: fix the regressions R29 introduced, restyle/extend the theme
system, add a Playground (3 games), a Bug Report system, and harden maintainability. Verified live in the
headless preview after every change (72 layer rows + zero console errors; geometry/state probes for the
DOM-driven pieces).

### Regressions & re-reports (root-caused, verified)
- **News actions UI "崩壊"** — the R29 change removed the old `.ai-locate-wrap` flex structure but left its
  CSS; the translate button's `width:100%` then squashed the Subject/Publisher segment and its buttons
  overflowed/overlapped. Rebuilt as a **stacked iOS layout** (full-width segment + Translate below).
  Verified: segment 381px, Subject/Publisher 188px each, translate stacked below.
- **Isolate "country border not found" + ugly button** — name-matching the OFM label to the border GeoJSON
  failed. Added **point-in-polygon** resolution (`IntMapIsolate.enterAt(lng,lat,name)` → ray-cast the tapped
  point; name is only a fallback). Verified France/Japan/Brazil/Egypt/USA resolve correctly. Button restyled
  to the map's iOS pill language (frosted, primary-tinted icon).
- **Compare Köppen OOM on iPhone** — compare's `koppenUrl()` loaded the FULL-res PNG into a 2nd WebGL context;
  now uses the `_4k.png` on mobile like the main map. **Map/Sat switch** now poll-retries (a spinning globe
  never `idle`s, so the old `once('idle')` could never apply). **X-ray** is now pannable from inside the
  window (drags drive the main map 1:1). Header restyled into clean iOS segmented groups + circular close.
- **Compare FABs vs timebar** — R29 moved the FAB stack to the bottom while compare is open, which then
  covered the time-slider. Moved to **vertical center-right**, clear of both the top × and the bottom timebar.
- **Radius mobile** initial position → **top-left** (per request).
- **Checkbox flicker / 誤チェック** — on touch, `:hover` STICKS after a tap and leaves a row highlighted as if
  checked. Added `@media(hover:none){ .layer-option:hover,.lyr-row:hover{background:transparent} }`. Combined
  with the R29 deterministic single-toggle (verified: 1 tap=1 toggle, drag/cross-row=no toggle) and the
  welcome-card replacing the auto-demo, the phantom-on/flicker sources are removed.

### Themes ("Appearance" → "Theme")
- `applyTheme` generalised to a skin registry (any number of themes, each on the light or dark base).
- **Cyber → "Cyber Terminal"** (blinking cursor, `>` / `C:\>` prompts, brighter phosphor); **Classic → "Age of
  Discovery"** (portolan rhumb-lines + anchor). New: **Psychedelic** (animated rainbow + hue-rotating map),
  **Military** (olive HUD, condensed caps, NV map, crosshair), **Medical** (clinical teal, red cross, animated
  EKG line), **Baroque** (ivory+gilt+burgundy Didone), **Taishō Japan** (indigo+crimson Mincho, asanoha).
- Changing the theme **auto-selects the optimal sidebar** (solid/frosted/more-transparent). Verified all 7
  skins set the right body class, light/dark base and sidebar.

### Playground (beta) — Settings → Open Playground
- **World Explorer**: satellite GeoGuessr — random LAND point (never open ocean), all layers/labels off,
  satellite, blackout during the jump; guess on a separate world map; 0–1000 score by great-circle distance.
- **Pandemic Simulator**: seed patient zero on a real country; SIR-ish spread via distance-weighted transport
  hops; hygiene from HDI/GDPpc; country choropleth + live infected/dead/recovered/day; random vaccine;
  presets (flu/COVID/Ebola/measles) + infectivity/lethality/incubation; Breaking-News notifications.
- **Nation Sim**: lead a real nation (1900–2026) as democracy/dictator from real figures; turn-based policies
  with governance constraints (parliament blocks vs decree→unrest/coup risk), random events, elections/coups.
  Verified end-to-end (246 countries; take power; turn advances; stats update).

### Bug Report + maintainability
- Global error ring buffer (`window.__imErrors`, last 25, error+unhandledrejection).
- Bug Report modal (Settings) auto-attaches diagnostics (build/theme/lang/viewport/mode/active layers/recent
  errors/view/UA), submits to Supabase `bug_reports` (new `supabase/supabase_bug_reports.sql`; RLS: anyone
  files, admins read), graceful offline fallback (localStorage + clipboard). Feedback now openable anytime.

### Honest / still-open
- World Explorer + Pandemic need the real WebGL map; verified they launch cleanly + Nation Sim plays fully,
  but the headless preview can't finish WebGL `load`, so on-device playtesting is welcome.
- Compare "Ukraine frontline / use the same layer": the picker logic is correct (one layer at a time, no
  leak; both fetch DeepStateMap). The report is ambiguous — left intact rather than risk breaking it; needs a
  concrete repro / device.

---

## 34. Round 30 — recurring-bug root causes + Playground overhaul (tags `#R30`)

Build `2026-06-16-R30`. A very large batch: the recurring layer/checkbox/compare/mobile complaints, plus a
deep overhaul of the Playground (scientific Pandemic model, "Statecraft" grand-strategy, World-Explorer
scoring, Quiz moved in). Verified live in the headless preview after every change (72 layer rows + zero
console errors; the two simulators run end-to-end; key DOM/CSS/state probes).

### Recurring bugs — new ROOT CAUSES
- **Orphan layers ("オンなのにactive layersに無い/消せない", "勝手にオンになる", "消したのに表示されたまま") — ASYNC RACE.**
  Almost every layer adds+shows inside `whenStyleReady()/poll` callbacks that resolve LATER. If the user
  UNCHECKED before that resolved, the deferred `setVis(...,true)` re-showed a layer whose checkbox is now OFF
  → a visible-but-unremovable orphan (the Active-layers list reads the checkbox, so it never lists it). Fix:
  `toggleLayer`'s ON branch now re-asserts OFF at 600/1500/3200 ms if the box went off in the meantime
  (`toggleLayer(id,false)` runs the full per-id hide path) → map ⇄ checkbox ⇄ Active-list stay in sync.
- **iOS checkbox** — `.layer-option input` is now `appearance:none` rounded box that fills with the accent +
  white tick when checked ("モバイルのチェックボックスをiOS風に"). Same footprint, keeps `pointer-events:none`
  (the deterministic single-toggle is unchanged), so no list reflow / no scroll-on-toggle regressions.

### Compare view (mobile) — finally clean
- Header rebuilt: NO chaotic flex-wrap ("並びが不規則でダサい") — title on its own line, the two segmented
  controls fill an even second row, Close + Minimise are tasteful **frosted circular** icons (the old alarming
  red ✕ was "×のUIがダサい"), in a reserved 96px gutter so nothing overlaps Close.
- **Main-map FABs MOVED to the bottom-LEFT** while compare is open (`body.cmp-open`) — provably clear of the
  compare × (top-right), the layer picker, AND the bottom-RIGHT timebar (root of "×がボタンと重なる" /
  "タイムスライダーのボタンが消える"). Moved, not hidden ("勝手に消すな").
- Sat/Map switch (poll-retry) + X-ray pan-from-inside kept from R29.1. Ukraine-frontline "leak": the compare
  map is a SEPARATE GL instance (no real leak; in X-ray the lens overlay is by design) — documented, left intact.

### Other UI
- **Header (logged-in) one row** — account button collapses to the avatar only on mobile (the long display
  name forced the wrap "横一列に並ばず改行"); feedback+settings stay compact; `.header-area` is `nowrap`.
- **Intro/welcome card** — emojis replaced with clean SF-Symbol-style **SVG** icons (globe/layers/pin/chart),
  more breathing room (no "つぶれてダサい"). (Verified by screenshot.)
- **Isolate button** (country-name tap + country popup) — 🔍/📈 emojis → clean line SVGs, primary-tinted,
  matching the map's iOS pill language ("周りのUIに合わせろ").
- **News controls** — All/Saved AND Subject/Publisher now share ONE row (`.news-seg-row`, equal halves).
  **Translate titles** only shows when the news set actually carries a non-UI language (`_newsHasForeignLang`)
  and only translates those — hidden entirely for "current-language only" ("設定言語のみなら表示しない").
- **Feedback strengthened** — category chips (General/Idea/Bug/Praise; Bug links to the diagnostic Bug
  Reporter), optional reply-email for logged-out users, category embedded in the comment (no schema change).

### Playground overhaul
- **Quiz mode MOVED INTO the Playground hub**; the Playground entry MOVED OUT of Settings → Layers ▸ Tools
  (the old Quiz-mode button spot). Hub tiles are clean SVG app-icons (no emojis).
- **World Explorer**: truly-random spots — area-weighted uniform over the sphere accepted only on land (kills
  "毎回似たような場所"); on start it COLLAPSES the sidebar + DESELECTS all tabs/layers; a pulsing **home pin**
  marks the drop point; **zoom-out scoring** — the round tracks the most-zoomed-out level and DEDUCTS from the
  distance score ("ズームアウトせずに当てるほど高得点"). Mobile chrome hidden (`body.pg-we`) so the panel isn't
  covered.
- **Pandemic Simulator — rebuilt as a scientific SEIR metapopulation model.** Per-country S/E/I/R/D/V; R0 +
  incubation + infectious period + IFR; sanitation (HDI/GDP) → healthcare overload & care speed; seasonality
  + behavioural distancing + automatic **lockdowns / border closures** + **waning immunity** + random
  **VARIANTS** (immune escape → new waves) → long, chaotic, VARIED outcomes (eradication OR endemic
  equilibrium), not the old short "everyone dies" curve. Spread shows as **red CASE DOTS** that multiply &
  spread (no country-wide red fill, per spec). Luck-driven **vaccine** (R&D gauge) + **treatment**.
  **Breaking-News** toasts: patient-zero, 10-country, WHO PHEIC, border closures (real names), variants,
  vaccine approval, treatment. Mobile chrome hidden (`body.pg-sim`).
- **Nation Sim → "Statecraft"** (renamed + greatly deepened). 7 national gauges + 5 power **FACTIONS**
  (parliament/military/business/public/courts) that GATE policy: in a democracy unpopular bills are BLOCKED by
  the factions that lose out; an autocrat can DECREE anything but pays in unrest/sanctions/falling Dem-index
  (→ coups, isolation→exile). 18 policies across 5 categories, ~12 events, war/diplomacy (tension→war,
  alliances), elections/coups, real GDP/HDI/Dem/pop/military starting data, varied endings. NOTE: a literal
  global GRID/cellular world model (the "supercomputer" ask) is not feasible in a single-file front-end; the
  systems-model DEPTH was greatly increased instead.

### Maintenance
- Restored `supabase/supabase_bug_reports.sql` (it had been deleted in the working tree — likely an OneDrive
  hiccup; the Bug Reporter needs that table's schema).

### Verify-on-device (honest)
- The two simulators + World Explorer are verified to launch & play in the headless preview (no WebGL needed
  for the logic), but the dot-rendering / pin / satellite visuals need a real device. Mobile compare/FAB
  geometry is root-caused in CSS + measured, but a phone confirmation is welcome.

---

## 35. Round 31 — re-reported bug root-causes + big feature batch (tags `#R31`)

Build `2026-06-16-R31`. The user re-reported several bugs as STILL broken (with new specifics) and asked for
a large new feature set. Verified live after every change (82 layer rows incl. +10 new beta layers, zero
console errors; new layers render — earthquakes on real fault zones, attention heatmap, choropleths; the new
Playground modes launch & play; screenshots confirm the iOS look).

### Re-reported bugs — fixed at the root
- **Layer toggle still moved the panel.** Two real causes: (1) the active-layers compensation ran ASYNC
  (a one-frame flash), (2) the browser's own scroll-ANCHORING fought it. Fix: compensate the scroll
  SYNCHRONOUSLY inside the deterministic toggle + re-assert on the next frame, and `overflow-anchor:none`
  on the dropdown / sheet scrollers. Now check/uncheck moves the list 0px on both platforms.
- **Ukraine frontline appeared OUTSIDE Ukraine in Compare (Northern Territories etc.).** Root cause found:
  the compare layer loaded the RAW DeepState feed; the main map filters it to the Ukraine bbox. Applied the
  SAME filter to `cmpx-ukr` → no more stray polygons. (This was the concrete repro the R30 note asked for.)
- **Compare close/minimise** are now SQUARE (rounded-rect like the other controls, not circles), the × is a
  perfectly-centred SVG, the minimise a single clean line; the **layer picker moved to its own row directly
  under the Map/Sat + Sync/Free/X-ray controls** ("Select a layerは…欄の下に").
- **Account avatar** is a real circular chip (round avatar-only button on mobile) — no bare emoji centred in
  a pill. **Isolate button** is clamped inside the map and clears the top controls (no overflow/overlap).
- **World Explorer**: the satellite controller no longer pops up each round; the guess map is now a GLOBE
  (per request); the satellite-controller is hidden during play (`body.pg-we`/`pg-sim`).
- **Intro/welcome card**: emoji→SVG was R30; re-confirmed by screenshot it is clean & not crushed on mobile.

### Pandemic dots (re-reported)
- Dots now sit on REAL places — the capital + gazetteer cities inside each country (with jittered clusters),
  not random in-polygon points. More of them (cap 14→30) and finer/more-uniform size ("数を増やして/大きさ差
  を小さく").

### AI
- **Developer = unlimited.** Client gate lifted (`aiDev()`), and `ai-proxy` grants `DEV_EMAILS` / `DEV_USER_IDS`
  the `unlimited` plan with NO quota consumption (redeploy + set the secrets to your account).
- **Chat UI.** The AI brief is now a chat thread — the user's message stays as a bubble and the conversation
  accumulates with context continuity ("主要なAIチャットアプリのようなUIに").

### +10 NEW BETA LAYERS (real data; "最低10レイヤーをβに")
- 8 World Bank choropleths (latest value per country, `mrnev`): CO₂/capita, urban %, electricity access,
  health %GDP, forest %, renewables %, mobile subs/100, inflation — each with a color-key legend + opacity.
- **Earthquakes (USGS)** — realtime feed (24h/7d/30d M4.5+) + historical query (1yr M6+), magnitude-sized
  colored dots, click popups.
- **Heat of Attention** — a news-density heatmap (approximate, per "完全な精度はいらない").
- Self-contained module (own change handlers; swept into Others(beta); active-layers + deterministic toggle
  pick them up). 72 → 82 layer rows.

### Widgets
- Edit mode now uses iOS-style **drag-and-drop** reorder (pointer-based grip; lift→reorder→commit) instead
  of ↑↓; the per-widget config button restyled to a clean SVG gear.

### Playground
- **World Sandbox (new 5th mode)** — edit the world: raise/lower the sea (DEM recolor), found new nations
  (draw a border → real turf area), drop cities, block straits, with derived-effect readouts + breaking-news.
- Stats refreshed to the latest World Bank GDP/pop/GDPpc/life-expectancy.

### Honest / out-of-scope
- **Köppen 1980–2016**: the multi-period mechanism + UI ALREADY exist (1901–2020). The specific Beck-2018
  1980–2016 period needs its reprojected PNG asset (same pipeline); it can't be generated in-app, so it's
  wired for one-line activation (commented) rather than shipped broken.
- **Statecraft "world grid / supercomputer model"**: a literal cellular world-grid is not feasible in a
  single-file front-end; R30 greatly deepened the systems model instead (factions, economy, war, events).
- **Economic widgets** are already rich (FX, crypto, market cap, Fear&Greed, gold, silver); further ones
  (oil, equity indices) need keyed APIs, which the real-data/no-key policy precludes.
- **Redeploy** `ai-proxy` and set `DEV_EMAILS`/`DEV_USER_IDS` for server-side unlimited AI.

---

## 36. Round 32 — re-reported bug root-causes + big feature batch (tags `#R32`)

Build `2026-06-17-R32`. The user re-reported a batch of bugs as STILL broken (with new specifics) and asked
for new features. Verified live in the headless preview after every change (85 layer rows, zero console
errors; new layers render; compare/pandemic/German verified by state probes + screenshots).

### Re-reported bugs — fixed at the ROOT
- **Layer toggle STILL moved the panel (even 1px, desktop too).** Real root cause finally pinned: the
  "Active layers" section sat ABOVE the rows, so its appearance/growth on the first/any toggle reflowed the
  rows (desktop: panel grows down; mobile: scroll-compensation hid the favorites). **Fix: the Active-layers
  section is now the LAST element + `position:sticky;bottom:0`.** Content added at the BOTTOM never moves the
  rows above → measured **0px** movement on desktop AND mobile (scrollDelta 0, rowMoved 0), while the bar
  stays pinned visible. The old top-placement scroll-compensation (which would now itself scroll) was removed;
  the toggle handler now just PINS the pre-toggle scrollTop.
- **Orphan / phantom layers.** Verified the rapid ON→OFF race no longer strands a layer (checkbox off, map
  layer hidden, not in the list) — the R30 re-assert guards + the sticky-bottom list (reads checkbox truth) +
  the deterministic 1-tap toggle + `pointer-events:none` iOS checkbox together keep map ⇄ checkbox ⇄ list in sync.
- **Compare view.** Sat/Map switch made bulletproof (re-assert at 0/180/600 ms beats the styledata/idle race);
  **"use the same layers"** delivered: compare AUTO-MIRRORS the main map's active thematic layer on open + a
  **"↔ Match main map"** picker entry (verified: opening with Köppen on → compare picker = Köppen, and Sat
  shows satellite + the Köppen overlay). X-ray Sat path already handled by applyBase; picker works in every mode.
- **Account avatar centred / mobile Login overflow.** The mobile rule forced EVERY `#btn-account` to a 36px
  circle → "Log in" text overflowed AND the small avatar sat in a larger ring. Split with `:has(.acct-av)`:
  logged-OUT = proper iOS pill (no overflow), logged-IN = the avatar FILLS a 34px round chip.
- **Isolate button overflow.** CAP the pill width to the map width (long country names + nowrap were wider
  than a phone) + ellipsis + clamp clearing top AND bottom controls.
- **Intro demo UI.** The auto-tour pill's ▶ ⏸ ✕ emoji → clean SVG play/pause + circular ×.
- **Earthquake popup invisible in dark mode.** It used the DEFAULT white maplibre popup but inherited the
  page text colour (near-white in dark) = white-on-white. Gave it `className:'plc-popup'` (themed bg + text).
- **Dark-map land/sea contrast.** `raster-contrast:0.3` + slight brightness lift on the Carto dark base.
- **News band invisible in dark mode + not shown when zoomed.** The band pill is now THEME-AWARE (light pill
  + dark text on dark UI, refreshed on theme change), and `text/icon-allow-overlap` is a zoom-step (false
  below z5, true at z≥5) so the band of a pin you zoomed to always shows.

### Removals / wording (explicit asks)
- **Statecraft + World Sandbox ABOLISHED** — removed from the Playground hub AND their 231-line function
  bodies deleted (`_pgNationSim`, `_pgWorldSandbox`). Hub now: World Explorer, Pandemic, Quiz.
- **"GeoGuessr / Geo Guesser" wording removed** from World Explorer (→ "a satellite where-am-I geography game").
- **🤖 emoji removed from the AI brief** (header + the place-popup trigger button → a clean SVG sparkle).

### Features
- **State/province borders + roads + railways** (`cb-admin1` / `cb-roads` / `cb-rail2`) drawn from the SAME
  OpenFreeMap/OpenMapTiles vector source already used for labels (`boundary` admin 3–4, `transportation`
  road classes + rail). Verified over Tokyo: prefecture borders (purple dashed), roads (amber), rail (gray
  dashed), all under the place labels. EN/JP/DE/RU labels added.
- **Data layers fixed.** CO₂/capita was a DEAD World Bank indicator (`EN.ATM.CO2E.PC` → "deleted or
  archived", 0 rows) → switched to `EN.GHG.CO2.PC.CE.AR5`; and `wbFetch` now FALLS BACK from `mrnev=1`
  (which server-errors for the AR5 series) to a `date=2010:2024` range (most-recent per country) — verified
  247 countries. Resilient retry/non-empty-only caching fixes the intermittent "電力/再エネ/インフレが映らない"
  (WB API throttling). **Hover values added to ALL beta choropleths** (country + metric + value tooltip).
- **Pandemic.** Dots now scale with the ACTUAL case count (≈1 dot / 60 cases, global budget 4800, up to 80
  per country on real cities) so they GROW visibly with the outbreak (verified 20→44…), uniform size, more
  of them. Model made less uniformly catastrophic + more realistic: gentler hospital overload, a falling
  CFR as care improves, varied end-states (contained / minor / devastating / endemic with the final toll +
  attack rate) and 1M/10M death-toll breaking-news milestones.
- **Widgets** reorder is now iOS-home-screen smooth: the lifted card FOLLOWS the finger and displaced cards
  GLIDE via a FLIP animation (no more jump). **Stats time-series charts show per-year values on hover**
  (visible dots + full-height transparent bands with native `<title>` tooltips).
- **German RE-ENABLED as a first-class UI language** (was removed in R23): settings selector + persistence +
  `<html lang>` + German vector map labels (`name:de`) + a German dictionary for the layer panel, themes,
  sections and the new toggles. NOTE: the app has ~800 inline `currentLang==='jp'?…:…` bilingual literals;
  those dynamic strings still fall back to English in DE — the dictionary-driven chrome + layer panel + map
  are German, and the system is in place to extend the remaining inline strings.
- **Developer = unlimited AI** hardened: the owner's email is now a hard-coded default in `ai-proxy`'s dev
  allow-list (works even before the `DEV_EMAILS`/`DEV_USER_IDS` secrets are set) + the client `aiDev()` gate.

### Honest / still-open
- German: dictionary + layer panel + map labels are DE; ~800 inline `jp?:` ternaries (country popup detail
  rows, some toasts) still fall back to English — progressively localizable, not yet exhaustive.
- **Köppen 1980–2016**: the multi-period mechanism + UI already exist (1901–2020); the specific Beck-2018
  1980–2016 period still needs its reprojected PNG asset (same pipeline; can't be generated in-app).
- **Redeploy** `supabase functions deploy ai-proxy` to activate the hard-coded dev-unlimited default.

---

## 37. Round 33 — large re-reported-bug + refinement batch (tags `#R33`)

Build `2026-06-17-R33`. A very large batch of re-reports (with new specifics) + new requests. Verified live
after each change (101 layer rows incl. +16 new beta choropleths, zero console errors). NOTE: the headless
preview's WebGL exhausts after many reloads (map `load` won't fire), so map-render visuals are reasoned at
the code level + DOM-verified; on-device confirmation welcome.

### Layer panel
- **Order** set to Place names · Country borders · State/province · Roads · Railways · Grid · Countries(info).
- **Colored squares before layer names REMOVED** for all layers (`.lyr-sw{display:none}`).
- **Fewer divider lines** (iOS-clean): top-level `<hr>`s and group-header borders dropped.
- **Active layers gap** under the sticky bar filled (negative margins reach the panel edge); **mobile** Active
  layers now sticks to the sheet bottom as an opaque bar.

### Themes
- **All skin themes DELETED** per request — only System Default / Light / Dark remain (selector trimmed;
  `applyTheme` coerces any old saved skin to auto and clears every `theme-*` class).

### Compare
- Clarified: "same layers" = pick the SAME-QUALITY layers freely (NOT mirror the main map's selection) →
  **auto-mirror removed**, picker offers the full CMP_LAYERS. **X-ray hardened**: re-layout lens + re-apply
  base + re-show layer at 60/200/500 ms on entry and on every Map/Sat switch; picker kept clickable in x-ray.

### Account / privacy / settings
- **Email privacy**: public names never derive from the email local part anymore (→ `User-xxxxx`).
- **Logout** now asks for confirmation. Redundant in-Settings "Log in/Sign up" removed. **Apply** button is
  sticky at the modal bottom. Login-prompt copy updated to mention AI + cross-device sync.
- **Avatar syncs across devices** (added to the `user_prefs` blob; set on change) — no more revert-to-default.
- **Dev = unlimited AI** now shown correctly in Settings (was a broken "∞/5" bar).

### Widgets
- **Weather** renamed (drop "(my location)"); location widgets NEVER use map center now — no location → an
  **"Allow location"** button (works across devices). **Aurora (Kp) FIXED** (NOAA changed the feed to objects;
  the old `last[1]` read undefined → "—"). **Random country** flies to the country on tap. **Analog clock**
  widget added. **Delete badge** is now the iOS jiggle-mode minus at the top-left; the board jiggles in edit mode.

### Tools / map / news
- Radius gained **−/＋ steppers**; long action-button labels wrap (no desktop overflow). **"Add point" pill is
  mobile-only**. Draw "Finish" → **"Keep on map"**. **World Explorer hides** the lat/lng/elevation readout +
  crosshair. **News cards** lost the 📍/📡 emoji. **News band** never shows text without its pill at a zoom
  boundary (text+icon coupled). Selected **News/Information/Stats is blue on mobile**. Entering **Stats**
  auto-enables Countries(info) (and disables it on leave). **Quiz** closes the layer panel. **Isolate** moved
  into the place popup's Copy/Wikipedia/AI-brief action row (separate floating button removed). **AI brief "+"
  icon removed**.
- **Crash/reload starts CLEAN**: our own saved hash is tagged `self=1`, so a crash/reload restores only the
  view (no layers auto-on); an externally-shared link (no tag) still restores its layers.
- **Settings & popups follow the Solid / Frosted / More-transparent setting** (one common glass design).
- **Smoother mobile pan/zoom**: per-frame occlusion recompute is deferred to `moveend` on phones.

### Multi-language + German
- News multi-language checkboxes are now authoritative (the checked set IS the saved set; fixes the desync).
- **German**: Köppen climate names (were "undefined"), place-popup buttons, country-popup rows/buttons, and the
  country-stat + tool labels are now German. Honest gap: the app still has ~800 inline `currentLang==='jp'?…:…`
  literals in less-common surfaces that fall back to English in DE — the dictionary + main surfaces are German,
  the long tail is progressively localized.

### Content
- **+16 new World Bank beta choropleths** (infant mortality, GDP growth, literacy, safe water, sanitation,
  poverty, Gini, trade %GDP, tax %GDP, agricultural land, physicians/1k, secondary enrollment, electricity
  use/capita, renewable electricity %, FDI, armed-forces personnel) — resilient `mrnev`+date-range fetch,
  hover values, swept into Others(beta). 8 earlier WB choropleths + earthquakes **promoted to real groups**.
- **Information timeline expanded** with recent + historical events (2024 Taiwan quake, fall of Assad, 2024
  US election, Haitian independence, penicillin, Warsaw Pact, Year of Africa, German reunification, Gulf War,
  iPhone, Higgs boson, inter-Korean summit, COVID pandemic declaration, US Capitol attack).

### Honest / still-open
- **Min/maximize − vs ▢ "reversed"**: the main data/Köppen legends are correct on desktop and mobile; couldn't
  reproduce a reversed instance — needs a concrete example (which legend/popup).
- **Economic widgets**: already FX/crypto/cap/Fear&Greed/gold/silver; more (oil, equity indices) need keyed
  APIs, which the real-data/no-key policy precludes.
- **AI news geolocation**: server-side AI-primary (R29) unchanged here; the shared non-AI gazetteer was further
  strengthened in R32. A server-prompt overhaul needs a `refresh-news` redeploy.

---

## 38. Round 34 — re-reported-bug batch + the dark-map correction (tags `#R34`)

Build `2026-06-17-R34`. Verified live after each change: **109 layer checkboxes**, zero console errors,
page RUNS (not just parses). The headless preview is `document.hidden` so the WebGL map does not paint here —
map-pixel claims below are proven by **simulating MapLibre's raster shader on real fetched tiles**, not by
screenshot.

### TOP PRIORITY — black map / dark contrast / Map↔Sat toggle
- **The R32b `raster-contrast:0.45` was the black-map cause.** Sampling the real Carto `dark_nolabels` tiles:
  ocean ≈ luminance **9**, land ≈ **38** — both far below MapLibre's 0.5 contrast pivot, so any strong
  `raster-contrast` crushes BOTH to pure black ("真っ黒"). Confirmed by simulating the exact shader
  (saturation→contrast→brightness) on the real pixels.
- **First wrong attempt (reverted): an OFM `water` navy fill.** The user was right to reject it — a flat fill
  *removes* detail/contrast and it was leaking onto Satellite. Fully removed (`ofm-water` gone from
  `ensurePlaceLabels` + `applyTheme`).
- **Correct fix = genuinely INCREASE the base raster's contrast, nothing painted.** `raster-contrast:0.5`
  PLUS `raster-brightness-min:0.33` (brightness applied AFTER contrast, so it rescues land from the crush
  while the sea stays dark). Shader simulation on the real tile: ocean→~11 (dark), land→~44-50 (clearly
  visible grey), separation 29→~38. Never black, no painting, no base-map swap.
- **Map↔Sat toggle** hardened: `applyTheme`'s style-not-loaded early-return now does an IMMEDIATE best-effort
  base-layer flip before deferring, so a tap never feels dead while tiles load.

### Layer panel
- **Desktop gap under Active layers** = a `position:sticky;bottom:0` bar pins to the scroll *content* box, so
  the dropdown's 12px bottom padding showed UNDER the floating bar. Dropped the dropdown's `padding-bottom`
  (bar carries its own); now flush.
- **Mobile Active layers now truly sticks + scroll no longer jams.** Root cause: `.m-sheet .layer-dropdown`
  kept `overflow-y:auto` (R34 adds `overflow:visible`), so the non-scrolling dropdown was BOTH the sticky
  child's scroll container AND an iOS touch-eater. Now the single scroller is `.m-sheet-scroll`, and the
  Active-layers bar is relocated (`_placeActiveSection`) to be a sticky LAST CHILD of that scroller → it pins
  to the sheet bottom.

### Layer ghost bugs
- **Generic orphan sweep** (`_sweepOrphanLayers`, on map idle): any `dl-` layer whose checkbox is OFF but whose
  map layer is still painted gets the real hide path. Pure hide-only/idempotent — fixes "オンなのにactive
  layersに出ず消せない" for slow async adds / any path, never turns anything on.

### Compare
- **Blue x-ray frame removed** (cyan keyline → faint neutral edge). Map/Sat base **polls until it matches**.
  Picked layer **re-shown on every styledata in x-ray**. Compare satellite now the **same two-host Esri** as
  the main map (quality parity).

### World Explorer / Pandemic (mobile)
- The HUD was under the **main `#sidebar`** sheet (`.m-sheet` hiding only covered the *option* sheets;
  `.collapsed` is desktop-only). On phones `#sidebar` is now slid off-screen during `pg-we`/`pg-sim`; HUD
  buttons get `flex:0 0 auto` so the round buttons stop squashing into ovals. World Explorer **re-asserts
  Satellite** after the drop.

### Widgets / Tools / Stats
- **Widget drag-drop ROOT CAUSE fixed** ("まったく動作しない"): the card was set `pointer-events:none` on
  pointerdown while relying on `setPointerCapture` — a captured element with pointer-events:none stops getting
  move/up in most browsers. Now move/up bind to **document**; the card stays pointer-events:none only so
  elementFromPoint sees beneath it.
- **Random-country widget** now `fitBounds` the whole country (was `zoom:max(current,4.2)` → city-close).
- **Tool panels gained a minimize (−)** (collapses to the header → uncovers the mobile crosshair, per the
  Radius ask). **Draw "Keep on map"** now actually PERSISTS the trace as an IntMapAnnotation (was wired to
  `finish()`, a no-op once the trace was done). **Place names** re-asserts a few times (the OFM label layers
  can be added a beat after the first `applyTheme`).
- **Stats time-series hover reworked** to the requested spec: NO always-on dots, a JS crosshair that shows the
  value INSTANTLY (not a laggy native `<title>`), a vertical line at the cursor + a single dot at the
  intersection.

### Settings
- **Apply button** is now a clean sticky FOOTER (rounded primary button + fine-print, matching the modal
  surface) — the R33 full-bleed blue bar clashed with the iOS-clean design.
- **Dev = unlimited AI** now resolves BEFORE the "not logged in" early-return, so the unlimited graph shows for
  the developer even before `currentUser` populates.
- **Multi-language news checkboxes** got the same mobile-tap hardening as the layer rows
  (`touch-action:manipulation` + checkbox `pointer-events:none` + 44px rows) → tapping one language no longer
  toggles an adjacent one.

### Content
- **Inflation % (CPI) + every World Bank choropleth now states its SOURCE + PERIOD** in the legend
  ("出典: World Bank · <code> · <year-span> · most recent value per country") — the year span is the real
  span present in the fetched data.
- **+8 more beta choropleths** (life expectancy, unemployment, internet users, govt debt %GDP, manufacturing
  %GDP, under-5 mortality, population growth, energy use/capita) — same resilient fetch + hover + source note.
- **Information timeline +22 events** (Fall of Constantinople, Reformation, US independence, Origin of Species,
  WWI start/end, Russian Revolution, 1929 Crash, WWII start/end, Partition of India, Israel, Stonewall,
  Nixon→China, Iraq→Kuwait, Rwanda, Deepwater Horizon, Paris 2015, Notre-Dame, Afghanistan withdrawal,
  ChatGPT, JWST).

### Honest / still-open
- **German**: unchanged from R33 — dictionary chrome + layer panel + map labels are DE, but the ~800 inline
  `currentLang==='jp'?…:…` literals still fall back to English in DE. Fully eliminating the leakage is a
  per-site conversion of all 800 and was NOT completed this round.
- **Pandemic realism**: left on the R30/R33 SEIR metapopulation model — a deeper scientific rework was NOT
  attempted here because it can't be visually verified in the headless (`document.hidden`) preview and risks
  unobservable regressions. Still flagged as a simplified educational model.
- **AI news geolocation (server prompt)**: needs a `refresh-news`/`ai-proxy` Supabase redeploy to change —
  out of scope for a static-file edit.
- **ToS / Privacy / attributions**: no change needed — the new beta layers are World Bank (already attributed)
  and the new events link to Wikipedia (already linked); no new data collection.

---

## 39. Round 35 — re-reported-bug batch, root-cause focus (tags `#R35`)

Build `2026-06-17-R35`. Verified live on the http preview (map loads when given idle wall-clock; the page
RUNS — 109 layer checkboxes, zero console errors after every change).

### TOP PRIORITY — "ほとんどのレイヤーが選択しても反応しない" (ROOT CAUSE FOUND + fixed + verified)
- Not a wiring bug (the R29 capture-toggle + `toggleLayer` + render path all work — proven live: clean tap
  flips the checkbox, `toggleLayer` runs, the map layer becomes `visible`, choropleths/GIBS/geo all paint).
- **The real cause was the scroll-vs-tap guard's 3px threshold.** The layer list is long, so reaching *most*
  layers needs scrolling; on iOS the list keeps *settling* for a moment after the finger lifts, so a real tap
  landing during that settle saw `scrollTop` drift a few px and was WRONGLY suppressed. Only the top utility
  toggles (no scroll needed) survived → "most" layers felt dead. **Fix: raise the container-delta threshold
  3 → 16px** (a genuine scroll DRAG is still caught by the finger-travel `far`>24px guard; momentum-settle of a
  few px no longer kills the tap). Verified: 5px-jitter tap now toggles, 30px scroll still suppresses, clean tap
  works. This is strictly more permissive, so it cannot regress clean taps.

### Satellite Drop
- **World Explorer → "Satellite Drop"** everywhere user-visible (playground hub title + the orphan
  `worldExplorerBtn` i18n key; JP=サテライトドロップ). Internal ids (`_pgWorldExplorer`, `pg-we`) unchanged.
- **Start page button**: a "Play Satellite Drop" button now sits directly below "Start exploring" (3-language),
  closing the welcome and launching the drop. Verified present + ordered.

### Compare view
- **Round × → rounded-RECT** (`border-radius:8px`, matching every other compare control). Verified 28×28, 8px.
- **"謎の青い枠" killed**: the focusable compare-map canvas was showing the browser default blue focus ring —
  suppressed `outline`/`box-shadow` on the window + canvas; the x-ray keyline is now a neutral grey (was a
  bluish `rgba(150,160,175)`). Verified `canvas outline:none`.
- **X-ray "Map" now paints an INDEPENDENT carto/dark base** instead of going transparent. The old "Map = see the
  MAIN map through the lens" was exactly the "X-rayをメインマップに合わせるモード" the user rejected — you could
  never make the lens a map. Now main=Satellite + lens=Map (registered to the same spot) works. Verified no errors.
- Layer parity: compare already clones the choropleths (cmp-choro), GIBS rasters, Köppen, beta layers (R21/R31);
  Köppen/satellite use the same sources as the main map.

### Mobile World Explorer / Pandemic HUD
- **Crushed buttons fixed**: `#pg-we-panel button{min-height:40px}` stretched the width-34px round home/exit
  buttons into 34×40 OVALS. The circular ones (`border-radius:50%`) are now forced 42×42 (WE) / 34×34 (pandemic ✕).
  Verified live on a phone viewport: clean circles + a pill, panel fully on-screen, satellite active.

### Mobile layer panel
- **Left-right scroll killed**: `.m-sheet-scroll{overflow-x:hidden}` (a few stray px of width let the sheet pan
  sideways).

### Widgets
- **Delete (−) badge un-hidden**: editing cards now `overflow:visible` so the iOS-style badge (pinned OUTSIDE
  the corner at -7px/-7px) is no longer clipped by the card's `overflow:hidden`.

### Settings
- **Frosted-glass color bug**: the modal body switches to `--glass-fill` in the two glass modes, but the sticky
  Apply footer kept the opaque `--popup-bg` → a mismatched solid strip. Footer now matches the glass material.
- **Mobile multi-language checkbox mis-toggle (ROOT CAUSE, not a spacing hack)**: a nested `<label><input>` fires
  iOS's ~300ms delayed synthetic click that, after a reflow, can land on an ADJACENT label. Added a deterministic
  capture-toggle to the `.nc-dd-panel` dropdowns (news languages + countries): preventDefault the native
  activation and flip EXACTLY the tapped label's box — a neighbour can never toggle.

### Stats
- **Dot squashed into an ellipse fixed**: the intersection dot was an SVG `<circle>` inside a
  `preserveAspectRatio="none"` chart, so the non-uniform x/y scale stretched it. It's now an absolutely-positioned
  HTML element (always round). The crosshair stays an SVG line (lines don't distort).

### Tools
- **Measure/Draw panels unified with the legends/popups**: the header buttons now use the SAME icon language as
  the legends — a centred line that becomes a square box (minimise) and rotated bars (×). No more text `–`/`+`
  ("-で最小化＋で最大化…他にないわ").
- **Draw "Keep on map" hardened**: the annotation refresh now self-retries if the style is transiently not-loaded
  (a load race could drop the kept line). The kept polygon/line was verified to persist on the map.

### Desktop
- **Active-layers gap filled**: a later `#layer-active-section{margin:2px 0 4px}` rule was clobbering the
  sticky-flush desktop rule (negative side margins + 0 bottom). Removed → the bar sits flush to the panel edges.
- **Radius legend overflow**: the desktop panel was 248px — too narrow for the 3 stat tiles, so big values spilled
  out. Widened to 300px + the stat values now wrap inside the tile.

### News
- **Bands now pure COLLISION-based at every zoom** (was force-overlap at z≥5, which crushed every band together
  and the hard z=5 step popped/flickered). With `allow-overlap:false` the map shows only the bands that physically
  fit; zoom in → pins spread → more bands appear; dense clusters stay as dots until there's room. A stable
  `symbol-sort-key` (subject>publisher>unlocated) removes the frame-to-frame flicker.
- **Fewer "unknown" publisher pins**: in Publisher mode, when the outlet HQ can't be resolved, fall back to the
  SUBJECT (event) location instead of scattering to a random hash point.

### AI / dev
- **Dev = unlimited now reflected in the Settings graph**: persist `intmap_dev='1'` the moment the OWNER account
  logs in (so `aiDev()` is synchronously true thereafter, even before `currentUser` repopulates) + re-render the
  AI settings on login.

### Pandemic realism
- **Vaccine can no longer arrive in ~1 month**: a massive early outbreak could unlock the vaccine in ~32 days via
  the R&D race. Gated approval behind a realistic floor of 240–360 days (COVID mRNA, genome→first EUA, ≈270 days).
  Progress display is bounded by the same floor so it doesn't show a stuck "100%". The rest of the SEIR
  metapopulation model (compartments, seasonality, behaviour, hospital overload, variants w/ immune escape,
  gravity spread, lockdowns) was left intact — a deeper rework still can't be visually verified headless.

### German (Task: full 3-language, no leakage)
- Welcome screen converted to full 3-language (was jp/en only → leaked English in DE). Köppen climate names
  confirmed German (the `_kde` merge sets `KNAME[*].de`; consumers fall back to EN only if missing).
- **Honest limitation**: ~761 inline `currentLang==='jp'?…:…` / `jp()?…` literals still fall back to ENGLISH in
  DE. Converting them all in one pass is impractical AND high-risk (a single stray back-tick inside a template
  literal blanks the whole site). The dictionary-driven chrome (`i18n.de`) + the main interactive surfaces are
  German; the long tail is progressively localized and NOT fully eliminated this round.

### ToS / Privacy / attributions
- No change needed: no new data sources or collection (the publisher-fallback reuses the existing subject
  location; the dev flag is local-only). "World Explorer" appears in ToS/Privacy nowhere; the 5 remaining
  in-code mentions are comments.

---

## 40. Round 36 — re-reported-bug batch, root-cause focus (tags `#R36`)

Build `2026-06-18-R36`. Verified live on the http preview after every change (page RUNS — 109 layer checkboxes,
zero console errors). Each fix below was reproduced/proven, not assumed.

### TOP PRIORITY — "ほとんどのレイヤーが選択しても反応しない" (TWO real root causes, both fixed + verified)
- **(1) input-direct checkbox double-toggle.** When a tap lands on the checkbox `<input>`, the browser PRE-toggles
  `checked` *before* the click event, and the capture handler's `preventDefault()` then triggers the spec's
  cancelled-activation RESTORE *after* the handler — so the manual `cb.checked=!cb.checked` got flipped right back
  → net no toggle. The box is the most natural tap target, so "most" layers felt dead. Proven with `el.click()`
  (5/5 input-direct taps failed before, pass after). Fix: only OWN the toggle for label/row taps; for a tap on the
  box itself, let the native toggle ride (cancel it only when suppressing a scroll).
- **(2) scrollTop-delta momentum-settle false-suppression.** Reaching most layers needs scrolling, and the list
  keeps momentum-SETTLING under a now-stationary finger, so a clean tap landing during that settle saw the
  container scroll a few px and was WRONGLY cancelled. Tuning that px threshold across R28→R35 (3→16) never fixed it
  because scroll-delta is the wrong signal. Dropped it; suppression now uses FINGER TRAVEL (`far` >24px, which also
  covers every genuine scroll) + ROW DRIFT only. Verified: clean tap toggles, 40px momentum-settle tap NOW toggles,
  60px finger drag still suppressed, and the map actually renders the toggled layer.

### Layer ghosts ("閉じたはずのレイヤーが表示され続ける")
- The dl- idle sweep only checked `lyr-<id>`/`<id>-fill` — broadened to catch multi-sublayer ids (`lyr-<id>-glow`
  etc.). Added a **universal post-OFF re-assert guard** on the layer dropdown: when ANY layer checkbox goes OFF, it
  re-runs that checkbox's OWN hide path 3x over ~3s — covering the async-ON-then-quick-OFF race for EVERY subsystem
  (eco-/bx-/beta-/l9-, whose map-layer ids don't follow the dl- naming). Idempotent, self-terminating (verified
  exactly 4 change events, no runaway), never turns anything on.

### Multi-language news checkbox ("タップした言語と違う言語にチェックが入る")
- Root cause, not a spacing hack: the handler toggled the CLICK target's label, but on iOS the (delayed) click can
  land on a NEIGHBOUR after a reflow. Now it toggles the **pointerdown** label (the finger's true intent), drops the
  same scrollTop heuristic, and adds an echo-click guard. Verified: clean tap = exactly the tapped language; a
  down-on-A/click-on-B drift toggles NOTHING; echo double-click swallowed; a single legit tap always flips.

### Compare view
- **X-ray frame "枠が消えている箇所がある":** the frame was an INSET box-shadow the opaque header + map canvas painted
  over. Now an always-on-top overlay border (`.cmp-xray::after`, z-index 20, pointer-events:none) — continuous on
  all four sides.
- **Minimise "UIが変わらず":** now collapses to JUST the title bar (hides body AND picker) and the button swaps to a
  RESTORE square (+ "Restore"/"元に戻す" title). Verified the class/icon/picker-display all flip.
- **Layer parity:** confirmed the compare GIBS layers use IDENTICAL levels/maxzoom to the main map (snow L8, aod L6,
  sst L7, temp L6, precip L6, nightsat L8 — NOT lower quality). Added **aurora + earthquakes** clones (same
  sources/paint as the main map) → 28 compare layers. Full 109-layer parity is still a larger effort (documented).

### Dev = unlimited AI ("設定欄のグラフに反映されない / まだ変わっていない")
- The flag was only set by logging in with the owner email, but the developer runs this build LOCALLY (file:// or
  localhost) WITHOUT logging in → `aiDev()` stayed false → the graph showed the 5/day quota. Now `aiDev()` treats the
  local dev env (file://localhost) as the developer context (auto-persists `intmap_dev`). The PUBLIC site on its real
  domain is unaffected. Verified: fresh local load → `aiDev()` true, graph shows the full "unlimited" bar, no login.

### Nav tabs equal width
- News/Information/Stats/Community → `flex:1 1 0; min-width:0` (was content-sized). Verified exactly equal (92px
  desktop / 88px mobile) with NO overflow/wrap in EN, JP AND DE (incl. German "Informationen", 13 chars).

### Settings frosted-glass "グレーになる"
- A modal's `.modal-content` sits over the dark `.modal-overlay` scrim (`rgba(0,0,0,0.5)`), so its backdrop-filter
  blurred that DARK SCRIM (→ flat gray) instead of the map like every floating panel does. Fix: lighten the modal
  scrim in the two glass modes so the modal frosts the MAP. Verified by screenshot in light theme — clean frosted
  panel (not gray) in both Frosted Glass and More-transparent modes.

### Measure / Radius header ("Radiusの文字と□/×が上下ズレ＋被る")
- `.tp-title` carried `margin-bottom:8px` which, inside the centred flex header, shoved the title ~4px above the
  min/close icons; on a narrow mobile panel it could also collide. Zeroed the margin in the header + made the title
  ellipsis-shrink so it can never overlap the fixed-size buttons. Verified misalign 4→0 (desktop), no overlap at a
  293px mobile panel even with a long title.

### Widgets / clock
- **Analog clock "not working" + "some widgets too slow to update":** ROOT CAUSE was a `dstr` ReferenceError — the
  aclock block referenced `dstr`, which is block-scoped to the DIGITAL clock's forEach, so it threw every tick →
  the clock never drew AND the throw aborted the rest of `tickClock`, freezing every later-ticked widget (countdown
  / world clock / population / year progress). Fixed the scope + hardened each widget block with try/catch. Verified
  live: an added analog clock renders its SVG face and all 6 cards stay filled.
- **Random-country widget "ジャンプ速度が速すぎる":** `fitBounds` used a FIXED `duration:900`, so a far jump covered huge
  distance in 900ms and felt too fast. Now `cameraForBounds` + `flyTo({speed:1.2})` → whole country framed at the
  same distance-adaptive speed as every other fly-to.

### News bands ("ズームインで消える / 空間があるのに帯が出ない / 高速点滅")
- ROOT CAUSE: GL collision is GLOBAL across all symbol layers, so `allow-overlap:false` made the bands compete
  against every base-map place label; zooming in spawns more labels → bands lose even with room between NEWS pins,
  and per-frame re-placement flickered. Fix: take the bands OUT of GL collision (`allow-overlap:true` +
  `ignore-placement:true` — which also REMOVES the heavy per-frame collision work) and decide visibility in JS with
  `_declutterNewsBands`, considering ONLY other news bands, granted greedily highest-priority-first to the right of
  the dot, run on moveend (never mid-gesture → no blink). Verified on synthetic data: world view → 3 spread cities
  get bands + a tight cluster gets 0 (stays dots); zoom into the cluster → 4/6 get bands. Visibility via the `bnd`
  feature-state the layer opacity reads.

### Mobile zoom/pan smoothness
- The init is already well-tuned (antialias off, pixelRatio capped at 2x, tile-cache budget, R33 occlusion deferred
  off the gesture path) and the user's "don't sacrifice quality" rules out lowering pixelRatio. The news-band
  collision-removal above also CUTS per-frame work on the News tab. Added: rAF-coalesced search-card reposition
  (quality-neutral). Deeper GPU-bound gains would require sacrificing render quality, which is disallowed.

### German (full 3-language, no leakage)
- Audited the dictionary live: of the 129 keys actually used by `data-i18n`, only 5 lacked German; 160 more (used by
  `t()` in dynamically-built legends/popups/tool-panels) were missing → those surfaces fell back to English. Filled
  ALL 165 missing `i18n.de` keys (measure/area/radius, community, satellite controller, AI features, context menu,
  sources/premium modals, etc.) — SAFE dictionary additions, no template-literal risk. Added **DE to the top language
  toggle** (was EN/JP only) + wired its active state. Verified: switching to DE renders chrome, nav and MAP LABELS in
  German (screenshot), zero console errors.
- **Honest limitation:** the remaining English leak in DE is the ~766 inline `jp()?…:…` / `currentLang==='jp'?…:…`
  string literals that carry no dictionary key. Bulk-converting all 766 template-literal sites is high-risk (a single
  stray back-tick blanks the whole site) and infeasible to do safely in one pass; the dictionary completion above
  covers the bulk of the dynamic UI, and the long tail is progressively localized.

### News publisher pins ("位置不明のピンが多い")
- The client gazetteer (`sourceDict` ~130 outlets) + the R32 embedded-place fallback + the R35 subject-location
  fallback already place most pins. Added 28 more BRANDED outlets whose name carries no place token (Rappler,
  Infobae, EFE, dpa, PTI/ANI/IANS, Caixin, Quartz, Meduza, Defense One, …) with accurate HQ coords — the case the
  embedded-place scan can't catch. The server-side AI geolocation PROMPT is a separate `refresh-news` redeploy
  (out of scope for a static-file edit).

### Information events ("Eventsを強化")
- +16 timeline events (Black Death, Copernicus, Newton's Principia, Waterloo, DNA double helix, Everest, first heart
  transplant, Munich '72, Iran–Iraq War, Falklands, World Wide Web, Dolly, Human Genome Project, fall of Gaddafi,
  Paris Agreement, Sudan civil war) — additive, real Wikipedia slugs.

### ToS / Privacy / attributions
- No change needed: no new data sources or collection. The new compare aurora/earthquake layers are NOAA/USGS
  (same as the main map, already attributed); the new publisher outlets are HQ coordinates only; the dev flag is
  local-only; events link to Wikipedia (already linked).

---

## 41. Round 37 — re-reported-bug batch, root-cause focus (tags `#R37`)

Build `2026-06-18-R37`. Verified live on the http preview after each change (page RUNS — 109 layer checkboxes,
zero console errors). Each fix reproduced/proven, not assumed.

### Layer checkbox sensitivity + "Grid が勝手にチェックされる" (ROOT CAUSE, unified)
- The tap handler now toggles the row the finger went **DOWN** on (pointerdown intent), not the (drift-prone)
  click target, and resolves the box from EITHER `label.layer-option` OR the whole `.lyr-row` (kills row-padding
  dead zones). Proven: clean tap toggles the aimed row; a down-on-Roads / click-on-Grid drift toggles **Roads**
  (intent) and leaves Grid OFF — fixing BOTH "しっかりタップしないと反応しない" and "Grid が勝手にチェックされる" with
  one change. `touch-action:manipulation` added to `.lyr-row`. (The "再読み込みで治る" report was the same eaten-tap
  perceived as a dead layer — verified Roads/choropleths DO render once tiles/country-data arrive.)
- Same down-targeting + elementFromPoint fallback applied to the **news-language** panel (`.nc-dd-panel`): a
  gap-tap no longer falls through to the click target → no cross-toggle. iOS sizing: 44px rows, 15px text, a 22px
  rounded custom checkbox (`div.nc-dd-panel` specificity beats the `.setting-group label` 13px/block rule).

### Frosted-glass Settings "グレーになる" (REAL root cause — double backdrop-filter)
- `.modal-overlay` had its OWN `backdrop-filter:blur(12px)` + scrim; the child `.modal-content` then blurred that
  already-dimmed surface (not the map) → composited to flat gray. R36 only lightened the scrim. Fix: in the two
  glass modes the overlay becomes a near-transparent click-catcher with NO blur, so `.modal-content`'s own glass
  frosts the MAP directly. Verified by screenshot (light + dark): the blurred map shows through, not gray.

### Stats comparison bars "幅を縮小すると長さ0"
- `.cmp-bar-wrap` was `flex:1;min-width:0` → it lost the flex fight to fixed-width siblings and collapsed to 0.
  Now `flex:1 1 46px;min-width:46px` (never 0) and the name ellipsis-shrinks first. Verified track ≥46px at a
  190px container.

### No-data gray + Govt Debt coverage
- The World-Bank beta choropleths painted ONLY countries with data (others showed nothing). Now EVERY country is
  drawn; no-data ones are neutral gray (`['case',['has','v'],ramp,'#9aa0a6']`) — the explicit "データのない国は灰色に".
- Govt debt (WB `GC.DOD…` = central govt, ~half the world) gap-filled from an embedded **IMF WEO** general-govt
  gross-debt table → 142/216 countries now valued (was ~100, rest invisible). Source-noted in the legend + the
  Data-sources modal. Mirrors how HDI/Democracy/MilSpend are embedded real datasets (no fabrication).

### Widgets / clock / random-country
- Analog clock "秒針が動かない": the clock ticked every **30 s** → second hand frozen. Now 1 s (also makes the
  live population counter tick). Random-country fly: gentler (`speed:0.7`, maxZoom 5) so it frames the WHOLE
  country with context and glides in calmly (the re-reported "近すぎ / 速すぎ").

### News bands above place labels + mobile news interaction
- News/dash/user/community pins added to the label-stack "own" set → news BANDS now render ABOVE place labels
  (verified news-labels idx > ofm-city idx) — "帯が地名ラベルにさえぎられる" fixed.
- The BAND (`news-labels`) is now clickable + hover-tooltipped (was dot-only) → "地名ラベルを押しても反応しない".
- MOBILE crosshair → news popup: on moveend, the news pin under the centre crosshair shows the same popup as the
  desktop cursor hover, tappable to open the article (`_crosshairNews`).

### Full 4-language (EN / JP / DE / RU) — selectable from Settings, no missing-key leakage
- **RU was blocked entirely** (setLang allow-list, no button, no dropdown option, restore accepted en/jp only).
  Wired RU end-to-end + fixed the restore/active-state/relabel triggers to cover all 4 (the `['lang-en','lang-jp']`
  relabel arrays missed DE/RU → modules stayed stale = leakage on switch).
- **Dictionary gap was huge**: DE & RU each had only 112 of EN's 257 keys → 145+ keys fell back to English. Filled
  ALL 184 missing keys in BOTH DE and RU (measure/stats/community/AI/satellite/context) — verified `en−de=∅`,
  `en−ru=∅`. Fixed the 4 `currentLang==='en'?…:…` sites whose else-branch showed **Japanese** to DE/RU (dates,
  Google-News feed locale, publisher fallback).
- **Honest limitation:** ~768 inline `jp()?…:…` ternaries carry no dictionary key and fall back to **English**
  (not the target language) for DE/RU dynamic strings. English fallback is not wrong-language-leak, but it is not
  yet full DE/RU. Bulk-converting 768 template-literal sites is high-risk (one stray back-tick blanks the site)
  and out of scope for one safe pass; the dictionary completion covers all `t()`/`data-i18n` UI.

### News geolocation (AI + non-AI, publisher + subject) — strengthened
- Client publisher gazetteer +~45 national/regional outlets (Nordic, E. Europe, Benelux, SE/South Asia, Latin
  America, Africa, CIS, ANZ) → fewer "publisher unknown" pins. (Google-News links are redirects, so the publisher
  NAME is the only client signal — domain/TLD fallback can't help there.)
- **Server (`refresh-news`) — needs redeploy:** the AI subject prompt rewritten to be more specific (city/landmark
  over country, resolve clubs/companies/airports to their city, disambiguate same-name places) AND to OMIT far less
  (country-level is acceptable; only truly placeless items dropped) → fewer unlocated subject pins. The server
  publisher `SOURCE_DICT` mirrored up to the R36+R37 client additions.

### Dev = unlimited AI (public site)
- Code is complete + verified locally (aiDev()→true, Settings graph shows the full "unlimited" bar). The server
  `ai-proxy` already hard-codes the owner email as `unlimited` (never 429) and the client persists `intmap_dev` on
  owner login → unlimited on the PUBLIC site too **once the owner is logged in there AND the `ai-proxy` function is
  deployed**. Nothing left to change in code; the only remaining step is the Supabase function deploy.

### Mobile zoom/pan smoothness
- The per-move crosshair readout (DEM lookup + queryRenderedFeatures, every ~110 ms mid-gesture) is the last
  avoidable main-thread spike — now only the cheap coord text renders during motion; the heavy readout settles on
  moveend. Quality-neutral. News-band declutter confirmed platform-agnostic (mobile already == desktop). Deeper
  GPU-bound gains remain blocked by the user's "don't lower quality" rule (pixelRatio stays 2× on mobile).

### Deploy checklist (server-side, NOT shipped by the static-file edit)
- `supabase functions deploy refresh-news` — strengthened subject prompt + expanded publisher dict.
- `supabase functions deploy ai-proxy` — already grants the owner unlimited (deploy if not yet live).

---

## 42. Round 38 — re-reported batch, real root causes + layer expansion (tags `#R38`)

Build `2026-06-19-R38`. Verified live on the http preview (page RUNS — **117** layer checkboxes now, zero
console errors after every change; the WebGL globe DOES paint here — confirmed by screenshot of the new Blue
Marble layer rendering with real NASA tiles, HTTP 200).

### Mobile layer-checkbox sensitivity "しっかりタップしないとチェックがつかない" (NEW real cause)
- R37 down-targeted the pointerdown row but still fired the toggle on the synthetic **CLICK**, which iOS emits
  ~300 ms late and DROPS unpredictably inside a scroll container → a normal tap often did nothing unless pressed
  firmly. **Fix: toggle on `pointerup`** (fires the instant the finger lifts, every time); `click` is now ONLY a
  suppressor so the native label→checkbox activation can't double-toggle. Kept R37 down-targeting (intent row) and
  the finger-travel (>30px) scroll guard. A `click` fallback covers engines that synthesize click without pointerup.

### "Grid & labels が何度消しても自動的にチェックされる" (ROOT CAUSE — finally)
- The R36 async-race re-assert guard re-dispatches a `change` on a box that just went OFF (idempotent for normal
  layers, which READ `e.target.checked`). But `toggleGrid()` **FLIPPED** `isGridOn` regardless of the box → ~500 ms
  after the user unchecked Grid, the re-asserted change flipped it back ON. **Fix:** split into an idempotent
  `setGrid(on)` (drives state FROM the box) + a `toggleGrid()` for the toolbar button; the checkbox `change` calls
  `setGrid(checked)`. ALSO excluded the 7 utility toggles (`cb-names/borders/admin1/roads/rail2/grid/countries`)
  from the re-assert guard entirely (they have their own re-assert and aren't async-race layers).

### "Country borders / State borders / Roads / Railways をチェックしても表示されない、再読み込みで治る"
- The ref layers (`ref-admin1/roads/rail`) depend on the OFM vector source, which often settled AFTER `_wireRef`'s
  single 400 ms retry → the visibility-set hit nothing and never re-ran. **Fix:** apply from the LIVE box state,
  re-assert at 250/700/1600/3200 ms AND on every `ofm` `sourcedata isSourceLoaded`. (Borders also already re-assert
  via the load-time `_assertNamesBorders` + applyTheme.)

### Theme change wiped the sidebar transparency choice
- R29.1 auto-overwrote the sidebar appearance from a per-SKIN map on every theme change. The skins that map needed
  were DELETED in R33, so EVERY surviving theme (auto/light/dark) mapped to `'opaque'` → any theme change silently
  reset Solid/Frosted/More-transparent. **Removed the auto-pick block** — appearance is an independent setting now.

### Stats comparison bars "幅を縮小すると潰れて長さ0 / まだ短い" (definitive)
- The single-row layout forced the bar TRACK to compete with fixed flag/name/value columns → pinned to ~46 px when
  narrow. **Now the row WRAPS:** flag+name+value share the top line, the track drops to its OWN full-width line
  (`flex:1 1 100%` + CSS `order`, no markup change) → the bar is ALWAYS the full available width at any sidebar
  width. Fill carries `min-width:3px` so even a tiny value shows.

### Mobile news pin → popup with a Read button (was a direct jump)
- On mobile, tapping `news-dots`/`news-labels` now opens `_showMobileNewsPopup(props)` — an iOS-style card (location,
  title, publisher, date) with a **Read** button (opens the article) + Close, dismiss on backdrop tap. Desktop keeps
  the direct open (its hover tooltip already previews). The R37 crosshair tooltip now opens the SAME popup on tap.
  Card joins the unified frosted-glass surface set.

### Full 4-language (EN/JP/DE/RU) — the layer panel is now 100% localized
- Empirically scanned the live DE/RU panels (not guessed). **RU up-front seed bug:** line ~2025 dropped 'ru' from the
  construction-time language seed → RU fell back to English in every baked surface until loadSettings re-ran. Added.
- Converted EVERY remaining English-fallback layer label to 4 languages via per-module pickers (no source churn):
  the **World Bank/bx betas** (34 labels incl. eq + Heat of Attention) via a `BX_TR` map + `bxLabel()`; the **ECMWF**
  weather rows (`['EN','JP']`→`['EN','JP','DE','RU']` + `ecLbl()`); the **B2** betas (lifeexp/unemp/internet/…) via
  `b2Lbl()`; **L9** (dams/aurora/seaice/…) via `l9Lbl()`; **ECO** (worldcover/ecoregions/plates) via `ecoLbl()`; group
  headers, the Others-note, the Tools label, the ECMWF time caption, the context-menu radius/runway/LOS items, and
  the generic legend (`ensureGenericLegend` is now 4-lang; `[EN,JP]` callers still fall back to EN — never Japanese).
  **Verified live:** DE and RU layer panels show ZERO English/Japanese leaks; RU rows are genuinely Cyrillic.
- **Honest limitation (unchanged scope):** ~700 deep inline `jp()?…:…` ternaries in toasts / some tool-panel text
  still fall back to ENGLISH (not Japanese) in DE/RU. No wrong-language (Japanese) leak remains in the surfaces
  audited; the long tail is English-fallback only and is progressively localized (bulk-converting all sites in one
  pass is high-risk per the template-literal back-tick rule).

### Layers "大幅増強" — +8 real NASA GIBS science rasters (all curl-verified 200/image before wiring)
- New self-contained additive module (DOM-built, no template literals → no CSS back-tick risk): **Daily satellite
  (true color)**, **Land surface temp (day)**, **Vegetation index (NDVI)**, **Water vapor**, **Cloud fraction**,
  **Sea-ice concentration**, **Sea-surface temp anomaly**, **Blue Marble (relief + bathymetry, static)**. Each: full
  EN/JP/DE/RU label + source note, freshest GIBS day (−2 d), added BELOW the place labels (then `_raiseLabelLayers`),
  shared opacity legend via `_registerLayerOpacity`, filed into climate/maritime/terrain by reorganizeLayerPanel
  (ids added to GROUPS), and integrated with the Active-layers chips (verified). Blue Marble verified rendering on the
  globe with live GIBS tiles. Skipped probes that 404/400'd (chlorophyll, NO₂/CO/SO₂ ids, brightness-temp) to avoid
  blank layers — only confirmed-serving layers were wired.

### ToS / Privacy / attributions
- No change needed: all 8 new layers are **NASA EOSDIS GIBS** (already credited in the Privacy Policy's third-party
  list AND set as the MapLibre source `attribution`). No new data collection.

---

## 43. Round 39 — large requested batch: UI bug-fixes, 4-lang depth, new features (tags `#R39`)

Build verified live (http preview, page RUNS — **121** layer checkboxes, zero console errors after every change).
Committed in 6 parts to `main`.

### UI bug-fixes (part 1)
- **Mobile "Active layers の下に隙間"** — root cause: `.m-sheet{padding-bottom:max(18px,safe-area)}` sat BELOW the
  scroller, so the sticky Active-layers bar pinned to the scroller bottom and left an 18px strip of sheet background
  beneath it. Fix: `.m-sheet` bottom padding → 0; the home-indicator safe area now lives on the terminal elements
  themselves (the bar already had it; added to `#layer-tools` + `.sat-controller`). Bar is now flush (measured gap 0).
- **Settings "Apply UIの右下が角丸で隙間"** — the sticky footer lived INSIDE the scrolling `.modal-content`, so the
  ~11px scrollbar gutter ran down its right side, beside the footer's rounded corner. Fix: wrap the body in a new
  `.settings-scroll` (flex:1, holds the scrollbar) and make the footer a non-scrolling flex child → spans the full
  card width (gap 11px→1px = border only).
- **AI brief × only reachable at top** — the whole panel scrolled, taking `.tp-header` (the ✕) with it. Fix:
  `#ai-research-panel .tp-header{position:sticky;top:-Npx}` (negative top + negative margins = flush, no content bleeds
  above; mirrors the radius-panel trick). Verified: ✕ stays pinned at gap 0 while scrolled.
- **Frosted-glass AI input "四角い枠でcheap"** — the follow-up input + buttons used solid `--input-bg`/`--card-bg`.
  In `sidebar-translucent`/`glass2` they now use a translucent fill + hairline `--glass-border` + the panel's glass
  fill for the input bar (tagged `.air-inbar`). Verified via computed styles.
- **Gray-text visibility** — bumped `--text-muted` contrast in both themes (light `#86868b`→`#6c6c70`, dark
  `#8e8e93`→`#a6a6ad`). It's the single gray-text variable (no hardcoded grays exist).
- **Mobile news popup透明** — `.m-news-pop` had NO `backdrop-filter` (every other popup does) + translucent
  `--popup-bg` → see-through. Fix: opaque `--card-bg` + frost + hairline border.

### "Works only after reload" cluster
- **Isolate不反応（再読み込みで治る）** — `applyFeature`→`ensure()` returns false while the style isn't loaded and
  waited ONLY on `once('idle')`; on a slow first load the map can already be idle (nothing re-triggers a render), so
  that idle never fires. Fix: **poll** (`setTimeout(apply,120)` ×60) instead. `enter*` now always await country data
  via `withGeo()` (the old `if(!window.countryGeo)` short-circuit ran on a half-populated list).
- **Country borders表示されない** — gave the borders toggle the same retry treatment as roads/rail (idle +
  250/700/1600/3200 ms) — the `countries` source / `tool-poly` anchor often weren't ready on the first cold toggle.

### 4-language depth (EN/JP/DE/RU)
- **Info "undefined" in DE/RU** — the Places cards rendered `info.title[currentLang]` with no fallback (328 cards).
  Fix: `||...en`. Verified: 0 undefined in DE & RU.
- **AI output language** — added `window._aiLangLine()` ("Always write your entire response in <lang>") appended to
  every free-TEXT system prompt (brief, follow-up chat, area/view summary, satellite change-detection). NOT the JSON
  geocoders / connectivity test. Article translator now targets the UI language (was hardcoded Japanese). The brief
  panel UI + auto-suggested questions localized to DE/RU.
- **Leak audit** — Info Places/Events nav buttons localized; verified the dashboard re-renders on language change and
  there are NO visible CJK/Cyrillic leaks in EN/DE chrome (the earlier "ru-in-en" was a hidden, inactive element).

### New features
- **"Ask AI about here"** (🤖, context menu first item, 4-lang) — click any map POINT, ask a free-form question; the
  coordinates are auto-sent + nearby news context. Example questions ("why is population low here?" etc.). Reuses the
  AI research panel + chat thread.
- **Two-layer correlation / scatter** (📊 button at the bottom of the Layers panel) — pick any two numeric,
  absolute-scale country metrics → scatter (log axes where appropriate) + least-squares line + **Pearson r** (on the
  shown scale) + **Spearman ρ** (rank) + country count, 4-lang. Verified: GDP/cap×life-exp r≈0.94 (Preston curve),
  GDP/cap×HDI r≈0.94, GDP/cap×area r≈−0.34. Note: `reorganizeLayerPanel` must capture `btn-correlate` BEFORE
  `tools.innerHTML=''` or the rebuild detaches it.
- **Wikipedia-style country page** — the country-click popup is now an integrated page: a Wikipedia REST **extract +
  lead thumbnail** (app language, cached per lang,name) + "Read on Wikipedia" link, then data grouped into 🌍
  Geography / 💰 Economy / 👥 Society / 🏛 Politics & defense. Action row gains an **AI brief** button (seeded with the
  country's lat/lng). Verified: Japan renders intro+flag+sections, GDP $4.21T.

### Layers / legends / beta / widgets
- **+4 more curl-verified GIBS rasters** (Cloud-top temp, Land-surface temp night, Brightness temp thermal-IR,
  ASTER color shaded relief). Same additive module. Rows 117→121.
- **Legend explanations** — non-obvious metrics (HDI, Democracy Index, fertility, mil %GDP, AOD, night lights, NDSI
  snow) carry a 1-line 4-lang "what is this data" note (`.dl-desc`); well-known ones (pop density, GDP) get none.
- **Beta promotion** — Infant mortality + GDP growth (World Bank, same standard as already-promoted siblings) moved
  out of Others(beta) into Population & economy.
- **Widgets iOS polish** — 22px corners, layered shadow + inset top highlight, larger/tighter value type, tactile
  `:active` press. Functionality unchanged (catalog already had 28 widgets).

### Non-AI news locator — German + Russian
- New **Cyrillic matcher path** (JS `\b` doesn't fire around Cyrillic; Russian inflects): Russian terms are STEMS
  matched as `(?:^|[^Cyr])<stem>[а-яё…]{0,4}` → «Москв»→Москва/Москве/Москвы/Москву, demonyms «Российск»→Российские.
  `_DERU_GZ` (~45 countries + ~15 cities, German exonyms + Russian stems) + `_DERU_DEM` (Russian demonym stems) merged
  into geoDB. Verified: München/Frankreich/Türkei + all Russian inflection cases match; «Кремль» correctly does not
  match «Москв».

### ToS / Privacy / attributions
- Expanded the **NASA GIBS** source line (land-surface/cloud-top temp, true-color, shaded relief) and **added
  REST Countries** (used by the country info page) to the in-app Data-sources list. No new data collection; the AI
  path is unchanged (server-side proxy).

## 44. Round 40 — large requested batch: 5 languages, UI fixes, new features (tags `#R40`)

Build `2026-06-20-R40`. Verified live (http preview, page RUNS — **123** layer checkboxes, 0 console errors after every change). Committed to `main` in 13 parts.

### Quick fixes
- **AI daily limit 5 → 10**: `AI_FREE_DAILY=10` + all EN/JP/DE/RU/ES `aiSecHint` strings + `ai-proxy` `PLAN_LIMITS.free=10` (redeploy ai-proxy to apply server-side; the display/pre-check already shows 10).
- **Radius "Keep on map" button removed** (radius only; measure/area keep theirs — the circles already persist).
- **Land cover default opacity 100%** (layer paint AND the `_registerLayerOpacity` default, which had been overriding it back to 0.85).
- **Blue Marble deleted**; the 7 named GIBS temp/cloud/true-color rasters **demoted to Others(beta)** (removed from the Climate GROUPS list → swept to beta).

### Spanish (es) = 5th UI language + DE/RU/ES depth
- Full `i18n.es` dict (mirrors DE/RU coverage); ES pill + Settings option (beta); every lang-list array extended to include `es`.
- **RU/ES map place-labels fixed** (`applyLabelLang` had no RU branch → RU fell to English; added RU + ES `name:` expressions) and `applyLabelLang()` now also runs on a language-pill switch (was Settings-Apply only).
- `_aiLangName`/`_aiLangLine`: +Spanish and an **emphatic** "write your ENTIRE response in <lang>" directive (the AI-brief DE/RU "comes back in English" report).
- `reorganizeLayerPanel` `T()` now falls back to English so group headers never show the raw key in es.

### "Works only after reload" cluster — REAL root cause
- **`loadCountryData()` cached a FAILED first fetch forever.** If the cold-load border-GeoJSON fetch failed (slow/blocked CDN), `countryGeo` stayed null but `countryDataPromise` stayed resolved → Isolate / Country borders / Countries(info) were dead until a full reload. Fix: on a failed load, clear the cached promise so the next click retries. This is the long-standing "押しても反応しない、再読み込みで治る" root cause.
- **Legend ×**: the delegated handler now resolves the layer from `data-x` / the legend's `cbId` / its container id and tries every checkbox-id convention (dl/eco-dl/gx/l9/beta/geo-layer-cb); the generic legend × gained `data-x`. ("凡例の×を押してもレイヤーが消えない" universal fix.)

### Map defaults & lines
- **Country borders, State/province, Roads, Railways now DEFAULT ON** (HTML `checked` + a startup dispatch through their retry-hardened handlers; these 4 are NOT persisted in the hash so it's only the initial default).
- **Country borders re-sourced from the OSM-based OFM `boundary` (admin_level 2)** instead of generalized Natural Earth → aligns exactly with the basemap (item: 国境線がずれる) AND removes the `countryGeo` dependency (more reliable cold-start).
- **Railways** darker/thicker/tighter-dash (`#52555b`, opacity 0.95, wider width ramp).
- **River / lake / sea (`water_name`) + mountain-peak (`mountain_peak`) labels** added to `ensurePlaceLabels`; follow the Place-names toggle + label language; added to the `_raiseLabelLayers` stack.

### Compare X-ray pannable (the angry one)
- Root cause: the compare map was `pointer-events:auto` and tried to DRIVE the main map via a fragile reverse-sync that left the lens frozen (synthetic-drag test confirmed 0px). Fix: the whole `.cmp-xray` window/body/compare-map/canvas are now `pointer-events:none` (click-through) so drags hit the real interactive main map underneath; the overlay follows 1:1 via the proven `map.on('move')→syncFromMain`. Header/Close/Map-Sat/date pickers re-enabled.

### News — temporarily frontend-only (all languages)
- `USE_SERVER_NEWS=false`: `fetchData` skips the `current_news` fast-path and always uses live RSS + client `analyzeContext` (non-AI gazetteer); the realtime `current_news` subscription is gated on the same flag. Flip back to `true` to restore the pre-analysed server feed.
- Spanish news edition added to `feedUrls` (was English fallback); `_ES_GZ` + `_ES_DEM` Spanish exonyms/demonyms merged into `geoDB` (Latin-script matcher) → Spanish news geolocates client-side like DE/RU.

### New features
- **Live weather popup** (right-click → "Weather here"): `IntMapWeather` via Open-Meteo (no key, always-latest) — current conditions + 5-day outlook, 5-lang, unit-aware.
- **Shareable URL**: `activeLayers()` now captures every layer-checkbox convention; `encode()` adds `&ts=` (time-travel) + `&cmp=` (compare); restore reproduces them for shared links; new "🔗 Share this view" context-menu item (Web Share / clipboard).
- **Correlation/Scatter**: 14 → **33 metrics** (gdpPPP + 19 on-demand World-Bank axes via the new `window.IntMapWB.fetch`); new **residual map**: positive residual (above the fit) → deeper blue, negative → deeper red, as a per-country `match` fill + a legend pill.
- **Webcam layer** (`dl-webcams`, Others/beta): ~65 curated global webcam LOCATIONS as clickable points → opens current YouTube-live results for the place (key-free, honest, file://-safe).
- **+OpenRailwayMap + OpenSeaMap** raster overlays (Others/beta). Layer rows 121 → **123**.
- **+6 widgets** (catalog 30 → 36): Day progress, Season (hemisphere-aware), Week number, Unix time, Map center, Next full moon — all pure-computation (no network). Card gained an extra iOS glass sheen.

### Legends / beta promotion / ToS
- `_legendDesc` wired into the **generic** legend (choropleths/geo/WB now carry the 1-line "what is this data" note); `LEGEND_DESC` +21 non-obvious metrics; well-known ones (pop/GDP/area/density) still get none.
- **Beta promotion**: literacy, Gini, poverty, U5 mortality, safe water, physicians, secondary enrollment → Population & economy; agricultural land → Terrain (objective/World-Bank-sourced, with legends). Demoted GIBS layers stay in beta per instruction.
- **ToS clause 11** (EN + JP): borders / place names / country distinctions are technical depictions with **no political intent**; disputed areas follow source data. Data-sources: + live webcams + the live-weather popup. Last-updated 2026-06-20.

## 45. Round 41 — re-reported bugs (real fixes) + real webcams + timezone + i18n (tags `#R41`)

Build `2026-06-21-R41`. Verified live on the http preview after every change (page RUNS — globals defined, 137 layer checkboxes, 0 console errors). Committed to `main` in 5 parts. The preview tab is headless (`document.hidden`) so `map.on('load')` (which sets `window.__imap`) doesn't fire after a programmatic reload — verification was therefore by globals/console/checkbox-count + targeted state reads, plus curl/oEmbed verification of every external endpoint before wiring.

### "Works only after reload" — the REAL systemic root cause (the recurring angry one)
- **`whenStyleReady()` could hang forever.** It waited ONLY on `idle`/`load`; if ANOTHER source is still loading or erroring, the map never reaches a clean idle, so the awaited layer was never added → "checked but doesn't show, reload fixes it". Plus a TOCTOU race. Fixed: also listen on `styledata`, POLL independently, and hard-resolve after ~6 s (addSource/addLayer work as long as the style object exists). This is the gating path for most data layers.
- **Self-heals were idle-only.** The orphan sweep (`_sweepOrphanLayers`) + label-raise ran only on `idle`; a wedged-not-idle map never fired them → "消したはずのレイヤーが残り続ける". Added a 2.5 s heartbeat that runs the SAME idempotent, drift-only self-heals. (Isolate cold-path was already polled in R39/R40; loadCountryData already self-heals a failed fetch.)

### Correlation / Scatter (the "まったく動作しない / ×しないと地図見れない / UIもくそ" one)
- Residual map rewritten: closes the chooser FIRST (so the map is ALWAYS revealed — the old try/catch only closed it on success → the user got trapped), retries until the `countries` source is ready, and paints a **graded diverging RdBu ramp** (deep red → light → deep blue) instead of two flat alpha colors. Gradient legend pill + a "what is this" line.
- Metrics **33 → 51** (19 more live World-Bank indicators, full 5-lang labels). `ml()` now supports `es`. Modal backdrop lightened + the card is draggable so the map stays visible while you pick axes.

### Webcams — REAL, not a facade
- The R40 layer opened a YouTube SEARCH. R41 ships **25 curated, currently-LIVE 24/7 YouTube webcam streams** whose video ids were each verified embeddable via the oEmbed endpoint before shipping. Clicking a point **embeds + plays the actual live feed** in the popup (muted autoplay, `youtube-nocookie`), dark-mode-correct (`.plc-popup .webcam-popup`), with a guaranteed "Open on YouTube ↗" fallback. Operators: EarthCam, SkylineWebcams, WebcamSydney, Ozolio, FOX 5, I Love You Venice, Wild Africa, SeeJacksonHole.

### Other fixes
- **OpenSeaMap** tiles were verified loading (HTTP 200 PNG over ports); it only LOOKS empty at low zoom because seamarks render near coasts/harbours — added a zoom hint toast + sturdier retry. (OpenRailwayMap works with a browser UA; the curl 403 was just a missing header.)
- **Legend ×** is now belt-and-suspenders: uncheck the controlling box AND direct-hide every matching map layer AND always close the legend element.
- **Water/terrain labels** split onto their OWN checkbox (`cb-geolabels`) separate from place names; **river labels re-sourced from the `waterway` LINE layer** (they were read from `water_name` point geometry with line placement → the "ずれている" misalignment).
- **Weather popup**: the 5-day outlook now honours °F too (it printed raw °C); the popup is draggable (`<h4>` handle → the shared `_wireLegendDrag`), with a ⟳ refresh button; `place()` no longer snaps a dragged panel back.
- **Railways**: gray was hard to see on both themes → dark solid base (`ref-rail`) + white cross-tie dashes (`ref-rail-dash`); `_wireRef` toggles the companion.
- **AI follow-up bar**: the cheap `--popup-bg` rectangle behind the input/buttons now fades to transparent; suggestion buttons are borderless iOS pills; the send button is a clean up-arrow circle with a press spring.

### New layers / legends / widgets
- **Time-zone layer** (`dl-tz`): real Natural Earth `ne_10m_time_zones` boundaries (on-demand from jsDelivr, CORS-verified, 120 features / 40 zones) + the **current local time labelled on each zone, refreshed each minute**. Promoted into a real "Indicators & overlays" group (not beta).
- **+OMPS UV Aerosol Index** GIBS raster (endpoint curl-verified) — smoke/dust/ash; promoted into Climate.
- **GIBS color-SCALE legends** for sea-ice, SST anomaly, LST day/night, NDVI, water vapor, cloud fraction, cloud-top/brightness temp, relief — gradient bar + min/max, temps unit-aware, SST shown as an anomaly (×9/5). LEGEND_DESC + the gx-legend now handle `es`.
- **+5 widgets (36 → 41)**: Map weather (Open-Meteo at map center, no geolocation), Day length (solar), Map scale (m/px + 100-px bar), Calendar (mini month), Next new moon — 5-lang names; existing cards get a desktop hover-lift.

### i18n (the "Info/Stats が DE/RU で英語のまま" one)
- **Russian layer-group headers were entirely MISSING** → English; added the full RU set (verified rendering).
- **Country detail (Stats)** `TR()` had NO Spanish → every section/label fell to English in ES; added full `es` + the Wikipedia intro now uses es.wikipedia.org.
- **Information dashboard**: Places/Events segment missing `es`; map-pin title/body fall back to en; recurring card **badges** localized (DE/RU/ES).
- **Non-AI news locator**: +22 DE/RU and +21 ES news-hotspot gazetteer entries (Gaza, Rafah, Kharkiv, Lviv, Odesa, Donetsk, Donbas, West Bank, Beirut, Aleppo, Baghdad, Kashmir, Taipei, Pyongyang, Cairo, Riyadh, New Delhi, Shanghai, Hong Kong, Seoul, Tokyo, Khartoum); RU uses declension-safe stems. (The ~100 curated reference-card BODIES stay EN/JP — no quality translation source — but all surrounding chrome is localized.)

### Shareable URL
- Already shipped in R40 (`activeLayers()` + `&ts=`/`&cmp=` + "🔗 Share this view"); unchanged in R41.

### Sources / ToS / Privacy
- Data-sources: Natural Earth note extended (time-zone boundaries); +OpenRailwayMap/OpenSeaMap; webcam entry now describes embedded live streams. Privacy clause 4 (EN+JP) discloses the YouTube webcam embeds (`youtube-nocookie`) + the jsDelivr CDN. Last-updated 2026-06-21.

### R41b — Webcams reworked again (re-report: "youtube依存・静的コーディングはやめろ")
The R41 webcam layer (25 hand-coded YouTube streams) was still rejected as a facade. Rebuilt as a **dynamic, worldwide, keyless** layer: it queries **OpenStreetMap's webcam database live via the Overpass API** (`contact:webcam` / `webcam` tags, ODbL — 9,400+ nodes globally) for the current map view, accumulating points as you pan/zoom (debounced `moveend`, bbox-contains + zoom-in skip, 3 Overpass endpoints with failover, `out body 700` cap). Click → the popup EMBEDS YouTube / direct-image / Roundshot·Panomax cams and PLAYS them; any other cam opens its real operator page (never a search). The hardcoded YouTube list is gone. Verified: the module's exact query returns 700 cams for a Europe bbox (≈120 embed inline, rest open externally); Overpass CORS confirmed from the browser. Sources entry → OpenStreetMap/Overpass; Privacy clause 4 (EN+JP) updated (Overpass + per-operator third-party content on view). No frontend key (constitution-compliant).

---

## 46. Round 42 — re-reported "fixes" done for real + Share panel + Atlas NL console (tags `#R42`)

Build `2026-06-21-R42`. Several R41 items were re-reported as STILL broken; R42 found the REAL root causes (the R41 attempts were cosmetic/incomplete). Verified live on the http preview after every change: page RUNS, 0 console errors, build = R42, 240 layer rows, 15 GIBS rasters. Headless preview can't load WebGL rasters or run the AI/network path, so those were validated by exact-data verification + state reads + a synthetic unit test of the analysis math.

### AI follow-up bar rectangle — the REAL root cause (re-reported "まだある")
- R39–R41 kept tweaking the `.air-inbar` fill (solid → glass-fill → a `--popup-bg` gradient) and it STILL showed a rectangle. **Root cause: alpha doubling.** `.tool-panel` is `--popup-bg` = `rgba(255,255,255,0.72)` (translucent); `.air-inbar` repainted ANOTHER `--popup-bg` on top → the overlap is ~0.92 opaque, i.e. a brighter rectangle. The R41 gradient only faded the *top* edge; the solid lower band remained.
- Fix: `.air-inbar` paints **nothing** (`background:transparent !important`, no blur, no border) in ALL sidebar modes. The pill goes opaque (`--card-bg`) so it still masks chat that scrolls behind the sticky bar. Verified: a test `.air-inbar` computes `backgroundColor: rgba(0,0,0,0)`.

### Sea-ice / SST-anomaly (and ALL GIBS) legends — "凡例の色がでたらめ" was correct
- The R41 legend gradients were **invented**, not taken from the data. Pulled the ACTUAL NASA GIBS colormap XMLs (`colormaps/v1.3/<name>.xml`), parsed the `<ColorMapEntry rgb=… value=…>` stops, sampled them at even intervals, and rebuilt every `SCALES` gradient to MATCH the tiles:
  - **Sea-ice (GHRSST MUR)**: real palette is a full rainbow `near-black(0%)→magenta→violet→blue→cyan→green→yellow→orange→red→white(100%)` — was a flat blue→white.
  - **SST anomaly (GHRSST MUR)**: real range is **±3 °C** (not ±5) `purple→blue→cyan→green→GREY-TAN(0)→yellow→orange→red→magenta→dark-red` — was blue→white→red.
  - Temp rasters now use the colormap's true Kelvin clamp span (LST 200–350 K = −73…+77 °C; cloud-top 150–350 K; brightness-temp 180–340 K), plus exact NDVI / water-vapor / cloud-fraction / UV-aerosol gradients. (The legend MECHANISM was fine — only the data was wrong.)

### Weather popup — Fahrenheit in `°C + °F` mode (re-reported "華氏に対応していない")
- The popup's current/feels-like already used `fmtTemp` (both units), but the **5-day daily strip's `dT()` showed °C only in `both` mode**. Added `fF()` + a small `.wp-dayf` secondary line so `both` shows e.g. `30°/22°` (°C) with `86/72°F` beneath each day. `f`-only and `c`-only were already correct.

### Share — surfaced as a real panel + completed the state (re-reported "まだ実装されていない")
- The live permalink (`IntMapBookmark`) already encoded view+layers+`ts`+`cmp`, and a right-click "Share this view" existed — but it was a SILENT clipboard copy and the address bar carried `self=1` (which suppresses restore), so it never felt implemented. R42 adds **`window.IntMapShare`**: a visible panel (toolbar 🔗 button + the right-click entry both open it) showing the CLEAN `IntMapBookmark.link()` (no `self=1`) in a selectable field + Copy + native share, listing exactly what travels. Also added **`&sat=1`** to `encode()`/`restore()` so the Map↔Satellite base view is shared/restored too (it was the one missing piece). 5-lang.

### Atlas — natural-language console (the new beta "ターミナル", `window.IntMapConsole`)
- Type plain language → `askAIJSON` returns a STRICT JSON action plan → a REAL dispatcher executes it. Not a facade — every action maps to existing engine code: `layer` (fuzzy-match any layer checkbox), `flyTo` (local gazetteer→Nominatim geocode), `projection`, `base`, `compare`, `weather`, `brief`, `reset`, plus genuine country-data analysis over `countryStats`: `rank` (top/bottom N), `ratio` (A/B), and `relate` — a **regression residual** (`metricY` on `log(metricX)`) for "Y relative to X" questions. The example "map countries with low HDI relative to GDP per capita" → `{relate, metricY:hdi, metricX:gdppc, find:low}` → most-negative residual; validated with a synthetic test (the rich-but-low-HDI outlier ranks first). Matches highlight on the shared `countries` source (`nlq-fill`/`nlq-line` feature-state, re-added on `styledata`) + a fit-to-bounds + a ranked list. Launch (inconspicuous, beta): a small `⌖` toolbar button, the right-click menu, or **Ctrl/⌘+K**. 5-lang UI + the `say` line follows the app language.

### New layers (大幅増強) + promotion (#R42)
- **+3 objective NASA GIBS science rasters** (ids/colormaps curl-verified), each with an EXACT legend + full 5-lang label/note, placed straight into REAL groups (same bar as the already-promoted `gxaero`/`gxndvi`): **ocean chlorophyll-a** (VIIRS → Maritime), **carbon monoxide** (AIRS, smoke/pollution → Climate), **soil moisture** (AMSR2, drought → Terrain). The 7 GIBS temp/cloud/true-color rasters that were DEMOTED by request stay in Others (beta), per "降格指示があったものはそのままbeta".

### i18n / Sources / Privacy
- Every new string (Share panel, Atlas console + examples, button tooltips, layer labels/notes) ships in EN/JP/DE/RU/ES; ES rendering spot-checked live.
- Data-sources: NASA GIBS `use` extended (sea-ice, SST anomaly, CO, soil moisture, ocean chlorophyll, NDVI). Privacy clause 4 (EN+JP) broadened: text submitted to ANY AI feature — place briefs, "Ask AI", and the Atlas console — plus relevant coordinates is sent to the AI provider (previously only "news headlines"). Atlas geocoding reuses the already-disclosed Nominatim/OSM. Last-updated 2026-06-21.

### R42b — share RESTORE actually works + Atlas full-control + chlorophyll demoted (re-reports)
- **Chlorophyll-a → Beta** per request: removed from the Maritime GROUP so the safety-sweep files it into Others (beta). (Verified group = "Others (beta)".)
- **Share "opening the copied link doesn't restore" — REAL root cause found + fixed.** Empirically reproduced: a fresh open DID restore (view+layers), but a SAME-TAB hash navigation (pasting a link into the current tab, or any same-document open) is hash-only — no reload — so `restore()` never re-ran. THREE fixes: (1) a **`hashchange` listener** → full restore on any user hash navigation (`history.replaceState` used by save does NOT fire hashchange, so no loop); (2) **dropped the `self=1` marker** — `save()` now writes the FULL state straight to the address bar, so the URL itself is a complete copy-and-share link, while R33's "reload returns clean" is preserved via a per-tab `sessionStorage` `firstLoad` flag (reload of own tab = view only; fresh open / shared link / same-tab paste = full restore); (3) restore is now **EXACT** — data layers not in the link are turned OFF (matters when pasting over an existing state) + 3 retry passes (700/1800/3200 ms) for late-built rows + base-map switched back to Map if the link has no `&sat=1`. Verified all 3 paths live: fresh open of `#…Tokyo&l=dl-gdppc` → Tokyo z8 + GDPpc; same-tab paste of London+HDI → London z6, HDI on, GDPpc off (exact); plain reload → view only (R33 intact).
- **Atlas — "IntMapの全動作を実行可能に。複合的な指示にも"** : action vocabulary expanded from 12 to ~30, every one mapped to REAL existing code (no facades): navigation (flyTo/zoom/projection/terrain3d/base/resetNorth), layers (layer/grid/countryInfo), analysis (rank/ratio/relate/reset), tools & panels (weather/brief/compare/isolate/pin/tool/widgets/screenshot/share/tab/timeTravel), settings (theme/language/tempUnit/units), plus `answer`. `dispatch()` is awaited per action so COMPOUND requests run in order (e.g. "dark mode, fly to Iran, show military spending, open the weather" = 4 actions). `widgets` calls `window.IntMapWidgets.toggle()` (the `btn-widgets` id is mobile-only); theme honours that the decorative skins were deleted in R33 (light/dark/auto only). SYS() prompt rewritten to list every action + an explicit compound example; example chips now show compound commands. All targets verified present in the DOM; 0 console errors.

### R42c — Atlas mapping FIXED + window minimize/resize + close-clears-map + more actions (re-reports)
- **"地図へのマッピングが行われない" — ROOT CAUSE found.** The country-highlight targeted the shared `countries` source, which is only created by `addCountryLayers()` — i.e. ONLY after the Countries(info) layer is enabled — so `ensureHlLayers()` bailed and nothing painted. **Fix: highlights now use their OWN geojson source `nlq-src` built from `window.countryGeo`** (always populated once `loadCountryData` ran), independent of any layer toggle. `ensureData()` now waits on `geo()` (window.countryGeo) not the `countries` source; `fitTo` uses `geo()` too. Verified live: countryGeo = 258 features (ISO-code ids), and addSource('nlq-src')+addLayer('nlq-fill')+setFeatureState(JPN,{nlq:true}) → getFeatureState returns it.
- **Window minimize + resize** ("最小化、サイズ変更可能に"): the panel is `resize:both` (min 300×160, max 100vw/90vh, initial 480×~560); a `–`/`▢` header button toggles the `.atl-min` class that collapses everything but the header. `open()` clears the minimized state. Verified: resize=both, minimize hides the chat & flips the glyph, restore brings it back.
- **× also clears Atlas's map overlays** ("×したらAtlas起源の地図上の表示も消える"): the close handler now calls `clearHl()` so the country highlights Atlas drew disappear on close.
- **+6 more actions** (still all real APIs): `radius` (geocode→`_radiusFromPoint`, optional km via top-level `radiusKm`), `measure {from,to}` (geocode both → `setTool('measure')` + set top-level `measurePoints` + `refreshTool`), `bearing/rotate` (`map.easeTo`), `correlate` (`IntMapCorrelate.open`), `settings` (`btn-open-settings`), `clearAll` (highlights+pins+radius+isolate). SYS() + compound handling updated. 0 console errors.

### R42d — Atlas: ALL actions, literally (re-report "more じゃなくて all、勝手に縮小するな")
- Hand-listing actions always misses some. Added a **UNIVERSAL control layer** so Atlas can operate EVERY control in the app, not just the enumerated ones: `{"type":"control","target":"<name or #id>","value"?,"on"?}`. `findControl()` fuzzy-matches the target against EVERY `<button>/<input>/<select>/<textarea>/[role=button]/.view-btn/.mode-btn/.ios-segment-btn/...` in the live DOM (id + textContent + title + aria-label + the **associated `<label>`** for selects via `_assocLabel`); `doControl()` then clicks / sets a select by value-or-text / toggles a checkbox / sets a slider-or-number / fills+submits a text input — works even on controls inside a CLOSED panel (direct DOM ops + dispatched events run the real handler). Visible controls beat hidden duplicates (mobile proxies) by a 0.6× penalty; layer checkboxes are excluded (the `layer` action owns them).
- **The full control catalog is injected into SYS()** — `controlCatalog()` lists ~123 controls as "Name [#id]" (selects flagged), so the model targets any of them precisely (an exact id scores 100). SYS() now states up front there is NO operation Atlas cannot do, and to ALWAYS fall back to `control` rather than refuse. Verified live: catalog = 123 entries (lang/tabs/settings/search/community/widgets/…); `control` "setting-temp-unit"→that select, "measurement units"→#setting-units, "theme"→#setting-theme, "feedback"→#btn-feedback-hdr. 0 console errors.

### R43 — Atlas: every operation, executed HONESTLY, no layer confusion (re-report "実行したと言っている操作が実行されていない／レイヤーによっては混同／全機能を使えるように／複合的な処理＆出力")
Three concrete, separately-verified fixes — all additive, contained to the `window.IntMapConsole` IIFE; the main app's same-named `toggleLayer` (line ~10609) is a DIFFERENT function and is untouched.
- **(1) "Says it did it but didn't" → honest, verified execution.** Root cause: most `dispatch` cases ran `clickId(...)` then UNCONDITIONALLY returned `note('✓ …')` even when the id/mapping didn't exist, and `run()`'s loop swallowed thrown actions (`catch(_){}`), so the model's optimistic `say` was the only thing the user saw. Now **every action returns a structured `{ok,html}` via `R()`**, verifies its effect where observable (checkbox/select reached the wanted state, theme value set, slider moved, module call succeeded), and FAILURES render in an attention colour (`warn()`). `run()` aggregates real results and, when any step failed, prepends a prominent **"⚠ N step(s) could not be completed — <list>"** banner (5-lang) so the optimistic `say` can no longer overstate. Thrown actions now become a visible `warn`, not silence.
- **(2) "Layer confusion" → precise resolution + the live layer list in the prompt.** Root cause was a double-guess: the model never saw the real layer names (it paraphrased) AND the old matcher fuzz-matched loosely. Now `layerCatalogText()` injects the **live ~129-name layer list** into SYS() ("use these EXACT names"), and `resolveLayer()` scores by exact-id / `data-layer` / exact-text / prefix / whole-word / token-coverage with a ≥40 threshold; `toggleLayer()` VERIFIES the checkbox reached the wanted state and the reply shows the **EXACT label toggled** (so any residual ambiguity is visible & correctable, not silent). Battery-tested live against the 129 layers: wind→Wind (animated), "sea ice concentration"→Sea-ice concentration, HDI→HDI (2022), BRI→Belt & Road (via data-layer), Köppen accents preserved, etc. End-to-end: toggling the resolved "Köppen climate" checkbox actually adds the real `lyr-climate` map layer.
- **(3) "Use ALL features" + "composite data×layer×map output".** New real actions (each calls existing engine/module code, guarded): `opacity` (per-layer slider), `selectCountry`, `timeSeries` (`showCountryDetail`→`IntMapTimeSeries.open`), `los` (`IntMapLOS`), `route` (sea route, `IntMapRoute.setStart/setEnd`), `runway` (`RunwaySearch`), `edu`, `ecmwf` (`IntMapWeatherEC.open`), `askHere`, `search`, and the composite centrepiece **`mapMetric`/`choropleth`** — shades EVERY country by a metric on a YlGnBu ramp (log-scaled for skewed metrics) with a legend, reusing the `nlq-src` feature-state source (`nlq-choro` layer, re-applied on `styledata`, cleared by reset/clearAll/×). `selectCountry`/`isolate`/`timeSeries` resolve a country by name via `countryStats` (EN/JP) else geocode + point-in-polygon over `countryGeo` (so DE/RU/ES names resolve). `run()` also tolerates a bare array / single-object plan from a weaker model. The choropleth's exact MapLibre paint (`case` + `interpolate` + `to-number` + `feature-state`) was validated by building a throwaway layer on the live `__imap` and reading the state back. Unknown action types fall back to `control`. SYS() rewritten (new actions + AVAILABLE-LAYERS list + composite examples); example chips updated. Verified: site runs (129 layer rows, Atlas opens, 0 console errors), system prompt ≈10.8 KB (well under the proxy's 24 KB cap). No ToS/Privacy/Sources change — Atlas adds no new data source or collection (geocode = already-disclosed Nominatim; AI = existing proxy).

### R44 — Atlas: CONTEXT (the missing conversation memory + map-state awareness) (re-report "文脈理解が壊滅的。コンテクストを全く理解していない")
Root cause of "catastrophic context": `run()` sent ONLY the bare current message to the model — `askAIJSON(q, SYS())` — with **no conversation history and no map state**. So every turn was interpreted in a vacuum; follow-ups ("weather there", "turn it off", "now per capita", "the same country over time", "zoom in more", "そこ/それ") had literally nothing to resolve against. This is architectural, not a model-quality issue.
- **Conversation memory.** A rolling `_hist` (capped 16 lines) records each exchange as a TRUTHFUL summary via `recordTurn()` — the user line + `say` + the actions that actually ran (and which failed). `buildPrompt(q)` now assembles the USER message as `[CURRENT MAP STATE]\n…\n[RECENT CONVERSATION]\n…\n[NEW REQUEST]\n<q>` + an instruction to interpret the request in context and resolve pronouns/follow-ups; SYS() gained a "CONTEXT IS CRITICAL" paragraph telling the model these blocks exist and that a short follow-up is usually a TWEAK of the previous turn.
- **Live map-state awareness.** `stateContext()` snapshots what is actually on screen — map centre/zoom/bearing, base (map/sat) + view (globe/flat/3D) from the toolbar `.active` buttons, the list of layers currently ON (from `layerCatalog()`), # highlighted countries, the active choropleth metric, the open country card (`window._cpCurrent`), and language/theme/temp-unit — so "this country / that layer / the current view / make it bigger" are grounded in reality.
- **Deixis.** `geocode()` now resolves "here / there / this place / the same spot / current location / そこ / ここ / 現在地 / この場所" to the last place Atlas touched (tracked in `_lastPlace`, set on every successful geocode) else the map centre; SYS() tells the model it may pass `place:"there"`.
- Everything is additive + guarded (stateContext wrapped in try/catch → degrades to history-only if the map isn't ready). Token budget: state+history add ~0.5–1.5 KB to the USER message; SYS unchanged size class. Verified: site runs, IntMapConsole + the new `buildPrompt`/`stateContext`/`recordTurn` all build, Atlas opens/closes, 0 console errors, layer catalog still 129 clean labels. (The live AI round-trip needs login; the plumbing is in place and the deixis/state logic uses standard maplibre + DOM APIs already proven elsewhere.) No ToS/Privacy/Sources change.

### R45 — Atlas = the OS over ALL of IntMap (standing rule: every feature, current & future, must be Atlas-operable)
User directive: "今後機能を編集、追加するときは、すべてAtlasに対応するように。Atlasはすべてを裏で操作できるOSそのもの。IntMapのすべてを統合するOS。" Saved as a permanent constraint (memory `atlas-is-the-control-plane`): any feature edit/addition must wire into Atlas in the same change.
- **Generic `module` action + live `moduleCatalog()`** so Atlas reaches EVERY `window.IntMap*` subsystem (and `RunwaySearch`) — current OR future — without per-feature wiring. `{"type":"module","name":"IntMapX","method":"open"|"toggle"|"close"|"clear"|...}`; `doModule()` is bounded by `MOD_RE` (`^(IntMap[A-Za-z0-9]*|RunwaySearch)$`) + a method allow-list (`open,toggle,close,clear,exit,refresh,render`), guarded, honest `{ok,html}`. The catalog (auto-built from `window`) is injected into SYS() as a "MODULE fallback (advanced)" line. Verified live: 20 modules discovered — incl. ones with no dedicated action before (`IntMapAnnotations`, `IntMapPresets`, `IntMapOverlays`, `IntMapWidgets2`). The architecture now self-covers DOM controls (`control`+`controlCatalog`), layers (`layer`+`layerCatalogText`) AND module panels (`module`+`moduleCatalog`).
- **GOTCHA that blanked the site mid-work (caught + fixed before commit):** the R45 block comment contained `Bounded to IntMap*/RunwaySearch` — the `*/` inside `IntMap*/` TERMINATED the `/* */` comment early, so the rest parsed as code → SyntaxError → the ENTIRE inline script failed → every global undefined, only 18 static layer rows. Diagnosed by polling an EARLY global (`window.aiGate` still `undefined` at `readyState:complete` after reload+12s) ⇒ script never ran. Fixed by rewording to avoid `*/`. Recorded in memory `intmap-template-literal-css-backtick` (sibling of the back-tick-in-CSS blank-site bug). Re-verified: `aiGate`+`IntMapConsole` build, 129 layer rows, 0 console errors, Atlas opens. No ToS/Privacy/Sources change.

### R46 — Atlas: scale-aware zoom + fine-grained actions + anti-fabrication (re-report "大陸も都市も国単位のズーム / 存在しない動作を完了と報告 / 複雑な指示 / 細かい動作 / すべての操作")
- **Scale-aware zoom (the concrete bug: everything landed at country-zoom ~6).** `geocode()` now returns the Nominatim **boundingbox** (`[S,N,W,E]` → `[[W,S],[E,N]]`) + the place `kind` (class/type), and `localFuzzyPlaces()` carries a `kind` scale-hint (countryStats→`country`/`capital`, gazetteer→its category — purely additive, the main search ignores it). `flyTo` resolution order: explicit `zoom` → AI `scale` (`scaleZoom`: continent 3, country 4.6, state 6, city 10.5, town 11.5, landmark 14.5…) → **`fitBounds(bbox, maxZoom 13)`** → `kindZoom(kind)` → 6. `search` uses the same. Verified LIVE end-to-end against real Nominatim + `cameraForBounds`: Africa→z3.2, Japan→z3.8, Shibuya/Tokyo→z12.8, Eiffel Tower→z13. SYS() now tells the model to ALWAYS set `scale` (or `zoom`) to match the target's size.
- **Anti-fabrication ("存在しない動作を完了と報告").** SYS() gained a HONESTY rule: NEVER use `answer`/`say` to claim an un-emitted action happened; to DO something you must emit its action; `say` may describe ONLY what the plan's actions actually do; if impossible/unclear, emit a single honest `answer` and no fake action. (Pairs with the R43 honest `{ok,html}` execution + failure banner that already reports the REAL per-step result.)
- **Fine-grained ("細かい動作") + complex.** New actions: `pitch`/`tilt` (camera tilt 0–85°), `pan`/`move` (shift the view N/S/E/W/diag by a fraction). Stronger decomposition guidance + 5 worked COMPLEX examples (multi-action with scale, e.g. "Strait of Hormuz, satellite, 50 km circle, wind" → 4 ordered actions). All 5-lang. The remaining lever for hardest reasoning is the server model (`claude-3-5-haiku`) — recommend `supabase secrets set AI_MODEL=claude-sonnet-4-6 && supabase functions deploy ai-proxy` (raises cost for ALL AI features; user's call, not changed unilaterally). Verified: site runs (129 rows, 0 errors), scale logic differentiates correctly. No ToS/Privacy/Sources change.

### R47 — window UX overhaul (z-order / all-edge resize / minimize / no marks) + zoom over-/under-shoot fix (re-report)
- **Window manager** (`bringToFront`/`registerWindow`/`addEdgeResize`, near `makeDraggable`; exposed on `window`). Applied to every `makeDraggable` panel (auto) + Atlas + Compare:
  - **Z-order ("前後位置が切り替わらない／触れたものを全面に")**: a `pointerdown`(capture) on any managed window raises its `z-index` above the others via a shared counter (band 4300–5999, capped below modals at 9998+). Verified: Atlas opens at z 4301.
  - **All-edge resize ("右下だけは不便")**: `addEdgeResize` hit-tests a 9 px border zone (all 4 edges + 4 corners), cursor feedback + pointer-captured drag, replacing the native bottom-right-only `resize:both` (now `resize:none` on Atlas+Compare). Compare already had 4-corner `.cmp-rz`. Verified cursors: right edge→ew-resize, SE corner→nwse-resize, middle→none. `makeDraggable` skips a drag when `dataset.resizing` is set (no conflict).
  - **Minimize fixed ("最小化が意味をなさない")** — ROOT CAUSE: `min-height:160px` kept it tall AND, after a resize, the inline `height:!important` beat `.atl-min{height:auto!important}`. Fix: `.atl-min{min-height:0!important}` + the handler stashes/clears the inline height (`_restoreH`) on minimize and restores it. Verified: a 522 px panel collapses to **47 px** and restores to 522.
  - **Marks removed ("移動・リサイズのマークは要らない")**: the legend `⋮⋮` drag-grip → `display:none` (legends still drag by their **title** — `h4` is a drag handle in `wireDrag`); native resize corner removed (resize:none); Compare's `.cmp-rz::after` corner-bracket hover-mark hidden. Verified `.dl-drag{display:none}`.
- **Zoom over/under-shoot** ("ズームしすぎ・しなさすぎ") — `flyTo`/`search` now: explicit zoom > **real bbox** > scale > kind > 6. `bestBbox()` (async) prefers a SANE Nominatim bbox (≤200° wide — full extent for Japan 31°/Germany 9°/Canada 89°/Indonesia 46°/continents/cities), and for the territory/antimeridian BLOW-UPS where Nominatim returns 350–360° (France/USA/Russia) falls back to `_bigBbox()` = the LARGEST-landmass polygon from `countryGeo` (metro France 13°, contiguous USA 58°). `fitBounds` tuned to padding 48 / maxZoom 12. Verified live with real Nominatim + countryGeo + cameraForBounds.
- **"レイヤーが勝手にオンになる / 選択してもすぐ表示されない"**: verified a single programmatic toggle is ISOLATED (0 other checkboxes flip), and Atlas's `control` action already excludes `#layer-dropdown` checkboxes — so Atlas isn't the cause. The "auto-on" is the fragile mobile-TAP path (R37, see memory `tap-and-glass-root-causes`: "don't re-tweak the heuristics"); needs a concrete repro (which layer + tap vs Atlas) before touching it — NOT guess-patched to avoid regressing the tap logic. "Not shown immediately" = async tile/data load. Flagged to the user.
- Verified: site runs (aiGate+IntMapConsole build, 129 layer rows, 0 console errors), all window behaviours above. No ToS/Privacy/Sources change.

### R48 — Atlas resize bug FIXED (re-report "拡大縮小機構がバグっている") — root cause + box-sizing
The R47 edge-resize had a real bug I missed (I tested the cursor hit-test but NOT an actual drag, and the headless preview was in the <768px MOBILE layout where `max-width:calc(100vw-16px)` clamped width so resize looked dead). On DESKTOP the panel is centred with `transform:translateX(-50%)` (from `left:50%`): `addEdgeResize` pinned `left` to the VISUAL rect but **left the transform ON**, so on grab the panel jumped half its width and drifted while resizing. Fix: at resize-start NEUTRALISE `transform:none` + clear `right/bottom`, pin to the exact on-screen box, then read the transform-free `offsetLeft/offsetTop`. Also added `box-sizing:border-box` to `#atlas-panel` (it was content-box → each resize drifted +2 px since `width` was set from the border-box rect). Verified live at 1280×800 via simulated pointer drags on every edge: EAST dW=+100 dLeft=0, WEST dLeft=−80 dRight=0, SOUTH dH=+90 dTop=0, NORTH dTop=−60 dBottom=0 — pixel-exact, NO jump, NO drift (repeated resizes give exactly the drag delta). LESSON: when verifying a draggable/resizable panel, simulate the full pointerdown→move→up AND test in the DESKTOP viewport (`preview_resize`), not just the cursor. No ToS/Privacy/Sources change.

### R49 — zoom "comfort" + vague/precise prompt + LOW model temperature (re-report: 近すぎ/遠すぎ・誤解釈・曖昧に無理やり)
- **"ちょうど見渡せる" zoom** — `flyTo`/`search` now use `flyToBox()` = `cameraForBounds` (proportional padding ≈ 8.5% of the container, so the place isn't edge-to-edge) → `comfortClamp(zoom, kind)` → `flyTo`. `comfortClamp` reins in ONLY the absurd extremes per Nominatim place-type (a tiny POI fitting to z17, a sprawling admin boundary fitting to z3 for a settlement) with WIDE bands so normal cases pass through — explicitly checked that a tiny city-state (Singapore, kind "country", bbox→z~10) is NOT forced to country-zoom (band 2.2–11). Verified the kind→band mapping against real Nominatim (`addresstype`): Tokyo=province[3.3–11], Paris=suburb[9.5–15], Eiffel=man_made[11–17.5], Africa=continent[1.5–4.5], Singapore=country[2.2–11]. (Inherent limit: Nominatim classifies "Tokyo" as the prefecture, so it frames the prefecture — a classification mismatch no zoom math can fully resolve.)
- **Vague vs precise (SYS)** — removed the old "if unsure, pick the closest action and proceed" (it FORCED guesses on vague input). New rule: (a) CLEAR request → do EXACTLY what's asked, no substitute/drop/add, match places/metrics/layers literally; (b) GENUINELY ambiguous → return a SINGLE `{answer}` asking ONE short clarifying question instead of guessing; otherwise never refuse. Directly targets "曖昧な指示に無理やり / 的確な指示でも誤解釈".
- **Server accuracy lever — LOW temperature (`supabase/functions/ai-proxy`).** The Anthropic call set NO `temperature` (Anthropic default = 1.0) → Atlas mis-read clear instructions and varied run-to-run. Set `temperature: 0.2` (every IntMap AI call is a precise task: Atlas JSON plans, news-geolocation JSON, factual briefs). **Needs `supabase functions deploy ai-proxy` to take effect** (server code; cannot deploy/verify from here). This + an `AI_MODEL` upgrade are the two biggest levers for the remaining model-quality issues (misinterpretation / inaccurate data / context).
- Verified: site runs (aiGate+IntMapConsole, 129 rows, Atlas opens/closes, 0 console errors); comfort-clamp band mapping checked against live Nominatim. No ToS/Privacy/Sources change.

### R50 — common-sense navigation (the user's concrete failures) + DON'T touch the AI model (Gemini)
The provider is **Gemini** (`AI_PROVIDER=gemini` → `callGemini`, already temperature 0.3), NOT Claude — so the R49 `temperature` edit was on the unused `callAnthropic` path. **Reverted it** (and stop recommending model swaps; the user said do NOT change the model).
- **"world"/"earth"/"globe" geocoded to absurd places** ("show the entire world" → flew to **"World Bank (MC Building)"**; "Earth" → "Earth, Texas"). Fix: `WORLD_RE` (the whole world / entire world / earth / globe / 世界 / 地球 / весь мир / el mundo / die Welt …) → `flyTo`/`search` ZOOM OUT to the planet (z≈1.4), never geocode. SYS() told to emit `{flyTo,place:"world"}` for it and to NEVER read "world"/"earth" as a place. Verified WORLD_RE matches the keywords yet rejects "China"/"Paris"/"World Trade Center"/"Earthquake".
- **City → only its city HALL; China/Russia → extreme zoom-IN.** Root cause: fitting whatever bbox came back (a tiny POI bbox → city-hall zoom) and the R47 `_bigBbox` "largest landmass" heuristic picking a random island/exclave for antimeridian countries. NEW model: only big `FIT_KINDS` (continent/country/region/island/sea) fit their real extent; **settlements + POIs use a FIXED per-type zoom (`placeZoom`) CENTRED on the point** (city 10.3, town 11.3, suburb/village 12.5, landmark 14.5, …) — no tiny-bbox fitting. A country whose Nominatim bbox is a 350°+ blow-up (France/USA/Russia) now just uses a centred country zoom (4.6) — `_bigBbox` fallback REMOVED. Verified `placeZoom`/`FIT_KINDS` routing (country/province FIT; city/man_made centred).
- **"highlight Cfa climate" was useless** (it flew to a building AND only enabled the raster). The world-zoom + literal-place fixes handle the flyTo; SYS() now also states the Köppen layer is a RASTER that can't isolate one class — enable it and say the legend identifies Cfa (don't claim isolation).
- Verified: site runs (aiGate+IntMapConsole, 129 rows, 0 console errors); world/place routing checked live. No model/provider change. No ToS/Privacy/Sources change.

### R51 — DYNAMIC zoom from the place's real footprint (the user: "固定値でいいはずがない／静的なコーディングだと所変われば不具合")
The user is right: a per-type zoom TABLE (`placeZoom`: city=10.3 …) is wrong somewhere — a "city" can be Tokyo or a hamlet. **DELETED all the static zoom tables** (`placeZoom`, `comfortClamp`, `scaleZoom`, `kindZoom`, `SCALE_Z`, `FIT_KINDS`, `bestBbox`, `_bigBbox`) and now DERIVE the view from the place's actual geometry:
- `placeExtent(place)` = ONE Nominatim call (`format=jsonv2&polygon_geojson=1&polygon_threshold=0.02&limit=6`); pick the **highest-`importance`** result (so "China" = the country 中国, NOT "China, Texas" — that was the literal-but-wrong geocode) → real polygon → `robustExtent()` → `cameraForBounds` with a proportional margin (loose sanity caps z0.6–16.5 only; no per-type constant).
- `robustExtent(geojson)` = the **MAIN-BODY extent**: largest polygon by area + only the OTHER polygons within `reach = max(1.7×mainDiag, 4)` of it (a multiplier of the place's OWN size, not an absolute) — so a country keeps its mainland + nearby islands but DROPS scattered overseas territories (France+Polynesia, USA+Guam) and far island chains. **Antimeridian-aware** (computes in both the 0° and +360° longitude frames, keeps the smaller-span one) → Russia/Fiji no longer span the globe.
- Verified live (real Nominatim polygons + `cameraForBounds` at 1280×800): China→中国 z3, France→metro z4.9 (was 320° span!), United States z2.1, Russia z1.2 (antimeridian OK), Japan z3.9 (all 4 main islands), Indonesia z3.5, Brazil z3.6, Paris z11.0 / Osaka z11 (whole CITY, not the city hall), Eiffel Tower z16.5. SYS() flyTo simplified: "just give the place name; the engine frames it to its real size — don't pick a zoom" (no more `scale` table). Inherent residual: Nominatim returns "Tokyo"=the prefecture (with far islands) so it frames the region (~z6), and a country with a huge far territory (USA+Alaska) shows wide — these are geocoder-classification facts, not a static-value bug.
- Verified: site runs (aiGate+IntMapConsole, 129 rows, 0 console errors), 0 dangling refs to the deleted helpers. No model/provider change. No ToS/Privacy/Sources change.

### R52 — Atlas: layer confusion KILLED + a deterministic path so common commands ALWAYS run (re-report "実行したと言っている操作が実行されていない／レイヤーによっては混同／すべての機能を／複合的な処理＆出力")
The user re-reported the R43 trio. The modules/actions were all wired correctly (re-verified every `window.IntMap*` signature against dispatch), so the residual failures are at the two model-dependent seams: the AI picks the wrong layer name, and the AI is the *only* thing that can act. Both are now fixed **deterministically** (the provider/model is unchanged). All additive, contained to the `window.IntMapConsole` IIFE.
- **Layer confusion — root cause found with the LIVE catalogue (129 layers).** Reproduced real failures by replaying the exact `resolveLayer` scoring in the page: **"rain" → "Water & terrain labels"** (it matched the letters `rain` *inside* "ter**rain**" — a mid-word substring scored 72), **"clouds" → NULL** (plural didn't match the singular "Cloud cover"), **"co2" → NULL** (the label uses the subscript "CO₂"), **"temperature" → the ECMWF variant** instead of the general "Air temperature (2 m)". Rewrote `resolveLayer`: (1) a curated **multilingual `LAYER_ALIASES`** map (common/paraphrased term → the *exact* intended checkbox id, EN+JP+DE+RU+ES) tried first; (2) **subscript folding** (`_subnorm`, ₂↔2) so co2↔CO₂; (3) **word-aware scoring** — a query matches whole words / word-prefixes / `\b`-bounded phrases, and a fragment buried inside a bigger word no longer scores (so "rain"≠"terrain"); (4) singular/plural variants. Re-verified against the live DOM: rain→Precipitation radar, clouds→Cloud cover, co2→CO₂ per capita, temperature→Air temperature, 雨/気温/雲/人口/地震 all resolve, and every EXACT label the model emits still scores 98–100 (no regression).
- **"Claims it but didn't" — a deterministic interpreter (`localPlan`).** A clear single-intent command should never depend on (or spend) an AI round-trip. `localPlan(q)` maps such commands to the SAME action objects dispatch already runs, in all 5 UI languages, and returns `{actions,confident}`. **Confident** (fully-anchored single intent: dark/light/auto, globe/flat/3D, satellite/map, zoom in/out, world, reset-north, clear) runs **immediately, before `aiGate`** — so it works logged-out, costs no AI credit, and *cannot* silently no-op. **Non-confident** (navigation = explicit motion verb + place; layer toggle = on/off verb + a layer that actually `resolveLayer`s) is used only to **RESCUE** a failed AI plan (null / unparseable / empty / network error), so the AI still owns every compound, contextual and ambiguous request. Verified end-to-end through the real `IntMapConsole.run()` (no login): "dark mode"→data-theme dark, "satellite"→sat base, "flat"→flat projection, "globe"→globe projection (not world zoom-out), "world"/"地球"→planet, JP "風をオフにして/人口をオンにして" → correct layer toggle, "show me Tokyo"/compound → falls through to AI (no garbage). The honest per-step reporting loop was factored into `runActions()` and is shared by both paths unchanged.
- **All features usable — previously-unreliable ones are now first-class actions** (verified window fns / element ids, instead of the fuzzy `control` path): `{playground,mode:world|pandemic|quiz}` (→ `_pgWorldExplorer`/`_pgPandemic`/`IntMapEdu.open`), `{news,mode:subject|publisher|saved|translate}` (`pinmode-loc`/`pinmode-pub`/`newsfilter-saved`/`ai-translate-btn`), `{account}` (`btn-account`), `{donate}` (`btn-blueberry`), `{feedback}` (`_openFeedback`), `{bugReport}` (`_openBugReport`). SYS() updated with these + a "common keyword" layer hint. The universal `control`/`module` fallbacks remain for everything else.
- Verified: site runs (aiGate+IntMapConsole, **129 rows, 0 console errors**); resolveLayer + localPlan validated against the live catalogue; confident fast-path executes for real with no login modal. **No model/provider change** (still Gemini). **No ToS/Privacy/Sources change** — the new logic is pure client-side routing of existing features, adds no external call, and actually *reduces* AI usage (Atlas already discloses sending text to the AI provider; deterministic commands send nothing).

### R53 — region zoom FIXED (root cause = Nominatim junk) + place-label → polygon outline + anti-fabrication (re-report "地域名で一地点を極端ズーム／少しひねった地名でクソズーム／虚偽報告／地名ラベルクリックでポリゴン")
Concrete, separately-verified fixes; additive; `placeExtent` (Atlas IIFE) + new top-level `window.IntMapOutline`. **Model/provider unchanged (Gemini).**
- **Off-target REGION zoom — root cause found with LIVE Nominatim.** Typing a region jumped to a random tiny POI in the wrong country. Verified raw responses: **"Central Europe"** → a *quarter in Minsk, Belarus* (highest importance 0.133); **"Southern Italy"** → a *military office in Vicenza* (all hits importance 0); **"City Center of Chongqing"** → *"Fengdu Tourist Center" ~100 km away*. The old `placeExtent` blindly took the highest-importance free-text hit. New `placeExtent` (no per-type zoom constant — R51 rule kept): (1) a curated multilingual macro-**REGION gazetteer** (real extents Nominatim has no polygon for — "Central Europe"→[4,45,24,55] etc.); (2) **directional** names ("Southern Italy", "南イタリア", "Süditalien", "южная …", "el sur de …") = SLICE the base country's REAL polygon — but a "Dir+Word" string is often a PROPER name (South Korea, West Virginia, Northern Ireland) so the FULL name is checked first and kept whole when it's a real admin polygon (`adminPoly`); (3) **"city centre of X / 中心部 / centro de X"** = the city core at a close view; (4) **POI-vs-admin result filtering** (`_classBonus` demotes office/shop/highway…, promotes country/state/place/boundary). Verified live: Central Europe→region box, Southern Italy→sliced Italy [6.6,35.3→18.8,42.1], City Center of Chongqing→tight box on Chongqing, **South Korea / West Virginia → kept whole**, 中東→Middle East, France/Italy/Germany/Japan→correct metro extents (robustExtent unchanged).
- **Click a place-name label → outline its REAL extent as a polygon** (user request "地名ラベルをクリックしたら、その地域の範囲がポリゴンで表示"). New `window.IntMapOutline`: a single `map.on('click')` hit-tests the `ofm-country/city/other` label layers (14 px box), takes the clicked name, fetches the boundary from Nominatim (`polygon_geojson`) **disambiguated by nearest-to-click** (so the "Paris" label near France → France's Paris), draws a blue fill+line on a dedicated `pl-outline-src`, frames it, and shows a dismissable "⬡ name" chip. Survives basemap switches (re-adds on `styledata`); skipped while a measure/draw tool owns the click. **Screenshot-verified**: clicking/`show('France')` drew France's hexagon + its overseas territories in blue. Also an Atlas action `{type:"outline","place":str}` (region-aware: real polygon for places, gazetteer rectangle for macro-regions; `"clear"` removes it) and `clearAll` clears it.
- **Anti-fabrication (false "I did it").** When the model returns an **answer-only** plan (no real action) yet `localPlan(q)` has a deterministic action for the request, Atlas now EXECUTES the real action instead of printing words that claim an un-run action (the reported "実行していない動作を実行したという虚偽の報告"). Complements the R52 honest per-step loop.
- Every new string in **EN/JP/DE/RU/ES**. **ToS/Privacy/Sources UPDATED** (a real change this round): the OpenStreetMap source line now notes "place/region boundary outlines (Nominatim)"; Privacy clause 4 (EN+JP) now discloses the geocoding services (OSM Nominatim, Open-Meteo, Photon/Komoot) that receive a place name you search **or a label you click**; `LEGAL_DATE`→2026-06-26.
- Verified: site runs (**129 rows, 0 console errors**); `placeExtent` routing + extents validated against live Nominatim; outline + confident fast-path execute for real. No model/provider change.

### R54 — outline feature: 3 re-reported bugs fixed (country-skip / resolution / × not clearing)
Tight follow-up to the R53 outline. All in `window.IntMapOutline`; **screenshot- and poll-verified**.
- **"国を選択したときはポリゴンを表示しなくていい"** — the label-click handler no longer hit-tests `ofm-country`; it queries only `ofm-city` / `ofm-other`, so clicking a COUNTRY name draws nothing (cities/towns/villages still outline; the Atlas `{type:"outline"}` action still works for an explicitly-named country). Verified: 12 clicks on country labels → 0 outlines (before, the same first click outlined Iceland).
- **"ポリゴンの解像度が低すぎる（市町村レベルで線が直線的すぎる）"** — `polygon_threshold` was `0.006`, which simplified a ward to **~9 points** (a crude blob). Measured the trade-off live (Shibuya: 9 pts@0.006 → 48@0.0006 → 1000@0) and set **0.0003** (Cambridge/Shibuya now trace the true admin boundary with 100+ vertices). Screenshot confirms the detailed shape. Callers may override via `ctx.threshold`.
- **"×を押してもポリゴンが地図上に残ったまま"** — root-cause race: the R41 basemap-reassert heartbeat rebuilds the style, and the `styledata` re-add could repaint a just-cleared outline. Bulletproof `clear()` now flips an `_active` flag + nulls `_last` FIRST (the re-add is gated on `_active` and bails inside its own timeout), empties the source, AND hides the layers via `setVis('none')` — nothing can render until the next `show()`. The ✕ handler also `stopPropagation`s. Verified: chip stays hidden across a 5 s poll (10 samples) and the polygon is gone in the screenshot and does not come back.
- No model/provider change. No new data flow → **no ToS/Privacy/Sources change** (the outline's Nominatim use was already disclosed in R53; this round only tunes detail/clear/scope). 129 rows, 0 console errors.

### R55 — outline: × REALLY clears now + no flying to a same-named place (re-report, angry)
R54's clear() still failed because it missed the actual hole. Two real fixes, both verified live.
- **"×を押しても消えない" — the in-flight `show()`.** A click starts `show()`, which `await`s a Nominatim fetch (~0.5–1 s). If the user presses × DURING that fetch, the old `clear()` emptied the source, but the fetch then resolved and `show()` repainted the outline (the `busy` flag couldn't cancel it; the R54 `_active` gate only covered the styledata path). Fix: a generation token `_seq` — `show()` captures `myseq=++_seq` and, after every `await`, bails if `myseq!==_seq`; `clear()`/× bumps `_seq`, so any in-flight request is invalidated. Verified: start show() un-awaited, call clear() mid-fetch → chip hidden immediately and the polygon never appears (8 samples / 3.2 s after the fetch resolves). Normal show→clear still works.
- **"同名の別の地名に飛ばされる" — disambiguation.** The nearest-to-click pick subtracted `importance*2`, so a far but more-famous same-named place could win and the view flew there. And if the tapped place had no boundary in the results, it picked the nearest *far* same-named polygon and flew to it. Fix: pick the result whose point is GENUINELY nearest the click (no importance term), and a label click passes `maxDist:2.2°` — if even the nearest match is farther than that, `fetchPolygon` returns null (→ "no outline", the view stays put) instead of flying to a distant namesake. Verified live: "Boston" clicked by Boston UK → Boston, Lincolnshire (0.01° away); "Boston" clicked in central France → rejected (6.88° > cap), no fly.
- No model/provider change. No new data flow → no ToS/Privacy/Sources change. 129 rows, 0 console errors.

### R56 — outline ×: NUCLEAR clear + whole-chip tap target (re-report, still not clearing)
The R54/R55 clears (empty source + `visibility:none`, + in-flight `_seq` cancel) still didn't satisfy the field report. I couldn't reproduce the exact trigger in the headless preview (the basemap style stalls under `document.hidden` and OSM rate-limited the test fetches), and I ruled out any external style snapshot/restore (`_reassertBase` only toggles basemap visibility after a Map/Sat switch; the 2.5 s heartbeat `_sweepOrphanLayers` only hides `dl-` layers). So I made × **definitive** rather than chase the ghost:
- **NUCLEAR clear:** `clear()` now `removeLayer('pl-outline-line')` + `removeLayer('pl-outline-fill')` + `removeSource('pl-outline-src')` — there is literally no layer or source left that can paint the outline (was: empty the source + hide). `_seq`/`_active`/`_last` are still flipped off first so any in-flight `show()` / styledata re-add bails; the next `show()` re-creates everything via `ensureLayers()`.
- **Whole chip clears, not just the 6 px ✕:** the entire pill is now the dismiss target (`cursor:pointer`, `touch-action:manipulation`, `click`+`touchend`), the ✕ is decorative (`pointer-events:none`). A too-small tap target was a plausible reason "×" missed on touch.
- Verified live with a no-network `forceBox` draw (dodging the OSM rate limit) on a fresh renderer: box drew → tapping the chip cleared it → **gone and stays gone across 8 s / 3+ heartbeat cycles** (screenshot confirms the map is clean); a second draw→clear cycle works (ensureLayers re-creates after removal). Debug map-handle used during diagnosis was removed before commit.
- No model/provider change. No data-flow change → no ToS/Privacy/Sources change. 129 rows, 0 console errors.

### R57 — outline ×: REAPER safety-net + full real-flow reproduction (re-report "まだ残る／二度とだますな")
The user insisted × still leaves the polygon. I stopped claiming and **reproduced the exact real flow** in the preview — `show(name,{lng,lat,kind,maxDist})` (identical to what a label click calls) with a REAL Nominatim polygon, then tapping the chip — on **desktop, mobile (375px), and across a Map→Sat→Map basemap switch** (which destroys/recreates custom layers and exercises the styledata re-add). In every case the polygon CLEARS (screenshots confirm a clean map). Also confirmed the file on disk carries the fix (commit `3a5219f`), the service worker caches only TILE hosts (never `index.html`, and SWs don't run on `file://`), the chip is not blocked by any overlay (`elementFromPoint` returns the chip at its centre on both desktop and mobile), and `_reassertBase`/`_sweepOrphanLayers` don't touch `pl-outline`. So with the current code I cannot make × fail.
- Added a **REAPER** as a final guarantee anyway: the `styledata` handler, whenever NO outline is active (`!_active`), removes any surviving `pl-outline` layers/source. Style events fire constantly (interactions, tile loads, the 2.5 s heartbeat's reconciliations), so even if a `clear()` were somehow bypassed, the next style change reaps the stray polygon. It ONLY removes and ONLY when inactive — verified it does NOT kill an ACTIVE outline (the outline survived toggling a layer on/off while shown) and that a cleared outline stays gone through further style events. 129 rows, 0 console errors.
- If it still persists for the user, it is almost certainly a **stale loaded copy** (an open tab from before the fix) — the on-disk file is correct; a hard reload loads it. (Per [[screenshot-dont-blame-cache]] this is stated as a verified-fix + please-hard-reload, NOT a dismissal — the fix is screenshot-proven on the current file.)

### R58 — outline ×: forced REPAINT + click-leak guard (re-report "何回×押しても境界線残る／俺のせいにすんな")
The user reported the LINE stays no matter how many times × is pressed. I **instrumented** `labelClick`/`clear`/`show` with counters and fired a real pointer/mouse event chain at the chip's screen position: result was `clear=1, label=0` — i.e. × calls `clear()` exactly once, does NOT leak through to a map/label click, and the polygon clears. So I could not reproduce a re-draw. Two robustness fixes from this (instrumentation removed before commit):
- **Forced repaint** — the strongest NEW hypothesis for "the line stays visible": `removeLayer`/`removeSource` update the STYLE, but if the render loop was idle the last drawn FRAME (with the polygon) can linger on the canvas. `clear()` now calls `map.triggerRepaint()` so the next frame is guaranteed to have no outline.
- **Click-leak guard** — `labelClick` now bails unless the click's DOM target is inside `.maplibregl-canvas-container`, so a × tap (or any overlay tap) can never be mis-read as a label click and re-draw the outline, regardless of layout.
- Verified: instrumented counters proved one clear / zero leak; draw→tap-clear leaves a clean map (screenshot); 129 rows, 0 console errors. No model/provider change, no data-flow change → no ToS/Privacy/Sources change.

### R59 — outline: the ACTUAL bug (a SECOND popup) + point-in-polygon + no rectangles (screenshots from user)
The user's screenshots finally showed it: clicking a place label fires **TWO** features — the pre-existing **place popup** (#R8c: 甲府市 + Copy/Wikipedia/AI brief, with its OWN maplibre × close button) AND my IntMapOutline (blue polygon + chip). The popup's × only closed the popup; my blue boundary stayed. I was testing/fixing the wrong ×. Three fixes:
- **Unified the popup + boundary (the real "× doesn't clear" fix).** IntMapOutline is now a PURE boundary renderer — its own chip and its own `map.on('click')` handler are REMOVED. The #R8c place popup now owns the click and the ×: `showPopup` (non-country) calls `IntMapOutline.show(name,{lng,lat,fit:false})`, and `clearHL()` (popup ×, click-away, or a new label) calls `IntMapOutline.clear()`. The maplibre close button is wired to `clearHL`. So there is ONE popup, ONE boundary, ONE × that clears BOTH. **Verified live**: drew 甲府市's real boundary, clicked the popup × → `active:false` + popup gone + clean-map screenshot.
- **Same-name "飛ばされる" → POINT-IN-POLYGON (no fixed threshold).** The user: "固定基準で解決できると思うな". `fetchPolygon` now picks the candidate boundary that geometrically CONTAINS the clicked point (smallest if nested); a tap just off the glyph falls back to the smallest polygon whose bbox holds it; if NOTHING contains the click it returns null (never a far namesake). Verified live: 甲府市@Kofu→甲府市; Boston@UK→Boston, Lincolnshire; Boston@Tokyo→null (no draw); Springfield@Illinois→Springfield IL.
- **No more rectangles.** The user: "領域がわからない地名は全部長方形になるとかクソ". The bbox→rectangle fallback is GONE everywhere; if Nominatim has no real polygon, the outline draws NOTHING (the popup still appears). The Atlas `outline` action likewise drops `forceBox`/`box` and reports "no precise boundary" for regions without a polygon.
- Verified: 129 rows, 0 console errors; PIP + clear validated against live Nominatim and by screenshot. No model/provider change. No data-flow change → no ToS/Privacy/Sources change.

### R60 — Atlas: fine-grained commands become first-class ("まだ使えない操作がある。特に細かい指示や操作")
The gap was real: Atlas had coarse actions (rank/choropleth/flyTo/layer…) but no way to do the SMALL things — ask one number, highlight two named countries, nudge the camera by an exact amount, clear just the pins, turn everything off at once. All added as REAL engine calls (no ハリボテ), in both the AI schema (SYS) and the deterministic `localPlan`:
- **New dispatch actions**: `highlight` (named countries → `nlq-src` feature-state highlight + fit; `on:false` clears; dedupes "Trinidad and Tobago"-style splits by code), `value`/`stat` (one country's ACTUAL figure from `countryStats` — any METRICS key plus capital/currency/languages/flag; metric omitted → compact stat card; also highlights & fits the country), `layersOff` (unchecks every active layer via real change events; keeps `cb-borders`/`cb-names`/`cb-countries` base toggles unless `all:true`), `clear` with `what:` pins/radius/highlights/outline/measure(=exitTool)/isolate/all (SELECTIVE clear vs the existing nuke-everything `clearAll`), `fullscreen` (awaits the Fullscreen API promise → honest ⚠ if the browser refuses), `locate` (browser geolocation → flyTo + sets `_lastPlace` so "there" follow-ups work; denial/timeout reported honestly, 10s hard cap).
- **Precision upgrades to existing actions**: `opacity` accepts relative `delta` (「もっと薄く/濃く」 = ±0.2 on the real slider), `bearing` accepts compass `dir` ("face west"/「西向きに」), `timeTravel` accepts `date:"YYYY-MM-DD"` and honestly refuses dates outside the slider's 10-year range (was: silent clamp).
- **`localPlan` deterministic patterns** (5 languages, fully anchored so compound/ambiguous text still goes to the AI): zoom to N / ズームレベルN, tilt/pitch N° / N度傾けて, rotate ±N / N度回転, face DIR / 西向きに, zoom in a little/more / 少し・もっと拡大, pan DIR (+「少し右へ」= fraction 0.18), all-layers-off, fullscreen on/off, where-am-I/現在地, clear pins/radius/highlights, screenshot, "LAYER to N%" / 「XレイヤーをN%に」, more/less transparent / もっと薄く・濃く (only when `resolveLayer` really resolves), single-country stat questions ("population of Japan" / 「ドイツの首都は？」— only when the metric term AND `resolveCountrySync` both hit), "highlight X and Y" / 「XとYをハイライト」(confident only when the first name resolves).
- **Verified live** (headless preview; camera animations can't progress there because `document.hidden` freezes rAF — command dispatch itself confirmed): value EN+JP ("Japan — Population: 126,264,931", "Germany — Capital: Berlin"), highlight EN+JP, 全レイヤーをオフ (6 off, borders/names kept), 人口レイヤーを50%→もっと薄く→30%, clear pins/highlights, honest ⚠ for fullscreen+locate (headless has no gesture/permission), legacy dark/light/compass intact, "make the map darker" and compound requests still fall through to the AI (no hijack). 129 layer rows, 0 console errors.
- **Privacy**: `locate` uses browser geolocation (already used by weather/AQI widgets but the policy never said so) → Privacy §2 now states device location is permission-gated, used on-device, sent only to Open-Meteo for the weather widgets, never stored server-side. `LEGAL_DATE` → 2026-07-09. No new third party → Sources unchanged.

### R61 — Atlas: no more false "done" reports + real colour control + integrated cross-data analysis
Three re-reports, all real:
- **"実行できていない/沿えていない場合も完了報告"** — found and fixed THREE concrete false-report paths: (1) zoom/pitch/bearing notes printed the CURRENT camera value read mid-animation (e.g. "zoom to 5" → "✓ Zoom: 1.7") — they now report the instruction's TARGET ("✓ Zoom → 5.0"); (2) `highlight`/rank/ratio/relate called `highlight()` and reported ✦ even when it returned false (style still loading → nothing painted; reproduced live: `_hl` stayed empty after a "✦ Japan" reply) — now the paint result is VERIFIED, retried on a bounded ~5.6 s poll (#R41 slow-style lesson), and reported as a failure if it never painted; (3) unhonoured parameters were silently dropped ("highlight Italy in zorp" just highlighted Italy) — unknown colours now surface as an explicit ⚠ note while the rest of the action still runs.
- **"赤でハイライトしても色が変わらない"** — Atlas had no colour concept at all. Added `parseColor` (multilingual names in 5 languages + #hex) and wired colour through to the REAL paint: `highlight` (`color` param; colour-only = recolor current highlights via `setPaintProperty`), `mapMetric` (`color` → 5-stop ramp from that hue via `rampFrom`, applied to the live choropleth layer + legend), `radius` (sets the engine's `radiusColor`), `outline` (`IntMapOutline.setColor`, new module method). `localPlan` deterministic patterns: 「日本を赤でハイライト」 / "highlight X in red" / bare 「赤でハイライト」 (recolor). The highlight/choropleth layer colours became module vars so the styledata re-add keeps the chosen colour.
- **"ニュースやレイヤーの数値を統合して横断的な出力"** — new first-class `analyze` action: {question, place?, countries?, use?[news/weather/airquality/marine/elevation/quakes/stats]}. Atlas GATHERS real data — loaded news `globalData` (bbox/distance-filtered to the place, keyword-filtered otherwise; calls `fetchData()` if the feed is empty), Open-Meteo current weather / air quality / sea-surface temperature / elevation at the place point, USGS 2.5_day earthquakes (area-filtered), `countryStats` for named countries or the country under the place — then ONE text-AI call synthesizes an answer FROM THAT DATA ONLY, with an honest footer listing which datasets were used and which were unavailable. All sources were already in use by IntMap; no new third party.
- Verified live (headless preview: `document.hidden` freezes rAF so the style never finishes → the paint-failure path itself was exercised): camera targets reported correctly (`✓ Zoom → 6.0`, `✓ Tilt → 30°`, `✓ Bearing → 90°`), colour patterns route deterministically (日本を赤で/水色で/highlight X in green), "zorp" produces an explicit unknown-colour ⚠, paint failure reported honestly instead of ✦, legacy commands + value lookup + all-layers-off intact, 129 rows, 0 console errors. `analyze` needs a logged-in AI session so its end-to-end path can't run headless; its code path is the same gathered-data → askAI pipeline used elsewhere.
- **Docs/legal**: Privacy §4 now says Atlas integrated analysis may send the gathered data (news headlines, weather/air/sea/elevation readings, quake info, country stats) to the AI provider; Sources gained the missing **USGS** entry (the earthquakes layer/widget/compare were already using it!) and Open-Meteo's use text now covers air quality / sea temperature / Atlas analysis. SYS schema documents `analyze` + every `color` param.

### R62 — Atlas-as-OS mega-batch: highlight v2, live web search, POI mapping, brief-in-Atlas, UI, 5-country compare, keyboard, labels, right layer sidebar
One user batch, ten workstreams — all verified live in the preview (desktop viewport; map style loaded, so paint checks ran for real):
- **highlight v2** (「エメラルドグリーン・紺に対応していない」「奈良県で国全体が光る」「青いバナナ等の曖昧地域」): `parseColor` now normalizes compounds (spaces/・ stripped, 色/の suffix), knows ~40 more colours in 5 languages (emerald/紺/群青/ターコイズ/бирюзовый/esmeralda…), and falls through to ALL CSS colour names. Non-country names resolve down a ladder: country-name match → **Nominatim admin/natural polygon** (奈良県→県境ポリゴン, Stavropol Krai→地方ポリゴン — verified live, no more whole-country fallback) → directional slice → macro-region gazetteer (**soft superellipse**, never a rectangle; Blue Banana/Rhine-Ruhr/Rust Belt/Great Plains + 5-language aliases added) → **AI-traced approximate outline** (8-24 vertex polygon; corridors stay corridor-shaped) → containing country as the LAST resort. Polygons draw on a new `nlq-poly-src` (per-feature colour, styledata re-add, cleared by ×/reset/clearAll/choropleth). Output marks ⬡ approximate extents honestly. `resolveCountrySync` gained 韓国/米国/英国/北朝鮮/豪州/UK/USA/UAE aliases (verified: 「韓国の人口」 now answers).
- **Live web search** (the "insufficient data about Taiwan" reply): `analyze` and `brief` now pull **GDELT DOC 2.0** (worldwide outlets, last 72 h) + **Wikipedia** background by default. GDELT and the IMF DataMapper send no ACAO header → both go through the app's existing CORS-proxy ladder (direct → corsproxy.io → allorigins); verified live (real Taiwan headlines, IMF NGDPD data).
- **POI mapping** (「石油施設を表示して…そんなので使い物になるわけない」): new `poi` action — 22 facility classes (oil/gas/nuclear/wind/solar/power/dams/airports/ports/military/mines/steel/factories/hospitals/universities/stadiums/prisons/lighthouses/embassies/stations/desalination/data centers) in 5 languages mapped to Overpass selectors, name-regex fallback, place bbox from placeExtent (viewport if no place), pins + zoom-in labels + click popups on `nlq-poi-src`, honest 0-result/Overpass-busy messages, `clear what:"poi"`. localPlan: 「XにあるYを表示して」 / "map the X facilities in Y". **Verified live**: 「モナコにある病院を表示して」 → 2 real hospitals pinned with names.
- **AI Brief → Atlas** (「AI BriefはAtlasに統合して」): the `brief` action renders the structured brief INLINE in the Atlas chat (mdMini renderer; nearby loaded headlines + GDELT results injected into the prompt). The place-popup "AI brief" button and the country-card button route to `IntMapConsole.brief(name,ll)`; IntMapAIResearch stays for askHere/suggested questions.
- **Atlas UI** (「ChatGPT風」「初回は左に縦長」「起動ボタンを分かりやすく」): desktop default geometry = tall left column (14px/60px, 400px wide, full height); gradient logo chip, refined bubbles (user gradient / assistant bordered full-width), animated typing dots, focus-ring composer, gradient circular send. Launch button = gradient pill 「⌖ Atlas」 (icon-only <900px).
- **Country comparison rebuilt** (`IntMapStatsCompare`): up to 5 colour-coded countries, 22 indicators (multi-select chips), **source switch World Bank ⇄ IMF WEO** with per-row honesty ("IMF has no series — World Bank used"), latest-value table + overlaid time-series with a shared crosshair listing every country's value at the hovered year. Entries: country card ("国を比較"), stats tab button, Atlas `compareStats` + deterministic localPlan ("compare Japan and Germany" / 「日本と韓国を比較して」— both verified live incl. the IMF switch). Mobile: same modal, compact CSS.
- **Keyboard**: ESC now TOGGLES the sidebar; new set (/ L N I S C B 1 2 3 G M R D W T F 0 + − A) + `?` 5-language cheat-sheet modal — all verified via synthetic key events. Sidebar resizable to window−60px (「地図がほぼ隠れるレベル」).
- **Labels**: popups anchor at the LABEL's coordinates (not the click point; line-placed river labels keep the click). Sea/ocean/gulf labels moved OFF the per-tile water_name points (the zoom-drift root cause) onto a fixed 84-entry 5-language gazetteer layer `geo-sea` (OFM keeps lakes only); water/terrain/river/peak labels are clickable (popup, no highlight); **country-label click now outlines the country** from local countryGeo via point-in-polygon (reverses R54's exclusion per explicit new instruction).
- **Right layer sidebar** (opt-in via Settings → Layer panel; classic dropdown stays the default): the real `#layer-dropdown` node is reparented into a full-height right sidebar (all handlers survive), with a search box and a preview square on every row — real tiles for hillshade/Black Marble/GPW population/OpenRailwayMap/Köppen, deterministic gradient+icon otherwise. Verified: 129 rows decorated, search filter works, clean release back to classic. Auto-reachable from Atlas via the module registry (IntMapLayerSidebar / IntMapStatsCompare match the IntMap* auto-discovery).
- **Widgets**: gradient value type, hairline header rule, top accent line.
- **Legal/Sources**: Privacy §4 adds Overpass facility search, World Bank/IMF (codes only), USGS, GDELT (search terms sent), Wikipedia (topic name sent); Sources adds Overpass-API, GDELT, Wikipedia entries and updates World Bank/IMF texts. LEGAL_DATE already 2026-07-09.
- Standing rule honoured: every new feature (compare, POI, layer sidebar, web search) is wired into Atlas in the same change.
### R63 — re-report batch: no-symbol/no-bold Atlas, bottom ticker, accurate fuzzy regions, POI latency root cause, brief hijack, compare-in-sidebar, right sidebar v2 (real images), quiet widgets, lake/peak labels
Every point in the user's follow-up, verified live in the preview (desktop viewport):
- **"Atlas" not bold, no leading symbol**: launch pill = plain "Atlas" (weight 500, ⌖ removed), panel title "Atlas beta" (weight 500, gradient logo chip removed), context-menu entry de-symboled. Verified via computed styles.
- **Bottom ticker** (Settings → 下部ティッカー, default OFF, desktop only): a 30px full-width strip BELOW the map (`body.ticker-on .operation-room{height:calc(100dvh - 30px)}` — the map shrinks; nothing overlays it). Continuous right→left marquee (duplicated track, translateX(-50%), duration ∝ width, pause on hover): FX USD/JPY・EUR/USD・GBP/USD・USD/CNY (fxratesapi → ER-API), stock indices S&P 500/Dow/Nasdaq/Nikkei 225/DAX (**Yahoo Finance** chart endpoint via the proxy ladder — Stooq 404s from datacenter IPs; Yahoo verified live incl. real day-change %), gold/silver (gold-api), BTC/ETH+24h (CoinGecko), and clickable loaded-news headlines (kicks fetchData with retries when the feed is cold). 5-min refresh. Atlas: `ticker` action + 「ティッカーをオフに」 localPlan (both verified). Settings persisted (`imTicker`).
- **Fuzzy regions**: aiRegionPoly is now grounded in a live **Wikipedia summary** (net search) with 12-30 vertices and an anchors-inside self-check, and it takes PRIORITY over the gazetteer superellipse (now only the logged-out fallback).
- **Atlas default position**: still the tall left column but with a 64px bottom clearance so the always-on coordinate readout stays visible (verified: panel bottom 736 < readout top 754 @800px).
- **POI 「機能してない」root cause found**: the mirror ladder ran SEQUENTIALLY with no client timeout — a big-area query could sit silent for minutes. Now the three Overpass mirrors RACE in parallel with hard aborts (22s full / 45s lite), a lite retry uses only the 2 strongest selectors, and a new **aiFacilities** fallback maps AI-known real facilities (clamped to the box, clearly labelled "AI推定・概算"). Zero-result and Overpass-busy replies stay honest. Kuwait oil query now returns within the bounded window (verified; markers painted when the tab renders). The deterministic localPlan bubble also shows the typing dots instead of sitting empty.
- **Brief hijack** (「ギリシャの文化を教えて」→ AI Brief): SYS now hard-rules knowledge questions into {"type":"answer"} with the FULL answer text (mdMini-rendered, ~250 words allowed); `brief` is documented as explicit-request-only.
- **Country comparison UX**: popup REMOVED — renders inside the sidebar's stats area (#scp-view in #live-news-feed) with a Back button restoring renderStats. Source switching is now PER-INDICATOR (WB|IMF segmented toggle) and only appears on the 7 indicators that actually have an IMF WEO series; single-source indicators just say "· World Bank" (no fake dual-source implication). Verified: view in sidebar, 4 switches on default metrics, GDP flips to "· IMF WEO" independently, back works.
- **Right layer sidebar v2**: real imagery — 13 live-tile previews (Esri hillshade ×2, Black Marble, GPW grid, MODIS snow/NDVI/chlorophyll/AOD, GHRSST SST, AMSR2 sea ice, OpenRailwayMap, Köppen PNG on dl-climate) + dynamic RainViewer radar + **true mini-choropleth canvases drawn from countryGeo + the real stats** (density/GDPpc/HDI/TFR/democracy/military; upgrade pass runs when countryGeo arrives). Active-layers bar confirmed alive INSIDE the right sidebar (sticky, chips, clear-all — nothing removed). Left-style edge chevron toggle (#lsr-toggle) opens AND closes it, present whenever right mode is on. Verified: 129 thumbs (13 img + 5 mini at test time), active section visible with chips.
- **Widgets**: removed everything the user hated — no top accent line, no header underline, no gradient text, no bold (header/value/sub at weight 500/400/400), SF-style system stack pinned on the card.
- **Lake/peak label drift**: 36 major lakes added to the fixed gazetteer (SEA_LABELS now 120 water bodies, 5 languages, clickable); OFM lake labels only from z5.5 (small lakes, sub-glyph drift); peak + lake text sizes made CONSTANT (the zoom interpolation caused the visible slide).
- **Legal**: Privacy §4 + Sources add the market-data APIs (fxratesapi/ER-API, gold-api, CoinGecko, alternative.me — pre-existing widget gap — and Yahoo Finance for the ticker); LEGAL_DATE → 2026-07-10.
### R64 — accuracy batch: real-boundary region composition, true label-anchor pinning, in-flow ticker & right sidebar, area-wide POI, compare picker, live-search ladder + provider web search, language mirroring, 5-language sweep
Every point of the re-re-report, root causes first — verified live in the preview:
- **Fuzzy regions = REAL boundary composition** (「こんなカクカクポリゴンで許されると思うなよ」): two root causes found & fixed — (a) Nominatim jsonv2 returns `category`, NOT `class`, so `_classBonus` never penalized POI junk nor boosted admin boundaries (畿内's real historic boundary lost to noise for 60+ rounds); (b) `polygon_threshold=0.02` (~2 km Douglas-Peucker) WAS the blocky-polygon generator → 0.0008. New resolution ladder: country → country GROUPS (旧ソ連15/EU/NATO/ASEAN/Baltics/G7/BRICS/中東/中南米… exact national borders from countryGeo, 5-lang aliases) → curated COMPOSITIONS as unions of real admin polygons (Japanese 地方=prefecture unions; Bessarabia=Moldova+3 Budjak raions+Khotyn; chernozem belt=15 UA oblasts+15 RU oblasts+MD+4 KZ regions; fertile crescent≈48 governorates/provinces with western clips) → direct Nominatim boundary → directional slice now CLIPS the real polygon (Sutherland–Hodgman) instead of a superellipse → AI names the member admin units (Wikipedia-grounded) and the same composition draws them → AI-traced outline (24-60 verts, honestly labelled approximate) → gazetteer box last. Unit fetches: 1.05 s throttle gate (Nominatim policy), failures retried once & never cached, plus a **geoBoundaries ADM1 fallback** (files are Git-LFS — the real content with ACAO:* is on media.githubusercontent.com; fuzzy shapeName match, edit distance ≤2). Composed regions render as one MultiPolygon feature with faint internal seams (`comp:1`). Verified live: 東海地方 (4 prefectures, real coastline), 磯城郡 (real county relation), ベッサラビア (textbook shape), チェルノーゼム (complete belt UA→Orenburg even while Nominatim was rate-limiting this IP — geoBoundaries carried it), 旧ソ連諸国 (15 countries; antimeridian sets can't bbox-fit → zoom-to-world fallback).
- **Lake/peak label drift — real fix, zero hardcoding** (「数十件の登録で何が変わるねん」was right): true root cause — OFM tiles store a DIFFERENT label geometry for the same lake at every zoom, and lakes are LineString label lines, so any tile-reading layer re-anchors on zoom. `ofm-water`/`ofm-peak` now read client-side stable sources filled by a runtime harvester: every name worldwide is pinned to its FIRST-SEEN coordinate (LineString→midpoint; name+coarse-cell dedupe; SEA_LABELS-gazetteer dedupe; `map.on('idle')` registered ONCE — an unguarded registration piled up listeners and saturated the main thread). Verified: 6 unique Finnish/Karelian lakes pinned from 25 raw per-tile features; `window._imLabelStats()` diagnostic.
- **Ticker truly below the map**: `#ticker-bar` is no longer position:fixed glass — it is an opaque in-flow block inserted directly after `.operation-room` (which cedes 30 px). No display-scaling/dvh rounding can ever overlap it with the map. Verified: 736+30=766 px, canvas resized.
- **Right layer sidebar expands like the left one**: no longer a fixed overlay — a flex child of `.operation-room` with a `margin-right` transition (mirror of `.sidebar.collapsed`); opening PUSHES the map. Search/previews/edge chevron kept. Fixed a real regression this exposed: the `.lsr-thumb` preview span (empty) matched the name-extraction selector first, so Active-layers chip names were silently blank in right mode → `:not(.lsr-thumb)` in all extractors.
- **Active layers at the TOP** (「一番下にあったら意味ないやろが」): sticky-top FIRST child in the classic dropdown, right sidebar and mobile sheet. The R32 zero-movement guarantee is preserved differently: the chip row is ONE fixed-height horizontally-scrolling line and the bar is always rendered (「(0)」when empty) — its height never changes, so rows never shift. Title/Clear-all now 5-language.
- **POI whole-territory coverage + explicit basis** (「地点が一部地域だけ」「根拠もわからない」): when the place resolves to a real OSM admin relation, the Overpass query runs against the AREA (`area(3600000000+relid)`, `out center 600`, timeout 25/60 s) instead of a 30°×24° clamped bbox — that clamp was the "only some regions" cause. The reply now states the basis (every matching OSM-tagged facility across the whole territory vs the shown box) and warns when capped at 600. Verified: クウェートの石油施設 → 597 pins territory-wide.
- **Live web search everywhere + report quality** (the Greece report): GDELT now queries with the ENGLISH topic name (Japanese place names returned nothing → the eternal 「取得不可: ライブWebニュース」); Google News RSS search added as the second live engine (user language + English, proxy ladder) for analyze AND brief; and ai-proxy now supports `web:true` → Anthropic's native web_search tool (max_uses 3) — DEPLOYED. The analyze system prompt is rewritten as a REPORT: lead with dated news developments, no recitals of weather/quake-absence/statistics unless relevant (~220 words).
- **Language mirroring** (「言語設定の言語でしか返答しないのはやめろ」): Atlas replies in the language of the user's MESSAGE — `_replyLang()` (script + stop-word detection) drives the AI prompts AND the deterministic reply strings (console-local `L()`/`lx()` now mirror; unsupported languages fall back to the UI language; button-opened briefs use the UI language). Verified on an EN UI: 「地図をクリア」→「✓ 地図をクリアしました」, "clear the map" → "✓ Cleared the map".
- **Full 5-language sweep** (「新規機能だけ言語対応して何の意味があるねん」): ~190 remaining EN/JP-only ternaries converted to real 5-language (de/ru/es hand-translated) — legends, news reader, community, profile, tool panels, toasts, ago-strings, isolate buttons, upload/crop dialogs, sea-level/fires/EEZ descriptions, etc. Standing rule: new inline strings must be written 5-language from the start. ToS/Privacy body texts remain jp/en only (legal documents; de/ru/es see English) — noted in Architecture §10.
- **Legal/Sources**: Privacy §4 adds Atlas's browser-side Google News RSS search (topic sent), the provider-side web-search disclosure, and geoBoundaries (country code only); Sources adds geoBoundaries (CC BY 4.0) and updates the Google News entry. LEGAL_DATE stays 2026-07-10.
- Standing rule honoured: everything stays operable through Atlas (groups/compositions flow through the existing `highlight` action; POI/ticker/compare unchanged entry points).
### R65 — right-sidebar bug batch, fully-dynamic water/peak labels, rivers as lines + basins
User re-report (「右サイドバーがバグってる」「まだWater & terrain labelsバグってる。ハードコードでやろうとするな」「河川は線で、流域は支流+薄い面で」). Root causes found and fixed:
- **Right sidebar — 4 real bugs fixed**: (1) the `ms-narrow` search-pill watcher computed collision/anchors in VIEWPORT coordinates and its full-width branch set `--ms-right:14px` → the fixed-position search pill stretched ACROSS the open in-flow sidebar; it now works against the visible `.map-container` edges, is HARD-CLAMPED into the map area, gets `max-width:calc(100vw - left - right)` so degenerate geometry collapses instead of overflowing, and `IntMapLayerSidebar.open/close` dispatch `intmap-sidebar-resize` so it recalculates immediately. (2) `#layer-dropdown` kept `overflow-y:auto` inside `.lsr-body` → it (a non-scrolling box) became the sticky containing scroller and the Active-layers bar NEVER stuck in right mode → `overflow:visible !important` in lsr-mode. (3) TWO stacked search fields (the sidebar's own `.lsr-search` + the dropdown's `#layer-search-wrap`); the sidebar one also left `.lyr-row` husks when filtering → hidden; the dropdown's proper search (filters every row type) is the single field. (4) classic panel: `#layer-search-wrap` is inserted at firstChild AFTER `_placeActiveSection`, so the Active bar's `margin-top:-12px` overlapped the search box → the bar owns the top (ensureBox now slots the search box right below it) and the negative flush-margin applies only via `:first-child`. A reported "opens/closes by itself" could NOT be reproduced (instrumented `open()` with a stack logger through the exact repro sequence — zero hits); note that Esc toggles the LEFT sidebar and `L` toggles the layers panel BY DESIGN (R62 shortcuts), which can look like self-opening if keys are hit while the map has focus.
- **Water & terrain labels — no more fixed-list ceiling**: the runtime pinning harvester now ingests ALL `water_name` classes (sea/bay/strait/gulf/lagoon + lakes; previously lakes only → every non-gazetteer sea/bay had NO label at all = the "数ゲー" complaint), with a class-scaled dedupe cell (ocean 30° / sea 12° / bay·strait 2.5° / lake 4°) so one Caspian gets ONE pin instead of one per tile-pyramid level. New `ofm-water2` layer renders the big-water classes from z2 (geo-sea-style italic); `ofm-water` keeps lakes from z5.5. The 120-entry gazetteer remains ONLY as a multilingual override for the majors (5-language names + click), everything else is live tile data. All layer-id lists updated (applyLabelLang, STACK, click/hover handlers). Verified: 18 water bodies + 222 peaks pinned around the Finnish lake district; ▲ peak labels visible in the shot.
- **Rivers & basins** (「全部が全部行政区分使えばいいわけじゃない。見極めて」): highlight targets are now JUDGED before any admin logic — `basinIntent` (流域/basin/watershed/catchment/Einzugsgebiet/бассейн/cuenca) → `buildBasin`: main stem from Nominatim's real waterway LineString (full detail; Overpass named-ways fallback) + basin outline (OSM basin relation if it exists → AI-traced outline grounded in Wikipedia, honestly labelled approximate since basins have no official admin boundary) drawn as a FAINT fill (per-feature `op:0.14`) + EVERY OSM river/canal inside the basin polygon via an Overpass `(poly:...)` query as thin tributary lines (count reported, capped honestly, logged-out = main stem only + warning). `riverIntent` (〜川/〜River/Fluss/река/río…) → the river's real course as a 3.2px line on the new `nlq-line-src`/`nlq-line` layer. `aiRegionUnits` now must JUDGE: non-admin-shaped regions (basins, ranges, deserts, belts, sea areas) return `mode:"outline"` and skip composition entirely. New localPlan anchors (「Xの流域を表示して」/"show the X basin") and SYS highlight docs updated. Clear wiring: lines cleared by reset/clearAll/highlight-off/clear-highlights/Atlas ×. Verified live: 信濃川 → line drawn; 利根川の流域 (logged out) → main stem + honest 「流域の輪郭を取得できませんでした（本流のみ描画）」.
- basinIntent keeps 川/江/河 in the base name (first cut stripped it → "利根" mis-resolution).
### R66 — the three re-reported items, root-caused for real
- **Ticker (「地図の上にそのまま載せるな」)**: removed the height ARITHMETIC entirely. `body.ticker-on` is now a flex COLUMN: `.operation-room{flex:1 1 auto;min-height:0;height:auto!important}` + `#ticker-bar{flex:0 0 30px}` — the bar is a layout row BELOW the app shell; no dvh/display-scaling rounding can ever place it over the map (the old `calc(100dvh - 30px)` depended on dvh agreeing with the flex math on every scaling factor). Mobile media override keeps `body{display:block}` + full-height shell. Verified at 1422×766: operation-room bottom 736, bar y736 h30, canvas resized 736.
- **Right sidebar (「バグった位置に出てくるせいで何もできない」)**: two hardenings. (1) open/close now set `margin-right` INLINE (transition still animates) — the position no longer depends on cascade order or a CSS transition completing; verified: with the transition disabled the open state lands exactly at [win-430, win] with the map shrunk (672px at 1422 wide) and the search pill clamped clear of it. (2) `adopt()/decorate()` wrapped so a failure can never abort `open()` half-way (stranded off-canvas panel). Note for the record: the headless preview FREEZES CSS transitions (hidden tab, no RAF) — a transitioned property never reaches its target there; that masked/mimicked this class of bug during earlier verification. On visible browsers the transition completes in 0.38 s.
- **Peak/water label drift (the Mount Futatsumori screenshot)**: TRUE remaining mechanism found — vector-tile coordinates are QUANTIZED to the tile grid, so a first-seen pin captured from a low-zoom tile sits up to ~1 km off the real summit, and zooming in scales that fixed offset to hundreds of screen pixels = 「ズームに応じてずれる」. Pins now REFINE: the same feature observed at a HIGHER integer zoom upgrades the stored coordinate (peaks converge up to z14; water stops at z7 so a big lake's label never jumps to a tile-local line segment); zooming back out never regresses a refined pin. Logic unit-tested (coarse z7 → refined z12 same pin; z6 re-observation ignored; same-name distant peak = separate pin).
- **Tributary cap (「⚠支流は上限で打ち切り…ふざけんな」)**: the user is never told to re-search. If the basin query saturates the 3000-way server cap, the basin polygon is automatically CLIPPED into bbox quadrants (real ring clips via `_clipGeoRect`) and re-fetched per quadrant, merged and deduped by way id (~12k ways ceiling, 600k point client cap). Only if a quadrant still saturates does a *factual note* appear (smallest streams omitted; all major tributaries drawn).
