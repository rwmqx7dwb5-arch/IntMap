/* ============================================================================
 *  IntMap · Vite build  (#R175)
 * ----------------------------------------------------------------------------
 *  「IntMapのモダンな実装によるVite化と高速化を、品質を一切落とさず…全面的に進めてください」
 *
 *  The repo root IS the site — index.html at the top, css/ and js/ beside it, and a pile of static
 *  assets (the Köppen rasters, the flag webfont, the service worker, data/, admin.html, the Google
 *  verification file) that GitHub Pages has always published verbatim. That shape is kept: `root` is
 *  the repo root and the build output is a COMPLETE deployable tree in dist/, so "what Pages serves"
 *  is still one directory and nothing has to be assembled by hand.
 *
 *  ── base: './' ─────────────────────────────────────────────────────────────────────────────
 *  The site lives at https://rwmqx7dwb5-arch.github.io/IntMap/ — a project page, not a domain root.
 *  Relative URLs make the build independent of that prefix, so the same dist/ works from the Pages
 *  sub-path, from `vite preview`, and from scripts/serve.mjs during tests.
 *
 *  ── WHY THE STATIC ASSETS ARE AN EXPLICIT LIST ─────────────────────────────────────────────
 *  Vite's `publicDir` copies one directory verbatim; here the "public directory" is the repo root
 *  itself, which also contains node_modules/, .git/, tests/, supabase/ and the sources. Pointing
 *  publicDir at the root is not an option, and quietly copying "everything that isn't source" would
 *  publish the operational tooling. So the shipping assets are NAMED below, and
 *  tests/r175-checks.test.mjs fails if a root asset that index.html/sw.js reference is missing from
 *  the list — a new asset cannot be silently left out of the deploy, which is the one failure mode
 *  this arrangement could otherwise have.
 * ==========================================================================*/
import { defineConfig } from 'vite';
import { cpSync, createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildReportPlugin, REPORT_PATH } from './scripts/build-report.mjs';
import { injectAppShell } from './scripts/app-shell.mjs';
/* the build stamp in index.html is DERIVED from the commit being built (scripts/build-stamp.mjs) —
   it used to be typed by hand every round, and a forgotten bump left stale caches looking current */
import { buildStampPlugin } from './scripts/build-stamp.mjs';

const ROOT = resolve(import.meta.dirname);

/* Root-level files and directories GitHub Pages must keep serving as-is. Globs are resolved against
   the repo root; a directory is copied whole. Keep in step with tests/r175-checks.test.mjs. */
export const STATIC_ASSETS = [
  'sw.js',                              // tile-cache service worker (registered by index.html)
  /* (installable-app) the Web App Manifest and the icons it and index.html name. Generated in the repo by
     scripts/build-app-manifest.mjs and copied verbatim — index.html links them with `vite-ignore`, because a
     manifest Vite hashed into assets/ would resolve its own relative icon paths and start_url against
     assets/. */
  'manifest.webmanifest',
  'icons',
  'admin.html',                         // the ops console — its own page, not part of the app bundle
  /* …and the one file admin.html loads that is neither the SDK nor its own inline body: the data-literal
     PARSER that replaced the starter-dataset import's eval. Same reason as js/lang-registry.js below —
     admin.html is copied verbatim, so a plain <script src> in it resolves against dist/ and the file has
     to be there. Without it the import button says so and refuses, rather than falling back to anything. */
  'js/admin-literal.js',
  /* (safe-output-single-module) …and the app's ONE output encoder, which admin.html and sources.html load
     with a plain <script src> (the app itself bundles the same file through src/main.js). */
  'js/safe-html.js',
  /* (#R211) the transparency page — what every simulation COMPUTES, as opposed to where its data
     came from (that is the in-app Sources dialog). It is static markup with one inline script and
     no imports, so it is copied rather than bundled: passing it through Rollup would produce a
     byte-identical file behind an extra entry point. */
  'science.html',
  /* (#R212) the data-source page — the other half of the same question, in the same skeleton
     («where the numbers come from», against science.html's «what is done with them»). It renders
     the registry at load time from the file below rather than carrying a second copy of it. */
  'sources.html',
  /* …which is why this one file is served raw as well as bundled: sources.html is not part of the
     app bundle, and window.IntMapRefData.dataSources is the ONE list both it and the in-app Sources
     dialog read. Copying it is how the page avoids becoming a duplicate that goes stale. */
  'js/reference-data.js',
  /* (#R218) …and the rest of what those two pages are made of, for exactly the same reason: they are
     shells now (see the note at the top of sources.html). `js/locales` is a DIRECTORY on purpose —
     adding a language must not also mean editing this list, which is the whole promise of #R218. */
  'css/pages.css',
  /* (#R280) …and the typeface those pages declare. Measured in the BUILT site: this was 404 on
     sources.html and science.html from #R242 until now, so both rendered in the browser's default
     face. Nothing caught it because the asset check treats everything under css/ as bundled —
     true for index.html, false for a page that is copied verbatim. tests/r280 ⑨ now checks the
     standalone pages against this list directly. */
  'css/fonts.css',
  /* ⚠ (#R231) js/lang-registry.js IS PART OF THOSE TWO PAGES NOW, and this line is the reason the
     round nearly shipped without it: js/page-i18n.js no longer carries its own five-row language
     list — it reads the app's ONE registry — and the two shells load it with a plain <script src>.
     Missing from this list it is simply absent from dist/, `window.IntMapLang` is undefined on the
     page, and page-i18n falls back to its five literals: the picker silently loses Chinese again,
     which is the exact defect this round set out to fix. Caught by opening the built page. */
  'js/lang-registry.js',
  'js/page-i18n.js',
  'js/sources-list.js',
  /* (#R280) the Terms and the Privacy Policy as ORDINARY PAGES with their own URL — a policy that
     can only be reached by opening the app and clicking a footer link cannot be linked to, cited
     or read by someone deciding whether to sign in at all. Same shape as the two pages above:
     shells served verbatim, so everything they <script src> has to be copied too. js/legal-text.js
     is served RAW here AND bundled into the app (src/main.js imports it) for the same reason
     js/reference-data.js is: it is the ONE copy of the text, and copying it is how the page avoids
     becoming a second one that goes stale. */
  'privacy.html',
  'terms.html',
  'js/legal-text.js',
  'js/legal-page.js',
  'js/locales',
  'google0266d9db8efbc48c.html',        // Google Search Console site verification
  'TwemojiCountryFlags.woff2',          // flag webfont, @font-face'd from the main body (#R79e)
  'og-image.jpg',                       // social preview
  'data',                               // basins / ecoregions / maddison / railways / volcanoes
  /* ⚠ (#R242) THE TYPEFACE, AND IT IS TWO KINDS OF FILE IN ONE DIRECTORY. 「IntMap内のすべての文字は
     …地名ラベルも例外ではない。（恒久的に）」 — `fonts/*.woff2` are the bundled Inter and Pretendard
     that css/fonts.css declares, and `fonts/Inter Regular/*.pbf` are the SDF glyph atlases the map's
     symbol layers are redirected to (js/app-body.js `transformRequest`). Both are plain static files
     served from this origin; `fonts/src/Inter.ttf` is the SOURCE the atlases are generated from
     (scripts/build-glyphs.mjs) and is excluded below so a 876 KB desktop font is not deployed. */
  'fonts',
];
/* (#R242) …minus the generator's input: it belongs in the repo, not in dist/. */
export const STATIC_EXCLUDE = [
  'fonts/src',
  /* ══ ⚠ (#R311) THE SAME 9.76 MB, SHIPPED TWICE ══════════════════════════════════════════════════
     `data` is copied whole (above), and it contained BOTH representations of one dataset:
       data/ecoregions_2017.js       9,761,502 B   window.__ECOREGIONS_2017 = {…}
       data/ecoregions_2017.geojson  9,761,476 B   the same object, as JSON
     MEASURED: strip the 25-byte assignment prefix and the trailing semicolon from the .js and the
     remainder is SHA-256-identical to the .geojson. A session loads exactly one of them, so the
     second was 9.76 MB of deploy — 8 % of the whole tree — that no visitor could ever use.

     The .js exists because of #R13b, and that round's reason is worth reading before undoing this:
     the site was then opened as `file:///…/index.html`, where Chrome blocks fetch() of a local file,
     so the data had to arrive through a <script> tag. That is no longer a situation this app can be
     in — since #R175 index.html loads `<script type="module" crossorigin>`, which `file://` refuses
     outright, and AGENTS.md §2 records `file://` as unsupported. The scenario the second copy was
     for cannot occur, and it was costing every visitor's CDN and every deploy.

     ⚠ NOTHING IS DELETED. The .js stays in the repository (it is the input the .geojson-only deploy
     could be rebuilt from, and #R13b's technique still works if a `file://` build is ever wanted);
     it simply stops being copied into dist/. js/layer-packs.js `window.__loadEcoregions` keeps both
     paths and only their ORDER changed — fetch first, <script> second — so no branch was removed.
     JSON.parse is also the faster of the two: the <script> form makes V8 parse 9.76 MB as JavaScript
     source, on the main thread, where JSON.parse has a dedicated fast path. */
  'data/ecoregions_2017.js',
  /* ══ (#R521) EVIDENCE FOR THE BUILD, NOT A PAYLOAD FOR THE BROWSER ═══════════════════════════
     data/histcities-homonyms.json.gz is every settlement on Earth answering to one of the
     historical-city record's spellings — the file `npm run check:histcities` uses to prove
     that a row's guard radius reaches its own city and no other. Nothing in js/ or src/ fetches
     it, and nothing ever should: the answer it certifies is already baked into the `g` field of
     data/hist-cities.json, which the app does load. Copying it would ship 30 kB to every visitor
     to re-litigate a question that was settled at build time. */
  'data/histcities-homonyms.json.gz',
  /* ══ (#R322) THE SAME PICTURE, AND ONLY THE HASHED ONE IS REACHABLE ════════════════════════════
     `ROOT_PNG()` below copies every PNG at the repo root, which is right for the Köppen and precip
     rasters (fetched by name at run time) and wrong for this one. css/intmap.css is BUNDLED, so
     Rollup rewrote its `url("../IntMap.Icon_BW-inverted.png")` to the content-hashed asset —
     MEASURED in this build: dist/assets/main-C6BGNtdu.css names IntMap.Icon_BW-inverted-DRdX9VA0.png
     and NOTHING names the unhashed copy. `grep -rl` over the whole of dist/ finds exactly one file
     containing the plain spelling, dist/index.html, and it is inside the `<!-- -->` block at :212
     that QUOTES the original request. 206,207 B that no visitor could ever fetch.
     ⚠ IntMap.Icon.png is NOT here and must not be: the four standalone shells (privacy / science /
     sources / terms) load `./IntMap.Icon.png` with a plain <link>, so the unhashed copy of THAT one
     is the only one they can reach.
     ⚠ NOTHING IS DELETED. The file stays in the repository — it is the source css/intmap.css names
     and the input Rollup hashes; it simply stops being copied a second time. */
  'IntMap.Icon_BW-inverted.png',
  /* ══ (#R322) FIVE SIDECARS THE BUILD WRITES AND THE BROWSER NEVER ASKS FOR ═════════════════════
     Each is a manifest a generator in scripts/ emits beside the payload it describes, and in every
     case the app reads the payload directly with dimensions of its own:
       data/bathymetry.json     js/bathymetry.js fetches only :34 data/bathymetry.png — the JSON is
                                named in a COMMENT at :30 saying the hard-coded W/H must match it
       data/land-mask.json      js/land-mask.js:41 builds the .png URL and nothing else
       data/planets.json        scripts/build-planet-data.mjs's manifest; js/space.js takes its ids
                                from the BODIES table at :111, not from a fetch
       data/stars.json          the consumer is stars.bin (js/space-sky.js:155, js/space.js:340)
       data/world-basemap.json  js/world-base.js / js/space.js / js/cesium-engine.js name the .jpg
     VERIFIED against the BUILT output rather than the source, which is the only place that can
     settle it: zero occurrences of any of the five spellings across dist/assets/, dist/index.html,
     dist/sw.js and every manifest in dist/data/. 4,866 B — small, and the point is not the bytes:
     an unfetchable file in the deploy is a claim about the app that is not true. */
  'data/bathymetry.json',
  'data/land-mask.json',
  'data/planets.json',
  'data/stars.json',
  'data/world-basemap.json',
];
/* …plus every root-level PNG (the four Köppen periods × two resolutions, and the layer previews). */
const ROOT_PNG = () => readdirSync(ROOT).filter((f) => f.endsWith('.png'));

function copyStatic() {
  return {
    name: 'intmap-copy-static',
    apply: 'build',
    closeBundle() {
      const out = join(ROOT, 'dist');
      for (const rel of [...STATIC_ASSETS, ...ROOT_PNG()]) {
        const from = join(ROOT, rel);
        if (!existsSync(from)) { this.warn(`static asset missing, not copied: ${rel}`); continue; }
        /* ⚠ (data-outside-git) `dereference`: data/border-detail is a LINK into the data store outside git
           (data-assets.json — a junction on Windows, a symlink on the runners). dist/ is what Pages
           publishes, so it must hold the bytes, never a link to a path on the machine that built it. */
        cpSync(from, join(out, rel), { recursive: statSync(from).isDirectory(), dereference: true,
          filter: (src) => !STATIC_EXCLUDE.some((ex) => src.replace(/\\/g, '/').endsWith('/' + ex)) });
      }
    },
  };
}

/* ── (installable-app) THE APP SHELL, WRITTEN INTO THE WORKER ─────────────────
   sw.js keeps a copy of what the app needs to open, so an installed IntMap starts without a network.
   Which files those are is the build's knowledge, not a person's: scripts/app-shell.mjs reads the EAGER
   set scripts/build-report.mjs measured in generateBundle (this same build), adds what dist/index.html
   and its manifest name, and writes the list and the build stamp into dist/sw.js. ⚠ It runs after
   copyStatic, which is what puts sw.js in dist/ (hooks run in plugin order; `sequential` makes that a
   promise rather than a coincidence of copyStatic being synchronous) — and it throws, failing the build,
   if the token is gone or a named file is missing, so a worker can never ship with a shell that is not
   this build's. */
function appShell() {
  return {
    name: 'intmap-app-shell',
    apply: 'build',
    closeBundle: {
      sequential: true,
      handler() {
        const shell = injectAppShell(join(ROOT, 'dist'), JSON.parse(readFileSync(REPORT_PATH, 'utf8')));
        this.info?.(`app shell: ${shell.immutable.length + shell.mutable.length} files, ${(shell.bytes / 1024).toFixed(0)} kB, build ${shell.build}`);
      },
    },
  };
}

/* ── (hist-vector-tiles) THE HISTORICAL RECORDS, CUT BY TIME ─────────────────
   js/hist-bundles.js reads each ring-pooled record under data/ as an index and an archive of gzip members
   in dist/data/hvt/, taking only the chunks an instant needs with Range requests. They are DERIVED here,
   from the records the copy above has just shipped, by scripts/build-hist-tiles.mjs — which reads every
   chunk back through the door's own job and throws on any difference, so a build cannot ship tiles that
   are not the record. Cut once per content (a store outside the checkout keeps them by hash), so the
   build pays the ~30 s only when a record or the cutter changes. */
function histTiles() {
  return {
    name: 'intmap-hist-tiles',
    apply: 'build',
    async closeBundle() {
      const { buildTiles } = await import('./scripts/build-hist-tiles.mjs');
      await buildTiles({ dataDir: join(ROOT, 'data'), outDir: join(ROOT, 'dist', 'data', 'hvt'), log: () => {} });
    },
  };
}

/* ── (#R221) KaTeX, FOR THE TWO STATIC PAGES ─────────────────────────────────
   「数式はそのままのテキストだから、もっとちゃんとした数式用のテキストに。」
   science.html is a SHELL served verbatim (see STATIC_ASSETS above) — it is not part of the app
   bundle, so the `katex` dependency Rollup already chunks for index.html is unreachable from it.
   The three things a browser needs to typeset — the stylesheet, the renderer and the fonts — are
   therefore copied out of node_modules into dist/katex/, and js/page-i18n.js loads them lazily and
   ONLY when a document actually contains a `['tex', …]` block. A page with no mathematics on it
   pays nothing, and a page whose fonts fail to arrive falls back to the monospace line the
   equations used to be (see renderBlock). */
const KATEX_SRC = join(ROOT, 'node_modules', 'katex', 'dist');
const KATEX_FILES = ['katex.min.css', 'katex.min.js'];
function katexAssets() {
  return {
    name: 'intmap-katex-assets',
    apply: 'build',
    closeBundle() {
      if (!existsSync(KATEX_SRC)) { this.warn('katex/dist not found — the science page will show plain-text equations'); return; }
      const out = join(ROOT, 'dist', 'katex');
      for (const f of KATEX_FILES) {
        const from = join(KATEX_SRC, f);
        if (existsSync(from)) cpSync(from, join(out, f));
      }
      const fonts = join(KATEX_SRC, 'fonts');
      if (existsSync(fonts)) cpSync(fonts, join(out, 'fonts'), { recursive: true });
    },
  };
}

/* ── ⚠ THE ADMIN CONSOLE'S SUPABASE SDK, VENDORED ────────────────────────────
   admin.html used to load the SDK with
       <script src="supabase.js"></script>
       <script>window.supabase||document.write('<scr'+'ipt src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">…')</script>
   and `supabase.js` HAS NEVER EXISTED in this repo — MEASURED on production, admin.html reached the
   fallback every single time. So the operator console's authentication code was, in practice, a
   floating major-version tag fetched from a third-party CDN and injected with document.write: no
   pinned version, no integrity, no subresource this project controls, and a parser-blocking write
   that runs whatever that URL answers with.
   The SDK is already a dependency of this repo, pinned exactly in package.json (the version lives
   there only — a copy of it in this comment outlived the pin it described).
   Copying its UMD build here gives admin.html the SAME API from OUR origin at a version the
   lockfile decides, which is what lets admin.html's CSP drop the CDN host entirely. */
const SB_UMD = join(ROOT, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
const SB_VENDOR_URL = '/vendor/supabase-js.js';
function supabaseAdminSdk() {
  return {
    name: 'intmap-supabase-admin-sdk',
    apply: 'build',
    closeBundle() {
      if (!existsSync(SB_UMD)) { this.error('@supabase/supabase-js UMD build not found — admin.html would have no SDK'); return; }
      cpSync(SB_UMD, join(ROOT, 'dist', 'vendor', 'supabase-js.js'));
    },
  };
}
/* …and the same path out of node_modules for `vite dev`, exactly as cesiumDevAssets does below. */
function supabaseAdminSdkDev() {
  return {
    name: 'intmap-supabase-admin-sdk-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url || '').split('?')[0] !== SB_VENDOR_URL) return next();
        if (!existsSync(SB_UMD)) return next();
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        createReadStream(SB_UMD).pipe(res);
      });
    },
  };
}

/* ── (#R180) CESIUM'S RUNTIME DIRECTORIES ────────────────────────────────────
   Cesium is not only a JS module: it resolves Workers/, Assets/, ThirdParty/ and
   Widgets/ at RUN TIME against `window.CESIUM_BASE_URL`, so bundling the module
   is not enough — the four directories have to be served too. They come out of
   node_modules at build time (≈8 MB, and never committed: dist/ is gitignored and
   built in CI), and the dev server maps the same path onto node_modules so one
   value of CESIUM_BASE_URL works for `vite dev`, `npm run serve` and Pages alike.

   Nothing here is loaded unless the user chooses Cesium in Settings: the app's
   own import of it is dynamic (js/engine-select.js), so a MapLibre session never
   requests the chunk and never touches these files. */
const CESIUM_SRC = join(ROOT, 'node_modules', 'cesium', 'Build', 'Cesium');
const CESIUM_DIRS = ['Workers', 'Assets', 'ThirdParty', 'Widgets'];
function cesiumAssets() {
  return {
    name: 'intmap-cesium-assets',
    apply: 'build',
    closeBundle() {
      if (!existsSync(CESIUM_SRC)) { this.warn('cesium runtime assets not found — the Cesium engine will not start'); return; }
      for (const d of CESIUM_DIRS) {
        const from = join(CESIUM_SRC, d);
        if (existsSync(from)) cpSync(from, join(ROOT, 'dist', 'cesium', d), { recursive: true });
      }
    },
  };
}
/* `vite dev` has no dist/ to copy into, so the same path is served out of
   node_modules — one value of CESIUM_BASE_URL for every way the site runs. */
function cesiumDevAssets() {
  return {
    name: 'intmap-cesium-assets-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/cesium\/(.+)$/.exec((req.url || '').split('?')[0]);
        if (!m) return next();
        const f = join(CESIUM_SRC, decodeURIComponent(m[1]));
        if (!f.startsWith(CESIUM_SRC) || !existsSync(f)) return next();
        res.setHeader('Cache-Control', 'public, max-age=3600');
        createReadStream(f).pipe(res);
      });
    },
  };
}

/* The two predicates the chunk groups below are written in. Module ids are compared with forward
   slashes whatever the platform, and a package is matched by the PREFIX of its node_modules path —
   the same test the Rollup-era manualChunks made, so `cesium` still means the `cesium` package and
   not `@cesium/engine` (which reaches the cesium chunk as a dependency of it, as it always did). */
const slash = (id) => id.replace(/\\/g, '/');
const inPackage = (id, ...pkgs) => pkgs.some((p) => slash(id).includes('node_modules/' + p));
const isBundlerHelper = (id) => id.startsWith('\0') && !slash(id).includes('node_modules/');

/* ══ ⚠⚠ (Turf 7) WHICH @turf MODULES BELONG IN THE EAGER `geo` CHUNK IS DISCOVERED, NOT LISTED ══════
   The geo group used to be «every @turf / topojson-client module, except the ones on this hand-written
   list» (turf-jsts, polygon-clipping, @turf/buffer, @turf/convex, splaytree, concaveman). Turf 7
   renamed buffer's 272 kB geometry engine from `turf-jsts` to `@turf/jsts` — inside @turf/, so the
   prefix claimed it and the list did not know it. MEASURED (Vite 6 build, same tree): eager raw
   4.78 → 5.06 MB, and the async total fell by the same 304 kB, because the module behind
   `window.turf.ensureHeavy()` had been moved into the chunk every session loads. A list of what is
   lazy is exactly the photograph that misses the next thing to become lazy.
   So the question is asked of the graph: a @turf / topojson-client module is `geo` iff some chain of
   STATIC importers leads from it back to an entry. Anything only a dynamic `import()` reaches
   (buffer, convex, union and whatever they depend on, whatever it is called next release) gets no
   name from this group, which leaves it in the chunk its import() creates.
   Rolldown hands a group's `name()` a chunking context whose ModuleInfo objects «are reused within
   the current chunking pass», so the memo is keyed on those objects: a new pass has new objects,
   and a verdict cannot outlive the graph it was computed on. */
const _staticReach = new WeakMap();
function staticallyReached(id, getModuleInfo) {
  const start = getModuleInfo(id);
  if (!start) return false;
  if (_staticReach.has(start)) return _staticReach.get(start);
  const seen = new Set([id]), stack = [start], visited = [start];
  let hit = false;
  while (stack.length && !hit) {
    const info = stack.pop();
    if (info.isEntry || _staticReach.get(info) === true) { hit = true; break; }
    for (const imp of info.importers) {
      if (seen.has(imp)) continue;
      seen.add(imp);
      const up = getModuleInfo(imp);
      if (up) { stack.push(up); visited.push(up); }
    }
  }
  /* a hit proves only the start (the walk stopped early); a miss proves every module it walked */
  if (hit) _staticReach.set(start, true); else for (const v of visited) _staticReach.set(v, false);
  return hit;
}

/* ══ ⚠⚠ (MapLibre 6) ONE COPY OF THE SHARED CODE, FOR THE RENDERER AND FOR ITS WORKER ══════════════════
   MapLibre 6 publishes three ES modules and says how they fit together (node_modules/maplibre-gl/build/
   readme.md, and the worker factory in dist/maplibre-gl.mjs): the renderer (maplibre-gl.mjs) and the
   worker (maplibre-gl-worker.mjs) both import the third, maplibre-gl-shared.mjs, and the renderer starts
   the worker as a MODULE worker (`new Worker(url, {type:'module'})`). Served that way, the shared code
   crosses the network once — the worker's `import` of it is answered by the HTTP cache the page filled.
   The migration first handed the worker to Vite's `?worker&url`, which builds it as a SEPARATE bundle
   with the shared module copied inside: MEASURED, 516 kB of shared code shipped twice, the boot's
   brotli +119 kB (dev-notes/2026-09-27-maplibre-6-migration.md §4).
   So the worker is emitted as one more ENTRY CHUNK OF THIS BUILD (`emitFile({type:'chunk'})`): it sits in
   the same module graph as the renderer, the bundler gives the modules both of them import one chunk
   (the `maplibre-gl-shared` group below), and the worker chunk's `import` names that same file. The URL
   reaches src/vendor.js through `virtual:maplibre-gl-worker-url` (`import.meta.ROLLUP_FILE_URL_*`, hashed
   with the rest of the build), and vendor.js still hands it to setWorkerUrl before the first Map.
   ⚠ WHAT GOES IN THE SHARED CHUNK IS ASKED OF THE GRAPH, NOT LISTED: a module is shared iff the worker
   entry reaches it by static imports (`inWorkerGraph`). That is the property that matters — the worker
   EVALUATES every module of every chunk it imports, so a chunk it loads must hold nothing but its own
   graph (the renderer's main-thread code, or Vite's modulepreload polyfill, would run in the worker and
   touch `document`). generateBundle below proves it on the finished bundle and fails the build if not.
   ⚠ `vite dev` has no chunks: there the same virtual module answers with Vite's dev worker URL (the
   file served out of node_modules, which imports its sibling from node_modules — what `?worker&url`
   has always done in dev). */
const ML_WORKER_SPEC = 'maplibre-gl/dist/maplibre-gl-worker.mjs';
const ML_WORKER_URL_ID = 'virtual:maplibre-gl-worker-url';
/* the resolved id of the worker entry, set by the plugin when it emits the chunk and read by the chunk
   groups below (they run after the module graph is complete, i.e. after the plugin's load) */
const mlWorker = { id: null };
const _workerGraph = new WeakMap();
function inWorkerGraph(id, getModuleInfo) {
  const root = mlWorker.id && getModuleInfo(mlWorker.id);
  if (!root) return false;
  let set = _workerGraph.get(root);
  if (!set) {
    set = new Set();
    const stack = [mlWorker.id];
    while (stack.length) {
      const m = stack.pop();
      if (set.has(m)) continue;
      set.add(m);
      const info = getModuleInfo(m);
      if (info) for (const d of info.importedIds) stack.push(d);
    }
    _workerGraph.set(root, set);
  }
  return set.has(id);
}
export function maplibreSharedWorker() {
  const RESOLVED = '\0' + ML_WORKER_URL_ID;
  let serve = false;
  return {
    name: 'intmap-maplibre-shared-worker',
    configResolved(c) { serve = c.command === 'serve'; },
    resolveId(id) { return id === ML_WORKER_URL_ID ? RESOLVED : null; },
    async load(id) {
      if (id !== RESOLVED) return null;
      if (serve) return `export { default } from ${JSON.stringify(ML_WORKER_SPEC + '?worker&url')};`;
      const r = await this.resolve(ML_WORKER_SPEC);
      if (!r || r.external) this.error(`${ML_WORKER_SPEC} does not resolve — MapLibre would have no worker`);
      mlWorker.id = r.id;
      const ref = this.emitFile({ type: 'chunk', id: r.id, name: 'maplibre-gl-worker' });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
    generateBundle(_o, bundle) {
      if (serve || !mlWorker.id) return;
      const chunks = Object.values(bundle).filter((o) => o.type === 'chunk');
      const worker = chunks.find((c) => c.isEntry && c.facadeModuleId === mlWorker.id);
      if (!worker) { this.error('the MapLibre worker was not emitted as a chunk'); return; }
      const byName = new Map(chunks.map((c) => [c.fileName, c]));
      const graph = (m) => this.getModuleInfo(m);
      const seen = new Set(), q = [worker.fileName], alien = [];
      while (q.length) {
        const f = q.shift();
        if (seen.has(f)) continue;
        seen.add(f);
        const c = byName.get(f);
        for (const id of Object.keys(c.modules)) if (!inWorkerGraph(id, graph)) alien.push(`${id} (in ${f})`);
        for (const i of c.imports) q.push(i);
      }
      if (alien.length) this.error(`the MapLibre worker would evaluate modules it does not import — ${alien.slice(0, 8).join(', ')}`);
    },
  };
}

export default defineConfig({
  root: ROOT,
  base: './',
  publicDir: false,
  /* (#R184) satellite.js 7 re-exports an OPTIONAL WebAssembly accelerator whose two Emscripten entry
     points use top-level `await` and import `node:module` / `node:worker_threads`. They are reached
     through the package-internal subpath imports below, and because the package declares no
     `sideEffects` field Rollup keeps them in the graph even though nothing references them — the
     build then fails with «Module format "iife" does not support top-level await». IntMap uses the
     pure-JS SGP4/SDP4 path only (a few hundred objects a second, not a 30,000-object catalogue), so
     both are pointed at a stub that throws if it is ever actually called. See the stub for the full
     reasoning; tests/r184-checks.test.mjs pins this so a dependency bump cannot quietly undo it.
     ⚠ (supabase-js 2.117) the second alias does the same for the Supabase Storage and Functions
     clients, which `createClient` imports and constructs whether or not anything uses them. IntMap
     uses neither (Edge Functions are called with fetch; there is no bucket); MEASURED, they were
     31.3 kB of the eager `supabase` chunk. src/supabase-unbundled-stub.js says what fails, and how
     loudly, if something ever reaches for them; tests/deps-runtime-majors-checks.test.mjs fails
     first. admin.html loads the SDK's complete UMD build and is not affected. */
  resolve: {
    alias: [{ find: /^#wasm-(single|multi)-thread$/, replacement: resolve(ROOT, 'src/satellite-wasm-stub.js') },
      { find: /^@supabase\/(storage|functions)-js$/, replacement: resolve(ROOT, 'src/supabase-unbundled-stub.js') }],
    /* ══ `module` BEFORE `browser` — WHAT VITE 6 CHOSE, NOW SAID INSTEAD OF SNIFFED ════════════════
       Until Vite 8, a package that declares BOTH a string `browser` and a `module` field was resolved
       by reading the `browser` file: if it was not ESM (a UMD bundle), Vite took `module`. Vite 8
       removed that sniffing and follows `mainFields` in order, and its default puts `browser` first.
       MEASURED on the first vite 8.3.1 build: three packages silently changed file — polygon-clipping
       (esm.js → umd.js, in the EAGER geo chunk), turf-jsts (jsts.mjs → jsts.min.js) and html2canvas
       (esm.js → the UMD dist/html2canvas.js) — each an ES module traded for a UMD bundle that the
       bundler can neither tree-shake nor interop the way it did.
       The order below reproduces the old choice for the whole tree rather than for those three
       names: in this node_modules every package with both fields and no `exports` has a NON-ESM
       `browser` file (counted, not assumed — dev-notes/2026-09-27-vite-8-migration.md), which is
       exactly the case where Vite 6 picked `module`. A `browser` OBJECT (a file-to-file map) is still
       honoured, because 'browser' stays in the list; only the string form loses its precedence.
       ⚠ It is Vite's own default order with one swap (`module` ahead of `browser`); a package whose
       `exports` answers is resolved by `exports` and never reaches this list. */
    mainFields: ['module', 'browser', 'jsnext:main', 'jsnext'],
  },
  /* ⚠ (#R311) …AND THE ALIAS ABOVE DOES NOT REACH THE DEV SERVER, so `npm run dev` did not start.
     MEASURED on origin/main before this round touched anything: `npx vite` dies in dependency
     pre-bundling with «Top-level await is not available in the configured target environment» from
     satellite.js/wasm-build/pthreads-release/index.js. The reason is that `resolve.alias` is a Vite
     resolver rule and the pre-bundler is esbuild running its own scan — it walks the package's
     `imports` map itself and reaches the two Emscripten entry points the alias exists to replace.
     Production was never affected (Rollup does honour the alias, which is why the build has always
     worked), so this was invisible to CI and to every round that only ever ran `npm run build`.
     Excluding the package from pre-bundling makes dev resolve it through the same aliased path the
     build uses. The dependency is dynamically imported from ONE place (js/satellites-live.js) and
     never at boot, so there is nothing here for the optimizer to have been saving.
     ⚠ UNDER VITE 8 THE PRE-BUNDLER IS ROLLDOWN, AND THE EXCLUSION NOW HOLDS FOR THE OTHER HALF OF ITS
     REASON. MEASURED with vite 8.3.1's optimizer run on satellite.js and nothing excluded (no server
     started): it no longer dies — its ESM output accepts top-level await — but the alias still does
     not reach it, and it bundles the real Emscripten entry (`await import("./pthreads-release-….js")`)
     where the build has the stub. Without this line `npm run dev` would run a different satellite.js
     from the one production ships. */
  optimizeDeps: { exclude: ['satellite.js'] },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    /* index.html is the app; admin.html is a separate operator page that must keep working. */
    rolldownOptions: {
      input: { main: resolve(ROOT, 'index.html'), admin: resolve(ROOT, 'admin.html') },
      output: {
        /* ══ THE FOUR NAMED CHUNKS, AS PRIORITISED GROUPS ════════════════════════════════════════
           Vite 8 bundles with Rolldown, which has no Rollup `manualChunks` of its own: the function
           form is a deprecated shim that becomes ONE group whose `name()` is that function, and a
           Rolldown group captures a module's dependencies too (`includeDependenciesRecursively`,
           default true). So whichever named module the traversal met first decided where every
           shared dependency went, and naming a module did NOT keep it out of another group.
           MEASURED with the Rollup-era function left in place (vite 8.3.1): `cesium` captured
           `\0vite/preload-helper.js`, the Oxc class-field helpers and topojson-client, main
           imported all three from it, and the second engine became eager — eager raw 4.78 → 9.45 MB,
           requests 6 → 8, modules 306 → 1733. That is the same failure the helper rule below was
           written for under Rollup, reached by a different road.
           Groups with a `priority` are the Rolldown way to say "this module belongs HERE even if
           a lower group depends on it": a higher group takes its modules (and their dependencies)
           first, and a lower group cannot take them back. The order below is therefore the rule —
           helpers and the renderer, then the two eager libraries, then the lazy engine last.
           ⚠ (fetch-deadline-layer) THE UNNAMED EAGER MODULES REACH main BY A MERGE, AND THE MERGE
           REFUSES CYCLES. An app module that main AND some lazy chunk import is first given a common
           chunk of its own; Rolldown's chunkOptimization (mergeCommonChunks, default on) then folds it
           into main "when it does not create a circular chunk dependency" (its own documentation).
           MEASURED with `experimental.chunkOptimization: false`: 8 such chunks — js/fetch-deadline.js,
           js/proxy-fetch.js, atlas-capabilities, atlas-persona, lifted-projection, nominatim-gate,
           runtime, ui.en — and eager.requests 17. With the default, all folded back except ONE:
           when js/fetch-deadline.js gained `import { clockFor } from './proxy-fetch.js'`, proxy-fetch
           stayed out (requests 9 → 10, modules unchanged at 284) while fetch-deadline went in. It is
           the only one of the eight that imported another of them, and folding the imported one
           first would make main → fetch-deadline → main a cycle. Turning off either optimisation
           alone leaves both out (11). So a static import between two modules that are each shared
           with lazy chunks costs every session a request; the fix was to remove that edge (js/app-body.js,
           in main alone, assembles what needed both), not to name a group here. */
        codeSplitting: {
          groups: [
            /* MapLibre is by far the largest dependency and it changes on its own release cadence, so
               it gets a stable chunk of its own: a change anywhere in IntMap then leaves the
               renderer's hashed filename — and therefore the returning visitor's cache entry —
               untouched.
               The name is 'maplibre-gl', not 'maplibre', on purpose. MapLibre's worker serializer
               overflows the stack when the country FeatureCollection is re-broadcast (a real MapLibre
               bug recorded in #R166, reproduced on every tree since), and the browser suites tell
               that known renderer fault apart from an app fault by looking for "maplibre-gl" in the
               stack — which used to be the CDN filename. Naming the chunk after the package keeps a
               stack trace attributable to the library it came from.
               ⚠⚠ THE BUNDLER'S OWN RUNTIME HELPERS ARE PLACED HERE, IN A CHUNK EVERY SESSION LOADS.
               `\0vite/preload-helper.js` is a dependency of EVERY module that contains a dynamic
               import() — main's included — and Cesium's @zip.js/zip.js has one of its own
               (zip-writer.js `await import("./zip-reader.js")`), so a lazy chunk that captures its
               dependencies captures the helper too, and main then has to import it from there.
               MEASURED under Rollup when Cesium 1.145 arrived: eager raw 4.77 → 9.72 MB, requests
               6 → 7, modules 306 → 1746. The same holds for Rolldown's `\0rolldown/runtime.js` and
               the `\0@oxc-project+runtime/helpers/*` that lower class fields for `target` below —
               both engines and main need them. So the rule is not "the helper goes next to
               MapLibre" but "a helper every chunk may depend on must never be captured by a LAZY
               chunk"; the renderer chunk is the one eager chunk that exists for the same lifetime as
               the page (and without this group Rolldown gives its runtime a request of its own).
               The ids are virtual (`\0`-prefixed) and carry no node_modules/ path, which is what
               separates them from a package's own modules.
               ⚠ (MapLibre 6) THE PACKAGE IS THREE FILES NOW, AND THEY ARE THREE CHUNKS.
               6.x is ESM-only: dist/maplibre-gl.mjs (the renderer) and dist/maplibre-gl-worker.mjs
               both import dist/maplibre-gl-shared.mjs. The worker is an entry chunk of its own
               (maplibreSharedWorker above), and what it reaches — the shared module, and any helper
               the bundler injected into it — goes to `maplibre-gl-shared` FIRST (the higher priority),
               so the renderer and the worker import one file. Everything else of the package, and
               the bundler's helpers the worker does not use, stays here. The rule is the graph's
               (`inWorkerGraph`), not a file name; the build fails if the worker's chunks ever hold a
               module outside its graph. Both chunk names still carry "maplibre-gl" (the #R166
               stack attribution above reads the name, and a worker stack names its chunk too). */
            { name: (id, ctx) => (id !== mlWorker.id && inWorkerGraph(id, (m) => ctx.getModuleInfo(m)) ? 'maplibre-gl-shared' : null),
              debugName: 'maplibre-gl-shared', priority: 5, test: (id) => isBundlerHelper(id) || inPackage(id, 'maplibre-gl') },
            { name: (id, ctx) => (inWorkerGraph(id, (m) => ctx.getModuleInfo(m)) ? null : 'maplibre-gl'),
              debugName: 'maplibre-gl', priority: 4, test: (id) => isBundlerHelper(id) || inPackage(id, 'maplibre-gl') },
            /* ⚠ (#R209) buffer + convex (and their geometry engine) are NOT in the eager geo chunk: the
               app calls them from ONE place (the reachable-area hull in js/sims.js, which awaits
               window.turf.ensureHeavy()), and naming them here would drag them back in with the rest
               of turf. Since Turf 7 the same holds for union (window.turf.ensureUnion()).
               ⚠⚠ (#R734, and why it is resolved) #R734 measured polygon-clipping in the eager
               `geo-<hash>.js` although nothing named it. The reason was not the bundler ignoring the
               rule: @turf/union 6.5 was a thin wrapper that STATICALLY imported polygon-clipping, and
               union sat in the eager turf object, so the sweep-line was a static dependency of the
               boot path (and a Rolldown group captures a member's dependencies). Turf 7's union no
               longer uses it and is lazy besides — MEASURED, polygon-clipping is now its own async
               chunk (`polygon-clipping.esm`) reached only by its three dynamic importers.
               The hand-written exclusion list that stood here is replaced by the reachability question
               above `defineConfig` (staticallyReached): `test` says which packages the group is
               about, `name` says whether this module of theirs is on the boot path.
               The priority is ABOVE cesium's for a measured reason: Cesium's GeoJsonDataSource
               depends on topojson-client, and at equal footing the lazy engine captured it — main
               then imported topojson from the cesium chunk. */
            { name: (id, ctx) => (staticallyReached(id, (m) => ctx.getModuleInfo(m)) ? 'geo' : null), debugName: 'geo',
              priority: 3, test: (id) => inPackage(id, '@turf', 'topojson-client') },
            { name: 'supabase', priority: 3, test: (id) => inPackage(id, '@supabase') },
            /* (#R180) the SECOND engine, in a chunk of its own for the same reason as the first — and,
               far more importantly, so that the default session never asks for it. It is reached only
               through the dynamic import in js/engine-select.js, which runs when the Settings choice
               is 'cesium'. LOWEST priority: anything it shares with an eager group stays there. */
            { name: 'cesium', priority: 1, test: (id) => inPackage(id, 'cesium', '@mapbox/vector-tile', 'pbf') },
          ],
        },
      },
    },
    /* The app is one 500 KB inline body plus MapLibre; a size warning at every build is just noise. */
    chunkSizeWarningLimit: 3000,
    /* ══ ⚠ SOURCE MAPS ARE OFF UNLESS ASKED FOR ════════════════════════════════════════════════════
       `sourcemap: true` emitted dist/assets/*.map, copyStatic put dist/ into _site verbatim, and Pages
       published them: MEASURED on production, https://…/IntMap/assets/main-VdS_tG39.js.map answered
       200 with 8,810,729 bytes — every original js/ source, comment included, readable by anyone. A
       minified bundle is not an obfuscation control, but a published map is a free, complete copy of
       the tree the deploy was built from, and it is not something a visitor needs.
       IM_SOURCEMAP=1 turns them back on for a local debugging build, where they belong. */
    sourcemap: process.env.IM_SOURCEMAP === '1',
    target: 'es2020',
    /* ══ ⚠ CSS IS MINIFIED BY esbuild, AS IT WAS BEFORE VITE 8 — LIGHTNING CSS DROPS THE GLASS ══════
       Vite 8 switched the CSS minifier to Lightning CSS (1.33 here). MEASURED on the first vite 8
       build: 40 rules of dist/assets/main-*.css came out with `-webkit-backdrop-filter` ONLY — the
       unprefixed `backdrop-filter` was gone (production, minified by esbuild: 0 such rules). css/
       writes the pair as `backdrop-filter: X; -webkit-backdrop-filter: X;`, and Lightning CSS reads
       the later prefixed declaration as overriding the earlier standard one, for every target set
       tried (Chrome-only included). The other prefixed pairs css/ uses (user-select, mask,
       appearance) survive; this one does not. Chromium does NOT accept the prefixed spelling —
       measured in the suite's own headless Chromium: CSS.supports('-webkit-backdrop-filter', …) is
       false and the computed backdrop-filter is `none` — so the sidebar, the dropdowns and the
       sheets lose their blur on Chrome and Edge (and Firefox, which never had the prefix).
       esbuild minifies without merging vendor pairs and is a declared devDependency, so this keeps
       the stylesheet the deploy has always shipped. Revisit when Lightning CSS keeps the standard
       declaration of that pair — dev-notes/2026-09-27-vite-8-migration.md has the reproduction. */
    cssMinify: 'esbuild',
    cssCodeSplit: true,
    reportCompressedSize: false,
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, strictPort: false },
  /* (#R311) …and the instrument that measures the result. It writes .perf/build-report.json
     from the graph Rollup finished with — which chunk is an entry, what each statically
     imports, which source module landed where — so `eager` and `async` are DERIVED rather
     than read off filenames. scripts/perf-budget.mjs is the gate that reads it; it runs on
     every build because the report is what stops "the biggest chunk is big" from being
     mistaken for "startup is slow". */
  plugins: [buildStampPlugin(ROOT), maplibreSharedWorker(), buildReportPlugin(), copyStatic(), appShell(), histTiles(), katexAssets(), supabaseAdminSdk(), supabaseAdminSdkDev(), cesiumAssets(), cesiumDevAssets()],
});
