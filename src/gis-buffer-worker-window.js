/* A worker has no `window`, and js/geodesy.js and js/gis-geometry.js publish on it. ES modules run in import
   order, so src/gis-buffer-worker.js imports this FIRST — an assignment written in the worker's own body would
   run after both of them had already thrown a ReferenceError. */
globalThis.window = globalThis;
