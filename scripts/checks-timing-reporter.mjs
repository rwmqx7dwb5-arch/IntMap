/*
 * IntMap · checks-timing-reporter — how many seconds each test FILE took  (gate-parity-and-shards)
 *
 *  A `node --test` reporter (scripts/test-checks.mjs adds it when given `--timings <file>`, next to
 *  the spec reporter, which keeps printing as before). It writes one JSON object to its destination:
 *  { "tests/<file>.test.mjs": seconds, … } — the sum of the durations of the file's TOP-LEVEL tests
 *  (nesting 0), which is the unit scripts/checks-shards.mjs packs. A file that fails to load reports
 *  one nesting-0 failure carrying its load time, so it is still measured rather than dropped.
 *  Paths are made relative to the working directory the runner starts node in (the repository root
 *  when sharding) and written with forward slashes, so a ledger refreshed on Linux and one read on
 *  Windows name files the same way.
 */
import { relative, isAbsolute } from 'node:path';

export default async function* timings(source) {
  const ms = new Map();
  for await (const ev of source) {
    if (ev.type !== 'test:pass' && ev.type !== 'test:fail') continue;
    const d = ev.data;
    if (!d || d.nesting !== 0 || !d.file) continue;
    const key = (isAbsolute(d.file) ? relative(process.cwd(), d.file) : d.file).split('\\').join('/');
    ms.set(key, (ms.get(key) || 0) + (Number(d.details?.duration_ms) || 0));
  }
  const out = Object.fromEntries([...ms].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, Math.round(v / 100) / 10]));
  yield JSON.stringify(out, null, 2) + '\n';
}
