/* ============================================================================
 *  tests/helpers/field-speed-page.mjs — ONE fake page load of the real counter, in its own process  (field-speed)
 * ----------------------------------------------------------------------------
 *  js/boot-stage.js answers «has the launch screen lifted» with a once-per-page promise, and js/usage-counts.js
 *  imports it by its plain URL — so a second fake page in the same process would be handed the first page's
 *  answer. A page load is one process here, as it is one document in a browser.
 *
 *    node tests/helpers/field-speed-page.mjs '{"stamp":"…","kind":"phone","ms":2400,"why":"idle",
 *                                              "hiddenAtStart":false,"hideBeforeReady":false}'
 *  prints the rows the page's beacon carried when it was hidden, as JSON ([[metric, dimension, n], …]).
 * ==========================================================================*/
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SITE_HOST } from '../../supabase/functions/_shared/site-origin.js';
import { PRODUCTION_ORIGIN } from '../../supabase/functions/_shared/client-error-shape.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const o = JSON.parse(process.argv[2] || '{}');
const listeners = { doc: {}, win: {} };
const beacons = [];
const on = (bag) => (type, fn) => { (bag[type] = bag[type] || []).push(fn); };
const marks = {};
let ended = false;
const B = { isDone: () => ended, done: (why) => { ended = true; marks[why] = o.ms; }, marks: () => marks, set: () => 0 };
const doc = { referrer: '', visibilityState: o.hiddenAtStart ? 'hidden' : 'visible', documentElement: { getAttribute: () => 'en' }, addEventListener: on(listeners.doc), getElementById: () => null };
globalThis.__imBoot = B;
globalThis.window = { SUPABASE_URL: 'https://stub.supabase.test/', IM_HOST: { lang: 'en' }, IntMapDevice: { kind: () => o.kind }, INTMAP_BUILD: o.stamp, __imBoot: B, addEventListener: on(listeners.win) };
globalThis.document = doc;
globalThis.location = { origin: PRODUCTION_ORIGIN, hostname: SITE_HOST, search: '', hash: '' };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { sendBeacon: (url, blob) => { beacons.push(blob); return true; } } });
await import(pathToFileURL(join(ROOT, 'js/usage-counts.js')).href);
const fire = (bag, type) => (listeners[bag][type] || []).forEach((f) => f({}));
if (o.hideBeforeReady) { doc.visibilityState = 'hidden'; fire('doc', 'visibilitychange'); doc.visibilityState = 'visible'; }
B.done(o.why);
await new Promise((r) => setTimeout(r, 0));
doc.visibilityState = 'hidden';
fire('doc', 'visibilitychange');
const rows = [];
for (const b of beacons) rows.push(...JSON.parse(await b.text()).c);
process.stdout.write(JSON.stringify(rows));
