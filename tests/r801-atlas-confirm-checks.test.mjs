/* ============================================================================
 *  IntMap · R801 — WHAT LEAVES THE DEVICE, OR ENTERS THE MODEL, IS NOT CONFIRM-FREE
 * ----------------------------------------------------------------------------
 *  External content (a news article, an attachment, a fetched page) can carry instructions.
 *  Whatever the model makes of them, the capability table is the one place that says, per
 *  operation, whether a reader has to be asked first (column 8 of js/atlas-capabilities.js:
 *  'none' | 'explicit' | 'always'). This check reads the EVALUATED table and asks two questions
 *  about it — as facts about rows, not as a list of spellings to keep:
 *
 *   ① every row whose risk is 'external' (something leaves the device) is not confirm-free;
 *   ② every row that brings new material INTO the next model input — the reader's earlier
 *      attachments, the pixels on screen, the device position — is not confirm-free.
 *
 *  ② cannot yet be selected by a column. The `produces` vocabulary names what a run puts in front
 *  of the READER (map, panel, explanation, …) and has no value for «goes into the next model
 *  call»; those rows all say 'explanation' like research.brief does. So ② selects by id, and the
 *  last test below is the expiry condition: the moment the table grows a product that names model
 *  input, this file must switch to that property and drop the ids.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const CAPS = makeAtlasCapabilities({});
const ALL = CAPS.all().filter((c) => !c.withdrawn);

/* the column's whole vocabulary (js/atlas-capabilities.js, column 8) — anything else is a typo */
const CONFIRM_VALUES = new Set(['none', 'explicit', 'always']);

/* ② — selected by id, with the reason each one carries model input (see the header) */
const MODEL_INPUT_CARRIERS = [
  { match: (id) => /^attach\./.test(id), why: 'puts a past attachment back into the next model call' },
  { match: (id) => id === 'view.inspect', why: 'hands the model the pixels on screen' },
  { match: (id) => id === 'view.locate', why: 'reads the device position and returns it to the model' },
];

test('R801 ⓪: the confirm column only holds its three declared values', () => {
  for (const c of ALL) {
    assert.ok(CONFIRM_VALUES.has(c.confirmation), `${c.id}: confirmation=${JSON.stringify(c.confirmation)}`);
  }
});

test('R801 ①: a row whose risk is external is not confirm-free', () => {
  const external = ALL.filter((c) => c.risk === 'external');
  assert.ok(external.length > 0, 'the table has at least one external-risk row (navigation.start today)');
  const free = external.filter((c) => c.confirmation === 'none');
  assert.deepEqual(free.map((c) => c.id), [], 'external risk with confirm=none: ' + free.map((c) => c.id).join(', '));
});

test('R801 ②: a row that carries material into the next model input is not confirm-free', () => {
  const free = [];
  for (const sel of MODEL_INPUT_CARRIERS) {
    const rows = ALL.filter((c) => sel.match(c.id));
    /* a selector that matches nothing is guarding nothing — a rename must be noticed here */
    assert.ok(rows.length > 0, `selector "${sel.why}" matches no row — the id it named was renamed or withdrawn`);
    for (const c of rows) if (c.confirmation === 'none') free.push(`${c.id} (${sel.why})`);
  }
  /* all of them at once, so one run names every row that has to change */
  assert.deepEqual(free, [], 'confirm=none on: ' + free.join('; '));
});

/* ══ column 11, `ingests` — which rows hand the model a THIRD PARTY's sentences ═══════════════════
   Selected by id, for the same reason ② is: nothing in the row distinguishes «an explanation IntMap
   computed» (data.value) from «an explanation built from fetched pages» (research.brief) — both say
   produces:'explanation', risk:'read', observer 'none'. The column IS that distinction, and this list
   is the expiry condition for keeping it hand-stamped: a row added to the registry that fetches or
   quotes outside text has to be added here, or js/atlas-agent.js will treat its result as IntMap's own. */
const INGESTS_VALUES = new Set(['', 'external']);
const THIRD_PARTY_ROWS = {
  'research.brief': 'a brief built from Wikipedia and live news',
  'research.analyze': 'an analysis over gathered evidence and web verification',
  'research.impact': 'an impact report over gathered articles',
  'research.events': 'events read out of the news feed',
  'reader.gloss': 'a gloss of a phrase, built from web text',
  'attach.recall': 'a file the reader attached, put back in front of the model',
  'data.query': 'rows out of a file the reader loaded',
  'news.category': 'headlines from the loaded feed',
};

test('R801 ④: the ingests column only holds its two declared values, and rows that omit it ingest nothing', () => {
  for (const c of ALL) assert.ok(INGESTS_VALUES.has(c.ingests), `${c.id}: ingests=${JSON.stringify(c.ingests)}`);
  assert.ok(ALL.some((c) => c.ingests === ''), 'the cell is optional — most rows leave it empty');
  const audit = CAPS.toJSON().capabilities;
  for (const c of audit) assert.ok(INGESTS_VALUES.has(c.ingests), `toJSON: ${c.id} carries ${JSON.stringify(c.ingests)}`);
});

test('R801 ⑤: every row that returns a third party\'s sentences says so (research.*, attach.recall, data.query, reader.gloss, news.category)', () => {
  const missing = [];
  for (const id of Object.keys(THIRD_PARTY_ROWS)) {
    const c = ALL.find((x) => x.id === id);
    assert.ok(c, `${id} was renamed or withdrawn — update THIRD_PARTY_ROWS`);
    if (c.ingests !== 'external') missing.push(`${id} (${THIRD_PARTY_ROWS[id]})`);
  }
  assert.deepEqual(missing, [], 'ingests is not external on: ' + missing.join('; '));
});

test('R801 ③ (expiry): the moment `produces` can name model input, select ② by that column', () => {
  const vocab = new Set();
  for (const c of ALL) for (const p of c.produces) vocab.add(p);
  const named = [...vocab].filter((p) => /model|prompt|input|context/i.test(p));
  assert.deepEqual(named, [], 'the table now names model input as a product (' + named.join(', ') + ') — replace MODEL_INPUT_CARRIERS with that property');
});
