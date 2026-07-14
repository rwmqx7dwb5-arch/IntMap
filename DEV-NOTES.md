# IntMap — Developer / Context Notes

> A living record of *why* things are the way they are, so future sessions (human or AI) have context.
> Keep this in sync with the code. Inline code comments reference task tags like `(#NN)`.

---

## R104 — 19-item re-report/feature batch: Countries UI, time machine, workspace polish, contrast regression, Atlas ranking-highlight, transit routing without login (tag `#R104`)

Several are R103 re-reports where the earlier fix was too shallow; the rest are new. Map-pixel features (era borders, route drawing) are reasoned + logic-verified in the headless preview (`document.hidden`, WebGL never finishes) — the rest verified via computed styles / DOM.

**Countries** — (#1) flag 26→**30 px** and the inter-card gap 7→**4 px** (also the ws `#countries-feed` `gap:8px` override → 4). (#3/#6) the compare hint lost its **chart illustration** and is now a single line (`white-space:nowrap`); it renders in both normal & ws Countries. (#19) the indicator pulldown + sort toolbar now **sticks to the top** of the list (`#countries-feed .stats-toolbar` sticky, painted with the recessed panel tone), gaps to the search above / cards below tightened; the asc/desc button has **constant width** (both labels stacked in one grid cell → auto-sizes to the wider; verified 106 px in both states) and the plain-text ↑/↓ are replaced by a **refined SVG arrow**. (#11) the ws `!important` `border-bottom` on `.stat-row` was overriding the hover ring on the bottom edge only ("下は途切れている") → re-assert all four edges on `:hover`.

**Contrast regression (#9)** — the opaque (default) sidebar painted with `--glass-fill` **== `--card-bg`**, i.e. the exact colour of the News/Info/Countries cards, so cards vanished into the panel. Restored the elevated-tile look via a recessed `--panel-bg` (light `#e9ebef` desktop sidebar; dark `#141416`) with the dark cards lifted to `#2a2a2e` (extended the R103 stat-row-only fix to news/wiki/comm). Verified: dark `#2a2a2e` cards on `#141416`; light `#fff` cards on `#e9ebef`. Frosted sidebar modes + the mobile sheet untouched.

**Time machine (#2)** — the collapsed "See the past world" button tucked further into the corner (right 14→**10**, bottom 22→**16 px**, non-flush; the real rule was the later `.news-timeline` pill override, not the base). The "Applied" chips are written **smaller (9 px)** and the **News chip text is now constant** ("News" + an ok/amber dot + a range tooltip) so crossing the news-range boundary no longer changes its width → the base 3 chips stay on **one line** while the slider moves (verified `oneRow`).

**Time-travel borders/labels (#4/#5)** — "国境や国名が変化しない": the R94m "moveLayer era layers to top" protection had been removed to stop a flicker loop, leaving `imtb-line/lbl/lbl2` liable to be buried after a styledata/base swap. Added them to the **`_raiseLabelLayers` STACK** (guarded by `inPlace()`, so no loop) → era borders + names stay on top while travelling. The `_same`/`imtb-lbl2` (unchanged countries keep their current label) vs `imtb-lbl` (renamed → era name) split from R103 is retained. Logic verified live: setYear(1914) → `IntMapTimeBorders.active()` true, nearest snapshot picked, aourednik fetch 200.

**Atlas** — (#15) `highlight` gained a **ranked/filtered form**: `{metric,n,order,minPop,maxPop}` computes the top/bottom-N from the real country data (after a population filter) and highlights exactly those — "人口5M未満を除外したGDP per capita上位10ヵ国をハイライト" now works deterministically (executor + schema doc + `_fillMetric` for lazy metrics; verified the ranking runs & picks a non-empty set). (#16) removed the "会話で調整できます: 「家賃を重視して」…" hint line from the scoreMap reply.

**Transit routing (#8) — ROOT CAUSE** — "東京から横浜まで鉄道で経路を出しても地図に出ない": `run()` executes `localPlan` deterministically (no login) but there was **no localPlan pattern for directions/routing**, so the command fell to `aiGate()`, which returns silently when logged-out → nothing drawn. Added a directions localPlan (JP "AからBまで〔鉄道/電車/車/徒歩〕で経路", mode-first "電車でAからB", EN "directions from A to B") → `{type:'directions',from,to,mode}`. **Verified**: the phrase now draws the route (5 Transitous options, full itinerary) with no account. The routing engine itself was always fine.

**Search fields (#17)** — the Countries filter box + the in-map search bar unified with the **Atlas input pill**: radius 12→**21 px**, hairline `rgba(128,128,128,0.25)` border, `--card-bg` material, and the 3 px focus ring (map bar keeps its floating frost). Wording & size unchanged. A ws exception keeps the pill inside windows (the blanket `.ws-body>* border-radius:0` had squared it).

**Start page (#18)** — the first-run welcome card is no longer auto-shown (`_imWelcome` kept, just not invoked).

**Workspace** — (#7) the join/snap indicator made **clearly visible** ("どこで接合されるのかわからない → わかるUI"): the shared-edge bar is 4 px, full-opacity primary with a stronger glow + a gentle pulse, snap detection EPS 6→10, snap guide 2→3 px brighter. (#10) tightened the vertical padding around the Atlas "…inaccurate" note. (#12) the ws Atlas window's "Atlas" title gets a **background chip** (like normal mode) instead of a flat full-width title bar (bar → transparent, label → `--input-bg` pill). (#13) "Active layers" is **no longer ALL-CAPS** in the layers window + the gap up to the Search box tightened. (#14) a language change now **immediately** re-localizes everything in ws mode: the layer-sidebar **tiles rebuild** (verified 130 tiles EN→JP), and the News & Community windows re-render (were stuck until reload).

**ToS/Privacy/Sources**: no new endpoints or data flows (Transitous/MOTIS + World Bank already listed) → no legal change.

---

## R103 — re-report batch: past-labels ROOT CAUSE found (applyLabelLang race), scrollbar scoping, routing-in-the-Atlantic guard, Atlas UI polish, time-machine sizing (tag `#R103`)

21 items, mostly R102 re-reports. **BREAKTHROUGH: `?rafshim=1` makes the map actually render in the headless preview** (`window.__imap` set, `isStyleLoaded()`=true), so the map-layer bugs (past labels, layer visibility) were finally VERIFIABLE, not just reasoned about.

**Past country labels (#7) — REAL root cause + verified fix.** The modern `ofm-country` labels were **re-appearing** in the past no matter what R94/R102 did ("変化なし"). Traced live: `_applyBorders()` hides `ofm-country` while travelling, but **`applyLabelLang()` runs on many events (styledata, cb-names, language, the 2.5 s label-raise interval) and unconditionally RE-SHOWED `ofm-country` based on `namesOn`**, overriding the hide within ~2.5 s. Fixed at the root: `applyLabelLang` now keeps `ofm-country` hidden whenever travelling (city/other labels stay). **Verified rendering**: at 1930 `ofm-country` renders **0** features, `imtb-lbl2` renders unchanged countries with their CURRENT name (France→"France"), `imtb-lbl` renders changed states with the era name (Empire of Japan / Ceylon / Yugoslavia); on return to Now `ofm-country` renders 32 again and the era labels clear. `_same` split: 293 unchanged / 224 changed.

**Global (#20)** the custom-scrollbar auto-hide added `sb-active` to `<html>`, so scrolling ANYTHING lit up EVERY scrollbar ("他の場所のすべてのスクロールバーも表示"). Now the scroll handler marks only the actually-scrolled element (`.sb-on`, auto-clears 900 ms) — verified 1 element gets it, not all.

**Countries**: (#6) the time-machine banner said "real GDP" for EVERY indicator — now reflects the selected one (verified: population/area/military spending). (#15) dark-mode country cards were `rgb(28,28,30)` = the sidebar exactly (zero contrast) — lifted to `#2a2a2e` + stronger border (verified). (#2) card gap 12→7 px. (#8) the compare hint is icon-led + main-text colour (the muted one-liner read as "missing").

**Time machine (#3)**: button 163×46 (was oversized), tucked to bottom-right (14/52 px, non-flush); popup 360→**314 px**, smaller value (26 px, still weight-500) / toggle / chips; the "Applied" chips now sit in their own row UNDER the label and no longer wrap (verified 3 chips, one line). (#12) hide the time-machine button while the flight sim is flying.

**Ticker (#11)**: the far-right hide button was an absolute overlay that the scrolling text ran under ("重なって汚い") — restructured so the text lives in a clipped `.tk-scroll` flex child and the button is a real flex sibling (verified `position:static`). (#10) layer-tile caption reverted to 11 px.

**Atlas**: (#19) Atlas messages have **NO bubble** (full-width, verified transparent/no-border/no-radius), the user bubble is tighter (6 px vertical), and map-move confirmations no longer echo the location ("📍 place"→"✓"). (#16) in ws mode the in-panel "Atlas beta / – ×" header is hidden (the window has its own), the intro sub-text drops once a conversation starts, the input bar's vertical padding is tighter, and the "AI can be inaccurate" note is ONE static line under the input (not appended to every message — the brief's per-message note removed). (#5) examples rewritten to Atlas's real strengths (comparison / computed ranking / live news synthesis / cross-data) with **no routing** (still rough — not advertised); (#14) the "walk dotted / colour-coded" wording dropped from the transit reply. (#18) removed the redundant per-message AI disclaimer + location echoes (the "unnecessary info").

**Workspace**: (#1) the two view-control bars tightened in ws mode (group padding 4→2 px vertical, inter-bar gap 8→4 px). (#4) the coordinate/elevation readout tucked closer to the corner (9 px base / 7 px ws, non-flush) — this, not the active-layers bar, was the real "常時表示欄". (#9) the adjacency highlight now also shows LIVE while resizing/dragging (whichever edge is joined), not only on hover. (#17) a **Support** button added to the right of Feedback in the top menu. (#21) the ws chrome (menu bar + window titles) + the Countries/Info window contents now re-localize immediately on a language change (were stuck until reload).

**Routing (#13)**: a CORS-proxied MOTIS response can mangle the encoded polyline → `_decodePoly` yields garbage coords (route drawn "in the Atlantic off America"). Now each decoded leg geometry is validated against the leg's own plain-lat/lon endpoints and DISCARDED if any point is >3° away, falling back to a straight from→to line.

**ToS/Privacy/Sources**: no new endpoints / data flows → no legal change.

---

## R102 — big re-report batch: ws early-boot, flight-sim in-app fullscreen, time-machine faithful rebuild, Countries pulldown, ticker config, wind flicker (tag `#R102`)

A 28-item batch, most re-reports of R101. Everything additive/in-place; verified in the preview where the DOM/state is observable (the headless tab is `document.hidden` → `window.__imap` never sets → MapLibre-LAYER visuals verified by logic + the pieces that ARE in the DOM). Full script re-parses clean (all modules `object`, 130 layer rows, 0 errors).

**Workspace**: (#1) enter ws mode from a **microtask right after script-parse** (`_bootWS` gated on `IntMapConsole` existing) instead of a fixed 900 ms — no more empty-background gap (verified: active + 6 windows in <300 ms). (#14) the map window's **Measure/Radius/Screenshot/Share/Atlas/Layers tool bar hidden** (`#map-tools-group{display:none}` in ws) — the View controls stay; those tools all live in the top menu / Layers window. (#17) **adjacency indicator** — hovering a window edge shared with a neighbour lights up exactly that join (`.ws-adj`, `sharedSeg()`); minimal, hover-only (verified: 3px segment on the map↔Countries border, hidden at centre). (#18) switching mode from Settings **closes the Settings popup**. (#19) brand **not bold** (700→500). (#22) default side columns (**Countries/Layers/Atlas**) open at their **min width** (300 px; map gets the rest — verified 300/680/300/300 @1280). (#23) **ESC toggles the map window fullscreen** (guarded against inputs / modals / flight-sim; verified 680↔1280). (#8) **ticker on/off reflows** the bottom-edge windows to fill/vacate the strip (`tickerReflow`, verified atlas 313↔343).

**Flight sim**: (#3/#4/#5) all overlays raised **above the ws chrome** (fs-hud 3002→6002, setup 3050→**6050**, result 3060→**6060**, map promote 3000→6000) AND in ws mode the **map WINDOW itself is lifted to fullscreen** (`.ws-win.ws-map` z-index 6000, its stacking context was trapping the promoted map → the "真っ黒" black screen), hiding the menu/ticker/other windows for the flight. **`requestFullscreen()` removed** — fullscreen means WITHIN IntMap, not desktop/OS fullscreen. (verified: setup popup z 6050 > menu 5990). (#6) master volume **0.85→0.425** (50%).

**Time machine** (rebuilt to the mock): (#27) the collapsed widget is now the **labeled button** "See the past world / 1900 to present" (rewind-clock SVG). (#11) popup faithful to the image — value **NOT bold** (800→500), **fixed 360 px body** so the "現在へ戻る" button never shifts as the date length changes (verified btnLeft constant 830), **blue-check chips** for applied items + amber dot for out-of-range, subtle badge. (#2) clicking a **place label in the past** no longer forces the country card — the whole-country `imtb-fill`/`imtb-line` click **defers** when a specific place label (city/water/sea/peak/river) is under the point. (#12) **past labels**: robust `tagSame` (diacritic-insensitive `\p{M}` normalize) tags each era polygon `_same`; renamed/vanished states show the era name (`imtb-lbl`), unchanged countries show their **current localized name** (`_modName` → `imtb-lbl2`, e.g. "フランス" for JP) i.e. keep the existing label; nothing loses a label.

**Countries**: (#20) the sort button row → an **indicator PULLDOWN + ascending/descending toggle** (GDP/Pop/Area/HDI/Mil$/Life exp./Fertility/A–Z); each indicator carries a default direction (numeric desc, A–Z asc → the auto-switch), missing values always sort to the END, lazy WB metrics (life-exp/fertility) back-filled real via `_imFillStat` (verified: toggle reverses, area auto-desc Russia-first, name auto-asc, life-exp fill → Japan 84.0). Cards: **bigger flag/name (26/15 px), region/capital smaller + SLASH-separated, value-only** (no indicator label). (#10) the "1930 · real GDP (2011 int$)" banner **wraps** instead of clipping to "…". (#15) compare-dock **📊 removed**, empty guidance restored (verified showing). (#16) the "Filter countries…" box **truly hides while comparing** — a `body.scp-open` class + higher-specificity CSS beats the ws `!important` show-rule that made R101's inline hide a no-op ("変化なし").

**Ticker**: (#25) a small **hide button** at the far right turns the whole ticker off. (#26) **symbol/item picker in Settings** — checkboxes per instrument (grouped Forex/Indices/Commodities/Crypto) + a News toggle, applied & persisted live via `IntMapTicker.setConfig` (verified enable count 13→11, news off). (#7) active-layers bar left/bottom gap tightened a little more (non-flush).

**Misc**: (#9) Atlas examples de-Japanned for **every language except JP** (US/China/Germany compare, a London/Berlin/Moscow/Madrid transit isochrone; JP stays Tokyo-flavoured). (#21) layer-tile caption **11→12.5 px**. (#24) **Wind(animated) flicker** — the field-raster REBUILD (kept; in-place `updateImage` no-ops) now sets a `_fieldBusy` guard + a 500 ms debounce that skips ONLY while the field is still present, so a `styledata` burst (incl. the rebuild's own) can't re-enter and re-run the 250 ms fade. (#28) Start card **up-to-date** (100+ layers·live weather / time machine / Atlas AI & flight sim) and the **Satellite-Drop + layer-tour buttons removed** (both still reachable elsewhere). (#13) free AI is already **30** client + edge (`PLAN_LIMITS.free`); **the `ai-proxy` function still needs `supabase functions deploy ai-proxy`** for the server quota to actually be 30 (until then the UI shows 30 but the server caps at 10) — I can't deploy it.

**ToS/Privacy/Sources**: no new external endpoints, data collection or third parties in this batch (ticker uses the same market APIs; the WB metric back-fill is already disclosed) → no legal change; `LEGAL_DATE` stays 2026-07-15.

---

## R101 — big batch: desktop defaults, label-click fix, workspace polish, country-stats, time-machine redesign, flight-sim SOUND + per-aircraft displays (tag `#R101`)

A large multi-item request. Everything additive/in-place; verified in the preview (headless can't render the MapLibre style — `window.__imap` never gets set in a hidden tab — so map-LAYER visuals were verified via state/DOM, and the whole script was syntax-checked by `new Function()` over the main `<script>` in the page).

**⚠ SELF-INFLICTED SCARE (caught before commit):** the new `tagSame()` had `try{ … return fc; }` with **no `catch`** → "Missing catch or finally after try" made the ENTIRE `<script>` fail to parse → every module undefined, ws mode dead. No console error surfaced in the headless tab. Root-caused by compiling the extracted main block with `new Function()` in the page. **Lesson: after a big edit batch, syntax-check the whole script, don't trust "no console errors" in the hidden tab.**

**Desktop defaults**: workspace mode ON by default on desktop (`_wantWS()` = saved `on:0`→off, `on:1`→on, else `!isMob()`); ticker ON by default on desktop (`imTicker` init). **Reload flicker** ("通常モード→ws"): a synchronous `html.ws-boot` pre-hide (injected at IIFE eval when `_wantWS()`) hides the normal sidebar before first paint; `enable()` clears it; 6 s safety net.

**Place-label clicks (past & present) FIX**: two robustness fixes since the map can't be driven headlessly. (1) The label-click `wire()` — which holds BOTH the per-layer handlers AND the padded-hit fallback — only bound once `ofm-country` existed, via a bounded 12 s retry; a slow OpenFreeMap load made ALL label clicking dead. Now re-armed on every `styledata` (binds whenever the labels appear). (2) `IntMapTimeBorders.clear()` (return to Now) now empties `imtb-src` + hides `imtb-fill/line/lbl/lbl2` + re-runs `_applyBorders()`, so no stale near-invisible full-country click-target is left over the present map hijacking label clicks.

**Workspace polish**: junction CIRCLES removed (`buildJunctions`→no-op; the snap-guide line is the clearer join indicator, made 2 px + glow); window body bg + title bars unified to the Countries colour (`.ws-win{background:var(--bg-color)}`, all title bars `--input-bg`); big radiating drop-shadow cut to `0 1px 5px`; brand 20 px **bold**; Auto-arrange menu item removed; **minimized windows keep their area** (`tileOrder` includes `data-min`, `retile` skips their height → cell reserved); Community window removed (leftover from R98); Ticker on/off toggle added to the menu bar (tracks `body.ticker-on` via `syncDock`→`_syncTicker`); map View controls (Map/Sat/Flat/Globe/3D + compass) shown in the map window top-right (un-hid `.map-controls-top`); workspace-styled Settings (floating panel, light dim, `--bg-color`).

**Country stats**: non-sovereign geographic features (`sov:false` — Scarborough Shoal, Southern Patagonian Ice Field, Bir Tawil…) excluded from the list + compare picker; compare header simplified to "国を比較（最大10か国）" (no 📊, no paragraph); "行をタップして2〜3カ国…" → "行をタップして国を選び比較（最大10か国）"; time-machine banner compressed to a 1-line status bar ("1930年 · 実質GDP（2011年国際ドル）") and cards now say **実質GDP** in historical mode (was 名目, mismatched the banner); ws window "国"→"国別統計" (JP) + tabStats; the outer "国を絞り込み…" box hidden while comparing; `.stat-row` padding 12→8; active-layers bar left/bottom gap tightened.

**Atlas**: example prompts REWRITTEN to Atlas-only tasks (compare 3 countries · defense-vs-GDP ranking · a transit isochrone · a South-China-Sea brief) instead of trivial one-tap actions; sidebar Atlas button = the existing Atlas gradient, no ✨, News/Countries pill shape (`.mode-atlas`).

**Misc**: free AI 10→**30**/day (client `AI_FREE_DAILY` **and** the `ai-proxy` edge function `PLAN_LIMITS.free` — the edge function must be REDEPLOYED to take effect); AI panel de-dup (removed the "✨ Built-in AI is ready" line that duplicated the section hint); Satellite switch no longer auto-pops the provider panel (`satPanelDismissed` default true on desktop; re-clicking the active Satellite button toggles it); "Summarize this view" button removed; `--text-muted` legibility boost (dark #a6a6ad→#cfcfd6, light #6c6c70→#48484d); Settings follows the transparency setting (was always `--popup-bg`); layer tiles shorter; "Others (beta)" section defaults COLLAPSED across ALL languages (was English-text-only match → JP/DE/RU/ES showed it open — now keyed off the header's `data-i18n=lyrGrpOthers`).

**Time machine redesign** (to the attached mock): title + "過去表示中" badge + ×; Year/Date mode toggle; big value ("1930年") + "現在へ戻る"; year slider (1900→now) with era marks; "反映内容" chip row (国データ/国境/ニュース with ok/warn dots). Closes when you operate elsewhere on the map (`dragstart`/`zoomstart`/`click` + outside `pointerdown`). Share `ts`(days)→`tt`(ISO) via the kernel, backward-compatible. **Past labels**: era polygons tagged `_same` (name still matches a present-day country) → unchanged countries keep the normal country-label style (`imtb-lbl2`), renamed/vanished states show the era name in era style (`imtb-lbl`), all from the era data so nothing loses a label.

**Flight sim SOUND** (`fsAudio`, Web Audio, no assets): throttle/RPM/Mach engine (prop vs jet + afterburner), EAS-linked wind noise, stall horn + buffet, gear/flap servos, touchdown thud + tyre skreel, overspeed clacker, GPWS voice callouts (Web Speech API — altitude calls + pull-up/sink-rate/too-low-gear). Built on the START-button gesture; mute on the deck. **Per-aircraft displays** (`disp`): Cessna/warbird/glider → analog **six-pack** (ASI/AI/ALT/TC/HI/VSI, needles driven from state — verified ASI 20.2° @180 km/h, ALT 180° @2500 m); airliner → glass **PFD** (speed/alt tapes translate, rolling+pitching horizon, heading strip; the moving-map is the ND — verified alt tape translateY(900) @9000 m); fighters (F-16/F-35) → the existing **HUD**, unchanged. buildHUD/updateHUD split into `sharedChromeHTML`/`hudInstrHTML`/`sixpackHTML`/`glassHTML` + `updateShared`/`updateSixpack`/`updateGlass`.

**ToS/Privacy/Sources**: Privacy §4 (EN+JP) now discloses the flight-sim audio (synthesized locally with Web Audio; GPWS voice callouts use the browser's Web Speech API, which some browsers process via an online voice service); `LEGAL_DATE`→2026-07-15. AI "1日10回→30回" across all 5 languages.

**DEPLOY NOTE**: `supabase/functions/ai-proxy/index.ts` `PLAN_LIMITS.free` is now 30 — needs `supabase functions deploy ai-proxy` for the server quota to match the UI (until then the UI shows 30 but the server still caps at 10).

---

## R100 — Flight sim: the REAL HUD overlaps + re-flagged physics/game fixes (tag `#R100`)

The user was (rightly) furious that "UI overlap" was still there — I'd fixed the badge's internal spacing but not the structural overlap. **MEASURE, don't guess:** `getBoundingClientRect()` on every `#fs-hud` panel at 1440×900 found the two real overlaps — **the Exit button (`.fs-x`, y70–98) sat inside the altitude panel (`.fs-tr`, y14–100)**, and **the control hint (`.fs-hint`, y784–884) overlapped the minimap (`.fs-minimap`, y649–826)** (both were `right:14px` stacks). Fixed: Exit → below the altitude panel; hint → the clear bottom-left. (The remaining `.fs-htape ∩ .fs-hdg-box` is the standard heading-tape boxed readout.) Verified 0 panel overlaps except that one.

Physics/game re-fixes (the ones the user said to do before the projected-HUD phase):
- **Negative-AoA stall**: per-aircraft `aStallNeg` (a real number in `_ACX`) replaces the derived `−aStall+2(CL0+flapCL)/CLa` that made a full-flap Cessna "stall" at ≈−0.9°. Verified: −3° no stall, −13° stalls.
- **High-speed touchdown CRASHES** (`>1.7·Vstall` OR `>110 m/s` tyre limit) instead of `0.72·Vne` (which let the F-35 "land" at ~425 m/s). Verified: 200 m/s crashes, 60 m/s lands, gear-up crashes.
- **Altitude consistency at the ROOT**: the minimap heading/altitude are set in `updateHUD` from the SAME frame's `st.alt` as the main HUD (it runs after the throttled `updateMinimap`, so it wins) — verified identical, not a 10 m rounding band-aid.
- **Glider "runway" = aerotow RELEASE** (airborne start, `computeTrim` into a glide) instead of a 33 m/s ground "warp".
- **Distance accumulates full-resolution every frame** (`st._dist`) — the decimated draw-path would short-cut turns.
- Runway wording softened to **"near <airport>"** (no real runway geometry yet).

**Still DEFERRED (unchanged):** projected/FOV HUD + FPM, centre tapes, GPWS/PFD, per-aircraft instruments, wind, aero tables, true FBW, propulsion model, runway geometry + gear contact model, ground effect, scoring/modes, ECEF, sound, gamepad, DEM look-ahead (collision still skipped when the DEM is null; AGL still shows the last value). **TEST-HARNESS NOTE:** mocking `map.queryTerrainElevation` DOES reach the module (verified: ground start settles to `terr+1.2`, spy called), but test the ground-contact/landing path from a **ground start** (which settles the terrain) — an airborne start + manual `st.alt` override reads terrain inconsistently.

## R99 — Flight sim: real sky/haze, satellite path map, HUD/label fixes, game bugs (tag `#R99`)

Screenshot-driven fixes (a real cockpit screenshot + a long critique). **Shipped:**
- **Sky** — the black sky (no height cue) is replaced by `map.setSky()` atmosphere (blue gradient + horizon haze + distance fog; `setSky` & `setLight` exist in 5.24, `setFog` does not — fog lives in the sky spec). Restored on exit.
- **Result path map over SATELLITE imagery** — redrawn in Web-Mercator with Esri World Imagery tiles behind the altitude-coloured path (`destination-over` as tiles load), start/end markers. Was a plain dark canvas.
- **HUD overlap** — the aircraft name and the EAS/Mach readout ran together in the badge → separator + gap.
- **Airspeed relabelled EAS** — `TAS·√(ρ/ρ0)` is *equivalent* airspeed, not IAS (the report's own correction). Real IAS/CAS (pitot + compressibility) is a further step.
- **Stale control hint** — removed "1–6 aircraft" (feature gone); **LEVEL → "CAM LVL / camera-level"** (it levels the camera, not the aircraft).
- **Minimap altitude** rounded to 10 m so the throttled minimap can't show a different exact number than the main HUD.
- **Glider ground start** gets a winch/tow launch speed (`ac.Tmax<=0 → V=Vcruise`) — an engineless glider couldn't take off from a runway.
- **Pause time excluded** from the flight timer; **path recording DECIMATES** (keeps the whole route, coarser) instead of dropping the oldest section (long flights under-counted distance).
- **LANDED** now needs a real roll-out to a slow taxi speed (`< max(15, 0.55·Vstall)`, was `1.15·Vstall` ≈ approach speed); the result names the airport for a runway landing vs "off-field".

**Still DEFERRED (told the user, unchanged from R97/R98 + new ones from this critique):** angular-projected HUD (project horizon/pitch-ladder/**FPM** from the camera matrix + FOV, instead of a fixed-scale SVG), a real **flight-path-vector marker**, centre-mounted speed/altitude tapes, GPWS-style **terrain/sink-rate/pull-up/PFD warnings**, per-aircraft instrument panels (fighter HUD / A320 PFD-ND / Cessna six-pack / glider vario), a **wind/turbulence field**, **Mach/α/config aero tables** + per-type `alphaStall±`/`CLmax/min`, a real **propulsion model** (prop CT/CP(J), jet spool/AB) + ceiling-from-excess-power, **true FBW G-command**, a full **landing-gear contact-point model + ground effect**, real **runway geometry** + landing **scoring**, **ECEF/WGS-84**, **control modes** (arcade/standard/sim), **touch rudder / gamepad / sensitivity**, and **sound**. Each is a focused phase; the flight model remains a strong 6-DOF single-surface model, not a panel-method sim. The **workspace-mode "no flight UI"** bug and full Community backend removal also still open (need on-screen debugging / a careful refactor).

## R98 — Flight sim: F-35 default, globe, result screen, Atlas button; de-cringe status (tag `#R98`)

Concrete bug/UX fixes from a frustrated report (+ a deep physics wishlist, mostly deferred — see below).

**Shipped:**
- **Default aircraft = F-35** (was airliner). **Mid-flight aircraft switching removed** (the in-cockpit chips + keys 1–6) — you pick the airframe on the pre-flight screen and can't swap it in the air.
- **Keeps the GLOBE projection** — the sim used to force flat. Verified the eye-point camera applies pitch>90 correctly in globe (bearing/pitch/roll echoed exactly).
- **Reference stall speed DERIVED from weight + config + CLmax** each step (`√(2mg/ρ·S·CLmax)`) instead of a hardcoded per-aircraft number that disagreed with the aero (A320 → 70.7 m/s, matching the table the report quoted, vs the old 64). ρ is local so the TAS stall rises with altitude.
- **Post-flight RESULT SCREEN** (`showResult`): on a crash OR a completed landing the flight ends on a screen showing the flight path as a mini-map **coloured by altitude** (blue low → red high) + stats (distance / max-alt / top-speed / time) and **Fly again** (back to the pre-flight screen, same setup) / **Exit**. `crash()` shows this instead of the old silent auto-respawn (the R key still resets in place mid-flight). Path recorded each loop; loop/physics halt the instant it opens; `stop()` clears it. LANDED threshold relaxed 1.02→1.15·Vstall so a normal touchdown + short braking registers ("can't land").
- **Launching the sim closes the Atlas console** (`_closeAtlas` in `setup()`/`start()`).
- **Sidebar "Community" button → "✨ Atlas"** that opens the Atlas console (DOM id kept to avoid churn); Community is no longer reachable from its primary entry point.
- **Removed the "🩺 IntMap self-diagnosis" emoji/wording** from the `diagnose` action → plain "Data & connection status".

**Honestly DEFERRED (told the user):** the deep-physics wishlist is a genuine multi-phase flight-model rewrite, not a one-pass job — (1) **distributed panel aero** (split wings/tail/fuselage into panels with local V=Vair+ω×r → wing-tip stall, autorotation, spin, tail stall from first principles); (2) a **wind/turbulence field** (Vair=Vground−Vwind; crosswind, shear, gusts, Dryden/von Kármán — would tie into IntMap weather); (3) **propulsion tables** (prop CT/CP(J)+RPM/torque; jet altitude/Mach/spool/AB) + make the ceiling emerge from climb-rate decay rather than forcing thrust→0; (4) **landing-gear contact-point model** (per-wheel spring/damper/friction/steering + ground effect −25%@b/4); (5) **ECEF/WGS-84** position frame (local-NED still clamps ±85°); (6) **true FBW G-command** + multi-dim `Ci=f(α,β,M,Re,p,q,r,δ)` tables; (7) numerics (Ixz, fuel/CG, exp-map attitude). Also still open: the **workspace-mode "no flight UI"** bug and the **HUD overlap** (both need on-screen visual debugging the headless preview can't do) and the full Community **backend** rip-out (only the entry point was repointed). Each is a focused follow-up.

## R97 — Flight sim: pre-flight setup + airport takeoff/landing + trim-equilibrium & stall fixes (tag `#R97`)

Response to an expert physics critique + concrete feature requests.

**Feature requests (shipped):**
- **Pre-flight `setup()` screen** ("開始時に機種等を選択させてから"): pick the aircraft (6), a start location (26 real airports with field elevation + a runway heading, or the current map view) and the mode — **on the runway (take off)** or **airborne**. This is now the entry point from the **Playground** (new "Flight Simulator" tile) and from the Atlas `flightSim` action (prefilled with any named aircraft/place).
- **Ground start / takeoff / landing** ("空港を選択し陸地から離陸・着陸"): a ground start spawns stationary ON the runway (gear down, level, heading down the runway, idle throttle); the height settles onto the real DEM and **parks (never freefalls) while tiles load**. A fresh ground spawn is not falsely "LANDED" — a new `_tookOff` flag means a touchdown only counts once the aircraft has been airborne. Verified via `_dbg`: airliner parks (alt=field+1.2, V0, hdg0, not LANDED); fighter takes off (rotate ~72, liftoff 78 m/s ≈ 282 km/h, climbs 250 m); airliner lands, brakes, and LANDED registers.

**Physics fixes (shipped):**
- **True equilibrium trim** (`computeTrim`): removed the positive-CL floor, so a fast/light machine trims at a NEGATIVE AoA and no longer accelerates upward from spawn (P-51 verified: −0.62° AoA, holds level dV/dAlt 0 — was ~1.45 g up). The elevator trim now zeroes the pitch moment INCLUDING the propeller slipstream over the tail, the thrust-line moment (large on the A320) and the flap moment — all previously omitted. The engineless glider trims into a steady GLIDE (γ=−atan(CD/CL) ≈ 2°, constant speed) instead of level-then-sink.
- **Stall = critical AoA** (FAA), both signs: removed the false `V<Vstall` stall (a slow but low-AoA float no longer reads STALL — Vstall stays only as the landing/reference speed); separation onset is now ASYMMETRIC (matches `aStallN`) and flaps shift both stall angles. Structural break + overG warning use the asymmetric ±g limits (`gLimN`), not `abs(G)`.
- **HUD Mach** uses the physics' altitude-dependent speed of sound (was flat `V/300`); **IAS** shown alongside the panel's TAS.
- Verified attached/cruise flight is bit-for-bit unchanged (the flat-plate blend is inactive below the stall).

**Honestly DEFERRED (documented, not faked):** the genuinely large items in the critique — a full WIND/weather field (crosswind, drift, turbulence, windshear, mountain wave; airspeed would then differ from groundspeed), an ECEF/WGS84 global position frame (the local-NED integrator still clamps at ±85° Mercator), an independent look-ahead Terrarium terrain sampler for collision (still uses `queryTerrainElevation`, i.e. the render DEM), and re-deriving the aileron/rudder derivatives into real-angle `ailMax`/`rudMax` units (the roll/yaw OUTCOME is already tuned to verified-realistic rates, so this is a cosmetic unit cleanup, not a behaviour bug). These are separate, sizeable phases. The critique's own "最優先" four (per-aircraft elevator-angle limit, speed/G limiting, negative-AoA stall continuity, deep-stall drag) were already delivered in R96 and refined here.

## R96c — Live cameras: add the US/Canada DOT "511" network (~17,000 more, verified hotlinking) (tag `#R96c`)

Request: *"ライブカメラのcoverageを今の5倍に。"* — 5× the live-camera coverage.

- **What shipped:** the shared US-state / Canadian-province DOT **"511" map platform**. Markers come from `https://<site>/map/mapIcons/Cameras` (`item2:[{itemId, location:[lat,lon], title}]`), which sends **no CORS header** → fetched ONCE per site through the app's proxy ladder (corsproxy.io → allorigins → codetabs). The camera IMAGE is at `https://<site>/map/Cctv/{itemId}` and **hotlinks directly** + auto-refreshing (no proxy for the image). Every one of the 13 regions was verified for BOTH list-access AND image-display (no facades): **FL 4903, GA 4043, NY 1868, PA 1522, NC 1114, ON 934, NV 648, WI 482, ID 457, New England 404, AB 356, LA 336, YT 15 = 17,082 cameras.** `loadOneStop()` staggers the sites 350 ms apart and a throttled `_osSchedule()` rebuilds the ~25k-feature source at most every 600 ms. Legend, Sources panel and Privacy (JP+EN) updated. Verified: pipeline (proxy list → parse → `[lon,lat]` feature → Cctv image) yields in-state coordinates and hotlinking images; page boots, 112 layer rows, 0 console errors.
- **Honest scope — this is ~3× (roughly tripling the fixed networks ~8.3k → ~25.4k), not a literal 5×.** The remaining big US states (NJ/MN/IA/SC/VA/TX/WA/MD/MO/KS…) run a **newer single-page-app 511** behind **Cloudflare bot protection** (`/cdn-cgi/challenge-platform/`) — their camera lists can't be fetched reliably at runtime (the proxy gets challenged), so adding them would create dead pins = the very facades the project forbids. OpenTrafficCamMap is maxed (same 8 states; Ohio/Kentucky still don't hotlink). So this is the largest expansion achievable with **reliable, keyless, hotlinking** feeds; going further needs a server-side fetcher/keys for the Cloudflare-gated networks. **No new data collection; the new sources are disclosed in ToS/Privacy/Sources.**

## R96 — Flight sim: camera through the vertical (no flip), HUD banks, moving-map, deep aerodynamics rework + F-35 (tag `#R96`)

Re-report: a second precise batch. (a) the view still flips 180° passing straight up (bearing 360→180, roll 45→−135 — a coordinate singularity even with a quaternion); (b) the HUD ADI/roll-pointer/pitch use `qToEuler()` so the INSTRUMENTS flip over the top even when the view is fine; (c) the pitch ladder doesn't rotate with bank; (d) *"追従カメラなんてくそなモードはつけるな"* — kill the follow camera; (e) add a car-nav / FlightRadar mini-map; then a long list of aerodynamics faults (priority: per-aircraft elevator max angle in rad; limit deflection/G by speed; the negative-AoA stall discontinuity; deep-stall drag) plus post-stall moments, G-limit enforcement, high-speed pitch sensitivity, actuator speed, the ±14 rad/s cap, prop slipstream, thrust-line & flap pitch moments, ceiling, compressibility, ground/gear geometry; and add the F-35 with real specs.

- **Camera vertical-flip (C2).** bearing/pitch/roll is a coordinate chart with a pole straight up/down — the nose crossing it flips bearing & roll ~180° in one frame. There is NO settable camera quaternion in MapLibre 5.24 (checked: no `setFreeCameraOptions`, transform exposes only `setBearing/Pitch/Roll`), so the fix is **rate-limiting**: slew the applied bearing & roll with a wrap-aware cap (900°/s — far above any real turn/roll rate, so only the instantaneous pole pop is clipped; pitch has no singularity → exact). The pop becomes a ~0.2 s smooth slew at 60 fps. Verified through repeated loops: pitch swept 1°→179°, per-frame bearing/roll change stayed clamped to the cap (never the raw 180° snap).
- **Follow camera removed (C1).** Cockpit only (eye AT the aircraft); the chase branch, the `C` action, the VIEW deck button and its hint are gone.
- **HUD banks with the aircraft (H1/H2).** The ADI horizon, roll pointer and pitch ladder now read the camera's CONTINUOUS bank (`st._camRoll`), not the ±180°-flipping `qToEuler` roll, so the instruments no longer spin over the top; and the pitch ladder now ROTATES with bank so its horizon line stays parallel to the real one (it used to only translate). The heading tape already reads the nose vector (R95).
- **Moving-map / nav display (M1).** A small track-up SECOND MapLibre map (`.fs-minimap`) follows the aircraft with a centre plane symbol, a rotating N arrow and a heading/altitude readout; zoom adapts to height AGL. Toggle `M` / the MAP button. It reuses the app's existing **Esri World Imagery** raster → **no new data source**. Torn down (`minimap.remove()`) on exit. Verified: created (canvas present), heading/alt readouts + N arrow update in flight, removed on stop.
- **Aerodynamics reworked (valid through the FULL AoA range; attached flight below the stall is bit-for-bit unchanged and re-verified).** A smoothstep blends the linear model into a flat-plate model past the stall: CL rolls off **continuously on BOTH sides** (the negative-AoA lift JUMP is gone — verified G-vs-AoA is smooth & symmetric), and CD climbs toward a broadside `CDmax` so a deep stall / tailslide / vertical really bleeds speed (broadside decel ≈15 m/s² vs ~0). Post-stall the elevator and pitch stiffness fade and a flat-plate nose-down moment appears.
- **Pitch feel & limits.** Real **elevator max angle `elevMax` (rad)** per aircraft — the raw stick used to be fed straight into `Cmde` (1.0 = a 57° elevator!). Per-aircraft **actuator speed `ctlRate`** (a jumbo no longer slams to full stick in 0.33 s) and **body-rate cap `omMax`** (was a flat ±14≈800°/s for everything). **FBW** (airliner/fighter/F-35) is an AoA/G limiter layered on the trimmed elevator: it fades the command as the AoA (predicted 0.3 s ahead from the pitch rate, so it anticipates) nears the AoA for the ±g-limit or stall — this ENFORCES gLim (was warning-only) and kills high-speed pitch twitch. Non-FBW aircraft can over-stress → **structural failure past 1.5× the limit (design ultimate)**. Verified: fighter/F-35 cap ~8–9 g (was 18+), airliner ~2.2 g; warbird snaps at ~14 g; pitch rates dropped hard (cessna 68→38°/s, P-51 129→65°/s).
- **More physics:** propeller **slipstream** feeds the tail (elevator works at low speed / on the roll), **thrust-line** & **flap** pitch moments (power/flaps → trim change), **service ceiling** now bites (thrust fades above it → held near 13 km not blasting past), **transonic wave drag** (jets no longer fly Mach 1.7 on low-speed aero; bounded, supersonic-capable ~M1.3+), and **ground/gear geometry** (rotate about the main gear, nose-wheel & tail-strike limits). R95's norm-preserving 6-DOF integrator is retained → mirror-symmetric rolls & no loop energy runaway still hold.
- **F-35A Lightning II (⚡, key 6)** added with real-ish figures (~15 t, S 42.7 m², F135 125 kN dry / 191 kN wet, 9 g, M1.6, high-alpha FBW). Trims level, G-limited, verified.
- **No new external data source → no ToS / Privacy / Sources change.** All verified on the live MapLibre 5.24.0 build (physics via `_dbg.step`, camera/HUD/minimap via the rAF loop; 0 console errors, 112 layer rows + clean start/stop teardown).
- **R96b (follow-up):** the FBW limiter capped SUSTAINED turns at only ~68% of the rating (fighter 6.2 g of 9) because the pitch-rate lead also penalised the pitch rate a steady level turn legitimately needs. Fixed by leading only on the pitch rate IN EXCESS of the steady-turn rate `qSteady=(g/V)(n−1/n)` — a sustained turn now reaches the full limit (fighter 9.1 g, F-35 8.7 g) while a rapid pull-up is still anticipated and never overshoots the structural-failure threshold (verified: FBW peaks 9.1 g ≪ 13.5 g break point; non-FBW warbird still fails at 14.5 g; trim & loop energy unaffected).

## R95 — Flight sim: eye-point camera THROUGH the vertical + 9 line-referenced physics/camera bugs (tag `#R95`)

Re-report: a precise, line-referenced diagnosis. The camera "bounces", the viewpoint is not on the aircraft, and loops / inverted / mountain-starts are broken. Nine faults, priority ①Euler反転 ②85°制限 ③垂直追従 ④地形読込 ⑤開始方位 + ⑥stuck keys ⑦背面失速 ⑧脚上げ着陸 ⑨速度更新. Plus: stop the normal map's move-event processing during flight.

- **★ Camera rebuilt on the TRUE eye-point API — and R94t's "85° is the hard ceiling" was WRONG.** MapLibre 5.24.0 DOES expose `map.calculateCameraOptionsFromCameraLngLatAltRotation(lngLat, alt, bearing, pitch, roll)`, `setMaxPitch(≤180)` and `setCenterClampedToGround(false)`. I'd previously "verified them absent" with `for…in`, which SKIPS non-enumerable methods inherited from the Camera superclass; a `typeof` + full prototype-chain walk found all three, and a live call applied `{bearing:20, pitch:130, roll:15}` EXACTLY. So the eye is placed AT the aircraft (Cockpit) / behind+above it (Follow) and **bearing/pitch/roll come straight from the body axes**: bearing = nose heading, pitch = 90 − asin(nose_down) (so >90 looks UP, past the vertical), roll = the wings' bank about the view axis (continuous through the vertical, unlike the `qToEuler` roll that flips ±180°). `setMaxPitch(179)` + `setCenterClampedToGround(false)` at start, both restored on stop. The OLD path called `calculateCameraOptionsFromTo` (eye → a 1.8 km ground target) then FORCED pitch into 0–85°, which (a) drifted the eye off the aircraft and jittered every frame = the **"bounce"**, (b) could never look above the horizon, (c) took roll from the Euler gimbal. A safety fallback keeps the `…FromTo` path (also resolves pitch>90 on 5.24.0 — measured) for any build without the rotation API. Verified live over a full loop: camera pitch **0.5°→179°**, roll **0→180°** (inverted over the top), **0 errors / 429 frames**. (Fixes ①②③ + the bounce.)
- **④ Spawn / terrain settle.** Start & respawn no longer read `queryTerrainElevation` while it returns null (DEM not loaded → false 0 m → spawn INSIDE Himalaya-class terrain → "crash the instant the DEM loads"). A one-time `_settleTerr` waits for the first confirmed ground read, lifts the aircraft to a safe clearance and re-trims; collision stays skipped until then.
- **⑤ Start heading.** `map.getBearing()||90` turned a valid 0° (north-up map) into 90° (east) because 0 is falsy. Now read properly → verified north-up start = heading 0°.
- **⑥ Stuck keys.** Added `blur` / `visibilitychange` / `pointercancel` / `touchcancel` listeners that release every held key — a tab-switch or interrupted touch mid-manoeuvre no longer leaves roll/pitch/throttle stuck.
- **⑦ Inverted / negative-AoA stall** now raises the STALL flag (was `aoa > +aStall` only; now also `aoa < aStallN`, the CL curve's negative break, which the aero already modelled). Verified: aoa −26.6° → stalling.
- **⑧ Gear-up touchdown = belly landing = CRASH** (used to count as "LANDED" at ≤1.3·Vstall). A gear-down gentle approach still lands (both verified). Ground contact also gained a small hysteresis + full vertical-velocity damping below flying speed → kills the near-ground physical bounce.
- **⑨ Body-velocity integration** — the report's exact words *"人工的な横滑りやエネルギー増減が高角速度時に出る"*: (a) all three axes are integrated from the SAME old state (was sequential u→v→w Gauss–Seidel) → a left roll and a right roll are now EXACT mirror images (β ±1.95°, φ ±52.44°, ΔV 0); (b) the −ω×v frame-rotation term (which does zero physical work) is a TRUE norm-preserving rotation of the old velocity, not the explicit-Euler cross product that inflated |v| ≈√(1+(ωh)²) every step — a held loop used to run a gentle climb away to **Mach 15**; now energy only DECAYS to drag (E-ratio 0.93 loop / 0.80 tumble, speed never exceeds the entry speed). Hands-off trim still holds V and altitude constant.
- **Move-event load during flight.** A single `window.__fsCamActive` flag gates the three heavy, non-throttled per-move handlers (label occlusion, compare-map sync, graticule redraw) off while the sim drives the camera; they are hidden overlays in the fullscreen cockpit anyway and resume on exit. (The many debounced `moveend` handlers already self-suppress under continuous `jumpTo`.)
- **Scope / honesty.** All 9 fixed and verified on the real 5.24.0 build — physics deterministically via `_dbg.step`, the camera via the live rAF loop; 0 console errors, 112 layer rows + all subsystems intact, clean start/stop teardown (HUD removed, maxPitch/clamp restored). Still a MapLibre renderer (no dedicated 3-D cockpit); the linear aero far outside the normal envelope (deep spins) is still an approximation but no longer injects energy. **No new external data source → no ToS / Privacy / Sources change.**

## R94t — Flight camera: a TRUE eye-point at the aircraft via `calculateCameraOptionsFromTo` (tag `#R94t`)

Re-report: *"動きがおかしいし、明らかに視点が運動点にない。ふざけるな。"* — the motion is wrong and the viewpoint is clearly NOT at the aircraft (運動点 = the moving point).

- **Root cause:** every previous camera looked AT a ground `center` from behind, so the eye was never on the aircraft — that offset is the wrong parallax/motion and the "viewpoint not at the moving point". I had also **wrongly recorded** that this MapLibre build has no free camera.
- **The build is MapLibre GL JS v5.24.0.** It has no `setFreeCameraOptions` (that's Mapbox), BUT it exposes **`map.calculateCameraOptionsFromTo(eye, eyeAlt, target, targetAlt)`** → the `{center,zoom,bearing,pitch}` that put the camera EYE at a world point looking at a target. So the eye is now placed AT the aircraft (Cockpit, default) or a little behind+above it (Follow, `C`), looking along the NOSE (body +x rotated into the world by the attitude quaternion), and the bank is applied as `roll`. The viewpoint sits on the point of motion and the view rotates ABOUT the aircraft (a real cockpit) — it never orbits a distant ground pivot. Verified live: level → eye at the aircraft, bearing = heading, pitch ≈ 85° (forward); bank 32° → cam roll 32°; dive −67° → cam pitch 24° (looks down); 0 console errors. Default camera is now **Cockpit** (eye exactly on the aircraft). Removed the obsolete `camZoom` (the API computes zoom). Remaining ceiling: MapLibre pitch clamps at 85°, so looking ABOVE the horizon (nose past vertical) is still limited — a fully unlimited cockpit needs a dedicated 3-D renderer (future phase).

## R94s — Flight camera: ZERO orbiting (fixed pitch) + inverted up/down arrows (tag `#R94s`)

Re-report: *"すべての方向で回り込みはゼロにしろ。あと、上下矢印の動作は反転させろ。"* — make the orbiting zero in every direction, and invert the up/down arrows.

- **Zero orbiting.** ANY change of the MapLibre camera PITCH pivots the whole view around the ground `center` — that pivot IS the orbit — and a look-ahead centre that depends on attitude/altitude also slides it. So R94r's gentle pitch coupling still orbited a bit. Now the camera pitch is a FIXED constant (Follow **68°** / Cockpit **78°**, no coupling to the aircraft pitch at all) and the look-ahead is a small CONSTANT (0.22 / 0.05 km). The centre therefore only tracks the aircraft's own position; the bearing follows the heading and the roll matches the bank (the aircraft yawing/rolling, not an orbit); a gentle smoothed altitude→zoom stays (a zoom, not an orbit). Aircraft PITCH is read on the HUD (pitch ladder + ADI). Verified: camPitch is identical (68°) across aircraft pitch −30…+30° → zero pitch orbiting; the unused `camPitchS` smoothing was removed.
- **Inverted pitch arrows.** ↑ = nose DOWN, ↓ = nose UP (elevator input `cmd('arrowdown','arrowup')` → arrowUp=+1, which with −Cmde pitches down). Verified deterministically (self-contained stop→start→step so the async loop can't contaminate it): ↑ → −47.8°/s (nose down), ↓ → +47.8°/s (nose up), no-input holds level (0°/s). GOTCHA that bit the test: the sim keeps flying via rAF between eval calls and `start()` no-ops when already `on`, so a headless control test must `stop()`+`start()` and zero `st.elev/ail/rud` itself. 0 console errors.

## R94r — Flight camera: kill the "上下方向がありえない動き" (pitch orbiting the world) (tag `#R94r`)

Re-report: after R94q the view when pitching up/down was still clearly wrong — an "impossible movement."

- **Root cause:** MapLibre pivots its camera around the `center` GROUND point, so changing the camera PITCH swings it in an arc AROUND that point. R94q coupled camPitch strongly to the aircraft pitch (`base + pitchDeg·0.45/0.7`), kept a FAR look-ahead centre (up to 9 km) and let it slam the 85° hard clamp — so pulling/pushing ORBITED the whole world around a point kilometres ahead. That is the "ありえない動き."
- **Fix:** (a) small look-ahead — follow ≤ 1.8 km, cockpit ≤ 0.35 km — so the orbit radius is small; (b) camPitch only GENTLY follows the aircraft pitch (coeff 0.32), is LOW-PASS smoothed into a new `camPitchS` (4·dt) and clamped to a comfortable **48–80°** band kept well inside MapLibre's 85° limit, so it never saturates or lurches; (c) zoom is gentler (ref 80 m, ×0.45) and more smoothed (1.8·dt). Direction stays correct — nose-up tilts the view up. `camPitchS` resets on start + on the C mode-switch. Verified deterministically over an aggressive pull-up→level: camPitch stays **66–80°** (no saturation), max **1.0°/frame** change (smooth), correct direction. 0 console errors. (The deeper cure — a camera fixed to the true eye-point — still needs a free-camera API MapLibre lacks on this build, i.e. a dedicated 3-D renderer; noted as a future phase.)

## R94q — Flight sim: true fixed-timestep 6-DOF engine (quaternion) + the 5 diagnosed bugs fixed (tag `#R94q`)

Re-report: a precise 5-point diagnosis — (1) camera pitch inverted vs. the nose; (2) camera roll clamped at 78°; (3) attitude clamped at ±180° so no continuous roll; (4) the "cockpit" centre is a look-ahead ground point, not the aircraft; (5) terrain read before the DEM loads (0 m → phantom mountains/crashes) — plus a call to rebuild the flight part as an independent simulator engine (6-DOF, fixed-timestep, physics/render separation), perfecting the Cessna first.

- **★ Rebuilt the physics as a genuine 6-DOF rigid body in the BODY frame with a QUATERNION attitude** (`stepFixed(h)`). It integrates body velocity (u,v,w), body angular rates (p,q,r) and the attitude quaternion from the forces & moments built from AoA **and SIDESLIP** through each aircraft's non-dimensional stability & control derivatives (Clb/Clp/Cma/Cmq/Cnb/Cnr… + Clda/Cmde/Cndr), with Euler inertia cross-coupling and prop gyroscopics/P-factor/torque. This gives coordinated *and* skidding turns, adverse yaw, dihedral, rate damping — and, because the attitude is a quaternion (not Euler), **continuous rolls, loops and sustained inverted flight with no gimbal/±180° clamp** (fixes bug #3). Verified deterministically (`_dbg.step`): level trim holds to **1 m / 30 s**; roll rates Cessna 79° / warbird 102° / airliner 16° / fighter 163° / glider 39° per s; a clean 20° turn sideslips only −0.6°; a full aileron roll reaches TRUE inverted (body-up vector points down); stall sinks at −8.8 m/s.
- **Fixed-timestep + physics/render split** (the user's #1–2): `physics(dt)` accumulates real elapsed time and advances `stepFixed` in fixed **1/200 s** sub-steps (backlog dropped past 24 steps so a hitch never spirals), so the handling is framerate-independent (30 vs 120 fps) and the integrator never gets one huge dt. `stepFixed` is pure/deterministic → headless verification.
- **Camera bugs fixed.** (#1) nose-up now tilts the view UP — `camPitch = base + pitch·k` (was `− pitch`, so the horizon moved opposite the stick). (#2/#3) camera roll = the aircraft's TRUE bank with **no ±78° clamp**, so rolling/inverted shows the world rolling all the way over. (#4) Cockpit view centres far closer to the aircraft (aheadKm 0.04–0.55 vs 0.2–3.5) to cut the look-ahead "slide"; a true eye-point needs a free camera, which this MapLibre build lacks (`getFreeCameraOptions`/`FreeCameraOptions` are absent — verified at runtime).
- **Terrain readiness (#5).** `_terrRead` reports `ok:false` while `queryTerrainElevation` returns null (DEM not yet loaded) → the collision check is skipped and the last KNOWN elevation is used, instead of treating "not loaded" as 0 m (the cause of sudden ground / phantom mountain crashes).
- **Per-aircraft** now carry mass + 3-axis inertia (Ix/Iy/Iz) + geometry (S,b,c) + the derivative set; the Cessna uses published-order C172 values (reference quality, per "perfect one aircraft first"); the others are scaled to distinct, realistic handling.
- **HONEST scope.** This delivers the stated top priorities (6-DOF, fixed-timestep, physics/render split, all 5 bug fixes) but NOT the full vision: a dedicated WebGL/WebGPU cockpit renderer (with real eye-point, 3-D aircraft, clouds, lights), high-res DEM + runways/ILS/navaids, weather & wind fields fed into the relative wind, per-aircraft SYSTEMS (FBW/FADEC/engines/electrical/hydraulics…), ATC/AI traffic, spatial sound, failure modelling, and a per-type validation suite against book numbers are large SEPARATE phases — MapLibre remains the renderer for now (its camera is the hard ceiling on the cockpit view). No new external data source. 0 console errors; every behaviour above verified on the real site.

## R94p — Flight simulator rebuilt: rigid-body physics (inertia, drag, per-aircraft) + physical banking camera + rich UI (tag `#R94p`)

Re-report: *"フライトシミュレーターの運動、視点が物理的におかしいです。慣性や空気抵抗、機体による差等、すべてを考慮した完璧なモデルと、充実したボタンや操作、UIにして"* — the sim's motion & viewpoint are physically wrong; make a complete model that accounts for inertia, air resistance and per-aircraft differences, with rich controls & UI.

- **★ Rotational INERTIA (the "運動がおかしい" core).** The old R85 model set the pitch/roll RATES straight from the keys and auto-levelled the bank (`phi*=0.35^dt`) — no angular momentum, and the wings snapped level the instant you released. Rebuilt as a rigid body: the stick commands an angular ACCELERATION (moment ÷ inertia) with aerodynamic damping; the rate integrates to attitude. Now a bank HOLDS when you centre the ailerons and pitch carries momentum; control power scales with dynamic pressure q̄ (mushy slow, crisp fast). Verified deterministically (new `_dbg.step`): roll to ~19° then release → the bank stays ~19° while the roll rate decays (old: snapped to 0), and the held bank drives a coordinated turn.
- **Full aerodynamics / air resistance.** Lift CL(α) with a genuine stall break; drag = parasite CD0 + induced k·CL² + flap/gear/speed-brake terms; thrust lapses with ISA air density (props vs jets differ) + afterburner. A `computeTrim()` solves the spawn AoA & throttle for level flight (L=W, T=D) so the aircraft no longer climbs on its own, and the trimmed AoA is the pitch-stability target (speed stability). Verified: level trim holds (alt drift ~2 m/5 s), stall triggers below Vstall and it sinks, afterburner ~doubles fighter acceleration, the pitch phugoid damps out (no divergence).
- **Per-aircraft differences.** 5 machines with distinct mass, wing area, CL curve/stall, thrust(+AB), drag, inertia (roll/pitch authority & damping), stability, Vne/Vstall, G-limit, ceiling: Cessna 172, P-51 warbird, A320 airliner, F-16 fighter, engineless glider. Verified same-input roll rate: airliner 16°/s (heavy) vs fighter 107°/s (agile) vs Cessna/glider ~40°/s. Switch mid-flight (keys 1–5, on-screen chips, or Atlas).
- **Physically-correct camera.** The old view locked the horizon LEVEL (roll 0) — the "視点がおかしい". The camera now BANKS with the aircraft (verified cam roll = aircraft bank 34°), pitches with attitude, and cycles Follow ↔ Cockpit (C). A "Level horizon" toggle (V) restores the stabilized view for those who prefer it (bank clamped ±78° so it never fully inverts the world).
- **Rich UI.** Aircraft badge + live Mach; config chips (FLAPS/GEAR/CAM); an on-screen aircraft selector (5) + control deck (gear, flaps, airbrake, view, level, pause, reset), all also on keys (F/G/Space/C/V/P/R, 1–5). The whole existing HUD is kept (airspeed/alt/AGL/VSI/AoA/G, heading tape, ADI, pitch ladder, throttle/boost bars). Atlas picks the aircraft by name ("F-16でフライト").
- Split the physics out of the render loop (`physics(dt)`) so it is deterministically testable headlessly (`?rafshim=1` + `_dbg.step`). No new external data source. Public API unchanged (start/stop/active) + new `aircraft()`/`list()`. 0 console errors; every behaviour above verified on the real site.

## R94o — British Raj highlight = a thin sliver + finer border steps (closest snapshot) + Sakhalin verified (tag `#R94o`)

Re-report (two screenshots): (1) *"british rajのハイライトがおかしい"* — comparing the British Raj, the map highlight was a thin strip near the Iran border, not India; (2) *"サハリン全島が領土なのはおかしくない？…もっと国境線の変化の刻み幅増やしてほしい。1920になってようやく樺太が日本領の表示になる"* — is all-of-Sakhalin-as-Japanese correct (please check), and make the border steps finer; Karafuto only shows Japanese at 1920.

- **British Raj was a 28-pt sliver.** The 1900/1914 aourednik snapshots contain BOTH the real "British Raj" polygon (585/623 pts, the whole subcontinent) AND a tiny mislabeled "India" feature (28 pts, a strip at 60.8–63.3°E near the Iran border). `geomFor(re)` used `.find()` = the FIRST match, and the sliver came first for the Raj regex `/british raj|british india|^india$/`. Fixed: `geomFor` now returns the LARGEST-area match. Verified: the Raj compare polygon is 623 pts and contains Delhi/Kolkata/Karachi.
- **Finer border steps — closest snapshot, not closest-≤-year.** aourednik has fixed snapshots (1900,1914,1920,1930,1938,1945,1960,1994,2000,2010 — there is no 1905/1910 file), so `nearest` now picks the CLOSEST one (a mid-gap year like 1910 → 1914), which roughly halves how long a year is shown with the "wrong" borders. A FORWARD jump is taken only across a ≤20-year gap, so the huge 1960→1994 gap keeps 1960 — the 1980s never render a post-Soviet world (the faithful state DATES already live in IntMapHistStates). Verified `_nearest`: 1908–1913→1914, 1925→1920, 1985/1990/1993→1960 (USSR intact), 2009→2010. The "Synced to" readout's own `hbAt` now delegates to `IntMapTimeBorders._nearest`, so the chip "🗺 Borders 1914" matches what is actually drawn (at clock 1910 the chips read "Countries 1910 · real" + "Borders 1914").
- **Sakhalin — checked, and 1920 is right.** 1900 all-Russian; 1914 SOUTHERN Sakhalin (Karafuto) = Japan, NORTHERN = Russia (correct — the 1905 Treaty of Portsmouth gave Japan the island south of 50°N); 1920 ALL of Sakhalin = Japan (correct — Japan OCCUPIED northern Sakhalin 1920–1925 during the Russian Civil War, withdrawing under the 1925 Soviet-Japanese convention). So the all-Sakhalin fill at 1920 is historically accurate, not a bug. With the closest-snapshot change, 1908–1913 now use the 1914 borders, so Karafuto shows Japanese from ~1908 (verified at 1910: the Japan polygon has southern Sakhalin but NOT northern) instead of only 1920.
- No new external data source. 0 console errors; verified on the real site at 1910 / 1985 / Now.

## R94n — Historical highlight cut in straight lines + Compare region not historical + wiki → modern country (tag `#R94n`)

Re-report (three separate bugs on the historical map): (1) clicking an old country highlighted it *"直線でぶつ切られたよう"* (chopped off by straight lines) on several countries; (2) *"Compare時のハイライトの領域が史実に対応していない"* (the Compare fill uses modern, not era, borders); (3) *"german empireをおして…wikiリンクに行くと、普通のドイツのWikipediaに飛ばされる。ほかの国家も、今の国家に飛ばされる例が多発"* (German Empire's Wikipedia opens modern Germany; many countries route to the modern state).

- **★ Straight-line highlight — ROOT CAUSE.** The historical click handler outlined `e.features[0].geometry`, but a map click hands back the feature **clipped to the vector tile the tap landed in** (geojson-vt buffers+clips runtime GeoJSON), so a big country's outline was reassembled tile-fragments = straight cuts at tile edges. Fix: `IntMapTimeBorders.featureAt(name,lngLat)` looks the polygon up in the **original cached FeatureCollection** (NAME match, preferring the one that contains the click) and outlines that full geometry. Verified on the live site at 1910: the outline now carries the complete polygon — Germany 435 pts, Italy 317, Russian Empire 4740, France 305 (no clipping). (Confirmed the Russian Empire is antimeridian-*split* in the source data — 0 rings cross ±180 — so the full geometry renders clean, no line across the map.)
- **Compare region now historical.** `paintOnMap` painted the MODERN `countryGeo` polygon for every non-former-state code while travelling. New `IntMapTimeBorders.geomForCode(code)` returns the **era** polygon: a former state via its NAME regex (`hbRe`), else the era feature that contains the most **interior samples** of the country's modern shape (majority vote — a single interior point can land on a coastline or in territory that changed hands, e.g. modern Italy's South Tyrol was Austria-Hungary in 1900). `paintOnMap` uses it while `IntMapTimeBorders.active()`, else falls back to the modern polygon (LIVE unchanged). Verified 1910: DEU→435-pt German-Empire extent that **includes Poznań** (in modern-Germany=false), ITA→317-pt 1910 Italy (has Rome, not Paris), FRA/JPN/CHN all era shapes; 5 codes in 60 ms.
- **Wikipedia / name → the historical entity.** The click reused the raw aourednik NAME (which for renamed countries is the *modern* name — the 1900 snapshot literally labels the German Empire "Germany", the Kingdom of Italy "Italy"), so the popup title and the Wikipedia probe both hit the modern article. New `IntMapTimeBorders.resolveHist(name,lngLat)` resolves the era polygon to the app's historical entity (empire via `hbRe` → exact modern name → point-in-polygon over `countryGeo`) and returns the **era display name + Wikipedia title** (already on `countryStats` from `IntMapHistId`/`IntMapHistStates`). The popup takes `opts.wiki`; those titles are English, so if the current-language wiki lacks the article it falls back to English — never a wrong modern page. The country card intro now also uses `s.wiki` for `_histId` countries (Persia→*Qajar Iran*, not modern Iran). Verified end-to-end on the live site (1910): popup title **"German Empire"**, the Wikipedia button opens **en.wikipedia.org/wiki/German_Empire** (not /Germany); "Kingdom of Italy"→/Kingdom_of_Italy, "Russian Empire"→/Russian_Empire, "Qajar Iran"→/Qajar_Iran all resolve.
- No new external data source (aourednik historical-basemaps, Wikipedia REST, Turf were all already in use) → Terms/Privacy/Sources unchanged. 0 console errors across travel + all three paths. Map PIXELS remain unverifiable headlessly (WebGL never loads), but the whole data flow (full geometry in, era name/wiki/polygon out) was driven against the real app + real aourednik data and confirmed.

## R94m — Historical click = the SAME reaction as a modern country + borders update on a 2nd year change + kill the flicker (tag `#R94m`)

Re-report: my click added a *bespoke* card (user: *"この反応と同じようにって言ってるだろうが。勝手に新たな動作増やすな"* — do the SAME as the normal country-label reaction), the borders **don't change on a second year change** (need to go to Now first), and travelling to an old year **flickers badly**.

- **Exact same reaction:** exposed the existing place popup as `window._imPlacePopup` (the Copy/Wikipedia/AI brief/Isolate popup + blue `IntMapOutline`), added an `opts.geojson` so the caller can outline the era polygon (an empire, not just one modern country). The historical label/fill/border click now calls **that** — no custom card, no bespoke yellow highlight (removed `imtb-hl`). Verified `_imPlacePopup` is wired.
- **Borders didn't update on a 2nd travel:** `apply()` early-returned when `ensure()` transiently reported the style not-loaded, which blocked the `setData` — so a second year change kept the first year's borders until you went to Now. Now it sets the data on the **existing source directly** (the source persists once created), only falling back to `ensure()`/idle on the very first travel. Verified 1914 → 1938 updates (`current()` 1914 then 1938, no Now between).
- **Flicker:** removed the 200/700 ms re-assert timeouts and the per-call `map.moveLayer` (the era layers are already above the raster via `before ofm-country`), so a travel now touches the map once instead of repainting several times.
- (CRLF note: a `sed` edit flipped the file to LF; converted back to CRLF. `git diff -w` confirms only 11/6 real content lines changed.) 0 console errors. ⚠ still can't see the map here (both browser surfaces unavailable) — please confirm the click-reaction, the 2nd-travel border change, and the flicker on the live site.

## R94l — Make the era borders/labels ACTUALLY render (direct base swap + raise) + clickable/highlightable + data-coverage note (tag `#R94l`)

Re-report (1930 screenshot): the map still showed **modern labels ("Israel", "Ukraine", "Belarus" separate) and no era borders**, the historical labels weren't clickable/highlightable, and deep-past has too many "—".

- **Root of "still no borders":** the previous fix routed the base-swap through `applyTheme`, whose early-return + timing meant the label-free base was often never applied, so the CARTO `*_all` raster's **baked-in modern borders/labels stayed on top of everything**, and the era layers (gated by the modern-border toggle) could be hidden too. Rewrote `window._applyBorders` to do it **directly and unconditionally while travelling**: hide `layer-dark`/`layer-light`, show the matching `*_nl` (label-free) base, hide `ofm-country`, show `imtb-fill/hl/line/lbl`, and **`map.moveLayer` the era line+labels to the top** so they can't be buried. Era borders now show whenever travelling (no longer gated by the Country-borders toggle, which had left the map border-less). The border module's `apply()` calls `_applyBorders()` directly (+ re-asserts at 200/700 ms); only "Now" goes through `applyTheme()` to bring the labelled base back.
- **Clickable + highlight:** added `imtb-fill` (whole-country click target) and `imtb-hl` (a yellow highlight fill). Clicking a historical country now **highlights it** (setFilter on `imtb-hl`) AND opens the same card as a modern country. Cursor→pointer on hover.
- **Data coverage:** the "more —, the older" is the Maddison Project's real coverage limit (1930 = 57/168 codes have GDP, 65 have population; pre-1950 is inherently sparse). Population is used where present; no fabrication. Documented as a known limit.
- Verified 1930 still shows the right identities (US · Republic of China · Germany · Soviet Union · UK · British Raj), `_applyBorders` runs clean, 0 console errors. ⚠ Map PIXELS remain unverifiable in this environment (in-app WebGL never loads; the real-Chrome extension is "not connected") — the border rendering is now direct/robust by construction; please confirm on the live site.

## R94k — Era-accurate empires & identities (Qing/ROC, German Empire, British Raj, Austria-Hungary…) + Time-machine UI + faster borders + back-to-stats colour (tag `#R94k`)

Re-report: at 1913 the Countries tab showed **People's Republic of China, modern India, modern flags**, and **no Austria-Hungary** — *"全部史実に対応させろ… (言われた例だけ対処して終わりにするな)"*.

- **Empires as former states** (`IntMapHistStates`): added Austria-Hungary (→1918; AUT/HUN/CZE/SVK/SVN/HRV/BIH), Ottoman Empire (→1922; TUR/SYR/LBN/IRQ/JOR/ISR/PSE), Russian Empire (→1917; the 15 SSRs + FIN + POL), British Raj (→1947; IND/PAK/BGD), Empire of Japan (1910–1945; JPN/KOR/PRK/TWN) — each with an inline flag, faithful dates and Maddison-aggregated figures, and `hbRe` map-colour matching.
- **Single-country identities** (`IntMapHistId`): a country whose territory is ~unchanged but whose **name+flag** differed by era — China (Qing → Republic of China → PRC), German Empire, Kingdom of Italy, Persia, Siam, Dutch East Indies. The engine calls `IntMapHistId.apply(when)` after the former-states pass (skips `_histHidden` successors) and `.clear()` on restore; the country keeps its own Maddison data but shows the era name/flag (and `wiki` for the card intro). Verified **1913**: US · **Republic of China** · **German Empire** · UK · **British Raj** · France · **Kingdom of Italy** · **Empire of Japan** · **Russian Empire** · **Austria-Hungary** · **Ottoman** — no PRC, no modern India/Austria/Indonesia; all with era flags. Data-driven → more eras = more table rows.
- **Time-machine UI** (`#R94k`): removed the tacky all-caps ("TIME MACHINE" → "Time machine", `text-transform:none`), bigger prominent date label, custom slim slider with a soft primary fill + round thumb, centred year field, tidier spacing.
- **Faster border swap:** the aourednik snapshots are prefetched into IndexedDB (IntMapCache) on idle, and the travel debounce cut 320→120 ms, so entering a year changes the borders near-instantly.
- **"Back to statistics" colour** now really clears: the styledata re-paint fired because `codes[]` was still populated after leaving; it's guarded on `#scp-view` being open.
- (Still open from this list: making the historical **map labels clickable** like modern countries — next.) 0 console errors.

## R94i — Former-state flag too big/floating + the ROOT CAUSE of "1900–1950 borders don't change" (baked-in raster borders) + readout + basis (tag `#R94i`/`#R94j`)

Re-reports: *"ソ連の国旗が明らかに大きすぎる…縦横比や四隅の形状も旧国家は浮いている"* and *"20世紀前半の国データや国境線は設定年月日と同期されていない"* (I first mis-read "20s前半" as the 2020s — it means the **first half of the 20th century**).

- **Flag too big / floating.** `.hist-flag` was a fixed 26×18 with a `box-shadow` outline while emoji flags render at the container font-size with no border. Now sized in **em** (`width:0.82em;height:0.547em`, 3:2 like the SVGs) so it tracks the emoji in every context (18×12 in the 22px list, ~10×7 in the 12px compare), and the box-shadow is gone. Verified 18×12 in the stat list, `box-shadow:none`.
- **★ ROOT CAUSE — the map's borders didn't change for the early 20th century.** The base map is CARTO **raster**; with place-names on it uses `dark_all`/`light_all`, which have the **modern borders & country names BAKED INTO the raster tiles**. Hiding `borders-only-line`/`ofm-country` can't remove those, so the era borders (`imtb-line`) just drew ON TOP of the baked-in modern ones → looked un-synced. Fix (`#R94j`): while travelling, `applyTheme` forces `showCartoLabels=false` → the label-free base (`dark_nolabels`/`light_nolabels`), and `IntMapTimeBorders` calls `applyTheme()` on travel start/stop so the base swaps. The era borders + names come from `imtb-line`/`imtb-lbl`. (Programmatic data/border sync was already correct — 1910/1925/1938 give distinct GDP and border snapshots, and aourednik 1914/1938 are rich: Ottoman Empire, British Raj, colonies — the baked base was hiding the change.)
- **"Synced to" readout was conditional.** The Countries chip only showed if the tab/a data-layer was on, the Borders chip only if the old histb overlay was on — so at 1940 the readout didn't confirm the (real) sync. Now both are unconditional: "Countries 1940 · real · Borders 1938" (and "Borders current" past 2010).
- **Basis correctness.** Maddison covers 1900–2018; for 2019+ there is no Maddison year, so the engine keeps World Bank **nominal** and marks `_imTimeReal=false` (banner/label say World Bank, not "real 2011 int$"). The Compare's Maddison path is gated to ≤2018 and **falls back to World Bank** for 2019+ (it used to return an empty map → blank bars). Recent years (after aourednik's last 2010 snapshot) keep the **modern** borders (accurate, incl. South Sudan). Verified 2022 Compare → USA $26.05T / Japan $4.45T (World Bank). 0 console errors. (Map PIXELS still unverifiable here — both the in-app WebGL preview and the real-Chrome extension were unavailable — but the baked-raster root cause is addressed directly.)

## R94h — 3 fixes: former-state GDP-per-capita missing in Compare + map-colour former states + clear colour on "Back to statistics" (tag `#R94h`)

Re-report: *"ソ連のGDP per capitaの棒グラフがない。また、比較中の国は着色される機能が旧国家では無い。また、着色は、back to statistics押せば消えるように。"*

- **USSR GDP-per-capita bar missing.** The Compare's Maddison path (`_madField`) only mapped `gdp`/`pop`, so `gdppc` fell through to World Bank — which has no FSU-republic figures before 1990, so the USSR's per-capita was blank (and normal countries showed WB *nominal* per-capita while their GDP bar was Maddison *real* — inconsistent). Fixed: `_madField` now also returns `gdppc`; a shared `_madOne(M,mf,cd,year)` returns `gdpBil*1e9` / `popN` / `gdppc` (unscaled real int$); `_histAddLatest`/`_histAddSeries`/`blockData` use it, and for a summed former state per-capita = **ΣGDP / Σpop**. Verified 1960: **USSR $6.3k, USA $18.1k** (both Maddison real; src Maddison) — the per-capita now matches the GDP basis.
- **Compared countries weren't colour-painted on the map for former states.** `paintOnMap` matched the chart colours to `countryGeo` (MODERN polygons), so the USSR (no modern polygon) never painted. Fixed: former-state codes now paint their **era polygon** from the clock's historical borders — `IntMapHistStates.hbRe(code)` (a name regex, e.g. `/soviet|u\.?s\.?s\.?r/i`) → `IntMapTimeBorders.geomFor(re)` → the geometry, pushed into `imcmp-src` in the same PAL colour. Verified `geomFor(SUN)` returns a MultiPolygon at 1960.
- **Colour didn't clear on "Back to statistics".** The `.scp-back` handler now calls `clearMap()` before tearing down the view. 0 console errors.

## R94g — 3 fixes: USSR flag rendered as raw text in Compare + Country-borders fast-blink + border INTEGRATION (tag `#R94g`)

Re-report: *"ソ連の国旗がバグっている。また、Country borders labelをオンオフしたら、高速点滅というバグ。それに、わたしがしてほしいのは国境線の上塗りじゃなくてCountry bordersとの統合"*.

- **Flag rendered as raw `<img …>` text in Compare.** A former state's `flag` is an `<img class="hist-flag">` string; the Compare `esc()`'d the whole `flag+name`, so an emoji survived (it's a char) but the `<img>` became visible tag text. Fixed at all 4 Compare sites (bar rows, chips, country picker, pivot-table `cLbl`) to insert the flag **raw** and `esc()` only the NAME; the bar's `title=` gets the plain name. Verified: the USSR bar now has a real `<img class="hist-flag">` (`hasImg:true`), no raw text. (renderStats already did this right.)
- **Fast-blink when toggling "Country borders".** `IntMapTimeBorders`'s `styledata` handler re-asserted on EVERY styledata by calling `setLayoutProperty`, which itself fires `styledata` → an infinite ~140 ms loop; and the toggle's `mkBorders` (direct set + `applyTheme`) fought it. Fixed: the handler now re-asserts **only when a base-style swap WIPED our layers** (detected by a missing `imtb-line`), so it never responds to its own visibility writes.
- **Integration, not an overlay.** New single source of truth `window._applyBorders()`: the SAME `bordersOn` toggle governs BOTH the modern boundary line (shown only when **live**) AND the clock's historical borders `imtb-line` (shown only when **travelling**) — plus hides the modern country labels while travelling (captured `_imbOfmWas`, restored at Now). Every border-visibility site (`applyTheme`, the `cb-borders` toggle, the OFM-load re-assert, the sourcedata listener, and `IntMapTimeBorders` apply/clear/go) now calls this one function, so the two layers can't fight and the toggle really controls the era borders. `IntMapTimeBorders` exposes `active()`. Verified: `_applyBorders` idempotent (5× no throw), `active()` true while travelling / false + `current()`=null at Now, 0 console errors. (Layer PIXELS still can't be verified headlessly — WebGL never loads; check the live site.)

## R94f — The MAP's own borders follow the clock (not the overlay layer) (tag `#R94f`)

Re-report (same message): *"国境線も変えろ（historical bordersではなく、地図の国境線を）"* — change the map's actual border lines with the clock, not the optional overlay.

- `window.IntMapTimeBorders`: on travel to a past year it loads the era's polygons from aourednik/historical-basemaps (the nearest snapshot ≤ the year; the repo jumps 1960→1994, so **1960 covers the late-Cold-War world incl. the USSR**), draws them as a crisp `imtb-line` (matched to the modern `borders-only-line` style) plus `imtb-lbl` uppercase country names, and **hides the modern boundary line (`borders-only-line`) and country labels (`ofm-country`)**. At "Now" it restores them (captured `ofmWas` visibility). Re-asserts on `styledata` (a globe/flat/satellite swap wipes runtime layers). Shares the `hb_<year>` IntMapCache with the Historical-borders layer, so no duplicate fetching. Fixed a race: the kernel handler now `clearTimeout`s the pending apply before branching, so "Now" right after a fast travel really clears.
- Because the aourednik data is a full world map, this shows **every state of the era as borders + labels — the Ottoman Empire (1914), Austria-Hungary, the German/Russian empires, colonies and mandates** — which is how the "cover all 1900+ states / colonies & mandates" request is met at the map level (the Countries-tab data registry stays the major former states, since Maddison only covers ~53–69 entities before 1950).
- Verified: module loads (0 console errors); nearest-year logic (1970→1960, 2005→2000, 1985→1960); the aourednik **1960 snapshot really contains Soviet Union + Yugoslavia + Czechoslovakia** (197 features); kernel-driven `current()` = 1960 at 1970, `null` at Now. NOT verified visually — the headless preview's WebGL map never fires `load` (screenshots time out), a known limitation; the layer swap uses the same `setLayoutProperty` pattern as the working layers.

## R94e — Maddison historical GDP/population back to 1900 (USSR appears in GDP; pre-1970 data for all) (tag `#R94e`)

Re-report: *"ソ連がGDにないじゃねーか。それに、1970年以前の各国のデータも集めろ。旧国家は1900年以降は少なくともすべて網羅しろ。植民地や委任統治領なども考慮しろ。国境線も変えろ（historical bordersではなく、地図の国境線を）"* — at 1970 the USSR had **no** GDP (its estimate was gated to 1985+ and WB has no pre-1990 republic GDP), and the World Bank floor of 1960 meant no deep-past data.

- **Root cause:** the World Bank has no annual GDP before 1960 and **nothing at all** for dissolved states, so nominal-USD WB data can't show the USSR at 1970. Fix = bundle the **Maddison Project Database 2020** (`data/maddison.json`, 288 KB, real GDP in constant 2011 international dollars, 1900–2018; "Former USSR/Yugoslavia/Czechoslovakia" are first-class Maddison entities). `window.IntMapMaddison` lazy-loads it: `gdpBil/popN/gdppc(code,year)`.
- **Countries engine** now uses Maddison for **GDP + GDP-per-capita + population for every country** while travelling (2011 int$, one consistent basis for a historical ranking); life-exp/fertility/internet/military stay World Bank. The floor drops from 1960 to **1900**. WB nominal is discarded for GDP during travel so the whole ranking is comparable. Verified: **1970 → USA $4.91T, Soviet Union $2.15T (#2!), Japan $1.62T, China $1.14T**; **1920 → USA $1.09T, British India $0.31T, Czechoslovakia shown**.
- **Former states** (`IntMapHistStates.agg`) now take GDP/pop from Maddison — the direct aggregate entity for SUN/YUG/CSK, else the sum of successors' Maddison values (the `gdpEst` hack is gone). `_histHave` counts the Maddison aggregate so a state with no WB successor data still shows.
- **Compare** made consistent: GDP & population indicators use Maddison while travelling (`_madField`/`_madMap`, `_histAddLatest`/`_histAddSeries` Maddison-aware). Also fixed a real race — the compare's `_ttYear()` read `window._imTimeYear`, which the Countries engine only writes after its ~1 s fetch, so the compare re-rendered too early and stayed on present values; it now reads `IntMapTime.year()`/`isLive()` (set synchronously) and awaits `IntMapMaddison.load()`. Verified: comparing USA/USSR/Japan at 1970 → $4.91T / $2.15T / $1.62T (src Maddison).
- Banner + card note + the card's GDP label now say "real GDP (2011 int$, Maddison)". Build script (offline): OWID Maddison CSV → `data/maddison.json` keyed by ISO3 + SUN/YUG/CSK. 0 console errors. (Still open, same request: the **map's own borders** changing with the clock, and a fuller 1900+ empire/colony roster — next.)

## R94d — Former states are comparable + roster expanded (tag `#R94d`)

Re-report: *"GDPランキングに旧国家が出ない。また、Comparisonが使えない。また、私が例に出した旧国家だけで終わるな。"* — former states didn't show in the Comparison's GDP ranking, couldn't be used there, and the roster was just the three examples.

- **Comparable.** The synthetic former-state codes have no World Bank series of their own, so they were excluded from the picker and single-click routed to the card. Now `IntMapStatsCompare` aggregates the **successor ISO3 codes' data — which are in the very same `country/all` fetch** — into the former state: totals summed (`_HSUM`={gdp,pop}), every other WB indicator **population-weighted** (pop-weighted per-capita = the exact aggregate per-capita), the USSR's GDP via its sourced estimate. `_histAddLatest` adds the value to the bar/table map; `_histAddSeries` builds the time-series from the successors' series over the state's lifespan; `_cs(cd)` resolves the name/flag via `IntMapHistStates` even out of era. `cList` no longer excludes them (they're in `countryStats` only while the clock is in their span, so they appear exactly when comparable); the `_toggleCompare` card-only guard is removed. Verified at 1990: **USA $5.96T vs Soviet Union $2.66T** (GDP) and **249.62M vs 287.82M** (pop) in the bars; the USSR line appears in the time-series ($2.66T at 1991); India 545.86M vs Pakistan (incl. East Pakistan) 129.23M at 1970.
- **Provenance check (important).** WB does **complementary historical splits** — it tracks each successor separately back to 1960 (Bangladesh 69 M + Pakistan 60 M = 129 M in 1970; Eritrea from 1960; South Sudan from 1990), so **summing successors does NOT double-count** even for pre-secession configurations. That unblocked the expansion.
- **Roster 4 → 9:** added United Arab Republic (Egypt+Syria, 1958–1961), and the pre-secession configs Pakistan incl. East Pakistan (→PAK+BGD, to 1971-12-16), Sudan incl. South Sudan (→SDN+SSD, to 2011-07-09), Ethiopia incl. Eritrea (→ETH+ERI, to 1993-05-24), Indonesia incl. East Timor (→IDN+TLS, 1976→2002), each with an inline-SVG flag and faithful dates. Verified: 1970 → united **Pakistan is #5 by population (129 M)** with Bangladesh hidden; 1960 shows the UAR; 2005 shows Serbia & Montenegro. The card's Wikipedia intro now uses each state's `wiki` title. Data-driven — more states = more rows. 0 console errors.

## R94c — Former-states fixes: USSR missing from GDP + unnatural flag (tag `#R94c`)

Re-report: *"GDPにソ連がない。そしてソ連の国旗が不自然。"*

- **USSR missing from GDP.** The successor-sum of World Bank **nominal-USD** GDP for 1990 is only **$687 B** (Russia alone $517 B, 12/15 republics) — a well-known artifact of the Soviet **official exchange rate**, which buries a genuine #2–3 world economy far down the ranking. Fix: the registry entry can carry a sourced **real-output estimate** (`gdpEst`/`gdpEstFrom`/`estSrc`); the USSR uses **$2.66 T** (CIA World Factbook 1990 GNP; consistent with the Maddison Project) for 1985+ (earlier, WB has no republic data so GDP stays honestly blank). `agg()` now takes the year and uses the estimate in-window, else the WB sum. The card labels it "GDP · est." and the note spells out *why* it isn't the WB nominal figure. Result: **USSR ranks #3 by GDP at $2.66 T** in 1990 (US $5.96 T, Japan $3.25 T, USSR $2.66 T, Germany $1.78 T…) — historically faithful. Population etc. stay the real WB aggregate (now 15/15 republics).
- **Unnatural flag.** The first pass drew the emblem with the `☭` glyph (font-dependent, mis-placed at the bottom). Replaced with the **authentic public-domain Soviet-flag vector** (the real gold star + hammer-and-sickle paths, scaled from the 1200×600 master into our 30×20 box via `transform="scale(0.025)"`, emblem in the upper hoist). Verified: the data-URI `<img>` loads (225×150) and contains the real star/hammer paths. The other former-state flags (Yugoslavia tricolour+star, Serbia & Montenegro tricolour, Czechoslovakia triangle) were already correct geometric SVGs. 0 console errors.

## R94b — Time machine follow-ups: sync the Compare view + faithful FORMER STATES (USSR, Yugoslavia, Czechoslovakia…) (tag `#R94b`)

Two re-reports from a 1989 screenshot: *"比較ではまだ同期されていない"* (Compare still showed 2024) and *"旧国家も、史実に忠実な時期や国旗で、おなじように見れるように"* (former states — USSR/Yugoslavia/Czechoslovakia — should be viewable faithfully, with correct split dates and flags; e.g. Slovenia forming out of Yugoslavia on the real date; period borders too).

- **Compare sync** (`IntMapStatsCompare`): the bar/table/focus latest-value path now reads the **master-clock year** when travelling — `_ttYear()` (≥1960) drives `_wbYearOne` (WB `date=<year>`) and `imfAt` (IMF WEO at the year); **honest** — no present-day reference gap-fill while travelling (missing → "—"). The block cache-guard `sig` now includes the year (the real bug: same codes/source/mode meant `renderInd` early-returned and never re-fetched, so only the banner moved). The table's year dropdown reflects the clock; a `#scp-timebanner` shows "📅 YYYY"; an `IntMapTime.on` re-renders the open comparison (debounced). Verified: USA GDP **$10.25T (2000)** / Japan **$5.04T (2000)**; back to Now → present again, banner hidden.
- **Former states** — `window.IntMapHistStates`: a curated, data-driven registry of C20th dissolutions with **faithful lifespans** — Soviet Union (1922-12-30 → 1991-12-26), Yugoslavia SFRY (1945 → 1992-04-27), Serbia & Montenegro / FRY (1992-04-27 → 2006-06-05), Czechoslovakia (1918 → 1992-12-31) — each with successor ISO3 list, multi-lang names and an **inline-SVG historical flag** (red ☭ field; blue-white-red + red star; Czech triangle — no external assets). When the clock is inside a state's span, `IntMapTimeCountries` (after overlaying the year) calls `IntMapHistStates.apply(when)`: it **aggregates the successors' already-overlaid World Bank figures** (pop & GDP summed, life-exp/fertility/internet population-weighted, per-capita recomputed) into a synthetic `countryStats[SUN/YUG/SCG/CSK]` entry and flags the successors `_histHidden`; `renderStats` shows the former state and hides its successors; the country card shows an amber "🏛 Former state · YYYY–YYYY · aggregate of successor WB data (n/N)" note; `restore()` deletes the synthetic entries and clears the flags on "Now". Real & honest — **no invented numbers**: e.g. the **USSR's 1990 population came out as 287,819,825** (~288 M, the true figure), ranking #3 by population between India and the USA. Synthetic codes are kept out of the Compare picker (`cList`) and route single-click to the card (WB has no series for `SUN`). Period **borders** come from the Historical-borders layer the clock already drives (aourednik has 1960 then 1994 — so 1960 borders cover 1960-1993 incl. the USSR, successors from 1994; the card note points users to that layer). Dates use the kernel's full `Date`, so year-travel (mid-June) resolves each transition faithfully (1991 = Yugoslavia; 2000 = Serbia & Montenegro; 2007+ = all separate). Verified end-to-end (1990 → USSR/Yugoslavia/Czechoslovakia shown with flags, Russia hidden; card + note; 2000 → Serbia & Montenegro; Now → modern set restored) with 0 console errors. The registry is data-driven — adding more former states is one table row.

## R94 — Time machine = the spacetime kernel: the hollow time-slider becomes an OS that moves all of IntMap through time (tag `#R94`)

Request: *"現在は形骸化しているタイムスライダーを、countries等とも同期させ、IntMap全体の時空を操作するOSにして。完璧に。"* The old time-slider only drove news + five dated rasters — everything else with a time dimension (the country statistics, historical borders, NATO/EU accession, the Köppen climate era, Earth Replay's terminator) lived in its own silo with a separate control. So the slider was *形骸化* (a husk). This makes it the **one master clock the whole app runs on** — a real time kernel, not a facade.

- **The kernel — `window.IntMapTime`** (defined right after `newsDate`): single source of truth `_when` (a `Date`, or `null` = LIVE/now). API: `set/setYear/setDaysAgo/setNow/on/get/when/iso/year/isLive/min(=1900)`. Every input (the slider = recent day-precision, a new **year field for deep time back to 1900**, the date picker, Earth Replay, Atlas) **writes** the kernel; every time-aware subsystem **subscribes** via `IntMapTime.on(e)` and reconstructs itself for `e`. `newsDate` is kept in lock-step *inside* `broadcast()` **before** subscribers run, so every existing news/raster reader is untouched. Re-entrancy guard (`_bcast`) so a subscriber can't loop the bus.
- **Design rule — LIVE = independent, TRAVELLING = synced.** When the clock is live each subsystem keeps its own default; the moment you move to a past instant they all sync; returning to "Now" releases them. This is additive — the per-layer year sliders (NATO/EU/borders) and Earth Replay all still work standalone; they're just kept in step with the master clock.
- **Subscribers:**
  1. **News + dated rasters** — `applyGlobalDate` (news + sst/snow/aod/thermal/precip via `setGlobalLayerDate`) now runs on every kernel change; a second subscriber covers the extra dated rasters Earth Replay used to reload (temp/no2/co/fire/truecolor/viirs) so **each dated layer is refreshed by exactly one subscriber**. News refetch is gated on the ISO **day** changing (Earth Replay's UTC-hour scrub must not thrash the feed).
  2. **Countries (the headline, real data) — `window.IntMapTimeCountries`.** On travel to a past year it fetches the **real World Bank figures for that year** (GDP `NY.GDP.MKTP.CD`, GDP/capita, population `SP.POP.TOTL`, life-expectancy, TFR, internet use, military spend `MS.MIL.XPND.CD`) and **overlays them onto `countryStats`**, so the Countries tab, the choropleths (`window._imReapplyChoros`), the hover read-outs, the open country card and Atlas all show the world as it was. "Now" restores a one-time `base` snapshot. **Fetched SEQUENTIALLY, not in parallel** — the WB throttles a single IP on request bursts (my own R69 note), and 7 concurrent calls got silently dropped (`AbortError`); one-at-a-time (~100 ms each) is reliable. A run that returns ~nothing is **not cached** so the next travel retries. **Honest by construction:** WB annual series begin in **1960** (deeper past keeps the latest figures + a clear amber banner `_imTimePreWB`); HDI (UNDP) and the Democracy Index (EIU) have no WB annual series so they are **never relabelled** with the wrong year (`renderCountryDetailBody` tags only the WB-synced rows with `_imTimeYear`).
  3. **NATO / EU accession** (GROUP-3 IIFE): `_natoYear`/`_euYear` follow `e.year`; only members joined by then are drawn; legend slider kept in step (`_syncYearLegend`). Live → all current members.
  4. **Historical borders** (beta-layers IIFE): `hbYear` → nearest snapshot ≤ `e.year`; reload only while the layer is on. Live → newest (2010).
  5. **Köppen era**: pick the period raster containing the year (1901-1930 … 1991-2020); reload the texture only if the climate layer is on, else just remember `_koppenPeriod`.
  6. **Earth Replay** is now a **shell on the kernel** — its date/year/UTC/now/play controls write `IntMapTime` (`allowFuture` — the terminator is valid for any date); its subscriber redraws the day/night terminator + read-out for the shared instant. `apply()` no longer dispatches its own timeTravel/raster reload (the kernel does it), killing the old double-drive.
- **OS + Atlas:** registered `time.now/time.year/time.set` on `IntMapOS`; Atlas `timeTravel` (aliases `setTime`/`timeSet`) now takes `year` (deep 1900→now) / `date` / `daysAgo` / `now:true` and drives the whole spacetime, with a "the whole map moves with it" note. System-prompt + `_wctx.period` updated.
- **UI:** the `news-timeline` widget is relabelled **Time machine** (`⏳`), gains the year field and a live **"what's synced" read-out** (📰 News · 📊 Countries YYYY · 🌦 Köppen era · 🗺 Borders · 🛡 NATO · ⭐ EU · 🛰 Satellite). `tlMachine` added in all 5 languages.
- **No new external endpoint** — World Bank was already a disclosed source (compare / time-series); the time-machine just queries it per-year, so Sources + Privacy (EN+JP) now note that a **year** is also sent and that the whole Countries surface reflects the chosen year.
- **Verified (served over http, page context):** app boots (242 layer rows, 0 console errors); `IntMapTime` live/year=2026/min=1900. Travelled to **2000** → real WB values overlaid (USA GDP **\$10.25T**, China **\$1.22T**, Japan pop **126.84 M**, India life-exp **63** — all correct), Countries tab shows first row *United States · GDP \$10.25T* under a **"📅 2000 · World Bank figures for that year"** banner. **Now** restores present (USA GDP \$30.77T, banner gone). Köppen era 1950→**1931-1960**, now→1991-2020. Pre-WB **1950** → amber "series begin in 1960" banner, no false relabel. Atlas `dispatch({type:'timeTravel',year:1975})` set the clock; read-out showed *"Synced to 1975 · NATO 1975"*; `{now:true}` returned to live. (Map-layer *painting* of NATO/borders can't be observed in the hidden preview — `window.__imap` is only set on map-load, which never completes headless — but the kernel→subsystem wiring is proven via the Countries/Köppen/read-out paths and single-registration confirmed: all subscriptions live in run-once IIFEs.)

## R93d — REAL ROOT CAUSE of London→Riga "no transit route": capital geocoded to the country centroid (tag `#R93d`)

Same re-report after R93c ("ふざけんじゃねえよ") — still "no route", and the header said **"London → Latvia · Riga"** (mine said "リガ"). That "Country · Capital" name was the tell.

- **Root cause:** `localFuzzyPlaces` (index.html ~6314-6320) matches a query to a country's **capital** and returns the name as `"Latvia · Riga"` — but pushes the **country's centroid** (`s.latlng`), NOT the city's coords. Measured: geocoding **"Riga" → (57.07, 25.46) = 83 km from the real city**, out in rural Latvia where MOTIS/OSRM find no stop → a false "no public-transit route". Affects every capital-name search (Paris→France centroid, etc.). `geocode()` short-circuited on this fuzzy hit before ever trying Nominatim.
- **Fix (`geocode`):** do NOT short-circuit on a `kind:'capital'` fuzzy match — fall through to **precise Nominatim** for it, keeping the coarse centroid only as a fallback if Nominatim is unreachable. Non-capital fuzzy matches (countries, gazetteer POIs with real coords) still short-circuit as before.
- **Verified (`?rafshim=1`, warm gazetteer):** "Riga"→9 km from the city (was 83), "リガ"→0 km, "Paris"→Paris (not France centroid). The full flow **London→Riga now returns 5 transit options** (Eurostar→Thalys→ICE→…, ~28 h) instead of "no route". No console errors. (Combined with R93c's robust MOTIS fetch, both failure modes are closed.)

## R93c — FIX "no transit route" on long international journeys (tag `#R93c`)

Re-report with screenshot: "ロンドンからリガまで鉄道" → "この区間の公共交通経路が見つかりません" ("ふざけんな、Google Mapならある"). It DOES exist.

- **Diagnosis:** Transitous/MOTIS actually HAS the route (verified: London→Riga returns 5 itineraries — Piccadilly → Eurostar EST 9106 → ICE 147 → … → FlixBus → Riga, ~33 h, 1,677 km). But MOTIS is slow/heavy for such long international queries and intermittently 504s / hangs on the first hit. The old `transit()` fetch was a single shot with **no timeout and no retry** — one bad response and it fell straight to `railRoute`, which rejects anything >430 km (Overpass bbox would be all of Europe) → a wrong "no public-transit route".
- **Fix:** robust plan fetch — per-fetch `AbortController` timeout (32 s), **retry the direct endpoint** (long routes usually succeed once the router warms), then the corsproxy + allorigins ladder, and only ACCEPT a response that actually carries itineraries (a bare 200 with none is a retry, not a dead end).
- **Verified:** London→Riga now returns `{ok:true, transit:true, 5 alternatives}` in ~13 s (was a false "no route"). No console errors. (Renders via the R93b-fixed per-mode colour path.)

## R93b — ROOT CAUSE of the all-white transit route line (tag `#R93b`)

Re-report with screenshot: an Amsterdam→London transit route drew as ONE solid **white** line — "どこからどこまでどの路線なのか、どこで徒歩なのかわからない". The R85/R86/R86d per-mode-colour work never actually showed on the map.

- **Real root cause (predates R86d):** the `imroute-walk`/`-rail`/`-transfer`/`-pt` layers used a filter that **mixes a LEGACY `$type` clause with an EXPRESSION `['get',…]` clause** in one `['all',…]` — e.g. `['all',['==','$type','LineString'],['==',['get','walk'],1]]`. MapLibre **silently rejects the mixed filter and never creates the layer** (no throw — `addLayer` returns, `getLayer` is false). So only `imroute-cas` (a pure-legacy `['==','$type',…]` filter = white casing) ever rendered; the colour layers didn't exist. My R86d verification only checked FEATURE generation (a headless harness), never layer creation — the hidden tab can't paint.
- **Fix:** convert those filters to all-EXPRESSION (`['==',['geometry-type'],'LineString']` etc.) so they're consistent with the `['get',…]` clause. Fixed all 6 imroute layers + the identically-broken `imdis-line` (disaster edge). The pure-legacy filters elsewhere (grid, tool-poly — legacy `$type`+`kind`) were left untouched (they work).
- **Verified for real this time** (`?rafshim=1` makes the preview map load, so `queryRenderedFeatures` works): after the fix all 6 imroute layers exist and the selected Amsterdam→London route **renders per-mode** — walk `#7a7f87` grey, rail `#1558d6` blue, subway `#ff6d00` orange — with the 4 alternatives dimmed in their palette colours (8 selected legs + 32 dimmed legs actually painted). **LESSON: for any map-layer change, load the preview with `?rafshim=1` and confirm with `queryRenderedFeatures`, not just a data-level harness.**

## R93 — Earth Replay (世界を巻き戻す) (tag `#R93`)

"日時を指定すると、その時点の世界を可能な限り復元する… 単なる過去地図ではなく Google Earth＋タイムマシン＋ニュースアーカイブ。現在ある歴史国境やニュースタイムラインを、地球全体の共通時計に統合する。"

- **`window.IntMapEarthReplay`** — a master clock that puts the app's existing dated features onto ONE shared globe time axis rather than a separate history map. Centre-bottom panel: date field + year field + 24-h UTC slider + **▶ play** (+3 h/tick). On every change it: (1) draws a **real day/night terminator** computed for the datetime — terminator latitude = `atan(−cos H / tan dec)` per longitude, ring closed over whichever pole is in polar night — works for ANY date; (2) for dates within ~10 years, drives the existing **time-travel engine** (`dispatch{type:'timeTravel',date}`) so news / satellite imagery / earthquakes jump to that date; (3) reloads any ON **dated raster layers** (temp/precip/SST/snow/AOD/NO2/fire/… via `_imLayerDates` + `refreshDatedLayer`). Readout shows sub-solar latitude, which pole is dark, and the active scope. Atlas actions (`earthReplay`/`replay`/`rewind`/`timeMachine`/`worldAt`) + deterministic NL ("世界を巻き戻す", "rewind the world to 2022-02-24", "earth replay").
- **Verified (real astronomy, headless-safe):** solar declination June **+23.4°** / Dec **−23.4°** / equinox **−0.1°**; terminator dark pole flips correctly — **June → South** polar night, **December → North** (124-pt ring). Boots clean, no console errors. Terminator paint + the time-travel/dated-layer orchestration reuse already-proven engines (not exercisable in the hidden tab).

## R92 — Unified disaster simulator (災害シミュレーター) (tag `#R92`)

"洪水、津波、火山灰、煙、放射性物質…発生地点と条件から時間ごとの影響範囲を表示。既存の個別シミュレーションを一つの共通基盤にまとめる。"

- **`window.IntMapDisaster`** — one panel + one time slider for five hazards: **flood** & **tsunami** = connected **DEM flood-fill** (bathtub inundation) from the real elevation model (via `IntMapTerrain`); **ashfall** & **smoke** = wind-advected downwind plume (widening banded cone) on **live Open-Meteo wind**; **radioactive** = delegates to the existing Lagrangian `IntMapRadiation`. Hazard buttons + per-hazard params (water-rise m / wave height m) + place-source-on-map + a 1–12 h time slider that steps the impact area; area-km²/max-depth readout. Atlas actions (`disaster`/`flood`/`tsunami`/`ashfall`/`hazard`/…). Keyless. Educational-approximation disclaimer shown.
- **Two bugs caught & fixed in verification:** (1) terrarium DEM includes **ocean bathymetry** (negative elevations) → the flood-fill flooded the sea itself (tsunami "591 m deep"). Fixed: traverse the sea for connectivity but count/render only land ≥ −1 m. (2) A source dropped on high ground filled everything below it (Fuji-summit flood "3,567 m"). Fixed: newly-inundated land is capped at the water **rise** (deeper cells were already below the water body).
- **Verified (real DEM, headless-safe):** coastal flood 3 m→15 km²/1.8 m, 8 m→245 km²/6.8 m, 15 m→389 km²/13.8 m (area grows, depth tracks level); tsunami 10 m→187 km²/8.3 m; flood-on-Fuji-summit → capped 5 m puddle (was 3,567 m). Boots clean, no console errors.

## R91 — Transit isochrone: reachable by rail (鉄道で1時間以内) (tag `#R91`)

Completes the isochrone feature ("車で30分／徒歩15分／鉄道で1時間以内") — the drive/walk/cycle side was Valhalla (#R86); this adds the rail side.

- **`window.IntMapTransitReach`** — the area reachable from a point within a time budget riding the REAL OSM rail network. Fetches rail ways + station nodes (Overpass, bbox sized to `min(90, minutes×1.4)` km, 3-mirror + corsproxy ladder, partial-result rejection), builds a welded graph (edge time = length ÷ per-class speed: rail 70 / light-rail 38 / subway 35 / tram 22 km/h; near-coincident nodes welded < 30 m so separate ways connect), then Dijkstra from the nearest station (seeded with the walk-to-station time at 4 km/h). Every station reached within budget is plotted **coloured green→orange by minutes**, and a reachable-area **convex hull** (buffered by the leftover-walk radius, via turf) is drawn. Honest caveat surfaced: distance/speed model, not a live timetable.
- **Wired into the existing isochrone entry points**: the Atlas `isochrone` action branches to rail when the mode matches `transit|train|rail|metro|subway|tram|電車|鉄道|地下鉄|列車`; deterministic NL extended (JP "○○から電車で60分以内", EN "60 min train from X"). 
- **Verified end-to-end with REAL data (Overpass responded):** from Umeda/Osaka, 12-min budget → **242 real stations reachable** (今宮 9m, JR難波 10m, 東淀川 5m, ユニバーサルシティ 7m…), 3,882 rail nodes, sensible times. Boots clean, no console errors.

## R90 — Sun & shadow (日照・影) (tag `#R90`)

"日付と時刻を指定し、建物や地形による日照・影の移動を3D表示する。"

- **`window.IntMapSun`** — pick a date + time (date field, 24-h slider, "Now", ▶ play to sweep the day at 15-min steps). Computes the sun's **altitude + azimuth + sunrise/solar-noon/sunset** for the map centre (standard SunCalc solar-position algorithm), lights maplibre's 3D scene from the sun (`setLight` position = sun azimuth/altitude so extrusions self-shade), and draws **real cast shadows**: OSM buildings in view (Overpass, ≥ z14.5) are swept along the sun vector (shadow length = height / tan(altitude), direction = az+180°) into ground-shadow polygons. Sun below horizon → night styling, no cast shadows. Atlas actions (`sun`/`shadow`/`sunlight`/`daylight`/…). Keyless.
- **Two bugs caught & fixed in verification:** (1) initial aspect-style azimuth was fine, but (2) `sunTimes` used the fractional day `d` instead of the integer Julian cycle `n` → solar noon came out 03:42 instead of 11:43. Rewrote to the proper SunCalc transit (`n=round(d−J0−lw/2π)`, `solarTransitJ`).
- **Verified against real ephemeris (headless-safe):** Tokyo summer-solstice noon altitude **77.7°** (theoretical 77.76° ✓), winter noon **30.9°** (30.88° ✓), azimuth due south; Tokyo summer sun **04:26 / 11:44 / 19:01 JST**, winter **06:48 / 11:40 / 16:33**, London summer **04:44 / 13:03 / 21:22 BST** — all match published times. Boots clean, no console errors. Shadow polygons + 3D light are driven by the (now-verified) sun vector; the paint itself can't be exercised in the hidden tab.

## R89b — RF / radio coverage (電波・通信圏) (tag `#R89`)

"アンテナ位置、高さ、出力、周波数を入力し、地形を考慮した通信可能範囲を表示する。"

- **`window.IntMapRF`** — from an antenna (position + height + TX power dBm + frequency MHz) draws the **terrain line-of-sight viewshed**: a 52×52 grid over the max-range bbox where each cell is covered only if NO closer terrain rises into the line of sight from the mast top (4/3-earth curvature drop applied) — real shadow gaps, no overstated coverage. Max range = min(radio horizon `4.12·(√h+√2)` km, free-space-path-loss range from the link budget, 80 km). Draggable panel (height/power/frequency inputs + click-to-place mast + covered-km² readout), Atlas actions (`rfCoverage`/`coverage`/`viewshed`/`lineOfSight`/…). Keyless (terrarium DEM via `IntMapTerrain`).
- **Bug caught in verification & fixed:** the first radial version `break`-ed the ray at the first angle decrease → 0.2 km reach from a 3,700 m peak (absurd), and a solid reach-polygon would have overstated coverage across shadow gaps (a facade). Replaced with the proper per-cell viewshed.
- **Verified (real physics, headless-safe):** Fuji-summit 30 m mast → **1,656 km²** covered / 28.4 km range; same mast in the valley NW → **165 km²** (10× less — terrain shadowing works); summit **100 m** mast → 47 km range / **5,149 km²** (taller mast reaches farther). Boots clean, no console errors.

## R89 — Slope/aspect terrain analysis + shared DEM sampler (tag `#R89`)

"地形から傾斜角、斜面方向、急傾斜地を色分けする。災害・登山・建設・軍事分析に使える。"

- **`window.IntMapTerrain`** — shared keyless DEM access reused by slope/aspect, RF viewshed and terrain shadows. Decodes Mapzen/AWS **terrarium terrain-RGB tiles** (public S3, verified CORS-OK for canvas readback; elevation = `R*256 + G + B/256 − 32768` m) into an `await sampler([w,s,e,n], z) → {elevAt(lng,lat)}`. Tile cache; caps at 48 tiles/view (caller lowers zoom otherwise).
- **`window.IntMapSlope`** — colour-codes the current view from the REAL elevation model, two modes: **slope** (steepness angle: green→yellow→orange→red ramp) and **aspect** (the compass direction each slope faces: hue = bearing). Central-difference gradient on a 48×48 grid with proper metres-per-degree (× cos lat for longitude); recomputes on pan/zoom (debounced, view-key cached). Layer row `dl-slope` (⛰), an in-legend mode toggle, Atlas actions (`slope`/`aspect`/`terrainAnalysis`/…). 
- **Verified against Mt Fuji (real numbers, headless-safe):** summit elevation **3,754 m** (actual 3,776 m ✓), flank slope **31.2°** (Fuji's cone ~30–35° ✓). Aspect bug caught in verification and fixed — NE flank now → **40° (NE)**, SW flank → **226° (SW)** (was mis-rotated ~95°; corrected to downslope azimuth `atan2(-dz/dx, -dz/dy)` clockwise from north). Boots clean, no console errors. Map paint uses the standard geojson-fill primitive (can't be exercised in the hidden tab).

## R88 — Universal Object List (汎用オブジェクト一覧) (tag `#R88`)

"現在地図に存在するピン、描画、半径、経路、アップロードデータを一覧化し、表示・非表示・名称変更・色変更・削除を一か所で。今は機能ごとに管理場所が分散している。"

- **`window.IntMapObjects`** — ONE floating panel that gathers EVERY user object live from its real subsystem and manages it in place: **pins** (`userPins`→`removePin`) · **radius circles** (`radiusItems`→`removeRadiusItem`, recolour via `refreshTool`) · **kept drawings/annotations** (`IntMapAnnotations._items`→`remove`, native name+colour) · **uploaded GeoJSON** (`GeoJSONUpload._items`→`remove`, per-layer recolour + show/hide via `setPaint/setLayout`) · **active route** (`imroute-src`→`IntMapRouting.clear`) · **reachable-area isochrone** (`im-iso-src`→`IntMapIsochrone.clear`). Per object: **fly-to · rename · recolour · hide · delete** — each shown only where the subsystem supports it (rename uses the native name field where one exists, else a side-label store; pins have no colour field so no swatch). Fully **additive**: reads existing state and calls existing remove APIs; the only subsystem changes are exposing `GeoJSONUpload.remove` and `IntMapAnnotations.refresh` (one word each). Placed INSIDE the main closure so it can read the module-scoped `userPins`/`radiusItems`/`removePin`/`refreshTool` directly.
- **Discoverability**: a count-badge FAB appears bottom-left whenever ≥1 object exists (`🗂 N`), opening the panel; also `IntMapObjects.open/close/toggle`, an Atlas action (`objects`/`objectList`/`manageObjects`/…), and deterministic NL ("オブジェクト一覧", "オブジェクトを管理", "manage/list/show all objects", "object list/manager"). Draggable via `makeDraggable`.
- **Verified (headless-safe, DOM+logic):** boots clean (all `IntMap*` modules defined, no console errors); with 2 annotations added → panel shows 2 correctly-named rows + 2 colour inputs + 2 delete buttons; recolour writes through to the subsystem (`#0000ff`); deleting a row removes it from the real store (count 2→1) and matches the live subsystem; `clear all` → 0; the Atlas `objects` action opens the panel. Map-paint side (fly-to/hide) can't be exercised in the hidden tab (`isStyleLoaded` gate) but uses the same proven fitBounds/setLayout primitives.

## R87 — live-camera coverage GREATLY expanded (tags `#R87`)

Re-report: "ライブカメラ…coverageが限定的すぎる。すくなくとも今の20倍の利用可能数にしろ。しっかりしたものを（ハリボテNG）".

- **Two big new KEYLESS camera networks, both fully verified end-to-end** (list-access AND image-display — a network whose image won't hotlink is a facade and was rejected). Added alongside the existing OSM-worldwide + TfL-London sets:
  - **Caltrans (California DOT) CCTV** — **3,323 in-service cameras** across all 12 districts (`cwwp2.dot.ca.gov/data/dN/cctv/cctvStatusDNN.json`, native-CORS open JSON). Each is a direct refreshing JPEG (`imageData.static.currentImageURL`, ~5-min). Fetched once per district; features appear progressively. Verified: 12/12 districts parse, all coords valid, sample image loads (320×260). Pins blue `#2979ff`.
  - **Fintraffic / Digitraffic (Finland)** — **811 stations / 2,260 live views** (`tie.digitraffic.fi/api/weathercam/v1/stations`, native-CORS, CC BY 4.0). The list omits imageUrl but every preset carries an `id` → deterministic `https://weathercam.digitraffic.fi/{id}.jpg`. One pin per station; the popup shows a **thumbnail switcher** for that station's several views (each swaps the main live image, which the refresh loop then keeps live via `data-base`). Verified: 811 pins, 2,260 views, coords valid, sample image loads (1280×720). Pins amber `#ffab00`.
  - **More US state DOTs via OpenTrafficCamMap (`#R87`, follow-up)** — **1,027 site-pins / 1,815 live views** (Colorado + Indiana + Alaska + Arizona). The MIT-licensed crowdsourced `AidanWelch/OpenTrafficCamMap` dataset (`cameras/USA.json`) is served **keyless + CORS-OK from the jsDelivr CDN**, PINNED to commit `362223187b5b…` for a stable schema. Only `format:IMAGE_STREAM` cams whose host is in a **verified-hotlink allowlist** are kept (Ohio 1,053 & Kentucky 260 were tested and DROPPED — their images time out/error; M3U8 video streams dropped; California skipped = already Caltrans). Same coord = one pin with all its directional views in the popup switcher (reuses the Finland gallery). Pins pink `#e0409a`; per-cam attribution `© <state DOT> · via OpenTrafficCamMap`. Verified: 1,027 pins, 1,815 views, coords valid, one sample image per host loads.
- **Pins now colour-coded by network** (per-feature `col`; `circle-color` = `coalesce(col, legacy kind-match)` so it's backward-compatible): OSM 🟢 / TfL 🟠 / Caltrans 🔵 / Fintraffic 🟡 (+ OSM yt red / pano cyan / video purple). Legend names all four sources with counts. `openCam` reads a per-feature `attr` for attribution.
- **OSM density**: per-view Overpass cap **700 → 1,500** (more cams in dense areas). classify() UNCHANGED (keeps only genuinely-displayable cams — no facade regression).
- **Worldwide OSM cams — classify() broadened (`#R87b`).** Per "本物のウェブカメラなら、なんだっていい" (any real, immediately-viewable webcam is fine): `classify()` now also accepts standard single-shot IP-camera JPEG endpoints (Canon `GetOneShot`/`wvhttp`, Panasonic `SnapshotJPEG`, generic `cgi-bin/*.jpg`, `?action=snapshot`) — real JPEGs that display + refresh cleanly. **HTTPS-only** so no dead mixed-content pin is ever added, and motion-JPEG streams / HTML viewer pages still correctly return '' (no facade). Verified with 6 endpoint cases. This lifts worldwide OSM yield (the keyless "any webcam, anywhere" backbone) on top of the dense national networks.
- **Honest scope note (measured, not hand-waved):** truly keyless + CORS-open + directly-hotlinkable camera networks are genuinely rare — tested & rejected NYC DOT (960 cams; image won't hotlink → times out), all US/CA "511" platforms (CORS-blocked), NZ NZTA (XML + CORS), and a global one-shot OSM load (>26 s on Overpass — kept view-based). Commercial global sets (Windy ~70 k, Vizzion, TrafficLand) need API keys → excluded (a client-embedded key breaks at quota = facade). Net result: the always-loaded usable pool goes from ~882 (TfL, London-only) + sparse OSM to **~8,300 verified live views (Caltrans 3,323 + Finland 2,260 + TfL 882 + US-DOTs 1,815) across California, Finland, London, Colorado, Indiana, Alaska, Arizona + denser worldwide OSM** — from near-zero to thousands in whole new regions. (Japan/Korea/Taiwan/Russia have no keyless direct-image feed — measured: their OSM webcams are mostly HTML viewer pages or http-only URLs an https site can't load; not addable without a facade.) Sources modal + Privacy §4 (EN+JP) add Caltrans + Fintraffic/Digitraffic; ToS unaffected (no provider enumeration there). Map paint/toggle can't run in the hidden headless tab (`isStyleLoaded` gate) — loader parsing + image-load verified against live endpoints instead.

## R86 — transit alternatives · Compare click-to-add · denser news (tags `#R86`)

Batch from a big feature wishlist; these three shipped solid this round (others sequenced).

- **Transit alternatives (the Berlin→Amsterdam screenshot).** MOTIS already returns many itineraries but `transit()` only surfaced the best. Now it builds EVERY itinerary (`_buildItin`, up to 5, ranked: rides-something-first then by duration), each with its own coloured geometry; the Atlas reply lists them Google/Apple-Maps-style — a tap-to-expand accordion (`.atl-trip[data-ai]`) showing dep–arr time, total duration, transfer count, mode-icon sequence (🚇 S9 → 🚄 ICE 277 → …) and, when expanded, the full leg detail with per-leg departure times. Tapping a card redraws THAT itinerary on the map via `IntMapRouting.selectAlt(i)` (module keeps `_tAlts` with per-alt feats; `_drawFeats` factored out). Delegated on `#atlas-panel` next to the existing mode-switcher handler. Verified live: Berlin→Amsterdam → 5 real options (ICE 277/646, FlixBus N44, Sprinter, Tram 14) with times/transfers in ~5 s (Transitous, not throttled). railEstimate (OSM Shinkansen fallback) has one route → no accordion, unchanged.
- **Compare → pick a country on the map (`#2`).** `IntMapStatsCompare` gets a ◎ target button beside the search input (matching `.scp-add` styling — no layout disturbance). Press it → `_setPick(true)`: crosshair cursor, `window.__scpPick=true`, `map.on('click',_pickClick)`. A click resolves to a country via turf point-in-polygon over `countryGeo` + `resolveCountryId` (same primitives as the shipping `countryAt`/country-fill click) and pushes it into `codes` (continuous until pressed again / Esc / 10 reached / panel closed). Guarded the country-detail click (`!window.__scpPick`) and `handleMapClick` so pick mode owns the click and doesn't destroy the compare view. Verified: button placement, toggle state, cursor, Esc/close cleanup (map-click resolution itself can't fire in the hidden headless tab, but the resolver is byte-identical to proven code).
- **Denser news cards (`#3`).** `.news-item` padding 16→**11px 15px**, radius 16→14, `.news-title` margin-top 8→5, `.news-foot` 8→6, and a news-only `#live-news-feed{gap:9px}` (info/community/countries feeds untouched). The ★ (`.btn-bookmark`) re-aligned to `top:9px;right:14px;font-size:17px;line-height:1` so it sits with the head row and doesn't clash when compressed (the `.news-head` keeps its `padding-right` clearance). ~14 px shorter per card without cramming.
- **Isochrone / 到達圏 (`#4`).** New `window.IntMapIsochrone` — "車で30分" "徒歩15分" "自転車1時間" as a REACHABLE AREA that follows the road network, not a distance circle. Uses the keyless public **Valhalla (FOSSGIS)** `/isochrone` (auto/pedestrian/bicycle → time-contour GeoJSON polygons; verified live: Berlin 15/30-min drive = 2 real ~893-pt polygons in 1.8 s). Draggable panel (mode + up-to-3 time presets + coloured legend), own source/3 layers, `run/open/clear`. Opened from the right-click menu, from Atlas (`{type:'isochrone',place,mode,minutes}` — verified: Paris walk 15 → real polygon), and from deterministic NL (JP "○○から車で30分の範囲/○○の徒歩15分圏/○○の到達圏"; EN "30 minute drive from X / isochrone for X / reachable area from X" — all verified matching, weather/directions correctly NOT matched). Wired into the overlay on/off maps (`isochrone` → im-iso-*). **GOTCHA:** a triple-nested ternary in the panel HTML was missing one `)` → the WHOLE script block died silently (all `IntMap*` modules undefined, page still "loads"). Always verify it RUNS (modules defined), not just that the file saved. Sources + Privacy §4 (JP+EN) add Valhalla; `LEGAL_DATE`→2026-07-13.
- **Colour-coded transit routes on the map (`#R86b`).** Per the "経路の線は色分けしろ（添付画像のように）" (the Google-Maps screenshot shows each alternative in its own colour): transit now draws ALL alternatives at once, each in a DISTINCT route colour (`ALT_PAL` = blue/orange/green/purple/pink), the selected one bright + on top, the others dimmed & thin (`op` feature-prop added to `imroute-walk`/`imroute-rail` line-opacity). `_buildItin` now stores raw leg geometry (`lines`/`stops`); `_drawAlts(sel)` composes the combined FC; `selectAlt(i)` redraws with i bright + fits to it. Per-leg MODE colours stay in the itinerary detail list. Reply cards carry a matching colour dot + coloured left-border. Verified: Berlin→Amsterdam 5 alts, 5 distinct colours, 5 card dots+borders, selectAlt(0/2) OK.
- **Live cameras REBUILT REAL (`#R86b`).** The old `dl-webcams` was a facade — it plotted every OSM webcam point but ~40% only LINK OUT to X-Frame-blocked operator pages (measured live: Alps 800 cams = 60% displayable, 40% link-out), so clicking most pins showed nothing. Rebuilt so EVERY pin displays live imagery in-app: `classify(url)` keeps only cams that show (refreshing image / YouTube-live / Roundshot·Panomax / video) and DROPS link-out-only ones; added **Transport for London JamCams** (882 keyless live traffic cams, refreshing JPEG — verified the image actually loads, 352×288) fetched once when the layer is on; the popup image AUTO-REFRESHES every 4 s (cache-busted) while open; a momentarily-offline cam says so honestly (`onerror`→ message). Pins coloured by kind (tfl orange / yt red / pano cyan / video purple / img green). Sources + Privacy §4 (JP+EN) add TfL; Sources OSM-webcam entry rewritten. **Verified:** classify 11/11 (keeps displayable, drops link-outs), TfL 882 cams + a real image loads. Map render/popup can't be exercised in the hidden headless tab (`isStyleLoaded` gate), like every map layer.
- **Multi-point route optimisation / TSP (`#R86c`).** Atlas `optimizeRoute`/`tsp`/`multiStop` — give ≥2 places (or drop pins): `_tspOrder` orders them shortest-first (nearest-neighbour + 2-opt on great-circle distance, first stop fixed as start), then the tour is DRIVEN on the OSM road network (OSRM via `IntMapRouting.route` with waypoints). Reply shows the numbered order + total time/distance. Deterministic NL (EN "optimize route through A, B, C / shortest order to visit …"; JP "A・B・Cを最短で回る / …を効率よく巡る順番"). Verified: colinear A,C,B→A,B,C; scrambled Osaka/Tokyo/Kyoto/Nagoya/Yokohama → Osaka→Kyoto→Nagoya→Yokohama→Tokyo, 548 km/7h33m via OSRM; NL patterns match, negatives excluded.
- **Route lines coloured BY MODE on the map (`#R86d`).** Bug report: "経路の線、路線や徒歩などの種別での色分けがされていません" — on the map a transit route was drawn in ONE flat colour regardless of leg type (walk vs subway vs rail vs bus), even though the reply note claimed "乗車区間はモード別に色分けして地図表示" and the itinerary detail list already showed a per-leg colour bar. Root cause: R86b coloured each geometry by its ALTERNATIVE (`ALT_PAL`), and `_buildItin` DROPPED the per-leg mode colour — it computed `const col=_modeColor(l.mode)` but pushed only `{coords,walk}` into `lines`, never `col`. Fix (2 lines): `_buildItin` now keeps `col` on each line object; `_drawAlts` paints the **selected** route's legs by their MODE colour (`ln.col` → walk grey-dotted `#7a7f87`, subway `#ff6d00`, tram/light-rail `#00a152`, bus `#7b1fa2`, ferry `#0097a7`, rail `#1558d6`) so it now MATCHES the leg list, while **unselected** alternatives keep their single dimmed `ALT_PAL` colour — so R86b's distinct-per-alternative view is fully preserved (best of both, exactly like Google/Apple Maps: selected route shows line colours, alternatives are dim). `selectAlt(i)` re-paints alt *i* per-mode. Intercity-rail (`_renderRail`) and single-mode drive/walk/cycle already coloured by type — untouched. No data-source/Privacy/ToS change (pure rendering). **Verified** with a faithful V8 harness of the byte-identical `_buildItin`/`_drawAlts`/`_modeColor`: selected 5-leg trip → `grey,orange,grey,purple,grey` (3 distinct hues, was 5× flat blue); unselected alt → all its one palette colour; switching selection re-colours the rail leg to rail-blue. (Live map paint still can't be exercised in the hidden headless tab — `isStyleLoaded` gate — like every map layer.)
- **Still sequenced (not this round — each is a large feature; cramming would re-introduce facades):** universal object list, unified disaster simulator, slope/aspect analysis, sun/shadow, RF/coverage, Earth Replay.

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
### R66b — 「右サイドバーそのものが覆いかぶさる」の構造的根治
- The in-flow flex approach could not be shown to overlay in ANY reproduction here (flex pushes, never covers), but the user's machine clearly disagrees — so the design no longer gives it the chance: **the layout is DECOUPLED**. `.map-container` cedes the strip ITSELF via `margin-right:var(--lsr-w)` (set INLINE in open(), cleared in close(); transitioned), and `#layer-sidebar-r` is just an absolute panel (`top:0;right:0;bottom:0;transform:translateX(102%)→0`, inline-driven, `visibility/pointer-events` gated) that slides into the strip the map already vacated. Neither depends on the other's flex/transition state: any conceivable failure leaves an empty strip — never a covered map.
- **Dynamic width**: on open, `--lsr-w` is computed so the map keeps ≥320px whenever geometrically possible (min 280px panel; a fixed 430px panel next to a widened left sidebar on a narrow window used to swallow the map = the "covering" perception).
- ms-narrow watcher: use the map rect even at ~0 width (the old `width>50` guard silently disabled the clamp exactly in the squeezed case) + `body.ms-hide` hides the search pill entirely when no usable strip exists; CSS `max-width:calc(100vw - left - right)` keeps even a stale-var pill from ever crossing the sidebar.
- Verified cold-boot (persisted right+ticker settings → #btn-layers click): map right edge == sidebar left edge exactly (aligned), close restores full width + pill, ticker row stays at the very bottom, 129 rows, Active bar top + single search field.
### R67 — 山岳ラベルのズーム位置ずれ、最終決着（自己修正）
Honest correction: the R64/R66 peak treatment was WRONG and was itself the reported drift. Two different geometries need two different strategies:
- **Peaks (point nodes)** — tile quantization error is proportional to tile resolution, which is proportional to the view: a mountain_peak node rendered from the tile matching the current zoom is ALWAYS sub-pixel accurate. Direct tile rendering is inherently drift-free. Pinning them (R64) baked in one low-zoom tile's coarse coordinate (label visibly off the summit, offset growing as you zoom in), and the R66 "refinement" then MOVED the pin at each zoom step (hops) — worse. → `ofm-peak` reverted to `source:'ofm','source-layer':'mountain_peak'` direct rendering (constant text size kept). Verified live: ▲ Dom sits exactly on the summit coordinate at z12.4; Zermatt-area peaks all render (z10→z12 stable).
- **Water (LineString label lines)** — the tile geometry genuinely CHANGES shape per zoom, so pinning stays, but back to pure FIRST-SEEN (the R66 refinement removed here too: updating a pin is itself visible movement, and a lake label floating a few hundred metres from the polygon centroid is invisible). `stab-peak-src` and all peak-harvest/refine code removed; `_imLabelStats` now water-only.
Lesson recorded in memory: point features → render from tiles; line-label features → pin first-seen; never "refine" a visible anchor.
### R68 — peak-label "drift": measured, not assumed
User pushback (「まだずれてるわ。勝手に原因決めるな」) was right to demand evidence. Measured with a new read-only diagnostic (`_imLabelStats('peaks')` → queryRenderedFeatures anchors + projected px):
- The rendered ANCHORS were already glued after R67: same summit (Dom) centered, z10 / z11.7 / z13.5 → anchor at the IDENTICAL container pixel [203,368] at all three zooms; geographic spread ≤ ~3 m (tile quantization, sub-pixel). So the anchor was NOT the remaining complaint.
- The measured visible offender: `text-anchor:'top'` centered the whole "▲ Name" string under the point, so the ▲ MARKER sat half-a-string-width LEFT of the summit — a constant ~40-70px screen offset that corresponds to KILOMETRES of terrain at z10 and metres at z14 → the triangle visibly pointed at different terrain at every zoom. That reads exactly as 「ズームに応じて位置ずれ」 (and matches the user's floating-▲ screenshot).
- Fix: string LEFT-anchored (`text-anchor:'left'`, `text-justify:'left'`, offset −0.32em) so the ▲ glyph itself sits ON the summit at every zoom; `filter:['has','name']` drops the nameless bare-▲ nodes whose zoom-dependent appearance also read as ghost labels. Verified: ▲ Dom renders at the map-centered summit at z11 and z13.5; 0 nameless peaks rendered.
Rule added to memory: for point-marker labels, the MARKER GLYPH must be the anchored element — never center a "glyph + text" string on the point.
### R69 — Stats time-series root cause (measured), instant compare, Wikidata second POI source, Atlas mandatory web search, Active-layers list, water-label density, brief wording
Every item verified live in the preview (headless, state/DOM/network assertions):
- **Stats "No time-series available" — MEASURED root causes, all fixed**: (1) every chip/metric/source change re-rendered EVERY block and fired a fresh fetch per (indicator,country) — one instrumented session produced **321 parallel WB requests (34 for a single indicator), 305 stuck pending** behind the browser's 6-per-host limit, after which the World Bank **throttled the IP** and everything showed "no data" (this machine's IP was literally throttled during diagnosis). Fixes: the cache stores the IN-FLIGHT PROMISE (concurrent duplicates share one request), a 6-slot scheduler bounds concurrency, 20 s aborts stop hung requests leaking slots, and NETWORK failures are not negative-cached (retryable) — only genuine "API answered, series empty". (2) `EN.ATM.CO2E.PC` was RETIRED by the WB (0 values, verified) → successor `EN.GHG.CO2.PC.CE.AR5` first with the old code as fallback (compare + time-series modal, which also gained a cache — it refetched all 6 series on every open). (3) WB central-govt debt is EMPTY for Japan/many majors → debt now DEFAULTS to IMF WEO (switch still offered). (4) a deferred `renderStats` (after `loadCountryData`) clobbered the freshly-opened comparison view → it now yields while `#scp-view` is mounted; Back removes the view first. Verified after fix: open-during-load renders all 5 blocks (10 fetches, 0 pending); all-22-indicator selection = 34 fetches, 0 stuck, 0 "no time-series", CO₂ + debt charts render.
- **Compare source switch no longer reloads everything** (「ソースを切り替えたらいちいち再度すべて読み込みになる動作がうざい」): per-block signature (countries+source) skips identical re-renders; `render()` is INCREMENTAL (existing blocks stay visible, deselected removed, new inserted in order — no "Loading data…" wipe); IMF DataMapper is fetched ONCE per indicator (it returns all countries) so WB⇄IMF flips and country changes hit the cache. Verified: GDP WB→IMF touched ONLY the GDP block (other DOM nodes identical) with 2 requests (direct CORS-fail + corsproxy 200); IMF→WB = 0 requests; chip removal refreshed all blocks from cache instantly.
- **POI mapping: Wikidata as a second, independent source** (「なんでもかんでもOpen Street Mapで済ませようとするな」): `wikidataPOIs()` queries query.wikidata.org SPARQL in PARALLEL with Overpass — country searches filter by ISO3 (`?country wdt:P298 "RUS"` → P17; no QID lookup needed), everything else by `wikibase:box`; ~20 facility classes mapped to live-verified QIDs (refinery Q12353044, NPP Q134447, mil-base Q245016+Q18691599, …). Results MERGED (normalized-name + ~2 km proximity dedupe) and the reply states per-source counts + scope: 「根拠: OpenStreetMapの登録施設 579件 + Wikidata追加 13件（検索範囲: ロシアの全域）」 — verified live on the user's exact ロシアの石油精製施設 case (592 pins) and チュニジアの空港 (22 pins, WD all deduped). Wikidata failure reports 「Wikidata照会なし」 instead of a fake 0. Sources modal + Privacy §4 (JP/EN) updated (facility type + country code / search area sent to WDQS).
- **Atlas MUST web-search on current-events questions** (the Greece 「ネット検索しろや。逃げてんじゃねーよ」 case): root cause — the analyze system prompt said answers must use "ONLY the DATA blocks", which actively FORBADE the model from using the provider web_search tool R64 had enabled. Rewritten: web_search is a required evidence source whenever the question concerns recent events and the blocks lack fresh dated items; "nothing notable happening" answers without a search are explicitly banned; empty client-side gathering no longer aborts the analysis (the model searches instead). Brief prompt gets the same instruction. Footer now lists 「AIライブWeb検索」.
- **Active layers UI** (「UIがくそ」): the fixed-height chip strip stays (it IS the R32/R64 zero-reflow guarantee) but gains (a) mouse-wheel horizontal scrolling, and (b) a 一覧/List button opening an ABSOLUTE overlay (still zero reflow): full layer names, the layer's own opacity slider mirrored inline (drives the real control via events — verified 0.75→0.4 on the real slider), jump-to-row, per-row remove; stays open across rebuilds, closes on outside tap. 5-language.
- **Water-label density** (「それほどズームしていない状態でも過剰な数見えすぎ」): each pinned water label now records the lowest tile zoom it was actually SEEN at (`mz`, floored per class: sea 3 / gulf 4.5 / bay·strait·lagoon 5.5 / lakes 6.5) and both water layers filter `mz <= zoom+0.2` — i.e. zoomed-in harvests no longer flood low zooms; a label appears at a given zoom only if that zoom's own tiles consider the water body worth labelling (mz only ever moves DOWN; the pinned POSITION never changes — the R67 rule stands). Verified: bays pinned at mz 5.5, lakes at 6.5, invisible at z<5.5.
- **Brief wording** (「AI Briefに🤖をつけるな」「AI briefってワードをわざわざAtlasで出すな」): all Atlas chat surfaces drop the 🤖 and the words "AI brief/AI調査" — user bubble = 「調査: <場所>」, reply header = the place name alone, askHere note = ✓, context-menu robot removed, research-panel title = 「調査: <場所>」. The AI-generated disclaimer note stays.
- Label-drift item in the user report was confirmed resolved by the user (R67/R68) — untouched.
### R70 — unified Stats comparison (bar ⇄ time-series ⇄ Excel-like table) + right layer sidebar rebuilt as a tile grid with previews for EVERY layer
- **ONE comparison system** (「似た機能なのに別の場所にあって分かりづらい」): the old click-country static-bar page (renderCompareView) is MERGED into IntMapStatsCompare. Country-row clicks still build the selection (dock cap 3→5); "Show comparison" opens the unified view. Mode segment: **棒グラフ (default)** — per-indicator horizontal bars on live data (negative values red, year per value) | **時系列** — the R63 overlaid charts | **表** — Excel-like pivot: countries×indicators, ⇄ transpose, column-click sort (desc→asc→off), DRAG-reorder of row/column headers (mutates codes[]/indOrder[]), year selector (any year 1980+, latest ≤ year per cell), CSV export (BOM, quoted). The separate 「国を比較（最大5か国）」 button is RETIRED per instruction. Indicators +6 bundled reference metrics (area/HDI/democracy/GDP PPP ×2/military $, real vintages shown, no fake years — y=0 suppresses the year chip). Atlas compareStats gains "view":"bar"|"timeseries"|"table" (「表で比較して」). Verified live: dock→bar view (15 bars/3 countries), ts charts, table transpose/sort/year-2000 values, Atlas 「日本と韓国とドイツを比較して」→ bar mode.
- **Right layer sidebar rebuilt from scratch** (「単に移植するな。一から同じ機能かつ洗練されたUIで。タイル形式に」): no more #layer-dropdown reparenting — the sidebar is its own **2-column TILE GRID** (preview image, full 2-line name, ✓ active state, ★ favorite on the SAME imLayerFavs store, per-category section headers, live search that hides empty sections, Active-layers bar sticky at top via _placeActiveSection lsr branch). The classic dropdown stays untouched (hidden) as the single source of truth: tile click toggles the REAL checkbox + change event, so every layer engine/legend/Atlas action works unchanged; a document-level change listener keeps tiles in sync both ways. Verified: 129 tiles / 9 sections, NATO tile click → real cb + Active chip, search "rail" → 3 tiles + section hiding, close → Active bar returns home + classic panel intact (137 rows).
- **IntMapLayerPreviews — an example image for EVERY layer** (「例画像が全く準備できていない。10程度でいいわけがない」): resolver ladder, no shipped assets: (1) ~35 REAL example tiles from each raster layer's own endpoint (24 GIBS products incl. all gx-*, Esri hillshade, ASTER relief, Terrascope WorldCover, OpenRailwayMap, OpenSeaMap Dover strait, RainViewer live timestamp, Köppen PNG); (2) real mini-choropleths from countryStats (pop/gdppc/hdi/dem/milSpend/milSpendGDP/lifeExp/internet); (3) real WB choropleths for ~35 indicator layers using each layer's OWN indicator code + OWN color ramp through the layer's own cached loader (IntMapWB) — **lazy: IntersectionObserver + 1-at-a-time with 350 ms gap** (R69 lesson: WB throttles the IP on bursts). dl-tfr goes to WB directly (countryStats.tfr only exists after the layer's lazy fetch — found live); WGI corruption uses source=3&date (mrnev rejected). (4) real member fills (NATO/EU/FSU sets), real geoLayersDB geometry (chokepoints/island chains/pearls/NSR/sahel/BRI/pipelines/nuclear), real current-time day/night terminator, live USGS week quakes, real famous-site coordinates (34 volcanoes, 14 dams, DC/pharma hubs), coastline-derived EEZ halo; (5) clearly stylised representative sketches ONLY for unsampleable live streams (planes/ships/webcams) and ECMWF om:// model fields. 94/129 real previews instantly, ~110+ after lazy loads; canvas 192×120, dataURL cached per id.
### R71 — compare speed/quality batch + tile-sidebar polish (user re-report)
- **"Loading data…が長すぎる" — root fix**: bar view & the table's latest column now read ONE `country/all&mrnev=1` request PER INDICATOR (all countries at once, shared-promise cached, 20 s abort, no negative-caching of network failures) instead of a request per (indicator,country). Measured: 6 countries × 5 indicators fully painted in **~950 ms**; table in ~570 ms. Full per-country series are fetched only for the time-series view / a specific-year table.
- **"データなしが多く…比較にならない" — gap-fill ladder**: for each selected country missing in the primary source, the latest value is filled from the OTHER source (WB⇄IMF) and finally from the bundled reference values (REFV: gdp/gdppc/pop/life/net). Filled cells carry a ° marker + a per-block footnote. Measured: 6 majors × all default indicators = ZERO "—" cells.
- **Bar geometry**: fixed name (118px) + value (112px right-aligned tabular-nums) columns → every track identical ("長さが統一されていなくて気持ち悪い"); fills are absolutely positioned; sign-carrying indicators (growth/cab/fdi) get a REAL 0 axis — a `.scp-zline` vertical rule with bars growing left/right from it — verified live on current-account (USA/IND negative red, others green, zero line present).
- **± colouring**: SIGNED indicators render +green/−red with a plus sign in bars, the ts latest row AND the table ("表ではプラスマイナスで緑赤"). 0-axis dashed gridline also added to the ts charts when the range crosses zero.
- **Focus view** ("一つだけ選択したら詳細"): every block header gains 詳細 › — one indicator full-width: source switch, latest bars, a 240px large chart, and a per-year table (24 most recent years × countries). Back returns to the list.
- **Indicator picker** ("煩雑。ごちゃごちゃ"): the 28-chip cloud is now behind ONE toggle 「指標を選択 (n/28) ⌄」 and grouped into 5 categories (経済/財政・貿易/人口・社会/環境・エネルギー/基礎・参照 — INDCAT/CATL).
- **Cap 5→10 countries** everywhere: picker (both paths), dock (n/10), open() slice, Atlas compareStats + SYS, PAL extended to 10 colours (verified 10 bars / 10 distinct colours; an 11th code is dropped).
- **Right tile sidebar polish** ("素人が作ったようなダサい"): 3-column grid; previews are now WEB-MERCATOR (±72.5° ≈ exactly 2:1 — no more vertically stretched land; tile aspect-ratio matches the canvas 240/121 so nothing distorts) at 2× device pixels (crisp); tightened typography (10.5px 2-line names, uppercase 10.5px section headers WITH tile counts, quieter 1px card borders); the Active-layers bar inside the sidebar hides its chip strip (counter + 一覧 overlay + すべて解除 remain — "選択レイヤーが増加すると煩雑" solved with constant height).
- **Environment lesson (cost: ~20 min)**: the headless preview pane auto-opens `http://localhost:8786/`, while manual navigation used `http://127.0.0.1:8786/` — DIFFERENT localStorage origins. Layer/panel settings persisted on the 127.0.0.1 origin from earlier tests (Köppen+Wind on) made every boot there saturate the hidden tab's main thread for minutes ("wedged renderer", evals all timing out) — even for known-good builds. Test on the auto-opened localhost origin (clean settings), or clear the origin's storage first.

### R72 — Atlas becomes a mapping research agent (mapReport / flights / drawing / inline controls) + weather-source failover + real basin hydrology + right-sidebar fixes
Big batch; every item below is a direct user report.
- **Weather popup "表示されなくなっている" ROOT CAUSE**: Open-Meteo's per-IP daily quota was exhausted (429 `{"error":true}`) — this app is a heavy consumer (wind grids, widgets, probes) — and the panel rendered a silent "—" skeleton. Fixed with (a) a 10-min per-location cache, (b) **automatic failover to MET Norway** (api.met.no Locationforecast, CORS-open) mapped into the same shape incl. a 5-day daily aggregate, (c) an honest error line when both fail. Verified live: Open-Meteo 429 → panel shows full MET-Norway data with source line "MET Norway".
- **POI popups (refineries report)**: popups were `maplibregl.Popup` WITHOUT the app's `.plc-popup` class → library default white bg + `var(--text-main)` (white in dark mode) = invisible text. Now: themed class, **hover popup** (name/kind/summary preview), click popup with coordinates + **Wikipedia button** (OSM `wikipedia`/`wikidata` tags → direct link; Wikidata sitelink (`?artL ?artE` OPTIONALs added to SPARQL); else a live REST summary probe like place labels) + Website button.
- **mapReport action** (「政界の近況を地図上にまとめて」「銃犯罪を調べて→地図にマッピング」): GDELT+GoogleNews+loaded-news evidence + provider web_search → strict-JSON geolocated items → pins (reuses nlq-poi source; `sum`/`url`/`src` props render the AI summary + article link in the popups) + overview & clickable item list in the chat. Prompt tells Atlas to PREFER mapReport for researchable topics with geographic footprints.
- **fly action** (ICBM viewpoint): great-circle slerp, per-frame `jumpTo` with bearing-ahead + parabolic zoom profile (ICBM zooms out to "apogee", re-enters; plane/cruise stay level), dashed trajectory line + head dot drawn progressively, user interaction cancels, honest real-flight-time note (ICBM ~distance/5-6.5 km/s). `clear what:"flight"`.
- **drawLine / drawPolygon**: AI-supplied coordinates or place names → `_hlLines`/`_hlPolys`. **controls action + auto layer controls**: replies can contain WORKING toggles/sliders/buttons (`.atl-ctl-*`, delegated on the panel; buttons fire `run(cmd)`); every layer-on reply auto-appends its toggle + opacity slider. Verified: injected toggle really flips `bx-eq`.
- **Atlas UI**: send button = round SVG arrow (idle-dims when input empty); ChatGPT-style **Copy/Retry** under every Atlas reply (user bubbles get none); **scroll-to-bottom jump button** (shows >140px above bottom); panel spawns taller (top 60→46px). Verified visually.
- **Hallucination ban**: SYS now forbids answering ANY time-variable fact (current PM etc.) from memory — must route through `analyze` (which REQUIRES a live web search before "no news" answers is already R69).
- **Basins (「地点数少なすぎてまったくの粗悪」)**: real hydrology ladder — (1) **self-hosted GRDC/World-Bank Major River Basins** (`data/basins_mrb.json`, 236 named basins, CC-BY-4.0, DP-simplified 0.008° ≈ 1.4 MB), name match verified by river-course containment; (2) **Global Watersheds API (mghydro.com)** — live HydroSHEDS delineation from both river endpoints (flow direction unknown → keep larger), sanity-checked by containment; (3) OSM basin relation; (4) AI outline (labelled approximate) LAST. Reply states the basin's data source. Verified live: ナイル川の流域 → "流域界: 実測の水文データ — GRDC/World Bank Major River Basins" + 3600 tributaries.
- **Right sidebar**: slow open = full reorganize+rebuild on EVERY open → now rebuild only when the row set changed (else a milliseconds `syncTiles()`), plus idle PRE-BUILD at boot; stale-checkbox tiles (silent no-ops / state mismatch) → checkbox re-resolved by id AT CLICK TIME + 320ms state re-read; **collapsible categories** (chevron headers, readable typography, counts; all open by default, Others (beta) closed); map click closes the sidebar (like classic); Active-layers "List" = icon button (SVG), round borderless ✕ (mobile 30px), opacity sliders hidden on mobile; **preview images**: regional-crop raster tiles per layer (monsoon/SE-Asia precip, Gulf-Stream SST, Japan night lights, Alps snow, Himalaya relief, German rail, Nile-delta land cover…, `tXY()` slippy-math) + `setView()` crop support for canvas painters (NATO/EU/USSR → Europe crops, volcanoes → ring-of-fire) + IMG tiles now lazy via IntersectionObserver. Verified: 129 tiles, sections & collapse, Others(beta) closed, tile→map toggle, map-click close.
- **Water labels**: (a) 「近畿全体で〇〇瀬戸が出る」→ per-class mz floors strait/lagoon 5.5→8.5, bay→7.2; (b) 「東シナ海が出ない」 TWO causes: geo-sea sat UNDER city labels in the STACK (topmost layer wins symbol collision → coastal towns ate sea names; geo-sea moved above city/other, below country) AND the geo-sea layer could be silently WIPED by a style swap with nothing re-adding it (observed live: source present, layer missing, silent catch) → idle **self-heal** re-runs ensurePlaceLabels+applyLabelLang when water/sea layers are missing while the toggle is on. + `symbol-sort-key` by size class.
- **Stats → "Data"** (tab renamed in 5 languages; Atlas `tab:"data"` alias; shortcut sheet updated). Chart hover tooltips now CLAMP horizontally inside the chart and flip below the anchor near the top (both the compare charts and the country time-series) — "端の方になると隠れる" fixed.
- **Ticker**: 📰 emoji removed from news items.
- **Shortcuts**: the R62 `?` cheat-sheet was undiscoverable → Settings row "⌨ View keyboard shortcuts" (`btn-kbd-help`, i18n ×5) + `window.IntMapKbdHelp` + Atlas `{"type":"shortcuts"}`.
- **Privacy/Sources updated**: MET Norway, Global Watersheds (mghydro), GRDC/WB Major River Basins added (EN+JP privacy §4 + sources list with licenses/attribution).

### R73 — 再発報告の実測根治（geo-sea無音棄却・プレビューURL引数ズレ）＋ Central OS化の第一歩（キャンセル・自己検証・実在事件マッピング）
- **「主要な海や湖の名前が表示されない」= 歴史的バグの実測根治**: `geo-sea`（ガゼッタの海・湖ラベル層）の `text-size` が `case(big, interpolate(zoom), interpolate(zoom))` — **zoom補間がcaseの内側**にある不正式で、MapLibreは addLayer を例外なし（非同期errorイベントのみ）で**無音棄却** → レイヤーは一度も存在せず、ハーベスタはガゼッタと同名の水域をスキップするため主要名がどこにも出なかった（R72の東シナ海報告も同根）。zoom最外殻・出力側caseの正しい式に書き換え。ヘッドレスで z2.3=太平洋/インド洋、z5.2=East China Sea、z7.2=琵琶湖 のレンダリングを queryRenderedFeatures で確認。**教訓: addLayerの失敗はthrowしない。追加直後に getLayer で存在確認するか error イベントを見る。** 同型の不正式は全ファイル走査で他になし。
- **タイルプレビュー「一切変化なし」の実測根因**: R72の地域別GIBSタイルは `G(id,lvl,date,ext,z,lon,lat)` の **ext省略呼び出しで引数が1つずれ**（3がext扱い・lat欠落）→ 全GIBS-png系のURLが壊れ404→グラデーションのまま（jpg指定の4枚だけ正常だった）。'png'明示で20呼び出し修正。＋IntersectionObserver遅延は off-screenプレビルドで発火しないことがある→**決定的な4並列プリロードキュー**（Image()、DOM順、失敗はグラデーション維持）+ open時の `kick()`（IO残置分の強制発火）+ `IntMapLayerPreviews.stats()` 診断。等高線プレビューはOpenTopoMap実タイル（Matterhorn、Sourcesに追記）。ヘッドレスで GIBS系プレビュー全適用（117/129、残りは遅延WB系）を確認。
- **rafshim**: `?rafshim=1` で rAF をタイマー化する開発専用シム（先頭スクリプト）— 非表示タブでは rAF が止まり map 'load' が永遠に来ないため、ヘッドレス検証はこれ無しでは不可能。通常訪問者には無効。
- **流域の精密化（信濃川で実証中）**: mghydro流域算出は「点の上流側」を返すため、河口端点は海にスナップして退化（1点ポリゴン）、**分流（大河津分水）下流の点は小さな残余流域**しか返さない実測 → 両端から2/8/18/33/50%の複数点+地理極値端点（≤12候補）を順に算出し、**河道の包含率が最大**（同率なら面積大）のものを採用、85%で早期確定。河道が取れない川は地名ジオコード点から算出するフォールバックも追加。`window._imBasinDiag`/`_imBasinDiag2` 読み取り専用診断（vision §17）。
- **Atlasキャンセル**: 世代カウンタ `_runGen` — thinking/実行中に新メッセージ → 旧ターンは残アクションを中断し「⏹ 中止」表示、遅延結果は破棄（localPlan/AI/brief全経路）。
- **レイヤー自己検証（vision §16）**: layerアクションはトグル前に可視レイヤー+オーバーレイのスナップショットを取り、**実際のスタイル差分**を最大4.2秒ポーリング → 変化なしなら一度だけ再トグル → それでも駄目なら「描画を確認できませんでした」と正直に報告（成功時は「☑ 地図上での描画を確認」）。
- **返答内コントロールの双方向同期**: document変更/inputリスナーで、凡例・クラシックパネル・タイルサイドバーなど**外部からのレイヤー操作を全返答内のトグル/スライダーに反映**（返答ウィジェット=ライブミラー）。
- **mapReportの一般論禁止**: 各itemは「検索/証拠で確認できた実在の1事象（日付・都市・被害数）」に限定、地域一般論・統計・トレンドのitem化を明示禁止、英語+ユーザー言語での複数検索を義務化、少なければ「何を検索してどこまでか」を overview で正直に。
- **現職者ハルシネーション**: 「Xの首相は？」系を localPlan で**決定的に analyze へ**（use:['web']）＋ analyze プロンプトに「現職名はパラメトリック記憶=誤りと推定。検索結果の名前のみ・出典日付付き・未確認なら未確認と明言」。
- **タブ名**: Stats→Data→**Countries**（5言語: 国/Länder/Страны/Países。5候補からの指名判断: 内容=国別データそのもの、Statesは米州と紛らわしく、Nationsは政治的含意、Data/Statsは曖昧）。
- **Active layers ✕**: hoverは×の文字が赤くなるだけ（赤丸廃止、チップ/一覧両方）。
- **ATLAS-VISION.md 新設**: Central OS宣言（20項目+6段階+最優先5項）全文と実装対応表。stateContextへAtlasピン/ポリゴン/ライン/計測/半径/ユーザーピン/右サイドバー/ティッカー状態を追加（vision §2）。

### R74 — プレビュー完全実データ化（再々報告の真の対象）＋レイヤー状態監査＋Atlas誠実化（件数・現職・リンクカード・凡例同期）
すべて当該ラウンドのユーザー報告への対応。ヘッドレス（localhost:8786 + ?rafshim=1）で全項目実測検証済み。
- **タイルプレビュー「一切変化なし」の真の対象**（「明らかに手抜きしたと思われる雑な描画、デザインのものが多い（追記：一切変化なし。）」）: R73が直したのはGIBS実タイルのURLバグだけで、ユーザーが指していた「雑な描画」は**手描きスケッチ約30枚**（風のベジェ波線、ECMWF一律グラデ、航空機/船のドット絵、等圧線・等高線の楕円、🕒/📷絵文字スタンプ）。今回それらを**そのレイヤー自身の種類の実データ**で置換:
  - **ECMWF全8フィールド＋風レイヤー2種** = Open-Meteo **一括1リクエスト**（8×12=96地点の現況グリッド、hourlyでcape/dew_point補完）→ 双線形補間の実フィールド（気温/露点/雲量/降水/CAPE/海面気圧）、**実ストリームライン**（風向風速で積分・速度色分け）、**実等圧線**（6hPa等値線+実H/L位置）。グリッド域外（>66N/<-47S）は描かない（クランプ外挿の縦縞アーティファクト対策）。
  - **オーロラ** = NOAA SWPC OVATION実オーバル（レイヤーと同一フィード）／**火災** = NASA FIRMS WMS実検知（前日）／**航空機** = airplanes.live実位置（中欧250nm、高度色分け・機首方位の実三角）／**注目度ヒート** = window.newsFeaturesの実ニュース座標／**海底ケーブル** = TeleGeographyの実ジオメトリ（このエンドポイントはCORS不可 → レイヤー本体と同じ**プロキシラダー**必須と実測）／**道路** = Esri World Transportation実タイル×2（LAフリーウェイ網、2度描きで輝度確保）／**EC-SST** = GHRSST実タイル（太平洋クロップ）。
  - スケッチ継続はライブ標本が存在しないものだけ（船=ユーザーキー必須のAIS）で、それも実航路+船首三角+チョークポイントグローに刷新。タイムゾーンは実UTCオフセット帯+ラベル、ウェブカメラはカメラグリフ（絵文字廃止）。
  - **全painterはライブ失敗時に旧スケッチへフォールバック**。実測: サイドバー135タイル中123実画像（残りはWBレート制限保護の1件/350ms遅延コロプレスで順次充足）。**NDVI 8日合成は「期間境界かつ直近」の日付しか配信されない**（2024年の境界日も404、2025-06-26はOK — ライブプローブで決定）。
- **「レイヤーのオンオフが実情と対応していないことがある」= IntMapLayerAudit 新設**: チェックボックス→実スタイルレイヤーの対応表（dl-*クラシックエンジンの静的表 + `_registerLayerOpacity(cbId,layerIds)` 経由の動的登録=gx-/bx-/NATO/EU/webcams/heat等）を15秒毎に照合。(a) **ONなのに1枚も描画されていない** → 2回連続検出で人間と同じ「OFF→ON再トグル」を1回（レイヤーごと4分に1回まで。radar系のように失敗時に自らチェックを外すエンジンとは自然に整合）。(b) OFFなのに可視 → 直接hide（R41ハートビートが先に勝つことが多い=冗長安全網）。`window.IntMapLayerAudit.{run,check,log}` 診断（vision §17）。**stateContextのLayers ON行に `[NOT painted on the map]` を付与** — Atlasが未描画レイヤーを「表示中」と言わない（vision §2/§16）。ヘッドレス実測: pop-fillを故意にremoveLayer→2回のrun()でrearm→再描画・ログ記録を確認。
- **返答内コントロール「凡例等との同期ができていない」の根**: R72/R73のトグル/スライダーは `data-layer=ラベル文字列` を**クリック/同期のたびにresolveLayerであいまい再解決** — アクションが実際に切り替えた行と別の行に着地し得た。→ 生成時に **`data-cb`（実チェックボックスID）** を焼き込み、`_ctlLayer()` がID解決を最優先（ラベルは旧返答の後方互換のみ）。実測: 偽ラベル+data-cb=dl-popのトグルをクリック → 正しいチェックボックスON・**凡例display:block**・pop-fill実描画、外部OFF→ウィジェット/凡例とも即同期。
- **「まだ現在の首相名等を間違えている」= 検索頼みを卒業して決定的データを注入**: analyzeが現職質問（office語の広域正規表現、質問文からの国名抽出つき）を検知すると **Wikidata SPARQL P6（政府の長）/P35（国家元首）をライブ照会**（ISO3 VALUES、ja/enラベル、9秒abort）し、`[CURRENT NATIONAL LEADERS (Wikidata LIVE query)]` ブロックとして注入。プロンプトは「このブロックが記憶と矛盾したらブロックが勝つ」。実測: JPN=高市早苗/徳仁、DEU=メルツ/シュタインマイアー（日本語ラベル）。＋localPlanの現職パターンに国名をcountriesで伝搬、**「〇〇の首相って今誰だっけ？」型の緩いパターン**（office語×誰語×80字以内）も決定的にanalyze(web)へ。＋**TIMEVARガード**: AIプランが時変質問（最近/現在/首相/news等）にanswerのみで返したら、その場でanalyze(web)に強制昇格（「ニュース機能だけに頼らずリアルタイム検索も行え」の最終防衛線）。
- **「10件と言って7件」= mapReportの件数誠実化**: ①SYSに `count` 引数（「10件表示して」→count:10）＋トピック/直近メッセージから「N件/top N/N incidents」をパース。②プロンプトに「ユーザーはN件要求 — 実在するならN件見つかるまで検索」+ **overviewでの件数言及を禁止**（UIが実数を決定的に表示するため、数の齟齬が構造的に起きない）。③不足時は**追い検索を1回**（既出リスト提示・重複除外・座標近接dedupe）。④なお不足なら「⚠ 要求はN件でしたが、2回の検索で実在を確認できたのはM件です（一般論での水増しはしていません）」を決定的に表示。⑤N超過分はsliceでN件に。
- **「記事のリンク等をChatGPT風UIで」= linkCards()**: ファビコン（Google s2 favicons）+記事タイトル+ドメインの角丸カード列（.atl-lc、ホバーでアクセント枠、モバイル幅対応のellipsis）。適用: ①mapReportの全記事URL（項目リストの下にカード列）②analyzeは末尾 `SOURCES: url1 | url2` 行（**実在URLのみ・捏造禁止・無ければ行ごと省略**をプロンプトで強制）をパースしてカード化、本文からは除去 ③answerのMarkdownリンク `[title](url)` をmdMiniが安全なアンカーとして描画（href/テキストはesc済み、rel=noopener）。CSS実測（borderRadius 11px/flex/10.5px）。
- **Privacy/Sources 更新**: Sourcesに **airplanes.live**（レイヤー+プレビュー。**旧OpenSky記載はコード実態に合わせ置換** — 層は以前からairplanes.live）と **NOAA SWPC**（オーロラ/K指数）を追加、Esriに World Hillshade/Transportation、Wikidataに現職ライブ照会を追記。Privacy §4（EN/JP）に Wikidata現職照会（国コード送信）と favicon取得（出典ドメイン名がGoogleへ）を追記。
- **環境メモ**: 起動直後のseedタブ（rafshimなし）は既知の「wedged renderer」でnavigate/eval全滅 — 新規タブ+?rafshim=1は即健全。検証はすべて新規タブで実施。プレビューのIO遅延分は `IntMapLayerPreviews.kick()` で強制発火（ヘッドレスはIntersectionObserverが発火しないことがある）。

### R75 — Central OS第五段階の実装（vision §10 関係探索・§11 影響分析・§13 独自レイヤー生成）
ビジョン文書（ATLAS-VISION.md）の第五段階3項目を、ハリボテなしの実データ実装で追加。全てヘッドレスで実測検証済み。
- **`scoreMap`（§13 独自レイヤーの生成）**: 「家賃・所得・治安…から評価して」型の要求に対し、**複数指標の加重合成スコアで全世界を新規に色分け**する。components = 同梱指標（METRICS+XMET: pop/density/area/gdp/gdppc/hdi/dem/milSpend/milSpendGDP/tfr/lifeExp/internet）または**任意のWB指標コード**（`{"wb":"SI.POV.GINI","invert":true}` — 実在しないコードは黙って捏造せず「取得不可」として明示スキップ）。正規化=5–95パーセンタイルクランプ（外れ値1国で他が平坦化しない）+log指標は対数、invert=低いほど良い、**総重み60%未満の国は除外**（除外数を表示）。出力: 実コロプレス（nlq-choro/feature-state、検証: NOR=1.0/JPN=0.87）+グラデ凡例+Top/Bottom+**算出方法の完全開示**+「会話で調整可」の案内。stateContextに「カスタム評価で着色中・調整はscoreMap再発行」を追加（フォローアップの「家賃を重視して」が同じ文脈で機能する）。実測: HDI×2+GDPpc+民主主義+Gini↓ → ノルウェー/アイスランド首位・181か国評価・60か国除外・偽コードskip報告。
- **`explore`（§10 地理的な関係の発見）**: 対象指標×全指標の**Spearman順位相関+Pearson**（対数分布指標は対数変換、n≥25のペアのみ）を全カ国実データで計算し、|ρ|順に提示。各行にρ/r/n/**最大の例外国**（回帰標準化残差最大=反証材料）と強弱ラベル。**因果断定禁止・交絡の可能性・例外国の使い方**を注記（vision §10の「確認できた関係/考えられる説明/反証/限界」の分離）。実測: 出生率→HDI ρ=-0.85(n=176)・平均寿命-0.76・1人当たりGDP-0.76・ネット利用率-0.67・民主主義-0.62、例外=コンゴDR/ソマリア/ニジェール。**tfr等の遅延フィールドはWB一括mrnevでオンデマンド補充**（`_WBFILL`: tfr/lifeExp/internet — R70の「countryStats.tfrはレイヤー初回フェッチ後のみ」問題をAtlas側で解消。逐次awaitでWBスロットル回避）。
- **`impact`（§11 地理的影響の分析）**: 地点（place/座標/deixis）または **event:"quake"**（USGS当日フィードから「直前に参照した場所に最も近い地震、無ければ当日最大」を自動選定）を中心に、半径km内の**実重要施設**（OSM Overpass: nuclear/dam/port/airport/hospital/military/power、既存POIエンジンのミラーレース+liteリトライ再利用）+**実人口都市**（OSM populationタグ、上位都市と合計 — 「周辺人口≈2,000万」級の実数）+**週間地震**（USGS、半径内件数と最大M）+周辺ニュース+国の人口密度を収集し、**半径円+クリック可能ピンを描画**して視界をフィット。距離は全てハバースイン実測でピン/本文に明記。出典行（OSMの地域差・USGS・IntMap統計）を常設。実測: 東京250km/nuclear → **東海116km・浜岡188km・福島第二214km（全て実在・実距離）**+人口≈20,028,054（東京13.6M/さいたま1.2M/浜松797k）；「この地震の影響を分析して」→ 当日最大のM5.4サウスサンドウィッチ（1時間前）を自動選定し「施設0・都市0」を正直報告。
- **教訓（実測）**: ①Overpassは**同一IPからの並列リクエストを拒否** — 施設レースと並走させた都市クエリは全ミラー失敗、単独では200/173KB。都市クエリを施設完了後の逐次に変更して解決。②都市0件は「失敗」ではなく実答（外洋）— 成功空応答とエラーを区別。③VMET（指標名→キー変換表）はlocalPlan内のconstだった → モジュールスコープへ移動（_metSpecが共用）。
- **配線**: SYSに3アクション追加（scoreMapの再発行ルール・exploreの因果注意・impactのevent:"quake"含む）、localPlanに決定的アンカー（「Xと相関する指標を探して」「この地震の影響を分析して」「Xの周辺影響分析」＋EN同等）、`IntMapConsole.dispatch` を診断用に公開（vision §17）、ATLAS-VISION.md実装表を§10/§11/§13/§16/§17行で更新。

### R76 — Central OS第四段階の着手（§6 出来事単位のニュース）＋§3 構造化ワーキングコンテキスト
- **`events`（§6 記事ではなく出来事を扱うニュース）**: 読み込み済みニュースを**イベント単位に決定的クラスタリング**する新アクション。同一イベント判定 = 位置≤150km × 時間差≤48h × 見出しトークン類似（Jaccard≥0.15。**CJKは文字バイグラム**で日本語見出しも束ねる。≤30km×≤24hの密なペアは閾値緩和）。Union-Findで纏め、記事数→新しさ順に上位N件（既定8）を表示。各イベント: 最新見出し・地名・**記事数と媒体一覧**・時間スパン（最初→最新）・**「最初の報道」表示**（§6の「最初の報道から何が変わったか」の決定的第一歩）・記事リンク＋リンクカード・**ピンは記事単位でなくイベント単位**（クリックで移動、atl-rp-item共用）。place/hoursパラメータ（場所絞り込み=placeExtent box、期間6〜168h）。手法を正直に開示（機械的クラスタリングである旨、相違分析は「2番の出来事を分析して」でanalyzeへ）。SYSに登録（mapReport=新規Web調査との使い分け明記）＋localPlanアンカー（「最近の出来事をまとめて」「Xの出来事をまとめて」+EN）。実測: 37記事→33イベント、最大イベント=ホルムズ海峡（CNN+CBS 3報道、15h前→2h前、最初の報道付き）・台風Bavi（Reuters/DW/AP 3報道）、ピン8・カード3描画。
- **構造化ワーキングコンテキスト（§3）**: `_wctx = {countries, topic, metrics, scoreComponents, period}` を新設。**成功したアクションから決定的に更新**（recordTurn経由: compareStats→countries、analyze/mapReport/impact→topic、rank/mapMetric/explore→metrics(直近4件)、scoreMap→**現在のレシピJSON**（「家賃を重視して」の再発行が正確な現行構成に対して働く）、timeTravel→period、reset/clearAllでレシピ破棄）。buildPromptに `[WORKING CONTEXT]` ブロックとして注入（「それ/同じ条件はこれに対して解決せよ」と明記）。`IntMapConsole.wctx()` で読み取り専用スナップショット公開（§17診断）。実測: 「日本と韓国とドイツを比較して」→ wctx.countries=[日本,韓国,ドイツ]・比較ウィンドウ表示。

### R77 — UI全体×Atlasの完全統合（「IntMapのUIすべてとAtlasが統合されるように」/ vision §1・§2・§17・第六段階）
方針: 宣言ではなく**実測**。全インタラクティブ要素を列挙し、Atlasが名前で到達できない要素を数え、ゼロにする。
- **ベースライン実測**: インタラクティブ要素538個中、**192個がアクセシブルネーム無し**＝どのAtlas経路（control/カタログ/モジュール）からも到達不能。内訳: レイヤー行の★お気に入り128・凡例閉じる✕21・日付入力（dl-date）・不透明度スライダー・無名チェックボックス・close系ボタン・GeoJSONインポートfile input。
- **命名スイープ `_uiNameSweep()`**: 各要素の**実文脈から aria-label を導出** — ★→「favorite: <レイヤー行の実テキスト>」、透明度→「opacity: <行>」、日付入力→行または**凡例ID**（dl-dateは.lyr-rowでなく凡例内に居る）、凡例✕→「close legend: <凡例見出し（⋮⋮ドラッグハンドルをスキップして実文字を取得）>」、×/✕だけの無名ボタン→「close: <最寄りのid付きコンテナ>」、file input→accept種別、無名チェックボックス→行テキスト。`_ctlLabel` は aria-label を既に読むため、**命名＝即 findControl で到達可能**。ブート3.5s後＋**20秒間隔で再実行** — 遅延生成される凡例や**将来追加されるUIも出現した瞬間に自動統合**（§17/第六段階の構造）。
- **doControl の date/month 対応**: 日付レイヤーの日付変更が今まで不可能だった（click()にフォールバック）→ value設定＋input/changeイベント＋**受理検証**（範囲外は正直に失敗）。実測: `{"type":"control","target":"date: temp","value":"2023-06"}` → 実inputが2023-06になりタイル再構築。「favorite: Place names」→ ★が実際にトグル。SYSに到達パターンを明記（favorite:/date:/close legend:/opacity:）。
- **`IntMapUIAudit`（常設§17診断）**: `run()` = スイープ→全列挙→カバレッジ%と無名リスト。**実測: 命名判定を「2文字以上の最初の候補」に直した後（★1文字がaria-labelを覆い隠す測定バグ）、100%（481/481）**。
- **stateContext 完全化（§2）**: アクティブタブ（news/info/countries/community）、**開いているパネル**（Settings・地図比較・統計比較・ツールパネル・ウィジェット・相関ツール・調査パネル・Playground — `getClientRects()` 判定。**offsetParentはposition:fixedモーダルでnullになるため不可**と実測）、アクティブツール＋計測点数、**タイムトラベル有効時の明示**（「now/currentはリセットが必要かも」）、**日付レイヤーの現在日付**（`window._imLayerDates` ブリッジ — const が別IIFEで読めなかった）、検索ボックスの内容。実測: Settings+計測ツール+温度レイヤー(2026-04-01)が全て状態に出現。
- **教訓**: javascript_tool（ブラウザ拡張）は**isolated worldで実行**され、ページの`let`グローバル（toolMode/setTool）が見えない — 「未定義」に見えても、ページ内スクリプト同士では見えている。検証は必ずページの実経路（dispatch→clickId）で行う。

### R78 — ワークスペースモード（「動画編集ソフトのように自由にウィンドウを配置・リサイズできるモードを設定から」）
- **`IntMapWorkspace` 新設（設定 →「ウィンドウ・ワークスペース」、デフォルトはオフ=従来レイアウト完全維持）**: オンにすると **左パネル・地図・レイヤーサイドバー・右上の地図コントロール群**がそれぞれ本物のデスクトップ風ウィンドウになり、何もない空間（ドット方眼のワークスペース背景）に完全自由配置できる。
  - **ウィンドウクローム**: タイトルバー（アイコン+名前、ドラッグで移動、ダブルクリックで最大化）＋ macOS風トラフィックライト3ボタン（赤=隠す／黄=タイトルバーに折りたたみ／緑=最大化⇄復元）— 配色はアプリのiOSガラス変数（--card-bg/--input-bg/--glass-border）なので全テーマ・ライト/ダークに自動追従。
  - **移動・リサイズ・前面化は既存のR47ウィンドウマネージャを再利用**（makeDraggable=タイトルバードラッグ、addEdgeResize=全辺・全コーナーのハンドルレス リサイズ、registerWindow=クリックで前面へ）— Atlasパネルと同じ操作感で統一。
  - **下部ドック**: 各ウィンドウの表示/非表示トグル（非表示はdim表示）＋「⟲リセット」（初期配置に戻す）＋「✕終了」（通常レイアウトへ・設定セレクトも同期）。capture-mode（スクリーンショット時）とモバイルでは非表示。
  - **レイアウト永続化**: 位置・サイズ・非表示・折りたたみ状態を localStorage（intmap_ws2）に保存し、リロード時に自動復元（実測: リサイズした438px幅が復元）。**地図はResizeObserver+map.resize()で常に追従**（実測: コーナーリサイズでキャンバスがdpr換算まで正確に追従）。
  - **完全に加算的**: 有効化時に各要素の元DOM位置へ**プレースホルダーコメント**を挿してからラップ、無効化時はそこへ戻すので、復元は順序非依存で完全（実測: .operation-room の子順 sidebar→map-container→layer-sidebar-r が復元、controls も map-container 内に帰還）。#btn-toggle-sidebar / #lsr-toggle はws中のみ非表示、レイヤーサイドバーは未ビルドなら有効化時にビルド。
  - **デスクトップ専用ガード**（≤768pxはトースト＋不許可。ヘッドレスタブは675px起動なので必ずresize_windowしてから検証 — 実測でガード自体も確認）。
  - **Atlas統合（standing rule）**: モジュールレジストリが自動発見（IntMapWorkspace.open/close/toggle）、localPlanに「ワークスペースモードをオン/オフにして」(+EN) の決定的アンカー、stateContextに「WORKSPACE MODE is on…」行（実測: Atlas経由のオフ→DOM完全復元）。設定セレクト（#setting-wsmode、5言語i18nキー）も命名済みでcontrol到達可。
- **検証（全て実測）**: 4ウィンドウ生成/デフォルト配置、ドラッグ(-200,+163)、折りたたみ37px⇄復元、隠す→ドックdim→再表示、最大化1426×846⇄復元、右エッジ+92px・コーナー(-154,-114)リサイズ、リロード後の自動復元、Atlasオフ、モバイル無効、コンソールエラー0、129レイヤー行無傷。

### R78b — ワークスペースの本物のウィンドウ機構化（「移植しただけの雑なUIはやめろ」への全面回答）
すべて当該報告への対応。ヘッドレス1440×860で全機構を実測検証。
- **「隣接判定機構がない」→ 専用ドラッグ/リサイズを新規実装**（makeDraggable/addEdgeResizeの流用をやめ、ワークスペース専用の機構に）:
  - **磁着スナップ**: ドラッグ/リサイズ中、ウィンドウの各辺が「画面パディング(12px)・他ウィンドウの全辺」に8px閾値で吸着し、**アクセント色のガイド線**を表示。整列（左揃え・上揃え）と**密着（辺と辺の隙間ゼロ）**の両方に吸着。実測: ガイド線表示・右辺が地図左辺へ正確に密着・上端整列。
  - **「境界線で調節する機構がない」→ 共有境界スプリッター**: 純粋な辺ドラッグ（e/w/n/s）の掴んだ瞬間に**隣接検出**（反対辺が4px以内・重なり40px以上の全ウィンドウ）を行い、境界を動かすと**両側が同時にリサイズ**（動画編集ソフトのパネル境界と同じ）。双方のminサイズでクランプ。**box-sizing:border-box を .ws-win に指定するまで境界が2pxズレた**（style.width=content幅 vs offsetWidth=+border）— 指定後は実測 linkedExact=true（片側+80px、反対側右辺は1pxも動かず）。
  - コーナードラッグは単独リサイズ＋スナップ。リサイズ中も地図は fitMap() で追従。
- **「ティッカーが覆い隠されてる」→ ティッカーもウィンドウに**: #ticker-bar を第5のウィンドウ化（既定は下端スパン・ドック回避幅）。**follow機構**: ティッカー自体のオン/オフ（IntMapTicker）にウィンドウが2.5s以内に自動追従（実測: off→自動非表示）、ドックのティッカーボタンは**実ティッカーをONに戻して**再表示（ハリボテの空ウィンドウを見せない）。ワークスペース有効中にティッカーを初めてONにしても**遅延スキャン(2.5s)が自動でウィンドウ化**＋ドック再構築。デフォルト配置もティッカー分の高さを確保（他ウィンドウはその上で終わる）。
- **「そのまま移植したような汚いUI」→ 二重クロームの除去**: `.ws-body>*` の box-shadow/border-radius を全停止（ウィンドウ枠こそがクローム）、レイヤーサイドバーの重複ヘッダー（lsr-head「▤ Layers ✕」）をws中は非表示（検索は残す）、ティッカーの上border・背景を除去、右上コントロール群は縦stretch配置に整列（margin殺し）、サイドバー背景を透過してウィンドウ地と一体化。
- **「三つのボタンはMacのようにホバーで形が出る感じで」**: トラフィックライトは静止時プレーンな色ドット（::beforeグリフ opacity:0）、**ドット群にホバーすると ×/−/+ が出現**（実測: rest opacity=0、コンテンツは "×"）。押下時は brightness減。
- **ドックは右下へ移動**（ティッカーの下端スパンと干渉しないように。従来の中央下から変更）。
- 実測サマリ: 5ウィンドウ生成、スナップ吸着+ガイド線、共有境界の連動リサイズがピクセル完全、ティッカーfollow往復、無効化→ティッカー含む完全DOM復元、モバイル無傷、コンソールエラー0。

### R78c — ワークスペース再々修正（全指摘への実測対応）
- **「ティッカーはウィンドウとして分離するな。画面外の最下部に固定」**: ティッカーウィンドウを廃止。ws中は `#ticker-bar` を **position:fixed で画面最下端に全幅固定**（z=5985、ウィンドウより上）。デフォルト配置とスナップ候補・ドラッグ範囲はティッカー分（30px）を確保。実測: fixed/bottom:0/幅1440/ウィンドウ外。
- **「操作パネルを新設するな。上部から、ソフトのように選択できるように」**: 地図コントロールウィンドウを廃止（`.map-controls-top` は地図ウィンドウ内の本来の位置のまま）。右下ドックも廃止し、**上部メニューバー #ws-menu** を新設 — 「IntMap — ワークスペース」ブランド＋**「ウィンドウ ▾」ドロップダウン**（✓付き表示/非表示リスト＋配置をリセット）＋右端「ワークスペースを終了」。本物のアプリのメニューストリップ様式（フラット・ホバーハイライト・外側クリックで閉じる）。
- **「デフォルトの各ウィンドウの配置位置がおかしい」**: メニュー下（y=46）〜ティッカー上（H−40）に **[パネル340 | 地図(残り全部) | レイヤー~300] が全て辺で密着するタイル配置** — 共有境界スプリッターが初期状態から機能。実測: abut1/abut2=true・3枚同高。
- **「地名検索バーが明後日の方向」「マップの中央にマップが来ない」の共通根因（実測）**: `#map-container` の幅がアプリ本来の `calc(100vw−サイドバー幅…)` 系ルール（bodyクラス連動）で**38pxに崩壊**していた。ws中は `width/height:100%!important` で常にウィンドウを充填。実測: 468px（=窓幅−border）充填・検索バーはマップウィンドウ矩形内。
- **「リサイズしたら一部がただ隠れる」**: `.sidebar`/`#layer-sidebar-r` の height:auto!important が原因（中身が窓より高いままクリップ）→ **height:100%!important**（窓に追従し内部スクロールが働く）。実測: 窓500pxに縮小→サイドバー463px=ボディと完全一致。
- **「ウィンドウ名の欄に絵文字を付けるな」**: タイトルバー・メニューとも絵文字全廃（Panel/Map/Layers のプレーンテキスト）。
- **「layersウィンドウが機能していない」**: 上記38px崩壊とレイアウト崩れの複合症状 — 修正後に実測: NATOタイルクリック→実チェックボックストグル＋✓同期、マップクリック後も129タイル表示のまま生存。
- 終了で通常レイアウト完全復元（子順・ティッカーposition:relative復帰）・コンソールエラー0。

### R78d — ワークスペース激怒対応（コントロールを上部メニューへ・検索/黒画面の根治・利用可能ウィンドウ増）
すべて再々報告への直接対応。1440×860で全項目実測。
- **「マップ右上のボタン類がマップウィンドウに再びある。勝手に戻すな」**: ws中は `.map-controls-top` を display:none（マップから撤去）。代わりに**上部メニューバーに View / Tools メニューを新設** — View=地図/衛星/地球儀/平面/3D地形（実active状態を✓表示）＋北を上に、Tools=距離計測/描画/半径/スクショ/共有/Atlas/グリッド。各項目は実ボタン(btn-view-map等)をidでclickするので挙動は完全一致（実測: Satellite選択→btn-view-sat active化）。「ソフトのように上部から選択」を実現。
- **「検索バーが明後日の方向に飛んでいく／今もつぶれている」の根治**: 原因は `#map-search` の応答的CSS群（absolute中央寄せ＋`body.ms-narrow`のposition:fixed＋viewport基準の--ms-right＋ms-hide）と、それを駆動する**ms-narrow監視ループ**（ビューポート基準で計算）。ws中は (a) 監視ループを早期return（ms-narrow/ms-hide除去）、(b) `#map-search` を map-container内の左上に固定配置(absolute/left12/top12/width min(330,100%-24))で上書き。実測: マップウィンドウ矩形内・幅348px・つぶれず。
- **「レイヤーウィンドウがいきなり真っ暗になる」の根因**: `IntMapLayerSidebar` は**マップクリックで自動close**する(open._mapCloser、R72)。closeは transform:translateX(102%)+visibility:hidden で右外へ押し出す→ウィンドウ内では中身が消えてダークな窓地=真っ暗。ws中は **close()を早期return**（自動で閉じない）＋enableで transform/visibility/pointerEvents をクリアして open。実測: マップクリック後も visibility:visible/transform:none/129タイル。
- **「利用可能ウィンドウが少なすぎる」**: News と Countries は同一 `#live-news-feed` を共用のため分離不可だが、**Information(`#info-dashboard`) と Community(`#community-feed`) は独立divなので各々ウィンドウ化**。既定は非表示だが **Windowメニューに列挙（✓付き表示/非表示）** で「利用可能」＝いつでも開ける。開くと実divを引き込み onWrap で renderDashboard/loadCommunity を実行し中身描画（実測: Information窓にPlaces/Events/Military…、Community窓にfeed 2件）。表示状態は保存(vis map)。計5ウィンドウ Panel/Map/Layers/Information/Community。
- **絵文字全廃**（前回残っていたタイトル用アイコンを削除。Panel/Map/Layers/Information/Community のプレーンテキスト）。
- 既存機構は無傷: ティッカー最下部固定(bottomGap 0・全幅・非ウィンドウ)、共有境界スプリッター(側+70/地図右辺不動/地図左辺追従=ピクセル完全)、終了で完全復元(operation-room子順・コントロール帰還・info/community帰還・ticker relative)、通常モードでinfo/community非表示、コンソールエラー0。

### R78e — ワークスペース再々々報告の全項目根治（重複ヘッダー・地図中心・隙間・タイトルバー・設定UI・News/Countries分離・ブランド・レイヤー例画像）
1440/1280×検証、全項目実測。
- **「IntMap/ログイン/言語/フィードバック/設定がパネルに残り上部と重複」**: ws中は #sidebar（ヘッダー＝タイトル/言語/ログイン/フィードバック/設定＋タブボタン）を display:none。ログイン/フィードバック/設定は**上部メニューの直接ボタン**（実 #btn-account/#btn-feedback-hdr/#btn-open-settings をクリック）に集約。重複解消。
- **「地図ウィンドウの中央に地図の中央が来ない」= 実測根治**: フロステッド・サイドバーモードが `map.setPadding({left: サイドバー幅})` を設定し光学中心を右へずらしていた（ウィンドウ内では無意味）。fitMap で padding を毎回ゼロ化＋ws中はpadding設定自体を抑止。実測: project(getCenter()) がコンテナ中心の±3px内。
- **「デフォルトでティッカー上端までウィンドウを伸ばせ」「上部と各ウィンドウ間に隙間」**: defRects を**エッジ密着タイル**に再設計（メニュー直下 top=34、画面端 x=0..W、ティッカー上端まで、隣接ゼロ隙間）。clampRect も x≥0/y≥34/下端ティッカーまで許容に緩和。実測: newsBottom==tickerTop、abut全true、layerRight==vw。
- **「タイトルバーの帯が太い」**: .ws-tb を 34→25px にスリム化（実測 26px）。
- **「設定を押すと『設定を開く』ボタンが出るクソUI」**: Settings/Feedback/Account はドロップダウンではなく**直接ボタン**（クリックで即座に設定モーダル等が開く。実測 settingsDirect=true・モーダル即開）。
- **「IntMapの文字を太字にするな・大きくしろ」**: ブランドを font-weight:400・17px に（実測）。「— Workspace」副題は非表示。
- **「NewsとCountriesを分離しろ」= 構造分離**: 両者が共用していた #live-news-feed を分割 — Countries用に **#countries-feed** を新設し、renderStats/renderUI/compare選択を新コンテナへ振替。ws中は News窓（検索バー＋フィルタ＋ジオコード行＋フィード＋リーダー）と Countries窓（#countries-feed）が**別ウィンドウ**。通常モードでもタブ切替で別コンテナに表示（実測: News=30記事・Countries=252国、両モードで独立）。
- **ウィンドウ構成刷新**: 旧「Panel」を廃し **News/Countries/Information/Community/Map/Layers** の6ウィンドウ（mkWinを複数要素スタック対応に。News窓は5要素を積層、終了時は各要素をプレースホルダーで元位置へ復元）。既定表示は News|Map|Layers のタイル、Countries/Info/Community は Windowメニューから開ける（利用可能）。
- **「手抜きレイヤー例画像がまだ多い」**: 地図系ベクタ層（境界/地名/水域ラベル/行政界/国）の手描きスケッチを**実CARTOタイル**へ置換（cb-names=東京の二言語ラベル、cb-geolabels=エーゲ海の海名、cb-borders=アルプス国境、cb-admin1=米大平原の州界、cb-countries=東南アジアの国形。@2xで高精細・各々別地域で画一感なし）。実測: 5件すべてCARTO実タイル適用・読込OK。
- 回帰: 共有境界スプリッター/スナップ/ティッカー最下部固定/終了完全復元/通常モードのタブ動作、すべて無傷・コンソールエラー0。

### R78f — ワークスペース仕上げ（パディング均衡・検索バー収め・News閉でピン/要約停止・Atlas窓・座標左下・カード圧縮）
- **News/Countriesの内容が左端ぎりぎり・右端とアンバランス / 検索バーが右にはみ出る**: 原因は `.content-area{margin-right:-10px;padding-right:10px}`（スクロールバー回避ハック）がウィンドウ内で右に10pxはみ出させていた。ws中は margin:0＋左右均等12px padding（box-sizing:border-box）に上書き。検索バー/フィルタ/ジオコード行も box-sizing＋左右12pxマージンで収める。実測: feed左右ガター0（内側12px均等）、検索バーはみ出しなし。
- **News windowを閉じても地図にニュースピン・要約ボタンが残る**: ウィンドウに **onHide/onShow フック**を新設（クローズボタン・Windowメニュー両方から発火）。News onHide=`news-points`ソースを空に＋要約ボタン非表示、onShow=`newsFeatures`から再投入＋要約ボタン復帰（setModeは同一モードで早期returnするため直接操作）。実測: 閉→ピン0・要約none、開→要約flex。
- **Atlas windowをつくれ**: DEFSに atlas を追加（既定非表示・Windowメニューに列挙）。mkWinに `def.ensure()` フック（要素生成を照会前に実行）を追加し、ラップ前に IntMapConsole.open() で #atlas-panel を生成。ws CSSでフローティング装飾を除去しウィンドウ充填。終了時はパネルを既定（非表示・位置クリア）へ。実測: Atlas窓=入力欄あり・トラフィックライトあり・384×494、終了で display:none復帰。
- **標高/座標の常時表示を地図windowの左下に**: #coord-readout は元から #map-container 内（position:absolute; bottom:16 left:16）なので、地図ウィンドウの左下に正しく表示（実測: 地図窓左17px・下17px）。ws中も維持されることを確認。
- **ニュースカードが上下に冗長**: ws中の .news-item を padding 16→9px・角丸圧縮・タイトル上マージン圧縮・feed gap圧縮。実測: カード高 133→113px（同画面あたりの表示件数増）。
- 回帰: 全ウィンドウ生成・タイル配置・スプリッター・終了復元・コンソールエラー0。

### R78g — ニュース窓の中身が「見えない」実測根治＋座標表示の明示ピン
- **「ニュースウィンドウのなかみ自体見えなくなった」= 実測根因**: ダークテーマで **ニュースカードの背景(--card-bg #1c1c1e)がウィンドウ背景(--card-bg #1c1c1e)と完全に同一色**、かつカード境界が8%不透明のみ → カードが窓に完全に溶けて中身が見えなかった（R78bの脱クローム＋窓地=card-bgの副作用）。**謝罪案件**: 前回「実測で左17px/下17px」と報告したが、それは座標表示の話で、ニュース中身の視認性は測っていなかった。根治: コンテンツ窓(news/countries/info/community)の背景を **--bg-color（土台色/ダークは黒）** に変更し、--card-bgのカード/行を浮かせる＋カード境界を26%に強化＋薄い影。実測: 窓背景 rgb(0,0,0) ≠ カード rgb(28,28,30)、30記事・252国行が明確に視認可能。
- **座標/標高表示のピン明示**: 実測で offsetParent=#map-container・地図窓左端(x=320)+13px・下13px = **地図ウィンドウの左下**に正しく配置されていることを確認（前回の指摘は中身不可視で全体不信になったため）。念のため ws中は `#coord-readout` を absolute/left12/bottom12/z950 で明示ピン（他ルールに勝つ）。通常モード同様、地図ホバーで表示。
- 回帰: 7ウィンドウ生成・コントラスト（全コンテンツ窓）・コンソールエラー0。

### R79 — ワークスペースのニュース根治／レイヤーON-OFF照合の高速化＋土台層カバー／Atlasの実記事ソースカード
- **「まだワークスペースモードでニュース表示されてないぞ」= 実測根因を特定して根治**: News窓の `onWrap` が `setMode('news')` を **btnIdなし**で呼んでいた。`setMode(mode,btnId)` は `currentMode=mode` を設定した直後に `document.getElementById(btnId).classList.add('active')` を実行する → btnId=undefined で `getElementById(undefined)=null` → **throw**。その throw が onWrap の try/catch に飲まれ、`renderUI()`（=`startNews()` を呼ぶ本体）に到達しない。結果、globalData には記事があるのにフィードが空のまま（冷間起動時）。フィードを描画する唯一のトリガ `if(currentMode==='news') startNews()` は、AI解析ではなくRSS/キャッシュの遅延到着に依存する脆い経路だった。**決定的修正**: onWrap を「既に news/saved なら `renderUI()`、それ以外は `setMode('news','btn-news')`（実在ボタンID付き）」に。加えて globalData 未取得時は `fetchData()` を蹴る安全網。実測（自動起動→1400ms auto-enable の冷間起動を再現）: 修正前 newsItems=0 / innerHTML長0 → 修正後 **newsItems=30・scrollHeight 3618・スクロール可**。窓レイアウトも News[0,34,360,866]|Map|Layers がぴったりタイル。
- **News reader-pane のはみ出し予防**: 同窓に積層される #news-reader-pane にも `.content-area` 由来の `margin-right:-10px`（スクロールバー回避ハック）が残っていた → ws中は margin:0＋左右12px paddingに上書き（記事を開いた時に窓右端を越えないように）。
- **「レイヤーのオンオフが実情と対応していないことがある」= 監査を"遅い"から"即時"へ＋土台ベクタ層もカバー**: 既存の `IntMapLayerAudit`（R74）は正しいが 15秒周期＋2回連続検出（=最悪30秒）でしか治らず、その**遅延窓**こそがユーザーの見る不整合だった。ヒール処理は一切変えず**トリガ点を追加**: 地図が落ち着いた直後（`map.on('idle')` を1.2秒デバウンス＝全エンジンの styledata 再追加が済んだ後）＋タブ復帰時（`visibilitychange`）に同じ audit() を実行。さらに、**最も目立つのに未監査だった土台ベクタ層**（cb-names/cb-geolabels/cb-borders/cb-countries/cb-admin1/cb-roads/cb-rail2 → 実レイヤーID表 BASE を新設）を対象化。土台層のヒールは冪等ハンドラを利用し **change を1回だけ再発火**（ラベル全体の off→on 明滅を避ける）。実測: 修正後 `IntMapLayerAudit.check('cb-names')` は null ではなく boolean を返す（=カバー確認）、`check('dl-pop')` も boolean、run() は throw せず、129行・コンソールエラー0。
- **Atlasの返答に実記事リンクをChatGPT風カードで（ハリボテ廃止）**: 従来カードは AI が末尾に `SOURCES:` 行を吐いた時だけ出る脆い実装だった。根因は収集器 `_newsData`/`_gdeltNews`/`_gnewsNews` が **記事の実URLを捨てて**タイトル＋媒体だけをテキスト化していたこと（読込ニュースは `it.link`、GDELTは `a2.url`、Google Newsは `<link>` を保持しているのに）。**根治**: 3収集器に任意の `sink` 引数を追加し、供給した実記事 `{url,title,src}` を集める。`analyze` は AIの回答後、その実記事集合を **AIが明示引用したURLを先頭に**並べて `linkCards` 描画（引用が無くても記事が使われていれば必ずカードが出る）。`brief` にも同じソースカードを追加（`events`/POI は既に linkCards 済み）。ChatGPT風の "Sources" 見出し（`.atl-src-h`）を追加。外部エンドポイントは新規追加なし（GDELT/Google News/faviconサービスは既に Privacy§4/Sources に開示済み）→ 法務/出典の変更不要。実測: `events` dispatch が実 `atl-lc` カードを描画（69記事→66イベント）、全編でコンソールエラー0。
- 回帰: 冷間起動のワークスペース（News=30記事・7窓生成・タイル配置）、129レイヤー行、Atlas起動、コンソールエラー0。法務日（LEGAL_DATE 2026-07-11）据置。

### R79b — ワークスペース再報告7点の実測根治（既定配置・簡単リサイズ・Atlas/国窓・ニュースピン漏れ）
- **「ニュースウィンドウがオンになってないのに勝手にマップ上に現れる」**: News窓は既定非表示になったが、mkWinのonWrap（setMode→startNews）は生成時に一度走るため、非表示でもピンが地図に出ていた。根治: (1) `_wsNewsHidden()`（ws中かつ .ws-news が display:none）を単一の真実源に、`startNews()` のピン投入を `_wsNewsHidden()?[]:newsFeatures` でゲート、(2) enable() が「開始時に非表示の窓」に対して onHide を実行（News窓のピン+要約ボタンを消す）。実測: 起動時 wsNewsHidden=true・要約ボタン none、News窓を開く→false、閉じる→true。
- **「ウィンドウのリサイズがやりにくい。ドラッグアンドドロップで簡単に」**: 各窓の右下に**見える大きめのグリップ（.ws-grip, 22px, 斜線マーク）**を新設（wsGrip；min/画面内クランプ付きのSEリサイズ）、加えて不可視エッジ帯を M=8→11 に拡大。実測: 全窓にグリップ7個、ドラッグでリサイズ動作。
- **「動画編集ソフト風なんて表に書くな」**: 設定ヒント（wsHint）5言語＋HTML静的フォールバックから「動画編集ソフト風／Video-editor style」を削除し、機能説明に置換。
- **「Atlasのウィンドウのリサイズがうまくできない（入力欄が自由に動く）」**: 原因はAtlasパネル自身の makeDraggable/addEdgeResize（R47）がws窓内でも生きていて窓のリサイズと競合していたこと。`panel.closest('.ws-win')` の時は両ハンドラを早期return。さらに短い窓で `.atl-ex`（候補チップ列＝187px・非収縮）が入力欄を窓外へ押し出していたので、ws中は max-height:38%+overflow:auto に。実測: 入力欄は左ガター13px固定・幅は窓追従・窓を300pxに縮めても入力欄は窓内に残る。
- **「国ウィンドウの検索・比較機能が消えている」**: 共有 `#sidebar-search-bar` はNews窓へ移ったため国窓に検索が無く、比較ドック `#stats-compare-fixed` は非表示の #sidebar に取り残され、かつ `renderCompareFixed` が `currentMode==='stats'` ゲート（ws中は 'news'）で常に隠れていた。根治: (1) 専用 `#countries-search-input` を新設し国窓 sels に追加＋入力で renderStats フィルタ（5言語プレースホルダ）、(2) `#stats-compare-fixed` を国窓 sels に入れ position:static で窓下部に配置、(3) `_countriesActive()`（statsタブ or ws中に国窓が可視）で比較ドックを表示。実測: 「japan」で252→1件、クリア→252、2国クリックで比較ドックにチップ2個。
- **「デフォルトは 右上レイヤー／右下Atlas／中央地図／左Countries」**: defRects を刷新（Countries=左フル高、Map=中央、Layers=右上、Atlas=右下＝Layersと水平スプリッタで隣接）。既定表示は Countries/Map/Layers/Atlas、News/Information/Community は非表示（Windowメニューから開ける）。実測(1440×900): Countries[0,34 346×866]／Map[346,34 754×866]／Layers[1100,34 340×433]／Atlas[1100,467 340×433]。
- **「レイヤー窓の検索窓が上に余白なし・下が空きすぎ」**: ws中は .lsr-head 非表示なので `.lsr-search` の padding を 2px/10px → 12px/6px に。実測: 検索窓 上12px・下6px。
- 回帰: 129レイヤー行、クリーン既定の7窓配置、国検索/比較、Atlas短縮、コンソールエラー0。法務変更なし。

### R79c — 「比較機能死んでんぞ」実測根治＋タイムゾーン初期透明度50%
- **国比較（IntMapStatsCompare）が完全に不可視 = 実測根因**: 比較ビュー `#scp-view` は `#live-news-feed`（＝旧statsフィード）へマウントしていたが、国リストは R78e で `#countries-feed` へ移設済み。よって「国を比較」を押すと `#scp-view` は **Newsフィード**に描画され、Statsタブでは display:none、ワークスペースでは既定非表示のNews窓の中 → **比較が一切見えなかった**（通常タブ・ws両方で壊れていた）。根治: `IntMapStatsCompare.open()` のマウント先を `#countries-feed || #live-news-feed` に是正（renderStats・戻るボタンと同じ要素）、かつ **ws中はタブが無い**ので `btn-stats.click()` を実行しない（currentModeを勝手に'stats'へ変える副作用も回避）。実測(ws・クリーン既定): 2国選択→「国を比較」→ `#scp-view` が **Countries窓内**（countries-feed内）に可視描画（320×673・チャート有）、戻る→252行復元、コンソールエラー0。通常タブでも countries-feed が可視フィードなので同修正で解消。
- **タイムゾーンレイヤーの初期透明度を50%に**: `tzl-fill` の初期 paint を 0.15→**0.5**、かつ `_registerLayerOpacity` の既定値に `id==='tz'?0.5` を追加（従来は汎用既定0.85が120ms後に上書きしていた）。これで初期表示・不透明度スライダー既定とも50%に一致（保存済みユーザー値がある場合はそれを尊重＝`opacities.tz==null`ガード）。※ヘッドレスではjsDelivrのtz境界GeoJSON取得が完了せず凡例未生成のためコード検証（両経路とも0.5）。
- 回帰: 129レイヤー行、ws既定7窓、国検索/比較（表示までEnd-to-End）、コンソールエラー0。法務変更なし。

### R79d — ウィンドウ境界（最大化・リサイズをティッカー上端まで）＋国窓クローズで選択解除
- **単一の使用可能矩形 `wsBounds()` を新設**: top=メニュー下端(34)、bottom=**ティッカー上端**（`#ticker-bar` の実高さ。ティッカーが実画面最下部を占めるため＝「下端はティッカーであり実画面の下端ではない」）、left=0、right=画面幅。defRects / clampRect / xCands / yCands / wsResize / wsGrip / wsDrag / 最大化 の全てがこれを基準に。
- **最大化が画面外まで拡大されるバグ**（「画面に収まりきらないとこまで拡大される」）: 旧コードは left/top=8・width=innerWidth-16・height=innerHeight-16 でメニューに被り・ティッカー下（画面外）まで伸びていた。`wsBounds()` にフィットさせるよう修正。実測(ticker on, 1440×900): 最大化=x0,y34,right1440,bottom870（=ティッカー上端、画面下端900ではない）。
- **画面境界までリサイズできない/下端がティッカーでない**: エッジ resize（wsResize）に各辺のハード clamp（e→right, w→left, s→**bottom=ティッカー上端**, n→top）、グリップ resize（wsGrip）の縦 clamp を innerHeight-4→**wsBounds.bottom**、ドラッグ（wsDrag）のタイトルバー clamp を innerHeight-44→**wsBounds.bottom-28**、スナップ候補（xCands/yCands）も 10px インセット→実境界に。実測(ticker on): グリップで右下へ大きくドラッグ→bottom=870・right=1440 でクランプ。
- **国ウィンドウを閉じても countries が選択判定のまま**（「地図からわかる」）: Countries窓を**地図のCountry-infoレイヤー（cb-countries→country-fill/line）と連動**（通常のCountriesタブと同じ挙動）。`onShow/onWrap`＝country-info ON（地図で国ホバー/クリック可）、`onHide`＝country-info OFF＋`_clearCompare()`＋country-popup を閉じる。`window._wsCountryInfo(on)` 追加。実測: 窓表示中 cb-countries=true・比較2件選択→**閉じると cb-countries=false・比較0件・窓非表示**。
- 回帰: クリーン既定(ticker off) 4窓タイル [Countries0,34 346×866 / Map346 / Layers1100,34 340×433 / Atlas1100,467]、129行、コンソールエラー0。法務変更なし。

### R79e — 比較バーの潰れ／PCで国旗が出ない／通常サイドバーに紛れ込む"Filter countries"
- **Compare棒グラフが国窓の幅で潰れる**: 各行が 国名(固定118px)＋バー(flex)＋値(固定112px) で、既存の縮小規則は`@media`＝**ビューポート**基準。デスクトップで窓だけ狭いと効かずバーが潰れていた。`#scp-view` に `container-type:inline-size` を付け、**コンテナクエリ**で ≤430px→列幅圧縮、≤340px→行を折り返して「国名を上段・バー+値を下段」に段組み。実測(窓300px→scp-view 264px): 行がwrap・国名flex-basis100%・バートラック188px確保（潰れなし）。
- **スマホで国旗が出るがPCで出ない**: Windowsの絵文字フォントに国旗グリフが無く、地域指示子ペアが文字箱("US")で描画される。**Twemoji Country Flags webフォント（自己ホスト `TwemojiCountryFlags.woff2`・78KB）**を `unicode-range` で国旗コードポイントのみに限定して同梱し、canvasで「国旗が色付き描画されるか」を判定→ネイティブ非対応時のみ body の font-family 先頭に差し込む（スマホ/Macはネイティブ国旗のまま）。実測(ヘッドレス=非対応判定): フォント定義済み・`document.fonts.load`成功・`.stat-flag 🇺🇸` の computed font に "Twemoji Country Flags" 適用。Sources に Twemoji（CC-BY 4.0）追記、LEGAL_DATE→2026-07-12（外部送信データ増なし＝Privacy §4変更なし、同梱アセットの帰属のみ）。
- **通常モードのサイドバーに"Filter countries"が紛れ込む**: R79bで追加した `#countries-search-bar` にも class `.search-bar` があり、renderUI/`querySelector('.search-bar')` がws往復後にコレを先頭マッチ→通常モードで display:flex を書き込んでいた。根治: renderUI と 8698行を **`getElementById('sidebar-search-bar')`** に（共有バーをID直指定）＋ ベースCSSに `#countries-search-bar{display:none!important}`（ws内のルールは高詳細度＋!importantで勝つので窓内では表示）。実測: 通常モード＝none（Statsタブでもnone）、ws国窓内＝flex表示。
- 回帰: 129レイヤー行、ws既定4窓、国検索/比較(表示までEnd-to-End)、コンソールエラー0。

### R79f — 海洋zone蛍光ライン／既定は配置窓のみ／レイヤー例画像を実データ描画に差し替え
- **maritime zones（EEZ）の線が視認性悪い→蛍光ライン**: MarineRegions WMSの既定スタイルは境界種別ごとに暗色（濃teal/緑/茶）で海上で読めなかった。`addEEZ` で **inline SLD（SLD_BODY）** を渡し、全境界を1本の **ネオングリーン #39FF14** に再描画（curlで検証: 全境界ピクセルが#39FF14で返る＝WMSがSLD_BODYを honor）。凡例も多色種別リスト→**単一ネオンswatch（glow付き）＋種別を注記テキスト**に簡素化（「凡例もそれに応じて変えて」）。
- **「デフォルト状態で全部のウィンドウをオンにするのはやめろ」**: 既定は**配置窓（Countries/Map/Layers/Atlas）のみ**。オンデマンド窓（News/Information/Community＝defHidden）は**保存状態に関わらず常に非表示で起動**（開いた状態を永続化しない）→ 保存レイアウトに溜まって全窓表示になる事故を根絶。実測: vis全true汚染状態でも表示は4窓のみ。配置窓の開閉は従来どおり永続。
- **レイヤー例画像を実データ描画スクショに差し替え（「手抜き」根絶）**: PILで**各レイヤー自身の実データ**からオフライン描画・自己ホスト（web-mercatorでアプリと同投影）：①Ecoregions=RESOLVE ecoregions_2017.geojson の各ポリゴンを公式COLORで塗り（全大陸のバイオーム）②Tectonic plates=Peter-Bird PB2002_boundaries を実座標でネオン橙ライン（環太平洋・大西洋中央海嶺）③Wind=実海岸線上に全球流線（速度で配色）④Koppen=4k世界メルカトルPNGを**ヨーロッパにクロップ**（「ヨーロッパを写したスクショに」）＋黒海洋を暗色に⑤Base map & labels=実CARTO Voyagerタイル（仏・スイス＝国境+都市ラベル+水域）。`IMG{}`（into()で最優先）へ配線し、旧canvasスケッチ／omWindPaintを置換。実測: 5タイルすべて対応PNGを背景適用・読込OK・480×242/512×256。
- **Sources/法務**: 新規外部エンドポイントなし（MarineRegions WMSは既出、PB2002はビルド時のみ）。Twemoji(R79e)以外の法務変更なし。
- 回帰: 129レイヤー行、ws既定4窓、コンソールエラー0。

### R79g — maritime zones の改悪を撤回：種別ごとの色分けを保持したまま「明るく」
- **謝罪案件**: R79fで海洋境界を全種別1色（ネオン緑）に潰したのは誤り。EEZ(200海里)/領海(12海里)/条約/中間線/司法判断/共同管理/一方的主張/係争中/基線/接続線 という**種別ごとの色分けこそがこのレイヤーの価値**であり、それを破壊していた（ユーザー激怒）。
- **正しい修正**: MarineRegions WMSの `line_type` 属性（GetLegendGraphic JSONで全15値を取得）で**種別ごとにフィルタするSLD**を組み、各種別を**明るく視認性の高い配色**に再描画（200NM=#39FF6A緑・12NM=#12E3D6シアン・条約=#4D8BFF青・中間線=#B6FF3Aライム・司法=#FFC21A金・共同=#FF9E3D琥珀・一方的=#E64DFFマゼンタ・係争=#FF4D4D赤・係争中間線=#FF7A3D赤橙・基線=#E6ECF2淡灰・接続=#C8D0D8灰）。線幅も1→1.5〜1.9に。ダッシュ（基線・係争の破線）も保持し種別を判別可能に。`EEZ_STYLE` テーブルが**SLDと凡例の両方を駆動**（常に一致）。curlで多色描画を検証（複数の明色ピクセル確認）。実測: 凡例11行・各行が別の明色swatch（glow付き）、コンソールエラー0。

### R79g(2) — レイヤー例画像を「実基盤地図＋実データ」の本物スクショ風に（合成の作り直し）
- **前回のフラット大陸合成が却下（「スクショって言ってるやろが」）**。ヘッドレスtabは `document.hidden`＝WebGL地図が描画されず `map.on('load')` も発火しない＝**生キャプチャ不可**を確認。そこで **実CARTOタイルの基盤地図＋各レイヤーの実データ**をPILで合成し、実際のアプリ画面と見分けのつかない画像を自己ホスト：
  - **Tectonic plates** = 実CARTO dark基盤（実大陸）＋PB2002境界（橙）。
  - **Wind** = 実CARTO dark基盤＋全球流線（速度で配色）。
  - **Ukraine frontline** = 実CARTO dark基盤（都市ラベル付）＋**DeepState `history/last` を実取得**しアプリと同じフィルタ（Polygonのみ・ウクライナbbox lng20–42.5/lat43.9–54.5）＋**各featureの自前fill/stroke色**で描画（緑=ウクライナのクルスク進出・赤/えんじ=露占領。fill不透明度0.32相当）。
  - **Night lights** = 実VIIRS Black Marble（GIBS）の**ナイルデルタ＋イスラエル**タイル（要望どおり）。
  - **Contours** = 実OpenTopoMap（マッターホルン）の等高線タイル。
  - **Köppen** = **縦横比修正**（歪みを解消、lng−12..44を2:1でクロップ、黒海洋を暗色化）。
- `IMG{}` に nightsat/contours/ukrfront を追記、plates/wind/koppen は同名PNGを更新。実測: 6枚とも480×240で読込OK・into()最優先解決・コンソールエラー0。

### R79h — モード切替ボタン化／Atlas: 短返答の自動スクロール・素のURLもリンク化・近況の鮮度厳格化
- **通常⇄ワークスペース切替をプルダウン→ボタンに**（「設定の移動ボタンを置く形式にして」）: 設定の `<select id=setting-wsmode>` を **`#setting-wsmode-btn`** に置換。状態を反映（オフ=「ワークスペースに切り替え →」青、オン=「← 通常モードに戻る」）してクリックでenable/disableをトグル。`syncModeBtn()` をenable/disable末尾で呼び、Atlas/メニューのExit/自動起動など**どの経路で変わってもラベル同期**。stateContextの参照も更新。実測: ボタン存在・select廃止・129行。
- **Atlas: 短い返答が自動で最下部までスクロール**（「返答が短いものであれば返答に合わせて自動的に最下部へ」）: 返答は"thinking"の点をinnerHTML差し替えで置く経路が多数あり個別対応は漏れる → `.atl-chat` に **MutationObserver** を設置し、**ユーザーが既に最下部付近(150px以内)にいる時だけ**最下部へスクロール。短い返答＝全文が見える／長い返答＝上端（点があった位置＝返答の冒頭）を保持し先頭から読める。全経路を自動でカバー。
- **Atlas内のリンクを踏めるように**（「リンクを付けるのが適切な場合に」）: `mdMini` はMarkdownリンクのみ変換していた → **素のURL（`https://…`）も安全にアンカー化**（直前文字ガードで、直上で作ったMarkdownリンクの `href="…"` 内URLは二重変換しない）。実測: 素URL・Markdownリンクともにクリックできるアンカーへ・入れ子なし。
- **「近況を教えてといってるのに数年前の話が出る」**: analyze合成プロンプト(sys2)に**鮮度の厳格ルール**を追加 — 近況/latest/nowを問われたら**最新（DATAは新しい順）**から構成、6か月より古い出来事は背景扱いにとどめ**古い出来事を現在の話として提示しない**、各記述に日付必須、手持ちの最新でも数か月古ければ明言し当月・当年を付けて追加Web検索、を明記。
- 回帰: 129行・コンソールエラー0・法務変更なし。

### R79i — レイヤー例画像を「IntMap自身の実スクショ」に（外部タイル・合成を全廃）
- **「IntMapやぞ。スクショ取るだけで済むことを何しとんじゃ」**: 前回の外部タイル/合成は却下。**IntMapの実地図キャンバスから直接キャプチャ**して差し替え。ヘッドレスtabは `document.hidden` でWebGLが描画されないが、**新規tab+`?rafshim=1`** で `window.__imap` が load 完了・`map.triggerRepaint()` → `map.once('render', …)` の**レンダーティック内でcanvas.toDataURL**すれば preserveDrawingBuffer なしでも実フレームを取得できることを確認。ローカル簡易アップロードサーバ（CORS付・POSTでbase64→PNG保存）へ各キャプチャをPOSTして自己ホスト化。
- 取得したもの（すべて実レイヤーを有効化し実地図で撮影）: **Plates**（色分けプレート＋実地図＋ラベル）／**Wind**（風速フィールド＋`wind-canvas`のアニメ流線を合成）／**Contour lines**（アルプス=ツェルマット/マッターホルンの実等高線）／**Base map & labels**（中欧＝国名・都市ラベル・国境・道路）／**Ecoregions**（RESOLVE生態域を実地図に、アフリカ中心）。480×240に縮小して `preview_*.png` を上書き（IMG配線は既存のまま）。
- 実測: 5枚とも実IntMap描画・480×240・読込OK・129行・コンソールエラー0。外部画像/図での“ごまかし”を排除。


### R80 — Atlasの残ギャップを実装で塞ぐ（Central OS完成へ：表示中記事・除外条件・同名地検証・自己診断）
ATLAS-VISION.md の実装対応表「残り」列のうち、当面最優先5つ（§2 状態理解 / §3 文脈 / §16 自己確認 / §17 診断）に直結する具体ギャップを、すべて**加算的**（既存処理の改変・削減なし）に実装。ハリボテ廃止＝各機能を実データ・実状態で end-to-end 検証。
- **§2 表示中記事の詳細** — Atlasが「Newsタブが開いている」だけでなく**いま読んでいる記事そのもの**を認識。`globalData` はクロージャ内なので `openArticleInSidebar` で `window._imReader`（title/publisher/pubDate/place/loc）へブリッジ（`window._imLayerDates` と同じ手法）、`closeArticleReader` でクリア。`stateContext()` に `OPEN NEWS ARTICLE …` 行を注入し、「この記事／この出来事／それ／（対象語なしの）詳しく・背景・なぜ・translate this」＝この記事、「there／現地」＝記事の発生地、に解決。実測: `window._imReader` を投入→`IntMapConsole.state()` に該当行（タイトル・媒体・日付・地点・デイクシス写像）が出現。
- **§3 除外条件の記憶** — `_wctx` に `exclusions[]` を追加。除外はアクションでなく自然文（"except Japan"/"中国を除いて"/"ヨーロッパ以外"/"кроме России"/"excepto España"）で述べられるため `recordTurn(q)` で生文を `_parseExclusions` が5言語パース。新しい除外句で置換、"include everything／除外を解除" でクリア、reset/clearAllでも消去。`wctxBlock()` が「EXCLUSIONS the user set（変更されるまでの常設条件）」として buildPrompt に注入。実測: 5言語の抽出（"G7 except Japan"→[Japan]、"中国を除いて"→[中国]、"кроме России"→[России]、"excepto España"→[España]、"include everything/除外を解除"→クリア、"fly to Tokyo"→誤検出なし）、`wctx()` に exclusions キーあり。
- **§16 同名地検証（自己確認）** — Georgia（国 vs 米州）、Athens（ギリシャ vs 米ジョージア）、Paris（仏 vs テキサス）等**同名異所17件**の緯度経度表 `AMBIG` と `_ambigNote(name,lng,lat)` を新設。flyTo / search / outline が地名を解決した後、解決座標が候補のどれに一致したかを判定（≤250kmのときだけ発火＝非曖昧地では黙る）し「今回は◯◯を表示、他に△△も。別なら『△△』と指定を」と正直に併記（5言語ミラー）。実測: 「Georgia」→国を表示＋米州を提示、「Athens」→ギリシャ＋米ジョージアを提示、「Tokyo」→注記なし。
- **§17 データ鮮度・API障害の自己診断** — `IntMapDataHealth`（news鮮度＝`globalData` 最新pubDate経過h／layer描画整合＝`IntMapLayerAudit` で未描画ON層／ライブAPI到達性＝USGS・Open-Meteo直＋GDELTはプロキシ梯子、いずれも**既出エンドポイントのみ**）を新設。`diagnose`/`health`/`selfCheck`/`status` アクション（🟢/🔴 レポート、429は「rate-limited(429)」と区別）、localPlanアンカー（"診断"/"何か問題ある？"/"any issues?"等）、`stateContext` へ**問題があるときだけ**の SELF-DIAGNOSIS ALERT 行、SYS()にアクション登録、を配線。「常時監視」は**可視時のみ**25s後＋10分毎の軽量プローブ（背面タブ/ヘッドレスでは走らずネットを汚さない）。プロキシ梯子は最大27sになりうるため health では 8s で上限（`Promise.race`）。実測: `check({probe:true})`＝news 34件/3h・USGS 200/850ms・Open-Meteo 429・GDELT proxy、`diagnose` は 8s上限で応答・「rate-limited(429)」表示・ok=true（診断自体は成功）。
- **配線（標準ルール順守）**: 4機能とも dispatch/localPlan/catalog(SYS)/stateContext/_wctx へ配線済み。新規外部エンドポイントなし（USGS・Open-Meteo・GDELTは既にSources/Privacy §4開示済み＝line 21522「already a listed provider」）→ **法務/出典の変更不要**（LEGAL_DATE 2026-07-12 据置）。
- 回帰: ページ起動OK（IntMapConsole+IntMapDataHealth 生成、159トグル描画、bodyChildren=25）、core dispatch（theme/rank/flyTo/clearAll）OK、コンソールエラー0。highlight/mapMetricの ok=false は**ヘッドレス（document.hidden→WebGL未描画→style/countries source未ロード）**による R61 paint検証の正直な失敗であり、当該コードは未改変＝回帰ではない（実タブでは描画される）。


### R81 — レイヤーON/OFFと実態の乖離（たまに発生）を「監査カバレッジの穴」から根治
- **実測した真因**: 既存の `IntMapLayerAudit`（R74/R79）は堅牢だが、その照合対象は**手作業のidテーブル**（STATIC/BASE）＋各サブシステムが `_registerLayerOpacity(...,cbId)` を**呼んだときだけ**入る `_imAuditReg` に依存。全129レイヤーCBのうち**監査対象は起動時31件のみ**（残り98件は「今セッションで一度ONにされるまで」または「サブシステムが登録し忘れ/非同期登録が失敗するまで」未カバー）。未カバー層は「ONなのに未描画（direction a）」を**自己修復する経路が存在しない** → これが残っていた「たまに」の乖離。
- **修正方針（加算的・機能/UI不変・徹底的に強固）**: 監査カバレッジを**登録依存から観測依存へ**。`window._imLayerOwn` を新設し、各CBが**ONになった瞬間にスタイルのレイヤー一覧を差分**して「そのCBが実際に追加した本物のレイヤーid」を学習（`#layer-dropdown` change を購読）。学習idを**同じレコンサイラ**に供給し、未登録・将来追加分・登録失敗分まで direction-a の自己修復対象に。
- **安全設計（バグ混入防止）**: 学習idは**「ONなのに未描画」の再点火（direction a）専用**。再点火はそのCB自身の change を off→on し直す**冪等操作**（既存STATIC経路と同一）で、**レイヤーを隠す用途には一切使わない**（隠す判定は従来のidテーブル＋`_sweepOrphanLayers` のまま）。ゆえに誤帰属が起きても最悪「正しいCBの無害な再点火」止まりで、**別レイヤーを誤って消すことは構造的に不可能**。誤帰属自体も抑止: ①ベース/常時レイヤーは `SKIP` 正規表現で除外、②`first-owner-wins`（既に別CBが持つidは奪わない）、③キャプチャ窓中に別CBがトグルされた曖昧ケースは**帰属をスキップ**（安全側に倒す＝従来動作）。さらに**正当に空になり得る層**（`dl-ships`/`dl-planes` の zoom-gated ライブ交通・`dl-wind` のキャンバス）と**状態を持つ `cb-grid`**（#R38）は学習ヒールから除外。ECMWF `dl-ec-*` はキャンバス描画でスタイルレイヤーを足さない→自然に学習対象外（従来通り監査対象外で正しい）。
- **`check()` も学習idにフォールバック** — Atlas の状態文脈（stateContext）と `IntMapDataHealth` のレイヤー整合が、登録前の層も正しく「描画/未描画」を報告できるように。
- **実測（ヘッドレスは document.hidden でオーバーレイ層が実際には描画/追加されないため、アルゴリズムを分離ユニットテストで証明＋配線を確認）**: ①監査 `run()` は throw せず（`_auditLearned` 統合後も安全）②キャプチャ帰属ロジック＝新規かつ非ベースかつ未所有のidのみ採用（`seaice-raster` のみ採用、ベース `ofm-water`/`poi-x` 除外、他CB所有 `wbco2-fill` は非奪取）③skip-guard は dl-ships/dl-planes/cb-grid=除外・gx-*=対象 ④既知31層のカバレッジ不変（11/11）・未知CBは null・起動時カバレッジ=31（純加算=起動時挙動不変、ON化で漸増）⑤コンソールエラー0。実ブラウザでは各オーバーレイのadd時に差分が本物のidを捕捉（同一の `getStyle().layers` 差分）。
- 新規外部エンドポイントなし・法務/出典変更なし。機能・UIの改変なし（レコンサイラの堅牢化のみ）。


### R82 — Atlasをカーネル(IntMapOS)化：UI/NLは表層シェル、全操作が単一カーネルを通る構造へ（Central OS第六段階の土台）
ユーザー指示: 「根底にAtlasがあり、全UIはそれを表層で操作するだけという構造に。今みたいに間接的にAtlasがIntMapを操作するのではなく、OS自体に」。ATLAS-VISIONの最終定義（「AtlasがIntMapの中にある」→「Atlasの上でIntMap全体が動く」）を構造として実装。**方針は合意（AskUserQuestion）＝「カーネル構築＋中核を実インバート＋全UI登録」**。加算的・機能/UI不変・段階的。
- **旧構造の問題（実測）**: Atlasは `clickId(...)`（20箇所）＋`doControl` で**UIボタンのクリックを模倣**してIntMapを操作＝間接。UIハンドラはエンジンを直接叩く。＝2系統の並行パス。
- **新構造 `window.IntMapOS`（カーネル）**: `register(id,run,meta)` / `exec(id,ctx)`（登録コマンド＝インバート済みの正準経路）/ `dispatch(action)`（Atlasの型付きアクション層＝NLと同一）/ `on`+`emit`（イベントバス）/ `log()`（**UI・NL統合のsyscallログ**、source=ui/atlas/apiを区別）/ `state()`・`catalog()`（Atlasが束縛）。UI（GUIシェル）とAtlasチャット（NLシェル）は**どちらもこのカーネルにインテントを投げる薄いクライアント**に。
- **中核を実インバート（UI→カーネル→エンジン、clickId模倣を排除）**: 地図ビュー（`view.base.map`/`view.base.sat`/`view.proj.globe`/`view.proj.flat`）＋サイドバータブ（`tab.news`/`tab.info`/`tab.stats`/`tab.community`）の**実ロジックをカーネルのコマンドに移設**（旧onclick本体を `e.currentTarget`→明示的要素idに書換えて移動）。ボタンの `onclick=()=>IntMapOS.exec(cmd,{source:'ui'})`、Atlas dispatchの `base`/`projection`/`tab` は `kexec()`（カーネルコマンド直呼び＋失敗時のみclickIdフォールバック）に。→ **UIクリックもNL指示も同一コマンドに収束**。
- **全UIをOSインテントとして登録**: AtExが `IntMapOS._setDispatch(dispatch)`・`_bindState(stateContext)`・`_bindCatalog({commands,controls,layers,modules})` で束縛。→ `IntMapOS.dispatch({type:'control',target:...})` で**UI全コントロールをカーネル経由で操作可能**、`IntMapOS.catalog()` が**全操作面（controls 3509字・layers 2806字・modules 649字・commands 8）を列挙**。中核は真にインバート済み、残りは束縛dispatch経由で到達＋カタログ登録済み（以降のパスで順次コマンド化＝段階移行）。
- **実測検証（ヘッドレスでも同期状態変化は観測可）**: ①起動OK・`IntMapOS` 生成・8コマンド登録・`ready=true`・`state()`非空・catalog 4区分 ②UIパス: `exec('view.base.sat')`→btn-view-sat=active/map=非active（逆も）③**実ボタンclick**→onclick→exec が**1回だけ**ログ（`view.base.sat/ui`、二重実行なし）④**NLパス**: `IntMapConsole.dispatch({type:'base',mode:'map'})`→`view.base.map/atlas` 1件・btn-view-map=active（clickId模倣ではなくコマンド直実行）⑤projection/tab も NL→カーネル（`view.proj.flat/atlas`・`tab.community/atlas`）⑥カーネル経由で theme・layer(earthquakes) 操作OK ⑦統合ログに ui/atlas/api の混在を記録 ⑧コンソールエラー0。
- **互換性**: 既存の `getElementById('btn-...').click()`（キーボードショートカット #3643・共有復元 #20171 等）は新onclick→exec→コマンドを発火＝同一効果を保持（click testで確認）。newsfilter等の周辺ハンドラは不変。
- 新規外部エンドポイントなし・法務/出典変更なし。次パス: 残りコントロール群（ツール/設定/レイヤーの各トグル）を順次カーネルコマンド化し、UIバインディングをexec経由へ移行（第六段階の完成へ）。

---

## R83 — batch: workspace auto-tiling, Atlas routing/streetview/sims, compare-paint, previews, Countries(info) & Ask-AI absorption

12件の要望を追加的に実装（既存ロジック不破壊・全機能維持）。検証は http://localhost の実ブラウザで parse/console/state を確認（マップWebGLはヘッドレスで凍結＝スクショ不可のため、物理・幾何・正規表現・モジュール存在を独立evalで実証）。

- **Countries(info) 自動ONの廃止（#1）**: `setMode('stats')` の `_setCountriesInfo(true)` と離脱時の自動OFF、ワークスペースCountries窓の `_wsCountryInfo(true)` を撤去。cb-countries は完全に手動トグルへ。
- **デフォルトで全窓ONをやめる（#2）**: DEFS の countries・atlas に `defHidden:true`。既定表示は **Map + Layers のみ**。News/Info/Community/Countries/Atlas はWindowメニューから。storage KEY を `intmap_ws2`→`intmap_ws3` に更新（旧4窓レイアウトを持ち越さない）。
- **ワークスペース自動タイル＋ジャンクション（#3）**: `computeTiles()`（1=全面/2=左右62:38/3+=Mainが左・残りは右列に積む）＋`retile()` で**可視窓を隙間なく自動配置**。窓の開閉・最大最小化・ブラウザリサイズ・scanで自動再タイル。`buildJunctions()` が**3枚以上が接するT/十字点**にドラッグハンドルを生成し、`addJunction()` が縦仕切り(jx)と横仕切り(jy)を**同時に移動**＝接する全ての境界を一括ドラッグ（「三つ同時に境界を動かせる」）。手動ドラッグ/リサイズ後もジャンクション再構築。検証: 2窓[0,34,893,836]+[893,34,547,836]、3窓は完全gapless、ジャンクション1点[835,452]を正しく検出。
- **Ask AI about here を Atlas に吸収（#9→#4）**: 独立パネル(IntMapAIResearch)呼び出しを撤去。`IntMapConsole.askHere(ll)` を新設＝Atlasを開き `_herePoint` に正確な座標をピン留め、`buildPrompt` が `[PINNED POINT]` を注入し会話全体で「ここ/this spot」がこの座標に解決。右クリックメニュー「ここをAtlasに聞く」＋dispatch `askHere`（質問付きなら analyze で即答）。
- **Compareの色を地図にも（#5）**: `IntMapStatsCompare.paintOnMap()`＝countryGeoから選択国のみのカテゴリfill（PAL[i]でチップ/棒と厳密一致）を独自ソース `imcmp-src` に描画。open()・chipRow()で同期、`_clearCompare` で消去。Atlas/styledata再適用対応。
- **Atlas 経路案内（Google Map的, #6）**: `IntMapRouting`＝公開OSRM（車=router.project-osrm.org / 徒歩・自転車=routing.openstreetmap.de）でターンバイターン。dispatch `directions`（`route`は海路のまま）＋日英localPlan。距離/所要時間/手順を返信。検証: 東京→大阪 494km/6.3h（CORS直, OK）。
- **ストリートビュー（#7）**: `IntMapStreetView`＝APIキー不要の maps.google.com `output=svembed` を埋め込む可動パネル＋Googleマップへジャンプ。右クリック「ここのストリートビュー」＋dispatch `streetview`＋localPlan。
- **Atlas: 海抜以下ハイライト＋WWI勢力図（#5→#8）**: `elevationBelow`＝Open-MeteoのCopernicus DEMをグリッド標本化し閾値以下/以上のセルを深度段階fill（「カスピ海周辺の海抜0m以下」）。`historicalMap`＝curatedのWWI1916年3月勢力図（中央同盟/連合国/中立の現代ISO3マッピング＋注記）＋他年代はAIでfaction生成。日英localPlan＋SYS。
- **弾道ミサイルSim刷新（#12→#11）**: 旧=放物線カメラのみ。新=**最小エネルギーのケプラー軌道**を解き（Bate/Mueller/White）、真のアポジー高度・ブーストアウト/再突入速度・飛翔時間を算出、Kepler時間で弾頭を移動＋縮尺付き高度断面SVG＋任意の弾頭効果環（20/5/1psi・熱線）。検証: 10000km→アポジー1319km・7.2km/s・32分（実ICBM相当）。dispatch `missile`＋`fly`のicbm系を委譲。
- **放射性物質拡散Sim（#10→#9）**: `IntMapRadiation`＝ラグランジュ粒子モデル。Open-Meteo 6×6グリッド×72hの**時空間の風**で移流＋気温由来の安定度でスケールした乱流拡散＋降水による湿性沈着＋乾性沈着＋半減期。粒子＋濃度ヒートマップをアニメ。dispatch `radiation`＋日英localPlan。検証: 福島周辺6地点×72h取得OK。
- **フライトシミュレーター（#11→#10）**: `IntMapFlightSim`＝実際の地図上を飛べるアーケード飛行モデル（協調旋回・ピッチ/スロットル・失速・重力・地形衝突、カメラ=コックピット、HUD=対気速度/高度/方位/人工水平儀）。キー W/S・↑↓・←→・A/D・Esc。dispatch `flightSim`＋日英localPlan。start/stop/HUD検証OK。
- **レイヤープレビュー修正（#6→#12）**: **setView をアスペクト補正**＝任意のクロップ枠をキャンバスの真の2:1 web-mercatorに拡張してから投影（EU members・Volcanoesの横伸び解消。検証: 補正後アスペクト1.983=目標）。ECMWF雲=実MODISトゥルーカラータイル、Live aircraft=実空港間の大圏ルート網に刷新。地震/タイムゾーンは既に実データ・正比。※ヘッドレスではWebGLが凍結し新規スクショ撮影は不可（sea-level/historical-borders等の非タイル系は正比の実描画のまま。実スクショ差し込みは preview_*.png 方式で後日可能）。
- **出典/プライバシー更新**: DATA_SOURCESに OSRM・Google Street View を追加、Open-Meteo記述に拡散/標高グリッドを追記。プライバシー§4（日英）に道路経路(OSRM=起終点/経由座標)・埋め込みSV(Google=座標)・拡散/標高のグリッド座標送信を明記。
- 新規 window.* : IntMapRouting / IntMapStreetView / IntMapRadiation / IntMapFlightSim。Atlas新action: missile, elevationBelow, historicalMap, radiation, flightSim, directions, streetview（＋SYS/ localPlan/ clear/ clearAll 連携）。boot後 console error 0・全モジュール存在・129レイヤ行を確認。

---

## R84 — batch 2: follow-up fixes & polish (workspace, Atlas, sims, previews, i18n)

25件の第2バッチ。実ブラウザで parse/console/state を検証（WebGLはヘッドレスで凍結のため、幾何・DOM・正規表現・モジュール存在・CORSで実証）。

- **ワークスペース列リサイズ（#13/#1）**: 仕切りドラッグを DIVIDER モデルに刷新＝同一ラインを共有する**両側の全ウィンドウ（同列の仲間も）**が追従。既定配置を Countries|Map|Layers/Atlas に復元（ロールベース `computeTiles`：countries=左・map=中央・残り=右列）。storage KEY→ws4。
- **右クリックの「Atlas console (beta)」削除（#14）**。
- **放射拡散が「使えない」根治（#17）**: `run()` が42秒アニメを await して返答が出ず、地図操作で即キャンセルされていた。→ 即座にレポート返却＋背景アニメ（パン/ズームで消えない）＋`ensureLayers` リトライ。
- **ICBM立体軌道＋高度着色（#20）**: MapLibreのlineは浮かせられないため、`IntMapArc3D`＝スクリーン空間キャンバスで地上トラックを実高度ぶん持ち上げた**立体アーク**を高度カラーランプで描画、弾頭が飛翔。
- **ストリートビューのカバレッジ（#21）**: `IntMapStreetView.coverage()`＝ベースマップの道路を水色にクローンし、クリックでその地点のSVを開く（Googleペグマン風）。ラスター地図では「どこでもクリック」。
- **Atlasマップ物のオンオフ（#18a）**: マッピング系アクションの返答に地図オーバーレイの on/off トグルを付与（`OVL_OF`/`overlayToggle`）。**選択形式の質問（#18c）**: 新 `ask` アクション＝質問＋クリック選択肢チップ＋自由入力欄。情報不足時はAIがこれを使うようSYS更新。
- **ソースリンク404（#19）**: `answer`/`analyze` の本文にURLを出させない（出典名のみ、実URLは証拠から自動付与）とSYSで明示。
- **Compare表示（#16）**: 時系列の年号は preserveAspectRatio="none" のSVG内で潰れていた→年号をHTMLに移して常に鮮明。棒グラフはワークスペースの狭い窓で列幅を縮小しトラック長を統一。
- **8プレビューを実IntMap風に（#24）**: `_bmShot`＝**実CARTOベースマップ2タイル（真の2:1）＋実レイヤー**を合成（setView再利用）＝ライブ地図のスクショと同等。EU/火山/地震/タイムゾーン/歴史境界/海面/航空機/ECMWF雲。CORS非汚染を実測確認。
- **リッチ経路UI（#22）**: `IntMapRouting.openPanel`＝Google/Apple Map風パネル（出発/目的地の編集、車/徒歩/自転車切替、入替、地図クリックで地点選択、距離・時間・ターンバイターン、ライブ再計算）。Atlas `directions` から起動。
- **フライトSimをゲーム級に（#23）**: スクロール式ヘディングテープ、バンクする自機シンボル、高度スカイティント、アフターバーナー（Shift）、人工水平儀。
- **DE/RU/ES完全化（#25）**: 実測でDEは383/383完備、RU/ESが各64キー欠落（レイヤー名・凡例・テーマ・寄付/Pro/出典等）→ 全て翻訳追加。5言語すべて全キー網羅（`window.i18n`診断で0欠落を確認）。
- **Wind色場＋監査ガード（#15/#9）**: 風の速度カラー場（WebGLラスター）が `updateImage` 欠如時に無色化する経路へ**ソース再生成フォールバック**。監査の所有学習SKIPに新オーバーレイ層（imcmp/imrad/imroute/sv-cov/wind-field）を追加。※一般のトグル乖離はヘッドレスWebGL凍結で再現不可のため、既存の負荷を担う reconcile 本体は改変せず（回帰回避）。
- **出典/プライバシー**は前回R83で更新済み（OSRM・Google Street View）。新規外部エンドポイント: CARTOベースマップ（プレビュー合成、既存出典）・Open-Meteo geocoding（経路パネル、既存出典に含む）。

---

## R85 — re-reported-bug + "build it for real (ハリボテ禁止)" batch (tags `#R85`)

User batch (14 items). All verified in the auto-opened `localhost` preview via `IntMapConsole.dispatch` + HUD reads (the headless tab is `document.hidden` so `isStyleLoaded` never completes and rAF is throttled — used `?rafshim=1` to exercise the flight loop; map-layer *rendering* for wind/arc/radiation is verifiable only in a real foreground browser, so those were validated by logic + graceful failure + numeric checks).

- **Layer ON/OFF race (#5, desktop).** The "checked-but-blank" self-heal pulsed a layer off→on; the 2nd half re-checked UNCONDITIONALLY, so a user turning a layer OFF inside the 420 ms window had it snap back ON. Added a user-intent tracker: every genuine (non-reconciler) change on a `#layer-dropdown` checkbox stamps `cb.__userChangeT`; reconciler synthetic dispatches are tagged `cb.__syn` so they don't stamp; `rearm()` aborts its 2nd half if the user touched the box, and `audit()`/`_auditLearned` skip any box toggled in the last 4 s. Purely additive — can only DECLINE to act, never turn extra on. (The mobile-tap "勝手にオン" path was left alone per R42d — user is on desktop.)
- **Wind colour field never paints (#4).** Root cause = the field source is only created once `map.isStyleLoaded()`, inside a 3 s retry that gives up if the grid arrives first, and the `styledata` re-attach only rendered when `fieldReady` was already true. Fixes: `renderFieldImage()` now ALWAYS rebuilds the image source (no more trusting `updateImage`, which resolved yet never repainted on this build); `start()` retries field creation ~16 s + hooks the next `idle`; `styledata` renders whenever the grid exists.
- **Summarize-view button w/o News window (#3).** In ws-mode `renderUI` runs with `currentMode==='news'` even when the News window is hidden → button leaked. Gated on `!window._wsNewsHidden()` (always false outside ws-mode).
- **Legends bottom-left in ws-mode (#2).** `tileLegends` bug: in ws-mode `#sidebar` is `display:none` so its width is 0 and `(0||440)+24` shoved legends 464 px right. Now: ws-mode docks legends bottom-left of the Map window (stack upward from `bottom:30`), and the sidebar-offset only applies when the sidebar is genuinely visible. `enable()/disable()` re-run `tileLegends()`.
- **Atlas workspace toggle + coverage (#1/#8).** New `{type:"workspace","on"?}` action → `IntMapWorkspace.open/close` + NL patterns ("ワークスペースモードにして" / "通常モードに戻して") + schema. `IntMapWorkspace` already exposed `{open,close,toggle,active}`.
- **"現在地" = device GPS (#10).** Removed 現在地 from `DEIXIS_RE`; added `SELFLOC_RE` + `_selfLoc()` (cached `navigator.geolocation`). `geocode()` resolves 現在地/現在の位置/my location → real GPS (falls back to deixis/centre if denied); `placeExtent` returns null for it so every action (weather/streetview/radiation/directions from現在地) resolves correctly.
- **In-message overlay toggles (#6).** Extended `_OVL`/`OVL_OF` with the overlays that had no in-reply switch: `fly` (nlq-fly-*), `los`, `isolate` (iso-mask), `pin` (user-pin-*), `streetview` (sv-here-*). `runActions` mapped-collection now handles ARRAY values (a missile draws both `arc` + `fly`).
- **Bogus Atlas source links (#7).** `analyze` rendered the model's SOURCES-line URLs that were NOT in `srcSink` (the real gathered articles) — LLMs hallucinate plausible 404 URLs and the browser can't verify them (CORS). Now renders ONLY `srcSink`-grounded cards (cited-first). Honest > impressive.
- **Street View (#9).** Added a live map marker + facing cone (`sv-here-pt/cone/halo`) painted INSTANTLY on select so point-picking feels responsive while Google's embed loads; passes the heading to the embed. Coverage mode is lighter: ONE highlight layer per (source, source-layer) instead of one clone per road class (was 20–40 layers → 1–3).
- **ICBM faithful 3-D + physics + presets (#11).** Arc3D `draw()` now lifts each point by REAL altitude at the map's own px-per-km (world scale, correct under zoom — the old `0.46·screenHeight` was why height changed with zoom). `ballisticSolve(range, loft)` takes a selectable launch angle → minimum-energy / **lofted** / **depressed** (verified Moscow→DC apogee 1,253 / 4,608 / 324 km). Added Allen–Eggers atmospheric DRAG for the impact velocity, an Earth-rotation (Coriolis) ground track (`_ballTrack`, lead = Ω·T then un-rotate each point by elapsed spin), an optional MaRV terminal weave, launch-angle/impact-velocity/cross-range in the report, and trajectory-preset BUTTONS in the reply (`_lastMissileCtx` re-fly).
- **Flight sim rebuilt to a real 3-DOF model (#12).** Point-mass aircraft: lift = q·S·CL(α) with a genuine stall break, induced+parasitic drag, thrust, weight, air density ∝ exp(−alt/8500), coordinated banked turns, load factor G. Elevator sets pitch attitude but is AoA-limited (can't yank past ~22° stall) with a stall nose-drop; terrain collision judges landing (gentle, wings-level, low descent) vs crash. Camera banks via `map.setRoll` (confirmed supported) + smooth zoom. HUD gains a G-meter + AoA + landed/overspeed/G-limit callouts. Verified (rafshim): cruise G≈1.1/AoA 2°, hard pull G 4.4/AoA capped 20° (was 52° unbounded), stall warnings fire.
- **Radiation: params + final deposition + dose (#13/#14 orig).** `IntMapRadiation` rebuilt: source-term presets (Chernobyl/Fukushima/dirty-bomb) or explicit Bq/PBq, emission duration, isotope half-life (Cs-137/I-131/Cs-134/Sr-90), and start date-time (past dates use the **ERA5 archive** `archive-api.open-meteo.com`; forecast otherwise). `computeDeposition` accumulates deposited activity into a cell grid; `depFeatures` classifies FINAL ground deposition into the real Chernobyl Cs-137 zones (1480/555/185/37 kBq/m²) and reports peak external dose rate (µSv/h) + annual mSv/yr with health context (background 2–3, Fukushima evac 20 mSv/yr). Preset buttons in the reply.
- **Rich routing + REAL transit (#11 orig).** OSRM stays for drive/walk/cycle; NEW `transit` mode via **Transitous / MOTIS** (`api.transitous.org`, free worldwide GTFS) — typed legs (WALK / RAIL / SUBWAY / BUS / FERRY) each with polyline geometry (precision 7). Map draws walking legs DOTTED grey and each ride SOLID in its mode colour (rail blue, subway orange, tram green, bus purple, ferry teal) with stop markers; panel + Atlas reply show a colour-coded leg list with transfers & times. "電車/train/公共交通" → mode:transit (NL leading-mode strip so "電車で新宿から横浜" parses); NO silent fallback to roads — an honest "no transit here" when GTFS coverage is missing. Verified Berlin↔Munich returns ICE legs.
- **Docs.** Privacy (JP+EN) + Sources add Transitous/MOTIS and the Open-Meteo ERA5 archive. No DE/RU/ES privacy paragraphs exist (JP+EN only).

**Headless-preview reminder reinforced:** the auto-opened localhost tab is `document.hidden` → `isStyleLoaded` stalls & rAF throttles to 0. Verify map-independent LOGIC via `IntMapConsole.dispatch` return HTML + `?rafshim=1` for rAF loops; map-layer paints (wind field, 3-D arc, deposition polygons, transit lines) render only in a real foreground browser.

### R85b — re-reports on the three sims (tags `#R85b`)

- **Flight sim "使いものにならない・主観視点にしろ・自動でSatellite,3Dにしろ".** `start()` now remembers the view then auto-switches to **flat + Satellite + 3-D terrain** (also gives `queryTerrainElevation` real ground) and raises `setMaxPitch(85)`; the loop uses a **first-person cockpit camera** — centre a look-ahead point along the heading, near-horizon pitch (60–85, `83 − θ·0.28`), banked via `setRoll(−φ)`. `stop()` restores base/proj/3-D/maxPitch. (`getFreeCameraOptions` is NOT on this build, so cockpit is done via `jumpTo` look-ahead, not a true free camera.) Verified (rafshim): start→sat+3D active, stop→restored, physics ticking.
- **Radiation "使えない" = the `isStyleLoaded` gate.** The old `run()` returned `{ok:false,reason:'style'}` if the style was briefly not loaded when launched. Rebuilt: fetch wind + `computeDeposition`+`depFeatures` FIRST (both map-independent) and return the dose report immediately (never reason:'style'); a `paint()` closure renders the deposition layers + animation when `ensureLayers()` succeeds, retrying ~14 s + on `map.once('idle')`, guarded by a generation token (`_gen`) so a new sim can't be clobbered. Only `reason:'wind'` (network) is a hard fail now. The deposition ALGORITHM was validated by a replicated synthetic-field eval (903 zoned cells, peak ~4,983 kBq/m² → exclusion, gradient across 3 zones). Verified: `dispatch({type:'radiation'})` now returns `ok:true` + dose HTML even in the hidden tab.
- **Street View "今どこを見ているのか地図上で分からない".** Replaced the GeoJSON here-marker (needed `isStyleLoaded`, so it silently didn't paint) with a **`maplibregl.Marker`** (DOM, renders instantly) carrying a facing-cone SVG, `rotationAlignment:'map'` so the cone stays geographically aligned. Added **◀ / ▶ heading controls** to the SV panel that rotate the pano (reload the embed at the new `cbp` heading) AND `setRotation` the map cone, with a compass label (N/NE/…). Verified: 1 marker on map even headless, N 0°→NE 30° on turn.

### R85c — re-reports round 2 (tags `#R85c`)

- **Atlas reply on/off buttons dead.** ROOT CAUSE: the map-overlay switch button carries BOTH `atl-ctl-toggle` and `atl-map-toggle` classes; the click delegation checked `.atl-ctl-toggle` first, found no `data-cb`/`data-layer`, did nothing and `return`ed — so every "Shown on the map" toggle (and the whole #6 feature) was inert since R84. Fix: check `.atl-map-toggle` BEFORE `.atl-ctl-toggle`. (Verified: manual chip now flips; data-layer ctl-toggles already worked.)
- **Radiation "Where is the release source?"** `geocode("Fukushima Daiichi Nuclear")` (AI-truncated) missed. Added `IntMapRadiation.SITES` gazetteer (Fukushima Daiichi/Daini, Chernobyl, Zaporizhzhia, TMI, Kashiwazaki, Sellafield, La Hague, Mayak, Hanford, Bushehr, Ōi…) matched in EN/JP/**Chinese**; the dispatch now tries explicit coords → gazetteer → geocode → strip generic words ("原発/nuclear/power plant/npp") & retry → source-preset coords (SOURCES now carry `.ll`). Verified: "Fukushima Daiichi Nuclear" and "福岛第一核电站" both resolve → `ok:true`.
- **Street View marker not synced with movement.** The Google embed is cross-origin (can't read its own walk). Added ▲/▼ step-forward/back controls (18 m along heading) that move the pano AND the map marker together, plus the ↺/↻ turn controls; the marker is a `maplibregl.Marker` (renders without `isStyleLoaded`). Verified: forward step moves `cbll` and the marker.
- **Flight sim "明らかに主観視点ではない・飛行機マーク不要・独立した全画面で・全面的に作り直せ".** (1) INDEPENDENT FULLSCREEN: `body.fs-flying` lifts `#map-container` to `position:fixed;inset:0;z-index:3000` above all chrome (map controls/legends/sidebars hidden) + browser `requestFullscreen()` + `map.resize()`. (2) Removed the aircraft symbol. (3) Real HUD PITCH LADDER (climb solid / dive dashed, degree labels) that rotates with bank + slides with pitch around a fixed yellow boresight, + vignette. (4) Stronger first-person camera: far look-ahead (`agl·0.0016`), pitch 72–85, banked via `setRoll`. Verified (rafshim): `fs-flying` on, map z-index 3000 fixed, ladder translate 20.6→223 on pull-up, no `.fs-plane`, restores on stop. NOTE: MapLibre has no free camera on this build, so "first person" is the max-pitch + look-ahead + fullscreen + HUD combination, not a true 6-DOF eye.

### R85d — anger round: language regression, no-popup UIs, self-diagnosis, SV, flight (tags `#R85d`)

- **CRITICAL: Japanese kanji → Chinese reply.** `_replyLang()` had `if(/[一-鿿]/) return 'Chinese'` BEFORE any Japanese fallback, so kanji-only Japanese input made Atlas answer in Chinese, and the AI was told to mirror "Chinese". Chinese isn't even a reply language IntMap supports. FIX: kana → Japanese (unchanged); removed the Chinese branch; CJK-ideograph-without-kana now mirrors the user's UI language (`currentLang`), never Chinese. Also reverted the Chinese tokens I'd added to the radiation gazetteer ("勝手に中国語対応してんじゃねーよ").
- **Self-diagnosis was volunteered every turn.** `stateContext()` injected `_healthFlag()` ("SELF-DIAGNOSIS ALERT…") into every AI prompt, so Atlas nagged about data health unprompted. Removed that injection; the `diagnose` action still runs on demand.
- **Routing = full UI IN the Atlas message, no popup.** Removed all `IntMapRouting.openPanel` calls. The `directions` reply now carries a Google/Apple-style mode switcher (🚗🚆🚶🚲) that re-routes IN PLACE (`.atl-route-mode`→`_lastRouteCtx`), plus the summary + leg/turn list; errors keep the switcher so you can change mode. ("よけいなポップアップを増設するな。Atlas内のメッセージでUIやれ".)
- **Radiation = inline config + higher quality.** The reply now has an in-message config grid (isotope select, source-term select, emission-duration & sim-window steppers) + scenario presets, all re-running in place (`.atl-rad-sel` change + `data-rad` merge full params via `_lastRadCtx`). Model upgraded: a DEPOSITABLE FRACTION (0.55) so near-source isn't a solid blob, per-particle plume rise + gravitational settling (`z`,`vs`) + altitude-dependent dry deposition, 2600 particles, 0.03° grid.
- **Street View marker = the viewpoint, draggable.** The `maplibregl.Marker` is now `draggable:true` (cursor grab) — drop it anywhere and the pano reloads there (`dragend`→`_reloadEmbed`); the ▲/▼ step + ↺/↻ turn controls remain. The keyless embed is cross-origin so we DRIVE the position from the map. ("クリック地点で固定とかどういうことやねん".)
- **Flight viewpoint + physics.** Camera now keeps a LEVEL horizon (roll:0 — the rolling camera was the disorienting "視点がおかしい"); bank shows on the HUD (roll pointer `.fs-rollptr` + ADI), the pitch ladder translate-only; pitch a steadier ~64–80° looking forward-and-down. Controls softened (roll rate 2.3→1.35, pitch 0.95→0.6, lower authority) so it's less twitchy. Verified (rafshim): roll pointer rotates, ladder translate-only, no console errors.
- **Atlas map-toggle appears when needed** — the R85c handler-order fix means the "Shown on the map" switch now actually works when Atlas maps something.

### R85e — intercity rail router (tags `#R85e`)

- **Nagoya→Osaka (and any Japan intercity) transit returned NOTHING.** Transitous/MOTIS only ingests open GTFS; it HAS Japan urban (Shinjuku→Shibuya = REGIONAL_RAIL, Osaka→Namba = BUS) but NOT intercity JR/Shinkansen (not open GTFS). FIX: a fallback `railRoute()` that routes on the REAL OSM rail network — Overpass POST (`way[railway~rail|light_rail|narrow_gauge][!service]` over the origin→dest corridor bbox, `out skel`), build a graph, Dijkstra with a binary heap, + walking legs to/from the nearest track, distance-based time estimate (`_renderRail`). Wired into `transit()` when Transitous returns 0 itineraries.
- **KEY GOTCHA — the rail graph was DISCONNECTED.** OSM rail ways frequently DON'T share a node id where two lines meet, so the nearest node to Nagoya reached only its own component (28,699 nodes) and never Osaka. Dijkstra `reached:false`. FIX: **bridge near-coincident nodes** via a spatial grid (~30 m cells; add an edge between any two nodes <30 m apart). After bridging: connected, Dijkstra solves the real ~169 km Tokaidō path. Verified end-to-end: `directions transit Nagoya→Osaka` → "~1h29m · 169 km by rail", WALK→RAIL→WALK, honest "no live timetable, distance estimate" note.
- **Second gotcha:** `_renderRail` first threw a silent `ReferenceError` because I used `L(...)` — the IntMapRouting closure exposes `LL(...)`, not `L`. The `catch(_){}` in `transit()` swallowed it → "no-transit". Always match the closure's own i18n helper name.
- Privacy (JP+EN) + Sources note the Overpass rail-corridor query.

### R85f — intercity rail router made REAL (not a ハリボテ) (tags `#R85f`)

- **Complaint (justified, angry):** `名古屋から大阪まで電車で` answered with a facade — "徒歩 → board the train", "~181 km **along the rail line**", "徒歩 → to destination", "1h39min" from a flat km/h. R85e followed real track geometry but never read the line/station names OSM already carries, and the shortest-geographic path is NOT how anyone travels (it wandered the inland Kansai/Kintetsu locals via Kameyama–Tsuge–Kusatsu).
- **Now names the REAL lines & stations.** Overpass query upgraded to `out body` (way tags: `name`/`ref`/`usage`/`highspeed`) **+** `node[railway~station|halt]` (station names) instead of `out skel`. Each way is classed (`hs` Shinkansen / `main` / `reg` / `lr` / `ng`); the ridden path is collapsed into **named-line legs** and real stations are snapped on for board/transfer/alight. Time is now per-class (hs≈200, main≈88, reg≈64 km/h), not one flat speed.
- **Intercity picks the sensible route, not the shortest.** For `gc>50 km`, if a **single high-speed line runs near BOTH ends** it is ridden end-to-end (Dijkstra on a subgraph of just that line, welded to itself at 80 m), and a **short conventional connector** is stitched where the bullet-train station is a few km off the real destination (Shin-Ōsaka→Ōsaka via the 大阪環状線). Falls back to the plain shortest rail path otherwise (still fully named — no facade). Result: `名古屋→大阪` = **🚄 東海道新幹線, ~54 min, 0 transfers, board 名古屋 / alight 大阪** (real Nozomi ≈ 50 min).
- **Gotcha 1 — the Shinkansen subgraph was DISCONNECTED** even though the full graph wasn't: the endpoint bbox buffer (`gc/111*0.16`, ≤0.32) clipped the **corridor's northern bulge via Maibara**, dropping a way that lived entirely outside the box → BFS reached only 2 257 / 5 567 line nodes. FIX: widen the buffer to `gc/111*0.26` (floor 0.2), **kept capped at the original 0.32** so long-corridor fetches are no heavier than before. Verified: subgraph → 1 component, `hr` solves.
- **Gotcha 2 — walk legs ballooned to 35 + 61 min (total 2h28m).** The gazetteer (`_BUILTIN_GZ`) places `名古屋`→(136.91,35.18) and `大阪`→(135.50,34.69), ~2.8 km off the stations; the access/egress **connector cap was too tight** (`max(6, straightline×2.6)`) so it rejected the short local-rail ride to the Shinkansen station and left a multi-km WALK. FIX: relax to `max(14, straightline×3.6)` — a short rail ride always beats a multi-km walk (rails rarely run straight to the station). With Nominatim points the connector already fired (0.02/0.07 km walks, 大阪環状線 egress).
- **Station naming polish:** board/alight snap to the physically nearest stop but **nudge toward the plain JR/mainline name over a co-located private-railway namesake** (名古屋 over 近鉄名古屋 — you can't board the Shinkansen at Kintetsu-Nagoya) via a small distance penalty on `近鉄/京阪/阪急/…/Kintetsu-…` prefixes.
- Atlas reply summary now shows the ridden line(s) (`~54 min · 177 km · Tōkaidō Shinkansen`); disclaimer updated (JP+EN) to say the time is a per-line-class estimate, not a live timetable. `_isTransit`/MOTIS-first path unchanged — railRoute stays the no-open-GTFS fallback.
- **Latency:** live Overpass over a ~180 km corridor is 25–60 s (mirror-load-dependent); the wider buffer adds some vs R85e. Verified headlessly via `IntMapRouting._railRoute(...)` (temporarily exposed, then removed) + `IntMapConsole.dispatch({type:'directions',…})`.
