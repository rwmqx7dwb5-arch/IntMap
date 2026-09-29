/* ============================================================================
 *  The UI string tables, EVALUATED — not searched for spellings.
 * ----------------------------------------------------------------------------
 *  js/locales/ui.<code>.js is one call, `window.IntMapLang.define(code, { ui, inline })`, and that
 *  call is the only way the app ever reads it. So the question «does language X say Y» is asked of
 *  the object that call hands over: a key inside a comment, a key in the wrong block or a table
 *  that fails to evaluate cannot answer for a string the reader would see (#R505's rule).
 *  js/locales/_langs.js is evaluated the same way for the list of registered languages.
 * ==========================================================================*/
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const LOCALES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'js', 'locales');

/** the codes that have a ui.<code>.js table, discovered from the directory */
export function uiLocaleCodes() {
  return readdirSync(LOCALES).map((f) => /^ui\.([a-z-]+)\.js$/.exec(f)).filter(Boolean).map((m) => m[1]).sort();
}

/** { ui, inline } exactly as js/locales/ui.<code>.js hands it to IntMapLang.define */
export function uiLocale(code) {
  const got = {};
  const ctx = { window: { IntMapLang: { define: (c, table) => { got[c] = table; } } } };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(LOCALES, `ui.${code}.js`), 'utf8'), ctx, { filename: `ui.${code}.js` });
  const t = got[code];
  if (!t || !t.ui) throw new Error(`js/locales/ui.${code}.js did not define a ui table for «${code}»`);
  return { ui: t.ui, inline: t.inline || {} };
}

/** the registered languages, as js/locales/_langs.js publishes them (IntMapLangCodes) */
export function langCodes() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(LOCALES, '_langs.js'), 'utf8'), ctx, { filename: '_langs.js' });
  return Array.from(ctx.window.IntMapLangCodes || []);
}
