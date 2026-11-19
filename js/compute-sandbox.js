/* ============================================================================
 *  IntMap · THE PYTHON SANDBOX — window.IntMapCompute   (compute-sandbox)
 * ----------------------------------------------------------------------------
 *  「その場で Python を書いて走らせ、結果を IntMap のデータセットに戻す」。
 *
 *  Every op in js/gis-ops.js is a step somebody in this repository wrote. A regression over a CSV,
 *  a seasonal decomposition, a clustering — the analyses a reader asks for that are NOT one of
 *  those steps — had no way to happen at all: Atlas could describe the method and could not run it.
 *  This file is the one place where code that was NOT written in this repository runs, and it runs
 *  in exactly one shape: Python (Pyodide), inside a dedicated Worker, on JSON copies of datasets,
 *  handing back JSON that is turned into new datasets through js/gis-datasets.js's own add().
 *
 *  ══ WHY THIS IS NOT "EVAL" ════════════════════════════════════════════════════════════════════
 *  js/atlas-capabilities.js says the registry has no arbitrary execution, and for the PAGE that is
 *  still true: nothing here runs on the thread that holds the DOM, the reader's session or the map.
 *  The code runs in a Worker built from a Blob, and BEFORE the first line of it runs, the Worker's
 *  own global scope is stripped of every door to the origin and to the network (see SCRUB, inside
 *  the worker source below). What is left is a calculator with Python in it.
 *  ⚠ THE BOUNDARY IS THE WORKER'S REALM, NOT PYTHON. Pyodide's `js` module, `pyodide.ffi` and
 *  `pyodide.code.run_js` all reach the JavaScript global scope of the thread they run on, and none
 *  of them can be removed from inside Python (a module dropped from sys.modules is re-imported). So
 *  the doors are closed where every one of those paths ends: on the worker's global object and on
 *  its prototypes, after Pyodide has loaded and before the reader's — Atlas's — code runs.
 *
 *  ══ WHAT ARRIVES OVER THE NETWORK, AND HOW IT IS CHECKED ══════════════════════════════════════
 *  Pyodide is NOT bundled (13.4 MB unpacked, 6.2 MB on the wire — measured 2026-11-19; scripts/asset-report.mjs
 *  would carry it on every deploy for a feature most sessions never reach). It is fetched from the version-pinned jsDelivr path below,
 *  and EVERY BYTE OF IT IS INTEGRITY-CHECKED: the five core files against the SRI hashes in
 *  RUNTIME.files, and every package against the sha256 the (already verified) lock file states for
 *  it. The two script files are fetched with `integrity`, wrapped in a Blob and executed from
 *  `blob:` — which is how a hash gets attached at all (importScripts() and import() take no
 *  integrity option) and why index.html's script-src gains NO new host: it already allows blob:
 *  for js/gis-worker.js and js/dash-extended.js. `connect-src https:` admits the fetches.
 *  ⚠ ONLY THE FILES THE LOCK FILE NAMES CAN BE FETCHED, by exact address. A prefix allowance would
 *  let code write data into a path under the pinned directory and have the CDN's access log keep it.
 *
 *  ══ ONE RUN, ONE WORKER ═══════════════════════════════════════════════════════════════════════
 *  A worker is terminated when its run ends. Keeping a warm interpreter would save the boot, but
 *  the previous run's code could have replaced `numpy.mean`, hooked `onmessage` or left globals in
 *  the interpreter — and the next run's numbers would then be the previous code's numbers. A run's
 *  result is a function of its own code and its own inputs, or it is not a result. The boot is
 *  re-paid from the HTTP cache (see the measurement in dev-notes/2026-11-19-compute-sandbox.md).
 *
 *  ══ WHAT A RUN CAN ANSWER — AND WHICH OF THEM ARE OBSERVATIONS ═══════════════════════════════
 *  (.agents/rules/one-pass-or-a-reason.md §5: 「確認できなかった」 is not 「失敗した」)
 *    observed:true    ok                   the code ran; its outputs are below
 *                     python-exception     the code raised — type, message and traceback are the facts
 *                     output-missing       a name the caller asked for was not bound by the code
 *                     output-invalid       a value could not be turned into JSON / a feature is not GeoJSON
 *                     output-not-lonlat    a geometry has coordinates outside lon/lat degrees
 *                     output-too-large     the result is bigger than OUTPUT_MAX_BYTES
 *                     package-unavailable  an import names a package Pyodide's distribution could not load
 *    observed:false   timeout              the code was still running at the limit — nothing is known of it
 *                     runtime-unavailable  the interpreter did not start, so the code never ran
 *                     runtime-load-timeout the interpreter was still loading at the limit
 *                     worker-died          the thread ended mid-run (memory, most often) without a result
 *                     cancelled            the caller stopped it
 *  Refusals before anything runs (the request itself): code-missing, code-too-long, no-such-dataset,
 *  input-stale, registry-missing, outputs-invalid, worker-unavailable.
 * ==========================================================================*/

/* ══ THE RUNTIME — ONE PLACE ═══════════════════════════════════════════════════════════════════
   OBSERVATION (2026-11-19): the npm registry lists pyodide 314.0.7 as published 2026-09-14 and
   314.0.8 on 2026-11-13; the newer one is under two weeks old, so the pin is 314.0.7. Every hash
   below was computed from the bytes fetched from this path AND matches the hash jsDelivr's own data
   API (data.jsdelivr.com/v1/packages/npm/pyodide@314.0.7) states for the same file — two readings.
   EXPIRES IF: the version changes (every hash changes with it; the worker refuses mismatching bytes,
   so a stale hash fails closed as `runtime-unavailable`, never runs other bytes).
   CANONICAL: this object. The worker receives it; nothing else names the version. */
const RUNTIME = Object.freeze({
  name: 'pyodide',
  version: '314.0.7',
  base: 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/',
  files: Object.freeze({
    'pyodide.js': 'sha256-MUG4FHFacuWbUbGxi5zq5b8Z98hSQX5DG7CjT+rfglw=',
    'pyodide.asm.mjs': 'sha256-983I7OgGeM63EvjmXr5tOoMgOhgMOZhl9JYSoFFpNjU=',
    'pyodide.asm.wasm': 'sha256-zDbjyrBP38mmP/E+tS6uK5Eb9GwCXMeygfOUvT3h1eY=',
    'python_stdlib.zip': 'sha256-+hlX5XdwaPxPdDf5bYYK4vvpwZcyugbITgBOwW3X3Xo=',
    'pyodide-lock.json': 'sha256-XcL8EZEIvBSMdFfchudnW1yH4cr9QgucNMHq73s2wBA=',
  }),
});

/* ══ THE LIMITS ════════════════════════════════════════════════════════════════════════════════
   Each one: what it was derived from, when it stops being true, and where else it lives (nowhere —
   they are published as API.limits so the capability and the checks read these, not copies).

   CODE_MAX_CHARS — OBSERVATION: Atlas's code arrives as one tool-call argument, and one model call
   cannot emit more than HARD_MAX_OUTPUT = 5,000 tokens (supabase/functions/ai-proxy/tasks/spec.ts).
   Code tokenises at well under 8 characters a token, so 5,000 tokens is < 40,000 characters; the
   ceiling is above that, so it never refuses code a model could actually write, and every record's
   provenance can hold its code WHOLE (nothing is ever truncated, so every record can be re-run).
   EXPIRES IF: HARD_MAX_OUTPUT is raised past ~8,000 tokens.

   OUTPUT_MAX_BYTES — the result crosses the thread as one JSON string and then lives in the dataset
   registry: it is the same residency question js/gis-worker.js answered with 64 MiB per block
   (BLOCK_BUDGET_BYTES: a tab was measured to stake ~1.5 GiB above which it is killed) and that
   js/atlas-attach.js answered with the same 64 MiB for a file read into memory. A result is never
   larger than the largest thing the reader could have dropped in.
   EXPIRES IF: either of those two ceilings is re-measured.

   STREAM_MAX_CHARS — stdout/stderr are kept for the reader's card; Atlas reads the card's text
   through RESULT_TEXT_MAX (2,000 chars, js/atlas-toolsurface.js), so more than a few screens of
   output is never read by anyone. 16,000 keeps eight times what Atlas reads and the TAIL is kept
   (a traceback and a final summary are at the end).  EXPIRES IF: RESULT_TEXT_MAX is raised past it.

   LOAD_MAX_MS, EXEC_DEFAULT_MS, EXEC_MAX_MS — OBSERVATION (2026-11-19, Chromium 1255 headless on the
   development machine, cold HTTP cache; dev-notes/2026-11-19-compute-sandbox.md has the table):
   the five core files were 6,239,991 bytes on the wire, numpy 2,930,300 and pandas with its three
   dependencies 4,691,776 — 13.86 MB for a first run that imports pandas. At Lighthouse's mobile
   profile (1.6 Mbit/s) that is ≈ 69 s of transfer; the boot itself (compile + interpreter start) was
   9.9 s cold and 3.1–3.5 s from the HTTP cache. 180 s is ≈ 2.6 × the slow-link transfer, and a load
   slower than that is reported as `runtime-load-timeout` (unobserved), not as a failure.
   EXEC_DEFAULT_MS 60 s / EXEC_MAX_MS 300 s are the RUNAWAY FENCE, not a work budget
   (CONSTITUTION.md §5): an OLS fit over 100,000 rows — read from the rows, built into arrays, solved —
   ran in 2.7 s (WASM heap 94 MB), so 60 s is twenty times the largest analysis measured, and Atlas
   may ask for up to 300 s when it knows a run is long. A run at the fence is `timeout` (unobserved) and is NOT retried by the
   program — the next try has to be different (one-pass-or-a-reason.md §5).
   EXPIRES IF: re-measured on the slowest supported device. */
const LIMITS = Object.freeze({
  codeMaxChars: 64000,
  outputMaxBytes: 64 * 1024 * 1024,
  streamMaxChars: 16000,
  execDefaultMs: 60000,
  execMaxMs: 300000,
  loadMaxMs: 180000,
});

const REFUSALS = Object.freeze(['code-missing', 'code-too-long', 'no-such-dataset', 'input-stale', 'registry-missing',
  'outputs-invalid', 'worker-unavailable']);
const FAILURES = Object.freeze(['python-exception', 'output-missing', 'output-invalid', 'output-not-lonlat', 'output-too-large',
  'package-unavailable']);
const UNOBSERVED = Object.freeze(['timeout', 'runtime-unavailable', 'runtime-load-timeout', 'worker-died', 'cancelled']);

/* ══ THE PYTHON SIDE OF THE CONTRACT ═══════════════════════════════════════════════════════════
   Run once per run, in the run's own fresh namespace, before the code. It gives the code its inputs
   and gives the host ONE way to read a value back — `_im_dump` — so 「JSON にできる値」 is decided in
   one place. ⚠ NaN AND ±inf BECOME null AND ARE COUNTED: JSON has no NaN, and a silent null in a
   numeric column would read as 「値が無い」 — so the count travels with the result (`nonFinite`).
   numpy / pandas are recognised by what they ARE (tolist / to_dict / item / isoformat), never
   imported here: a run that did not import pandas must not pay for it. */
const PRELUDE = [
  'import json as _im_json, math as _im_math',
  'INPUTS = _im_json.loads(_IM_INPUTS)',
  'del _IM_INPUTS',
  'def _im_pick(i):',
  '    if isinstance(i, int): return INPUTS[i]',
  '    for d in INPUTS:',
  '        if d.get("id") == i or d.get("title") == i: return d',
  '    raise KeyError("no input named %r — the inputs are %r" % (i, [d.get("id") for d in INPUTS]))',
  'def rows(i=0):',
  '    """The properties of each feature of input i (an index, an id or a title), as a list of dicts."""',
  '    return [dict(f.get("properties") or {}) for f in (_im_pick(i).get("features") or [])]',
  'def features(i=0):',
  '    """The GeoJSON features of input i, geometry included."""',
  '    return list(_im_pick(i).get("features") or [])',
  'def _im_plain(v, st):',
  '    if v is None or isinstance(v, (str, bool)): return v',
  '    if isinstance(v, int): return v',
  '    if isinstance(v, float):',
  '        if _im_math.isfinite(v): return v',
  '        st[0] += 1',
  '        return None',
  '    if isinstance(v, dict): return {str(k): _im_plain(x, st) for k, x in v.items()}',
  '    if isinstance(v, (list, tuple)): return [_im_plain(x, st) for x in v]',
  '    if hasattr(v, "columns") and hasattr(v, "to_dict"): return _im_plain(v.to_dict(orient="records"), st)',
  '    if hasattr(v, "tolist"): return _im_plain(v.tolist(), st)',
  '    if hasattr(v, "isoformat"): return v.isoformat()',
  '    if hasattr(v, "item"): return _im_plain(v.item(), st)',
  '    if isinstance(v, (set, frozenset)): return [_im_plain(x, st) for x in v]',
  '    try:',
  '        f = float(v)',
  '    except Exception:',
  '        raise TypeError("a value of type %s cannot be returned — return numbers, text, lists, dicts, a pandas DataFrame or GeoJSON" % type(v).__name__)',
  '    return _im_plain(f, st)',
  'def _im_dump(name):',
  '    st = [0]',
  '    v = _im_plain(globals()[name], st)',
  '    return _im_json.dumps({"v": v, "nf": st[0]}, ensure_ascii=False, allow_nan=False)',
].join('\n');

/* ══ THE WORKER ════════════════════════════════════════════════════════════════════════════════
   Serialised with Function.prototype.toString and run as a classic Worker from a Blob, the way
   js/gis-worker.js ships its jobs. ⚠ IT MUST NOT NAME ANYTHING OUTSIDE ITSELF — it runs in another
   realm, where nothing of this module exists. Its two arguments are a JSON configuration and the one
   function that cannot be written inside it as source this module is bundled from: a dynamic
   import(), which the bundler would rewrite — it is passed in as TEXT (see workerSource()).
   ⚠ ORDER IS THE SECURITY ARGUMENT:
     1. fetch and importScripts are replaced FIRST, before any Pyodide byte is executed, so every
        reference Pyodide captures while loading is already the gated one;
     2. Pyodide loads through them (integrity enforced on every file);
     3. SCRUB — the origin's storage, every other network constructor, nested workers and runtime
        code generation are removed from the global object AND its prototypes;
     4. only then is the job's code run.
   A scrub that cannot remove a door (a non-configurable property in some engine) FAILS CLOSED: the
   worker reports `runtime-unavailable` with the names it could not close, and runs nothing. */
function computeWorker(CFG, importModule) {
  'use strict';
  var G = self;
  var hasOwn = Object.prototype.hasOwnProperty;
  var RealFunction = Function;
  var post = G.postMessage.bind(G);
  var realFetch = G.fetch.bind(G);
  var realImportScripts = G.importScripts.bind(G);
  var ownBlobs = Object.create(null);
  var allowed = Object.create(null);
  var refusedUrls = [];
  Object.keys(CFG.files).forEach(function (n) { allowed[CFG.base + n] = CFG.files[n]; });

  /* remove `name` from `obj` and from every prototype that holds it; true when nothing answers to it */
  function erase(obj, name) {
    for (var o = obj; o; o = Object.getPrototypeOf(o)) {
      if (!hasOwn.call(o, name)) continue;
      try { delete o[name]; } catch (_) { }
      if (hasOwn.call(o, name)) { try { Object.defineProperty(o, name, { value: undefined, writable: false, configurable: false }); } catch (_) { } }
    }
    var left;
    try { left = obj[name]; } catch (_) { left = undefined; }
    return left === undefined;
  }
  /* `removable`: importScripts is pinned only until the scrub removes it, so it must stay deletable */
  function pin(obj, name, value, removable) {
    erase(obj, name);
    Object.defineProperty(obj, name, { value: value, writable: false, configurable: !!removable, enumerable: false });
  }
  function hexToB64(hex) {
    var s = '';
    for (var i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return btoa(s);
  }

  /* ── 1. the only network: exact files of the pinned distribution, each with its hash ── */
  function gatedFetch(input, init) {
    var url;
    try { url = new URL(typeof input === 'string' ? input : ((input && input.url) || String(input))).href; }
    catch (_) { return Promise.reject(new TypeError('compute sandbox: unreadable address')); }
    if (!hasOwn.call(allowed, url)) {
      if (refusedUrls.length < 20) refusedUrls.push(url.slice(0, 200));
      return Promise.reject(new TypeError('compute sandbox: the network is limited to the Pyodide distribution; refused ' + url.slice(0, 120)));
    }
    var o = { method: 'GET', credentials: 'omit', redirect: 'error', mode: 'cors', referrerPolicy: 'no-referrer' };
    if (allowed[url]) o.integrity = allowed[url];
    return realFetch(url, o);
  }
  function gatedImportScripts() {
    for (var i = 0; i < arguments.length; i++) {
      if (!ownBlobs[String(arguments[i])]) throw new TypeError('compute sandbox: importScripts is closed');
    }
    return realImportScripts.apply(G, arguments);
  }
  pin(G, 'fetch', gatedFetch);
  pin(G, 'importScripts', gatedImportScripts, true);

  function verifiedText(name) {
    return gatedFetch(CFG.base + name).then(function (r) {
      if (!r.ok) throw new Error(name + ': HTTP ' + r.status);
      return r.text();
    });
  }
  function blobFor(text) {
    var u = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    ownBlobs[u] = true;
    return u;
  }

  /* ── 3. what is closed before the job runs ──
     The origin's storage (indexedDB, caches, navigator.storage — OPFS — and navigator.locks), every
     network constructor other than the gated fetch, nested and shared workers (a fresh realm would
     have none of this scrub), notifications, and runtime code generation (eval, the four Function
     constructors, string timers) — without code generation, a dynamic import() of an arbitrary
     address cannot be written, which is the one network path a property cannot hold.
     ⚠ AND THE FUNCTIONS THAT ALREADY HOLD AN import(). `loadPyodide` (published on the global by
     pyodide.js) imports `indexURL + 'pyodide.asm.mjs'` when it is not handed the module — so Python
     calling `js.loadPyodide({indexURL: <any address>})` would be an import() of an address of its choosing,
     limited only by script-src (which admits analytics hosts). It is removed with the rest. FontFace /
     `fonts` fetch a URL the caller names (under font-src) and go too. */
  function scrub() {
    var open = [];
    ['indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream',
      'EventSource', 'WebTransport', 'Notification', 'importScripts', 'IDBFactory', 'loadPyodide', 'FontFace', 'fonts'].forEach(function (n) { if (!erase(G, n)) open.push(n); });
    try { ['locks', 'storage', 'serviceWorker'].forEach(function (n) { if (!erase(G.navigator, n)) open.push('navigator.' + n); }); } catch (_) { open.push('navigator'); }
    var blocked = function () { throw new TypeError('compute sandbox: generating code at run time is disabled'); };
    /* ⚠ A STAND-IN, NOT A HOLE. Pyodide's own code asks `x instanceof Function` and reads
       `x.constructor.name` while converting values, so each stand-in carries the intrinsic's prototype and
       name — and the global `Function` is the SAME stand-in as Function.prototype.constructor, or the two
       answers would disagree. (Measured: a stand-in with a fresh prototype made every PyProxy fail to
       convert — 「globals must be a real dict」.) Calling any of them throws. */
    var ctors = [RealFunction, Object.getPrototypeOf(function* () { }).constructor, Object.getPrototypeOf(async function () { }).constructor,
      Object.getPrototypeOf(async function* () { }).constructor];
    ctors.forEach(function (C) {
      var fake = function () { return blocked(); };
      fake.prototype = C.prototype;
      try { Object.defineProperty(fake, 'name', { value: C.name }); } catch (_) { }
      try { pin(C.prototype, 'constructor', fake); } catch (_) { open.push('constructor of ' + C.name); }
      if (C === RealFunction) { try { pin(G, 'Function', fake); } catch (_) { open.push('Function'); } }
    });
    try { pin(G, 'eval', function () { return blocked(); }); } catch (_) { open.push('eval'); }
    ['setTimeout', 'setInterval'].forEach(function (n) {
      var real = G[n].bind(G);
      try { pin(G, n, function (fn) { if (typeof fn !== 'function') return blocked(); return real.apply(G, arguments); }); } catch (_) { open.push(n); }
    });
    /* verified, not assumed: each door is asked once more AFTER the scrub */
    var probes = {
      indexedDB: function () { return typeof G.indexedDB !== 'undefined'; },
      caches: function () { return typeof G.caches !== 'undefined'; },
      XMLHttpRequest: function () { return typeof G.XMLHttpRequest !== 'undefined'; },
      Worker: function () { return typeof G.Worker !== 'undefined'; },
      loadPyodide: function () { return typeof G.loadPyodide !== 'undefined'; },
      evalWorks: function () { try { return G.eval('1') === 1; } catch (_) { return false; } },
      functionWorks: function () { try { return (function () { }).constructor('return 1')() === 1; } catch (_) { return false; } },
    };
    Object.keys(probes).forEach(function (k) { if (probes[k]()) open.push(k); });
    return open;
  }

  var py = null, python = null, bootErr = null, bootMs = 0;
  var ready = (function () {
    var t0 = Date.now();
    var lock;
    return verifiedText('pyodide-lock.json').then(function (t) {
      lock = JSON.parse(t);
      var pk = (lock && lock.packages) || {};
      Object.keys(pk).forEach(function (k) {
        var p = pk[k];
        if (p && typeof p.file_name === 'string' && /^[0-9a-f]{64}$/.test(String(p.sha256 || ''))) allowed[CFG.base + p.file_name] = 'sha256-' + hexToB64(p.sha256);
      });
      return verifiedText('pyodide.js');
    }).then(function (src) {
      var u = blobFor(src);
      G.importScripts(u);
      URL.revokeObjectURL(u);
      return verifiedText('pyodide.asm.mjs');
    }).then(function (src) {
      var u = blobFor(src);
      return importModule(u).then(function (m) { URL.revokeObjectURL(u); return m; });
    }).then(function (asm) {
      return G.loadPyodide({ indexURL: CFG.base, packageBaseUrl: CFG.base, lockFileContents: lock, createPyodideModule: asm.default, checkAPIVersion: true });
    }).then(function (p) {
      py = p;
      python = String(py.runPython('import sys\nsys.version.split()[0]'));
      var open = scrub();
      if (open.length) throw new Error('the sandbox could not close: ' + open.join(', '));
      bootMs = Date.now() - t0;
      post({ t: 'ready', python: python, bootMs: bootMs });
    }).catch(function (e) {
      bootErr = String((e && e.message) || e).slice(0, 500);
      py = null;
      post({ t: 'boot-failed', detail: bootErr, refusedUrls: refusedUrls.slice() });
    });
  })();

  function tail(buf, max) {
    var s = buf.join('\n');
    return s.length > max ? { text: s.slice(s.length - max), cut: s.length - max } : { text: s, cut: 0 };
  }

  function runJob(job) {
    var out = [], err = [];
    var t0 = Date.now(), tp = 0;
    py.setStdout({ batched: function (s) { out.push(s); } });
    py.setStderr({ batched: function (s) { err.push(s); } });
    function streams() {
      var o = tail(out, CFG.limits.streamMaxChars), e = tail(err, CFG.limits.streamMaxChars);
      return { stdout: o.text, stderr: e.text, stdoutCut: o.cut, stderrCut: e.cut };
    }
    function done(res) {
      res.t = 'done';
      res.timings = { bootMs: bootMs, packagesMs: tp, runMs: Date.now() - t0 - tp };
      res.refusedUrls = refusedUrls.slice();
      var s = streams();
      for (var k in s) res[k] = s[k];
      post(res);
    }
    post({ t: 'phase', phase: 'packages' });
    var pkgErr = [];
    return Promise.resolve().then(function () {
      return py.loadPackagesFromImports(job.code, { messageCallback: function () { }, errorCallback: function (m) { pkgErr.push(String(m)); } });
    }).then(function () {
      tp = Date.now() - t0;
      if (pkgErr.length) return done({ ok: false, observed: true, why: 'package-unavailable', detail: pkgErr.join('\n').slice(0, 2000) });
      post({ t: 'phase', phase: 'run' });
      var ns = py.toPy({});
      ns.set('_IM_INPUTS', job.inputsJson);
      py.runPython(CFG.prelude, { globals: ns });
      return py.runPythonAsync(job.code, { globals: ns, filename: '<atlas>' }).then(function () {
        var outputs = {}, nonFinite = {};
        var bytes = 0;
        var names = job.outputs;
        var dump = ns.get('_im_dump');
        for (var i = 0; i < names.length; i++) {
          var n = names[i];
          if (!ns.has(n)) {
            if (job.outputsNamed) return done({ ok: false, observed: true, why: 'output-missing', detail: { name: n } });
            continue;
          }
          var text;
          try { text = String(dump(n)); }
          catch (e) { return done({ ok: false, observed: true, why: 'output-invalid', detail: { name: n, message: String((e && e.message) || e).slice(-1500) } }); }
          bytes += new TextEncoder().encode(text).length;
          if (bytes > CFG.limits.outputMaxBytes) return done({ ok: false, observed: true, why: 'output-too-large', detail: { name: n, bytes: bytes, max: CFG.limits.outputMaxBytes } });
          outputs[n] = text;
        }
        var pk = [];
        try { pk = Object.keys(py.loadedPackages || {}).sort(); } catch (_) { }
        return done({ ok: true, observed: true, outputs: outputs, packages: pk, python: python });
      }, function (e) {
        return done({ ok: false, observed: true, why: 'python-exception',
          detail: { type: String((e && e.type) || (e && e.name) || 'Error'), message: String((e && e.message) || e).slice(-CFG.limits.streamMaxChars) } });
      });
    }, function (e) {
      tp = Date.now() - t0;
      return done({ ok: false, observed: true, why: 'package-unavailable', detail: String((e && e.message) || e).slice(0, 2000) });
    }).catch(function (e) {
      /* the sandbox itself failed around the code (not the code) — whether the code ran is not known */
      post({ t: 'internal', detail: String((e && e.stack) || (e && e.message) || e).slice(0, 2000) });
    });
  }

  var started = false;
  G.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.t !== 'run' || started) return;
    started = true;
    ready.then(function () { if (py) return runJob(m.job); });
  };
}

/* ══ THE HOST ══════════════════════════════════════════════════════════════════════════════════ */
export function makeComputeSandbox(opts) {
  return (function () {
    const o = opts || {};
    const scope = o.scope || (typeof window !== 'undefined' ? window : globalThis);
    const WorkerCtor = o.Worker || (typeof Worker !== 'undefined' ? Worker : null);

    function registry() { try { return o.registry || scope.IntMapData || null; } catch (_) { return null; } }
    function no(why, detail) {
      if (REFUSALS.indexOf(why) < 0 && FAILURES.indexOf(why) < 0 && UNOBSERVED.indexOf(why) < 0) throw new Error('compute-sandbox: undeclared reason ' + why);
      const r = { ok: false, why: why, observed: UNOBSERVED.indexOf(why) < 0 };
      if (REFUSALS.indexOf(why) >= 0) r.refused = true;
      if (detail !== undefined) r.detail = detail;
      return r;
    }

    /* the source a worker is built from — the function above, its configuration, and the one import() */
    function workerSource() {
      const cfg = { base: RUNTIME.base, files: RUNTIME.files, prelude: PRELUDE, limits: LIMITS };
      return '(' + computeWorker.toString() + ')(' + JSON.stringify(cfg) + ', function (u) { return import(u); });\n';
    }

    /* ── the request ──────────────────────────────────────────────────────────────────────────
       Validated BEFORE a worker exists, so a request that cannot run costs nothing and says why. */
    function validate(a) {
      a = a || {};
      const code = (typeof a.code === 'string') ? a.code : '';
      if (!code.trim()) return no('code-missing');
      if (code.length > LIMITS.codeMaxChars) return no('code-too-long', { chars: code.length, max: LIMITS.codeMaxChars });
      const named = Array.isArray(a.outputs) && a.outputs.length > 0;
      const outputs = named ? a.outputs.map(String) : ['result'];
      for (const n of outputs) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) return no('outputs-invalid', { name: n, rule: 'a Python identifier' });
      const reg = registry();
      const refs = Array.isArray(a.inputs) ? a.inputs.map(String) : [];
      if (refs.length && !reg) return no('registry-missing');
      const inputs = [];
      for (const ref of refs) {
        let rec = reg.get(ref);
        if (!rec) rec = reg.list().find((d) => String(d.title) === ref) || null;
        if (!rec) return no('no-such-dataset', { ref: ref, available: reg.list().map((d) => ({ id: d.id, title: d.title })) });
        if (rec.stale) return no('input-stale', { id: rec.id, why: String(rec.stale.why || '') });
        inputs.push(rec);
      }
      const t = Number(a.timeoutSec);
      const execMs = (isFinite(t) && t > 0) ? Math.min(LIMITS.execMaxMs, Math.round(t * 1000)) : LIMITS.execDefaultMs;
      return { ok: true, code: code, outputs: outputs, outputsNamed: named, inputs: inputs, execMs: execMs,
        title: (typeof a.title === 'string' && a.title.trim()) ? a.title.trim() : '' };
    }

    /* ── a dataset as the code sees it ────────────────────────────────────────────────────────
       A vector record is its GeoJSON features (a table is the same features with geometry null —
       js/gis-datasets.js has no third payload). A grid is its lattice and each band's samples as a
       list; a missing sample is null, the way JSON writes NaN. */
    function payloadOf(rec) {
      const base = { id: rec.id, title: rec.title, kind: String(rec.kind || 'vector'),
        fields: (rec.fields || []).map((f) => ({ name: f.name, type: f.type, unit: f.unit == null ? null : f.unit })) };
      if (base.kind === 'raster') {
        const bands = Array.isArray(rec.bands) ? rec.bands : [];
        return Object.assign(base, { width: rec.width, height: rec.height, grid: rec.grid || null,
          bands: bands.map((b, i) => Object.assign({}, b, { values: Array.from(rec.read(i) || []) })) });
      }
      return Object.assign(base, { features: rec.features() });
    }

    /* ── what came back ───────────────────────────────────────────────────────────────────────
       A FeatureCollection, a list of GeoJSON Features, or a list of dicts (rows without geometry)
       becomes a DATASET. Anything else — a number, a dict of coefficients — is a VALUE and is handed
       back as it is. ⚠ A GEOMETRY IS CHECKED, NOT REPAIRED: the registry states crs EPSG:4326, so a
       coordinate outside lon/lat degrees (a projected metre, a swapped pair) would be a false
       statement the moment it was registered — it is refused by name with the feature's index. */
    const GEOM_DEPTH = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
    function positionOk(p) { return Array.isArray(p) && p.length >= 2 && p.length <= 3 && p.every((x) => typeof x === 'number' && isFinite(x)); }
    function lonLat(p) { return p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90; }
    function checkCoords(c, depth) {
      if (depth === 0) return positionOk(c) ? (lonLat(c) ? null : 'output-not-lonlat') : 'output-invalid';
      if (!Array.isArray(c)) return 'output-invalid';
      for (const x of c) { const r = checkCoords(x, depth - 1); if (r) return r; }
      return null;
    }
    function checkGeometry(g) {
      if (g === null || g === undefined) return null;
      if (typeof g !== 'object') return 'output-invalid';
      if (g.type === 'GeometryCollection') {
        if (!Array.isArray(g.geometries)) return 'output-invalid';
        for (const x of g.geometries) { const r = checkGeometry(x); if (r) return r; }
        return null;
      }
      if (!hasOwnKey(GEOM_DEPTH, g.type)) return 'output-invalid';
      return checkCoords(g.coordinates, GEOM_DEPTH[g.type]);
    }
    function hasOwnKey(o2, k) { return Object.prototype.hasOwnProperty.call(o2, k); }
    function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
    function classify(v) {
      let feats = null;
      if (isPlainObject(v) && v.type === 'FeatureCollection' && Array.isArray(v.features)) feats = v.features;
      else if (Array.isArray(v) && v.length && v.every((x) => isPlainObject(x) && x.type === 'Feature')) feats = v;
      else if (Array.isArray(v) && v.length && v.every(isPlainObject)) {
        return { ok: true, kind: 'dataset', features: v.map((row) => ({ type: 'Feature', geometry: null, properties: row })) };
      }
      if (!feats) return { ok: true, kind: 'value', value: v };
      const out = [];
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        if (!isPlainObject(f) || f.type !== 'Feature') return { ok: false, why: 'output-invalid', detail: { index: i, rule: 'every item of a FeatureCollection is a GeoJSON Feature' } };
        if (f.properties != null && !isPlainObject(f.properties)) return { ok: false, why: 'output-invalid', detail: { index: i, rule: 'properties is an object or null' } };
        const bad = checkGeometry(f.geometry);
        if (bad) return { ok: false, why: bad, detail: { index: i, rule: bad === 'output-not-lonlat' ? 'coordinates are [longitude, latitude] in degrees (EPSG:4326)' : 'geometry is GeoJSON' } };
        out.push({ type: 'Feature', geometry: f.geometry == null ? null : f.geometry, properties: f.properties || {} });
      }
      return { ok: true, kind: 'dataset', features: out };
    }

    async function sha256Hex(text) {
      try {
        const c = scope.crypto || (typeof crypto !== 'undefined' ? crypto : null);
        if (!c || !c.subtle) return null;
        const d = await c.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (_) { return null; }
    }

    /* ── the provenance of an output ──────────────────────────────────────────────────────────
       A RECIPE, like an op's: the whole code (never cut — see CODE_MAX_CHARS), its hash, the inputs
       by id, which name of the code this record is, and what ran it. js/gis-project.js saves the
       record as a body (its features) WITH this provenance, re-runs it when an input upstream is
       recomputed, and js/gis-datasets.js refuses edits to it for the reason it refuses edits to an
       op's output: the recipe would silently overwrite them. */
    function provenanceFor(job, raw, name, codeSha256, nonFinite) {
      return {
        kind: 'compute', language: 'python',
        code: job.code, codeSha256: codeSha256,
        inputs: job.inputs.map((r) => r.id),
        output: name,
        runtime: RUNTIME.name + '@' + RUNTIME.version,
        python: (raw && raw.python) || null,
        packages: (raw && Array.isArray(raw.packages)) ? raw.packages.slice() : [],
        nonFinite: nonFinite || 0,
        ranAt: Date.now(),
      };
    }

    /* ── one worker, one run ──────────────────────────────────────────────────────────────────── */
    function execute(job, signal) {
      return new Promise((resolve) => {
        if (!WorkerCtor || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) { resolve(no('worker-unavailable')); return; }
        let w = null, url = null, timer = null, phase = 'boot', settled = false;
        const t0 = Date.now();
        const finish = (res) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          try { if (w) w.terminate(); } catch (_) { }
          try { if (url) URL.revokeObjectURL(url); } catch (_) { }
          if (signal) { try { signal.removeEventListener('abort', onAbort); } catch (_) { } }
          res.phase = phase; res.elapsedMs = Date.now() - t0;
          resolve(res);
        };
        const arm = (ms, why) => { if (timer) clearTimeout(timer); timer = setTimeout(() => finish(no(why, { afterMs: ms, phase: phase })), ms); };
        const onAbort = () => finish(no('cancelled'));
        if (signal) { if (signal.aborted) { resolve(no('cancelled')); return; } signal.addEventListener('abort', onAbort); }
        try {
          url = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
          w = new WorkerCtor(url);
        } catch (e) { finish(no('worker-unavailable', { message: String((e && e.message) || e) })); return; }
        arm(LIMITS.loadMaxMs, 'runtime-load-timeout');
        w.onmessage = (ev) => {
          const m = (ev && ev.data) || {};
          /* ⚠ THE CLOCK IS ARMED ONCE. The worker's messages are not trusted to be the worker's own once
             the job's code is running (it can reach postMessage), so a second 'run' must not re-arm the
             fence — that would let code keep itself alive by announcing it is still starting. */
          if (m.t === 'phase' && m.phase === 'run') { if (phase !== 'run') { phase = 'run'; arm(job.execMs, 'timeout'); } return; }
          if (m.t === 'phase' && m.phase === 'packages') { if (phase === 'boot') phase = 'packages'; return; }
          if (m.t === 'internal') { finish(no(phase === 'run' ? 'worker-died' : 'runtime-unavailable', { message: String(m.detail || '') })); return; }
          if (m.t === 'boot-failed') { finish(no('runtime-unavailable', { message: String(m.detail || ''), refusedUrls: m.refusedUrls || [] })); return; }
          if (m.t === 'done') {
            const r = Object.assign({}, m);
            delete r.t;
            /* the reason is classified HERE, against this file's lists — a message cannot declare itself observed */
            if (r.ok !== true) { const why = FAILURES.indexOf(String(r.why)) >= 0 ? String(r.why) : 'output-invalid'; finish(Object.assign(r, no(why, r.detail))); return; }
            finish(r);
          }
        };
        w.onerror = (ev) => {
          try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (_) { }
          finish(no(phase === 'run' ? 'worker-died' : 'runtime-unavailable', { message: String((ev && ev.message) || 'worker error') }));
        };
        w.onmessageerror = () => finish(no('worker-died', { message: 'message-not-cloneable' }));
        w.postMessage({ t: 'run', job: { code: job.code, outputs: job.outputs, outputsNamed: job.outputsNamed,
          inputsJson: JSON.stringify(job.inputs.map(payloadOf)) } });
      });
    }

    /* ── run(args) — validate, execute, register ─────────────────────────────────────────────
       `fixedIds` (rerun only) puts an output back under the id it had, so the map layer, the query
       bridge and every later step keep pointing at the same name. */
    async function run(a, runOpts) {
      const ro = runOpts || {};
      const job = validate(a);
      if (!job.ok) return job;
      const raw = await execute(job, ro.signal || null);
      const base = { stdout: raw.stdout || '', stderr: raw.stderr || '', stdoutCut: raw.stdoutCut || 0, stderrCut: raw.stderrCut || 0,
        timings: raw.timings || null, elapsedMs: raw.elapsedMs, refusedUrls: raw.refusedUrls || [], runtime: RUNTIME.name + '@' + RUNTIME.version };
      if (!raw.ok) return Object.assign(base, { ok: false, why: raw.why, observed: raw.observed, detail: raw.detail, phase: raw.phase });
      const reg = registry();
      const codeSha256 = await sha256Hex(job.code);
      const datasets = [], values = {};
      const made = [];
      for (const name of job.outputs) {
        if (!hasOwnKey(raw.outputs || {}, name)) continue;
        let parsed;
        try { parsed = JSON.parse(raw.outputs[name]); }
        catch (e) { return Object.assign(base, no('output-invalid', { name: name, message: String((e && e.message) || e) })); }
        const c = classify(parsed.v);
        if (!c.ok) return Object.assign(base, no(c.why, Object.assign({ name: name }, c.detail)));
        if (c.kind === 'value') { values[name] = { value: c.value, nonFinite: parsed.nf || 0 }; continue; }
        made.push({ name: name, features: c.features, nonFinite: parsed.nf || 0 });
      }
      if (made.length && !reg) return Object.assign(base, no('registry-missing'));
      for (const m of made) {
        if (ro.only && ro.only !== m.name) continue;
        const want = ro.fixedIds && ro.fixedIds[m.name];
        const title = job.title ? (job.outputs.length > 1 ? job.title + ' · ' + m.name : job.title) : 'Python · ' + m.name;
        const rec = reg.add({ id: want || null, title: title, features: m.features, provenance: provenanceFor(job, raw, m.name, codeSha256, m.nonFinite) });
        datasets.push({ name: m.name, id: rec.id, title: rec.title, count: rec.count, withGeometry: rec.withGeometry,
          geometryType: rec.geometryType, fields: (rec.fields || []).map((f) => ({ name: f.name, type: f.type })), nonFinite: m.nonFinite });
      }
      return Object.assign(base, { ok: true, observed: true, datasets: datasets, values: values, packages: raw.packages || [], python: raw.python || null, codeSha256: codeSha256 });
    }

    /* ── rerun(step) — js/gis-project.js's door, when an input of a compute record was recomputed ──
       The recipe is the record's own provenance; the answer goes back under the record's id. */
    async function rerun(step, runOpts) {
      const p = (step && step.provenance) || {};
      if (p.kind !== 'compute') return no('code-missing');
      const r = await run({ code: p.code, inputs: p.inputs || [], outputs: [p.output], title: step.title || '' },
        Object.assign({}, runOpts || {}, { only: p.output, fixedIds: { [p.output]: step.id } }));
      if (!r.ok) return r;
      if (!r.datasets.length) return Object.assign(r, no('output-missing', { name: p.output, became: 'value' }), { ok: false });
      return Object.assign(r, { dataset: (registry() || { get: () => null }).get(step.id) });
    }

    const API = {
      run, rerun, validate, payloadOf, classify, provenanceFor, workerSource,
      runtime: () => ({ name: RUNTIME.name, version: RUNTIME.version, base: RUNTIME.base, files: Object.assign({}, RUNTIME.files) }),
      limits: () => Object.assign({}, LIMITS),
      reasons: () => ({ refusals: REFUSALS.slice(), failures: FAILURES.slice(), unobserved: UNOBSERVED.slice() }),
      prelude: () => PRELUDE,
    };
    if (o.publish !== false) { try { scope.IntMapCompute = API; } catch (_) { } }
    return API;
  })();
}
