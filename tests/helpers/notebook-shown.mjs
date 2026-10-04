/* The investigation notebook is hidden in the shipped build (NOTEBOOK_SHOWN = false, js/atlas-notebook-store.js).
   The notebook's own logic — filing, replay, compare, export — is still real code and still has to be proved, so a
   check that exercises it loads the modules the way they would run with the switch turned ON: the store module's
   export is replaced at the import edge (scripts/lib/import-module.mjs `mocks`), nothing else is touched.
   `hiddenNotebook()` is the shipped build as it is. */
import { importModule } from './import-module.mjs';

const STORE = 'js/atlas-notebook-store.js';

export async function shownNotebook(globals) {
  const realStore = await import('../../js/atlas-notebook-store.js');
  const store = Object.assign({}, realStore, { NOTEBOOK_SHOWN: true });
  const notebook = await importModule('js/atlas-notebook.js', { globals, mocks: { [STORE]: store } });
  const caps = await importModule('js/atlas-cap-notebook.js', { mocks: { [STORE]: store, 'js/atlas-notebook.js': notebook } });
  const briefing = await importModule('js/atlas-briefing.js', { globals, mocks: { [STORE]: store, 'js/atlas-notebook.js': notebook } });
  return { store, notebook, caps: caps.default, briefing };
}

export async function hiddenNotebook(globals) {
  const notebook = await importModule('js/atlas-notebook.js', { globals });
  const caps = await importModule('js/atlas-cap-notebook.js');
  return { notebook, caps: caps.default };
}
