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
import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);

/* Root-level files and directories GitHub Pages must keep serving as-is. Globs are resolved against
   the repo root; a directory is copied whole. Keep in step with tests/r175-checks.test.mjs. */
export const STATIC_ASSETS = [
  'sw.js',                              // tile-cache service worker (registered by index.html)
  'admin.html',                         // the ops console — its own page, not part of the app bundle
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

export default defineConfig({
  root: ROOT,
  base: './',
  publicDir: false,
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
  plugins: [copyStatic()],
});
