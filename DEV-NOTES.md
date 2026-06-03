# IntMap — Developer / Context Notes

> 開発の意図・理由・ユーザーの意向を共有するための専用ファイル。
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

## 2. Standing design intents (ユーザーの意向)

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
