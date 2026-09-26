/* ============================================================================
 *  IntMap · Supabase Storage and Functions clients — deliberately not shipped
 * ----------------------------------------------------------------------------
 *  `createClient()` from @supabase/supabase-js statically imports all five sub-clients and builds
 *  `supabase.storage` in its constructor (and `supabase.functions` on first read), so the bundler
 *  cannot drop either even when nothing touches them. IntMap touches neither: every table read and
 *  write goes through `.from()` / `.rpc()` (postgrest-js), sign-in through `.auth` (auth-js), the
 *  live subscriptions through `.channel()` (realtime-js), and every Edge Function is called with a
 *  plain `fetch` to `<SUPABASE_URL>/functions/v1/<name>` (js/ai-core.js, js/auth-ui.js,
 *  js/monitors.js, js/proxy-fetch.js …) — never through `supabase.functions.invoke`. There is no
 *  Storage bucket in this project.
 *
 *  MEASURED at the 2.58 → 2.117 update: storage-js (+ iceberg-js) and functions-js were 31.3 kB of
 *  the eager `supabase` chunk (224.6 → 193.3 kB raw; eager gzip −7.3 kB) — about a third of what the
 *  update added to every session's startup. vite.config.js points both packages here.
 *
 *  This is a STUB, not a silent no-op, and it copies the shape supabase-js itself uses when auth is
 *  disabled (the `accessToken` option makes `supabase.auth` a Proxy that throws on every property):
 *  constructing the Storage client succeeds, because the SupabaseClient constructor does it
 *  unconditionally, but the first thing anything reads from it throws an error that names this
 *  file; reading `supabase.functions` throws at once. Nothing can quietly get an object that
 *  computes nothing. tests/deps-runtime-majors-checks.test.mjs fails if a `.storage.` or
 *  `.functions.` call on the client appears in js/ or src/, so the day one is needed this file is
 *  removed rather than worked around.
 *
 *  admin.html is unaffected: it loads the SDK's own UMD build (dist/vendor/supabase-js.js, copied
 *  from the same pinned package by vite.config.js), which is complete.
 * ==========================================================================*/
function refuse(what) {
  throw new Error(`@supabase/${what} is not bundled in IntMap (see src/supabase-unbundled-stub.js) — ` +
    'the app talks to Edge Functions with fetch and has no Storage bucket.');
}

export class StorageClient {
  constructor() {
    return new Proxy({}, { get: (_, prop) => refuse(`storage-js: supabase.storage.${String(prop)}`) });
  }
}
export class FunctionsClient {
  constructor() { refuse('functions-js: supabase.functions'); }
}

/* The names supabase-js re-exports from the two packages. They are error classes and an enum that
   only a caller of those clients would ever meet; they exist here so the SDK's own export list
   still resolves. */
export class StorageApiError extends Error {}
export class FunctionsError extends Error {}
export class FunctionsFetchError extends FunctionsError {}
export class FunctionsHttpError extends FunctionsError {}
export class FunctionsRelayError extends FunctionsError {}
export const FunctionRegion = Object.freeze({});
