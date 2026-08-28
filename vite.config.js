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
import { cpSync, createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildReportPlugin } from './scripts/build-report.mjs';

const ROOT = resolve(import.meta.dirname);

/* Root-level files and directories GitHub Pages must keep serving as-is. Globs are resolved against
   the repo root; a directory is copied whole. Keep in step with tests/r175-checks.test.mjs. */
export const STATIC_ASSETS = [
  'sw.js',                              // tile-cache service worker (registered by index.html)
  'admin.html',                         // the ops console — its own page, not part of the app bundle
  /* …and the one file admin.html loads that is neither the SDK nor its own inline body: the data-literal
     PARSER that replaced the starter-dataset import's eval. Same reason as js/lang-registry.js below —
     admin.html is copied verbatim, so a plain <script src> in it resolves against dist/ and the file has
     to be there. Without it the import button says so and refuses, rather than falling back to anything. */
  'js/admin-literal.js',
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
        cpSync(from, join(out, rel), { recursive: statSync(from).isDirectory(),
          filter: (src) => !STATIC_EXCLUDE.some((ex) => src.replace(/\\/g, '/').endsWith('/' + ex)) });
      }
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
   The SDK is already a dependency of this repo, pinned exactly in package.json (@supabase/supabase-js
   2.58.0). Copying its UMD build here gives admin.html the SAME API from OUR origin at a version the
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
     reasoning; tests/r184-checks.test.mjs pins this so a dependency bump cannot quietly undo it. */
  resolve: {
    alias: [{ find: /^#wasm-(single|multi)-thread$/, replacement: resolve(ROOT, 'src/satellite-wasm-stub.js') }],
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
     never at boot, so there is nothing here for the optimizer to have been saving. */
  optimizeDeps: { exclude: ['satellite.js'] },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    /* index.html is the app; admin.html is a separate operator page that must keep working. */
    rollupOptions: {
      input: { main: resolve(ROOT, 'index.html'), admin: resolve(ROOT, 'admin.html') },
      output: {
        /* MapLibre is by far the largest dependency and it changes on its own release cadence, so it
           gets a stable chunk of its own: a change anywhere in IntMap then leaves the renderer's
           hashed filename — and therefore the returning visitor's cache entry — untouched.
           The name is 'maplibre-gl', not 'maplibre', on purpose. MapLibre's worker serializer
           overflows the stack when the country FeatureCollection is re-broadcast (a real MapLibre bug
           recorded in #R166, reproduced on every tree since), and the browser suites tell that known
           renderer fault apart from an app fault by looking for "maplibre-gl" in the stack — which
           used to be the CDN filename. Naming the chunk after the package keeps a stack trace
           attributable to the library it came from. */
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre-gl';
          /* (#R180) the SECOND engine, in a chunk of its own for the same reason as the
             first — and, far more importantly, so that the default session never asks
             for it. It is reached only through the dynamic import in
             js/engine-select.js, which runs when the Settings choice is 'cesium'. */
          if (id.includes('node_modules/cesium') || id.includes('node_modules/@mapbox/vector-tile') ||
              id.includes('node_modules/pbf')) return 'cesium';
          /* ⚠ (#R209) turf-jsts and polygon-clipping are NOT in the eager geo chunk. `@turf/convex`
             + `@turf/buffer` reach turf-jsts, which measured 332 kB — 81% of everything the geo
             chunk contained after the umbrella `import * as turf` was replaced by named imports —
             and the app calls them from ONE place (the reachable-area hull in js/sims.js, which
             now awaits window.turf.ensureHeavy()). Naming them here would drag them back in with
             the rest of turf and undo the split; leaving them unnamed lets Rollup put them in the
             dynamic chunk their only import() creates. */
          if (id.includes('node_modules/turf-jsts') || id.includes('node_modules/polygon-clipping') ||
              id.includes('node_modules/@turf/buffer') || id.includes('node_modules/@turf/convex') ||
              id.includes('node_modules/splaytree') || id.includes('node_modules/concaveman')) return;
          if (id.includes('node_modules/@turf') || id.includes('node_modules/topojson-client')) return 'geo';
          if (id.includes('node_modules/@supabase')) return 'supabase';
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
  plugins: [buildReportPlugin(), copyStatic(), katexAssets(), supabaseAdminSdk(), supabaseAdminSdkDev(), cesiumAssets(), cesiumDevAssets()],
});
