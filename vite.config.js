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

const ROOT = resolve(import.meta.dirname);

/* Root-level files and directories GitHub Pages must keep serving as-is. Globs are resolved against
   the repo root; a directory is copied whole. Keep in step with tests/r175-checks.test.mjs. */
export const STATIC_ASSETS = [
  'sw.js',                              // tile-cache service worker (registered by index.html)
  'admin.html',                         // the ops console — its own page, not part of the app bundle
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
  /* ⚠ (#R231) js/lang-registry.js IS PART OF THOSE TWO PAGES NOW, and this line is the reason the
     round nearly shipped without it: js/page-i18n.js no longer carries its own five-row language
     list — it reads the app's ONE registry — and the two shells load it with a plain <script src>.
     Missing from this list it is simply absent from dist/, `window.IntMapLang` is undefined on the
     page, and page-i18n falls back to its five literals: the picker silently loses Chinese again,
     which is the exact defect this round set out to fix. Caught by opening the built page. */
  'js/lang-registry.js',
  'js/page-i18n.js',
  'js/sources-list.js',
  'js/locales',
  /* ── THE PUBLIC HOMEPAGE ──────────────────────────────────────────────────────────────────
     「/ = IntMap本体、別URL/パスにホームページ」. index.html stays the application; this is the
     page a first-time visitor is sent to, and it is a THIRD standalone document in exactly the
     mould of the two above — static markup, one stylesheet, one script, no imports, no bundler
     input. Passing it through Rollup would produce a byte-identical file behind an extra entry
     point, so it is copied.
     ⚠ `about` is a DIRECTORY: it holds the screenshots of the running product that the page is
     mostly made of. Naming the directory (rather than each file) is what stops "add a picture"
     from also meaning "edit the build config" — the same reasoning `js/locales` above is on.
     ⚠ AND js/about.js IS REACHED ONLY FROM about.html. scripts/static-checks.mjs §8 reads the
     standalone pages for their <script src> tags precisely so that a module loaded this way is
     not reported as dead code; about.html is in that list beside sources.html and science.html. */
  'about.html',
  'css/about.css',
  'js/about.js',
  'about',
  'google0266d9db8efbc48c.html',        // Google Search Console site verification
  'TwemojiCountryFlags.woff2',          // flag webfont, @font-face'd from the main body (#R79e)
  'og-image.jpg',                       // social preview
  'data',                               // basins / ecoregions / maddison / railways / volcanoes
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
        cpSync(from, join(out, rel), { recursive: statSync(from).isDirectory() });
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
    sourcemap: true,
    target: 'es2020',
    cssCodeSplit: true,
    reportCompressedSize: false,
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, strictPort: false },
  plugins: [copyStatic(), katexAssets(), cesiumAssets(), cesiumDevAssets()],
});
