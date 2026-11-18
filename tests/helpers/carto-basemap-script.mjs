/* js/carto-basemap.js as a SCRIPT the checks can evaluate (new Function / vm).
 *
 * The file is an ES module (src/main.js imports it) whose one import is Esri's credit text from
 * js/esri-imagery.js. A script cannot `import`, so the import line is replaced by a binding read from
 * `__esriImagery`, which the caller puts in scope: the REAL module's `imagerySources`, and a
 * `refreshImagerySources` that does not touch the network (a check has no business fetching Esri).
 * The rest of the file is evaluated exactly as shipped. */
import { readFileSync } from 'node:fs';
import { imagerySources } from '../../js/esri-imagery.js';

const IMPORT_RE = /^import \{([^}]*)\} from '\.\/esri-imagery\.js';[^\n]*$/m;

export const esriImageryStub = { imagerySources, refreshImagerySources: () => Promise.resolve() };

export function cartoBasemapScript() {
  const src = readFileSync(new URL('../../js/carto-basemap.js', import.meta.url), 'utf8');
  if (!IMPORT_RE.test(src)) throw new Error('js/carto-basemap.js no longer imports from ./esri-imagery.js — update tests/helpers/carto-basemap-script.mjs');
  return src.replace(IMPORT_RE, 'const {$1} = __esriImagery;');
}
