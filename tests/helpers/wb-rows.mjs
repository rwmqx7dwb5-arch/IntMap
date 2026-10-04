/* ── the World Bank choropleth rows, as js/wb-layers.js builds them ──────────────────────────────
   (country-analysis-unify) A row of js/wb-layers.js names the indicator it paints and the ramp it paints it with
   (`{id:'wbX', k:'<key>', ramp:[…]}`; a modal row `{id, modes:[{key, k, ramp}, …]}`), and js/wb-indicators.js
   says what that indicator is — its series, its name, its unit. The two are joined at run time by `_wbInd`.
   ⚠ THIS EVALUATES THE SHIPPED TABLE AND THE SHIPPED JOIN — it is not a second reading of either. The table
   statement (`const WB=[…].map(…)`) and `_wbInd` are lifted out of the comment-stripped file and run with the
   real catalogue in scope, so a check that asks «which series does the refugee row sum» or «what is the
   density row called» gets the answer the browser gets. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../../scripts/code-only.mjs';
import { wbIndicator } from '../../js/wb-indicators.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** every row of js/wb-layers.js's WB table, each with `code` / `n` / `unit` / `ramp` (a modal row: `modes`, each the same) */
export function wbRows(root = ROOT) {
  const src = codeOnly(readFileSync(join(root, 'js/wb-layers.js'), 'utf8'));
  const join1 = /const _wbInd=\(r\)=>\{[^\n]*\};/.exec(src);
  if (!join1) throw new Error('js/wb-layers.js: no `_wbInd` join');
  const at = src.indexOf('const WB=[');
  const end = src.indexOf(');', src.indexOf('].map((L)=>', at));
  if (at < 0 || end < 0) throw new Error('js/wb-layers.js: no WB table');
  const table = src.slice(at, end + 2);
  return new Function('wbIndicator', join1[0] + '\n' + table + '\nreturn WB;')(wbIndicator);
}

/** every series the table paints, one per row and one per mode — a summed series is its array */
export function wbRowSeries(root = ROOT) {
  return wbRows(root).flatMap((L) => (L.modes ? L.modes.map((m) => ({ id: L.id, mode: m.key, code: m.code, n: m.n })) : [{ id: L.id, mode: null, code: L.code, n: L.n }]));
}
