/* ============================================================================
 *  IntMap · satellite.js WASM accelerator — deliberately not shipped  (#R184)
 * ----------------------------------------------------------------------------
 *  satellite.js 7 ships an OPTIONAL WebAssembly accelerator for bulk propagation, reached through the
 *  package-internal subpath imports `#wasm-single-thread` / `#wasm-multi-thread`. Those two files are
 *  Emscripten output: they use top-level `await` and they import `node:module` and
 *  `node:worker_threads`, so a browser bundle cannot contain them — Rollup fails outright with
 *  «Module format "iife" does not support top-level await», which is how this file came to exist.
 *
 *  IntMap does not use the accelerator. The satellite layer propagates a few hundred objects once a
 *  second, which the pure-JS SGP4 does comfortably; the WASM path exists for catalogues of tens of
 *  thousands, and it would additionally require serving the .wasm binaries. vite.config.js therefore
 *  points both subpath imports here.
 *
 *  This is a STUB, not a silent no-op: nothing in the app calls createSingleThreadRuntime() or
 *  createMultiThreadRuntime(), and if anything ever did, it must fail loudly rather than return an
 *  object that quietly computes nothing. Every function IntMap actually uses — sgp4/propagate,
 *  gstime, the transforms, sunPos, shadowFraction, dopplerFactor — is pure JavaScript and is entirely
 *  unaffected by this.
 * ==========================================================================*/
export default function satelliteWasmUnavailable() {
  throw new Error(
    'satellite.js WASM accelerator is not bundled in IntMap (see src/satellite-wasm-stub.js) — ' +
    'the pure-JS SGP4/SDP4 path is the one this app uses.'
  );
}
