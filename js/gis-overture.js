/* ============================================================================
 *  IntMap · OVERTURE MAPS, READ BY WINDOW — window.IntMapGisOverture   (js/gis-overture.js)
 * ----------------------------------------------------------------------------
 *  Overture Maps (Linux Foundation) publishes ~90 M places, ~2.5 G buildings, addresses, administrative
 *  areas, roads and base-map features as GeoParquet on a public bucket, one release a month. Nobody can
 *  load that, and nobody has to: a question about Tokyo Bay's ports needs the rows inside Tokyo Bay.
 *
 *      release()                       which release is the latest (the STAC catalogue says; never typed here)
 *      themes({release})               the themes and types that release holds
 *      plan({theme,type,bbox})         WHICH FILES a window touches — nothing of their rows is read
 *      query({theme,type,bbox,where})  the rows of a window, as GeoJSON features, with what was read
 *      acquire(...)                    query() registered as a dataset of the registry (window.IntMapData)
 *      worldNodes(result)              the same rows as world-graph nodes (`ids.gers`) + identifier-history rows
 *
 *  ══ HOW A WINDOW IS READ WITHOUT DOWNLOADING A PLANET (measured 2026-11-20) ═══════════════════════
 *   ① STAC (stac.overturemaps.org) states each file's extent         → files that cannot touch the window are dropped
 *   ② the Parquet footer states every row group's `bbox` min/max     → row groups that cannot touch it are dropped
 *   ③ pass 1 reads ONLY `bbox` + the columns of the conditions        → the matching row numbers
 *   ④ pass 2 reads the other columns for the row groups that matched  → the features
 *  Files are written spatially sorted, so ② prunes: a 1°×1° window over Tokyo opened 48 of 512 row groups.
 *
 *  ⚠ WHY NOT DuckDB-WASM (decided by measurement, not taste). It does the same range reads, but ships a
 *  ~30 MB WASM engine, needs `wasm-unsafe-eval` under a strict CSP, and pulls a full SQL planner for a job
 *  that is: prune by two statistics, read two columns, filter. hyparquet is 0.5 MB of JavaScript, loaded
 *  only when this module runs (a dynamic import → its own chunk). Measured on the Asia places file, 1°²
 *  over Tokyo (1.0 M rows scanned): objects-per-row 46 s → column chunks + 8 parallel reads 8.4 s.
 *  What it costs: one footer per touched file (≈3 MB, 3-6 s) — held in memory afterwards.
 *  ⚠ A SERVER-SIDE READER IS NOT NEEDED: both hosts answer `Access-Control-Allow-Origin: *` and Range
 *  (measured). A server would only add a copy of the same bytes, and a place to be paid for.
 *
 *  ══ ⚠⚠⚠ THREE CLAIMS A COUNT CANNOT TELL APART (the same three js/gis-remote.js separates) ══════════
 *    ① every row this RELEASE holds for the window was read       — `coverage` (js/gis-sources.js coverageOf)
 *    ② a row's bounding box meets the window                      — `windowTest:'bbox-intersects'`: for a
 *      polygon that is a SUPERSET of «the geometry meets the window»; a point is exact
 *    ③ this is everything that exists in the world                — `worldCompleteness:'unproven'`, ALWAYS
 *  And: a row that Overture drops next month is not «never existed» — see GERS below.
 *
 *  ══ ⚠⚠⚠ A RELEASE EXPIRES; AN IDENTIFIER DOES NOT STAY (GERS) ════════════════════════════════════
 *  The bucket keeps a release for 60 days (`x-amz-expiration` on every object, measured), so a URL typed
 *  into code is dead by January: the release is READ from the catalogue each time (`latest`). An
 *  identifier (GERS id) is Overture's name for a real-world object, and it CHANGES — Overture's own
 *  figure for 2026-11-18 is ~6.5 % churn. So what is stored about an object is never the id alone: it is
 *  the id AND the source records it was made from (`sources[].dataset/record_id`, STATED by Overture on
 *  the row) AND the release. Two ids of two releases that carry the same source record are the same
 *  object *by the source's statement*; nothing here guesses a successor from position or name.
 *
 *  ══ ⚠⚠⚠ A LICENCE IS A VALUE THAT THE ROW STATES ═════════════════════════════════════════════════
 *  Overture is not one licence: measured on 2026-11-20, places are CDLA-Permissive-2.0, buildings and roads
 *  ODbL-1.0 (from OSM, Google, Microsoft…), addresses CC-BY-4.0 per country. Every row says so in
 *  `sources[].license`. The dataset's licence is the verbatim SET of those values the answer contains —
 *  never a guess for «Overture», never a claim when no row states one. The record is written in the
 *  vocabulary of js/data-governance.js (publisher, licence, attribution, asOf, cadence, builtBy…), so the
 *  same account(), freshness() and attribution() that judge a shipped bundle judge this.
 *
 *  ⚠ NOTHING HERE FETCHES BY A FRIEND'S URL: every address passes publicUrl() (https, no credentials, no
 *  private host) — a catalogue's `href` is data, not an instruction. EVERYTHING IS INSIDE THE FACTORY and
 *  window.* is read at CALL time, so this imports in Node with no DOM; every collaborator can be passed in
 *  (`deps`) and the tests do exactly that.
 * ==========================================================================*/

export function makeGisOverture(deps) {
  return (function () {
    const D = deps || {};
    const WIN = () => { try { return (typeof window !== 'undefined' && window) || null; } catch (_) { return null; } };
    const pick = (k, g) => (D[k] !== undefined ? D[k] : (WIN() && WIN()[g]) || null);
    const now = () => (typeof D.now === 'function' ? D.now() : Date.now());

    /* 観測 2026-11-20: https://stac.overturemaps.org/catalog.json answers 200 JSON with ACAO `*`, `latest`
       and one child per release. 失効条件: Overture moves its catalogue — this is then reported as
       `catalogue-unreachable`, and edited here, once. */
    const STAC = 'https://stac.overturemaps.org';
    /* 観測 2026-11-20: every item of the catalogue names its file at `assets.aws.href` on this host (an `azure` copy also exists and is not read).
       This is the host Privacy §4 names (scripts/outbound-hosts.json): a catalogue that points elsewhere is data that is NOT FETCHED — the
       disclosure is the contract, not the catalogue. 失効条件: Overture moves its bucket — `host-not-disclosed` says so, and it is edited here, once. */
    const DATA_HOSTS = ['overturemaps-us-west-2.s3.us-west-2.amazonaws.com'];
    /* Overture's own statement of its terms and credit; the page that says which theme is under which licence */
    const TERMS_URL = 'https://docs.overturemaps.org/attribution/';
    const PUBLISHER = 'Overture Maps Foundation';
    /* The DATA_SOURCES row (js/reference-data.js) that pays the attribution — matched by value */
    const CREDIT_ROW = 'Overture Maps Foundation (places, buildings, addresses, divisions, transportation, base — GeoParquet, monthly release)';
    /* 観測: Overture publishes monthly (2026-09-23 · 10-21 · 11-18). 失効条件: it announces another cadence. */
    const CADENCE = 'P1M';
    const READ_PARALLEL = 8;   /* 観測 2026-11-20: 1 → 46 s, 8 → 8.4 s for the same 98 reads; a browser holds 6 per host, the rest queue */
    /* the contact lists of a place: ~30 % of a row group's bytes and most of its decode time, and rarely what a window question is about — read when named in `columns` */
    const RUN_GAP = 1500;     /* 観測 2026-11-20: a page holds ~1-2 k rows of a column; a wider gap decodes a page the match does not need */
    const CONTACT = ['websites', 'emails', 'socials', 'phones'];
    const FOOTER_KEEP = 4;     /* a footer parses to a few MB of statistics; the 4 most recent are kept */

    const REFUSALS = [
      'bad-param', 'url-not-public', 'catalogue-unreachable', 'release-unknown', 'theme-unknown', 'type-unknown',
      'column-unknown', 'op-unknown', 'host-not-disclosed', 'fetch-failed', 'http-status', 'not-json', 'reader-unavailable',
      'read-failed', 'cancelled', 'add-failed',
    ];
    const refuse = (why, detail) => (detail === undefined ? { ok: false, why: why } : { ok: false, why: why, detail: detail });

    /* the comparisons are js/gis-ops.js's CONDITION_OPS, spelled the same — one vocabulary for a `where` */
    const OPS = ['>=', '>', '<=', '<', '==', '!=', 'contains', 'in', 'between'];

    /* ── the wire ────────────────────────────────────────────────────────────────────────── */
    function publicUrl(raw) {
      const R = pick('remote', 'IntMapGisRemote');
      if (R && typeof R.publicUrl === 'function') return R.publicUrl(raw);
      let u;
      try { u = new URL(String(raw)); } catch (_) { return refuse('url-not-public', { url: String(raw), reason: 'unparseable' }); }
      if (u.protocol !== 'https:') return refuse('url-not-public', { url: String(raw), reason: 'not-https' });
      if (u.username || u.password) return refuse('url-not-public', { url: u.origin, reason: 'credentials-in-url' });
      const h = u.hostname.toLowerCase();
      if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':')) return refuse('url-not-public', { url: u.origin, reason: 'private-or-literal-host' });
      return { ok: true, url: u.href };
    }

    /* a host is fetched only when it is one the privacy statement names */
    const hostIn = (url, hosts) => { try { return hosts.indexOf(new URL(url).hostname) >= 0; } catch (_) { return false; } };
    const dataHosts = () => (Array.isArray(D.dataHosts) ? D.dataHosts : DATA_HOSTS);
    const stacHost = () => (D.stacHost ? [D.stacHost] : [new URL(STAC).hostname]);

    const jsonCache = new Map();
    async function fetchJson(url, signal) {
      const ok = publicUrl(url);
      if (!ok.ok) return ok;
      if (!hostIn(ok.url, stacHost())) return refuse('host-not-disclosed', { host: new URL(ok.url).hostname, disclosed: stacHost() });
      if (jsonCache.has(ok.url)) return jsonCache.get(ok.url);
      const doFetch = (typeof D.fetch === 'function') ? D.fetch : ((typeof fetch === 'function') ? fetch : null);
      if (!doFetch) return refuse('fetch-failed', { url: ok.url, reason: 'no-fetch-in-this-runtime' });
      let res;
      try { res = await doFetch(ok.url, { signal: signal || undefined, headers: { Accept: 'application/json' } }); }
      catch (e) { return (signal && signal.aborted) ? refuse('cancelled') : refuse('catalogue-unreachable', { url: ok.url, reason: String((e && e.message) || e) }); }
      if (!res || !res.ok) return refuse('http-status', { url: ok.url, status: res ? res.status : null });
      let json;
      try { json = await res.json(); } catch (_) { return refuse('not-json', { url: ok.url }); }
      const out = { ok: true, json: json, url: ok.url };
      jsonCache.set(ok.url, out);
      return out;
    }

    /* ── ① the catalogue: release → theme → type → files ──────────────────────────────────── */
    async function release(o) {
      const opt = o || {};
      const r = await fetchJson(STAC + '/catalog.json', opt.signal);
      if (!r.ok) return r;
      const c = r.json || {};
      const kids = (Array.isArray(c.links) ? c.links : []).filter((l) => l && l.rel === 'child' && l.href);
      const releases = kids.map((l) => ({ version: relVersion(l.href), href: l.href, latest: l.latest === true }));
      const latest = (typeof c.latest === 'string' && c.latest) || (releases.find((x) => x.latest) || {}).version || null;
      const want = opt.version != null ? String(opt.version) : latest;
      const hit = releases.find((x) => x.version === want);
      if (!hit) return refuse('release-unknown', { asked: want, releases: releases.map((x) => x.version) });
      return {
        ok: true, version: hit.version, latest: latest, releases: releases.map((x) => x.version), href: hit.href,
        /* the date of the release, said as a date: the version is «YYYY-MM-DD.n» */
        asOf: (/^\d{4}-\d{2}-\d{2}/.exec(hit.version) || [null])[0],
        registry: c.registry || null,
        retrievedAt: new Date(now()).toISOString().slice(0, 10),
      };
    }
    /* a release's own name is the last-but-one path segment of its catalogue address */
    function relVersion(href) { const p = String(href).split('/').filter(Boolean); return p.length >= 2 ? p[p.length - 2] : String(href); }

    async function themes(o) {
      const rel = await release(o);
      if (!rel.ok) return rel;
      const top = await fetchJson(rel.href, o && o.signal);
      if (!top.ok) return top;
      const tl = (Array.isArray(top.json.links) ? top.json.links : []).filter((l) => l && l.rel === 'child' && l.href);
      const out = [];
      const results = await Promise.all(tl.map((l) => fetchJson(l.href, o && o.signal)));
      for (let i = 0; i < tl.length; i++) {
        if (!results[i].ok) return results[i];
        const name = (results[i].json && results[i].json.id) || relVersion(tl[i].href);
        const cols = (Array.isArray(results[i].json.links) ? results[i].json.links : []).filter((l) => l && l.rel === 'child' && l.href);
        out.push({ theme: String(name), catalogue: tl[i].href, pmtiles: ((results[i].json.links || []).find((l) => l.rel === 'pmtiles') || {}).href || null,
          types: cols.map((l) => ({ type: relVersion(l.href), collection: l.href })) });
      }
      return { ok: true, release: rel, themes: out };
    }

    /* the files of one type, with the extent STAC states for each — one request (collection.json) */
    async function collectionOf(theme, type, o) {
      const t = await themes(o);
      if (!t.ok) return t;
      const th = t.themes.find((x) => x.theme === String(theme));
      if (!th) return refuse('theme-unknown', { asked: theme, themes: t.themes.map((x) => x.theme) });
      const ty = th.types.find((x) => x.type === String(type));
      if (!ty) return refuse('type-unknown', { theme: theme, asked: type, types: th.types.map((x) => x.type) });
      const c = await fetchJson(ty.collection, o && o.signal);
      if (!c.ok) return c;
      const items = (Array.isArray(c.json.links) ? c.json.links : []).filter((l) => l && l.rel === 'item' && l.href);
      /* extent.bbox[0] is the union; [i+1] is item i's — verified against the item itself below */
      const ext = ((c.json.extent || {}).spatial || {}).bbox || [];
      return { ok: true, release: t.release, theme: th.theme, type: ty.type, collection: c.json, items: items, extents: ext.slice(1) };
    }

    const boxesOf = (b) => {
      if (!Array.isArray(b) || b.length !== 4 || b.some((x) => typeof x !== 'number' || !isFinite(x))) return null;
      const w = b[0], s = b[1], e = b[2], n = b[3];
      if (s > n || s < -90 || n > 90 || w < -180 || w > 180 || e < -180 || e > 180) return null;
      return w <= e ? [{ w: w, s: s, e: e, n: n }] : [{ w: w, s: s, e: 180, n: n }, { w: -180, s: s, e: e, n: n }];   /* a window across the antimeridian is two */
    };
    const meets = (bx, a) => bx.some((q) => a[0] <= q.e && a[2] >= q.w && a[1] <= q.n && a[3] >= q.s);

    /* the address of a file is DATA from a catalogue (⚠ not an instruction): it is public or it is refused, here, before anything opens it */
    function assetOf(it) {
      const a = (it.assets && (it.assets.aws || Object.values(it.assets).find((x) => x && /parquet/i.test(String(x.href))))) || null;
      if (!a || !a.href) return null;
      const ok = publicUrl(a.href);
      if (!ok.ok) return ok;
      if (!hostIn(ok.url, dataHosts())) return refuse('host-not-disclosed', { host: new URL(ok.url).hostname, disclosed: dataHosts() });
      return { ok: true, href: ok.url };
    }

    /* WHICH FILES — and nothing of their rows. */
    async function plan(o) {
      const opt = o || {};
      const boxes = opt.bbox == null ? [{ w: -180, s: -90, e: 180, n: 90 }] : boxesOf(opt.bbox);
      if (!boxes) return refuse('bad-param', { param: 'bbox', expects: '[west,south,east,north] in degrees' });
      const c = await collectionOf(opt.theme, opt.type, opt);
      if (!c.ok) return c;
      let cand = [];
      for (let i = 0; i < c.items.length; i++) { const e = c.extents[i]; if (!e || meets(boxes, e)) cand.push(i); }
      const got = await Promise.all(cand.map((i) => fetchJson(c.items[i].href, opt.signal)));
      let mismatched = false;
      const files = [];
      for (let k = 0; k < cand.length; k++) {
        if (!got[k].ok) return got[k];
        const it = got[k].json, e = c.extents[cand[k]];
        if (e && Array.isArray(it.bbox) && it.bbox.some((v, j) => Math.abs(v - e[j]) > 1e-9)) mismatched = true;
        const asset = assetOf(it);
        if (asset && !asset.ok) return asset;
        if (it.bbox && asset && meets(boxes, it.bbox)) files.push({ index: cand[k], id: it.id, bbox: it.bbox, rows: (it.properties || {}).num_rows == null ? null : Number((it.properties || {}).num_rows), rowGroups: (it.properties || {}).num_row_groups == null ? null : Number((it.properties || {}).num_row_groups), url: asset.href });
      }
      /* the extents of collection.json did not line up with its items → read EVERY item, never guess which file a window meets */
      if (mismatched) {
        const all = await Promise.all(c.items.map((l) => fetchJson(l.href, opt.signal)));
        files.length = 0;
        for (const g of all) {
          if (!g.ok) return g;
          const it = g.json, asset = assetOf(it);
          if (asset && !asset.ok) return asset;
          if (it.bbox && asset && meets(boxes, it.bbox)) files.push({ index: null, id: it.id, bbox: it.bbox, rows: (it.properties || {}).num_rows == null ? null : Number((it.properties || {}).num_rows), rowGroups: null, url: asset.href });
        }
      }
      return { ok: true, release: c.release, theme: c.theme, type: c.type, license: c.collection.license == null ? null : String(c.collection.license), bbox: boxes, files: files, filesTotal: c.items.length, extentsAligned: !mismatched };
    }

    /* ── the Parquet reader: hyparquet, loaded only now; a test passes `deps.parquet` ────────── */
    let readerP = null;
    function reader() {
      if (D.parquet) return Promise.resolve(D.parquet);
      if (readerP) return readerP;
      readerP = (async () => {
        const [hp, hc] = await Promise.all([import('hyparquet'), import('hyparquet-compressors')]);
        const compressors = hc.compressors;
        const footers = new Map();
        return {
          /* → { rowGroups:[{start,rows,bbox:[w,s,e,n]|null}], columns:[{name,nested}], numRows, io } */
          async open(url, io) {
            if (footers.has(url)) { const f = footers.get(url); footers.delete(url); footers.set(url, f); f.io = io; return f; }
            const raw = await hp.asyncBufferFromUrl({ url: url });
            const handle = { url: url, io: io };
            handle.cache = new Map();
            /* the same byte range is asked for again by every range read of a column chunk: ask the network once */
            const file = { byteLength: raw.byteLength, slice: (a, b) => {
              const k = a + ':' + b;
              if (!handle.cache.has(k)) { handle.io.requests++; handle.io.bytes += (b == null ? raw.byteLength : b) - a; const p = Promise.resolve(raw.slice(a, b)); handle.cache.set(k, p); p.catch(() => handle.cache.delete(k)); }
              return handle.cache.get(k);
            } };
            const md = await hp.parquetMetadataAsync(file);
            let start = 0;
            const rowGroups = md.row_groups.map((rg) => {
              const n = Number(rg.num_rows), st = {};
              for (const c of rg.columns) { const p = c.meta_data.path_in_schema; if (p[0] === 'bbox' && p.length === 2 && c.meta_data.statistics) st[p[1]] = c.meta_data.statistics; }
              const ok = st.xmin && st.xmax && st.ymin && st.ymax && st.xmin.min_value != null && st.xmax.max_value != null && st.ymin.min_value != null && st.ymax.max_value != null;
              const g = { start: start, rows: n, bbox: ok ? [Number(st.xmin.min_value), Number(st.ymin.min_value), Number(st.xmax.max_value), Number(st.ymax.max_value)] : null };
              start += n;
              return g;
            });
            /* the schema is depth-first: a top-level element is followed by all of its descendants */
            const columns = [];
            const span = (i) => { let n = 1; for (let k = 0, c = md.schema[i].num_children || 0; k < c; k++) n += span(i + n); return n; };
            for (let i = 1; i < md.schema.length; i += span(i)) columns.push({ name: md.schema[i].name, nested: !!md.schema[i].num_children });
            Object.assign(handle, { file: file, md: md, rowGroups: rowGroups, columns: columns, numRows: Number(md.num_rows) });
            footers.set(url, handle);
            while (footers.size > FOOTER_KEEP) footers.delete(footers.keys().next().value);
            return handle;
          },
          /* → { get(column,row) } for rows [rowStart,rowEnd) of the named columns */
          async read(handle, rowStart, rowEnd, columns) {
            const chunks = {};
            await hp.parquetRead({ file: handle.file, metadata: handle.md, compressors: compressors, columns: columns, rowStart: rowStart, rowEnd: rowEnd,
              onChunk: (c) => { (chunks[c.columnName] = chunks[c.columnName] || []).push({ start: c.rowStart, data: c.columnData }); } });
            return { get(col, row) { const cs = chunks[col]; if (!cs) return undefined; for (const c of cs) { if (row >= c.start && row < c.start + c.data.length) return c.data[row - c.start]; } return undefined; } };
          },
        };
      })();
      readerP.catch(() => { readerP = null; });
      return readerP;
    }

    /* ── conditions: the same shape as every other `where` ({field, op, value}) ──────────────── */
    const dig = (v, path) => { let x = v; for (let i = 0; i < path.length; i++) { if (x == null) return null; x = x[path[i]]; } return x == null ? null : x; };
    const plain = (v) => (typeof v === 'bigint' ? Number(v) : v);
    function holds(c, v) {
      const x = plain(v);
      if (x == null) return false;   /* a missing value satisfies no comparison — it is not a 0 and not an «other» */
      switch (c.op) {
        case '==': return x === c.value || String(x) === String(c.value);
        case '!=': return !(x === c.value || String(x) === String(c.value));
        case '>': return x > c.value;
        case '>=': return x >= c.value;
        case '<': return x < c.value;
        case '<=': return x <= c.value;
        case 'in': return c.value.some((y) => y === x || String(y) === String(x));
        case 'between': return x >= c.value[0] && x <= c.value[1];
        case 'contains': return Array.isArray(x) ? x.some((y) => String(y).toLowerCase().includes(String(c.value).toLowerCase())) : String(x).toLowerCase().includes(String(c.value).toLowerCase());
        default: return false;
      }
    }
    function conditionsOf(where) {
      if (where == null) return { ok: true, list: [] };
      if (!Array.isArray(where)) return refuse('bad-param', { param: 'where', expects: '[{field, op, value}]' });
      const list = [];
      for (const w of where) {
        if (!w || typeof w.field !== 'string' || !w.field) return refuse('bad-param', { param: 'where', expects: '[{field, op, value}]' });
        const op = w.op == null ? '==' : String(w.op);
        if (OPS.indexOf(op) < 0) return refuse('op-unknown', { op: op, ops: OPS.slice() });
        if ((op === 'in' && !Array.isArray(w.value)) || (op === 'between' && !(Array.isArray(w.value) && w.value.length === 2))) return refuse('bad-param', { param: 'where', op: op, expects: op === 'in' ? 'an array' : '[low, high]' });
        list.push({ field: w.field, op: op, value: w.value, path: w.field.split('.') });
      }
      return { ok: true, list: list };
    }

    /* ── ③④ one file: prune the row groups, scan, then read the rows that matched ────────────── */
    async function pool(items, n, fn) {
      const q = items.slice(), out = [];
      await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) { const it = q.shift(); out.push(await fn(it)); } }));
      return out;
    }

    async function readFile(P, f, boxes, conds, outCols, io, signal) {
      const h = await P.open(f.url, io);
      const names = h.columns.map((c) => c.name);
      for (const c of conds) if (names.indexOf(c.path[0]) < 0) return refuse('column-unknown', { column: c.path[0], columns: names });
      const sel = h.rowGroups.filter((g) => !g.bbox || meets(boxes, g.bbox));
      const condRoots = conds.map((c) => c.path[0]).filter((v, i, a) => a.indexOf(v) === i);
      const scanCols = ['bbox'].concat(condRoots);
      const hits = [];   /* [rowGroup, rowNumbers[]] */
      let scanned = 0;
      const outcomes = await pool(sel, READ_PARALLEL, async (g) => {
        if (signal && signal.aborted) return refuse('cancelled');
        let r;
        try { r = await P.read(h, g.start, g.start + g.rows, scanCols); } catch (e) { return refuse('read-failed', { url: f.url, message: String((e && e.message) || e) }); }
        const rows = [];
        for (let i = g.start; i < g.start + g.rows; i++) {
          const b = r.get('bbox', i);
          if (!b || !meets(boxes, [Number(b.xmin), Number(b.ymin), Number(b.xmax), Number(b.ymax)])) continue;
          let ok = true;
          for (const c of conds) { if (!holds(c, dig(r.get(c.path[0], i), c.path.slice(1)))) { ok = false; break; } }
          if (ok) rows.push(i);
        }
        scanned += g.rows;
        if (rows.length) hits.push([g, rows]);
        return { ok: true };
      });
      for (const x of outcomes) if (!x.ok) return x;
      /* pass 2: only the row groups that matched, only the columns the features carry */
      const want = (outCols && outCols.length) ? outCols.filter((c) => names.indexOf(c) >= 0) : names.filter((n) => n !== 'bbox' && CONTACT.indexOf(n) < 0);
      if (want.indexOf('geometry') < 0 && names.indexOf('geometry') >= 0) want.push('geometry');
      if (want.indexOf('id') < 0 && names.indexOf('id') >= 0) want.push('id');
      const feats = [];
      /* a run is a stretch of matching rows with no gap wider than RUN_GAP, read as one range (the byte cache makes
         the second range of a column chunk free of network); rows 5 and 9000 of a group are two runs, not one read
         that decodes everything between them */
      const runs = [];
      for (const pair of hits) {
        const rows = pair[1];
        let prev = rows[0], mem = [rows[0]];
        for (let k = 1; k < rows.length; k++) {
          if (rows[k] - prev > RUN_GAP) { runs.push({ from: mem[0], to: prev + 1, rows: mem }); mem = []; }
          mem.push(rows[k]); prev = rows[k];
        }
        runs.push({ from: mem[0], to: prev + 1, rows: mem });
      }
      const outcomes2 = await pool(runs, READ_PARALLEL, async (run) => {
        if (signal && signal.aborted) return refuse('cancelled');
        let r;
        try { r = await P.read(h, run.from, run.to, want); } catch (e) { return refuse('read-failed', { url: f.url, message: String((e && e.message) || e) }); }
        for (const i of run.rows) { const rec = {}; for (const c of want) rec[c] = plain(r.get(c, i)); feats.push(rec); }
        return { ok: true };
      });
      if (h.cache) h.cache.clear();   /* the footer is parsed; the chunks are not wanted again */
      for (const x of outcomes2) if (!x.ok) return x;
      return { ok: true, rows: feats, nested: h.columns.filter((c) => c.nested).map((c) => c.name), rowGroups: { total: h.rowGroups.length, read: sel.length, matched: hits.length }, scanned: scanned };
    }

    /* A row → a GeoJSON feature. What is flattened is what Overture states on the row, nothing computed. */
    function featureOf(rec, requested) {
      const p = {};
      const keep = (k, v) => { if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) p[k] = plain(v); };
      for (const k of Object.keys(rec)) {
        const v = rec[k];
        if (k === 'geometry' || v == null) continue;
        if (k === 'id') { keep('gers', v); continue; }
        if (k === 'names') { keep('name', v.primary); continue; }
        if (k === 'taxonomy') { keep('category', v.primary); keep('category_path', Array.isArray(v.hierarchy) ? v.hierarchy.join(' > ') : null); continue; }
        if (k === 'brand') { keep('brand', v.names && v.names.primary); keep('brand_wikidata', v.wikidata); continue; }
        if (k === 'addresses') { const a = v[0] || {}; keep('address', a.freeform); keep('locality', a.locality); keep('region', a.region); keep('postcode', a.postcode); keep('country', a.country); continue; }
        if (k === 'websites') { keep('website', v[0]); continue; }
        if (k === 'phones') { keep('phone', v[0]); continue; }
        if (k === 'sources') {
          const s = Array.isArray(v) ? v : [];
          keep('source_datasets', uniq(s.map((x) => x && x.dataset)).join('; '));
          keep('source_licences', uniq(s.map((x) => x && x.license)).join('; '));
          /* the records the row was MADE FROM, as Overture states them — the key a GERS change is followed by */
          const recs = s.filter((x) => x && x.record_id != null).map((x) => ({ dataset: x.dataset, record_id: String(x.record_id) }));
          if (recs.length) p.source_records = JSON.stringify(recs);
          continue;
        }
        if (typeof v === 'object') { if (requested && requested.indexOf(k) >= 0) p[k] = JSON.stringify(v, (kk, vv) => (typeof vv === 'bigint' ? Number(vv) : vv)); continue; }
        p[k] = plain(v);
      }
      return { type: 'Feature', id: rec.id == null ? undefined : String(rec.id), geometry: rec.geometry || null, properties: p };
    }
    const uniq = (a) => a.filter((v, i) => v != null && v !== '' && a.indexOf(v) === i);

    /* ── query ───────────────────────────────────────────────────────────────────────────────── */
    async function query(o) {
      const opt = o || {};
      const cs = conditionsOf(opt.where);
      if (!cs.ok) return cs;
      if (opt.limit != null && !(Number.isInteger(opt.limit) && opt.limit > 0)) return refuse('bad-param', { param: 'limit', expects: 'a positive integer' });
      const pl = await plan(opt);
      if (!pl.ok) return pl;
      let P;
      try { P = await reader(); } catch (e) { return refuse('reader-unavailable', { message: String((e && e.message) || e) }); }
      const io = { requests: 0, bytes: 0 };
      const t0 = now();
      const feats = [];
      const rg = { total: 0, read: 0, matched: 0 };
      let scanned = 0;
      /* files one after another: each opens its own parallel pool, and one footer is the big cost */
      for (const f of pl.files) {
        const r = await readFile(P, f, pl.bbox, cs.list, Array.isArray(opt.columns) ? opt.columns : null, io, opt.signal || null);
        if (!r.ok) return r;
        for (const row of r.rows) feats.push(featureOf(row, opt.columns || null));
        rg.total += r.rowGroups.total; rg.read += r.rowGroups.read; rg.matched += r.rowGroups.matched; scanned += r.scanned;
      }
      const available = feats.length;
      const truncated = opt.limit != null && available > opt.limit;
      const features = truncated ? feats.slice(0, opt.limit) : feats;
      const licences = uniq([].concat.apply([], features.map((x) => String((x.properties || {}).source_licences || '').split('; ')))).sort();
      return {
        ok: true, release: pl.release, theme: pl.theme, type: pl.type, bbox: opt.bbox == null ? null : opt.bbox.slice(), where: opt.where || null,
        features: features, count: features.length, available: available, truncated: truncated,
        /* the three claims, separately (header) */
        windowTest: 'bbox-intersects', worldCompleteness: 'unproven',
        read: { files: pl.files.length, filesInType: pl.filesTotal, rowGroups: rg, rowsScanned: scanned, requests: io.requests, bytes: io.bytes, ms: now() - t0 },
        licences: licences, collectionLicense: pl.license,
        provenance: provenanceOf(pl, licences, features.length),
      };
    }

    /* the governance record: js/data-governance.js's own spellings, so read() / account() / freshness() take it as it is */
    function provenanceOf(pl, licences, rows) {
      const rel = pl.release;
      const lic = licences.length ? licences.join('; ') : null;
      const rec = {
        kind: 'import',
        publisher: PUBLISHER,
        url: rel.href.replace(/catalog\.json$/, '') + pl.theme + '/' + pl.type + '/collection.json',
        retrievedAt: rel.retrievedAt,
        asOf: rel.asOf,
        release: rel.version,
        cadence: CADENCE,
        /* a BOOLEAN in the shared vocabulary: showing the credit is a condition of every licence Overture's rows state (CDLA-Permissive-2.0 keeps notices; ODbL and CC BY ask for attribution). The line shown is derived by attribution() from publisher + licence, and the DATA_SOURCES row `paidBy` names pays it. */
        attribution: true,
        licenceUrl: TERMS_URL,
        paidBy: CREDIT_ROW,
        builtBy: 'js/gis-overture.js',
        schema: STAC + '/' + rel.version + '/' + pl.theme + '/' + pl.type + '/collection.json',
        quality: { rows: rows },
      };
      /* ⚠ a row that states no licence yields NO `licence` member — silence is not a grant */
      if (lic) rec.licence = lic;
      return rec;
    }

    /* ── a result becomes a dataset of the registry (window.IntMapData) ──────────────────────── */
    function toDataset(res, o) {
      const opt = o || {};
      const data = pick('data', 'IntMapData');
      if (!data || typeof data.add !== 'function') return refuse('add-failed', { reason: 'no-dataset-registry' });
      if (!res || res.ok !== true) return refuse('bad-param', { param: 'result' });
      const S = pick('sources', 'IntMapGisSources');
      let coverage = null;
      if (S && typeof S.coverageOf === 'function') {
        const bb = res.bbox ? { w: res.bbox[0], s: res.bbox[1], e: res.bbox[2], n: res.bbox[3] } : null;
        coverage = S.coverageOf({
          kind: 'features', requestedBox: bb, servedBox: bb, servedStated: !!bb, requestedTime: null, timeEstablished: false,
          limit: res.truncated ? res.count : null, fields: null, where: res.where, cursor: null,
          filteredBy: res.where ? 'reader' : null,
          count: res.count, available: res.available, truncated: res.truncated, shortOfStated: false,
          asOf: res.release.asOf, resolution: 'none', declaration: null,
          /* every row group of the release that meets the window was read; the window test is stated in `windowTest` */
          answerComplete: true, supplied: true, continues: false, viewEvidence: false,
        });
      }
      let ds;
      try {
        ds = data.add({
          title: opt.title ? String(opt.title) : ('Overture ' + res.theme + '/' + res.type + ' ' + res.release.version),
          features: res.features, sourceCrs: 'EPSG:4326',
          provenance: Object.assign({}, res.provenance, { coverage: coverage, windowTest: res.windowTest, worldCompleteness: res.worldCompleteness,
            recipe: { door: 'overture', theme: res.theme, type: res.type, release: res.release.version, bbox: res.bbox, where: res.where } }),
        });
      } catch (e) { return refuse('add-failed', { message: e && e.message }); }
      return { ok: true, id: ds.id, dataset: ds, coverage: coverage };
    }
    async function acquire(o) {
      const r = await query(o);
      if (!r.ok) return r;
      const d = toDataset(r, o);
      if (!d.ok) return d;
      return Object.assign({}, d, { result: { count: r.count, read: r.read, release: r.release.version, licences: r.licences } });
    }

    /* ── the world graph: rows for world_graph_nodes (ids.gers) and for the identifier history ──
       A GERS id is Overture's name for an object. The node's `ref` is the page's own (type:id) and is NOT the
       GERS id, so a change of GERS id changes one value in `ids` and the history, never the object. */
    const TYPE_OF = { place: 'facility', building: 'building', building_part: 'building', segment: 'road_segment', connector: 'road_junction', division: 'admin_area', division_area: 'admin_area', boundary: 'admin_boundary', address: 'address' };
    function worldNodes(res) {
      if (!res || res.ok !== true) return refuse('bad-param', { param: 'result' });
      const type = TYPE_OF[res.type] || res.type.replace(/[^a-z_]/g, '_');
      const nodes = [], history = [];
      for (const f of res.features) {
        const p = f.properties || {};
        const g = f.geometry, pt = g && g.type === 'Point' ? g.coordinates : null;
        const recs = p.source_records ? safeJson(p.source_records) : [];
        const ref = type + ':gers-' + String(f.id);
        const ids = { gers: String(f.id) };
        /* the source records are identifiers too — one per dataset, the first the row states; the full list is in `facts` */
        const wd = p.brand_wikidata || p.wikidata; if (wd) ids.wikidata = String(wd);
        nodes.push({
          ref: ref, type: type, kind: p.category || p.subtype || p.class || res.type, name: p.name || '',
          country: null,   /* the table's `country` is ISO alpha-3 (the LNG seed); Overture states alpha-2 — kept in facts, not converted by a table kept here */
          lng: pt ? pt[0] : null, lat: pt ? pt[1] : null,
          provenance: pt ? 'source_coordinate' : null, ids: ids,
          facts: Object.assign({ overture: { theme: res.theme, type: res.type, release: res.release.version } },
            p.confidence != null ? { confidence: p.confidence } : {}, p.operating_status ? { operating_status: p.operating_status } : {}, p.address ? { address: p.address } : {}, p.country ? { country_iso2: p.country } : {}),
          sources: [{ name: PUBLISHER + ' ' + res.release.version, url: res.provenance.url, licence: p.source_licences || null }],
        });
        /* one history row per (id, release): which source records this id stood for in this release */
        history.push({ ref: ref, scheme: 'gers', id: String(f.id), release: res.release.version, status: 'present', source_records: recs, observed: res.release.retrievedAt });
      }
      return { ok: true, nodes: nodes, history: history };
    }
    const safeJson = (s) => { try { return JSON.parse(s); } catch (_) { return []; } };

    const API = {
      release, themes, plan, query, acquire, toDataset, worldNodes, provenanceOf,
      refusals: () => REFUSALS.slice(), ops: () => OPS.slice(),
      /* what the Atlas door may ask of this module — one declaration, read by the door */
      actions: () => ['release', 'themes', 'plan', 'query', 'acquire'],
      /* the values this file states about Overture, published so a gate reads them from here */
      terms: () => ({ publisher: PUBLISHER, termsUrl: TERMS_URL, creditRow: CREDIT_ROW, cadence: CADENCE, stac: STAC }),
      _meets: meets, _boxes: boxesOf, _holds: holds,
    };
    try { const w = WIN(); if (w) w.IntMapGisOverture = API; } catch (_) { }
    return API;
  })();
}
