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
